import type { StoryDocument } from "@/domain/story-document";
import { resolveFont } from "@/lib/fonts/registry";
import type { FontRequirement } from "@/lib/fonts/load-fonts";
import { composeFrench } from "./french";
import { layoutTextBlock, type TextLayout } from "./text-layout";

export interface LayoutProblem {
  slideId: string;
  blockId: string;
  message: string;
}

export interface DocumentLayout {
  /** Clé : id du bloc (unique dans le document). */
  texts: Map<string, TextLayout>;
  problems: LayoutProblem[];
}

/** Polices et texte exact à charger avant toute mesure. */
export function fontRequirements(doc: StoryDocument): FontRequirement[] {
  const byFace = new Map<string, FontRequirement>();
  for (const slide of doc.slides) {
    for (const block of slide.blocks) {
      if (block.kind !== "text") continue;
      const { family, weight } = resolveFont(block.style.fontId, block.style.fontWeight);
      const key = `${family}/${weight}`;
      const req = byFace.get(key) ?? { family, weight, text: "" };
      req.text += composeFrench(block.content);
      byFace.set(key, req);
    }
  }
  return [...byFace.values()];
}

/** À appeler uniquement après loadFonts() ; à recalculer à chaque changement de polices. */
export function layoutDocument(doc: StoryDocument): DocumentLayout {
  const texts = new Map<string, TextLayout>();
  const problems: LayoutProblem[] = [];
  for (const slide of doc.slides) {
    if (slide.background.kind === "image") {
      problems.push({ slideId: slide.id, blockId: "background", message: "fond photo pas encore pris en charge (S3)" });
    }
    for (const block of slide.blocks) {
      if (block.kind === "image") {
        problems.push({ slideId: slide.id, blockId: block.id, message: "bloc image pas encore pris en charge (S3)" });
      }
      if (block.kind !== "text") continue;
      const layout = layoutTextBlock(block);
      texts.set(block.id, layout);
      for (const message of layout.problems) problems.push({ slideId: slide.id, blockId: block.id, message });
    }
  }
  return { texts, problems };
}

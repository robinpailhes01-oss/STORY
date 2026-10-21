import type { StoryDocument } from "@/domain/story-document";
import { resolveFont } from "@/lib/fonts/registry";
import { mergeRequirements, type FontRequirement } from "@/lib/fonts/load-fonts";
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
  /** Bloquants (débordement, mot trop large). */
  problems: LayoutProblem[];
  /** Non bloquants (accent introuvable…). */
  warnings: LayoutProblem[];
}

/** Polices et texte exact à charger avant toute mesure. */
export function fontRequirements(doc: StoryDocument): FontRequirement[] {
  const requirements: FontRequirement[] = [];
  for (const slide of doc.slides) {
    for (const block of slide.blocks) {
      if (block.kind !== "text") continue;
      const { family, weight, style } = resolveFont(block.style.fontId, block.style.fontWeight, block.style.fontStyle);
      requirements.push({ family, weight, style, text: composeFrench(block.content) });
    }
  }
  return mergeRequirements(requirements);
}

/** À appeler uniquement après loadFonts() ; à recalculer à chaque changement de polices. */
export function layoutDocument(doc: StoryDocument): DocumentLayout {
  const texts = new Map<string, TextLayout>();
  const problems: LayoutProblem[] = [];
  const warnings: LayoutProblem[] = [];
  for (const slide of doc.slides) {
    for (const block of slide.blocks) {
      if (block.kind !== "text") continue;
      const layout = layoutTextBlock(block);
      texts.set(block.id, layout);
      for (const message of layout.problems) problems.push({ slideId: slide.id, blockId: block.id, message });
      for (const message of layout.warnings) warnings.push({ slideId: slide.id, blockId: block.id, message });
    }
  }
  return { texts, problems, warnings };
}

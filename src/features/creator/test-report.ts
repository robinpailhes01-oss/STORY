import type { TextBlock } from "@/domain/story-document";
import type { ComposeResult } from "@/lib/compose";
import type { DocumentLayout } from "@/lib/layout/document-layout";

/**
 * Rapport exposé sur window.__storyApp, lu par scripts/verify-app.mjs : ce qui est réellement dessiné
 * (lignes, accents trouvés, marquage, police), sans dépendre du canvas.
 */
export interface AppReport {
  ready: boolean;
  storyIndex: number;
  styleId: string | null;
  photos: Array<string | null>;
  problems: string[];
  warnings: string[];
  /** Étapes d’annulation et de rétablissement disponibles. */
  history: { past: number; future: number };
  slides: Array<{
    id: string;
    assetId: string | null;
    crop: { focalX: number; focalY: number; zoom: number } | null;
    blocks: Array<{
      id: string;
      text: string;
      lines: string[];
      opacity: number;
      family: string;
      marker: string | null;
      accents: string[];
      accentsFound: string[];
    }>;
  }>;
}

declare global {
  interface Window {
    __storyApp?: AppReport;
  }
}

export function publishAppReport(
  base: Pick<AppReport, "ready" | "storyIndex" | "styleId" | "photos" | "problems" | "warnings" | "history">,
  composition: ComposeResult | null,
  layout: DocumentLayout | null,
) {
  window.__storyApp = {
    ...base,
    slides:
      composition && layout
        ? composition.document.slides.map((slide) => ({
            id: slide.id,
            assetId: slide.background.kind === "image" ? slide.background.assetId : null,
            crop: slide.background.kind === "image" ? slide.background.crop : null,
            blocks: slide.blocks
              .filter((b): b is TextBlock => b.kind === "text")
              .map((b) => {
                const t = layout.texts.get(b.id);
                return {
                  id: b.id,
                  text: b.content,
                  lines: t?.lines.map((l) => l.text) ?? [],
                  opacity: b.opacity ?? 1,
                  family: t?.family ?? "",
                  marker: b.marker?.kind ?? null,
                  accents: b.accents ?? [],
                  accentsFound: t ? t.accents.ranges.map((r) => t.text.slice(r.start, r.end)) : [],
                };
              }),
          }))
        : [],
  };
}

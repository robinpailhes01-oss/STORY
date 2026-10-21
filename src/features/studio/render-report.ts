import type { LoadedFontReport } from "@/lib/fonts/load-fonts";
import type { DocumentLayout } from "@/lib/layout/document-layout";

/**
 * Rapport de rendu exposé sur window, lu par scripts/verify-export.mjs
 * pour contrôler police réelle, glyphes et dimensions sans dépendre du DOM.
 */
export interface RenderReport {
  documentId: string;
  fonts: LoadedFontReport[];
  texts: Array<{ blockId: string; font: string; family: string; weight: number; fontSize: number; lines: string[] }>;
  problems: DocumentLayout["problems"];
}

declare global {
  interface Window {
    __storyRender?: RenderReport;
  }
}

export function publishRenderReport(documentId: string, fonts: LoadedFontReport[], layout: DocumentLayout) {
  window.__storyRender = {
    documentId,
    fonts,
    texts: [...layout.texts.entries()].map(([blockId, t]) => ({
      blockId,
      font: t.font,
      family: t.family,
      weight: t.weight,
      fontSize: t.fontSize,
      lines: t.lines.map((l) => l.text),
    })),
    problems: layout.problems,
  };
}

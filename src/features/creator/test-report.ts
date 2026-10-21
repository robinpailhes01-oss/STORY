import type { TextBlock } from "@/domain/story-document";
import type { StyleOptions } from "./model/draft";
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
  /** Options du panneau Style réellement appliquées par la composition. */
  options: StyleOptions | null;
  /** Zoom de l’aperçu (1 = 100 %). */
  zoom: number;
  /** Détourages utilisés (assetId) et calcul en cours. */
  cutouts: { needed: boolean; ids: string[]; computing: boolean };
  /** Contrôles de l’IA (codes). */
  controlCodes: string[];
  slides: Array<{
    id: string;
    assetId: string | null;
    crop: { focalX: number; focalY: number; zoom: number } | null;
    /** Nombre de traits du Crayon dessinés sur cette story. */
    strokes: number;
    /** Outil et points de chaque trait (repère 1080 × 1920). */
    strokeList: Array<{ tool: string; points: number[] }>;
    decoration: string | null;
    /** Mot géant (texte) posé derrière la personne. */
    giant: string | null;
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
  base: Omit<AppReport, "slides" | "options">,
  composition: ComposeResult | null,
  layout: DocumentLayout | null,
) {
  window.__storyApp = {
    ...base,
    options: composition ? { accentColor: composition.options.accentColor, showAccents: composition.options.showAccents, decoration: composition.options.decoration } : null,
    slides:
      composition && layout
        ? composition.document.slides.map((slide) => ({
            id: slide.id,
            assetId: slide.background.kind === "image" ? slide.background.assetId : null,
            crop: slide.background.kind === "image" ? slide.background.crop : null,
            strokes: slide.blocks.reduce((n, b) => n + (b.kind === "drawing" ? b.strokes.length : 0), 0),
            strokeList: slide.blocks.flatMap((b) => (b.kind === "drawing" ? b.strokes.map((st) => ({ tool: st.tool, points: st.points })) : [])),
            decoration: slide.blocks.flatMap((b) => (b.kind === "decoration" ? [b.decoration] : []))[0] ?? null,
            giant: (slide.blocks.find((b) => b.kind === "text" && b.behindSubject) as TextBlock | undefined)?.content ?? null,
            blocks: slide.blocks
              .filter((b): b is TextBlock => b.kind === "text" && !b.behindSubject)
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

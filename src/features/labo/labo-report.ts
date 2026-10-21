import type { DecorationBlock, DrawingBlock, StoryDocument, TextBlock } from "@/domain/story-document";
import type { RenderOptions } from "@/domain/render-options";
import type { ComposeResult } from "@/lib/compose";
import type { LoadedFontReport } from "@/lib/fonts/load-fonts";
import type { DocumentLayout } from "@/lib/layout/document-layout";
import type { StylePreset } from "@/styles/presets";
import { MIN_CONTRAST, contrastRatio, hexToRgb, relativeLuminance, textContrast, type BackgroundSample } from "./contrast";

/**
 * Rapport de rendu du laboratoire, exposé sur window.__storyLabo et lu par scripts/verify-render.mjs :
 * polices réelles, géométrie des blocs, accents, problèmes, avertissements et contraste mesuré.
 */
export interface LaboBlockReport {
  blockId: string;
  font: string;
  family: string;
  weight: number;
  style: string;
  fontSize: number;
  opacity: number;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
  /** Positions absolues des lignes (x, y du haut de ligne), pour comparer story et suite. */
  lineBoxes: Array<{ x: number; y: number; width: number }>;
  repeated: boolean;
  marker: string | null;
  accents: string[];
  accentsFound: string[];
  accentsMissing: string[];
  accentKinds: Array<string | null>;
  /** Luminance relative moyenne réelle sous les lignes (fond seul : photo, voile, grain). */
  backgroundLuminance: number | null;
  contrast: number | null;
  accentContrast: number | null;
  /** null pour un paragraphe repris (grisé volontairement) : non soumis au seuil. */
  contrastOk: boolean | null;
  /** Couleur du texte, capitales, contour, halo des accents, inclinaison, mot géant. */
  color: string;
  transform: string | null;
  outline: number | null;
  glow: number | null;
  rotation: number | null;
  behindSubject: boolean;
  markerColor: string | null;
  markerTextColor: string | null;
  /** Hauteur d’une ligne en px (boîtes de lignes : lineBoxes × lineHeight). */
  lineHeight: number;
}

export interface LaboStoryReport {
  index: number;
  slideId: string;
  assetId: string | null;
  blocks: LaboBlockReport[];
  decoration: {
    kind: string;
    color: string;
    shapes: number;
    bounds: { x: number; y: number; width: number; height: number };
    /** Points de chaque tracé, pour vérifier qu’aucun ne touche une ligne de texte. */
    points: number[][];
  } | null;
  drawing: { strokes: number; tools: string[] } | null;
}

export interface LaboStyleReport {
  styleId: string;
  name: string;
  documentId: string;
  problems: string[];
  warnings: string[];
  contrastWarnings: string[];
  /** Mots géants sans détourage (non bloquant). */
  cutoutWarnings: string[];
  sceneSizes: Array<{ stories: number[]; fontSize: number; top: number; height: number }>;
  stories: LaboStoryReport[];
}

export interface LaboReport {
  ready: boolean;
  /** Signature des réglages affichés (options, photos, dessin, détourage) : change à chaque réglage. */
  signature: string;
  options: RenderOptions;
  photoCount: number;
  cutouts: boolean;
  drawing: boolean;
  fonts: LoadedFontReport[];
  photos: string[];
  styles: LaboStyleReport[];
}

declare global {
  interface Window {
    __storyLabo?: LaboReport;
  }
}

/** Fond sous un bloc : pixels mesurés, ou la couleur du bandeau quand le texte est posé dessus. */
function effectiveBackground(block: TextBlock, sample: BackgroundSample | undefined): BackgroundSample | undefined {
  if (block.marker?.kind === "bandeau") {
    const rgb = hexToRgb(block.marker.color);
    return { luminance: relativeLuminance(...rgb), rgb, pixels: 1 };
  }
  return sample;
}

export function buildStyleReport(
  style: StylePreset,
  composition: ComposeResult,
  layout: DocumentLayout,
  samples: ReadonlyMap<string, Record<string, BackgroundSample>>,
  cutoutWarnings: string[] = [],
  sampleKey: (slideId: string) => string = (slideId) => `${style.id}/${slideId}`,
): LaboStyleReport {
  const doc: StoryDocument = composition.document;
  const contrastWarnings: string[] = [];
  const stories = doc.slides.map((slide, index): LaboStoryReport => {
    const measured = samples.get(sampleKey(slide.id)) ?? {};
    const blocks = slide.blocks
      .filter((b): b is TextBlock => b.kind === "text")
      .map((block): LaboBlockReport => {
        const t = layout.texts.get(block.id)!;
        const opacity = block.opacity ?? 1;
        const repeated = opacity < 1;
        const bg = effectiveBackground(block, measured[block.id]);
        const contrast = bg ? textContrast(block.style.color, opacity, bg) : null;
        // Accent « couleur » : le mot clé est posé sur la photo, son contraste compte aussi.
        const accentColor = block.marker && t.accents.kinds.includes("couleur") ? block.marker.color : null;
        const accentContrast =
          bg && accentColor && t.accents.ranges.length ? contrastRatio(relativeLuminance(...hexToRgb(accentColor)), bg.luminance) : null;
        // Le mot géant est un élément graphique (souvent derrière la personne) : rapporté, non soumis au seuil.
        const contrastOk = repeated || contrast === null || block.behindSubject ? null : contrast >= MIN_CONTRAST;
        if (contrastOk === false) {
          contrastWarnings.push(`story ${index + 1}, ${block.id} : contraste ${contrast!.toFixed(2)}:1 sous ${MIN_CONTRAST}:1`);
        }
        return {
          blockId: block.id,
          font: t.font,
          family: t.family,
          weight: t.weight,
          style: t.style,
          fontSize: t.fontSize,
          opacity,
          x: block.x,
          y: block.y,
          width: block.width,
          height: block.height,
          lines: t.lines.map((l) => l.text),
          lineBoxes: t.lines.map((l) => ({ x: block.x + l.x, y: block.y + l.top, width: l.width })),
          repeated,
          marker: block.marker?.kind ?? null,
          accents: block.accents ?? [],
          accentsFound: t.accents.ranges.map((r) => t.text.slice(r.start, r.end)),
          accentsMissing: t.accents.missing,
          accentKinds: t.accents.kinds,
          backgroundLuminance: bg ? bg.luminance : null,
          contrast,
          accentContrast,
          contrastOk,
          color: block.style.color,
          transform: block.style.transform ?? null,
          outline: block.style.outline?.width ?? null,
          glow: block.marker?.glow ?? null,
          rotation: block.rotation?.angle ?? null,
          behindSubject: Boolean(block.behindSubject),
          markerColor: block.marker?.color ?? null,
          markerTextColor: block.marker?.textColor ?? null,
          lineHeight: t.lineHeightPx,
        };
      });
    const deco = slide.blocks.find((b): b is DecorationBlock => b.kind === "decoration");
    const drawing = slide.blocks.find((b): b is DrawingBlock => b.kind === "drawing");
    return {
      index,
      slideId: slide.id,
      assetId: slide.background.kind === "image" ? slide.background.assetId : null,
      blocks,
      decoration: deco
        ? {
            kind: deco.decoration,
            color: deco.color,
            shapes: deco.shapes.length,
            bounds: { x: deco.x, y: deco.y, width: deco.width, height: deco.height },
            points: deco.shapes.map((shape) => shape.points),
          }
        : null,
      drawing: drawing ? { strokes: drawing.strokes.length, tools: drawing.strokes.map((s) => s.tool) } : null,
    };
  });
  return {
    styleId: style.id,
    name: style.name,
    documentId: doc.documentId,
    problems: [...composition.problems, ...layout.problems.map((p) => `${p.slideId}/${p.blockId} : ${p.message}`)],
    warnings: [...composition.warnings],
    contrastWarnings,
    cutoutWarnings,
    sceneSizes: composition.scenes,
    stories,
  };
}

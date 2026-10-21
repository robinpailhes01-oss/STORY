import type { MarkerKind, TextBlock, TextStyle, Marker } from "@/domain/story-document";
import { accentRanges, type AccentRange } from "@/domain/story-plan";
import { cssFont, resolveFont, type FontStyle } from "@/lib/fonts/registry";
import { renderedText } from "./french";

/** Morceau de ligne : texte ordinaire (accentIndex null) ou morceau d’un accent. */
export interface LineSegment {
  text: string;
  /** Position dans le texte composé. */
  start: number;
  end: number;
  /** Décalage horizontal dans le bloc. */
  x: number;
  width: number;
  accentIndex: number | null;
}

export interface LaidOutLine {
  text: string;
  /** Décalage horizontal dans le bloc, selon l’alignement. */
  x: number;
  /** Haut de la ligne (boîte d’interligne), relatif au haut du bloc. */
  top: number;
  /** Ligne de base, relative au haut du bloc. */
  baseline: number;
  width: number;
  segments: LineSegment[];
}

/** Boîte d’un morceau d’accent (un accent coupé sur deux lignes donne deux morceaux). */
export interface AccentBox {
  accentIndex: number;
  /** Numéro du morceau dans l’accent (0, 1…). */
  piece: number;
  /** Marquage résolu (rotation comprise) ; null si le bloc n’a pas de marquage. */
  kind: MarkerKind | null;
  text: string;
  x: number;
  /** Haut de la ligne. */
  y: number;
  width: number;
  /** Hauteur de ligne (interligne en px). */
  height: number;
  baseline: number;
}

export interface TextLayout {
  font: string;
  family: string;
  weight: number;
  style: FontStyle;
  fontSize: number;
  letterSpacing: number;
  lineHeightPx: number;
  lines: LaidOutLine[];
  contentHeight: number;
  /** Texte composé (typographie française), tel que dessiné. */
  text: string;
  /** Accents trouvés (positions dans le texte composé, ordre du texte) et introuvables. */
  accents: { ranges: AccentRange[]; missing: string[]; kinds: Array<MarkerKind | null> };
  accentBoxes: AccentBox[];
  /** Bloquants : débordement, mot trop large. */
  problems: string[];
  /** Non bloquants : accent introuvable. */
  warnings: string[];
}

let measureCtx: CanvasRenderingContext2D | null = null;

function context(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponible");
    measureCtx = ctx;
  }
  return measureCtx;
}

export const nativeLetterSpacing =
  typeof CanvasRenderingContext2D !== "undefined" && "letterSpacing" in CanvasRenderingContext2D.prototype;

/** Applique la police et l’interlettrage sur un contexte (mesure comme dessin). */
export function applyFont(ctx: CanvasRenderingContext2D, font: string, letterSpacing: number) {
  ctx.font = font;
  if (nativeLetterSpacing) ctx.letterSpacing = `${letterSpacing}px`;
}

/** Largeur visible : l’interlettrage natif ajoute un espacement après le dernier caractère. */
export function measureLine(ctx: CanvasRenderingContext2D, text: string, letterSpacing: number): number {
  const graphemes = [...text].length;
  if (!graphemes) return 0;
  const raw = ctx.measureText(text).width;
  return nativeLetterSpacing ? raw - letterSpacing : raw + letterSpacing * (graphemes - 1);
}

/** Avance (position du caractère suivant), interlettrage compris. */
function advance(ctx: CanvasRenderingContext2D, text: string, letterSpacing: number): number {
  if (!text) return 0;
  const raw = ctx.measureText(text).width;
  return nativeLetterSpacing ? raw : raw + letterSpacing * [...text].length;
}

/** Marquage de l’accent n° index du bloc, rotation comprise. */
export function markerKindFor(marker: Marker | undefined, index: number): MarkerKind | null {
  if (!marker) return null;
  if (marker.rotation?.length) return marker.rotation[((marker.rotationOffset ?? 0) + index) % marker.rotation.length];
  return marker.kind;
}

export interface RichTextInput {
  content: string;
  style: TextStyle;
  /** Largeur de colonne en px. */
  width: number;
  accents?: readonly string[];
  marker?: Marker;
}

interface Word {
  start: number;
  end: number;
}

/**
 * Mise en page d’un texte riche : retour à la ligne glouton, mot par mot, mesuré avec la vraie police
 * (déjà chargée). Les coupures n’ont lieu qu’aux espaces ordinaires : U+00A0 colle « ? » ou « » » à son mot.
 * Chaque ligne est découpée en segments (texte ordinaire / morceaux d’accents) ; un accent peut se couper
 * sur deux lignes. Aucune réduction de taille ici : un débordement est signalé, jamais masqué.
 */
export function layoutRichText(input: RichTextInput): TextLayout {
  const { style, width, marker } = input;
  const fontStyle = style.fontStyle ?? "normal";
  const { family, weight } = resolveFont(style.fontId, style.fontWeight, fontStyle);
  const { fontSize, lineHeight, letterSpacing, align } = style;
  const font = cssFont(family, weight, fontSize, fontStyle);
  const ctx = context();
  applyFont(ctx, font, letterSpacing);

  const draw = (s: string) => renderedText(s, style.transform);
  const text = draw(input.content);
  const problems: string[] = [];
  const warnings: string[] = [];

  const found = accentRanges(input.content, input.accents ?? [], draw);
  for (const missing of found.missing) warnings.push(`accent introuvable dans le texte : « ${missing} »`);
  const ranges = found.ranges;
  const kinds = ranges.map((_, i) => markerKindFor(marker, i));

  // 1. Mots (séparés par des espaces ordinaires) et retours à la ligne forcés.
  const rows: Array<{ start: number; end: number }> = [];
  let paragraphStart = 0;
  for (const paragraph of text.split("\n")) {
    const words: Word[] = [];
    const re = /[^ ]+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(paragraph))) words.push({ start: paragraphStart + m.index, end: paragraphStart + m.index + m[0].length });
    let current: Word | null = null;
    for (const word of words) {
      const wordWidth = measureLine(ctx, text.slice(word.start, word.end), letterSpacing);
      if (wordWidth > width) problems.push(`le mot « ${text.slice(word.start, word.end)} » est plus large que le bloc (${width} px)`);
      if (!current) {
        current = { ...word };
        continue;
      }
      const candidate = text.slice(current.start, word.end);
      if (measureLine(ctx, candidate, letterSpacing) > width) {
        rows.push(current);
        current = { ...word };
      } else {
        current.end = word.end;
      }
    }
    rows.push(current ?? { start: paragraphStart, end: paragraphStart });
    paragraphStart += paragraph.length + 1;
  }

  // 2. Métriques verticales.
  const metrics = ctx.measureText("Hg");
  const ascent = metrics.fontBoundingBoxAscent ?? fontSize * 0.8;
  const descent = metrics.fontBoundingBoxDescent ?? fontSize * 0.2;
  const lineHeightPx = fontSize * lineHeight;
  const halfLeading = (lineHeightPx - (ascent + descent)) / 2;

  // 3. Lignes, segments et boîtes d’accents.
  const accentBoxes: AccentBox[] = [];
  const pieces = new Map<number, number>();
  const lines: LaidOutLine[] = rows.map((row, i) => {
    const lineText = text.slice(row.start, row.end);
    const lineWidth = measureLine(ctx, lineText, letterSpacing);
    const x = align === "center" ? (width - lineWidth) / 2 : align === "right" ? width - lineWidth : 0;
    const top = i * lineHeightPx;
    const baseline = top + halfLeading + ascent;

    // Coupures aux bornes des accents qui touchent la ligne.
    const cuts = new Set<number>([row.start, row.end]);
    for (const r of ranges) {
      if (r.end <= row.start || r.start >= row.end) continue;
      cuts.add(Math.max(r.start, row.start));
      cuts.add(Math.min(r.end, row.end));
    }
    const bounds = [...cuts].sort((a, b) => a - b);
    const segments: LineSegment[] = [];
    for (let k = 0; k < bounds.length - 1; k++) {
      const start = bounds[k];
      const end = bounds[k + 1];
      if (end <= start) continue;
      const accentIndex = ranges.findIndex((r) => start >= r.start && end <= r.end);
      const segText = text.slice(start, end);
      segments.push({
        text: segText,
        start,
        end,
        x: x + advance(ctx, text.slice(row.start, start), letterSpacing),
        width: measureLine(ctx, segText, letterSpacing),
        accentIndex: accentIndex === -1 ? null : accentIndex,
      });
    }
    for (const seg of segments) {
      if (seg.accentIndex === null) continue;
      // Les espaces de bord ne portent pas de marquage.
      const trimmedStart = seg.text.length - seg.text.trimStart().length;
      const trimmed = seg.text.trim();
      if (!trimmed) continue;
      const piece = pieces.get(seg.accentIndex) ?? 0;
      pieces.set(seg.accentIndex, piece + 1);
      accentBoxes.push({
        accentIndex: seg.accentIndex,
        piece,
        kind: kinds[seg.accentIndex],
        text: trimmed,
        x: seg.x + advance(ctx, seg.text.slice(0, trimmedStart), letterSpacing),
        y: top,
        width: measureLine(ctx, trimmed, letterSpacing),
        height: lineHeightPx,
        baseline,
      });
    }
    return { text: lineText, x, top, baseline, width: lineWidth, segments };
  });

  return {
    font,
    family,
    weight,
    style: fontStyle,
    fontSize,
    letterSpacing,
    lineHeightPx,
    lines,
    contentHeight: lines.length * lineHeightPx,
    text,
    accents: { ranges, missing: found.missing, kinds },
    accentBoxes,
    problems,
    warnings,
  };
}

/** Mise en page d’un bloc du document : contrôle en plus que le texte tient dans la hauteur du bloc. */
export function layoutTextBlock(block: TextBlock): TextLayout {
  const layout = layoutRichText({
    content: block.content,
    style: block.style,
    width: block.width,
    accents: block.accents,
    marker: block.marker,
  });
  if (layout.contentHeight > block.height + 0.5) {
    layout.problems.push(`${layout.lines.length} lignes (${Math.round(layout.contentHeight)} px) pour ${block.height} px disponibles`);
  }
  return layout;
}

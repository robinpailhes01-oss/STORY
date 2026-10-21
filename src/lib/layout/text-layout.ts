import type { TextBlock } from "@/domain/story-document";
import { cssFont, resolveFont } from "@/lib/fonts/registry";
import { composeFrench } from "./french";

export interface LaidOutLine {
  text: string;
  /** Décalage horizontal dans le bloc, selon l’alignement. */
  x: number;
  /** Ligne de base, relative au haut du bloc. */
  baseline: number;
  width: number;
}

export interface TextLayout {
  font: string;
  family: string;
  weight: number;
  fontSize: number;
  letterSpacing: number;
  lines: LaidOutLine[];
  contentHeight: number;
  /** Texte composé (typographie française), tel que dessiné. */
  text: string;
  problems: string[];
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

/**
 * Retour à la ligne glouton, mot par mot, mesuré avec la vraie police (déjà chargée).
 * Les coupures n’ont lieu qu’aux espaces ordinaires : U+00A0 colle « ? » ou « » » à son mot.
 * Aucune réduction de taille : un débordement est signalé, jamais masqué.
 */
export function layoutTextBlock(block: TextBlock): TextLayout {
  const { family, weight } = resolveFont(block.style.fontId, block.style.fontWeight);
  const { fontSize, lineHeight, letterSpacing, align } = block.style;
  const font = cssFont(family, weight, fontSize);
  const ctx = context();
  applyFont(ctx, font, letterSpacing);

  const text = composeFrench(block.content);
  const problems: string[] = [];
  const rows: string[] = [];

  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/ +/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && measureLine(ctx, candidate, letterSpacing) > block.width) {
        rows.push(current);
        current = word;
      } else {
        current = candidate;
      }
      if (measureLine(ctx, word, letterSpacing) > block.width) {
        problems.push(`le mot « ${word} » est plus large que le bloc (${block.width} px)`);
      }
    }
    rows.push(current);
  }

  const metrics = ctx.measureText("Hg");
  const ascent = metrics.fontBoundingBoxAscent ?? fontSize * 0.8;
  const descent = metrics.fontBoundingBoxDescent ?? fontSize * 0.2;
  const lineHeightPx = fontSize * lineHeight;
  const halfLeading = (lineHeightPx - (ascent + descent)) / 2;

  const lines = rows.map((row, i) => {
    const width = measureLine(ctx, row, letterSpacing);
    const x = align === "center" ? (block.width - width) / 2 : align === "right" ? block.width - width : 0;
    return { text: row, x, width, baseline: i * lineHeightPx + halfLeading + ascent };
  });

  const contentHeight = lines.length * lineHeightPx;
  if (contentHeight > block.height + 0.5) {
    problems.push(`${lines.length} lignes (${Math.round(contentHeight)} px) pour ${block.height} px disponibles`);
  }

  return { font, family, weight, fontSize, letterSpacing, lines, contentHeight, text, problems };
}

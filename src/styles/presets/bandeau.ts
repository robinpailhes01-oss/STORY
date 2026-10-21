import { DEFAULT_VEIL, SWATCH_BACKGROUND, WHITE } from "./common";
import type { StylePreset } from "./types";

/**
 * Bandeau : Tinos sur bandeaux noirs, une bande par ligne, façon coupure de journal.
 * Les accents restent blancs (le noir/blanc est le style) et sont soulignés d’un trait fin :
 * pas d’italique, pour que la reprise grisée garde exactement les mêmes coupures de lignes.
 */
export const bandeau: StylePreset = {
  id: "bandeau",
  name: "Bandeau",
  description: "Serif sur bandeaux noirs, façon coupure de journal.",
  hook: { font: { fontId: "tinos", weight: 400, style: "normal" }, size: 68, minSize: 52, lineHeight: 1.32, letterSpacing: 0 },
  body: { font: { fontId: "tinos", weight: 400, style: "normal" }, size: 50, minSize: 40, lineHeight: 1.36, letterSpacing: 0 },
  colors: { text: WHITE, accent: WHITE },
  marker: { kind: "bandeau", color: "#000000", textColor: WHITE },
  veil: { ...DEFAULT_VEIL, stops: [0.3, 0.18, 0.2, 0.4, 0.62] },
  dim: 0,
  continuationDim: 0.3,
  grain: 0.12,
  swatchBackground: SWATCH_BACKGROUND,
};

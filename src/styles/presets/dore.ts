import { DEFAULT_SHADOW, DEFAULT_VEIL, SWATCH_BACKGROUND, WHITE } from "./common";
import type { StylePreset } from "./types";

/**
 * Doré : le style par défaut, celui des captures de référence 1 à 5.
 * Mesures : corps Poppins 700 à 41 px, pas de ligne 55 px ; accroche Poppins 700 à 59 px, pas 69 px
 * (largeurs de lignes ajustées sur les captures, écart quadratique 1 px).
 */
export const dore: StylePreset = {
  id: "dore",
  name: "Doré",
  description: "Sans-serif rond, mots clés en doré. Le style par défaut.",
  hook: { font: { fontId: "poppins", weight: 700, style: "normal" }, size: 59, minSize: 46, lineHeight: 1.17, letterSpacing: 0 },
  body: { font: { fontId: "poppins", weight: 700, style: "normal" }, size: 41, minSize: 34, lineHeight: 1.34, letterSpacing: 0 },
  colors: { text: WHITE, accent: "#E8B84B" },
  marker: { kind: "couleur", color: "#E8B84B" },
  shadow: DEFAULT_SHADOW,
  veil: DEFAULT_VEIL,
  dim: 0,
  continuationDim: 0.4,
  grain: 0.1,
  swatchBackground: SWATCH_BACKGROUND,
};

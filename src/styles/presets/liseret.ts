import { DEFAULT_SHADOW, DEFAULT_VEIL, SWATCH_BACKGROUND, WHITE } from "./common";
import type { StylePreset } from "./types";

/**
 * Liseré : accroche et amorce en condensé gras aux lettres seulement contourées (intérieur transparent),
 * mots clés pleins en bleu glacier ; puis texte courant en Inter.
 */
export const liseret: StylePreset = {
  id: "liseret",
  name: "Liseré",
  description: "Titres condensés en lettres contourées, mots clés pleins, texte courant net.",
  hook: { font: { fontId: "anton", weight: 400, style: "normal" }, size: 90, minSize: 66, lineHeight: 1.1, letterSpacing: 1, outline: 0.034 },
  lead: { font: { fontId: "anton", weight: 400, style: "normal" }, size: 62, minSize: 48, lineHeight: 1.16, letterSpacing: 0.8, outline: 0.036 },
  body: { font: { fontId: "inter", weight: 700, style: "normal" }, size: 40, minSize: 33, lineHeight: 1.38, letterSpacing: -0.3 },
  colors: { text: WHITE, accent: "#8BE3FF" },
  marker: { kind: "couleur", color: "#8BE3FF" },
  shadow: DEFAULT_SHADOW,
  veil: DEFAULT_VEIL,
  dim: 0.04,
  continuationDim: 0.42,
  grain: 0.1,
  swatchBackground: SWATCH_BACKGROUND,
  swatchRole: "lead",
};

import { DEFAULT_SHADOW, DEFAULT_VEIL, SWATCH_BACKGROUND, WHITE } from "./common";
import type { StylePreset } from "./types";

/** Turquoise : la mise en page du style Doré en Poppins semi-gras, mots clés turquoise. */
export const turquoise: StylePreset = {
  id: "turquoise",
  name: "Turquoise",
  description: "Sans-serif rond semi-gras, mots clés en turquoise.",
  hook: { font: { fontId: "poppins", weight: 700, style: "normal" }, size: 59, minSize: 46, lineHeight: 1.17, letterSpacing: 0 },
  body: { font: { fontId: "poppins", weight: 600, style: "normal" }, size: 41, minSize: 34, lineHeight: 1.34, letterSpacing: 0 },
  colors: { text: WHITE, accent: "#2DD4BF" },
  marker: { kind: "couleur", color: "#2DD4BF" },
  shadow: DEFAULT_SHADOW,
  veil: DEFAULT_VEIL,
  dim: 0,
  continuationDim: 0.4,
  grain: 0.1,
  swatchBackground: SWATCH_BACKGROUND,
};

import { DEFAULT_SHADOW, DEFAULT_VEIL, SWATCH_BACKGROUND, WHITE } from "./common";
import type { StylePreset } from "./types";

/** Massif : condensé très gras (Anton), accroche en capitales, mots clés vert-jaune. */
export const massif: StylePreset = {
  id: "massif",
  name: "Massif",
  description: "Condensé très gras, accroche en capitales, mots clés vert-jaune.",
  hook: { font: { fontId: "anton", weight: 400, style: "normal" }, size: 84, minSize: 62, lineHeight: 1.1, letterSpacing: 0.5, transform: "uppercase" },
  body: { font: { fontId: "anton", weight: 400, style: "normal" }, size: 52, minSize: 40, lineHeight: 1.26, letterSpacing: 0.3 },
  colors: { text: WHITE, accent: "#D4F25A" },
  marker: { kind: "couleur", color: "#D4F25A" },
  shadow: DEFAULT_SHADOW,
  veil: DEFAULT_VEIL,
  dim: 0,
  continuationDim: 0.4,
  grain: 0.1,
  swatchBackground: SWATCH_BACKGROUND,
};

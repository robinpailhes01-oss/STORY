import { DEFAULT_SHADOW, DEFAULT_VEIL, SWATCH_BACKGROUND } from "./common";
import type { StylePreset } from "./types";

/** Roman : serif façon livre (Tinos), accroche en gras, mots clés lavande. */
export const roman: StylePreset = {
  id: "roman",
  name: "Roman",
  description: "Serif de livre, accroche en gras, mots clés lavande.",
  hook: { font: { fontId: "tinos", weight: 700, style: "normal" }, size: 70, minSize: 54, lineHeight: 1.1, letterSpacing: 0 },
  body: { font: { fontId: "tinos", weight: 400, style: "normal" }, size: 50, minSize: 40, lineHeight: 1.16, letterSpacing: 0 },
  colors: { text: "#FAF7FF", accent: "#C3ACE7" },
  marker: { kind: "couleur", color: "#C3ACE7" },
  shadow: DEFAULT_SHADOW,
  veil: DEFAULT_VEIL,
  dim: 0,
  continuationDim: 0.4,
  grain: 0.14,
  swatchBackground: SWATCH_BACKGROUND,
};

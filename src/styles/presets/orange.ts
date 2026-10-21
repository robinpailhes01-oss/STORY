import { DEFAULT_SHADOW, DEFAULT_VEIL, SWATCH_BACKGROUND, WHITE } from "./common";
import type { StylePreset } from "./types";

/** Orange : Inter extra-gras, mots clés sur une pastille orange, texte blanc dessus. */
export const orange: StylePreset = {
  id: "orange",
  name: "Orange",
  description: "Sans-serif extra-gras, mots clés surlignés en orange.",
  hook: { font: { fontId: "inter", weight: 800, style: "normal" }, size: 58, minSize: 46, lineHeight: 1.22, letterSpacing: -0.5 },
  body: { font: { fontId: "inter", weight: 800, style: "normal" }, size: 42, minSize: 34, lineHeight: 1.4, letterSpacing: -0.3 },
  colors: { text: WHITE, accent: "#F97316" },
  marker: { kind: "pastille", color: "#F97316", textColor: WHITE },
  shadow: DEFAULT_SHADOW,
  veil: DEFAULT_VEIL,
  dim: 0,
  continuationDim: 0.4,
  grain: 0.1,
  swatchBackground: SWATCH_BACKGROUND,
};

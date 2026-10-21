import { DEFAULT_SHADOW, DEFAULT_VEIL, SWATCH_BACKGROUND, WHITE } from "./common";
import type { StylePreset } from "./types";

/** Feutre : condensé gras blanc (Anton), mots clés soulignés d’un trait blanc épais sous les lettres. */
export const feutre: StylePreset = {
  id: "feutre",
  name: "Feutre",
  description: "Condensé gras blanc, mots clés soulignés au feutre épais.",
  hook: { font: { fontId: "anton", weight: 400, style: "normal" }, size: 82, minSize: 60, lineHeight: 1.16, letterSpacing: 0.5 },
  body: { font: { fontId: "anton", weight: 400, style: "normal" }, size: 50, minSize: 40, lineHeight: 1.36, letterSpacing: 0.3 },
  colors: { text: WHITE, accent: WHITE },
  marker: { kind: "souligne", color: WHITE, underlineOffset: 0.1, underlineThickness: 0.14 },
  shadow: DEFAULT_SHADOW,
  veil: DEFAULT_VEIL,
  dim: 0,
  continuationDim: 0.4,
  grain: 0.1,
  swatchBackground: SWATCH_BACKGROUND,
};

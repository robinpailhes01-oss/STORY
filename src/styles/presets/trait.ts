import { DEFAULT_SHADOW, DEFAULT_VEIL, SWATCH_BACKGROUND, WHITE } from "./common";
import type { StylePreset } from "./types";

/** Trait : Inter gras, mots clés soulignés d’une barre bleue épaisse. */
export const trait: StylePreset = {
  id: "trait",
  name: "Trait",
  description: "Sans-serif net, mots clés soulignés en bleu.",
  hook: { font: { fontId: "inter", weight: 800, style: "normal" }, size: 58, minSize: 46, lineHeight: 1.16, letterSpacing: -0.5 },
  body: { font: { fontId: "inter", weight: 700, style: "normal" }, size: 42, minSize: 34, lineHeight: 1.34, letterSpacing: -0.3 },
  colors: { text: WHITE, accent: "#3B82F6" },
  marker: { kind: "souligne", color: "#3B82F6" },
  shadow: DEFAULT_SHADOW,
  veil: DEFAULT_VEIL,
  dim: 0,
  continuationDim: 0.4,
  grain: 0.1,
  swatchBackground: SWATCH_BACKGROUND,
};

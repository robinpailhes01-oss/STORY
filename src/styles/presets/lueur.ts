import { DEFAULT_SHADOW, DEFAULT_VEIL, SWATCH_BACKGROUND, WHITE } from "./common";
import type { StylePreset } from "./types";

/** Lueur : didone grasse (Abril Fatface), mots clés rose vif entourés d’un halo lumineux, façon néon. */
export const lueur: StylePreset = {
  id: "lueur",
  name: "Lueur",
  description: "Didone grasse, mots clés rose néon avec halo lumineux.",
  hook: { font: { fontId: "abril-fatface", weight: 400, style: "normal" }, size: 66, minSize: 50, lineHeight: 1.16, letterSpacing: 0 },
  body: { font: { fontId: "abril-fatface", weight: 400, style: "normal" }, size: 45, minSize: 36, lineHeight: 1.32, letterSpacing: 0.2 },
  colors: { text: WHITE, accent: "#FF2BD6" },
  marker: { kind: "couleur", color: "#FF2BD6", glow: 0.3 },
  shadow: DEFAULT_SHADOW,
  veil: DEFAULT_VEIL,
  dim: 0.06,
  continuationDim: 0.44,
  grain: 0.1,
  swatchBackground: SWATCH_BACKGROUND,
};

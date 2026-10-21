import { DEFAULT_SHADOW, DEFAULT_VEIL, SWATCH_BACKGROUND, WHITE } from "./common";
import type { StylePreset } from "./types";

/** Fluo : Inter extra-gras italique, mots clés sur une pastille bleue inclinée, façon surligneur. */
export const fluo: StylePreset = {
  id: "fluo",
  name: "Fluo",
  description: "Italique extra-gras, mots clés passés au surligneur bleu.",
  hook: { font: { fontId: "inter", weight: 800, style: "italic" }, size: 57, minSize: 46, lineHeight: 1.22, letterSpacing: -0.5 },
  body: { font: { fontId: "inter", weight: 800, style: "italic" }, size: 42, minSize: 34, lineHeight: 1.4, letterSpacing: -0.3 },
  colors: { text: WHITE, accent: "#2D9CDB" },
  marker: { kind: "pastille", color: "#2D9CDB", textColor: WHITE, skew: 10 },
  shadow: DEFAULT_SHADOW,
  veil: DEFAULT_VEIL,
  dim: 0,
  continuationDim: 0.4,
  grain: 0.1,
  swatchBackground: SWATCH_BACKGROUND,
};

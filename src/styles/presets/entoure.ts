import { DEFAULT_SHADOW, DEFAULT_VEIL, SWATCH_BACKGROUND, WHITE } from "./common";
import type { StylePreset } from "./types";

/** Entouré : Inter extra-gras italique, mots clés entourés à la main en violet. */
export const entoure: StylePreset = {
  id: "entoure",
  name: "Entouré",
  description: "Italique extra-gras, mots clés entourés au feutre violet.",
  hook: { font: { fontId: "inter", weight: 800, style: "italic" }, size: 57, minSize: 46, lineHeight: 1.26, letterSpacing: -0.5 },
  body: { font: { fontId: "inter", weight: 800, style: "italic" }, size: 42, minSize: 34, lineHeight: 1.46, letterSpacing: -0.3 },
  colors: { text: WHITE, accent: "#D946EF" },
  marker: { kind: "cercle", color: "#D946EF" },
  shadow: DEFAULT_SHADOW,
  veil: DEFAULT_VEIL,
  dim: 0,
  continuationDim: 0.4,
  grain: 0.1,
  swatchBackground: SWATCH_BACKGROUND,
};

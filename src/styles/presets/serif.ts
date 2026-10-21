import { DEFAULT_SHADOW, DEFAULT_VEIL, SWATCH_BACKGROUND, WHITE } from "./common";
import type { StylePreset } from "./types";

/**
 * Serif : DM Serif Display, éditorial ; mots clés en rouge.
 * #C8323A est trop sombre sur photo voilée (≈ 2,6:1) : éclairci en #F0565C (≈ 4,6:1 sur fond sombre).
 */
export const serif: StylePreset = {
  id: "serif",
  name: "Serif",
  description: "Serif à fort contraste, éditorial, mots clés en rouge.",
  hook: { font: { fontId: "dm-serif-display", weight: 400, style: "normal" }, size: 68, minSize: 52, lineHeight: 1.08, letterSpacing: 0 },
  body: { font: { fontId: "dm-serif-display", weight: 400, style: "normal" }, size: 47, minSize: 38, lineHeight: 1.18, letterSpacing: 0 },
  colors: { text: WHITE, accent: "#F0565C" },
  marker: { kind: "couleur", color: "#F0565C" },
  shadow: DEFAULT_SHADOW,
  veil: DEFAULT_VEIL,
  dim: 0,
  continuationDim: 0.4,
  grain: 0.12,
  swatchBackground: SWATCH_BACKGROUND,
};

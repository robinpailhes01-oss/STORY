import { DEFAULT_SHADOW, DEFAULT_VEIL, SWATCH_BACKGROUND, WHITE } from "./common";
import type { StylePreset } from "./types";

/** Discret : petit serif blanc (Tinos), beaucoup d’air ; mots clés soulignés d’un trait fin crème. */
export const discret: StylePreset = {
  id: "discret",
  name: "Discret",
  description: "Petit serif blanc, sobre et aéré, mots clés soulignés finement.",
  hook: { font: { fontId: "tinos", weight: 400, style: "normal" }, size: 46, minSize: 38, lineHeight: 1.36, letterSpacing: 0.2 },
  body: { font: { fontId: "tinos", weight: 400, style: "normal" }, size: 35, minSize: 30, lineHeight: 1.56, letterSpacing: 0.2 },
  colors: { text: WHITE, accent: "#F3EDE2" },
  marker: { kind: "souligne", color: "#F3EDE2", underlineOffset: 0.11, underlineThickness: 0.05 },
  shadow: DEFAULT_SHADOW,
  veil: DEFAULT_VEIL,
  dim: 0,
  continuationDim: 0.4,
  grain: 0.12,
  swatchBackground: SWATCH_BACKGROUND,
};

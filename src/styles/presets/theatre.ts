import { DEFAULT_SHADOW, DEFAULT_VEIL, SWATCH_BACKGROUND } from "./common";
import type { StylePreset } from "./types";

/**
 * Théâtre : accroche et amorce en capitales didones dorées d’un bord à l’autre, mot géant rouge derrière
 * la personne, puis serif de livre droit et aéré.
 */
export const theatre: StylePreset = {
  id: "theatre",
  name: "Théâtre",
  description: "Capitales didones dorées, mot géant rouge derrière la personne, serif de livre aéré.",
  hook: {
    font: { fontId: "playfair-display", weight: 400, style: "normal" },
    size: 74,
    minSize: 54,
    lineHeight: 1.1,
    letterSpacing: 1.5,
    transform: "uppercase",
    color: "accent",
  },
  lead: {
    font: { fontId: "playfair-display", weight: 400, style: "normal" },
    size: 48,
    minSize: 38,
    lineHeight: 1.16,
    letterSpacing: 1,
    transform: "uppercase",
    color: "accent",
  },
  body: { font: { fontId: "tinos", weight: 400, style: "normal" }, size: 40, minSize: 33, lineHeight: 1.5, letterSpacing: 0.3 },
  giant: {
    font: { fontId: "abril-fatface", weight: 400, style: "normal" },
    size: 230,
    lineHeight: 1.02,
    letterSpacing: 0,
    color: "#E0141B",
    width: 1000,
  },
  colors: { text: "#F7F2E8", accent: "#D4AF37" },
  marker: { kind: "couleur", color: "#D4AF37" },
  shadow: DEFAULT_SHADOW,
  // Plus sombre que les autres styles : l’or #D4AF37 sur ciel voilé n’atteignait que 3:1.
  veil: { ...DEFAULT_VEIL, stops: [0.66, 0.56, 0.5, 0.58, 0.76] },
  dim: 0.1,
  continuationDim: 0.44,
  grain: 0.12,
  swatchBackground: SWATCH_BACKGROUND,
  hookWidth: 960,
  swatchRole: "hook",
};

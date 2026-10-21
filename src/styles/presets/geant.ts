import { DEFAULT_SHADOW, DEFAULT_VEIL, SWATCH_BACKGROUND, WHITE } from "./common";
import type { StylePreset } from "./types";

/**
 * Géant : amorce en Inter extra-gras, puis UN mot géant condensé vert (le premier mot clé de la story)
 * posé derrière la personne, puis le texte courant en Inter.
 */
export const geant: StylePreset = {
  id: "geant",
  name: "Géant",
  description: "Amorce en gras, un mot clé géant vert derrière la personne, puis texte courant.",
  hook: { font: { fontId: "inter", weight: 800, style: "normal" }, size: 54, minSize: 42, lineHeight: 1.2, letterSpacing: -0.5 },
  lead: { font: { fontId: "inter", weight: 800, style: "normal" }, size: 44, minSize: 36, lineHeight: 1.28, letterSpacing: -0.4 },
  body: { font: { fontId: "inter", weight: 400, style: "normal" }, size: 40, minSize: 33, lineHeight: 1.4, letterSpacing: -0.2 },
  giant: {
    font: { fontId: "anton", weight: 400, style: "normal" },
    size: 250,
    lineHeight: 1.04,
    letterSpacing: 2,
    color: "accent",
    width: 1000,
  },
  colors: { text: WHITE, accent: "#4ADE80" },
  marker: { kind: "couleur", color: "#4ADE80" },
  shadow: DEFAULT_SHADOW,
  veil: DEFAULT_VEIL,
  dim: 0,
  continuationDim: 0.4,
  grain: 0.1,
  swatchBackground: SWATCH_BACKGROUND,
  swatchRole: "giant",
};

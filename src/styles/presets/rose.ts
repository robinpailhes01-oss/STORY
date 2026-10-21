import { DEFAULT_SHADOW, DEFAULT_VEIL, SWATCH_BACKGROUND, WHITE } from "./common";
import type { StylePreset } from "./types";

/**
 * Rose : Inter extra-gras ; les marquages tournent d’un mot clé à l’autre sur toute la séquence :
 * pastille rose (texte noir dessus), puis ovale, puis souligné.
 */
export const rose: StylePreset = {
  id: "rose",
  name: "Rose",
  description: "Sans-serif extra-gras, marquages roses qui alternent : surligné, entouré, souligné.",
  hook: { font: { fontId: "inter", weight: 800, style: "normal" }, size: 58, minSize: 46, lineHeight: 1.22, letterSpacing: -0.5 },
  body: { font: { fontId: "inter", weight: 800, style: "normal" }, size: 42, minSize: 34, lineHeight: 1.4, letterSpacing: -0.3 },
  colors: { text: WHITE, accent: "#FF3D7F" },
  marker: { kind: "pastille", color: "#FF3D7F", textColor: "#000000", rotation: ["pastille", "cercle", "souligne"] },
  shadow: DEFAULT_SHADOW,
  veil: DEFAULT_VEIL,
  dim: 0,
  continuationDim: 0.4,
  grain: 0.1,
  swatchBackground: SWATCH_BACKGROUND,
};

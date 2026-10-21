import { DEFAULT_VEIL_COLOR, type HexColor, type TextShadow, type Veil } from "@/domain/story-document";

/**
 * Voile par défaut (5 arrêts : haut, quart, milieu, trois quarts, bas). Léger en haut et au milieu, là où
 * se trouve le texte, plus marqué en bas, comme sur la référence : la photo reste bien visible.
 */
export const DEFAULT_VEIL: Veil = { color: DEFAULT_VEIL_COLOR, stops: [0.5, 0.36, 0.34, 0.5, 0.72] };

/** Halo sombre discret sous le texte blanc (visible autour des lettres sur la référence). */
export const DEFAULT_SHADOW: TextShadow = { color: "#000000", blur: 16, opacity: 0.5, offsetY: 1 };

export const WHITE: HexColor = "#FFFFFF";
export const SWATCH_BACKGROUND: HexColor = "#15171F";

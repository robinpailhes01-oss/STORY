// Couleur d’accent choisie dans le panneau Style : remplace celle du style sans toucher au reste.
import type { HexColor } from "@/domain/story-document";
import type { StylePreset } from "./types";

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** Noir ou blanc, celui qui contraste le plus avec `background` (texte posé sur une pastille). */
export function readableTextOn(background: HexColor): HexColor {
  const l = luminance(background);
  const onBlack = (l + 0.05) / 0.05;
  const onWhite = 1.05 / (l + 0.05);
  return onBlack >= onWhite ? "#000000" : "#FFFFFF";
}

/** Couleur d’un rôle (accroche, amorce, corps, mot géant) : « accent » ou absente → couleur du style. */
export function resolveRoleColor(preset: StylePreset, color: HexColor | "accent" | undefined): HexColor {
  if (color === "accent") return preset.colors.accent;
  return color ?? preset.colors.text;
}

/**
 * Style avec la couleur d’accent remplacée : marquages, mots en couleur, rôles « accent » (accroche dorée de
 * Théâtre, mot géant de Géant). Sur une pastille, le texte passe en noir ou blanc selon la luminance ;
 * sur bandeau, la bande reste noire et ce sont les mots clés qui prennent la couleur.
 */
export function applyRenderOptions(preset: StylePreset, options: { accentColor?: HexColor | null }): StylePreset {
  const accent = options.accentColor;
  if (!accent) return preset;
  const marker = { ...preset.marker };
  if (marker.kind === "bandeau") {
    marker.textColor = accent;
  } else {
    marker.color = accent;
    const usesPastille = marker.kind === "pastille" || marker.rotation?.includes("pastille");
    if (usesPastille) marker.textColor = readableTextOn(accent);
  }
  return { ...preset, colors: { ...preset.colors, accent }, marker };
}

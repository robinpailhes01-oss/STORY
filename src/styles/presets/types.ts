import type { FontStyleName, FontWeight, HexColor, Marker, TextShadow, Veil } from "@/domain/story-document";

export interface FontChoice {
  fontId: string;
  weight: FontWeight;
  style: FontStyleName;
}

/** Réglages typographiques d’un rôle (accroche ou corps), en px du repère 1080 × 1920. */
export interface TypeSettings {
  font: FontChoice;
  /** Taille de départ. */
  size: number;
  /** Plancher de la réduction par paliers quand une scène ne tient pas. */
  minSize: number;
  lineHeight: number;
  letterSpacing: number;
}

/**
 * Un style = police(s) + marquage + couleurs + voile et grain.
 * La mise en page (colonne, ancrage, écarts) est commune : voir layout.ts.
 */
export interface StylePreset {
  id: string;
  /** Nom affiché (le nôtre). */
  name: string;
  description: string;
  hook: TypeSettings;
  body: TypeSettings;
  colors: {
    text: HexColor;
    /** Couleur d’accent (marquage). */
    accent: HexColor;
  };
  /** Marquage des accents ; rotationOffset est calculé à la composition. */
  marker: Omit<Marker, "rotationOffset">;
  shadow?: TextShadow;
  veil: Veil;
  /** Assombrissement uniforme des stories « première vue ». */
  dim: number;
  /** Assombrissement uniforme des stories « suite » (la référence assombrit la suite). */
  continuationDim: number;
  grain: number;
  /** Fond de la tuile du sélecteur de styles. */
  swatchBackground: HexColor;
}

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
  /** Couleur du texte de ce rôle ; « accent » = couleur d’accent (suit la couleur choisie). Défaut : colors.text. */
  color?: HexColor | "accent";
  /** Capitales au rendu. */
  transform?: "uppercase";
  /** Lettres seulement contourées : épaisseur du trait en tailles de police (ex. 0,035). */
  outline?: number;
}

/**
 * Mot géant (styles Géant et Théâtre) : le premier accent de la story (son mot le plus long), en très grand,
 * centré, posé derrière la personne détourée, entre l’amorce et le texte courant.
 */
export interface GiantSettings {
  font: FontChoice;
  /** Taille de départ (réduite avec la scène, puis pour tenir dans `width`). */
  size: number;
  lineHeight: number;
  letterSpacing: number;
  /** « accent » = couleur d’accent (suit la couleur choisie). */
  color: HexColor | "accent";
  /** Largeur maximale, centrée dans le cadre. */
  width: number;
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
  /** Amorce : premier paragraphe des stories 2 et 4 (corps sinon). */
  lead?: TypeSettings;
  giant?: GiantSettings;
  /** Inclinaison du texte en degrés (négatif = monte vers la droite), autour du centre de la scène. */
  tilt?: number;
  /** Largeur de la colonne de l’accroche (860 px sinon) ; plus large = « d’un bord à l’autre ». */
  hookWidth?: number;
  /** Rôle dont la tuile reprend la police et l’effet (corps par défaut). */
  swatchRole?: "hook" | "lead" | "body" | "giant";
}

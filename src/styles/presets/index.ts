// Styles disponibles, dans l’ordre de la grille de la référence. Ajouter un style = ajouter un fichier et l’inscrire ici.
import { bandeau } from "./bandeau";
import { discret } from "./discret";
import { dore } from "./dore";
import { entoure } from "./entoure";
import { feutre } from "./feutre";
import { fluo } from "./fluo";
import { geant } from "./geant";
import { liseret } from "./liseret";
import { lueur } from "./lueur";
import { massif } from "./massif";
import { orange } from "./orange";
import { roman } from "./roman";
import { rose } from "./rose";
import { serif } from "./serif";
import { theatre } from "./theatre";
import { trait } from "./trait";
import { turquoise } from "./turquoise";
import type { StylePreset } from "./types";

export type { FontChoice, GiantSettings, StylePreset, TypeSettings } from "./types";
export { STORY_LAYOUT } from "./layout";
export { applyRenderOptions, readableTextOn, resolveRoleColor } from "./options";

/**
 * Ordre de la grille de la référence (Underline, Autorité, Highlight, Dopamine, Mantra, Circle, Stabilo, Fondu,
 * Littérature, Encadré, Bloc, Mini, Néon, Titan, Contour, Marqueur, DRAMA), avec nos noms.
 */
export const STYLE_PRESETS: readonly StylePreset[] = [
  trait,
  dore,
  orange,
  rose,
  serif,
  entoure,
  fluo,
  turquoise,
  roman,
  bandeau,
  massif,
  discret,
  lueur,
  geant,
  liseret,
  feutre,
  theatre,
];

export const DEFAULT_STYLE_ID = dore.id;

export function getStyle(id: string): StylePreset {
  const style = STYLE_PRESETS.find((s) => s.id === id);
  if (!style) throw new Error(`Style inconnu : « ${id} »`);
  return style;
}

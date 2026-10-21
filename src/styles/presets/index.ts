// Styles disponibles, dans l’ordre du sélecteur. Ajouter un style = ajouter un fichier et l’inscrire ici.
import { bandeau } from "./bandeau";
import { dore } from "./dore";
import { entoure } from "./entoure";
import { fluo } from "./fluo";
import { orange } from "./orange";
import { roman } from "./roman";
import { rose } from "./rose";
import { serif } from "./serif";
import { trait } from "./trait";
import { turquoise } from "./turquoise";
import type { StylePreset } from "./types";

export type { FontChoice, StylePreset, TypeSettings } from "./types";
export { STORY_LAYOUT } from "./layout";

export const STYLE_PRESETS: readonly StylePreset[] = [dore, trait, orange, rose, serif, entoure, fluo, turquoise, roman, bandeau];

export const DEFAULT_STYLE_ID = dore.id;

export function getStyle(id: string): StylePreset {
  const style = STYLE_PRESETS.find((s) => s.id === id);
  if (!style) throw new Error(`Style inconnu : « ${id} »`);
  return style;
}

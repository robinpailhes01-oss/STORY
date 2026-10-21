// Saisie des mots mis en valeur : « Ça te fait *gagner quelques minutes.* Pas plus. »
// Le texte affiché dans le champ porte des astérisques ; le plan garde le texte brut + accents[].
import { accentRanges, type Paragraph } from "@/domain/story-plan";

/** Maximum de mots mis en valeur par story (contrat : 3 par paragraphe, méthode : 3 par story). */
export const MAX_ACCENTS_PER_STORY = 3;
export const MAX_PARAGRAPH_LENGTH = 320;

/** Paragraphe → texte avec astérisques autour de chaque accent trouvé. */
export function toMarkup(paragraph: Paragraph): string {
  const { ranges } = accentRanges(paragraph.text, paragraph.accents);
  let out = "";
  let cursor = 0;
  for (const r of ranges) {
    out += paragraph.text.slice(cursor, r.start) + "*" + paragraph.text.slice(r.start, r.end) + "*";
    cursor = r.end;
  }
  return out + paragraph.text.slice(cursor);
}

export interface ParsedMarkup {
  /** Texte sans astérisques (espaces de début et de fin retirés). */
  text: string;
  /** Expressions entre astérisques, dans l’ordre, sans doublon. */
  accents: string[];
  /** Un astérisque sans partenaire : il est retiré du texte. */
  unbalanced: boolean;
}

/** Texte avec astérisques → texte brut + accents. Un astérisque isolé est ignoré (et signalé). */
export function parseMarkup(markup: string): ParsedMarkup {
  const parts = markup.split("*");
  const unbalanced = parts.length % 2 === 0;
  let text = "";
  const accents: string[] = [];
  parts.forEach((part, i) => {
    const inside = i % 2 === 1 && !(unbalanced && i === parts.length - 1);
    text += part;
    const accent = part.trim();
    if (inside && accent && !accents.includes(accent)) accents.push(accent);
  });
  // Un paragraphe tient sur une ligne logique : les retours à la ligne deviennent des espaces.
  // Retirer les espaces de bord ne décale pas les accents : ils sont recherchés dans le texte.
  return { text: text.replace(/\s*\n\s*/g, " ").trim(), accents, unbalanced };
}

export interface StoryMarkupResult {
  paragraphs: Paragraph[];
  /** Accents au-delà du maximum : non retenus. */
  dropped: string[];
  /** Index des champs vides (non enregistrés). */
  empty: number[];
  unbalanced: number[];
}

/**
 * Les champs d’une story → paragraphes du plan. Les champs vides sont écartés (le contrat exige du texte),
 * les accents au-delà de MAX_ACCENTS_PER_STORY (sur toute la story) sont écartés et signalés.
 */
export function storyFromMarkup(fields: readonly string[]): StoryMarkupResult {
  const paragraphs: Paragraph[] = [];
  const dropped: string[] = [];
  const empty: number[] = [];
  const unbalanced: number[] = [];
  let count = 0;
  fields.forEach((field, i) => {
    const parsed = parseMarkup(field);
    if (parsed.unbalanced) unbalanced.push(i);
    if (!parsed.text) {
      empty.push(i);
      return;
    }
    const kept: string[] = [];
    for (const accent of parsed.accents) {
      if (count < MAX_ACCENTS_PER_STORY) {
        kept.push(accent.slice(0, 80));
        count++;
      } else dropped.push(accent);
    }
    paragraphs.push({ text: parsed.text.slice(0, MAX_PARAGRAPH_LENGTH), accents: kept });
  });
  return { paragraphs, dropped, empty, unbalanced };
}

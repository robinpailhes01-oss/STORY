// Règles du mode « J'ai mon texte » : le texte de l'auteur est découpé en 5 stories sans changer un mot et
// SANS couper une phrase. Un texte trop court pour cela est refusé avant tout appel à Claude.
import "server-only";
import type { GenerateRequest } from "@/domain/story-plan";
import { AiError } from "./errors";

/** Un texte en mode texte doit compter au moins 5 phrases (une par story) et 45 mots. */
export const TEXTE_MIN = { phrases: 5, mots: 45 } as const;

/**
 * Fin de phrase acceptée en fin de paragraphe : . ! ? … : ou parenthèse, crochet, guillemet fermants
 * (« (Le vrai travail, c'est ça) » se termine proprement).
 */
const SENTENCE_END = /[.!?…:)\]»”"]$/u;

export function endsSentence(text: string): boolean {
  return SENTENCE_END.test(text.trim());
}

/**
 * Phrases du texte : coupé après une fin de phrase suivie d'un espace ou d'un retour à la ligne, et à chaque
 * retour à la ligne (l'auteur a lui-même séparé ses lignes). Ce sont les seuls points de coupe autorisés.
 */
export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?…:)\]»”"])\s+|\n+/u)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
}

export function countWords(text: string): number {
  return text.split(/[^\p{L}\p{N}]+/u).filter(Boolean).length;
}

/**
 * Mode texte : refuse (400 « texte_trop_court ») un texte vide ou trop court pour remplir 5 stories sans
 * couper de phrase. Le message dit quoi faire : ajouter du texte ou passer en mode idée.
 */
export function assertTextUsable(request: Pick<GenerateRequest, "mode" | "idea">): void {
  if (request.mode !== "texte") return;
  const text = request.idea.trim();
  if (!text) {
    throw new AiError(
      "texte_trop_court",
      400,
      "Colle ton texte pour le découper en 5 stories, ou passe en mode « idée » pour que l'IA l'écrive à partir de ton profil.",
    );
  }
  const phrases = sentencesOf(text).length;
  const mots = countWords(text);
  if (phrases < TEXTE_MIN.phrases || mots < TEXTE_MIN.mots) {
    throw new AiError(
      "texte_trop_court",
      400,
      `Ton texte est trop court pour 5 stories sans couper de phrase (${phrases} phrase${phrases > 1 ? "s" : ""}, ${mots} mot${mots > 1 ? "s" : ""}) : il faut au moins ${TEXTE_MIN.phrases} phrases et ${TEXTE_MIN.mots} mots. Ajoute du texte, ou passe en mode « idée » pour que l'IA écrive la séquence.`,
    );
  }
}

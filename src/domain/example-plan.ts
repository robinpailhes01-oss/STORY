// Séquence de référence (docs/REFERENCE_EDITEUR_MOBILE.md §3) au format StoryPlan.
// Sert de mode démo (sans clé API), de réponse simulée (STORY_AI_MOCK=1) et d'exemple de ton.
import type { BrandContext, StoryPlan } from "./story-plan";

export const EXAMPLE_PLAN: StoryPlan = {
  schemaVersion: 1,
  structureId: "idee-recue",
  angle: "Le vrai gain de l'IA pour une PME n'est pas d'écrire plus vite mais d'automatiser ce qu'elle refait sans y penser.",
  stories: [
    {
      role: "accroche",
      paragraphs: [
        {
          text: "La plupart des PME utilisent l'IA pour écrire plus vite. Ce n'est pas là qu'est l'argent.",
          accents: ["l'IA", "l'argent"],
        },
      ],
    },
    {
      role: "reconnaissance",
      paragraphs: [
        { text: "Toi aussi tu demandes à l'IA de t'écrire ta légende Instagram ?", accents: [] },
        { text: "Ça te fait gagner quelques minutes. Pas plus.", accents: ["gagner quelques minutes."] },
        {
          text: "Pendant ce temps, il y a une autre tâche qui te bouffe des heures chaque semaine.",
          accents: ["des heures chaque semaine."],
        },
      ],
    },
    {
      role: "liste et cliffhanger",
      paragraphs: [
        { text: "Ce qui te coûte le plus de temps, c'est ce que tu refais sans y penser !", accents: ["sans y penser"] },
        {
          text: "Répondre aux mêmes questions clients. Relancer un devis resté sans réponse. Trier des mails.",
          accents: ["Répondre", "Relancer"],
        },
        { text: "Et ce n'est même pas la partie qui te fait gagner le plus de temps :", accents: [] },
      ],
    },
    {
      role: "bascule",
      paragraphs: [
        { text: "Chaque tâche que tu répètes peut devenir un automatisme géré sans toi.", accents: ["automatisme géré sans toi."] },
        { text: "(Le vrai travail, c'est de repérer laquelle en premier)", accents: [] },
        {
          text: "Celle qui revient le plus souvent, pas celle qui prend le plus de temps d'un coup.",
          accents: ["revient le plus souvent,"],
        },
      ],
    },
    {
      role: "appel à l'action",
      paragraphs: [
        { text: "Ce soir, note une seule tâche que tu refais cette semaine sans réfléchir.", accents: ["une seule tâche"] },
        { text: "C'est elle qu'il faut automatiser en premier.", accents: [] },
        { text: "Partenaire IA des PME à Montpellier, un audit est offert pour en discuter.", accents: ["audit est offert"] },
      ],
    },
  ],
};

/**
 * Contexte pré-rempli à partir de la séquence de référence de Robin (son propre positionnement,
 * visible et modifiable dans « Mon contexte »). Aucune preuve chiffrée : la liste reste vide.
 */
export const DEFAULT_CONTEXT: BrandContext = {
  name: "",
  activity: "Partenaire IA des PME à Montpellier",
  offer: "Audit offert pour repérer les tâches à automatiser en premier",
  target: "Dirigeants de PME et indépendants qui perdent des heures sur des tâches répétitives",
  cta: "Un audit est offert pour en discuter",
  tone: "Tutoiement, direct, familier sans être vulgaire, phrases courtes, pas d'emoji",
  proofs: [],
  forbidden: ["Découvrez", "N'hésitez pas", "Dans un monde où", "révolutionnaire"],
};

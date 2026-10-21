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
 * Contexte pré-rempli avec le profil de Robin (@luma_agence), visible et modifiable dans « Mon contexte ».
 * La preuve vient de sa séquence de référence (docs/REFERENCE_PARCOURS_COMPLET.md) et reste à confirmer.
 */
export const DEFAULT_CONTEXT: BrandContext = {
  name: "Robin",
  handle: "luma_agence",
  bio: "IA & relation client PME | Montpellier",
  activity: "Partenaire IA des PME à Montpellier (agence Luma) : agents IA et automatisations de la relation client",
  offer: "Audit offert pour repérer les tâches à automatiser en premier, puis mise en place d'agents IA branchés aux outils",
  target: "Dirigeants de PME et indépendants qui perdent des heures sur des tâches répétitives (questions clients, devis, relances, mails)",
  cta: "Un audit est offert pour en discuter",
  tone: "Tutoiement, direct, familier sans être vulgaire, phrases courtes, pas d'emoji",
  // Tirée de la séquence de référence générée à partir du profil de Robin : à confirmer par Robin.
  proofs: [
    "Chez Harmonie Yacht, un agent IA branché aux outils répond à ma place aux questions qui reviennent : 3 h gagnées chaque jour.",
  ],
  forbidden: ["Découvrez", "N'hésitez pas", "Dans un monde où", "révolutionnaire"],
  voiceExamples: [],
};

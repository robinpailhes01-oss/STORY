// Réponses simulées (STORY_AI_MOCK=1) : déterministes, sans aucun appel réseau, avec un léger délai
// pour que l'interface montre son état de chargement. Les contrôles réels sont appliqués.
import "server-only";
import { EXAMPLE_PLAN } from "@/domain/example-plan";
import type { GenerateRequest, GenerateResponse, IdeaSuggestion, IdeasResponse } from "@/domain/story-plan";
import { runControls } from "./controls";
import { METHODE_VERSION } from "./prompts/methode.v1";

export const MOCK_MODEL = "simulation";
export const MOCK_DELAY_MS = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 5 idées fixes, cohérentes avec DEFAULT_CONTEXT (partenaire IA des PME). */
export const MOCK_IDEAS: readonly IdeaSuggestion[] = [
  {
    idea: "Les devis envoyés puis oubliés : pourquoi une relance automatique fait revenir des clients sans paraître insistante.",
    structureId: "conseil",
    hook: "Ton devis n'a pas été refusé. Il a été oublié.",
  },
  {
    idea: "« L'IA, ce n'est pas pour les petites entreprises » : lui donner raison, puis montrer par où commencer petit.",
    structureId: "objection",
    hook: "« L'IA, c'est pour les grosses boîtes. » Sur un point, tu as raison.",
  },
  {
    idea: "Le matin où j'ai répondu trois fois à la même question client avant même d'ouvrir mes mails.",
    structureId: "histoire",
    hook: "Trois fois la même question. Avant même mon premier café.",
  },
  {
    idea: "Automatiser d'abord ce qui revient souvent, pas ce qui prend le plus de temps : ma façon de choisir la première tâche.",
    structureId: "methode",
    hook: "Tout le monde automatise la tâche la plus longue. C'est l'erreur.",
  },
  {
    idea: "Ce que je refuse de vendre aux PME : des outils d'IA que personne n'ouvrira plus au bout d'un mois.",
    structureId: "manifeste",
    hook: "Je ne te vendrai jamais un outil que ton équipe n'ouvrira plus.",
  },
];

export async function mockGeneratePlan(request: GenerateRequest): Promise<GenerateResponse> {
  const started = Date.now();
  await sleep(MOCK_DELAY_MS);
  const { plan, report } = runControls(structuredClone(EXAMPLE_PLAN), request);
  return {
    plan,
    controls: report,
    meta: { model: MOCK_MODEL, ms: Date.now() - started, repaired: false, mock: true, methodVersion: METHODE_VERSION },
  };
}

export async function mockGenerateIdeas(): Promise<IdeasResponse> {
  const started = Date.now();
  await sleep(MOCK_DELAY_MS);
  return {
    ideas: MOCK_IDEAS.map((idea) => ({ ...idea })),
    meta: { model: MOCK_MODEL, ms: Date.now() - started, mock: true },
  };
}

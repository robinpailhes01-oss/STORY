// Réponses simulées (STORY_AI_MOCK=1) : déterministes, sans aucun appel réseau, avec un léger délai
// pour que l'interface montre son état de chargement. Les contrôles réels sont appliqués.
import "server-only";
import { EXAMPLE_PLAN } from "@/domain/example-plan";
import type {
  GenerateRequest,
  GenerateResponse,
  IdeaSuggestion,
  IdeasResponse,
  PlanStory,
  RewriteStoryRequest,
} from "@/domain/story-plan";
import { runControls } from "./controls";
import { METHODE_VERSION } from "./prompts/methode.v2";
import { assembleRewrite, assertRewritable, finalizeRewrite } from "./rewrite";

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

/**
 * Variantes de « Refaire cette story » en mode simulé : pour chaque story de EXAMPLE_PLAN, la même idée
 * dite autrement (mêmes rôles, mêmes limites, aucun chiffre). Une deuxième demande revient à l'original.
 */
export const MOCK_REWRITES: readonly PlanStory[] = [
  {
    role: "accroche",
    paragraphs: [
      { text: "Écrire plus vite avec l'IA, tout le monde le fait. L'argent est ailleurs.", accents: ["L'argent est ailleurs."] },
    ],
  },
  {
    role: "reconnaissance",
    paragraphs: [
      { text: "Ta légende Instagram, tu la fais déjà écrire par l'IA ?", accents: [] },
      { text: "Quelques minutes de gagnées. C'est tout.", accents: ["Quelques minutes"] },
      { text: "Pendant ce temps, une autre tâche te prend des heures chaque semaine.", accents: ["des heures chaque semaine."] },
    ],
  },
  {
    role: "liste et cliffhanger",
    paragraphs: [
      { text: "Le temps perdu se cache dans ce que tu refais sans y penser.", accents: ["sans y penser."] },
      { text: "Répondre aux mêmes questions. Relancer les devis oubliés. Trier les mails du matin.", accents: ["Répondre", "Relancer"] },
      { text: "Et le plus gros gain n'est même pas là :", accents: [] },
    ],
  },
  {
    role: "bascule",
    paragraphs: [
      { text: "Tout ce que tu répètes peut tourner tout seul, sans toi.", accents: ["tourner tout seul,"] },
      { text: "(Le plus dur, c'est de choisir par laquelle commencer)", accents: [] },
      { text: "Prends celle qui revient le plus souvent, pas la plus longue.", accents: ["revient le plus souvent,"] },
    ],
  },
  {
    role: "appel à l'action",
    paragraphs: [
      { text: "Cette semaine, note une seule tâche que tu refais sans réfléchir.", accents: ["une seule tâche"] },
      { text: "C'est par elle qu'on commence.", accents: [] },
      { text: "Partenaire IA des PME à Montpellier : un audit est offert pour en discuter.", accents: ["audit est offert"] },
    ],
  },
];

/** Story refaite en mode simulé : la variante, ou l'original de EXAMPLE_PLAN si la variante est déjà affichée. */
export function mockRewrittenStory(request: RewriteStoryRequest): PlanStory {
  const variant = MOCK_REWRITES[request.storyIndex];
  const current = request.plan.stories[request.storyIndex];
  const same = JSON.stringify(current) === JSON.stringify(variant);
  return structuredClone(same ? EXAMPLE_PLAN.stories[request.storyIndex] : variant);
}

export async function mockRewriteStory(request: RewriteStoryRequest): Promise<GenerateResponse> {
  assertRewritable(request);
  const started = Date.now();
  await sleep(MOCK_DELAY_MS);
  const attempt = assembleRewrite(request, mockRewrittenStory(request));
  return {
    plan: finalizeRewrite(request, attempt),
    controls: attempt.report,
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

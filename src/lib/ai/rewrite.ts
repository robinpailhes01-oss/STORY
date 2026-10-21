// « Refaire cette story » : réécrit UNE story d'un plan existant. Le modèle ne renvoie que cette story ;
// le serveur la replace dans le plan d'entrée, dont les 4 autres stories sont reprises telles quelles
// (mêmes objets, donc mêmes octets en JSON). Contrôles sur toute la séquence, au plus une réparation.
import "server-only";
import {
  PlanStorySchema,
  type ControlIssue,
  type ControlReport,
  type GenerateResponse,
  type PlanStory,
  type RewriteStoryRequest,
  type StoryPlan,
} from "@/domain/story-plan";
import { isStructureId } from "@/domain/structures";
import { callClaude, type StructuredResult } from "./client";
import { MAX_TOKENS_STORY, MIN_REPAIR_BUDGET_MS, REQUEST_DEADLINE_MS } from "./config";
import { checkPlan, fixStory, isBlocking, toReport, wordsOf, type ControlInput } from "./controls";
import { AiError } from "./errors";
import type { GenerateOptions } from "./generate";
import { buildRewriteRepairUserText, buildRewriteUserText, buildSystem } from "./messages";
import { addUsage } from "./pricing";
import { METHODE_VERSION } from "./prompts/methode.v2";
import { ModelStorySchema, STORY_OUTPUT_FORMAT, toPlanStory } from "./schemas";

export interface RewriteAttempt {
  plan: StoryPlan;
  report: ControlReport;
  /** La story réécrite, après corrections automatiques. */
  story: PlanStory;
}

/** 400 si la séquence d'entrée ne peut pas servir de base (structure inconnue). */
export function assertRewritable(request: RewriteStoryRequest): void {
  if (!isStructureId(request.plan.structureId)) {
    throw new AiError("corps_invalide", 400, `Demande invalide : structure inconnue « ${request.plan.structureId} » dans la séquence.`);
  }
}

const planText = (plan: StoryPlan) => plan.stories.flatMap((s) => s.paragraphs.map((p) => p.text)).join(" ");

/**
 * Entrée des contrôles. Mode texte : la référence est le texte de l'auteur s'il correspond encore à la
 * séquence, sinon le texte actuel de la séquence (retouché dans l'éditeur) : la story refaite doit garder
 * ses mots.
 */
export function rewriteControlInput(request: RewriteStoryRequest): ControlInput {
  let idea = request.idea;
  if (request.mode === "texte") {
    const current = planText(request.plan);
    if (wordsOf(request.idea).join(" ") !== wordsOf(current).join(" ")) idea = current;
  }
  return { idea, mode: request.mode, context: request.context, structureId: request.plan.structureId, avoid: [] };
}

/** Replace la story refaite (corrigée sans changer le sens) dans le plan d'entrée, puis contrôle le tout. */
export function assembleRewrite(request: RewriteStoryRequest, story: PlanStory): RewriteAttempt {
  const index = request.storyIndex;
  const fixed = fixStory(story, index);
  const plan: StoryPlan = {
    ...request.plan,
    stories: request.plan.stories.map((original, i) => (i === index ? fixed.story : original)),
  };
  const report = toReport([...checkPlan(plan, rewriteControlInput(request)), ...fixed.issues]);
  return { plan, report, story: fixed.story };
}

/** Un problème que la réécriture de la story `index` peut corriger. */
export function concernsStory(issue: ControlIssue, index: number): boolean {
  return issue.story === index || issue.story === null || (issue.code === "scene_longue" && issue.story === index + 1);
}

const relevantBlocking = (attempt: RewriteAttempt, index: number) =>
  attempt.report.issues.filter((i) => isBlocking(i) && concernsStory(i, index));

const score = (attempt: RewriteAttempt, index: number) =>
  relevantBlocking(attempt, index).length * 100 +
  attempt.report.issues.filter((i) => !isBlocking(i) && concernsStory(i, index)).length;

function readStory(result: StructuredResult): PlanStory {
  const parsed = ModelStorySchema.safeParse(result.data);
  if (!parsed.success) {
    throw new AiError("plan_invalide", 502, "La story renvoyée par Claude n'a pas la forme attendue. Réessaie.");
  }
  return toPlanStory(parsed.data);
}

/** Vérifie que la story refaite peut être affichée ; le reste du plan est celui de l'entrée. */
export function finalizeRewrite(request: RewriteStoryRequest, attempt: RewriteAttempt): StoryPlan {
  const valid = PlanStorySchema.safeParse(attempt.story);
  if (!valid.success) {
    throw new AiError(
      "plan_invalide",
      502,
      "La nouvelle story ne peut pas être affichée (paragraphes trop nombreux ou trop longs, même après correction). Réessaie.",
      valid.error,
    );
  }
  return {
    ...request.plan,
    stories: request.plan.stories.map((original, i) => (i === request.storyIndex ? valid.data : original)),
  };
}

export async function rewriteStory(request: RewriteStoryRequest, options: GenerateOptions = {}): Promise<GenerateResponse> {
  assertRewritable(request);
  const index = request.storyIndex;
  const caller = options.caller ?? callClaude;
  const started = Date.now();
  const deadline = started + (options.deadlineMs ?? REQUEST_DEADLINE_MS);
  const signal = AbortSignal.timeout(Math.max(1, deadline - started));
  const system = buildSystem("story");

  const first = await caller({
    system,
    user: buildRewriteUserText(request),
    format: STORY_OUTPUT_FORMAT,
    maxTokens: MAX_TOKENS_STORY,
    signal,
  });
  let usage = first.usage;
  let cost = first.costUsd;
  let fallbackModel = first.fallbackModel;
  let model = first.model;

  let best = assembleRewrite(request, readStory(first));
  let repaired = false;

  const blocking = relevantBlocking(best, index);
  if (blocking.length) {
    if (deadline - Date.now() < MIN_REPAIR_BUDGET_MS) {
      best.report.issues.push({
        story: null,
        code: "reparation_non_tentee",
        severity: "conseil",
        message: "Pas assez de temps pour corriger automatiquement : les problèmes ci-dessus restent à revoir.",
      });
    } else {
      try {
        const second = await caller({
          system,
          user: buildRewriteRepairUserText(request, best.story, blocking),
          format: STORY_OUTPUT_FORMAT,
          maxTokens: MAX_TOKENS_STORY,
          signal,
        });
        usage = addUsage(usage, second.usage);
        cost = cost === null || second.costUsd === null ? null : cost + second.costUsd;
        fallbackModel = second.fallbackModel ?? fallbackModel;
        const candidate = assembleRewrite(request, readStory(second));
        if (score(candidate, index) <= score(best, index)) {
          best = candidate;
          repaired = true;
          model = second.model;
        }
      } catch (error) {
        // La première version reste utilisable : on la renvoie avec ses problèmes plutôt qu'une erreur.
        console.error("[ai] réparation de la story impossible", error instanceof AiError ? error.code : error);
        best.report.issues.push({
          story: null,
          code: "reparation_echouee",
          severity: "conseil",
          message: "La correction automatique a échoué : les problèmes ci-dessus restent à revoir.",
        });
      }
    }
  }

  return {
    plan: finalizeRewrite(request, best),
    controls: best.report,
    meta: {
      model,
      ms: Date.now() - started,
      repaired,
      mock: false,
      usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
      cache: { readTokens: usage.cacheReadTokens, writeTokens: usage.cacheWriteTokens },
      ...(cost === null ? {} : { costUsd: Math.round(cost * 1e6) / 1e6 }),
      ...(fallbackModel ? { fallbackModel } : {}),
      methodVersion: METHODE_VERSION,
    },
  };
}

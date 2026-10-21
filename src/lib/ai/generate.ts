// Écriture d'une séquence : un appel principal, les contrôles, puis au plus UNE réparation ciblée.
import "server-only";
import {
  StoryPlanSchema,
  type ControlIssue,
  type ControlReport,
  type GenerateRequest,
  type GenerateResponse,
  type StoryPlan,
} from "@/domain/story-plan";
import { isStructureId } from "@/domain/structures";
import { callClaude, type StructuredCaller, type StructuredResult } from "./client";
import { MAX_TOKENS_PLAN, MIN_REPAIR_BUDGET_MS, REQUEST_DEADLINE_MS } from "./config";
import { isBlocking, runControls } from "./controls";
import { AiError } from "./errors";
import { buildGenerateUserText, buildRepairUserText, buildSystem } from "./messages";
import { addUsage } from "./pricing";
import { METHODE_VERSION } from "./prompts/methode.v2";
import { ModelPlanSchema, PLAN_OUTPUT_FORMAT, toStoryPlan } from "./schemas";
import { assertTextUsable } from "./text-rules";

export interface GenerateOptions {
  /** Appel au modèle (par défaut : Claude). Injectable pour les tests et l'évaluation. */
  caller?: StructuredCaller;
  /** Budget total en millisecondes (génération + réparation). */
  deadlineMs?: number;
}

interface Attempt {
  plan: StoryPlan;
  report: ControlReport;
}

function readPlan(result: StructuredResult, request: GenerateRequest): StoryPlan {
  const parsed = ModelPlanSchema.safeParse(result.data);
  if (!parsed.success) {
    throw new AiError("plan_invalide", 502, "La séquence renvoyée par Claude n'a pas la forme attendue. Réessaie.");
  }
  const plan = toStoryPlan(parsed.data);
  // Une structure choisie par l'utilisateur prime sur celle déclarée par le modèle.
  if (request.structureId !== "auto" && isStructureId(request.structureId)) plan.structureId = request.structureId;
  return plan;
}

/** Garde la version d'origine des stories sans problème bloquant (la réparation ne doit pas y toucher). */
function keepUntouched(original: StoryPlan, repaired: StoryPlan, issues: readonly ControlIssue[]): StoryPlan {
  const faulty = new Set(issues.filter(isBlocking).map((i) => i.story));
  if (faulty.has(null)) return repaired;
  return {
    ...repaired,
    stories: repaired.stories.map((story, i) => (faulty.has(i) ? story : original.stories[i] ?? story)),
  };
}

const score = (report: ControlReport) =>
  report.issues.filter(isBlocking).length * 100 + report.issues.filter((i) => !isBlocking(i)).length;

export async function generatePlan(request: GenerateRequest, options: GenerateOptions = {}): Promise<GenerateResponse> {
  // Texte trop court en mode texte : 400 avant tout appel (aussi vérifié par la route).
  assertTextUsable(request);
  const caller = options.caller ?? callClaude;
  const started = Date.now();
  const deadline = started + (options.deadlineMs ?? REQUEST_DEADLINE_MS);
  const signal = AbortSignal.timeout(Math.max(1, deadline - started));
  const system = buildSystem("sequence");

  const first = await caller({
    system,
    user: buildGenerateUserText(request),
    format: PLAN_OUTPUT_FORMAT,
    maxTokens: MAX_TOKENS_PLAN,
    signal,
  });
  let usage = first.usage;
  let cost = first.costUsd;
  let fallbackModel = first.fallbackModel;
  let model = first.model;

  let best: Attempt = runControls(readPlan(first, request), request);
  let repaired = false;

  if (!best.report.ok) {
    const blocking = best.report.issues.filter(isBlocking);
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
          user: buildRepairUserText(request, best.plan, blocking),
          format: PLAN_OUTPUT_FORMAT,
          maxTokens: MAX_TOKENS_PLAN,
          signal,
        });
        usage = addUsage(usage, second.usage);
        cost = cost === null || second.costUsd === null ? null : cost + second.costUsd;
        fallbackModel = second.fallbackModel ?? fallbackModel;
        const candidate = runControls(keepUntouched(best.plan, readPlan(second, request), blocking), request);
        if (score(candidate.report) <= score(best.report)) {
          best = candidate;
          repaired = true;
          model = second.model;
        }
      } catch (error) {
        // La première version reste utilisable : on la renvoie avec ses problèmes plutôt qu'une erreur.
        console.error("[ai] réparation impossible", error instanceof AiError ? error.code : error);
        best.report.issues.push({
          story: null,
          code: "reparation_echouee",
          severity: "conseil",
          message: "La correction automatique a échoué : les problèmes ci-dessus restent à revoir.",
        });
      }
    }
  }

  const valid = StoryPlanSchema.safeParse(best.plan);
  if (!valid.success) {
    throw new AiError(
      "plan_invalide",
      502,
      "La séquence écrite par Claude ne peut pas être affichée (paragraphes trop nombreux ou trop longs, même après correction). Réessaie, ou raccourcis l'idée.",
      valid.error,
    );
  }

  return {
    plan: valid.data,
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


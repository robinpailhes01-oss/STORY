// Proposition de 5 idées de séquences, ancrées dans le contexte de marque.
import "server-only";
import type { IdeaSuggestion, IdeasRequest, IdeasResponse } from "@/domain/story-plan";
import { getStructure } from "@/domain/structures";
import { callClaude, type StructuredCaller } from "./client";
import { MAX_TOKENS_IDEAS, REQUEST_DEADLINE_MS } from "./config";
import { normalizeLoose } from "./controls";
import { AiError } from "./errors";
import { buildIdeasUserText, buildSystem } from "./messages";
import { ModelIdeasSchema, IDEAS_OUTPUT_FORMAT } from "./schemas";

export const IDEAS_COUNT = 5;
/** En dessous, la réponse est jugée inutilisable. */
const IDEAS_MIN = 3;

export interface IdeasOptions {
  caller?: StructuredCaller;
  deadlineMs?: number;
}

/** Nettoie les idées : vides, doublons, déjà proposées, structure « preuve » sans preuves. */
export function cleanIdeas(raw: readonly IdeaSuggestion[], request: IdeasRequest): IdeaSuggestion[] {
  const seen = new Set(request.avoid.map(normalizeLoose).filter(Boolean));
  const hasProofs = request.context.proofs.length > 0;
  const ideas: IdeaSuggestion[] = [];
  for (const item of raw) {
    const idea = item.idea.trim();
    const hook = item.hook.trim();
    const key = normalizeLoose(idea);
    if (!idea || !hook || seen.has(key)) continue;
    if (!hasProofs && getStructure(item.structureId).requiresProofs) continue;
    seen.add(key);
    ideas.push({ idea, structureId: item.structureId, hook });
    if (ideas.length === IDEAS_COUNT) break;
  }
  return ideas;
}

export async function generateIdeas(request: IdeasRequest, options: IdeasOptions = {}): Promise<IdeasResponse> {
  const caller = options.caller ?? callClaude;
  const started = Date.now();
  const result = await caller({
    system: buildSystem("idees"),
    user: buildIdeasUserText(request),
    format: IDEAS_OUTPUT_FORMAT,
    maxTokens: MAX_TOKENS_IDEAS,
    signal: AbortSignal.timeout(options.deadlineMs ?? REQUEST_DEADLINE_MS),
  });
  const parsed = ModelIdeasSchema.safeParse(result.data);
  if (!parsed.success) {
    throw new AiError("idees_invalides", 502, "Les idées renvoyées par Claude n'ont pas la forme attendue. Réessaie.");
  }
  const ideas = cleanIdeas(parsed.data.ideas, request);
  if (ideas.length < IDEAS_MIN) {
    throw new AiError("idees_insuffisantes", 502, "Claude n'a pas proposé assez d'idées nouvelles. Réessaie.");
  }
  return {
    ideas,
    meta: {
      model: result.model,
      ms: Date.now() - started,
      mock: false,
      usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens },
      ...(result.costUsd === null ? {} : { costUsd: result.costUsd }),
      ...(result.fallbackModel ? { fallbackModel: result.fallbackModel } : {}),
    },
  };
}

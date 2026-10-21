// Client Claude, côté serveur uniquement : la clé API ne quitte jamais le serveur.
// Un appel = une sortie structurée (JSON Schema), non streamée, avec repli serveur en cas de refus.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage, BetaTextBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { FALLBACK_BETA, MAX_RETRIES, readAiConfig, REQUEST_TIMEOUT_MS, type AiConfig } from "./config";
import { AiError } from "./errors";
import { addUsage, estimateCostUsd, ZERO_USAGE, type TokenUsage } from "./pricing";
import type { JsonOutputFormat } from "./schemas";

export interface StructuredCall {
  system: BetaTextBlockParam[];
  user: string;
  format: JsonOutputFormat;
  maxTokens: number;
  /** Arrêt global (budget de la requête HTTP), en plus du délai par tentative. */
  signal?: AbortSignal;
}

export interface StructuredResult {
  /** JSON lu dans la réponse, à valider par l'appelant. */
  data: unknown;
  /** Modèle qui a produit la réponse (celui du repli le cas échéant). */
  model: string;
  usage: TokenUsage;
  costUsd: number | null;
  /** Renseigné si le modèle demandé a refusé et qu'un modèle de repli a répondu. */
  fallbackModel?: string;
}

/** Fonction d'appel injectable (tests, évaluation). */
export type StructuredCaller = (call: StructuredCall) => Promise<StructuredResult>;

let cached: { key: string; client: Anthropic } | null = null;

function getClient(config: AiConfig): Anthropic {
  if (cached?.key !== config.apiKey) {
    cached = {
      key: config.apiKey,
      client: new Anthropic({ apiKey: config.apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: MAX_RETRIES }),
    };
  }
  return cached.client;
}

/** Usage et coût, tentative par tentative quand le repli a servi (chaque tentative à son propre prix). */
function readUsage(message: BetaMessage, requestedModel: string): { usage: TokenUsage; costUsd: number | null } {
  const iterations = message.usage.iterations?.filter(
    (it): it is Extract<typeof it, { type: "message" | "fallback_message" }> =>
      it.type === "message" || it.type === "fallback_message",
  );
  const parts = iterations?.length
    ? iterations.map((it) => ({
        model: it.model ?? requestedModel,
        usage: {
          inputTokens: it.input_tokens,
          outputTokens: it.output_tokens,
          cacheReadTokens: it.cache_read_input_tokens,
          cacheWriteTokens: it.cache_creation_input_tokens,
        },
      }))
    : [
        {
          model: message.model,
          usage: {
            inputTokens: message.usage.input_tokens,
            outputTokens: message.usage.output_tokens,
            cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
            cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
          },
        },
      ];
  let usage = ZERO_USAGE;
  let cost: number | null = 0;
  for (const part of parts) {
    usage = addUsage(usage, part.usage);
    const partCost = estimateCostUsd(part.model, part.usage);
    cost = cost === null || partCost === null ? null : cost + partCost;
  }
  return { usage, costUsd: cost === null ? null : Math.round(cost * 1e6) / 1e6 };
}

/** Lit la réponse : stop_reason d'abord, contenu ensuite. */
export function readStructuredMessage(message: BetaMessage, requestedModel: string): StructuredResult {
  switch (message.stop_reason) {
    case "end_turn":
      break;
    case "refusal": {
      const category = message.stop_details?.category;
      throw new AiError(
        "refus",
        422,
        `Claude a refusé d'écrire ce contenu${category ? ` (catégorie « ${category} »)` : ""}, y compris après le repli sur un autre modèle. Reformule l'idée ou change de structure.`,
      );
    }
    case "max_tokens":
    case "model_context_window_exceeded":
      throw new AiError(
        "reponse_tronquee",
        502,
        "La réponse de Claude a été coupée avant la fin. Réessaie ; si cela se répète, raccourcis l'idée ou le texte.",
      );
    default:
      throw new AiError("reponse_inattendue", 502, `Claude s'est arrêté de façon inattendue (« ${message.stop_reason} »).`);
  }

  const text = message.content
    .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AiError("reponse_illisible", 502, "La réponse de Claude n'est pas un JSON lisible. Réessaie.");
  }

  const fallbackRan = (message.usage.iterations ?? []).some((it) => it.type === "fallback_message");
  const { usage, costUsd } = readUsage(message, requestedModel);
  return {
    data,
    model: message.model,
    usage,
    costUsd,
    ...(fallbackRan ? { fallbackModel: message.model } : {}),
  };
}

/**
 * Appel réel à Claude. Sur Claude Opus 5.5 : pas de `thinking` (toujours actif, `disabled` et
 * `budget_tokens` sont refusés), pas de `temperature`, pas de préremplissage ; l'effort est explicite.
 * Le repli `fallbacks: "default"` relance un refus sur le modèle recommandé, dans le même appel ;
 * il n'existe que sur `client.beta.messages` (beta server-side-fallback-2026-07-01).
 * On appelle `create` et non `parse` : `parse` lit le JSON de chaque bloc texte dès la réponse reçue et
 * lève une erreur sur une réponse refusée ou tronquée, avant qu'on ait pu tester stop_reason.
 */
export const callClaude: StructuredCaller = async (call) => {
  const config = readAiConfig();
  const client = getClient(config);
  const message = await client.beta.messages.create(
    {
      model: config.model,
      max_tokens: call.maxTokens,
      ...(config.fallbacks ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
      system: call.system,
      messages: [{ role: "user", content: call.user }],
      output_config: { effort: config.effort, format: call.format },
    },
    { signal: call.signal },
  );
  return readStructuredMessage(message, config.model);
};

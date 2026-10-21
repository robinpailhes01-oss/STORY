// Réglages lus dans l'environnement du serveur. Une valeur invalide est une erreur visible, jamais ignorée.
import "server-only";
import { AiError } from "./errors";

export const DEFAULT_MODEL = "claude-opus-5-5";
export const DEFAULT_EFFORT = "medium";
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

/** Délai d'un appel (par tentative) et nombre de nouvelles tentatives du SDK. */
export const REQUEST_TIMEOUT_MS = 90_000;
export const MAX_RETRIES = 2;
/** Plafond de sortie d'un appel non streamé (réflexion comprise). */
export const MAX_TOKENS_PLAN = 16_000;
export const MAX_TOKENS_IDEAS = 8_000;
/** Budget total d'une requête HTTP (génération + réparation), sous le maxDuration des routes (120 s). */
export const REQUEST_DEADLINE_MS = 110_000;
/** Temps minimal restant pour tenter la réparation. */
export const MIN_REPAIR_BUDGET_MS = 25_000;

/** Beta du repli serveur en cas de refus, forme `fallbacks: "default"`. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export interface AiConfig {
  apiKey: string;
  model: string;
  effort: Effort;
}

/** true si les réponses doivent être simulées (STORY_AI_MOCK=1), sans aucun appel réseau. */
export function isMockMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.STORY_AI_MOCK === "1";
}

export function readAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new AiError(
      "cle_absente",
      503,
      "L'écriture par l'IA n'est pas configurée : ajoute ANTHROPIC_API_KEY=… dans .env.local (ou dans les variables d'environnement Vercel), puis redémarre le serveur. En attendant, le mode démo charge la séquence de référence.",
    );
  }
  const model = env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const rawEffort = env.ANTHROPIC_EFFORT?.trim() || DEFAULT_EFFORT;
  if (!(EFFORTS as readonly string[]).includes(rawEffort)) {
    throw new AiError(
      "config_invalide",
      500,
      `ANTHROPIC_EFFORT vaut « ${rawEffort} » : valeurs possibles ${EFFORTS.join(", ")}.`,
    );
  }
  return { apiKey, model, effort: rawEffort as Effort };
}

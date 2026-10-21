// Outils communs aux routes /api/generations et /api/ideas : lecture du corps, validation, erreurs.
import "server-only";
import type { z } from "zod";
import { AiError, toAiError } from "./errors";
import { clientIp, hitRateLimit, type RateLimit } from "./rate-limit";

export const MAX_BODY_BYTES = 30 * 1024;

const NO_STORE = { "Cache-Control": "no-store" };

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

/** Lit un corps JSON de 30 Ko au plus. */
export async function readJsonBody(request: Request): Promise<unknown> {
  const tooLarge = () =>
    new AiError("trop_volumineux", 413, `La demande est trop volumineuse (${MAX_BODY_BYTES / 1024} Ko au plus).`);
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw tooLarge();
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw tooLarge();
  if (!text.trim()) throw new AiError("corps_invalide", 400, "La demande est vide : un corps JSON est attendu.");
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError("json_invalide", 400, "La demande n'est pas un JSON valide.");
  }
}

const FIELD_NAMES: Record<string, string> = {
  idea: "l'idée",
  mode: "le mode",
  structureId: "la structure",
  context: "le contexte",
  avoid: "la liste à éviter",
  theme: "le thème",
  proofs: "les preuves",
  forbidden: "les mots interdits",
};

const TYPE_NAMES: Record<string, string> = {
  string: "du texte",
  array: "une liste",
  object: "un objet",
  number: "un nombre",
  boolean: "vrai ou faux",
};

function valueAt(body: unknown, path: readonly PropertyKey[]): unknown {
  let value = body;
  for (const key of path) {
    if (value === null || typeof value !== "object") return undefined;
    value = (value as Record<PropertyKey, unknown>)[key];
  }
  return value;
}

function describeIssue(issue: z.core.$ZodIssue, body: unknown): string {
  const path = issue.path.map(String);
  const last = path.filter((p) => !/^\d+$/.test(p)).at(-1);
  const field = last ? (FIELD_NAMES[last] ?? `le champ « ${path.join(".")} »`) : "la demande";
  switch (issue.code) {
    case "too_small":
      return issue.origin === "array"
        ? `${field} : pas assez d'éléments (au moins ${issue.minimum})`
        : `${field} : trop court (au moins ${issue.minimum} caractères)`;
    case "too_big":
      return issue.origin === "array"
        ? `${field} : trop d'éléments (${issue.maximum} au plus)`
        : `${field} : trop long (${issue.maximum} caractères au plus)`;
    case "invalid_type":
      return valueAt(body, issue.path) === undefined
        ? `${field} : champ manquant`
        : `${field} : ${TYPE_NAMES[issue.expected] ?? issue.expected} attendu`;
    case "invalid_value":
      return `${field} : valeur non autorisée (${issue.values.map(String).join(", ")})`;
    default:
      return `${field} : valeur invalide`;
  }
}

/** Valide le corps ; 400 avec un message en français qui nomme les champs fautifs. */
export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const details = result.error.issues.slice(0, 3).map((issue) => describeIssue(issue, body)).join(" ; ");
  throw new AiError("corps_invalide", 400, `Demande invalide : ${details}.`);
}

export function enforceRateLimit(request: Request, bucket: string, limit: RateLimit): void {
  const hit = hitRateLimit(bucket, clientIp(request), limit);
  if (!hit.ok) {
    throw Object.assign(
      new AiError(
        "trop_de_demandes",
        429,
        `Trop de demandes en peu de temps (${limit.limit} par ${limit.windowMs / 60_000} minutes). Réessaie dans ${Math.ceil(hit.retryAfterSec / 60)} min.`,
      ),
      { retryAfterSec: hit.retryAfterSec },
    );
  }
}

/** Exécute une route et transforme toute erreur en réponse ApiError (jamais de détail technique ni de clé). */
export async function handleRoute(name: string, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    const aiError = toAiError(error);
    if (aiError.status >= 500) console.error(`[api/${name}] ${aiError.code}`, aiError.cause ?? "");
    const retryAfter = (error as { retryAfterSec?: number }).retryAfterSec;
    return jsonResponse(aiError.toBody(), aiError.status, retryAfter ? { "Retry-After": String(retryAfter) } : {});
  }
}

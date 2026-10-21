// Appels aux deux routes de l’application. Seul src/domain/* est importé (jamais src/lib/ai, serveur).
import type { ApiError, GenerateRequest, GenerateResponse, IdeasRequest, IdeasResponse, RewriteStoryRequest } from "@/domain/story-plan";

export interface ApiFailure {
  ok: false;
  status: number;
  /** Code stable de l’API (« cle_absente », « trop_de_demandes »…) ou « reseau » / « annule ». */
  code: string;
  /** Message en français, à afficher tel quel. */
  message: string;
  /** Secondes avant de pouvoir réessayer (429). */
  retryAfterSec?: number;
}

export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

function isApiError(body: unknown): body is ApiError {
  const error = (body as ApiError | null)?.error;
  return !!error && typeof error.code === "string" && typeof error.message === "string";
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      return { ok: false, status: 0, code: "annule", message: "Génération annulée." };
    }
    return {
      ok: false,
      status: 0,
      code: "reseau",
      message: "Impossible de joindre le serveur. Vérifie ta connexion, puis réessaie.",
    };
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    if (signal?.aborted) return { ok: false, status: 0, code: "annule", message: "Génération annulée." };
    payload = null;
  }
  if (response.ok && payload !== null && !isApiError(payload)) return { ok: true, data: payload as T };
  const retryHeader = Number(response.headers.get("Retry-After"));
  const retryAfterSec = Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : undefined;
  if (isApiError(payload)) {
    return { ok: false, status: response.status, code: payload.error.code, message: payload.error.message, retryAfterSec };
  }
  return {
    ok: false,
    status: response.status,
    code: "reponse_illisible",
    message: `Le serveur a répondu de façon inattendue (erreur ${response.status}). Réessaie dans un instant.`,
    retryAfterSec,
  };
}

export function requestGeneration(request: GenerateRequest, signal?: AbortSignal) {
  return post<GenerateResponse>("/api/generations", request, signal);
}

/** « Refaire cette story » : seule stories[storyIndex] change dans la réponse. */
export function requestRewrite(request: RewriteStoryRequest, signal?: AbortSignal) {
  return post<GenerateResponse>("/api/generations/story", request, signal);
}

export function requestIdeas(request: IdeasRequest, signal?: AbortSignal) {
  return post<IdeasResponse>("/api/ideas", request, signal);
}

/** « dans 3 min », « dans 40 s » : délai lisible avant de réessayer. */
export function retryDelayLabel(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)} s`;
  return `${Math.ceil(seconds / 60)} min`;
}

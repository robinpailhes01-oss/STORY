// Erreurs du moteur d'écriture : un code stable, un statut HTTP et un message en français, lisible
// par l'utilisateur. Les erreurs du SDK Anthropic sont traduites ici, par classe (jamais par texte).
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ApiError } from "@/domain/story-plan";

export class AiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AiError";
  }

  toBody(): ApiError {
    return { error: { code: this.code, message: this.message } };
  }
}

/** Traduit une erreur quelconque (SDK, délai, inattendue) en AiError. */
export function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  // Ordre : du plus précis au plus général (les classes héritent d'APIError).
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiError("delai_depasse", 504, "Claude a mis trop de temps à répondre. Réessaie dans un instant.", error);
  }
  if (error instanceof Anthropic.APIUserAbortError) {
    return new AiError(
      "delai_depasse",
      504,
      "La génération a dépassé le temps maximal autorisé. Réessaie, ou raccourcis l'idée.",
      error,
    );
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiError("connexion", 504, "Impossible de joindre Claude (connexion réseau). Réessaie dans un instant.", error);
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return new AiError(
      "cle_invalide",
      500,
      "La clé API Anthropic est refusée. Vérifie ANTHROPIC_API_KEY dans .env.local (ou dans les variables Vercel), puis redémarre le serveur.",
      error,
    );
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new AiError(
      "acces_refuse",
      500,
      "La clé API Anthropic n'a pas accès à ce modèle ou à cette fonction. Vérifie les droits de la clé dans la console Anthropic.",
      error,
    );
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new AiError(
      "modele_introuvable",
      500,
      "Le modèle demandé est introuvable. Vérifie ANTHROPIC_MODEL (par défaut : claude-opus-5-5).",
      error,
    );
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiError(
      "trop_de_demandes",
      429,
      "Trop de demandes envoyées à Claude en peu de temps. Attends une minute avant de réessayer.",
      error,
    );
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AiError(
      "requete_refusee",
      500,
      "Claude a refusé la forme de la requête (erreur de configuration du serveur). Le détail est dans les journaux du serveur.",
      error,
    );
  }
  if (error instanceof Anthropic.APIError && (error.status === 529 || (error.status ?? 0) >= 500)) {
    return new AiError("indisponible", 503, "Claude est momentanément surchargé ou indisponible. Réessaie dans quelques minutes.", error);
  }
  if (error instanceof Anthropic.APIError) {
    return new AiError("erreur_ia", 502, `Claude a renvoyé une erreur inattendue (statut ${error.status ?? "inconnu"}).`, error);
  }
  return new AiError("erreur_interne", 500, "Erreur interne du serveur pendant la génération.", error);
}

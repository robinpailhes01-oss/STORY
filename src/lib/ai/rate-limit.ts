// Limite de débit simple, en mémoire, par adresse IP. Suffisant pour un outil interne sur une instance ;
// chaque instance serverless a son propre compteur (ce n'est pas une protection forte).
import "server-only";

export interface RateLimit {
  limit: number;
  windowMs: number;
}

export const GENERATIONS_LIMIT: RateLimit = { limit: 20, windowMs: 10 * 60_000 };
export const IDEAS_LIMIT: RateLimit = { limit: 30, windowMs: 10 * 60_000 };

const buckets = new Map<string, number[]>();

/** Enregistre une demande ; renvoie le délai d'attente en secondes si la limite est atteinte. */
export function hitRateLimit(
  bucket: string,
  key: string,
  { limit, windowMs }: RateLimit,
  now: number = Date.now(),
): { ok: true } | { ok: false; retryAfterSec: number } {
  const id = `${bucket}:${key}`;
  const recent = (buckets.get(id) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(id, recent);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
  }
  recent.push(now);
  buckets.set(id, recent);
  // Ménage occasionnel pour que la table ne grossisse pas indéfiniment.
  if (buckets.size > 5_000) {
    for (const [k, times] of buckets) if (times.every((t) => now - t >= windowMs)) buckets.delete(k);
  }
  return { ok: true };
}

/** Pour les tests. */
export function resetRateLimits(): void {
  buckets.clear();
}

/** Adresse du client, d'après les en-têtes posés par le proxy (Vercel, local). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "inconnue";
}

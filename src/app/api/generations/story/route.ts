// POST /api/generations/story : « Refaire cette story » (RewriteStoryRequest → GenerateResponse).
// Seule stories[storyIndex] change ; les 4 autres sont renvoyées telles qu'elles ont été reçues.
import { RewriteStoryRequestSchema } from "@/domain/story-plan";
import { isMockMode, readAiConfig } from "@/lib/ai/config";
import { enforceRateLimit, handleRoute, jsonResponse, parseBody, readJsonBody } from "@/lib/ai/http";
import { mockRewriteStory } from "@/lib/ai/mock";
import { REWRITES_LIMIT } from "@/lib/ai/rate-limit";
import { assertRewritable, rewriteStory } from "@/lib/ai/rewrite";

/** Réécriture + réparation éventuelle : jusqu'à deux appels à Claude. */
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  return handleRoute("generations/story", async () => {
    const body = parseBody(RewriteStoryRequestSchema, await readJsonBody(request));
    assertRewritable(body);
    if (isMockMode()) return jsonResponse(await mockRewriteStory(body));
    readAiConfig(); // 503 explicite si la clé manque, avant de compter la demande.
    enforceRateLimit(request, "rewrites", REWRITES_LIMIT);
    return jsonResponse(await rewriteStory(body));
  });
}

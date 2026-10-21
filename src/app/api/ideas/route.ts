// POST /api/ideas : propose 5 idées de séquences (IdeasRequest → IdeasResponse).
import { IdeasRequestSchema } from "@/domain/story-plan";
import { isMockMode, readAiConfig } from "@/lib/ai/config";
import { enforceRateLimit, handleRoute, jsonResponse, parseBody, readJsonBody } from "@/lib/ai/http";
import { generateIdeas } from "@/lib/ai/ideas";
import { mockGenerateIdeas } from "@/lib/ai/mock";
import { IDEAS_LIMIT } from "@/lib/ai/rate-limit";

export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  return handleRoute("ideas", async () => {
    const body = parseBody(IdeasRequestSchema, await readJsonBody(request));
    if (isMockMode()) return jsonResponse(await mockGenerateIdeas());
    readAiConfig();
    enforceRateLimit(request, "ideas", IDEAS_LIMIT);
    return jsonResponse(await generateIdeas(body));
  });
}

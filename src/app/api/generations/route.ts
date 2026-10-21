// POST /api/generations : écrit une séquence de 5 stories (GenerateRequest → GenerateResponse).
import { GenerateRequestSchema } from "@/domain/story-plan";
import { isStructureId } from "@/domain/structures";
import { isMockMode, readAiConfig } from "@/lib/ai/config";
import { AiError } from "@/lib/ai/errors";
import { generatePlan } from "@/lib/ai/generate";
import { enforceRateLimit, handleRoute, jsonResponse, parseBody, readJsonBody } from "@/lib/ai/http";
import { mockGeneratePlan } from "@/lib/ai/mock";
import { GENERATIONS_LIMIT } from "@/lib/ai/rate-limit";

/** Génération + réparation éventuelle : jusqu'à deux appels à Claude. */
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  return handleRoute("generations", async () => {
    const body = parseBody(GenerateRequestSchema, await readJsonBody(request));
    if (body.structureId !== "auto" && !isStructureId(body.structureId)) {
      throw new AiError("corps_invalide", 400, `Demande invalide : structure inconnue « ${body.structureId} ».`);
    }
    if (isMockMode()) return jsonResponse(await mockGeneratePlan(body));
    readAiConfig(); // 503 explicite si la clé manque, avant de compter la demande.
    enforceRateLimit(request, "generations", GENERATIONS_LIMIT);
    return jsonResponse(await generatePlan(body));
  });
}

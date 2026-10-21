import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONTEXT } from "@/domain/example-plan";
import type { ApiError, IdeasResponse } from "@/domain/story-plan";
import { isStructureId } from "@/domain/structures";
import { resetRateLimits } from "@/lib/ai/rate-limit";
import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/ideas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  resetRateLimits();
  vi.stubGlobal("fetch", () => Promise.reject(new Error("appel réseau interdit dans les tests")));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/ideas", () => {
  it("200 en mode simulé : 5 idées variées et cohérentes avec le contexte par défaut", async () => {
    vi.stubEnv("STORY_AI_MOCK", "1");
    const res = await post({ context: DEFAULT_CONTEXT });
    expect(res.status).toBe(200);
    const body = (await res.json()) as IdeasResponse;
    expect(body.ideas).toHaveLength(5);
    expect(body.meta.mock).toBe(true);
    for (const idea of body.ideas) {
      expect(isStructureId(idea.structureId)).toBe(true);
      expect(idea.structureId).not.toBe("preuve");
      expect(idea.hook.split(/\s+/).length).toBeLessThanOrEqual(20);
      expect(idea.idea + idea.hook).not.toMatch(/\d/);
    }
    expect(new Set(body.ideas.map((i) => i.structureId)).size).toBeGreaterThanOrEqual(4);
  });

  it("400 si le corps est invalide", async () => {
    vi.stubEnv("STORY_AI_MOCK", "1");
    const res = await post({ theme: 42 });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiError;
    expect(body.error.code).toBe("corps_invalide");
    expect(body.error.message).toContain("le thème");
  });

  it("503 sans clé ni simulation", async () => {
    vi.stubEnv("STORY_AI_MOCK", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const res = await post({});
    expect(res.status).toBe(503);
    expect(((await res.json()) as ApiError).error.code).toBe("cle_absente");
  });
});

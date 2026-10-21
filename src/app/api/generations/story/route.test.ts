import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONTEXT, EXAMPLE_PLAN } from "@/domain/example-plan";
import { StoryPlanSchema, type ApiError, type GenerateResponse } from "@/domain/story-plan";
import { MOCK_REWRITES } from "@/lib/ai/mock";
import { resetRateLimits } from "@/lib/ai/rate-limit";
import { maxDuration, POST } from "./route";

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost/api/generations/story", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const VALID = { plan: EXAMPLE_PLAN, storyIndex: 2, context: DEFAULT_CONTEXT };

beforeEach(() => {
  resetRateLimits();
  vi.stubGlobal("fetch", () => Promise.reject(new Error("appel réseau interdit dans les tests")));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/generations/story, mode simulé", () => {
  beforeEach(() => {
    vi.stubEnv("STORY_AI_MOCK", "1");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
  });

  it("200 : seule la story demandée change ; les 4 autres sont identiques à l'octet près", async () => {
    for (let storyIndex = 0; storyIndex < 5; storyIndex++) {
      const res = await post({ ...VALID, storyIndex, instruction: "plus court" });
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const body = (await res.json()) as GenerateResponse;
      expect(StoryPlanSchema.safeParse(body.plan).success).toBe(true);
      expect(body.plan.stories[storyIndex]).toEqual(MOCK_REWRITES[storyIndex]);
      expect(body.plan.stories[storyIndex]).not.toEqual(EXAMPLE_PLAN.stories[storyIndex]);
      for (let i = 0; i < 5; i++) {
        if (i !== storyIndex) expect(JSON.stringify(body.plan.stories[i])).toBe(JSON.stringify(EXAMPLE_PLAN.stories[i]));
      }
      expect(body.plan.angle).toBe(EXAMPLE_PLAN.angle);
      expect(body.plan.structureId).toBe(EXAMPLE_PLAN.structureId);
      expect(body.controls.ok).toBe(true);
      expect(body.meta).toMatchObject({ mock: true, repaired: false, model: "simulation", methodVersion: "v2" });
    }
  });

  it("déterministe : une deuxième demande sur la variante revient à l'original", async () => {
    const first = (await (await post(VALID)).json()) as GenerateResponse;
    const second = (await (await post({ ...VALID, plan: first.plan })).json()) as GenerateResponse;
    expect(second.plan).toEqual(EXAMPLE_PLAN);
  });

  it("contrôles réels sur toute la séquence", async () => {
    const res = await post({ ...VALID, context: { ...DEFAULT_CONTEXT, forbidden: ["PME"] } });
    const body = (await res.json()) as GenerateResponse;
    expect(body.controls.ok).toBe(false);
    expect(body.controls.issues.filter((i) => i.code === "mot_interdit").map((i) => i.story)).toEqual([0, 4]);
  });

  it("400 : storyIndex hors bornes ou absent, avec un message en français", async () => {
    for (const storyIndex of [5, -1, 1.5, "2", undefined]) {
      const res = await post({ ...VALID, storyIndex });
      expect(res.status).toBe(400);
      const body = (await res.json()) as ApiError;
      expect(body.error.code).toBe("corps_invalide");
      expect(body.error.message).toContain("le numéro de story");
    }
  });

  it("400 : plan absent ou invalide, structure inconnue, JSON invalide", async () => {
    expect((await post({ storyIndex: 1 })).status).toBe(400);
    const fourStories = { ...EXAMPLE_PLAN, stories: EXAMPLE_PLAN.stories.slice(0, 4) };
    expect((await post({ ...VALID, plan: fourStories })).status).toBe(400);
    const unknown = await post({ ...VALID, plan: { ...EXAMPLE_PLAN, structureId: "inconnue" } });
    expect(unknown.status).toBe(400);
    expect(((await unknown.json()) as ApiError).error.message).toContain("structure inconnue");
    expect((await post("{pas du json")).status).toBe(400);
  });
});

describe("POST /api/generations/story, sans clé ni simulation", () => {
  beforeEach(() => {
    vi.stubEnv("STORY_AI_MOCK", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
  });

  it("503 cle_absente avec la marche à suivre", async () => {
    const res = await post(VALID);
    expect(res.status).toBe(503);
    const body = (await res.json()) as ApiError;
    expect(body.error.code).toBe("cle_absente");
    expect(body.error.message).toContain("ANTHROPIC_API_KEY");
  });

  it("400 reste prioritaire sur l'absence de clé", async () => {
    expect((await post({ ...VALID, storyIndex: 9 })).status).toBe(400);
  });
});

describe("POST /api/generations/story, avec une clé", () => {
  beforeEach(() => {
    vi.stubEnv("STORY_AI_MOCK", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-secret");
    vi.stubEnv("ANTHROPIC_EFFORT", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("429 au-delà de la limite de débit", async () => {
    const { hitRateLimit, REWRITES_LIMIT } = await import("@/lib/ai/rate-limit");
    for (let i = 0; i < REWRITES_LIMIT.limit; i++) hitRateLimit("rewrites", "203.0.113.9", REWRITES_LIMIT);
    const res = await post(VALID, { "x-forwarded-for": "203.0.113.9" });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toMatch(/^\d+$/);
  });

  it("504 connexion quand Claude est injoignable, sans exposer la clé", async () => {
    const res = await post(VALID);
    const text = await res.text();
    expect(res.status).toBe(504);
    expect(text).not.toContain("sk-ant-test-secret");
  }, 30_000);
});

it("durée maximale adaptée à deux appels", () => {
  expect(maxDuration).toBe(120);
});

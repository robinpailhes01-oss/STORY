import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONTEXT, EXAMPLE_PLAN } from "@/domain/example-plan";
import { StoryPlanSchema, type ApiError, type GenerateResponse } from "@/domain/story-plan";
import { MAX_BODY_BYTES } from "@/lib/ai/http";
import { resetRateLimits } from "@/lib/ai/rate-limit";
import { maxDuration, POST } from "./route";

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost/api/generations", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const VALID = { idea: "Par où commencer avec l'IA quand on dirige une petite entreprise", context: DEFAULT_CONTEXT };

beforeEach(() => {
  resetRateLimits();
  // Aucun appel réseau ne doit partir pendant ces tests.
  vi.stubGlobal("fetch", () => Promise.reject(new Error("appel réseau interdit dans les tests")));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/generations, mode simulé", () => {
  beforeEach(() => {
    vi.stubEnv("STORY_AI_MOCK", "1");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
  });

  it("200 : la séquence de référence, contrôles réels appliqués", async () => {
    const res = await post(VALID);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as GenerateResponse;
    expect(StoryPlanSchema.parse(body.plan)).toEqual(EXAMPLE_PLAN);
    expect(body.controls.ok).toBe(true);
    expect(body.meta).toMatchObject({ mock: true, repaired: false, model: "simulation" });
  });

  it("applique vraiment les contrôles (mot interdit du contexte)", async () => {
    const res = await post({ ...VALID, context: { ...DEFAULT_CONTEXT, forbidden: ["PME"] } });
    const body = (await res.json()) as GenerateResponse;
    expect(body.controls.ok).toBe(false);
    expect(body.controls.issues.some((i) => i.code === "mot_interdit")).toBe(true);
  });

  it("200 : idée vide ou absente en mode idée (l'IA part du profil)", async () => {
    for (const body of [{ context: DEFAULT_CONTEXT }, { idea: "", context: DEFAULT_CONTEXT }, {}]) {
      const res = await post(body);
      expect(res.status).toBe(200);
      expect(((await res.json()) as GenerateResponse).controls.ok).toBe(true);
    }
  });

  it("400 : idée d'un type invalide, avec un message en français", async () => {
    const res = await post({ idea: 42, context: DEFAULT_CONTEXT });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiError;
    expect(body.error.code).toBe("corps_invalide");
    expect(body.error.message).toContain("l'idée");
  });

  it("400 texte_trop_court : mode texte vide ou trop court pour 5 stories, avec la marche à suivre", async () => {
    for (const idea of ["", "Chaque tâche se répète. Elle peut tourner seule. Commence par la plus fréquente."]) {
      const res = await post({ ...VALID, mode: "texte", idea });
      expect(res.status).toBe(400);
      const body = (await res.json()) as ApiError;
      expect(body.error.code).toBe("texte_trop_court");
      expect(body.error.message).toContain("mode « idée »");
    }
  });

  it("200 : mode texte assez long", async () => {
    const idea = EXAMPLE_PLAN.stories.flatMap((s) => s.paragraphs.map((p) => p.text)).join(" ");
    expect((await post({ ...VALID, mode: "texte", idea })).status).toBe(200);
  });

  it("400 : JSON invalide, mode inconnu, structure inconnue", async () => {
    expect((await post("{pas du json")).status).toBe(400);
    const mode = await post({ ...VALID, mode: "poeme" });
    expect(mode.status).toBe(400);
    expect(((await mode.json()) as ApiError).error.message).toContain("le mode");
    const structure = await post({ ...VALID, structureId: "inconnue" });
    expect(structure.status).toBe(400);
    expect(((await structure.json()) as ApiError).error.message).toContain("structure inconnue");
  });

  it("413 : corps de plus de 30 Ko", async () => {
    const res = await post({ ...VALID, avoid: ["x".repeat(MAX_BODY_BYTES)] });
    expect(res.status).toBe(413);
    expect(((await res.json()) as ApiError).error.code).toBe("trop_volumineux");
  });
});

describe("POST /api/generations, sans clé ni simulation", () => {
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
    expect(body.error.message).toContain(".env.local");
  });

  it("400 reste prioritaire sur l'absence de clé", async () => {
    expect((await post({ mode: "poeme" })).status).toBe(400);
    const short = await post({ mode: "texte", idea: "Trop court." });
    expect(short.status).toBe(400);
    expect(((await short.json()) as ApiError).error.code).toBe("texte_trop_court");
  });

  it("idée vide sans clé : 503 (la demande est valide)", async () => {
    expect((await post({})).status).toBe(503);
  });
});

describe("POST /api/generations, avec une clé", () => {
  it("500 config_invalide si ANTHROPIC_EFFORT est inconnu, sans exposer la clé", async () => {
    vi.stubEnv("STORY_AI_MOCK", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-secret");
    vi.stubEnv("ANTHROPIC_EFFORT", "turbo");
    const res = await post(VALID);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toContain("config_invalide");
    expect(text).not.toContain("sk-ant-test-secret");
  });

  it("504 connexion quand Claude est injoignable (réseau coupé), sans exposer la clé", async () => {
    vi.stubEnv("STORY_AI_MOCK", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-secret");
    vi.stubEnv("ANTHROPIC_EFFORT", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(VALID);
    const text = await res.text();
    expect(res.status).toBe(504);
    expect(text).toContain("connexion");
    expect(text).not.toContain("sk-ant-test-secret");
  }, 30_000);

  it("429 au-delà de la limite de débit", async () => {
    vi.stubEnv("STORY_AI_MOCK", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-secret");
    vi.stubEnv("ANTHROPIC_EFFORT", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { hitRateLimit, GENERATIONS_LIMIT } = await import("@/lib/ai/rate-limit");
    for (let i = 0; i < GENERATIONS_LIMIT.limit; i++) hitRateLimit("generations", "203.0.113.7", GENERATIONS_LIMIT);
    const res = await post(VALID, { "x-forwarded-for": "203.0.113.7" });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(((await res.json()) as ApiError).error.code).toBe("trop_de_demandes");
  });
});

it("durée maximale adaptée à deux appels", () => {
  expect(maxDuration).toBe(120);
});

// Vérifie la requête réellement émise par le SDK (fetch intercepté, aucun appel réseau).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONTEXT, EXAMPLE_PLAN } from "@/domain/example-plan";
import { GenerateRequestSchema } from "@/domain/story-plan";
import { generatePlan } from "./generate";
import { toModelPlan } from "./schemas";

interface Captured {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

function fakeAnthropic(reply: Record<string, unknown>): Captured[] {
  const captured: Captured[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    captured.push({ url: request.url, headers: request.headers, body: JSON.parse(await request.text()) });
    return new Response(JSON.stringify(reply), { status: 200, headers: { "content-type": "application/json" } });
  });
  return captured;
}

const message = (text: string, patch: Record<string, unknown> = {}) => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content: [{ type: "thinking", thinking: "", signature: "x" }, { type: "text", text }],
  stop_reason: "end_turn",
  stop_details: null,
  stop_sequence: null,
  usage: { input_tokens: 300, output_tokens: 2500, cache_read_input_tokens: 0, cache_creation_input_tokens: 4100 },
  ...patch,
});

const request = GenerateRequestSchema.parse({ idea: "Les devis envoyés puis oubliés", context: DEFAULT_CONTEXT });

// Le client SDK est gardé tant que la clé ne change pas, et il retient le fetch de sa création :
// une clé différente par test garantit un client neuf qui utilise le faux fetch du test.
let key = "";
let counter = 0;
beforeEach(() => {
  key = `sk-ant-test-${++counter}`;
  vi.stubEnv("ANTHROPIC_API_KEY", key);
  vi.stubEnv("ANTHROPIC_MODEL", "");
  vi.stubEnv("ANTHROPIC_EFFORT", "");
  vi.stubEnv("ANTHROPIC_FALLBACKS", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("requête envoyée à Claude", () => {
  it("modèle, effort, sortie structurée, repli, cache ; ni thinking ni temperature", async () => {
    const captured = fakeAnthropic(message(JSON.stringify(toModelPlan(EXAMPLE_PLAN))));
    const response = await generatePlan(request);
    expect(captured).toHaveLength(1);
    const { url, headers, body } = captured[0];
    expect(url).toMatch(/\/v1\/messages(\?beta=true)?$/);
    expect(headers.get("authorization")).toBe(`Bearer ${key}`);
    expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.max_tokens).toBe(16_000);
    expect(body.fallbacks).toBe("default");
    expect(body.output_config).toMatchObject({ effort: "medium", format: { type: "json_schema" } });
    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("betas");
    const messages = body.messages as { role: string }[];
    expect(messages.map((m) => m.role)).toEqual(["user"]); // pas de préremplissage assistant
    const system = body.system as { cache_control?: unknown }[];
    expect(system.every((b) => JSON.stringify(b.cache_control) === '{"type":"ephemeral"}')).toBe(true);

    expect(response.plan).toEqual(EXAMPLE_PLAN);
    expect(response.meta.cache).toEqual({ readTokens: 0, writeTokens: 4100 });
    expect(response.meta.costUsd).toBeCloseTo((300 * 4 + 2500 * 20 + 4100 * 5) / 1e6, 6);
  });

  it("ANTHROPIC_MODEL, ANTHROPIC_EFFORT et ANTHROPIC_FALLBACKS=off sont pris en compte", async () => {
    vi.stubEnv("ANTHROPIC_MODEL", "claude-sonnet-5-5");
    vi.stubEnv("ANTHROPIC_EFFORT", "low");
    vi.stubEnv("ANTHROPIC_FALLBACKS", "off");
    const captured = fakeAnthropic(message(JSON.stringify(toModelPlan(EXAMPLE_PLAN)), { model: "claude-sonnet-5-5" }));
    await generatePlan(request);
    const { headers, body } = captured[0];
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.output_config).toMatchObject({ effort: "low" });
    expect(body).not.toHaveProperty("fallbacks");
    expect(headers.get("anthropic-beta") ?? "").not.toContain("server-side-fallback");
  });

  it("un refus (après repli) donne une erreur 422 « refus »", async () => {
    fakeAnthropic(
      message("", { content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: "bio", explanation: null } }),
    );
    await expect(generatePlan(request)).rejects.toMatchObject({ code: "refus", status: 422 });
  });
});

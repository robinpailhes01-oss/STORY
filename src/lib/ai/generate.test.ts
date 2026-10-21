import { describe, expect, it } from "vitest";
import { DEFAULT_CONTEXT, EXAMPLE_PLAN } from "@/domain/example-plan";
import { GenerateRequestSchema, IdeasRequestSchema, type StoryPlan } from "@/domain/story-plan";
import type { StructuredCall, StructuredCaller, StructuredResult } from "./client";
import { AiError } from "./errors";
import { generatePlan } from "./generate";
import { generateIdeas } from "./ideas";
import { MOCK_IDEAS } from "./mock";
import { toModelPlan } from "./schemas";

const request = GenerateRequestSchema.parse({
  idea: "Le vrai gain de l'IA pour une PME : automatiser ce qu'on refait sans y penser.",
  context: DEFAULT_CONTEXT,
});

const result = (data: unknown): StructuredResult => ({
  data,
  model: "claude-opus-5-5",
  usage: { inputTokens: 1000, outputTokens: 2000, cacheReadTokens: 5000, cacheWriteTokens: 0 },
  costUsd: 0.045,
});

/** Faux modèle : renvoie les réponses dans l'ordre et garde les appels reçus. */
function scripted(...responses: unknown[]): StructuredCaller & { calls: StructuredCall[] } {
  const calls: StructuredCall[] = [];
  const caller = async (call: StructuredCall) => {
    calls.push(call);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    if (next === undefined) throw new Error("appel inattendu");
    return result(next);
  };
  return Object.assign(caller, { calls });
}

const withFault = (mutate: (plan: StoryPlan) => void) => {
  const plan = structuredClone(EXAMPLE_PLAN);
  mutate(plan);
  return toModelPlan(plan);
};

describe("generatePlan", () => {
  it("un seul appel quand les contrôles passent", async () => {
    const caller = scripted(toModelPlan(EXAMPLE_PLAN));
    const response = await generatePlan(request, { caller });
    expect(caller.calls).toHaveLength(1);
    expect(response.plan).toEqual(EXAMPLE_PLAN);
    expect(response.controls.ok).toBe(true);
    expect(response.meta).toMatchObject({ repaired: false, mock: false, methodVersion: "v1", costUsd: 0.045 });
    expect(response.meta.cache).toEqual({ readTokens: 5000, writeTokens: 0 });
    // Le système est mis en cache ; les données de la requête sont dans le message utilisateur.
    expect(caller.calls[0].system.every((block) => block.cache_control?.type === "ephemeral")).toBe(true);
    expect(caller.calls[0].user).toContain("<idee>");
  });

  it("répare une seule fois, en ne gardant de la réparation que la story fautive", async () => {
    const faulty = withFault((p) => {
      p.stories[1].paragraphs[1].text = "Ça te fait gagner 12 minutes. Pas plus.";
    });
    // La réparation corrige la story 2 mais modifie aussi la story 1 : cette modification est ignorée.
    const repaired = withFault((p) => {
      p.stories[0].paragraphs[0].text = "Phrase réécrite à tort par la réparation.";
    });
    const caller = scripted(faulty, repaired);
    const response = await generatePlan(request, { caller });
    expect(caller.calls).toHaveLength(2);
    expect(caller.calls[1].user).toContain("<plan_a_corriger>");
    expect(caller.calls[1].user).toContain("<problemes>");
    expect(caller.calls[1].user).toContain("Corrige uniquement la story 2");
    expect(response.meta.repaired).toBe(true);
    expect(response.controls.ok).toBe(true);
    expect(response.plan.stories[0]).toEqual(EXAMPLE_PLAN.stories[0]);
    expect(response.plan.stories[1]).toEqual(EXAMPLE_PLAN.stories[1]);
    expect(response.meta.usage).toEqual({ inputTokens: 2000, outputTokens: 4000 });
  });

  it("renvoie le meilleur plan avec ses problèmes si la réparation échoue encore", async () => {
    const faulty = withFault((p) => {
      p.stories[4].paragraphs[1].text = "C'est **elle** qu'il faut automatiser.";
    });
    const caller = scripted(faulty, faulty);
    const response = await generatePlan(request, { caller });
    expect(caller.calls).toHaveLength(2);
    expect(response.controls.ok).toBe(false);
    expect(response.controls.issues.some((i) => i.code === "markdown")).toBe(true);
  });

  it("garde la première version si l'appel de réparation échoue", async () => {
    const faulty = withFault((p) => {
      p.stories[4].paragraphs[1].text = "C'est **elle** qu'il faut automatiser.";
    });
    const caller = scripted(faulty, new AiError("connexion", 504, "coupure"));
    const response = await generatePlan(request, { caller });
    expect(response.meta.repaired).toBe(false);
    expect(response.controls.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["markdown", "reparation_echouee"]));
  });

  it("502 si le plan reste impossible à afficher", async () => {
    const tooMany = withFault((p) => {
      p.stories[1].paragraphs = Array.from({ length: 6 }, () => ({ text: "Court.", accents: [] }));
    });
    const caller = scripted(tooMany, tooMany);
    await expect(generatePlan(request, { caller })).rejects.toMatchObject({ code: "plan_invalide", status: 502 });
  });

  it("502 si la réponse n'a pas la forme attendue", async () => {
    const caller = scripted({ stories: [] });
    await expect(generatePlan(request, { caller })).rejects.toMatchObject({ code: "plan_invalide", status: 502 });
  });

  it("impose la structure choisie par l'utilisateur", async () => {
    const caller = scripted(toModelPlan(EXAMPLE_PLAN));
    const response = await generatePlan({ ...request, structureId: "conseil" }, { caller });
    expect(response.plan.structureId).toBe("conseil");
    expect(caller.calls[0].user).toContain('structureId = "conseil"');
  });

  it("propage une erreur de l'appel principal", async () => {
    const caller = scripted(new AiError("refus", 422, "refusé"));
    await expect(generatePlan(request, { caller })).rejects.toMatchObject({ code: "refus", status: 422 });
  });
});

describe("generateIdeas", () => {
  const ideasRequest = IdeasRequestSchema.parse({ context: DEFAULT_CONTEXT, avoid: [MOCK_IDEAS[0].idea] });

  it("filtre les doublons, les idées déjà proposées et « preuve » sans preuves", async () => {
    const caller = scripted({
      ideas: [
        ...MOCK_IDEAS,
        { idea: MOCK_IDEAS[1].idea, structureId: "objection", hook: "Doublon." },
        { idea: "Un client a doublé ses ventes.", structureId: "preuve", hook: "Résultat." },
      ],
    });
    const response = await generateIdeas(ideasRequest, { caller });
    expect(response.ideas.map((i) => i.idea)).toEqual(MOCK_IDEAS.slice(1).map((i) => i.idea));
    expect(response.meta.mock).toBe(false);
  });

  it("502 si trop peu d'idées utilisables", async () => {
    const caller = scripted({ ideas: [MOCK_IDEAS[0]] });
    await expect(generateIdeas(ideasRequest, { caller })).rejects.toMatchObject({ code: "idees_insuffisantes" });
  });
});

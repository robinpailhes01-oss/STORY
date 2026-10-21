import { describe, expect, it } from "vitest";
import { DEFAULT_CONTEXT, EXAMPLE_PLAN } from "@/domain/example-plan";
import {
  GenerateRequestSchema,
  IdeasRequestSchema,
  RewriteStoryRequestSchema,
  type RewriteStoryRequest,
  type StoryPlan,
} from "@/domain/story-plan";
import type { StructuredCall, StructuredCaller, StructuredResult } from "./client";
import { AiError } from "./errors";
import { generatePlan } from "./generate";
import { generateIdeas } from "./ideas";
import { MOCK_IDEAS } from "./mock";
import { rewriteStory } from "./rewrite";
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
    expect(response.meta).toMatchObject({ repaired: false, mock: false, methodVersion: "v2", costUsd: 0.045 });
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
  const ideasRequest = IdeasRequestSchema.parse({ context: { ...DEFAULT_CONTEXT, proofs: [] }, avoid: [MOCK_IDEAS[0].idea] });

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

  it("envoie l'identifiant, la bio, les preuves numérotées et les exemples de voix", async () => {
    const caller = scripted({ ideas: [...MOCK_IDEAS] });
    const context = { ...DEFAULT_CONTEXT, voiceExamples: ["Ma dernière séquence exportée."] };
    await generateIdeas(IdeasRequestSchema.parse({ context }), { caller });
    const user = caller.calls[0].user;
    expect(user).toContain("@luma_agence");
    expect(user).toContain(DEFAULT_CONTEXT.bio);
    expect(user).toContain(`[p1] ${DEFAULT_CONTEXT.proofs[0]}`);
    expect(user).toContain("<exemples_de_voix>");
  });
});

describe("generatePlan, phase 3", () => {
  it("idée vide en mode idée : un seul appel, l'IA part du profil", async () => {
    const caller = scripted(toModelPlan(EXAMPLE_PLAN));
    const response = await generatePlan(GenerateRequestSchema.parse({ context: DEFAULT_CONTEXT }), { caller });
    expect(response.controls.ok).toBe(true);
    expect(caller.calls[0].user).not.toContain("<idee>");
    expect(caller.calls[0].user).toContain("choisis toi-même le sujet");
  });

  it("mode texte trop court : 400 texte_trop_court, sans appel à Claude", async () => {
    const caller = scripted();
    const short = GenerateRequestSchema.parse({ mode: "texte", idea: "Une phrase. Deux phrases. Trois phrases.", context: DEFAULT_CONTEXT });
    await expect(generatePlan(short, { caller })).rejects.toMatchObject({ code: "texte_trop_court", status: 400 });
    expect(caller.calls).toHaveLength(0);
  });

  it("répare un chiffre de preuve non cité, et garde proofIds", async () => {
    const text = "Résultat chez Harmonie Yacht : 3 h gagnées chaque jour !";
    const faulty = withFault((p) => {
      p.stories[3].paragraphs[2] = { text, accents: [] };
    });
    const fixed = withFault((p) => {
      p.stories[3].paragraphs[2] = { text, accents: [], proofIds: ["p1"] };
    });
    const caller = scripted(faulty, fixed);
    const response = await generatePlan(request, { caller });
    expect(DEFAULT_CONTEXT.proofs[0]).toContain("3 h");
    expect(caller.calls[1].user).toContain("preuve p1");
    expect(response.controls.ok).toBe(true);
    expect(response.plan.stories[3].paragraphs[2].proofIds).toEqual(["p1"]);
  });
});

describe("rewriteStory", () => {
  const rewriteRequest = (patch: Partial<RewriteStoryRequest> = {}) =>
    RewriteStoryRequestSchema.parse({ plan: EXAMPLE_PLAN, storyIndex: 1, context: DEFAULT_CONTEXT, ...patch });
  const newStory = {
    role: "reconnaissance",
    paragraphs: [
      { text: "Ta légende, tu la confies déjà à l'IA ?", accents: [], proofIds: [] },
      { text: "Tu gagnes un peu de temps. Pas beaucoup.", accents: ["un peu de temps."], proofIds: [] },
      { text: "Et une autre tâche te prend des heures chaque semaine.", accents: ["des heures chaque semaine."], proofIds: [] },
    ],
  };

  it("ne remplace que la story demandée ; les autres sont strictement identiques à l'entrée", async () => {
    const input = rewriteRequest({ instruction: "plus direct" });
    const caller = scripted(newStory);
    const response = await rewriteStory(input, { caller });
    expect(caller.calls).toHaveLength(1);
    expect(caller.calls[0].format.schema).toHaveProperty("properties.paragraphs");
    expect(caller.calls[0].user).toContain("<consigne>");
    expect(response.plan.stories[1].paragraphs[0].text).toBe(newStory.paragraphs[0].text);
    expect(response.plan.stories[1].paragraphs[0]).not.toHaveProperty("proofIds");
    for (const i of [0, 2, 3, 4]) expect(JSON.stringify(response.plan.stories[i])).toBe(JSON.stringify(input.plan.stories[i]));
    expect(response.plan.angle).toBe(input.plan.angle);
    expect(response.controls.ok).toBe(true);
    expect(response.meta).toMatchObject({ repaired: false, mock: false, methodVersion: "v2" });
  });

  it("répare une fois la story refaite si elle a un problème bloquant", async () => {
    const bad = { ...newStory, paragraphs: [{ text: "Tu gagnes 12 minutes. Pas plus.", accents: [], proofIds: [] }, ...newStory.paragraphs.slice(1)] };
    const caller = scripted(bad, newStory);
    const response = await rewriteStory(rewriteRequest(), { caller });
    expect(caller.calls).toHaveLength(2);
    expect(caller.calls[1].user).toContain("<story_a_corriger>");
    expect(caller.calls[1].user).toContain("12");
    expect(response.meta.repaired).toBe(true);
    expect(response.controls.ok).toBe(true);
  });

  it("ne tente pas de réparation pour un problème d'une autre story (déjà présent à l'entrée)", async () => {
    const plan = structuredClone(EXAMPLE_PLAN);
    plan.stories[4].paragraphs[1].text = "C'est elle qu'il faut automatiser en 12 jours.";
    const caller = scripted(newStory);
    const response = await rewriteStory(rewriteRequest({ plan }), { caller });
    expect(caller.calls).toHaveLength(1);
    expect(response.controls.ok).toBe(false);
    expect(response.controls.issues.find((i) => i.code === "chiffre_invente")?.story).toBe(4);
    expect(response.plan.stories[4]).toEqual(plan.stories[4]);
  });

  it("mode texte : la story refaite doit garder ses mots", async () => {
    const reworded = { ...newStory };
    const caller = scripted(reworded, reworded);
    const response = await rewriteStory(rewriteRequest({ mode: "texte", idea: "" }), { caller });
    expect(caller.calls).toHaveLength(2);
    expect(response.controls.issues.some((i) => i.code === "mots_modifies")).toBe(true);
  });

  it("502 si la story renvoyée n'a pas la forme attendue", async () => {
    await expect(rewriteStory(rewriteRequest(), { caller: scripted({ paragraphs: "?" }) })).rejects.toMatchObject({
      code: "plan_invalide",
      status: 502,
    });
  });

  it("400 si la séquence d'entrée a une structure inconnue", async () => {
    const plan = { ...structuredClone(EXAMPLE_PLAN), structureId: "inconnue" };
    await expect(rewriteStory(rewriteRequest({ plan }), { caller: scripted() })).rejects.toMatchObject({ status: 400 });
  });
});

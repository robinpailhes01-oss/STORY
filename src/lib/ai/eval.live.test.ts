// Évaluation RÉELLE (appels payants à Claude) : les 10 briefs de docs/luma/briefs-test.md avec
// DEFAULT_CONTEXT, plus 2 briefs de la phase 3 (idée vide, long texte de l'auteur). Ignorée sans
// ANTHROPIC_API_KEY. Résultat : captures/ai/eval-<version de la méthode>.json (l'évaluation v1 reste dans
// captures/ai/eval.json), à relire à la main (colonne « à vérifier » des briefs).
// Lancement : ANTHROPIC_API_KEY=… npx vitest run src/lib/ai/eval.live.test.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTEXT, EXAMPLE_PLAN } from "@/domain/example-plan";
import { GenerateRequestSchema, type GenerateRequest, type GenerateResponse } from "@/domain/story-plan";
import { readAiConfig } from "./config";
import { AiError, toAiError } from "./errors";
import { generatePlan } from "./generate";
import { METHODE_VERSION } from "./prompts/methode.v2";
import { assertTextUsable } from "./text-rules";

const OUTPUT = fileURLToPath(new URL(`../../../captures/ai/eval-${METHODE_VERSION}.json`, import.meta.url));

interface Brief {
  id: number;
  structureId: GenerateRequest["structureId"];
  mode: GenerateRequest["mode"];
  idea: string;
  verifier: string;
  /** Erreur attendue (le brief ne doit PAS produire de séquence). */
  erreurAttendue?: string;
}

const STORY_4 = EXAMPLE_PLAN.stories[3].paragraphs.map((p) => p.text).join(" ");

/** Texte d'auteur de 11 phrases, écrit pour l'évaluation (aucun chiffre). */
const LONG_TEXT =
  "Hier, un client m'a demandé par où commencer avec l'IA. Je lui ai retourné la question : qu'est-ce que tu refais chaque jour sans réfléchir ? Il a cherché un moment. Puis il a sorti sa liste. Répondre aux mêmes questions sur les délais. Relancer les devis restés sans réponse. Recopier les commandes dans le tableau. Aucune de ces tâches ne demande son talent. Toutes lui prennent son temps. C'est par là qu'on commence, pas par l'outil à la mode. Si tu veux faire le même exercice, écris-moi : un audit est offert pour en discuter.";

/** « Problème → solution » → conseil, « Cas documenté » → preuve (avec la preuve de Robin, p1). */
const BRIEFS: readonly Brief[] = [
  { id: 1, structureId: "conseil", mode: "idee", idea: "Par où commencer avec l'IA quand on dirige une petite entreprise", verifier: "5 stories, accroche courte, une seule tâche à choisir" },
  { id: 2, structureId: "objection", mode: "idee", idea: "« L'IA, ce n'est pas pour les petites entreprises. »", verifier: "L'objection est citée mot pour mot, puis on lui donne raison avant de la nuancer" },
  { id: 3, structureId: "objection", mode: "idee", idea: "« Je n'ai pas le temps de m'y mettre. »", verifier: "Aucun chiffre de temps gagné inventé ; « 3 h » seulement avec proofIds p1" },
  { id: 4, structureId: "conseil", mode: "idee", idea: "Les devis envoyés puis oubliés, jamais relancés", verifier: "Liste de 3 exemples concrets, cliffhanger en fin de story 3" },
  { id: 5, structureId: "conseil", mode: "idee", idea: "Les mêmes questions clients reposées chaque semaine", verifier: "Ton tutoiement, pas de vocabulaire de pub" },
  { id: 6, structureId: "conseil", mode: "idee", idea: "Le tri des mails qui mange la matinée", verifier: "Mots accentués présents tels quels dans le texte" },
  { id: 7, structureId: "objection", mode: "idee", idea: "« Mes clients vont sentir que c'est un robot. »", verifier: "Le texte reste humain, sans promesse non prouvée" },
  { id: 8, structureId: "preuve", mode: "idee", idea: "Montrer qu'une relance automatique de devis fait récupérer des clients", verifier: "Seule la preuve p1 (Harmonie Yacht, 3 h par jour) est citée, avec proofIds ; aucun autre chiffre ni client" },
  { id: 9, structureId: "auto", mode: "texte", idea: STORY_4, verifier: "Texte de 3 phrases : refusé (400) au lieu d'être coupé au milieu des phrases", erreurAttendue: "texte_trop_court" },
  { id: 10, structureId: "auto", mode: "idee", idea: "Parler d'IA", verifier: "Choisit un angle précis (dans angle) ; ne produit pas du générique" },
  { id: 11, structureId: "auto", mode: "idee", idea: "", verifier: "Idée vide : sujet choisi à partir du profil (activité, offre, cible, preuve), précis, formulé dans angle" },
  { id: 12, structureId: "auto", mode: "texte", idea: LONG_TEXT, verifier: "Long texte : tous les mots conservés, aucune phrase coupée entre deux paragraphes ou deux stories" },
];

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());

// Sans clé : les briefs en mode texte sont classés comme attendu, sans aucun appel.
describe("briefs en mode texte (sans appel)", () => {
  it("le brief 9 est refusé (texte_trop_court), le brief 12 est accepté", () => {
    for (const brief of BRIEFS.filter((b) => b.mode === "texte")) {
      const run = () => assertTextUsable(brief);
      if (brief.erreurAttendue) expect(run).toThrow(expect.objectContaining({ code: brief.erreurAttendue, status: 400 }));
      else expect(run).not.toThrow();
    }
  });
});

describe.skipIf(!hasKey)("évaluation réelle des briefs", () => {
  it(
    `écrit captures/ai/eval-${METHODE_VERSION}.json`,
    async () => {
      const config = readAiConfig();
      const results = [];
      for (const brief of BRIEFS) {
        const request = GenerateRequestSchema.parse({ ...brief, context: DEFAULT_CONTEXT });
        const started = Date.now();
        try {
          const response: GenerateResponse = await generatePlan(request);
          results.push({
            id: brief.id,
            structureDemandee: brief.structureId,
            mode: brief.mode,
            verifier: brief.verifier,
            attenduOk: !brief.erreurAttendue,
            jsonValide: true,
            controlesOk: response.controls.ok,
            bloquants: response.controls.issues.filter((i) => i.severity !== "conseil"),
            conseils: response.controls.issues.filter((i) => i.severity === "conseil"),
            repare: response.meta.repaired,
            ms: response.meta.ms,
            tokens: { ...response.meta.usage, cache: response.meta.cache },
            coutUsd: response.meta.costUsd ?? null,
            modele: response.meta.model,
            repli: response.meta.fallbackModel ?? null,
            plan: response.plan,
            texte: response.plan.stories.map((s, i) => `${i + 1}. ${s.paragraphs.map((p) => p.text).join(" / ")}`),
          });
        } catch (error) {
          const e = error instanceof AiError ? error : toAiError(error);
          results.push({
            id: brief.id,
            structureDemandee: brief.structureId,
            mode: brief.mode,
            verifier: brief.verifier,
            attenduOk: brief.erreurAttendue === e.code,
            jsonValide: !["plan_invalide", "reponse_illisible", "reponse_tronquee"].includes(e.code),
            erreur: { code: e.code, status: e.status, message: e.message },
            ms: Date.now() - started,
          });
        }
      }
      const generated = results.filter((r) => !("erreur" in r));
      const costs = generated.map((r) => ("coutUsd" in r ? r.coutUsd : null)).filter((c): c is number => typeof c === "number");
      const summary = {
        date: new Date().toISOString(),
        methode: METHODE_VERSION,
        modele: config.model,
        effort: config.effort,
        briefs: results.length,
        attendus: results.filter((r) => r.attenduOk).length,
        jsonValides: results.filter((r) => r.jsonValide).length,
        controlesOk: results.filter((r) => "controlesOk" in r && r.controlesOk).length,
        repares: results.filter((r) => "repare" in r && r.repare).length,
        erreurs: results.filter((r) => "erreur" in r).length,
        msMoyen: generated.length ? Math.round(generated.reduce((n, r) => n + r.ms, 0) / generated.length) : null,
        coutTotalUsd: Math.round(costs.reduce((n, c) => n + c, 0) * 1e4) / 1e4,
        coutMoyenUsd: costs.length ? Math.round((costs.reduce((n, c) => n + c, 0) / costs.length) * 1e4) / 1e4 : null,
      };
      mkdirSync(dirname(OUTPUT), { recursive: true });
      writeFileSync(OUTPUT, `${JSON.stringify({ summary, results }, null, 2)}\n`);
      expect(results).toHaveLength(BRIEFS.length);
      expect(summary.jsonValides).toBe(BRIEFS.length);
      // Le brief 9 (3 phrases) est refusé avant tout appel : 400 texte_trop_court.
      expect(results.find((r) => r.id === 9)).toMatchObject({ attenduOk: true, erreur: { code: "texte_trop_court", status: 400 } });
      expect(summary.attendus).toBe(BRIEFS.length);
    },
    20 * 60_000,
  );
});

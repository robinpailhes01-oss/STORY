import { describe, expect, it } from "vitest";
import { DEFAULT_CONTEXT, EXAMPLE_PLAN } from "@/domain/example-plan";
import type { ControlIssue, StoryPlan } from "@/domain/story-plan";
import { emojisAllowed, numbersOf, runControls, wordsOf, type ControlInput } from "./controls";

const INPUT: ControlInput = {
  idea: "Le vrai gain de l'IA pour une PME : automatiser ce qu'on refait sans y penser.",
  mode: "idee",
  structureId: "auto",
  context: DEFAULT_CONTEXT,
  avoid: [],
};

const clone = (): StoryPlan => structuredClone(EXAMPLE_PLAN);
const blocking = (issues: ControlIssue[]) => issues.filter((i) => i.severity === "bloquant");
const codes = (issues: ControlIssue[]) => issues.map((i) => i.code);

describe("contrôles sur la séquence de référence", () => {
  it("EXAMPLE_PLAN ne présente aucun problème bloquant", () => {
    const { report, plan } = runControls(clone(), INPUT);
    expect(blocking(report.issues)).toEqual([]);
    expect(report.ok).toBe(true);
    expect(plan).toEqual(EXAMPLE_PLAN);
  });

  it("tous les problèmes ont une gravité et un message", () => {
    const plan = clone();
    plan.stories[1].paragraphs[0].text = "x".repeat(150);
    const { report } = runControls(plan, INPUT);
    for (const issue of report.issues) {
      expect(["bloquant", "conseil"]).toContain(issue.severity);
      expect(issue.message.length).toBeGreaterThan(5);
    }
  });
});

describe("accents", () => {
  it("retire un accent introuvable et le signale en conseil", () => {
    const plan = clone();
    plan.stories[0].paragraphs[0].accents = ["l'IA", "n'existe pas"];
    const { plan: fixed, report } = runControls(plan, INPUT);
    expect(fixed.stories[0].paragraphs[0].accents).toEqual(["l'IA"]);
    const issue = report.issues.find((i) => i.code === "accent_introuvable");
    expect(issue?.severity).toBe("conseil");
    expect(issue?.story).toBe(0);
    expect(report.ok).toBe(true);
  });

  it("recopie un accent avec la casse et l'apostrophe du texte", () => {
    const plan = clone();
    plan.stories[0].paragraphs[0].accents = ["L’ia"];
    const { plan: fixed } = runControls(plan, INPUT);
    expect(fixed.stories[0].paragraphs[0].accents).toEqual(["l'IA"]);
  });

  it("ramène les accents en trop à 3 par story", () => {
    const plan = clone();
    plan.stories[1].paragraphs[0].accents = ["Toi", "aussi", "demandes"];
    plan.stories[1].paragraphs[1].accents = ["gagner quelques minutes."];
    const { plan: fixed, report } = runControls(plan, INPUT);
    const total = fixed.stories[1].paragraphs.reduce((n, p) => n + p.accents.length, 0);
    expect(total).toBe(3);
    expect(codes(report.issues)).toContain("accents_en_trop");
  });
});

describe("longueurs", () => {
  it("signale un paragraphe trop long (bloquant)", () => {
    const plan = clone();
    plan.stories[3].paragraphs[1].text =
      "(Le vrai travail, c'est de repérer laquelle en premier, puis de la décrire précisément, étape par étape, avec les personnes qui la font chaque jour)";
    const { report } = runControls(plan, INPUT);
    const issue = report.issues.find((i) => i.code === "paragraphe_long");
    expect(issue).toMatchObject({ story: 3, severity: "bloquant" });
    expect(report.ok).toBe(false);
  });

  it("signale une scène (story 2 + 3) trop longue à l'écran", () => {
    const plan = clone();
    const long = "Une phrase concrète qui décrit une situation précise que tout le monde reconnaît au travail chaque semaine sans exception.";
    plan.stories[1].paragraphs = [long, long].map((text) => ({ text, accents: [] }));
    plan.stories[2].paragraphs = [long, long, `${long.slice(0, -1)} :`].map((text) => ({ text, accents: [] }));
    const { report } = runControls(plan, INPUT);
    expect(report.issues.find((i) => i.code === "story_longue")).toMatchObject({ story: 2, severity: "bloquant" });
    const scene = report.issues.find((i) => i.code === "scene_longue");
    expect(scene).toMatchObject({ story: 2, severity: "bloquant" });
    expect(scene?.message).toContain("Stories 2 et 3");
  });

  it("signale une accroche de plus de 20 mots", () => {
    const plan = clone();
    plan.stories[0].paragraphs[0].text =
      "La plupart des PME utilisent l'IA pour écrire plus vite leurs messages, leurs devis, leurs légendes et leurs mails. Ce n'est pas là qu'est l'argent.";
    const { report } = runControls(plan, INPUT);
    expect(report.issues.find((i) => i.code === "accroche_longue")?.severity).toBe("bloquant");
  });
});

describe("contenu", () => {
  it("bloque un chiffre absent de l'idée, du contexte et des preuves", () => {
    const plan = clone();
    plan.stories[1].paragraphs[1].text = "Ça te fait gagner 12 minutes. Pas plus.";
    plan.stories[1].paragraphs[1].accents = ["gagner 12 minutes."];
    const { report } = runControls(plan, INPUT);
    const issue = report.issues.find((i) => i.code === "chiffre_invente");
    expect(issue).toMatchObject({ story: 1, severity: "bloquant" });
    expect(issue?.message).toContain("12");
  });

  describe("preuves citées (proofIds)", () => {
    const PROOFS = ["Un client a récupéré 4 devis le premier mois.", "Chez Harmonie Yacht : 3 h gagnées chaque jour."];
    const input = { ...INPUT, context: { ...DEFAULT_CONTEXT, proofs: PROOFS } };
    const withNumber = (text: string, proofIds?: string[]) => {
      const plan = clone();
      plan.stories[1].paragraphs[1] = { text, accents: [], ...(proofIds ? { proofIds } : {}) };
      return runControls(plan, input);
    };

    it("accepte un chiffre qui figure dans la preuve citée", () => {
      const { report, plan } = withNumber("Un client a récupéré 4 devis le premier mois.", ["p1"]);
      expect(blocking(report.issues)).toEqual([]);
      expect(plan.stories[1].paragraphs[1].proofIds).toEqual(["p1"]);
      expect(withNumber("Résultat chez Harmonie Yacht : 3 h gagnées chaque jour !", ["p2"]).report.ok).toBe(true);
    });

    it("normalise l'écriture des identifiants (P1, [p1], doublons)", () => {
      const { report, plan } = withNumber("Un client a récupéré 4 devis le premier mois.", ["P1", "[p1]"]);
      expect(plan.stories[1].paragraphs[1].proofIds).toEqual(["p1"]);
      expect(report.ok).toBe(true);
    });

    it("bloque un chiffre tiré d'une preuve sans proofIds", () => {
      const issue = withNumber("Un client a récupéré 4 devis le premier mois.").report.issues.find((i) => i.code === "preuve_non_citee");
      expect(issue).toMatchObject({ story: 1, severity: "bloquant" });
      expect(issue?.message).toContain("p1");
    });

    it("bloque un chiffre absent de la preuve citée", () => {
      const issue = withNumber("Un client a récupéré 4 devis le premier mois.", ["p2"]).report.issues.find((i) => i.code === "chiffre_hors_preuve");
      expect(issue).toMatchObject({ story: 1, severity: "bloquant" });
      expect(issue?.message).toContain("il vient de p1");
      expect(codes(withNumber("Résultat : 7 h gagnées chaque jour.", ["p2"]).report.issues)).toContain("chiffre_hors_preuve");
    });

    it("bloque un identifiant de preuve inconnu ou illisible", () => {
      const unknown = withNumber("Un client a récupéré 4 devis le premier mois.", ["p1", "p3"]).report;
      expect(unknown.issues.find((i) => i.code === "preuve_inconnue")).toMatchObject({ story: 1, severity: "bloquant" });
      expect(unknown.ok).toBe(false);
      const sansPreuve = runControls(
        (() => {
          const plan = clone();
          plan.stories[1].paragraphs[1].proofIds = ["p1"];
          return plan;
        })(),
        { ...INPUT, context: { ...DEFAULT_CONTEXT, proofs: [] } },
      ).report;
      expect(sansPreuve.issues.find((i) => i.code === "preuve_inconnue")?.message).toContain("aucune");
      const illisible = withNumber("Sans chiffre.", ["preuve un"]);
      expect(codes(illisible.report.issues)).toContain("preuve_inconnue");
      expect(illisible.plan.stories[1].paragraphs[1].proofIds).toBeUndefined();
    });

    it("un chiffre de l'idée ou du profil n'exige pas de preuve", () => {
      const plan = clone();
      plan.stories[1].paragraphs[1] = { text: "En 2 semaines, c'est en place.", accents: [] };
      expect(runControls(plan, { ...input, idea: "Mettre en place un agent en 2 semaines" }).report.ok).toBe(true);
    });

    it("les exemples de voix ne sont jamais une source de chiffres", () => {
      const plan = clone();
      plan.stories[1].paragraphs[1] = { text: "Ça m'a pris 9 jours.", accents: [] };
      const voice = { ...input, context: { ...input.context, voiceExamples: ["Ça m'a pris 9 jours."] } };
      expect(codes(runControls(plan, voice).report.issues)).toContain("chiffre_invente");
    });
  });

  it("bloque un mot interdit, sans tenir compte de la casse ni des accents", () => {
    const plan = clone();
    plan.stories[3].paragraphs[2].text = "Celle qui revient le plus souvent. DECOUVREZ laquelle en premier.";
    plan.stories[3].paragraphs[2].accents = [];
    const { report } = runControls(plan, INPUT);
    expect(report.issues.find((i) => i.code === "mot_interdit")).toMatchObject({ story: 3, severity: "bloquant" });
  });

  it("bloque le markdown", () => {
    const plan = clone();
    plan.stories[4].paragraphs[1].text = "C'est **elle** qu'il faut automatiser en premier.";
    const { report } = runControls(plan, INPUT);
    expect(report.issues.find((i) => i.code === "markdown")).toMatchObject({ story: 4, severity: "bloquant" });
  });

  it("bloque un tiret de liste en début de paragraphe", () => {
    const plan = clone();
    plan.stories[2].paragraphs[1].text = "- Répondre aux mêmes questions clients.";
    plan.stories[2].paragraphs[1].accents = ["Répondre"];
    expect(codes(runControls(plan, INPUT).report.issues)).toContain("markdown");
  });

  it("bloque les emojis quand le ton ne les demande pas, les accepte sinon", () => {
    const plan = clone();
    plan.stories[4].paragraphs[1].text = "C'est elle qu'il faut automatiser en premier 🚀";
    expect(runControls(plan, INPUT).report.issues.find((i) => i.code === "emoji")?.severity).toBe("bloquant");
    const tolerant = { ...INPUT, context: { ...DEFAULT_CONTEXT, tone: "Tutoiement, quelques emojis" } };
    expect(codes(runControls(plan, tolerant).report.issues)).not.toContain("emoji");
  });

  it("lit le ton pour les emojis", () => {
    expect(emojisAllowed("pas d'emoji")).toBe(false);
    expect(emojisAllowed("Direct, sans emojis")).toBe(false);
    expect(emojisAllowed("Emojis : non")).toBe(false);
    expect(emojisAllowed("phrases courtes")).toBe(false);
    expect(emojisAllowed("Chaleureux, avec des emojis")).toBe(true);
  });

  it("signale en conseil une dernière story qui n'évoque pas l'appel à l'action", () => {
    const plan = clone();
    plan.stories[4].paragraphs[2] = { text: "Partenaire IA des PME, je t'aide à t'y mettre.", accents: [] };
    const issue = runControls(plan, INPUT).report.issues.find((i) => i.code === "cta_absent");
    expect(issue).toMatchObject({ story: 4, severity: "conseil" });
  });

  it("extrait les nombres sous une forme comparable", () => {
    expect(numbersOf("1 000 € et 2,5 % en 24h")).toEqual(["1000", "2.5", "24"]);
  });
});

describe("mode texte", () => {
  const AUTHOR =
    "Chaque tâche que tu répètes peut devenir un automatisme géré sans toi. (Le vrai travail, c'est de repérer laquelle en premier) Celle qui revient le plus souvent, pas celle qui prend le plus de temps d'un coup.";

  function splitAuthorText(): StoryPlan {
    const plan = clone();
    const parts = [
      ["Chaque tâche que tu répètes", "peut devenir un automatisme géré sans toi."],
      ["(Le vrai travail,", "c'est de repérer laquelle en premier)"],
      ["Celle qui revient", "le plus souvent,"],
      ["pas celle qui prend", "le plus de temps"],
      ["d'un coup."],
    ];
    plan.stories = plan.stories.map((story, i) => ({
      role: story.role,
      paragraphs: parts[i].map((text) => ({ text, accents: [] })),
    }));
    return plan;
  }

  it("accepte un découpage qui conserve tous les mots (casse, ponctuation, apostrophes)", () => {
    const plan = splitAuthorText();
    plan.stories[1].paragraphs[1].text = "C’est de repérer laquelle en premier";
    const input: ControlInput = { ...INPUT, mode: "texte", idea: AUTHOR };
    expect(codes(runControls(plan, input).report.issues)).not.toContain("mots_modifies");
  });

  it("bloque un mot modifié", () => {
    const plan = splitAuthorText();
    plan.stories[2].paragraphs[0].text = "Celle qui arrive";
    const input: ControlInput = { ...INPUT, mode: "texte", idea: AUTHOR };
    const issue = runControls(plan, input).report.issues.find((i) => i.code === "mots_modifies");
    expect(issue).toMatchObject({ story: null, severity: "bloquant" });
    expect(issue?.message).toContain("revient");
  });

  it("bloque un mot ajouté en fin de texte", () => {
    const plan = splitAuthorText();
    plan.stories[4].paragraphs[0].text = "d'un coup. Vraiment.";
    const input: ControlInput = { ...INPUT, mode: "texte", idea: AUTHOR };
    expect(codes(runControls(plan, input).report.issues)).toContain("mots_modifies");
  });

  it("détecte une phrase coupée entre deux paragraphes ou deux stories (bloquant)", () => {
    const input: ControlInput = { ...INPUT, mode: "texte", idea: AUTHOR };
    const issues = runControls(splitAuthorText(), input).report.issues.filter((i) => i.code === "phrase_coupee");
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toMatchObject({ story: 0, severity: "bloquant" });
    expect(issues[0].message).toContain("Chaque tâche que tu répètes");
    // Pas en mode idée.
    expect(codes(runControls(splitAuthorText(), INPUT).report.issues)).not.toContain("phrase_coupee");
  });

  it("accepte une découpe aux fins de phrase (point, parenthèse fermante, fin du texte, retour à la ligne de l'auteur)", () => {
    const plan = clone();
    const parts = [
      ["Chaque tâche que tu répètes peut devenir un automatisme géré sans toi."],
      ["(Le vrai travail, c'est de repérer laquelle en premier)"],
      ["Celle qui revient le plus souvent,"],
      ["pas celle qui prend le plus de temps"],
      ["d'un coup"],
    ];
    plan.stories = plan.stories.map((story, i) => ({ role: story.role, paragraphs: parts[i].map((text) => ({ text, accents: [] })) }));
    // L'auteur a lui-même passé des lignes après « souvent, » et « temps », et finit sans point.
    const author =
      "Chaque tâche que tu répètes peut devenir un automatisme géré sans toi. (Le vrai travail, c'est de repérer laquelle en premier) Celle qui revient le plus souvent,\npas celle qui prend le plus de temps\nd'un coup";
    const input: ControlInput = { ...INPUT, mode: "texte", idea: author };
    const issues = runControls(plan, input).report.issues;
    expect(codes(issues)).not.toContain("phrase_coupee");
    expect(codes(issues)).not.toContain("mots_modifies");
    // Sans ces retours à la ligne, les mêmes coupes sont des phrases coupées.
    const flat = runControls(plan, { ...input, idea: author.replace(/\n/g, " ") }).report.issues;
    expect(flat.filter((i) => i.code === "phrase_coupee").map((i) => i.story)).toEqual([2, 3]);
  });

  it("normalise les mots", () => {
    expect(wordsOf("L’IA, c'est « ça » !")).toEqual(["l", "ia", "c", "est", "ça"]);
  });
});

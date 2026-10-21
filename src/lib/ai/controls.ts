// Contrôles déterministes d'une séquence (sans IA, gratuits). Ils corrigent d'abord ce qui peut l'être
// sans changer le sens (accents introuvables ou en trop, rôles vides), puis signalent le reste.
// « bloquant » : la séquence ne respecte pas la méthode ou ne tiendra pas à l'écran ; « conseil » : à revoir.
import "server-only";
import {
  accentRanges,
  SEQUENCE_LAYOUT,
  type ControlIssue,
  type ControlReport,
  type GenerateRequest,
  type Paragraph,
  type StoryPlan,
} from "@/domain/story-plan";
import { isStructureId } from "@/domain/structures";
import { splitAvoid } from "./messages";
import { LIMITES } from "./prompts/methode.v1";

export type ControlInput = Pick<GenerateRequest, "idea" | "mode" | "context" | "structureId" | "avoid">;

/** Tournures publicitaires refusées par la méthode, en plus des mots interdits du contexte. */
export const BANNED_BY_METHOD = ["Découvrez", "N'hésitez pas", "Dans un monde où"] as const;

// ---------------------------------------------------------------------------------------------
// Normalisation

const APOSTROPHES = /[’‘ʼ`´]/g;

/** Apostrophes typographiques → droites. Conserve la longueur (utilisable pour des positions). */
export const normalizeApostrophes = (s: string) => s.replace(APOSTROPHES, "'");

/** Pour comparer des expressions : casse, accents, apostrophes et espaces neutralisés. */
export function normalizeLoose(s: string): string {
  return normalizeApostrophes(s.normalize("NFD").replace(/\p{M}/gu, ""))
    .toLowerCase()
    .replace(/[\s  ]+/g, " ")
    .trim();
}

/** Suite de mots d'un texte : casse, ponctuation et apostrophes neutralisées (les accents comptent). */
export function wordsOf(s: string): string[] {
  return normalizeApostrophes(s.normalize("NFC"))
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function containsTerm(haystackLoose: string, term: string): boolean {
  const needle = normalizeLoose(term);
  if (!needle) return false;
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(needle)}(?![\\p{L}\\p{N}])`, "u").test(haystackLoose);
}

const paragraphLength = (p: Paragraph) => p.text.length;
const storyLength = (paragraphs: readonly Paragraph[]) => paragraphs.reduce((n, p) => n + paragraphLength(p), 0);

// ---------------------------------------------------------------------------------------------
// Corrections automatiques

const ROLE_MAX = 40;
const ANGLE_MAX = 200;
const ACCENTS_PAR_PARAGRAPHE = 3;

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Retrouve l'accent dans le texte tel qu'il y est écrit (casse ou apostrophe différentes). */
function exactAccent(text: string, accent: string): string | null {
  if (accentRanges(text, [accent], normalizeApostrophes).missing.length === 0) return accent;
  const at = normalizeApostrophes(text).toLowerCase().indexOf(normalizeApostrophes(accent).toLowerCase());
  return at === -1 ? null : text.slice(at, at + accent.length);
}

interface FixResult {
  plan: StoryPlan;
  issues: ControlIssue[];
}

function fixPlan(input: StoryPlan): FixResult {
  const issues: ControlIssue[] = [];
  const conseil = (story: number | null, code: string, message: string) =>
    issues.push({ story, code, message, severity: "conseil" });

  const stories = input.stories.map((story, s) => {
    let budget: number = LIMITES.accentsParStory.max;
    const paragraphs = story.paragraphs
      .map((p) => ({ text: p.text.trim(), accents: p.accents.map((a) => a.trim()).filter(Boolean) }))
      .filter((p) => p.text.length > 0)
      .map((p) => {
        const found: string[] = [];
        for (const accent of p.accents) {
          const exact = exactAccent(p.text, accent);
          if (exact === null) {
            conseil(s, "accent_introuvable", `Mot mis en valeur retiré : « ${accent} » n'apparaît pas tel quel dans le texte.`);
          } else found.push(exact);
        }
        // Doublons et chevauchements : accentRanges ne garde que des occurrences distinctes.
        const { missing } = accentRanges(p.text, found, normalizeApostrophes);
        const unique = found.filter((a) => {
          const i = missing.indexOf(a);
          if (i === -1) return true;
          missing.splice(i, 1);
          return false;
        });
        if (unique.length < found.length) {
          conseil(s, "accent_double", "Mot mis en valeur en double ou chevauchant un autre : retiré.");
        }
        // Ordre de lecture, puis plafonds par paragraphe et par story.
        const ordered = unique
          .map((a) => ({ a, at: accentRanges(p.text, [a], normalizeApostrophes).ranges[0]?.start ?? 0 }))
          .sort((x, y) => x.at - y.at)
          .map((x) => x.a);
        const kept = ordered.slice(0, Math.max(0, Math.min(ACCENTS_PAR_PARAGRAPHE, budget)));
        budget -= kept.length;
        if (kept.length < ordered.length) {
          conseil(
            s,
            "accents_en_trop",
            `Trop de mots mis en valeur : ${LIMITES.accentsParStory.max} au plus par story, les derniers ont été retirés.`,
          );
        }
        return { text: p.text, accents: kept };
      });
    const role = clip(story.role.trim() || SEQUENCE_LAYOUT[s]?.role || "story", ROLE_MAX);
    return { role, paragraphs };
  });

  const angle = clip(input.angle.trim() || stories[0]?.paragraphs[0]?.text || "Séquence", ANGLE_MAX);
  return { plan: { ...input, angle, stories }, issues };
}

// ---------------------------------------------------------------------------------------------
// Contrôles

/** Le ton autorise-t-il les emojis ? Non par défaut ; oui seulement s'il les mentionne sans négation. */
export function emojisAllowed(tone: string): boolean {
  const t = normalizeLoose(tone);
  if (!/emoji/.test(t)) return false;
  if (/(pas|sans|aucun|aucune|jamais|zero|ni|non|eviter|evite|interdit|interdits)\b[^.,;]{0,12}emoji/.test(t)) return false;
  if (/emojis?\s*:?\s*(non|aucun|jamais|interdits?)\b/.test(t)) return false;
  return true;
}

const EMOJI = /\p{Extended_Pictographic}/u;
const MARKDOWN = [
  /\*/, // gras ou italique
  /`/, // code
  /__/, // gras
  /^\s{0,3}#{1,6}\s/m, // titre
  /^\s*[-+]\s/m, // liste
  /\[[^\]]+\]\([^)]+\)/, // lien
];

/** Nombres d'un texte, sous une forme comparable (« 1 000 » → « 1000 », « 2,5 » → « 2.5 »). */
export function numbersOf(s: string): string[] {
  const matches = s.match(/\d{1,3}(?:[   ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g) ?? [];
  return matches.map((m) => m.replace(/[   ]/g, "").replace(",", "."));
}

const STOPWORDS = new Set(["pour", "avec", "dans", "sans", "chez", "vous", "nous", "tous", "toute", "toutes", "plus", "votre", "notre", "leur", "leurs", "cette", "entre"]);

function significantWords(s: string): string[] {
  return [...new Set(normalizeLoose(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4 && !STOPWORDS.has(w)))];
}

function check(plan: StoryPlan, input: ControlInput): ControlIssue[] {
  const issues: ControlIssue[] = [];
  const texte = input.mode === "texte";
  const add = (story: number | null, code: string, severity: "bloquant" | "conseil", message: string) =>
    issues.push({ story, code, message, severity });
  /** Bloquant en mode idée ; simple conseil en mode texte, où les mots de l'auteur priment. */
  const ideeOnly = texte ? ("conseil" as const) : ("bloquant" as const);

  if (plan.stories.length !== SEQUENCE_LAYOUT.length) {
    add(null, "nombre_stories", "bloquant", `La séquence doit compter ${SEQUENCE_LAYOUT.length} stories (${plan.stories.length} reçues).`);
  }
  if (!isStructureId(plan.structureId)) {
    add(null, "structure_inconnue", "bloquant", `Structure inconnue : « ${plan.structureId} ».`);
  } else if (input.structureId === "auto") {
    if (splitAvoid(input.avoid).structures.includes(plan.structureId)) {
      add(null, "structure_evitee", "conseil", `La structure « ${plan.structureId} » a déjà été utilisée récemment.`);
    }
  }
  if (plan.structureId === "preuve" && input.context.proofs.length === 0) {
    add(null, "preuve_sans_preuves", "conseil", "Structure « Preuve » sans aucune preuve dans le contexte : vérifie qu'aucun résultat n'est présenté comme réel.");
  }

  // Forme et place à l'écran.
  plan.stories.forEach((story, s) => {
    const n = story.paragraphs.length;
    if (n === 0) {
      add(s, "story_vide", "bloquant", "Story vide.");
      return;
    }
    const range = s === 0 ? LIMITES.paragraphesAccroche : LIMITES.paragraphesSuite;
    if (n > 4) add(s, "paragraphes", "bloquant", `${n} paragraphes : 4 au plus peuvent être affichés.`);
    else if (n > range.max) add(s, "paragraphes", ideeOnly, `${n} paragraphes : ${range.max} au plus pour cette story.`);
    else if (n < range.min) add(s, "paragraphes", "conseil", `Un seul paragraphe : ${range.min} à ${range.max} se lisent mieux.`);

    story.paragraphs.forEach((p, i) => {
      if (p.text.length > LIMITES.paragraphe) {
        add(s, "paragraphe_long", "bloquant", `Paragraphe ${i + 1} trop long : ${p.text.length} caractères (${LIMITES.paragraphe} au plus).`);
      }
      for (const accent of p.accents) {
        if (wordsOf(accent).length > LIMITES.motsParAccent) {
          add(s, "accent_long", "conseil", `« ${accent} » : un mot mis en valeur fait ${LIMITES.motsParAccent} mots au plus.`);
        }
      }
    });
    const length = storyLength(story.paragraphs);
    if (length > LIMITES.story) {
      add(s, "story_longue", "bloquant", `Story trop longue : ${length} caractères (${LIMITES.story} au plus).`);
    }
    if (story.paragraphs.every((p) => p.accents.length === 0)) {
      add(s, "accent_absent", "conseil", "Aucun mot mis en valeur dans cette story.");
    }
  });

  // Scènes : une story « suite » s'affiche sous la précédente, les deux doivent tenir ensemble.
  SEQUENCE_LAYOUT.forEach((slot, s) => {
    if (!slot.continues || s === 0 || !plan.stories[s] || !plan.stories[s - 1]) return;
    const length = storyLength(plan.stories[s - 1].paragraphs) + storyLength(plan.stories[s].paragraphs);
    if (length > LIMITES.scene) {
      add(s, "scene_longue", "bloquant", `Stories ${s} et ${s + 1} trop longues ensemble : ${length} caractères (${LIMITES.scene} au plus à l'écran).`);
    }
  });

  // Accroche.
  const hook = plan.stories[0]?.paragraphs.map((p) => p.text).join(" ") ?? "";
  const hookWords = wordsOf(hook).length;
  if (hookWords > LIMITES.accrocheMots) {
    add(0, "accroche_longue", ideeOnly, `Accroche de ${hookWords} mots : ${LIMITES.accrocheMots} au plus.`);
  }
  if (!texte) {
    const last = plan.stories[2]?.paragraphs.at(-1)?.text.trim() ?? "";
    if (last && !/[:?]["»”)\s]*$/.test(last)) {
      add(2, "cliffhanger_absent", "conseil", "La story 3 devrait finir par deux-points ou une question, pour donner envie de voir la suite.");
    }
  }

  // Contenu : mots interdits, chiffres inventés, emojis, markdown.
  const forbidden = [...input.context.forbidden, ...BANNED_BY_METHOD];
  const sourceLoose = normalizeLoose(
    [input.idea, input.context.name, input.context.activity, input.context.offer, input.context.target, input.context.cta, input.context.tone, ...input.context.proofs].join(" \n "),
  );
  const sourceNumbers = new Set(numbersOf([input.idea, input.context.name, input.context.activity, input.context.offer, input.context.target, input.context.cta, ...input.context.proofs].join(" \n ")));
  const allowEmoji = emojisAllowed(input.context.tone);

  plan.stories.forEach((story, s) => {
    const textLoose = normalizeLoose(story.paragraphs.map((p) => p.text).join(" \n "));
    const reported = new Set<string>();
    for (const term of forbidden) {
      const key = normalizeLoose(term);
      if (reported.has(key) || !containsTerm(textLoose, term)) continue;
      reported.add(key);
      add(s, "mot_interdit", ideeOnly, `Mot interdit : « ${term} ».`);
    }
    const invented = [...new Set(story.paragraphs.flatMap((p) => numbersOf(p.text)))].filter((n) => !sourceNumbers.has(n));
    if (invented.length) {
      add(s, "chiffre_invente", ideeOnly, `Chiffre absent de l'idée, du contexte et des preuves : ${invented.join(", ")}. Aucun chiffre ne doit être inventé.`);
    }
    if (/\bpour ?cent\b/.test(textLoose) && !/\bpour ?cent\b/.test(sourceLoose)) {
      add(s, "chiffre_invente", ideeOnly, "Pourcentage absent de l'idée, du contexte et des preuves.");
    }
    if (!allowEmoji && story.paragraphs.some((p) => EMOJI.test(p.text))) {
      add(s, "emoji", ideeOnly, "Emoji présent alors que le ton du contexte ne les demande pas.");
    }
    if (story.paragraphs.some((p) => MARKDOWN.some((re) => re.test(p.text)))) {
      add(s, "markdown", "bloquant", "Mise en forme markdown (astérisques, dièses, tirets de liste…) : le texte doit être brut.");
    }
  });

  // Appel à l'action du contexte.
  const cta = significantWords(input.context.cta);
  if (cta.length) {
    const last = normalizeLoose(plan.stories[4]?.paragraphs.map((p) => p.text).join(" ") ?? "");
    const present = cta.filter((w) => containsTerm(last, w)).length;
    if (present < Math.ceil(cta.length / 2)) {
      add(4, "cta_absent", "conseil", `La dernière story n'évoque pas l'appel à l'action du contexte (« ${input.context.cta} »).`);
    }
  }

  // Mode texte : les mots de l'auteur, tous, dans l'ordre.
  if (texte) {
    const expected = wordsOf(input.idea);
    const actual = wordsOf(plan.stories.flatMap((st) => st.paragraphs.map((p) => p.text)).join(" "));
    const diff = firstDifference(expected, actual);
    if (diff !== -1) {
      const excerpt = (w: string[]) => w.slice(diff, diff + 6).join(" ") || "(fin du texte)";
      add(
        null,
        "mots_modifies",
        "bloquant",
        `Le texte de l'auteur n'est pas conservé mot pour mot à partir du mot ${diff + 1} : attendu « ${excerpt(expected)} », trouvé « ${excerpt(actual)} ».`,
      );
    }
  }

  return issues;
}

function firstDifference(a: readonly string[], b: readonly string[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return -1;
}

export const isBlocking = (issue: ControlIssue) => issue.severity !== "conseil";

/** Corrige ce qui peut l'être sans changer le sens, puis contrôle. `ok` = aucun problème bloquant. */
export function runControls(plan: StoryPlan, input: ControlInput): { plan: StoryPlan; report: ControlReport } {
  const fixed = fixPlan(plan);
  const issues = [...check(fixed.plan, input), ...fixed.issues];
  issues.sort((x, y) => Number(isBlocking(y)) - Number(isBlocking(x)) || (x.story ?? -1) - (y.story ?? -1));
  return { plan: fixed.plan, report: { ok: !issues.some(isBlocking), issues } };
}

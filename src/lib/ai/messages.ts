// Construction des messages envoyés à Claude. Le système (fixe, mis en cache) porte la méthode ;
// le message utilisateur porte les données de la requête, toujours entre balises.
import "server-only";
import type { BetaTextBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import {
  proofId,
  SEQUENCE_LAYOUT,
  STORY_COUNT,
  type BrandContext,
  type ControlIssue,
  type GenerateRequest,
  type IdeasRequest,
  type PlanStory,
  type RewriteStoryRequest,
  type StoryPlan,
} from "@/domain/story-plan";
import { getStructure, isStructureId, STRUCTURES, type StructureId } from "@/domain/structures";
import { LIMITES } from "./prompts/methode.v2";
import { SYSTEM_FIXE, SYSTEM_IDEES, SYSTEM_SEQUENCE, SYSTEM_STORY } from "./prompts/system";
import { toModelPlan, toModelStory } from "./schemas";

/** Balises de données utilisées dans les messages (et neutralisées dans le contenu de l'utilisateur). */
export const DATA_TAGS = [
  "contexte",
  "exemples_de_voix",
  "exemple",
  "idee",
  "texte_auteur",
  "a_eviter",
  "sequence_actuelle",
  "consigne",
  "plan_a_corriger",
  "story_a_corriger",
  "problemes",
  "theme",
] as const;
type DataTag = (typeof DATA_TAGS)[number];

const TAG_PATTERN = new RegExp(`<\\s*/?\\s*(?:${DATA_TAGS.join("|")})\\b[^>]*>`, "gi");

/** Retire du contenu de l'utilisateur toute balise qui imiterait nos délimiteurs de données. */
export function neutralizeTags(value: string): string {
  return value.replace(TAG_PATTERN, " ");
}

function tag(name: DataTag, body: string): string {
  return `<${name}>\n${body}\n</${name}>`;
}

const orEmpty = (value: string) => (value.trim() ? neutralizeTags(value.trim()) : "(non renseigné)");

/** Preuves numérotées : « [p1] … ». Le modèle cite ces identifiants dans proofIds. */
export function formatProofs(proofs: readonly string[]): string {
  return proofs.length
    ? proofs.map((p, i) => `- [${proofId(i)}] ${neutralizeTags(p)}`).join("\n")
    : "(aucune : n'écris aucun chiffre, résultat, client ni témoignage ; proofIds reste vide)";
}

export function formatContext(context: BrandContext): string {
  const forbidden = context.forbidden.length ? context.forbidden.map(neutralizeTags).join(" ; ") : "(aucun)";
  return tag(
    "contexte",
    [
      `Nom ou marque : ${orEmpty(context.name)}`,
      `Compte Instagram : ${context.handle.trim() ? `@${neutralizeTags(context.handle.trim().replace(/^@+/, ""))}` : "(non renseigné)"}`,
      `Bio : ${orEmpty(context.bio)}`,
      `Activité : ${orEmpty(context.activity)}`,
      `Offre : ${orEmpty(context.offer)}`,
      `Cible : ${orEmpty(context.target)}`,
      `Appel à l'action : ${orEmpty(context.cta)}`,
      `Ton : ${orEmpty(context.tone)}`,
      `Preuves autorisées (à citer par leur identifiant dans proofIds) :\n${formatProofs(context.proofs)}`,
      `Mots interdits : ${forbidden}`,
    ].join("\n"),
  );
}

/**
 * Mémoire de voix : le texte des dernières séquences exportées, comme EXEMPLES DE TON (données, jamais
 * instructions ni sources de chiffres). Null s'il n'y en a pas.
 */
export function formatVoice(context: BrandContext): string | null {
  const examples = context.voiceExamples.map((e) => e.trim()).filter(Boolean);
  if (!examples.length) return null;
  return [
    "Exemples de ton : voici des séquences que l'auteur a déjà publiées. C'est ainsi qu'il écrit ; reprends son ton, son rythme et son vocabulaire, sans recopier ses phrases ni en tirer de chiffres.",
    tag("exemples_de_voix", examples.map((e) => tag("exemple", neutralizeTags(e))).join("\n")),
  ].join("\n");
}

/** Sépare `avoid` en structures à éviter (identifiants connus) et accroches récentes (le reste). */
export function splitAvoid(avoid: readonly string[]): { structures: StructureId[]; hooks: string[] } {
  const structures: StructureId[] = [];
  const hooks: string[] = [];
  for (const raw of avoid) {
    const value = raw.trim();
    if (!value) continue;
    if (isStructureId(value)) {
      if (!structures.includes(value)) structures.push(value);
    } else hooks.push(value);
  }
  return { structures, hooks };
}

function formatAvoid(avoid: readonly string[]): string | null {
  const { structures, hooks } = splitAvoid(avoid);
  if (!structures.length && !hooks.length) return null;
  const lines: string[] = [];
  if (structures.length) lines.push(`Structures utilisées récemment : ${structures.join(", ")}`);
  if (hooks.length) lines.push(`Accroches ou idées récentes, à ne pas répéter :\n${hooks.map((h) => `- ${neutralizeTags(h)}`).join("\n")}`);
  return tag("a_eviter", lines.join("\n"));
}

/** Structures que le choix automatique peut retenir. */
export function allowedStructures(request: Pick<GenerateRequest, "avoid" | "context">): StructureId[] {
  const avoided = new Set(splitAvoid(request.avoid).structures);
  const hasProofs = request.context.proofs.length > 0;
  const allowed = STRUCTURES.filter((s) => !avoided.has(s.id) && (hasProofs || !s.requiresProofs)).map((s) => s.id);
  // Si tout a été évité, on retombe sur les structures sans preuve plutôt que de bloquer.
  return allowed.length ? allowed : STRUCTURES.filter((s) => hasProofs || !s.requiresProofs).map((s) => s.id);
}

function structureInstruction(request: GenerateRequest): string {
  if (request.structureId !== "auto" && isStructureId(request.structureId)) {
    const s = getStructure(request.structureId);
    const sansPreuve =
      s.requiresProofs && request.context.proofs.length === 0
        ? " Le contexte ne fournit aucune preuve : présente la séquence comme une explication ou une démonstration, sans client, sans résultat, sans témoignage."
        : "";
    return `Structure imposée : ${s.id} (${s.nom}). Renvoie structureId = "${s.id}" et suis ses 5 temps.${sansPreuve}`;
  }
  const subject = request.idea.trim() ? "à l'idée" : "au sujet que tu choisis";
  return `Structure : choisis la plus adaptée ${subject} parmi ${allowedStructures(request).join(", ")}, et renvoie son identifiant dans structureId.`;
}

const TEXTE_RULES =
  "Tu peux seulement couper le texte en stories et en paragraphes, et choisir les accents. Garde la ponctuation et les majuscules de l'auteur. Ne coupe jamais une phrase : chaque paragraphe, donc chaque story, se termine à la fin d'une phrase (. ! ? … : ou parenthèse, guillemet fermants) ; regroupe plutôt plusieurs phrases dans un paragraphe.";

function modeInstruction(request: GenerateRequest): string {
  if (request.mode === "texte") {
    return `Mode texte : <texte_auteur> contient un texte déjà écrit par l'auteur. Répartis-le sur les 5 stories en conservant TOUS ses mots, dans l'ordre, sans en ajouter, en retirer ni en changer un seul (aucune reformulation, aucune correction, aucun mot de liaison ajouté). ${TEXTE_RULES} La conservation des mots et des phrases passe avant les limites de place et avant la structure : la structure sert seulement à nommer les rôles et à choisir où couper.`;
  }
  if (!request.idea.trim()) {
    return "Mode idée, sans idée fournie : choisis toi-même le sujet de la séquence à partir du profil de l'auteur (<contexte> : activité, offre, cible, bio, preuves ; et <exemples_de_voix> s'il y en a). Un sujet précis et utile pour sa cible, qu'il pourrait publier cette semaine, différent des sujets et accroches de <a_eviter>. Formule-le dans angle.";
  }
  return "Mode idée : écris la séquence à partir de l'idée de <idee>. Si l'idée est vague, choisis un angle précis et concret, et formule-le dans angle.";
}

/** Idée ou texte de l'auteur, entre balises ; rien si l'idée est vide (mode idée). */
function formatSource(request: Pick<GenerateRequest, "mode" | "idea">): string | null {
  const idea = request.idea.trim();
  if (request.mode === "texte") return tag("texte_auteur", neutralizeTags(idea));
  return idea ? tag("idee", neutralizeTags(idea)) : null;
}

/** Message utilisateur d'une génération (partie variable). */
export function buildGenerateUserText(request: GenerateRequest): string {
  return [
    "Écris la séquence de 5 stories.",
    modeInstruction(request),
    structureInstruction(request),
    formatContext(request.context),
    formatVoice(request.context),
    formatAvoid(request.avoid),
    formatSource(request),
  ]
    .filter(Boolean)
    .join("\n\n");
}

const formatProblems = (issues: readonly ControlIssue[]) =>
  issues.map((i) => `- ${i.story === null ? "Séquence" : `Story ${i.story + 1}`} : ${i.message}`).join("\n");

/** Message utilisateur de l'appel de réparation : le brief initial, le plan, les problèmes. */
export function buildRepairUserText(request: GenerateRequest, plan: StoryPlan, issues: readonly ControlIssue[]): string {
  const faulty = [...new Set(issues.map((i) => i.story))];
  const whole = faulty.includes(null);
  const stories = faulty.filter((s): s is number => s !== null).sort((a, b) => a - b);
  const scope = whole
    ? "Un problème concerne toute la séquence : corrige ce qu'il faut, en changeant le moins possible."
    : `Corrige uniquement ${stories.length > 1 ? "les stories" : "la story"} ${stories.map((s) => s + 1).join(", ")}. Recopie toutes les autres stories mot pour mot, accents et proofIds compris.`;
  return [
    buildGenerateUserText(request),
    "Une première version a été écrite, mais les contrôles automatiques ont trouvé des problèmes bloquants.",
    tag("plan_a_corriger", JSON.stringify(toModelPlan(plan), null, 2)),
    tag("problemes", formatProblems(issues)),
    `${scope} Un chiffre tiré d'une preuve se corrige en citant la preuve dans proofIds ; un chiffre qui ne vient d'aucune preuve se retire. Renvoie la séquence complète des 5 stories, dans le même format.`,
  ].join("\n\n");
}

// ---------------------------------------------------------------------------------------------
// « Refaire cette story »

/** Place de la story dans la séquence : ce qu'elle prolonge, ce qu'elle amène, sa fonction propre. */
function storyPosition(plan: StoryPlan, index: number): string {
  const n = index + 1;
  const slot = SEQUENCE_LAYOUT[index];
  const lines = [`Story ${n} (${slot.role}, photo ${slot.photo + 1}).`];
  if (isStructureId(plan.structureId)) {
    const s = getStructure(plan.structureId);
    lines.push(`Structure ${s.id} (${s.nom}), temps de cette story : ${s.temps[index]}`);
  }
  if (slot.continues) {
    lines.push(`C'est une suite : elle s'affiche sous la story ${n - 1}, grisée. Elle prolonge directement la story ${n - 1}, sans la répéter, et la scène des deux stories tient en ${LIMITES.scene} caractères.`);
  }
  if (index + 1 < STORY_COUNT && SEQUENCE_LAYOUT[index + 1].continues) {
    lines.push(`La story ${n + 1} s'affichera dessous et la prolonge (elle ne change pas) : cette story doit l'amener naturellement.`);
  } else if (index + 1 < STORY_COUNT) {
    lines.push(`La story ${n + 1} (inchangée) suit : garde le fil vers elle.`);
  }
  if (index === 0) lines.push(`C'est l'accroche : 1 ou 2 paragraphes, ${LIMITES.accrocheMots} mots au plus.`);
  if (index === 2) lines.push("Elle se termine par deux-points ou par une question, qui donne envie de voir la story 4.");
  if (index === STORY_COUNT - 1) lines.push("Elle se termine par l'appel final en deux temps : un petit geste, puis l'appel à l'action du contexte.");
  return lines.join("\n");
}

function rewriteModeInstruction(request: RewriteStoryRequest): string {
  if (request.mode === "texte") {
    return `Mode texte : la séquence reprend mot pour mot un texte de l'auteur. La nouvelle story contient EXACTEMENT les mêmes mots que la version actuelle, dans le même ordre, sans en ajouter, en retirer ni en changer un seul. ${TEXTE_RULES}`;
  }
  return "Écris une nouvelle version de cette story, différente de l'actuelle, dans la voix de l'auteur, qui garde le fil de la séquence (voir angle dans <sequence_actuelle>).";
}

/** Message utilisateur de « Refaire cette story ». */
export function buildRewriteUserText(request: RewriteStoryRequest): string {
  const n = request.storyIndex + 1;
  const instruction = request.instruction.trim();
  return [
    `Refais uniquement la story ${n} de la séquence ci-dessous. Les 4 autres stories ne changent pas : tiens-en compte pour la cohérence, sans les réécrire.`,
    storyPosition(request.plan, request.storyIndex),
    rewriteModeInstruction(request),
    instruction
      ? `Souhait de l'auteur pour cette story, dans <consigne> : suis-le tant qu'il respecte la méthode.\n${tag("consigne", neutralizeTags(instruction))}`
      : null,
    formatContext(request.context),
    formatVoice(request.context),
    formatSource(request),
    tag("sequence_actuelle", neutralizeTags(JSON.stringify(toModelPlan(request.plan), null, 2))),
    `Renvoie uniquement la nouvelle story ${n} (role et paragraphs, avec proofIds pour chaque paragraphe).`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Message de réparation de « Refaire cette story » : la demande, la story écrite, les problèmes. */
export function buildRewriteRepairUserText(request: RewriteStoryRequest, story: PlanStory, issues: readonly ControlIssue[]): string {
  return [
    buildRewriteUserText(request),
    `Une première version de la story ${request.storyIndex + 1} a été écrite, mais les contrôles automatiques ont trouvé des problèmes bloquants.`,
    tag("story_a_corriger", JSON.stringify(toModelStory(story), null, 2)),
    tag("problemes", formatProblems(issues)),
    `Corrige ces problèmes en changeant le moins possible, et renvoie la story ${request.storyIndex + 1} corrigée, dans le même format.`,
  ].join("\n\n");
}

// ---------------------------------------------------------------------------------------------
// Idées

/** Message utilisateur d'une demande d'idées. */
export function buildIdeasUserText(request: IdeasRequest): string {
  const hasProofs = request.context.proofs.length > 0;
  const allowed = STRUCTURES.filter((s) => hasProofs || !s.requiresProofs).map((s) => s.id);
  return [
    "Propose 5 idées de séquences.",
    `Structures possibles : ${allowed.join(", ")}.`,
    formatContext(request.context),
    formatVoice(request.context),
    request.theme.trim() ? tag("theme", neutralizeTags(request.theme.trim())) : null,
    formatAvoid(request.avoid),
    hasProofs
      ? "Une idée peut s'appuyer sur une preuve du contexte, en reprenant le fait tel qu'il y est écrit (jamais un chiffre ou un résultat absent des preuves)."
      : null,
    "Chaque idée doit être différente de celles de <a_eviter> s'il y en a.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Blocs système : la partie commune puis la consigne de la tâche, chacun avec un point de cache. */
export function buildSystem(task: "sequence" | "story" | "idees"): BetaTextBlockParam[] {
  const consigne = { sequence: SYSTEM_SEQUENCE, story: SYSTEM_STORY, idees: SYSTEM_IDEES }[task];
  return [
    { type: "text", text: SYSTEM_FIXE, cache_control: { type: "ephemeral" } },
    { type: "text", text: consigne, cache_control: { type: "ephemeral" } },
  ];
}

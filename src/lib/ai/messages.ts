// Construction des messages envoyés à Claude. Le système (fixe, mis en cache) porte la méthode ;
// le message utilisateur porte les données de la requête, toujours entre balises.
import "server-only";
import type { BetaTextBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { BrandContext, ControlIssue, GenerateRequest, IdeasRequest, StoryPlan } from "@/domain/story-plan";
import { getStructure, isStructureId, STRUCTURES, type StructureId } from "@/domain/structures";
import { SYSTEM_FIXE, SYSTEM_IDEES, SYSTEM_SEQUENCE } from "./prompts/system";
import { toModelPlan } from "./schemas";

/** Balises de données utilisées dans les messages (et neutralisées dans le contenu de l'utilisateur). */
export const DATA_TAGS = [
  "contexte",
  "idee",
  "texte_auteur",
  "a_eviter",
  "plan_a_corriger",
  "problemes",
  "theme",
] as const;

const TAG_PATTERN = new RegExp(`<\\s*/?\\s*(?:${DATA_TAGS.join("|")})\\b[^>]*>`, "gi");

/** Retire du contenu de l'utilisateur toute balise qui imiterait nos délimiteurs de données. */
export function neutralizeTags(value: string): string {
  return value.replace(TAG_PATTERN, " ");
}

function tag(name: (typeof DATA_TAGS)[number], body: string): string {
  return `<${name}>\n${body}\n</${name}>`;
}

const orEmpty = (value: string) => (value.trim() ? neutralizeTags(value.trim()) : "(non renseigné)");

export function formatContext(context: BrandContext): string {
  const proofs = context.proofs.length
    ? context.proofs.map((p) => `- ${neutralizeTags(p)}`).join("\n")
    : "(aucune : n'écris aucun chiffre, résultat, client ni témoignage)";
  const forbidden = context.forbidden.length ? context.forbidden.map(neutralizeTags).join(" ; ") : "(aucun)";
  return tag(
    "contexte",
    [
      `Nom ou marque : ${orEmpty(context.name)}`,
      `Activité : ${orEmpty(context.activity)}`,
      `Offre : ${orEmpty(context.offer)}`,
      `Cible : ${orEmpty(context.target)}`,
      `Appel à l'action : ${orEmpty(context.cta)}`,
      `Ton : ${orEmpty(context.tone)}`,
      `Preuves autorisées :\n${proofs}`,
      `Mots interdits : ${forbidden}`,
    ].join("\n"),
  );
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
  return `Structure : choisis la plus adaptée à l'idée parmi ${allowedStructures(request).join(", ")}, et renvoie son identifiant dans structureId.`;
}

function modeInstruction(request: GenerateRequest): string {
  if (request.mode === "texte") {
    return `Mode texte : <texte_auteur> contient un texte déjà écrit par l'auteur. Répartis-le sur les 5 stories en conservant TOUS ses mots, dans l'ordre, sans en ajouter, en retirer ni en changer un seul (aucune reformulation, aucune correction, aucun mot de liaison ajouté). Tu peux seulement couper le texte en stories et en paragraphes, et choisir les accents. Garde la ponctuation et les majuscules de l'auteur. La conservation des mots passe avant les limites de place et avant la structure : la structure sert seulement à nommer les rôles et à choisir où couper.`;
  }
  return `Mode idée : écris la séquence à partir de l'idée de <idee>. Si l'idée est vague, choisis un angle précis et concret, et formule-le dans angle.`;
}

/** Message utilisateur d'une génération (partie variable). */
export function buildGenerateUserText(request: GenerateRequest): string {
  const source =
    request.mode === "texte" ? tag("texte_auteur", neutralizeTags(request.idea)) : tag("idee", neutralizeTags(request.idea));
  return [
    "Écris la séquence de 5 stories.",
    modeInstruction(request),
    structureInstruction(request),
    formatContext(request.context),
    formatAvoid(request.avoid),
    source,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Message utilisateur de l'appel de réparation : le brief initial, le plan, les problèmes. */
export function buildRepairUserText(request: GenerateRequest, plan: StoryPlan, issues: readonly ControlIssue[]): string {
  const faulty = [...new Set(issues.map((i) => i.story))];
  const whole = faulty.includes(null);
  const stories = faulty.filter((s): s is number => s !== null).sort((a, b) => a - b);
  const scope = whole
    ? "Un problème concerne toute la séquence : corrige ce qu'il faut, en changeant le moins possible."
    : `Corrige uniquement ${stories.length > 1 ? "les stories" : "la story"} ${stories.map((s) => s + 1).join(", ")}. Recopie toutes les autres stories mot pour mot, accents compris.`;
  const problems = issues
    .map((i) => `- ${i.story === null ? "Séquence" : `Story ${i.story + 1}`} : ${i.message}`)
    .join("\n");
  return [
    buildGenerateUserText(request),
    "Une première version a été écrite, mais les contrôles automatiques ont trouvé des problèmes bloquants.",
    tag("plan_a_corriger", JSON.stringify(toModelPlan(plan), null, 2)),
    tag("problemes", problems),
    `${scope} Renvoie la séquence complète des 5 stories, dans le même format.`,
  ].join("\n\n");
}

/** Message utilisateur d'une demande d'idées. */
export function buildIdeasUserText(request: IdeasRequest): string {
  const hasProofs = request.context.proofs.length > 0;
  const allowed = STRUCTURES.filter((s) => hasProofs || !s.requiresProofs).map((s) => s.id);
  return [
    "Propose 5 idées de séquences.",
    `Structures possibles : ${allowed.join(", ")}.`,
    formatContext(request.context),
    request.theme.trim() ? tag("theme", neutralizeTags(request.theme.trim())) : null,
    formatAvoid(request.avoid),
    "Chaque idée doit être différente de celles de <a_eviter> s'il y en a.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Blocs système : la partie commune puis la consigne de la tâche, chacun avec un point de cache. */
export function buildSystem(task: "sequence" | "idees"): BetaTextBlockParam[] {
  return [
    { type: "text", text: SYSTEM_FIXE, cache_control: { type: "ephemeral" } },
    { type: "text", text: task === "sequence" ? SYSTEM_SEQUENCE : SYSTEM_IDEES, cache_control: { type: "ephemeral" } },
  ];
}

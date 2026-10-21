// StoryPlan v1 : ce que l'IA écrit (le contenu), indépendant du rendu.
// Contrat partagé entre src/lib/ai/ (production) et src/lib/compose/ (mise en forme).
import { z } from "zod";

/**
 * Structure fixe d'une séquence, reprise de la référence observée (docs/REFERENCE_EDITEUR_MOBILE.md §2) :
 * 5 stories sur 3 photos. Une story « suite » reprend la photo et les paragraphes de la story précédente
 * (grisés), puis ajoute les siens dessous.
 */
export const SEQUENCE_LAYOUT = [
  { photo: 0, continues: false, role: "accroche" },
  { photo: 1, continues: false, role: "développement" },
  { photo: 1, continues: true, role: "développement (suite)" },
  { photo: 2, continues: false, role: "bascule" },
  { photo: 2, continues: true, role: "appel à l'action" },
] as const;

export const STORY_COUNT = SEQUENCE_LAYOUT.length;
export const PHOTO_COUNT = 3;
/** On accepte 2 ou 3 photos, comme la référence (« deux ou trois photos »). */
export const MIN_PHOTO_COUNT = 2;

/**
 * Photo de la story `storyIndex` (0-4) selon le nombre de photos fournies.
 * 3 photos : SEQUENCE_LAYOUT. 2 photos : la photo 1 sert aux stories 1, 4 et 5, la photo 2 aux stories 2 et 3.
 * 1 photo : la même partout. 0 photo : null (fond de secours).
 */
export function photoIndexFor(storyIndex: number, photoCount: number): number | null {
  if (photoCount <= 0) return null;
  if (photoCount === 1) return 0;
  if (photoCount === 2) return [0, 1, 1, 0, 0][storyIndex] ?? 0;
  return SEQUENCE_LAYOUT[storyIndex]?.photo ?? 0;
}

export const ParagraphSchema = z.object({
  /** Texte brut, sans balisage. Une à trois lignes à l'écran. */
  text: z.string().trim().min(1).max(320),
  /** Expressions mises en valeur, recopiées telles quelles depuis `text` (voir accentRanges). */
  accents: z.array(z.string().trim().min(1).max(80)).max(3),
  /**
   * Preuves du contexte citées par ce paragraphe (identifiants « p1 », « p2 »… = proofs[0], proofs[1]…).
   * Tout chiffre ou résultat client doit venir d'une preuve référencée ici.
   */
  proofIds: z.array(z.string().regex(/^p\d{1,2}$/)).max(3).optional(),
});
export type Paragraph = z.infer<typeof ParagraphSchema>;

export const PlanStorySchema = z.object({
  /** Étiquette lisible du rôle de la story (« accroche », « liste », « cliffhanger »…). */
  role: z.string().trim().min(1).max(40),
  paragraphs: z.array(ParagraphSchema).min(1).max(4),
});
export type PlanStory = z.infer<typeof PlanStorySchema>;

export const StoryPlanSchema = z.object({
  schemaVersion: z.literal(1),
  /** Identifiant d'une structure de src/domain/structures.ts. */
  structureId: z.string().min(1).max(40),
  /** L'idée centrale de la séquence, en une phrase. */
  angle: z.string().trim().min(1).max(200),
  stories: z.array(PlanStorySchema).length(STORY_COUNT),
});
export type StoryPlan = z.infer<typeof StoryPlanSchema>;

// ---------------------------------------------------------------------------------------------
// Contexte de marque, saisi par l'utilisateur (« Mon contexte ») et envoyé avec chaque demande.

const shortText = z.string().trim().max(400);
export const BrandContextSchema = z.object({
  /** Nom ou prénom affiché, marque. */
  name: shortText.default(""),
  /** Identifiant Instagram, sans @ (carte profil ; lecture automatique du compte plus tard). */
  handle: z.string().trim().max(60).default(""),
  /** Bio courte affichée sur la carte profil. */
  bio: shortText.default(""),
  /** Qui tu es, ce que tu fais (« partenaire IA des PME… »). */
  activity: shortText.default(""),
  /** Ce que tu vends, comment ça se passe. */
  offer: shortText.default(""),
  /** Client idéal : qui, situation, ce qu'il veut. */
  target: shortText.default(""),
  /** Appel à l'action final (« audit offert », « réponds AUDIT en message privé »). */
  cta: shortText.default(""),
  /** Ton : tutoiement, expressions, emojis ou non. */
  tone: shortText.default(""),
  /** Preuves réelles autorisées (témoignages, chiffres). Vide = aucune preuve chiffrée possible. */
  proofs: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  /** Mots et tournures interdits. */
  forbidden: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  /**
   * Exemples de ta voix : texte brut de tes dernières séquences EXPORTÉES (les plus récentes d'abord),
   * gardés sur l'appareil et envoyés comme exemples de ton (jamais comme instructions).
   */
  voiceExamples: z.array(z.string().trim().min(1).max(1500)).max(3).default([]),
});
export type BrandContext = z.infer<typeof BrandContextSchema>;

/** Identifiant de la preuve `context.proofs[index]`. */
export function proofId(index: number): string {
  return `p${index + 1}`;
}

// ---------------------------------------------------------------------------------------------
// API HTTP

export const GenerateRequestSchema = z.object({
  /**
   * L'idée (mode « idee ») ou le texte déjà écrit à conserver mot pour mot (mode « texte »).
   * FACULTATIVE en mode « idee » : vide = l'IA choisit elle-même un sujet à partir du contexte (profil).
   * Obligatoire en mode « texte » (la longueur minimale est contrôlée par le serveur).
   */
  idea: z.string().trim().max(2500).default(""),
  mode: z.enum(["idee", "texte"]).default("idee"),
  /** "auto" laisse l'IA choisir la structure la plus adaptée, en évitant `avoid`. */
  structureId: z.string().min(1).max(40).default("auto"),
  context: BrandContextSchema.default(BrandContextSchema.parse({})),
  /** Structures et accroches récentes, pour ne pas se répéter. */
  avoid: z.array(z.string().max(200)).max(10).default([]),
});
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

/**
 * « Refaire cette story » : réécrire UNE story d'un plan existant, sans toucher aux autres.
 * Réponse : GenerateResponse dont le plan ne diffère que par stories[storyIndex].
 */
export const RewriteStoryRequestSchema = z.object({
  plan: StoryPlanSchema,
  storyIndex: z.number().int().min(0).max(STORY_COUNT - 1),
  /** Consigne facultative de l'utilisateur (« plus court », « plus direct »…). */
  instruction: z.string().trim().max(300).default(""),
  idea: z.string().trim().max(2500).default(""),
  mode: z.enum(["idee", "texte"]).default("idee"),
  context: BrandContextSchema.default(BrandContextSchema.parse({})),
});
export type RewriteStoryRequest = z.infer<typeof RewriteStoryRequestSchema>;

export interface ControlIssue {
  /** Index de story (0-4), ou null pour la séquence entière. */
  story: number | null;
  code: string;
  message: string;
  /** « bloquant » empêche ControlReport.ok ; « conseil » est affiché sans bloquer. */
  severity?: "bloquant" | "conseil";
}

export interface ControlReport {
  ok: boolean;
  issues: ControlIssue[];
}

export interface GenerateResponse {
  plan: StoryPlan;
  controls: ControlReport;
  meta: {
    model: string;
    ms: number;
    repaired: boolean;
    mock: boolean;
    usage?: { inputTokens: number; outputTokens: number };
    /** Tokens d'entrée lus depuis le cache et écrits dans le cache (cumul des appels). */
    cache?: { readTokens: number; writeTokens: number };
    /** Coût estimé de la génération en dollars (prix publics du modèle), si connu. */
    costUsd?: number;
    /** Modèle de repli qui a servi la réponse après un refus du modèle demandé. */
    fallbackModel?: string;
    /** Version de la méthode d'écriture utilisée (ex. "v1"). */
    methodVersion?: string;
  };
}

export const IdeasRequestSchema = z.object({
  context: BrandContextSchema.default(BrandContextSchema.parse({})),
  /** Thème facultatif pour orienter les idées. */
  theme: z.string().trim().max(300).default(""),
  avoid: z.array(z.string().max(200)).max(20).default([]),
});
export type IdeasRequest = z.infer<typeof IdeasRequestSchema>;

export interface IdeaSuggestion {
  idea: string;
  structureId: string;
  hook: string;
}

export interface IdeasResponse {
  ideas: IdeaSuggestion[];
  meta: {
    model: string;
    ms: number;
    mock: boolean;
    usage?: { inputTokens: number; outputTokens: number };
    costUsd?: number;
    fallbackModel?: string;
  };
}

/** Corps d'erreur de toutes les routes : message en français, lisible par l'utilisateur. */
export interface ApiError {
  error: { code: string; message: string };
}

// ---------------------------------------------------------------------------------------------
// Accents : partagé par les contrôles (IA) et le rendu (marquages).

export interface AccentRange {
  start: number;
  end: number;
}

/**
 * Positions des accents dans `text`, à la première occurrence non chevauchante, dans l'ordre du texte.
 * `normalize` doit transformer le texte et les accents de la même façon (ex. composition française
 * au rendu : apostrophes, espaces insécables) ; elle doit conserver la longueur ou être appliquée
 * avant tout calcul de position. Les accents introuvables sont renvoyés dans `missing`.
 */
export function accentRanges(
  text: string,
  accents: readonly string[],
  normalize: (s: string) => string = (s) => s,
): { ranges: AccentRange[]; missing: string[] } {
  const source = normalize(text);
  const ranges: AccentRange[] = [];
  const missing: string[] = [];
  for (const raw of accents) {
    const accent = normalize(raw).trim();
    if (!accent) continue;
    let from = 0;
    let found = -1;
    while (from <= source.length) {
      const at = source.indexOf(accent, from);
      if (at === -1) break;
      const end = at + accent.length;
      if (!ranges.some((r) => at < r.end && end > r.start)) {
        found = at;
        break;
      }
      from = at + 1;
    }
    if (found === -1) missing.push(raw);
    else ranges.push({ start: found, end: found + accent.length });
  }
  ranges.sort((a, b) => a.start - b.start);
  return { ranges, missing };
}

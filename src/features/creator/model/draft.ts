// État métier de la page (sans Konva ni photos décodées) et brouillon local (localStorage).
import { z } from "zod";
import { DEFAULT_CONTEXT } from "@/domain/example-plan";
import { DECORATIONS, type DecorationId, type Drawings, type RenderOptions } from "@/domain/render-options";
import { DRAWING_LIMITS, type HexColor } from "@/domain/story-document";
import {
  BrandContextSchema,
  PHOTO_COUNT,
  StoryPlanSchema,
  type BrandContext,
  type ControlReport,
  type StoryPlan,
} from "@/domain/story-plan";
import { AUTO_STRUCTURE, isStructureId, type StructureChoice } from "@/domain/structures";
import { DEFAULT_STYLE_ID, STYLE_PRESETS } from "@/styles/presets";

export type Mode = "idee" | "texte";

export interface Crop {
  focalX: number;
  focalY: number;
  zoom: number;
}

export const DEFAULT_CROP: Crop = { focalX: 0.5, focalY: 0.5, zoom: 1 };

/** Options du panneau Style (le style lui-même est `Snapshot.styleId`). */
export type StyleOptions = Omit<RenderOptions, "styleId">;

export const DEFAULT_STYLE_OPTIONS: StyleOptions = { accentColor: null, showAccents: true, decoration: null };

/** Ce que l’historique annuler / rétablir capture : plan, style et options, photos, cadrages, dessins. */
export interface Snapshot {
  plan: StoryPlan | null;
  /** Contrôles de l’IA au moment de la génération de ce plan. */
  controls: ControlReport | null;
  styleId: string;
  /** Identifiants des photos 1, 2, 3 (null = emplacement vide). */
  photos: Array<string | null>;
  /** Cadrage par identifiant de photo (il suit la photo quand on échange). */
  crops: Record<string, Crop>;
  /** Couleur d’accent, mots en évidence, décoration : s’appliquent aux 5 stories. */
  options: StyleOptions;
  /** Dessins du Crayon par story (0-4). */
  drawings: Drawings;
}

export const EMPTY_SNAPSHOT: Snapshot = {
  plan: null,
  controls: null,
  styleId: DEFAULT_STYLE_ID,
  photos: Array.from({ length: PHOTO_COUNT }, () => null),
  crops: {},
  options: DEFAULT_STYLE_OPTIONS,
  drawings: {},
};

/** Nombre de photos ajoutées. */
export const photoCount = (photos: ReadonlyArray<string | null>) => photos.filter(Boolean).length;

/** Photos tassées au début (pas de trou : [a, null, c] → [a, c, null]), toujours PHOTO_COUNT emplacements. */
export function compactPhotos(photos: ReadonlyArray<string | null>): Array<string | null> {
  const kept = photos.filter((id): id is string => !!id).slice(0, PHOTO_COUNT);
  return [...kept, ...Array.from({ length: PHOTO_COUNT - kept.length }, () => null)];
}

/** Une génération passée : sert à ne pas répéter la structure et l’accroche (avoid). */
export interface RecentGeneration {
  structureId: string;
  hook: string;
}

export interface Draft {
  idea: string;
  mode: Mode;
  structure: StructureChoice;
  snapshot: Snapshot;
  recent: RecentGeneration[];
}

export const DRAFT_KEY = "story.brouillon.v1";
export const CONTEXT_KEY = "story.contexte.v1";
export const PHOTO_DRAFT_ID = "brouillon-courant";
export const RECENT_LIMIT = 5;
export const IDEA_MIN = 3;
export const IDEA_MAX = 2500;
export const VOICE_KEY = "story.voix.v1";
export const AVATAR_KEY = "story.avatar.v1";
/** Séquences exportées gardées comme exemples de ta voix. */
export const VOICE_LIMIT = 3;
export const VOICE_MAX_CHARS = 1500;
const HEX = /^#[0-9A-Fa-f]{6}$/;

const CropSchema = z.object({
  focalX: z.number().min(0).max(1),
  focalY: z.number().min(0).max(1),
  zoom: z.number().min(1).max(2),
});

const ControlReportSchema = z.object({
  ok: z.boolean(),
  issues: z.array(
    z.object({
      story: z.number().int().min(0).max(4).nullable(),
      code: z.string(),
      message: z.string(),
      severity: z.enum(["bloquant", "conseil"]).optional(),
    }),
  ),
});

const StyleOptionsSchema = z.object({
  accentColor: z
    .string()
    .regex(HEX)
    .nullable()
    .transform((c) => c as HexColor | null),
  showAccents: z.boolean(),
  decoration: z
    .string()
    .nullable()
    .refine((d) => d === null || DECORATIONS.some((x) => x.id === d))
    .transform((d) => d as DecorationId | null),
});

const StrokeSchema = z.object({
  id: z.string().min(1).max(64),
  tool: z.enum(["stylo", "surligneur", "ovale"]),
  color: z
    .string()
    .regex(HEX)
    .transform((c) => c as HexColor),
  width: z.number().positive().max(DRAWING_LIMITS.maxWidth),
  points: z.array(z.number().finite()).min(2).max(DRAWING_LIMITS.pointsPerStroke * 2),
});

const DrawingsSchema = z
  .record(z.string().regex(/^[0-4]$/), z.array(StrokeSchema).max(DRAWING_LIMITS.strokesPerStory))
  .transform((d) => d as unknown as Drawings);

const DraftSchema = z.object({
  version: z.literal(1),
  idea: z.string().max(IDEA_MAX),
  mode: z.enum(["idee", "texte"]),
  structure: z.string().refine((s) => s === AUTO_STRUCTURE || isStructureId(s)),
  snapshot: z.object({
    plan: StoryPlanSchema.nullable(),
    controls: ControlReportSchema.nullable(),
    styleId: z.string().refine((id) => STYLE_PRESETS.some((s) => s.id === id)),
    photos: z.array(z.string().nullable()).length(PHOTO_COUNT),
    crops: z.record(z.string(), CropSchema),
    // Absents des brouillons d’avant la phase 3 : valeurs par défaut.
    options: StyleOptionsSchema.default(DEFAULT_STYLE_OPTIONS),
    drawings: DrawingsSchema.default({}),
  }),
  recent: z.array(z.object({ structureId: z.string().max(40), hook: z.string().max(200) })).max(RECENT_LIMIT),
  savedAt: z.number(),
});

/** localStorage peut être absent ou lever (navigation privée, stockage bloqué). */
function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export type LoadDraftResult = { status: "absent" } | { status: "ok"; draft: Draft } | { status: "invalid" } | { status: "unavailable" };

export function loadDraft(): LoadDraftResult {
  const store = storage();
  if (!store) return { status: "unavailable" };
  let raw: string | null;
  try {
    raw = store.getItem(DRAFT_KEY);
  } catch {
    return { status: "unavailable" };
  }
  if (!raw) return { status: "absent" };
  try {
    const parsed = DraftSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { status: "invalid" };
    const { idea, mode, structure, snapshot, recent } = parsed.data;
    return { status: "ok", draft: { idea, mode, structure: structure as StructureChoice, snapshot, recent } };
  } catch {
    return { status: "invalid" };
  }
}

/** Enregistre le brouillon ; renvoie false si le stockage est indisponible ou plein. */
export function saveDraft(draft: Draft): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(DRAFT_KEY, JSON.stringify({ version: 1, ...draft, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(): void {
  try {
    storage()?.removeItem(DRAFT_KEY);
  } catch {
    // rien à effacer
  }
}

export function loadContext(): BrandContext {
  try {
    const raw = storage()?.getItem(CONTEXT_KEY);
    if (!raw) return DEFAULT_CONTEXT;
    const parsed = BrandContextSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_CONTEXT;
  } catch {
    return DEFAULT_CONTEXT;
  }
}

export function saveContext(context: BrandContext): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(CONTEXT_KEY, JSON.stringify(context));
    return true;
  } catch {
    return false;
  }
}

/** Texte de l’accroche (story 1), pour avoid et l’historique des générations. */
export function hookOf(plan: StoryPlan): string {
  return plan.stories[0].paragraphs
    .map((p) => p.text)
    .join(" ")
    .slice(0, 200);
}

export function pushRecent(recent: readonly RecentGeneration[], plan: StoryPlan): RecentGeneration[] {
  return [{ structureId: plan.structureId, hook: hookOf(plan) }, ...recent].slice(0, RECENT_LIMIT);
}

// ── Mémoire de ta voix : texte des dernières séquences exportées (sur l’appareil) ───────────

/** Texte brut d’une séquence : une story par bloc, séparées par une ligne vide. */
export function sequenceText(plan: StoryPlan): string {
  return plan.stories
    .map((story) => story.paragraphs.map((p) => p.text).join("\n"))
    .join("\n\n")
    .slice(0, VOICE_MAX_CHARS)
    .trim();
}

/** La plus récente d’abord, sans doublon, VOICE_LIMIT au plus. */
export function pushVoice(voice: readonly string[], text: string): string[] {
  const clean = text.trim().slice(0, VOICE_MAX_CHARS);
  if (!clean) return [...voice];
  return [clean, ...voice.filter((v) => v !== clean)].slice(0, VOICE_LIMIT);
}

export function loadVoice(): string[] {
  try {
    const raw = storage()?.getItem(VOICE_KEY);
    if (!raw) return [];
    const parsed = z.array(z.string().trim().min(1).max(VOICE_MAX_CHARS)).max(VOICE_LIMIT).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function saveVoice(voice: readonly string[]): boolean {
  const store = storage();
  if (!store) return false;
  try {
    if (voice.length) store.setItem(VOICE_KEY, JSON.stringify(voice));
    else store.removeItem(VOICE_KEY);
    return true;
  } catch {
    return false;
  }
}

// ── Photo de profil : petite image JPEG en data URL, gardée sur l’appareil, jamais envoyée ────

const AVATAR_MAX_CHARS = 60_000;

export function loadAvatar(): string | null {
  try {
    const raw = storage()?.getItem(AVATAR_KEY);
    return raw && raw.startsWith("data:image/") && raw.length <= AVATAR_MAX_CHARS ? raw : null;
  } catch {
    return null;
  }
}

export function saveAvatar(dataUrl: string | null): boolean {
  const store = storage();
  if (!store) return false;
  try {
    if (dataUrl && dataUrl.length <= AVATAR_MAX_CHARS) store.setItem(AVATAR_KEY, dataUrl);
    else store.removeItem(AVATAR_KEY);
    return true;
  } catch {
    return false;
  }
}

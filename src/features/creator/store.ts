// État métier de la page, hors React et hors Konva : idée, plan, style, photos, historique, brouillon,
// génération. Les composants le lisent avec useSyncExternalStore (voir use-creator.ts).
import { DEFAULT_CONTEXT, EXAMPLE_PLAN } from "@/domain/example-plan";
import type { Stroke } from "@/domain/render-options";
import { DRAWING_LIMITS } from "@/domain/story-document";
import { MIN_PHOTO_COUNT, PHOTO_COUNT, type BrandContext, type GenerateRequest, type Paragraph, type StoryPlan } from "@/domain/story-plan";
import { AUTO_STRUCTURE, type StructureChoice } from "@/domain/structures";
import { fontRequirementsForSequence } from "@/lib/compose";
import { loadFonts } from "@/lib/fonts/load-fonts";
import { deletePhotos, importPhoto, isPhotoImportError, loadPhotos, releasePhoto, savePhotos, type ImportedPhoto } from "@/lib/photos";
import { releaseAllCutouts, releaseCutout } from "@/lib/segmentation";
import { requestGeneration, requestRewrite, type ApiFailure, type ApiResult } from "./model/api";
import {
  EMPTY_SNAPSHOT,
  PHOTO_DRAFT_ID,
  clearDraft,
  compactPhotos,
  hookOf,
  loadAvatar,
  loadContext,
  loadDraft,
  loadVoice,
  photoCount,
  pushRecent,
  pushVoice,
  saveAvatar,
  saveContext,
  saveDraft,
  saveVoice,
  sequenceText,
  type Crop,
  type Mode,
  type RecentGeneration,
  type Snapshot,
  type StyleOptions,
} from "./model/draft";
import { allStates, commit, createHistory, redo, undo, type History } from "./model/history";

export type Phase = "loading" | "create" | "generating" | "editor";

export interface GenerationState {
  kind: "nouvelle" | "refaire";
  startedAt: number;
  /** « ecriture » : en attente de l’IA ; « mise-en-page » : polices et composition ; « erreur ». */
  step: "ecriture" | "mise-en-page" | "erreur";
  error: ApiFailure | null;
  /** Message d’information (demande relancée après une coupure en arrière-plan). */
  notice: string | null;
}

/** « Refaire cette story » en cours (ou en erreur), affiché dans l’éditeur. */
export interface RewriteState {
  storyIndex: number;
  instruction: string;
  startedAt: number;
  error: ApiFailure | null;
  notice: string | null;
}

export interface ImportProgress {
  total: number;
  done: number;
  fileName: string;
}

export interface PhotoError {
  fileName: string;
  message: string;
}

export interface CreatorState {
  phase: Phase;
  idea: string;
  mode: Mode;
  structure: StructureChoice;
  context: BrandContext;
  history: History<Snapshot>;
  recent: RecentGeneration[];
  storyIndex: number;
  /** Photos décodées par identifiant (y compris celles que l’historique peut faire revenir). */
  photos: ReadonlyMap<string, ImportedPhoto>;
  imports: ImportProgress | null;
  photoErrors: PhotoError[];
  generation: GenerationState | null;
  /** Chargement de l’exemple en cours. */
  exampleLoading: boolean;
  /** Avertissements sur la conservation du brouillon (stockage indisponible…). */
  notices: string[];
  /** Change quand le plan est remplacé sans passer par le panneau Texte (annuler, génération…). */
  planVersion: number;
  /** Mémoire de ta voix : texte des 3 dernières séquences exportées (la plus récente d’abord). */
  voice: string[];
  /** Photo de profil (data URL JPEG, sur l’appareil seulement, jamais envoyée). */
  avatar: string | null;
  /** Refus de l’API à afficher sur l’écran Créer (texte trop court en mode texte…). */
  createError: ApiFailure | null;
  rewrite: RewriteState | null;
}

/** Photos de test (public/samples/test/), pour l’exemple quand aucune photo n’a été ajoutée. */
export const SAMPLE_PHOTOS = ["/samples/test/mer-plan-large.jpg", "/samples/test/salle-plan-moyen.jpg", "/samples/test/portrait.jpg"];

const SAVE_DELAY_MS = 500;
/** Le temps de voir la barre à 100 % avant d’ouvrir l’éditeur. */
const FULL_BAR_MS = 350;
const RESUMED =
  "La demande a été coupée pendant que l’écran était en veille ou que la page était en arrière-plan : on la relance.";

/** Résout dès que la page est au premier plan (ou que la demande est annulée). */
function waitVisible(signal: AbortSignal): Promise<void> {
  if (document.visibilityState === "visible" || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      if (document.visibilityState !== "visible" && !signal.aborted) return;
      document.removeEventListener("visibilitychange", done);
      signal.removeEventListener("abort", done);
      resolve();
    };
    document.addEventListener("visibilitychange", done);
    signal.addEventListener("abort", done);
  });
}

/**
 * Garde l’écran allumé pendant `task` (Wake Lock, quand le navigateur le permet) ; le verrou, perdu quand la
 * page passe en arrière-plan, est repris au retour, puis libéré à la fin.
 */
async function keepScreenOn<T>(task: () => Promise<T>): Promise<T> {
  let lock: WakeLockSentinel | null = null;
  let finished = false;
  const acquire = async () => {
    if (finished || document.visibilityState !== "visible" || !("wakeLock" in navigator)) return;
    try {
      const next = await navigator.wakeLock.request("screen");
      if (finished) void next.release().catch(() => undefined);
      else lock = next;
    } catch {
      // refusé (économie d’énergie…) : sans effet sur la génération
    }
  };
  const onVisible = () => {
    if (document.visibilityState === "visible" && (!lock || lock.released)) void acquire();
  };
  document.addEventListener("visibilitychange", onVisible);
  await acquire();
  try {
    return await task();
  } finally {
    finished = true;
    document.removeEventListener("visibilitychange", onVisible);
    const held = lock as WakeLockSentinel | null; // assigné dans `acquire`
    if (held && !held.released) void held.release().catch(() => undefined);
  }
}

/**
 * Envoie la demande ; si elle échoue faute de réseau ALORS que la page est passée en arrière-plan (iPhone
 * verrouillé, autre application), la relance UNE fois au retour au premier plan.
 */
async function sendResuming<T>(send: () => Promise<ApiResult<T>>, signal: AbortSignal, onResume: () => void): Promise<ApiResult<T>> {
  let wentHidden = document.visibilityState === "hidden";
  const onChange = () => {
    if (document.visibilityState === "hidden") wentHidden = true;
  };
  document.addEventListener("visibilitychange", onChange);
  let result: ApiResult<T>;
  try {
    result = await send();
  } finally {
    document.removeEventListener("visibilitychange", onChange);
  }
  if (result.ok || result.code !== "reseau" || !wentHidden || signal.aborted) return result;
  await waitVisible(signal);
  if (signal.aborted) return result;
  onResume();
  return send();
}
const PHOTOS_UNAVAILABLE =
  "Tes photos ne pourront pas être gardées sur cet appareil (navigation privée ou stockage bloqué) : elles restent utilisables tant que la page est ouverte.";
const DRAFT_UNAVAILABLE =
  "Le brouillon ne peut pas être enregistré sur cet appareil (navigation privée ou stockage bloqué) : ne ferme pas la page avant d’avoir exporté.";

type Listener = () => void;

export class CreatorStore {
  private state: CreatorState;
  private listeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private savedPhotosKey: string | null = null;
  private controller: AbortController | null = null;
  private generationId = 0;
  private started = false;

  constructor() {
    this.state = {
      phase: "loading",
      idea: "",
      mode: "idee",
      structure: AUTO_STRUCTURE,
      context: DEFAULT_CONTEXT,
      history: createHistory(EMPTY_SNAPSHOT),
      recent: [],
      storyIndex: 0,
      photos: new Map(),
      imports: null,
      photoErrors: [],
      generation: null,
      exampleLoading: false,
      notices: [],
      planVersion: 0,
      voice: [],
      avatar: null,
      createError: null,
      rewrite: null,
    };
  }

  // ── Abonnement ────────────────────────────────────────────────────────────────────────
  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = () => this.state;

  private set(patch: Partial<CreatorState>, persist = true) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
    if (persist && this.state.phase !== "loading") this.scheduleSave();
  }

  private get present() {
    return this.state.history.present;
  }

  // ── Démarrage : contexte, brouillon et photos ────────────────────────────────────────────
  async start() {
    if (this.started) return;
    this.started = true;
    const notices: string[] = [];
    const context = loadContext();
    const loaded = loadDraft();
    if (loaded.status === "unavailable") notices.push(DRAFT_UNAVAILABLE);
    if (loaded.status === "invalid") notices.push("Le brouillon enregistré était illisible : on repart d’une page blanche.");
    const draft = loaded.status === "ok" ? loaded.draft : null;

    const stored = await loadPhotos(PHOTO_DRAFT_ID);
    if (!this.started) {
      stored.photos.forEach(releasePhoto);
      return;
    }
    if (!stored.available) notices.push(PHOTOS_UNAVAILABLE);
    else if (stored.unreadable > 0) notices.push(`${stored.unreadable} photo(s) du brouillon n’ont pas pu être relues : ajoute-les de nouveau.`);
    else if (stored.message) notices.push(stored.message);

    const pool = new Map<string, ImportedPhoto>();
    const snapshot = draft ? { ...draft.snapshot } : EMPTY_SNAPSHOT;
    const wanted = new Set(snapshot.photos.filter((id): id is string => !!id));
    for (const photo of stored.photos) {
      if (wanted.has(photo.id)) pool.set(photo.id, photo);
      else releasePhoto(photo);
    }
    snapshot.photos = snapshot.photos.map((id) => (id && pool.has(id) ? id : null));
    this.savedPhotosKey = snapshot.photos.join("|");

    this.set(
      {
        phase: draft?.snapshot.plan ? "editor" : "create",
        context,
        idea: draft?.idea ?? "",
        mode: draft?.mode ?? "idee",
        structure: draft?.structure ?? AUTO_STRUCTURE,
        recent: draft?.recent ?? [],
        history: createHistory(snapshot),
        photos: pool,
        notices,
        planVersion: this.state.planVersion + 1,
        voice: loadVoice(),
        avatar: loadAvatar(),
      },
      false,
    );
  }

  /** Démontage : libère les photos (elles restent dans le brouillon). */
  dispose() {
    this.flushSave();
    this.controller?.abort();
    this.started = false;
    this.state.photos.forEach(releasePhoto);
    releaseAllCutouts();
    this.state = { ...this.state, phase: "loading", photos: new Map() };
  }

  // ── Brouillon ──────────────────────────────────────────────────────────────────────────
  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushSave(), SAVE_DELAY_MS);
  }

  flushSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (this.state.phase === "loading") return;
    const { idea, mode, structure, recent } = this.state;
    const ok = saveDraft({ idea, mode, structure, snapshot: this.present, recent });
    if (!ok && !this.state.notices.includes(DRAFT_UNAVAILABLE)) this.set({ notices: [...this.state.notices, DRAFT_UNAVAILABLE] }, false);
    const key = this.present.photos.join("|");
    if (key !== this.savedPhotosKey) {
      this.savedPhotosKey = key;
      const photos = this.present.photos.map((id) => (id ? this.state.photos.get(id) : undefined)).filter((p): p is ImportedPhoto => !!p);
      void savePhotos(PHOTO_DRAFT_ID, photos).then((result) => {
        if (!result.saved) {
          this.savedPhotosKey = null; // nouvel essai au prochain changement
          const message = result.available ? (result.message ?? "Les photos du brouillon n’ont pas pu être enregistrées.") : PHOTOS_UNAVAILABLE;
          if (!this.state.notices.includes(message)) this.set({ notices: [...this.state.notices, message] }, false);
        }
      });
    }
  }

  // ── Historique ─────────────────────────────────────────────────────────────────────────
  private commitSnapshot(next: Snapshot, group?: string, extra: Partial<CreatorState> = {}) {
    const history = commit(this.state.history, next, { group });
    this.set({ history, photos: this.collect(history, extra.photos ?? this.state.photos), ...extra });
  }

  /** Libère les photos qu’aucun état de l’historique ne référence plus. */
  private collect(history: History<Snapshot>, photos: ReadonlyMap<string, ImportedPhoto>) {
    const used = new Set(allStates(history).flatMap((s) => s.photos.filter((id): id is string => !!id)));
    if ([...photos.keys()].every((id) => used.has(id))) return photos;
    const kept = new Map<string, ImportedPhoto>();
    photos.forEach((photo, id) => {
      if (used.has(id)) kept.set(id, photo);
      else {
        releasePhoto(photo);
        releaseCutout(id);
      }
    });
    return kept;
  }

  undo = () => this.set({ history: undo(this.state.history), planVersion: this.state.planVersion + 1 });
  redo = () => this.set({ history: redo(this.state.history), planVersion: this.state.planVersion + 1 });

  // ── Écran Créer ────────────────────────────────────────────────────────────────────────
  setIdea = (idea: string) => this.set({ idea, createError: null });
  setMode = (mode: Mode) => this.set({ mode, createError: null });
  setStructure = (structure: StructureChoice) => this.set({ structure });
  /** Le contexte enregistré ne contient pas la mémoire de voix (gardée à part, ajoutée à l’envoi). */
  setContext = (context: BrandContext) => {
    const clean = { ...context, voiceExamples: [] };
    const saved = saveContext(clean);
    this.set({ context: clean });
    return saved;
  };
  /** Contexte envoyé à l’API : profil + exemples de ta voix. */
  requestContext = (): BrandContext => ({ ...this.state.context, voiceExamples: this.state.voice });
  setAvatar = (avatar: string | null) => {
    const saved = saveAvatar(avatar);
    this.set({ avatar }, false);
    return saved;
  };
  clearVoice = () => {
    saveVoice([]);
    this.set({ voice: [] }, false);
  };
  /** Export réussi : la séquence exportée rejoint la mémoire de ta voix. */
  rememberExport = () => {
    const plan = this.present.plan;
    if (!plan) return;
    const voice = pushVoice(this.state.voice, sequenceText(plan));
    saveVoice(voice);
    this.set({ voice }, false);
  };
  goCreate = () => this.set({ phase: "create" });
  goEditor = () => this.present.plan && this.set({ phase: "editor" });
  setStoryIndex = (storyIndex: number) => this.set({ storyIndex: Math.max(0, Math.min(4, storyIndex)) }, false);
  dismissPhotoErrors = () => this.set({ photoErrors: [] }, false);

  // ── Photos ─────────────────────────────────────────────────────────────────────────────
  /**
   * Importe des fichiers dans les emplacements : `slot` précis (un fichier), ou « auto » : d’abord les
   * emplacements vides dans l’ordre, puis les autres. Une seule étape d’annulation pour tout le lot.
   */
  async importFiles(files: readonly File[], slot: number | "auto") {
    if (!files.length || this.state.imports) return;
    const order =
      slot === "auto"
        ? [...this.present.photos.keys()].sort((a, b) => Number(!!this.present.photos[a]) - Number(!!this.present.photos[b]) || a - b)
        : [slot];
    const batch = files.slice(0, order.length);
    const group = `import:${Date.now()}`;
    const errors: PhotoError[] = [];
    this.set({ imports: { total: batch.length, done: 0, fileName: batch[0].name }, photoErrors: [] }, false);
    for (let i = 0; i < batch.length; i++) {
      const file = batch[i];
      this.set({ imports: { total: batch.length, done: i, fileName: file.name } }, false);
      try {
        const photo = await importPhoto(file);
        if (!this.started) {
          releasePhoto(photo);
          return;
        }
        const photos = [...this.present.photos];
        photos[order[i]] = photo.id;
        const pool = new Map(this.state.photos).set(photo.id, photo);
        this.commitSnapshot({ ...this.present, photos }, group, { photos: pool });
      } catch (error) {
        errors.push({
          fileName: file.name,
          message: isPhotoImportError(error) ? error.message : "Cette photo n’a pas pu être lue. Essaie avec une autre.",
        });
      }
    }
    this.set({ imports: null, photoErrors: errors });
  }

  /** Retire une photo ; les suivantes avancent (2 photos = emplacements 1 et 2). */
  removePhoto = (slot: number) => {
    const photos = [...this.present.photos];
    photos[slot] = null;
    this.commitSnapshot({ ...this.present, photos: compactPhotos(photos) });
  };

  swapPhotos = (a: number, b: number) => {
    const photos = [...this.present.photos];
    [photos[a], photos[b]] = [photos[b], photos[a]];
    this.commitSnapshot({ ...this.present, photos });
  };

  setCrop = (photoId: string, crop: Crop) => {
    this.commitSnapshot({ ...this.present, crops: { ...this.present.crops, [photoId]: crop } }, `cadrage:${photoId}`);
  };

  // ── Éditeur ────────────────────────────────────────────────────────────────────────────
  setStyle = (styleId: string) => {
    if (styleId !== this.present.styleId) this.commitSnapshot({ ...this.present, styleId });
  };

  /** Couleur d’accent, mots en évidence, décoration ; `group` regroupe une saisie (code couleur). */
  setOptions = (patch: Partial<StyleOptions>, group?: string) => {
    const options = { ...this.present.options, ...patch };
    const same = (Object.keys(options) as Array<keyof StyleOptions>).every((k) => options[k] === this.present.options[k]);
    if (!same) this.commitSnapshot({ ...this.present, options }, group);
  };

  /** Un trait du Crayon = une étape d’annulation. Refusé au-delà de DRAWING_LIMITS.strokesPerStory. */
  addStroke = (storyIndex: number, stroke: Stroke): boolean => {
    const list = this.present.drawings[storyIndex] ?? [];
    if (list.length >= DRAWING_LIMITS.strokesPerStory) return false;
    this.commitSnapshot({ ...this.present, drawings: { ...this.present.drawings, [storyIndex]: [...list, stroke] } });
    return true;
  };

  removeLastStroke = (storyIndex: number) => {
    const list = this.present.drawings[storyIndex] ?? [];
    if (list.length) this.commitSnapshot({ ...this.present, drawings: { ...this.present.drawings, [storyIndex]: list.slice(0, -1) } });
  };

  clearStrokes = (storyIndex: number) => {
    if ((this.present.drawings[storyIndex] ?? []).length) {
      const drawings = { ...this.present.drawings };
      delete drawings[storyIndex];
      this.commitSnapshot({ ...this.present, drawings });
    }
  };

  /** `field` : champ en cours de saisie (frappes regroupées) ; absent = étape à part (suppression…). */
  setStoryParagraphs = (storyIndex: number, paragraphs: Paragraph[], field?: number) => {
    const plan = this.present.plan;
    if (!plan || !paragraphs.length) return;
    const stories = plan.stories.map((s, i) => (i === storyIndex ? { ...s, paragraphs } : s));
    this.commitSnapshot({ ...this.present, plan: { ...plan, stories } }, field === undefined ? undefined : `texte:${storyIndex}:${field}`);
  };

  // ── Génération ─────────────────────────────────────────────────────────────────────────
  /** Texte requis en mode texte ; l’idée est facultative en mode idée (l’IA part du profil). */
  canWrite = () => this.state.mode === "idee" || this.state.idea.trim().length > 0;
  /** Écran Créer : 2 photos au moins, aucun import en cours. */
  canGenerate = () => this.canWrite() && !this.state.imports && photoCount(this.present.photos) >= MIN_PHOTO_COUNT;

  async generate(kind: GenerationState["kind"]) {
    if (kind === "nouvelle" ? !this.canGenerate() : !this.canWrite()) return;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const id = ++this.generationId;
    const previous = this.present.plan;
    const avoid =
      kind === "refaire" && previous
        ? [previous.structureId, hookOf(previous)]
        : this.state.recent.map((r) => r.hook).slice(0, 5);
    const request: GenerateRequest = {
      idea: this.state.idea.trim(),
      mode: this.state.mode,
      structureId: this.state.structure,
      context: this.requestContext(),
      avoid,
    };
    const stale = () => id !== this.generationId || controller.signal.aborted;
    this.set(
      { phase: "generating", createError: null, rewrite: null, generation: { kind, startedAt: Date.now(), step: "ecriture", error: null, notice: null } },
      false,
    );
    const result = await keepScreenOn(() =>
      sendResuming(
        () => requestGeneration(request, controller.signal),
        controller.signal,
        () => !stale() && this.set({ generation: { ...this.state.generation!, startedAt: Date.now(), notice: RESUMED } }, false),
      ),
    );
    if (stale()) return;
    if (!result.ok) {
      if (result.code === "texte_trop_court") {
        // Refus de l’écran Créer : on y revient, le message s’affiche sous le texte.
        this.controller = null;
        this.set({ phase: "create", generation: null, createError: result }, false);
        return;
      }
      this.set({ generation: { ...this.state.generation!, step: "erreur", error: result } }, false);
      return;
    }
    this.set({ generation: { ...this.state.generation!, step: "mise-en-page" } }, false);
    await this.prepareFonts(result.data.plan);
    await new Promise((r) => setTimeout(r, FULL_BAR_MS));
    if (stale()) return;
    this.controller = null;
    this.commitSnapshot(
      // Nouveau texte : les dessins de l’ancien n’ont plus de sens (Annuler les fait revenir).
      { ...this.present, plan: result.data.plan, controls: result.data.controls, drawings: {} },
      undefined,
      {
        phase: "editor",
        generation: null,
        storyIndex: 0,
        recent: pushRecent(this.state.recent, result.data.plan),
        planVersion: this.state.planVersion + 1,
      },
    );
  }

  /**
   * « Refaire cette story » : seule la story `storyIndex` change ; style, photos, dessins et les 4 autres
   * stories (avec tes retouches faites entre-temps) sont gardés. Une étape d’annulation.
   */
  async rewriteStory(storyIndex: number, instruction: string) {
    const plan = this.present.plan;
    if (!plan || this.state.rewrite?.error === null) return;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const id = ++this.generationId;
    const stale = () => id !== this.generationId || controller.signal.aborted;
    const trimmed = instruction.trim().slice(0, 300);
    this.set({ rewrite: { storyIndex, instruction: trimmed, startedAt: Date.now(), error: null, notice: null } }, false);
    const send = () =>
      requestRewrite(
        { plan, storyIndex, instruction: trimmed, idea: this.state.idea.trim(), mode: this.state.mode, context: this.requestContext() },
        controller.signal,
      );
    const result = await keepScreenOn(() =>
      sendResuming(send, controller.signal, () => !stale() && this.set({ rewrite: { ...this.state.rewrite!, notice: RESUMED } }, false)),
    );
    if (stale()) return;
    this.controller = null;
    if (!result.ok) {
      this.set({ rewrite: { ...this.state.rewrite!, error: result } }, false);
      return;
    }
    const current = this.present.plan ?? plan;
    const stories = current.stories.map((s, i) => (i === storyIndex ? result.data.plan.stories[storyIndex] : s));
    const next = { ...current, stories };
    await this.prepareFonts(next);
    if (stale()) return;
    this.commitSnapshot({ ...this.present, plan: next, controls: result.data.controls }, undefined, {
      rewrite: null,
      storyIndex,
      planVersion: this.state.planVersion + 1,
    });
  }

  /** Annule la réécriture en cours ou ferme son message d’erreur. */
  cancelRewrite = () => {
    if (!this.state.rewrite) return;
    this.generationId++;
    this.controller?.abort();
    this.controller = null;
    this.set({ rewrite: null }, false);
  };

  /** Charge les polices du plan (étape « Mise en page ») ; une erreur sera affichée par l’éditeur. */
  private async prepareFonts(plan: StoryPlan) {
    try {
      await loadFonts(fontRequirementsForSequence(plan, this.present.styleId));
    } catch {
      // l’éditeur revérifie et affiche le problème
    }
  }

  /** Annule la génération en cours (ou ferme l’écran d’erreur) et revient à l’écran précédent. */
  cancelGeneration = () => {
    const kind = this.state.generation?.kind;
    this.generationId++;
    this.controller?.abort();
    this.controller = null;
    this.set({ generation: null, phase: kind === "refaire" && this.present.plan ? "editor" : "create" }, false);
  };

  // ── Exemple (mode démo) ────────────────────────────────────────────────────────────────
  async openExample() {
    if (this.state.exampleLoading) return;
    this.generationId++;
    this.controller?.abort();
    this.set({ exampleLoading: true, photoErrors: [] }, false);
    const photos = [...this.present.photos];
    let pool = this.state.photos;
    const errors: PhotoError[] = [];
    for (let slot = 0; slot < PHOTO_COUNT; slot++) {
      if (photos[slot]) continue;
      const src = SAMPLE_PHOTOS[slot];
      try {
        const response = await fetch(src);
        if (!response.ok) throw new Error(String(response.status));
        const photo = await importPhoto(await response.blob());
        if (!this.started) {
          releasePhoto(photo);
          return;
        }
        pool = new Map(pool).set(photo.id, photo);
        photos[slot] = photo.id;
      } catch (error) {
        errors.push({ fileName: src.split("/").pop() ?? src, message: isPhotoImportError(error) ? error.message : "La photo d’exemple n’a pas pu être chargée." });
      }
    }
    await this.prepareFonts(EXAMPLE_PLAN);
    this.commitSnapshot({ ...this.present, plan: structuredClone(EXAMPLE_PLAN), controls: null, photos }, undefined, {
      photos: pool,
      phase: "editor",
      generation: null,
      exampleLoading: false,
      storyIndex: 0,
      photoErrors: errors,
      createError: null,
      planVersion: this.state.planVersion + 1,
    });
  }

  // ── Nouvelle séquence ──────────────────────────────────────────────────────────────────
  async newSequence() {
    this.generationId++;
    this.controller?.abort();
    this.state.photos.forEach((photo, id) => {
      releasePhoto(photo);
      releaseCutout(id);
    });
    if (this.saveTimer) clearTimeout(this.saveTimer); // un enregistrement en attente réécrirait le brouillon
    this.saveTimer = null;
    clearDraft();
    this.savedPhotosKey = "||";
    this.set(
      {
        phase: "create",
        idea: "",
        mode: "idee",
        structure: AUTO_STRUCTURE,
        history: createHistory(EMPTY_SNAPSHOT),
        storyIndex: 0,
        photos: new Map(),
        photoErrors: [],
        generation: null,
        rewrite: null,
        createError: null,
        planVersion: this.state.planVersion + 1,
      },
      false,
    );
    await deletePhotos(PHOTO_DRAFT_ID);
  }
}

// Chargement de MediaPipe ImageSegmenter (navigateur uniquement).
// Le module @mediapipe/tasks-vision est importé à la demande : il ne pèse rien sur la page
// tant qu’aucun détourage n’est demandé. Le moteur wasm est servi par nous (public/mediapipe/),
// le modèle aussi (public/models/) : aucune requête vers un CDN.
import type { ImageSegmenter } from "@mediapipe/tasks-vision";
import { SegmentationError, describeCause } from "./errors";

/** Modèles connus. Seul « selfie » est livré dans public/models/ (voir DECISIONS.md, « Détourage »). */
export const SEGMENTATION_MODELS = {
  /** selfie_segmenter (250 Ko, entrée 256 × 256, une sortie « personne »). */
  selfie: { url: "/models/selfie_segmenter.tflite", bytes: 249_537 },
  /** selfie_multiclass_256x256 (16 Mo : fond, cheveux, peau, vêtements…). Non livré : comparaison seulement. */
  multiclasse: { url: "/models/selfie_multiclass_256x256.tflite", bytes: 16_371_837 },
} as const;
export type SegmentationModel = keyof typeof SEGMENTATION_MODELS;
export const DEFAULT_SEGMENTATION_MODEL: SegmentationModel = "selfie";

/** Dossier des fichiers wasm (copiés de node_modules/@mediapipe/tasks-vision/wasm/). */
export const MEDIAPIPE_WASM_BASE = "/mediapipe";

export type SegmentationDelegate = "GPU" | "CPU";
/** « auto » : GPU s’il fonctionne (création et calcul d’essai), sinon processeur. */
export type DelegatePreference = "auto" | SegmentationDelegate;
/**
 * Processeur par défaut : pour un modèle de 256 × 256 il est aussi rapide que le GPU (≈ 80 ms
 * contre 200 ms dans Chromium), sans compilation de shaders au premier calcul (2,3 s), sans
 * contexte WebGL de plus (Safari iOS les limite, Konva en utilise) et avec un résultat identique
 * d’un appareil à l’autre. Voir DECISIONS.md, « Détourage ».
 */
export const DEFAULT_DELEGATE: DelegatePreference = "CPU";

export interface LoadedSegmenter {
  model: SegmentationModel;
  delegate: SegmentationDelegate;
  segmenter: ImageSegmenter;
  labels: string[];
  /** Temps de chargement (module, wasm, modèle, initialisation, calcul d’essai), en ms. */
  loadMs: number;
  /** Raison du repli sur le processeur, si le GPU a été refusé. */
  gpuError?: string;
}

const loading = new Map<string, Promise<LoadedSegmenter>>();
const keyOf = (model: SegmentationModel, delegate: DelegatePreference) => `${model}:${delegate}`;

/** Segmenteur prêt (chargé une seule fois par modèle et délégué ; un échec n’est pas mis en cache). */
export function loadSegmenter(
  model: SegmentationModel = DEFAULT_SEGMENTATION_MODEL,
  delegate: DelegatePreference = DEFAULT_DELEGATE,
): Promise<LoadedSegmenter> {
  const key = keyOf(model, delegate);
  let pending = loading.get(key);
  if (!pending) {
    pending = createSegmenter(model, delegate);
    remember(key, pending);
  }
  return pending;
}

function remember(key: string, pending: Promise<LoadedSegmenter>): void {
  loading.set(key, pending);
  pending.catch(() => {
    if (loading.get(key) === pending) loading.delete(key);
  });
}

/**
 * Le GPU a échoué au moment du calcul : on referme ce segmenteur et on en recrée un sur le
 * processeur, pour cet appel et les suivants.
 */
export async function fallBackToCpu(
  loaded: LoadedSegmenter,
  preference: DelegatePreference,
  cause: unknown,
): Promise<LoadedSegmenter> {
  closeQuietly(loaded.segmenter);
  const pending = createSegmenter(loaded.model, "CPU", describeCause(cause));
  remember(keyOf(loaded.model, preference), pending);
  return pending;
}

/** Ferme les segmenteurs chargés (libère la mémoire wasm et le contexte WebGL). */
export async function disposeSegmenters(): Promise<void> {
  const all = [...loading.values()];
  loading.clear();
  for (const pending of all) {
    try {
      closeQuietly((await pending).segmenter);
    } catch {
      // Chargement échoué : rien à fermer.
    }
  }
}

function closeQuietly(segmenter: ImageSegmenter): void {
  try {
    segmenter.close();
  } catch {
    // Déjà fermé : rien à libérer.
  }
}

async function createSegmenter(
  model: SegmentationModel,
  preference: DelegatePreference,
  previousGpuError?: string,
): Promise<LoadedSegmenter> {
  const started = performance.now();
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new SegmentationError("navigateur_incompatible", "Le détourage ne fonctionne que dans le navigateur.");
  }
  if (typeof WebAssembly === "undefined") throw new SegmentationError("navigateur_incompatible");
  blockMediapipeTelemetry();

  let vision: typeof import("@mediapipe/tasks-vision");
  try {
    vision = await import("@mediapipe/tasks-vision");
  } catch (cause) {
    throw new SegmentationError("moteur_indisponible", undefined, { cause });
  }
  // Seule la variante SIMD est livrée (13,5 Mo de moins) : iOS ≥ 16.4, Chrome ≥ 91, Firefox ≥ 89.
  if (!(await vision.FilesetResolver.isSimdSupported())) throw new SegmentationError("navigateur_incompatible");
  const fileset = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_BASE);

  const modelBuffer = await fetchModel(model);

  /** Crée le segmenteur et fait un calcul d’essai (compile les shaders GPU, révèle un GPU défaillant). */
  const create = async (delegate: SegmentationDelegate) => {
    const segmenter = await vision.ImageSegmenter.createFromOptions(fileset, {
      // Copie : MediaPipe peut transférer le tampon au wasm.
      baseOptions: { modelAssetBuffer: modelBuffer.slice(), delegate },
      runningMode: "IMAGE",
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });
    try {
      warmUp(segmenter);
    } catch (cause) {
      closeQuietly(segmenter);
      throw cause;
    }
    return segmenter;
  };

  let segmenter: ImageSegmenter | null = null;
  let delegate: SegmentationDelegate = "CPU";
  let gpuError = previousGpuError;
  if (preference !== "CPU" && !previousGpuError) {
    try {
      segmenter = await create("GPU");
      delegate = "GPU";
    } catch (gpuCause) {
      gpuError = describeCause(gpuCause);
      // Le moteur lui-même est absent : inutile d’essayer le processeur.
      if (isEngineMissing(gpuCause)) throw new SegmentationError("moteur_indisponible", undefined, { cause: gpuCause });
      if (preference === "GPU") throw classifyCreateError(gpuCause, model);
    }
  }
  if (!segmenter) {
    try {
      segmenter = await create("CPU");
    } catch (cause) {
      throw classifyCreateError(cause, model);
    }
  }
  if (gpuError && preference !== "CPU") console.warn(`Détourage : GPU indisponible, calcul sur le processeur (${gpuError}).`);
  return { model, delegate, segmenter, labels: segmenter.getLabels(), loadMs: performance.now() - started, gpuError };
}

function warmUp(segmenter: ImageSegmenter): void {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, 32, 32);
  }
  segmenter.segment(canvas).close();
}

async function fetchModel(model: SegmentationModel): Promise<Uint8Array> {
  const { url } = SEGMENTATION_MODELS[model];
  let response: Response;
  try {
    response = await fetch(url);
  } catch (cause) {
    throw new SegmentationError("modele_indisponible", undefined, { cause });
  }
  if (!response.ok) {
    throw new SegmentationError(
      "modele_indisponible",
      `Le modèle de détourage est introuvable (${url} : HTTP ${response.status}).`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  // Un fichier .tflite commence par 4 octets puis la signature « TFL3 ».
  const signature = String.fromCharCode(...bytes.subarray(4, 8));
  if (signature !== "TFL3") {
    throw new SegmentationError("modele_indisponible", `Le fichier ${url} n’est pas un modèle TensorFlow Lite.`);
  }
  return bytes;
}

/** Le script du moteur absent remonte comme un Event (balise <script>), le wasm comme une erreur de chargement. */
function isEngineMissing(cause: unknown): boolean {
  if (typeof Event !== "undefined" && cause instanceof Event) return true;
  return /wasm|webassembly|both async and sync fetching|failed to fetch|script/i.test(describeCause(cause));
}

function classifyCreateError(cause: unknown, model: SegmentationModel): SegmentationError {
  if (isEngineMissing(cause)) return new SegmentationError("moteur_indisponible", undefined, { cause });
  return new SegmentationError(
    "modele_indisponible",
    `Le modèle de détourage « ${model} » n’a pas pu être initialisé (${describeCause(cause)}).`,
    { cause },
  );
}

/** Adresse de la télémétrie que MediaPipe 1.1.1 envoie d’office (toutes les 60 s et à la fermeture). */
const MEDIAPIPE_TELEMETRY_HOST = "odml.pa.googleapis.com";
let telemetryBlocked = false;

/**
 * MediaPipe envoie des statistiques d’usage à Google sans option pour les couper. On refuse
 * ces seules requêtes (rejet immédiat : MediaPipe arrête alors d’essayer) ; tout autre appel
 * à fetch passe sans changement. Aucune donnée ne sort de l’appareil.
 */
function blockMediapipeTelemetry(): void {
  if (telemetryBlocked || typeof window.fetch !== "function") return;
  telemetryBlocked = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes(MEDIAPIPE_TELEMETRY_HOST)) {
      return Promise.reject(new TypeError("Télémétrie MediaPipe désactivée par STORY."));
    }
    return original(input, init);
  };
}

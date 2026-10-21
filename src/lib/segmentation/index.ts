/**
 * Détourage de la personne — API publique (navigateur uniquement : à appeler depuis un composant client).
 * Sert aux styles où un mot géant passe DERRIÈRE la personne : photo, mot géant, puis `cutout` par-dessus.
 *
 * ── Détourer ─────────────────────────────────────────────────────────────────────────────
 *   cutoutSubject(image: HTMLImageElement | ImageBitmap, options?): Promise<CutoutResult>
 *     image décodée (jusqu’à 2560 px). Renvoie :
 *       cutout   HTMLCanvasElement RGBA de la taille de l’image, transparent hors de la personne
 *                (bords recalés sur la photo et adoucis) → <Image image={cutout} /> de react-konva,
 *                avec le même cadrage que la photo ;
 *       coverage part de pixels « personne » (0..1) ; sous MIN_SUBJECT_COVERAGE (3 %) : pas de personne ;
 *       ms       durée totale ; timings { load, segment, refine, compose } ; model ; delegate (GPU | CPU).
 *     options : { model = "selfie", delegate = "CPU", workSide = 512, zoom = true, refineSide = 1024,
 *                 refine = true, smooth = 2, minIslandRatio = 0.12, signal } (réglages fins : voir CutoutOptions)
 *     Rejette toujours avec une SegmentationError.
 *
 *   getCutout(photoId, image, options?): Promise<CutoutResult>
 *     Même chose, en cache mémoire par identifiant de photo : une seule exécution par photo, même
 *     si plusieurs appels arrivent en même temps. Un échec n’est pas gardé (un nouvel appel réessaie).
 *   peekCutout(photoId): CutoutResult | null — résultat déjà prêt, sans rien lancer.
 *   releaseCutout(photoId): void — oublie le résultat et libère son canvas (photo retirée ou remplacée).
 *   releaseAllCutouts(): void — au démontage de la page.
 *
 *   preloadSegmenter(model?, delegate?): Promise<void> — charge moteur et modèle en avance (ex. à l’ouverture
 *     du panneau Style) ; rejette avec une SegmentationError. disposeSegmenter(): ferme tout.
 *
 * ── Erreurs ──────────────────────────────────────────────────────────────────────────────
 *   class SegmentationError extends Error { code; message (français, à afficher tel quel) }
 *   code : "navigateur_incompatible" | "moteur_indisponible" | "modele_indisponible"
 *        | "image_invalide" | "calcul_impossible" | "annule"
 *
 * Fichiers servis : /mediapipe/vision_wasm_internal.{js,wasm} (13,5 Mo, ≈ 4 Mo compressé) et
 * /models/selfie_segmenter.tflite (250 Ko). Aucun appel externe.
 *
 * Exemple :
 *   const { cutout, coverage } = await getCutout(photo.id, photo.image);
 *   if (coverage < MIN_SUBJECT_COVERAGE) avertir("Aucune personne détectée : le mot reste devant.");
 */
import { releaseCanvas, cutoutSubject, type CutoutOptions, type CutoutResult, type CutoutSource } from "./cutout";
import {
  DEFAULT_DELEGATE,
  DEFAULT_SEGMENTATION_MODEL,
  disposeSegmenters,
  loadSegmenter,
  type DelegatePreference,
  type SegmentationModel,
} from "./segmenter";

export {
  DEFAULT_REFINE_SIDE,
  DEFAULT_WORK_SIDE,
  MIN_SUBJECT_COVERAGE,
  cutoutSubject,
  type CutoutOptions,
  type CutoutResult,
  type CutoutSource,
  type CutoutTimings,
} from "./cutout";
export {
  SEGMENTATION_ERROR_MESSAGES,
  SegmentationError,
  isSegmentationError,
  type SegmentationErrorCode,
} from "./errors";
export type { Region } from "./mask";
export {
  DEFAULT_DELEGATE,
  DEFAULT_SEGMENTATION_MODEL,
  MEDIAPIPE_WASM_BASE,
  SEGMENTATION_MODELS,
  type DelegatePreference,
  type SegmentationDelegate,
  type SegmentationModel,
} from "./segmenter";

interface CacheEntry {
  promise: Promise<CutoutResult>;
  result: CutoutResult | null;
}

const cache = new Map<string, CacheEntry>();

export function getCutout(photoId: string, image: CutoutSource, options?: Omit<CutoutOptions, "signal">): Promise<CutoutResult> {
  const existing = cache.get(photoId);
  if (existing) return existing.promise;
  const entry: CacheEntry = { promise: cutoutSubject(image, options), result: null };
  cache.set(photoId, entry);
  entry.promise.then(
    (result) => {
      // Photo libérée pendant le calcul : le résultat n’est plus attendu.
      if (cache.get(photoId) === entry) entry.result = result;
      else releaseCanvas(result.cutout);
    },
    () => {
      if (cache.get(photoId) === entry) cache.delete(photoId);
    },
  );
  return entry.promise;
}

export function peekCutout(photoId: string): CutoutResult | null {
  return cache.get(photoId)?.result ?? null;
}

export function releaseCutout(photoId: string): void {
  const entry = cache.get(photoId);
  if (!entry) return;
  cache.delete(photoId);
  if (entry.result) releaseCanvas(entry.result.cutout);
}

export function releaseAllCutouts(): void {
  for (const id of [...cache.keys()]) releaseCutout(id);
}

export async function preloadSegmenter(
  model: SegmentationModel = DEFAULT_SEGMENTATION_MODEL,
  delegate: DelegatePreference = DEFAULT_DELEGATE,
): Promise<void> {
  await loadSegmenter(model, delegate);
}

export async function disposeSegmenter(): Promise<void> {
  releaseAllCutouts();
  await disposeSegmenters();
}

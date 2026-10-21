// Détourage d’une photo : masque calculé sur une version réduite (puis, si la personne est petite,
// sur un recadrage autour d’elle), recalé sur les contours de la photo (filtre guidé à 1024 px),
// puis appliqué en alpha à l’image pleine définition.
import { SegmentationError, describeCause } from "./errors";
import {
  applyGuidedCoefficients,
  blurMask,
  composeMasks,
  coverage as maskCoverage,
  guidedCoefficients,
  luminance,
  personConfidence,
  removeSmallIslands,
  subjectRegion,
  type AlphaCurve,
  type MaskSize,
  type Region,
} from "./mask";
import {
  DEFAULT_DELEGATE,
  DEFAULT_SEGMENTATION_MODEL,
  fallBackToCpu,
  loadSegmenter,
  type DelegatePreference,
  type LoadedSegmenter,
  type SegmentationDelegate,
  type SegmentationModel,
} from "./segmenter";

export type CutoutSource = HTMLImageElement | ImageBitmap;

export interface CutoutOptions {
  /** Modèle MediaPipe (« selfie » par défaut, le seul livré). */
  model?: SegmentationModel;
  /** « CPU » par défaut ; « auto » : GPU s’il fonctionne, sinon processeur ; « GPU » : GPU ou erreur. */
  delegate?: DelegatePreference;
  /** Plus grand côté des images données au modèle. 512 par défaut. */
  workSide?: number;
  /** Deuxième passage recadré sur la personne (plus de détail quand elle est petite). true par défaut. */
  zoom?: boolean;
  /** Plus grand côté du masque affiné (filtre guidé). 1024 par défaut, jamais plus que la photo. */
  refineSide?: number;
  /** Recaler le masque sur les contours de la photo (filtre guidé). true par défaut. */
  refine?: boolean;
  /** Rayon (px du masque affiné) et régularisation du filtre guidé. 6 et 0,001 par défaut. */
  guidedRadius?: number;
  guidedEps?: number;
  /** Filtre guidé appliqué partout, même où le modèle est sûr (comparaison). false par défaut. */
  guidedEverywhere?: boolean;
  /** Lissage du masque avant recalage, en px du masque affiné. 2 par défaut (0 = aucun). */
  smooth?: number;
  /** Îlots retirés s’ils font moins de cette part de la plus grande silhouette. 0,12 par défaut (0 = garder tout). */
  minIslandRatio?: number;
  signal?: AbortSignal;
}

export interface CutoutTimings {
  /** Attente du segmenteur (≈ 0 s’il était déjà chargé). */
  load: number;
  /** Réductions de l’image et inférences (un ou deux passages). */
  segment: number;
  /** Assemblage, lissage, îlots, filtre guidé (masque affiné). */
  refine: number;
  /** Application de l’alpha à pleine définition. */
  compose: number;
}

export interface CutoutResult {
  /** Image RGBA de la taille de la photo, transparente hors de la personne. Calque Konva direct. */
  cutout: HTMLCanvasElement;
  /** Part des pixels « personne » (0..1), mesurée sur le masque affiné. */
  coverage: number;
  /** Durée totale de l’appel, en ms (chargement du modèle compris s’il n’était pas prêt). */
  ms: number;
  width: number;
  height: number;
  model: SegmentationModel;
  delegate: SegmentationDelegate;
  /** Taille du masque affiné. */
  maskWidth: number;
  maskHeight: number;
  /** Zone du deuxième passage (coordonnées relatives), null s’il n’a pas eu lieu. */
  zoomRegion: Region | null;
  islandsRemoved: number;
  timings: CutoutTimings;
}

/** En dessous de cette couverture, on considère qu’il n’y a pas de personne sur la photo. */
export const MIN_SUBJECT_COVERAGE = 0.03;

export const DEFAULT_WORK_SIDE = 512;
export const DEFAULT_REFINE_SIDE = 1024;
const DEFAULT_GUIDED_RADIUS = 6;
const DEFAULT_GUIDED_EPS = 1e-3;
/**
 * Courbe finale : transparent sous 0,3, opaque au-dessus de 0,85, transition douce entre. Le seuil
 * bas un peu relevé ronge le liseré du fond (sombre ou clair) qui se voit sur un mot géant vif.
 */
const ALPHA_CURVE: AlphaCurve = { low: 0.3, high: 0.85 };

export async function cutoutSubject(image: CutoutSource, options: CutoutOptions = {}): Promise<CutoutResult> {
  const started = performance.now();
  const { signal } = options;
  const workSide = Math.max(64, Math.round(options.workSide ?? DEFAULT_WORK_SIDE));
  const delegatePreference = options.delegate ?? DEFAULT_DELEGATE;
  const { width, height } = sourceSize(image);
  const full: MaskSize = { width, height };
  checkAborted(signal);

  let loaded = await loadSegmenter(options.model ?? DEFAULT_SEGMENTATION_MODEL, delegatePreference);
  checkAborted(signal);
  const tLoaded = performance.now();

  /** Inférence sur une partie de l’image (toute l’image par défaut), réduite à workSide. */
  const segmentRegion = async (region: Region | null): Promise<{ mask: Float32Array; size: MaskSize }> => {
    const sx = region ? region.x * width : 0;
    const sy = region ? region.y * height : 0;
    const sw = region ? region.width * width : width;
    const sh = region ? region.height * height : height;
    const scale = Math.min(1, workSide / Math.max(sw, sh));
    const size: MaskSize = { width: Math.max(1, Math.round(sw * scale)), height: Math.max(1, Math.round(sh * scale)) };
    const canvas = createCanvas(size.width, size.height);
    const ctx = context2d(canvas);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, size.width, size.height);
    readPixels(ctx, 1, 1); // image d’une autre origine : erreur claire avant tout calcul
    let masks: Float32Array[];
    try {
      masks = runSegmenter(loaded, canvas, size);
    } catch (cause) {
      if (loaded.delegate !== "GPU") throw computeError(cause);
      loaded = await fallBackToCpu(loaded, delegatePreference, cause);
      try {
        masks = runSegmenter(loaded, canvas, size);
      } catch (cpuCause) {
        throw computeError(cpuCause);
      }
    } finally {
      releaseCanvas(canvas);
    }
    return { mask: personConfidence(masks, loaded.labels), size };
  };

  // 1. Premier passage sur toute l’image, puis, si la personne est petite, un second recadré sur elle.
  const minIslandRatio = options.minIslandRatio ?? 0.12;
  const first = await segmentRegion(null);
  await yieldToBrowser();
  if (minIslandRatio > 0) removeSmallIslands(first.mask, first.size, minIslandRatio);
  checkAborted(signal);
  const zoomRegion = options.zoom === false ? null : subjectRegion(first.mask, first.size);
  const detail = zoomRegion ? { ...(await segmentRegion(zoomRegion)), region: zoomRegion } : null;
  await yieldToBrowser();
  checkAborted(signal);
  const tSegmented = performance.now();

  // 2. Masque affiné : assemblage, lissage, îlots, coefficients du filtre guidé.
  const refineScale = Math.min(1, Math.max(64, options.refineSide ?? DEFAULT_REFINE_SIDE) / Math.max(width, height));
  const fine: MaskSize = { width: Math.max(1, Math.round(width * refineScale)), height: Math.max(1, Math.round(height * refineScale)) };
  let person = composeMasks(first.mask, first.size, detail, fine, Math.max(fine.width, fine.height) * 0.03);
  const smooth = options.smooth ?? 2;
  if (smooth > 0) person = blurMask(person, fine, smooth);
  const islandsRemoved = minIslandRatio > 0 ? removeSmallIslands(person, fine, minIslandRatio) : 0;
  const coverage = maskCoverage(person);
  let coefficients: { a: Float32Array; b: Float32Array; mask?: Float32Array };
  // Rien de détecté (aucun pixel au-dessus de 5 %) : pas de filtre guidé, la découpe sera vide.
  if (options.refine === false || maskCoverage(person, 0.05) === 0) {
    coefficients = { a: new Float32Array(person.length), b: person };
  } else {
    const guideCanvas = createCanvas(fine.width, fine.height);
    const guideCtx = context2d(guideCanvas);
    guideCtx.imageSmoothingEnabled = true;
    guideCtx.imageSmoothingQuality = "high";
    guideCtx.drawImage(image, 0, 0, fine.width, fine.height);
    const guide = luminance(readPixels(guideCtx, fine.width, fine.height));
    releaseCanvas(guideCanvas);
    coefficients = {
      ...guidedCoefficients(guide, person, fine, options.guidedRadius ?? DEFAULT_GUIDED_RADIUS, options.guidedEps ?? DEFAULT_GUIDED_EPS),
      mask: options.guidedEverywhere ? undefined : person,
    };
  }
  await yieldToBrowser();
  checkAborted(signal);
  const tRefined = performance.now();

  // 3. Alpha appliqué à la photo pleine définition.
  const cutout = createCanvas(width, height);
  const ctx = context2d(cutout);
  ctx.drawImage(image, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height);
  applyGuidedCoefficients(pixels.data, full, coefficients, fine, ALPHA_CURVE);
  ctx.putImageData(pixels, 0, 0);
  const finished = performance.now();

  return {
    cutout,
    coverage,
    ms: finished - started,
    width,
    height,
    model: loaded.model,
    delegate: loaded.delegate,
    maskWidth: fine.width,
    maskHeight: fine.height,
    zoomRegion,
    islandsRemoved,
    timings: {
      load: tLoaded - started,
      segment: tSegmented - tLoaded,
      refine: tRefined - tSegmented,
      compose: finished - tRefined,
    },
  };
}

/** Libère la mémoire d’un canvas tout de suite (Safari iOS plafonne la mémoire des canvas). */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

function runSegmenter(loaded: LoadedSegmenter, canvas: HTMLCanvasElement, work: MaskSize): Float32Array[] {
  const result = loaded.segmenter.segment(canvas);
  try {
    const masks = result.confidenceMasks ?? [];
    if (masks.length === 0) throw new Error("aucun masque renvoyé par le modèle");
    return masks.map((mask) => {
      if (mask.width !== work.width || mask.height !== work.height) {
        throw new Error(`masque ${mask.width} × ${mask.height} pour une image ${work.width} × ${work.height}`);
      }
      // Copie : les données de MediaPipe sont libérées avec le résultat.
      return Float32Array.from(mask.getAsFloat32Array());
    });
  } finally {
    result.close();
  }
}

function sourceSize(image: CutoutSource): { width: number; height: number } {
  const isImg = typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement;
  if (isImg && !image.complete) {
    throw new SegmentationError("image_invalide", "Cette photo n’est pas encore chargée : impossible de la détourer.");
  }
  const width = isImg ? image.naturalWidth : image.width;
  const height = isImg ? image.naturalHeight : image.height;
  if (!width || !height) throw new SegmentationError("image_invalide");
  return { width, height };
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document === "undefined") {
    throw new SegmentationError("navigateur_incompatible", "Le détourage ne fonctionne que dans le navigateur.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new SegmentationError(
      "navigateur_incompatible",
      `Le navigateur refuse de créer une image de ${canvas.width} × ${canvas.height} px (mémoire ?).`,
    );
  }
  return ctx;
}

function readPixels(ctx: CanvasRenderingContext2D, width: number, height: number): Uint8ClampedArray {
  try {
    return ctx.getImageData(0, 0, width, height).data;
  } catch (cause) {
    // Image d’une autre origine sans CORS : le canvas est « tainted ».
    throw new SegmentationError("image_invalide", "Cette photo vient d’un autre site : le navigateur interdit de la détourer.", {
      cause,
    });
  }
}

function computeError(cause: unknown): SegmentationError {
  if (cause instanceof SegmentationError) return cause;
  return new SegmentationError("calcul_impossible", `Le détourage de la personne a échoué (${describeCause(cause)}).`, { cause });
}

/** Rend la main au navigateur entre deux étapes lourdes (l’interface reste fluide, un spinner tourne). */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function checkAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new SegmentationError("annule");
}

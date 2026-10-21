// Import d’une photo : contrôle du format réel et du poids, décodage, orientation,
// réduction (plus grand côté 2560 px) et ré-encodage JPEG sans métadonnées.
// Les imports passent un par un dans une file : sur iPhone, deux photos de 48 Mpx décodées
// en même temps suffisent à faire recharger l’onglet.

import { decodeHeic, decodeNative, decodeWithManualOrientation, nativeOrientationWorks, type DecodedSource } from "./decode";
import { PhotoImportError, isPhotoImportError } from "./errors";
import { HEADER_BYTES, orientedSize, readImageHeader } from "./header";
import { drawOriented, getOrientationSupport } from "./orientation";
import { sniffImageType } from "./sniff";
import type { ImportedPhoto, PhotoImportOptions, PhotoWarning, SniffedImageType } from "./types";

export const DEFAULT_MAX_SIDE = 2560;
export const DEFAULT_JPEG_QUALITY = 0.9;
export const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
/** Au-delà, même un décodage réduit est risqué (le plus grand capteur de téléphone fait 200 Mpx). */
export const MAX_SOURCE_PIXELS = 210_000_000;
/** En dessous, la photo sera agrandie (donc floue) dans une story 1080 × 1920. */
export const MIN_SHARP_SIDE = 1080;

let counter = 0;

/** Identifiant unique ; crypto.randomUUID n’existe qu’en contexte sécurisé (pas en http:// sur le réseau local). */
export function newPhotoId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `photo-${crypto.randomUUID()}`;
  const random = new Uint32Array(2);
  crypto.getRandomValues(random);
  counter += 1;
  return `photo-${Date.now().toString(36)}-${counter.toString(36)}-${random[0].toString(36)}${random[1].toString(36)}`;
}

/** Charge un blob JPEG dans un <img> décodé ; l’URL reste vivante (elle appartient à la photo). */
export async function decodedImage(blob: Blob): Promise<{ url: string; image: HTMLImageElement }> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  try {
    await image.decode();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  return { url, image };
}

export function lowResolutionWarning(width: number, height: number): PhotoWarning[] {
  if (Math.min(width, height) >= MIN_SHARP_SIDE) return [];
  return [
    {
      code: "basse_definition",
      message: `Cette photo est petite (${width} × ${height} px) : elle risque d’être floue dans une story 1080 × 1920.`,
    },
  ];
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

async function decodeSource(
  file: Blob,
  type: SniffedImageType,
  options: Required<Pick<PhotoImportOptions, "maxSide" | "orientation">>,
  fileName: string,
): Promise<{ decoded: DecodedSource; exifOrientation: number }> {
  if (type === "image/heic") {
    const support = await getOrientationSupport();
    return { decoded: await decodeHeic(file, support, fileName), exifOrientation: 1 };
  }

  let head: Uint8Array;
  try {
    head = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  } catch (error) {
    throw new PhotoImportError("illisible", { fileName, cause: error });
  }
  const header = readImageHeader(head, type);
  const size = orientedSize(header);
  if (size && size.width * size.height > MAX_SOURCE_PIXELS) {
    throw new PhotoImportError("trop_lourde", {
      fileName,
      message: `Cette photo est trop grande (${size.width} × ${size.height} px). Choisissez une photo plus petite.`,
    });
  }

  const support = await getOrientationSupport();
  const manual = options.orientation === "manuel" || (header.orientation !== 1 && !nativeOrientationWorks(support));
  if (!manual) {
    const native = await decodeNative(file, header, support, options.maxSide, fileName);
    if (native) return { decoded: native, exifOrientation: header.orientation };
  }
  const decoded = await decodeWithManualOrientation(file, type, header, head, support, fileName);
  return { decoded, exifOrientation: header.orientation };
}

async function importNow(file: Blob, options: PhotoImportOptions): Promise<ImportedPhoto> {
  const started = performance.now();
  const fileName = typeof File !== "undefined" && file instanceof File ? file.name : "";
  const maxSide = options.maxSide ?? DEFAULT_MAX_SIDE;
  const quality = options.quality ?? DEFAULT_JPEG_QUALITY;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  if (file.size > maxBytes) throw new PhotoImportError("trop_lourde", { fileName });

  let sourceType: SniffedImageType | null;
  try {
    sourceType = await sniffImageType(file);
  } catch (error) {
    throw new PhotoImportError("illisible", { fileName, cause: error });
  }
  if (!sourceType) throw new PhotoImportError("format_inconnu", { fileName });

  const { decoded, exifOrientation } = await decodeSource(
    file,
    sourceType,
    { maxSide, orientation: options.orientation ?? "auto" },
    fileName,
  );

  const scale = Math.min(1, maxSide / Math.max(decoded.width, decoded.height));
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));
  const canvas = document.createElement("canvas");
  let blob: Blob | null = null;
  try {
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new PhotoImportError("illisible", { fileName, message: "Le navigateur n’a pas pu préparer cette photo." });
    // Le JPEG n’a pas de transparence : les zones transparentes (PNG, WebP) deviennent blanches.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    drawOriented(ctx, decoded.source, decoded.orientation, width, height);
    blob = await canvasToJpeg(canvas, quality);
  } finally {
    decoded.release();
    canvas.width = 0;
    canvas.height = 0;
  }
  if (!blob || blob.type !== "image/jpeg") {
    throw new PhotoImportError("illisible", { fileName, message: "Le navigateur n’a pas pu ré-encoder cette photo." });
  }

  let loaded: { url: string; image: HTMLImageElement };
  try {
    loaded = await decodedImage(blob);
  } catch (error) {
    throw new PhotoImportError("illisible", { fileName, cause: error });
  }

  return {
    id: options.id ?? newPhotoId(),
    name: fileName,
    blob,
    url: loaded.url,
    width,
    height,
    image: loaded.image,
    sourceType,
    warnings: lowResolutionWarning(width, height),
    diagnostics: {
      decoder: decoded.decoder,
      exifOrientation,
      sourceWidth: decoded.sourceWidth,
      sourceHeight: decoded.sourceHeight,
      sourceBytes: file.size,
      durationMs: Math.round(performance.now() - started),
    },
  };
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Importe une photo. Les appels concurrents sont exécutés l’un après l’autre.
 * Rejette toujours avec une PhotoImportError (message français prêt à afficher).
 */
export function importPhoto(file: Blob, options: PhotoImportOptions = {}): Promise<ImportedPhoto> {
  const run = queue.then(async () => {
    try {
      return await importNow(file, options);
    } catch (error) {
      if (isPhotoImportError(error)) throw error;
      const fileName = typeof File !== "undefined" && file instanceof File ? file.name : "";
      throw new PhotoImportError("illisible", { fileName, cause: error });
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

export type PhotoImportResult =
  | { ok: true; fileName: string; photo: ImportedPhoto }
  | { ok: false; fileName: string; error: PhotoImportError };

/** Importe plusieurs photos, une par une ; une photo refusée n’empêche pas les suivantes. */
export async function importPhotos(
  files: Iterable<Blob>,
  options: PhotoImportOptions = {},
  onResult?: (result: PhotoImportResult, index: number) => void,
): Promise<PhotoImportResult[]> {
  const results: PhotoImportResult[] = [];
  let index = 0;
  for (const file of files) {
    const fileName = typeof File !== "undefined" && file instanceof File ? file.name : "";
    let result: PhotoImportResult;
    try {
      result = { ok: true, fileName, photo: await importPhoto(file, { ...options, id: undefined }) };
    } catch (error) {
      result = {
        ok: false,
        fileName,
        error: isPhotoImportError(error) ? error : new PhotoImportError("illisible", { fileName, cause: error }),
      };
    }
    results.push(result);
    onResult?.(result, index);
    index += 1;
  }
  return results;
}

/** Libère l’object URL d’une photo (à appeler quand elle quitte l’écran et le brouillon). */
export function releasePhoto(photo: ImportedPhoto): void {
  URL.revokeObjectURL(photo.url);
}

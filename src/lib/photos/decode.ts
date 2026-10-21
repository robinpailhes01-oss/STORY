// Décodage d’une photo en une source dessinable, redressée ou accompagnée de l’orientation à appliquer.
// Ordre : décodeur natif du navigateur ; repli EXIF manuel ; pour HEIC, conversion heic-to à la demande.

import { PhotoImportError } from "./errors";
import { neutralizeOrientation, orientedSize, swapsAxes, type ImageHeader } from "./header";
import type { OrientationSupport } from "./orientation";
import type { PhotoDecoder, SniffedImageType } from "./types";

export interface DecodedSource {
  source: CanvasImageSource;
  /** Dimensions de sortie redressées (orientation comprise). */
  width: number;
  height: number;
  /** Orientation EXIF qu’il reste à appliquer au dessin (1 si le décodeur l’a déjà fait). */
  orientation: number;
  decoder: PhotoDecoder;
  /** Dimensions redressées de la photo d’origine (avant une éventuelle réduction au décodage). */
  sourceWidth: number;
  sourceHeight: number;
  /** Libère la mémoire (bitmap.close, object URL) : à appeler dès que le dessin est fait. */
  release(): void;
}

interface RawSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  release(): void;
}

async function bitmapSource(blob: Blob, options: ImageBitmapOptions): Promise<RawSource> {
  const bitmap = await createImageBitmap(blob, options);
  return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
}

async function elementSource(blob: Blob): Promise<RawSource> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch (error) {
    img.src = "";
    URL.revokeObjectURL(url);
    throw error;
  }
  return {
    source: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    release: () => {
      img.src = "";
      URL.revokeObjectURL(url);
    },
  };
}

/** Décodage natif simple (bitmap si possible, sinon <img>). */
function decodeRaw(blob: Blob, support: OrientationSupport): Promise<RawSource> {
  return support.bitmap ? bitmapSource(blob, support.bitmapOptions) : elementSource(blob);
}

const unreadable = (fileName: string, cause: unknown) => new PhotoImportError("illisible", { fileName, cause });

/** Le navigateur redresse lui-même (vérifié par la sonde). */
export function nativeOrientationWorks(support: OrientationSupport): boolean {
  return support.bitmap ? support.bitmapOriented : support.elementOriented;
}

/**
 * Chemin natif : le navigateur décode et redresse. Réduit au décodage quand c’est sûr.
 * Renvoie null si le résultat contredit l’en-tête (orientation non appliquée) : passer au repli manuel.
 */
export async function decodeNative(
  blob: Blob,
  header: ImageHeader,
  support: OrientationSupport,
  maxSide: number,
  fileName: string,
): Promise<DecodedSource | null> {
  const expected = orientedSize(header);

  if (support.bitmap && support.bitmapResize && expected && Math.max(expected.width, expected.height) > maxSide) {
    const scale = maxSide / Math.max(expected.width, expected.height);
    const resizeWidth = Math.max(1, Math.round(expected.width * scale));
    const resizeHeight = Math.max(1, Math.round(expected.height * scale));
    try {
      const raw = await bitmapSource(blob, { ...support.bitmapOptions, resizeWidth, resizeHeight, resizeQuality: "high" });
      if (raw.width === resizeWidth && raw.height === resizeHeight) {
        return {
          ...raw,
          orientation: 1,
          decoder: "natif-reduit",
          sourceWidth: expected.width,
          sourceHeight: expected.height,
        };
      }
      raw.release();
    } catch {
      // Réduction refusée (mémoire, option) : on retente un décodage complet ci-dessous.
    }
  }

  let raw: RawSource;
  try {
    raw = await decodeRaw(blob, support);
  } catch (error) {
    throw unreadable(fileName, error);
  }
  // Orientation 5 à 8 : les axes doivent être échangés. Sinon le navigateur ne l’a pas appliquée.
  if (
    swapsAxes(header.orientation) &&
    raw.width === header.storedWidth &&
    raw.height === header.storedHeight &&
    raw.width !== raw.height
  ) {
    raw.release();
    return null;
  }
  return { ...raw, orientation: 1, decoder: "natif", sourceWidth: raw.width, sourceHeight: raw.height };
}

/**
 * Repli : orientation EXIF neutralisée dans une copie de l’en-tête (le décodeur rend les pixels stockés),
 * puis appliquée par nous au dessin. Ne dépend d’aucun comportement du navigateur.
 */
export async function decodeWithManualOrientation(
  blob: Blob,
  type: SniffedImageType,
  header: ImageHeader,
  head: Uint8Array,
  support: OrientationSupport,
  fileName: string,
): Promise<DecodedSource> {
  const neutral =
    header.orientation !== 1 && header.orientationOffset !== undefined
      ? new Blob([neutralizeOrientation(head, header), blob.slice(head.length)], { type })
      : blob;
  let raw: RawSource;
  try {
    raw = await decodeRaw(neutral, support);
  } catch (error) {
    throw unreadable(fileName, error);
  }
  const swap = swapsAxes(header.orientation);
  const width = swap ? raw.height : raw.width;
  const height = swap ? raw.width : raw.height;
  return {
    ...raw,
    width,
    height,
    orientation: header.orientation,
    decoder: "exif-manuel",
    sourceWidth: width,
    sourceHeight: height,
  };
}

/**
 * HEIC : décodeur natif d’abord (Safari), sinon conversion par heic-to, chargée seulement ici.
 * La rotation HEIF (boîte « irot ») est appliquée par le décodeur ; l’EXIF Orientation d’un HEIC
 * est informatif et ne doit pas être appliqué une seconde fois.
 */
export async function decodeHeic(blob: Blob, support: OrientationSupport, fileName: string): Promise<DecodedSource> {
  for (const attempt of [support.bitmap ? () => bitmapSource(blob, support.bitmapOptions) : null, () => elementSource(blob)]) {
    if (!attempt) continue;
    try {
      const raw = await attempt();
      return { ...raw, orientation: 1, decoder: "natif", sourceWidth: raw.width, sourceHeight: raw.height };
    } catch {
      // Ce navigateur ne décode pas le HEIC : on passe à heic-to.
    }
  }

  let heicTo: typeof import("heic-to").heicTo;
  try {
    ({ heicTo } = await import("heic-to"));
  } catch (error) {
    throw new PhotoImportError("heic_non_pris_en_charge", { fileName, cause: error });
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await heicTo({ blob, type: "bitmap" });
  } catch (error) {
    throw new PhotoImportError("heic_non_pris_en_charge", { fileName, cause: error });
  }
  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    orientation: 1,
    decoder: "heic-to",
    sourceWidth: bitmap.width,
    sourceHeight: bitmap.height,
    release: () => bitmap.close(),
  };
}

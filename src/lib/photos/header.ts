// Lecture des en-têtes d’image : dimensions stockées et orientation EXIF, sans décoder les pixels.
// Sert à réduire dès le décodage et à vérifier que le navigateur a bien redressé la photo.

import type { SniffedImageType } from "./types";

/** Les segments JPEG utiles (APP1 Exif, SOF) tiennent largement dans le premier demi-mégaoctet. */
export const HEADER_BYTES = 512 * 1024;

export interface ImageHeader {
  /** Dimensions des pixels stockés (avant orientation), si l’en-tête les donne. */
  storedWidth?: number;
  storedHeight?: number;
  /** Orientation EXIF 1 à 8 (1 si absente ou invalide). */
  orientation: number;
  /** Position absolue de la valeur du tag Orientation, pour la neutraliser. */
  orientationOffset?: number;
  littleEndian?: boolean;
}

/** Les orientations 5 à 8 échangent largeur et hauteur. */
export const swapsAxes = (orientation: number) => orientation >= 5 && orientation <= 8;

/** Dimensions affichées (redressées) à partir des dimensions stockées. */
export function orientedSize(header: ImageHeader): { width: number; height: number } | null {
  if (!header.storedWidth || !header.storedHeight) return null;
  return swapsAxes(header.orientation)
    ? { width: header.storedHeight, height: header.storedWidth }
    : { width: header.storedWidth, height: header.storedHeight };
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

/** Lit le tag Orientation (0x0112) dans l’IFD0 d’un bloc TIFF commençant à `tiff`. */
function readTiffOrientation(
  b: Uint8Array,
  tiff: number,
  end: number,
): Pick<ImageHeader, "orientation" | "orientationOffset" | "littleEndian"> {
  const none = { orientation: 1 };
  if (tiff + 8 > end) return none;
  const order = String.fromCharCode(b[tiff], b[tiff + 1]);
  if (order !== "II" && order !== "MM") return none;
  const le = order === "II";
  const r16 = (i: number) => (le ? u16le(b, i) : u16be(b, i));
  const r32 = (i: number) => (le ? (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0 : u32be(b, i));
  if (r16(tiff + 2) !== 42) return none;
  const ifd = tiff + r32(tiff + 4);
  if (ifd + 2 > end) return none;
  const count = r16(ifd);
  for (let n = 0; n < count; n++) {
    const entry = ifd + 2 + n * 12;
    if (entry + 12 > end) break;
    if (r16(entry) !== 0x0112) continue;
    const type = r16(entry + 2);
    if (type !== 3) return none; // SHORT attendu
    const value = r16(entry + 8);
    return value >= 1 && value <= 8
      ? { orientation: value, orientationOffset: entry + 8, littleEndian: le }
      : none;
  }
  return none;
}

/** Parcourt les segments JPEG jusqu’au début des données (SOS). */
function readJpegHeader(b: Uint8Array): ImageHeader {
  const header: ImageHeader = { orientation: 1 };
  let foundExif = false;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) break; // flux corrompu : on s’arrête sans inventer
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1; // octet de remplissage
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // marqueurs sans longueur
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // fin d’image ou début des données
    const length = u16be(b, i + 2);
    if (length < 2) break;
    const start = i + 4;
    const end = Math.min(b.length, i + 2 + length);
    if (marker === 0xe1 && !foundExif && end - start >= 6) {
      const isExif = b[start] === 0x45 && b[start + 1] === 0x78 && b[start + 2] === 0x69 && b[start + 3] === 0x66;
      if (isExif && b[start + 4] === 0 && b[start + 5] === 0) {
        foundExif = true;
        Object.assign(header, readTiffOrientation(b, start + 6, end));
      }
    }
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof && start + 5 <= end) {
      header.storedHeight = u16be(b, start + 1);
      header.storedWidth = u16be(b, start + 3);
    }
    i += 2 + length;
  }
  return header;
}

function readPngHeader(b: Uint8Array): ImageHeader {
  if (b.length < 24) return { orientation: 1 };
  return { orientation: 1, storedWidth: u32be(b, 16), storedHeight: u32be(b, 20) };
}

function readWebpHeader(b: Uint8Array): ImageHeader {
  const header: ImageHeader = { orientation: 1 };
  if (b.length < 30) return header;
  const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (chunk === "VP8X") {
    header.storedWidth = 1 + u24le(b, 24);
    header.storedHeight = 1 + u24le(b, 27);
  } else if (chunk === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
    header.storedWidth = u16le(b, 26) & 0x3fff;
    header.storedHeight = u16le(b, 28) & 0x3fff;
  } else if (chunk === "VP8L" && b[20] === 0x2f) {
    header.storedWidth = 1 + (b[21] | ((b[22] & 0x3f) << 8));
    header.storedHeight = 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10));
  }
  return header;
}

/**
 * Lit dimensions et orientation. Pour PNG et WebP, l’orientation est supposée 1 ;
 * pour HEIC, la rotation est portée par la boîte « irot », appliquée par le décodeur.
 */
export function readImageHeader(bytes: Uint8Array, type: SniffedImageType): ImageHeader {
  switch (type) {
    case "image/jpeg":
      return readJpegHeader(bytes);
    case "image/png":
      return readPngHeader(bytes);
    case "image/webp":
      return readWebpHeader(bytes);
    case "image/heic":
      return { orientation: 1 };
  }
}

/**
 * Copie des octets JPEG avec l’orientation EXIF ramenée à 1 : tout décodeur rendra alors
 * les pixels stockés tels quels, et l’orientation d’origine pourra être appliquée sur le canvas.
 */
export function neutralizeOrientation(bytes: Uint8Array, header: ImageHeader): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes);
  const at = header.orientationOffset;
  if (at === undefined || at + 1 >= copy.length || header.orientation === 1) return copy;
  if (header.littleEndian) {
    copy[at] = 1;
    copy[at + 1] = 0;
  } else {
    copy[at] = 0;
    copy[at + 1] = 1;
  }
  return copy;
}

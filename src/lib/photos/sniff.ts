// Détection du vrai format d’une image par ses premiers octets.
// Le nom du fichier et le type MIME fourni par le navigateur ne sont pas fiables
// (iOS annonce parfois « image/jpeg » pour un HEIC, un fichier peut être mal renommé).

import type { SniffedImageType } from "./types";

/** Nombre d’octets lus en tête de fichier : assez pour la boîte « ftyp » et ses marques compatibles. */
export const SNIFF_BYTES = 64;

/** Marques HEIF d’images HEVC (iPhone : « heic », séquences : « hevc »…). */
const HEVC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"]);
/** Marques HEIF génériques : HEIC… ou AVIF, à départager par les marques compatibles. */
const GENERIC_HEIF_BRANDS = new Set(["mif1", "msf1"]);
const AVIF_BRANDS = new Set(["avif", "avis"]);

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, Math.min(end, bytes.length)));

function heifBrands(bytes: Uint8Array): { major: string; compatible: string[] } | null {
  if (bytes.length < 12 || ascii(bytes, 4, 8) !== "ftyp") return null;
  const boxSize = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  const end = Math.min(bytes.length, boxSize >= 16 ? boxSize : 16);
  const compatible: string[] = [];
  // Après la marque majeure (8-12) vient la version mineure (12-16), puis les marques compatibles.
  for (let i = 16; i + 4 <= end; i += 4) compatible.push(ascii(bytes, i, i + 4));
  return { major: ascii(bytes, 8, 12), compatible };
}

/** Détecte le format à partir des premiers octets (au moins 12, idéalement SNIFF_BYTES). */
export function sniffImageBytes(bytes: Uint8Array): SniffedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";

  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "image/png";

  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";

  const brands = heifBrands(bytes);
  if (brands) {
    if (HEVC_BRANDS.has(brands.major)) return "image/heic";
    const hevcCompatible = brands.compatible.some((b) => HEVC_BRANDS.has(b));
    if (GENERIC_HEIF_BRANDS.has(brands.major)) {
      // « mif1 » seul est un conteneur HEIF : HEIC sauf s’il se déclare AVIF sans marque HEVC.
      const avif = brands.compatible.some((b) => AVIF_BRANDS.has(b));
      return avif && !hevcCompatible ? null : "image/heic";
    }
    if (!AVIF_BRANDS.has(brands.major) && hevcCompatible) return "image/heic";
  }
  return null;
}

/** Détecte le vrai format d’un fichier. */
export async function sniffImageType(blob: Blob): Promise<SniffedImageType | null> {
  const head = new Uint8Array(await blob.slice(0, SNIFF_BYTES).arrayBuffer());
  return sniffImageBytes(head);
}

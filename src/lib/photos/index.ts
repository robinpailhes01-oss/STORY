/**
 * Import des photos — API publique (code navigateur uniquement : à appeler depuis un composant client).
 *
 * ── Importer ─────────────────────────────────────────────────────────────────────────────
 *   importPhoto(file: Blob, options?: PhotoImportOptions): Promise<ImportedPhoto>
 *     Détecte le vrai format (octets de tête), refuse > 50 Mo et les formats inconnus,
 *     décode (natif, sinon heic-to chargé à la demande pour le HEIC), redresse l’orientation,
 *     réduit à 2560 px de plus grand côté (sans agrandir), ré-encode en JPEG 0,9 sans métadonnées.
 *     Rejette toujours avec une PhotoImportError. Les appels sont mis en file (un à la fois).
 *     options : { maxSide = 2560, quality = 0.9, maxBytes = 50 Mo, orientation = "auto" | "manuel", id }
 *
 *   importPhotos(files: Iterable<Blob>, options?, onResult?): Promise<PhotoImportResult[]>
 *     Une par une ; chaque résultat vaut { ok: true, fileName, photo } ou { ok: false, fileName, error }.
 *
 *   releasePhoto(photo): void — révoque photo.url. À appeler quand la photo n’est plus affichée
 *     ni utilisée (remplacement, suppression, démontage de la page). Ne plus dessiner photo.image ensuite.
 *
 *   ImportedPhoto = {
 *     id, name, blob (image/jpeg), url (object URL), width, height,
 *     image (HTMLImageElement décodé, même origine : export canvas sans « taint »),
 *     sourceType ("image/jpeg" | "image/png" | "image/webp" | "image/heic"),
 *     warnings: { code: "basse_definition", message }[]   ← à afficher, n’empêche pas l’usage
 *     diagnostics: { decoder, exifOrientation, sourceWidth, sourceHeight, sourceBytes, durationMs }
 *   }
 *
 * ── Erreurs ──────────────────────────────────────────────────────────────────────────────
 *   class PhotoImportError extends Error { code; fileName; message (français, à afficher tel quel) }
 *   code : "format_inconnu" | "illisible" | "trop_lourde" | "heic_non_pris_en_charge"
 *
 * ── Format ───────────────────────────────────────────────────────────────────────────────
 *   sniffImageType(blob): Promise<SniffedImageType | null> ; sniffImageBytes(bytes) (synchrone).
 *
 * ── Brouillon local (IndexedDB) ──────────────────────────────────────────────────────────
 *   savePhotos(draftId, photos): Promise<{ available, saved, count, message? }>
 *   loadPhotos(draftId): Promise<{ available, photos: ImportedPhoto[], unreadable, message? }>
 *   deletePhotos(draftId): Promise<{ available, deleted, message? }>
 *   photoStoreStatus(): Promise<{ available, message? }>
 *     Ne lèvent jamais : sans IndexedDB (navigation privée), available = false et un message français.
 *     Les photos relues ont le même id ; leurs url/image sont neuves (penser à releasePhoto).
 *
 * Exemple :
 *   const results = await importPhotos(input.files ?? []);
 *   for (const r of results) r.ok ? show(r.photo) : showError(r.error.message);
 *   await savePhotos("brouillon", photos);
 */

export type {
  ImportedPhoto,
  PhotoDecoder,
  PhotoDiagnostics,
  PhotoImportOptions,
  PhotoWarning,
  PhotoWarningCode,
  SniffedImageType,
} from "./types";
export { PHOTO_ERROR_MESSAGES, PhotoImportError, isPhotoImportError, type PhotoImportErrorCode } from "./errors";
export { sniffImageBytes, sniffImageType } from "./sniff";
export {
  DEFAULT_JPEG_QUALITY,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_SIDE,
  MIN_SHARP_SIDE,
  importPhoto,
  importPhotos,
  releasePhoto,
  type PhotoImportResult,
} from "./import-photo";
export { getOrientationSupport, type OrientationSupport } from "./orientation";
export {
  deletePhotos,
  loadPhotos,
  photoStoreStatus,
  savePhotos,
  type DeletePhotosResult,
  type LoadPhotosResult,
  type PhotoStoreStatus,
  type SavePhotosResult,
} from "./store";

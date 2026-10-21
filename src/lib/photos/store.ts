// Brouillon local des photos (IndexedDB, sur l’appareil uniquement).
// Les photos sont stockées en ArrayBuffer (plus sûr que Blob dans IndexedDB sur les anciens Safari).
// Sans IndexedDB (navigation privée de certains navigateurs, stockage bloqué), rien ne plante :
// chaque fonction renvoie `available: false` et un message à afficher.

import { decodedImage, lowResolutionWarning } from "./import-photo";
import type { ImportedPhoto, PhotoDiagnostics, SniffedImageType } from "./types";

const DB_NAME = "story-brouillon";
const DB_VERSION = 1;
const STORE = "photos";
const BY_DRAFT = "draftId";
const OPEN_TIMEOUT_MS = 5000;

interface PhotoRecord {
  key: string;
  draftId: string;
  index: number;
  id: string;
  name: string;
  sourceType: SniffedImageType;
  width: number;
  height: number;
  data: ArrayBuffer;
  diagnostics: PhotoDiagnostics;
  savedAt: number;
}

export interface PhotoStoreStatus {
  /** IndexedDB est utilisable sur cet appareil. */
  available: boolean;
  /** Message français à afficher en cas de problème. */
  message?: string;
}

export interface SavePhotosResult extends PhotoStoreStatus {
  saved: boolean;
  count: number;
}

export interface LoadPhotosResult extends PhotoStoreStatus {
  photos: ImportedPhoto[];
  /** Photos présentes dans le brouillon mais impossibles à relire. */
  unreadable: number;
}

export interface DeletePhotosResult extends PhotoStoreStatus {
  deleted: boolean;
}

const UNAVAILABLE =
  "Le brouillon ne peut pas être gardé sur cet appareil (navigation privée ou stockage bloqué). Vos photos restent utilisables tant que la page est ouverte.";
const QUOTA = "Plus assez de place sur l’appareil pour garder les photos du brouillon.";
const FAILED = "Le brouillon des photos n’a pas pu être enregistré.";

type Db = { db: IDBDatabase } | { db: null; message: string };

let opening: Promise<Db> | null = null;

function openDb(): Promise<Db> {
  if (opening) return opening;
  const attempt = new Promise<Db>((resolve) => {
    let idb: IDBFactory | undefined;
    try {
      idb = typeof indexedDB === "undefined" ? undefined : indexedDB;
    } catch {
      idb = undefined; // l’accès lui-même peut lever (SecurityError)
    }
    if (!idb) return resolve({ db: null, message: UNAVAILABLE });
    let request: IDBOpenDBRequest;
    try {
      request = idb.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve({ db: null, message: UNAVAILABLE });
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex(BY_DRAFT, "draftId", { unique: false });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // Une autre version de l’application demande la base : on la libère.
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      resolve({ db });
    };
    request.onerror = () => resolve({ db: null, message: UNAVAILABLE });
    // Certains Safari laissent l’ouverture sans réponse : passé ce délai, on considère le stockage absent.
    setTimeout(() => resolve({ db: null, message: UNAVAILABLE }), OPEN_TIMEOUT_MS);
    request.onblocked = () => resolve({ db: null, message: "Le brouillon est verrouillé par un autre onglet. Fermez-le puis réessayez." });
  });
  // Un échec n’est pas mémorisé : un nouvel essai reste possible.
  opening = attempt.then((result) => {
    if (!result.db) opening = null;
    return result;
  });
  return opening;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("transaction annulée"));
  });
}

const isQuota = (error: unknown) => error instanceof DOMException && error.name === "QuotaExceededError";

/** IndexedDB est-il utilisable ? (n’écrit rien) */
export async function photoStoreStatus(): Promise<PhotoStoreStatus> {
  const opened = await openDb();
  return opened.db ? { available: true } : { available: false, message: opened.message };
}

/** Remplace les photos du brouillon `draftId` par `photos` (dans l’ordre). */
export async function savePhotos(draftId: string, photos: readonly ImportedPhoto[]): Promise<SavePhotosResult> {
  const opened = await openDb();
  if (!opened.db) return { available: false, saved: false, count: 0, message: opened.message };

  // Lecture des octets AVANT d’ouvrir la transaction : elle se fermerait pendant une attente étrangère à IndexedDB.
  let records: PhotoRecord[];
  try {
    const savedAt = Date.now();
    records = await Promise.all(
      photos.map(async (photo, index) => ({
        key: `${draftId}:${index}`,
        draftId,
        index,
        id: photo.id,
        name: photo.name,
        sourceType: photo.sourceType,
        width: photo.width,
        height: photo.height,
        data: await photo.blob.arrayBuffer(),
        diagnostics: photo.diagnostics,
        savedAt,
      })),
    );
  } catch {
    return { available: true, saved: false, count: 0, message: FAILED };
  }

  try {
    const tx = opened.db.transaction(STORE, "readwrite");
    const done = txDone(tx);
    const store = tx.objectStore(STORE);
    const keys = store.index(BY_DRAFT).getAllKeys(draftId);
    keys.onsuccess = () => {
      // Suppression puis écriture dans la même transaction : l’ordre des requêtes est garanti.
      for (const key of keys.result) store.delete(key);
      for (const record of records) store.put(record);
    };
    await done;
    return { available: true, saved: true, count: records.length };
  } catch (error) {
    return { available: true, saved: false, count: 0, message: isQuota(error) ? QUOTA : FAILED };
  }
}

/** Relit les photos du brouillon et recrée des ImportedPhoto (object URL et image décodée neuves). */
export async function loadPhotos(draftId: string): Promise<LoadPhotosResult> {
  const opened = await openDb();
  if (!opened.db) return { available: false, photos: [], unreadable: 0, message: opened.message };

  let records: PhotoRecord[];
  try {
    const tx = opened.db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).index(BY_DRAFT).getAll(draftId);
    records = await new Promise<PhotoRecord[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as PhotoRecord[]);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return { available: true, photos: [], unreadable: 0, message: "Le brouillon des photos n’a pas pu être relu." };
  }

  records.sort((a, b) => a.index - b.index);
  const photos: ImportedPhoto[] = [];
  let unreadable = 0;
  for (const record of records) {
    const blob = new Blob([record.data], { type: "image/jpeg" });
    try {
      const { url, image } = await decodedImage(blob);
      photos.push({
        id: record.id,
        name: record.name,
        blob,
        url,
        width: record.width,
        height: record.height,
        image,
        sourceType: record.sourceType,
        warnings: lowResolutionWarning(record.width, record.height),
        diagnostics: { ...record.diagnostics, decoder: "brouillon" },
      });
    } catch {
      unreadable += 1;
    }
  }
  return {
    available: true,
    photos,
    unreadable,
    message: unreadable ? `${unreadable} photo(s) du brouillon n’ont pas pu être relues.` : undefined,
  };
}

/** Supprime les photos du brouillon `draftId`. */
export async function deletePhotos(draftId: string): Promise<DeletePhotosResult> {
  const opened = await openDb();
  if (!opened.db) return { available: false, deleted: false, message: opened.message };
  try {
    const tx = opened.db.transaction(STORE, "readwrite");
    const done = txDone(tx);
    const store = tx.objectStore(STORE);
    const keys = store.index(BY_DRAFT).getAllKeys(draftId);
    keys.onsuccess = () => {
      for (const key of keys.result) store.delete(key);
    };
    await done;
    return { available: true, deleted: true };
  } catch {
    return { available: true, deleted: false, message: "Le brouillon des photos n’a pas pu être effacé." };
  }
}

// Rapport du labo photos, publié sur window.__photoLab pour scripts/verify-photos.mjs.

import {
  sniffImageBytes,
  type ImportedPhoto,
  type OrientationSupport,
  type PhotoImportErrorCode,
  type PhotoImportResult,
} from "@/lib/photos";

export type LabEntry =
  | { key: string; fileName: string; status: "ok"; photo: ImportedPhoto; restored: boolean }
  | { key: string; fileName: string; status: "erreur"; code: PhotoImportErrorCode; message: string };

export interface LabDraftState {
  available: boolean | null;
  message: string | null;
  /** Dernière action terminée sur le brouillon. */
  last: "aucune" | "restauré" | "enregistré" | "effacé";
  count: number;
}

export function entryReport(entry: LabEntry) {
  if (entry.status === "erreur") {
    return { fileName: entry.fileName, status: entry.status, code: entry.code, message: entry.message };
  }
  const p = entry.photo;
  return {
    fileName: entry.fileName,
    status: entry.status,
    restored: entry.restored,
    id: p.id,
    width: p.width,
    height: p.height,
    blobType: p.blob.type,
    blobSize: p.blob.size,
    sourceType: p.sourceType,
    urlIsBlob: p.url.startsWith("blob:"),
    imageComplete: p.image.complete && p.image.naturalWidth === p.width && p.image.naturalHeight === p.height,
    warnings: p.warnings.map((w) => w.code),
    warningMessages: p.warnings.map((w) => w.message),
    ...p.diagnostics,
  };
}

export const resultReport = (r: PhotoImportResult) =>
  r.ok ? entryReport({ key: "", fileName: r.fileName, status: "ok", photo: r.photo, restored: false })
       : entryReport({ key: "", fileName: r.fileName, status: "erreur", code: r.error.code, message: r.error.message });

/** Couleur de pixels de l’image décodée (positions relatives 0..1) ; lève si le canvas est « tainted ». */
export function samplePhoto(photo: ImportedPhoto, points: [number, number][]): number[][] {
  const canvas = document.createElement("canvas");
  canvas.width = photo.image.naturalWidth;
  canvas.height = photo.image.naturalHeight;
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas 2D indisponible");
    ctx.drawImage(photo.image, 0, 0);
    return points.map(([fx, fy]) => {
      const x = Math.min(canvas.width - 1, Math.max(0, Math.round(fx * canvas.width)));
      const y = Math.min(canvas.height - 1, Math.max(0, Math.round(fy * canvas.height)));
      const d = ctx.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    });
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** Le JPEG produit ne doit plus contenir de bloc EXIF ni la marque de l’appareil. */
export async function inspectPhotoBytes(photo: ImportedPhoto) {
  const bytes = new Uint8Array(await photo.blob.arrayBuffer());
  const text = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 256 * 1024)));
  return {
    size: bytes.length,
    startsWithJpeg: bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    hasExif: text.includes("Exif\0\0"),
    hasMake: text.includes("STORY tests"),
  };
}

export const sniffNumbers = (bytes: number[]) => sniffImageBytes(new Uint8Array(bytes));

export interface PhotoLabWindow {
  ready: boolean;
  busy: boolean;
  support: OrientationSupport | null;
  entries: ReturnType<typeof entryReport>[];
  draft: LabDraftState;
  importFiles(files: Blob[], options?: { orientation?: "auto" | "manuel" }): Promise<ReturnType<typeof resultReport>[]>;
  sample(id: string, points: [number, number][]): number[][];
  inspect(id: string): Promise<Awaited<ReturnType<typeof inspectPhotoBytes>>>;
  sniff(bytes: number[]): string | null;
  save(): Promise<void>;
  restore(): Promise<void>;
  clearDraft(): Promise<void>;
}

declare global {
  interface Window {
    __photoLab?: PhotoLabWindow;
  }
}

import JSZip from "jszip";
import type { ExportedPng } from "./png";

/** ZIP ordonné (01, 02…) ; les PNG sont déjà compressés, on les stocke sans recompression. */
export async function zipPngs(files: ExportedPng[]): Promise<Blob> {
  const zip = new JSZip();
  for (const file of [...files].sort((a, b) => a.index - b.index)) {
    zip.file(file.fileName, file.blob, { compression: "STORE", date: new Date(Date.UTC(2026, 0, 1)) });
  }
  return zip.generateAsync({ type: "blob", mimeType: "application/zip" });
}

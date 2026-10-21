import type Konva from "konva";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "@/domain/story-document";

export interface ExportedPng {
  index: number;
  slideId: string;
  fileName: string;
  blob: Blob;
  width: number;
  height: number;
}

/** Rend la Stage non réduite en PNG au ratio 1, puis relit le fichier pour contrôler ses dimensions. */
export async function stageToPng(stage: Konva.Stage): Promise<{ blob: Blob; width: number; height: number }> {
  const blob = (await stage.toBlob({ pixelRatio: 1, mimeType: "image/png" })) as Blob | null;
  if (!blob) throw new Error("Le navigateur n’a pas produit d’image");
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  bitmap.close();
  if (width !== CANVAS_WIDTH || height !== CANVAS_HEIGHT) {
    throw new Error(`Image de ${width}×${height} au lieu de ${CANVAS_WIDTH}×${CANVAS_HEIGHT}`);
  }
  return { blob, width, height };
}

export function pngFileName(documentId: string, index: number, slideId: string): string {
  return `${documentId}-${String(index + 1).padStart(2, "0")}-${slideId}.png`;
}

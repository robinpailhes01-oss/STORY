import { seededRandom } from "./random";

export const GRAIN_TILE = 256;

let tile: HTMLCanvasElement | null = null;

/**
 * Tuile de bruit 256 × 256 générée une fois (graine fixe), répétée en motif sur toute la story.
 * Gris centré sur 128 : en mode « overlay », le gris moyen ne change pas la photo, seuls les écarts se voient.
 */
export function grainTile(): HTMLCanvasElement {
  if (tile) return tile;
  const canvas = document.createElement("canvas");
  canvas.width = GRAIN_TILE;
  canvas.height = GRAIN_TILE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponible");
  const image = ctx.createImageData(GRAIN_TILE, GRAIN_TILE);
  const random = seededRandom("story-grain-v1");
  for (let i = 0; i < image.data.length; i += 4) {
    // Somme de deux tirages : répartition en cloche, grain plus doux qu’un bruit uniforme.
    const v = Math.round(128 + (random() + random() - 1) * 110);
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  tile = canvas;
  return canvas;
}

import type { Crop, StoryDocument } from "@/domain/story-document";

/**
 * Images déjà décodées, fournies par l’appelant : assetId → source dessinable.
 * Le renderer ne fait aucune requête réseau.
 */
export type ImageTable = ReadonlyMap<string, CanvasImageSource>;

export const EMPTY_IMAGES: ImageTable = new Map();

export function sourceSize(source: CanvasImageSource): { width: number; height: number } {
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  if (typeof SVGImageElement !== "undefined" && source instanceof SVGImageElement) {
    return { width: source.width.baseVal.value, height: source.height.baseVal.value };
  }
  const sized = source as { width: number; height: number };
  return { width: sized.width, height: sized.height };
}

/**
 * Recadrage « cover » : la zone de la photo à dessiner dans un cadre width × height,
 * centrée sur le point focal autant que les bords le permettent, agrandie par zoom (≥ 1).
 */
export function coverCrop(
  source: { width: number; height: number },
  crop: Crop,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } {
  const zoom = Math.max(1, crop.zoom);
  const scale = Math.max(width / source.width, height / source.height) * zoom;
  const w = width / scale;
  const h = height / scale;
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  return {
    x: clamp(crop.focalX * source.width - w / 2, source.width - w),
    y: clamp(crop.focalY * source.height - h / 2, source.height - h),
    width: w,
    height: h,
  };
}

/** Photos du document absentes de la table : non bloquant, le renderer dessine un fond de secours. */
export function missingImages(doc: StoryDocument, images: ImageTable): Array<{ slideId: string; assetId: string }> {
  const missing: Array<{ slideId: string; assetId: string }> = [];
  for (const slide of doc.slides) {
    if (slide.background.kind === "image" && !images.has(slide.background.assetId)) {
      missing.push({ slideId: slide.id, assetId: slide.background.assetId });
    }
    for (const block of slide.blocks) {
      if (block.kind === "image" && !images.has(block.assetId)) missing.push({ slideId: slide.id, assetId: block.assetId });
    }
  }
  return missing;
}

/**
 * Mots géants sans détourage de la personne : non bloquant, le mot est dessiné derrière le texte mais
 * devant la photo. Les détourages sont fournis par assetId de photo (même taille ou même rapport que la photo).
 */
export function cutoutWarnings(doc: StoryDocument, cutouts: ImageTable): string[] {
  const warnings: string[] = [];
  doc.slides.forEach((slide, index) => {
    const giant = slide.blocks.some((b) => b.kind === "text" && b.behindSubject);
    if (!giant || slide.background.kind !== "image") return;
    if (!cutouts.has(slide.background.assetId)) {
      warnings.push(`story ${index + 1} : détourage indisponible, le mot géant passe devant la personne`);
    }
  });
  return warnings;
}

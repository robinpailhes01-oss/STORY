import type { PhotoRef } from "@/lib/compose";

/** Photos de test synthétiques (public/samples/test/, placeholders), dans l’ordre des 3 photos de la séquence. */
export const TEST_PHOTOS: Array<PhotoRef & { src: string; label: string }> = [
  { assetId: "test-mer", src: "/samples/test/mer-plan-large.jpg", label: "Plan large, en mer", focalX: 0.55, focalY: 0.5 },
  { assetId: "test-salle", src: "/samples/test/salle-plan-moyen.jpg", label: "Plan moyen, salle", focalX: 0.5, focalY: 0.45 },
  { assetId: "test-portrait", src: "/samples/test/portrait.jpg", label: "Portrait", focalX: 0.5, focalY: 0.4 },
];

/** Décode les photos avant le rendu : le renderer ne charge rien lui-même. */
export async function loadTestPhotos(): Promise<Map<string, CanvasImageSource>> {
  const entries = await Promise.all(
    TEST_PHOTOS.map(async (photo) => {
      const image = new Image();
      image.src = photo.src;
      try {
        await image.decode();
      } catch {
        throw new Error(`Photo de test illisible : ${photo.src}`);
      }
      return [photo.assetId, image] as const;
    }),
  );
  return new Map(entries);
}

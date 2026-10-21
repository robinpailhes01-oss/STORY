import type { Drawings } from "@/domain/render-options";
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

type Shape = { ellipse: [number, number, number, number] } | { polygon: number[] };

/**
 * Silhouettes des personnes dessinées dans les photos de test (repère des fichiers, 1200 × 1600),
 * relevées sur les images : un détourage synthétique, en attendant le vrai (MediaPipe, autre module).
 */
const SILHOUETTES: Record<string, Shape[]> = {
  "test-mer": [
    { ellipse: [762, 707, 56, 68] },
    { polygon: [728, 750, 800, 750, 800, 795, 728, 795] },
    { polygon: [652, 790, 872, 790, 912, 1080, 860, 1092, 850, 1545, 676, 1545, 668, 1092, 612, 1080] },
  ],
  "test-salle": [
    { ellipse: [602, 466, 68, 82] },
    { polygon: [574, 530, 630, 530, 630, 605, 574, 605] },
    { polygon: [460, 598, 744, 598, 790, 952, 724, 958, 720, 1500, 484, 1500, 480, 958, 412, 952] },
  ],
  "test-portrait": [
    { ellipse: [610, 360, 214, 118] },
    { ellipse: [611, 655, 180, 210] },
    { polygon: [540, 820, 690, 820, 690, 1005, 540, 1005] },
    { polygon: [150, 995, 1052, 995, 1200, 1600, 0, 1600] },
  ],
};

/**
 * Détourages de test : la photo, rendue transparente hors de la silhouette (RGBA, même taille que la photo),
 * le format que le module de segmentation fournira.
 */
export function buildTestCutouts(images: ReadonlyMap<string, CanvasImageSource>): Map<string, CanvasImageSource> {
  const cutouts = new Map<string, CanvasImageSource>();
  for (const [assetId, shapes] of Object.entries(SILHOUETTES)) {
    const photo = images.get(assetId) as HTMLImageElement | undefined;
    if (!photo) continue;
    const canvas = document.createElement("canvas");
    canvas.width = photo.naturalWidth;
    canvas.height = photo.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponible");
    ctx.drawImage(photo, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    for (const shape of shapes) {
      if ("ellipse" in shape) {
        const [cx, cy, rx, ry] = shape.ellipse;
        ctx.moveTo(cx + rx, cy);
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      } else {
        const p = shape.polygon;
        ctx.moveTo(p[0], p[1]);
        for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
        ctx.closePath();
      }
    }
    ctx.fill("nonzero");
    cutouts.set(assetId, canvas);
  }
  return cutouts;
}

/** Dessin de test : un trait de chaque outil sur la story 2 (la story 3 n’en hérite pas), un ovale en deux points sur la 4. */
export const TEST_DRAWINGS: Drawings = {
  1: [
    {
      id: "test-stylo",
      tool: "stylo",
      color: "#FFFFFF",
      width: 9,
      points: [140, 1380, 220, 1330, 300, 1400, 380, 1330, 460, 1400, 540, 1335, 620, 1395],
    },
    { id: "test-surligneur", tool: "surligneur", color: "#FFE45C", width: 54, points: [90, 1490, 400, 1486, 720, 1494, 990, 1488] },
    {
      id: "test-ovale",
      tool: "ovale",
      color: "#FF5A5A",
      width: 8,
      points: [720, 1200, 860, 1170, 980, 1230, 970, 1320, 840, 1350, 730, 1310, 700, 1240, 740, 1195],
    },
  ],
  3: [{ id: "test-ovale-boite", tool: "ovale", color: "#7CFFB2", width: 8, points: [560, 1380, 1000, 1540] }],
};

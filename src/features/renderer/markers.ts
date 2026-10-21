// Géométrie des marquages, en px du bloc, exprimée en fractions de la taille de police (em)
// pour rester juste quelle que soit la police ou la taille.
import type { AccentBox, LaidOutLine } from "@/lib/layout/text-layout";
import { seededRandom } from "./random";

export interface RectGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius: number;
}

/** Barre épaisse sous les mots, légèrement sous la ligne de base, dessinée derrière le texte. */
export function underlineRect(box: AccentBox, fontSize: number): RectGeometry {
  return {
    x: box.x - fontSize * 0.04,
    y: box.baseline - fontSize * 0.06,
    width: box.width + fontSize * 0.08,
    height: fontSize * 0.2,
    cornerRadius: fontSize * 0.03,
  };
}

/** Pastille pleine derrière les mots (de la hauteur des capitales accentuées aux jambages). */
export function pastilleRect(box: AccentBox, fontSize: number): RectGeometry {
  const padX = fontSize * 0.2;
  const top = box.baseline - fontSize * 0.9;
  return {
    x: box.x - padX,
    y: top,
    width: box.width + 2 * padX,
    height: fontSize * 1.18,
    cornerRadius: fontSize * 0.16,
  };
}

/** Pastille inclinée (surligneur) : parallélogramme, sommets en points [x, y, …]. */
export function skewedPastillePoints(box: AccentBox, fontSize: number, skewDeg: number): number[] {
  const r = pastilleRect(box, fontSize);
  const shift = (Math.tan((skewDeg * Math.PI) / 180) * r.height) / 2;
  return [r.x + shift, r.y, r.x + r.width + shift, r.y, r.x + r.width - shift, r.y + r.height, r.x - shift, r.y + r.height];
}

/**
 * Ovale tracé à la main autour d’un accent : un peu plus d’un tour, qui ne se referme pas parfaitement,
 * légèrement irrégulier. Aléatoire déterministe : même graine, même trait (aperçu = export).
 */
export function handDrawnOval(box: AccentBox, fontSize: number, seed: string): number[] {
  const random = seededRandom(seed);
  const cx = box.x + box.width / 2;
  const cy = box.baseline - fontSize * 0.34;
  const rx = box.width / 2 + fontSize * 0.36;
  const ry = fontSize * 0.78;
  const start = -Math.PI * (0.62 + random() * 0.16);
  const turns = 1.1 + random() * 0.08;
  const tilt = (random() - 0.5) * 0.06;
  const steps = 40;
  const points: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = start + (i / steps) * Math.PI * 2 * turns;
    const jitter = 1 + (random() - 0.5) * 0.05;
    // Le tracé dérive un peu vers le haut : le second passage ne retombe pas sur le premier.
    const drift = (i / steps) * fontSize * 0.12;
    const px = Math.cos(t) * rx * jitter;
    const py = Math.sin(t) * ry * jitter - drift;
    points.push(cx + px * Math.cos(tilt) - py * Math.sin(tilt), cy + px * Math.sin(tilt) + py * Math.cos(tilt));
  }
  return points;
}

/** Bandeau : un rectangle plein par ligne de texte, façon coupure de journal. */
export function bandRect(line: LaidOutLine, fontSize: number): RectGeometry {
  const padX = fontSize * 0.28;
  return {
    x: line.x - padX,
    y: line.baseline - fontSize * 0.92,
    width: line.width + 2 * padX,
    height: fontSize * 1.22,
    cornerRadius: 0,
  };
}

/** Trait fin sous un accent posé sur bandeau. */
export function thinUnderlineRect(box: AccentBox, fontSize: number): RectGeometry {
  return { x: box.x, y: box.baseline + fontSize * 0.1, width: box.width, height: Math.max(2, fontSize * 0.055), cornerRadius: 0 };
}

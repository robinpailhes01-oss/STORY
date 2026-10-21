// Décorations « faites main » (flèches, étoiles, éclair, étincelles) : géométrie calculée à la composition,
// de façon déterministe (graine), dans le repère 1080 × 1920. Chaque décoration essaie plusieurs placements
// et garde le premier qui reste dans la zone sûre sans toucher une ligne de texte.
import type { DecorationShape } from "@/domain/story-document";
import type { DecorationId } from "@/domain/render-options";
import { seededRandom } from "@/features/renderer/random";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DecorationContext {
  /** Boîtes des mots en évidence candidats (le premier d’abord), en coordonnées absolues. */
  anchors: Rect[];
  /** Lignes de texte à ne pas recouvrir. */
  obstacles: Rect[];
  /** Zone où la décoration doit rester (zones Instagram exclues). */
  safe: { left: number; top: number; right: number; bottom: number };
  /** Taille du texte de l’ancre : les décorations suivent son échelle. */
  fontSize: number;
  seed: string;
}

export interface DecorationPlan {
  shapes: DecorationShape[];
  /** Index de l’ancre retenue dans `anchors` (null pour la flèche vers la suite). */
  anchorIndex: number | null;
}

/** Marge minimale entre une décoration et une ligne de texte. */
export const DECORATION_CLEARANCE = 12;
export const DECORATION_SAFE = { left: 30, top: 262, right: 1050, bottom: 1606 } as const;

type Pt = [number, number];

const flat = (points: Pt[]) => points.flatMap(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);

/** Étoile à 4 branches (✦), pleine. */
function sparkle(cx: number, cy: number, r: number, rotation: number): DecorationShape {
  const points: Pt[] = [];
  for (let i = 0; i < 8; i++) {
    const a = rotation + (i * Math.PI) / 4 - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.3;
    points.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
  }
  return { points: flat(points), closed: true, filled: true, strokeWidth: Math.max(1, r * 0.12), tension: 0 };
}

/** Distance d’un point à un rectangle (0 dedans). */
function distanceToRect([x, y]: Pt, r: Rect): number {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.width));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.height));
  return Math.hypot(dx, dy);
}

/** Points d’un tracé + demi-épaisseur : densifiés pour que le contrôle ne saute pas par-dessus une ligne. */
function samples(shape: DecorationShape): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < shape.points.length; i += 2) pts.push([shape.points[i], shape.points[i + 1]]);
  if (shape.closed && pts.length > 1) pts.push(pts[0]);
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    out.push(pts[i]);
    if (i === 0) continue;
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6);
    for (let k = 1; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  return out;
}

/** Vrai si tous les tracés restent dans la zone sûre, à distance des lignes de texte. */
export function isClear(shapes: DecorationShape[], ctx: Pick<DecorationContext, "obstacles" | "safe">): boolean {
  for (const shape of shapes) {
    const pad = shape.strokeWidth / 2;
    for (const p of samples(shape)) {
      const [x, y] = p;
      if (x - pad < ctx.safe.left || x + pad > ctx.safe.right || y - pad < ctx.safe.top || y + pad > ctx.safe.bottom) return false;
      if (ctx.obstacles.some((o) => distanceToRect(p, o) < DECORATION_CLEARANCE + pad)) return false;
    }
  }
  return true;
}

/** Point d’une courbe de Bézier quadratique. */
function quad(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
}

/** Flèche tracée à la main : corps courbe de `from` à `to`, pointe en deux traits. */
function handArrow(from: Pt, to: Pt, bend: number, width: number, random: () => number): DecorationShape[] {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const nx = -(to[1] - from[1]) / len;
  const ny = (to[0] - from[0]) / len;
  const control: Pt = [(from[0] + to[0]) / 2 + nx * bend * len, (from[1] + to[1]) / 2 + ny * bend * len];
  const body: Pt[] = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const [x, y] = quad(from, control, to, i / steps);
    const wobble = i === 0 || i === steps ? 0 : (random() - 0.5) * width * 0.5;
    body.push([x + nx * wobble, y + ny * wobble]);
  }
  // Direction d’arrivée : tangente en fin de courbe.
  const [px, py] = quad(from, control, to, 0.9);
  const angle = Math.atan2(to[1] - py, to[0] - px);
  const head = Math.max(22, width * 4.4);
  const spread = 0.5 + random() * 0.12;
  const wing = (side: number): Pt => [to[0] - Math.cos(angle + side * spread) * head, to[1] - Math.sin(angle + side * spread) * head];
  const stroke = (points: Pt[]): DecorationShape => ({ points: flat(points), closed: false, filled: false, strokeWidth: width, tension: 0.4 });
  return [stroke(body), stroke([wing(1), to, wing(-1)])];
}

/** Éclair plein, hauteur h, centré sur (cx, cy), incliné de `tilt` radians. */
function bolt(cx: number, cy: number, h: number, tilt: number): DecorationShape {
  const unit: Pt[] = [
    [0.12, -0.5],
    [-0.26, 0.06],
    [-0.02, 0.06],
    [-0.14, 0.5],
    [0.28, -0.08],
    [0.03, -0.08],
    [0.2, -0.5],
  ];
  const points = unit.map(([x, y]): Pt => {
    const px = x * h;
    const py = y * h;
    return [cx + px * Math.cos(tilt) - py * Math.sin(tilt), cy + px * Math.sin(tilt) + py * Math.cos(tilt)];
  });
  return { points: flat(points), closed: true, filled: true, strokeWidth: Math.max(2, h * 0.04), tension: 0 };
}

function scaleOf(ctx: DecorationContext): number {
  return Math.min(1.6, Math.max(0.8, ctx.fontSize / 41));
}

/** Traînée d’étoiles qui part du mot : petites près du mot, plus grandes au bout. */
function trail(ctx: DecorationContext, random: () => number): DecorationPlan | null {
  const s = scaleOf(ctx);
  const directions = [32, 148, 58, 122, 8, 172, -28, -152, 90];
  for (const [index, a] of ctx.anchors.entries()) {
    for (const deg of directions) {
      for (const lengthFactor of [1, 0.72]) {
        const rad = (deg * Math.PI) / 180;
        const dx = Math.cos(rad);
        const dy = Math.sin(rad);
        const start: Pt = [
          dx >= 0 ? a.x + a.width * 0.8 + dx * 18 : a.x + a.width * 0.2 + dx * 18,
          dy >= 0 ? a.y + a.height + dy * 10 : a.y + dy * 10,
        ];
        const length = 330 * s * lengthFactor;
        const bend = (random() < 0.5 ? -1 : 1) * 36 * s;
        const count = 8;
        const shapes: DecorationShape[] = [];
        for (let i = 0; i < count; i++) {
          const t = (i + 0.6) / count;
          const wave = Math.sin(t * Math.PI) * bend;
          const cx = start[0] + dx * t * length - dy * wave + (random() - 0.5) * 8 * s;
          const cy = start[1] + dy * t * length + dx * wave + (random() - 0.5) * 8 * s;
          const r = (4.5 + 11 * t ** 1.6 + random() * 2.5) * s;
          shapes.push(sparkle(cx, cy, r, (random() - 0.5) * 0.5));
        }
        if (isClear(shapes, ctx)) return { shapes, anchorIndex: index };
      }
    }
  }
  return null;
}

/** Petit éclair près d’un coin du mot. */
function lightning(ctx: DecorationContext, random: () => number): DecorationPlan | null {
  const s = scaleOf(ctx);
  const h = 84 * s;
  for (const [index, a] of ctx.anchors.entries()) {
    const spots: Array<[Pt, number]> = [
      [[a.x + a.width + h * 0.42, a.y - h * 0.18], 0.32],
      [[a.x + a.width + h * 0.45, a.y + a.height / 2], 0.22],
      [[a.x - h * 0.42, a.y - h * 0.18], -0.32],
      [[a.x + a.width + h * 0.2, a.y + a.height + h * 0.5], 0.4],
      [[a.x - h * 0.45, a.y + a.height / 2], -0.22],
      [[a.x - h * 0.2, a.y + a.height + h * 0.5], -0.4],
      [[a.x + a.width * 0.7, a.y - h * 0.62], 0.18],
      [[a.x + a.width * 0.5, a.y + a.height + h * 0.62], 0.2],
    ];
    for (const [[cx, cy], tilt] of spots) {
      const shape = bolt(cx, cy, h, tilt + (random() - 0.5) * 0.12);
      if (isClear([shape], ctx)) return { shapes: [shape], anchorIndex: index };
    }
  }
  return null;
}

/** Quelques étincelles (étoiles à 4 branches) autour du mot, là où il y a de la place. */
function sparkles(ctx: DecorationContext, random: () => number): DecorationPlan | null {
  const s = scaleOf(ctx);
  for (const [index, a] of ctx.anchors.entries()) {
    const cx = a.x + a.width / 2;
    const cy = a.y + a.height / 2;
    const rx = a.width / 2 + 34 * s;
    const ry = a.height / 2 + 30 * s;
    const kept: DecorationShape[] = [];
    const used: Pt[] = [];
    // Angles balayés à partir du haut à droite, sens horaire inverse ; quelques tailles variées.
    for (let k = 0; k < 24 && kept.length < 5; k++) {
      const angle = -Math.PI / 4 + (k * 2 * Math.PI) / 24 + (random() - 0.5) * 0.12;
      const reach = 1 + random() * 0.35;
      const p: Pt = [cx + Math.cos(angle) * rx * reach, cy + Math.sin(angle) * ry * reach];
      if (used.some((u) => Math.hypot(u[0] - p[0], u[1] - p[1]) < 46 * s)) continue;
      const r = (kept.length % 2 === 0 ? 15 : 9) * s * (0.85 + random() * 0.3);
      const shape = sparkle(p[0], p[1], r, (random() - 0.5) * 0.4);
      if (!isClear([shape], ctx)) continue;
      kept.push(shape);
      used.push(p);
    }
    if (kept.length >= 3) return { shapes: kept, anchorIndex: index };
  }
  return null;
}

/** Flèche dessinée à la main qui pointe vers le mot, depuis un espace libre. */
function arrowToWord(ctx: DecorationContext, random: () => number): DecorationPlan | null {
  const s = scaleOf(ctx);
  const width = 6 * s;
  // La pointe s’arrête juste au-delà de la marge de sécurité autour du texte.
  const gap = DECORATION_CLEARANCE + width + 4;
  for (const [index, a] of ctx.anchors.entries()) {
    const approaches: Array<{ to: Pt; angles: number[] }> = [
      { to: [a.x + a.width * 0.55, a.y + a.height + gap], angles: [70, 110, 45, 135, 90] },
      { to: [a.x + a.width + gap, a.y + a.height * 0.55], angles: [20, -20, 40, 0, 60] },
      { to: [a.x - gap, a.y + a.height * 0.55], angles: [160, 200, 140, 180, 120] },
      { to: [a.x + a.width * 0.5, a.y - gap], angles: [-70, -110, -45, -135] },
    ];
    for (const { to, angles } of approaches) {
      for (const deg of angles) {
        for (const length of [190 * s, 140 * s]) {
          const rad = (deg * Math.PI) / 180;
          const from: Pt = [to[0] + Math.cos(rad) * length, to[1] + Math.sin(rad) * length];
          const bend = (deg > 90 || deg < -90 ? -1 : 1) * (0.22 + random() * 0.08);
          const shapes = handArrow(from, to, bend, width, random);
          if (isClear(shapes, ctx)) return { shapes, anchorIndex: index };
        }
      }
    }
  }
  return null;
}

/** Flèche vers le bord droit : invitation à passer à la story suivante. */
function arrowToNext(ctx: DecorationContext, random: () => number): DecorationPlan | null {
  const width = 7;
  const textBottom = Math.max(ctx.safe.top, ...ctx.obstacles.map((o) => o.y + o.height));
  const textTop = Math.min(ctx.safe.bottom, ...ctx.obstacles.map((o) => o.y));
  const rows = [textBottom + 120, textBottom + 200, 1500, 1420, 1340, 1260, textTop - 90];
  for (const y of rows) {
    for (const span of [300, 240]) {
      const to: Pt = [1012, y - 26];
      const from: Pt = [to[0] - span, y + 22];
      const shapes = handArrow(from, to, -0.18 - random() * 0.06, width, random);
      if (isClear(shapes, ctx)) return { shapes, anchorIndex: null };
    }
  }
  return null;
}

/** Géométrie d’une décoration, ou null si aucun placement ne laisse le texte libre. */
export function planDecoration(kind: DecorationId, ctx: DecorationContext): DecorationPlan | null {
  const random = seededRandom(`${kind}-${ctx.seed}`);
  switch (kind) {
    case "etoiles":
      return trail(ctx, random);
    case "eclair":
      return lightning(ctx, random);
    case "etincelles":
      return sparkles(ctx, random);
    case "fleche-mot":
      return arrowToWord(ctx, random);
    case "fleche-suite":
      return arrowToNext(ctx, random);
  }
}

/** Tourne les points d’un tracé autour d’un point (degrés), pour suivre un texte incliné. */
export function rotateShapes(shapes: DecorationShape[], angleDeg: number, originX: number, originY: number): DecorationShape[] {
  if (!angleDeg) return shapes;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return shapes.map((shape) => {
    const points: number[] = [];
    for (let i = 0; i < shape.points.length; i += 2) {
      const x = shape.points[i] - originX;
      const y = shape.points[i + 1] - originY;
      points.push(Math.round((originX + x * cos - y * sin) * 10) / 10, Math.round((originY + x * sin + y * cos) * 10) / 10);
    }
    return { ...shape, points };
  });
}

/** Rectangle englobant des tracés (bloc du document). */
export function shapesBounds(shapes: DecorationShape[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const shape of shapes) {
    const pad = shape.strokeWidth / 2;
    for (let i = 0; i < shape.points.length; i += 2) {
      x0 = Math.min(x0, shape.points[i] - pad);
      y0 = Math.min(y0, shape.points[i + 1] - pad);
      x1 = Math.max(x1, shape.points[i] + pad);
      y1 = Math.max(y1, shape.points[i + 1] + pad);
    }
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

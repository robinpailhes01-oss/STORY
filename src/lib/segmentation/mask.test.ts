import { describe, expect, it } from "vitest";
import {
  applyGuidedCoefficients,
  blurMask,
  boxMean,
  composeMasks,
  coverage,
  guidedCoefficients,
  luminance,
  personConfidence,
  removeSmallIslands,
  sampleBilinear,
  smoothstep,
  subjectRegion,
} from "./mask";

/** Masque w × h avec des rectangles à 1 (x, y, largeur, hauteur). */
function rects(w: number, h: number, boxes: [number, number, number, number][]): Float32Array {
  const m = new Float32Array(w * h);
  for (const [x0, y0, bw, bh] of boxes) {
    for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) m[y * w + x] = 1;
  }
  return m;
}

describe("smoothstep", () => {
  it("vaut 0 sous le seuil bas, 1 au-dessus du seuil haut, 0,5 au milieu", () => {
    expect(smoothstep(0.2, 0.8, 0.1)).toBe(0);
    expect(smoothstep(0.2, 0.8, 0.9)).toBe(1);
    expect(smoothstep(0.2, 0.8, 0.5)).toBeCloseTo(0.5);
  });
});

describe("personConfidence", () => {
  it("un seul masque : la personne, bornée à 0..1", () => {
    expect([...personConfidence([Float32Array.from([-0.2, 0.4, 1.3])])]).toEqual([0, expect.closeTo(0.4), 1]);
  });
  it("modèle multiclasse : 1 − fond, fond trouvé par son nom", () => {
    const hair = Float32Array.from([0, 0.9]);
    const background = Float32Array.from([0.8, 0.1]);
    const out = personConfidence([hair, background], ["hair", "background"]);
    expect(out[0]).toBeCloseTo(0.2);
    expect(out[1]).toBeCloseTo(0.9);
  });
  it("sans nom de classe : la première est le fond", () => {
    const out = personConfidence([Float32Array.from([1, 0]), Float32Array.from([0, 1])]);
    expect([...out]).toEqual([0, 1]);
  });
  it("refuse une liste vide ou des tailles différentes", () => {
    expect(() => personConfidence([])).toThrow();
    expect(() => personConfidence([new Float32Array(2), new Float32Array(3)])).toThrow();
  });
});

describe("boxMean / blurMask", () => {
  const size = { width: 5, height: 4 };
  it("une image constante reste constante, bords compris", () => {
    const out = boxMean(new Float32Array(20).fill(0.7), size, 2);
    for (const v of out) expect(v).toBeCloseTo(0.7);
  });
  it("rayon 0 : copie identique", () => {
    const src = Float32Array.from({ length: 20 }, (_, i) => i / 20);
    expect([...boxMean(src, size, 0)]).toEqual([...src]);
  });
  it("moyenne sur la fenêtre coupée aux bords", () => {
    const src = new Float32Array(20);
    src[0] = 1; // coin haut gauche
    const out = boxMean(src, size, 1);
    // Fenêtre du coin : 2 × 2 pixels présents.
    expect(out[0]).toBeCloseTo(1 / 4);
    // Pixel (1, 1) : fenêtre complète 3 × 3.
    expect(out[size.width + 1]).toBeCloseTo(1 / 9);
    expect(out[3]).toBe(0);
  });
  it("le flou conserve la masse loin des bords", () => {
    const big = { width: 30, height: 30 };
    const src = rects(30, 30, [[12, 12, 6, 6]]);
    const out = blurMask(src, big, 2);
    const sum = (a: Float32Array) => a.reduce((s, v) => s + v, 0);
    expect(sum(out)).toBeCloseTo(sum(src), 3);
  });
  it("refuse une taille incohérente", () => {
    expect(() => boxMean(new Float32Array(3), size, 1)).toThrow();
  });
});

describe("filtre guidé", () => {
  it("guide uniforme : a = 0 et b = moyenne locale du masque", () => {
    const size = { width: 8, height: 8 };
    const mask = rects(8, 8, [[0, 0, 4, 8]]);
    const { a, b } = guidedCoefficients(new Float32Array(64).fill(0.5), mask, size, 1, 1e-3);
    for (const v of a) expect(Math.abs(v)).toBeLessThan(1e-6);
    expect(b[0]).toBeCloseTo(1);
    expect(b[7]).toBeCloseTo(0);
  });
  it("le masque suit un contour net de la photo plutôt qu’un bord flou", () => {
    const size = { width: 16, height: 1 };
    // Photo : sombre à gauche (personne), claire à droite, contour entre x = 7 et x = 8.
    const guide = Float32Array.from({ length: 16 }, (_, x) => (x < 8 ? 0.1 : 0.9));
    // Masque du modèle : rampe floue autour du contour.
    const mask = Float32Array.from({ length: 16 }, (_, x) => smoothstep(4, 11, x));
    const inverted = Float32Array.from(mask, (v) => 1 - v);
    const coef = guidedCoefficients(guide, inverted, size, 3, 1e-4);
    const q = (x: number) => coef.a[x] * guide[x] + coef.b[x];
    expect(q(6)).toBeGreaterThan(inverted[6]);
    expect(q(9)).toBeLessThan(inverted[9]);
  });
  it("applique l’alpha à pleine définition (a = 0, b = masque)", () => {
    const low = { width: 2, height: 1 };
    const full = { width: 4, height: 2 };
    const rgba = new Uint8ClampedArray(4 * 2 * 4).fill(200);
    applyGuidedCoefficients(rgba, full, { a: new Float32Array(2), b: Float32Array.from([0, 1]) }, low, { low: 0.3, high: 0.85 });
    const alpha = [...rgba].filter((_, i) => i % 4 === 3);
    expect(alpha.slice(0, 4)).toEqual([0, expect.any(Number), expect.any(Number), 255]);
    expect(alpha[1]).toBeLessThan(alpha[2]);
    expect(rgba[0]).toBe(200); // couleurs intactes
  });
  it("là où le modèle est sûr, la décision du modèle l’emporte sur le filtre", () => {
    const low = { width: 1, height: 1 };
    const full = { width: 1, height: 1 };
    const rgba = new Uint8ClampedArray([255, 255, 255, 0]);
    // Le filtre dirait « fond » (q = 0) mais le modèle est sûr (P = 1).
    applyGuidedCoefficients(rgba, full, { a: new Float32Array(1), b: new Float32Array(1), mask: Float32Array.from([1]) }, low, {
      low: 0.3,
      high: 0.85,
    });
    expect(rgba[3]).toBe(255);
  });
  it("luminance d’un pixel blanc et d’un pixel noir", () => {
    expect([...luminance(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]))]).toEqual([expect.closeTo(1), 0]);
  });
});

describe("couverture et îlots", () => {
  it("couverture : part des pixels au-dessus du seuil", () => {
    expect(coverage(Float32Array.from([0, 0.49, 0.5, 1]))).toBe(0.5);
    expect(coverage(new Float32Array(0))).toBe(0);
  });
  it("retire un petit îlot isolé, garde la silhouette", () => {
    const size = { width: 40, height: 40 };
    const mask = rects(40, 40, [
      [5, 5, 15, 30],
      [32, 2, 2, 2],
    ]);
    expect(removeSmallIslands(mask, size, 0.12)).toBe(1);
    expect(mask[3 * 40 + 32]).toBe(0);
    expect(mask[10 * 40 + 10]).toBe(1);
  });
  it("garde deux personnes de taille comparable", () => {
    const size = { width: 40, height: 40 };
    const mask = rects(40, 40, [
      [2, 5, 10, 30],
      [25, 8, 9, 28],
    ]);
    expect(removeSmallIslands(mask, size, 0.12)).toBe(0);
    expect(coverage(mask)).toBeCloseTo((300 + 252) / 1600);
  });
});

describe("zone du second passage", () => {
  it("carré agrandi autour d’une petite silhouette", () => {
    const size = { width: 90, height: 160 };
    const region = subjectRegion(rects(90, 160, [[40, 100, 20, 20]]), size, 0.25)!;
    expect(region).not.toBeNull();
    // Côté 20 × 1,5 = 30 px, centré sur (50, 110).
    expect(region.width * size.width).toBeCloseTo(30);
    expect(region.height * size.height).toBeCloseTo(30);
    expect(region.x * size.width).toBeCloseTo(35);
    expect(region.y * size.height).toBeCloseTo(95);
  });
  it("recalée dans l’image", () => {
    const size = { width: 90, height: 160 };
    const region = subjectRegion(rects(90, 160, [[0, 0, 20, 20]]), size, 0.25)!;
    expect(region.x).toBe(0);
    expect(region.y).toBe(0);
  });
  it("aucune zone sans personne ou quand elle remplit déjà l’image", () => {
    const size = { width: 90, height: 160 };
    expect(subjectRegion(new Float32Array(90 * 160), size)).toBeNull();
    expect(subjectRegion(rects(90, 160, [[5, 10, 80, 140]]), size)).toBeNull();
  });
  it("assemble le masque global et le détail, avec un fondu aux bords de la zone", () => {
    const base = new Float32Array(10 * 10); // le premier passage n’a rien vu
    const detail = { mask: new Float32Array(4 * 4).fill(1), size: { width: 4, height: 4 }, region: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 } };
    const out = composeMasks(base, { width: 10, height: 10 }, detail, { width: 20, height: 20 }, 2);
    expect(out[10 * 20 + 10]).toBeCloseTo(1); // centre de la zone
    expect(out[1 * 20 + 1]).toBe(0); // hors zone
    const edge = out[10 * 20 + 4]; // à 0,5 px du bord gauche de la zone (x = 4)
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
  });
  it("sans détail : simple rééchantillonnage", () => {
    const base = Float32Array.from([0, 1]);
    const out = composeMasks(base, { width: 2, height: 1 }, null, { width: 4, height: 1 }, 0);
    expect([...out]).toEqual([0, 0.25, 0.75, 1]);
    expect(sampleBilinear(base, { width: 2, height: 1 }, 1, 0.5)).toBeCloseTo(0.5);
  });
});

import { describe, expect, it } from "vitest";
import { DECORATIONS } from "@/domain/render-options";
import { EXAMPLE_PLAN } from "@/domain/example-plan";
import { photoIndexFor } from "@/domain/story-plan";
import { transformText } from "@/lib/layout/french";
import { giantWordFor, photoCountOf } from "./compose-sequence";
import { DECORATION_SAFE, isClear, planDecoration, rotateShapes, shapesBounds, type DecorationContext } from "./decorations";

/** Une story type : deux lignes de texte en haut, l’accent au bout de la seconde, le bas libre. */
const context = (seed = "s1"): DecorationContext => ({
  anchors: [{ x: 700, y: 500, width: 200, height: 55 }],
  obstacles: [
    { x: 85, y: 445, width: 900, height: 55 },
    { x: 85, y: 500, width: 815, height: 55 },
  ],
  safe: DECORATION_SAFE,
  fontSize: 41,
  seed,
});

describe("décorations", () => {
  it.each(DECORATIONS.map((d) => d.id))("%s : placée dans la zone sûre, sans toucher le texte, déterministe", (kind) => {
    const plan = planDecoration(kind, context());
    expect(plan).not.toBeNull();
    expect(isClear(plan!.shapes, context())).toBe(true);
    expect(planDecoration(kind, context())).toEqual(plan);
    for (const shape of plan!.shapes) {
      expect(shape.points.length % 2).toBe(0);
      for (let i = 0; i < shape.points.length; i += 2) {
        expect(shape.points[i]).toBeGreaterThanOrEqual(DECORATION_SAFE.left);
        expect(shape.points[i]).toBeLessThanOrEqual(DECORATION_SAFE.right);
        expect(shape.points[i + 1]).toBeGreaterThanOrEqual(DECORATION_SAFE.top);
        expect(shape.points[i + 1]).toBeLessThanOrEqual(DECORATION_SAFE.bottom);
      }
    }
  });

  it("une autre graine donne un autre tracé", () => {
    expect(planDecoration("etoiles", context("a"))).not.toEqual(planDecoration("etoiles", context("b")));
  });

  it("aucune place libre : null (avertissement côté composition), jamais un tracé sur le texte", () => {
    const full: DecorationContext = { ...context(), obstacles: [{ x: 0, y: 0, width: 1080, height: 1920 }] };
    for (const d of DECORATIONS) expect(planDecoration(d.id, full)).toBeNull();
  });

  it("la flèche vers la suite pointe vers le bord droit", () => {
    const plan = planDecoration("fleche-suite", context())!;
    const xs = plan.shapes.flatMap((s) => s.points.filter((_, i) => i % 2 === 0));
    expect(Math.max(...xs)).toBeGreaterThan(980);
  });

  it("rotation et rectangle englobant", () => {
    const shapes = [{ points: [540, 800, 640, 800], closed: false, filled: false, strokeWidth: 4, tension: 0 }];
    const rotated = rotateShapes(shapes, 90, 540, 800);
    expect(rotated[0].points[2]).toBeCloseTo(540);
    expect(rotated[0].points[3]).toBeCloseTo(900);
    expect(shapesBounds(shapes)).toEqual({ x: 538, y: 798, width: 104, height: 4 });
  });
});

describe("composition : photos et mot géant", () => {
  it("nombre de photos = position de la dernière photo fournie, répartition par photoIndexFor", () => {
    const p = { assetId: "a" };
    expect(photoCountOf([p, p, p])).toBe(3);
    expect(photoCountOf([p, p, null])).toBe(2);
    expect(photoCountOf([p, null, p])).toBe(3);
    expect(photoCountOf([null, null])).toBe(0);
    expect([0, 1, 2, 3, 4].map((i) => photoIndexFor(i, 2))).toEqual([0, 1, 1, 0, 0]);
  });

  it("mot géant : le mot le plus long du premier accent, sans ponctuation ; aucun sur une story suite", () => {
    expect(giantWordFor(EXAMPLE_PLAN, 0)).toEqual({ word: "l'IA", paragraph: 0 });
    expect(giantWordFor(EXAMPLE_PLAN, 1)).toEqual({ word: "quelques", paragraph: 1 });
    expect(giantWordFor(EXAMPLE_PLAN, 2)).toBeNull();
    expect(giantWordFor(EXAMPLE_PLAN, 3)).toEqual({ word: "automatisme", paragraph: 0 });
  });

  it("capitales sans changer la longueur (positions des accents)", () => {
    expect(transformText("l’été déborde", "uppercase")).toBe("L’ÉTÉ DÉBORDE");
    expect(transformText("straße", "uppercase")).toHaveLength(6);
    expect(transformText("abc", undefined)).toBe("abc");
  });
});

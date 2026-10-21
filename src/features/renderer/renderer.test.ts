import { describe, expect, it } from "vitest";
import type { AccentBox } from "@/lib/layout/text-layout";
import { markerKindFor } from "@/lib/layout/text-layout";
import { coverCrop } from "./images";
import { handDrawnOval, ovalInBox, skewedPastillePoints, underlineRect } from "./markers";
import { seededRandom } from "./random";

const box: AccentBox = { accentIndex: 0, piece: 0, kind: "cercle", text: "l’argent.", x: 100, y: 0, width: 200, height: 55, baseline: 42 };

describe("aléatoire déterministe", () => {
  it("même graine, même suite ; graines différentes, suites différentes", () => {
    const a = seededRandom("dore-1-l’argent");
    const b = seededRandom("dore-1-l’argent");
    const c = seededRandom("dore-2-l’argent");
    const sa = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(sa);
    expect([c(), c(), c()]).not.toEqual(sa);
    sa.forEach((v) => expect(v >= 0 && v < 1).toBe(true));
  });

  it("l’ovale tracé à la main est identique pour une même graine (aperçu = export)", () => {
    expect(handDrawnOval(box, 41, "seed")).toEqual(handDrawnOval(box, 41, "seed"));
    expect(handDrawnOval(box, 41, "seed")).not.toEqual(handDrawnOval(box, 41, "autre"));
  });

  it("l’ovale fait un peu plus d’un tour et entoure l’accent", () => {
    const points = handDrawnOval(box, 41, "seed");
    const xs = points.filter((_, i) => i % 2 === 0);
    expect(Math.min(...xs)).toBeLessThan(box.x);
    expect(Math.max(...xs)).toBeGreaterThan(box.x + box.width);
    // début et fin ne coïncident pas : le tracé ne se referme pas parfaitement
    const [x0, y0] = points;
    const [x1, y1] = points.slice(-2);
    expect(Math.hypot(x1 - x0, y1 - y0)).toBeGreaterThan(1);
  });
});

describe("pastille inclinée", () => {
  it("le haut est décalé vers la droite, le bas vers la gauche", () => {
    const [tlx, , , , , , blx] = skewedPastillePoints(box, 41, 10);
    expect(tlx).toBeGreaterThan(blx);
  });
});

describe("recadrage cover", () => {
  it("couvre le cadre sans déformer et respecte le point focal dans les bords", () => {
    const crop = coverCrop({ width: 1200, height: 1600 }, { focalX: 0.5, focalY: 0.5, zoom: 1 }, 1080, 1920);
    expect(crop.height).toBeCloseTo(1600);
    expect(crop.width / crop.height).toBeCloseTo(1080 / 1920);
    expect(crop.x).toBeCloseTo((1200 - crop.width) / 2);
    const left = coverCrop({ width: 1200, height: 1600 }, { focalX: 0, focalY: 0.5, zoom: 1 }, 1080, 1920);
    expect(left.x).toBe(0);
    const zoomed = coverCrop({ width: 1200, height: 1600 }, { focalX: 0.5, focalY: 0.5, zoom: 2 }, 1080, 1920);
    expect(zoomed.height).toBeCloseTo(800);
  });
});

describe("rotation des marquages", () => {
  it("continue d’un bloc à l’autre grâce à rotationOffset", () => {
    const marker = { kind: "pastille" as const, color: "#FF3D7F" as const, rotation: ["pastille", "cercle", "souligne"] as Array<"pastille" | "cercle" | "souligne"> };
    expect([0, 1, 2, 3].map((i) => markerKindFor(marker, i))).toEqual(["pastille", "cercle", "souligne", "pastille"]);
    expect(markerKindFor({ ...marker, rotationOffset: 2 }, 0)).toBe("souligne");
    expect(markerKindFor({ kind: "couleur", color: "#E8B84B" }, 5)).toBe("couleur");
    expect(markerKindFor(undefined, 0)).toBeNull();
  });
});

describe("souligné réglable et ovale du Crayon", () => {
  it("décalage et épaisseur du souligné en tailles de police", () => {
    const standard = underlineRect(box, 40);
    expect(standard.y).toBeCloseTo(42 - 2.8);
    expect(standard.height).toBeCloseTo(10);
    const fin = underlineRect(box, 40, { underlineOffset: 0.1, underlineThickness: 0.05 });
    expect(fin.y).toBeCloseTo(46);
    expect(fin.height).toBeCloseTo(2);
  });

  it("ovale en deux points : dans le rectangle tracé, déterministe", () => {
    const points = ovalInBox(100, 200, 500, 400, "crayon-a");
    expect(points).toEqual(ovalInBox(100, 200, 500, 400, "crayon-a"));
    const xs = points.filter((_, i) => i % 2 === 0);
    expect(Math.min(...xs)).toBeLessThan(110);
    expect(Math.max(...xs)).toBeGreaterThan(490);
  });
});

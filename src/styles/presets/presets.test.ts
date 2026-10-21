import { describe, expect, it } from "vitest";
import { DocumentError, parseStoryDocument, type StoryDocument } from "@/domain/story-document";
import { resolveFont } from "@/lib/fonts/registry";
import { DEFAULT_STYLE_ID, STYLE_PRESETS, getStyle } from ".";

const HEX = /^#[0-9A-F]{6}$/i;

describe("styles", () => {
  it("10 styles, ids uniques, « dore » par défaut", () => {
    expect(STYLE_PRESETS).toHaveLength(10);
    expect(new Set(STYLE_PRESETS.map((s) => s.id)).size).toBe(10);
    expect(DEFAULT_STYLE_ID).toBe("dore");
    expect(() => getStyle("inconnu")).toThrow();
  });

  it.each(STYLE_PRESETS.map((s) => [s.id, s] as const))("%s : polices fournies, couleurs et réglages valides", (_, style) => {
    for (const settings of [style.hook, style.body]) {
      expect(() => resolveFont(settings.font.fontId, settings.font.weight, settings.font.style)).not.toThrow();
      expect(settings.minSize).toBeLessThanOrEqual(settings.size);
      expect(settings.lineHeight).toBeGreaterThan(1);
    }
    expect(style.colors.text).toMatch(HEX);
    expect(style.colors.accent).toMatch(HEX);
    expect(style.marker.color).toMatch(HEX);
    expect(style.veil.stops.every((s) => s >= 0 && s <= 1)).toBe(true);
    expect(style.grain).toBeGreaterThanOrEqual(0);
    expect(style.grain).toBeLessThanOrEqual(1);
  });
});

describe("document étendu", () => {
  const base = (): StoryDocument => ({
    schemaVersion: 1,
    documentId: "sequence-test",
    title: "Test",
    revision: 1,
    width: 1080,
    height: 1920,
    stylePackId: "dore",
    stylePackVersion: "1",
    slides: [
      {
        id: "story_01",
        templateId: "sequence-3-photos",
        templateVersion: 1,
        background: {
          kind: "image",
          assetId: "photo-1",
          crop: { focalX: 0.5, focalY: 0.5, zoom: 1 },
          veil: { stops: [0.4, 0.3, 0.6] },
          dim: 0.2,
          grain: 0.1,
        },
        blocks: [
          {
            id: "s1_p1",
            kind: "text",
            x: 85,
            y: 400,
            width: 915,
            height: 110,
            zIndex: 0,
            content: "Ça te fait gagner quelques minutes.",
            style: { fontId: "poppins", fontSize: 41, fontWeight: 700, color: "#FFFFFF", align: "left", lineHeight: 1.34, letterSpacing: 0 },
            accents: ["gagner quelques minutes."],
            marker: { kind: "pastille", color: "#FF3D7F", textColor: "#000000", rotation: ["pastille", "cercle"], rotationOffset: 3 },
            opacity: 0.4,
          },
        ],
      },
    ],
  });

  it("accepte photo, voile, grain, accents, marquage et opacité", () => {
    expect(() => parseStoryDocument(base())).not.toThrow();
  });

  it("refuse les valeurs hors bornes", () => {
    const doc = base();
    const bg = doc.slides[0].background;
    if (bg.kind !== "image") throw new Error("fond photo attendu");
    bg.crop.zoom = 0.5;
    bg.veil = { stops: [1.4] };
    const block = doc.slides[0].blocks[0];
    if (block.kind !== "text") throw new Error("bloc texte attendu");
    block.opacity = 2;
    block.marker = { kind: "feutre" as never, color: "#FFF" as never };
    try {
      parseStoryDocument(doc);
      throw new Error("aurait dû échouer");
    } catch (error) {
      expect(error).toBeInstanceOf(DocumentError);
      expect((error as DocumentError).problems.length).toBeGreaterThanOrEqual(5);
    }
  });
});

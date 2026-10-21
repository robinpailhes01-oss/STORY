import { describe, expect, it } from "vitest";
import { DocumentError, parseStoryDocument, type StoryDocument } from "@/domain/story-document";
import { resolveFont } from "@/lib/fonts/registry";
import { DEFAULT_STYLE_ID, STYLE_PRESETS, applyRenderOptions, getStyle, readableTextOn, resolveRoleColor } from ".";

const HEX = /^#[0-9A-F]{6}$/i;

describe("styles", () => {
  it("17 styles dans l’ordre de la grille de la référence, ids uniques, « dore » par défaut", () => {
    expect(STYLE_PRESETS.map((s) => s.id)).toEqual([
      "trait",
      "dore",
      "orange",
      "rose",
      "serif",
      "entoure",
      "fluo",
      "turquoise",
      "roman",
      "bandeau",
      "massif",
      "discret",
      "lueur",
      "geant",
      "liseret",
      "feutre",
      "theatre",
    ]);
    expect(new Set(STYLE_PRESETS.map((s) => s.id)).size).toBe(17);
    expect(DEFAULT_STYLE_ID).toBe("dore");
    expect(() => getStyle("inconnu")).toThrow();
  });

  it("effets propres aux nouveaux styles", () => {
    expect(getStyle("massif").hook.transform).toBe("uppercase");
    expect(getStyle("lueur").marker.glow).toBeGreaterThan(0);
    expect(getStyle("geant").giant?.color).toBe("accent");
    expect(getStyle("theatre").giant?.color).toBe("#E0141B");
    expect(getStyle("liseret").lead?.outline).toBeGreaterThan(0);
    expect(getStyle("feutre").marker.kind).toBe("souligne");
    expect(getStyle("serif").tilt).toBe(-3);
  });

  it.each(STYLE_PRESETS.map((s) => [s.id, s] as const))("%s : polices fournies, couleurs et réglages valides", (_, style) => {
    if (style.giant) {
      const g = style.giant;
      expect(() => resolveFont(g.font.fontId, g.font.weight, g.font.style)).not.toThrow();
      expect(g.width).toBeLessThanOrEqual(1080);
    }
    for (const settings of [style.hook, style.body, ...(style.lead ? [style.lead] : [])]) {
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

describe("couleur d’accent choisie", () => {
  it("remplace marquage, couleur d’accent et rôles « accent », sans toucher au style d’origine", () => {
    const theatre = applyRenderOptions(getStyle("theatre"), { accentColor: "#3B6FE0" });
    expect(theatre.colors.accent).toBe("#3B6FE0");
    expect(theatre.marker.color).toBe("#3B6FE0");
    expect(resolveRoleColor(theatre, theatre.hook.color)).toBe("#3B6FE0");
    expect(resolveRoleColor(theatre, theatre.giant?.color)).toBe("#E0141B");
    expect(getStyle("theatre").colors.accent).toBe("#D4AF37");
    expect(applyRenderOptions(getStyle("dore"), { accentColor: null })).toBe(getStyle("dore"));
  });

  it("texte de pastille noir ou blanc selon la luminance ; bandeau : la bande reste noire", () => {
    expect(readableTextOn("#F3EDE2")).toBe("#000000");
    expect(readableTextOn("#22346B")).toBe("#FFFFFF");
    expect(applyRenderOptions(getStyle("rose"), { accentColor: "#22346B" }).marker.textColor).toBe("#FFFFFF");
    expect(applyRenderOptions(getStyle("orange"), { accentColor: "#F3EDE2" }).marker.textColor).toBe("#000000");
    const bandeau = applyRenderOptions(getStyle("bandeau"), { accentColor: "#C8A25C" });
    expect(bandeau.marker.color).toBe("#000000");
    expect(bandeau.marker.textColor).toBe("#C8A25C");
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

  it("accepte décoration, dessins, mot géant, capitales, contour, halo et inclinaison", () => {
    const doc = base();
    const text = doc.slides[0].blocks[0];
    if (text.kind !== "text") throw new Error("bloc texte attendu");
    text.style = { ...text.style, transform: "uppercase", outline: { width: 2.5 } };
    text.marker = { kind: "couleur", color: "#FF2BD6", glow: 0.3 };
    text.rotation = { angle: -3, originX: 540, originY: 800 };
    doc.slides[0].blocks.push(
      { ...text, id: "s1_g1", behindSubject: true, accents: [] },
      {
        id: "s1_deco",
        kind: "decoration",
        x: 100,
        y: 600,
        width: 200,
        height: 100,
        zIndex: 900,
        decoration: "etoiles",
        color: "#C8A25C",
        shapes: [{ points: [100, 600, 120, 620, 140, 600], closed: true, filled: true, strokeWidth: 2, tension: 0 }],
      },
      {
        id: "s1_dessin",
        kind: "drawing",
        x: 0,
        y: 0,
        width: 1080,
        height: 1920,
        zIndex: 1000,
        strokes: [
          { id: "a", tool: "stylo", color: "#FFFFFF", width: 8, points: [10, 10, 200, 300] },
          { id: "b", tool: "surligneur", color: "#FFE45C", width: 50, points: [10, 900, 1000, 900] },
          { id: "c", tool: "ovale", color: "#FF5A5A", width: 8, points: [300, 300, 600, 500] },
        ],
      },
    );
    expect(() => parseStoryDocument(doc)).not.toThrow();
  });

  it("refuse décoration et dessins hors cadre ou invalides", () => {
    const doc = base();
    doc.slides[0].blocks.push(
      {
        id: "s1_deco",
        kind: "decoration",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        zIndex: 900,
        decoration: "feu" as never,
        color: "#C8A25C",
        shapes: [{ points: [100, 600, 120], closed: false, filled: false, strokeWidth: 2, tension: 0 }],
      },
      {
        id: "s1_dessin",
        kind: "drawing",
        x: 0,
        y: 0,
        width: 1080,
        height: 1920,
        zIndex: 1000,
        strokes: [
          { id: "a", tool: "pinceau" as never, color: "#FFFFFF", width: 8, points: [10, 10, 2000, 300] },
          { id: "a", tool: "stylo", color: "blanc" as never, width: 0, points: [10, 10] },
        ],
      },
    );
    try {
      parseStoryDocument(doc);
      throw new Error("aurait dû échouer");
    } catch (error) {
      expect(error).toBeInstanceOf(DocumentError);
      const problems = (error as DocumentError).problems.join("\n");
      expect(problems).toMatch(/décoration « feu » inconnue/);
      expect(problems).toMatch(/points en nombre impair/);
      expect(problems).toMatch(/outil « pinceau » inconnu/);
      expect(problems).toMatch(/hors du cadre/);
      expect(problems).toMatch(/identifiant en double/);
      expect(problems).toMatch(/épaisseur hors/);
    }
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

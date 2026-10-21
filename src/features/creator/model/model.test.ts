import { afterEach, describe, expect, it, vi } from "vitest";
import { EXAMPLE_PLAN } from "@/domain/example-plan";
import { parseMarkup, storyFromMarkup, toMarkup } from "./accent-markup";
import {
  DRAFT_KEY,
  EMPTY_SNAPSHOT,
  VOICE_MAX_CHARS,
  clearDraft,
  compactPhotos,
  loadDraft,
  photoCount,
  pushRecent,
  pushVoice,
  saveDraft,
  sequenceText,
  type Draft,
} from "./draft";
import { HISTORY_LIMIT, allStates, canRedo, canUndo, commit, createHistory, redo, undo } from "./history";

describe("astérisques ↔ accents", () => {
  it("écrit les accents entre astérisques", () => {
    expect(toMarkup({ text: "Ça te fait gagner quelques minutes. Pas plus.", accents: ["gagner quelques minutes."] })).toBe(
      "Ça te fait *gagner quelques minutes.* Pas plus.",
    );
    expect(toMarkup({ text: "Répondre aux clients. Relancer un devis.", accents: ["Répondre", "Relancer"] })).toBe(
      "*Répondre* aux clients. *Relancer* un devis.",
    );
  });

  it("relit le texte et les accents", () => {
    expect(parseMarkup("Ça te fait *gagner quelques minutes.* Pas plus.")).toEqual({
      text: "Ça te fait gagner quelques minutes. Pas plus.",
      accents: ["gagner quelques minutes."],
      unbalanced: false,
    });
  });

  it("aller-retour sur toute la séquence d’exemple", () => {
    for (const story of EXAMPLE_PLAN.stories) {
      for (const p of story.paragraphs) {
        const parsed = parseMarkup(toMarkup(p));
        expect(parsed.text).toBe(p.text);
        expect(parsed.accents).toEqual(p.accents);
      }
    }
  });

  it("ignore un astérisque isolé et le signale", () => {
    const parsed = parseMarkup("Un *mot isolé");
    expect(parsed).toEqual({ text: "Un mot isolé", accents: [], unbalanced: true });
  });

  it("limite à 3 accents par story et signale le reste ; écarte les champs vides", () => {
    const result = storyFromMarkup(["*a* et *b*", "  ", "*c* puis *d*"]);
    expect(result.paragraphs).toEqual([
      { text: "a et b", accents: ["a", "b"] },
      { text: "c puis d", accents: ["c"] },
    ]);
    expect(result.dropped).toEqual(["d"]);
    expect(result.empty).toEqual([1]);
  });

  it("garde les preuves citées de chaque champ", () => {
    const result = storyFromMarkup(["Résultat : *3 h gagnées* par jour.", "", "Sans chiffre."], [["p1"], undefined, []]);
    expect(result.paragraphs).toEqual([
      { text: "Résultat : 3 h gagnées par jour.", accents: ["3 h gagnées"], proofIds: ["p1"] },
      { text: "Sans chiffre.", accents: [] },
    ]);
  });
});

describe("photos, voix", () => {
  it("tasse les photos au début", () => {
    expect(compactPhotos(["a", null, "c"])).toEqual(["a", "c", null]);
    expect(compactPhotos([null, null, null])).toEqual([null, null, null]);
    expect(photoCount(["a", "b", null])).toBe(2);
  });

  it("garde les 3 dernières séquences exportées, la plus récente d’abord, sans doublon", () => {
    let voice: string[] = [];
    voice = pushVoice(voice, "un");
    voice = pushVoice(voice, "deux");
    voice = pushVoice(voice, "un");
    expect(voice).toEqual(["un", "deux"]);
    voice = pushVoice(pushVoice(voice, "trois"), "quatre");
    expect(voice).toEqual(["quatre", "trois", "un"]);
    expect(pushVoice(voice, "   ")).toEqual(voice);
  });

  it("texte brut d’une séquence : stories séparées par une ligne vide", () => {
    const text = sequenceText(EXAMPLE_PLAN);
    expect(text.split("\n\n")).toHaveLength(5);
    expect(text.startsWith("La plupart des PME")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(VOICE_MAX_CHARS);
  });
});

describe("historique", () => {
  it("annule et rétablit", () => {
    let h = createHistory(1);
    h = commit(h, 2);
    h = commit(h, 3);
    expect(canUndo(h)).toBe(true);
    h = undo(h);
    expect(h.present).toBe(2);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present).toBe(3);
    h = undo(undo(h));
    h = commit(h, 9);
    expect(h.future).toEqual([]);
    expect(allStates(h)).toEqual([1, 9]);
  });

  it("regroupe la saisie dans une même étape", () => {
    let h = createHistory("");
    h = commit(h, "a", { group: "t", now: 0 });
    h = commit(h, "ab", { group: "t", now: 300 });
    h = commit(h, "abc", { group: "t", now: 600 });
    expect(h.past).toEqual([""]);
    h = commit(h, "abcd", { group: "t", now: 5000 });
    expect(h.past).toEqual(["", "abc"]);
    h = commit(h, "x", { group: "autre", now: 5100 });
    expect(h.past).toEqual(["", "abc", "abcd"]);
  });

  it(`garde ${HISTORY_LIMIT} étapes au plus`, () => {
    let h = createHistory(0);
    for (let i = 1; i <= 80; i++) h = commit(h, i);
    expect(h.past.length).toBe(HISTORY_LIMIT);
    expect(h.past[0]).toBe(80 - HISTORY_LIMIT);
  });
});

describe("brouillon local", () => {
  afterEach(() => vi.unstubAllGlobals());

  function fakeStorage() {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      data,
    };
  }

  const draft: Draft = {
    idea: "Une idée",
    mode: "idee",
    structure: "auto",
    snapshot: {
      ...EMPTY_SNAPSHOT,
      plan: EXAMPLE_PLAN,
      styleId: "geant",
      photos: ["a", "c", null],
      crops: { a: { focalX: 0.2, focalY: 0.8, zoom: 1.5 } },
      options: { accentColor: "#C8A25C", showAccents: false, decoration: "etoiles" },
      drawings: { 1: [{ id: "t1", tool: "ovale", color: "#FFFFFF", width: 12, points: [100, 200, 500, 400] }] },
    },
    recent: pushRecent([], EXAMPLE_PLAN),
  };

  it("enregistre et relit", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    expect(loadDraft()).toEqual({ status: "absent" });
    expect(saveDraft(draft)).toBe(true);
    expect(loadDraft()).toEqual({ status: "ok", draft });
    clearDraft();
    expect(loadDraft()).toEqual({ status: "absent" });
  });

  it("refuse un brouillon abîmé sans lever", () => {
    const store = fakeStorage();
    vi.stubGlobal("localStorage", store);
    store.setItem(DRAFT_KEY, "{pas du json");
    expect(loadDraft()).toEqual({ status: "invalid" });
    store.setItem(DRAFT_KEY, JSON.stringify({ version: 1, idea: 3 }));
    expect(loadDraft()).toEqual({ status: "invalid" });
  });

  it("relit un brouillon d’avant la phase 3 (sans options ni dessins)", () => {
    const store = fakeStorage();
    vi.stubGlobal("localStorage", store);
    const { options, drawings, ...old } = draft.snapshot;
    void options;
    void drawings;
    store.setItem(DRAFT_KEY, JSON.stringify({ version: 1, ...draft, snapshot: old, savedAt: 1 }));
    const loaded = loadDraft();
    expect(loaded.status).toBe("ok");
    if (loaded.status === "ok") {
      expect(loaded.draft.snapshot.options).toEqual({ accentColor: null, showAccents: true, decoration: null });
      expect(loaded.draft.snapshot.drawings).toEqual({});
    }
  });

  it("stockage indisponible : ni erreur ni plantage", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("SecurityError");
      },
      setItem() {
        throw new Error("QuotaExceededError");
      },
      removeItem() {
        throw new Error("SecurityError");
      },
    });
    expect(loadDraft()).toEqual({ status: "unavailable" });
    expect(saveDraft(draft)).toBe(false);
    expect(() => clearDraft()).not.toThrow();
  });
});

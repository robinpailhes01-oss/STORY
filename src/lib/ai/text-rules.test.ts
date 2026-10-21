import { describe, expect, it } from "vitest";
import { EXAMPLE_PLAN } from "@/domain/example-plan";
import { assertTextUsable, countWords, endsSentence, sentencesOf, TEXTE_MIN } from "./text-rules";

const STORY_4 = EXAMPLE_PLAN.stories[3].paragraphs.map((p) => p.text).join(" ");
const LONG = EXAMPLE_PLAN.stories.flatMap((s) => s.paragraphs.map((p) => p.text)).join(" ");

describe("mode texte : longueur minimale", () => {
  it("compte les phrases et les mots", () => {
    expect(sentencesOf("Un. Deux ! Trois ? Quatre… (Cinq) Six : sept\nhuit")).toEqual(["Un.", "Deux !", "Trois ?", "Quatre…", "(Cinq)", "Six :", "sept", "huit"]);
    expect(countWords("L'IA, c'est « ça » !")).toBe(5);
    expect(endsSentence("Fin.")).toBe(true);
    expect(endsSentence("(aparté)")).toBe(true);
    expect(endsSentence("La suite :")).toBe(true);
    expect(endsSentence("au milieu de la")).toBe(false);
  });

  it("refuse le texte de 3 phrases du brief 9 avec un message qui dit quoi faire", () => {
    expect(sentencesOf(STORY_4)).toHaveLength(3);
    expect(() => assertTextUsable({ mode: "texte", idea: STORY_4 })).toThrow(
      expect.objectContaining({ code: "texte_trop_court", status: 400, message: expect.stringContaining("passe en mode « idée »") }),
    );
  });

  it("refuse un texte vide, ou de 5 phrases mais moins de 45 mots", () => {
    expect(() => assertTextUsable({ mode: "texte", idea: "  " })).toThrow(expect.objectContaining({ code: "texte_trop_court" }));
    expect(() => assertTextUsable({ mode: "texte", idea: "Un. Deux. Trois. Quatre. Cinq." })).toThrow(
      expect.objectContaining({ message: expect.stringContaining(`${TEXTE_MIN.mots} mots`) }),
    );
  });

  it("accepte un texte assez long, et ne contrôle rien en mode idée (idée vide comprise)", () => {
    expect(sentencesOf(LONG).length).toBeGreaterThanOrEqual(8);
    expect(() => assertTextUsable({ mode: "texte", idea: LONG })).not.toThrow();
    expect(() => assertTextUsable({ mode: "idee", idea: "" })).not.toThrow();
  });
});

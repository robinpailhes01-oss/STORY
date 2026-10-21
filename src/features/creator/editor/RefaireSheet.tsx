"use client";

import { useState } from "react";
import { Sheet } from "../ui/Sheet";

const SUGGESTIONS = ["Plus court", "Plus direct", "Plus percutant", "Plus simple"];

interface Props {
  storyIndex: number;
  structureName: string;
  /** Mode texte sans texte : la séquence ne peut pas être refaite. */
  canRedoAll: boolean;
  onStory: (instruction: string) => void;
  onAll: () => void;
  onClose: () => void;
}

/** Refaire : cette story seule (consigne facultative en une ligne) ou toute la séquence. */
export function RefaireSheet({ storyIndex, structureName, canRedoAll, onStory, onAll, onClose }: Props) {
  const [instruction, setInstruction] = useState("");
  const n = storyIndex + 1;
  return (
    <Sheet title="Refaire" onClose={onClose} testId="refaire">
      <div className="flex flex-col gap-6">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onStory(instruction);
          }}
        >
          <h3 className="text-[15px] font-bold text-white">Refaire la story {n}</h3>
          <p className="text-[13px] leading-snug text-mute">Les autres stories, ton style, tes photos et tes dessins restent. Annuler (↶) revient à la version d’avant.</p>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-soft">Consigne (facultatif)</span>
            <input
              className="field"
              value={instruction}
              maxLength={300}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Plus court, plus direct, garde la 2e phrase…"
              enterKeyHint="go"
              data-testid="consigne"
              data-autofocus
            />
          </label>
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5" role="group" aria-label="Consignes rapides">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="chip shrink-0 text-[14px]" aria-pressed={instruction === s.toLowerCase()} onClick={() => setInstruction(s.toLowerCase())}>
                {s}
              </button>
            ))}
          </div>
          <button type="submit" className="btn-chrome min-h-[52px] w-full text-[16px]" data-action="refaire-story">
            Refaire la story {n}
          </button>
        </form>

        <div className="flex flex-col gap-3 border-t border-white/8 pt-5">
          <h3 className="text-[15px] font-bold text-white">Refaire toute la séquence</h3>
          <p className="text-[13px] leading-snug text-mute">
            {canRedoAll
              ? `L’IA réécrit les 5 stories (structure : ${structureName}) en évitant l’accroche actuelle. Tes photos et ton style sont gardés, tes dessins retirés. Annuler (↶) revient à cette version.`
              : "En mode « J’ai déjà mon texte », colle d’abord ton texte sur l’écran Créer."}
          </p>
          <button type="button" className="btn-ghost w-full" onClick={onAll} disabled={!canRedoAll} data-action="refaire-sequence">
            Refaire les 5 stories
          </button>
        </div>
      </div>
    </Sheet>
  );
}

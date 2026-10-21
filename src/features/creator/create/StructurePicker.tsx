"use client";

import { useEffect, useRef } from "react";
import { AUTO_STRUCTURE, STRUCTURES, type StructureChoice } from "@/domain/structures";

interface Props {
  value: StructureChoice;
  onChange: (value: StructureChoice) => void;
}

const OPTIONS: Array<{ id: StructureChoice; nom: string; but: string }> = [
  { id: AUTO_STRUCTURE, nom: "Auto", but: "L’IA choisit la structure la plus adaptée à ton idée." },
  ...STRUCTURES.map((s) => ({ id: s.id, nom: s.nom, but: s.but })),
];

/** Puces horizontales défilantes : Auto + les 9 structures, avec le but de la structure choisie dessous. */
export function StructurePicker({ value, onChange }: Props) {
  const selected = OPTIONS.find((o) => o.id === value) ?? OPTIONS[0];
  const listRef = useRef<HTMLDivElement>(null);

  // La puce choisie (par une idée, par exemple) reste visible.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [value]);

  const onKey = (event: React.KeyboardEvent, index: number) => {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = OPTIONS[(index + delta + OPTIONS.length) % OPTIONS.length];
    onChange(next.id);
    listRef.current?.querySelector<HTMLElement>(`[data-structure="${next.id}"]`)?.focus();
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={listRef}
        role="radiogroup"
        aria-label="Structure"
        aria-describedby="structure-but"
        className="no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto px-4 py-1"
      >
        {OPTIONS.map((o, i) => {
          const active = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              data-structure={o.id}
              title={o.but}
              onClick={() => onChange(o.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={`min-h-11 shrink-0 snap-start rounded-full px-4 text-sm font-bold whitespace-nowrap transition ${
                active ? "bg-white text-[#0b0d12]" : "border border-white/12 bg-white/5 text-soft hover:bg-white/10"
              }`}
            >
              {o.nom}
            </button>
          );
        })}
      </div>
      <p id="structure-but" className="text-[13px] leading-snug text-mute" aria-live="polite">
        <span className="font-bold text-soft">{selected.nom} :</span> {selected.but}
      </p>
    </div>
  );
}

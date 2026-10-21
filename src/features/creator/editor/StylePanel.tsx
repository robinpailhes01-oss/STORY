"use client";

import { useEffect, useRef, useState } from "react";
import type { StoryPlan } from "@/domain/story-plan";
import { StyleSwatch } from "@/features/renderer/StyleSwatch";
import { fontRequirementsForSequence } from "@/lib/compose";
import { loadFonts } from "@/lib/fonts/load-fonts";
import { STYLE_PRESETS } from "@/styles/presets";

interface Props {
  plan: StoryPlan;
  styleId: string;
  onChange: (styleId: string) => void;
}

/** Grille 2 colonnes : chaque style écrit dans sa police avec son marquage ; s’applique aux 5 stories. */
export function StylePanel({ plan, styleId, onChange }: Props) {
  const grid = useRef<HTMLDivElement>(null);
  const [tile, setTile] = useState(160);

  // Largeur réelle des tuiles (la Stage Konva a besoin d’une taille en px).
  useEffect(() => {
    const node = grid.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setTile(Math.max(120, Math.floor((entry.contentRect.width - 10) / 2))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Polices de la séquence dans chaque style chargées d’avance : le changement de style est immédiat.
  useEffect(() => {
    const all = STYLE_PRESETS.flatMap((s) => fontRequirementsForSequence(plan, s.id));
    loadFonts(all).catch(() => undefined); // une erreur éventuelle est affichée pour le style choisi
  }, [plan]);

  const onKey = (event: React.KeyboardEvent, index: number) => {
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 }[event.key];
    if (!delta) return;
    event.preventDefault();
    const next = STYLE_PRESETS[(index + delta + STYLE_PRESETS.length) % STYLE_PRESETS.length];
    onChange(next.id);
    grid.current?.querySelector<HTMLElement>(`[data-style="${next.id}"]`)?.focus();
  };

  return (
    <div ref={grid} role="radiogroup" aria-label="Style de la séquence" className="grid grid-cols-2 gap-2.5 p-1">
      {STYLE_PRESETS.map((style, i) => {
        const active = style.id === styleId;
        return (
          <button
            key={style.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${style.name} : ${style.description}`}
            tabIndex={active ? 0 : -1}
            data-style={style.id}
            onClick={() => onChange(style.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={`overflow-hidden rounded-2xl transition ${
              active ? "ring-2 ring-white shadow-[0_0_18px_rgba(232,184,75,0.25)]" : "ring-1 ring-white/12 hover:ring-white/30"
            }`}
          >
            <StyleSwatch styleId={style.id} width={tile} height={50} />
          </button>
        );
      })}
    </div>
  );
}

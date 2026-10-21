"use client";

import type { HexColor } from "@/domain/story-document";
import { DRAWING_LIMITS } from "@/domain/story-document";
import { IconHighlighter, IconOval, IconPen, IconTrash, IconUndo } from "../ui/icons";
import type { PenTool } from "./DrawingLayer";

/** Couleurs du Crayon, en plus de la couleur d’accent du style. */
export const PEN_COLORS: ReadonlyArray<{ color: HexColor; name: string }> = [
  { color: "#FFFFFF", name: "blanc" },
  { color: "#0B0D12", name: "noir" },
  { color: "#FFD84D", name: "jaune" },
  { color: "#FF4D6D", name: "rose" },
  { color: "#4ADE80", name: "vert" },
  { color: "#3B82F6", name: "bleu" },
];

export const PEN_SIZES = ["Fin", "Moyen", "Épais"] as const;
/** Épaisseurs en px du repère 1080 × 1920, par outil et par taille. */
export const PEN_WIDTHS: Record<PenTool, readonly [number, number, number]> = {
  stylo: [8, 14, 24],
  surligneur: [34, 52, 76],
  ovale: [7, 12, 20],
};

const TOOLS: ReadonlyArray<{ id: PenTool; name: string; icon: React.ReactNode }> = [
  { id: "stylo", name: "Stylo", icon: <IconPen size={20} /> },
  { id: "surligneur", name: "Surligneur", icon: <IconHighlighter size={20} /> },
  { id: "ovale", name: "Ovale", icon: <IconOval size={20} /> },
];

export interface PenSettings {
  tool: PenTool;
  /** null = couleur d’accent du style (suit la couleur choisie dans Style). */
  color: HexColor | null;
  size: 0 | 1 | 2;
}

interface Props {
  settings: PenSettings;
  accent: HexColor;
  strokes: number;
  message: string | null;
  onChange: (settings: PenSettings) => void;
  onUndoStroke: () => void;
  onClear: () => void;
  onDone: () => void;
}

/** Crayon : outil, couleur, épaisseur, gomme (dernier trait / tout), Terminé. On dessine sur l’aperçu. */
export function PenPanel({ settings, accent, strokes, message, onChange, onUndoStroke, onClear, onDone }: Props) {
  const colors: ReadonlyArray<{ color: HexColor | null; name: string; swatch: HexColor }> = [
    { color: null, name: "couleur d’accent", swatch: accent },
    ...PEN_COLORS.map((c) => ({ ...c, swatch: c.color })),
  ];
  const shown = settings.color ?? accent;
  return (
    <div className="flex flex-col gap-3" data-testid="crayon">
      <p className="text-[13px] text-mute">Dessine sur la story avec le doigt. Chaque trait s’annule avec ↶.</p>
      <div role="radiogroup" aria-label="Outil" className="grid grid-cols-3 gap-2">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={settings.tool === t.id}
            data-pen-tool={t.id}
            className="chip gap-2 px-2 text-[14px]"
            onClick={() => onChange({ ...settings, tool: t.id })}
          >
            {t.icon}
            {t.name}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Couleur du trait" className="grid grid-cols-7">
        {colors.map((c) => {
          const active = settings.color === c.color;
          return (
            <button
              key={c.name}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={c.color === null ? `Couleur d’accent (${accent})` : c.name}
              data-pen-color={c.color ?? "accent"}
              className="flex h-11 items-center justify-center"
              onClick={() => onChange({ ...settings, color: c.color })}
            >
              <span
                className={`relative block size-8 rounded-full ring-1 ring-white/25 ${active ? "outline-2 outline-offset-2 outline-white" : ""}`}
                style={{ background: c.swatch, outlineStyle: active ? "solid" : undefined }}
              >
                {c.color === null && <span className="absolute -right-1 -bottom-1 rounded-full bg-black px-1 text-[9px] font-extrabold text-white ring-1 ring-white/30">A</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Épaisseur" className="flex">
          {PEN_SIZES.map((name, i) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={settings.size === i}
              aria-label={`Épaisseur : ${name.toLowerCase()}`}
              data-pen-size={i}
              className={`flex size-11 items-center justify-center rounded-full ${settings.size === i ? "bg-white/14" : ""}`}
              onClick={() => onChange({ ...settings, size: i as 0 | 1 | 2 })}
            >
              <span className="block rounded-full" style={{ width: 6 + i * 6, height: 6 + i * 6, background: shown, opacity: settings.tool === "surligneur" ? 0.6 : 1 }} />
            </button>
          ))}
        </div>
        <div className="flex">
          <button type="button" className="icon-btn" aria-label="Effacer le dernier trait" disabled={strokes === 0} onClick={onUndoStroke} data-action="effacer-trait">
            <IconUndo size={20} />
          </button>
          <button type="button" className="icon-btn" aria-label="Tout effacer sur cette story" disabled={strokes === 0} onClick={onClear} data-action="effacer-tout">
            <IconTrash size={20} />
          </button>
          <button type="button" className="btn-chrome ml-1 min-h-11 px-4 text-[15px]" onClick={onDone} data-action="crayon-termine">
            Terminé
          </button>
        </div>
      </div>
      <p className="text-[12px] text-mute tabular-nums" aria-live="polite">
        {message ?? `${strokes} trait${strokes > 1 ? "s" : ""} sur cette story (${DRAWING_LIMITS.strokesPerStory} au plus).`}
      </p>
    </div>
  );
}

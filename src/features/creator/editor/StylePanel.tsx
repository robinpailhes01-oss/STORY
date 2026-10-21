"use client";

import { useEffect, useRef, useState } from "react";
import { ACCENT_PALETTE, DECORATIONS } from "@/domain/render-options";
import type { HexColor } from "@/domain/story-document";
import type { StoryPlan } from "@/domain/story-plan";
import { StyleSwatch } from "@/features/renderer/StyleSwatch";
import { fontRequirementsForSequence } from "@/lib/compose";
import { loadFonts } from "@/lib/fonts/load-fonts";
import { preloadSegmenter } from "@/lib/segmentation";
import { STYLE_PRESETS, getStyle } from "@/styles/presets";
import type { StyleOptions } from "../model/draft";
import { IconWarning } from "../ui/icons";
import type { CutoutsState } from "./use-cutouts";

const COLOR_NAMES = ["bleu", "crème", "doré", "vert d’eau", "beige", "vert foncé", "bleu nuit", "bordeaux"];
const HEX_INPUT = /^#?([0-9A-Fa-f]{6})$/;

interface Props {
  plan: StoryPlan;
  styleId: string;
  options: StyleOptions;
  cutouts: CutoutsState;
  onStyle: (styleId: string) => void;
  onOptions: (patch: Partial<StyleOptions>, group?: string) => void;
}

/**
 * Panneau Style de la référence : grille 2 colonnes des 17 styles, décorations (une seule), « Mots en
 * évidence », couleur d’accent (8 pastilles, code hexadécimal, couleur du style). Tout s’applique en direct
 * aux 5 stories et s’annule avec ↶.
 */
export function StylePanel({ plan, styleId, options, cutouts, onStyle, onOptions }: Props) {
  const grid = useRef<HTMLDivElement>(null);
  const [tile, setTile] = useState(160);
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const styleAccent = getStyle(styleId).colors.accent;
  const accent = options.accentColor ?? styleAccent;
  const hexText = hexDraft ?? accent.toUpperCase();
  const hexValid = HEX_INPUT.test(hexText.trim());

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

  // Moteur de détourage préchargé à l’ouverture : un style à mot géant se calcule ensuite sans attendre le chargement.
  useEffect(() => {
    preloadSegmenter().catch(() => undefined); // l’erreur éventuelle est signalée au calcul
  }, []);

  const onKey = (event: React.KeyboardEvent, index: number) => {
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 }[event.key];
    if (!delta) return;
    event.preventDefault();
    const next = STYLE_PRESETS[(index + delta + STYLE_PRESETS.length) % STYLE_PRESETS.length];
    onStyle(next.id);
    grid.current?.querySelector<HTMLElement>(`[data-style="${next.id}"]`)?.focus();
  };

  const typeHex = (value: string) => {
    setHexDraft(value);
    const match = HEX_INPUT.exec(value.trim());
    if (match) onOptions({ accentColor: `#${match[1].toUpperCase()}` as HexColor }, "couleur-hex");
  };

  return (
    <div className="flex flex-col gap-6 pb-2">
      <div ref={grid} role="radiogroup" aria-label="Style de la séquence" className="grid grid-cols-2 gap-2.5 p-0.5">
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
              onClick={() => onStyle(style.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={`overflow-hidden rounded-[18px] transition ${
                active ? "shadow-[0_0_18px_rgba(255,255,255,0.22)] ring-2 ring-white" : "ring-1 ring-white/14 hover:ring-white/30"
              }`}
            >
              <StyleSwatch styleId={style.id} width={tile} height={50} />
            </button>
          );
        })}
      </div>

      {cutouts.needed && (
        <div aria-live="polite" className="-mt-3 flex flex-col gap-1.5" data-testid="detourage">
          {cutouts.computing ? (
            <p className="flex items-center gap-2 text-[13px] text-soft" role="status">
              <span className="spin block size-3.5 rounded-full border-2 border-white border-t-transparent" aria-hidden />
              Détourage…
            </p>
          ) : cutouts.warnings.length ? (
            cutouts.warnings.map((w) => (
              <p key={w} className="flex items-start gap-2 text-[13px] leading-snug text-amber-200">
                <IconWarning size={15} className="mt-0.5 shrink-0" />
                {w}
              </p>
            ))
          ) : (
            <p className="text-[13px] text-soft">Le mot géant passe derrière toi.</p>
          )}
        </div>
      )}

      <section aria-labelledby="deco-titre" className="flex flex-col gap-2.5">
        <h3 id="deco-titre" className="text-[14px] text-mute">
          Décoration
        </h3>
        <div className="flex flex-wrap gap-2">
          {DECORATIONS.map((d) => {
            const active = options.decoration === d.id;
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={active}
                data-decoration={d.id}
                className="chip"
                onClick={() => onOptions({ decoration: active ? null : d.id })}
              >
                {d.nom}
              </button>
            );
          })}
        </div>
      </section>

      <label className="flex items-center justify-between gap-3">
        <span className="text-[15px] text-soft">Mots en évidence</span>
        <button
          type="button"
          role="switch"
          aria-checked={options.showAccents}
          aria-label="Mots en évidence"
          data-action="mots-en-evidence"
          onClick={() => onOptions({ showAccents: !options.showAccents })}
          className="flex h-11 w-[64px] shrink-0 items-center justify-center"
        >
          <span aria-hidden className={`relative block h-8 w-[56px] rounded-full transition ${options.showAccents ? "bg-gradient-to-b from-white to-[#b9bdc6]" : "bg-white/15"}`}>
            <span
              className={`absolute top-1 left-1 size-6 rounded-full shadow transition-transform ${options.showAccents ? "translate-x-6 bg-white" : "bg-white/80"}`}
            />
          </span>
        </button>
      </label>

      <section aria-labelledby="couleur-titre" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 id="couleur-titre" className="text-[14px] text-mute">
            Couleur
          </h3>
          <button
            type="button"
            aria-pressed={options.accentColor === null}
            className="chip min-h-11 gap-2 px-3 text-[13px]"
            data-action="couleur-du-style"
            onClick={() => {
              setHexDraft(null);
              onOptions({ accentColor: null });
            }}
          >
            <span aria-hidden className="size-4 rounded-full ring-1 ring-white/30" style={{ background: styleAccent }} />
            Couleur du style
          </button>
        </div>
        <div role="radiogroup" aria-label="Couleur d’accent" className="grid grid-cols-8">
          {ACCENT_PALETTE.map((color, i) => {
            const active = options.accentColor?.toUpperCase() === color.toUpperCase();
            return (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`${COLOR_NAMES[i] ?? "couleur"} (${color})`}
                data-color={color}
                className="flex h-14 items-center justify-center"
                onClick={() => {
                  setHexDraft(null);
                  onOptions({ accentColor: color });
                }}
              >
                <span
                  className={`block h-12 w-[calc(100%-6px)] rounded-full ${active ? "ring-[3px] ring-white ring-offset-2 ring-offset-[#15181f]" : "ring-1 ring-white/10"}`}
                  style={{ background: color }}
                />
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          <label className="relative flex items-center">
            <span className="sr-only">Code couleur (#RRGGBB)</span>
            <span aria-hidden className="pointer-events-none absolute left-3 size-7 rounded-lg ring-1 ring-white/20" style={{ background: hexValid ? `#${HEX_INPUT.exec(hexText.trim())![1]}` : accent }} />
            <input
              className="field w-[168px] rounded-2xl py-2.5 pl-13 font-mono text-[16px] tracking-wide uppercase"
              value={hexText}
              maxLength={7}
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={!hexValid || undefined}
              aria-describedby="hex-aide"
              data-testid="hex"
              onChange={(e) => typeHex(e.target.value)}
              onBlur={() => setHexDraft(null)}
            />
          </label>
          <p id="hex-aide" className={`text-[12px] leading-snug ${hexValid ? "text-mute" : "text-amber-200"}`} aria-live="polite">
            {hexValid ? "Ou un code couleur." : "Format : #RRGGBB (ex. #C8A25C)."}
          </p>
        </div>
      </section>
    </div>
  );
}

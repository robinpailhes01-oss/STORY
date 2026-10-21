"use client";

import { SEQUENCE_LAYOUT } from "@/domain/story-plan";
import { DEFAULT_CROP } from "../model/draft";
import { PhotoSlots } from "../photos/PhotoSlots";
import { useCreator, useStore } from "../use-creator";

/** Les 3 photos (remplacer, échanger) et le cadrage de la photo de la story courante. */
export function PhotoPanel() {
  const store = useStore();
  const { history, storyIndex } = useCreator();
  const slot = SEQUENCE_LAYOUT[storyIndex].photo;
  const photoId = history.present.photos[slot];
  const crop = (photoId && history.present.crops[photoId]) || DEFAULT_CROP;
  const set = (patch: Partial<typeof crop>) => photoId && store.setCrop(photoId, { ...crop, ...patch });
  const pct = (v: number) => `${Math.round(v * 100)} %`;

  return (
    <div className="flex flex-col gap-4">
      <PhotoSlots compact highlight={slot} />
      <section aria-labelledby="cadrage-titre" className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <h3 id="cadrage-titre" className="text-sm font-bold text-white">
            Cadrage de la photo {slot + 1}
            <span className="block text-xs font-normal text-mute">Pour toutes les stories de cette photo.</span>
          </h3>
          {photoId && (
            <button type="button" className="min-h-11 text-xs font-bold text-soft underline underline-offset-2" onClick={() => store.setCrop(photoId, DEFAULT_CROP)}>
              Recentrer
            </button>
          )}
        </div>
        {photoId ? (
          <div className="flex flex-col" data-testid="cadrage">
            <Slider label="Horizontal" value={crop.focalX} min={0} max={1} step={0.01} display={pct(crop.focalX)} onChange={(focalX) => set({ focalX })} hint="gauche ↔ droite" />
            <Slider label="Vertical" value={crop.focalY} min={0} max={1} step={0.01} display={pct(crop.focalY)} onChange={(focalY) => set({ focalY })} hint="haut ↔ bas" />
            <Slider label="Zoom" value={crop.zoom} min={1} max={2} step={0.01} display={`× ${crop.zoom.toFixed(2).replace(".", ",")}`} onChange={(zoom) => set({ zoom })} />
          </div>
        ) : (
          <p className="text-sm text-mute">Ajoute la photo {slot + 1} pour régler son cadrage.</p>
        )}
      </section>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  hint?: string;
  onChange: (value: number) => void;
}) {
  const id = `cadrage-${label.toLowerCase()}`;
  return (
    <div className="grid grid-cols-[84px_1fr_56px] items-center gap-3">
      <label htmlFor={id} className="text-sm text-soft">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={display}
        aria-describedby={hint ? `${id}-aide` : undefined}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full accent-white"
      />
      <span className="text-right text-xs font-bold text-soft tabular-nums">{display}</span>
      {hint && (
        <span id={`${id}-aide`} className="sr-only">
          {hint}
        </span>
      )}
    </div>
  );
}

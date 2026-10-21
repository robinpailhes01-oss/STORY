"use client";

import { useRef, useState } from "react";
import { PHOTO_COUNT } from "@/domain/story-plan";
import { useCreator, useStore } from "../use-creator";
import { IconImage, IconPlus, IconSwap, IconTrash, IconWarning } from "../ui/icons";
import { Sheet } from "../ui/Sheet";

export const SLOT_LABELS = ["Accroche", "Milieu", "Fin"] as const;
export const SLOT_STORIES = ["story 1", "stories 2 et 3", "stories 4 et 5"] as const;

interface Props {
  /** Variante plus serrée pour le panneau Photo de l’éditeur. */
  compact?: boolean;
  /** Emplacement mis en avant (photo de la story courante dans l’éditeur). */
  highlight?: number;
}

/**
 * Les 3 emplacements photo numérotés : toucher un emplacement vide ouvre la pellicule, toucher une photo
 * propose remplacer / échanger / retirer. « Ajouter 3 photos » remplit dans l’ordre.
 */
export function PhotoSlots({ compact = false, highlight }: Props) {
  const store = useStore();
  const { history, photos: pool, imports, photoErrors } = useCreator();
  const slots = history.present.photos;
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const multi = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const busy = imports !== null;
  const filled = slots.filter(Boolean).length;

  const pick = (slot: number) => inputs.current[slot]?.click();
  const onFiles = (files: FileList | null, slot: number | "auto") => {
    const list = files ? [...files] : [];
    if (list.length) void store.importFiles(list, slot);
  };

  const warnings = slots.flatMap((id, slot) => {
    const photo = id ? pool.get(id) : undefined;
    return photo ? photo.warnings.map((w) => ({ slot, message: w.message })) : [];
  });

  return (
    <div className="flex flex-col gap-3">
      <ol className={`grid grid-cols-3 ${compact ? "gap-2.5" : "gap-3"}`}>
        {slots.map((id, slot) => {
          const photo = id ? pool.get(id) : undefined;
          const label = `Photo ${slot + 1}, ${SLOT_LABELS[slot].toLowerCase()} (${SLOT_STORIES[slot]})`;
          return (
            <li key={slot} className="flex min-w-0 flex-col gap-1.5">
              <button
                type="button"
                data-photo-slot={slot + 1}
                aria-label={photo ? `${label} : ${photo.name || "photo ajoutée"}. Modifier` : `${label} : ajouter une photo`}
                disabled={busy}
                onClick={() => (photo ? setMenu(slot) : pick(slot))}
                className={`group relative aspect-[3/4] w-full overflow-hidden rounded-2xl transition disabled:cursor-wait ${
                  photo ? "ring-1 ring-white/15" : "border border-dashed border-white/25 bg-white/[0.03] hover:bg-white/[0.06]"
                } ${highlight === slot ? "ring-2 ring-white" : ""}`}
              >
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- photo locale (object URL), pas d’optimisation possible
                  <img src={photo.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-mute">
                    <IconPlus size={compact ? 22 : 26} />
                    {!compact && <span className="text-xs font-bold">Ajouter</span>}
                  </span>
                )}
                <span
                  aria-hidden
                  className="absolute top-1.5 left-1.5 flex size-6 items-center justify-center rounded-full bg-black/65 text-xs font-extrabold text-white ring-1 ring-white/25"
                >
                  {slot + 1}
                </span>
                {photo && photo.warnings.length > 0 && (
                  <span aria-hidden className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-amber-400 text-black">
                    <IconWarning size={15} />
                  </span>
                )}
              </button>
              <span className="truncate text-center text-xs font-bold text-soft">
                {SLOT_LABELS[slot]}
                {!compact && <span className="block truncate font-normal text-mute">{SLOT_STORIES[slot]}</span>}
              </span>
              <input
                ref={(el) => {
                  inputs.current[slot] = el;
                }}
                type="file"
                accept="image/*"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                data-testid={`photo-input-${slot + 1}`}
                onChange={(e) => {
                  onFiles(e.target.files, slot);
                  e.target.value = "";
                }}
              />
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost min-h-11 text-sm" disabled={busy} onClick={() => multi.current?.click()}>
          <IconImage size={18} />
          {filled === 0 ? "Ajouter 3 photos" : filled < PHOTO_COUNT ? "Compléter les photos" : "Changer les 3 photos"}
        </button>
        <input
          ref={multi}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          data-testid="photo-input-multi"
          onChange={(e) => {
            onFiles(e.target.files, "auto");
            e.target.value = "";
          }}
        />
      </div>

      <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
        {imports && (
          <div className="flex flex-col gap-1.5" data-testid="import-progress">
            <p className="text-sm text-soft">
              Import de la photo {imports.done + 1} sur {imports.total}
              {imports.fileName ? ` (${imports.fileName})` : ""}…
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={imports.total} aria-valuenow={imports.done} aria-label="Import des photos">
              <div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${((imports.done + 0.5) / imports.total) * 100}%` }} />
            </div>
          </div>
        )}
        {warnings.map((w) => (
          <p key={`${w.slot}-${w.message}`} className="flex items-start gap-2 text-[13px] leading-snug text-amber-200">
            <IconWarning size={16} className="mt-0.5 shrink-0" />
            <span>
              Photo {w.slot + 1} : {w.message}
            </span>
          </p>
        ))}
      </div>
      {photoErrors.length > 0 && (
        <div role="alert" className="flex flex-col gap-1.5 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
          {photoErrors.map((e, i) => (
            <p key={i}>
              <span className="font-bold">{e.fileName || "Photo"} :</span> {e.message}
            </p>
          ))}
          <button type="button" onClick={store.dismissPhotoErrors} className="self-start text-xs font-bold underline underline-offset-2">
            Compris
          </button>
        </div>
      )}

      {menu !== null && slots[menu] && (
        <PhotoMenu
          slot={menu}
          name={pool.get(slots[menu]!)?.name ?? ""}
          url={pool.get(slots[menu]!)?.url}
          onClose={() => setMenu(null)}
          onReplace={() => {
            setMenu(null);
            pick(menu);
          }}
          onSwap={(other) => {
            store.swapPhotos(menu, other);
            setMenu(null);
          }}
          onRemove={() => {
            store.removePhoto(menu);
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}

function PhotoMenu({
  slot,
  name,
  url,
  onClose,
  onReplace,
  onSwap,
  onRemove,
}: {
  slot: number;
  name: string;
  url?: string;
  onClose: () => void;
  onReplace: () => void;
  onSwap: (other: number) => void;
  onRemove: () => void;
}) {
  const others = [0, 1, 2].filter((s) => s !== slot);
  return (
    <Sheet title={`Photo ${slot + 1} · ${SLOT_LABELS[slot]}`} subtitle={`Utilisée pour ${SLOT_STORIES[slot]}.`} onClose={onClose} testId="photo-menu">
      <div className="flex items-center gap-4 pb-4">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element -- photo locale (object URL)
          <img src={url} alt="" className="h-24 w-[72px] shrink-0 rounded-xl object-cover ring-1 ring-white/15" />
        )}
        <p className="min-w-0 truncate text-sm text-mute">{name || "Photo ajoutée"}</p>
      </div>
      <div className="flex flex-col gap-2">
        <button type="button" data-autofocus onClick={onReplace} className="btn-ghost justify-start">
          <IconImage size={20} /> Remplacer
        </button>
        {others.map((o) => (
          <button key={o} type="button" onClick={() => onSwap(o)} className="btn-ghost justify-start">
            <IconSwap size={20} /> Échanger avec la photo {o + 1} ({SLOT_LABELS[o].toLowerCase()})
          </button>
        ))}
        <button type="button" onClick={onRemove} className="btn-ghost justify-start text-red-300">
          <IconTrash size={20} /> Retirer
        </button>
      </div>
    </Sheet>
  );
}

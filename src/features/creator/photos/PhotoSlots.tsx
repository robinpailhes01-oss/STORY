"use client";

import { useRef, useState } from "react";
import { MIN_PHOTO_COUNT, PHOTO_COUNT, STORY_COUNT, photoIndexFor } from "@/domain/story-plan";
import { photoCount } from "../model/draft";
import { useCreator, useStore } from "../use-creator";
import { IconClose, IconImage, IconPhotos, IconSwap, IconTrash, IconWarning } from "../ui/icons";
import { Sheet } from "../ui/Sheet";

/** « story 1 », « stories 2 et 3 », « stories 1, 4 et 5 » : où sert la photo `slot` selon le nombre de photos. */
export function storiesOfPhoto(slot: number, count: number): string {
  const stories = Array.from({ length: STORY_COUNT }, (_, i) => i).filter((i) => photoIndexFor(i, Math.max(count, MIN_PHOTO_COUNT)) === slot);
  if (!stories.length) return "aucune story";
  const n = stories.map((i) => String(i + 1));
  if (n.length === 1) return `story ${n[0]}`;
  return `stories ${n.slice(0, -1).join(", ")} et ${n.at(-1)}`;
}

interface Props {
  /** Variante plus serrée pour le panneau Photo de l’éditeur. */
  compact?: boolean;
  /** Emplacement mis en avant (photo de la story courante dans l’éditeur). */
  highlight?: number;
}

/**
 * Photos 2 ou 3, comme la référence : vide = une grande zone en pointillés ; rempli = une rangée de vignettes
 * portrait numérotées avec ✕, plus une tuile « + » tant qu’on peut en ajouter. Plusieurs photos d’un coup.
 * Toucher une vignette : remplacer, changer l’ordre, retirer.
 */
export function PhotoSlots({ compact = false, highlight }: Props) {
  const store = useStore();
  const { history, photos: pool, imports, photoErrors } = useCreator();
  const slots = history.present.photos;
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const multi = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const busy = imports !== null;
  const count = photoCount(slots);

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
      {count === 0 && !compact ? (
        <button
          type="button"
          data-action="ajouter-photos"
          disabled={busy}
          onClick={() => multi.current?.click()}
          aria-label="Ajouter 2 ou 3 photos"
          className="group flex h-[178px] w-full flex-col items-center justify-center gap-3 rounded-[22px] border border-dashed border-white/25 bg-gradient-to-b from-white/[0.015] to-white/[0.04] text-white/70 transition hover:border-white/40 hover:text-white disabled:cursor-wait"
        >
          <IconPhotos size={40} strokeWidth={1.2} />
          <span className="text-[13px] font-bold text-mute group-hover:text-soft">2 ou 3 photos, verticales de préférence</span>
        </button>
      ) : (
        <ol className={`grid grid-cols-4 ${compact ? "gap-2" : "gap-2.5"}`} aria-label="Tes photos">
          {slots.map((id, slot) => {
            const photo = id ? pool.get(id) : undefined;
            if (!photo) return null;
            const where = storiesOfPhoto(slot, count);
            return (
              <li key={id} className="relative min-w-0">
                <button
                  type="button"
                  data-photo-slot={slot + 1}
                  aria-label={`Photo ${slot + 1} (${where}) : ${photo.name || "photo ajoutée"}. Remplacer ou changer l’ordre`}
                  disabled={busy}
                  onClick={() => setMenu(slot)}
                  className={`relative block aspect-[4/5] w-full overflow-hidden rounded-[18px] ring-1 transition disabled:cursor-wait ${
                    highlight === slot ? "ring-2 ring-white" : "ring-white/25"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- photo locale (object URL), pas d’optimisation possible */}
                  <img src={photo.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  <span aria-hidden className="absolute bottom-1.5 left-2 text-[15px] font-bold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">
                    {slot + 1}
                  </span>
                  {photo.warnings.length > 0 && (
                    <span aria-hidden className="absolute bottom-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-amber-400 text-black">
                      <IconWarning size={13} />
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  aria-label={`Retirer la photo ${slot + 1}`}
                  data-remove-photo={slot + 1}
                  disabled={busy}
                  onClick={() => store.removePhoto(slot)}
                  className="absolute -top-0.5 -right-0.5 flex size-11 items-center justify-center"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/20 backdrop-blur-md">
                    <IconClose size={16} />
                  </span>
                </button>
              </li>
            );
          })}
          {count < PHOTO_COUNT && (
            <li className="min-w-0">
              <button
                type="button"
                data-action="ajouter-photos"
                disabled={busy}
                onClick={() => multi.current?.click()}
                aria-label={count < MIN_PHOTO_COUNT ? "Ajouter une photo (2 au minimum)" : "Ajouter une troisième photo (facultatif)"}
                className="flex aspect-[4/5] w-full items-center justify-center rounded-[18px] border border-dashed border-white/25 text-white/70 transition hover:border-white/45 hover:text-white disabled:cursor-wait"
              >
                <IconPhotos size={compact ? 26 : 32} strokeWidth={1.3} />
              </button>
            </li>
          )}
        </ol>
      )}

      {slots.map((_, slot) => (
        <input
          key={slot}
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
      ))}
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

      {count > 1 && !compact && <p className="text-[12px] text-mute">Touche une photo pour la remplacer ou changer l’ordre.</p>}
      {count === 1 && !busy && (
        <p className="text-[13px] text-soft" role="status">
          Encore une photo au moins : avec 2 photos, la première sert aux stories 1, 4 et 5.
        </p>
      )}

      <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
        {imports && (
          <div className="flex flex-col gap-1.5" data-testid="import-progress">
            <p className="text-sm text-soft">
              Import de la photo {imports.done + 1} sur {imports.total}
              {imports.fileName ? ` (${imports.fileName})` : ""}…
            </p>
            <div className="h-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={imports.total} aria-valuenow={imports.done} aria-label="Import des photos">
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
          <button type="button" onClick={store.dismissPhotoErrors} className="min-h-11 self-start text-xs font-bold underline underline-offset-2">
            Compris
          </button>
        </div>
      )}

      {menu !== null && slots[menu] && (
        <PhotoMenu
          slot={menu}
          count={count}
          name={pool.get(slots[menu]!)?.name ?? ""}
          url={pool.get(slots[menu]!)?.url}
          onClose={() => setMenu(null)}
          onReplace={() => {
            setMenu(null);
            inputs.current[menu]?.click();
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
  count,
  name,
  url,
  onClose,
  onReplace,
  onSwap,
  onRemove,
}: {
  slot: number;
  count: number;
  name: string;
  url?: string;
  onClose: () => void;
  onReplace: () => void;
  onSwap: (other: number) => void;
  onRemove: () => void;
}) {
  const others = Array.from({ length: count }, (_, i) => i).filter((s) => s !== slot);
  return (
    <Sheet title={`Photo ${slot + 1}`} subtitle={`Utilisée pour ${storiesOfPhoto(slot, count)}.`} onClose={onClose} testId="photo-menu">
      <div className="flex items-center gap-4 pb-4">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element -- photo locale (object URL)
          <img src={url} alt="" className="h-24 w-[76px] shrink-0 rounded-xl object-cover ring-1 ring-white/15" />
        )}
        <p className="min-w-0 truncate text-sm text-mute">{name || "Photo ajoutée"}</p>
      </div>
      <div className="flex flex-col gap-2">
        <button type="button" data-autofocus onClick={onReplace} className="btn-ghost justify-start">
          <IconImage size={20} /> Remplacer
        </button>
        {others.map((o) => (
          <button key={o} type="button" onClick={() => onSwap(o)} className="btn-ghost justify-start">
            <IconSwap size={20} /> Échanger avec la photo {o + 1}
          </button>
        ))}
        <button type="button" onClick={onRemove} className="btn-ghost justify-start text-red-300">
          <IconTrash size={20} /> Retirer
        </button>
      </div>
    </Sheet>
  );
}

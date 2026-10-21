"use client";

import { useId, useState } from "react";
import type { BrandContext } from "@/domain/story-plan";
import { IconPlus, IconUser } from "../ui/icons";

export function Avatar({ src, size = 64 }: { src: string | null; size?: number }) {
  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/8 text-white/50 ring-[3px] ring-white/25 ring-offset-2 ring-offset-[#14161c]"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL locale
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <IconUser size={Math.round(size * 0.45)} />
      )}
    </span>
  );
}

/** Squelette de la carte pendant l’ouverture du brouillon (comme la référence). */
export function ProfileCardSkeleton() {
  return (
    <div className="glass flex items-center gap-4 rounded-[26px] p-5" aria-hidden>
      <span className="skeleton size-16 shrink-0 rounded-full" />
      <span className="flex flex-1 flex-col gap-3">
        <span className="skeleton h-5 w-4/5 rounded-full" />
        <span className="skeleton h-3.5 w-1/2 rounded-full" />
      </span>
    </div>
  );
}

/**
 * Carte profil en tête de l’écran Créer : avatar, nom ✦ bio, @identifiant, « Voir la bio + » (ton activité).
 * Toucher la carte ouvre « Mon contexte » (plus tard : lecture du compte Instagram).
 */
export function ProfileCard({ context, avatar, onOpen }: { context: BrandContext; avatar: string | null; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const bioId = useId();
  const title = [context.name.trim(), context.bio.trim()].filter(Boolean).join(" ✦ ");
  const more = context.activity.trim();

  return (
    <section className="glass relative rounded-[26px] p-1.5" aria-label="Ton profil" data-testid="profil">
      <div className="rounded-[21px] border border-white/6 bg-black/20 p-4">
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full items-center gap-4 rounded-2xl text-left"
          aria-label={`Ton profil : ${title || "à compléter"}${context.handle ? `, @${context.handle}` : ""}. Modifier mon contexte`}
          data-action="profil"
        >
          <Avatar src={avatar} size={64} />
          <span className="min-w-0 flex-1">
            <span className="block text-[19px] leading-[1.2] font-bold text-white">{title || "Ton profil"}</span>
            <span className="mt-1 block truncate text-[14px] text-mute">
              {context.handle ? `@${context.handle.replace(/^@/, "")}` : "Touche pour présenter ton activité"}
            </span>
          </span>
        </button>
        {more && (
          <div className="pl-[80px]">
            <button
              type="button"
              className="-ml-1 flex min-h-11 items-center gap-2 px-1 text-[14px] text-soft hover:text-white"
              aria-expanded={open}
              aria-controls={bioId}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? "Masquer la bio" : "Voir la bio"}
              <IconPlus size={16} className={`transition-transform ${open ? "rotate-45" : ""}`} />
            </button>
            <p id={bioId} hidden={!open} className="pb-1 text-[14px] leading-relaxed text-soft">
              {more}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

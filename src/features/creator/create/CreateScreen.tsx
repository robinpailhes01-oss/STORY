"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MIN_PHOTO_COUNT, type IdeaSuggestion } from "@/domain/story-plan";
import { AUTO_STRUCTURE, getStructure, isStructureId } from "@/domain/structures";
import { requestIdeas, retryDelayLabel, type ApiFailure } from "../model/api";
import { IDEA_MAX, photoCount } from "../model/draft";
import { PhotoSlots } from "../photos/PhotoSlots";
import { ProfileCard } from "../profile/ProfileCard";
import { useCreator, useStore } from "../use-creator";
import { IconChevronRight, IconInfo, IconSparkle, IconWarning } from "../ui/icons";
import { AutoTextarea } from "../ui/AutoTextarea";
import { Logo } from "../ui/Logo";
import { ConfirmSheet } from "../ui/Sheet";
import { ContextSheet } from "./ContextSheet";
import { StructurePicker } from "./StructurePicker";

type IdeasState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; ideas: IdeaSuggestion[] }
  | { status: "error"; error: ApiFailure };

/** En-tête commun : logo à gauche, fil d’étapes « Ton profil • Tes photos » à droite. */
export function CreateHeader({ onProfile }: { onProfile?: () => void }) {
  return (
    <header className="flex h-[72px] items-center justify-between gap-3">
      <Logo size={38} />
      <nav aria-label="Étapes" className="flex items-center gap-1 text-[14px]">
        <button
          type="button"
          onClick={onProfile}
          disabled={!onProfile}
          className="flex min-h-11 items-center gap-2 px-2 text-mute transition hover:text-soft"
          data-action="etape-profil"
        >
          <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />
          Ton profil
        </button>
        <span className="flex min-h-11 items-center gap-2 pl-2 text-white" aria-current="step">
          <span aria-hidden className="size-1.5 rounded-full bg-white" />
          Tes photos
        </span>
      </nav>
    </header>
  );
}

export function CreateScreen() {
  const store = useStore();
  const state = useCreator();
  const { idea, mode, structure, context, avatar, voice, history, notices, exampleLoading, imports, createError } = state;
  const plan = history.present.plan;
  const [ideas, setIdeas] = useState<IdeasState>({ status: "idle" });
  const [seenHooks, setSeenHooks] = useState<string[]>([]);
  const [contextOpen, setContextOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [structureOpen, setStructureOpen] = useState(false);
  const ideasAbort = useRef<AbortController | null>(null);
  const ideaRef = useRef<HTMLTextAreaElement>(null);
  const infoId = useId();

  useEffect(() => () => ideasAbort.current?.abort(), []);

  const photos = photoCount(history.present.photos);
  const canGenerate = store.canGenerate();
  const texte = mode === "texte";
  const structureName = structure !== AUTO_STRUCTURE && isStructureId(structure) ? getStructure(structure).nom : "Auto";
  const hint = imports
    ? "Import des photos en cours…"
    : photos < MIN_PHOTO_COUNT
      ? `Ajoute ${photos === 0 ? "2 ou 3 photos" : "encore une photo"} pour générer.`
      : texte && !idea.trim()
        ? "Colle ton texte pour le découper en 5 stories."
        : idea.trim()
          ? "Environ 20 secondes."
          : "Sans idée, l’IA part de ton profil. Environ 20 secondes.";

  const askIdeas = async () => {
    ideasAbort.current?.abort();
    const controller = new AbortController();
    ideasAbort.current = controller;
    setIdeas({ status: "loading" });
    const theme = mode === "idee" ? idea.trim().slice(0, 300) : "";
    const result = await requestIdeas({ context: store.requestContext(), theme, avoid: seenHooks.slice(-20) }, controller.signal);
    if (controller.signal.aborted) return;
    if (result.ok) {
      setIdeas({ status: "ready", ideas: result.data.ideas });
      setSeenHooks((s) => [...s, ...result.data.ideas.map((i) => i.hook)].slice(-20));
    } else setIdeas({ status: "error", error: result });
  };

  const chooseIdea = (suggestion: IdeaSuggestion) => {
    store.setIdea(suggestion.idea.slice(0, IDEA_MAX));
    store.setMode("idee");
    if (isStructureId(suggestion.structureId)) store.setStructure(suggestion.structureId);
    setIdeas({ status: "idle" });
    ideaRef.current?.focus({ preventScroll: true });
    ideaRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  return (
    <div
      className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col px-5 pt-[env(safe-area-inset-top)] pb-[max(env(safe-area-inset-bottom),20px)]"
      data-screen="create"
    >
      <CreateHeader onProfile={() => setContextOpen(true)} />

      <main className="flex flex-1 flex-col gap-7 pt-3">
        {notices.length > 0 && (
          <div role="status" className="flex flex-col gap-2">
            {notices.map((n) => (
              <p key={n} className="flex items-start gap-2 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-3 text-[13px] leading-snug text-amber-100">
                <IconWarning size={16} className="mt-0.5 shrink-0" />
                {n}
              </p>
            ))}
          </div>
        )}

        <ProfileCard context={context} avatar={avatar} onOpen={() => setContextOpen(true)} />

        <h1 className="font-display pt-2 text-[40px] leading-[1.04] text-[#f1efe9] sm:text-[46px]">
          Deux ou trois photos,
          <br />
          on écrit le reste.
        </h1>

        {plan && (
          <section className="card flex flex-col gap-3 p-4" aria-label="Séquence en cours">
            <div>
              <p className="text-sm font-bold text-white">Ta séquence en cours</p>
              <p className="mt-0.5 line-clamp-2 text-[13px] text-mute">{plan.stories[0].paragraphs.map((p) => p.text).join(" ")}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-chrome min-h-11 flex-1 text-sm" onClick={store.goEditor}>
                Reprendre l’édition <IconChevronRight size={18} />
              </button>
              <button type="button" className="btn-ghost min-h-11 text-sm" onClick={() => setConfirmNew(true)}>
                Nouvelle séquence
              </button>
            </div>
          </section>
        )}

        <section aria-labelledby="photos-titre">
          <h2 id="photos-titre" className="sr-only">
            Tes photos (2 ou 3)
          </h2>
          <PhotoSlots />
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="idee-titre">
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-white/15 px-3 py-1 text-[13px] text-soft">{texte ? "Obligatoire" : "Facultatif"}</span>
            <h2 id="idee-titre" className="text-[17px] font-bold text-white">
              <label htmlFor="idee">{texte ? "Ton texte" : "Ton idée de séquence"}</label>
            </h2>
            <button
              type="button"
              className="-ml-1 flex size-11 items-center justify-center rounded-full text-soft hover:text-white"
              aria-label="À quoi sert ton idée ?"
              aria-expanded={infoOpen}
              aria-controls={infoId}
              onClick={() => setInfoOpen((o) => !o)}
            >
              <IconInfo size={24} strokeWidth={1.3} />
            </button>
          </div>
          <p id={infoId} hidden={!infoOpen} className="rounded-2xl bg-white/[0.05] p-3 text-[13px] leading-relaxed text-soft">
            {texte
              ? "Ton texte est gardé mot pour mot : l’IA le découpe seulement en 5 stories et choisit les mots à mettre en valeur."
              : "Une idée, un sujet, une anecdote : l’IA écrit la séquence autour. Sans idée, elle part de ton profil (activité, offre, preuves) pour choisir un sujet."}
          </p>
          <div className="relative">
            <AutoTextarea
              id="idee"
              ref={ideaRef}
              value={idea}
              maxLength={IDEA_MAX}
              minRows={texte ? 6 : 3}
              onChange={(e) => store.setIdea(e.target.value)}
              aria-describedby="idee-compteur"
              aria-invalid={createError ? true : undefined}
              placeholder={
                texte
                  ? "Colle ici ton texte : il sera découpé en 5 stories, sans changer tes mots."
                  : "Tu as une idée pour aujourd’hui ? Note-la ici. Sinon, on s’appuie sur ton profil pour te trouver un sujet."
              }
              className={`field max-h-[60dvh] min-h-[120px] rounded-[22px] bg-black/25 px-4 py-3.5 text-[17px] ${idea.length ? "pb-7" : ""}`}
            />
            <span id="idee-compteur" className={`pointer-events-none absolute right-4 bottom-2.5 text-[11px] text-mute tabular-nums ${idea.length ? "" : "sr-only"}`}>
              {idea.length} / {IDEA_MAX}
            </span>
          </div>
          <div aria-live="polite" className="empty:hidden">
            {createError && (
              <p role="alert" className="flex items-start gap-2 text-[13px] leading-snug text-amber-100" data-error-code={createError.code}>
                <IconWarning size={16} className="mt-0.5 shrink-0" />
                {createError.message}
              </p>
            )}
          </div>

          <div className="-mt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={askIdeas}
              disabled={ideas.status === "loading"}
              className="-ml-1 flex min-h-11 items-center gap-1.5 px-1 text-[14px] text-soft hover:text-white disabled:opacity-60"
              aria-controls="idees"
            >
              <IconSparkle size={17} className={ideas.status === "loading" ? "spin" : ""} />
              {ideas.status === "loading" ? "Recherche…" : "Pas d’idée ?"}
            </button>
            <label className="flex cursor-pointer items-center gap-1">
              <span className="text-[14px] text-soft">J’ai déjà mon texte</span>
              <button
                type="button"
                role="switch"
                aria-checked={texte}
                aria-label="J’ai déjà mon texte"
                onClick={() => store.setMode(texte ? "idee" : "texte")}
                className="flex h-11 w-[52px] shrink-0 items-center justify-center"
              >
                <span aria-hidden className={`relative block h-6 w-10 rounded-full transition ${texte ? "bg-white" : "bg-white/15"}`}>
                  <span className={`absolute top-1 left-1 size-4 rounded-full transition-transform ${texte ? "translate-x-4 bg-[#0b0d12]" : "bg-white"}`} />
                </span>
              </button>
            </label>
          </div>

          <div id="idees" aria-live="polite" className="flex flex-col gap-2 empty:hidden">
            {ideas.status === "loading" && <p className="text-sm text-mute">L’IA cherche 5 idées à partir de ton profil…</p>}
            {ideas.status === "error" && (
              <div role="alert" className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
                <p>{ideas.error.message}</p>
                {ideas.error.retryAfterSec && <p className="mt-1 font-bold">Tu pourras réessayer dans {retryDelayLabel(ideas.error.retryAfterSec)}.</p>}
              </div>
            )}
            {ideas.status === "ready" && (
              <>
                <p className="text-[13px] text-mute">Touche une idée pour la reprendre :</p>
                <ul className="flex flex-col gap-2" data-testid="idees">
                  {ideas.ideas.map((s, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        data-idea={i}
                        onClick={() => chooseIdea(s)}
                        className="card flex w-full flex-col gap-1.5 p-4 text-left transition hover:bg-white/[0.07]"
                      >
                        <span className="text-[15px] leading-snug font-bold text-white">{/^[«"“]/.test(s.hook.trim()) ? s.hook : `« ${s.hook} »`}</span>
                        <span className="text-[13px] leading-snug text-soft">{s.idea}</span>
                        <span className="mt-0.5 self-start rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-bold tracking-wide text-mute uppercase">
                          {isStructureId(s.structureId) ? getStructure(s.structureId).nom : s.structureId}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="-ml-1 flex min-h-11 items-center gap-1.5 self-start px-1 text-[14px] text-mute hover:text-soft"
              aria-expanded={structureOpen}
              aria-controls="structure-choix"
              onClick={() => setStructureOpen((o) => !o)}
              data-action="structure"
            >
              Structure : <span className="font-bold text-soft">{structureName}</span>
              <IconChevronRight size={16} className={`transition-transform ${structureOpen ? "rotate-90" : ""}`} />
            </button>
            <div id="structure-choix" hidden={!structureOpen}>
              {structureOpen && <StructurePicker value={structure} onChange={store.setStructure} />}
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-1 pt-1">
          <button
            type="button"
            className="btn-chrome min-h-[60px] w-full text-[18px]"
            disabled={!canGenerate}
            onClick={() => void store.generate("nouvelle")}
            aria-describedby="generer-aide"
            data-action="generer"
          >
            Générer
          </button>
          <div className="flex min-h-11 items-center justify-between gap-3">
            <p id="generer-aide" className="text-[12px] leading-snug text-mute" role="status">
              {hint}
            </p>
            <button
              type="button"
              className="min-h-11 shrink-0 px-1 text-[13px] font-bold text-soft underline decoration-white/30 underline-offset-4 hover:text-white disabled:opacity-50"
              onClick={() => void store.openExample()}
              disabled={exampleLoading || !!imports}
            >
              {exampleLoading ? "Chargement…" : "Voir un exemple"}
            </button>
          </div>
        </div>
      </main>

      {contextOpen && (
        <ContextSheet
          context={context}
          avatar={avatar}
          voiceCount={voice.length}
          onSave={store.setContext}
          onAvatar={store.setAvatar}
          onClearVoice={store.clearVoice}
          onClose={() => setContextOpen(false)}
        />
      )}
      {confirmNew && (
        <ConfirmSheet
          title="Nouvelle séquence ?"
          message="L’idée, le texte, les photos, le style et les dessins de la séquence en cours seront effacés de cet appareil. Ton contexte est conservé."
          confirmLabel="Tout effacer"
          danger
          onCancel={() => setConfirmNew(false)}
          onConfirm={() => {
            setConfirmNew(false);
            setIdeas({ status: "idle" });
            void store.newSequence();
          }}
        />
      )}
    </div>
  );
}

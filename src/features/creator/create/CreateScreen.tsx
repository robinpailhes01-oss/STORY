"use client";

import { useEffect, useRef, useState } from "react";
import { PHOTO_COUNT, type IdeaSuggestion } from "@/domain/story-plan";
import { getStructure, isStructureId } from "@/domain/structures";
import { requestIdeas, retryDelayLabel, type ApiFailure } from "../model/api";
import { IDEA_MAX, IDEA_MIN } from "../model/draft";
import { PhotoSlots } from "../photos/PhotoSlots";
import { useCreator, useStore } from "../use-creator";
import { IconChevronRight, IconSparkle, IconUser, IconWarning } from "../ui/icons";
import { AutoTextarea } from "../ui/AutoTextarea";
import { ConfirmSheet } from "../ui/Sheet";
import { ContextSheet } from "./ContextSheet";
import { StructurePicker } from "./StructurePicker";

type IdeasState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; ideas: IdeaSuggestion[] }
  | { status: "error"; error: ApiFailure };

export function CreateScreen() {
  const store = useStore();
  const state = useCreator();
  const { idea, mode, structure, context, history, notices, exampleLoading, imports } = state;
  const plan = history.present.plan;
  const [ideas, setIdeas] = useState<IdeasState>({ status: "idle" });
  const [seenHooks, setSeenHooks] = useState<string[]>([]);
  const [contextOpen, setContextOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const ideasAbort = useRef<AbortController | null>(null);
  const ideaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => ideasAbort.current?.abort(), []);

  const ideaLength = idea.trim().length;
  const canGenerate = ideaLength >= IDEA_MIN && !imports;
  const missingPhotos = history.present.photos.filter((p) => !p).length;

  const askIdeas = async () => {
    ideasAbort.current?.abort();
    const controller = new AbortController();
    ideasAbort.current = controller;
    setIdeas({ status: "loading" });
    const theme = mode === "idee" ? idea.trim().slice(0, 300) : "";
    const result = await requestIdeas({ context, theme, avoid: seenHooks.slice(-20) }, controller.signal);
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
    <div className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col px-4 pt-[max(env(safe-area-inset-top),12px)]" data-screen="create">
      <header className="flex h-14 items-center justify-between gap-3">
        <p className="text-[15px] font-extrabold tracking-[0.28em] text-white">STORY</p>
        <button type="button" className="btn-ghost min-h-11 px-4 text-sm" onClick={() => setContextOpen(true)}>
          <IconUser size={18} /> Mon contexte
        </button>
      </header>

      <main className="flex flex-1 flex-col gap-7 pt-4 pb-40">
        <section className="flex flex-col gap-2">
          <h1 className="text-[32px] leading-[1.08] font-extrabold tracking-tight text-white sm:text-[40px]">
            Une idée, 3 photos,
            <br />
            <span className="bg-gradient-to-r from-white via-[#d9dce3] to-[#e8b84b] bg-clip-text text-transparent">5 stories prêtes.</span>
          </h1>
          <p className="text-[15px] leading-relaxed text-mute">L’IA écrit la séquence, tu choisis le style et tu ajustes le texte.</p>
        </section>

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

        <section className="flex flex-col gap-3" aria-labelledby="photos-titre">
          <div>
            <h2 id="photos-titre" className="text-base font-bold text-white">
              Tes 3 photos
            </h2>
            <p className="mt-0.5 text-[13px] text-mute">De préférence verticales, avec le haut de l’image dégagé pour le texte.</p>
          </div>
          <PhotoSlots />
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="idee-titre">
          <div className="flex items-center justify-between gap-3">
            <h2 id="idee-titre" className="text-base font-bold text-white">
              <label htmlFor="idee">{mode === "texte" ? "Ton texte" : "Ton idée"}</label>
            </h2>
            <button
              type="button"
              onClick={askIdeas}
              disabled={ideas.status === "loading"}
              className="btn-ghost min-h-11 px-3.5 text-sm"
              aria-controls="idees"
            >
              <IconSparkle size={18} className={ideas.status === "loading" ? "spin" : ""} />
              {ideas.status === "loading" ? "Recherche…" : "Pas d’idée ?"}
            </button>
          </div>
          <div className="relative">
            <AutoTextarea
              id="idee"
              ref={ideaRef}
              value={idea}
              maxLength={IDEA_MAX}
              minRows={mode === "texte" ? 6 : 3}
              onChange={(e) => store.setIdea(e.target.value)}
              aria-describedby="idee-aide idee-compteur"
              placeholder={
                mode === "texte"
                  ? "Colle ici ton texte : il sera découpé en 5 stories, sans changer tes mots."
                  : "Ex. : les devis que mes clients oublient, et comment une simple relance les fait revenir."
              }
              className="field max-h-[60dvh] min-h-[112px] pb-7"
            />
            <span id="idee-compteur" className="pointer-events-none absolute right-3 bottom-2.5 text-[11px] text-mute tabular-nums">
              {idea.length} / {IDEA_MAX}
            </span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <p id="idee-aide" className="text-[13px] leading-snug text-mute">
              {mode === "texte"
                ? "On garde tes mots : l’IA découpe seulement en 5 stories et choisit les mots à mettre en valeur."
                : "Quelques phrases suffisent : le sujet, ce que tu veux faire comprendre."}
            </p>
            <label className="flex shrink-0 cursor-pointer items-center gap-2.5 py-1">
              <span className="text-[13px] font-bold text-soft">J’ai déjà mon texte</span>
              <button
                type="button"
                role="switch"
                aria-checked={mode === "texte"}
                aria-label="J’ai déjà mon texte"
                onClick={() => store.setMode(mode === "texte" ? "idee" : "texte")}
                className="flex h-11 w-[52px] shrink-0 items-center justify-center"
              >
                <span aria-hidden className={`relative block h-7 w-12 rounded-full transition ${mode === "texte" ? "bg-white" : "bg-white/15"}`}>
                  <span
                    className={`absolute top-1 left-1 size-5 rounded-full transition-transform ${
                      mode === "texte" ? "translate-x-5 bg-[#0b0d12]" : "bg-white"
                    }`}
                  />
                </span>
              </button>
            </label>
          </div>

          <div id="idees" aria-live="polite" className="flex flex-col gap-2 empty:hidden">
            {ideas.status === "loading" && <p className="text-sm text-mute">L’IA cherche 5 idées à partir de ton contexte…</p>}
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
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="structure-titre">
          <h2 id="structure-titre" className="text-base font-bold text-white">
            Structure
          </h2>
          <StructurePicker value={structure} onChange={store.setStructure} />
        </section>

      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-[#0a0c12] via-[#0a0c12]/95 to-transparent pt-8 pb-[max(env(safe-area-inset-bottom),14px)]">
        <div className="mx-auto flex max-w-[640px] flex-col gap-2 px-4">
          {canGenerate && missingPhotos > 0 && (
            <p className="text-center text-[12px] leading-snug text-amber-100/90" role="status">
              {missingPhotos === PHOTO_COUNT ? "Aucune photo :" : `${missingPhotos} photo${missingPhotos > 1 ? "s" : ""} manquante${missingPhotos > 1 ? "s" : ""} :`} les
              stories sans photo auront un fond sombre.
            </p>
          )}
          <button
            type="button"
            className="btn-chrome min-h-[54px] w-full text-[17px]"
            disabled={!canGenerate}
            onClick={() => void store.generate("nouvelle")}
            aria-describedby={canGenerate ? undefined : "generer-aide"}
            data-action="generer"
          >
            <IconSparkle size={20} /> Générer
          </button>
          <div className="flex min-h-11 items-center justify-between gap-3">
            <p id="generer-aide" className="text-[12px] leading-snug text-mute">
              {canGenerate ? "Environ une minute." : imports ? "Import des photos en cours…" : `Écris ton idée (${IDEA_MIN} caractères minimum).`}
            </p>
            <button
              type="button"
              className="min-h-11 shrink-0 px-1 text-sm font-bold text-soft underline decoration-white/30 underline-offset-4 hover:text-white disabled:opacity-50"
              onClick={() => void store.openExample()}
              disabled={exampleLoading || !!imports}
            >
              {exampleLoading ? "Chargement de l’exemple…" : "Voir un exemple"}
            </button>
          </div>
        </div>
      </div>

      {contextOpen && <ContextSheet context={context} onSave={store.setContext} onClose={() => setContextOpen(false)} />}
      {confirmNew && (
        <ConfirmSheet
          title="Nouvelle séquence ?"
          message="L’idée, le texte, les photos et le style de la séquence en cours seront effacés de cet appareil. Ton contexte est conservé."
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

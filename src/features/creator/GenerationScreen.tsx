"use client";

import { useEffect, useState } from "react";
import { retryDelayLabel } from "./model/api";
import { useCreator, useStore } from "./use-creator";
import { IconCheck, IconWarning } from "./ui/icons";

const STEPS = ["Lecture de ton idée", "Écriture", "Relecture", "Mise en page"] as const;
/** Avancée indicative tant que l’IA n’a pas répondu (le serveur ne donne pas d’étapes intermédiaires). */
const READ_UNTIL_MS = 2500;
const REVIEW_FROM_MS = 22_000;

export function GenerationScreen() {
  const store = useStore();
  const { generation } = useCreator();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  if (!generation) return null;
  const elapsed = Math.max(0, now - generation.startedAt);
  const current =
    generation.step === "mise-en-page" ? 3 : generation.step === "erreur" ? -1 : elapsed < READ_UNTIL_MS ? 0 : elapsed < REVIEW_FROM_MS ? 1 : 2;
  const error = generation.error;
  const refaire = generation.kind === "refaire";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col items-center justify-center gap-8 px-6 py-[max(env(safe-area-inset-top),24px)]" data-screen="generation">
      {!error ? (
        <>
          <div className="relative size-24" aria-hidden>
            <div className="absolute inset-0 rounded-full border-2 border-white/10" />
            <div className="spin absolute inset-0 rounded-full border-2 border-transparent border-t-white border-r-white/40" />
            <div className="absolute inset-[30%] rounded-full bg-gradient-to-br from-white to-[#9aa1ad] opacity-90 blur-[1px]" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-extrabold text-white">{refaire ? "Nouvelle version en cours" : "Tes stories s’écrivent"}</h1>
            <p className="mt-2 text-sm text-mute">Ça peut prendre jusqu’à une minute et demie.</p>
          </div>
          <ol className="flex w-full max-w-[320px] flex-col gap-3" aria-label="Étapes de la génération">
            {STEPS.map((label, i) => {
              const done = i < current;
              const active = i === current;
              return (
                <li key={label} className="flex items-center gap-3" aria-current={active ? "step" : undefined}>
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
                      done ? "bg-white text-[#0b0d12]" : active ? "border-2 border-white/80" : "border border-white/20"
                    }`}
                  >
                    {done ? <IconCheck size={16} /> : active ? <span className="spin block size-3 rounded-full border-2 border-white border-t-transparent" /> : null}
                  </span>
                  <span className={`text-[15px] ${done ? "text-soft" : active ? "font-bold text-white" : "text-mute"}`}>{label}</span>
                </li>
              );
            })}
          </ol>
          <p className="sr-only" aria-live="polite">
            {current >= 0 ? `Étape ${current + 1} sur 4 : ${STEPS[current as 0 | 1 | 2 | 3]}` : ""}
          </p>
          <p className="text-xs text-mute tabular-nums" aria-hidden>
            {Math.floor(elapsed / 1000)} s
          </p>
          <button type="button" onClick={store.cancelGeneration} className="btn-ghost min-w-[160px]">
            Annuler
          </button>
        </>
      ) : (
        <div role="alert" className="flex w-full flex-col items-center gap-5 text-center" data-error-code={error.code}>
          <span className="flex size-14 items-center justify-center rounded-full bg-amber-300/15 text-amber-200">
            <IconWarning size={28} />
          </span>
          <div>
            <h1 className="text-xl font-extrabold text-white">La génération n’a pas abouti</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-soft" data-testid="generation-error">
              {error.message}
            </p>
            {error.retryAfterSec !== undefined && (
              <p className="mt-2 text-sm font-bold text-amber-100">Tu pourras réessayer dans {retryDelayLabel(error.retryAfterSec)}.</p>
            )}
          </div>
          <div className="flex w-full max-w-[340px] flex-col gap-2.5">
            {error.code === "cle_absente" ? (
              <button type="button" className="btn-chrome" onClick={() => void store.openExample()}>
                Essayer avec l’exemple
              </button>
            ) : (
              <button type="button" className="btn-chrome" onClick={() => void store.generate(generation.kind)} disabled={error.retryAfterSec !== undefined}>
                Réessayer
              </button>
            )}
            <button type="button" className="btn-ghost" onClick={store.cancelGeneration}>
              {refaire ? "Revenir à l’éditeur" : "Revenir à mon idée"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

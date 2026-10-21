"use client";

import { useEffect, useState } from "react";
import { retryDelayLabel } from "./model/api";
import { useCreator, useStore } from "./use-creator";
import { IconWarning } from "./ui/icons";
import { Logo } from "./ui/Logo";

/**
 * Avancée estimée tant que l’IA n’a pas répondu (le serveur ne donne pas d’étapes) : courbe qui atteint
 * ≈ 83 % à 16 s et ≈ 94 % à 25 s, plafonnée à 95 % jusqu’à la réponse ; 100 % à la réponse.
 */
export const PROGRESS_TAU_MS = 9000;
export const PROGRESS_CAP = 95;
export function estimatedProgress(elapsedMs: number): number {
  return Math.min(PROGRESS_CAP, Math.floor(100 * (1 - Math.exp(-Math.max(0, elapsedMs) / PROGRESS_TAU_MS))));
}

/** Écran noir, notre logo en grand, une barre fine et le pourcentage (comme la référence). */
export function GenerationScreen() {
  const store = useStore();
  const { generation } = useCreator();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);

  if (!generation) return null;
  const error = generation.error;
  const refaire = generation.kind === "refaire";
  const percent = generation.step === "mise-en-page" ? 100 : estimatedProgress(now - generation.startedAt);
  const quarter = Math.min(4, Math.floor(percent / 25));

  return (
    <div
      className="flex min-h-dvh w-full flex-col items-center justify-center bg-[#0b0b0c] px-8 pt-[env(safe-area-inset-top)] pb-[max(env(safe-area-inset-bottom),24px)]"
      data-screen="generation"
    >
      {!error ? (
        <div className="flex w-full max-w-[420px] flex-col items-center">
          <Logo size={92} className="text-[#f2f2f0]" />
          <div className="mt-10 flex w-full items-center gap-5">
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/12"
              role="progressbar"
              aria-label={refaire ? "Nouvelle version de ta séquence" : "Écriture de ta séquence"}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-valuetext={`${percent} %`}
              data-testid="progression"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-white/45 to-white/90 transition-[width] duration-300 ease-out"
                style={{ width: `${Math.max(2, percent)}%` }}
              />
            </div>
            <span className="w-12 text-right font-mono text-[13px] text-white/55 tabular-nums" aria-hidden data-testid="pourcentage">
              {percent} %
            </span>
          </div>
          <p className="sr-only" aria-live="polite">
            {quarter === 0 ? (refaire ? "Nouvelle version en cours." : "Écriture de tes 5 stories en cours.") : `${quarter * 25} % environ.`}
          </p>
          {generation.notice && (
            <p className="mt-6 text-center text-[13px] leading-snug text-amber-100/90" role="status" data-testid="generation-notice">
              {generation.notice}
            </p>
          )}
          <button type="button" onClick={store.cancelGeneration} className="mt-14 min-h-11 px-4 text-[14px] text-white/45 underline-offset-4 hover:text-white/80 hover:underline">
            Annuler
          </button>
        </div>
      ) : (
        <div role="alert" className="flex w-full max-w-[400px] flex-col items-center gap-5 text-center" data-error-code={error.code}>
          <Logo size={56} className="text-white/80" />
          <span className="flex size-12 items-center justify-center rounded-full bg-amber-300/15 text-amber-200">
            <IconWarning size={24} />
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
              {refaire ? "Revenir à l’éditeur" : "Revenir à mes photos"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

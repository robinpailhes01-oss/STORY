"use client";

import type { ControlIssue } from "@/domain/story-plan";
import { IconNote, IconWarning } from "../ui/icons";
import { Sheet } from "../ui/Sheet";

export interface Remarks {
  /** Contrôles de l’IA au moment de la génération. */
  controls: ControlIssue[];
  /** Bloquent l’export. */
  problems: string[];
  warnings: string[];
}

export const remarksCount = (r: Remarks) => r.controls.length + r.problems.length + r.warnings.length;

export function RemarksSheet({ remarks, onClose, onGoToStory }: { remarks: Remarks; onClose: () => void; onGoToStory: (index: number) => void }) {
  const bloquants = remarks.controls.filter((c) => c.severity !== "conseil");
  const conseils = remarks.controls.filter((c) => c.severity === "conseil");
  return (
    <Sheet title="Remarques" subtitle={remarksCount(remarks) === 0 ? "Rien à signaler." : undefined} onClose={onClose} testId="remarques">
      <div className="flex flex-col gap-6">
        {remarks.problems.length > 0 && (
          <section aria-labelledby="rq-problemes" className="flex flex-col gap-2">
            <h3 id="rq-problemes" className="text-sm font-bold text-red-200">
              À corriger avant l’export
            </h3>
            <p className="text-[13px] text-mute">L’export est bloqué tant que ces problèmes restent : raccourcis le texte concerné (panneau Texte) ou change de style.</p>
            <ul className="flex flex-col gap-2">
              {remarks.problems.map((p, i) => (
                <Item key={i} tone="danger" text={p} />
              ))}
            </ul>
          </section>
        )}

        {remarks.warnings.length > 0 && (
          <section aria-labelledby="rq-mise-en-page" className="flex flex-col gap-2">
            <h3 id="rq-mise-en-page" className="text-sm font-bold text-white">
              Mise en page
            </h3>
            <ul className="flex flex-col gap-2">
              {remarks.warnings.map((w, i) => (
                <Item key={i} tone="warning" text={w} />
              ))}
            </ul>
          </section>
        )}

        {remarks.controls.length > 0 && (
          <section aria-labelledby="rq-ia" className="flex flex-col gap-2">
            <h3 id="rq-ia" className="text-sm font-bold text-white">
              Relecture de l’IA
            </h3>
            <p className="text-[13px] text-mute">Ces remarques datent de la génération : elles ne tiennent pas compte de tes modifications.</p>
            <ul className="flex flex-col gap-2">
              {[...bloquants, ...conseils].map((c, i) => (
                <li key={i}>
                  <button
                    type="button"
                    disabled={c.story === null}
                    onClick={() => c.story !== null && onGoToStory(c.story)}
                    className="flex w-full items-start gap-2.5 rounded-2xl bg-white/[0.04] p-3 text-left text-[13px] leading-snug text-soft enabled:hover:bg-white/[0.07]"
                  >
                    <span
                      className={`mt-px shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wide uppercase ${
                        c.severity === "conseil" ? "bg-white/10 text-soft" : "bg-amber-300/20 text-amber-100"
                      }`}
                    >
                      {c.severity === "conseil" ? "Conseil" : "À revoir"}
                    </span>
                    <span>
                      <span className="font-bold text-white">{c.story === null ? "Séquence" : `Story ${c.story + 1}`} : </span>
                      {c.message}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {remarksCount(remarks) === 0 && <p className="text-sm text-soft">Aucun problème de mise en page, aucune remarque de l’IA.</p>}
      </div>
    </Sheet>
  );
}

function Item({ text, tone }: { text: string; tone: "danger" | "warning" }) {
  return (
    <li
      className={`flex items-start gap-2.5 rounded-2xl p-3 text-[13px] leading-snug ${
        tone === "danger" ? "border border-red-400/30 bg-red-500/10 text-red-100" : "bg-white/[0.04] text-soft"
      }`}
    >
      {tone === "danger" ? <IconWarning size={16} className="mt-px shrink-0" /> : <IconNote size={16} className="mt-px shrink-0 text-amber-200" />}
      <span>{text}</span>
    </li>
  );
}

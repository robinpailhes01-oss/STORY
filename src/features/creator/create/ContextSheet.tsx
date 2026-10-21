"use client";

import { useState } from "react";
import { DEFAULT_CONTEXT } from "@/domain/example-plan";
import { BrandContextSchema, type BrandContext } from "@/domain/story-plan";
import { Sheet } from "../ui/Sheet";

interface Props {
  context: BrandContext;
  onSave: (context: BrandContext) => boolean;
  onClose: () => void;
}

const FIELDS: Array<{ key: "name" | "activity" | "offer" | "target" | "cta" | "tone"; label: string; hint: string; multiline?: boolean }> = [
  { key: "activity", label: "Ton activité", hint: "Qui tu es, ce que tu fais.", multiline: true },
  { key: "offer", label: "Ton offre", hint: "Ce que tu vends, comment ça se passe.", multiline: true },
  { key: "target", label: "Ta cible", hint: "Ton client idéal : qui, sa situation, ce qu’il veut.", multiline: true },
  { key: "cta", label: "Ton appel à l’action", hint: "La dernière phrase de la séquence (« audit offert », « réponds AUDIT »…)." },
  { key: "tone", label: "Ton ton", hint: "Tutoiement, expressions, emojis ou non." },
  { key: "name", label: "Ton nom ou ta marque", hint: "Facultatif." },
];

const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** « Mon contexte » : envoyé avec chaque génération et chaque demande d’idées. */
export function ContextSheet({ context, onSave, onClose }: Props) {
  const [form, setForm] = useState(() => ({
    ...context,
    proofsText: context.proofs.join("\n"),
    forbiddenText: context.forbidden.join("\n"),
  }));
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setError(null);
  };

  const save = () => {
    const { proofsText, forbiddenText, ...rest } = form;
    const parsed = BrandContextSchema.safeParse({ ...rest, proofs: lines(proofsText), forbidden: lines(forbiddenText) });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = String(issue.path[0]);
      const label =
        field === "proofs" ? "Preuves" : field === "forbidden" ? "Mots interdits" : (FIELDS.find((f) => f.key === field)?.label ?? field);
      const detail =
        issue.code === "too_big"
          ? issue.origin === "array"
            ? `${issue.maximum} lignes au plus`
            : `${issue.maximum} caractères au plus${issue.path.length > 1 ? " par ligne" : ""}`
          : "valeur invalide";
      setError(`${label} : ${detail}.`);
      return;
    }
    if (!onSave(parsed.data)) {
      setError("Ton contexte est utilisé pour cette visite, mais il n’a pas pu être enregistré sur cet appareil (stockage bloqué).");
      return;
    }
    onClose();
  };

  const reset = () => {
    setForm({ ...DEFAULT_CONTEXT, proofsText: DEFAULT_CONTEXT.proofs.join("\n"), forbiddenText: DEFAULT_CONTEXT.forbidden.join("\n") });
    setError(null);
  };

  return (
    <Sheet
      title="Mon contexte"
      subtitle="Envoyé avec chaque génération et chaque idée. Enregistré sur cet appareil."
      onClose={onClose}
      testId="context-sheet"
      footer={
        <div className="flex gap-3">
          <button type="button" onClick={reset} className="btn-ghost">
            Réinitialiser
          </button>
          <button type="button" onClick={save} className="btn-chrome flex-1">
            Enregistrer
          </button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-white">{f.label}</span>
            <span className="text-xs text-mute">{f.hint}</span>
            {f.multiline ? (
              <textarea
                className="field min-h-[76px] resize-y"
                rows={2}
                maxLength={400}
                value={form[f.key]}
                onChange={(e) => update({ [f.key]: e.target.value })}
              />
            ) : (
              <input className="field" maxLength={400} value={form[f.key]} onChange={(e) => update({ [f.key]: e.target.value })} />
            )}
          </label>
        ))}
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-white">Tes preuves réelles</span>
          <span className="text-xs text-mute">Une par ligne : témoignages, chiffres, résultats vérifiables.</span>
          <textarea
            className="field min-h-[88px] resize-y"
            rows={3}
            value={form.proofsText}
            onChange={(e) => update({ proofsText: e.target.value })}
            placeholder="« J’ai gagné 4 h par semaine » — Julie, fleuriste"
          />
          <span className="flex items-start gap-1.5 text-xs font-bold text-or">Aucune preuve = aucun chiffre ni témoignage inventé.</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-white">Mots interdits</span>
          <span className="text-xs text-mute">Un mot ou une tournure par ligne.</span>
          <textarea
            className="field min-h-[88px] resize-y"
            rows={3}
            value={form.forbiddenText}
            onChange={(e) => update({ forbiddenText: e.target.value })}
          />
        </label>
        {error && (
          <p role="alert" className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}

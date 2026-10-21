"use client";

import { useRef, useState } from "react";
import { DEFAULT_CONTEXT } from "@/domain/example-plan";
import { BrandContextSchema, proofId, type BrandContext } from "@/domain/story-plan";
import { isPhotoImportError } from "@/lib/photos";
import { makeAvatar } from "../profile/avatar";
import { Avatar } from "../profile/ProfileCard";
import { AutoTextarea } from "../ui/AutoTextarea";
import { Sheet } from "../ui/Sheet";

interface Props {
  context: BrandContext;
  avatar: string | null;
  /** Séquences exportées gardées comme exemples de ta voix. */
  voiceCount: number;
  onSave: (context: BrandContext) => boolean;
  onAvatar: (avatar: string | null) => boolean;
  onClearVoice: () => void;
  onClose: () => void;
}

type FieldKey = "name" | "handle" | "bio" | "activity" | "offer" | "target" | "cta" | "tone";

const PROFILE_FIELDS: Array<{ key: FieldKey; label: string; hint: string; max: number; prefix?: string }> = [
  { key: "name", label: "Ton prénom ou ta marque", hint: "Affiché sur ta carte profil.", max: 400 },
  { key: "handle", label: "Ton identifiant Instagram", hint: "Sans le @.", max: 60, prefix: "@" },
  { key: "bio", label: "Ta bio courte", hint: "Une ligne, comme sur ton profil.", max: 400 },
];

const FIELDS: Array<{ key: FieldKey; label: string; hint: string; multiline?: boolean }> = [
  { key: "activity", label: "Ton activité", hint: "Qui tu es, ce que tu fais (s’affiche dans « Voir la bio »).", multiline: true },
  { key: "offer", label: "Ton offre", hint: "Ce que tu vends, comment ça se passe.", multiline: true },
  { key: "target", label: "Ta cible", hint: "Ton client idéal : qui, sa situation, ce qu’il veut.", multiline: true },
  { key: "cta", label: "Ton appel à l’action", hint: "La dernière phrase de la séquence (« audit offert », « réponds AUDIT »…)." },
  { key: "tone", label: "Ton ton", hint: "Tutoiement, expressions, emojis ou non." },
];

const LABELS: Record<string, string> = Object.fromEntries([...PROFILE_FIELDS, ...FIELDS].map((f) => [f.key, f.label]));

const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** « Mon contexte » : profil (carte), activité, preuves… envoyé avec chaque génération et chaque idée. */
export function ContextSheet({ context, avatar, voiceCount, onSave, onAvatar, onClearVoice, onClose }: Props) {
  const [form, setForm] = useState(() => ({
    ...context,
    proofsText: context.proofs.join("\n"),
    forbiddenText: context.forbidden.join("\n"),
  }));
  const [avatarDraft, setAvatarDraft] = useState(avatar);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setError(null);
  };

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return;
    setAvatarBusy(true);
    setError(null);
    try {
      setAvatarDraft(await makeAvatar(file));
    } catch (e) {
      setError(isPhotoImportError(e) ? `Photo de profil : ${e.message}` : "Photo de profil : cette image n’a pas pu être lue.");
    } finally {
      setAvatarBusy(false);
    }
  };

  const save = () => {
    const { proofsText, forbiddenText, ...rest } = form;
    const parsed = BrandContextSchema.safeParse({ ...rest, handle: rest.handle.replace(/^@+/, ""), proofs: lines(proofsText), forbidden: lines(forbiddenText) });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = String(issue.path[0]);
      const label = field === "proofs" ? "Preuves" : field === "forbidden" ? "Mots interdits" : (LABELS[field] ?? field);
      const detail =
        issue.code === "too_big"
          ? issue.origin === "array"
            ? `${issue.maximum} lignes au plus`
            : `${issue.maximum} caractères au plus${issue.path.length > 1 ? " par ligne" : ""}`
          : "valeur invalide";
      setError(`${label} : ${detail}.`);
      return;
    }
    const savedAvatar = avatarDraft === avatar || onAvatar(avatarDraft);
    if (!onSave(parsed.data) || !savedAvatar) {
      setError("Ton contexte est utilisé pour cette visite, mais il n’a pas pu être enregistré sur cet appareil (stockage bloqué ou plein).");
      return;
    }
    onClose();
  };

  const reset = () => {
    setForm({ ...DEFAULT_CONTEXT, proofsText: DEFAULT_CONTEXT.proofs.join("\n"), forbiddenText: DEFAULT_CONTEXT.forbidden.join("\n") });
    setError(null);
  };

  const proofs = lines(form.proofsText);

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
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <fieldset className="flex flex-col gap-4">
          <legend className="panel-title mb-3">Ton profil</legend>
          <div className="flex items-center gap-4">
            <Avatar src={avatarDraft} size={64} />
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-sm font-bold text-white">Photo de profil</span>
              <span className="text-xs text-mute">Gardée sur cet appareil, jamais envoyée.</span>
              <span className="flex gap-1">
                <button type="button" className="-ml-1 min-h-11 px-1 text-sm font-bold text-soft underline underline-offset-4" onClick={() => avatarInput.current?.click()} disabled={avatarBusy}>
                  {avatarBusy ? "Préparation…" : avatarDraft ? "Changer" : "Choisir une photo"}
                </button>
                {avatarDraft && (
                  <button type="button" className="min-h-11 px-2 text-sm text-mute underline underline-offset-4" onClick={() => setAvatarDraft(null)}>
                    Retirer
                  </button>
                )}
              </span>
            </div>
            <input
              ref={avatarInput}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              data-testid="avatar-input"
              onChange={(e) => {
                void pickAvatar(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
          {PROFILE_FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1.5">
              <span className="text-sm font-bold text-white">{f.label}</span>
              <span className="text-xs text-mute">{f.hint}</span>
              <span className="relative">
                {f.prefix && <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-mute">{f.prefix}</span>}
                <input
                  className={`field ${f.prefix ? "pl-8" : ""}`}
                  maxLength={f.max}
                  value={form[f.key]}
                  onChange={(e) => update({ [f.key]: e.target.value })}
                  autoCapitalize={f.key === "handle" ? "none" : undefined}
                  autoCorrect={f.key === "handle" ? "off" : undefined}
                />
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="panel-title mb-3">Ton activité</legend>
          {FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1.5">
              <span className="text-sm font-bold text-white">{f.label}</span>
              <span className="text-xs text-mute">{f.hint}</span>
              {f.multiline ? (
                <AutoTextarea className="field" minRows={1} maxLength={400} value={form[f.key]} onChange={(e) => update({ [f.key]: e.target.value })} />
              ) : (
                <input className="field" maxLength={400} value={form[f.key]} onChange={(e) => update({ [f.key]: e.target.value })} />
              )}
            </label>
          ))}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-white">Tes preuves réelles</span>
            <span className="text-xs text-mute">Une par ligne : témoignages, chiffres, résultats vérifiables.</span>
            <AutoTextarea
              className="field"
              minRows={2}
              value={form.proofsText}
              onChange={(e) => update({ proofsText: e.target.value })}
              placeholder="« J’ai gagné 4 h par semaine » — Julie, fleuriste"
              aria-describedby="preuves-liste preuves-regle"
            />
          </label>
          {proofs.length > 0 && (
            <ol id="preuves-liste" className="flex flex-col gap-1.5" aria-label="Tes preuves et leur identifiant" data-testid="preuves">
              {proofs.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-xs leading-snug text-soft">
                  <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-white">{proofId(i)}</span>
                  <span className="line-clamp-2">{p}</span>
                </li>
              ))}
            </ol>
          )}
          <p id="preuves-regle" className="text-xs leading-snug font-bold text-or">
            Un chiffre n’est cité que s’il figure dans une de tes preuves (p1, p2…). Aucune preuve = aucun chiffre ni témoignage inventé.
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-white">Mots interdits</span>
            <span className="text-xs text-mute">Un mot ou une tournure par ligne.</span>
            <AutoTextarea className="field" minRows={2} value={form.forbiddenText} onChange={(e) => update({ forbiddenText: e.target.value })} />
          </label>
        </fieldset>

        <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-3.5 py-1.5" data-testid="voix">
          <p className="py-2 text-xs leading-snug text-mute">
            {voiceCount === 0
              ? "Tes prochaines séquences exportées serviront d’exemples de ta voix."
              : `${voiceCount} séquence${voiceCount > 1 ? "s" : ""} exportée${voiceCount > 1 ? "s" : ""} ${voiceCount > 1 ? "servent" : "sert"} d’exemple${voiceCount > 1 ? "s" : ""} de ta voix.`}
          </p>
          {voiceCount > 0 && (
            <button type="button" className="min-h-11 shrink-0 px-1 text-xs font-bold text-soft underline underline-offset-4" onClick={onClearVoice}>
              Effacer
            </button>
          )}
        </div>

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

"use client";

import { useState } from "react";
import { SEQUENCE_LAYOUT, type StoryPlan } from "@/domain/story-plan";
import { MAX_ACCENTS_PER_STORY, MAX_PARAGRAPH_LENGTH, storyFromMarkup, toMarkup } from "../model/accent-markup";
import { useStore } from "../use-creator";
import { AutoTextarea } from "../ui/AutoTextarea";
import { IconPlus, IconTrash, IconWarning } from "../ui/icons";

const MAX_PARAGRAPHS = 4;

interface Props {
  plan: StoryPlan;
  storyIndex: number;
}

/**
 * Les paragraphes de la story courante, un champ par paragraphe. Les mots mis en valeur s’écrivent entre
 * astérisques ; chaque modification est appliquée aussitôt (aperçu en direct, une étape d’annulation par
 * saisie). Monté avec une clé qui change quand le plan est remplacé ailleurs (annuler, nouvelle version).
 */
export function TextPanel({ plan, storyIndex }: Props) {
  const store = useStore();
  const [fields, setFields] = useState(() => plan.stories[storyIndex].paragraphs.map(toMarkup));
  const continues = SEQUENCE_LAYOUT[storyIndex].continues;
  const previous = continues ? plan.stories[storyIndex - 1].paragraphs : [];
  const parsed = storyFromMarkup(fields);

  const apply = (next: string[], field?: number) => {
    setFields(next);
    const result = storyFromMarkup(next);
    if (result.paragraphs.length) store.setStoryParagraphs(storyIndex, result.paragraphs, field);
  };

  return (
    <div className="flex flex-col gap-4" data-testid="texte">
      <p className="text-[13px] leading-snug text-mute">
        Entoure d’astérisques les mots à mettre en valeur : <span className="font-bold text-soft">Ça te fait *gagner du temps.*</span> ({MAX_ACCENTS_PER_STORY} au
        maximum par story).
      </p>

      {continues && previous.length > 0 && (
        <section aria-label={`Repris de la story ${storyIndex}`} className="flex flex-col gap-2 rounded-2xl border border-white/8 bg-white/[0.02] p-3">
          <p className="text-xs font-bold text-mute">Repris de la story {storyIndex}, modifie-les là-bas :</p>
          {previous.map((p, i) => (
            <p key={i} className="text-sm leading-snug text-white/40" aria-readonly>
              {p.text}
            </p>
          ))}
          <button type="button" className="min-h-11 self-start text-xs font-bold text-soft underline underline-offset-2" onClick={() => store.setStoryIndex(storyIndex - 1)}>
            Aller à la story {storyIndex}
          </button>
        </section>
      )}

      <ol className="flex flex-col gap-3">
        {fields.map((value, i) => {
          const id = `paragraphe-${storyIndex}-${i}`;
          const empty = parsed.empty.includes(i);
          const unbalanced = parsed.unbalanced.includes(i);
          return (
            <li key={i} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor={id} className="text-xs font-bold text-soft">
                  Paragraphe {i + 1}
                </label>
                <button
                  type="button"
                  className="icon-btn size-11 text-mute"
                  disabled={fields.length <= 1}
                  aria-label={`Supprimer le paragraphe ${i + 1}`}
                  onClick={() => apply(fields.filter((_, k) => k !== i))}
                >
                  <IconTrash size={18} />
                </button>
              </div>
              <AutoTextarea
                id={id}
                data-paragraph={i + 1}
                className="field text-[15px]"
                minRows={2}
                maxLength={MAX_PARAGRAPH_LENGTH + 20}
                value={value}
                onChange={(e) => apply(fields.map((f, k) => (k === i ? e.target.value : f)), i)}
                aria-invalid={empty || undefined}
                aria-describedby={empty || unbalanced ? `${id}-aide` : undefined}
              />
              {(empty || unbalanced) && (
                <p id={`${id}-aide`} className="flex items-start gap-1.5 text-xs text-amber-200">
                  <IconWarning size={14} className="mt-px shrink-0" />
                  {empty ? "Paragraphe vide : il n’apparaît pas. Écris-le ou supprime-le." : "Un astérisque n’a pas de partenaire : il est ignoré."}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <div aria-live="polite" className="empty:hidden">
        {parsed.dropped.length > 0 && (
          <p className="flex items-start gap-1.5 rounded-xl bg-amber-300/10 p-2.5 text-xs text-amber-100">
            <IconWarning size={14} className="mt-px shrink-0" />
            {MAX_ACCENTS_PER_STORY} mots mis en valeur au maximum par story : « {parsed.dropped.join(" », « ")} » ne {parsed.dropped.length > 1 ? "sont" : "est"} pas
            mis en valeur.
          </p>
        )}
      </div>

      <button
        type="button"
        className="btn-ghost self-start text-sm"
        disabled={fields.length >= MAX_PARAGRAPHS}
        onClick={() => setFields([...fields, ""])}
      >
        <IconPlus size={18} /> Ajouter un paragraphe
      </button>
    </div>
  );
}

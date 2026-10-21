"use client";

import { useCallback, useLayoutEffect, useRef, type Ref, type TextareaHTMLAttributes } from "react";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number; value: string; ref?: Ref<HTMLTextAreaElement> };

/** Champ de texte qui grandit avec son contenu : aucun texte caché derrière une barre de défilement. */
export function AutoTextarea({ minRows = 2, ref, style, ...props }: Props) {
  const node = useRef<HTMLTextAreaElement | null>(null);
  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      node.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );
  useLayoutEffect(() => {
    const el = node.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
    el.style.overflowY = el.scrollHeight > el.clientHeight + 2 ? "auto" : "hidden";
  }, [props.value]);
  return <textarea ref={setRef} rows={minRows} {...props} style={{ ...style, resize: "none" }} />;
}

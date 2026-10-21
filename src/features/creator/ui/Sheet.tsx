"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconClose } from "./icons";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface SheetProps {
  title: string;
  /** Sous-titre facultatif sous le titre. */
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Pied fixe (boutons d’action). */
  footer?: ReactNode;
  /** Désactive la fermeture (pendant un export, par exemple). */
  locked?: boolean;
  testId?: string;
}

/**
 * Feuille modale qui monte du bas (centrée en fenêtre sur ordinateur) : fond assombri, Échap pour fermer,
 * focus gardé dans la feuille puis rendu au bouton d’origine.
 */
export function Sheet({ title, subtitle, onClose, children, footer, locked = false, testId }: SheetProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const lockedRef = useRef(locked);
  useEffect(() => {
    closeRef.current = onClose;
    lockedRef.current = locked;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = panel.current;
    const first = node?.querySelector<HTMLElement>("[data-autofocus]") ?? node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !lockedRef.current) {
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key === "Tab" && node) {
        const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const [head, tail] = [items[0], items[items.length - 1]];
        if (event.shiftKey && document.activeElement === head) {
          event.preventDefault();
          tail.focus();
        } else if (!event.shiftKey && document.activeElement === tail) {
          event.preventDefault();
          head.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Fermer"
        tabIndex={-1}
        onClick={() => !locked && onClose()}
        className="sheet-backdrop absolute inset-0 cursor-default bg-black/60 backdrop-blur-[2px]"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        className="sheet-up surface relative flex max-h-[88dvh] w-full max-w-[560px] flex-col rounded-t-[28px] pb-[env(safe-area-inset-bottom)] outline-none sm:rounded-[28px] sm:pb-0"
      >
        <div aria-hidden className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-white/20 sm:hidden" />
        <header className="flex shrink-0 items-start justify-between gap-3 px-5 pt-3 pb-2">
          <div className="min-w-0 pt-2">
            <h2 id={titleId} className="text-lg font-bold text-white">
              {title}
            </h2>
            {subtitle && <div className="mt-1 text-sm text-mute">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} disabled={locked} aria-label="Fermer" className="icon-btn -mr-2 shrink-0">
            <IconClose size={20} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        {footer && <div className="shrink-0 border-t border-white/8 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

interface ConfirmProps {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

/** Confirmation simple (Nouvelle séquence, Refaire). */
export function ConfirmSheet({ title, message, confirmLabel, onConfirm, onCancel, danger = false }: ConfirmProps) {
  return (
    <Sheet
      title={title}
      onClose={onCancel}
      footer={
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="btn-ghost flex-1">
            Annuler
          </button>
          <button type="button" data-autofocus onClick={onConfirm} className={`flex-1 ${danger ? "btn-danger" : "btn-chrome"}`}>
            {confirmLabel}
          </button>
        </div>
      }
    >
      <div className="text-[15px] leading-relaxed text-soft">{message}</div>
    </Sheet>
  );
}

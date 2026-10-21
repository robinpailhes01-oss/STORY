"use client";

import { useEffect, useRef, useState } from "react";
import { CANVAS_HEIGHT, CANVAS_WIDTH, type Slide } from "@/domain/story-document";
import type { ImageTable } from "@/features/renderer/images";
import { StoryPreview } from "@/features/renderer/StoryPreview";
import type { DocumentLayout } from "@/lib/layout/document-layout";
import { IconClose } from "../ui/icons";

/** Durée d’une story avant de passer à la suivante, comme sur Instagram. */
export const PRESENT_STORY_MS = 5000;

interface Props {
  slides: readonly Slide[];
  layout: DocumentLayout;
  images: ImageTable;
  cutouts: ImageTable;
  start: number;
  onClose: (lastIndex: number) => void;
}

function useWindowSize() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

/**
 * « Présenter » : plein écran noir, la story en grand, barres de progression en haut, toucher à droite pour
 * avancer et à gauche pour reculer, avance automatique toutes les 5 s, ✕ (ou Échap) pour sortir.
 */
export function Presenter({ slides, layout, images, cutouts, start, onClose }: Props) {
  const [index, setIndex] = useState(start);
  const [progress, setProgress] = useState(0);
  const startedAt = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const { w, h } = useWindowSize();
  const count = slides.length;

  useEffect(() => {
    closeRef.current = onClose;
  });

  // Avance automatique : la barre de la story courante se remplit en PRESENT_STORY_MS.
  useEffect(() => {
    startedAt.current = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - startedAt.current) / PRESENT_STORY_MS);
      setProgress(p);
      if (p >= 1) {
        if (index < count - 1) setIndex(index + 1);
        else closeRef.current(index);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [index, count]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.focus({ preventScroll: true });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  const go = (delta: number) => {
    const next = index + delta;
    if (next < 0) {
      startedAt.current = performance.now(); // recommence la première
      return;
    }
    if (next >= count) closeRef.current(index);
    else setIndex(next);
  };

  const top = 44; // barres et ✕
  const width = Math.floor(Math.min(w, ((h - top) * CANVAS_WIDTH) / CANVAS_HEIGHT));
  const slide = slides[index];

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={`Présentation, story ${index + 1} sur ${count}`}
      tabIndex={-1}
      data-testid="presentation"
      data-index={index}
      className="fixed inset-0 z-[60] flex flex-col bg-black pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] outline-none"
      onKeyDown={(e) => {
        if (e.key === "Escape") closeRef.current(index);
        if (e.key === "ArrowRight" || e.key === " ") {
          e.preventDefault();
          go(1);
        }
        if (e.key === "ArrowLeft") go(-1);
      }}
    >
      <div className="relative mx-auto flex min-h-0 w-full flex-1 items-center justify-center" style={{ maxWidth: Math.max(width, 320) }}>
        <div className="relative overflow-hidden rounded-[14px]" style={{ width, height: (width * CANVAS_HEIGHT) / CANVAS_WIDTH }}>
          {slide && <StoryPreview slide={slide} layout={layout} images={images} cutouts={cutouts} displayWidth={width} showGuides={false} />}
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/45 to-transparent" aria-hidden />
          <div className="absolute inset-x-2.5 top-2.5 flex gap-1" aria-hidden>
            {slides.map((s, i) => (
              <span key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/35">
                <span className="block h-full bg-white" style={{ width: `${i < index ? 100 : i === index ? progress * 100 : 0}%` }} />
              </span>
            ))}
          </div>
          <button type="button" className="absolute top-0 left-0 h-full w-1/3" aria-label="Story précédente" onClick={() => go(-1)} data-action="presenter-precedente" />
          <button type="button" className="absolute top-0 right-0 h-full w-2/3" aria-label="Story suivante" onClick={() => go(1)} data-action="presenter-suivante" />
          <button
            type="button"
            className="absolute top-5 right-1.5 flex size-11 items-center justify-center text-white [filter:drop-shadow(0_1px_3px_rgba(0,0,0,0.6))]"
            aria-label="Quitter la présentation"
            onClick={() => closeRef.current(index)}
            data-action="presenter-fermer"
          >
            <IconClose size={24} />
          </button>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        Story {index + 1} sur {count}
      </p>
    </div>
  );
}

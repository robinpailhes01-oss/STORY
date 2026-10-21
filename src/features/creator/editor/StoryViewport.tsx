"use client";

import { useEffect, useRef, useState } from "react";
import { CANVAS_HEIGHT, CANVAS_WIDTH, type Slide } from "@/domain/story-document";
import type { ImageTable } from "@/features/renderer/images";
import { StoryPreview } from "@/features/renderer/StoryPreview";
import type { DocumentLayout } from "@/lib/layout/document-layout";
import { IconChevronLeft, IconChevronRight } from "../ui/icons";

const SWIPE_MIN_PX = 40;

interface Props {
  slide: Slide | null;
  layout: DocumentLayout | null;
  images: ImageTable;
  index: number;
  count: number;
  onChange: (index: number) => void;
  /** Flèches de part et d’autre de l’aperçu (ordinateur). */
  sideArrows?: boolean;
}

/** Grand aperçu de la story courante : tient en hauteur dans la place disponible, glisser pour changer. */
export function StoryViewport({ slide, layout, images, index, count, onChange, sideArrows = false }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) => (s && Math.abs(s.w - width) < 1 && Math.abs(s.h - height) < 1 ? s : { w: width, h: height }));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const width = size ? Math.max(120, Math.floor(Math.min(size.w, (size.h * CANVAS_WIDTH) / CANVAS_HEIGHT))) : 0;

  const go = (delta: number) => {
    const next = index + delta;
    if (next >= 0 && next < count) onChange(next);
  };

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center gap-3">
      {sideArrows && (
        <button type="button" className="icon-btn shrink-0" onClick={() => go(-1)} disabled={index === 0} aria-label="Story précédente">
          <IconChevronLeft />
        </button>
      )}
      <div ref={box} className="flex h-full min-h-0 min-w-0 flex-1 items-center justify-center">
        {slide && layout && width > 0 && (
          <div
            role="group"
            aria-roledescription="aperçu"
            aria-label={`Story ${index + 1} sur ${count}. Glisse ou utilise les flèches pour changer de story.`}
            tabIndex={0}
            data-testid="apercu"
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") go(-1);
              if (e.key === "ArrowRight") go(1);
            }}
            onPointerDown={(e) => {
              swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
            }}
            onPointerUp={(e) => {
              const start = swipe.current;
              swipe.current = null;
              if (!start || start.id !== e.pointerId) return;
              const dx = e.clientX - start.x;
              const dy = e.clientY - start.y;
              if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.2) go(dx < 0 ? 1 : -1);
            }}
            onPointerCancel={() => (swipe.current = null)}
            className="relative touch-pan-y overflow-hidden rounded-[18px] shadow-[0_18px_50px_rgba(0,0,0,0.55)] ring-1 ring-white/12 select-none"
            style={{ width, height: (width * CANVAS_HEIGHT) / CANVAS_WIDTH }}
          >
            <StoryPreview slide={slide} layout={layout} images={images} displayWidth={width} showGuides={false} />
          </div>
        )}
      </div>
      {sideArrows && (
        <button type="button" className="icon-btn shrink-0" onClick={() => go(1)} disabled={index === count - 1} aria-label="Story suivante">
          <IconChevronRight />
        </button>
      )}
    </div>
  );
}

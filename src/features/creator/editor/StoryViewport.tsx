"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CANVAS_HEIGHT, CANVAS_WIDTH, type Slide } from "@/domain/story-document";
import type { ImageTable } from "@/features/renderer/images";
import { StoryPreview } from "@/features/renderer/StoryPreview";
import type { DocumentLayout } from "@/lib/layout/document-layout";

const SWIPE_MIN_PX = 40;

interface Props {
  slide: Slide | null;
  layout: DocumentLayout | null;
  images: ImageTable;
  cutouts: ImageTable;
  index: number;
  count: number;
  onChange: (index: number) => void;
  /** Zoom d’affichage (1 = la story tient dans la place disponible) ; au-delà, l’aperçu défile. */
  zoom: number;
  /** Glisser pour changer de story (désactivé pendant le dessin). */
  swipe: boolean;
  /** Calque posé sur l’aperçu, à sa taille exacte (dessin du Crayon, réécriture en cours). */
  overlay?: ReactNode;
}

/** Grand aperçu de la story courante : tient en hauteur dans la place disponible, zoomable, glisser pour changer. */
export function StoryViewport({ slide, layout, images, cutouts, index, count, onChange, zoom, swipe, overlay }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const gesture = useRef<{ x: number; y: number; id: number } | null>(null);

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

  // Après un changement de zoom, l’aperçu agrandi est recentré dans la zone qui défile.
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    node.scrollLeft = (node.scrollWidth - node.clientWidth) / 2;
    node.scrollTop = (node.scrollHeight - node.clientHeight) / 2;
  }, [zoom]);

  const fit = size ? Math.max(120, Math.floor(Math.min(size.w, (size.h * CANVAS_WIDTH) / CANVAS_HEIGHT))) : 0;
  const width = Math.round(fit * zoom);
  const canSwipe = swipe && zoom <= 1;

  const go = (delta: number) => {
    const next = index + delta;
    if (next >= 0 && next < count) onChange(next);
  };

  return (
    <div className="relative min-h-0 min-w-0 flex-1">
      <div
        ref={box}
        className={`absolute inset-0 ${zoom > 1 ? "overflow-auto overscroll-contain" : "overflow-hidden"}`}
        data-testid="apercu-cadre"
      >
        <div className="flex min-h-full min-w-full">
          {slide && layout && width > 0 && (
            <div
              role="group"
              aria-roledescription="aperçu"
              aria-label={`Story ${index + 1} sur ${count}.${canSwipe ? " Glisse ou utilise les flèches pour changer de story." : ""}`}
              tabIndex={0}
              data-testid="apercu"
              data-zoom={zoom}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") go(-1);
                if (e.key === "ArrowRight") go(1);
              }}
              onPointerDown={(e) => {
                gesture.current = canSwipe ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
              }}
              onPointerUp={(e) => {
                const start = gesture.current;
                gesture.current = null;
                if (!start || start.id !== e.pointerId || !canSwipe) return;
                const dx = e.clientX - start.x;
                const dy = e.clientY - start.y;
                if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.2) go(dx < 0 ? 1 : -1);
              }}
              onPointerCancel={() => (gesture.current = null)}
              className={`relative m-auto shrink-0 overflow-hidden rounded-[18px] shadow-[0_18px_50px_rgba(0,0,0,0.55)] ring-1 ring-white/12 select-none ${
                canSwipe ? "touch-pan-y" : ""
              }`}
              style={{ width, height: (width * CANVAS_HEIGHT) / CANVAS_WIDTH }}
            >
              <StoryPreview slide={slide} layout={layout} images={images} cutouts={cutouts} displayWidth={width} showGuides={false} />
              {overlay}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

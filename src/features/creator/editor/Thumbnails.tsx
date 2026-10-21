"use client";

import type { Slide } from "@/domain/story-document";
import type { ImageTable } from "@/features/renderer/images";
import { StoryPreview } from "@/features/renderer/StoryPreview";
import type { DocumentLayout } from "@/lib/layout/document-layout";
import { IconChevronLeft, IconChevronRight } from "../ui/icons";

interface Props {
  slides: readonly Slide[];
  layout: DocumentLayout;
  images: ImageTable;
  index: number;
  onChange: (index: number) => void;
  width: number;
  arrows?: boolean;
}

/** Bandeau des 5 miniatures numérotées ; la story active est cerclée de blanc. */
export function Thumbnails({ slides, layout, images, index, onChange, width, arrows = true }: Props) {
  return (
    <nav aria-label="Stories" className="flex items-center justify-center gap-1">
      {arrows && (
        <button type="button" className="icon-btn shrink-0 text-mute" onClick={() => onChange(index - 1)} disabled={index === 0} aria-label="Story précédente">
          <IconChevronLeft size={20} />
        </button>
      )}
      <ol className="flex items-start gap-2">
        {slides.map((slide, i) => {
          const active = i === index;
          return (
            <li key={slide.id}>
              <button
                type="button"
                onClick={() => onChange(i)}
                aria-label={`Story ${i + 1}`}
                aria-current={active ? "true" : undefined}
                data-thumb={i + 1}
                className="flex min-w-11 flex-col items-center gap-1 rounded-xl p-0.5"
              >
                <span
                  className={`block overflow-hidden rounded-[9px] transition ${
                    active ? "ring-2 ring-white ring-offset-2 ring-offset-[#0a0c12]" : "opacity-75 ring-1 ring-white/15"
                  }`}
                  style={{ width, height: (width * 16) / 9 }}
                >
                  <StoryPreview slide={slide} layout={layout} images={images} displayWidth={width} showGuides={false} />
                </span>
                <span className={`text-xs font-bold tabular-nums ${active ? "text-white" : "text-mute"}`}>{i + 1}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {arrows && (
        <button
          type="button"
          className="icon-btn shrink-0 text-mute"
          onClick={() => onChange(index + 1)}
          disabled={index === slides.length - 1}
          aria-label="Story suivante"
        >
          <IconChevronRight size={20} />
        </button>
      )}
    </nav>
  );
}

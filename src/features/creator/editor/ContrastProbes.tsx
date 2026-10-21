"use client";

import type Konva from "konva";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { Slide, TextBlock } from "@/domain/story-document";
import { MIN_CONTRAST, sampleRects, textContrast } from "@/features/labo/contrast";
import type { ImageTable } from "@/features/renderer/images";
import { StoryPreview } from "@/features/renderer/StoryPreview";
import type { ComposeResult } from "@/lib/compose";
import type { DocumentLayout } from "@/lib/layout/document-layout";

const PROBE_WIDTH = 108; // 1080 / 10 : assez pour une moyenne de luminance sous chaque ligne
const DEBOUNCE_MS = 700;

export interface ContrastResult {
  composition: ComposeResult;
  /** Messages par story (index 0-4). */
  warnings: Array<{ story: number; message: string }>;
}

interface Target {
  composition: ComposeResult;
  layout: DocumentLayout;
  images: ImageTable;
}

/**
 * Mesure le contraste réel du texte sur le fond (photo, voile, grain) : chaque story est dessinée sans texte,
 * hors écran et en petit, puis la luminance moyenne sous chaque ligne est comparée à la couleur du texte.
 * Recalculé après une courte pause, pas à chaque frappe.
 */
export function ContrastProbes({
  composition,
  layout,
  images,
  onResult,
}: {
  composition: ComposeResult | null;
  layout: DocumentLayout | null;
  images: ImageTable;
  onResult: (result: ContrastResult) => void;
}) {
  const [target, setTarget] = useState<Target | null>(null);
  const results = useRef(new Map<string, Array<{ story: number; message: string }>>());

  useEffect(() => {
    if (!composition || !layout) return;
    const timer = setTimeout(() => {
      results.current = new Map();
      setTarget({ composition, layout, images });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [composition, layout, images]);

  const onSample = useCallback(
    (slideId: string, warnings: Array<{ story: number; message: string }>) => {
      if (!target) return;
      results.current.set(slideId, warnings);
      if (results.current.size === target.composition.document.slides.length) {
        onResult({ composition: target.composition, warnings: [...results.current.values()].flat() });
      }
    },
    [target, onResult],
  );

  if (!target) return null;
  return (
    <div aria-hidden style={{ position: "fixed", left: -10000, top: 0, width: 0, height: 0, overflow: "hidden" }}>
      {target.composition.document.slides.map((slide, index) => (
        <Probe key={slide.id} index={index} slide={slide} layout={target.layout} images={target.images} onSample={onSample} />
      ))}
    </div>
  );
}

const Probe = memo(function Probe({
  index,
  slide,
  layout,
  images,
  onSample,
}: {
  index: number;
  slide: Slide;
  layout: DocumentLayout;
  images: ImageTable;
  onSample: (slideId: string, warnings: Array<{ story: number; message: string }>) => void;
}) {
  const onStage = useCallback(
    (stage: Konva.Stage | null) => {
      if (!stage) return;
      const canvas = stage.toCanvas({ pixelRatio: 1 });
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const s = width / 1080;
      let worst: number | null = null;
      for (const block of slide.blocks.filter((b): b is TextBlock => b.kind === "text")) {
        const opacity = block.opacity ?? 1;
        if (opacity < 1 || block.marker?.kind === "bandeau") continue; // repris (grisé exprès) ou posé sur une bande
        const t = layout.texts.get(block.id);
        if (!t) continue;
        const rects = t.lines.map((l) => ({ x: (block.x + l.x) * s, y: (block.y + l.top) * s, width: l.width * s, height: t.lineHeightPx * s }));
        const ratio = textContrast(block.style.color, opacity, sampleRects(data, width, height, rects));
        worst = worst === null ? ratio : Math.min(worst, ratio);
      }
      const warnings =
        worst !== null && worst < MIN_CONTRAST
          ? [
              {
                story: index,
                message: `Story ${index + 1} : texte peu lisible sur la photo (contraste ${worst.toFixed(1).replace(".", ",")}:1, ${String(MIN_CONTRAST).replace(".", ",")}:1 conseillé). Essaie un autre cadrage, une photo plus sombre en haut, ou le style Bandeau.`,
              },
            ]
          : [];
      onSample(slide.id, warnings);
    },
    [index, slide, layout, onSample],
  );
  return <StoryPreview slide={slide} layout={layout} images={images} displayWidth={PROBE_WIDTH} showGuides={false} backgroundOnly onStage={onStage} />;
});

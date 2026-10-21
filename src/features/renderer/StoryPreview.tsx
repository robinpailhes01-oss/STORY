"use client";

import type Konva from "konva";
import { useEffect, useRef } from "react";
import { Layer, Stage } from "react-konva";
import { CANVAS_HEIGHT, CANVAS_WIDTH, type Slide } from "@/domain/story-document";
import type { DocumentLayout } from "@/lib/layout/document-layout";
import { StorySlide } from "./StorySlide";

interface StoryPreviewProps {
  slide: Slide;
  layout: DocumentLayout;
  /** Largeur affichée en px CSS ; le repère reste 1080 × 1920. */
  displayWidth: number;
  showGuides: boolean;
}

/** Aperçu réduit : même StorySlide que l’export, mis à l’échelle par la Stage. */
export function StoryPreview({ slide, layout, displayWidth, showGuides }: StoryPreviewProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const scale = displayWidth / CANVAS_WIDTH;

  // Redessin explicite quand la mise en page change (polices chargées, document modifié).
  useEffect(() => {
    stageRef.current?.batchDraw();
  }, [layout, showGuides]);

  return (
    <Stage
      ref={stageRef}
      width={displayWidth}
      height={CANVAS_HEIGHT * scale}
      scaleX={scale}
      scaleY={scale}
      listening={false}
    >
      <Layer listening={false}>
        <StorySlide slide={slide} layout={layout} showGuides={showGuides} />
      </Layer>
    </Stage>
  );
}

"use client";

import type Konva from "konva";
import { useEffect, useRef } from "react";
import { Layer, Stage } from "react-konva";
import { CANVAS_HEIGHT, CANVAS_WIDTH, type Slide } from "@/domain/story-document";
import type { DocumentLayout } from "@/lib/layout/document-layout";
import { StorySlide } from "./StorySlide";

interface ExportStageProps {
  slide: Slide;
  layout: DocumentLayout;
  /** Appelé une fois la story montée et dessinée, avec la Stage non réduite. */
  onReady: (stage: Konva.Stage) => void;
}

/**
 * Scène d’export hors écran, 1080 × 1920 à l’échelle 1, sans guides ni poignées.
 * Montée pour une story à la fois, puis démontée pour libérer le canvas.
 */
export function ExportStage({ slide, layout, onReady }: ExportStageProps) {
  const stageRef = useRef<Konva.Stage>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.draw();
    onReady(stage);
  }, [slide, layout, onReady]);

  return (
    <div aria-hidden style={{ position: "fixed", left: -10000, top: 0, width: 0, height: 0, overflow: "hidden" }}>
      <Stage ref={stageRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} listening={false}>
        <Layer listening={false}>
          <StorySlide slide={slide} layout={layout} showGuides={false} />
        </Layer>
      </Stage>
    </div>
  );
}

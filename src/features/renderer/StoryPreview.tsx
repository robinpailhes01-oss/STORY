"use client";

import type Konva from "konva";
import { memo, useEffect, useRef } from "react";
import { Layer, Stage } from "react-konva";
import { CANVAS_HEIGHT, CANVAS_WIDTH, type Slide } from "@/domain/story-document";
import type { DocumentLayout } from "@/lib/layout/document-layout";
import { EMPTY_IMAGES, type ImageTable } from "./images";
import { StorySlide } from "./StorySlide";

interface StoryPreviewProps {
  slide: Slide;
  layout: DocumentLayout;
  /** Largeur affichée en px CSS ; le repère reste 1080 × 1920. */
  displayWidth: number;
  showGuides: boolean;
  /** Images décodées par assetId (photos de fond). */
  images?: ImageTable;
  /** Détourages de la personne par assetId de photo (mot géant derrière la personne). */
  cutouts?: ImageTable;
  /** Fond seul, sans texte (mesure du contraste). */
  backgroundOnly?: boolean;
  /** Reçoit la Stage après chaque dessin (lecture des pixels, captures). */
  onStage?: (stage: Konva.Stage | null) => void;
}

/** Aperçu réduit : même StorySlide que l’export, mis à l’échelle par la Stage. */
function StoryPreviewStage({
  slide,
  layout,
  displayWidth,
  showGuides,
  images = EMPTY_IMAGES,
  cutouts = EMPTY_IMAGES,
  backgroundOnly = false,
  onStage,
}: StoryPreviewProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const scale = displayWidth / CANVAS_WIDTH;

  // Redessin explicite quand la mise en page change (polices chargées, document modifié, photos).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.batchDraw();
    onStage?.(stage);
  }, [layout, showGuides, images, cutouts, slide, onStage]);

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
        <StorySlide slide={slide} layout={layout} images={images} cutouts={cutouts} showGuides={showGuides} backgroundOnly={backgroundOnly} />
      </Layer>
    </Stage>
  );
}

export const StoryPreview = memo(StoryPreviewStage);

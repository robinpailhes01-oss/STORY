"use client";

import type Konva from "konva";
import { Group, Rect, Shape, Text } from "react-konva";
import { CANVAS_HEIGHT, CANVAS_WIDTH, blocksInDrawOrder, type Slide, type TextBlock } from "@/domain/story-document";
import type { DocumentLayout } from "@/lib/layout/document-layout";
import { applyFont, nativeLetterSpacing, type TextLayout } from "@/lib/layout/text-layout";

/**
 * Hauteurs masquées par l’interface Instagram : valeurs indicatives, à vérifier sur téléphone
 * (docs : « ne pas présenter une valeur arbitraire comme une règle de la plateforme »).
 */
export const SAFE_ZONE = { top: 250, bottom: 300 };

export const GUIDE_FONT = { family: "Inter", weight: 700 };
const GUIDE_LABELS = { top: "Zone masquée par Instagram (indicatif)", bottom: "Zone de réponse (indicatif)" };
export const GUIDE_TEXT = GUIDE_LABELS.top + GUIDE_LABELS.bottom;

function drawLines(ctx: CanvasRenderingContext2D, layout: TextLayout, color: string) {
  applyFont(ctx, layout.font, layout.letterSpacing);
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  for (const line of layout.lines) {
    if (nativeLetterSpacing || layout.letterSpacing === 0) {
      ctx.fillText(line.text, line.x, line.baseline);
      continue;
    }
    // Navigateur sans letterSpacing natif : caractère par caractère (perd le crénage).
    let x = line.x;
    for (const char of line.text) {
      ctx.fillText(char, x, line.baseline);
      x += ctx.measureText(char).width + layout.letterSpacing;
    }
  }
}

function TextLines({ block, layout }: { block: TextBlock; layout: TextLayout }) {
  return (
    <Shape
      x={block.x}
      y={block.y}
      width={block.width}
      height={block.height}
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(context: Konva.Context) => drawLines(context._context, layout, block.style.color)}
    />
  );
}

function SafeZoneGuides() {
  const common = { x: 0, width: CANVAS_WIDTH, fill: "#E5484D", opacity: 0.14, listening: false } as const;
  const label = { x: 24, fontFamily: GUIDE_FONT.family, fontStyle: String(GUIDE_FONT.weight), fontSize: 26, fill: "#B42318", listening: false };
  return (
    <Group name="guide">
      <Rect {...common} y={0} height={SAFE_ZONE.top} />
      <Rect {...common} y={CANVAS_HEIGHT - SAFE_ZONE.bottom} height={SAFE_ZONE.bottom} />
      <Text {...label} y={SAFE_ZONE.top - 40} text={GUIDE_LABELS.top} />
      <Text {...label} y={CANVAS_HEIGHT - SAFE_ZONE.bottom + 14} text={GUIDE_LABELS.bottom} />
    </Group>
  );
}

interface StorySlideProps {
  slide: Slide;
  layout: DocumentLayout;
  /** Aides visuelles de l’aperçu ; toujours false à l’export. */
  showGuides?: boolean;
}

/** Renderer unique : utilisé tel quel par l’aperçu et par l’export. */
export function StorySlide({ slide, layout, showGuides = false }: StorySlideProps) {
  const background = slide.background.kind === "solid" ? slide.background.color : "#000000";
  return (
    <>
      <Rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill={background} listening={false} />
      {blocksInDrawOrder(slide).map((block) => {
        if (block.kind === "shape") {
          return (
            <Rect
              key={block.id}
              x={block.x}
              y={block.y}
              width={block.width}
              height={block.height}
              fill={block.fill}
              opacity={block.opacity}
              cornerRadius={block.cornerRadius}
              listening={false}
            />
          );
        }
        if (block.kind === "text") {
          const textLayout = layout.texts.get(block.id);
          return textLayout ? <TextLines key={block.id} block={block} layout={textLayout} /> : null;
        }
        return null;
      })}
      {showGuides && <SafeZoneGuides />}
    </>
  );
}

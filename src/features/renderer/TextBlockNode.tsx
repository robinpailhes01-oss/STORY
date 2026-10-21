"use client";

import type Konva from "konva";
import { Group, Line, Rect, Shape } from "react-konva";
import type { Marker, MarkerKind, TextBlock } from "@/domain/story-document";
import { applyFont, nativeLetterSpacing, type LineSegment, type TextLayout } from "@/lib/layout/text-layout";
import { bandRect, handDrawnOval, pastilleRect, skewedPastillePoints, thinUnderlineRect, underlineRect } from "./markers";

/** Couleur du texte d’un segment selon le marquage de son accent. */
function segmentColor(kind: MarkerKind | null, marker: Marker | undefined, base: string): string {
  if (!marker || kind === null) return base;
  if (kind === "couleur") return marker.color;
  if (kind === "pastille" || kind === "bandeau") return marker.textColor ?? base;
  return base;
}

function drawSegments(
  ctx: CanvasRenderingContext2D,
  layout: TextLayout,
  keep: (segment: LineSegment) => boolean,
  color: (segment: LineSegment) => string,
) {
  applyFont(ctx, layout.font, layout.letterSpacing);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  for (const line of layout.lines) {
    for (const segment of line.segments) {
      if (!keep(segment)) continue;
      ctx.fillStyle = color(segment);
      if (nativeLetterSpacing || layout.letterSpacing === 0) {
        ctx.fillText(segment.text, segment.x, line.baseline);
        continue;
      }
      // Navigateur sans letterSpacing natif : caractère par caractère (perd le crénage).
      let x = segment.x;
      for (const char of segment.text) {
        ctx.fillText(char, x, line.baseline);
        x += ctx.measureText(char).width + layout.letterSpacing;
      }
    }
  }
}

/** Graine d’un tracé à la main : style (marquage + couleur), index global de l’accent, morceau, texte. */
function ovalSeed(marker: Marker, accentIndex: number, piece: number, text: string): string {
  return `${marker.kind}-${marker.color}-${(marker.rotationOffset ?? 0) + accentIndex}-${piece}-${text}`;
}

interface TextBlockNodeProps {
  block: TextBlock;
  layout: TextLayout;
}

/**
 * Un bloc de texte : bandeaux, marquages derrière le texte (souligné, pastille), texte segment par segment,
 * marquages devant (ovale, trait des accents sur bandeau). Même composant pour l’aperçu, l’export et les tuiles de style.
 */
export function TextBlockNode({ block, layout }: TextBlockNodeProps) {
  const { marker, style } = block;
  const fs = layout.fontSize;
  const kindOf = (segment: LineSegment) => (segment.accentIndex === null ? null : layout.accents.kinds[segment.accentIndex]);
  const onPastille = (segment: LineSegment) => kindOf(segment) === "pastille";
  const color = (segment: LineSegment) => segmentColor(kindOf(segment), marker, style.color);
  const shadow = style.shadow;
  const boxes = layout.accentBoxes;

  return (
    <Group x={block.x} y={block.y} opacity={block.opacity ?? 1} listening={false}>
      {marker?.kind === "bandeau" &&
        layout.lines
          .filter((line) => line.text.trim().length > 0)
          .map((line, i) => <Rect key={`band-${i}`} {...bandRect(line, fs)} fill={marker.color} listening={false} />)}

      {marker &&
        boxes.map((box) => {
          const key = `under-${box.accentIndex}-${box.piece}`;
          if (box.kind === "souligne") return <Rect key={key} {...underlineRect(box, fs)} fill={marker.color} listening={false} />;
          if (box.kind !== "pastille") return null;
          if (marker.skew) {
            return (
              <Line
                key={key}
                points={skewedPastillePoints(box, fs, marker.skew)}
                closed
                fill={marker.color}
                stroke={marker.color}
                strokeWidth={fs * 0.08}
                lineJoin="round"
                listening={false}
              />
            );
          }
          return <Rect key={key} {...pastilleRect(box, fs)} fill={marker.color} listening={false} />;
        })}

      <Shape
        listening={false}
        perfectDrawEnabled={false}
        shadowEnabled={Boolean(shadow)}
        shadowColor={shadow?.color}
        shadowBlur={shadow?.blur ?? 0}
        shadowOpacity={shadow?.opacity ?? 0}
        shadowOffset={{ x: 0, y: shadow?.offsetY ?? 0 }}
        sceneFunc={(context: Konva.Context) => drawSegments(context._context, layout, (s) => !onPastille(s), color)}
      />
      {boxes.some((b) => b.kind === "pastille") && (
        <Shape
          listening={false}
          perfectDrawEnabled={false}
          sceneFunc={(context: Konva.Context) => drawSegments(context._context, layout, onPastille, color)}
        />
      )}

      {marker &&
        boxes.map((box) => {
          const key = `over-${box.accentIndex}-${box.piece}`;
          if (box.kind === "cercle") {
            return (
              <Line
                key={key}
                points={handDrawnOval(box, fs, ovalSeed(marker, box.accentIndex, box.piece, box.text))}
                tension={0.4}
                stroke={marker.color}
                strokeWidth={fs * 0.09}
                lineCap="round"
                lineJoin="round"
                listening={false}
              />
            );
          }
          if (box.kind === "bandeau") {
            return <Rect key={key} {...thinUnderlineRect(box, fs)} fill={marker.textColor ?? style.color} listening={false} />;
          }
          return null;
        })}
    </Group>
  );
}

"use client";

import type Konva from "konva";
import type { ReactNode } from "react";
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

/** Échelle réelle du contexte (aperçu réduit, export, devicePixelRatio) : le flou d’ombre n’en dépend pas. */
export function contextScale(ctx: CanvasRenderingContext2D): number {
  const t = ctx.getTransform();
  return Math.hypot(t.a, t.b) || 1;
}

interface PaintOptions {
  keep: (segment: LineSegment) => boolean;
  color: (segment: LineSegment) => string;
  /** Lettres contourées : trait seul, sauf les segments pour lesquels `filled` est vrai. */
  outline?: { width: number; filled: (segment: LineSegment) => boolean };
}

/** Dessine les segments retenus, ligne par ligne, avec la police et l’interlettrage du bloc. */
export function drawSegments(ctx: CanvasRenderingContext2D, layout: TextLayout, { keep, color, outline }: PaintOptions) {
  applyFont(ctx, layout.font, layout.letterSpacing);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  if (outline) {
    ctx.lineWidth = outline.width;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
  }
  const paint = (segment: LineSegment, text: string, x: number, y: number) => {
    const c = color(segment);
    if (outline && !outline.filled(segment)) {
      ctx.strokeStyle = c;
      ctx.strokeText(text, x, y);
    } else {
      ctx.fillStyle = c;
      ctx.fillText(text, x, y);
    }
  };
  for (const line of layout.lines) {
    for (const segment of line.segments) {
      if (!keep(segment)) continue;
      if (nativeLetterSpacing || layout.letterSpacing === 0) {
        paint(segment, segment.text, segment.x, line.baseline);
        continue;
      }
      // Navigateur sans letterSpacing natif : caractère par caractère (perd le crénage).
      let x = segment.x;
      for (const char of segment.text) {
        paint(segment, char, x, line.baseline);
        x += ctx.measureText(char).width + layout.letterSpacing;
      }
    }
  }
}

/** Graine d’un tracé à la main : style (marquage + couleur), index global de l’accent, morceau, texte. */
function ovalSeed(marker: Marker, accentIndex: number, piece: number, text: string): string {
  return `${marker.kind}-${marker.color}-${(marker.rotationOffset ?? 0) + accentIndex}-${piece}-${text}`;
}

/** Groupe incliné autour d’un point absolu (style Serif), sinon fragment simple. */
export function RotatedGroup({ rotation, children }: { rotation: TextBlock["rotation"]; children: ReactNode }) {
  if (!rotation?.angle) return <>{children}</>;
  return (
    <Group
      x={rotation.originX}
      y={rotation.originY}
      offsetX={rotation.originX}
      offsetY={rotation.originY}
      rotation={rotation.angle}
      listening={false}
    >
      {children}
    </Group>
  );
}

interface TextBlockNodeProps {
  block: TextBlock;
  layout: TextLayout;
}

/**
 * Un bloc de texte : bandeaux, marquages derrière le texte (souligné, pastille), texte segment par segment
 * (plein ou contouré), accents lumineux (halo de la couleur du marquage), marquages devant (ovale, trait des
 * accents sur bandeau). Même composant pour l’aperçu, l’export et les tuiles de style.
 */
export function TextBlockNode({ block, layout }: TextBlockNodeProps) {
  const { marker, style } = block;
  const fs = layout.fontSize;
  const kindOf = (segment: LineSegment) => (segment.accentIndex === null ? null : layout.accents.kinds[segment.accentIndex]);
  const onPastille = (segment: LineSegment) => kindOf(segment) === "pastille";
  const glowing = (segment: LineSegment) => Boolean(marker?.glow) && kindOf(segment) === "couleur";
  const color = (segment: LineSegment) => segmentColor(kindOf(segment), marker, style.color);
  const outline = style.outline
    ? { width: style.outline.width, filled: (segment: LineSegment) => kindOf(segment) === "couleur" || onPastille(segment) }
    : undefined;
  const shadow = style.shadow;
  const boxes = layout.accentBoxes;
  const glow = marker?.glow ?? 0;

  return (
    <RotatedGroup rotation={block.rotation}>
      <Group x={block.x} y={block.y} opacity={block.opacity ?? 1} listening={false}>
        {marker?.kind === "bandeau" &&
          layout.lines
            .filter((line) => line.text.trim().length > 0)
            .map((line, i) => <Rect key={`band-${i}`} {...bandRect(line, fs)} fill={marker.color} listening={false} />)}

        {marker &&
          boxes.map((box) => {
            const key = `under-${box.accentIndex}-${box.piece}`;
            if (box.kind === "souligne") return <Rect key={key} {...underlineRect(box, fs, marker)} fill={marker.color} listening={false} />;
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
          sceneFunc={(context: Konva.Context) =>
            drawSegments(context._context, layout, { keep: (s) => !onPastille(s) && !glowing(s), color, outline })
          }
        />
        {glow > 0 && boxes.some((b) => b.kind === "couleur") && (
          <Shape
            listening={false}
            perfectDrawEnabled={false}
            sceneFunc={(context: Konva.Context) => {
              const ctx = context._context;
              // Halo néon : deux passes floues de la couleur du marquage, puis la lettre nette.
              ctx.save();
              ctx.shadowColor = marker!.color;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 0;
              for (const factor of [1, 0.45]) {
                ctx.shadowBlur = glow * fs * factor * contextScale(ctx);
                drawSegments(ctx, layout, { keep: glowing, color, outline });
              }
              ctx.restore();
              drawSegments(ctx, layout, { keep: glowing, color, outline });
            }}
          />
        )}
        {boxes.some((b) => b.kind === "pastille") && (
          <Shape
            listening={false}
            perfectDrawEnabled={false}
            sceneFunc={(context: Konva.Context) => drawSegments(context._context, layout, { keep: onPastille, color, outline })}
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
    </RotatedGroup>
  );
}

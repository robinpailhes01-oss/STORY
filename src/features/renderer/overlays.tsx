"use client";

import type Konva from "konva";
import { Group, Line, Shape } from "react-konva";
import { CANVAS_HEIGHT, CANVAS_WIDTH, type Crop, type DecorationBlock, type DrawingBlock, type TextBlock } from "@/domain/story-document";
import type { Stroke } from "@/domain/render-options";
import type { TextLayout } from "@/lib/layout/text-layout";
import { coverCrop, sourceSize } from "./images";
import { ovalInBox } from "./markers";
import { contextScale, drawSegments } from "./TextBlockNode";

/** Décoration : tracés précalculés à la composition, dessinés tels quels (aperçu = export). */
export function DecorationNode({ block }: { block: DecorationBlock }) {
  return (
    <Group listening={false}>
      {block.shapes.map((shape, i) => (
        <Line
          key={i}
          points={shape.points}
          closed={shape.closed}
          tension={shape.tension}
          fill={shape.filled ? block.color : undefined}
          fillEnabled={shape.filled}
          stroke={block.color}
          strokeWidth={shape.strokeWidth}
          lineCap="round"
          lineJoin="round"
          listening={false}
          perfectDrawEnabled={false}
        />
      ))}
    </Group>
  );
}

/** Opacité du surligneur : translucide, le texte dessous reste lisible. */
export const HIGHLIGHTER_OPACITY = 0.35;

function StrokeNode({ stroke }: { stroke: Stroke }) {
  const common = { stroke: stroke.color, strokeWidth: stroke.width, lineJoin: "round" as const, listening: false, perfectDrawEnabled: false };
  if (stroke.tool === "surligneur") {
    // Un seul tracé : les passages qui se recouvrent dans un même trait ne foncent pas.
    return <Line {...common} points={stroke.points} tension={0.3} lineCap="butt" opacity={HIGHLIGHTER_OPACITY} />;
  }
  if (stroke.tool === "ovale") {
    // Deux points = les coins du rectangle tracé : ovale « fait main » ; sinon le geste lissé.
    const points = stroke.points.length === 4 ? ovalInBox(stroke.points[0], stroke.points[1], stroke.points[2], stroke.points[3], `crayon-${stroke.id}`) : stroke.points;
    return <Line {...common} points={points} tension={0.4} lineCap="round" />;
  }
  return <Line {...common} points={stroke.points} tension={0.3} lineCap="round" />;
}

/** Dessins du Crayon d’une story, au-dessus du texte. */
export function DrawingNode({ block }: { block: DrawingBlock }) {
  return (
    <Group listening={false}>
      {block.strokes.map((stroke) => (
        <StrokeNode key={stroke.id} stroke={stroke} />
      ))}
    </Group>
  );
}

let scratch: HTMLCanvasElement | null = null;

/** Toile de travail réutilisée (une seule à la fois : le dessin Konva est synchrone). */
function scratchCanvas(width: number, height: number): CanvasRenderingContext2D {
  scratch ??= document.createElement("canvas");
  if (scratch.width !== width || scratch.height !== height) {
    scratch.width = width;
    scratch.height = height;
  }
  const ctx = scratch.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponible");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, width, height);
  return ctx;
}

interface GiantWordProps {
  block: TextBlock;
  layout: TextLayout;
  /** Détourage de la personne (même cadrage que la photo) : transparent hors de la personne. */
  cutout: CanvasImageSource;
  crop: Crop;
}

/**
 * Mot géant derrière la personne : le mot est dessiné sur une toile de travail à la résolution réelle du
 * contexte, la silhouette détourée y est découpée (destination-out), puis le résultat est posé sur la photo.
 * La personne garde ainsi exactement les pixels de la photo (voile et grain compris).
 */
export function GiantWordBehindSubject({ block, layout, cutout, crop }: GiantWordProps) {
  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      opacity={block.opacity ?? 1}
      sceneFunc={(context: Konva.Context) => {
        const ctx = context._context;
        const s = contextScale(ctx);
        const w = Math.max(1, Math.ceil(CANVAS_WIDTH * s));
        const h = Math.max(1, Math.ceil(CANVAS_HEIGHT * s));
        const off = scratchCanvas(w, h);
        off.scale(s, s);
        off.save();
        const r = block.rotation;
        if (r?.angle) {
          off.translate(r.originX, r.originY);
          off.rotate((r.angle * Math.PI) / 180);
          off.translate(-r.originX, -r.originY);
        }
        off.translate(block.x, block.y);
        drawSegments(off, layout, { keep: () => true, color: () => block.style.color });
        off.restore();
        const c = coverCrop(sourceSize(cutout), crop, CANVAS_WIDTH, CANVAS_HEIGHT);
        off.globalCompositeOperation = "destination-out";
        off.drawImage(cutout, c.x, c.y, c.width, c.height, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        off.globalCompositeOperation = "source-over";
        ctx.drawImage(off.canvas, 0, 0, w, h, 0, 0, w / s, h / s);
      }}
    />
  );
}

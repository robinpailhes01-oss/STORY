"use client";

import { useRef, useState } from "react";
import type { Stroke } from "@/domain/render-options";
import { CANVAS_HEIGHT, CANVAS_WIDTH, DRAWING_LIMITS, type HexColor } from "@/domain/story-document";
import { HIGHLIGHTER_OPACITY } from "@/features/renderer/overlays";

export type PenTool = Stroke["tool"];

/** Distance minimale entre deux points enregistrés, en px du repère 1080 × 1920. */
const MIN_STEP = 3;
/** Un ovale plus petit que ça (en px du repère) est un simple toucher : ignoré. */
const MIN_OVAL = 16;

let counter = 0;
const strokeId = () => `t${Date.now().toString(36)}${(counter++).toString(36)}`;
const round = (v: number) => Math.round(v * 10) / 10;

interface Props {
  tool: PenTool;
  color: HexColor;
  width: number;
  /** Plus de place (DRAWING_LIMITS.strokesPerStory atteint) : le dessin est refusé. */
  full: boolean;
  onStroke: (stroke: Stroke) => void;
  onRefused: () => void;
}

/**
 * Calque de dessin posé sur l’aperçu : pointeurs (doigt, stylet, souris), coordonnées converties dans le
 * repère 1080 × 1920 d’après la taille affichée (zoom compris), page immobile pendant le tracé
 * (touch-action: none). Le trait en cours est dessiné en SVG ; une fois levé, il rejoint le document (Konva).
 */
export function DrawingLayer({ tool, color, width, full, onStroke, onRefused }: Props) {
  const node = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);
  const [points, setPoints] = useState<number[]>([]);
  /** Points du trait en cours (source de vérité ; `points` sert au dessin). */
  const trace = useRef<number[]>([]);
  const update = (next: number[]) => {
    trace.current = next;
    setPoints(next);
  };

  const toLogical = (clientX: number, clientY: number): [number, number] => {
    const rect = node.current!.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    const y = ((clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
    return [round(Math.min(CANVAS_WIDTH, Math.max(0, x))), round(Math.min(CANVAS_HEIGHT, Math.max(0, y)))];
  };

  const finish = () => {
    const pts = trace.current;
    active.current = null;
    update([]);
    if (pts.length < 2) return;
    let final: number[];
    if (tool === "ovale") {
      const [x0, y0] = pts;
      const [x1, y1] = pts.slice(-2);
      if (Math.abs(x1 - x0) < MIN_OVAL && Math.abs(y1 - y0) < MIN_OVAL) return;
      final = [x0, y0, x1, y1];
    } else {
      // Un simple toucher fait un point (deux points confondus à un dixième de pixel près).
      final = pts.length === 2 ? [pts[0], pts[1], round(pts[0] + 0.1), pts[1]] : pts;
    }
    onStroke({ id: strokeId(), tool, color, width, points: final });
  };

  const live = (() => {
    if (points.length < 2) return null;
    if (tool === "ovale") {
      const [x0, y0] = points;
      const [x1, y1] = points.slice(-2);
      return (
        <ellipse
          cx={(x0 + x1) / 2}
          cy={(y0 + y1) / 2}
          rx={Math.abs(x1 - x0) / 2}
          ry={Math.abs(y1 - y0) / 2}
          fill="none"
          stroke={color}
          strokeWidth={width}
        />
      );
    }
    const list = points.length === 2 ? [...points, points[0] + 0.1, points[1]] : points;
    const coords = [];
    for (let i = 0; i < list.length; i += 2) coords.push(`${list[i]},${list[i + 1]}`);
    return (
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap={tool === "surligneur" ? "butt" : "round"}
        strokeLinejoin="round"
        opacity={tool === "surligneur" ? HIGHLIGHTER_OPACITY : 1}
      />
    );
  })();

  return (
    <div
      ref={node}
      className="absolute inset-0 z-10 cursor-crosshair"
      style={{ touchAction: "none" }}
      data-testid="dessin"
      aria-hidden
      onPointerDown={(e) => {
        if (!e.isPrimary || active.current !== null) return;
        if (full) {
          onRefused();
          return;
        }
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        active.current = e.pointerId;
        update(toLogical(e.clientX, e.clientY));
      }}
      onPointerMove={(e) => {
        if (active.current !== e.pointerId) return;
        const events = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [];
        const samples = events.length ? events : [e.nativeEvent];
        let next = trace.current;
        for (const s of samples) {
          const [x, y] = toLogical(s.clientX, s.clientY);
          const lx = next[next.length - 2];
          const ly = next[next.length - 1];
          if (Math.hypot(x - lx, y - ly) < MIN_STEP) continue;
          if (tool === "ovale") next = [next[0], next[1], x, y];
          else if (next.length / 2 < DRAWING_LIMITS.pointsPerStroke) next = [...next, x, y];
        }
        if (next !== trace.current) update(next);
      }}
      onPointerUp={(e) => {
        if (active.current === e.pointerId) finish();
      }}
      onPointerCancel={(e) => {
        if (active.current !== e.pointerId) return;
        active.current = null;
        update([]);
      }}
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} preserveAspectRatio="none">
        {live}
      </svg>
    </div>
  );
}

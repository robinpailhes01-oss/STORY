"use client";

import { memo } from "react";
import { Group, Image as KonvaImage, Rect, Text } from "react-konva";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DEFAULT_VEIL_COLOR,
  blocksInDrawOrder,
  type ImageBackground,
  type ImageBlock,
  type Slide,
} from "@/domain/story-document";
import type { DocumentLayout } from "@/lib/layout/document-layout";
import { grainTile } from "./grain";
import { EMPTY_IMAGES, coverCrop, sourceSize, type ImageTable } from "./images";
import { TextBlockNode } from "./TextBlockNode";

/**
 * Hauteurs masquées par l’interface Instagram : valeurs indicatives, à vérifier sur téléphone
 * (docs : « ne pas présenter une valeur arbitraire comme une règle de la plateforme »).
 */
export const SAFE_ZONE = { top: 250, bottom: 300 };

export const GUIDE_FONT = { family: "Inter", weight: 700 };
const GUIDE_LABELS = { top: "Zone masquée par Instagram (indicatif)", bottom: "Zone de réponse (indicatif)" };
export const GUIDE_TEXT = GUIDE_LABELS.top + GUIDE_LABELS.bottom;

/** Fond de secours quand la photo n’est pas (encore) fournie : dégradé sombre, jamais un écran vide. */
export const FALLBACK_GRADIENT = ["#1D2433", "#07090F"] as const;

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function verticalGradient(stops: Array<number | string>) {
  return {
    fillLinearGradientStartPoint: { x: 0, y: 0 },
    fillLinearGradientEndPoint: { x: 0, y: CANVAS_HEIGHT },
    fillLinearGradientColorStops: stops,
  };
}

function PhotoBackground({ background, images }: { background: ImageBackground; images: ImageTable }) {
  const source = images.get(background.assetId);
  const full = { x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, listening: false } as const;
  const veilColor = background.veil?.color ?? DEFAULT_VEIL_COLOR;
  const stops = background.veil?.stops ?? [];
  return (
    <>
      {source ? (
        <KonvaImage
          {...full}
          image={source}
          crop={coverCrop(sourceSize(source), background.crop, CANVAS_WIDTH, CANVAS_HEIGHT)}
        />
      ) : (
        <Rect {...full} {...verticalGradient([0, FALLBACK_GRADIENT[0], 1, FALLBACK_GRADIENT[1]])} />
      )}
      {background.overlay && <Rect {...full} fill={background.overlay.color} opacity={background.overlay.opacity} />}
      {stops.length > 0 && (
        <Rect
          {...full}
          {...verticalGradient(
            stops.length === 1
              ? [0, rgba(veilColor, stops[0]), 1, rgba(veilColor, stops[0])]
              : stops.flatMap((opacity, i) => [i / (stops.length - 1), rgba(veilColor, opacity)]),
          )}
        />
      )}
      {(background.dim ?? 0) > 0 && <Rect {...full} fill={veilColor} opacity={background.dim} />}
      {(background.grain ?? 0) > 0 && (
        <Rect
          {...full}
          fillPatternImage={grainTile() as unknown as HTMLImageElement}
          fillPatternRepeat="repeat"
          opacity={background.grain}
          globalCompositeOperation="overlay"
        />
      )}
    </>
  );
}

function ImageBlockNode({ block, images }: { block: ImageBlock; images: ImageTable }) {
  const source = images.get(block.assetId);
  const rect = { x: block.x, y: block.y, width: block.width, height: block.height, listening: false } as const;
  if (!source) return <Rect {...rect} fill={FALLBACK_GRADIENT[0]} />;
  return <KonvaImage {...rect} image={source} crop={coverCrop(sourceSize(source), block.crop, block.width, block.height)} />;
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
  /** Images décodées par assetId ; une photo absente donne un fond de secours. */
  images?: ImageTable;
  /** Aides visuelles de l’aperçu ; toujours false à l’export. */
  showGuides?: boolean;
  /** Fond seul (photo, voile, grain), sans texte : sert à mesurer le contraste réel sous les blocs. */
  backgroundOnly?: boolean;
}

/** Renderer unique : utilisé tel quel par l’aperçu, l’export et le laboratoire. */
function StorySlideNodes({ slide, layout, images = EMPTY_IMAGES, showGuides = false, backgroundOnly = false }: StorySlideProps) {
  const background = slide.background;
  return (
    <>
      {background.kind === "solid" ? (
        <Rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill={background.color} listening={false} />
      ) : (
        <PhotoBackground background={background} images={images} />
      )}
      {!backgroundOnly &&
        blocksInDrawOrder(slide).map((block) => {
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
          if (block.kind === "image") return <ImageBlockNode key={block.id} block={block} images={images} />;
          const textLayout = layout.texts.get(block.id);
          return textLayout ? <TextBlockNode key={block.id} block={block} layout={textLayout} /> : null;
        })}
      {showGuides && <SafeZoneGuides />}
    </>
  );
}

/** Mémoïsé : une Stage n’est redessinée que si sa story, sa mise en page ou ses images changent. */
export const StorySlide = memo(StorySlideNodes);

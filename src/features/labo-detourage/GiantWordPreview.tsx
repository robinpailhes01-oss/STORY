"use client";

// Démonstration de l’empilement avec react-konva : photo, mot géant, puis la découpe par-dessus.
// Même principe que les styles à mot géant : la découpe a la taille de la photo, on lui donne
// donc exactement la même position et la même échelle.
import { Image as KonvaImage, Layer, Stage, Text } from "react-konva";
import type { AlphaStats } from "./panels";

export const GIANT_WORD = "CALME";
export const GIANT_WORD_FONT = '"Inter UI"';

interface Props {
  photo: HTMLImageElement;
  cutout: HTMLCanvasElement;
  box: AlphaStats["box"];
  width: number;
  height: number;
}

export default function GiantWordPreview({ photo, cutout, box, width, height }: Props) {
  const scale = width / photo.naturalWidth;
  // Mot sur toute la largeur, posé à hauteur de la tête / des épaules pour passer derrière.
  const fontSize = width * 0.27;
  const top = box ? box.y * scale + Math.min(box.height * scale * 0.18, height * 0.2) - fontSize * 0.35 : height * 0.3;
  const y = Math.max(0, Math.min(height - fontSize, top));
  return (
    <Stage width={width} height={height} listening={false}>
      <Layer listening={false}>
        <KonvaImage image={photo} width={width} height={height} />
        <Text
          text={GIANT_WORD}
          x={0}
          y={y}
          width={width}
          align="center"
          fontFamily={GIANT_WORD_FONT}
          fontStyle="800"
          fontSize={fontSize}
          letterSpacing={-fontSize * 0.04}
          fill="#b8f34a"
        />
        <KonvaImage image={cutout} x={0} y={0} scaleX={scale} scaleY={scale} />
      </Layer>
    </Stage>
  );
}

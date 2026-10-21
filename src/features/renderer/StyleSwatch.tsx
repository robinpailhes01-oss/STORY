"use client";

import { useEffect, useMemo, useState } from "react";
import { Layer, Rect, Stage } from "react-konva";
import type { TextBlock } from "@/domain/story-document";
import { loadFonts } from "@/lib/fonts/load-fonts";
import { resolveFont } from "@/lib/fonts/registry";
import { composeFrench } from "@/lib/layout/french";
import { layoutRichText } from "@/lib/layout/text-layout";
import { getStyle, type StylePreset } from "@/styles/presets";
import { TextBlockNode } from "./TextBlockNode";

/** Hauteur logique d’une tuile ; la largeur suit le rapport demandé. */
const LOGICAL_HEIGHT = 200;
const NAME_SIZE = 74;

/** Police de la tuile : celle du corps du style, avec le texte réel (le nom). */
export function swatchFontRequirement(style: StylePreset) {
  const font = resolveFont(style.body.font.fontId, style.body.font.weight, style.body.font.style);
  return { ...font, text: composeFrench(style.name) };
}

/** Bloc « nom du style » : le nom entier est l’accent, avec le marquage du style (hors bandeau : la bande suffit). */
function swatchBlock(style: StylePreset, logicalWidth: number, fontSize = NAME_SIZE): TextBlock {
  const lineHeight = 1.2;
  const height = fontSize * lineHeight;
  const marker = { ...style.marker, rotationOffset: 0 };
  return {
    id: `swatch-${style.id}`,
    kind: "text",
    x: 0,
    y: (LOGICAL_HEIGHT - height) / 2,
    width: logicalWidth,
    height,
    zIndex: 0,
    content: style.name,
    style: {
      fontId: style.body.font.fontId,
      fontWeight: style.body.font.weight,
      fontStyle: style.body.font.style,
      fontSize,
      color: style.colors.text,
      align: "center",
      lineHeight,
      letterSpacing: style.body.letterSpacing,
    },
    accents: marker.kind === "bandeau" ? [] : [style.name],
    marker,
  };
}

interface StyleSwatchProps {
  styleId: string;
  /** Taille affichée en px CSS. */
  width: number;
  height: number;
}

/**
 * Tuile du sélecteur de styles : le nom du style dessiné dans sa police avec son marquage, sur fond sombre.
 * Même mise en page et mêmes marquages que les stories (TextBlockNode).
 */
export function StyleSwatch({ styleId, width, height }: StyleSwatchProps) {
  const style = getStyle(styleId);
  const [fonts, setFonts] = useState<"loading" | "ready" | string>("loading");

  useEffect(() => {
    let cancelled = false;
    loadFonts([swatchFontRequirement(style)])
      .then(() => !cancelled && setFonts("ready"))
      .catch((error: Error) => !cancelled && setFonts(error.message));
    return () => {
      cancelled = true;
    };
  }, [style]);

  const scale = height / LOGICAL_HEIGHT;
  const logicalWidth = width / scale;

  const drawn = useMemo(() => {
    if (fonts !== "ready") return null;
    // Le nom doit tenir sur une ligne avec la marge du marquage : réduction si nécessaire.
    let block = swatchBlock(style, logicalWidth);
    let layout = layoutRichText({ content: block.content, style: block.style, width: logicalWidth * 2, accents: block.accents, marker: block.marker });
    const maxWidth = logicalWidth * 0.78;
    const lineWidth = layout.lines[0]?.width ?? 0;
    if (lineWidth > maxWidth) {
      const size = Math.floor((block.style.fontSize * maxWidth) / lineWidth);
      block = swatchBlock(style, logicalWidth, size);
    }
    layout = layoutRichText({ content: block.content, style: block.style, width: logicalWidth, accents: block.accents, marker: block.marker });
    return { block, layout };
  }, [fonts, style, logicalWidth]);

  if (fonts !== "ready" && fonts !== "loading") {
    return (
      <span role="alert" title={fonts} style={{ display: "block", width, height, background: "#7A1E1E", color: "#fff", fontSize: 11 }}>
        Police indisponible
      </span>
    );
  }

  return (
    <Stage width={width} height={height} scaleX={scale} scaleY={scale} listening={false}>
      <Layer listening={false}>
        <Rect x={0} y={0} width={logicalWidth} height={LOGICAL_HEIGHT} fill={style.swatchBackground} listening={false} />
        {drawn && <TextBlockNode block={drawn.block} layout={drawn.layout} />}
      </Layer>
    </Stage>
  );
}

// StoryDocument v1 : état métier, indépendant de Konva.
// Miroir TypeScript de docs/staura-architecture-claude-code/contracts/story-document.schema.json.

export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1920;

export type HexColor = `#${string}`;

export interface SolidBackground {
  kind: "solid";
  color: HexColor;
}

export interface Crop {
  focalX: number;
  focalY: number;
  zoom: number;
}

export interface ImageBackground {
  kind: "image";
  assetId: string;
  crop: Crop;
  overlay?: { color: HexColor; opacity: number };
}

export interface TextStyle {
  fontId: string;
  fontSize: number;
  fontWeight: 400 | 500 | 600 | 700;
  color: HexColor;
  align: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing: number;
}

interface BlockBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface TextBlock extends BlockBase {
  kind: "text";
  content: string;
  style: TextStyle;
}

export interface ImageBlock extends BlockBase {
  kind: "image";
  assetId: string;
  crop: Crop;
}

export interface ShapeBlock extends BlockBase {
  kind: "shape";
  shape: "rect";
  fill: HexColor;
  opacity: number;
  cornerRadius: number;
}

export type Block = TextBlock | ImageBlock | ShapeBlock;

export interface Slide {
  id: string;
  templateId: string;
  templateVersion: number;
  background: SolidBackground | ImageBackground;
  blocks: Block[];
}

export interface StoryDocument {
  schemaVersion: 1;
  documentId: string;
  title: string;
  revision: number;
  width: typeof CANVAS_WIDTH;
  height: typeof CANVAS_HEIGHT;
  stylePackId: string;
  stylePackVersion: string;
  slides: Slide[];
}

export class DocumentError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Document invalide :\n- ${problems.join("\n- ")}`);
    this.name = "DocumentError";
  }
}

const ID = /^[a-z][a-z0-9_-]{0,63}$/;
const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * Contrôles structurels et métier nécessaires au rendu (contracts/README.md, règles 3, 4 et 9).
 * Ne remplace pas une validation JSON Schema complète côté serveur (S4/S5).
 */
export function parseStoryDocument(input: unknown): StoryDocument {
  const problems: string[] = [];
  const doc = input as StoryDocument;

  if (!doc || typeof doc !== "object") throw new DocumentError(["le document n’est pas un objet"]);
  if (doc.schemaVersion !== 1) problems.push(`schemaVersion ${String(doc.schemaVersion)} non prise en charge`);
  if (doc.width !== CANVAS_WIDTH || doc.height !== CANVAS_HEIGHT) {
    problems.push(`repère ${doc.width}×${doc.height} au lieu de ${CANVAS_WIDTH}×${CANVAS_HEIGHT}`);
  }
  if (!ID.test(doc.documentId ?? "")) problems.push("documentId invalide");
  if (!Array.isArray(doc.slides) || doc.slides.length < 1 || doc.slides.length > 10) {
    problems.push("il faut entre 1 et 10 stories");
    throw new DocumentError(problems);
  }

  const slideIds = new Set<string>();
  const blockIds = new Set<string>();
  for (const slide of doc.slides) {
    if (!ID.test(slide.id ?? "")) problems.push(`id de story invalide : ${slide.id}`);
    if (slideIds.has(slide.id)) problems.push(`id de story en double : ${slide.id}`);
    slideIds.add(slide.id);

    if (slide.background?.kind === "solid" && !HEX.test(slide.background.color)) {
      problems.push(`${slide.id} : couleur de fond invalide`);
    }

    for (const block of slide.blocks ?? []) {
      const where = `${slide.id}/${block.id}`;
      if (!ID.test(block.id ?? "")) problems.push(`${where} : id de bloc invalide`);
      if (blockIds.has(block.id)) problems.push(`${where} : id de bloc en double`);
      blockIds.add(block.id);
      if (block.x < 0 || block.y < 0 || block.width <= 0 || block.height <= 0) {
        problems.push(`${where} : position ou taille négative`);
      }
      if (block.x + block.width > CANVAS_WIDTH || block.y + block.height > CANVAS_HEIGHT) {
        problems.push(`${where} : dépasse le cadre ${CANVAS_WIDTH}×${CANVAS_HEIGHT}`);
      }
      if (block.kind === "text" && !block.content?.length) problems.push(`${where} : texte vide`);
      if (block.kind === "shape" && !HEX.test(block.fill)) problems.push(`${where} : couleur invalide`);
    }
  }

  if (problems.length) throw new DocumentError(problems);
  return doc;
}

/** Ordre de dessin : zIndex croissant, puis ordre du tableau (règle 9 du contrat). */
export function blocksInDrawOrder(slide: Slide): Block[] {
  return slide.blocks
    .map((block, index) => ({ block, index }))
    .sort((a, b) => a.block.zIndex - b.block.zIndex || a.index - b.index)
    .map(({ block }) => block);
}

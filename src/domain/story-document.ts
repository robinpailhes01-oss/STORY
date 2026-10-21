// StoryDocument v1 : état métier, indépendant de Konva.
// Miroir TypeScript de docs/staura-architecture-claude-code/contracts/story-document.schema.json,
// étendu (champs optionnels, rétrocompatibles) pour le moteur visuel : photo, voile, grain, accents, marquages.

export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1920;

export type HexColor = `#${string}`;

export interface SolidBackground {
  kind: "solid";
  color: HexColor;
}

export interface Crop {
  /** Point de la photo à garder au centre, 0..1 dans chaque axe. */
  focalX: number;
  focalY: number;
  /** ≥ 1 ; 1 = la photo couvre juste le cadre. */
  zoom: number;
}

/** Dégradé vertical posé sur la photo : une opacité par arrêt, du haut vers le bas, arrêts régulièrement espacés. */
export interface Veil {
  /** #02030A par défaut. */
  color?: HexColor;
  stops: number[];
}

export const DEFAULT_VEIL_COLOR: HexColor = "#02030A";

export interface ImageBackground {
  kind: "image";
  assetId: string;
  crop: Crop;
  overlay?: { color: HexColor; opacity: number };
  veil?: Veil;
  /** Assombrissement uniforme supplémentaire (couleur du voile), 0..1. */
  dim?: number;
  /** Opacité du grain, 0..1. */
  grain?: number;
}

export type FontWeight = 400 | 500 | 600 | 700 | 800;
export type FontStyleName = "normal" | "italic";

export interface TextShadow {
  color: HexColor;
  /** Flou en px du repère 1080 × 1920. */
  blur: number;
  opacity: number;
  offsetY?: number;
}

export interface TextStyle {
  fontId: string;
  fontSize: number;
  fontWeight: FontWeight;
  /** « normal » si absent. */
  fontStyle?: FontStyleName;
  color: HexColor;
  align: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing: number;
  /** Halo sombre discret pour la lisibilité sur photo. */
  shadow?: TextShadow;
}

export type MarkerKind = "couleur" | "souligne" | "pastille" | "cercle" | "bandeau";
export const MARKER_KINDS: readonly MarkerKind[] = ["couleur", "souligne", "pastille", "cercle", "bandeau"];

/**
 * Marquage des accents d’un bloc.
 * - couleur : le texte de l’accent prend `color` ;
 * - souligne : barre épaisse `color` sous les mots ;
 * - pastille : rectangle arrondi `color` derrière les mots, texte en `textColor` ;
 * - cercle : ovale tracé à la main `color` autour de l’accent ;
 * - bandeau : chaque ligne du bloc posée sur un rectangle `color` ; accents en `textColor`, soulignés.
 */
export interface Marker {
  kind: MarkerKind;
  color: HexColor;
  textColor?: HexColor;
  /** Inclinaison en degrés (pastille façon surligneur), positif = penché vers la droite. */
  skew?: number;
  /**
   * Rotation des marquages d’un accent à l’autre (ex. pastille → cercle → souligne).
   * L’accent n° i du bloc reçoit rotation[(rotationOffset + i) % rotation.length] ;
   * rotationOffset compte les accents des blocs précédents de la séquence, pour que la rotation
   * continue d’une story à l’autre au lieu de recommencer.
   */
  rotation?: Exclude<MarkerKind, "bandeau">[];
  rotationOffset?: number;
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
  /** Sous-chaînes exactes de `content` à mettre en valeur. */
  accents?: string[];
  marker?: Marker;
  /** 0..1 ; 0,4 pour les paragraphes repris d’une story précédente. */
  opacity?: number;
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
const WEIGHTS = new Set([400, 500, 600, 700, 800]);

const unit = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;

function checkCrop(crop: Crop | undefined, where: string, problems: string[]) {
  if (!crop || !unit(crop.focalX) || !unit(crop.focalY)) problems.push(`${where} : point focal hors de 0..1`);
  if (!crop || typeof crop.zoom !== "number" || !(crop.zoom >= 1)) problems.push(`${where} : zoom inférieur à 1`);
}

function checkImageBackground(bg: ImageBackground, where: string, problems: string[]) {
  if (typeof bg.assetId !== "string" || !bg.assetId) problems.push(`${where} : assetId manquant`);
  checkCrop(bg.crop, `${where} (photo)`, problems);
  if (bg.veil) {
    if (bg.veil.color !== undefined && !HEX.test(bg.veil.color)) problems.push(`${where} : couleur de voile invalide`);
    if (!Array.isArray(bg.veil.stops) || bg.veil.stops.length < 1 || !bg.veil.stops.every(unit)) {
      problems.push(`${where} : arrêts du voile hors de 0..1`);
    }
  }
  if (bg.dim !== undefined && !unit(bg.dim)) problems.push(`${where} : assombrissement hors de 0..1`);
  if (bg.grain !== undefined && !unit(bg.grain)) problems.push(`${where} : grain hors de 0..1`);
  if (bg.overlay && (!HEX.test(bg.overlay.color) || !unit(bg.overlay.opacity))) problems.push(`${where} : calque invalide`);
}

function checkTextBlock(block: TextBlock, where: string, problems: string[]) {
  if (!block.content?.length) problems.push(`${where} : texte vide`);
  const s = block.style;
  if (!s || typeof s.fontId !== "string") {
    problems.push(`${where} : style absent`);
    return;
  }
  if (!WEIGHTS.has(s.fontWeight)) problems.push(`${where} : graisse ${String(s.fontWeight)} non prise en charge`);
  if (s.fontStyle !== undefined && s.fontStyle !== "normal" && s.fontStyle !== "italic") {
    problems.push(`${where} : style de police « ${String(s.fontStyle)} » inconnu`);
  }
  if (!HEX.test(s.color)) problems.push(`${where} : couleur de texte invalide`);
  if (!(s.fontSize > 0) || !(s.lineHeight > 0)) problems.push(`${where} : taille ou interligne invalide`);
  if (s.shadow && (!HEX.test(s.shadow.color) || !unit(s.shadow.opacity) || !(s.shadow.blur >= 0))) {
    problems.push(`${where} : ombre invalide`);
  }
  if (block.opacity !== undefined && !unit(block.opacity)) problems.push(`${where} : opacité hors de 0..1`);
  if (block.accents !== undefined) {
    if (!Array.isArray(block.accents) || !block.accents.every((a) => typeof a === "string" && a.trim().length > 0)) {
      problems.push(`${where} : accents invalides`);
    }
  }
  const m = block.marker;
  if (m) {
    if (!(["couleur", "souligne", "pastille", "cercle", "bandeau"] as const).includes(m.kind)) {
      problems.push(`${where} : marquage « ${String(m.kind)} » inconnu`);
    }
    if (!HEX.test(m.color)) problems.push(`${where} : couleur de marquage invalide`);
    if (m.textColor !== undefined && !HEX.test(m.textColor)) problems.push(`${where} : couleur du texte marqué invalide`);
    if (m.skew !== undefined && !(Math.abs(m.skew) <= 30)) problems.push(`${where} : inclinaison hors de ±30°`);
    if (m.rotation !== undefined) {
      const ok = Array.isArray(m.rotation) && m.rotation.length > 0 && m.rotation.every((k) => ["couleur", "souligne", "pastille", "cercle"].includes(k));
      if (!ok) problems.push(`${where} : rotation de marquages invalide`);
    }
    if (m.rotationOffset !== undefined && !(Number.isInteger(m.rotationOffset) && m.rotationOffset >= 0)) {
      problems.push(`${where} : rotationOffset invalide`);
    }
  }
}

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
    } else if (slide.background?.kind === "image") {
      checkImageBackground(slide.background, slide.id, problems);
    } else if (slide.background?.kind !== "solid") {
      problems.push(`${slide.id} : fond inconnu`);
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
      if (block.kind === "text") checkTextBlock(block, where, problems);
      if (block.kind === "shape" && !HEX.test(block.fill)) problems.push(`${where} : couleur invalide`);
      if (block.kind === "image") checkCrop(block.crop, where, problems);
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

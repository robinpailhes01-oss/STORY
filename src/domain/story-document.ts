// StoryDocument v1 : état métier, indépendant de Konva.
// Miroir TypeScript de docs/staura-architecture-claude-code/contracts/story-document.schema.json,
// étendu (champs optionnels, rétrocompatibles) pour le moteur visuel : photo, voile, grain, accents, marquages ;
// phase 3 : capitales, lettres contourées, halo des accents, mot géant derrière la personne, inclinaison,
// décorations et dessins du Crayon.
import type { DecorationId, Stroke } from "./render-options";

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
  /** Capitales au rendu (le contenu reste la source ; les accents sont cherchés dans le texte transformé). */
  transform?: "uppercase";
  /** Lettres seulement contourées : trait de `width` px (repère 1080 × 1920), intérieur transparent. */
  outline?: { width: number };
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
  /** Halo lumineux de la couleur du marquage autour des accents (flou en tailles de police, ex. 0,5). */
  glow?: number;
  /** Souligné : décalage sous la ligne de base et épaisseur, en tailles de police (défauts −0,07 et 0,25). */
  underlineOffset?: number;
  underlineThickness?: number;
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
  /**
   * Mot géant : dessiné juste après le fond, puis recouvert par la personne détourée (si le détourage
   * de la photo est fourni au renderer), sous le texte courant.
   */
  behindSubject?: boolean;
  /** Inclinaison en degrés autour d’un point absolu du repère (le même pour une story et sa suite). */
  rotation?: { angle: number; originX: number; originY: number };
}

/** Un tracé d’une décoration (flèche, étoile, éclair…), points absolus [x0, y0, x1, y1…]. */
export interface DecorationShape {
  points: number[];
  closed: boolean;
  /** Rempli de la couleur de la décoration (sinon trait seul). */
  filled: boolean;
  strokeWidth: number;
  /** Lissage Konva (0 = segments droits). */
  tension: number;
}

/** Décoration calculée à la composition (géométrie déterministe, graine), dessinée telle quelle. */
export interface DecorationBlock extends BlockBase {
  kind: "decoration";
  decoration: DecorationId;
  color: HexColor;
  shapes: DecorationShape[];
}

/** Dessins du Crayon d’une story, au-dessus du texte. */
export interface DrawingBlock extends BlockBase {
  kind: "drawing";
  strokes: Stroke[];
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

export type Block = TextBlock | ImageBlock | ShapeBlock | DecorationBlock | DrawingBlock;

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
  if (s.transform !== undefined && s.transform !== "uppercase") problems.push(`${where} : transformation « ${String(s.transform)} » inconnue`);
  if (s.outline !== undefined && !(s.outline.width > 0 && s.outline.width <= 20)) problems.push(`${where} : contour hors de 0..20 px`);
  if (block.rotation !== undefined) {
    const r = block.rotation;
    const finite = [r.angle, r.originX, r.originY].every((n) => typeof n === "number" && Number.isFinite(n));
    if (!finite || Math.abs(r.angle) > 15) problems.push(`${where} : inclinaison hors de ±15°`);
  }
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
    if (m.glow !== undefined && !(m.glow >= 0 && m.glow <= 2)) problems.push(`${where} : halo hors de 0..2 em`);
    if (m.underlineOffset !== undefined && !(Math.abs(m.underlineOffset) <= 1)) problems.push(`${where} : décalage du souligné hors de ±1 em`);
    if (m.underlineThickness !== undefined && !(m.underlineThickness > 0 && m.underlineThickness <= 1)) {
      problems.push(`${where} : épaisseur du souligné hors de 0..1 em`);
    }
  }
}

/** Limites des dessins : de quoi dessiner librement sans document démesuré. */
export const DRAWING_LIMITS = { strokesPerStory: 120, pointsPerStroke: 2000, maxWidth: 200 } as const;

const DECORATION_IDS = new Set(["fleche-mot", "fleche-suite", "etoiles", "eclair", "etincelles"]);
const STROKE_TOOLS = new Set(["stylo", "surligneur", "ovale"]);

/** Points [x, y…] en nombre pair, tous finis et dans le cadre 1080 × 1920. */
function pointsInFrame(points: unknown, max: number): string | null {
  if (!Array.isArray(points) || points.length < 2 || points.length % 2 !== 0) return "points en nombre impair ou absents";
  if (points.length / 2 > max) return `${points.length / 2} points (maximum ${max})`;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return "point non numérique";
    if (x < 0 || x > CANVAS_WIDTH || y < 0 || y > CANVAS_HEIGHT) return `point (${Math.round(x)}, ${Math.round(y)}) hors du cadre`;
  }
  return null;
}

function checkDecorationBlock(block: DecorationBlock, where: string, problems: string[]) {
  if (!DECORATION_IDS.has(block.decoration)) problems.push(`${where} : décoration « ${String(block.decoration)} » inconnue`);
  if (!HEX.test(block.color)) problems.push(`${where} : couleur de décoration invalide`);
  if (!Array.isArray(block.shapes) || block.shapes.length < 1 || block.shapes.length > 40) {
    problems.push(`${where} : entre 1 et 40 tracés attendus`);
    return;
  }
  block.shapes.forEach((shape, i) => {
    const bad = pointsInFrame(shape.points, 400);
    if (bad) problems.push(`${where}, tracé ${i + 1} : ${bad}`);
    if (!(shape.strokeWidth >= 0 && shape.strokeWidth <= 60)) problems.push(`${where}, tracé ${i + 1} : épaisseur invalide`);
    if (!(shape.tension >= 0 && shape.tension <= 1)) problems.push(`${where}, tracé ${i + 1} : lissage hors de 0..1`);
  });
}

function checkDrawingBlock(block: DrawingBlock, where: string, problems: string[]) {
  if (!Array.isArray(block.strokes) || block.strokes.length > DRAWING_LIMITS.strokesPerStory) {
    problems.push(`${where} : ${DRAWING_LIMITS.strokesPerStory} traits au plus par story`);
    return;
  }
  const ids = new Set<string>();
  block.strokes.forEach((stroke, i) => {
    const label = `${where}, trait ${i + 1}`;
    if (typeof stroke.id !== "string" || !stroke.id || stroke.id.length > 64) problems.push(`${label} : identifiant invalide`);
    else if (ids.has(stroke.id)) problems.push(`${label} : identifiant en double`);
    ids.add(stroke.id);
    if (!STROKE_TOOLS.has(stroke.tool)) problems.push(`${label} : outil « ${String(stroke.tool)} » inconnu`);
    if (!HEX.test(stroke.color)) problems.push(`${label} : couleur invalide`);
    if (!(stroke.width > 0 && stroke.width <= DRAWING_LIMITS.maxWidth)) problems.push(`${label} : épaisseur hors de 0..${DRAWING_LIMITS.maxWidth} px`);
    const bad = pointsInFrame(stroke.points, DRAWING_LIMITS.pointsPerStroke);
    if (bad) problems.push(`${label} : ${bad}`);
  });
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
      if (block.kind === "decoration") checkDecorationBlock(block, where, problems);
      if (block.kind === "drawing") checkDrawingBlock(block, where, problems);
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

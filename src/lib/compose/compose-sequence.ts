// Composition « séquence écrite → stories dessinables » : applique la structure fixe (SEQUENCE_LAYOUT),
// le style choisi et ses options (couleur d’accent, mots en évidence, décoration), place les photos (2 ou 3),
// mesure chaque paragraphe avec la vraie police pour empiler les blocs, puis ajoute décorations et dessins.
// Fonction cliente : à appeler après loadFonts(fontRequirementsForSequence(...)).
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DRAWING_LIMITS,
  DocumentError,
  parseStoryDocument,
  type Block,
  type DecorationBlock,
  type DrawingBlock,
  type HexColor,
  type ImageBackground,
  type Slide,
  type StoryDocument,
  type TextBlock,
  type TextStyle,
} from "@/domain/story-document";
import { DECORATIONS, type DecorationId, type Drawings, type RenderOptions, type Stroke } from "@/domain/render-options";
import { SEQUENCE_LAYOUT, STORY_COUNT, accentRanges, photoIndexFor, type StoryPlan } from "@/domain/story-plan";
import { mergeRequirements, type FontRequirement } from "@/lib/fonts/load-fonts";
import { resolveFont } from "@/lib/fonts/registry";
import { composeFrench, renderedText } from "@/lib/layout/french";
import { layoutRichText, type TextLayout } from "@/lib/layout/text-layout";
import {
  STORY_LAYOUT,
  applyRenderOptions,
  getStyle,
  resolveRoleColor,
  type GiantSettings,
  type StylePreset,
  type TypeSettings,
} from "@/styles/presets";
import { DECORATION_SAFE, planDecoration, rotateShapes, shapesBounds, type Rect } from "./decorations";

export interface PhotoRef {
  assetId: string;
  focalX?: number;
  focalY?: number;
  zoom?: number;
}

export interface ComposeInput {
  plan: StoryPlan;
  styleId: string;
  /**
   * Photos dans l’ordre (2 ou 3) ; null = emplacement pas encore rempli. Le nombre de photos est la position
   * de la dernière photo fournie : [p1, p2] ou [p1, p2, null] = séquence à 2 photos (photoIndexFor).
   */
  photos: ReadonlyArray<PhotoRef | null>;
  /** Options du panneau Style ; `styleId` ci-dessus prime sur options.styleId. */
  options?: Partial<RenderOptions>;
  /** Dessins du Crayon par story (0-4) ; une story suite n’hérite pas de ceux de la story précédente. */
  drawings?: Drawings;
  documentId?: string;
}

export interface ComposedScene {
  /** Index des stories de la scène (une story et sa suite éventuelle). */
  stories: number[];
  fontSize: number;
  top: number;
  height: number;
}

export interface ComposeResult {
  document: StoryDocument;
  /** Non bloquants : photo absente, accent introuvable, taille réduite, décoration sans place. */
  warnings: string[];
  /** Bloquants : texte qui ne tient pas, document invalide. */
  problems: string[];
  scenes: ComposedScene[];
  /** Options réellement appliquées (couleur invalide ignorée, etc.). */
  options: RenderOptions;
  /** Nombre de photos utilisé pour la répartition (photoIndexFor). */
  photoCount: number;
}

/** Opacité des paragraphes repris d’une story précédente (mesurée ≈ 40 % sur la référence). */
export const CONTINUATION_OPACITY = 0.4;
const SIZE_STEP = 1;
const HEX = /^#[0-9A-Fa-f]{6}$/;
const DECORATION_IDS = new Set<string>(DECORATIONS.map((d) => d.id));
/** zIndex des calques ajoutés au texte. */
const Z_DECORATION = 900;
const Z_DRAWING = 1000;

const isHookStory = (index: number) => index === 0;

// ── Rôles des paragraphes ──────────────────────────────────────────────────────

type Role = "hook" | "lead" | "body";

/** Rôle du paragraphe k d’une story vue pour la première fois (les stories suite n’ont que du corps). */
function roleOf(preset: StylePreset, storyIndex: number, k: number): Role {
  if (isHookStory(storyIndex)) return "hook";
  if (preset.lead && k === 0 && !SEQUENCE_LAYOUT[storyIndex].continues) return "lead";
  return "body";
}

function settingsOf(preset: StylePreset, role: Role): TypeSettings {
  if (role === "hook") return preset.hook;
  if (role === "lead") return preset.lead ?? preset.body;
  return preset.body;
}

/**
 * Mot géant d’une story (styles à mot géant, stories vues pour la première fois) : le mot le plus long du
 * premier accent du premier paragraphe qui en a, sans ponctuation ; null s’il n’y a aucun accent.
 */
export function giantWordFor(plan: StoryPlan, storyIndex: number): { word: string; paragraph: number } | null {
  if (SEQUENCE_LAYOUT[storyIndex].continues) return null;
  const paragraphs = plan.stories[storyIndex].paragraphs;
  for (let k = 0; k < paragraphs.length; k++) {
    const p = paragraphs[k];
    const { ranges } = accentRanges(p.text, p.accents);
    if (!ranges.length) continue;
    const accent = p.text.slice(ranges[0].start, ranges[0].end);
    const words = accent
      .split(/\s+/)
      .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
      .filter(Boolean);
    if (!words.length) continue;
    const word = words.reduce((best, w) => (w.length > best.length ? w : best), words[0]);
    return { word, paragraph: k };
  }
  return null;
}

/** Polices à charger avant composeSequence (rôles du style et mot géant, avec le texte réel transformé). */
export function fontRequirementsForSequence(plan: StoryPlan, styleId: string): FontRequirement[] {
  const style = getStyle(styleId);
  const requirements: FontRequirement[] = [];
  plan.stories.forEach((story, index) => {
    story.paragraphs.forEach((p, k) => {
      const settings = settingsOf(style, roleOf(style, index, k));
      const font = resolveFont(settings.font.fontId, settings.font.weight, settings.font.style);
      requirements.push({ ...font, text: renderedText(p.text, settings.transform) });
    });
    const giant = style.giant ? giantWordFor(plan, index) : null;
    if (style.giant && giant) {
      const font = resolveFont(style.giant.font.fontId, style.giant.font.weight, style.giant.font.style);
      requirements.push({ ...font, text: renderedText(giant.word, "uppercase") });
    }
  });
  return mergeRequirements(requirements);
}

function textStyle(preset: StylePreset, settings: TypeSettings, fontSize: number, align: TextStyle["align"]): TextStyle {
  return {
    fontId: settings.font.fontId,
    fontSize,
    fontWeight: settings.font.weight,
    fontStyle: settings.font.style,
    color: resolveRoleColor(preset, settings.color),
    align,
    lineHeight: settings.lineHeight,
    letterSpacing: settings.letterSpacing,
    ...(preset.shadow ? { shadow: preset.shadow } : {}),
    ...(settings.transform ? { transform: settings.transform } : {}),
    ...(settings.outline ? { outline: { width: Math.max(1, Math.round(settings.outline * fontSize * 10) / 10) } } : {}),
  };
}

function giantStyle(preset: StylePreset, giant: GiantSettings, fontSize: number): TextStyle {
  return {
    fontId: giant.font.fontId,
    fontSize,
    fontWeight: giant.font.weight,
    fontStyle: giant.font.style,
    color: resolveRoleColor(preset, giant.color),
    align: "center",
    lineHeight: giant.lineHeight,
    letterSpacing: giant.letterSpacing,
    transform: "uppercase",
  };
}

/** Groupes « story + suite » : [[0], [1, 2], [3, 4]] pour la structure de référence. */
function scenesOf(): number[][] {
  const scenes: number[][] = [];
  SEQUENCE_LAYOUT.forEach((entry, index) => {
    if (entry.continues && scenes.length) scenes[scenes.length - 1].push(index);
    else scenes.push([index]);
  });
  return scenes;
}

// ── Mise en page d’une scène ──────────────────────────────────────────────────

interface PlacedItem {
  kind: "paragraph" | "giant";
  /** Story d’origine et index du paragraphe (repris : ceux de la story précédente). */
  storyIndex: number;
  paragraphIndex: number;
  content: string;
  accents: string[];
  style: TextStyle;
  x: number;
  width: number;
  relY: number;
  height: number;
  repeated: boolean;
}

interface SceneLayout {
  fontSize: number;
  /** Par story de la scène : éléments placés (y relatif au haut de la scène). */
  stories: PlacedItem[][];
  height: number;
  widthProblems: string[];
  warnings: string[];
}

interface Geometry {
  x: number;
  width: number;
  align: TextStyle["align"];
}

function geometryOf(preset: StylePreset, role: Role): Geometry {
  if (role === "hook") {
    const width = preset.hookWidth ?? STORY_LAYOUT.hook.width;
    return { x: (CANVAS_WIDTH - width) / 2, width, align: "center" };
  }
  return { x: STORY_LAYOUT.body.x, width: STORY_LAYOUT.body.width, align: "left" };
}

function layoutScene(plan: StoryPlan, scene: number[], preset: StylePreset, base: TypeSettings, fontSize: number): SceneLayout {
  const ratio = fontSize / base.size;
  const hookScene = isHookStory(scene[0]);
  const gapEm = hookScene ? STORY_LAYOUT.hook.paragraphGap : STORY_LAYOUT.body.paragraphGap;
  const widthProblems = new Set<string>();
  const warnings = new Set<string>();
  const sizeFor = (settings: TypeSettings) =>
    settings === base ? fontSize : Math.max(settings.minSize, Math.round(settings.size * ratio));

  const measure = (content: string, accents: string[], style: TextStyle, width: number) => {
    const layout = layoutRichText({ content, style, width, accents });
    layout.problems.forEach((m) => widthProblems.add(m));
    layout.warnings.forEach((m) => warnings.add(m));
    return layout.contentHeight;
  };

  const stories: PlacedItem[][] = [];
  let height = 0;
  for (const storyIndex of scene) {
    const placed: PlacedItem[] = [];
    let cursor = 0;
    const continues = SEQUENCE_LAYOUT[storyIndex].continues && stories.length > 0;
    if (continues) {
      // Reprise : mêmes éléments, mêmes positions que dans la story précédente.
      const previous = stories[stories.length - 1].filter((p) => !p.repeated);
      for (const p of previous) placed.push({ ...p, repeated: true });
      const last = previous[previous.length - 1];
      const pitch = fontSize * base.lineHeight;
      cursor = last ? last.relY + last.height + STORY_LAYOUT.body.continuationGap * pitch : 0;
    }
    const giant = preset.giant ? giantWordFor(plan, storyIndex) : null;
    plan.stories[storyIndex].paragraphs.forEach((paragraph, k) => {
      const role = roleOf(preset, storyIndex, k);
      const settings = settingsOf(preset, role);
      const size = sizeFor(settings);
      const style = textStyle(preset, settings, size, geometryOf(preset, role).align);
      const geo = geometryOf(preset, role);
      if (k > 0) cursor += gapEm * fontSize;
      const h = measure(paragraph.text, paragraph.accents, style, geo.width);
      placed.push({
        kind: "paragraph",
        storyIndex,
        paragraphIndex: k,
        content: paragraph.text,
        accents: [...paragraph.accents],
        style,
        x: geo.x,
        width: geo.width,
        relY: cursor,
        height: h,
        repeated: false,
      });
      cursor += h;
      // Mot géant : juste après l’amorce (le premier paragraphe), quel que soit le paragraphe de l’accent.
      if (preset.giant && giant && k === 0) {
        const g = preset.giant;
        let size = Math.max(40, Math.round(g.size * ratio));
        let gStyle = giantStyle(preset, g, size);
        // Le mot doit tenir sur une ligne : réduction proportionnelle, puis par pas de 2 px (interlettrage, arrondis).
        const widthAt = (st: TextStyle) => layoutRichText({ content: giant.word, style: st, width: CANVAS_WIDTH * 4 }).lines[0]?.width ?? 0;
        const wordWidth = widthAt(gStyle);
        if (wordWidth > g.width) {
          size = Math.max(24, Math.floor((size * g.width) / wordWidth));
          gStyle = giantStyle(preset, g, size);
          while (size > 24 && widthAt(gStyle) > g.width) {
            size -= 2;
            gStyle = giantStyle(preset, g, size);
          }
        }
        cursor += 0.35 * fontSize;
        const gh = measure(giant.word, [], gStyle, g.width);
        placed.push({
          kind: "giant",
          storyIndex,
          paragraphIndex: giant.paragraph,
          content: giant.word,
          accents: [],
          style: gStyle,
          x: (CANVAS_WIDTH - g.width) / 2,
          width: g.width,
          relY: cursor,
          height: gh,
          repeated: false,
        });
        cursor += gh + 0.2 * fontSize;
      }
    });
    height = Math.max(height, cursor);
    stories.push(placed);
  }
  return { fontSize, stories, height, widthProblems: [...widthProblems], warnings: [...warnings] };
}

// ── Fond, options, dessins ─────────────────────────────────────────────────────

function background(photo: PhotoRef | null, preset: StylePreset, continues: boolean, photoNumber: number): ImageBackground {
  return {
    kind: "image",
    assetId: photo?.assetId || `photo-manquante-${photoNumber}`,
    crop: {
      focalX: Math.min(1, Math.max(0, photo?.focalX ?? 0.5)),
      focalY: Math.min(1, Math.max(0, photo?.focalY ?? 0.5)),
      zoom: Math.max(1, photo?.zoom ?? 1),
    },
    veil: preset.veil,
    dim: continues ? preset.continuationDim : preset.dim,
    grain: preset.grain,
  };
}

/** Options complètes et valides ; une valeur invalide est remplacée par celle du style, avec un avertissement. */
function resolveOptions(styleId: string, partial: Partial<RenderOptions> | undefined, warnings: string[]): RenderOptions {
  let accentColor: HexColor | null = partial?.accentColor ?? null;
  if (accentColor !== null && !HEX.test(accentColor)) {
    warnings.push(`couleur d’accent « ${String(accentColor)} » invalide (format #RRGGBB attendu) : couleur du style gardée`);
    accentColor = null;
  }
  let decoration: DecorationId | null = partial?.decoration ?? null;
  if (decoration !== null && !DECORATION_IDS.has(decoration)) {
    warnings.push(`décoration « ${String(decoration)} » inconnue : aucune décoration`);
    decoration = null;
  }
  return { styleId, accentColor: accentColor ? (accentColor.toUpperCase() as HexColor) : null, showAccents: partial?.showAccents ?? true, decoration };
}

/** Nombre de photos : position de la dernière photo fournie (les emplacements vides en fin de liste ne comptent pas). */
export function photoCountOf(photos: ReadonlyArray<PhotoRef | null>): number {
  let count = 0;
  photos.forEach((p, i) => {
    if (p) count = i + 1;
  });
  return count;
}

/** Traits du Crayon recopiés, points ramenés dans le cadre ; un trait inutilisable est écarté et signalé. */
function drawingBlock(storyIndex: number, strokes: readonly Stroke[], warnings: string[]): DrawingBlock | null {
  const label = `story ${storyIndex + 1}`;
  const kept: Stroke[] = [];
  let clamped = 0;
  for (const stroke of strokes) {
    if (kept.length >= DRAWING_LIMITS.strokesPerStory) {
      warnings.push(`${label} : plus de ${DRAWING_LIMITS.strokesPerStory} traits, les suivants sont ignorés`);
      break;
    }
    const raw = Array.isArray(stroke.points) ? stroke.points : [];
    if (raw.length < 2 || raw.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
      warnings.push(`${label} : trait « ${stroke.id} » sans points valides, ignoré`);
      continue;
    }
    let points = raw.slice(0, raw.length - (raw.length % 2));
    if (points.length / 2 > DRAWING_LIMITS.pointsPerStroke) {
      // Trop de points : on en garde un sur n (le tracé reste le même à l’œil).
      const step = Math.ceil(points.length / 2 / DRAWING_LIMITS.pointsPerStroke);
      points = points.filter((_, i) => Math.floor(i / 2) % step === 0);
    }
    points = points.map((v, i) => {
      const max = i % 2 === 0 ? CANVAS_WIDTH : CANVAS_HEIGHT;
      const c = Math.min(max, Math.max(0, v));
      if (c !== v) clamped++;
      return c;
    });
    if (points.length === 2) points = [...points, Math.min(CANVAS_WIDTH, points[0] + 0.5), points[1]]; // un point = une touche
    kept.push({ id: stroke.id, tool: stroke.tool, color: stroke.color, width: stroke.width, points });
  }
  if (clamped) warnings.push(`${label} : ${clamped} point(s) du crayon hors du cadre ramenés au bord`);
  if (!kept.length) return null;
  return { id: `s${storyIndex + 1}_dessin`, kind: "drawing", x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, zIndex: Z_DRAWING, strokes: kept };
}

/** Boîtes absolues des lignes d’un bloc de texte (non inclinées). */
function lineRects(block: TextBlock, layout: TextLayout): Rect[] {
  return layout.lines
    .filter((l) => l.text.trim().length > 0)
    .map((l) => ({ x: block.x + l.x, y: block.y + l.top, width: l.width, height: layout.lineHeightPx }));
}

function decorationBlock(
  slide: Slide,
  storyIndex: number,
  kind: DecorationId,
  color: HexColor,
  plan: StoryPlan,
  warnings: string[],
): DecorationBlock | null {
  const label = `story ${storyIndex + 1}`;
  const texts = slide.blocks.filter((b): b is TextBlock => b.kind === "text");
  const obstacles: Rect[] = [];
  const anchors: Rect[] = [];
  let anchorSize = 41;
  let fallback: Rect | null = null;
  for (const block of texts) {
    const layout = layoutRichText({ content: block.content, style: block.style, width: block.width, marker: block.marker });
    obstacles.push(...lineRects(block, layout));
    if (block.opacity !== undefined && block.opacity < 1) continue; // repris
    if (block.behindSubject) continue;
    // Les ancres viennent des accents du plan, même quand « Mots en évidence » est désactivé.
    const k = /^s\d+_p(\d+)$/.exec(block.id)?.[1];
    const paragraph = k ? plan.stories[storyIndex].paragraphs[Number(k) - 1] : undefined;
    const withAccents = paragraph
      ? layoutRichText({ content: block.content, style: block.style, width: block.width, accents: paragraph.accents, marker: block.marker })
      : layout;
    for (const box of withAccents.accentBoxes.filter((b) => b.piece === 0)) {
      if (!anchors.length) anchorSize = block.style.fontSize;
      anchors.push({ x: block.x + box.x, y: block.y + box.y, width: box.width, height: box.height });
    }
    const last = layout.lines.at(-1);
    if (last) fallback = { x: block.x + last.x + Math.max(0, last.width - 160), y: block.y + last.top, width: Math.min(160, last.width), height: layout.lineHeightPx };
  }
  // Dernier recours : la fin du texte de la story (souvent libre dessous), après tous les mots en évidence.
  if (fallback && kind !== "fleche-suite") {
    if (!anchors.length) warnings.push(`${label} : aucun mot en évidence, décoration placée en fin de texte`);
    anchors.push(fallback);
  }
  const rotation = texts.find((b) => b.rotation)?.rotation;
  const plan_ = planDecoration(kind, {
    anchors,
    obstacles,
    safe: DECORATION_SAFE,
    fontSize: anchorSize,
    seed: `${storyIndex}-${texts.map((t) => t.content.length).join(".")}`,
  });
  if (!plan_) {
    warnings.push(`${label} : pas de place libre pour la décoration « ${DECORATIONS.find((d) => d.id === kind)?.nom} » sans toucher le texte`);
    return null;
  }
  const shapes = rotation ? rotateShapes(plan_.shapes, rotation.angle, rotation.originX, rotation.originY) : plan_.shapes;
  const bounds = shapesBounds(shapes);
  const x = Math.max(0, Math.floor(bounds.x));
  const y = Math.max(0, Math.floor(bounds.y));
  return {
    id: `s${storyIndex + 1}_deco`,
    kind: "decoration",
    x,
    y,
    width: Math.max(1, Math.min(CANVAS_WIDTH - x, Math.ceil(bounds.x + bounds.width) - x)),
    height: Math.max(1, Math.min(CANVAS_HEIGHT - y, Math.ceil(bounds.y + bounds.height) - y)),
    zIndex: Z_DECORATION,
    decoration: kind,
    color,
    shapes,
  };
}

// ── Composition ────────────────────────────────────────────────────────────────

/**
 * Compose la séquence : une Slide par story, photo de la story (photoIndexFor : 2 ou 3 photos), éléments
 * empilés à leur hauteur réelle (accroche, amorce, mot géant, corps). Les stories « suite » reprennent les
 * éléments de la story précédente aux mêmes positions (opacité 0,4, sans marquage), puis ajoutent les leurs
 * dessous. Si une scène ne tient pas dans la zone sûre, la taille de TOUTE la scène baisse par paliers jusqu’au
 * minimum du style ; au-delà, problème bloquant. Puis décoration (une par story) et dessins du Crayon.
 */
export function composeSequence(input: ComposeInput): ComposeResult {
  const warnings: string[] = [];
  const problems: string[] = [];
  const scenesOut: ComposedScene[] = [];
  const options = resolveOptions(input.styleId, input.options, warnings);
  const preset = applyRenderOptions(getStyle(input.styleId), { accentColor: options.accentColor });
  const { plan } = input;

  if (plan.stories.length !== STORY_COUNT) {
    throw new Error(`La séquence doit compter ${STORY_COUNT} stories (reçu : ${plan.stories.length})`);
  }

  // Rotation des marquages : l’index continue d’un bloc à l’autre sur toute la séquence.
  const rotationOffsets = new Map<string, number>();
  let accentCount = 0;
  plan.stories.forEach((story, s) =>
    story.paragraphs.forEach((p, k) => {
      rotationOffsets.set(`${s}/${k}`, accentCount);
      accentCount += accentRanges(p.text, p.accents, composeFrench).ranges.length;
    }),
  );

  // Photos : 2 ou 3 (photoIndexFor), emplacements vides en fin de liste ignorés.
  const photoCount = photoCountOf(input.photos);
  if (photoCount === 1) warnings.push("une seule photo : elle sert aux 5 stories (2 ou 3 photos conseillées)");
  const slides: Slide[] = SEQUENCE_LAYOUT.map((entry, index) => {
    const photoIndex = photoIndexFor(index, photoCount);
    const photo = photoIndex === null ? null : (input.photos[photoIndex] ?? null);
    const number = (photoIndex ?? index) + 1;
    if (!photo) {
      const which = photoIndex === null ? "aucune photo" : `photo ${number} absente`;
      warnings.push(`story ${index + 1} : ${which}, fond sombre de secours`);
    }
    return {
      id: `story_${String(index + 1).padStart(2, "0")}`,
      templateId: `sequence-${Math.max(2, Math.min(3, photoCount || 3))}-photos`,
      templateVersion: 1,
      background: background(photo, preset, entry.continues, number),
      blocks: [],
    };
  });

  for (const scene of scenesOf()) {
    const hook = scene.length === 1 && isHookStory(scene[0]);
    const base = hook ? preset.hook : preset.body;
    const zone = hook ? STORY_LAYOUT.hook : STORY_LAYOUT.body;
    const label = scene.length > 1 ? `stories ${scene[0] + 1}-${scene[scene.length - 1] + 1}` : `story ${scene[0] + 1}`;

    let chosen: SceneLayout | null = null;
    let top = 0;
    let last: SceneLayout | null = null;
    for (let size = base.size; size >= base.minSize; size -= SIZE_STEP) {
      const candidate = layoutScene(plan, scene, preset, base, size);
      last = candidate;
      let candidateTop = Math.max(zone.minTop, zone.centerY - candidate.height / 2);
      if (candidateTop + candidate.height > STORY_LAYOUT.safeBottom) candidateTop = STORY_LAYOUT.safeBottom - candidate.height;
      const fits = candidateTop >= STORY_LAYOUT.safeTop && candidate.widthProblems.length === 0;
      if (fits) {
        chosen = candidate;
        top = candidateTop;
        break;
      }
    }
    if (!chosen) {
      chosen = last!;
      top = Math.max(STORY_LAYOUT.safeTop, STORY_LAYOUT.safeBottom - chosen.height);
      const available = STORY_LAYOUT.safeBottom - STORY_LAYOUT.safeTop;
      problems.push(
        `${label} : le texte ne tient pas, même à ${chosen.fontSize} px (taille minimale du style ${preset.name}) : ` +
          `${Math.round(chosen.height)} px pour ${available} px disponibles${chosen.widthProblems.length ? ` ; ${chosen.widthProblems.join(" ; ")}` : ""}. Raccourcir le texte.`,
      );
    } else if (chosen.fontSize < base.size) {
      warnings.push(`${label} : taille réduite de ${base.size} à ${chosen.fontSize} px pour tenir dans la zone sûre`);
    }
    chosen.warnings.forEach((w) => warnings.push(`${label} : ${w}`));
    top = Math.round(top);
    scenesOut.push({ stories: scene, fontSize: chosen.fontSize, top, height: Math.round(chosen.height) });

    // Inclinaison (style Serif) : autour du centre de la scène, le même pour la story et sa suite.
    const rotation = preset.tilt ? { angle: preset.tilt, originX: CANVAS_WIDTH / 2, originY: Math.round(top + chosen.height / 2) } : undefined;

    scene.forEach((storyIndex, position) => {
      const slide = slides[storyIndex];
      let newIndex = 0;
      let repeatIndex = 0;
      slide.blocks = chosen.stories[position].map((placed, z): TextBlock => {
        const repeated = placed.repeated;
        const giant = placed.kind === "giant";
        const k = giant ? 0 : repeated ? repeatIndex++ : newIndex++;
        const id = giant ? `s${storyIndex + 1}_${repeated ? "rg" : "g"}1` : `s${storyIndex + 1}_${repeated ? "r" : "p"}${k + 1}`;
        const accents = repeated || giant || !options.showAccents ? [] : [...placed.accents];
        const block: TextBlock = {
          id,
          kind: "text",
          x: placed.x,
          y: top + Math.round(placed.relY),
          width: placed.width,
          height: Math.ceil(placed.height),
          zIndex: z,
          content: placed.content,
          style: placed.style,
          accents,
          ...(giant
            ? { behindSubject: true }
            : {
                marker: {
                  ...preset.marker,
                  ...(repeated ? {} : { rotationOffset: rotationOffsets.get(`${placed.storyIndex}/${placed.paragraphIndex}`) ?? 0 }),
                },
              }),
          ...(rotation ? { rotation } : {}),
        };
        if (repeated) block.opacity = CONTINUATION_OPACITY;
        return block;
      });
    });
  }

  // Les blocs repris doivent garder exactement la géométrie de la story précédente.
  scenesOf().forEach((scene) => {
    for (let i = 1; i < scene.length; i++) {
      const previous = slides[scene[i - 1]].blocks.filter((b) => b.kind === "text" && !b.id.includes("_r"));
      const repeated = slides[scene[i]].blocks.filter((b) => b.id.includes("_r"));
      repeated.forEach((b, k) => {
        const p = previous[k];
        if (!p || p.x !== b.x || p.y !== b.y || p.width !== b.width || p.height !== b.height) {
          problems.push(`${slides[scene[i]].id}/${b.id} : position différente du paragraphe repris`);
        }
      });
    }
  });

  for (const slide of slides) {
    for (const block of slide.blocks) {
      if (block.y < STORY_LAYOUT.safeTop || block.y + block.height > STORY_LAYOUT.safeBottom) {
        if (!problems.some((p) => p.includes("ne tient pas"))) {
          problems.push(`${slide.id}/${block.id} : texte hors de la zone sûre (${STORY_LAYOUT.safeTop}–${STORY_LAYOUT.safeBottom} px)`);
        }
      }
    }
  }

  // Décoration (une par story ; pas de flèche vers la suite sur la dernière story), couleur d’accent.
  if (options.decoration) {
    slides.forEach((slide, index) => {
      if (options.decoration === "fleche-suite" && index === STORY_COUNT - 1) return;
      const block = decorationBlock(slide, index, options.decoration!, preset.colors.accent, plan, warnings);
      if (block) slide.blocks.push(block);
    });
  }

  // Dessins du Crayon : par story, au-dessus du texte.
  if (input.drawings) {
    slides.forEach((slide, index) => {
      const strokes = input.drawings?.[index];
      if (!strokes?.length) return;
      const block = drawingBlock(index, strokes, warnings);
      if (block) slide.blocks.push(block as Block);
    });
  }

  const draft: StoryDocument = {
    schemaVersion: 1,
    documentId: input.documentId ?? `sequence-${preset.id}`,
    title: plan.angle,
    revision: 1,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    stylePackId: preset.id,
    stylePackVersion: "1",
    slides,
  };
  let document = draft;
  try {
    document = parseStoryDocument(draft);
  } catch (error) {
    if (error instanceof DocumentError) problems.push(...error.problems);
    else throw error;
  }
  return { document, warnings, problems, scenes: scenesOut, options, photoCount };
}


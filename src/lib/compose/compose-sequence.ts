// Composition « séquence écrite → stories dessinables » : applique la structure fixe (SEQUENCE_LAYOUT),
// le style choisi et mesure chaque paragraphe avec la vraie police pour empiler les blocs.
// Fonction cliente : à appeler après loadFonts(fontRequirementsForSequence(...)).
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DocumentError,
  parseStoryDocument,
  type ImageBackground,
  type Slide,
  type StoryDocument,
  type TextBlock,
  type TextStyle,
} from "@/domain/story-document";
import { SEQUENCE_LAYOUT, STORY_COUNT, accentRanges, type Paragraph, type StoryPlan } from "@/domain/story-plan";
import { mergeRequirements, type FontRequirement } from "@/lib/fonts/load-fonts";
import { resolveFont } from "@/lib/fonts/registry";
import { composeFrench } from "@/lib/layout/french";
import { layoutRichText } from "@/lib/layout/text-layout";
import { STORY_LAYOUT, getStyle, type StylePreset, type TypeSettings } from "@/styles/presets";

export interface PhotoRef {
  assetId: string;
  focalX?: number;
  focalY?: number;
  zoom?: number;
}

export interface ComposeInput {
  plan: StoryPlan;
  styleId: string;
  /** Une entrée par photo (3) ; null = photo pas encore choisie. */
  photos: ReadonlyArray<PhotoRef | null>;
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
  /** Non bloquants : photo absente, accent introuvable, taille réduite. */
  warnings: string[];
  /** Bloquants : texte qui ne tient pas, document invalide. */
  problems: string[];
  scenes: ComposedScene[];
}

/** Opacité des paragraphes repris d’une story précédente (mesurée ≈ 40 % sur la référence). */
export const CONTINUATION_OPACITY = 0.4;
const SIZE_STEP = 1;

const isHookStory = (index: number) => index === 0;

/** Polices à charger avant composeSequence (accroche et corps du style, avec le texte réel). */
export function fontRequirementsForSequence(plan: StoryPlan, styleId: string): FontRequirement[] {
  const style = getStyle(styleId);
  const requirements: FontRequirement[] = [];
  plan.stories.forEach((story, index) => {
    const settings = isHookStory(index) ? style.hook : style.body;
    const font = resolveFont(settings.font.fontId, settings.font.weight, settings.font.style);
    requirements.push({ ...font, text: story.paragraphs.map((p) => composeFrench(p.text)).join("") });
  });
  return mergeRequirements(requirements);
}

function textStyle(preset: StylePreset, settings: TypeSettings, fontSize: number, align: TextStyle["align"]): TextStyle {
  return {
    fontId: settings.font.fontId,
    fontSize,
    fontWeight: settings.font.weight,
    fontStyle: settings.font.style,
    color: preset.colors.text,
    align,
    lineHeight: settings.lineHeight,
    letterSpacing: settings.letterSpacing,
    ...(preset.shadow ? { shadow: preset.shadow } : {}),
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

interface PlacedParagraph {
  paragraph: Paragraph;
  relY: number;
  height: number;
  repeated: boolean;
}

interface SceneLayout {
  fontSize: number;
  style: TextStyle;
  /** Par story de la scène : paragraphes placés (y relatif au haut de la scène). */
  stories: PlacedParagraph[][];
  height: number;
  widthProblems: string[];
  warnings: string[];
}

function layoutScene(
  plan: StoryPlan,
  scene: number[],
  preset: StylePreset,
  settings: TypeSettings,
  fontSize: number,
  geometry: { width: number; align: TextStyle["align"]; paragraphGap: number },
): SceneLayout {
  const style = textStyle(preset, settings, fontSize, geometry.align);
  const gap = geometry.paragraphGap * fontSize;
  const pitch = fontSize * settings.lineHeight;
  const widthProblems = new Set<string>();
  const warnings = new Set<string>();
  const measure = (p: Paragraph) => {
    const layout = layoutRichText({ content: p.text, style, width: geometry.width, accents: p.accents });
    layout.problems.forEach((m) => widthProblems.add(m));
    layout.warnings.forEach((m) => warnings.add(m));
    return layout.contentHeight;
  };

  const stories: PlacedParagraph[][] = [];
  let height = 0;
  for (const storyIndex of scene) {
    const placed: PlacedParagraph[] = [];
    let cursor = 0;
    const continues = SEQUENCE_LAYOUT[storyIndex].continues && stories.length > 0;
    if (continues) {
      // Reprise : mêmes paragraphes, mêmes positions que dans la story précédente.
      const previous = stories[stories.length - 1].filter((p) => !p.repeated);
      for (const p of previous) placed.push({ ...p, repeated: true });
      const last = previous[previous.length - 1];
      cursor = last ? last.relY + last.height + STORY_LAYOUT.body.continuationGap * pitch : 0;
    }
    plan.stories[storyIndex].paragraphs.forEach((paragraph, k) => {
      if (k > 0) cursor += gap;
      const h = measure(paragraph);
      placed.push({ paragraph, relY: cursor, height: h, repeated: false });
      cursor += h;
    });
    height = Math.max(height, cursor);
    stories.push(placed);
  }
  return { fontSize, style, stories, height, widthProblems: [...widthProblems], warnings: [...warnings] };
}

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

/**
 * Compose la séquence : une Slide par story, photo de la scène, paragraphes empilés à leur hauteur réelle.
 * Les stories « suite » reprennent les paragraphes de la story précédente aux mêmes positions (opacité 0,4,
 * sans marquage), puis ajoutent les leurs dessous. Si une scène ne tient pas dans la zone sûre, la taille
 * de TOUTE la scène baisse par paliers jusqu’au minimum du style ; au-delà, problème bloquant.
 */
export function composeSequence(input: ComposeInput): ComposeResult {
  const preset = getStyle(input.styleId);
  const { plan } = input;
  const warnings: string[] = [];
  const problems: string[] = [];
  const scenesOut: ComposedScene[] = [];

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

  const slides: Slide[] = SEQUENCE_LAYOUT.map((entry, index) => ({
    id: `story_${String(index + 1).padStart(2, "0")}`,
    templateId: "sequence-3-photos",
    templateVersion: 1,
    background: background(input.photos[entry.photo] ?? null, preset, entry.continues, entry.photo + 1),
    blocks: [],
  }));

  SEQUENCE_LAYOUT.forEach((entry, index) => {
    if (!input.photos[entry.photo]) warnings.push(`story ${index + 1} : photo ${entry.photo + 1} absente, fond sombre de secours`);
  });

  for (const scene of scenesOf()) {
    const hook = scene.length === 1 && isHookStory(scene[0]);
    const settings = hook ? preset.hook : preset.body;
    const zone = hook ? STORY_LAYOUT.hook : STORY_LAYOUT.body;
    const geometry = hook
      ? { width: STORY_LAYOUT.hook.width, align: "center" as const, paragraphGap: STORY_LAYOUT.hook.paragraphGap }
      : { width: STORY_LAYOUT.body.width, align: "left" as const, paragraphGap: STORY_LAYOUT.body.paragraphGap };
    const x = hook ? (CANVAS_WIDTH - STORY_LAYOUT.hook.width) / 2 : STORY_LAYOUT.body.x;
    const label = scene.length > 1 ? `stories ${scene[0] + 1}-${scene[scene.length - 1] + 1}` : `story ${scene[0] + 1}`;

    let chosen: SceneLayout | null = null;
    let top = 0;
    let last: SceneLayout | null = null;
    for (let size = settings.size; size >= settings.minSize; size -= SIZE_STEP) {
      const candidate = layoutScene(plan, scene, preset, settings, size, geometry);
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
    } else if (chosen.fontSize < settings.size) {
      warnings.push(`${label} : taille réduite de ${settings.size} à ${chosen.fontSize} px pour tenir dans la zone sûre`);
    }
    chosen.warnings.forEach((w) => warnings.push(`${label} : ${w}`));
    top = Math.round(top);
    scenesOut.push({ stories: scene, fontSize: chosen.fontSize, top, height: Math.round(chosen.height) });

    scene.forEach((storyIndex, position) => {
      const slide = slides[storyIndex];
      let newIndex = 0;
      let repeatIndex = 0;
      slide.blocks = chosen.stories[position].map((placed, z): TextBlock => {
        const repeated = placed.repeated;
        const k = repeated ? repeatIndex++ : newIndex++;
        const block: TextBlock = {
          id: `s${storyIndex + 1}_${repeated ? "r" : "p"}${k + 1}`,
          kind: "text",
          x,
          y: top + Math.round(placed.relY),
          width: geometry.width,
          height: Math.ceil(placed.height),
          zIndex: z,
          content: placed.paragraph.text,
          style: chosen.style,
          accents: repeated ? [] : [...placed.paragraph.accents],
          marker: {
            ...preset.marker,
            ...(repeated ? {} : { rotationOffset: rotationOffsets.get(`${storyIndex}/${k}`) ?? 0 }),
          },
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
  return { document, warnings, problems, scenes: scenesOut };
}

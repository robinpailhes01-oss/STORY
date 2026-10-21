import {
  FONT_FACES,
  cssFont,
  faceLabel,
  isMissingGlyph,
  parseUnicodeRange,
  type FontFaceFile,
  type FontStyle,
} from "./registry";

export interface FontRequirement {
  family: string;
  weight: number;
  /** « normal » si absent. */
  style?: FontStyle;
  /** Tout le texte qui sera dessiné avec cette police. */
  text: string;
}

export interface LoadedFontReport {
  family: string;
  weight: number;
  style: FontStyle;
  files: string[];
}

const registered = new Map<string, FontFace>();

function registerFace(face: FontFaceFile): FontFace {
  const existing = registered.get(face.file);
  if (existing) return existing;
  const fontFace = new FontFace(face.family, `url(${face.file}) format("woff2")`, {
    weight: String(face.weight),
    style: face.style,
    unicodeRange: face.unicodeRange,
    display: "block",
  });
  document.fonts.add(fontFace);
  registered.set(face.file, fontFace);
  return fontFace;
}

function covers(face: FontFaceFile, codePoint: number): boolean {
  return parseUnicodeRange(face.unicodeRange).some(([a, b]) => codePoint >= a && codePoint <= b);
}

let probeCtx: CanvasRenderingContext2D | null = null;

/**
 * Contrôle au rendu : un caractère vient bien de la police si sa largeur ne change pas
 * quand on change la famille de secours (monospace puis serif).
 */
function drawnWithFallback(family: string, weight: number, style: FontStyle, char: string): boolean {
  probeCtx ??= document.createElement("canvas").getContext("2d");
  if (!probeCtx) throw new Error("Canvas 2D indisponible");
  const base = cssFont(family, weight, 64, style);
  probeCtx.font = `${base}, monospace`;
  const a = probeCtx.measureText(char).width;
  probeCtx.font = `${base}, serif`;
  const b = probeCtx.measureText(char).width;
  return Math.abs(a - b) > 0.01;
}

/** Regroupe les besoins par face (famille, graisse, style) en concaténant le texte. */
export function mergeRequirements(requirements: FontRequirement[]): FontRequirement[] {
  const byFace = new Map<string, FontRequirement>();
  for (const req of requirements) {
    const style = req.style ?? "normal";
    const key = `${req.family}/${req.weight}/${style}`;
    const current = byFace.get(key) ?? { family: req.family, weight: req.weight, style, text: "" };
    current.text += req.text;
    byFace.set(key, current);
  }
  return [...byFace.values()];
}

/**
 * Déclare les fichiers de public/fonts/, attend document.fonts.load() pour chaque police requise,
 * puis vérifie que chaque caractère à dessiner a un glyphe dans un fichier chargé.
 * Lève une erreur lisible plutôt que de laisser le navigateur prendre une police de secours.
 */
export async function loadFonts(requirements: FontRequirement[]): Promise<LoadedFontReport[]> {
  const problems: string[] = [];
  const reports: LoadedFontReport[] = [];

  for (const req of mergeRequirements(requirements)) {
    const style = req.style ?? "normal";
    const label = faceLabel(req.family, req.weight, style);
    const faces = FONT_FACES.filter((f) => f.family === req.family && f.weight === req.weight && f.style === style);
    if (!faces.length) {
      problems.push(`${label} n’est pas dans public/fonts/`);
      continue;
    }
    faces.forEach(registerFace);

    let loaded: FontFace[] = [];
    try {
      loaded = await document.fonts.load(cssFont(req.family, req.weight, 64, style), req.text || "A");
    } catch (error) {
      problems.push(`${label} : échec du chargement (${String(error)})`);
      continue;
    }
    if (!loaded.length) {
      problems.push(`${label} : aucun fichier chargé`);
      continue;
    }

    const loadedFaces = faces.filter((f) => registered.get(f.file)?.status === "loaded");
    const uncovered = new Set<string>();
    for (const char of new Set(req.text)) {
      if (char === "\n") continue;
      const cp = char.codePointAt(0)!;
      if (
        isMissingGlyph(req.family, cp) ||
        !loadedFaces.some((f) => covers(f, cp)) ||
        drawnWithFallback(req.family, req.weight, style, char)
      ) {
        uncovered.add(char);
      }
    }
    if (uncovered.size) {
      const list = [...uncovered].map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`);
      problems.push(`${label} : glyphes absents ${list.join(", ")}`);
    }
    reports.push({ family: req.family, weight: req.weight, style, files: loadedFaces.map((f) => f.file) });
  }

  if (problems.length) throw new Error(`Polices indisponibles :\n- ${problems.join("\n- ")}`);
  return reports;
}

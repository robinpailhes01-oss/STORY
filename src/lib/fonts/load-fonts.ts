import { FONT_FACES, MISSING_GLYPHS, cssFont, parseUnicodeRange, type FontFaceFile } from "./registry";

export interface FontRequirement {
  family: string;
  weight: number;
  /** Tout le texte qui sera dessiné avec cette police. */
  text: string;
}

export interface LoadedFontReport {
  family: string;
  weight: number;
  files: string[];
}

const registered = new Map<string, FontFace>();

function registerFace(face: FontFaceFile): FontFace {
  const existing = registered.get(face.file);
  if (existing) return existing;
  const fontFace = new FontFace(face.family, `url(${face.file}) format("woff2")`, {
    weight: String(face.weight),
    style: "normal",
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

/**
 * Déclare les fichiers de public/fonts/, attend document.fonts.load() pour chaque police requise,
 * puis vérifie que chaque caractère à dessiner a un glyphe dans un fichier chargé.
 * Lève une erreur lisible plutôt que de laisser le navigateur prendre une police de secours.
 */
export async function loadFonts(requirements: FontRequirement[]): Promise<LoadedFontReport[]> {
  const problems: string[] = [];
  const reports: LoadedFontReport[] = [];

  for (const req of requirements) {
    const faces = FONT_FACES.filter((f) => f.family === req.family && f.weight === req.weight);
    if (!faces.length) {
      problems.push(`${req.family} ${req.weight} n’est pas dans public/fonts/`);
      continue;
    }
    faces.forEach(registerFace);

    let loaded: FontFace[] = [];
    try {
      loaded = await document.fonts.load(cssFont(req.family, req.weight, 64), req.text);
    } catch (error) {
      problems.push(`${req.family} ${req.weight} : échec du chargement (${String(error)})`);
      continue;
    }
    if (!loaded.length) {
      problems.push(`${req.family} ${req.weight} : aucun fichier chargé`);
      continue;
    }

    const loadedFaces = faces.filter((f) => registered.get(f.file)?.status === "loaded");
    const uncovered = new Set<string>();
    for (const char of req.text) {
      const cp = char.codePointAt(0)!;
      if (char === "\n") continue;
      if (MISSING_GLYPHS.has(char) || !loadedFaces.some((f) => covers(f, cp))) uncovered.add(char);
    }
    if (uncovered.size) {
      const list = [...uncovered].map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`);
      problems.push(`${req.family} ${req.weight} : glyphes absents ${list.join(", ")}`);
    }
    reports.push({ family: req.family, weight: req.weight, files: loadedFaces.map((f) => f.file) });
  }

  if (problems.length) throw new Error(`Polices indisponibles :\n- ${problems.join("\n- ")}`);
  return reports;
}

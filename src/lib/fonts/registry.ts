// Registre des polices autorisées. Seuls ces fichiers (public/fonts/, licence OFL) peuvent être dessinés.
// Un fontId désigne une famille en romain ; la graisse vient de style.fontWeight.

export interface FontFaceFile {
  family: string;
  weight: number;
  file: string;
  /** unicode-range des sous-ensembles Fontsource (latin, latin-ext). */
  unicodeRange: string;
}

const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT =
  "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";

/**
 * Caractères absents des fichiers malgré l’unicode-range déclaré (vérifié avec fontTools).
 * U+202F (espace fine insécable) manque dans Inter et Jost : la composition utilise U+00A0.
 */
export const MISSING_GLYPHS = new Set([" "]);

function faces(family: string, slug: string, weights: number[]): FontFaceFile[] {
  return weights.flatMap((weight) => [
    { family, weight, file: `/fonts/${slug}-latin-${weight}-normal.woff2`, unicodeRange: LATIN },
    { family, weight, file: `/fonts/${slug}-latin-ext-${weight}-normal.woff2`, unicodeRange: LATIN_EXT },
  ]);
}

export const FONT_FACES: FontFaceFile[] = [
  ...faces("Inter", "inter", [400, 700, 800]),
  ...faces("Jost", "jost", [400, 700]),
];

export const FONT_REGISTRY: Record<string, { family: string }> = {
  "inter-regular": { family: "Inter" },
  "jost-regular": { family: "Jost" },
};

export function resolveFont(fontId: string, weight: number): { family: string; weight: number } {
  const entry = FONT_REGISTRY[fontId];
  if (!entry) throw new Error(`Police inconnue : « ${fontId} »`);
  const available = FONT_FACES.some((f) => f.family === entry.family && f.weight === weight);
  if (!available) throw new Error(`Graisse ${weight} non fournie pour ${entry.family}`);
  return { family: entry.family, weight };
}

/** Chaîne `font` canvas/CSS. Pas de famille de secours : un échec doit se voir, pas se remplacer. */
export function cssFont(family: string, weight: number, size: number): string {
  return `${weight} ${size}px "${family}"`;
}

export function parseUnicodeRange(range: string): Array<[number, number]> {
  return range.split(",").map((part) => {
    const [start, end] = part.trim().replace(/^U\+/i, "").split("-");
    return [parseInt(start, 16), parseInt(end ?? start, 16)];
  });
}

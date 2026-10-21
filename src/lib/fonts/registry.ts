// Registre des polices autorisées. Seuls ces fichiers (public/fonts/, licences OFL) peuvent être dessinés.
// Un fontId désigne une famille ; la graisse vient de style.fontWeight, l’italique de style.fontStyle.

export type FontStyle = "normal" | "italic";

export interface FontFaceFile {
  family: string;
  weight: number;
  style: FontStyle;
  file: string;
  /** unicode-range des sous-ensembles Fontsource (latin, latin-ext). */
  unicodeRange: string;
}

const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT =
  "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";

/**
 * Caractères absents du fichier « latin » de chaque famille malgré l’unicode-range déclaré
 * (relevé avec fontTools sur chaque graisse et chaque style : la liste est identique dans une famille).
 * Utiles en français : U+202F (espace fine insécable) manque partout, d’où U+00A0 dans la composition ;
 * U+2009 (espace fine) manque dans Poppins, Jost et DM Serif Display ; U+2011 (trait d’union insécable)
 * et U+2010 manquent partout. ’ « » … – — et les lettres accentuées sont présents dans toutes.
 */
export const MISSING_GLYPHS: Record<string, string> = {
  Inter:
    "U+007F-009F,U+00AD,U+0329,U+2000-2001,U+2003-2008,U+200A,U+200C-2012,U+2015-2017,U+201B,U+201F-2021,U+2023-2025,U+2027-2031,U+2034-2038,U+203B-2043,U+2045-206F,U+2215,U+FFFD",
  Jost: "U+007F-009F,U+02BB-02BC,U+0329,U+2000-2012,U+2015-2017,U+201B,U+201F-2021,U+2023-2025,U+2027-2038,U+203B-2043,U+2045-206F,U+2191,U+2193,U+FEFF,U+FFFD",
  Poppins:
    "U+007F-009F,U+02BB,U+0304,U+0308,U+0329,U+2000-2012,U+2015-2017,U+201B,U+201F-2021,U+2023-2025,U+2027-2038,U+203B-2043,U+2045-206F,U+2191,U+2193,U+FEFF,U+FFFD",
  "DM Serif Display":
    "U+007F-009F,U+02BB-02BC,U+0329,U+2000-2012,U+2015-2017,U+201B,U+201F-2021,U+2023-2025,U+2027-2038,U+203B-2043,U+2045-206F,U+2191,U+2193,U+FEFF,U+FFFD",
  Tinos: "U+007F-009F,U+2000-2001,U+2003-2008,U+200A,U+200C-2012,U+2015-2017,U+201B,U+201F-2021,U+2023-2025,U+2027-2031,U+2034-2038,U+203B-2043,U+2045-206F",
  // Phase 3 (relevé fontTools sur les fichiers Fontsource 5.3.0) : Ÿ est dans le fichier latin-ext.
  Anton:
    "U+007F-009F,U+2000-2008,U+200A,U+200C-2012,U+2015-2017,U+201B,U+201F-2021,U+2023-2025,U+2027-2031,U+2034-2038,U+203B-2043,U+2045-206F,U+FEFF,U+FFFD",
  "Abril Fatface":
    "U+007F-009F,U+02BB,U+0304,U+0308,U+0329,U+2000-2012,U+2015-2017,U+201B,U+201F-2021,U+2023-2025,U+2027-2038,U+203B-2043,U+2045-206F,U+2191,U+2193,U+FEFF,U+FFFD",
  "Playfair Display":
    "U+007F-009F,U+00B5,U+0329,U+2000-2008,U+200A-2012,U+2015-2017,U+201B,U+201F-2021,U+2023-2025,U+2027-2031,U+2034-2038,U+203B-2043,U+2045-206F,U+2215,U+FEFF,U+FFFD",
};

function faces(family: string, slug: string, variants: Array<[number, FontStyle]>): FontFaceFile[] {
  return variants.flatMap(([weight, style]) => [
    { family, weight, style, file: `/fonts/${slug}-latin-${weight}-${style}.woff2`, unicodeRange: LATIN },
    { family, weight, style, file: `/fonts/${slug}-latin-ext-${weight}-${style}.woff2`, unicodeRange: LATIN_EXT },
  ]);
}

export const FONT_FACES: FontFaceFile[] = [
  ...faces("Inter", "inter", [
    [400, "normal"],
    [700, "normal"],
    [800, "normal"],
    [700, "italic"],
    [800, "italic"],
  ]),
  ...faces("Jost", "jost", [
    [400, "normal"],
    [700, "normal"],
  ]),
  ...faces("Poppins", "poppins", [
    [500, "normal"],
    [600, "normal"],
    [700, "normal"],
  ]),
  ...faces("DM Serif Display", "dm-serif-display", [[400, "normal"]]),
  ...faces("Tinos", "tinos", [
    [400, "normal"],
    [700, "normal"],
    [400, "italic"],
  ]),
  ...faces("Anton", "anton", [[400, "normal"]]),
  ...faces("Abril Fatface", "abril-fatface", [[400, "normal"]]),
  ...faces("Playfair Display", "playfair-display", [[400, "normal"]]),
];

/** fontId → famille. « inter-regular » et « jost-regular » restent pour l’exemple Luma de S1. */
export const FONT_REGISTRY: Record<string, { family: string }> = {
  "inter-regular": { family: "Inter" },
  "jost-regular": { family: "Jost" },
  inter: { family: "Inter" },
  poppins: { family: "Poppins" },
  "dm-serif-display": { family: "DM Serif Display" },
  tinos: { family: "Tinos" },
  anton: { family: "Anton" },
  "abril-fatface": { family: "Abril Fatface" },
  "playfair-display": { family: "Playfair Display" },
};

export interface ResolvedFont {
  family: string;
  weight: number;
  style: FontStyle;
}

export function resolveFont(fontId: string, weight: number, style: FontStyle = "normal"): ResolvedFont {
  const entry = FONT_REGISTRY[fontId];
  if (!entry) throw new Error(`Police inconnue : « ${fontId} »`);
  const available = FONT_FACES.some((f) => f.family === entry.family && f.weight === weight && f.style === style);
  if (!available) {
    throw new Error(`${entry.family} ${weight}${style === "italic" ? " italique" : ""} n’est pas fournie dans public/fonts/`);
  }
  return { family: entry.family, weight, style };
}

/** Chaîne `font` canvas/CSS. Pas de famille de secours : un échec doit se voir, pas se remplacer. */
export function cssFont(family: string, weight: number, size: number, style: FontStyle = "normal"): string {
  return `${style === "italic" ? "italic " : ""}${weight} ${size}px "${family}"`;
}

export function parseUnicodeRange(range: string): Array<[number, number]> {
  return range.split(",").map((part) => {
    const [start, end] = part.trim().replace(/^U\+/i, "").split("-");
    return [parseInt(start, 16), parseInt(end ?? start, 16)];
  });
}

const missingCache = new Map<string, Array<[number, number]>>();

/** Vrai si le caractère n’a pas de glyphe dans les fichiers de la famille (relevé fontTools). */
export function isMissingGlyph(family: string, codePoint: number): boolean {
  let ranges = missingCache.get(family);
  if (!ranges) {
    ranges = MISSING_GLYPHS[family] ? parseUnicodeRange(MISSING_GLYPHS[family]) : [];
    missingCache.set(family, ranges);
  }
  return ranges.some(([a, b]) => codePoint >= a && codePoint <= b);
}

/** Libellé lisible d’une face : « Inter 800 italique ». */
export function faceLabel(family: string, weight: number, style: FontStyle = "normal"): string {
  return `${family} ${weight}${style === "italic" ? " italique" : ""}`;
}

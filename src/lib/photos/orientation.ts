// Orientation EXIF : sonde des capacités du navigateur et rotation manuelle sur canvas.
//
// Les navigateurs récents appliquent l’orientation EXIF au décodage
// (createImageBitmap avec imageOrientation: "from-image", ou <img>). Ce n’est pas garanti partout,
// et certaines versions refusent la valeur "from-image" ou ignorent la réduction au décodage :
// on le vérifie une fois par session avec une petite image dont on connaît le résultat attendu.

/**
 * Sonde : JPEG 16 × 8 stocké, moitié gauche rouge, moitié droite bleue, EXIF Orientation = 6.
 * Redressée, elle mesure 8 × 16, rouge en haut, bleu en bas.
 * (Générée par tests/fixtures/photos/make-fixtures.py.)
 */
const PROBE_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/4QAiRXhpZgAATU0AKgAAAAgAAQESAAMAAAABAAYAAAAAAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAAIABADAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5Pr8HP9oDzuv96D/nXP/Z";

export interface OrientationSupport {
  /** createImageBitmap(Blob) disponible et capable de décoder un JPEG. */
  bitmap: boolean;
  /** Options acceptées par createImageBitmap (vide si "from-image" est refusé). */
  bitmapOptions: ImageBitmapOptions;
  /** createImageBitmap applique l’orientation EXIF avec ces options. */
  bitmapOriented: boolean;
  /** createImageBitmap sait réduire au décodage, après orientation, sans déformer. */
  bitmapResize: boolean;
  /** <img> + drawImage appliquent l’orientation EXIF (chemin de secours sans createImageBitmap). */
  elementOriented: boolean;
}

type Rgb = [number, number, number];

function probeBlob(): Blob {
  const raw = atob(PROBE_JPEG_BASE64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type: "image/jpeg" });
}

/** Lit deux pixels (quart haut, quart bas) d’une source dessinée à sa taille. */
function readTopBottom(source: CanvasImageSource, width: number, height: number): { top: Rgb; bottom: Rgb } | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, width, height);
    const px = (y: number): Rgb => {
      const d = ctx.getImageData(Math.floor(width / 2), y, 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    return { top: px(Math.floor(height / 4)), bottom: px(Math.floor((height * 3) / 4)) };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

const isRed = ([r, g, b]: Rgb) => r > 150 && g < 100 && b < 100;
const isBlue = ([r, g, b]: Rgb) => b > 150 && r < 100 && g < 120;

/** Vrai si la source est la sonde redressée : w × h, rouge en haut, bleu en bas. */
function looksUpright(source: CanvasImageSource, width: number, height: number, w: number, h: number): boolean {
  if (width !== w || height !== h) return false;
  const px = readTopBottom(source, width, height);
  return !!px && isRed(px.top) && isBlue(px.bottom);
}

async function probeBitmap(blob: Blob): Promise<Pick<OrientationSupport, "bitmap" | "bitmapOptions" | "bitmapOriented" | "bitmapResize">> {
  const none = { bitmap: false, bitmapOptions: {}, bitmapOriented: false, bitmapResize: false };
  if (typeof createImageBitmap !== "function") return none;

  let options: ImageBitmapOptions = { imageOrientation: "from-image" };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, options);
  } catch (error) {
    // Valeur "from-image" inconnue de ce navigateur : on réessaie sans options.
    if (!(error instanceof TypeError)) return none;
    options = {};
    try {
      bitmap = await createImageBitmap(blob);
    } catch {
      return none;
    }
  }
  const oriented = looksUpright(bitmap, bitmap.width, bitmap.height, 8, 16);
  bitmap.close();

  let resize = false;
  if (oriented) {
    try {
      const small = await createImageBitmap(blob, { ...options, resizeWidth: 4, resizeHeight: 8, resizeQuality: "high" });
      resize = looksUpright(small, small.width, small.height, 4, 8);
      small.close();
    } catch {
      resize = false;
    }
  }
  return { bitmap: true, bitmapOptions: options, bitmapOriented: oriented, bitmapResize: resize };
}

async function probeElement(blob: Blob): Promise<boolean> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return looksUpright(img, img.naturalWidth, img.naturalHeight, 8, 16);
  } catch {
    return false;
  } finally {
    URL.revokeObjectURL(url);
  }
}

let support: Promise<OrientationSupport> | null = null;

/** Capacités du navigateur, mesurées une seule fois par session. */
export function getOrientationSupport(): Promise<OrientationSupport> {
  if (!support) {
    support = (async () => {
      const blob = probeBlob();
      const bitmap = await probeBitmap(blob);
      const elementOriented = await probeElement(blob);
      return { ...bitmap, elementOriented };
    })();
  }
  return support;
}

/**
 * Dessine `source` (pixels stockés, non orientés) sur `ctx` en appliquant l’orientation EXIF.
 * `width` × `height` sont les dimensions de sortie, déjà redressées.
 */
export function drawOriented(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  orientation: number,
  width: number,
  height: number,
): void {
  const w = width;
  const h = height;
  ctx.save();
  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, w, 0); break; // miroir horizontal
    case 3: ctx.transform(-1, 0, 0, -1, w, h); break; // 180°
    case 4: ctx.transform(1, 0, 0, -1, 0, h); break; // miroir vertical
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break; // transposition
    case 6: ctx.transform(0, 1, -1, 0, w, 0); break; // 90° horaire
    case 7: ctx.transform(0, -1, -1, 0, w, h); break; // transversale
    case 8: ctx.transform(0, -1, 1, 0, 0, h); break; // 90° antihoraire
    default: break;
  }
  // Dans le repère transformé, l’image stockée garde ses axes : largeur et hauteur s’échangent pour 5 à 8.
  const swap = orientation >= 5 && orientation <= 8;
  ctx.drawImage(source, 0, 0, swap ? h : w, swap ? w : h);
  ctx.restore();
}

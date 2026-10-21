// Contraste WCAG 2.x entre une couleur de texte et les pixels réels du fond (photo, voile et grain compris).

export const MIN_CONTRAST = 4.5;

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function contrastRatio(l1: number, l2: number): number {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export interface BackgroundSample {
  /** Luminance relative moyenne des pixels (moyenne en lumière linéaire). */
  luminance: number;
  /** Couleur moyenne sRGB (pour mélanger un texte semi-transparent). */
  rgb: [number, number, number];
  pixels: number;
}

/** Moyenne des pixels de `data` (canvas width × height) dans des rectangles exprimés dans le même repère. */
export function sampleRects(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  rects: Array<{ x: number; y: number; width: number; height: number }>,
): BackgroundSample {
  let lum = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const rect of rects) {
    const x0 = Math.max(0, Math.floor(rect.x));
    const y0 = Math.max(0, Math.floor(rect.y));
    const x1 = Math.min(width, Math.ceil(rect.x + rect.width));
    const y1 = Math.min(height, Math.ceil(rect.y + rect.height));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        lum += relativeLuminance(data[i], data[i + 1], data[i + 2]);
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n++;
      }
    }
  }
  if (!n) return { luminance: 0, rgb: [0, 0, 0], pixels: 0 };
  return { luminance: lum / n, rgb: [r / n, g / n, b / n], pixels: n };
}

/** Contraste d’un texte (opacité comprise : mélangé au fond moyen) sur un fond échantillonné. */
export function textContrast(textHex: string, opacity: number, background: BackgroundSample): number {
  const [tr, tg, tb] = hexToRgb(textHex);
  const [br, bg, bb] = background.rgb;
  const mix = (t: number, b: number) => t * opacity + b * (1 - opacity);
  const lt = relativeLuminance(mix(tr, br), mix(tg, bg), mix(tb, bb));
  return contrastRatio(lt, background.luminance);
}

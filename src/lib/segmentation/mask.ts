// Traitement du masque, en fonctions pures (testées sous Node) :
// confiance « personne » à partir des sorties du modèle, lissage, filtre guidé, couverture.
// Toutes les valeurs de masque sont des Float32Array de 0 à 1, rangées ligne par ligne.

export interface MaskSize {
  width: number;
  height: number;
}

/** Courbe en S entre `low` et `high` (0 en dessous, 1 au-dessus). */
export function smoothstep(low: number, high: number, value: number): number {
  if (value <= low) return 0;
  if (value >= high) return 1;
  const t = (value - low) / (high - low);
  return t * t * (3 - 2 * t);
}

/**
 * Confiance « personne » à partir des masques de confiance du modèle.
 * - Un seul masque (selfie_segmenter) : c’est déjà la personne.
 * - Plusieurs (modèle multiclasse : fond, cheveux, peau, vêtements…) : 1 − fond.
 *   Le fond est la classe nommée « background », sinon la première.
 */
export function personConfidence(masks: readonly Float32Array[], labels: readonly string[] = []): Float32Array {
  if (masks.length === 0) throw new Error("aucun masque de confiance");
  const size = masks[0].length;
  if (masks.some((m) => m.length !== size)) throw new Error("masques de tailles différentes");
  if (masks.length === 1) return Float32Array.from(masks[0], clamp01);
  const named = labels.findIndex((l) => l.trim().toLowerCase() === "background");
  const background = masks[named >= 0 && named < masks.length ? named : 0];
  const out = new Float32Array(size);
  for (let i = 0; i < size; i++) out[i] = clamp01(1 - background[i]);
  return out;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Moyenne sur une fenêtre carrée de rayon `radius` (côté 2r + 1), fenêtre coupée aux bords
 * (moyenne sur les seuls pixels présents). Séparable, coût indépendant du rayon.
 */
export function boxMean(src: Float32Array, { width, height }: MaskSize, radius: number): Float32Array {
  checkSize(src, width, height);
  const r = Math.max(0, Math.floor(radius));
  if (r === 0) return Float32Array.from(src);
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  // Passe horizontale.
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let x = 0; x <= Math.min(r, width - 1); x++) sum += src[row + x];
    for (let x = 0; x < width; x++) {
      const lo = Math.max(0, x - r);
      const hi = Math.min(width - 1, x + r);
      tmp[row + x] = sum / (hi - lo + 1);
      const add = x + r + 1;
      const remove = x - r;
      if (add < width) sum += src[row + add];
      if (remove >= 0) sum -= src[row + remove];
    }
  }
  // Passe verticale.
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = 0; y <= Math.min(r, height - 1); y++) sum += tmp[y * width + x];
    for (let y = 0; y < height; y++) {
      const lo = Math.max(0, y - r);
      const hi = Math.min(height - 1, y + r);
      out[y * width + x] = sum / (hi - lo + 1);
      const add = y + r + 1;
      const remove = y - r;
      if (add < height) sum += tmp[add * width + x];
      if (remove >= 0) sum -= tmp[remove * width + x];
    }
  }
  return out;
}

/** Flou proche d’un flou gaussien : deux moyennes successives. */
export function blurMask(src: Float32Array, size: MaskSize, radius: number): Float32Array {
  if (radius <= 0) return Float32Array.from(src);
  return boxMean(boxMean(src, size, radius), size, radius);
}

/**
 * Filtre guidé (He et al.), version « rapide » : coefficients calculés à la résolution du masque,
 * puis appliqués à pleine définition avec `applyGuidedCoefficients`. Le masque suit alors
 * les contours de la photo (épaules, mèches) au lieu des gros pixels du modèle.
 * `guide` : luminance 0..1 à la résolution du masque ; `eps` règle la fidélité aux contours.
 */
export function guidedCoefficients(
  guide: Float32Array,
  mask: Float32Array,
  size: MaskSize,
  radius: number,
  eps: number,
): { a: Float32Array; b: Float32Array } {
  checkSize(guide, size.width, size.height);
  checkSize(mask, size.width, size.height);
  const n = guide.length;
  const ii = new Float32Array(n);
  const ip = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    ii[i] = guide[i] * guide[i];
    ip[i] = guide[i] * mask[i];
  }
  const meanI = boxMean(guide, size, radius);
  const meanP = boxMean(mask, size, radius);
  const corrI = boxMean(ii, size, radius);
  const corrIp = boxMean(ip, size, radius);
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const varI = corrI[i] - meanI[i] * meanI[i];
    const covIp = corrIp[i] - meanI[i] * meanP[i];
    a[i] = covIp / (varI + eps);
    b[i] = meanP[i] - a[i] * meanI[i];
  }
  return { a: boxMean(a, size, radius), b: boxMean(b, size, radius) };
}

/** Réglages de la mise au net finale de l’alpha (courbe en S après le filtre guidé). */
export interface AlphaCurve {
  low: number;
  high: number;
}

/**
 * Applique les coefficients (résolution du masque) à une image pleine définition, en place :
 * alpha = courbe(A·I + B), A et B interpolés linéairement, I = luminance du pixel.
 * Avec `coefficients.mask` (le masque d’origine, même grille), le filtre guidé n’agit que là où le
 * modèle hésite : q = u·(A·I + B) + (1 − u)·P, u = 1 − |2P − 1|. Les zones sûres (visage, fond
 * net) gardent la décision du modèle, la bande de transition se recale sur les contours.
 * `rgba` : données RGBA (ImageData.data) de taille `full` ; l’alpha d’origine est remplacé.
 */
export function applyGuidedCoefficients(
  rgba: Uint8ClampedArray,
  full: MaskSize,
  coefficients: { a: Float32Array; b: Float32Array; mask?: Float32Array },
  low: MaskSize,
  curve: AlphaCurve,
): void {
  if (rgba.length !== full.width * full.height * 4) throw new Error("taille RGBA incohérente");
  checkSize(coefficients.a, low.width, low.height);
  checkSize(coefficients.b, low.width, low.height);
  const { a, b, mask } = coefficients;
  if (mask) checkSize(mask, low.width, low.height);
  // Correspondance des colonnes (centres de pixels alignés), calculée une fois.
  const sx = low.width / full.width;
  const x0s = new Int32Array(full.width);
  const x1s = new Int32Array(full.width);
  const fxs = new Float32Array(full.width);
  for (let x = 0; x < full.width; x++) {
    const gx = Math.min(Math.max((x + 0.5) * sx - 0.5, 0), low.width - 1);
    const x0 = Math.floor(gx);
    x0s[x] = x0;
    x1s[x] = Math.min(x0 + 1, low.width - 1);
    fxs[x] = gx - x0;
  }
  const sy = low.height / full.height;
  const span = curve.high - curve.low;
  for (let y = 0; y < full.height; y++) {
    const gy = Math.min(Math.max((y + 0.5) * sy - 0.5, 0), low.height - 1);
    const y0 = Math.floor(gy);
    const y1 = Math.min(y0 + 1, low.height - 1);
    const fy = gy - y0;
    const r0 = y0 * low.width;
    const r1 = y1 * low.width;
    let p = y * full.width * 4;
    for (let x = 0; x < full.width; x++, p += 4) {
      const i00 = r0 + x0s[x];
      const i01 = r0 + x1s[x];
      const i10 = r1 + x0s[x];
      const i11 = r1 + x1s[x];
      const fx = fxs[x];
      const w00 = (1 - fx) * (1 - fy);
      const w01 = fx * (1 - fy);
      const w10 = (1 - fx) * fy;
      const w11 = fx * fy;
      const A = a[i00] * w00 + a[i01] * w01 + a[i10] * w10 + a[i11] * w11;
      const B = b[i00] * w00 + b[i01] * w01 + b[i10] * w10 + b[i11] * w11;
      const lum = (0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]) / 255;
      let q = A * lum + B;
      if (mask) {
        const P = mask[i00] * w00 + mask[i01] * w01 + mask[i10] * w10 + mask[i11] * w11;
        const u = 1 - Math.abs(2 * P - 1);
        q = u * q + (1 - u) * P;
      }
      let alpha: number;
      if (q <= curve.low) alpha = 0;
      else if (q >= curve.high) alpha = 1;
      else {
        const t = (q - curve.low) / span;
        alpha = t * t * (3 - 2 * t);
      }
      rgba[p + 3] = Math.round(alpha * 255);
    }
  }
}

/** Luminance 0..1 d’une image RGBA. */
export function luminance(rgba: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(rgba.length / 4);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = (0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]) / 255;
  }
  return out;
}

/** Part des pixels au-dessus du seuil (0..1). */
export function coverage(mask: Float32Array, threshold = 0.5): number {
  if (mask.length === 0) return 0;
  let count = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] >= threshold) count++;
  return count / mask.length;
}

/**
 * Retire les îlots isolés (faux positifs : reflets, textes, feuillages) : composantes connexes
 * (4-voisinage) au-dessus du seuil dont l’aire est < `minRatio` × aire de la plus grande.
 * Plusieurs personnes de taille comparable sont conservées. Renvoie le nombre d’îlots retirés.
 */
export function removeSmallIslands(mask: Float32Array, { width, height }: MaskSize, minRatio: number, threshold = 0.5): number {
  checkSize(mask, width, height);
  const labels = new Int32Array(mask.length).fill(-1);
  const areas: number[] = [];
  const stack = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start++) {
    if (labels[start] !== -1 || mask[start] < threshold) continue;
    const id = areas.length;
    let area = 0;
    let top = 0;
    stack[top++] = start;
    labels[start] = id;
    while (top > 0) {
      const i = stack[--top];
      area++;
      const x = i % width;
      // 4 voisins, sans allocation (boucle chaude).
      for (let k = 0; k < 4; k++) {
        const j = k === 0 ? (x > 0 ? i - 1 : -1) : k === 1 ? (x < width - 1 ? i + 1 : -1) : k === 2 ? i - width : i + width;
        if (j < 0 || j >= mask.length || labels[j] !== -1 || mask[j] < threshold) continue;
        labels[j] = id;
        stack[top++] = j;
      }
    }
    areas.push(area);
  }
  if (areas.length <= 1) return 0;
  const largest = Math.max(...areas);
  const drop = areas.map((a) => a < largest * minRatio);
  const removed = drop.filter(Boolean).length;
  if (removed === 0) return 0;
  // Un îlot retiré s’éteint avec son halo (pixels sous le seuil voisins) : on l’efface sur son
  // enveloppe dilatée de 2 px pour ne pas laisser de franges.
  const kill = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) if (labels[i] >= 0 && drop[labels[i]]) kill[i] = 1;
  const dilated = dilate(kill, width, height, 2);
  for (let i = 0; i < mask.length; i++) {
    if (dilated[i] && (labels[i] === -1 || drop[labels[i]])) mask[i] = 0;
  }
  return removed;
}

function dilate(src: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  let cur = src;
  for (let step = 0; step < radius; step++) {
    const next = Uint8Array.from(cur);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (cur[i]) continue;
        if ((x > 0 && cur[i - 1]) || (x < width - 1 && cur[i + 1]) || (y > 0 && cur[i - width]) || (y < height - 1 && cur[i + width])) next[i] = 1;
      }
    }
    cur = next;
  }
  return cur;
}

function checkSize(arr: ArrayLike<number>, width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`taille de masque invalide : ${width} × ${height}`);
  }
  if (arr.length !== width * height) throw new Error(`masque de ${arr.length} valeurs pour ${width} × ${height}`);
}

/** Rectangle en coordonnées relatives (0..1) de l’image. */
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Valeur interpolée au point (gx, gy) exprimé en pixels du masque (centres de pixels en i + 0,5). */
export function sampleBilinear(src: Float32Array, { width, height }: MaskSize, gx: number, gy: number): number {
  const x = Math.min(Math.max(gx - 0.5, 0), width - 1);
  const y = Math.min(Math.max(gy - 0.5, 0), height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = x - x0;
  const fy = y - y0;
  const top = src[y0 * width + x0] * (1 - fx) + src[y0 * width + x1] * fx;
  const bottom = src[y1 * width + x0] * (1 - fx) + src[y1 * width + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

/**
 * Zone à re-segmenter de plus près : carré (en pixels de l’image) autour des pixels au-dessus du
 * seuil, agrandi de `padding` (0,25 = +25 % de chaque côté du plus grand côté), recalé dans l’image.
 * null si rien n’est détecté ou si la zone couvre déjà presque toute l’image (aucun gain).
 */
export function subjectRegion(mask: Float32Array, size: MaskSize, padding = 0.25, threshold = 0.5): Region | null {
  checkSize(mask, size.width, size.height);
  let minX = size.width;
  let minY = size.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++) {
      if (mask[y * size.width + x] < threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  const side = Math.max(maxX - minX + 1, maxY - minY + 1) * (1 + 2 * padding);
  const w = Math.min(side, size.width);
  const h = Math.min(side, size.height);
  const cx = (minX + maxX + 1) / 2;
  const cy = (minY + maxY + 1) / 2;
  const x = Math.min(Math.max(cx - w / 2, 0), size.width - w);
  const y = Math.min(Math.max(cy - h / 2, 0), size.height - h);
  const region = { x: x / size.width, y: y / size.height, width: w / size.width, height: h / size.height };
  if (region.width * region.height > 0.8) return null;
  return region;
}

/**
 * Masque à la taille `out` : `base` (toute l’image) partout, remplacé par `detail` (calculé sur
 * `region`) à l’intérieur de la zone, avec un fondu de `band` px de sortie sur les bords de la zone
 * qui ne touchent pas le bord de l’image.
 */
export function composeMasks(
  base: Float32Array,
  baseSize: MaskSize,
  detail: { mask: Float32Array; size: MaskSize; region: Region } | null,
  out: MaskSize,
  band: number,
): Float32Array {
  checkSize(base, baseSize.width, baseSize.height);
  const result = new Float32Array(out.width * out.height);
  const bx = baseSize.width / out.width;
  const by = baseSize.height / out.height;
  const r = detail?.region;
  // Bornes de la zone en px de sortie ; un bord collé à l’image n’a pas de fondu.
  const left = r ? r.x * out.width : 0;
  const top = r ? r.y * out.height : 0;
  const right = r ? (r.x + r.width) * out.width : 0;
  const bottom = r ? (r.y + r.height) * out.height : 0;
  const eps = 1e-6;
  const fadeL = r && r.x > eps;
  const fadeT = r && r.y > eps;
  const fadeR = r && r.x + r.width < 1 - eps;
  const fadeB = r && r.y + r.height < 1 - eps;
  for (let y = 0; y < out.height; y++) {
    const py = y + 0.5;
    for (let x = 0; x < out.width; x++) {
      const px = x + 0.5;
      let value = sampleBilinear(base, baseSize, px * bx, py * by);
      if (detail && r && px >= left && px <= right && py >= top && py <= bottom) {
        let weight = 1;
        if (band > 0) {
          if (fadeL) weight = Math.min(weight, (px - left) / band);
          if (fadeR) weight = Math.min(weight, (right - px) / band);
          if (fadeT) weight = Math.min(weight, (py - top) / band);
          if (fadeB) weight = Math.min(weight, (bottom - py) / band);
          weight = Math.max(0, Math.min(1, weight));
        }
        if (weight > 0) {
          const dx = ((px - left) / (right - left)) * detail.size.width;
          const dy = ((py - top) / (bottom - top)) * detail.size.height;
          value = value * (1 - weight) + sampleBilinear(detail.mask, detail.size, dx, dy) * weight;
        }
      }
      result[y * out.width + x] = value;
    }
  }
  return result;
}

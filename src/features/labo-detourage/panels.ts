// Dessin des vignettes du labo (canvas 2D) et mesures sur l’alpha d’une découpe.

export interface AlphaStats {
  /** Parts de pixels transparents (alpha < 8), opaques (> 247) et intermédiaires (bords). */
  transparent: number;
  opaque: number;
  partial: number;
  /** Boîte englobante de la personne (alpha ≥ 128), en px de la découpe ; null si vide. */
  box: { x: number; y: number; width: number; height: number } | null;
}

/** Mesure l’alpha sur une copie réduite (≤ 540 px) : rapide, suffisant pour le contrôle. */
export function alphaStats(cutout: HTMLCanvasElement): AlphaStats {
  const scale = Math.min(1, 540 / Math.max(cutout.width, cutout.height));
  const w = Math.max(1, Math.round(cutout.width * scale));
  const h = Math.max(1, Math.round(cutout.height * scale));
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const ctx = small.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(cutout, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  let transparent = 0;
  let opaque = 0;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (a < 8) transparent++;
      else if (a > 247) opaque++;
      if (a >= 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const n = w * h;
  return {
    transparent: transparent / n,
    opaque: opaque / n,
    partial: (n - transparent - opaque) / n,
    box:
      maxX < 0
        ? null
        : { x: minX / scale, y: minY / scale, width: (maxX - minX + 1) / scale, height: (maxY - minY + 1) / scale },
  };
}

/** Prépare un canvas d’affichage net (densité de l’écran). */
export function setupCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

export function drawOriginal(canvas: HTMLCanvasElement, image: CanvasImageSource, width: number, height: number): void {
  const ctx = setupCanvas(canvas, width, height);
  ctx.drawImage(image, 0, 0, width, height);
}

/** Masque : personne en blanc sur noir (alpha de la découpe). */
export function drawMask(canvas: HTMLCanvasElement, cutout: HTMLCanvasElement, width: number, height: number): void {
  const ctx = setupCanvas(canvas, width, height);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  const tmp = document.createElement("canvas");
  tmp.width = canvas.width;
  tmp.height = canvas.height;
  const t = tmp.getContext("2d")!;
  t.drawImage(cutout, 0, 0, tmp.width, tmp.height);
  t.globalCompositeOperation = "source-in";
  t.fillStyle = "#fff";
  t.fillRect(0, 0, tmp.width, tmp.height);
  ctx.drawImage(tmp, 0, 0, width, height);
}

/** Découpe sur damier gris. */
export function drawChecker(canvas: HTMLCanvasElement, cutout: HTMLCanvasElement, width: number, height: number): void {
  const ctx = setupCanvas(canvas, width, height);
  const cell = 8;
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      ctx.fillStyle = (x / cell + y / cell) % 2 === 0 ? "#d9d9d9" : "#f4f4f4";
      ctx.fillRect(x, y, cell, cell);
    }
  }
  ctx.drawImage(cutout, 0, 0, width, height);
}

/**
 * Détail des bords : la tête et les épaules (haut de la silhouette) agrandies, sur un fond magenta
 * qui fait ressortir les franges et les trous.
 */
export function drawEdgeZoom(
  canvas: HTMLCanvasElement,
  cutout: HTMLCanvasElement,
  box: AlphaStats["box"],
  width: number,
  height: number,
): void {
  const ctx = setupCanvas(canvas, width, height);
  ctx.fillStyle = "#e0119d";
  ctx.fillRect(0, 0, width, height);
  if (!box) return;
  // Fenêtre au rapport du panneau, centrée sur le haut de la silhouette.
  const regionW = Math.min(cutout.width, Math.max(box.width * 0.8, cutout.width * 0.3));
  const regionH = regionW * (height / width);
  const cx = box.x + box.width / 2;
  const sx = Math.max(0, Math.min(cutout.width - regionW, cx - regionW / 2));
  const sy = Math.max(0, Math.min(cutout.height - regionH, box.y - regionH * 0.08));
  ctx.drawImage(cutout, sx, sy, regionW, regionH, 0, 0, width, height);
}

/**
 * Détail à pleine définition (PNG, 640 × 800 au plus) : haut de la silhouette sur fond magenta.
 * Sert à juger les bords (franges, trous, cheveux) sans réduction.
 */
export function edgeDetail(cutout: HTMLCanvasElement, box: AlphaStats["box"]): string | null {
  if (!box) return null;
  const w = Math.min(640, cutout.width);
  const h = Math.min(800, cutout.height);
  const sx = Math.max(0, Math.min(cutout.width - w, box.x + box.width / 2 - w / 2));
  const sy = Math.max(0, Math.min(cutout.height - h, box.y - h * 0.08));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#e0119d";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(cutout, sx, sy, w, h, 0, 0, w, h);
  return canvas.toDataURL("image/png");
}

// Vérifie le moteur visuel dans un vrai Chromium, sur la page /labo :
//  1. polices réelles (aucun glyphe de secours), toutes les faces des 17 styles chargées ;
//  2. 17 styles × 5 stories sans problème bloquant, accents tous trouvés, rotation des marquages continue,
//     effets propres aux nouveaux styles (capitales, contour, halo, mot géant, inclinaison) ;
//  3. stories 3 et 5 : éléments repris à 40 %, sans marquage, aux mêmes positions que dans la story précédente ;
//  4. contraste mesuré et rapporté pour chaque bloc ;
//  5. options : couleur d’accent, mots en évidence masqués, chaque décoration (hors du texte), 2 photos,
//     un trait de chaque outil du Crayon, mot géant derrière la personne avec un détourage de test ;
//  6. export de quelques styles (et d’une combinaison d’options) : 5 PNG exactement 1080 × 1920, aperçu ≈ PNG ;
//  7. planches dans captures/render/ : une par style, décorations, couleurs, crayon, 2 photos, mot géant.
//
// Usage : npm run build && npm run verify:render
//   BASE_URL=…  viser un serveur déjà lancé ;  REF_DIR=…  dossier des captures de référence (facultatif).

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { chromium } from "playwright";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "captures/render");
const RAW = join(tmpdir(), "story-verify-render");
const W = 1080;
const H = 1920;
const PREVIEW_DPR = 2.5; // aperçu 216 px CSS × 2,5 = 540 px réels, soit la moitié du PNG
const STYLE_COUNT = 17;
const STORY_COUNT = 5;
/** Styles exportés en PNG (les autres sont contrôlés sur l’aperçu, pour garder le script raisonnable). */
const EXPORTED = ["dore", "serif", "lueur", "geant", "liseret", "theatre"];
const DECORATION_IDS = ["fleche-mot", "fleche-suite", "etoiles", "eclair", "etincelles"];

// Captures de référence (story 1 à 5) et zone de la story dans chaque capture (1206 × 2622).
const REF_DIR = process.env.REF_DIR ?? "/root/.claude/uploads/f8eb09df-4038-55b0-be5d-5d8387c1fe49";
const REF_FILES = ["d70b3bc7-image.png", "49d949ca-image.png", "8695e7b5-image.png", "86d8f046-image.png", "1aa94daf-image.png"];
const REF_BOX = { x: 269, y: 554, width: 667, height: 1192 };
// Grilles de styles de la référence (tuiles 1 à 10, puis 9 à 17) : comparaison locale, jamais versionnée.
const REF_TILES = [
  { file: "23fca952-image.png", box: { x: 30, y: 1530, width: 1150, height: 600 } },
  { file: "5c362d77-image.png", box: { x: 30, y: 1330, width: 1150, height: 720 } },
];

const failures = [];
const started = Date.now();
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(0).padStart(3)} s`;
const check = (ok, message) => {
  console.log(`${ok ? "✔" : "✘"} ${elapsed()} · ${message}`);
  if (!ok) failures.push(message);
};

function pngSize(buffer) {
  const signature = buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  const ihdr = buffer.subarray(12, 16).toString("ascii") === "IHDR";
  if (!signature || !ihdr) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function startServer() {
  if (process.env.BASE_URL) return { url: process.env.BASE_URL, stop: () => {} };
  const port = 3198;
  // Groupe de processus à part : npx lance next-server en enfant, il faut arrêter tout le groupe.
  const child = spawn("npx", ["next", "start", "-p", String(port)], { cwd: ROOT, stdio: "ignore", detached: true });
  const stop = () => {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  };
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) return { url, stop };
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  stop();
  throw new Error("le serveur Next.js n’a pas démarré (npm run build d’abord ?)");
}

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  return existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
}

async function download(page, selector, target) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click(selector)]);
  await dl.saveAs(target);
  return { name: dl.suggestedFilename(), buffer: readFileSync(target) };
}

const toUrl = (b, type = "image/png") => `data:${type};base64,${b.toString("base64")}`;
const same = (a, b) => Math.abs(a - b) < 0.01;
const slideId = (i) => `story_${String(i + 1).padStart(2, "0")}`;

const server = await startServer();
const browser = await chromium.launch({ executablePath: chromiumPath() });
try {
  mkdirSync(RAW, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
    deviceScaleFactor: PREVIEW_DPR,
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(`${server.url}/labo`);
  await page.waitForSelector('[data-render-state="ready"], [data-render-state="error"]', { timeout: 120_000 });
  check((await page.getAttribute("[data-render-state]", "data-render-state")) === "ready", "laboratoire prêt : polices, photos, compositions et mesures de contraste");
  check((await page.locator("main [role=alert]").count()) === 0, "aucune erreur affichée (polices, photos, problèmes bloquants)");

  // Page de calcul : comparaisons de pixels hors du laboratoire.
  const lab = await context.newPage();
  await lab.setContent("<body style='margin:0'></body>");
  await lab.evaluate(() => {
    const load = (src) => new Promise((ok, ko) => Object.assign(new Image(), { onload() { ok(this); }, onerror: ko, src }));
    const pixels = async (src, w, h) => {
      const img = await load(src);
      w ??= img.naturalWidth;
      h ??= img.naturalHeight;
      const c = new OffscreenCanvas(w, h);
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);
      return { data: ctx.getImageData(0, 0, w, h).data, w, h };
    };
    const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    window.px = {
      /** Écart moyen et part de pixels très différents entre deux images ramenées à la taille de la première. */
      async diff(a, b) {
        const pa = await pixels(a);
        const pb = await pixels(b, pa.w, pa.h);
        let sum = 0;
        let strong = 0;
        for (let i = 0; i < pa.data.length; i += 4) {
          const d = (Math.abs(pa.data[i] - pb.data[i]) + Math.abs(pa.data[i + 1] - pb.data[i + 1]) + Math.abs(pa.data[i + 2] - pb.data[i + 2])) / 3;
          sum += d;
          if (d > 64) strong++;
        }
        return { w: pa.w, h: pa.h, mean: sum / (pa.w * pa.h), strongPct: (100 * strong) / (pa.w * pa.h) };
      },
      /** Pixels proches d’une couleur (distance euclidienne < tol), dans un rectangle en fraction de l’image. */
      async near(src, color, tol = 60, rect = { x: 0, y: 0, width: 1, height: 1 }) {
        const p = await pixels(src);
        const [r, g, b] = hex(color);
        const x0 = Math.floor(rect.x * p.w);
        const y0 = Math.floor(rect.y * p.h);
        const x1 = Math.ceil((rect.x + rect.width) * p.w);
        const y1 = Math.ceil((rect.y + rect.height) * p.h);
        let n = 0;
        for (let y = Math.max(0, y0); y < Math.min(p.h, y1); y++) {
          for (let x = Math.max(0, x0); x < Math.min(p.w, x1); x++) {
            const i = (y * p.w + x) * 4;
            if (Math.hypot(p.data[i] - r, p.data[i + 1] - g, p.data[i + 2] - b) < tol) n++;
          }
        }
        return n;
      },
      /** Pixels différents entre deux PNG de même taille, dedans et hors du masque (alpha > 128). */
      async maskDiff(a, b, mask) {
        const pa = await pixels(a);
        const pb = await pixels(b, pa.w, pa.h);
        const pm = await pixels(mask, pa.w, pa.h);
        let inside = 0;
        let outside = 0;
        let maskArea = 0;
        for (let i = 0; i < pa.data.length; i += 4) {
          const d = (Math.abs(pa.data[i] - pb.data[i]) + Math.abs(pa.data[i + 1] - pb.data[i + 1]) + Math.abs(pa.data[i + 2] - pb.data[i + 2])) / 3;
          const inMask = pm.data[i + 3] > 128;
          if (inMask) maskArea++;
          // Les bords du détourage sont adoucis : seuls les écarts nets comptent.
          if (d > 40 && inMask) inside++;
          else if (d > 40) outside++;
        }
        return { inside, outside, maskArea };
      },
    };
  });

  const report = async () => page.evaluate(() => window.__storyLabo);

  /** Règle les options du laboratoire et attend la nouvelle composition et ses mesures. */
  async function setOptions(want) {
    const current = await report();
    if (want.decoration !== undefined && current.options.decoration !== want.decoration) {
      await page.click(`[data-decoration="${want.decoration ?? "aucune"}"]`);
    }
    if (want.accentColor !== undefined && current.options.accentColor !== want.accentColor) {
      await page.click(`[data-accent="${want.accentColor ?? "style"}"]`);
    }
    if (want.showAccents !== undefined && current.options.showAccents !== want.showAccents) await page.click('[data-toggle="accents"]');
    if (want.drawing !== undefined && current.drawing !== want.drawing) await page.click('[data-toggle="drawing"]');
    if (want.cutouts !== undefined && current.cutouts !== want.cutouts) await page.click('[data-toggle="cutout"]');
    if (want.photoCount !== undefined && current.photoCount !== want.photoCount) await page.click(`[data-photo-count="${want.photoCount}"]`);
    await page.waitForFunction(
      (w) => {
        const r = window.__storyLabo;
        if (!r?.ready || !document.querySelector('[data-render-state="ready"]')) return false;
        const o = { ...r.options, drawing: r.drawing, cutouts: r.cutouts, photoCount: r.photoCount };
        return Object.entries(w).every(([k, v]) => o[k] === v);
      },
      want,
      { timeout: 120_000 },
    );
    await page.waitForTimeout(150); // dernier dessin des aperçus
    return report();
  }

  const preview = (styleId, index) => page.locator(`[data-preview="${styleId}/${slideId(index)}"] canvas`).screenshot();

  const DEFAULTS = { decoration: null, accentColor: null, showAccents: true, drawing: false, cutouts: true, photoCount: 3 };
  let labo = await setOptions(DEFAULTS);
  check(labo?.ready === true, "rapport de rendu publié sur window.__storyLabo");

  // ── 1. Polices ──────────────────────────────────────────────────────────────
  const expectedFaces = new Set();
  for (const style of labo.styles) for (const story of style.stories) for (const b of story.blocks) expectedFaces.add(`${b.family}/${b.weight}/${b.style}`);
  const loadedFaces = new Set(labo.fonts.map((f) => `${f.family}/${f.weight}/${f.style}`));
  const notLoaded = [...expectedFaces].filter((f) => !loadedFaces.has(f));
  check(notLoaded.length === 0, `toutes les faces des ${STYLE_COUNT} styles chargées (${expectedFaces.size} faces : ${[...expectedFaces].join(", ")})`);
  notLoaded.forEach((f) => console.log(`    non chargée : ${f}`));
  for (const family of ["Anton", "Abril Fatface", "Playfair Display"]) {
    check([...expectedFaces].some((f) => f.startsWith(`${family}/`)), `${family} utilisée et chargée depuis public/fonts/`);
  }

  const fontCheck = await page.evaluate(() => {
    const report = window.__storyLabo;
    const ctx = document.createElement("canvas").getContext("2d");
    const problems = [];
    const chars = new Set();
    let lines = 0;
    for (const style of report.styles) {
      for (const story of style.stories) {
        for (const b of story.blocks) {
          const face = [...document.fonts].find(
            (f) =>
              f.family.replace(/"/g, "") === b.family &&
              String(f.weight) === String(b.weight) &&
              f.style === b.style &&
              f.status === "loaded",
          );
          if (!face) problems.push(`${style.styleId}/${b.blockId} : ${b.family} ${b.weight} ${b.style} non chargée`);
          const prefix = `${b.style === "italic" ? "italic " : ""}${b.weight} ${b.fontSize}px "${b.family}"`;
          for (const line of b.lines) {
            lines++;
            const width = (font) => ((ctx.font = font), ctx.measureText(line).width);
            const real = width(b.font);
            if (Math.abs(real - width(`${prefix}, monospace`)) > 0.01 || Math.abs(real - width(`${prefix}, serif`)) > 0.01) {
              problems.push(`${style.styleId}/${b.blockId} : « ${line} » dessinée avec une police de secours`);
            }
            for (const char of line) {
              chars.add(char);
              ctx.font = `${prefix}, monospace`;
              const a = ctx.measureText(char).width;
              ctx.font = `${prefix}, serif`;
              if (Math.abs(a - ctx.measureText(char).width) > 0.01) {
                problems.push(`${style.styleId}/${b.blockId} : U+${char.codePointAt(0).toString(16).toUpperCase()} pris dans une police de secours`);
              }
            }
          }
        }
      }
    }
    return { problems, chars: [...chars].join(""), lines };
  });
  check(fontCheck.problems.length === 0, `police réelle pour chaque ligne et chaque glyphe (${fontCheck.lines} lignes, ${fontCheck.chars.length} caractères distincts)`);
  fontCheck.problems.slice(0, 20).forEach((p) => console.log(`    ${p}`));
  const typo = [...fontCheck.chars].filter((c) => c === "'" || c === "\u202F");
  check(typo.length === 0, `composition française : apostrophes ’ et espaces U+00A0 (${[...new Set(fontCheck.chars)].filter((c) => c.charCodeAt(0) > 127).map((c) => (c === "\u00A0" ? "NBSP" : c)).join(" ")})`);

  // ── 2. Styles, stories, problèmes, accents, effets ─────────────────────────
  check(labo.styles.length === STYLE_COUNT, `${labo.styles.length} styles composés`);
  for (const style of labo.styles) {
    const storiesOk = style.stories.length === STORY_COUNT;
    check(storiesOk && style.problems.length === 0, `${style.styleId} : ${style.stories.length} stories, ${style.problems.length} problème(s) bloquant(s) · tailles ${style.sceneSizes.map((s) => s.fontSize).join("/")} px`);
    style.problems.forEach((p) => console.log(`    ${p}`));
    style.warnings.forEach((w) => console.log(`    avertissement : ${w}`));
    const missing = style.stories.flatMap((s) => s.blocks.flatMap((b) => b.accentsMissing.map((a) => `story ${s.index + 1}/${b.blockId} « ${a} »`)));
    const expected = style.stories.flatMap((s) => s.blocks.filter((b) => !b.repeated)).reduce((n, b) => n + b.accents.length, 0);
    const found = style.stories.flatMap((s) => s.blocks.filter((b) => !b.repeated)).reduce((n, b) => n + b.accentsFound.length, 0);
    check(missing.length === 0 && found === expected, `${style.styleId} : accents trouvés ${found}/${expected}`);
    missing.forEach((m) => console.log(`    introuvable : ${m}`));
  }

  const byId = (r, id) => r.styles.find((s) => s.styleId === id);
  // Rotation (style « rose ») : pastille, cercle, souligne… sans recommencer à chaque bloc.
  const kinds = byId(labo, "rose").stories.flatMap((s) => s.blocks.filter((b) => !b.repeated).flatMap((b) => b.accentKinds));
  const cycle = ["pastille", "cercle", "souligne"];
  check(kinds.every((k, i) => k === cycle[i % 3]), `rose : rotation continue sur la séquence (${kinds.join(" → ")})`);

  const hookOf = (id) => byId(labo, id).stories[0].blocks.filter((b) => !b.behindSubject);
  check(hookOf("massif").every((b) => b.transform === "uppercase" && b.lines.every((l) => l === l.toLocaleUpperCase("fr"))), `massif : accroche en capitales (${hookOf("massif")[0].lines[0]})`);
  const glowBlocks = byId(labo, "lueur").stories.flatMap((s) => s.blocks.filter((b) => !b.repeated && b.accentsFound.length));
  check(glowBlocks.length > 0 && glowBlocks.every((b) => b.glow > 0), `lueur : halo lumineux sur les mots clés (${glowBlocks.length} blocs, flou ${glowBlocks[0]?.glow} em)`);
  const liseret = byId(labo, "liseret");
  const outlined = liseret.stories.flatMap((s) => s.blocks.filter((b) => b.outline));
  check(
    hookOf("liseret").every((b) => b.outline > 0) && outlined.length >= 3 && liseret.stories[1].blocks.some((b) => !b.outline),
    `liseret : accroche et amorces contourées (${outlined.length} blocs, trait ${hookOf("liseret")[0].outline} px), texte courant plein`,
  );
  const feutre = byId(labo, "feutre").stories.flatMap((s) => s.blocks.filter((b) => !b.repeated && b.accentsFound.length));
  check(feutre.every((b) => b.marker === "souligne" && b.markerColor === "#FFFFFF"), "feutre : mots clés soulignés en blanc");
  const serif = byId(labo, "serif").stories.flatMap((s) => s.blocks);
  check(serif.every((b) => b.rotation === -3), `serif : texte incliné de −3° (${serif.length} blocs, story et suite autour du même point)`);
  for (const id of ["geant", "theatre"]) {
    const style = byId(labo, id);
    const giants = style.stories.map((s) => s.blocks.filter((b) => b.behindSubject));
    const firstViews = [0, 1, 3].every((i) => giants[i].length === 1 && !giants[i][0].repeated);
    const repeats = [2, 4].every((i) => giants[i].length === 1 && giants[i][0].repeated);
    const words = [0, 1, 3].map((i) => giants[i][0]?.lines.join(" "));
    check(firstViews && repeats && style.cutoutWarnings.length === 0, `${id} : mot géant derrière la personne sur les stories 1, 2, 4 (${words.join(", ")}), repris grisé en 3 et 5, détourage fourni`);
  }
  check(hookOf("theatre").every((b) => b.color === "#D4AF37" && b.transform === "uppercase"), "theatre : accroche en capitales dorées");

  // ── 3. Stories « suite » ───────────────────────────────────────────────────
  for (const style of labo.styles) {
    for (const index of [2, 4]) {
      const previous = style.stories[index - 1].blocks.filter((b) => !b.repeated);
      const current = style.stories[index].blocks;
      const repeated = current.filter((b) => b.repeated);
      const added = current.filter((b) => !b.repeated);
      const issues = [];
      if (repeated.length !== previous.length) issues.push(`${repeated.length} éléments repris pour ${previous.length}`);
      repeated.forEach((b, k) => {
        const p = previous[k];
        if (!p) return;
        if (b.opacity !== 0.4) issues.push(`${b.blockId} : opacité ${b.opacity}`);
        if (b.accentsFound.length) issues.push(`${b.blockId} : marquage conservé`);
        if (!same(b.x, p.x) || !same(b.y, p.y) || !same(b.width, p.width) || !same(b.height, p.height)) issues.push(`${b.blockId} : position différente de ${p.blockId}`);
        if (JSON.stringify(b.lines) !== JSON.stringify(p.lines)) issues.push(`${b.blockId} : coupures de lignes différentes`);
        if (b.rotation !== p.rotation) issues.push(`${b.blockId} : inclinaison différente`);
        if (b.lineBoxes.some((l, i) => !same(l.x, p.lineBoxes[i].x) || !same(l.y, p.lineBoxes[i].y) || !same(l.width, p.lineBoxes[i].width))) {
          issues.push(`${b.blockId} : lignes déplacées`);
        }
      });
      const lastRepeated = repeated.at(-1);
      if (lastRepeated && added[0] && added[0].y <= lastRepeated.y + lastRepeated.height) issues.push("nouveaux paragraphes pas dessous");
      if (added.some((b) => b.opacity !== 1)) issues.push("nouveau paragraphe grisé");
      check(issues.length === 0, `${style.styleId} story ${index + 1} : ${repeated.length} éléments repris à 40 % aux mêmes positions, ${added.length} ajoutés dessous`);
      issues.forEach((i) => console.log(`    ${i}`));
    }
  }

  // ── 4. Contraste ────────────────────────────────────────────────────────────
  const contrastRows = [];
  for (const style of labo.styles) {
    const blocks = style.stories.flatMap((s) => s.blocks.map((b) => ({ ...b, story: s.index + 1 })));
    const unmeasured = blocks.filter((b) => typeof b.contrast !== "number");
    const full = blocks.filter((b) => !b.repeated && !b.behindSubject);
    const min = Math.min(...full.map((b) => b.contrast));
    const accentMin = Math.min(...full.filter((b) => typeof b.accentContrast === "number").map((b) => b.accentContrast));
    contrastRows.push({ style: style.styleId, min, accentMin, warnings: style.contrastWarnings });
    check(unmeasured.length === 0, `${style.styleId} : contraste mesuré sur ${blocks.length} blocs, minimum ${min.toFixed(2)}:1${Number.isFinite(accentMin) ? `, accents ${accentMin.toFixed(2)}:1` : ""}`);
    style.contrastWarnings.forEach((w) => console.log(`    ⚠ ${w}`));
  }

  // Aperçus de tous les styles (réglages par défaut) pour les planches.
  const previews = {};
  for (const style of labo.styles) {
    previews[style.styleId] = [];
    for (let i = 0; i < STORY_COUNT; i++) previews[style.styleId].push(await preview(style.styleId, i));
  }

  // ── 5. Options ──────────────────────────────────────────────────────────────
  // 5a. Couleur d’accent : marquages et mots en couleur ; texte de pastille lisible.
  const colorRows = [{ label: "couleur du style", images: [previews.dore[0], previews.rose[1], previews.fluo[1], previews.geant[1], previews.bandeau[1], previews.theatre[0]] }];
  for (const color of ["#3B6FE0", "#F3EDE2", "#7A2430"]) {
    labo = await setOptions({ accentColor: color });
    const dore = byId(labo, "dore").stories.flatMap((s) => s.blocks.filter((b) => !b.repeated && b.accentsFound.length));
    const rose = byId(labo, "rose").stories.flatMap((s) => s.blocks.filter((b) => !b.repeated && b.accentsFound.length));
    const roseText = rose[0]?.markerTextColor;
    const expectedText = color === "#F3EDE2" ? "#000000" : "#FFFFFF";
    const roseShot = await preview("rose", 1);
    const visible = await lab.evaluate(([src, c]) => window.px.near(src, c, 40), [toUrl(roseShot), color]);
    check(
      dore.every((b) => b.markerColor === color) && roseText === expectedText && visible > 150,
      `couleur ${color} : marquages recolorés, texte de pastille ${roseText}, ${visible} pixels de la couleur sur l’aperçu Rose story 2`,
    );
    colorRows.push({
      label: color,
      images: [await preview("dore", 0), roseShot, await preview("fluo", 1), await preview("geant", 1), await preview("bandeau", 1), await preview("theatre", 0)],
    });
  }
  labo = await setOptions({ accentColor: null });

  // 5b. Mots en évidence masqués : aucun marquage, aucune couleur d’accent.
  const roseBefore = await lab.evaluate((src) => window.px.near(src, "#FF3D7F", 40), toUrl(previews.rose[1]));
  labo = await setOptions({ showAccents: false });
  const marked = labo.styles.flatMap((s) => s.stories.flatMap((st) => st.blocks.filter((b) => b.accentsFound.length)));
  const roseOff = await preview("rose", 1);
  const roseAfter = await lab.evaluate((src) => window.px.near(src, "#FF3D7F", 40), toUrl(roseOff));
  check(marked.length === 0 && roseBefore > 150 && roseAfter < roseBefore / 20, `mots en évidence masqués : 0 marquage dans les 17 styles, pixels roses ${roseBefore} → ${roseAfter} (Rose story 2)`);
  const accentsOffRow = { label: "mots en évidence masqués", images: [await preview("dore", 0), roseOff, await preview("fluo", 1), await preview("geant", 1), await preview("bandeau", 1), await preview("theatre", 0)] };
  labo = await setOptions({ showAccents: true });

  // 5c. Décorations : placées hors du texte et des zones de sécurité, visibles, couleur d’accent.
  const decorationRows = [];
  for (const kind of DECORATION_IDS) {
    labo = await setOptions({ decoration: kind });
    const issues = [];
    let placed = 0;
    for (const style of labo.styles) {
      style.stories.forEach((story, i) => {
        const d = story.decoration;
        if (kind === "fleche-suite" && i === 4) {
          if (d) issues.push(`${style.styleId} story 5 : flèche vers la suite sur la dernière story`);
          return;
        }
        if (!d) return;
        placed++;
        if (d.kind !== kind) issues.push(`${style.styleId} story ${i + 1} : ${d.kind}`);
        if (d.bounds.y < 250 || d.bounds.y + d.bounds.height > 1620) issues.push(`${style.styleId} story ${i + 1} : décoration dans une zone Instagram`);
        if (story.blocks.some((b) => b.rotation)) return; // texte incliné : contrôlé par la géométrie (tests unitaires)
        const lines = story.blocks.flatMap((b) => b.lineBoxes.map((l) => ({ ...l, height: b.lineHeight })));
        const touches = d.points.some((pts) => {
          for (let k = 0; k < pts.length; k += 2) {
            const [x, y] = [pts[k], pts[k + 1]];
            if (lines.some((l) => x > l.x - 4 && x < l.x + l.width + 4 && y > l.y - 4 && y < l.y + l.height + 4)) return true;
          }
          return false;
        });
        if (touches) issues.push(`${style.styleId} story ${i + 1} : la décoration touche une ligne de texte`);
      });
    }
    const expectedSlots = labo.styles.length * (kind === "fleche-suite" ? 4 : 5);
    const doreStories = byId(labo, "dore").stories.filter((s) => s.decoration).length;
    const shots = [];
    for (let i = 0; i < STORY_COUNT; i++) shots.push(await preview("dore", i));
    const first = byId(labo, "dore").stories.find((s) => s.decoration);
    const visible = first
      ? await lab.evaluate(
          ([src, c, b]) => window.px.near(src, c, 50, { x: b.x / 1080, y: b.y / 1920, width: b.width / 1080, height: b.height / 1920 }),
          [toUrl(shots[first.index]), first.decoration.color, first.decoration.bounds],
        )
      : 0;
    check(
      issues.length === 0 && placed >= expectedSlots * 0.7 && doreStories >= (kind === "fleche-suite" ? 3 : 4) && visible > 20,
      `décoration « ${kind} » : ${placed}/${expectedSlots} stories décorées (Doré ${doreStories}), hors du texte et des zones Instagram, ${visible} pixels dorés visibles`,
    );
    issues.slice(0, 10).forEach((i) => console.log(`    ${i}`));
    decorationRows.push({ label: kind, images: shots });
  }
  labo = await setOptions({ decoration: null });

  // 5d. Deux photos : photo 1 pour les stories 1, 4, 5 ; photo 2 pour 2 et 3.
  labo = await setOptions({ photoCount: 2 });
  const assets = byId(labo, "dore").stories.map((s) => s.assetId);
  const expectedAssets = ["test-mer", "test-salle", "test-salle", "test-mer", "test-mer"];
  check(JSON.stringify(assets) === JSON.stringify(expectedAssets) && labo.styles.every((s) => s.problems.length === 0), `2 photos : ${assets.join(", ")}, aucun problème bloquant`);
  const twoPhotos = [];
  for (let i = 0; i < STORY_COUNT; i++) twoPhotos.push(await preview("dore", i));
  const twoPhotosGeant = [];
  for (let i = 0; i < STORY_COUNT; i++) twoPhotosGeant.push(await preview("geant", i));
  labo = await setOptions({ photoCount: 3 });

  // 5e. Crayon : un trait de chaque outil sur la story 2, rien sur la 3 (pas d’héritage), un ovale sur la 4.
  const noDrawing = await preview("dore", 1);
  labo = await setOptions({ drawing: true });
  const drawingStories = byId(labo, "dore").stories.map((s) => s.drawing);
  const tools = drawingStories[1]?.tools ?? [];
  const withDrawing = await preview("dore", 1);
  const strokeDiff = await lab.evaluate(([a, b]) => window.px.diff(a, b), [toUrl(noDrawing), toUrl(withDrawing)]);
  check(
    ["stylo", "surligneur", "ovale"].every((t) => tools.includes(t)) && !drawingStories[2] && drawingStories[3]?.strokes === 1 && strokeDiff.strongPct > 0.3,
    `crayon : story 2 = ${tools.join(" + ")}, story 3 sans dessin, story 4 = ${drawingStories[3]?.strokes ?? 0} ovale ; traits visibles (${strokeDiff.strongPct.toFixed(2)} % de pixels changés)`,
  );
  const drawingRows = [];
  for (const id of ["dore", "geant", "bandeau"]) {
    const images = [];
    for (let i = 0; i < STORY_COUNT; i++) images.push(await preview(id, i));
    drawingRows.push({ label: id, images });
  }
  labo = await setOptions({ drawing: false });

  // 5f. Sans détourage : avertissement non bloquant, le mot géant reste dessiné.
  labo = await setOptions({ cutouts: false });
  for (const id of ["geant", "theatre"]) {
    const s = byId(labo, id);
    check(
      s.cutoutWarnings.length >= 3 && s.cutoutWarnings.every((w) => w.includes("détourage indisponible")) && s.problems.length === 0,
      `${id} sans détourage : ${s.cutoutWarnings.length} avertissements non bloquants (« ${s.cutoutWarnings[0]} »)`,
    );
  }
  const giantNoCutout = [await preview("geant", 1), await preview("theatre", 0)];
  labo = await setOptions({ cutouts: true });

  // ── 6. Export ───────────────────────────────────────────────────────────────
  const exports = {};
  const diffs = {};
  async function exportStyle(styleId, label) {
    const style = byId(labo, styleId);
    await page.click(`[data-style-button="${styleId}"]`);
    await page.click("[data-export]");
    await page.getByText(/PNG prêts/).waitFor({ state: "hidden", timeout: 30_000 });
    await page.getByText(`PNG prêts · ${style.name}`).waitFor({ timeout: 90_000 });
    const pngs = [];
    for (const story of style.stories) {
      const file = await download(page, `[data-download="${story.slideId}"]`, join(RAW, `${label}-${story.slideId}.png`));
      pngs.push({ ...file, size: pngSize(file.buffer) });
    }
    const sizesOk = pngs.every((p) => p.size?.width === W && p.size?.height === H);
    check(sizesOk, `${label} : ${pngs.length} PNG ${pngs.map((p) => `${p.size?.width}×${p.size?.height}`).join(", ")}`);
    // Aperçu à l’écran ≈ PNG exporté.
    const d = [];
    for (let i = 0; i < style.stories.length; i++) {
      d.push(await lab.evaluate(([a, b]) => window.px.diff(a, b), [toUrl(await preview(styleId, i)), toUrl(pngs[i].buffer)]));
    }
    const worst = d.reduce((m, x) => (x.mean > m.mean ? x : m), d[0]);
    check(
      d.every((x) => x.mean < 3 && x.strongPct < 1),
      `${label} : aperçu ${worst.w}×${worst.h} ≈ PNG réduit (écart moyen max ${worst.mean.toFixed(2)}/255, pixels très différents ${worst.strongPct.toFixed(3)} %)`,
    );
    diffs[label] = d;
    return pngs;
  }

  for (const styleId of EXPORTED) {
    exports[styleId] = await exportStyle(styleId, styleId);
    if (styleId === "dore") {
      const zipFile = await download(page, '[data-download="zip"]', join(RAW, "sequence-dore.zip"));
      const zip = await JSZip.loadAsync(zipFile.buffer);
      const entries = Object.keys(zip.files).sort();
      check(JSON.stringify(entries) === JSON.stringify(exports.dore.map((p) => p.name)), `ZIP dore : ${entries.length} PNG dans l’ordre (${entries[0]} … ${entries.at(-1)})`);
    }
  }

  // Halo néon à l’export : des pixels roses autour des mots clés, pas seulement dans les lettres.
  const glowPixels = await lab.evaluate((src) => window.px.near(src, "#FF2BD6", 90), toUrl(exports.lueur[0].buffer));
  const glowCore = await lab.evaluate((src) => window.px.near(src, "#FF2BD6", 20), toUrl(exports.lueur[0].buffer));
  check(glowPixels > glowCore * 1.3 && glowCore > 200, `lueur : halo visible dans le PNG (${glowCore} pixels roses purs, ${glowPixels} avec le halo)`);

  // Mot géant derrière la personne : sans détourage, seuls des pixels de la silhouette changent.
  labo = await setOptions({ cutouts: false });
  const geantNoCutout = await exportStyle("geant", "geant-sans-detourage");
  labo = await setOptions({ cutouts: true });
  // Le mot suit l’amorce : sur une photo où la personne est plus bas (plan large), il ne la croise pas.
  let crossed = 0;
  for (const index of [0, 1, 3]) {
    const mask = await page.evaluate((i) => window.__storyLaboCutout(i), index);
    const r = await lab.evaluate(([a, b, m]) => window.px.maskDiff(a, b, m), [toUrl(exports.geant[index].buffer), toUrl(geantNoCutout[index].buffer), mask]);
    if (r.inside + r.outside === 0) {
      console.log(`    geant story ${index + 1} : le mot géant ne croise pas la personne sur cette photo (rendu identique avec ou sans détourage)`);
      continue;
    }
    crossed++;
    check(
      r.inside > 2000 && r.outside < r.inside * 0.02,
      `geant story ${index + 1} : la personne passe devant le mot géant (${r.inside} pixels changés dans la silhouette, ${r.outside} hors)`,
    );
  }
  check(crossed >= 2, `geant : mot géant croisé par la personne sur ${crossed} stories`);

  // Combinaison d’options à l’export : couleur, décoration, crayon, 2 photos.
  labo = await setOptions({ accentColor: "#C8A25C", decoration: "etoiles", drawing: true, photoCount: 2 });
  const combo = await exportStyle("dore", "dore-options");
  labo = await setOptions(DEFAULTS);
  check(pageErrors.length === 0, `aucune erreur JavaScript${pageErrors.length ? ` : ${pageErrors.join(" | ")}` : ""}`);

  // ── 7. Planches ─────────────────────────────────────────────────────────────
  const sheet = await browser.newPage({ viewport: { width: 1800, height: 800 }, deviceScaleFactor: 1 });
  const font = "font:600 15px system-ui;color:#17263D";
  const figure = (buffer, caption, w = 216) =>
    `<figure style="margin:0"><img src="${toUrl(buffer)}" width="${w}" height="${(w * 16) / 9}" style="display:block;box-shadow:0 2px 12px #0002"><figcaption style="margin-top:6px">${caption}</figcaption></figure>`;
  async function board(file, title, rows, w = 216) {
    await sheet.setViewportSize({ width: 1900, height: 800 });
    await sheet.setContent(`<body style="margin:0;padding:24px;background:#DDD8D0;${font}">
      <p style="margin:0 0 12px;font-size:18px">${title}</p>
      ${rows
        .map(
          (r) => `<p style="margin:16px 0 8px">${r.label}</p><div style="display:flex;gap:16px;flex-wrap:wrap">${r.images
            .map((b, i) => figure(b, r.captions?.[i] ?? `story ${i + 1}`, w))
            .join("")}</div>`,
        )
        .join("")}</body>`);
    await sheet.screenshot({ path: join(OUT, file), fullPage: true });
  }

  for (const style of labo.styles) {
    const row = contrastRows.find((r) => r.style === style.styleId);
    const pngs = exports[style.styleId];
    const images = pngs ? pngs.map((p) => p.buffer) : previews[style.styleId];
    const source = pngs ? "PNG exportés 1080 × 1920" : "aperçus 540 × 960";
    await board(
      `style-${style.styleId}.png`,
      `${style.name} (${style.styleId}) · tailles ${style.sceneSizes.map((s) => `${s.fontSize}px`).join(" / ")} · contraste min ${row.min.toFixed(1)}:1 · ${source}`,
      [{ label: "", images }],
      324,
    );
  }
  await board(
    "planche-17-styles.png",
    "Les 17 styles, story 1 et story 2 (aperçus, photos de test synthétiques, détourage de test)",
    [
      { label: "Story 1", images: labo.styles.map((s) => previews[s.styleId][0]), captions: labo.styles.map((s) => s.name) },
      { label: "Story 2", images: labo.styles.map((s) => previews[s.styleId][1]), captions: labo.styles.map((s) => s.name) },
    ],
    150,
  );
  await board("decorations.png", "Décorations (style Doré, couleur d’accent du style) : une ligne par décoration", decorationRows, 200);
  const colorCaptions = ["Doré 1", "Rose 2", "Fluo 2", "Géant 2", "Bandeau 2", "Théâtre 1"];
  await board(
    "couleurs.png",
    "Couleur d’accent choisie (palette) et mots en évidence masqués",
    [...colorRows, accentsOffRow].map((r) => ({ ...r, captions: colorCaptions })),
    200,
  );
  await board("crayon.png", "Crayon : story 2 = stylo, surligneur, ovale ; story 3 sans dessin (pas d’héritage) ; story 4 = ovale en deux points", drawingRows, 200);
  await board("deux-photos.png", "Deux photos : photo 1 pour les stories 1, 4, 5 ; photo 2 pour les stories 2 et 3", [
    { label: "Doré", images: twoPhotos },
    { label: "Géant", images: twoPhotosGeant },
  ]);
  await board(
    "mot-geant.png",
    "Mot géant derrière la personne (détourage de test) : avec, puis sans détourage (avertissement non bloquant)",
    [
      { label: "Géant, PNG avec détourage", images: exports.geant.map((p) => p.buffer) },
      { label: "Géant, PNG sans détourage", images: geantNoCutout.map((p) => p.buffer) },
      { label: "Théâtre, PNG avec détourage", images: exports.theatre.map((p) => p.buffer) },
      { label: "Aperçus sans détourage", images: giantNoCutout, captions: ["Géant 2", "Théâtre 1"] },
    ],
    216,
  );
  await board("options-export.png", "Export Doré avec couleur #C8A25C, traînée d’étoiles, crayon et 2 photos (PNG 1080 × 1920)", [
    { label: "", images: combo.map((p) => p.buffer) },
  ], 324);

  // Tuiles du sélecteur de styles.
  await page.locator('[role="radiogroup"]').screenshot({ path: join(OUT, "selecteur-styles.png") });

  // Comparaisons avec la référence : locales uniquement (captures tierces, photos personnelles), jamais versionnées.
  const refs = REF_FILES.map((f) => join(REF_DIR, f));
  if (refs.every((f) => existsSync(f))) {
    const refUrls = refs.map((f) => toUrl(readFileSync(f)));
    const ours = exports.dore.map((p) => toUrl(p.buffer));
    await sheet.setViewportSize({ width: 1900, height: 800 });
    await sheet.setContent(`<body style="margin:0;padding:24px;background:#DDD8D0;${font}">
      <p style="margin:0 0 12px;font-size:18px">Haut : référence (capture recadrée sur la story, filigrane d’origine). Bas : notre rendu, style Doré, photos de test synthétiques.</p>
      <div id="grid" style="display:grid;grid-template-columns:repeat(5,360px);gap:16px"></div></body>`);
    await sheet.evaluate(
      async ({ refUrls, ours, box }) => {
        const grid = document.getElementById("grid");
        const load = (src) => new Promise((ok, ko) => Object.assign(new Image(), { onload() { ok(this); }, onerror: ko, src }));
        const cell = (label) => {
          const fig = document.createElement("figure");
          fig.style.margin = "0";
          const cap = document.createElement("figcaption");
          cap.textContent = label;
          cap.style.marginTop = "6px";
          return [fig, cap];
        };
        for (let i = 0; i < refUrls.length; i++) {
          const img = await load(refUrls[i]);
          const canvas = document.createElement("canvas");
          canvas.width = 360;
          canvas.height = 640;
          canvas.getContext("2d").drawImage(img, box.x, box.y, box.width, box.height, 0, 0, 360, 640);
          const [fig, cap] = cell(`référence ${i + 1}`);
          fig.append(canvas, cap);
          grid.append(fig);
        }
        for (let i = 0; i < ours.length; i++) {
          const img = await load(ours[i]);
          img.width = 360;
          img.height = 640;
          img.style.display = "block";
          const [fig, cap] = cell(`notre story ${i + 1}`);
          fig.append(img, cap);
          grid.append(fig);
        }
      },
      { refUrls, ours, box: REF_BOX },
    );
    await sheet.screenshot({ path: join(OUT, "dore-vs-reference.png"), fullPage: true });
    console.log(`Planche de comparaison (non versionnée) : ${join(OUT, "dore-vs-reference.png")}`);
  } else {
    console.log(`(captures de référence absentes de ${REF_DIR} : planche de comparaison non produite)`);
  }
  const tileRefs = REF_TILES.filter((t) => existsSync(join(REF_DIR, t.file)));
  if (tileRefs.length) {
    const ourTiles = readFileSync(join(OUT, "selecteur-styles.png"));
    await sheet.setContent(`<body style="margin:0;padding:24px;background:#DDD8D0;${font}">
      <p style="margin:0 0 12px;font-size:18px">Haut : grilles de styles de la référence. Bas : nos tuiles (mêmes rangs, nos noms).</p>
      <div id="refs" style="display:flex;gap:16px"></div><img style="margin-top:16px;width:1400px" src="${toUrl(ourTiles)}"></body>`);
    await sheet.evaluate(
      async ({ refs }) => {
        const load = (src) => new Promise((ok, ko) => Object.assign(new Image(), { onload() { ok(this); }, onerror: ko, src }));
        for (const r of refs) {
          const img = await load(r.url);
          const canvas = document.createElement("canvas");
          canvas.width = r.box.width / 1.6;
          canvas.height = r.box.height / 1.6;
          canvas.getContext("2d").drawImage(img, r.box.x, r.box.y, r.box.width, r.box.height, 0, 0, canvas.width, canvas.height);
          document.getElementById("refs").append(canvas);
        }
      },
      { refs: tileRefs.map((t) => ({ url: toUrl(readFileSync(join(REF_DIR, t.file))), box: t.box })) },
    );
    const target = join(RAW, "tuiles-vs-reference.png");
    await sheet.screenshot({ path: target, fullPage: true });
    console.log(`Tuiles comparées à la référence (local, non versionné) : ${target}`);
  }

  writeFileSync(
    join(OUT, "rapport.json"),
    JSON.stringify(
      {
        fonts: labo.fonts,
        styles: labo.styles.map((s) => ({
          styleId: s.styleId,
          sceneSizes: s.sceneSizes,
          problems: s.problems,
          warnings: s.warnings,
          contrastWarnings: s.contrastWarnings,
          contrastMin: contrastRows.find((r) => r.style === s.styleId).min,
          previewVsExport: diffs[s.styleId] ?? null,
          pngs: exports[s.styleId]?.map((p) => ({ name: p.name, ...p.size })) ?? null,
        })),
        exportsWithOptions: { "dore-options": diffs["dore-options"], "geant-sans-detourage": diffs["geant-sans-detourage"] },
        failures,
      },
      null,
      2,
    ),
  );
  console.log(`\nPlanches : ${OUT}`);
} finally {
  await browser.close();
  server.stop();
}

if (failures.length) {
  console.error(`\n${failures.length} vérification(s) en échec`);
  process.exit(1);
}
console.log("\nToutes les vérifications passent.");

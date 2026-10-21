// Vérifie le moteur visuel dans un vrai Chromium, sur la page /labo :
//  1. polices réelles (aucun glyphe de secours), toutes les faces des 10 styles chargées ;
//  2. 10 styles × 5 stories sans problème bloquant, accents tous trouvés, rotation des marquages continue ;
//  3. stories 3 et 5 : paragraphes repris à 40 %, sans marquage, aux mêmes positions que dans la story précédente ;
//  4. contraste mesuré et rapporté pour chaque bloc ;
//  5. export de chaque style : 5 PNG exactement 1080 × 1920 (+ ZIP pour « dore »), aperçu ≈ PNG ;
//  6. planches dans captures/render/ : une par style, et « dore » comparé aux captures de référence.
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
const STYLE_COUNT = 10;
const STORY_COUNT = 5;

// Captures de référence (story 1 à 5) et zone de la story dans chaque capture (1206 × 2622).
const REF_DIR = process.env.REF_DIR ?? "/root/.claude/uploads/f8eb09df-4038-55b0-be5d-5d8387c1fe49";
const REF_FILES = ["d70b3bc7-image.png", "49d949ca-image.png", "8695e7b5-image.png", "86d8f046-image.png", "1aa94daf-image.png"];
const REF_BOX = { x: 269, y: 554, width: 667, height: 1192 };

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? "✔" : "✘"} ${message}`);
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
  const child = spawn("npx", ["next", "start", "-p", String(port)], { cwd: ROOT, stdio: "ignore" });
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) return { url, stop: () => child.kill() };
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
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
  await page.waitForSelector('[data-render-state="ready"], [data-render-state="error"]', { timeout: 90_000 });
  check((await page.getAttribute("[data-render-state]", "data-render-state")) === "ready", "laboratoire prêt : polices, photos, compositions et mesures de contraste");
  check((await page.locator("main [role=alert]").count()) === 0, "aucune erreur affichée (polices, photos, problèmes bloquants)");

  const report = await page.evaluate(() => window.__storyLabo);
  check(report?.ready === true, "rapport de rendu publié sur window.__storyLabo");

  // ── 1. Polices ──────────────────────────────────────────────────────────────
  const expectedFaces = new Set();
  for (const style of report.styles) for (const story of style.stories) for (const b of story.blocks) expectedFaces.add(`${b.family}/${b.weight}/${b.style}`);
  const loadedFaces = new Set(report.fonts.map((f) => `${f.family}/${f.weight}/${f.style}`));
  const notLoaded = [...expectedFaces].filter((f) => !loadedFaces.has(f));
  check(notLoaded.length === 0, `toutes les faces des ${STYLE_COUNT} styles chargées (${expectedFaces.size} faces : ${[...expectedFaces].join(", ")})`);
  notLoaded.forEach((f) => console.log(`    non chargée : ${f}`));

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
  const typo = [...fontCheck.chars].filter((c) => c === "'" || c === " ");
  check(typo.length === 0, `composition française : apostrophes ’ et espaces U+00A0 (${[...new Set(fontCheck.chars)].filter((c) => c.charCodeAt(0) > 127).map((c) => (c === " " ? "NBSP" : c)).join(" ")})`);

  // ── 2. Styles, stories, problèmes, accents ─────────────────────────────────
  check(report.styles.length === STYLE_COUNT, `${report.styles.length} styles composés`);
  for (const style of report.styles) {
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

  // Rotation (style « rose ») : pastille, cercle, souligne… sans recommencer à chaque bloc.
  const rose = report.styles.find((s) => s.styleId === "rose");
  const kinds = rose.stories.flatMap((s) => s.blocks.filter((b) => !b.repeated).flatMap((b) => b.accentKinds));
  const cycle = ["pastille", "cercle", "souligne"];
  check(kinds.every((k, i) => k === cycle[i % 3]), `rose : rotation continue sur la séquence (${kinds.join(" → ")})`);

  // ── 3. Stories « suite » ───────────────────────────────────────────────────
  for (const style of report.styles) {
    for (const index of [2, 4]) {
      const previous = style.stories[index - 1].blocks.filter((b) => !b.repeated);
      const current = style.stories[index].blocks;
      const repeated = current.filter((b) => b.repeated);
      const added = current.filter((b) => !b.repeated);
      const issues = [];
      if (repeated.length !== previous.length) issues.push(`${repeated.length} paragraphes repris pour ${previous.length}`);
      repeated.forEach((b, k) => {
        const p = previous[k];
        if (!p) return;
        if (b.opacity !== 0.4) issues.push(`${b.blockId} : opacité ${b.opacity}`);
        if (b.accentsFound.length) issues.push(`${b.blockId} : marquage conservé`);
        if (!same(b.x, p.x) || !same(b.y, p.y) || !same(b.width, p.width) || !same(b.height, p.height)) issues.push(`${b.blockId} : position différente de ${p.blockId}`);
        if (JSON.stringify(b.lines) !== JSON.stringify(p.lines)) issues.push(`${b.blockId} : coupures de lignes différentes`);
        if (b.lineBoxes.some((l, i) => !same(l.x, p.lineBoxes[i].x) || !same(l.y, p.lineBoxes[i].y) || !same(l.width, p.lineBoxes[i].width))) {
          issues.push(`${b.blockId} : lignes déplacées`);
        }
      });
      const lastRepeated = repeated.at(-1);
      if (lastRepeated && added[0] && added[0].y <= lastRepeated.y + lastRepeated.height) issues.push("nouveaux paragraphes pas dessous");
      if (added.some((b) => b.opacity !== 1)) issues.push("nouveau paragraphe grisé");
      check(issues.length === 0, `${style.styleId} story ${index + 1} : ${repeated.length} paragraphes repris à 40 % aux mêmes positions, ${added.length} ajoutés dessous`);
      issues.forEach((i) => console.log(`    ${i}`));
    }
  }

  // ── 4. Contraste ────────────────────────────────────────────────────────────
  const contrastRows = [];
  for (const style of report.styles) {
    const blocks = style.stories.flatMap((s) => s.blocks.map((b) => ({ ...b, story: s.index + 1 })));
    const unmeasured = blocks.filter((b) => typeof b.contrast !== "number");
    const full = blocks.filter((b) => !b.repeated);
    const min = Math.min(...full.map((b) => b.contrast));
    const accentMin = Math.min(...full.filter((b) => typeof b.accentContrast === "number").map((b) => b.accentContrast));
    contrastRows.push({ style: style.styleId, min, accentMin, warnings: style.contrastWarnings });
    check(unmeasured.length === 0, `${style.styleId} : contraste mesuré sur ${blocks.length} blocs, minimum ${min.toFixed(2)}:1${Number.isFinite(accentMin) ? `, accents ${accentMin.toFixed(2)}:1` : ""}`);
    style.contrastWarnings.forEach((w) => console.log(`    ⚠ ${w}`));
  }

  // ── 5. Export de chaque style ──────────────────────────────────────────────
  const exports = {};
  const diffs = {};
  const lab = await context.newPage();
  await lab.setContent("<body style='margin:0'></body>");
  for (const style of report.styles) {
    await page.click(`[data-style-button="${style.styleId}"]`);
    await page.getByRole("button", { name: /^Exporter/ }).click();
    await page.getByText(`PNG prêts · ${style.name}`).waitFor({ timeout: 60_000 });
    const pngs = [];
    for (const story of style.stories) {
      const file = await download(page, `[data-download="${story.slideId}"]`, join(RAW, `${style.styleId}-${story.slideId}.png`));
      pngs.push({ ...file, size: pngSize(file.buffer) });
    }
    const sizesOk = pngs.every((p) => p.size?.width === W && p.size?.height === H);
    check(sizesOk, `${style.styleId} : ${pngs.length} PNG ${pngs.map((p) => `${p.size?.width}×${p.size?.height}`).join(", ")}`);
    exports[style.styleId] = pngs;

    if (style.styleId === "dore") {
      const zipFile = await download(page, '[data-download="zip"]', join(RAW, "sequence-dore.zip"));
      const zip = await JSZip.loadAsync(zipFile.buffer);
      const entries = Object.keys(zip.files).sort();
      check(JSON.stringify(entries) === JSON.stringify(pngs.map((p) => p.name)), `ZIP dore : ${entries.length} PNG dans l’ordre (${entries[0]} … ${entries.at(-1)})`);
    }

    // Aperçu à l’écran ≈ PNG exporté.
    const previews = [];
    for (const story of style.stories) {
      previews.push(await page.locator(`[data-preview="${style.styleId}/${story.slideId}"] canvas`).screenshot());
    }
    const d = await lab.evaluate(
      async ({ pairs }) => {
        const load = (src) => new Promise((ok, ko) => Object.assign(new Image(), { onload() { ok(this); }, onerror: ko, src }));
        const out = [];
        for (const { preview, exported } of pairs) {
          const p = await load(preview);
          const e = await load(exported);
          const w = p.naturalWidth;
          const h = p.naturalHeight;
          const pixels = (img) => {
            const c = new OffscreenCanvas(w, h);
            const ctx = c.getContext("2d");
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, 0, 0, w, h);
            return ctx.getImageData(0, 0, w, h).data;
          };
          const a = pixels(p);
          const b = pixels(e);
          let sum = 0;
          let strong = 0;
          for (let i = 0; i < a.length; i += 4) {
            const diff = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
            sum += diff;
            if (diff > 64) strong++;
          }
          out.push({ w, h, mean: sum / (w * h), strongPct: (100 * strong) / (w * h) });
        }
        return out;
      },
      { pairs: previews.map((p, i) => ({ preview: toUrl(p), exported: toUrl(pngs[i].buffer) })) },
    );
    diffs[style.styleId] = d;
    const worst = d.reduce((m, x) => (x.mean > m.mean ? x : m), d[0]);
    check(
      d.every((x) => x.mean < 3 && x.strongPct < 1),
      `${style.styleId} : aperçu ${worst.w}×${worst.h} ≈ PNG réduit (écart moyen max ${worst.mean.toFixed(2)}/255, pixels très différents ${worst.strongPct.toFixed(3)} %)`,
    );
  }
  check(pageErrors.length === 0, `aucune erreur JavaScript${pageErrors.length ? ` : ${pageErrors.join(" | ")}` : ""}`);

  // ── 6. Planches ─────────────────────────────────────────────────────────────
  const sheet = await browser.newPage({ viewport: { width: 1800, height: 800 }, deviceScaleFactor: 1 });
  const font = "font:600 15px system-ui;color:#17263D";
  for (const style of report.styles) {
    const pngs = exports[style.styleId];
    await sheet.setViewportSize({ width: 1800, height: 800 });
    await sheet.setContent(`<body style="margin:0;padding:24px;background:#DDD8D0;${font}">
      <p style="margin:0 0 12px;font-size:18px">${style.name} (${style.styleId}) · tailles ${style.sceneSizes.map((s) => `${s.fontSize}px`).join(" / ")} · contraste min ${contrastRows.find((r) => r.style === style.styleId).min.toFixed(1)}:1</p>
      <div style="display:flex;gap:24px">${pngs
        .map((p, i) => `<figure style="margin:0"><img src="${toUrl(p.buffer)}" width="324" height="576" style="display:block;box-shadow:0 2px 12px #0002"><figcaption style="margin-top:8px">story ${i + 1} · ${p.size.width}×${p.size.height}</figcaption></figure>`)
        .join("")}</div></body>`);
    await sheet.screenshot({ path: join(OUT, `style-${style.styleId}.png`), fullPage: true });
  }

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
    console.log(`Planche de comparaison : ${join(OUT, "dore-vs-reference.png")}`);
  } else {
    console.log(`(captures de référence absentes de ${REF_DIR} : planche de comparaison non produite)`);
  }

  // Tuiles du sélecteur de styles.
  await page.locator('[role="radiogroup"]').screenshot({ path: join(OUT, "selecteur-styles.png") });

  writeFileSync(
    join(OUT, "rapport.json"),
    JSON.stringify(
      {
        fonts: report.fonts,
        styles: report.styles.map((s) => ({
          styleId: s.styleId,
          sceneSizes: s.sceneSizes,
          problems: s.problems,
          warnings: s.warnings,
          contrastWarnings: s.contrastWarnings,
          contrastMin: contrastRows.find((r) => r.style === s.styleId).min,
          previewVsExport: diffs[s.styleId],
          pngs: exports[s.styleId].map((p) => ({ name: p.name, ...p.size })),
        })),
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

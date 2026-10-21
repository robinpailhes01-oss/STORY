// Vérifie l’export S1 dans un vrai Chromium :
//  1. polices réelles (aucun glyphe de secours) et composition française ;
//  2. 5 PNG téléchargés un par un + ZIP, tous exactement 1080 × 1920, ZIP ordonné et identique ;
//  3. aperçu à l’écran ≈ PNG exporté (écart mesuré pixel par pixel) ;
//  4. les guides de l’aperçu n’apparaissent jamais dans l’export.
// Produit captures/s1/exports-5-stories.png et captures/s1/apercu-vs-export.png.
//
// Usage : npm run build && npm run verify:export   (BASE_URL=… pour viser un serveur déjà lancé)

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { chromium } from "playwright";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "captures/s1");
const RAW = join(OUT, "export");
const DOC = JSON.parse(readFileSync(join(ROOT, "docs/staura-architecture-claude-code/examples/luma-document.json"), "utf8"));
const W = 1080;
const H = 1920;
const PREVIEW_DPR = 2; // aperçu 270 px CSS × 2 = 540 px réels, soit la moitié du PNG

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

const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function startServer() {
  if (process.env.BASE_URL) return { url: process.env.BASE_URL, stop: () => {} };
  const port = 3199;
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

async function exportAll(page) {
  await page.getByRole("button", { name: "Exporter" }).click();
  await page.getByText("PNG prêts").waitFor({ timeout: 30_000 });
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: chromiumPath() });
try {
  mkdirSync(RAW, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
    deviceScaleFactor: PREVIEW_DPR,
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(server.url);
  await page.waitForSelector('[data-render-state="ready"], [data-render-state="error"]', { timeout: 30_000 });
  check((await page.getAttribute("[data-render-state]", "data-render-state")) === "ready", "rendu prêt, polices chargées");
  check((await page.locator("main [role=alert]").count()) === 0, "aucune erreur affichée (polices, débordement, document)");

  // ── 1. Polices et typographie ───────────────────────────────────────────────
  const fonts = await page.evaluate(() => {
    const report = window.__storyRender;
    const ctx = document.createElement("canvas").getContext("2d");
    const problems = [];
    const chars = new Set();
    for (const t of report.texts) {
      const face = [...document.fonts].find(
        (f) => f.family.replace(/"/g, "") === t.family && String(f.weight) === String(t.weight) && f.status === "loaded",
      );
      if (!face) problems.push(`${t.blockId} : ${t.family} ${t.weight} non chargée`);
      for (const line of t.lines) {
        // La ligne mesure pareil avec la police seule et avec deux secours opposés : la famille est bien utilisée…
        const width = (font) => ((ctx.font = font), ctx.measureText(line).width);
        const real = width(t.font);
        const viaMono = width(`${t.weight} ${t.fontSize}px "${t.family}", monospace`);
        const viaSerif = width(`${t.weight} ${t.fontSize}px "${t.family}", serif`);
        if (Math.abs(real - viaMono) > 0.01 || Math.abs(real - viaSerif) > 0.01) {
          problems.push(`${t.blockId} : « ${line} » dessinée avec une police de secours`);
        }
        // …et chaque caractère doit venir d’elle : avec deux secours différents, la largeur ne bouge pas.
        for (const char of line) {
          chars.add(char);
          ctx.font = `${t.weight} ${t.fontSize}px "${t.family}", monospace`;
          const a = ctx.measureText(char).width;
          ctx.font = `${t.weight} ${t.fontSize}px "${t.family}", serif`;
          const b = ctx.measureText(char).width;
          if (Math.abs(a - b) > 0.01) {
            problems.push(`${t.blockId} : U+${char.codePointAt(0).toString(16).toUpperCase()} pris dans une police de secours`);
          }
        }
      }
    }
    return { problems, chars: [...chars].join(""), texts: report.texts, loaded: report.fonts };
  });
  check(fonts.problems.length === 0, `police réelle pour chaque ligne et chaque glyphe (${fonts.chars.length} caractères distincts)`);
  fonts.problems.forEach((p) => console.log(`    ${p}`));
  console.log(`    faces chargées : ${fonts.loaded.map((f) => `${f.family} ${f.weight}`).join(", ")}`);

  const byId = new Map(fonts.texts.map((t) => [t.blockId, t]));
  const typo = [];
  for (const slide of DOC.slides) {
    for (const block of slide.blocks.filter((b) => b.kind === "text")) {
      const drawn = byId.get(block.id)?.lines.join(" ") ?? "";
      const flat = (s) => s.replace(/[\s  ]+/g, " ").replace(/'/g, "’").trim();
      if (flat(drawn) !== flat(block.content)) typo.push(`${block.id} : texte altéré « ${drawn} »`);
      if (/'/.test(drawn)) typo.push(`${block.id} : apostrophe droite`);
      if (/ [?!;:»]|« /.test(drawn)) typo.push(`${block.id} : espace sécable avant ? ! ; : » ou après «`);
      if (/ /.test(drawn)) typo.push(`${block.id} : U+202F sans glyphe`);
    }
  }
  check(typo.length === 0, "accents conservés, apostrophes ’ et espaces insécables françaises (? ! ; : « »)");
  typo.forEach((p) => console.log(`    ${p}`));
  console.log(`    caractères non ASCII dessinés : ${[...new Set(fonts.chars)].filter((c) => c.charCodeAt(0) > 127).map((c) => (c === " " ? "NBSP" : c)).join(" ")}`);

  // ── 2. Export : 5 PNG individuels puis ZIP ──────────────────────────────────
  await exportAll(page);
  const pngs = [];
  for (const slide of DOC.slides) {
    const file = await download(page, `[data-download="${slide.id}"]`, join(RAW, `${slide.id}.png`));
    const size = pngSize(file.buffer);
    pngs.push({ ...file, slideId: slide.id, size });
    check(size?.width === W && size?.height === H, `${file.name} : ${size?.width}×${size?.height}`);
  }
  const zipFile = await download(page, '[data-download="zip"]', join(RAW, `${DOC.documentId}.zip`));
  const zip = await JSZip.loadAsync(zipFile.buffer);
  const entries = Object.keys(zip.files).sort();
  check(
    JSON.stringify(entries) === JSON.stringify(pngs.map((p) => p.name)),
    `${zipFile.name} : ${entries.length} fichiers dans l’ordre (${entries[0]} … ${entries.at(-1)})`,
  );
  for (const [i, name] of entries.entries()) {
    const buffer = await zip.file(name).async("nodebuffer");
    const size = pngSize(buffer);
    check(size?.width === W && size?.height === H && sha(buffer) === sha(pngs[i].buffer), `ZIP/${name} : 1080×1920, identique au PNG individuel`);
  }

  // ── 3. Aperçu ≈ export ──────────────────────────────────────────────────────
  const previews = [];
  for (const slide of DOC.slides) {
    previews.push(await page.locator(`[data-preview="${slide.id}"] canvas`).screenshot());
  }
  const lab = await context.newPage();
  await lab.setContent("<body style='margin:0'></body>");
  const toUrl = (b) => `data:image/png;base64,${b.toString("base64")}`;
  const diffs = await lab.evaluate(
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
          const d = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
          sum += d;
          if (d > 64) strong++;
        }
        out.push({ w, h, mean: sum / (w * h), strongPct: (100 * strong) / (w * h) });
      }
      return out;
    },
    { pairs: previews.map((p, i) => ({ preview: toUrl(p), exported: toUrl(pngs[i].buffer) })) },
  );
  diffs.forEach((d, i) =>
    check(
      d.mean < 1.5 && d.strongPct < 0.5,
      `${DOC.slides[i].id} : aperçu ${d.w}×${d.h} vs PNG réduit, écart moyen ${d.mean.toFixed(3)}/255, pixels très différents ${d.strongPct.toFixed(3)} %`,
    ),
  );

  // ── 4. Les guides restent dans l’aperçu ────────────────────────────────────
  await page.getByLabel("Zones Instagram").check();
  const withGuides = await page.locator(`[data-preview="${DOC.slides[0].id}"] canvas`).screenshot();
  check(sha(withGuides) !== sha(previews[0]), "guides visibles dans l’aperçu quand on les active");
  await exportAll(page);
  const again = await download(page, `[data-download="${DOC.slides[0].id}"]`, join(RAW, "guides-actifs.png"));
  check(sha(again.buffer) === sha(pngs[0].buffer), "export identique avec guides actifs : aucun guide ni poignée dans le PNG");
  await page.getByLabel("Zones Instagram").uncheck();
  check(pageErrors.length === 0, `aucune erreur JavaScript${pageErrors.length ? ` : ${pageErrors.join(" | ")}` : ""}`);

  // ── Captures jointes ────────────────────────────────────────────────────────
  const sheet = await browser.newPage({ viewport: { width: 1800, height: 800 }, deviceScaleFactor: 1 });
  const font = "font:600 15px system-ui;color:#17263D";
  await sheet.setContent(`<body style="margin:0;padding:24px;background:#DDD8D0;${font}">
    <div style="display:flex;gap:24px">${pngs
      .map((p) => `<figure style="margin:0"><img src="${toUrl(p.buffer)}" width="324" height="576" style="display:block;box-shadow:0 2px 12px #0002"><figcaption style="margin-top:8px">${p.name} · ${p.size.width}×${p.size.height}</figcaption></figure>`)
      .join("")}</div></body>`);
  await sheet.screenshot({ path: join(OUT, "exports-5-stories.png"), fullPage: true });

  await sheet.setViewportSize({ width: 1260, height: 800 });
  await sheet.setContent(`<body style="margin:0;padding:24px;background:#DDD8D0;${font}">
    <p style="margin:0 0 16px">Gauche : capture Playwright de l’aperçu (270 px CSS × DPR 2 = 540×960). Droite : PNG exporté 1080×1920 affiché à 540×960.</p>
    ${pngs
      .map((p, i) => `<div style="display:flex;gap:16px;margin-bottom:24px;align-items:flex-start">
        <img src="${toUrl(previews[i])}" width="540" height="960" style="display:block;box-shadow:0 2px 12px #0002">
        <img src="${toUrl(p.buffer)}" width="540" height="960" style="display:block;box-shadow:0 2px 12px #0002">
        <div style="width:110px">${DOC.slides[i].id}<br>écart moyen ${diffs[i].mean.toFixed(2)}/255</div></div>`)
      .join("")}</body>`);
  await sheet.screenshot({ path: join(OUT, "apercu-vs-export.png"), fullPage: true });
  writeFileSync(
    join(OUT, "rapport.json"),
    JSON.stringify(
      {
        fonts: fonts.loaded,
        pngs: pngs.map((p) => ({ name: p.name, ...p.size, sha256: sha(p.buffer) })),
        zip: { name: zipFile.name, entries },
        previewVsExport: diffs.map((d, i) => ({ slideId: DOC.slides[i].id, ...d })),
        failures,
      },
      null,
      2,
    ),
  );
  console.log(`\nCaptures : ${join(OUT, "exports-5-stories.png")}, ${join(OUT, "apercu-vs-export.png")}`);
} finally {
  await browser.close();
  server.stop();
}

if (failures.length) {
  console.error(`\n${failures.length} vérification(s) en échec`);
  process.exit(1);
}
console.log("\nToutes les vérifications passent.");

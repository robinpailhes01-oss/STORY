// Vérifie le détourage de la personne dans un vrai Chromium (page /labo-detourage) :
//  0. fichiers wasm et modèle servis par nous (taille transférée, compression) ;
//  1. MediaPipe chargé à la demande seulement, puis moteur et modèle à froid (temps) ;
//  2. photos de personnes : découpe de la taille de la photo, couverture plausible (3 à 80 %),
//     bords adoucis (pixels semi-transparents), temps mesurés ;
//  3. photos synthétiques sans personne : couverture sous 3 %, aucune erreur ;
//  4. cache par photo (une seule exécution) et libération ;
//  5. erreurs françaises : modèle introuvable, moteur introuvable ;
//  6. aucune requête hors du serveur local (ni CDN, ni télémétrie MediaPipe).
// Les photos de personnes sont recadrées à la volée dans les captures de Robin (REF_DIR) : elles ne
// sont jamais écrites dans le dépôt. Leurs planches et détails des bords vont dans PRIVATE_OUT ;
// captures/segmentation/ ne reçoit que la planche synthétique et le rapport chiffré.
//
// Usage : npm run build && node scripts/verify-segmentation.mjs
//   BASE_URL=…  serveur déjà lancé ;  REF_DIR=…  captures de Robin ;  PRIVATE_OUT=…  planche privée ;
//   MULTICLASS_MODEL=…/selfie_multiclass_256x256.tflite  compare avec le modèle multiclasse (non livré).

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { get as httpGet } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "captures/segmentation");
const PRIVATE_OUT = process.env.PRIVATE_OUT ?? join(tmpdir(), "story-segmentation");
const REF_DIR = process.env.REF_DIR ?? "/root/.claude/uploads/f8eb09df-4038-55b0-be5d-5d8387c1fe49";
const MULTICLASS_MODEL = process.env.MULTICLASS_MODEL ?? "";

// Stories des captures de Robin (iPhone 1206 × 2622) : boîte de la photo dans la capture,
// taille de sortie (on simule une photo importée jusqu’à 2560 px).
const STORY_BOX = { x: 278, y: 564, width: 650, height: 1173 };
const SMALL_BOX = { x: 380, y: 511, width: 446, height: 800 };
const PEOPLE = [
  { name: "bateau", file: "d70b3bc7-image.png", box: STORY_BOX, out: [1080, 1920] },
  { name: "fauteuil", file: "fecca758-image.png", box: SMALL_BOX, out: [1080, 1920] },
  { name: "fauteuil-pastille", file: "068caa4c-image.png", box: SMALL_BOX, out: [1080, 1920] },
  { name: "debout", file: "fc529b88-image.png", box: STORY_BOX, out: [1080, 1920] },
  { name: "debout-clair", file: "8922f718-image.png", box: STORY_BOX, out: [1080, 1920] },
  { name: "portrait", file: "86d8f046-image.png", box: STORY_BOX, out: [1440, 2560] },
];
const COVERAGE_MIN = 0.03;
const COVERAGE_MAX = 0.8;

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? "✔" : "✘"} ${message}`);
  if (!ok) failures.push(message);
  return ok;
};
const pct = (v) => `${(v * 100).toFixed(1)} %`;
const ms = (v) => `${Math.round(v)} ms`;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function startServer() {
  if (process.env.BASE_URL) return { url: process.env.BASE_URL, stop: () => {} };
  const port = await freePort();
  // Groupe de processus dédié : npx lance next-server en sous-processus, il faut tout arrêter.
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

/** GET sans décompression : octets réellement transférés (comme un navigateur qui accepte gzip). */
function rawGet(url) {
  return new Promise((resolve, reject) => {
    httpGet(url, { headers: { "accept-encoding": "gzip, br" } }, (res) => {
      let bytes = 0;
      res.on("data", (chunk) => (bytes += chunk.length));
      res.on("end", () => resolve({ status: res.statusCode, encoding: res.headers["content-encoding"] ?? "aucune", bytes }));
      res.on("error", reject);
    }).on("error", reject);
  });
}

const dataUrl = (buffer, type) => `data:${type};base64,${buffer.toString("base64")}`;

/** Ouvre le labo ; journalise les requêtes externes et les erreurs JavaScript. */
async function openLab(context, server, external, pageErrors) {
  const page = await context.newPage();
  page.on("request", (req) => {
    const url = req.url();
    if (!url.startsWith(server.url) && !url.startsWith("data:") && !url.startsWith("blob:")) external.push(url);
  });
  page.on("pageerror", (e) => pageErrors.push(e.message));
  if (MULTICLASS_MODEL && existsSync(MULTICLASS_MODEL)) {
    // Modèle de comparaison servi depuis le disque, sans le copier dans public/.
    await page.route("**/models/selfie_multiclass_256x256.tflite", (route) =>
      route.fulfill({ status: 200, contentType: "application/octet-stream", body: readFileSync(MULTICLASS_MODEL) }),
    );
  }
  await page.goto(`${server.url}/labo-detourage`);
  await page.waitForSelector('[data-seg-lab="ready"]', { timeout: 30_000 });
  await page.waitForFunction(() => window.__segLab?.ready === true);
  return page;
}

/** Recadre une story dans une capture et la remet à la taille d’une photo importée (JPEG). */
async function cropStory(page, png, box, [w, h]) {
  return page.evaluate(
    async ({ src, box, w, h }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, box.x, box.y, box.width, box.height, 0, 0, w, h);
      return c.toDataURL("image/jpeg", 0.92);
    },
    { src: dataUrl(png, "image/png"), box, w, h },
  );
}

/** Images synthétiques sans personne (et une silhouette dessinée, pour information). */
async function syntheticImages(page) {
  return page.evaluate(() => {
    const make = (w, h, draw) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      draw(c.getContext("2d"), w, h);
      return c.toDataURL("image/jpeg", 0.92);
    };
    const paysage = make(1080, 1920, (ctx, w, h) => {
      const sky = ctx.createLinearGradient(0, 0, 0, h * 0.55);
      sky.addColorStop(0, "#2d5fa8");
      sky.addColorStop(1, "#a9c7e8");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#1d4466";
      ctx.fillRect(0, h * 0.55, w, h * 0.45);
      ctx.fillStyle = "#f2f2f2";
      ctx.beginPath();
      ctx.moveTo(w * 0.1, h * 0.95);
      ctx.lineTo(w * 0.9, h * 0.95);
      ctx.lineTo(w * 0.75, h * 0.8);
      ctx.lineTo(w * 0.25, h * 0.8);
      ctx.fill();
      ctx.fillStyle = "#3b6b2f";
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.arc(w * (0.05 + i * 0.13), h * 0.55, w * 0.07, Math.PI, 0);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.ellipse(w * (0.15 + i * 0.18), h * (0.12 + (i % 2) * 0.08), w * 0.12, h * 0.025, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    const aplat = make(900, 1200, (ctx, w, h) => {
      ctx.fillStyle = "#7a7a7a";
      ctx.fillRect(0, 0, w, h);
    });
    const objets = make(1440, 1080, (ctx, w, h) => {
      ctx.fillStyle = "#e9e1d3";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#6b4a2b";
      ctx.fillRect(0, h * 0.62, w, h * 0.38);
      ctx.fillStyle = "#c23b22";
      ctx.beginPath();
      ctx.arc(w * 0.3, h * 0.5, h * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2b5d8a";
      ctx.fillRect(w * 0.55, h * 0.3, w * 0.2, h * 0.32);
      ctx.fillStyle = "#f1c232";
      ctx.beginPath();
      ctx.moveTo(w * 0.82, h * 0.62);
      ctx.lineTo(w * 0.9, h * 0.35);
      ctx.lineTo(w * 0.98, h * 0.62);
      ctx.fill();
    });
    return { paysage, aplat, objets };
  });
}

async function shoot(page, path) {
  const list = page.locator("[data-seg-results]");
  await page.waitForTimeout(300);
  await list.screenshot({ path });
  console.log(`  planche : ${path}`);
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: chromiumPath() });
const report = {
  assets: {},
  lazyLoad: null,
  preload: null,
  people: [],
  synthetic: [],
  cache: null,
  errors: {},
  external: [],
  multiclass: [],
};
try {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(PRIVATE_OUT, { recursive: true });
  const external = [];
  const pageErrors = [];

  // ── 0. Fichiers servis (taille transférée, compression) ──────────────────────────────────
  for (const path of ["/mediapipe/vision_wasm_internal.wasm", "/mediapipe/vision_wasm_internal.js", "/models/selfie_segmenter.tflite"]) {
    const res = await rawGet(`${server.url}${path}`);
    report.assets[path] = res;
    check(res.status === 200, `${path} servi (${res.status}, ${(res.bytes / 1024 / 1024).toFixed(2)} Mo transférés, compression ${res.encoding})`);
  }

  const context = await browser.newContext({ viewport: { width: 1180, height: 900 } });

  // ── 1. Chargement paresseux puis à froid ────────────────────────────────────────────────
  const scripts = [];
  context.on("response", async (res) => {
    if (!res.url().endsWith(".js")) return;
    try {
      // Chaîne propre au paquet MediaPipe (en-tête de sa télémétrie), absente de notre code.
      scripts.push({ url: res.url(), mediapipe: (await res.text()).includes("x-goog-api-key") });
    } catch {}
  });
  const page = await openLab(context, server, external, pageErrors);
  await page.waitForTimeout(500);
  const before = scripts.filter((s) => s.mediapipe).length;
  const preload = await page.evaluate(() => window.__segLab.preload("selfie"));
  report.preload = preload;
  check(preload.ok, `moteur + modèle chargés à froid en ${ms(preload.ms)}${preload.ok ? "" : ` (${preload.message})`}`);
  const after = scripts.filter((s) => s.mediapipe).length;
  report.lazyLoad = { before, after };
  check(before === 0 && after > 0, `MediaPipe chargé à la demande seulement (scripts MediaPipe : ${before} à l’ouverture, ${after} après preloadSegmenter)`);

  // ── 2. Photos de personnes (recadrées des captures de Robin, jamais écrites dans le dépôt) ──
  const refs = PEOPLE.filter((p) => existsSync(join(REF_DIR, p.file)));
  if (refs.length < PEOPLE.length) console.log(`(captures de Robin absentes de ${REF_DIR} : ${PEOPLE.length - refs.length} photo(s) ignorée(s))`);
  const crops = {};
  for (const person of refs) {
    crops[person.name] = await cropStory(page, readFileSync(join(REF_DIR, person.file)), person.box, person.out);
    const r = await page.evaluate(([n, u]) => window.__segLab.run(n, u), [person.name, crops[person.name]]);
    report.people.push(r);
    const tag = `${person.name} (${r.photoWidth} × ${r.photoHeight})`;
    if (!check(r.ok, `${tag} : détourée${r.ok ? "" : ` — ${r.error.code} : ${r.error.message}`}`)) continue;
    check(r.cutoutWidth === r.photoWidth && r.cutoutHeight === r.photoHeight, `${tag} : découpe ${r.cutoutWidth} × ${r.cutoutHeight}, même taille`);
    check(
      r.coverage >= COVERAGE_MIN && r.coverage <= COVERAGE_MAX,
      `${tag} : personne détectée, couverture ${pct(r.coverage)} (attendu ${pct(COVERAGE_MIN)} à ${pct(COVERAGE_MAX)})`,
    );
    check(
      r.alpha.partial > 0.001 && r.alpha.partial < 0.1,
      `${tag} : bords adoucis (${pct(r.alpha.partial)} de pixels semi-transparents, ${pct(r.alpha.opaque)} opaques)`,
    );
    console.log(
      `  ${ms(r.ms)} au total — modèle ${ms(r.timings.segment)}, masque ${ms(r.timings.refine)}, alpha ${ms(r.timings.compose)} · ${r.delegate} · masque ${r.maskWidth} × ${r.maskHeight}${r.zoomRegion ? " · 2ᵉ passage recadré" : ""}${r.islandsRemoved ? ` · ${r.islandsRemoved} îlot(s) retiré(s)` : ""}`,
    );
    const detail = await page.evaluate((n) => window.__segLab.detail(n), person.name);
    if (detail) writeFileSync(join(PRIVATE_OUT, `bords-${person.name}.png`), Buffer.from(detail.split(",")[1], "base64"));
  }
  if (refs.length) {
    // Délégué GPU (option) : même résultat que le processeur, à quelques points près.
    const ref = report.people[0];
    const gpu = await page.evaluate(([n, u]) => window.__segLab.run(`${n} (GPU)`, u, { delegate: "GPU" }), [refs[0].name, crops[refs[0].name]]);
    report.gpu = gpu;
    check(
      gpu.ok && Math.abs(gpu.coverage - ref.coverage) < 0.02,
      `délégué GPU : ${gpu.ok ? `couverture ${pct(gpu.coverage)} contre ${pct(ref.coverage)} sur le processeur, ${ms(gpu.ms)} (${gpu.delegate})` : gpu.error.message}`,
    );
    // Planches privées : photos de Robin, hors du dépôt.
    await shoot(page, join(PRIVATE_OUT, "planche-personnes.png"));
    // Apport du second passage et du recalage : sans l’un ni l’autre, puis réglages par défaut.
    await page.evaluate(() => window.__segLab.clear());
    for (const person of refs.slice(0, 3)) {
      await page.evaluate(([n, u]) => window.__segLab.run(`${n} (brut)`, u, { zoom: false, refine: false }), [person.name, crops[person.name]]);
      await page.evaluate(([n, u]) => window.__segLab.run(`${n} (défaut)`, u), [person.name, crops[person.name]]);
    }
    await shoot(page, join(PRIVATE_OUT, "planche-brut-defaut.png"));
  }

  // ── 2 bis. Modèle multiclasse (16 Mo), seulement si fourni ────────────────────────────────
  if (MULTICLASS_MODEL && existsSync(MULTICLASS_MODEL) && refs.length) {
    await page.evaluate(() => window.__segLab.clear());
    const pre = await page.evaluate(() => window.__segLab.preload("multiclasse"));
    console.log(`  multiclasse : chargé en ${ms(pre.ms)}${pre.ok ? "" : ` (${pre.message})`}`);
    for (const person of refs) {
      const a = await page.evaluate(([n, u]) => window.__segLab.run(`${n} · selfie`, u), [person.name, crops[person.name]]);
      const b = await page.evaluate(([n, u]) => window.__segLab.run(`${n} · multiclasse`, u, { model: "multiclasse" }), [
        person.name,
        crops[person.name],
      ]);
      report.multiclass.push({ name: person.name, preloadMs: pre.ms, selfie: a, multiclasse: b });
      console.log(
        `  ${person.name} : selfie ${pct(a.coverage ?? 0)}, modèle ${ms(a.timings?.segment ?? 0)} · multiclasse ${pct(b.coverage ?? 0)}, modèle ${ms(b.timings?.segment ?? 0)}`,
      );
    }
    await shoot(page, join(PRIVATE_OUT, "planche-modeles.png"));
  }

  // ── 3. Images synthétiques sans personne (planche versionnée) ─────────────────────────────
  await page.evaluate(() => window.__segLab.clear());
  const synth = await syntheticImages(page);
  for (const [name, url] of Object.entries(synth)) {
    const r = await page.evaluate(([n, u]) => window.__segLab.run(n, u), [name, url]);
    report.synthetic.push(r);
    const tag = `synthétique « ${name} » (${r.photoWidth} × ${r.photoHeight})`;
    if (!check(r.ok, `${tag} : traitée sans erreur${r.ok ? "" : ` — ${r.error.message}`}`)) continue;
    check(r.cutoutWidth === r.photoWidth && r.cutoutHeight === r.photoHeight, `${tag} : découpe de la même taille`);
    check(r.coverage < COVERAGE_MIN, `${tag} : aucune personne (couverture ${pct(r.coverage)}, ${ms(r.ms)})`);
    check(
      (await page.getByText("Aucune personne détectée sur cette photo.").count()) === report.synthetic.length,
      `${tag} : « Aucune personne détectée » affiché`,
    );
  }
  await shoot(page, join(OUT, "planche-synthetique.png"));

  // ── 4. Cache par photo ──────────────────────────────────────────────────────────────────
  const cacheSource = refs.length ? crops[refs[0].name] : synth.paysage;
  const cache = await page.evaluate((u) => window.__segLab.cacheCheck(u), cacheSource);
  report.cache = cache;
  check(cache.samePromise && cache.sameCanvas, `cache : une seule exécution par photo (résultat en cache rendu en ${ms(cache.cachedMs)})`);
  check(cache.released, "cache : releaseCutout oublie le résultat et libère le canvas");

  check(pageErrors.length === 0, `aucune erreur JavaScript (${pageErrors.join(" | ") || "—"})`);
  // MediaPipe vide sa file de télémétrie à la fermeture du segmenteur : on ferme, puis on attend.
  await page.evaluate(() => window.__segLab.dispose());
  await page.waitForTimeout(1500);
  await page.close();

  // ── 5. Erreurs explicites ──────────────────────────────────────────────────────────────
  for (const [label, pattern, code] of [
    ["modèle introuvable", "**/models/selfie_segmenter.tflite", "modele_indisponible"],
    ["moteur introuvable", "**/mediapipe/vision_wasm_internal.*", "moteur_indisponible"],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
    const errPage = await openLab(ctx, server, external, []);
    await errPage.route(pattern, (route) => route.fulfill({ status: 404, body: "absent" }));
    const r = await errPage.evaluate((u) => window.__segLab.run("erreur", u), synth.aplat);
    report.errors[code] = r.error ?? null;
    check(!r.ok && r.error?.code === code, `${label} : erreur « ${r.error?.code} » — ${r.error?.message}`);
    check((await errPage.getByText(r.error?.message ?? "∅").count()) > 0, `${label} : message affiché dans la page`);
    await ctx.close();
  }

  // ── 6. Réseau ──────────────────────────────────────────────────────────────────────────
  await context.close();
  report.external = [...new Set(external)];
  check(report.external.length === 0, `aucune requête externe, télémétrie MediaPipe comprise (${report.external.join(", ") || "—"})`);
} finally {
  await browser.close();
  server.stop();
}

writeFileSync(join(OUT, "rapport.json"), JSON.stringify({ ...report, failures }, null, 2) + "\n");
console.log(failures.length ? `\n${failures.length} échec(s).` : "\nTout est conforme.");
process.exit(failures.length ? 1 : 0);

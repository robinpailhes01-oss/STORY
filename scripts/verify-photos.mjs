// Vérifie l’import des photos dans un vrai Chromium (page /labo-photos) :
//  1. chaque fixture de tests/fixtures/photos/ : dimensions, orientation (couleur des repères),
//     type de sortie JPEG sans EXIF, plafond 2560 px, avertissement basse définition ;
//  2. le repli EXIF manuel (orientation appliquée par nous) donne le même résultat ;
//  3. HEIC converti par heic-to, chargé seulement à la demande ;
//  4. erreurs françaises : faux fichier, JPEG cassé, fichier trop lourd, HEIC illisible ;
//  5. détection de signature sur des octets construits ;
//  6. brouillon IndexedDB : enregistrement, rechargement de la page, restauration, effacement ;
//  7. sans IndexedDB (navigation privée) : rien ne plante, message affiché.
// Captures et rapport dans captures/photos/.
//
// Usage : npm run build && npm run verify:photos   (BASE_URL=… pour viser un serveur déjà lancé)

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { chromium } from "playwright";

const ROOT = new URL("..", import.meta.url).pathname;
const FIX = join(ROOT, "tests/fixtures/photos");
const OUT = join(ROOT, "captures/photos");
const MANIFEST = JSON.parse(readFileSync(join(FIX, "manifest.json"), "utf8"));
const MAX_SIDE = 2560;

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? "✔" : "✘"} ${message}`);
  if (!ok) failures.push(message);
  return ok;
};

/** Port libre choisi par le système : jamais de collision avec un serveur resté ouvert. */
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

const COLORS = { rouge: [230, 20, 30], bleu: [20, 60, 230], vert: [20, 200, 60] };
const near = (px, rgb, tol = 40) => rgb.every((v, i) => Math.abs(px[i] - v) <= tol);
const neutral = (px) => Math.max(px[0], px[1], px[2]) - Math.min(px[0], px[1], px[2]) < 50;
const fmt = (px) => `rgb(${px.slice(0, 3).join(", ")})`;

const lab = (page) => page.evaluate(() => window.__photoLab);

async function waitReady(page) {
  await page.waitForSelector('[data-photo-lab="ready"]', { timeout: 30_000 });
}

async function waitEntries(page, count, timeout = 180_000) {
  await page.waitForFunction((n) => window.__photoLab && window.__photoLab.entries.length >= n && !window.__photoLab.busy, count, {
    timeout,
  });
  return lab(page);
}

/** Vérifie une photo importée par rapport à sa fiche du manifeste. */
async function checkPhoto(page, entry, spec, label) {
  const tag = `${label} ${spec.file}`;
  if (!check(entry?.status === "ok", `${tag} : importée${entry?.status === "erreur" ? ` (erreur ${entry.code} : ${entry.message})` : ""}`)) return;
  check(entry.sourceType === spec.sourceType, `${tag} : format réel ${entry.sourceType}`);
  check(entry.blobType === "image/jpeg" && entry.urlIsBlob && entry.imageComplete, `${tag} : JPEG, object URL, image décodée`);
  check(
    entry.width === spec.expectedWidth && entry.height === spec.expectedHeight,
    `${tag} : ${entry.width} × ${entry.height} (attendu ${spec.expectedWidth} × ${spec.expectedHeight})`,
  );
  check(Math.max(entry.width, entry.height) <= MAX_SIDE, `${tag} : plus grand côté ≤ ${MAX_SIDE}`);
  check(
    JSON.stringify(entry.warnings) === JSON.stringify(spec.warnings),
    `${tag} : avertissements ${JSON.stringify(entry.warnings)}${entry.warningMessages.length ? ` « ${entry.warningMessages[0]} »` : ""}`,
  );

  const names = Object.keys(spec.markers);
  const points = [...names.map((n) => spec.markers[n]), [0.9, 0.9]];
  if (spec.transparentCorner) points.push(spec.transparentCorner);
  let px;
  try {
    px = await page.evaluate(([id, pts]) => window.__photoLab.sample(id, pts), [entry.id, points]);
  } catch (error) {
    check(false, `${tag} : lecture des pixels impossible (canvas « tainted » ?) ${error.message}`);
    return;
  }
  const placed = names.map((n, i) => near(px[i], COLORS[n]));
  check(
    placed.every(Boolean),
    `${tag} : redressée, repères à leur place (${names.map((n, i) => `${n} ${fmt(px[i])}`).join(", ")})`,
  );
  check(neutral(px[names.length]), `${tag} : coin bas droit sans repère ${fmt(px[names.length])}`);
  if (spec.transparentCorner) {
    const corner = px[names.length + 1];
    check(corner.slice(0, 3).every((v) => v >= 245), `${tag} : transparence aplatie sur du blanc ${fmt(corner)}`);
  }

  const bytes = await page.evaluate((id) => window.__photoLab.inspect(id), entry.id);
  check(bytes.startsWithJpeg && !bytes.hasExif && !bytes.hasMake, `${tag} : métadonnées supprimées (EXIF ${bytes.hasExif ? "présent" : "absent"})`);
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: chromiumPath() });
const report = { support: null, imports: [], manuel: [], errors: [], draft: {}, privateMode: {} };
try {
  mkdirSync(OUT, { recursive: true });
  const photos = MANIFEST.photos;
  const heicSpecs = photos.filter((p) => p.sourceType === "image/heic");

  // ── 1. Import de toutes les fixtures (téléphone) ─────────────────────────────────────────
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  const scripts = [];
  page.on("response", async (res) => {
    if (!res.url().endsWith(".js")) return;
    try {
      scripts.push({ url: res.url(), size: (await res.body()).length, at: Date.now() });
    } catch {}
  });

  await page.goto(`${server.url}/labo-photos`);
  await waitReady(page);
  const initial = await lab(page);
  report.support = initial.support;
  console.log("Capacités :", JSON.stringify(initial.support));
  check(initial.entries.length === 0, "page neuve : aucun brouillon restauré");
  check(initial.draft.available === true, "IndexedDB disponible");
  const heavyBefore = scripts.filter((s) => s.size > 1_000_000);
  check(heavyBefore.length === 0, `heic-to non chargé à l’ouverture (${scripts.length} scripts, ${Math.round(scripts.reduce((a, s) => a + s.size, 0) / 1024)} Ko)`);

  const importStart = Date.now();
  await page.setInputFiles("#photo-input", photos.map((p) => join(FIX, p.file)));
  let state = await waitEntries(page, photos.length);
  console.log(`  (${photos.length} photos importées en ${Date.now() - importStart} ms)`);
  check(
    state.entries.map((e) => e.fileName).join("|") === photos.map((p) => p.file).join("|"),
    "photos traitées une par une, dans l’ordre",
  );
  for (const [i, spec] of photos.entries()) {
    const entry = state.entries[i];
    report.imports.push(entry);
    console.log(`  · ${spec.file} → ${entry.decoder ?? entry.code} ${entry.durationMs ?? ""} ms`);
    await checkPhoto(page, entry, spec, "[auto]");
  }
  const big = state.entries.find((e) => e.fileName.startsWith("grosse"));
  check(big?.sourceWidth === 6000 && big?.sourceHeight === 8000, `gros JPEG lu en 6000 × 8000 (décodeur ${big?.decoder})`);
  if (heicSpecs.length) {
    const heic = state.entries.filter((e) => e.sourceType === "image/heic");
    check(heic.every((e) => e.decoder === "heic-to"), `HEIC convertis par heic-to (${heic.map((e) => e.decoder).join(", ")})`);
    const heavyAfter = scripts.filter((s) => s.size > 1_000_000);
    check(heavyAfter.length === 1 && heavyAfter[0].at >= importStart, `heic-to chargé à la demande (${heavyAfter.map((s) => `${Math.round(s.size / 1024)} Ko`).join(", ")})`);
  } else {
    console.log("  (aucune fixture HEIC : conversion non testée)");
  }

  // ── 2. Repli EXIF manuel ───────────────────────────────────────────────────────────────
  const exifSpecs = photos.filter((p) => p.sourceType === "image/jpeg" && !p.file.startsWith("grosse"));
  await page.check("text=Forcer la lecture EXIF manuelle");
  const before = state.entries.length;
  await page.setInputFiles("#photo-input", exifSpecs.map((p) => join(FIX, p.file)));
  state = await waitEntries(page, before + exifSpecs.length);
  await page.uncheck("text=Forcer la lecture EXIF manuelle");
  for (const [i, spec] of exifSpecs.entries()) {
    const entry = state.entries[before + i];
    report.manuel.push(entry);
    const expected = spec.orientation === 1 ? ["natif", "natif-reduit", "exif-manuel"] : ["exif-manuel"];
    check(expected.includes(entry.decoder), `[manuel] ${spec.file} : chemin ${entry.decoder}`);
    await checkPhoto(page, entry, spec, "[manuel]");
  }

  // ── 3. Erreurs ─────────────────────────────────────────────────────────────────────────
  const nBefore = state.entries.length;
  await page.setInputFiles("#photo-input", MANIFEST.invalid.map((f) => join(FIX, f)));
  state = await waitEntries(page, nBefore + MANIFEST.invalid.length);
  const fake = state.entries[nBefore];
  report.errors.push(fake);
  check(fake.status === "erreur" && fake.code === "format_inconnu", `faux.jpg refusé : ${fake.code} « ${fake.message} »`);
  check(await page.getByRole("alert").filter({ hasText: fake.message }).isVisible(), "message d’erreur affiché à l’utilisateur");

  const built = await page.evaluate(async () => {
    const jpegHead = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00];
    const garbage = (n) => Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256);
    const heicHead = [0, 0, 0, 0x18, ..."ftypheic".split("").map((c) => c.charCodeAt(0)), 0, 0, 0, 0, ..."mif1heic".split("").map((c) => c.charCodeAt(0))];
    const heavy = new Uint8Array(51 * 1024 * 1024);
    heavy.set([0xff, 0xd8, 0xff]);
    const files = [
      new File([new Uint8Array([...jpegHead, ...garbage(4000)])], "casse.jpg", { type: "image/jpeg" }),
      new File([heavy], "lourde.jpg", { type: "image/jpeg" }),
      new File([new Uint8Array([...heicHead, ...garbage(4000)])], "casse.heic", { type: "image/heic" }),
      new File([new TextEncoder().encode("GIF89a pas pris en charge")], "anim.gif", { type: "image/gif" }),
    ];
    return window.__photoLab.importFiles(files);
  });
  const expectCodes = { "casse.jpg": "illisible", "lourde.jpg": "trop_lourde", "casse.heic": "heic_non_pris_en_charge", "anim.gif": "format_inconnu" };
  for (const r of built) {
    report.errors.push(r);
    check(r.status === "erreur" && r.code === expectCodes[r.fileName], `${r.fileName} refusé : ${r.code} « ${r.message} »`);
    check(/^(Ce|Cette) /.test(r.message ?? "") && /[’éèàù]/.test(r.message ?? ""), `${r.fileName} : message en français`);
  }

  // ── 4. Signatures construites ──────────────────────────────────────────────────────────
  const sniffs = await page.evaluate(() => {
    const ftyp = (major, compat = []) => {
      const s = 16 + compat.length * 4;
      const text = "ftyp" + major + "\0\0\0\0" + compat.join("");
      return [0, 0, 0, s, ...text.split("").map((c) => c.charCodeAt(0)), 0, 0, 0, 0];
    };
    const out = {};
    for (const b of ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]) out[b] = window.__photoLab.sniff(ftyp(b));
    out.avif = window.__photoLab.sniff(ftyp("avif", ["avif", "mif1"]));
    out.mp4 = window.__photoLab.sniff(ftyp("isom", ["isom", "mp41"]));
    out.jpeg = window.__photoLab.sniff([0xff, 0xd8, 0xff, 0xdb]);
    out.png = window.__photoLab.sniff([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    out.webp = window.__photoLab.sniff("RIFF\0\0\0\0WEBPVP8 ".split("").map((c) => c.charCodeAt(0)));
    out.texte = window.__photoLab.sniff("bonjour tout le monde".split("").map((c) => c.charCodeAt(0)));
    return out;
  });
  const heicBrands = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"];
  check(heicBrands.every((b) => sniffs[b] === "image/heic"), `marques HEIC reconnues (${heicBrands.join(", ")})`);
  check(sniffs.avif === null && sniffs.mp4 === null && sniffs.texte === null, "AVIF, MP4 et texte refusés");
  check(sniffs.jpeg === "image/jpeg" && sniffs.png === "image/png" && sniffs.webp === "image/webp", "JPEG, PNG, WebP reconnus par leurs octets");

  await page.screenshot({ path: join(OUT, "labo-mobile.png"), fullPage: true });

  // ── 5. Brouillon IndexedDB ─────────────────────────────────────────────────────────────
  const okBefore = state.entries.filter((e) => e.status === "ok");
  await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  await page.waitForFunction(() => window.__photoLab.draft.last === "enregistré", null, { timeout: 30_000 });
  state = await lab(page);
  check(state.draft.count === okBefore.length, `brouillon enregistré (${state.draft.count} photos)`);
  await page.reload();
  await waitReady(page);
  state = await lab(page);
  report.draft.restored = state.entries.length;
  check(state.draft.last === "restauré" && state.entries.length === okBefore.length, `après rechargement : ${state.entries.length} photos restaurées`);
  check(
    state.entries.every((e, i) => e.restored && e.id === okBefore[i].id && e.width === okBefore[i].width && e.height === okBefore[i].height && e.decoder === "brouillon"),
    "mêmes identifiants, dimensions et ordre après restauration",
  );
  const restoredSpec = photos.find((p) => p.file.startsWith("jpeg-exif6"));
  await checkPhoto(page, state.entries.find((e) => e.fileName === restoredSpec.file), restoredSpec, "[brouillon]");
  await page.getByRole("button", { name: "Effacer le brouillon" }).click();
  await page.waitForFunction(() => window.__photoLab.draft.last === "effacé", null, { timeout: 30_000 });
  await page.reload();
  await waitReady(page);
  state = await lab(page);
  check(state.entries.length === 0, "brouillon effacé : rien n’est restauré au rechargement");
  check(pageErrors.length === 0, `aucune erreur JavaScript (${pageErrors.join(" | ") || "—"})`);
  await context.close();

  // ── 6. Sans IndexedDB ──────────────────────────────────────────────────────────────────
  const privateCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await privateCtx.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { configurable: true, get: () => undefined });
  });
  const priv = await privateCtx.newPage();
  const privErrors = [];
  priv.on("pageerror", (e) => privErrors.push(e.message));
  await priv.goto(`${server.url}/labo-photos`);
  await waitReady(priv);
  let p = await lab(priv);
  check(p.draft.available === false && !!p.draft.message, `sans IndexedDB : page prête, « ${p.draft.message} »`);
  await priv.setInputFiles("#photo-input", [join(FIX, "jpeg-exif6-1600x1200.jpg")]);
  p = await waitEntries(priv, 1);
  check(p.entries[0]?.status === "ok", "sans IndexedDB : l’import fonctionne");
  await priv.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  await priv.waitForTimeout(300);
  p = await lab(priv);
  report.privateMode = p.draft;
  check(p.draft.available === false && (await priv.getByRole("status").isVisible()), "sans IndexedDB : enregistrement refusé proprement, message visible");
  check(privErrors.length === 0, `sans IndexedDB : aucune erreur JavaScript (${privErrors.join(" | ") || "—"})`);
  await privateCtx.close();

  // ── 7. Capture ordinateur ──────────────────────────────────────────────────────────────
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const dp = await desk.newPage();
  await dp.goto(`${server.url}/labo-photos`);
  await waitReady(dp);
  await dp.setInputFiles("#photo-input", [...photos.map((x) => join(FIX, x.file)), ...MANIFEST.invalid.map((f) => join(FIX, f))]);
  await waitEntries(dp, photos.length + MANIFEST.invalid.length);
  await dp.screenshot({ path: join(OUT, "labo-ordinateur.png"), fullPage: true });
  await desk.close();
} finally {
  await browser.close();
  server.stop();
}

writeFileSync(join(OUT, "rapport.json"), JSON.stringify({ ...report, failures }, null, 2) + "\n");
console.log(failures.length ? `\n${failures.length} échec(s).` : "\nTout est conforme.");
process.exit(failures.length ? 1 : 0);

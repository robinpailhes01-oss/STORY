// Vérifie la page « / » (src/features/creator) dans un vrai Chromium, avec l’IA simulée (STORY_AI_MOCK=1),
// sur le parcours de référence (docs/REFERENCE_PARCOURS_COMPLET.md) :
//  iPhone (390 × 844, DPR 3, tactile) : carte profil (bio dépliable, Mon contexte, photo de profil, preuves p1…),
//  « Pas d’idée ? », 2 photos puis 3 (rangée de vignettes, ✕, échanger), mode texte trop court → message,
//  Générer SANS idée (écran de progression en %), éditeur, glisser, Présenter (avance, sortie), zoom − / +,
//  panneau Style (5 styles dont Géant avec détourage, décoration, couleur, code hexadécimal, accents masqués),
//  Crayon (stylo, surligneur, ovale, coordonnées avec zoom, annuler, effacer), Texte (astérisques, 3 accents,
//  saisie regroupée), Refaire cette story (seule la story change, annuler), reprise d’une demande coupée en
//  arrière-plan, cadrage, export (5 PNG 1080 × 1920 + ZIP), mémoire de voix envoyée après l’export,
//  rechargement (brouillon complet : style, options, dessins, photos), Nouvelle séquence ;
//  ordinateur court (1366 × 700) : 2 photos, Générer sans idée, Géant, export ;
//  sans clé : message « cle_absente » puis « Essayer avec l’exemple ».
//  Partout : aucune erreur JavaScript, aucun défilement horizontal, zones tactiles ≥ 44 px, aucune requête hors de
//  nos routes et des fichiers du site, photo de profil jamais envoyée.
// Captures dans captures/app/ (photos de test synthétiques uniquement).
//
// Usage : npm run build && npm run verify:app

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { chromium } from "playwright";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "captures/app");
const RAW = join(tmpdir(), "story-verify-app");
const SAMPLES = ["mer-plan-large.jpg", "salle-plan-moyen.jpg", "portrait.jpg"].map((f) => join(ROOT, "public/samples/test", f));
const W = 1080;
const H = 1920;
const IPHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1366, height: 700 }, deviceScaleFactor: 1 };

const failures = [];
const started = Date.now();
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(0).padStart(3)} s`;
const check = (ok, message, detail) => {
  console.log(`${ok ? "✔" : "✘"} ${elapsed()} · ${message}${!ok && detail ? `\n    ${detail}` : ""}`);
  if (!ok) failures.push(message);
  return ok;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");

function pngSize(buffer) {
  const signature = buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  const ihdr = buffer.subarray(12, 16).toString("ascii") === "IHDR";
  if (!signature || !ihdr) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** next start dans son propre groupe de processus (npx → next-server), arrêté en entier à la fin. */
async function startServer(env) {
  const port = await freePort();
  const child = spawn("npx", ["next", "start", "-p", String(port)], {
    cwd: ROOT,
    stdio: "ignore",
    detached: true,
    env: { ...process.env, ...env },
  });
  const stop = () => {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  };
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(url)).ok) return { url, stop };
    } catch {}
    await sleep(500);
  }
  stop();
  throw new Error("le serveur Next.js n’a pas démarré (npm run build d’abord ?)");
}

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  return existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
}

/** Messages d’information de MediaPipe écrits sur la console d’erreur (pas des erreurs). */
const MEDIAPIPE_INFO = /^(console : )?(INFO|W\d{4}|I\d{4}):? /;

/**
 * Page surveillée : erreurs JavaScript, requêtes hors de nos routes et des fichiers du site. `document.visibilityState`
 * peut être simulé (window.__vis) pour tester la reprise d’une demande coupée en arrière-plan.
 */
async function openPage(browser, options, base) {
  const context = await browser.newContext({ ...options, acceptDownloads: true, locale: "fr-FR" });
  await context.addInitScript(() => {
    Object.defineProperty(Document.prototype, "visibilityState", { configurable: true, get: () => window.__vis ?? "visible" });
    Object.defineProperty(Document.prototype, "hidden", { configurable: true, get: () => (window.__vis ?? "visible") === "hidden" });
  });
  const page = await context.newPage();
  const errors = [];
  const foreign = [];
  const origin = new URL(base).origin;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !MEDIAPIPE_INFO.test(m.text()) && errors.push(`console : ${m.text()}`));
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.protocol === "data:" || url.protocol === "blob:") return;
    const allowed =
      url.origin === origin &&
      (/^\/(api\/generations|api\/generations\/story|api\/ideas)$/.test(url.pathname) ||
        /^\/(_next|fonts|samples|mediapipe|models)\//.test(url.pathname) ||
        ["/", "/favicon.ico"].includes(url.pathname));
    if (!allowed) foreign.push(`${req.method()} ${req.url()}`);
  });
  return { context, page, errors, foreign };
}

const setVisibility = (page, state) =>
  page.evaluate((v) => {
    window.__vis = v;
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);

async function noHorizontalScroll(page, label) {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  check(scroll <= inner, `${label} : pas de défilement horizontal (${scroll} ≤ ${inner} px)`);
}

/** Les éléments interactifs visibles font au moins 44 px de haut et de large (zones tactiles). */
async function touchTargets(page, label) {
  const small = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("button, [role=switch], [role=radio], input[type=range], a[href]")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || el.closest("[aria-hidden=true]") || el.closest("[hidden]")) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || el.classList.contains("sheet-backdrop")) continue;
      if (r.height < 43.5 || r.width < 43.5) out.push(`${(el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40)} (${Math.round(r.width)}×${Math.round(r.height)})`);
    }
    return out;
  });
  check(small.length === 0, `${label} : zones tactiles ≥ 44 px`, small.join(" ; "));
}

/** Variation de luminance des canvas : un aperçu dessiné n’est ni vide ni uni. */
async function canvasStats(page, selector) {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll(sel)].map((canvas) => {
      const ctx = canvas.getContext("2d");
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let sum = 0;
      let sum2 = 0;
      let opaque = 0;
      const n = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        sum += l;
        sum2 += l * l;
        if (data[i + 3] > 250) opaque++;
      }
      const mean = sum / n;
      return { width: canvas.width, height: canvas.height, mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), opaque: opaque / n };
    });
  }, selector);
}

async function canvasHash(page, selector) {
  return page.evaluate((sel) => document.querySelector(sel)?.toDataURL("image/png").slice(-200) ?? "", selector);
}

const report = (page) => page.evaluate(() => window.__storyApp);
const waitReady = (page, extra = "true", timeout = 30_000) =>
  page.waitForFunction(`window.__storyApp?.ready === true && (${extra})`, null, { timeout });
const textOfStory = (rep, i) => rep.slides[i].blocks.filter((b) => b.opacity === 1).map((b) => b.text);
const storyTexts = (rep) => rep.slides.map((_, i) => textOfStory(rep, i).join(" | "));

async function download(page, selector, target) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click(selector)]);
  await dl.saveAs(target);
  return { name: dl.suggestedFilename(), buffer: readFileSync(target) };
}

async function shot(page, name, fullPage = false) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage });
}

/** Trait à la souris sur l’aperçu, de (fx0, fy0) à (fx1, fy1) en fractions de sa taille affichée. */
async function drawOnPreview(page, from, to, steps = 10) {
  const box = await page.getByTestId("dessin").boundingBox();
  const at = ([fx, fy]) => [box.x + box.width * fx, box.y + box.height * fy];
  const [x0, y0] = at(from);
  const [x1, y1] = at(to);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
  await page.mouse.up();
  return { box, x0, y0 };
}

async function verifyExport(page, label, prefix) {
  await page.click("[data-action=exporter]");
  await page.getByRole("heading", { name: "Tes 5 stories sont prêtes" }).waitFor({ timeout: 90_000 });
  const pngs = [];
  for (let i = 1; i <= 5; i++) {
    const file = await download(page, `[data-download=png-${i}]`, join(RAW, `${prefix}-${i}.png`));
    const size = pngSize(file.buffer);
    pngs.push({ ...file, size });
    check(size?.width === W && size?.height === H, `${label} : ${file.name} fait ${size?.width}×${size?.height}`);
  }
  const zipFile = await download(page, "[data-download=zip]", join(RAW, `${prefix}.zip`));
  const zip = await JSZip.loadAsync(zipFile.buffer);
  const entries = Object.keys(zip.files);
  check(
    JSON.stringify(entries) === JSON.stringify(pngs.map((p) => p.name)) && JSON.stringify([...entries].sort()) === JSON.stringify(entries),
    `${label} : ${zipFile.name} contient les 5 PNG dans l’ordre (${entries.join(", ")})`,
  );
  for (const [i, name] of entries.entries()) {
    const buffer = await zip.file(name).async("nodebuffer");
    const size = pngSize(buffer);
    check(size?.width === W && size?.height === H && sha(buffer) === sha(pngs[i].buffer), `${label} : ZIP/${name} 1080×1920, identique au PNG ${i + 1}`);
  }
  return pngs;
}

/** Ouvre le panneau Style (s’il ne l’est pas) et choisit un style ; attend la composition. */
async function chooseStyle(page, styleId) {
  if (!(await page.locator("[data-panel=style]").count())) await page.click("[data-tool=style]");
  await page.locator(`[data-style=${styleId}]`).scrollIntoViewIfNeeded();
  await page.click(`[data-style=${styleId}]`);
  await waitReady(page, `window.__storyApp.styleId === "${styleId}" && !window.__storyApp.cutouts.computing`, 60_000);
}

rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: chromiumPath() });
let server = await startServer({ STORY_AI_MOCK: "1" });
try {
  // ══ 1. iPhone, IA simulée ═══════════════════════════════════════════════════════════════
  console.log(`\niPhone (390 × 844, DPR 3) · ${server.url}`);
  const { page, errors, foreign } = await openPage(browser, IPHONE, server.url);
  const sent = { generations: [], ideas: [], rewrites: [] };
  const bodies = [];
  page.on("request", (req) => {
    const path = new URL(req.url()).pathname;
    if (req.method() !== "POST" || !path.startsWith("/api/")) return;
    const body = req.postData() ?? "{}";
    bodies.push(body);
    const parsed = JSON.parse(body);
    if (path === "/api/generations") sent.generations.push(parsed);
    else if (path === "/api/generations/story") sent.rewrites.push(parsed);
    else if (path === "/api/ideas") sent.ideas.push(parsed);
  });

  await page.goto(server.url);
  await page.waitForSelector("[data-screen=create]", { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await sleep(300);

  // Écran Créer : en-tête, carte profil, titre, zone photos vide
  const profile = page.getByTestId("profil");
  check(
    (await profile.textContent()).includes("Robin ✦ IA & relation client PME | Montpellier") && (await profile.textContent()).includes("@luma_agence"),
    "Créer : carte profil (nom ✦ bio, @identifiant) alimentée par Mon contexte",
  );
  check((await page.locator("[aria-current=step]").textContent()).includes("Tes photos"), "Créer : fil d’étapes « Ton profil • Tes photos », étape en cours signalée");
  const titleFont = await page.locator("h1").evaluate((el) => getComputedStyle(el).fontFamily + "|" + getComputedStyle(el).fontStyle);
  check(titleFont.startsWith('"Playfair UI"') && titleFont.endsWith("italic"), `Créer : titre en serif italique (${titleFont})`);
  check(await page.evaluate(() => document.fonts.check('italic 40px "Playfair UI"')), "Créer : police Playfair italique chargée");
  check(await page.getByRole("button", { name: "Ajouter 2 ou 3 photos" }).isVisible(), "Créer : grande zone en pointillés pour ajouter les photos");
  check(await page.locator("[data-action=generer]").isDisabled(), "Créer : « Générer » inactif sans photo");
  check(await page.getByText("Facultatif", { exact: true }).isVisible(), "Créer : idée marquée « Facultatif »");
  await page.getByRole("button", { name: "À quoi sert ton idée ?" }).click();
  check(await page.getByText("Sans idée, elle part de ton profil").isVisible(), "Créer : ⓘ explique que sans idée l’IA part du profil");
  await page.getByRole("button", { name: "À quoi sert ton idée ?" }).click();
  await profile.getByRole("button", { name: "Voir la bio" }).click();
  check(await profile.getByText("Partenaire IA des PME à Montpellier").isVisible(), "Carte profil : « Voir la bio + » déplie ton activité");
  await profile.getByRole("button", { name: "Masquer la bio" }).click();
  await shot(page, "creer-mobile");
  await noHorizontalScroll(page, "Créer");
  await touchTargets(page, "Créer");

  // Mon contexte (en touchant la carte) : preuves numérotées, photo de profil gardée sur l’appareil
  await page.click("[data-action=profil]");
  const sheet = page.getByTestId("context-sheet");
  await sheet.waitFor();
  check((await sheet.getByLabel("Ton activité").inputValue()).includes("Partenaire IA des PME"), "Mon contexte : ouvert depuis la carte profil, pré-rempli");
  check((await sheet.getByTestId("preuves").textContent()).startsWith("p1"), "Mon contexte : les preuves sont affichées avec leur identifiant (p1…)");
  check(await sheet.getByText("Un chiffre n’est cité que s’il figure dans une de tes preuves").isVisible(), "Mon contexte : rappel « un chiffre n’est cité que s’il est dans une preuve »");
  await sheet.getByTestId("avatar-input").setInputFiles(SAMPLES[2]);
  await sheet.locator("img").first().waitFor({ timeout: 15_000 });
  await sheet.getByLabel("Ton appel à l’action").fill("Réponds AUDIT en message privé");
  await sheet.locator(".overflow-y-auto").evaluate((el) => el.scrollTo(0, 0));
  await shot(page, "contexte-mobile");
  await sheet.getByTestId("preuves").scrollIntoViewIfNeeded();
  await shot(page, "contexte-preuves-mobile");
  await touchTargets(page, "Mon contexte");
  await sheet.getByRole("button", { name: "Enregistrer" }).click();
  await sheet.waitFor({ state: "detached" });
  const savedContext = await page.evaluate(() => JSON.parse(localStorage.getItem("story.contexte.v1") ?? "{}"));
  check(savedContext.cta === "Réponds AUDIT en message privé", "Mon contexte : enregistré dans localStorage");
  const avatar = await page.evaluate(() => localStorage.getItem("story.avatar.v1") ?? "");
  check(avatar.startsWith("data:image/jpeg") && avatar.length < 60_000, `Photo de profil : petit carré JPEG gardé sur l’appareil (${avatar.length} caractères)`);
  check((await profile.locator("img").count()) === 1, "Carte profil : la photo de profil s’affiche");

  // Pas d’idée ?
  await page.getByRole("button", { name: "Pas d’idée ?" }).click();
  await page.locator("[data-testid=idees] [data-idea]").nth(4).waitFor({ timeout: 20_000 });
  check((await page.locator("[data-testid=idees] [data-idea]").count()) === 5, "Pas d’idée ? : 5 idées affichées");
  check(sent.ideas.at(-1)?.context?.cta === "Réponds AUDIT en message privé", "Pas d’idée ? : le contexte est envoyé");
  await page.locator("[data-testid=idees]").scrollIntoViewIfNeeded();
  await shot(page, "idees-mobile");
  await page.locator("[data-idea='1']").click();
  const ideaValue = await page.locator("#idee").inputValue();
  check(ideaValue.startsWith("« L'IA, ce n'est pas pour les petites entreprises »"), "Idée choisie : l’idée remplit le champ", ideaValue);
  check((await page.locator("[data-action=structure]").textContent()).includes("Objection"), "Idée choisie : « Structure : Objection » (repli avancé)");
  await page.click("[data-action=structure]");
  check((await page.locator("[data-structure=objection]").getAttribute("aria-checked")) === "true", "Structure : le repli s’ouvre sur les puces, Objection choisie");
  await page.click("[data-structure=auto]");
  await page.click("[data-action=structure]");
  await page.locator("#idee").fill("");

  // 2 photos, puis 3
  await page.setInputFiles("[data-testid=photo-input-multi]", SAMPLES.slice(0, 2));
  await page.waitForFunction(() => document.querySelectorAll("[data-photo-slot] img").length === 2 && !document.querySelector("[data-testid=import-progress]"), null, { timeout: 30_000 });
  check((await page.locator("[data-action=ajouter-photos]").count()) === 1, "Photos : 2 vignettes numérotées + une tuile « + »");
  check(await page.locator("[data-action=generer]").isEnabled(), "Créer : « Générer » actif dès 2 photos, sans idée");
  await shot(page, "photos-2-mobile");
  await page.setInputFiles("[data-testid=photo-input-multi]", SAMPLES[2]);
  await page.waitForFunction(() => document.querySelectorAll("[data-photo-slot] img").length === 3 && !document.querySelector("[data-testid=import-progress]"), null, { timeout: 30_000 });
  check((await page.locator("[data-action=ajouter-photos]").count()) === 0, "Photos : 3 vignettes, plus de tuile « + » (3 au maximum)");
  const order = () => page.evaluate(() => [...document.querySelectorAll("[data-photo-slot] img")].map((i) => i.src));
  const three = await order();
  await page.click("[data-photo-slot='1']");
  await page.getByTestId("photo-menu").getByRole("button", { name: /Échanger avec la photo 2/ }).click();
  const swapped = await order();
  check(swapped[0] === three[1] && swapped[1] === three[0], "Photos : échanger la photo 1 et la photo 2 (menu de la vignette)");
  await page.click("[data-photo-slot='1']");
  await page.getByTestId("photo-menu").getByRole("button", { name: /Échanger avec la photo 2/ }).click();
  await page.click("[data-remove-photo='2']");
  const afterRemove = await order();
  check(afterRemove.length === 2 && afterRemove[0] === three[0] && afterRemove[1] === three[2], "Photos : ✕ retire la photo 2, la 3 avance");
  await page.setInputFiles("[data-testid=photo-input-multi]", SAMPLES[1]);
  await page.waitForFunction(() => document.querySelectorAll("[data-photo-slot] img").length === 3 && !document.querySelector("[data-testid=import-progress]"), null, { timeout: 30_000 });
  await page.click("[data-photo-slot='2']");
  await page.getByTestId("photo-menu").getByRole("button", { name: /Échanger avec la photo 3/ }).click();
  const finalOrder = await order();
  check(finalOrder.length === 3 && finalOrder[0] === three[0] && finalOrder[2] === afterRemove[1], "Photos : nouvelle photo 2 ajoutée puis remise à sa place (échange 2 ↔ 3)");
  await page.locator("[data-photo-slot='1']").scrollIntoViewIfNeeded();
  await shot(page, "photos-mobile");
  await noHorizontalScroll(page, "Créer avec photos");
  await touchTargets(page, "Créer avec photos");

  // Mode texte : texte trop court → message de l’API sous le champ
  await page.getByRole("switch", { name: "J’ai déjà mon texte" }).click();
  check(await page.locator("[data-action=generer]").isDisabled(), "Mode texte : « Générer » inactif tant que le texte est vide");
  await page.locator("#idee").fill("Un texte bien trop court. Deux phrases.");
  await page.click("[data-action=generer]");
  await page.waitForSelector("[data-screen=create] [data-error-code=texte_trop_court]", { timeout: 20_000 });
  check(
    (await page.locator("[data-error-code=texte_trop_court]").textContent()).includes("trop court pour 5 stories"),
    "Mode texte : texte trop court → retour à Créer avec le message de l’API",
  );
  await page.locator("[data-error-code=texte_trop_court]").scrollIntoViewIfNeeded();
  await shot(page, "texte-trop-court-mobile");
  await page.getByRole("switch", { name: "J’ai déjà mon texte" }).click();
  await page.locator("#idee").fill("");

  // Générer SANS idée : écran de progression (réponse retardée)
  await page.route("**/api/generations", async (route) => {
    await sleep(4000);
    await route.continue();
  });
  await page.click("[data-action=generer]");
  await page.waitForSelector("[data-screen=generation]");
  await sleep(1500);
  const progress = Number(await page.getByTestId("progression").getAttribute("aria-valuenow"));
  check(progress > 0 && progress <= 95, `Génération : barre de progression estimée (${progress} %)`);
  check((await page.getByTestId("pourcentage").textContent()).trim() === `${progress} %`, "Génération : pourcentage affiché à droite");
  check(await page.getByRole("button", { name: "Annuler" }).isVisible(), "Génération : bouton Annuler discret");
  await shot(page, "generation-mobile");
  await page.waitForSelector("[data-screen=editor]", { timeout: 30_000 });
  await page.unroute("**/api/generations");
  await waitReady(page);
  await sleep(1200);
  const firstRequest = sent.generations.at(-1);
  check(
    firstRequest?.idea === "" && firstRequest?.mode === "idee" && firstRequest?.context?.cta === "Réponds AUDIT en message privé" && Array.isArray(firstRequest?.context?.voiceExamples),
    "Générer sans idée : idée vide, mode idée, contexte envoyé",
    JSON.stringify(firstRequest).slice(0, 300),
  );

  // Éditeur
  let rep = await report(page);
  check(rep.slides.length === 5, "Éditeur : 5 stories composées");
  check(rep.photos.every(Boolean) && JSON.stringify(rep.slides.map((s) => rep.photos.indexOf(s.assetId))) === "[0,1,1,2,2]", "Éditeur : 3 photos réparties (1 | 2, 3 | 4, 5)");
  const thumbs = await canvasStats(page, "[data-thumb] canvas");
  check(thumbs.length === 5 && thumbs.every((t) => t.std > 8 && t.opaque > 0.99), `Éditeur : 5 miniatures dessinées (écart-type ${thumbs.map((t) => t.std.toFixed(0)).join(", ")})`);
  const preview = await canvasStats(page, "[data-testid=apercu] canvas");
  check(preview.length === 1 && preview[0].std > 8 && preview[0].width >= 390 * 0.55 * 3, `Éditeur : grand aperçu dessiné (${preview[0]?.width}×${preview[0]?.height} px réels)`);
  const story2 = rep.slides[1].blocks;
  const found2 = story2.flatMap((b) => b.accentsFound);
  check(
    found2.includes("gagner quelques minutes.") && found2.includes("des heures chaque semaine.") && story2.every((b) => b.marker === "couleur" && b.family === "Poppins"),
    `Éditeur : story 2 en Poppins avec les mots dorés (${found2.join(" · ")})`,
  );
  check(rep.slides[2].blocks.filter((b) => b.opacity < 1).length === 3, "Éditeur : story 3 reprend les 3 paragraphes de la story 2 en grisé");
  check((await page.getByTestId("numero").textContent()).includes("1 / 5"), "Éditeur : numéro 1 / 5");
  for (const name of ["Style", "Photo", "Crayon", "Texte", "Refaire"]) {
    check(await page.locator(`[data-tool=${name.toLowerCase()}]`).isVisible(), `Éditeur : outil « ${name} » dans la barre`);
  }
  await shot(page, "editeur-mobile");
  await noHorizontalScroll(page, "Éditeur");
  await touchTargets(page, "Éditeur");

  // Glisser vers la gauche → story 2
  let box = await page.getByTestId("apercu").boundingBox();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(() => window.__storyApp?.storyIndex === 1);
  check((await page.getByTestId("numero").textContent()).includes("2 / 5"), "Éditeur : glisser vers la gauche passe à la story 2");

  // Présenter : plein écran, toucher à droite, avance automatique, sortie
  await page.click("[data-action=presenter]");
  const presenter = page.getByTestId("presentation");
  await presenter.waitFor();
  check((await presenter.getAttribute("data-index")) === "1", "Présenter : s’ouvre sur la story courante (2)");
  await page.click("[data-action=presenter-suivante]");
  check((await presenter.getAttribute("data-index")) === "2", "Présenter : toucher à droite → story 3");
  await page.click("[data-action=presenter-precedente]");
  check((await presenter.getAttribute("data-index")) === "1", "Présenter : toucher à gauche → story 2");
  await page.waitForFunction(() => document.querySelector("[data-testid=presentation]")?.dataset.index === "2", null, { timeout: 8000 }).then(
    () => check(true, "Présenter : avance automatique après ~5 s"),
    () => check(false, "Présenter : avance automatique après ~5 s"),
  );
  await sleep(1200);
  await shot(page, "presenter-mobile");
  await page.click("[data-action=presenter-fermer]");
  await presenter.waitFor({ state: "detached" });
  check((await report(page)).storyIndex === 2, "Présenter : ✕ ferme et l’éditeur reste sur la dernière story vue");
  await page.click("[data-thumb='2']");

  // Zoom − 100 % +
  const fitWidth = (await page.getByTestId("apercu").boundingBox()).width;
  await page.click("[data-action=zoom-plus]");
  await page.click("[data-action=zoom-plus]");
  await page.waitForFunction(() => window.__storyApp?.zoom === 1.5);
  const zoomedWidth = (await page.getByTestId("apercu").boundingBox()).width;
  const scrollable = await page.getByTestId("apercu-cadre").evaluate((el) => el.scrollWidth > el.clientWidth && el.scrollHeight > el.clientHeight);
  check(
    (await page.getByTestId("zoom").textContent()).trim() === "150 %" && Math.abs(zoomedWidth / fitWidth - 1.5) < 0.02 && scrollable,
    `Zoom : 150 %, l’aperçu grandit (${Math.round(fitWidth)} → ${Math.round(zoomedWidth)} px) et défile`,
  );
  await shot(page, "zoom-mobile");
  for (let i = 0; i < 6; i++) if (await page.locator("[data-action=zoom-moins]").isEnabled()) await page.click("[data-action=zoom-moins]");
  check((await page.getByTestId("zoom").textContent()).trim() === "50 %", "Zoom : jusqu’à 50 %");
  for (let i = 0; i < 8; i++) if (await page.locator("[data-action=zoom-plus]").isEnabled()) await page.click("[data-action=zoom-plus]");
  check((await page.getByTestId("zoom").textContent()).trim() === "200 %", "Zoom : jusqu’à 200 %");
  await page.click("[data-testid=zoom]");
  await page.waitForFunction(() => window.__storyApp?.zoom === 1);
  await noHorizontalScroll(page, "Éditeur zoomé");

  // Panneau Style : 17 tuiles, 5 styles dont Géant avec détourage
  await page.click("[data-tool=style]");
  await page.waitForSelector("[data-panel=style] [data-style=theatre] canvas");
  check((await page.locator("[data-panel=style] [data-style]").count()) === 17, "Style : grille de 17 styles");
  check((await page.locator("[data-panel=style] .panel-title").textContent()).trim() === "Style", "Style : titre « STYLE » en petites capitales");
  await sleep(600);
  await shot(page, "style-mobile");
  const markers = { trait: "souligne", orange: "pastille", serif: "couleur", massif: null };
  for (const [styleId, marker] of Object.entries(markers)) {
    await chooseStyle(page, styleId);
    rep = await report(page);
    const kinds = new Set(rep.slides[1].blocks.filter((b) => b.opacity === 1).map((b) => b.marker));
    check(
      (marker === null || kinds.has(marker)) && rep.problems.length === 0,
      `Style « ${styleId} » : appliqué aux 5 stories${marker ? ` (marquage ${marker})` : ""}, aucun problème bloquant`,
      `${[...kinds]} ${rep.problems.join(" ; ")}`,
    );
  }
  await page.click("[data-style=geant]");
  await page.waitForFunction(() => window.__storyApp?.cutouts?.needed === true, null, { timeout: 10_000 });
  const sawComputing = await page
    .getByTestId("detourage")
    .getByText("Détourage…")
    .waitFor({ timeout: 3000 })
    .then(() => true, () => false);
  await waitReady(page, `window.__storyApp.styleId === "geant" && !window.__storyApp.cutouts.computing`, 90_000);
  rep = await report(page);
  const giants = rep.slides.map((s) => s.giant).filter(Boolean);
  check(giants.length >= 2, `Géant : mot géant derrière la personne (${giants.join(", ")})`);
  const panelWarnings = await page.getByTestId("detourage").textContent();
  check(
    rep.cutouts.ids.length > 0 || /aucune personne détectée|détourage impossible/.test(panelWarnings),
    `Géant : détourage calculé (${rep.cutouts.ids.length} photo(s) détourée(s))${sawComputing ? ", indicateur « Détourage… » vu" : ""} ; sinon avertissement`,
    panelWarnings,
  );
  const noPerson = rep.photos.filter((id) => id && !rep.cutouts.ids.includes(id)).length;
  check(
    noPerson === 0 || rep.warnings.some((w) => /aucune personne détectée|détourage impossible/.test(w)),
    `Géant : ${noPerson} photo(s) sans personne détectée → avertissement dans Remarques, le mot reste devant`,
  );
  await page.locator("[data-style=geant]").scrollIntoViewIfNeeded();
  await shot(page, "style-geant-mobile");

  // Décoration, couleur, code hexadécimal, accents masqués (tout dans l’historique)
  await page.locator("[data-decoration=etoiles]").scrollIntoViewIfNeeded();
  await page.click("[data-decoration=etoiles]");
  await waitReady(page, `window.__storyApp.options?.decoration === "etoiles"`);
  rep = await report(page);
  check(rep.slides.filter((s) => s.decoration === "etoiles").length >= 3, `Décoration : « Traînée d’étoiles » posée (${rep.slides.filter((s) => s.decoration).length} stories)`);
  await page.click("[data-decoration=eclair]");
  await waitReady(page, `window.__storyApp.options?.decoration === "eclair"`);
  check((await page.locator("[data-decoration][aria-pressed=true]").count()) === 1, "Décoration : une seule active à la fois");
  await page.click("[data-decoration=eclair]");
  await waitReady(page, `window.__storyApp.options?.decoration === null`);
  check(true, "Décoration : re-toucher la puce active = aucune");
  await page.click("[data-decoration=etoiles]");
  await waitReady(page, `window.__storyApp.options?.decoration === "etoiles"`);
  await page.click("[data-color='#C8A25C']");
  await waitReady(page, `window.__storyApp.options?.accentColor === "#C8A25C"`);
  check(true, "Couleur : la pastille dorée s’applique (#C8A25C)");
  const hex = page.getByTestId("hex");
  await hex.fill("#3b6fe0");
  await waitReady(page, `window.__storyApp.options?.accentColor === "#3B6FE0"`);
  check(true, "Couleur : code hexadécimal saisi (#3b6fe0 → #3B6FE0)");
  await hex.fill("#zz");
  check((await hex.getAttribute("aria-invalid")) === "true" && (await report(page)).options.accentColor === "#3B6FE0", "Couleur : code invalide signalé, non appliqué");
  await hex.blur();
  await page.click("[data-action=couleur-du-style]");
  await waitReady(page, `window.__storyApp.options?.accentColor === null`);
  check(true, "Couleur : « Couleur du style » revient à la couleur d’origine");
  await page.click("[data-color='#C8A25C']");
  await waitReady(page, `window.__storyApp.options?.accentColor === "#C8A25C"`);
  await page.click("[data-action=mots-en-evidence]");
  await waitReady(page, `window.__storyApp.options?.showAccents === false`);
  rep = await report(page);
  check(rep.slides.every((s) => s.blocks.every((b) => b.accents.length === 0)), "Mots en évidence : désactivé → aucun marquage");
  await shot(page, "style-options-mobile");
  await page.click("[data-action=annuler]");
  await waitReady(page, `window.__storyApp.options?.showAccents === true`);
  check(true, "Annuler : les mots en évidence reviennent (options dans l’historique)");
  await page.locator("[data-decoration=etoiles]").scrollIntoViewIfNeeded();
  await shot(page, "style-decorations-mobile");
  await touchTargets(page, "Panneau Style");
  await noHorizontalScroll(page, "Panneau Style");

  // Crayon : un trait de chaque outil sur la story 2, coordonnées dans le repère 1080 × 1920
  await page.click("[data-tool=crayon]");
  await page.getByTestId("crayon").waitFor();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await drawOnPreview(page, [0.2, 0.3], [0.8, 0.35]);
  await page.waitForFunction(() => window.__storyApp?.slides[1].strokes === 1);
  rep = await report(page);
  const first = rep.slides[1].strokeList[0];
  check(
    first.tool === "stylo" && Math.abs(first.points[0] - 216) < 12 && Math.abs(first.points[1] - 576) < 12 && first.points.length >= 8,
    `Crayon : trait au stylo dans le repère 1080 × 1920 (départ ${first.points[0]}, ${first.points[1]} ; attendu ≈ 216, 576)`,
  );
  check((await page.evaluate(() => window.scrollY)) === scrollBefore, "Crayon : la page ne défile pas pendant le tracé");
  check((await page.getByTestId("dessin").evaluate((el) => getComputedStyle(el).touchAction)) === "none", "Crayon : touch-action none sur le calque de dessin");
  await page.click("[data-pen-tool=surligneur]");
  await page.click("[data-pen-color='#FFD84D']");
  await page.click("[data-pen-size='2']");
  await drawOnPreview(page, [0.1, 0.45], [0.9, 0.45]);
  await page.waitForFunction(() => window.__storyApp?.slides[1].strokes === 2);
  await page.click("[data-pen-tool=ovale]");
  await page.click("[data-pen-color=accent]");
  await drawOnPreview(page, [0.15, 0.55], [0.7, 0.62], 6);
  await page.waitForFunction(() => window.__storyApp?.slides[1].strokes === 3);
  rep = await report(page);
  const tools = rep.slides[1].strokeList.map((s) => s.tool);
  const oval = rep.slides[1].strokeList[2];
  check(JSON.stringify(tools) === '["stylo","surligneur","ovale"]' && oval.points.length === 4, `Crayon : stylo, surligneur et ovale (boîte à 2 points : ${oval.points.join(", ")})`);
  check(rep.slides[2].strokes === 0, "Crayon : la story suite n’hérite pas des dessins");
  await sleep(400);
  await shot(page, "crayon-mobile");
  await touchTargets(page, "Crayon");
  await page.click("[data-action=annuler]");
  await page.waitForFunction(() => window.__storyApp?.slides[1].strokes === 2);
  check(true, "Crayon : Annuler retire le dernier trait (un trait = une étape)");
  await page.click("[data-action=effacer-trait]");
  await page.waitForFunction(() => window.__storyApp?.slides[1].strokes === 1);
  check(true, "Crayon : « Effacer le dernier trait »");
  await page.click("[data-action=effacer-tout]");
  await page.waitForFunction(() => window.__storyApp?.slides[1].strokes === 0);
  await page.click("[data-action=annuler]");
  await page.waitForFunction(() => window.__storyApp?.slides[1].strokes === 1);
  check(true, "Crayon : « Tout effacer », puis Annuler le fait revenir");
  // Trait à 150 % : coordonnées toujours justes
  await page.click("[data-action=crayon-termine]");
  await page.click("[data-action=zoom-plus]");
  await page.click("[data-action=zoom-plus]");
  await page.click("[data-tool=crayon]");
  await page.click("[data-pen-tool=stylo]");
  const frame = await page.getByTestId("apercu-cadre").boundingBox();
  const dessin = await page.getByTestId("dessin").boundingBox();
  const cx = frame.x + frame.width / 2;
  const cy = frame.y + frame.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 30, cy + 10, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction(() => window.__storyApp?.slides[1].strokes === 2);
  rep = await report(page);
  const zoomed = rep.slides[1].strokeList[1].points;
  const expected = [((cx - dessin.x) / dessin.width) * W, ((cy - dessin.y) / dessin.height) * H];
  check(
    Math.abs(zoomed[0] - expected[0]) < 8 && Math.abs(zoomed[1] - expected[1]) < 8,
    `Crayon à 150 % : coordonnées converties (${zoomed[0]}, ${zoomed[1]} ; attendu ≈ ${expected.map(Math.round).join(", ")})`,
  );
  await page.click("[data-action=crayon-termine]");
  await page.click("[data-testid=zoom]");

  // Texte : astérisques → accent, limite de 3, saisie regroupée
  await page.click("[data-tool=texte]");
  const p2 = page.locator("[data-panel=texte] [data-paragraph='2']");
  await p2.waitFor();
  check((await p2.inputValue()) === "Ça te fait *gagner quelques minutes.* Pas plus.", "Texte : les accents s’affichent entre astérisques");
  await p2.fill("Ça te fait *gagner du temps.* Vraiment.");
  await page.waitForFunction(() => window.__storyApp?.slides[1].blocks.some((b) => b.accentsFound.includes("gagner du temps.")));
  rep = await report(page);
  check(rep.slides[2].blocks.some((b) => b.opacity < 1 && b.text === "Ça te fait gagner du temps. Vraiment."), "Texte : la story 3 reprend le paragraphe modifié (grisé)");
  await shot(page, "texte-mobile");
  const p1 = page.locator("[data-panel=texte] [data-paragraph='1']");
  const p1Before = await p1.inputValue();
  await p1.fill("*Toi* *aussi* tu demandes à l'IA de t'écrire ta légende Instagram ?");
  await page.getByText("mots mis en valeur au maximum par story").waitFor();
  rep = await report(page);
  check(rep.slides[1].blocks.filter((b) => b.opacity === 1).flatMap((b) => b.accents).length === 3, "Texte : au-delà de 3 accents par story, le 4e est écarté et signalé");
  await page.click("[data-action=annuler]");
  await page.waitForFunction((t) => document.querySelector("[data-paragraph='1']")?.value === t, p1Before);
  check((await p2.inputValue()) === "Ça te fait *gagner du temps.* Vraiment.", "Annuler : le paragraphe 1 revient, le paragraphe 2 garde sa modification");
  const p3 = page.locator("[data-panel=texte] [data-paragraph='3']");
  const p3Before = await p3.inputValue();
  await p3.click();
  await p3.press("Control+End");
  await page.keyboard.type(" Oui.", { delay: 60 });
  await page.waitForFunction(() => window.__storyApp?.slides[1].blocks.some((b) => b.text.endsWith("Oui.")));
  await page.click("[data-action=annuler]");
  await page.waitForFunction((t) => document.querySelector("[data-paragraph='3']")?.value === t, p3Before, { timeout: 5000 }).then(
    () => check(true, "Annuler : une frappe de 5 caractères s’annule en une seule étape"),
    async () => check(false, "Annuler : une frappe de 5 caractères s’annule en une seule étape", await p3.inputValue()),
  );
  await page.click("[data-tool=texte]");

  // Refaire cette story (story 2) : seule la story 2 change, style, photos et dessins gardés ; annuler
  rep = await report(page);
  const beforeRewrite = storyTexts(rep);
  const rewritesBefore = sent.rewrites.length;
  await page.click("[data-tool=refaire]");
  const refaire = page.getByTestId("refaire");
  await refaire.waitFor();
  await shot(page, "refaire-mobile");
  await refaire.getByRole("button", { name: "Plus court" }).click();
  await page.route("**/api/generations/story", async (route) => {
    await sleep(1500);
    await route.continue();
  });
  await refaire.getByRole("button", { name: "Refaire la story 2" }).click();
  await page.getByTestId("reecriture").waitFor();
  await shot(page, "refaire-en-cours-mobile");
  await page.getByTestId("reecriture").waitFor({ state: "detached", timeout: 30_000 });
  await page.unroute("**/api/generations/story");
  await waitReady(page);
  rep = await report(page);
  const afterRewrite = storyTexts(rep);
  const rewriteRequest = sent.rewrites[rewritesBefore];
  check(
    rewriteRequest?.storyIndex === 1 && rewriteRequest?.instruction === "plus court" && rewriteRequest?.plan?.stories?.length === 5,
    "Refaire cette story : storyIndex 1, consigne « plus court », plan envoyé",
  );
  check(
    afterRewrite[1] !== beforeRewrite[1] && [0, 2, 3, 4].every((i) => afterRewrite[i] === beforeRewrite[i]),
    "Refaire cette story : seule la story 2 change (les 4 autres identiques)",
    afterRewrite.join(" ¶ "),
  );
  check(rep.styleId === "geant" && rep.slides[1].strokes === 2 && rep.options.decoration === "etoiles", "Refaire cette story : style, options et dessins gardés");
  await page.click("[data-action=annuler]");
  await page.waitForFunction((t) => window.__storyApp?.slides[1].blocks.filter((b) => b.opacity === 1).map((b) => b.text).join(" | ") === t, beforeRewrite[1], { timeout: 8000 }).then(
    () => check(true, "Refaire cette story puis Annuler : la version d’avant revient"),
    () => check(false, "Refaire cette story puis Annuler : la version d’avant revient"),
  );

  // Refaire toute la séquence, coupée pendant que la page est en arrière-plan → relancée une fois au retour
  const generationsBefore = sent.generations.length;
  let cut = false;
  await page.route("**/api/generations", async (route) => {
    if (!cut) {
      cut = true;
      await setVisibility(page, "hidden");
      await route.abort("internetdisconnected");
    } else await route.continue();
  });
  await page.click("[data-tool=refaire]");
  await page.getByTestId("refaire").getByRole("button", { name: "Refaire les 5 stories" }).click();
  await page.waitForSelector("[data-screen=generation]");
  await sleep(800);
  check(sent.generations.length === generationsBefore + 1, "Arrière-plan : la demande coupée n’est pas relancée tant que la page est cachée");
  await setVisibility(page, "visible");
  await page.getByTestId("generation-notice").waitFor({ timeout: 5000 }).then(
    () => check(true, "Arrière-plan : au retour, message « on la relance »"),
    () => check(false, "Arrière-plan : au retour, message « on la relance »"),
  );
  await page.waitForSelector("[data-screen=editor]", { timeout: 30_000 });
  await page.unroute("**/api/generations");
  await waitReady(page);
  check(sent.generations.length === generationsBefore + 2, `Arrière-plan : relancée UNE fois (${sent.generations.length - generationsBefore} envois)`);
  const redoRequest = sent.generations.at(-1);
  check(redoRequest?.avoid?.length === 2 && redoRequest.avoid[0] === "idee-recue", "Refaire la séquence : avoid = [ancienne structure, ancienne accroche]");
  rep = await report(page);
  check(rep.styleId === "geant" && rep.slides.every((s) => s.strokes === 0), "Refaire la séquence : style gardé, dessins retirés");
  await page.click("[data-action=annuler]");
  await page.waitForFunction(() => window.__storyApp?.slides[1].strokes === 2, null, { timeout: 8000 }).then(
    () => check(true, "Refaire la séquence puis Annuler : la version d’avant revient (dessins compris)"),
    () => check(false, "Refaire la séquence puis Annuler : la version d’avant revient (dessins compris)"),
  );

  // Cadrage de la photo 3 (story 4)
  await page.click("[data-thumb='4']");
  const before4 = await canvasHash(page, "[data-testid=apercu] canvas");
  await page.click("[data-tool=photo]");
  await page.getByTestId("cadrage").waitFor();
  await page.locator("#cadrage-horizontal").fill("0.2");
  await page.locator("#cadrage-vertical").fill("0.3");
  await page.locator("#cadrage-zoom").fill("1.6");
  await page.waitForFunction(() => window.__storyApp?.slides[3].crop?.zoom === 1.6 && window.__storyApp.slides[4].crop?.focalX === 0.2);
  await sleep(400);
  rep = await report(page);
  check(rep.slides[3].crop.focalY === 0.3 && rep.slides[4].crop.zoom === 1.6, "Cadrage : point focal et zoom appliqués aux stories 4 et 5");
  check((await canvasHash(page, "[data-testid=apercu] canvas")) !== before4, "Cadrage : l’aperçu change en direct");
  await page.evaluate(() => document.querySelector("[data-panel=photo] .overflow-y-auto")?.scrollTo(0, 0));
  await shot(page, "photo-mobile");
  await page.click("[data-tool=photo]");

  // Texte trop long : problème bloquant, l’export est refusé avec une explication, puis on annule
  const story4Before = textOfStory(await report(page), 3);
  await page.click("[data-tool=texte]");
  const long = "Une phrase volontairement beaucoup trop longue pour tenir dans la story, répétée pour remplir toute la place disponible et plus encore. ".repeat(3).slice(0, 300);
  for (let i = 1; i <= 3; i++) await page.locator(`[data-panel=texte] [data-paragraph='${i}']`).fill(`${long} (${i})`);
  await page.getByRole("button", { name: "Ajouter un paragraphe" }).click();
  await page.locator("[data-panel=texte] [data-paragraph='4']").fill(`${long} (4)`);
  await page.waitForFunction(() => window.__storyApp?.problems.length > 0, null, { timeout: 10_000 });
  await page.click("[data-tool=texte]");
  await page.click("[data-action=exporter]");
  await page.getByTestId("remarques").waitFor();
  check(await page.getByTestId("remarques").getByText("À corriger avant l’export").isVisible(), "Texte trop long : l’export est bloqué et la feuille Remarques explique pourquoi");
  await shot(page, "export-bloque-mobile");
  await page.getByTestId("remarques").getByRole("button", { name: "Fermer" }).click();
  for (let i = 0; i < 4; i++) await page.click("[data-action=annuler]");
  await page.waitForFunction(() => window.__storyApp?.problems.length === 0);
  check(JSON.stringify(textOfStory(await report(page), 3)) === JSON.stringify(story4Before), "Annuler ×4 : la story 4 retrouve son texte, plus de problème bloquant");

  // Remarques (contraste, détourage, contrôles)
  if (await page.locator("[data-action=remarques]").count()) {
    await page.click("[data-action=remarques]");
    await page.getByTestId("remarques").waitFor();
    await shot(page, "remarques-mobile");
    await page.getByTestId("remarques").getByRole("button", { name: "Fermer" }).click();
  }

  // Export, puis mémoire de ta voix
  check((await page.evaluate(() => localStorage.getItem("story.voix.v1"))) === null, "Voix : rien de mémorisé avant le premier export");
  await verifyExport(page, "Export iPhone", "mobile");
  await shot(page, "export-mobile");
  await page.getByTestId("export").getByRole("button", { name: "Fermer" }).click();
  const voice = await page.evaluate(() => JSON.parse(localStorage.getItem("story.voix.v1") ?? "[]"));
  check(voice.length === 1 && voice[0].split("\n\n").length === 5, "Voix : la séquence exportée est gardée (5 stories séparées par une ligne vide)");
  await page.click("[data-thumb='1']");
  const rewritesAfterExport = sent.rewrites.length;
  await page.click("[data-tool=refaire]");
  await page.getByTestId("refaire").getByRole("button", { name: "Refaire la story 1" }).click();
  for (let i = 0; i < 100 && sent.rewrites.length <= rewritesAfterExport; i++) await sleep(100);
  await page.getByTestId("reecriture").waitFor({ state: "detached", timeout: 30_000 });
  await waitReady(page);
  const voiceRequest = sent.rewrites[rewritesAfterExport];
  check(
    JSON.stringify(voiceRequest?.context?.voiceExamples) === JSON.stringify(voice),
    "Voix : envoyée dans context.voiceExamples après l’export (requête interceptée)",
    JSON.stringify(voiceRequest?.context?.voiceExamples)?.slice(0, 200),
  );
  await page.click("[data-action=annuler]");
  check(!bodies.some((b) => b.includes("data:image")), "Photo de profil : jamais envoyée à l’API");

  // Rechargement : brouillon complet (style, options, dessins, photos, cadrage, texte)
  rep = await report(page);
  const beforeReload = { photos: rep.photos, crop: rep.slides[3].crop, options: rep.options, strokes: rep.slides.map((s) => s.strokes), texts: storyTexts(rep) };
  await sleep(900); // enregistrement différé
  await page.reload();
  await page.waitForSelector("[data-screen=editor]", { timeout: 30_000 });
  await waitReady(page, "!window.__storyApp.cutouts.computing", 90_000);
  await sleep(1000);
  rep = await report(page);
  check(rep.styleId === "geant", "Rechargement : le style revient (Géant)");
  check(JSON.stringify(rep.options) === JSON.stringify(beforeReload.options), `Rechargement : options du panneau Style (${JSON.stringify(rep.options)})`);
  check(JSON.stringify(rep.slides.map((s) => s.strokes)) === JSON.stringify(beforeReload.strokes), `Rechargement : dessins (${rep.slides.map((s) => s.strokes).join(", ")})`);
  check(JSON.stringify(storyTexts(rep)) === JSON.stringify(beforeReload.texts), "Rechargement : le texte modifié revient");
  check(JSON.stringify(rep.photos) === JSON.stringify(beforeReload.photos), "Rechargement : les 3 photos reviennent (mêmes identifiants)");
  check(JSON.stringify(rep.slides[3].crop) === JSON.stringify(beforeReload.crop), "Rechargement : le cadrage revient");
  check((await canvasStats(page, "[data-thumb] canvas")).every((t) => t.std > 8), "Rechargement : miniatures redessinées avec les photos");
  await shot(page, "rechargement-mobile");

  // Retour vers Créer : carte profil, mémoire de voix dans Mon contexte, puis Nouvelle séquence
  await page.getByRole("button", { name: "Créer" }).click();
  await page.waitForSelector("[data-screen=create]");
  check(await page.getByText("Ta séquence en cours").isVisible(), "Retour à Créer : la séquence en cours est proposée");
  check((await order()).length === 3, "Retour à Créer : les 3 photos sont là");
  await page.click("[data-action=profil]");
  await page.getByTestId("context-sheet").waitFor();
  check(
    (await page.getByTestId("voix").textContent()).includes("1 séquence exportée sert d’exemple de ta voix"),
    "Mon contexte : « 1 séquence exportée sert d’exemple de ta voix »",
  );
  await page.getByTestId("voix").getByRole("button", { name: "Effacer" }).click();
  check((await page.evaluate(() => localStorage.getItem("story.voix.v1"))) === null, "Mon contexte : Effacer vide la mémoire de voix");
  await page.getByTestId("context-sheet").getByRole("button", { name: "Fermer" }).click();
  await page.getByRole("button", { name: "Nouvelle séquence" }).click();
  await page.getByRole("button", { name: "Tout effacer" }).click();
  await page.waitForFunction(() => document.querySelector("#idee")?.value === "" && document.querySelectorAll("[data-photo-slot] img").length === 0);
  check((await page.evaluate(() => localStorage.getItem("story.brouillon.v1"))) === null, "Nouvelle séquence : brouillon effacé");
  await page.reload();
  await page.waitForSelector("[data-screen=create]");
  check(
    (await page.getByText("Ta séquence en cours").count()) === 0 && (await page.locator("[data-photo-slot] img").count()) === 0,
    "Nouvelle séquence : après rechargement, page blanche (ni texte ni photos)",
  );
  check(
    (await page.evaluate(() => JSON.parse(localStorage.getItem("story.contexte.v1") ?? "{}").cta)) === "Réponds AUDIT en message privé" &&
      (await page.getByTestId("profil").locator("img").count()) === 1,
    "Nouvelle séquence : le contexte et la photo de profil sont conservés",
  );
  // Attendus : le 400 « texte_trop_court » et la coupure réseau simulée, que Chromium signale sur la console.
  const tolerated = /Failed to load resource: (the server responded with a status of 400|net::ERR_INTERNET_DISCONNECTED)/;
  const unexpected = errors.filter((e) => !tolerated.test(e));
  check(unexpected.length === 0 && errors.length <= 2, `iPhone : aucune erreur JavaScript (hors 400 et coupure simulés)`, errors.join(" | "));
  check(foreign.length === 0, "iPhone : aucune requête hors de nos routes et des fichiers du site", foreign.join(" | "));
  await page.context().close();

  // ══ 2. Ordinateur court (1366 × 700) ════════════════════════════════════════════════════
  console.log(`\nOrdinateur (1366 × 700)`);
  const desk = await openPage(browser, DESKTOP, server.url);
  await desk.page.goto(server.url);
  await desk.page.waitForSelector("[data-screen=create]");
  await desk.page.evaluate(() => document.fonts.ready);
  await desk.page.setInputFiles("[data-testid=photo-input-multi]", SAMPLES.slice(0, 2));
  await desk.page.waitForFunction(() => document.querySelectorAll("[data-photo-slot] img").length === 2, null, { timeout: 30_000 });
  await shot(desk.page, "creer-ordinateur");
  await noHorizontalScroll(desk.page, "Ordinateur, Créer");
  const generate = await desk.page.locator("[data-action=generer]").boundingBox();
  const textarea = await desk.page.locator("#idee").boundingBox();
  check(generate.y > textarea.y + textarea.height, "Ordinateur : « Générer » sous le champ, sans le recouvrir");
  await desk.page.click("[data-action=generer]");
  await desk.page.waitForSelector("[data-screen=editor]", { timeout: 30_000 });
  await waitReady(desk.page);
  await sleep(1200);
  const deskRep = await report(desk.page);
  check(
    JSON.stringify(deskRep.slides.map((s) => deskRep.photos.indexOf(s.assetId))) === "[0,1,1,0,0]",
    "Ordinateur, 2 photos : photo 1 pour les stories 1, 4, 5 ; photo 2 pour 2 et 3",
  );
  const deskThumbs = await canvasStats(desk.page, "[data-thumb] canvas");
  check(deskThumbs.length === 5 && deskThumbs.every((t) => t.std > 8), "Ordinateur : 5 miniatures dessinées");
  await shot(desk.page, "editeur-ordinateur");
  await chooseStyle(desk.page, "geant");
  await sleep(800);
  await shot(desk.page, "style-ordinateur");
  await noHorizontalScroll(desk.page, "Ordinateur, éditeur");
  await verifyExport(desk.page, "Export ordinateur", "ordinateur");
  await shot(desk.page, "export-ordinateur");
  check(desk.errors.length === 0, "Ordinateur : aucune erreur JavaScript", desk.errors.join(" | "));
  check(desk.foreign.length === 0, "Ordinateur : aucune requête externe", desk.foreign.join(" | "));
  await desk.context.close();
  server.stop();

  // ══ 3. Sans clé ni simulation : cle_absente puis mode démo ══════════════════════════════
  console.log(`\nSans clé API (ni STORY_AI_MOCK)`);
  server = await startServer({ STORY_AI_MOCK: "", ANTHROPIC_API_KEY: "" });
  const nokey = await openPage(browser, IPHONE, server.url);
  await nokey.page.goto(server.url);
  await nokey.page.waitForSelector("[data-screen=create]");
  await nokey.page.setInputFiles("[data-testid=photo-input-multi]", SAMPLES.slice(0, 2));
  await nokey.page.waitForFunction(() => document.querySelectorAll("[data-photo-slot] img").length === 2, null, { timeout: 30_000 });
  const apiAnswer = await nokey.page.request.post(`${server.url}/api/generations`, { data: { idea: "" } });
  const apiBody = await apiAnswer.json();
  check(apiAnswer.status() === 503 && apiBody.error?.code === "cle_absente", "Sans clé : l’API répond 503 cle_absente");
  await nokey.page.click("[data-action=generer]");
  await nokey.page.waitForSelector("[data-error-code=cle_absente]", { timeout: 20_000 });
  check((await nokey.page.getByTestId("generation-error").textContent()) === apiBody.error.message, "Sans clé : le message de l’API est affiché tel quel");
  await shot(nokey.page, "cle-absente-mobile");
  await nokey.page.getByRole("button", { name: "Essayer avec l’exemple" }).click();
  await nokey.page.waitForSelector("[data-screen=editor]", { timeout: 30_000 });
  await waitReady(nokey.page);
  await sleep(1000);
  const demo = await report(nokey.page);
  check(
    demo.slides.length === 5 && demo.photos.every(Boolean) && textOfStory(demo, 0)[0].startsWith("La plupart des PME"),
    "Mode démo : la séquence d’exemple s’ouvre, la 3e photo de test complète les 2 photos",
  );
  check((await canvasStats(nokey.page, "[data-thumb] canvas")).every((t) => t.std > 8), "Mode démo : miniatures dessinées");
  await shot(nokey.page, "demo-mobile");
  check(nokey.errors.filter((e) => !e.includes("503")).length === 0, "Sans clé : aucune erreur JavaScript", nokey.errors.join(" | "));
  check(nokey.foreign.length === 0, "Sans clé : aucune requête externe", nokey.foreign.join(" | "));
  await nokey.context.close();
} finally {
  await browser.close();
  server.stop();
}

if (failures.length) {
  console.error(`\n${failures.length} vérification(s) en échec :\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`\nToutes les vérifications passent. Captures : ${OUT}`);

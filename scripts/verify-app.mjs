// Vérifie la page « / » (src/features/creator) dans un vrai Chromium, avec l’IA simulée (STORY_AI_MOCK=1) :
//  iPhone (390 × 844, DPR 3, tactile) : Créer, « Pas d’idée ? », Mon contexte, 3 photos, Générer (écran d’attente),
//  éditeur (5 miniatures et aperçu dessinés, accents de la story 2), glisser, 4 styles, Texte avec *astérisques*,
//  limite de 3 accents, annuler / rétablir (saisie regroupée), Refaire (avoid) puis annuler, cadrage, export
//  (5 PNG 1080 × 1920 + ZIP ordonné), rechargement (brouillon, photos, style, texte, cadrage), Nouvelle séquence ;
//  sans clé : message « cle_absente » puis « Essayer avec l’exemple » ; ordinateur (1440 × 900) : flux court.
//  Partout : aucune erreur JavaScript, aucun défilement horizontal, aucune requête hors de nos routes et fichiers.
// Captures dans captures/app/.
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
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

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

/** Page surveillée : erreurs JavaScript, requêtes hors de nos routes et des fichiers du site. */
async function openPage(browser, options, base) {
  const context = await browser.newContext({ ...options, acceptDownloads: true, locale: "fr-FR" });
  const page = await context.newPage();
  const errors = [];
  const foreign = [];
  const origin = new URL(base).origin;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(`console : ${m.text()}`));
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.protocol === "data:" || url.protocol === "blob:") return;
    const allowed =
      url.origin === origin &&
      (/^\/(api\/generations|api\/ideas)$/.test(url.pathname) ||
        /^\/(_next|fonts|samples)\//.test(url.pathname) ||
        ["/", "/favicon.ico"].includes(url.pathname));
    if (!allowed) foreign.push(`${req.method()} ${req.url()}`);
  });
  return { context, page, errors, foreign };
}

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
      if (!r.width || !r.height || el.closest("[aria-hidden=true]")) continue;
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

async function download(page, selector, target) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click(selector)]);
  await dl.saveAs(target);
  return { name: dl.suggestedFilename(), buffer: readFileSync(target) };
}

async function shot(page, name, fullPage = false) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage });
}

async function verifyExport(page, label, prefix) {
  await page.click("[data-action=exporter]");
  await page.getByRole("heading", { name: "Tes 5 stories sont prêtes" }).waitFor({ timeout: 60_000 });
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

rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: chromiumPath() });
let server = await startServer({ STORY_AI_MOCK: "1" });
try {
  // ══ 1. iPhone, IA simulée ═══════════════════════════════════════════════════════════════
  console.log(`\niPhone (390 × 844, DPR 3) · ${server.url}`);
  const { page, errors, foreign } = await openPage(browser, IPHONE, server.url);
  const sent = { generations: [], ideas: [] };
  page.on("request", (req) => {
    const m = /\/api\/(generations|ideas)$/.exec(new URL(req.url()).pathname);
    if (m && req.method() === "POST") sent[m[1]].push(JSON.parse(req.postData() ?? "{}"));
  });

  await page.goto(server.url);
  await page.waitForSelector("[data-screen=create]", { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  check(await page.getByRole("button", { name: "Générer" }).isDisabled(), "Créer : « Générer » inactif tant que l’idée est vide");
  await shot(page, "creer-mobile");
  await noHorizontalScroll(page, "Créer");
  await touchTargets(page, "Créer");

  // Mon contexte
  await page.getByRole("button", { name: "Mon contexte" }).click();
  const sheet = page.getByTestId("context-sheet");
  await sheet.waitFor();
  check((await sheet.getByLabel("Ton activité").inputValue()).includes("Partenaire IA des PME"), "Mon contexte : pré-rempli avec le contexte par défaut");
  check(await sheet.getByText("Aucune preuve = aucun chiffre ni témoignage inventé.").isVisible(), "Mon contexte : mention sur les preuves");
  await sheet.getByLabel("Ton appel à l’action").fill("Réponds AUDIT en message privé");
  await shot(page, "contexte-mobile");
  await sheet.getByRole("button", { name: "Enregistrer" }).click();
  await sheet.waitFor({ state: "detached" });
  const savedContext = await page.evaluate(() => JSON.parse(localStorage.getItem("story.contexte.v1") ?? "{}"));
  check(savedContext.cta === "Réponds AUDIT en message privé", "Mon contexte : enregistré dans localStorage");

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
  check((await page.locator("[data-structure=objection]").getAttribute("aria-checked")) === "true", "Idée choisie : la structure « Objection » est sélectionnée");

  // 3 photos d’un coup
  await page.setInputFiles("[data-testid=photo-input-multi]", SAMPLES);
  await page.waitForFunction(() => document.querySelectorAll("[data-photo-slot] img").length === 3 && !document.querySelector("[data-testid=import-progress]"), null, {
    timeout: 30_000,
  });
  check(true, "Photos : 3 photos importées dans l’ordre (Ajouter 3 photos)");
  await page.locator("#photos-titre").scrollIntoViewIfNeeded();
  await shot(page, "photos-mobile");
  // Échanger puis rééchanger (menu d’une photo)
  await page.click("[data-photo-slot='1']");
  await page.getByTestId("photo-menu").getByRole("button", { name: /Échanger avec la photo 2/ }).click();
  const slotsAfterSwap = await page.evaluate(() => [...document.querySelectorAll("[data-photo-slot] img")].map((i) => i.src));
  await page.click("[data-photo-slot='1']");
  await page.getByTestId("photo-menu").getByRole("button", { name: /Échanger avec la photo 2/ }).click();
  const slotsBack = await page.evaluate(() => [...document.querySelectorAll("[data-photo-slot] img")].map((i) => i.src));
  check(slotsAfterSwap[0] === slotsBack[1] && slotsAfterSwap[1] === slotsBack[0], "Photos : échanger la photo 1 et la photo 2");
  await noHorizontalScroll(page, "Créer avec photos");

  // Générer : réponse retardée pour voir l’écran d’attente
  await page.route("**/api/generations", async (route) => {
    await sleep(3500);
    await route.continue();
  });
  await page.getByRole("button", { name: "Générer" }).click();
  await page.waitForSelector("[data-screen=generation]");
  await sleep(2800);
  check(await page.getByText("Écriture", { exact: true }).isVisible(), "Génération : étapes affichées (Lecture de ton idée, Écriture…)");
  check((await page.locator("[aria-live=polite]").filter({ hasText: "Étape" }).count()) > 0, "Génération : étape annoncée (aria-live)");
  await shot(page, "generation-mobile");
  await page.waitForSelector("[data-screen=editor]", { timeout: 30_000 });
  await page.unroute("**/api/generations");
  await waitReady(page);
  await sleep(1200); // dessin des miniatures et mesure du contraste
  const firstRequest = sent.generations.at(-1);
  check(
    firstRequest?.structureId === "objection" && firstRequest?.context?.cta === "Réponds AUDIT en message privé" && firstRequest?.mode === "idee",
    "Générer : idée, structure choisie et contexte envoyés",
    JSON.stringify(firstRequest),
  );

  // Éditeur
  let rep = await report(page);
  check(rep.slides.length === 5, "Éditeur : 5 stories composées");
  check(rep.photos.every(Boolean), "Éditeur : les 3 photos sont utilisées");
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
  await shot(page, "editeur-mobile");
  await noHorizontalScroll(page, "Éditeur");
  await touchTargets(page, "Éditeur");

  // Glisser vers la gauche → story 2
  const box = await page.getByTestId("apercu").boundingBox();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(() => window.__storyApp?.storyIndex === 1);
  check((await page.getByTestId("numero").textContent()).includes("2 / 5"), "Éditeur : glisser vers la gauche passe à la story 2");

  // Styles
  await page.click("[data-tool=style]");
  await page.waitForSelector("[data-panel=style] [data-style=bandeau] canvas");
  const markers = { bandeau: "bandeau", entoure: "cercle", trait: "souligne", serif: "couleur" };
  for (const [styleId, marker] of Object.entries(markers)) {
    await page.click(`[data-style=${styleId}]`);
    await waitReady(page, `window.__storyApp.styleId === "${styleId}"`);
    rep = await report(page);
    const kinds = new Set(rep.slides[1].blocks.filter((b) => b.opacity === 1).map((b) => b.marker));
    check(
      kinds.size === 1 && kinds.has(marker) && rep.problems.length === 0,
      `Style « ${styleId} » : appliqué aux 5 stories (marquage ${marker}), aucun problème bloquant`,
      `${[...kinds]} ${rep.problems.join(" ; ")}`,
    );
    if (styleId === "bandeau") await shot(page, "style-bandeau-mobile");
  }
  await page.click("[data-style=entoure]");
  await waitReady(page, `window.__storyApp.styleId === "entoure"`);
  await sleep(800);
  check((await page.locator("[data-style=entoure]").getAttribute("aria-checked")) === "true", "Style : le style actif est signalé (aria-checked)");
  await shot(page, "style-mobile");

  // Texte : astérisques → accent
  await page.click("[data-tool=texte]");
  const p2 = page.locator("[data-panel=texte] [data-paragraph='2']");
  await p2.waitFor();
  check((await p2.inputValue()) === "Ça te fait *gagner quelques minutes.* Pas plus.", "Texte : les accents s’affichent entre astérisques");
  await p2.fill("Ça te fait *gagner du temps.* Vraiment.");
  await page.waitForFunction(() => window.__storyApp?.slides[1].blocks.some((b) => b.accentsFound.includes("gagner du temps.")));
  rep = await report(page);
  const edited = rep.slides[1].blocks.find((b) => b.text === "Ça te fait gagner du temps. Vraiment.");
  check(!!edited && edited.accents.join() === "gagner du temps." && edited.marker === "cercle", "Texte : astérisques retirés, accent « gagner du temps. » entouré");
  check(rep.slides[2].blocks.some((b) => b.opacity < 1 && b.text === "Ça te fait gagner du temps. Vraiment."), "Texte : la story 3 reprend le paragraphe modifié (grisé)");
  await shot(page, "texte-mobile");

  // Plus de 3 accents : signalé
  const p1 = page.locator("[data-panel=texte] [data-paragraph='1']");
  const p1Before = await p1.inputValue();
  await p1.fill("*Toi* *aussi* tu demandes à l'IA de t'écrire ta légende Instagram ?");
  await page.getByText("mots mis en valeur au maximum par story").waitFor();
  rep = await report(page);
  check(rep.slides[1].blocks.filter((b) => b.opacity === 1).flatMap((b) => b.accents).length === 3, "Texte : au-delà de 3 accents par story, le 4e est écarté et signalé");
  await page.click("[data-action=annuler]");
  await page.waitForFunction((t) => document.querySelector("[data-paragraph='1']")?.value === t, p1Before);
  check(
    (await p2.inputValue()) === "Ça te fait *gagner du temps.* Vraiment.",
    "Annuler : le paragraphe 1 revient à son texte d’avant, le paragraphe 2 garde sa modification",
  );
  await page.click("[data-action=retablir]");
  await page.waitForFunction(() => document.querySelector("[data-paragraph='1']")?.value.startsWith("*Toi*"));
  check(true, "Rétablir : la modification revient");
  await page.click("[data-action=annuler]");
  await page.waitForFunction((t) => document.querySelector("[data-paragraph='1']")?.value === t, p1Before);

  // Saisie au clavier regroupée : une seule étape d’annulation
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

  // Story suite : paragraphes repris en lecture seule
  await page.click("[data-tool=texte]"); // ferme le panneau : les miniatures réapparaissent
  await page.click("[data-thumb='3']");
  await page.click("[data-tool=texte]");
  check(await page.getByText("Repris de la story 2, modifie-les là-bas").isVisible(), "Texte : story 3, paragraphes repris de la story 2 en lecture seule");
  await page.click("[data-tool=texte]");

  // Refaire : avoid = [structure, accroche], puis annuler pour revenir à la version modifiée
  const before = sent.generations.length;
  await page.click("[data-tool=refaire]");
  await page.getByRole("dialog", { name: "Refaire la séquence ?" }).getByRole("button", { name: "Refaire" }).click();
  await page.waitForSelector("[data-screen=editor]", { timeout: 30_000 });
  await waitReady(page);
  const redoRequest = sent.generations[before];
  check(
    redoRequest?.idea === ideaValue &&
      redoRequest?.structureId === "objection" &&
      redoRequest?.avoid?.length === 2 &&
      redoRequest.avoid[0] === "idee-recue" &&
      redoRequest.avoid[1].startsWith("La plupart des PME"),
    "Refaire : même idée, même structure choisie, avoid = [ancienne structure, ancienne accroche]",
    JSON.stringify(redoRequest?.avoid),
  );
  rep = await report(page);
  check(rep.styleId === "entoure" && rep.photos.every(Boolean), "Refaire : style et photos gardés");
  check(textOfStory(rep, 1).includes("Ça te fait gagner quelques minutes. Pas plus."), "Refaire : nouvelle version du texte");
  await page.click("[data-action=annuler]");
  await page
    .waitForFunction(() => window.__storyApp?.slides[1].blocks.some((b) => b.text === "Ça te fait gagner du temps. Vraiment."), null, { timeout: 8000 })
    .then(
      () => check(true, "Refaire puis Annuler : la version d’avant revient"),
      async () => check(false, "Refaire puis Annuler : la version d’avant revient", textOfStory(await report(page), 1).join(" | ")),
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
  await shot(page, "photo-mobile");
  await page.click("[data-tool=photo]");
  await noHorizontalScroll(page, "Éditeur, panneaux");

  // Remarques (contraste, contrôles) : la feuille s’ouvre si le badge existe
  if (await page.locator("[data-action=remarques]").count()) {
    await page.click("[data-action=remarques]");
    await page.getByTestId("remarques").waitFor();
    await shot(page, "remarques-mobile");
    await page.getByTestId("remarques").getByRole("button", { name: "Fermer" }).click();
  }

  // Export
  await verifyExport(page, "Export iPhone", "mobile");
  await shot(page, "export-mobile");
  await page.getByTestId("export").getByRole("button", { name: "Fermer" }).click();

  // Rechargement : le brouillon revient
  rep = await report(page);
  const beforeReload = { photos: rep.photos, crop: rep.slides[3].crop };
  await sleep(900); // enregistrement différé
  await page.reload();
  await page.waitForSelector("[data-screen=editor]", { timeout: 30_000 });
  await waitReady(page);
  await sleep(1000);
  rep = await report(page);
  check(rep.styleId === "entoure", "Rechargement : le style revient");
  check(textOfStory(rep, 1).includes("Ça te fait gagner du temps. Vraiment."), "Rechargement : le texte modifié revient");
  check(JSON.stringify(rep.photos) === JSON.stringify(beforeReload.photos), "Rechargement : les 3 photos reviennent (mêmes identifiants)");
  check(JSON.stringify(rep.slides[3].crop) === JSON.stringify(beforeReload.crop), "Rechargement : le cadrage revient");
  const thumbsAfter = await canvasStats(page, "[data-thumb] canvas");
  check(thumbsAfter.every((t) => t.std > 8), "Rechargement : miniatures redessinées avec les photos");
  await shot(page, "rechargement-mobile");

  // Retour vers Créer sans perdre le brouillon, puis Nouvelle séquence
  await page.getByRole("button", { name: "Créer" }).click();
  await page.waitForSelector("[data-screen=create]");
  check((await page.locator("#idee").inputValue()) === ideaValue, "Retour à Créer : l’idée est gardée");
  check(await page.getByText("Ta séquence en cours").isVisible(), "Retour à Créer : la séquence en cours est proposée");
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
    (await page.evaluate(() => JSON.parse(localStorage.getItem("story.contexte.v1") ?? "{}").cta)) === "Réponds AUDIT en message privé",
    "Nouvelle séquence : le contexte est conservé",
  );
  check(errors.length === 0, `iPhone : aucune erreur JavaScript`, errors.join(" | "));
  check(foreign.length === 0, "iPhone : aucune requête hors de nos 2 routes et des fichiers du site", foreign.join(" | "));
  await page.context().close();

  // ══ 2. Ordinateur (1440 × 900) ══════════════════════════════════════════════════════════
  console.log(`\nOrdinateur (1440 × 900)`);
  const desk = await openPage(browser, DESKTOP, server.url);
  await desk.page.goto(server.url);
  await desk.page.waitForSelector("[data-screen=create]");
  await desk.page.evaluate(() => document.fonts.ready);
  await desk.page.fill("#idee", "Pourquoi relancer un devis trois jours après l’avoir envoyé fait revenir les clients.");
  await desk.page.setInputFiles("[data-testid=photo-input-multi]", SAMPLES);
  await desk.page.waitForFunction(() => document.querySelectorAll("[data-photo-slot] img").length === 3, null, { timeout: 30_000 });
  await shot(desk.page, "creer-ordinateur");
  await noHorizontalScroll(desk.page, "Ordinateur, Créer");
  await desk.page.getByRole("button", { name: "Générer" }).click();
  await desk.page.waitForSelector("[data-screen=editor]", { timeout: 30_000 });
  await waitReady(desk.page);
  await sleep(1200);
  const deskThumbs = await canvasStats(desk.page, "[data-thumb] canvas");
  check(deskThumbs.length === 5 && deskThumbs.every((t) => t.std > 8), "Ordinateur : 5 miniatures dessinées");
  await shot(desk.page, "editeur-ordinateur");
  await desk.page.click("[data-tool=style]");
  await desk.page.click("[data-style=bandeau]");
  await waitReady(desk.page, `window.__storyApp.styleId === "bandeau"`);
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
  await nokey.page.fill("#idee", "Une idée sans clé pour tester le message.");
  const apiAnswer = await nokey.page.request.post(`${server.url}/api/generations`, { data: { idea: "Une idée sans clé." } });
  const apiBody = await apiAnswer.json();
  check(apiAnswer.status() === 503 && apiBody.error?.code === "cle_absente", "Sans clé : l’API répond 503 cle_absente");
  await nokey.page.getByRole("button", { name: "Générer" }).click();
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
    "Mode démo : la séquence d’exemple s’ouvre avec les 3 photos de test",
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

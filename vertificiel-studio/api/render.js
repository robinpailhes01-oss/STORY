// Studio jardin · serveur de rendu photo (fonction Vercel).
// La clé kie.ai reste ici, dans la variable d'environnement KIE_AI_API_KEY : elle n'est jamais envoyée à la tablette.
//
// POST /api/render   { image: "data:image/jpeg;base64,...", items: [{ no, where, spec? }], empty: [zones] }  ->  { taskId }
//                    options: aspect ("3:4", "4:3", ...), lawn: true when the photo shows bare soil and the 3D lawn is pasted on it,
//                    ambiance: "jour" | "soir"
//                    { mode: "free", image, aspect, items, site: "demo" | "custom", refs: [photos of the house] }  (3D view from any angle)  ->  { taskId }
//                    { mode: "night", source: URL of a day render, aspect, leds: ["chaud", ...] }  (same photo at night)  ->  { taskId }
// GET  /api/render?task=ID                                                     ->  { state, url, error }
//
// Variables d'environnement :
//   KIE_AI_API_KEY   clé kie.ai (obligatoire)
//   STUDIO_CODE      code d'accès facultatif, attendu dans l'en-tête x-studio-code

import { readFile } from "node:fs/promises";

const API = "https://api.kie.ai";
const UPLOAD = "https://kieai.redpandaai.co/api/file-base64-upload";
const MODEL = "nano-banana-pro";
const MAX_IMAGES = 8;

// what each catalogue element must become in the photo
const CATALOGUE = {
  "01": "raised planting beds edged with vertical natural timber sleepers, planted with Mediterranean shrubs, ornamental grasses and a few stones",
  "02": "a low flowering hedge of pink and white oleanders",
  "04": "a rectangular swimming pool with clear turquoise water and a surround of large light-beige concrete slabs separated by thin strips of synthetic grass",
  "05": "a freestanding wooden pergola with a slatted timber roof sheltering an outdoor kitchen counter with a wood-slat front, a light stone worktop and bar stools",
  "07": "a tall date palm with a textured trunk and a full crown of long green fronds, in a round bed of white slabs in a lattice pattern with grass joints",
  "10": "a mature olive tree with a gnarled trunk and silver-green foliage, on a circular deck of warm brown wooden boards edged with a ring of white pebbles",
  "12": "a landscaped putting green of shorter, lighter, smoother turf with a hole and a small flag",
  "13": "a curving path of white rectangular stepping stones set into the lawn",
  "14": "a mineral path of large light-grey stone slabs laid across a bed of white gravel, with clumps of soft ornamental grasses along both sides",
  "15": "a petanque court of compacted ochre-red sand framed by a light timber border",
  "17": "geometric paving of white square slabs laid on the diagonal with green grass joints, inside a slim border",
  "23": "a freestanding outdoor shower made of vertical natural wood slats on a small wooden deck",
};

// made-to-measure paving of the "Dalles & gazon" catalogue (no. DG)
const DALLES = {
  "bergstein-ivory": "light ivory stone-look porcelain (Bergstein Ivory)", "bergstein-beige": "warm beige stone-look porcelain (Bergstein Beige)",
  "level-blanco": "off-white smooth porcelain (Level Blanco)", "level-gris": "mid-grey smooth porcelain (Level Gris)",
  "khala-cream": "cream sandstone-look porcelain (Khala Cream)", "khala-taupe": "taupe sandstone-look porcelain (Khala Taupe)",
  "storm-white": "white marble-look porcelain with fine grey veins (Storm White)", "storm-earth": "earthy brown marble-look porcelain with light veins (Storm Earth)",
  "newclay-white": "white cement-look porcelain (Newclay White)", "newclay-sand": "sand-coloured cement-look porcelain (Newclay Sand)",
  "newclay-cotto": "terracotta cement-look porcelain (Newclay Cotto)", "newclay-shadow": "dark anthracite cement-look porcelain (Newclay Shadow)",
  "raffaello-ivory": "ivory marble-look porcelain with fine golden veins (Raffaello Ivory)", "raffaello-cream": "cream marble-look porcelain with golden veins (Raffaello Cream)",
};
const MOTIF_REF = { diagonale: "dalles/ref-diagonale", droit: "dalles/ref-droits-led", cubes: "dalles/ref-cubes" };
const JOINT_TXT = { gazon: "thin synthetic grass", gris: "thin grey", dore: "thin golden" };
const LED_TXT = { chaud: "warm white", neutre: "neutral white", ambre: "amber" };
function cleanSpec(s) {
  if (!s || typeof s !== "object" || !MOTIF_REF[s.motif] || !DALLES[s.couleur] || !(JOINT_TXT[s.joint]) || !(s.led === "aucune" || LED_TXT[s.led])) return null;
  const n = (v, a, b) => (typeof v === "number" && v >= a && v <= b ? v : null);
  const out = { motif: s.motif, couleur: s.couleur, joint: s.joint, led: s.led, taille: n(s.taille, 0.3, 1.5), bande: n(s.bande, 0.03, 0.4), w: n(s.w, 0.5, 60), d: n(s.d, 0.5, 60) };
  return Object.values(out).every(v => v !== null) ? out : null;
}
function pavingText(s) {
  const c = DALLES[s.couleur], t = Math.round(s.taille * 100), b = Math.round(s.bande * 100), r = v => Math.round(v * 10) / 10;
  let txt = s.motif === "cubes"
    ? `a geometric 3D cube pattern (tumbling blocks) of rhombus-shaped synthetic grass cells, about ${t} cm per side, framed by ${b} cm wide strips of ${c}; the strips meet at six-branch star junctions with ${JOINT_TXT[s.joint]} joints`
    : s.motif === "diagonale"
      ? `a paving of large ${t} x ${t} cm square slabs of ${c} laid on the diagonal (45 degrees), separated by ${b} cm wide strips of synthetic grass, forming a diamond grid, the slabs cut into triangles along the edges`
      : `a paving of large ${t} x ${t} cm square slabs of ${c} laid in a straight grid parallel to the edges, separated by ${b} cm wide strips of synthetic grass`;
  if (s.led !== "aucune") txt += `, with slim ${LED_TXT[s.led]} LED light profiles running along all the edges of every slab`;
  return `${txt}, covering a ${r(s.w)} x ${r(s.d)} m area`;
}

const LIGHT = {
  jour: "Late-afternoon Mediterranean sunlight with long soft shadows. It must look like an authentic photograph taken by a professional photographer with a full-frame camera, not a 3D rendering and not CGI: real materials with their natural texture and slight wear, real Mediterranean plants of the South of France (olive trees, Phoenix palms, lavender, rosemary, oleanders) with natural irregular foliage, premium synthetic grass with subtle natural colour variation and soft blade texture, natural depth of field, gentle lens vignetting, true-to-life colours, no oversaturation, no plastic look. No people, no text, no watermark.",
  soir: "Evening at blue hour: deep blue twilight sky, warm lights glowing inside the house, garden lights and the LED light profiles of the paving switched on and glowing, soft night shadows. It must look like an authentic photograph taken by a professional photographer with a full-frame camera, not a 3D rendering and not CGI: real materials with their natural texture and slight wear, real Mediterranean plants of the South of France (olive trees, Phoenix palms, lavender, rosemary, oleanders) with natural irregular foliage, premium synthetic grass with subtle natural colour variation and soft blade texture, natural depth of field, gentle lens vignetting, true-to-life colours, no oversaturation, no plastic look. No people, no text, no watermark.",
};

// golden hour: the look of the garden ads, lights already on
LIGHT.dore = "Golden hour, just before sunset: a warm low sun, a glowing sky with a few soft clouds, long soft shadows and a gentle warm haze. The garden lights, the LED light profiles of the paving and the pool lights are already switched on and glow softly; if there is a house, warm light shows inside it through the windows. " + LIGHT.jour.slice(LIGHT.jour.indexOf("It must look"));
// optional staging, as for a magazine shoot: furniture and planting are added, the layout is not touched
const STAGING = "Dress the scene tastefully, as for a garden-design magazine shoot, WITHOUT changing the layout: one or two groups of quality outdoor furniture (a lounge set, a dining table with chairs or sun loungers) standing only on paved, decked or terrace areas that already exist in image 1, a few large planters, lush Mediterranean planting (lavender, grasses, agapanthus, olive, oleander) only along the walls, fences and hedges, and a few warm lanterns or string lights. Never put furniture on the lawn. Never add or enlarge a pool, terrace, deck, paving, path, pergola or building, and never hide, move or resize a listed element.";
function buildPlanPrompt(lines, existing, hasHouse, counts, ambiance) {
  const ex = existing.filter(k => EXISTING[k]).map(k => EXISTING[k]), pools = (counts && counts.piscine) || 0;
  return [
    "Image 1 is a 3D mock-up of a garden plot seen exactly from above (top-down plan view). Turn it into a landscape architect's presentation plan: a top-down rendered master plan of this garden, in a refined semi-realistic illustration style (as hand-finished with markers and watercolour over a precise drawing): rich natural textures seen from above, soft drop shadows giving relief, trees and shrubs drawn as detailed canopies seen from above.",
    "This is a measured plan: keep EXACTLY the same top-down orthographic view, the same framing, the same outline of the plot and the same position, shape, proportions and orientation of every element of image 1. Nothing is moved, resized, rotated, added or removed.",
    hasHouse ? "The house keeps exactly its footprint and position: draw it as roofs seen from above (flat roofs or tiles, in neutral tones), with no interior." : "There is no house on this plot: do not add one.",
    ex.length ? "Existing features already on the plot, to keep exactly in place and in shape: " + ex.join("; ") + "." : "",
    `There ${pools === 1 ? "is exactly ONE swimming pool" : pools ? "are exactly " + pools + " swimming pools" : "is NO swimming pool"} on the plan: never add another pool, basin or pond.`,
    `Draw each garden element of the mock-up as its real version seen from above, exactly where it is. There are exactly ${lines.length} of them; do not swap two of them, do not draw one twice and do not move one towards the centre:`,
    ...lines,
    "The rest of the plot is a premium synthetic grass lawn drawn with a soft texture. Along the boundary, draw the hedges and walls that are in image 1. Everything outside the plot outline is left as clean off-white paper: no neighbouring building, no road, no tree and no shadow outside the plot. Paved areas keep exactly the extent and the number of slab rows of image 1: never extend a paving or add a paved strip.",
    ambiance === "dore" || ambiance === "soir" ? "Warm evening rendering: the LED light profiles of the paving and the garden lights glow softly on the plan." : "Clear daylight rendering with soft shadows; no light glow and no coloured outline around the pavings.",
    "No text, no labels, no dimensions, no numbers, no north arrow, no legend, no watermark, no people.",
  ].filter(Boolean).join("\n");
}
function buildPrompt(lines, empty, lawn, ambiance, staging) {
  const keep = empty.length ? `These parts of the image contain no element and must stay plain lawn, exactly as in image 1: ${empty.join(", ")}.` : "";
  const evening = ambiance === "soir" || ambiance === "dore";
  return [
    "Image 1 is a real photograph of a newly built house and its synthetic-grass garden, on which simple 3D mock-up objects have been pasted to show the planned garden layout. Turn image 1 into one single photorealistic photograph in very high detail.",
    "Replace each mock-up object by a real, photorealistic version at EXACTLY the same position, size, orientation and perspective as in image 1:",
    ...lines,
    "Each listed element appears exactly once, only where its mock-up is in image 1, at the same size. " + (staging ? STAGING : "Only these elements exist: do not add any other garden element, tree, path or plant, even if it would look natural.") + " Do not move, enlarge, extend or remove anything, and do not change the layout. Keep exactly the same framing, lens and perspective.",
    keep,
    lawn ? "The green lawn area pasted on the plot is part of the mock-up: turn it into a real, clean, flat premium synthetic grass lawn that follows exactly its outline; the ground outside it stays exactly as in the photograph." : "",
    evening
      ? "Keep the house with every window and door, its terrace, the neighbouring houses and plots, trees, hedges, cars and street exactly in place and in shape; only the time of day changes. The rest of the lawn stays a clean, flat premium synthetic grass lawn."
      : "Keep completely unchanged, pixel for pixel: the house with every window and door, its terrace, the sky and clouds, the neighbouring houses and plots (including building sites, pallets, concrete strips, bare soil and materials outside the lawn), trees, hedges, cars, street, and any shadow already on the ground. The rest of the lawn stays a clean, flat premium synthetic grass lawn.",
    LIGHT[ambiance] || LIGHT.jour,
  ].filter(Boolean).join("\n");
}

// any angle of the 3D: the mock-up gives the viewpoint and the layout, the plot photos give the real house
// existing features measured on site (shown in the mock-up): rendered real, with exactly their outline
const EXISTING = {
  piscine: "the swimming pool, with its exact outline, clear turquoise water and a light stone coping",
  terrasse: "the terrace slab, with its exact outline, in light grey concrete or stone",
  mineral: "the gravel path or area, with its exact outline, in light grey gravel",
  massif: "the planted bed, with its exact outline, with low Mediterranean shrubs",
  spa: "the spa or hot tub, in wood, with its water",
  kiosque: "the wooden kiosk or gazebo",
  abri: "the garden shed",
  haie: "the hedges",
  arbre: "the existing trees",
  zone: "the technical area (pool house or equipment area), in light grey concrete",
};
function buildFreePrompt(lines, nRefs, ambiance, existing, hasHouse, counts, staging) {
  const refs = nRefs === 1 ? "Image 2 is a real photograph" : `Images 2 to ${1 + nRefs} are real photographs`;
  const ex = existing.filter(k => EXISTING[k]).map(k => EXISTING[k]);
  const pools = (counts && counts.piscine) || 0;
  return [
    (hasHouse ? "Image 1 is a 3D mock-up of a newly built house and its synthetic-grass garden, seen from a chosen viewpoint." : "Image 1 is a 3D mock-up of a garden measured on site, with a synthetic-grass lawn, seen from a chosen viewpoint.") + (nRefs ? ` ${refs} of this same house and plot.` : "") + " Turn image 1 into one single photorealistic photograph in very high detail, taken from EXACTLY the same viewpoint, framing, height and perspective as image 1.",
    !hasHouse ? "There is no house in image 1: show only this garden, bordered by a low rendered wall or a hedge along its outline, with a calm residential background far away. Do not add a house in the plot."
      : nRefs ? `The house keeps exactly the volumes, proportions and position of image 1, and looks like the real house of ${nRefs === 1 ? "image 2" : `images 2 to ${1 + nRefs}`}: same render, windows, doors, frames, roofs and terrace.`
      : "The house keeps exactly the volumes, proportions and position of image 1: a modern new-build villa with smooth white render, large windows and French windows with dark grey frames, flat roofs with thin edges.",
    ex.length ? "These existing features are already on the plot and appear in image 1: keep each one exactly where it is, with exactly the same outline, size and orientation, made photorealistic: " + ex.join("; ") + ". The outline of the lawn and of the plot stays exactly as in image 1." : "",
    `There ${pools === 1 ? "is exactly ONE swimming pool" : pools ? "are exactly " + pools + " swimming pools" : "is NO swimming pool"} in the whole picture: never add another pool, basin or pond, even in the foreground or outside the plot.`,
    !hasHouse ? "Everything outside the plot outline (the empty beige ground of the mock-up, including the foreground) becomes plain short grass or the low wall: no extra terrace, paving, pool, building or object there." : "",
    "Replace each mock-up garden element by a real, photorealistic version at EXACTLY the same position, size and orientation as in image 1:",
    ...lines,
    "Each listed element appears exactly once, only where its mock-up is in image 1. " + (staging ? STAGING : "Do not add any other garden element, tree, path, plant or furniture inside the plot, and do not move, enlarge or remove anything.") + " The rest of the plot is a clean, flat premium synthetic grass lawn, photographed for real: individual blades visible near the camera, crisp and sharp, never a blurred or smeared texture.",
    hasHouse ? "The surroundings stay simple and plausible as in image 1: light boundary strips, neighbouring white houses, a few trees, the street. No people, no cars in the garden." : "No people, no cars, no dimension labels or numbers.",
    "Image 1 only gives the layout, the positions and the sizes: its simple 3D shapes, flat colours and low-poly trees must NOT show in the result; every element is redrawn as the real thing, like its catalogue photo.",
    LIGHT[ambiance] || LIGHT.jour,
  ].filter(Boolean).join("\n");
}

// night version of a finished day render: same picture, only the light changes, LED profiles switched on
const REAL_PASS = "Image 1 is a picture of a garden that still looks partly computer-generated. Produce the very same picture as an authentic photograph: keep EXACTLY the same framing, perspective, layout, shapes, sizes, positions and number of every element (pool, paving, trees, walls, lawn outline); nothing is added, moved, enlarged or removed. Only the realism changes: " + "It must look like an authentic photograph taken by a professional photographer with a full-frame camera, not a 3D rendering and not CGI: real materials with their natural texture and slight wear, real Mediterranean plants of the South of France (olive trees, Phoenix palms, lavender, rosemary, oleanders) with natural irregular foliage, premium synthetic grass with subtle natural colour variation and soft blade texture, natural depth of field, gentle lens vignetting, true-to-life colours, no oversaturation, no plastic look." + " Keep the same time of day and the same light.";
const RENDER_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(aiquickdraw\.com|redpandaai\.co|kie\.ai)\//i;
function buildNightPrompt(leds) {
  const led = leds.length
    ? `The paving has slim LED light profiles along all the edges of every single slab (not only around the outer edge of the paved area): they are switched on and glow ${leds.map(l => LED_TXT[l]).join(" and ")}, precisely outlining each slab of the pattern and softly lighting the slabs and the grass strips; this glowing paving is the highlight of the picture.`
    : "No new light fittings: the garden is lit only by the house and the night sky.";
  return [
    "Image 1 is a photorealistic daytime photograph of a house and its garden. Produce the very same photograph at night, just after blue hour.",
    "Keep EXACTLY the same framing, lens, perspective, buildings, windows, doors, garden layout, paving pattern, plants, lawn and every object: nothing is added, moved, enlarged or removed. Only the light changes. Never add a house, building, wall, pool or any object that is not already in image 1.",
    "Deep blue night sky with a few stars; if there is a house in image 1, warm light glowing inside it through the windows and a few discreet warm wall lights on its façade; soft moonlight on the lawn; underwater pool lights if there is a pool.",
    led,
    "An authentic night photograph taken by a professional photographer on a tripod, not a 3D rendering: natural night colours, real light falloff, low noise. No people, no text, no watermark.",
  ].join("\n");
}

// visite filmée : Veo 3.1 anime nos photos 4K (un plan glissé, ou le passage du jour à la nuit)
const VIDEO_KEEP = "Keep everything in the garden exactly as in the image: the same pool and its exact shape, the same paving slabs and their number, the same trees, palm and plants, the same lawn, walls, hedges and house. Nothing appears, disappears, moves or changes shape. No people, no animals, no text, no music, no voice; only soft natural garden sounds.";
const VIDEO = {
  glide: "Cinematic real-estate film of this exact garden, as filmed by a professional on a stabilised gimbal. One continuous, very slow and smooth camera move forward with a slight lateral arc, steady and level, no cut, no zoom jump. Only natural subtle motion: palm and leaves swaying gently in a light breeze, soft ripples and light reflections on the pool water. Photorealistic, natural light, real camera, shallow realistic depth of field. " + VIDEO_KEEP,
  daynight: "Cinematic time-lapse of this exact garden from daylight to night, camera almost still with a very slow push-in. The sun goes down, the sky turns golden, then deep blue dusk, then night. As it gets dark, the warm LED light strips along the paving and the garden and pool lights switch on progressively and glow, exactly as in the last image. Photorealistic, real camera. " + VIDEO_KEEP,
  dive: "The first image is a landscape architect's top-down plan of a garden; the last image is a photograph of this same garden once built. One continuous cinematic camera move: the camera starts high above the plan, the drawing comes to life and becomes the real garden while the camera glides down and forward, to end exactly on the last image. Smooth, steady, no cut. No text, no people; only soft natural garden sounds.",
  move: "Cinematic real-estate film of this exact garden: one continuous, slow and smooth camera move from the first viewpoint to the second, like a stabilised gimbal walking through the garden, steady and level, no cut. " + VIDEO_KEEP,
};
async function frameUrl(f, i, H) {
  if (typeof f !== "string") return null;
  if (RENDER_HOSTS.test(f) && f.length <= 500) return f;
  if (/^data:image\/(jpeg|png|webp);base64,/.test(f) && f.length < 4.4e6) return upload(f, `visite-${Date.now()}-${i}.jpg`, H);
  return null;
}

// kie.ai answers in English: the salesperson gets a clear French message when the account is empty
const kieMsg = m => (/credit|balance|top up/i.test(String(m || "")) ? "Crédits de rendu épuisés : le compte kie.ai doit être rechargé." : m);

// catalogue photos are bundled with the function and uploaded once per warm instance
const refCache = {};
async function upload(dataUrl, fileName, H) {
  const up = await (await fetch(UPLOAD, { method: "POST", headers: H, body: JSON.stringify({ base64Data: dataUrl, uploadPath: "studio-jardin", fileName }) })).json();
  return up && up.data && (up.data.downloadUrl || up.data.fileUrl || up.data.url);
}
async function bundledUrl(name, H) {
  if (!refCache[name]) {
    const buf = await readFile(new URL(`../img/${name}.jpg`, import.meta.url));
    refCache[name] = await upload("data:image/jpeg;base64," + buf.toString("base64"), `${name.replace("/", "-")}.jpg`, H);
  }
  return refCache[name];
}

export default async function handler(req, res) {
  const key = process.env.KIE_AI_API_KEY;
  if (!key) return res.status(500).json({ error: "serveur de rendu non configuré" });
  if (process.env.STUDIO_CODE && req.headers["x-studio-code"] !== process.env.STUDIO_CODE) return res.status(401).json({ error: "code d'accès invalide" });
  const H = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };

  try {
    if (req.method === "GET") {
      const r = await fetch(`${API}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(req.query.task || "")}`, { headers: H });
      const d = (await r.json()).data || {};
      let url = null;
      if (d.state === "success") {
        const j = (typeof d.resultJson === "string" ? JSON.parse(d.resultJson) : d.resultJson) || {}, dj = j.data || {};
        url = [j.resultUrls, j.result_urls, dj.result_urls, dj.resultUrls, j.originUrls, dj.origin_urls].map(a => Array.isArray(a) ? a[0] : null).find(Boolean) || null;
      }
      return res.json({ state: d.state || "waiting", url, error: d.failMsg || null });
    }
    if (req.method !== "POST") return res.status(405).end();

    const { image, items, empty, mode, aspect, lawn, site, ambiance, refs: houseRefs, existing: exIn, house, counts, style, staging } = req.body || {};
    const plan = mode === "free" && style === "plan", cnt = counts && typeof counts === "object" ? counts : {};
    const existing = [...new Set((Array.isArray(exIn) ? exIn : []).filter(k => EXISTING[k]))];
    const free = mode === "free";
    const RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"], ratio = RATIOS.includes(aspect) ? aspect : "3:4";
    if (mode === "video") {
      const { frames, kind, resolution } = req.body;
      const k = VIDEO[kind] ? kind : "glide";
      const urls = [];
      for (const [i, f] of (Array.isArray(frames) ? frames : []).slice(0, k === "glide" ? 1 : 2).entries()) { const u = await frameUrl(f, i, H); if (!u) return res.status(400).json({ error: "photo invalide" }); urls.push(u); }
      if (!urls.length || (k !== "glide" && urls.length < 2)) return res.status(400).json({ error: "photos manquantes" });
      const t = await (await fetch(`${API}/api/v1/jobs/createTask`, {
        method: "POST", headers: H,
        body: JSON.stringify({ model: "veo-3-1", input: { prompt: VIDEO[k], model: "veo3_fast", generation_type: "FIRST_AND_LAST_FRAMES_2_VIDEO", image_urls: urls, aspect_ratio: aspect === "9:16" ? "9:16" : "16:9", resolution: ["720p", "1080p", "4k"].includes(resolution) ? resolution : "1080p", duration: 8 } }),
      })).json();
      if (t.code !== 200) return res.status(502).json({ error: kieMsg(t.msg) || "vidéo refusée" });
      return res.json({ taskId: t.data.taskId });
    }
    if (mode === "real") {
      const { source } = req.body;
      if (typeof source !== "string" || !RENDER_HOSTS.test(source) || source.length > 500) return res.status(400).json({ error: "photo invalide" });
      const t = await (await fetch(`${API}/api/v1/jobs/createTask`, { method: "POST", headers: H, body: JSON.stringify({ model: MODEL, input: { prompt: REAL_PASS, image_input: [source], aspect_ratio: ratio, resolution: "4K", output_format: "png" } }) })).json();
      if (t.code !== 200) return res.status(502).json({ error: kieMsg(t.msg) || "rendu refusé" });
      return res.json({ taskId: t.data.taskId });
    }
    if (mode === "night") {
      const { source, leds } = req.body;
      if (typeof source !== "string" || !RENDER_HOSTS.test(source) || source.length > 500) return res.status(400).json({ error: "photo de jour invalide" });
      const ledOk = [...new Set((Array.isArray(leds) ? leds : []).filter(l => LED_TXT[l]))];
      const t = await (await fetch(`${API}/api/v1/jobs/createTask`, {
        method: "POST", headers: H,
        body: JSON.stringify({ model: MODEL, input: { prompt: buildNightPrompt(ledOk), image_input: [source], aspect_ratio: ratio, resolution: "4K", output_format: "png" } }),
      })).json();
      if (t.code !== 200) return res.status(502).json({ error: kieMsg(t.msg) || "rendu refusé" });
      return res.json({ taskId: t.data.taskId });
    }
    const own = (Array.isArray(houseRefs) ? houseRefs : []).filter(r => typeof r === "string" && r.startsWith("data:image/") && r.length < 3e6).slice(0, 2);
    const zones = ["middle-left", "middle-centre", "middle-right", "bottom-left", "bottom-centre", "bottom-right"];
    const emptyZones = (Array.isArray(empty) ? empty : []).filter(z => zones.includes(z)).map(z => "the " + z.replace("-", " ") + " of the image");
    const clean = s => String(s || "").replace(/[^a-z ,-]/gi, "").slice(0, 120);
    const list = (Array.isArray(items) ? items : []).slice(0, 12).map(it => {
      if (!it) return null;
      const spec = it.no === "DG" ? cleanSpec(it.spec) : null;
      if (it.no === "DG" ? !spec : !CATALOGUE[it.no]) return null;
      return { no: it.no, spec, where: clean(it.where) || "as placed" };
    }).filter(Boolean);
    if (typeof image !== "string" || !image.startsWith("data:image/") || image.length > 12e6 || !list.length) return res.status(400).json({ error: "composition invalide" });
    // a pool from the catalogue counts as a pool: the prompt states the exact number of pools in the picture
    const catPools = list.filter(it => it.no === "04").length;
    if (catPools) cnt.piscine = (Number(cnt.piscine) || 0) + catPools;

    if (plan) list.forEach(it => { it.where = "exactly where its mock-up is in image 1"; });
    // the composition (photo + 3D layer, assembled on the tablet) becomes a hosted file for the model
    const imageUrl = await upload(image, `composition-${Date.now()}.jpg`, H);
    if (!imageUrl) return res.status(502).json({ error: "envoi de l'image refusé" });

    const houseUrls = [];
    if (free && !plan && site !== "custom") houseUrls.push(await bundledUrl("face-base", H), await bundledUrl("droite-base", H));
    if (free && !plan && site === "custom") for (const [i, r] of own.entries()) { const u = await upload(r, `maison-${Date.now()}-${i}.jpg`, H); if (u) houseUrls.push(u); }

    // reference photos: catalogue photo of each element, or the motif and the slab of each paving, within the model's image limit
    const refKeys = [], room = MAX_IMAGES - 1 - houseUrls.length;
    const ref = k => { if (!refKeys.includes(k) && refKeys.length < room) refKeys.push(k); const i = refKeys.indexOf(k); return i < 0 ? null : 2 + houseUrls.length + i; };
    const lines = list.map(it => {
      if (it.spec) {
        const m = ref(MOTIF_REF[it.spec.motif]), c = ref("dalles/dalle-" + it.spec.couleur);
        return `- ${pavingText(it.spec)}, ${it.where}${m ? `, with the pattern of image ${m}` : ""}${c ? ` and the slab colour and texture of image ${c}` : ""} (Dalles & gazon catalogue);`;
      }
      const i = ref("catalogue-" + it.no);
      return `- ${CATALOGUE[it.no]}, ${it.where}${i ? `, like image ${i}` : ""} (catalogue no. ${it.no});`;
    });
    const refUrls = [];
    for (const k of refKeys) refUrls.push(await bundledUrl(k, H));

    const task = await (await fetch(`${API}/api/v1/jobs/createTask`, {
      method: "POST", headers: H,
      body: JSON.stringify({ model: MODEL, input: {
        prompt: plan ? buildPlanPrompt(lines, existing, house !== false, cnt, ambiance) : free ? buildFreePrompt(lines, houseUrls.length, ambiance, existing, house !== false, cnt, staging === true) : buildPrompt(lines, emptyZones, lawn === true, ambiance, staging === true),
        image_input: [imageUrl, ...houseUrls, ...refUrls], aspect_ratio: ratio, resolution: "4K", output_format: "png" } }),
    })).json();
    if (task.code !== 200) return res.status(502).json({ error: kieMsg(task.msg) || "rendu refusé" });
    return res.json({ taskId: task.data.taskId });
  } catch (e) {
    return res.status(502).json({ error: "serveur de rendu indisponible" });
  }
}

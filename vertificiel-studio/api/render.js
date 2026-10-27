// Studio jardin · serveur de rendu photo (fonction Vercel).
// La clé kie.ai reste ici, dans la variable d'environnement KIE_AI_API_KEY : elle n'est jamais envoyée à la tablette.
//
// POST /api/render   { image: "data:image/jpeg;base64,...", items: [{ no, where }], empty: [zones] }  ->  { taskId }
//                    options: aspect ("3:4", "4:3", ...), lawn: true when the photo shows bare soil and the 3D lawn is pasted on it
//                    { mode: "free", image, aspect, items, site: "demo" | "custom", refs: [photos of the house] }  (3D view from any angle)  ->  { taskId }
// GET  /api/render?task=ID                                                     ->  { state, url, error }
//
// Variables d'environnement :
//   KIE_AI_API_KEY   clé kie.ai (obligatoire)
//   STUDIO_CODE      code d'accès facultatif, attendu dans l'en-tête x-studio-code

import { readFile } from "node:fs/promises";

const API = "https://api.kie.ai";
const UPLOAD = "https://kieai.redpandaai.co/api/file-base64-upload";
const MODEL = "nano-banana-pro";

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

function buildPrompt(list, nos, empty, lawn) {
  const lines = list.map(it => `- ${CATALOGUE[it.no]}, ${it.where}, like image ${nos.indexOf(it.no) + 2} (catalogue no. ${it.no});`);
  const keep = empty.length ? `These parts of the image contain no element and must stay plain lawn, exactly as in image 1: ${empty.join(", ")}.` : "";
  return [
    "Image 1 is a real photograph of a newly built house and its synthetic-grass garden, on which simple 3D mock-up objects have been pasted to show the planned garden layout. Turn image 1 into one single photorealistic photograph in very high detail.",
    "Replace each mock-up object by a real, photorealistic version at EXACTLY the same position, size, orientation and perspective as in image 1:",
    ...lines,
    "Each listed element appears exactly once, only where its mock-up is in image 1, at the same size. Only these elements exist: do not add any other garden element, tree, path or plant, even if it would look natural. Do not move, enlarge, extend or remove anything, and do not change the layout. Keep exactly the same framing, lens and perspective.",
    keep,
    lawn ? "The green lawn area pasted on the plot is part of the mock-up: turn it into a real, clean, flat premium synthetic grass lawn that follows exactly its outline; the ground outside it stays exactly as in the photograph." : "",
    "Keep completely unchanged, pixel for pixel: the house with every window and door, its terrace, the sky and clouds, the neighbouring houses and plots (including building sites, pallets, concrete strips, bare soil and materials outside the lawn), trees, hedges, cars, street, and any shadow already on the ground. The rest of the lawn stays a clean, flat premium synthetic grass lawn.",
    "Sunny afternoon light with realistic soft shadows, photorealistic real-estate photography, natural colours, crisp detail. No people, no text, no watermark.",
  ].filter(Boolean).join("\n");
}

// any angle of the 3D: the mock-up gives the viewpoint and the layout, the plot photos give the real house
function buildFreePrompt(list, nos, nRefs) {
  const first = 2 + nRefs, refs = nRefs === 1 ? "Image 2 is a real photograph" : `Images 2 to ${1 + nRefs} are real photographs`;
  const lines = list.map(it => `- ${CATALOGUE[it.no]}, ${it.where}, like image ${nos.indexOf(it.no) + first} (catalogue no. ${it.no});`);
  return [
    "Image 1 is a 3D mock-up of a newly built house and its synthetic-grass garden, seen from a chosen viewpoint." + (nRefs ? ` ${refs} of this same house and plot.` : "") + " Turn image 1 into one single photorealistic photograph in very high detail, taken from EXACTLY the same viewpoint, framing, height and perspective as image 1.",
    nRefs ? `The house keeps exactly the volumes, proportions and position of image 1, and looks like the real house of ${nRefs === 1 ? "image 2" : `images 2 to ${1 + nRefs}`}: same render, windows, doors, frames, roofs and terrace.`
      : "The house keeps exactly the volumes, proportions and position of image 1: a modern new-build villa with smooth white render, large windows and French windows with dark grey frames, flat roofs with thin edges.",
    "Replace each mock-up garden element by a real, photorealistic version at EXACTLY the same position, size and orientation as in image 1:",
    ...lines,
    "Each listed element appears exactly once, only where its mock-up is in image 1. Do not add any other garden element, tree, path, plant or furniture inside the plot, and do not move, enlarge or remove anything. The rest of the plot is a clean, flat premium synthetic grass lawn.",
    "The surroundings stay simple and plausible as in image 1: light boundary strips, neighbouring white houses, a few trees, the street. No people, no cars in the garden.",
    "Sunny afternoon light with realistic soft shadows, photorealistic real-estate photography, natural colours, crisp detail. No text, no watermark, no labels.",
  ].join("\n");
}

// catalogue photos are bundled with the function and uploaded once per warm instance
const refCache = {};
async function upload(dataUrl, fileName, H) {
  const up = await (await fetch(UPLOAD, { method: "POST", headers: H, body: JSON.stringify({ base64Data: dataUrl, uploadPath: "studio-jardin", fileName }) })).json();
  return up && up.data && (up.data.downloadUrl || up.data.fileUrl || up.data.url);
}
async function bundledUrl(name, H) {
  if (!refCache[name]) {
    const buf = await readFile(new URL(`../img/${name}.jpg`, import.meta.url));
    refCache[name] = await upload("data:image/jpeg;base64," + buf.toString("base64"), `${name}.jpg`, H);
  }
  return refCache[name];
}
const catalogueUrl = (no, H) => bundledUrl(`catalogue-${no}`, H);

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
      if (d.state === "success") { const j = typeof d.resultJson === "string" ? JSON.parse(d.resultJson) : d.resultJson; url = j.resultUrls[0]; }
      return res.json({ state: d.state || "waiting", url, error: d.failMsg || null });
    }
    if (req.method !== "POST") return res.status(405).end();

    const { image, items, empty, mode, aspect, lawn, site, refs: houseRefs } = req.body || {};
    const free = mode === "free";
    const RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"], ratio = RATIOS.includes(aspect) ? aspect : "3:4";
    const own = (Array.isArray(houseRefs) ? houseRefs : []).filter(r => typeof r === "string" && r.startsWith("data:image/") && r.length < 3e6).slice(0, 2);
    const zones = ["middle-left", "middle-centre", "middle-right", "bottom-left", "bottom-centre", "bottom-right"];
    const emptyZones = (Array.isArray(empty) ? empty : []).filter(z => zones.includes(z)).map(z => "the " + z.replace("-", " ") + " of the image");
    const clean = s => String(s || "").replace(/[^a-z ,-]/gi, "").slice(0, 120);
    const list = (Array.isArray(items) ? items : []).filter(it => it && CATALOGUE[it.no]).slice(0, 12).map(it => ({ no: it.no, where: clean(it.where) || "as placed" }));
    const nos = [...new Set(list.map(it => it.no))].slice(0, free ? 5 : 7);
    if (typeof image !== "string" || !image.startsWith("data:image/") || image.length > 12e6 || !list.length) return res.status(400).json({ error: "composition invalide" });

    // the composition (photo + 3D layer, assembled on the tablet) becomes a hosted file for the model
    const imageUrl = await upload(image, `composition-${Date.now()}.jpg`, H);
    if (!imageUrl) return res.status(502).json({ error: "envoi de l'image refusé" });

    const refs = [];
    if (free && site !== "custom") refs.push(await bundledUrl("face-base", H), await bundledUrl("droite-base", H));
    if (free && site === "custom") for (const [i, r] of own.entries()) { const u = await upload(r, `maison-${Date.now()}-${i}.jpg`, H); if (u) refs.push(u); }
    const nRefs = refs.length;
    for (const no of nos) refs.push(await catalogueUrl(no, H));
    const kept = list.filter(it => nos.includes(it.no));
    const task = await (await fetch(`${API}/api/v1/jobs/createTask`, {
      method: "POST", headers: H,
      body: JSON.stringify({ model: MODEL, input: {
        prompt: free ? buildFreePrompt(kept, nos, nRefs) : buildPrompt(kept, nos, emptyZones, lawn === true),
        image_input: [imageUrl, ...refs], aspect_ratio: ratio, resolution: "4K", output_format: "png" } }),
    })).json();
    if (task.code !== 200) return res.status(502).json({ error: task.msg || "rendu refusé" });
    return res.json({ taskId: task.data.taskId });
  } catch (e) {
    return res.status(502).json({ error: "serveur de rendu indisponible" });
  }
}

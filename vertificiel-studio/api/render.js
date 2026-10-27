// Studio jardin · serveur de rendu photo (fonction Vercel).
// La clé kie.ai reste ici, dans la variable d'environnement KIE_AI_API_KEY : elle n'est jamais envoyée à la tablette.
//
// POST /api/render   { image: "data:image/jpeg;base64,...", items: [{ no, where, spec? }], empty: [zones] }  ->  { taskId }
//                    options: aspect ("3:4", "4:3", ...), lawn: true when the photo shows bare soil and the 3D lawn is pasted on it,
//                    ambiance: "jour" | "soir"
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
  if (s.led !== "aucune") txt += `, with slim ${LED_TXT[s.led]} LED light profiles running along the edges of the slabs`;
  return `${txt}, covering a ${r(s.w)} x ${r(s.d)} m area`;
}

const LIGHT = {
  jour: "Sunny afternoon light with realistic soft shadows, photorealistic real-estate photography, natural colours, crisp detail. No people, no text, no watermark.",
  soir: "Evening at blue hour: deep blue twilight sky, warm lights glowing inside the house, garden lights and the LED light profiles of the paving switched on and glowing, realistic soft night shadows, photorealistic high-end real-estate evening photography. No people, no text, no watermark.",
};

function buildPrompt(lines, empty, lawn, ambiance) {
  const keep = empty.length ? `These parts of the image contain no element and must stay plain lawn, exactly as in image 1: ${empty.join(", ")}.` : "";
  const evening = ambiance === "soir";
  return [
    "Image 1 is a real photograph of a newly built house and its synthetic-grass garden, on which simple 3D mock-up objects have been pasted to show the planned garden layout. Turn image 1 into one single photorealistic photograph in very high detail.",
    "Replace each mock-up object by a real, photorealistic version at EXACTLY the same position, size, orientation and perspective as in image 1:",
    ...lines,
    "Each listed element appears exactly once, only where its mock-up is in image 1, at the same size. Only these elements exist: do not add any other garden element, tree, path or plant, even if it would look natural. Do not move, enlarge, extend or remove anything, and do not change the layout. Keep exactly the same framing, lens and perspective.",
    keep,
    lawn ? "The green lawn area pasted on the plot is part of the mock-up: turn it into a real, clean, flat premium synthetic grass lawn that follows exactly its outline; the ground outside it stays exactly as in the photograph." : "",
    evening
      ? "Keep the house with every window and door, its terrace, the neighbouring houses and plots, trees, hedges, cars and street exactly in place and in shape; only the time of day changes. The rest of the lawn stays a clean, flat premium synthetic grass lawn."
      : "Keep completely unchanged, pixel for pixel: the house with every window and door, its terrace, the sky and clouds, the neighbouring houses and plots (including building sites, pallets, concrete strips, bare soil and materials outside the lawn), trees, hedges, cars, street, and any shadow already on the ground. The rest of the lawn stays a clean, flat premium synthetic grass lawn.",
    LIGHT[evening ? "soir" : "jour"],
  ].filter(Boolean).join("\n");
}

// any angle of the 3D: the mock-up gives the viewpoint and the layout, the plot photos give the real house
function buildFreePrompt(lines, nRefs, ambiance) {
  const refs = nRefs === 1 ? "Image 2 is a real photograph" : `Images 2 to ${1 + nRefs} are real photographs`;
  return [
    "Image 1 is a 3D mock-up of a newly built house and its synthetic-grass garden, seen from a chosen viewpoint." + (nRefs ? ` ${refs} of this same house and plot.` : "") + " Turn image 1 into one single photorealistic photograph in very high detail, taken from EXACTLY the same viewpoint, framing, height and perspective as image 1.",
    nRefs ? `The house keeps exactly the volumes, proportions and position of image 1, and looks like the real house of ${nRefs === 1 ? "image 2" : `images 2 to ${1 + nRefs}`}: same render, windows, doors, frames, roofs and terrace.`
      : "The house keeps exactly the volumes, proportions and position of image 1: a modern new-build villa with smooth white render, large windows and French windows with dark grey frames, flat roofs with thin edges.",
    "Replace each mock-up garden element by a real, photorealistic version at EXACTLY the same position, size and orientation as in image 1:",
    ...lines,
    "Each listed element appears exactly once, only where its mock-up is in image 1. Do not add any other garden element, tree, path, plant or furniture inside the plot, and do not move, enlarge or remove anything. The rest of the plot is a clean, flat premium synthetic grass lawn.",
    "The surroundings stay simple and plausible as in image 1: light boundary strips, neighbouring white houses, a few trees, the street. No people, no cars in the garden.",
    ambiance === "soir" ? LIGHT.soir : "Sunny afternoon light with realistic soft shadows, photorealistic real-estate photography, natural colours, crisp detail. No text, no watermark, no labels.",
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
      if (d.state === "success") { const j = typeof d.resultJson === "string" ? JSON.parse(d.resultJson) : d.resultJson; url = j.resultUrls[0]; }
      return res.json({ state: d.state || "waiting", url, error: d.failMsg || null });
    }
    if (req.method !== "POST") return res.status(405).end();

    const { image, items, empty, mode, aspect, lawn, site, ambiance, refs: houseRefs } = req.body || {};
    const free = mode === "free";
    const RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9"], ratio = RATIOS.includes(aspect) ? aspect : "3:4";
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

    // the composition (photo + 3D layer, assembled on the tablet) becomes a hosted file for the model
    const imageUrl = await upload(image, `composition-${Date.now()}.jpg`, H);
    if (!imageUrl) return res.status(502).json({ error: "envoi de l'image refusé" });

    const houseUrls = [];
    if (free && site !== "custom") houseUrls.push(await bundledUrl("face-base", H), await bundledUrl("droite-base", H));
    if (free && site === "custom") for (const [i, r] of own.entries()) { const u = await upload(r, `maison-${Date.now()}-${i}.jpg`, H); if (u) houseUrls.push(u); }

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
        prompt: free ? buildFreePrompt(lines, houseUrls.length, ambiance) : buildPrompt(lines, emptyZones, lawn === true, ambiance),
        image_input: [imageUrl, ...houseUrls, ...refUrls], aspect_ratio: ratio, resolution: "4K", output_format: "png" } }),
    })).json();
    if (task.code !== 200) return res.status(502).json({ error: task.msg || "rendu refusé" });
    return res.json({ taskId: task.data.taskId });
  } catch (e) {
    return res.status(502).json({ error: "serveur de rendu indisponible" });
  }
}

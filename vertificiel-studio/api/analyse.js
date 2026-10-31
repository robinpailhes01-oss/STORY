// Studio jardin · analyse d'une photo prise sur place (fonction Vercel), avec Gemini via kie.ai.
// La clé kie.ai reste ici (KIE_AI_API_KEY), comme pour le rendu 4K.
//
// POST /api/analyse  { image: "data:image/jpeg;base64,...", sketch: "data:image/jpeg;base64,...", corners: ["1", "2", ...], model?: "pro" }
//   image   la photo du terrain
//   sketch  la maquette 3D vue à peu près du même endroit, coins de la maison numérotés
//   ->  { corners: [{ id, x, y }], objects: [{ type, label, ground: [[x, y], ...], top: [x, y] }] }   (coordonnées 0..1000 dans la photo)

const API = "https://api.kie.ai";
const TYPES = ["kiosque", "spa", "piscine", "abri", "arbre", "haie", "terrasse", "massif", "mobilier", "autre"];

function prompt(ids) {
  return [
    "Image 1 is a photograph of a house and its garden, taken by a salesperson standing in the garden. Image 2 is a simple 3D sketch of the same house seen from about the same place; some corners of the house are marked with numbered dots: " + ids.join(", ") + ".",
    "Answer with JSON only, no comment, in this exact shape:",
    '{"corners":[{"id":"1","x":0,"y":0}],"objects":[{"type":"kiosque","label":"kiosque en bois avec spa","ground":[[0,0],[0,0],[0,0],[0,0]],"top":[0,0]}]}',
    "Coordinates are in image 1, normalised from 0 to 1000 (x from left to right, y from top to bottom).",
    "corners: for each numbered dot of image 2 that is clearly visible in image 1, the same corner of the real house in image 1. Use the walls and the roof edges, not windows. Leave out corners you cannot see or are not sure about.",
    "objects: every existing garden feature standing on the plot, outside the house itself: kiosk or gazebo, spa or hot tub, swimming pool, shed or garage or pool house, tree, hedge, terrace or paved area, flower bed, garden furniture.",
    "type is one of: " + TYPES.join(", ") + ". label is a short description in French.",
    "ground: the footprint of the object on the ground, as 3 to 6 points where its base meets the ground (for a tree, the base of the trunk and the edge of its crown projected on the ground; for a pool or terrace, its outline on the ground). top: the highest point of the object, straight above its base (for flat objects, repeat a ground point).",
    "Do not list the house, the sky, the lawn itself, people, cars, or anything outside the plot (neighbouring houses and gardens).",
  ].join("\n");
}

const parseJSON = t => { const m = String(t || "").replace(/```json|```/g, "").match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; };

// the endpoints may answer as a stream even when asked not to: keep the text parts either way
async function readText(r, pick) {
  const raw = await r.text();
  if (!/^\s*data:/m.test(raw)) { const j = JSON.parse(raw); if (j.code && j.code !== 200) throw new Error(j.msg || "analyse refusée"); return pick(j); }
  return raw.split("\n").filter(l => l.startsWith("data:") && !l.includes("[DONE]")).map(l => { try { return pick(JSON.parse(l.slice(5))); } catch (e) { return ""; } }).join("");
}

async function flash(img, sk, ids, H) {
  const part = d => ({ inline_data: { mime_type: d.slice(5, d.indexOf(";")), data: d.slice(d.indexOf(",") + 1) } });
  const r = await fetch(`${API}/gemini/v1/models/gemini-3-8-flash:streamGenerateContent`, {
    method: "POST", headers: H,
    body: JSON.stringify({ stream: false, contents: [{ role: "user", parts: [{ text: prompt(ids) }, part(img), part(sk)] }], generationConfig: { thinkingConfig: { includeThoughts: false, thinkingLevel: "high" } } }),
  });
  return readText(r, j => ((j.candidates || [])[0] || { content: { parts: [] } }).content.parts.filter(p => p.text && !p.thought).map(p => p.text).join(""));
}
async function pro(img, sk, ids, H) {
  const r = await fetch(`${API}/gemini-3.1-pro/v1/chat/completions`, {
    method: "POST", headers: H,
    body: JSON.stringify({ stream: false, include_thoughts: false, reasoning_effort: "high", messages: [{ role: "user", content: [{ type: "text", text: prompt(ids) }, { type: "image_url", image_url: { url: img } }, { type: "image_url", image_url: { url: sk } }] }] }),
  });
  return readText(r, j => { const c = (j.choices || [])[0] || {}; return (c.message && c.message.content) || (c.delta && c.delta.content) || ""; });
}

export default async function handler(req, res) {
  const key = process.env.KIE_AI_API_KEY;
  if (!key) return res.status(500).json({ error: "serveur d'analyse non configuré" });
  if (process.env.STUDIO_CODE && req.headers["x-studio-code"] !== process.env.STUDIO_CODE) return res.status(401).json({ error: "code d'accès invalide" });
  if (req.method !== "POST") return res.status(405).end();
  const { image, sketch, corners, model } = req.body || {};
  const ok = d => typeof d === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(d) && d.length < 3.5e6;
  if (!ok(image) || !ok(sketch)) return res.status(400).json({ error: "photo invalide" });
  const ids = (Array.isArray(corners) ? corners : []).map(String).filter(s => /^[0-9]{1,2}$/.test(s)).slice(0, 24);
  const H = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
  try {
    const text = await (model === "pro" ? pro : flash)(image, sketch, ids, H);
    const d = parseJSON(text);
    if (!d) return res.status(502).json({ error: "réponse illisible" });
    const num = v => (typeof v === "number" && v >= -200 && v <= 1200 ? v : null), pt = p => Array.isArray(p) && num(p[0]) != null && num(p[1]) != null ? [p[0], p[1]] : null;
    const out = {
      corners: (Array.isArray(d.corners) ? d.corners : []).filter(c => c && ids.includes(String(c.id)) && num(c.x) != null && num(c.y) != null).map(c => ({ id: String(c.id), x: c.x, y: c.y })),
      objects: (Array.isArray(d.objects) ? d.objects : []).slice(0, 30).map(o => ({ type: TYPES.includes(o && o.type) ? o.type : "autre", label: String((o && o.label) || "").slice(0, 80), ground: (Array.isArray(o && o.ground) ? o.ground : []).map(pt).filter(Boolean).slice(0, 8), top: pt(o && o.top) })).filter(o => o.ground.length),
      model: model === "pro" ? "gemini-3.1-pro" : "gemini-3.8-flash",
    };
    return res.json(out);
  } catch (e) {
    return res.status(502).json({ error: "analyse indisponible" + (e && e.message ? " (" + e.message.slice(0, 80) + ")" : "") });
  }
}

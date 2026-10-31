// Studio jardin · analyse d'une photo prise sur place (fonction Vercel), avec Gemini via kie.ai.
// La clé kie.ai reste ici (KIE_AI_API_KEY), comme pour le rendu 4K.
//
// POST /api/analyse  { image: "data:image/jpeg;base64,...", sketch: "data:image/jpeg;base64,...", corners: ["1", "2", ...], model?: "pro" }
//   image   la photo du terrain
//   sketch  la maquette 3D vue à peu près du même endroit, coins de la maison et du terrain numérotés
//   ->  { corners: [{ id, x, y }], objects: [{ type, label, ground: [[x, y], ...] }] }   (coordonnées 0..1000 dans la photo)

const API = "https://api.kie.ai";
const TYPES = ["terrasse", "allee", "massif", "piscine", "spa", "kiosque", "abri", "arbre", "haie", "mobilier", "autre"];

function prompt(ids, sides) {
  return [
    "Image 1 is a photograph of a garden, taken by a salesperson standing near a corner of the house and looking over the garden. Image 2 is a simple 3D sketch of the same plot seen from about the same place: the corners of the house and of the plot boundary (fence, wall or hedge corners at ground level) are marked with numbered dots: " + ids.join(", ") + ".",
    sides.length ? "Image 2 also shows the sides of the plot boundary at ground level as coloured lines labelled " + sides.join(", ") + "." : "",
    "Answer with JSON only, no comment, in this exact shape:",
    '{"corners":[{"id":"1","x":0,"y":0}],"edges":[{"side":"S1","x":0,"y":0}],"objects":[{"type":"terrasse","label":"terrasse en dalles","ground":[[0,0],[0,0],[0,0],[0,0]]}]}',
    "Coordinates are in image 1, normalised from 0 to 1000 (x from left to right, y from top to bottom).",
    "corners: for each numbered dot of image 2 that is clearly visible in image 1, the same point in image 1: a corner of the house walls, or a corner of the plot boundary where it meets the ground. Leave out what you cannot see or are not sure about.",
    "edges: for each side of image 2 that you can see in image 1 (the foot of the fence, wall, hedge or border along that side of the plot), 2 to 4 points along it, where it meets the ground. Leave out sides you cannot see.",
    "objects: what lies on the ground of the plot, outside the house itself: terrace or paved area, path or gravel, flower bed or planted area, swimming pool, spa or hot tub, kiosk or gazebo, shed or garage or pool house, tree, hedge, large garden furniture.",
    "type is one of: " + TYPES.join(", ") + ". label is a short description in French (material, colour).",
    "ground: the outline of the object ON THE GROUND, as 3 to 8 points where it meets the ground, as precisely as possible (for a tree, its trunk base and the ground under the edge of its crown; for a kiosk or shed, the corners of its base). Heights do not matter.",
    "Do not list the house, the sky, the lawn itself, people, cars, or anything outside the plot (neighbouring houses and gardens, the street).",
  ].filter(Boolean).join("\n");
}

const parseJSON = t => { const m = String(t || "").replace(/```json|```/g, "").match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; };

// the endpoints may answer as a stream even when asked not to: keep the text parts either way
async function readText(r, pick) {
  const raw = await r.text();
  if (!/^\s*data:/m.test(raw)) { const j = JSON.parse(raw); if (j.code && j.code !== 200) throw new Error(j.msg || "analyse refusée"); return pick(j); }
  return raw.split("\n").filter(l => l.startsWith("data:") && !l.includes("[DONE]")).map(l => { try { return pick(JSON.parse(l.slice(5))); } catch (e) { return ""; } }).join("");
}

async function flash(img, sk, ids, sides, H) {
  const part = d => ({ inline_data: { mime_type: d.slice(5, d.indexOf(";")), data: d.slice(d.indexOf(",") + 1) } });
  const r = await fetch(`${API}/gemini/v1/models/gemini-3-8-flash:streamGenerateContent`, {
    method: "POST", headers: H,
    body: JSON.stringify({ stream: false, contents: [{ role: "user", parts: [{ text: prompt(ids, sides) }, part(img), part(sk)] }], generationConfig: { thinkingConfig: { includeThoughts: false, thinkingLevel: "low" } } }),
  });
  return readText(r, j => ((j.candidates || [])[0] || { content: { parts: [] } }).content.parts.filter(p => p.text && !p.thought).map(p => p.text).join(""));
}
async function pro(img, sk, ids, sides, H) {
  const r = await fetch(`${API}/gemini-3.1-pro/v1/chat/completions`, {
    method: "POST", headers: H,
    body: JSON.stringify({ stream: false, include_thoughts: false, reasoning_effort: "high", messages: [{ role: "user", content: [{ type: "text", text: prompt(ids, sides) }, { type: "image_url", image_url: { url: img } }, { type: "image_url", image_url: { url: sk } }] }] }),
  });
  return readText(r, j => { const c = (j.choices || [])[0] || {}; return (c.message && c.message.content) || (c.delta && c.delta.content) || ""; });
}

export default async function handler(req, res) {
  const key = process.env.KIE_AI_API_KEY;
  if (!key) return res.status(500).json({ error: "serveur d'analyse non configuré" });
  if (process.env.STUDIO_CODE && req.headers["x-studio-code"] !== process.env.STUDIO_CODE) return res.status(401).json({ error: "code d'accès invalide" });
  if (req.method !== "POST") return res.status(405).end();
  const { image, sketch, corners, sides: sideIn, model } = req.body || {};
  const ok = d => typeof d === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(d) && d.length < 3.5e6;
  if (!ok(image) || !ok(sketch)) return res.status(400).json({ error: "photo invalide" });
  const ids = (Array.isArray(corners) ? corners : []).map(String).filter(s => /^[0-9]{1,2}$/.test(s)).slice(0, 24);
  const sides = (Array.isArray(sideIn) ? sideIn : []).map(String).filter(x => /^S[0-9]{1,2}$/.test(x)).slice(0, 20);
  const H = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
  try {
    const text = await (model === "pro" ? pro : flash)(image, sketch, ids, sides, H);
    const d = parseJSON(text);
    if (!d) return res.status(502).json({ error: "réponse illisible" });
    const num = v => (typeof v === "number" && v >= -200 && v <= 1200 ? v : null), pt = p => Array.isArray(p) && num(p[0]) != null && num(p[1]) != null ? [p[0], p[1]] : null;
    const out = {
      corners: (Array.isArray(d.corners) ? d.corners : []).filter(c => c && ids.includes(String(c.id)) && num(c.x) != null && num(c.y) != null).map(c => ({ id: String(c.id), x: c.x, y: c.y })),
      edges: (Array.isArray(d.edges) ? d.edges : []).filter(e => e && sides.includes(String(e.side)) && num(e.x) != null && num(e.y) != null).slice(0, 40).map(e => ({ side: String(e.side), x: e.x, y: e.y })),
      objects: (Array.isArray(d.objects) ? d.objects : []).slice(0, 30).map(o => ({ type: TYPES.includes(o && o.type) ? o.type : "autre", label: String((o && o.label) || "").slice(0, 80), ground: (Array.isArray(o && o.ground) ? o.ground : []).map(pt).filter(Boolean).slice(0, 8) })).filter(o => o.ground.length),
      model: model === "pro" ? "gemini-3.1-pro" : "gemini-3.8-flash",
    };
    return res.json(out);
  } catch (e) {
    return res.status(502).json({ error: "analyse indisponible" + (e && e.message ? " (" + e.message.slice(0, 80) + ")" : "") });
  }
}

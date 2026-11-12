// Export the demo garden (same composition as the 360° test) to a GLB file for Blender, with the visit points.
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const S = process.argv[2], OUT = S + '/blender/';
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text().slice(0, 200)); });
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/**', r => r.fulfill({ body: fs.readFileSync(S + '/3d/three.min.js'), contentType: 'application/javascript' }));
  await page.route('https://fonts.googleapis.com/**', r => r.abort());
  await page.goto('http://127.0.0.1:8768/?code=test');
  await page.waitForFunction(() => document.getElementById('loading').hidden, null, { timeout: 60000 }); await page.waitForTimeout(800);
  await page.click('[data-panel="1"] [data-go="2"]'); await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('clearAll').click());
  await page.evaluate(() => { const st = window.studio; st.addItem('10', -6.3, 8, 0); st.addItem('04', 4.2, 10.4, 0); st.addItem('DG', 3.4, 4.3, 0, { motif: 'droit', couleur: 'bergstein-ivory', taille: 0.8, bande: 0.12, joint: 'gazon', led: 'chaud', w: 6.5, d: 3.6 }); st.addItem('07', -8.5, 13, 0); });
  await page.waitForTimeout(4000);           // slab textures load
  await page.addScriptTag({ content: 'window.THREE = window.THREE || THREE;\n' + fs.readFileSync(OUT + 'GLTFExporter.js', 'utf8') });
  const res = await page.evaluate(() => new Promise((ok, ko) => {
    const { scene, restore } = window.studio.sceneForExport();
    const pts = window.studio.visitPoints();
    new THREE.GLTFExporter().parse(scene, glb => {
      restore(); const b = new Uint8Array(glb); let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768));
      ok({ glb: btoa(s), pts, n: (() => { let n = 0; scene.traverse(o => { if (o.isMesh && o.visible) n++; }); return n; })() });
    }, { binary: true, onlyVisible: true, embedImages: true, maxTextureSize: 2048 });
  }));
  fs.writeFileSync(OUT + 'jardin.glb', Buffer.from(res.glb, 'base64')); fs.writeFileSync(OUT + 'points.json', JSON.stringify(res.pts));
  console.log(JSON.stringify({ kb: Math.round(res.glb.length * 0.75 / 1024), meshes: res.n, pts: res.pts, errors: errors.slice(0, 8) })); await browser.close();
})();

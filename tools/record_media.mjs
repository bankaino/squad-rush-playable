// record_media.mjs — records the attract demo frame by frame (SCENE.render(t) → small JPEG), for docs/media. Not part of the build.
import { createRequire } from 'node:module'; import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs'; import http from 'node:http';
const { chromium } = createRequire(import.meta.url)(path.join(os.homedir(), '.claude/skills/ref2game/scripts/node_modules/playwright'));
const root = process.cwd(), types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=default'] }), p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/live/index.html?render=1`); await p.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
const T1 = +(process.argv[2] || 25), FPS = 30, W = 540; fs.mkdirSync('frames/rec', { recursive: true });
for (let i = 0; i <= T1 * FPS; i++) {
  const u = await p.evaluate(([t, W]) => { SCENE.render(t); const gl = document.getElementById('c'), hud = document.getElementById('hud'), H = Math.round(W * gl.height / gl.width), c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.drawImage(gl, 0, 0, W, H); x.drawImage(hud, 0, 0, W, H); return c.toDataURL('image/jpeg', 0.88); }, [i / FPS, W]);
  fs.writeFileSync(`frames/rec/f${String(i).padStart(5, '0')}.jpg`, Buffer.from(u.split(',')[1], 'base64'));
}
console.log('frames', T1 * FPS + 1, errs.length ? 'ERRORS ' + errs.slice(0, 2).join(' | ') : 'no page errors'); await b.close(); srv.close();

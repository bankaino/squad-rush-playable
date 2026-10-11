import { createRequire } from 'node:module'; import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs'; import http from 'node:http';
const { chromium } = createRequire(import.meta.url)(path.join(os.homedir(), '.claude/skills/ref2game/scripts/node_modules/playwright'));
const root = process.cwd(), types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const b = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=default'] }); const p = await b.newPage({ viewport: { width: 900, height: 500 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(`http://127.0.0.1:${srv.address().port}/art/viewer.html?${process.argv[3] || ''}`); try { await p.waitForFunction(() => window.__done, null, { timeout: 20000 }); } catch (e) { console.log('FAIL', errs.join(' | ')); process.exit(1); }
console.log(JSON.stringify(await p.evaluate(() => window.__info))); fs.writeFileSync(process.argv[2], Buffer.from((await p.evaluate(() => window.__png)).split(',')[1], 'base64')); await b.close(); srv.close();

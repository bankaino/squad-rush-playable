// live/scene.js — SQUAD RUSH 3D world: draws SIM state with three.js; the HUD on top is hud.js.
// Contract used by index.html / tools: SCENE.init(glCanvas, hudCanvas, VW, VH) → Promise, SCENE.render(t), SCENE.state,
// SCENE.hit (tappable HUD rects, from hud.js), SCENE.stats(), SCENE.probe(), SCENE.QA(), SCENE.proj(xPx, yPx, hM).
// World mapping: sim px → metres with U (x → X, y → Z, forward = −Z, up = Y). Everything is a pure function of (state, t):
// probe.mjs / render.mjs render any moment of the attract demo. The only cache is "which rig plays which unit id" (rebuilt from the state).
// Look (art/style_bible.txt): a red suspension bridge over a bright sea, soldiers ≈ 1 m tall (CC0 rig for the first CC0_MAX units, procedural
// chibis for the rest and for the red crowd), flat Lambert + ACES + a soft sky env map; blob shadows (one draw) instead of shadow maps.
(function () {
  const T = THREE, S = (window.SCENE = { state: null, hit: [] }), U = 0.01, RS = 0.72, RSR = 1.0, BOSS_S = 1.15, GUNS = [1.6, 1.8, 2.3];   // RS: soldier rig scale (1.75 m → 1.26 m)
  const K = () => SIM.K;
  const COL = { sky: 0xcfe6f5, road: 0x8d939c, rail: 0xc8352b, rail2: 0xb02e25, curb: 0xc9ced6, sea: 0x2a7fc4, steel: 0xb9c0cc, dark: 0x4a505a, wood: 0xc0773a, wood2: 0xa9652f,
    blue: 0x2f7de1, blueD: 0x2e5fb8, red: 0xd93a2f, redD: 0xb8322a, skin: 0xf2b48c, tan: 0xe8c9a0, gate: [0xff2418, 0x3ba0ff], hair: 0xf2b640, tracer: 0xffc24a };
  let R, scene, cam, sun, VW = 1080, VH = 1920, end = {}, K_, gltf, gGiant;
  const P = { rigOf: new Map(), free: [], wave: [] };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), ease = (x) => 1 - (1 - x) * (1 - x), SS = (a, b, x) => { const q = clamp((x - a) / (b - a), 0, 1); return q * q * (3 - 2 * q); };
  const h1 = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const M4 = new T.Matrix4(), V3 = new T.Vector3(), Q4 = new T.Quaternion(), E3 = new T.Euler();

  // ---------------- geometry kit (everything procedural, vertex-coloured, merged → one draw per kind) ----------------
  const tf = (g, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => g.applyMatrix4(M4.compose(V3.set(...p), Q4.setFromEuler(E3.set(...r)), new T.Vector3(...s)));
  const col = (g, hex) => K_.paint(g, hex), mergeG = (a) => T.BufferGeometryUtils.mergeGeometries(a);
  const bx = (w, h, d, hex, p, r, s) => col(tf(new T.BoxGeometry(w, h, d), p, r, s), hex), cy = (rt, rb, h, n, hex, p, r) => col(tf(new T.CylinderGeometry(rt, rb, h, n), p, r), hex);
  const tex = (w, h, draw, rep) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 4; } return t; };
  // chibi parts (≈ 1 m tall, facing −Z): top (torso + head + helmet), leg and arm hang from their pivot at y = 0
  const chibiTop = (shirt, helmet, skin) => mergeG([bx(0.44, 0.4, 0.28, shirt, [0, 0.58, 0]), bx(0.5, 0.12, 0.3, helmet === COL.red ? COL.redD : COL.blueD, [0, 0.4, 0]),
    col(tf(new T.IcosahedronGeometry(0.24, 1), [0, 0.92, 0]), skin), col(tf(new T.SphereGeometry(0.27, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.94, 0]), helmet), bx(0.5, 0.05, 0.4, helmet, [0, 0.95, -0.02])]);
  const chibiLeg = (pants, boot) => mergeG([bx(0.15, 0.3, 0.17, pants, [0, -0.15, 0]), bx(0.16, 0.08, 0.24, boot, [0, -0.34, -0.03])]);
  const chibiArm = (sleeve, hand) => mergeG([bx(0.11, 0.26, 0.11, sleeve, [0, -0.13, 0]), bx(0.12, 0.1, 0.12, hand, [0, -0.3, 0])]);
  // guns along −Z (muzzle forward), grip at the origin
  function gunGeo(kind) {
    if (kind === 0) return mergeG([bx(0.09, 0.13, 0.5, COL.dark, [0, 0, -0.1]), cy(0.024, 0.024, 0.4, 6, COL.steel, [0, 0.02, -0.55], [Math.PI / 2, 0, 0]), bx(0.07, 0.14, 0.26, 0x6b4a2e, [0, -0.01, 0.25]), bx(0.06, 0.14, 0.08, COL.dark, [0, -0.12, 0])]);
    if (kind === 1) return mergeG([bx(0.09, 0.13, 0.42, COL.dark, [0, 0, -0.1]), bx(0.1, 0.1, 0.32, 0xa0522d, [0, -0.005, -0.45]), cy(0.022, 0.022, 0.3, 6, COL.steel, [0, 0.03, -0.78], [Math.PI / 2, 0, 0]),
      bx(0.07, 0.22, 0.1, COL.dark, [0, -0.17, -0.12], [0.35, 0, 0]), bx(0.075, 0.15, 0.26, 0xa0522d, [0, -0.02, 0.27]), bx(0.06, 0.14, 0.07, 0xa0522d, [0, -0.13, 0.02])]);
    const g = [cy(0.13, 0.13, 0.46, 10, 0x4a4f58, [0, 0, -0.1], [Math.PI / 2, 0, 0]), cy(0.15, 0.15, 0.06, 10, COL.blue, [0, 0, -0.34], [Math.PI / 2, 0, 0]), cy(0.17, 0.17, 0.06, 10, COL.blue, [0, 0, 0.1], [Math.PI / 2, 0, 0]),
      bx(0.2, 0.22, 0.26, COL.blueD, [0, -0.2, 0.1]), bx(0.07, 0.16, 0.1, COL.dark, [0, -0.17, -0.02]), cy(0.08, 0.08, 0.1, 8, 0x2b2e33, [0, 0, 0.2], [Math.PI / 2, 0, 0])];
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.push(cy(0.026, 0.026, 0.5, 5, COL.steel, [Math.cos(a) * 0.08, Math.sin(a) * 0.08, -0.62], [Math.PI / 2, 0, 0])); }
    return mergeG(g);
  }
  function barrelGeo() {                                  // lying along X: alternating staves, steel hoops, dark ends
    const g = new T.CylinderGeometry(0.55, 0.52, 1.3, 16, 1).toNonIndexed(), pos = g.attributes.position, c = new Float32Array(pos.count * 3), a = new T.Color(COL.wood), b = new T.Color(COL.wood2), e = new T.Color(0x5a3a1c);
    for (let i = 0; i < pos.count; i++) { const tri = Math.floor(i / 3), side = Math.abs(g.attributes.normal.getY(i)) < 0.5, q = side ? (Math.floor(Math.atan2(pos.getZ(i), pos.getX(i)) / (Math.PI / 8) + 16) % 2 ? a : b) : e;
      c[i * 3] = q.r; c[i * 3 + 1] = q.g; c[i * 3 + 2] = q.b; void tri; }
    g.setAttribute('color', new T.BufferAttribute(c, 3)); g.deleteAttribute('uv');
    const hoops = [cy(0.585, 0.585, 0.09, 16, COL.steel, [0, 0.38, 0]), cy(0.585, 0.585, 0.09, 16, COL.steel, [0, -0.38, 0])].map((h) => (h.deleteAttribute('uv'), h));
    return tf(mergeG([g, ...hoops]), [0, 0.55, 0], [0, 0, Math.PI / 2]);
  }

  // ---------------- the bridge (one static merged mesh: curbs, rails, towers, cables, hangers) ----------------
  function bridgeGeo() {
    const k = K(), RW = k.RW * U, z0 = 14, z1 = -(k.STOP_D + 2300) * U, L = z0 - z1, zc = (z0 + z1) / 2, g = [];
    g.push(bx(0.5, 0.18, L, COL.curb, [-RW - 0.15, 0.09, zc]), bx(0.5, 0.18, L, COL.curb, [RW + 0.15, 0.09, zc]), bx(RW * 2 + 1.5, 1.1, L, 0x6d737d, [0, -0.7, zc]));   // curbs + the deck's steel body
    for (const sx of [-1, 1]) { const x = sx * (RW + 0.55); g.push(bx(0.12, 0.12, L, COL.rail, [x, 1.05, zc]), bx(0.12, 0.12, L, COL.rail, [x, 0.6, zc]));
      for (let z = z0; z > z1; z -= 2.4) g.push(bx(0.14, 1.15, 0.14, COL.rail2, [x, 0.57, z])); }
    const towers = [1200, 2400, 3600, 4800, 6000, 7200].map((d) => -d * U), TX = RW + 3.0, TH = 30;
    for (const z of towers) { for (const sx of [-1, 1]) g.push(bx(1.1, TH, 1.0, COL.rail, [sx * TX, TH / 2 - 8, z]), bx(2.0, 14, 1.8, 0x7a2018, [sx * TX, -9.5, z]), bx(1.7, 0.6, 1.5, COL.rail2, [sx * TX, TH - 8.3, z]));
      for (const y of [27, 21.5]) g.push(bx(TX * 2 + 1.5, 1.3, 1.0, COL.rail, [0, y, z])); }
    // main cables: tower tops → sag in the span → anchors; hangers every 2.2 m
    const nodes = [[z0, 1.2], ...towers.map((z) => [z, TH - 8]), [z1, 1.2]];
    for (const sx of [-1, 1]) { const x = sx * TX, pts = [];
      for (let i = 0; i < nodes.length - 1; i++) { const [za, ya] = nodes[i], [zb, yb] = nodes[i + 1], mid = i > 0 && i < nodes.length - 2;
        for (let j = 0; j <= 16; j++) { const s = j / 16, z = za + (zb - za) * s, y = ya + (yb - ya) * s - (mid ? (Math.min(ya, yb) - 3.2) * 4 * s * (1 - s) : 0); if (i === 0 || j > 0) pts.push(new T.Vector3(x, y, z));
          if (j % 3 === 0 && j > 0 && j < 16 && y > 1.8) g.push(bx(0.06, y - 1.0, 0.06, COL.rail2, [x, 1.0 + (y - 1.0) / 2, z])); } }
      g.push(col(new T.TubeGeometry(new T.CatmullRomCurve3(pts), pts.length * 2, 0.16, 5), COL.rail2)); }
    return mergeG(g.map((q) => (q.index ? q.toNonIndexed() : q)));
  }

  // ---------------- soldier rigs: recolour the CC0 palette texture per team (helmet + vest, pants) ----------------
  function recolor(rules, g = gltf) {
    let mat; g.scene.traverse((o) => { if (o.isMesh && !mat) mat = o.material; });
    const img = mat.map.image, c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const id = x.getImageData(0, 0, c.width, c.height), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), df = mx - mn; let h = 0;
      if (df) { h = mx === r ? ((g - b) / df) % 6 : mx === g ? (b - r) / df + 2 : (r - g) / df + 4; h *= 60; if (h < 0) h += 360; }
      const s = mx ? df / mx : 0;
      for (const q of rules) if (h >= q.h[0] && h <= q.h[1] && s >= q.s && mx >= (q.v || 0) && mx <= (q.vmax || 1)) { const kf = clamp(mx / q.vref, q.kmin || 0, 1.5); d[i] = clamp(q.to[0] * kf, 0, 255); d[i + 1] = clamp(q.to[1] * kf, 0, 255); d[i + 2] = clamp(q.to[2] * kf, 0, 255); break; } }
    x.putImageData(id, 0, 0); const t = new T.CanvasTexture(c); t.flipY = false; t.colorSpace = mat.map.colorSpace; t.magFilter = t.minFilter = T.NearestFilter; t.generateMipmaps = false;
    const m = mat.clone(); m.map = t; m.envMapIntensity = 0.4; m.metalness = 0.1; return m;
  }
  const hexRGB = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  function makeRig(mat, shadow, g = gltf) { const r = KIT.rig(g, { shadow }); r.root.traverse((o) => { if (o.isMesh) o.material = mat; if (o.isBone && /^Index1\.?R$/.test(o.name)) r.hand = o; if (o.isBone && o.name === 'Head') r.head = o; });
    r.root.visible = false; scene.add(r.root); return r; }

  S.init = async (gl, hudCv, W, H) => {
    K_ = KIT; VW = W; VH = H; R = KIT.renderer(gl, W, H); R.info.autoReset = false; KIT.H.init(hudCv, W, H);
    R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
    scene = new T.Scene(); scene.fog = new T.Fog(COL.sky, 24, 75); cam = new T.PerspectiveCamera(45, W / H, 0.5, 150);
    scene.background = tex(4, 256, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#7fbff0'); gr.addColorStop(1, '#d9ecf7'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
    scene.add(new T.HemisphereLight(0xbfe3ff, 0x6b7380, 0.95));
    { const es = new T.Scene(), sky = new T.Mesh(new T.SphereGeometry(30, 24, 16), new T.MeshBasicMaterial({ side: T.BackSide, vertexColors: true })), p = sky.geometry.attributes.position, c = new Float32Array(p.count * 3), c1 = new T.Color(), c2 = new T.Color();
      for (let i = 0; i < p.count; i++) { const f = (p.getY(i) / 30 + 1) / 2; c1.set(0xd9ecf7).lerp(c2.set(0x5aa8e8), f); c[i * 3] = c1.r; c[i * 3 + 1] = c1.g; c[i * 3 + 2] = c1.b; }
      sky.geometry.setAttribute('color', new T.BufferAttribute(c, 3)); es.add(sky);
      for (const [cl, m, ps] of [[0xfff1dc, 3.0, [-10, 12, 8]], [0xbfe3ff, 1.4, [10, 6, -8]]]) { const pl = new T.Mesh(new T.PlaneGeometry(14, 9), new T.MeshBasicMaterial({ color: new T.Color(cl).multiplyScalar(m), side: T.DoubleSide })); pl.position.set(...ps); pl.lookAt(0, 0, 0); es.add(pl); }
      const pm = new T.PMREMGenerator(R); scene.environment = pm.fromScene(es, 0.03).texture; pm.dispose(); }
    sun = new T.DirectionalLight(0xfff1dc, 2.3); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 50 }); sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.02; scene.add(sun, sun.target);
    const rim = new T.DirectionalLight(0xbfe3ff, 0.9); rim.position.set(6, 8, -12); scene.add(rim);                           // back light: silhouettes pop off the road
    // ---- road (asphalt + white edge lines + dashed centre), sea, bridge ----
    const RWm = K().RW * U * 2, Lz = (K().STOP_D + 2300) * U + 14, zc = (14 - (K().STOP_D + 2300) * U) / 2;
    const roadT = tex(256, 256, (c, w, h) => { c.fillStyle = '#80868f'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(40,46,56,0.35)'; c.fillRect(0, 0, w, 3); for (let i = 0; i < 2600; i++) { const v = 130 + h1(i) * 28; c.fillStyle = `rgba(${v},${v + 4},${v + 10},0.5)`; c.fillRect(h1(i + 9) * w, h1(i + 5) * h, 2, 2); }
      c.fillStyle = '#eef0f3'; c.fillRect(w * 0.02, 0, 6, h); c.fillRect(w * 0.98 - 6, 0, 6, h); c.fillRect(w * 0.5 - 4, h * 0.08, 8, h * 0.36); c.fillRect(w * 0.5 - 4, h * 0.58, 8, h * 0.36); }, [1, Lz / 3]);
    const road = new T.Mesh(new T.PlaneGeometry(RWm, Lz), new T.MeshLambertMaterial({ map: roadT })); road.rotation.x = -Math.PI / 2; road.position.set(0, 0.002, zc); scene.add(road);
    const seaT = tex(128, 128, (c, w, h) => { c.fillStyle = '#2a7fc4'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(190,230,255,0.35)'; c.lineWidth = 2; for (let i = 0; i < 26; i++) { const x = h1(i) * w, y = h1(i + 40) * h; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 10, y - 4, x + 22, y); c.stroke(); } }, [60, 60]);
    P.seaT = seaT; const sea = new T.Mesh(new T.PlaneGeometry(500, 500), new T.MeshBasicMaterial({ map: seaT, fog: true })); sea.rotation.x = -Math.PI / 2; sea.position.set(0, -9, zc); scene.add(sea);
    scene.add(new T.Mesh(bridgeGeo(), KIT.vmat));
    // ---- soldier rigs (CC0): 24 squad + 3 on the first barrels; the boss is the CC0 Giant, skin recoloured red ----
    gltf = await KIT.model('soldier');
    const blueM = recolor([{ h: [70, 100], s: 0.2, vref: 0.43, to: hexRGB(COL.blue) }, { h: [41, 50], s: 0.45, v: 0.5, vref: 0.6, to: hexRGB(COL.blueD) }, { h: [0, 360], s: 0, vmax: 0.3, vref: 0.2, kmin: 0.62, to: [78, 104, 158] }, { h: [0, 360], s: 0, v: 0.4, vmax: 0.7, vref: 0.55, to: hexRGB(COL.tan) }]);
    gGiant = await KIT.model('giant');
    const bossM = recolor([{ h: [300, 360], s: 0.1, vref: 0.5, to: [222, 62, 44] }], gGiant);   // skin → boss red (the loincloth, brows and eyes stay as authored)
    for (let i = 0; i < K().CC0_MAX; i++) P.free.push(makeRig(blueM, false)); for (let i = 0; i < 3; i++) P.wave.push(makeRig(blueM, false));
    P.boss = makeRig(bossM, true, gGiant); P.bossM = bossM;
    // ---- instanced kinds: chibis (blue overflow / red crowd), guns, barrels, FX ----
    const mk = (geo, mat, n, sh) => new KIT.Pool(scene, geo, mat, n, { shadow: !!sh }), basic = (o) => new T.MeshBasicMaterial(Object.assign({ toneMapped: false, depthWrite: false, transparent: true }, o));
    for (const [nm, shirt, helmet, pants, sleeve, hand, skin, n] of [['b', COL.blue, COL.blue, COL.blueD, 0x252429, COL.skin, COL.skin, 40], ['r', COL.tan, COL.red, COL.redD, COL.skin, COL.skin, COL.skin, 380]])
      P['top' + nm] = mk(chibiTop(shirt, helmet, skin), KIT.vmat, n), P['leg' + nm] = mk(chibiLeg(pants, 0x2b2e33), KIT.vmat, n * 2), P['arm' + nm] = mk(chibiArm(sleeve, hand), KIT.vmat, n * 2);
    P.ghost = mk(mergeG([chibiTop(0xffffff, 0xffffff, 0xffffff), tf(chibiLeg(0xffffff, 0xffffff), [-0.1, 0.34, 0]), tf(chibiLeg(0xffffff, 0xffffff), [0.1, 0.34, 0]),
      tf(chibiArm(0xffffff, 0xffffff), [-0.28, 0.78, 0], [0, 0, -2.5]), tf(chibiArm(0xffffff, 0xffffff), [0.28, 0.78, 0], [0, 0, 2.5])]), basic({ color: 0xffffff, opacity: 0.34 }), 170);
    P.gun = [0, 1, 2].map((i) => mk(gunGeo(i), KIT.vmat, 48));
    P.ammo = mk(mergeG([bx(0.3, 0.26, 0.18, 0x5a6340), bx(0.32, 0.05, 0.2, 0xe0b040, [0, 0.07, 0]), bx(0.32, 0.05, 0.2, 0xe0b040, [0, -0.07, 0])]), KIT.vmat, 48);
    P.barrel = mk(barrelGeo(), KIT.vmat, 12, false);
    P.blob = mk(new T.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 260);
    P.bits = mk(new T.BoxGeometry(1, 1, 1), new T.MeshLambertMaterial({ flatShading: true }), 500);
    P.tracer = mk(new T.BoxGeometry(0.08, 0.08, 1.7), basic({ color: COL.tracer, depthWrite: true }), 60);
    P.flash = mk(new T.IcosahedronGeometry(0.5, 0), basic({ color: 0xffb030, blending: T.AdditiveBlending, opacity: 0.95, depthTest: false }), 120); P.flash.im.renderOrder = 5;
    P.ring = mk(new T.RingGeometry(0.78, 1, 24).rotateX(-Math.PI / 2), basic({ color: 0xffffff, opacity: 0.85, side: T.DoubleSide }), 60);
    P.vring = mk(new T.RingGeometry(0.82, 1, 24), basic({ color: 0xffffff, opacity: 0.85, side: T.DoubleSide }), 40);
    P.dust = mk(new T.IcosahedronGeometry(1, 0), new T.MeshLambertMaterial({ flatShading: true, transparent: true, opacity: 0.3, depthWrite: false, color: 0xe6dccb }), 40);
    // weapon pickups over the weapon barrels: spinning gun + green outline (inverted hull) + glow ring on the road
    const olM = new T.MeshBasicMaterial({ color: 0x3dff6a, side: T.BackSide, toneMapped: false });
    P.pick = [1, 2].map((i) => { const g = gunGeo(i), m = new T.Mesh(g, KIT.vmat), o = new T.Mesh(g, olM); o.scale.setScalar(1.09); m.add(o); m.visible = false; scene.add(m); return m; });
    // gates: frame + glass tinted by the live value
    P.gates = SIM.LEVEL.gates.map((g) => { const grp = new T.Group(), gm = new T.MeshBasicMaterial({ transparent: true, opacity: 0.4, depthWrite: false, side: T.DoubleSide, toneMapped: false }), gl = new T.Mesh(new T.PlaneGeometry(3.2, 2.3), gm);
      gl.position.y = 1.35; grp.add(gl, new T.Mesh(mergeG([bx(0.22, 2.6, 0.26, 0xe9edf2, [-1.7, 1.3, 0]), bx(0.22, 2.6, 0.26, 0xe9edf2, [1.7, 1.3, 0]), bx(3.8, 0.24, 0.3, 0xe9edf2, [0, 2.55, 0]), bx(3.6, 0.12, 0.3, 0xe9edf2, [0, 0.06, 0])]), KIT.vmat));
      grp.position.set(g.x * U, 0, g.y * U); scene.add(grp); return { grp, gm }; });
    // endcard pass (own scene): dim, hero soldier on a podium, confetti
    end.scene = new T.Scene(); end.cam = new T.PerspectiveCamera(30, W / H, 0.1, 100); end.scene.add(new T.HemisphereLight(0xffffff, 0x886644, 2.0)); const l = new T.DirectionalLight(0xffffff, 2); l.position.set(2, 4, 5); end.scene.add(l);
    end.rig = makeRig(blueM, false); scene.remove(end.rig.root); end.scene.add(end.rig.root); end.rig.root.visible = true;
    end.pod = new T.Mesh(mergeG([cy(0.7, 0.8, 0.4, 14, 0x7a5a38, [0, -0.2, 0]), cy(0.68, 0.68, 0.03, 14, 0xf0d070, [0, 0.0, 0])]), KIT.vmat); end.scene.add(end.pod);
    end.top = new KIT.Pool(end.scene, P.topb.im.geometry, KIT.vmat, 14); end.leg = new KIT.Pool(end.scene, P.legb.im.geometry, KIT.vmat, 28); end.arm = new KIT.Pool(end.scene, P.armb.im.geometry, KIT.vmat, 28);
    end.conf = new KIT.Pool(end.scene, new T.BoxGeometry(0.06, 0.1, 0.01), new T.MeshBasicMaterial(), 90);
    end.dim = new T.Mesh(new T.PlaneGeometry(2, 2), new T.MeshBasicMaterial({ color: 0x06100a, transparent: true, depthTest: false })); end.dim.position.z = -0.5;
    end.dimScene = new T.Scene(); end.dimScene.add(end.dim); end.dimCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    for (const n of Object.keys((window.BUILD || {}).images || {})) KIT.H.img[n] = await KIT.image(n);
    return S;
  };

  // ---------------- per-frame helpers ----------------
  const POOLS = () => [P.topb, P.legb, P.armb, P.topr, P.legr, P.armr, P.ghost, P.gun[0], P.gun[1], P.gun[2], P.ammo, P.barrel, P.blob, P.bits, P.tracer, P.flash, P.ring, P.vring, P.dust];
  // a procedural soldier: ph = run phase, run 0..1 amplitude, gunW = weapon index (or −1), arm = 'swing' | 'aim' | 'wave'
  function chibi(set, x, y, z, s, ph, run, gunW, arm, GT, id, rate) {
    const sw = Math.sin(ph) * 0.75 * run, b = Math.abs(Math.sin(ph)) * 0.06 * run * s;
    set.top.add(x, y + b, z, s, s, s, -0.1 * run, 0, 0);
    set.leg.add(x - 0.1 * s, y + 0.34 * s + b, z, s, s, s, sw, 0, 0); set.leg.add(x + 0.1 * s, y + 0.34 * s + b, z, s, s, s, -sw, 0, 0);
    const ay = y + 0.78 * s + b;
    if (arm === 'wave') { set.arm.add(x - 0.28 * s, ay, z, s, s, s, 3.0 + 0.3 * Math.sin(GT * 12 + id), 0, -0.25); set.arm.add(x + 0.28 * s, ay, z, s, s, s, -sw * 0.6, 0, 0.1); }
    else if (gunW >= 0) { set.arm.add(x + 0.28 * s, ay, z, s, s, s, -1.35, 0, 0); set.arm.add(x - 0.26 * s, ay, z, s, s, s, -1.2, 0, 0.35);
      P.gun[gunW].add(x + 0.18 * s, y + 0.62 * s + b, z - 0.12 * s, GUNS[gunW] * s, GUNS[gunW] * s, GUNS[gunW] * s, 0, 0, 0);
      const f = ((GT + 0.137 * id) * rate) % 1; if (f < 0.5) { const q = 1 - f / 0.5; P.flash.add(x + 0.18 * s, y + 0.95 * s + b, z - (0.12 + 0.95 * GUNS[gunW]) * s, 0.9 * q, 0.9 * q, 0.9 * q); } }
    else { set.arm.add(x - 0.28 * s, ay, z, s, s, s, sw * 0.8, 0, 0.1); set.arm.add(x + 0.28 * s, ay, z, s, s, s, -sw * 0.8, 0, -0.1); }
  }
  function pose(r, clip, tt, x, y, z, sc, yaw, once) { r.root.visible = true; r.root.position.set(x, y, z); r.root.rotation.set(0, yaw, 0); r.root.scale.setScalar(sc); r.play(clip, tt, once); r.root.updateMatrixWorld(true); }
  function rigGun(r, w, sc, GT, id, rate) {               // a gun follows the rig's right hand (orientation fixed: muzzle forward)
    V3.setFromMatrixPosition(r.hand.matrixWorld); P.gun[w].add(V3.x - 0.02, V3.y + 0.1 * sc, V3.z - 0.12, GUNS[w] * sc, GUNS[w] * sc, GUNS[w] * sc, 0, 0, 0);
    const f = ((GT + 0.137 * id) * rate) % 1; if (rate > 0 && f < 0.5) { const q = 1 - f / 0.5; P.flash.add(V3.x - 0.02, V3.y + 0.5 * sc, V3.z - (0.12 + 0.95 * GUNS[w] * sc), 0.9 * q, 0.9 * q, 0.9 * q); } }

  S.render = (t) => {
    const ST = S.state || SIM.at(t), GT = ST.t, k = K(), W_ = k.W[ST.weapon], moving = ST.d < k.STOP_D - 2; S.cur = ST;
    for (const p of POOLS()) p.begin();
    const B = { top: P.topb, leg: P.legb, arm: P.armb }, Rd = { top: P.topr, leg: P.legr, arm: P.armr }, shooting = ST.end < 0 && !(ST.boss && ST.boss.st === 'dead');
    // ---- squad: first CC0_MAX alive units are CC0 rigs (slot kept per unit id), the rest blue chibis; dying units play Death then sink ----
    const want = new Set(), list = [], over = []; let rank = 0;
    for (const u of ST.units) { if (u.dead < 0) { if (rank++ < k.CC0_MAX) { want.add(u.id); list.push(u); } else over.push(u); } else if (GT - u.dead < 1.2 && P.rigOf.has(u.id)) { want.add(u.id); list.push(u); } else if (GT - u.dead < 0.7) over.push(u); }
    for (const [id, r] of P.rigOf) if (!want.has(id)) { r.root.visible = false; P.free.push(r); P.rigOf.delete(id); }
    for (const u of list) if (!P.rigOf.has(u.id)) { const r = P.free.pop(); if (r) P.rigOf.set(u.id, r); else over.push(u); }
    for (const u of list) { const r = P.rigOf.get(u.id); if (!r) continue; const a = GT - u.dead, q = (GT - u.born) / k.LAND_T, x = u.x * U, z = u.y * U;
      if (u.dead >= 0) { pose(r, 'Death', a, x, -0.5 * SS(0.9, 1.2, a), z, RS, Math.PI, true); continue; }
      const arc = q < 1 ? Math.sin(q * Math.PI) * 1.2 : 0; pose(r, q < 1 ? 'Wave' : moving ? 'Run_Gun' : 'Idle_Shoot', GT * (moving ? 1.5 : 1) + u.id * 0.31, x, arc, z, RS, Math.PI, false);
      if (shooting && q >= 1) rigGun(r, ST.weapon, RS, GT, u.id, W_.rate); else if (shooting) rigGun(r, ST.weapon, RS, GT, u.id, 0); if (shooting && ST.weapon === 2) P.ammo.add(x, arc + 0.62, z + 0.2, 1.3, 1.3, 1.3, 0, 0, 0, 0xffffff); P.blob.add(x, 0.02, z, 0.6, 1, 0.6); }
    for (const u of over) { const a = GT - u.dead, q = (GT - u.born) / k.LAND_T, x = u.x * U, z = u.y * U, ph = GT * 14 + u.id * 1.9;
      if (u.dead >= 0) { const f = 1 - SS(0.2, 0.7, a); P.topb.add(x, -0.5 * (1 - f), z, f, f, f, 0, 0, 1.2 * (1 - f)); continue; }
      chibi(B, x, q < 1 ? Math.sin(q * Math.PI) * 1.2 : 0, z, RS, ph, moving ? 1 : 0, shooting ? ST.weapon : -1, 'gun', GT, u.id, W_.rate); if (shooting && ST.weapon === 2 && u.dead < 0) P.ammo.add(x, 0.5 * RS / 0.72, z + 0.18, 1.0, 1.0, 1.0); P.blob.add(x, 0.02, z, 0.6, 1, 0.6); }
    // ---- red crowd (run, then rise as white ghosts); minions look the same ----
    for (const e of ST.enemies) { if (e.st === 3 || (e.st < 2 && e.y < ST.cam[1] - 2000)) continue; const x0 = e.x * U, z0 = e.y * U,   // far ahead = beyond the top edge of the view: not drawn

        offs = e.wv === 1 ? [[0, 0], [(h1(e.id * 3.1) - 0.5) * 0.9, (h1(e.id * 5.3) - 0.5) * 0.7 + 0.45], [(h1(e.id * 7.7) - 0.5) * 0.9, (h1(e.id * 9.1) - 0.5) * 0.7 - 0.45]] : [[0, 0]];   // decor chibis: the wave reads as a horde at no sim cost
      if (e.st === 2) { const a = GT - e.dt; if (a < 0.7) { for (const [ox, oz] of offs) { const s = RSR * (1 + 0.25 * a / 0.7); P.ghost.add(x0 + ox, 0.15 + 1.2 * ease(a / 0.7), z0 + oz, s, s, s, 0, 0, 0); }
          if (a < 0.25) P.ring.add(x0, 0.05, z0, 0.3 + 1.2 * a / 0.25, 1, 0.3 + 1.2 * a / 0.25, 0, 0, 0, 0xdfe8f2); } continue; }
      offs.forEach(([ox, oz], j) => chibi(Rd, x0 + ox, 0, z0 + oz, RSR, GT * 15 + e.id * 1.3 + j * 2.1, e.st === 1 ? 1 : 0, -1, 'swing', GT, e.id, 1)); P.blob.add(x0, 0.02, z0, 0.9, 1, 0.9); }
    // ---- barrels: squash on a hit, staves fly when shot and the pieces stay on the road; recruits wave on top ----
    let wi = 0;
    for (const b of ST.barrels) { const x = b.x * U, z = b.y * U;
      if (b.st === 0) { const sq = 1 + 0.07 * (1 - clamp((GT - b.lastHit) / 0.09, 0, 1)); P.barrel.add(x, 0, z, sq, 1 / sq, sq); P.blob.add(x, 0.02, z, 1.6, 1, 1.4);
        if (b.rew.recruit) { if (b.kind.startsWith('r1') && wi < P.wave.length) pose(P.wave[wi++], 'Wave', GT + b.id * 0.4, x, 1.1, z, RS, 0, false);
          else if (b.kind === 'r2') for (let j = 0; j < b.rew.recruit; j++) chibi(B, x + (j - (b.rew.recruit - 1) / 2) * 0.4, 1.1, z, RS * 0.85, 0, 0, -1, 'wave', GT, b.id * 5 + j, 1); }
        else { const m = P.pick[b.rew.weapon - 1], gs = b.rew.weapon === 2 ? 2.4 : 2.7; m.visible = true; m.position.set(x, 1.7 + 0.1 * Math.sin(GT * 3), z); m.rotation.set(0, GT * 1.6, 0.0); m.scale.setScalar(gs); P.ring.add(x, 0.06, z, 1.1 + 0.15 * Math.sin(GT * 4), 1, 1.1 + 0.15 * Math.sin(GT * 4), 0, 0, 0, 0x7dff9a); } }
      else { const a = GT - b.brk; if (b.rew.weapon) P.pick[b.rew.weapon - 1].visible = false;
        for (let j = 0; j < 9; j++) { const an = j * 0.7 + b.id, v = 1.1 + 1.6 * h1(b.id * 9 + j), f = Math.min(a, 0.8), rest = a > 0.8;
          P.bits.add(x + Math.cos(an) * v * f, rest ? 0.06 : Math.max(0.06, 0.6 + 3.2 * f - 5 * f * f), z + Math.sin(an) * v * f, 0.5, 0.1, 0.12, rest ? 0 : a * 6, an, 0, j % 2 ? COL.wood : COL.wood2); }
        if (a < 0.4) P.dust.add(x, 0.3 + a, z, 0.3 + 0.9 * a, 0.3 + 0.9 * a, 0.3 + 0.9 * a); } }
    for (; wi < P.wave.length; wi++) P.wave[wi].root.visible = false;
    for (const m of P.pick) if (!ST.barrels.some((b) => b.st === 0 && b.rew.weapon && P.pick[b.rew.weapon - 1] === m)) m.visible = false;
    for (const p of ST.pickups) { const q = clamp((GT - p.t0) / 0.4, 0, 1), m = P.pick[p.w - 1]; m.visible = true; m.position.set((p.x + (ST.x - p.x) * q) * U, 1.7 + Math.sin(q * Math.PI) * 2, (p.y + (-ST.d - p.y) * q) * U); m.scale.setScalar(2.6 * (1 - 0.6 * q)); m.rotation.y = GT * 6; }
    // ---- gates: tint follows the value; ripple rings where bullets land ----
    ST.gates.forEach((g, i) => { const G = P.gates[i]; if (!G) return; G.grp.visible = !g.passed; const f = clamp((g.val + 3) / 6, 0, 1), c = new T.Color(COL.gate[0]).lerp(new T.Color(COL.gate[1]), g.op === 'x' ? 1 : f);
      G.gm.color.copy(c); G.gm.opacity = 0.7 + 0.25 * (1 - clamp((GT - g.lastHit) / 0.12, 0, 1)); });
    // ---- bullets, flashes, hit rings ----
    { const keep = Math.min(1, 14 / Math.max(1, ST.bullets.length)); for (const b of ST.bullets) if (keep >= 1 || h1(b.x * 0.131 + 7.7) < keep) P.tracer.add(b.x * U, 0.9, b.y * U, 1, 1, 1); }
    for (const h of ST.hits) { if (!h) continue; const a = GT - h[3]; if (a < 0 || a > 0.22) continue; const q = a / 0.22, hy = 0.5 + 1.6 * h1(h[0] * 0.13 + h[3] * 7);
      if (h[2] === 2) P.vring.add(h[0] * U, hy, h[1] * U + 0.1, 0.15 + 0.5 * q, 0.15 + 0.5 * q, 1, 0, 0, 0, 0xfff6c0);
      else if (h[2] === 1) { const s = 0.12 + 0.4 * q; P.ring.add(h[0] * U, 0.9, h[1] * U, s, 1, s, 0, 0, 0, 0xffd24a); }
      else if (h[2] === 3 && h1(h[3] * 91 + h[0]) < 0.2) { const s = 0.5 * (1 - q); P.flash.add(h[0] * U * 0.7, 1.2 + hy * 0.6, h[1] * U + 0.2, s, s, s); } }
    // ---- boss: CC0 Giant (clips Walk / Attack / HitRecieve / Death), grows in on entrance ----
    const bs = ST.boss, BR = P.boss; BR.root.visible = !!bs && ST.end < 0;
    if (bs) { const a = GT - bs.t0, atk = bs.st === 'windup' || bs.st === 'stomp', clip = bs.st === 'dead' ? 'Death' : atk ? 'Attack' : bs.st === 'stagger' ? 'HitRecieve' : 'Walk', dur = (BR.acts[clip] || { getClip: () => ({ duration: 1 }) }).getClip().duration;
      const tt = atk ? ((bs.st === 'stomp' ? k.BOSS_WIND : 0) + a) * dur / (k.BOSS_WIND + 0.45) : bs.st === 'dead' ? a : bs.st === 'stagger' ? a * dur / 0.6 : GT * 1.1;   // Attack plays across wind-up + stomp
      const bgr = SS(0, 0.55, GT - ST.arenaT);   // entrance: drops in from above and grows over 0.55 s, lands with a ring and a shake
      pose(BR, clip, tt, bs.x * U, (bs.st === 'dead' ? -2.2 * SS(1.0, 1.8, a) : 0) + 7 * (1 - ease(bgr)), bs.y * U, BOSS_S * (0.45 + 0.55 * bgr), 0, bs.st === 'dead' || atk || bs.st === 'stagger');
      const flash = GT - bs.lastHit < 0.12 && (GT * 6) % 1 < 0.25 ? 0.25 : 0; P.bossM.emissive.setRGB(flash, flash * 0.85, flash * 0.7);
      P.blob.add(bs.x * U, 0.02, bs.y * U, 3.6, 1, 2.8);
      if (bs.st === 'windup') { const q = clamp(a / k.BOSS_WIND, 0, 1); P.ring.add(bs.x * U, 0.06, bs.y * U + 2.8, 1.2 + 1.6 * (1 - q), 1, 1.2 + 1.6 * (1 - q), 0, 0, 0, 0xe0281c); } }
    for (const e of ST.ev) { const a = GT - e.t; if (a < 0) continue;
      if (e.k === 'stomp' && a < 0.6) { const r = 0.8 + 4.6 * ease(a / 0.6); P.ring.add(e.x * U, 0.07, e.y * U + 2.8, r, 1, r, 0, 0, 0, a < 0.3 ? 0xfff4c8 : 0xc9ced6); }
      if (e.k === 'gate' && a < 0.5) for (let j = 0; j < 14; j++) { const an = j / 14 * 6.28, v = 2 + 3 * h1(j + e.id), f = a; P.bits.add(e.x * U + Math.cos(an) * v * f, 0.8 + 3 * f - 5 * f * f, e.y * U + Math.sin(an) * v * f * 0.6, 0.14, 0.14, 0.14, f * 9, an, 0, e.val > 0 ? 0x6ab4ff : 0xff6a50); }
      if (e.k === 'bossDie' && a < 0.8) { const r = 5 * ease(Math.min(1, a / 0.25)) * (1 - SS(0.25, 0.8, a)), rr = 1 + 9 * ease(a / 0.8); P.flash.add(e.x * U, 2.2, e.y * U + 0.4, r, r, r);
        P.ring.add(e.x * U, 0.08, e.y * U + 0.4, rr, 1, rr, 0, 0, 0, 0xfff4c8); P.ring.add(e.x * U, 0.09, e.y * U + 0.4, rr * 0.6, 1, rr * 0.6, 0, 0, 0, 0xffd24a);
        for (let j = 0; j < 60; j++) { const an = j * 0.37, v = 2 + 5 * h1(j + 3), f = a; P.bits.add(e.x * U + Math.cos(an) * v * f, Math.max(0.1, 1.5 + 6 * f - 7 * f * f), e.y * U + Math.sin(an) * v * f * 0.8, 0.16, 0.16, 0.04, f * 9 + j, an, 0, [0xffd84a, 0x3ba0ff, 0xff5a4a, 0x7dff9a][j % 4]); } }
      if (e.k === 'boss' && a > 0.5 && a < 1.1) { const r = 1.5 + 7 * (a - 0.5) / 0.6; P.ring.add(e.x * U, 0.07, e.y * U + 2.6, r, 1, r, 0, 0, 0, a < 0.7 ? 0xfff4c8 : 0xc9ced6); }
      if (e.k === 'recruit' && a < 0.45) P.ring.add(e.x * U, 0.06, e.y * U, 0.4 + 0.9 * a / 0.45, 1, 0.4 + 0.9 * a / 0.45, 0, 0, 0, 0x2f9bff); }
    for (const p of POOLS()) p.end();
    // ---- camera: the sim's look point + zoom → a tilted follow camera; trauma shake from events; FOV punch on the weapon swap ----
    let tr = 0, punch = 0; for (const e of ST.ev) { const a = GT - e.t; if (a < 0) continue; if (e.k === 'stomp' && a < 0.5) tr = Math.max(tr, 1 - a / 0.5); if (e.k === 'bossDie' && a < 0.8) tr = Math.max(tr, 0.8 * (1 - a / 0.8)); if (e.k === 'boss' && a > 0.5 && a < 1.0) tr = Math.max(tr, 0.9 * (1 - (a - 0.5) / 0.5)); if (e.k === 'weapon' && a < 0.4) punch = Math.max(punch, 4 * (1 - a / 0.4)); if ((e.k === 'gate' || e.k === 'boss') && a < 0.35) punch = Math.max(punch, 3 * (1 - a / 0.35)); }
    const sh = 0.18 * tr * tr, tx = ST.cam[0] * U + sh * Math.sin(GT * 83), tz = ST.cam[1] * U + sh * Math.sin(GT * 101 + 1), dist = 17 / ST.zoom, pitch = 0.84;
    cam.fov = 45 + punch; cam.updateProjectionMatrix(); cam.position.set(tx, Math.sin(pitch) * dist, tz + Math.cos(pitch) * dist); cam.lookAt(tx, 0, tz);
    sun.position.set(tx - 6, 14, tz + 5); sun.target.position.set(tx, 0, tz - 2); sun.target.updateMatrixWorld(); P.seaT.offset.y = -GT * 0.02;
    R.info.reset(); R.autoClear = true; R.render(scene, cam);
    // ---- endcard: dim the world, then the hero soldier on a podium (win: waves + confetti) ----
    if (ST.end >= 0) { const a = GT - ST.end, kk = SS(0, 0.45, a), sm = clamp((a - 0.35) / 0.35, 0, 1);
      end.dim.material.opacity = 0.5 * kk; R.autoClear = false; R.render(end.dimScene, end.dimCam);
      if (sm > 0) { const oy = (VH - 1920) / 2, yf = 1070 + oy, yh = yf - 520 * (sm < 1 ? 1.12 * ease(sm) - 0.12 * sm * sm : 1), A = Math.tan(15 * Math.PI / 180), dA = VH * 1.86 * 0.85 / (2 * (yf - yh)), d = dA / A, cy0 = (2 * yf / VH - 1) * dA;
        end.rig.root.scale.setScalar(VH < 2100 ? 0.7 : 0.78); end.rig.root.position.y = 0.01; end.rig.root.rotation.y = 0.25 * Math.sin(GT * 0.8); end.rig.play(ST.endWhy === 'win' ? 'Wave' : 'Idle_Shoot', a); end.rig.root.updateMatrixWorld(true);
        for (const p of [end.top, end.leg, end.arm]) p.begin(); if (ST.endWhy !== 'lose') for (let j = 0; j < Math.min(ST.n, 12); j++) chibi({ top: end.top, leg: end.leg, arm: end.arm }, (j % 2 ? 1 : -1) * (0.75 + Math.floor(j / 2) * 0.42), 0, -1.3 - Math.floor(j / 2) * 0.55, 0.7, 0, 0, -1, ST.endWhy === 'win' ? 'wave' : 'swing', GT + j * 0.3, j, 1); for (const p of [end.top, end.leg, end.arm]) p.end();
        end.conf.begin(); if (ST.endWhy === 'win') for (let j = 0; j < 90; j++) { const ph = (a * 0.35 + h1(j)) % 1; end.conf.add((h1(j + 3) - 0.5) * 3.2, 3.2 - ph * 3.4, (h1(j + 7) - 0.5) * 1.5, 1, 1, 1, ph * 9 + j, ph * 5, 0, [0xffd84a, 0x3ba0ff, 0xff5a4a, 0x7dff9a][j % 4]); } end.conf.end();
        end.cam.position.set(0, cy0, d); end.cam.lookAt(0, cy0, 0); R.clearDepth(); R.render(end.scene, end.cam); }
      R.autoClear = true; }
    S.proj = (x, y, h) => KIT.proj(cam, x * U, h, y * U, VW, VH);
    HUD.draw(ST, t, S.proj);
    S.hit = HUD.hit;
  };

  S.debugScene = () => scene;   // dev/QA: lets a test list what is drawn
  S.stats = () => ({ calls: R.info.render.calls, tris: R.info.render.triangles });
  // numbers instead of screenshots: draw calls, triangles, the hero's screen box (= the visible squad, share of the view), HUD boxes off-screen / overlapping
  S.probe = () => { const ST = S.cur; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
    for (const u of ST.units) { if (u.dead >= 0) continue; for (const h of [0, 1.1]) { const p = KIT.proj(cam, u.x * U, h, u.y * U, VW, VH); if (!p) continue; n++; x0 = Math.min(x0, p[0] - 28); x1 = Math.max(x1, p[0] + 28); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } }
    const b = n ? [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)] : null, c = HUD.check();
    return { calls: R.info.render.calls, tris: R.info.render.triangles, hero: b, heroH: b ? +((b[3] - b[1]) / VH * 100).toFixed(1) : 0, heroY: b ? +(((b[1] + b[3]) / 2) / VH * 100).toFixed(0) : 0,
      heroOn: !!b && b[0] >= 0 && b[2] <= VW && b[1] >= 0 && b[3] <= VH, hudOut: c.out, hudOverlap: c.ov }; };
  // QA states: moments of the attract demo found by event time (so they follow the tuning), plus a "stands still" loser and a passive viewer
  S.QA = () => { const copy = (s) => JSON.parse(JSON.stringify(s)), F = SIM.at(SIM.L - 0.01).log.first, at = (tt) => copy(SIM.at(tt));
    const run = (stop, inp) => { const s = SIM.spawn(0); while (!stop(s) && s.t < 40) SIM.step(s, inp(s)); const e = s.end; while (s.t < e + 1.6) SIM.step(s, {}); return copy(s); };
    return [['start', at(0.3)], ['recruit', at(F.recruit + 0.45)], ['gateShoot', at(F.gate - 1.0)], ['choice', at(F.gate + 1.6)], ['minigun', at(F.weapon + 0.5)], ['wave', at(F.wave + 2.2)],
      ['bossIntro', at(F.boss + 0.7)], ['bossFight', at((F.stomp !== undefined ? F.stomp + 0.35 : F.stagger !== undefined ? F.stagger + 0.4 : F.boss + 2.2))], ['bossDie', at(F.bossDie + 0.5)], ['endcard_win', at(F.end + 1.5)],
      ['endcard_lose', run((s) => s.end >= 0, (s) => SIM.inputFor(s, SIM.plan(s, { stay: true })))], ['endcard_time', run((s) => s.end >= 0, () => ({}))]]; };
})();

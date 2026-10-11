// live/hud.js — SQUAD RUSH HUD on the Canvas2D overlay (view px, VW×VH). Spec: study/SPEC.md §4.
// Top: score pill + progress to the boss (squad icon → skull); in the arena the boss HP bar floats over its head and "−N" damage pops.
// In the world: HP on the barrels' front face (like the reference), value on the gate glass, weapon tags, squad count pill.
// GENERIC blocks kept from the template: callouts, tutorial hand + banner, persistent CTA bar, endcard (headline by endWhy, stat, big CTA, replay,
// whole screen = CTA). HUD.hit = tappable rects (index.html: 'cta' → store, 'replay'); HUD.check() = QA (boxes off-screen / overlapping).
(function () {
  const H = KIT.H, HUD = (window.HUD = { hit: [] });
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), ease = (x) => 1 - (1 - x) * (1 - x), SS = (a, b, x) => { const q = clamp((x - a) / (b - a), 0, 1); return q * q * (3 - 2 * q); };
  const h1 = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const DARK = [0.06, 0.09, 0.14], DARK2 = [0.03, 0.05, 0.09];

  // little glyphs drawn in code (no image bytes): star, skull, helmet
  const star = (x, y, r, col) => { const c = H.ctx; c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.46 : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } c.closePath(); c.fillStyle = col; c.fill(); c.lineWidth = r * 0.16; c.strokeStyle = '#5a3a00'; c.stroke(); };
  const skull = (x, y, r, col) => { const c = H.ctx; c.fillStyle = col; c.beginPath(); c.arc(x, y - r * 0.12, r * 0.82, 0, 7); c.fill(); c.fillRect(x - r * 0.45, y + r * 0.3, r * 0.9, r * 0.6);
    c.fillStyle = '#26121a'; c.beginPath(); c.arc(x - r * 0.32, y - r * 0.12, r * 0.22, 0, 7); c.arc(x + r * 0.32, y - r * 0.12, r * 0.22, 0, 7); c.fill(); c.fillRect(x - r * 0.06, y + r * 0.62, r * 0.12, r * 0.28); };
  const helmet = (x, y, r) => { const c = H.ctx; c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, r, Math.PI, 0); c.lineTo(x + r * 1.25, y + r * 0.35); c.lineTo(x - r * 1.25, y + r * 0.35); c.closePath(); c.fill(); };

  HUD.draw = (ST, t, proj) => {
    const TITLE = ((window.BUILD || {}).title || 'SQUAD RUSH').toUpperCase();   // BUILD arrives after the modules in dev
    const W = H.W, Hh = H.Hh, GT = ST.t, K = SIM.K, c = H.ctx, live = ST.end < 0, bs = ST.boss;
    H.begin(); const hit = [];
    const inView = (p) => p && p[0] > 40 && p[0] < W - 40 && p[1] > 180 && p[1] < Hh - 230, near = (p) => 0.55 + 0.45 * clamp((p[1] - 200) / (Hh * 0.55), 0, 1);   // far things get smaller labels
    // ---- top: progress to the boss (squad → skull); a thin translucent strip so it never competes with the action ----
    if (live && !(bs && bs.hp > 0)) { const bx = 60, bw = W - 150, f = clamp(ST.d / K.ARENA_D, 0, 1);
      H.pill(bx, 82, bw, 22, 11, DARK, DARK2, 0.45, 'prog'); H.pill(bx + 3, 85, Math.max(8, (bw - 6) * f), 16, 8, [0.45, 0.78, 1], [0.18, 0.52, 0.96], 0.9);
      c.fillStyle = '#2f7de1'; c.beginPath(); c.arc(bx + 3 + (bw - 6) * f, 93, 28, 0, 7); c.fill(); c.lineWidth = 5; c.strokeStyle = '#fff'; c.stroke(); helmet(bx + 3 + (bw - 6) * f, 95, 13); skull(bx + bw + 6, 93, 32, '#fff'); }
    // ---- numbers on the things (world → screen) ----
    if (live) {
      for (const b of ST.barrels) { if (b.st !== 0) continue; const p = proj(b.x, b.y + 58, 0.55); if (!inView(p)) continue; const k = near(p), bump = 1 + 0.18 * (1 - clamp((GT - b.lastHit) / 0.1, 0, 1));
        H.label(String(Math.ceil(b.hp)), p[0], p[1], { size: Math.round(96 * k * bump), col: '#fff', out: '#4a2a10', al: 0.5 });
        if (b.kind === 'ak' || b.kind === 'mini') { const q = proj(b.x, b.y, 3.6); if (inView(q)) H.label(b.kind === 'ak' ? 'AK-47' : 'MINIGUN', q[0], q[1], { size: Math.round(72 * k), col: b.kind === 'ak' ? '#ffd24a' : '#8fc4ff', out: '#1a1208', al: 0.5 }); } }
      for (const g of ST.gates) { if (g.passed) continue; const p = proj(g.x, g.y, 1.45); if (!inView(p)) continue; const txt = (g.op === 'x' ? '×' : g.val < 0 ? '−' : '+') + Math.abs(g.val), good = g.op === 'x' || g.val > 0, k = near(p), pulse = 1 + 0.2 * (1 - clamp((GT - g.lastHit) / 0.12, 0, 1));
        H.label(txt, p[0], p[1], { size: Math.round(130 * k * pulse), col: '#fff', out: good ? '#0a3a78' : '#8a0f06', al: 0.5 }); }
      const sp = proj(ST.x, -ST.d, 2.2); if (sp && ST.n > 0) { const tw = H.labelW(String(ST.n), 52) + 96; H.pill(sp[0] - tw / 2, sp[1] - 38, tw, 76, 38, [0.2, 0.52, 0.96], [0.1, 0.32, 0.8], 0.95, 'squad'); helmet(sp[0] - tw / 2 + 36, sp[1] + 2, 15); H.label(String(ST.n), sp[0] + 18, sp[1], { size: 52, col: '#fff', out: '#0a2a60', al: 0.5 }); }
      // boss: HP bar over its head + "−N" damage pops (from the sim's 0.3 s damage buckets)
      if (bs && bs.hp > 0) { const hp = proj(bs.x, bs.y, 5.4), bw = 360;
        if (hp) { const bx = clamp(hp[0] - bw / 2, 60, W - bw - 30), by = clamp(hp[1] - 24, 360, Hh - 330), f = clamp(bs.hp / bs.hp0, 0, 1);
          H.pill(bx, by, bw, 56, 28, DARK, DARK2, 0.88, 'bossbar'); H.pill(bx + 6, by + 6, Math.max(12, (bw - 12) * f), 44, 22, [1, 0.4, 0.3], [0.78, 0.14, 0.1]); H.label(String(Math.ceil(bs.hp)), bx + bw / 2, by + 27, { size: 50, col: '#fff', out: '#3a0600', al: 0.5 });
          skull(bx - 8, by + 25, 26, '#ff6a50');
          bs.dm.slice(-2).forEach(([bi, amt], j, arr) => { const age = GT - (bi + 1) * 0.3; if (age < -0.3 || age > 0.9) return; const q = clamp(age / 0.9, 0, 1);
            H.label('−' + Math.round(amt), clamp(bx + bw + 80, 120, W - 130), by + 25 - 62 * (arr.length - 1 - j) - 40 * ease(q), { size: 52, col: '#ffe066', out: '#5a2a00', al: 0, a: 1 - SS(0.55, 1, q) }); }); } } }
    // ---- "choose your weapon": from the gates until a weapon is picked ----
    if (live && ST.weapon === 0 && ST.log.first.gate !== undefined && ST.barrels.some((b) => (b.kind === 'ak' || b.kind === 'mini') && b.st === 0)) { const p = 1 + 0.05 * Math.sin(t * 7), tw = H.labelW('CHOOSE YOUR WEAPON!', Math.round(64 * p));
      H.pill(W / 2 - tw / 2 - 40, 140, tw + 80, 104, 52, DARK, DARK2, 0.78, 'weapbn'); H.label('CHOOSE YOUR WEAPON!', W / 2, 192, { size: Math.round(64 * p), col: '#fff', out: '#0a2a60', al: 0.5 }); }
    // ---- callouts from events ----
    for (const e of ST.ev) { const a = GT - e.t; if (a < 0) continue;
      const pop = (txt, x, y, life, size, col, out) => { if (a > life) return; const q = a / life, s = size * (a < 0.12 ? 0.6 + 0.4 * a / 0.12 : 1);
        H.label(txt, x, y - 90 * ease(q), { size: Math.round(s), col, out, al: 0.5, a: 1 - SS(0.7, 1, q) }); };
      const sq = proj(ST.x, -ST.d, 3.0) || [W / 2, Hh * 0.6];
      if (e.k === 'recruit' && a > K.LAND_T && !ST.ev.some((q) => q.k === 'gate' && e.t >= q.t - 0.01 && e.t < q.t + 0.5)) pop('+1', clamp(sq[0] + (h1(e.id) - 0.5) * 240, 100, W - 100), sq[1] - 20, 0.7, 60, '#8ad4ff', '#0a2a60');
      if (e.k === 'gate') pop((e.val > 0 ? '+' : '−') + Math.abs(e.val) + (e.op === 'x' ? '×' : ''), sq[0], sq[1] - 40, 1.2, 130, e.val > 0 ? '#8ad4ff' : '#ff8a80', e.val > 0 ? '#0a3a78' : '#8a0f06');
      if (e.k === 'weapon') pop(K.W[e.w].name + '!', W / 2, Hh * 0.42, 1.6, 120, '#9bff9b', '#0a4a16');
      if (e.k === 'bump') pop('MISSED!', W / 2, Hh * 0.45, 0.9, 72, '#fff', '#7a0d06');
      if (e.k === 'wave') pop('INCOMING!', W / 2, Hh * 0.3, 1.5, 92, '#ff6a50', '#3a0400');
      if (e.k === 'boss') pop('BOSS FIGHT!', W / 2, 180, 2.0, 108, '#ff6a50', '#3a0400');
      if (e.k === 'stagger' && bs && bs.hp > 0) pop('STAGGER!', W / 2, Hh * 0.5, 0.9, 76, '#ffe066', '#5a3a00');
      if (e.k === 'bossDie') pop('BOSS DOWN!', W / 2, Hh * 0.38, 1.9, 130, '#ffe066', '#5a3a00');
      if (e.k === 'bossDie' && a < 0.2) { c.fillStyle = `rgba(255,255,255,${0.35 * (1 - a / 0.2)})`; c.fillRect(0, 0, W, Hh); }
      if (e.k === 'boss' && a < 1.8) { const v = 0.3 * Math.abs(Math.sin(a * 5)) * (1 - a / 1.8), g = c.createRadialGradient(W / 2, Hh / 2, Hh * 0.25, W / 2, Hh / 2, Hh * 0.7); g.addColorStop(0, 'rgba(200,0,0,0)'); g.addColorStop(1, `rgba(200,0,0,${v})`); c.fillStyle = g; c.fillRect(0, 0, W, Hh); } }
    // ---- tutorial: the hand swipes left / right (demo and ghost play: where the scripted finger is; play: before the first swipe or after 2.5 s idle) ----
    const ghost = ST.ghostOn, idle = live && !ST.demo && (ST.firstIn < 0 || GT - ST.lastIn > 2.5), showHand = live && (ST.demo ? GT < 2.6 : idle || ghost);
    if (showHand) { const q = (t * 0.7) % 1, hx = ghost || ST.demo ? clamp(540 + ST.tx / K.STEER, 160, 920) : 540 + 190 * Math.sin(q * Math.PI * 2), hy = Hh * 0.8, down = ghost || ST.demo || (q > 0.05 && q < 0.95);
      if (down) H.glow(hx, hy, 70, [1, 1, 1], 0.35);
      const hh = 190 * (down ? 0.92 : 1); if (H.img.hand) H.sprite('hand', hx - hh * 0.54 * 0.33, hy - hh * 0.03, hh * 0.54, hh); else H.ring(hx, hy, 40, [1, 1, 1], 0.9, 14);
      if (ST.firstIn < 0 && GT < 6) { const b = 1 + 0.04 * Math.sin(t * 6), sz = Math.round(70 * b), txt = 'SWIPE TO AIM!', tw = H.labelW(txt, sz);
        H.pill(W / 2 - tw / 2 - 40, Hh * 0.44 - 62, tw + 80, 124, 62, [0.04, 0.07, 0.14], [0.02, 0.04, 0.09], 0.7, 'tut'); H.label(txt, W / 2, Hh * 0.44, { size: sz, col: '#fff', out: '#0a2a60', al: 0.5 }); } }
    // ---- persistent CTA bar (store button visible the whole time) ----
    if (live) { const bw = 400, bh = 124, bx = W - bw - 36, by = Hh - bh - 44, pul = 1 + 0.03 * Math.sin(t * 5);
      H.pill(24, by - 18, W - 48, bh + 36, 30, DARK, DARK2, 0.72);
      H.label(TITLE, 70, by + bh / 2, { size: 50, col: '#ffd84a', out: '#2a1a00', id: 'brand' });
      H.pill(bx - (pul - 1) * bw / 2, by - (pul - 1) * bh / 2, bw * pul, bh * pul, bh / 2, [0.35, 0.68, 1.0], [0.10, 0.42, 0.95], 1, 'cta');
      H.label('PLAY NOW', bx + bw / 2, by + bh / 2, { size: 58, col: '#fff', out: '#0a2a70', al: 0.5 });
      hit.push({ id: 'cta', x: bx, y: by, w: bw, h: bh }); }
    // ---- endcard (the world is dimmed in 3D by scene.js; text and buttons here) ----
    if (ST.end >= 0) { const oy = (Hh - 1920) / 2, a = GT - ST.end, k = SS(0, 0.45, a), pop = (d) => { const q = clamp((a - d) / 0.35, 0, 1); return q < 1 ? 1.12 * ease(q) - 0.12 * q * q : 1; };
      const left = bs ? Math.max(1, Math.round(100 * bs.hp / bs.hp0)) : 0, head = ST.endWhy === 'win' ? 'VICTORY!' : ST.endWhy === 'lose' ? (!bs ? 'THE HORDE WON!' : K.FAKE_FAIL || left <= 35 ? 'BOSS HAD ' + left + '% LEFT!' : 'SO CLOSE!') : 'CAN YOU BEAT THE BOSS?';
      const s1 = pop(0.2); if (s1 > 0.01) { H.label(head, W / 2, 220 + oy, { size: Math.round((head.length > 14 ? 56 : 84) * s1), col: '#fff', out: '#0a2a60', al: 0.5, id: 'head' });
        const sqw = H.labelW('SQUAD ', Math.round(124 * s1)), rw = H.labelW('RUSH', Math.round(124 * s1)), lx = W / 2 - (sqw + rw) / 2;   // two-colour logo: white SQUAD with a blue outline, yellow RUSH
        H.label('SQUAD ', lx, 350 + oy, { size: Math.round(124 * s1), col: '#fff', out: '#1f5fc4', id: 'logo' }); H.label('RUSH', lx + sqw, 350 + oy, { size: Math.round(124 * s1), col: '#ffd84a', out: '#3a2000' });
        H.label('Lead your squad to victory!', W / 2, 480 + oy, { size: 64, col: '#fff', out: '#0a2a60', al: 0.5, a: k, id: 'tag' }); }
      const s2 = pop(0.45); if (s2 > 0.01) H.label(ST.kills >= 10 ? (ST.endWhy === 'win' ? 'SQUAD ' + ST.n + ' · ' + ST.kills + ' ENEMIES' : ST.kills + ' ENEMIES DEFEATED') : (ST.n > 0 ? 'SQUAD ' + ST.n : 'KEEP FIGHTING!'), W / 2, 1205 + oy, { size: Math.round(54 * s2), col: '#9fd4ff', out: '#0a2a60', al: 0.5, id: 'stat' });
      if (ST.endWhy === 'win' && s2 > 0.01) for (let j = 0; j < 3; j++) star(W / 2 + (j - 1) * 120, 1150 + oy - (j === 1 ? 20 : 0), (j === 1 ? 52 : 40) * s2, '#ffd23a');
      const s3 = pop(0.7), pul = 1 + 0.045 * Math.sin(t * 6), bw = 640 * s3 * pul, bh = 170 * s3 * pul, bx = W / 2 - bw / 2, by = 1350 + oy - bh / 2;
      if (s3 > 0.01) { H.glow(W / 2, 1350 + oy, 420, [1, 0.8, 0.3], 0.3);
        H.pill(bx, by + 12, bw, bh, bh / 2, [0.55, 0.30, 0.02], [0.45, 0.22, 0.0]); H.pill(bx, by, bw, bh, bh / 2, [1.0, 0.86, 0.30], [0.98, 0.58, 0.10], 1, 'endcta');
        H.label('PLAY NOW', W / 2, by + bh / 2, { size: Math.round(86 * s3), col: '#fff', out: '#7a3a00', al: 0.5 });
        hit.push({ id: 'cta', x: bx, y: by, w: bw, h: bh }); }
      if (a > 1.2) { H.label('↻ REPLAY', W / 2, 1580 + oy, { size: 46, col: '#fff', out: '#0a2a60', al: 0.5, a: SS(1.2, 1.6, a), id: 'replay' });
        hit.unshift({ id: 'replay', x: W / 2 - 220, y: 1525 + oy, w: 440, h: 130 }); }
      if (a > 0.6) hit.push({ id: 'cta', x: 0, y: 0, w: W, h: Hh }); }
    HUD.hit = hit;
  };
  // QA: pills and labels that leave the screen or overlap (the CTA bar holds brand + button)
  HUD.check = () => H.check(['brand', 'cta']);
})();

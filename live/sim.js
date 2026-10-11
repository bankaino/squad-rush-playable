// live/sim.js — SQUAD RUSH playable ad: deterministic lane-runner sim, fixed 120 Hz (spec: study/SPEC.md §2).
// Loop: swipe to steer a squad that runs up a bridge and shoots by itself → barrels (recruits) → shootable gates (+N / −N, the
// number grows with hits) → weapon barrels (AK cheap / MINIGUN expensive) → red wave → giant boss → endcard.
// World in px: x right, y down, forward = −y (the squad centre stands at y = −d). Every reaction lives here; the scene only draws.
(function (root) {
  const DT = 1 / 120, L = 30.0;
  const ASPECT = typeof window !== 'undefined' && window.innerWidth ? window.innerHeight / window.innerWidth : 16 / 9;
  const VIEW = { W: 1080, H: Math.round(1080 * Math.max(16 / 9, Math.min(19.5 / 9, ASPECT))) };
  const HINT = 'swipe left / right to aim · shoot barrels for recruits · pick the best gate and weapon · beat the boss';
  const K = {
    RW: 330, STEER: 0.9, FOLLOW: 10, KEYS: 420, RUN: 300, ARENA_D: 4900, STOP_D: 5150,           // road half width, finger→world px, run speed
    SPACING: 55, MAX_UNITS: 30, CC0_MAX: 24, FORM_MAX: 205, UNIT_R: 24, LAND_T: 0.45, UNIT_FOLLOW: 8,
    W: [{ name: 'RIFLE', rate: 4, dmg: 1, spread: 0.01 }, { name: 'AK-47', rate: 8, dmg: 2, spread: 0.035 }, { name: 'MINIGUN', rate: 13, dmg: 1.8, spread: 0.07 }],
    BUL_V: 1700, RANGE: 1050,
    ROW1_D: 800, ROW1_HP: [3, 1, 3], ROW2_D: 1500, ROW2_HP: 8, ROW2_N: 3,                        // barrels: three singles, then two with two recruits
    GATE_D: 2200, GATE_L: 2, GATE_R: -3, GATE_STEP: 10, GATE_MAX: 15,
    WEAP_EXCL: true, WEAP_D: 3300, AK_HP: 20, MINI_HP: 66, X2: false, X2_D: 4500,
    WAVE_D: 5300, WAVE_N: 96, WAVE_TRIG: 2100, EN_HP: 3, EN_SPD: 170, EN_STEER: 0.15, TRADE_R: 42,
    BOSS_OFS: 400, BOSS_HP: 500, BOSS_PER: 37, BOSS_SPD: 110, BOSS_REACH: 320, BOSS_KILL: 3, BOSS_CD: 1.1, BOSS_WIND: 0.5, SLOWMO: 0.35, SLOW_T: 0.9,
    MINION_N: 18, MINION_T: [0, 2.5, 5], FAKE_FAIL: false, RAGE_AT: 0.12, RAGE_KILL: 3, RAGE_CD: 0.5, FAIL_FLOOR: 0.08,
    GHOST_T: 2.0, END_AFTER_WIN: 2.0, END_AFTER_LOSE: 1.4, END_MAX: 28, END_NO_INPUT: 12, END_IDLE: 10,
  };

  const h1 = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ss = (e0, e1, x) => { const q = clamp((x - e0) / (e1 - e0), 0, 1); return q * q * (3 - 2 * q); };

  // ---------------- the level, as data (rebuilt by build() after a variant overrides K) ----------------
  let LEVEL = null;
  function build() {
    const o = { barrels: [], gates: [], wave: [] }; let id = 0;
    const bar = (kind, x, d, hp, rew, pri) => o.barrels.push({ id: id++, kind, x, y: -d, hp, hp0: hp, hw: 75, dz: 45, rew, st: 0, lastHit: -9, brk: -9, pri });   // st 0 alive, 1 shot, 2 rammed, 3 passed
    K.ROW1_HP.forEach((hp, i) => bar(i === 1 ? 'r1m' : 'r1s', [-220, 0, 220][i], K.ROW1_D, hp, { recruit: 1 }, [2, 0, 1][i]));
    [-165, 165].forEach((x, i) => bar('r2', x, K.ROW2_D, K.ROW2_HP, { recruit: K.ROW2_N }, i));
    bar('ak', -165, K.WEAP_D, K.AK_HP, { weapon: 1 }, 0); bar('mini', 165, K.WEAP_D, K.MINI_HP, { weapon: 2 }, 0);
    const gate = (pair, side, d, op, val, fixed) => o.gates.push({ id: pair * 2 + side, pair, side, x: side ? 165 : -165, y: -d, hw: 165, dz: 20, op, val, v0: val, fixed: !!fixed, hits: 0, passed: false, lastHit: -9 });
    gate(0, 0, K.GATE_D, '+', K.GATE_L); gate(0, 1, K.GATE_D, '+', K.GATE_R);
    if (K.X2) { gate(1, 0, K.X2_D, 'x', 2, true); gate(1, 1, K.X2_D, '+', 3); }
    for (let i = 0; i < K.WAVE_N; i++) { const row = Math.floor(i / 8), col = i % 8;                                   // 8 columns × 72 px: the horde fills ~75 % of the road
      o.wave.push({ x: -252 + col * 72 + 30 * (h1(i + 1) - 0.5), y: -(K.WAVE_D + row * 90) + 40 * (h1(i + 7) - 0.5) }); }
    LEVEL = o; return o;
  }

  // ---------------- formation ----------------
  const formScale = (n) => Math.min(1, K.FORM_MAX / (K.SPACING * 0.9 * Math.sqrt(Math.max(n, 1))));
  const slotOf = (i, sc) => { const r = K.SPACING * 0.9 * Math.sqrt(i) * sc, a = i * 2.39996; return [r * Math.cos(a), r * Math.sin(a) * 0.85]; };
  const formR = (n) => (n <= 1 ? 30 : K.SPACING * 0.9 * Math.sqrt(n - 1) * formScale(n) + 30);

  const push = (S, e) => { S.ev.push(e); const l = S.log; if (l.first[e.k] === undefined) l.first[e.k] = e.t; l.n[e.k] = (l.n[e.k] || 0) + 1; return e; };
  const fx = (S, x, y, kind) => { S.hits[S.hitN++ % 96] = [Math.round(x), Math.round(y), kind, +S.t.toFixed(3)]; };
  const recount = (S) => { let n = 0; for (const u of S.units) if (u.dead < 0) n++; S.n = n; };

  function create() {
    if (!LEVEL) build();
    const S = { t: 0, steps: 0, wt0: 0, ev: [], cam: [0, -330], zoom: 1, ts: 1, x: 0, tx: 0, d: 0, anc: null, ghostOn: false, demoX: 540, weapon: 0, n: 1,
      units: [], uid: 0, bullets: [], bseq: 0, hits: [], hitN: 0, pickups: [], enemies: [], eid: 0, boss: null, arenaT: -1, waveT: -1, minionN: 0,
      barrels: LEVEL.barrels.map((b) => Object.assign({}, b)), gates: LEVEL.gates.map((g) => Object.assign({}, g)),
      money: 0, kills: 0, recruits: 0, trades: 0, lost: 0, winT: -1, loseT: -1, slowT: -1, end: -1, endWhy: '', firstIn: -1, lastIn: 0,
      log: { first: {}, n: {}, wk: 0, wt: 0, atArena: 0 } };
    S.units.push({ id: S.uid++, ox: 0, oy: 0, x: 0, y: 0, born: -9, from: [0, 0], dead: -1 });
    LEVEL.wave.forEach((w) => S.enemies.push({ id: S.eid++, x: w.x, y: w.y, hp: K.EN_HP, st: 0, wv: 1, sp: K.EN_SPD * (0.9 + 0.2 * h1(S.eid)), go: 0.35 * h1(S.eid + 3), dt: -9, hw: 22, dz: 20 }));
    return S;
  }
  const spawn = (worldT) => Object.assign(create(), { wt0: worldT });
  const respawn = (S, worldT) => spawn(worldT);
  const outOfPlay = () => false;

  // ---------------- squad ----------------
  function addUnits(S, n, fx0, fy0, spreadX) {
    for (let j = 0; j < n; j++) {
      recount(S); if (S.n >= K.MAX_UNITS) return j;
      const from = [fx0 + (n > 1 ? (j - (n - 1) / 2) * spreadX : 0), fy0];
      S.units.push({ id: S.uid++, ox: 0, oy: 0, x: from[0], y: from[1], born: S.t, from, dead: -1 });
      S.n++; S.recruits++; push(S, { k: 'recruit', t: S.t, x: from[0], y: from[1], id: S.uid - 1 });
    }
    return n;
  }
  function killUnit(S, u, why) { u.dead = S.t; S.lost++; S.n--; push(S, { k: 'unitDie', t: S.t, x: u.x, y: u.y, id: u.id, why }); }
  const alive = (S) => S.units.filter((u) => u.dead < 0);

  // ---------------- damage ----------------
  function breakBarrel(S, b) {
    b.st = 1; b.brk = S.t; push(S, { k: 'barrel', t: S.t, x: b.x, y: b.y, kind: b.kind });
    if (b.rew.recruit) addUnits(S, b.rew.recruit, b.x, b.y, 44);
    else if (b.rew.weapon) { S.pickups.push({ w: b.rew.weapon, x: b.x, y: b.y, t0: S.t });
      if (K.WEAP_EXCL) for (const o of S.barrels) if (o !== b && o.rew.weapon && o.st === 0) { o.st = 1; o.brk = S.t; push(S, { k: 'barrel', t: S.t, x: o.x, y: o.y, kind: o.kind, lost: true }); } }   // you pick ONE weapon: the other barrel is wasted
  }
  function damage(S, o, b, kind) {
    const t = S.t; fx(S, b.x, o.y + o.dz, kind);
    if (kind === 1) { o.hp -= b.dmg; o.lastHit = t; if (o.hp <= 0 && o.st === 0) breakBarrel(S, o); }
    else if (kind === 2) { o.hits += b.dmg; o.lastHit = t;
      if (!o.fixed) { const nv = o.v0 + Math.min(Math.floor(o.hits / K.GATE_STEP), K.GATE_MAX - o.v0); if (nv > o.val) { o.val = nv; push(S, { k: 'gateUp', t, x: o.x, y: o.y, id: o.id, val: nv }); } } }
    else if (kind === 0) { o.hp -= b.dmg;
      if (o.hp <= 0 && o.st < 2) { o.st = 2; o.dt = t; S.kills++; if (o.wv === 1) S.log.wk++; push(S, { k: 'kill', t, x: o.x, y: o.y, id: o.id }); } }
    else if (kind === 3) { const bs = S.boss; if (bs.hp <= 0) return; bs.hp -= b.dmg; bs.lastHit = t; { const bi = Math.floor(t / 0.3), q = bs.dm[bs.dm.length - 1]; if (q && q[0] === bi) q[1] += b.dmg; else { bs.dm.push([bi, b.dmg]); if (bs.dm.length > 6) bs.dm.shift(); } }
      if (K.FAKE_FAIL && S.n > 0) bs.hp = Math.max(bs.hp, bs.hp0 * K.FAIL_FLOOR);
      if (bs.hp <= 0) { bs.hp = 0; bs.st = 'dead'; bs.t0 = t; S.winT = t; S.slowT = t; push(S, { k: 'bossDie', t, x: bs.x, y: bs.y });
        for (const e of S.enemies) if (e.st < 2) { e.st = 2; e.dt = t; S.kills++; } }
      else if (bs.st === 'walk' && bs.stg < 3 && bs.hp <= bs.hp0 * (1 - 0.25 * (bs.stg + 1))) { bs.stg++; bs.st = 'stagger'; bs.t0 = t; bs.y -= 40; push(S, { k: 'stagger', t, x: bs.x, y: bs.y }); }
      else if (K.FAKE_FAIL && !bs.rage && bs.hp <= bs.hp0 * K.RAGE_AT) { bs.rage = true; push(S, { k: 'rage', t, x: bs.x, y: bs.y }); } }
  }

  function passGate(S, g) {
    const pair = S.gates.filter((h) => h.pair === g.pair); let pick = pair.find((h) => Math.abs(S.x - h.x) <= h.hw);
    if (!pick) pick = pair.reduce((a, h) => (Math.abs(S.x - h.x) < Math.abs(S.x - a.x) ? h : a));
    pair.forEach((h) => (h.passed = true)); recount(S); S.log.gateVal = pick.val;
    if (pick.op === '+') { if (pick.val > 0) addUnits(S, pick.val, pick.x, pick.y, 40);
      else if (pick.val < 0) { const al = alive(S); for (let k = 0; k < -pick.val && al.length > 1; k++) killUnit(S, al.pop(), 'gate'); } }
    else addUnits(S, Math.round((pick.val - 1) * S.n), pick.x, pick.y, 24);
    push(S, { k: 'gate', t: S.t, x: pick.x, y: pick.y, val: pick.val, op: pick.op, id: pick.id });
  }

  // ---------------- one step ----------------
  function step(S, inp) {
    const t = S.t + DT; S.t = t; S.steps++; inp = inp || {};
    S.ts = S.slowT >= 0 && t - S.slowT < K.SLOW_T ? K.SLOWMO : 1; const dg = DT * S.ts;
    if (S.steps % 60 === 0) {
      if (S.ev.length && S.ev[0].t < t - 4) S.ev = S.ev.filter((e) => e.t > t - 4);
      S.enemies = S.enemies.filter((e) => e.st < 2 ? true : e.st === 2 && t - e.dt < 1.2); S.units = S.units.filter((u) => u.dead < 0 || t - u.dead < 1.5);
    }
    // ---- input: a relative swipe (the finger's x offset moves the lane target); until the first real touch the demo finger plays (ghost) ----
    let ghost = false; if (S.firstIn < 0 && !inp.press && t < K.GHOST_T && S.end < 0) { inp = scriptInput(t, S); ghost = true; }
    const n0 = S.n, lim = K.RW - formR(n0), live = inp.press && inp.px !== undefined, key = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (live) { if (!S.anc || (S.ghostOn && !ghost)) S.anc = [inp.px, S.tx]; S.tx = clamp(S.anc[1] + (inp.px - S.anc[0]) * K.STEER, -lim, lim); } else S.anc = null;
    if (key && S.end < 0) S.tx = clamp(S.tx + key * K.KEYS * DT, -lim, lim);
    if (ghost) S.demoX = inp.px;
    S.ghostOn = ghost; if ((live || key) && !ghost) { S.lastIn = t; if (S.firstIn < 0) S.firstIn = t; }

    if (S.end < 0) {
      // ---- run + follow ----
      const v = S.d >= K.STOP_D || S.n === 0 ? 0 : Math.max(30, K.RUN * (1 - ss(K.ARENA_D, K.STOP_D, S.d)));
      S.d = Math.min(K.STOP_D, S.d + v * dg); S.x += (S.tx - S.x) * Math.min(1, K.FOLLOW * dg);
      const sc = formScale(S.n), edge = K.RW - K.UNIT_R; let i = 0;
      for (const u of S.units) { if (u.dead >= 0) continue; const [ox, oy] = slotOf(i++, sc); u.ox = ox; u.oy = oy;
        const gx = S.x + ox, gy = -S.d + oy, q = (t - u.born) / K.LAND_T;
        if (q < 1) { const e = 1 - (1 - q) * (1 - q); u.x = u.from[0] + (gx - u.from[0]) * e; u.y = u.from[1] + (gy - u.from[1]) * e; }
        else { const k = Math.min(1, K.UNIT_FOLLOW * dg); u.x += (gx - u.x) * k; u.y += (gy - u.y) * k; }
        u.x = clamp(u.x, -edge, edge); }
      // ---- shooting: unit phase is fixed by its id, so the scene derives muzzle flashes without state ----
      const w = K.W[S.weapon], bossDead = S.boss && S.boss.st === 'dead';
      if (!bossDead) for (const u of S.units) { if (u.dead >= 0 || t - u.born < K.LAND_T) continue;
        if (Math.floor((t + 0.137 * u.id) * w.rate) > Math.floor((t - DT + 0.137 * u.id) * w.rate))
          S.bullets.push({ x: u.x, y: u.y - 20, vx: K.BUL_V * w.spread * (h1(S.bseq++) * 2 - 1), vy: -K.BUL_V, dmg: w.dmg, r: K.RANGE }); }
      // ---- bullets: each hits the first target (largest y) whose box its step overlaps; targets are bucketed by y ----
      if (S.bullets.length) {
        const cells = {}, add = (o, kind) => { const c = Math.floor(o.y / 128); (cells[c] || (cells[c] = [])).push([o, kind]); };
        for (const b of S.barrels) if (b.st === 0) add(b, 1);
        for (const g of S.gates) if (!g.passed) add(g, 2);
        for (const e of S.enemies) if (e.st < 2) add(e, 0);
        if (S.boss && S.boss.hp > 0) add(S.boss, 3);
        const bl = S.bullets; let wi = 0;
        for (let k = 0; k < bl.length; k++) { const b = bl[k], y0 = b.y; b.y += b.vy * dg; b.x += b.vx * dg; b.r -= K.BUL_V * dg;
          let hit = null, kind = 0, hy = -1e9;
          for (let c = Math.floor((b.y - 100) / 128), c1 = Math.floor((y0 + 100) / 128); c <= c1; c++) { const lst = cells[c]; if (!lst) continue;
            for (const [o, kd] of lst) if (b.y <= o.y + o.dz && y0 >= o.y - o.dz && Math.abs(b.x - o.x) <= o.hw + 4 && o.y > hy) { hy = o.y; hit = o; kind = kd; } }
          if (hit) { damage(S, hit, b, kind); continue; }
          if (b.r > 0) bl[wi++] = b; }
        bl.length = wi;
      }
      // ---- weapon pickups fly to the squad, then every soldier swaps its gun ----
      for (let k = S.pickups.length - 1; k >= 0; k--) { const p = S.pickups[k]; if (t - p.t0 < 0.4) continue;
        if (p.w > S.weapon) { S.weapon = p.w; push(S, { k: 'weapon', t, x: S.x, y: -S.d, w: p.w }); } S.pickups.splice(k, 1); }
      // ---- gates and barrels the squad runs into ----
      for (const g of S.gates) if (!g.passed && S.d >= -g.y) passGate(S, g);
      for (const b of S.barrels) { if (b.st !== 0) continue; const db = -b.y;
        if (S.d > db + 300) { b.st = 3; continue; }
        let hitU = null; for (const u of S.units) if (u.dead < 0 && -u.y + K.UNIT_R >= db - b.dz && Math.abs(u.x - b.x) < b.hw + K.UNIT_R) { hitU = u; break; }
        if (hitU) { b.st = 2; b.brk = t; if (S.n > 1) killUnit(S, hitU, 'barrel'); push(S, { k: 'bump', t, x: b.x, y: b.y }); } }
      // ---- the red wave ----
      if (S.waveT < 0 && S.d >= K.WAVE_D - K.WAVE_TRIG) { S.waveT = t; S.log.atWave = S.n; push(S, { k: 'wave', t, x: 0, y: -K.WAVE_D }); }
      const sy = -S.d;
      for (const e of S.enemies) { if (e.st >= 2) continue;
        if (e.st === 0) { if (S.waveT >= 0 && t >= S.waveT + e.go) e.st = 1; else continue; }
        e.y += e.sp * dg; e.x += (S.x - e.x) * Math.min(1, K.EN_STEER * dg);
        if (e.y > sy + 700) { e.st = 3; continue; }
        if (Math.abs(e.y - sy) > 320) continue;
        for (const u of S.units) { if (u.dead >= 0 || t - u.born < K.LAND_T) continue; const dx = u.x - e.x, dy = u.y - e.y;
          if (dx * dx + dy * dy < K.TRADE_R * K.TRADE_R) { e.st = 2; e.dt = t; S.trades++; S.kills++; if (e.wv === 1) S.log.wt++; killUnit(S, u, 'trade');
            push(S, { k: 'trade', t, x: e.x, y: e.y, id: e.id }); break; } } }
      // ---- the arena: boss + three waves of minions ----
      if (!S.boss && S.d >= K.ARENA_D) { S.arenaT = t; S.log.atArena = S.n;
        const hp = Math.round(K.BOSS_HP + K.BOSS_PER * S.n);   // hidden rubber band: the boss scales with the squad, so the fight stays ~4 s and the weapon decides
        S.boss = { x: 0, y: -(K.STOP_D + K.BOSS_OFS), hp, hp0: hp, st: 'walk', t0: t, cd: t + 0.3, stg: 0, rage: false, lastHit: -9, hw: 90, dz: 70, dm: [] };
        push(S, { k: 'boss', t, x: 0, y: S.boss.y }); }
      const bs = S.boss;
      if (bs && bs.st !== 'dead') {
        while (S.minionN < K.MINION_T.length && t >= S.arenaT + K.MINION_T[S.minionN]) { const m = S.minionN++;
          for (let j = 0; j < K.MINION_N; j++) S.enemies.push({ id: S.eid++, x: -250 + (j % 6) * 100 + 40 * (h1(S.eid) - 0.5), y: bs.y - 140 - Math.floor(j / 6) * 90 - m * 20, hp: K.EN_HP, st: 1, wv: 2, sp: K.EN_SPD * (0.9 + 0.2 * h1(S.eid + 3)), go: 0, dt: -9, hw: 22, dz: 20 });
          push(S, { k: 'minions', t, x: 0, y: bs.y }); }
        bs.x += (clamp(S.x * 0.7, -150, 150) - bs.x) * Math.min(1, 0.8 * dg);
        let front = 1e9; for (const u of S.units) if (u.dead < 0 && u.y < front) front = u.y;
        const dist = front - bs.y;
        if (bs.st === 'walk') { if (dist > K.BOSS_REACH) bs.y += K.BOSS_SPD * dg;
          else if (t >= bs.cd && S.n > 0) { bs.st = 'windup'; bs.t0 = t; push(S, { k: 'windup', t, x: bs.x, y: bs.y }); } }
        else if (bs.st === 'windup' && t - bs.t0 >= K.BOSS_WIND) { bs.st = 'stomp'; bs.t0 = t; const kill = bs.rage ? K.RAGE_KILL : K.BOSS_KILL;
          const al = alive(S).sort((a, b) => a.y - b.y); for (let k = 0; k < kill && k < al.length; k++) killUnit(S, al[k], 'stomp');
          bs.cd = t + (bs.rage ? K.RAGE_CD : K.BOSS_CD); push(S, { k: 'stomp', t, x: bs.x, y: bs.y }); }
        else if (bs.st === 'stomp' && t - bs.t0 >= 0.45) { bs.st = 'walk'; bs.t0 = t; }
        else if (bs.st === 'stagger' && t - bs.t0 >= 0.6) { bs.st = 'walk'; bs.t0 = t; bs.cd = Math.max(bs.cd, t + 0.4); }
      }
      // ---- result: the squad is gone → lose; the boss is down → win (slow motion in between); endcard after a beat ----
      if (S.n <= 0 && S.loseT < 0 && S.winT < 0) { S.loseT = t; push(S, { k: 'lose', t, x: S.x, y: -S.d }); }
    }
    S.money = S.kills + 5 * S.recruits; S.log.endN = S.n;
    const why = S.winT > 0 && t - S.winT > K.END_AFTER_WIN ? 'win' : S.loseT > 0 && t - S.loseT > K.END_AFTER_LOSE ? 'lose'
      : S.firstIn >= 0 && t - S.firstIn > K.END_MAX ? 'time' : S.firstIn < 0 && t > K.END_NO_INPUT ? 'time' : S.firstIn >= 0 && t - S.lastIn > K.END_IDLE ? 'time' : '';
    if (S.end < 0 && why) { S.end = t; S.endWhy = why; push(S, { k: 'end', t, x: S.x, y: -S.d, why }); }
    // ---- camera: look point 3.3 m ahead of the squad, pulls back as the squad grows and in the arena ----
    const zt = S.boss ? 0.88 : 1 - 0.1 * Math.min(1, (S.n - 1) / 20);
    S.zoom += (zt - S.zoom) * Math.min(1, 1.5 * DT); S.cam[0] += (S.x * 0.45 - S.cam[0]) * Math.min(1, 6 * DT); S.cam[1] += (-S.d - 330 - S.cam[1]) * Math.min(1, 6 * DT);
    return S;
  }

  // ---------------- the planner: what a good (or a casual, or a bad) player aims at; used by the demo and by tools/casual.mjs ----------------
  const POL = { gate: 'best', weapon: 'mini', skip1: false, skip2: false, stay: false };
  const gainOf = (S, g) => (g.op === 'x' ? (g.val - 1) * S.n : g.val);
  function plan(S, pol) {
    pol = pol || POL; if (pol.stay) return 0;
    const d = S.d; let key = 1e9, x = null;
    for (const b of S.barrels) { if (b.st !== 0) continue; const db = -b.y; if (db < d - 80 || db - d > K.RANGE + 150) continue;
      if ((b.kind === 'r1s' && pol.skip1) || (b.kind === 'r2' && pol.skip2) || (b.kind === 'ak' && pol.weapon !== 'ak') || (b.kind === 'mini' && pol.weapon !== 'mini')) continue;
      if (db + b.pri * 0.01 < key) { key = db + b.pri * 0.01; x = b.x; } }
    for (const g of S.gates) { if (g.passed || g.side !== 0) continue; const dg = -g.y; if (dg - d > K.RANGE + 400 || dg >= key) continue;
      const R = S.gates.find((h) => h.pair === g.pair && h.side === 1), better = gainOf(S, g) >= gainOf(S, R) ? g : R, worse = better === g ? R : g;
      key = dg; x = pol.gate === 'L' ? g.x : pol.gate === 'R' ? R.x : pol.gate === 'worst' ? worse.x : better.x; }
    if (x === null) x = S.boss && S.boss.hp > 0 ? S.boss.x * 0.6 + 50 * Math.sin(S.t * 1.9) : 70 * Math.sin(S.t * 1.7);
    return clamp(x, -(K.RW - 30), K.RW - 30);
  }
  // the finger that makes the squad aim at world x `tgt` (relative swipe: offset from the anchor, see step)
  const inputFor = (S, tgt) => { const vx = S.anc ? S.anc[0] : 540, x0 = S.anc ? S.anc[1] : S.tx; return { press: 1, px: vx + (tgt - x0) / K.STEER }; };
  const scriptInput = (t, S) => (t < 0.35 || S.end >= 0 ? { press: 0, px: 540 } : inputFor(S, plan(S, POL)));

  let cache = null;
  function at(t) {
    const loop = Math.floor(t / L), q = t - loop * L, n = Math.round(q / DT);
    if (!cache || cache.loop !== loop || cache.S.steps > n) { const S0 = Object.assign(create(), { wt0: loop * L }); cache = { loop, S: S0 }; }
    const S = cache.S; while (S.steps < n) step(S, scriptInput(S.t, S));
    return Object.assign({}, S, { loop, q, demo: true, inp: scriptInput(S.t, S) });
  }
  // the demo must hit every beat of the ad inside its loop (corridors: study/SPEC.md §2)
  const demoCheck = (S) => { const f = [], F = S.log.first, a = (name, v, lo, hi) => { if (!(v >= lo && v <= hi)) f.push(name + ' ' + (v === undefined ? 'never' : (+v).toFixed(1)) + ' not in ' + lo + '–' + hi); };
    if (K.FAKE_FAIL) { if (S.endWhy !== 'lose') f.push('fake-fail demo did not lose'); else if (S.boss && S.boss.hp > S.boss.hp0 * 0.12) f.push('boss still had ' + Math.round(100 * S.boss.hp / S.boss.hp0) + '%'); return f; }
    a('first recruit', F.recruit, 0, 1.5); if (S.log.n.recruit < 5 || (F.recruit !== undefined && S.recruits < 5)) f.push('fewer than 5 recruits');
    a('minigun', F.weapon, 8, 11.5); if (S.weapon !== 2) f.push('demo ends without the minigun');
    a('boss intro', F.boss, 15.5, 17.5); a('boss death', F.bossDie, 0, 22); a('fight', F.bossDie - F.boss, 3.5, 5.7);
    if (S.log.wk < K.WAVE_N * 0.85) f.push('wave: only ' + S.log.wk + '/' + K.WAVE_N + ' shot'); if (S.log.wt > 3) f.push('wave trades ' + S.log.wt);
    if (S.log.atArena - S.log.endN > 8) f.push('boss fight cost ' + (S.log.atArena - S.log.endN) + ' soldiers');
    if (S.log.n.lose) f.push('demo lost'); if (S.endWhy !== 'win' || S.end > L - 5.5) f.push('end ' + S.endWhy + ' at ' + S.end.toFixed(1));
    if (!(S.log.gateVal >= 6)) f.push('gate value ' + S.log.gateVal + ' < 6');
    return f; };

  build();
  root.SIM = { DT, L, K, VIEW, HINT, build, create, spawn, respawn, outOfPlay, step, at, scriptInput, inputFor, plan, POL, demoCheck, formR, formScale, slotOf, alive, h1 };
  Object.defineProperty(root.SIM, 'LEVEL', { get: () => LEVEL });
  if (typeof module !== 'undefined') module.exports = root.SIM;
})(typeof window !== 'undefined' ? window : globalThis);

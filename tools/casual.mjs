// casual.mjs — 300 seeded casual players play the ad headless; prints win / lose / time %, weapon split, squad size at the arena.
//   node tools/casual.mjs [--n 300] [--variant name] [--set KEY=value ...] [--quiet]
// A player = the SIM planner with human flaws (study/SPEC.md §2): reaction 0.3–0.8 s, aim noise ±70 px, a finger that moves at a
// finite speed, 25 % wrong gate, 30 % skips the second barrel row, weapon taste (minigun 55 / AK 30 / ignores 15 %), 12 % play badly
// (stand still in the middle). Tune MINI_HP, GATE_STEP, WAVE_N, EN_HP, BOSS_HP, BOSS_CD until the corridors below hold.
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const req = createRequire(import.meta.url), root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
global.window = undefined; const SIM = req(path.join(root, 'live', 'sim.js'));
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +opt('n', 300), variant = opt('variant', ''), quiet = args.includes('--quiet'), GOOD = opt('profile', 'casual') === 'good';   // good = no mistakes, tighter aim, half take the AK
if (variant) { const v = JSON.parse(fs.readFileSync(path.join(root, 'variants', variant + '.json'), 'utf8')); Object.assign(SIM.K, v.K || {}); }
args.forEach((a, i) => { if (args[i - 1] === '--set') { const [k, v] = a.split('='); SIM.K[k] = JSON.parse(v); } });
SIM.build();
const h = SIM.h1, K = SIM.K;

function player(seed) {
  const r = (j) => h(seed * 17 + j), bad = !GOOD && r(1) < 0.12;
  if (GOOD) return { bad, react: 0.2 + 0.25 * r(2), noise: 35, touch: 0.2 + 0.4 * r(3), speed: 1800 + 1200 * r(4), pol: { gate: 'best', weapon: r(6) < 0.5 ? 'mini' : 'ak', skip1: false, skip2: false, stay: false } };
  return { bad, react: 0.3 + 0.5 * r(2), noise: 70, touch: 0.2 + 0.8 * r(3), speed: 1200 + 1200 * r(4),
    pol: { gate: r(5) < 0.25 ? 'worst' : 'best', weapon: r(6) < 0.55 ? 'mini' : r(6) < 0.85 ? 'ak' : 'none', skip1: r(7) < 0.2, skip2: r(8) < 0.3, stay: bad } };
}
function play(seed) {
  const P = player(seed), S = SIM.spawn(0); let tgt = 0, next = 0, fx = 540, pressed = false, k = 0;
  while (S.end < 0 && S.t < 40) {
    if (S.t >= P.touch) { pressed = true;
      if (S.t >= next) { next = S.t + P.react; tgt = SIM.plan(S, P.pol) + P.noise * (h(seed * 31 + ++k) * 2 - 1); }
      const want = SIM.inputFor(S, tgt).px, dx = want - fx, mv = P.speed * SIM.DT; fx += Math.max(-mv, Math.min(mv, dx)); }
    SIM.step(S, pressed ? { press: 1, px: fx } : {});
    if (pressed && !S.anc) fx = 540;                       // (never happens while pressed; keeps fx sane after a restart)
  }
  const F = S.log.first;
  return { atWave: S.log.atWave || 0, wt: S.log.wt, wk: S.log.wk, gv: S.log.gateVal, rec: S.recruits, why: S.endWhy, weapon: S.weapon, atArena: S.log.atArena, left: S.n, fight: F.bossDie !== undefined && F.boss !== undefined ? F.bossDie - F.boss : null, end: S.end, bad: P.bad, bossHp: S.boss ? S.boss.hp / S.boss.hp0 : null };
}
const res = []; for (let s = 1; s <= N; s++) res.push(play(s));
const pct = (f) => (100 * res.filter(f).length / N).toFixed(0) + '%', med = (a) => (a.length ? a.sort((x, y) => x - y)[a.length >> 1] : NaN);
const arena = res.filter((x) => x.atArena > 0), fights = res.filter((x) => x.fight != null).map((x) => x.fight);
console.log(`${GOOD ? 'GOOD' : 'casual'} ${N} players${variant ? ' variant ' + variant : ''}: win ${pct((x) => x.why === 'win')}  lose ${pct((x) => x.why === 'lose')}  time ${pct((x) => x.why === 'time')}  | reached arena ${pct((x) => x.atArena > 0)}`);
console.log(`weapon: rifle ${pct((x) => x.weapon === 0)}  AK ${pct((x) => x.weapon === 1)}  minigun ${pct((x) => x.weapon === 2)}  | squad at arena median ${med(arena.map((x) => x.atArena))}  | boss fight median ${med(fights).toFixed(1)} s  | end median ${med(res.map((x) => x.end)).toFixed(1)} s, max ${Math.max(...res.map((x) => x.end)).toFixed(1)} s`);
if (!quiet) { const g = (f) => res.filter(f); const row = (name, a) => a.length && console.log(`  ${name.padEnd(22)} n=${String(a.length).padStart(3)} win ${(100 * a.filter((x) => x.why === 'win').length / a.length).toFixed(0)}%  median squad@wave ${med(a.map((x) => x.atWave))}, recruits ${med(a.map((x) => x.rec))}, wave shot ${med(a.map((x) => x.wk))}/${K.WAVE_N}`);
  row('all', res); row('stay (bad) players', g((x) => x.bad)); row('gate val<=0', g((x) => !x.bad && x.gv <= 0)); row('gate val>0', g((x) => !x.bad && x.gv > 0)); row('squad@wave <6', g((x) => x.atWave < 6)); row('squad@wave 6-9', g((x) => x.atWave >= 6 && x.atWave < 10)); row('squad@wave >=10', g((x) => x.atWave >= 10)); }
if (!quiet) for (const w of [0, 1, 2]) { const g = res.filter((x) => x.weapon === w && x.atArena > 0); if (g.length) console.log(`  weapon ${w}: ${g.length} reached the arena, win ${(100 * g.filter((x) => x.why === 'win').length / g.length).toFixed(0)}%, median squad ${med(g.map((x) => x.atArena))}`); }

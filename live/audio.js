// live/audio.js — procedural sound (WebAudio, zero asset bytes) driven by the sim event bus S.ev (study/SPEC.md §4).
// index.html calls AUDIO.tick(state) once per frame in play mode; the context starts on the first user gesture (autoplay policy)
// and AUDIO.mute(bool) is wired to ad-network viewability / audio-volume callbacks. At most one sound of a kind per 50 ms.
(function () {
  let ac = null, out = null, last = -1, muted = false, nbuf = null, lastShot = 0, duckUntil = 0;
  const at = {}, seenHit = {};
  const start = () => {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    ac = new C(); out = ac.createGain(); out.gain.value = muted ? 0 : 0.55;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.15; out.connect(comp); comp.connect(ac.destination);   // keeps the stack of SFX from clipping
  };
  addEventListener('pointerdown', start, { capture: true }); addEventListener('keydown', start, { capture: true });
  const noise = () => { if (nbuf) return nbuf; nbuf = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate); const d = nbuf.getChannelData(0);
    let s = 12345; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; } return nbuf; };
  const env = (node, t0, a, peak, dur) => { const g = ac.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); node.connect(g); g.connect(out); return g; };
  const tone = (freq, t0, dur, type = 'sine', peak = 0.2, slide = 0) => { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + dur); env(o, t0, 0.005, peak, dur); o.start(t0); o.stop(t0 + dur + 0.05); };
  const burst = (t0, dur, f0, f1, peak, q = 1.2, type = 'bandpass') => { const s = ac.createBufferSource(); s.buffer = noise(); const f = ac.createBiquadFilter();
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur); s.connect(f); env(f, t0, 0.004, peak, dur); s.start(t0); s.stop(t0 + dur + 0.05); };
  const fan = (t0, notes, step = 0.1, type = 'square', peak = 0.09) => notes.forEach((f, i) => tone(f, t0 + i * step, 0.28, type, peak));
  const SFX = {
    recruit: (n) => { tone(784, n, 0.09, 'triangle', 0.1); tone(1175, n + 0.06, 0.12, 'triangle', 0.09); },
    barrel: (n) => { burst(n, 0.28, 2000, 200, 0.4, 0.8, 'lowpass'); tone(130, n, 0.2, 'triangle', 0.28, 0.5); tone(540, n + 0.02, 0.1, 'square', 0.05, 0.6); },
    bump: (n) => { tone(90, n, 0.25, 'sine', 0.4, 0.5); tone(190, n, 0.18, 'sawtooth', 0.2, 0.4); burst(n, 0.15, 800, 200, 0.2); },
    gateUp: (n) => tone(1500, n, 0.05, 'square', 0.07),
    gate: (n, e) => { const up = e.val > 0; [0, 4, 7, 12].forEach((s, i) => tone((up ? 440 : 330) * Math.pow(2, (up ? s : -s) / 12), n + i * 0.07, 0.22, 'square', 0.07)); },
    weapon: (n) => { tone(220, n, 0.5, 'sawtooth', 0.12, 4); fan(n + 0.15, [523, 659, 784, 1047], 0.07, 'square', 0.07); burst(n, 0.4, 300, 3000, 0.12, 0.7); },
    kill: (n) => tone(700 + 400 * Math.random(), n, 0.06, 'triangle', 0.09, 0.6),
    trade: (n) => { tone(110, n, 0.15, 'sine', 0.2, 0.5); burst(n, 0.08, 600, 200, 0.1); },
    unitDie: (n) => tone(330, n, 0.16, 'sine', 0.07, 0.4),
    wave: (n) => { tone(110, n, 0.3, 'sawtooth', 0.08); tone(98, n + 0.3, 0.45, 'sawtooth', 0.08); tone(330, n, 0.25, 'square', 0.1, 1.33); tone(330, n + 0.25, 0.25, 'square', 0.1, 1.33); },
    boss: (n) => { tone(220, n, 0.35, 'sawtooth', 0.2, 0.4); tone(72, n, 1.1, 'sawtooth', 0.22, 0.6); tone(54, n + 0.1, 1.0, 'square', 0.12, 0.7); burst(n, 0.9, 400, 90, 0.18, 0.8, 'lowpass'); },
    windup: (n) => burst(n, 0.5, 200, 1400, 0.16, 1.5),
    stomp: (n) => { tone(200, n, 0.25, 'sawtooth', 0.25, 0.4); tone(62, n, 0.6, 'sine', 0.55, 0.4); burst(n, 0.4, 900, 60, 0.4, 0.7, 'lowpass'); },
    stagger: (n) => { tone(140, n, 0.2, 'triangle', 0.25, 0.5); burst(n, 0.12, 1200, 300, 0.15); },
    bossDie: (n) => { tone(240, n, 0.3, 'sawtooth', 0.25, 0.4); tone(55, n, 1.0, 'sine', 0.6, 0.35); burst(n, 1.0, 1800, 50, 0.5, 0.7, 'lowpass'); fan(n + 0.4, [392, 523, 659, 784, 1047, 1319], 0.1, 'square', 0.09); },
    lose: (n) => fan(n, [440, 392, 330, 262], 0.16, 'triangle', 0.12),
    end: (n, e) => { if (e.why === 'win') fan(n + 0.5, [523, 659, 784, 1047], 0.09, 'triangle', 0.1); else if (e.why === 'time') fan(n, [523, 784], 0.12, 'triangle', 0.08); },
  };
  const GAP = { kill: 35 }, REWARD = { recruit: 1, gate: 1, gateUp: 1, weapon: 1, barrel: 1 };
  const K_RANGE = 1050;
  let netMute = false, hidden = false; const apply = () => { if (out) out.gain.value = netMute || hidden ? 0 : 0.55; };
  addEventListener('visibilitychange', () => { hidden = document.hidden; apply(); });
  window.AUDIO = {
    cta: () => { if (ac) { tone(660, ac.currentTime, 0.08, 'triangle', 0.14); tone(990, ac.currentTime + 0.07, 0.12, 'triangle', 0.14); } },
    mute: (m) => { muted = m; netMute = m; apply(); },
    tick: (S) => {
      if (!ac || !S) return; const now = ac.currentTime;
      if (S.t < last) { last = -1; for (const k in seenHit) delete seenHit[k]; }                  // restart / replay
      const play = (k, e) => { if (now - (at[k] || -9) < (GAP[k] || 50) / 1000) return; at[k] = now; SFX[k](now, e); };
      for (const e of S.ev) { if (e.t <= last) continue; if (SFX[e.k]) { play(e.k, e); if (REWARD[e.k]) duckUntil = now + 0.35; else if (e.k === 'kill') duckUntil = Math.max(duckUntil, now + 0.08); } }   // reward cues duck the gun bed
      // barrels: a wooden knock per hit, higher as the barrel nears its end
      for (const b of S.barrels) if (b.st === 0 && b.lastHit > (seenHit[b.id] === undefined ? -1 : seenHit[b.id]) && b.lastHit <= S.t) { seenHit[b.id] = b.lastHit; if (now - (at.knock || -9) > 0.05) { at.knock = now; tone(150 + 260 * (1 - b.hp / b.hp0), now, 0.07, 'triangle', 0.13, 0.6); } }
      // gunfire: one noise tick per gap, tempo and weight by weapon, loudness by squad size
      const bossDead = S.boss && S.boss.st === 'dead', w = S.weapon, gap = [0.15, 0.085, 0.045][w];
      let target = false; { const fy = -S.d - K_RANGE; for (const o of S.barrels) if (o.st === 0 && o.y > fy && o.y < -S.d + 50) target = true; for (const o of S.gates) if (!o.passed && o.y > fy) target = true; for (const o of S.enemies) if (o.st < 2 && o.y > fy && o.y < -S.d + 50) { target = true; break; } if (S.boss && S.boss.hp > 0) target = true; }
      if (S.end < 0 && S.n > 0 && !bossDead && target) { if (now - lastShot > gap) { lastShot = now; const v = (0.025 + 0.04 * Math.min(1, S.n / 10)) * (now < duckUntil ? 0.4 : 1);
        burst(now, w === 2 ? 0.05 : 0.07, [2600, 1900, 1000][w], [900, 500, 300][w], v * [1, 1.25, 1.5][w], 1.1); if (w) tone(w === 2 ? 70 : 110, now, 0.06, 'sawtooth', v * 0.6, 0.6); } }
      last = S.t;
    },
  };
})();

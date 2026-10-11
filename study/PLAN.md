# Squad Rush — plan (keep current; one session per phase). Full spec: study/SPEC.md. TRUTH for numbers = SIM.K in live/sim.js
## Mechanic and beats (demo, measured by verify.sh)
- hook: 1 soldier auto-fires; middle barrel (HP 1) breaks at 0.7 s → first recruit; hand "SWIPE TO AIM" (ghost finger plays 2 s, never counts as input)
- core: swipe (relative, anchor = finger-down x) · barrels r1 (3·1·3 HP, +1 each) → r2 (HP 8, +3 each) → gates (+2 vs −3, +1 per GATE_STEP 10 hits) at 7.3 s
- choice: AK (HP 20) vs MINIGUN (HP 66) → minigun swapped in at 9.8 s → red wave (40, shot 40/40, 0 trades) 11.7 s → boss 16.3 s → bossDie 20.4 s → win endcard 22.4 s
- endcards: win VICTORY! · lose SO CLOSE! (squad wiped) · time CAN YOU BEAT THE BOSS? (passive viewer: 12.0 s)

## Phase 1 DONE (verify.sh VERIFY OK: 0.73 MB, 61 fps, draws ≤ 27, tris ≤ 8k graybox)
- sim.js written once (K tuned with tools/casual.mjs): ROW1_HP [3,1,3] @800, ROW2 @1500 (+3 each), GATE @2200, WEAP @3300, WAVE @4500 (trigger 1000 ahead), ARENA 4900, STOP 5150
- weapons (K.W): rifle 4/s×1 · AK 8/s×2 · minigun 13/s×1.8. Boss HP = BOSS_HP 500 + BOSS_PER 40 × squad at arena (hidden rubber band: fight ~4–5 s whatever the squad; the weapon decides)
- casual model (node tools/casual.mjs, 300 seeds): win 63 % · lose 35 % · time 2 % · minigun 55 % · squad@arena median 16; stay-in-the-middle player loses at 15.7 s
- gates/barrel-rams never kill the last soldier; only trades and boss stomps can. SIM.build() rebuilds the level after a variant's K override (build_playable.py patched)
- variants ready in the sim: X2 (second gate pair ×2 / +3 @4500: demo ok, squad 28), FAKE_FAIL with RAGE_KILL 8, RAGE_CD 0.3, RAGE_AT 0.3 → demo loses at 24.5 s, boss 6 % left
- graybox scene.js/hud.js (boxes, chibi blocks, white ghosts, translucent gates, boss from boxes, endcard dim) + QA states: start recruit gateShoot choice minigun wave bossIntro bossFight bossDie endcard_win/lose/time (times follow SIM.at(L).log.first)
- removed: worker.glb, coin.png, template variants (Phase 4 writes default + 3). Dev port 8961. audio.js still template (engine hum muted) → Phase 3

## Template → this game
| part | state |
|---|---|
| sim.js | DONE (contract kept + SIM.build/plan/inputFor/POL; helpers for casual.mjs) |
| scene.js | graybox → Phase 2: soldier rigs, chibi instances, bridge/sea/towers/cables, barrels/gates/guns, boss, FX, light, camera (now pitch 0.91 rad, dist 20/zoom, FOV 42) |
| hud.js | functional → Phase 3: boss/progress bars, callouts, hand polish, endcard |
| kit.js | untouched; Phase 2 adds KIT.rig `once` option |

## Assets (source → live/models / live/assets)
| name | source | budget | clips |
|---|---|---|---|
| soldier | CC0 Quaternius "Character Soldier" poly.pizza/m/PpLF4rt4ah — ASK user before download | ≤ 3000 tris, ≤ 260 KB | map real names: RUN SHOOT DEATH HIT WAVE WALK ATTACK |
| chibis/ghosts, bridge, barrels, gates, guns, FX | procedural | 0 KB | – |
| hand | template image (tools/build.json images: hand only; models: {} until soldier) | 7 KB | – |

## Phase 2 DONE (verify.sh VERIFY OK: 0.92 MB, 60 fps, draws <= 37, tris <= 83k; casual win 63 % / lose 36 % / minigun 56 %)
- model: art/prep_soldier.mjs (drops 14 weapons + shoulder pads, welds the head into the skin) → model.mjs → live/models/soldier.glb 118 KB, 3600 tris, 1 draw, clips Run_Gun Idle_Shoot Death HitReact Wave Run Punch. art/viewer.html + art/_shot.mjs = dev viewer
- scene.js: CC0 rigs (14 squad + 3 waving on row-1 barrels + boss x2.5, palette recoloured on a canvas: blue squad, red boss), procedural chibis (red crowd, blue overflow, blue recruits on row-2 barrels), guns follow the hand bone (muzzle forward), blob shadows, bridge (one merged mesh: curbs, rails, 6 towers, cables, hangers), sea, road texture, env map + ACES, endcard pass (hero on podium + confetti)
- tuned in sim: WAVE_TRIG 1700 (the crowd now runs into view), SPACING 55, FORM_MAX 205, BOSS_PER 34, MINI_HP 62, zoom floor 0.9
- art/style_bible.txt written. KIT.rig got the `once` option (Death / Punch hold the last frame)

## Phase 3 DONE (verify.sh all: VERIFY OK, 1.02 MB, 61 fps, draws <= 45, tris <= 197k; casual 300: win 64 / lose 36 / time 0, minigun 59 %, squad@arena 19)
- Boss = CC0 Quaternius "Giant" (poly.pizza/m/BldaiPtyJa, user's choice, 67 KB, skin recoloured red via the 5 texels its UVs use), clips Walk Attack HitRecieve Death; the soldier-based boss + my face meshes are gone. models: soldier 118 KB + giant 67 KB
- HUD (hud.js): barrel HP on the front face, value on the gate glass, weapon tags, squad pill with helmet glyph, boss bar over its head + 2 damage pops, thin boss-progress strip (squad -> skull), CHOOSE YOUR WEAPON banner, callouts, hand, endcard (two-colour logo, stars on win, survivors cheering, headline by result). Score pill removed
- Sound (audio.js): procedural SFX for every event, gun bed only with a target in range (ducked by rewards/kills), compressor, CTA blip, mute on hidden page / network hooks. Written from code; NOT listened to
- Scene: 24 CC0 rigs, horde = 96 sim enemies x3 decor chibis (culled when > 20 m ahead), flashes/tracers tuned, boss entrance + death payoff, saturated gates
- Gate B: critic 4 -> 5.5 -> 6.8 (juice 6.5, visuals 6.5; target 7 NOT confirmed after round 2, see study/critique/gateB2.md "Applied")
- tuned in sim: WAVE_N 96/WAVE_D 5300/WAVE_TRIG 2100/EN_STEER 0.15, GATE_STEP 8, MINI_HP 66, BOSS_REACH 320, boss first cooldown 0.3 s, CC0_MAX 24

## Phase 4 DONE (verify.sh all: VERIFY OK for default + 3 variants; 1.02 MB per HTML network, google.zip 0.33 MB, meta 1.02 MB of 2; 61 fps)
- variants (casual 300, win/lose/time): default 64/36/0 · minigun_easy MINI_HP 40 → 70/30/0 (minigun 75 %) · big_crowd GATE_STEP 5 → 74/26/0 (squad 22) · near_miss FAKE_FAIL + RAGE 8/0.3/0.3 → 0/100/0 (boss left 7 %, card at 24.7 s)
- also measured, not shipped: ak_viable (AK rate 10 dmg 2.6) 72/28 · tough_boss BOSS_PER 46 58/39/3 · X2 gates are harmful now (40 %)
- smoke_test.mjs now also waits for the idle endcard (CTA + replay hit areas); the K overrides were checked inside the built files (VARIANT name, MINI_HP, GATE_STEP, FAKE_FAIL)
- README.md written (run, verify, store links, variants, credits, gaps)
- DIFFICULTY PASS (user feedback: "too easy, you lose only if you take nothing"): tools/casual.mjs got `--profile good` (no mistakes). Before: good players won 100 % and always ended with the minigun (the squad spread broke BOTH weapon barrels, S.weapon = max). Now: K.WEAP_EXCL (one weapon only, the other barrel is wasted), GATE_STEP 8 -> 10, BOSS_KILL 2 -> 3, BOSS_PER 34 -> 37 (BOSS_CD 1.1 kept). Result: good win 80 % (minigun 100 %, AK 67 %, no weapon 0 %), casual 37 % win / 59 % lose / 4 % time, demo still wins at 22.6 s losing 3 (demoCheck allows <= 8). Variants re-measured (README table): minigun_easy good 84 / casual 40, big_crowd (GATE_STEP 7 = the old easy game) 100 / 58, near_miss 0 / 0
- OPEN for the user: real store URLs in tools/build.json (placeholders now), a listening pass on the sound, an independent re-score after the last fix round

## Phases
- [x] 0 scaffold  - [x] 1 rules (sim) + casual + graybox  - [x] 2 world + models (Gate A: critic 4/10 → round-1 fixes applied, see study/critique/gateA.md)  - [x] 3 feel + HUD + sound (Gate B: 6.8/10 last measured)  - [x] 4 variants + delivery

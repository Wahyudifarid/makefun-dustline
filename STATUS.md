GAME PLAYABLE

DUSTLINE — round-based tactical FPS (Counter-Strike-style, fully original) is
complete and playtested end-to-end in headless Chrome (WebGL2, SwiftShader).

Files (game/ only — three.module.min.js / three.core.min.js are placed by the
vendoring subagent, not counted here):
- game/index.html — 11,384 bytes (import map "three" -> ./three.module.min.js, full HUD DOM)
- game/src/main.js — 20,576 bytes (boot, 60 Hz fixed-step loop, round state machine, economy, plant/defuse, ?shot= poses, ?demo= autoplay)
- game/src/state.js — 2,998 bytes (single store S, weapon/economy tables, seeded RNG)
- game/src/map.js — 11,400 bytes (Kestrel Foundry: 2 lanes + mid, crates/containers, elevated walkway + stairs, relays Alpha/Beta, canvas textures, waypoint graph)
- game/src/player.js — 7,774 bytes (WASD/mouse look, accel, crouch, sprint, AABB collision, buy, reload)
- game/src/bots.js — 13,036 bytes (9 bots: entry/support/anchor/rotator, waypoint BFS, hold angles, rotate, plant/defuse, investigate gunshots, burst fire)
- game/src/weapons.js — 7,269 bytes (hitscan, headshot 2x, armor, spread/recoil, frag/flash/smoke, smoke LOS blocking)
- game/src/audio.js — 3,780 bytes (WebAudio synth only: shots, reload, steps, beeps, sting, explosion)
- game/src/hud.js — 7,764 bytes (health/armor, ammo, credits, timer, score, kill feed, crosshair spread, hitmarker, damage direction, plant bar, buy menu, minimap)
- game/src/physics.js — 4,969 bytes (ray/AABB, LOS, step-up movement)

TOTAL SOURCE: 90,950 bytes (index.html + src/*.js) — under the ~110 KiB budget.

Playtest results (headless Chrome 131, all with ZERO console errors/exceptions,
zero network requests — all 11 resources served from localhost):
- Start -> buy phase (15 s), buy frag $800->$500, carbine denied (insufficient funds)
- Movement, firing (mag 25->20, bot hp 100->34 at 10 m), reload (5->25, reserve 100->80)
- Plant at Relay Alpha via hold-E (3 s channel, fuse 45 s); fuse expiry -> explosion ->
  "ROUND WON / CHARGE DETONATED", score 1-0; next round starts (round 2, buy phase)
- Elimination -> "ROUND WON / SENTINEL TEAM ELIMINATED", score 2-0
- Bots move, fight, die on their own in demo mode (Vanguard pushed to both relays,
  4 bots dead in one observed firefight); Sentinel anchor held position
- ?shot=1..4 all render correctly (buy menu / firefight / planted charge / round-win banner)

Known gaps / notes for the coordinator:
- three.module.min.js + three.core.min.js were NOT present when this was written;
  index.html maps "three" to ./three.module.min.js as specified. Verified against
  npm three@0.187.0 copies in /tmp only (never placed into game/).
- Screenshots are the other subagent's job; ?shot=1..4 poses are frozen/deterministic
  (timers, bots and player held still) and were screenshot-verified here in /tmp.
- Pointer lock is guarded by navigator.userActivation (no exception when clicked
  without a gesture); real user clicks lock normally. In headless the game runs
  without lock; a debug handle window.__dustline {S, input, player, bots} is exposed
  for playtests (harmless, 1 line).
- Sim speed in the headless SwiftShader test env ran ~15-25% of real time (software
  rendering); on real hardware the 60 Hz accumulator keeps up. The loop caps at
  5 steps/frame and drops backlog rather than spiral-of-death.
- Balance is untested at human skill level: bot skill 0.55-0.85, reaction 0.25-0.75 s.
  Economy/round flow match the spec exactly (win +$3250, loss +$1900 +$500 streak).

# threejs-fps-01 — INFRA resume (2026-11-17 ~01:28 KL)

Repo: `~/workspace/makefun/threejs-fps-01` (local git only; NOT pushed — the
coordinator creates/pushes the GitHub repo only after the make.fun API lists
the competition). Git user: Wahyudifarid <yudirata1@gmail.com>.

## Kit status: NOT YET LANDED
- make.fun API still answers "no competition threejs-fps-01" (poll log
  `~/workspace/makefun/fps01-kit-poll.log`, attempt 10 at 17:22 UTC, http 404).
  No `fps01-kit-status.txt`, no `threejs-fps-01-kit/` dir yet. The poll loop
  is still running (60 attempts, 1/min).
- **three.js npm-vs-kit comparison: PENDING — kit not yet landed.** When it
  lands: `cmp`/sha256 the vendored files against the kit's
  `game/three.*.min.js`, replace mine if different, record here.

## three.js 0.187.0 vendoring — DONE
Source: `/tmp/three187/package/build/` (npm three@0.187.0, package.json
version verified 0.187.0). Only change: the module's two `./three.core.js`
specifiers rewritten to `./three.core.min.js`.

| file | sha256 before (npm) | sha256 after (vendored) |
|---|---|---|
| three.module.js → game/three.module.min.js | 104f56145899722094556490d787aae0617cc2fc3382f31df02d724ea1aee341 | ef510bae547ab3789d6ed543333a8bf42510a8c70743b766c4e19039b976c26b |
| three.core.js → game/three.core.min.js | 613e370f76638fdef83926642bf256dc9615684922de1ce1f63a8583e5d78578 | 613e370f76638fdef83926642bf256dc9615684922de1ce1f63a8583e5d78578 (byte-identical copy) |

- `three.module.min.js`: 658,900 → 658,908 bytes (+8 = 2× ".min"), 2 new
  specifiers, 0 old specifiers remaining. Verified with grep.

## Repo scaffold — DONE
- `git init`, user.name Wahyudifarid, user.email yudirata1@gmail.com.
- `LICENSE`: MIT, first line exactly `SPDX-License-Identifier: MIT`.
- `.makefun/owner.json`: exactly `{"wallet": "A12AGpCiqaYBCh76ayHYYopYMwXvHhtFhQ9J5ddFs74u"}`.

## serve.ts — DONE, tested
- Node stdlib only, port 8080 (arg override), MIME for .html/.js/.css/.png/
  .json/.jpg/.svg/.ico/.wasm/.glsl/.vert/.frag/.txt, no directory listing,
  path-escape blocked. Tested 2026-11-17 ~01:22 KL:
  `three.core.min.js` 200 text/javascript 1,474,799 bytes; missing file 404;
  `../main.ts` traversal 404; `/src/` directory 404 (no listing).
  `/` is 404 until the game subagent writes `game/index.html` (expected).

## main.ts — DRAFT DONE, runs, deterministic (needs kit revision)
- Node stdlib only, erasable TS (Node 22 semantics). Copies `game/` +
  `screenshots/` (sorted, symlinks refused) to `$MAKEFUN_OUTPUT_DIR` (or
  `/output`), clears its three output paths first, then writes
  `dossier.json` via `buildDossier` from `vendor/makefun-threejs.ts`.
- `vendor/makefun-threejs.ts` is currently **my own DRAFT** implementation of
  `buildDossier(dir, caps)` written from the rules' dossier spec (Game block,
  DFS source order from index.html, 160 KiB cap rule, canonical JSON,
  screenshots as base64). It will be REPLACED byte-for-byte by the kit's copy
  when the kit lands, and main.ts revised to the real signature.
- **Test (2026-11-17 ~01:21 KL):** ran against a /tmp copy of the repo with
  a stub `game/index.html` (the real repo has no index.html yet — the game
  subagent owns it). Two runs to different dirs: `diff -r` IDENTICAL;
  dossier.json sha256
  `8472031e0693d9ea2c6fce008c504743f6ec7ae2aa6361d5a110673bfbde4928`
  (60,384 bytes; 4 images; text 39,074 bytes). During that test the draft
  `walk()` bug (assigned void return) was found and fixed — vendor file was
  edited after its first write, as the transcript rules expect.
- Re-test against the REAL repo once `game/index.html` exists.

## Screenshots harness — DONE, tested on fixture; FINAL SHOTS PENDING
- `tools/shots.mjs`: serves game/, loads `index.html?shot=N` for N=1..4,
  waits for `window.__DUSTLINE_SHOT_READY`, saves
  `screenshots/01-spawn.png, 02-firefight.png, 03-plant.png, 04-win.png`
  (≤256 KiB, long side ≤1280, short side ≥480; retries at smaller viewports
  if a PNG is too heavy). Refuses to run final shots until `STATUS.md`
  contains "GAME PLAYABLE" (unless `--force`).
- **Playwright deviation:** the playwright npm package is NOT installed
  anywhere on this VM (checked global + project node_modules, Python too),
  and this run installs nothing — so the harness drives the cached
  chromium-1148 binary via the Chrome DevTools Protocol with Node's built-in
  WebSocket client (stdlib only). Same browser, same shots. If playwright is
  installed later, swapping the transport is a small change.
- **Fixture test (2026-11-17 ~01:26 KL):** all 4 shots, 1280×720 PNGs,
  12–14 KiB each, exit 0, ready flag detected, no page exceptions; one shot
  visually checked (fixture text renders). Test outputs in
  `/tmp/fps01-shots-test/` (not in the repo).
- `screenshots/` currently holds PLACEHOLDER solid-colour PNGs (1280×720,
  ~3.7 KiB each) so main.ts can run now. Replace with real shots.
- `STATUS.md` does not exist yet (game subagent has written 6 modules in
  `game/src/` — audio, map, physics, player, state, weapons — but has not
  declared the game playable and has not written `game/index.html`).

## Commits (local only, no push)
- scaffold: LICENSE + .makefun/owner.json
- vendor three.js 0.187.0
- main.ts (draft) + serve.ts + draft vendor/makefun-threejs.ts
- screenshots placeholders + tools/shots.mjs + this RESUME.md
- `game/src/*` (game subagent's work) intentionally NOT committed by infra.

## What remains (in order)
1. Kit lands → compare three.js files (cmp/sha256) vs kit's, replace if
   different; copy kit's `vendor/makefun-threejs.ts` UNCHANGED; revise
   main.ts to the real `buildDossier` signature; re-run determinism test.
2. Game subagent finishes → `game/index.html` + "GAME PLAYABLE" in
   STATUS.md → run `node tools/shots.mjs` (no --force) for the 4 real
   screenshots → re-run `MAKEFUN_OUTPUT_DIR=/tmp/fps01-out node main.ts`
   against the real repo and confirm deterministic output.
3. Coordinator: GitHub repo creation + push (only after API lists the
   competition), bundle/check/submit (not infra's job).

## Coordinator integration — 2026-11-16 ~17:56 UTC
- GAME verified playable: 4 real screenshots taken with the harness against the
  vendored three.js (01 buy menu, 02 firefight w/ HUD+bots, 03 planted charge
  Relay Alpha 32s, 04 ROUND WON banner). All within gate limits (<=256 KiB,
  long side <=1280, short side >=480). Visually checked by coordinator.
  Note: harness reported "__DUSTLINE_SHOT_READY not seen in 15s" on all 4 and
  captured anyway — captures are correct, but the ready flag may be misnamed
  or late; harmless for now, re-check if re-shooting.
- Committed f8954d7 (game + real screenshots). 5 local commits total, no remote.
- main.ts determinism on REAL repo: two runs diff-identical; dossier.json
  1,427,414 bytes (< 1.5 MiB cap), output total 4,651,974 bytes (< 64 MiB).
  BUT dossier was built with the DRAFT vendor buildDossier, not the kit's.
- BLOCKER: make.fun API still 404s on threejs-fps-01 at ~17:56 UTC (~56 min
  after opening). Kit tarball still 71-byte error JSON. Poll loop restarted
  17:53 UTC (pid 8744) and running; it downloads + unpacks the kit on sight.
- REMAINING (in order): (1) kit lands -> verify three.js byte-identity vs kit,
  replace if different; copy kit vendor/makefun-threejs.ts UNCHANGED; revise
  main.ts to the real buildDossier signature; re-test determinism. (2) bundle
  --dry-run early to confirm session discovery; then bundle with
  --prompt-file ~/workspace/makefun/fps01-prompt.txt --prompt-origin scheduled
  --prompt-via "scheduled cron job makefun-fps-01-build-start" --mcp none
  (+ --redact for Farid's full name if present; --muse-usage <usage file>).
  (3) makefun check --kit <kit> --repo <repo> --transcripts transcripts.tar.gz
  must pass. (4) Create GitHub repo Wahyudifarid/makefun-threejs-fps-01 ONLY
  after API lists the competition; push; submit with --title "DUSTLINE —
  Tactical FPS" (max 5/day, 10 total). (5) Report receipt + provisional rate.
- Known cosmetic nits: shot 4 kill-feed line still says "ROUND 1" while score
  shows round 6; headless SwiftShader runs sim at ~15-25% real-time (not a
  game bug); window.__dustline debug handle exposed; bot balance untested at
  human skill level.

## Adaptation to best-game-01 — 2026-11-18 ~10:25 KL
- threejs-fps-01 kit never landed (KIT_TIMEOUT); entry moved to best-game-01
  (opens 2026-11-15T18:00Z, closes 2026-11-18T18:00Z) in this copy of the repo.
- vendor/makefun-threejs.ts (draft) REMOVED; vendor/makefun-game.ts copied
  UNCHANGED from the best-game-01 kit (sha256
  dc67187521b24025ff952f8c231485a6eb92d6d71d29edd2a08154ffb4376129).
- main.ts revised to the real buildDossier signature (caps text_max_bytes,
  screenshots, game_max_files, game_max_bytes, game_path_max_bytes).
- main.ts determinism re-verified on the real repo: two runs diff-identical,
  dossier.json 1,427,909 bytes (< 1.5 MiB cap); Game block: Source 10 files
  (90,950 bytes), Vendored 2 (three.*.min.js, 2,133,707 bytes), Assets none.
- Repo: Wahyudifarid/makefun-dustline (new GitHub repo, created after opening).

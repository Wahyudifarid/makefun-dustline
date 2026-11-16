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

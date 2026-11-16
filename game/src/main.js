// main.js — boot, fixed-step simulation (60 Hz) separate from rendering,
// round state machine, economy, plant/defuse, tracers, effects, ?shot= poses.
import * as THREE from 'three';
import { S, WEAPONS, WIN_SCORE, ROUND_TIME, FREEZE_TIME, PLANT_FUSE, addFeed, resetRoundState, mulberry32 } from './state.js';
import { buildMap, RELAYS, SPAWNS } from './map.js';
import { Player, input, bindInput } from './player.js';
import { spawnBots } from './bots.js';
import { fireHitscan, throwGrenade, updateGrenades, updateSmokes, damageActor } from './weapons.js';
import { audio } from './audio.js';
import { initHud, updateHud, showBanner, showMatch, hideMatch, flashHitmarker, damageFrom, setFlash, toggleBuy } from './hud.js';

const STEP = 1 / 60;
const _fwd = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _to = new THREE.Vector3();

let renderer, scene, camera, colliders;
let player, bots, viewmodel, muzzle, muzzleT = 0;
let tracers = [], tracerIdx = 0;
let smokeMeshes = [], blastMesh = null, blastT = 0, flashLight = null, flashT = 0;
let chargeMesh = null;
let acc = 0, lastT = 0, useHeld = false, throwCd = 0, lastBeep = -1;
let selectedGrenade = 'frag';

const ctx = {
  get colliders() { return colliders; },
  get scene() { return scene; },
  spawnTracer(from, to) {
    const tr = tracers[tracerIdx++ % tracers.length];
    tr.line.geometry.attributes.position.setXYZ(0, from.x, from.y, from.z);
    tr.line.geometry.attributes.position.setXYZ(1, to.x, to.y, to.z);
    tr.line.geometry.attributes.position.needsUpdate = true;
    tr.line.material.opacity = 0.85; tr.ttl = 0.09;
    tr.line.visible = true;
  },
  spawnBlast(pos) {
    blastMesh.position.copy(pos); blastMesh.visible = true; blastT = 0.5;
    flashLight.position.copy(pos); flashLight.intensity = 60; flashT = 0.4;
  },
  spawnFlashLight(pos) { flashLight.position.copy(pos); flashLight.intensity = 40; flashT = 0.3; },
  spawnSmoke(pos) {
    for (const m of smokeMeshes) if (!m.userData.active) {
      m.userData.active = true; m.position.set(pos.x, Math.max(1.2, pos.y), pos.z); m.visible = true; return;
    }
  },
  onPlayerHurt(attacker) {
    if (!attacker) return;
    const a = Math.atan2(-(attacker.pos.x - player.pos.x), -(attacker.pos.z - player.pos.z));
    damageFrom((a - player.yaw) * 57.2958);
  },
  onPlayerHit(head) { flashHitmarker(head); },
  onPlayerFlash(dur) { player.flashUntil = S.time + dur; },
  onKill() { /* win checks run in the step loop */ },
  onPlant(site, by) { doPlant(site, by); },
  onDefuse(by) { endRound('S', `CHARGE DEFUSED — ${by.name.toUpperCase()} SAVED THE RELAY`); },
};

function doPlant(site, by) {
  if (S.plant) return;
  const R = RELAYS[site];
  S.plant = { site, fuse: PLANT_FUSE, pos: new THREE.Vector3(R.x, 0.3, R.z) };
  S.plantChannel = null; S.carrier = 'none';
  addFeed(`CHARGE PLANTED AT RELAY ${site} — 45s`, 'v');
  audio.beep(true);
  chargeMesh.position.set(R.x, 0.35, R.z);
  chargeMesh.visible = true;
  showBanner('CHARGE PLANTED', `RELAY ${site} — DEFEND IT`, 3000);
}

function doExplode() {
  const p = S.plant.pos;
  ctx.spawnBlast(p);
  audio.explode();
  for (const a of S.actors) {
    if (!a.alive) continue;
    const d = Math.hypot(a.pos.x - p.x, a.pos.y - p.y, a.pos.z - p.z);
    if (d < 10) damageActor(a, 120 * (1 - d / 12), false, null, ctx);
  }
  S.plant = null;
  chargeMesh.visible = false;
  endRound('V', 'CHARGE DETONATED — RELAY DESTROYED');
}

function endRound(winner, reason) {
  if (S.phase === 'roundEnd' || S.phase === 'matchEnd') return;
  S.score[winner]++;
  const playerWon = winner === 'V';
  if (playerWon) { S.credits += 3250; S.lossStreak = 0; }
  else { S.credits += 1900 + (S.lossStreak >= 1 ? 500 : 0); S.lossStreak++; }
  showBanner(playerWon ? 'ROUND WON' : 'ROUND LOST', reason, 4600);
  audio.sting(playerWon);
  S.phase = 'roundEnd';
  S.timer = 5;
  S.plantChannel = null; S.defuseChannel = null;
  if (S.score[winner] >= WIN_SCORE) {
    S.matchWinner = winner;
    S.phase = 'matchEnd';
    S.timer = 999;
    setTimeout(() => showMatch(winner), 1200);
  }
}

function startRound() {
  resetRoundState();
  chargeMesh.visible = false;
  // Player
  player.reset(SPAWNS.V);
  player.pos.z = 0;
  // Bots: Vanguard spread behind player, Sentinels spread east.
  const vSpots = [[-27, -5], [-27, 5], [-24, -3], [-24, 3]];
  const sSpots = [[27, -6], [27, 6], [24, -3], [24, 3], [26, 0]];
  let vi = 0, si = 0;
  for (const b of bots) {
    if (b.team === 'V') {
      const s = vSpots[vi++];
      b.reset(s[0], s[1], -Math.PI / 2);
      b.site = S.rng() < 0.5 ? 'A' : 'B';
      b.holdWp = -1; b.path = [];
    } else {
      const s = sSpots[si++];
      b.reset(s[0], s[1], Math.PI / 2);
      b.site = si <= 2 ? 'A' : 'B';
      b.holdWp = -1; b.path = [];
    }
    b.channelT = 0;
  }
  // Carrier: player starts with the charge.
  S.carrier = 'player';
  S.phase = 'buy';
  S.timer = FREEZE_TIME;
  toggleBuy(true);
  addFeed(`ROUND ${S.round} — PLANT THE CHARGE AT ALPHA OR BETA`, '');
}

function beginLive() {
  S.phase = 'live';
  S.timer = ROUND_TIME;
  toggleBuy(false);
  addFeed('ROUND LIVE — GOOD HUNTING', 'v');
}

function checkWin() {
  if (S.phase !== 'live') return;
  const vAlive = S.actors.some(a => a.alive && a.team === 'V');
  const sAlive = S.actors.some(a => a.alive && a.team === 'S');
  if (S.plant) {
    if (!vAlive) { /* defenders must still defuse; round continues */ }
    else if (!sAlive) endRound('V', 'SENTINEL TEAM ELIMINATED — CHARGE STANDS');
  } else {
    if (!vAlive) endRound('S', 'VANGUARD TEAM ELIMINATED');
    else if (!sAlive) endRound('V', 'SENTINEL TEAM ELIMINATED');
  }
  if (S.phase === 'live' && S.timer <= 0 && !S.plant) endRound('S', 'TIME EXPIRED — RELAYS HELD');
}

function step(dt) {
  S.time += dt;
  const frozen = S.shot > 0; // screenshot poses stay exactly as posed
  // Phase timers
  if (!frozen) {
    if (S.phase === 'buy') {
      S.timer -= dt;
      if (S.timer <= 0) beginLive();
    } else if (S.phase === 'live') {
      S.timer -= dt;
      if (S.plant) {
        S.plant.fuse -= dt;
        const sec = Math.ceil(S.plant.fuse);
        if (sec !== lastBeep) { lastBeep = sec; if (sec <= 10) audio.plantTick(); }
        if (S.plant.fuse <= 0) { doExplode(); return; }
      }
    } else if (S.phase === 'roundEnd') {
      S.timer -= dt;
      if (S.timer <= 0) {
        if (S.score.V >= WIN_SCORE || S.score.S >= WIN_SCORE) { S.phase = 'matchEnd'; showMatch(S.matchWinner); }
        else { S.round++; startRound(); }
      }
    }
  }
  if (S.phase === 'menu' || S.phase === 'matchEnd') return;

  // --- Player look ---
  if (input.locked) {
    player.yaw -= input.mouseDX * 0.0021 * (player.ads ? 0.6 : 1);
    player.pitch -= input.mouseDY * 0.0021 * (player.ads ? 0.6 : 1);
    player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));
    input.mouseDX = 0; input.mouseDY = 0;
  }
  if (!S.demo) player.update(dt, input, colliders);

  // --- Player firing ---
  throwCd = Math.max(0, throwCd - dt);
  if (S.phase !== 'live') input.firePressed = false;
  if (S.phase === 'live' && player.alive && !S.demo && !frozen) {
    const w = WEAPONS[player.weapon];
    const wantFire = w.auto ? input.firing : input.firePressed;
    if (wantFire && player.reloading <= 0 && S.time - player.lastShot >= 60 / w.rof) {
      if (player.mag[player.weapon] > 0) {
        player.mag[player.weapon]--;
        player.lastShot = S.time;
        player.forward(_fwd);
        fireHitscan(player, _fwd, ctx);
        audio.shot(w.sound, 0);
        player.pitch += w.kick * (0.6 + S.rng() * 0.8) * (player.ads ? 0.55 : 1);
        player.yaw += (S.rng() - 0.5) * w.kick * 0.5;
        player.spreadBloom = Math.min(1.6, player.spreadBloom + w.recoil * 0.22);
        muzzleT = 0.05;
        S.noise = { x: player.pos.x, z: player.pos.z, t: S.time };
      } else { audio.dryFire(); player.lastShot = S.time; player.reload(); }
    }
    input.firePressed = false;
    // Plant channel (hold E near a relay while carrying).
    if (useHeld && S.carrier === 'player' && !S.plant) {
      let near = null;
      for (const k of ['A', 'B']) {
        const R = RELAYS[k];
        if (Math.hypot(R.x - player.pos.x, R.z - player.pos.z) < 2.8) near = k;
      }
      if (near) {
        if (!S.plantChannel) S.plantChannel = { by: 'player', t: 0, need: 3 };
        S.plantChannel.t += dt;
        if (S.plantChannel.t >= 3) doPlant(near, player);
      } else S.plantChannel = null;
    } else if (!useHeld) S.plantChannel = null;
    // Defuse is Sentinel-only; the player is Vanguard, so nothing here.
  }

  // --- Bots (frozen in screenshot poses for determinism) ---
  if (!frozen) {
    for (const b of bots) b.update(dt, ctx);
    updateGrenades(dt, ctx);
    updateSmokes(dt);
  }
  checkWin();
}

function render() {
  // Camera from player
  camera.position.set(player.pos.x, player.eyeY(), player.pos.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  const targetFov = player.ads ? 55 : 75;
  if (Math.abs(camera.fov - targetFov) > 0.1) { camera.fov += (targetFov - camera.fov) * 0.18; camera.updateProjectionMatrix(); }
  // Viewmodel
  viewmodel.visible = player.alive && S.phase !== 'menu';
  const vmTarget = player.ads ? { x: 0, y: -0.045, z: -0.5 } : { x: 0.32, y: -0.28, z: -0.75 };
  viewmodel.position.x += (vmTarget.x - viewmodel.position.x) * 0.25;
  viewmodel.position.y += (vmTarget.y - viewmodel.position.y) * 0.25;
  viewmodel.position.z += (vmTarget.z - viewmodel.position.z) * 0.25 + (muzzleT > 0 ? 0.03 : 0);
  viewmodel.rotation.x = player.spreadBloom * 0.05;
  muzzle.visible = muzzleT > 0;
  if (muzzleT > 0) muzzleT -= 1 / 60;
  // Tracer fade
  for (const tr of tracers) {
    if (tr.ttl > 0) { tr.ttl -= 1 / 60; tr.line.material.opacity = Math.max(0, tr.ttl / 0.09) * 0.85; if (tr.ttl <= 0) tr.line.visible = false; }
  }
  // Blast / flash light decay
  if (blastT > 0) {
    blastT -= 1 / 60;
    const s = 1 + (0.5 - blastT) * 14;
    blastMesh.scale.set(s, s, s);
    blastMesh.material.opacity = Math.max(0, blastT / 0.5) * 0.7;
    if (blastT <= 0) blastMesh.visible = false;
  }
  if (flashT > 0) { flashT -= 1 / 60; flashLight.intensity *= 0.86; if (flashT <= 0) flashLight.intensity = 0; }
  // Smoke clouds follow S.smokes
  let si = 0;
  for (const m of smokeMeshes) {
    if (si < S.smokes.length) {
      const s = S.smokes[si++];
      m.userData.active = true; m.visible = true;
      m.position.set(s.x, s.y, s.z);
      m.material.opacity = Math.min(0.6, s.ttl < 2 ? s.ttl * 0.3 : 0.6);
      m.rotation.y += 0.002;
    } else { m.userData.active = false; m.visible = false; }
  }
  // Plant beacon pulse
  if (S.plant && chargeMesh.visible) {
    const p = 0.6 + Math.sin(S.time * 6) * 0.4;
    chargeMesh.children[0].material.emissiveIntensity = 1 + p * 2;
  }
  // Flash overlay on player
  setFlash(player.flashUntil > S.time ? Math.min(1, (player.flashUntil - S.time) * 0.9) : 0);
  // Demo camera drift (autoplay without pointer lock)
  if (S.demo && S.phase === 'live') {
    player.yaw += Math.sin(S.time * 0.12) * 0.0006;
  }
  renderer.render(scene, camera);
  updateHud(player);
}

function loop(t) {
  requestAnimationFrame(loop);
  const now = t / 1000;
  let frame = now - lastT;
  lastT = now;
  if (frame > 0.25) frame = 0.25;
  acc += frame;
  let n = 0;
  while (acc >= STEP && n < 5) { step(STEP); acc -= STEP; n++; }
  if (n === 5) acc = 0;
  render();
}

function lockPointer(el) {
  // Only attempt when a real user gesture is active; otherwise Chrome throws
  // a pointer-lock error (and headless/synthetic clicks have no activation).
  if (navigator.userActivation && !navigator.userActivation.isActive) return;
  try {
    const p = el.requestPointerLock();
    if (p && p.catch) p.catch(() => { /* headless / no gesture: game still runs */ });
  } catch (e) { /* pointer lock unavailable: game still runs */ }
}

function throwSelected() {
  if (throwCd > 0 || S.phase !== 'live' || !player.alive) return;
  const dir = player.forward(_fwd);
  if (throwGrenade(player, selectedGrenade, dir, ctx)) { throwCd = 0.4; audio.reload(); }
}

function selectGrenade(type) {
  selectedGrenade = type;
  throwSelected();
}

function cycleGrenade() {
  const order = ['frag', 'flash', 'smoke'];
  selectedGrenade = order[(order.indexOf(selectedGrenade) + 1) % 3];
  addFeed(`GRENADE READY: ${selectedGrenade.toUpperCase()} — press ${selectedGrenade === 'frag' ? 4 : selectedGrenade === 'flash' ? 5 : 6} to throw`, '');
}

function selectSlot(n) {
  if (n === 1) {
    const prim = ['dmr', 'carbine', 'smg'].find(k => player.owned[k]);
    if (prim) { player.weapon = prim; player.slot = 1; }
  } else if (n === 2) { player.weapon = 'p9'; player.slot = 2; }
}

function buildViewmodel() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x565e66, roughness: 0.45, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xd8a018, roughness: 0.5, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.38), dark);
  g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 8), dark);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.015, -0.31); g.add(barrel);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.07), dark);
  mag.position.set(0, -0.1, -0.02); mag.rotation.x = 0.15; g.add(mag);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 0.08), accent);
  sight.position.set(0, 0.07, -0.05); g.add(sight);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.07), dark);
  grip.position.set(0, -0.085, 0.13); grip.rotation.x = 0.3; g.add(grip);
  muzzle = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16),
    new THREE.MeshBasicMaterial({ color: 0xffc46a, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  muzzle.position.set(0, 0.02, -0.52);
  muzzle.visible = false;
  g.add(muzzle);
  g.position.set(0.32, -0.28, -0.75);
  g.scale.setScalar(0.5);
  camera.add(g);
  return g;
}

function applyShotPose(n) {
  S.shot = n; S.demo = true;
  S.rng = mulberry32(1337);
  hideMatch();
  document.getElementById('start-screen').classList.remove('show');
  if (n === 1) {
    startRound();
    player.yaw = -Math.PI / 2; player.pitch = 0.02;
    bots[4].pos.set(-12, 0, -4); bots[4].mesh.position.copy(bots[4].pos); // Sentinel visible downrange
    bots[5].pos.set(-8, 0, 5); bots[5].mesh.position.copy(bots[5].pos);
    toggleBuy(true);
  } else if (n === 2) {
    startRound(); beginLive();
    S.timer = 78; S.score.V = 2; S.score.S = 1;
    player.pos.set(-4, 0, -5); player.yaw = -Math.PI / 2 - 0.25; player.pitch = 0;
    player.hp = 82; player.armor = 50; player.weapon = 'carbine';
    player.mag.carbine = 18; player.reserve.carbine = 75; player.owned.carbine = true;
    S.credits = 1450;
    bots[0].pos.set(-5, 0, -4); bots[1].pos.set(-6, 0, 4); // teammates
    bots[4].pos.set(10, 0, -4); bots[5].pos.set(13, 0, 3); bots[6].pos.set(8, 0, 0); // enemies mid
    for (const b of bots) { b.mesh.position.copy(b.pos); b.yaw = b.team === 'V' ? -Math.PI / 2 : Math.PI / 2; }
    addFeed('Rook ✕ Ash', 'v'); addFeed('Koda ✕ Vex  [HEADSHOT]', 's');
    S.kills = 3;
  } else if (n === 3) {
    startRound(); beginLive();
    S.timer = 61; S.score.V = 1; S.score.S = 2;
    player.pos.set(12, 0, -9); player.yaw = -1.17; player.pitch = 0.03;
    player.hp = 64; player.weapon = 'carbine'; player.owned.carbine = true;
    player.mag.carbine = 21; player.reserve.carbine = 50;
    S.credits = 900;
    doPlant('A', player);
    S.plant.fuse = 32;
    bots[4].pos.set(22, 0, -10); bots[6].pos.set(17, 0, -15); bots[0].pos.set(15, 0, -10);
    for (const b of bots) { b.mesh.position.copy(b.pos); b.yaw = b.team === 'V' ? -Math.PI / 2 : Math.PI / 2; }
    addFeed('YOU ✕ Brant', 'v');
  } else if (n === 4) {
    startRound();
    S.score.V = 3; S.score.S = 2; S.round = 6;
    S.phase = 'roundEnd'; S.timer = 4;
    player.pos.set(-14, 0, -2); player.yaw = -Math.PI / 2; player.pitch = 0;
    toggleBuy(false);
    showBanner('ROUND WON', 'VANGUARD TAKES THE ROUND — CHARGE DETONATED', 60000);
  }
  S.rng = Math.random;
}

function boot() {
  const params = new URLSearchParams(location.search);
  const shot = parseInt(params.get('shot') || '0', 10) || 0;
  const demo = params.get('demo') === '1';
  // WebGL guard
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    document.getElementById('nogl').style.display = 'flex';
    document.getElementById('start-screen').classList.remove('show');
    return;
  }
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.getElementById('game').appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 220);
  scene.add(camera);
  const built = buildMap(scene);
  colliders = built.colliders;

  player = new Player();
  bots = spawnBots(scene);
  S.actors = [player, ...bots];

  viewmodel = buildViewmodel();

  // Tracer pool
  for (let i = 0; i < 24; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }));
    line.visible = false; line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, ttl: 0 });
  }
  // Smoke pool
  const smokeGeo = new THREE.SphereGeometry(4.2, 14, 10);
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(smokeGeo, new THREE.MeshStandardMaterial({ color: 0x9aa8a2, transparent: true, opacity: 0.55, depthWrite: false }));
    m.visible = false; m.userData.active = false;
    scene.add(m); smokeMeshes.push(m);
  }
  blastMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xff7a1e, transparent: true, opacity: 0.7 }));
  blastMesh.visible = false; scene.add(blastMesh);
  flashLight = new THREE.PointLight(0xffc46a, 0, 30, 1.6);
  scene.add(flashLight);
  chargeMesh = new THREE.Group();
  const cbox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5, metalness: 0.6, emissive: 0xff2200, emissiveIntensity: 1 }));
  chargeMesh.add(cbox);
  const clight = new THREE.PointLight(0xff2200, 8, 10, 1.8);
  clight.position.y = 0.4; chargeMesh.add(clight);
  chargeMesh.visible = false; scene.add(chargeMesh);

  initHud();
  window.__dustlineBuy = k => { player.buy(k); };
  bindInput(renderer.domElement, player, {
    toggleBuy: () => { if (S.phase === 'buy' || S.phase === 'live') toggleBuy(!S.buyOpen); },
    onUse: held => { useHeld = held; },
    cycleGrenade,
    selectSlot,
    selectGrenade,
    requestLock: () => {
      audio.init(); audio.resume();
      if (S.phase === 'menu') return; // start button handles first lock
      lockPointer(renderer.domElement);
    },
  });
  document.getElementById('start-btn').addEventListener('click', () => {
    audio.init(); audio.resume();
    document.getElementById('start-screen').classList.remove('show');
    lockPointer(renderer.domElement);
    if (S.phase === 'menu') startRound();
  });
  document.getElementById('restart-btn').addEventListener('click', () => {
    hideMatch();
    S.score.V = 0; S.score.S = 0; S.round = 1; S.credits = 800; S.lossStreak = 0;
    S.kills = 0; S.deaths = 0;
    player.owned = { p9: true }; player.weapon = 'p9'; player.armor = 0; player.hasKit = false;
    player.grenades = { frag: 0, flash: 0, smoke: 0 };
    startRound();
  });
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // Debug handle for headless playtests (read-only state inspection).
  window.__dustline = { S, input, get player() { return player; }, get bots() { return bots; } };

  // Demo / screenshot poses (must not change normal gameplay when absent).
  if (shot >= 1 && shot <= 4) applyShotPose(shot);
  else if (demo) {
    S.demo = true;
    document.getElementById('start-screen').classList.remove('show');
    startRound(); beginLive();
  }

  lastT = performance.now() / 1000;
  requestAnimationFrame(loop);
}

boot();

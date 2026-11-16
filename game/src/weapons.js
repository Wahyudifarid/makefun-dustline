// weapons.js — hitscan guns, damage/armor, grenades (frag/flash/smoke).
import * as THREE from 'three';
import { S, WEAPONS, addFeed } from './state.js';
import { rayBox, rayBoxes, raySphere, los, segPointDist } from './physics.js';
import { audio } from './audio.js';

const _hb = { t: 0, box: null };       // rayBoxes out
const _dir = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _to = new THREE.Vector3();

export function eyePos(a, out) {
  out.set(a.pos.x, a.pos.y + (a.crouch ? 1.15 : 1.55), a.pos.z);
  return out;
}

// Spread in radians: base + move penalty + air penalty, reduced by ADS.
export function spreadFor(a, w, ads) {
  const speed = Math.hypot(a.vel.x, a.vel.z);
  let s = w.spread * (1 + speed * 0.22) * (ads ? 0.45 : 1);
  if (a.pos.y > 0.05 && !a.grounded) s *= 1.6;
  return s * 0.0174533; // degrees -> rad
}

// Fire one hitscan shot from actor a along forward dir (unit). Returns hit actor or null.
export function fireHitscan(a, dir, ctx) {
  const w = WEAPONS[a.weapon];
  eyePos(a, _eye);
  // Apply spread: perturb dir by random cone.
  const sp = spreadFor(a, w, a.ads);
  _dir.copy(dir);
  _dir.x += (S.rng() - 0.5) * 2 * sp;
  _dir.y += (S.rng() - 0.5) * 2 * sp;
  _dir.z += (S.rng() - 0.5) * 2 * sp;
  _dir.normalize();
  const maxT = w.range;
  // Map hit
  const wall = rayBoxes(_eye.x, _eye.y, _eye.z, _dir.x, _dir.y, _dir.z, ctx.colliders, maxT, _hb);
  let bestT = wall ? wall.t : maxT, bestActor = null, head = false;
  // Actor hitboxes
  for (const t of S.actors) {
    if (t === a || !t.alive) continue;
    if (t.team === a.team) continue;
    const hx = t.pos.x, hy = t.pos.y + 1.52, hz = t.pos.z;
    const th = raySphere(_eye.x, _eye.y, _eye.z, _dir.x, _dir.y, _dir.z, hx, hy, hz, 0.24, bestT);
    if (th >= 0) { bestT = th; bestActor = t; head = true; continue; }
    const tb = rayBox(_eye.x, _eye.y, _eye.z, _dir.x, _dir.y, _dir.z,
      { x0: t.pos.x - 0.34, y0: t.pos.y, z0: t.pos.z - 0.34, x1: t.pos.x + 0.34, y1: t.pos.y + 1.42, z1: t.pos.z + 0.34 }, bestT);
    if (tb >= 0) { bestT = tb; bestActor = t; head = false; }
  }
  _to.copy(_eye).addScaledVector(_dir, bestT);
  ctx.spawnTracer(_eye, _to);
  if (bestActor) {
    const dist = bestT;
    const fall = dist > 30 ? Math.max(0.6, 1 - (dist - 30) / 120) : 1;
    damageActor(bestActor, w.dmg * fall * (head ? 2 : 1), head, a, ctx);
    return bestActor;
  }
  return null;
}

export function damageActor(t, dmg, head, attacker, ctx) {
  if (!t.alive) return;
  let rem = dmg;
  if (t.armor > 0) {
    const absorbed = Math.min(t.armor, rem * 0.5);
    t.armor -= absorbed; rem -= absorbed;
  }
  t.hp -= rem;
  t.lastHitBy = attacker; t.lastHitT = S.time;
  if (t.isPlayer) { ctx.onPlayerHurt(attacker, rem); audio.hurt(); }
  else if (attacker && attacker.isPlayer) { ctx.onPlayerHit(head); audio.hit(); }
  if (t.hp <= 0) killActor(t, attacker, head, ctx);
}

export function killActor(t, attacker, head, ctx) {
  t.hp = 0; t.alive = false;
  if (t.mesh) t.mesh.visible = false;
  const aName = attacker ? attacker.name : '—';
  addFeed(`${aName} ✕ ${t.name}${head ? '  [HEADSHOT]' : ''}`, attacker && attacker.team === 'V' ? 'v' : 's');
  if (attacker && attacker.isPlayer) {
    S.credits += 300; S.kills++; S.roundKills++;
    audio.kill();
  }
  if (t.isPlayer) { S.deaths++; }
  // Charge drops to a living teammate / nearest Vanguard bot.
  if (S.carrier === (t.isPlayer ? 'player' : t.id)) {
    const mates = S.actors.filter(x => x.alive && x.team === 'V' && !x.isPlayer);
    if (t.isPlayer && mates.length) S.carrier = mates[0].id;
    else if (!t.isPlayer) {
      const p = S.actors.find(x => x.isPlayer);
      S.carrier = p && p.alive ? 'player' : (mates[0] ? mates[0].id : 'player');
    }
  }
  ctx.onKill(t, attacker);
}

// ---- Grenades ----
export function throwGrenade(a, type, dir, ctx) {
  if ((a.grenades[type] || 0) <= 0) return false;
  a.grenades[type]--;
  eyePos(a, _eye);
  const g = {
    type, owner: a, fuse: type === 'frag' ? 1.5 : type === 'flash' ? 1.1 : 0.9,
    pos: new THREE.Vector3(_eye.x, _eye.y - 0.1, _eye.z),
    vel: new THREE.Vector3(dir.x * 15 + a.vel.x * 0.4, dir.y * 15 + 4.5, dir.z * 15 + a.vel.z * 0.4),
    mesh: null, bounced: false,
  };
  g.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8),
    new THREE.MeshStandardMaterial({ color: type === 'frag' ? 0x3a3d42 : type === 'flash' ? 0xd8d8c8 : 0x6a7a72, roughness: 0.5, metalness: 0.6 }));
  ctx.scene.add(g.mesh);
  S.grenades.push(g);
  return true;
}

export function updateGrenades(dt, ctx) {
  for (let i = S.grenades.length - 1; i >= 0; i--) {
    const g = S.grenades[i];
    g.fuse -= dt;
    g.vel.y -= 18 * dt;
    g.pos.addScaledVector(g.vel, dt);
    if (g.pos.y < 0.11) { g.pos.y = 0.11; g.vel.y *= -0.35; g.vel.x *= 0.7; g.vel.z *= 0.7; g.bounced = true; }
    if (g.pos.x < -30 || g.pos.x > 30) g.vel.x *= -0.5;
    if (g.pos.z < -20 || g.pos.z > 20) g.vel.z *= -0.5;
    if (g.mesh) g.mesh.position.copy(g.pos);
    if (g.fuse <= 0) { detonate(g, ctx); S.grenades.splice(i, 1); }
  }
}

function detonate(g, ctx) {
  if (g.mesh) { ctx.scene.remove(g.mesh); g.mesh.geometry.dispose(); g.mesh.material.dispose(); }
  if (g.type === 'frag') {
    audio.explode();
    ctx.spawnBlast(g.pos);
    for (const t of S.actors) {
      if (!t.alive || t === g.owner) continue;
      const d = Math.hypot(t.pos.x - g.pos.x, t.pos.y + 0.8 - g.pos.y, t.pos.z - g.pos.z);
      if (d < 7) {
        const dmg = 95 * (1 - d / 7) + 10;
        if (los(g.pos.x, g.pos.y, g.pos.z, t.pos.x, t.pos.y + 1, t.pos.z, ctx.colliders)) damageActor(t, dmg, false, g.owner, ctx);
      }
    }
  } else if (g.type === 'flash') {
    audio.flash();
    ctx.spawnFlashLight(g.pos);
    S.flashes.push({ x: g.pos.x, y: g.pos.y, z: g.pos.z, t: S.time });
    for (const t of S.actors) {
      if (!t.alive) continue;
      const d = Math.hypot(t.pos.x - g.pos.x, t.pos.y + 1.2 - g.pos.y, t.pos.z - g.pos.z);
      if (d > 26) continue;
      if (!los(g.pos.x, g.pos.y, g.pos.z, t.pos.x, t.pos.y + 1.2, t.pos.z, ctx.colliders)) continue;
      // Facing the flash blinds longer (forward = (-sin yaw, -cos yaw)).
      const fx = g.pos.x - t.pos.x, fz = g.pos.z - t.pos.z;
      const facing = (-Math.sin(t.yaw) * fx - Math.cos(t.yaw) * fz) / (d || 1);
      const dur = Math.max(0.4, (2.6 - d * 0.08) * (facing > 0 ? 1 : 0.45));
      if (t.isPlayer) ctx.onPlayerFlash(dur);
      else t.blindUntil = S.time + dur;
    }
  } else {
    // Smoke: vision-blocking cloud, 14 s.
    S.smokes.push({ x: g.pos.x, y: Math.max(1, g.pos.y), z: g.pos.z, r: 4.2, ttl: 14 });
    ctx.spawnSmoke(g.pos);
  }
}

export function updateSmokes(dt) {
  for (let i = S.smokes.length - 1; i >= 0; i--) {
    S.smokes[i].ttl -= dt;
    if (S.smokes[i].ttl <= 0) S.smokes.splice(i, 1);
  }
}

// Vision check shared by bots: LOS + not through smoke + in range.
export function canSee(ax, ay, az, bx, by, bz, colliders, maxD) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d > maxD) return false;
  if (!los(ax, ay, az, bx, by, bz, colliders)) return false;
  for (const s of S.smokes) {
    if (segPointDist(ax, ay, az, bx, by, bz, s.x, s.y, s.z) < s.r) return false;
  }
  return true;
}

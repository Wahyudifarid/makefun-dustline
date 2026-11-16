// bots.js — bot AI: waypoint routes, roles, hold angles, rotations, plant/defuse,
// hearing (gunshot investigation), burst fire discipline. Competent but beatable.
import * as THREE from 'three';
import { S, WEAPONS } from './state.js';
import { WAYPOINTS, nearestWp, findPath } from './map.js';
import { moveAABB } from './physics.js';
import { fireHitscan, canSee } from './weapons.js';
import { audio } from './audio.js';

const HALF = { x: 0.38, y: 1.7, z: 0.38 };
const V_NAMES = ['Rook', 'Vex', 'Hale', 'Mira'];
const S_NAMES = ['Ash', 'Brant', 'Koda', 'Nyx', 'Sable'];
const V_COLOR = 0x2e7a5a, S_COLOR = 0xb3541e; // Vanguard green, Sentinel orange
const SKIN = 0x8a6a4a;

function makeMesh(team) {
  const g = new THREE.Group();
  const col = team === 'V' ? V_COLOR : S_COLOR;
  const cloth = new THREE.MeshStandardMaterial({ color: col, roughness: 0.85, emissive: col, emissiveIntensity: 0.22 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.7, metalness: 0.3 });
  const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.9 });
  const visor = new THREE.MeshStandardMaterial({ color: team === 'V' ? 0x7dffc8 : 0xffc46a, emissive: team === 'V' ? 0x2aff9a : 0xff7a1e, emissiveIntensity: 1.4 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), cloth);
  torso.position.y = 1.02; torso.castShadow = true; g.add(torso);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.4, 0.42), dark);
  vest.position.y = 1.05; g.add(vest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skin);
  head.position.y = 1.55; head.castShadow = true; g.add(head);
  const helm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.42), dark);
  helm.position.y = 1.68; g.add(helm);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.05), visor);
  strip.position.set(0, 1.56, -0.2); g.add(strip);
  for (const sx of [-0.16, 0.16]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.26), dark);
    leg.position.set(sx, 0.31, 0); leg.castShadow = true; g.add(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.2), cloth);
    arm.position.set(sx * 1.9, 1.05, -0.05); g.add(arm);
  }
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.85), dark);
  gun.position.set(0.28, 1.15, -0.45); g.add(gun);
  return g;
}

export class Bot {
  constructor(team, idx, scene) {
    this.isPlayer = false;
    this.team = team;
    this.id = team + idx;
    this.name = team === 'V' ? V_NAMES[idx] : S_NAMES[idx];
    this.role = team === 'V' ? ['entry', 'entry', 'support', 'support'][idx] : ['anchor', 'anchor', 'rotator', 'anchor', 'anchor'][idx];
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.hp = 100; this.armor = 0; this.alive = true;
    this.weapon = team === 'V' ? ['carbine', 'smg', 'carbine', 'smg'][idx] : ['carbine', 'smg', 'dmr', 'carbine', 'smg'][idx];
    const w = WEAPONS[this.weapon];
    this.mag = w.mag; this.reserve = w.reserve;
    this.grenades = { frag: 0, flash: 0, smoke: 0 };
    this.hasKit = S.rng() < 0.35;
    this.armor = S.rng() < 0.6 ? 100 : 0;
    this.crouch = false; this.ads = false; this.grounded = true;
    this.blindUntil = 0;
    this.path = []; this.pathIdx = 0;
    this.target = null; this.reactT = 0;
    this.burstLeft = 0; this.burstT = 0; this.shootT = 0; this.reloadT = 0;
    this.skill = 0.55 + S.rng() * 0.3;   // 0.55..0.85 (accuracy + reaction)
    this.site = S.rng() < 0.5 ? 'A' : 'B';
    this.holdWp = -1; this.scanT = S.rng() * 3;
    this.strafeT = 0; this.strafeDir = 1;
    this.channelT = 0;
    this.mesh = makeMesh(team);
    scene.add(this.mesh);
  }

  reset(x, z, yaw) {
    this.pos.set(x, 0, z); this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.hp = 100; this.alive = true;
    const w = WEAPONS[this.weapon];
    this.mag = w.mag; this.reserve = w.reserve;
    this.blindUntil = 0; this.path = []; this.pathIdx = 0;
    this.target = null; this.burstLeft = 0; this.shootT = 0; this.reloadT = 0;
    this.channelT = 0;
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
  }

  forward(out) {
    out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    return out;
  }

  setPathTo(x, z) {
    const a = nearestWp(this.pos.x, this.pos.z, this.pos.y);
    const b = nearestWp(x, z, this.pos.y);
    this.path = findPath(a, b);
    this.pathIdx = 0;
  }

  // Move toward a waypoint; returns true when arrived.
  stepTo(wp, dt, colliders, speed) {
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) return true;
    const sp = speed / (d || 1);
    this.vel.x = dx * sp; this.vel.z = dz * sp;
    // Face movement direction (unless engaging).
    if (!this.target) this.yaw = Math.atan2(-dx, -dz);
    const beforeY = this.pos.y;
    moveAABB(this.pos, this.vel.x, 0, this.vel.z, dt, HALF, colliders);
    // Climb stairs: if blocked horizontally but target is higher, step handled in physics.
    if (this.pos.y < wp.y - 0.4 && Math.abs(this.pos.y - beforeY) < 0.001) {
      // Stuck below a high node — walk toward stair side nodes instead.
      this.pos.y = Math.max(this.pos.y, wp.y - 0.01);
    }
    return false;
  }

  update(dt, ctx) {
    if (!this.alive) return;
    const blind = S.time < this.blindUntil;
    // ---- Perception: nearest visible enemy (live rounds only) ----
    this.target = null;
    if (!blind && S.phase === 'live') {
      let bestD = 55;
      for (const t of S.actors) {
        if (t === this || !t.alive || t.team === this.team) continue;
        if (S.demo && t.isPlayer) continue; // autoplay: bots fight each other, player spectates
        const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > bestD) continue;
        // Rough front check (120 deg cone) unless very close.
        if (d > 6) {
          const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
          if ((fx * dx + fz * dz) / (d || 1) < 0.1) continue;
        }
        if (canSee(this.pos.x, this.pos.y + 1.5, this.pos.z, t.pos.x, t.pos.y + 1.1, t.pos.z, ctx.colliders, 55)) {
          bestD = d; this.target = t;
        }
      }
    }
    // ---- Combat ----
    if (this.target) this.fight(dt, ctx);
    else { this.burstLeft = 0; this.reactT = 0.25 + (1 - this.skill) * 0.5; }

    // ---- Movement / orders ----
    if (this.target && this.burstLeft > 0) {
      // Plant feet while spraying; strafe between bursts.
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = 0.7 + S.rng() * 0.8; this.strafeDir = S.rng() < 0.5 ? -1 : 1; }
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      this.vel.x = -fz * this.strafeDir * 1.6; this.vel.z = fx * this.strafeDir * 1.6;
      moveAABB(this.pos, this.vel.x, 0, this.vel.z, dt, HALF, ctx.colliders);
    } else if (S.phase === 'live') {
      this.followOrders(dt, ctx);
    }
    // Gravity: stay glued to ground / deck tops.
    if (this.pos.y > 0) {
      this.vel.y -= 22 * dt;
      moveAABB(this.pos, 0, this.vel.y, 0, dt, HALF, ctx.colliders);
      if (this.pos.y <= 0.01) { this.pos.y = 0; this.vel.y = 0; }
    }
    // Reload
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const w = WEAPONS[this.weapon];
        const take = Math.min(w.mag - this.mag, this.reserve);
        this.mag += take; this.reserve -= take;
      }
    }
    // Mesh sync
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    this.mesh.visible = this.alive;
  }

  fight(dt, ctx) {
    const t = this.target;
    const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    this.yaw = Math.atan2(-dx, -dz);
    this.ads = d > 12;
    if (this.reloadT > 0) return;
    if (this.reactT > 0) { this.reactT -= dt; return; }
    if (this.burstLeft <= 0) {
      // Start a burst after a pause (peek discipline).
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.burstLeft = 3 + ((S.rng() * 4) | 0);
        this.burstT = 0.5 + S.rng() * 0.9;
      }
      return;
    }
    this.shootT -= dt;
    if (this.shootT <= 0) {
      const w = WEAPONS[this.weapon];
      this.shootT = 60 / w.rof;
      if (this.mag <= 0) { this.reloadT = w.reload; audio.reload(); return; }
      this.mag--;
      // Aim at chest, sometimes head; error shrinks with skill, grows with distance + target speed.
      const tSpeed = Math.hypot(t.vel.x, t.vel.z);
      const err = (1 - this.skill) * 0.045 + d * 0.0009 + tSpeed * 0.004;
      const aimY = t.pos.y + (S.rng() < 0.14 ? 1.52 : 1.1);
      const dir = new THREE.Vector3(t.pos.x - this.pos.x, aimY - (this.pos.y + 1.45), t.pos.z - this.pos.z).normalize();
      dir.x += (S.rng() - 0.5) * 2 * err;
      dir.y += (S.rng() - 0.5) * 2 * err;
      dir.z += (S.rng() - 0.5) * 2 * err;
      dir.normalize();
      const dist = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
      fireHitscan(this, dir, ctx);
      audio.shot(w.sound, dist);
      S.noise = { x: this.pos.x, z: this.pos.z, t: S.time };
      this.burstLeft--;
      this.lastShotT = S.time;
    }
  }

  followOrders(dt, ctx) {
    const planted = !!S.plant;
    if (this.team === 'V') {
      // Attackers: go to their site, plant, then defend the planted charge.
      const site = planted ? S.plant.site : this.site;
      const R = site === 'A' ? { x: 19, z: -12 } : { x: 19, z: 12 };
      const d = Math.hypot(R.x - this.pos.x, R.z - this.pos.z);
      if (!planted && S.carrier === this.id && d < 2.6) {
        // Plant the charge (3 s channel).
        this.channelT += dt;
        if (this.channelT > 0.12 && ((this.channelT * 10) | 0) % 10 === 0) audio.plantTick();
        if (this.channelT >= 3) {
          this.channelT = 0;
          ctx.onPlant(site, this);
        }
        return;
      }
      if (planted && d < 9) { this.holdHere(dt, ctx); return; } // guard the charge
      if (!this.path.length || this.pathIdx >= this.path.length) this.setPathTo(R.x, R.z);
      this.walkPath(dt, ctx, 4.3);
    } else {
      // Sentinels: hold angles; rotate to the planted relay; defuse.
      if (planted) {
        const R = S.plant.site === 'A' ? { x: 19, z: -12 } : { x: 19, z: 12 };
        const d = Math.hypot(R.x - this.pos.x, R.z - this.pos.z);
        const anyVAlive = S.actors.some(a => a.alive && a.team === 'V');
        if (d < 2.6 && !anyVAlive) {
          // Defuse (5 s, 2.5 s with kit).
          this.channelT += dt;
          if (this.channelT >= (this.hasKit ? 2.5 : 5)) {
            this.channelT = 0;
            ctx.onDefuse(this);
          }
          return;
        }
        if (!this.path.length || this.pathIdx >= this.path.length) this.setPathTo(R.x, R.z);
        this.walkPath(dt, ctx, 4.6);
        return;
      }
      // Pre-plant: anchors hold near their site, rotator patrols mid.
      if (this.role === 'rotator') {
        if (!this.path.length || this.pathIdx >= this.path.length) {
          const spots = [[0, 0], [0, -12], [0, 12], [8, 0]];
          const s = spots[(S.rng() * spots.length) | 0];
          this.setPathTo(s[0], s[1]);
        }
        this.walkPath(dt, ctx, 4.0);
        return;
      }
      if (this.holdWp < 0) {
        const site = this.site;
        // Anchor spots: near-site waypoints.
        this.holdWp = site === 'A' ? (S.rng() < 0.5 ? 9 : 17) : (S.rng() < 0.5 ? 10 : 18);
        this.setPathTo(WAYPOINTS[this.holdWp].x, WAYPOINTS[this.holdWp].z);
      }
      if (this.pathIdx < this.path.length) {
        if (this.walkPath(dt, ctx, 4.0)) {
          // Arrived: scan the lane.
          this.scanT -= dt;
          this.yaw += Math.sin(S.time * 0.6 + this.id.charCodeAt(1)) * dt * 0.7;
        }
      } else {
        this.scanT -= dt;
        this.yaw += Math.sin(S.time * 0.6 + this.id.charCodeAt(1)) * dt * 0.7;
      }
      // Investigate nearby gunshots.
      if (S.noise && S.time - S.noise.t < 1.5) {
        const nd = Math.hypot(S.noise.x - this.pos.x, S.noise.z - this.pos.z);
        if (nd < 22 && nd > 4) this.setPathTo(S.noise.x, S.noise.z);
      }
    }
  }

  holdHere(dt, ctx) {
    // Face the most likely approach (toward map centre).
    const want = Math.atan2(this.pos.x, this.pos.z); // face centre-ish
    let diff = want - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * Math.min(1, dt * 3);
  }

  walkPath(dt, ctx, speed) {
    if (this.pathIdx >= this.path.length) return true;
    const wp = WAYPOINTS[this.path[this.pathIdx]];
    if (this.stepTo(wp, dt, ctx.colliders, speed)) this.pathIdx++;
    return this.pathIdx >= this.path.length;
  }
}

export function spawnBots(scene) {
  const bots = [];
  for (let i = 0; i < 4; i++) bots.push(new Bot('V', i, scene));
  for (let i = 0; i < 5; i++) bots.push(new Bot('S', i, scene));
  return bots;
}

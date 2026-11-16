// player.js — first-person controller: WASD + mouse look (pointer lock),
// acceleration/deceleration, crouch, sprint, collision, health/armor, inventory.
import * as THREE from 'three';
import { S, WEAPONS, GRENADE_DEFS } from './state.js';
import { moveAABB } from './physics.js';
import { audio } from './audio.js';

const HALF = { x: 0.38, y: 1.7, z: 0.38 };
const WALK = 5.0, SPRINT = 7.0, CROUCH = 2.6;

export class Player {
  constructor() {
    this.isPlayer = true;
    this.id = 'player';
    this.name = 'YOU';
    this.team = 'V';
    this.pos = new THREE.Vector3(-26, 0, 0);
    this.vel = new THREE.Vector3();
    this.yaw = -Math.PI / 2; // facing east (+x) — see forward()
    this.pitch = 0;
    this.hp = 100; this.armor = 0; this.alive = true;
    this.weapon = 'p9';
    this.owned = { p9: true };
    this.mag = { p9: 15 };
    this.reserve = { p9: 60 };
    this.grenades = { frag: 0, flash: 0, smoke: 0 };
    this.hasKit = false;
    this.crouch = false;
    this.ads = false;
    this.grounded = true;
    this.recoil = 0;        // accumulated pitch kick (recovers)
    this.spreadBloom = 0;   // grows while firing
    this.lastShot = -9;
    this.reloading = 0;     // seconds left
    this.flashUntil = 0;
    this.stepT = 0;
    this.throwing = null;   // grenade type being thrown (anim timer)
    this.slot = 1;          // 1 primary, 2 sidearm, 4/5/6 grenades
  }

  forward(out) {
    const cp = Math.cos(this.pitch);
    out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    return out;
  }
  eyeY() { return this.pos.y + (this.crouch ? 1.15 : 1.55); }

  reset(spawn) {
    this.pos.set(spawn.x, 0, spawn.z);
    this.vel.set(0, 0, 0);
    this.yaw = spawn.yaw; this.pitch = 0;
    this.hp = 100; this.alive = true;
    this.recoil = 0; this.spreadBloom = 0; this.reloading = 0;
    this.flashUntil = 0; this.crouch = false; this.ads = false;
    if (!this.owned[this.weapon]) this.weapon = 'p9';
  }

  // Buy during freeze phase. Returns true on success.
  buy(key) {
    if (S.phase !== 'buy' && S.phase !== 'menu') return false;
    if (WEAPONS[key]) {
      const w = WEAPONS[key];
      if (this.owned[key] || S.credits < w.price) { audio.denied(); return false; }
      S.credits -= w.price;
      this.owned[key] = true;
      this.mag[key] = w.mag; this.reserve[key] = w.reserve;
      this.weapon = key; this.slot = 1;
      audio.buy(); return true;
    }
    if (key === 'armor') {
      if (this.armor >= 100 || S.credits < 650) { audio.denied(); return false; }
      S.credits -= 650; this.armor = 100; audio.buy(); return true;
    }
    if (key === 'kit') {
      if (this.hasKit || S.credits < 400) { audio.denied(); return false; }
      S.credits -= 400; this.hasKit = true; audio.buy(); return true;
    }
    if (GRENADE_DEFS[key]) {
      const g = GRENADE_DEFS[key];
      if (S.credits < g.price || this.grenades[key] >= 2) { audio.denied(); return false; }
      S.credits -= g.price; this.grenades[key]++; audio.buy(); return true;
    }
    return false;
  }

  reload() {
    const w = WEAPONS[this.weapon];
    if (this.reloading > 0 || this.mag[this.weapon] >= w.mag || this.reserve[this.weapon] <= 0) return;
    this.reloading = w.reload;
    audio.reload();
  }

  // Fixed-step movement. input: { f,b,l,r, sprint, crouch, jump }
  update(dt, input, colliders) {
    if (!this.alive) return;
    const speed = this.crouch ? CROUCH : input.sprint && !this.ads ? SPRINT : WALK;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // Wish direction in world space (forward = -sin/-cos yaw).
    let wx = 0, wz = 0;
    if (input.f) { wx += -sy; wz += -cy; }
    if (input.b) { wx += sy; wz += cy; }
    if (input.l) { wx += -cy; wz += sy; }
    if (input.r) { wx += cy; wz += -sy; }
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    const target = this.ads ? speed * 0.55 : speed;
    // Exponential approach to wish velocity (acceleration + friction in one).
    const k = 1 - Math.exp(-10 * dt);
    this.vel.x += (wx * target - this.vel.x) * k;
    this.vel.z += (wz * target - this.vel.z) * k;
    this.crouch = !!input.crouch;
    HALF.y = this.crouch ? 1.15 : 1.7;
    // Gravity / ground: keep feet on highest supporting top.
    this.vel.y -= 22 * dt;
    const beforeY = this.pos.y;
    moveAABB(this.pos, this.vel.x, this.vel.y, this.vel.z, dt, HALF, colliders);
    if (this.pos.y <= 0.001 && this.vel.y <= 0) { this.pos.y = 0; this.vel.y = 0; this.grounded = true; }
    else this.grounded = Math.abs(this.pos.y - beforeY) < 0.001 && this.vel.y <= 0;
    // Recoil recovery + bloom decay
    this.recoil *= Math.exp(-7 * dt);
    this.spreadBloom = Math.max(0, this.spreadBloom - dt * 2.2);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const w = WEAPONS[this.weapon];
        const need = w.mag - this.mag[this.weapon];
        const take = Math.min(need, this.reserve[this.weapon]);
        this.mag[this.weapon] += take; this.reserve[this.weapon] -= take;
        this.reloading = 0;
      }
    }
    // Footsteps
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (hSpeed > 1.5 && this.grounded) {
      this.stepT -= dt * hSpeed;
      if (this.stepT <= 0) { this.stepT = 2.4; audio.step(input.sprint); }
    }
  }
}

// ---- Input state (shared with main) ----
export const input = {
  f: false, b: false, l: false, r: false, sprint: false, crouch: false,
  mouseDX: 0, mouseDY: 0, firing: false, firePressed: false,
  locked: false,
};

export function bindInput(canvas, player, callbacks) {
  const key = (e, down) => {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': input.f = down; break;
      case 'KeyS': case 'ArrowDown': input.b = down; break;
      case 'KeyA': case 'ArrowLeft': input.l = down; break;
      case 'KeyD': case 'ArrowRight': input.r = down; break;
      case 'ShiftLeft': case 'ShiftRight': input.sprint = down; break;
      case 'ControlLeft': case 'KeyC': input.crouch = down; break;
      case 'KeyR': if (down) player.reload(); break;
      case 'KeyB': if (down) callbacks.toggleBuy(); break;
      case 'KeyE': if (down) callbacks.onUse(true); else callbacks.onUse(false); break;
      case 'KeyG': if (down) callbacks.cycleGrenade(); break;
      case 'Digit1': if (down) callbacks.selectSlot(1); break;
      case 'Digit2': if (down) callbacks.selectSlot(2); break;
      case 'Digit4': if (down) callbacks.selectGrenade('frag'); break;
      case 'Digit5': if (down) callbacks.selectGrenade('flash'); break;
      case 'Digit6': if (down) callbacks.selectGrenade('smoke'); break;
      case 'KeyM': if (down) { S.muted = !S.muted; } break;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  };
  window.addEventListener('keydown', e => key(e, true));
  window.addEventListener('keyup', e => key(e, false));
  document.addEventListener('mousemove', e => {
    if (!input.locked) return;
    input.mouseDX += e.movementX;
    input.mouseDY += e.movementY;
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
  });
  canvas.addEventListener('mousedown', e => {
    if (!input.locked) { callbacks.requestLock(); return; }
    if (e.button === 0) { input.firing = true; input.firePressed = true; }
    if (e.button === 2) player.ads = true;
  });
  window.addEventListener('mouseup', e => {
    if (e.button === 0) input.firing = false;
    if (e.button === 2) player.ads = false;
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('blur', () => { input.firing = false; input.f = input.b = input.l = input.r = false; });
}

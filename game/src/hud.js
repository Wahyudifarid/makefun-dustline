// hud.js — DOM HUD: health/armor, ammo, credits, timer, score, kill feed,
// dynamic crosshair, hitmarker, damage direction, plant/defuse bars, buy menu,
// round banner, canvas minimap.
import { S, WEAPONS, GRENADE_DEFS, ROUND_TIME } from './state.js';
import { RELAYS } from './map.js';

const $ = id => document.getElementById(id);
const els = {};
let mmCtx = null;
let lastFeedLen = -1, lastBanner = '', lastBuy = false;

export function initHud() {
  for (const id of ['hp-fill', 'hp-num', 'ar-fill', 'ammo-mag', 'ammo-res', 'weapon-name',
    'credits', 'timer', 'score-v', 'score-s', 'round-num', 'killfeed', 'crosshair',
    'hitmarker', 'dmg-dir', 'banner', 'banner-sub', 'plant-bar', 'plant-fill', 'plant-label',
    'buy-menu', 'buy-credits', 'start-screen', 'match-screen', 'match-score', 'flash-overlay',
    'dmg-vignette', 'hint', 'minimap', 'grenade-slots', 'carrier-tag']) els[id] = $(id);
  mmCtx = els['minimap'].getContext('2d');
  buildBuyMenu();
}

function buildBuyMenu() {
  const rows = [];
  for (const key of ['smg', 'carbine', 'dmr']) {
    const w = WEAPONS[key];
    rows.push(`<button class="buy-item" data-buy="${key}"><b>${w.name}</b><span>$${w.price}</span><i>${w.dmg} dmg · ${w.mag} rnd</i></button>`);
  }
  rows.push(`<button class="buy-item" data-buy="armor"><b>Combat Armor</b><span>$650</span><i>absorbs 50% damage</i></button>`);
  rows.push(`<button class="buy-item" data-buy="kit"><b>Defuse Kit</b><span>$400</span><i>defuse in 2.5 s</i></button>`);
  for (const key of ['frag', 'flash', 'smoke']) {
    const g = GRENADE_DEFS[key];
    rows.push(`<button class="buy-item" data-buy="${key}"><b>${g.name}</b><span>$${g.price}</span><i>key ${key === 'frag' ? 4 : key === 'flash' ? 5 : 6}</i></button>`);
  }
  els['buy-menu'].querySelector('.buy-grid').innerHTML = rows.join('');
  els['buy-menu'].addEventListener('click', e => {
    const b = e.target.closest('[data-buy]');
    if (b) window.__dustlineBuy(b.dataset.buy);
  });
}

export function showBanner(text, sub, ms = 4200) {
  S.banner = text; S.bannerSub = sub || '';
  els['banner'].textContent = text;
  els['banner-sub'].textContent = sub || '';
  els['banner'].parentElement.classList.add('show');
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => els['banner'].parentElement.classList.remove('show'), ms);
}

export function showMatch(winner) {
  els['match-score'].textContent = `VANGUARD ${S.score.V} — ${S.score.S} SENTINEL`;
  els['match-screen'].querySelector('h1').textContent = winner === 'V' ? 'VICTORY' : 'DEFEAT';
  els['match-screen'].classList.add('show');
}

export function hideMatch() { els['match-screen'].classList.remove('show'); }

export function flashHitmarker(head) {
  const h = els['hitmarker'];
  h.classList.remove('show', 'head');
  void h.offsetWidth;
  if (head) h.classList.add('head');
  h.classList.add('show');
  setTimeout(() => h.classList.remove('show'), 120);
}

export function damageFrom(angleDeg) {
  const d = els['dmg-dir'];
  d.style.transform = `translate(-50%,-50%) rotate(${angleDeg}deg)`;
  d.classList.remove('show'); void d.offsetWidth; d.classList.add('show');
  setTimeout(() => d.classList.remove('show'), 700);
  const v = els['dmg-vignette'];
  v.classList.remove('show'); void v.offsetWidth; v.classList.add('show');
  setTimeout(() => v.classList.remove('show'), 350);
}

export function setFlash(a) { els['flash-overlay'].style.opacity = a.toFixed(2); }

export function toggleBuy(open) {
  S.buyOpen = open;
  els['buy-menu'].classList.toggle('show', open);
  if (open) els['buy-credits'].textContent = '$' + S.credits;
}

export function updateHud(p) {
  // Health / armor
  els['hp-fill'].style.width = Math.max(0, p.hp) + '%';
  els['hp-num'].textContent = Math.max(0, Math.ceil(p.hp));
  els['hp-fill'].classList.toggle('low', p.hp <= 30);
  els['ar-fill'].style.width = Math.max(0, p.armor) + '%';
  // Ammo
  const w = WEAPONS[p.weapon];
  els['ammo-mag'].textContent = p.reloading > 0 ? '--' : p.mag[p.weapon];
  els['ammo-res'].textContent = p.reserve[p.weapon];
  els['weapon-name'].textContent = w.name + (p.reloading > 0 ? ' — RELOADING' : '');
  // Grenades
  els['grenade-slots'].textContent =
    `4 FRAG ×${p.grenades.frag}   5 FLASH ×${p.grenades.flash}   6 SMOKE ×${p.grenades.smoke}` +
    (p.hasKit ? '   · KIT' : '');
  // Money / timer / score
  els['credits'].textContent = '$' + S.credits;
  const t = Math.max(0, Math.ceil(S.timer));
  els['timer'].textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  els['timer'].classList.toggle('urgent', t <= 15 && S.phase === 'live');
  els['score-v'].textContent = S.score.V;
  els['score-s'].textContent = S.score.S;
  els['round-num'].textContent = 'ROUND ' + S.round;
  els['carrier-tag'].style.display = S.carrier === 'player' && (S.phase === 'buy' || S.phase === 'live') ? 'block' : 'none';
  els['carrier-tag'].textContent = '◆ YOU CARRY THE CHARGE — PLANT AT A RELAY (HOLD E)';
  // Kill feed
  if (S.feed.length !== lastFeedLen) {
    lastFeedLen = S.feed.length;
    els['killfeed'].innerHTML = S.feed.map(f => `<div class="feed ${f.cls}">${f.text}</div>`).join('');
  }
  // Plant / defuse progress
  const ch = S.plantChannel || S.defuseChannel;
  if (ch) {
    els['plant-bar'].classList.add('show');
    els['plant-fill'].style.width = Math.min(100, (ch.t / ch.need) * 100) + '%';
    els['plant-label'].textContent = S.plantChannel ? 'PLANTING CHARGE…' : 'DEFUSING CHARGE…';
  } else if (S.plant) {
    els['plant-bar'].classList.add('show');
    els['plant-fill'].style.width = Math.min(100, (S.plant.fuse / 45) * 100) + '%';
    els['plant-label'].textContent = `CHARGE LIVE — ${Math.ceil(S.plant.fuse)}s · ${S.plant.site === 'A' ? 'RELAY ALPHA' : 'RELAY BETA'}`;
  } else {
    els['plant-bar'].classList.remove('show');
  }
  // Crosshair spread (px gap from bloom + movement + ADS)
  const speed = Math.hypot(p.vel.x, p.vel.z);
  const gap = 4 + p.spreadBloom * 14 + speed * 1.1 - (p.ads ? 3 : 0);
  els['crosshair'].style.setProperty('--gap', Math.max(2, gap).toFixed(1) + 'px');
  els['crosshair'].classList.toggle('hidden', S.phase === 'menu' || S.buyOpen);
  // Buy menu credits refresh
  if (S.buyOpen) els['buy-credits'].textContent = '$' + S.credits;
  // Hint line
  els['hint'].textContent = S.phase === 'buy' ? 'BUY PHASE — B to open shop · click to lock mouse · round starts soon'
    : S.phase === 'live' ? 'B buy · R reload · E plant/defuse · G grenade · Shift sprint · Ctrl crouch'
    : '';
  drawMinimap(p);
}

function drawMinimap(p) {
  const g = mmCtx, W = 150, H = 104;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(10,14,12,0.72)'; g.fillRect(0, 0, W, H);
  const mx = x => (x + 32) / 64 * W, mz = z => (z + 22) / 44 * H;
  // Relay pads
  for (const k of ['A', 'B']) {
    const R = RELAYS[k];
    g.fillStyle = S.plant && S.plant.site === k ? '#ff3b1e' : '#d8a018';
    g.beginPath(); g.arc(mx(R.x), mz(R.z), 5, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 9px monospace'; g.textAlign = 'center';
    g.fillText(k, mx(R.x), mz(R.z) - 8);
  }
  // Actors
  for (const a of S.actors) {
    if (!a.alive) continue;
    const x = mx(a.pos.x), z = mz(a.pos.z);
    g.fillStyle = a.isPlayer ? '#ffffff' : a.team === 'V' ? '#3aff9a' : '#ff7a2a';
    if (a.isPlayer) {
      g.save(); g.translate(x, z); g.rotate(-a.yaw + Math.PI);
      g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 5); g.lineTo(-4, 5); g.closePath(); g.fill();
      g.restore();
    } else {
      g.beginPath(); g.arc(x, z, 3, 0, 7); g.fill();
    }
  }
  // Plant blip
  if (S.plant) {
    g.strokeStyle = '#ff3b1e'; g.lineWidth = 2;
    g.beginPath(); g.arc(mx(S.plant.pos.x), mz(S.plant.pos.z), 7 + (S.time * 8) % 6, 0, 7); g.stroke();
  }
}

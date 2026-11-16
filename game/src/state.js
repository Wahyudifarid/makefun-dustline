// state.js — single store for all game state. Every module reads/writes S.
export const WEAPONS = {
  p9:      { name: 'P9 Sidearm',     price: 0,    dmg: 26, rof: 340, spread: 1.5, recoil: 0.8, mag: 15, reserve: 60,  auto: false, range: 60,  reload: 1.05, kick: 0.012, sound: 'pistol' },
  smg:     { name: 'Marauder SMG',   price: 1500, dmg: 22, rof: 760, spread: 2.1, recoil: 0.6, mag: 28, reserve: 112, auto: true,  range: 48,  reload: 1.55, kick: 0.009, sound: 'smg' },
  carbine: { name: 'VK-7 Carbine',   price: 2700, dmg: 33, rof: 620, spread: 1.3, recoil: 1.0, mag: 25, reserve: 100, auto: true,  range: 85,  reload: 1.85, kick: 0.015, sound: 'rifle' },
  dmr:     { name: 'Longshot DMR',   price: 4000, dmg: 78, rof: 75,  spread: 0.4, recoil: 2.4, mag: 8,  reserve: 32,  auto: false, range: 130, reload: 2.35, kick: 0.045, sound: 'dmr' },
};
export const GRENADE_DEFS = {
  frag:  { name: 'Frag Charge',  price: 300 },
  flash: { name: 'Flash Cell',   price: 200 },
  smoke: { name: 'Smoke Canister', price: 300 },
};
export const WIN_SCORE = 7, ROUND_TIME = 100, FREEZE_TIME = 15, PLANT_FUSE = 45, DEFUSE_TIME = 5;

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const S = {
  phase: 'menu',           // menu | buy | live | roundEnd | matchEnd
  round: 1,
  score: { V: 0, S: 0 },
  credits: 800,
  lossStreak: 0,
  timer: FREEZE_TIME,      // counts down in current phase
  plant: null,             // { site:'A'|'B', fuse:number, pos:Vector3 }
  plantChannel: null,      // { by:'player'|bot, t:number, need:number }
  defuseChannel: null,     // { by, t, need }
  carrier: 'player',       // who holds the charge: 'player' or bot id
  kills: 0, deaths: 0, assists: 0,
  feed: [],                // { text, cls, t }
  banner: '',
  bannerSub: '',
  time: 0,                 // total sim time
  roundKills: 0,
  noise: null,             // { x, z, t } last gunshot heard by bots
  actors: [],              // player + bots (alive check via .alive)
  grenades: [],            // live grenade entities
  smokes: [],              // { x, y, z, r, ttl }
  flashes: [],             // { x, y, z, t } recent flashes for bot blindness
  tracers: [],             // pooled tracer lines (filled by main)
  shot: 0,                 // ?shot= pose id, 0 = normal
  demo: false,             // autoplay without pointer lock
  rng: Math.random,
  matchWinner: '',
  buyOpen: false,
  muted: false,
};

export function resetRoundState() {
  S.plant = null; S.plantChannel = null; S.defuseChannel = null;
  S.carrier = 'player'; S.roundKills = 0; S.noise = null;
  S.grenades.length = 0; S.smokes.length = 0; S.flashes.length = 0;
  S.feed.length = 0;
}

export function addFeed(text, cls) {
  S.feed.unshift({ text, cls: cls || '', t: S.time });
  if (S.feed.length > 6) S.feed.pop();
}

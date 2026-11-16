// map.js — "Kestrel Foundry": geometry, procedural canvas textures, colliders,
// waypoint graph, spawns and relay sites. No external assets.
import * as THREE from 'three';

export const RELAYS = {
  A: { x: 19, z: -12, name: 'RELAY ALPHA' },
  B: { x: 19, z: 12, name: 'RELAY BETA' },
};
export const SPAWNS = {
  V: { x: -26, z: 0, yaw: -Math.PI / 2 },   // Vanguard (west), facing east
  S: { x: 26, z: 0, yaw: Math.PI / 2 },     // Sentinel (east), facing west
};

function canvasTex(size, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function speckle(g, s, n, colors, aMin, aMax) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    g.globalAlpha = aMin + Math.random() * (aMax - aMin);
    const r = 1 + Math.random() * 3;
    g.fillRect(Math.random() * s, Math.random() * s, r, r);
  }
  g.globalAlpha = 1;
}

function concreteTex() {
  return canvasTex(256, (g, s) => {
    g.fillStyle = '#6d675e'; g.fillRect(0, 0, s, s);
    speckle(g, s, 2600, ['#7a746a', '#5d584f', '#8a8478', '#4c483f'], 0.15, 0.5);
    g.strokeStyle = 'rgba(40,36,30,0.55)'; g.lineWidth = 2;
    for (let i = 0; i < 7; i++) { // cracks
      g.beginPath(); let x = Math.random() * s, y = Math.random() * s;
      g.moveTo(x, y);
      for (let j = 0; j < 5; j++) { x += (Math.random() - 0.5) * 60; y += Math.random() * 40; g.lineTo(x, y); }
      g.stroke();
    }
    g.strokeStyle = 'rgba(30,28,24,0.35)'; g.lineWidth = 3; // expansion joints
    g.strokeRect(1, 1, s - 2, s - 2);
    g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.stroke();
  }, 10, 7);
}
function metalTex(base, line) {
  return canvasTex(256, (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    speckle(g, s, 1400, ['#00000033', '#ffffff22', '#3a2c1e'], 0.1, 0.35);
    g.strokeStyle = line; g.lineWidth = 3;
    g.strokeRect(2, 2, s - 4, s - 4);
    g.beginPath(); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
    g.fillStyle = 'rgba(20,18,16,0.8)';
    for (const [x, y] of [[14, 14], [s - 14, 14], [14, s - 14], [s - 14, s - 14], [s / 2, 14], [s / 2, s - 14]]) {
      g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
    }
    // rust streaks
    g.fillStyle = 'rgba(122,72,32,0.35)';
    for (let i = 0; i < 9; i++) g.fillRect(Math.random() * s, Math.random() * s, 3 + Math.random() * 5, 20 + Math.random() * 50);
  }, 1, 1);
}
function hazardTex() {
  return canvasTex(128, (g, s) => {
    g.fillStyle = '#d8a018'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#1c1a17';
    for (let i = -2; i < 6; i++) {
      g.beginPath();
      g.moveTo(i * 32, s); g.lineTo(i * 32 + 32, 0); g.lineTo(i * 32 + 48, 0); g.lineTo(i * 32 + 16, s);
      g.fill();
    }
  }, 4, 1);
}
function rustTex() {
  return canvasTex(256, (g, s) => {
    g.fillStyle = '#7a4a28'; g.fillRect(0, 0, s, s);
    speckle(g, s, 2200, ['#8a5a30', '#5e3018', '#a06a38', '#40220f'], 0.2, 0.6);
  }, 2, 1);
}

export const WAYPOINTS = [
  // id: x, z, y | 0 V spawn, 1 S spawn, 2 mid, 3 A site, 4 B site
  { x: -26, z: 0, y: 0 }, { x: 26, z: 0, y: 0 }, { x: 0, z: 0, y: 0 },
  { x: 19, z: -12, y: 0 }, { x: 19, z: 12, y: 0 },
  { x: -14, z: -12, y: 0 }, { x: -14, z: 12, y: 0 }, { x: 0, z: -12, y: 0 },
  { x: 0, z: 12, y: 0 }, { x: 12, z: -12, y: 0 }, { x: 12, z: 12, y: 0 },
  { x: -8, z: -5, y: 0 }, { x: -8, z: 5, y: 0 }, { x: 8, z: -5, y: 0 },
  { x: 8, z: 5, y: 0 }, { x: -20, z: -6, y: 0 }, { x: -20, z: 6, y: 0 },
  { x: 20, z: -5, y: 0 }, { x: 20, z: 5, y: 0 }, { x: 24, z: -12, y: 0 },
  { x: 24, z: 12, y: 0 }, { x: 0, z: 0, y: 3.2 }, { x: -6, z: 0, y: 3.2 },
  { x: 6, z: 0, y: 3.2 },
];
export const EDGES = [
  [0, 15], [0, 16], [0, 5], [0, 6], [15, 11], [16, 12], [5, 7], [6, 8],
  [5, 11], [6, 12], [11, 2], [12, 2], [7, 9], [8, 10], [7, 13], [8, 14],
  [9, 3], [10, 4], [9, 17], [10, 18], [13, 2], [14, 2], [13, 22], [14, 23],
  [17, 19], [18, 20], [19, 3], [20, 4], [1, 17], [1, 18], [1, 19], [1, 20],
  [21, 22], [21, 23], [22, 11], [23, 12], [3, 19], [4, 20],
];
export const ADJ = WAYPOINTS.map(() => []);
for (const [a, b] of EDGES) { ADJ[a].push(b); ADJ[b].push(a); }

export function nearestWp(x, z, y = 0) {
  let best = 0, bd = 1e9;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const dx = WAYPOINTS[i].x - x, dz = WAYPOINTS[i].z - z, dy = (WAYPOINTS[i].y - y) * 6;
    const d = dx * dx + dz * dz + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
// BFS path of waypoint ids from a to b.
export function findPath(a, b) {
  if (a === b) return [a];
  const prev = new Array(WAYPOINTS.length).fill(-1);
  const q = [a]; prev[a] = a;
  while (q.length) {
    const n = q.shift();
    for (const m of ADJ[n]) {
      if (prev[m] === -1) { prev[m] = n; if (m === b) { const p = [b]; let c = b; while (c !== a) { c = prev[c]; p.unshift(c); } return p; } q.push(m); }
    }
  }
  return [a, b];
}

export function buildMap(scene) {
  const colliders = [];
  const addBox = (x, y, z, w, h, d, mat, collide = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    m.receiveShadow = true; m.castShadow = true;
    scene.add(m);
    if (collide) colliders.push({ x0: x - w / 2, y0: y, z0: z - d / 2, x1: x + w / 2, y1: y + h, z1: z + d / 2 });
    return m;
  };

  const concrete = new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.95 });
  const metalTeal = new THREE.MeshStandardMaterial({ map: metalTex('#2e5a58', '#1c3a38'), roughness: 0.6, metalness: 0.55 });
  const metalOrange = new THREE.MeshStandardMaterial({ map: metalTex('#8a4a22', '#5e3016'), roughness: 0.65, metalness: 0.5 });
  const metalDark = new THREE.MeshStandardMaterial({ map: metalTex('#3a3d42', '#22242a'), roughness: 0.55, metalness: 0.7 });
  const rust = new THREE.MeshStandardMaterial({ map: rustTex(), roughness: 0.9, metalness: 0.3 });
  const hazard = new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.8 });

  // Ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 44), concrete);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);
  // Perimeter walls (h 4.5)
  addBox(0, 0, -21, 64, 4.5, 1, metalDark);
  addBox(0, 0, 21, 64, 4.5, 1, metalDark);
  addBox(-31, 0, 0, 1, 4.5, 44, metalDark);
  addBox(31, 0, 0, 1, 4.5, 44, metalDark);
  // Hazard trim along walls
  const trim = new THREE.Mesh(new THREE.BoxGeometry(62, 0.25, 0.5), hazard);
  trim.position.set(0, 0.12, -20.2); scene.add(trim);
  const trim2 = trim.clone(); trim2.position.z = 20.2; scene.add(trim2);

  // Lane divider walls (mid blocks, leave gaps)
  addBox(-6, 0, -8, 6, 2.2, 0.8, metalTeal);
  addBox(-6, 0, 8, 6, 2.2, 0.8, metalTeal);
  addBox(6, 0, -8, 6, 2.2, 0.8, metalOrange);
  addBox(6, 0, 8, 6, 2.2, 0.8, metalOrange);
  addBox(0, 0, -16.5, 8, 2.6, 0.8, rust);
  addBox(0, 0, 16.5, 8, 2.6, 0.8, rust);

  // Crates (1.2 m cubes, some stacked)
  const crateSpots = [
    [-18, -8, 0], [-18, -8, 1.2], [-10, -14, 0], [4, -15, 0], [14, -8, 0],
    [-12, 14, 0], [2, 15, 0], [10, 8, 0], [24, 0, 0], [-22, 3, 0], [16, -15, 0],
    [-4, 2, 0], [12, -2, 0],
  ];
  for (const [x, z, y] of crateSpots) addBox(x, y, z, 1.2, 1.2, 1.2, Math.random() < 0.5 ? metalTeal : metalOrange);
  // Double crate stacks
  addBox(-18, 1.2, -8, 1.2, 1.2, 1.2, metalDark);
  addBox(10, 1.2, 8, 1.2, 1.2, 1.2, metalDark);

  // Shipping containers (big cover)
  addBox(-22, 0, -15, 6, 2.6, 2.4, metalTeal);
  addBox(-22, 0, 15, 6, 2.6, 2.4, metalOrange);
  addBox(14, 0, -17, 6, 2.6, 2.4, rust);
  addBox(14, 0, 17, 6, 2.6, 2.4, metalTeal);
  addBox(24, 0, -2, 2.4, 2.6, 6, metalDark);

  // Elevated walkway over mid: deck y 3..3.3, x -7..7, z -2.5..2.5
  const deck = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 5), metalDark);
  deck.position.set(0, 3.15, 0); deck.castShadow = deck.receiveShadow = true;
  scene.add(deck);
  colliders.push({ x0: -7, y0: 3, z0: -2.5, x1: 7, y1: 3.3, z1: 2.5 });
  // Support pillars (thin, collide)
  for (const [x, z] of [[-6.5, -2], [-6.5, 2], [6.5, -2], [6.5, 2]]) addBox(x, 0, z, 0.4, 3, 0.4, rust);
  // Stairs: 6 steps up each side (step height 0.5, depth 0.6)
  for (let i = 0; i < 6; i++) {
    addBox(-7 - 0.3 - i * 0.6, i * 0.5, 0, 0.6, 0.5, 3, metalTeal);
    addBox(7 + 0.3 + i * 0.6, i * 0.5, 0, 0.6, 0.5, 3, metalTeal);
  }
  // Walkway rails (visual only, no collide)
  const railMat = new THREE.MeshStandardMaterial({ color: 0xd8a018, roughness: 0.5, metalness: 0.6 });
  for (const z of [-2.4, 2.4]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(14, 0.08, 0.08), railMat);
    r.position.set(0, 4.25, z); scene.add(r);
    for (let x = -7; x <= 7; x += 3.5) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.08), railMat);
      post.position.set(x, 3.8, z); scene.add(post);
    }
  }

  // Relay pads: hazard ring + beacon pole + light
  const relayMeshes = {};
  for (const key of ['A', 'B']) {
    const R = RELAYS[key];
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.18, 24),
      new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.8 }));
    pad.position.set(R.x, 0.09, R.z); pad.receiveShadow = true; scene.add(pad);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.2, 8), metalDark);
    pole.position.set(R.x + 1.8, 1.6, R.z + 1.8); scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xff5a1e, emissive: 0xff4400, emissiveIntensity: 2 }));
    lamp.position.set(R.x + 1.8, 3.3, R.z + 1.8); scene.add(lamp);
    const light = new THREE.PointLight(0xff6a2a, 12, 14, 1.8);
    light.position.set(R.x, 3.5, R.z); scene.add(light);
    relayMeshes[key] = { pad, lamp, light };
  }

  // Silo towers at east end (visual anchors + cover)
  for (const [x, z] of [[28, -16], [28, 16]]) {
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 7, 16), rust);
    silo.position.set(x, 3.5, z); silo.castShadow = true; scene.add(silo);
    colliders.push({ x0: x - 2, y0: 0, z0: z - 2, x1: x + 2, y1: 7, z1: z + 2 });
  }
  // Floodlight poles
  for (const [x, z] of [[-24, -18], [-24, 18], [8, -18], [8, 18]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 8), metalDark);
    pole.position.set(x, 3, z); scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xffe0b0, emissive: 0xffc070, emissiveIntensity: 1.5 }));
    head.position.set(x, 6.1, z); scene.add(head);
  }

  // Lights: dusk sun + hemisphere
  const hemi = new THREE.HemisphereLight(0x9fc4d4, 0x4a3826, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xff8a3c, 2.2);
  sun.position.set(-30, 26, -14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -36; sun.shadow.camera.right = 36;
  sun.shadow.camera.top = 26; sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 90;
  scene.add(sun);
  scene.fog = new THREE.FogExp2(0x33291d, 0.008);
  scene.background = new THREE.Color(0x33291d);

  return { colliders, relayMeshes, sun };
}

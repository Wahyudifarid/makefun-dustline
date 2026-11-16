// physics.js — ray / AABB helpers. No allocations in hot paths: module temps only.
// A collider is { x0,y0,z0, x1,y1,z1 } (axis-aligned box).
const _t = { min: 0, max: 0 };

// Slab test: ray origin o, dir d (unit), box b. Returns nearest t in [0,maxT] or -1.
export function rayBox(ox, oy, oz, dx, dy, dz, b, maxT) {
  let tmin = 0, tmax = maxT, t1, t2;
  // X
  if (dx === 0) { if (ox < b.x0 || ox > b.x1) return -1; }
  else { t1 = (b.x0 - ox) / dx; t2 = (b.x1 - ox) / dx; if (t1 > t2) { _t.min = t1; t1 = t2; t2 = _t.min; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1; }
  if (dy === 0) { if (oy < b.y0 || oy > b.y1) return -1; }
  else { t1 = (b.y0 - oy) / dy; t2 = (b.y1 - oy) / dy; if (t1 > t2) { _t.min = t1; t1 = t2; t2 = _t.min; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1; }
  if (dz === 0) { if (oz < b.z0 || oz > b.z1) return -1; }
  else { t1 = (b.z0 - oz) / dz; t2 = (b.z1 - oz) / dz; if (t1 > t2) { _t.min = t1; t1 = t2; t2 = _t.min; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1; }
  return tmin;
}

// Nearest box hit along a ray; returns { t, box } via out object, or null.
export function rayBoxes(ox, oy, oz, dx, dy, dz, boxes, maxT, out) {
  let best = -1, bestBox = null;
  for (let i = 0; i < boxes.length; i++) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, boxes[i], maxT);
    if (t >= 0 && (best < 0 || t < best)) { best = t; bestBox = boxes[i]; }
  }
  if (best < 0) return null;
  out.t = best; out.box = bestBox;
  return out;
}

// Segment line-of-sight: true when nothing blocks a->b.
export function los(ax, ay, az, bx, by, bz, boxes) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 0.001) return true;
  const inv = 1 / len;
  for (let i = 0; i < boxes.length; i++) {
    if (rayBox(ax, ay, az, dx * inv, dy * inv, dz * inv, boxes[i], len - 0.05) >= 0) return false;
  }
  return true;
}

// Ray vs sphere (head hitbox). Returns t or -1.
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxT) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return -1;
  const t = tca - Math.sqrt(r2 - d2);
  return t <= maxT ? t : -1;
}

// Move an AABB (center p, half extents h, feet at p.y) axis by axis.
// Returns true if a step-up happened. Boxes block; step lets the mover climb
// low ledges / stairs (max 0.55 m). Ground is y=0, walkway tops are boxes.
export function moveAABB(p, vx, vy, vz, dt, h, boxes) {
  const nx = p.x + vx * dt, ny = p.y + vy * dt, nz = p.z + vz * dt;
  let stepped = false;
  // X axis
  if (!hits(nx, p.y, p.z, h, boxes)) p.x = nx;
  else if (tryStep(p, nx, p.z, h, boxes)) stepped = true;
  // Z axis
  if (!hits(p.x, p.y, nz, h, boxes)) p.z = nz;
  else if (tryStep(p, p.x, nz, h, boxes)) stepped = true;
  // Y axis (gravity / landing handled by caller via vy; here just clamp)
  if (vy !== 0) {
    if (!hits(p.x, ny, p.z, h, boxes)) p.y = ny;
    else if (vy < 0) { p.y = groundTop(p, h, boxes); }
  }
  if (p.y < 0) p.y = 0;
  return stepped;
}

function hits(x, y, z, h, boxes) {
  const x0 = x - h.x, x1 = x + h.x, y0 = y, y1 = y + h.y, z0 = z - h.z, z1 = z + h.z;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (x1 > b.x0 && x0 < b.x1 && y1 > b.y0 && y0 < b.y1 && z1 > b.z0 && z0 < b.z1) return true;
  }
  return false;
}

function tryStep(p, nx, nz, h, boxes) {
  // Try lifting the mover onto the blocking box top if it is a low step.
  const x0 = nx - h.x, x1 = nx + h.x, z0 = nz - h.z, z1 = nz + h.z;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (x1 <= b.x0 || x0 >= b.x1 || z1 <= b.z0 || z0 >= b.z1) continue;
    const top = b.y1;
    if (top > p.y && top - p.y <= 0.55 && !hits(nx, top + 0.01, nz, h, boxes)) {
      p.y = top + 0.01; p.x = nx; p.z = nz;
      return true;
    }
  }
  return false;
}

function groundTop(p, h, boxes) {
  // Highest box top below the mover's head that overlaps in XZ.
  let top = 0;
  const x0 = p.x - h.x, x1 = p.x + h.x, z0 = p.z - h.z, z1 = p.z + h.z;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (x1 <= b.x0 || x0 >= b.x1 || z1 <= b.z0 || z0 >= b.z1) continue;
    if (b.y1 <= p.y + 0.6 && b.y1 > top) top = b.y1;
  }
  return top;
}

// Distance from point to segment (for smoke blocking checks).
export function segPointDist(ax, ay, az, bx, by, bz, px, py, pz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = l2 === 0 ? 0 : ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = ax + abx * t - px, dy = ay + aby * t - py, dz = az + abz * t - pz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

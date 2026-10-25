// Statik çarpışma kutuları (AABB) için ızgara tabanlı fizik ve ışın testi
import { isLand, WATER_Y } from './map.js';

const CELL = 16;

export class Colliders {
  constructor() {
    this.boxes = [];
    this.grid = new Map();
    this.stamp = 0;
  }
  clear() { this.boxes = []; this.grid.clear(); }
  key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }
  // y0..y1 yükseklik aralığı
  add(x0, z0, x1, z1, y0 = 0, y1 = 10, tag = null) {
    const b = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y0, y1, tag, s: 0 };
    this.boxes.push(b);
    const cx0 = Math.floor(b.x0 / CELL), cx1 = Math.floor(b.x1 / CELL);
    const cz0 = Math.floor(b.z0 / CELL), cz1 = Math.floor(b.z1 / CELL);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const k = this.key(cx, cz);
      let arr = this.grid.get(k);
      if (!arr) { arr = []; this.grid.set(k, arr); }
      arr.push(b);
    }
    return b;
  }
  // Döndürülmüş kutu için kaba AABB ekleme
  addRotated(cx, cz, w, d, rot, y0, y1, tag) {
    const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
    const hw = (w * c + d * s) / 2, hd = (w * s + d * c) / 2;
    return this.add(cx - hw, cz - hd, cx + hw, cz + hd, y0, y1, tag);
  }
  query(x0, z0, x1, z1, out) {
    this.stamp++;
    out.length = 0;
    const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL);
    const cz0 = Math.floor(z0 / CELL), cz1 = Math.floor(z1 / CELL);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const arr = this.grid.get(this.key(cx, cz));
      if (!arr) continue;
      for (const b of arr) { if (b.s !== this.stamp) { b.s = this.stamp; out.push(b); } }
    }
    return out;
  }
}

const tmp = [];

export class Physics {
  constructor(map) {
    this.map = map;
    this.city = new Colliders();
    this.active = this.city;
    this.interiorMode = false;
  }
  setInterior(cols) { this.active = cols || this.city; this.interiorMode = !!cols; }

  // Zemin yüksekliği (kara 0, su yüzeyi)
  groundAt(x, z) {
    if (this.interiorMode) return 0;
    return isLand(x, z) ? 0 : WATER_Y - 4;
  }
  inWater(x, z) { return !this.interiorMode && !isLand(x, z); }

  // Çember çarpışma çözümü; ayak yüksekliği y. Basamak yüksekliğinden alçak kutular zemin sayılır.
  resolveCircle(p, radius, y, height = 1.8, step = 0.45) {
    const boxes = this.active.query(p.x - radius, p.z - radius, p.x + radius, p.z + radius, tmp);
    let hit = false;
    let support = this.groundAt(p.x, p.z);
    for (const b of boxes) {
      if (y + height < b.y0 || y > b.y1 - 0.001) {
        // üstündeyiz: destek olarak say
        if (y >= b.y1 - step && p.x > b.x0 - radius * 0.5 && p.x < b.x1 + radius * 0.5 && p.z > b.z0 - radius * 0.5 && p.z < b.z1 + radius * 0.5) support = Math.max(support, b.y1);
        continue;
      }
      if (b.y1 - y <= step && b.y1 - y > -0.01) {
        if (p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1) support = Math.max(support, b.y1);
        continue;
      }
      const qx = Math.max(b.x0, Math.min(p.x, b.x1));
      const qz = Math.max(b.z0, Math.min(p.z, b.z1));
      let dx = p.x - qx, dz = p.z - qz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        hit = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          p.x += (dx / d) * (radius - d); p.z += (dz / d) * (radius - d);
        } else {
          // merkez kutunun içinde: en yakın kenara it
          const l = p.x - b.x0, r = b.x1 - p.x, f = p.z - b.z0, bk = b.z1 - p.z;
          const m = Math.min(l, r, f, bk);
          if (m === l) p.x = b.x0 - radius; else if (m === r) p.x = b.x1 + radius; else if (m === f) p.z = b.z0 - radius; else p.z = b.z1 + radius;
        }
      }
    }
    return { hit, support };
  }

  // Işın - kutu testi. Mesafe ve normal döndürür.
  raycast(ox, oy, oz, dx, dy, dz, maxD) {
    let best = maxD, nx = 0, ny = 0, nz = 0, found = null;
    const ex = ox + dx * maxD, ez = oz + dz * maxD;
    // ışın boyunca hücreleri parça parça tara
    const steps = Math.max(1, Math.ceil(maxD / 12));
    const seen = new Set();
    for (let s = 0; s < steps; s++) {
      const t0 = (s / steps) * maxD, t1 = ((s + 1) / steps) * maxD;
      if (t0 > best) break;
      const ax = ox + dx * t0, az = oz + dz * t0, bx = ox + dx * t1, bz = oz + dz * t1;
      const boxes = this.active.query(Math.min(ax, bx) - 0.5, Math.min(az, bz) - 0.5, Math.max(ax, bx) + 0.5, Math.max(az, bz) + 0.5, tmp);
      for (const b of boxes) {
        if (seen.has(b)) continue; seen.add(b);
        const r = rayBox(ox, oy, oz, dx, dy, dz, b);
        if (r && r.t < best) { best = r.t; nx = r.nx; ny = r.ny; nz = r.nz; found = b; }
      }
    }
    void ex; void ez;
    // zemin
    if (dy < -1e-4) {
      const g = this.interiorMode ? 0 : 0;
      const t = (g - oy) / dy;
      if (t > 0 && t < best) {
        const hx = ox + dx * t, hz = oz + dz * t;
        if (this.interiorMode || isLand(hx, hz)) { best = t; nx = 0; ny = 1; nz = 0; found = 'ground'; }
        else {
          const tw = (WATER_Y - oy) / dy;
          if (tw > 0 && tw < best) { best = tw; nx = 0; ny = 1; nz = 0; found = 'water'; }
        }
      }
    }
    if (this.interiorMode && dy > 1e-4) {
      const t = (3.4 - oy) / dy; // tavan
      if (t > 0 && t < best) { best = t; nx = 0; ny = -1; nz = 0; found = 'ceiling'; }
    }
    return found ? { t: best, nx, ny, nz, box: found } : null;
  }

  lineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    const h = this.raycast(ax, ay, az, dx / d, dy / d, dz / d, d);
    return !h || h.t >= d - 0.3;
  }
}

export function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = -Infinity, tmax = Infinity, n = 0;
  const axes = [[ox, dx, b.x0, b.x1], [oy, dy, b.y0, b.y1], [oz, dz, b.z0, b.z1]];
  let sign = 0;
  for (let i = 0; i < 3; i++) {
    const [o, d, lo, hi] = axes[i];
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d, s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; n = i; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  const t = tmin > 0 ? tmin : 0;
  return { t, nx: n === 0 ? sign : 0, ny: n === 1 ? sign : 0, nz: n === 2 ? sign : 0 };
}

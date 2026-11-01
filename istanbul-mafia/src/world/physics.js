// Statik çarpışma şekilleri için ızgara tabanlı fizik ve ışın testi.
// Şekiller: eksen hizalı kutu (AABB), döndürülmüş kutu (OBB), dikey silindir (daire). Her şekil kaba sınır
// kutusunu (x0..x1, z0..z1) da taşır; eski kodlar (tırmanma, siper) bu alanları okumaya devam edebilir.
// Kırılabilir küçük eşyalar (çöp kovası, baba, levha...) `b.brk` taşır: araç çarpınca enkaza dönüşür.
import { isLand, WATER_Y } from './map.js';
import { NavGrid } from './navgrid.js';

const CELL = 16;
export const SHAPE_AABB = 0, SHAPE_OBB = 1, SHAPE_CIRCLE = 2;

export class Colliders {
  constructor(isCity = false) {
    this.boxes = [];
    this.grid = new Map();
    this.stamp = 0;
    this.rayStamp = 0;
    this.isCity = isCity;
    this.nav = null; // NavGrid (tembel)
    this.version = 0;
  }
  clear() { this.boxes = []; this.grid.clear(); this.version++; if (this.nav) this.nav.reset(); }
  key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }
  _insert(b) {
    b.owner = this;
    this.boxes.push(b);
    const cx0 = Math.floor(b.x0 / CELL), cx1 = Math.floor(b.x1 / CELL);
    const cz0 = Math.floor(b.z0 / CELL), cz1 = Math.floor(b.z1 / CELL);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const k = this.key(cx, cz);
      let arr = this.grid.get(k);
      if (!arr) { arr = []; this.grid.set(k, arr); }
      arr.push(b);
    }
    this.version++;
    if (this.nav) this.nav.invalidate(b.x0, b.z0, b.x1, b.z1);
    return b;
  }
  // y0..y1 yükseklik aralığı
  add(x0, z0, x1, z1, y0 = 0, y1 = 10, tag = null) {
    const b = { shape: SHAPE_AABB, x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y0, y1, tag, s: 0, rs: 0 };
    return this._insert(b);
  }
  // Döndürülmüş kutu: merkez (cx,cz), yerel X genişliği w, yerel Z derinliği d, rot = three.js rotation.y.
  // 90°'nin katlarında tam AABB'ye indirgenir.
  addOBB(cx, cz, w, d, rot, y0 = 0, y1 = 10, tag = null) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const ac = Math.abs(c), as = Math.abs(s);
    const bw = (w * ac + d * as) / 2, bd = (w * as + d * ac) / 2;
    if (ac < 1e-3 || as < 1e-3) return this.add(cx - bw, cz - bd, cx + bw, cz + bd, y0, y1, tag);
    const b = { shape: SHAPE_OBB, x0: cx - bw, z0: cz - bd, x1: cx + bw, z1: cz + bd, y0, y1, tag, s: 0, rs: 0, cx, cz, hx: w / 2, hz: d / 2, ca: c, sa: s };
    return this._insert(b);
  }
  // Eski API: artık gerçek döndürülmüş kutu
  addRotated(cx, cz, w, d, rot, y0, y1, tag) { return this.addOBB(cx, cz, w, d, rot, y0, y1, tag); }
  // Dikey silindir (direk, ağaç gövdesi, kova, musluk)
  addCircle(cx, cz, r, y0 = 0, y1 = 10, tag = null) {
    const b = { shape: SHAPE_CIRCLE, x0: cx - r, z0: cz - r, x1: cx + r, z1: cz + r, y0, y1, tag, s: 0, rs: 0, cx, cz, r };
    return this._insert(b);
  }
  // İnce duvar/çit: (x0,z0)-(x1,z1) doğru parçası boyunca kalınlık th
  addSegment(x0, z0, x1, z1, th, y0, y1, tag) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 1e-3) return this.add(x0 - th / 2, z0 - th / 2, x0 + th / 2, z0 + th / 2, y0, y1, tag);
    const rot = Math.atan2(-(z1 - z0), x1 - x0); // yerel +X parça boyunca
    return this.addOBB((x0 + x1) / 2, (z0 + z1) / 2, L + th, th, rot, y0, y1, tag);
  }
  // Eşyanın yerel koordinatında (lx, lz) merkezli w×d kutu; eşya (x,z)'de rot ile döndürülmüş
  addLocal(x, z, rot, lx, lz, w, d, y0, y1, tag) {
    const c = Math.cos(rot), s = Math.sin(rot);
    return this.addOBB(x + lx * c + lz * s, z - lx * s + lz * c, w, d, rot, y0, y1, tag);
  }
  addLocalCircle(x, z, rot, lx, lz, r, y0, y1, tag) {
    const c = Math.cos(rot), s = Math.sin(rot);
    return this.addCircle(x + lx * c + lz * s, z - lx * s + lz * c, r, y0, y1, tag);
  }
  // Kırılabilir işaretle: inst (NearInstancer) + örnek konumu → enkaz yöneticisi görseli gizleyip savurur
  breakable(b, kind, mass, inst, x, y, z, rot, sx = 1, sy = 1, sz = 1) {
    b.brk = { kind, mass, inst, x, y, z, rot, sx, sy, sz };
    return b;
  }
  remove(b) {
    const cx0 = Math.floor(b.x0 / CELL), cx1 = Math.floor(b.x1 / CELL);
    const cz0 = Math.floor(b.z0 / CELL), cz1 = Math.floor(b.z1 / CELL);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const arr = this.grid.get(this.key(cx, cz));
      if (!arr) continue;
      const i = arr.indexOf(b);
      if (i >= 0) { arr[i] = arr[arr.length - 1]; arr.pop(); }
    }
    const j = this.boxes.indexOf(b);
    if (j >= 0) { this.boxes[j] = this.boxes[this.boxes.length - 1]; this.boxes.pop(); }
    b.removed = true;
    this.version++;
    if (this.nav) this.nav.invalidate(b.x0, b.z0, b.x1, b.z1);
  }
  query(x0, z0, x1, z1, out) {
    this.stamp++;
    out.length = 0;
    const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL);
    const cz0 = Math.floor(z0 / CELL), cz1 = Math.floor(z1 / CELL);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const arr = this.grid.get(this.key(cx, cz));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const b = arr[i];
        if (b.s !== this.stamp && b.x1 >= x0 && b.x0 <= x1 && b.z1 >= z0 && b.z0 <= z1) { b.s = this.stamp; out.push(b); }
      }
    }
    return out;
  }
}

// ---------------- şekil yardımcıları (bellek ayırmaz) ----------------
const _cp = { x: 0, z: 0, inside: false };
// Şekil tabanında (x,z)'ye en yakın nokta. inside: nokta şeklin içinde mi
export function closestPoint(b, x, z, out = _cp) {
  if (b.shape === SHAPE_CIRCLE) {
    const dx = x - b.cx, dz = z - b.cz, d = Math.hypot(dx, dz);
    if (d <= b.r) { out.x = x; out.z = z; out.inside = true; return out; }
    out.x = b.cx + (dx / d) * b.r; out.z = b.cz + (dz / d) * b.r; out.inside = false; return out;
  }
  if (b.shape === SHAPE_OBB) {
    const wx = x - b.cx, wz = z - b.cz;
    const lx = wx * b.ca - wz * b.sa, lz = wx * b.sa + wz * b.ca;
    const qx = Math.max(-b.hx, Math.min(lx, b.hx)), qz = Math.max(-b.hz, Math.min(lz, b.hz));
    out.inside = qx === lx && qz === lz;
    out.x = b.cx + qx * b.ca + qz * b.sa; out.z = b.cz - qx * b.sa + qz * b.ca;
    return out;
  }
  const qx = Math.max(b.x0, Math.min(x, b.x1)), qz = Math.max(b.z0, Math.min(z, b.z1));
  out.inside = qx === x && qz === z; out.x = qx; out.z = qz;
  return out;
}
// Nokta taban içinde mi (margin: pozitif genişletir, negatif daraltır)
export function shapeContains(b, x, z, margin = 0) {
  if (b.shape === SHAPE_CIRCLE) { const dx = x - b.cx, dz = z - b.cz, r = b.r + margin; return dx * dx + dz * dz < r * r; }
  if (b.shape === SHAPE_OBB) {
    const wx = x - b.cx, wz = z - b.cz;
    const lx = wx * b.ca - wz * b.sa, lz = wx * b.sa + wz * b.ca;
    return Math.abs(lx) < b.hx + margin && Math.abs(lz) < b.hz + margin;
  }
  return x > b.x0 - margin && x < b.x1 + margin && z > b.z0 - margin && z < b.z1 + margin;
}
// Noktadan şekle yatay uzaklık (içerideyse 0)
export function shapeDistance(b, x, z) {
  const c = closestPoint(b, x, z);
  return c.inside ? 0 : Math.hypot(x - c.x, z - c.z);
}
// Çemberi şekilden dışarı it. p değişir. İtme olduysa true.
export function pushCircleOut(b, p, radius) {
  if (b.shape === SHAPE_CIRCLE) {
    const dx = p.x - b.cx, dz = p.z - b.cz, R = b.r + radius;
    const d2 = dx * dx + dz * dz;
    if (d2 >= R * R) return false;
    const d = Math.sqrt(d2);
    if (d > 1e-6) { p.x = b.cx + (dx / d) * R; p.z = b.cz + (dz / d) * R; } else p.x = b.cx + R;
    return true;
  }
  let lx, lz, hx, hz;
  if (b.shape === SHAPE_OBB) {
    const wx = p.x - b.cx, wz = p.z - b.cz;
    lx = wx * b.ca - wz * b.sa; lz = wx * b.sa + wz * b.ca; hx = b.hx; hz = b.hz;
  } else {
    hx = (b.x1 - b.x0) / 2; hz = (b.z1 - b.z0) / 2;
    lx = p.x - (b.x0 + hx); lz = p.z - (b.z0 + hz);
  }
  const qx = Math.max(-hx, Math.min(lx, hx)), qz = Math.max(-hz, Math.min(lz, hz));
  let dx = lx - qx, dz = lz - qz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return false;
  let nlx, nlz;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    nlx = qx + (dx / d) * radius; nlz = qz + (dz / d) * radius;
  } else {
    // merkez kutunun içinde: en yakın kenara it
    const l = lx + hx, r = hx - lx, f = lz + hz, bk = hz - lz;
    const m = Math.min(l, r, f, bk);
    nlx = lx; nlz = lz;
    if (m === l) nlx = -hx - radius; else if (m === r) nlx = hx + radius; else if (m === f) nlz = -hz - radius; else nlz = hz + radius;
  }
  if (b.shape === SHAPE_OBB) { p.x = b.cx + nlx * b.ca + nlz * b.sa; p.z = b.cz - nlx * b.sa + nlz * b.ca; }
  else { p.x = b.x0 + hx + nlx; p.z = b.z0 + hz + nlz; }
  void dx; void dz;
  return true;
}

const tmp = [];
const _res = { hit: false, support: 0 };
const _ray = { t: 0, nx: 0, ny: 0, nz: 0, box: null };

export class Physics {
  constructor(map) {
    this.map = map;
    this.city = new Colliders(true);
    this.active = this.city;
    this.interiorMode = false;
    this.breakListeners = [];
    this.stats = { rays: 0, circles: 0 };
  }
  setInterior(cols) { this.active = cols || this.city; this.interiorMode = !!cols; }
  // Etkin çarpışma kümesinin yürünebilirlik ızgarası (NPC yol bulma)
  get nav() { const a = this.active; return a.nav || (a.nav = new NavGrid(this, a)); }

  // Zemin yüksekliği (kara 0, su yüzeyi)
  groundAt(x, z) {
    if (this.interiorMode) return 0;
    return isLand(x, z) ? 0 : WATER_Y - 4;
  }
  inWater(x, z) { return !this.interiorMode && !isLand(x, z); }

  // Çember çarpışma çözümü; ayak yüksekliği y. Basamak yüksekliğinden alçak kutular zemin sayılır.
  // Dönen nesne yeniden kullanılır (her çağrıda yeni nesne yok): sonucu hemen okuyun.
  resolveCircle(p, radius, y, height = 1.8, step = 0.45) {
    this.stats.circles++;
    const boxes = this.active.query(p.x - radius, p.z - radius, p.x + radius, p.z + radius, tmp);
    let hit = false;
    let support = this.groundAt(p.x, p.z);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (y + height < b.y0 || y > b.y1 - 0.001) {
        // üstündeyiz: destek olarak say
        if (y >= b.y1 - step && shapeContains(b, p.x, p.z, radius * 0.5)) support = Math.max(support, b.y1);
        continue;
      }
      if (b.y1 - y <= step && b.y1 - y > -0.01) {
        if (shapeContains(b, p.x, p.z, 0)) support = Math.max(support, b.y1);
        continue;
      }
      if (pushCircleOut(b, p, radius)) hit = true;
    }
    _res.hit = hit; _res.support = support;
    return _res;
  }

  // Işın - şekil testi. Mesafe ve normal döndürür (yeni nesne; sonucu saklamak güvenli).
  raycast(ox, oy, oz, dx, dy, dz, maxD, filter) {
    const r = this.raycastShared(ox, oy, oz, dx, dy, dz, maxD, filter);
    return r ? { t: r.t, nx: r.nx, ny: r.ny, nz: r.nz, box: r.box } : null;
  }
  // Bellek ayırmayan sürüm: dönen nesne bir sonraki ışında üzerine yazılır.
  raycastShared(ox, oy, oz, dx, dy, dz, maxD, filter) {
    this.stats.rays++;
    let best = maxD, nx = 0, ny = 0, nz = 0, found = null;
    const cols = this.active;
    const rs = ++cols.rayStamp;
    // ışın boyunca hücreleri parça parça tara
    const steps = Math.max(1, Math.ceil(maxD / 12));
    for (let s = 0; s < steps; s++) {
      const t0 = (s / steps) * maxD, t1 = ((s + 1) / steps) * maxD;
      if (t0 > best) break;
      const ax = ox + dx * t0, az = oz + dz * t0, bx = ox + dx * t1, bz = oz + dz * t1;
      const boxes = cols.query(Math.min(ax, bx) - 0.5, Math.min(az, bz) - 0.5, Math.max(ax, bx) + 0.5, Math.max(az, bz) + 0.5, tmp);
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.rs === rs) continue; b.rs = rs;
        if (filter && !filter(b)) continue;
        const r = rayShape(ox, oy, oz, dx, dy, dz, b);
        if (r && r.t < best) { best = r.t; nx = r.nx; ny = r.ny; nz = r.nz; found = b; }
      }
    }
    // zemin
    if (dy < -1e-4) {
      const t = (0 - oy) / dy;
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
    if (!found) return null;
    _ray.t = best; _ray.nx = nx; _ray.ny = ny; _ray.nz = nz; _ray.box = found;
    return _ray;
  }

  lineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    const h = this.raycastShared(ax, ay, az, dx / d, dy / d, dz / d, d);
    return !h || h.t >= d - 0.3;
  }

  // Kırılabilir eşyayı kaldır ve dinleyicilere (enkaz yöneticisi) bildir
  breakProp(b, vx, vz, src) {
    if (!b || b.removed || !b.brk) return false;
    const cols = b.owner || this.city;
    cols.remove(b);
    if (b.brk.extra) for (const e of b.brk.extra) if (!e.removed) (e.owner || cols).remove(e);
    for (const f of this.breakListeners) f(b, vx, vz, src);
    return true;
  }
  onBreak(fn) { this.breakListeners.push(fn); }
}

const _rb = { t: 0, nx: 0, ny: 0, nz: 0 };
// Eksen hizalı kutu (dünya veya yerel). Bellek ayırmaz; _rb döndürür.
function raySlab(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity, n = 0, sign = 0;
  // x
  if (Math.abs(dx) < 1e-9) { if (ox < x0 || ox > x1) return null; }
  else {
    let t1 = (x0 - ox) / dx, t2 = (x1 - ox) / dx, s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; n = 0; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (Math.abs(dy) < 1e-9) { if (oy < y0 || oy > y1) return null; }
  else {
    let t1 = (y0 - oy) / dy, t2 = (y1 - oy) / dy, s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; n = 1; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (Math.abs(dz) < 1e-9) { if (oz < z0 || oz > z1) return null; }
  else {
    let t1 = (z0 - oz) / dz, t2 = (z1 - oz) / dz, s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; n = 2; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  _rb.t = tmin > 0 ? tmin : 0;
  _rb.nx = n === 0 ? sign : 0; _rb.ny = n === 1 ? sign : 0; _rb.nz = n === 2 ? sign : 0;
  return _rb;
}

// Işın - herhangi bir şekil
export function rayShape(ox, oy, oz, dx, dy, dz, b) {
  if (b.shape === SHAPE_OBB) {
    const wx = ox - b.cx, wz = oz - b.cz;
    const lox = wx * b.ca - wz * b.sa, loz = wx * b.sa + wz * b.ca;
    const ldx = dx * b.ca - dz * b.sa, ldz = dx * b.sa + dz * b.ca;
    const r = raySlab(lox, oy, loz, ldx, dy, ldz, -b.hx, b.y0, -b.hz, b.hx, b.y1, b.hz);
    if (!r) return null;
    const nlx = r.nx, nlz = r.nz;
    r.nx = nlx * b.ca + nlz * b.sa; r.nz = -nlx * b.sa + nlz * b.ca;
    return r;
  }
  if (b.shape === SHAPE_CIRCLE) {
    // dikey silindir
    const px = ox - b.cx, pz = oz - b.cz;
    const A = dx * dx + dz * dz, B = 2 * (px * dx + pz * dz), C = px * px + pz * pz - b.r * b.r;
    let t = Infinity, nx = 0, ny = 0, nz = 0;
    if (C <= 0) {
      // başlangıç silindirin dikey izdüşümünün içinde
      if (oy >= b.y0 && oy <= b.y1) { _rb.t = 0; _rb.nx = 0; _rb.ny = 1; _rb.nz = 0; return _rb; }
    } else if (A > 1e-12) {
      const disc = B * B - 4 * A * C;
      if (disc >= 0) {
        const tt = (-B - Math.sqrt(disc)) / (2 * A);
        if (tt >= 0) {
          const y = oy + dy * tt;
          if (y >= b.y0 && y <= b.y1) { t = tt; const hx = px + dx * tt, hz = pz + dz * tt; nx = hx / b.r; nz = hz / b.r; ny = 0; }
        }
      }
    }
    // üst / alt kapak
    if (Math.abs(dy) > 1e-9) {
      for (let k = 0; k < 2; k++) {
        const cy = k === 0 ? b.y1 : b.y0;
        const tc = (cy - oy) / dy;
        if (tc >= 0 && tc < t) {
          const hx = px + dx * tc, hz = pz + dz * tc;
          if (hx * hx + hz * hz <= b.r * b.r) { t = tc; nx = 0; nz = 0; ny = k === 0 ? 1 : -1; }
        }
      }
    }
    if (t === Infinity) return null;
    _rb.t = t; _rb.nx = nx; _rb.ny = ny; _rb.nz = nz;
    return _rb;
  }
  return raySlab(ox, oy, oz, dx, dy, dz, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
}
// Geriye uyumluluk
export function rayBox(ox, oy, oz, dx, dy, dz, b) {
  const r = rayShape(ox, oy, oz, dx, dy, dz, b);
  return r ? { t: r.t, nx: r.nx, ny: r.ny, nz: r.nz } : null;
}

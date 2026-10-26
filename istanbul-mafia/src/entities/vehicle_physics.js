// Araç çarpışma fiziği (model kodundan ayrı): yönlendirilmiş kutu (OBB) aracın statik şekillere (AABB/OBB/silindir)
// ve diğer araçlara karşı çözümü. Alt adımlı (200 km/s'de tünelleme yok), itme (impulse) + sürtünme + açısal tepki
// (darbede araç döner), darbe enerjisine göre hasar. Hafif eşyalar (kova, baba, levha, bank) kırılıp enkaza döner.
// Yaya/oyuncu - araç: OBB içine girmeyi engeller, süpürülmüş test + bekleme süresiyle tek darbe hasarı.
import { SHAPE_CIRCLE, SHAPE_OBB } from '../world/physics.js';
import { audio } from '../core/audio.js';

const _q = [];
const C = { nx: 0, nz: 0, depth: 0, px: 0, pz: 0 };
const C2 = { nx: 0, nz: 0, depth: 0, px: 0, pz: 0 };
const REST_STATIC = 0.22, MU_STATIC = 0.45, REST_CAR = 0.3, MU_CAR = 0.35;
const SUB_STEP = 0.35; // m: alt adım başına azami yer değiştirme

export function vehMass(v) {
  if (v._mass) return v._mass;
  const d = v.def;
  v._mass = d.mass || Math.max(180, d.len * d.wid * (d.hei || 1.4) * 110);
  return v._mass;
}
export function vehInertia(v) {
  if (v._inertia) return v._inertia;
  const d = v.def, m = vehMass(v);
  v._inertia = (m * (d.len * d.len + d.wid * d.wid)) / 12;
  return v._inertia;
}

// Araç OBB'si ile şekil arasında temas. normal: şekilden araca. Temas yoksa false.
function contactShape(cx, cz, fx, fz, hx, hz, b, out) {
  const rx = fz, rz = -fx; // yerel +X (sağ değil: three.js yerel X = (cos h, -sin h))
  if (b.shape === SHAPE_CIRCLE) {
    const dx = b.cx - cx, dz = b.cz - cz;
    const lx = dx * rx + dz * rz, lz = dx * fx + dz * fz;
    const qx = Math.max(-hx, Math.min(lx, hx)), qz = Math.max(-hz, Math.min(lz, hz));
    const ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
    if (d >= b.r) return false;
    let nlx, nlz, depth;
    if (d > 1e-6) { nlx = -ex / d; nlz = -ez / d; depth = b.r - d; }
    else {
      // silindir merkezi aracın içinde: en kısa eksenden çık
      const px = hx - Math.abs(lx) + b.r, pz = hz - Math.abs(lz) + b.r;
      if (px < pz) { nlx = lx > 0 ? -1 : 1; nlz = 0; depth = px; } else { nlx = 0; nlz = lz > 0 ? -1 : 1; depth = pz; }
    }
    out.nx = nlx * rx + nlz * fx; out.nz = nlx * rz + nlz * fz; out.depth = depth;
    out.px = cx + qx * rx + qz * fx; out.pz = cz + qx * rz + qz * fz;
    return true;
  }
  // kutu: AABB veya OBB
  let bcx, bcz, ux, uz, wx, wz, bhx, bhz;
  if (b.shape === SHAPE_OBB) { bcx = b.cx; bcz = b.cz; ux = b.ca; uz = -b.sa; wx = b.sa; wz = b.ca; bhx = b.hx; bhz = b.hz; }
  else { bhx = (b.x1 - b.x0) / 2; bhz = (b.z1 - b.z0) / 2; bcx = b.x0 + bhx; bcz = b.z0 + bhz; ux = 1; uz = 0; wx = 0; wz = 1; }
  return satBoxes(cx, cz, rx, rz, fx, fz, hx, hz, bcx, bcz, ux, uz, wx, wz, bhx, bhz, out, true);
}

// İki dikdörtgen SAT. normal: B'den A'ya (aSide=true) — A araç. Temas noktası: derin köşe.
function satBoxes(ax, az, a1x, a1z, a2x, a2z, ah1, ah2, bx, bz, b1x, b1z, b2x, b2z, bh1, bh2, out) {
  const dx = ax - bx, dz = az - bz;
  let best = Infinity, nx = 0, nz = 0, fromA = false;
  for (let k = 0; k < 4; k++) {
    const sx = k === 0 ? a1x : k === 1 ? a2x : k === 2 ? b1x : b2x;
    const sz = k === 0 ? a1z : k === 1 ? a2z : k === 2 ? b1z : b2z;
    const ra = ah1 * Math.abs(a1x * sx + a1z * sz) + ah2 * Math.abs(a2x * sx + a2z * sz);
    const rb = bh1 * Math.abs(b1x * sx + b1z * sz) + bh2 * Math.abs(b2x * sx + b2z * sz);
    const d = dx * sx + dz * sz;
    const ov = ra + rb - Math.abs(d);
    if (ov <= 0) return false;
    if (ov < best) { best = ov; const s = d >= 0 ? 1 : -1; nx = sx * s; nz = sz * s; fromA = k < 2; }
  }
  out.nx = nx; out.nz = nz; out.depth = best;
  if (fromA) {
    // eksen A'nın: B'nin A'ya en çok giren köşesi (A yönünde, +n)
    const s1 = (b1x * nx + b1z * nz) >= 0 ? 1 : -1, s2 = (b2x * nx + b2z * nz) >= 0 ? 1 : -1;
    out.px = bx + b1x * bh1 * s1 + b2x * bh2 * s2; out.pz = bz + b1z * bh1 * s1 + b2z * bh2 * s2;
    // köşe A'nın dışındaysa (kenar-kenar) orta noktaya çek
    out.px -= nx * best * 0.5; out.pz -= nz * best * 0.5;
  } else {
    const s1 = (a1x * nx + a1z * nz) >= 0 ? -1 : 1, s2 = (a2x * nx + a2z * nz) >= 0 ? -1 : 1;
    out.px = ax + a1x * ah1 * s1 + a2x * ah2 * s2; out.pz = az + a1z * ah1 * s1 + a2z * ah2 * s2;
    out.px += nx * best * 0.5; out.pz += nz * best * 0.5;
  }
  return true;
}

// Kırılma hızı eşiği (m/s, eşyaya dik bileşen): hafif eşyalar her araçla, orta eşyalar hızlı araçla kırılır
function breakSpeed(brk, m) {
  const k = brk.mass / Math.max(200, m) * 40; // kütle oranı
  return Math.max(1.2, Math.min(9, 1.5 + k));
}

// Statik çözüm: bir alt adım sonrası örtüşmeleri gider, hız/dönme tepkisi uygula
function resolveStatic(v, phys, isPlayer, fx, fz) {
  const d = v.def, hx = d.wid / 2, hz = d.len / 2;
  const R = Math.hypot(hx, hz) + 0.1;
  const y0 = v.pos.y, yTop = v.pos.y + (d.hei || 1.4);
  const m = vehMass(v), I = vehInertia(v);
  let worst = 0;
  for (let it = 0; it < 4; it++) {
    const boxes = phys.active.query(v.pos.x - R, v.pos.z - R, v.pos.x + R, v.pos.z + R, _q);
    let bestB = null, bd = 0;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.y1 <= y0 + 0.35 || b.y0 >= yTop || b.tag === 'curb') continue;
      if (!contactShape(v.pos.x, v.pos.z, fx, fz, hx, hz, b, C2)) continue;
      if (C2.depth > bd) { bd = C2.depth; bestB = b; C.nx = C2.nx; C.nz = C2.nz; C.depth = C2.depth; C.px = C2.px; C.pz = C2.pz; }
    }
    if (!bestB) break;
    const b = bestB;
    const rx = C.px - v.pos.x, rz = C.pz - v.pos.z;
    const w = v.yawRate + (v.spin || 0);
    // temas noktası hızı: v + ω × r  (bu çerçevede (ω rz, -ω rx))
    const vcx = v.vx + w * rz, vcz = v.vz - w * rx;
    const vn = vcx * C.nx + vcz * C.nz;
    // kırılabilir eşya
    if (b.brk && -vn > breakSpeed(b.brk, m) && phys.breakProp(b, v.vx, v.vz, v)) {
      const k = m / (m + b.brk.mass);
      v.vx *= k; v.vz *= k;
      v.game.particles && v.game.particles.sparks && b.brk.mass > 30 && v.game.particles.sparks({ x: C.px, y: 0.5, z: C.pz }, 4);
      if (audio.crash) audio.crash(C.px, C.pz, Math.min(0.6, -vn / 30));
      if (isPlayer && b.brk.mass > 50) v.game.cameraShake(0.08);
      continue;
    }
    // konum düzeltmesi
    v.pos.x += C.nx * (C.depth + 0.002); v.pos.z += C.nz * (C.depth + 0.002);
    if (vn >= 0) continue;
    const kn = rz * C.nx - rx * C.nz;
    const j = (-(1 + REST_STATIC) * vn) / (1 / m + (kn * kn) / I);
    v.vx += (j * C.nx) / m; v.vz += (j * C.nz) / m;
    let dw = (j * kn) / I;
    // sürtünme (teğet)
    const tx = -C.nz, tz = C.nx;
    const vt = vcx * tx + vcz * tz;
    const kt = rz * tx - rx * tz;
    let jt = -vt / (1 / m + (kt * kt) / I);
    const jl = MU_STATIC * j; if (jt > jl) jt = jl; else if (jt < -jl) jt = -jl;
    v.vx += (jt * tx) / m; v.vz += (jt * tz) / m;
    dw += (jt * kt) / I;
    // palet/tank dönmez gibi davransın
    if (v.P && v.P.steer === 0) dw *= 0.2;
    v.spin = Math.max(-6, Math.min(6, (v.spin || 0) + dw));
    const imp = -vn;
    if (imp > worst) worst = imp;
    if (imp > 5 && !v._hitFx) {
      v._hitFx = true;
      v.damage(imp * imp * 0.9 * (v.P && v.P.steer === 0 ? 0.1 : 1), null);
      v.impact(C.px, C.pz, C.nx, C.nz, imp);
      audio.crash(C.px, C.pz, Math.min(1.5, imp / 15));
      const g = v.game;
      if (g.particles && g.particles.sparks) g.particles.sparks({ x: C.px, y: 0.6, z: C.pz }, Math.min(16, 4 + imp * 0.5));
      if (isPlayer) g.cameraShake(Math.min(0.6, imp / 30));
    }
  }
  return worst;
}

// Vehicle.update içinden: konumu alt adımlarla ilerlet + statik çözüm
export function integrateVehicle(v, dt, phys, isPlayer) {
  v.prevX = v.pos.x; v.prevZ = v.pos.z;
  const sp = Math.hypot(v.vx, v.vz);
  const solve = v.kind === 'car' && v.pos.y < 1.5 && !v.noCollide;
  const n = solve ? Math.max(1, Math.min(12, Math.ceil((sp * dt) / SUB_STEP))) : 1;
  const h = dt / n;
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  v._hitFx = false;
  for (let i = 0; i < n; i++) {
    v.pos.x += v.vx * h; v.pos.z += v.vz * h;
    if (solve && (sp > 0.02 || Math.abs(v.spin || 0) > 0.01 || v._pushed)) resolveStatic(v, phys, isPlayer, fx, fz);
  }
  v._pushed = false;
}

// ---------------- araç - araç ----------------
const P = { nx: 0, nz: 0, depth: 0, px: 0, pz: 0 };
export function collidePair(a, b, mgr) {
  const da = a.def, db = b.def;
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
  const lim = (Math.hypot(da.len, da.wid) + Math.hypot(db.len, db.wid)) * 0.5;
  if (Math.abs(dx) > lim || Math.abs(dz) > lim) return false;
  if (Math.abs(a.pos.y - b.pos.y) > 2) return false;
  const afx = Math.sin(a.heading), afz = Math.cos(a.heading), bfx = Math.sin(b.heading), bfz = Math.cos(b.heading);
  // normal B'den A'ya
  if (!satBoxes(a.pos.x, a.pos.z, afz, -afx, afx, afz, da.wid / 2, da.len / 2, b.pos.x, b.pos.z, bfz, -bfx, bfx, bfz, db.wid / 2, db.len / 2, P)) return false;
  // n: A'dan B'ye
  const nx = -P.nx, nz = -P.nz;
  const ma = vehMass(a), mb = vehMass(b), Ia = vehInertia(a), Ib = vehInertia(b);
  const ima = 1 / ma, imb = 1 / mb;
  // konum: ters kütleye göre ayır
  const corr = P.depth + 0.002;
  a.pos.x -= nx * corr * ima / (ima + imb); a.pos.z -= nz * corr * ima / (ima + imb);
  b.pos.x += nx * corr * imb / (ima + imb); b.pos.z += nz * corr * imb / (ima + imb);
  a._pushed = b._pushed = true;
  const rax = P.px - a.pos.x, raz = P.pz - a.pos.z, rbx = P.px - b.pos.x, rbz = P.pz - b.pos.z;
  const wa = a.yawRate + (a.spin || 0), wb = b.yawRate + (b.spin || 0);
  const vax = a.vx + wa * raz, vaz = a.vz - wa * rax, vbx = b.vx + wb * rbz, vbz = b.vz - wb * rbx;
  const rvx = vbx - vax, rvz = vbz - vaz;
  const vn = rvx * nx + rvz * nz;
  if (vn >= 0) return true;
  const ka = raz * nx - rax * nz, kb = rbz * nx - rbx * nz;
  const j = (-(1 + REST_CAR) * vn) / (ima + imb + (ka * ka) / Ia + (kb * kb) / Ib);
  a.vx -= j * nx * ima; a.vz -= j * nz * ima; b.vx += j * nx * imb; b.vz += j * nz * imb;
  let dwa = -(j * ka) / Ia, dwb = (j * kb) / Ib;
  // sürtünme
  const tx = -nz, tz = nx;
  const vt = rvx * tx + rvz * tz;
  const kta = raz * tx - rax * tz, ktb = rbz * tx - rbx * tz;
  let jt = -vt / (ima + imb + (kta * kta) / Ia + (ktb * ktb) / Ib);
  const jl = MU_CAR * j; if (jt > jl) jt = jl; else if (jt < -jl) jt = -jl;
  a.vx -= jt * tx * ima; a.vz -= jt * tz * ima; b.vx += jt * tx * imb; b.vz += jt * tz * imb;
  dwa -= (jt * kta) / Ia; dwb += (jt * ktb) / Ib;
  const clampW = (x) => Math.max(-6, Math.min(6, x));
  if (!(a.P && a.P.steer === 0)) a.spin = clampW((a.spin || 0) + dwa);
  if (!(b.P && b.P.steer === 0)) b.spin = clampW((b.spin || 0) + dwb);
  const imp = -vn;
  if (imp > 4) {
    const tot = ma + mb;
    a.damage(imp * imp * 0.6 * (mb / tot) * 2, b.driver); b.damage(imp * imp * 0.6 * (ma / tot) * 2, a.driver);
    a.impact(P.px, P.pz, -nx, -nz, imp); b.impact(P.px, P.pz, nx, nz, imp);
    audio.crash(a.pos.x, a.pos.z, Math.min(1.5, imp / 12));
    const g = mgr.game;
    g.particles.sparks({ x: P.px, y: 0.6, z: P.pz }, 10);
    const pl = g.player;
    if (a.driver === pl || b.driver === pl) {
      g.cameraShake(Math.min(0.6, imp / 25));
      const other = a.driver === pl ? b : a;
      if (other.type === 'police' || other.type === 'swat') g.wanted.crime('hit_police_car', other.pos);
      if (other.ai && other.ai.mode === 'traffic') other.ai.panic = 3;
      if (other.ai && other.ai.mode === 'chase') other.ai.rammedT = 0.7;
    }
    // trafik sürücüsü çarpışmadan sonra kısa süre durur (kaza)
    for (const v of [a, b]) if (v.ai && v.ai.mode === 'traffic' && !(v.driver && v.driver.isPlayer)) { v.ai.crashT = 1.5 + Math.random() * 2; }
  }
  return true;
}

// Eski yöntem (tekne/uçak gibi araç dışı türler için): daire yaklaşımı
function collideCircles(a, b) {
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
  const d = Math.hypot(dx, dz), r = a.radius + b.radius;
  if (d >= r || d < 1e-4 || Math.abs(a.pos.y - b.pos.y) > 2) return;
  const nx = dx / d, nz = dz / d, pen = (r - d) / 2;
  a.pos.x -= nx * pen; a.pos.z -= nz * pen; b.pos.x += nx * pen; b.pos.z += nz * pen;
  const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  if (rv < 0) { const ma = vehMass(a), mb = vehMass(b); const j = (-1.3 * rv) / (1 / ma + 1 / mb); a.vx -= (j / ma) * nx; a.vz -= (j / ma) * nz; b.vx += (j / mb) * nx; b.vz += (j / mb) * nz; }
}

// Tüm araç çiftleri: ızgara ile kaba eleme (O(n) yakın çiftler)
const _cells = new Map();
const _pool = [];
export function collideAllVehicles(mgr) {
  const L = mgr.list;
  for (const arr of _cells.values()) { arr.length = 0; _pool.push(arr); }
  _cells.clear();
  const CELL = 12;
  for (let i = 0; i < L.length; i++) {
    const v = L[i];
    if (v.kind === 'air' && v.pos.y > 3) continue;
    const k = (Math.floor(v.pos.x / CELL) + 512) * 4096 + Math.floor(v.pos.z / CELL) + 512;
    let arr = _cells.get(k);
    if (!arr) { arr = _pool.pop() || []; _cells.set(k, arr); }
    arr.push(v);
  }
  for (let i = 0; i < L.length; i++) {
    const a = L[i];
    if (a.kind === 'air' && a.pos.y > 3) continue;
    const cx = Math.floor(a.pos.x / CELL), cz = Math.floor(a.pos.z / CELL);
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      const arr = _cells.get((cx + ox + 512) * 4096 + cz + oz + 512);
      if (!arr) continue;
      for (let j = 0; j < arr.length; j++) {
        const b = arr[j];
        if (b.id <= a.id) continue;
        if (a.kind === 'car' && b.kind === 'car') collidePair(a, b, mgr);
        else collideCircles(a, b);
      }
    }
  }
}

// ---------------- yaya / oyuncu - araç ----------------
// Aktörü araç kutusunun dışına iter; hızlı araçta tek seferlik darbe (bekleme süresi). Darbe olduysa hız döner.
export function actorVsVehicle(g, v, a, dt) {
  const d = v.def;
  if (a.pos.y > v.pos.y + (d.hei || 1.4) - 0.15 || a.pos.y < v.pos.y - 1) return 0;
  const r = a.radius || 0.35;
  const hx = d.wid / 2 + r, hz = d.len / 2 + r;
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading), rx = fz, rz = -fx;
  const testAt = (cx, cz) => {
    const dx = a.pos.x - cx, dz = a.pos.z - cz;
    const lx = dx * rx + dz * rz, lz = dx * fx + dz * fz;
    return Math.abs(lx) < hx && Math.abs(lz) < hz;
  };
  let inside = testAt(v.pos.x, v.pos.z);
  // süpürülmüş: önceki kare konumundan bu yana araç aktörün üstünden geçtiyse
  if (!inside && v.prevX !== undefined) {
    const mx = v.pos.x - v.prevX, mz = v.pos.z - v.prevZ;
    const step = Math.hypot(mx, mz);
    if (step > d.len * 0.4) { const n = Math.ceil(step / (d.len * 0.4)); for (let k = 1; k < n && !inside; k++) if (testAt(v.prevX + (mx * k) / n, v.prevZ + (mz * k) / n)) inside = true; }
    if (inside) { a.pos.x += mx * 0.6; a.pos.z += mz * 0.6; } // aracın önüne sür
  }
  if (!inside) return 0;
  const dx = a.pos.x - v.pos.x, dz = a.pos.z - v.pos.z;
  let lx = dx * rx + dz * rz, lz = dx * fx + dz * fz;
  // en kısa çıkış: yan veya ön/arka
  const px = hx - Math.abs(lx), pz = hz - Math.abs(lz);
  let nlx = 0, nlz = 0;
  if (px < pz) { nlx = lx >= 0 ? 1 : -1; lx = nlx * (hx + 0.02); } else { nlz = lz >= 0 ? 1 : -1; lz = nlz * (hz + 0.02); }
  a.pos.x = v.pos.x + lx * rx + lz * fx; a.pos.z = v.pos.z + lx * rz + lz * fz;
  const nx = nlx * rx + nlz * fx, nz = nlx * rz + nlz * fz;
  // aracın temas noktasındaki hızının normale bileşeni = darbe hızı
  const w = v.yawRate + (v.spin || 0);
  const crx = a.pos.x - v.pos.x, crz = a.pos.z - v.pos.z;
  const vcx = v.vx + w * crz, vcz = v.vz - w * crx;
  const sp = vcx * nx + vcz * nz;
  if (a.carHitT > 0 || sp < 3) return 0;
  a.carHitT = 0.8;
  return sp;
}

// Prosedürel insan geometrisi: TEK sürekli deri ağı (iskelete ağırlıklı, SkinnedMesh) + aynı iskelete bağlı kıyafet katmanları.
// Gövde, kol, bacak, el (parmaklı), ayak: iskelet boyunca kesit halkalarından "loft" edilir; eklemlerde ağırlıklar yumuşak geçer
// (dirsek/diz/omuz boşluksuz bükülür). Kıyafet bantları aynı halkaları kalınlık payıyla kullanır (alttaki deri üretilmez).
// Kafa: küre üzerinde heykel (kafatası, çene, elmacık, burun, dudak, göz çukuru); ayrı göz küreleri, göz kapakları, kirpik kartları.
// Saç ve sakal: katmanlı tel kartları (alfa) + kafa derisi kabuğu. Hepsi tek BufferGeometry, tek malzeme (bkz. charTex.js).
import * as THREE from 'three';
import { RNG } from '../core/util.js';
import { TILE, TILE_SIZE, headDims, headUV, EYE_UV } from './charTex.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sm01 = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const smooth = (a, b, x) => sm01((x - a) / (b - a));
const gauss = (x, w) => Math.exp(-(x * x) / (w * w));
const angD = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

// ---------------- iskelet ----------------
export const BONES = ['hips', 'spine', 'chest', 'neck', 'head',
  'shL', 'elL', 'wrL', 'fiL', 'fdL', 'thL', 'shR', 'elR', 'wrR', 'fiR', 'fdR', 'thR',
  'hipL', 'knL', 'anL', 'toeL', 'hipR', 'knR', 'anR', 'toeR'];
export const BI = {}; BONES.forEach((n, i) => { BI[n] = i; });
export const BONE_PARENT = {
  hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  shL: 'chest', elL: 'shL', wrL: 'elL', fiL: 'wrL', fdL: 'fiL', thL: 'wrL',
  shR: 'chest', elR: 'shR', wrR: 'elR', fiR: 'wrR', fdR: 'fiR', thR: 'wrR',
  hipL: 'hips', knL: 'hipL', anL: 'knL', toeL: 'anL', hipR: 'hips', knR: 'hipR', anR: 'knR', toeR: 'anR',
};
// geriye uyum: eski sabitler
export const RIG = { hips: 0.95, spine: 1.05, chest: 1.25, neck: 1.46, head: 1.54, shX: 0.19, shY: 1.45, elY: 1.16, wrY: 0.9, hipX: 0.095, hipY: 0.92, knY: 0.49, anY: 0.08 };

const q4 = (v, s) => Math.round(v / s) * s;
// görünüşten vücut ölçüleri (birim erkek uzayı; boy farkı body.scale ile)
export function rigFor(L) {
  const f = L.gender === 'f';
  const bk = q4(clamp(L.build || 1, 0.8, 1.35), 0.04);
  const sw = q4(clamp(L.shoulders || 1, 0.85, 1.2), 0.04);
  const fat = q4(clamp(L.fat || 0, 0, 1), 0.1);
  const age = q4(clamp(L.age || 0, 0, 1), 0.25);
  const height = q4(clamp(L.height || 1, 0.9, 1.1), 0.02) * (f ? 0.94 : 1) * (1 - 0.025 * age);
  const shX = 0.19 * (f ? 0.88 : 1) * (0.55 + 0.45 * bk) * sw;
  const hipX = 0.095 * (f ? 1.05 : 1) * (0.72 + 0.28 * bk + 0.04 * fat);
  const hk = f ? 0.9 : 1;
  const pos = { hips: [0, 0.95, 0], spine: [0, 1.05, 0], chest: [0, 1.25, 0], neck: [0, 1.46, 0], head: [0, 1.54, 0] };
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R', x = s * shX;
    pos['sh' + S] = [x, 1.45, 0]; pos['el' + S] = [x, 1.16, 0]; pos['wr' + S] = [x, 0.9, 0];
    pos['fi' + S] = [x, 0.9 - 0.094 * hk, 0]; pos['fd' + S] = [x, 0.9 - 0.13 * hk, 0]; pos['th' + S] = [x - s * 0.007, 0.9 - 0.022 * hk, 0.017 * hk];
    const hx = s * hipX;
    pos['hip' + S] = [hx, 0.92, 0]; pos['kn' + S] = [hx, 0.49, 0]; pos['an' + S] = [hx, 0.08, 0]; pos['toe' + S] = [hx, 0.025, 0.12];
  }
  return { f, bk, sw, fat, age, height, shX, hipX, hk, pos };
}

// ---------------- malzeme (vertex başına) ----------------
const matCache = new Map();
const _c = new THREE.Color();
function M(col, tile = 'flat', rough = 0.8, metal = 0, mul = 1) {
  const k = col + '|' + tile + '|' + rough + '|' + metal + '|' + mul;
  let m = matCache.get(k);
  if (!m) {
    _c.set(col); if (mul !== 1) _c.multiplyScalar(mul);
    const t = TILE[tile] !== undefined ? TILE[tile] : 12;
    m = { r: _c.r, g: _c.g, b: _c.b, tile: t, rough, metal, ts: TILE_SIZE[t] || 0.06 };
    matCache.set(k, m);
  }
  return m;
}

// ---------------- ağırlık yardımcıları ----------------
// istasyonlar: [[t, {kemik: ağırlık}]] — ardışık istasyonlar arası yumuşak geçiş
function W(o) { if (typeof o === 'number') return { [o]: 1 }; return o; }
function chainW(t, st) {
  if (t <= st[0][0]) return st[0][1];
  for (let i = 0; i < st.length - 1; i++) {
    if (t <= st[i + 1][0]) {
      const a = st[i][1], b = st[i + 1][1];
      if (a === b) return a;
      const k = sm01((t - st[i][0]) / (st[i + 1][0] - st[i][0] || 1));
      const o = {};
      for (const j in a) o[j] = (o[j] || 0) + a[j] * (1 - k);
      for (const j in b) o[j] = (o[j] || 0) + b[j] * k;
      return o;
    }
  }
  return st[st.length - 1][1];
}
function mixW(a, b, k) {
  if (k <= 0) return a; if (k >= 1) return b;
  const o = {};
  for (const j in a) o[j] = (o[j] || 0) + a[j] * (1 - k);
  for (const j in b) o[j] = (o[j] || 0) + b[j] * k;
  return o;
}

// ---------------- ağ kurucu ----------------
class MB {
  constructor() { this.P = []; this.UV = []; this.C = []; this.MT = []; this.SI = []; this.SW = []; this.I = []; this.seam = []; this.n = 0; }
  v(x, y, z, u, v, m, w, cm = 1) {
    this.P.push(x, y, z); this.UV.push(u, v); this.C.push(m.r * cm, m.g * cm, m.b * cm); this.MT.push(m.tile, m.rough, m.metal);
    // en güçlü 4 kemik
    let e = []; for (const j in w) if (w[j] > 0.001) e.push([+j, w[j]]);
    if (e.length > 4) { e.sort((a, b) => b[1] - a[1]); e = e.slice(0, 4); }
    let s = 0; for (const x2 of e) s += x2[1];
    for (let i = 0; i < 4; i++) { if (i < e.length) { this.SI.push(e[i][0]); this.SW.push(e[i][1] / s); } else { this.SI.push(0); this.SW.push(0); } }
    return this.n++;
  }
  t(a, b, c) { this.I.push(a, b, c); }
  geometry() {
    const n = this.n, P = new Float32Array(this.P), N = new Float32Array(n * 3), I = this.I;
    for (let i = 0; i < I.length; i += 3) {
      const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const k of [a, b, c]) { N[k] += nx; N[k + 1] += ny; N[k + 2] += nz; }
    }
    for (const [a, b] of this.seam) for (let k = 0; k < 3; k++) { const s = N[a * 3 + k] + N[b * 3 + k]; N[a * 3 + k] = s; N[b * 3 + k] = s; }
    for (let i = 0; i < n; i++) { const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.UV), 2));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.C), 3));
    g.setAttribute('matp', new THREE.BufferAttribute(new Float32Array(this.MT), 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(this.SI), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(this.SW), 4));
    g.setIndex(n > 65535 ? new THREE.BufferAttribute(new Uint32Array(I), 1) : new THREE.BufferAttribute(new Uint16Array(I), 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.0);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(-1.2, -0.2, -1.2), new THREE.Vector3(1.2, 2.2, 1.2));
    return g;
  }
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _p = V(0, 0, 0), _p2 = V(0, 0, 0), _p3 = V(0, 0, 0), _n = V(0, 0, 0), _t = V(0, 0, 0), _b = V(0, 0, 0);

// Kesit halkalarından loft. keys: [t, cx, cy, cz, rx(U1), rf(+U2), rb(-U2), p(süperelips)]
class Limb {
  constructor(keys, U1, U2, A, wfn, opt = {}) {
    this.k = keys; this.U1 = U1; this.U2 = U2; this.A = A; this.w = wfn;
    this.bump = opt.bump || null; this.floor = opt.floor;
    this.flip = new THREE.Vector3().crossVectors(U1, U2).dot(A) < 0;
    this.t0 = keys[0][0]; this.t1 = keys[keys.length - 1][0];
    let pm = 0; for (const k of keys) pm = Math.max(pm, Math.PI * (k[4] + (k[5] + k[6]) / 2));
    this.perim = opt.perim || pm;
    this.K = new Float32Array(8);
  }
  at(t) {
    const k = this.k, K = this.K, n = k.length;
    if (t <= k[0][0]) { for (let i = 1; i < 8; i++) K[i] = k[0][i]; return K; }
    if (t >= k[n - 1][0]) { for (let i = 1; i < 8; i++) K[i] = k[n - 1][i]; return K; }
    let i = 0; while (i < n - 2 && t > k[i + 1][0]) i++;
    const a = k[i], b = k[i + 1], d = b[0] - a[0] || 1e-6, u = (t - a[0]) / d;
    const pa = k[Math.max(0, i - 1)], nb = k[Math.min(n - 1, i + 2)];
    const h00 = 2 * u * u * u - 3 * u * u + 1, h10 = u * u * u - 2 * u * u + u, h01 = -2 * u * u * u + 3 * u * u, h11 = u * u * u - u * u;
    for (let j = 1; j < 8; j++) {
      const m0 = ((b[j] - pa[j]) / ((b[0] - pa[0]) || 1e-6)) * d * 0.85, m1 = ((nb[j] - a[j]) / ((nb[0] - a[0]) || 1e-6)) * d * 0.85;
      K[j] = h00 * a[j] + h10 * m0 + h01 * b[j] + h11 * m1;
    }
    for (let j = 4; j < 7; j++) K[j] = Math.max(0.0008, Math.min(K[j], Math.max(a[j], b[j]) * 1.04));
    return K;
  }
  point(t, th, off, out, bumpK = 1) {
    const K = this.at(t), c = Math.cos(th), s = Math.sin(th), e = 2 / (K[7] || 2);
    const ex = Math.sign(c) * Math.pow(Math.abs(c), e), ez = Math.sign(s) * Math.pow(Math.abs(s), e);
    let rx = K[4] + off, rz = (s >= 0 ? K[5] : K[6]) + off;
    if (this.bump && bumpK > 0) { const b = this.bump(t, th) * bumpK; rx += b; rz += b; }
    out.set(K[1], K[2], K[3]).addScaledVector(this.U1, ex * rx).addScaledVector(this.U2, ez * rz);
    if (this.floor !== undefined && out.y < this.floor) out.y = this.floor;
    return out;
  }
  // bantlar: [{t0,t1,off,mat,bumpK}] (off/mat sabit ya da (th,t)=>...)
  emit(mb, bands, seg, dt, o = {}) {
    const th0 = o.th0 !== undefined ? o.th0 : -Math.PI / 2, arc = o.arc || TAU, full = arc >= TAU - 1e-6;
    const rings = [];
    const offOf = (B, th, t) => (typeof B.off === 'function' ? B.off(th, t) : B.off || 0);
    for (let bi = 0; bi < bands.length; bi++) {
      const B = bands[bi];
      if (B.t1 - B.t0 < 1e-5) continue;
      const n = Math.max(1, Math.ceil((B.t1 - B.t0) / dt - 1e-6));
      const ts = [];
      for (let i = 0; i <= n; i++) ts.push(B.t0 + ((B.t1 - B.t0) * i) / n);
      if (rings.length) {
        const A = rings[rings.length - 1].B;
        const oa = offOf(A, Math.PI / 2, B.t0), ob = offOf(B, Math.PI / 2, B.t0);
        const X = oa > ob ? A : B;
        if (Math.abs(oa - ob) > 1e-4) { rings.push({ t: B.t0, B: { off: A.off, mat: X.mat, bumpK: A.bumpK } }, { t: B.t0, B: { off: B.off, mat: X.mat, bumpK: B.bumpK } }); }
      }
      for (const t of ts) rings.push({ t, B });
    }
    const N = seg;
    let prev = null;
    const emitRows = (inner) => {
      prev = null;
      for (const R of rings) {
        const row = [], B = R.B;
        for (let j = 0; j <= N; j++) {
          const th = th0 + (arc * j) / N;
          let off = offOf(B, th, R.t);
          let m = typeof B.mat === 'function' ? B.mat(th, R.t) : B.mat;
          if (inner) { off -= 0.003; m = o.innerMat || m; }
          this.point(R.t, th, off, _p, B.bumpK !== undefined ? B.bumpK : 1);
          const ur = full ? Math.max(1, Math.round(this.perim / m.ts)) : (arc / TAU) * this.perim / m.ts;
          row.push(mb.v(_p.x, _p.y, _p.z, (j / N) * ur, R.t / m.ts, m, this.w(R.t, _p, th)));
        }
        if (full) mb.seam.push([row[0], row[N]]);
        if (prev) {
          const fl = this.flip !== inner;
          for (let j = 0; j < N; j++) {
            const a = prev[j], b = prev[j + 1], c = row[j + 1], d = row[j];
            if (fl) { mb.t(a, d, c); mb.t(a, c, b); } else { mb.t(a, b, c); mb.t(a, c, d); }
          }
        }
        prev = row;
      }
    };
    emitRows(false);
    if (o.double) emitRows(true);
  }
  // yüzeyi izleyen yama (cep, şerit, dikiş, yaka)
  patch(mb, thA, thB, tA, tB, off, mat, nth = 3, nt = 3, o = {}) {
    const rows = [];
    for (let i = 0; i <= nt; i++) {
      const t = tA + ((tB - tA) * i) / nt, row = [];
      for (let j = 0; j <= nth; j++) {
        const u = j / nth;
        const th = typeof thA === 'function' ? thA(t) + (thB(t) - thA(t)) * u : thA + (thB - thA) * u;
        const of = typeof off === 'function' ? off(th, t) : off;
        this.point(t, th, of, _p, o.bumpK !== undefined ? o.bumpK : 1);
        const m = typeof mat === 'function' ? mat(u, i / nt) : mat;
        row.push(mb.v(_p.x, _p.y, _p.z, u * (o.us || 1), (t - tA) / m.ts, m, this.w(t, _p, th), o.cm ? o.cm(u, i / nt) : 1));
      }
      rows.push(row);
    }
    const fl = this.flip !== (thB < thA) !== (tB < tA);
    for (let i = 0; i < nt; i++) for (let j = 0; j < nth; j++) {
      const a = rows[i][j], b = rows[i][j + 1], c = rows[i + 1][j + 1], d = rows[i + 1][j];
      if (fl) { mb.t(a, d, c); mb.t(a, c, b); } else { mb.t(a, b, c); mb.t(a, c, d); }
    }
  }
  // düğme / perçin: yüzeyde küçük disk
  button(mb, t, th, off, r, mat, seg = 6) {
    this.point(t, th, off, _p); this.point(t, th, off + 0.01, _n).sub(_p).normalize();
    this.point(t + 0.004, th, off, _t).sub(_p).normalize();
    _b.crossVectors(_n, _t).normalize(); _t.crossVectors(_b, _n);
    const w = this.w(t, _p, th);
    const c = mb.v(_p.x + _n.x * r * 0.5, _p.y + _n.y * r * 0.5, _p.z + _n.z * r * 0.5, 0.5, 0.5, mat, w);
    const ring = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * TAU, ca = Math.cos(a) * r, sa = Math.sin(a) * r;
      ring.push(mb.v(_p.x + _t.x * ca + _b.x * sa, _p.y + _t.y * ca + _b.y * sa, _p.z + _t.z * ca + _b.z * sa, 0, 0, mat, w, 0.8));
    }
    for (let i = 0; i < seg; i++) mb.t(c, ring[i], ring[(i + 1) % seg]);
  }
}

// yol boyunca boru (zincir, ip, çerçeve, kayış)
function tube(mb, pts, rad, seg, mat, wfn, closed = false, cm) {
  const n = pts.length, rows = [];
  const T0 = V(0, 0, 0), Nn = V(0, 0, 0), Bn = V(0, 0, 0), up = V(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    T0.subVectors(b, a).normalize();
    if (i === 0) { Nn.copy(Math.abs(T0.y) > 0.9 ? V(1, 0, 0) : up).addScaledVector(T0, -(Math.abs(T0.y) > 0.9 ? T0.x : T0.y)).normalize(); }
    else { Nn.addScaledVector(T0, -Nn.dot(T0)).normalize(); }
    Bn.crossVectors(T0, Nn);
    const r = typeof rad === 'function' ? rad(i / (n - 1)) : rad;
    const row = [], w = wfn(pts[i], i / (n - 1));
    for (let j = 0; j <= seg; j++) {
      const ang = (j / seg) * TAU, ca = Math.cos(ang) * r, sa = Math.sin(ang) * r;
      const p = pts[i];
      row.push(mb.v(p.x + Nn.x * ca + Bn.x * sa, p.y + Nn.y * ca + Bn.y * sa, p.z + Nn.z * ca + Bn.z * sa, j / seg, i * 0.3, mat, w, cm ? cm(i / (n - 1)) : 1));
    }
    mb.seam.push([row[0], row[seg]]);
    rows.push(row);
  }
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const A = rows[i], B = rows[(i + 1) % n];
    for (let j = 0; j < seg; j++) { mb.t(A[j], B[j], B[j + 1]); mb.t(A[j], B[j + 1], A[j + 1]); }
  }
}
// elipsoit (göz, düğme, topuz, çanta parçası)
function ellip(mb, c, rx, ry, rz, ws, hs, mat, w, uvFn, cmFn) {
  const rows = [];
  for (let i = 0; i <= hs; i++) {
    const lat = -Math.PI / 2 + (Math.PI * i) / hs, row = [];
    for (let j = 0; j <= ws; j++) {
      const lon = (TAU * j) / ws;
      const dx = Math.cos(lat) * Math.sin(lon), dy = Math.sin(lat), dz = Math.cos(lat) * Math.cos(lon);
      const uv = uvFn ? uvFn(dx, dy, dz) : [j / ws, i / hs];
      row.push(mb.v(c.x + dx * rx, c.y + dy * ry, c.z + dz * rz, uv[0], uv[1], mat, typeof w === 'function' ? w(dx, dy, dz) : w, cmFn ? cmFn(dx, dy, dz) : 1));
    }
    mb.seam.push([row[0], row[ws]]);
    rows.push(row);
  }
  for (let i = 0; i < hs; i++) for (let j = 0; j < ws; j++) { const a = rows[i][j], b = rows[i][j + 1], cc = rows[i + 1][j + 1], d = rows[i + 1][j]; mb.t(a, b, cc); mb.t(a, cc, d); }
}
// kutu (çanta, telsiz, kılıf): yerel eksenler + merkez
function boxP(mb, c, ax, ay, az, hx, hy, hz, mat, w) {
  const F = [[ax, ay, az], [ax.clone().negate(), ay, az.clone().negate()], [az, ay, ax.clone().negate()], [az.clone().negate(), ay, ax], [ax, az.clone().negate(), ay], [ax, az, ay.clone().negate()]];
  const H = [[hx, hy, hz], [hx, hy, hz], [hz, hy, hx], [hz, hy, hx], [hx, hz, hy], [hx, hz, hy]];
  for (let f = 0; f < 6; f++) {
    const [u, v, n] = F[f], [hu, hv, hn] = H[f], ids = [];
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = c.clone().addScaledVector(n, hn).addScaledVector(u, a * hu).addScaledVector(v, b * hv);
      ids.push(mb.v(p.x, p.y, p.z, (a + 1) / 2, (b + 1) / 2, mat, w));
    }
    mb.t(ids[0], ids[1], ids[2]); mb.t(ids[0], ids[2], ids[3]);
  }
}
// çift yüzlü tel kartı: pts yol, side yön (genişlik), w genişlik
function card(mb, pts, sides, width, mat, wfn, colFn) {
  const n = pts.length;
  for (const back of [false, true]) {
    const row = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i], s = sides[i], wd = (typeof width === 'function' ? width(i / (n - 1)) : width) * 0.5;
      const w = wfn(p, i / (n - 1)), cm = colFn ? colFn(i / (n - 1)) : 1;
      row.push([mb.v(p.x - s.x * wd, p.y - s.y * wd, p.z - s.z * wd, 0.02, i / (n - 1), mat, w, cm), mb.v(p.x + s.x * wd, p.y + s.y * wd, p.z + s.z * wd, 0.98, i / (n - 1), mat, w, cm)]);
    }
    for (let i = 0; i < n - 1; i++) {
      const [a, b] = row[i], [d, c] = row[i + 1];
      if (back) { mb.t(a, c, b); mb.t(a, d, c); } else { mb.t(a, b, c); mb.t(a, c, d); }
    }
  }
}

// ---------------- kafa şekli ----------------
// birim küre yönü -> kafa yüzeyi (kafa kemiği uzayı)
export function headPoint(f, dx, dy, dz, out, age = 0) {
  const D = headDims(f);
  let x = dx * D.rx, y = dy * D.ry, z = dz * D.rz;
  const low = smooth(0.0, -0.95, dy);
  // çene hattı: önde dar çene ucu, yanlarda köşeli çene açısı
  const jaw = f ? 0.34 : 0.26;
  x *= 1 - low * jaw * (0.6 + 0.4 * Math.max(0, dz));
  if (!f) x *= 1 + 0.06 * gauss(dy + 0.55, 0.22) * gauss(dz - 0.1, 0.5);
  if (dz > 0) z *= 1 - low * 0.1; else z *= 1 - low * 0.5;
  if (dz < 0 && dy > -0.3) z *= 1.07 + 0.03 * gauss(dy - 0.2, 0.4); // kafatası arkası
  x *= 1 - 0.05 * gauss(dy - 0.25, 0.3) * gauss(dz - 0.45, 0.4); // şakak
  if (dz > 0.3) z -= (dz - 0.3) * 0.014; // yüz düzlüğü
  const fy = y, fx = x;
  if (dz > 0.15) {
    const fade = smooth(0.15, 0.45, dz);
    const g2 = (cx, cy, sx, sy) => Math.exp(-(((fx - cx) / sx) ** 2) - (((fy - cy) / sy) ** 2));
    let dzv = 0;
    // burun: köprü -> uç, kanatlar, burun altı
    if (fy > -0.052 && fy < 0.022) {
      const t = (0.022 - fy) / 0.064;
      const A = (f ? 0.018 : 0.023) * (0.3 + 0.7 * Math.pow(t, 1.3)) * (fy < -0.038 ? Math.max(0, 1 - (-0.038 - fy) / 0.014) : 1);
      const wN = 0.0065 + t * 0.008;
      dzv += A * Math.exp(-((fx / wN) ** 2));
    }
    for (const s of [-1, 1]) {
      dzv += 0.006 * g2(s * 0.0125, -0.037, 0.006, 0.006); // burun kanadı
      dzv -= 0.0095 * g2(s * 0.031, 0.012, 0.016, 0.0105); // göz çukuru
      dzv += (f ? 0.005 : 0.0045) * g2(s * 0.046, -0.014, 0.017, 0.012); // elmacık
      dzv -= 0.003 * g2(s * 0.025, -0.05, 0.01, 0.016) * (0.6 + age); // nazolabial
    }
    dzv += (f ? 0.004 : 0.0068) * g2(0, 0.031, 0.05, 0.007); // kaş kemeri
    dzv += (f ? 0.006 : 0.0048) * g2(0, -0.054, 0.019, 0.0045); // üst dudak
    dzv += (f ? 0.007 : 0.0058) * g2(0, -0.066, 0.018, 0.005); // alt dudak
    dzv -= 0.0018 * g2(0, -0.0602, 0.013, 0.0022); // ağız çizgisi
    dzv -= 0.003 * g2(0, -0.078, 0.016, 0.004); // dudak altı çukur
    dzv += (f ? 0.004 : 0.007) * g2(0, -0.097, 0.019, 0.013); // çene ucu
    dzv -= 0.0015 * g2(0, -0.046, 0.004, 0.005); // filtrum
    z += dzv * fade;
  }
  return out.set(x, y + D.cy, z + D.cz);
}

// ---------------- kıyafet çözümleme ----------------
const TOP_MAP = { tshirt: 'tshirt', polo: 'polo', shirt: 'shirt', hoodie: 'hoodie', track: 'track', jacket: 'denim', blazer: 'blazer', leather: 'leather', coat: 'coat', suit: 'suit', tuxedo: 'tuxedo', police: 'police', police_shirt: 'police_shirt', police_vest: 'police_vest', vest: 'vest', sweater: 'sweater', kazak: 'sweater', pardesu: 'pardesu' };
const PANTS_MAP = { jeans: 'jeans', cargo: 'cargo', slacks: 'slacks', chino: 'chino', track: 'track', shorts: 'shorts', skirt: 'skirt', longskirt: 'longskirt' };
const SHOE_MAP = { sneaker: 'sneaker', hightop: 'hightop', loafer: 'loafer', polished: 'polished', boots: 'boots', wellies: 'wellies', sandal: 'loafer' };
function topKind(L) { return TOP_MAP[L.topStyle] || TOP_MAP[L.top] || 'tshirt'; }
function pantsKind(L) { return PANTS_MAP[L.pantsStyle] || PANTS_MAP[L.pants] || 'jeans'; }
function shoeKind(L) { return SHOE_MAP[L.shoesStyle] || SHOE_MAP[L.shoes] || 'sneaker'; }
function hatKind(L) {
  const h = L.hatStyle && L.hatStyle !== 'none' ? L.hatStyle : L.hat;
  return { kasket: 'kasket', cap: 'cap', bere: 'bere', fedora: 'fedora', panama: 'panama', police: 'police', basortusu: 'basortusu', takke: 'takke' }[h] || 'none';
}
const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); };

export function lookKey(L, lod) {
  return [lod, L.gender, L.build, L.height, L.shoulders, L.fat, L.age, L.skin, L.top, L.topStyle, L.topColor, L.shirtColor, L.pants, L.pantsStyle, L.pantsColor, L.shoes, L.shoesStyle, L.shoesColor,
    L.chain, L.chainStyle, L.hair, L.hairColor, L.beard, L.hat, L.hatStyle, L.hatColor, L.glasses, L.glassesStyle, L.glassesColor, L.tieColor, L.tie, L.watch, L.ring, L.tespih, L.bag, L.bagColor,
    L.carry, L.apron, L.apronColor, L.vest, L.eyeColor].join('|');
}

// ---------------- LOD kalite tablosu ----------------
const LODQ = [
  { torso: 26, limb: 16, dtT: 0.022, dtL: 0.028, fingers: true, fseg: 6, head: [48, 36], cards: 1, detail: 2, eyes: true },
  { torso: 14, limb: 9, dtT: 0.05, dtL: 0.06, fingers: false, fseg: 4, head: [22, 16], cards: 0.3, detail: 1, eyes: true },
  { torso: 8, limb: 6, dtT: 0.11, dtL: 0.13, fingers: false, fseg: 3, head: [10, 8], cards: 0, detail: 0, eyes: false },
];

// ================= ANA KURUCU =================
export function buildCharGeometry(L, lod = 0) {
  const R = rigFor(L), Q = LODQ[clamp(lod, 0, 2)], mb = new MB();
  const f = R.f, b = R.bk, fat = R.fat;
  const P = R.pos;
  const skinM = M(L.skin || '#e0b493', 'skin', 0.6, 0);
  const ctx = { L, R, Q, mb, f, b, fat, skinM, P };
  ctx.top = topKind(L); ctx.pants = pantsKind(L); ctx.shoes = shoeKind(L); ctx.hat = hatKind(L);
  buildTorso(ctx);
  buildArms(ctx);
  buildLegs(ctx);
  buildFeet(ctx);
  buildHead(ctx);
  buildHair(ctx);
  buildHat(ctx);
  buildExtras(ctx);
  const g = mb.geometry();
  g.userData = { verts: mb.n, tris: mb.I.length / 3 };
  return g;
}

// ---------------- gövde ----------------
function torsoKeys(R) {
  const f = R.f, b = R.bk, sw = R.sw, fat = R.fat;
  const rows = f
    ? [[0.8, 0.03, 0.02, 0.02], [0.83, 0.12, 0.075, 0.085], [0.88, 0.172, 0.09, 0.112], [0.94, 0.178, 0.09, 0.112], [1.0, 0.158, 0.082, 0.094], [1.06, 0.133, 0.078, 0.08], [1.11, 0.126, 0.078, 0.078],
      [1.18, 0.134, 0.084, 0.08], [1.25, 0.145, 0.098, 0.085], [1.31, 0.15, 0.1, 0.088], [1.36, 0.152, 0.095, 0.09], [1.41, 0.15, 0.088, 0.088], [1.45, 0.14, 0.07, 0.08], [1.48, 0.095, 0.056, 0.06],
      [1.51, 0.056, 0.05, 0.05], [1.57, 0.053, 0.049, 0.05], [1.63, 0.045, 0.04, 0.044], [1.66, 0.01, 0.01, 0.01]]
    : [[0.8, 0.03, 0.02, 0.02], [0.83, 0.115, 0.07, 0.08], [0.87, 0.158, 0.088, 0.104], [0.93, 0.166, 0.09, 0.11], [0.99, 0.162, 0.088, 0.097], [1.05, 0.152, 0.09, 0.086], [1.12, 0.15, 0.095, 0.086],
      [1.2, 0.158, 0.1, 0.09], [1.28, 0.17, 0.106, 0.095], [1.35, 0.18, 0.108, 0.1], [1.41, 0.18, 0.098, 0.098], [1.45, 0.165, 0.08, 0.09], [1.48, 0.11, 0.062, 0.07],
      [1.51, 0.064, 0.056, 0.058], [1.57, 0.06, 0.055, 0.056], [1.63, 0.05, 0.045, 0.05], [1.66, 0.01, 0.01, 0.01]];
  return rows.map(([y, rx, rf, rb]) => {
    const bulk = y < 1.47 ? 0.62 + 0.38 * b : 0.85 + 0.15 * b;
    const shK = 1 + (sw - 1) * smooth(1.25, 1.4, y) * smooth(1.48, 1.44, y);
    const belly = fat * gauss(y - 1.1, 0.12);
    const zc = y < 1.0 ? -0.004 : y > 1.5 ? 0.004 + (y - 1.5) * 0.06 : 0;
    return [y, 0, y, zc, rx * bulk * shK + belly * 0.03, rf * bulk + belly * 0.06 + fat * 0.01 * smooth(0.8, 1.0, y) * smooth(1.45, 1.2, y), rb * bulk + belly * 0.01, y > 1.47 ? 2 : 2.35];
  });
}
function torsoBump(R) {
  const f = R.f, b = R.bk;
  return (t, th) => {
    let s = 0;
    if (f) { const k = gauss(t - 1.29, 0.055); if (k > 0.01) s += 0.028 * k * (gauss(angD(th, Math.PI / 2 - 0.42), 0.36) + gauss(angD(th, Math.PI / 2 + 0.42), 0.36)); }
    else { const k = gauss(t - 1.33, 0.05); if (k > 0.01) s += 0.007 * b * k * (gauss(angD(th, Math.PI / 2 - 0.45), 0.45) + gauss(angD(th, Math.PI / 2 + 0.45), 0.45)); }
    const kb = gauss(t - 0.915, 0.05); if (kb > 0.01) s += (f ? 0.017 : 0.011) * kb * (gauss(angD(th, -Math.PI / 2 - 0.45), 0.42) + gauss(angD(th, -Math.PI / 2 + 0.45), 0.42));
    const ks = gauss(t - 1.36, 0.06); if (ks > 0.01) s += 0.005 * ks * (gauss(angD(th, -Math.PI / 2 - 0.6), 0.35) + gauss(angD(th, -Math.PI / 2 + 0.6), 0.35));
    if (t > 1.04 && t < 1.42) s -= 0.004 * gauss(angD(th, -Math.PI / 2), 0.1);
    return s;
  };
}
function torsoW(R) {
  const st = [[0.97, W(BI.hips)], [1.07, W(BI.spine)], [1.15, W(BI.spine)], [1.25, W(BI.chest)], [1.44, W(BI.chest)], [1.5, W(BI.neck)], [1.56, W(BI.neck)], [1.62, W(BI.head)]];
  return (t, p) => {
    let w = chainW(p.y, st);
    const ax = Math.abs(p.x);
    const ks = smooth(0.1, 0.17, ax) * smooth(1.33, 1.43, p.y) * 0.35;
    if (ks > 0.01) w = mixW(w, W(p.x > 0 ? BI.shL : BI.shR), ks);
    const kh = smooth(0.95, 0.84, p.y) * 0.45 * smooth(0.0, 0.08, ax);
    if (kh > 0.01) w = mixW(w, W(p.x > 0 ? BI.hipL : BI.hipR), kh);
    return w;
  };
}
// eteğin/paltonun bacakları izlemesi
function skirtW(R, top = 0.95, maxK = 0.7) {
  return (t, p) => {
    const k = smooth(top, top - 0.42, p.y) * maxK;
    const sL = smooth(-0.05, 0.05, p.x);
    const o = { [BI.hips]: 1 - k };
    o[BI.hipL] = k * sL; o[BI.hipR] = k * (1 - sL);
    return o;
  };
}

function buildTorso(c) {
  const { L, R, Q, mb, f } = c;
  const keys = torsoKeys(R), tw = torsoW(R);
  const T = new Limb(keys, V(1, 0, 0), V(0, 0, 1), V(0, 1, 0), tw, { bump: torsoBump(R) });
  c.torso = T;
  const top = c.top, pants = c.pants;
  const tc = L.topColor || '#444444', sc = L.shirtColor || '#e8e8e8', pc = L.pantsColor || '#2a3550';
  const det = Q.detail;
  // --- kıyafet malzemeleri ---
  const pantsTile = { jeans: 'denim', cargo: 'canvas', slacks: 'wool', chino: 'weave', track: 'poly', shorts: 'canvas', skirt: 'wool', longskirt: 'felt' }[pants];
  const pantsM = M(pc, pantsTile, pants === 'track' ? 0.55 : 0.85);
  c.pantsM = pantsM;
  const topSpec = {
    tshirt: { tile: 'jersey', off: 0.005, hem: 0.955, rough: 0.9 }, polo: { tile: 'weave', off: 0.005, hem: 0.955, rough: 0.85 },
    shirt: { tile: 'weave', off: 0.004, hem: 1.0, tuck: true, rough: 0.8 }, police_shirt: { tile: 'weave', off: 0.004, hem: 1.0, tuck: true, rough: 0.8 },
    hoodie: { tile: 'jersey', off: 0.014, hem: 0.93, rough: 0.95, rib: true }, track: { tile: 'poly', off: 0.01, hem: 0.95, rough: 0.5, rib: true },
    sweater: { tile: 'rib', off: 0.011, hem: 0.95, rough: 0.95, rib: true },
    denim: { tile: 'denim', off: 0.014, hem: 0.95, rough: 0.85 }, leather: { tile: 'leather', off: 0.013, hem: 0.95, rough: 0.38, metal: 0.05, rib: true },
    blazer: { tile: 'wool', off: 0.012, hem: 0.83, rough: 0.8, open: 1.16 }, suit: { tile: 'wool', off: 0.012, hem: 0.83, rough: 0.75, open: 1.13 },
    tuxedo: { tile: 'wool', off: 0.012, hem: 0.83, rough: 0.6, open: 1.1 }, coat: { tile: 'felt', off: 0.018, hem: 0.8, rough: 0.9, open: 1.22, long: 0.47 },
    pardesu: { tile: 'felt', off: 0.016, hem: 0.8, rough: 0.9, long: 0.3 },
    police: { tile: 'wool', off: 0.013, hem: 0.93, rough: 0.8, rib: true }, police_vest: { tile: 'weave', off: 0.004, hem: 1.0, tuck: true, rough: 0.8 },
    vest: { tile: 'weave', off: 0.004, hem: 1.0, tuck: true, rough: 0.8 },
  }[top];
  const topM = M(tc, topSpec.tile, topSpec.rough, topSpec.metal || 0);
  c.topM = topM; c.topSpec = topSpec;
  const underM = M(sc, 'weave', 0.75);
  const pantsOff = pants === 'track' ? 0.01 : pants === 'slacks' ? 0.008 : 0.006;
  const waist = 1.0;
  const skirtP = pants === 'skirt' || pants === 'longskirt';
  // V yaka / açık önü: (th,t) -> alt katman mı?
  const openHalf = (t) => {
    if (topSpec.open && t > topSpec.open) return 0.03 + 0.4 * smooth(topSpec.open, 1.44, t);
    if ((top === 'leather' || top === 'denim') && t > 1.36) return 0.02 + 0.32 * smooth(1.36, 1.46, t);
    if (top === 'coat' && t > 0.8) return 0.05;
    return 0;
  };
  const inOpen = (th, t) => { const h = openHalf(t); return h > 0 && Math.abs(angD(th, Math.PI / 2)) < h; };
  const hemY = topSpec.tuck ? waist : topSpec.hem;
  const topOff = (th, t) => {
    let o = topSpec.off;
    if (inOpen(th, t)) o = 0.004;
    if (top === 'suit' || top === 'blazer' || top === 'tuxedo' || top === 'coat') o += 0.006 * smooth(1.36, 1.44, t) * smooth(0.1, 0.16, Math.abs(Math.cos(th)) * 0.2);
    return o;
  };
  const topMat = (th, t) => (inOpen(th, t) ? underM : topM);
  const bands = [];
  // pantolon / etek altı
  bands.push({ t0: 0.8, t1: Math.min(hemY, waist), off: skirtP ? 0.004 : pantsOff, mat: skirtP ? M(pc, pantsTile, 0.85) : pantsM });
  if (hemY >= waist) {
    // kemer
    if (!skirtP && pants !== 'track' && pants !== 'shorts' && det) bands.push({ t0: waist - 0.002, t1: waist + 0.028, off: pantsOff + 0.004, mat: M('#1c120c', 'leather', 0.4, 0.05) });
    else bands.push({ t0: waist - 0.002, t1: waist + 0.025, off: pantsOff + 0.003, mat: M(pc, 'rib', 0.9) });
  } else if (topSpec.rib && det) {
    bands.push({ t0: hemY, t1: hemY + 0.04, off: topSpec.off + 0.002, mat: M(tc, top === 'leather' ? 'rib' : 'rib', 0.9, 0, top === 'leather' ? 0.8 : 0.95) });
  }
  const neckTop = top === 'shirt' || top === 'police_shirt' || top === 'polo' || top === 'vest' || top === 'police_vest' ? 1.505 : top === 'hoodie' || top === 'track' || top === 'sweater' ? 1.495 : top === 'leather' || top === 'police' || top === 'denim' ? 1.48 : 1.47;
  const t0top = bands[bands.length - 1].t1;
  bands.push({ t0: t0top, t1: neckTop, off: topOff, mat: topMat, bumpK: topSpec.off > 0.012 ? 0.55 : 1 });
  // boyun: ten ya da başörtüsü
  if (c.hat === 'basortusu') bands.push({ t0: neckTop, t1: 1.66, off: 0.024, mat: M(L.hatColor || '#5a2a3a', 'weave', 0.85) });
  else bands.push({ t0: neckTop, t1: 1.66, off: 0, mat: c.skinM });
  T.emit(mb, bands, Q.torso, Q.dtT);
  c.neckTop = neckTop;
  const darker = M(tc, topSpec.tile, topSpec.rough, 0, 0.78);
  const seamM = M(tc, topSpec.tile, topSpec.rough, 0, 0.7);
  if (det) {
  const frontZ = (t) => { T.point(t, Math.PI / 2, 0, _p3); return _p3.z; };
  void frontZ;
  // --- yaka ve detaylar ---
  if (top === 'tshirt' || top === 'sweater' || top === 'police') T.patch(mb, -Math.PI / 2, Math.PI * 1.5, 1.455, neckTop + 0.004, topSpec.off + 0.004, M(tc, 'rib', 0.9, 0, 0.92), 18, 1);
  if (top === 'shirt' || top === 'police_shirt' || top === 'polo' || top === 'vest' || top === 'police_vest') {
    const cc = top === 'vest' ? underM : topM;
    // dik yaka + yaka uçları
    T.patch(mb, Math.PI / 2 + 0.18, Math.PI * 2.5 - 0.18, 1.47, 1.52, 0.012, cc, 16, 1);
    for (const s of [1, -1]) T.patch(mb, (t) => Math.PI / 2 + s * (0.06 + (1.5 - t) * 3), (t) => Math.PI / 2 + s * (0.65 + (1.5 - t) * 2), 1.445, 1.5, 0.014, cc, 3, 2);
    // düğme patı + düğmeler
    if (top !== 'polo') T.patch(mb, Math.PI / 2 - 0.05, Math.PI / 2 + 0.05, waist, 1.46, topSpec.off + 0.002, M(top === 'vest' ? sc : tc, 'weave', 0.8, 0, 0.96), 1, 4);
    const bts = top === 'polo' ? [1.43, 1.39] : [1.42, 1.34, 1.26, 1.18, 1.1, 1.03];
    if (Q.detail > 1) for (const y of bts) T.button(mb, y, Math.PI / 2, topSpec.off + 0.003, 0.0055, M('#e8e4dc', 'flat', 0.3));
    if (top === 'shirt' || top === 'police_shirt') {
      for (const s of top === 'police_shirt' ? [1, -1] : [1]) {
        T.patch(mb, Math.PI / 2 - s * 0.32, Math.PI / 2 - s * 0.72, 1.27, 1.36, topSpec.off + 0.003, darker, 2, 2); // göğüs cebi
        if (top === 'police_shirt') T.patch(mb, Math.PI / 2 - s * 0.3, Math.PI / 2 - s * 0.74, 1.345, 1.37, topSpec.off + 0.005, darker, 2, 1); // kapak
      }
    }
  }
  if (top === 'track' || top === 'leather' || top === 'hoodie') {
    // fermuar
    const zx = top === 'leather' ? Math.PI / 2 - 0.12 : Math.PI / 2;
    if (top !== 'hoodie') T.patch(mb, zx - 0.022, zx + 0.022, hemY, 1.47, topSpec.off + 0.003, M('#9a9a9a', 'flat', 0.3, 0.9), 1, 6);
    if (top !== 'hoodie') T.patch(mb, Math.PI / 2 + 0.2, Math.PI * 2.5 - 0.2, 1.46, top === 'leather' ? 1.52 : 1.53, top === 'leather' ? 0.026 : 0.018, top === 'leather' ? topM : M(tc, 'rib', 0.7), 16, 1);
    if (top === 'leather') {
      for (const s of [1, -1]) T.patch(mb, Math.PI / 2 + s * 0.25, Math.PI / 2 + s * 0.85, 1.4, 1.47, 0.03, darker, 3, 2); // geniş yaka
      for (const s of [1, -1]) T.patch(mb, Math.PI / 2 + s * 0.95, Math.PI / 2 + s * 0.99, 1.0, 1.42, topSpec.off + 0.002, seamM, 1, 4); // panel dikişi
      for (const s of [1, -1]) T.patch(mb, Math.PI / 2 + s * 0.4, Math.PI / 2 + s * 0.85, 1.05, 1.07, topSpec.off + 0.003, M('#888888', 'flat', 0.3, 0.9), 2, 1); // cep fermuarı
    }
    if (top === 'track') for (const s of [1, -1]) T.patch(mb, s * 0.03, s * 0.08, hemY + 0.04, 1.42, topSpec.off + 0.002, M('#f0f0f0', 'poly', 0.5), 1, 5);
  }
  if (top === 'hoodie') {
    // kanguru cebi, kapüşon rulosu, ipler
    T.patch(mb, Math.PI / 2 - 0.62, Math.PI / 2 + 0.62, 1.0, 1.14, topSpec.off + 0.004, darker, 6, 2);
    const hp = [];
    for (let i = 0; i <= 12; i++) { const a = -Math.PI * 0.08 + (i / 12) * Math.PI * 1.16; hp.push(V(Math.cos(a + Math.PI) * 0.1 * (1 + 0.1 * Math.sin(a)), 1.47 + 0.02 * Math.sin(a), -Math.sin(a) * 0.1 - 0.025)); }
    tube(mb, hp, (u) => 0.022 + 0.022 * Math.sin(Math.PI * u), 8, topM, (p) => tw(0, p));
    for (const s of [1, -1]) tube(mb, [V(s * 0.03, 1.465, 0.085), V(s * 0.033, 1.4, 0.112), V(s * 0.035, 1.33, 0.118)], 0.0035, 4, M('#eeeeee', 'flat', 0.7), (p) => tw(0, p));
  }
  if (top === 'denim') {
    T.patch(mb, Math.PI / 2 - 0.05, Math.PI / 2 + 0.05, hemY, 1.36, topSpec.off + 0.002, darker, 1, 4);
    if (Q.detail > 1) for (const y of [1.33, 1.24, 1.15, 1.06, 0.98]) T.button(mb, y, Math.PI / 2, topSpec.off + 0.004, 0.006, M('#b08a4a', 'flat', 0.3, 0.9));
    for (const s of [1, -1]) {
      T.patch(mb, Math.PI / 2 - s * 0.28, Math.PI / 2 - s * 0.72, 1.24, 1.33, topSpec.off + 0.003, darker, 2, 2);
      T.patch(mb, Math.PI / 2 - s * 0.26, Math.PI / 2 - s * 0.74, 1.31, 1.345, topSpec.off + 0.006, seamM, 2, 1);
      T.patch(mb, Math.PI / 2 + s * 0.2, Math.PI / 2 + s * 0.8, 1.44, 1.5, 0.028, topM, 3, 1);
    }
  }
  if (top === 'police') {
    T.patch(mb, Math.PI / 2 - 0.02, Math.PI / 2 + 0.02, hemY, 1.47, topSpec.off + 0.003, M('#8a8a8a', 'flat', 0.3, 0.9), 1, 5);
    T.patch(mb, Math.PI / 2 + 0.2, Math.PI * 2.5 - 0.2, 1.46, 1.52, 0.02, topM, 16, 1);
  }
  if (top === 'police' || top === 'police_shirt' || top === 'police_vest') {
    // rozet, isimlik, omuz apoletleri
    T.patch(mb, Math.PI / 2 - 0.38, Math.PI / 2 - 0.6, 1.33, 1.38, topSpec.off + 0.006, M('#d4af37', 'flat', 0.3, 0.9), 2, 2);
    T.patch(mb, Math.PI / 2 + 0.38, Math.PI / 2 + 0.68, 1.33, 1.35, topSpec.off + 0.005, M('#e8e8e8', 'flat', 0.5), 2, 1);
    if (top === 'police_vest') {
      // hi-vis yelek: floresan + gümüş bantlar
      const hv = M('#c8e020', 'poly', 0.6);
      T.patch(mb, -Math.PI / 2, Math.PI * 1.5, 0.98, 1.43, 0.016, (u, v) => (v > 0.3 && v < 0.38 ? M('#d8d8d8', 'flat', 0.25, 0.6) : hv), 22, 10);
    } else T.patch(mb, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5, 1.28, 1.34, topSpec.off + 0.004, M('#e8e8e8', 'flat', 0.5), 4, 1); // sırt POLİS bandı
  }
  if (top === 'vest') {
    // balıkçı yeleği: kapitone, cepli
    const vm = M(L.vestColor || shade(tc, 1), 'felt', 0.9);
    T.patch(mb, Math.PI / 2 + 0.12, Math.PI * 2.5 - 0.12, 0.93, 1.44, 0.02, (u, v) => (Math.floor(v * 9) % 3 === 0 ? M(L.vestColor || tc, 'felt', 0.9, 0, 0.85) : vm), 24, 9, { bumpK: 0.5 });
    for (const s of [1, -1]) T.patch(mb, Math.PI / 2 + s * 0.3, Math.PI / 2 + s * 0.8, 1.0, 1.1, 0.024, M(L.vestColor || tc, 'felt', 0.9, 0, 0.8), 2, 2);
  }
  if (top === 'suit' || top === 'blazer' || top === 'tuxedo' || top === 'coat') {
    const lapM = top === 'tuxedo' ? M(shade(tc, 0.9), 'flat', 0.25, 0.1) : M(tc, topSpec.tile, topSpec.rough, 0, 0.88);
    const o0 = topSpec.open;
    for (const s of [1, -1]) {
      // yaka devriği: açık kenar boyunca, çentikli
      T.patch(mb, (t) => Math.PI / 2 + s * (openHalf(t) - 0.005), (t) => Math.PI / 2 + s * (openHalf(t) + 0.06 + 0.26 * smooth(o0, 1.38, t) * (t > 1.39 ? 0.35 : 1)), o0 + 0.01, 1.45, topSpec.off + 0.005, lapM, 2, 6);
      // yan cep kapakları
      if (top !== 'coat') T.patch(mb, Math.PI / 2 + s * 0.55, Math.PI / 2 + s * 1.0, 0.92, 0.945, topSpec.off + 0.004, darker, 2, 1);
    }
    // ense yakası
    T.patch(mb, Math.PI / 2 + 0.45, Math.PI * 2.5 - 0.45, 1.445, 1.5, 0.022, lapM, 12, 1);
    // gömlek yakası (V içinde)
    T.patch(mb, Math.PI / 2 + 0.12, Math.PI * 2.5 - 0.12, 1.47, 1.515, 0.011, underM, 16, 1);
    // göğüs cebi + mendil
    T.patch(mb, Math.PI / 2 - 0.42, Math.PI / 2 - 0.72, 1.32, 1.335, topSpec.off + 0.004, darker, 2, 1);
    if (top !== 'coat') T.patch(mb, Math.PI / 2 - 0.46, Math.PI / 2 - 0.64, 1.335, 1.355, topSpec.off + 0.004, M('#f2f2f2', 'weave', 0.6), 2, 1);
    // düğmeler
    const by = top === 'coat' ? [1.12, 1.0, 0.88] : [1.08, 0.98];
    if (Q.detail > 1) for (const y of by) { T.button(mb, y, Math.PI / 2 + 0.06, topSpec.off + 0.004, 0.0085, M('#111111', 'flat', 0.35)); if (top === 'coat') T.button(mb, y, Math.PI / 2 - 0.3, topSpec.off + 0.004, 0.0085, M('#111111', 'flat', 0.35)); }
    // kravat / papyon
    if (top === 'tuxedo') {
      T.patch(mb, Math.PI / 2 - 0.2, Math.PI / 2 + 0.2, 1.44, 1.465, 0.016, M('#0a0a0a', 'flat', 0.3), 3, 1);
    } else if (top === 'suit' || L.tie) {
      const tieM = M(L.tieColor || '#7a0f14', 'weave', 0.45);
      T.patch(mb, (t) => Math.PI / 2 - 0.035 - (1.44 - t) * 0.12, (t) => Math.PI / 2 + 0.035 + (1.44 - t) * 0.12, o0 - 0.02, 1.44, 0.009, tieM, 1, 6);
      T.patch(mb, Math.PI / 2 - 0.05, Math.PI / 2 + 0.05, 1.44, 1.47, 0.014, tieM, 1, 1);
    }
  }
  // gömlek arkası / omuz dikişi (yüksek ayrıntı)
  if (Q.detail > 1 && topSpec.off < 0.012 && top !== 'police_vest') for (const s of [1, -1]) T.patch(mb, s > 0 ? -0.15 : Math.PI + 0.15, s > 0 ? 0.15 : Math.PI - 0.15, 1.43, 1.436, topSpec.off + 0.0015, seamM, 2, 1);
  // pantolon detayları (görünür olduğu yerde)
  if (!skirtP && hemY >= 0.94) {
    const pd = M(pc, pantsTile, 0.85, 0, 0.8);
    if (pants === 'jeans' || pants === 'cargo') {
      for (const s of [1, -1]) {
        T.patch(mb, -Math.PI / 2 + s * 0.15, -Math.PI / 2 + s * 0.68, 0.875, 0.965, pantsOff + 0.003, pd, 3, 3); // arka cep
        T.patch(mb, (t) => Math.PI / 2 + s * (0.42 + (0.995 - t) * 3), (t) => Math.PI / 2 + s * (0.44 + (0.995 - t) * 3), 0.93, 0.995, pantsOff + 0.002, M('#c8a050', 'flat', 0.7), 1, 3); // ön cep dikişi
      }
      T.patch(mb, Math.PI / 2 + 0.03, Math.PI / 2 + 0.07, 0.86, 0.995, pantsOff + 0.002, pd, 1, 3); // fermuar patı
      if (Q.detail > 1) T.button(mb, 1.012, Math.PI / 2, pantsOff + 0.008, 0.007, M('#b09060', 'flat', 0.3, 0.9));
    }
  }
  if (hemY >= waist && !skirtP && pants !== 'track' && pants !== 'shorts') T.patch(mb, Math.PI / 2 - 0.08, Math.PI / 2 + 0.08, waist + 0.002, waist + 0.026, pantsOff + 0.008, M('#c0c0c0', 'flat', 0.25, 0.95), 1, 1); // toka
  }
  // uzun palto / pardösü etekleri: ayrı açık yüzey, bacakları izler
  if (topSpec.long) {
    const yb = topSpec.long;
    const ck = [];
    for (const [y, rx, rf, rb] of [[0.99, 0.172, 0.105, 0.112], [0.9, 0.19, 0.112, 0.128], [0.75, 0.2, 0.125, 0.14], [0.6, 0.215, 0.14, 0.15], [0.45, 0.23, 0.15, 0.16], [0.3, 0.24, 0.16, 0.17]]) {
      if (y < yb - 0.16) break;
      ck.push([y, 0, y, 0, rx * (0.75 + 0.25 * R.bk) + R.fat * 0.02 + 0.014, rf * (0.75 + 0.25 * R.bk) + R.fat * 0.04 + 0.012, rb * (0.75 + 0.25 * R.bk) + 0.012, 2.2]);
    }
    ck.reverse();
    const S = new Limb(ck, V(1, 0, 0), V(0, 0, 1), V(0, 1, 0), skirtW(R, 0.95, 0.75));
    // ön açıklık + arka yırtmaç
    const gap = top === 'pardesu' ? 0.04 : 0.1;
    for (const s of [1, -1]) {
      const a0 = Math.PI / 2 + s * gap, a1 = s > 0 ? Math.PI * 1.5 - 0.012 : -Math.PI / 2 + 0.012;
      const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
      S.emit(mb, [{ t0: yb, t1: 0.99, off: 0, mat: topM }], Math.max(4, Math.round(Q.torso * 0.55)), Q.dtT * 1.5, { th0: lo, arc: hi - lo, double: true, innerMat: M(shade(tc, 0.5), 'weave', 0.7) });
    }
    if (Q.detail > 1 && top === 'coat') T.patch(mb, -Math.PI / 2 - 0.9, -Math.PI / 2 + 0.9, 1.0, 1.04, topSpec.off + 0.004, darker, 6, 1); // bel kemeri arkası
  }
  if (pants === 'skirt' || pants === 'longskirt') {
    const yb = pants === 'skirt' ? 0.55 : 0.22;
    const ck = [[1.0, 0, 1.0, 0, 0.162, 0.088, 0.1, 2.2], [0.9, 0, 0.9, 0, 0.185, 0.1, 0.12, 2.2], [0.75, 0, 0.75, 0, 0.195, 0.115, 0.13, 2.2], [0.55, 0, 0.55, 0, 0.205, 0.13, 0.14, 2.2], [0.35, 0, 0.35, 0, 0.215, 0.145, 0.15, 2.2], [0.2, 0, 0.2, 0, 0.225, 0.15, 0.155, 2.2]]
      .filter((k) => k[0] >= yb - 0.21).map((k) => { k[4] *= 0.8 + 0.2 * R.bk; k[5] *= 0.8 + 0.2 * R.bk; k[6] *= 0.8 + 0.2 * R.bk; return k; }).reverse();
    const S = new Limb(ck, V(1, 0, 0), V(0, 0, 1), V(0, 1, 0), skirtW(R, 0.96, 0.85));
    S.emit(mb, [{ t0: yb, t1: 1.0, off: 0, mat: M(pc, pantsTile, 0.85) }], Math.max(6, Q.torso - 4), Q.dtT * 1.4, { double: true, innerMat: M(shade(pc, 0.5), 'weave', 0.8) });
  }
  // önlük (seyyar satıcı / esnaf)
  if (L.apron) {
    const am = M(L.apronColor || '#e8e4d8', 'canvas', 0.9);
    T.patch(mb, Math.PI / 2 - 0.62, Math.PI / 2 + 0.62, 0.95, 1.36, 0.024, am, 6, 6, { bumpK: 0.3 });
    const ak = [[0.55, 0, 0.55, 0, 0.18, 0.15, 0.08, 2], [0.75, 0, 0.75, 0, 0.18, 0.135, 0.08, 2], [0.96, 0, 0.96, 0, 0.17, 0.11, 0.08, 2]];
    const A = new Limb(ak, V(1, 0, 0), V(0, 0, 1), V(0, 1, 0), skirtW(R, 0.95, 0.6));
    A.emit(mb, [{ t0: 0.58, t1: 0.96, off: 0, mat: am }], 6, 0.08, { th0: Math.PI / 2 - 0.62, arc: 1.24, double: true });
    for (const s of [1, -1]) tube(mb, [V(s * 0.06, 1.36, 0.11), V(s * 0.05, 1.46, 0.07), V(0, 1.5, -0.05)], 0.006, 4, am, (p) => tw(0, p));
  }
}

// ---------------- kollar + eller ----------------
function buildArms(c) {
  const { L, R, Q, mb, f } = c;
  const top = c.top, ts = c.topSpec;
  const k = (f ? 0.84 : 1) * (0.6 + 0.4 * R.bk);
  const rows = [[0, 0.008, 0.008, 0.008], [0.02, 0.024, 0.028, 0.026], [0.045, 0.04, 0.044, 0.042], [0.075, 0.048, 0.05, 0.047], [0.13, 0.05, 0.049, 0.047], [0.2, 0.046, 0.047, 0.044], [0.27, 0.04, 0.042, 0.04],
    [0.33, 0.037, 0.038, 0.038], [0.355, 0.036, 0.035, 0.039], [0.39, 0.039, 0.038, 0.036], [0.44, 0.038, 0.036, 0.034], [0.52, 0.03, 0.03, 0.028], [0.585, 0.022, 0.027, 0.027], [0.615, 0.019, 0.026, 0.026], [0.625, 0.015, 0.02, 0.02], [0.632, 0.004, 0.004, 0.004]];
  const shortS = top === 'tshirt' || top === 'polo' || top === 'police_shirt' || top === 'vest' && false;
  const sleeveEnd = shortS ? 0.2 : top === 'vest' || top === 'police_vest' ? 0.6 : 0.585;
  const sleeveOff = (th, t) => ts.off + (shortS ? 0.003 + 0.003 * smooth(0.1, 0.2, t) : 0.004) + (top === 'coat' || top === 'suit' || top === 'blazer' ? 0.008 * smooth(0.1, 0.0, t) : 0);
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R', sh = P(c, 'sh' + S);
    const top0 = sh[1] + 0.05;
    const keys = rows.map(([t, rx, rf, rb]) => [t, sh[0] - s * 0.004 * smooth(0.0, 0.1, t), top0 - t, 0.0, rx * k, rf * k, rb * k, 2]);
    const st = [[0, { [BI.chest]: 0.45, [BI['sh' + S]]: 0.55 }], [0.07, W(BI['sh' + S])], [0.32, W(BI['sh' + S])], [0.39, W(BI['el' + S])], [0.585, W(BI['el' + S])], [0.62, W(BI['wr' + S])]];
    const wfn = (t) => chainW(t, st);
    const A = new Limb(keys, V(s, 0, 0), V(0, 0, 1), V(0, -1, 0), wfn, { bump: (t, th) => 0.005 * R.bk * gauss(t - 0.17, 0.06) * gauss(angD(th, Math.PI / 2), 0.7) + 0.004 * gauss(t - 0.42, 0.06) * gauss(angD(th, 0.3), 0.8) });
    const bands = [];
    // vest/police_vest: kollar gömlek kolları (shirtColor) — yelekte iç gömlek uzun kollu
    const sleeveM = top === 'vest' || top === 'police_vest' ? M(L.shirtColor || '#a8c0e0', 'weave', 0.8) : c.topM;
    if (top === 'vest' || top === 'police_vest') {
      if (top === 'police_vest') { bands.push({ t0: 0, t1: 0.2, off: 0.012, mat: sleeveM }); bands.push({ t0: 0.2, t1: 0.632, off: 0, mat: c.skinM }); }
      else { bands.push({ t0: 0, t1: 0.585, off: 0.006, mat: sleeveM }); bands.push({ t0: 0.585, t1: 0.632, off: 0, mat: c.skinM }); }
    } else {
      bands.push({ t0: 0, t1: sleeveEnd, off: sleeveOff, mat: sleeveM, bumpK: ts.off > 0.012 ? 0.4 : 1 });
      if (!shortS) {
        if (ts.rib && Q.detail) bands.push({ t0: sleeveEnd, t1: sleeveEnd + 0.03, off: ts.off + 0.003, mat: M(L.topColor || '#333', 'rib', 0.9, 0, 0.9) });
        else if (ts.open || top === 'leather' || top === 'denim' || top === 'coat' || top === 'pardesu') bands.push({ t0: sleeveEnd, t1: sleeveEnd + 0.018, off: 0.006, mat: M(L.shirtColor || '#e8e8e8', 'weave', 0.75) });
        else if (top === 'shirt') bands.push({ t0: sleeveEnd - 0.035, t1: sleeveEnd, off: ts.off + 0.003, mat: c.topM });
      }
      bands.push({ t0: bands[bands.length - 1].t1, t1: 0.632, off: 0, mat: c.skinM });
    }
    A.emit(mb, bands, Q.limb, Q.dtL, { th0: Math.PI });
    if (Q.detail && top === 'track') A.patch(mb, -0.12, -0.02, 0.03, sleeveEnd, ts.off + 0.006, M('#f0f0f0', 'poly', 0.5), 1, 6);
    if (Q.detail && top === 'track') A.patch(mb, 0.02, 0.12, 0.03, sleeveEnd, ts.off + 0.006, M('#f0f0f0', 'poly', 0.5), 1, 6);
    if (Q.detail && (top === 'police' || top === 'police_shirt' || top === 'police_vest')) {
      A.patch(mb, -0.5, 0.5, 0.06, 0.11, ts.off + 0.01, M('#1a2a55', 'canvas', 0.8), 3, 1); // kol arması
      A.patch(mb, -0.45, 0.45, 0.065, 0.1, ts.off + 0.012, M('#d4af37', 'flat', 0.4, 0.6), 3, 1);
      A.patch(mb, -0.25, 0.25, 0.0, 0.05, ts.off + 0.02, M('#0e1a33', 'canvas', 0.8), 2, 1); // apolet
    }
    // saat (sol bilek)
    if (L.watch && s > 0 && Q.detail) {
      const wc = L.watchColor || (L.watch === 'goldwatch' ? '#d4af37' : L.watch === 'digital' ? '#1a1a1a' : '#cfd2d6');
      A.patch(mb, Math.PI, Math.PI * 3, 0.588, 0.6, 0.006, M(wc, 'flat', 0.25, L.watch === 'digital' ? 0 : 0.95), 12, 1);
      if (Q.detail > 1) A.button(mb, 0.594, 0, 0.009, 0.012, M('#202428', 'flat', 0.1, 0.3), 10);
    }
    buildHand(c, s, S, A);
  }
}
function P(c, n) { return c.P[n]; }

function buildHand(c, s, S, arm) {
  const { L, R, Q, mb, f } = c;
  const hk = R.hk, wr = P(c, 'wr' + S), x = wr[0], y0 = wr[1] + 0.012;
  const skin = c.skinM, wB = BI['wr' + S], fB = BI['fi' + S], dB = BI['fd' + S], tB = BI['th' + S];
  // avuç: kalınlık U1 (dış = el sırtı), genişlik U2 (önde başparmak tarafı)
  const mitten = !Q.fingers;
  const prow = mitten
    ? [[0, 0.019, 0.026, 0.026], [0.03, 0.016, 0.036, 0.036], [0.06, 0.015, 0.042, 0.04], [0.095, 0.013, 0.04, 0.039], [0.13, 0.011, 0.038, 0.036], [0.16, 0.009, 0.032, 0.03], [0.18, 0.006, 0.022, 0.02], [0.188, 0.002, 0.006, 0.006]]
    : [[0, 0.019, 0.026, 0.026], [0.03, 0.016, 0.036, 0.036], [0.06, 0.015, 0.042, 0.04], [0.088, 0.013, 0.041, 0.04], [0.1, 0.009, 0.034, 0.034], [0.106, 0.003, 0.01, 0.01]];
  const keys = prow.map(([t, a, b2, c2]) => [t * hk, x - s * 0.002, y0 - t * hk, 0.002, a * hk, b2 * hk, c2 * hk, 2.4]);
  const fiT = (y0 - P(c, 'fi' + S)[1]), fdT = (y0 - P(c, 'fd' + S)[1]);
  const pst = [[0, W(wB)], [fiT - 0.012, W(wB)], [fiT + 0.008, W(fB)], [fdT - 0.006, W(fB)], [fdT + 0.01, W(dB)]];
  const palm = new Limb(keys, V(s, 0, 0), V(0, 0, 1), V(0, -1, 0), (t) => chainW(t, pst));
  palm.emit(mb, [{ t0: 0, t1: keys[keys.length - 1][0], off: 0, mat: skin }], Q.fingers ? 12 : Math.max(5, Q.limb - 2), Q.dtL * 0.6, { th0: Math.PI });
  if (!mitten) {
    const fz = [0.027, 0.009, -0.009, -0.026], fl = [0.075, 0.083, 0.078, 0.062];
    for (let i = 0; i < 4; i++) {
      const len = fl[i] * hk, r0 = 0.0088 * hk * (i === 3 ? 0.88 : 1);
      const yk = y0 - 0.082 * hk;
      const fk = [[-0.012, r0, r0, r0], [0.0, r0, r0, r0], [len * 0.45, r0 * 0.93, r0 * 0.93, r0 * 0.93], [len * 0.85, r0 * 0.78, r0 * 0.78, r0 * 0.75], [len, r0 * 0.3, r0 * 0.3, r0 * 0.3]]
        .map(([t, a, b2, c2]) => [t, x - s * 0.001, yk - t, fz[i] * hk, a * 1.05, b2, c2, 2]);
      const kT = (y0 - P(c, 'fi' + S)[1]) - (y0 - yk), dT = (y0 - P(c, 'fd' + S)[1]) - (y0 - yk);
      const st = [[kT - 0.01, W(wB)], [kT + 0.006, W(fB)], [dT - 0.004, W(fB)], [dT + 0.006, W(dB)]];
      const F = new Limb(fk, V(s, 0, 0), V(0, 0, 1), V(0, -1, 0), (t) => chainW(t, st));
      F.emit(mb, [{ t0: -0.012, t1: len, off: 0, mat: skin }], Q.fseg, len / 4, { th0: Math.PI });
      if (L.ring && s < 0 && i === 2) F.patch(mb, Math.PI, Math.PI * 3, 0.006, 0.014, 0.0022, M(L.ringColor || '#d4af37', 'flat', 0.2, 0.95), 8, 1);
    }
  }
  // başparmak: avuç tabanından aşağı-öne
  {
    const A = V(-s * 0.3, -0.72, 0.62).normalize();
    const U1 = V(s, 0, 0).addScaledVector(A, -A.x * s).normalize();
    const U2 = new THREE.Vector3().crossVectors(A, U1).normalize();
    if (s < 0) U2.negate();
    const b0 = V(x - s * 0.006, y0 - 0.03 * hk, 0.02 * hk);
    const len = 0.062 * hk, r0 = 0.011 * hk;
    const tk = [[-0.01, r0 * 1.1, r0 * 1.2, r0 * 1.2], [0.0, r0 * 1.15, r0 * 1.2, r0 * 1.2], [len * 0.45, r0 * 0.95, r0 * 0.95, r0 * 0.95], [len * 0.85, r0 * 0.8, r0 * 0.8, r0 * 0.8], [len, r0 * 0.3, r0 * 0.3, r0 * 0.3]]
      .map(([t, a, b2, c2]) => [t, b0.x + A.x * t, b0.y + A.y * t, b0.z + A.z * t, a, b2, c2, 2]);
    const st = [[-0.005, W(wB)], [0.012, W(tB)]];
    const Th = new Limb(tk, U1, U2, A, (t) => chainW(t, st));
    Th.emit(mb, [{ t0: -0.01, t1: len, off: 0, mat: skin }], Q.fseg, len / (mitten ? 2 : 4), { th0: Math.PI });
  }
  // tespih (sol el)
  if (L.tespih && s > 0 && Q.detail) {
    const tc = L.tespihColor || '#7a2a10', pts = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; pts.push(V(x - s * 0.012 + Math.cos(a) * 0.006, y0 - 0.075 - 0.05 + Math.cos(a) * 0.05, 0.005 + Math.sin(a) * 0.022)); }
    tube(mb, pts, 0.0055, 5, M(tc, 'flat', 0.15, 0.1), () => W(BI['fi' + S]), true, (u) => 0.85 + 0.3 * Math.abs(Math.sin(u * 50)));
  }
  // evrak çantası (sağ el, NPC)
  if (L.carry === 'briefcase' && s < 0 && Q.detail) {
    const bc = M(L.bagColor || '#3a2412', 'leather', 0.4, 0.05);
    boxP(mb, V(x + 0.01, y0 - 0.29, 0.0), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.045, 0.14, 0.2, bc, W(BI['fi' + S]));
    tube(mb, [V(x + 0.01, y0 - 0.15, -0.05), V(x + 0.01, y0 - 0.115, -0.03), V(x + 0.01, y0 - 0.115, 0.03), V(x + 0.01, y0 - 0.15, 0.05)], 0.006, 4, M('#1a1008', 'leather', 0.4), () => W(BI['fi' + S]));
  }
}

// ---------------- bacaklar ----------------
function buildLegs(c) {
  const { L, R, Q, mb, f } = c;
  const pants = c.pants, pc = L.pantsColor || '#2a3550';
  const k = (f ? 0.95 : 1) * (0.68 + 0.32 * R.bk);
  const rows = [[0, 0.02, 0.02, 0.02], [0.02, 0.06, 0.07, 0.07], [0.06, 0.08, 0.085, 0.09], [0.12, 0.085, 0.088, 0.09], [0.25, 0.074, 0.078, 0.074], [0.37, 0.062, 0.064, 0.06], [0.45, 0.053, 0.056, 0.05],
    [0.5, 0.05, 0.054, 0.048], [0.55, 0.05, 0.05, 0.056], [0.62, 0.048, 0.046, 0.06], [0.7, 0.042, 0.04, 0.05], [0.8, 0.034, 0.034, 0.036], [0.87, 0.03, 0.032, 0.03], [0.91, 0.028, 0.03, 0.03], [0.93, 0.02, 0.02, 0.02], [0.94, 0.005, 0.005, 0.005]];
  const pOff = { jeans: 0.008, cargo: 0.012, slacks: 0.012, chino: 0.01, track: 0.013, shorts: 0.014, skirt: 0, longskirt: 0 }[pants];
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R', hp = P(c, 'hip' + S);
    const keys = rows.map(([t, rx, rf, rb]) => {
      const thighK = t < 0.4 ? 1 + 0.08 * R.fat + (f ? 0.05 : 0) : 1;
      return [t, hp[0] - s * 0.006 * smooth(0.2, 0.5, t), 0.99 - t, 0.004 * smooth(0.6, 0.45, t), rx * k * thighK, rf * k * thighK, rb * k * (t > 0.5 && f ? 0.95 : 1) * thighK, 2];
    });
    const st = [[0, { [BI.hips]: 0.6, [BI['hip' + S]]: 0.4 }], [0.11, W(BI['hip' + S])], [0.46, W(BI['hip' + S])], [0.54, W(BI['kn' + S])], [0.86, W(BI['kn' + S])], [0.915, W(BI['an' + S])]];
    const Lg = new Limb(keys, V(s, 0, 0), V(0, 0, 1), V(0, -1, 0), (t) => chainW(t, st), { bump: (t, th) => 0.006 * gauss(t - 0.5, 0.03) * gauss(angD(th, Math.PI / 2), 0.6) });
    const bands = [];
    const pm = c.pantsM;
    if (pants === 'shorts') { bands.push({ t0: 0, t1: 0.37, off: (th, t) => pOff * smooth(0.0, 0.2, t) + 0.006, mat: pm }); bands.push({ t0: 0.37, t1: 0.94, off: 0, mat: c.skinM }); }
    else if (pants === 'skirt' || pants === 'longskirt') {
      const legM = L.tights ? M(L.tights, 'rib', 0.6) : c.skinM;
      bands.push({ t0: 0, t1: 0.94, off: L.tights ? 0.002 : 0, mat: legM });
    } else {
      const loose = pants === 'slacks' || pants === 'cargo' || pants === 'track';
      const off = (th, t) => pOff * (0.5 + 0.5 * smooth(0.0, 0.15, t)) + (loose ? 0.012 * smooth(0.4, 0.8, t) : 0.004 * smooth(0.5, 0.85, t));
      const cuffT = pants === 'track' ? 0.85 : 0.84;
      bands.push({ t0: 0, t1: cuffT, off, mat: pm, bumpK: loose ? 0.4 : 0.8 });
      if (pants === 'track') bands.push({ t0: cuffT, t1: 0.88, off: 0.009, mat: M(pc, 'rib', 0.8) });
      else bands.push({ t0: cuffT, t1: 0.885, off: pOff + (loose ? 0.02 : 0.012), mat: pm });
      bands.push({ t0: bands[bands.length - 1].t1, t1: 0.94, off: 0, mat: c.skinM });
    }
    Lg.emit(mb, bands, Q.limb, Q.dtL, { th0: Math.PI });
    if (Q.detail && pants !== 'skirt' && pants !== 'longskirt') {
      const sd = pants === 'track' ? M('#f2f2f2', 'poly', 0.5) : M(pc, c.pantsM === pm ? (pants === 'jeans' ? 'denim' : 'wool') : 'wool', 0.85, 0, pants === 'jeans' ? 1.25 : 0.8);
      const tEnd = pants === 'shorts' ? 0.35 : 0.84;
      if (pants === 'track') { Lg.patch(mb, -0.14, -0.05, 0.02, tEnd, pOff + 0.016, sd, 1, 6); Lg.patch(mb, 0.05, 0.14, 0.02, tEnd, pOff + 0.016, sd, 1, 6); }
      else Lg.patch(mb, -0.03, 0.03, 0.02, tEnd, (th, t) => pOff + 0.0035 + (pants === 'slacks' || pants === 'cargo' ? 0.012 * smooth(0.4, 0.8, t) : 0.004 * smooth(0.5, 0.85, t)), sd, 1, 6, { bumpK: 0.5 });
      if (pants === 'slacks') Lg.patch(mb, Math.PI / 2 - 0.02, Math.PI / 2 + 0.02, 0.06, 0.84, (th, t) => pOff + 0.0035 + 0.012 * smooth(0.4, 0.8, t), M(pc, 'wool', 0.8, 0, 1.15), 1, 6, { bumpK: 0.4 });
      if (pants === 'cargo') Lg.patch(mb, -0.25, 0.55, 0.26, 0.38, pOff + 0.006, M(pc, 'canvas', 0.85, 0, 0.85), 3, 2, { bumpK: 0.4 });
    }
  }
}

// ---------------- ayakkabılar ----------------
function buildFeet(c) {
  const { L, R, Q, mb, f } = c;
  const kind = c.shoes, col = L.shoesColor || '#222222';
  const k = f ? 0.9 : 1;
  const dress = kind === 'polished' || kind === 'loafer';
  const rows = dress
    ? [[-0.072, 0.01, 0.01, 0.01], [-0.062, 0.033, 0.048, 0.04], [-0.035, 0.04, 0.062, 0.043], [0.0, 0.042, 0.06, 0.043], [0.05, 0.044, 0.042, 0.043], [0.1, 0.043, 0.03, 0.043], [0.15, 0.037, 0.024, 0.04], [0.19, 0.024, 0.018, 0.032], [0.21, 0.008, 0.008, 0.01]]
    : [[-0.075, 0.01, 0.01, 0.01], [-0.066, 0.035, 0.045, 0.04], [-0.04, 0.042, 0.062, 0.045], [0.0, 0.044, 0.066, 0.045], [0.04, 0.047, 0.052, 0.045], [0.09, 0.049, 0.04, 0.045], [0.14, 0.046, 0.032, 0.045], [0.18, 0.037, 0.026, 0.04], [0.2, 0.02, 0.016, 0.025], [0.206, 0.005, 0.005, 0.005]];
  const sneaker = kind === 'sneaker' || kind === 'hightop';
  const upM = sneaker ? M(col, 'canvas', 0.8) : kind === 'loafer' ? M(col, 'felt', 0.85) : M(col, 'leather', dress ? 0.22 : 0.45, dress ? 0.1 : 0.05);
  const soleCol = sneaker ? (new THREE.Color(col).getHSL({}).l > 0.6 ? '#d8d4cc' : '#f2f0ea') : '#1a1410';
  const soleM = M(soleCol, 'rubber', 0.85);
  const soleH = sneaker ? 0.026 : kind === 'boots' || kind === 'wellies' ? 0.028 : 0.014;
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R', an = P(c, 'an' + S);
    const x = an[0];
    const keys = rows.map(([z, rx, ru, rd]) => [z * k, x, 0.045, z * k, rx * k, ru, rd, 2.6]);
    const st = [[0.05, W(BI['an' + S])], [0.12, W(BI['toe' + S])]];
    const F = new Limb(keys, V(s, 0, 0), V(0, 1, 0), V(0, 0, 1), (t) => chainW(t, st), { floor: soleH * 0.6 });
    F.emit(mb, [{ t0: keys[0][0], t1: keys[keys.length - 1][0], off: 0, mat: upM }], Q.limb, Q.dtL * 0.8, { th0: -Math.PI / 2 });
    // taban
    const sk = rows.map(([z, rx]) => [z * k, x, soleH / 2, z * k, rx * k + 0.004, soleH / 2, soleH / 2, 4]);
    sk[0][4] = 0.012; sk[sk.length - 1][4] = 0.01;
    const So = new Limb(sk, V(s, 0, 0), V(0, 1, 0), V(0, 0, 1), (t) => chainW(t, st));
    So.emit(mb, [{ t0: sk[0][0] - 0.004, t1: sk[sk.length - 1][0] + 0.004, off: 0, mat: soleM }], Math.max(6, Q.limb - 4), Q.dtL, { th0: -Math.PI / 2 });
    if (!Q.detail) continue;
    if (sneaker) {
      // bağcıklar + yan şerit
      for (let i = 0; i < 4; i++) F.patch(mb, Math.PI / 2 - 0.5, Math.PI / 2 + 0.5, (0.02 + i * 0.022) * k, (0.027 + i * 0.022) * k, 0.003, M('#f4f4f4', 'flat', 0.8), 2, 1);
      F.patch(mb, -0.05 * s + 0.0, 0.25, 0.0, 0.11 * k, 0.002, M(col, 'flat', 0.5, 0, new THREE.Color(col).getHSL({}).l > 0.6 ? 0.6 : 1.6), 2, 3);
    }
    if (kind === 'hightop' || kind === 'boots' || kind === 'wellies') {
      const top = kind === 'wellies' ? 0.36 : kind === 'boots' ? 0.2 : 0.14;
      const bk = [[0.05, x, 0.05, -0.008, 0.048, 0.052, 0.052, 2.4], [0.1, x, 0.1, -0.004, 0.044, 0.046, 0.048, 2.4], [top, x, top, 0.0, 0.043 + (kind === 'wellies' ? 0.012 : 0), 0.045 + (kind === 'wellies' ? 0.01 : 0), 0.045, 2.4]];
      const bst = [[0.09, W(BI['an' + S])], [0.14, W(BI['kn' + S])]];
      const B = new Limb(bk, V(s, 0, 0), V(0, 0, 1), V(0, 1, 0), (t) => chainW(t, bst));
      B.emit(mb, [{ t0: 0.05, t1: top, off: 0, mat: kind === 'wellies' ? M(col, 'flat', 0.3) : upM }], Q.limb, 0.04, { double: true });
    }
    if (dress) F.patch(mb, Math.PI / 2 - 0.25, Math.PI / 2 + 0.25, 0.1 * k, 0.11 * k, 0.0015, M(col, 'leather', 0.3, 0, 0.7), 2, 1);
  }
}

// ---------------- kafa: kafatası, kulak, gözler, kapaklar ----------------
function headW(c) { const B = W(BI.head); return () => B; }
function buildHead(c) {
  const { L, R, Q, mb, f } = c;
  const D = headDims(f), hb = P(c, 'head'), age = R.age;
  const [ws, hs] = Q.head;
  const faceM = { r: 1, g: 1, b: 1, tile: TILE.face, rough: 0.55, metal: 0, ts: 1 };
  const hw = W(BI.head), mw = mixW(W(BI.head), W(BI.neck), 0.25);
  const rows = [];
  for (let i = 0; i <= hs; i++) {
    const lat = -Math.PI / 2 + (Math.PI * i) / hs, row = [];
    for (let j = 0; j <= ws; j++) {
      const lon = -Math.PI + (TAU * j) / ws;
      const dx = Math.cos(lat) * Math.sin(lon), dy = Math.sin(lat), dz = Math.cos(lat) * Math.cos(lon);
      headPoint(f, dx, dy, dz, _p, age);
      const [u, v] = headUV(dx, dy, dz);
      row.push(mb.v(_p.x + hb[0], _p.y + hb[1], _p.z + hb[2], j === 0 ? 0 : j === ws ? 1 : u, v, faceM, dy < -0.7 ? mw : hw));
    }
    mb.seam.push([row[0], row[ws]]);
    rows.push(row);
  }
  for (let i = 0; i < hs; i++) for (let j = 0; j < ws; j++) { const a = rows[i][j], b = rows[i][j + 1], cc = rows[i + 1][j + 1], d = rows[i + 1][j]; mb.t(a, b, cc); mb.t(a, cc, d); }
  c.headBase = hb;
  // kulaklar: kepçe + iç çukur
  const skinM = c.skinM;
  for (const s of [-1, 1]) {
    const ec = V(hb[0] + s * (D.rx - 0.004), hb[1] + D.cy - 0.006, hb[2] + D.cz - 0.014);
    const rot = new THREE.Matrix4().makeRotationY(s * 0.42).premultiply(new THREE.Matrix4().makeRotationZ(-s * 0.1));
    const ehs = Q.detail > 1 ? 8 : 4, ews = Q.detail > 1 ? 10 : 6;
    const tmp = new MB();
    ellip(tmp, V(0, 0, 0), 0.011, 0.03 * (f ? 0.9 : 1), 0.02, ews, ehs, skinM, hw);
    const P2 = tmp.P;
    const base = mb.n;
    for (let i = 0; i < tmp.n; i++) {
      let px = P2[i * 3], py = P2[i * 3 + 1], pz = P2[i * 3 + 2];
      const out = px * s > 0.002;
      if (out) { const rr = Math.hypot(py / 0.03, pz / 0.02); px -= s * 0.008 * Math.max(0, 1 - rr * 1.25); } // kepçe çukuru
      _p.set(px, py, pz).applyMatrix4(rot).add(ec);
      mb.v(_p.x, _p.y, _p.z, 0.5, 0.5, skinM, hw, out && Math.hypot(py / 0.03, pz / 0.02) < 0.7 ? 0.82 : 1);
    }
    for (let i = 0; i < tmp.I.length; i++) mb.I.push(tmp.I[i] + base);
    for (const [a, b] of tmp.seam) mb.seam.push([a + base, b + base]);
  }
  if (!Q.eyes) return;
  // göz küreleri (yüz dokusunun köşesindeki iris), kapaklar, kirpikler
  const re = 0.0122;
  for (const s of [-1, 1]) {
    const ex = s * 0.031, ey = 0.012;
    const dx = ex / D.rx, dy = ey / D.ry, dz = Math.sqrt(Math.max(0.05, 1 - dx * dx - dy * dy));
    headPoint(f, dx, dy, dz, _p, age);
    const ecz = _p.z - re * 0.42;
    const E = V(hb[0] + ex, hb[1] + D.cy + ey, hb[2] + ecz);
    const eyeM = { r: 1, g: 1, b: 1, tile: TILE.face, rough: 0.12, metal: 0, ts: 1 };
    const es = Q.detail > 1 ? 14 : 8;
    // gözler hafif dışa bakar
    ellip(mb, E, re, re, re, es, Math.round(es * 0.75), eyeM, hw, (x, y, z) => {
      const k2 = z > 0 ? 1 : 1.2;
      return [EYE_UV.cx + x * EYE_UV.r * 0.98 * k2 + s * 0.0006, EYE_UV.cy + y * EYE_UV.r * 0.98 * k2];
    });
    // kapaklar: kürenin üst ve alt kabukları; açıklık badem biçimli
    const lidM = skinM, rl = re + 0.0011;
    const na = Q.detail > 1 ? 10 : 6, nl = Q.detail > 1 ? 4 : 2;
    for (const up of [1, -1]) {
      const rows2 = [];
      for (let i = 0; i <= nl; i++) {
        const row = [];
        for (let j = 0; j <= na; j++) {
          const az = -1.35 + (2.7 * j) / na;
          const edge = up > 0 ? 0.3 * Math.pow(Math.cos(az * 0.95), 1.5) - 0.04 : -0.34 * Math.pow(Math.cos(az * 0.95), 1.3) + 0.02;
          const end = up > 0 ? 1.25 : -1.1;
          const el = edge + (end - edge) * (i / nl);
          const x = Math.cos(el) * Math.sin(az) * rl, y = Math.sin(el) * rl, z = Math.cos(el) * Math.cos(az) * rl;
          const lash = i === 0 ? (up > 0 ? 0.35 : 0.75) : 1;
          row.push(mb.v(E.x + x, E.y + y, E.z + z, 0.5, 0.5, lidM, hw, lash));
        }
        rows2.push(row);
      }
      for (let i = 0; i < nl; i++) for (let j = 0; j < na; j++) {
        const a = rows2[i][j], b = rows2[i][j + 1], cc = rows2[i + 1][j + 1], d = rows2[i + 1][j];
        mb.t(a, b, cc); mb.t(a, cc, d); mb.t(a, cc, b); mb.t(a, d, cc);
      }
      // kirpik kartı (üst kapak kenarı)
      if (up > 0 && Q.detail > 1) {
        const pts = [], sides = [];
        for (let j = 0; j <= 6; j++) {
          const az = -1.1 + (2.2 * j) / 6, el = 0.3 * Math.pow(Math.cos(az * 0.95), 1.5) - 0.03;
          pts.push(V(E.x + Math.cos(el) * Math.sin(az) * (rl + 0.0004), E.y + Math.sin(el) * (rl + 0.0004), E.z + Math.cos(el) * Math.cos(az) * (rl + 0.0004)));
        }
        for (let j = 0; j <= 6; j++) { const a = pts[Math.max(0, j - 1)], b = pts[Math.min(6, j + 1)]; sides.push(b.clone().sub(a).normalize()); }
        // kirpikler kenara dik, yukarı-öne: tek sıra kart "satırlarını" kenar boyunca yay
        const lm = M('#0a0604', 'fineCard', 0.6);
        const out = [];
        for (let j = 0; j <= 6; j++) out.push(pts[j].clone());
        const p2 = out.map((p) => p.clone().add(V(0, 0.0028, 0.0024)));
        // kart: kökler kapak kenarında, uçlar yukarı-öne
        for (let j = 0; j < 6; j++) {
          const quad = [pts[j], pts[j + 1], p2[j + 1], p2[j]];
          const w = hw;
          for (const back of [false, true]) {
            const ids = quad.map((p, qi) => mb.v(p.x, p.y, p.z, qi === 0 || qi === 3 ? 0.05 : 0.95, qi < 2 ? 0.02 : 0.98, lm, w));
            if (back) { mb.t(ids[0], ids[2], ids[1]); mb.t(ids[0], ids[3], ids[2]); } else { mb.t(ids[0], ids[1], ids[2]); mb.t(ids[0], ids[2], ids[3]); }
          }
        }
      }
    }
  }
}

// ---------------- saç ----------------
export const HAIR_T = { kisa: 0.008, arkaya: 0.012, kel: 0, uzun: 0.011, kivircik: 0.022, at_kuyrugu: 0.006, yan_ayrik: 0.011, topuz: 0.006, kare: 0.012, dalgali: 0.012, asker: 0.003 };
function hairline(style, f, aphi) {
  const tbl = style === 'uzun' || style === 'kare' || style === 'dalgali'
    ? [[0, 0.062], [0.55, 0.066], [0.9, 0.03], [1.2, -0.07], [3.2, -0.08]]
    : style === 'asker'
      ? [[0, 0.07], [0.55, 0.072], [0.95, 0.045], [1.3, 0.0], [1.75, 0.02], [2.4, -0.02], [3.2, -0.04]]
      : [[0, f ? 0.062 : 0.057], [0.55, 0.066], [0.95, 0.034], [1.1, -0.018], [1.28, -0.02], [1.4, 0.028], [1.75, 0.035], [2.1, 0.0], [2.6, -0.062], [3.2, -0.068]];
  for (let i = 0; i < tbl.length - 1; i++) if (aphi <= tbl[i + 1][0]) { const t = (aphi - tbl[i][0]) / (tbl[i + 1][0] - tbl[i][0]); return tbl[i][1] + (tbl[i + 1][1] - tbl[i][1]) * t; }
  return -0.08;
}
// kafa üzerinde kabuk: cov(x,y,z,phi)->0..1, th -> kalınlık
function shell(c, covFn, thFn, mat, ws, hs, mod, cmFn) {
  const { mb, f, R } = c;
  const D = headDims(f), hb = c.headBase;
  const rows = [], cov = [];
  const n = V(0, 0, 0);
  const hw = W(BI.head);
  for (let i = 0; i <= hs; i++) {
    const lat = -Math.PI / 2 + (Math.PI * i) / hs, row = [], crow = [];
    for (let j = 0; j <= ws; j++) {
      const lon = -Math.PI + (TAU * j) / ws;
      const dx = Math.cos(lat) * Math.sin(lon), dy = Math.sin(lat), dz = Math.cos(lat) * Math.cos(lon);
      headPoint(f, dx, dy, dz, _p, R.age);
      const ly = _p.y - D.cy, phi = Math.atan2(dx, dz);
      const cv = covFn(_p.x, ly, _p.z - D.cz, phi);
      n.set(dx / D.rx, dy / D.ry, dz / D.rz).normalize();
      const t = cv > 0.02 ? 0.0015 + thFn(_p.x, ly, _p.z - D.cz, phi) * cv : -0.004;
      _p.addScaledVector(n, t);
      if (mod) mod(_p, ly, phi, dx, dy, dz);
      crow.push(cv);
      row.push(mb.v(_p.x + hb[0], _p.y + hb[1], _p.z + hb[2], (phi / Math.PI) * 4, dy * 2.5, mat, hw, cmFn ? cmFn(ly, phi) : 1));
    }
    mb.seam.push([row[0], row[ws]]);
    rows.push(row); cov.push(crow);
  }
  for (let i = 0; i < hs; i++) for (let j = 0; j < ws; j++) {
    if (cov[i][j] > 0.02 || cov[i][j + 1] > 0.02 || cov[i + 1][j + 1] > 0.02 || cov[i + 1][j] > 0.02) {
      const a = rows[i][j], b = rows[i][j + 1], cc = rows[i + 1][j + 1], d = rows[i + 1][j]; mb.t(a, b, cc); mb.t(a, cc, d);
    }
  }
}
// kafa yüzeyinde akış izleyen tel kartı yolu (birim küre yönleri üzerinde yürür)
function strandPath(c, dir0, flow, len, nSeg, lift, gravity) {
  const { f, R } = c;
  const D = headDims(f), hb = c.headBase;
  const u = dir0.clone().normalize(), pts = [], nrm = [];
  const step = len / nSeg;
  let free = null;
  const n = V(0, 0, 0), fl = V(0, 0, 0);
  for (let i = 0; i <= nSeg; i++) {
    const s = i / nSeg;
    if (!free) {
      headPoint(f, u.x, u.y, u.z, _p, R.age);
      n.set(u.x / D.rx, u.y / D.ry, u.z / D.rz).normalize();
      _p.addScaledVector(n, lift(s));
      const P0 = V(_p.x + hb[0], _p.y + hb[1], _p.z + hb[2]);
      pts.push(P0); nrm.push(n.clone());
      flow(u, fl, s);
      fl.addScaledVector(u, -fl.dot(u)).normalize();
      // kafanın altına inince serbest düşüş
      if (gravity && (u.y < -0.25 || (u.y < 0.15 && u.z < -0.2)) && i > 0) { free = { p: P0.clone(), d: fl.clone().multiplyScalar(0.2).add(V(0, -1, 0)).normalize(), n: n.clone() }; continue; }
      u.addScaledVector(fl, step / 0.1).normalize();
    } else {
      free.d.lerp(V(0, -1, free.d.z * 0.3), 0.25).normalize();
      free.p.addScaledVector(free.d, step);
      const p = free.p.clone();
      // sırt/omuz yüzeyinin dışında kal
      if (p.y < 1.53) { const zb = -(0.07 + (1.53 - p.y) * 0.5); if (p.z > zb && Math.abs(p.x) > 0.04) p.z = Math.min(p.z, zb); if (Math.abs(p.x) > 0.06 && p.z > zb + 0.02) p.x *= 0.97; }
      pts.push(p); nrm.push(free.n.clone().lerp(V(0, 0, -1), 0.5).normalize());
    }
  }
  return { pts, nrm };
}
function hairCards(c, opts) {
  const { mb, L, Q } = c;
  const count = Math.round(opts.n * Q.cards);
  if (count <= 0) return;
  const r = new RNG(opts.seed || 5);
  const hc = L.hairColor || '#1a1410';
  const mat = M(hc, opts.tile || 'hairCard', 0.42, 0);
  const D = headDims(c.f);
  for (let i = 0; i < count; i++) {
    // kafa üst yarısından örnekle
    let u = null;
    for (let tries = 0; tries < 12; tries++) {
      const z = r.float(-1, 1), a = r.float(0, TAU), rr = Math.sqrt(1 - z * z);
      const d = V(rr * Math.cos(a), z, rr * Math.sin(a));
      headPoint(c.f, d.x, d.y, d.z, _p, c.R.age);
      const ly = _p.y - D.cy, phi = Math.atan2(d.x, d.z);
      if (ly > hairline(opts.style, c.f, Math.abs(phi)) + 0.012 + (opts.minY || 0) && ly < c.hatCut) { u = d; break; }
    }
    if (!u) continue;
    const len = opts.len * r.float(0.7, 1.2);
    const { pts, nrm } = strandPath(c, u, opts.flow, len, opts.seg || 3, (s) => opts.base + opts.lift * Math.sin(Math.PI * Math.min(1, s * 1.4)) * (1 - s * 0.3), opts.gravity);
    const sides = pts.map((p, k) => { const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)]; return new THREE.Vector3().crossVectors(b.clone().sub(a), nrm[k]).normalize(); });
    const wd = opts.width * r.float(0.75, 1.25);
    const wfn = opts.wfn || (() => W(BI.head));
    card(mb, pts, sides, (s) => wd * (1 - 0.5 * s), mat, wfn, (s) => (0.72 + 0.4 * s) * r.float(0.85, 1.1));
  }
}
function buildHair(c) {
  const { L, Q, f, R } = c;
  const hs = L.hair || 'kisa', hat = c.hat;
  if (hat === 'basortusu') return;
  const hc = L.hairColor || '#1a1410';
  const T = HAIR_T[hs] || 0;
  const capM = M(hc, 'haircap', 0.5);
  const [ws, hsg] = Q.detail > 1 ? [40, 30] : Q.detail ? [20, 14] : [12, 8];
  // yaşlı keller: yanlarda at nalı saç
  if (hs === 'kel') {
    if (R.age > 0.4 || L.hairRing) shell(c, (x, y, z, phi) => smooth(0.0, 0.012, -y + 0.035) * smooth(0.8, 1.5, Math.abs(phi)) * smooth(-0.075, -0.055, y), () => 0.004, capM, ws, hsg);
    return;
  }
  const rn = new RNG(3);
  const lumps = Array.from({ length: 10 }, () => [rn.float(2, 6), rn.float(2, 6), rn.float(0, 6)]);
  const hatCut = hat !== 'none' ? (hat === 'bere' || hat === 'kasket' || hat === 'cap' || hat === 'takke' ? 0.03 : 0.045) : 9;
  c.hatCut = hatCut;
  const part = hs === 'yan_ayrik' ? 0.03 : null;
  shell(c,
    (x, y, z, phi) => smooth(hairline(hs, f, Math.abs(phi)), hairline(hs, f, Math.abs(phi)) + 0.014, y) * (y > hatCut + 0.04 ? 0 : 1),
    (x, y, z, phi) => {
      let t = T;
      if (hs === 'kisa') t += 0.004 * smooth(0.04, 0.1, y) * (z > 0 ? 1 : 0.5);
      if (hs === 'arkaya') t += 0.006 * smooth(0.0, 0.1, y) + (z < 0 ? 0.004 : 0);
      if (hs === 'kivircik') { let k2 = 0; for (const [a, b2, cc] of lumps) k2 += Math.sin(phi * a + cc) * Math.sin(y * 60 * b2 / 4 + cc); t += 0.006 * k2 / 3; }
      if (hs === 'uzun' || hs === 'kare' || hs === 'dalgali') t += 0.004 * smooth(0.0, 0.1, y);
      if (hs === 'yan_ayrik') t += 0.005 * smooth(0.0, 0.1, y) - 0.004 * gauss(x - part, 0.006) * smooth(0.04, 0.08, y);
      if (hs === 'topuz' || hs === 'at_kuyrugu') t -= 0.002;
      return Math.max(0.002, t);
    }, capM, ws, hsg, null, (ly) => 0.85 + 0.2 * smooth(-0.05, 0.1, ly));
  if (!Q.cards) {
    // uzak LOD: uzun saç / at kuyruğu kaba hacim
    if (hs === 'uzun' || hs === 'dalgali') { const hb = c.headBase, D = headDims(f); ellip(c.mb, V(0, hb[1] + D.cy - 0.1, hb[2] + D.cz - 0.06), 0.085, 0.13, 0.05, 8, 6, capM, W(BI.head)); }
    return;
  }
  const back = (u, o) => o.set(0, -0.35, -1).addScaledVector(u, 0.05);
  const down = (u, o) => o.set(u.x * 0.15, -1, u.z > 0.3 ? 0.2 : -0.25);
  const hw = W(BI.head);
  const longW = (p) => { const k2 = smooth(1.6, 1.36, p.y) * 0.75; return mixW(mixW(hw, W(BI.neck), Math.min(1, k2 * 1.4)), W(BI.chest), k2 * 0.6); };
  const cut = hat !== 'none' ? hatCut : 9;
  const base = T + 0.001;
  if (hs === 'kisa') hairCards(c, { style: hs, n: 200, len: 0.028, width: 0.016, base, lift: 0.0035, flow: (u, o) => o.set(u.x * 0.2, u.y > 0.6 ? 0.2 : -0.6, u.z > 0.5 ? 0.5 : -1), seed: 7, minY: 0, maxY: cut });
  if (hs === 'asker') hairCards(c, { style: hs, n: 120, len: 0.012, width: 0.012, base: 0.004, lift: 0.0015, flow: back, tile: 'fineCard', seed: 7 });
  if (hs === 'arkaya') hairCards(c, { style: hs, n: 220, len: 0.07, width: 0.02, base, lift: 0.004, flow: back, seg: 4, seed: 9 });
  if (hs === 'yan_ayrik') hairCards(c, { style: hs, n: 220, len: 0.055, width: 0.02, base, lift: 0.005, flow: (u, o) => o.set(u.x > part / 0.078 ? 1 : -1, -0.5, u.z > 0.4 ? 0.1 : -0.6), seg: 4, seed: 11 });
  if (hs === 'kivircik') hairCards(c, { style: hs, n: 260, len: 0.03, width: 0.022, base: base - 0.006, lift: 0.009, flow: (u, o) => o.set(Math.sin(u.z * 20), -0.6, Math.cos(u.x * 20)), tile: 'curlCard', seed: 13 });
  if (hs === 'uzun' || hs === 'dalgali') {
    const L2 = hs === 'uzun' ? (f ? 0.34 : 0.24) : 0.22;
    hairCards(c, { style: hs, n: 160, len: 0.05, width: 0.022, base, lift: 0.004, flow: down, seg: 3, seed: 15 });
    hairCards(c, { style: hs, n: 150, len: L2, width: 0.03, base: base + 0.002, lift: 0.006, flow: down, seg: 8, gravity: true, tile: hs === 'dalgali' ? 'curlCard' : 'hairCard', seed: 17, wfn: longW });
  }
  if (hs === 'kare') {
    hairCards(c, { style: hs, n: 150, len: 0.05, width: 0.022, base, lift: 0.004, flow: down, seg: 3, seed: 15 });
    hairCards(c, { style: hs, n: 120, len: 0.13, width: 0.03, base: base + 0.002, lift: 0.008, flow: down, seg: 5, gravity: true, seed: 19 });
  }
  if (hs === 'at_kuyrugu' || hs === 'topuz') {
    hairCards(c, { style: hs, n: 140, len: 0.09, width: 0.02, base, lift: 0.002, flow: (u, o) => o.set(-u.x * 0.6, u.y > 0.3 ? -0.2 : 0.6, -1), seg: 4, seed: 21 });
    const hb = c.headBase, D = headDims(f);
    const anchor = V(0, hb[1] + D.cy + 0.02, hb[2] + D.cz - D.rz - 0.012);
    if (hs === 'topuz') {
      ellip(c.mb, V(0, anchor.y + 0.03, anchor.z - 0.01), 0.038, 0.034, 0.034, 10, 8, capM, hw);
    } else {
      // kuyruk: tüp + çevresinde kartlar, kafa->boyun ağırlıklı
      const tail = [];
      for (let i = 0; i <= 6; i++) { const s = i / 6; tail.push(V(0, anchor.y - s * (f ? 0.24 : 0.18), anchor.z - 0.02 - Math.sin(s * 1.6) * 0.05)); }
      const tw2 = (p) => mixW(hw, W(BI.neck), smooth(anchor.y, anchor.y - 0.2, p.y) * 0.6);
      tube(c.mb, tail, (u) => 0.022 * (1 - u * 0.6) + 0.004, 7, capM, tw2);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU, off = V(Math.cos(a) * 0.02, 0, Math.sin(a) * 0.02);
        const pts = tail.map((p, i) => p.clone().addScaledVector(off, 1 - i / 7));
        const sides = pts.map(() => V(-Math.sin(a), 0, Math.cos(a)));
        card(c.mb, pts, sides, (s) => 0.03 * (1 - s * 0.6), M(hc, 'hairCard', 0.42), tw2, (s) => 0.75 + 0.35 * s);
      }
      tube(c.mb, [V(-0.0, anchor.y + 0.012, anchor.z - 0.006), V(0, anchor.y - 0.012, anchor.z - 0.022)], 0.024, 8, M('#1a1a1a', 'flat', 0.4), () => hw);
    }
  }
}

// ---------------- sakal ----------------
function beardCov(L, f) {
  const kind = L.beard;
  return (x, y, z) => {
    if (z < 0.0) return 0;
    const ax = Math.abs(x);
    const mus = ax < 0.027 && y > -0.057 && y < -0.044 ? 1 : 0;
    if (kind === 'mustache') return mus * smooth(0.03, 0.02, ax);
    if (kind === 'keci') return Math.max(mus * smooth(0.03, 0.02, ax), smooth(0.028, 0.018, ax) * smooth(-0.07, -0.08, y));
    if (ax < 0.024 && y > -0.072 && y < -0.053 && !mus) return 0;
    const top = -0.022 - Math.max(0, 0.032 - ax) * 0.7;
    return Math.max(mus, smooth(top, top - 0.012, y) * (ax > 0.055 && z < 0.03 ? smooth(-0.005, 0.03, z) : 1));
  };
}
function buildBeard(c) {
  const { L, Q, f } = c;
  if (!L.beard || L.beard === 'none' || L.beard === 'stubble' || f) return;
  const hc = L.hairColor || '#1a1410';
  const cov = beardCov(L, f);
  const capM = M(hc, 'haircap', 0.55);
  shell(c, cov, (x, y) => (L.beard === 'full' ? (y < -0.08 ? 0.009 : 0.005) : 0.004), capM, Q.detail > 1 ? 44 : 22, Q.detail > 1 ? 34 : 16);
  if (!Q.cards) return;
  // tel kartları: çeneden aşağı
  const r = new RNG(31), D = headDims(f), hb = c.headBase;
  const mat = M(hc, 'fineCard', 0.5);
  const n = Math.round((L.beard === 'full' ? 220 : 60) * Q.cards);
  const hw = W(BI.head);
  for (let i = 0; i < n; i++) {
    const x = r.float(-0.08, 0.08), y = r.float(-0.13, -0.04);
    const dx = x / D.rx, dy = y / D.ry; if (dx * dx + dy * dy > 0.98) continue;
    const dz = Math.sqrt(1 - dx * dx - dy * dy);
    headPoint(f, dx, dy, dz, _p, c.R.age);
    const ly = _p.y - D.cy;
    if (cov(_p.x, ly, _p.z - D.cz) < 0.5) continue;
    const nn = V(dx / D.rx, dy / D.ry, dz / D.rz).normalize();
    const base = V(_p.x + hb[0], _p.y + hb[1], _p.z + hb[2]).addScaledVector(nn, 0.003);
    const mus = Math.abs(x) < 0.027 && ly > -0.058 && ly < -0.044;
    const len = mus ? 0.012 : L.beard === 'full' ? r.float(0.014, 0.024) : 0.012;
    const d = V(mus ? Math.sign(x) * 0.4 : 0, -1, 0.35).addScaledVector(nn, -0.2).normalize();
    const pts = [base, base.clone().addScaledVector(d, len * 0.5).addScaledVector(nn, 0.003), base.clone().addScaledVector(d, len)];
    const side = new THREE.Vector3().crossVectors(d, nn).normalize();
    card(c.mb, pts, [side, side, side], (s) => 0.012 * (1 - 0.4 * s), mat, () => hw, (s) => 0.75 + 0.3 * s);
  }
}

// ---------------- şapkalar ----------------
function buildHat(c) {
  const { L, Q, f, mb } = c;
  const kind = c.hat;
  buildBeard(c);
  if (kind === 'none') return;
  const D = headDims(f), hb = c.headBase;
  const T = HAIR_T[L.hair] || 0;
  const hc = L.hatColor || '#222222';
  const hw = W(BI.head);
  const [ws, hs] = Q.detail > 1 ? [36, 26] : Q.detail ? [18, 12] : [10, 7];
  const at = (x, y, z) => V(x + hb[0], y + hb[1], z + hb[2]);
  if (kind === 'bere' || kind === 'takke') {
    shell(c, (x, y) => smooth(kind === 'takke' ? 0.06 : 0.032, (kind === 'takke' ? 0.06 : 0.032) + 0.01, y), (x, y) => T + 0.01 + (y < 0.05 ? 0.004 : 0) + (kind === 'bere' ? 0.012 * smooth(0.07, 0.12, y) : 0), M(hc, kind === 'takke' ? 'weave' : 'rib', 0.95), ws, hs,
      (v, ly) => { if (kind === 'bere' && ly > 0.09) v.y += (ly - 0.09) * 0.25; });
    if (kind === 'bere') shell(c, (x, y) => smooth(0.03, 0.034, y) * smooth(0.06, 0.056, y), () => T + 0.016, M(hc, 'rib', 0.95, 0, 0.85), ws, hs);
  } else if (kind === 'kasket' || kind === 'cap') {
    const cap = kind === 'cap';
    shell(c, (x, y, z) => smooth(0.04, 0.05, y + (z > 0 ? 0 : 0.008)), () => T + 0.01, M(hc, cap ? 'canvas' : 'felt', 0.9), ws, hs, (v, ly) => {
      if (!cap && ly > 0.065) { v.y = D.cy + 0.065 + (ly - 0.065) * 0.42; v.z += (ly - 0.065) * 0.4; v.x *= 1.05; }
      if (cap) v.y += 0.004 * smooth(0.06, 0.11, ly);
    });
    // siper: öne uzanan kavisli plaka
    const nr = 6, nc = 10, rows = [];
    for (let i = 0; i <= nr; i++) {
      const row = [];
      for (let j = 0; j <= nc; j++) {
        const a = -1 + (2 * j) / nc, rr = i / nr;
        const len = cap ? 0.075 : 0.05;
        const x = Math.sin(a * 0.95) * (D.rx + 0.012) * (1 - rr * 0.25), z = D.cz + D.rz * 0.72 + rr * len * Math.cos(a * 0.8) + Math.cos(a) * 0.012;
        const y = D.cy + (cap ? 0.045 : 0.05) - rr * (cap ? 0.012 : 0.016) - Math.abs(a) * 0.006 - (cap ? 0.008 * rr * rr : 0);
        row.push(at(x, y, z));
      }
      rows.push(row);
    }
    const vm = M(hc, cap ? 'canvas' : 'felt', 0.85, 0, 0.92);
    for (const back of [false, true]) {
      const ids = rows.map((row) => row.map((p) => mb.v(p.x, p.y + (back ? -0.004 : 0), p.z, 0, 0, vm, hw, back ? 0.8 : 1)));
      for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) { const a = ids[i][j], b = ids[i][j + 1], cc = ids[i + 1][j + 1], d = ids[i + 1][j]; if (back) { mb.t(a, b, cc); mb.t(a, cc, d); } else { mb.t(a, cc, b); mb.t(a, d, cc); } }
    }
    if (cap) ellip(mb, at(0, D.cy + D.ry + T + 0.012, D.cz), 0.008, 0.004, 0.008, 6, 3, vm, hw);
  } else if (kind === 'fedora' || kind === 'panama' || kind === 'police') {
    const pol = kind === 'police';
    const cm = M(hc, kind === 'panama' ? 'canvas' : pol ? 'wool' : 'felt', kind === 'panama' ? 0.9 : 0.85);
    const r0 = (pol ? 0.112 : 0.088) + T * 0.5, r1 = (pol ? 0.092 : 0.094) + T * 0.5;
    const y0 = D.cy + (pol ? 0.055 : 0.05), h = pol ? 0.085 : 0.115;
    const ck = [[0, 0, y0, D.cz - 0.004, r1, r1 * 1.14, r1 * 1.14, 2.4], [h * 0.6, 0, y0 + h * 0.6, D.cz - 0.004, (r0 + r1) / 2, (r0 + r1) / 2 * 1.14, (r0 + r1) / 2 * 1.14, 2.4], [h, 0, y0 + h, D.cz - 0.004, r0, r0 * 1.12, r0 * 1.12, 2.4], [h + 0.006, 0, y0 + h + 0.004, D.cz - 0.004, r0 * 0.7, r0 * 0.75, r0 * 0.75, 2.2], [h + 0.01, 0, y0 + h + 0.006, D.cz - 0.004, 0.005, 0.005, 0.005, 2]];
    const C = new Limb(ck.map((k) => { k[2] += hb[1]; return k; }), V(1, 0, 0), V(0, 0, 1), V(0, 1, 0), () => hw, {
      bump: pol ? null : (t, th) => -0.012 * gauss(t - h, 0.025) * gauss(angD(th, Math.PI / 2), 0.5) - 0.01 * gauss(t - h - 0.006, 0.01) * gauss(Math.cos(th), 0.35),
    });
    C.emit(mb, [{ t0: 0, t1: h + 0.01, off: 0, mat: cm }], Math.max(8, Math.round(ws * 0.7)), 0.02);
    // bant
    C.patch(mb, -Math.PI / 2, Math.PI * 1.5, 0.004, pol ? 0.028 : 0.026, 0.002, pol ? M('#0a0a0a', 'flat', 0.3) : M(kind === 'panama' ? '#2a2a2a' : '#3a0c0c', 'weave', 0.7), 20, 1);
    // kenar (siper)
    const nr = 3, nc = Math.max(12, ws), rows = [];
    for (let i = 0; i <= nr; i++) {
      const row = [];
      for (let j = 0; j <= nc; j++) {
        const a = (j / nc) * TAU, rr = r1 + (i / nr) * (pol ? 0.0 : 0.07);
        const x = Math.sin(a) * rr, z = Math.cos(a) * rr * 1.12 + D.cz - 0.004;
        let y = y0 + 0.002 + (pol ? 0 : (i / nr) * (Math.abs(Math.sin(a)) * 0.024 - Math.abs(Math.cos(a)) * 0.012));
        row.push(at(x, y, z));
      }
      rows.push(row);
    }
    if (!pol) for (const back of [false, true]) {
      const ids = rows.map((row) => row.map((p) => mb.v(p.x, p.y - (back ? 0.005 : 0), p.z, 0, 0, cm, hw, back ? 0.8 : 1)));
      for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) { const a = ids[i][j], b = ids[i][j + 1], cc = ids[i + 1][j + 1], d = ids[i + 1][j]; if (back) { mb.t(a, cc, b); mb.t(a, d, cc); } else { mb.t(a, b, cc); mb.t(a, cc, d); } }
    }
    if (pol) {
      // siper + arma
      const vm = M('#0a0a0a', 'flat', 0.2, 0.1);
      const pts = [];
      for (let i = 0; i <= 8; i++) { const a = -1 + (i / 8) * 2; pts.push(at(Math.sin(a) * 0.095, y0 + 0.002, D.cz + Math.cos(a) * 0.1 + 0.005)); }
      for (let i = 0; i < 8; i++) {
        const p0 = pts[i], p1 = pts[i + 1], q0 = p0.clone().add(V(Math.sin(-1 + (i / 8) * 2) * 0.02, -0.012, 0.035)), q1 = p1.clone().add(V(Math.sin(-1 + ((i + 1) / 8) * 2) * 0.02, -0.012, 0.035));
        for (const back of [false, true]) { const ids = [p0, p1, q1, q0].map((p) => mb.v(p.x, p.y - (back ? 0.003 : 0), p.z, 0, 0, vm, hw)); if (back) { mb.t(ids[0], ids[1], ids[2]); mb.t(ids[0], ids[2], ids[3]); } else { mb.t(ids[0], ids[2], ids[1]); mb.t(ids[0], ids[3], ids[2]); } }
      }
      C.button(mb, 0.05, Math.PI / 2, 0.004, 0.016, M('#d4af37', 'flat', 0.3, 0.9), 8);
    }
  } else if (kind === 'basortusu') {
    // başörtüsü: yüz ovali dışında tüm kafa + boyun + omuza dökülen etek
    const sm2 = M(hc, 'weave', 0.85);
    shell(c, (x, y, z) => {
      const face = z > 0.02 && Math.abs(x) < 0.056 * (1 - Math.max(0, -y - 0.06) * 3) && y < 0.05 && y > -0.12;
      return face ? 0 : (y < -0.06 && z < 0.0 ? 1 : y > -0.115 ? 1 : 0);
    }, (x, y, z) => 0.016 + T + (y > 0.06 ? 0.006 : 0) + (z < 0 ? 0.008 : 0), sm2, ws, hs, (v, ly) => { if (ly < -0.08) v.z -= 0.006; });
    const dk = [[1.37, 0, 1.37, 0.0, 0.19, 0.13, 0.13, 2.2], [1.43, 0, 1.43, 0.0, 0.13, 0.1, 0.11, 2.2], [1.5, 0, 1.5, 0.008, 0.075, 0.075, 0.075, 2], [1.58, 0, 1.58, 0.012, 0.072, 0.075, 0.075, 2]];
    const Dr = new Limb(dk, V(1, 0, 0), V(0, 0, 1), V(0, 1, 0), (t, p) => chainW(p.y, [[1.42, W(BI.chest)], [1.5, W(BI.neck)], [1.58, W(BI.head)]]));
    Dr.emit(mb, [{ t0: 1.37, t1: 1.58, off: 0.012, mat: sm2 }], Q.torso, 0.03, { double: true });
  }
}

// ---------------- aksesuarlar ----------------
function buildExtras(c) {
  const { L, R, Q, mb, f } = c;
  const T = c.torso, tw = (p) => T.w(0, p);
  const D = headDims(f), hb = c.headBase;
  if (L.glasses && Q.detail) {
    const gs = L.glassesStyle || 'glasses';
    const fc = L.glassesColor && gs !== 'glasses' ? L.glassesColor : gs === 'readers' ? '#3a2412' : '#080808';
    const fm = M(fc, 'flat', 0.3, gs === 'aviator' ? 0.9 : 0.1);
    const lensM = gs === 'readers' ? null : gs === 'aviator' ? M('#6a5a3a', 'flat', 0.05, 0.9) : M('#050505', 'flat', 0.08, 0.2);
    const hw = W(BI.head);
    const z0 = D.cz + D.rz + 0.006 + hb[2];
    for (const s of [-1, 1]) {
      const cx = s * 0.032, cy = hb[1] + D.cy + 0.012;
      const rw = gs === 'aviator' ? 0.022 : 0.02, rh = gs === 'aviator' ? 0.019 : 0.015;
      const rim = [];
      for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; rim.push(V(cx + Math.cos(a) * rw, cy + Math.sin(a) * rh - (gs === 'aviator' && Math.sin(a) < 0 ? 0.004 * -Math.sin(a) : 0), z0 - Math.abs(Math.cos(a)) * 0.004 * s * Math.sign(Math.cos(a)) * s)); }
      tube(mb, rim, 0.0018, 4, fm, () => hw, true);
      if (lensM) {
        const cc = mb.v(cx, cy, z0 + 0.001, 0, 0, lensM, hw), ids = rim.map((p) => mb.v(p.x, p.y, p.z, 0, 0, lensM, hw));
        for (let i = 0; i < 14; i++) { mb.t(cc, ids[(i + 1) % 14], ids[i]); mb.t(cc, ids[i], ids[(i + 1) % 14]); }
      }
      // sap
      tube(mb, [V(s * (0.032 + rw), cy + 0.004, z0 - 0.002), V(s * (D.rx + 0.006), cy + 0.006, z0 - 0.04), V(s * (D.rx + 0.004), cy + 0.002, hb[2] + D.cz - 0.03)], 0.0016, 3, fm, () => hw);
    }
    tube(mb, [V(-0.012, hb[1] + D.cy + 0.016, z0 + 0.001), V(0, hb[1] + D.cy + 0.019, z0 + 0.003), V(0.012, hb[1] + D.cy + 0.016, z0 + 0.001)], 0.0016, 3, fm, () => hw);
  }
  if (L.chain && Q.detail) {
    const cc = L.chainColor || (L.chainStyle === 'silverchain' ? '#cfd2d6' : '#d4af37');
    const pts = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU, front = Math.max(0, Math.cos(a));
      const y = 1.47 - front * front * 0.075;
      T.point(y, a + Math.PI / 2 - Math.PI / 2 + Math.PI / 2 * 0, 0, _p);
      const th = a; // a=0 önde
      const thL = Math.PI / 2 + th;
      T.point(y, thL, 0.016 + 0.004 * front, _p);
      pts.push(_p.clone());
    }
    tube(mb, pts, 0.0045, 5, M(cc, 'flat', 0.2, 0.95), (p) => tw(p), true, (u) => 0.8 + 0.3 * Math.abs(Math.sin(u * 120)));
  }
  // sırt çantası / spor çanta
  if ((L.bag === 'bag1' || L.bag === 'backpack' || L.bag === 'duffel') && Q.detail) {
    const bc = M(L.bagColor || '#1a1a1a', 'canvas', 0.85);
    const duffel = L.bag === 'duffel';
    const zb = -(0.1 * (0.62 + 0.38 * R.bk)) - 0.06 - (c.topSpec.off || 0);
    if (!duffel) {
      ellip(mb, V(0, 1.24, zb), 0.15, 0.2, 0.065, 10, 8, bc, (dx, dy, dz) => tw(V(0, 1.24 + dy * 0.2, zb)));
      ellip(mb, V(0, 1.15, zb - 0.06), 0.11, 0.08, 0.03, 8, 6, M(L.bagColor || '#1a1a1a', 'canvas', 0.85, 0, 0.8), () => tw(V(0, 1.2, 0)));
      for (const s of [1, -1]) {
        const strap = [];
        for (let i = 0; i <= 8; i++) {
          const u = i / 8, y = 1.43 - u * 0.3;
          const th = Math.PI / 2 + s * (Math.PI / 2 - 0.55) - s * u * 0.25;
          T.point(Math.max(1.1, y), th, (c.topSpec.off || 0) + 0.012, _p);
          if (i === 0) _p.set(s * 0.1, 1.47, -0.02);
          strap.push(_p.clone());
        }
        strap.push(V(s * 0.12, 1.16, zb + 0.03));
        tube(mb, strap, 0.012, 4, M('#111111', 'canvas', 0.8), (p) => tw(p));
      }
    } else {
      // omuz çantası: sol omuzdan sağ kalçaya kayış + yan çanta
      tube(mb, [V(0.12, 1.47, -0.02), V(0.05, 1.38, 0.13), V(-0.1, 1.12, 0.12), V(-0.18, 0.98, 0.02)], 0.01, 4, M('#111111', 'canvas', 0.8), (p) => tw(p));
      ellip(mb, V(-0.22, 0.95, 0.0), 0.05, 0.1, 0.14, 8, 6, bc, () => mixW(W(BI.hips), W(BI.hipR), 0.2));
    }
  }
  // fotoğraf makinesi (turist)
  if (L.camera && Q.detail) {
    tube(mb, [V(-0.08, 1.47, 0.04), V(-0.05, 1.32, 0.14), V(0.0, 1.24, 0.15), V(0.05, 1.32, 0.14), V(0.08, 1.47, 0.04)], 0.004, 3, M('#111111', 'flat', 0.6), (p) => tw(p));
    T.point(1.23, Math.PI / 2, 0.04, _p);
    boxP(mb, _p.clone(), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.05, 0.035, 0.025, M('#1a1a1a', 'leather', 0.4), tw(_p));
    boxP(mb, _p.clone().add(V(0, 0, 0.03)), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.018, 0.018, 0.012, M('#0a0a0a', 'flat', 0.15, 0.5), tw(_p));
  }
  // polis teçhizat kemeri: kılıf + telsiz
  if ((c.top === 'police' || c.top === 'police_shirt' || c.top === 'police_vest') && Q.detail) {
    const bm = M('#0a0a0a', 'leather', 0.35);
    c.torso.patch(mb, -Math.PI / 2, Math.PI * 1.5, 0.975, 1.03, 0.018, bm, 22, 1);
    T.point(0.96, -0.2, 0.03, _p);
    _p.x = -Math.abs(_p.x);
    boxP(mb, _p.clone(), V(0, 0, 1), V(0, 1, 0), V(-1, 0, 0), 0.03, 0.07, 0.02, bm, mixW(W(BI.hips), W(BI.hipR), 0.15));
    T.point(1.36, Math.PI / 2 + 0.55, 0.02, _p);
    boxP(mb, _p.clone(), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.015, 0.03, 0.01, bm, W(BI.chest));
  }
}

// Yürünebilirlik ızgarası (NPC yol bulma): 0.5 m hücreler, 32 m'lik parçalar hâlinde, çarpışma şekillerinden
// tembel (ihtiyaç olunca) üretilir. Hücre değerleri: 0 boş, 1 alçak engel (≤1.25 m, üstünden atlanır),
// 2 dolu (duvar, bina, direk), 3 su. Şekiller ajan yarıçapı kadar şişirilir: dolu hücre = merkez oraya giremez.
// A*: sınırlı pencerede (≤64 m), 8 komşulu, oktil sezgisel; tip dizileri tekrar kullanılır (bellek ayırmaz).
// Yol düzleştirme: ızgara görüş hattıyla ip çekme; alçak engel geçişleri `vault` bayrağıyla işaretlenir.
import { isLand } from './map.js';
import { shapeDistance } from './physics.js';

export const CS = 0.5; // hücre (m)
const CN = 64; // parça kenarı (hücre)
const OFF = 1400; // indeksler pozitif kalsın
export const N_FREE = 0, N_LOW = 1, N_BLOCK = 2, N_WATER = 3;
const INFL = 0.3; // şişirme (ajan yarıçapı ~0.35)
const LOW_TOP = 1.25, STEP = 0.45, HEAD = 1.7;
const _q = [];

// A* çalışma alanı (tüm ızgaralar paylaşır)
const W = 128, WW = W * W;
const gS = new Float32Array(WW), fS = new Float32Array(WW), par = new Int32Array(WW);
const openSt = new Uint32Array(WW), closeSt = new Uint32Array(WW), win = new Uint8Array(WW);
const heap = new Int32Array(WW);
let searchId = 0;
const SQ2 = Math.SQRT2;
const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

export class NavGrid {
  constructor(physics, cols) {
    this.physics = physics;
    this.cols = cols;
    this.city = !!cols.isCity;
    this.chunks = new Map();
    this.budget = 4; // kare başına tembel parça üretimi
    this.stats = { built: 0, searches: 0, expanded: 0, buildMs: 0 };
  }
  reset() { this.chunks.clear(); }
  // her karenin başında (NPCManager) çağrılır
  tick() { this.budget = 3; }
  invalidate(x0, z0, x1, z1) {
    if (!this.chunks.size) return;
    const S = CN * CS;
    const cx0 = Math.floor((x0 - INFL - 0.5 + OFF) / S), cx1 = Math.floor((x1 + INFL + 0.5 + OFF) / S);
    const cz0 = Math.floor((z0 - INFL - 0.5 + OFF) / S), cz1 = Math.floor((z1 + INFL + 0.5 + OFF) / S);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) this.chunks.delete(cx * 4096 + cz);
  }
  chunk(cx, cz, force) {
    const k = cx * 4096 + cz;
    let c = this.chunks.get(k);
    if (c) return c;
    if (!force && this.budget <= 0) return null;
    this.budget--;
    c = this.build(cx, cz);
    this.chunks.set(k, c);
    return c;
  }
  build(cx, cz) {
    const t0 = performance.now();
    const arr = new Uint8Array(CN * CN);
    const S = CN * CS;
    const wx0 = cx * S - OFF, wz0 = cz * S - OFF;
    if (this.city) {
      for (let j = 0; j < CN; j++) for (let i = 0; i < CN; i++) {
        if (!isLand(wx0 + (i + 0.5) * CS, wz0 + (j + 0.5) * CS)) arr[j * CN + i] = N_WATER;
      }
    }
    const boxes = this.cols.query(wx0 - INFL, wz0 - INFL, wx0 + S + INFL, wz0 + S + INFL, _q);
    for (let n = 0; n < boxes.length; n++) {
      const b = boxes[n];
      if (b.y0 > HEAD || b.y1 <= STEP || b.removed) continue;
      const v = b.y1 <= LOW_TOP && b.y0 < 0.4 ? N_LOW : N_BLOCK;
      const i0 = Math.max(0, Math.floor((b.x0 - INFL - wx0) / CS)), i1 = Math.min(CN - 1, Math.floor((b.x1 + INFL - wx0) / CS));
      const j0 = Math.max(0, Math.floor((b.z0 - INFL - wz0) / CS)), j1 = Math.min(CN - 1, Math.floor((b.z1 + INFL - wz0) / CS));
      // büyük AABB'lerde iç hücreler doğrudan dolu
      for (let j = j0; j <= j1; j++) {
        const z = wz0 + (j + 0.5) * CS;
        for (let i = i0; i <= i1; i++) {
          const o = j * CN + i;
          if (arr[o] >= v) continue;
          const x = wx0 + (i + 0.5) * CS;
          if (shapeDistance(b, x, z) <= INFL) arr[o] = v;
        }
      }
    }
    this.stats.built++;
    this.stats.buildMs += performance.now() - t0;
    return arr;
  }
  // hücre değeri (parça yoksa ve bütçe bittiyse -1: bilinmiyor)
  cell(ix, iz, force) {
    const cx = Math.floor(ix / CN), cz = Math.floor(iz / CN);
    const c = this.chunk(cx, cz, force);
    if (!c) return -1;
    return c[(iz - cz * CN) * CN + (ix - cx * CN)];
  }
  at(x, z, force) { return this.cell(Math.floor((x + OFF) / CS), Math.floor((z + OFF) / CS), force); }
  walkable(x, z, allowLow) { const v = this.at(x, z, false); return v <= 0 || (allowLow && v === N_LOW); }

  // Izgara görüş hattı: a→b arasında dolu hücre yok mu (allowLow: alçak engeller geçilebilir)
  clearLine(ax, az, bx, bz, allowLow = false, force = false) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(L / (CS * 0.5)));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const v = this.at(ax + dx * t, az + dz * t, force);
      if (v > 0 && !(allowLow && v === N_LOW)) return false;
    }
    return true;
  }
  // a→b doğrultusunda ilk engelin uzaklığı (yoksa L)
  freeDist(ax, az, dx, dz, L, allowLow = false) {
    for (let s = 0.25; s <= L; s += 0.25) {
      const v = this.at(ax + dx * s, az + dz * s, false);
      if (v > 0 && !(allowLow && v === N_LOW)) return s;
    }
    return L;
  }
  // (x,z) yakınındaki en yakın boş hücre merkezi (r: hücre yarıçapı)
  nearestFree(x, z, r, out) {
    const ix = Math.floor((x + OFF) / CS), iz = Math.floor((z + OFF) / CS);
    if (this.cell(ix, iz, true) === N_FREE) { out.x = x; out.z = z; return true; }
    for (let rr = 1; rr <= r; rr++) {
      let best = -1, bd = 1e9;
      for (let j = -rr; j <= rr; j++) for (let i = -rr; i <= rr; i++) {
        if (Math.abs(i) !== rr && Math.abs(j) !== rr) continue;
        if (this.cell(ix + i, iz + j, true) !== N_FREE) continue;
        const d = i * i + j * j;
        if (d < bd) { bd = d; best = (j + r) * 1000 + (i + r); }
      }
      if (best >= 0) {
        const j = Math.floor(best / 1000) - r, i = (best % 1000) - r;
        out.x = (ix + i + 0.5) * CS - OFF; out.z = (iz + j + 0.5) * CS - OFF;
        return true;
      }
    }
    return false;
  }

  // A*: out dizisine {x, z, vault} yol noktaları yazar (ilk nokta başlangıç değil). Başarıda true;
  // hedefe ulaşılamazsa hedefe en yakın noktaya giden kısmi yol (partial = true) döner.
  findPath(sx, sz, tx, tz, out, opts = {}) {
    const lowCost = opts.lowCost ?? 6;
    const maxExp = opts.maxExpand ?? 5000;
    this.stats.searches++;
    out.length = 0; out.partial = false;
    const st = { x: 0, z: 0 }, gl = { x: 0, z: 0 };
    if (!this.nearestFree(sx, sz, 4, st)) return false;
    // hedef pencereye sığmazsa doğru boyunca kırp
    const half = (W / 2 - 3) * CS;
    let gx = tx, gz = tz;
    const mx = (sx + tx) / 2, mz = (sz + tz) / 2;
    let ox = mx - (W / 2) * CS, oz = mz - (W / 2) * CS;
    if (Math.abs(tx - sx) > 2 * half || Math.abs(tz - sz) > 2 * half) {
      const dx = tx - sx, dz = tz - sz;
      const k = Math.min((2 * half) / Math.max(1e-3, Math.abs(dx)), (2 * half) / Math.max(1e-3, Math.abs(dz)), 1) * 0.98;
      gx = sx + dx * k; gz = sz + dz * k;
      ox = (sx + gx) / 2 - (W / 2) * CS; oz = (sz + gz) / 2 - (W / 2) * CS;
      out.partial = true;
    }
    if (!this.nearestFree(gx, gz, 8, gl)) { out.partial = true; gl.x = gx; gl.z = gz; }
    // pencere hücre başlangıcı (dünya ızgarasına hizalı)
    const bix = Math.floor((ox + OFF) / CS), biz = Math.floor((oz + OFF) / CS);
    const toL = (x, z) => { const i = Math.floor((x + OFF) / CS) - bix, j = Math.floor((z + OFF) / CS) - biz; return i < 0 || j < 0 || i >= W || j >= W ? -1 : j * W + i; };
    const s = toL(st.x, st.z), g = toL(gl.x, gl.z);
    if (s < 0 || g < 0) return false;
    // pencere hücrelerini doldur (parçaları zorla üret)
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const v = this.cell(bix + i, biz + j, true);
      win[j * W + i] = v < 0 ? N_BLOCK : v;
    }
    win[s] = N_FREE;
    const sid = ++searchId;
    const gi = g % W, gj = (g / W) | 0;
    const h = (o) => { const di = Math.abs((o % W) - gi), dj = Math.abs(((o / W) | 0) - gj); return (di + dj + (SQ2 - 2) * Math.min(di, dj)); };
    let hn = 0;
    const push = (o) => {
      let i = hn++; heap[i] = o;
      while (i > 0) { const p = (i - 1) >> 1; if (fS[heap[p]] <= fS[o]) break; heap[i] = heap[p]; heap[p] = o; i = p; }
    };
    const pop = () => {
      const top = heap[0]; const last = heap[--hn];
      if (hn > 0) {
        let i = 0; heap[0] = last;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < hn && fS[heap[l]] < fS[heap[m]]) m = l;
          if (r < hn && fS[heap[r]] < fS[heap[m]]) m = r;
          if (m === i) break;
          const t = heap[i]; heap[i] = heap[m]; heap[m] = t; i = m;
        }
      }
      return top;
    };
    gS[s] = 0; fS[s] = h(s); par[s] = -1; openSt[s] = sid; push(s);
    let best = s, bestH = h(s), exp = 0, found = false;
    while (hn > 0) {
      const o = pop();
      if (closeSt[o] === sid) continue;
      closeSt[o] = sid;
      if (o === g) { found = true; best = o; break; }
      if (++exp > maxExp) break;
      const hh = fS[o] - gS[o];
      if (hh < bestH) { bestH = hh; best = o; }
      const oi = o % W, oj = (o / W) | 0;
      for (let k = 0; k < 8; k++) {
        const ni = oi + NB[k][0], nj = oj + NB[k][1];
        if (ni < 0 || nj < 0 || ni >= W || nj >= W) continue;
        const no = nj * W + ni;
        const v = win[no];
        if (v >= N_BLOCK) continue;
        // çaprazda köşe kesme yok
        if (k >= 4 && (win[oj * W + ni] >= N_BLOCK || win[nj * W + oi] >= N_BLOCK)) continue;
        if (closeSt[no] === sid) continue;
        const ng = gS[o] + NB[k][2] * (v === N_LOW ? lowCost : 1);
        if (openSt[no] === sid && ng >= gS[no]) continue;
        openSt[no] = sid; gS[no] = ng; par[no] = o; fS[no] = ng + h(no) * 1.02;
        push(no);
      }
    }
    this.stats.expanded += exp;
    if (!found) out.partial = true;
    // geri izle
    const cells = [];
    for (let o = best; o >= 0; o = par[o]) { cells.push(o); if (o === s) break; }
    cells.reverse();
    const wx = (o) => (bix + (o % W) + 0.5) * CS - OFF, wz = (o) => (biz + ((o / W) | 0) + 0.5) * CS - OFF;
    // ip çekme düzleştirme: alçak hücreler geçilmez sayılır → atlama noktaları korunur
    let a = 0;
    while (a < cells.length - 1) {
      let b = a + 1;
      const ax = wx(cells[a]), az = wz(cells[a]);
      for (let c = cells.length - 1; c > a + 1; c--) { if (this._clearWin(ax, az, wx(cells[c]), wz(cells[c]), bix, biz)) { b = c; break; } }
      let vault = false;
      for (let c = a + 1; c <= b; c++) if (win[cells[c]] === N_LOW) { vault = true; break; }
      if (vault) {
        // alçak engel bölümünü sona kadar atla: ilk boş hücreye kadar
        let e = b;
        while (e < cells.length - 1 && win[cells[e]] === N_LOW) e++;
        out.push({ x: wx(cells[e]), z: wz(cells[e]), vault: true });
        a = e;
      } else {
        out.push({ x: wx(cells[b]), z: wz(cells[b]), vault: false });
        a = b;
      }
    }
    if (found && out.length) { const last = out[out.length - 1]; if (Math.hypot(last.x - tx, last.z - tz) < 1.2 && this.at(tx, tz, false) === N_FREE) { last.x = tx; last.z = tz; } }
    return found;
  }
  _clearWin(ax, az, bx, bz, bix, biz) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(L / (CS * 0.5)));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const i = Math.floor((ax + dx * t + OFF) / CS) - bix, j = Math.floor((az + dz * t + OFF) / CS) - biz;
      if (i < 0 || j < 0 || i >= W || j >= W) return false;
      if (win[j * W + i] !== N_FREE) return false;
    }
    return true;
  }
}

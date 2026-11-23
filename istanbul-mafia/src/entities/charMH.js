// Gerçekçi insan gövdeleri: telifsiz (CC0) MakeHuman verisinden çalışma zamanında birleştirme.
// Veri: assets/mh/mh.bin + mh.webp (scripts/assets/pack-mh.py üretir; kaynak ve lisans assets/mh/KAYNAK.md).
// Gövde tipi + kıyafet + ayakkabı + saç + göz/kaş/kirpik tek ağda birleşir, bizim 27 kemikli iskeletimize bağlanır.
// Aynı biçimi paylaşan görünüşler (yalnız renk farkı) aynı köşe tamponlarını kullanır; uzaklık düzeyleri yalnız dizin değiştirir.
import * as THREE from 'three';

let HEAD = null, BUF = null, BASE0 = 0, TEX = null, OFF = false, ready = null;
const TYPES = { int16: Int16Array, uint8: Uint8Array, uint16: Uint16Array, uint32: Uint32Array, float32: Float32Array };
const arr = (s) => (s ? new TYPES[s[0]](BUF, BASE0 + s[1], s[2]) : null);

export function readBin(rel) {
  const d = typeof window !== 'undefined' && window.desktop;
  if (d && d.readAsset) return d.readAsset(rel).then((b) => { if (!b) throw new Error('yok: ' + rel); const u = new Uint8Array(b); return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength); });
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest(); x.open('GET', 'assets/' + rel); x.responseType = 'arraybuffer';
    x.onload = () => (x.response && x.response.byteLength ? res(x.response) : rej(new Error('boş: ' + rel))); x.onerror = () => rej(new Error('yüklenemedi: ' + rel)); x.send();
  });
}
function readImage(rel) {
  return new Promise((res, rej) => {
    const img = new Image(); img.onerror = () => rej(new Error('yüklenemedi: ' + rel));
    const d = typeof window !== 'undefined' && window.desktop;
    if (d && d.readAsset) {
      d.readAsset(rel).then((b) => { if (!b) { rej(new Error('yok: ' + rel)); return; } const url = URL.createObjectURL(new Blob([b], { type: 'image/webp' })); img.onload = () => { URL.revokeObjectURL(url); res(img); }; img.src = url; }, rej);
    } else { img.onload = () => res(img); img.src = 'assets/' + rel; }
  });
}
// Yükleme ekranı bekler; veri yoksa (ör. node testleri) oyun kodla üretilen gövdelerle açılır.
export function mhReady(timeoutMs = 20000) {
  if (!ready) {
    ready = typeof window === 'undefined' ? Promise.resolve(false) : Promise.race([
      Promise.all([readBin('mh/mh.bin'), readImage('mh/mh.webp')]).then(([buf, img]) => {
        const n = new DataView(buf).getUint32(0, true);
        HEAD = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n)));
        BUF = buf; BASE0 = 4 + n;
        TEX = new THREE.Texture(img); TEX.colorSpace = THREE.SRGBColorSpace; TEX.anisotropy = 4; TEX.needsUpdate = true;
        return true;
      }).catch(() => false),
      new Promise((r) => setTimeout(() => r(false), timeoutMs)),
    ]);
  }
  return ready;
}
export function setMH(on) { OFF = !on; }
export const mhEnabled = () => !!HEAD && !OFF;
export const mhTexture = () => TEX;
export const mhHead = () => HEAD;

// gövde tipi: görünüş ölçülerinden (cinsiyet, yağ, yaş, kas, yapı)
export function mhVariant(f, fat, age, mu, bk) {
  if (!mhEnabled()) return null;
  const n = f ? (age >= 0.5 ? 'f_old' : fat >= 0.5 ? 'f_heavy' : bk <= 0.92 ? 'f_slim' : 'f_avg')
    : (age >= 0.5 ? (fat >= 0.5 ? 'm_oldheavy' : 'm_old') : fat >= 0.5 ? 'm_heavy' : mu >= 0.5 ? 'm_musc' : bk <= 0.92 ? 'm_slim' : 'm_avg');
  return { name: n, info: HEAD.variants[n] };
}

const VAR = new Map();
function variant(name) {
  let v = VAR.get(name);
  if (!v) {
    const info = HEAD.variants[name], q = arr(info.pos_q), P = new Float32Array(q.length), k = 1 / HEAD.q;
    for (let i = 0; i < q.length; i++) P[i] = q[i] * k;
    v = { P, M: arr(info.xf), info }; VAR.set(name, v);
  }
  return v;
}
const PART = new Map();
function part(name) {
  let p = PART.get(name);
  if (!p) {
    const h = name === '@body' ? HEAD.body : HEAD.parts[name];
    p = { h, ref: arr(h.ref), w: arr(h.w), off: arr(h.off), wi: arr(h.wi), ww: arr(h.ww), rv_v: arr(h.rv_v), rv_uv: arr(h.rv_uv), rv_slot: arr(h.rv_slot), tri: h.tri.map(arr), del: arr(h.del), beard: h === HEAD.body ? arr(HEAD.body_masks.beard) : null, stache: h === HEAD.body ? arr(HEAD.body_masks.stache) : null };
    PART.set(name, p);
  }
  return p;
}

// doğrusal karışımlı deri: src (n köşe, dm) -> dst (birim uzay)
function lbs(src, n, wi, ww, M, dst) {
  for (let i = 0; i < n; i++) {
    const x = src[i * 3], y = src[i * 3 + 1], z = src[i * 3 + 2];
    let ox = 0, oy = 0, oz = 0;
    for (let j = 0; j < 4; j++) {
      const w = ww[i * 4 + j]; if (!w) continue;
      const b = wi[i * 4 + j] * 12, k = w / 255;
      ox += k * (M[b] * x + M[b + 1] * y + M[b + 2] * z + M[b + 3]);
      oy += k * (M[b + 4] * x + M[b + 5] * y + M[b + 6] * z + M[b + 7]);
      oz += k * (M[b + 8] * x + M[b + 9] * y + M[b + 10] * z + M[b + 11]);
    }
    dst[i * 3] = ox; dst[i * 3 + 1] = oy; dst[i * 3 + 2] = oz;
  }
}

const SHAPES = new Map();
// [donma] Yeni gövde birleştirmesi ~90 ms (5★'da aynı karede onlarca asker: saniyelerce donma). Kare bütçesi: 45 ms içinde
// ikinci bir yeni şekil kurulmaz; bekleyen model aynı gövde tipinin son kurulan şekliyle görünür, sonra kendi şekline geçer.
const BUILD = { t: -1e9 }, BYVAR = new Map();
const shapeKey = (spec) => [spec.variant, spec.skin, spec.outfit, spec.shoes, spec.hair, spec.brow, spec.accKey, spec.cut || 0, spec.shoeDel || ''].join('|');
let DEFER = true;
export function setMHDefer(on) { DEFER = on; }
export function mhShouldDefer(spec) { return DEFER && !SHAPES.has(shapeKey(spec)) && BYVAR.has(spec.variant) && performance.now() - BUILD.t < 45; }
// spec: { variant, skin, outfit, shoes, hair, brow, accKey }, acc: kodla üretilen aksesuar geometrisi (şapka, gözlük, yelek) ya da null
// accMap: { head: {c:[x,y,z], r:[rx,ry,rz]}, torso: {rx, rf, rb} } — aksesuarın oturduğu kodla üretilmiş baş/gövde ölçüleri
// [S2] kol kemiği -> eklem çifti (eşleme ekseni)
const ARMB = new Set(), ARMM = {};
function initArm() {
  if (ARMB.size || !HEAD) return;
  for (const S of ['L', 'R']) {
  const add = (b, j0, j1) => { const i = HEAD.bones ? HEAD.bones.indexOf(b + S) : -1; if (i >= 0) { ARMB.add(i); ARMM[i] = { j0: j0 + S, j1: j1 + S }; } };
  add('kn', 'an', 'toe'); add('an', 'an', 'toe'); add('toe', 'an', 'toe'); for (const b of ['kn', 'an', 'toe']) ARMM[HEAD.bones.indexOf(b + S)].foot = true; // [S2] ayakkabı
  add('sh', 'sh', 'el'); add('el', 'el', 'wr'); add('fa', 'el', 'wr'); add('wr', 'wr', 'fd'); add('fi', 'wr', 'fd'); add('fd', 'wr', 'fd'); add('th', 'wr', 'fd');
  }
}
// a yönünü b yönüne çeviren döndürme matrisi (satır düzeni)
function rotBetween(ax, ay, az, bx, by, bz) {
  const la = Math.hypot(ax, ay, az) || 1, lb = Math.hypot(bx, by, bz) || 1; ax /= la; ay /= la; az /= la; bx /= lb; by /= lb; bz /= lb;
  const vx = ay * bz - az * by, vy = az * bx - ax * bz, vz = ax * by - ay * bx, c = ax * bx + ay * by + az * bz, k = 1 / (1 + c + 1e-9);
  return [vx * vx * k + c, vx * vy * k - vz, vx * vz * k + vy, vy * vx * k + vz, vy * vy * k + c, vy * vz * k - vx, vz * vx * k - vy, vz * vy * k + vx, vz * vz * k + c];
}
function shape(spec, acc, accMap) {
  const key = shapeKey(spec);
  let S = SHAPES.get(key);
  if (S) return S;
  if (spec.defer) return SHAPES.get(BYVAR.get(spec.variant));
  const V = variant(spec.variant), body = part('@body');
  const names = [spec.outfit, spec.shoes, spec.hair, 'Low-Poly', spec.brow, 'eyelashes02'].filter((n) => n && HEAD.parts[n]);
  const parts = names.map(part);
  let n = body.rv_v.length; for (const p of parts) n += p.rv_v.length;
  const an = acc ? acc.attributes.position.count : 0, N = n + an;
  const pos = new Float32Array(N * 3), nrm = new Float32Array(N * 3), uv = new Float32Array(N * 2), matp = new Float32Array(N * 3);
  const si = new Uint8Array(N * 4), sw = new Uint8Array(N * 4), slot = new Uint8Array(N), bw = new Uint8Array(N), mw = new Uint8Array(N), accCol = acc ? new Float32Array(an * 3) : null;
  const AW = HEAD.atlas.w, AH = HEAD.atlas.h;
  // [S2] şort/mini: kıyafetin alt (yuva 2) kısmı spec.cut yüksekliğinin altında kesilir; altında kalan bacak derisi gizlenmez
  const cut = spec.cut || 0, BP = new Float32Array(HEAD.nv * 3);
  lbs(V.P, HEAD.nv, body.wi, body.ww, V.M, BP);
  const del = new Uint8Array(HEAD.nv);
  if (spec.shoeDel && HEAD.parts[spec.shoeDel]) { const p = part(spec.shoeDel); if (p.del) for (let i = 0; i < del.length; i++) del[i] |= p.del[i]; } // [S2] taşınan ayakkabının içinde çıplak ayak gizlenir
  for (let k = 0; k < parts.length; k++) {
    const p = parts[k]; if (!p.del) continue;
    const isOut = cut && names[k] === spec.outfit;
    for (let i = 0; i < del.length; i++) if (p.del[i] && !(isOut && BP[i * 3 + 1] < cut + 0.035)) del[i] = 1; // 3,5 cm bindirme: paça ile deri arasında boşluk kalmasın
  }
  const idx = [[], [], []];
  let o = 0;
  const emit = (p, P3, nv, rect, rough, slotArr, isBody, cutY) => {
    // köşe normalleri: kaynaklı köşeler üzerinde (uv dikişi ışık dikişi olmasın)
    const N3 = new Float32Array(nv * 3), t0 = p.tri[0], rv = p.rv_v;
    for (let i = 0; i < t0.length; i += 3) {
      const a = rv[t0[i]] * 3, b = rv[t0[i + 1]] * 3, c = rv[t0[i + 2]] * 3;
      const ux = P3[b] - P3[a], uy = P3[b + 1] - P3[a + 1], uz = P3[b + 2] - P3[a + 2], vx = P3[c] - P3[a], vy = P3[c + 1] - P3[a + 1], vz = P3[c + 2] - P3[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      N3[a] += nx; N3[a + 1] += ny; N3[a + 2] += nz; N3[b] += nx; N3[b + 1] += ny; N3[b + 2] += nz; N3[c] += nx; N3[c + 1] += ny; N3[c + 2] += nz;
    }
    const m = rv.length, e = 0.75 / rect[2];
    for (let i = 0; i < m; i++) {
      const s = rv[i] * 3, d = (o + i) * 3;
      pos[d] = P3[s]; pos[d + 1] = P3[s + 1]; pos[d + 2] = P3[s + 2];
      const l = Math.hypot(N3[s], N3[s + 1], N3[s + 2]) || 1;
      nrm[d] = N3[s] / l; nrm[d + 1] = N3[s + 1] / l; nrm[d + 2] = N3[s + 2] / l;
      const u = Math.min(1 - e, Math.max(e, p.rv_uv[i * 2] / 65535)), v = Math.min(1 - e, Math.max(e, p.rv_uv[i * 2 + 1] / 65535));
      uv[(o + i) * 2] = (rect[0] + u * rect[2]) / AW; uv[(o + i) * 2 + 1] = 1 - (rect[1] + (1 - v) * rect[2]) / AH;
      matp[d] = p.h.fx ? -2 : -1; matp[d + 1] = rough; matp[d + 2] = 0;
      if (isBody) { bw[o + i] = p.beard[rv[i]]; mw[o + i] = p.stache[rv[i]]; }
      for (let j = 0; j < 4; j++) { si[(o + i) * 4 + j] = p.wi[rv[i] * 4 + j]; sw[(o + i) * 4 + j] = p.ww[rv[i] * 4 + j]; }
      slot[o + i] = slotArr ? slotArr[i] : 0;
    }
    for (let l = 0; l < 3; l++) {
      const t = p.tri[l], out = idx[l];
      for (let i = 0; i < t.length; i += 3) {
        const a = t[i], b = t[i + 1], c = t[i + 2];
        if (isBody && (del[rv[a]] || del[rv[b]] || del[rv[c]])) continue;
        if (cutY && Math.min(P3[rv[a] * 3 + 1], P3[rv[b] * 3 + 1], P3[rv[c] * 3 + 1]) < cutY) continue;
        out.push(o + a, o + b, o + c);
        if (p.h.dbl) out.push(o + a, o + c, o + b);
      }
    }
    o += m;
  };
  // gövde
  emit(body, BP, HEAD.nv, HEAD.skins[spec.skin].rect, 0.62, null, true);
  // parçalar: gövdeye oturt (üç başvuru köşesi + kayma), sonra deri
  for (let k = 0; k < parts.length; k++) {
    const p = parts[k], m = p.h.n, F = new Float32Array(m * 3), Q = new Float32Array(m * 3), P = V.P;
    for (let i = 0; i < m; i++) {
      const a = p.ref[i * 3] * 3, b = p.ref[i * 3 + 1] * 3, c = p.ref[i * 3 + 2] * 3, wa = p.w[i * 3], wb = p.w[i * 3 + 1], wc = p.w[i * 3 + 2];
      F[i * 3] = wa * P[a] + wb * P[b] + wc * P[c] + p.off[i * 3];
      F[i * 3 + 1] = wa * P[a + 1] + wb * P[b + 1] + wc * P[c + 1] + p.off[i * 3 + 1];
      F[i * 3 + 2] = wa * P[a + 2] + wb * P[b + 2] + wc * P[c + 2] + p.off[i * 3 + 2];
    }
    lbs(F, m, p.wi, p.ww, V.M, Q);
    emit(p, Q, m, p.h.rect, p.h.rough, p.rv_slot, false, names[k] === spec.outfit ? cut : 0);
  }
  // ayak tabanı yere otursun (ayakkabı tabanı kalınlığı parçaya göre değişir)
  let minY = 1e9; for (let i = 0; i < n; i++) if (pos[i * 3 + 1] < minY) minY = pos[i * 3 + 1];
  const AN = [HEAD.bones.indexOf('anL'), HEAD.bones.indexOf('toeL'), HEAD.bones.indexOf('anR'), HEAD.bones.indexOf('toeR')];
  for (let i = 0; i < n; i++) {
    let k = 0; for (let j = 0; j < 4; j++) if (AN.includes(si[i * 4 + j])) k += sw[i * 4 + j];
    if (k) pos[i * 3 + 1] -= minY * (k / 255);
  }
  // aksesuarlar: kodla üretilmiş baş/gövde ölçüsünden gerçek gövdeye taşı
  if (acc) {
    initArm();
    const A = acc.attributes, ap = A.position.array, anr = A.normal.array, auv = A.uv.array, ac = A.color.array, am = A.matp.array, asi = A.skinIndex.array, asw = A.skinWeight.array;
    const hd = V.info.hd, ts = V.info.ts, H = accMap.head, T = accMap.torso, HB = HEAD.bones.indexOf('head'), NB = HEAD.bones.indexOf('neck');
    const hc = [0, (hd.top + hd.chin) / 2, (hd.zf + hd.zb) / 2], hr = [hd.rx + 0.004, (hd.top - hd.chin) / 2, (hd.zf - hd.zb) / 2];
    const tcz = (ts.zf + ts.zb) / 2, trz = (ts.zf - ts.zb) / 2 + 0.012, prz = (T.rf + T.rb) / 2, pcz = (T.rf - T.rb) / 2;
    const CJ = accMap.joints || null, MJ = V.info.pos, ROT = {};
    const armRot = (a0, a1, b0, b1) => { const k = a0 + '' + b0; return ROT[k] || (ROT[k] = rotBetween(a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2], b1[0] - b0[0], b1[1] - b0[1], b1[2] - b0[2])); };
    let GL = null, HT = null; const FK = accMap.footK || 1;
    if (accMap.glasses && V.info.eye) {
      // eşlenmiş kod göz hizası ile gerçek göz arasındaki fark; mercek gözün 1,4 cm önünde
      const ey = hc[1] + (accMap.eyeY - H.c[1]) * (hr[1] / H.r[1]), ez = hc[2] + (accMap.eyeZ - H.c[2]) * (hr[2] / H.r[2]);
      GL = [V.info.eye[1] + 0.002 - ey, Math.max(0, V.info.eye[2] + 0.016 - ez)];
    }
    if (accMap.hat) HT = accMap.hat;
    const shTop = V.info.pos.shL[1] + 0.045, sy = (shTop - 0.92) / (1.475 - 0.92), sx = (ts.rx + 0.012) / T.rx;
    for (let i = 0; i < an; i++) {
      let x = ap[i * 3], y = ap[i * 3 + 1], z = ap[i * 3 + 2], hw = 0;
      for (let j = 0; j < 4; j++) { const b = asi[i * 4 + j]; if (b === HB || b === NB) hw += asw[i * 4 + j]; }
      let ab = -1, aw = 0; // [S2] baskın kol/el kemiği (saat, yüzük, tespih, el çantası)
      for (let j = 0; j < 4; j++) { const b = asi[i * 4 + j], w = asw[i * 4 + j]; if (ARMB.has(b) && w > aw) { aw = w; ab = b; } }
      if (hw > 0.5) {
        const y0 = y, z0 = z;
        x = hc[0] + (x - H.c[0]) * (hr[0] / H.r[0]); y = hc[1] + (y - H.c[1]) * (hr[1] / H.r[1]); z = hc[2] + (z - H.c[2]) * (hr[2] / H.r[2]);
        // [S2] gözlük: kodla üretilen göz hizası gerçek gövdenin gözüne taşınır (eskiden ~1 cm yukarıda, kaşta kalıyordu)
        if (GL && Math.abs(y0 - accMap.eyeY) < 0.03 && z0 > H.c[2] - 0.06) { y += GL[0]; z += GL[1]; }
        // [S2] şapka/bere: saç hacmini de sarsın diye baş merkezine göre büyütülür ve alına indirilir (eskiden saç taşıyor, siperlik havada kalıyordu)
        else if (HT && y0 > accMap.eyeY + 0.035) { x = hc[0] + (x - hc[0]) * HT[0]; y = hc[1] + (y - hc[1]) * HT[0] + HT[1]; z = hc[2] + (z - hc[2]) * HT[0]; }
      } else if (ab >= 0 && aw > 0.5 && CJ) {
        // [S2] kol/el: kodla üretilen kol ekseninden gerçek kolun eksenine (eklem + yön döndürmesi)
        const M = ARMM[ab]; x -= CJ[M.j0][0]; y -= CJ[M.j0][1]; z -= CJ[M.j0][2];
        const r = armRot(CJ[M.j0], CJ[M.j1], MJ[M.j0], MJ[M.j1]);
        const rx = r[0] * x + r[1] * y + r[2] * z, ry = r[3] * x + r[4] * y + r[5] * z, rz = r[6] * x + r[7] * y + r[8] * z;
        x = MJ[M.j0][0] + rx; y = MJ[M.j0][1] + ry; z = MJ[M.j0][2] + rz;
        // [S2] kodla üretilen ayakkabı gerçek ayaktan küçük (parmaklar deliyordu): bilek çevresinde %14 büyüt; basket botu yakası paçanın altında kalsın
        if (M.foot && FK > 1) { x = MJ[M.j0][0] + rx * FK; z = MJ[M.j0][2] + rz * FK + 0.006; y = y > 0.14 ? 0.14 + (y - 0.14) * 0.25 : y; }
      } else {
        x *= sx; y = 0.92 + (y - 0.92) * sy; z = tcz + (z - pcz) * (trz / prz);
      }
      const d = (n + i) * 3;
      pos[d] = x; pos[d + 1] = y; pos[d + 2] = z; nrm[d] = anr[i * 3]; nrm[d + 1] = anr[i * 3 + 1]; nrm[d + 2] = anr[i * 3 + 2];
      uv[(n + i) * 2] = auv[i * 2]; uv[(n + i) * 2 + 1] = auv[i * 2 + 1];
      matp[d] = am[i * 3] < -0.5 ? 12 : am[i * 3]; matp[d + 1] = am[i * 3 + 1]; matp[d + 2] = am[i * 3 + 2];
      accCol[i * 3] = ac[i * 3]; accCol[i * 3 + 1] = ac[i * 3 + 1]; accCol[i * 3 + 2] = ac[i * 3 + 2];
      for (let j = 0; j < 4; j++) { si[(n + i) * 4 + j] = asi[i * 4 + j]; sw[(n + i) * 4 + j] = Math.round(asw[i * 4 + j] * 255); }
      slot[n + i] = 255;
    }
    const ai = acc.index.array;
    for (let l = 0; l < 3; l++) for (let i = 0; i < ai.length; i++) idx[l].push(n + ai[i]);
  }
  const BA = (a, k, norm) => new THREE.BufferAttribute(a, k, !!norm);
  S = {
    n, N, slot, bw, mw, accCol, tris: idx.map((a) => a.length / 3),
    attrs: { position: BA(pos, 3), normal: BA(nrm, 3), uv: BA(uv, 2), matp: BA(matp, 3), skinIndex: BA(si, 4), skinWeight: BA(sw, 4, true) },
    index: idx.map((a) => BA(N > 65535 ? new Uint32Array(a) : new Uint16Array(a), 1)),
  };
  SHAPES.set(key, S); BYVAR.set(spec.variant, key); BUILD.t = performance.now();
  return S;
}

// spec.colors: yuva -> doğrusal [r,g,b] (0 ten çarpanı, 1 üst, 2 alt, 3 gömlek, 4 ayakkabı, 5 saç)
const DEFG = new Map(); // [donma] geçici şekil geometrileri: gövde tipi + düzey başına bir tane (model başına üretmek ekran kartı belleğini sızdırıyordu)
export function mhGeometry(spec, lod, acc, accMap) {
  if (spec.defer) {
    const k = BYVAR.get(spec.variant) + '|' + lod; let g = DEFG.get(k);
    if (!g) { g = mhGeometryRaw(spec, lod, acc, accMap); DEFG.set(k, g); }
    return g;
  }
  return mhGeometryRaw(spec, lod, acc, accMap);
}
function mhGeometryRaw(spec, lod, acc, accMap) {
  const S = shape(spec, acc, accMap), N = S.N, col = new Float32Array(N * 3), C = spec.colors, BK = BEARD[spec.beard];
  for (let i = 0; i < N; i++) {
    const s = S.slot[i];
    if (s === 255) { const j = (i - S.n) * 3; col[i * 3] = S.accCol[j]; col[i * 3 + 1] = S.accCol[j + 1]; col[i * 3 + 2] = S.accCol[j + 2]; continue; }
    const c = C[s] || WHITE;
    let r = c[0], g = c[1], b = c[2];
    if (s === 0 && BK) { // sakal/bıyık: ten rengi saç rengine doğru koyulaşır
      const k = Math.min(1, (BK[0] * S.bw[i] + BK[1] * S.mw[i]) / 255);
      if (k > 0.004) {
        const st = spec.beard === 'stubble' ? 0.55 : 0; // kirli sakal: saç rengi yerine koyulaşmış ten (gri leke olmasın)
        r += (spec.beardCol[0] * (1 - st) + c[0] * 0.5 * st - r) * k; g += (spec.beardCol[1] * (1 - st) + c[1] * 0.46 * st - g) * k; b += (spec.beardCol[2] * (1 - st) + c[2] * 0.44 * st - b) * k;
      }
    }
    col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
  }
  const g = new THREE.BufferGeometry();
  for (const k in S.attrs) g.setAttribute(k, S.attrs[k]);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(S.index[Math.min(2, Math.max(0, lod))]);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.0);
  g.boundingBox = new THREE.Box3(new THREE.Vector3(-1.2, -0.2, -1.2), new THREE.Vector3(1.2, 2.2, 1.2));
  g.userData = { verts: N, tris: S.tris[Math.min(2, Math.max(0, lod))], shared: true, deferred: !!spec.defer };
  return g;
}
const WHITE = [1, 1, 1];
// [sakal bölgesi, bıyık bölgesi] koyuluğu
const BEARD = { stubble: [0.5, 0.45], mustache: [0, 0.9], full: [0.9, 0.9], keci: [0.5, 0.9] };

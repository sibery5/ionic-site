// Binalar: parça (chunk) bazlı örneklenmiş gövdeler (iç mekân yanılsamalı cephe şaderi), parça başına
// birleşik çatı + saçak/parapet/korniş geometrisi ve yakın LOD cephe ayrıntıları (balkon, korkuluk,
// denizlik, kapı, tabela, tente, klima, çanak anten, güneş enerjili su ısıtıcı, çamaşır ipi, grafiti).
import * as THREE from 'three';
import { RNG } from '../core/util.js';
import { signAtlas } from '../core/textures.js';
import { facadeMaterial, roofMaterial, SHARED } from './shaders.js';
import { GeoBuilder, ChunkInstancer, ChunkMerger } from './instancer.js';

export const PALETTE = ['#e8dcc0', '#d9b98c', '#e3a982', '#f1e3a7', '#c9c3b8', '#efece4', '#b8c9a8', '#c97b5a', '#d8a7a0', '#a9b8c9', '#e7c9a0', '#cfa77a', '#9fa7a0', '#f0d0b0', '#bfae9a'];
const OTTOMAN = ['#c9a27a', '#8fa8b8', '#d8c8a0', '#b86a4a', '#e8dcc8', '#9ab090', '#d0a0a0', '#7a5a42'];
export const SHOP_SIGNS = ['BÖREKÇİ', 'ECZANE', 'LOKANTA', 'KUAFÖR', 'KEBAPÇI', 'BERBER', 'KASAP', 'MANAV', 'SİMİTÇİ', 'TERZİ', 'KIRTASİYE', 'BAKLAVACI', 'ÇİÇEKÇİ', 'KUYUMCU', 'TEKEL', 'NALBUR'];
const SIGN_COLORS = ['#8b1a1a', '#1d3d6e', '#2d5a2d', '#5a2d5a', '#6e4b1d', '#1d5a5a', '#333333', '#7a1f3d'];
export const SPECIAL_INFO = {
  safehouse: { label: 'GÜVENLİ EV', bg: '#1a1a1a', fg: '#d4af37' },
  konak: { label: 'REİS KONAĞI', bg: '#3a0d0d', fg: '#d4af37' },
  gun: { label: 'SİLAHÇI', bg: '#2b2b2b', fg: '#ff4a3d' },
  clothes: { label: 'BUTİK', bg: '#4a1d4a', fg: '#ffd1f0' },
  food: { label: 'BAKKAL', bg: '#1d5a2d', fg: '#fff3b0' },
  trade: { label: 'KARABORSA', bg: '#0d0d0d', fg: '#7cff8a' },
  dealer: { label: 'OTO GALERİ', bg: '#0d2a4a', fg: '#9fd4ff' },
  bank: { label: 'BANKA', bg: '#0d3a2a', fg: '#d4af37' },
  hospital: { label: 'HASTANE', bg: '#ffffff', fg: '#d01010' },
  police: { label: 'EMNİYET MÜDÜRLÜĞÜ', bg: '#0d2a6e', fg: '#ffffff', style: 'police' },
  estate: { label: 'EMLAK', bg: '#5a3d0d', fg: '#ffe9b0' },
  cafe: { label: 'ÇAY OCAĞI', bg: '#7a1414', fg: '#ffe9b0' },
  club: { label: 'GECE KULÜBÜ', bg: '#1a0033', fg: '#ff3df0' },
  warehouse: { label: 'DEPO', bg: '#3a3a3a', fg: '#ffcc00' },
  rival: { label: 'KÖŞK', bg: '#0d0d0d', fg: '#cccccc' },
  garage: { label: 'OTO TAMİR', bg: '#3a2a0d', fg: '#ffcc00' },
  mosque_small: { label: '', bg: '#000', fg: '#fff' },
  villa: { label: '', bg: '#000', fg: '#fff' },
};
export const SPECIAL_COLORS = {
  safehouse: '#d8c8a8', konak: '#e8e0d0', gun: '#7a7a72', clothes: '#e8c8d8', food: '#e8e0a8', trade: '#5a564e', dealer: '#c8d8e8', bank: '#d8d8d0',
  hospital: '#f0f0f0', police: '#d8dde4', estate: '#e0c8a0', cafe: '#d8a888', club: '#3a2a4a', warehouse: '#8a8274', rival: '#e8e8e8', garage: '#9a9080', mosque_small: '#e8e4dc', villa: '#f2efe8',
};
const SHOP_TYPES = new Set(['gun', 'clothes', 'food', 'trade', 'dealer', 'bank', 'cafe', 'club', 'estate', 'garage']);
const STYLE_ID = { plaster: 0, brick: 1, official: 2, ottoman: 3, glass: 4, villa: 5 };

export function signEntries() {
  const e = SHOP_SIGNS.map((n, i) => ['shop:' + n, n, SIGN_COLORS[i % SIGN_COLORS.length], '#fff2c0']);
  for (const [k, v] of Object.entries(SPECIAL_INFO)) if (v.label) e.push(['sp:' + k, v.label, v.bg, v.fg, v.style]);
  e.push(['polis', 'POLİS', '#0d2a6e', '#ffffff', 'police']);
  e.push(['marina', 'BEBEK MARİNA · YAT KULÜBÜ', '#0d2a4a', '#f2c14e']);
  e.push(['airport', 'BOĞAZİÇİ HAVALİMANI', '#1a1a1a', '#f2c14e']);
  e.push(['hangar', 'HANGAR · UÇAK / HELİKOPTER SATIŞ', '#13294b', '#ffffff']);
  e.push(['military', 'T.C. ASKERİ BÖLGE', '#3a4a2a', '#ffffff']);
  e.push(['villa', 'SATILIK YALI', '#5a3d0d', '#ffe9b0']);
  return e;
}

export function signMaterial(tex) {
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = SHARED.uNight;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aUV;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n vMapUv = vec2(mix(aUV.x, aUV.z, uv.x), mix(aUV.y, aUV.w, uv.y));');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * (0.08 + uNight * 0.9);');
  };
  mat.customProgramCacheKey = () => 'signAtlasMat';
  return mat;
}

// Kalça (hip) çatı geometrisi: saçak taşmalı, mahya uzun eksende
function hipRoof(x0, z0, x1, z1, y, over, slope, kind, col) {
  x0 -= over; z0 -= over; x1 += over; z1 += over;
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const rh = Math.min(Math.min(w, d) * slope, 6);
  const P = [];
  let r0, r1;
  if (w >= d) { const hl = (w - d) / 2; r0 = [cx - hl, y + rh, cz]; r1 = [cx + hl, y + rh, cz]; }
  else { const hl = (d - w) / 2; r0 = [cx, y + rh, cz - hl]; r1 = [cx, y + rh, cz + hl]; }
  const A = [x0, y, z0], B = [x1, y, z0], C = [x1, y, z1], D = [x0, y, z1];
  const tri = (a, b, c) => P.push(...a, ...b, ...c);
  if (w >= d) {
    tri(A, r0, B); tri(B, r0, r1); // kuzey (-z)
    tri(C, r1, D); tri(D, r1, r0); // güney
    tri(D, r0, A); tri(B, r1, C); // uçlar
  } else {
    tri(A, D, r0); tri(D, r1, r0); // batı
    tri(B, r0, C); tri(C, r0, r1); // doğu
    tri(A, r0, B); tri(C, r1, D);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  // saçak altı (aşağı bakan)
  const s = new THREE.PlaneGeometry(w, d); s.rotateX(Math.PI / 2); s.translate(cx, y - 0.02, cz);
  const so = s.toNonIndexed(); so.deleteAttribute('uv');
  return [finish(g, kind, col), finish(so, 1, [0.85, 0.82, 0.78])];
}
function finish(g, kind, col) {
  if (g.index) g = g.toNonIndexed();
  if (g.attributes.uv) g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3), k = new Float32Array(n);
  for (let i = 0; i < n; i++) { c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2]; k[i] = kind; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('aKind', new THREE.BufferAttribute(k, 1));
  return g;
}
function boxG(w, h, d, x, y, z, kind, col) {
  const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z);
  return finish(g, kind, col);
}

// JS tarafında şaderle aynı pencere sütunu hesabı
function colsFor(L, st) {
  const cwT = st === 3 ? 2.5 : st === 5 ? 3.6 : 3.1;
  const n = Math.max(1, Math.floor(L / cwT + 0.35));
  return { n, cw: L / n };
}

export function buildBuildings(city) {
  const { map, physics, quality } = city;
  const cols = physics.city;
  const r = new RNG(2024);
  const group = city.group;
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
  // alt yüzü sil (görünmez)
  const shells = new ChunkInstancer(box, facadeMaterial(quality), { attrs: { aStyle: 4, aInfo: 4 } });
  const roofs = new ChunkMerger();
  const atlas = signAtlas(signEntries());
  const signs = new ChunkInstancer(new THREE.PlaneGeometry(1, 1), signMaterial(atlas.tex), { shadow: false, attrs: { aUV: 4 }, chunk: 1000 });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  const P = city.props;

  for (const b of map.buildings) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const style = b.tower ? 4 : STYLE_ID[b.style] ?? 0;
    const dd = b.door, nx = dd.nx || 0, nz = dd.nz || 0;
    const fcode = nz > 0 ? 0 : nz < 0 ? 1 : nx > 0 ? 2 : 3;
    const special = b.type !== 'apartment';
    let flags = 0;
    if ((b.sign >= 0 || SHOP_TYPES.has(b.type)) && style !== 4 && style !== 5) flags |= 1;
    if (style !== 5 && style !== 4 && r.chance(0.65)) flags |= 4;
    if (b.type === 'police') flags |= 8;
    const age = b.district && (b.district.id === 'fatih' || b.district.id === 'eyup' || b.district.id === 'beyoglu') ? r.float(0.3, 1) : r.float(0, 0.7);
    // renk
    if (style === 4) col.set(['#8fa3b5', '#6f8597', '#a9b6bf', '#556b7d'][b.colorIdx % 4]);
    else if (special && SPECIAL_COLORS[b.type]) col.set(SPECIAL_COLORS[b.type]);
    else if (style === 3) col.set(OTTOMAN[b.colorIdx % OTTOMAN.length]);
    else col.set(PALETTE[b.colorIdx % PALETTE.length]);
    const L = fcode < 2 ? w : d;
    const { n: ncol, cw } = colsFor(L, style);
    // balkon sütunları
    let bmask = 0;
    const balc = (style === 0 || style === 1 || style === 5) && !b.tower && b.floors >= 2 && r.chance(style === 5 ? 0.9 : 0.55);
    if (balc) { const pat = r.int(0, 2); for (let i = 0; i < Math.min(ncol, 15); i++) if (pat === 0 ? i % 2 === 1 || ncol < 3 : pat === 1 ? i === 0 || i === ncol - 1 : r.chance(0.5)) bmask |= 1 << i; }
    m.compose(v3.set(cx, 0, cz), q.identity(), s3.set(w, b.h, d));
    shells.add(m, col, { aStyle: [style, (b.colorIdx % 997) / 997, fcode, flags], aInfo: [bmask, 3.8, 3.2, age] });
    cols.add(b.x0, b.z0, b.x1, b.z1, 0, b.h, b);
    const wallCol = [col.r, col.g, col.b];
    const trimCol = style === 3 ? [0.93, 0.91, 0.86] : [Math.min(1, col.r * 1.1 + 0.08), Math.min(1, col.g * 1.1 + 0.08), Math.min(1, col.b * 1.1 + 0.07)];
    const fwd = [nx, nz];
    const frontPos = (along, out) => fcode === 0 ? [b.x0 + along, b.z1 + out] : fcode === 1 ? [b.x1 - along, b.z0 - out] : fcode === 2 ? [b.x1 + out, b.z1 - along] : [b.x0 - out, b.z0 + along];
    const rotY = fcode === 0 ? 0 : fcode === 1 ? Math.PI : fcode === 2 ? Math.PI / 2 : -Math.PI / 2;

    // ---- çatı ----
    if (b.roof === 'pyramid' || b.roof === 'hip') {
      const tint = r.float(0.82, 1.08), old = r.chance(0.25) ? 0.82 : 1;
      const tc = [tint * old, tint * old * r.float(0.92, 1.02), tint * old * r.float(0.88, 1)];
      for (const g of hipRoof(b.x0, b.z0, b.x1, b.z1, b.h, style === 3 ? 1.1 : 0.45, style === 3 ? 0.24 : 0.3, 0, tc)) roofs.add(g, cx, cz);
      if (style !== 3) roofs.add(boxG(w + 0.3, 0.3, d + 0.3, cx, b.h - 0.32, cz, 1, trimCol), cx, cz);
      if (r.chance(0.6)) roofs.add(boxG(0.6, 1.8, 0.6, b.x0 + w * r.float(0.25, 0.75), b.h, b.z0 + d * r.float(0.3, 0.7), 1, [0.6, 0.36, 0.28]), cx, cz);
    } else if (b.roof === 'flat') {
      const pc = style === 4 ? [0.3, 0.33, 0.36] : trimCol, t = 0.25, ph = 0.85;
      roofs.add(boxG(w, ph, t, cx, b.h, b.z0 + t / 2, style === 4 ? 2 : 1, pc), cx, cz);
      roofs.add(boxG(w, ph, t, cx, b.h, b.z1 - t / 2, style === 4 ? 2 : 1, pc), cx, cz);
      roofs.add(boxG(t, ph, d - 2 * t, b.x0 + t / 2, b.h, cz, style === 4 ? 2 : 1, pc), cx, cz);
      roofs.add(boxG(t, ph, d - 2 * t, b.x1 - t / 2, b.h, cz, style === 4 ? 2 : 1, pc), cx, cz);
      if (style !== 4) roofs.add(boxG(w + 0.5, 0.35, d + 0.5, cx, b.h - 0.4, cz, 1, trimCol), cx, cz); // korniş
      if (style === 4) {
        // kule tepesi: geri çekilmiş makine katı + anten
        roofs.add(boxG(w * 0.5, 4, d * 0.5, cx, b.h, cz, 2, [0.4, 0.45, 0.5]), cx, cz);
        if (b.floors > 25) roofs.add(boxG(0.4, 14, 0.4, cx, b.h + 4, cz, 1, [0.8, 0.8, 0.8]), cx, cz);
      } else {
        // güneş enerjili su ısıtıcısı / su deposu / çanak anten
        if (r.chance(0.45)) { const sx = b.x0 + r.float(2, Math.max(2.1, w - 3)), sz = b.z0 + r.float(2, Math.max(2.1, d - 3)); P.solar.addTRS(sx, b.h, sz, r.chance(0.5) ? 0 : Math.PI, 1, 1, 1); cols.add(sx - 1, sz - 0.75, sx + 1, sz + 0.75, b.h, b.h + 1.85, 'roofProp'); }
        if (r.chance(0.3)) { P.tank.addTRS(b.x0 + 1.6, b.h, b.z1 - 1.6, 0); cols.addCircle(b.x0 + 1.6, b.z1 - 1.6, 0.7, b.h, b.h + 1.7, 'roofProp'); }
      }
    } else if (b.roof === 'dome') {
      group.add(buildSmallMosqueTop(b));
      { const mw = Math.min(w, d); cols.addCircle(cx, cz, mw * 0.4, b.h, b.h + mw * 0.4, 'dome'); cols.addCircle(b.x1 - 1.2, b.z0 + 1.2, 0.8, 0, 26, 'minaret'); }
    }
    if (style !== 4 && r.chance(0.35)) {
      const [ax, az] = [b.x0 + r.float(1, Math.max(1.1, w - 1)), b.z0 + r.float(1, Math.max(1.1, d - 1))];
      P.dish.addTRS(ax, b.h + (b.roof === 'flat' ? 0 : Math.min(w, d) * 0.1), az, r.float(0, 6.28), 1, 1, 1);
    }

    // ---- cumba (çıkma) ----
    if (!b.tower && b.floors >= 2 && fcode < 2 && (style === 3 || (style === 0 && (b.district.id === 'beyoglu' || b.district.id === 'fatih') && r.chance(0.35)))) {
      const span = Math.min(ncol, ncol >= 3 ? 2 : 1);
      const c0 = Math.floor((ncol - span) / 2);
      const along0 = c0 * cw, wid = span * cw;
      const [px, pz] = frontPos(along0 + wid / 2, 0.45);
      const ch = b.h - 0.5 - 3.8;
      if (ch > 2.5) {
        m.compose(v3.set(px, 3.8, pz), q.identity(), s3.set(fcode < 2 ? wid : 0.9, ch, fcode < 2 ? 0.9 : wid));
        shells.add(m, col, { aStyle: [style, ((b.colorIdx * 7) % 997) / 997, fcode, 2], aInfo: [0, 0, 3.2, age * 0.6] });
        { const hw = (fcode < 2 ? wid : 0.9) / 2, hd = (fcode < 2 ? 0.9 : wid) / 2; cols.add(px - hw, pz - hd, px + hw, pz + hd, 3.45, 3.8 + ch + 0.2, 'cumba'); }
        // konsol (kademeli taban) + cumba çatısı
        roofs.add(boxG(fcode < 2 ? wid : 0.7, 0.35, fcode < 2 ? 0.7 : wid, px - nx * 0.1, 3.45, pz - nz * 0.1, 1, trimCol), cx, cz);
        roofs.add(boxG(fcode < 2 ? wid + 0.3 : 1.2, 0.2, fcode < 2 ? 1.2 : wid + 0.3, px, 3.8 + ch, pz, 1, trimCol), cx, cz);
        bmask = 0;
      }
    }

    // ---- balkonlar (yakın LOD) ----
    if (bmask && !b.tower) {
      for (let f = 1; f < b.floors; f++) for (let i = 0; i < Math.min(ncol, 15); i++) {
        if (!(bmask & (1 << i))) continue;
        const bw = Math.min(cw - 0.3, style === 5 ? 3.2 : 2.6);
        const [px, pz] = frontPos((i + 0.5) * cw, 0);
        const y = 3.8 + (f - 1) * 3.2;
        P.balcony.addTRS(px, y - 0.08, pz, rotY, bw, 1, 1, col.clone().lerp(new THREE.Color(1, 1, 1), 0.3));
        P[style === 5 ? 'glassrail' : 'railing'].addTRS(px, y, pz, rotY, bw, 1, 1);
        if (r.chance(0.12)) P.potted.addTRS(px + (fcode < 2 ? r.float(-bw / 3, bw / 3) : 0), y + 0.08, pz + (fcode >= 2 ? r.float(-bw / 3, bw / 3) : 0), rotY);
      }
    }
    // ---- klima dış üniteleri, denizlikler ----
    if (!b.tower && style !== 5) {
      for (let f = 1; f < b.floors; f++) for (let i = 0; i < ncol; i++) {
        if (bmask & (1 << i)) continue;
        const y = 3.8 + (f - 1) * 3.2;
        const [px, pz] = frontPos((i + 0.5) * cw, 0);
        P.sill.addTRS(px, y + 0.85 - 0.06, pz, rotY, Math.min(1.3, cw - 0.7) + 0.2, 1, 1);
        if (r.chance(0.07)) { const [ax, az] = frontPos((i + 0.5) * cw + 1.05, 0); P.ac.addTRS(ax, y + 0.3, az, rotY); }
      }
    }
    // ---- kapı ----
    P.door.addTRS(dd.x, 0.15, dd.z, rotY, 1, 1, 1, new THREE.Color(special ? '#6a4a1a' : ['#4a2c1a', '#2a3a4a', '#3a2a1a', '#5a1a1a', '#1a3a2a', '#e8e4dc'][b.colorIdx % 6]));
    city.doors.push({ x: dd.x + nx * 0.8, z: dd.z + nz * 0.8, building: b });
    // ---- tabela ve tente ----
    let key = null, sw = 4.2, sh = 0.8;
    if (special && SPECIAL_INFO[b.type] && SPECIAL_INFO[b.type].label) { key = 'sp:' + b.type; sw = Math.min(b.type === 'police' ? 7.5 : 5.5, L - 1); sh = b.type === 'police' ? 1.1 : 1.1; }
    else if (b.sign >= 0 && b.type === 'apartment') key = 'shop:' + SHOP_SIGNS[b.sign % SHOP_SIGNS.length];
    if (key && fcode < 2) {
      const off = b.type === 'apartment' && L > 9 ? 3.2 : 0;
      const [px, pz] = [dd.x + (nz > 0 ? off : -off), dd.z + nz * 0.13];
      q.setFromAxisAngle(up, rotY);
      m.compose(v3.set(px, 3.42, pz), q, s3.set(sw, sh, 1));
      signs.add(m, null, { aUV: atlas.uv(key) });
      if (b.type === 'apartment' || SHOP_TYPES.has(b.type)) P.awning.addTRS(px, 2.95, dd.z + nz * 0.05, rotY, sw / 4.2, 1, 1, new THREE.Color(['#a01818', '#1d5a2d', '#1d3d6e', '#c98a1a', '#6e1d5a', '#e0e0e0'][b.colorIdx % 6]));
    }
    if (b.type === 'bank' || (b.sign >= 0 && b.colorIdx % 9 === 0)) { const [ax, az] = frontPos(Math.min(L - 1, 1.2), 0.02); P.atm.addTRS(ax, 0.15, az, rotY); cols.addLocal(ax, az, rotY, 0, 0.18, 0.95, 0.38, 0, 1.85, 'atm'); }
    if (b.forSale && fcode < 2) { const [px, pz] = frontPos(L / 2, 0.06); P.forsale.addTRS(px, 4.6, pz, rotY); }
    // ---- grafiti: dükkânsız zemin kat cephesi ----
    if (!(flags & 1) && style !== 4 && style !== 5 && !special && r.chance(0.22) && fcode < 2) {
      const [px, pz] = frontPos(r.float(1.5, Math.max(1.6, L - 1.5)), 0.03);
      if (Math.abs(px - dd.x) + Math.abs(pz - dd.z) > 2.2) P['graf' + r.int(0, 3)].addTRS(px, 0.9, pz, rotY, r.float(1.3, 2.4), r.float(0.9, 1.4), 1);
    }
  }
  shells.finalize(group);
  const roofMeshes = roofs.finalize(group, roofMaterial(quality), { shadow: true });
  signs.finalize(group);
  city.buildingMeshes = { shells: shells.meshes, roofs: roofMeshes };
  buildLaundry(city, r);
}

// Karşılıklı cepheler arasında çamaşır ipleri (dar ara sokaklar)
function buildLaundry(city, r) {
  const { map } = city;
  const byBlock = new Map();
  for (const b of map.buildings) { if (!byBlock.has(b.block)) byBlock.set(b.block, []); byBlock.get(b.block).push(b); }
  const findFace = (x, z, dir) => {
    // z sabit cephe arar: x aralığına giren, ön yüzü z'ye yakın bina
    for (const b of map.buildings) {
      if (b.tower || b.floors < 3) continue;
      if (dir === 'z') { if (x > b.x0 + 1 && x < b.x1 - 1 && (Math.abs(b.z0 - z) < 1.8 || Math.abs(b.z1 - z) < 1.8)) return b; }
    }
    return null;
  };
  let n = 0;
  for (const rd of map.roads) {
    if (rd.w > 12 || rd.bridge || rd.z0 !== rd.z1) continue; // yalnız doğu-batı ara sokaklar (cepheler z'ye bakar)
    const d = rd.district;
    void d;
    const len = Math.abs(rd.x1 - rd.x0);
    for (let t = 14; t < len - 14; t += r.float(18, 40)) {
      if (!r.chance(0.35)) continue;
      const x = Math.min(rd.x0, rd.x1) + t;
      const zA = rd.z0 - rd.w / 2 - 3.2 - 0.5, zB = rd.z0 + rd.w / 2 + 3.2 + 0.5;
      const a = findFace(x, zA, 'z'), b = findFace(x, zB, 'z');
      if (!a || !b) continue;
      const za = Math.abs(a.z0 - zA) < Math.abs(a.z1 - zA) ? a.z0 : a.z1;
      const zb = Math.abs(b.z0 - zB) < Math.abs(b.z1 - zB) ? b.z0 : b.z1;
      const y = 3.8 + 3.2 * r.int(1, Math.min(a.floors, b.floors) - 1) + 1.9;
      const span = Math.abs(zb - za);
      city.props.laundry.addTRS(x, y, Math.min(za, zb), -Math.PI / 2, span / 18, 1, 1);
      n++;
    }
  }
  city.laundryCount = n;
}

export function buildSmallMosqueTop(b) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a9aa8, metalness: 0.5, roughness: 0.4 });
  const w = Math.min(b.x1 - b.x0, b.z1 - b.z0);
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(w * 0.4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  dome.position.set(cx, b.h, cz); g.add(dome);
  const white = new THREE.MeshStandardMaterial({ color: 0xece8e0, roughness: 0.7 });
  const mx = b.x1 - 1.2, mz = b.z0 + 1.2;
  const min = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 22, 10), white); min.position.set(mx, 11, mz); g.add(min);
  const bal = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.4, 12), white); bal.position.set(mx, 17, mz); g.add(bal);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.8, 4, 10), mat); cone.position.set(mx, 24, mz); g.add(cone);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---- Cephe/çatı ayrıntı geometrileri (GeoBuilder, eşya malzemesi) ----
export const FACADE_PROP_DEFS = {
  balcony: () => new GeoBuilder().box(1, 0.16, 1.15, { z: 0.575, rough: 0.8 }).build(),
  railing: () => new GeoBuilder()
    .plane(1, 1, { x: 0, y: 0.58, z: 1.12, uv: 'railing', color: 0x222222, metal: 0.6, rough: 0.5 })
    .plane(1.1, 1, { x: -0.5, y: 0.58, z: 0.57, ry: Math.PI / 2, uv: 'railing', color: 0x222222, metal: 0.6, rough: 0.5, sx: 1 / 1 })
    .plane(1.1, 1, { x: 0.5, y: 0.58, z: 0.57, ry: Math.PI / 2, uv: 'railing', color: 0x222222, metal: 0.6, rough: 0.5 })
    .box(1.02, 0.05, 0.06, { y: 1.08, z: 1.12, color: 0x1a1a1a, metal: 0.6, rough: 0.4 }).build(),
  glassrail: () => new GeoBuilder()
    .plane(1, 1, { y: 0.58, z: 1.12, uv: 'glassrail', color: 0xffffff, rough: 0.1 })
    .box(1.02, 0.05, 0.06, { y: 1.08, z: 1.12, color: 0x9aa0a4, metal: 0.8, rough: 0.3 }).build(),
  sill: () => new GeoBuilder().box(1, 0.07, 0.16, { z: 0.08, color: 0xd8d4cc, rough: 0.7 }).build(),
  ac: () => new GeoBuilder().box(0.8, 0.55, 0.3, { z: 0.16, uv: 'ac', rough: 0.6 }).box(0.06, 0.06, 0.3, { x: -0.3, y: -0.06, z: 0.16, color: 0x555555 }).box(0.06, 0.06, 0.3, { x: 0.3, y: -0.06, z: 0.16, color: 0x555555 }).build(),
  dish: () => {
    const gb = new GeoBuilder();
    gb.add(new THREE.SphereGeometry(0.45, 12, 6, 0, Math.PI * 2, 0, 0.9), { y: 1.25, rx: -1.0, color: 0xdedede, rough: 0.4, metal: 0.2 });
    gb.cyl(0.03, 0.03, 1.0, 5, { color: 0x666666, metal: 0.7 });
    gb.box(0.04, 0.04, 0.5, { y: 1.0, z: 0.25, rx: -0.6, color: 0x666666 });
    return gb.build();
  },
  solar: () => {
    const gb = new GeoBuilder();
    gb.box(1.9, 0.05, 1.2, { y: 0.9, rx: -0.6, z: 0.1, color: 0x1d2a44, rough: 0.15, metal: 0.6 });
    gb.add(new THREE.CylinderGeometry(0.28, 0.28, 2.0, 10), { y: 1.55, z: -0.4, rz: Math.PI / 2, color: 0xe8e8e8, rough: 0.4, metal: 0.4 });
    gb.box(0.05, 1.4, 0.05, { x: -0.9, z: -0.4, color: 0x888888, metal: 0.6 }).box(0.05, 1.4, 0.05, { x: 0.9, z: -0.4, color: 0x888888, metal: 0.6 });
    return gb.build();
  },
  tank: () => new GeoBuilder().cyl(0.6, 0.6, 1.4, 10, { y: 0.3, color: 0xc9c9c9, metal: 0.5, rough: 0.4 }).box(1.3, 0.3, 1.3, { color: 0x777777 }).build(),
  door: () => new GeoBuilder()
    .box(1.9, 2.75, 0.14, { z: -0.02, color: 0xd8d0c0, rough: 0.7 })
    .add(new THREE.PlaneGeometry(1.5, 2.4), { y: 1.2, z: 0.06, uv: 'door', rough: 0.5 })
    .box(2.1, 0.12, 0.5, { z: 0.2, color: 0x8a8680, rough: 0.8 })
    .build(),
  awning: () => {
    const gb = new GeoBuilder();
    gb.add(new THREE.PlaneGeometry(4.4, 1.5), { y: 0.0, z: 0.7, rx: -Math.PI / 2 + 0.45, uv: 'awning', rough: 0.9 });
    gb.add(new THREE.PlaneGeometry(4.4, 0.28), { y: -0.36, z: 1.38, uv: 'awning', rough: 0.9 });
    gb.box(0.04, 0.04, 1.4, { x: -2.15, y: -0.3, z: 0.7, rx: 0.45, color: 0x333333, metal: 0.7 }).box(0.04, 0.04, 1.4, { x: 2.15, y: -0.3, z: 0.7, rx: 0.45, color: 0x333333, metal: 0.7 });
    return gb.build();
  },
  atm: () => new GeoBuilder().box(0.9, 1.7, 0.35, { z: 0.17, color: 0x8a9096, metal: 0.4, rough: 0.4 }).add(new THREE.PlaneGeometry(0.8, 0.8), { y: 1.1, z: 0.36, uv: 'atm', emis: 0.6 }).build(),
  forsale: () => new GeoBuilder().add(new THREE.PlaneGeometry(2.6, 1.3), { uv: 'forsale', rough: 0.8 }).build(),
  potted: () => new GeoBuilder().cyl(0.18, 0.13, 0.3, 8, { color: 0xa0522d }).sphere(0.28, { y: 0.48, color: 0x3d6b2a, rough: 0.9 }, 7, 5).build(),
  laundry: () => {
    const gb = new GeoBuilder();
    gb.box(18, 0.02, 0.02, { x: 9, color: 0xdddddd });
    for (let i = 0; i < 3; i++) gb.add(new THREE.PlaneGeometry(4.6, 1.1), { x: 2.5 + i * 6.2, y: -0.6, uv: 'laundry', wind: 0.07, rough: 0.9 });
    return gb.build();
  },
  graf0: () => new GeoBuilder().add(new THREE.PlaneGeometry(1, 0.55), { uv: 'graf0', rough: 0.8 }).build(),
  graf1: () => new GeoBuilder().add(new THREE.PlaneGeometry(1, 0.55), { uv: 'graf2', rough: 0.8 }).build(),
  graf2: () => new GeoBuilder().add(new THREE.PlaneGeometry(1, 0.55), { uv: 'graf4', rough: 0.8 }).build(),
  graf3: () => new GeoBuilder().add(new THREE.PlaneGeometry(1, 0.55), { uv: 'graf6', rough: 0.8 }).build(),
};
// LOD yarıçapı, gölge, çift yüz
export const FACADE_PROP_OPTS = {
  balcony: { radius: 320, shadow: true }, railing: { radius: 220, double: true }, glassrail: { radius: 260, double: true },
  sill: { radius: 160 }, ac: { radius: 140 }, dish: { radius: 260 }, solar: { radius: 300, shadow: true }, tank: { radius: 280 },
  door: { radius: 220 }, awning: { radius: 260, double: true, shadow: true }, atm: { radius: 120 }, forsale: { radius: 300, double: true },
  potted: { radius: 120 }, laundry: { radius: 200, double: true }, graf0: { radius: 110 }, graf1: { radius: 110 }, graf2: { radius: 110 }, graf3: { radius: 110 },
};

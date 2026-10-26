// İstanbul'un simge yapıları: Galata Kulesi, Sultanahmet, Ayasofya, Süleymaniye, Kapalıçarşı,
// Dolmabahçe, Haydarpaşa, Mihrimah Sultan, Taksim Anıtı, stadyum.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { flagTexture, ashlarPBR, plasterPBR } from '../core/textures.js';
import { pbrMaterial } from './shaders.js';

const mats = {};
function M(key, opts) {
  if (!mats[key]) mats[key] = new THREE.MeshStandardMaterial(opts);
  return mats[key];
}

// Kesme taş / mermer PBR malzemeleri (dünya koordinatlı UV)
function SM(key, hex) {
  if (!mats[key]) { const c = new THREE.Color(hex); c.multiplyScalar(1.12); mats[key] = pbrMaterial(ashlarPBR(), { color: c, scale: 0.55 }); }
  return mats[key];
}
function MM(key) {
  if (!mats[key]) mats[key] = pbrMaterial(plasterPBR(), { color: 0xf4f0e8, scale: 0.4, rough: 0.7 });
  return mats[key];
}

// Simge yapı grubunu malzemeye göre birleştir (yüzlerce mesh yerine birkaç çizim çağrısı)
function mergeByMaterial(g) {
  g.updateMatrixWorld(true);
  const buckets = new Map(), keep = [];
  for (const o of g.children) {
    if (!o.isMesh || o.isInstancedMesh || o.userData.flag) { keep.push(o); continue; }
    let geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (geo.index) geo = geo.toNonIndexed();
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    const key = o.material.uuid + (o.castShadow ? 's' : '');
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, shadow: o.castShadow, list: [] });
    buckets.get(key).list.push(geo);
  }
  g.clear();
  for (const o of keep) g.add(o);
  for (const b of buckets.values()) {
    const m = new THREE.Mesh(mergeGeometries(b.list), b.mat);
    m.castShadow = b.shadow; m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

export const landmarkDoors = [];

function add(g, geo, mat, x, y, z, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (shadow) { m.castShadow = true; m.receiveShadow = true; }
  g.add(m);
  return m;
}

function minaret(g, cols, x, z, h, mat, capMat, r = 1.0) {
  add(g, new THREE.CylinderGeometry(r * 1.3, r * 1.4, 4, 12), mat, x, 2, z);
  add(g, new THREE.CylinderGeometry(r * 0.85, r, h, 12), mat, x, h / 2, z);
  for (const f of [0.55, 0.78, 0.93].slice(0, h > 50 ? 3 : 2)) {
    add(g, new THREE.CylinderGeometry(r * 1.6, r * 1.1, 0.8, 14), mat, x, h * f, z);
  }
  add(g, new THREE.ConeGeometry(r * 0.95, h * 0.18, 12), capMat, x, h + h * 0.09, z);
  add(g, new THREE.CylinderGeometry(0.06, 0.06, 2.4, 4), M('gold', { color: 0xd4af37, metalness: 0.9, roughness: 0.3 }), x, h + h * 0.18 + 1.2, z, false);
  cols.addCircle(x, z, r * 1.4, 0, 4, 'minaret');
  cols.addCircle(x, z, r * 1.0, 4, h * 1.18, 'minaret');
}

function mosque(g, cols, cx, cz, S, opt) {
  const wall = opt.wall, dome = opt.dome;
  const H = S * 0.32;
  // ana gövde
  add(g, new THREE.BoxGeometry(S, H, S), wall, cx, H / 2, cz);
  cols.add(cx - S / 2, cz - S / 2, cx + S / 2, cz + S / 2, 0, H + S * 0.3, 'mosque');
  // kasnak + ana kubbe
  const R = S * 0.3;
  add(g, new THREE.CylinderGeometry(R * 1.02, R * 1.05, S * 0.1, 32), wall, cx, H + S * 0.05, cz);
  add(g, new THREE.SphereGeometry(R, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), dome, cx, H + S * 0.1, cz);
  // kasnak pencereleri
  const winMat = M('mwin', { color: 0x1a1f2a, emissive: 0xffc070, emissiveIntensity: 0.2 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const w = add(g, new THREE.BoxGeometry(0.15, S * 0.06, S * 0.04), winMat, cx + Math.cos(a) * R * 1.04, H + S * 0.05, cz + Math.sin(a) * R * 1.04, false);
    w.rotation.y = -a;
  }
  add(g, new THREE.CylinderGeometry(0.1, 0.1, 3, 4), M('gold', { color: 0xd4af37, metalness: 0.9, roughness: 0.3 }), cx, H + S * 0.1 + R + 1.5, cz, false);
  // yarım kubbeler
  for (const [dx, dz] of opt.semi || [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const s = add(g, new THREE.SphereGeometry(R * 0.62, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), dome, cx + dx * R * 0.95, H, cz + dz * R * 0.95);
    s.scale.set(1, 0.8, 1);
  }
  // köşe kubbecikleri
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    add(g, new THREE.CylinderGeometry(S * 0.08, S * 0.08, S * 0.06, 12), wall, cx + dx * S * 0.38, H + S * 0.03, cz + dz * S * 0.38);
    add(g, new THREE.SphereGeometry(S * 0.08, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), dome, cx + dx * S * 0.38, H + S * 0.06, cz + dz * S * 0.38);
  }
  // avlu (revaklı)
  if (opt.courtyard) {
    const cz2 = cz + opt.courtyard * (S * 0.5 + S * 0.35);
    const cw = S * 0.9, cd = S * 0.65;
    for (const [w, d, x, z] of [[cw, 1.2, cx, cz2 + opt.courtyard * cd / 2], [1.2, cd, cx - cw / 2, cz2], [1.2, cd, cx + cw / 2, cz2]]) {
      add(g, new THREE.BoxGeometry(w, 5, d), wall, x, 2.5, z);
      cols.add(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 0, 5, 'wall');
    }
    for (let i = 0; i < 7; i++) {
      const x = cx - cw / 2 + (cw / 7) * (i + 0.5);
      add(g, new THREE.SphereGeometry(S * 0.05, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), dome, x, 5, cz2 + opt.courtyard * cd / 2);
    }
    // şadırvan
    add(g, new THREE.CylinderGeometry(2.5, 2.5, 2.5, 8), wall, cx, 1.25, cz2);
    add(g, new THREE.SphereGeometry(2.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), dome, cx, 2.5, cz2);
    cols.addCircle(cx, cz2, 2.55, 0, 5, 'fountain');
  }
  // minareler
  const mh = opt.minaretH || S * 0.95;
  for (const [mx, mz] of opt.minarets) minaret(g, cols, cx + mx * S, cz + mz * S, mh, wall, dome, opt.minaretR || 1.1);
  // kapı
  const dz = cz - (opt.courtyard || -1) * (S / 2 + 0.6);
  void dz;
  const doorZ = cz + (opt.doorSide || 1) * (S / 2 + 0.1);
  const door = add(g, new THREE.BoxGeometry(3, 5, 0.3), M('mdoor', { color: 0x3a2412 }), cx, 2.5, doorZ, false);
  void door;
  landmarkDoors.push({ x: cx, z: doorZ + (opt.doorSide || 1) * 0.9, type: 'mosque', name: opt.name });
}

export function buildLandmark(type, b, cols) {
  const g = new THREE.Group();
  const cx = b.cx, cz = b.cz;
  const W = b.x1 - b.x0, D = b.z1 - b.z0;
  const S = Math.min(W, D);
  const stone = SM('stoneLm', '#c9bba0');
  const white = MM('whiteLm');
  const lead = M('lead', { color: 0x7d8890, metalness: 0.55, roughness: 0.45 });
  switch (type) {
    case 'galata': {
      // meydan
      add(g, new THREE.CylinderGeometry(S * 0.45, S * 0.45, 0.15, 32), SM('cobble', '#8a7f6e'), cx, 0.07, cz, false);
      const R = 6.5;
      add(g, new THREE.CylinderGeometry(R + 0.6, R + 0.8, 4, 24), stone, cx, 2, cz);
      add(g, new THREE.CylinderGeometry(R, R + 0.2, 44, 24), stone, cx, 24, cz);
      // pencere halkaları
      const win = M('gwin', { color: 0x161a22, emissive: 0xffb050, emissiveIntensity: 0.3 });
      for (let k = 0; k < 6; k++) for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + k * 0.4;
        const w = add(g, new THREE.BoxGeometry(0.2, 1.8, 0.9), win, cx + Math.cos(a) * (R + 0.15), 8 + k * 6, cz + Math.sin(a) * (R + 0.15), false);
        w.rotation.y = -a;
      }
      add(g, new THREE.CylinderGeometry(R + 1.2, R + 0.2, 1.2, 24), stone, cx, 46.5, cz);
      // seyir terası sütunları
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        add(g, new THREE.CylinderGeometry(0.2, 0.2, 3.5, 6), stone, cx + Math.cos(a) * (R + 0.6), 48.8, cz + Math.sin(a) * (R + 0.6));
      }
      add(g, new THREE.CylinderGeometry(R + 0.8, R + 0.8, 0.6, 24), stone, cx, 50.8, cz);
      add(g, new THREE.ConeGeometry(R + 0.6, 14, 24), lead, cx, 58, cz);
      add(g, new THREE.CylinderGeometry(0.1, 0.1, 3, 4), M('gold', { color: 0xd4af37, metalness: 0.9, roughness: 0.3 }), cx, 66.5, cz, false);
      cols.add(cx - R, cz - R, cx + R, cz + R, 0, 66, 'galata');
      cols.addCircle(cx, cz, R + 0.8, 0, 4, 'galataBase');
      landmarkDoors.push({ x: cx, z: cz + R + 1.5, type: 'tower', name: 'Galata Kulesi' });
      add(g, new THREE.BoxGeometry(2.2, 3, 0.4), M('mdoor', { color: 0x3a2412 }), cx, 1.5, cz + R + 0.5, false);
      break;
    }
    case 'taksim': {
      add(g, new THREE.BoxGeometry(W, 0.12, D), SM('taksimFloor', '#b0a796'), cx, 0.06, cz, false);
      // Cumhuriyet Anıtı (soyut)
      add(g, new THREE.BoxGeometry(8, 1.2, 8), stone, cx, 0.6, cz);
      add(g, new THREE.BoxGeometry(5, 9, 5), white, cx, 5.7, cz);
      add(g, new THREE.BoxGeometry(6, 1, 6), stone, cx, 10.7, cz);
      cols.add(cx - 4, cz - 4, cx + 4, cz + 4, 0, 1.2, 'monument');
      cols.add(cx - 2.5, cz - 2.5, cx + 2.5, cz + 2.5, 0, 10.2, 'monument');
      cols.add(cx - 3, cz - 3, cx + 3, cz + 3, 10.2, 11.2, 'monument');
      // bayrak direği
      const pole = add(g, new THREE.CylinderGeometry(0.15, 0.2, 24, 8), M('pole', { color: 0xdddddd, metalness: 0.7 }), cx + 18, 12, cz - 12);
      void pole;
      const flag = add(g, new THREE.PlaneGeometry(9, 6), M('flag', { map: flagTexture(), side: THREE.DoubleSide }), cx + 22.6, 20.5, cz - 12, false);
      flag.userData.flag = true;
      g.userData.flag = flag;
      cols.addCircle(cx + 18, cz - 12, 0.2, 0, 24, 'pole');
      // AKM benzeri kültür merkezi (bloğun kuzey kenarı)
      const akmW = W * 0.8;
      add(g, new THREE.BoxGeometry(akmW, 14, 12), M('akm', { color: 0x2b2b2b, roughness: 0.4, metalness: 0.4 }), cx, 7, b.z0 + 7);
      add(g, new THREE.BoxGeometry(akmW * 0.98, 10, 0.2), M('akmglass', { color: 0x223344, emissive: 0xffd8a0, emissiveIntensity: 0.25 }), cx, 7, b.z0 + 13.1, false);
      cols.add(cx - akmW / 2, b.z0 + 1, cx + akmW / 2, b.z0 + 13, 0, 14, 'akm');
      break;
    }
    case 'bluemosque':
      mosque(g, cols, cx, cz - D * 0.12, S * 0.62, {
        wall: SM('bmWall', '#d8d2c4'), dome: M('bmDome', { color: 0x6f8a9c, metalness: 0.5, roughness: 0.4 }),
        minarets: [[0.62, 0.62], [-0.62, 0.62], [0.62, -0.62], [-0.62, -0.62], [0.62, 1.55], [-0.62, 1.55]], courtyard: 1, doorSide: -1, name: 'Sultanahmet Camii', minaretH: 64,
      });
      break;
    case 'suleymaniye':
      mosque(g, cols, cx, cz, S * 0.66, {
        wall: SM('sWall', '#e0d8c8'), dome: lead,
        minarets: [[0.62, 0.62], [-0.62, 0.62], [0.62, -0.62], [-0.62, -0.62]], doorSide: 1, name: 'Süleymaniye Camii', minaretH: 62,
      });
      break;
    case 'mihrimah':
      mosque(g, cols, cx, cz, S * 0.5, {
        wall: SM('mWall', '#d9d0bc'), dome: lead,
        minarets: [[0.6, -0.6], [-0.6, -0.6]], doorSide: -1, semi: [[0, 1]], name: 'Mihrimah Sultan Camii', minaretH: 40,
      });
      break;
    case 'ayasofya': {
      const pink = SM('aya', '#c98f73');
      mosque(g, cols, cx, cz, S * 0.64, {
        wall: pink, dome: lead, minarets: [[0.58, 0.58], [-0.58, 0.58], [0.58, -0.58], [-0.58, -0.58]], semi: [[1, 0], [-1, 0]], doorSide: 1, name: 'Ayasofya', minaretH: 52, minaretR: 1.2,
      });
      // payandalar
      for (const sx of [-1, 1]) for (const sz of [-0.3, 0.3]) {
        add(g, new THREE.BoxGeometry(3, 16, 6), pink, cx + sx * S * 0.34, 8, cz + sz * S * 0.64);
        cols.add(cx + sx * S * 0.34 - 1.5, cz + sz * S * 0.64 - 3, cx + sx * S * 0.34 + 1.5, cz + sz * S * 0.64 + 3, 0, 16, 'buttress');
      }
      break;
    }
    case 'bazaar': {
      // Kapalıçarşı: kubbeli uzun çarşı
      const bw = W * 0.9, bd = D * 0.75;
      const wall = SM('bzWall', '#d2b48c');
      add(g, new THREE.BoxGeometry(bw, 8, bd), wall, cx, 4, cz);
      cols.add(cx - bw / 2, cz - bd / 2, cx + bw / 2, cz + bd / 2, 0, 8, b);
      const nx = Math.floor(bw / 8), nz = Math.floor(bd / 8);
      const domes = [];
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) domes.push([cx - bw / 2 + (i + 0.5) * (bw / nx), cz - bd / 2 + (j + 0.5) * (bd / nz)]);
      const dg = new THREE.SphereGeometry(3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      const im = new THREE.InstancedMesh(dg, lead, domes.length);
      const m = new THREE.Matrix4();
      domes.forEach(([x, z], i) => { m.makeTranslation(x, 8, z); im.setMatrixAt(i, m); });
      im.castShadow = true;
      g.add(im);
      // Nuruosmaniye kapısı
      add(g, new THREE.BoxGeometry(8, 10, 2), MM('bzGate'), cx, 5, cz + bd / 2 + 0.5);
      cols.add(cx - 4, cz + bd / 2 - 0.5, cx + 4, cz + bd / 2 + 1.5, 0, 10, 'bazaarGate');
      add(g, new THREE.BoxGeometry(3.2, 5, 0.3), M('mdoor', { color: 0x3a2412 }), cx, 2.5, cz + bd / 2 + 1.6, false);
      landmarkDoors.push({ x: cx, z: cz + bd / 2 + 2.6, type: 'bazaar', name: 'Kapalıçarşı' });
      break;
    }
    case 'dolmabahce': {
      // Dolmabahçe Sarayı: uzun beyaz neo-barok cephe
      const pw = W * 0.92, pd = Math.min(D * 0.5, 30);
      add(g, new THREE.BoxGeometry(pw, 16, pd), white, cx, 8, cz);
      cols.add(cx - pw / 2, cz - pd / 2, cx + pw / 2, cz + pd / 2, 0, 16, 'palace');
      const colMat = M('palCol', { color: 0xf4f0e6 });
      for (let x = cx - pw / 2 + 3; x < cx + pw / 2; x += 4) {
        add(g, new THREE.CylinderGeometry(0.4, 0.45, 13, 10), colMat, x, 6.5, cz + pd / 2 + 0.6);
        cols.addCircle(x, cz + pd / 2 + 0.6, 0.45, 0, 13, 'column');
      }
      add(g, new THREE.BoxGeometry(pw + 1, 1.2, pd + 2), colMat, cx, 16.6, cz);
      add(g, new THREE.SphereGeometry(8, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), lead, cx, 17, cz);
      // saat kulesi
      add(g, new THREE.BoxGeometry(4, 26, 4), white, cx - pw / 2 - 8, 13, cz + pd / 2 + 6);
      add(g, new THREE.CylinderGeometry(1.6, 1.6, 0.2, 20), M('clock', { color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3 }), cx - pw / 2 - 8, 22, cz + pd / 2 + 8.05, false).rotation.x = Math.PI / 2;
      add(g, new THREE.ConeGeometry(2.6, 5, 4), lead, cx - pw / 2 - 8, 28.5, cz + pd / 2 + 6);
      cols.add(cx - pw / 2 - 10, cz + pd / 2 + 4, cx - pw / 2 - 6, cz + pd / 2 + 8, 0, 26, 'clock');
      landmarkDoors.push({ x: cx, z: cz + pd / 2 + 2, type: 'palace', name: 'Dolmabahçe Sarayı' });
      break;
    }
    case 'haydarpasa': {
      const hw = W * 0.8, hd = 22;
      const brick = SM('hay', '#c8a888');
      add(g, new THREE.BoxGeometry(hw, 18, hd), brick, cx, 9, cz);
      cols.add(cx - hw / 2, cz - hd / 2, cx + hw / 2, cz + hd / 2, 0, 18, 'station');
      for (const sx of [-1, 1]) {
        add(g, new THREE.CylinderGeometry(4, 4, 26, 16), brick, cx + sx * hw / 2, 13, cz - hd / 2);
        add(g, new THREE.ConeGeometry(4.4, 9, 16), M('hroof', { color: 0x5a6e78, metalness: 0.4 }), cx + sx * hw / 2, 30.5, cz - hd / 2);
        cols.addCircle(cx + sx * hw / 2, cz - hd / 2, 4, 0, 26, 'station');
      }
      add(g, new THREE.BoxGeometry(hw * 0.98, 1.4, hd * 1.05), M('hroof', { color: 0x5a6e78, metalness: 0.4 }), cx, 18.6, cz);
      landmarkDoors.push({ x: cx, z: cz + hd / 2 + 1, type: 'station', name: 'Haydarpaşa Garı' });
      break;
    }
    case 'stadium': {
      const R = S * 0.45;
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.9, 18, 40, 1, true), M('stad', { color: 0xf0c000, roughness: 0.6, side: THREE.DoubleSide }));
      ring.position.set(cx, 9, cz); ring.castShadow = true; g.add(ring);
      const pitch = new THREE.Mesh(new THREE.PlaneGeometry(R * 1.1, R * 0.7), M('pitch', { color: 0x2f7a2f }));
      pitch.rotation.x = -Math.PI / 2; pitch.position.set(cx, 0.05, cz); g.add(pitch);
      // tribünler
      for (let i = 0; i < 4; i++) {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.95 - i * 3, R * 0.95 - i * 3, 1.5, 40, 1, true), M('seats', { color: 0x1d3d8e, side: THREE.DoubleSide }));
        t.position.set(cx, 3 + i * 3.5, cz); g.add(t);
      }
      // dairesel duvarı kutularla kaba yaklaşım
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
        // halka duvarı: teğet döndürülmüş kutular (boşluksuz)
        cols.addOBB(x, z, 2.2, 2 * Math.PI * R / 24 + 0.6, -a, 0, 18, 'stadium');
      }
      break;
    }
    default:
      return null;
  }
  return mergeByMaterial(g);
}

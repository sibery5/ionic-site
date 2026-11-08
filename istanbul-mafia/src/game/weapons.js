// Silah verileri ve ayrıntılı prosedürel 3D modelleri (hepsi koddan üretilir).
// Modeller ExtrudeGeometry (eğimli kenarlı profiller), LatheGeometry (namlu, dürbün, el bombası)
// ve kutulardan kurulur; her silahın geometrisi bir kez birleştirilip önbelleğe alınır.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { woodTexture } from '../core/textures.js';

// Alanlar:
//  dmg/rate/mag/spread/range/reload : temel değerler (spread = NPC ve kalçadan atış sapması)
//  recoil / recoilH  : oyuncu kamerasına dikey / yatay geri tepme (radyan)
//  bloom / bloomMax / bloomRecover : her atışta artan sapma, üst sınır ve saniyede sönme
//  adsMul            : nişan alırken (sağ tık) sapma çarpanı
//  hipSpread         : (isteğe bağlı) oyuncunun kalçadan atış sapması (keskin nişancı için)
//  flash             : namlu alevi boyutu, shell: kovan türü ('pistol'|'rifle'|'shotgun'|false)
//  shellDelay        : kovanın atılma gecikmesi (pompa / sürgü hareketi)
//  stab/slash/backstab/bleed : bıçak saldırıları (dürtme, kesme, arkadan ×3, kanama)
//  zoom              : [savaş] sağ tık yakınlaştırması (tabanca az, tüfek orta, dürbün yüksek)
//  pen               : [savaş] bedeni delip geçme oranı (0 = delmez; body.js)
export const WEAPONS = {
  fists: { name: 'Yumruk', type: 'melee', dmg: 9, range: 1.6, rate: 2.5, price: 0, slot: 0 },
  knife: {
    name: 'Sustalı Bıçak', type: 'melee', dmg: 28, range: 1.8, rate: 2.4, price: 350, slot: 1,
    stab: 34, slash: 22, slashArc: 0.1, backstab: 3, bleed: { dps: 5, t: 4 },
  },
  bat: { name: 'Beyzbol Sopası', type: 'melee', dmg: 34, range: 2.2, rate: 1.4, price: 600, slot: 1, knockback: 5 },
  pistol: {
    name: 'Tabanca 9mm', type: 'gun', zoom: 1.25, pen: 0.3, sound: 'pistol', dmg: 24, rate: 4, mag: 15, spread: 0.012, range: 90, price: 1500, ammoPrice: 6, slot: 2, oneHand: true, reload: 1.3,
    recoil: 0.012, recoilH: 0.006, bloom: 0.008, bloomMax: 0.04, bloomRecover: 0.12, adsMul: 0.55, flash: 0.7, shell: 'pistol',
  },
  revolver: {
    name: 'Altıpatlar', type: 'gun', zoom: 1.3, pen: 0.5, sound: 'revolver', dmg: 60, rate: 1.6, mag: 6, spread: 0.008, range: 110, price: 3800, ammoPrice: 15, slot: 2, oneHand: true, reload: 2.2,
    recoil: 0.03, recoilH: 0.012, bloom: 0.02, bloomMax: 0.05, bloomRecover: 0.1, adsMul: 0.5, flash: 1.15, shell: false,
  },
  uzi: {
    name: 'Arı 9', type: 'gun', zoom: 1.4, pen: 0.2, sound: 'smg', dmg: 15, rate: 13, mag: 32, spread: 0.035, range: 70, price: 6500, ammoPrice: 4, slot: 3, oneHand: true, auto: true, reload: 1.6,
    recoil: 0.007, recoilH: 0.009, bloom: 0.004, bloomMax: 0.05, bloomRecover: 0.15, adsMul: 0.7, flash: 0.6, shell: 'pistol',
  },
  shotgun: {
    name: 'Pompalı Tüfek', type: 'gun', zoom: 1.3, pen: 0, sound: 'shotgun', dmg: 13, pellets: 9, rate: 1.2, mag: 8, spread: 0.09, range: 40, price: 8500, ammoPrice: 20, slot: 4, reload: 2.6,
    recoil: 0.04, recoilH: 0.015, bloom: 0.01, bloomMax: 0.03, bloomRecover: 0.1, adsMul: 0.8, flash: 1.45, shell: 'shotgun', shellDelay: 0.42,
  },
  ak: {
    name: 'Bozkır 47', type: 'gun', zoom: 1.65, pen: 0.6, sound: 'rifle', dmg: 32, rate: 9, mag: 30, spread: 0.02, range: 150, price: 16000, ammoPrice: 10, slot: 5, auto: true, reload: 2.3,
    recoil: 0.012, recoilH: 0.01, bloom: 0.006, bloomMax: 0.05, bloomRecover: 0.14, adsMul: 0.5, flash: 1.0, shell: 'rifle',
  },
  m4: {
    name: 'Taarruz Tüfeği', type: 'gun', zoom: 1.75, pen: 0.5, sound: 'rifle', dmg: 28, rate: 11, mag: 30, spread: 0.015, range: 160, price: 22000, ammoPrice: 12, slot: 5, auto: true, reload: 2.0,
    recoil: 0.008, recoilH: 0.006, bloom: 0.004, bloomMax: 0.035, bloomRecover: 0.16, adsMul: 0.45, flash: 0.85, shell: 'rifle',
  },
  sniper: {
    name: 'Keskin Nişancı', type: 'gun', zoom: 6, pen: 0.8, sound: 'sniper', dmg: 150, rate: 0.8, mag: 5, spread: 0.001, range: 400, price: 30000, ammoPrice: 60, slot: 6, scope: true, reload: 3.2,
    recoil: 0.05, recoilH: 0.01, bloom: 0.02, bloomMax: 0.03, bloomRecover: 0.05, adsMul: 1, hipSpread: 0.03, flash: 1.3, shell: 'rifle', shellDelay: 0.6,
  },
  rpg: {
    name: 'Roketatar', type: 'launcher', zoom: 1.5, pen: 0, sound: 'rpg', dmg: 250, radius: 8, rate: 0.6, mag: 1, spread: 0.005, range: 300, price: 65000, ammoPrice: 1500, slot: 7, reload: 3.0,
    recoil: 0.03, recoilH: 0.01, bloom: 0, bloomMax: 0, adsMul: 0.6, flash: 1.6, shell: false,
  },
  grenade: { name: 'El Bombası', type: 'throw', dmg: 180, radius: 7, rate: 1, mag: 1, price: 900, ammoPrice: 900, slot: 8 },
  // ---- [savaş: yeni silahlar] (kurgusal adlar). stagger: vurulanı sendeletme çarpanı ----
  kilic: {
    name: 'Kılıç 17', type: 'gun', zoom: 1.25, pen: 0.3, sound: 'pistol2', dmg: 22, rate: 5, mag: 17, spread: 0.011, range: 90, price: 2400, ammoPrice: 6, slot: 2, oneHand: true, reload: 1.15,
    recoil: 0.01, recoilH: 0.006, bloom: 0.007, bloomMax: 0.04, bloomRecover: 0.14, adsMul: 0.55, flash: 0.65, shell: 'pistol',
  },
  kartal: {
    name: 'Boz Kartal .50', type: 'gun', zoom: 1.3, pen: 0.6, sound: 'magnum', dmg: 78, rate: 1.7, mag: 7, spread: 0.01, range: 120, price: 9500, ammoPrice: 25, slot: 2, oneHand: true, reload: 1.9,
    recoil: 0.05, recoilH: 0.016, bloom: 0.025, bloomMax: 0.06, bloomRecover: 0.1, adsMul: 0.5, flash: 1.35, shell: 'rifle', stagger: 1.4,
  },
  akrep: {
    name: 'Akrep Kompakt', type: 'gun', zoom: 1.4, pen: 0.2, sound: 'smg2', dmg: 14, rate: 16, mag: 30, spread: 0.04, range: 60, price: 5200, ammoPrice: 4, slot: 3, oneHand: true, auto: true, reload: 1.4,
    recoil: 0.006, recoilH: 0.011, bloom: 0.004, bloomMax: 0.06, bloomRecover: 0.16, adsMul: 0.7, flash: 0.55, shell: 'pistol',
  },
  cifte: {
    name: 'Kesik Çifte', type: 'gun', zoom: 1.2, pen: 0, sound: 'sawed', dmg: 15, pellets: 11, rate: 3, mag: 2, spread: 0.14, range: 24, price: 4200, ammoPrice: 12, slot: 4, reload: 2.1,
    recoil: 0.06, recoilH: 0.02, bloom: 0.01, bloomMax: 0.03, bloomRecover: 0.1, adsMul: 0.9, flash: 1.7, shell: false, stagger: 1.5,
  },
  tufan: {
    name: 'Tufan Makineli', type: 'gun', zoom: 1.6, pen: 0.6, sound: 'lmg', dmg: 30, rate: 11, mag: 100, spread: 0.028, range: 150, price: 42000, ammoPrice: 10, slot: 5, auto: true, reload: 4.6,
    recoil: 0.01, recoilH: 0.012, bloom: 0.003, bloomMax: 0.06, bloomRecover: 0.1, adsMul: 0.55, flash: 1.1, shell: 'rifle',
  },
  bozkurt: {
    name: 'Bozkurt Nişancı', type: 'gun', zoom: 4, pen: 0.65, sound: 'dmr', dmg: 72, rate: 2.8, mag: 10, spread: 0.004, range: 260, price: 26000, ammoPrice: 30, slot: 6, scope: true, reload: 2.4,
    recoil: 0.03, recoilH: 0.008, bloom: 0.012, bloomMax: 0.03, bloomRecover: 0.12, adsMul: 1, hipSpread: 0.025, flash: 1.0, shell: 'rifle',
  },
  simsek: {
    name: 'Şimşek 40 Bombaatar', type: 'launcher', zoom: 1.5, pen: 0, lob: true, sound: 'gl', dmg: 160, radius: 6, rate: 1.1, mag: 6, spread: 0.006, range: 200, price: 48000, ammoPrice: 600, slot: 7, reload: 3.4,
    recoil: 0.04, recoilH: 0.01, bloom: 0, bloomMax: 0, adsMul: 0.6, flash: 0.9, shell: false,
  },
};
export const WEAPON_ORDER = ['fists', 'knife', 'bat', 'pistol', 'kilic', 'revolver', 'kartal', 'uzi', 'akrep', 'shotgun', 'cifte', 'ak', 'm4', 'tufan', 'sniper', 'bozkurt', 'rpg', 'simsek', 'grenade'];

// ---------------- [savaş] yüzey dokuları (kodla): fırçalanmış metal, fosfat kaplama, polimer kumlama ----------------
function canvasTex(size, draw, srgb = false) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let rnd = 12345;
const r01 = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
// pürüzlülük: ince yatay işleme çizgileri + seyrek parlak aşınma lekeleri (kenar/yüzey kullanım izi)
function brushedTex() {
  return canvasTex(256, (g, n) => {
    g.fillStyle = 'rgb(150,150,150)'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 900; i++) { const y = r01() * n, v = 110 + r01() * 90 | 0; g.fillStyle = `rgba(${v},${v},${v},0.35)`; g.fillRect(r01() * n, y, 20 + r01() * 120, 1); }
    for (let i = 0; i < 40; i++) { const v = 60 + r01() * 40 | 0; g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.beginPath(); g.ellipse(r01() * n, r01() * n, 2 + r01() * 10, 1 + r01() * 3, r01() * 3, 0, Math.PI * 2); g.fill(); }
  });
}
// polimer: ince kumlama (kabza dokusu) — kabartma haritası
function stippleTex() {
  return canvasTex(256, (g, n) => {
    g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 9000; i++) { const v = r01() < 0.5 ? 90 : 170; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r01() * n, r01() * n, 1 + (r01() * 2 | 0), 1 + (r01() * 2 | 0)); }
  });
}
// fosfat (parkerize) kaplama: hafif lekeli renk
function parkerTex() {
  return canvasTex(128, (g, n) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 2500; i++) { const v = 205 + r01() * 50 | 0; g.fillStyle = `rgb(${v},${v},${v - 4})`; g.fillRect(r01() * n, r01() * n, 1 + r01() * 3, 1 + r01() * 3); }
  }, true);
}
// kutu izdüşümlü UV: her yüz baskın normal eksenine göre (dokular tüm parçalarda aynı ölçekte, gerilmesiz)
function boxUV(geo, k = 22) {
  const P = geo.attributes.position, N = geo.attributes.normal, uv = new Float32Array(P.count * 2);
  for (let i = 0; i < P.count; i++) {
    const ax = Math.abs(N.getX(i)), ay = Math.abs(N.getY(i)), az = Math.abs(N.getZ(i));
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    if (ax >= ay && ax >= az) { uv[i * 2] = z * k; uv[i * 2 + 1] = y * k; } else if (ay >= az) { uv[i * 2] = z * k; uv[i * 2 + 1] = x * k; } else { uv[i * 2] = x * k; uv[i * 2 + 1] = y * k; }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// ---------------- malzemeler (tembel oluşturulur) ----------------
let M = null;
function mats() {
  if (M) return M;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const woodMap = (base, rep) => { const t = woodTexture(base).clone(); t.needsUpdate = true; t.repeat.set(rep, rep * 0.25); return t; };
  M = {
    gunmetal: std({ color: 0x23252a, metalness: 0.8, roughness: 0.38 }),
    blued: std({ color: 0x14171c, metalness: 0.9, roughness: 0.26 }),
    parker: std({ color: 0x2e302c, metalness: 0.55, roughness: 0.62 }),
    polymer: std({ color: 0x17171a, metalness: 0.05, roughness: 0.72 }),
    steel: std({ color: 0x9ea2a7, metalness: 0.9, roughness: 0.24 }),
    chrome: std({ color: 0xd9dde2, metalness: 1, roughness: 0.1 }),
    blade: std({ color: 0xd2d6db, metalness: 1, roughness: 0.14 }),
    wood: std({ color: 0xffffff, map: woodMap('#7a4122', 3), metalness: 0, roughness: 0.48 }),
    darkWood: std({ color: 0xffffff, map: woodMap('#5c2a13', 3), metalness: 0, roughness: 0.42 }),
    batWood: std({ color: 0xffffff, map: woodMap('#b98a55', 2), metalness: 0, roughness: 0.55 }),
    olive: std({ color: 0x4b5532, metalness: 0.15, roughness: 0.7 }),
    fde: std({ color: 0x8a7656, metalness: 0.05, roughness: 0.75 }),
    rubber: std({ color: 0x0c0c0d, metalness: 0, roughness: 0.95 }),
    brass: std({ color: 0xc89a3e, metalness: 1, roughness: 0.3 }),
    gold: std({ color: 0xd4af37, metalness: 0.95, roughness: 0.22 }),
    glass: std({ color: 0x0d1b2a, metalness: 0.3, roughness: 0.04, emissive: 0x06121e }),
    redDot: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
    white: std({ color: 0xf2f2f2, metalness: 0, roughness: 0.4, emissive: 0x333333 }),
  };
  // [savaş] metal: işleme izli pürüzlülük; polimer: kumlama kabartması; fosfat: lekeli renk
  if (typeof document !== 'undefined') {
    const br = brushedTex(), st = stippleTex(), pk = parkerTex();
    for (const k of ['gunmetal', 'blued', 'steel', 'chrome', 'blade', 'gold', 'brass']) { M[k].roughnessMap = br; M[k].needsUpdate = true; }
    M.parker.map = pk; M.parker.roughnessMap = br; M.olive.map = pk; M.fde.map = pk;
    for (const k of ['polymer', 'rubber', 'olive', 'fde']) { M[k].bumpMap = st; M[k].bumpScale = 0.8; M[k].needsUpdate = true; }
    M.parker.needsUpdate = true;
  }
  return M;
}

// ---------------- geometri yardımcıları ----------------
function box(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }
function cyl(r, l, x, y, z, seg = 10, r2 = r) { const g = new THREE.CylinderGeometry(r2, r, l, seg); g.rotateX(Math.PI / 2); g.translate(x, y, z); return g; }
// Y ekseninde dikey silindir
function vcyl(r, h, x, y, z, seg = 10) { const g = new THREE.CylinderGeometry(r, r, h, seg); g.translate(x, y, z); return g; }
// X ekseninde (yan) silindir: pimler, düğmeler
function xcyl(r, l, x, y, z, seg = 8) { const g = new THREE.CylinderGeometry(r, r, l, seg); g.rotateZ(Math.PI / 2); g.translate(x, y, z); return g; }
function sph(r, x, y, z, ws = 8, hs = 6) { const g = new THREE.SphereGeometry(r, ws, hs); g.translate(x, y, z); return g; }
function torus(R, r, x, y, z, arc = Math.PI * 2, rotY = Math.PI / 2) { const g = new THREE.TorusGeometry(R, r, 6, 14, arc); g.rotateY(rotY); g.translate(x, y, z); return g; }

// Yan profil (z,y düzleminde nokta listesi) -> X ekseni boyunca 'width' kalınlığında, eğimli kenarlı katı.
function profile(pts, width, bevel = 0.002, x = 0, holes = null) {
  const s = new THREE.Shape();
  pts.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  if (holes) for (const h of holes) { const p = new THREE.Path(); h.forEach(([z, y], i) => (i ? p.lineTo(z, y) : p.moveTo(z, y))); p.closePath(); s.holes.push(p); }
  const depth = Math.max(0.0005, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 6 });
  g.rotateY(-Math.PI / 2);
  g.translate(depth / 2 + x, 0, 0);
  return g;
}
// Eğimli köşeli kutu (rbox): kesiti yuvarlatılmış dikdörtgen, Z boyunca uzanır.
function rbox(w, h, d, x, y, z, r = 0.003) {
  const s = new THREE.Shape();
  const hw = w / 2 - r, hh = h / 2 - r;
  s.moveTo(-hw, -hh); s.lineTo(hw, -hh); s.lineTo(hw, hh); s.lineTo(-hw, hh); s.closePath();
  const depth = Math.max(0.0005, d - r * 2);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 2 });
  g.translate(x, y, z - depth / 2);
  return g;
}
// Döner profil: [yarıçap, z] noktaları, Z ekseni etrafında
function lathe(pts, x = 0, y = 0, z = 0, seg = 14) {
  const g = new THREE.LatheGeometry(pts.map(([r, zz]) => new THREE.Vector2(Math.max(0.0001, r), zz)), seg);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}
// Kavisli şarjör: üst arka köşe (zTop,yTop)'dan aşağı inerken toplam 'curve' radyan öne kıvrılır.
// thick = önden arkaya kalınlık, width = yan kalınlık, ribs = yatay takviye kaburgaları
function curvedMag(zTop, yTop, len, thick, curve, width, segs = 8, ribs = 0) {
  const at = (t) => {
    const a = t * curve;
    if (Math.abs(curve) < 1e-4) return [zTop, yTop - t * len, 0];
    return [zTop + (1 - Math.cos(a)) / curve * len, yTop - Math.sin(a) / curve * len, a];
  };
  const outer = [], inner = [];
  for (let i = 0; i <= segs; i++) {
    const [z, y, a] = at(i / segs);
    inner.push([z, y]);
    outer.push([z + Math.cos(a) * thick, y + Math.sin(a) * thick]);
  }
  const list = [profile([...outer, ...inner.reverse()], width, 0.002)];
  for (let k = 1; k <= ribs; k++) {
    const [z, y, a] = at(k / (ribs + 1));
    const rib = new THREE.BoxGeometry(width + 0.002, 0.004, thick * 0.92);
    rib.rotateX(-a);
    rib.translate(0, y + Math.sin(a) * thick * 0.5, z + Math.cos(a) * thick * 0.5);
    list.push(rib);
  }
  return list;
}
// Pikatinni ray: taban + dişler
function rail(len, x, y, z, teeth = 12, w = 0.022) {
  const list = [box(w, 0.006, len, x, y, z)];
  for (let i = 0; i < teeth; i++) list.push(box(w + 0.004, 0.004, len / teeth * 0.5, x, y + 0.005, z - len / 2 + (i + 0.5) * len / teeth));
  return list;
}
// Tetik korkuluğu: delikli profil
function triggerGuard(z0, z1, yTop, yBot, width = 0.01, t = 0.005) {
  const outer = [[z0, yTop], [z1, yTop], [z1 + 0.004, yBot + 0.012], [z1 - 0.006, yBot], [z0 + 0.004, yBot], [z0, yBot + 0.01]];
  const inner = [[z0 + t, yTop - 0.001], [z1 - t, yTop - 0.001], [z1 - t, yBot + t + 0.006], [z1 - t - 0.006, yBot + t], [z0 + t + 0.003, yBot + t], [z0 + t, yBot + t + 0.006]];
  return profile(outer, width, 0.0015, 0, [inner]);
}

// Tüm parçaları aynı öznitelik kümesine indirip birleştir
function merge(list) {
  const norm = list.map((g) => {
    let n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    if (!n.attributes.normal) n.computeVertexNormals();
    return n;
  });
  const m = mergeGeometries(norm, false);
  m.computeBoundingSphere();
  return m;
}

// ---------------- model tanımları ----------------
// Her biri { parts: {malzeme: [geometriler]}, muzzle: [x,y,z], ejector: [x,y,z] } döndürür.
const DEFS = {
  knife() {
    // gerçek bıçak: eğimli ağızlı (bevel) bıçak, oluk, siper, ahşap kabza, perçinler
    const blade = profile([
      [0.058, -0.009], [0.058, 0.0105], [0.17, 0.0115], [0.198, 0.0075], [0.232, 0.0005],
      [0.214, -0.0055], [0.18, -0.0105], [0.1, -0.0125], [0.064, -0.012],
    ], 0.0042, 0.0019);
    const fuller = box(0.0046, 0.0022, 0.085, 0, 0.004, 0.125);
    const guard = [rbox(0.014, 0.036, 0.009, 0, -0.001, 0.053, 0.002), box(0.009, 0.006, 0.006, 0, -0.019, 0.05)];
    const handle = profile([
      [-0.062, -0.011], [-0.05, -0.014], [-0.03, -0.011], [-0.018, -0.014], [0.0, -0.011], [0.016, -0.0135],
      [0.048, -0.011], [0.048, 0.011], [0.0, 0.0125], [-0.04, 0.0115], [-0.062, 0.009],
    ], 0.017, 0.0035);
    const liner = profile([[-0.064, -0.009], [0.049, -0.009], [0.049, 0.009], [-0.064, 0.008]], 0.019, 0.0006);
    const pins = [xcyl(0.0024, 0.0195, 0, 0.0, -0.035), xcyl(0.0024, 0.0195, 0, 0.0, 0.025)];
    const pommel = [rbox(0.018, 0.022, 0.012, 0, -0.001, -0.068, 0.003)];
    const button = [vcyl(0.0035, 0.004, 0, 0.0135, 0.02)];
    return {
      parts: { blade: [blade], polymer: [fuller], steel: [...guard, ...pins, ...pommel, ...button], gunmetal: [liner], darkWood: [handle] },
      muzzle: [0, 0, 0.23], ejector: null,
    };
  },
  bat() {
    const body = lathe([
      [0.0001, -0.075], [0.022, -0.072], [0.025, -0.064], [0.02, -0.058], [0.0135, -0.052], [0.0135, 0.15],
      [0.016, 0.28], [0.026, 0.45], [0.034, 0.62], [0.035, 0.76], [0.031, 0.785], [0.0001, 0.79],
    ], 0, 0, 0, 16);
    const tape = lathe([[0.0146, -0.05], [0.0146, 0.13]], 0, 0, 0, 14);
    const tapeEnd = lathe([[0.0001, 0.129], [0.0148, 0.13], [0.0148, 0.134], [0.0001, 0.135]], 0, 0, 0, 14);
    return { parts: { batWood: [body], rubber: [tape, tapeEnd] }, muzzle: [0, 0, 0.78], ejector: null };
  },
  pistol() {
    const slide = profile([[-0.045, 0.024], [0.152, 0.024], [0.152, 0.049], [0.144, 0.058], [-0.036, 0.058], [-0.045, 0.051]], 0.026, 0.0025);
    const serr = [];
    for (let i = 0; i < 7; i++) serr.push(box(0.0272, 0.026, 0.0018, 0, 0.041, -0.039 + i * 0.0042));
    const port = box(0.013, 0.003, 0.032, 0.004, 0.0585, 0.045);
    const hood = box(0.011, 0.002, 0.026, 0.004, 0.0574, 0.045);
    const frame = profile([[-0.044, 0.004], [0.142, 0.004], [0.146, 0.012], [0.146, 0.025], [-0.044, 0.025]], 0.022, 0.002);
    const railFrame = [];
    for (let i = 0; i < 3; i++) railFrame.push(box(0.023, 0.004, 0.006, 0, 0.003, 0.095 + i * 0.013));
    const guard = triggerGuard(-0.004, 0.058, 0.006, -0.028, 0.011);
    const trig = profile([[0.012, 0.004], [0.02, 0.004], [0.022, -0.006], [0.017, -0.016], [0.013, -0.015], [0.016, -0.006]], 0.006, 0.001);
    const grip = profile([[-0.046, 0.008], [0.004, 0.008], [0.006, -0.02], [0.002, -0.035], [0.006, -0.05], [-0.002, -0.088], [-0.044, -0.088], [-0.05, -0.04], [-0.054, 0.0], [-0.06, 0.012]], 0.029, 0.0035);
    grip.rotateX(0.28); grip.translate(0, 0.0, 0.01);
    const stip = [];
    for (let i = 0; i < 4; i++) { const b = box(0.0302, 0.008, 0.03, 0, -0.022 - i * 0.017, -0.012 - i * 0.004); b.rotateX(0.28); stip.push(b); }
    const base = rbox(0.03, 0.007, 0.05, 0, -0.092, -0.014, 0.002); base.rotateX(0.28);
    const rear = [box(0.022, 0.008, 0.008, 0, 0.062, -0.034), box(0.006, 0.004, 0.009, 0, 0.06, -0.034)];
    const front = box(0.004, 0.007, 0.006, 0, 0.0615, 0.142);
    const dots = [box(0.0016, 0.0016, 0.001, 0, 0.064, 0.1455), box(0.0016, 0.0016, 0.001, -0.007, 0.0635, -0.0295), box(0.0016, 0.0016, 0.001, 0.007, 0.0635, -0.0295)];
    const barrel = [cyl(0.0068, 0.006, 0, 0.042, 0.152, 12)];
    const bore = cyl(0.0045, 0.0062, 0, 0.042, 0.1525, 10);
    const slideStop = box(0.003, 0.004, 0.018, -0.0125, 0.027, 0.03);
    return {
      parts: { gunmetal: [slide], polymer: [frame, ...railFrame, guard, grip, base, ...stip, ...serr, port, ...rear, front, bore], steel: [hood, ...barrel, trig, slideStop], white: dots },
      muzzle: [0, 0.042, 0.156], ejector: [0.008, 0.058, 0.045],
    };
  },
  revolver() {
    const barrel = cyl(0.0095, 0.17, 0, 0.047, 0.125, 14);
    const rib = rbox(0.009, 0.007, 0.168, 0, 0.0565, 0.125, 0.002);
    const lug = rbox(0.012, 0.012, 0.12, 0, 0.034, 0.15, 0.003);
    const frame = profile([[-0.035, 0.014], [0.05, 0.014], [0.05, 0.062], [0.0, 0.066], [-0.025, 0.064], [-0.04, 0.05]], 0.026, 0.0025, 0, [[[-0.002, 0.02], [0.042, 0.02], [0.042, 0.058], [-0.002, 0.058]]]);
    const cylinder = lathe([[0.0001, 0.0], [0.019, 0.0], [0.022, 0.004], [0.022, 0.039], [0.019, 0.043], [0.0001, 0.043]], 0, 0.039, -0.001, 18);
    const flutes = [], bores = [];
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + Math.PI / 6;
      const f = box(0.006, 0.005, 0.026, 0, 0, 0); f.rotateZ(a); f.translate(Math.cos(a) * 0.0205, 0.039 + Math.sin(a) * 0.0205, 0.02);
      flutes.push(f);
      const b2 = cyl(0.0042, 0.003, Math.cos(a + Math.PI / 6) * 0.0125, 0.039 + Math.sin(a + Math.PI / 6) * 0.0125, 0.0425, 8);
      bores.push(b2);
    }
    const hammer = profile([[-0.042, 0.055], [-0.03, 0.058], [-0.03, 0.066], [-0.05, 0.078], [-0.054, 0.074], [-0.044, 0.062]], 0.007, 0.001);
    const guard = triggerGuard(-0.012, 0.04, 0.016, -0.018, 0.01);
    const trig = profile([[0.004, 0.014], [0.012, 0.014], [0.012, 0.002], [0.006, -0.008], [0.003, -0.006], [0.006, 0.002]], 0.006, 0.001);
    const grip = profile([[-0.036, 0.016], [0.006, 0.016], [0.0, -0.01], [0.004, -0.05], [-0.008, -0.08], [-0.03, -0.086], [-0.05, -0.075], [-0.05, -0.04], [-0.044, -0.005]], 0.031, 0.0045);
    grip.rotateX(0.12);
    const gripPin = xcyl(0.004, 0.033, 0, -0.03, -0.02);
    const front = box(0.003, 0.009, 0.012, 0, 0.064, 0.2);
    const rear = box(0.01, 0.004, 0.006, 0, 0.068, -0.02);
    const crane = xcyl(0.0035, 0.004, -0.013, 0.04, 0.02);
    return {
      parts: { steel: [barrel, rib, lug, frame, cylinder, hammer, trig, crane], blued: [...flutes, ...bores, guard, rear], darkWood: [grip], gold: [front, gripPin] },
      muzzle: [0, 0.047, 0.212], ejector: null,
    };
  },
  uzi() {
    const recv = rbox(0.036, 0.052, 0.25, 0, 0.042, 0.07, 0.004);
    const cover = [];
    for (let i = 0; i < 8; i++) cover.push(box(0.03, 0.003, 0.012, 0, 0.069, -0.03 + i * 0.022));
    const knob = vcyl(0.006, 0.012, 0, 0.074, 0.13, 8);
    const ears = [box(0.004, 0.016, 0.01, 0.009, 0.076, 0.18), box(0.004, 0.016, 0.01, -0.009, 0.076, 0.18), box(0.003, 0.012, 0.004, 0, 0.074, 0.18)];
    const rearEars = [box(0.004, 0.014, 0.01, 0.008, 0.074, -0.04), box(0.004, 0.014, 0.01, -0.008, 0.074, -0.04)];
    const nut = cyl(0.014, 0.014, 0, 0.044, 0.2, 12);
    const barrel = cyl(0.0075, 0.03, 0, 0.044, 0.215, 10);
    const grip = profile([[-0.022, 0.018], [0.022, 0.018], [0.024, -0.05], [0.02, -0.095], [-0.022, -0.095], [-0.026, -0.05]], 0.03, 0.004);
    grip.rotateX(0.05);
    const gripPanel = [box(0.0315, 0.08, 0.034, 0, -0.04, 0.0)];
    const mag = rbox(0.022, 0.085, 0.032, 0, -0.13, 0.004, 0.002);
    const magBase = rbox(0.026, 0.008, 0.036, 0, -0.174, 0.004, 0.002);
    const guard = triggerGuard(0.022, 0.085, 0.017, -0.03, 0.012);
    const trig = box(0.005, 0.016, 0.005, 0, 0.004, 0.04);
    const safety = box(0.016, 0.03, 0.004, 0, -0.02, -0.027);
    const stock = [box(0.004, 0.006, 0.2, 0.017, 0.016, 0.02), box(0.004, 0.006, 0.2, -0.017, 0.016, 0.02), box(0.038, 0.05, 0.006, 0, 0.02, -0.08)];
    const ejPort = box(0.002, 0.016, 0.03, 0.018, 0.05, 0.08);
    return {
      parts: { parker: [recv, ...ears, ...rearEars, nut, guard], blued: [...cover, barrel, ...stock, ejPort, mag, magBase], polymer: [grip, ...gripPanel], steel: [knob, trig, safety] },
      muzzle: [0, 0.044, 0.232], ejector: [0.02, 0.052, 0.08],
    };
  },
  shotgun() {
    const barrel = cyl(0.0115, 0.6, 0, 0.051, 0.36, 14);
    const vrib = [box(0.006, 0.004, 0.58, 0, 0.0645, 0.36)];
    for (let i = 0; i < 12; i++) vrib.push(box(0.004, 0.003, 0.006, 0, 0.0615, 0.09 + i * 0.047));
    const tube = cyl(0.0105, 0.46, 0, 0.024, 0.29, 12);
    const cap = lathe([[0.0001, 0.0], [0.012, 0.0], [0.013, 0.012], [0.009, 0.022], [0.0001, 0.024]], 0, 0.024, 0.515, 12);
    const recv = profile([[-0.03, -0.006], [0.12, -0.006], [0.12, 0.064], [0.0, 0.066], [-0.03, 0.05]], 0.036, 0.003);
    const port = box(0.002, 0.022, 0.05, 0.0182, 0.04, 0.06);
    const pump = lathe([
      [0.0001, 0.0], [0.017, 0.0], [0.02, 0.008], [0.019, 0.02], [0.021, 0.026], [0.019, 0.032], [0.021, 0.038], [0.019, 0.044],
      [0.021, 0.05], [0.019, 0.056], [0.021, 0.062], [0.019, 0.068], [0.021, 0.074], [0.019, 0.08], [0.021, 0.086], [0.019, 0.12], [0.017, 0.15], [0.0001, 0.152],
    ], 0, 0.03, 0.2, 14);
    pump.scale(1.25, 1, 1);
    const guard = triggerGuard(-0.004, 0.06, -0.004, -0.04, 0.012);
    const trig = profile([[0.016, -0.006], [0.024, -0.006], [0.025, -0.018], [0.02, -0.027], [0.017, -0.026], [0.019, -0.018]], 0.006, 0.001);
    const stock = profile([[-0.025, 0.055], [-0.025, -0.006], [-0.06, -0.045], [-0.075, -0.05], [-0.34, -0.09], [-0.36, -0.092], [-0.36, 0.035], [-0.2, 0.042], [-0.09, 0.05]], 0.036, 0.006);
    const pad = profile([[-0.36, -0.093], [-0.38, -0.094], [-0.38, 0.037], [-0.36, 0.036]], 0.038, 0.004);
    const bead = sph(0.0028, 0, 0.068, 0.655, 6, 4);
    const pin = xcyl(0.003, 0.037, 0, 0.0, 0.03);
    return {
      parts: { blued: [barrel, ...vrib, tube, cap, recv, guard, trig, pin], polymer: [port], wood: [pump, stock], rubber: [pad], brass: [bead] },
      muzzle: [0, 0.051, 0.665], ejector: [0.02, 0.045, 0.06],
    };
  },
  ak() {
    const recv = profile([[-0.07, 0.012], [0.19, 0.012], [0.19, 0.058], [-0.06, 0.058], [-0.07, 0.05]], 0.034, 0.002);
    const cover = profile([[-0.065, 0.058], [0.17, 0.058], [0.17, 0.066], [0.12, 0.072], [-0.04, 0.072], [-0.065, 0.064]], 0.032, 0.004);
    const coverRibs = [];
    for (let i = 0; i < 6; i++) coverRibs.push(box(0.033, 0.002, 0.008, 0, 0.068, -0.03 + i * 0.03));
    const rearSight = [box(0.022, 0.014, 0.03, 0, 0.068, 0.19), box(0.012, 0.004, 0.03, 0, 0.078, 0.19)];
    const gasBlock = box(0.022, 0.03, 0.028, 0, 0.064, 0.43);
    const gasTube = cyl(0.0092, 0.2, 0, 0.075, 0.33, 10);
    const upperHG = rbox(0.026, 0.018, 0.14, 0, 0.078, 0.28, 0.006);
    const lowerHG = profile([[0.19, 0.018], [0.37, 0.024], [0.37, 0.062], [0.19, 0.062]], 0.042, 0.007);
    const hgGrooves = [];
    for (let i = 0; i < 3; i++) hgGrooves.push(box(0.0432, 0.003, 0.09, 0, 0.03 + i * 0.008, 0.27));
    const barrel = cyl(0.0088, 0.42, 0, 0.05, 0.4, 12);
    const fsBlock = [box(0.016, 0.02, 0.022, 0, 0.056, 0.54), box(0.004, 0.034, 0.006, 0, 0.074, 0.54)];
    const fsHood = torus(0.011, 0.0015, 0, 0.078, 0.54, Math.PI, 0);
    const brake = lathe([[0.0001, 0.0], [0.011, 0.0], [0.011, 0.035], [0.008, 0.04], [0.0001, 0.04]], 0, 0.05, 0.57, 12);
    const rod = cyl(0.0028, 0.36, 0, 0.032, 0.38, 6);
    const mag = curvedMag(0.075, 0.012, 0.21, 0.052, 0.65, 0.026, 10, 4);
    const grip = profile([[-0.025, 0.014], [0.012, 0.014], [0.004, -0.03], [-0.008, -0.085], [-0.038, -0.09], [-0.036, -0.04]], 0.028, 0.004);
    grip.rotateX(0.1);
    const guard = triggerGuard(0.0, 0.07, 0.013, -0.025, 0.012);
    const trig = profile([[0.024, 0.011], [0.032, 0.011], [0.033, 0.0], [0.028, -0.01], [0.025, -0.009], [0.027, 0.0]], 0.006, 0.001);
    const selector = box(0.003, 0.012, 0.09, 0.0185, 0.045, 0.02);
    const charging = [box(0.016, 0.008, 0.02, 0.021, 0.05, 0.15)];
    const stock = profile([[-0.07, 0.056], [-0.07, 0.012], [-0.1, 0.004], [-0.44, -0.05], [-0.44, 0.045], [-0.2, 0.05]], 0.034, 0.005);
    const butt = profile([[-0.44, -0.051], [-0.452, -0.052], [-0.452, 0.047], [-0.44, 0.046]], 0.036, 0.003);
    return {
      parts: { blued: [recv, cover, ...coverRibs, ...rearSight, gasBlock, gasTube, barrel, ...fsBlock, fsHood, brake, rod, guard, trig, selector, ...charging, butt], darkWood: [upperHG, lowerHG, stock], polymer: [...hgGrooves], parker: mag, wood: [grip] },
      muzzle: [0, 0.05, 0.612], ejector: [0.02, 0.064, 0.12],
    };
  },
  m4() {
    const upper = rbox(0.034, 0.042, 0.2, 0, 0.056, 0.05, 0.003);
    const topRail = rail(0.36, 0, 0.08, 0.14, 22);
    const fwdAssist = cyl(0.006, 0.02, 0.02, 0.06, -0.02, 8);
    const port = box(0.002, 0.016, 0.04, 0.0172, 0.056, 0.07);
    const charging = [box(0.03, 0.008, 0.016, 0, 0.074, -0.05), box(0.046, 0.006, 0.008, 0, 0.074, -0.058)];
    const hg = new THREE.CylinderGeometry(0.026, 0.026, 0.22, 8); hg.rotateX(Math.PI / 2); hg.rotateZ(Math.PI / 8); hg.translate(0, 0.052, 0.26);
    const mlok = [];
    for (let i = 0; i < 4; i++) { mlok.push(box(0.054, 0.006, 0.024, 0, 0.052, 0.18 + i * 0.05)); mlok.push(box(0.006, 0.054, 0.024, 0, 0.052, 0.18 + i * 0.05)); }
    const barrel = cyl(0.0085, 0.14, 0, 0.052, 0.43, 12);
    const gasBlk = box(0.014, 0.016, 0.014, 0, 0.06, 0.4);
    const hider = lathe([[0.0001, 0.0], [0.011, 0.0], [0.011, 0.04], [0.009, 0.044], [0.0001, 0.044]], 0, 0.052, 0.495, 12);
    const hiderSlots = [];
    for (let i = 0; i < 3; i++) { const s = box(0.0235, 0.003, 0.025, 0, 0, 0); s.rotateZ(i * Math.PI / 3); s.translate(0, 0.052, 0.522); hiderSlots.push(s); }
    const lower = profile([[-0.05, 0.034], [0.15, 0.034], [0.15, 0.022], [0.12, 0.0], [0.05, -0.004], [-0.03, 0.002], [-0.05, 0.02]], 0.03, 0.002);
    const magwell = rbox(0.03, 0.03, 0.06, 0, 0.005, 0.09, 0.003);
    const mag = curvedMag(0.064, -0.004, 0.15, 0.054, 0.25, 0.022, 6, 3);
    const grip = profile([[-0.022, 0.006], [0.01, 0.006], [0.008, -0.03], [0.0, -0.088], [-0.03, -0.09], [-0.034, -0.03]], 0.028, 0.004);
    grip.rotateX(0.12);
    const guard = triggerGuard(0.005, 0.065, 0.004, -0.028, 0.012);
    const trig = profile([[0.025, 0.003], [0.033, 0.003], [0.034, -0.008], [0.029, -0.017], [0.026, -0.016], [0.028, -0.008]], 0.006, 0.001);
    const buffer = cyl(0.0145, 0.2, 0, 0.05, -0.14, 14);
    const stock = profile([[-0.16, 0.074], [-0.31, 0.07], [-0.31, -0.04], [-0.29, -0.042], [-0.21, 0.012], [-0.16, 0.026]], 0.036, 0.005);
    const stockPad = profile([[-0.31, -0.041], [-0.322, -0.042], [-0.322, 0.071], [-0.31, 0.07]], 0.038, 0.003);
    // nişangâh (red dot): gövde, ön/arka lens, kırmızı nokta
    const optic = lathe([[0.0001, -0.03], [0.016, -0.03], [0.018, -0.026], [0.018, 0.026], [0.016, 0.03], [0.0001, 0.03]], 0, 0.108, 0.07, 16);
    const opticMount = [rbox(0.022, 0.02, 0.04, 0, 0.09, 0.07, 0.003), vcyl(0.0055, 0.008, 0, 0.128, 0.07, 8), xcyl(0.0055, 0.008, 0.021, 0.108, 0.07, 8)];
    const lensF = lathe([[0.0001, 0.0], [0.0145, 0.0], [0.0001, 0.0005]], 0, 0.108, 0.1006, 14);
    const lensR = lathe([[0.0001, 0.0005], [0.0145, 0.0], [0.0001, 0.0]], 0, 0.108, 0.0394, 14);
    const dot = sph(0.0012, 0, 0.108, 0.072, 6, 4);
    return {
      parts: { gunmetal: [upper, ...topRail, fwdAssist, ...charging, hg, barrel, gasBlk, hider, lower, magwell, guard, trig, buffer, optic, ...opticMount], polymer: [...mlok, port, ...hiderSlots, grip, stockPad], fde: [...mag, stock], glass: [lensF, lensR], redDot: [dot] },
      muzzle: [0, 0.052, 0.54], ejector: [0.018, 0.058, 0.07],
    };
  },
  sniper() {
    const barrel = lathe([[0.0001, 0.0], [0.0125, 0.0], [0.0118, 0.2], [0.0095, 0.6], [0.0001, 0.601]], 0, 0.05, 0.18, 14);
    const brake = lathe([[0.0001, 0.0], [0.0145, 0.0], [0.0145, 0.06], [0.012, 0.066], [0.0001, 0.066]], 0, 0.05, 0.78, 14);
    const ports = [];
    for (let i = 0; i < 3; i++) { ports.push(box(0.031, 0.006, 0.008, 0, 0.05, 0.792 + i * 0.017)); }
    const recv = cyl(0.0165, 0.25, 0, 0.05, 0.055, 16);
    const bolt = [xcyl(0.0035, 0.04, 0.035, 0.05, -0.04, 8), sph(0.008, 0.056, 0.045, -0.04, 8, 6)];
    const boltRear = lathe([[0.0001, 0.0], [0.013, 0.0], [0.014, 0.02], [0.0001, 0.02]], 0, 0.05, -0.09, 12);
    // dürbün: göz merceği çanı, gövde, objektif çanı, taretler
    const scope = lathe([
      [0.0001, -0.11], [0.019, -0.11], [0.019, -0.07], [0.013, -0.05], [0.013, 0.13], [0.023, 0.17], [0.024, 0.24], [0.0001, 0.24],
    ], 0, 0.112, 0.0, 18);
    const turrets = [vcyl(0.009, 0.02, 0, 0.13, 0.04, 12), xcyl(0.009, 0.02, 0.018, 0.112, 0.04, 12)];
    const turretCaps = [vcyl(0.0095, 0.006, 0, 0.142, 0.04, 12), xcyl(0.0095, 0.006, 0.03, 0.112, 0.04, 12)];
    const rings = [rbox(0.03, 0.03, 0.014, 0, 0.098, -0.02, 0.004), rbox(0.03, 0.03, 0.014, 0, 0.098, 0.11, 0.004)];
    const lensF = lathe([[0.0001, 0.0], [0.0215, 0.0], [0.0001, 0.001]], 0, 0.112, 0.2405, 16);
    const lensR = lathe([[0.0001, 0.001], [0.017, 0.0], [0.0001, 0.0]], 0, 0.112, -0.1105, 16);
    const stock = profile([
      [0.5, 0.03], [0.5, 0.012], [0.2, 0.004], [0.06, 0.0], [0.04, -0.012], [0.0, -0.016], [-0.02, -0.07], [-0.05, -0.075], [-0.07, -0.02],
      [-0.12, -0.03], [-0.4, -0.06], [-0.42, -0.06], [-0.42, 0.06], [-0.28, 0.075], [-0.14, 0.072], [-0.1, 0.05], [0.18, 0.048], [0.5, 0.044],
    ], 0.042, 0.007, 0, [[[-0.03, -0.004], [0.002, -0.004], [-0.006, -0.05], [-0.034, -0.055]]]);
    const pad = profile([[-0.42, -0.061], [-0.44, -0.062], [-0.44, 0.061], [-0.42, 0.06]], 0.044, 0.004);
    const cheek = rbox(0.036, 0.014, 0.12, 0, 0.082, -0.25, 0.005);
    const mag = rbox(0.024, 0.03, 0.06, 0, -0.012, 0.075, 0.003);
    const guard = triggerGuard(0.0, 0.055, 0.0, -0.032, 0.012);
    const trig = box(0.005, 0.016, 0.004, 0, -0.012, 0.022);
    const bipod = [box(0.006, 0.006, 0.2, 0.012, 0.0, 0.37), box(0.006, 0.006, 0.2, -0.012, 0.0, 0.37), box(0.034, 0.018, 0.022, 0, 0.004, 0.47)];
    return {
      parts: { blued: [barrel, brake, recv, boltRear, scope, ...turrets, ...rings, mag, guard], polymer: [...ports, pad, ...turretCaps], steel: [...bolt, trig], olive: [stock, cheek], parker: bipod, glass: [lensF, lensR] },
      muzzle: [0, 0.05, 0.846], ejector: [0.02, 0.06, 0.06],
    };
  },
  rpg() {
    const tube = lathe([
      [0.046, -0.56], [0.03, -0.46], [0.024, -0.4], [0.024, 0.46], [0.028, 0.47], [0.028, 0.5], [0.024, 0.5],
    ], 0, 0.07, 0.0, 16);
    const tubeInner = lathe([[0.022, 0.499], [0.022, 0.3]], 0, 0.07, 0.0, 12);
    const venturi = lathe([[0.043, -0.555], [0.036, -0.5]], 0, 0.07, 0.0, 16);
    const shield = lathe([[0.031, -0.12], [0.031, 0.16]], 0, 0.07, 0.0, 16);
    const bands = [lathe([[0.0325, -0.125], [0.0325, -0.11]], 0, 0.07, 0, 14), lathe([[0.0325, 0.15], [0.0325, 0.165]], 0, 0.07, 0, 14)];
    const grip1 = profile([[-0.02, 0.05], [0.02, 0.05], [0.016, -0.02], [0.006, -0.07], [-0.024, -0.07], [-0.022, -0.02]], 0.03, 0.004);
    const grip2 = profile([[-0.2, 0.05], [-0.16, 0.05], [-0.164, -0.02], [-0.172, -0.06], [-0.2, -0.06], [-0.204, -0.02]], 0.03, 0.004);
    const guard = triggerGuard(0.02, 0.075, 0.046, 0.0, 0.012);
    const trig = box(0.005, 0.02, 0.005, 0, 0.026, 0.04);
    const optic = [rbox(0.03, 0.05, 0.12, -0.05, 0.12, 0.02, 0.005), cyl(0.012, 0.05, -0.05, 0.13, -0.06, 12), box(0.02, 0.03, 0.02, -0.03, 0.095, 0.02)];
    const opticLens = cyl(0.0105, 0.002, -0.05, 0.13, -0.086, 12);
    const sights = [box(0.004, 0.04, 0.006, 0, 0.11, 0.35), box(0.02, 0.025, 0.008, 0, 0.1, 0.12)];
    // savaş başlığı (PG-7)
    const warhead = lathe([
      [0.019, 0.5], [0.019, 0.56], [0.044, 0.62], [0.044, 0.66], [0.035, 0.72], [0.02, 0.8], [0.008, 0.85], [0.006, 0.88], [0.0001, 0.885],
    ], 0, 0.07, 0.0, 16);
    const tip = lathe([[0.0001, 0.88], [0.0065, 0.88], [0.004, 0.9], [0.0001, 0.905]], 0, 0.07, 0.0, 10);
    return {
      parts: { olive: [tube, warhead, venturi], blued: [tubeInner, guard, ...bands, ...optic, ...sights], darkWood: [shield, grip1, grip2], steel: [trig, tip], glass: [opticLens] },
      muzzle: [0, 0.07, 0.9], ejector: null,
    };
  },
  grenade() {
    // F1 "ananas" el bombası: dilimli gövde, fünye, kaşık, pim halkası
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const a = i / 16 * Math.PI;
      const ridge = 1 + 0.07 * Math.max(0, Math.cos(i * Math.PI * 0.75));
      pts.push([Math.sin(a) * 0.03 * ridge, -Math.cos(a) * 0.037]);
    }
    const body = lathe(pts, 0, 0, 0, 16); body.rotateX(-Math.PI / 2);
    const grooves = [];
    for (let i = 0; i < 4; i++) {
      const a = (i + 1) / 5 * Math.PI;
      const t = torus(0.0305 * Math.sin(a), 0.0018, 0, 0, 0, Math.PI * 2, 0); t.rotateX(Math.PI / 2); t.translate(0, -Math.cos(a) * 0.037, 0); grooves.push(t);
    }
    for (let i = 0; i < 6; i++) { const v = box(0.003, 0.068, 0.003, 0, 0, 0.0306); v.rotateY(i / 6 * Math.PI * 2); grooves.push(v); }
    const fuse = [vcyl(0.009, 0.022, 0, 0.044, 0), vcyl(0.011, 0.006, 0, 0.035, 0)];
    const spoon = [box(0.012, 0.004, 0.02, 0, 0.056, 0.006), box(0.012, 0.06, 0.003, 0, 0.026, 0.034)];
    const ring = torus(0.011, 0.0016, -0.016, 0.05, 0.0, Math.PI * 2, Math.PI / 2);
    return { parts: { olive: [body], parker: grooves, steel: [...fuse, ring], gunmetal: spoon }, muzzle: [0, 0, 0], ejector: null };
  },
  // uçuş halindeki roket (savaş başlığı + motor + kanatçıklar), +Z yönüne bakar
  rocket() {
    const war = lathe([[0.0001, -0.32], [0.019, -0.32], [0.019, -0.04], [0.044, 0.02], [0.044, 0.06], [0.035, 0.12], [0.02, 0.2], [0.008, 0.25], [0.0001, 0.28]], 0, 0, 0, 14);
    const fins = [];
    for (let i = 0; i < 4; i++) { const f = box(0.002, 0.05, 0.06, 0, 0.03, -0.29); f.rotateZ(i * Math.PI / 2 + Math.PI / 4); fins.push(f); }
    const nozzle = lathe([[0.012, -0.35], [0.02, -0.32]], 0, 0, 0, 10);
    return { parts: { olive: [war], blued: [...fins, nozzle] }, muzzle: [0, 0, -0.35], ejector: null };
  },
};

// ---- [savaş: yeni silah modelleri] ----
Object.assign(DEFS, {
  kilic() {
    // polimer gövdeli köşeli sürgü (kurgusal)
    const slide = rbox(0.025, 0.031, 0.19, 0, 0.042, 0.053, 0.003);
    const serr = [];
    for (let i = 0; i < 6; i++) serr.push(box(0.026, 0.024, 0.0018, 0, 0.041, -0.03 + i * 0.0045));
    const frame = profile([[-0.042, 0.004], [0.14, 0.004], [0.145, 0.014], [0.145, 0.027], [-0.042, 0.027]], 0.022, 0.002);
    const grip = profile([[-0.046, 0.008], [0.004, 0.008], [0.008, -0.03], [0.004, -0.09], [-0.046, -0.09], [-0.056, -0.03], [-0.06, 0.01]], 0.029, 0.004);
    grip.rotateX(0.3); grip.translate(0, 0, 0.012);
    const guard = triggerGuard(-0.004, 0.06, 0.006, -0.028, 0.011);
    const trig = box(0.005, 0.016, 0.004, 0, -0.006, 0.018);
    const sights = [box(0.016, 0.007, 0.008, 0, 0.061, -0.035), box(0.004, 0.007, 0.006, 0, 0.061, 0.14)];
    const bore = cyl(0.0045, 0.004, 0, 0.042, 0.149, 10);
    return { parts: { polymer: [frame, grip, guard, ...sights, bore], gunmetal: [slide, ...serr], steel: [trig] }, muzzle: [0, 0.042, 0.152], ejector: [0.01, 0.058, 0.05] };
  },
  kartal() {
    // iri krom gövde, üst kanal, kauçuk kabza
    const slide = profile([[-0.055, 0.026], [0.2, 0.026], [0.2, 0.06], [0.19, 0.072], [-0.045, 0.072], [-0.055, 0.062]], 0.032, 0.003);
    const ribTop = box(0.012, 0.006, 0.2, 0, 0.075, 0.08);
    const frame = profile([[-0.05, 0.004], [0.19, 0.004], [0.19, 0.027], [-0.05, 0.027]], 0.028, 0.002);
    const grip = profile([[-0.05, 0.008], [0.006, 0.008], [0.01, -0.03], [0.006, -0.1], [-0.05, -0.1], [-0.06, -0.03], [-0.066, 0.012]], 0.034, 0.004);
    grip.rotateX(0.22); grip.translate(0, 0, 0.012);
    const guard = triggerGuard(-0.002, 0.07, 0.006, -0.03, 0.012);
    const trig = box(0.006, 0.017, 0.005, 0, -0.007, 0.022);
    const hammer = box(0.01, 0.016, 0.01, 0, 0.075, -0.055);
    const bore = cyl(0.007, 0.004, 0, 0.048, 0.201, 10);
    return { parts: { chrome: [slide, ribTop, frame, hammer], rubber: [grip], blued: [guard, bore], steel: [trig] }, muzzle: [0, 0.048, 0.205], ejector: [0.012, 0.068, 0.06] };
  },
  akrep() {
    // kısa makineli: kutu gövde, susturucu, dikey ön tutamak, katlanır dipçik
    const recv = rbox(0.034, 0.05, 0.22, 0, 0.042, 0.06, 0.004);
    const top = rail(0.18, 0, 0.069, 0.05, 10, 0.018);
    const barrel = cyl(0.008, 0.05, 0, 0.044, 0.19, 10);
    const supp = cyl(0.014, 0.06, 0, 0.044, 0.24, 12);
    const grip = profile([[-0.02, 0.018], [0.02, 0.018], [0.022, -0.05], [0.018, -0.09], [-0.022, -0.09], [-0.026, -0.05]], 0.028, 0.004);
    grip.rotateX(0.12);
    const vgrip = vcyl(0.011, 0.07, 0, -0.018, 0.14, 10);
    const mag = rbox(0.022, 0.1, 0.03, 0, -0.04, 0.085, 0.002);
    const guard = triggerGuard(0.02, 0.07, 0.017, -0.026, 0.012);
    const stock = [box(0.004, 0.01, 0.16, 0.019, 0.04, -0.12), box(0.036, 0.05, 0.008, 0, 0.034, -0.2)];
    return { parts: { polymer: [recv, grip, vgrip, guard, ...stock], blued: [barrel, mag], gunmetal: [supp], steel: top }, muzzle: [0, 0.044, 0.272], ejector: [0.02, 0.05, 0.07] };
  },
  cifte() {
    // kesik namlulu çifte: yan yana iki kısa namlu, kısaltılmış ahşap kabza
    const b1 = cyl(0.011, 0.3, 0.0115, 0.05, 0.2, 12), b2 = cyl(0.011, 0.3, -0.0115, 0.05, 0.2, 12);
    const rib = box(0.008, 0.004, 0.3, 0, 0.063, 0.2);
    const recv = rbox(0.046, 0.05, 0.1, 0, 0.035, 0.0, 0.004);
    const fore = profile([[0.06, 0.03], [0.25, 0.034], [0.25, 0.018], [0.06, 0.012]], 0.04, 0.004);
    const grip = profile([[-0.05, 0.05], [-0.05, 0.01], [-0.08, -0.03], [-0.1, -0.075], [-0.14, -0.075], [-0.12, -0.02], [-0.11, 0.05]], 0.036, 0.006);
    const guard = triggerGuard(-0.01, 0.04, 0.008, -0.026, 0.012);
    const hammers = [box(0.006, 0.014, 0.012, 0.012, 0.066, -0.04), box(0.006, 0.014, 0.012, -0.012, 0.066, -0.04)];
    return { parts: { blued: [b1, b2, rib, recv, guard, ...hammers], wood: [fore, grip] }, muzzle: [0, 0.05, 0.352], ejector: null };
  },
  tufan() {
    // hafif makineli: kalın namlu, delikli ceket, taşıma kolu, kutu şarjör, iki ayak
    const recv = profile([[-0.08, 0.0], [0.22, 0.0], [0.22, 0.07], [-0.07, 0.07], [-0.08, 0.05]], 0.044, 0.003);
    const cover = box(0.046, 0.012, 0.22, 0, 0.076, 0.07);
    const barrel = cyl(0.011, 0.5, 0, 0.045, 0.47, 12);
    const jacket = cyl(0.02, 0.22, 0, 0.045, 0.33, 12);
    const holes = [];
    for (let i = 0; i < 5; i++) holes.push(box(0.042, 0.006, 0.012, 0, 0.045, 0.24 + i * 0.04));
    const handle = [box(0.01, 0.04, 0.012, 0, 0.1, 0.12), box(0.01, 0.012, 0.12, 0, 0.12, 0.1)];
    const box1 = rbox(0.07, 0.09, 0.1, 0.0, -0.05, 0.08, 0.006);
    const grip = profile([[-0.022, 0.0], [0.016, 0.0], [0.012, -0.08], [-0.026, -0.085], [-0.032, -0.04]], 0.03, 0.004);
    grip.rotateX(0.2);
    const guard = triggerGuard(-0.004, 0.05, 0.0, -0.03, 0.012);
    const stock = profile([[-0.08, 0.06], [-0.08, -0.004], [-0.36, -0.03], [-0.38, -0.03], [-0.38, 0.07], [-0.2, 0.07]], 0.04, 0.005);
    const bipod = [box(0.006, 0.006, 0.22, 0.014, 0.025, 0.55), box(0.006, 0.006, 0.22, -0.014, 0.025, 0.55)];
    const hider = cyl(0.014, 0.05, 0, 0.045, 0.74, 10);
    return { parts: { parker: [recv, cover, barrel, jacket, hider], polymer: [...holes, grip, guard, stock], olive: [box1], steel: [...handle, ...bipod] }, muzzle: [0, 0.045, 0.765], ejector: [0.024, 0.05, 0.07] };
  },
  bozkurt() {
    // yarı otomatik nişancı tüfeği: ince uzun namlu, dürbün, kısa şarjör
    const recv = profile([[-0.07, 0.01], [0.2, 0.01], [0.2, 0.06], [-0.06, 0.06], [-0.07, 0.05]], 0.034, 0.002);
    const barrel = lathe([[0.0001, 0.0], [0.011, 0.0], [0.009, 0.5], [0.0001, 0.501]], 0, 0.045, 0.2, 12);
    const brake = cyl(0.013, 0.05, 0, 0.045, 0.72, 12);
    const hg = rbox(0.04, 0.045, 0.3, 0, 0.04, 0.35, 0.006);
    const scope = lathe([[0.0001, -0.1], [0.017, -0.1], [0.017, -0.06], [0.012, -0.04], [0.012, 0.11], [0.02, 0.15], [0.021, 0.2], [0.0001, 0.2]], 0, 0.1, 0.04, 16);
    const rings = [rbox(0.026, 0.03, 0.012, 0, 0.078, -0.01, 0.004), rbox(0.026, 0.03, 0.012, 0, 0.078, 0.12, 0.004)];
    const mag = rbox(0.024, 0.07, 0.05, 0, -0.025, 0.08, 0.003);
    const grip = profile([[-0.022, 0.012], [0.016, 0.012], [0.012, -0.07], [-0.026, -0.075], [-0.032, -0.03]], 0.03, 0.004);
    grip.rotateX(0.22);
    const guard = triggerGuard(-0.004, 0.05, 0.008, -0.028, 0.012);
    const stock = profile([[-0.07, 0.06], [-0.07, 0.0], [-0.38, -0.04], [-0.4, -0.04], [-0.4, 0.08], [-0.25, 0.085], [-0.12, 0.07]], 0.04, 0.006);
    const lensF = lathe([[0.0001, 0.0], [0.019, 0.0], [0.0001, 0.001]], 0, 0.1, 0.2405, 16);
    return { parts: { blued: [recv, barrel, brake, scope, ...rings, mag, guard], fde: [hg, stock], polymer: [grip], glass: [lensF] }, muzzle: [0, 0.045, 0.745], ejector: [0.018, 0.055, 0.07] };
  },
  simsek() {
    // altı atımlık tamburlu bombaatar
    const tube = cyl(0.024, 0.3, 0, 0.06, 0.22, 14);
    const bore = cyl(0.02, 0.004, 0, 0.06, 0.371, 12);
    const drum = cyl(0.06, 0.12, 0, 0.04, 0.02, 12);
    const flutes = [];
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; flutes.push(cyl(0.012, 0.122, Math.cos(a) * 0.05, 0.04 + Math.sin(a) * 0.05, 0.02, 8)); }
    const frame = box(0.03, 0.03, 0.34, 0, 0.11, 0.12);
    const grip = profile([[-0.03, 0.0], [0.01, 0.0], [0.006, -0.08], [-0.032, -0.085], [-0.038, -0.04]], 0.03, 0.004);
    grip.rotateX(0.15); grip.translate(0, -0.02, -0.06);
    const fgrip = vcyl(0.013, 0.08, 0, 0.0, 0.25, 10);
    const stock = profile([[-0.08, 0.1], [-0.08, 0.02], [-0.3, -0.01], [-0.32, -0.01], [-0.32, 0.1]], 0.036, 0.005);
    const sight = box(0.03, 0.04, 0.03, 0, 0.14, 0.2);
    return { parts: { olive: [tube, drum, frame], gunmetal: [...flutes, bore, sight], polymer: [grip, fgrip, stock] }, muzzle: [0, 0.06, 0.375], ejector: null };
  },
  // 40 mm bomba mermisi (uçuşta)
  gl40() {
    const body = lathe([[0.0001, -0.03], [0.02, -0.03], [0.02, 0.01], [0.016, 0.03], [0.0001, 0.04]], 0, 0, 0, 12);
    return { parts: { brass: [body] }, muzzle: [0, 0, 0], ejector: null };
  },
});

// Birleştirilmiş geometri önbelleği: id -> [{geo, mat}], muzzle, ejector
const CACHE = new Map();
function getDef(id) {
  if (CACHE.has(id)) return CACHE.get(id);
  const fn = DEFS[id];
  if (!fn) { CACHE.set(id, null); return null; }
  const d = fn();
  const m = mats();
  const parts = [];
  for (const [k, list] of Object.entries(d.parts)) {
    if (!list || !list.length) continue;
    const geo = merge(list);
    if (k !== 'wood' && k !== 'darkWood' && k !== 'batWood') boxUV(geo); // ahşap kendi damar UV'sini korur
    parts.push({ geo, mat: m[k] || m.gunmetal });
  }
  const out = { parts, muzzle: d.muzzle, ejector: d.ejector };
  CACHE.set(id, out);
  return out;
}

// Silah modeli: namlu +Z yönünde, kabza orijinde.
// userData.muzzle (namlu ucu), userData.ejector (kovan atma penceresi, yoksa null)
export function buildWeaponModel(id) {
  if (id === 'fists') return null;
  const d = getDef(id);
  if (!d) return null;
  const g = new THREE.Group();
  for (const p of d.parts) {
    const mesh = new THREE.Mesh(p.geo, p.mat);
    mesh.castShadow = true;
    g.add(mesh);
  }
  const muzzle = new THREE.Object3D(); muzzle.position.fromArray(d.muzzle); g.add(muzzle);
  g.userData.muzzle = muzzle;
  if (d.ejector) { const e = new THREE.Object3D(); e.position.fromArray(d.ejector); g.add(e); g.userData.ejector = e; } else g.userData.ejector = null;
  g.userData.weaponId = id;
  return g;
}

// Uçan roket modeli (savaş sistemi kullanır)
export function buildRocketModel() { return buildWeaponModel('rocket'); }

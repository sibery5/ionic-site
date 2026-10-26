// Bitki örtüsü: çınar, ıhlamur (cadde), servi, fıstık çamı, palmiye (yaprak kartları + rüzgâr), laleli çiçek
// tarhları, çit (şimşir), oyun parkları ve çeşmeler. Ağaçlar yakın/uzak örnekleyici ile tek çizimde.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RNG } from '../core/util.js';
import { leafTexture, barkPBR, grassPBR } from '../core/textures.js';
import { foliageMaterial, pbrMaterial } from './shaders.js';
import { NearInstancer, GeoBuilder } from './instancer.js';
import { isLand } from './map.js';

// Yaprak kartları: elipsoit içinde rastgele yönlü kareler; normaller taç merkezinden dışa (yumuşak gölgeleme)
function crown(rng, n, cx, cy, cz, rx, ry, rz, card) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.PlaneGeometry(card, card);
    const u = rng.float(-1, 1), th = rng.float(0, 6.28), rr = Math.cbrt(rng.next()) * 0.85;
    const s = Math.sqrt(1 - u * u);
    const px = cx + Math.cos(th) * s * rx * rr, py = cy + u * ry * rr, pz = cz + Math.sin(th) * s * rz * rr;
    g.rotateX(rng.float(-1.2, 1.2)); g.rotateY(rng.float(0, 6.28)); g.rotateZ(rng.float(-0.6, 0.6));
    g.translate(px, py, pz);
    const p = g.attributes.position, nrm = g.attributes.normal;
    for (let k = 0; k < p.count; k++) {
      const vx = (p.getX(k) - cx) / rx, vy = (p.getY(k) - cy) / ry + 0.35, vz = (p.getZ(k) - cz) / rz;
      const l = Math.hypot(vx, vy, vz) || 1;
      nrm.setXYZ(k, vx / l, vy / l, vz / l);
    }
    parts.push(g);
  }
  return parts;
}
function trunkGeo(h, r0, r1, seg = 7, bendX = 0) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 4, true);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / h; p.setX(i, p.getX(i) + bendX * y * y); }
  g.computeVertexNormals();
  return g;
}

const SPECIES = {
  plane: (rng) => {
    const tr = [trunkGeo(4.2, 0.42, 0.28)];
    for (let i = 0; i < 4; i++) { const b = trunkGeo(3, 0.18, 0.08); b.rotateZ(rng.float(0.5, 0.9)); b.rotateY(i * 1.57 + rng.float(0, 0.6)); b.translate(0, 3.6, 0); tr.push(b); }
    const cr = [...crown(rng, 30, 0, 7.2, 0, 4.2, 2.8, 4.2, 2.6), ...crown(rng, 14, 1.5, 9.0, 0.6, 2.6, 1.8, 2.6, 2.2), ...crown(rng, 12, -1.6, 8.2, -1, 2.4, 1.7, 2.4, 2.2)];
    return { trunk: mergeGeometries(tr.map((g) => g.toNonIndexed())), crown: mergeGeometries(cr) };
  },
  linden: (rng) => ({ trunk: trunkGeo(3.2, 0.2, 0.14), crown: mergeGeometries(crown(rng, 26, 0, 4.9, 0, 2.3, 2.0, 2.3, 1.9)) }),
  cypress: (rng) => {
    const cr = [];
    for (let i = 0; i < 6; i++) cr.push(...crown(rng, 7, 0, 1.6 + i * 1.35, 0, 0.95 - i * 0.1, 1.1, 0.95 - i * 0.1, 1.5));
    return { trunk: trunkGeo(2, 0.16, 0.12, 6), crown: mergeGeometries(cr) };
  },
  pine: (rng) => {
    const tr = [trunkGeo(8.5, 0.3, 0.2, 7, 1.2)];
    const cr = [...crown(rng, 30, 1.2, 9.4, 0, 4.6, 1.2, 4.6, 2.6), ...crown(rng, 10, 1.2, 10.2, 0, 3, 0.7, 3, 2.2)];
    return { trunk: mergeGeometries(tr), crown: mergeGeometries(cr) };
  },
  palm: (rng) => {
    const t = new THREE.CylinderGeometry(0.2, 0.3, 7, 8, 8, true); t.translate(0, 3.5, 0);
    const p = t.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); const ring = 1 + 0.12 * Math.abs(Math.sin(y * 6)); p.setX(i, p.getX(i) * ring + 0.03 * y * y * 0.1); p.setZ(i, p.getZ(i) * ring); }
    t.computeVertexNormals();
    const fr = [];
    for (let i = 0; i < 9; i++) {
      const g = new THREE.PlaneGeometry(4, 1.6, 4, 1);
      const pp = g.attributes.position;
      for (let k = 0; k < pp.count; k++) { const x = pp.getX(k) + 2; pp.setX(k, x); pp.setY(k, pp.getY(k) * 0.5 - 0.12 * x * x * 0.25); pp.setZ(k, pp.getY(k) * 0.8); }
      g.rotateZ(rng.float(0.1, 0.4)); g.rotateY((i / 9) * 6.28 + rng.float(0, 0.3)); g.translate(0.2, 7, 0);
      g.computeVertexNormals();
      fr.push(g);
    }
    return { trunk: t, crown: mergeGeometries(fr) };
  },
};

export function buildVegetation(city) {
  const { map, physics, quality } = city;
  const cols = physics.city;
  const rng = new RNG(808);
  const bark = pbrMaterial(barkPBR(quality), { scale: 1.2, color: 0xffffff });
  const leafMats = { broad: foliageMaterial(leafTexture('broad')), needle: foliageMaterial(leafTexture('needle')), palm: foliageMaterial(leafTexture('palm')) };
  const inst = {};
  const R = quality === 'low' ? 380 : 650;
  for (const [k, fn] of Object.entries(SPECIES)) {
    const g = fn(new RNG(k.length * 77));
    const leaf = k === 'palm' ? leafMats.palm : k === 'cypress' || k === 'pine' ? leafMats.needle : leafMats.broad;
    inst[k] = { trunk: new NearInstancer(g.trunk, bark, { radius: R, cell: 60, shadow: true }), crown: new NearInstancer(g.crown, leaf, { radius: R, cell: 60, shadow: quality !== 'low' }) };
    inst[k].trunk.name = 'tree:' + k; inst[k].crown.name = 'crown:' + k;
  }
  const col = new THREE.Color();
  const tree = (k, x, z, s, y = 0.15) => {
    if (!isLand(x, z)) return;
    const ry = rng.float(0, 6.28);
    inst[k].trunk.addTRS(x, y, z, ry, s, s, s);
    const h = k === 'cypress' ? 0.3 : k === 'palm' ? 0.28 : 0.25 + rng.float(-0.03, 0.03);
    inst[k].crown.addTRS(x, y, z, ry, s, s, s, col.setHSL(h, k === 'cypress' ? 0.35 : 0.5, (k === 'cypress' ? 0.26 : 0.38) + rng.float(-0.06, 0.06)));
    const tr = k === 'plane' ? 0.45 : 0.25;
    cols.addCircle(x, z, tr * s, 0, 4 * s, 'tree');
  };
  city.addTree = tree;
  // park ağaçları
  for (const p of map.parks) {
    const nearSea = p.cz > 700 || Math.abs(p.cx - 200) < 120 || Math.abs(p.cx - 420) < 120;
    for (let x = p.x0 + 4; x < p.x1 - 2; x += 9) for (let z = p.z0 + 4; z < p.z1 - 2; z += 9) {
      const tx = x + rng.float(-2.5, 2.5), tz = z + rng.float(-2.5, 2.5);
      if (Math.abs(tx - p.cx) < 19 && Math.abs(tz - p.cz) < 19) continue;
      const u = (tx - p.x0) / (p.x1 - p.x0), v = (tz - p.z0) / (p.z1 - p.z0);
      if (Math.abs(u - v) < 0.07 || Math.abs(u + v - 1) < 0.07) continue;
      if (!rng.chance(0.75)) continue;
      const k = rng.next();
      tree(k < 0.45 ? 'plane' : k < 0.65 ? 'cypress' : k < 0.85 ? 'pine' : nearSea ? 'palm' : 'linden', tx, tz, rng.float(0.8, 1.25));
    }
  }
  // cadde ağaçları (ıhlamur) — bazı blok kenarlarında kaldırımda
  for (const b of map.blocks) {
    if (b.kind !== 'city' || !rng.chance(0.3)) continue;
    for (let x = b.x0 + 5; x < b.x1 - 3; x += 12) tree('linden', x, b.z0 - 2.0, rng.float(0.75, 1.0));
  }
  // sahil palmiyeleri (Kadıköy-Moda / Marmara kıyısı)
  for (let x = -980; x < 1000; x += rng.float(18, 30)) { if (x > 190 && x < 430) continue; tree('palm', x, 816, rng.float(0.85, 1.15), 0); }

  // çit (şimşir) ve lale tarhları
  const hedgeMat = pbrMaterial(grassPBR(quality), { color: 0x6a9a50, scale: 1.4, normalScale: 2.5 });
  const hedgeBox = new THREE.BoxGeometry(1, 1, 1); hedgeBox.translate(0, 0.5, 0);
  const hedges = new NearInstancer(hedgeBox, hedgeMat, { radius: 360, cell: 60, shadow: true });
  hedges.name = 'hedge';
  const tulipGeo = (() => { const g = new GeoBuilder(); g.cyl(0.012, 0.012, 0.36, 4, { color: 0x3a7a2a }); g.add(new THREE.ConeGeometry(0.055, 0.12, 6, 1, true), { y: 0.4, rx: Math.PI, rough: 0.6 }); g.sphere(0.045, { y: 0.37, rough: 0.6 }, 6, 4); g.box(0.1, 0.012, 0.03, { y: 0.12, rz: 0.6, color: 0x3a7a2a }); return g.build(); })();
  const tulips = new NearInstancer(tulipGeo, city.propsMat, { radius: 90, cell: 30 });
  tulips.name = 'tulips';
  const bedGeo = new GeoBuilder().box(1, 0.25, 1, { color: 0xb8b0a0, rough: 0.9 }).box(0.92, 0.27, 0.92, { color: 0x3a2a1c, rough: 1 }).build();
  const beds = new NearInstancer(bedGeo, city.propsMat, { radius: 300, cell: 60 });
  beds.name = 'bed';
  const TC = ['#d01020', '#f2c200', '#e8509a', '#7a2a9a', '#f4f0e8', '#ff6a1a'];
  const bed = (cx, cz, w, d, ry) => {
    beds.addTRS(cx, 0.15, cz, ry, w, 1, d);
    const c1 = TC[rng.int(0, TC.length - 1)], c2 = TC[rng.int(0, TC.length - 1)];
    const cs = Math.cos(ry), sn = Math.sin(ry);
    for (let a = -w / 2 + 0.2; a < w / 2 - 0.15; a += 0.24) for (let b = -d / 2 + 0.2; b < d / 2 - 0.15; b += 0.24) {
      const lx = a + rng.float(-0.06, 0.06), lz = b + rng.float(-0.06, 0.06);
      const band = Math.floor((a + w / 2) / 1.2) % 2;
      tulips.addTRS(cx + lx * cs + lz * sn, 0.4, cz - lx * sn + lz * cs, rng.float(0, 6.28), 1, rng.float(0.85, 1.2), 1, col.set(band ? c1 : c2));
    }
    cols.addOBB(cx, cz, w, d, ry, 0, 0.4, 'bed');
  };
  city.addHedge = (x0, z0, x1, z1, h = 1.1) => { hedges.addTRS((x0 + x1) / 2, 0.15, (z0 + z1) / 2, 0, Math.max(0.8, x1 - x0), h, Math.max(0.8, z1 - z0)); cols.add(x0, z0, x1, z1, 0, h, 'hedge'); };
  city.addBed = bed;
  const P = city.props;
  map.parks.forEach((p, pi) => {
    // kenar çitleri (giriş boşlukları bırakılarak)
    const gap = 6;
    for (const [a0, a1, fixed, horiz] of [[p.x0, p.x1, p.z0 + 0.6, true], [p.x0, p.x1, p.z1 - 0.6, true], [p.z0, p.z1, p.x0 + 0.6, false], [p.z0, p.z1, p.x1 - 0.6, false]]) {
      const mid = (a0 + a1) / 2;
      for (const [s0, s1] of [[a0 + gap, mid - gap / 2], [mid + gap / 2, a1 - gap]]) {
        if (s1 - s0 < 2) continue;
        if (horiz) city.addHedge(s0, fixed - 0.4, s1, fixed + 0.4); else city.addHedge(fixed - 0.4, s0, fixed + 0.4, s1);
      }
    }
    // laleli tarhlar: çeşme çevresinde
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      bed(p.cx + Math.cos(a) * 14, p.cz + Math.sin(a) * 14, 6, 2.2, -a + Math.PI / 2);
    }
    // banklar ve klasik lambalar halka yol üzerinde
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const x = p.cx + Math.sin(a) * 10.5, z = p.cz + Math.cos(a) * 10.5;
      if (k % 2 === 0) { P.bench.addTRS(x, 0.15, z, a + Math.PI); cols.breakable(cols.addLocal(x, z, a + Math.PI, 0, -0.04, 1.8, 0.56, 0, 0.9, 'bench'), 'bench', 70, P.bench, x, 0.15, z, a + Math.PI); (city.benches || (city.benches = [])).push([x, z, a + Math.PI]); }
      else { const lx = p.cx + Math.sin(a) * 12, lz = p.cz + Math.cos(a) * 12; P.lampClassic.addTRS(lx, 0.15, lz, 0); cols.addCircle(lx, lz, 0.25, 0, 4.9, 'lamp'); }
    }
    // çeşme
    P.fountain.addTRS(p.cx, 0.15, p.cz, 0);
    cols.addCircle(p.cx, p.cz, 3.4, 0, 0.75, 'fountain');
    cols.addCircle(p.cx, p.cz, 0.65, 0, 3.5, 'fountain');
    // oyun parkı (her iki parktan birinde)
    if (pi % 2 === 0 && p.x1 - p.x0 > 50) {
      const px = p.x0 + 12, pz = p.z1 - 12;
      P.playground.addTRS(px, 0.15, pz, 0);
      cols.add(px - 5.1, pz - 0.9, px - 1.9, pz + 0.9, 0, 2.5, 'playground'); // salıncak
      cols.add(px + 0.55, pz - 0.65, px + 1.85, pz + 0.65, 0, 2.6, 'playground'); // kaydırak kulesi
      cols.add(px + 0.75, pz + 0.65, px + 1.65, pz + 3.4, 0, 1.4, 'playground'); // kaydırak
      cols.add(px + 2.4, pz - 0.25, px + 5.6, pz + 0.25, 0, 0.8, 'playground'); // tahterevalli
    }
  });
  city.finalizeLater.push(() => {
    for (const k in inst) { city.addNear(inst[k].trunk); city.addNear(inst[k].crown); }
    city.addNear(hedges); city.addNear(tulips); city.addNear(beds);
  });
}

export const PARK_PROP_DEFS = {
  fountain: () => {
    const g = new GeoBuilder();
    g.add(new THREE.CylinderGeometry(3.3, 3.4, 0.6, 8), { y: 0.3, color: 0xd8d0c0, rough: 0.7 });
    g.add(new THREE.CylinderGeometry(3.0, 3.0, 0.05, 8), { y: 0.55, color: 0x2a6a8a, rough: 0.04, metal: 0.1 });
    g.cyl(0.45, 0.6, 1.4, 8, { y: 0.55, color: 0xd8d0c0, rough: 0.6 });
    g.add(new THREE.CylinderGeometry(1.2, 0.5, 0.3, 8), { y: 2.05, color: 0xd8d0c0, rough: 0.6 });
    g.add(new THREE.CylinderGeometry(1.1, 1.1, 0.04, 8), { y: 2.18, color: 0x2a6a8a, rough: 0.04 });
    g.cyl(0.18, 0.25, 0.9, 8, { y: 2.2, color: 0xd8d0c0 });
    g.sphere(0.28, { y: 3.2, color: 0xd8d0c0 }, 8, 6);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.28; g.add(new THREE.CylinderGeometry(0.02, 0.05, 1.2, 4), { x: Math.cos(a) * 0.6, y: 2.7, z: Math.sin(a) * 0.6, rz: Math.cos(a) * 0.6, rx: -Math.sin(a) * 0.6, color: 0xcfe8f4, rough: 0.05, emis: 0.15 }); }
    return g.build();
  },
  playground: () => {
    const g = new GeoBuilder();
    // salıncak
    for (const x of [-4.8, -2.2]) { g.box(0.08, 2.4, 0.08, { x, z: -0.6, rx: 0.25, uv: 'play2' }); g.box(0.08, 2.4, 0.08, { x, z: 0.6, rx: -0.25, uv: 'play2' }); }
    g.add(new THREE.CylinderGeometry(0.05, 0.05, 2.7, 6), { x: -3.5, y: 2.3, rz: Math.PI / 2, color: 0x3a3a3a, metal: 0.6 });
    for (const x of [-4.1, -2.9]) { g.box(0.02, 1.7, 0.02, { x: x - 0.2, y: 0.6, color: 0x888888, metal: 0.8 }); g.box(0.02, 1.7, 0.02, { x: x + 0.2, y: 0.6, color: 0x888888, metal: 0.8 }); g.box(0.5, 0.05, 0.2, { x, y: 0.58, uv: 'play0' }); }
    // kaydırak
    g.box(1.2, 1.6, 1.2, { x: 1.2, uv: 'play1' });
    g.box(0.9, 0.06, 3.2, { x: 1.2, y: 0.85, z: 1.9, rx: 0.5, uv: 'play0', rough: 0.3 });
    g.add(new THREE.ConeGeometry(0.95, 0.9, 4), { x: 1.2, y: 2.05, ry: Math.PI / 4, uv: 'play0' });
    for (const [x, z] of [[0.65, -0.55], [1.75, -0.55], [0.65, 0.55], [1.75, 0.55]]) g.box(0.08, 1.6, 0.08, { x, z, uv: 'play2', y: 1.6 });
    // tahterevalli
    g.box(0.2, 0.5, 0.2, { x: 4, uv: 'play3' });
    g.box(3.2, 0.06, 0.3, { x: 4, y: 0.5, rz: 0.15, uv: 'play1' });
    return g.build();
  },
};
export const PARK_PROP_OPTS = { fountain: { radius: 500, shadow: true }, playground: { radius: 250, shadow: true } };

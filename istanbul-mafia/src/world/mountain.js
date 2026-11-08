// Aydos Dağı görselleri ve çarpışmaları (yükseklik alanı: terrain.js):
//  - arazi ağı (1.5 m ızgara) + dağ malzemesi: çim, toprak, iğne yaprak örtüsü, eğimde kaya (üç düzlemli),
//    yol kenarında çakıllı banket — eğim/yükseklik/gürültüye göre karışır
//  - virajlı dağ yolu: aşınmış asfalt şerit, kenar çizgileri, kesikli sarı orta çizgi
//  - uçurum tarafında çelik bariyer (W profil + dikmeler), yarma tarafında kaya şevi çarpışması
//  - batı kenarında (şehir caddesi) taş istinat duvarı
//  - çam ormanı, dağınık kaya ve iri kayalar, zirvedeki dağ evi
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FOREST } from './map.js';
import { MOUNTAIN, terrainHeight, roadDistance, naturalHeight, initMountain } from './terrain.js';
import { SHARED, pbrMaterial, markingMaterial } from './shaders.js';
import { asphaltPBR, grassPBR, ashlarPBR, steelPBR, noiseTexture, fbm, vnoise } from '../core/textures.js';
import { RNG } from '../core/util.js';

// ---------- prosedürel kaya / çakıl dokuları ----------
function hI(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function dtex(d, S, srgb) {
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}
function makeSet(S, k, fn) {
  const col = new Uint8Array(S * S * 4), nrm = new Uint8Array(S * S * 4), H = new Float32Array(S * S), o = [0, 0, 0, 0, 0];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    fn(x / S, y / S, o, x, y); const i = y * S + x;
    col[i * 4] = Math.min(255, Math.max(0, o[0] * 255)); col[i * 4 + 1] = Math.min(255, Math.max(0, o[1] * 255)); col[i * 4 + 2] = Math.min(255, Math.max(0, o[2] * 255)); col[i * 4 + 3] = Math.min(255, Math.max(0, o[4] * 255));
    H[i] = o[3];
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, dx = (H[y * S + ((x + 1) % S)] - H[y * S + ((x - 1 + S) % S)]) * k, dy = (H[((y + 1) % S) * S + x] - H[((y - 1 + S) % S) * S + x]) * k, l = Math.hypot(dx, dy, 1);
    nrm[i * 4] = (-dx / l * 0.5 + 0.5) * 255; nrm[i * 4 + 1] = (dy / l * 0.5 + 0.5) * 255; nrm[i * 4 + 2] = (1 / l * 0.5 + 0.5) * 255; nrm[i * 4 + 3] = H[i] * 255;
  }
  return { map: dtex(col, S, true), normalMap: dtex(nrm, S, false) };
}
let _rock = null, _grav = null;
// kaya: katmanlı kireçtaşı/granit — çatlaklar, tabakalanma, liken lekeleri
function rockSet(q) {
  return _rock || (_rock = makeSet(q === 'low' ? 256 : 512, 4, (u, v, o, x, y) => {
    const n = fbm(u, v, 6, 5, 201), m = fbm(u, v, 24, 3, 203);
    const strata = Math.abs(Math.sin((v * 9 + n * 2.2) * Math.PI));
    const crack = Math.min(1, Math.abs(vnoise(u * 14, v * 14, 14, 205) - 0.5) * 9);
    let c = 0.34 + n * 0.22 + m * 0.08 - (1 - crack) * 0.12 - (strata < 0.12 ? 0.06 : 0);
    const lich = fbm(u, v, 10, 3, 207) > 0.64 ? 1 : 0;
    o[0] = c * (lich ? 0.95 : 1.03); o[1] = c * (lich ? 1.04 : 1.0); o[2] = c * (lich ? 0.8 : 0.94);
    o[3] = n * 0.7 + m * 0.3 - (1 - crack) * 0.35; o[4] = 0.85 - m * 0.1;
  }));
}
// çakıl / toprak: yuvarlak taneler, ince toz
function gravelSet(q) {
  return _grav || (_grav = makeSet(q === 'low' ? 256 : 512, 3, (u, v, o, x, y) => {
    const N = 22, cu = u * N, cv = v * N, ix = Math.floor(cu), iy = Math.floor(cv);
    let f1 = 9, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const gx = ((ix + i) % N + N) % N, gy = ((iy + j) % N + N) % N;
      const d = Math.hypot(cu - (ix + i + hI(gx, gy, 1)), cv - (iy + j + hI(gx, gy, 2)));
      if (d < f1) { f1 = d; id = gx * 97 + gy; }
    }
    const peb = Math.max(0, 1 - f1 * 2.1), r = hI(id, 3, 4), dust = fbm(u, v, 8, 3, 211);
    const c = peb > 0.05 ? 0.38 + r * 0.25 : 0.3 + dust * 0.1;
    o[0] = c * 1.05; o[1] = c * 0.97; o[2] = c * 0.86;
    o[3] = Math.sqrt(peb) * 0.9; o[4] = 0.92;
  }));
}

// ---------- dağ zemini malzemesi ----------
let _mmat = null;
export function mountainMaterial(q) {
  if (_mmat) return _mmat;
  const G = grassPBR(q), R = rockSet(q), S = gravelSet(q), nz = noiseTexture();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, normalMap: R.normalMap });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tGA: { value: G.map }, tGN: { value: G.normalMap }, tRA: { value: R.map }, tRN: { value: R.normalMap }, tSA: { value: S.map }, tSN: { value: S.normalMap }, tNoise: { value: nz }, uWet: SHARED.uWet });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aMt; varying vec2 vMt; varying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vMt = aMt; vec4 wq = modelMatrix * vec4(transformed, 1.0); vWP = wq.xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vMt; varying vec3 vWP; varying vec3 vWN;
        uniform sampler2D tGA, tGN, tRA, tRN, tSA, tSN, tNoise; uniform float uWet;
        vec3 mN; float mR;`)
      .replace('#include <map_fragment>', `
        vec3 wn = normalize(vWN); vec2 wp = vWP.xz;
        vec4 nzL = texture2D(tNoise, wp / 97.0), nzM = texture2D(tNoise, wp / 13.0);
        float slope = 1.0 - wn.y;
        // kaya: dik yamaçlar (üç düzlemli izdüşüm; dikeyde xy/zy)
        vec3 an = abs(wn); vec2 ruv = (an.x > an.z ? vec2(vWP.z, vWP.y) : vec2(vWP.x, vWP.y)) / 6.0;
        if (an.y > 0.75) ruv = wp / 6.0;
        vec4 rA = texture2D(tRA, ruv), rN = texture2D(tRN, ruv);
        vec4 gA = texture2D(tGA, wp / 3.4), gN = texture2D(tGN, wp / 3.4);
        vec4 sA = texture2D(tSA, wp / 2.2), sN = texture2D(tSN, wp / 2.2);
        float rockW = smoothstep(0.24, 0.42, slope + (nzM.r - 0.5) * 0.22 + rN.a * 0.08);
        rockW = max(rockW, smoothstep(0.72, 0.8, nzL.b + nzM.g * 0.2) * 0.9); // kaya çıkıntıları
        float grav = vMt.x; // yol banketi
        float soil = clamp(smoothstep(0.5, 0.68, nzL.g + (nzM.b - 0.5) * 0.3) + vMt.y, 0.0, 1.0); // toprak / iğne yaprak örtüsü
        vec3 cG = gA.rgb * mix(vec3(0.92, 1.0, 0.82), vec3(1.15, 1.02, 0.7), nzL.r) * (0.85 + nzM.a * 0.2);
        vec3 cSoil = mix(vec3(0.2, 0.15, 0.1), vec3(0.27, 0.2, 0.13), nzM.r) * (0.75 + sA.r * 0.5);
        vec3 cNeedle = vec3(0.24, 0.16, 0.09) * (0.8 + gA.g * 0.6);
        vec3 alb = mix(cG, mix(cSoil, cNeedle, step(0.5, nzM.b)), soil * (1.0 - rockW));
        vec3 cR = rA.rgb * mix(vec3(1.0), vec3(1.08, 1.0, 0.9), nzL.g);
        alb = mix(alb, cR, rockW);
        alb = mix(alb, sA.rgb * vec3(1.0, 0.96, 0.9), grav);
        mR = mix(mix(0.92, rA.a, rockW), sA.a, grav);
        mN = mix(mix(gN.xyz, rN.xyz, rockW), sN.xyz, grav);
        float wet = uWet * (1.0 - smoothstep(0.3, 0.6, slope) * 0.3);
        alb *= 1.0 - 0.35 * wet; mR = mix(mR, 0.35, wet * 0.7);
        diffuseColor.rgb *= alb;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mR;')
      .replace('#include <normal_fragment_maps>', 'vec3 mapN = mN * 2.0 - 1.0; mapN.xy *= normalScale; normal = normalize(tbn * mapN);')
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.split('vNormalMapUv').join('(vWP.xz / 3.0)'));
  };
  mat.envMapIntensity = 0.3;
  mat.customProgramCacheKey = () => 'mountainGround';
  _mmat = mat;
  return mat;
}

// ---------- kurulum ----------
export function buildMountainWorld(city) {
  if (!initMountain()) return null;
  const M = MOUNTAIN, q = city.quality, cols = city.physics.city, P = city.props;
  const out = { meshes: [], guardrails: [], rockcuts: [], walls: [] };
  // ---- arazi ağı ----
  const step = 1.5, nx = Math.ceil((M.x1 - M.x0) / step), nz = Math.ceil((M.z1 - M.z0) / step);
  const g = new THREE.PlaneGeometry(nx * step, nz * step, nx, nz); g.rotateX(-Math.PI / 2);
  g.translate(M.x0 + nx * step / 2, 0, M.z0 + nz * step / 2);
  const pp = g.attributes.position, mt = new Float32Array(pp.count * 2);
  const cab = M.cabin;
  for (let i = 0; i < pp.count; i++) {
    const x = Math.min(M.x1, pp.getX(i)), z = Math.min(M.z1, pp.getZ(i));
    pp.setX(i, x); pp.setZ(i, z);
    pp.setY(i, terrainHeight(x, z) ?? 0);
    const rd = roadDistance(x, z);
    mt[i * 2] = 1 - THREE.MathUtils.smoothstep(rd, M.hw + M.shoulder - 0.3, M.hw + M.shoulder + 2.2);
    mt[i * 2 + 1] = 1 - THREE.MathUtils.smoothstep(Math.hypot(x - cab.x, z - cab.z), 8, 14);
  }
  g.setAttribute('aMt', new THREE.BufferAttribute(mt, 2));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const ground = new THREE.Mesh(g, mountainMaterial(q));
  ground.receiveShadow = true; ground.name = 'mountainGround';
  city.group.add(ground); out.meshes.push(ground);

  // ---- yol şeridi (asfalt) + çizgiler ----
  const R = M.road, hw = M.hw;
  const hAt = (x, z) => terrainHeight(x, z) ?? 0;
  const ribbon = (o0, o1, dy, filter) => {
    const pos = [], idx = [];
    let n = 0;
    for (let i = 0; i < R.length; i++) {
      const p = R[i], rx = -p.dz, rz = p.dx;
      const keep = !filter || filter(i);
      for (const o of [o0, o1]) { const x = p.x + rx * o, z = p.z + rz * o; pos.push(x, hAt(x, z) + dy, z); }
      if (i > 0 && keep && (!filter || filter(i - 1))) { const a = n - 2, b = n - 1, c = n, d = n + 1; idx.push(a, c, b, b, c, d); }
      n += 2;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    // ön yüz yukarı baksın: sarım ters ise üçgenleri çevir (arka yüz aydınlatması yolu siyah gösteriyordu)
    const nn = geo.attributes.normal; let sy = 0; for (let i = 0; i < nn.count; i++) sy += nn.getY(i);
    if (sy < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } geo.setIndex(idx); geo.computeVertexNormals(); }
    return geo;
  };
  const inside = (i) => { const p = R[i]; return p.x >= M.x0 - 6 && p.z >= M.z0 - 16 && p.z <= M.z1 + 16; };
  const asph = pbrMaterial(asphaltPBR(q), { color: 0xd8d8d8, scale: 0.2, rough: 1 });
  asph.polygonOffset = true; asph.polygonOffsetFactor = -1; asph.polygonOffsetUnits = -1;
  const road = new THREE.Mesh(ribbon(-hw, hw, 0.05, inside), asph); road.receiveShadow = true; road.name = 'mountainRoad';
  city.group.add(road); out.meshes.push(road);
  const white = markingMaterial(), yellow = markingMaterial(); yellow.color.set(0xe8b830);
  const edgeG = mergeGeometries([ribbon(-hw + 0.2, -hw + 0.34, 0.065, inside), ribbon(hw - 0.34, hw - 0.2, 0.065, inside)]);
  const wl = new THREE.Mesh(edgeG, white); wl.renderOrder = 1; city.group.add(wl);
  const yl = new THREE.Mesh(ribbon(-0.07, 0.07, 0.065, (i) => inside(i) && (i % 3) !== 2), yellow); yl.renderOrder = 1; city.group.add(yl);

  // ---- bariyerler (uçurum tarafı) ve yarma şevi çarpışması ----
  const railG = [], postG = [];
  const _q = new THREE.Quaternion(), _u = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
  const beam = (ax, ay, az, bx, by, bz, w, h) => {
    _d.set(bx - ax, by - ay, bz - az); const L = _d.length(); if (L < 0.01) return null;
    const geo = new THREE.BoxGeometry(w, h, L); _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _d.normalize());
    geo.applyQuaternion(_q); geo.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); return geo;
  };
  const OFF = hw + M.shoulder - 0.25;
  for (const s of [-1, 1]) {
    let run = null;
    const flush = () => { if (run && run.length > 1) out.guardrails.push(run); run = null; };
    for (let i = 0; i < R.length; i++) {
      const p = R[i];
      if (!inside(i) || p.y < 1.2) { flush(); continue; }
      const rx = -p.dz * s, rz = p.dx * s;
      const ex = p.x + rx * OFF, ez = p.z + rz * OFF;
      const ey = hAt(ex, ez);
      const far = terrainHeight(p.x + rx * (OFF + 5), p.z + rz * (OFF + 5));
      const up = terrainHeight(p.x + rx * (OFF + 3), p.z + rz * (OFF + 3));
      if (far !== null && far < ey - 1.6) {
        (run || (run = [])).push({ x: ex, y: ey, z: ez, i });
      } else flush();
      // yarma: şev hızla yükseliyorsa araç/yaya yamaca tırmanamaz (görünür kaya şevinin önünde)
      if (up !== null && up > ey + 1.4 && i > 0) {
        const q2 = R[i - 1], qx = q2.x + (-q2.dz * s) * (OFF + 0.9), qz = q2.z + (q2.dx * s) * (OFF + 0.9);
        out.rockcuts.push(cols.addSegment(qx, qz, p.x + rx * (OFF + 0.9), p.z + rz * (OFF + 0.9), 0.5, ey - 0.6, ey + 2.6, 'rockcut'));
      }
    }
    flush();
  }
  for (const run of out.guardrails) {
    for (let k = 1; k < run.length; k++) {
      const a = run[k - 1], b = run[k];
      if (b.i - a.i > 1) continue;
      railG.push(beam(a.x, a.y + 0.62, a.z, b.x, b.y + 0.62, b.z, 0.06, 0.32));
      cols.addSegment(a.x, a.z, b.x, b.z, 0.3, Math.min(a.y, b.y) - 0.5, Math.max(a.y, b.y) + 0.95, 'guardrail');
      if (k % 2 === 0) postG.push(new THREE.BoxGeometry(0.12, 0.85, 0.1).translate(b.x, b.y + 0.4, b.z));
    }
  }
  const stripG = (arr) => mergeGeometries(arr.filter(Boolean).map((x) => { const n = x.index ? x.toNonIndexed() : x; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k); return n; }));
  const steel = pbrMaterial(steelPBR(q), { color: 0xc4c8cc, scale: 0.6, rough: 0.5, metal: 0.6, wetK: 0 });
  if (railG.length) { const m = new THREE.Mesh(stripG(railG.concat(postG)), steel); m.castShadow = q !== 'low'; m.receiveShadow = true; city.group.add(m); out.meshes.push(m); }

  // ---- batı kenarı taş istinat duvarı (şehir caddesi tarafı) ----
  const wallG = [];
  for (let z = M.z0; z < M.z1 - 0.01; z += 2) {
    const z2 = Math.min(M.z1, z + 2);
    let h = 0; for (let t = z; t <= z2; t += 0.5) h = Math.max(h, terrainHeight(M.x0 + 0.4, t) ?? 0, terrainHeight(M.x0 + 1.2, t) ?? 0);
    if (h < 0.3 || roadDistance(M.x0 + 1, (z + z2) / 2) < 8) continue;
    const top = h + 0.9;
    wallG.push(new THREE.BoxGeometry(0.7, top + 0.2, z2 - z).translate(M.x0 - 0.35, (top - 0.2) / 2, (z + z2) / 2));
    wallG.push(new THREE.BoxGeometry(0.9, 0.18, z2 - z).translate(M.x0 - 0.35, top, (z + z2) / 2));
    const b = cols.add(M.x0 - 0.7, z, M.x0 + 0.05, z2, 0, top + 0.1, 'retainWall');
    out.walls.push(b);
  }
  if (wallG.length) {
    const wm = new THREE.Mesh(stripG(wallG), pbrMaterial(ashlarPBR(q), { color: 0xa89c88, scale: 0.55 }));
    wm.receiveShadow = true; wm.castShadow = q !== 'low'; city.group.add(wm); out.meshes.push(wm);
  }

  // ---- orman, kayalar, dağ evi ----
  const rng = new RNG(1923);
  const slopeAt = (x, z) => { const a = hAt(x + 0.8, z) - hAt(x - 0.8, z), b = hAt(x, z + 0.8) - hAt(x, z - 0.8); return Math.hypot(a, b) / 1.6; };
  FOREST.trees.length = 0;
  for (let x = M.x0 + 3; x < 999; x += 5.8) for (let z = M.z0 + 3; z < M.z1 - 1; z += 5.8) {
    const tx = x + rng.float(-2.4, 2.4), tz = z + rng.float(-2.4, 2.4);
    if (tx > 999 || roadDistance(tx, tz) < M.hw + M.shoulder + 2 || Math.hypot(tx - cab.x, tz - cab.z) < 15) continue;
    const sl = slopeAt(tx, tz);
    if (sl > 1.1 && rng.chance(0.7)) continue; // kayalık dik yamaçta seyrek
    const k = rng.next(), y = hAt(tx, tz) - 0.15;
    if (city.addTree) city.addTree(k < 0.7 ? 'pine' : k < 0.86 ? 'cypress' : 'plane', tx, tz, rng.float(0.85, 1.5), y);
    FOREST.trees.push(tx, tz);
  }
  for (let i = 0; i < 160; i++) {
    const x = rng.float(M.x0 + 2, 998), z = rng.float(M.z0 + 2, M.z1 - 2);
    if (roadDistance(x, z) < M.hw + M.shoulder + 1 || Math.hypot(x - cab.x, z - cab.z) < 13) continue;
    const sl = slopeAt(x, z);
    const s = sl > 0.7 ? rng.float(1.2, 3.2) : rng.float(0.4, 1.4); // dik yamaçta iri kayalar
    const y = hAt(x, z) - 0.25 * s;
    P.rock.addTRS(x, y, z, rng.float(0, 6.28), s, s * rng.float(0.7, 1.2), s);
    cols.addCircle(x, z, 0.8 * s, y, y + 0.9 * s + 0.25, 'rock');
  }
  const cy = cab.y;
  P.cabin.addTRS(cab.x, cy, cab.z, 0);
  cols.add(cab.x - 4.9, cab.z - 3.7, cab.x + 4.9, cab.z + 3.7, cy, cy + 4.6, 'cabin');
  for (const x of [-4.5, -1.5, 1.5, 4.5]) cols.addCircle(cab.x + x, cab.z + 6.0, 0.12, cy, cy + 2.9, 'cabinPost');
  cols.add(cab.x - 4.0, cab.z - 2.0, cab.x - 3.2, cab.z - 1.0, cy, cy + 6.8, 'chimney');
  city.addLight(cab.x - 0.3, cy + 2.6, cab.z + 6.2, 0xffb060, 0.8, true, cy + 0.03);
  return out;
}

// Harita dışındaki sıradağ silüeti yüksekliği: dağın doğal yamacına sürekli bağlanır
export function silhouetteHeight(x, z, old) {
  const M = MOUNTAIN;
  if (!M.ready || z < M.z0 - 40 || z > M.z1 + 40) return old;
  const zc = Math.max(M.z0, Math.min(M.z1, z));
  const h0 = naturalHeight(Math.min(x, 1000), zc) * (1 + 0.8 * Math.min(1, Math.max(0, x - 1000) / 260));
  const fade = z < M.z0 ? 1 - (M.z0 - z) / 40 : z > M.z1 ? 1 - (z - M.z1) / 40 : 1;
  return Math.max(old, h0 * fade);
}

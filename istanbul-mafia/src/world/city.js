// 3D şehir inşası: zemin, su, rıhtımlar, binalar (prosedürel cephe shader'ı), kapılar, tabelalar,
// balkonlar, sokak lambaları, ağaçlar, banklar ve köprüler.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WORLD_MIN, WORLD_MAX, WATER_Y, BRIDGES, ISLAND, isLand } from './map.js';
import { RNG } from '../core/util.js';
import { signTexture, waterNormalTexture, stoneTexture, makeCanvas } from '../core/textures.js';
import { buildLandmark } from './landmarks.js';

export const PALETTE = ['#e8dcc0', '#d9b98c', '#e3a982', '#f1e3a7', '#c9c3b8', '#efece4', '#b8c9a8', '#c97b5a', '#d8a7a0', '#a9b8c9', '#e7c9a0', '#cfa77a', '#9fa7a0', '#f0d0b0', '#bfae9a'];
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
  police: { label: 'EMNİYET', bg: '#0d2a6e', fg: '#ffffff' },
  estate: { label: 'EMLAK', bg: '#5a3d0d', fg: '#ffe9b0' },
  cafe: { label: 'ÇAY OCAĞI', bg: '#7a1414', fg: '#ffe9b0' },
  club: { label: 'GECE KULÜBÜ', bg: '#1a0033', fg: '#ff3df0' },
  warehouse: { label: 'DEPO', bg: '#3a3a3a', fg: '#ffcc00' },
  rival: { label: 'KÖŞK', bg: '#0d0d0d', fg: '#cccccc' },
  garage: { label: 'OTO TAMİR', bg: '#3a2a0d', fg: '#ffcc00' },
  mosque_small: { label: '', bg: '#000', fg: '#fff' },
};

// ---------- Prosedürel cephe malzemesi ----------
export function facadeMaterial(uniforms, glass = false) {
  const mat = new THREE.MeshStandardMaterial({ roughness: glass ? 0.35 : 0.9, metalness: glass ? 0.3 : 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = uniforms.uNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 wpF = vec4(transformed, 1.0);
        vec3 nF = objectNormal;
        #ifdef USE_INSTANCING
          wpF = instanceMatrix * wpF;
          nF = mat3(instanceMatrix) * nF;
        #endif
        wpF = modelMatrix * wpF;
        vWPos = wpF.xyz;
        vWNrm = normalize(mat3(modelMatrix) * nF);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos; varying vec3 vWNrm; uniform float uNight;
        float hsh(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 fEmis = vec3(0.0);
        float isWall = 1.0 - step(0.5, abs(vWNrm.y));
        vec3 tng = normalize(vec3(-vWNrm.z, 0.0, vWNrm.x));
        float fu = dot(vWPos, tng);
        float fv = vWPos.y;
        ${glass ? `
          float cw = 2.0; float fh = 3.6;
          vec2 cell = vec2(floor(fu / cw), floor(fv / fh));
          vec2 ff = vec2(fract(fu / cw), fract(fv / fh));
          float frame = step(0.06, ff.x) * step(ff.y, 0.92);
          vec3 glassC = mix(vec3(0.18, 0.26, 0.34), vec3(0.45, 0.55, 0.62), ff.y * 0.6);
          float rnd = hsh(cell + floor(vWPos.xz * 0.05) * 3.1 + vWNrm.xz * 11.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, glassC, isWall * frame);
          fEmis = isWall * frame * step(0.45, rnd) * uNight * vec3(1.0, 0.85, 0.6) * 0.9;
        ` : `
          float cw = 3.0; float fh = 3.2;
          vec2 cell = vec2(floor(fu / cw), floor(fv / fh));
          vec2 ff = vec2(fract(fu / cw), fract(fv / fh));
          float ground = 1.0 - step(3.4, fv);
          float win = step(0.24, ff.x) * step(ff.x, 0.76) * step(0.3, ff.y) * step(ff.y, 0.85) * (1.0 - ground);
          float sill = step(0.2, ff.x) * step(ff.x, 0.8) * step(0.25, ff.y) * step(ff.y, 0.3) * (1.0 - ground);
          float ledge = (1.0 - step(0.06, ff.y)) * (1.0 - ground);
          float shopU = fract(fu / 5.0);
          float shop = ground * step(0.1, shopU) * step(shopU, 0.9) * step(0.35, fv) * step(fv, 2.9);
          float rnd = hsh(cell + floor(vWPos.xz * 0.05) * 3.1 + vWNrm.xz * 11.0);
          float shutter = step(0.82, rnd) * win;
          vec3 glassC = mix(vec3(0.12, 0.15, 0.2), vec3(0.32, 0.38, 0.45), ff.y);
          vec3 wallC = diffuseColor.rgb * (0.92 + 0.08 * hsh(floor(vWPos.xz * 2.0) + floor(fv * 2.0)));
          wallC = mix(wallC, wallC * 0.72, ledge);
          wallC = mix(wallC, vec3(0.85, 0.83, 0.78), sill);
          vec3 c = mix(wallC, glassC, win);
          c = mix(c, vec3(0.35, 0.22, 0.14), shutter);
          c = mix(c, vec3(0.1, 0.12, 0.14), shop);
          diffuseColor.rgb = mix(diffuseColor.rgb * 0.55, c, isWall);
          float lit = step(0.5, rnd) * (1.0 - step(0.82, rnd));
          fEmis = isWall * (win * lit * vec3(1.0, 0.78, 0.45) * 1.1 + shop * vec3(1.0, 0.85, 0.6) * 0.9) * uNight;
          fEmis += isWall * shop * vec3(0.06, 0.06, 0.05);
        `}
      `)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += fEmis;');
  };
  return mat;
}

function pyramidGeometry() {
  // 1x1 taban, 1 yükseklik kare piramit (kiremit çatı)
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  g.rotateY(Math.PI / 4);
  g.translate(0, 0.5, 0);
  return g;
}

export class City {
  constructor(scene, map, physics, uniforms, quality) {
    this.scene = scene;
    this.map = map;
    this.physics = physics;
    this.uniforms = uniforms;
    this.quality = quality;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.rng = new RNG(99);
    this.doors = []; // {x,z,building}
    this.lampHeads = null;
  }

  build(progress = () => {}) {
    progress(0.05, 'Zemin ve yollar çiziliyor');
    this.buildGround();
    progress(0.2, 'Boğaz suyu dolduruluyor');
    this.buildWater();
    this.buildShores();
    progress(0.35, 'Binalar inşa ediliyor');
    this.buildBuildings();
    progress(0.55, 'Sokak lambaları ve ağaçlar');
    this.buildStreetProps();
    progress(0.7, 'Tarihi yapılar');
    for (const b of this.map.landmarkBlocks) {
      const g = buildLandmark(b.landmark, b, this.physics.city, this.uniforms);
      if (g) this.group.add(g);
    }
    buildBridgesAndIsland(this.group, this.physics.city, this.uniforms);
    progress(0.8, 'Parklar');
    this.buildParks();
  }

  // ---------- Zemin dokusu: yollar, kaldırımlar, parklar ----------
  buildGround() {
    const S = this.quality === 'low' ? 2048 : 4096;
    const k = S / (WORLD_MAX - WORLD_MIN);
    const P = (v) => (v - WORLD_MIN) * k;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d');
    // kara: kaldırım taşı rengi
    g.fillStyle = '#9d978c'; g.fillRect(0, 0, S, S);
    const r = new RNG(4);
    for (let i = 0; i < S * 6; i++) { g.fillStyle = r.chance(0.5) ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'; g.fillRect(r.float(0, S), r.float(0, S), 2, 2); }
    // bloklar
    for (const b of this.map.blocks) {
      g.fillStyle = b.kind === 'park' ? '#4f7a3a' : '#8a857a';
      g.fillRect(P(b.x0), P(b.z0), (b.x1 - b.x0) * k, (b.z1 - b.z0) * k);
      if (b.kind === 'park') {
        for (let i = 0; i < 300; i++) { g.fillStyle = r.chance(0.5) ? 'rgba(90,140,60,0.5)' : 'rgba(40,70,30,0.4)'; g.fillRect(P(r.float(b.x0, b.x1)), P(r.float(b.z0, b.z1)), 3, 3); }
        g.strokeStyle = '#c8b99a'; g.lineWidth = 3 * k;
        g.beginPath(); g.moveTo(P(b.x0), P(b.z0)); g.lineTo(P(b.x1), P(b.z1)); g.moveTo(P(b.x1), P(b.z0)); g.lineTo(P(b.x0), P(b.z1)); g.stroke();
        g.beginPath(); g.arc(P(b.cx), P(b.cz), 8 * k, 0, Math.PI * 2); g.fillStyle = '#c8b99a'; g.fill();
      }
      if (b.kind === 'landmark') { g.fillStyle = '#b7ab94'; g.fillRect(P(b.x0), P(b.z0), (b.x1 - b.x0) * k, (b.z1 - b.z0) * k); }
    }
    // yollar
    for (const rd of this.map.roads) {
      const hw = rd.w / 2;
      const x0 = Math.min(rd.x0, rd.x1) - hw, x1 = Math.max(rd.x0, rd.x1) + hw;
      const z0 = Math.min(rd.z0, rd.z1) - hw, z1 = Math.max(rd.z0, rd.z1) + hw;
      g.fillStyle = '#d6d0c4';
      g.fillRect(P(x0 - 0.4), P(z0 - 0.4), (x1 - x0 + 0.8) * k, (z1 - z0 + 0.8) * k);
    }
    for (const rd of this.map.roads) {
      const hw = rd.w / 2;
      const x0 = Math.min(rd.x0, rd.x1) - hw, x1 = Math.max(rd.x0, rd.x1) + hw;
      const z0 = Math.min(rd.z0, rd.z1) - hw, z1 = Math.max(rd.z0, rd.z1) + hw;
      g.fillStyle = rd.bridge ? '#3a3a3c' : '#38393b';
      g.fillRect(P(x0), P(z0), (x1 - x0) * k, (z1 - z0) * k);
    }
    // asfalt dokusu
    g.globalCompositeOperation = 'source-atop';
    // şerit çizgileri
    g.globalCompositeOperation = 'source-over';
    for (const rd of this.map.roads) {
      const horiz = rd.z0 === rd.z1;
      const len = horiz ? Math.abs(rd.x1 - rd.x0) : Math.abs(rd.z1 - rd.z0);
      const hw = rd.w / 2;
      const main = rd.w >= 16;
      g.fillStyle = main ? '#e8c34a' : '#e6e6e6';
      for (let t = hw + 6; t < len - hw - 6; t += main ? 1e9 : 6) {
        if (main) {
          // çift sarı çizgi
          if (horiz) { const x = Math.min(rd.x0, rd.x1) + hw + 4; g.fillRect(P(x), P(rd.z0 - 0.35), (len - rd.w - 8) * k, 0.25 * k + 1); g.fillRect(P(x), P(rd.z0 + 0.15), (len - rd.w - 8) * k, 0.25 * k + 1); }
          else { const z = Math.min(rd.z0, rd.z1) + hw + 4; g.fillRect(P(rd.x0 - 0.35), P(z), 0.25 * k + 1, (len - rd.w - 8) * k); g.fillRect(P(rd.x0 + 0.15), P(z), 0.25 * k + 1, (len - rd.w - 8) * k); }
          break;
        }
        if (horiz) g.fillRect(P(Math.min(rd.x0, rd.x1) + t), P(rd.z0 - 0.12), 3 * k, 0.3 * k + 1);
        else g.fillRect(P(rd.x0 - 0.12), P(Math.min(rd.z0, rd.z1) + t), 0.3 * k + 1, 3 * k);
      }
      // ana yol şerit kesikleri
      if (main) {
        g.fillStyle = '#d8d8d8';
        for (const off of [-hw / 2, hw / 2]) {
          for (let t = hw + 6; t < len - hw - 6; t += 7) {
            if (horiz) g.fillRect(P(Math.min(rd.x0, rd.x1) + t), P(rd.z0 + off), 3 * k, 0.25 * k + 1);
            else g.fillRect(P(rd.x0 + off), P(Math.min(rd.z0, rd.z1) + t), 0.25 * k + 1, 3 * k);
          }
        }
      }
    }
    // yaya geçitleri (zebra)
    g.fillStyle = '#efefef';
    for (const n of this.map.nodes) {
      for (const e of n.edges) {
        const o = this.map.other(e, n);
        const dx = Math.sign(o.x - n.x), dz = Math.sign(o.z - n.z);
        const hw = e.width / 2;
        let cross = 0;
        for (const e2 of n.edges) if (e2 !== e) cross = Math.max(cross, e2.width / 2);
        const off = cross + 2.5;
        for (let s = -hw + 1; s < hw - 0.5; s += 1.4) {
          if (dx !== 0) g.fillRect(P(n.x + dx * off - (dx < 0 ? 2.2 : 0)), P(n.z + s), 2.2 * k, 0.7 * k);
          else g.fillRect(P(n.x + s), P(n.z + dz * off - (dz < 0 ? 2.2 : 0)), 0.7 * k, 2.2 * k);
        }
      }
    }
    // su: şeffaf
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    const water = [[200, -1000, 420, 1000], [-850, 70, 200, 190], [-1000, 820, 1000, 1000]];
    for (const [x0, z0, x1, z1] of water) g.fillRect(P(x0), P(z0), (x1 - x0) * k, (z1 - z0) * k);
    g.globalCompositeOperation = 'source-over';
    // köprü yolları ve ada
    for (const b of BRIDGES) {
      g.fillStyle = '#6d6a64'; g.fillRect(P(b.x0), P(b.z0), (b.x1 - b.x0) * k, (b.z1 - b.z0) * k);
      g.fillStyle = '#38393b';
      if (b.axis === 'z') g.fillRect(P(b.x0 + 2), P(b.z0), (b.x1 - b.x0 - 4) * k, (b.z1 - b.z0) * k);
      else g.fillRect(P(b.x0), P(b.z0 + 2), (b.x1 - b.x0) * k, (b.z1 - b.z0 - 4) * k);
      g.fillStyle = '#e8c34a';
      if (b.axis === 'z') g.fillRect(P((b.x0 + b.x1) / 2 - 0.15), P(b.z0), 0.3 * k + 1, (b.z1 - b.z0) * k);
      else g.fillRect(P(b.x0), P((b.z0 + b.z1) / 2 - 0.15), (b.x1 - b.x0) * k, 0.3 * k + 1);
    }
    g.fillStyle = '#a49884'; g.beginPath(); g.arc(P(ISLAND.x), P(ISLAND.z), ISLAND.r * k, 0, Math.PI * 2); g.fill();

    this.groundCanvas = c;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    const geo = new THREE.PlaneGeometry(WORLD_MAX - WORLD_MIN, WORLD_MAX - WORLD_MIN);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, alphaTest: 0.5, transparent: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.ground = mesh;

    // mini harita için küçük kopya
    const mc = makeCanvas(1024, 1024);
    const mg = mc.getContext('2d');
    mg.fillStyle = '#0f2a3d'; mg.fillRect(0, 0, 1024, 1024);
    mg.drawImage(c, 0, 0, 1024, 1024);
    const mk = 1024 / 2000;
    for (const b of this.map.buildings) {
      mg.fillStyle = b.type === 'apartment' ? '#59554e' : '#7a6a40';
      mg.fillRect((b.x0 + 1000) * mk, (b.z0 + 1000) * mk, (b.x1 - b.x0) * mk, (b.z1 - b.z0) * mk);
    }
    this.minimapCanvas = mc;
  }

  buildWater() {
    const n = waterNormalTexture();
    const mat = new THREE.MeshStandardMaterial({ color: 0x1b4a5e, roughness: 0.12, metalness: 0.15, normalMap: n, normalScale: new THREE.Vector2(0.6, 0.6), transparent: true, opacity: 0.94 });
    this.waterMat = mat;
    const geo = new THREE.PlaneGeometry(3200, 3200);
    geo.rotateX(-Math.PI / 2);
    const w = new THREE.Mesh(geo, mat);
    w.position.y = WATER_Y;
    w.receiveShadow = true;
    this.group.add(w);
    // deniz tabanı
    const bed = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x0a1e28 }));
    bed.position.y = WATER_Y - 5;
    this.group.add(bed);
  }

  update(dt, t) {
    if (this.waterMat) { this.waterMat.normalMap.offset.set(t * 0.004, t * 0.0025); }
  }

  buildShores() {
    const cols = this.physics.city;
    const stone = new THREE.MeshStandardMaterial({ map: stoneTexture('#8e8676'), roughness: 0.9 });
    const segs = [];
    const gapsZ = [[-461, -439]];
    const gapsX = [[-160, -140], [-510, -490]];
    const split = (a, b, gaps) => {
      let parts = [[a, b]];
      for (const [g0, g1] of gaps) {
        parts = parts.flatMap(([p0, p1]) => (g1 <= p0 || g0 >= p1 ? [[p0, p1]] : [[p0, g0], [g1, p1]].filter(([q0, q1]) => q1 - q0 > 0.5)));
      }
      return parts;
    };
    for (const [z0, z1] of split(-1000, 70, gapsZ)) segs.push({ axis: 'z', v: 200, a: z0, b: z1, side: -1 });
    for (const [z0, z1] of split(190, 820, [])) segs.push({ axis: 'z', v: 200, a: z0, b: z1, side: -1 });
    for (const [z0, z1] of split(-1000, 820, gapsZ)) segs.push({ axis: 'z', v: 420, a: z0, b: z1, side: 1 });
    for (const [x0, x1] of split(-850, 200, gapsX)) { segs.push({ axis: 'x', v: 70, a: x0, b: x1, side: -1 }); segs.push({ axis: 'x', v: 190, a: x0, b: x1, side: 1 }); }
    segs.push({ axis: 'z', v: -850, a: 70, b: 190, side: -1 });
    segs.push({ axis: 'x', v: 820, a: -1000, b: 200, side: -1 });
    segs.push({ axis: 'x', v: 820, a: 420, b: 1000, side: -1 });

    const railGeo = [];
    const postGeo = new THREE.BoxGeometry(0.12, 1.0, 0.12); postGeo.translate(0, 0.5, 0);
    const posts = [];
    for (const s of segs) {
      const len = s.b - s.a, mid = (s.a + s.b) / 2;
      const off = s.side * 0.6;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(s.axis === 'z' ? 1.2 : len, 4.2, s.axis === 'z' ? len : 1.2), stone);
      if (s.axis === 'z') wall.position.set(s.v + off, -2.1, mid); else wall.position.set(mid, -2.1, s.v + off);
      this.group.add(wall);
      // korkuluk
      const rx = s.axis === 'z' ? s.v + s.side * 0.4 : mid, rz = s.axis === 'z' ? mid : s.v + s.side * 0.4;
      const rail = new THREE.BoxGeometry(s.axis === 'z' ? 0.08 : len, 0.08, s.axis === 'z' ? len : 0.08);
      rail.translate(rx, 1.0, rz); railGeo.push(rail);
      const rail2 = rail.clone(); rail2.translate(0, -0.45, 0); railGeo.push(rail2);
      for (let t = s.a; t <= s.b; t += 2.5) posts.push(s.axis === 'z' ? [rx, rz - mid + t] : [rx - mid + t, rz]);
      if (s.axis === 'z') cols.add(rx - 0.15, s.a, rx + 0.15, s.b, 0, 1.05, 'rail');
      else cols.add(s.a, rz - 0.15, s.b, rz + 0.15, 0, 1.05, 'rail');
    }
    const railMat = new THREE.MeshStandardMaterial({ color: 0x2b3a40, metalness: 0.6, roughness: 0.4 });
    const rm = new THREE.Mesh(mergeGeometries(railGeo), railMat);
    this.group.add(rm);
    const pm = new THREE.InstancedMesh(postGeo, railMat, posts.length);
    const m = new THREE.Matrix4();
    posts.forEach(([x, z], i) => { m.makeTranslation(x, 0, z); pm.setMatrixAt(i, m); });
    this.group.add(pm);
  }

  // ---------- Binalar ----------
  buildBuildings() {
    const cols = this.physics.city;
    const blds = this.map.buildings;
    const classic = blds.filter((b) => !b.tower);
    const towers = blds.filter((b) => b.tower);
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    const mk = (list, glass) => {
      const mesh = new THREE.InstancedMesh(box, facadeMaterial(this.uniforms, glass), list.length);
      list.forEach((b, i) => {
        m.makeScale(b.x1 - b.x0, b.h, b.z1 - b.z0);
        m.setPosition((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
        mesh.setMatrixAt(i, m);
        if (glass) col.set(['#8fa3b5', '#6f8597', '#a9b6bf', '#556b7d'][b.colorIdx % 4]);
        else if (b.type !== 'apartment' && SPECIAL_COLORS[b.type]) col.set(SPECIAL_COLORS[b.type]);
        else col.set(PALETTE[b.colorIdx % PALETTE.length]);
        mesh.setColorAt(i, col);
        cols.add(b.x0, b.z0, b.x1, b.z1, 0, b.h, b);
      });
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.instanceColor.needsUpdate = true;
      this.group.add(mesh);
      return mesh;
    };
    this.classicMesh = mk(classic, false);
    if (towers.length) this.towerMesh = mk(towers, true);

    // Çatılar: kiremit piramit + düz çatı parapetleri
    const pyr = blds.filter((b) => b.roof === 'pyramid');
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xa4482c, roughness: 0.8 });
    const rmesh = new THREE.InstancedMesh(pyramidGeometry(), roofMat, pyr.length);
    pyr.forEach((b, i) => {
      const w = b.x1 - b.x0 + 0.6, d = b.z1 - b.z0 + 0.6;
      m.makeScale(w, Math.min(w, d) * 0.28, d);
      m.setPosition((b.x0 + b.x1) / 2, b.h, (b.z0 + b.z1) / 2);
      rmesh.setMatrixAt(i, m);
    });
    rmesh.castShadow = true;
    this.group.add(rmesh);

    const flat = blds.filter((b) => b.roof === 'flat');
    const parGeo = (() => {
      const parts = [];
      const t = 0.12;
      for (const [sx, sz, px, pz] of [[1, t, 0, -0.5 + t / 2], [1, t, 0, 0.5 - t / 2], [t, 1, -0.5 + t / 2, 0], [t, 1, 0.5 - t / 2, 0]]) {
        const g = new THREE.BoxGeometry(sx, 1, sz); g.translate(px, 0.5, pz); parts.push(g);
      }
      return mergeGeometries(parts);
    })();
    const parMat = new THREE.MeshStandardMaterial({ color: 0x8c8478, roughness: 0.9 });
    const pmesh = new THREE.InstancedMesh(parGeo, parMat, flat.length);
    flat.forEach((b, i) => {
      m.makeScale(b.x1 - b.x0, 0.8, b.z1 - b.z0);
      m.setPosition((b.x0 + b.x1) / 2, b.h, (b.z0 + b.z1) / 2);
      pmesh.setMatrixAt(i, m);
    });
    this.group.add(pmesh);
    // çatı üstü su depoları / antenler
    const tankGeo = new THREE.CylinderGeometry(0.6, 0.6, 1.4, 8); tankGeo.translate(0, 0.7, 0);
    const tanks = flat.filter((b) => b.colorIdx % 3 === 0 && !b.tower);
    const tmesh = new THREE.InstancedMesh(tankGeo, new THREE.MeshStandardMaterial({ color: 0xc9c9c9, metalness: 0.5, roughness: 0.4 }), tanks.length);
    tanks.forEach((b, i) => { m.makeTranslation(b.x0 + 2, b.h, b.z0 + 2); tmesh.setMatrixAt(i, m); });
    this.group.add(tmesh);

    // Kubbeli küçük camiler
    const domes = blds.filter((b) => b.roof === 'dome');
    for (const b of domes) {
      const g = buildSmallMosqueTop(b);
      this.group.add(g);
    }

    // Kapılar
    const doorGeo = new THREE.BoxGeometry(1.5, 2.4, 0.2); doorGeo.translate(0, 1.2, 0);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x4a2c1a, roughness: 0.6 });
    const dmesh = new THREE.InstancedMesh(doorGeo, doorMat, blds.length);
    const frameGeo = new THREE.BoxGeometry(1.9, 2.7, 0.12); frameGeo.translate(0, 1.35, 0);
    const fmesh = new THREE.InstancedMesh(frameGeo, new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.7 }), blds.length);
    blds.forEach((b, i) => {
      const d = b.door;
      m.makeTranslation(d.x, 0, d.z);
      dmesh.setMatrixAt(i, m);
      m.makeTranslation(d.x, 0, d.z - d.nz * 0.03);
      fmesh.setMatrixAt(i, m);
      this.doors.push({ x: d.x, z: d.z + d.nz * 0.8, building: b });
      const dc = new THREE.Color(b.type === 'apartment' ? ['#4a2c1a', '#2a3a4a', '#3a2a1a', '#5a1a1a', '#1a3a2a'][b.colorIdx % 5] : '#b08d2a');
      dmesh.setColorAt(i, dc);
    });
    dmesh.instanceColor.needsUpdate = true;
    this.group.add(dmesh); this.group.add(fmesh);

    // Dükkan tabelaları ve tenteler
    const signGroups = new Map();
    for (const b of classic) {
      if (b.sign < 0 || b.type !== 'apartment') continue;
      const name = SHOP_SIGNS[b.sign % SHOP_SIGNS.length];
      if (!signGroups.has(name)) signGroups.set(name, []);
      signGroups.get(name).push(b);
    }
    const signGeo = new THREE.PlaneGeometry(4.2, 0.9);
    const awnGeo = new THREE.BoxGeometry(4.4, 0.08, 1.4);
    const awnings = [];
    let si = 0;
    for (const [name, list] of signGroups) {
      const mat = new THREE.MeshStandardMaterial({ map: signTexture(name, SIGN_COLORS[si++ % SIGN_COLORS.length], '#fff2c0'), roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.0 });
      mat.userData.nightEmissive = true;
      const smesh = new THREE.InstancedMesh(signGeo, mat, list.length);
      list.forEach((b, i) => {
        const d = b.door;
        const ox = d.x + (b.x1 - b.x0 > 9 ? 3.2 : 0);
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.nz > 0 ? 0 : Math.PI);
        m.compose(new THREE.Vector3(ox, 3.3, d.z + d.nz * 0.08), q, new THREE.Vector3(1, 1, 1));
        smesh.setMatrixAt(i, m);
        awnings.push([ox, d.z + d.nz * 0.75, d.nz, b.colorIdx]);
      });
      this.group.add(smesh);
      this.nightMats = this.nightMats || [];
      this.nightMats.push(mat);
    }
    const amesh = new THREE.InstancedMesh(awnGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), awnings.length);
    const awCols = ['#a01818', '#1d5a2d', '#1d3d6e', '#c98a1a', '#6e1d5a', '#e0e0e0'];
    awnings.forEach(([x, z, nz, ci], i) => {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), nz * 0.35);
      m.compose(new THREE.Vector3(x, 2.75, z), q, new THREE.Vector3(1, 1, 1));
      amesh.setMatrixAt(i, m);
      amesh.setColorAt(i, col.set(awCols[ci % awCols.length]));
    });
    if (awnings.length) { amesh.instanceColor.needsUpdate = true; amesh.castShadow = true; this.group.add(amesh); }

    // Balkonlar (İstanbul apartmanlarının olmazsa olmazı)
    const balc = [];
    for (const b of classic) {
      if (b.type !== 'apartment' || b.colorIdx % 2 === 1) continue;
      const w = b.x1 - b.x0;
      const nb = w > 14 ? 2 : 1;
      for (let f = 1; f < b.floors; f++) for (let j = 0; j < nb; j++) {
        const x = b.x0 + (w / (nb + 1)) * (j + 1);
        balc.push([x, f * 3.2 + 0.1, b.door.z, b.door.nz]);
      }
    }
    const balGeo = (() => {
      const base = new THREE.BoxGeometry(3.2, 0.18, 1.2); base.translate(0, 0, 0.6);
      const front = new THREE.BoxGeometry(3.2, 0.9, 0.06); front.translate(0, 0.5, 1.17);
      const s1 = new THREE.BoxGeometry(0.06, 0.9, 1.2); s1.translate(-1.57, 0.5, 0.6);
      const s2 = s1.clone(); s2.translate(3.14, 0, 0);
      return mergeGeometries([base, front, s1, s2]);
    })();
    const bmesh = new THREE.InstancedMesh(balGeo, new THREE.MeshStandardMaterial({ color: 0xdedad2, roughness: 0.8 }), balc.length);
    balc.forEach(([x, y, z, nz], i) => {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), nz > 0 ? 0 : Math.PI);
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
      bmesh.setMatrixAt(i, m);
    });
    bmesh.castShadow = true;
    this.group.add(bmesh);

    // Özel bina tabelaları
    for (const b of this.map.specials) {
      const info = SPECIAL_INFO[b.type];
      if (!info || !info.label) continue;
      const mat = new THREE.MeshStandardMaterial({ map: signTexture(info.label, info.bg, info.fg), emissive: 0xffffff, emissiveMap: signTexture(info.label, info.bg, info.fg), emissiveIntensity: 0.3 });
      mat.userData.nightEmissive = true;
      this.nightMats = this.nightMats || [];
      this.nightMats.push(mat);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 1.3), mat);
      s.position.set(b.door.x, 3.6, b.door.z + b.door.nz * 0.1);
      s.rotation.y = b.door.nz > 0 ? 0 : Math.PI;
      this.group.add(s);
    }
  }

  // ---------- Sokak eşyaları ----------
  buildStreetProps() {
    const cols = this.physics.city;
    const lamps = [];
    for (const rd of this.map.roads) {
      const horiz = rd.z0 === rd.z1;
      const len = horiz ? Math.abs(rd.x1 - rd.x0) : Math.abs(rd.z1 - rd.z0);
      const hw = rd.w / 2;
      const start = horiz ? Math.min(rd.x0, rd.x1) : Math.min(rd.z0, rd.z1);
      for (let t = hw + 10; t < len - hw - 8; t += 26) {
        for (const side of [-1, 1]) {
          if (rd.bridge && side === 1 && ((t / 26) | 0) % 2) continue;
          const off = side * (hw + (rd.bridge ? -0.6 : 0.7));
          const x = horiz ? start + t : rd.x0 + off;
          const z = horiz ? rd.z0 + off : start + t;
          if (!isLand(x, z)) continue;
          lamps.push([x, z, horiz ? (side > 0 ? 0 : Math.PI) : (side > 0 ? -Math.PI / 2 : Math.PI / 2)]);
        }
      }
    }
    const pole = (() => {
      const p = new THREE.CylinderGeometry(0.08, 0.12, 6, 6); p.translate(0, 3, 0);
      const arm = new THREE.BoxGeometry(0.08, 0.08, 1.6); arm.translate(0, 5.9, -0.75);
      const base = new THREE.CylinderGeometry(0.2, 0.24, 0.5, 8); base.translate(0, 0.25, 0);
      return mergeGeometries([p, arm, base]);
    })();
    const headGeo = new THREE.BoxGeometry(0.35, 0.18, 0.7); headGeo.translate(0, 5.8, -1.4);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x23282b, metalness: 0.6, roughness: 0.5 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfff4d0, emissive: 0xffd28a, emissiveIntensity: 0 });
    this.lampHeadMat = headMat;
    const pm = new THREE.InstancedMesh(pole, poleMat, lamps.length);
    const hm = new THREE.InstancedMesh(headGeo, headMat, lamps.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    lamps.forEach(([x, z, rot], i) => {
      q.setFromAxisAngle(up, rot);
      m.compose(new THREE.Vector3(x, 0, z), q, one);
      pm.setMatrixAt(i, m); hm.setMatrixAt(i, m);
      cols.add(x - 0.15, z - 0.15, x + 0.15, z + 0.15, 0, 6, 'lamp');
    });
    pm.castShadow = true;
    this.group.add(pm); this.group.add(hm);
    this.lamps = lamps;

    // Işık havuzları (gece zemine düşen sıcak ışık) - ucuz sahte ışık
    const poolGeo = new THREE.CircleGeometry(5, 16); poolGeo.rotateX(-Math.PI / 2);
    const poolMat = new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: poolTexture() });
    this.poolMat = poolMat;
    const pools = new THREE.InstancedMesh(poolGeo, poolMat, lamps.length);
    lamps.forEach(([x, z, rot], i) => {
      m.makeTranslation(x - Math.sin(rot) * 1.4 * 0 + Math.sin(rot + Math.PI) * 1.4, 0.03, z + Math.cos(rot + Math.PI) * 1.4);
      pools.setMatrixAt(i, m);
    });
    pools.renderOrder = 2;
    this.group.add(pools);

    // Çöp kutuları, banklar ve otobüs durakları
    const r = this.rng;
    const binGeo = new THREE.CylinderGeometry(0.3, 0.26, 0.9, 8); binGeo.translate(0, 0.45, 0);
    const bins = lamps.filter(() => r.chance(0.15));
    const bm = new THREE.InstancedMesh(binGeo, new THREE.MeshStandardMaterial({ color: 0x2d5a3a, roughness: 0.6 }), bins.length);
    bins.forEach(([x, z, rot], i) => {
      const bx = x + Math.cos(rot) * 1.2, bz = z - Math.sin(rot) * 1.2;
      m.makeTranslation(bx, 0, bz); bm.setMatrixAt(i, m);
      cols.add(bx - 0.3, bz - 0.3, bx + 0.3, bz + 0.3, 0, 0.9, 'bin');
    });
    bm.castShadow = true;
    this.group.add(bm);
  }

  buildParks() {
    const cols = this.physics.city;
    const r = this.rng;
    const trees = [];
    for (const p of this.map.parks) {
      for (let x = p.x0 + 4; x < p.x1 - 2; x += 9) for (let z = p.z0 + 4; z < p.z1 - 2; z += 9) {
        const tx = x + r.float(-2.5, 2.5), tz = z + r.float(-2.5, 2.5);
        if (Math.abs(tx - p.cx) < 10 && Math.abs(tz - p.cz) < 10) continue;
        // çapraz yolları boş bırak
        const u = (tx - p.x0) / (p.x1 - p.x0), v = (tz - p.z0) / (p.z1 - p.z0);
        if (Math.abs(u - v) < 0.06 || Math.abs(u + v - 1) < 0.06) continue;
        if (r.chance(0.8)) trees.push([tx, tz, r.float(0.8, 1.4), r.int(0, 2)]);
      }
    }
    // cadde ağaçları
    for (const b of this.map.blocks) {
      if (b.kind !== 'city' || !r.chance(0.3)) continue;
      for (let x = b.x0 + 5; x < b.x1 - 3; x += 12) {
        trees.push([x, b.z0 - 2.0, r.float(0.6, 0.9), 0]);
      }
    }
    const trunk = new THREE.CylinderGeometry(0.15, 0.22, 3, 6); trunk.translate(0, 1.5, 0);
    const leafA = new THREE.IcosahedronGeometry(1.8, 1); leafA.translate(0, 4, 0);
    const leafB = new THREE.IcosahedronGeometry(1.3, 1); leafB.translate(0.6, 5.2, 0.3);
    const crown = mergeGeometries([leafA, leafB]);
    const cypress = new THREE.ConeGeometry(0.9, 7, 8); cypress.translate(0, 4.5, 0);
    const tm = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x4a3524 }), trees.length);
    const normal = trees.filter((t) => t[3] !== 2), cyp = trees.filter((t) => t[3] === 2);
    const cm = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: 0x3d6b2a, roughness: 0.9, flatShading: true }), normal.length);
    const ym = new THREE.InstancedMesh(cypress, new THREE.MeshStandardMaterial({ color: 0x2a4a22, roughness: 0.9, flatShading: true }), cyp.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    trees.forEach(([x, z, s], i) => {
      q.setFromAxisAngle(up, (x * 13.37) % 6.28);
      m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s));
      tm.setMatrixAt(i, m);
      cols.add(x - 0.25 * s, z - 0.25 * s, x + 0.25 * s, z + 0.25 * s, 0, 3 * s, 'tree');
    });
    normal.forEach(([x, z, s], i) => {
      q.setFromAxisAngle(up, (x * 7.1) % 6.28);
      m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s));
      cm.setMatrixAt(i, m);
      cm.setColorAt(i, col.setHSL(0.25 + ((x * 0.37) % 0.06), 0.45, 0.28 + ((z * 0.13) % 0.08)));
    });
    cyp.forEach(([x, z, s], i) => { m.compose(new THREE.Vector3(x, 0, z), q.identity(), new THREE.Vector3(s, s, s)); ym.setMatrixAt(i, m); });
    if (normal.length) cm.instanceColor.needsUpdate = true;
    for (const mm of [tm, cm, ym]) { mm.castShadow = true; mm.receiveShadow = true; this.group.add(mm); }

    // Banklar
    const benchGeo = (() => {
      const seat = new THREE.BoxGeometry(1.8, 0.08, 0.5); seat.translate(0, 0.45, 0);
      const back = new THREE.BoxGeometry(1.8, 0.45, 0.06); back.translate(0, 0.75, -0.24);
      const l1 = new THREE.BoxGeometry(0.08, 0.45, 0.5); l1.translate(-0.8, 0.22, 0);
      const l2 = l1.clone(); l2.translate(1.6, 0, 0);
      return mergeGeometries([seat, back, l1, l2]);
    })();
    const benches = [];
    for (const p of this.map.parks) {
      for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) benches.push([p.cx + Math.sin(a) * 11, p.cz + Math.cos(a) * 11, a + Math.PI]);
    }
    const bm = new THREE.InstancedMesh(benchGeo, new THREE.MeshStandardMaterial({ color: 0x6b4a2a }), benches.length);
    benches.forEach(([x, z, a], i) => {
      q.setFromAxisAngle(up, a);
      m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, 1, 1));
      bm.setMatrixAt(i, m);
      cols.add(x - 0.9, z - 0.9, x + 0.9, z + 0.9, 0, 0.5, 'bench');
    });
    bm.castShadow = true;
    this.group.add(bm);
    this.benches = benches;
    // park çeşmeleri
    const fGeo = new THREE.CylinderGeometry(3, 3.2, 0.6, 20);
    const fMat = new THREE.MeshStandardMaterial({ map: stoneTexture('#c9bfae'), roughness: 0.7 });
    const wMat = new THREE.MeshStandardMaterial({ color: 0x3a7a9a, roughness: 0.1, metalness: 0.2 });
    for (const p of this.map.parks) {
      const f = new THREE.Mesh(fGeo, fMat); f.position.set(p.cx, 0.3, p.cz); this.group.add(f);
      const w = new THREE.Mesh(new THREE.CircleGeometry(2.8, 20), wMat); w.rotation.x = -Math.PI / 2; w.position.set(p.cx, 0.62, p.cz); this.group.add(w);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 1.6, 8), fMat); c.position.set(p.cx, 1.2, p.cz); this.group.add(c);
      cols.add(p.cx - 3, p.cz - 3, p.cx + 3, p.cz + 3, 0, 0.6, 'fountain');
    }
  }

  setNight(n) {
    if (this.lampHeadMat) this.lampHeadMat.emissiveIntensity = n * 3;
    if (this.poolMat) this.poolMat.opacity = n * 0.35;
    if (this.nightMats) for (const mt of this.nightMats) mt.emissiveIntensity = 0.05 + n * 0.6;
  }
}

const SPECIAL_COLORS = {
  safehouse: '#d8c8a8', konak: '#e8e0d0', gun: '#7a7a72', clothes: '#e8c8d8', food: '#e8e0a8', trade: '#5a564e', dealer: '#c8d8e8', bank: '#d8d8d0',
  hospital: '#f0f0f0', police: '#b8c8e0', estate: '#e0c8a0', cafe: '#d8a888', club: '#3a2a4a', warehouse: '#8a8274', rival: '#e8e8e8', garage: '#9a9080', mosque_small: '#e8e4dc',
};

function poolTexture() {
  const c = makeCanvas(64, 64); const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function buildSmallMosqueTop(b) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a9aa8, metalness: 0.4, roughness: 0.5 });
  const w = Math.min(b.x1 - b.x0, b.z1 - b.z0);
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(w * 0.4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  dome.position.set(cx, b.h, cz); g.add(dome);
  const white = new THREE.MeshStandardMaterial({ color: 0xece8e0 });
  const mx = b.x1 - 1.2, mz = b.z0 + 1.2;
  const min = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 22, 10), white); min.position.set(mx, 11, mz); g.add(min);
  const bal = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.4, 12), white); bal.position.set(mx, 17, mz); g.add(bal);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.8, 4, 10), mat); cone.position.set(mx, 24, mz); g.add(cone);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Köprüler (tabliye, korkuluklar, Boğaz köprüsü kuleleri ve kabloları) ve Kız Kulesi
export function buildBridgesAndIsland(group, cols, uniforms) {
  void uniforms;
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x6d6a64, roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb03a2e, metalness: 0.5, roughness: 0.5 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.5, roughness: 0.4 });
  for (const b of BRIDGES) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), deckMat);
    deck.position.set((b.x0 + b.x1) / 2, -0.6, (b.z0 + b.z1) / 2);
    deck.receiveShadow = true;
    group.add(deck);
    // korkuluk
    if (b.axis === 'z') {
      for (const x of [b.x0 + 0.2, b.x1 - 0.2]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.0, d), grey); r.position.set(x, 0.5, (b.z0 + b.z1) / 2); group.add(r);
        cols.add(x - 0.1, b.z0 + 10, x + 0.1, b.z1 - 10, 0, 1.05, 'rail');
      }
      // ayaklar
      for (let z = b.z0 + 20; z < b.z1 - 10; z += 25) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 5, 3), deckMat); p.position.set((b.x0 + b.x1) / 2, -3.6, z); group.add(p);
      }
    } else {
      for (const z of [b.z0 + 0.2, b.z1 - 0.2]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, 0.15), grey); r.position.set((b.x0 + b.x1) / 2, 0.5, z); group.add(r);
        cols.add(b.x0 + 12, z - 0.1, b.x1 - 12, z + 0.1, 0, 1.05, 'rail');
      }
      // Boğaz köprüsü: kuleler ve kablolar
      const towers = [235, 385];
      const H = 75;
      for (const tx of towers) {
        for (const z of [b.z0 - 0.8, b.z1 + 0.8]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(2.4, H + 6, 2.4), steel);
          leg.position.set(tx, H / 2 - 6, z); leg.castShadow = true; group.add(leg);
          cols.add(tx - 1.2, z - 1.2, tx + 1.2, z + 1.2, -6, H, 'tower');
        }
        for (const y of [H - 2, H * 0.55, 8]) {
          const beam = new THREE.Mesh(new THREE.BoxGeometry(2, 2.2, d + 3.6), steel); beam.position.set(tx, y, (b.z0 + b.z1) / 2); group.add(beam);
        }
      }
      // ana kablolar (zincir eğrisi) + askı halatları
      for (const z of [b.z0 - 0.8, b.z1 + 0.8]) {
        const pts = [];
        const xs = [150, 235, 385, 480];
        for (let i = 0; i <= 80; i++) {
          const x = xs[0] + ((xs[3] - xs[0]) * i) / 80;
          let y;
          if (x < xs[1]) y = 4 + ((x - xs[0]) / (xs[1] - xs[0])) ** 1.4 * (H - 4);
          else if (x > xs[2]) y = 4 + ((xs[3] - x) / (xs[3] - xs[2])) ** 1.4 * (H - 4);
          else { const u = (x - (xs[1] + xs[2]) / 2) / ((xs[2] - xs[1]) / 2); y = 4 + (H - 4) * u * u; }
          pts.push(new THREE.Vector3(x, Math.max(y, 3), z));
        }
        const curve = new THREE.CatmullRomCurve3(pts);
        const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.35, 6), grey);
        group.add(cable);
        const hangers = [];
        for (let x = 240; x < 382; x += 6) {
          const u = (x - 310) / 75;
          const y = 4 + (H - 4) * u * u;
          if (y < 1.5) continue;
          const hg = new THREE.BoxGeometry(0.08, y, 0.08); hg.translate(x, y / 2, z); hangers.push(hg);
        }
        if (hangers.length) group.add(new THREE.Mesh(mergeGeometries(hangers), grey));
      }
      // kule ışıkları (gece renkli)
      const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x4a7aff, emissiveIntensity: 2 });
      for (const tx of towers) {
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), lightMat); l.position.set(tx, H + 0.8, (b.z0 + b.z1) / 2); group.add(l);
      }
    }
  }
  // Kız Kulesi
  const isl = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND.r, ISLAND.r + 2, 3, 24), new THREE.MeshStandardMaterial({ map: stoneTexture('#9a8f7a') }));
  isl.position.set(ISLAND.x, -1.5, ISLAND.z); group.add(isl);
  const white = new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: 0.7 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 10), white); base.position.set(ISLAND.x, 3, ISLAND.z); base.castShadow = true; group.add(base);
  const tw = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 14, 12), white); tw.position.set(ISLAND.x + 3, 10, ISLAND.z); tw.castShadow = true; group.add(tw);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(3, 5, 12), new THREE.MeshStandardMaterial({ color: 0x7a8a96, metalness: 0.5 })); cap.position.set(ISLAND.x + 3, 19.5, ISLAND.z); group.add(cap);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9 })); spire.position.set(ISLAND.x + 3, 23, ISLAND.z); group.add(spire);
  cols.add(ISLAND.x - 7, ISLAND.z - 5, ISLAND.x + 7, ISLAND.z + 5, 0, 6, 'kizkulesi');
}

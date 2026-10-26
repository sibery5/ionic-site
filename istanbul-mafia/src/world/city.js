// 3D şehir inşası: PBR zemin (maske + döşenen detay dokuları), yükseltilmiş kaldırımlar ve bordürler, su,
// rıhtımlar, binalar (buildings.js), sokak eşyası (streetprops.js), parklar ve bitki örtüsü (vegetation.js),
// emniyet yerleşkeleri, askeri üs, havalimanı, marina ve villalar. Görünürlük 400 m'lik parçalara bölünür;
// küçük ayrıntılar kameraya yakın örnekleyicilerle (NearInstancer) çizilir.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WATER_Y, BRIDGES, ISLAND, SIDEWALK, MARINA, MILITARY_BASE, AIRPORT, districtAt } from './map.js';
import { RNG } from '../core/util.js';
import { waterNormalTexture, makeCanvas, granitePBR, ashlarPBR, signAtlas, propAtlas, PROP_UV } from '../core/textures.js';
import { SHARED, terrainMaterial, pbrMaterial, waterMaterial, markingMaterial, propsMaterial, facadeMaterial, roofMaterial, grassField } from './shaders.js';
import { NearInstancer, ChunkInstancer, ChunkMerger } from './instancer.js';
import { buildBuildings, FACADE_PROP_DEFS, FACADE_PROP_OPTS, signEntries, signMaterial, PALETTE as BPAL, SHOP_SIGNS as BSIGNS, SPECIAL_INFO as BINFO } from './buildings.js';
import { buildStreetProps, STREET_PROP_DEFS, STREET_PROP_OPTS } from './streetprops.js';
import { buildVegetation, PARK_PROP_DEFS, PARK_PROP_OPTS } from './vegetation.js';
import { buildPoliceStations, POLICE_PROP_DEFS, POLICE_PROP_OPTS } from './police_station.js';
import { buildMilitary, paintMilitary, MILITARY_PROP_DEFS, MILITARY_PROP_OPTS } from './military.js';
import { buildLandmark } from './landmarks.js';
import { buildAirport, buildMarina, buildVillas, paintAirport, paintVillas, ZONE_PROP_DEFS, ZONE_PROP_OPTS } from './zones.js';

export const PALETTE = BPAL;
export const SHOP_SIGNS = BSIGNS;
export const SPECIAL_INFO = BINFO;
export { facadeMaterial };

const FENCE_W = { chain: 4, ironfence: 2, razor: 4 };
const HISTORIC = new Set(['fatih', 'beyoglu']);

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
    this.lamps = [];
    // ortak uniform'ları oyunun uniform nesnesine bağla
    if (uniforms) {
      if (uniforms.uNight) SHARED.uNight = uniforms.uNight; else uniforms.uNight = SHARED.uNight;
      uniforms.uWet = SHARED.uWet; uniforms.uRain = SHARED.uRain; uniforms.uTime = SHARED.uTime;
    }
    this.propsMat = propsMaterial();
    this.propsMat2 = propsMaterial({ double: true });
    this.near = [];
    this.finalizeLater = [];
    this.props = {};
    const defs = [[FACADE_PROP_DEFS, FACADE_PROP_OPTS], [STREET_PROP_DEFS, STREET_PROP_OPTS], [PARK_PROP_DEFS, PARK_PROP_OPTS], [POLICE_PROP_DEFS, POLICE_PROP_OPTS], [MILITARY_PROP_DEFS, MILITARY_PROP_OPTS], [ZONE_PROP_DEFS, ZONE_PROP_OPTS]];
    const lodK = quality === 'low' ? 0.6 : quality === 'high' ? 1.35 : 1;
    for (const [D, O] of defs) for (const k of Object.keys(D)) {
      const o = O[k] || {};
      this.props[k] = new NearInstancer(D[k](), o.double ? this.propsMat2 : this.propsMat, { radius: (o.radius || 200) * lodK, cell: 40, shadow: !!o.shadow && quality !== 'low' });
    }
    this.signAtlas = signAtlas(signEntries());
    this.zoneSigns = new ChunkInstancer(new THREE.PlaneGeometry(1, 1), signMaterial(this.signAtlas.tex), { shadow: false, attrs: { aUV: 4 }, chunk: 1000 });
    this.ads = new ChunkInstancer(new THREE.PlaneGeometry(1, 1), signMaterial(propAtlas()), { shadow: false, attrs: { aUV: 4 }, chunk: 1000 });
    this.zoneShells = new ChunkInstancer((() => { const b = new THREE.BoxGeometry(1, 1, 1); b.translate(0, 0.5, 0); return b; })(), facadeMaterial(quality), { attrs: { aStyle: 4, aInfo: 4 } });
    this.trim = new ChunkMerger();
    this.markList = [];
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0);
    this.camPos = new THREE.Vector3(-300, 2, -60);
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

  // ---------- yardımcılar (diğer dünya modülleri kullanır) ----------
  addNear(inst) { if (inst.finalize(this.group)) this.near.push(inst); }
  mark(x, z, w, d, ry = 0, color = null, y = 0.004) { this.markList.push([x, y, z, w, d, ry, color]); }
  addSign(key, x, y, z, ry, w, h) {
    this._q.setFromAxisAngle(this._up, ry);
    this._m.compose(this._v.set(x, y, z), this._q, this._s.set(w, h, 1));
    this.zoneSigns.add(this._m, null, { aUV: this.signAtlas.uv(key) });
  }
  addAd(x, y, z, ry, idx, w, h, zoff = 0) {
    propAtlas();
    const r = PROP_UV['ad' + idx];
    this._q.setFromAxisAngle(this._up, ry);
    this._m.compose(this._v.set(x + Math.sin(ry) * zoff, y, z + Math.cos(ry) * zoff), this._q, this._s.set(w, h, 1));
    this.ads.add(this._m, null, { aUV: r });
  }
  addTrimBox(w, h, d, x, y, z, col = [0.85, 0.83, 0.78]) {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z);
    this.trim.add(trimFinish(g, 1, col), x, z);
  }
  // Özel bölge binası (koğuş, terminal, kulüp): cephe şaderi + düz çatı parapeti + çarpışma
  addZoneBuilding(x0, z0, x1, z1, h, style, color, fcode = 0, flags = 0) {
    const c = new THREE.Color(color);
    this._m.compose(this._v.set((x0 + x1) / 2, 0, (z0 + z1) / 2), this._q.identity(), this._s.set(x1 - x0, h, z1 - z0));
    this.zoneShells.add(this._m, c, { aStyle: [style, ((x0 * 13.1 + z0 * 7.7) % 1 + 1) % 1, fcode, flags], aInfo: [0, 3.8, 3.2, 0.2] });
    this.physics.city.add(x0, z0, x1, z1, 0, h, 'zoneBuilding');
    const t = 0.25, ph = 0.8, pc = [Math.min(1, c.r + 0.1), Math.min(1, c.g + 0.1), Math.min(1, c.b + 0.1)];
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    this.addTrimBox(w, ph, t, cx, h, z0 + t / 2, pc); this.addTrimBox(w, ph, t, cx, h, z1 - t / 2, pc);
    this.addTrimBox(t, ph, d, x0 + t / 2, h, cz, pc); this.addTrimBox(t, ph, d, x1 - t / 2, h, cz, pc);
  }
  // Çit hattı: panel örnekleri + ince çarpışma kutusu
  fenceLine(x0, z0, x1, z1, kind, height = 2, topKind = null) {
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 0.3) return;
    const W = FENCE_W[kind] || 2, ry = Math.atan2(-(z1 - z0), x1 - x0);
    const dx = (x1 - x0) / L, dz = (z1 - z0) / L;
    const y0 = this.onSlab(x0, z0) ? 0.15 : 0;
    for (let s = 0; s < L - 0.05; s += W) {
      const seg = Math.min(W, L - s);
      const sy = kind === 'ironfence' ? height / 1.8 : height;
      this.props[kind].addTRS(x0 + dx * s, y0, z0 + dz * s, ry, seg / W, sy, 1);
      if (topKind) this.props[topKind].addTRS(x0 + dx * s, y0 + height, z0 + dz * s, ry, seg / (FENCE_W[topKind] || 4), 1, 1);
    }
    const th = 0.12;
    this.physics.city.add(Math.min(x0, x1) - th, Math.min(z0, z1) - th, Math.max(x0, x1) + th, Math.max(z0, z1) + th, 0, height + (topKind ? 0.6 : 0), 'fence');
  }
  onSlab(x, z) {
    for (const b of this.map.blocks) if (b.kind !== 'zone' && x >= b.x0 - SIDEWALK - 0.01 && x <= b.x1 + SIDEWALK + 0.01 && z >= b.z0 - SIDEWALK - 0.01 && z <= b.z1 + SIDEWALK + 0.01) return true;
    return false;
  }

  // ---------- Zemin: malzeme maskesi, PBR zemin, kaldırım tablaları ve bordürler ----------
  buildGround() {
    const S = this.quality === 'high' ? 4096 : this.quality === 'low' ? 1024 : 2048;
    const k = S / 2000;
    const mask = new Uint8Array(S * S * 4);
    const paint = {
      rect: (x0, z0, x1, z1, c) => {
        const ix0 = Math.max(0, Math.floor((Math.min(x0, x1) + 1000) * k)), ix1 = Math.min(S, Math.ceil((Math.max(x0, x1) + 1000) * k));
        const iz0 = Math.max(0, Math.floor((Math.min(z0, z1) + 1000) * k)), iz1 = Math.min(S, Math.ceil((Math.max(z0, z1) + 1000) * k));
        for (let z = iz0; z < iz1; z++) { let i = (z * S + ix0) * 4; for (let x = ix0; x < ix1; x++, i += 4) { mask[i] = c[0]; mask[i + 1] = c[1]; mask[i + 2] = c[2]; mask[i + 3] = c[3]; } }
      },
      seg: (ax, az, bx, bz, w, c) => {
        const x0 = Math.min(ax, bx) - w, x1 = Math.max(ax, bx) + w, z0 = Math.min(az, bz) - w, z1 = Math.max(az, bz) + w;
        const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
        for (let z = Math.floor((z0 + 1000) * k); z < Math.ceil((z1 + 1000) * k); z++) for (let x = Math.floor((x0 + 1000) * k); x < Math.ceil((x1 + 1000) * k); x++) {
          if (x < 0 || z < 0 || x >= S || z >= S) continue;
          const wx = x / k - 1000, wz = z / k - 1000;
          const t = Math.max(0, Math.min(1, ((wx - ax) * dx + (wz - az) * dz) / l2));
          if (Math.hypot(wx - ax - dx * t, wz - az - dz * t) > w) continue;
          const i = (z * S + x) * 4; mask[i] = c[0]; mask[i + 1] = c[1]; mask[i + 2] = c[2]; mask[i + 3] = c[3];
        }
      },
      ring: (cx, cz, r0, r1, c) => {
        for (let z = Math.floor((cz - r1 + 1000) * k); z < Math.ceil((cz + r1 + 1000) * k); z++) for (let x = Math.floor((cx - r1 + 1000) * k); x < Math.ceil((cx + r1 + 1000) * k); x++) {
          const d = Math.hypot(x / k - 1000 - cx, z / k - 1000 - cz);
          if (d < r0 || d > r1) continue;
          const i = (z * S + x) * 4; mask[i] = c[0]; mask[i + 1] = c[1]; mask[i + 2] = c[2]; mask[i + 3] = c[3];
        }
      },
    };
    const PAVE = [0, 255, 0, 0], ASPH = [255, 0, 0, 0], GRASS = [0, 0, 255, 0], COB = [0, 0, 0, 255];
    paint.rect(-1000, -1000, 1000, 1000, PAVE);
    for (const rd of this.map.roads) {
      const hw = rd.w / 2;
      const d = districtAt((rd.x0 + rd.x1) / 2, (rd.z0 + rd.z1) / 2);
      const cob = !rd.bridge && rd.w < 16 && HISTORIC.has(d.id) && ((rd.x0 * 7 + rd.z0 * 3) % 5 + 5) % 5 < 2;
      paint.rect(Math.min(rd.x0, rd.x1) - hw, Math.min(rd.z0, rd.z1) - hw, Math.max(rd.x0, rd.x1) + hw, Math.max(rd.z0, rd.z1) + hw, cob ? COB : ASPH);
    }
    // kavşaklar her zaman asfalt
    for (const n of this.map.nodes) { let w = 0; for (const e of n.edges) w = Math.max(w, e.width / 2); paint.rect(n.x - w, n.z - w, n.x + w, n.z + w, ASPH); }
    for (const b of this.map.blocks) {
      if (b.kind === 'zone') continue;
      paint.rect(b.x0 - SIDEWALK, b.z0 - SIDEWALK, b.x1 + SIDEWALK, b.z1 + SIDEWALK, PAVE);
      if (b.kind === 'park') {
        paint.rect(b.x0, b.z0, b.x1, b.z1, GRASS);
        paint.seg(b.x0, b.z0, b.x1, b.z1, 1.6, PAVE); paint.seg(b.x1, b.z0, b.x0, b.z1, 1.6, PAVE);
        paint.ring(b.cx, b.cz, 0, 12.8, PAVE);
        paint.ring(b.cx, b.cz, 15.6, 17, PAVE);
      } else if (b.kind === 'landmark') {
        paint.rect(b.x0, b.z0, b.x1, b.z1, HISTORIC.has(b.district.id) || b.district.id === 'fatih' ? COB : PAVE);
        if (b.landmark === 'stadium' || b.landmark === 'dolmabahce') paint.rect(b.x0 + 4, b.z0 + 4, b.x1 - 4, b.z1 - 4, GRASS);
      }
    }
    paintVillas(paint);
    paintMilitary(paint);
    paintAirport(paint);
    const maskTex = new THREE.DataTexture(mask, S, S, THREE.RGBAFormat);
    maskTex.magFilter = THREE.LinearFilter; maskTex.minFilter = THREE.LinearMipmapLinearFilter; maskTex.generateMipmaps = true; maskTex.anisotropy = 4;
    maskTex.needsUpdate = true;
    this.maskTex = maskTex;

    // zemin: yalnız kara parçaları (su altında zemin yok)
    const lands = [[-1000, -1000, 200, 70], [-1000, 70, -850, 190], [-1000, 190, 200, 820], [420, -1000, 1000, 820]];
    const parts = lands.map(([x0, z0, x1, z1]) => { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, Math.ceil((x1 - x0) / 100), Math.ceil((z1 - z0) / 100)); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2); return g; });
    const ground = new THREE.Mesh(mergeGeometries(parts), terrainMaterial(maskTex, this.quality));
    ground.receiveShadow = true;
    ground.onBeforeRender = (r, s, cam) => { if (cam && cam.isPerspectiveCamera) this.camPos.copy(cam.position); };
    this.group.add(ground);
    this.ground = ground;

    // kaldırım tablaları (0.15 m) ve granit bordürler — parça başına birleşik
    const slabs = new ChunkMerger(), curbs = new ChunkMerger();
    const cols = this.physics.city;
    const RAD = 2.2;
    const rr = (x0, z0, x1, z1, r) => {
      const s = new THREE.Shape();
      // XY düzleminde (x, -z): rotateX(-90) sonrası z'ye döner
      const X0 = x0, X1 = x1, Y0 = -z1, Y1 = -z0;
      s.moveTo(X0 + r, Y0); s.lineTo(X1 - r, Y0); s.quadraticCurveTo(X1, Y0, X1, Y0 + r); s.lineTo(X1, Y1 - r); s.quadraticCurveTo(X1, Y1, X1 - r, Y1);
      s.lineTo(X0 + r, Y1); s.quadraticCurveTo(X0, Y1, X0, Y1 - r); s.lineTo(X0, Y0 + r); s.quadraticCurveTo(X0, Y0, X0 + r, Y0);
      return s;
    };
    const holeOf = (x0, z0, x1, z1, r) => { const p = new THREE.Path(); const sh = rr(x0, z0, x1, z1, r); p.curves = sh.curves; p.currentPoint = sh.currentPoint; return p; };
    for (const b of this.map.blocks) {
      if (b.kind === 'zone') continue;
      const ox0 = b.x0 - SIDEWALK, oz0 = b.z0 - SIDEWALK, ox1 = b.x1 + SIDEWALK, oz1 = b.z1 + SIDEWALK;
      const outer = rr(ox0, oz0, ox1, oz1, RAD);
      const ring = b.kind === 'landmark';
      const top = rr(ox0, oz0, ox1, oz1, RAD);
      if (ring) top.holes.push(holeOf(b.x0, b.z0, b.x1, b.z1, 0.4));
      const tg = new THREE.ShapeGeometry(top, 3); tg.rotateX(-Math.PI / 2); tg.translate(0, 0.15, 0);
      tg.deleteAttribute('uv');
      slabs.add(tg, b.cx, b.cz);
      const cs = rr(ox0, oz0, ox1, oz1, RAD); cs.holes.push(holeOf(ox0 + 0.3, oz0 + 0.3, ox1 - 0.3, oz1 - 0.3, Math.max(0.2, RAD - 0.3)));
      const cg = new THREE.ExtrudeGeometry(cs, { depth: 0.165, bevelEnabled: false, curveSegments: 3 }); cg.rotateX(-Math.PI / 2);
      curbs.add(cleanGeo(cg), b.cx, b.cz);
      if (ring) {
        const is = rr(b.x0 - 0.3, b.z0 - 0.3, b.x1 + 0.3, b.z1 + 0.3, 0.6); is.holes.push(holeOf(b.x0, b.z0, b.x1, b.z1, 0.4));
        const ig = new THREE.ExtrudeGeometry(is, { depth: 0.165, bevelEnabled: false, curveSegments: 2 }); ig.rotateX(-Math.PI / 2);
        curbs.add(cleanGeo(ig), b.cx, b.cz);
        cols.add(ox0, oz0, ox1, b.z0, 0, 0.15, 'curb'); cols.add(ox0, b.z1, ox1, oz1, 0, 0.15, 'curb');
        cols.add(ox0, b.z0, b.x0, b.z1, 0, 0.15, 'curb'); cols.add(b.x1, b.z0, ox1, b.z1, 0, 0.15, 'curb');
      } else cols.add(ox0, oz0, ox1, oz1, 0, 0.15, 'curb');
      void outer;
    }
    this.slabMeshes = slabs.finalize(this.group, terrainMaterial(maskTex, this.quality, { slab: true }), { shadow: false });
    this.curbMat = pbrMaterial(granitePBR(this.quality), { color: 0xd8d6d0, scale: 1.0 });
    curbs.finalize(this.group, this.curbMat, { shadow: false });

    // mini harita için renkli kopya (UI)
    const CS = 2048, ck = CS / 2000, P = (v) => (v + 1000) * ck;
    const c = makeCanvas(CS, CS); const g = c.getContext('2d');
    g.fillStyle = '#9d978c'; g.fillRect(0, 0, CS, CS);
    for (const b of this.map.blocks) {
      g.fillStyle = b.kind === 'park' || b.kind === 'villa' ? '#4f7a3a' : b.kind === 'zone' ? (b.zone === 'military' ? '#6a6a4a' : '#5f7a4a') : b.kind === 'landmark' ? '#b7ab94' : '#8a857a';
      g.fillRect(P(b.x0), P(b.z0), (b.x1 - b.x0) * ck, (b.z1 - b.z0) * ck);
    }
    for (const rd of this.map.roads) {
      const hw = rd.w / 2;
      g.fillStyle = '#38393b';
      g.fillRect(P(Math.min(rd.x0, rd.x1) - hw), P(Math.min(rd.z0, rd.z1) - hw), (Math.abs(rd.x1 - rd.x0) + rd.w) * ck, (Math.abs(rd.z1 - rd.z0) + rd.w) * ck);
      if (rd.w >= 16) { g.fillStyle = '#e8c34a'; if (rd.z0 === rd.z1) g.fillRect(P(Math.min(rd.x0, rd.x1)), P(rd.z0) - 1, Math.abs(rd.x1 - rd.x0) * ck, 2); else g.fillRect(P(rd.x0) - 1, P(Math.min(rd.z0, rd.z1)), 2, Math.abs(rd.z1 - rd.z0) * ck); }
    }
    const AP = AIRPORT;
    g.fillStyle = '#38393b'; g.fillRect(P(AP.runway.x0), P(AP.runway.z0), (AP.runway.x1 - AP.runway.x0) * ck, (AP.runway.z1 - AP.runway.z0) * ck);
    g.fillRect(P(AP.apron.x0), P(AP.apron.z0), (AP.apron.x1 - AP.apron.x0) * ck, (AP.apron.z1 - AP.apron.z0) * ck);
    g.globalCompositeOperation = 'destination-out';
    for (const [x0, z0, x1, z1] of [[200, -1000, 420, 1000], [-850, 70, 200, 190], [-1000, 820, 1000, 1000]]) g.fillRect(P(x0), P(z0), (x1 - x0) * ck, (z1 - z0) * ck);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#7a6a50'; for (const p of MARINA.piers) g.fillRect(P(p.x0), P(p.z0), Math.max(1, (p.x1 - p.x0) * ck), Math.max(1, (p.z1 - p.z0) * ck));
    for (const b of BRIDGES) { g.fillStyle = '#38393b'; g.fillRect(P(b.x0), P(b.z0), (b.x1 - b.x0) * ck, (b.z1 - b.z0) * ck); }
    g.fillStyle = '#a49884'; g.beginPath(); g.arc(P(ISLAND.x), P(ISLAND.z), ISLAND.r * ck, 0, Math.PI * 2); g.fill();
    this.groundCanvas = c;
    const mc = makeCanvas(1024, 1024);
    const mg = mc.getContext('2d');
    mg.fillStyle = '#0f2a3d'; mg.fillRect(0, 0, 1024, 1024);
    mg.drawImage(c, 0, 0, 1024, 1024);
    const mk = 1024 / 2000;
    for (const b of this.map.buildings) {
      mg.fillStyle = b.type === 'apartment' ? '#59554e' : '#7a6a40';
      mg.fillRect((b.x0 + 1000) * mk, (b.z0 + 1000) * mk, (b.x1 - b.x0) * mk, (b.z1 - b.z0) * mk);
    }
    mg.strokeStyle = '#c84a3a'; mg.lineWidth = 2; mg.strokeRect((MILITARY_BASE.x0 + 1000) * mk, (MILITARY_BASE.z0 + 1000) * mk, (MILITARY_BASE.x1 - MILITARY_BASE.x0) * mk, (MILITARY_BASE.z1 - MILITARY_BASE.z0) * mk);
    this.minimapCanvas = mc;
  }

  buildWater() {
    const mat = waterMaterial(waterNormalTexture());
    this.waterMat = mat;
    const geo = new THREE.PlaneGeometry(3200, 3200);
    geo.rotateX(-Math.PI / 2);
    const w = new THREE.Mesh(geo, mat);
    w.position.y = WATER_Y;
    w.receiveShadow = true;
    this.group.add(w);
    const bed = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x0a1e28 }));
    bed.position.y = WATER_Y - 5;
    this.group.add(bed);
  }

  update(dt, t) {
    SHARED.uTime.value = t;
    if (this._extCam) this.camPos.copy(this._extCam.position);
    SHARED.uCam.value.copy(this.camPos);
    const cx = this.camPos.x, cz = this.camPos.z;
    for (const n of this.near) n.update(cx, cz);
    if (this.grass) this.grass.userData.update(this.camPos);
  }
  // İsteğe bağlı: ana döngü kamerayı doğrudan bildirebilir (yoksa zemin çiziminden yakalanır)
  updateCamera(cam) { this._extCam = cam; this.update(0, SHARED.uTime.value); }

  buildShores() {
    const cols = this.physics.city;
    const stone = pbrMaterial(ashlarPBR(this.quality), { color: 0xb8ae9a, scale: 0.5, wetK: 0 });
    const segs = [];
    const gapsZ = [[-461, -439]];
    const gapsX = [[-160, -140], [-510, -490]];
    const split = (a, b, gaps) => {
      let parts = [[a, b]];
      for (const [g0, g1] of gaps) parts = parts.flatMap(([p0, p1]) => (g1 <= p0 || g0 >= p1 ? [[p0, p1]] : [[p0, g0], [g1, p1]].filter(([q0, q1]) => q1 - q0 > 0.5)));
      return parts;
    };
    for (const [z0, z1] of split(-1000, 70, gapsZ)) segs.push({ axis: 'z', v: 200, a: z0, b: z1, side: -1 });
    for (const [z0, z1] of split(190, 820, [])) segs.push({ axis: 'z', v: 200, a: z0, b: z1, side: -1 });
    for (const [z0, z1] of split(-1000, 820, gapsZ)) segs.push({ axis: 'z', v: 420, a: z0, b: z1, side: 1 });
    for (const [x0, x1] of split(-850, 200, gapsX)) { segs.push({ axis: 'x', v: 70, a: x0, b: x1, side: -1 }); segs.push({ axis: 'x', v: 190, a: x0, b: x1, side: 1 }); }
    segs.push({ axis: 'z', v: -850, a: 70, b: 190, side: -1 });
    segs.push({ axis: 'x', v: 820, a: -1000, b: 200, side: -1 });
    segs.push({ axis: 'x', v: 820, a: 420, b: 1000, side: -1 });
    const walls = [], railGeo = [];
    const postGeo = new THREE.BoxGeometry(0.1, 1.0, 0.1); postGeo.translate(0, 0.5, 0);
    const posts = [];
    const marinaGaps = MARINA.entrances.map((e) => [e.z0, e.z1]);
    for (const s of segs) {
      const len = s.b - s.a, mid = (s.a + s.b) / 2;
      const off = s.side * 0.6;
      const wg = new THREE.BoxGeometry(s.axis === 'z' ? 1.2 : len, 4.2, s.axis === 'z' ? len : 1.2);
      if (s.axis === 'z') wg.translate(s.v + off, -2.1, mid); else wg.translate(mid, -2.1, s.v + off);
      walls.push(wg);
      const railParts = s.axis === 'z' && s.v === 200 ? split(s.a, s.b, marinaGaps) : [[s.a, s.b]];
      for (const [ra, rb] of railParts) {
        const rl = rb - ra, rm = (ra + rb) / 2;
        const rx = s.axis === 'z' ? s.v + s.side * 0.4 : rm, rz = s.axis === 'z' ? rm : s.v + s.side * 0.4;
        const rail = new THREE.BoxGeometry(s.axis === 'z' ? 0.07 : rl, 0.07, s.axis === 'z' ? rl : 0.07);
        rail.translate(rx, 1.0, rz); railGeo.push(rail);
        const rail2 = rail.clone(); rail2.translate(0, -0.45, 0); railGeo.push(rail2);
        for (let t = ra; t <= rb; t += 2.5) posts.push(s.axis === 'z' ? [rx, t] : [t, rz]);
        if (s.axis === 'z') cols.add(rx - 0.15, ra, rx + 0.15, rb, 0, 1.05, 'rail');
        else cols.add(ra, rz - 0.15, rb, rz + 0.15, 0, 1.05, 'rail');
      }
    }
    const wm = new THREE.Mesh(mergeGeometries(walls), stone); wm.receiveShadow = true; this.group.add(wm);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x2b3a40, metalness: 0.7, roughness: 0.35 });
    this.group.add(new THREE.Mesh(mergeGeometries(railGeo), railMat));
    const pm = new THREE.InstancedMesh(postGeo, railMat, posts.length);
    const m = new THREE.Matrix4();
    posts.forEach(([x, z], i) => { m.makeTranslation(x, 0, z); pm.setMatrixAt(i, m); });
    this.group.add(pm);
  }

  buildBuildings() { buildBuildings(this); }
  buildStreetProps() { buildStreetProps(this); }

  buildParks() {
    buildVegetation(this);
    buildPoliceStations(this);
    buildMilitary(this);
    buildAirport(this);
    buildMarina(this);
    buildVillas(this);
    // çim (kamera çevresi)
    if (this.quality !== 'low') { this.grass = grassField(this.maskTex, this.quality === 'high' ? 42 : 32, this.quality === 'high' ? 0.45 : 0.55); this.group.add(this.grass); }
    // yol çizgileri: tek örnekli mesh
    const ml = this.markList;
    const mg = new THREE.PlaneGeometry(1, 1); mg.rotateX(-Math.PI / 2);
    const mm = new THREE.InstancedMesh(mg, markingMaterial(), ml.length);
    const m = this._m, q = this._q, v = this._v, s = this._s, c = new THREE.Color();
    ml.forEach(([x, y, z, w, d, ry, col], i) => { q.setFromAxisAngle(this._up, ry); m.compose(v.set(x, y, z), q, s.set(w, 1, d)); mm.setMatrixAt(i, m); mm.setColorAt(i, col || c.set(0xf2f2ea)); });
    if (ml.length) mm.instanceColor.needsUpdate = true;
    mm.receiveShadow = true; mm.renderOrder = 1;
    mm.computeBoundingSphere();
    this.group.add(mm);
    this.markList = [];
    // bekleyen tüm örnekleyicileri sonlandır
    for (const f of this.finalizeLater) f();
    for (const k in this.props) this.addNear(this.props[k]);
    this.zoneSigns.finalize(this.group);
    this.ads.finalize(this.group);
    this.zoneShells.finalize(this.group);
    this.trim.finalize(this.group, roofMaterial(this.quality), { shadow: true });
    for (const n of this.near) n.update(this.camPos.x, this.camPos.z, true);
  }

  setNight(n) {
    if (this.haloMat) this.haloMat.opacity = n * 0.85;
    if (this.poolMat) this.poolMat.opacity = n * (0.32 + SHARED.uWet.value * 0.2);
  }
}


function cleanGeo(g) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
  return n;
}
function trimFinish(g, kind, col) {
  const n = g.index ? g.toNonIndexed() : g;
  if (n.attributes.uv) n.deleteAttribute('uv');
  const cnt = n.attributes.position.count;
  const c = new Float32Array(cnt * 3), kk = new Float32Array(cnt);
  for (let i = 0; i < cnt; i++) { c.set(col, i * 3); kk[i] = kind; }
  n.setAttribute('color', new THREE.BufferAttribute(c, 3));
  n.setAttribute('aKind', new THREE.BufferAttribute(kk, 1));
  return n;
}

// Köprüler (tabliye, korkuluklar, Boğaz köprüsü kuleleri ve kabloları) ve Kız Kulesi
export function buildBridgesAndIsland(group, cols, uniforms) {
  void uniforms;
  const deckMat = pbrMaterial(ashlarPBR('medium'), { color: 0x8a867e, scale: 0.4 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb03a2e, metalness: 0.5, roughness: 0.45 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.35 });
  const deckG = [], greyG = [], steelG = [];
  const bx = (arr, w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); arr.push(g); };
  for (const b of BRIDGES) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    bx(deckG, w, 1.2, d, (b.x0 + b.x1) / 2, -0.6, (b.z0 + b.z1) / 2);
    if (b.axis === 'z') {
      for (const x of [b.x0 + 0.2, b.x1 - 0.2]) { bx(greyG, 0.15, 1.0, d, x, 0.5, (b.z0 + b.z1) / 2); cols.add(x - 0.1, b.z0 + 10, x + 0.1, b.z1 - 10, 0, 1.05, 'rail'); }
      for (let z = b.z0 + 20; z < b.z1 - 10; z += 25) bx(deckG, w * 0.8, 5, 3, (b.x0 + b.x1) / 2, -3.6, z);
    } else {
      for (const z of [b.z0 + 0.2, b.z1 - 0.2]) { bx(greyG, w, 1.0, 0.15, (b.x0 + b.x1) / 2, 0.5, z); cols.add(b.x0 + 12, z - 0.1, b.x1 - 12, z + 0.1, 0, 1.05, 'rail'); }
      const towers = [235, 385], H = 75;
      for (const tx of towers) {
        for (const z of [b.z0 - 0.8, b.z1 + 0.8]) { bx(steelG, 2.4, H + 6, 2.4, tx, H / 2 - 6, z); cols.add(tx - 1.2, z - 1.2, tx + 1.2, z + 1.2, -6, H, 'tower'); }
        for (const y of [H - 2, H * 0.55, 8]) bx(steelG, 2, 2.2, d + 3.6, tx, y, (b.z0 + b.z1) / 2);
      }
      for (const z of [b.z0 - 0.8, b.z1 + 0.8]) {
        const pts = [], xs = [150, 235, 385, 480];
        for (let i = 0; i <= 80; i++) {
          const x = xs[0] + ((xs[3] - xs[0]) * i) / 80;
          let y;
          if (x < xs[1]) y = 4 + ((x - xs[0]) / (xs[1] - xs[0])) ** 1.4 * (H - 4);
          else if (x > xs[2]) y = 4 + ((xs[3] - x) / (xs[3] - xs[2])) ** 1.4 * (H - 4);
          else { const u = (x - (xs[1] + xs[2]) / 2) / ((xs[2] - xs[1]) / 2); y = 4 + (H - 4) * u * u; }
          pts.push(new THREE.Vector3(x, Math.max(y, 3), z));
        }
        const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.35, 6);
        greyG.push(tg.toNonIndexed());
        for (let x = 240; x < 382; x += 6) {
          const u = (x - 310) / 75, y = 4 + (H - 4) * u * u;
          if (y < 1.5) continue;
          bx(greyG, 0.08, y, 0.08, x, y / 2, z);
        }
      }
      const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x4a7aff, emissiveIntensity: 2 });
      for (const tx of towers) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), lightMat); l.position.set(tx, H + 0.8, (b.z0 + b.z1) / 2); group.add(l); }
    }
  }
  const nI = (arr) => mergeGeometries(arr.map((g) => (g.index ? g.toNonIndexed() : g)));
  const dm = new THREE.Mesh(nI(deckG), deckMat); dm.receiveShadow = true; group.add(dm);
  const gm = new THREE.Mesh(nI(greyG), grey); gm.castShadow = true; group.add(gm);
  const sm = new THREE.Mesh(nI(steelG), steel); sm.castShadow = true; group.add(sm);
  // Kız Kulesi
  const isl = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND.r, ISLAND.r + 2, 3, 24), pbrMaterial(ashlarPBR('medium'), { color: 0xa89c86, scale: 0.6 }));
  isl.position.set(ISLAND.x, -1.5, ISLAND.z); group.add(isl);
  const white = new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: 0.7 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 10), white); base.position.set(ISLAND.x, 3, ISLAND.z); base.castShadow = true; group.add(base);
  const tw = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 14, 12), white); tw.position.set(ISLAND.x + 3, 10, ISLAND.z); tw.castShadow = true; group.add(tw);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(3, 5, 12), new THREE.MeshStandardMaterial({ color: 0x7a8a96, metalness: 0.5 })); cap.position.set(ISLAND.x + 3, 19.5, ISLAND.z); group.add(cap);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9 })); spire.position.set(ISLAND.x + 3, 23, ISLAND.z); group.add(spire);
  cols.add(ISLAND.x - 7, ISLAND.z - 5, ISLAND.x + 7, ISLAND.z + 5, 0, 6, 'kizkulesi');
  cols.addCircle(ISLAND.x + 3, ISLAND.z, 2.8, 6, 24, 'kizkulesi');
}

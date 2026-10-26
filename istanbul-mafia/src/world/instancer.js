// Geometri birleştirici (köşe rengi + aPBR + atlas UV) ve mesafeye göre örnek seçen yakın-LOD örnekleyici.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PROP_UV, propAtlas } from '../core/textures.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const _c = new THREE.Color();

// Basit parçalardan tek BufferGeometry: position, normal, uv, color, aPBR(pürüzlülük, metal, ışıma, rüzgâr)
export class GeoBuilder {
  constructor() { this.parts = []; propAtlas(); }
  add(geo, o = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
    _q.setFromEuler(_e);
    _m.compose(_v.set(o.x || 0, o.y || 0, o.z || 0), _q, _s.set(o.sx || 1, o.sy || 1, o.sz || 1));
    g.applyMatrix4(_m);
    const n = g.attributes.position.count;
    _c.set(o.color === undefined ? 0xffffff : o.color);
    const col = new Float32Array(n * 3), pbr = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
      pbr[i * 4] = o.rough === undefined ? 0.7 : o.rough; pbr[i * 4 + 1] = o.metal || 0; pbr[i * 4 + 2] = o.emis || 0; pbr[i * 4 + 3] = o.wind || 0;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aPBR', new THREE.BufferAttribute(pbr, 4));
    const r = PROP_UV[o.uv || 'white'];
    const uv = g.attributes.uv;
    if (!uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    const ua = g.attributes.uv;
    for (let i = 0; i < n; i++) {
      const u = o.uv ? ua.getX(i) : 0.5, v = o.uv ? ua.getY(i) : 0.5;
      ua.setXY(i, r[0] + (r[2] - r[0]) * (o.flipU ? 1 - u : u), r[1] + (r[3] - r[1]) * v);
    }
    this.parts.push(g);
    return this;
  }
  // kutu: (x,z) merkez, y taban
  box(w, h, d, o = {}) { return this.add(new THREE.BoxGeometry(w, h, d), { ...o, y: (o.y || 0) + h / 2 }); }
  cyl(rt, rb, h, seg, o = {}) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), { ...o, y: (o.y || 0) + h / 2 }); }
  sphere(r, o = {}, ws = 10, hs = 6) { return this.add(new THREE.SphereGeometry(r, ws, hs), o); }
  plane(w, h, o = {}) { return this.add(new THREE.PlaneGeometry(w, h), o); }
  build() {
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }
}

// Yakın LOD örnekleyici: tüm örnekler hücrelere göre sıralanır; kamera hücre çeyreği kadar
// hareket edince yarıçap içindeki hücreler örnek tamponuna kopyalanır (tek çizim çağrısı).
export class NearInstancer {
  constructor(geo, mat, { radius = 180, cell = 40, shadow = false, receive = true, far = false } = {}) {
    this.geo = geo; this.mat = mat; this.radius = radius; this.cell = cell; this.shadow = shadow; this.receive = receive;
    this.far = far; // true: yarıçapın DIŞINDAKİ örnekler (uzak LOD)
    this.items = []; this.last = null;
  }
  add(matrix, color) { this.items.push({ e: matrix.elements.slice(), c: color ? [color.r, color.g, color.b] : null, x: matrix.elements[12], z: matrix.elements[14] }); }
  addTRS(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, color) {
    _q.setFromAxisAngle(_v.set(0, 1, 0), ry);
    _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
    this.add(_m, color);
  }
  finalize(parent) {
    const C = this.cell, items = this.items, n = items.length;
    if (!n) return null;
    for (const it of items) it.k = Math.floor((it.x + 1100) / C) * 4096 + Math.floor((it.z + 1100) / C);
    items.sort((a, b) => a.k - b.k);
    this.M = new Float32Array(n * 16);
    const hasC = items.some((i) => i.c);
    this.Cc = hasC ? new Float32Array(n * 3) : null;
    this.cells = [];
    let cur = null;
    items.forEach((it, i) => {
      this.M.set(it.e, i * 16);
      if (hasC) this.Cc.set(it.c || [1, 1, 1], i * 3);
      if (!cur || cur.k !== it.k) { cur = { k: it.k, start: i, count: 0, x: (Math.floor(it.k / 4096) + 0.5) * C - 1100, z: ((it.k % 4096) + 0.5) * C - 1100 }; this.cells.push(cur); }
      cur.count++;
    });
    this.items = null;
    const mesh = new THREE.InstancedMesh(this.geo, this.mat, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (hasC) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    mesh.count = 0;
    mesh.castShadow = this.shadow; mesh.receiveShadow = this.receive;
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    mesh.frustumCulled = true;
    this.mesh = mesh;
    parent.add(mesh);
    return mesh;
  }
  update(cx, cz, force = false) {
    if (!this.mesh) return;
    if (!force && this.last && Math.abs(this.last.x - cx) < this.cell * 0.3 && Math.abs(this.last.z - cz) < this.cell * 0.3) return;
    this.last = { x: cx, z: cz };
    const R = this.radius + this.cell * 0.71, R2 = R * R;
    const dst = this.mesh.instanceMatrix.array, dc = this.mesh.instanceColor ? this.mesh.instanceColor.array : null;
    let o = 0;
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    for (const c of this.cells) {
      const d2 = (c.x - cx) ** 2 + (c.z - cz) ** 2;
      if (this.far ? d2 < R2 : d2 > R2) continue;
      dst.set(this.M.subarray(c.start * 16, (c.start + c.count) * 16), o * 16);
      if (dc) dc.set(this.Cc.subarray(c.start * 3, (c.start + c.count) * 3), o * 3);
      o += c.count;
      minx = Math.min(minx, c.x); maxx = Math.max(maxx, c.x); minz = Math.min(minz, c.z); maxz = Math.max(maxz, c.z);
    }
    this.mesh.count = o;
    const im = this.mesh.instanceMatrix; im.clearUpdateRanges(); im.addUpdateRange(0, Math.max(1, o) * 16); im.needsUpdate = true;
    if (dc) { const ic = this.mesh.instanceColor; ic.clearUpdateRanges(); ic.addUpdateRange(0, Math.max(1, o) * 3); ic.needsUpdate = true; }
    const bs = this.mesh.boundingSphere;
    if (o) { bs.center.set((minx + maxx) / 2, 20, (minz + maxz) / 2); bs.radius = Math.hypot(maxx - minx, maxz - minz) / 2 + this.cell + 60; }
    this.mesh.visible = o > 0;
  }
}

// Sabit parça (chunk) bazlı örnekleme: her 400 m karede ayrı InstancedMesh -> görüş konisi ayıklaması çalışır.
export const CHUNK = 400;
export function chunkKey(x, z, size = CHUNK) { return Math.floor((x + 1000) / size) * 64 + Math.floor((z + 1000) / size); }
export class ChunkInstancer {
  constructor(geo, mat, { shadow = true, receive = true, attrs = {}, chunk = CHUNK } = {}) { this.chunk = chunk; this.geo = geo; this.mat = mat; this.shadow = shadow; this.receive = receive; this.attrs = attrs; this.buckets = new Map(); this.meshes = []; }
  add(matrix, color, attrVals) {
    const k = chunkKey(matrix.elements[12], matrix.elements[14], this.chunk);
    let b = this.buckets.get(k);
    if (!b) { b = { m: [], c: [], a: {} }; for (const n in this.attrs) b.a[n] = []; this.buckets.set(k, b); }
    b.m.push(matrix.elements.slice()); b.c.push(color ? color.clone() : null);
    for (const n in this.attrs) b.a[n].push(attrVals[n]);
  }
  finalize(parent) {
    for (const b of this.buckets.values()) {
      const n = b.m.length;
      const g = this.geo.clone();
      for (const name in this.attrs) {
        const sz = this.attrs[name], arr = new Float32Array(n * sz);
        b.a[name].forEach((v, i) => arr.set(v, i * sz));
        g.setAttribute(name, new THREE.InstancedBufferAttribute(arr, sz));
      }
      const mesh = new THREE.InstancedMesh(g, this.mat, n);
      b.m.forEach((e, i) => mesh.instanceMatrix.array.set(e, i * 16));
      if (b.c[0]) { b.c.forEach((c, i) => mesh.setColorAt(i, c || _c.set(1, 1, 1))); mesh.instanceColor.needsUpdate = true; }
      mesh.castShadow = this.shadow; mesh.receiveShadow = this.receive;
      mesh.computeBoundingSphere();
      parent.add(mesh);
      this.meshes.push(mesh);
    }
    this.buckets = null;
    return this.meshes;
  }
}

// Birleşik geometri parçaları (chunk başına bir mesh)
export class ChunkMerger {
  constructor(chunk = CHUNK) { this.chunk = chunk; this.buckets = new Map(); }
  add(geo, x, z) { const k = chunkKey(x, z, this.chunk); if (!this.buckets.has(k)) this.buckets.set(k, []); this.buckets.get(k).push(geo); }
  finalize(parent, mat, { shadow = false, receive = true } = {}) {
    const out = [];
    for (const list of this.buckets.values()) {
      const g = mergeGeometries(list, false);
      for (const p of list) p.dispose();
      if (!g) continue;
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.castShadow = shadow; m.receiveShadow = receive;
      parent.add(m); out.push(m);
    }
    this.buckets = null;
    return out;
  }
}

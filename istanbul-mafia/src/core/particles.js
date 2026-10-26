// Havuzlanmış efekt sistemi: nokta parçacıklar (ışıma, kan, toz), ateş topu ve duman billboard'ları,
// çizgi kıvılcımlar, uçan enkaz parçaları, şok dalgası halkaları ve zemin/duvar izleri (decal).
// Hepsi önceden ayrılmış tamponlar kullanır; karede bellek ayırma yapılmaz.
import * as THREE from 'three';
import { glowTexture, makeCanvas } from './textures.js';
import { mulberry32 } from './util.js';

const VS = `
attribute float aSize; attribute float aAlpha; attribute float aRot; attribute vec3 aColor;
varying float vAlpha; varying vec3 vColor; varying float vRot;
uniform float uScale;
void main(){
  vAlpha = aAlpha; vColor = aColor; vRot = aRot;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = aAlpha <= 0.0 ? 0.0 : aSize * (uScale / max(0.1, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
uniform sampler2D uTex; uniform float uLight; varying float vAlpha; varying vec3 vColor; varying float vRot;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float cs = cos(vRot), sn = sin(vRot);
  vec2 uv = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) + 0.5;
  vec4 t = texture2D(uTex, uv);
  gl_FragColor = vec4(vColor * t.rgb * uLight, t.a * vAlpha);
  if (gl_FragColor.a < 0.01) discard;
}`;

// ---------------- prosedürel dokular ----------------
const texCache = {};
function canvasTex(key, size, draw) {
  if (texCache[key]) return texCache[key];
  const c = makeCanvas(size, size); const g = c.getContext('2d');
  draw(g, size, mulberry32(key.length * 977 + size));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache[key] = t;
  return t;
}
function blob(g, x, y, r, a, col = '255,255,255') {
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, `rgba(${col},${a})`); grd.addColorStop(0.6, `rgba(${col},${a * 0.6})`); grd.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}
// türbülanslı ateş topu
function fireTexture() {
  return canvasTex('fire', 128, (g, s, r) => {
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = r() * s * 0.22;
      blob(g, s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, s * (0.12 + r() * 0.2), 0.35 + r() * 0.3);
    }
    // iç doku: koyu damarlar
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 18; i++) blob(g, s / 2 + (r() - 0.5) * s * 0.6, s / 2 + (r() - 0.5) * s * 0.6, s * (0.03 + r() * 0.06), 0.35);
    g.globalCompositeOperation = 'source-over';
  });
}
// yumuşak, bulutsu duman
function smokeTexture() {
  return canvasTex('smoke', 128, (g, s, r) => {
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * s * 0.26;
      const v = 200 + Math.floor(r() * 55);
      blob(g, s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, s * (0.08 + r() * 0.16), 0.12 + r() * 0.12, `${v},${v},${v}`);
    }
  });
}
// kan sıçraması: düzensiz leke + damlacıklar + kuyruklar
function splatTexture() {
  return canvasTex('splat', 128, (g, s, r) => {
    g.fillStyle = '#fff';
    for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(s / 2 + (r() - 0.5) * s * 0.25, s / 2 + (r() - 0.5) * s * 0.25, s * (0.06 + r() * 0.1), 0, Math.PI * 2); g.fill(); }
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2, d = s * (0.18 + r() * 0.28), rr = s * (0.008 + r() * 0.03);
      g.beginPath(); g.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, rr, 0, Math.PI * 2); g.fill();
      if (r() < 0.5) { g.lineWidth = rr * 0.9; g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(s / 2 + Math.cos(a) * s * 0.12, s / 2 + Math.sin(a) * s * 0.12); g.lineTo(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d); g.stroke(); }
    }
  });
}
// kan gölü: yumuşak kenarlı büyük leke, kenarda daha koyu halka için alfa
function poolTexture() {
  return canvasTex('pool', 128, (g, s, r) => {
    g.fillStyle = '#fff';
    for (let i = 0; i < 12; i++) { const a = r() * Math.PI * 2, d = r() * s * 0.16; g.beginPath(); g.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, s * (0.14 + r() * 0.12), 0, Math.PI * 2); g.fill(); }
  });
}
// kurşun deliği: koyu merkez, kırık kenar
function holeTexture() {
  return canvasTex('hole', 64, (g, s, r) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(10,10,10,1)'); grd.addColorStop(0.16, 'rgba(15,14,13,1)'); grd.addColorStop(0.22, 'rgba(60,56,50,0.9)');
    grd.addColorStop(0.5, 'rgba(90,85,78,0.35)'); grd.addColorStop(1, 'rgba(90,85,78,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(30,28,25,0.7)'; g.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2; g.beginPath(); g.moveTo(s / 2 + Math.cos(a) * 5, s / 2 + Math.sin(a) * 5);
      g.lineTo(s / 2 + Math.cos(a + (r() - 0.5) * 0.5) * s * 0.28, s / 2 + Math.sin(a + (r() - 0.5) * 0.5) * s * 0.28); g.stroke();
    }
  });
}
// patlama isi: ortası kömür siyahı, dışa doğru çizgili is
function scorchTexture() {
  return canvasTex('scorch', 128, (g, s, r) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.45, 'rgba(255,255,255,0.75)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2; g.lineWidth = 1 + r() * 3; g.beginPath();
      g.moveTo(s / 2 + Math.cos(a) * s * 0.2, s / 2 + Math.sin(a) * s * 0.2); g.lineTo(s / 2 + Math.cos(a) * s * (0.35 + r() * 0.15), s / 2 + Math.sin(a) * s * (0.35 + r() * 0.15)); g.stroke();
    }
  });
}
// şok dalgası halkası
function ringTexture() {
  return canvasTex('ring', 128, (g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.7, 'rgba(255,255,255,0.8)'); grd.addColorStop(0.85, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  });
}

// ---------------- nokta parçacık sistemi ----------------
// opts: additive, tex, ramp (ateş renk geçişi), drag, fadeIn (ömür oranı), lit (gece kararır)
class ParticleSystem {
  constructor(scene, max, opts = {}) {
    if (typeof opts === 'boolean') opts = { additive: opts };
    this.max = max;
    this.ramp = !!opts.ramp;
    this.drag = opts.drag || 0;
    this.fadeIn = opts.fadeIn || 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.base = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.startAlpha = new Float32Array(max);
    this.rot = new Float32Array(max);
    this.spin = new Float32Array(max);
    this.floor = new Float32Array(max).fill(-1e9);
    this.kind = new Uint8Array(max); // 0 normal, 1 kan damlası (yere düşünce iz), 2 seken
    this.delay = new Float32Array(max);
    this.cursor = 0;
    this.alive = 0;
    this.onLand = null;
    const geo = new THREE.BufferGeometry();
    const dyn = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', dyn(this.pos, 3));
    geo.setAttribute('aColor', dyn(this.col, 3));
    geo.setAttribute('aSize', dyn(this.size, 1));
    geo.setAttribute('aAlpha', dyn(this.alpha, 1));
    geo.setAttribute('aRot', dyn(this.rot, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: opts.tex || glowTexture() }, uLight: { value: 1 }, uScale: { value: 600 } }, vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.lit = !!opts.lit;
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = opts.order || 10;
    scene.add(this.points);
    this.geo = geo;
  }
  // indeks döndürür: çağıran rot/spin/floor/kind/delay değerlerini ayarlayabilir
  emit(x, y, z, vx, vy, vz, life, size, r, g, b, alpha = 1, grow = 0, grav = 0) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.col[k] = r; this.col[k + 1] = g; this.col[k + 2] = b;
    this.base[k] = r; this.base[k + 1] = g; this.base[k + 2] = b;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.alpha[i] = this.fadeIn ? 0 : alpha; this.startAlpha[i] = alpha;
    this.grow[i] = grow; this.grav[i] = grav;
    this.rot[i] = Math.random() * 6.283; this.spin[i] = 0;
    this.floor[i] = -1e9; this.kind[i] = 0; this.delay[i] = 0;
    return i;
  }
  update(dt) {
    let alive = 0;
    const drag = this.drag ? Math.exp(-this.drag * dt) : 1;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      alive++;
      if (this.delay[i] > 0) { this.delay[i] -= dt; this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= this.grav[i] * dt;
      if (drag !== 1) { this.vel[k] *= drag; this.vel[k + 1] *= drag; this.vel[k + 2] *= drag; }
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < this.floor[i]) {
        const kd = this.kind[i];
        if (kd === 1) { if (this.onLand) this.onLand(this.pos[k], this.floor[i], this.pos[k + 2], this.size[i]); this.life[i] = 0; this.alpha[i] = 0; continue; }
        this.pos[k + 1] = this.floor[i];
        if (kd === 2) { this.vel[k + 1] *= -0.3; this.vel[k] *= 0.5; this.vel[k + 2] *= 0.5; } else { this.vel[k + 1] = 0; this.vel[k] *= 0.8; this.vel[k + 2] *= 0.8; }
      }
      this.size[i] = Math.max(0.001, this.size[i] + this.grow[i] * dt);
      this.rot[i] += this.spin[i] * dt;
      const lf = Math.max(0, this.life[i] / this.maxLife[i]);
      let a = this.startAlpha[i] * lf;
      if (this.fadeIn) { const age = 1 - lf; if (age < this.fadeIn) a *= age / this.fadeIn; }
      if (this.ramp) {
        // ateş rengi: beyaz-sıcak -> sarı -> turuncu-kırmızı -> is
        const f = 1 - lf;
        let r, g, b;
        if (f < 0.12) { const t = f / 0.12; r = 1.0 - 0.1 * t; g = 0.85 - 0.33 * t; b = 0.55 - 0.4 * t; }
        else if (f < 0.45) { const t = (f - 0.12) / 0.33; r = 0.9 - 0.35 * t; g = 0.52 - 0.35 * t; b = 0.15 - 0.11 * t; }
        else { const t = (f - 0.45) / 0.55; r = 0.55 - 0.48 * t; g = 0.17 - 0.15 * t; b = 0.04 - 0.03 * t; }
        this.col[k] = r * this.base[k]; this.col[k + 1] = g * this.base[k + 1]; this.col[k + 2] = b * this.base[k + 2];
        a = this.startAlpha[i] * Math.pow(lf, 0.6);
      }
      this.alpha[i] = a;
    }
    if (alive || this.alive) {
      const at = this.geo.attributes;
      at.position.needsUpdate = true; at.aSize.needsUpdate = true; at.aAlpha.needsUpdate = true; at.aRot.needsUpdate = true;
      at.aColor.needsUpdate = true;
    }
    this.alive = alive;
  }
  setParent(scene) { scene.add(this.points); }
  clear() { this.life.fill(0); this.alpha.fill(0); this.delay.fill(0); this.geo.attributes.aAlpha.needsUpdate = true; }
}

// ---------------- çizgi kıvılcımlar (hıza göre uzayan, yerçekimli, seken) ----------------
class SparkLines {
  constructor(scene, max) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.floor = new Float32Array(max);
    this.heat = new Float32Array(max);
    this.verts = new Float32Array(max * 6);
    this.cols = new Float32Array(max * 6);
    this.cursor = 0;
    this.alive = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.verts, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.cols, 3).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 11;
    this.geo = geo;
    scene.add(this.lines);
  }
  emit(x, y, z, vx, vy, vz, life, floor = -1e9, heat = 1) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.floor[i] = floor; this.heat[i] = heat;
  }
  update(dt) {
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      const k = i * 3, v = i * 6;
      if (this.life[i] <= 0) {
        if (this.cols[v] !== 0 || this.cols[v + 3] !== 0) { for (let j = 0; j < 6; j++) { this.cols[v + j] = 0; this.verts[v + j] = 0; } }
        continue;
      }
      alive++;
      this.life[i] -= dt;
      this.vel[k + 1] -= 11 * dt;
      const d = Math.exp(-1.5 * dt);
      this.vel[k] *= d; this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < this.floor[i]) { this.pos[k + 1] = this.floor[i]; this.vel[k + 1] *= -0.35; this.vel[k] *= 0.6; this.vel[k + 2] *= 0.6; }
      const lf = Math.max(0, this.life[i] / this.maxLife[i]);
      const st = 0.022;
      this.verts[v] = this.pos[k]; this.verts[v + 1] = this.pos[k + 1]; this.verts[v + 2] = this.pos[k + 2];
      this.verts[v + 3] = this.pos[k] - this.vel[k] * st; this.verts[v + 4] = this.pos[k + 1] - this.vel[k + 1] * st; this.verts[v + 5] = this.pos[k + 2] - this.vel[k + 2] * st;
      const h = this.heat[i] * lf;
      const r = 1.4 * h, g = 0.95 * h * h, b = 0.45 * h * h * h;
      this.cols[v] = r; this.cols[v + 1] = g; this.cols[v + 2] = b;
      this.cols[v + 3] = r * 0.25; this.cols[v + 4] = g * 0.15; this.cols[v + 5] = b * 0.1;
    }
    if (alive || this.alive) { this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true; }
    this.alive = alive;
  }
  setParent(scene) { scene.add(this.lines); }
  clear() { this.life.fill(0); this.cols.fill(0); this.verts.fill(0); this.geo.attributes.color.needsUpdate = true; this.geo.attributes.position.needsUpdate = true; }
}

// ---------------- iz katmanı (InstancedMesh, ömür boyunca solar, büyüyebilir) ----------------
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _n = new THREE.Vector3();
const ZAXIS = new THREE.Vector3(0, 0, 1);
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);

function fadeMaterial(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFade; varying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vFade;');
  };
  mat.customProgramCacheKey = () => 'decalFade';
  return mat;
}

class DecalLayer {
  constructor(scene, max, mat, offset = 0.015) {
    this.max = max;
    this.offset = offset;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.fade = new Float32Array(max);
    geo.setAttribute('aFade', new THREE.InstancedBufferAttribute(this.fade, 1).setUsage(THREE.DynamicDrawUsage));
    this.mesh = new THREE.InstancedMesh(geo, fadeMaterial(mat), max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.receiveShadow = false;
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, ZERO_M);
    this.p = new Float32Array(max * 3);
    this.nrm = new Float32Array(max * 3);
    this.rot = new Float32Array(max);
    this.size = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.growT = new Float32Array(max);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.aMax = new Float32Array(max);
    this.stretch = new Float32Array(max).fill(1);
    this.cursor = 0;
    this.alive = 0;
    scene.add(this.mesh);
  }
  add(x, y, z, nx, ny, nz, size, life = 40, alpha = 1, size1 = 0, growT = 0, stretch = 1) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    const k = i * 3;
    this.p[k] = x + nx * this.offset; this.p[k + 1] = y + ny * this.offset + (ny > 0.5 ? i * 0.00005 : 0); this.p[k + 2] = z + nz * this.offset;
    this.nrm[k] = nx; this.nrm[k + 1] = ny; this.nrm[k + 2] = nz;
    this.rot[i] = Math.random() * Math.PI * 2;
    this.size0[i] = size; this.size1[i] = size1 || size; this.growT[i] = growT; this.size[i] = size;
    this.age[i] = 0; this.life[i] = life; this.aMax[i] = alpha; this.stretch[i] = stretch;
    this.compose(i);
    this.fade[i] = alpha;
    this.mesh.geometry.attributes.aFade.needsUpdate = true;
    return i;
  }
  compose(i) {
    const k = i * 3;
    _n.set(this.nrm[k], this.nrm[k + 1], this.nrm[k + 2]);
    _q.setFromUnitVectors(ZAXIS, _n);
    _q2.setFromAxisAngle(ZAXIS, this.rot[i]);
    _q.multiply(_q2);
    _v.set(this.p[k], this.p[k + 1], this.p[k + 2]);
    const s = this.size[i];
    _s.set(s, s * this.stretch[i], 1);
    _m4.compose(_v, _q, _s);
    this.mesh.setMatrixAt(i, _m4);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  // izi solarak kapat (ör. ceset kaldırılınca)
  expire(i, t = 3) { if (this.life[i] > 0) this.life[i] = Math.min(this.life[i], this.age[i] + t); }
  update(dt) {
    let alive = 0, changed = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      alive++;
      this.age[i] += dt;
      const a = this.age[i];
      if (this.growT[i] > 0 && a <= this.growT[i] + dt) {
        const t = Math.min(1, a / this.growT[i]);
        const e = 1 - (1 - t) * (1 - t);
        this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * e;
        this.compose(i);
      }
      const rem = this.life[i] - a;
      let f = this.aMax[i];
      if (rem < 3) f *= Math.max(0, rem / 3);
      if (a < 0.08) f *= a / 0.08;
      if (this.fade[i] !== f) { this.fade[i] = f; changed = true; }
      if (rem <= 0) { this.life[i] = 0; this.fade[i] = 0; this.mesh.setMatrixAt(i, ZERO_M); this.mesh.instanceMatrix.needsUpdate = true; }
    }
    if (changed) this.mesh.geometry.attributes.aFade.needsUpdate = true;
    this.alive = alive;
  }
  setParent(scene) { scene.add(this.mesh); }
  clear() {
    this.life.fill(0); this.fade.fill(0);
    for (let i = 0; i < this.max; i++) this.mesh.setMatrixAt(i, ZERO_M);
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.geometry.attributes.aFade.needsUpdate = true;
  }
}

// ---------------- uçan enkaz parçaları ----------------
class Debris {
  constructor(scene, max) {
    this.max = max;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.1 });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(0.3), 3);
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, ZERO_M);
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.rot = new Float32Array(max * 3);
    this.ang = new Float32Array(max * 3);
    this.scl = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.floor = new Float32Array(max);
    this.burn = new Float32Array(max);
    this.cursor = 0;
    this.alive = 0;
    this.euler = new THREE.Euler();
    scene.add(this.mesh);
  }
  emit(x, y, z, vx, vy, vz, size, floor, burn, r, g, b) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.rot[k] = Math.random() * 6; this.rot[k + 1] = Math.random() * 6; this.rot[k + 2] = Math.random() * 6;
    this.ang[k] = rnd(12); this.ang[k + 1] = rnd(12); this.ang[k + 2] = rnd(12);
    this.scl[k] = size * (0.6 + Math.random() * 0.8); this.scl[k + 1] = size * (0.3 + Math.random() * 0.5); this.scl[k + 2] = size * (0.6 + Math.random() * 0.8);
    this.life[i] = 4 + Math.random() * 3; this.floor[i] = floor; this.burn[i] = burn;
    this.mesh.instanceColor.setXYZ(i, r, g, b); this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt, P) {
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      alive++;
      const k = i * 3;
      this.life[i] -= dt;
      const grounded = this.pos[k + 1] <= this.floor[i] + 0.001;
      if (!grounded) {
        this.vel[k + 1] -= 16 * dt;
        this.rot[k] += this.ang[k] * dt; this.rot[k + 1] += this.ang[k + 1] * dt; this.rot[k + 2] += this.ang[k + 2] * dt;
        // yanan parça: alev ve duman izi
        if (this.burn[i] > 0) {
          this.burn[i] -= dt;
          if (Math.random() < 0.5) P.fireSys.emit(this.pos[k], this.pos[k + 1], this.pos[k + 2], 0, 0.5, 0, 0.35, 0.35, 1, 1, 1, 0.9, 0.6);
          if (Math.random() < 0.35) P.smokeSys.emit(this.pos[k], this.pos[k + 1], this.pos[k + 2], 0, 0.6, 0, 1.6, 0.35, 0.16, 0.15, 0.14, 0.5, 0.9);
        }
      }
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < this.floor[i]) {
        this.pos[k + 1] = this.floor[i];
        if (Math.abs(this.vel[k + 1]) > 1.5) { this.vel[k + 1] *= -0.3; this.vel[k] *= 0.5; this.vel[k + 2] *= 0.5; this.ang[k] *= 0.5; this.ang[k + 2] *= 0.5; }
        else { this.vel[k] = this.vel[k + 1] = this.vel[k + 2] = 0; }
      }
      const sh = this.life[i] < 0.6 ? Math.max(0, this.life[i] / 0.6) : 1;
      this.euler.set(this.rot[k], this.rot[k + 1], this.rot[k + 2]);
      _q.setFromEuler(this.euler);
      _v.set(this.pos[k], this.pos[k + 1] + this.scl[k + 1] * 0.5 * sh, this.pos[k + 2]);
      _s.set(this.scl[k] * sh, this.scl[k + 1] * sh, this.scl[k + 2] * sh);
      _m4.compose(_v, _q, _s);
      this.mesh.setMatrixAt(i, this.life[i] > 0 ? _m4 : ZERO_M);
    }
    if (alive || this.alive) this.mesh.instanceMatrix.needsUpdate = true;
    this.alive = alive;
  }
  setParent(scene) { scene.add(this.mesh); }
  clear() { this.life.fill(0); for (let i = 0; i < this.max; i++) this.mesh.setMatrixAt(i, ZERO_M); this.mesh.instanceMatrix.needsUpdate = true; }
}

// ---------------- şok dalgası halkaları ----------------
class Rings {
  constructor(scene, n) {
    this.list = [];
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: ringTexture(), color: 0xffd8a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false; m.frustumCulled = false; m.renderOrder = 12;
      scene.add(m);
      this.list.push({ m, mat, t: 0, dur: 0.5, r: 1, a: 1 });
    }
    this.idx = 0;
  }
  emit(x, y, z, radius, dur = 0.45, alpha = 1, color = 0xffd8a0) {
    const r = this.list[this.idx]; this.idx = (this.idx + 1) % this.list.length;
    r.m.position.set(x, y, z); r.t = 0; r.dur = dur; r.r = radius; r.a = alpha; r.m.visible = true;
    r.mat.color.setHex(color);
  }
  update(dt) {
    for (const r of this.list) {
      if (!r.m.visible) continue;
      r.t += dt;
      const f = r.t / r.dur;
      if (f >= 1) { r.m.visible = false; continue; }
      const e = 1 - Math.pow(1 - f, 3);
      const s = 0.5 + r.r * 2 * e;
      r.m.scale.set(s, 1, s);
      r.mat.opacity = r.a * (1 - f) * (1 - f);
    }
  }
  setParent(scene) { for (const r of this.list) scene.add(r.m); }
  clear() { for (const r of this.list) r.m.visible = false; }
}

export class Particles {
  constructor(scene) {
    this.add = new ParticleSystem(scene, 1500, { additive: true });
    this.norm = new ParticleSystem(scene, 1500, { additive: false, lit: true });
    this.fireSys = new ParticleSystem(scene, 700, { additive: true, tex: fireTexture(), ramp: true, drag: 1.6, order: 12 });
    this.smokeSys = new ParticleSystem(scene, 800, { additive: false, tex: smokeTexture(), drag: 0.9, fadeIn: 0.12, lit: true, order: 11 });
    this.sparkSys = new SparkLines(scene, 500);
    this.debris = new Debris(scene, 90);
    this.rings = new Rings(scene, 5);
    const std = (o) => new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, ...o });
    this.holes = new DecalLayer(scene, 140, std({ map: holeTexture(), roughness: 0.95, color: 0xffffff }), 0.012);
    this.splats = new DecalLayer(scene, 220, std({ map: splatTexture(), color: 0x6a0306, roughness: 0.22, metalness: 0.05 }), 0.014);
    this.pools = new DecalLayer(scene, 28, std({ map: poolTexture(), color: 0x520204, roughness: 0.12, metalness: 0.1 }), 0.018);
    this.scorch = new DecalLayer(scene, 16, std({ map: scorchTexture(), color: 0x050403, roughness: 1 }), 0.01);
    this.systems = [this.add, this.norm, this.fireSys, this.smokeSys];
    // düşen kan damlaları yere iz bırakır
    this.norm.onLand = (x, y, z, size) => { if (Math.random() < 0.6) this.splats.add(x, y, z, 0, 1, 0, 0.08 + size * 1.6 + Math.random() * 0.12, 50, 0.9); };
    this.nightK = 1;
  }
  setScene(scene) {
    for (const s of this.systems) { s.setParent(scene); s.clear(); }
    for (const o of [this.sparkSys, this.debris, this.rings, this.holes, this.splats, this.pools, this.scorch]) { o.setParent(scene); o.clear(); }
  }
  // 0 (gece) .. 1 (gündüz): ışık almayan parçacıkların (duman, kan) parlaklığı
  setLight(k) {
    const v = 0.25 + 0.75 * k;
    this.norm.mat.uniforms.uLight.value = v;
    this.smokeSys.mat.uniforms.uLight.value = v;
  }
  update(dt) {
    for (const s of this.systems) s.update(dt);
    this.sparkSys.update(dt);
    this.debris.update(dt, this);
    this.rings.update(dt);
    this.holes.update(dt); this.splats.update(dt); this.pools.update(dt); this.scorch.update(dt);
  }

  // ---- namlu: sıcak çekirdek, kıvılcım ve duman tülü (yıldız alevi combat.js'de) ----
  muzzle(p, dir, k = 1) {
    this.add.emit(p.x, p.y, p.z, dir.x * 2, dir.y * 2, dir.z * 2, 0.05, 0.35 * k, 1.6, 1.1, 0.5, 1);
    for (let i = 0; i < 3; i++) {
      const s = 2 + Math.random() * 5;
      this.add.emit(p.x, p.y, p.z, dir.x * s + rnd(0.6), dir.y * s + rnd(0.6), dir.z * s + rnd(0.6), 0.05, 0.12 + Math.random() * 0.12 * k, 1, 0.7, 0.3);
    }
    if (k > 1.2) for (let i = 0; i < 5; i++) { const s = 8 + Math.random() * 10; this.sparkSys.emit(p.x, p.y, p.z, dir.x * s + rnd(2), dir.y * s + rnd(2), dir.z * s + rnd(2), 0.15 + Math.random() * 0.15, -1e9, 0.8); }
    for (let i = 0; i < 2; i++) {
      const s = 0.6 + Math.random() * 0.8;
      this.smokeSys.emit(p.x + dir.x * 0.1, p.y + dir.y * 0.1, p.z + dir.z * 0.1, dir.x * s + rnd(0.2), 0.3 + dir.y * s, dir.z * s + rnd(0.2), 0.9 + Math.random() * 0.6, 0.1 * k, 0.7, 0.7, 0.7, 0.18, 0.5 + 0.3 * k, -0.3);
    }
  }
  // roketatar arka alevi ve toz bulutu
  backblast(p, back) {
    for (let i = 0; i < 12; i++) {
      const s = 4 + Math.random() * 8;
      this.smokeSys.emit(p.x, p.y, p.z, back.x * s + rnd(1.5), back.y * s + rnd(1) + 0.5, back.z * s + rnd(1.5), 1.5 + Math.random(), 0.4, 0.75, 0.72, 0.68, 0.45, 1.6);
    }
    for (let i = 0; i < 6; i++) { const s = 3 + Math.random() * 5; this.fireSys.emit(p.x, p.y, p.z, back.x * s + rnd(1), back.y * s + rnd(1), back.z * s + rnd(1), 0.15, 0.4, 1, 1, 1, 1, 1.5); }
  }
  // ---- kıvılcım (metal, beton) ----
  sparks(p, n = 6, nrm = null) {
    const nx = nrm ? nrm.x : 0, ny = nrm ? nrm.y : 0.5, nz = nrm ? nrm.z : 0;
    for (let i = 0; i < n; i++) {
      const s = 3 + Math.random() * 6;
      this.sparkSys.emit(p.x, p.y, p.z, (nx + rnd(0.8)) * s, (ny + Math.random() * 0.8) * s, (nz + rnd(0.8)) * s, 0.2 + Math.random() * 0.35, (p.floor !== undefined ? p.floor : Math.min(0, p.y - 2)) + 0.01, 1);
    }
    this.add.emit(p.x, p.y, p.z, 0, 0, 0, 0.06, 0.3, 1.5, 1.1, 0.6, 1);
    this.norm.emit(p.x, p.y, p.z, nx * 0.4, 0.4, nz * 0.4, 0.7, 0.15, 0.55, 0.52, 0.48, 0.4, 0.8);
  }
  // ---- kan (eski arayüz): p noktasında rastgele sıçrama ----
  blood(p, n = 8, dir = null, floorY = null) {
    if (dir) return this.bloodSpray(p, dir, n, floorY);
    const fy = floorY !== null ? floorY : Math.max(0, p.y - 1.4);
    for (let i = 0; i < n; i++) {
      const j = this.norm.emit(p.x, p.y, p.z, rnd(2), Math.random() * 2, rnd(2), 1.5, 0.05 + Math.random() * 0.06, 0.42, 0.01, 0.01, 0.95, 0, 9.8);
      this.norm.floor[j] = fy; this.norm.kind[j] = 1;
    }
    this.norm.emit(p.x, p.y, p.z, 0, 0.2, 0, 0.4, 0.2, 0.45, 0.02, 0.02, 0.5, 1.2);
  }
  // ---- yönlü kan: kurşun yönünde çıkış püskürtmesi + giriş geri sıçraması + kırmızı sis ----
  bloodSpray(p, dir, n = 10, floorY = null, k = 1) {
    const fy = floorY !== null ? floorY : Math.max(0, p.y - 1.4);
    for (let i = 0; i < n; i++) {
      const s = 2 + Math.random() * 4 * k;
      const j = this.norm.emit(p.x, p.y, p.z, dir.x * s + rnd(0.9), dir.y * s + Math.random() * 1.5, dir.z * s + rnd(0.9), 1.6, 0.035 + Math.random() * 0.06, 0.4, 0.008, 0.01, 0.95, 0, 9.8);
      this.norm.floor[j] = fy; this.norm.kind[j] = 1;
    }
    for (let i = 0; i < Math.ceil(n * 0.3); i++) {
      const s = 0.8 + Math.random() * 1.5;
      const j = this.norm.emit(p.x, p.y, p.z, -dir.x * s + rnd(0.6), Math.random() * 1.2, -dir.z * s + rnd(0.6), 1.2, 0.03 + Math.random() * 0.04, 0.45, 0.01, 0.01, 0.9, 0, 9.8);
      this.norm.floor[j] = fy; this.norm.kind[j] = 1;
    }
    for (let i = 0; i < 3; i++) this.norm.emit(p.x + dir.x * 0.1 * i, p.y, p.z + dir.z * 0.1 * i, dir.x * 1.2 + rnd(0.3), 0.15, dir.z * 1.2 + rnd(0.3), 0.35 + Math.random() * 0.25, 0.12 + 0.08 * k, 0.5, 0.03, 0.03, 0.55, 1.4);
  }
  // ---- yüzeye göre isabet efekti ----
  // surface: 'concrete' | 'metal' | 'water' | 'wood' | 'dirt'
  impact(p, n, surface, dir) {
    if (surface === 'water') {
      for (let i = 0; i < 10; i++) this.norm.emit(p.x, p.y, p.z, rnd(0.8), 2.5 + Math.random() * 3.5, rnd(0.8), 0.6, 0.06 + Math.random() * 0.05, 0.75, 0.85, 0.95, 0.75, 0, 9.8);
      this.norm.emit(p.x, p.y + 0.05, p.z, 0, 0.3, 0, 0.5, 0.25, 0.85, 0.9, 1, 0.45, 1.2);
      this.rings.emit(p.x, p.y + 0.02, p.z, 0.25, 0.6, 0.35, 0xbfd8ff);
      return;
    }
    if (surface === 'metal') {
      this.sparks(p, 9, n);
      return;
    }
    // beton/taş: toz bulutu + taş kırıntıları + az kıvılcım
    const rx = n.x - dir.x * 0.3, ry = n.y - dir.y * 0.3, rz = n.z - dir.z * 0.3;
    const dc = surface === 'wood' ? [0.42, 0.3, 0.18] : surface === 'dirt' ? [0.4, 0.33, 0.24] : [0.62, 0.59, 0.54];
    for (let i = 0; i < 2; i++) {
      const s = 0.6 + Math.random() * 1.2;
      this.smokeSys.emit(p.x, p.y, p.z, rx * s + rnd(0.3), ry * s + 0.2, rz * s + rnd(0.3), 0.8 + Math.random() * 0.6, 0.12, dc[0], dc[1], dc[2], 0.55, 0.9, 0.5);
    }
    for (let i = 0; i < 6; i++) {
      const s = 2 + Math.random() * 4;
      const j = this.norm.emit(p.x, p.y, p.z, (rx + rnd(0.7)) * s, (ry + Math.random() * 0.6) * s, (rz + rnd(0.7)) * s, 0.7, 0.025 + Math.random() * 0.03, dc[0] * 0.6, dc[1] * 0.6, dc[2] * 0.6, 1, 0, 12);
      this.norm.floor[j] = Math.min(p.y, 0) + 0.01; this.norm.kind[j] = 2;
    }
    if (surface !== 'wood' && Math.random() < 0.6) for (let i = 0; i < 3; i++) {
      const s = 3 + Math.random() * 5;
      this.sparkSys.emit(p.x, p.y, p.z, (n.x + rnd(0.6)) * s, (n.y + Math.random() * 0.5) * s, (n.z + rnd(0.6)) * s, 0.12 + Math.random() * 0.15, -1e9, 0.9);
    }
    this.add.emit(p.x, p.y, p.z, 0, 0, 0, 0.04, 0.12, 1.2, 0.9, 0.6, 0.8);
  }
  // ---- katmanlı patlama ----
  // opts: floorY (zemin yüksekliği), water (su üstünde)
  explosion(p, scale = 1, opts = {}) {
    const fy = opts.floorY !== undefined ? opts.floorY : Math.max(0, p.y - 2);
    const x = p.x, y = p.y, z = p.z, sc = scale;
    // 1) göz kamaştıran ilk parlama
    this.add.emit(x, y + 0.6, z, 0, 0, 0, 0.12, 7 * sc, 1.0, 0.85, 0.6, 0.9);
    this.add.emit(x, y + 0.6, z, 0, 0, 0, 0.3, 4 * sc, 1.1, 0.6, 0.25, 0.8, 5 * sc);
    // 2) ana ateş topu: dışa ve yukarı genleşen, renk geçişli billboard'lar
    for (let i = 0; i < 26 * sc + 8; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 0.9 + 0.1;
      const sp = (3 + Math.random() * 7) * sc;
      const j = this.fireSys.emit(x + Math.cos(a) * 0.6 * sc, y + 0.4 + Math.random() * 0.8 * sc, z + Math.sin(a) * 0.6 * sc,
        Math.cos(a) * sp * u, (2 + Math.random() * 6) * sc, Math.sin(a) * sp * u,
        0.7 + Math.random() * 0.7, (1.4 + Math.random() * 1.4) * sc, 1, 1, 1, 0.55, 2.2 * sc, -1.5);
      this.fireSys.spin[j] = rnd(1.5);
    }
    // 3) yükselen ikincil alev (mantar gövdesi)
    for (let i = 0; i < 10 * sc + 4; i++) {
      const j = this.fireSys.emit(x + rnd(0.8 * sc), y + 1 + Math.random() * 1.5 * sc, z + rnd(0.8 * sc), rnd(1), (5 + Math.random() * 4) * sc, rnd(1),
        0.9 + Math.random() * 0.6, (1.2 + Math.random()) * sc, 0.9, 0.8, 0.8, 0.5, 1.5 * sc, -2);
      this.fireSys.delay[j] = 0.05 + Math.random() * 0.2; this.fireSys.spin[j] = rnd(1);
    }
    // 4) duman sütunu: gecikmeli, yükselen ve genişleyen
    for (let i = 0; i < 30 * sc + 10; i++) {
      const h = Math.random();
      const j = this.smokeSys.emit(x + rnd(1.4 * sc), y + 0.8 + h * 2.5 * sc, z + rnd(1.4 * sc), rnd(1.6), (2 + Math.random() * 4.5) * sc, rnd(1.6),
        4 + Math.random() * 4, (1.5 + Math.random() * 1.6) * sc, 0.11 + h * 0.08, 0.1 + h * 0.075, 0.095 + h * 0.07, 0.85, 1.3 * sc, -0.6);
      this.smokeSys.delay[j] = 0.12 + Math.random() * 0.55; this.smokeSys.spin[j] = rnd(0.4);
    }
    // 5) yerde yayılan toz halkası
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * Math.PI * 2 + rnd(0.1), sp = (8 + Math.random() * 6) * sc;
      const j = this.smokeSys.emit(x + Math.cos(a) * 0.8, fy + 0.4, z + Math.sin(a) * 0.8, Math.cos(a) * sp, 0.6, Math.sin(a) * sp, 2.2 + Math.random(), 1.1 * sc, 0.45, 0.41, 0.36, 0.6, 1.6 * sc);
      this.smokeSys.delay[j] = 0.02;
    }
    // 6) şok dalgası halkası
    if (!opts.water) this.rings.emit(x, fy + 0.08, z, 6 * sc, 0.45, 1);
    this.rings.emit(x, y + 0.6, z, 4 * sc, 0.25, 0.6, 0xfff0d0);
    // 7) kor kıvılcımlar
    for (let i = 0; i < 50 * sc + 10; i++) {
      const s = (8 + Math.random() * 16) * sc;
      const a = Math.random() * Math.PI * 2, u = Math.random();
      this.sparkSys.emit(x, y + 0.5, z, Math.cos(a) * s * (1 - u * 0.5), (0.3 + u) * s * 0.8, Math.sin(a) * s * (1 - u * 0.5), 0.6 + Math.random() * 1.2, fy + 0.02, 1.2);
    }
    // 8) uçan enkaz parçaları (bazıları yanarak duman izi bırakır)
    if (!opts.water) {
      for (let i = 0; i < 14 * sc + 4; i++) {
        const a = Math.random() * Math.PI * 2, s = (4 + Math.random() * 9) * sc;
        const c = 0.12 + Math.random() * 0.25;
        this.debris.emit(x + rnd(0.5), y + 0.5, z + rnd(0.5), Math.cos(a) * s, (4 + Math.random() * 9) * sc, Math.sin(a) * s,
          0.05 + Math.random() * 0.12 * sc, fy, Math.random() < 0.4 ? 1 + Math.random() * 1.5 : 0, c * 1.05, c, c * 0.92);
      }
    } else {
      // su üstünde: yükselen su sütunu
      for (let i = 0; i < 60; i++) this.norm.emit(x + rnd(1), y, z + rnd(1), rnd(3), 8 + Math.random() * 10, rnd(3), 1.6, 0.25 + Math.random() * 0.3, 0.8, 0.88, 0.95, 0.8, 0.6, 9.8);
    }
  }
  // ---- yangın (araç yanması vb.) ----
  fire(p, k = 1) {
    const j = this.fireSys.emit(p.x + rnd(0.5 * k), p.y, p.z + rnd(0.5 * k), rnd(0.3), 1.5 + Math.random() * 2, rnd(0.3), 0.5 + Math.random() * 0.4, (0.5 + Math.random() * 0.5) * k, 0.9, 0.9, 0.9, 0.9, 0.6, -2);
    this.fireSys.spin[j] = rnd(2);
    if (Math.random() < 0.35) this.smokeSys.emit(p.x + rnd(0.3), p.y + 0.8, p.z + rnd(0.3), rnd(0.4), 1.6 + Math.random(), rnd(0.4), 3 + Math.random() * 2, 0.7 * k, 0.1, 0.095, 0.09, 0.6, 1.1);
  }
  smoke(p, k = 1) {
    const j = this.smokeSys.emit(p.x + rnd(0.3), p.y, p.z + rnd(0.3), rnd(0.4), 1.2 + Math.random() * 0.6, rnd(0.4), 2.2 + Math.random(), 0.5 * k, 0.32, 0.31, 0.3, 0.5, 1.0);
    this.smokeSys.spin[j] = rnd(0.6);
  }
  // roket egzoz izi (her karede çağrılır)
  trail(p, back, k = 1) {
    this.fireSys.emit(p.x, p.y, p.z, back.x * 6 + rnd(0.5), back.y * 6 + rnd(0.5), back.z * 6 + rnd(0.5), 0.12, 0.35 * k, 1.2, 1.1, 1, 1, 0.5);
    const j = this.smokeSys.emit(p.x + rnd(0.05), p.y + rnd(0.05), p.z + rnd(0.05), back.x + rnd(0.3), back.y + rnd(0.3) + 0.15, back.z + rnd(0.3), 2.5 + Math.random() * 1.5, 0.25 * k, 0.78, 0.76, 0.74, 0.55, 0.9);
    this.smokeSys.spin[j] = rnd(0.5);
  }
  dust(p) {
    this.smokeSys.emit(p.x + rnd(0.5), p.y + 0.1, p.z + rnd(0.5), rnd(1), 0.4, rnd(1), 1.2, 0.5, 0.55, 0.5, 0.45, 0.3, 1.5);
  }
  splash(p) {
    for (let i = 0; i < 30; i++) this.norm.emit(p.x, p.y, p.z, rnd(3), 2 + Math.random() * 4, rnd(3), 0.9, 0.1 + Math.random() * 0.15, 0.8, 0.9, 1, 0.8, 0.2, 9);
    this.rings.emit(p.x, p.y + 0.02, p.z, 1.2, 0.9, 0.4, 0xbfd8ff);
  }
  money(p) {
    for (let i = 0; i < 10; i++) this.add.emit(p.x, p.y + 0.5, p.z, rnd(1), 2 + Math.random() * 2, rnd(1), 0.6, 0.2, 0.3, 1, 0.4, 1, 0, 6);
  }

  // ---- iz (decal) yardımcıları ----
  bulletHole(p, n, surface = 'concrete') {
    if (surface === 'water') return;
    this.holes.add(p.x, p.y, p.z, n.x, n.y, n.z, 0.07 + Math.random() * 0.05, 30, surface === 'metal' ? 0.7 : 1);
  }
  bloodSplat(p, n, size = 0.4, stretch = 1) { this.splats.add(p.x, p.y, p.z, n.x, n.y, n.z, size, 50, 0.95, 0, 0, stretch); }
  // ceset altında büyüyen kan gölü; indeks döndürür
  bloodPool(x, y, z, size = 1.4, growT = 9) { return this.pools.add(x, y, z, 0, 1, 0, 0.25, 80, 0.92, size, growT); }
  scorchMark(x, y, z, size) { this.scorch.add(x, y, z, 0, 1, 0, size, 60, 0.9); }
}

function rnd(s) { return (Math.random() * 2 - 1) * s; }

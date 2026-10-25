// Havuzlanmış parçacık sistemi (ateş, duman, kıvılcım, kan, toz)
import * as THREE from 'three';
import { glowTexture } from './textures.js';

const VS = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
varying float vAlpha; varying vec3 vColor;
void main(){
  vAlpha = aAlpha; vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = aSize * (600.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
uniform sampler2D uTex; varying float vAlpha; varying vec3 vColor;
void main(){
  vec4 t = texture2D(uTex, gl_PointCoord);
  gl_FragColor = vec4(vColor, t.a * vAlpha);
  if (gl_FragColor.a < 0.01) discard;
}`;

class ParticleSystem {
  constructor(scene, max, additive) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.startAlpha = new Float32Array(max);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: glowTexture() } }, vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
    this.geo = geo;
  }
  emit(x, y, z, vx, vy, vz, life, size, r, g, b, alpha = 1, grow = 0, grav = 0) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.alpha[i] = alpha; this.startAlpha[i] = alpha;
    this.grow[i] = grow; this.grav[i] = grav;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= this.grav[i] * dt;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      this.alpha[i] = this.startAlpha[i] * Math.max(0, this.life[i] / this.maxLife[i]);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
  setParent(scene) { scene.add(this.points); }
  clear() { this.life.fill(0); this.alpha.fill(0); }
}

export class Particles {
  constructor(scene) {
    this.add = new ParticleSystem(scene, 1500, true);
    this.norm = new ParticleSystem(scene, 1500, false);
  }
  setScene(scene) { this.add.setParent(scene); this.norm.setParent(scene); this.add.clear(); this.norm.clear(); }
  update(dt) { this.add.update(dt); this.norm.update(dt); }
  muzzle(p, dir) {
    for (let i = 0; i < 5; i++) {
      const s = Math.random() * 4;
      this.add.emit(p.x, p.y, p.z, dir.x * s + rnd(0.5), dir.y * s + rnd(0.5), dir.z * s + rnd(0.5), 0.06, 0.25 + Math.random() * 0.2, 1, 0.75, 0.3);
    }
    this.norm.emit(p.x, p.y, p.z, dir.x + rnd(0.3), 0.4, dir.z + rnd(0.3), 0.6, 0.15, 0.6, 0.6, 0.6, 0.35, 0.8);
  }
  sparks(p, n = 6) {
    for (let i = 0; i < n; i++) this.add.emit(p.x, p.y, p.z, rnd(4), Math.random() * 4, rnd(4), 0.25, 0.08, 1, 0.8, 0.4, 1, 0, 9);
    this.norm.emit(p.x, p.y, p.z, 0, 0.5, 0, 0.8, 0.2, 0.55, 0.52, 0.48, 0.5, 1);
  }
  blood(p, n = 8) {
    for (let i = 0; i < n; i++) this.norm.emit(p.x, p.y, p.z, rnd(2), Math.random() * 2, rnd(2), 0.5, 0.12, 0.5, 0.02, 0.02, 0.9, 0.1, 9);
  }
  explosion(p, scale = 1) {
    for (let i = 0; i < 60 * scale; i++) {
      const v = 6 * scale;
      this.add.emit(p.x, p.y + 0.5, p.z, rnd(v), Math.random() * v, rnd(v), 0.5 + Math.random() * 0.6, 1.2 * scale, 1, 0.5 + Math.random() * 0.3, 0.1, 1, 2, 2);
    }
    for (let i = 0; i < 40 * scale; i++) {
      this.norm.emit(p.x + rnd(2), p.y + 1, p.z + rnd(2), rnd(2), 1 + Math.random() * 3, rnd(2), 2 + Math.random() * 2, 2 * scale, 0.15, 0.14, 0.13, 0.7, 2.5);
    }
    for (let i = 0; i < 30; i++) this.add.emit(p.x, p.y + 0.5, p.z, rnd(15), Math.random() * 12, rnd(15), 0.6, 0.15, 1, 0.9, 0.5, 1, 0, 12);
  }
  fire(p, k = 1) {
    this.add.emit(p.x + rnd(0.6 * k), p.y, p.z + rnd(0.6 * k), rnd(0.3), 2 + Math.random() * 2, rnd(0.3), 0.5, 0.8 * k, 1, 0.45 + Math.random() * 0.3, 0.1, 1, -0.8);
    if (Math.random() < 0.4) this.norm.emit(p.x, p.y + 1, p.z, rnd(0.5), 2, rnd(0.5), 2.5, 1 * k, 0.1, 0.1, 0.1, 0.5, 1.5);
  }
  smoke(p, k = 1) {
    this.norm.emit(p.x + rnd(0.3), p.y, p.z + rnd(0.3), rnd(0.4), 1.5, rnd(0.4), 2, 0.6 * k, 0.3, 0.3, 0.3, 0.45, 1.2);
  }
  dust(p) {
    this.norm.emit(p.x + rnd(0.5), p.y + 0.1, p.z + rnd(0.5), rnd(1), 0.5, rnd(1), 0.8, 0.5, 0.55, 0.5, 0.45, 0.3, 1.5);
  }
  splash(p) {
    for (let i = 0; i < 25; i++) this.norm.emit(p.x, p.y, p.z, rnd(3), 2 + Math.random() * 4, rnd(3), 0.8, 0.25, 0.8, 0.9, 1, 0.8, 0, 9);
  }
  money(p) {
    for (let i = 0; i < 10; i++) this.add.emit(p.x, p.y + 0.5, p.z, rnd(1), 2 + Math.random() * 2, rnd(1), 0.6, 0.2, 0.3, 1, 0.4, 1, 0, 6);
  }
}

function rnd(s) { return (Math.random() * 2 - 1) * s; }

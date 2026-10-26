// Gökyüzü (Preetham), güneş/ay, yıldızlar, iki katmanlı prosedürel bulut kubbesi, gün/gece döngüsü,
// hava durumu (açık/bulutlu/yağmur), yağmur çizgileri, şimşek ve ıslak zemin (SHARED.uWet).
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { makeCanvas, noiseTexture, glowTexture } from '../core/textures.js';
import { clamp, lerp, RNG } from '../core/util.js';
import { SHARED } from './shaders.js';

// Dışa açık hava uniform'ları (diğer modüller/şaderler için): uWet 0..1 ıslaklık, uRain yağış, uLightning flaş
export const WEATHER = SHARED;

const C = (h) => new THREE.Color(h);
// güneş yüksekliğine göre renk anahtarları [yükseklik, güneş, gökyüzü (hemi üst), zemin (hemi alt), sis]
const KEYS = [
  [-0.3, C(0x000000), C(0x0a1020), C(0x08080c), C(0x070b16)],
  [-0.08, C(0x3a2040), C(0x1a2040), C(0x14121a), C(0x1a1e34)],
  [0.0, C(0xff5a20), C(0x5a5a80), C(0x3a2a28), C(0x9a6a5a)],
  [0.08, C(0xff9a50), C(0x8aa0c8), C(0x6a5040), C(0xd8a080)],
  [0.25, C(0xffe0b8), C(0xa8c4ec), C(0x6a5a48), C(0xc8d2dc)],
  [0.6, C(0xfff6ea), C(0xb8d4ff), C(0x6a5a48), C(0xc4d4e4)],
];
function keyAt(e, i, out) {
  if (e <= KEYS[0][0]) return out.copy(KEYS[0][i]);
  for (let k = 0; k < KEYS.length - 1; k++) {
    const a = KEYS[k], b = KEYS[k + 1];
    if (e <= b[0]) return out.copy(a[i]).lerp(b[i], (e - a[0]) / (b[0] - a[0]));
  }
  return out.copy(KEYS[KEYS.length - 1][i]);
}

function moonTexture() {
  const S = 256, c = makeCanvas(S, S), g = c.getContext('2d');
  const r = new RNG(5);
  const grd = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,250,235,1)'); grd.addColorStop(0.92, 'rgba(240,236,220,1)'); grd.addColorStop(1, 'rgba(240,236,220,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, 6.28); g.fill();
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(120,115,110,${r.float(0.08, 0.3)})`; g.beginPath(); g.arc(r.float(30, 226), r.float(30, 226), r.float(4, 30), 0, 6.28); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const CLOUD_VS = `varying vec3 vDir; varying vec3 vW; void main(){ vDir = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const CLOUD_FS = `
uniform sampler2D tNoise; uniform float uTime, uCover, uDay, uFlash, uRain; uniform vec3 uSunDir, uSunCol, uSkyCol, uFogCol;
varying vec3 vDir; varying vec3 vW;
float fbm2(vec2 p){ return texture2D(tNoise, p).r * 0.55 + texture2D(tNoise, p * 2.03 + 0.3).g * 0.3 + texture2D(tNoise, p * 4.1 + 0.7).b * 0.15; }
void main(){
  if (vDir.y < 0.0) discard;
  vec2 p = vDir.xz / (vDir.y + 0.12);
  vec2 wind = vec2(uTime * 0.0035, uTime * 0.0012);
  float n = fbm2(p * 0.22 + wind);
  float detail = texture2D(tNoise, p * 1.3 + wind * 3.0).b;
  float cov = mix(0.62, 0.22, uCover);
  float d = smoothstep(cov, cov + 0.22, n + detail * 0.12);
  // yüksek ince bulutlar (sirrus)
  float ci = smoothstep(0.55, 0.9, texture2D(tNoise, vec2(p.x * 0.05, p.y * 0.35) + wind * 0.5).r) * (1.0 - uCover * 0.5) * 0.35;
  // aydınlatma: alt yüzey koyu, güneş tarafı parlak
  float thick = smoothstep(cov, cov + 0.5, n);
  float sunF = pow(max(dot(normalize(vDir), uSunDir), 0.0), 6.0);
  vec3 lit = mix(uSkyCol * 1.1 + 0.15 * uDay, uSunCol * 1.25, 0.45 + sunF * 0.55);
  vec3 dark = mix(uSkyCol * 0.45, vec3(0.3, 0.32, 0.36) * uDay, 0.5) * (1.0 - uRain * 0.45);
  vec3 col = mix(lit, dark, thick * (0.5 + uCover * 0.5));
  col += uSunCol * pow(1.0 - thick, 3.0) * sunF * 0.6; // gümüş kenar
  col = col * max(uDay, 0.06) + uFlash * vec3(0.8, 0.85, 1.0) * thick;
  col += vec3(0.07, 0.05, 0.035) * (1.0 - uDay) * (0.3 + thick) * (0.4 + uCover); // şehir ışığı yansıması
  float a = max(d * (0.85 + uCover * 0.15), ci);
  float hor = smoothstep(0.0, 0.18, vDir.y);
  col = mix(uFogCol, col, hor);
  gl_FragColor = vec4(col, a * hor);
  #include <colorspace_fragment>
}`;

export class Environment {
  constructor(scene, renderer, quality) {
    this.scene = scene;
    this.renderer = renderer;
    this.quality = quality;
    this.time = 9.5; // saat
    this.day = 1;
    this.timeScale = 1 / 60; // gerçek 1 sn = oyun 1 dk
    this.weather = 'clear';
    this.weatherTimer = 300;
    this.rainAmount = 0;
    this.cloudCover = 0.2;
    this.wetness = 0;

    this.sky = new Sky();
    this.sky.scale.setScalar(4500);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 6; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.85;
    scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = quality !== 'low';
    const sm = quality === 'high' ? 4096 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    scene.add(this.sun); scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbcd4ff, 0x6a5a48, 0.9);
    scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0x404860, 0.2);
    scene.add(this.ambient);
    scene.fog = new THREE.Fog(0xc8d4e0, 150, 1400);

    // yıldızlar (iki boy, renk tonları)
    this.starMats = [];
    const r = new RNG(9);
    for (const [n, size] of [[1600, 1.6], [300, 3.0]]) {
      const sp = [], sc2 = [];
      for (let i = 0; i < n; i++) {
        const th = r.float(0, 6.28), ph = Math.acos(r.float(0.05, 1));
        sp.push(Math.sin(ph) * Math.cos(th) * 3000, Math.cos(ph) * 3000, Math.sin(ph) * Math.sin(th) * 3000);
        const t = r.next(); sc2.push(0.8 + t * 0.2, 0.85 + t * 0.1, 1);
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      sg.setAttribute('color', new THREE.Float32BufferAttribute(sc2, 3));
      const m = new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, fog: false, depthWrite: false });
      this.starMats.push(m);
      const pts = new THREE.Points(sg, m); pts.frustumCulled = false;
      if (!this.stars) { this.stars = new THREE.Group(); scene.add(this.stars); }
      this.stars.add(pts);
    }
    this.starMat = this.starMats[0];

    // ay + hale
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture(), fog: false, transparent: true, opacity: 0, depthWrite: false }));
    this.moon.scale.set(150, 150, 1);
    this.moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x9ab0d0, fog: false, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.moonHalo.scale.set(700, 700, 1);
    scene.add(this.moon); scene.add(this.moonHalo);

    // bulut kubbesi
    this.cloudU = {
      tNoise: { value: noiseTexture() }, uTime: { value: 0 }, uCover: { value: 0.2 }, uDay: { value: 1 }, uFlash: { value: 0 }, uRain: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uSkyCol: { value: new THREE.Color(0.6, 0.7, 0.9) }, uFogCol: { value: new THREE.Color() },
    };
    this.cloudMat = new THREE.ShaderMaterial({ uniforms: this.cloudU, vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false });
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(3800, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.cloudMat);
    this.clouds.renderOrder = -1;
    this.clouds.frustumCulled = false;
    scene.add(this.clouds);

    // yağmur: kameraya bağlı kutu içinde düşen çizgi kartları (tek çizim)
    const N = quality === 'low' ? 3000 : 9000;
    const rg = new THREE.InstancedBufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute([-0.012, 0, 0, 0.012, 0, 0, 0.012, 1, 0, -0.012, 0, 0, 0.012, 1, 0, -0.012, 1, 0], 3));
    const off = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) { off[i * 4] = r.float(-40, 40); off[i * 4 + 1] = r.float(0, 36); off[i * 4 + 2] = r.float(-40, 40); off[i * 4 + 3] = r.float(0.8, 1.2); }
    rg.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
    rg.instanceCount = N;
    this.rainU = { uTime: { value: 0 }, uRain: { value: 0 }, uCam: { value: new THREE.Vector3() }, uCol: { value: new THREE.Color(0.7, 0.75, 0.82) } };
    this.rain = new THREE.Mesh(rg, new THREE.ShaderMaterial({
      uniforms: this.rainU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `attribute vec4 aOff; uniform float uTime; uniform vec3 uCam; varying float vA; varying float vY;
        void main(){
          vec3 p = aOff.xyz; p.y = mod(p.y - uTime * 16.0 * aOff.w, 36.0);
          p.xz = mod(p.xz - uCam.xz + vec2(uTime * 1.5, 0.0) + 40.0, 80.0) - 40.0;
          vec3 w = vec3(uCam.x + p.x, uCam.y - 8.0 + p.y, uCam.z + p.z);
          vec3 toC = normalize(vec3(uCam.x - w.x, 0.0, uCam.z - w.z) + 1e-4);
          vec3 side = vec3(toC.z, 0.0, -toC.x);
          float dst = length(w.xz - uCam.xz);
          w += side * position.x * max(0.4, dst * 0.12) + vec3(0.08, -1.1 - dst * 0.03, 0.0) * position.y;
          vA = aOff.w; vY = position.y;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: `uniform float uRain; uniform vec3 uCol; varying float vA; varying float vY;
        void main(){ gl_FragColor = vec4(uCol, uRain * 0.2 * vY * vA); }`,
    }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);

    // şimşek çizgisi
    this.boltMat = new THREE.LineBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0, fog: false });
    this.bolt = new THREE.Line(new THREE.BufferGeometry(), this.boltMat);
    this.bolt.frustumCulled = false;
    scene.add(this.bolt);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envTimer = 0;
    this.skyScene = new THREE.Scene();
    this.nightFactor = 0;
    this.sunDir = new THREE.Vector3();
    this.lightning = 0;
    this._c = new THREE.Color(); this._c2 = new THREE.Color(); this._c3 = new THREE.Color(); this._c4 = new THREE.Color();
  }

  get hour() { return Math.floor(this.time); }
  get minute() { return Math.floor((this.time % 1) * 60); }

  update(dt, focus) {
    this.time += dt * this.timeScale;
    if (this.time >= 24) { this.time -= 24; this.day++; this.onNewDay && this.onNewDay(this.day); }

    // hava durumu
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      const r = Math.random();
      this.weather = r < 0.55 ? 'clear' : r < 0.8 ? 'cloudy' : 'rain';
      this.weatherTimer = 240 + Math.random() * 360;
    }
    const targetRain = this.weather === 'rain' ? 1 : 0;
    const targetCloud = this.weather === 'clear' ? 0.2 : this.weather === 'cloudy' ? 0.7 : 1;
    this.rainAmount = lerp(this.rainAmount, targetRain, Math.min(1, dt * 0.1));
    this.cloudCover = lerp(this.cloudCover, targetCloud, Math.min(1, dt * 0.1));
    // ıslaklık: yağmurda hızla artar, sonra yavaşça kurur
    const wetT = this.rainAmount > 0.15 ? 1 : 0;
    this.wetness = clamp(this.wetness + (wetT > this.wetness ? dt * 0.06 * this.rainAmount : -dt * 0.008), 0, 1);
    if (this.forceWet !== undefined) this.wetness = this.forceWet;
    SHARED.uWet.value = this.wetness;
    SHARED.uRain.value = this.rainAmount;

    // güneş: 6'da doğar, 18'de batar
    const t = (this.time - 6) / 12;
    const ang = t * Math.PI;
    const elev = Math.sin(ang);
    this.sunDir.set(Math.cos(ang) * 0.8, Math.max(elev, -0.3), -0.45).normalize();
    const day = clamp((elev + 0.12) / 0.35, 0, 1);
    this.nightFactor = 1 - day;
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    u.rayleigh.value = lerp(1.2, 3.2, this.cloudCover * 0.6) + (1 - day) * 0.5;
    u.turbidity.value = lerp(2.5, 12, this.cloudCover);
    u.mieCoefficient.value = lerp(0.003, 0.012, this.cloudCover);

    const e = this.sunDir.y;
    const cc = this.cloudCover, grey = cc * 0.7;
    const sunCol = keyAt(e, 1, this._c), skyCol = keyAt(e, 2, this._c2), gndCol = keyAt(e, 3, this._c3), fogCol = keyAt(e, 4, this._c4);
    const g = (c, k) => { const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11; c.lerp(this._tmpC || (this._tmpC = new THREE.Color()).setRGB(l, l, l * 1.04), k); return c; };
    g(sunCol, grey); g(skyCol, grey * 0.8); g(fogCol, grey * 0.9);
    this.sun.color.copy(sunCol);
    this.sun.intensity = lerp(0, 2.3, day) * (1 - cc * 0.6);
    this.hemi.color.copy(skyCol); this.hemi.groundColor.copy(gndCol);
    this.hemi.intensity = lerp(0.2, 0.62, day) * (1 - cc * 0.15);
    this.ambient.intensity = lerp(0.3, 0.08, day);
    this.ambient.color.setRGB(0.22, 0.28, 0.5);

    // ay ve yıldızlar
    const fx = focus ? focus.x : 0, fy = focus ? focus.y : 0, fz = focus ? focus.z : 0;
    const md = new THREE.Vector3(-this.sunDir.x, Math.max(0.25, -this.sunDir.y + 0.2), -this.sunDir.z + 0.3).normalize();
    this.moon.position.set(fx + md.x * 2600, fy + md.y * 2600, fz + md.z * 2600);
    this.moonHalo.position.copy(this.moon.position);
    this.moon.material.opacity = this.nightFactor * (1 - cc * 0.7);
    this.moonHalo.material.opacity = this.nightFactor * 0.25 * (1 - cc * 0.5);
    const so = this.nightFactor * this.nightFactor * Math.max(0, 1 - cc * 1.2);
    for (const m of this.starMats) m.opacity = so;
    this.stars.position.set(fx, 0, fz);
    this.sky.position.set(fx, 0, fz);
    this.clouds.position.set(fx, -60, fz);
    if (this.nightFactor > 0.5) { this.hemi.color.lerp(this._c.setRGB(0.32, 0.4, 0.62), 0.6); this.hemi.intensity += 0.08 * (1 - cc); }

    // sis: hava durumuna göre
    this.scene.fog.color.copy(fogCol);
    const far = this.farBase || 1400;
    const clear = this.weather === 'clear' ? 1 : 0;
    this.scene.fog.near = lerp(lerp(180, 80, cc), 25, this.rainAmount);
    this.scene.fog.far = lerp(lerp(far * 1.25, far * 0.75, cc * (1 - clear * 0.5)), 420, this.rainAmount);
    // pozlama: gece hafif aç
    this.renderer.toneMappingExposure = lerp(0.8, 1.2, this.nightFactor);

    // gölge kamerası oyuncuyu takip eder
    if (focus) {
      this.sun.position.set(focus.x + this.sunDir.x * 250, focus.y + Math.max(this.sunDir.y, 0.15) * 250, focus.z + this.sunDir.z * 250);
      this.sun.target.position.set(focus.x, focus.y, focus.z);
    }
    if (this.sunDir.y < 0.02) { this.sun.position.set(fx, 300, fz); this.sun.intensity = 0; }

    // bulutlar
    const cu = this.cloudU;
    cu.uTime.value += dt;
    cu.uCover.value = cc; cu.uDay.value = Math.max(day, 0.04); cu.uRain.value = this.rainAmount;
    cu.uSunDir.value.copy(this.sunDir); cu.uSunCol.value.copy(sunCol); cu.uSkyCol.value.copy(skyCol); cu.uFogCol.value.copy(fogCol);

    // yağmur
    this.rainU.uTime.value += dt;
    this.rainU.uRain.value = this.rainAmount;
    if (focus) this.rainU.uCam.value.set(fx, fy + 2, fz);
    this.rainU.uCol.value.setRGB(0.75 + day * 0.1, 0.75 + day * 0.1, 0.8 + day * 0.1);
    this.rain.visible = this.rainAmount > 0.02;

    // şimşek
    if (this.weather === 'rain' && this.rainAmount > 0.5 && Math.random() < dt * 0.06) this.strike(fx, fz);
    if (this.lightning > 0) {
      this.lightning -= dt;
      const f = Math.max(0, this.lightning) * (Math.random() < 0.7 ? 1 : 0.3);
      this.hemi.intensity += 4 * f; cu.uFlash.value = f * 2;
      this.boltMat.opacity = this.lightning > 0.12 ? 1 : 0;
    } else { cu.uFlash.value = 0; this.boltMat.opacity = 0; }
    SHARED.uLightning.value = Math.max(0, this.lightning);

    // çevre yansıması (araçlar, cam ve ıslak zemin için) - arada bir güncelle
    this.envTimer -= dt;
    if (this.envTimer <= 0) { this.envTimer = 20; this.updateEnvMap(); }
  }

  // Şimşek: rastgele uzak bir noktaya zikzak çizgi + flaş (ses için onLightning kancası)
  strike(fx, fz) {
    this.lightning = 0.35;
    const a = Math.random() * 6.28, d = 500 + Math.random() * 700;
    let x = fx + Math.cos(a) * d, y = 520, z = fz + Math.sin(a) * d;
    const pts = [];
    while (y > 0) { pts.push(new THREE.Vector3(x, y, z)); x += (Math.random() - 0.5) * 40; z += (Math.random() - 0.5) * 40; y -= 20 + Math.random() * 30; }
    pts.push(new THREE.Vector3(x, 0, z));
    this.bolt.geometry.dispose();
    this.bolt.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    this.onLightning && this.onLightning(x, z, d);
  }

  updateEnvMap() {
    const sky2 = this.sky.clone();
    sky2.material = this.sky.material;
    sky2.position.set(0, 0, 0);
    this.skyScene.clear();
    this.skyScene.add(sky2);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.skyScene, 0, 1, 5000);
    this.scene.environment = this.envRT.texture;
  }
}

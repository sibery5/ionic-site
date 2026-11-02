// Gökyüzü, ışık ve hava durumu.
// - Tek çizimlik gökyüzü kubbesi (shaders.js skyDomeMaterial): degrade + güneş/ay + yıldızlar + bulut katmanı + şimşek.
// - Renkler EKRANDA görünmesi gereken değerler olarak (sRGB) yazılır ve ACES ton eşlemesinin tersiyle sahne-doğrusal
//   değere çevrilir (displayToScene). Böylece pozlama değişse de gökyüzü "beyaza kaçmaz"; öğlen koyu mavi tepe ->
//   soluk ufuk, altın saat turuncuları, mavi saat ve lacivert gece elde edilir. Sis rengi = ufuk rengi.
// - Hava durumu: açık / parçalı / kapalı / yağmur / fırtına; parametreler dakikalar süren yumuşak geçişle karışır.
//   Bulut örtüsü güneş şiddetini, gölgeleri, sisi, gök rengini, denizi ve pozlamayı yönetir.
//   API: env.setWeather(ad, anında?), env.weatherType, env.weatherLabel, env.weather (eski: clear|cloudy|rain).
import * as THREE from 'three';
import { cloudNoiseTexture, sampleCloudNoise } from '../core/textures.js';
import { clamp, lerp, RNG } from '../core/util.js';
import { SHARED, SKY, OCEAN, skyDomeMaterial } from './shaders.js';

// Dışa açık hava uniform'ları (diğer modüller/şaderler için): uWet 0..1 ıslaklık, uRain yağış, uLightning flaş
export const WEATHER = SHARED;

export const WEATHER_TYPES = {
  clear: { label: 'Açık', cover: 0.1, rain: 0, wave: 0.12, wind: 0.6, haze: 1.0 },
  partly: { label: 'Parçalı Bulutlu', cover: 0.42, rain: 0, wave: 0.17, wind: 1.0, haze: 0.9 },
  overcast: { label: 'Kapalı', cover: 0.84, rain: 0, wave: 0.25, wind: 1.4, haze: 0.62 },
  rain: { label: 'Yağmurlu', cover: 0.96, rain: 0.7, wave: 0.34, wind: 1.8, haze: 0.42 },
  storm: { label: 'Fırtına', cover: 1.0, rain: 1.0, wave: 0.58, wind: 3.0, haze: 0.3 },
};
const ALIAS = { cloudy: 'overcast', sunny: 'clear', rainy: 'rain', thunder: 'storm', partlycloudy: 'partly' };
const NEXT = {
  clear: [['clear', 0.35], ['partly', 0.65]],
  partly: [['clear', 0.4], ['partly', 0.15], ['overcast', 0.45]],
  overcast: [['partly', 0.4], ['overcast', 0.15], ['rain', 0.45]],
  rain: [['overcast', 0.45], ['rain', 0.3], ['storm', 0.25]],
  storm: [['rain', 0.8], ['overcast', 0.2]],
};

// ---- ACES (three r160) tersi: ekran-doğrusal renk -> sahne-doğrusal parlaklık ----
const M_IN_INV = new THREE.Matrix3().set(0.59719, 0.35458, 0.04823, 0.076, 0.90834, 0.01566, 0.0284, 0.13383, 0.83777).invert();
const M_OUT_INV = new THREE.Matrix3().set(1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602).invert();
function invFit(w) {
  if (w <= 0) return 0;
  w = Math.min(w, 0.99);
  const a = 1 - 0.983729 * w, b = 0.0245786 - 0.432951 * w, c = -(0.000090537 + 0.238081 * w);
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}
const _v3 = new THREE.Vector3();
export function displayToScene(col, exposure, out = col) {
  _v3.set(Math.min(col.r, 0.97), Math.min(col.g, 0.97), Math.min(col.b, 0.97)).applyMatrix3(M_OUT_INV);
  _v3.set(invFit(_v3.x), invFit(_v3.y), invFit(_v3.z)).applyMatrix3(M_IN_INV);
  const k = 0.6 / exposure;
  return out.setRGB(Math.max(0, _v3.x) * k, Math.max(0, _v3.y) * k, Math.max(0, _v3.z) * k);
}

const C = (h) => new THREE.Color(h);
// Açık gök anahtarları (güneş yüksekliği sin e): [e, tepe, ufuk, güneş parıltısı, aydınlık bulut, gölge bulut]
const CLEAR_KEYS = [
  [-0.3, C(0x040914), C(0x16182a), C(0x000000), C(0x24242e), C(0x111218)],
  [-0.14, C(0x08122c), C(0x1e2640), C(0x080510), C(0x2c2c38), C(0x16181f)],
  [-0.06, C(0x142656), C(0x46527a), C(0x341c2a), C(0x56506a), C(0x282836)],
  [0.0, C(0x24427c), C(0xc98a64), C(0x8c3a12), C(0xeea070), C(0x584858)],
  [0.05, C(0x2c56a0), C(0xe2b48c), C(0x7a4218), C(0xffd0a2), C(0x786a72)],
  [0.14, C(0x2b62b6), C(0xb8cee4), C(0x3a2a1a), C(0xfff0e2), C(0x8c8e9a)],
  [0.4, C(0x225dc2), C(0xa2c2e6), C(0x2a2218), C(0xf4f4f2), C(0x9aa0ac)],
  [1.0, C(0x1a54be), C(0x98bce6), C(0x221c14), C(0xf6f6f6), C(0xa0a6b2)],
];
// Kapalı gök anahtarları: [e, tepe, ufuk, aydınlık bulut, gölge bulut] (gece: şehir ışığını yansıtan turuncumsu bulut)
const OVC_KEYS = [
  [-0.3, C(0x0c0b0d), C(0x201b19), C(0x2c2420), C(0x15120f)],
  [-0.06, C(0x272a34), C(0x3a3c44), C(0x48464e), C(0x28292f)],
  [0.0, C(0x474954), C(0x666062), C(0x787070), C(0x44454c)],
  [0.12, C(0x7c828b), C(0x9a9ea5), C(0xb2b6bb), C(0x6c7079)],
  [0.5, C(0x8e949c), C(0xaab0b6), C(0xc6c9cc), C(0x7c8089)],
];
// Güneş ışığı: [e, renk, ışınım]
const SUN_KEYS = [[-0.04, C(0x000000), 0], [0.0, C(0xff5418), 0.25], [0.05, C(0xff8a40), 1.1], [0.12, C(0xffbe80), 2.0], [0.3, C(0xffe6c8), 2.8], [0.6, C(0xfff2e4), 3.1], [1.0, C(0xfff6ee), 3.2]];
// Pozlama: [e, pozlama]
const EXPO_KEYS = [[-0.3, 1.3], [-0.1, 1.15], [-0.03, 0.85], [0.02, 0.74], [0.12, 0.66], [0.4, 0.62], [1, 0.6]];

function keyIdx(keys, e) {
  if (e <= keys[0][0]) return [0, 0, 0];
  for (let k = 0; k < keys.length - 1; k++) if (e <= keys[k + 1][0]) return [k, k + 1, (e - keys[k][0]) / (keys[k + 1][0] - keys[k][0])];
  const n = keys.length - 1; return [n, n, 0];
}
function keyCol(keys, e, i, out) { const [a, b, t] = keyIdx(keys, e); return out.copy(keys[a][i]).lerp(keys[b][i], t); }
function keyNum(keys, e, i) { const [a, b, t] = keyIdx(keys, e); return lerp(keys[a][i], keys[b][i], t); }
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export class Environment {
  constructor(scene, renderer, quality) {
    this.scene = scene;
    this.renderer = renderer;
    this.quality = quality;
    this.time = 9.5; // saat
    this.day = 1;
    this.timeScale = 1 / 60; // gerçek 1 sn = oyun 1 dk
    this.weatherType = 'clear';
    this.weatherTimer = 300;
    const W0 = WEATHER_TYPES.clear;
    this.rainAmount = 0;
    this.cloudCover = W0.cover;
    this.waveAmount = W0.wave;
    this.windK = W0.wind;
    this.haze = W0.haze;
    this.stormK = 0;
    this.wetness = 0;
    this.sunOcc = 1;
    this.exposure = 0.62;
    this.rng = new RNG(4242);

    // gökyüzü kubbesi (kamerayı izler, uzak düzlemde çizilir)
    SKY.tCloud.value = cloudNoiseTexture();
    this.skyMat = skyDomeMaterial();
    const sg = new THREE.SphereGeometry(4000, 48, 24);
    this.sky = new THREE.Mesh(sg, this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.sky.onBeforeRender = (r, s, cam) => { this.sky.position.copy(cam.position); this.sky.updateMatrixWorld(); };
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
    this.ambient = new THREE.AmbientLight(0x404860, 0.1);
    scene.add(this.ambient);
    scene.fog = new THREE.Fog(0x9ab0c8, 200, 2200);

    // yağmur: kameraya bağlı kutu içinde düşen çizgi kartları (tek çizim)
    const r = new RNG(9);
    const N = quality === 'low' ? 3000 : 9000;
    const rg = new THREE.InstancedBufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute([-0.012, 0, 0, 0.012, 0, 0, 0.012, 1, 0, -0.012, 0, 0, 0.012, 1, 0, -0.012, 1, 0], 3));
    const off = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) { off[i * 4] = r.float(-40, 40); off[i * 4 + 1] = r.float(0, 36); off[i * 4 + 2] = r.float(-40, 40); off[i * 4 + 3] = r.float(0.8, 1.2); }
    rg.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
    rg.instanceCount = N;
    this.rainU = { uTime: { value: 0 }, uRain: { value: 0 }, uCam: { value: new THREE.Vector3() }, uCol: { value: new THREE.Color(0.7, 0.75, 0.82) }, uWind: { value: 0.08 } };
    this.rain = new THREE.Mesh(rg, new THREE.ShaderMaterial({
      uniforms: this.rainU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `attribute vec4 aOff; uniform float uTime, uWind; uniform vec3 uCam; varying float vA; varying float vY;
        void main(){
          vec3 p = aOff.xyz; p.y = mod(p.y - uTime * 16.0 * aOff.w, 36.0);
          p.xz = mod(p.xz - uCam.xz + vec2(uTime * 1.5, 0.0) + 40.0, 80.0) - 40.0;
          vec3 w = vec3(uCam.x + p.x, uCam.y - 8.0 + p.y, uCam.z + p.z);
          vec3 toC = normalize(vec3(uCam.x - w.x, 0.0, uCam.z - w.z) + 1e-4);
          vec3 side = vec3(toC.z, 0.0, -toC.x);
          float dst = length(w.xz - uCam.xz);
          w += side * position.x * max(0.4, dst * 0.12) + vec3(uWind, -1.1 - dst * 0.03, uWind * 0.3) * position.y;
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
    this.boltMat.color.setRGB(6, 7, 9);
    this.bolt = new THREE.Line(new THREE.BufferGeometry(), this.boltMat);
    this.bolt.frustumCulled = false;
    scene.add(this.bolt);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envTimer = 0;
    this.skyScene = new THREE.Scene();
    this.skyScene.add(new THREE.Mesh(sg, this.skyMat));
    this.nightFactor = 0;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.moonDir = new THREE.Vector3(0, 1, 0);
    this.lightning = 0;
    this._c = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(() => new THREE.Color());
  }

  get hour() { return Math.floor(this.time); }
  get minute() { return Math.floor((this.time % 1) * 60); }
  // Eski API uyumu (UI 'clear' | 'cloudy' | 'rain' bekler); atama setWeather'a yönlenir
  get weather() { const t = this.weatherType; return t === 'rain' || t === 'storm' ? 'rain' : t === 'overcast' ? 'cloudy' : 'clear'; }
  set weather(v) { this.setWeather(v); }
  get weatherLabel() { return WEATHER_TYPES[this.weatherType].label; }
  get weatherNames() { return Object.keys(WEATHER_TYPES); }

  // Hava durumunu değiştir. instant=false: bulut/yağmur/dalga dakikalar içinde yumuşakça karışır.
  setWeather(name, instant = false) {
    name = ALIAS[name] || name;
    const W = WEATHER_TYPES[name];
    if (!W) return false;
    this.weatherType = name;
    this.weatherTimer = 240 + this.rng.float(0, 420);
    if (instant) {
      this.cloudCover = W.cover; this.rainAmount = W.rain; this.waveAmount = W.wave; this.windK = W.wind; this.haze = W.haze;
      this.stormK = name === 'storm' ? 1 : 0;
      this.envTimer = 0;
    }
    return true;
  }

  update(dt, focus) {
    this.time += dt * this.timeScale;
    if (this.time >= 24) { this.time -= 24; this.day++; this.onNewDay && this.onNewDay(this.day); }

    // ---- hava durumu: Markov geçişi + yumuşak parametre karışımı ----
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      let x = this.rng.next(), pick = this.weatherType;
      for (const [n, p] of NEXT[this.weatherType]) { if ((x -= p) <= 0) { pick = n; break; } }
      this.setWeather(pick);
    }
    const W = WEATHER_TYPES[this.weatherType];
    const kS = 1 - Math.exp(-dt / 45); // ~2-3 dk'da tam geçiş
    this.cloudCover += (W.cover - this.cloudCover) * kS;
    this.waveAmount += (W.wave - this.waveAmount) * kS;
    this.windK += (W.wind - this.windK) * kS;
    this.haze += (W.haze - this.haze) * kS;
    this.stormK += ((this.weatherType === 'storm' ? 1 : 0) - this.stormK) * kS;
    // yağmur ancak bulutlar kalınlaşınca başlar, bulutlar dağılmadan önce diner
    const rainT = W.rain * smooth(0.78, 0.93, this.cloudCover);
    this.rainAmount += (rainT - this.rainAmount) * (1 - Math.exp(-dt / 25));
    if (this.rainAmount < 0.002) this.rainAmount = 0;
    const cc = this.cloudCover, rain = this.rainAmount;
    // ıslaklık: yağmurda hızla artar, sonra yavaşça kurur
    const wetT = rain > 0.12 ? 1 : 0;
    this.wetness = clamp(this.wetness + (wetT > this.wetness ? dt * 0.06 * rain : -dt * 0.008), 0, 1);
    if (this.forceWet !== undefined) this.wetness = this.forceWet;
    SHARED.uWet.value = this.wetness;
    SHARED.uRain.value = rain;

    // ---- güneş / ay ----
    const t = (this.time - 6) / 12;
    const ang = t * Math.PI;
    const elev = Math.sin(ang);
    // İstanbul kuzey yarımkürede: öğlen güneş GÜNEYDE (+z; -z kuzey).
    this.sunDir.set(Math.cos(ang) * 0.8, Math.max(elev, -0.3), 0.45).normalize();
    this.moonDir.set(-this.sunDir.x, Math.max(0.22, -this.sunDir.y + 0.18), -this.sunDir.z + 0.25).normalize();
    const day = clamp((elev + 0.12) / 0.35, 0, 1);
    this.nightFactor = 1 - day;
    const e = this.sunDir.y;

    // ---- pozlama ----
    const ovc = smooth(0.35, 0.95, cc);
    let expo = keyNum(EXPO_KEYS, e, 1) * (1 + 0.32 * ovc * day) * (1 + 0.1 * rain * day);
    this.exposure = expo;
    this.renderer.toneMappingExposure = expo;

    // ---- gökyüzü renkleri (ekran değerleri -> sahne) ----
    const [cZ, cH, cG, cL, cS, cT, cU, cV, cX] = this._c;
    keyCol(CLEAR_KEYS, e, 1, cZ); keyCol(CLEAR_KEYS, e, 2, cH); keyCol(CLEAR_KEYS, e, 3, cG); keyCol(CLEAR_KEYS, e, 4, cL); keyCol(CLEAR_KEYS, e, 5, cS);
    cZ.lerp(keyCol(OVC_KEYS, e, 1, cT), ovc); cH.lerp(keyCol(OVC_KEYS, e, 2, cT), ovc);
    cL.lerp(keyCol(OVC_KEYS, e, 3, cT), ovc); cS.lerp(keyCol(OVC_KEYS, e, 4, cT), ovc);
    // parçalı bulutta tepe biraz soluklaşır; yağmur/fırtına her şeyi koyulaştırır
    cZ.lerp(cH, cc * 0.25 * (1 - ovc));
    const dark = 1 - rain * 0.32 - this.stormK * 0.2;
    cZ.multiplyScalar(dark); cH.multiplyScalar(dark); cL.multiplyScalar(dark); cS.multiplyScalar(dark * 0.92);
    cG.multiplyScalar(1 - ovc * 0.85);
    const U = SKY;
    displayToScene(cZ, expo, U.uZenith.value);
    displayToScene(cH, expo, U.uHorizon.value);
    displayToScene(cL, expo, U.uCloudLit.value);
    displayToScene(cS, expo, U.uCloudShade.value);
    displayToScene(cG, expo, U.uSunGlow.value);
    U.uGroundSky.value.copy(U.uHorizon.value).multiplyScalar(0.55);
    U.uSunDir.value.copy(this.sunDir); U.uMoonDir.value.copy(this.moonDir);
    U.uCover.value = cc; U.uCloudDark.value = clamp(rain + this.stormK * 0.5, 0, 1);
    U.uStars.value = Math.pow(this.nightFactor, 2) * (1 - smooth(0.25, 0.75, cc)) * (0.6 / expo + 0.4);
    U.uMoonK.value = smooth(0.25, 0.85, this.nightFactor) * (1 - smooth(0.6, 0.95, cc));
    // ay evresi (29.53 günlük döngü; oyun 1. gün ≈ büyüyen şişkin ay) ve aydınlanan oran → ay ışığı şiddeti
    U.uMoonPhase.value = (((this.day + this.time / 24 + 10) % 29.53) + 29.53) % 29.53 / 29.53;
    this.moonFrac = 0.5 - 0.5 * Math.cos(U.uMoonPhase.value * Math.PI * 2);
    displayToScene(cT.set(0xe8e4d8), expo, U.uMoonCol.value);
    U.uSkyTime.value += dt;
    U.uWind.value.x += dt * 0.0011 * this.windK; U.uWind.value.y += dt * 0.0004 * this.windK;

    // ---- güneş ışığı (bulut örtüsü + güneşin önünden geçen bulut) ----
    const sunCol = keyCol(SUN_KEYS, e, 1, cU), sunI = keyNum(SUN_KEYS, e, 2);
    // güneş yönündeki bulut yoğunluğu (gökyüzü şaderiyle aynı izdüşüm, CPU örneklemesi)
    if (e > -0.05) {
      const px = this.sunDir.x / (e + 0.1), pz = this.sunDir.z / (e + 0.1);
      const qx = px * 0.085 + U.uWind.value.x, qz = pz * 0.085 + U.uWind.value.y;
      const n = sampleCloudNoise(qx, qz, 0) * 0.78 + sampleCloudNoise(qx * 3.1 + U.uWind.value.x * 0.7 + 0.37, qz * 3.1 + U.uWind.value.y * 0.7 + 0.37, 1) * 0.22;
      const thr = lerp(0.8, 0.24, cc), dens = Math.max(smooth(thr, thr + 0.15 + cc * 0.2, n), smooth(0.62, 1, cc) * 0.85);
      const occ = 1 - 0.8 * dens;
      this.sunOcc += (occ - this.sunOcc) * (1 - Math.exp(-dt * 1.5));
    }
    const sunVis = this.sunOcc * (1 - 0.88 * ovc) * (1 - rain * 0.5);
    displayToScene(cX.copy(sunCol).multiplyScalar(0.97), expo, U.uSunDisc.value).multiplyScalar(e > -0.02 ? 9 * this.sunOcc * (1 - ovc) : 0);
    this.sun.color.copy(sunCol);
    this.sun.intensity = sunI * sunVis;

    // ---- gök ışığı (yarıküre) + ortam ----
    const skyAvg = cV.copy(U.uZenith.value).lerp(U.uHorizon.value, 0.45);
    this.hemi.color.copy(skyAvg);
    const sL = Math.max(1e-4, skyAvg.r * 0.2126 + skyAvg.g * 0.7152 + skyAvg.b * 0.0722);
    // gök ışığı ışınımı ~ pi * ortalama gök parıltısı; çok parlak/karanlık uçlarda kısıtla
    this.hemi.color.multiplyScalar(1 / sL).lerp(cT.setRGB(1, 1, 1), 0.55);
    this.hemi.intensity = clamp(Math.PI * sL * 0.9, 0.0, 1.6) + 0.12 * day * ovc;
    this.hemi.groundColor.copy(sunCol).multiplyScalar(0.25 * sunVis * Math.max(e, 0)).add(cT.setRGB(0.09, 0.08, 0.07).multiplyScalar(0.3 + day));
    // gece: ay ışığı + şehir ışık kirliliği (turuncumsu taban)
    const n = this.nightFactor;
    this.ambient.color.setRGB(lerp(0.32, 0.5, ovc), lerp(0.34, 0.4, ovc), lerp(0.5, 0.36, ovc));
    this.ambient.intensity = n * 0.16 + 0.02;
    // gece tabanı: mavi ay ışığı gök ışığı + aşağıdan turuncu şehir ışığı (aydınlık pencereler/sokak ışığı
    // bulutlardan ve cephelerden seken ışık). Böylece gece "kapkara" değil, okunur ve sinematik olur.
    if (n > 0) {
      const nk = smooth(0.1, 0.75, n);
      const floorI = nk * (1.6 + 0.3 * ovc);
      if (this.hemi.intensity < floorI) {
        const k = 1 - this.hemi.intensity / Math.max(floorI, 1e-4);
        this.hemi.color.lerp(cT.setRGB(0.52, 0.64, 1.0), k * 0.85);
        this.hemi.intensity = floorI;
      }
      this.hemi.groundColor.lerp(cT.setRGB(0.55, 0.36, 0.2), nk * 0.75);
    }

    // ---- ay ışığı: güneş battıktan sonra yönlü ışık aya döner (gölgeler korunur) ----
    const fx = focus ? focus.x : 0, fy = focus ? focus.y : 0, fz = focus ? focus.z : 0;
    const moonOn = e < -0.06;
    const ld = moonOn ? this.moonDir : this.sunDir;
    if (moonOn) {
      this.sun.color.setRGB(0.55, 0.66, 1.0);
      this.sun.intensity = 0.42 * smooth(-0.06, -0.16, e) * (1 - 0.8 * ovc) * (0.3 + 0.7 * (this.moonFrac === undefined ? 1 : this.moonFrac));
    }
    if (focus) this.placeShadowCamera(ld, fx, fy, fz);
    if (!moonOn && e < 0.0) this.sun.intensity = 0;

    // ---- sis: ufuk rengine eşit (her şeyi beyazlatmaz), yoğunluk havaya göre ----
    const far = this.farBase || 1400;
    const hz = this.haze;
    this.scene.fog.color.copy(U.uHorizon.value).multiplyScalar(0.92);
    this.scene.fog.near = lerp(lerp(30, 140, hz), 18, rain * 0.6);
    this.scene.fog.far = Math.max(260, far * lerp(0.42, 2.3, hz * hz) * (1 - rain * 0.25));

    // ---- deniz uniform'ları ----
    OCEAN.uWave.value = this.waveAmount;
    OCEAN.uSunCol.value.copy(sunCol).multiplyScalar(this.sun.intensity * (moonOn ? 0 : 1));
    const wl = sunI * sunVis * Math.max(e, 0) * 0.25;
    const sa = skyAvg.r * 0.3 + skyAvg.g * 0.59 + skyAvg.b * 0.11;
    OCEAN.uWaterLight.value.copy(skyAvg).lerp(cT.setRGB(sa, sa, sa), 0.55).multiplyScalar(1.6);
    OCEAN.uWaterLight.value.r += sunCol.r * wl; OCEAN.uWaterLight.value.g += sunCol.g * wl; OCEAN.uWaterLight.value.b += sunCol.b * wl;
    OCEAN.uWaterLight.value.r += n * 0.012; OCEAN.uWaterLight.value.g += n * 0.014; OCEAN.uWaterLight.value.b += n * 0.02;
    OCEAN.uMoonLight.value = U.uMoonK.value * (1 - ovc);
    displayToScene(cT.setRGB(0.085, 0.09, 0.1).multiplyScalar(day * (1 - rain * 0.4)), expo, OCEAN.uCityDay.value);

    // ---- yağmur ----
    this.rainU.uTime.value += dt;
    this.rainU.uRain.value = rain;
    this.rainU.uWind.value = 0.05 + this.windK * 0.08;
    if (focus) this.rainU.uCam.value.set(fx, fy + 2, fz);
    this.rainU.uCol.value.copy(U.uHorizon.value).multiplyScalar(1.1).addScalar(0.02);
    this.rain.visible = rain > 0.02;

    // ---- şimşek ----
    const stormy = Math.max(this.stormK, rain > 0.5 ? 0.25 : 0);
    if (stormy > 0.05 && Math.random() < dt * 0.09 * stormy) this.strike(fx, fz);
    if (this.lightning > 0) {
      this.lightning -= dt;
      const f = Math.max(0, this.lightning) * (Math.random() < 0.7 ? 1 : 0.3);
      this.hemi.intensity += 3 * f; U.uFlash.value = f * 2.5;
      this.boltMat.opacity = this.lightning > 0.12 ? 1 : 0;
    } else { U.uFlash.value = 0; this.boltMat.opacity = 0; }
    SHARED.uLightning.value = Math.max(0, this.lightning);

    // ---- çevre yansıması (PMREM): yükseklik/bulut değişince ya da 20 sn'de bir ----
    this.envTimer -= dt;
    if (this._envElev === undefined || Math.abs(e - this._envElev) > 0.03 || Math.abs(cc - this._envCover) > 0.06 || Math.abs(rain - this._envRain) > 0.15) this.envTimer = 0;
    if (this.envTimer <= 0) { this.envTimer = 20; this._envElev = e; this._envCover = cc; this._envRain = rain; this.updateEnvMap(); }
  }

  // Gölge kamerası yerleşimi (yolda "kayan/titreyen gölge" hatasının düzeltmesi):
  //  1) Işık yönü ~0.08° adımlarla güncellenir (güneş her karede biraz döndüğünde tüm gölge kenarları
  //     yeniden rasterleşip yüzüyordu).
  //  2) Odak noktası ışık uzayında gölge texel ızgarasına kilitlenir: oyuncu/kamera hareket edince harita
  //     tam texel kadar kayar, statik gölgelerin kenarları piksel piksel aynı kalır (texel snapping).
  placeShadowCamera(ld, fx, fy, fz) {
    if (this.noSnap) { // eski davranış (teşhis testi için): kayan gölge kamerası
      this.sun.position.set(fx + ld.x * 250, fy + Math.max(ld.y, 0.15) * 250, fz + ld.z * 250);
      this.sun.target.position.set(fx, fy, fz); this.snapShadow = false; return;
    }
    const q = this._sq || (this._sq = { dir: new THREE.Vector3(0, 1, 0), r: new THREE.Vector3(), u: new THREE.Vector3(), f: new THREE.Vector3(), p: new THREE.Vector3() });
    const dx = ld.x, dy = Math.max(ld.y, 0.15), dz = ld.z;
    const L = Math.hypot(dx, dy, dz);
    _v3.set(dx / L, dy / L, dz / L);
    if (q.dir.angleTo(_v3) > 0.0014) q.dir.copy(_v3);
    const d = q.dir;
    // DirectionalLightShadow: kamera ışık konumundan hedefe bakar, up = +Y → eksenler: z = d, x = up×z, y = z×x
    q.r.set(d.z, 0, -d.x).normalize(); // (0,1,0) × d
    q.u.crossVectors(d, q.r);
    const sc = this.sun.shadow.camera;
    const texel = (sc.right - sc.left) / this.sun.shadow.mapSize.x;
    q.f.set(fx, fy, fz);
    const a = Math.round(q.f.dot(q.r) / texel) * texel, b = Math.round(q.f.dot(q.u) / texel) * texel, c = q.f.dot(d);
    q.p.copy(q.r).multiplyScalar(a).addScaledVector(q.u, b).addScaledVector(d, c);
    this.sun.target.position.copy(q.p);
    this.sun.position.copy(q.p).addScaledVector(d, 250);
    this.snapShadow = true;
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
    SKY.uEnvPass.value = 1;
    const old = this.envRT;
    this.envRT = this.pmrem.fromScene(this.skyScene, 0, 1, 5000);
    SKY.uEnvPass.value = 0;
    this.scene.environment = this.envRT.texture;
    if (old) old.dispose();
  }
}

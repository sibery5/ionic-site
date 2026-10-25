// Gökyüzü, güneş, ay, yıldızlar, bulutlar, gün/gece döngüsü ve hava durumu (yağmur).
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { cloudTexture } from '../core/textures.js';
import { clamp, lerp } from '../core/util.js';

export class Environment {
  constructor(scene, renderer, quality) {
    this.scene = scene;
    this.renderer = renderer;
    this.time = 9.5; // saat
    this.day = 1;
    this.timeScale = 1 / 60; // gerçek 1 sn = oyun 1 dk
    this.weather = 'clear';
    this.weatherTimer = 300;
    this.rainAmount = 0;
    this.cloudCover = 0.2;

    this.sky = new Sky();
    this.sky.scale.setScalar(4500);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 6; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.85;
    scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = quality !== 'low';
    const sm = quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 500;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun); scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbcd4ff, 0x6a5a48, 0.9);
    scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0x404860, 0.2);
    scene.add(this.ambient);

    scene.fog = new THREE.Fog(0xc8d4e0, 120, 900);

    // yıldızlar
    const sg = new THREE.BufferGeometry();
    const sp = [];
    for (let i = 0; i < 1500; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.95);
      sp.push(Math.sin(ph) * Math.cos(th) * 3000, Math.cos(ph) * 3000, Math.sin(ph) * Math.sin(th) * 3000);
    }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 3, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat);
    scene.add(this.stars);

    // ay
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(60, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf4f1e0, fog: false, transparent: true, opacity: 0 }));
    scene.add(this.moon);

    // bulutlar
    this.clouds = new THREE.Group();
    const ct = cloudTexture();
    this.cloudMat = new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false, fog: false, opacity: 0.85, side: THREE.DoubleSide });
    for (let i = 0; i < 60; i++) {
      const s = 150 + Math.random() * 250;
      const c = new THREE.Mesh(new THREE.PlaneGeometry(s, s * 0.6), this.cloudMat);
      c.rotation.x = -Math.PI / 2;
      c.position.set((Math.random() - 0.5) * 3000, 320 + Math.random() * 120, (Math.random() - 0.5) * 3000);
      c.rotation.z = Math.random() * Math.PI;
      this.clouds.add(c);
    }
    scene.add(this.clouds);

    // yağmur
    const rg = new THREE.BufferGeometry();
    this.rainCount = 4000;
    const rp = new Float32Array(this.rainCount * 6);
    for (let i = 0; i < this.rainCount; i++) {
      const x = (Math.random() - 0.5) * 80, y = Math.random() * 40, z = (Math.random() - 0.5) * 80;
      rp.set([x, y, z, x + 0.05, y - 0.7, z], i * 6);
    }
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaabbcc, transparent: true, opacity: 0 }));
    this.rain.frustumCulled = false;
    scene.add(this.rain);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envTimer = 0;
    this.skyScene = new THREE.Scene();
    this.nightFactor = 0;
    this.sunDir = new THREE.Vector3();
    this.lightning = 0;
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
    this.rainAmount = lerp(this.rainAmount, targetRain, dt * 0.1);
    this.cloudCover = lerp(this.cloudCover, targetCloud, dt * 0.1);

    // güneş konumu: 6'da doğar, 18'de batar
    const t = (this.time - 6) / 12; // 0..1 gündüz
    const ang = t * Math.PI;
    const elev = Math.sin(ang);
    this.sunDir.set(Math.cos(ang) * 0.8, Math.max(elev, -0.3), -0.45).normalize();
    const day = clamp((elev + 0.12) / 0.35, 0, 1);
    this.nightFactor = 1 - day;
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    u.rayleigh.value = lerp(1.6, 3.5, this.cloudCover * 0.6);
    u.turbidity.value = lerp(3, 12, this.cloudCover);

    const golden = clamp(1 - Math.abs(elev) / 0.35, 0, 1) * day;
    const sunColor = new THREE.Color(1, 0.97, 0.9).lerp(new THREE.Color(1, 0.55, 0.3), golden);
    this.sun.color.copy(sunColor);
    this.sun.intensity = lerp(0, 2.6, day) * (1 - this.cloudCover * 0.55);
    this.hemi.intensity = lerp(0.12, 0.9, day) * (1 - this.cloudCover * 0.25);
    this.hemi.color.setRGB(lerp(0.25, 0.74, day), lerp(0.3, 0.83, day), lerp(0.5, 1, day));
    this.ambient.intensity = lerp(0.35, 0.15, day);
    this.ambient.color.setRGB(0.25, 0.3, 0.5);

    // ay ve yıldızlar
    const fx = focus ? focus.x : 0, fz = focus ? focus.z : 0;
    this.moon.position.set(fx - this.sunDir.x * 2500, Math.max(200, -this.sunDir.y * 2500 + 400), fz - this.sunDir.z * 2500);
    this.moon.material.opacity = this.nightFactor;
    this.starMat.opacity = this.nightFactor * (1 - this.cloudCover * 0.8);
    this.stars.position.set(fx, 0, fz);
    this.sky.position.set(fx, 0, fz);

    // sis rengi
    const fogDay = new THREE.Color(0xc9d6e2).lerp(new THREE.Color(0xe0a878), golden * 0.6).lerp(new THREE.Color(0x8a9098), this.cloudCover * 0.6);
    const fogNight = new THREE.Color(0x0c1220);
    this.scene.fog.color.copy(fogNight).lerp(fogDay, day);
    this.scene.fog.near = lerp(60, 220, 1 - this.rainAmount);
    this.scene.fog.far = lerp(350, this.farBase || 1500, 1 - this.rainAmount * 0.8);
    if (this.scene.background === null || this.scene.background === undefined) { /* gökyüzü küresi */ }

    // gölge kamerası oyuncuyu takip eder
    if (focus) {
      this.sun.position.set(focus.x + this.sunDir.x * 200, focus.y + Math.max(this.sunDir.y, 0.15) * 200, focus.z + this.sunDir.z * 200);
      this.sun.target.position.set(focus.x, focus.y, focus.z);
    }
    if (this.sunDir.y < 0.02) { this.sun.position.set(focus ? focus.x : 0, 300, focus ? focus.z : 0); this.sun.intensity = 0; }

    // bulutlar
    const cl = this.cloudCover;
    this.cloudMat.opacity = 0.3 + cl * 0.6;
    this.cloudMat.color.setRGB(lerp(0.1, 1, day) * (1 - cl * 0.3), lerp(0.1, 1, day) * (1 - cl * 0.3), lerp(0.15, 1, day) * (1 - cl * 0.25));
    for (const c of this.clouds.children) {
      c.position.x += dt * 4;
      if (c.position.x > fx + 1600) c.position.x -= 3200;
      if (c.position.z > fz + 1600) c.position.z -= 3200;
      if (c.position.z < fz - 1600) c.position.z += 3200;
      if (c.position.x < fx - 1600) c.position.x += 3200;
    }

    // yağmur
    this.rain.material.opacity = this.rainAmount * 0.5;
    this.rain.visible = this.rainAmount > 0.02;
    if (this.rain.visible && focus) {
      this.rain.position.set(focus.x, focus.y - 5 - ((performance.now() * 0.03) % 20), focus.z);
    }
    // şimşek
    if (this.weather === 'rain' && Math.random() < dt * 0.05) this.lightning = 0.3;
    if (this.lightning > 0) { this.lightning -= dt; this.hemi.intensity += 3 * Math.max(0, this.lightning); }

    // çevre yansıması (araçlar ve su için) - arada bir güncelle
    this.envTimer -= dt;
    if (this.envTimer <= 0) {
      this.envTimer = 20;
      this.updateEnvMap();
    }
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
    this.scene.environmentIntensity = lerp(0.05, 0.6, 1 - this.nightFactor);
  }
}

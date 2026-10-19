import * as THREE from 'three';
import type { LevelDef } from '../game/levels';
import type { BuiltLevel } from './LevelBuilder';
import { Rng } from '../core/rng';
import { mat } from './models';
import { skyTexture } from './textures';

// Mekânın ışıkları ve dış dünyası (teras için Haliç silüeti). Görüntü kalitesine göre gölgeler ayarlanır.

export type Quality = 'low' | 'medium' | 'high';

export interface Lights {
  flashlight: THREE.SpotLight | null;
}

let glowTex: THREE.Texture | null = null;
/** Yere düşen yumuşak ışık halkası (ışık hesabı yok, tek saydam düzlem). */
function glowDisc(at: THREE.Vector3, radius: number, color: number, strength: number) {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    glowTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, opacity: strength, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(at.x, 0.02, at.z);
  return m;
}

function shadowSun(sun: THREE.DirectionalLight, size: number, quality: Quality) {
  if (quality === 'low') return;
  sun.castShadow = true;
  const res = quality === 'high' ? 2048 : 1024;
  sun.shadow.mapSize.set(res, res);
  const c = sun.shadow.camera;
  c.left = -size * 0.75;
  c.right = size * 0.75;
  c.top = size * 0.75;
  c.bottom = -size * 0.75;
  c.near = 0.5;
  c.far = 80;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
}

export function setupLights(scene: THREE.Scene, built: BuiltLevel, def: LevelDef, dark: boolean, quality: Quality): Lights {
  const { w, d } = built.size;
  if (def.theme === 'teras') {
    scene.background = skyTexture();
    scene.fog = new THREE.Fog(0xf2d7a8, 30, 140);
    scene.add(new THREE.HemisphereLight(0xbfd8f0, 0xb79a7a, 1.1));
    const sun = new THREE.DirectionalLight(0xffd29a, 2.4);
    sun.position.set(w * 0.5 - 18, 14, d * 0.5 - 10);
    sun.target.position.set(w / 2, 0, d / 2);
    shadowSun(sun, Math.max(w, d), quality);
    scene.add(sun, sun.target);
    buildSkyline(scene, built);
    return { flashlight: null };
  }
  scene.background = new THREE.Color(dark ? 0x05070a : 0x2a2018);
  if (dark) {
    scene.fog = new THREE.Fog(0x05070a, 4, 16);
    scene.add(new THREE.HemisphereLight(0x3a4a6a, 0x1a140c, 0.28));
    for (const b of built.bulbs) (b.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
    const fl = new THREE.SpotLight(0xfff0d0, 70, 16, 0.62, 0.5, 1.2);
    if (quality !== 'low') {
      fl.castShadow = true;
      fl.shadow.mapSize.set(1024, 1024);
    }
    scene.add(fl, fl.target);
    // acil durum ışıkları masaların yanında, ocakta ateş
    // yüksek kalitede gerçek ışık; orta ve düşükte yere düşen sahte bir ışık halkası (her ışık her pikselin maliyetini artırır)
    for (const desk of built.desks.values()) {
      const pl = new THREE.PointLight(0xff6a3a, 2.2, 4.5, 1.5);
      pl.position.copy(desk.center).setY(2.4);
      if (quality === 'high') scene.add(pl);
      else scene.add(glowDisc(desk.center, 2.6, 0xff6a3a, 0.5));
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 0.08), mat(0xff6a3a, { emissive: 0xff4a1a }));
      lamp.position.copy(pl.position);
      scene.add(lamp);
    }
    for (const o of built.ocak) {
      const pl = new THREE.PointLight(0xffb060, 3, 5, 1.5);
      pl.position.copy(o).setY(2.4);
      scene.add(pl);
    }
    return { flashlight: fl };
  }
  if (def.theme === 'bodrum') {
    // bodrum: nemli, loş, yeşilimsi; ocağın sıcak ışığı tek gerçek ışık kaynağı
    scene.background = new THREE.Color(0x14120f);
    scene.fog = new THREE.Fog(0x1a1a16, 7, 24);
    scene.add(new THREE.HemisphereLight(0xb8c8b0, 0x2a2018, 0.62));
    scene.add(new THREE.AmbientLight(0xc8d8c0, 0.14));
    const sun = new THREE.DirectionalLight(0xcfe0c8, 0.85);
    sun.position.set(w * 0.4, 9, -3);
    sun.target.position.set(w / 2, 0, d / 2);
    shadowSun(sun, Math.max(w, d), quality);
    scene.add(sun, sun.target);
    for (const o of built.ocak) {
      const pl = new THREE.PointLight(0xffa050, 3.2, 6, 1.5);
      pl.position.copy(o).setY(2.2);
      scene.add(pl);
    }
    if (quality !== 'high') for (const desk of built.desks.values()) scene.add(glowDisc(desk.center, 2.2, 0xffd890, 0.22));
    return { flashlight: null };
  }
  scene.fog = new THREE.Fog(0x3a2a1a, 15, 36);
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x6b4a33, 1.0));
  scene.add(new THREE.AmbientLight(0xffe8c8, 0.25));
  const sun = new THREE.DirectionalLight(0xffe2b0, 1.6);
  sun.position.set(w * 0.35, 9, -4);
  sun.target.position.set(w / 2, 0, d / 2);
  shadowSun(sun, Math.max(w, d), quality);
  scene.add(sun, sun.target);
  return { flashlight: null };
}

/** Teras: Haliç, Galata Kulesi, cami ve bir vapur. */
function buildSkyline(scene: THREE.Scene, built: BuiltLevel) {
  const { w, d } = built.size;
  const cx = w / 2;
  const cz = d / 2;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x3f6f8f, roughness: 0.2, metalness: 0.3 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(cx, -14, cz);
  scene.add(water);
  const rng = new Rng(1923);
  const houseCols = [0xe8d6b8, 0xd9b48f, 0xc98f6b, 0xe6e0d0, 0xb5543a, 0xd8cbb3];
  for (let i = 0; i < 140; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(22, 70);
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    if (Math.sin(a) > 0.55 && r > 30) continue; // Haliç'e boşluk
    const h = rng.range(6, 16);
    const b = new THREE.Mesh(new THREE.BoxGeometry(rng.range(4, 9), h, rng.range(4, 9)), mat(rng.pick(houseCols)));
    b.position.set(x, -14 + h / 2, z);
    b.rotation.y = rng.range(0, Math.PI);
    scene.add(b);
    if (rng.next() < 0.5) {
      const roof = new THREE.Mesh(new THREE.ConeGeometry(4, 2, 4), mat(0xa0442a));
      roof.position.set(x, -14 + h + 1, z);
      roof.rotation.y = Math.PI / 4 + b.rotation.y;
      scene.add(roof);
    }
    // pencereler
    if (rng.next() < 0.6) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.4), mat(0x2f3b4a));
      win.position.set(x, -14 + h * 0.6, z);
      win.lookAt(cx, -14 + h * 0.6, cz);
      win.translateZ(2.6);
      scene.add(win);
    }
  }
  const tower = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 38, 16), mat(0xcdbfa6));
  body.position.y = 19;
  tower.add(body);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(4, 9, 16), mat(0x3f5a6a, { metal: 0.4, rough: 0.5 }));
  cap.position.y = 42.5;
  tower.add(cap);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 4.1, 2, 16), mat(0xb8a98f));
  ring.position.y = 37;
  tower.add(ring);
  for (let i = 0; i < 12; i++) {
    const wnd = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.2, 0.3), mat(0x2f3b4a));
    const a = (i / 12) * Math.PI * 2;
    wnd.position.set(Math.cos(a) * 3.3, 33, Math.sin(a) * 3.3);
    wnd.rotation.y = -a;
    tower.add(wnd);
  }
  tower.position.set(cx + 26, -14, cz - 30);
  scene.add(tower);
  const mosque = new THREE.Group();
  const mb = new THREE.Mesh(new THREE.BoxGeometry(22, 12, 22), mat(0xe2dccd));
  mb.position.y = 6;
  mosque.add(mb);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x8a9aa6, { metal: 0.3, rough: 0.5 }));
  dome.position.y = 12;
  mosque.add(dome);
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 36, 10), mat(0xe2dccd));
    m.position.set(sx * 15, 18, 0);
    mosque.add(m);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(1.2, 6, 10), mat(0x8a9aa6));
    tip.position.set(sx * 15, 39, 0);
    mosque.add(tip);
    for (let k = 0; k < 2; k++) {
      const half = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x8a9aa6, { metal: 0.3, rough: 0.5 }));
      half.position.set(sx * 8, 12, (k - 0.5) * 12);
      mosque.add(half);
    }
  }
  mosque.position.set(cx - 10, -14, cz + 95);
  scene.add(mosque);
  // vapur
  const ferry = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(18, 2.4, 5), mat(0xf4f1ea));
  hull.position.y = 1.2;
  ferry.add(hull);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(18.1, 0.5, 5.1), mat(0x1e2a3a));
  stripe.position.y = 0.4;
  ferry.add(stripe);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(12, 2, 4.4), mat(0xe8e2d0));
  deck.position.y = 3.4;
  ferry.add(deck);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 3, 10), mat(0xf2c230));
  funnel.position.set(0, 5.5, 0);
  ferry.add(funnel);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.7, 10), mat(0x1a1a1a));
  top.position.set(0, 7.2, 0);
  ferry.add(top);
  ferry.position.set(cx + 8, -14, cz + 55);
  ferry.rotation.y = 0.25;
  ferry.name = 'ferry';
  scene.add(ferry);
}

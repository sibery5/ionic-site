// İç mekânlar: şehirdeki her kapı bir iç mekâna açılır. Tipine göre prosedürel olarak döşenir.
import * as THREE from 'three';
import { Colliders } from '../world/physics.js';
import { carpetTexture, woodTexture, tileTexture, wallpaperTexture, marbleTexture, iznikTexture, signTexture, makeCanvas } from '../core/textures.js';
import { RNG, formatMoney } from '../core/util.js';
import { randomLook } from '../entities/character.js';
import { buildWeaponModel } from './weapons.js';
import { buildCarModel } from '../entities/vehicles.js';
import { GANGS } from './economy.js';

const NAMES = {
  apartment: 'Apartman Dairesi', safehouse: 'Güvenli Ev', konak: 'Reis Konağı', gun: 'Silahçı', clothes: 'Butik', food: 'Bakkal', trade: 'Karaborsa',
  dealer: 'Oto Galeri', bank: 'Banka', hospital: 'Hastane', police: 'Emniyet Müdürlüğü', estate: 'Emlakçı', cafe: 'Çay Ocağı', club: 'Gece Kulübü',
  warehouse: 'Liman Deposu', rival: 'Köşk', garage: 'Oto Tamirci', mosque: 'Cami', mosque_small: 'Mahalle Camii', bazaar: 'Kapalıçarşı', tower: 'Galata Kulesi',
  palace: 'Dolmabahçe Sarayı', station: 'Haydarpaşa Garı',
  armory: 'Cephanelik', // [hikâye] askeri kışla
};
export function placeName(type, b) { return (b && b.name) || NAMES[type] || 'Bina'; }

export class Interiors {
  constructor(game) {
    this.game = game;
    this.current = null;
  }

  enter(door) {
    const g = this.game;
    const b = door.building;
    const type = b.type;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    const cols = new Colliders();
    const ctx = {
      type, building: b, scene, cols, interact: [], door, rng: new RNG(typeof b.id === 'number' ? b.id * 7919 + 13 : hashStr(String(b.id))),
      npcGroup: new THREE.Group(), pickupGroup: new THREE.Group(), name: placeName(type, b), peaceful: false,
    };
    scene.add(ctx.npcGroup); scene.add(ctx.pickupGroup);
    this.current = ctx;
    // şehir NPC'lerini dondur
    g.npcs.stash(ctx.npcGroup);
    g.pickups.group = ctx.pickupGroup;
    const builder = BUILDERS[type] || BUILDERS.apartment;
    const spawn = builder.call(this, ctx) || { x: 0, z: ctx.d / 2 - 1.6 };
    g.physics.setInterior(cols);
    g.setActiveScene(scene);
    const p = g.player;
    p.pos.set(spawn.x, 0, spawn.z);
    p.heading = Math.PI; p.camYaw = Math.PI; p.camPitch = 0.2;
    p.inInterior = ctx;
    p.camInit = false;
    for (const n of g.npcs.list) n.inInterior = ctx;
    scene.add(p.model.root);
    g.ui.locationBanner(ctx.name);
    g.missions.onEnter(ctx);
    return ctx;
  }

  exit() {
    const g = this.game;
    const ctx = this.current;
    if (!ctx) return;
    // iç mekân eşyalarını temizle
    for (const pk of g.pickups.list.slice()) if (pk.mesh.parent === ctx.pickupGroup) g.pickups.remove(pk);
    g.pickups.group = g.pickups.cityGroup;
    g.npcs.unstash();
    g.physics.setInterior(null);
    g.setActiveScene(g.scene);
    const p = g.player;
    const d = ctx.door;
    const nz = d.building.door ? d.building.door.nz : 1;
    p.pos.set(d.x, 0, d.z + nz * 0.6);
    p.heading = nz > 0 ? 0 : Math.PI;
    p.camYaw = p.heading;
    p.inInterior = null;
    p.camInit = false;
    g.scene.add(p.model.root);
    this.current = null;
    g.missions.onExit(ctx);
    ctx.scene.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
  }

  // ---------- yapı yardımcıları ----------
  room(ctx, w, d, h, floorMat, wallMat, ceilColor = 0xeeeeee) {
    ctx.w = w; ctx.d = d; ctx.h = h;
    const s = ctx.scene;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: ceilColor, roughness: 0.9 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = h; s.add(ceil);
    const t = 0.3;
    for (const [ww, dd, x, z] of [[w + t * 2, t, 0, -d / 2 - t / 2], [w + t * 2, t, 0, d / 2 + t / 2], [t, d, -w / 2 - t / 2, 0], [t, d, w / 2 + t / 2, 0]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ww, h, dd), wallMat);
      m.position.set(x, h / 2, z); s.add(m);
      ctx.cols.add(x - ww / 2, z - dd / 2, x + ww / 2, z + dd / 2, 0, h, 'wall');
    }
    // süpürgelik
    const base = new THREE.MeshStandardMaterial({ color: 0x3a2412 });
    for (const [ww, dd, x, z] of [[w, 0.04, 0, -d / 2 + 0.02], [w, 0.04, 0, d / 2 - 0.02], [0.04, d, -w / 2 + 0.02, 0], [0.04, d, w / 2 - 0.02, 0]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ww, 0.12, dd), base); m.position.set(x, 0.06, z); s.add(m);
    }
    s.add(new THREE.HemisphereLight(0xfff4e0, 0x403020, 0.7));
    // çıkış kapısı
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.3, 0.08), new THREE.MeshStandardMaterial({ color: 0x4a2c1a }));
    door.position.set(0, 1.15, d / 2 - 0.05); s.add(door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9 }));
    knob.position.set(0.5, 1.05, d / 2 - 0.12); s.add(knob);
    ctx.interact.push({ x: 0, z: d / 2 - 0.6, r: 1.3, label: 'Dışarı çık', action: () => this.exit() });
  }
  box(ctx, w, h, d, x, y, z, mat, collide = true, rotY = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z); m.rotation.y = rotY;
    m.castShadow = true; m.receiveShadow = true;
    ctx.scene.add(m);
    if (collide) ctx.cols.addRotated(x, z, w, d, rotY, y, y + h, 'furn');
    return m;
  }
  light(ctx, x, y, z, color = 0xfff0d0, intensity = 8, dist = 12) {
    const l = new THREE.PointLight(color, intensity, dist, 1.6);
    l.position.set(x, y, z); ctx.scene.add(l);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color }));
    bulb.position.set(x, y, z); ctx.scene.add(bulb);
    return l;
  }
  chandelier(ctx, x, z, h, r = 0.8) {
    const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.3 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 6, 20), gold);
    ring.rotation.x = Math.PI / 2; ring.position.set(x, h - 1.2, z); ctx.scene.add(ring);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2), gold); chain.position.set(x, h - 0.6, z); ctx.scene.add(chain);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
      c.position.set(x + Math.cos(a) * r, h - 1.1, z + Math.sin(a) * r); ctx.scene.add(c);
    }
    const l = new THREE.PointLight(0xffe8b0, 14, 16, 1.5); l.position.set(x, h - 1.3, z); ctx.scene.add(l);
  }
  carpet(ctx, w, d, x, z, seed) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: carpetTexture(seed), roughness: 1 }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.01, z); ctx.scene.add(m);
  }
  npc(ctx, kind, x, z, heading, opts = {}) {
    const g = this.game;
    const look = opts.look || randomLook(ctx.rng, kind === 'guard' ? 'gang' : kind === 'cop' ? 'police' : kind === 'boss' ? 'boss' : 'civilian');
    const k = kind === 'guard' ? 'gang' : kind === 'cop' ? 'police' : kind === 'boss' ? 'boss' : kind === 'shopkeeper' ? 'shopkeeper' : 'resident';
    const n = g.npcs.add(k, x, z, look, { state: 'guard', home: new THREE.Vector3(x, 0, z), heading, static: true, inInterior: ctx, ...opts });
    n.faceYaw = heading;
    n.inInterior = ctx;
    if (k === 'shopkeeper' || k === 'resident') n.faction = 'civilian';
    return n;
  }
  sign(ctx, text, x, y, z, rotY = 0, bg = '#8b1a1a', fg = '#f5d76e', w = 3) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg) }));
    m.position.set(x, y, z); m.rotation.y = rotY; ctx.scene.add(m);
  }
  nazar(ctx, x, y, z, rotY = 0) {
    // nazar boncuğu
    const g = new THREE.Group();
    const cols = [0x1d4e9e, 0xffffff, 0x6ab0ff, 0x111111];
    cols.forEach((c, i) => { const m = new THREE.Mesh(new THREE.CircleGeometry(0.16 - i * 0.04, 20), new THREE.MeshBasicMaterial({ color: c })); m.position.z = i * 0.002; g.add(m); });
    g.position.set(x, y, z); g.rotation.y = rotY; ctx.scene.add(g);
  }
  sofa(ctx, x, z, rot, color) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 0.9), m); seat.position.y = 0.22;
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 0.2), m); back.position.set(0, 0.6, -0.35);
    const a1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.9), m); a1.position.set(-1.1, 0.55, 0);
    const a2 = a1.clone(); a2.position.x = 1.1;
    g.add(seat, back, a1, a2); g.position.set(x, 0, z); g.rotation.y = rot; ctx.scene.add(g);
    ctx.cols.addRotated(x, z, 2.4, 0.9, rot, 0, 0.9, 'sofa');
  }
  table(ctx, x, z, w, d, h = 0.75, mat) {
    const top = this.box(ctx, w, 0.05, d, x, h - 0.05, z, mat || new THREE.MeshStandardMaterial({ map: woodTexture('#7a4a2a') }), false);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.box(ctx, 0.06, h - 0.05, 0.06, x + sx * (w / 2 - 0.08), 0, z + sz * (d / 2 - 0.08), top.material, false);
    ctx.cols.add(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 0, h, 'table');
    return top;
  }
  shelf(ctx, x, z, w, rot, itemColors) {
    const wood = new THREE.MeshStandardMaterial({ map: woodTexture('#5a3a20') });
    this.box(ctx, w, 2.2, 0.45, x, 0, z, wood, true, rot);
    const r = ctx.rng;
    for (let row = 0; row < 4; row++) for (let i = 0; i < Math.floor(w / 0.25); i++) {
      if (!r.chance(0.8)) continue;
      const h = r.float(0.15, 0.4);
      const c = new THREE.MeshStandardMaterial({ color: r.pick(itemColors), roughness: 0.6 });
      const lx = -w / 2 + 0.15 + i * 0.25;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, h, 0.2), c);
      const cx = Math.cos(rot), sx = Math.sin(rot);
      m.position.set(x + lx * cx + 0.28 * sx, 0.25 + row * 0.5 + h / 2, z - lx * sx + 0.28 * cx);
      m.rotation.y = rot;
      ctx.scene.add(m);
    }
  }
  counter(ctx, x, z, w, rot = 0, mat) {
    return this.box(ctx, w, 1.05, 0.7, x, 0, z, mat || new THREE.MeshStandardMaterial({ map: woodTexture('#6a3a1a'), roughness: 0.5 }), true, rot);
  }
  lootSpot(ctx, x, z, label = 'Çekmeceleri karıştır') {
    const g = this.game;
    const b = ctx.building;
    const key = `${b.id}:${x.toFixed(1)}`;
    if (g.state.looted[key] === g.env.day) return;
    const sparkle = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
    sparkle.position.set(x, 1.3, z); ctx.scene.add(sparkle);
    sparkle.userData.spin = true;
    const it = {
      x, z, r: 1.4, label, action: () => {
        g.state.looted[key] = g.env.day;
        const amt = Math.floor(50 + ctx.rng.float(0, 1) ** 2 * 900);
        g.state.money += amt;
        g.audio.cash(); g.ui.notify(`+${formatMoney(amt)} buldun`, 'money');
        ctx.scene.remove(sparkle);
        ctx.interact.splice(ctx.interact.indexOf(it), 1);
        const witness = g.npcs.list.find((n) => !n.dead && n.kind === 'resident');
        if (witness) { g.ui.bark(witness, 'Hırsız var! Polis!'); g.wanted.add(1, true); witness.hearThreat(g.player, 2); }
      },
    };
    ctx.interact.push(it);
  }
}

function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h >>> 0; }

function kitchen(I, ctx, x0, z, w) {
  const white = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4 });
  const top = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.3 });
  I.box(ctx, w, 0.9, 0.6, x0, 0, z, white);
  I.box(ctx, w, 0.05, 0.62, x0, 0.9, z, top, false);
  I.box(ctx, 0.75, 1.9, 0.7, x0 + w / 2 + 0.45, 0, z, new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.3, roughness: 0.3 }));
  // çaydanlık (iki katlı)
  const steel = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.2 });
  const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.2, 12), steel); t1.position.set(x0 - w / 4, 1.05, z); ctx.scene.add(t1);
  const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.15, 12), steel); t2.position.set(x0 - w / 4, 1.22, z); ctx.scene.add(t2);
}

function bed(I, ctx, x, z, rot) {
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture('#5a3018') });
  I.box(ctx, 1.6, 0.45, 2.1, x, 0, z, wood, true, rot);
  I.box(ctx, 1.55, 0.18, 2.0, x, 0.45, z, new THREE.MeshStandardMaterial({ color: 0xe8e0d0 }), false, rot);
  I.box(ctx, 1.4, 0.12, 0.4, x + Math.sin(rot) * -0.7, 0.62, z + Math.cos(rot) * -0.7, new THREE.MeshStandardMaterial({ color: 0xffffff }), false, rot);
  I.box(ctx, 1.6, 0.9, 0.08, x + Math.sin(rot) * -1.05, 0, z + Math.cos(rot) * -1.05, wood, false, rot);
}

function tavla(I, ctx, x, z) {
  // tavla tahtası
  const c = makeCanvas(256, 128); const g2 = c.getContext('2d');
  g2.fillStyle = '#7a4a2a'; g2.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 12; i++) {
    g2.fillStyle = i % 2 ? '#e8d8b0' : '#8a1a1a';
    const x0 = 8 + i * 20 + (i >= 6 ? 8 : 0);
    g2.beginPath(); g2.moveTo(x0, 4); g2.lineTo(x0 + 18, 4); g2.lineTo(x0 + 9, 56); g2.fill();
    g2.beginPath(); g2.moveTo(x0, 124); g2.lineTo(x0 + 18, 124); g2.lineTo(x0 + 9, 72); g2.fill();
  }
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.35), [0, 0, new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c) }), 0, 0, 0].map((v) => v || new THREE.MeshStandardMaterial({ color: 0x5a3018 })));
  m.position.set(x, 0.77, z); ctx.scene.add(m);
}

function wallTiles(I, ctx, w, h, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: iznikTexture() }));
  m.material.map.repeat.set(w / 1.2, h / 1.2);
  m.position.set(0, h / 2 + 0.3, z); ctx.scene.add(m);
}

const BUILDERS = {
  apartment(ctx) {
    const r = ctx.rng;
    const w = r.float(9, 13), d = r.float(8, 11);
    this.room(ctx, w, d, 3.0, new THREE.MeshStandardMaterial({ map: woodTexture(r.pick(['#8a5a3a', '#6b4226', '#a07050'])) }), new THREE.MeshStandardMaterial({ map: wallpaperTexture(r.pick(['#e8dcc0', '#d8e0d0', '#e0d0d8', '#f0e8d8']), r.pick(['#c9b48a', '#a8b8a0', '#c0a8b0'])) }));
    this.carpet(ctx, 3.2, 2.2, -w / 4, 0, r.int(0, 2));
    this.sofa(ctx, -w / 4, -1.3, 0, r.pick(['#5a2a2a', '#2a3a5a', '#4a4a3a', '#6a5a4a']));
    this.table(ctx, -w / 4, 0.2, 1.1, 0.6, 0.45);
    // TV
    this.box(ctx, 1.6, 0.5, 0.45, -w / 4, 0, 1.9, new THREE.MeshStandardMaterial({ map: woodTexture('#3a2412') }));
    const tv = this.box(ctx, 1.2, 0.7, 0.06, -w / 4, 0.55, 1.95, new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x2a4a6a, emissiveIntensity: 0.6 }), false);
    tv.rotation.y = Math.PI;
    // yemek masası
    this.table(ctx, w / 4, -d / 4, 1.6, 0.9);
    for (const [sx, sz] of [[-0.5, -0.65], [0.5, -0.65], [-0.5, 0.65], [0.5, 0.65]]) this.box(ctx, 0.42, 0.45, 0.42, w / 4 + sx, 0, -d / 4 + sz, new THREE.MeshStandardMaterial({ map: woodTexture('#6a3a1a') }), false);
    kitchen(this, ctx, w / 4, -d / 2 + 0.35, 2.2);
    this.shelf(ctx, -w / 2 + 0.3, -d / 4, 1.6, Math.PI / 2, ['#8a1a1a', '#1d3d6e', '#2d5a2d', '#c9b48a', '#5a2d5a']);
    bed(this, ctx, w / 2 - 1.2, d / 4, -Math.PI / 2);
    this.nazar(ctx, 0, 2.0, -d / 2 + 0.01);
    this.light(ctx, -w / 4, 2.7, 0, 0xffe8c0, 6);
    this.light(ctx, w / 4, 2.7, -d / 4, 0xffe8c0, 5);
    const nres = r.int(0, 2);
    for (let i = 0; i < nres; i++) this.npc(ctx, 'resident', r.float(-w / 3, w / 3), r.float(-d / 4, d / 5), r.float(0, 6.28));
    this.lootSpot(ctx, -w / 2 + 0.8, -d / 4 + 1.2);
    if (r.chance(0.5)) this.lootSpot(ctx, w / 2 - 1.2, d / 4 - 1.6, 'Komodini karıştır');
    if (r.chance(0.15)) this.lootSpot(ctx, w / 4, -d / 2 + 1.0, 'Gizli kasayı aç');
  },

  safehouse(ctx) {
    const g = this.game;
    this.room(ctx, 12, 10, 3.2, new THREE.MeshStandardMaterial({ map: woodTexture('#4a2c1a') }), new THREE.MeshStandardMaterial({ map: wallpaperTexture('#2a2a2a', '#3a3a3a') }));
    this.carpet(ctx, 4, 3, -2, 0, 1);
    this.sofa(ctx, -2, -1.6, 0, '#1a1a1a');
    this.table(ctx, -2, 0, 1.2, 0.6, 0.45);
    bed(this, ctx, 4.6, -2.8, 0);
    this.box(ctx, 1.8, 2.2, 0.6, 4.5, 0, 3.4, new THREE.MeshStandardMaterial({ map: woodTexture('#3a2412') }));
    // silah dolabı
    const rack = this.box(ctx, 2, 2, 0.3, -5.7, 0, -2, new THREE.MeshStandardMaterial({ color: 0x222222 }), true, Math.PI / 2);
    void rack;
    ['ak', 'shotgun', 'pistol'].forEach((id, i) => { const m = buildWeaponModel(id); m.scale.setScalar(1.5); m.position.set(-5.5, 1.6 - i * 0.5, -2.6 + i * 0.2); m.rotation.y = Math.PI / 2; ctx.scene.add(m); });
    this.light(ctx, -2, 2.9, 0, 0xffd8a0, 7);
    this.light(ctx, 4, 2.9, -2, 0xffd8a0, 5);
    this.nazar(ctx, 0, 2.2, -4.99);
    ctx.interact.push({ x: 4.6, z: -1.4, r: 1.6, label: 'Uyu ve Oyunu Kaydet', action: () => g.sleepAndSave() });
    ctx.interact.push({ x: 4.5, z: 2.6, r: 1.4, label: 'Gardırop (kıyafet değiştir)', action: () => g.ui.openShop('wardrobe') });
    ctx.interact.push({ x: -5.0, z: -2, r: 1.5, label: 'Silah dolabı (cephane doldur ₺)', action: () => g.ui.openShop('stash') });
  },

  konak(ctx) {
    const g = this.game;
    this.room(ctx, 16, 14, 4.2, new THREE.MeshStandardMaterial({ map: marbleTexture() }), new THREE.MeshStandardMaterial({ map: wallpaperTexture('#5a1a1a', '#7a2a2a') }), 0xe8d8b0);
    this.carpet(ctx, 8, 6, 0, -2, 0);
    // makam masası
    this.box(ctx, 3, 0.8, 1.2, 0, 0, -4.5, new THREE.MeshStandardMaterial({ map: woodTexture('#3a1a0a'), roughness: 0.3 }));
    this.box(ctx, 0.8, 1.3, 0.8, 0, 0, -5.6, new THREE.MeshStandardMaterial({ color: 0x3a0d0d }), true);
    this.sofa(ctx, -4, -1, Math.PI / 2, '#3a0d0d');
    this.sofa(ctx, 4, -1, -Math.PI / 2, '#3a0d0d');
    this.chandelier(ctx, 0, -2, 4.2, 1.2);
    this.chandelier(ctx, 0, 3, 4.2, 0.8);
    this.nazar(ctx, 0, 3, -6.99);
    this.sign(ctx, 'AİLE HER ŞEYDİR', 0, 3.2, -6.98, 0, '#1a0a0a', '#d4af37', 4);
    const reis = this.npc(ctx, 'boss', 0, -5.2, 0, { name: 'Reis Baba', look: { ...randomLook(ctx.rng, 'boss'), hat: 'none', hairColor: '#cccccc' } });
    reis.sitting = true; reis.god = true; reis.isReis = true;
    reis.pos.y = 0;
    this.npc(ctx, 'guard', -2.5, -4, 0.3, { name: 'Koruma', gang: 'family' }).god = false;
    this.npc(ctx, 'guard', 2.5, -4, -0.3, { name: 'Koruma', gang: 'family' });
    ctx.peaceful = true;
    ctx.interact.push({ x: 0, z: -3.4, r: 1.8, label: 'Reis Baba ile konuş', action: () => g.missions.talkToGiver('reis') });

    // [hikâye kancası] konaktakiler hikâyeye göre değişir (Leyla, Cin Ali, Kenan, pusu...)
    if (g.missions.populateKonak) g.missions.populateKonak(ctx, this, reis);
  },

  gun(ctx) {
    const g = this.game;
    this.room(ctx, 10, 8, 3.2, new THREE.MeshStandardMaterial({ map: tileTexture('#3a3a3a', '#2a2a2a') }), new THREE.MeshStandardMaterial({ color: 0x4a4a44 }));
    this.counter(ctx, 0, -1.5, 5, 0, new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5 }));
    this.box(ctx, 9, 2.4, 0.2, 0, 0.3, -3.85, new THREE.MeshStandardMaterial({ map: woodTexture('#3a2412') }), false);
    ['pistol', 'revolver', 'uzi', 'shotgun', 'ak', 'm4', 'sniper', 'rpg'].forEach((id, i) => {
      const m = buildWeaponModel(id); m.scale.setScalar(2.2);
      m.position.set(-3.8 + i * 1.08, 1.8 + (i % 2) * 0.6, -3.65); m.rotation.y = Math.PI / 2; ctx.scene.add(m);
    });
    this.sign(ctx, 'SİLAH - MÜHİMMAT', 0, 2.9, -3.72, 0, '#2b2b2b', '#ff4a3d', 3.5);
    this.light(ctx, 0, 2.9, 0, 0xfff0e0, 9);
    this.npc(ctx, 'shopkeeper', 0, -2.4, 0, { name: 'Silahçı Cemal', weapon: 'shotgun' });
    ctx.interact.push({ x: 0, z: -0.8, r: 1.6, label: 'Silah satın al', action: () => g.ui.openShop('gun') });
  },

  clothes(ctx) {
    const g = this.game;
    this.room(ctx, 12, 9, 3.2, new THREE.MeshStandardMaterial({ map: marbleTexture() }), new THREE.MeshStandardMaterial({ color: 0xf0e8ec }));
    const r = ctx.rng;
    for (let i = 0; i < 4; i++) {
      const x = -4 + i * 2.6;
      this.box(ctx, 0.05, 1.6, 1.8, x, 0, 1, new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9 }), true);
      for (let k = 0; k < 7; k++) this.box(ctx, 0.5, 0.9, 0.05, x, 0.6, 0.25 + k * 0.25, new THREE.MeshStandardMaterial({ color: r.pick(['#1a1a1a', '#8a1a1a', '#1d3d6e', '#e8e8e8', '#5a2d5a', '#c9b48a']) }), false);
    }
    const mirror = this.box(ctx, 1.2, 2, 0.05, 5.9, 0.2, -2, new THREE.MeshStandardMaterial({ color: 0xaaccdd, metalness: 1, roughness: 0.05 }), false);
    mirror.rotation.y = Math.PI / 2;
    this.counter(ctx, -3, -3, 2.5);
    this.light(ctx, 0, 2.9, -1, 0xffffff, 9);
    this.light(ctx, -3, 2.9, 2, 0xffffff, 5);
    this.npc(ctx, 'shopkeeper', -3, -3.8, 0, { name: 'Butik Selin', look: { ...randomLook(ctx.rng, 'civilian'), gender: 'f', hair: 'uzun' } });
    ctx.interact.push({ x: -3, z: -2.2, r: 1.6, label: 'Kıyafet satın al', action: () => g.ui.openShop('clothes') });
    // [ekonomi] deneme kabini (perde + ayna) ve tezgâhta yazar kasa
    const cab = new THREE.MeshStandardMaterial({ color: 0x3a1a2a, roughness: 0.9 });
    this.box(ctx, 1.6, 2.3, 0.06, 4.6, 0, -4.3, cab, false);
    this.box(ctx, 0.06, 2.3, 1.5, 3.8, 0, -3.55, cab, false);
    const curtain = this.box(ctx, 1.5, 2.0, 0.03, 4.6, 0.1, -2.82, new THREE.MeshStandardMaterial({ color: 0x8a1a2a, roughness: 1 }), false);
    curtain.scale.x = 0.45; curtain.position.x = 5.15;
    this.sign(ctx, 'KABİN', 4.6, 2.55, -2.8, 0, '#1a0a12', '#f0c0d0', 1.2);
    const reg = this.box(ctx, 0.45, 0.3, 0.4, -2.2, 1.05, -3, new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5, roughness: 0.4 }), false);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.14), new THREE.MeshBasicMaterial({ color: 0x40ff90 }));
    scr.position.set(-2.2, 1.45, -2.79); ctx.scene.add(scr);
    void reg;
    ctx.register = { x: -1.6, z: -2.2 };
    ctx.interact.push({ x: 4.6, z: -2.2, r: 1.3, label: 'Kabin: gardırobunu dene', action: () => g.ui.openShop('wardrobe') });
  },

  food(ctx) {
    const g = this.game;
    this.room(ctx, 9, 8, 3.0, new THREE.MeshStandardMaterial({ map: tileTexture('#d8d0c0', '#c0b8a8') }), new THREE.MeshStandardMaterial({ color: 0xe8e4d8 }));
    const cols = ['#c81010', '#f2c200', '#1060c8', '#2d8a3d', '#e86a10', '#ffffff', '#5a2d5a'];
    this.shelf(ctx, -2.5, -3.6, 3.5, 0, cols);
    this.shelf(ctx, 2.2, -3.6, 3.5, 0, cols);
    this.shelf(ctx, -4.2, 0.5, 3, Math.PI / 2, cols);
    this.box(ctx, 1.5, 2, 0.7, 3.6, 0, 1.5, new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0x334455, emissiveIntensity: 0.3 }));
    this.counter(ctx, 1.5, -1, 2.6);
    this.light(ctx, 0, 2.7, 0, 0xffffff, 8);
    this.npc(ctx, 'shopkeeper', 1.5, -1.8, 0, { name: 'Bakkal Hüsnü' });
    ctx.interact.push({ x: 1.5, z: -0.2, r: 1.6, label: 'Yiyecek satın al', action: () => g.ui.openShop('food') });
  },

  cafe(ctx) {
    const g = this.game;
    this.room(ctx, 11, 9, 3.0, new THREE.MeshStandardMaterial({ map: tileTexture('#8a3a2a', '#6a2a1a', 6) }), new THREE.MeshStandardMaterial({ map: wallpaperTexture('#e8d8b0', '#c9a870') }));
    wallTiles(this, ctx, 4, 1.5, -4.49);
    this.counter(ctx, 0, -3.5, 4);
    kitchen(this, ctx, 0, -4.1, 1.0);
    const r = ctx.rng;
    for (const [x, z] of [[-3, -0.5], [3, -0.5], [-3, 2.5], [3, 2.5]]) {
      this.table(ctx, x, z, 0.9, 0.9);
      tavla(this, ctx, x, z);
      for (const s of [-1, 1]) {
        this.box(ctx, 0.4, 0.45, 0.4, x + s * 0.8, 0, z, new THREE.MeshStandardMaterial({ map: woodTexture('#5a3018') }), false);
        if (r.chance(0.7)) {
          const n = this.npc(ctx, 'resident', x + s * 0.8, z, s > 0 ? -Math.PI / 2 : Math.PI / 2, { look: { ...randomLook(r, 'civilian'), gender: 'm', hairColor: '#aaaaaa', hat: r.pick(['kasket', 'none']), beard: r.pick(['mustache', 'full']) } });
          n.sitting = true;
        }
      }
    }
    this.light(ctx, -2, 2.7, 1, 0xffd8a0, 6); this.light(ctx, 2, 2.7, 1, 0xffd8a0, 6);
    this.npc(ctx, 'shopkeeper', 0, -4.2, 0, { name: 'Ocakçı Rıza' });
    ctx.interact.push({ x: 0, z: -2.7, r: 1.6, label: 'Çay ısmarla / yiyecek', action: () => g.ui.openShop('food') });
  },

  trade(ctx) {
    const g = this.game;
    this.room(ctx, 10, 9, 3.0, new THREE.MeshStandardMaterial({ color: 0x3a3630, roughness: 1 }), new THREE.MeshStandardMaterial({ color: 0x4a443a }));
    const r = ctx.rng;
    for (let i = 0; i < 10; i++) this.box(ctx, r.float(0.8, 1.2), r.float(0.6, 1.2), r.float(0.8, 1.2), r.float(-4, 4), 0, r.float(-4, -1), new THREE.MeshStandardMaterial({ map: woodTexture('#8a6a3a') }));
    this.table(ctx, 0, 1, 2, 1);
    this.light(ctx, 0, 2.6, 1, 0xffaa60, 6, 9);
    this.npc(ctx, 'guard', -1.2, 0.2, 0.2, { name: 'Tüccar Kâmil', gang: 'trader' });
    this.npc(ctx, 'guard', 3.5, 2.5, -1, { name: 'Fedai', gang: 'trader' });
    ctx.interact.push({ x: 0, z: 2.0, r: 1.6, label: 'Karaborsa (al / sat)', action: () => g.ui.openShop('trade') });
  },

  bazaar(ctx) {
    const g = this.game;
    this.room(ctx, 14, 40, 5, new THREE.MeshStandardMaterial({ map: tileTexture('#c9b48a', '#b09870', 4) }), new THREE.MeshStandardMaterial({ map: iznikTexture() }), 0xd8c8a8);
    const r = ctx.rng;
    // tezgâhlar ve renkli lambalar
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
      const z = -16 + i * 6;
      this.box(ctx, 3, 1, 2, s * 5, 0, z, new THREE.MeshStandardMaterial({ map: woodTexture('#7a4a2a') }));
      this.carpet(ctx, 2.6, 1.8, s * 5, z, r.int(0, 2));
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.6), new THREE.MeshStandardMaterial({ map: carpetTexture(r.int(0, 2)) }));
      m.position.set(s * 6.95, 2.6, z); m.rotation.y = -s * Math.PI / 2; ctx.scene.add(m);
      for (let k = 0; k < 3; k++) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: r.pick([0xff4040, 0x40a0ff, 0x40ff80, 0xffc040, 0xff40ff]) }));
        lamp.position.set(s * 4 + k * 0.8 * s, 3.5 - k * 0.2, z); ctx.scene.add(lamp);
      }
      if (r.chance(0.7)) this.npc(ctx, 'shopkeeper', s * 5, z - 1.3 * 0 + s * 0, -s * Math.PI / 2, { name: 'Esnaf' }).pos.x = s * 6.3;
    }
    for (let i = 0; i < 4; i++) this.light(ctx, 0, 4.5, -15 + i * 10, 0xffd8a0, 12, 16);
    for (let i = 0; i < 5; i++) this.npc(ctx, 'resident', r.float(-2, 2), r.float(-15, 15), r.float(0, 6));
    ctx.interact.push({ x: 3.2, z: -4, r: 2, label: 'Altın & halı ticareti', action: () => g.ui.openShop('trade') });
    ctx.interact.push({ x: -3.2, z: 2, r: 2, label: 'Lokanta: yiyecek', action: () => g.ui.openShop('food') });
    ctx.interact.push({ x: 3.2, z: 8, r: 2, label: 'Kuyumcu: aksesuar', action: () => g.ui.openShop('clothes') });
    return { x: 0, z: 18.4 };
  },

  dealer(ctx) {
    const g = this.game;
    this.room(ctx, 22, 16, 5, new THREE.MeshStandardMaterial({ map: tileTexture('#e8e8e8', '#d0d0d0', 6), roughness: 0.2 }), new THREE.MeshStandardMaterial({ color: 0xdde4ea }));
    ['gt', 'suv', 'sedan'].forEach((t, i) => {
      const c = buildCarModel(t);
      c.position.set(-6 + i * 6, 0, -2); c.rotation.y = 0.5;
      ctx.scene.add(c);
      ctx.cols.add(-6 + i * 6 - 2, -4.5, -6 + i * 6 + 2, 0.5, 0, 1.5, 'car');
    });
    this.box(ctx, 2.5, 0.8, 1, 7, 0, 4, new THREE.MeshStandardMaterial({ color: 0x222222 }));
    for (let i = 0; i < 3; i++) this.light(ctx, -6 + i * 6, 4.6, -2, 0xffffff, 16, 14);
    this.npc(ctx, 'shopkeeper', 7, 3.2, 0, { name: 'Galerici Tayfun', look: { ...randomLook(ctx.rng, 'civilian'), top: 'suit', topColor: '#1d2440' } });
    ctx.interact.push({ x: 7, z: 5, r: 1.8, label: 'Showroom: araç incele / test sürüşü', action: () => g.ui.openShop('dealer') });
    // [ekonomi] deniz & hava araçları kataloğu
    this.sign(ctx, 'TEKNE · HELİKOPTER · JET', -7, 3.4, -7.98, 0, '#0d1a2a', '#bfe0ff', 4);
    ctx.interact.push({ x: -7, z: -6.6, r: 1.8, label: 'Deniz & hava araçları kataloğu', action: () => g.ui.shop_dealer && g.ui.shop_dealer('sea') });
  },

  garage(ctx) {
    const g = this.game;
    this.room(ctx, 14, 12, 4.5, new THREE.MeshStandardMaterial({ color: 0x5a5a58, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0x6a6458 }));
    this.box(ctx, 3, 0.2, 5, 0, 0, -1, new THREE.MeshStandardMaterial({ color: 0xc8a000 }));
    this.box(ctx, 6, 1, 0.6, 0, 0, -5.6, new THREE.MeshStandardMaterial({ color: 0x8a1a1a }));
    for (let i = 0; i < 4; i++) this.box(ctx, 0.8, 0.8, 0.8, -5 + i * 0.4, 0, 4 - i, new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }), false);
    this.light(ctx, 0, 4.2, 0, 0xffffff, 12, 14);
    this.npc(ctx, 'shopkeeper', 3, -4, 0, { name: 'Usta Rıfat', look: { ...randomLook(ctx.rng, 'civilian'), top: 'track', topColor: '#1d3d6e' } });
    ctx.interact.push({ x: 3, z: -2.8, r: 1.6, label: 'Tamir, boya ve modifiye', action: () => g.ui.openShop('garage') });
  },

  bank(ctx) {
    const g = this.game;
    this.room(ctx, 16, 12, 4, new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.2 }), new THREE.MeshStandardMaterial({ color: 0xe8e0d0 }));
    for (let i = 0; i < 3; i++) {
      this.counter(ctx, -4 + i * 4, -2.5, 3, 0, new THREE.MeshStandardMaterial({ map: woodTexture('#5a3018'), roughness: 0.3 }));
      this.box(ctx, 3, 1, 0.04, -4 + i * 4, 1.05, -2.5, new THREE.MeshStandardMaterial({ color: 0x99bbcc, transparent: true, opacity: 0.3 }), false);
      this.npc(ctx, 'shopkeeper', -4 + i * 4, -3.3, 0, { name: 'Gişe Memuru' });
    }
    // kasa dairesi
    const vault = this.box(ctx, 2.4, 2.4, 0.3, 0, 0, -5.8, new THREE.MeshStandardMaterial({ color: 0x8a8d90, metalness: 1, roughness: 0.3 }), false);
    void vault;
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 6, 16), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1 }));
    wheel.position.set(0, 1.2, -5.62); ctx.scene.add(wheel);
    this.npc(ctx, 'cop', 6, 3, -Math.PI / 2, { name: 'Güvenlik' });
    this.npc(ctx, 'cop', -6, 3, Math.PI / 2, { name: 'Güvenlik' });
    this.chandelier(ctx, 0, 1, 4, 1);
    ctx.interact.push({ x: 0, z: -1.6, r: 1.6, label: 'Banka işlemleri (yatır/çek)', action: () => g.ui.openShop('bank') });
    // [ekonomi] kredi & vadeli masası
    ctx.interact.push({ x: 4, z: -1.6, r: 1.4, label: 'Kredi ve vadeli hesap masası', action: () => g.ui.shop_bank && g.ui.shop_bank('loan') });
    const key = 'bank:' + ctx.building.id;
    if (g.state.robbed[key] !== g.env.day) {
      ctx.interact.push({
        x: 0, z: -4.8, r: 1.4, label: 'KASAYI SOY (4 yıldız!)', danger: true, action: () => {
          if (g.player.weapon === 'fists' || g.player.wdef.type === 'melee') { g.ui.notify('Kasayı soymak için ateşli silah lazım!', 'warn'); return; }
          g.state.robbed[key] = g.env.day;
          const amt = 25000 + Math.floor(ctx.rng.float(0, 45000));
          g.state.money += amt; g.audio.cash();
          g.ui.bigMessage('BANKA SOYGUNU!', `+${formatMoney(amt)}  —  Kaç!`, 'red');
          g.wanted.add(4, true);
          for (const n of g.npcs.list) n.hearThreat(g.player, 3);
          ctx.interact.splice(ctx.interact.findIndex((i) => i.danger), 1);
          g.state.stats.robberies++;
        },
      });
    }
  },

  hospital(ctx) {
    const g = this.game;
    this.room(ctx, 14, 10, 3.2, new THREE.MeshStandardMaterial({ map: tileTexture('#f0f0f0', '#e0e8e8') }), new THREE.MeshStandardMaterial({ color: 0xf4f8f8 }));
    for (let i = 0; i < 4; i++) bed(this, ctx, -5 + i * 3.2, -3.4, 0);
    this.counter(ctx, 4, 2, 3, 0, new THREE.MeshStandardMaterial({ color: 0xffffff }));
    this.sign(ctx, 'ACİL SERVİS', 0, 2.6, -4.98, 0, '#ffffff', '#d01010', 3);
    this.light(ctx, 0, 2.9, 0, 0xffffff, 12, 14);
    this.npc(ctx, 'shopkeeper', 4, 1.2, 0, { name: 'Dr. Ayten', look: { ...randomLook(ctx.rng, 'civilian'), gender: 'f', top: 'coat', topColor: '#ffffff' } });
    ctx.interact.push({ x: 4, z: 2.8, r: 1.6, label: 'Tedavi ol', action: () => g.ui.openShop('hospital') });
  },

  police(ctx) {
    const g = this.game;
    this.room(ctx, 16, 12, 3.2, new THREE.MeshStandardMaterial({ map: tileTexture('#b8c0c8', '#a0a8b0') }), new THREE.MeshStandardMaterial({ color: 0xc8d0d8 }));
    for (let i = 0; i < 3; i++) this.table(ctx, -4 + i * 4, -1, 1.8, 0.9);
    // nezarethane parmaklıkları
    for (let i = 0; i < 12; i++) this.box(ctx, 0.05, 3.2, 0.05, -7 + i * 0.4, 0, -4, new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 }), false);
    ctx.cols.add(-7.5, -4.1, -2.6, -3.9, 0, 3.2, 'bars');
    this.sign(ctx, 'EMNİYET', 2, 2.5, -5.98, 0, '#0d2a6e', '#ffffff', 3);
    this.light(ctx, 0, 2.9, 0, 0xffffff, 12, 16);
    for (let i = 0; i < 4; i++) this.npc(ctx, 'cop', -4 + i * 3, 1 + (i % 2), Math.PI);
    if (g.wanted.level > 0) for (const n of g.npcs.list) if (n.faction === 'police') { n.state = 'attack'; n.target = g.player; n.static = false; }
    ctx.interact.push({ x: 4, z: -0.2, r: 1.6, label: 'Rüşvet ver: aranmayı sil (₺)', action: () => g.ui.openShop('bribe') });
  },

  estate(ctx) {
    const g = this.game;
    this.room(ctx, 9, 8, 3.0, new THREE.MeshStandardMaterial({ map: woodTexture('#7a5a3a') }), new THREE.MeshStandardMaterial({ color: 0xece4d4 }));
    this.table(ctx, 0, -1.5, 2.2, 1);
    this.shelf(ctx, -3.8, 0, 2.5, Math.PI / 2, ['#8a1a1a', '#1d3d6e', '#e8e8e8']);
    this.sign(ctx, 'SATILIK - KİRALIK', 0, 2.3, -3.98, 0, '#5a3d0d', '#ffe9b0', 3);
    this.light(ctx, 0, 2.7, 0, 0xffeedd, 8);
    this.npc(ctx, 'shopkeeper', 0, -2.4, 0, { name: 'Emlakçı Nuri', look: { ...randomLook(ctx.rng, 'civilian'), top: 'suit' } });
    ctx.interact.push({ x: 0, z: -0.6, r: 1.6, label: 'Emlak: konut ve işletme ilanları', action: () => g.ui.openShop('estate') });
  },

  club(ctx) {
    const g = this.game;
    this.room(ctx, 18, 16, 4.5, new THREE.MeshStandardMaterial({ color: 0x0a0a12, roughness: 0.3 }), new THREE.MeshStandardMaterial({ color: 0x14101e }), 0x050508);
    // dans pisti
    const tiles = [];
    for (let x = 0; x < 6; x++) for (let z = 0; z < 6; z++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({ color: 0xff00ff }));
      m.rotation.x = -Math.PI / 2; m.position.set(-2.5 + x, 0.02, -3.5 + z); ctx.scene.add(m); tiles.push(m);
    }
    ctx.update = (dt, t) => {
      tiles.forEach((m, i) => m.material.color.setHSL(((t * 0.2 + i * 0.07) % 1), 1, Math.sin(t * 4 + i) > 0 ? 0.5 : 0.15));
      for (const l of ctx.discoLights) { l.position.x = Math.sin(t * l.userData.s + l.userData.o) * 6; l.position.z = Math.cos(t * l.userData.s * 0.7 + l.userData.o) * 5; }
      for (const d of ctx.dancers) { d.model.hips.position.y = 0.98 + Math.abs(Math.sin(t * 6 + d.id)) * 0.08; d.heading += Math.sin(t + d.id) * 0.02; d.model.arms[0].sh.rotation.x = -2.5 + Math.sin(t * 6 + d.id) * 0.5; d.model.arms[1].sh.rotation.x = -2.5 - Math.sin(t * 6 + d.id) * 0.5; }
    };
    ctx.discoLights = [];
    for (const [c, s, o] of [[0xff0080, 0.7, 0], [0x00ffff, 0.5, 2], [0xffff00, 0.9, 4]]) {
      const l = new THREE.PointLight(c, 20, 12, 1.5); l.position.y = 3.5; l.userData = { s, o }; ctx.scene.add(l); ctx.discoLights.push(l);
    }
    this.counter(ctx, 6, 4, 4, Math.PI / 2, new THREE.MeshStandardMaterial({ color: 0x1a1a2a, metalness: 0.6, roughness: 0.2 }));
    this.npc(ctx, 'shopkeeper', 7, 4, -Math.PI / 2, { name: 'Barmen' });
    ctx.dancers = [];
    const r = ctx.rng;
    for (let i = 0; i < 10; i++) { const d = this.npc(ctx, 'resident', r.float(-2.5, 2.5), r.float(-3.5, 1.5), r.float(0, 6)); ctx.dancers.push(d); d.talking = false; }
    this.npc(ctx, 'guard', -1.5, 6.5, Math.PI, { name: 'Fedai', gang: 'family' });
    ctx.interact.push({ x: 5.2, z: 4, r: 1.6, label: 'Bar: içecek / yiyecek', action: () => g.ui.openShop('food') });
    if (g.state.businesses.includes('kulup')) ctx.interact.push({ x: -6, z: -5, r: 1.6, label: 'Kasa: günlük hasılatı al', action: () => g.collectIncome() });
  },

  warehouse(ctx) {
    this.room(ctx, 24, 20, 7, new THREE.MeshStandardMaterial({ color: 0x5a5650, roughness: 1 }), new THREE.MeshStandardMaterial({ color: 0x6a645a }), 0x4a4640);
    const r = ctx.rng;
    for (let i = 0; i < 18; i++) {
      const x = r.float(-10, 10), z = r.float(-8, 5);
      const h = r.int(1, 3);
      for (let k = 0; k < h; k++) this.box(ctx, 1.6, 1.4, 1.6, x, k * 1.4, z, new THREE.MeshStandardMaterial({ map: woodTexture('#9a7a4a') }), k === 0);
    }
    for (let i = 0; i < 4; i++) this.light(ctx, -8 + i * 5.3, 6.5, -2, 0xfff0d0, 14, 14);
    this.game.missions.populateWarehouse(ctx, this);
  },

  rival(ctx) {
    this.room(ctx, 18, 16, 4, new THREE.MeshStandardMaterial({ map: marbleTexture() }), new THREE.MeshStandardMaterial({ map: wallpaperTexture('#e8e8e8', '#c8c8c8') }), 0xf0f0f0);
    this.carpet(ctx, 8, 6, 0, -2, 2);
    this.box(ctx, 3, 0.8, 1.2, 0, 0, -5.8, new THREE.MeshStandardMaterial({ map: woodTexture('#2a1a0a') }));
    this.chandelier(ctx, 0, -2, 4, 1.2);
    for (let i = 0; i < 6; i++) this.box(ctx, 1, 1, 1, -7 + i * 2.8, 0, 2 + (i % 2) * 2, new THREE.MeshStandardMaterial({ color: 0x3a3a3a }));
    this.game.missions.populateRival(ctx, this);
  },

  mosque(ctx) { buildMosqueInterior(this, ctx, 30, 30); return { x: 0, z: 13.4 }; },
  mosque_small(ctx) { buildMosqueInterior(this, ctx, 14, 14); },

  tower(ctx) {
    const g = this.game;
    this.room(ctx, 9, 9, 4, new THREE.MeshStandardMaterial({ map: tileTexture('#8a7f6e', '#7a6f5e', 4) }), new THREE.MeshStandardMaterial({ map: (() => { const t = marbleTexture(); return t; })(), color: 0xc9bba0 }));
    // spiral merdiven temsili
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.box(ctx, 1.4, 0.15, 0.6, Math.cos(a) * 2.5, i * 0.3, Math.sin(a) * 2.5 - 1, new THREE.MeshStandardMaterial({ color: 0x9a8f7a }), false, -a);
    }
    this.light(ctx, 0, 3.6, 0, 0xffd8a0, 9);
    this.npc(ctx, 'shopkeeper', 3, -3, -0.6, { name: 'Görevli' });
    ctx.interact.push({ x: 0, z: -1, r: 1.8, label: 'Asansör: Seyir terasına çık (₺50)', action: () => g.goGalataTop() });
  },

  // [hikâye] askeri kışla cephaneliği: silah rafları, sandıklar, nöbetçi askerler
  armory(ctx) {
    const g = this.game;
    this.room(ctx, 16, 12, 4, new THREE.MeshStandardMaterial({ color: 0x4a4a44, roughness: 0.95 }), new THREE.MeshStandardMaterial({ color: 0x5a6248 }), 0x3a3a34);
    const olive = new THREE.MeshStandardMaterial({ color: 0x4a5a30, roughness: 0.8 });
    for (let i = 0; i < 3; i++) this.box(ctx, 1.4, 0.8, 0.9, -3 + i * 3, 0, -4.5 + (i === 1 ? -0.5 : 0), olive);
    for (let i = 0; i < 6; i++) this.box(ctx, 1.2, 1.2, 1.2, -7 + (i % 2) * 1.3, (i > 3 ? 1.2 : 0), 1 + Math.floor(i / 2) * 1.4, olive, i < 4);
    this.box(ctx, 0.3, 2.2, 6, 7.6, 0, -1, new THREE.MeshStandardMaterial({ color: 0x2a2a2a }));
    ['m4', 'ak', 'sniper', 'rpg'].forEach((id, i) => { const m = buildWeaponModel(id); m.scale.setScalar(1.8); m.position.set(7.35, 1.9 - i * 0.45, -3 + i * 1.6); m.rotation.y = -Math.PI / 2; ctx.scene.add(m); });
    this.sign(ctx, 'CEPHANELİK · YETKİSİZ GİRİLMEZ', 0, 3.1, -5.98, 0, '#3a4a28', '#ffffff', 4);
    this.light(ctx, -3, 3.6, -2, 0xfff0d0, 10, 14);
    this.light(ctx, 3, 3.6, 2, 0xfff0d0, 8, 12);
    const alert = !!(g.military && g.military.alert);
    for (const [x, z, h] of [[-5, -1, 0.8], [5, 2, -1.6], [0, 3.5, Math.PI]]) {
      const n = this.npc(ctx, 'guard', x, z, h, { name: 'Er', look: soldierLookI(ctx.rng) });
      n.kind = 'soldier'; n.faction = 'military'; n.static = false; n.skill = 0.3;
      n.giveWeapon('m4', 300); n.setWeapon('m4');
      if (alert) n.engage(g.player, 1.2);
    }
  },

  palace(ctx) { grandHall(this, ctx, 'Dolmabahçe Sarayı'); },
  station(ctx) { grandHall(this, ctx, 'Haydarpaşa Garı'); },
};

function soldierLookI(r) { return Object.assign(randomLook(r, 'gang'), { top: 'jacket', topColor: '#4a5a30', pants: 'slacks', pantsColor: '#3f4c2a', shoes: 'boots', hat: 'bere', hatColor: '#3a4a28', chain: false, glasses: false }); }

function grandHall(I, ctx, name) {
  I.room(ctx, 24, 20, 8, new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.15 }), new THREE.MeshStandardMaterial({ map: wallpaperTexture('#efe8d8', '#d8c8a0') }), 0xf0e8d0);
  I.carpet(ctx, 6, 16, 0, -1, 0);
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) I.box(ctx, 0.8, 8, 0.8, s * 8, 0, -8 + i * 3.2, new THREE.MeshStandardMaterial({ map: marbleTexture() }));
  I.chandelier(ctx, 0, -4, 8, 2);
  I.chandelier(ctx, 0, 4, 8, 1.6);
  I.sign(ctx, name.toUpperCase(), 0, 5, -9.98, 0, '#1a1a1a', '#d4af37', 6);
  const r = ctx.rng;
  for (let i = 0; i < 6; i++) I.npc(ctx, 'resident', r.float(-5, 5), r.float(-6, 6), r.float(0, 6));
  ctx.peaceful = true;
}

function buildMosqueInterior(I, ctx, w, d) {
  const H = w > 20 ? 9 : 5;
  I.room(ctx, w, d, H, new THREE.MeshStandardMaterial({ map: carpetTexture(0), roughness: 1 }), new THREE.MeshStandardMaterial({ map: iznikTexture() }), 0xe8e0d0);
  ctx.scene.children.filter((c) => c.isMesh && c.geometry.type === 'PlaneGeometry' && c.rotation.x < 0).forEach((f) => { f.material.map = carpetTexture(0).clone(); f.material.map.wrapS = f.material.map.wrapT = THREE.RepeatWrapping; f.material.map.repeat.set(w / 2.5, d / 3.5); f.material.map.needsUpdate = true; });
  // kubbe
  const dome = new THREE.Mesh(new THREE.SphereGeometry(w * 0.45, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ map: iznikTexture(), side: THREE.BackSide }));
  dome.position.y = H - 0.01; ctx.scene.add(dome);
  // kubbe pencereleri ışığı
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.2), new THREE.MeshBasicMaterial({ color: 0xfff4d0 }));
    win.position.set(Math.cos(a) * w * 0.44, H + 0.8, Math.sin(a) * w * 0.44); win.lookAt(0, H + 0.8, 0); ctx.scene.add(win);
  }
  // mihrap ve minber
  I.box(ctx, 2.4, 3.6, 0.4, 0, 0, -d / 2 + 0.25, new THREE.MeshStandardMaterial({ map: marbleTexture() }), false);
  const nich = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 0.2), new THREE.MeshStandardMaterial({ color: 0x1d4e9e }));
  nich.position.set(0, 1.4, -d / 2 + 0.36); ctx.scene.add(nich);
  I.box(ctx, 1, 3, 3, w / 2 - 3, 0, -d / 2 + 2.5, new THREE.MeshStandardMaterial({ map: marbleTexture() }));
  // avize halkası (kandiller)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(w * 0.3, 0.05, 6, 48), new THREE.MeshStandardMaterial({ color: 0x3a2a1a }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 3; ctx.scene.add(ring);
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xfff0b0 }));
    c.position.set(Math.cos(a) * w * 0.3, 2.85, Math.sin(a) * w * 0.3); ctx.scene.add(c);
  }
  const l = new THREE.PointLight(0xffe8b0, 30, w * 1.2, 1.2); l.position.set(0, 4, 0); ctx.scene.add(l);
  const r = ctx.rng;
  for (let i = 0; i < (w > 20 ? 6 : 2); i++) I.npc(ctx, 'resident', r.float(-w / 3, w / 3), r.float(-d / 3, d / 4), Math.PI, { look: { ...randomLook(r, 'civilian'), gender: 'm', hat: 'none' } });
  ctx.peaceful = true;
  I.game.ui.notify('Burası ibadethane. Silahlar kılıfında.', 'info');
  void GANGS;
}

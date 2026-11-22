// [villa] Oyuncunun malikânesi — oyun mantığı: sahiplik, otomatik kapı, galeri araçları, helikopterler, iskeledeki tekne,
// 8 koruma (kapı 2, çevre 4 devriye, bina 2), karşılama ve savunma, iç mekân (salon, yatak odası = kayıt, gardırop, ofis).
// Sahiplik kararı: villa oyunun BAŞINDAN oyuncunundur. Sahibinin isteği "villamız olsun"; hikâyenin uzun ilk perdesi
// boyunca ulaşılamayan bir ödül olarak saklamak, istenen deneyimi (ev, arabalar, helikopterler) saatlerce erteler.
// Güvenli ev gibi çalışır: içeri girince otomatik kayıt (building.ownedProp), yatakta uyu = kayıt, gardırop, cephanelik.
import * as THREE from 'three';
import { PLAYER_VILLA as V } from '../world/map.js';
import { RNG } from '../core/util.js';
import { randomLook } from '../entities/character.js';
import { buildVillaInterior } from './villa_interior.js'; // [V2]

export const VILLA_CARS = [['gt', '#a80d12'], ['gt', '#121212'], ['coupe', '#e9e9e6'], ['cabrio', '#1d3a7a']];
const GATE_PT = { x: V.gate.x, z: V.z1 };
const _v = new THREE.Vector3();

export class VillaGame {
  constructor(game) {
    this.g = game;
    this.w = game.city.playerVilla;
    this.guards = []; this.cars = []; this.helis = []; this.boat = null;
    this.gateOpen = 0; this.gateBox = null; this.inside = false; this.scanT = 0;
    const L = this.w ? this.w.layout : null;
    if (!L) return;
    // bina: kapı + iç mekân kurucusu (interiors.js [villa] kancası) + harita iğnesi (ownedProp → "Mülkün")
    const self = this;
    this.building = {
      id: 'playerVilla', type: 'villa_player', name: 'Villan', ownedProp: true, villaPlayer: true,
      door: { x: L.house.door.x, z: L.house.door.z, nx: 0, nz: 1 },
      build(ctx) { return self.buildInterior(this, ctx); },
      view: { x: 128, y: 15.2, z: -826 }, // [V2] camlardan dışarısı: çatı üstünden küp görüntü (ev gövdesinin içinden değil)
    };
    game.city.doors.push({ x: L.house.door.x, z: L.house.door.z + 0.9, building: this.building });
    if (game.map.specials) game.map.specials.push(this.building);
    this.closeGate(true);
  }

  // Dünya başlarken (yeni oyun / kayıt yükleme): araçlar, helikopterler, tekne, korumalar
  spawn() {
    const g = this.g, L = this.w && this.w.layout;
    if (!L) return;
    this.cars = VILLA_CARS.map(([t, c], i) => {
      const v = g.vehicles.add(t, L.gallery.x0 + 2 + i * 4, (L.gallery.z0 + L.gallery.z1) / 2 + 0.3, 0, c);
      v.owned = true; v.villa = true; return v;
    });
    this.helis = L.pads.map((p) => { const h = g.aircraft.add(p.kind, p.x, p.z, Math.PI / 2, p.kind === 'helikopter' ? '#1a1a1a' : undefined); h.owned = true; h.villa = true; return h; });
    if (g.boats && g.boats.add) { try { this.boat = g.boats.add('surat', 226, V.pier.z1 + 2.4, Math.PI / 2, '#e8e8e8'); if (this.boat) this.boat.owned = true; } catch (e) { console.warn('villa teknesi', e); } }
    this.spawnGuards();
  }

  spawnGuards() {
    const g = this.g;
    for (const n of this.guards) if (!n.dead) g.npcs.remove(n);
    this.guards = [];
    const rng = new RNG(1907);
    const post = (x, z, heading, weapon, patrol) => {
      const look = Object.assign(randomLook(rng, 'gang'), {
        top: 'suit', topColor: '#141416', shirtColor: '#e8e8ea', tieColor: '#111111', pants: 'slacks', pantsColor: '#141416',
        shoes: 'polished', shoesColor: '#0a0a0a', hat: 'none', glasses: true, glassesStyle: 'aviator', chain: false, tespih: false, carry: null,
      });
      const n = g.npcs.add('gang', x, z, look, {
        gang: 'family', ally: true, persistent: true, name: 'Koruma', weapon, hp: 240, heading,
        state: patrol ? 'patrol' : 'guard', baseState: patrol ? 'patrol' : 'guard', patrol: patrol || null, home: patrol ? null : new THREE.Vector3(x, 0, z),
      });
      n.armor = 60; n.villaGuard = true; n.greetT = 0;
      this.guards.push(n);
      return n;
    };
    const P = (pts) => pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
    post(119.4, -776.2, 0, 'ak'); post(124.6, -776.2, 0, 'ak'); // kapı
    post(87, -790, 0, 'pistol', P([[87, -790], [87, -862], [87, -790]])); // batı
    post(96, -862.5, 0, 'pistol', P([[96, -862.5], [170, -862.5], [96, -862.5]])); // kuzey (pistler)
    post(150, -790, 0, 'uzi', P([[150, -790], [173, -790], [173, -811], [150, -811]])); // güneydoğu çimi (deniz yanı)
    post(100, -806, 0, 'uzi', P([[100, -806], [100, -845], [96, -812]])); // bina batısı / galeri arkası
    post(118.6, -810.6, 0, 'pistol'); post(125.4, -810.6, 0, 'pistol'); // ana giriş
  }

  closeGate(init) {
    if (!this.w || this.gateBox) return;
    const a = this.w.layout.gateGap;
    this.gateBox = this.w.cols.add(a.x0, V.z1 - 1.1, a.x1, V.z1 - 0.7, 0, 2.6, 'villaGate');
    void init;
  }

  update(dt) {
    const g = this.g, w = this.w;
    if (!w || !g.player) return;
    const p = g.player, pp = p.vehicle ? p.vehicle.pos : p.pos;
    // uzaktayken ucuz: ağ grubu görünmez, kapı ve korumalar hesaplanmaz
    const cam = g.camera.position;
    w.group.visible = !p.inInterior && Math.hypot(cam.x - V.cx, cam.z - V.cz) < 950;
    const near = Math.hypot(pp.x - V.cx, pp.z - V.cz) < 180;
    // otomatik kapı: sahibi (yaya ya da araçla) 16 m'ye gelince açılır, uzaklaşınca kapanır
    const dG = Math.hypot(pp.x - GATE_PT.x, pp.z - GATE_PT.z);
    let want = !p.inInterior && dG < (p.vehicle ? 22 : 12) ? 1 : 0;
    for (const n of this.guards) if (!n.dead && n.state === 'attack' && Math.hypot(n.pos.x - GATE_PT.x, n.pos.z - GATE_PT.z) < 10) want = 0; // çatışmada kapı kapalı
    const sp = dt / 4.5;
    this.gateOpen = want ? Math.min(1, this.gateOpen + sp) : Math.max(0, this.gateOpen - sp);
    w.gate.position.x = w.gateX0 - this.gateOpen * 7.4;
    if (this.gateOpen > 0.02 && this.gateBox) { w.cols.remove(this.gateBox); this.gateBox = null; }
    if (this.gateOpen <= 0.02 && !this.gateBox) this.closeGate();
    if (!near) { this.inside = false; return; }
    // parsele giriş: konum afişi
    const inside = pp.x > V.x0 && pp.x < V.x1 && pp.z > V.z0 && pp.z < V.z1;
    if (inside && !this.inside && g.ui.locationBanner) g.ui.locationBanner('Villan  ·  Boğaz');
    this.inside = inside;
    // korumalar: patronu karşılar
    for (const n of this.guards) {
      n.greetT -= dt;
      if (n.dead || n.target || n.greetT > 0 || p.inInterior) continue;
      if (Math.hypot(n.pos.x - pp.x, n.pos.z - pp.z) < 6) { n.barkT = 0; n.say(['Hoş geldin patron', 'Hoş geldin patron, her şey yolunda.', 'Hoş geldin patron!'], 1); n.greetT = 45; }
    }
    // savunma: parsele (+20 m) giren ve patrona/korumalara saldıranla çatışırlar
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.5;
      for (const e of g.npcs.list) {
        if (e.dead || e.ally || e.villaGuard) continue;
        if (e.pos.x < V.x0 - 20 || e.pos.x > V.x1 + 20 || e.pos.z < V.z0 - 20 || e.pos.z > V.z1 + 20) continue;
        const t = e.target;
        const attacking = e.hostile || (e.state === 'attack' && t && (t.isPlayer || t.ally || t.villaGuard)) || (e.provokedT > 0 && t && t.isPlayer);
        if (!attacking) continue;
        for (const n of this.guards) if (!n.dead && !n.downed && n.target !== e && (!n.target || n.target.dead) && Math.hypot(n.pos.x - e.pos.x, n.pos.z - e.pos.z) < 90) { n.engage(e, 0.3); n.say(['Patrona saldırı var!', 'Kapıya! Kapıya!', 'Düşman içeride!'], 0.6); }
      }
    }
    // fıskiye fışkırması (hafif titreşim)
    void _v;
  }

  // İç mekân: üç katlı villa içi (villa_interior.js). Kayıt yatağı 1. kattaki ana yatak odasında.
  buildInterior(I, ctx) { return buildVillaInterior(this, I, ctx); }

  // [V2] Güvenlik kamerası televizyonu: salondaki televizyonda villa kapısı/bahçesi canlı. Düşük çözünürlüklü ikinci kamera
  // ayrı hedef dokuya saniyede ~3 kez çizer; yalnız oyuncu zemin kattayken ve televizyona 16 m'den yakınken. Gölge haritası
  // yeniden çizilmez (autoUpdate kapalı), villa ağ grubu çizim süresince görünür yapılır. Ölçüm: ctx.tvStats (çizim başına ms).
  securityCam(ctx, I) {
    const g = this.g, w = this.w, s = ctx.scene;
    const q = g.settings && g.settings.quality;
    const RW = q === 'low' ? 192 : 256, RH = Math.round(RW * 9 / 16);
    const rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, depthBuffer: true });
    const cam = new THREE.PerspectiveCamera(62, RW / RH, 0.3, 700);
    const CAMS = [
      { name: 'KAM 1  ANA KAPI', p: [139.4, 6.4, -816.6], t: [121, 0.5, -782] },
      { name: 'KAM 2  HAVUZ', p: [141.0, 6.8, -843.5], t: [160, 0.5, -826] },
      { name: 'KAM 3  İSKELE', p: [176.0, 4.5, -823.0], t: [214, 0.5, -815] },
    ];
    let ci = 0;
    const aim = () => { const c = CAMS[ci]; cam.position.set(c.p[0], c.p[1], c.p[2]); cam.lookAt(c.t[0], c.t[1], c.t[2]); cam.updateMatrixWorld(true); };
    aim();
    // ekran: hafif yeşil-gri güvenlik kamerası tonu (MeshBasic: ışıktan etkilenmez, ışıma eşiğinin altında)
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.24), new THREE.MeshBasicMaterial({ map: rt.texture, color: 0xb8c4b8 }));
    scr.position.set(-11.83, 2.25, -3.5); scr.rotation.y = Math.PI / 2; s.add(scr);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.34, 2.32), new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.3 }));
    bezel.position.set(-11.87, 2.25, -3.5); s.add(bezel);
    // yazı katmanı: "KAM 1" + zaman damgası + kayıt noktası; saniyede bir güncellenir
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 288;
    const c2 = cv.getContext('2d');
    const ov = new THREE.CanvasTexture(cv); ov.colorSpace = THREE.SRGBColorSpace;
    const ovm = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.24), new THREE.MeshBasicMaterial({ map: ov, transparent: true, depthWrite: false, color: 0xbbbbbb }));
    ovm.position.set(-11.82, 2.25, -3.5); ovm.rotation.y = Math.PI / 2; ovm.renderOrder = 4; s.add(ovm);
    const pad = (n) => (n < 10 ? '0' : '') + n;
    let lastSec = -1;
    const drawOv = () => {
      const e = g.env, sec = Math.floor(((e.time % 1) * 3600) % 60);
      c2.clearRect(0, 0, 512, 288);
      c2.font = 'bold 22px monospace'; c2.fillStyle = '#e8f0e8'; c2.shadowColor = '#000'; c2.shadowBlur = 4;
      c2.fillText(CAMS[ci].name, 16, 32);
      c2.fillText('GÜN ' + pad(e.day || 1) + '  ' + pad(e.hour) + ':' + pad(e.minute) + ':' + pad(sec), 16, 272);
      if (sec % 2 === 0) { c2.fillStyle = '#e02020'; c2.beginPath(); c2.arc(482, 26, 9, 0, 6.283); c2.fill(); }
      c2.fillStyle = '#e8f0e8'; c2.fillText('REC', 410, 34);
      ov.needsUpdate = true;
    };
    drawOv();
    const stats = ctx.tvStats = { n: 0, ms: 0, frames: 0, total: 0 };
    let acc = 1;
    const render = () => {
      const r = g.renderer, t0 = performance.now();
      const vis = w ? w.group.visible : true; if (w) w.group.visible = true;
      const sm = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false;
      const prev = r.getRenderTarget();
      r.setRenderTarget(rt); r.render(g.scene, cam); r.setRenderTarget(prev);
      r.shadowMap.autoUpdate = sm; if (w) w.group.visible = vis;
      stats.n++; stats.ms += performance.now() - t0;
    };
    ctx.dispose = () => { rt.dispose(); ov.dispose(); };
    return {
      next: () => { ci = (ci + 1) % CAMS.length; aim(); acc = 1; drawOv(); },
      update: (dt, floor) => {
        stats.frames++;
        if (floor !== 0) return;
        const p = g.player.pos;
        if (Math.hypot(p.x + 11.8, p.z + 3.5) > 16) return;
        acc += dt;
        if (acc >= 0.34) { acc = 0; render(); } // ~3 Hz: ölçüm 13.7 ms/çizim (yazılımsal) → 30 FPS'te kare başına ≤ 1.3 ms
        const e = g.env, sec = Math.floor(((e.time % 1) * 3600) % 60);
        if (sec !== lastSec) { lastSec = sec; drawOv(); }
        stats.total = stats.ms / Math.max(1, stats.frames);
      },
      render,
    };
  }
}

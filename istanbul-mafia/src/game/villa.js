// [villa] Oyuncunun malikânesi — oyun mantığı: sahiplik, otomatik kapı, galeri araçları, helikopterler, iskeledeki tekne,
// 8 koruma (kapı 2, çevre 4 devriye, bina 2), karşılama ve savunma, iç mekân (salon, yatak odası = kayıt, gardırop, ofis).
// Sahiplik kararı: villa oyunun BAŞINDAN oyuncunundur. Sahibinin isteği "villamız olsun"; hikâyenin uzun ilk perdesi
// boyunca ulaşılamayan bir ödül olarak saklamak, istenen deneyimi (ev, arabalar, helikopterler) saatlerce erteler.
// Güvenli ev gibi çalışır: içeri girince otomatik kayıt (building.ownedProp), yatakta uyu = kayıt, gardırop, cephanelik.
import * as THREE from 'three';
import { PLAYER_VILLA as V } from '../world/map.js';
import { RNG } from '../core/util.js';
import { randomLook } from '../entities/character.js';
import { marbleTexture, wallpaperTexture, woodTexture } from '../core/textures.js';
import { Kit } from './interior_kit.js';
import { sofa, bedDouble } from './home_interior.js';

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

  // İç mekân: salon (kanepeler, TV, şömine, avize), yatak odası (çift kişilik yatak = kayıt), giyinme odası (gardırop),
  // ofis (masa, kitaplık, kasa = cephanelik), üst katlara merdiven, denize bakan geniş cam (gece sıcak ışık).
  buildInterior(I, ctx) {
    const g = this.g;
    const W = 24, D = 16, Hh = 4.2;
    I.room(ctx, W, D, Hh, new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.25 }), new THREE.MeshStandardMaterial({ map: wallpaperTexture('#efe8da', '#e2d8c4') }), 0xf6f2ea);
    const K = new Kit(I, ctx);
    const wall = (x0, z0, x1, z1) => K.box(x1 - x0, Hh, z1 - z0, (x0 + x1) / 2, 0, (z0 + z1) / 2, 0xece5d6, { col: true, rough: 0.9 });
    // bölmeler: yatak odası (doğu-kuzey), ofis (batı-güney)
    wall(4, -8, 4.2, -1.8); wall(4, 1.4, 4.2, 2); wall(4, 2, 12, 2.2);
    wall(-12, 2, -7.2, 2.2); wall(-4.8, 2, -4.6, 8);
    // deniz manzaralı cam duvar (kuzey) ve doğu pencereleri: gün ışığı / gece kenti
    for (let x = -11; x <= 11; x += 2.75) { K.emis(2.4, 2.9, 0.04, x, 0.6, -7.97, 0x9cc8e8); K.box(0.18, Hh, 0.12, x + 1.37, 0, -7.92, 0x2a2a2a, { metal: 0.6 }); }
    for (const z of [-5.5, -2.5]) K.emis(0.04, 2.6, 2.2, 11.97, 0.8, z, 0x9cc8e8);
    // salon
    const seats = [];
    seats.push(...sofa(K, -3, -2.2, Math.PI, 0xe8e2d4, 3));
    seats.push(...sofa(K, -7.4, -4.6, Math.PI / 2, 0xe8e2d4, 2));
    seats.push(...sofa(K, 1.4, -4.6, -Math.PI / 2, 0x2c3440, 1));
    K.box(1.8, 0.4, 0.9, -3, 0, -4.4, 0x1c1c1c, { col: true, rough: 0.15, metal: 0.4 }); // sehpa
    K.box(3.4, 0.5, 0.5, -3, 0, -7.6, 0x2a1c12, { col: true, uv: 'wood' }); K.box(2.6, 1.5, 0.06, -3, 1.2, -7.75, 0x050608, { rough: 0.1 }); // TV ünitesi
    K.box(2.2, 1.3, 0.7, -10.8, 0, -4.6, 0xd8d0c0, { col: true, rot: Math.PI / 2 }); K.emis(1.0, 0.5, 0.05, -10.43, 0.2, -4.6, 0xff8a30, Math.PI / 2); // şömine
    K.box(4.2, 0.02, 3.0, -4, 0.005, -4.2, 0x5a4a3a, { rough: 1 }); // halı
    // yatak odası
    bedDouble(K, 8, -5.6, 0, 0xe9e4d8);
    for (const x of [6.4, 9.6]) K.box(0.5, 0.55, 0.45, x, 0, -6.9, 0x3a2a1c, { col: true, uv: 'wood' });
    // giyinme odası (gardırop duvarı)
    for (let z = -7.2; z <= -2.6; z += 1.15) { K.box(0.62, 2.5, 1.1, 11.6, 0, z, 0x3a2a1c, { col: true, uv: 'wood' }); K.box(0.02, 2.3, 0.04, 11.28, 0.1, z, 0xc8a050, { metal: 0.9, rough: 0.2 }); }
    // ofis: masa, koltuk, kitaplık, kasa
    K.box(2.2, 0.76, 1.0, -8.8, 0, 5.2, 0x2a1a10, { col: true, uv: 'wood' }); K.emis(0.6, 0.38, 0.03, -8.8, 0.78, 5.0, 0x9ad0ff);
    K.box(0.7, 1.15, 0.7, -8.8, 0, 6.3, 0x111111, { col: true, rough: 0.5 });
    for (let i = 0; i < 4; i++) K.box(0.4, 3.2, 1.8, -11.75, 0, 3.0 + i * 1.2, 0x3a2a1c, { col: true, uv: 'wood' });
    K.box(0.9, 1.3, 0.8, -5.6, 0, 7.4, 0x2a2e33, { col: true, metal: 0.7, rough: 0.35 }); // kasa
    // merdiven (üst katlara; görsel + çarpışma)
    for (let k = 0; k < 10; k++) K.box(1.6, 0.21 * (k + 1), 0.32, 10.8, 0, 7.6 - k * 0.32, 0xd8d0c0, { col: true });
    K.box(0.06, 1.0, 3.3, 9.95, 0.3, 6.1, 0xb9b9b9, { metal: 0.9 });
    K.finish();
    ctx.furnSeats = ctx.furnSeats || []; void seats;
    I.chandelier(ctx, -3, -3.5, Hh, 1.1);
    I.light(ctx, -3, Hh - 0.3, -3.5, 0xffd9a8, 9, 16);
    I.light(ctx, 8, Hh - 0.3, -4.5, 0xffd2a0, 6, 10);
    I.light(ctx, -8.5, Hh - 0.3, 5, 0xffe0b0, 5, 9);
    ctx.peaceful = true;
    ctx.interact.push({ x: 8, z: -3.9, r: 1.6, label: 'Uyu ve Oyunu Kaydet', action: () => g.sleepAndSave() });
    ctx.interact.push({ x: 10.6, z: -4.9, r: 1.6, label: 'Gardırop (kıyafet değiştir)', action: () => g.ui.openShop('wardrobe') });
    ctx.interact.push({ x: -5.6, z: 6.6, r: 1.4, label: 'Kasa ve cephanelik (cephane doldur ₺)', action: () => g.ui.openShop('stash') });
    ctx.interact.push({ x: -8.8, z: 4.4, r: 1.4, label: 'Ofis masası (telefon)', action: () => g.phone && g.phone.open ? g.phone.open() : g.ui.notify('Ofis: işler yolunda, patron.', 'good') });
    void woodTexture;
    return { x: 0, z: D / 2 - 1.6 };
  }
}

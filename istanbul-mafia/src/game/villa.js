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
import { VillaGlass } from './villa_glass.js'; // [V3]
import { gateMotor } from '../core/sfx/world.js'; // [V3]
import { prerenderLines } from '../core/sfx/announce.js'; // [V3]

export const VILLA_CARS = [['gt', '#a80d12'], ['gt', '#121212'], ['coupe', '#e9e9e6'], ['cabrio', '#1d3a7a']];
const GATE_PT = { x: V.gate.x, z: V.z1 };
// [V3] iç mekân çerçevesi → dünya: iç (0,0,0) = dünya (122, 0, -826); kapı +z her ikisinde de güneye bakar
export const VILLA_OFF = new THREE.Vector3(122, 0, -826);
export const TERRACE = { x: 133.4, y: 8.1, z: -828, h: Math.PI / 2 }; // dünyadaki teras kapısının önü (doğuya, denize bakar)
const GREET = 'Hoş geldin patron';
const INSIDE_POSTS = [[-2.6, 6.6, Math.PI], [3.2, 2.0, -Math.PI / 2]]; // giriş holü, merdiven başı (iç mekân çerçevesi)
// [V3] fener: gövde + cam (parlak) + koni (eklemeli saydam); paylaşılan geometri/malzeme
let TORCH = null;
function torchMesh() {
  if (!TORCH) {
    const body = new THREE.CylinderGeometry(0.022, 0.026, 0.2, 8).rotateX(Math.PI / 2); body.userData.shared = true;
    const lens = new THREE.CircleGeometry(0.024, 10).translate(0, 0, 0.101); lens.userData.shared = true;
    const cone = new THREE.ConeGeometry(1.6, 9, 14, 1, true).translate(0, -4.5, 0).rotateX(-Math.PI / 2).translate(0, 0, 0.1); cone.userData.shared = true;
    TORCH = { body, lens, cone,
      mb: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.7 }),
      ml: new THREE.MeshBasicMaterial({ color: 0xfff4d8 }),
      mc: new THREE.MeshBasicMaterial({ color: 0xffeccc, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }) };
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(TORCH.body, TORCH.mb)); g.add(new THREE.Mesh(TORCH.lens, TORCH.ml));
  const c = new THREE.Mesh(TORCH.cone, TORCH.mc); c.renderOrder = 5; g.add(c);
  g.rotation.set(Math.PI / 2, 0, 0); // tabanca gibi: yuvanın -y ekseni (parmak yönü) ileri
  g.name = 'villaTorch';
  return g;
}

export class VillaGame {
  constructor(game) {
    this.g = game;
    this.w = game.city.playerVilla;
    this.guards = []; this.cars = []; this.helis = []; this.boat = null;
    this.glass = new VillaGlass(game); this.off = VILLA_OFF; // [V3]
    this.gateOpen = 0; this.gateBox = null; this.inside = false; this.scanT = 0;
    const L = this.w ? this.w.layout : null;
    if (!L) return;
    // bina: kapı + iç mekân kurucusu (interiors.js [villa] kancası) + harita iğnesi (ownedProp → "Mülkün")
    const self = this;
    this.building = {
      id: 'playerVilla', type: 'villa_player', name: 'Villan', ownedProp: true, villaPlayer: true,
      door: { x: L.house.door.x, z: L.house.door.z, nx: 0, nz: 1 },
      build(ctx) { return self.buildInterior(this, ctx); },
      // [V3] canlı iç mekân: küp görüntü yok; şehir aynı karede dünya kamerasıyla pencerelerin arkasına çizilir (liveRender).
      // Kalıcı: sahne bir kez (yükleme ekranında, warm) kurulur, girişte yeniden kullanılır (ilk giriş donması).
      live: true, persist: true,
    };
    this.frontDoor = { x: L.house.door.x, z: L.house.door.z + 0.9, building: this.building };
    game.city.doors.push(this.frontDoor);
    // [V3] dünyadaki teras kapısı (1. katın çatı terası, y 8,1): içeri girer, iç mekândan "Terasa çık" buraya çıkarır
    this.terraceDoor = { x: TERRACE.x, z: TERRACE.z, y: TERRACE.y, building: this.building, terrace: true };
    if (game.worldInteract) game.worldInteract.push({ x: TERRACE.x - 0.9, y: TERRACE.y, z: TERRACE.z, r: 1.4, label: 'Gir: Villan (teras kapısı)', action: () => game.interiors.enter(this.terraceDoor) });
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
    this.warmPlayer();
    // [V3] selam sesi önceden örneklenir (ilk selamda takılma olmasın)
    const A = g.audio;
    if (A && A.ctx && !this.greetWarm) { this.greetWarm = true; const job = () => prerenderLines(A, [GREET], 'dry'); if (A._prewarm) { A._prewarm.push(job); if (A._prewarmStep) A._prewarmStep(); } else setTimeout(job, 0); }
  }

  // [V3] Yeni oyun/kayıt yüklemesinde (geçiş ekranı açıkken): iç mekânı bu oyuncu gövdesiyle derle ve güvenlik kamerasını bir kez çiz.
  // Ölçüm: oyuncu gövdesi iç mekân ışıklarıyla ilk girişte ~1,4 sn derleniyordu; televizyonun ilk çizimi ~4,5 sn (yazılımsal).
  warmPlayer() {
    const g = this.g, ctx = this.building && this.building._ctx;
    if (!ctx || !g.player || !g.renderer) return;
    const t0 = performance.now();
    const root = g.player.model && g.player.model.root, par = root && root.parent;
    try {
      g.setActiveScene(ctx.scene); if (root) ctx.scene.add(root);
      // içerideki korumalar da (gövde, giysi, tabanca malzemeleri iç mekân ışıklarıyla) derlensin: geçici kur, derle, kaldır.
      // Görünüşleri sabit (insideLooks) → girişte kurulan yeni gövdeler aynı gölgelendiricileri kullanır.
      this.insideLooks = [this.guardLook(), this.guardLook()];
      g.npcs.stash(ctx.npcGroup); this.spawnInsideGuards(ctx);
      g.renderer.compile(ctx.scene, g.camera);
      // gerçek ilk kareyi taklit et: iç mekân + arkadaki şehir (bina gövdesi gizli) dört yöne ve teras katından, çok küçük çözünürlükte
      // çizilir. Ölçüm: yalnız compile ile ilk girişte hâlâ 24 yeni gölgelendirici (şehrin binanın arkasında kalan malzemeleri) derleniyordu.
      const r = g.renderer, cam = g.camera, sp = cam.position.clone(), sq = cam.quaternion.clone(), pr = r.getPixelRatio(), pin = g.player.inInterior;
      g.player.inInterior = ctx; this.installLive();
      r.setPixelRatio(0.1); g.composer.setPixelRatio(0.1);
      for (const [x, y, z, yaw] of [[0, 1.7, 5, 0], [0, 1.7, 5, Math.PI / 2], [0, 1.7, 5, Math.PI], [0, 1.7, 5, -Math.PI / 2], [2, 10, -3, -Math.PI / 2], [2, 10, -3, Math.PI]]) {
        cam.position.set(x, y, z); cam.rotation.set(-0.1, yaw, 0); cam.updateMatrixWorld(); g.composer.render();
      }
      r.setPixelRatio(pr); g.composer.setPixelRatio(pr);
      cam.position.copy(sp); cam.quaternion.copy(sq); cam.updateMatrixWorld(); g.player.inInterior = pin;
      g.npcs.unstash();
      if (ctx.tvRender) ctx.tvRender();
    } catch (e) { console.warn('villa ısıtma', e); if (g.npcs.saved) g.npcs.unstash(); }
    if (root && par) par.add(root);
    g.setActiveScene(g.scene);
    this.warmPlayerMs = Math.round(performance.now() - t0);
  }

  // [V3] Korumalar: kapıda 2 (AK), bahçede devriye 2, binanın içinde 2 (girişte iç mekâna yerleşir). Ölen koruma 3 dk sonra
  // bekçi kulübesinden yenisiyle değişir. Gece fenerli (elde fener + ışık konisi; sahneye ışık eklenmez → gölgelendirici sabit).
  spawnGuards() {
    const g = this.g;
    for (const n of this.guards) if (!n.dead) g.npcs.remove(n);
    this.guards = [];
    this.rng = new RNG(1907);
    const P = (pts) => pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.posts = [
      { x: 119.4, z: -776.2, h: 0, w: 'ak', gate: true }, { x: 124.6, z: -776.2, h: 0, w: 'ak', gate: true }, // kapı
      { x: 87, z: -790, h: 0, w: 'uzi', patrol: P([[87, -790], [87, -862], [170, -862.5], [87, -862], [87, -790]]) }, // batı + kuzey (pistler)
      { x: 150, z: -790, h: 0, w: 'uzi', patrol: P([[150, -790], [173, -790], [173, -811], [143, -811], [100, -806], [100, -845], [100, -806], [143, -811]]) }, // deniz yanı + bina çevresi
    ];
    this.posts.forEach((_, i) => this.postGuard(i));
  }
  guardLook() {
    return Object.assign(randomLook(this.rng, 'gang'), {
      top: 'suit', topColor: '#141416', shirtColor: '#e8e8ea', tieColor: '#111111', pants: 'slacks', pantsColor: '#141416',
      shoes: 'polished', shoesColor: '#0a0a0a', hat: 'none', glasses: true, glassesStyle: 'aviator', chain: false, tespih: false, carry: null,
    });
  }
  postGuard(i, from) {
    const g = this.g, o = this.posts[i], at = from || o;
    const n = g.npcs.add('gang', at.x, at.z, this.guardLook(), {
      gang: 'family', ally: true, persistent: true, name: 'Koruma', weapon: o.w, hp: 240, heading: o.h,
      state: o.patrol ? 'patrol' : 'guard', baseState: o.patrol ? 'patrol' : 'guard', patrol: o.patrol || null, home: o.patrol ? null : new THREE.Vector3(o.x, 0, o.z),
    });
    n.armor = 60; n.villaGuard = true; n.greetT = 0; n.post = i; n.gateGuard = !!o.gate; n.faceYaw = o.h;
    this.guards[i] = n;
    return n;
  }
  // içerideki iki koruma: giriş holünde ve merdiven başında (iç mekân her girişte yeniden doldurulur; şehir NPC'leri o sırada saklıdır)
  // İçerideki iki koruma kalıcıdır: bir kez kurulur (yükleme ekranında), her girişte iç listeye yeniden eklenir (gövde yeniden kurulmaz).
  // Ölen koruma 3 dk sonra yenisiyle değişir (yeni gövde giriş karesinde değil, sonraki karede kurulur).
  spawnInsideGuards(ctx, only) {
    const g = this.g, I = g.interiors, N = this.insideNPCs || (this.insideNPCs = []);
    const looks = this.insideLooks || (this.insideLooks = [this.guardLook(), this.guardLook()]);
    for (const [k, [x, z, h]] of INSIDE_POSTS.entries()) {
      if (only !== undefined && k !== only) continue;
      let n = N[k];
      if (n && n.dead) { if (!n.diedAt) n.diedAt = this.t || 0; if ((this.t || 0) - n.diedAt < 180) continue; n = N[k] = null; }
      if (n) { // yeniden kullan
        n.pos.set(x, 0, z); n.heading = h; n.faceYaw = h; n.state = 'guard'; n.target = null; n.path = []; n.cur = null; n.inInterior = ctx;
        if (g.npcs.list.indexOf(n) < 0) { g.npcs.list.push(n); g.npcs.group.add(n.model.root); }
        n.sync();
        continue;
      }
      if (only === undefined && g.interiors.current === ctx) { this.insidePending = (this.insidePending || 0) + 1; continue; }
      n = N[k] = I.npc(ctx, 'guard', x, z, h, { look: { ...looks[k] }, ally: true, gang: 'family', name: 'Koruma', weapon: 'pistol', hp: 240 });
      n.villaGuard = true; n.armor = 60; n.static = false;
    }
  }

  // [V3] Yükleme ekranında: iç mekânı kur, gölgelendiricilerini (oyuncu gövdesi, savaş efektleri dahil) derle, canlı çizimi tak.
  // Ölçüm (villaenter-steps): ilk giriş 5,3 sn donuyordu — 4,9 sn küp görüntünün ilk yüzleri (şehir 6 yöne ilk kez çizilir,
  // yeni malzeme/gölgelendiriciler), ~0,75 sn iç mekân gölgelendirici derlemesi, 0,2 sn kurulum.
  warm() {
    const g = this.g;
    if (!this.w || this.building._ctx) return;
    const t0 = performance.now();
    const ctx = g.interiors.prepare(this.frontDoor);
    this.installLive();
    try {
      const p = g.player, root = p && p.model && p.model.root, par = root && root.parent;
      g.setActiveScene(ctx.scene); if (root) ctx.scene.add(root);
      g.renderer.compile(ctx.scene, g.camera);
      if (root && par) par.add(root);
      g.setActiveScene(g.scene);
    } catch (e) { console.warn('villa ısıtma', e); g.setActiveScene(g.scene); }
    this.warmMs = Math.round(performance.now() - t0);
  }

  // [V3] Girişte: kapıya göre doğma noktası, içerideki korumalar
  onEnter(ctx, door) {
    ctx.door = this.frontDoor; // "Dışarı çık" her zaman ön kapıdan
    this.insidePending = 0;
    this.spawnInsideGuards(ctx);
    if (!ctx.v3upd) { ctx.v3upd = true; const u = ctx.update; ctx.update = (dt, t) => { if (u) u(dt, t); if (this.insidePending > 0) { this.insidePending--; for (let k = 0; k < 2; k++) if (!this.insideNPCs[k]) { this.spawnInsideGuards(ctx, k); break; } } }; }
    if (door && door.terrace) return { x: 2.6, y: 8.4, z: -3.1, h: -Math.PI / 2 }; // iç taraf: teras cam kapısının önü (2. kat)
    return null;
  }

  // [V3] Canlı dış görünüm: villa içindeyken çizim geçişi önce ŞEHRİ aynı kamerayla (dünyaya kaydırılmış) çizer — bina gövdesi gizli —,
  // sonra derinliği temizleyip iç mekânı üstüne çizer. Pencereler ve teras gerçekten dünyaya açılır: trafik, deniz, gemiler,
  // gün saati ve hava canlıdır; küp yakalama ve onun ilk-giriş donması yoktur. Ek maliyet: dışarıdaki tek şehir çizimi kadar.
  installLive() {
    const g = this.g, rp = g.renderPass, self = this;
    if (!rp || rp.__v3) return;
    rp.__v3 = true;
    const orig = rp.render.bind(rp);
    rp.render = function (r, wb, rb, dt, mask) {
      const ctx = g.player && g.player.inInterior;
      if (!ctx || !ctx.worldOff || rp.scene !== ctx.scene) return orig(r, wb, rb, dt, mask);
      const cam = rp.camera, o = ctx.worldOff, w = self.w;
      const gv = w.group.visible, hv = w.house.visible;
      w.group.visible = true; w.house.visible = false;
      cam.position.add(o); cam.updateMatrixWorld();
      rp.scene = g.scene;
      try { orig(r, wb, rb, dt, mask); } finally {
        rp.scene = ctx.scene;
        cam.position.sub(o); cam.updateMatrixWorld();
        w.group.visible = gv; w.house.visible = hv;
      }
      const ac = r.autoClear; r.autoClear = false;
      r.setRenderTarget(rp.renderToScreen ? null : rb);
      r.clearDepth();
      r.render(ctx.scene, cam);
      r.autoClear = ac;
    };
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
    this.t = (this.t || 0) + dt;
    const p = g.player, pp = p.vehicle ? p.vehicle.pos : p.pos;
    // uzaktayken ucuz: ağ grubu görünmez, kapı ve korumalar hesaplanmaz
    const cam = g.camera.position;
    w.group.visible = !p.inInterior && Math.hypot(cam.x - V.cx, cam.z - V.cz) < 950;
    const near = !p.inInterior && Math.hypot(pp.x - V.cx, pp.z - V.cz) < 180;
    // [V3] otomatik kapı: patron araçla 18 m'ye (yaya 10 m) gelince kapı korumasının selamıyla açılır (1,6 sn), geçince kapanır.
    // Kabul: araçla 8 m'de kapı açık (çarpışma kutusu kalkmış).
    const dG = Math.hypot(pp.x - GATE_PT.x, pp.z - GATE_PT.z);
    let want = !p.inInterior && dG < (p.vehicle ? 18 : 10) ? 1 : 0;
    for (const n of this.guards) if (n && !n.dead && n.state === 'attack' && n.target && !n.target.dead && Math.hypot(n.target.pos.x - GATE_PT.x, n.target.pos.z - GATE_PT.z) < 25) want = 0; // çatışmada kapı kapalı
    const sp = dt / 1.6, was = this.gateOpen;
    this.gateOpen = want ? Math.min(1, this.gateOpen + sp) : Math.max(0, this.gateOpen - sp);
    if ((was === 0 && this.gateOpen > 0) || (was === 1 && this.gateOpen < 1)) { try { gateMotor(g.audio, GATE_PT.x, GATE_PT.z); } catch (e) { /* ses yok */ } }
    w.gate.position.x = w.gateX0 - this.gateOpen * 7.4;
    if (this.gateOpen > 0.02 && this.gateBox) { w.cols.remove(this.gateBox); this.gateBox = null; }
    if (this.gateOpen <= 0.02 && !this.gateBox) this.closeGate();
    this.updateGuards(dt, p, pp, dG, near);
    if (!near) { this.inside = false; return; }
    // parsele giriş: konum afişi
    const inside = pp.x > V.x0 && pp.x < V.x1 && pp.z > V.z0 && pp.z < V.z1;
    if (inside && !this.inside && g.ui.locationBanner) g.ui.locationBanner('Villan  ·  Boğaz');
    this.inside = inside;
  }

  updateGuards(dt, p, pp, dG, near) {
    const g = this.g;
    // ölen koruma 3 dk sonra bekçi kulübesinden gelen yenisiyle değişir (oyuncu içerideyken bekler)
    for (let i = 0; i < this.guards.length; i++) {
      const n = this.guards[i];
      if (!n || !n.dead) continue;
      if (!n.diedAt) n.diedAt = this.t;
      if (this.t - n.diedAt > 180 && !p.inInterior) { this.postGuard(i, { x: 129.8, z: -778.4 }); this.respawns = (this.respawns || 0) + 1; }
    }
    const night = g.env && g.env.nightFactor > 0.45;
    for (const n of this.guards) {
      if (!n || n.dead) continue;
      this.torch(n, night && !p.inInterior && near && n.state !== 'attack' && !n.downed);
      if (n.waveT > 0) n.waveT -= dt;
    }
    if (p.inInterior) return;
    // selam: patron yaklaşınca (araçla 30 m, yaya 7 m) kapı koruması döner, el sallar: "Hoş geldin patron" (yazı + ses)
    this.greetCd = (this.greetCd || 0) - dt;
    if (this.greetCd <= 0 && dG < (p.vehicle ? 30 : 7) && pp.z > V.z1 - 4) {
      let best = null, bd = 1e9;
      for (const n of this.guards) if (n && !n.dead && n.gateGuard && !n.target) { const d = Math.hypot(n.pos.x - pp.x, n.pos.z - pp.z); if (d < bd) { bd = d; best = n; } }
      if (best) { this.greet(best, pp); this.greetCd = 60; }
    }
    for (const n of this.guards) {
      if (!n || n.dead || n.target || n.greetT > 0 || p.vehicle) { if (n) n.greetT -= dt; continue; }
      if (Math.hypot(n.pos.x - pp.x, n.pos.z - pp.z) < 5) { this.greet(n, pp); n.greetT = 45; }
    }
    if (!near) return;
    // savunma: parsele (+25 m) giren ve patrona/korumalara/villaya ateş eden kim olursa (kolluk hariç) korumalar siper alıp karşılık verir
    this.scanT = (this.scanT || 0) - dt;
    this.alertT = Math.max(0, (this.alertT || 0) - dt);
    if (this.scanT <= 0) {
      this.scanT = 0.4;
      for (const e of g.npcs.list) {
        if (e.dead || e.ally || e.villaGuard || e.faction === 'police' || e.faction === 'military') continue;
        if (e.pos.x < V.x0 - 25 || e.pos.x > V.x1 + 25 || e.pos.z < V.z0 - 25 || e.pos.z > V.z1 + 25) continue;
        const t = e.target;
        const attacking = e.hostile || (e.state === 'attack' && t && (t.isPlayer || t.ally || t.villaGuard)) || (e.provokedT > 0 && t && t.isPlayer) || (e.lawT > 0 && e.faction === 'gang');
        if (!attacking) continue;
        if (!this.alertT) this.alertAt = this.t;
        this.alertT = 20;
        for (const n of this.guards) if (n && !n.dead && !n.downed && n.target !== e && (!n.target || n.target.dead) && Math.hypot(n.pos.x - e.pos.x, n.pos.z - e.pos.z) < 110) {
          n.engage(e, 0.3); n.barkT = 0; n.say(['Patrona saldırı var!', 'Kapıya! Kapıya!', 'Düşman içeride!', 'Siper alın!'], 0.8);
          if (!this.engagedAt) this.engagedAt = this.t;
        }
      }
    }
    // alarm sürerken boştaki korumalar patronun yanına gelir (yaya ve parseldeyken); alarm bitince yerlerine döner
    for (const n of this.guards) {
      if (!n || n.dead || n.downed || (n.state === 'attack' && n.target && !n.target.dead)) continue;
      if (this.alertT > 0 && !p.vehicle && this.inside) { if (n.state !== 'follow') { n.state = 'follow'; n.leader = p; n.side = n.post % 2 ? 1 : -1; } }
      else if (n.state === 'follow' || (n.state === 'attack' && (!n.target || n.target.dead))) { n.state = n.restState(); n.target = null; n.leader = null; }
    }
  }

  // el sallama + selam (konuşma balonu ve kısa sentez ses; ses ön örneklenir)
  greet(n, pp) {
    n.faceYaw = Math.atan2(pp.x - n.pos.x, pp.z - n.pos.z); n.heading = n.faceYaw; n.waveT = 2.6; n.greetT = 45;
    n.barkT = 0; n.say(['Hoş geldin patron', 'Hoş geldin patron!', 'Hoş geldin patron, her şey yolunda.'], 1);
    const A = this.g.audio;
    try { if (A && A.voice) A.voice(GREET, n.pos.x, n.pos.z, { mega: false, pitch: 108, rate: 1 }); } catch (e) { /* ses yok */ }
    this.greets = (this.greets || 0) + 1;
  }

  // gece feneri: sol elde küçük fener + toplu ışık konisi (yalnız görüntü; ışık sayısı sabit)
  torch(n, on) {
    const arm = n.model && n.model.arms && n.model.arms[0];
    if (!arm) return;
    if (on && !n.torch) n.torch = torchMesh();
    if (!n.torch) return;
    if (on && n.torch.parent !== arm.socket) arm.socket.add(n.torch);
    n.torch.visible = on;
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
    let acc = 0; // [V3] ilk çizim girişten 0,34 sn sonra (giriş karesine binmesin)
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

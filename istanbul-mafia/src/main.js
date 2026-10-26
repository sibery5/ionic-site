// İSTANBUL MAFYA — ana oyun sınıfı ve döngü
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { addPostFX } from './world/postfx.js';
import { Input } from './core/input.js';
import { audio } from './core/audio.js';
import { Particles } from './core/particles.js';
import { CityMap, districtAt, LANDMARKS } from './world/map.js';
import { Physics } from './world/physics.js';
import { City, buildBridgesAndIsland } from './world/city.js';
import { landmarkDoors, buildLandmark } from './world/landmarks.js';
import { Environment } from './world/sky.js';
import { Animals } from './world/animals.js';
import { Player } from './entities/player.js';
import { CharacterModel, defaultLook } from './entities/character.js';
import { NPCManager } from './entities/npc.js';
import { VehicleManager } from './entities/vehicles.js';
import { TrafficLights } from './world/traffic.js';
import { ShipTraffic } from './world/ships.js';
import { BoatManager, nearestWaterSpot } from './entities/boats.js';
import { AircraftManager } from './entities/aircraft.js';
import * as MAPDATA from './world/map.js';
import { Combat } from './game/combat.js';
import { Pickups } from './game/pickups.js';
import { Wanted } from './game/wanted.js';
import { Missions } from './game/missions.js';
import { Interiors, placeName } from './game/interiors.js';
import { WEAPONS } from './game/weapons.js';
import { BUSINESSES, GANGS, rollPrices, lifeStateDefaults, ensureLifeState, garageCapacity } from './game/economy.js';
import { Life } from './game/life.js';
import { SETTINGS_DEFAULTS, applyExtendedSettings } from './ui/settings.js';
import { writeSave, readSave, loadSettings, storeSettings } from './game/save.js';
import { UI, goodsCount } from './ui/ui.js';
import { formatMoney, clamp } from './core/util.js';

const DEFAULT_SETTINGS = {
  quality: 'medium', shadows: true, bloom: true, drawDistance: 1400, fov: 68, sensitivity: 1, invertY: false,
  volMaster: 0.8, volSfx: 0.9, volMusic: 0.5, showFps: false, fullscreen: true,
  ...SETTINGS_DEFAULTS,
};

class Game {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS, ...(loadSettings() || {}) };
    this.mode = 'loading';
    this.dt = 0;
    this.fps = 60;
    this.gpsPath = null;
    this.waypoint = null;
    this.worldInteract = [];
    this.state = null;
  }

  async init() {
    const canvas = document.getElementById('game');
    const q = this.settings.quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'high' ? 2 : 1));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = this.settings.shadows && q !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, innerWidth / innerHeight, 0.15, 5000);
    this.active = this.scene;
    this.input = new Input(canvas);
    this.ui = new UI(this);
    this.ui.showLoading();
    const step = async (p, t) => { this.ui.setLoading(p, t); await new Promise((r) => setTimeout(r, 30)); };

    await step(0.02, 'İstanbul haritası çiziliyor...');
    this.map = new CityMap(1453);
    this.physics = new Physics(this.map);
    this.uniforms = { uNight: { value: 0 } };
    await step(0.08, 'Sokaklar döşeniyor...');
    this.city = new City(this.scene, this.map, this.physics, this.uniforms, q);
    this.city.buildGround(); await step(0.25, 'Boğaz suyu dolduruluyor...');
    this.city.buildWater(); this.city.buildShores(); await step(0.35, `${this.map.buildings.length} bina inşa ediliyor...`);
    this.city.buildBuildings(); await step(0.55, 'Sokak lambaları, ağaçlar, banklar...');
    this.city.buildStreetProps(); await step(0.65, 'Galata, Sultanahmet, Ayasofya, Dolmabahçe...');
    for (const b of this.map.landmarkBlocks) {
      const g = buildLandmark(b.landmark, b, this.physics.city, this.uniforms);
      if (g) { this.city.group.add(g); if (g.userData.flag) this.flag = g.userData.flag; }
    }
    buildBridgesAndIsland(this.city.group, this.physics.city, this.uniforms);
    this.city.buildParks();
    // simge yapı kapıları
    for (const d of landmarkDoors) this.city.doors.push({ x: d.x, z: d.z, building: { id: 'lm-' + d.name, type: d.type, name: d.name, door: { x: d.x, z: d.z, nz: 1 } } });
    this.setupGalataTop();
    await step(0.8, 'Gökyüzü ve hava durumu...');
    this.env = new Environment(this.scene, this.renderer, q);
    this.env.onNewDay = (d) => this.onNewDay(d);
    this.particles = new Particles(this.scene);
    this.combat = new Combat(this);
    this.vehicles = new VehicleManager(this);
    this.traffic = new TrafficLights(this);
    this.boats = new BoatManager(this);
    this.aircraft = new AircraftManager(this);
    this.ships = new ShipTraffic(this);
    this.npcs = new NPCManager(this);
    this.pickups = new Pickups(this);
    this.wanted = new Wanted(this);
    this.interiors = new Interiors(this);
    this.missions = new Missions(this);
    this.life = new Life(this);
    await step(0.9, 'Martılar ve sokak kedileri salınıyor...');
    this.animals = new Animals(this);
    this.audio = audio;
    // postprocess
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.6, 0.88);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    // renk düzenleme + (yüksek kalitede) GTAO ortam kapatma
    this.postfx = addPostFX(this.composer, this.renderer, this.scene, this.camera, { quality: q });
    this.grade = this.postfx.grade;
    this.deathSat = 1;
    if (this.city.updateCamera) this.city.updateCamera(this.camera);
    this.env.onLightning = (x, z, dist) => { setTimeout(() => audio.explosion && audio.explosion(x, z, 0.6), Math.min(4000, (dist || 300) * 3)); };
    this.applySettings();
    window.addEventListener('resize', () => this.onResize());
    // ilk derleme
    this.env.time = 18.3; this.env.update(0.01, new THREE.Vector3(-110, 0, 10));
    this.uniforms.uNight.value = this.env.nightFactor;
    await step(1, 'Hazır!');
    this.renderer.compile(this.scene, this.camera);
    this.ui.hideLoading();
    this.mode = 'menu';
    this.player = new Player(this, defaultLook());
    this.player.model.root.visible = false;
    this.setupCreatorScene();
    this.ui.mainMenu();
    const startAudio = () => { audio.init(); this.applySettings(); audio.startMusic('menu'); };
    window.addEventListener('pointerdown', startAudio, { once: true });
    window.addEventListener('keydown', startAudio, { once: true });
    window.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.mode === 'playing' && !this.ui.blocking() && !this.suppressPause) this.pause();
    });
    canvas.addEventListener('click', () => { if (this.mode === 'playing' && !this.ui.blocking()) this.input.lock(); });
    this.last = performance.now();
    this.fpsAcc = 0; this.fpsN = 0;
    window.__ready = true;
    requestAnimationFrame(() => this.loop());
  }

  setupGalataTop() {
    const lm = this.map.landmarkBlocks.find((b) => b.landmark === 'galata');
    if (!lm) return;
    const cx = lm.cx, cz = lm.cz, R = 6.5;
    this.galata = { cx, cz, R };
    // gövde çarpışmasını daire yaklaşımıyla yeniden kur (üst teras yürünebilir)
    this.physics.city.boxes.forEach((b) => { if (b.tag === 'galata') { b.y1 = -100; b.y0 = -101; } });
    this.physics.city.add(cx - R, cz - R * 0.4, cx + R, cz + R * 0.4, 0, 46, 'galataB');
    this.physics.city.add(cx - R * 0.4, cz - R, cx + R * 0.4, cz + R, 0, 46, 'galataB');
    this.physics.city.add(cx - R * 0.72, cz - R * 0.72, cx + R * 0.72, cz + R * 0.72, 0, 46, 'galataB');
    this.physics.city.add(cx - R * 0.55, cz - R * 0.55, cx + R * 0.55, cz + R * 0.55, 47.1, 66, 'galataT');
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const x = cx + Math.cos(a) * (R + 0.4), z = cz + Math.sin(a) * (R + 0.4);
      this.physics.city.add(x - 0.9, z - 0.9, x + 0.9, z + 0.9, 46, 47.1, 'galataRing');
    }
    this.worldInteract.push({ x: cx, z: cz + R * 0.55 + 0.9, y: 47.1, r: 1.5, label: 'Asansörle aşağı in', action: () => this.leaveGalataTop() });
  }
  goGalataTop() {
    if (!this.galata) return;
    if (this.state.money < 50) return this.ui.notify('Bilet ₺50', 'warn');
    this.state.money -= 50;
    this.interiors.exit();
    const { cx, cz, R } = this.galata;
    this.player.pos.set(cx, 47.2, cz + R * 0.55 + 1.0);
    this.player.camYaw = 0; this.player.heading = 0; this.player.vy = 0;
    this.ui.locationBanner('Galata Kulesi · Seyir Terası');
  }
  leaveGalataTop() {
    const { cx, cz, R } = this.galata;
    this.player.pos.set(cx, 0, cz + R + 2.2); this.player.vy = 0;
  }

  setupCreatorScene() {
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x0c0a08);
    s.add(new THREE.HemisphereLight(0xfff0d8, 0x201810, 0.8));
    const key = new THREE.SpotLight(0xffe0b0, 40, 20, 0.6, 0.5); key.position.set(2, 4, 3); s.add(key); key.target.position.set(0, 1, 0); s.add(key.target);
    const rim = new THREE.PointLight(0xb3131b, 20, 10); rim.position.set(-2, 2, -2); s.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.6, 40), new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.4, metalness: 0.3 }));
    floor.rotation.x = -Math.PI / 2; s.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.62, 60), new THREE.MeshBasicMaterial({ color: 0xd4af37 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; s.add(ring);
    this.creatorScene = s;
    this.creatorCam = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 50);
    this.creatorCam.position.set(0.35, 1.25, 5.4); this.creatorCam.lookAt(0.35, 0.95, 0);
    let drag = null;
    window.addEventListener('pointerdown', (e) => { if (this.mode === 'creator' && e.target.tagName === 'CANVAS') drag = e.clientX; });
    window.addEventListener('pointermove', (e) => { if (drag !== null && this.creatorModel) { this.creatorModel.root.rotation.y += (e.clientX - drag) * 0.01; drag = e.clientX; } });
    window.addEventListener('pointerup', () => { drag = null; });
  }
  enterCreator(look) {
    this.mode = 'creator';
    if (this.creatorModel) this.creatorScene.remove(this.creatorModel.root);
    this.creatorModel = new CharacterModel(look);
    this.creatorModel.root.position.set(-0.9, 0, 0);
    this.creatorScene.add(this.creatorModel.root);
  }
  exitCreator() { this.mode = 'menu'; }

  // ---------------- oyun durumu ----------------
  freshState(name, look) {
    return {
      name, look: { ...look }, money: 1500, bank: 0, respect: 0, storyIndex: 0, completed: [], day: 1, time: 9.5,
      pos: null, hp: 100, armor: 0, weapons: { fists: {}, knife: {}, pistol: { mag: 15, ammo: 45 } }, weapon: 'pistol',
      owned: { [`top:${look.top}`]: [look.topColor], [`pants:${look.pants}`]: [look.pantsColor], [`shoes:${look.shoes}`]: [look.shoesColor] },
      goods: {}, goodsCost: {}, capacity: 20, businesses: [], territories: {}, gangRel: {}, gangKills: {}, ownedCars: [], carUpgrade: false,
      tulips: [], looted: {}, robbed: {}, unlockedGoldJacket: false, prices: rollPrices(1),
      ...lifeStateDefaults(),
      stats: { kills: 0, deaths: 0, busted: 0, copsKilled: 0, robberies: 0, driveDist: 0, runTime: 0, playTime: 0, strength: 0, stamina: 0 },
    };
  }

  newGame(name, look) {
    this.startWorld(this.freshState(name, look));
    const sh = this.map.nearestOfType('safehouse', -300, -60);
    const p = this.player;
    // Cezaevi çıkışı: güvenli evin önünde başla
    p.pos.set(sh.door.x, 0, sh.door.z + sh.door.nz * 3);
    p.heading = sh.door.nz > 0 ? 0 : Math.PI; p.camYaw = p.heading + Math.PI;
    this.ui.bigMessage('İSTANBUL', `${name} yedi yıl sonra özgür...`, 'gold', 4);
    setTimeout(() => this.ui.notify('İpucu: ESC menü · M harita · Tab istatistik · E etkileşim · F araca bin', 'info'), 4500);
    // başlangıç aracı
    const v = this.vehicles.spawnParked(p.pos.x, p.pos.z);
    void v;
  }

  startWorld(state) {
    this.state = state;
    this.ui.closeAll();
    // temizlik
    if (this.player && this.player.inInterior) this.interiors.exit();
    this.vehicles.clear(); this.npcs.clear(); this.pickups.clearDynamic();
    for (const t of this.pickups.tulips) this.pickups.remove(t);
    this.pickups.tulips = [];
    this.combat.reset();
    this.wanted.reset();
    this.missions.cleanup();
    if (this.player) this.scene.remove(this.player.model.root);
    this.player = new Player(this, state.look);
    this.scene.add(this.player.model.root);
    const p = this.player;
    p.hp = state.hp; p.armor = state.armor;
    for (const [id, w] of Object.entries(state.weapons)) {
      if (!WEAPONS[id]) continue;
      if (WEAPONS[id].type === 'melee') p.giveWeapon(id);
      else { p.weapons[id] = { mag: w.mag || 0, ammo: w.ammo || 0 }; }
    }
    p.setWeapon(p.weapons[state.weapon] ? state.weapon : 'fists');
    this.env.time = state.time; this.env.day = state.day;
    this.pickups.placeTulips(state.tulips);
    // sahip olunan araçlar
    const cap = garageCapacity(state);
    state.ownedCars.forEach((c, i) => { if (i < cap) this.spawnOwnedCar(i, false); });
    (state.luxury || []).forEach((e, i) => this.spawnLuxury(e, i, true));
    // askerî üs: park hâlinde tank, cip ve kamyonlar
    const mb = MAPDATA.MILITARY_BASE;
    if (mb && mb.spawnPoints) for (const sp of mb.spawnPoints) {
      const t = { tank: 'tank', jeep: 'cip', truck: 'kamyon' }[sp.type];
      if (t) this.vehicles.spawnProp(t, sp.x, sp.z, sp.heading || 0);
    }
    for (let i = 0; i < 4; i++) { this.vehicles.spawnTraffic(p.pos.x, p.pos.z); }
    this.mode = 'playing';
    this.ui.showHUD(true);
    this.input.lock();
    audio.stopMusic();
    this.setGps(null);
    this.waypoint = null;
  }

  serialize() {
    const s = this.state, p = this.player;
    s.hp = Math.max(30, p.hp); s.armor = p.armor;
    s.weapons = {};
    for (const [id, w] of Object.entries(p.weapons)) s.weapons[id] = { mag: isFinite(w.mag) ? w.mag : 0, ammo: isFinite(w.ammo) ? w.ammo : 0 };
    s.weapon = p.weapon;
    s.time = this.env.time; s.day = this.env.day;
    if (p.inInterior) { const d = p.inInterior.door; s.pos = { x: d.x, z: d.z + (d.building.door ? d.building.door.nz : 1) * 0.6, y: 0 }; }
    else if (p.vehicle) s.pos = { x: p.vehicle.pos.x, z: p.vehicle.pos.z, y: 0 };
    else s.pos = { x: p.pos.x, z: p.pos.z, y: Math.max(0, p.pos.y) };
    s.heading = p.heading;
    return JSON.parse(JSON.stringify(s));
  }
  async saveGame(slot) { await writeSave(slot, this.serialize()); }
  autosave() { if (this.wanted.level === 0) this.saveGame('auto'); }
  async loadGame(slot) {
    const r = await readSave(slot);
    if (!r) { this.ui.notify('Kayıt bulunamadı', 'warn'); return; }
    const s = { ...this.freshState(r.data.name, r.data.look), ...r.data };
    s.stats = { ...this.freshState('', r.data.look).stats, ...(r.data.stats || {}) };
    if (!s.prices) s.prices = rollPrices(s.day);
    ensureLifeState(s);
    this.startWorld(s);
    const p = this.player;
    if (s.pos) { p.pos.set(s.pos.x, s.pos.y || 0, s.pos.z); p.heading = s.heading || 0; p.camYaw = p.heading; }
    this.ui.notify('Oyun yüklendi', 'good');
  }
  sleepAndSave() {
    this.ui.overlayEl.innerHTML = '<h1>Zzz...</h1><p>8 saat uyudun. Oyun kaydedildi.</p>';
    this.ui.overlayEl.className = 'overlay show dark';
    const before = this.env.day;
    this.env.time += 8;
    if (this.env.time >= 24) { this.env.time -= 24; this.env.day++; }
    if (this.env.day !== before) this.onNewDay(this.env.day);
    this.player.hp = this.player.maxHp;
    this.saveGame('auto');
    this.saveGame('1');
    setTimeout(() => { this.ui.overlayEl.className = 'overlay hidden'; }, 2200);
  }

  // ---------------- menü / duraklatma ----------------
  pause() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.input.unlock();
    audio.setEngine(false); audio.setSiren(0);
    this.ui.pauseMenu();
  }
  resume() {
    if (this.mode !== 'paused') return;
    this.mode = 'playing';
    this.input.lock();
    this.last = performance.now();
  }
  toMainMenu() {
    this.ui.closeAll();
    if (this.player.inInterior) this.interiors.exit();
    this.mode = 'menu';
    this.ui.showHUD(false);
    this.vehicles.clear(); this.npcs.clear();
    this.missions.cleanup();
    this.player.model.root.visible = false;
    audio.setEngine(false); audio.setSiren(0);
    audio.startMusic('menu');
    this.ui.mainMenu();
  }
  quit() {
    if (window.desktop) window.desktop.quit();
    else { this.ui.notify('Tarayıcı sürümünde sekmeyi kapatarak çıkabilirsin.', 'info'); }
  }

  applySettings(live) {
    const s = this.settings;
    storeSettings(s);
    audio.volume = { master: s.volMaster, sfx: s.volSfx, music: s.volMusic };
    audio.applyVolume();
    if (this.camera) { this.camera.far = s.drawDistance + 3000; this.camera.updateProjectionMatrix(); }
    if (this.env) this.env.farBase = s.drawDistance;
    if (this.bloom) this.bloom.enabled = s.bloom && s.quality !== 'low';
    if (window.desktop && live !== undefined) window.desktop.setFullscreen(!!s.fullscreen);
    if (this.player) applyExtendedSettings(this);
  }

  onResize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
    this.postfx.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.creatorCam.aspect = innerWidth / innerHeight; this.creatorCam.updateProjectionMatrix();
  }

  onKey(e) {
    if (e.code === 'Escape') {
      if (this.mode === 'playing') {
        if (this.ui.blocking()) { if (this.ui.topClosable()) this.ui.closeModal(); }
        else this.pause();
      } else if (this.mode === 'paused') {
        if (this.ui.modalStack.length > 1) this.ui.closeModal(); else this.ui.closeModal();
      } else if (this.mode === 'menu' && this.ui.modalStack.length > 1) this.ui.closeModal();
      return;
    }
    if (this.mode !== 'playing') return;
    if (e.code === 'KeyM' && !e.repeat) {
      if (this.ui.modalStack.length && this.ui.modalStack[this.ui.modalStack.length - 1].wrap.querySelector('.mapscreen')) this.ui.closeModal();
      else if (!this.ui.blocking()) this.ui.mapScreen();
    }
    if (e.code === 'Tab' && !this.ui.blocking()) this.ui.statsScreen();
    if (e.code === 'F5') { if (this.wanted.level > 0) this.ui.notify('Aranırken kayıt alınamaz!', 'warn'); else { this.saveGame('auto'); this.ui.notify('Hızlı kayıt alındı', 'good'); } }
    if (e.code === 'F9') this.loadGame('auto');
  }

  // ---------------- sahne yönetimi ----------------
  activeScene() { return this.active; }
  setActiveScene(s) {
    this.active = s;
    this.renderPass.scene = s;
    if (this.postfx.ao) this.postfx.ao.scene = s;
    this.particles.setScene(s);
    this.combat.attach(s);
  }
  allActors() { return this.npcs.list.length ? [this.player, ...this.npcs.list] : [this.player]; }
  cameraShake(k) { this.player.camShake = Math.max(this.player.camShake, k); }

  setGps(x, z) {
    if (x === null || x === undefined) { this.gpsTarget = null; this.gpsPath = null; return; }
    this.gpsTarget = { x, z };
    this.updateGps(true);
  }
  setWaypoint(x, z) {
    if (x === null || x === undefined) { this.waypoint = null; if (!this.missions.active) this.setGps(null); return; }
    this.waypoint = { x, z };
    this.setGps(x, z);
  }
  updateGps(force) {
    if (!this.gpsTarget) return;
    this.gpsT = (this.gpsT || 0) - this.dt;
    if (!force && this.gpsT > 0) return;
    this.gpsT = 1.5;
    const p = this.player.pos;
    const path = this.map.path(p.x, p.z, this.gpsTarget.x, this.gpsTarget.z);
    // ilk düğüm arkada kaldıysa atla
    if (path.length > 1) {
      const a = path[0], b = path[1];
      const along = (p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z);
      if (along > 0) path.shift();
    }
    path.push({ x: this.gpsTarget.x, z: this.gpsTarget.z });
    this.gpsPath = path;
    if (this.waypoint && Math.hypot(p.x - this.waypoint.x, p.z - this.waypoint.z) < 15) { this.ui.notify('Hedefe vardın', 'good'); this.setWaypoint(null); }
  }

  // ---------------- araçlar ----------------
  enterVehicle(v, instant) {
    const p = this.player;
    if (v.ai && !v.ai.empty && !v.parked && v.ai.mode !== 'race') {
      // araç gaspı: sürücüyü indir
      const f = v.fwd;
      const dn = this.npcs.add(v.type === 'police' || v.type === 'swat' ? 'police' : 'civilian', v.pos.x + f.z * 2, v.pos.z - f.x * 2);
      if (dn.faction === 'police') { dn.state = 'attack'; dn.target = p; this.wanted.crime('assault_police'); }
      else { dn.hearThreat(p, 2); this.ui.bark(dn, ['Arabam! Polis!', 'Ne yapıyorsun be!', 'İmdat, hırsız!'][Math.floor(Math.random() * 3)]); }
      this.wanted.crime('carjack', v.pos);
    } else if (v.parked && !v.owned && !v.mission && !instant) {
      if (Math.random() < 0.4) { this.audio.tone({ freq: 900, dur: 0.3, type: 'square', gain: 0.1, x: v.pos.x, z: v.pos.z }); this.wanted.crime('carjack', v.pos); }
    }
    v.ai = null; v.parked = false;
    v.driver = p;
    p.vehicle = v;
    p.lastVehicle = v;
    p.crouch = false;
    p.carCamIdle = 2;
    p.camYaw = v.heading;
    if (!v.owned && v.type !== 'police' && !instant) this.ui.notify(v.def.name, 'info');
  }
  onPlayerExitVehicle(v) {
    audio.setEngine(false);
    void v;
  }
  spawnOwnedCar(i, atDoor) {
    const c = this.state.ownedCars[i];
    if (!c) return;
    let x, z, h = 0;
    const p = this.player;
    const ref = atDoor && p.inInterior ? p.inInterior.door : atDoor ? { x: p.pos.x, z: p.pos.z } : (this.map.nearestOfType('safehouse', -300, -60) || {}).door;
    const n = this.map.nearestNode(ref.x, ref.z);
    const e = n.edges[0];
    const o = this.map.other(e, n);
    const dx = o.x - n.x, dz = o.z - n.z, l = Math.hypot(dx, dz);
    const t = 14 + i * 7;
    x = n.x + (dx / l) * t + (-dz / l) * (e.width / 2 - 1.2); z = n.z + (dz / l) * t + (dx / l) * (e.width / 2 - 1.2);
    h = Math.atan2(dx, dz);
    const v = this.vehicles.add(c.type, x, z, h, c.color);
    v.owned = true; c.vid = v.id;
    return v;
  }

  // Lüks araç teslimatı: tekne/yat suya, helikopter yanına, uçak havalimanına
  spawnLuxury(entry, i, atHome) {
    const kind = { speedboat: 'surat', yacht: 'yat', helicopter: 'helikopter', plane: 'ucak' }[entry.type];
    if (!kind) return null;
    const p = this.player;
    let ref = { x: p.pos.x, z: p.pos.z };
    if (atHome) { const sh = this.map.nearestOfType('safehouse', -300, -60); if (sh) ref = { x: sh.door.x, z: sh.door.z }; }
    let v = null;
    if (kind === 'surat' || kind === 'yat') {
      const marina = MAPDATA.MARINA;
      const base = marina && atHome ? { x: (marina.x0 + marina.x1) / 2, z: (marina.z0 + marina.z1) / 2 } : ref;
      const w = nearestWaterSpot(base.x + i * 12, base.z, 8);
      if (w) v = this.boats.add(kind, w.x, w.z, w.heading || 0, entry.color);
    } else if (kind === 'ucak') {
      const ap = MAPDATA.AIRPORT;
      if (ap && ap.runway) v = this.aircraft.add(kind, ap.runway.x0 + 20 + i * 4, ap.runway.z, ap.runway.heading || Math.PI / 2, entry.color);
      else { const n = this.map.nearestNode(ref.x, ref.z); v = this.aircraft.add(kind, n.x, n.z, 0, entry.color); }
    } else {
      const n = this.map.nearestNode(ref.x + 8, ref.z + 8);
      v = this.aircraft.add(kind, n.x + 4, n.z + 4, 0, entry.color);
    }
    if (v) { v.owned = true; if (!atHome) this.ui.notify(`${entry.name || 'Aracın'} teslim edildi — haritada mavi işaret`, 'good'); }
    return v;
  }

  // ---------------- çeteler ----------------
  gangHostile(gang) {
    if (!gang || gang === 'family' || gang === 'trader') return false;
    if (this.state.territories[gang]) return false;
    return (this.state.gangRel[gang] || 0) < -10;
  }
  angerGang(gang) {
    if (!gang || gang === 'family') return;
    this.state.gangRel[gang] = Math.min((this.state.gangRel[gang] || 0), 0) - 30;
  }
  onGangKill(n) {
    const s = this.state, gid = n.gang;
    if (!GANGS[gid] || s.territories[gid]) return;
    s.gangKills[gid] = (s.gangKills[gid] || 0) + 1;
    s.respect += 3;
    const k = s.gangKills[gid];
    if (k === 1) this.ui.notify(`${GANGS[gid].name} ile savaş başladı! Bölgeyi almak için 15 üyelerini indir.`, 'warn');
    else if (k % 5 === 0 && k < 15) this.ui.notify(`${GANGS[gid].name}: ${k}/15`, 'info');
    if (k >= 15) {
      s.territories[gid] = true;
      s.respect += 200;
      this.ui.bigMessage('BÖLGE ELE GEÇİRİLDİ', `${GANGS[gid].name} bölgesi artık senin · Günlük +₺5.000`, 'gold', 4);
      this.audio.success();
      for (const o of this.npcs.list) if (o.gang === gid && !o.dead) { o.state = 'flee'; o.fleeT = 20; o.faction = 'civilian'; }
    }
  }

  onNewDay(day) {
    const s = this.state;
    if (!s) return;
    s.day = day;
    s.prices = rollPrices(day);
    let income = 0;
    for (const id of s.businesses) { const b = BUSINESSES.find((x) => x.id === id); if (b) income += b.income; }
    income += Object.keys(s.territories).filter((k) => s.territories[k]).length * 5000;
    const interest = Math.min(50000, Math.floor(s.bank * 0.01));
    s.bank += interest;
    s.money += income;
    for (const k of Object.keys(s.gangRel)) s.gangRel[k] = Math.min(0, s.gangRel[k] + 10);
    if (income || interest) this.ui.notify(`Yeni gün! İşletme geliri ${formatMoney(income)} · Faiz ${formatMoney(interest)}`, 'money');
    else this.ui.notify(`${day}. gün başladı. Karaborsa fiyatları değişti.`, 'info');
  }
  collectIncome() { this.ui.notify('Hasılat her sabah otomatik olarak nakit hesabına geçer.', 'info'); }

  // ---------------- ölüm / tutuklanma ----------------
  onPlayerDeath() {
    if (this.mode !== 'playing') return;
    const s = this.state;
    s.stats.deaths++;
    this.missions.onPlayerDown();
    audio.setEngine(false);
    if (this.player.vehicle) this.vehicles.ejectDriver(this.player.vehicle);
    this.mode = 'dead';
    this.input.unlock();
    const lost = Math.floor(s.money * 0.25);
    const fee = Math.min(s.money - lost, 1000);
    this.ui.wasted('ÖLDÜN', `Hastane masrafı ${formatMoney(fee)} · Düşürülen para ${formatMoney(lost)}`, () => {
      s.money = Math.max(0, s.money - lost - fee);
      this.respawnAt('hospital');
    });
    setTimeout(() => audio.fail(), 300);
  }
  onBusted() {
    if (this.mode !== 'playing') return;
    const s = this.state;
    s.stats.busted++;
    this.missions.onPlayerDown();
    if (this.player.vehicle) this.vehicles.ejectDriver(this.player.vehicle);
    this.mode = 'dead';
    this.input.unlock();
    const fine = Math.floor(s.money * 0.2) + this.wanted.level * 500;
    this.player.handsUp = true;
    this.ui.wasted('TUTUKLANDIN', `Ceza ${formatMoney(Math.min(fine, s.money))} · Silahlarına ve kaçak mallara el konuldu`, () => {
      s.money = Math.max(0, s.money - fine);
      const keep = {};
      for (const [id, w] of Object.entries(this.player.weapons)) if (WEAPONS[id].type === 'melee') keep[id] = w;
      this.player.weapons = keep;
      this.player.setWeapon('fists');
      s.goods = {}; s.goodsCost = {};
      this.respawnAt('police');
    });
  }
  respawnAt(type) {
    const p = this.player;
    const b = this.map.nearestOfType(type, p.pos.x, p.pos.z);
    if (p.inInterior) this.interiors.exit();
    this.wanted.reset();
    this.npcs.calmPolice();
    for (const n of this.npcs.list.slice()) if (!n.mission) this.npcs.remove(n);
    p.dead = false; p.hp = p.maxHp; p.armor = 0; p.vy = 0; p.handsUp = false; p.swimming = false;
    p.model.deadT = 0;
    if (b) { p.pos.set(b.door.x, 0, b.door.z + b.door.nz * 2.5); p.heading = b.door.nz > 0 ? 0 : Math.PI; p.camYaw = p.heading; }
    p.camInit = false;
    this.env.time += 4;
    this.mode = 'playing';
    this.input.lock();
    this.ui.notify(type === 'hospital' ? 'Hastaneden taburcu oldun' : 'Karakoldan serbest bırakıldın', 'info');
  }

  // ---------------- etkileşim ----------------
  findInteraction() {
    const p = this.player;
    if (p.vehicle || p.dead) return null;
    if (this.missions.pendingPrompt) return this.missions.pendingPrompt;
    let best = null, bd = 1e9;
    if (p.inInterior) {
      for (const it of p.inInterior.interact) {
        if (it.cond && !it.cond()) continue;
        const d = Math.hypot(p.pos.x - it.x, p.pos.z - it.z);
        if (d < it.r && d < bd) { bd = d; best = it; }
      }
      return best;
    }
    for (const it of this.worldInteract) {
      const d = Math.hypot(p.pos.x - it.x, p.pos.z - it.z);
      if (d < it.r && Math.abs(p.pos.y - (it.y || 0)) < 1.5 && d < bd) { bd = d; best = it; }
    }
    if (best) return best;
    if (p.pos.y < 1) {
      for (const d of this.city.doors) {
        const dd = Math.abs(p.pos.x - d.x) + Math.abs(p.pos.z - d.z);
        if (dd < 2.2 && dd < bd) { bd = dd; best = d; }
      }
      if (best) {
        const door = best;
        return { label: `Gir: ${placeName(door.building.type, door.building)}`, action: () => this.interiors.enter(door) };
      }
    }
    const cat = this.animals.nearestCat(p.pos.x, p.pos.z, 1.8);
    if (cat) return { label: 'Kediyi sev', action: () => { cat.state = 'sit'; cat.t = 4; cat.petted = 2; audio.meow(cat.x, cat.z); if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 5); this.state.stats.cats = (this.state.stats.cats || 0) + 1; if (this.state.stats.cats === 10) this.ui.notify('Başarım: Kedi Dostu! İstanbul kedileri seni seviyor.', 'gold'); } };
    return null;
  }

  // ---------------- döngü ----------------
  loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    const raw = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(raw, 0.05);
    this.dt = dt;
    this.fpsAcc += raw; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
    const t = now / 1000;
    try {
      if (this.mode === 'menu') this.updateMenu(dt, t);
      else if (this.mode === 'creator') {
        this.creatorModel.animate(dt, { speed: 0 });
        this.creatorModel.root.rotation.y += dt * 0.25;
        this.renderer.render(this.creatorScene, this.creatorCam);
        this.input.endFrame();
        return;
      } else if (this.mode === 'playing' || this.mode === 'dead') this.updateGame(dt, t);
      else if (this.mode === 'paused') { /* donmuş kare */ }
    } catch (err) {
      console.error(err);
    }
    this.render();
    this.input.endFrame();
  }

  render() {
    if (this.mode === 'creator') return;
    const target = document.body.classList.contains('desat') ? 0.08 : 1;
    this.deathSat += (target - this.deathSat) * Math.min(1, this.dt * 3 || 0.1);
    this.postfx.update(this.env, this.dt);
    this.grade.uniforms.uSat.value *= this.deathSat;
    this.composer.render();
  }

  updateMenu(dt, t) {
    // menü arka planı: İstanbul üzerinde sinematik uçuş
    const a = t * 0.03;
    const cx = 60, cz = -120;
    this.camera.position.set(cx + Math.cos(a) * 420, 110 + Math.sin(t * 0.07) * 25, cz + Math.sin(a) * 420);
    this.camera.lookAt(cx, 10, cz + 80);
    this.camera.fov = 55; this.camera.updateProjectionMatrix();
    if (this.env.time < 17.8 || this.env.time > 19.5) this.env.time = 17.8;
    this.env.update(dt * 3, this.camera.position);
    this.uniforms.uNight.value = this.env.nightFactor;
    this.city.setNight(this.env.nightFactor);
    this.city.update(dt, t);
    this.animals.update(dt);
    if (this.flag) this.flag.rotation.y = Math.sin(t * 2) * 0.15;
  }

  updateGame(dt, t) {
    const p = this.player, s = this.state;
    const input = this.input;
    const blocked = this.ui.blocking() || this.mode === 'dead';
    input.enabled = !blocked;
    if (blocked) { input.mouse.dx = input.mouse.dy = 0; input.mouse.left = input.mouse.right = false; input.mouse.leftPressed = false; }
    s.stats.playTime += dt;
    // etkileşim
    const it = !blocked ? this.findInteraction() : null;
    this.ui.prompt(it ? it.label : null);
    if (!it && !p.vehicle && !p.inInterior && !blocked) {
      const v = this.vehicles.nearestEnterable(p.pos.x, p.pos.z, 2.5);
      if (v) { const pr = document.getElementById('prompt'); pr.innerHTML = `<kbd>F</kbd> ${v.ai && !v.ai.empty && !v.parked ? 'Aracı gasp et' : 'Araca bin'}: ${v.def.name}`; pr.classList.add('show'); }
    }
    if (it && input.hit('KeyE')) { audio.click(); it.action(); }
    if (input.hit('KeyF') && !p.dead) {
      if (p.vehicle) {
        const v = p.vehicle;
        if (Math.abs(v.fs) < 8) { this.vehicles.ejectDriver(v); v.controls.throttle = 0; v.controls.handbrake = true; }
      } else if (!p.inInterior) {
        const v = this.vehicles.nearestEnterable(p.pos.x, p.pos.z, 2.5);
        if (v) this.enterVehicle(v);
      }
    }
    // oyuncu
    p.update(dt, input);
    this.audio.listener.x = p.pos.x; this.audio.listener.z = p.pos.z;
    // dünya
    const inside = !!p.inInterior;
    this.env.update(dt, p.pos);
    this.uniforms.uNight.value = this.env.nightFactor;
    this.city.setNight(this.env.nightFactor);
    if (!inside) {
      this.city.update(dt, t);
      this.vehicles.update(dt);
      this.traffic.update(dt);
      this.boats.update(dt);
      this.aircraft.update(dt);
      this.ships.update(dt);
      this.animals.update(dt);
      if (this.flag) this.flag.rotation.y = Math.sin(t * 2) * 0.15;
      this.updateGps(false);
    } else {
      if (p.inInterior.update) p.inInterior.update(dt, t);
      p.inInterior.scene.traverse((o) => { if (o.userData.spin) o.rotation.y += dt * 2; });
    }
    this.npcs.update(dt);
    this.combat.update(dt);
    this.particles.update(dt);
    this.pickups.update(dt);
    this.wanted.update(dt);
    this.missions.update(dt);
    // yakalanırsa kaçak mallar
    if (this.wanted.level > 0 && goodsCount(s) > 0 && !this._goodsWarn) { this._goodsWarn = true; this.ui.notify('Dikkat: Üzerinde kaçak mal var. Yakalanırsan el konur!', 'warn'); }
    if (this.wanted.level === 0) this._goodsWarn = false;
    this.life.update(dt);
    this.ui.update(dt);
    // iç mekânda ses
    if (!p.vehicle) audio.setEngine(false);
    s.money = Math.max(0, Math.floor(s.money));
    void clamp; void districtAt; void LANDMARKS;
  }
}

const game = new Game();
window.game = game;
game.init().catch((e) => {
  console.error(e);
  const l = document.getElementById('loadText');
  if (l) l.textContent = 'Hata: ' + e.message;
});

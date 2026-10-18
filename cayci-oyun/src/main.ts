import * as THREE from 'three';
import './ui/styles.css';
import { Input, ScriptedInput } from './core/input';
import { setLang, tx } from './core/i18n';
import { defaultSave, loadSave, normalize, SaveData, writeSave, type Quality } from './core/save';
import { steamBridge } from './core/steam';
import { dateSeed, Rng } from './core/rng';
import { audio } from './audio/Audio';
import { Run, RunConfig } from './game/Run';
import { VENUES, type Venue } from './game/venues';
import { EVIDENCE_NEEDED } from './game/rumors';
import { liveEvidence } from './meta/titles';
import { MEETING_REP } from './ui/Menus';
import { Hud } from './ui/Hud';
import { Menus } from './ui/Menus';
import { TraySim } from './physics/tray';
import { TrayView } from './entities/TrayView';
import { cemalLook } from './entities/Player';
import { makePerson, mat, type PersonRig } from './world/models';
import { floorTexture } from './world/textures';
import { buildGallery } from './dev/gallery';
import { playBot, type BotPolicy } from './dev/bot';
import { applyRunToSave, ensureDaily, isUnlocked, recordEnding } from './meta/profile';
import { upgrade, type CosmeticSlot } from './meta/progress';
import type { Achievement } from './meta/achievements';
import type { RunStats } from './meta/stats';

type State = 'menu' | 'playing' | 'paused' | 'overlay';

/** Ana menünün arkasında dönen küçük sahne: Cemal (giydiği kıyafetlerle) ve sallanan tepsi. */
class MenuScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  private tray = new TraySim();
  private view: TrayView;
  private t = 0;
  private rig: PersonRig;

  constructor(look: SaveData['look']) {
    this.scene.background = new THREE.Color(0x1a110b);
    this.scene.fog = new THREE.Fog(0x1a110b, 6, 16);
    const ft = floorTexture('han');
    ft.repeat.set(8, 8);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.5 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.scene.add(new THREE.HemisphereLight(0xfff1dc, 0x3a2a1a, 0.7));
    const key = new THREE.SpotLight(0xffd8a0, 60, 14, 0.5, 0.6, 1.5);
    key.position.set(2.5, 5, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);
    const rim = new THREE.PointLight(0xb3261e, 6, 6);
    rim.position.set(-2, 2, -1.5);
    this.scene.add(rim);
    this.rig = makePerson(cemalLook(look));
    this.scene.add(this.rig.root);
    this.rig.armR.rotation.x = -0.65;
    this.rig.armR.rotation.z = -0.15;
    this.rig.root.updateMatrixWorld(true);
    this.view = new TrayView(look);
    this.tray.reset(this.rig.hand.getWorldPosition(new THREE.Vector3()));
    for (const t of ['demli', 'acik', 'demli'] as const) this.tray.addGlass(t, 0.92, 85, 1);
    this.scene.add(this.view.group);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(1.4, 32), mat(0x3a2414, { rough: 1 }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.002;
    this.scene.add(glow);
  }

  update(dt: number) {
    this.t += dt;
    this.rig.root.rotation.y = -0.5 + Math.sin(this.t * 0.25) * 0.15;
    this.rig.root.updateMatrixWorld(true);
    this.rig.blink?.(dt);
    // elin dünya konumu: sağ kolun ucu
    const h = this.rig.hand.getWorldPosition(new THREE.Vector3());
    h.y += Math.sin(this.t * 2.2) * 0.015;
    this.tray.step(h, dt);
    this.tray.glasses.forEach((g) => (g.fill = 0.92));
    this.view.sync(this.tray);
    const a = 0.9 + Math.sin(this.t * 0.15) * 0.1;
    this.camera.position.set(Math.sin(a) * 4.4 - 1.1, 1.45, Math.cos(a) * 4.4);
    this.camera.lookAt(-1.05, 0.95, 0);
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry?.dispose();
    });
  }
}

class Game {
  renderer: THREE.WebGLRenderer;
  input: Input;
  hud: Hud;
  menus: Menus;
  save: SaveData;
  state: State = 'menu';
  run: Run | null = null;
  private menuScene: MenuScene;
  private lastRun: { index: number; mode: RunStats['mode'] } | null = null;
  private boardTab = VENUES[0].id;
  private last = performance.now();

  constructor(root: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    root.appendChild(this.renderer.domElement);
    this.input = new Input(this.renderer.domElement);
    this.hud = new Hud(root);
    this.menus = new Menus(root);
    this.save = loadSave();
    ensureDaily(this.save);
    setLang(this.save.settings.lang);
    audio.setVolume(this.save.settings.volume);
    audio.setMusic(this.save.settings.music);
    this.applyQuality();
    this.menuScene = new MenuScene(this.save.look);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    window.addEventListener('pointerdown', () => {
      audio.init();
      audio.setVolume(this.save.settings.volume);
      audio.setMusic(this.save.settings.music);
      audio.startMusic();
    });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.state === 'playing') this.pause();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === 'playing') this.pause();
    });
    void this.syncSteam();
    this.showTitle();
    requestAnimationFrame((t) => this.loop(t));
  }

  /** Steam sürümünde: oyuncu adı ve bulut kaydı (daha ilerideyse onu kullan). */
  private async syncSteam() {
    const sb = steamBridge();
    if (!sb) return;
    try {
      const cloud = await sb.cloudLoad?.();
      if (cloud) {
        const c = normalize(JSON.parse(cloud));
        if (c.xp > this.save.xp) {
          this.save = c;
          ensureDaily(this.save);
        }
      }
      const name = await sb.playerName?.();
      if (name && (this.save.playerName === defaultSave().playerName || !this.save.playerName)) this.save.playerName = name.slice(0, 16);
      this.persist();
      if (this.state === 'menu') this.showTitle();
    } catch {
      /* çevrimdışı */
    }
  }

  applyQuality() {
    const q: Quality = this.save.settings.quality;
    this.renderer.shadowMap.enabled = q !== 'low';
    this.renderer.setPixelRatio(q === 'high' ? Math.min(2, window.devicePixelRatio) : q === 'medium' ? Math.min(1.25, window.devicePixelRatio) : 0.85);
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    if (this.menuScene) {
      this.menuScene.camera.aspect = w / h;
      this.menuScene.camera.updateProjectionMatrix();
    }
    this.run?.resize(w / h);
  }

  frozen = false; // galeri görseli çizilirken döngü ekrana dokunmaz

  loop(now: number) {
    const dt = Math.min(1 / 20, (now - this.last) / 1000);
    this.last = now;
    if (this.frozen) {
      requestAnimationFrame((t) => this.loop(t));
      return;
    }
    this.input.pollGamepad();
    if (this.input.wasPressed('GamepadStart')) {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused' || (this.state === 'overlay' && this.run)) this.resume();
    }
    if (this.state === 'playing' && this.run) {
      this.run.update(dt, this.input);
      if (this.run) this.renderer.render(this.run.scene, this.run.camera);
    } else if (this.run && (this.state === 'paused' || this.state === 'overlay')) {
      this.renderer.render(this.run.scene, this.run.camera);
    } else {
      this.menuScene.update(dt);
      this.renderer.render(this.menuScene.scene, this.menuScene.camera);
    }
    this.input.endFrame();
    requestAnimationFrame((t) => this.loop(t));
  }

  persist() {
    writeSave(this.save);
  }

  private rebuildMenuScene() {
    this.menuScene.dispose();
    this.menuScene = new MenuScene(this.save.look);
    this.resize();
  }

  private unlockSteam(list: Achievement[]) {
    const sb = steamBridge();
    for (const a of list) void sb?.achievement?.(a.id)?.catch?.(() => {});
  }

  // ---------- akış ----------

  showTitle() {
    this.endRun();
    this.state = 'menu';
    this.hud.hide();
    ensureDaily(this.save);
    const back = () => this.showTitle();
    this.menus.title(this.save, {
      career: () => this.careerMap(),
      daily: () => this.dailyIntro(),
      missions: () => this.menus.missions(this.save, back),
      leaderboard: () => this.leaderboard(),
      wardrobe: () => this.wardrobe(),
      shop: () => this.shop(),
      gossip: () => this.menus.gossipBook(this.save, back),
      howTo: () => this.menus.howTo(back),
      settings: () => this.settings(),
      credits: () => this.menus.credits(back),
      lang: (l) => {
        this.save.settings.lang = l;
        setLang(l);
        this.persist();
        this.showTitle();
      },
    });
  }

  careerMap() {
    this.endRun();
    this.state = 'menu';
    this.hud.hide();
    const meeting = this.save.finalSeen || (this.save.venues.teras?.stars ?? 0) >= 1 ? () => this.finalChoice() : null;
    this.menus.careerMap(this.save, (i) => this.venueIntro(i, 'career'), meeting, () => this.showTitle());
  }

  venueIntro(index: number, mode: RunStats['mode']) {
    const v = VENUES[index];
    this.menus.venueIntro(v, this.save, mode, () => this.startRun(index, mode), () => (mode === 'daily' ? this.showTitle() : this.careerMap()));
  }

  dailyIndex() {
    return dateSeed() % VENUES.length;
  }

  dailyIntro() {
    this.venueIntro(this.dailyIndex(), 'daily');
  }

  leaderboard() {
    this.menus.leaderboard(
      this.save,
      this.boardTab,
      (id) => {
        this.boardTab = id;
        this.leaderboard();
      },
      () => this.showTitle(),
    );
  }

  wardrobe() {
    this.menus.wardrobe(
      this.save,
      (slot: CosmeticSlot, id: string) => {
        this.save.look[slot] = id;
        this.persist();
        audio.click();
        this.rebuildMenuScene();
        this.wardrobe();
      },
      () => this.showTitle(),
    );
  }

  shop() {
    this.menus.shop(
      this.save,
      (u) => {
        if (this.save.wallet < u.price || this.save.upgrades.includes(u.id) || !upgrade(u.id)) return;
        this.save.wallet -= u.price;
        this.save.upgrades.push(u.id);
        audio.coin(3);
        this.persist();
        this.shop();
      },
      () => this.showTitle(),
    );
  }

  settings() {
    const prevQuality = this.save.settings.quality;
    let quality = prevQuality;
    this.menus.settings(
      this.save,
      () => {
        const s = this.save.settings;
        audio.setVolume(s.volume);
        audio.setMusic(s.music);
        if (s.quality !== quality) {
          quality = s.quality;
          this.applyQuality();
        }
        this.persist();
      },
      () => {
        const settings = this.save.settings;
        const playerName = this.save.playerName;
        this.save = { ...defaultSave(), settings, playerName };
        ensureDaily(this.save);
        this.persist();
        this.rebuildMenuScene();
        this.showTitle();
      },
      () => this.showTitle(),
    );
  }

  startRun(index: number, mode: RunStats['mode']) {
    this.endRun();
    const venue: Venue = VENUES[index];
    const daily = mode === 'daily';
    const tutorial = !daily && !this.save.tutorialDone && index === 0;
    // günlük mücadelede herkes aynı tohumla oynar; diğerlerinde her tur farklı
    const cfg = this.runConfig(venue, mode, daily ? dateSeed() : (Date.now() ^ (index * 7919)) >>> 0, tutorial);
    if (tutorial) {
      this.save.tutorialDone = true;
      this.persist();
    }
    this.lastRun = { index, mode };
    this.hud.reset();
    this.run = new Run(cfg, this.hud, (s) => this.onRunEnd(s), window.innerWidth / window.innerHeight);
    this.state = 'overlay';
    this.menus.clickToPlay(() => this.resume());
  }

  runConfig(venue: Venue, mode: RunStats['mode'], seed: number, tutorial = false): RunConfig {
    const s = this.save;
    return {
      venue,
      mode,
      seed,
      upgrades: new Set(mode === 'daily' ? [] : s.upgrades), // günlükte eşit şartlar
      look: { ...s.look },
      sensitivity: s.settings.sensitivity,
      quality: s.settings.quality,
      tutorial,
      pocket: [...s.pocket],
      sold: [...s.sales],
      evidence: liveEvidence(s),
      rep: s.rep,
      title: s.title,
      trayAssist: s.settings.trayAssist,
      camDist: s.settings.camDist,
    };
  }

  resume() {
    if (!this.run) return;
    this.menus.hide();
    this.state = 'playing';
    this.input.requestLock();
    this.last = performance.now();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.exitLock();
    this.menus.pause(
      () => this.resume(),
      () => this.lastRun && this.startRun(this.lastRun.index, this.lastRun.mode),
      () => (this.lastRun?.mode === 'daily' ? this.showTitle() : this.careerMap()),
    );
  }

  endRun() {
    if (this.run) {
      this.run.dispose();
      this.run = null;
    }
  }

  onRunEnd(s: RunStats) {
    this.state = 'overlay';
    this.input.exitLock();
    this.hud.hide();
    const index = VENUES.findIndex((v) => v.id === s.venue);
    const venue = VENUES[index];
    const report = applyRunToSave(this.save, venue, s);
    this.persist();
    this.unlockSteam(report.achievements);
    if (report.stars >= 1 || s.mode === 'daily') audio.jingle();
    else audio.fail();
    const nextOpen = s.mode === 'career' && index + 1 < VENUES.length && isUnlocked(this.save, index + 1);
    this.menus.results(report, s, venue, this.save, {
      onAgain: () => this.startRun(index, s.mode),
      onNext: nextOpen ? () => this.venueIntro(index + 1, 'career') : null,
      onMap: () => (s.mode === 'daily' ? this.showTitle() : this.careerMap()),
      onFinal: report.finalUnlocked ? () => this.finalChoice() : null,
    });
  }

  finalChoice() {
    this.endRun();
    this.state = 'overlay';
    const believed = liveEvidence(this.save) >= EVIDENCE_NEEDED && this.save.rep >= MEETING_REP;
    this.menus.choice(this.save, {
      onTruth: () => this.ending(believed ? 'saved' : 'disbelieved'),
      onQuiet: () => this.ending('silent'),
      onSell: () => this.ending('sold'),
    });
  }

  ending(key: 'saved' | 'disbelieved' | 'silent' | 'sold') {
    const got = recordEnding(this.save, key);
    this.persist();
    this.unlockSteam(got);
    if (key === 'saved') audio.jingle();
    this.menus.ending(key, got.map((a) => tx(a.name)), () => this.careerMap());
  }
}

const game = new Game(document.getElementById('app')!);

// Otomatik test, denge ölçümü ve ekran görüntüsü için kanca. Sadece geliştirme sunucusunda var:
// yayın derlemesinde (Steam, web) bot ve sahne atlama yok, yerel sıralama şişirilemez.
if (import.meta.env.DEV) (window as unknown as { __cayci: unknown }).__cayci = {
  game,
  /** Bir mekânı doğrudan başlat (menüsüz). */
  startRun: (index: number, mode: RunStats['mode'] = 'free') => {
    game.save.tutorialDone = true;
    game.startRun(index, mode);
    game.resume();
  },
  /** Denge ölçümü: botla bir vardiya oynat, istatistikleri döndür (kayda yazmaz). */
  bot: (index: number, policy: BotPolicy, seed = 1, upgrades: string[] = []) => {
    game.endRun();
    // denge ölçümü her zaman aynı şartlarda: boş cep, itibar 50, normal tepsi
    const cfg: RunConfig = {
      ...game.runConfig(VENUES[index], 'free', seed),
      upgrades: new Set(upgrades),
      sensitivity: 1,
      quality: 'low',
      pocket: [],
      sold: [],
      evidence: 0,
      rep: 50,
      title: 0,
      trayAssist: 'normal',
      camDist: 1,
    };
    // ölçüm tekrarlanabilir olsun: Math.random da tohumlanır
    const rand = Math.random;
    const rng = new Rng(seed * 7 + 3);
    Math.random = () => rng.next();
    try {
      const run = new Run(cfg, game.hud, () => {}, 16 / 9);
      game.run = run;
      game.state = 'overlay';
      const s = playBot(run, policy, seed);
      game.endRun();
      return s;
    } finally {
      Math.random = rand;
    }
  },
  /** Tanıtım görseli için: mekânı aç, botla 'until' saniye oynat, sahneyi dondurmadan bırak. */
  botScene: (index: number, until: number, policy: BotPolicy, seed = 3) => {
    game.save.tutorialDone = true;
    game.startRun(index, 'free');
    game.menus.hide();
    game.state = 'overlay';
    const rand = Math.random;
    const rng = new Rng(seed * 7 + 3);
    Math.random = () => rng.next();
    try {
      return playBot(game.run!, policy, seed, until);
    } finally {
      Math.random = rand;
    }
  },
  /** Tanıtım görseli çiz (karakterler / eşyalar). */
  gallery: (kind: 'cast' | 'props' | 'wardrobe' | 'keyart') => {
    game.state = 'overlay';
    game.frozen = true;
    game.endRun();
    game.menus.hide();
    game.hud.hide();
    game.renderer.setSize(window.innerWidth, window.innerHeight);
    const g = buildGallery(kind, window.innerWidth / window.innerHeight);
    g.camera.aspect = window.innerWidth / window.innerHeight;
    g.camera.updateProjectionMatrix();
    game.renderer.render(g.scene, g.camera);
  },
  /** Simülasyonu çizim yapmadan, sabit adımla ilerletir. steps: [saniye, basılı tuşlar, fare dx/kare, dy, sol tık][] */
  sim: (steps: [number, string[], number?, number?, boolean?][]) => {
    const inp = new ScriptedInput();
    for (const [secs, keys, mdx = 0, mdy = 0, left = false] of steps) {
      for (const k of [...inp.down]) if (!keys.includes(k)) inp.release(k);
      for (const k of keys) if (!inp.down.has(k)) inp.press(k);
      inp.leftDown = left;
      const n = Math.round(secs * 60);
      let phase = 0;
      for (let i = 0; i < n; i++) {
        const s = game.run;
        if (!s) return;
        // kol modunda mdy = daire yarıçapı (px/kare): fareyle daire çizer
        const ramp = Math.min(1, i / 50);
        phase += 0.15 * ramp;
        inp.mouseDX = left ? Math.cos(phase) * mdy * ramp : mdx;
        inp.mouseDY = left ? Math.sin(phase) * mdy * ramp : mdy;
        s.update(1 / 60, inp);
        inp.endFrame();
      }
    }
  },
};

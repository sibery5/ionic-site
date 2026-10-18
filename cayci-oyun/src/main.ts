import * as THREE from 'three';
import './ui/styles.css';
import { Input, ScriptedInput } from './core/input';
import { setLang } from './core/i18n';
import { defaultSave, hasProgress, loadSave, SaveData, writeSave } from './core/save';
import { dateSeed } from './core/rng';
import { audio } from './audio/Audio';
import { Shift, ShiftConfig, ShiftResult } from './game/Shift';
import { GOSSIP_NEEDED } from './game/story';
import { Hud } from './ui/Hud';
import { Menus } from './ui/Menus';
import { TraySim } from './physics/tray';
import { TrayView } from './entities/TrayView';
import { makePerson, mat } from './world/models';
import { floorTexture } from './world/textures';
import { buildGallery } from './dev/gallery';

type State = 'menu' | 'playing' | 'paused' | 'overlay';

/** Ana menünün arkasında dönen küçük sahne: Cemal ve sallanan tepsi. */
class MenuScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  private tray = new TraySim();
  private view = new TrayView();
  private t = 0;
  private hand = new THREE.Vector3(0.34, 1.05, 0.38);
  private rig = makePerson({ shirt: 0xf4f1ea, pants: 0x1c1c22, skin: 0xe0ac7e, hair: 0x1a120c, vest: 0x15151a, mustache: true });

  constructor() {
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
    this.scene.add(this.rig.root);
    this.rig.armR.rotation.x = -0.65;
    this.rig.armR.rotation.z = 0.15;
    this.tray.reset(this.hand);
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
}

class Game {
  renderer: THREE.WebGLRenderer;
  input: Input;
  hud: Hud;
  menus: Menus;
  save: SaveData;
  state: State = 'menu';
  shift: Shift | null = null;
  private menuScene = new MenuScene();
  private lastCfg: ShiftConfig | null = null;
  private last = performance.now();

  constructor(root: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    root.appendChild(this.renderer.domElement);
    this.input = new Input(this.renderer.domElement);
    this.hud = new Hud(root);
    this.menus = new Menus(root);
    this.save = loadSave();
    setLang(this.save.settings.lang);
    audio.setVolume(this.save.settings.volume);
    audio.setMusic(this.save.settings.music);

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
    this.showTitle();
    requestAnimationFrame((t) => this.loop(t));
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.menuScene.camera.aspect = w / h;
    this.menuScene.camera.updateProjectionMatrix();
    this.shift?.resize(w / h);
  }

  frozen = false; // galeri görseli çizilirken döngü ekrana dokunmaz

  loop(now: number) {
    const dt = Math.min(1 / 20, (now - this.last) / 1000);
    this.last = now;
    if (this.frozen) {
      requestAnimationFrame((t) => this.loop(t));
      return;
    }
    if (this.state === 'playing' && this.shift) {
      this.shift.update(dt, this.input);
      if (this.shift) this.renderer.render(this.shift.scene, this.shift.camera);
    } else if (this.shift && (this.state === 'paused' || this.state === 'overlay')) {
      this.renderer.render(this.shift.scene, this.shift.camera);
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

  // ---------- akış ----------

  showTitle() {
    this.endShift();
    this.state = 'menu';
    this.hud.hide();
    this.menus.title({
      hasSave: hasProgress(this.save),
      onNew: () => {
        const settings = this.save.settings;
        this.save = { ...defaultSave(), settings };
        this.persist();
        this.storyDay();
      },
      onContinue: () => this.storyDay(),
      onFree: () => this.menus.freePlay(this.save, (d) => this.startShift({ dayIndex: d, mode: 'free', seed: Date.now() }), () => this.showTitle()),
      onDaily: () => {
        const seed = dateSeed();
        const day = seed % 5;
        this.menus.daily(this.save.dailyBest[String(seed)], day, () => this.startShift({ dayIndex: day, mode: 'daily', seed }), () => this.showTitle());
      },
      onHow: () => this.menus.howTo(() => this.showTitle()),
      onSettings: () =>
        this.menus.settings(
          this.save.settings,
          (s) => {
            this.save.settings = s;
            audio.setVolume(s.volume);
            audio.setMusic(s.music);
            this.persist();
          },
          () => this.showTitle(),
        ),
      onLang: (l) => {
        this.save.settings.lang = l;
        setLang(l);
        this.persist();
        this.showTitle();
      },
    });
  }

  storyDay() {
    if (this.save.day >= 5) {
      this.finalChoice();
      return;
    }
    this.menus.dayIntro(this.save.day, () => this.startShift({ dayIndex: this.save.day, mode: 'story', seed: 1000 + this.save.day * 77 + Math.floor(Math.random() * 1000) }));
  }

  startShift(c: { dayIndex: number; mode: ShiftConfig['mode']; seed: number }) {
    this.endShift();
    const cfg: ShiftConfig = {
      ...c,
      upgrades: new Set(c.mode === 'story' ? this.save.upgrades : c.mode === 'free' ? this.save.upgrades : []),
      knownGossip: new Set(this.save.gossip),
      sensitivity: this.save.settings.sensitivity,
    };
    this.lastCfg = cfg;
    this.hud.reset();
    this.shift = new Shift(cfg, this.hud, (r) => this.onShiftEnd(r), window.innerWidth / window.innerHeight);
    this.state = 'overlay';
    this.menus.clickToPlay(() => this.resume());
  }

  resume() {
    if (!this.shift) return;
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
      () => this.lastCfg && this.startShift(this.lastCfg),
      () => this.showTitle(),
    );
  }

  endShift() {
    if (this.shift) {
      this.shift.dispose();
      this.shift = null;
    }
  }

  onShiftEnd(r: ShiftResult) {
    this.state = 'overlay';
    this.input.exitLock();
    this.hud.hide();
    const passed = r.stars >= 1;
    let best: number | undefined;
    if (r.mode === 'story') {
      this.save.wallet += r.earned;
      this.save.stars[r.dayIndex] = Math.max(this.save.stars[r.dayIndex] ?? 0, r.stars);
      for (const g of r.gossip) if (!this.save.gossip.includes(g)) this.save.gossip.push(g);
      if (passed && this.save.day === r.dayIndex) this.save.day = r.dayIndex + 1;
    } else if (r.mode === 'free') {
      this.save.stars[r.dayIndex] = Math.max(this.save.stars[r.dayIndex] ?? 0, r.stars);
    } else {
      const key = String(this.lastCfg?.seed);
      best = Math.max(this.save.dailyBest[key] ?? 0, r.earned);
      this.save.dailyBest[key] = best;
    }
    this.persist();
    if (passed) audio.jingle();
    else audio.fail();
    this.menus.summary(r, {
      passed,
      best,
      onNext: () => this.shop(),
      onRetry: () => this.lastCfg && this.startShift({ ...this.lastCfg, seed: this.lastCfg.seed + 1 }),
      onMenu: () => this.showTitle(),
    });
  }

  shop() {
    this.menus.shop(
      this.save,
      (u) => {
        if (this.save.wallet < u.price || this.save.upgrades.includes(u.id)) return;
        this.save.wallet -= u.price;
        this.save.upgrades.push(u.id);
        audio.coin(3);
        this.persist();
        this.shop();
      },
      () => this.storyDay(),
    );
  }

  finalChoice() {
    this.endShift();
    this.state = 'overlay';
    const n = this.save.gossip.length;
    this.menus.choice(
      n,
      () => this.ending(n >= GOSSIP_NEEDED ? 'saved' : 'disbelieved'),
      () => this.ending('silent'),
    );
  }

  ending(key: 'saved' | 'disbelieved' | 'silent') {
    this.save.ending = key;
    this.persist();
    if (key === 'saved') audio.jingle();
    this.menus.ending(key, () => this.showTitle());
  }
}

const game = new Game(document.getElementById('app')!);

// Otomatik test ve ekran görüntüsü için küçük bir kanca.
(window as unknown as { __cayci: unknown }).__cayci = {
  game,
  startDay: (d: number) => {
    game.startShift({ dayIndex: d, mode: 'free', seed: 42 });
    game.resume();
  },
  /** Tanıtım görseli çiz (karakterler / eşyalar). */
  gallery: (kind: 'cast' | 'props') => {
    game.state = 'overlay';
    game.frozen = true;
    game.endShift();
    game.menus.hide();
    game.hud.hide();
    const g = buildGallery(kind);
    g.camera.aspect = window.innerWidth / window.innerHeight;
    g.camera.updateProjectionMatrix();
    game.renderer.render(g.scene, g.camera);
  },
  /** Simülasyonu çizim yapmadan, sabit adımla ilerletir. steps: [saniye, basılı tuşlar, fare dx/kare][] */
  sim: (steps: [number, string[], number?, number?, boolean?][]) => {
    const s = game.shift;
    if (!s) return;
    const inp = new ScriptedInput();
    for (const [secs, keys, mdx = 0, mdy = 0, left = false] of steps) {
      for (const k of [...inp.down]) if (!keys.includes(k)) inp.release(k);
      for (const k of keys) if (!inp.down.has(k)) inp.press(k);
      inp.leftDown = left;
      const n = Math.round(secs * 60);
      let phase = 0;
      for (let i = 0; i < n; i++) {
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

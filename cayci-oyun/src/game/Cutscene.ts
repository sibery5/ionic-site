import * as THREE from 'three';
import type { InputLike as Input } from '../core/input';
import { tx } from '../core/i18n';
import { audio } from '../audio/Audio';
import { cemalLook } from '../entities/Player';
import type { CosmeticSlot } from '../meta/progress';
import { cosmetic } from '../meta/progress';
import { Dialogue } from '../ui/Dialogue';
import { makeCabinet, makeCafeTable, makeCat, makeCeilingLamp, makeChair, makeDesk, makeGlass, makeOcak, makePerson, makePlant, makeTray, mat, sitPose, type PersonRig } from '../world/models';
import { makeCeilingFan, makeCoatRack, makeFrame, makeGlassShelf, makeKey, makeNoticeBoard, makePriceSign, makeRug, makeSemaver, makeWallClock } from '../world/decor';
import { brickTexture, floorTexture, plasterTexture, skyTexture } from '../world/textures';
import type { SceneChoice, SceneDef, SceneLine, SetKind } from './scenes';
import { getLang } from '../core/i18n';

// Ara sahne oynatıcısı: küçük bir set kurar, oyuncuları dizer, konuşana kamerayı çevirir, replikleri yazar.

interface ActorRt {
  id: string;
  rig: PersonRig;
  pitch: number;
  tray?: THREE.Group;
  prop?: THREE.Object3D;
  base: THREE.Vector3;
  t: number;
}

export class Cutscene {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private actors: ActorRt[] = [];
  private dlg: Dialogue;
  private lines: SceneLine[];
  private line = -1;
  private camPos = new THREE.Vector3(0, 2.4, 6);
  private camLook = new THREE.Vector3(0, 1.1, 0);
  private wantPos = new THREE.Vector3(0, 2.4, 6);
  private wantLook = new THREE.Vector3(0, 1.1, 0);
  private time = 0;
  private done = false;
  private animated: { obj: THREE.Object3D; kind: 'fan' | 'clock' }[] = [];
  private keyProp: THREE.Group | null = null;

  constructor(
    private def: SceneDef,
    root: HTMLElement,
    look: Record<CosmeticSlot, string>,
    aspect: number,
    private onDone: () => void,
    private story: { flags: string[]; onChoice: (c: SceneChoice) => void } = { flags: [], onChoice: () => {} },
  ) {
    this.lines = def.lines.slice();
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.05, 120);
    this.buildSet(def.set);
    // yönler otomatik: herkes Cemal ile seyirci arasına, Cemal grubun ortasına bakar
    const cem = def.actors.find((a) => a.id === 'cemal');
    const others = def.actors.filter((a) => a.id !== 'cemal');
    const cx = others.reduce((n, a) => n + a.pos[0], 0) / Math.max(1, others.length);
    const cz = others.reduce((n, a) => n + a.pos[1], 0) / Math.max(1, others.length);
    for (const a of def.actors) {
      const opts = a.look === 'cemal' ? cemalLook(look) : a.look;
      const rig = makePerson(opts);
      rig.root.position.set(a.pos[0], 0, a.pos[1]);
      const tgt = a.id === 'cemal' ? [cx, cz] : cem ? [(cem.pos[0] + 0) / 2, (cem.pos[1] + 4) / 2] : [0, 3];
      a.yaw = Math.atan2(tgt[0] - a.pos[0], tgt[1] - a.pos[1]);
      rig.root.rotation.y = a.yaw;
      if (a.mood) rig.setMood(a.mood);
      if (a.pose === 'sit') {
        sitPose(rig);
        const ch = makeChair();
        ch.position.set(a.pos[0] - Math.sin(a.yaw) * 0.05, 0, a.pos[1] - Math.cos(a.yaw) * 0.05);
        ch.rotation.y = a.yaw + Math.PI;
        this.scene.add(ch);
      }
      this.scene.add(rig.root);
      const rt: ActorRt = { id: a.id, rig, pitch: 110 + ((a.id.charCodeAt(0) * 37 + a.id.length * 53) % 140), base: rig.root.position.clone(), t: Math.random() * 6 };
      if (a.pose === 'tray') {
        rig.armR.rotation.x = -0.5;
        const tc = cosmetic(look.tray);
        const tray = makeTray(tc?.color, tc?.metal);
        for (let i = 0; i < 3; i++) {
          const g = makeGlass(i === 1 ? 'acik' : 'demli', cosmetic(look.glass)?.color);
          const ang = (i / 3) * Math.PI * 2;
          g.group.position.set(Math.cos(ang) * 0.095, 0.006, Math.sin(ang) * 0.095);
          tray.add(g.group);
        }
        this.scene.add(tray);
        rt.tray = tray;
      }
      if (a.id === 'cemal') rt.pitch = 150;
      if (a.id === 'riza') rt.pitch = 95;
      this.actors.push(rt);
    }
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.dlg = new Dialogue(root, tx(def.title), () => this.advance(), () => !this.dlg.choosing && this.finish());
    this.advance();
  }

  // ---------------- set ----------------

  private buildSet(kind: SetKind) {
    const s = this.scene;
    const outdoor = kind === 'teras';
    const dark = kind === 'karanlik' || kind === 'arsiv';
    const arsiv = kind === 'arsiv';
    s.background = outdoor ? skyTexture() : new THREE.Color(dark ? 0x07070a : 0x1a110b);
    s.fog = new THREE.Fog(outdoor ? 0xe8b88a : dark ? 0x07070a : 0x1a110b, outdoor ? 14 : 7, outdoor ? 45 : 16);
    const ft = floorTexture(outdoor ? 'teras' : arsiv ? 'bodrum' : 'han');
    ft.repeat.set(7, 6);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.55 }));
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    const lang = getLang();
    if (!outdoor) {
      const wallM = new THREE.MeshStandardMaterial({ map: arsiv ? brickTexture() : plasterTexture(dark ? '#5a5048' : '#efe2c4'), roughness: 1 });
      if (arsiv) wallM.map!.repeat.set(4, 1.4);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.4), wallM);
      back.position.set(0, 1.7, -2);
      s.add(back);
      const side = new THREE.Mesh(new THREE.PlaneGeometry(8, 3.4), wallM);
      side.position.set(-3.2, 1.7, 1);
      side.rotation.y = Math.PI / 2;
      s.add(side);
      const wains = new THREE.Mesh(new THREE.BoxGeometry(10, 1.0, 0.05), mat(0x5a2f1a, { rough: 0.7 }));
      wains.position.set(0, 0.5, -1.97);
      s.add(wains);
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), mat(0x3a2a1e, { rough: 1 }));
      ceil.rotation.x = Math.PI / 2;
      ceil.position.y = 3.3;
      s.add(ceil);
    }
    if (kind === 'ocak') {
      const oc = makeOcak();
      oc.group.position.set(-1.9, 0, -1.35);
      s.add(oc.group);
      const sem = makeSemaver();
      sem.position.set(-2.25, 0.97, -1.45);
      s.add(sem);
      const shelf = makeGlassShelf(1.4);
      shelf.position.set(-1.7, 0, -1.9);
      s.add(shelf);
      const sign = makePriceSign(lang);
      sign.position.set(0.1, 2.15, -1.96);
      s.add(sign);
      const clock = makeWallClock();
      clock.position.set(1.4, 2.35, -1.96);
      s.add(clock);
      this.animated.push({ obj: clock, kind: 'clock' });
      const f1 = makeFrame('portre', 0.5);
      f1.position.set(2.4, 1.85, -1.96);
      s.add(f1);
      const f2 = makeFrame('eski', 0.6);
      f2.position.set(-3.17, 1.9, 0.4);
      f2.rotation.y = Math.PI / 2;
      s.add(f2);
      s.add(makeRug(3.2, 1.4));
      const cat = makeCat();
      cat.root.position.set(1.8, 0, -0.8);
      cat.root.rotation.y = -0.6;
      s.add(cat.root);
    } else if (arsiv) {
      // bodrum arşivi: dosya dolabı sıraları, tavanda paslı boru, masada lamba
      for (let i = 0; i < 6; i++) {
        const cab = makeCabinet();
        cab.position.set(-2.7 + i * 0.55, 0, -1.65);
        s.add(cab);
      }
      const desk = makeDesk();
      desk.position.set(1.9, 0, -1.0);
      s.add(desk);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 10, 10), mat(0x6a4a36, { rough: 0.6, metal: 0.5 }));
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(0, 3.05, -1.4);
      s.add(pipe);
      const lamp = makeCeilingLamp();
      lamp.position.set(0.2, 3.3, -0.2);
      s.add(lamp);
    } else if (kind === 'ofis' || kind === 'karanlik') {
      const desk = makeDesk();
      desk.position.set(-1.2, 0, -0.95);
      s.add(desk);
      const desk2 = makeDesk();
      desk2.position.set(1.3, 0, -1.1);
      s.add(desk2);
      const cab = makeCabinet();
      cab.position.set(2.6, 0, -1.6);
      s.add(cab);
      const plant = makePlant();
      plant.position.set(-2.6, 0, -1.4);
      s.add(plant);
      const board = makeNoticeBoard(lang);
      board.position.set(0.1, 1.85, -1.96);
      s.add(board);
      const f = makeFrame(dark ? 'galata' : 'vapur', 0.7);
      f.position.set(-1.4, 1.95, -1.96);
      s.add(f);
      const f2 = makeFrame('lale', 0.45);
      f2.position.set(1.7, 2.0, -1.96);
      s.add(f2);
      const rack = makeCoatRack();
      rack.position.set(-2.8, 0, 0.3);
      s.add(rack);
      const fan = makeCeilingFan();
      fan.position.set(0, 3.3, 0);
      s.add(fan);
      this.animated.push({ obj: fan, kind: 'fan' });
    } else {
      // teras: korkuluk, uzak kubbeler ve kule, kafe masaları, ip lambalar
      const rail = mat(0x2a2a2a, { rough: 0.5, metal: 0.4 });
      for (let x = -5; x <= 5; x += 0.5) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.0, 0.04), rail);
        p.position.set(x, 0.5, -2.4);
        s.add(p);
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.06, 0.08), rail);
      top.position.set(0, 1.0, -2.4);
      s.add(top);
      const dome = mat(0x9aa0a8, { rough: 0.7 });
      for (const [x, z, r] of [
        [-6, -18, 2.4],
        [-2.5, -22, 3.2],
        [7, -20, 2],
      ]) {
        const d = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), dome);
        d.position.set(x, -2.5, z - 14);
        s.add(d);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 3, 16), mat(0xd8cfc0));
        base.position.set(x, -4, z - 14);
        s.add(base);
      }
      for (const x of [-4.5, 4.2]) {
        const min = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 8, 10), mat(0xe8e0d0));
        min.position.set(x, -1.5, -33);
        s.add(min);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.4, 10), dome);
        cone.position.set(x, 3.2, -33);
        s.add(cone);
      }
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 9, 12), mat(0xb8a890));
      tower.position.set(2.5, -1, -42);
      s.add(tower);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.6, 12), mat(0x4a5a6a));
      cap.position.set(2.5, 4.8, -42);
      s.add(cap);
      for (const [x, z] of [
        [-2.2, -1.2],
        [2.4, -1.4],
      ]) {
        const tb = makeCafeTable();
        tb.position.set(x, 0, z);
        s.add(tb);
      }
      // ip lambalar
      const bulb = mat(0xfff1c8, { emissive: 0xffc86a });
      for (let i = 0; i <= 16; i++) {
        const x = -4 + i * 0.5;
        const y = 2.7 - Math.sin((i / 16) * Math.PI) * 0.4;
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), bulb);
        b.position.set(x, y, -1.8);
        s.add(b);
      }
    }
    if (!outdoor) {
      for (const x of kind === 'karanlik' ? [] : [-1.5, 1.5]) {
        const l = makeCeilingLamp();
        l.position.set(x, 3.3, -0.4);
        s.add(l);
      }
    }
    // ışık
    s.add(new THREE.HemisphereLight(outdoor ? 0xffe2c0 : 0xfff1dc, outdoor ? 0x6a5040 : 0x3a2a1a, dark ? 0.12 : outdoor ? 0.9 : 0.6));
    const key = new THREE.SpotLight(dark ? 0xffc070 : outdoor ? 0xffb070 : 0xffe2b8, dark ? 30 : 60, 16, 0.6, 0.6, 1.4);
    key.position.set(dark ? 0.6 : 2.5, dark ? 2.6 : 5, dark ? 1.8 : 3.5);
    key.target.position.set(0, 1, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    s.add(key, key.target);
    const rim = new THREE.PointLight(dark ? 0x4a7aff : 0xff8a4a, dark ? 8 : 1.6, 7);
    rim.position.set(-2.2, 2.4, 0.5);
    s.add(rim);
    if (outdoor) {
      const sun = new THREE.DirectionalLight(0xffb878, 1.4);
      sun.position.set(-6, 5, 4);
      s.add(sun);
    }
  }

  // ---------------- akış ----------------

  private actor(id: string) {
    return this.actors.find((a) => a.id === id);
  }

  private advance() {
    if (this.done) return;
    this.line++;
    // bayrağa bağlı replikler: koşulu tutmayanları atla
    const ok = (x: SceneLine) => (!x.if || this.story.flags.includes(x.if)) && (!x.unless || !this.story.flags.includes(x.unless));
    while (this.lines[this.line] && !ok(this.lines[this.line])) this.line++;
    const l = this.lines[this.line];
    if (!l) return this.finish();
    const a = this.actor(l.who);
    const name = this.def.actors.find((x) => x.id === l.who)?.name;
    this.dlg.say(name ? tx(name) : '', tx(l.text));
    if (a) {
      if (l.mood) a.rig.setMood(l.mood);
      audio.babble(a.pitch, Math.min(9, 3 + Math.floor(tx(l.text).length / 18)));
      // kamera seyirci tarafından konuşana yaklaşır (aradaki kimse kadrajı kapatmasın)
      const anchor = new THREE.Vector3(a.base.x * 0.35 + (this.line % 2 ? 0.5 : -0.5), 0, 4.5);
      const dir = anchor.sub(a.base).setY(0).normalize();
      this.wantPos.copy(a.base).addScaledVector(dir, a.id === 'cemal' ? 2.2 : 2.6).setY(1.6);
      this.wantLook.copy(a.base).setY(1.3);
      if (l.beat === 'key') this.showKey(a);
      if (l.beat === 'envelope') this.showEnvelope(a);
    }
    if (l.choice) {
      const opts = l.choice;
      this.dlg.choices(
        opts.map((c) => tx(c.text)),
        (i) => {
          const c = opts[i];
          // aynı sorunun eski cevabı (sahne yeniden izlendiyse) silinir
          for (const o of opts) {
            const k = this.story.flags.indexOf(o.flag);
            if (k >= 0) this.story.flags.splice(k, 1);
          }
          this.story.flags.push(c.flag);
          this.story.onChoice(c);
          audio.click();
          // seçimin hemen ardından oynayacak replikler
          if (c.then?.length) this.lines.splice(this.line + 1, 0, ...c.then);
          this.advance();
        },
      );
    }
  }

  private showKey(a: ActorRt) {
    if (this.keyProp) return;
    this.keyProp = makeKey();
    a.rig.armR.rotation.x = -1.3;
    this.scene.add(this.keyProp);
    a.prop = this.keyProp;
    audio.jingle();
  }

  private showEnvelope(a: ActorRt) {
    if (a.prop) return;
    const env = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.13, 0.02), mat(0xe8d8b0));
    a.rig.armR.rotation.x = -1.2;
    this.scene.add(env);
    a.prop = env;
  }

  private finish() {
    if (this.done) return;
    this.done = true;
    this.dlg.close();
    this.onDone();
  }

  update(dt: number, input: Input) {
    if (this.done) return;
    this.time += dt;
    // önceki ekrandan kalan tuş basışı yeni sahneyi atlatmasın
    if (this.time > 0.4 && input.wasPressed('Escape') && !this.dlg.choosing) return this.finish();
    if (this.dlg.choosing) for (let i = 1; i <= 4; i++) if (input.wasPressed(`Digit${i}`) || input.wasPressed(`Numpad${i}`)) this.dlg.choose(i - 1);
    if (input.wasPressed('KeyE') || input.wasPressed('Space') || input.wasPressed('Enter')) this.dlg.next();
    this.dlg.update(dt);
    const k = 1 - Math.exp(-2.2 * dt);
    this.camPos.lerp(this.wantPos, k);
    this.camLook.lerp(this.wantLook, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    const speaking = this.lines[this.line]?.who;
    for (const a of this.actors) {
      a.t += dt;
      a.rig.blink(dt);
      a.rig.torso.scale.y = 1 + Math.sin(a.t * 1.6) * 0.01;
      a.rig.head.rotation.x = a.id === speaking && this.dlg.typing ? Math.sin(a.t * 16) * 0.06 : 0;
      a.rig.head.rotation.y = Math.sin(a.t * 0.5) * 0.12;
      a.rig.root.updateMatrixWorld(true);
      const hand = a.rig.hand.getWorldPosition(new THREE.Vector3());
      if (a.tray) {
        a.tray.position.copy(hand).add(new THREE.Vector3(Math.sin(a.t * 1.3) * 0.01, -0.42, 0));
        a.tray.rotation.z = Math.sin(a.t * 1.3) * 0.03;
      }
      if (a.prop) a.prop.position.copy(hand).add(new THREE.Vector3(0, 0.05, 0));
    }
    for (const an of this.animated) {
      if (an.kind === 'fan') {
        const b = an.obj.getObjectByName('blades');
        if (b) b.rotation.y += dt * 4;
      } else {
        const m = an.obj.getObjectByName('minute');
        if (m) m.rotation.z -= dt * 0.1;
      }
    }
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.done = true;
    this.dlg.close();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry?.dispose();
    });
  }
}

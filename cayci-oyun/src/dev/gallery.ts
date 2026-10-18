import * as THREE from 'three';
import { DAYS } from '../game/story';
import { cemalLook } from '../entities/Player';
import { cosmetic } from '../meta/progress';
import { makeCat, makeCeilingLamp, makeChair, makeDesk, makeGlass, makeOcak, makePerson, makePlant, makeTray, sitPose, mat } from '../world/models';
import { TraySim } from '../physics/tray';
import { TrayView } from '../entities/TrayView';
import { floorTexture } from '../world/textures';

/** Tanıtım görseli: karakterler ve eşyalar yan yana. */
export function buildGallery(kind: 'cast' | 'props' | 'wardrobe' | 'keyart', aspect = 16 / 9): { scene: THREE.Scene; camera: THREE.PerspectiveCamera } {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a1a10);
  const ft = floorTexture('han');
  ft.repeat.set(12, 6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 14), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.6 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), mat(0xf2e3c2, { rough: 1 }));
  back.position.set(0, 3, -2);
  scene.add(back);
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x6b4a33, 1.1));
  const key = new THREE.DirectionalLight(0xffe2b0, 2);
  key.position.set(3, 6, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 6, bottom: -2 });
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 50);

  if (kind === 'keyart') return keyArt(aspect);
  if (kind === 'cast') {
    const cemal = makePerson(cemalLook({ hat: 'hat-fez' }));
    cemal.root.position.set(-4.0, 0, 0);
    cemal.armR.rotation.x = -0.5;
    cemal.root.rotation.y = -0.2;
    const tray = makeTray();
    tray.position.set(-4.32, 0.58, 0.42);
    for (let i = 0; i < 3; i++) {
      const g = makeGlass(i === 1 ? 'acik' : 'demli');
      const a = (i / 3) * Math.PI * 2;
      g.group.position.set(Math.cos(a) * 0.095, 0.006, Math.sin(a) * 0.095);
      tray.add(g.group);
    }
    scene.add(cemal.root, tray);
    const looks = [DAYS[0].offices[0], DAYS[0].offices[1], DAYS[1].offices[2], DAYS[2].offices[0], DAYS[3].offices[0], DAYS[4].offices[0], DAYS[4].offices[2]];
    looks.forEach((o, i) => {
      const p = makePerson({ ...o.look });
      p.root.position.set(-2.75 + i * 0.93, 0, -0.2 + (i % 2) * 0.3);
      p.root.rotation.y = -0.15 + (i % 3) * 0.1;
      if (i === 5) {
        sitPose(p);
        const chair = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 0.42), mat(0x3a2a1a));
        chair.position.set(p.root.position.x, 0.23, p.root.position.z - 0.1);
        scene.add(chair);
      }
      scene.add(p.root);
    });
    // Gülsüm Abla, paspasıyla
    const mopper = makePerson({ shirt: 0x8a9a5b, pants: 0x3b3b3b, skin: 0xc68a5f, hair: 0x2a1a10, scarf: 0x2d6a8a, mop: true });
    mopper.root.position.set(3.85, 0, -0.3);
    mopper.root.rotation.y = -0.4;
    scene.add(mopper.root);
    const cat = makeCat();
    cat.root.position.set(4.6, 0, 0.6);
    cat.root.rotation.y = -0.8;
    scene.add(cat.root);
    camera.position.set(0.3, 1.25, 9.8);
    camera.lookAt(0.3, 0.8, 0);
  } else if (kind === 'wardrobe') {
    // dolaptaki kıyafetler: aynı Cemal, beş farklı görünüş
    const outfits = [
      { tray: 'tray-nickel', vest: 'vest-black', hat: 'hat-none', glass: 'glass-plain' },
      { tray: 'tray-copper', vest: 'vest-red', hat: 'hat-cap', glass: 'glass-plain' },
      { tray: 'tray-brass', vest: 'vest-navy', hat: 'hat-fez', glass: 'glass-gold' },
      { tray: 'tray-gold', vest: 'vest-green', hat: 'hat-chef', glass: 'glass-crystal' },
      { tray: 'tray-tulip', vest: 'vest-gold', hat: 'hat-crown', glass: 'glass-gold' },
    ];
    outfits.forEach((look, i) => {
      const p = makePerson(cemalLook(look));
      const x = -3.2 + i * 1.6;
      p.root.position.set(x, 0, 0);
      p.root.rotation.y = -0.35;
      p.armR.rotation.x = -0.5;
      scene.add(p.root);
      const tc = cosmetic(look.tray);
      const tray = makeTray(tc?.color, tc?.metal);
      tray.position.set(x - 0.42, 0.58, 0.32);
      for (let k = 0; k < 3; k++) {
        const g = makeGlass(k === 1 ? 'acik' : 'demli', cosmetic(look.glass)?.color);
        const a = (k / 3) * Math.PI * 2;
        g.group.position.set(Math.cos(a) * 0.095, 0.006, Math.sin(a) * 0.095);
        tray.add(g.group);
      }
      scene.add(tray);
    });
    camera.position.set(0, 1.25, 8.6);
    camera.lookAt(0, 0.95, 0);
  } else {
    // yakın plan: askılı tepsi ve ince belli bardaklar
    const tray = makeTray();
    tray.position.set(0, 0.9, 0.6);
    tray.rotation.x = 0.12;
    for (let i = 0; i < 3; i++) {
      const g = makeGlass(i === 1 ? 'acik' : 'demli');
      const a = (i / 3) * Math.PI * 2 + 0.4;
      g.group.position.set(Math.cos(a) * 0.095, 0.006, Math.sin(a) * 0.095);
      tray.add(g.group);
    }
    scene.add(tray);
    const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 1), mat(0xe0ac7e));
    hand.position.set(0, 0.9 + 0.42 + 0.03, 0.6);
    scene.add(hand);
    camera.position.set(0.55, 1.35, 1.75);
    camera.lookAt(0, 1.02, 0.6);
    camera.fov = 30;
    camera.updateProjectionMatrix();
  }
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return { scene, camera };
}

/** Mağaza kapağı: Cemal, elinde kule tepsi, arkada han salonu, ayağının dibinde Paşa. */
function keyArt(aspect: number): { scene: THREE.Scene; camera: THREE.PerspectiveCamera } {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x24150c);
  scene.fog = new THREE.Fog(0x24150c, 7, 16);
  const ft = floorTexture('han');
  ft.repeat.set(14, 14);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.45 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(24, 7), mat(0xe9d6b0, { rough: 1 }));
  wall.position.set(0, 3.5, -4.5);
  wall.receiveShadow = true;
  scene.add(wall);
  const wainscot = new THREE.Mesh(new THREE.BoxGeometry(24, 1.1, 0.06), mat(0x5a2f1a, { rough: 0.7 }));
  wainscot.position.set(0, 0.55, -4.45);
  scene.add(wainscot);
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x4a2a18, 0.65));
  const key = new THREE.SpotLight(0xffd9a0, 90, 16, 0.55, 0.5, 1.4);
  key.position.set(2.2, 5.5, 4);
  key.target.position.set(0, 1.2, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  scene.add(key, key.target);
  const rim = new THREE.PointLight(0xff5a2a, 12, 7);
  rim.position.set(-2.4, 2.4, -1.2);
  scene.add(rim);
  const fill = new THREE.PointLight(0x7aa0ff, 3, 8);
  fill.position.set(3, 1.6, 1.5);
  scene.add(fill);
  for (const x of [2.6]) {
    const l = makeCeilingLamp();
    l.position.set(x, 3.4, -2.6);
    scene.add(l);
  }
  // arka plan: masalar, müşteriler, ocak
  const desks: [number, number, number][] = [
    [-5.6, -2.6, 0.4],
    [2.4, -3.3, -0.3],
  ];
  const looks = [DAYS[1].offices[0].look, DAYS[3].offices[1].look];
  desks.forEach(([x, z, r], i) => {
    const d = makeDesk();
    d.position.set(x, 0, z);
    d.rotation.y = r;
    scene.add(d);
    const ch = makeChair();
    ch.position.set(x, 0, z - 0.7);
    ch.rotation.y = r;
    scene.add(ch);
    const p = makePerson({ ...looks[i] });
    sitPose(p);
    p.root.position.set(x, 0, z - 0.62);
    p.root.rotation.y = r;
    p.setMood('happy');
    scene.add(p.root);
  });
  const oc = makeOcak();
  oc.group.position.set(-4.8, 0, -1.2);
  oc.group.rotation.y = 0.9;
  scene.add(oc.group);
  for (const [x, z] of [
    [4.6, -1.4],
    [-1.9, -3.6],
  ]) {
    const pl = makePlant();
    pl.position.set(x, 0, z);
    scene.add(pl);
  }

  // Cemal: kameraya dönük, sağ elinde 10 bardaklık kule
  const cemal = makePerson(cemalLook({ hat: 'hat-fez', tray: 'tray-brass', glass: 'glass-gold', vest: 'vest-red' }));
  cemal.root.rotation.y = 0.32;
  cemal.setMood('happy');
  scene.add(cemal.root);
  cemal.root.updateMatrixWorld(true);
  // kolu tepsiye doğru kaldır
  cemal.armR.rotation.x = -0.95;
  cemal.armR.rotation.z = -0.35;
  cemal.armL.rotation.z = 0.12;
  cemal.root.updateMatrixWorld(true);
  const hand = cemal.hand.getWorldPosition(new THREE.Vector3());
  const sim = new TraySim();
  sim.capacity = 12;
  sim.hasJar = true;
  sim.reset(hand);
  for (let i = 0; i < 10; i++) sim.addGlass(i % 3 === 1 ? 'acik' : 'demli', 0.92, 85, 1);
  sim.reset(hand);
  const view = new TrayView({ tray: 'tray-brass', glass: 'glass-gold' });
  view.sync(sim);
  view.setJar(true, 120);
  scene.add(view.group);

  const cat = makeCat();
  cat.root.position.set(-0.75, 0, 0.55);
  cat.root.rotation.y = 0.9;
  scene.add(cat.root);

  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  const camera = new THREE.PerspectiveCamera(aspect > 1.6 ? 34 : 40, aspect, 0.1, 60);
  // geniş kapakta Cemal sağda dursun ki logo sola sığsın; dik kapakta ortada
  const off = aspect > 1.3 ? -1.25 : 0;
  camera.position.set(off + 0.2, 1.35, aspect > 1.3 ? 4.6 : 5.2);
  // kareye yakın dik kapakta logo yer kaplar: Cemal biraz aşağıda dursun
  camera.lookAt(off + 0.1, aspect > 0.75 && aspect < 1.3 ? 1.38 : 1.05, 0);
  return { scene, camera };
}

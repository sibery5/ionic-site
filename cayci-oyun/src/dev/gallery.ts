import * as THREE from 'three';
import { DAYS } from '../game/story';
import { makeCat, makeGlass, makePerson, makeTray, sitPose, mat } from '../world/models';
import { floorTexture } from '../world/textures';

/** Tanıtım görseli: karakterler ve eşyalar yan yana. */
export function buildGallery(kind: 'cast' | 'props'): { scene: THREE.Scene; camera: THREE.PerspectiveCamera } {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a1a10);
  const ft = floorTexture('han');
  ft.repeat.set(12, 6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.6 }));
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

  if (kind === 'cast') {
    const cemal = makePerson({ shirt: 0xf4f1ea, pants: 0x1c1c22, skin: 0xe0ac7e, hair: 0x1a120c, vest: 0x15151a, mustache: true });
    cemal.root.position.set(-4.2, 0, 0);
    cemal.armR.rotation.x = -0.5;
    const tray = makeTray();
    tray.position.set(-3.88, 0.58, 0.42);
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
      p.root.position.set(-2.8 + i * 1.05, 0, -0.2 + (i % 2) * 0.3);
      p.root.rotation.y = -0.15 + (i % 3) * 0.1;
      if (i === 5) {
        sitPose(p);
        const chair = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 0.42), mat(0x3a2a1a));
        chair.position.set(p.root.position.x, 0.23, p.root.position.z - 0.1);
        scene.add(chair);
      }
      scene.add(p.root);
    });
    const cat = makeCat();
    cat.root.position.set(4.6, 0, 0.5);
    cat.root.rotation.y = -0.8;
    scene.add(cat.root);
    camera.position.set(0.15, 1.15, 10.6);
    camera.lookAt(0.15, 0.82, 0);
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

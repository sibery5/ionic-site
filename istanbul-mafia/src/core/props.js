// Hazır (CC0) modeller: assets/props/*.glb (scripts/assets/pack-props.py üretir; kaynak assets/props/KAYNAK.md).
// Yükleme ekranında bir kez okunur; yüklenemeyen model için çağıran kodla üretilen modele döner.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readBin } from '../entities/charMH.js';

const LIST = ['pistol', 'sniper'];
const PARTS = new Map();
let ready = null;
export function propsReady(timeoutMs = 20000) {
  if (!ready) {
    const loader = new GLTFLoader();
    const one = (n) => readBin('props/' + n + '.glb').then((buf) => new Promise((res, rej) => loader.parse(buf, '', res, rej))).then((gltf) => {
      const parts = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => { if (o.isMesh) { if (o.material.map) o.material.map.anisotropy = 4; parts.push({ geo: o.geometry, mat: o.material }); } });
      if (parts.length) PARTS.set(n, parts);
    }).catch(() => {});
    ready = typeof window === 'undefined' ? Promise.resolve(0) : Promise.race([Promise.all(LIST.map(one)), new Promise((r) => setTimeout(r, timeoutMs))]).then(() => PARTS.size);
  }
  return ready;
}
// [{ geo, mat }] ya da null
export const propParts = (name) => PARTS.get(name) || null;
void THREE;

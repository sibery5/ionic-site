import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Sabit sahne parçalarını malzemeye göre birleştirir: yüzlerce küçük masa, sandalye, duvar süsü tek tek çizilmek yerine
// malzeme başına bir çizim çağrısına iner (gölge geçişi dahil). Hareket eden, adı olan ya da gizli parçalara dokunmaz.

export function bakeStatic(root: THREE.Object3D, keep: Iterable<THREE.Object3D> = []) {
  const skip = new Set(keep);
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; meshes: THREE.Mesh[] }>();
  const locked = (o: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (skip.has(p) || p.name || !p.visible) return true;
    return false;
  };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return;
    if (Array.isArray(m.material)) return;
    const g = m.geometry;
    if (Object.keys(g.morphAttributes).length || locked(m)) return;
    const sig = Object.keys(g.attributes).sort().join(',') + (g.index ? ':i' : ':n');
    const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}|${sig}`;
    let e = groups.get(key);
    if (!e) groups.set(key, (e = { mat: m.material, cast: m.castShadow, recv: m.receiveShadow, meshes: [] }));
    e.meshes.push(m);
  });
  let before = 0;
  let after = 0;
  const mtx = new THREE.Matrix4();
  for (const e of groups.values()) {
    before += e.meshes.length;
    if (e.meshes.length < 2) {
      after += e.meshes.length;
      continue;
    }
    const geos = e.meshes.map((m) => m.geometry.clone().applyMatrix4(mtx.multiplyMatrices(inv, m.matrixWorld)));
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) {
      after += e.meshes.length;
      continue;
    }
    for (const m of e.meshes) m.removeFromParent();
    const out = new THREE.Mesh(merged, e.mat);
    out.castShadow = e.cast;
    out.receiveShadow = e.recv;
    root.add(out);
    after++;
  }
  return { before, after };
}

// Trafik ışıkları: 3+ yollu kavşaklarda direk + kollu sinyal başlıkları, kuzey-güney / doğu-batı fazları.
// Tümü örneklemeli (InstancedMesh) çizilir; lamba renkleri yalnız faz değişince güncellenir.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Faz döngüsü (sn): KG yeşil, KG sarı, tümü kırmızı, DB yeşil, DB sarı, tümü kırmızı
const G = 14, Y = 3, AR = 2;
const CYCLE = 2 * (G + Y + AR);
const RED = 0, YELLOW = 1, GREEN = 2;
const NAMES = ['red', 'yellow', 'green'];
const ON = [new THREE.Color(5, 0.25, 0.12), new THREE.Color(5, 2.6, 0.1), new THREE.Color(0.2, 5, 1.6)];
const OFF = [new THREE.Color(0.12, 0.02, 0.02), new THREE.Color(0.12, 0.08, 0.02), new THREE.Color(0.02, 0.1, 0.05)];

function axisState(t, axis) {
  // axis 0: kuzey-güney, 1: doğu-batı
  const u = (t + (axis ? G + Y + AR : 0)) % CYCLE;
  if (u < G) return GREEN;
  if (u < G + Y) return YELLOW;
  return RED;
}

export class TrafficLights {
  constructor(game) {
    this.game = game;
    this.map = game.map;
    this.t = 0;
    this.byNode = new Map();
    const approaches = [];
    for (const n of this.map.nodes) {
      if (n.edges.length < 3) continue;
      let cross = 0;
      for (const e of n.edges) cross = Math.max(cross, e.width / 2);
      const info = { node: n, offset: ((Math.abs(n.x * 7.13 + n.z * 3.71) | 0) % 4) * 4.5, ap: [], state: [-1, -1], lamp0: approaches.length * 6 };
      for (const e of n.edges) {
        const o = this.map.other(e, n);
        const dx = o.x - n.x, dz = o.z - n.z, l = Math.hypot(dx, dz) || 1;
        let cr = 0;
        for (const e2 of n.edges) if (e2 !== e) cr = Math.max(cr, e2.width / 2);
        const a = { node: n, other: o, dx: dx / l, dz: dz / l, hw: e.width / 2, stop: cr + 5.0, axis: Math.abs(dx) > Math.abs(dz) ? 1 : 0, idx: approaches.length };
        info.ap.push(a);
        approaches.push(a);
      }
      this.byNode.set(n.id, info);
      void cross;
    }
    this.count = approaches.length;
    this.build(approaches);
    this.update(0);
  }

  build(aps) {
    const g = this.game;
    const n = aps.length;
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2f33, metalness: 0.6, roughness: 0.45 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x141618, roughness: 0.6 });
    const pole = (() => {
      const p = new THREE.CylinderGeometry(0.08, 0.1, 5.4, 8); p.translate(0, 2.7, 0);
      const b = new THREE.CylinderGeometry(0.18, 0.22, 0.4, 8); b.translate(0, 0.2, 0);
      return mergeGeometries([p, b]);
    })();
    const arm = new THREE.CylinderGeometry(0.06, 0.06, 1, 6); arm.rotateZ(Math.PI / 2); arm.translate(0.5, 0, 0);
    // sinyal başlığı: gövde + siperlikler (+Z yönüne bakar)
    const head = (() => {
      const parts = [new THREE.BoxGeometry(0.34, 0.95, 0.24)];
      for (let i = 0; i < 3; i++) { const v = new THREE.BoxGeometry(0.3, 0.03, 0.18); v.translate(0, 0.33 - i * 0.3 + 0.13, 0.2); parts.push(v); }
      const bp = new THREE.BoxGeometry(0.5, 1.1, 0.02); bp.translate(0, 0, -0.13); parts.push(bp);
      return mergeGeometries(parts);
    })();
    const lamp = new THREE.CircleGeometry(0.11, 14); lamp.translate(0, 0, 0.125);
    const stopLine = new THREE.PlaneGeometry(1, 0.45); stopLine.rotateX(-Math.PI / 2);
    this.poles = new THREE.InstancedMesh(pole, poleMat, n);
    this.arms = new THREE.InstancedMesh(arm, poleMat, n);
    this.heads = new THREE.InstancedMesh(head, headMat, n * 2);
    this.lamps = new THREE.InstancedMesh(lamp, new THREE.MeshBasicMaterial({ toneMapped: true }), n * 6);
    this.lines = new THREE.InstancedMesh(stopLine, new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }), n);
    for (const m of [this.poles, this.arms, this.heads, this.lamps, this.lines]) m.frustumCulled = false;
    this.poles.castShadow = true;
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
    const cols = g.physics.city;
    for (const a of aps) {
      const n0 = this.nodeOf(a);
      // gelen trafiğin sağı: (dz, -dx)
      const rx = a.dz, rz = -a.dx;
      const px = n0.x + a.dx * (a.stop + 0.4) + rx * (a.hw + 1.0), pz = n0.z + a.dz * (a.stop + 0.4) + rz * (a.hw + 1.0);
      const rot = Math.atan2(a.dx, a.dz);
      Q.setFromAxisAngle(UP, rot);
      M.compose(P.set(px, 0, pz), Q, S.set(1, 1, 1)); this.poles.setMatrixAt(a.idx, M);
      cols.add(px - 0.15, pz - 0.15, px + 0.15, pz + 0.15, 0, 5.5, 'trafik');
      // kol yola doğru uzanır
      const armLen = Math.min(a.hw * 0.75, 5);
      // kolun yerel +X'i yol ortasına
      const q2 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-rx, 0, -rz));
      M.compose(P.set(px, 5.2, pz), q2, S.set(armLen, 1, 1)); this.arms.setMatrixAt(a.idx, M);
      Q.setFromAxisAngle(UP, rot);
      const heads = [[px, 2.9, pz], [px - rx * armLen, 4.75, pz - rz * armLen]];
      heads.forEach(([hx, hy, hz], k) => {
        M.compose(P.set(hx, hy, hz), Q, S.set(1, 1, 1)); this.heads.setMatrixAt(a.idx * 2 + k, M);
        for (let i = 0; i < 3; i++) {
          M.compose(P.set(hx, hy + 0.3 - i * 0.3, hz), Q, S.set(1, 1, 1));
          this.lamps.setMatrixAt(a.idx * 6 + k * 3 + i, M);
        }
      });
      // dur çizgisi (gelen şerit yarısı)
      const lx = n0.x + a.dx * a.stop + rx * a.hw / 2, lz = n0.z + a.dz * a.stop + rz * a.hw / 2;
      M.compose(P.set(lx, 0.03, lz), Q, S.set(a.hw - 0.4, 1, 1)); this.lines.setMatrixAt(a.idx, M);
    }
    for (let i = 0; i < n * 6; i++) this.lamps.setColorAt(i, OFF[0]);
    const grp = new THREE.Group();
    grp.add(this.poles, this.arms, this.heads, this.lamps, this.lines);
    this.group = grp;
    (g.city && g.city.group ? g.city.group : g.scene).add(grp);
  }

  nodeOf(a) { return a.node; }

  // node kavşağına fromNode yönünden gelen araç için ışık: 'red' | 'yellow' | 'green'
  lightState(node, fromNode) {
    const info = node && this.byNode.get(node.id);
    if (!info) return 'green';
    const axis = Math.abs(fromNode.x - node.x) > Math.abs(fromNode.z - node.z) ? 1 : 0;
    return NAMES[axisState(this.t + info.offset, axis)];
  }
  // kavşak merkezinden dur çizgisine uzaklık
  stopOffset(node, fromNode) {
    const info = node && this.byNode.get(node.id);
    if (!info) return 8;
    for (const a of info.ap) if (a.other === fromNode) return a.stop;
    return 8;
  }
  hasLight(node) { return !!(node && this.byNode.has(node.id)); }

  update(dt) {
    this.t += dt;
    let dirty = false;
    for (const info of this.byNode.values()) {
      const s0 = axisState(this.t + info.offset, 0), s1 = axisState(this.t + info.offset, 1);
      if (s0 === info.state[0] && s1 === info.state[1]) continue;
      info.state[0] = s0; info.state[1] = s1;
      dirty = true;
      for (const a of info.ap) {
        const st = a.axis ? s1 : s0;
        for (let k = 0; k < 2; k++) for (let i = 0; i < 3; i++) {
          const lampState = i === 0 ? RED : i === 1 ? YELLOW : GREEN;
          this.lamps.setColorAt(a.idx * 6 + k * 3 + i, st === lampState ? ON[lampState] : OFF[lampState]);
        }
      }
    }
    if (dirty && this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
  }
}

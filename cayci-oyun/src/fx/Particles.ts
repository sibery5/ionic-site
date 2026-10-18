import * as THREE from 'three';
import { PUDDLE } from '../config';
import { softDot } from '../world/textures';

interface P {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  max: number;
  kind: 'drop' | 'shard' | 'spark';
  color: THREE.Color;
}

export interface Puddle {
  x: number;
  z: number;
  r: number;
  life: number;
  mesh: THREE.Mesh;
}

const MAX = 600;

/** Çay damlaları, cam kırıkları, buhar ve gölcükler. */
export class Particles {
  group = new THREE.Group();
  private list: P[] = [];
  private inst: THREE.InstancedMesh;
  private steam: THREE.Sprite[] = [];
  private steamMat: THREE.SpriteMaterial;
  puddles: Puddle[] = [];
  private puddleMat: THREE.MeshStandardMaterial;
  private dummy = new THREE.Object3D();
  onLand: ((x: number, z: number, amount: number) => void) | null = null;

  constructor() {
    this.inst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.2 }), MAX);
    this.inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.inst.count = 0;
    this.inst.frustumCulled = false;
    this.group.add(this.inst);
    this.steamMat = new THREE.SpriteMaterial({ map: softDot(), transparent: true, opacity: 0.35, depthWrite: false });
    this.puddleMat = new THREE.MeshStandardMaterial({ color: 0x7a2a12, roughness: 0.05, transparent: true, opacity: 0.6 });
  }

  spill(at: THREE.Vector3, vel: THREE.Vector3, amount: number, color: number) {
    const n = Math.min(40, Math.ceil(amount * 60));
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      this.add({
        pos: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.1, 0, (Math.random() - 0.5) * 0.1)),
        vel: vel
          .clone()
          .multiplyScalar(0.6)
          .add(new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 1.2, (Math.random() - 0.5) * 1.2)),
        life: 1.5,
        max: 1.5,
        kind: 'drop',
        color: c,
      });
    }
  }

  shatter(at: THREE.Vector3) {
    const c = new THREE.Color(0xdff0f5);
    for (let i = 0; i < 18; i++) {
      this.add({
        pos: at.clone(),
        vel: new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3),
        life: 2.5,
        max: 2.5,
        kind: 'shard',
        color: c,
      });
    }
  }

  sparkle(at: THREE.Vector3, color = 0xf2c230) {
    const c = new THREE.Color(color);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      this.add({
        pos: at.clone(),
        vel: new THREE.Vector3(Math.cos(a) * 2, 1.5 + Math.random(), Math.sin(a) * 2),
        life: 0.9,
        max: 0.9,
        kind: 'spark',
        color: c,
      });
    }
  }

  private add(p: P) {
    if (this.list.length >= MAX) this.list.shift();
    this.list.push(p);
  }

  /** Bardaklardan ve ocaktan yükselen buhar. */
  emitSteam(points: THREE.Vector3[], rate: number, dt: number) {
    for (const p of points) {
      if (Math.random() < rate * dt) {
        const s = new THREE.Sprite(this.steamMat);
        s.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 0.03, 0, (Math.random() - 0.5) * 0.03));
        s.scale.setScalar(0.05);
        s.userData.life = 1.4;
        this.steam.push(s);
        this.group.add(s);
      }
    }
  }

  addPuddle(x: number, z: number, amount: number) {
    // yakında gölcük varsa büyüt
    for (const p of this.puddles) {
      if (Math.hypot(p.x - x, p.z - z) < p.r) {
        p.r = Math.min(0.9, p.r + amount * 0.3);
        p.life = PUDDLE.life;
        p.mesh.scale.setScalar(p.r);
        return;
      }
    }
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 14), this.puddleMat);
    mesh.rotation.x = -Math.PI / 2;
    const r = Math.min(PUDDLE.radius, 0.15 + amount * 0.4);
    mesh.scale.setScalar(r);
    mesh.position.set(x, 0.008 + Math.random() * 0.002, z);
    this.group.add(mesh);
    this.puddles.push({ x, z, r, life: PUDDLE.life, mesh });
  }

  /** Bir noktanın gölcük üstünde olup olmadığı (kayganlık). */
  puddleAt(x: number, z: number): number {
    let s = 0;
    for (const p of this.puddles) if (Math.hypot(p.x - x, p.z - z) < p.r) s = Math.max(s, Math.min(1, p.life / 5));
    return s;
  }

  update(dt: number) {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      if (p.kind !== 'spark') p.vel.y -= 9.81 * dt;
      else p.vel.multiplyScalar(Math.exp(-3 * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.01 && p.kind !== 'spark') {
        p.pos.y = 0.01;
        if (p.kind === 'drop') {
          this.onLand?.(p.pos.x, p.pos.z, 0.02);
          this.list.splice(i, 1);
          continue;
        }
        p.vel.set(p.vel.x * 0.3, 0, p.vel.z * 0.3);
      }
    }
    for (const p of this.list) {
      const s = p.kind === 'drop' ? 0.012 : p.kind === 'shard' ? 0.02 : 0.02 * (p.life / p.max);
      this.dummy.position.copy(p.pos);
      this.dummy.scale.set(s, p.kind === 'shard' ? s * 0.3 : s, s);
      this.dummy.rotation.set(p.life * 7, p.life * 5, 0);
      this.dummy.updateMatrix();
      this.inst.setMatrixAt(n, this.dummy.matrix);
      this.inst.setColorAt(n, p.color);
      n++;
    }
    this.inst.count = n;
    this.inst.instanceMatrix.needsUpdate = true;
    if (this.inst.instanceColor) this.inst.instanceColor.needsUpdate = true;

    for (let i = this.steam.length - 1; i >= 0; i--) {
      const s = this.steam[i];
      s.userData.life -= dt;
      s.position.y += dt * 0.25;
      s.position.x += Math.sin(s.userData.life * 4) * dt * 0.02;
      s.scale.setScalar(0.05 + (1.4 - s.userData.life) * 0.09);
      if (s.userData.life <= 0) {
        this.group.remove(s);
        this.steam.splice(i, 1);
      }
    }
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const p = this.puddles[i];
      p.life -= dt;
      if (p.life < 5) p.mesh.scale.setScalar(p.r * Math.max(0.01, p.life / 5));
      if (p.life <= 0) {
        this.group.remove(p.mesh);
        p.mesh.geometry.dispose();
        this.puddles.splice(i, 1);
      }
    }
  }

  dispose() {
    this.group.clear();
  }
}

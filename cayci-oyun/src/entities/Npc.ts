import * as THREE from 'three';
import { NPC } from '../config';
import { Grid } from '../physics/grid';
import { animateWalk, makePerson, PersonRig } from '../world/models';
import type { Rng } from '../core/rng';

const SHIRTS = [0x4f7cac, 0x9b3d6b, 0x3a8a6a, 0xc9b26b, 0x6b4226, 0x2d6a8a, 0x8a9a5b, 0xb3261e, 0x5b5b6b];
const PANTS = [0x222831, 0x3b3b3b, 0x4a3a2a, 0x2e3a4a, 0x1f1f1f];
const SKINS = [0xf1c7a1, 0xe0ac7e, 0xc68a5f, 0x9a6440];
const HAIRS = [0x1a120c, 0x3a2a1a, 0x6b3a1a, 0x9a9a9a, 0xd8d8d8, 0xb08040];

/** Koridorda dolaşan han sakinleri. */
export class Npc {
  rig: PersonRig;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  radius = NPC.radius;
  private path: [number, number][] = [];
  private wait = 0;
  private phase = Math.random() * 10;
  private yaw = 0;

  constructor(
    private grid: Grid,
    private points: [number, number][],
    private rng: Rng,
  ) {
    const scarf = rng.next() < 0.25 ? rng.pick([0xb3261e, 0x2d6a8a, 0x8a9a5b, 0x5b2c83]) : undefined;
    this.rig = makePerson({
      shirt: rng.pick(SHIRTS),
      pants: rng.pick(PANTS),
      skin: rng.pick(SKINS),
      hair: rng.pick(HAIRS),
      bald: !scarf && rng.next() < 0.2,
      scarf,
      glasses: rng.next() < 0.3,
      mustache: !scarf && rng.next() < 0.4,
      tie: rng.next() < 0.3 ? rng.pick([0x1e2a3a, 0x6b2a2a]) : undefined,
      briefcase: rng.next() < 0.35,
      height: 0.95 + rng.next() * 0.1,
    });
    const start = rng.pick(points);
    const [x, z] = Grid.center(start[0], start[1]);
    this.pos.set(x, 0, z);
    this.wait = rng.range(0, 2);
  }

  update(dt: number, avoid: THREE.Vector3) {
    if (this.wait > 0) {
      this.wait -= dt;
      this.vel.multiplyScalar(0.8);
    } else if (!this.path.length) {
      const [cx, cz] = Grid.cellOf(this.pos.x, this.pos.z);
      const goal = this.rng.pick(this.points);
      this.path = this.grid.path([cx, cz], goal) ?? [];
      this.path.shift();
      this.wait = this.rng.range(0.5, 3);
    } else {
      const [tx, tz] = Grid.center(this.path[0][0], this.path[0][1]);
      const d = new THREE.Vector3(tx - this.pos.x, 0, tz - this.pos.z);
      const l = d.length();
      if (l < 0.15) this.path.shift();
      else {
        d.multiplyScalar(NPC.speed / l);
        // oyuncudan hafifçe kaçın (ama tamamen değil: kalabalık olsun)
        const away = new THREE.Vector3().subVectors(this.pos, avoid).setY(0);
        const al = away.length();
        if (al < 1.0 && al > 1e-3) d.addScaledVector(away, (1.0 - al) * 0.8 / al);
        this.vel.lerp(d, 1 - Math.exp(-6 * dt));
      }
    }
    this.pos.addScaledVector(this.vel, dt);
    this.grid.resolveCircle(this.pos, this.radius, 0);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.1) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      let dy = target - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * (1 - Math.exp(-8 * dt));
    }
    this.phase += sp * dt * 5.5;
    animateWalk(this.rig, this.phase, Math.min(1, sp / 1.2));
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
  }
}

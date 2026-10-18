import * as THREE from 'three';
import { CAT } from '../config';
import { Grid } from '../physics/grid';
import { CatRig, makeCat } from '../world/models';
import type { Rng } from '../core/rng';

/** Han kedisi Paşa: oyuncunun ayağına dolanır. */
export class Cat {
  rig: CatRig;
  pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private yaw = 0;
  private mode: 'nap' | 'follow' | 'flee' = 'nap';
  private modeT = 4;
  private t = 0;
  private tripCooldown = 3;
  private fleeDir = new THREE.Vector3();

  constructor(
    private grid: Grid,
    start: [number, number],
    private rng: Rng,
  ) {
    this.rig = makeCat();
    const [x, z] = Grid.center(start[0], start[1]);
    this.pos.set(x, 0, z);
  }

  /** true dönerse oyuncu kediye takıldı. */
  update(dt: number, playerPos: THREE.Vector3, playerSpeed: number): boolean {
    this.t += dt;
    this.modeT -= dt;
    this.tripCooldown -= dt;
    const toPlayer = new THREE.Vector3().subVectors(playerPos, this.pos).setY(0);
    const dist = toPlayer.length();
    let tripped = false;

    if (this.modeT <= 0) {
      if (this.mode === 'nap') {
        this.mode = 'follow';
        this.modeT = this.rng.range(7, 12);
      } else {
        this.mode = 'nap';
        this.modeT = this.rng.range(3, 6);
      }
    }

    const want = new THREE.Vector3();
    if (this.mode === 'follow') {
      if (dist > 0.6) want.copy(toPlayer).normalize().multiplyScalar(CAT.speed * (dist > 3 ? 1.4 : 1));
      else {
        // bacakların arasında sekiz çiz
        const side = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize();
        want.copy(side).multiplyScalar(Math.sin(this.t * 2.2) * CAT.speed).addScaledVector(toPlayer, 0.6);
      }
      if (dist < CAT.tripRadius && playerSpeed > CAT.safeSpeed && this.tripCooldown <= 0) {
        tripped = true;
        this.tripCooldown = CAT.tripCooldown;
        this.mode = 'flee';
        this.modeT = 2;
        this.fleeDir.copy(toPlayer).multiplyScalar(-1).normalize();
      }
    } else if (this.mode === 'flee') {
      want.copy(this.fleeDir).multiplyScalar(CAT.speed * 2.2);
    }
    this.vel.lerp(want, 1 - Math.exp(-5 * dt));
    this.pos.addScaledVector(this.vel, dt);
    this.grid.resolveCircle(this.pos, 0.18, 0);

    const sp = this.vel.length();
    if (sp > 0.05) this.yaw = Math.atan2(this.vel.x, this.vel.z);
    const r = this.rig;
    r.root.position.copy(this.pos);
    r.root.rotation.y = this.yaw;
    r.legs.forEach((l, i) => (l.rotation.x = Math.sin(this.t * 12 + (i % 2) * Math.PI) * 0.6 * Math.min(1, sp)));
    r.tail.rotation.z = Math.sin(this.t * 3) * 0.4;
    if (this.mode === 'nap' && sp < 0.1) {
      r.root.scale.y = 0.75 + Math.sin(this.t * 2) * 0.02;
    } else r.root.scale.y = 1;
    return tripped;
  }
}

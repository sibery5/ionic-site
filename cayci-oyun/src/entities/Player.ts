import * as THREE from 'three';
import { HAND, PLAYER } from '../config';
import { Grid } from '../physics/grid';
import { animateWalk, makePerson, PersonOpts, PersonRig, HatKind } from '../world/models';
import { cosmetic, DEFAULT_LOOK, type CosmeticSlot } from '../meta/progress';
import type { InputLike as Input } from '../core/input';

export interface PlayerStepInfo {
  step: 'walk' | 'run' | 'wet' | null;
  slipped: boolean;
}

export interface PlayerEnv {
  slippery: (x: number, z: number) => number; // 0..1 kayganlık
  shoes: boolean;
  sensitivity: number;
  others: { pos: THREE.Vector3; radius: number }[];
  /** gövdenin en hızlı dönüşü (rad/s); dolu tepsiyle usta yavaş döner, tepsi savrulmaz */
  turnLimit?: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

export class Player {
  rig: PersonRig;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  camYaw = 0; // kameranın yönü (anında)
  private yawVel = 0;
  yaw = 0; // gövdenin yönü (yumuşak takip)
  hand = new THREE.Vector3();
  armOffset = new THREE.Vector2(); // kol modunda: x ileri, y yukarı
  armMode = false;
  raised = false;
  private handJolt = new THREE.Vector3();
  private walkPhase = 0;
  private stepDist = 0;
  private slipCooldown = 0;
  stunned = 0;
  tiptoe = false;
  /** Doluysa el bu ofsete kilitlenir (tek tuş Fırıldak). */
  scriptedArm: [number, number] | null = null;

  constructor(look?: Partial<Record<CosmeticSlot, string>>) {
    this.rig = makePerson(cemalLook(look));
  }

  place(x: number, z: number, yaw: number) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = this.camYaw = yaw;
    this.hand.copy(this.handTarget());
  }

  forward(out = new THREE.Vector3(), yaw = this.yaw) {
    return out.set(Math.sin(yaw), 0, Math.cos(yaw));
  }
  right(out = new THREE.Vector3(), yaw = this.yaw) {
    return out.set(-Math.cos(yaw), 0, Math.sin(yaw));
  }

  handTarget(out = new THREE.Vector3()) {
    const f = this.forward(tmp);
    const r = this.right(tmp2);
    const h = this.raised ? HAND.raisedUp : HAND.rest.up;
    out.copy(this.pos).addScaledVector(UP, h);
    // kol modu: fare X → ileri/geri, fare Y → yukarı/aşağı (yandan dikey bir düzlem)
    out.addScaledVector(r, HAND.rest.side);
    out.addScaledVector(f, HAND.rest.forward + this.armOffset.x);
    out.y += this.armOffset.y;
    return out.add(this.handJolt);
  }

  /** Kedi, çarpışma: elde ani sarsıntı. */
  stumble(strength = 1) {
    this.handJolt.set((Math.random() - 0.5) * 0.25 * strength, -0.18 * strength, (Math.random() - 0.5) * 0.25 * strength);
    this.vel.multiplyScalar(0.25);
    this.stunned = 0.5;
  }

  update(dt: number, input: Input, grid: Grid, env: PlayerEnv): PlayerStepInfo {
    const info: PlayerStepInfo = { step: null, slipped: false };
    // bakış
    this.armMode = input.leftDown || this.scriptedArm !== null;
    if (this.scriptedArm) {
      // tek tuş Fırıldak: eli kod döndürür, fare sadece bakışı çevirir
      this.armOffset.set(this.scriptedArm[0], this.scriptedArm[1]);
      this.camYaw -= input.mouseDX * PLAYER.turnSensitivity * env.sensitivity * 0.3;
    } else if (this.armMode) {
      this.armOffset.x += input.mouseDX * HAND.armSensitivity * env.sensitivity;
      this.armOffset.y -= input.mouseDY * HAND.armSensitivity * env.sensitivity;
      if (this.armOffset.length() > HAND.armRange) this.armOffset.setLength(HAND.armRange);
    } else {
      this.camYaw -= input.mouseDX * PLAYER.turnSensitivity * env.sensitivity;
      this.armOffset.multiplyScalar(Math.exp(-6 * dt));
    }
    this.raised = input.isDown('Space');
    // gövde kamerayı yumuşakça takip eder: ani dönüşler tepsiyi daha az sarsar
    let dy = this.camYaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    if (env.turnLimit === undefined) this.yaw += dy * (1 - Math.exp(-10 * dt));
    else {
      // yük arttıkça dönüş hem yavaşlar hem yumuşar (açısal ivme sınırı): tepsi savrulmaz
      const lim = env.turnLimit;
      const want = Math.max(-lim, Math.min(lim, dy * 10));
      const acc = lim * 3 * dt;
      this.yawVel += Math.max(-acc, Math.min(acc, want - this.yawVel));
      if (Math.abs(this.yawVel * dt) > Math.abs(dy) && Math.sign(this.yawVel) === Math.sign(dy)) this.yawVel = dy / dt;
      this.yaw += this.yawVel * dt;
    }

    // hareket
    const f = this.forward(new THREE.Vector3(), this.camYaw);
    const r = this.right(new THREE.Vector3(), this.camYaw);
    const wish = new THREE.Vector3();
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) wish.add(f);
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) wish.sub(f);
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) wish.add(r);
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) wish.sub(r);
    const running = (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) && !this.armMode;
    this.tiptoe = (input.isDown('ControlLeft') || input.isDown('KeyC')) && !running;
    let speed = running ? PLAYER.runSpeed : this.tiptoe ? PLAYER.tiptoeSpeed : PLAYER.walkSpeed;
    if (this.armMode) speed *= 0.6;
    if (this.stunned > 0) {
      this.stunned -= dt;
      speed *= 0.2;
    }
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);

    const [cx, cz] = Grid.cellOf(this.pos.x, this.pos.z);
    const slip = env.slippery(cx, cz) * (env.shoes ? 0.4 : 1);
    const baseAccel = this.tiptoe ? PLAYER.tiptoeAccel : PLAYER.accel;
    const accel = baseAccel + (PLAYER.slipperyAccel - baseAccel) * slip;
    const dv = tmp.subVectors(wish, this.vel);
    const maxDv = accel * dt;
    if (dv.length() > maxDv) dv.setLength(maxDv);
    this.vel.add(dv);
    if (slip > 0.5 && this.vel.length() > 2 && this.slipCooldown <= 0 && Math.random() < dt * 1.5) {
      // kayma: yana doğru sürüklen
      this.vel.addScaledVector(r, (Math.random() - 0.5) * 2.2);
      this.slipCooldown = 2.5;
      info.slipped = true;
    }
    this.slipCooldown -= dt;

    this.pos.addScaledVector(this.vel, dt);
    const hit = grid.resolveCircle(this.pos, PLAYER.radius, 0);
    if (hit.hit) {
      const n = new THREE.Vector3(hit.nx, 0, hit.nz).normalize();
      const vn = this.vel.dot(n);
      if (vn < 0) this.vel.addScaledVector(n, -vn);
    }
    for (const o of env.others) {
      const d = tmp.subVectors(this.pos, o.pos).setY(0);
      const min = PLAYER.radius + o.radius;
      const l = d.length();
      if (l < min && l > 1e-4) {
        this.pos.addScaledVector(d, (min - l) / l);
        // engelin içine doğru hız kalmasın (yoksa serbest kalınca tepsi sarsılır)
        const vn = this.vel.dot(d) / l;
        if (vn < 0) this.vel.addScaledVector(d, -vn / l);
      }
    }

    // el
    this.handJolt.multiplyScalar(Math.exp(-8 * dt));
    const target = this.handTarget(new THREE.Vector3());
    this.hand.lerp(target, 1 - Math.exp(-HAND.follow * dt));

    // animasyon + adım sesi
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += sp * dt * 5.2;
    animateWalk(this.rig, this.walkPhase, Math.min(1, sp / 2.4), true);
    this.stepDist += sp * dt;
    if (this.stepDist > PLAYER.stepLength) {
      this.stepDist = 0;
      info.step = slip > 0.3 ? 'wet' : sp > 3.2 ? 'run' : 'walk';
    }
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
    this.aimRightArm();
    return info;
  }

  /** Sağ kolu tepsiyi tutan ele doğrult (basit IK). */
  private aimRightArm() {
    const arm = this.rig.armR;
    this.rig.root.updateMatrixWorld(true);
    const shoulder = arm.getWorldPosition(new THREE.Vector3());
    const dirWorld = tmp.subVectors(this.hand, shoulder);
    const dist = dirWorld.length();
    // kolun ebeveyninin (gövde) yerel uzayına çevir
    const parentQ = arm.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
    const local = dirWorld.normalize().applyQuaternion(parentQ);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), local);
    // dirsek yok: el omza yaklaşınca (Fırıldak) kol kısalır ki eli aşmasın
    arm.scale.y = Math.min(1.25, Math.max(0.32, dist / 0.6));
  }
}

/** Cemal'in görünüşü, seçili kozmetiklere göre. */
export function cemalLook(look?: Partial<Record<CosmeticSlot, string>>): PersonOpts {
  const l = { ...DEFAULT_LOOK, ...(look ?? {}) };
  const vest = cosmetic(l.vest);
  const hat = cosmetic(l.hat);
  const hatKind: Record<string, HatKind> = { 'hat-cap': 'cap', 'hat-fez': 'fez', 'hat-chef': 'chef', 'hat-crown': 'crown' };
  return {
    shirt: 0xf4f1ea,
    pants: 0x1c1c22,
    skin: 0xe0ac7e,
    hair: 0x1a120c,
    hairStyle: 'side',
    vest: vest?.color ?? 0x15151a,
    mustache: true,
    tie: 0xb3261e,
    hat: hatKind[l.hat],
    hatColor: hat?.color,
  };
}

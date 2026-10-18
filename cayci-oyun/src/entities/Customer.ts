import * as THREE from 'three';
import type { Office } from '../game/story';
import type { DeskInfo } from '../world/LevelBuilder';
import { makePerson, PersonRig, sitPose } from '../world/models';
import { bubbleTexture } from '../world/textures';

/** Masasında oturan, sipariş veren müşteri. */
export class Customer {
  rig: PersonRig;
  bubble: THREE.Sprite;
  private bubbleKey = '';
  private talkT = 0;
  private angryT = 0;
  private t = Math.random() * 10;
  voicePitch: number;

  constructor(
    public office: Office,
    public desk: DeskInfo,
  ) {
    this.rig = makePerson({ ...office.look });
    sitPose(this.rig);
    this.rig.root.position.copy(desk.seat);
    this.rig.root.rotation.y = Math.atan2(desk.dir.x, desk.dir.z);
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    this.bubble.scale.set(1.3, 0.65, 1);
    this.bubble.position.copy(desk.seat).setY(1.75);
    this.bubble.renderOrder = 10;
    this.bubble.visible = false;
    // her müşterinin kendine özgü ses perdesi (görünüşünden türetilen sabit bir sayı)
    const h = (office.look.shirt ^ (office.look.hair * 7) ^ office.id.charCodeAt(0) * 9973) >>> 0;
    this.voicePitch = 115 + (h % 150);
  }

  /** Siparişi balonda göster. items boşsa balon gizlenir. */
  showOrder(items: string[] | null, urgency: number) {
    if (!items || !items.length) {
      this.bubble.visible = false;
      this.bubbleKey = '';
      return;
    }
    const key = `${items.join(',')}|${urgency > 0.75 ? 1 : 0}`;
    if (key !== this.bubbleKey) {
      this.bubbleKey = key;
      const mat = this.bubble.material as THREE.SpriteMaterial;
      mat.map?.dispose();
      mat.map = bubbleTexture(items, urgency);
      mat.needsUpdate = true;
    }
    this.bubble.visible = true;
  }

  talk() {
    this.talkT = 1.2;
  }
  angry() {
    this.angryT = 1.2;
  }

  update(dt: number) {
    this.t += dt;
    const head = this.rig.head;
    head.rotation.set(0, 0, 0);
    if (this.talkT > 0) {
      this.talkT -= dt;
      head.rotation.x = Math.sin(this.t * 18) * 0.08;
    } else if (this.angryT > 0) {
      this.angryT -= dt;
      head.rotation.y = Math.sin(this.t * 22) * 0.35;
    } else {
      head.rotation.y = Math.sin(this.t * 0.6) * 0.25;
      this.rig.armR.rotation.x = -0.9 + Math.sin(this.t * 1.3) * 0.08;
    }
    if (this.bubble.visible) this.bubble.position.y = 1.72 + Math.sin(this.t * 3) * 0.03;
  }
}

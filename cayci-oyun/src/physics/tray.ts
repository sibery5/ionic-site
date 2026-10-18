import { Vector3 } from 'three';
import { TRAY } from '../config';

// Askılı çay tepsisinin simülasyonu. Render'dan bağımsız, saf matematik: testlerde de çalışır.
//
// Model:
//  - Tepsi, elin (pivot) ucunda rodLength boyunda rijit bir askıya bağlı bir kütle (küresel sarkaç).
//  - Tepsinin normali askı doğrultusunu bir yay-sönümleyiciyle takip eder (tepsi gecikmesi).
//  - Her bardaktaki çay yüzeyi, hissedilen yerçekimini az sönümlü bir yayla takip eder (çalkalanma).
//  - Hissedilen yerçekimi g_his = g − a. İdeal sarkaçta hep askı yönündedir: düzgün sallanırken çay dökülmez.

export const GRAVITY = new Vector3(0, -9.81, 0);

export interface Glass {
  type: 'acik' | 'demli';
  fill: number; // 0..1
  temp: number; // °C
  colorScore: number; // 0.8 / 1.0 / 1.2
  spilled: boolean; // hiç dökülme oldu mu (kusursuz teslim için)
  surface: Vector3; // çay yüzeyinin tepsiye göre eğimi (tepsi düzleminde, |v| = sin açı)
  surfaceVel: Vector3;
}

export interface TrayEvents {
  spilled: number; // bu adımda dökülen toplam doluluk
  flewOff: number; // uçan bardak sayısı
  jerk: number; // tepsinin ani hareket şiddeti (ses için)
  loop: boolean; // tam Fırıldak tamamlandı
}

export interface TrayParams {
  damping: number;
  /** Bilek sürtünmesi: 0 = serbest askı (ideal), 1 = tepsi hep yatay kalır. */
  grip: number;
}

const tmp1 = new Vector3();
const tmp2 = new Vector3();
const tmp3 = new Vector3();
const tmp4 = new Vector3();

export function allowedAngle(fill: number): number {
  // doluluk 0.5 → spillAngleHalf, 1.0 → spillAngleFull; aradaki doğrusal, 0.5'in altı daha toleranslı
  const t = Math.min(1, Math.max(0, (fill - 0.5) / 0.5));
  const base = TRAY.spillAngleHalf + (TRAY.spillAngleFull - TRAY.spillAngleHalf) * t;
  if (fill < 0.5) return base + (0.5 - fill) * 60;
  return base;
}

export class TraySim {
  readonly pivot = new Vector3();
  readonly pos = new Vector3();
  readonly vel = new Vector3();
  readonly normal = new Vector3(0, 1, 0);
  readonly accel = new Vector3();
  readonly felt = new Vector3(0, -9.81, 0);
  glasses: Glass[] = [];
  capacity: number = TRAY.baseCapacity;
  params: TrayParams = { damping: TRAY.damping, grip: TRAY.grip };
  externalAccel = new Vector3(); // rüzgâr vb.

  private prevVel = new Vector3();
  private liftTimer = 0;
  // Fırıldak takibi: tepsi elin üstüne çıktı mı, sonra tekrar altına indi mi
  private loopPhase = 0; // 0: altta, 1: yan, 2: üstte
  private loopSide = new Vector3();

  reset(pivot: Vector3) {
    this.pivot.copy(pivot);
    this.pos.copy(pivot).add(tmp1.set(0, -TRAY.rodLength, 0));
    this.vel.set(0, 0, 0);
    this.prevVel.set(0, 0, 0);
    this.normal.set(0, 1, 0);
    this.felt.copy(GRAVITY);
    for (const g of this.glasses) {
      g.surface.set(0, 0, 0);
      g.surfaceVel.set(0, 0, 0);
    }
    this.loopPhase = 0;
    this.liftTimer = 0;
  }

  addGlass(type: Glass['type'], fill: number, temp: number, colorScore: number): boolean {
    if (this.glasses.length >= this.capacity) return false;
    this.glasses.push({
      type,
      fill,
      temp,
      colorScore,
      spilled: false,
      surface: new Vector3(), // tepsi düzlemindeki eğim vektörü (|v| = sin açı)
      surfaceVel: new Vector3(),
    });
    return true;
  }

  /** Bardağın tepsideki yerel konumu (tepsi düzleminde, merkezden). */
  slotOffset(i: number, n = this.glasses.length): [number, number] {
    if (n <= 1) return [0, 0];
    const r = n <= 3 ? 0.095 : 0.12;
    const a = (i / n) * Math.PI * 2 + Math.PI / 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }

  /** Pivot'u (eli) yeni konuma taşıyıp simülasyonu dt kadar ilerletir. */
  step(newPivot: Vector3, dt: number): TrayEvents {
    const ev: TrayEvents = { spilled: 0, flewOff: 0, jerk: 0, loop: false };
    if (dt <= 0) return ev;
    const L = TRAY.rodLength;
    const sub = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / sub;
    const startPivot = tmp3.copy(this.pivot);
    const pivotVel = tmp4.subVectors(newPivot, startPivot).divideScalar(dt);
    this.prevVel.copy(this.vel);

    for (let s = 1; s <= sub; s++) {
      // pivot'u alt adımlar boyunca doğrusal kaydır
      this.pivot.lerpVectors(startPivot, newPivot, s / sub);
      // yarı-örtük Euler + konum kısıtı (PBD)
      this.vel.addScaledVector(GRAVITY, h).addScaledVector(this.externalAccel, h);
      // eksen sürtünmesi: tepsinin ele göre bağıl hızını sönümle
      const damp = 1 - Math.exp(-this.params.damping * h);
      this.vel.x -= (this.vel.x - pivotVel.x) * damp;
      this.vel.y -= (this.vel.y - pivotVel.y) * damp;
      this.vel.z -= (this.vel.z - pivotVel.z) * damp;
      this.pos.addScaledVector(this.vel, h);
      // rijit askı: |pos - pivot| = L
      const d = tmp2.subVectors(this.pos, this.pivot);
      const len = d.length() || 1e-6;
      d.divideScalar(len);
      this.pos.copy(this.pivot).addScaledVector(d, L);
      // bağıl hızın askı yönündeki bileşenini sil (askı uzayıp kısalamaz), teğet hız korunur
      const vRel = tmp1.subVectors(this.vel, pivotVel);
      vRel.addScaledVector(d, -vRel.dot(d));
      this.vel.addVectors(pivotVel, vRel);
    }

    // tepsinin ivmesi ve hissedilen yerçekimi
    this.accel.subVectors(this.vel, this.prevVel).divideScalar(dt);
    // aşırı sıçramaları kırp (ilk kare, ışınlanma)
    if (this.accel.length() > 400) this.accel.setLength(400);
    this.felt.copy(GRAVITY).sub(this.accel).add(this.externalAccel);

    // tepsi normali: askı doğrultusu ile dünya yukarısı arasında, bilek sürtünmesine göre
    const rod = tmp1.subVectors(this.pivot, this.pos).normalize();
    const grip = this.params.grip;
    this.normal.set(rod.x * (1 - grip), rod.y * (1 - grip) + grip, rod.z * (1 - grip)).normalize();

    ev.jerk = this.accel.length();

    // havalanma: hissedilen yerçekimi tepsiye bastırmıyorsa
    const press = this.normal.dot(this.felt); // negatifse bardaklar tepsiye bastırılıyor
    if (press > TRAY.liftThreshold && this.glasses.length > 0) {
      this.liftTimer += dt;
      if (this.liftTimer > TRAY.liftTime) {
        ev.flewOff = this.glasses.length;
        this.glasses = [];
        this.liftTimer = 0;
      }
    } else {
      this.liftTimer = Math.max(0, this.liftTimer - dt * 2);
    }

    // çay çalkalanması tepsinin kendi düzleminde: hedef eğim = -g_his'in tepsi düzlemine izdüşümü
    const up = tmp2.copy(this.felt).multiplyScalar(-1);
    const mag = up.length();
    if (mag > 0.5) up.divideScalar(mag);
    else up.copy(this.normal);
    const target = up.addScaledVector(this.normal, -up.dot(this.normal)); // |target| = sin(açı)
    const k = TRAY.sloshStiffness;
    const c = 2 * Math.sqrt(k) * TRAY.sloshDampingRatio;
    for (const g of this.glasses) {
      for (let i = 0; i < sub; i++) {
        g.surfaceVel.x += (k * (target.x - g.surface.x) - c * g.surfaceVel.x) * h;
        g.surfaceVel.y += (k * (target.y - g.surface.y) - c * g.surfaceVel.y) * h;
        g.surfaceVel.z += (k * (target.z - g.surface.z) - c * g.surfaceVel.z) * h;
        g.surface.addScaledVector(g.surfaceVel, h);
      }
      // tepsi düzleminde tut
      g.surface.addScaledVector(this.normal, -g.surface.dot(this.normal));
      g.surfaceVel.addScaledVector(this.normal, -g.surfaceVel.dot(this.normal));
      const sinA = Math.min(1, g.surface.length());
      const ang = (Math.asin(sinA) * 180) / Math.PI;
      const allow = allowedAngle(g.fill);
      if (ang > allow && g.fill > 0) {
        const loss = Math.min(g.fill, (ang - allow) * TRAY.spillRate * dt);
        g.fill -= loss;
        ev.spilled += loss;
        if (loss > 0.002) g.spilled = true;
      }
    }

    this.trackLoop(ev);
    return ev;
  }

  cool(dt: number, rate: number) {
    for (const g of this.glasses) g.temp = Math.max(20, g.temp - rate * dt);
  }

  /** Dışarıdan çarpma (duvar, insan): tepsiyi it. */
  push(dir: Vector3, amount: number) {
    this.vel.addScaledVector(dir, amount);
  }

  private trackLoop(ev: TrayEvents) {
    const rel = tmp1.subVectors(this.pos, this.pivot); // pivot'tan tepsiye
    const h = rel.y / TRAY.rodLength; // -1 altta, +1 üstte
    const horiz = tmp2.set(rel.x, 0, rel.z);
    if (this.loopPhase === 0 && h > -0.2) {
      this.loopPhase = 1;
      this.loopSide.copy(horiz).normalize();
    } else if (this.loopPhase === 1) {
      if (h > 0.75) this.loopPhase = 2;
      else if (h < -0.6) this.loopPhase = 0;
    } else if (this.loopPhase === 2) {
      // tepeden geçip karşı taraftan inmeli
      if (h < -0.6) {
        const side = horiz.lengthSq() > 1e-6 ? horiz.normalize().dot(this.loopSide) : 0;
        if (side < 0.5) ev.loop = true;
        this.loopPhase = 0;
      }
    }
  }
}

export function clamp(x: number, a: number, b: number) {
  return x < a ? a : x > b ? b : x;
}

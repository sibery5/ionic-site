import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { TraySim, allowedAngle } from '../src/physics/tray';
import { TRAY } from '../src/config';

function makeTray(n = 3) {
  const t = new TraySim();
  t.reset(new Vector3(0, 1.05, 0));
  for (let i = 0; i < n; i++) t.addGlass('demli', 0.92, 85, 1);
  return t;
}

const DT = 1 / 60;

function totalFill(t: TraySim) {
  return t.glasses.reduce((s, g) => s + g.fill, 0);
}

describe('TraySim', () => {
  it('dururken çay dökülmez', () => {
    const t = makeTray();
    const p = new Vector3(0, 1.05, 0);
    for (let i = 0; i < 300; i++) t.step(p, DT);
    expect(totalFill(t)).toBeCloseTo(0.92 * 3, 5);
  });

  it('askı boyu korunur', () => {
    const t = makeTray();
    const p = new Vector3(0, 1.05, 0);
    for (let i = 0; i < 120; i++) {
      p.x += 0.03;
      t.step(p, DT);
      expect(t.pos.distanceTo(t.pivot)).toBeCloseTo(TRAY.rodLength, 4);
    }
  });

  it('yumuşak hızlanma neredeyse hiç döküntü yapmaz', () => {
    const t = makeTray();
    const p = new Vector3(0, 1.05, 0);
    let v = 0;
    for (let i = 0; i < 240; i++) {
      v = Math.min(2.4, v + 2.0 * DT); // 2 m/s² ile hızlan
      p.x += v * DT;
      t.step(p, DT);
    }
    const lost = 0.92 * 3 - totalFill(t);
    expect(lost).toBeLessThan(0.15);
    expect(t.glasses.length).toBe(3);
  });

  it('koşarken ani duruş çay döker', () => {
    const t = makeTray();
    const p = new Vector3(0, 1.05, 0);
    // 6 m/s² ile hızlanıp sabit hızla koş (oturması için)
    let v = 0;
    for (let i = 0; i < 300; i++) {
      v = Math.min(4.1, v + 6 * DT);
      p.x += v * DT;
      t.step(p, DT);
    }
    const before = totalFill(t);
    // tek karede dur
    for (let i = 0; i < 120; i++) t.step(p, DT);
    expect(before - totalFill(t)).toBeGreaterThan(0.3);
  });

  it('yeterince hızlı Fırıldak bardakları düşürmez ve tur sayılır', () => {
    const t = makeTray();
    t.params.grip = TRAY.gripArmMode;
    t.params.damping = TRAY.dampingArmMode;
    const p = new Vector3(0, 1.05, 0);
    t.vel.set(5.4, 0, 0); // tabanda teğet hız, v² > 5gL
    let loop = false;
    let flew = 0;
    // tek tur (~0,7 sn); pompalamadan ikinci tur zaten yavaşlar
    for (let i = 0; i < 45; i++) {
      const ev = t.step(p, DT);
      loop ||= ev.loop;
      flew += ev.flewOff;
    }
    expect(flew).toBe(0);
    expect(loop).toBe(true);
    expect(t.glasses.length).toBe(3);
  });

  it('yavaş Fırıldak tepede bardakları uçurur', () => {
    const t = makeTray();
    t.params.grip = TRAY.gripArmMode;
    t.params.damping = TRAY.dampingArmMode;
    const p = new Vector3(0, 1.05, 0);
    t.vel.set(4.2, 0, 0); // tepeye zor çıkar, bastırma kuvveti yetmez
    let flew = 0;
    for (let i = 0; i < 90; i++) flew += t.step(p, DT).flewOff;
    expect(flew).toBe(3);
  });

  it('doluluk arttıkça izin verilen açı küçülür', () => {
    expect(allowedAngle(1)).toBeLessThan(allowedAngle(0.6));
    expect(allowedAngle(0.3)).toBeGreaterThan(allowedAngle(0.5));
  });
});

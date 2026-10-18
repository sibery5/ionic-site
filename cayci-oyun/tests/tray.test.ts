import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { TraySim, allowedAngle } from '../src/physics/tray';
import { greedParams } from '../src/game/greedRules';
import { TRAY } from '../src/config';

function makeTray(n = 3) {
  const t = new TraySim();
  t.capacity = Math.max(t.capacity, n);
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

  it('yeni kavanoz eski devrilmenin salınımını taşımaz', () => {
    const t = makeTray(0);
    t.hasJar = true;
    const p = new Vector3(0, 1.05, 0);
    // eli aşağı savur (serbest düşüşten hızlı): kavanoz havalanır ve düşer
    let lost = false;
    let vy = 0;
    for (let i = 0; i < 40 && !lost; i++) {
      vy += 30 * DT; // 3g ile aşağı
      p.y -= vy * DT;
      lost = t.step(p, DT).jarLost;
    }
    expect(lost).toBe(true);
    // ocakta durgun beklerken yeni kavanoz verilir: tekrar devrilmemeli
    for (let i = 0; i < 120; i++) t.step(p, DT);
    t.hasJar = true;
    let again = false;
    for (let i = 0; i < 180; i++) again ||= t.step(p, DT).jarLost;
    expect(again).toBe(false);
  });

  it('parmak ucunda (yavaş ivmeyle) yürünen 10 bardaklık kule devrilmez', () => {
    const t = makeTray(10);
    Object.assign(t.params, greedParams(10));
    const p = new Vector3(0, 1.05, 0);
    let fallen = 0;
    let v = 0;
    // 1,8 m/s² ile 1,5 m/s'ye çık, yürü, aynı ivmeyle dur
    for (let i = 0; i < 400; i++) {
      const target = i < 300 ? 1.5 : 0;
      v += Math.sign(target - v) * Math.min(Math.abs(target - v), 1.8 * DT);
      p.x += v * DT;
      fallen += t.step(p, DT).fallen;
    }
    expect(fallen).toBe(0);
    expect(t.glasses.length).toBe(10);
  });

  it('kuleyle normal ivmeyle ani kalkış üst katı devirir', () => {
    const t = makeTray(10);
    Object.assign(t.params, greedParams(10));
    const p = new Vector3(0, 1.05, 0);
    let fallen = 0;
    let v = 0;
    // 6 m/s² ile koşuya kalk ve aniden dur
    for (let i = 0; i < 200; i++) {
      const target = i < 70 ? 4.1 : 0;
      v += Math.sign(target - v) * Math.min(Math.abs(target - v), 12 * DT);
      p.x += v * DT;
      fallen += t.step(p, DT).fallen;
    }
    expect(fallen).toBeGreaterThan(0);
  });
});

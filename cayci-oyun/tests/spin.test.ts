import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { TraySim } from '../src/physics/tray';
import { SpinDriver, meterAt, spinQuality, SPIN } from '../src/physics/spin';
import { TRAY } from '../src/config';

function run(quality: number, glasses = 3) {
  const t = new TraySim();
  t.capacity = 20;
  const rest = new Vector3(0, 1.05, 0);
  t.reset(rest);
  for (let i = 0; i < glasses; i++) t.addGlass('demli', 0.92, 85, 1);
  t.params.grip = TRAY.gripArmMode;
  t.params.damping = TRAY.dampingArmMode;
  const d = new SpinDriver(quality);
  let loops = 0;
  let flew = 0;
  for (let i = 0; i < 240 && !d.done; i++) {
    const [f, u] = d.step(1 / 60, t.pos.y - t.pivot.y < -0.36);
    t.params.damping = d.braking ? SPIN.brakeDamping : TRAY.dampingArmMode; t.params.catchAssist = d.braking;
    const ev = t.step(new Vector3(f, 1.05 + u, 0), 1 / 60);
    if (ev.loop) loops++;
    flew += ev.flewOff;
  }
  // sakinleşmesi için biraz bekle
  t.params.grip = TRAY.grip;
  t.params.damping = TRAY.damping;
  for (let i = 0; i < 120; i++) flew += t.step(rest, 1 / 60).flewOff;
  return { loops, flew, left: t.glasses.length };
}

describe('tek tuş Fırıldak', () => {
  it('kusursuz zamanlama tam tur attırır, bardak uçmaz', () => {
    const r = run(1);
    expect(r.loops).toBeGreaterThanOrEqual(1);
    expect(r.flew).toBe(0);
  });
  it('kaçırılan zamanlama bardakları uçurur', () => {
    expect(run(0).flew).toBeGreaterThan(0);
  });
  it('gösterge gidip gelir ve yeşil bölge tam kalite verir', () => {
    expect(meterAt(SPIN.meterPeriod / 4)).toBeCloseTo(0.5);
    expect(spinQuality(0.5)).toBe(1);
    expect(spinQuality(0.05)).toBe(0);
  });
});

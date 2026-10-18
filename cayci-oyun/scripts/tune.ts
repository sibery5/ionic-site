// Dengeleme için: farklı hareket senaryolarında ne kadar çay döküldüğünü yazdırır.
import { Vector3 } from 'three';
import { TraySim } from '../src/physics/tray';

const DT = 1 / 60;
function run(name: string, accel: number, profile: (t: number) => number, secs = 6) {
  const tr = new TraySim();
  tr.reset(new Vector3(0, 1.05, 0));
  for (let i = 0; i < 3; i++) tr.addGlass("demli", 0.92, 85, 1);
  const p = new Vector3(0, 1.05, 0);
  let v = 0;
  let flew = 0;
  for (let i = 0; i < secs * 60; i++) {
    const target = profile(i * DT);
    const dv = Math.max(-accel * DT, Math.min(accel * DT, target - v));
    v += dv;
    p.x += v * DT;
    flew += tr.step(p, DT).flewOff;
  }
  const fill = tr.glasses.reduce((s, g) => s + g.fill, 0);
  console.log(`${name.padEnd(34)} kayıp=${(2.76 - fill).toFixed(3)}  uçan=${flew}`);
}
for (const a of [4, 6, 10]) {
  console.log(`--- ivme ${a} m/s²`);
  run('yürü başla', a, () => 2.4);
  run('yürü + dur (2s)', a, (t) => (t < 2 ? 2.4 : 0));
  run('koş + dur (2s)', a, (t) => (t < 2 ? 4.1 : 0));
  run('koş, yürü, koş', a, (t) => (t % 2 < 1 ? 4.1 : 2.4));
}

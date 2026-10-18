// Açgözlü mod dengeleme: tepsideki bardak sayısına göre yürüyüşte ne kadar kayıp olur?
import { Vector3 } from 'three';
import { TraySim } from '../src/physics/tray';
import { greedParams } from '../src/game/greedRules';

const DT = 1 / 60;
function run(n: number, accel: number, profile: (t: number) => number, secs = 5) {
  const tr = new TraySim(); tr.capacity = 30;
  tr.reset(new Vector3(0, 1.05, 0));
  for (let i = 0; i < n; i++) tr.addGlass('demli', 0.92, 85, 1);
  Object.assign(tr.params, greedParams(n));
  const p = new Vector3(0, 1.05, 0);
  let v = 0, fallen = 0, flew = 0;
  for (let i = 0; i < secs * 60; i++) {
    const dv = Math.max(-accel * DT, Math.min(accel * DT, profile(i * DT) - v));
    v += dv; p.x += v * DT;
    const e = tr.step(p, DT); fallen += e.fallen; flew += e.flewOff;
  }
  const fill = tr.glasses.reduce((s, g) => s + g.fill, 0);
  return `kayıp %${Math.round((1 - fill / (n * 0.92)) * 100)} düşen=${fallen + flew}`;
}
for (const n of [3, 6, 8, 10, 12]) {
  console.log(`--- ${n} bardak`, JSON.stringify(greedParams(n)));
  console.log('  yürü+dur      ', run(n, 6, (t) => (t < 2 ? 2.4 : 0)));
  console.log('  yavaş yürü+dur', run(n, 3, (t) => (t < 2.5 ? 1.6 : 0)));
  console.log('  koş+dur       ', run(n, 6, (t) => (t < 2 ? 4.1 : 0)));
}

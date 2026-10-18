// Fırıldak dengeleme: zamanlama kalitesine göre tur başarılı mı?
import { Vector3 } from 'three';
import { TraySim } from '../src/physics/tray';
import { SpinDriver, SPIN } from '../src/physics/spin';
import { TRAY } from '../src/config';
for (const n of [0, 3, 8]) for (const q of [0, 0.59, 0.6, 0.8, 1]) {
  const t = new TraySim(); t.capacity = 20; const rest = new Vector3(0, 1.05, 0); t.reset(rest);
  t.hasJar = true; for (let i = 0; i < n; i++) t.addGlass('demli', 0.92, 85, 1);
  t.params.grip = TRAY.gripArmMode; t.params.damping = TRAY.dampingArmMode;
  const d = new SpinDriver(q); let loops = 0, flew = 0, fallen = 0, spill = 0;
  for (let i = 0; i < 300 && !d.done; i++) { const [f, u] = d.step(1/60, t.pos.y - t.pivot.y < -0.36); t.params.damping = d.braking ? SPIN.brakeDamping : TRAY.dampingArmMode; t.params.catchAssist = d.braking; const ev = t.step(new Vector3(f, 1.05 + u, 0), 1/60); loops += +ev.loop; flew += ev.flewOff; fallen += ev.fallen; spill += ev.spilled; }
  t.params.grip = TRAY.grip; t.params.damping = TRAY.damping;
  for (let k = 0; k < 120; k++) { const ev = t.step(rest, 1/60); flew += ev.flewOff; fallen += ev.fallen; spill += ev.spilled; }
  console.log(`n=${n} q=${q} hız=${d.speed.toFixed(1)} tur=${loops} uçan=${flew} kuleden=${fallen} döküntü=${spill.toFixed(2)} kalan=${t.glasses.length} kavanoz=${t.hasJar}`);
}

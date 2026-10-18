import { Vector3 } from 'three';
import { TraySim } from '../src/physics/tray';
import { TRAY } from '../src/config';
// el dikey bir çember çiziyor (fareyle daire)
for (const R of [0.15, 0.25, 0.34]) for (const W of [5, 7, 9, 11]) {
  const t = new TraySim(); t.reset(new Vector3(0, 1.05, 0));
  for (let i = 0; i < 3; i++) t.addGlass('demli', 0.92, 85, 1);
  t.params.grip = TRAY.gripArmMode; t.params.damping = TRAY.dampingArmMode;
  let loops = 0, flew = 0, phi = 0, spilled = 0;
  for (let i = 0; i < 300; i++) { const tt = i / 60; const w = Math.min(W, W * tt / 1.0); phi += w / 60;
    const p = new Vector3(Math.sin(phi) * R, 1.05 - Math.cos(phi) * R + R, 0);
    const e = t.step(p, 1 / 60); if (e.loop) loops++; flew += e.flewOff; spilled += e.spilled; if (flew) break; }
  console.log(`R=${R} w=${W} loops=${loops} flew=${flew} spill=${spilled.toFixed(2)}`);
}

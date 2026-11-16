// Sürüş dinamiği ölçümü (tarayıcısız): vehicle_physics.js driveDynamics'i düz, kuru asfaltta çalıştırır.
//   node scripts/test/drivefeel-node.mjs [sedan gt motor bus]
// Ölçüler: 0-100 süresi; 100→0 fren mesafesi + yanal sapma; 60/90 km/s'de ani tam direksiyon 1 sn (azami kayma açısı,
// savrulma = kayma > 45°); 50 m yarıçaplı virajda azami hız + kayma; el freni drift (azami kayma, bırakınca < 5°'ye dönüş);
// 90 km/s'de fren + tam direksiyon (ABS: dönüyor mu, savruluyor mu); direksiyonun tam açıya varış süresi.
import fs from 'node:fs';
import { driveDynamics } from '../../src/entities/vehicle_physics.js';
import { CARS } from '../../src/game/economy.js';

const src = fs.readFileSync(new URL('../../src/entities/vehicles.js', import.meta.url), 'utf8');
const PHYS = Function('return ' + src.match(/const PHYS = (\{[\s\S]*?\n\});/)[1])();
const DT = 1 / 30, D = 57.2958;
const I = { throttle: 0, steer: 0, hb: false, canDrive: true, offRoad: false, fs: 0, ls: 0, max: 1, wet: 1 };

function mk(type) {
  const def = CARS[type];
  const v = { def, P: PHYS[def.body || def.style] || PHYS.sedan, T: { wheelbase: def.wb || def.len * 0.6 }, heading: 0, vx: 0, vz: 0, x: 0, z: 0,
    yawRate: 0, steerAng: 0, spin: 0, gear: 0, rpm: 0.2, shiftT: 0, fs: 0, ls: 0, pitch: 0, roll: 0 };
  return v;
}
function step(v, thr, st, hb) {
  const P = v.P, max = v.def.maxSpeed;
  let fs = v.vx * Math.sin(v.heading) + v.vz * Math.cos(v.heading);
  const ls = v.vx * -Math.cos(v.heading) + v.vz * Math.sin(v.heading);
  // vites (Vehicle.update ile aynı kural)
  const nG = P.gears, sp = Math.abs(fs), top = (i) => max * Math.pow((i + 1) / nG, 0.8);
  if (v.shiftT > 0) v.shiftT -= DT;
  if (fs < -0.5) v.gear = 0;
  else if (v.gear < nG - 1 && sp > top(v.gear) * 0.95) { v.gear++; v.shiftT = 0.2; }
  else if (v.gear > 0 && sp < top(v.gear - 1) * 0.7) v.gear--;
  const lo = v.gear > 0 ? top(v.gear - 1) * 0.55 : 0, hi = top(v.gear);
  v.rpm += (0.18 + 0.82 * Math.min(1, Math.max(0, (sp - lo) / (hi - lo))) - v.rpm) * Math.min(1, DT * 8);
  I.throttle = thr; I.steer = st; I.hb = hb; I.fs = fs; I.ls = ls; I.max = max;
  driveDynamics(v, DT, I);
  v.x += v.vx * DT; v.z += v.vz * DT;
}
const kmh = (v) => Math.hypot(v.vx, v.vz) * 3.6;
const slip = (v) => Math.atan2(Math.abs(v.ls), Math.max(1, Math.abs(v.fs))) * D;
const at = (v, s) => { v.heading = 0; v.vx = 0; v.vz = s; v.x = v.z = 0; v.yawRate = v.steerAng = v.spin = 0; v.ls = 0; v.fs = s; v.brakeP = 0; v.lt = 0; v.hbRec = 1;
  const nG = v.P.gears; v.gear = 0; while (v.gear < nG - 1 && s > v.def.maxSpeed * Math.pow((v.gear + 1) / nG, 0.8) * 0.9) v.gear++; v.rpm = 0.7; };
// hızı koru (gaz/fren P denetimi)
const hold = (v, s) => { const d = s - v.fs; return d > 0.2 ? Math.min(1, d) : d < -1 ? -0.3 : 0; };

function measure(type) {
  const v = mk(type), o = {};
  at(v, 0); let t = 0; while (kmh(v) < 100 && t < 30) { step(v, 1, 0, false); t += DT; } o.t100 = +t.toFixed(2);
  // fren 100→0 (direksiyon serbest, heading sabitlenmez)
  at(v, 100 / 3.6); t = 0; let dev = 0;
  while (Math.hypot(v.vx, v.vz) > 0.3 && t < 15) { step(v, -1, 0, false); t += DT; dev = Math.max(dev, Math.abs(v.x)); }
  o.brake100 = +Math.hypot(v.x, v.z).toFixed(1); o.brakeDev = +dev.toFixed(2);
  // ani tam direksiyon 1 sn (gaz korunur)
  for (const k of [60, 90]) {
    at(v, k / 3.6); let sm = 0, turn = 0;
    for (let i = 0; i < 30; i++) { step(v, hold(v, k / 3.6), 1, false); sm = Math.max(sm, slip(v)); }
    turn = Math.abs(v.heading) * D;
    o['slip' + k] = +sm.toFixed(1); o['spin' + k] = sm > 45; o['turn' + k] = +turn.toFixed(0); o['latG' + k] = +(Math.abs(v.fs * v.yawRate) / 9.81).toFixed(2);
  }
  // 50 m yarıçap: yol izleme denetçisi (hedef yaw = hız/R, direksiyon P+I), 6 sn sonra gerçek yarıçap ±%8 içinde mi
  let best = 0, bestSlip = 0;
  for (let s = 8; s <= 40; s += 0.5) {
    at(v, s); let st = 0, sm = 0, ok = true;
    for (let i = 0; i < 180; i++) {
      const sp = Math.hypot(v.vx, v.vz), want = sp / 50;
      // yol eğriliği = hız vektörünün dönme hızı; ölçüm için yaw + kayma değişimi yerine konumdan
      st = Math.max(-1, Math.min(1, st + (want - v.yawRate) * 0.6));
      step(v, hold(v, s), st, false);
      if (i > 120) sm = Math.max(sm, slip(v));
    }
    // son 2 sn'de hız ve yaw hedefte mi
    const sp = Math.hypot(v.vx, v.vz), R = sp / Math.max(1e-3, Math.abs(v.yawRate));
    if (Math.abs(R - 50) > 4 || sp < s * 0.95 || sm > 20) ok = false;
    if (ok) { best = s; bestSlip = sm; }
  }
  o.r50kmh = +(best * 3.6).toFixed(0); o.r50slip = +bestSlip.toFixed(1); o.r50g = +((best * best) / 50 / 9.81).toFixed(2);
  // el freni drift: 72 km/s, sola tam + el freni 0,8 sn; sonra el freni bırak, gaz yarım, direksiyon düz
  at(v, 20); let hm = 0;
  for (let i = 0; i < 24; i++) { step(v, 0.3, 1, true); hm = Math.max(hm, slip(v)); }
  let rec = 0; while (slip(v) > 5 && rec < 5) { step(v, 0.5, 0, false); rec += DT; hm = Math.max(hm, slip(v)); }
  o.hbSlip = +hm.toFixed(0); o.hbRec = +rec.toFixed(2); o.hbKmh = +kmh(v).toFixed(0);
  // ABS: 90 km/s'de fren + tam direksiyon 1 sn
  at(v, 25); let am = 0;
  for (let i = 0; i < 30; i++) { step(v, -1, 1, false); am = Math.max(am, slip(v)); }
  o.absTurn = +(Math.abs(v.heading) * D).toFixed(0); o.absSlip = +am.toFixed(1); o.absKmh = +kmh(v).toFixed(0);
  // direksiyon: 60 km/s'de tam açının %90'ına varış
  at(v, 60 / 3.6); t = 0; const m = v.P.steer / (1 + (v.fs * v.fs) / 520); while (Math.abs(v.steerAng) < 0.9 * m && t < 3) { step(v, hold(v, 60 / 3.6), 1, false); t += DT; }
  o.steer90 = +t.toFixed(2);
  return o;
}
const types = process.argv.slice(2).length ? process.argv.slice(2) : ['sedan', 'gt', 'suv', 'motor', 'bus'];
for (const k of types) console.log(k.padEnd(6), JSON.stringify(measure(k)));

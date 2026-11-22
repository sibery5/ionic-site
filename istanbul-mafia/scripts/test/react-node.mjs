// [tepki] Tarayıcısız poz testi: yarayı tutma, dize çökme, savrulma (devrilme/patlama/araç) ve kalkış.
// Ölçer: NaN yok; ayakta başlayıp ayakta biter; kalkış süresi ≥ 1,2 sn ve ara pozlar (dört ayak / yarım diz) görülür;
// yerin altına giren kemik yok; tutma elinin yaraya uzaklığı; kare başına süre.   node scripts/test/react-node.mjs
// tarayıcısız: tuval çağrıları boş (yalnız poz ölçülüyor)
const noop = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'data' ? new Uint8ClampedArray(4) : k === 'width' || k === 'height' ? 4 : noop), apply: () => noop, construct: () => noop, set: () => true });
globalThis.document = { createElement: () => noop };
globalThis.window = globalThis.window || undefined;
const THREE = await import('three');
const { CharacterModel, defaultLook } = await import('../../src/entities/character.js');

const scene = new THREE.Scene();
const M = new CharacterModel(defaultLook('m'));
scene.add(M.root);
const st = { speed: 0, moveX: 0, moveZ: 0 };
const v = new THREE.Vector3(), v2 = new THREE.Vector3();
let bad = 0;
const fail = (m) => { bad++; console.log('BAŞARISIZ', m); };
function step(n, dt = 1 / 60) { for (let i = 0; i < n; i++) M.animate(dt, st); }
function headY() { M.root.updateMatrixWorld(true); return M.head.getWorldPosition(v).y; }
function hipsY() { M.root.updateMatrixWorld(true); return M.hips.getWorldPosition(v).y; }
let minName = '';
function minBoneY() { M.root.updateMatrixWorld(true); let m = 9; for (const b of M.bones) { b.getWorldPosition(v); if (!Number.isFinite(v.y)) return NaN; if (v.y < m) { m = v.y; minName = b.name; } } return m; }
step(30);
const stand = headY();
console.log('ayakta en alçak kemik', minBoneY().toFixed(3), minName);
console.log('ayakta baş', stand.toFixed(2));
// 1) yarayı tutma
for (const [zone, side] of [['torso', 1], ['torso', -1], ['arm', 1], ['leg', -1]]) {
  M.clutch = null; step(40);
  M.setClutch(zone, side, 3, 1); step(30);
  M.root.updateMatrixWorld(true);
  const A = M.arms[(zone === 'arm' ? -side : side) > 0 ? 1 : 0];
  A.wr.getWorldPosition(v);
  let tgt;
  if (zone === 'torso') { tgt = v2.set(-side * 0.075, 0.05, 0.13); M.spine.localToWorld(tgt); }
  else if (zone === 'leg') { const L = M.legs[side > 0 ? 1 : 0]; L.hip.getWorldPosition(v2); const k = new THREE.Vector3(); L.kn.getWorldPosition(k); v2.lerp(k, 0.45); }
  else { const B = M.arms[side > 0 ? 1 : 0]; B.el.getWorldPosition(v2); }
  const dd = v.distanceTo(v2);
  console.log('tutma', zone, side > 0 ? 'sağ' : 'sol', 'bilek-yara', dd.toFixed(3), 'm', 'baş', headY().toFixed(2));
  if (!(dd < 0.2)) fail('el yaraya ulaşmadı ' + zone);
}
M.clutch = null; step(60);
// 2) devrilme kipleri ve kalkış
for (const [mode, dx, dz, dur] of [['fall', 0, 1, 2.8], ['fall', 0, -1, 2.8], ['blast', 0, 1, 3.4], ['blast', 0, -1, 3.4], ['blast', 1, 0, 3.4], ['fly', 0, 1, 3.2], ['knee', 0, 1, 2.6]]) {
  M.kdNext = { mode, k: 0.8 };
  if (mode === 'knee') M.setClutch('leg', -1, 3, 1);
  M.knockdown(dx, dz, dur);
  let lieMin = 9, worstAt = '', t = 0, minH = 9, minB = 9, air = 0, riseT = -1, seen = { quad: 0, half: 0 }, worst = 0, nan = false;
  const N = Math.round(dur * 60) + 2;
  for (let i = 0; i < N; i++) {
    if (mode === 'fly') M.kdAir = t < 0.5 ? 'fly' : null;
    const t0 = performance.now(); M.animate(1 / 60, st); worst = Math.max(worst, performance.now() - t0);
    t += 1 / 60;
    const h = headY(), b = minBoneY(); if (!Number.isFinite(h) || !Number.isFinite(b)) nan = true;
    minH = Math.min(minH, h); if (b < minB && !(mode === 'fly' && M.kdAir)) { minB = b; worstAt = minName + '@' + t.toFixed(2) + (M.kd ? (M.kd.rise >= 0 ? 'k' : M.kd.land >= 0 ? 'y' : 'h') : ''); }
    if (M.kd && M.kd.rise >= 0 && riseT < 0) riseT = t;
    if (M.kd && M.kd.land >= 0 && M.kd.rise < 0 && t - M.kd.land > 0.9) lieMin = Math.min(lieMin, b);
    const hy = hipsY();
    if (riseT > 0 && M.kd) { const px = M.P[0]; if (Math.abs(px) > 1.1 && hy > 0.35) seen.quad = 1; if (hy > 0.4 && hy < 0.62 && Math.abs(px) < 0.7) seen.half = 1; }
  }
  step(20);
  const end = headY(), riseDur = riseT > 0 ? dur - riseT : 0;
  console.log(mode, `yön(${dx},${dz})`, 'en alçak baş', minH.toFixed(2), 'en alçak kemik', minB.toFixed(2), worstAt, 'yatışta', lieMin.toFixed(2), 'kalkış', riseDur.toFixed(2), 'sn', 'dört ayak', seen.quad, 'yarım diz', seen.half, 'son baş', end.toFixed(2), 'en kötü kare', worst.toFixed(2), 'ms');
  if (nan) fail(mode + ' NaN');
  if (mode !== 'knee' && minH > 0.6) fail(mode + ' yere düşmedi');
  if (mode === 'knee' && (minH < 0.8 || minH > 1.4)) fail('dize çökme baş yüksekliği ' + minH.toFixed(2));
  // geçişte (düşüş anı) en çok 20 cm, yatışta en çok 10 cm (kemik noktası: ayak parmağı kökü / el)
  if (minB < -0.2 || lieMin < -0.1) fail(mode + ' kemik yerin altında ' + minB.toFixed(2) + ' / ' + lieMin.toFixed(2));
  if (mode !== 'knee' && riseDur < 1.2) fail(mode + ' kalkış kısa');
  if (mode !== 'knee' && !seen.half) fail(mode + ' yarım diz ara pozu yok');
  if (Math.abs(end - stand) > 0.08) fail(mode + ' ayakta bitmedi');
}
// 3) süre: 200 kare boşta / tutma / yerde yatış ortalaması (ısınma sonrası)
M.clutch = null; step(300); let t00 = performance.now(); step(400); const idleMs = (performance.now() - t00) / 400;
M.setClutch('torso', 1, 9, 1);
step(100); let t0 = performance.now(); step(400); const clMs = (performance.now() - t0) / 400;
M.kdNext = { mode: 'blast', k: 0.7 }; M.knockdown(0, 1, 9);
t0 = performance.now(); step(200); const kdMs = (performance.now() - t0) / 200;
console.log('kare ort. boşta', idleMs.toFixed(3), 'ms', 'tutma', clMs.toFixed(3), 'ms', 'savrulma', kdMs.toFixed(3), 'ms');
console.log(bad ? 'BAŞARISIZ ' + bad : 'TEPKİ TAMAM');

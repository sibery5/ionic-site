// Köprü tabliye yükseklik profili (fizik, araçlar, sokak eşyası ve modeller ortak kullanır; three.js bağımlılığı yok).
//
// 15 Temmuz Şehitler Köprüsü: tabliye yol grafiğindeki iki kavşak (x=190 ve x=435, y=0) arasında kosinüs
// profiliyle yükselir; ortada yol yüzeyi y=DECK_TOP (su seviyesinin ~21 m üstü). Haritadaki Boğaz gerçeğin ~1/4'ü
// genişliğinde olduğundan 64 m yerine ölçekli bir açıklık kullanılır; gemi şeritleri (x≈291 ve x≈334) altında
// ~17 m serbest yükseklik kalır. En büyük eğim DECK_TOP*pi/245 ≈ %26 (orta rampada), uçlarda ve tepede sıfır.
// Galata Köprüsü: iki katlı görünüm için ortası GALATA_TOP kadar kabarık (alt katta lokantalar), rampalar z=60..92 ve
// z=168..200 (kavşaklar y=0).
//
// DECK_TOP = 0 yapılırsa köprü eski düz (y=0) hâline döner; gemiler de köprü önünde döner (ships.js).
import { BRIDGES, WATER_Y } from './map.js';

export const DECK_TOP = 20;
export const GALATA_TOP = 4.2;
const BOS = BRIDGES.find((b) => b.axis === 'x');
const GAL = BRIDGES.find((b) => b.name.startsWith('Galata'));
export const BOS_X0 = 190, BOS_X1 = 435, BOS_XC = (BOS_X0 + BOS_X1) / 2, BOS_HALF = (BOS_X1 - BOS_X0) / 2;
export const GAL_Z0 = 60, GAL_Z1 = 200, GAL_RAMP = 32;
// Bariyer/korkuluk uçları: kesişen ana caddelerin (16 m) kaldırım kenarı — uç elemanı kavşak şeridine taşmaz
export const BAR_X0 = BOS_X0 + 9, BAR_X1 = BOS_X1 - 9, GAL_BZ0 = GAL_Z0 + 9, GAL_BZ1 = GAL_Z1 - 9;

const ss = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const dss = (t) => (t <= 0 || t >= 1 ? 0 : 6 * t * (1 - t));

// Boğaz köprüsü yol yüzeyi yüksekliği (x'e bağlı)
export function bosphorusDeckY(x) {
  const u = (x - BOS_XC) / BOS_HALF;
  if (u <= -1 || u >= 1) return 0;
  return DECK_TOP * (0.5 + 0.5 * Math.cos(Math.PI * u));
}
export function bosphorusDeckSlope(x) {
  const u = (x - BOS_XC) / BOS_HALF;
  if (u <= -1 || u >= 1) return 0;
  return -DECK_TOP * 0.5 * Math.PI * Math.sin(Math.PI * u) / BOS_HALF;
}
// Galata Köprüsü yol yüzeyi yüksekliği (z'ye bağlı)
export function galataDeckY(z) {
  if (GALATA_TOP <= 0) return 0;
  return GALATA_TOP * Math.min(ss((z - GAL_Z0) / GAL_RAMP), ss((GAL_Z1 - z) / GAL_RAMP));
}
export function galataDeckSlope(z) {
  if (GALATA_TOP <= 0) return 0;
  const a = (z - GAL_Z0) / GAL_RAMP, b = (GAL_Z1 - z) / GAL_RAMP;
  return ss(a) < ss(b) ? GALATA_TOP * dss(a) / GAL_RAMP : -GALATA_TOP * dss(b) / GAL_RAMP;
}

// Köprü tabliyesi üzerindeyse yol yüzeyi yüksekliği, değilse null. (x,z) köprü dikdörtgeninin içinde olmalı.
export function bridgeHeightAt(x, z) {
  if (BOS && x >= BOS.x0 && x <= BOS.x1 && z >= BOS.z0 && z <= BOS.z1) return bosphorusDeckY(x);
  if (GAL && x >= GAL.x0 && x <= GAL.x1 && z >= GAL.z0 && z <= GAL.z1) return galataDeckY(z);
  return null;
}
// Yol eğimi (dy/dx, dy/dz) — araç burun açısı için: ileri (sin h, cos h) yönünde eğim = sx*sin(h) + sz*cos(h)
export function bridgeSlopeAt(x, z, out = { x: 0, z: 0 }) {
  out.x = 0; out.z = 0;
  if (BOS && x >= BOS.x0 && x <= BOS.x1 && z >= BOS.z0 && z <= BOS.z1) out.x = bosphorusDeckSlope(x);
  else if (GAL && x >= GAL.x0 && x <= GAL.x1 && z >= GAL.z0 && z <= GAL.z1) out.z = galataDeckSlope(z);
  return out;
}
// Gemiler için: Boğaz köprüsü altındaki serbest yükseklik (su seviyesinden, tabliye altı ~2.6 m kalın)
export function bridgeClearanceAt(x) { return bosphorusDeckY(x) - 2.6 - WATER_Y; }

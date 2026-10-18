import { TRAY } from '../config';
import type { TrayParams } from '../physics/tray';

// Açgözlü Çaycı: tepsiye ne kadar çok bardak koyarsan bahşiş o kadar katlanır, tepsi o kadar huysuzlaşır.

export const GREED = {
  duration: 90, // sn, bir tur
  capacity: 12,
  pourTime: 0.32, // bir bardak doldurma süresi
  baseTip: 4,
  comboStep: 0.5, // her kusursuz teslim çarpana eklenir
  comboMax: 5,
  towerBonusFrom: 7, // bu kadar bardakla teslim edilirse kule bonusu
  towerBonus: 2,
  spinMultiplier: 2,
  orderMin: 1,
  orderMax: 4,
  orderInterval: [3.5, 6] as const,
  patience: 32,
  slowMoTime: 1.3,
  slowMoScale: 0.22,
};

/** Bardak sayısına göre tepsinin davranışı. */
export function greedParams(n: number): Pick<TrayParams, 'grip' | 'spillScale' | 'towerAngle'> {
  return {
    grip: Math.min(0.7, TRAY.grip + 0.03 * Math.max(0, n - 3)),
    spillScale: Math.max(0.5, 1 - 0.045 * Math.max(0, n - 3)),
    towerAngle: Math.max(12, 23 - 1.1 * Math.max(0, n - 6)),
  };
}

/** Teslimde bardak başına bahşiş. */
export function greedTip(fill: number, combo: number, carried: number, spun: boolean): number {
  const tower = carried >= GREED.towerBonusFrom ? GREED.towerBonus : 1;
  const spin = spun ? GREED.spinMultiplier : 1;
  return GREED.baseTip * fill * fill * combo * tower * spin;
}

/** Kusursuz teslimden sonra çarpan. */
export function nextCombo(combo: number, perfect: boolean): number {
  if (!perfect) return 1;
  return Math.min(GREED.comboMax, combo + GREED.comboStep);
}

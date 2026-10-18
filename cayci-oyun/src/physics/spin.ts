// Tek tuşla Fırıldak: el, dikey bir çemberde döndürülür. Hızı oyuncunun zamanlaması belirler.
// Fizik gerçek: yeterince hızlı dönersen bardaklar tepsiye bastırılır, yavaşsan tepede uçarlar.

export const SPIN = {
  radius: 0.25,
  rampTime: 0.35, // sn, tam hıza çıkma
  goodSpeed: 10.5, // rad/s, kusursuz zamanlama
  okSpeed: 8.1, // rad/s, kıl payı tutan zamanlama
  badSpeed: 5.7, // rad/s, kaçırılan zamanlama (tepede uçar)
  passQuality: 0.6,
  turns: 1.15, // kaç tur dönülecek
  settleTime: 0.45, // sonunda bileğin tepsiyi yakalama süresi
  brakeDamping: 14, // yakalama sırasında sönümleme (1/s)
  meterPeriod: 1.1, // zamanlama göstergesinin bir gidiş-geliş süresi
  zone: [0.42, 0.58] as const, // yeşil bölge (0..1)
};

/** Gösterge iğnesinin konumu 0..1 (gidip gelir). */
export function meterAt(t: number): number {
  const p = (t % SPIN.meterPeriod) / SPIN.meterPeriod;
  return p < 0.5 ? p * 2 : 2 - p * 2;
}

/** İğnenin yeşil bölgeye yakınlığına göre kalite 0..1 (1 = tam ortada). */
export function spinQuality(needle: number): number {
  const mid = (SPIN.zone[0] + SPIN.zone[1]) / 2;
  const half = (SPIN.zone[1] - SPIN.zone[0]) / 2;
  const d = Math.abs(needle - mid);
  if (d <= half) return 1;
  return Math.max(0, 1 - (d - half) / 0.25);
}

export class SpinDriver {
  private t = 0;
  private phase = 0;
  private settleT = -1;
  done = false;
  /** true iken ustanın bileği tepsiyi yakalar: oyun sönümlemeyi büyük ölçüde artırmalı. */
  braking = false;
  readonly speed: number;

  constructor(quality: number) {
    // kalite eşiği net olsun: ya tur tutar ya tepede yavaş kalınır
    this.speed = quality >= SPIN.passQuality ? SPIN.okSpeed + (SPIN.goodSpeed - SPIN.okSpeed) * ((quality - SPIN.passQuality) / (1 - SPIN.passQuality)) : SPIN.badSpeed;
  }

  /**
   * Elin dinlenme noktasına göre ofseti: x = ileri, y = yukarı.
   * trayLow: tepsi şu an elin altında mı (fren ancak o anda başlar, yoksa tepede yavaşlar ve uçar).
   */
  step(dt: number, trayLow: boolean): [number, number] {
    this.t += dt;
    const total = SPIN.turns * Math.PI * 2;
    if (this.settleT < 0) {
      const w = this.speed * Math.min(1, this.t / SPIN.rampTime);
      this.phase += w * dt;
      if (this.phase >= total && trayLow) this.settleT = 0;
      return [Math.sin(this.phase) * SPIN.radius, (1 - Math.cos(this.phase)) * SPIN.radius];
    }
    // tur bitti: bilek tepsiyi yakalar, el dinlenme noktasına döner
    this.settleT += dt;
    this.braking = true;
    const k = Math.max(0, 1 - this.settleT / SPIN.settleTime);
    if (k <= 0) {
      this.done = true;
      this.braking = false;
    }
    return [Math.sin(this.phase) * SPIN.radius * k, (1 - Math.cos(this.phase)) * SPIN.radius * k];
  }
}

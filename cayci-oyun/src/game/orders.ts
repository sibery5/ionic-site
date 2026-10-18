import { ORDERS, SHIFT, TEA } from '../config';
import type { Glass } from '../physics/tray';
import type { Rng } from '../core/rng';

export type TeaType = 'acik' | 'demli';

export interface Order {
  id: number;
  office: string;
  items: TeaType[]; // kalan istekler
  total: number; // ilk istek sayısı
  createdAt: number;
  patience: number;
  tipSoFar: number;
  perfectSoFar: boolean;
}

export function tempFactor(temp: number): number {
  const t = (temp - TEA.minGoodTemp) / (TEA.maxGoodTemp - TEA.minGoodTemp);
  return Math.max(0, Math.min(1, t));
}

/** Tek bardağın bahşişi. */
export function glassTip(g: Pick<Glass, 'fill' | 'temp' | 'colorScore'>): number {
  return ORDERS.baseTip * g.fill * g.fill * tempFactor(g.temp) * g.colorScore;
}

export function isPerfectGlass(g: Pick<Glass, 'fill' | 'temp' | 'colorScore' | 'spilled'>): boolean {
  return !g.spilled && g.fill >= 0.85 && g.temp >= 60 && g.colorScore >= 1;
}

/** Siparişin tamamlanınca alacağı çarpan. */
export function completionMultiplier(opts: { elapsed: number; style: boolean; grudge: boolean }): number {
  let m = 1;
  if (opts.elapsed <= ORDERS.speedBonusTime) m *= 1 + ORDERS.speedBonus;
  if (opts.style) m *= ORDERS.styleMultiplier;
  if (opts.grudge) m *= 1 - ORDERS.expiredPenalty;
  return m;
}

export function starsFor(earned: number, target: number): number {
  if (earned >= target * SHIFT.star3) return 3;
  if (earned >= target * SHIFT.star2) return 2;
  if (earned >= target) return 1;
  return 0;
}

/**
 * Tepsideki bardaklardan siparişe uyanları seçer. Aynı tipte birden fazla bardak varsa en kalitelisini verir.
 * Döner: teslim edilecek bardak indeksleri (büyükten küçüğe sıralı, splice için güvenli).
 */
export function pickGlasses(order: Pick<Order, 'items'>, glasses: Glass[]): number[] {
  const used = new Set<number>();
  for (const want of order.items) {
    let best = -1;
    let bestScore = -1;
    glasses.forEach((g, i) => {
      if (used.has(i) || g.type !== want) return;
      const s = glassTip(g);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    });
    if (best >= 0) used.add(best);
  }
  return [...used].sort((a, b) => b - a);
}

export interface DeliveryResult {
  delivered: number;
  tip: number; // bu teslimde kazanılan (tamamlanma çarpanı dahil)
  completed: boolean;
  perfect: boolean; // sipariş tamamen kusursuz bitti
}

export class OrderBook {
  active: Order[] = [];
  private nextId = 1;
  private timer = 4;
  private grudges = new Set<string>();
  maxActive: number = ORDERS.maxActive;

  constructor(
    private offices: string[],
    private rng: Rng,
  ) {}

  update(dt: number, now: number, onNew: (o: Order) => void, onExpire: (o: Order) => void) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.rng.range(ORDERS.intervalMin, ORDERS.intervalMax);
      const o = this.spawn(now);
      if (o) onNew(o);
    }
    for (let i = this.active.length - 1; i >= 0; i--) {
      const o = this.active[i];
      if (now - o.createdAt > o.patience) {
        this.active.splice(i, 1);
        this.grudges.add(o.office);
        onExpire(o);
      }
    }
  }

  /** "Çaaay!" bağırması: yakındaki bir ofisten hemen sipariş gelir. */
  shout(now: number, nearOffices: string[]): Order | null {
    const free = nearOffices.filter((id) => !this.active.some((o) => o.office === id));
    if (!free.length) return null;
    return this.spawn(now, this.rng.pick(free));
  }

  spawn(now: number, office?: string): Order | null {
    if (this.active.length >= this.maxActive) return null;
    const free = this.offices.filter((id) => !this.active.some((o) => o.office === id));
    if (!free.length) return null;
    const id = office ?? this.rng.pick(free);
    const n = this.rng.next() < 0.45 ? 1 : this.rng.next() < 0.7 ? 2 : 3;
    const items: TeaType[] = [];
    for (let i = 0; i < n; i++) items.push(this.rng.next() < 0.5 ? 'acik' : 'demli');
    items.sort();
    const o: Order = {
      id: this.nextId++,
      office: id,
      items,
      total: n,
      createdAt: now,
      patience: ORDERS.patience,
      tipSoFar: 0,
      perfectSoFar: true,
    };
    this.active.push(o);
    return o;
  }

  orderFor(office: string) {
    return this.active.find((o) => o.office === office) ?? null;
  }

  /** Bir ofise teslim: tepsiden uygun bardakları çıkarır. */
  deliver(office: string, glasses: Glass[], now: number, style: boolean): DeliveryResult | null {
    const o = this.orderFor(office);
    if (!o) return null;
    const idx = pickGlasses(o, glasses);
    if (!idx.length) return { delivered: 0, tip: 0, completed: false, perfect: false };
    let tip = 0;
    for (const i of idx) {
      const g = glasses[i];
      tip += glassTip(g);
      if (!isPerfectGlass(g)) o.perfectSoFar = false;
      const k = o.items.indexOf(g.type);
      if (k >= 0) o.items.splice(k, 1);
      glasses.splice(i, 1);
    }
    o.tipSoFar += tip;
    const completed = o.items.length === 0;
    let gained = tip;
    if (completed) {
      const m = completionMultiplier({ elapsed: now - o.createdAt, style, grudge: this.grudges.has(office) });
      gained = tip + o.tipSoFar * (m - 1);
      this.grudges.delete(office);
      this.active.splice(this.active.indexOf(o), 1);
    }
    return { delivered: idx.length, tip: gained, completed, perfect: completed && o.perfectSoFar };
  }
}

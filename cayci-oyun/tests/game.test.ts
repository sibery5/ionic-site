import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { OrderBook, completionMultiplier, glassTip, pickGlasses, starsFor, tempFactor } from '../src/game/orders';
import { Rng } from '../src/core/rng';
import { LEVELS, parseLevel } from '../src/game/levels';
import { Grid } from '../src/physics/grid';
import { DAYS } from '../src/game/story';
import type { Glass } from '../src/physics/tray';

function glass(type: Glass['type'], fill = 0.92, temp = 85, colorScore = 1, spilled = false): Glass {
  return { type, fill, temp, colorScore, spilled, surface: new Vector3(), surfaceVel: new Vector3() };
}

describe('bahşiş kuralları', () => {
  it('sıcaklık çarpanı 40-75 °C arasında doğrusal', () => {
    expect(tempFactor(30)).toBe(0);
    expect(tempFactor(85)).toBe(1);
    expect(tempFactor(57.5)).toBeCloseTo(0.5);
  });

  it('dolu, sıcak, tavşan kanı bardak en çok bahşişi alır', () => {
    expect(glassTip(glass('demli', 1, 85, 1.2))).toBeCloseTo(6);
    expect(glassTip(glass('demli', 0.5, 85, 1))).toBeCloseTo(1.25);
  });

  it('hız ve gösteri çarpanları birleşir', () => {
    expect(completionMultiplier({ elapsed: 10, style: true, grudge: false })).toBeCloseTo(2.25);
    expect(completionMultiplier({ elapsed: 40, style: false, grudge: true })).toBeCloseTo(0.8);
  });

  it('yıldızlar hedefe göre', () => {
    expect(starsFor(59, 60)).toBe(0);
    expect(starsFor(60, 60)).toBe(1);
    expect(starsFor(84, 60)).toBe(2);
    expect(starsFor(108, 60)).toBe(3);
  });

  it('sipariş için doğru tip ve en kaliteli bardak seçilir', () => {
    const gs = [glass('acik', 0.4), glass('demli'), glass('acik', 0.9)];
    expect(pickGlasses({ items: ['acik'] }, gs)).toEqual([2]);
    expect(pickGlasses({ items: ['acik', 'demli'] }, gs)).toEqual([2, 1]);
  });
});

describe('OrderBook', () => {
  it('teslim tamamlanınca sipariş kapanır ve kusursuz sayılır', () => {
    const book = new OrderBook(['a', 'b'], new Rng(7));
    const o = book.spawn(0, 'a')!;
    const tray = o.items.map((t) => glass(t));
    const res = book.deliver('a', tray, 5, false)!;
    expect(res.completed).toBe(true);
    expect(res.perfect).toBe(true);
    expect(tray.length).toBe(0);
    expect(book.active.length).toBe(0);
  });

  it('dökülmüş bardak kusursuz sayılmaz', () => {
    const book = new OrderBook(['a'], new Rng(3));
    const o = book.spawn(0, 'a')!;
    const tray = o.items.map((t) => glass(t, 0.92, 85, 1, true));
    expect(book.deliver('a', tray, 5, false)!.perfect).toBe(false);
  });

  it('süresi dolan sipariş düşer', () => {
    const book = new OrderBook(['a'], new Rng(1));
    book.spawn(0, 'a');
    const expired: string[] = [];
    book.update(0.1, 61, () => {}, (o) => expired.push(o.office));
    expect(expired).toEqual(['a']);
  });
});

describe('kat haritaları', () => {
  LEVELS.forEach((def, i) => {
    it(`${i + 1}. gün haritası oynanabilir`, () => {
      const lv = parseLevel(def);
      const grid = new Grid(lv);
      // her satır aynı uzunlukta (boşluklar hariç doldurulmuş)
      for (const row of def.grid) expect(row.length).toBe(lv.w);
      // ofisler hikâyeyle uyumlu
      for (const off of DAYS[i].offices) expect(lv.desks.has(off.id)).toBe(true);
      // zemin hücreleri dışarıya açılmıyor
      for (let z = 0; z < lv.h; z++)
        for (let x = 0; x < lv.w; x++) {
          if (grid.solid(x, z)) continue;
          for (const [dx, dz] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ])
            expect(grid.char(x + dx, z + dz)).not.toBe(' ');
        }
      // başlangıçtan ocağa ve her masaya ulaşılabiliyor
      const targets = [...lv.ocak, ...lv.desks.values()];
      for (const [tx, tz] of targets) {
        const ns = grid.neighborsWalkable(tx, tz);
        expect(ns.length).toBeGreaterThan(0);
        expect(ns.some((n) => grid.path(lv.start, n) !== null)).toBe(true);
      }
      for (const p of lv.npcPoints) expect(grid.path(lv.start, p)).not.toBeNull();
    });
  });
});

import { describe, expect, it } from 'vitest';
import { ARENA, LEVELS, parseLevel } from '../src/game/levels';
import { Grid } from '../src/physics/grid';
import { DAYS } from '../src/game/story';
import { VENUES } from '../src/game/venues';

describe('kat haritaları', () => {
  it('açgözlü arena oynanabilir', () => {
    const lv = parseLevel(ARENA);
    const grid = new Grid(lv);
    for (const row of ARENA.grid) expect(row.length).toBe(lv.w);
    for (const id of ['a', 'b', 'c', 'd']) {
      const [x, z] = lv.desks.get(id)!;
      expect(grid.neighborsWalkable(x, z).some((n) => grid.path(lv.start, n) !== null)).toBe(true);
    }
  });
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
  VENUES.forEach((v) => {
    it(`${v.id}: her ofisin masası haritada var ve ulaşılabilir`, () => {
      const lv = parseLevel(v.level);
      const grid = new Grid(lv);
      expect(v.offices.length).toBeGreaterThan(0);
      for (const off of v.offices) {
        const d = lv.desks.get(off.id);
        expect(d, off.id).toBeDefined();
        expect(grid.neighborsWalkable(...d!).some((n) => grid.path(lv.start, n) !== null)).toBe(true);
      }
      expect(lv.ocak.length).toBeGreaterThan(0);
    });
  });
});

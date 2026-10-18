import { describe, expect, it } from 'vitest';
import { defaultSave, normalize } from '../src/core/save';
import { emptyStats, RunStats } from '../src/meta/stats';
import { applyRunToSave, isUnlocked, recordEnding } from '../src/meta/profile';
import { VENUES, objectiveDone, starsFor, GOSSIP_TOTAL } from '../src/game/venues';
import { levelFromXp, xpForLevel, levelProgress, rankFor, COSMETICS, MAX_LEVEL } from '../src/meta/progress';
import { missionsFor, applyRun, MISSION_DEFS } from '../src/meta/missions';
import { submit, withRivals, nextRival, beatenRival, BOARD_SIZE } from '../src/meta/leaderboard';
import { ACHIEVEMENTS } from '../src/meta/achievements';
import { parseLevel } from '../src/game/levels';

function stats(p: Partial<RunStats> = {}): RunStats {
  return { ...emptyStats('salon', 'career'), ...p };
}

describe('seviye ve rütbe', () => {
  it('XP eğrisi artan ve tutarlı', () => {
    expect(xpForLevel(1)).toBe(0);
    for (let l = 2; l <= MAX_LEVEL; l++) expect(xpForLevel(l)).toBeGreaterThan(xpForLevel(l - 1));
    for (let l = 1; l <= MAX_LEVEL; l++) expect(levelFromXp(xpForLevel(l))).toBe(l);
    expect(levelFromXp(xpForLevel(5) - 1)).toBe(4);
    expect(levelProgress(xpForLevel(3))).toBe(0);
    expect(levelFromXp(1e9)).toBe(MAX_LEVEL);
  });
  it('rütbeler seviyeye göre', () => {
    expect(rankFor(1).tr).toBe('Çırak');
    expect(rankFor(10).tr).toBe('Tepsi Ustası');
    expect(rankFor(30).tr).toBe('Efsane Çaycı');
  });
  it('her kozmetik geçerli bir seviyede açılır, her yuvanın 1. seviye varsayılanı var', () => {
    for (const c of COSMETICS) expect(c.level).toBeGreaterThanOrEqual(1), expect(c.level).toBeLessThanOrEqual(MAX_LEVEL);
    for (const slot of ['tray', 'vest', 'hat', 'glass']) expect(COSMETICS.some((c) => c.slot === slot && c.level === 1)).toBe(true);
    expect(new Set(COSMETICS.map((c) => c.id)).size).toBe(COSMETICS.length);
  });
});

describe('günlük görevler', () => {
  it('her gün 3 farklı görev, aynı gün hep aynı', () => {
    const a = missionsFor('2026-10-18');
    expect(a).toHaveLength(3);
    expect(new Set(a.map((m) => m.kind)).size).toBe(3);
    expect(missionsFor('2026-10-18')).toEqual(a);
    const days = new Set(Array.from({ length: 10 }, (_, i) => JSON.stringify(missionsFor(`2026-11-${10 + i}`))));
    expect(days.size).toBeGreaterThan(5);
  });
  it('biriken görev turlar boyunca toplanır, tek tur görevi en iyiyi alır, ödül bir kez', () => {
    const ms = [
      { kind: 'deliverTotal' as const, target: 20, progress: 0, done: false },
      { kind: 'towerDelivery' as const, target: 8, progress: 0, done: false },
    ];
    expect(applyRun(ms, stats({ delivered: 12, maxDeliveryTower: 6 }))).toHaveLength(0);
    expect(ms[0].progress).toBe(12);
    expect(ms[1].progress).toBe(6);
    const done = applyRun(ms, stats({ delivered: 9, maxDeliveryTower: 9 }));
    expect(done.map((m) => m.kind).sort()).toEqual(['deliverTotal', 'towerDelivery']);
    expect(applyRun(ms, stats({ delivered: 50, maxDeliveryTower: 12 }))).toHaveLength(0);
  });
  it('bütün görev hedefleri pozitif ödül verir', () => {
    for (const d of MISSION_DEFS) for (const t of d.targets) {
      const r = d.reward(t);
      expect(r.coins).toBeGreaterThan(0);
      expect(r.xp).toBeGreaterThan(0);
    }
  });
});

describe('sıralama', () => {
  it('en iyi 10 tutulur ve sıra döner', () => {
    const b: { name: string; score: number; date: string }[] = [];
    for (let i = 0; i < 12; i++) submit(b, { name: 'x', score: i * 10, date: '2026-10-18' });
    expect(b).toHaveLength(BOARD_SIZE);
    expect(b[0].score).toBe(110);
    expect(submit(b, { name: 'y', score: 5, date: '2026-10-18' })).toBeNull();
    expect(submit(b, { name: 'z', score: 1000, date: '2026-10-18' })).toBe(1);
  });
  it('rakipler', () => {
    const rivals = VENUES[0].rivals;
    expect(withRivals([], rivals).every((e) => e.rival)).toBe(true);
    expect(beatenRival(100, rivals)?.name).toBe('Gülsüm Abla');
    expect(nextRival(100, rivals)?.name).toBe('Rıza Usta');
    expect(nextRival(10000, rivals)).toBeNull();
  });
});

describe('mekânlar', () => {
  it('her mekânın ofisleri haritada var, hedefler artan', () => {
    for (const v of VENUES) {
      const lv = parseLevel(v.level);
      for (const o of v.offices) expect(lv.desks.has(o.id)).toBe(true);
      expect(v.stars[0]).toBeLessThan(v.stars[1]);
      expect(v.stars[1]).toBeLessThan(v.stars[2]);
      // Rıza Usta her zaman 3 yıldızın üstünde: yenilmesi zor bir hedef
      expect(Math.max(...v.rivals.map((r) => r.score))).toBeGreaterThan(v.stars[2]);
    }
    expect(GOSSIP_TOTAL).toBe(12);
  });
  it('yıldızlar ve görevler', () => {
    expect(starsFor(0, [10, 20, 30])).toBe(0);
    expect(starsFor(25, [10, 20, 30])).toBe(2);
    expect(objectiveDone({ kind: 'noJarLost', target: 1 }, stats({ jarsLost: 0, delivered: 3 }))).toBe(false);
    expect(objectiveDone({ kind: 'noJarLost', target: 1 }, stats({ jarsLost: 0, delivered: 12 }))).toBe(true);
    expect(objectiveDone({ kind: 'towerDelivery', target: 6 }, stats({ maxDeliveryTower: 6 }))).toBe(true);
  });
});

describe('profil', () => {
  it('tur ilerlemeye işlenir: yıldız, rekor, XP, cüzdan, kilit', () => {
    const save = defaultSave();
    save.playerName = 'Test';
    expect(isUnlocked(save, 1)).toBe(false);
    const v = VENUES[0];
    const r1 = applyRunToSave(save, v, stats({ score: v.stars[1], delivered: 20, maxDeliveryTower: 7, spins: 1 }), '2026-10-18');
    expect(r1.stars).toBe(2);
    expect(r1.objectives.every((o) => o.done && o.isNew)).toBe(true);
    expect(r1.xpGained).toBeGreaterThan(v.stars[1]);
    expect(save.wallet).toBeGreaterThanOrEqual(v.stars[1]);
    expect(r1.boardRank).toBe(1);
    expect(isUnlocked(save, 1)).toBe(true);
    expect(r1.achievements.map((a) => a.id)).toContain('FIRST_TEA');
    // aynı görevler ikinci kez yeni sayılmaz, başarımlar tekrar açılmaz
    const r2 = applyRunToSave(save, v, stats({ score: 10, delivered: 20, maxDeliveryTower: 7, spins: 1 }), '2026-10-18');
    expect(r2.objectives.some((o) => o.isNew)).toBe(false);
    expect(r2.achievements.map((a) => a.id)).not.toContain('FIRST_TEA');
    expect(save.venues.salon.best).toBe(v.stars[1]);
    expect(r2.record).toBe(false);
  });
  it('günlük mücadele kariyer rekorunu ve yıldızını değiştirmez', () => {
    const save = defaultSave();
    const r = applyRunToSave(save, VENUES[2], { ...stats({ score: 999 }), mode: 'daily', venue: 'kat1' }, '2026-10-18');
    expect(save.venues.kat1.stars).toBe(0);
    expect(save.dailyBest['2026-10-18']).toBe(999);
    expect(save.boards['daily-2026-10-18'][0].score).toBe(999);
    expect(r.record).toBe(false);
  });
  it('teras ilk kez geçilince final açılır, son kaydedilince başarım gelir', () => {
    const save = defaultSave();
    const r = applyRunToSave(save, VENUES[5], { ...stats({ score: VENUES[5].stars[0] }), venue: 'teras' });
    expect(r.finalUnlocked).toBe(true);
    const got = recordEnding(save, 'saved');
    expect(got.map((a) => a.id)).toContain('END_SAVED');
    expect(save.finalSeen).toBe(true);
  });
  it('dedikodular sadece kariyerde ve bir kez', () => {
    const save = defaultSave();
    applyRunToSave(save, VENUES[1], { ...stats({ gossip: ['zemin:a'] }), venue: 'zemin' });
    applyRunToSave(save, VENUES[1], { ...stats({ gossip: ['zemin:a', 'zemin:b'] }), venue: 'zemin' });
    applyRunToSave(save, VENUES[1], { ...stats({ gossip: ['zemin:c'] }), venue: 'zemin', mode: 'free' });
    expect(save.gossip).toEqual(['zemin:a', 'zemin:b']);
  });
  it('başarım id\'leri benzersiz ve Steam adına uygun', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) expect(a.id).toMatch(/^[A-Z0-9_]+$/);
  });
  it('eksik kayıt alanları tamamlanır', () => {
    const n = normalize({ xp: 50, settings: { lang: 'en' } as never });
    expect(n.xp).toBe(50);
    expect(n.settings.lang).toBe('en');
    expect(n.settings.quality).toBe('high');
    expect(n.look.tray).toBe('tray-nickel');
  });
});

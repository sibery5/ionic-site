import { describe, expect, it } from 'vitest';
import { defaultSave, normalize } from '../src/core/save';
import { emptyStats, RunStats } from '../src/meta/stats';
import { applyRunToSave, isUnlocked, recordEnding } from '../src/meta/profile';
import { VENUES, objectiveDone, starsFor } from '../src/game/venues';
import { TITLES, earnedTitle } from '../src/meta/titles';
import { levelFromXp, xpForLevel, levelProgress, COSMETICS, MAX_LEVEL } from '../src/meta/progress';
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
    const teras = VENUES.find((v) => v.id === 'teras')!;
    const r = applyRunToSave(save, teras, { ...stats({ score: teras.stars[0] }), venue: 'teras' });
    expect(r.finalUnlocked).toBe(true);
    const got = recordEnding(save, 'saved');
    expect(got.map((a) => a.id)).toContain('END_SAVED');
    expect(save.finalSeen).toBe(true);
  });
  it('dedikodular cebe bir kez girer, günlükte girmez', () => {
    const save = defaultSave();
    applyRunToSave(save, VENUES[1], { ...stats({ heard: ['hayri_tapu'] }), venue: 'zemin' });
    applyRunToSave(save, VENUES[1], { ...stats({ heard: ['hayri_tapu', 'sevim_evrak'] }), venue: 'zemin', mode: 'free' });
    applyRunToSave(save, VENUES[1], { ...stats({ heard: ['ferhat_vekalet'] }), venue: 'zemin', mode: 'daily' });
    expect(save.pocket).toEqual(['hayri_tapu', 'sevim_evrak']);
  });
  it('satışlar, kanıtlar, ihanet ve itibar kayda işlenir', () => {
    const save = defaultSave();
    applyRunToSave(save, VENUES[2], {
      ...stats({
        sales: [
          { rumor: 'ferhat_vekalet', buyer: 'rifat', verdict: 'reward', pay: 40 },
          { rumor: 'rifat_rapor', buyer: 'selim', verdict: 'betray', pay: 80 },
          { rumor: 'nevin_fal', buyer: 'rifat', verdict: 'lie', pay: 0 },
        ],
        evidence: ['ferhat_vekalet'],
        repDelta: -17,
      }),
      venue: 'kat1',
    });
    expect(save.sales).toEqual(['ferhat_vekalet>rifat', 'rifat_rapor>selim']);
    expect(save.evidence).toEqual(['ferhat_vekalet']);
    expect(save.burned).toEqual(['rifat_rapor']);
    expect(save.rep).toBe(33);
    expect(save.totals.sales).toBe(1);
    expect(save.totals.betrayals).toBe(1);
    expect(save.totals.lies).toBe(1);
  });
  it('unvan sırayla gelir, maaş öder ve geri düşmez', () => {
    const save = defaultSave();
    const r1 = applyRunToSave(save, VENUES[0], { ...stats({ score: VENUES[0].stars[0] }) });
    expect(r1.promotedTo).toBe(1);
    expect(save.title).toBe(1);
    // 1. katta yıldız var ama zeminde yok: kat çaycısı olunmaz
    applyRunToSave(save, VENUES[2], { ...stats({ score: VENUES[2].stars[0] }), venue: 'kat1' });
    expect(save.title).toBe(1);
    const r2 = applyRunToSave(save, VENUES[1], { ...stats({ score: VENUES[1].stars[0] }), venue: 'zemin' });
    expect(r2.promotedTo).toBe(2);
    expect(r2.salary).toBe(TITLES[2].salary);
    save.rep = 0;
    expect(earnedTitle(save)).toBe(2);
  });
  it('eski kayıttaki dedikodular cebe taşınır', () => {
    const n = normalize({ gossip: ['zemin:a', 'kat2:b', 'yok:z'] } as never);
    expect(n.pocket).toEqual(['hayri_tapu', 'lale_foto']);
    expect((n as unknown as { gossip?: unknown }).gossip).toBeUndefined();
  });
  it('başarım id\'leri benzersiz ve Steam adına uygun', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) expect(a.id).toMatch(/^[A-Z0-9_]+$/);
  });
  it('eksik kayıt alanları tamamlanır', () => {
    const n = normalize({ xp: 50, settings: { lang: 'en' } as never });
    expect(n.xp).toBe(50);
    expect(n.settings.lang).toBe('en');
    expect(n.settings.quality).toBe('medium'); // 0.6: varsayılan orta, otomatik kalite açık
    expect(n.settings.autoQuality).toBe(true);
    expect(n.look.tray).toBe('tray-nickel');
  });
});

describe('teftiş ve geri tepme', () => {
  it('teftiş, patrona vurma ve geri tepme toplamlara ve başarımlara işlenir', () => {
    const save = defaultSave();
    const r = applyRunToSave(save, VENUES[0], stats({ inspections: 1, inspectPassed: 1, bossBonks: 1, backfires: 2, bonks: 1 }));
    expect(save.totals.inspectPassed).toBe(1);
    expect(save.totals.bossBonks).toBe(1);
    expect(save.totals.backfires).toBe(2);
    const ids = r.achievements.map((a) => a.id);
    for (const id of ['INSPECT_PASS', 'BOSS_BONK', 'BACKFIRE_1', 'BONK_1']) expect(ids).toContain(id);
  });
  it('eski kayıtta yeni toplamlar sıfırdan başlar', () => {
    const n = normalize({ totals: { delivered: 5 } as never });
    expect(n.totals.delivered).toBe(5);
    expect(n.totals.inspectPassed).toBe(0);
    expect(n.totals.bossBonks).toBe(0);
  });
  it('başarım kimlikleri benzersiz', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});

describe('bodrum (0.6)', () => {
  it('bodrum 3. kat ile teras arasında; eski kayıtta oynanmış teras açık kalır', () => {
    const ids = VENUES.map((v) => v.id);
    expect(ids.indexOf('bodrum')).toBe(ids.indexOf('kat3') + 1);
    expect(ids.indexOf('teras')).toBe(ids.indexOf('bodrum') + 1);
    const save = defaultSave();
    save.venues.kat3 = { best: 80, stars: 2, objectives: [], plays: 2 };
    save.venues.teras = { best: 60, stars: 1, objectives: [], plays: 1 };
    expect(isUnlocked(save, ids.indexOf('bodrum'))).toBe(true);
    expect(isUnlocked(save, ids.indexOf('teras'))).toBe(true);
    const fresh = defaultSave();
    fresh.venues.kat3 = { best: 80, stars: 2, objectives: [], plays: 2 };
    expect(isUnlocked(fresh, ids.indexOf('teras'))).toBe(false);
  });
});

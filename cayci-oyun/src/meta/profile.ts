import type { SaveData } from '../core/save';
import { objectiveDone, starsFor, VENUES, type Objective, type Venue } from '../game/venues';
import { RUMORS, saleKey } from '../game/rumors';
import type { SaleRecord } from './stats';
import { earnedTitle, TITLES } from './titles';
import { ACHIEVEMENTS, newlyUnlocked, type Achievement } from './achievements';
import { submit, beatenRival, nextRival } from './leaderboard';
import { applyRun, missionDef, missionsFor, todayKey, type MissionState } from './missions';
import { levelFromXp, rewardsAtLevel, xpForRun, type Cosmetic } from './progress';
import type { RunStats } from './stats';

// Bir turun sonucunu kalıcı ilerlemeye işler. Saf fonksiyon: kaydı değiştirir ve özet döndürür (testlenebilir).

export interface RunReport {
  score: number;
  stars: number;
  prevStars: number;
  prevBest: number;
  record: boolean;
  objectives: { objective: Objective; done: boolean; isNew: boolean }[];
  xpGained: number;
  coins: number; // cüzdana eklenen (kasa + görev ödülleri)
  levelBefore: number;
  levelAfter: number;
  rewards: Cosmetic[];
  missionsCompleted: MissionState[];
  achievements: Achievement[];
  boardRank: number | null;
  rivalBeaten: { name: string; score: number } | null;
  nextRival: { name: string; score: number } | null;
  gossipNew: string[]; // cebe yeni giren dedikodular (rumor id)
  sales: SaleRecord[];
  repBefore: number;
  repAfter: number;
  salary: number;
  /** terfi edildiyse yeni unvan sırası */
  promotedTo: number | null;
  finalUnlocked: boolean; // teras ilk kez geçildi → han toplantısı
}

export const objectiveKey = (o: Objective) => `${o.kind}:${o.target}`;

/** Bugünün görevlerini hazırlar (gün değiştiyse yenileri). */
export function ensureDaily(save: SaveData, date = todayKey()) {
  if (save.daily.date !== date) save.daily = { date, missions: missionsFor(date) };
  return save.daily.missions;
}

export function boardKey(venue: Venue, mode: RunStats['mode'], date: string) {
  return mode === 'daily' ? `daily-${date}` : mode === 'endless' ? `endless-${venue.id}` : venue.id;
}

export function applyRunToSave(save: SaveData, venue: Venue, s: RunStats, date = todayKey()): RunReport {
  const rec = (save.venues[venue.id] ??= { best: 0, stars: 0, objectives: [], plays: 0 });
  const prevBest = rec.best;
  const prevStars = rec.stars;
  const stars = starsFor(s.score, venue.stars);
  rec.plays++;
  // mekân rekoru, yıldız ve görevler sadece kariyer ve serbest modda; günlük ve sonsuz vardiyanın kendi sıralaması var
  const competitive = s.mode === 'career' || s.mode === 'free';
  if (competitive) {
    rec.best = Math.max(rec.best, s.score);
    rec.stars = Math.max(rec.stars, stars);
  }

  // görevler (kariyer ve serbest modda sayılır)
  const objectives = venue.objectives.map((o) => {
    const done = objectiveDone(o, s);
    const key = objectiveKey(o);
    const isNew = competitive && done && !rec.objectives.includes(key);
    if (isNew) rec.objectives.push(key);
    return { objective: o, done, isNew };
  });

  // dedikodular (günlük mücadele hariç): duyulanlar cebe, anlatılanlar deftere
  const gossipNew = s.mode === 'daily' ? [] : [...new Set(s.heard)].filter((g) => !save.pocket.includes(g));
  save.pocket.push(...gossipNew);
  if (s.mode !== 'daily') {
    for (const sale of s.sales) {
      if (sale.verdict === 'reward' || sale.verdict === 'betray') {
        const k = saleKey(sale.rumor, sale.buyer);
        if (!save.sales.includes(k)) save.sales.push(k);
      }
      if (sale.verdict === 'reward') save.totals.sales++;
      if (sale.verdict === 'lie') save.totals.lies++;
      if (sale.verdict === 'betray') {
        save.totals.betrayals++;
        const r = RUMORS.find((x) => x.id === sale.rumor);
        if (r?.story && !save.burned.includes(r.id)) save.burned.push(r.id);
      }
    }
    // kanıt: han tarafına ulaşan hikâye dedikodusu (Run bunu 'reward' + evidence olarak işaretler)
    for (const id of s.evidence) if (!save.evidence.includes(id)) save.evidence.push(id);
  }
  const repBefore = save.rep;
  save.rep = Math.max(0, Math.min(100, save.rep + (s.mode === 'daily' ? 0 : s.repDelta)));

  // günlük görevler
  const missions = ensureDaily(save, date);
  const missionsCompleted = applyRun(missions, s);
  let missionCoins = 0;
  let missionXp = 0;
  for (const m of missionsCompleted) {
    const r = missionDef(m.kind).reward(m.target);
    missionCoins += r.coins;
    missionXp += r.xp;
  }
  if (missions.length && missions.every((m) => m.done) && !save.dailyDays.includes(date)) save.dailyDays.push(date);

  // toplamlar
  save.totals.delivered += s.delivered;
  save.totals.spins += s.spins;
  save.totals.broken += s.broken;
  save.totals.catTrips += s.catTrips;
  save.totals.jarsLost += s.jarsLost;
  save.totals.vipPerfect += s.vipPerfect;
  save.totals.runs++;
  save.totals.escapes += s.escapes;
  save.totals.caught += s.caught;
  save.totals.bonks += s.bonks;
  save.totals.inspectPassed += s.inspectPassed;
  save.totals.bossBonks += s.bossBonks;
  save.totals.backfires += s.backfires;

  // XP, seviye, ödüller
  const levelBefore = levelFromXp(save.xp);
  const newStars = Math.max(0, (competitive ? rec.stars : 0) - prevStars);
  const xpGained = xpForRun({ score: s.score, objectivesDone: objectives.filter((o) => o.isNew).length, newStars, missionsDone: 0 }) + missionXp;
  save.xp += xpGained;
  const levelAfter = levelFromXp(save.xp);
  const rewards: Cosmetic[] = [];
  for (let l = levelBefore + 1; l <= levelAfter; l++) rewards.push(...rewardsAtLevel(l));

  // unvan: yıldızlar ve itibar güncellendikten sonra
  const before = save.title;
  save.title = earnedTitle(save);
  const promotedTo = save.title > before ? save.title : null;
  const salary = TITLES[save.title].salary;

  // cüzdan: kasadaki para + görev ödülleri + maaş
  const coins = s.score + missionCoins + salary;
  save.wallet += coins;

  // sıralama
  const key = boardKey(venue, s.mode, date);
  const board = (save.boards[key] ??= []);
  const boardRank = s.score > 0 ? submit(board, { name: save.playerName, score: s.score, date }) : null;
  if (s.mode === 'daily') save.dailyBest[date] = Math.max(save.dailyBest[date] ?? 0, s.score);

  // teras ilk kez geçildi mi
  const finalUnlocked = s.mode === 'career' && venue.id === 'teras' && stars >= 1 && !save.finalSeen;

  // başarımlar
  const venueStars: Record<string, number> = {};
  for (const v of VENUES) if (save.venues[v.id]) venueStars[v.id] = save.venues[v.id].stars;
  const achievements = newlyUnlocked(
    {
      run: s,
      totals: save.totals,
      level: levelAfter,
      venueStars,
      venueCount: VENUES.length,
      gossipCount: save.pocket.length,
      gossipTotal: RUMORS.length,
      title: save.title,
      endings: save.endings,
      dailyDays: save.dailyDays.length,
    },
    save.achievements,
  );
  save.achievements.push(...achievements.map((a) => a.id));

  return {
    score: s.score,
    stars,
    prevStars,
    prevBest,
    record: competitive && s.score > prevBest && prevBest > 0,
    objectives,
    xpGained,
    coins,
    levelBefore,
    levelAfter,
    rewards,
    missionsCompleted,
    achievements,
    boardRank,
    rivalBeaten: competitive ? beatenRival(s.score, venue.rivals) : null,
    nextRival: competitive ? nextRival(Math.max(s.score, rec.best), venue.rivals) : null,
    gossipNew,
    sales: s.sales,
    repBefore,
    repAfter: save.rep,
    salary,
    promotedTo,
    finalUnlocked,
  };
}

/** Bir sonraki mekân açık mı? (önceki mekânda en az 1 yıldız) */
export function isUnlocked(save: SaveData, index: number): boolean {
  if (index <= 0) return true;
  const prev = VENUES[index - 1];
  // 0.6'da bodrum araya girdi: daha önce oynanmış bir mekân kapanmasın
  return (save.venues[prev.id]?.stars ?? 0) >= 1 || (save.venues[VENUES[index].id]?.plays ?? 0) > 0;
}

/** Son seçimden sonra başarımları yeniden kontrol eder (son sahnesi için). */
export function recordEnding(save: SaveData, ending: string): Achievement[] {
  if (!save.endings.includes(ending)) save.endings.push(ending);
  save.finalSeen = true;
  // gerçeği anlatan çaycı ocağın patronu olur; teklifi kabul eden ise parayı alır
  save.title = earnedTitle(save);
  if (ending === 'sold') save.wallet += SOLD_PRICE;
  const venueStars: Record<string, number> = {};
  for (const v of VENUES) if (save.venues[v.id]) venueStars[v.id] = save.venues[v.id].stars;
  const got = newlyUnlocked(
    {
      run: null,
      totals: save.totals,
      level: levelFromXp(save.xp),
      venueStars,
      venueCount: VENUES.length,
      gossipCount: save.pocket.length,
      gossipTotal: RUMORS.length,
      title: save.title,
      endings: save.endings,
      dailyDays: save.dailyDays.length,
    },
    save.achievements,
  );
  save.achievements.push(...got.map((a) => a.id));
  return got;
}

export { ACHIEVEMENTS };

/** Selim'in teklifi: hanı bırakıp AVM'nin çay zincirine geçmek. */
export const SOLD_PRICE = 500;

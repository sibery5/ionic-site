import { Rng } from '../core/rng';
import type { Text } from '../game/story';
import type { RunStats } from './stats';

// Günlük görevler: her gün tarihe göre 3 farklı görev. Bazıları gün boyu birikir, bazıları tek turda yapılmalı.

export type MissionKind =
  | 'deliverTotal'
  | 'spinsTotal'
  | 'vipTotal'
  | 'coloredTotal'
  | 'runsTotal'
  | 'towerDelivery'
  | 'bankOnce'
  | 'combo'
  | 'runScore'
  | 'cleanRun';

export interface MissionDef {
  kind: MissionKind;
  targets: number[];
  /** true: gün içindeki bütün turlar toplanır; false: tek turda ulaşılmalı (en iyi tur sayılır) */
  cumulative: boolean;
  text: (n: number) => Text;
  reward: (n: number) => { coins: number; xp: number };
}

export const MISSION_DEFS: MissionDef[] = [
  {
    kind: 'deliverTotal',
    targets: [20, 30, 45],
    cumulative: true,
    text: (n) => ({ tr: `Bugün toplam ${n} bardak teslim et`, en: `Deliver ${n} glasses today` }),
    reward: (n) => ({ coins: n * 4, xp: n * 3 }),
  },
  {
    kind: 'spinsTotal',
    targets: [2, 3, 5],
    cumulative: true,
    text: (n) => ({ tr: `Bugün ${n} Fırıldak yap`, en: `Land ${n} Spins today` }),
    reward: (n) => ({ coins: n * 40, xp: n * 30 }),
  },
  {
    kind: 'vipTotal',
    targets: [1, 2, 3],
    cumulative: true,
    text: (n) => ({ tr: `${n} VIP siparişi tamamla`, en: `Complete ${n} VIP orders` }),
    reward: (n) => ({ coins: n * 60, xp: n * 45 }),
  },
  {
    kind: 'coloredTotal',
    targets: [6, 10, 15],
    cumulative: true,
    text: (n) => ({ tr: `${n} açık/demli bardağı doğru teslim et`, en: `Deliver ${n} light/strong glasses correctly` }),
    reward: (n) => ({ coins: n * 8, xp: n * 6 }),
  },
  {
    kind: 'runsTotal',
    targets: [3, 5],
    cumulative: true,
    text: (n) => ({ tr: `Bugün ${n} vardiya bitir`, en: `Finish ${n} shifts today` }),
    reward: (n) => ({ coins: n * 30, xp: n * 25 }),
  },
  {
    kind: 'towerDelivery',
    targets: [6, 7, 8],
    cumulative: false,
    text: (n) => ({ tr: `Tepside ${n}+ bardakla bir teslim yap`, en: `Make a delivery carrying ${n}+ glasses` }),
    reward: (n) => ({ coins: n * 15, xp: n * 12 }),
  },
  {
    kind: 'bankOnce',
    targets: [40, 60, 90],
    cumulative: false,
    text: (n) => ({ tr: `Tek seferde ${n}₺ kasaya geçir`, en: `Bank ${n}₺ in a single trip` }),
    reward: (n) => ({ coins: Math.round(n * 0.8), xp: Math.round(n * 0.6) }),
  },
  {
    kind: 'combo',
    targets: [2, 2.5, 3],
    cumulative: false,
    text: (n) => ({ tr: `×${String(n).replace('.', ',')} çarpana ulaş`, en: `Reach a ×${n} multiplier` }),
    reward: (n) => ({ coins: n * 30, xp: n * 25 }),
  },
  {
    kind: 'runScore',
    targets: [60, 100, 150],
    cumulative: false,
    text: (n) => ({ tr: `Bir vardiyada ${n}₺ kazan`, en: `Earn ${n}₺ in one shift` }),
    reward: (n) => ({ coins: Math.round(n * 0.6), xp: Math.round(n * 0.5) }),
  },
  {
    kind: 'cleanRun',
    targets: [1],
    cumulative: false,
    text: () => ({ tr: 'Hiç kavanoz kaybetmeden bir vardiya bitir', en: 'Finish a shift without losing the jar' }),
    reward: () => ({ coins: 120, xp: 90 }),
  },
];

export interface MissionState {
  kind: MissionKind;
  target: number;
  progress: number;
  done: boolean;
}

export function todayKey(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function seedOf(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** O günün 3 görevi: hepsi farklı türde, zorluk karışık. */
export function missionsFor(dateKey: string): MissionState[] {
  const rng = new Rng(seedOf(dateKey));
  const pool = [...MISSION_DEFS];
  const out: MissionState[] = [];
  while (out.length < 3 && pool.length) {
    const i = Math.floor(rng.next() * pool.length);
    const def = pool.splice(i, 1)[0];
    const target = def.targets[Math.min(def.targets.length - 1, Math.floor(rng.next() * def.targets.length))];
    out.push({ kind: def.kind, target, progress: 0, done: false });
  }
  return out;
}

export function missionDef(kind: MissionKind) {
  return MISSION_DEFS.find((d) => d.kind === kind)!;
}

/** Bir turun görevlere katkısı. */
export function runValue(kind: MissionKind, s: RunStats): number {
  switch (kind) {
    case 'deliverTotal':
      return s.delivered;
    case 'spinsTotal':
      return s.spins;
    case 'vipTotal':
      return s.vipServed;
    case 'coloredTotal':
      return s.coloredServed;
    case 'runsTotal':
      return 1;
    case 'towerDelivery':
      return s.maxDeliveryTower;
    case 'bankOnce':
      return s.maxBank;
    case 'combo':
      return s.maxCombo;
    case 'runScore':
      return s.score;
    case 'cleanRun':
      return s.jarsLost === 0 && s.delivered > 0 ? 1 : 0;
  }
}

/**
 * Turu görevlere işler. Yeni tamamlanan görevleri döndürür (ödül bir kez verilir).
 */
export function applyRun(missions: MissionState[], s: RunStats): MissionState[] {
  const completed: MissionState[] = [];
  for (const m of missions) {
    if (m.done) continue;
    const def = missionDef(m.kind);
    const v = runValue(m.kind, s);
    m.progress = def.cumulative ? m.progress + v : Math.max(m.progress, v);
    if (m.progress >= m.target) {
      m.progress = m.target;
      m.done = true;
      completed.push(m);
    }
  }
  return completed;
}

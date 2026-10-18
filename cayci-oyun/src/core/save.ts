import { steamBridge } from './steam';
import { LEGACY_GOSSIP } from '../game/rumors';
import type { Lang } from '../game/story';
import type { BoardEntry } from '../meta/leaderboard';
import type { MissionState } from '../meta/missions';
import type { Totals } from '../meta/achievements';
import { DEFAULT_LOOK, type CosmeticSlot } from '../meta/progress';

// Kayıt dosyası (sürüm 2). Tarayıcıda localStorage; Steam sürümünde ayrıca Steam Cloud'a yazılır.

export type Quality = 'low' | 'medium' | 'high';

export interface VenueRecord {
  best: number;
  stars: number;
  objectives: string[]; // tamamlanan görevlerin "tür:hedef" anahtarları
  plays: number;
}

export interface SaveData {
  version: 2;
  xp: number;
  wallet: number;
  upgrades: string[];
  look: Record<CosmeticSlot, string>;
  venues: Record<string, VenueRecord>;
  pocket: string[]; // duyulan dedikodular (rumor id), cep defteri
  sales: string[]; // "rumor>kişi": kime ne anlatıldı
  evidence: string[]; // han tarafına ulaşan hikâye kanıtları
  burned: string[]; // kötü adamlara satılıp yok edilen kanıtlar
  rep: number; // itibar 0..100
  title: number; // unvan sırası (TITLES)
  scenes: string[]; // izlenen ara sahneler
  endings: string[];
  finalSeen: boolean;
  daily: { date: string; missions: MissionState[] };
  dailyDays: string[]; // bütün görevlerin bittiği günler
  dailyBest: Record<string, number>; // günlük mücadele skoru, tarih → skor
  achievements: string[];
  totals: Totals;
  boards: Record<string, BoardEntry[]>;
  playerName: string;
  tutorialDone: boolean;
  settings: { lang: Lang; volume: number; music: number; sensitivity: number; quality: Quality; invertY: boolean; trayAssist: TrayAssist; camDist: number };
}

/** Tepsi zorluğu: rahat (affedici), normal (dengelenen), usta (sert, daha çok bahşiş). */
export type TrayAssist = 'easy' | 'normal' | 'master';

const KEY = 'cayci-save-v2';
const OLD_KEY = 'cayci-save-v1';

export function defaultSave(): SaveData {
  const lang: Lang = typeof navigator !== 'undefined' && navigator.language && !navigator.language.startsWith('tr') ? 'en' : 'tr';
  return {
    version: 2,
    xp: 0,
    wallet: 0,
    upgrades: [],
    look: { ...DEFAULT_LOOK },
    venues: {},
    pocket: [],
    sales: [],
    evidence: [],
    burned: [],
    rep: 50,
    title: 0,
    scenes: [],
    endings: [],
    finalSeen: false,
    daily: { date: '', missions: [] },
    dailyDays: [],
    dailyBest: {},
    achievements: [],
    totals: { delivered: 0, spins: 0, broken: 0, catTrips: 0, runs: 0, jarsLost: 0, vipPerfect: 0, sales: 0, lies: 0, escapes: 0, caught: 0, bonks: 0, betrayals: 0 },
    boards: {},
    playerName: lang === 'tr' ? 'Çırak' : 'Apprentice',
    tutorialDone: false,
    settings: { lang, volume: 0.8, music: 0.5, sensitivity: 1, quality: 'high', invertY: false, trayAssist: 'normal', camDist: 1 },
  };
}

/** Eksik alanları varsayılanlarla doldurur (eski/yarım kayıtlar için). */
export function normalize(d: Partial<SaveData> & { gossip?: string[] }): SaveData {
  const base = defaultSave();
  // 0.3 kayıtları: "mekân:ofis" dedikoduları cep defterine taşınır
  const legacy = (d.gossip ?? []).map((g) => LEGACY_GOSSIP[g]).filter((x): x is string => !!x);
  const { gossip: _old, ...rest } = d;
  void _old;
  return {
    ...base,
    ...rest,
    pocket: [...new Set([...(d.pocket ?? []), ...legacy])],
    version: 2,
    look: { ...base.look, ...(d.look ?? {}) },
    totals: { ...base.totals, ...(d.totals ?? {}) },
    settings: { ...base.settings, ...(d.settings ?? {}) },
    daily: d.daily ?? base.daily,
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
    // sürüm 1'den geçiş: ayarlar korunur, ilerleme yeni sisteme taşınamaz
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const o = JSON.parse(old) as { settings?: Partial<SaveData['settings']> };
      const d = defaultSave();
      d.settings = { ...d.settings, ...(o.settings ?? {}) };
      return d;
    }
  } catch {
    /* bozuk kayıt: sıfırdan başla */
  }
  return defaultSave();
}

export function writeSave(d: SaveData) {
  const json = JSON.stringify(d);
  try {
    localStorage.setItem(KEY, json);
  } catch {
    /* gizli mod vb. */
  }
  // Steam sürümünde bulut kaydı (masaüstü köprüsü varsa)
  try {
    steamBridge()?.cloudSave?.(json);
  } catch {
    /* yok say */
  }
}

import type { Lang } from '../game/story';

// Kayıt dosyası. Tarayıcıda localStorage, Electron'da da aynı şekilde çalışır.

export interface SaveData {
  version: 1;
  day: number; // hikâyede sıradaki gün (0..5), 5 = final
  wallet: number;
  upgrades: string[];
  gossip: string[]; // "gün:ofis"
  stars: number[]; // gün başına en iyi yıldız
  dailyBest: Record<string, number>;
  ending?: string;
  greedBest?: number;
  greedPlays?: number;
  settings: { lang: Lang; volume: number; music: number; sensitivity: number };
}

const KEY = 'cayci-save-v1';

export function defaultSave(): SaveData {
  const lang: Lang = typeof navigator !== 'undefined' && !navigator.language?.startsWith('tr') ? 'en' : 'tr';
  return {
    version: 1,
    day: 0,
    wallet: 0,
    upgrades: [],
    gossip: [],
    stars: [0, 0, 0, 0, 0],
    dailyBest: {},
    settings: { lang, volume: 0.8, music: 0.5, sensitivity: 1 },
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const d = JSON.parse(raw) as SaveData;
    const base = defaultSave();
    return { ...base, ...d, settings: { ...base.settings, ...d.settings } };
  } catch {
    return defaultSave();
  }
}

export function writeSave(d: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* gizli mod vb. */
  }
}

export function hasProgress(d: SaveData) {
  return d.day > 0 || d.wallet > 0;
}

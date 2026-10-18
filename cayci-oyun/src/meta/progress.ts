import type { Text } from '../game/story';

// Kalıcı ilerleme: tecrübe puanı (XP), rütbe, seviye ödülleri, çarşı yükseltmeleri ve kozmetikler.

export const MAX_LEVEL = 30;

/** n. seviyeye ulaşmak için gereken toplam XP (1. seviye = 0). */
export function xpForLevel(n: number): number {
  const k = Math.max(0, Math.min(MAX_LEVEL, n) - 1);
  return 30 * k * (k + 3);
}

export function levelFromXp(xp: number): number {
  let lv = 1;
  while (lv < MAX_LEVEL && xp >= xpForLevel(lv + 1)) lv++;
  return lv;
}

/** Seviye içindeki ilerleme 0..1 */
export function levelProgress(xp: number): number {
  const lv = levelFromXp(xp);
  if (lv >= MAX_LEVEL) return 1;
  const a = xpForLevel(lv);
  const b = xpForLevel(lv + 1);
  return (xp - a) / (b - a);
}

export const RANKS: { from: number; name: Text }[] = [
  { from: 1, name: { tr: 'Çırak', en: 'Apprentice' } },
  { from: 3, name: { tr: 'Ocakçı', en: 'Stove Keeper' } },
  { from: 6, name: { tr: 'Kalfa', en: 'Journeyman' } },
  { from: 10, name: { tr: 'Tepsi Ustası', en: 'Tray Master' } },
  { from: 15, name: { tr: 'Fırıldak Ustası', en: 'Spin Master' } },
  { from: 20, name: { tr: 'Han Ustası', en: 'Master of the Han' } },
  { from: 30, name: { tr: 'Efsane Çaycı', en: 'Legendary Tea Boy' } },
];

export function rankFor(level: number): Text {
  let r = RANKS[0].name;
  for (const k of RANKS) if (level >= k.from) r = k.name;
  return r;
}

/** Bir turdan kazanılan XP: kasadaki para + görev ve yıldız bonusları. */
export function xpForRun(o: { score: number; objectivesDone: number; newStars: number; missionsDone: number }): number {
  return Math.round(o.score + 25 * o.objectivesDone + 60 * o.newStars + 40 * o.missionsDone);
}

// ---------------- kozmetikler ----------------

export type CosmeticSlot = 'tray' | 'vest' | 'hat' | 'glass';

export interface Cosmetic {
  id: string;
  slot: CosmeticSlot;
  name: Text;
  level: number; // bu seviyede açılır
  color?: number;
  metal?: number;
}

export const COSMETICS: Cosmetic[] = [
  { id: 'tray-nickel', slot: 'tray', name: { tr: 'Nikel tepsi', en: 'Nickel tray' }, level: 1, color: 0xc9ccd1, metal: 0.85 },
  { id: 'tray-copper', slot: 'tray', name: { tr: 'Bakır tepsi', en: 'Copper tray' }, level: 3, color: 0xc0703c, metal: 0.9 },
  { id: 'tray-brass', slot: 'tray', name: { tr: 'Pirinç tepsi', en: 'Brass tray' }, level: 7, color: 0xd4a83a, metal: 0.9 },
  { id: 'tray-gold', slot: 'tray', name: { tr: 'Altın tepsi', en: 'Gold tray' }, level: 14, color: 0xf2c230, metal: 1 },
  { id: 'tray-tulip', slot: 'tray', name: { tr: 'Laleli tepsi', en: 'Tulip tray' }, level: 22, color: 0xb3261e, metal: 0.6 },
  { id: 'vest-black', slot: 'vest', name: { tr: 'Siyah yelek', en: 'Black vest' }, level: 1, color: 0x15151a },
  { id: 'vest-red', slot: 'vest', name: { tr: 'Bordo yelek', en: 'Burgundy vest' }, level: 4, color: 0x6b1a1a },
  { id: 'vest-navy', slot: 'vest', name: { tr: 'Lacivert yelek', en: 'Navy vest' }, level: 9, color: 0x1e2a4a },
  { id: 'vest-green', slot: 'vest', name: { tr: 'Zümrüt yelek', en: 'Emerald vest' }, level: 17, color: 0x1f5a3a },
  { id: 'vest-gold', slot: 'vest', name: { tr: 'Sırma işli yelek', en: 'Gold-embroidered vest' }, level: 26, color: 0x7a5a10 },
  { id: 'hat-none', slot: 'hat', name: { tr: 'Şapkasız', en: 'No hat' }, level: 1 },
  { id: 'hat-cap', slot: 'hat', name: { tr: 'Kasket', en: 'Flat cap' }, level: 2, color: 0x4a4a52 },
  { id: 'hat-fez', slot: 'hat', name: { tr: 'Fes', en: 'Fez' }, level: 6, color: 0xb3261e },
  { id: 'hat-chef', slot: 'hat', name: { tr: 'Aşçı şapkası', en: 'Chef hat' }, level: 12, color: 0xf4f1ea },
  { id: 'hat-crown', slot: 'hat', name: { tr: 'Çaycı tacı', en: 'Tea crown' }, level: 30, color: 0xf2c230 },
  { id: 'glass-plain', slot: 'glass', name: { tr: 'Sade bardak', en: 'Plain glass' }, level: 1 },
  { id: 'glass-gold', slot: 'glass', name: { tr: 'Yaldızlı bardak', en: 'Gilded glass' }, level: 10, color: 0xe9c046 },
  { id: 'glass-crystal', slot: 'glass', name: { tr: 'Kristal bardak', en: 'Crystal glass' }, level: 19, color: 0xbfe8ff },
];

export const DEFAULT_LOOK: Record<CosmeticSlot, string> = {
  tray: 'tray-nickel',
  vest: 'vest-black',
  hat: 'hat-none',
  glass: 'glass-plain',
};

export function cosmetic(id: string): Cosmetic | undefined {
  return COSMETICS.find((c) => c.id === id);
}

export function unlockedCosmetics(level: number): Cosmetic[] {
  return COSMETICS.filter((c) => c.level <= level);
}

/** Bu seviyeye çıkınca açılanlar. */
export function rewardsAtLevel(level: number): Cosmetic[] {
  return COSMETICS.filter((c) => c.level === level);
}

// ---------------- çarşı yükseltmeleri ----------------

export interface Upgrade {
  id: string;
  name: Text;
  desc: Text;
  price: number;
}

export const UPGRADES: Upgrade[] = [
  {
    id: 'kettle',
    name: { tr: 'Hızlı Demlik', en: 'Quick Teapot' },
    desc: { tr: 'Bardak doldurma %30 hızlanır', en: 'Pour glasses 30% faster' },
    price: 120,
  },
  {
    id: 'shoes',
    name: { tr: 'Kaymaz Ayakkabı', en: 'Non-slip Shoes' },
    desc: { tr: 'Islak zeminde %60 daha az kayarsın', en: '60% less sliding on wet floors' },
    price: 150,
  },
  {
    id: 'patience',
    name: { tr: 'Simit İkramı', en: 'Free Simit' },
    desc: { tr: 'Müşteriler %25 daha sabırlı', en: 'Customers wait 25% longer' },
    price: 200,
  },
  {
    id: 'wrist',
    name: { tr: 'Usta Bileği', en: "Master's Wrist" },
    desc: { tr: 'Ağır tepside sallantı azalır', en: 'Heavy trays wobble less' },
    price: 260,
  },
  {
    id: 'plates',
    name: { tr: 'Kalın Ara Tepsi', en: 'Sturdy Tower Plate' },
    desc: { tr: 'Kulenin üst katı daha zor devrilir', en: 'Upper tower glasses topple less' },
    price: 340,
  },
  {
    id: 'lock',
    name: { tr: 'Kavanoz Kilidi', en: 'Jar Lock' },
    desc: { tr: 'Turda bir kez kavanoz kırılmaz, paranın yarısı kurtulur', en: 'Once per run the jar survives and keeps half its tips' },
    price: 450,
  },
];

export function upgrade(id: string) {
  return UPGRADES.find((u) => u.id === id);
}

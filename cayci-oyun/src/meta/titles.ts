import type { Text } from '../game/story';
import type { SaveData } from '../core/save';
import { EVIDENCE_NEEDED } from '../game/rumors';

// Çaycının yükselişi: unvanlar. Çıraklıktan çay ocağının patronluğuna.
// Unvan geri alınmaz; her unvan vardiya başına maaş getirir ve bir terfi sahnesi açar.

export interface Title {
  id: string;
  name: Text;
  /** vardiya sonunda cüzdana eklenen maaş */
  salary: number;
  /** terfi şartları; sırayla hepsi sağlanmalı */
  needs: { text: Text; ok: (s: SaveData) => boolean }[];
}

const stars = (s: SaveData, v: string) => s.venues[v]?.stars ?? 0;
export const liveEvidence = (s: SaveData) => s.evidence.filter((e) => !s.burned.includes(e)).length;

export const TITLES: Title[] = [
  { id: 'cirak', name: { tr: 'Çırak', en: 'Apprentice' }, salary: 0, needs: [] },
  {
    id: 'ocakci',
    name: { tr: 'Ocakçı', en: 'Stove Keeper' },
    salary: 5,
    needs: [{ text: { tr: 'Giriş Salonu\'nda 1 yıldız', en: '1 star in the Entrance Hall' }, ok: (s) => stars(s, 'salon') >= 1 }],
  },
  {
    id: 'katcayci',
    name: { tr: 'Kat Çaycısı', en: 'Floor Tea Boy' },
    salary: 10,
    needs: [
      { text: { tr: 'Zemin Kat\'ta 1 yıldız', en: '1 star on the Ground Floor' }, ok: (s) => stars(s, 'zemin') >= 1 },
      { text: { tr: '1. Kat\'ta 1 yıldız', en: '1 star on the 1st Floor' }, ok: (s) => stars(s, 'kat1') >= 1 },
    ],
  },
  {
    id: 'bascayci',
    name: { tr: 'Baş Çaycı', en: 'Head Tea Boy' },
    salary: 18,
    needs: [
      { text: { tr: '2. Kat\'ta 1 yıldız', en: '1 star on the 2nd Floor' }, ok: (s) => stars(s, 'kat2') >= 1 },
      { text: { tr: 'İtibar 45+', en: 'Reputation 45+' }, ok: (s) => s.rep >= 45 },
    ],
  },
  {
    id: 'caycibasi',
    name: { tr: 'Han Çaycıbaşı', en: 'Chief of Tea' },
    salary: 28,
    needs: [
      { text: { tr: '3. Kat\'ta 1 yıldız', en: '1 star on the 3rd Floor' }, ok: (s) => stars(s, 'kat3') >= 1 },
      { text: { tr: 'İtibar 50+', en: 'Reputation 50+' }, ok: (s) => s.rep >= 50 },
      { text: { tr: 'Han tarafına 2 kanıt ulaştır', en: 'Deliver 2 pieces of evidence to the han side' }, ok: (s) => liveEvidence(s) >= 2 },
    ],
  },
  {
    id: 'patron',
    name: { tr: 'Çay Ocağı Patronu', en: 'Boss of the Tea House' },
    salary: 45,
    needs: [{ text: { tr: `Han toplantısında gerçeği anlat (${EVIDENCE_NEEDED}+ kanıt)`, en: `Tell the truth at the han meeting (${EVIDENCE_NEEDED}+ evidence)` }, ok: (s) => s.endings.includes('saved') }],
  },
];

/** Kayda göre hak edilen unvan (sırayla; asla geri düşmez). */
export function earnedTitle(s: SaveData): number {
  let t = 0;
  for (let i = 1; i < TITLES.length; i++) {
    if (TITLES[i].needs.every((n) => n.ok(s))) t = i;
    else break;
  }
  return Math.max(s.title, t);
}

/** Bir sonraki unvanın şartları (menüde gösterilir). */
export function nextTitleNeeds(s: SaveData): { title: Title; needs: { text: Text; done: boolean }[] } | null {
  const next = TITLES[s.title + 1];
  if (!next) return null;
  return { title: next, needs: next.needs.map((n) => ({ text: n.text, done: n.ok(s) })) };
}

/** İtibarın bahşişe etkisi: 0 → ×0,9, 50 → ×1,0, 100 → ×1,1 */
export const repTipFactor = (rep: number) => 0.9 + Math.max(0, Math.min(100, rep)) * 0.002;

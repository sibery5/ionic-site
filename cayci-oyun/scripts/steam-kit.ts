// Steamworks panelinde girilecek başarım listesini koddaki tanımlardan üretir (adlar birebir aynı olmalı).
// Kullanım: npx tsx scripts/steam-kit.ts  → steam/achievements.json, steam/achievements.csv
import { writeFileSync, mkdirSync } from 'node:fs';
import { ACHIEVEMENTS } from '../src/meta/achievements';

mkdirSync('steam', { recursive: true });
const rows = ACHIEVEMENTS.map((a) => ({
  apiName: a.id,
  displayName: { turkish: a.name.tr, english: a.name.en },
  description: { turkish: a.desc.tr, english: a.desc.en },
  hidden: a.id.startsWith('END_'), // son başarımları sürpriz kalsın
  icon: `steam/achievement-icons/${a.id}.png`,
}));
writeFileSync('steam/achievements.json', JSON.stringify(rows, null, 2) + '\n');
const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
writeFileSync(
  'steam/achievements.csv',
  ['api_name,name_tr,name_en,desc_tr,desc_en,hidden', ...rows.map((r) => [r.apiName, r.displayName.turkish, r.displayName.english, r.description.turkish, r.description.english, r.hidden].map((v) => esc(String(v))).join(','))].join('\n') + '\n',
);
console.log(`${rows.length} başarım yazıldı`);

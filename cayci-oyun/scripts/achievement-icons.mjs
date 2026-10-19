// Steam başarım ikonları (256×256, açık ve _locked): oyunun kendi simgeleriyle (src/ui/icons.ts) çizilir, yazı tipi simgesi yok.
// Kullanım: node scripts/achievement-icons.mjs
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
const server = await createServer({ server: { port: 5215 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
await page.goto('http://localhost:5215/');
await page.waitForTimeout(800);
const out = await page.evaluate(async () => {
  const { drawIcon } = await import('/src/ui/icons.ts');
  const { ACHIEVEMENTS } = await import('/src/meta/achievements.ts');
  // başarım → simge ve (varsa) sayı
  const MAP = {
    FIRST_TEA: ['glass'], TOWER_8: ['tower', '8'], TOWER_12: ['tower', '12'], SPIN_1: ['spin'], SPIN_25: ['spin', '25'], COMBO_3: ['star', '×3'],
    BANK_100: ['money', '100'], RUN_250: ['money', '250'], CLEAN_RUN: ['good'], VIP_5: ['star', '5'], ALL_1STAR: ['star', '1'], ALL_3STAR: ['star', '3'],
    GOSSIP_ALL: ['notebook'], END_SAVED: ['key'], END_SILENT: ['hush'], END_DISBELIEVED: ['shrug'], CAT_10: ['cat', '10'], BROKEN_100: ['shard', '100'],
    DAILY_7: ['calendar', '7'], LEVEL_10: ['chevron', '10'], LEVEL_30: ['chevron', '30'], SALE_1: ['ear'], SALE_10: ['talk', '10'], LIAR_5: ['lie', '5'],
    ESCAPE_1: ['run'], CAUGHT_3: ['boom', '3'], BONK_1: ['anger'], BETRAY_1: ['villain'], TITLE_BAS: ['teapot'], END_SOLD: ['money'],
    INSPECT_PASS: ['boss'], BACKFIRE_1: ['mad'], BOSS_BONK: ['boom'], ENDLESS_300: ['glass', '5:00'],
  };
  const GOLD = ['END_SAVED', 'TITLE_BAS', 'ALL_3STAR', 'LEVEL_30', 'TOWER_12', 'INSPECT_PASS', 'ENDLESS_300'];
  const DARK = ['BETRAY_1', 'END_SOLD', 'BOSS_BONK'];
  const res = {};
  const missing = [];
  for (const a of ACHIEVEMENTS) {
    const m = MAP[a.id];
    if (!m) { missing.push(a.id); continue; }
    for (const locked of [false, true]) {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      // rozet: çay tepsisi gibi metal halka, içi demli çay rengi
      const ring = GOLD.includes(a.id) ? ['#f6dc8a', '#b8862e'] : DARK.includes(a.id) ? ['#9a9a9a', '#3a3a3a'] : ['#e9e3d6', '#8c8578'];
      const bg = DARK.includes(a.id) ? ['#2c2c34', '#141418'] : ['#9a2a16', '#3c0f08'];
      let grd = g.createRadialGradient(128, 128, 20, 128, 128, 128);
      grd.addColorStop(0, ring[0]);
      grd.addColorStop(1, ring[1]);
      g.fillStyle = grd;
      g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
      grd = g.createRadialGradient(110, 96, 10, 128, 128, 108);
      grd.addColorStop(0, bg[0]);
      grd.addColorStop(1, bg[1]);
      g.fillStyle = grd;
      g.beginPath(); g.arc(128, 128, 106, 0, Math.PI * 2); g.fill();
      // ince lale motifi: halka üstünde 12 nokta
      g.fillStyle = 'rgba(255,240,200,0.35)';
      for (let i = 0; i < 12; i++) { const t = (i / 12) * Math.PI * 2; g.beginPath(); g.arc(128 + Math.cos(t) * 115, 128 + Math.sin(t) * 115, 3, 0, Math.PI * 2); g.fill(); }
      const [name, num] = m;
      const y = num ? 108 : 128;
      drawIcon(g, name, 128, y, num ? 128 : 150, { line: '#f6ecd6' });
      if (num) {
        g.font = 'bold 54px Georgia, serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 8;
        g.strokeStyle = '#2a1a10';
        g.strokeText(num, 128, 196);
        g.fillStyle = '#f6dc8a';
        g.fillText(num, 128, 196);
      }
      if (locked) {
        const d = g.getImageData(0, 0, 256, 256);
        for (let i = 0; i < d.data.length; i += 4) {
          const l = 0.3 * d.data[i] + 0.59 * d.data[i + 1] + 0.11 * d.data[i + 2];
          d.data[i] = d.data[i + 1] = d.data[i + 2] = l * 0.55 + 20;
        }
        g.putImageData(d, 0, 0);
      }
      res[a.id + (locked ? '_locked' : '')] = c.toDataURL('image/png').split(',')[1];
    }
  }
  return { res, missing };
});
if (out.missing.length) throw new Error('simgesi tanımsız başarım: ' + out.missing.join(', '));
mkdirSync('steam/achievement-icons', { recursive: true });
for (const [k, b64] of Object.entries(out.res)) writeFileSync(`steam/achievement-icons/${k}.png`, Buffer.from(b64, 'base64'));
console.log(`${Object.keys(out.res).length} ikon`);
await browser.close();
await server.close();

// Hikâye dengesi: bot bütün kariyeri dedikodu satarak oynar; kanıt, itibar ve unvanın vardiya vardiya nasıl ilerlediğini yazar.
// Kullanım: node scripts/story.mjs   (SKILL=0.5,0.8 SEEDS=1,2 MAX=30 ile değiştirilebilir)
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const server = await createServer({ server: { port: 5198 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => localStorage.clear());
await page.goto('http://localhost:5198/');
await page.waitForTimeout(1500);
const SKILLS = (process.env.SKILL || '0.4,0.7,0.95').split(',').map(Number);
const SEEDS = (process.env.SEEDS || '1,2').split(',').map(Number);
const MAX = Number(process.env.MAX || 30);
const summary = [];
for (const skill of SKILLS) {
  for (const seed of SEEDS) {
    const pol = { greed: 7, spin: true, timingError: 0.06, careful: true, gossip: skill };
    const log = await page.evaluate(([pol, seed, max]) => window.__cayci.botCareer(pol, seed, max), [pol, seed, MAX]);
    console.log(`\n== beceri ${skill} tohum ${seed}`);
    for (const r of log) console.log(`${String(r.n).padStart(2)} ${r.venue.padEnd(6)} skor ${String(r.score).padStart(4)} yıldız ${r.stars} duydu ${r.heard} soru ${r.asked} satış ${r.sales || '-'} kovalama ${r.chases}/${r.caught} | cep ${r.pocket} kanıt ${r.evidence} itibar ${r.rep} unvan ${r.title}${r.believed ? '  ✔ inandırır' : ''}`);
    const last = log[log.length - 1];
    const firstTeras = log.findIndex((r) => r.venue === 'teras' && r.stars >= 1) + 1;
    summary.push({ skill, seed, shifts: log.length, believed: last.believed, firstTeras, evidence: last.evidence, rep: last.rep });
  }
}
console.log('\nÖZET (vardiya = inandırana kadar oynanan vardiya sayısı)');
for (const s of summary) console.log(`beceri ${s.skill} tohum ${s.seed}: teras ilk geçiş ${s.firstTeras}. vardiya, ${s.believed ? `${s.shifts}. vardiyada inandırıyor` : `${s.shifts} vardiyada inandıramadı`} (kanıt ${s.evidence}, itibar ${s.rep})`);
console.log('ERRORS:', errors.length ? errors.slice(0, 5).join('\n') : 'none');
await browser.close();
await server.close();

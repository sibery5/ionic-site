// Mağaza ve belge görselleri: her mekân, kule, Fırıldak, dedikodu paneli, kovalama, tepsiyle vurma, teftiş,
// ara sahne seçimi, Sonsuz Vardiya ve iki ara sahne. Hepsi gerçek oyundan, botla ve sahne kancalarıyla çekilir.
// Kullanım: OUT=steam/screenshots/tr W=1920 H=1080 LANG_ID=tr node scripts/screens.mjs
//           OUT=docs/gorseller DOCS=1 node scripts/screens.mjs   (belge adlarıyla, menü ekranları da)
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const OUT = process.env.OUT || 'shots/screens';
const W = Number(process.env.W || 1280);
const H = Number(process.env.H || 720);
const LANG = process.env.LANG_ID || 'tr';
const DOCS = !!process.env.DOCS;
// yazılım çiziminde büyük çözünürlük yavaş: kare oturana kadar bekle
const WAIT = Number(process.env.WAIT || (W > 1400 ? 4000 : 1600));
mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5219 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const POCKET = ['hayri_tapu', 'sevim_evrak', 'ferhat_vekalet', 'rifat_rapor', 'lale_foto', 'nadir_rapor', 'f_ask', 'nevin_fal'];
await page.addInitScript(
  ([lang, pocket]) => {
    const s = {
      version: 2, xp: 4200, wallet: 640, title: 3, rep: 64, pocket, evidence: ['hayri_tapu', 'rifat_rapor'], scenes: ['intro'], tutorialDone: true, playerName: 'Cemal',
      look: { tray: 'tray-brass', vest: 'vest-red', hat: 'hat-fez', glass: 'glass-gold' },
      venues: { salon: { best: 140, stars: 3, objectives: [], plays: 4 }, zemin: { best: 90, stars: 2, objectives: [], plays: 3 }, kat1: { best: 60, stars: 1, objectives: [], plays: 2 } },
      settings: { lang, volume: 0, music: 0, sensitivity: 1, quality: 'high', invertY: false, autoQuality: false },
    };
    localStorage.setItem('cayci-save-v2', JSON.stringify(s));
  },
  [LANG, POCKET],
);
await page.goto('http://localhost:5219/');
await page.waitForTimeout(2500);

let n = 1;
const ev = (f, a) => page.evaluate(f, a);
const shot = async (name, wait = WAIT) => {
  await page.waitForTimeout(wait);
  const ext = OUT.includes('steam') || DOCS ? 'jpg' : 'png';
  const file = `${OUT}/${String(n++).padStart(2, '0')}-${name}.${ext}`;
  await page.screenshot({ path: file, ...(ext === 'jpg' ? { type: 'jpeg', quality: 88 } : {}) });
  console.log('  ', file);
};
const step = async (name, f) => {
  try {
    await f();
  } catch (e) {
    console.log('ATLANDI', name, String(e).split('\n')[0]);
  }
};
const POL = { greed: 6, spin: true, timingError: 0.03, careful: true };
const freeze = () => ev(() => { window.__cayci.game.state = 'overlay'; });

if (DOCS) {
  await step('menu', () => shot('ana-menu', 800));
  await step('harita', async () => {
    await page.locator('.btn.primary').first().click();
    await shot('kariyer-haritasi', 900);
    await page.locator('button', { hasText: LANG === 'tr' ? 'Geri' : 'Back' }).last().click();
  });
}

// mekânlar (bot bir süre oynar)
const VENUE_SHOTS = [
  [0, 14, 'giris-salonu', 3],
  [1, 20, 'zemin-kat', 2],
  [2, 26, 'kat1-islak-zemin', 4],
  [3, 18, 'kat2-pasa', 5],
  [4, 22, 'kat3-karanlik', 3],
  [5, 24, 'bodrum-arsiv', 3],
  [6, 30, 'teras', 6],
];
for (const [i, secs, name, seed] of VENUE_SHOTS)
  await step(name, async () => {
    await ev(([i, secs, pol, seed]) => window.__cayci.botScene(i, secs, pol, seed), [i, secs, POL, seed]);
    await shot(name);
  });

await step('kule', async () => {
  await ev(() => {
    window.__cayci.botScene(6, 0.1, { greed: 0, spin: false, timingError: 0, careful: true }, 1);
    const r = window.__cayci.game.run;
    for (let k = 0; k < 10; k++) r.tray.addGlass(k % 3 ? 'demli' : 'acik', 0.92, 85, 1);
    window.__cayci.sim([[0.6, []], [1.2, ['KeyW', 'ControlLeft']]]);
  });
  await shot('kule');
});
await step('firildak', async () => {
  await ev(() => {
    window.__cayci.botScene(0, 0.1, { greed: 0, spin: false, timingError: 0, careful: true }, 1);
    const r = window.__cayci.game.run;
    for (let k = 0; k < 4; k++) r.tray.addGlass('demli', 0.92, 85, 1);
    r.player.place(10.5, 7.2, Math.PI / 2 + 0.6);
    r.tray.reset(r.player.hand);
    window.__cayci.sim([[0.3, []], [0.02, ['KeyF']], [0.255, []], [0.02, ['KeyF']], [0.68, []]]);
  });
  await shot('firildak');
});

// dedikodu: 1. katta Av. Rıfat sorar, panel; Şükran Hanım'a kendi lafı → kovalama
const setup = (office, kind, topic) =>
  ev(
    ([office, kind, topic]) => {
      const r = window.__cayci.game.run;
      r.orders.clear();
      const c = r.customers.get(office);
      r.orders.set(office, { office, kind, items: ['demli'], createdAt: r.time, patience: 30, perfect: true, topic });
      const p = c.desk.center.clone().addScaledVector(c.desk.dir, 1.3);
      r.player.place(p.x, p.z, Math.atan2(-c.desk.dir.x, -c.desk.dir.z));
      r.tray.glasses.length = 0;
      for (let i = 0; i < 4; i++) r.tray.addGlass('demli', 0.92, 85, 1);
      r.tray.reset(r.player.hand);
    },
    [office, kind, topic],
  );
const deliver = () => ev(() => window.__cayci.sim([[0.3, []], [0.02, ['KeyE']], [0.2, []]]));
await step('dedikodu', async () => {
  await ev(() => window.__cayci.startRun(2, 'career'));
  await freeze();
  await setup('c', 'gossip', 'tapu');
  await deliver();
  await shot('dedikodu-paneli');
  await ev(() => window.__cayci.game.run.intrigue.choose(-1));
});
await step('kovalama', async () => {
  await setup('b', 'gossip', 'kulis');
  await deliver();
  const idx = await ev(() => window.__cayci.game.run.intrigue.panel.cards.indexOf('f_ask'));
  await ev((i) => window.__cayci.game.run.intrigue.choose(i), idx);
  await ev(() => window.__cayci.sim([[0.9, []]]));
  await shot('kovalama');
});
await step('vurma', async () => {
  await ev(() => window.__cayci.sim([[4, []]]));
  await ev(() => {
    const r = window.__cayci.game.run;
    r.intrigue.anger = 100;
    r.intrigue.angerReady = true;
    const nn = r.npcs[0];
    const f = r.player.forward();
    nn.pos.set(r.player.pos.x + f.x * 1.1, 0, r.player.pos.z + f.z * 1.1);
    nn.wait = 5;
  });
  await ev(() => window.__cayci.sim([[0.1, []], [0.02, ['KeyR']], [0.35, []]]));
  await shot('tepsiyle-vurma', WAIT / 2);
});
// teftiş: 1. katta Nadir Bey gelir ve kusursuz teslimi görür
await step('teftis', async () => {
  await ev(() => window.__cayci.startRun(2, 'career'));
  await freeze();
  await ev(() => { window.__cayci.game.run.intrigue.inspAt = 0; window.__cayci.sim([[0.2, []]]); });
  await setup('a', 'normal');
  await ev(() => {
    const r = window.__cayci.game.run;
    const nn = r.intrigue.insp.npc;
    const f = r.player.forward();
    nn.pos.set(r.player.pos.x + f.x * 1.8 + 0.7, 0, r.player.pos.z + f.z * 1.8);
    nn.wait = 30;
    nn.path = [];
  });
  await deliver();
  await shot('patron-teftisi');
});
// Sonsuz Vardiya
await step('sonsuz', async () => {
  await ev(() => window.__cayci.startRun(1, 'endless'));
  await freeze();
  await ev(() => window.__cayci.sim([[24, []]]));
  await shot('sonsuz-vardiya');
});
// ara sahne seçimi (Selim'in zarfı) ve iki sahne
const toChoice = async (id) => {
  await ev((id) => window.__cayci.scene(id), id);
  await page.waitForTimeout(1500);
  for (let i = 0; i < 30; i++) {
    if (await page.locator('.dialogue.choosing').count()) {
      // repliği bir tuşla tamamla (seçim beklerken E sahneyi ilerletmez), seçenekler belirsin
      await page.keyboard.press('KeyE');
      await page.locator('.dlg-choices:not(.hidden)').waitFor({ timeout: 30000 });
      return;
    }
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(300);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(300);
  }
};
// sahneler temiz bir sayfada (önceki vardiyalar kapansın). ONLY_SCENES=1: sadece sahne kareleri (15-17)
await page.goto('http://localhost:5219/');
await page.waitForTimeout(2000);
await step('secim', async () => {
  await toChoice('villain');
  await shot('secim-selimin-zarfi');
  await page.keyboard.press('Digit2');
  await page.keyboard.press('Escape');
});
await step('bodrum-sahne', async () => {
  await toChoice('bodrum');
  await shot('sahne-kayip-tapu');
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
});
await step('patron', async () => {
  await ev(() => window.__cayci.scene('end_saved'));
  await page.waitForTimeout(3000);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyE');
  await shot('sahne-patron-cemal', WAIT + 2500);
  await page.keyboard.press('Escape');
});
if (DOCS) {
  await step('defter', async () => {
    await page.goto('http://localhost:5219/');
    await page.waitForTimeout(1800);
    await page.locator('button', { hasText: LANG === 'tr' ? 'Dedikodu' : 'Gossip' }).first().click();
    await shot('cep-defteri', 900);
  });
}
console.log('ERRORS:', errors.length ? errors.slice(0, 5).join('\n') : 'none');
await browser.close();
await server.close();

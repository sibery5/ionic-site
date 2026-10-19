// Ara sahne seçimlerini dener: Selim'in zarfı, bodrumdaki tapu, toplantıda bayrağa bağlı replikler. shots/choice-*.png
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const server = await createServer({ server: { port: 5217 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.addInitScript(() => localStorage.setItem('cayci-save-v2', JSON.stringify({ version: 2, tutorialDone: true, wallet: 0, rep: 50, evidence: ['hayri_tapu'], settings: { lang: 'tr', volume: 0, music: 0, sensitivity: 1, quality: 'low', invertY: false } })));
await page.goto('http://localhost:5217/');
await page.waitForTimeout(1500);
const save = () => page.evaluate(() => { const s = window.__cayci.game.save; return { flags: [...s.flags], wallet: s.wallet, rep: s.rep, burned: s.burned }; });
/** seçim çıkana kadar ilerle; çıkınca n'inci seçeneği seç */
const playTo = async (id, pick, shotName) => {
  await page.evaluate((id) => window.__cayci.scene(id), id);
  await page.waitForTimeout(1500);
  for (let i = 0; i < 30; i++) {
    if (await page.locator('.dialogue.choosing').count()) {
      await page.locator('.dlg-choices:not(.hidden)').waitFor({ timeout: 8000 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `shots/choice-${shotName}.png` });
      await page.keyboard.press(`Digit${pick}`);
      await page.waitForTimeout(400);
      return true;
    }
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(250);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(250);
  }
  return false;
};
const finish = async () => {
  for (let i = 0; i < 30 && (await page.locator('.dialogue').count()); i++) {
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(200);
  }
};
console.log('villain seçimi göründü:', await playTo('villain', 3, '1-villain'));
await finish();
console.log('sonra:', JSON.stringify(await save()));
console.log('bodrum seçimi göründü:', await playTo('bodrum', 1, '2-bodrum'));
await finish();
console.log('sonra:', JSON.stringify(await save()), 'kanıt:', await page.evaluate(async () => (await import('/src/meta/titles.ts')).liveEvidence(window.__cayci.game.save)));
// toplantı: doubleAgent ve deedToRifat replikleri oynamalı
await page.evaluate(() => window.__cayci.scene('meeting'));
await page.waitForTimeout(1500);
const said = [];
for (let i = 0; i < 20 && (await page.locator('.dialogue').count()); i++) {
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(150);
  const tx = await page.locator('.dlg-text').textContent().catch(() => '');
  if (tx && !said.includes(tx)) said.push(tx);
  if (tx && tx.includes('Zarfınız')) await page.screenshot({ path: 'shots/choice-3-meeting.png' });
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(150);
}
console.log('toplantı replikleri:', said.length, said.some((t) => t.includes('Zarfınız')), said.some((t) => t.includes('vakıf')), said.some((t) => t.includes('para aldı')));
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
await server.close();

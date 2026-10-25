// Oyuna özel uygulama ikonunu (logo SVG'si) PNG olarak üretir
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/ui/icons.js'), 'utf8');
  const m = src.match(/logo: S\(`([\s\S]*?)`, '0 0 100 104'\)/);
  const inner = m[1];
  const html = `<html><body style="margin:0;background:transparent">
  <div style="width:512px;height:512px;border-radius:96px;background:radial-gradient(circle at 50% 35%,#3a1a10,#0c0806 75%);display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 14px #8a6a1a, inset 0 0 0 20px #0c0806">
  <svg viewBox="0 0 100 104" width="360" height="374" fill="#d4af37">${inner}</svg></div></body></html>`;
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 512, height: 512 } });
  await p.setContent(html);
  fs.mkdirSync(path.join(__dirname, '../build'), { recursive: true });
  await p.screenshot({ path: path.join(__dirname, '../build/icon.png'), omitBackground: true });
  await b.close();
  console.log('build/icon.png hazır');
})();

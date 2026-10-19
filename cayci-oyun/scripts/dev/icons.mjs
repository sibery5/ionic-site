// Simge vitrini: oyunun kendi simgelerini SVG (üst) ve canvas (alt) olarak büyük çizer → shots/icons.png
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const server = await createServer({ server: { port: 5214 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5214/');
await page.waitForTimeout(1200);
await page.evaluate(async () => {
  const { icon, drawIcon, ICON_NAMES } = await import('/src/ui/icons.ts');
  document.body.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;inset:0;z-index:999;background:#2b1d14;color:#f2e3c2;font:12px sans-serif;display:flex;flex-wrap:wrap;gap:10px;padding:14px;align-content:flex-start';
  document.body.appendChild(wrap);
  for (const n of ICON_NAMES) {
    const cell = document.createElement('div');
    cell.style.cssText = 'width:110px;text-align:center';
    cell.innerHTML = `<div style="font-size:46px;line-height:1">${icon(n)}</div>`;
    const c = document.createElement('canvas');
    c.width = c.height = 48;
    drawIcon(c.getContext('2d'), n, 24, 24, 44);
    cell.appendChild(c);
    cell.appendChild(Object.assign(document.createElement('div'), { textContent: n }));
    wrap.appendChild(cell);
  }
  const st = document.createElement('style');
  st.textContent = '.ic{width:1.2em;height:1.2em;display:inline-block}';
  document.head.appendChild(st);
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/icons.png' });
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
await server.close();

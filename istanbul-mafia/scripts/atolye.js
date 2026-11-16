// Model atölyesi çalıştırıcısı: modelleri stüdyo ışığında görüntüler, sayılarını yazar, isteğe bağlı GLB dışa aktarır.
//   node scripts/atolye.js --liste
//   node scripts/atolye.js insan:kahraman araba:sedan --gorunus q,f,s        → .testout/atolye/<kimlik>-<görünüş>.jpg
//   node scripts/atolye.js silah:pistol --glb                                 → assets/models/<kimlik>.glb
//   node scripts/atolye.js --on insan: --gorunus q,yuz                        → kimliği "insan:" ile başlayan her model
//   node scripts/atolye.js --on araba: --arac --resimsiz                      → [araç] oran tablosu (hedef aralık dışı '!')
//   node scripts/atolye.js insan:kahraman --olcu                              → kesit ölçüleri (genişlik/derinlik, m)
// Görünüşler: q ön-sol 3/4 · f ön · s yan · b arka 3/4 · t üst · yuz yüz yakın planı · el el yakın planı
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const work = path.join(root, '.testout', 'atolye');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const views = opt('--gorunus', 'q').split(',');
const prefix = opt('--on', null);
const ids = args.filter((a, i) => !a.startsWith('--') && !['--gorunus', '--on', '--boyut'].includes(args[i - 1]));
const [W, H] = opt('--boyut', '1600x900').split('x').map(Number);

(async () => {
  fs.mkdirSync(work, { recursive: true });
  esbuild.buildSync({ entryPoints: [path.join(root, 'src/dev/atolye.js')], bundle: true, format: 'iife', globalName: 'atolye', target: ['chrome110'], outfile: path.join(work, 'atolye.js'), legalComments: 'none', logLevel: 'error' });
  fs.writeFileSync(path.join(work, 'index.html'), `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#222"><canvas id="c" width="${W}" height="${H}"></canvas><script src="atolye.js"></script>`);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  p.on('pageerror', (e) => console.log('[sayfa hatası]', e.message));
  await p.goto('file://' + path.join(work, 'index.html'));
  await p.waitForFunction(() => window.atolye && window.atolye.liste, null, { timeout: 120000 });
  try { fs.symlinkSync(path.join(root, 'assets'), path.join(work, 'assets')); } catch (e) { /* var */ }
  const mhOk = await p.evaluate((e) => atolye.hazir(e), flag('--eski'));
  if (!mhOk) console.log('UYARI: gerçekçi insan verisi yüklenemedi (assets/mh)');
  const all = await p.evaluate(() => atolye.liste());
  if (flag('--liste')) { console.log(all.join('\n')); await b.close(); return; }
  const todo = flag('--hepsi') ? all : prefix ? all.filter((i) => i.startsWith(prefix)) : ids;
  for (const id of todo) {
    if (!all.includes(id)) { console.log('yok:', id); continue; }
    const safe = id.replace(/[:/]/g, '_');
    try {
      console.log(JSON.stringify(await p.evaluate((i) => atolye.bilgi(i), id)));
      if (flag('--arac')) { console.log(JSON.stringify(await p.evaluate((i) => atolye.aracOlcu(i), id))); if (!views.length || flag('--resimsiz')) continue; }
      if (flag('--olcu')) console.log(JSON.stringify(await p.evaluate((i) => atolye.olcu(i), id)));
      if (flag('--tutus')) console.log('tutus', id, JSON.stringify(await p.evaluate((i) => atolye.tutusOlc(i), id)));
      for (const v of views) {
        const url = await p.evaluate(([i, vv]) => atolye.shot(i, vv), [id, v]);
        fs.writeFileSync(path.join(work, `${safe}-${v}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
      }
      if (flag('--glb')) {
        const out = path.join(root, 'assets', 'models');
        fs.mkdirSync(out, { recursive: true });
        const b64 = await p.evaluate((i) => atolye.glb(i), id);
        fs.writeFileSync(path.join(out, safe + '.glb'), Buffer.from(b64, 'base64'));
      }
    } catch (e) { console.log('HATA', id, String(e.message || e).slice(0, 300)); }
  }
  await b.close();
})();

// Yayın derlemesini (dist/) tek bir HTML dosyasına gömer: oyna/CAYCI.html
// Bütün modeller, sesler ve dokular koddan üretildiği için dosya internetsiz, çift tıklayınca açılır.
// Kullanım: npm run oyna
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const src = readFileSync('dist/index.html', 'utf8');
const css = src.match(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/);
const js = src.match(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/);
if (!css || !js) throw new Error('dist/index.html beklenen biçimde değil');
const code = readFileSync(`dist/${js[1]}`, 'utf8').replace(/<\/script/gi, '<\\/script');
const html = src
  .replace(css[0], () => `<style>\n${readFileSync(`dist/${css[1]}`, 'utf8')}\n</style>`)
  .replace(js[0], '')
  // modül betikleri zaten belge yüklenince çalışır; gövdenin sonunda da aynı
  .replace('</body>', () => `<script type="module">\n${code}\n</script>\n</body>`);
mkdirSync('oyna', { recursive: true });
writeFileSync('oyna/CAYCI.html', html);
console.log(`oyna/CAYCI.html yazıldı (${(html.length / 1024).toFixed(0)} KB)`);

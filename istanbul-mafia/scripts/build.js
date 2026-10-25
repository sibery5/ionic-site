// Web paketini derler: src -> app/
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'app');
fs.mkdirSync(out, { recursive: true });
esbuild.buildSync({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  minify: process.argv.includes('--dev') ? false : true,
  sourcemap: false,
  format: 'iife',
  target: ['chrome110'],
  outfile: path.join(out, 'game.js'),
  legalComments: 'none',
});
for (const f of ['index.html', 'styles.css']) fs.copyFileSync(path.join(root, 'src', f), path.join(out, f));
const icon = path.join(root, 'build', 'icon.png');
if (fs.existsSync(icon)) fs.copyFileSync(icon, path.join(out, 'icon.png'));
console.log('Derlendi ->', out, (fs.statSync(path.join(out, 'game.js')).size / 1024).toFixed(0) + ' KB');

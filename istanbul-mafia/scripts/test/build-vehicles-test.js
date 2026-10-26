// Test paketi: app/game-veh.js + app/index-veh.html (normal derlemeyi etkilemez)
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const out = path.join(root, 'app');
fs.mkdirSync(out, { recursive: true });
esbuild.buildSync({ entryPoints: [path.join(__dirname, 'vehicles-entry.js')], bundle: true, format: 'iife', target: ['chrome110'], outfile: path.join(out, 'game-veh.js') });
const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8').replace('game.js', 'game-veh.js');
fs.writeFileSync(path.join(out, 'index-veh.html'), html);
for (const f of ['styles.css']) fs.copyFileSync(path.join(root, 'src', f), path.join(out, f));
console.log('Test paketi hazır: app/index-veh.html');

// [S2] Karakter yaratıcısı sahnesi: aydınlık bir giyim mağazası (butik).
// Eski sahne: siyah fon, kırmızı arka ışık, tek spot -> karakter karanlıkta kalıyordu.
// Yeni: sıcak beyaz duvarlar, açık meşe parke, ortada beyaz sergi kaidesi (altın halka), kaide arkasında iki boy aynası (altın çerçeve),
// iki yanda raflar (katlanmış giysiler, ayakkabı kutuları), askılık (asılı ceket/gömlekler), saksı bitkisi, tavanda gömme spot halkaları.
// Işık: yumuşak gök/zemin ışığı + gölgesiz anahtar ve dolgu ışığı (gölge haritası yok: yaratıcı ekranı ucuz kalsın);
// karakterin altında yumuşak temas gölgesi (radyal doku). Hepsi bir kez kurulur; kare içinde bellek ayırma yok.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
// açık meşe parke: tahta şeritler, hafif ton farkı ve damar
function parquet() {
  return canvasTex(512, 512, (g, w, h) => {
    let s = 7; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const rows = 8, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -R() * 200;
      while (x < w) {
        const len = 180 + R() * 160, l = 72 + R() * 8;
        g.fillStyle = `hsl(${32 + R() * 6}, ${38 + R() * 10}%, ${l}%)`; g.fillRect(x, r * rh, len, rh);
        g.strokeStyle = 'rgba(120,80,40,0.10)'; g.lineWidth = 1;
        for (let k = 0; k < 5; k++) { const y = r * rh + 4 + R() * (rh - 8); g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + len * 0.3, y + R() * 6 - 3, x + len * 0.7, y + R() * 6 - 3, x + len, y); g.stroke(); }
        g.fillStyle = 'rgba(90,60,30,0.35)'; g.fillRect(x, r * rh, 1.5, rh);
        x += len;
      }
      g.fillStyle = 'rgba(90,60,30,0.3)'; g.fillRect(0, r * rh, w, 1.5);
    }
  }, [5, 5]);
}
function softShadow() {
  return canvasTex(128, 128, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(40,28,18,0.55)'); gr.addColorStop(0.5, 'rgba(40,28,18,0.22)'); gr.addColorStop(1, 'rgba(40,28,18,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
}

export function buildCreatorStage(renderer) {
  const s = new THREE.Scene();
  const wallCol = 0xe9e0d2;
  s.background = new THREE.Color(wallCol);
  // ortam yansıması (ayna, altın, deri ayakkabı parlasın)
  try { const pm = new THREE.PMREMGenerator(renderer); s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; s.environmentIntensity = 0.35; pm.dispose(); } catch (e) { /* yazılımsal çizicide olmayabilir */ }
  s.add(new THREE.HemisphereLight(0xfffaf2, 0xb8a080, 1.15));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.3); key.position.set(2.5, 4, 3.5); s.add(key);
  const fill = new THREE.DirectionalLight(0xe8f0ff, 0.7); fill.position.set(-3, 2.2, 3); s.add(fill);
  const back = new THREE.DirectionalLight(0xfff4e0, 0.9); back.position.set(-1, 3, -3); s.add(back);
  const M = (c, r = 0.8, m = 0, extra) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...extra });
  const box = (w, h, d, mat, x, y, z, ry = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); o.rotation.y = ry; s.add(o); return o; };
  // oda: zemin, arka ve yan duvarlar, tavan
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 12), M(0xffffff, 0.55, 0, { map: parquet() }));
  floor.rotation.x = -Math.PI / 2; floor.position.z = -1; s.add(floor);
  const wallM = M(wallCol, 0.95);
  box(14, 4.2, 0.1, wallM, 0, 2.1, -3.6);
  box(0.1, 4.2, 10, wallM, -5.2, 2.1, 0); box(0.1, 4.2, 10, wallM, 5.2, 2.1, 0);
  box(14, 0.1, 12, M(0xfbf8f3, 1), 0, 4.2, -1);
  // süpürgelik ve duvar panelleri (ince çıtalar)
  const trimM = M(0xe6dccd, 0.7);
  box(14, 0.12, 0.04, trimM, 0, 0.06, -3.54);
  for (const x of [-3.9, -1.3, 1.3, 3.9]) box(0.04, 3.4, 0.03, trimM, x, 1.9, -3.54);
  // tavanda gömme spot halkaları (parlak diskler) + duvarda ışık lekeleri
  const glow = new THREE.MeshBasicMaterial({ color: 0xfffbf0 });
  for (const x of [-3.2, -1.1, 1.1, 3.2]) for (const z of [-2.4, 0.2]) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), glow); d.rotation.x = Math.PI / 2; d.position.set(x, 4.14, z); s.add(d); }
  const wash = canvasTex(128, 256, (g, w, h) => { const gr = g.createRadialGradient(w / 2, 0, 4, w / 2, h * 0.15, h * 0.9); gr.addColorStop(0, 'rgba(255,248,232,0.85)'); gr.addColorStop(1, 'rgba(255,248,232,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  for (const x of [-3.9, -1.3, 1.3, 3.9]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.8), new THREE.MeshBasicMaterial({ map: wash, transparent: true, depthWrite: false })); p.position.set(x, 2.75, -3.53); s.add(p); }
  // boy aynaları: kaidenin arkasında, hafif açılı, altın çerçeveli
  // ayna: yazılımsal çizicide ortam yansıması zayıf -> hafif mavi-gri cam + çizilmiş yumuşak yansıma şeritleri (kendi ışığıyla)
  const mirTex = canvasTex(128, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#c9d3d8'); gr.addColorStop(0.45, '#eef3f5'); gr.addColorStop(0.55, '#d5dee2'); gr.addColorStop(1, '#aebbc2'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,0.35)'; g.save(); g.translate(w * 0.3, 0); g.rotate(0.35); g.fillRect(0, -20, 14, h * 1.4); g.fillRect(26, -20, 5, h * 1.4); g.restore(); });
  const mirM = new THREE.MeshStandardMaterial({ color: 0x8a959a, roughness: 0.08, metalness: 0.5, emissive: 0xffffff, emissiveMap: mirTex, emissiveIntensity: 0.55 }), goldM = M(0xd4b060, 0.35, 0.35);
  for (const sx of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(sx * 1.55, 0, -3.25); g.rotation.y = -sx * 0.32; s.add(g);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.2, 0.03), mirM); m.position.y = 1.25; g.add(m);
    for (const [w, h, x, y] of [[1.0, 0.05, 0, 2.375], [1.0, 0.05, 0, 0.125], [0.05, 2.3, -0.475, 1.25], [0.05, 2.3, 0.475, 1.25]]) { const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), goldM); f.position.set(x, y, 0.01); g.add(f); }
  }
  // raflar: iki yanda dikmeler + 4 kat; katlanmış giysi yığınları ve ayakkabı kutuları
  const wood = M(0xd9c3a1, 0.6), cloth = [0x1d2440, 0xe8e8e8, 0x8a1a1a, 0x2d5a2d, 0xc9b48a, 0x3a3a3a, 0x5a6a8a, 0xb05a1a, 0xe8c8c8, 0x5a4a3a];
  let ci = 0;
  for (const sx of [-1, 1]) {
    const x0 = sx * 3.9;
    for (const dx of [-1.05, 1.05]) box(0.05, 2.6, 0.45, wood, x0 + dx, 1.3, -3.3);
    for (let k = 0; k < 4; k++) {
      const y = 0.35 + k * 0.62; box(2.15, 0.04, 0.45, wood, x0, y, -3.3);
      if (k === 0) { for (let j = 0; j < 4; j++) box(0.34, 0.14, 0.26, M([0xf0ece0, 0x1a1a1a, 0xc84a3a, 0xe8e8e8][j], 0.7), x0 - 0.7 + j * 0.46, y + 0.09, -3.28); continue; }
      for (let j = 0; j < 4; j++) {
        const n = 3 + ((j + k) % 3), col = cloth[ci++ % cloth.length];
        for (let q = 0; q < n; q++) box(0.36, 0.045, 0.3, M(col, 0.9), x0 - 0.72 + j * 0.48 + (q % 2) * 0.01, y + 0.045 + q * 0.046, -3.27);
      }
    }
  }
  // askılıklar: iki yanda yan duvara dik krom boru + asılı ceket/gömlek (ince kutular, hafif açılı)
  const chrome = M(0xd8d8d8, 0.2, 1);
  for (const sx of [-1, 1]) {
    const x = sx * 4.55;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.6, 8), chrome); bar.rotation.x = Math.PI / 2; bar.position.set(x, 1.75, -0.6); s.add(bar);
    for (const z of [-1.9, 0.7]) box(0.03, 1.75, 0.03, chrome, x, 0.875, z);
    for (let j = 0; j < 9; j++) {
      const z = -1.75 + j * 0.27, col = cloth[(j * 3 + (sx > 0 ? 1 : 0)) % cloth.length];
      const g = box(0.5, 0.82, 0.05, M(col, 0.9), x, 1.3, z, Math.PI / 2 + (j % 2 ? 0.05 : -0.05));
      g.scale.x = 0.9 + (j % 3) * 0.06;
      box(0.42, 0.02, 0.02, chrome, x, 1.72, z, Math.PI / 2);
    }
  }
  // saksı bitkileri (arka köşeler)
  const potM = M(0xf4f1ea, 0.5), leafM = M(0x3d6630, 0.85);
  for (const sx of [-1, 1]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.45, 20), potM); pot.position.set(sx * 2.55, 0.225, -3.0); s.add(pot);
    // yapraklar: gövdeden dışa yayılan uzun ince yaprak plakaları (top top küre yerine)
    for (let k = 0; k < 16; k++) { const a = k * 2.4, t = k / 16, l = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), leafM); l.scale.set(0.45, 1.9, 0.18); l.position.set(sx * 2.55 + Math.sin(a) * (0.12 + 0.22 * t), 0.75 + t * 0.9, -3.0 + Math.cos(a) * (0.12 + 0.22 * t)); l.rotation.set(Math.cos(a) * (0.3 + 0.6 * t), 0, -Math.sin(a) * (0.3 + 0.6 * t)); s.add(l); }
    box(0.03, 0.9, 0.03, M(0x5a4030, 0.9), sx * 2.55, 0.8, -3.0);
  }
  // sergi kaidesi: beyaz silindir + altın halka; üstüne karakter (kökü y=0'da kalsın diye kaide zeminin içine gömülü, üstü 0'da)
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.12, 56), M(0xfbfaf7, 0.35)); ped.position.y = -0.06; ped.scale.y = 1; s.add(ped);
  floor.position.y = -0.12;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.975, 0.012, 8, 72), goldM); ring.rotation.x = Math.PI / 2; ring.position.y = -0.004; s.add(ring);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: softShadow(), transparent: true, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.002; s.add(sh);
  // halı: kaidenin altında koyu yuvarlak halı (zeminle karakter arasında kontrast)
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.7, 64), M(0xb9a98f, 1)); rug.rotation.x = -Math.PI / 2; rug.position.y = -0.115; s.add(rug);
  s.fog = new THREE.Fog(wallCol, 9, 22);
  return s;
}

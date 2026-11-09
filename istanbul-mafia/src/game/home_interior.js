// [şehir] Apartman dairesi iç mekânı: oturma odası (üçlü kanepe, iki berjer, sehpa, TV ünitesi, halı, perdeler,
// lambader, çerçeveler), yatak odası (çift kişilik yatak, gardırop, komodinler, şifonyer), mutfak (tezgâh, ocak,
// davlumbaz, buzdolabı, yemek masası), antre (ayakkabılık, portmanto). Bölme duvarları kapı boşluklu.
// Oturma/yatma yerleri ctx.furnSeats → citylife.js (E: otur / uzan; E ya da WASD: kalk).
// Ev sahibi (homeowner.js) hanenin ilk sakinidir: n.homeOwner = true; genelde kanepede TV izler.
import * as THREE from 'three';
import { Kit, canvasPlane } from './interior_kit.js';
import { woodTexture, wallpaperTexture, carpetTexture } from '../core/textures.js';
import { texRep } from './shop_interiors.js';

const FABRIC = [0x6a2a2a, 0x2a3a5a, 0x5a5a4a, 0x7a6a5a, 0x3a4a3a, 0x8a7a6a, 0x4a3a5a, 0xb8a888];
const WOODS = ['#8a5a3a', '#6b4226', '#a07050', '#5a3a22'];

export function sofa(K, x, z, heading, color, seats = 3, y = 0) {
  const L = (lx, lz) => Kit.L(x, z, heading, lx, lz), w = seats * 0.72 + 0.4, rot = heading;
  const dark = new THREE.Color(color).multiplyScalar(0.8).getHex();
  let [px, pz] = L(0, 0); K.box(w, 0.26, 0.9, px, y + 0.1, pz, dark, { rot, rough: 0.95 });
  for (let i = 0; i < seats; i++) { [px, pz] = L(-w / 2 + 0.2 + 0.36 + i * 0.72, 0.06); K.box(0.7, 0.13, 0.74, px, y + 0.36, pz, color, { rot, rough: 1 }); [px, pz] = L(-w / 2 + 0.2 + 0.36 + i * 0.72, -0.3); K.box(0.68, 0.48, 0.18, px, y + 0.42, pz, color, { rot, rough: 1 }); }
  [px, pz] = L(0, -0.4); K.box(w, 0.62, 0.12, px, y + 0.1, pz, dark, { rot, rough: 0.95 });
  for (const sx of [-1, 1]) { [px, pz] = L(sx * (w / 2 - 0.1), 0); K.box(0.2, 0.36, 0.9, px, y + 0.3, pz, dark, { rot, rough: 0.95 }); }
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { [px, pz] = L(a * (w / 2 - 0.08), b * 0.36); K.box(0.05, 0.1, 0.05, px, y, pz, 0x2a1a10, { rot }); }
  // kırlent
  [px, pz] = L(-w / 2 + 0.42, -0.18); K.box(0.36, 0.34, 0.12, px, y + 0.5, pz, 0xe8dcc0, { rot: rot + 0.3, rough: 1 });
  K.ctx.cols.addRotated(x, z, w, 0.9, rot, y, y + 0.5, 'sofa');
  const out = [];
  for (let i = 0; i < seats; i++) { [px, pz] = L(-w / 2 + 0.2 + 0.36 + i * 0.72, 0.12); out.push(K.seat(px, pz, heading, seats === 1 ? 'armchair' : 'sofa', y)); }
  return out;
}

export function bedDouble(K, x, z, heading, duvet, y = 0) {
  // (x,z) yatağın ortası; heading: ayak ucunun baktığı yön (başucu ters tarafta)
  const L = (lx, lz) => Kit.L(x, z, heading, lx, lz), rot = heading;
  let [px, pz] = L(0, 0); K.box(1.7, 0.32, 2.1, px, y + 0.08, pz, 0x5a3a22, { rot, uv: 'wood' });
  K.box(1.62, 0.2, 2.0, px, y + 0.4, pz, 0xf2efe6, { rot, rough: 1 });
  [px, pz] = L(0, 0.22); K.box(1.68, 0.1, 1.5, px, y + 0.58, pz, duvet, { rot, rough: 1 });
  [px, pz] = L(0, 0.95); K.box(1.68, 0.4, 0.06, px, y + 0.25, pz, duvet, { rot, rough: 1 });
  for (const sx of [-0.42, 0.42]) { [px, pz] = L(sx, -0.78); K.box(0.6, 0.14, 0.36, px, y + 0.6, pz, 0xffffff, { rot, rough: 1 }); }
  [px, pz] = L(0, -1.08); K.box(1.8, 1.15, 0.12, px, y, pz, 0x7a6a5a, { rot, rough: 1 });
  for (const sx of [-0.84, 0.84]) for (const sz of [-0.95, 0.95]) { [px, pz] = L(sx, sz); K.box(0.06, 0.08, 0.06, px, y, pz, 0x2a1a10, { rot }); }
  K.ctx.cols.addRotated(x, z, 1.7, 2.2, rot, y, y + 0.55, 'bed');
  // uzanma yeri: yatağın ortası, baş başucuna (heading + π yönü)
  const [lx, lz] = L(0.25, -0.1);
  return K.seat(lx, lz, heading + Math.PI, 'bed', y + 0.62, { bedX: x, bedZ: z, bedH: heading });
}

function armchair(K, x, z, heading, color) { return sofa(K, x, z, heading, color, 1)[0]; }

function curtains(K, x, z, rot, w, h, color) {
  const L = (lx, lz) => Kit.L(x, z, rot, lx, lz);
  // pencere (gün ışığı) + iki kanat perde (kıvrımlı)
  let [px, pz] = L(0, 0.02); K.emis(w * 0.8, h * 0.62, 0.02, px, 0.95, pz, 0xcfe4f4, rot);
  [px, pz] = L(0, 0.03); K.box(w * 0.82, 0.05, 0.04, px, 0.92, pz, 0xf2f2f2, { rot }).box(0.04, h * 0.62, 0.05, px, 0.95, pz, 0xf2f2f2, { rot });
  [px, pz] = L(0, 0.12); K.box(w + 0.4, 0.04, 0.04, px, 2.62, pz, 0x9a8a6a, { rot, metal: 0.6 });
  for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) { [px, pz] = L(sx * (w / 2 - 0.1 + i * 0.09), 0.12 + (i % 2) * 0.04); K.box(0.1, 2.45, 0.04, px, 0.15, pz, color, { rot, rough: 1 }); }
  // tül
  [px, pz] = L(0, 0.08); K.glass(w * 0.62, 2.35, 0.01, px, 0.22, pz, { rot, color: 0xffffff });
}

function frame(K, x, y, z, rot, w, h, r) {
  const L = (lx, lz) => Kit.L(x, z, rot, lx, lz);
  let [px, pz] = L(0, 0.02); K.box(w, h, 0.03, px, y, pz, 0x3a2a1a, { rot });
  [px, pz] = L(0, 0.035); K.box(w - 0.08, h - 0.08, 0.01, px, y + 0.04, pz, r.pick([0xe8dcc0, 0xd8e0e8, 0xf0e8e0]), { rot });
  // soyut resim / manzara lekeleri
  for (let i = 0; i < 3; i++) { [px, pz] = L(r.float(-w / 4, w / 4), 0.042); K.box(r.float(0.08, w * 0.4), r.float(0.05, h * 0.3), 0.005, px, y + r.float(0.1, h * 0.55), pz, r.pick([0x2a5a8a, 0xc84a2a, 0xe8b02a, 0x3a6a3a, 0x8a2a4a, 0x1a1a1a]), { rot }); }
}

function lamp(K, x, z, y = 0, floor = true) {
  if (floor) { K.cyl(0.16, 0.18, 0.03, x, y, z, 0x2a2a2a, { metal: 0.6 }).cyl(0.015, 0.015, 1.5, x, y, z, 0x8a7a5a, { metal: 0.8 }); K.cyl(0.18, 0.25, 0.3, x, y + 1.45, z, 0xf2e6c8, { emis: 1.2, rough: 1 }); }
  else { K.cyl(0.06, 0.08, 0.22, x, y, z, 0x8a6a4a).cyl(0.1, 0.14, 0.18, x, y + 0.22, z, 0xf2e6c8, { emis: 1.2, rough: 1 }); }
}

export function buildApartment(I, ctx) {
  const g = I.game, r = ctx.rng;
  const W = 13, D = 11, Hh = 3.0;
  const floorWood = r.pick(WOODS);
  I.room(ctx, W, D, Hh, new THREE.MeshStandardMaterial({ map: texRep(woodTexture(floorWood), 3, 3), roughness: 0.6 }), new THREE.MeshStandardMaterial({ map: wallpaperTexture(r.pick(['#e8dcc0', '#d8e0d0', '#e0d0d8', '#f0e8d8', '#e8e4dc']), r.pick(['#d8c8a0', '#c0ccb8', '#d0bcc0', '#e0d4bc'])), roughness: 0.95 }));
  ctx.camMaxY = () => 2.75; // kamera tavanın üstüne çıkmasın
  const K = new Kit(I, ctx);
  const wallC = 0xece6da;
  // bölme duvarları: z=0 (oturma | yatak+mutfak), x=-0.5 (yatak | mutfak); kapı boşlukları
  const wall = (x0, z0, x1, z1) => { const w = Math.abs(x1 - x0) || 0.12, d = Math.abs(z1 - z0) || 0.12; K.box(w, Hh, d, (x0 + x1) / 2, 0, (z0 + z1) / 2, wallC, { col: true, rough: 0.95 }); };
  wall(-6.5, 0, -1.7, 0); wall(-0.5, 0, 1.6, 0); // yatak odası kapısı x∈[-1.7,-0.5]; mutfak girişi x>1.6 açık
  wall(-0.5, -5.5, -0.5, 0);
  K.box(1.2, Hh - 2.1, 0.12, -1.1, 2.1, 0, wallC); // kapı üstü
  // ---------------- oturma odası (ön sol)
  const fab = r.pick(FABRIC), fab2 = r.pick(FABRIC);
  I.carpet(ctx, 3.4, 2.4, -3.3, 2.5, r.int(0, 2));
  const sofaSeats = sofa(K, -3.3, 0.75, 0, fab, 3);
  const arm1 = armchair(K, -5.7, 2.6, Math.PI / 2, fab2), arm2 = armchair(K, -1.0, 2.6, -Math.PI / 2, fab2);
  // sehpa (üst + alt raf) üstünde çaydanlık-bardak, kumanda
  K.box(1.1, 0.04, 0.6, -3.3, 0.42, 2.5, 0x3a2414, { uv: 'wood', rough: 0.35 }).box(1.0, 0.03, 0.5, -3.3, 0.12, 2.5, 0x3a2414);
  for (const [a, b] of [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]]) K.box(0.04, 0.42, 0.04, -3.3 + a, 0, 2.5 + b, 0x2a1a10);
  ctx.cols.add(-3.85, 2.2, -2.75, 2.8, 0, 0.46, 'table');
  K.cyl(0.02, 0.025, 0.07, -3.5, 0.46, 2.45, 0xb83a1a).cyl(0.02, 0.025, 0.07, -3.35, 0.46, 2.6, 0xb83a1a).box(0.05, 0.02, 0.16, -3.0, 0.46, 2.4, 0x111111);
  // TV ünitesi + TV (ön duvar)
  K.box(2.2, 0.48, 0.45, -3.3, 0, 5.2, 0x2a1a10, { col: true, uv: 'wood' }).box(2.1, 0.02, 0.02, -3.3, 0.24, 4.97, 0x8a7a5a, { metal: 0.6 });
  K.box(1.45, 0.84, 0.06, -3.3, 0.62, 5.2, 0x0a0a0a, { rough: 0.2 }).box(0.3, 0.12, 0.2, -3.3, 0.48, 5.2, 0x1a1a1a);
  const tvMat = new THREE.MeshBasicMaterial({ color: 0x4a7ab0 });
  const tv = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.76), tvMat); tv.position.set(-3.3, 1.04, 5.165); tv.rotation.y = Math.PI; ctx.scene.add(tv);
  for (let i = 0; i < 5; i++) K.box(0.05, r.float(0.15, 0.24), 0.16, -4.2 + i * 0.07, 0.48, 5.2, r.pick([0x8a1a1a, 0x1d3d6e, 0xe8dcc0, 0x2d5a2d]));
  K.sphere(0.09, -2.4, 0.57, 5.2, 0x1d4e9e, { sy: 1.4 }); // vazo
  // perdeler (sol duvar penceresi), lambader, çerçeveler, bitki, yan sehpa
  const curtainC = r.pick([0x8a2a2a, 0xc8b48a, 0x2a4a6a, 0x6a5a3a, 0xd8d0c0]);
  curtains(K, -6.5 + 0.02, 2.5, Math.PI / 2, 2.0, 2.6, curtainC);
  lamp(K, -6.0, 4.9); lamp(K, -5.0, 0.4, 0); K.box(0.42, 0.5, 0.42, -5.0, 0, 0.6, 0x3a2414, { col: true, uv: 'wood' }); lamp(K, -5.0, 0.6, 0.5, false);
  frame(K, -3.3, 1.45, 0.06, 0, 1.2, 0.8, r); frame(K, -5.2, 1.5, 0.06, 0, 0.5, 0.65, r); frame(K, -6.45, 1.6, 4.6, Math.PI / 2, 0.6, 0.5, r);
  K.cyl(0.2, 0.16, 0.38, -0.9, 0, 4.9, 0xd8d0c0, { col: true }); for (let i = 0; i < 8; i++) K.sphere(0.2, -0.9 + Math.sin(i * 2.3) * 0.16, 0.55 + i * 0.1, 4.9 + Math.cos(i * 2.3) * 0.16, 0x3a7a32, { rough: 0.9 });
  // ---------------- antre: ayakkabılık + portmanto
  K.box(1.0, 0.95, 0.38, 1.4, 0, 5.28, 0xf2ece0, { col: true }).box(1.02, 0.03, 0.4, 1.4, 0.95, 5.28, 0x8a6a4a);
  K.cyl(0.02, 0.02, 1.8, 2.4, 0, 5.1, 0x3a2a1a, { metal: 0.4 }); K.box(0.3, 0.7, 0.18, 2.4, 0.95, 5.1, 0x2a2a3a, { rough: 1 });
  canvasPlane(ctx.scene, 0.5, 0.8, 1.4, 1.65, 5.47, Math.PI, (c, w, h) => { const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#c8d8e0'); gr.addColorStop(1, '#8aa0aa'); c.fillStyle = gr; c.fillRect(0, 0, w, h); c.strokeStyle = '#8a6a3a'; c.lineWidth = 14; c.strokeRect(0, 0, w, h); });
  // sağ ön: kitaplık + çalışma masası
  K.box(0.35, 2.0, 1.4, 6.3, 0, 3.3, 0x5a3a22, { col: true, uv: 'wood' });
  for (let lv = 0; lv < 5; lv++) for (let k = 0; k < 10; k++) K.box(0.18, r.float(0.18, 0.28), 0.04, 6.25, 0.1 + lv * 0.38, 2.7 + k * 0.12, r.pick([0x8a1a1a, 0x1d3d6e, 0x2d5a2d, 0xe8dcc0, 0x5a2d5a, 0x1a1a1a]));
  K.table(5.7, 1.2, 1.2, 0.6, 0x6a4a2a, { rot: Math.PI / 2 }); K.box(0.4, 0.26, 0.02, 5.75, 0.75, 1.2, 0x1a1a1a, { rot: -Math.PI / 2 });
  const deskSeat = K.chair(5.0, 1.2, Math.PI / 2, 0x2a2a2a, { legs: 0x1a1a1a });
  // ---------------- yatak odası (arka sol)
  const bedSeat = bedDouble(K, -3.4, -4.3, 0, r.pick([0xe8dcc8, 0x8a4a5a, 0x4a5a7a, 0xd8c8a8, 0x6a7a5a]));
  I.carpet(ctx, 2.4, 1.6, -3.4, -2.6, r.int(0, 2));
  for (const sx of [-1, 1]) { const x = -3.4 + sx * 1.15; K.box(0.48, 0.5, 0.4, x, 0, -5.25, 0x5a3a22, { col: true, uv: 'wood' }).box(0.4, 0.02, 0.01, x, 0.3, -5.04, 0x8a7a5a, { metal: 0.6 }); lamp(K, x, -5.25, 0.5, false); }
  K.box(0.62, 2.2, 1.9, -6.15, 0, -2.0, 0xe8e0d0, { col: true }).box(0.01, 2.1, 0.01, -5.83, 0.05, -2.0, 0x8a8a8a);
  for (const zz of [-2.25, -1.75]) K.box(0.03, 0.25, 0.03, -5.82, 1.0, zz, 0x9a8a6a, { metal: 0.8 });
  K.box(1.2, 0.8, 0.45, -1.4, 0, -5.2, 0x5a3a22, { col: true, uv: 'wood' }); canvasPlane(ctx.scene, 0.7, 0.9, -1.4, 1.4, -5.47, 0, (c, w, h) => { c.fillStyle = '#b8ccd4'; c.fillRect(0, 0, w, h); c.strokeStyle = '#d4af37'; c.lineWidth = 10; c.strokeRect(0, 0, w, h); });
  curtains(K, -6.5 + 0.02, -4.2, Math.PI / 2, 1.2, 2.6, curtainC);
  frame(K, -3.4, 1.55, -5.44, 0, 0.9, 0.55, r);
  // ---------------- mutfak (arka sağ)
  const cab = r.pick([0xf2f2f0, 0x9ab0a0, 0xe8dcc0, 0x6a7a8a]), top = 0x4a4a4a;
  K.box(5.0, 0.86, 0.6, 3.6, 0, -5.2, cab, { col: true, rough: 0.4 }).box(5.05, 0.04, 0.64, 3.6, 0.86, -5.18, top, { rough: 0.25 });
  for (let i = 0; i < 8; i++) K.box(0.01, 0.7, 0.01, 1.4 + i * 0.62, 0.08, -4.89, 0x8a8a8a);
  K.box(0.6, 0.02, 0.4, 2.4, 0.9, -5.2, 0x8a9096, { metal: 0.9, rough: 0.2 }).cyl(0.015, 0.015, 0.25, 2.4, 0.9, -5.42, 0xc8c8c8, { metal: 0.9 }); // evye + batarya
  K.box(0.6, 0.02, 0.56, 4.4, 0.9, -5.2, 0x1a1a1a, { rough: 0.2 });
  for (const [a, b] of [[-0.14, -0.12], [0.14, -0.12], [-0.14, 0.12], [0.14, 0.12]]) K.cyl(0.08, 0.08, 0.01, 4.4 + a, 0.92, -5.2 + b, 0x3a3a3a, { metal: 0.6 });
  K.cyl(0.12, 0.14, 0.2, 4.26, 0.93, -5.08, 0xc8c8c8, { metal: 0.9, rough: 0.2 }).cyl(0.08, 0.1, 0.15, 4.26, 1.13, -5.08, 0xc8c8c8, { metal: 0.9, rough: 0.2 }); // çaydanlık
  K.box(0.7, 0.4, 0.5, 4.4, 1.85, -5.25, 0xb8bcc0, { metal: 0.8, rough: 0.3 });
  K.box(5.0, 0.7, 0.35, 3.6, 1.6, -5.32, cab, { rough: 0.4 });
  K.box(0.75, 1.9, 0.7, 6.05, 0, -2.6, 0xd8dcdc, { col: true, metal: 0.3, rough: 0.3 }).box(0.02, 0.5, 0.03, 5.66, 1.0, -2.85, 0x8a8a8a, { metal: 0.8 });
  K.table(2.8, -2.2, 1.3, 0.8, 0x8a6a4a);
  const dining = [K.chair(2.45, -2.82, 0, 0x6a4a2a), K.chair(3.15, -2.82, 0, 0x6a4a2a), K.chair(2.45, -1.58, Math.PI, 0x6a4a2a), K.chair(3.15, -1.58, Math.PI, 0x6a4a2a)];
  K.cyl(0.16, 0.1, 0.07, 2.8, 0.75, -2.2, 0xe8e0d0); for (let i = 0; i < 5; i++) K.sphere(0.045, 2.8 + Math.sin(i * 1.3) * 0.07, 0.83, -2.2 + Math.cos(i * 1.3) * 0.07, [0xd82a1a, 0xf2a01a, 0x5ac83a][i % 3]);
  // tavan lambaları (gömme) + nazar
  for (const [x, z] of [[-3.3, 2.6], [-3.4, -2.6], [3.2, -2.6], [2.5, 3.0]]) K.cyl(0.2, 0.2, 0.03, x, Hh - 0.03, z, 0xfff6e0, { emis: 2 });
  K.finish();
  I.nazar(ctx, 0.9, 2.0, D / 2 - 0.02, Math.PI);
  I.light(ctx, -3.3, 2.6, 2.6, 0xffe2b8, 7, 10); I.light(ctx, -3.4, 2.6, -2.6, 0xffdcb0, 5, 8); I.light(ctx, 3.0, 2.6, -2.2, 0xfff0d8, 6, 9);
  // TV titremesi
  ctx.update = (dt, t) => { const k = 0.5 + 0.5 * Math.sin(t * 7.3) * Math.sin(t * 2.1); tvMat.color.setRGB(0.25 + 0.2 * k, 0.4 + 0.15 * Math.sin(t * 1.7), 0.55 + 0.2 * k); };
  // ---------------- sakinler: ev sahibi kanepede TV izler, ikinci sakin mutfakta
  const nres = r.int(0, 2);
  for (let i = 0; i < nres; i++) {
    if (i === 0) {
      const s = r.pick(sofaSeats);
      const n = I.npc(ctx, 'resident', s.x, s.z, s.heading);
      n.homeOwner = true; n.sitting = true; n.home = new THREE.Vector3(s.x, 0, s.z); s.occupant = n;
    } else {
      const n = I.npc(ctx, 'resident', 3.6, -4.4, Math.PI); void n;
    }
  }
  I.lootSpot(ctx, -5.6, -2.0, 'Gardırobu karıştır');
  if (r.chance(0.5)) I.lootSpot(ctx, -2.25, -4.7, 'Komodini karıştır');
  if (r.chance(0.15)) I.lootSpot(ctx, 5.4, 1.2, 'Çalışma masasının çekmecesini aç');
  void bedSeat; void deskSeat; void dining; void arm1; void arm2; void carpetTexture;
  return { x: 0.2, z: D / 2 - 1.2 };
}

// Güvenli ev: mevcut eşyaya oturma/uzanma yerleri (kanepe -2,-1.6 ; yatak 4.6,-2.8)
export function safehouseSeats(K) {
  for (const lx of [-0.72, 0, 0.72]) K.seat(-2 + lx, -1.45, 0, 'sofa');
  K.seat(4.85, -2.9, Math.PI, 'bed', 0.63, { bedX: 4.6, bedZ: -2.8, bedH: 0 });
}

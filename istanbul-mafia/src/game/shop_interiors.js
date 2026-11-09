// [şehir] Mahalle dükkânlarının iç mekânları: bakkal (eski 'food' dahil), market (süpermarket), kafe.
// Gerçekçi yerleşim: kasa kapı yanında, içecek dolapları duvarda, reyonlar koridor bırakır; ürünler örneklenmiş.
// Oturma yerleri ctx.furnSeats'e yazılır (citylife.js: E ile otur), kasiyer NPC, kasa (life.js soygunu: ctx.register).
import * as THREE from 'three';
import { Kit, canvasPlane, PALETTES } from './interior_kit.js';
import { tileTexture, woodTexture } from '../core/textures.js';
import { randomLook } from '../entities/character.js';
import { Crowd, lookOf } from './crowd.js';

export function texRep(tex, rx, ry) { const t = tex.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return t; }
const M = (o) => new THREE.MeshStandardMaterial(o);

// Bakkal/market/kafe satış listeleri (citylife.js menüsü). heal: küçük can (aç ayı oynamaz)
export const GROCERY = {
  bakkal: [
    { id: 'su', name: 'Su (0,5 L)', price: 10, heal: 6 },
    { id: 'ayran', name: 'Ayran', price: 20, heal: 8 },
    { id: 'gazoz', name: 'Gazoz (Kristal Gazoz)', price: 30, heal: 6 },
    { id: 'simit', name: 'Simit', price: 15, heal: 10 },
    { id: 'cikolata', name: 'Çikolata (Nazlı)', price: 25, heal: 8 },
    { id: 'cips', name: 'Cips (Çıtır Usta)', price: 35, heal: 7 },
    { id: 'biskuvi', name: 'Bisküvi (Kumru)', price: 22, heal: 7 },
    { id: 'tost', name: 'Kaşarlı Tost', price: 60, heal: 18 },
  ],
  market: [
    { id: 'su15', name: 'Su (1,5 L)', price: 15, heal: 8 },
    { id: 'meyvesuyu', name: 'Meyve Suyu (Bahçem)', price: 35, heal: 9 },
    { id: 'sandvic', name: 'Hazır Sandviç', price: 75, heal: 20 },
    { id: 'muz', name: 'Muz (1 kg)', price: 55, heal: 14 },
    { id: 'yogurt', name: 'Yoğurt (Köy Sütü)', price: 40, heal: 10 },
    { id: 'kuruyemis', name: 'Karışık Kuruyemiş', price: 80, heal: 15 },
    { id: 'enerji', name: 'Enerji İçeceği (Şimşek)', price: 45, heal: 6, stamina: true },
    { id: 'ilk', name: 'İlk Yardım Seti', price: 600, heal: 60 },
  ],
  kafe: [
    { id: 'cay', name: 'Çay (ince belli)', price: 15, heal: 5 },
    { id: 'turk', name: 'Türk Kahvesi', price: 55, heal: 7 },
    { id: 'filtre', name: 'Filtre Kahve', price: 70, heal: 7 },
    { id: 'latte', name: 'Sütlü Kahve', price: 85, heal: 8 },
    { id: 'limonata', name: 'Ev Yapımı Limonata', price: 65, heal: 8 },
    { id: 'sufle', name: 'Sufle', price: 110, heal: 15 },
    { id: 'pogaca', name: 'Peynirli Poğaça', price: 30, heal: 10 },
  ],
};

function cashier(I, ctx, x, z, heading, name, gender) {
  const look = { ...randomLook(ctx.rng, 'civilian') };
  if (gender) { look.gender = gender; if (gender === 'f') { look.hair = ctx.rng.pick(['at_kuyrugu', 'topuz', 'uzun']); look.beard = 'none'; } }
  look.apron = true; look.apronColor = ctx.rng.pick(['#c8401a', '#1d5a2d', '#1d3d6e', '#7a1a2a']);
  return I.npc(ctx, 'shopkeeper', x, z, heading, { name, look });
}

// ---------------------------------------------------------------- BAKKAL
export function buildBakkal(I, ctx) {
  const g = I.game, r = ctx.rng;
  const W = 8.4, D = 10;
  I.room(ctx, W, D, 3.0, M({ map: texRep(tileTexture('#d8d2c4', '#c8c0b0', 8), 2.2, 2.6), roughness: 0.6 }), M({ color: 0xece6d6, roughness: 0.95 }), 0xf2f0ea);
  const K = new Kit(I, ctx);
  // fayans lambri (alt duvar)
  K.box(W, 1.1, 0.02, 0, 0, -D / 2 + 0.01, 0xd8e0e0, { rough: 0.3 });
  // arka duvar rafı (tam boy) + sağ duvar rafı
  K.shelf(0.4, -D / 2 + 0.3, 6.4, 0, ['snack', 'clean', 'can', 'snack', 'dairy'], { frame: 0xc8b48a });
  K.shelf(W / 2 - 0.3, -1.8, 4.0, -Math.PI / 2, ['snack', 'can', 'snack', 'clean'], { frame: 0xc8b48a });
  // orta reyon (iki yüzlü)
  K.gondola(-0.7, -1.6, 3.2, Math.PI / 2, ['snack', 'snack', 'can'], ['clean', 'snack', 'dairy'], { cap: 0x2a6a2a });
  // içecek dolapları (sol duvar)
  K.fridge(-W / 2 + 0.4, -3.0, 1.5, Math.PI / 2, ['drink', 'water', 'can', 'drink', 'dairy']);
  K.fridge(-W / 2 + 0.4, -1.4, 1.5, Math.PI / 2, ['water', 'drink', 'dairy', 'water', 'drink'], { trim: 0x1a5ad8 });
  // dondurma sandığı + ekmek dolabı (kapı yanı, solda)
  K.box(1.4, 0.85, 0.7, -W / 2 + 0.85, 0, 1.6, 0xf4f4f4, { col: true, rough: 0.4 }).glass(1.3, 0.04, 0.6, -W / 2 + 0.85, 0.85, 1.6);
  for (let i = 0; i < 18; i++) K.product('box', -W / 2 + 0.3 + (i % 6) * 0.2, 0.62, 1.4 + Math.floor(i / 6) * 0.18, 0, r.pick(['#f2c200', '#c8102e', '#5ab8ff', '#7a3a1a']), 0.16, 0.18, 0.14);
  K.box(0.9, 1.6, 0.45, -W / 2 + 0.6, 0, 3.3, 0x8a5a2a, { col: true, uv: 'wood' });
  K.glass(0.86, 1.1, 0.02, -W / 2 + 0.6, 0.45, 3.53);
  for (let i = 0; i < 9; i++) K.product('bag', -W / 2 + 0.35 + (i % 3) * 0.25, 0.48 + Math.floor(i / 3) * 0.36, 3.3, Math.PI / 2, '#d8a050', 0.12, 0.1, 0.42);
  // kasa tezgâhı (sağ, kapı yanı): müşteri batıdan gelir
  K.box(0.7, 1.0, 2.4, 1.9, 0, 2.3, 0x7a4a24, { col: true, uv: 'wood' }).box(0.78, 0.04, 2.48, 1.9, 1.0, 2.3, 0x3a3a3a, { rough: 0.3 });
  K.box(1.5, 1.0, 0.6, 2.75, 0, 1.0, 0x7a4a24, { col: true, uv: 'wood' }).box(1.58, 0.04, 0.68, 2.75, 1.0, 1.0, 0x3a3a3a);
  K.register(1.9, 1.04, 2.7, -Math.PI / 2);
  // şeker/sakız standı + gazete standı
  K.box(0.5, 0.3, 0.3, 1.75, 1.04, 1.9, 0xc8c8c8, { metal: 0.6 });
  for (let i = 0; i < 12; i++) K.product('box', 1.55 + (i % 4) * 0.1, 1.06 + Math.floor(i / 4) * 0.1, 1.9, -Math.PI / 2, r.pick(PALETTES.snack), 0.07, 0.08, 0.05);
  K.box(0.7, 0.9, 0.5, 1.2, 0, 4.4, 0x2a2a2a, { col: true });
  for (let i = 0; i < 6; i++) K.box(0.6, 0.012, 0.42, 1.2, 0.9 + i * 0.012, 4.4, i % 2 ? 0xe8e4d8 : 0xd8d4c8);
  // kasiyerin arkasında sigara/çerez rafı
  K.box(2.0, 1.2, 0.3, W / 2 - 0.18, 1.0, 2.4, 0x3a2a1a, { rot: -Math.PI / 2 });
  for (let row = 0; row < 4; row++) for (let i = 0; i < 12; i++) K.product('box', W / 2 - 0.3, 1.04 + row * 0.28, 1.5 + i * 0.16, -Math.PI / 2, r.pick(PALETTES.cig), 0.06, 0.09, 0.03);
  // tavan florasanları + ışık
  for (const z of [-3, -0.5, 2]) K.light(2.2, 0.25, 0, 2.99, z);
  K.finish();
  I.light(ctx, 0, 2.6, -2, 0xf4f8ff, 9, 12); I.light(ctx, 0.5, 2.6, 2.4, 0xfff6e8, 6, 9);
  // tabelalar / afiş
  I.sign(ctx, (ctx.building.name || 'BAKKAL').toLocaleUpperCase('tr'), 0, 2.55, -D / 2 + 0.02, 0, '#2a5a1d', '#fff3b0', 3.2);
  canvasPlane(ctx.scene, 0.9, 0.6, -W / 2 + 0.02, 2.0, 0.4, Math.PI / 2, (c, w, h) => { c.fillStyle = '#ffde00'; c.fillRect(0, 0, w, h); c.fillStyle = '#c8102e'; c.font = 'bold 40px Arial'; c.textAlign = 'center'; c.fillText('VERESİYE', w / 2, 70); c.fillStyle = '#1a1a1a'; c.font = 'bold 28px Arial'; c.fillText('YARIN', w / 2, 120); c.fillText('VERİLİR', w / 2, 152); });
  const keeper = cashier(I, ctx, 2.95, 2.3, -Math.PI / 2, ctx.building.type === 'food' ? 'Bakkal Hüsnü' : ctx.rng.pick(['Bakkal Rıza', 'Bakkal Kemal', 'Bakkal Nuri', 'Bakkal Ayten']));
  void keeper;
  ctx.register = { x: 1.25, z: 2.7 };
  ctx.interact.push({ x: 1.2, z: 2.3, r: 1.5, label: 'Kasa: atıştırmalık ve içecek al', action: () => g.cityLife.openGrocery('bakkal') });
  ctx.interact.push({ x: -W / 2 + 1.3, z: -2.2, r: 1.3, label: 'Dolaptan soğuk su al (₺10)', action: () => g.cityLife.quickBuy('su', 'bakkal') });
  ctx.interact.push({ x: -W / 2 + 1.2, z: 3.3, r: 1.1, label: 'Taze ekmek al (₺10)', action: () => g.cityLife.quickBuy({ id: 'ekmek', name: 'Ekmek', price: 10, heal: 6 }) });
  // bir iki müşteri (raflara bakan)
  if (r.chance(0.7)) { const n = I.npc(ctx, 'resident', -2.4, -0.3, -Math.PI / 2 + 0.3); n.browse = true; }
  return { x: 0, z: D / 2 - 1.4 };
}

// ---------------------------------------------------------------- MARKET (süpermarket)
export function buildMarket(I, ctx) {
  const g = I.game, r = ctx.rng;
  const W = 18, D = 16;
  I.room(ctx, W, D, 3.6, M({ map: texRep(tileTexture('#e8e6e0', '#dedbd2', 8), 4, 3.5), roughness: 0.35 }), M({ color: 0xf0f0ec, roughness: 0.9 }), 0xf6f6f2);
  const K = new Kit(I, ctx);
  // arka duvar: soğuk dolaplar (süt ürünleri / içecek)
  for (let i = 0; i < 6; i++) K.fridge(-W / 2 + 1.6 + i * 2.05, -D / 2 + 0.45, 2.0, 0, i < 3 ? ['dairy', 'dairy', 'drink', 'dairy', 'water'] : ['drink', 'can', 'water', 'drink', 'drink'], { trim: i < 3 ? 0x1a5ad8 : 0xc8202a });
  // sol duvar rafı (temizlik), sağ duvar (kuru gıda)
  K.shelf(-W / 2 + 0.3, -1.8, 7.0, Math.PI / 2, ['clean', 'clean', 'snack', 'clean']);
  K.shelf(W / 2 - 0.3, -3.2, 5.0, -Math.PI / 2, ['snack', 'can', 'snack', 'dairy']);
  // reyonlar (4 koridor)
  const famA = [['snack', 'snack', 'can'], ['can', 'snack', 'dairy'], ['clean', 'snack', 'snack'], ['drink', 'water', 'can']];
  const famB = [['dairy', 'snack', 'snack'], ['snack', 'clean', 'can'], ['snack', 'can', 'snack'], ['water', 'drink', 'drink']];
  const aisleX = [-5.6, -2.4, 0.8, 4.0];
  aisleX.forEach((x, i) => K.gondola(x, -2.0, 6.4, Math.PI / 2, famA[i], famB[i], { cap: [0xd8402a, 0x2a6ad8, 0x2a9a3a, 0xe8a01a][i] }));
  // manav (meyve-sebze) bölümü: sağ ön, eğimli kasalar
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
    const x = 5.4 + i * 0.95, z = 2.2 + j * 1.3, col = PALETTES.fruit[(i + j * 4) % PALETTES.fruit.length];
    K.box(0.85, 0.75, 1.0, x, 0, z, 0x7a5a2a, { uv: 'wood', col: true });
    for (let k = 0; k < 20; k++) K.product('fruit', x - 0.32 + (k % 5) * 0.16, 0.8 + Math.floor(k / 10) * 0.07, z - 0.35 + (Math.floor(k / 5) % 2) * 0.35 + r.next() * 0.2, 0, col, 0.1, 0.1, 0.1);
  }
  canvasPlane(ctx.scene, 2.4, 0.6, 6.8, 2.6, 1.4, Math.PI, (c, w, h) => { c.fillStyle = '#2a8a3a'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 48px Arial'; c.textAlign = 'center'; c.fillText('MEYVE · SEBZE', w / 2, h / 2 + 16); });
  // reyon başlıkları (tavana asılı)
  ['ATIŞTIRMALIK', 'KONSERVE · KAHVALTI', 'TEMİZLİK', 'İÇECEK'].forEach((t, i) => I.sign(ctx, t, aisleX[i] + 1.6, 3.0, -2.0, 0, ['#d8402a', '#2a6ad8', '#2a9a3a', '#e8a01a'][i], '#ffffff', 2.4));
  // kasalar: iki şerit, bant + kasiyer; kapı yanında
  const lanes = [-6.0, -2.6];
  lanes.forEach((x, i) => {
    K.box(0.8, 0.9, 3.2, x, 0, 4.4, 0xe8e8e8, { col: true, rough: 0.4 });
    K.box(0.5, 0.02, 2.6, x, 0.9, 4.2, 0x1a1a1a, { rough: 0.9 }); // bant
    K.box(0.7, 0.05, 0.7, x, 0.9, 5.8, 0xa0a0a0, { metal: 0.7 });
    K.register(x + 0.15, 0.92, 3.0, Math.PI / 2);
    K.box(0.3, 1.6, 0.3, x - 0.55, 0, 2.7, 0xc8c8c8, { metal: 0.6 }); // şerit numarası direği
    K.emis(0.36, 0.3, 0.32, x - 0.55, 1.6, 2.7, i ? 0x40ff90 : 0x40ff90);
    // kasa önü atıştırmalık standı
    K.box(0.4, 1.2, 0.8, x - 0.65, 0, 4.6, 0x3a3a3a);
    for (let k = 0; k < 15; k++) K.product('box', x - 0.62, 0.15 + Math.floor(k / 5) * 0.35, 4.3 + (k % 5) * 0.14, Math.PI / 2, r.pick(PALETTES.snack), 0.06, 0.16, 0.12);
    cashier(I, ctx, x + 0.75, 3.2, -Math.PI / 2, 'Kasiyer', i === 0 ? 'f' : null);
  });
  // alışveriş sepeti yığını + arabalar
  for (let i = 0; i < 6; i++) K.box(0.5, 0.06, 0.34, 1.8, 0.05 + i * 0.07, 6.6, 0xc8102e);
  for (let i = 0; i < 3; i++) { const x = 3.0 + i * 0.25; K.box(0.55, 0.45, 0.85, x, 0.45, 6.5, 0x9aa0a8, { metal: 0.8, rough: 0.4 }); K.box(0.04, 0.4, 0.04, x, 0, 6.2, 0x555555); }
  ctx.cols.add(1.5, 6.2, 3.9, 7.0, 0, 1.0, 'furn');
  // tavan ışık panelleri (ızgara)
  for (let x = -6; x <= 6; x += 4) for (let z = -5; z <= 5; z += 3.5) K.light(1.2, 0.6, x, 3.59, z);
  K.finish();
  I.light(ctx, -3, 3.2, -3, 0xf4f8ff, 14, 16); I.light(ctx, 3, 3.2, 2, 0xf4f8ff, 12, 16); I.light(ctx, -4, 3.2, 4.5, 0xfff8ee, 8, 10);
  I.sign(ctx, (ctx.building.name || 'MARKET').toLocaleUpperCase('tr'), 0, 3.05, -D / 2 + 0.02, 0, '#c8401a', '#ffffff', 4.5);
  canvasPlane(ctx.scene, 2.0, 1.0, W / 2 - 0.02, 2.2, 1.8, -Math.PI / 2, (c, w, h) => { c.fillStyle = '#ffde00'; c.fillRect(0, 0, w, h); c.fillStyle = '#c8102e'; c.font = 'bold 56px Arial'; c.textAlign = 'center'; c.fillText('HAFTANIN', w / 2, 60); c.fillText('FIRSATI', w / 2, 116); c.fillStyle = '#1a1a1a'; c.font = 'bold 30px Arial'; c.fillText('2 al 1 öde · Bahçem meyve suyu', w / 2, 168); }, 384);
  ctx.register = { x: lanes[0] - 0.6, z: 3.4 };
  lanes.forEach((x, i) => ctx.interact.push({ x: x - 0.75, z: 3.6, r: 1.4, label: `Kasa ${i + 1}: ödeme yap (market alışverişi)`, action: () => g.cityLife.openGrocery('market') }));
  ctx.interact.push({ x: -W / 2 + 3, z: -D / 2 + 1.5, r: 1.6, label: 'Dolaptan soğuk içecek al (₺15)', action: () => g.cityLife.quickBuy('su15', 'market') });
  ctx.interact.push({ x: 6.8, z: 1.4, r: 1.6, label: 'Manavdan muz al (₺55)', action: () => g.cityLife.quickBuy('muz', 'market') });
  // müşteriler: reyonlarda dolaşan + kasa sırasında bekleyen hafif kalabalık (citylife crowd)
  marketLife(g, ctx, aisleX.map((x) => x + 1.6), lanes.map((x) => x - 0.75));
  return { x: 0, z: D / 2 - 1.4 };
}

// ---------------------------------------------------------------- KAFE (iç salon)
export function buildKafe(I, ctx) {
  const g = I.game, r = ctx.rng;
  const W = 12, D = 10;
  I.room(ctx, W, D, 3.2, M({ map: texRep(woodTexture('#8a5a36'), 3, 3), roughness: 0.55 }), M({ color: 0xe8dcc8, roughness: 0.95 }), 0xf0e8dc);
  const K = new Kit(I, ctx);
  // tuğla vurgu duvarı (arka) + ahşap lambri
  canvasPlane(ctx.scene, W, 3.2, 0, 1.6, -D / 2 + 0.02, 0, (c, w, h) => { c.fillStyle = '#8a4a32'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? -16 : 0; x < w; x += 32) { c.fillStyle = ['#9a5238', '#8a4630', '#a25a3e', '#7e422c'][(x * 7 + y * 3) & 3]; c.fillRect(x + 1, y + 1, 30, 14); } }, 512);
  for (const sx of [-1, 1]) K.box(0.04, 1.0, D, sx * (W / 2 - 0.02), 0, 0, 0x5a3a20, { uv: 'wood' });
  // bar tezgâhı (arka sol): kahve makinesi, değirmen, pasta vitrini
  K.box(4.6, 1.05, 0.7, -2.2, 0, -2.9, 0x3a2414, { col: true, uv: 'wood' }).box(4.7, 0.05, 0.8, -2.2, 1.05, -2.9, 0xd8d0c0, { rough: 0.2 });
  K.box(0.7, 0.45, 0.45, -3.2, 1.1, -3.0, 0xc8c8c8, { metal: 0.9, rough: 0.2 }).box(0.66, 0.06, 0.06, -3.2, 1.38, -2.76, 0x1a1a1a);
  K.cyl(0.08, 0.1, 0.35, -2.3, 1.1, -3.05, 0x1a1a1a, { metal: 0.6 });
  K.glass(1.4, 0.45, 0.6, -0.8, 1.1, -2.9);
  for (let i = 0; i < 8; i++) K.cyl(0.11, 0.11, 0.07, -1.3 + (i % 4) * 0.33, 1.13 + Math.floor(i / 4) * 0.2, -2.9, ['#f2e0c0', '#5a2a1a', '#e8b0b0', '#c89060'][i % 4], { seg: 12 });
  K.box(1.3, 0.03, 0.55, -0.8, 1.32, -2.9, 0xffffff);
  K.register(0.2, 1.1, -2.9, Math.PI);
  // arka raf: fincanlar + çekirdek kavanozları
  for (let k = 0; k < 2; k++) {
    K.box(3.8, 0.04, 0.3, -2.2, 1.6 + k * 0.5, -D / 2 + 0.17, 0x5a3a20, { uv: 'wood' });
    for (let i = 0; i < 12; i++) K.cyl(0.05, 0.04, 0.09, -3.9 + i * 0.3, 1.64 + k * 0.5, -D / 2 + 0.17, k ? '#ffffff' : ['#3a2414', '#5a3a1a', '#7a5a2a'][i % 3], { seg: 8 });
  }
  // menü panosu (kara tahta)
  canvasPlane(ctx.scene, 2.2, 1.2, 2.4, 2.1, -D / 2 + 0.03, 0, (c, w, h) => {
    c.fillStyle = '#1e2420'; c.fillRect(0, 0, w, h); c.strokeStyle = '#8a6a3a'; c.lineWidth = 10; c.strokeRect(0, 0, w, h);
    c.fillStyle = '#f0ece0'; c.font = 'bold 34px Georgia'; c.textAlign = 'center'; c.fillText((ctx.building.name || 'KAFE').toLocaleUpperCase('tr'), w / 2, 46);
    c.font = '24px Georgia'; c.textAlign = 'left';
    GROCERY.kafe.slice(0, 6).forEach((it, i) => { c.fillText(it.name, 24, 92 + i * 30); c.textAlign = 'right'; c.fillText('₺' + it.price, w - 24, 92 + i * 30); c.textAlign = 'left'; });
  }, 384);
  // masalar: iki kişilik yuvarlak + dört kişilik, cam vitrin önünde bar tabureleri
  const sitters = [];
  const two = [[2.0, -1.2], [4.2, -1.2], [2.0, 1.4], [4.2, 1.4], [-3.8, 1.2]];
  two.forEach(([x, z]) => {
    K.table(x, z, 0.7, 0.7, 0x3a2a1a, { round: true, leg: 0x1a1a1a });
    const a = K.chair(x - 0.62, z, Math.PI / 2, 0x6a4a2a, { legs: 0x1a1a1a });
    const b = K.chair(x + 0.62, z, -Math.PI / 2, 0x6a4a2a, { legs: 0x1a1a1a });
    sitters.push([a, b, x, z]);
  });
  // dört kişilik
  K.table(-1.4, 1.6, 1.4, 0.8, 0x5a3a20);
  const four = [K.chair(-1.75, 0.95, 0, 0x2a3a2a), K.chair(-1.05, 0.95, 0, 0x2a3a2a), K.chair(-1.75, 2.25, Math.PI, 0x2a3a2a), K.chair(-1.05, 2.25, Math.PI, 0x2a3a2a)];
  // köşe koltuk (kanepe) + bitkiler
  K.box(2.4, 0.42, 0.8, -W / 2 + 1.4, 0, 3.9, 0x5a2a2a, { col: true }).box(2.4, 0.5, 0.2, -W / 2 + 1.4, 0.42, 4.3, 0x5a2a2a);
  const sofaSeats = [K.seat(-W / 2 + 0.9, 3.85, Math.PI, 'sofa'), K.seat(-W / 2 + 1.9, 3.85, Math.PI, 'sofa')];
  K.table(-W / 2 + 1.4, 3.0, 0.9, 0.5, 0x3a2414, { h: 0.45 });
  for (const [x, z] of [[W / 2 - 0.5, -D / 2 + 0.5], [W / 2 - 0.5, D / 2 - 0.6], [-W / 2 + 0.5, -0.4]]) {
    K.cyl(0.25, 0.2, 0.5, x, 0, z, 0xb8603a, { col: true });
    for (let i = 0; i < 7; i++) K.sphere(0.22, x + Math.sin(i * 2.4) * 0.15, 0.7 + i * 0.12, z + Math.cos(i * 2.4) * 0.15, 0x2f6a2a, { rough: 0.9 });
  }
  // sarkıt lambalar
  const lamps = [[2.0, -1.2], [4.2, -1.2], [2.0, 1.4], [4.2, 1.4], [-1.4, 1.6], [-2.2, -2.9]];
  for (const [x, z] of lamps) { K.cyl(0.18, 0.05, 0.22, x, 2.3, z, 0x1a1a1a, { metal: 0.6 }); K.cyl(0.006, 0.006, 0.7, x, 2.5, z, 0x111111); K.emis(0.12, 0.08, 0.12, x, 2.24, z, 0xffd890); }
  K.finish();
  I.light(ctx, 2.8, 2.4, 0, 0xffd8a0, 8, 9); I.light(ctx, -2, 2.4, -1.5, 0xffd8a0, 7, 9); I.light(ctx, -3, 2.4, 2.8, 0xffcf90, 5, 7);
  // oturanlar: karışık çiftler, arkadaşlar, tek başına kitap okuyan
  const kinds = ['mf', 'mm', 'ff', 'single', 'mf'];
  sitters.forEach(([a, b], i) => { if (r.chance(0.8)) g.cityLife.seatGroup(ctx, [a, b], kinds[i % kinds.length]); });
  if (r.chance(0.7)) g.cityLife.seatGroup(ctx, four.slice(0, 3), 'ff');
  if (r.chance(0.5)) g.cityLife.seatGroup(ctx, [sofaSeats[0]], 'single');
  cashier(I, ctx, -2.2, -3.65, 0, ctx.rng.pick(['Barista Ece', 'Barista Can', 'Barista Deniz']), null);
  ctx.register = { x: 0.2, z: -2.2 };
  ctx.interact.push({ x: -1.6, z: -2.1, r: 1.6, label: 'Sipariş ver: çay, kahve, tatlı', action: () => g.cityLife.openGrocery('kafe') });
  return { x: 0, z: D / 2 - 1.4 };
}

// ---------------------------------------------------------------- Silahçı: görsel iyileştirme
export function decorateGunShop(I, ctx) {
  const K = new Kit(I, ctx), r = ctx.rng, W = 14, D = 11;
  // koyu ahşap lambri + tuğla üst duvar (arka) + kauçuk paspas
  for (const [w, x, z, rot] of [[W, 0, -D / 2 + 0.03, 0], [D, -W / 2 + 0.03, 0, Math.PI / 2], [D, W / 2 - 0.03, 0, Math.PI / 2]]) K.box(w, 0.9, 0.04, x, 0, z, 0x3a2414, { rot, uv: 'wood' });
  K.box(2.4, 0.01, 1.4, 0, 0, D / 2 - 1.0, 0x1a1a1a, { rough: 1 });
  // cephane kutuları rafta (örneklenmiş), sandıklar, tabure, güvenlik kamerası
  for (let row = 0; row < 3; row++) for (let i = 0; i < 10; i++) K.product('box', -6.6 + i * 0.12, 1.25 + row * 0.02, 3.8 + row * 0.14, Math.PI / 2, r.pick(['#3a4a26', '#8a6a2a', '#7a2a1a', '#2a2a2a']), 0.1, 0.07, 0.13);
  K.box(0.8, 0.04, 1.6, -6.6, 1.2, 4.0, 0x4a2c16, { uv: 'wood' });
  for (let i = 0; i < 3; i++) K.box(0.9, 0.5, 0.55, 3.8 + i * 0.95, 0, 4.9, 0x3a4a26, { col: true });
  K.cyl(0.2, 0.18, 0.04, -2.6, 0.68, -1.85, 0x1a1a1a).cyl(0.03, 0.03, 0.66, -2.6, 0, -1.85, 0x555555, { metal: 0.8 });
  K.box(0.18, 0.12, 0.25, W / 2 - 0.3, 3.0, D / 2 - 0.4, 0xe8e8e8).emis(0.03, 0.03, 0.03, W / 2 - 0.35, 3.04, D / 2 - 0.55, 0xff2020);
  // vitrin üstü spot raylar
  for (const z of [-1.0, -D / 2 + 0.8]) { K.box(8, 0.05, 0.05, -1.2, 3.3, z, 0x111111, { metal: 0.6 }); for (let i = 0; i < 6; i++) K.cyl(0.05, 0.07, 0.14, -4.6 + i * 1.35, 3.16, z, 0x1a1a1a).emis(0.08, 0.01, 0.08, -4.6 + i * 1.35, 3.155, z, 0xfff0d0); }
  K.finish();
  // afişler (kurgusal)
  canvasPlane(ctx.scene, 1.1, 1.5, W / 2 - 0.02, 1.8, -2.0, -Math.PI / 2, (c, w, h) => { c.fillStyle = '#e8dcc0'; c.fillRect(0, 0, w, h); c.fillStyle = '#8a1a10'; c.font = 'bold 30px Georgia'; c.textAlign = 'center'; c.fillText('KARTAL AV', w / 2, 50); c.fillText('MALZEMELERİ', w / 2, 84); c.strokeStyle = '#1a1a1a'; c.lineWidth = 6; c.beginPath(); c.arc(w / 2, 190, 60, 0, 6.3); c.stroke(); c.beginPath(); c.moveTo(w / 2 - 80, 190); c.lineTo(w / 2 + 80, 190); c.moveTo(w / 2, 110); c.lineTo(w / 2, 270); c.stroke(); c.fillStyle = '#1a1a1a'; c.font = '20px Arial'; c.fillText('Ruhsatsız satış yapılmaz.', w / 2, 320); });
  canvasPlane(ctx.scene, 1.6, 0.5, 1.6, 2.6, -1.62, 0, (c, w, h) => { c.fillStyle = '#1a1a1a'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffcc00'; c.font = 'bold 34px Arial'; c.textAlign = 'center'; c.fillText('VERESİYE YOKTUR', w / 2, h / 2 + 12); });
}

// Market müşterileri: koridorlarda raflara bakar, sepetle kasa sırasına girer, ödeyip çıkar; yerine yenisi gelir
// (crowd.js: hafif ajanlar, yalnızca oyuncu içerideyken güncellenir)
function marketLife(g, ctx, aisles, lanesX) {
  const r = ctx.rng, C = new Crowd(g, ctx.scene, { max: 9 });
  const Q = lanesX.map((x) => ({ x, q: [], payT: 0, served: 0 }));
  const slot = (L, i) => ({ x: L.x, z: 3.2 - i * 0.8 });
  const browse = (a) => { const x = r.pick(aisles), z = r.float(-4.6, 0.4); C.go(a, [{ x: a.x, y: 0, z: Math.min(a.z, 1.4) }, { x, y: 0, z: 1.4 }, { x, y: 0, z }], 'idle', 4 + r.next() * 7); a.faceAfter = r.chance(0.5) ? Math.PI / 2 : -Math.PI / 2; a.n = (a.n || 0) + 1; };
  const join = (a) => { const L = Q.reduce((p, c) => (c.q.length < p.q.length ? c : p)); const s = slot(L, L.q.length); L.q.push(a); a.queue = L; C.go(a, [{ x: a.x, y: 0, z: 1.4 }, { x: L.x, y: 0, z: Math.min(1.4, s.z) }, { x: s.x, y: 0, z: s.z }], 'queue', 0); a.faceAfter = 0; };
  const dir = (a) => { if (a.role === 'staff') { a.t = 1e9; return; } if ((a.n || 0) >= 2 && !a.queue) join(a); else browse(a); };
  for (let i = 0; i < 6; i++) { const a = C.spawn(r.pick(aisles), 0, r.float(-4.5, 0.3), Math.PI / 2, lookOf(r), { state: 'idle', t: r.next() * 5 }); if (a) a.n = r.int(0, 2); }
  for (const L of Q) for (let i = 0; i < 1 + (L.x > -5 ? 1 : 0); i++) { const s = slot(L, L.q.length), a = C.spawn(s.x, 0, s.z, 0, lookOf(r), { state: 'queue' }); if (a) { a.faceH = 0; L.q.push(a); a.queue = L; } }
  ctx.marketLife = { crowd: C, lanes: Q };
  const prev = ctx.update;
  ctx.update = (dt, t) => {
    if (prev) prev(dt, t);
    const p = g.player;
    for (const L of Q) {
      const h = L.q[0]; if (!h || h.state !== 'queue') continue;
      L.payT += dt; h.faceH = Math.PI / 2; h.talk = L.payT > 1 && L.payT < 3;
      if (L.payT < 4 + (h.id % 3)) continue;
      L.payT = 0; L.served++; L.q.shift(); h.queue = null; h.talk = false; h.leaving = true;
      C.go(h, [{ x: L.x, y: 0, z: 6.4 }, { x: 0, y: 0, z: 7.4 }], 'idle', 0);
      h.onArrive = (b) => C.remove(b); // kapıdan çıktı
      L.q.forEach((a, i) => { const s = slot(L, i); if (a.state === 'queue') { C.go(a, [{ x: s.x, y: 0, z: s.z }], 'queue', 0); a.faceAfter = 0; } });
    }
    // yeni müşteri kapıdan girer
    if (C.agents.length < 7 && Math.random() < dt * 0.25) { const a = C.spawn(0, 0, 7.2, Math.PI, lookOf(r), { state: 'idle', t: 0.1 }); if (a) a.n = 0; }
    C.update(dt, g.camera, dir);
    void p;
  };
  ctx.onExit = () => C.clear();
  // silah sesi: sıralar dağılır, herkes kapıya koşar
  ctx.onNoise = (x, z, radius) => { if (radius < 8) return; for (const L of Q) L.q.length = 0; C.panic(x, z, (a) => [{ x: a.x, y: 0, z: 1.4 }, { x: 0, y: 0, z: 1.6 }, { x: 0, y: 0, z: 7.6 }]); };
}

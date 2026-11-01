// Prosedürel insan modeli (SkinnedMesh) + katmanlı prosedürel animasyon.
// Model: kişi başına TEK SkinnedMesh (vücut + kıyafet + saç tek geometri, tek malzeme -> tek draw call), kendi iskeleti.
//   Geometri görünüş anahtarı + LOD (0 yakın / 1 orta / 2 uzak) başına önbellekte; LOD kameraya uzaklığa göre seçilir.
// Animasyon: poz kanalları (eklem başına x/y/z), ağırlıklı katmanlar, hız güdümlü yürüme/koşu döngüsü
//   (adım uzunluğu hızdan türetilir -> ayak kayması yok; duruş fazında ayak yere kilitli, bacaklar analitik IK ile çözülür),
//   kalça salınımı/dönüşü, ters dönen omuzlar, faza bağlı kol salınımı, baş sabitleme, dönüşe yatma, başlama/durma eğimi,
//   boşta varyasyonları, NPC davranışları (konuşma, telefon, sigara, oturma, sinme, eller yukarı), silah IK, yakın dövüş,
//   vuruş tepkisi, yönlü ölüm düşüşü ve yere yerleşme (kemik bazlı kısıt gevşetme).
import * as THREE from 'three';
import { buildWeaponModel, WEAPONS } from '../game/weapons.js';
import { BONES, BI, BONE_PARENT, RIG, rigFor, buildCharGeometry, lookKey } from './charParts.js';
import { charMaterial, charDepthMaterial } from './charTex.js';

export const SKIN_TONES = ['#f1d0b5', '#e0b493', '#c99572', '#a8754f', '#7d5236', '#5a3a26'];
export const HAIR_COLORS = ['#1a1410', '#3b2a1e', '#6b4a2e', '#a07040', '#d8b070', '#8a8a8a', '#5a1a10'];
// karakter yaratıcısının eski listesi (geri uyum); tüm stiller HAIR_STYLES_ALL'da
export const HAIR_STYLES = ['kisa', 'arkaya', 'kel', 'uzun', 'kivircik', 'at_kuyrugu'];
export const HAIR_STYLES_ALL = ['kisa', 'arkaya', 'yan_ayrik', 'asker', 'kel', 'kivircik', 'uzun', 'dalgali', 'kare', 'at_kuyrugu', 'topuz'];
export const HAIR_STYLE_NAMES = { kisa: 'Kısa', arkaya: 'Arkaya', yan_ayrik: 'Yandan ayrık', asker: 'Asker tıraşı', kel: 'Kel', kivircik: 'Kıvırcık', uzun: 'Uzun', dalgali: 'Dalgalı', kare: 'Kâküllü kare', at_kuyrugu: 'At kuyruğu', topuz: 'Topuz' };
export const BEARDS = ['none', 'stubble', 'mustache', 'full'];
export const BEARDS_ALL = ['none', 'stubble', 'mustache', 'keci', 'full'];
export const BEARD_NAMES = { none: 'Yok', stubble: 'Kirli', mustache: 'Bıyık', keci: 'Keçi sakalı', full: 'Gür' };
const EYE_COLORS = ['#3b2414', '#5a3a1c', '#2e4a2a', '#3a5a7a', '#6a5030'];

export function defaultLook(gender = 'm') {
  return {
    gender, skin: SKIN_TONES[1], hair: gender === 'f' ? 'uzun' : 'kisa', hairColor: HAIR_COLORS[0], beard: gender === 'f' ? 'none' : 'stubble',
    top: 'leather', topColor: '#1c1c1c', shirtColor: '#e8e8e8', pants: 'jeans', pantsColor: '#2a3550', shoes: 'sneaker', shoesColor: '#eeeeee',
    hat: 'none', hatColor: '#222222', glasses: false, chain: false, tespih: false, build: 1.0, eyeColor: EYE_COLORS[1],
    height: 1, shoulders: 1, fat: 0, age: 0,
  };
}

// ---------------- NPC arketipleri (sivil çeşitliliği) ----------------
const COL = {
  dark: ['#1a1a1a', '#2a2a2a', '#222833', '#2b2420'], earth: ['#5a4a3a', '#6a5a4a', '#4a3a2a', '#7a6a50', '#8a7a6a'], bright: ['#8a1a1a', '#1d3d6e', '#2d5a2d', '#b05a1a', '#5a2d5a', '#c9a020', '#2a7a8a', '#c84a6a'],
  pastel: ['#e0e0e0', '#c9b48a', '#a8c8e8', '#e8c8c8', '#c8e0c0', '#e8dcc0'], denim: ['#2a3550', '#3a4a6a', '#1e2a40', '#5a6a8a'], scarf: ['#6a1a2a', '#1a3a5a', '#3a5a3a', '#7a5a3a', '#4a2a5a', '#b08a6a', '#c86a5a', '#2a2a2a', '#8a8aa0'],
};
const pick = (r, a) => a[Math.floor(r.next() * a.length)];
const ARCHETYPES = [
  ['ogrenci_e', 'm', (r, L) => Object.assign(L, { age: 0, top: pick(r, ['hoodie', 'track', 'tshirt']), topStyle: null, topColor: pick(r, COL.bright.concat(COL.dark)), pants: 'jeans', pantsColor: pick(r, COL.denim), shoes: 'sneaker', shoesColor: pick(r, ['#eeeeee', '#1a1a1a', '#8a1a1a']), bag: 'bag1', bagColor: pick(r, COL.dark.concat(COL.bright)), hair: pick(r, ['kisa', 'yan_ayrik', 'kivircik', 'kisa']), beard: pick(r, ['none', 'stubble', 'none']), height: r.float(0.96, 1.06), build: r.float(0.86, 1.02) })],
  ['ogrenci_k', 'f', (r, L) => Object.assign(L, { age: 0, top: pick(r, ['hoodie', 'tshirt', 'sweater']), topColor: pick(r, COL.pastel.concat(COL.bright)), pants: pick(r, ['jeans', 'skirt', 'jeans']), pantsColor: pick(r, COL.denim.concat(COL.dark)), shoes: 'sneaker', shoesColor: '#eeeeee', bag: 'bag1', bagColor: pick(r, COL.bright), hair: pick(r, ['at_kuyrugu', 'uzun', 'kare', 'dalgali']), glasses: r.chance(0.25), glassesStyle: 'readers' })],
  ['is_adami', 'm', (r, L) => Object.assign(L, { age: r.float(0.1, 0.5), top: 'suit', topColor: pick(r, ['#1d2440', '#222222', '#3a3a3a', '#2a2a3a']), shirtColor: pick(r, ['#f0f0f0', '#a8c8e8', '#e8e8f0']), tieColor: pick(r, ['#7a0f14', '#1d2a5a', '#3a3a3a', '#5a3a1a']), pants: 'slacks', pantsColor: null, shoes: 'polished', shoesColor: '#0a0a0a', carry: r.chance(0.6) ? 'briefcase' : null, hair: pick(r, ['arkaya', 'yan_ayrik', 'kisa', 'kel']), beard: pick(r, ['none', 'stubble', 'mustache']), glasses: r.chance(0.3), glassesStyle: 'readers' })],
  ['is_kadini', 'f', (r, L) => Object.assign(L, { age: r.float(0.1, 0.4), top: 'blazer', topStyle: 'blazer', topColor: pick(r, ['#1d2440', '#2a2a2a', '#6a2a2a', '#e8e0d0']), shirtColor: '#f0f0f0', pants: pick(r, ['skirt', 'slacks']), pantsColor: pick(r, COL.dark), shoes: 'polished', shoesColor: '#111111', hair: pick(r, ['kare', 'topuz', 'uzun']), makeup: true, carry: r.chance(0.3) ? 'briefcase' : null })],
  ['yasli_e', 'm', (r, L) => Object.assign(L, { age: r.float(0.8, 1), top: pick(r, ['blazer', 'coat', 'sweater', 'vest']), topStyle: null, topColor: pick(r, COL.earth.concat(['#3a3a3a'])), shirtColor: pick(r, ['#e8e8e8', '#d8d0c0']), pants: 'slacks', pantsColor: pick(r, COL.earth.concat(COL.dark)), shoes: 'polished', shoesColor: '#2a1a10', hat: r.chance(0.75) ? 'kasket' : 'none', hatColor: pick(r, ['#3a3a3a', '#5a4a3a', '#2a2a2a']), hairColor: pick(r, ['#8a8a8a', '#aaaaaa', '#cccccc']), hair: pick(r, ['kel', 'kisa', 'arkaya']), beard: pick(r, ['mustache', 'mustache', 'full', 'stubble']), tespih: r.chance(0.4), glasses: r.chance(0.3), glassesStyle: 'readers', build: r.float(0.95, 1.15), fat: r.float(0, 0.6) })],
  ['yasli_k', 'f', (r, L) => Object.assign(L, { age: r.float(0.75, 1), top: 'pardesu', topColor: pick(r, ['#3a3a4a', '#5a4a3a', '#2a3a2a', '#6a6a7a', '#4a2a2a']), pants: 'longskirt', pantsColor: pick(r, COL.dark), shoes: 'loafer', shoesColor: '#1a1a1a', hat: 'basortusu', hatColor: pick(r, COL.scarf), fat: r.float(0.2, 0.8), build: r.float(1, 1.15) })],
  ['basortulu', 'f', (r, L) => Object.assign(L, { age: r.float(0, 0.5), top: pick(r, ['pardesu', 'coat', 'sweater']), topColor: pick(r, COL.earth.concat(['#2a2a3a', '#5a2a3a', '#c8b8a0'])), pants: pick(r, ['longskirt', 'jeans', 'slacks']), pantsColor: pick(r, COL.dark.concat(COL.denim)), shoes: pick(r, ['loafer', 'sneaker', 'boots']), shoesColor: pick(r, ['#1a1a1a', '#eeeeee', '#3a2412']), hat: 'basortusu', hatColor: pick(r, COL.scarf), bag: r.chance(0.2) ? 'duffel' : null })],
  ['turist_e', 'm', (r, L) => Object.assign(L, { skin: pick(r, ['#f1d0b5', '#e0b493', '#f1d0b5', '#7d5236']), top: pick(r, ['tshirt', 'polo']), topStyle: null, topColor: pick(r, COL.pastel.concat(COL.bright)), pants: 'shorts', pantsColor: pick(r, ['#c9b48a', '#6a6a5a', '#2a3550']), shoes: 'sneaker', shoesColor: '#eeeeee', hat: pick(r, ['cap', 'panama', 'none']), hatColor: pick(r, ['#e8e8e8', '#1d3d6e', '#e8dcc0']), bag: 'bag1', bagColor: pick(r, COL.dark), camera: r.chance(0.6), glasses: r.chance(0.5), hairColor: pick(r, ['#d8b070', '#a07040', '#6b4a2e']) })],
  ['turist_k', 'f', (r, L) => Object.assign(L, { skin: pick(r, ['#f1d0b5', '#e0b493', '#f1d0b5']), top: pick(r, ['tshirt', 'polo']), topColor: pick(r, COL.pastel), pants: pick(r, ['shorts', 'skirt']), pantsColor: pick(r, ['#c9b48a', '#e8e8e8', '#2a3550']), shoes: 'sneaker', shoesColor: '#eeeeee', hat: pick(r, ['panama', 'cap', 'none']), hatColor: '#e8dcc0', bag: 'bag1', bagColor: pick(r, COL.bright), camera: r.chance(0.4), glasses: r.chance(0.6), hair: pick(r, ['at_kuyrugu', 'uzun', 'dalgali']), hairColor: pick(r, ['#d8b070', '#a07040', '#5a1a10']) })],
  ['simitci', 'm', (r, L) => Object.assign(L, { age: r.float(0.3, 0.8), top: 'shirt', topColor: pick(r, ['#e8e8e8', '#c8c0b0']), pants: 'slacks', pantsColor: pick(r, COL.earth), shoes: 'polished', shoesColor: '#2a1a10', apron: true, apronColor: pick(r, ['#f0ece0', '#e8e0d0', '#3a3a3a']), hat: r.chance(0.6) ? 'kasket' : 'none', hatColor: '#3a3a3a', beard: 'mustache' })],
  ['balikci', 'm', (r, L) => Object.assign(L, { age: r.float(0.45, 0.95), top: 'vest', topColor: pick(r, ['#3a4a2a', '#2a3a4a', '#4a3a2a', '#6a5a2a']), shirtColor: pick(r, ['#5a6a7a', '#8a7a6a', '#3a4a5a']), pants: pick(r, ['cargo', 'slacks']), pantsColor: pick(r, COL.earth.concat(COL.dark)), shoes: 'wellies', shoesColor: pick(r, ['#2a3a2a', '#1a1a1a', '#5a3a1a']), hat: pick(r, ['bere', 'kasket', 'none']), hatColor: pick(r, ['#1a2a4a', '#3a3a3a', '#5a1a1a']), beard: pick(r, ['full', 'stubble', 'mustache']), hairColor: pick(r, ['#8a8a8a', '#3b2a1e', '#aaaaaa']), fat: r.float(0, 0.5) })],
  ['esnaf', 'm', (r, L) => Object.assign(L, { age: r.float(0.3, 0.7), top: pick(r, ['shirt', 'sweater', 'vest']), topColor: pick(r, COL.earth.concat(COL.pastel)), shirtColor: '#e8e8e8', pants: 'slacks', pantsColor: pick(r, COL.dark), shoes: 'polished', shoesColor: '#1a1008', beard: pick(r, ['mustache', 'stubble']), fat: r.float(0.2, 0.9), tespih: r.chance(0.3) })],
  ['isci', 'm', (r, L) => Object.assign(L, { top: pick(r, ['track', 'denim', 'tshirt']), topColor: pick(r, COL.dark.concat(COL.earth)), pants: 'cargo', pantsColor: pick(r, COL.earth), shoes: 'boots', shoesColor: '#3a2412', hat: pick(r, ['bere', 'cap', 'none']), hatColor: '#2a2a2a', beard: pick(r, ['stubble', 'full', 'mustache']), build: r.float(1.0, 1.2) })],
  ['sporcu', 'x', (r, L) => Object.assign(L, { top: 'track', topColor: pick(r, COL.bright.concat(COL.dark)), pants: 'track', pantsColor: pick(r, COL.dark.concat(COL.bright)), shoes: 'sneaker', shoesColor: pick(r, ['#eeeeee', '#c81010', '#1a1a1a']), hair: L.gender === 'f' ? 'at_kuyrugu' : pick(r, ['kisa', 'asker']), build: r.float(0.92, 1.08), watch: 'digital' })],
  ['genc_sik', 'm', (r, L) => Object.assign(L, { age: 0, top: 'leather', topColor: pick(r, ['#1c1c1c', '#4a2c1a', '#5a1a1a']), shirtColor: pick(r, ['#e8e8e8', '#1a1a1a']), pants: 'jeans', pantsColor: pick(r, ['#1a1a1a', '#2a3550']), shoes: 'boots', shoesColor: '#1a1a1a', glasses: r.chance(0.5), glassesStyle: pick(r, ['glasses', 'aviator']), hair: pick(r, ['arkaya', 'yan_ayrik', 'uzun']), beard: pick(r, ['stubble', 'keci', 'none']) })],
  ['kot_ceket', 'x', (r, L) => Object.assign(L, { top: 'jacket', topColor: pick(r, COL.denim), shirtColor: pick(r, COL.pastel), pants: pick(r, ['chino', 'jeans']), pantsStyle: null, pantsColor: pick(r, ['#c9b48a', '#2a2a2a', '#5a2a2a']), shoes: pick(r, ['sneaker', 'boots']), shoesColor: pick(r, ['#eeeeee', '#3a2412']) })],
  ['anne', 'f', (r, L) => Object.assign(L, { age: r.float(0.2, 0.5), top: 'coat', topColor: pick(r, COL.earth.concat(['#2a2a3a', '#5a1a1a'])), shirtColor: pick(r, COL.pastel), pants: 'jeans', pantsColor: pick(r, COL.denim), shoes: 'boots', shoesColor: '#2a1a10', hair: pick(r, ['uzun', 'kare', 'dalgali', 'topuz']), bag: r.chance(0.3) ? 'duffel' : null, fat: r.float(0, 0.4) })],
  ['memur', 'm', (r, L) => Object.assign(L, { age: r.float(0.2, 0.6), top: 'shirt', topColor: pick(r, ['#e8e8f0', '#a8c8e8', '#e8d8c8', '#d0d8e0']), pants: 'slacks', pantsColor: pick(r, COL.dark.concat(COL.earth)), shoes: 'polished', shoesColor: '#0a0a0a', glasses: r.chance(0.5), glassesStyle: 'readers', beard: pick(r, ['mustache', 'none', 'stubble']), hair: pick(r, ['yan_ayrik', 'kisa', 'kel']), fat: r.float(0, 0.6) })],
  ['emekli', 'm', (r, L) => Object.assign(L, { age: r.float(0.7, 1), top: 'sweater', topColor: pick(r, COL.earth.concat(['#3a4a5a', '#6a2a2a'])), pants: 'slacks', pantsColor: pick(r, COL.earth), shoes: 'loafer', shoesColor: '#3a2412', hair: 'kel', hairColor: '#aaaaaa', glasses: true, glassesStyle: 'readers', beard: pick(r, ['none', 'mustache']), fat: r.float(0.2, 0.8) })],
  ['garson', 'm', (r, L) => Object.assign(L, { top: 'shirt', topColor: '#f0f0f0', pants: 'slacks', pantsColor: '#111111', shoes: 'polished', shoesColor: '#0a0a0a', apron: true, apronColor: '#111111', hair: pick(r, ['arkaya', 'kisa']) })],
  ['genc', 'x', (r, L) => Object.assign(L, { age: 0, height: r.float(0.9, 0.97), build: r.float(0.85, 0.95), top: pick(r, ['tshirt', 'hoodie']), topColor: pick(r, COL.bright), pants: pick(r, ['track', 'jeans', 'shorts']), pantsColor: pick(r, COL.dark.concat(COL.denim)), shoes: 'sneaker', shoesColor: pick(r, ['#eeeeee', '#1a1a1a']), hat: r.chance(0.3) ? 'cap' : 'none', hatColor: pick(r, COL.bright), beard: 'none' })],
  ['taksici', 'm', (r, L) => Object.assign(L, { age: r.float(0.3, 0.7), top: 'polo', topStyle: 'polo', topColor: pick(r, COL.pastel.concat(['#3a3a3a'])), pants: 'slacks', pantsColor: pick(r, COL.dark), shoes: 'loafer', shoesColor: '#1a1a1a', beard: 'mustache', fat: r.float(0.4, 1), build: r.float(1.0, 1.15) })],
  ['doktor', 'x', (r, L) => Object.assign(L, { top: 'coat', topColor: '#f2f2f2', shirtColor: '#a8c8e8', pants: 'slacks', pantsColor: '#3a3a4a', shoes: 'loafer', shoesColor: '#1a1a1a', glasses: r.chance(0.4), glassesStyle: 'readers' })],
  ['sanatci', 'm', (r, L) => Object.assign(L, { top: pick(r, ['tshirt', 'denim']), topColor: pick(r, COL.dark.concat(COL.earth)), pants: 'jeans', pantsColor: pick(r, COL.denim), shoes: 'boots', shoesColor: '#3a2412', hair: pick(r, ['uzun', 'kivircik', 'at_kuyrugu']), beard: 'full', glasses: r.chance(0.3), glassesStyle: 'readers', hat: r.chance(0.2) ? 'bere' : 'none', hatColor: '#3a3a3a' })],
  ['sik_kadin', 'f', (r, L) => Object.assign(L, { age: r.float(0, 0.4), top: 'coat', topColor: pick(r, ['#c8b8a0', '#1a1a1a', '#5a1a2a', '#8a7a6a']), shirtColor: '#1a1a1a', pants: pick(r, ['skirt', 'slacks']), pantsColor: '#111111', tights: r.chance(0.5) ? '#1a1418' : null, shoes: 'boots', shoesColor: '#111111', hair: pick(r, ['dalgali', 'uzun', 'kare']), makeup: true, glasses: r.chance(0.3), glassesStyle: 'glasses' })],
  ['yasli_k2', 'f', (r, L) => Object.assign(L, { age: r.float(0.75, 1), top: 'sweater', topColor: pick(r, COL.earth.concat(['#6a4a5a'])), pants: 'longskirt', pantsColor: pick(r, COL.dark), shoes: 'loafer', shoesColor: '#2a1a10', hair: 'topuz', hairColor: pick(r, ['#aaaaaa', '#cccccc', '#8a8a8a']), glasses: r.chance(0.5), glassesStyle: 'readers', fat: r.float(0.2, 0.7) })],
  ['kurye', 'm', (r, L) => Object.assign(L, { top: pick(r, ['hoodie', 'track']), topColor: pick(r, ['#c81010', '#1a1a1a', '#f0a020', '#2a6a2a']), pants: 'cargo', pantsColor: '#2a2a2a', shoes: 'sneaker', shoesColor: '#1a1a1a', hat: 'cap', hatColor: pick(r, ['#c81010', '#1a1a1a']), bag: 'duffel', bagColor: '#1a1a1a' })],
  ['hoca', 'm', (r, L) => Object.assign(L, { age: r.float(0.5, 0.95), top: 'pardesu', topColor: pick(r, ['#2a2a2a', '#3a3a3a', '#4a4030']), pants: 'slacks', pantsColor: '#2a2a2a', shoes: 'loafer', shoesColor: '#111111', hat: 'takke', hatColor: '#f0f0f0', beard: 'full', hairColor: pick(r, ['#8a8a8a', '#cccccc', '#1a1410']), tespih: true })],
  ['mahalle_abisi', 'm', (r, L) => Object.assign(L, { top: 'track', topColor: pick(r, ['#1a1a1a', '#1d3d6e', '#5a1a1a']), pants: 'track', pantsColor: '#1a1a1a', shoes: 'sneaker', shoesColor: '#eeeeee', beard: pick(r, ['mustache', 'stubble']), tespih: true, chain: r.chance(0.3), hair: pick(r, ['asker', 'kisa']) })],
  ['yazlikci', 'x', (r, L) => Object.assign(L, { top: 'polo', topStyle: 'polo', topColor: pick(r, COL.pastel), pants: 'chino', pantsStyle: 'chino', pants2: null, pantsColor: pick(r, ['#c9b48a', '#e8e0d0', '#2a3a5a']), shoes: 'loafer', shoesColor: '#5a3a20', hat: r.chance(0.5) ? 'panama' : 'none', hatColor: '#e8dcc0', glasses: r.chance(0.5), glassesStyle: 'aviator', glassesColor: '#d4af37' })],
  ['turist_yasli', 'x', (r, L) => Object.assign(L, { age: r.float(0.75, 1), skin: '#f1d0b5', top: 'polo', topColor: pick(r, COL.pastel), pants: 'shorts', pantsColor: '#c9b48a', shoes: 'sneaker', shoesColor: '#eeeeee', hat: 'panama', hatColor: '#e8dcc0', camera: true, hairColor: '#cccccc', hair: L.gender === 'f' ? 'kare' : 'kel', glasses: true, glassesStyle: 'readers' })],
  ['universiteli', 'f', (r, L) => Object.assign(L, { age: 0, top: pick(r, ['sweater', 'denim']), topColor: pick(r, COL.pastel.concat(COL.denim)), pants: pick(r, ['jeans', 'skirt']), pantsColor: pick(r, COL.denim), shoes: pick(r, ['sneaker', 'boots']), shoesColor: pick(r, ['#eeeeee', '#3a2412']), hair: pick(r, ['uzun', 'kare', 'kivircik', 'dalgali']), glasses: r.chance(0.5), glassesStyle: 'readers', bag: r.chance(0.5) ? 'bag1' : null, bagColor: pick(r, COL.earth) })],
  ['kapali_genc', 'f', (r, L) => Object.assign(L, { age: 0, top: pick(r, ['hoodie', 'denim', 'pardesu']), topColor: pick(r, COL.pastel.concat(COL.dark)), pants: 'jeans', pantsColor: pick(r, COL.denim), shoes: 'sneaker', shoesColor: '#eeeeee', hat: 'basortusu', hatColor: pick(r, COL.scarf), bag: r.chance(0.5) ? 'bag1' : null, bagColor: pick(r, COL.bright) })],
];
export const ARCHETYPE_IDS = ARCHETYPES.map((a) => a[0]);
const MALE_HAIR = ['kisa', 'arkaya', 'kel', 'kivircik', 'yan_ayrik', 'kisa', 'asker'];
const FEMALE_HAIR = ['uzun', 'at_kuyrugu', 'kivircik', 'kare', 'topuz', 'dalgali', 'uzun'];

export function randomLook(r, kind = 'civilian', archetype) {
  const gender = r.chance(kind === 'civilian' ? 0.45 : 0.08) ? 'f' : 'm';
  let L = defaultLook(gender);
  L.skin = r.pick(SKIN_TONES.slice(0, 5));
  L.hairColor = r.pick(HAIR_COLORS.slice(0, 5).concat(['#1a1410', '#3b2a1e']));
  L.hair = gender === 'f' ? r.pick(FEMALE_HAIR) : r.pick(MALE_HAIR);
  L.beard = gender === 'f' ? 'none' : r.pick(BEARDS_ALL.concat(['stubble', 'mustache']));
  L.eyeColor = r.pick(EYE_COLORS);
  L.height = r.float(0.94, 1.06); L.build = r.float(0.9, 1.12); L.shoulders = r.float(0.94, 1.08); L.fat = r.chance(0.25) ? r.float(0.2, 0.8) : 0;
  L.age = r.chance(0.7) ? r.float(0, 0.4) : r.float(0.4, 0.7);
  L.top = r.pick(['tshirt', 'shirt', 'jacket', 'coat', 'track', 'tshirt', 'leather']);
  L.topColor = r.pick(['#8a1a1a', '#1d3d6e', '#2d5a2d', '#444444', '#c9b48a', '#e0e0e0', '#5a2d5a', '#b05a1a', '#1a1a1a', '#6e8a9e']);
  L.shirtColor = r.pick(['#ffffff', '#d8d8e8', '#e8d8c8', '#a8c8e8']);
  L.pants = r.pick(['jeans', 'slacks', 'jeans', 'track']);
  L.pantsColor = r.pick(['#2a3550', '#1a1a1a', '#5a4a3a', '#3a3a3a', '#6a6a5a']);
  L.shoes = r.pick(['sneaker', 'polished', 'boots', 'sneaker']);
  L.shoesColor = r.pick(['#1a1a1a', '#3a2412', '#eeeeee']);
  L.glasses = r.chance(0.1);
  if (kind === 'civilian') {
    // arketip: cinsiyete uygun olandan seç
    let a = archetype ? ARCHETYPES.find((x) => x[0] === archetype) : null;
    if (!a) { const pool = ARCHETYPES.filter((x) => x[1] === 'x' || x[1] === gender); a = pool[Math.floor(r.next() * pool.length)]; }
    if (a[1] !== 'x' && a[1] !== gender) { L = Object.assign(L, defaultLook(a[1]), { skin: L.skin, eyeColor: L.eyeColor, height: L.height, build: L.build, hairColor: L.hairColor }); L.hair = a[1] === 'f' ? r.pick(FEMALE_HAIR) : r.pick(MALE_HAIR); L.beard = a[1] === 'f' ? 'none' : r.pick(BEARDS_ALL); }
    a[2](r, L);
    if (!L.pantsColor) L.pantsColor = L.topColor;
    L.archetype = a[0];
    if (L.gender === 'f') L.beard = 'none';
  } else if (kind === 'police') {
    const v = r.next();
    Object.assign(L, { top: 'police', topStyle: v < 0.45 ? 'police' : v < 0.85 ? 'police_shirt' : 'police_vest', topColor: '#1d2f5a', shirtColor: '#a8c0e0', pants: 'slacks', pantsColor: '#1a2440', shoes: 'boots', shoesColor: '#111111', hat: r.chance(0.8) ? 'police' : 'none', hatColor: r.chance(0.15) ? '#e8e8e8' : '#1a2440', glasses: r.chance(0.25), glassesStyle: 'aviator', age: r.float(0, 0.45), fat: r.chance(0.2) ? 0.4 : 0, beard: gender === 'f' ? 'none' : r.pick(['none', 'stubble', 'mustache']) });
    if (L.topStyle === 'police_shirt' || L.topStyle === 'police_vest') L.topColor = '#a8c0e0';
    if (gender === 'f') L.hair = r.pick(['topuz', 'at_kuyrugu']);
  } else if (kind === 'gang') {
    // çete stilleri (topColor çağıran tarafından çete rengine çevrilir)
    const st = r.pick(['leather', 'track', 'suit', 'hoodie', 'shirt', 'denim']);
    Object.assign(L, { top: st === 'hoodie' ? 'track' : st === 'denim' ? 'jacket' : st, topStyle: st === 'hoodie' ? 'hoodie' : null, pants: r.pick(['jeans', 'slacks', 'track', 'cargo']), glasses: r.chance(0.5), glassesStyle: r.pick(['glasses', 'aviator']), chain: r.chance(0.5), beard: r.pick(['stubble', 'full', 'mustache', 'keci']), hat: r.chance(0.2) ? r.pick(['bere', 'cap']) : 'none', hatColor: '#151515', hair: r.pick(['asker', 'kisa', 'arkaya', 'kel', 'yan_ayrik']), build: r.float(1.0, 1.2), shoulders: r.float(1.0, 1.12), age: r.float(0, 0.35), tespih: r.chance(0.25) });
    if (L.pants === 'cargo') { L.pants = 'jeans'; L.pantsStyle = 'cargo'; }
    if (L.top === 'leather') L.topColor = r.pick(['#1c1c1c', '#4a2c1a']);
    if (L.top === 'shirt') L.topColor = r.pick(['#1a1a1a', '#2a2a2a', '#5a1a1a']);
  } else if (kind === 'boss') {
    Object.assign(L, { top: 'suit', topColor: '#111111', shirtColor: '#f0f0f0', pants: 'slacks', pantsColor: '#111111', shoes: 'polished', shoesColor: '#0a0a0a', hat: 'fedora', hatColor: '#151515', glasses: true, chain: true, tespih: true, beard: 'full', hairColor: '#8a8a8a', build: 1.12, age: 0.6, fat: 0.4, shoulders: 1.05 });
  }
  return L;
}

// ---------------- geometri önbelleği (LRU) ----------------
const geoCache = new Map();
function geoFor(L, lod) {
  const k = lookKey(L, lod);
  let g = geoCache.get(k);
  if (g) { geoCache.delete(k); geoCache.set(k, g); return g; }
  g = buildCharGeometry(L, lod);
  geoCache.set(k, g);
  if (geoCache.size > 180) { const [ok, ov] = geoCache.entries().next().value; geoCache.delete(ok); ov.dispose(); }
  return g;
}
// bağlama pozu ters matrisleri: vücut ölçüsü başına paylaşılır
const invCache = new Map();
function bindInverses(R) {
  const k = [R.shX, R.hipX, R.hk].join('|');
  if (invCache.has(k)) return invCache.get(k);
  const out = BONES.map((n) => new THREE.Matrix4().makeTranslation(-R.pos[n][0], -R.pos[n][1], -R.pos[n][2]));
  invCache.set(k, out);
  return out;
}

// ---------------- LOD (kamera konumu son çizimden) ----------------
const CAM = new THREE.Vector3(0, 1e5, 0);
const LOD_D = [14, 38];
let ACTIVE_LODS = 0;
void ACTIVE_LODS;

// ---------------- poz kanalları ----------------
const J = { hips: 0, spine: 1, chest: 2, head: 3, shL: 4, elL: 5, wrL: 6, shR: 7, elR: 8, wrR: 9, hipL: 10, knL: 11, anL: 12, hipR: 13, knR: 14, anR: 15, neck: 16, toeL: 17, toeR: 18 };
const JB = ['hips', 'spine', 'chest', 'head', 'shL', 'elL', 'wrL', 'shR', 'elR', 'wrR', 'hipL', 'knL', 'anL', 'hipR', 'knR', 'anR', 'neck', 'toeL', 'toeR'];
const NJ = 19, HP = NJ * 3, NCH = HP + 3;
const SIDE = [0, 0, 0, 0, 1, 1, 1, -1, -1, -1, 1, 1, 1, -1, -1, -1, 0, 1, -1];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dmp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const smR = (a, b, x) => sm((x - a) / (b - a));
const fract = (x) => x - Math.floor(x);
function setJ(P, j, x, y, z) { P[j * 3] = x; P[j * 3 + 1] = y; P[j * 3 + 2] = z; }
function addJ(P, j, x, y, z) { P[j * 3] += x; P[j * 3 + 1] += y; P[j * 3 + 2] += z; }
function mixP(P, Q, w, from = 0, to = NCH) { if (w <= 0) return; if (w >= 1) { for (let i = from; i < to; i++) P[i] = Q[i]; return; } for (let i = from; i < to; i++) P[i] += (Q[i] - P[i]) * w; }
function mixJ(P, Q, w, list) { if (w <= 0) return; for (const j of list) for (let k = 0; k < 3; k++) P[j * 3 + k] += (Q[j * 3 + k] - P[j * 3 + k]) * Math.min(1, w); }
const ARM_R = [J.shR, J.elR, J.wrR], ARM_L = [J.shL, J.elL, J.wrL], ARMS = [J.shL, J.elL, J.wrL, J.shR, J.elR, J.wrR];

// Yürüyüş tablosu (hız m/s -> parametreler). Değerler anatomik aralıklarda: kalça uzanması ~30° üstüne çıkmaz.
//  v, kadans(çevrim/s), duruş oranı, ayak kaldırma, topuk savurma, kalça düşüşü, sekme, öne eğilme, kol, dirsek,
//  kalça dönüşü, göğüs ters dönüşü, kalça yuvarlanma, yanal salınım, adım genişliği, topuk basma, parmak itiş
const GAIT = [
  [0, 0.8, 0.66, 0, 0, 0, 0, 0.02, 0, -0.12, 0, 0, 0, 0, 1, 0, 0],
  [1.4, 0.93, 0.62, 0.085, 0, 0.012, 0.018, 0.04, 0.3, -0.3, 0.09, 0.1, 0.045, 0.02, 0.95, 0.3, 0.42],
  [2.6, 1.18, 0.46, 0.15, 0.05, 0.03, 0.028, 0.075, 0.42, -0.85, 0.1, 0.13, 0.04, 0.012, 0.75, 0.14, 0.5],
  [3.6, 1.38, 0.33, 0.22, 0.1, 0.042, 0.032, 0.11, 0.5, -1.3, 0.1, 0.15, 0.035, 0.008, 0.6, 0.06, 0.65],
  [5.5, 1.5, 0.26, 0.26, 0.15, 0.055, 0.036, 0.17, 0.66, -1.42, 0.11, 0.17, 0.03, 0.005, 0.48, 0.02, 0.75],
  [7.5, 1.6, 0.22, 0.29, 0.2, 0.065, 0.038, 0.22, 0.8, -1.48, 0.12, 0.19, 0.025, 0.004, 0.4, 0.0, 0.8],
];
const CROUCH = [
  [0, 0.75, 0.66, 0, 0, 0, 0, 0.3, 0, -0.5, 0, 0, 0, 0, 1.1, 0, 0],
  [1.8, 1.05, 0.6, 0.09, 0, 0.01, 0.012, 0.36, 0.12, -0.6, 0.06, 0.08, 0.03, 0.012, 1.15, 0.12, 0.35],
];
const NG = 17;
function gaitAt(tbl, sp, out) {
  let a = tbl[0], b = tbl[tbl.length - 1];
  if (sp <= a[0]) { for (let i = 0; i < NG; i++) out[i] = a[i]; return out; }
  for (let i = 0; i < tbl.length - 1; i++) if (sp <= tbl[i + 1][0]) { a = tbl[i]; b = tbl[i + 1]; break; }
  const t = clamp((sp - a[0]) / (b[0] - a[0] || 1), 0, 1);
  for (let i = 0; i < NG; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

const _eu = new THREE.Euler();
const UPV = new THREE.Vector3(0, 1, 0);
const v3 = () => new THREE.Vector3(), q4 = () => new THREE.Quaternion();
const IK = { S: v3(), E: v3(), W: v3(), d: v3(), b: v3(), u: v3(), e: v3(), f: v3(), x: v3(), y: v3(), z: v3(), m: new THREE.Matrix4(), qw: q4(), q1: q4(), q2: q4(), q3: q4(), q4: q4() };
const LG = { S: v3(), T: v3(), d: v3(), pole: v3(), bv: v3(), u: v3(), K: v3(), w: v3(), X: v3(), Y: v3(), Z: v3(), m: new THREE.Matrix4(), qT: q4(), qL: q4(), qK: q4(), qF: q4(), qi: q4(), e: new THREE.Euler() };
const WV = { aim: v3(), fwd: v3(), right: v3(), dir: v3(), R: v3(), U: v3(), eye: v3(), shR: v3(), shL: v3(), G: v3(), F: v3(), t: v3(), x: v3(), y: v3(), z: v3(), wT: v3(), pole: v3(), mag: v3(), belt: v3(), qR: q4(), qL: q4() };
const DTMP = v3();
const LEN_T = 0.43, LEN_S = 0.41;

// küçük el aksesuarları (yalnız kullanılırken görünür)
let PROPS = null;
function props() {
  if (PROPS) return PROPS;
  const ph = new THREE.BoxGeometry(0.036, 0.074, 0.008); ph.translate(0, 0, 0);
  const cig = new THREE.CylinderGeometry(0.0028, 0.0028, 0.06, 6); cig.rotateZ(Math.PI / 2);
  PROPS = {
    phone: ph, phoneMat: new THREE.MeshStandardMaterial({ color: '#15171a', roughness: 0.25, metalness: 0.4, emissive: '#2a4a6a', emissiveIntensity: 0.35 }),
    cig, cigMat: new THREE.MeshStandardMaterial({ color: '#eeeeee', roughness: 0.8, emissive: '#ff5010', emissiveIntensity: 0.0 }),
  };
  return PROPS;
}

let MID = 0;
export class CharacterModel {
  constructor(look) {
    this.root = new THREE.Group();
    this.look = { ...look };
    this.id = MID++;
    this.phase = Math.random() * 10;
    this.cyc = Math.random();
    this.seed = Math.random() * 100;
    this.weaponMesh = null;
    this.weaponId = null;
    this.deadT = 0;
    this.punchT = 0;
    this.P = new Float32Array(NCH);
    this.Q = new Float32Array(NCH);
    this.D0 = new Float32Array(NCH);
    this.DS = new Float32Array(NCH);
    this.w = { crouch: 0, aim: 0, air: 0, swim: 0, sit: 0, up: 0, talk: 0, dance: 0, idle: 1, reload: 0, hold: 0, cower: 0, phone: 0, smoke: 0, cross: 0, watch: 0, behind: 0, look: 0 };
    this.spd = 0; this.mvx = 0; this.mvz = 1; this.acc = 0; this.prevSpd = 0;
    this.yawRate = 0; this.prevYaw = null; this.bank = 0;
    this.fl = { x: 0, z: 0, vx: 0, vz: 0 };
    this.landK = 0; this.landT = 9; this.wasAir = false; this.airVy = 0;
    this.combo = 0; this.meleeKind = 'R'; this.meleeDur = 0.4;
    this.deathDir = null;
    this.time = Math.random() * 50;
    this.curl = [0.3, 0.3];
    this.bobY = 0;
    this.lod = -1; this.forceLod = null;
    this.idleVar = null; this.idleVarT = 0; this.idleNext = 3 + Math.random() * 8; this.idleTime = 0;
    this.lookYaw = 0; this.lookPitch = 0; this.lookT = 0; this.lookTY = 0; this.lookTP = 0;
    this.feet = [{ x: 0, y: 0, z: 0, p: 0, toe: 0 }, { x: 0, y: 0, z: 0, p: 0, toe: 0 }];
    this.pel = { x: 0, y: 0, z: 0 };
    this.settled = false;
    this.buildRig();
    this.build();
  }

  // iskelet (bir kez); kemik konumları görünüşe göre build()'de ayarlanır
  buildRig() {
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.bones = BONES.map((n) => { const b = new THREE.Bone(); b.name = n; return b; });
    for (let i = 0; i < BONES.length; i++) {
      const p = BONE_PARENT[BONES[i]];
      (p ? this.bones[BI[p]] : this.body).add(this.bones[i]);
    }
    const B = (n) => this.bones[BI[n]];
    this.hips = B('hips'); this.spine = B('spine'); this.chest = B('chest'); this.neck = B('neck'); this.head = B('head');
    this.arms = []; this.legs = [];
    for (const s of [1, -1]) {
      const S = s > 0 ? 'L' : 'R';
      const wr = B('wr' + S);
      const socket = new THREE.Object3D(); socket.position.set(-s * 0.004, -0.072, 0.004); wr.add(socket);
      this.arms.push({ sh: B('sh' + S), el: B('el' + S), wr, socket, s, fi: B('fi' + S), fd: B('fd' + S), th: B('th' + S) });
      this.legs.push({ hip: B('hip' + S), kn: B('kn' + S), an: B('an' + S), toe: B('toe' + S), s });
    }
    this.joints = JB.map((n) => B(n));
    this.skeleton = null;
    this.mesh = null;
    this.meshes = [];
  }

  build() {
    const L = this.look;
    const R = rigFor(L);
    this.rig = R;
    this.body.scale.setScalar(R.height);
    // kemik dinlenme konumları (ebeveyne göre)
    for (let i = 0; i < BONES.length; i++) {
      const n = BONES[i], p = BONE_PARENT[n], a = R.pos[n], b = p ? R.pos[p] : [0, 0, 0];
      this.bones[i].position.set(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      this.bones[i].quaternion.identity();
    }
    this.rest = this.bones.map((b) => b.position.clone());
    this.hipX = R.hipX;
    if (this.lod < 0) {
      // ilk LOD tahmini: son kamera konumuna uzaklık (sonraki çizimde düzeltilir)
      const pe = this.root.parent ? this.root.parent.matrixWorld.elements : null;
      const x = this.root.position.x + (pe ? pe[12] : 0), z = this.root.position.z + (pe ? pe[14] : 0);
      const d = Math.hypot(x - CAM.x, z - CAM.z);
      this.lod = CAM.y > 1e4 ? 1 : d < LOD_D[0] ? 0 : d < LOD_D[1] ? 1 : 2;
    }
    const lod = this.forceLod !== null ? this.forceLod : this.lod;
    const geo = geoFor(L, lod);
    const mat = charMaterial(L);
    if (!this.mesh) {
      this.mesh = new THREE.SkinnedMesh(geo, mat);
      this.mesh.castShadow = true;
      this.mesh.customDepthMaterial = charDepthMaterial();
      this.mesh.frustumCulled = true;
      this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.0);
      this.body.add(this.mesh);
      this.meshes = [this.mesh];
      const self = this;
      this.mesh.onBeforeRender = function (renderer, scene, camera) {
        CAM.copy(camera.position);
        self.pickLod(camera);
      };
    } else {
      this.mesh.geometry = geo;
      this.mesh.material = mat;
    }
    this.skeleton = new THREE.Skeleton(this.bones, bindInverses(R));
    this.mesh.bind(this.skeleton, new THREE.Matrix4());
    this.mesh.bindMode = 'attached';
    if (this.weaponId) { const w = this.weaponId; this.weaponId = null; this.setWeapon(w); }
  }

  // kameraya uzaklığa göre LOD (bir sonraki karede geçerli)
  pickLod(camera) {
    if (this.forceLod !== null) { if (this.lod !== this.forceLod) this.setLod(this.forceLod); return; }
    const e = this.mesh.matrixWorld.elements;
    const dx = e[12] - camera.position.x, dy = e[13] - camera.position.y, dz = e[14] - camera.position.z;
    let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // dar görüş (nişan dürbünü) yakın sayılır
    if (camera.fov) d *= camera.fov / 60;
    const cur = this.lod;
    let want = d < LOD_D[0] ? 0 : d < LOD_D[1] ? 1 : 2;
    if (cur >= 0 && want !== cur) { const edge = LOD_D[Math.min(want, cur)]; if (Math.abs(d - edge) < 2) want = cur; }
    if (want !== cur) this.setLod(want);
  }
  setLod(l) {
    this.lod = l;
    this.mesh.geometry = geoFor(this.look, l);
  }

  setLook(look) { this.look = { ...look }; this.build(); }

  setWeapon(id) {
    if (this.weaponId === id) return;
    if (this.weaponMesh) { this.weaponMesh.parent && this.weaponMesh.parent.remove(this.weaponMesh); this.weaponMesh = null; }
    this.weaponId = id;
    if (!id || id === 'fists') return;
    const w = buildWeaponModel(id);
    if (!w) return;
    w.rotation.x = Math.PI / 2;
    this.arms[1].socket.add(w);
    this.weaponMesh = w;
  }

  muzzleWorld(out) {
    if (this.weaponMesh && this.weaponMesh.userData.muzzle) return this.weaponMesh.userData.muzzle.getWorldPosition(out);
    this.arms[1].socket.getWorldPosition(out);
    return out;
  }

  // vuruş tepkisi: (dirX, dirZ) merminin dünyadaki gidiş yönü
  hit(dirX, dirZ, k = 1) {
    const h = this.root.rotation.y, c = Math.cos(h), s = Math.sin(h);
    const lx = dirX * c - dirZ * s, lz = dirX * s + dirZ * c;
    const l = Math.hypot(lx, lz) || 1;
    this.fl.vx += (lx / l) * 7 * k; this.fl.vz += (lz / l) * 7 * k;
    this.deathDir = { x: lx / l, z: lz / l };
    this.hitT = 0.35; this.hitSide = Math.random() < 0.5 ? 1 : -1;
  }
  die(dirX, dirZ) {
    if (dirX === undefined) { const a = Math.random() * Math.PI * 2; this.deathDir = { x: Math.sin(a), z: Math.cos(a) }; return; }
    const h = this.root.rotation.y, c = Math.cos(h), s = Math.sin(h);
    const lx = dirX * c - dirZ * s, lz = dirX * s + dirZ * c, l = Math.hypot(lx, lz) || 1;
    this.deathDir = { x: lx / l, z: lz / l };
  }

  punch() {
    const id = this.weaponId || 'fists';
    this.combo++;
    if (id === 'knife') { this.meleeKind = this.combo % 2 ? 'stab' : 'slash'; this.meleeDur = 0.38; }
    else if (id === 'bat') { this.meleeKind = 'bat'; this.meleeDur = 0.6; }
    else if (id === 'fists') { const c = this.combo % 3; this.meleeKind = c === 1 ? 'L' : c === 2 ? 'R' : 'hook'; this.meleeDur = c === 0 ? 0.42 : 0.34; }
    else { this.meleeKind = 'R'; this.meleeDur = 0.36; }
    this.punchT = this.meleeDur;
  }
  stab() { this.combo++; this.meleeKind = 'stab'; this.meleeDur = 0.38; this.punchT = this.meleeDur; }
  slash() { this.combo++; this.meleeKind = 'slash'; this.meleeDur = 0.42; this.punchT = this.meleeDur; }
  // eski API: yumruk = parmak bükümü
  setFist(i, on) { this.fistWant = this.fistWant || [0, 0]; this.fistWant[i] = on ? 1 : 0; }

  // st: {speed, moveX, moveZ, aim, aimPitch, aimYaw, twoHanded, weapon, dead, swim, sit, crouch, recoil, reload,
  //      air, vy, hands_up, talk, dance, vault, roll, cower, phone, smoke, isPlayer, force}
  animate(dt, st) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const t = this.time, P = this.P, Q = this.Q, W = this.w;
    if (!this.root.parent && !st.force) return;
    if (st.force && this.forceLod === null && this.lod !== 0) this.setLod(0);
    const fistW = this.fistWant || (this.fistWant = [0, 0]);
    fistW[0] = 0; fistW[1] = 0;
    // ---- ölüm ----
    if (st.dead) {
      if (this.deadT === 0) { this.D0.set(P); this.DS.fill(0); this.settled = false; if (!this.deathDir) this.die(); }
      this.deadT += dt;
      if (this.settled) return;
      this.poseDeath(P, this.deadT);
      for (let i = 0; i < NCH; i++) P[i] += this.DS[i];
      this.apply(P, 0);
      this.settleDeath(dt);
      const crd = this._cr || (this._cr = [0, 0]); crd[0] = 0.25; crd[1] = this.weaponMesh ? 0.7 : 0.3;
      this.applyHands(dt, crd);
      if (this.deadT > 3.2) this.settled = true;
      return;
    }
    if (this.deadT > 0) { this.deadT = 0; this.deathDir = null; this.settled = false; }
    // ---- ağırlıklar ----
    const sp = st.speed || 0;
    const sc = this.rig.height;
    this.spd = dmp(this.spd, sp, 9, dt);
    const accRaw = (this.spd - this.prevSpd) / Math.max(dt, 1e-3); this.prevSpd = this.spd;
    this.acc = dmp(this.acc, clamp(accRaw, -12, 12), 6, dt);
    // dönüş hızı (kök yönelimi farkı)
    const ry = this.root.rotation.y;
    if (this.prevYaw === null) this.prevYaw = ry;
    let dy = ry - this.prevYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.prevYaw = ry;
    this.yawRate = dmp(this.yawRate, clamp(dy / Math.max(dt, 1e-3), -12, 12), 8, dt);
    if (sp > 0.2) {
      const mx = st.moveX !== undefined ? st.moveX : 0, mz = st.moveZ !== undefined ? st.moveZ : 1;
      const l = Math.hypot(mx, mz) || 1;
      this.mvx = dmp(this.mvx, mx / l, 8, dt); this.mvz = dmp(this.mvz, mz / l, 8, dt);
    }
    const twoH = !!(st.twoHanded && this.weaponMesh);
    const cow = !!st.cower;
    W.crouch = dmp(W.crouch, st.crouch && !cow ? 1 : 0, 9, dt);
    W.aim = dmp(W.aim, st.aim ? 1 : 0, 14, dt);
    W.air = dmp(W.air, st.air ? 1 : 0, st.air ? 8 : 20, dt);
    W.swim = dmp(W.swim, st.swim ? 1 : 0, 5, dt);
    W.sit = dmp(W.sit, st.sit ? 1 : 0, 6, dt);
    W.up = dmp(W.up, st.hands_up && !cow ? 1 : 0, 8, dt);
    W.cower = dmp(W.cower, cow ? 1 : 0, 7, dt);
    W.talk = dmp(W.talk, st.talk ? 1 : 0, 3, dt);
    W.dance = dmp(W.dance, st.dance ? 1 : 0, 3, dt);
    W.reload = dmp(W.reload, st.reload > 0 ? 1 : 0, 10, dt);
    W.hold = dmp(W.hold, twoH ? 1 : 0, 10, dt);
    if (st.air) { this.airVy = Math.min(this.airVy, st.vy || 0); }
    if (this.wasAir && !st.air) { this.landK = clamp(-this.airVy / 11, 0.15, 1); this.landT = 0; this.airVy = 0; }
    this.wasAir = !!st.air;
    this.landT += dt;
    const age = this.rig.age;

    // ---- 1) hareket döngüsü ----
    P.fill(0);
    const spB = this.spd / sc; // vücut uzayında hız
    const turnStep = Math.min(1.2, Math.abs(this.yawRate) * 0.22) * (1 - smR(0.3, 1.2, spB));
    const gSp = Math.max(spB, turnStep);
    const g = gaitAt(GAIT, gSp, this._g || (this._g = new Float32Array(NG)));
    const gc = gaitAt(CROUCH, gSp, this._gc || (this._gc = new Float32Array(NG)));
    const wc = Math.max(W.crouch, W.cower);
    for (let i = 1; i < NG; i++) g[i] += (gc[i] - g[i]) * wc;
    let cad = g[1], beta = g[2], lift = g[3], kick = g[4], drop = g[5], bob = g[6], lean = g[7], armA = g[8], elb = g[9], yawP = g[10], yawC = g[11], roll = g[12], sway = g[13], width = g[14], heel = g[15], toeOff = g[16];
    // yaşlı: kısa ve sık adım, az kaldırma, kambur
    if (age > 0.3) { const a = (age - 0.3) / 0.7; cad *= 1 + 0.16 * a; lift *= 1 - 0.35 * a; armA *= 1 - 0.4 * a; heel *= 1 - 0.5 * a; }
    const lat = Math.abs(this.mvx);
    cad *= 1 + 0.28 * lat;
    const moving = sm(gSp / 0.45);
    this.cyc = fract(this.cyc + cad * dt);
    const cyc = this.cyc;
    this.phase = cyc * Math.PI * 2;
    const run = smR(2.2, 4.2, spB);
    const travel = (gSp / cad) * beta * (gSp === spB ? 1 : 0.35);
    const back = this.mvz < -0.3;
    const dX = gSp === spB ? this.mvx : 0, dZ = gSp === spB ? this.mvz : 1;
    const c0 = -0.06 * run;
    const F = this.feet;
    let sLs = 0, sRs = 0;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      const p = fract(cyc + i * 0.5);
      let along, y = 0, pitch, toe = 0;
      if (p < beta) {
        const u = p / beta;
        along = c0 + (0.5 - u) * travel;
        pitch = (-heel * (1 - smR(0, 0.25, u)) + toeOff * smR(0.55, 1, u)) * moving;
        toe = -Math.max(0, pitch);
      } else {
        const w = (p - beta) / (1 - beta), e = w * w * (3 - 2 * w);
        along = c0 + travel * (-0.5 + e) - kick * Math.sin(Math.PI * w) * (1.15 - w) * moving;
        y = lift * Math.pow(Math.sin(Math.PI * w), 0.9) * moving;
        pitch = (toeOff * (1 - smR(0, 0.55, w)) - heel * smR(0.6, 1, w) + 0.28 * run * Math.sin(Math.PI * w)) * moving;
        toe = 0.08 * moving;
      }
      if (back) pitch *= 0.4;
      if (i === 0) sLs = along; else sRs = along;
      const baseX = s * this.hipX * width;
      let fx = baseX + dX * along, fz = dZ * along;
      fx = s > 0 ? Math.max(fx, 0.035) : Math.min(fx, -0.035);
      // ayak bileği pivotu: topuk kalkınca parmak ucu, topuk basınca topuk etrafında
      let ay = 0.08, az = 0;
      if (pitch > 0) { ay += 0.055 * (Math.cos(pitch) - 1) + 0.12 * Math.sin(pitch); az += 0.055 * Math.sin(pitch) + 0.12 * (1 - Math.cos(pitch)); }
      else { ay += 0.055 * (Math.cos(pitch) - 1) - 0.07 * Math.sin(pitch); az += 0.055 * Math.sin(pitch) + 0.07 * (Math.cos(pitch) - 1); }
      const Fi = F[i];
      Fi.x = fx; Fi.y = ay + y; Fi.z = fz + az; Fi.p = pitch; Fi.toe = toe;
    }
    // kalça (pelvis): düşüş, sekme, yanal salınım, yuvarlanma, dönüş
    const sh = run * beta * 0.5;
    const bobV = -drop - bob * Math.cos(4 * Math.PI * (cyc - sh)) * moving;
    const swayV = sway * Math.cos(2 * Math.PI * (cyc - beta * 0.5)) * moving;
    const rollV = roll * Math.cos(2 * Math.PI * (cyc - beta * 0.5)) * moving;
    const nrm = clamp((sLs - sRs) / Math.max(travel, 0.05), -1, 1) * moving;
    this.bobY = bobV + drop;
    // ivmelenme ve dönüş eğimi
    const accLean = clamp(this.acc * 0.022, -0.12, 0.14) * smR(0.2, 1.5, spB + 0.5);
    this.bank = dmp(this.bank, clamp(-this.yawRate * spB * 0.03, -0.22, 0.22), 10, dt);
    const leanT = (lean + accLean) * (back ? -0.35 : 1) + 0.13 * smR(0.3, 1, age);
    const pel = this.pel;
    pel.x = swayV; pel.y = bobV - 0.33 * wc - 0.06 * W.cower; pel.z = -0.02 * run;
    setJ(P, J.hips, leanT * 0.22 + 0.1 * wc, -yawP * nrm, rollV + this.bank);
    setJ(P, J.spine, leanT * 0.42 + 0.06 * wc, yawP * nrm * 0.4, -rollV * 0.5);
    setJ(P, J.chest, leanT * 0.36, yawC * nrm, -rollV * 0.3 - this.bank * 0.3);
    // kollar: karşı bacakla, öne daha geniş
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      const a = armA * nrm * s; // + geri, - ileri
      const ax = a < 0 ? a : a * 0.62;
      const fwd = Math.max(0, -a) / Math.max(0.01, armA);
      setJ(P, i ? J.shR : J.shL, ax - 0.04 * run, 0.12 * run * fwd, 0.07 + 0.025 * this.rig.bk + 0.04 * run * (1 - fwd) + 0.1 * wc);
      setJ(P, i ? J.elR : J.elL, elb - 0.28 * armA * fwd, 0, 0);
      setJ(P, i ? J.wrR : J.wrL, -0.08 - 0.1 * run, 0, 0.05);
    }
    // nefes, boşta ağırlık aktarma
    const idle = 1 - moving;
    const br = Math.sin(t * 1.6 + this.seed);
    addJ(P, J.chest, 0.014 * br * (1 + run * spB * 0.1), 0, 0);
    addJ(P, J.shL, 0, 0, 0.012 * br); addJ(P, J.shR, 0, 0, 0.012 * br);
    const shift = (Math.sin(t * 0.37 + this.seed) * 0.7 + Math.sin(t * 0.13 + this.seed * 3) * 0.3) * idle * (1 - wc);
    pel.x += 0.032 * shift; addJ(P, J.hips, 0, 0.04 * shift, 0.035 * shift); addJ(P, J.spine, 0, 0, -0.03 * shift); addJ(P, J.chest, 0, 0, -0.015 * shift);
    // idle ayak duruşu: hafif açık + bir ayak önde
    if (idle > 0.01) { const st2 = (this.seed % 1) - 0.5; F[0].z += 0.05 * st2 * idle; F[1].z -= 0.05 * st2 * idle; }
    let lock = 1, hipsY = RIG.hips;

    // ---- boşta varyasyonları ve kişilik davranışları ----
    this.idleLayer(dt, st, idle, twoH);

    // ---- 2) havada ----
    if (W.air > 0.001) {
      Q.set(P);
      const up = clamp((st.vy || 0) / 5, -1, 1);
      const rise = clamp(up * 0.5 + 0.5, 0, 1);
      setJ(Q, J.hipL, -0.95 * rise - 0.35 * (1 - rise), 0, 0.06); setJ(Q, J.knL, 1.35 * rise + 0.45 * (1 - rise), 0, 0); setJ(Q, J.anL, 0.2, 0, 0);
      setJ(Q, J.hipR, 0.2 * rise - 0.25 * (1 - rise), 0, 0.06); setJ(Q, J.knR, 0.55 * rise + 0.35 * (1 - rise), 0, 0); setJ(Q, J.anR, 0.35, 0, 0);
      setJ(Q, J.shL, -0.5 * rise, 0, 0.35 + 0.35 * (1 - rise)); setJ(Q, J.shR, 0.25 * rise, 0, 0.35 + 0.35 * (1 - rise));
      setJ(Q, J.elL, -0.7, 0, 0); setJ(Q, J.elR, -0.5, 0, 0);
      addJ(Q, J.spine, 0.1 * rise, 0, 0);
      mixP(P, Q, W.air);
      lock -= W.air;
    }
    // iniş esnemesi: pelvis çöker, IK dizleri büker
    if (this.landT < 0.6) {
      const a = this.landK * Math.exp(-this.landT * 7) * Math.min(1, this.landT * 30);
      pel.y -= 0.2 * a;
      addJ(P, J.spine, 0.25 * a, 0, 0); addJ(P, J.shL, 0, 0, 0.25 * a); addJ(P, J.shR, 0, 0, 0.25 * a);
    }

    // ---- 3) silah tutuşu (nişan almıyorken) ----
    const wid = this.weaponMesh ? this.weaponId : null;
    const wdef = wid ? WEAPONS[wid] : null;
    if (wdef && !twoH) {
      Q.set(P);
      if (wid === 'knife') { setJ(Q, J.shR, Q[J.shR * 3] * 0.5 - 0.15, 0, 0.12); setJ(Q, J.elR, -0.75, 0, 0); setJ(Q, J.wrR, -0.9, 0, 0); }
      else if (wid === 'bat') { setJ(Q, J.shR, -0.35, 0, 0.2); setJ(Q, J.elR, -1.75, 0.2, 0); setJ(Q, J.wrR, 0.9, 0, -0.2); }
      else { setJ(Q, J.shR, Q[J.shR * 3] * 0.4 + 0.05, 0, 0.14); setJ(Q, J.elR, -0.4 - this.spd * 0.08, 0, 0); setJ(Q, J.wrR, -0.25, 0, 0); }
      mixJ(P, Q, 1, ARM_R);
    }

    // ---- 4) nişan: gövde bükülmesi ----
    const pitch = clamp(st.aimPitch || 0, -1.2, 1.2), yawO = clamp(st.aimYaw || 0, -1.2, 1.2);
    const wa = Math.max(W.aim, W.hold * 0.25);
    if (wa > 0.001) {
      // nişanda koşu eğilmesi ve göğüs dönüşü azalır
      P[J.chest * 3 + 1] *= 1 - 0.7 * W.aim; P[J.spine * 3 + 1] *= 1 - 0.7 * W.aim;
      addJ(P, J.spine, -pitch * 0.2 * W.aim, yawO * 0.35 * W.aim, 0);
      addJ(P, J.chest, -pitch * 0.3 * W.aim, yawO * 0.35 * W.aim - (twoH ? 0.38 : 0.12) * W.aim, 0);
    }
    const rec = st.recoil || 0;
    if (rec > 0) { addJ(P, J.chest, -0.05 * rec, 0, 0); }

    // ---- 5) konuşma, oturma, dans, eller yukarı, sinme, yüzme ----
    if (W.talk > 0.01) {
      Q.set(P);
      const a = Math.sin(t * 2.3 + this.seed), b = Math.sin(t * 3.1 + this.seed * 1.7), c = Math.sin(t * 0.7 + this.seed), d2 = Math.sin(t * 0.41 + this.seed * 2.3);
      const beat = Math.pow(Math.max(0, Math.sin(t * 4.4 + this.seed)), 3);
      setJ(Q, J.shR, -0.42 + 0.2 * a - 0.15 * beat, 0.15, 0.2); setJ(Q, J.elR, -1.3 + 0.3 * b, 0.35, 0); setJ(Q, J.wrR, -0.25 + 0.25 * b, 0.3 * a, 0.35);
      if (c > 0.1) { setJ(Q, J.shL, -0.3 + 0.2 * b, 0.1, 0.18); setJ(Q, J.elL, -1.15 + 0.25 * a, 0.3, 0); setJ(Q, J.wrL, -0.2, -0.3 * b, 0.3); }
      else if (d2 > 0.3) { setJ(Q, J.shL, 0.05, 0, 0.32); setJ(Q, J.elL, -1.9, 0, 0); setJ(Q, J.wrL, 0.2, 0, -0.4); } // el belde
      mixJ(P, Q, W.talk * (1 - W.aim), ARMS);
      this.headNod = 0.06 * beat * W.talk;
    } else this.headNod = 0;
    let ikW = (1 - W.air) * (1 - W.swim) * (1 - W.sit) * (1 - W.dance);
    if (W.sit > 0.01) {
      Q.set(P);
      for (const [h, k, an] of [[J.hipL, J.knL, J.anL], [J.hipR, J.knR, J.anR]]) { setJ(Q, h, -1.5, 0, 0.08); setJ(Q, k, 1.45, 0, 0); setJ(Q, an, 0.05, 0, 0); }
      setJ(Q, J.hips, 0, 0, 0); setJ(Q, J.spine, -0.04, 0, 0); setJ(Q, J.chest, 0.06 + 0.012 * br, 0, 0);
      if (W.talk < 0.5 && W.phone < 0.5) { setJ(Q, J.shL, -0.5, 0, 0.12); setJ(Q, J.shR, -0.5, 0, 0.12); setJ(Q, J.elL, -0.85, 0, 0); setJ(Q, J.elR, -0.85, 0, 0); }
      mixP(P, Q, W.sit, 0, HP);
    }
    if (W.dance > 0.01) {
      Q.set(P);
      const b = Math.abs(Math.sin(t * 6 + this.seed)), s2 = Math.sin(t * 3 + this.seed);
      for (const [h, k, an] of [[J.hipL, J.knL, J.anL], [J.hipR, J.knR, J.anR]]) { setJ(Q, h, -0.2 - 0.25 * b, 0, 0.1); setJ(Q, k, 0.35 + 0.5 * b, 0, 0); setJ(Q, an, -0.15 - 0.25 * b, 0, 0); }
      setJ(Q, J.hips, 0, 0.3 * s2, 0.12 * s2); setJ(Q, J.chest, 0.1, -0.3 * s2, -0.1 * s2);
      setJ(Q, J.shL, -2.4 + 0.5 * Math.sin(t * 6 + this.seed), 0, 0.3); setJ(Q, J.shR, -2.4 - 0.5 * Math.sin(t * 6 + this.seed), 0, 0.3);
      setJ(Q, J.elL, -0.6, 0, 0); setJ(Q, J.elR, -0.6, 0, 0); setJ(Q, J.head, 0.15 * b, 0, 0.1 * s2);
      mixP(P, Q, W.dance, 0, HP);
    }
    if (W.up > 0.01) {
      Q.set(P);
      const tr = 0.03 * Math.sin(t * 17 + this.seed);
      setJ(Q, J.shL, -0.25, 0, 2.4 + tr); setJ(Q, J.shR, -0.25, 0, 2.4 - tr); setJ(Q, J.elL, -0.85, 0, 0); setJ(Q, J.elR, -0.85, 0, 0);
      setJ(Q, J.wrL, 0.2, 0, 0); setJ(Q, J.wrR, 0.2, 0, 0);
      mixJ(P, Q, W.up, ARMS);
      addJ(P, J.chest, -0.06 * W.up, 0, 0);
    }
    if (W.cower > 0.01) {
      Q.set(P);
      const tr = 0.04 * Math.sin(t * 19 + this.seed);
      setJ(Q, J.shL, -2.0 + tr, 0.4, 0.55); setJ(Q, J.shR, -2.0 - tr, 0.4, 0.55); setJ(Q, J.elL, -2.2, 0, 0); setJ(Q, J.elR, -2.2, 0, 0);
      setJ(Q, J.wrL, -0.3, 0, 0); setJ(Q, J.wrR, -0.3, 0, 0);
      mixJ(P, Q, W.cower, ARMS);
      addJ(P, J.spine, 0.35 * W.cower, 0, 0); addJ(P, J.chest, 0.25 * W.cower, 0, 0);
      fistW[0] = fistW[1] = W.cower * 0.6;
    }
    if (W.swim > 0.01) {
      Q.fill(0);
      const mv = clamp(this.spd / 1.2, 0, 1);
      const c = t * 3.2 + this.seed;
      const sc2 = Math.sin(c);
      setJ(Q, J.hips, 1.3 * mv + 0.18 * (1 - mv), 0, 0);
      setJ(Q, J.spine, -0.15 * mv, 0, 0); setJ(Q, J.chest, -0.25 * mv, 0, 0); setJ(Q, J.head, -0.6 * mv, 0, 0);
      const ax = -2.6 + 0.6 * sc2, az = 0.3 + 0.9 * Math.max(0, sc2), el = -0.3 - 1.0 * Math.max(0, -sc2);
      for (const [sh2, e] of [[J.shL, J.elL], [J.shR, J.elR]]) { setJ(Q, sh2, ax * mv + (-0.4 + 0.3 * sc2) * (1 - mv), 0, az * mv + 0.9 * (1 - mv)); setJ(Q, e, el * mv - 0.6 * (1 - mv), 0, 0); }
      for (const [h, k, an, s] of [[J.hipL, J.knL, J.anL, 1], [J.hipR, J.knR, J.anR, -1]]) {
        const kk = Math.max(0, Math.sin(c + Math.PI / 2));
        setJ(Q, h, -0.6 * kk * mv + (-0.4 + 0.4 * Math.sin(c * 1.3 + s)) * (1 - mv), 0, 0.4 * kk * mv);
        setJ(Q, k, 1.4 * kk * mv + (0.7 + 0.3 * Math.sin(c * 1.3 + s)) * (1 - mv), 0, 0); setJ(Q, an, 0.6, 0, 0);
      }
      mixP(P, Q, W.swim);
      lock -= W.swim;
      hipsY += (-0.55 * (1 - mv) + (0.12 - RIG.hips + 0.95) * mv - 0.95 + RIG.hips) * W.swim;
    }

    // ---- 6) yakın dövüş ----
    let meleeW = 0;
    if (this.punchT > 0) {
      this.punchT = Math.max(0, this.punchT - dt);
      const u = 1 - this.punchT / this.meleeDur;
      const e = u < 0.3 ? -0.35 * sm(u / 0.3) : u < 0.55 ? -0.35 + 1.35 * sm((u - 0.3) / 0.25) : 1 - sm((u - 0.55) / 0.45);
      meleeW = clamp(Math.sin(Math.PI * clamp(u, 0, 1)) * 1.4, 0, 1);
      Q.set(P);
      const k = this.meleeKind;
      const ee = Math.max(0, e);
      if (k === 'R' || k === 'L') {
        const [sh2, el, wr, osh, oel] = k === 'R' ? [J.shR, J.elR, J.wrR, J.shL, J.elL] : [J.shL, J.elL, J.wrL, J.shR, J.elR];
        setJ(Q, sh2, -0.75 - 0.85 * ee + 0.3 * Math.min(0, e), 0, 0.25 - 0.2 * ee); setJ(Q, el, -1.9 + 1.75 * ee, 0, 0); setJ(Q, wr, 0, 0, 0);
        setJ(Q, osh, -0.9, 0, 0.2); setJ(Q, oel, -2.0, 0, 0);
        const tw = (k === 'R' ? 1 : -1) * (0.55 * e);
        setJ(Q, J.chest, 0.08, tw, 0); setJ(Q, J.spine, 0.05, tw * 0.5, 0);
        pel.z += 0.06 * ee; pel.y -= 0.025 * ee;
      } else if (k === 'hook') {
        const sw = u < 0.35 ? -sm(u / 0.35) : -1 + 2 * sm((u - 0.35) / 0.3);
        setJ(Q, J.shR, -1.35, 0, 0.9 - 0.2 * ee); setJ(Q, J.elR, -1.6, 0, 0); setJ(Q, J.wrR, 0, 0, 0);
        setJ(Q, J.shL, -0.9, 0, 0.2); setJ(Q, J.elL, -2.0, 0, 0);
        setJ(Q, J.chest, 0.1, 0.7 * sw, 0); setJ(Q, J.spine, 0.06, 0.35 * sw, 0); setJ(Q, J.hips, 0, 0.2 * sw, 0);
        pel.y -= 0.04 * ee;
      } else if (k === 'stab') {
        setJ(Q, J.shR, -0.5 - 0.95 * ee, 0, 0.15); setJ(Q, J.elR, -1.6 + 1.45 * ee, 0, 0); setJ(Q, J.wrR, -1.3 + 0.2 * ee, 0, 0);
        setJ(Q, J.chest, 0.15 * ee, 0.4 * e, 0); setJ(Q, J.spine, 0.1 * ee, 0.2 * e, 0);
        pel.z += 0.08 * ee; pel.y -= 0.03 * ee;
      } else {
        const big = k === 'bat' ? 1.4 : 1;
        const sweep = u < 0.3 ? sm(u / 0.3) : 1 - 2 * sm((u - 0.3) / 0.35);
        setJ(Q, J.shR, -1.25, 0, 0.35 + 0.85 * sweep * big); setJ(Q, J.elR, -0.45, 0, 0); setJ(Q, J.wrR, k === 'bat' ? -1.2 : -1.0, 0, 0);
        if (k === 'bat') { setJ(Q, J.shL, -1.1, 0, -0.1 + 0.4 * sweep); setJ(Q, J.elL, -1.2, 0, 0); }
        setJ(Q, J.chest, 0.05, 0.65 * sweep * big, 0); setJ(Q, J.spine, 0.05, 0.3 * sweep * big, 0); setJ(Q, J.hips, 0, 0.15 * sweep * big, 0);
        pel.y -= 0.03 * Math.abs(sweep);
      }
      mixP(P, Q, meleeW, J.hips * 3, J.wrR * 3 + 3);
      if (k === 'R' || k === 'L' || k === 'hook') { fistW[0] = 1; fistW[1] = 1; }
    }

    // ---- 7) tırmanma (engel aşma) ve takla ----
    if (st.vault > 0) {
      const u = st.vault, s1 = Math.sin(Math.PI * u);
      const plant = smR(0.1, 0.35, u) * (1 - smR(0.6, 0.85, u));
      setJ(P, J.hipL, -1.25 * s1, 0, 0.45 * s1); setJ(P, J.hipR, -1.0 * s1, 0, 0.55 * s1);
      setJ(P, J.knL, 1.8 * s1, 0, 0); setJ(P, J.knR, 1.6 * s1, 0, 0);
      setJ(P, J.anL, 0.3 * s1, 0, 0); setJ(P, J.anR, 0.3 * s1, 0, 0);
      setJ(P, J.shL, -0.9 * plant - 0.3 * s1, 0, 0.15); setJ(P, J.elL, -0.15, 0, 0); setJ(P, J.wrL, 0.9 * plant, 0, 0);
      if (!this.weaponMesh) { setJ(P, J.shR, -0.6 * s1, 0, 0.4 * s1); setJ(P, J.elR, -0.5, 0, 0); }
      addJ(P, J.spine, 0.3 * s1, 0, -0.2 * s1); addJ(P, J.hips, 0, 0, -0.25 * s1); addJ(P, J.chest, 0.15 * s1, 0.2 * s1, 0);
      lock = 0; ikW = 0;
    }
    let rollW = 0;
    if (st.roll > 0) {
      const u = st.roll, tuck = Math.sin(Math.PI * u);
      rollW = 1;
      for (const [h, k] of [[J.hipL, J.knL], [J.hipR, J.knR]]) { setJ(P, h, P[h * 3] * (1 - tuck) - 2.0 * tuck, 0, 0.1); setJ(P, k, P[k * 3] * (1 - tuck) + 2.3 * tuck, 0, 0); }
      addJ(P, J.spine, 0.7 * tuck, 0, 0); addJ(P, J.chest, 0.3 * tuck, 0, 0); addJ(P, J.head, 0.6 * tuck, 0, 0);
      setJ(P, J.shL, -1.0 * tuck, 0, 0.2); setJ(P, J.shR, -1.0 * tuck, 0, 0.2); setJ(P, J.elL, -1.3 * tuck, 0, 0); setJ(P, J.elR, -1.3 * tuck, 0, 0);
      P[J.hips * 3] = Math.PI * 2 * sm(u);
      lock = 0; hipsY = RIG.hips - 0.5 * tuck; ikW = 0;
    }

    // ---- 8) vuruş sarsılması (yay) + yönlü irkilme ----
    const Fl = this.fl;
    Fl.vx += (-140 * Fl.x - 13 * Fl.vx) * dt; Fl.vz += (-140 * Fl.z - 13 * Fl.vz) * dt;
    Fl.x += Fl.vx * dt; Fl.z += Fl.vz * dt;
    if (Math.abs(Fl.x) + Math.abs(Fl.z) > 0.002) {
      const m = Math.min(1, Math.hypot(Fl.x, Fl.z));
      addJ(P, J.spine, Fl.z * 0.35, 0, -Fl.x * 0.3); addJ(P, J.chest, Fl.z * 0.3, Fl.x * 0.2 * (this.hitSide || 1), -Fl.x * 0.25);
      addJ(P, J.shL, -0.2 * m, 0, 0.35 * m); addJ(P, J.shR, -0.2 * m, 0, 0.35 * m);
      pel.x -= Fl.x * 0.05; pel.z -= Fl.z * 0.05;
    }

    // ---- baş: sabitleme + bakış ----
    {
      const hx = P[J.hips * 3] + P[J.spine * 3] + P[J.chest * 3];
      const hyw = P[J.hips * 3 + 1] + P[J.spine * 3 + 1] + P[J.chest * 3 + 1];
      const hz = P[J.hips * 3 + 2] + P[J.spine * 3 + 2] + P[J.chest * 3 + 2];
      let hp = -hx * 0.82 + this.lookPitch + this.headNod - 0.15 * wc - 0.25 * W.cower + 0.25 * W.phone;
      let hyaw = -hyw * 0.85 + this.lookYaw;
      let hr = -hz * 0.6;
      if (W.aim > 0.001) { hp += -pitch * 0.4 * W.aim; hyaw += (yawO * 0.3 + (twoH ? 0.36 : 0.1)) * W.aim; }
      if (rec > 0) hp -= 0.03 * rec;
      if (Math.abs(Fl.x) + Math.abs(Fl.z) > 0.002) { hp += Fl.z * 0.5; hr -= Fl.x * 0.45; }
      if (age > 0.3) hp -= 0.08 * smR(0.3, 1, age); // kamburda yüz öne
      if (st.roll > 0) hp += 0.6 * Math.sin(Math.PI * st.roll);
      const hb = W.dance > 0.01 ? P[J.head * 3] : 0;
      setJ(P, J.neck, hp * 0.4, hyaw * 0.45, hr * 0.4);
      setJ(P, J.head, hp * 0.6 + hb, hyaw * 0.55, hr * 0.6);
    }
    // ayak parmakları (FK)
    P[J.toeL * 3] = F[0].toe * ikW; P[J.toeR * 3] = F[1].toe * ikW;

    // ---- uygula ----
    lock = clamp(lock, 0, 1);
    if (ikW > 0.999) lock = 0;
    this.apply(P, lock * (1 - ikW), hipsY, ikW);
    // ---- bacak IK (vücut uzayı) ----
    if (ikW > 0.01) {
      const toeOut = 0.12 - 0.08 * run;
      for (let i = 0; i < 2; i++) { const Fi = F[i]; this.legIK(i, Fi.x, Fi.y, Fi.z, Fi.p, (i === 0 ? 1 : -1) * toeOut, ikW); }
    }
    // ---- kol IK: silah tutuşu / nişan / şarjör ----
    const block = Math.max(W.swim, W.up, W.cower, W.sit * (1 - W.aim), W.dance, meleeW, rollW, st.vault > 0 ? 1 : 0);
    const gunW = wdef && wdef.type !== 'melee' ? 1 - block : 0;
    if (gunW > 0.01) this.solveWeaponIK(st, wid, wdef, twoH, gunW, pitch, yawO, rec);
    // ---- eller ----
    const relaxed = 0.28 + 0.35 * run + 0.2 * wc;
    const cr = this._cr || (this._cr = [0, 0]);
    cr[0] = Math.max(relaxed, fistW[0]); cr[1] = Math.max(relaxed, fistW[1]);
    if (this.weaponMesh) cr[1] = 0.85;
    if (twoH && gunW > 0.5) cr[0] = 0.8;
    if (this.look.carry === 'briefcase' && !this.weaponMesh) cr[1] = 0.9;
    if (this.look.tespih) cr[0] = Math.max(cr[0], 0.55);
    if (W.phone > 0.3) cr[1] = Math.max(cr[1], 0.55);
    if (W.smoke > 0.3) cr[1] = Math.max(cr[1], 0.4);
    if (W.up > 0.5) { cr[0] = 0.05; cr[1] = this.weaponMesh ? 0.85 : 0.05; }
    this.applyHands(dt, cr);
    this.updateProps();
  }

  // boşta varyasyonları + NPC kişilik davranışları (telefon, sigara, kollar kavuşturma, saat bakma, etrafa bakma)
  idleLayer(dt, st, idle, twoH) {
    const W = this.w, P = this.P, Q = this.Q, t = this.time;
    const busy = st.aim || this.weaponMesh || W.talk > 0.3 || W.sit > 0.5 || W.up > 0.1 || W.cower > 0.1 || W.swim > 0.1 || W.dance > 0.1 || st.crouch;
    const pers = (this.seed * 7.13) % 1; // kişilik
    const isP = !!st.isPlayer;
    if (idle > 0.9 && !busy) this.idleTime += dt; else this.idleTime = 0;
    // varyasyon seçimi
    this.idleNext -= dt;
    if (this.idleVar && (this.idleVarT -= dt) <= 0) this.idleVar = null;
    if (!this.idleVar && this.idleNext <= 0 && this.idleTime > 1.5) {
      const r = Math.random();
      const opts = isP ? ['look', 'look', 'watch', 'neck', 'shift'] : ['look', 'look', 'watch', 'neck', 'cross', 'behind', 'shift'];
      this.idleVar = opts[Math.floor(r * opts.length)];
      this.idleVarT = this.idleVar === 'cross' || this.idleVar === 'behind' ? 4 + Math.random() * 5 : 1.8 + Math.random() * 1.5;
      this.idleNext = 5 + Math.random() * 9;
      if (this.idleVar === 'look') { this.lookTY = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.6); this.lookTP = (Math.random() - 0.5) * 0.25; }
    }
    if (busy || idle < 0.5) this.idleVar = this.idleVar === 'look' ? this.idleVar : null;
    // kişilik: telefon / sigara (NPC; boştayken ya da yavaş yürürken telefon)
    const phoneWant = !isP && !busy && (st.phone || (pers < 0.22 && (idle > 0.5 || this.spd < 1.6) && Math.sin(t * 0.05 + this.seed) > -0.3));
    const smokeWant = !isP && !busy && !phoneWant && (st.smoke || (pers > 0.86 && idle > 0.5));
    W.phone = dmp(W.phone, phoneWant ? 1 : 0, 4, dt);
    W.smoke = dmp(W.smoke, smokeWant ? 1 : 0, 3, dt);
    W.cross = dmp(W.cross, this.idleVar === 'cross' && !busy ? 1 : 0, 3, dt);
    W.behind = dmp(W.behind, this.idleVar === 'behind' && !busy ? 1 : 0, 3, dt);
    W.watch = dmp(W.watch, this.idleVar === 'watch' && !busy ? 1 : 0, 5, dt);
    // bakış: rastgele baş çevirme (yürürken de hafif)
    const lk = this.idleVar === 'look' ? 1 : 0;
    this.lookT -= dt;
    if (this.lookT <= 0) { this.lookT = 2 + Math.random() * 4; if (!lk) { this.lookTY = (Math.random() - 0.5) * (idle > 0.5 ? 0.5 : 0.25); this.lookTP = (Math.random() - 0.5) * 0.1; } }
    const allowLook = !st.aim && W.talk < 0.5;
    this.lookYaw = dmp(this.lookYaw, allowLook ? this.lookTY * (lk ? 1 : 0.6) : 0, 2.5, dt);
    this.lookPitch = dmp(this.lookPitch, allowLook ? this.lookTP : 0, 2.5, dt);
    if (this.idleVar === 'neck') { const u = 1 - this.idleVarT / 2.5; addJ(P, J.neck, 0.05 * Math.sin(u * 6.28), 0, 0.25 * Math.sin(u * 6.28) * sm(u * 4) * sm((1 - u) * 4)); }
    // kol pozları
    if (W.phone > 0.01) {
      Q.set(P);
      setJ(Q, J.shR, -0.35, 0.25, 0.12); setJ(Q, J.elR, -1.95, 0.1, 0); setJ(Q, J.wrR, 0.25, -0.4, 0.25);
      if (Math.sin(t * 0.3 + this.seed) > 0) { setJ(Q, J.shL, -0.3, 0.3, 0.1); setJ(Q, J.elL, -1.7, 0, 0); setJ(Q, J.wrL, 0.2, 0.3, -0.2); }
      mixJ(P, Q, W.phone, ARMS);
      this.lookPitch = dmp(this.lookPitch, 0.2, 3, dt);
    }
    if (W.smoke > 0.01) {
      Q.set(P);
      // her ~5 sn elini ağzına götürür
      const c = fract(t / 5.5 + this.seed), up = sm(c / 0.12) * (1 - sm((c - 0.3) / 0.12));
      setJ(Q, J.shR, -0.2 - 0.55 * up, 0.2 * up, 0.15 + 0.3 * up); setJ(Q, J.elR, -0.5 - 1.7 * up, 0.3, 0); setJ(Q, J.wrR, 0.1, 0, 0.3 * up);
      setJ(Q, J.shL, 0.05, 0, 0.22); setJ(Q, J.elL, -1.65, 0, 0); setJ(Q, J.wrL, 0.3, 0, -0.3); // sol el belde
      mixJ(P, Q, W.smoke, ARMS);
      this.smokeUp = up;
    }
    if (W.cross > 0.01) {
      Q.set(P);
      setJ(Q, J.shL, -0.5, 0.55, 0.28); setJ(Q, J.elL, -1.95, 0.25, 0); setJ(Q, J.wrL, 0, 0, 0.2);
      setJ(Q, J.shR, -0.42, 0.6, 0.3); setJ(Q, J.elR, -1.9, 0.2, 0); setJ(Q, J.wrR, 0, 0, 0.2);
      mixJ(P, Q, W.cross, ARMS);
    }
    if (W.behind > 0.01) {
      Q.set(P);
      setJ(Q, J.shL, 0.35, -0.3, 0.12); setJ(Q, J.elL, -0.8, 0, 0); setJ(Q, J.shR, 0.35, -0.3, 0.12); setJ(Q, J.elR, -0.85, 0, 0);
      mixJ(P, Q, W.behind, ARMS);
    }
    if (W.watch > 0.01) {
      Q.set(P);
      setJ(Q, J.shL, -0.55, 0.5, 0.15); setJ(Q, J.elL, -1.75, 0, 0); setJ(Q, J.wrL, 0, -1.2, 0);
      mixJ(P, Q, W.watch, ARM_L);
      this.lookPitch = dmp(this.lookPitch, 0.3 * W.watch, 4, dt); this.lookYaw = dmp(this.lookYaw, 0.35 * W.watch, 4, dt);
    }
  }

  // telefon / sigara aksesuarları
  updateProps() {
    const W = this.w;
    const needPhone = W.phone > 0.5, needCig = W.smoke > 0.4;
    if (needPhone && !this.phoneMesh) {
      const pr = props();
      this.phoneMesh = new THREE.Mesh(pr.phone, pr.phoneMat);
      this.phoneMesh.position.set(0.012, -0.085, 0.02); this.phoneMesh.rotation.set(0.2, 0, 0.1);
      this.arms[1].wr.add(this.phoneMesh);
    }
    if (this.phoneMesh) this.phoneMesh.visible = needPhone && this.lod !== 2;
    if (needCig && !this.cigMesh) {
      const pr = props();
      this.cigMesh = new THREE.Mesh(pr.cig, pr.cigMat);
      this.cigMesh.position.set(0.008, -0.135, 0.012); this.cigMesh.rotation.set(0, 0.4, 0);
      this.arms[1].fd.add(this.cigMesh);
    }
    if (this.cigMesh) this.cigMesh.visible = needCig && this.lod !== 2;
  }

  // parmak bükümü (0 açık, 1 yumruk)
  applyHands(dt, want) {
    for (let i = 0; i < 2; i++) {
      this.curl[i] = dmp(this.curl[i], want[i], 14, dt);
      const a = this.arms[i], s = a.s, c = this.curl[i];
      a.fi.rotation.set(0, 0, -s * c * 1.5);
      a.fd.rotation.set(0, 0, -s * c * 1.45);
      a.th.rotation.set(0.35 * c, -s * 0.2 * c, -s * c * 0.85);
    }
  }

  // pozu kemiklere yaz; FK durumlarında kalça yüksekliği bacaklardan hesaplanır (ayak yere basar)
  apply(P, lock, hipsY = RIG.hips, ikW = 0) {
    const J3 = this.joints;
    for (let j = 0; j < NJ; j++) {
      const s = SIDE[j] || 1;
      J3[j].rotation.set(P[j * 3], P[j * 3 + 1] * s, P[j * 3 + 2] * s);
    }
    let y = hipsY + P[HP + 1];
    if (lock > 0) {
      const h = (a, k, z) => (LEN_T * Math.cos(a) + LEN_S * Math.cos(a + k)) * Math.cos(z);
      const hl = h(P[J.hipL * 3], P[J.knL * 3], P[J.hipL * 3 + 2]), hr = h(P[J.hipR * 3], P[J.knR * 3], P[J.hipR * 3 + 2]);
      const auto = RIG.hips - (LEN_T + LEN_S) + Math.max(hl, hr);
      y += (auto - RIG.hips) * lock;
    }
    let x = P[HP], z = P[HP + 2];
    if (ikW > 0) {
      const pl = this.pel;
      // erişilemeyen duruş ayağı için pelvisi indir (aşırı gerilme / sıçrama olmasın)
      let py = RIG.hips + pl.y;
      const pyMin = py - 0.045;
      for (let i = 0; i < 2; i++) {
        const Fi = this.feet[i], hx = (i === 0 ? 1 : -1) * this.hipX;
        const dx = Fi.x - (hx + pl.x), dz = Fi.z - pl.z, reach = (LEN_T + LEN_S) * 0.985;
        const hy = Fi.y + Math.sqrt(Math.max(0, reach * reach - dx * dx - dz * dz)) + 0.03;
        if (py > hy) py = hy;
      }
      if (py < pyMin) py = pyMin;
      x += pl.x * ikW; z += pl.z * ikW;
      y = y * (1 - ikW) + py * ikW;
    }
    this.hips.position.set(x, y, z);
  }

  // iki kemikli analitik bacak IK'sı vücut uzayında (dünya matrisi gerekmez)
  legIK(i, tx, ty, tz, pitch, toeOut, w) {
    const leg = this.legs[i], H = this.hips, G = LG;
    G.S.copy(leg.hip.position).applyQuaternion(H.quaternion).add(H.position);
    G.T.set(tx, ty, tz);
    G.d.subVectors(G.T, G.S);
    let d = G.d.length();
    const L1 = LEN_T, L2 = LEN_S;
    G.d.divideScalar(d || 1);
    d = clamp(d, 0.12, L1 + L2 - 0.002);
    const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    G.pole.set(Math.sin(toeOut), 0, Math.cos(toeOut));
    G.bv.copy(G.pole).addScaledVector(G.d, -G.pole.dot(G.d));
    if (G.bv.lengthSq() < 1e-6) G.bv.set(0, 0, 1); G.bv.normalize();
    G.u.copy(G.d).multiplyScalar(cosA).addScaledVector(G.bv, sinA);
    G.K.copy(G.S).addScaledVector(G.u, L1);
    G.T.copy(G.S).addScaledVector(G.d, d);
    G.w.subVectors(G.T, G.K).normalize();
    G.Y.copy(G.u).negate();
    G.Z.copy(G.w).addScaledVector(G.u, -G.w.dot(G.u)).negate();
    if (G.Z.lengthSq() < 1e-8) G.Z.copy(G.bv); G.Z.normalize();
    G.X.crossVectors(G.Y, G.Z);
    G.m.makeBasis(G.X, G.Y, G.Z); G.qT.setFromRotationMatrix(G.m);
    G.qi.copy(H.quaternion).invert();
    G.qL.copy(G.qi).multiply(G.qT);
    leg.hip.quaternion.slerp(G.qL, w);
    const bend = Math.acos(clamp(G.u.dot(G.w), -1, 1));
    G.qK.setFromEuler(G.e.set(bend, 0, 0));
    leg.kn.quaternion.slerp(G.qK, w);
    // ayak: vücut uzayında hedef eğim + dışa açı
    G.qF.setFromEuler(G.e.set(pitch, toeOut, 0, 'YXZ'));
    G.qi.copy(G.qT).multiply(G.qK).invert().multiply(G.qF);
    leg.an.quaternion.slerp(G.qi, w);
  }

  poseDeath(P, T) {
    const d = this.deathDir || { x: 0, z: -1 };
    const fx = d.x, fz = d.z;
    const buckle = sm(T / 0.25);
    const fu = clamp((T - 0.1) / 0.55, 0, 1);
    let th = (Math.PI / 2) * fu * fu;
    if (fu >= 1) { const tb = T - 0.65; th -= 0.1 * Math.exp(-tb * 7) * Math.abs(Math.sin(tb * 14)); }
    const settle = sm((T - 0.35) / 0.7);
    const Q = this.Q; Q.fill(0);
    const wb = Math.max(0, -fz), wf = Math.max(0, fz), ws = Math.abs(fx);
    const tot = wb + wf + ws || 1;
    const b = wb / tot, f = wf / tot, s = ws / tot;
    const sg = this.seed % 2 > 1 ? 1 : -1;
    setJ(Q, J.shL, -0.3 * b - 0.6 * f - 1.0 * s, 0, 1.3 * b + 1.0 * f + 0.4 * s); setJ(Q, J.shR, -0.3 * b - 0.4 * f - 0.6 * s, 0, 1.1 * b + 0.6 * f + 0.2 * s);
    setJ(Q, J.elL, -0.5 * b - 1.2 * f - 0.6 * s, 0, 0); setJ(Q, J.elR, -0.3 * b - 0.4 * f - 0.9 * s, 0, 0);
    setJ(Q, J.hipL, -0.05 * b - 0.5 * s, 0, 0.14 * b + 0.1 * f); setJ(Q, J.hipR, -0.35 * b - 0.2 * s, 0, 0.1);
    setJ(Q, J.knL, 0.15 * b + 0.9 * s + 0.1 * f, 0, 0); setJ(Q, J.knR, 0.7 * b + 0.5 * s + 0.4 * f, 0, 0);
    setJ(Q, J.anL, 0.3 + 0.4 * f, 0, 0); setJ(Q, J.anR, 0.3 + 0.4 * f, 0, 0);
    setJ(Q, J.head, -0.1 * b + 0.06 * f, 0.45 * sg * (b + f), 0.18 * s);
    setJ(Q, J.neck, -0.05 * b + 0.04 * f, 0.3 * sg * (b + f), 0.12 * s);
    setJ(Q, J.spine, 0.2 * s, 0, 0);
    for (let i = 0; i < HP; i++) P[i] = this.D0[i] + (Q[i] - this.D0[i]) * clamp(settle + 0.08 * Math.sin(settle * Math.PI) * Math.sin(T * 9), 0, 1.05);
    const crumple = buckle * (1 - fu);
    addJ(P, J.knL, 0.8 * crumple, 0, 0); addJ(P, J.knR, 0.8 * crumple, 0, 0); addJ(P, J.hipL, -0.4 * crumple, 0, 0); addJ(P, J.hipR, -0.4 * crumple, 0, 0);
    addJ(P, J.spine, 0.3 * crumple * (f - b), 0, 0); addJ(P, J.head, 0.4 * crumple * (f - b), 0, 0);
    P[J.hips * 3] = th * fz; P[J.hips * 3 + 1] = 0; P[J.hips * 3 + 2] = -th * fx;
    const H = 0.82 - 0.2 * crumple;
    P[HP] = fx * H * Math.sin(th); P[HP + 2] = fz * H * Math.sin(th);
    P[HP + 1] = 0.13 + H * Math.cos(th) - RIG.hips;
  }

  // ölüm sonrası yere yerleşme: uçlar (baş, eller, ayaklar, dizler) yerden yüksekse ebeveyn eklemini yere doğru döndür,
  // gömülüyse yukarı it (yerçekimi + zemin kısıtı; basit kemik gevşetmesi)
  settleDeath(dt) {
    if (this.deadT < 0.6) return;
    const DS = this.DS, S = this.chain || (this.chain = [
      [this.arms[0].wr, J.shL, 0.04, 0], [this.arms[1].wr, J.shR, 0.04, 0], [this.arms[0].el, J.shL, 0.05, 2], [this.arms[1].el, J.shR, 0.05, 2],
      [this.head, J.neck, 0.1, 0], [this.legs[0].kn, J.hipL, 0.055, 0], [this.legs[1].kn, J.hipR, 0.055, 0], [this.legs[0].an, J.knL, 0.05, 0], [this.legs[1].an, J.knR, 0.05, 0],
    ]);
    this.root.updateMatrixWorld(true);
    const gy = this.root.matrixWorld.elements[13];
    const rate = Math.min(1, dt * 6);
    for (const [bone, ch, rad, ax] of S) {
      bone.getWorldPosition(DTMP);
      const h = DTMP.y - gy - rad;
      if (Math.abs(h) < 0.015) continue;
      // sayısal türev: kanal +eps ile yüksekliğin değişimi
      const jb = this.joints[ch], k = ch * 3 + ax, s = SIDE[ch] || 1;
      const eps = 0.05;
      const old = ax === 0 ? jb.rotation.x : ax === 1 ? jb.rotation.y : jb.rotation.z;
      if (ax === 0) jb.rotation.x = old + eps; else if (ax === 1) jb.rotation.y = old + eps * s; else jb.rotation.z = old + eps * s;
      jb.updateMatrixWorld(true);
      bone.getWorldPosition(IK.W);
      if (ax === 0) jb.rotation.x = old; else if (ax === 1) jb.rotation.y = old; else jb.rotation.z = old;
      jb.updateMatrixWorld(true);
      const grad = (IK.W.y - DTMP.y) / eps;
      if (Math.abs(grad) < 0.02) continue;
      // yerdeyse yukarı (gömülme), havadaysa yerçekimiyle aşağı
      const target = h < 0 ? -h : -Math.min(h, 0.25) * (h > 0 ? 0.5 : 1);
      DS[k] += clamp(target / grad, -0.3, 0.3) * rate;
      DS[k] = clamp(DS[k], -1.4, 1.4);
    }
  }

  // İki kemikli analitik IK (dünya uzayı) — kollar
  solveArm(arm, T, pole, qWrist, w) {
    const S = arm.sh.getWorldPosition(IK.S), E0 = arm.el.getWorldPosition(IK.E), W0 = arm.wr.getWorldPosition(IK.W);
    const L1 = S.distanceTo(E0), L2 = E0.distanceTo(W0);
    const dir = IK.d.subVectors(T, S); let d = dir.length(); dir.divideScalar(d || 1);
    d = clamp(d, Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
    const A = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const bv = IK.b.subVectors(pole, S); bv.addScaledVector(dir, -bv.dot(dir));
    if (bv.lengthSq() < 1e-8) bv.set(0, -1, 0); bv.normalize();
    const u = IK.u.copy(dir).multiplyScalar(Math.cos(A)).addScaledVector(bv, Math.sin(A)).normalize();
    const elb = IK.e.copy(S).addScaledVector(u, L1);
    const fdir = IK.f.copy(S).addScaledVector(dir, d).sub(elb).normalize();
    const bend = Math.acos(clamp(u.dot(fdir), -1, 1));
    const Y = IK.y.copy(u).negate();
    const Z = IK.z.copy(fdir).addScaledVector(u, -fdir.dot(u));
    if (Z.lengthSq() < 1e-8) Z.copy(bv); Z.normalize();
    const X = IK.x.crossVectors(Y, Z);
    IK.m.makeBasis(X, Y, Z); IK.qw.setFromRotationMatrix(IK.m);
    arm.sh.parent.getWorldQuaternion(IK.q1);
    IK.q2.copy(IK.q1).invert().multiply(IK.qw);
    arm.sh.quaternion.slerp(IK.q2, w);
    IK.q3.setFromEuler(_eu.set(-bend, 0, 0));
    arm.el.quaternion.slerp(IK.q3, w);
    if (qWrist) {
      IK.q4.copy(IK.q1).multiply(arm.sh.quaternion).multiply(arm.el.quaternion).invert().multiply(qWrist);
      arm.wr.quaternion.slerp(IK.q4, w);
    }
    arm.wr.updateMatrixWorld(true);
  }

  solveWeaponIK(st, wid, wdef, twoH, gunW, pitch, yawO, rec) {
    const W = this.w, V = WV;
    this.root.updateMatrixWorld(true);
    const ry = this.root.rotation.y, h = ry + yawO * W.aim;
    const aimP = wid === 'rpg' ? Math.max(pitch, -0.2) : pitch;
    const aimDir = V.aim.set(Math.sin(h) * Math.cos(aimP), Math.sin(aimP), Math.cos(h) * Math.cos(aimP));
    if (rec > 0) aimDir.y += rec * 0.18;
    const fwd = V.fwd.set(Math.sin(ry), 0, Math.cos(ry));
    const right = V.right.crossVectors(fwd, UPV).normalize();
    const reload = clamp(st.reload || 0, 0, 1), rw = W.reload * Math.sin(Math.PI * reload);
    const aimK = wid === 'rpg' ? 1 : W.aim;
    const dir = V.dir.copy(fwd).multiplyScalar(0.72).addScaledVector(UPV, -0.55).addScaledVector(right, -0.3).normalize().lerp(aimDir, aimK).normalize();
    if (rw > 0) dir.addScaledVector(UPV, -0.5 * rw).addScaledVector(right, -0.25 * rw).normalize();
    const R = V.R.crossVectors(dir, UPV).normalize();
    const U = V.U.crossVectors(R, dir).normalize();
    const eye = this.head.localToWorld(V.eye.set(0, 0.127, 0.07));
    const shR = this.arms[1].sh.getWorldPosition(V.shR);
    const G = V.G;
    const bs = this.body.scale.x;
    if (twoH) {
      if (wid === 'rpg') G.copy(eye).addScaledVector(dir, 0.1 * bs).addScaledVector(R, 0.13 * bs).addScaledVector(U, -0.11 * bs);
      else G.copy(eye).addScaledVector(dir, 0.24 * bs).addScaledVector(R, 0.07 * bs).addScaledVector(U, -0.13 * bs);
      if (aimK < 1) { V.t.copy(shR).addScaledVector(UPV, -0.24 * bs).addScaledVector(fwd, 0.2 * bs).addScaledVector(right, 0.03); G.lerp(V.t, 1 - aimK); }
    } else {
      G.copy(eye).addScaledVector(dir, (wid === 'uzi' ? 0.44 : 0.47) * bs).addScaledVector(R, (wid === 'uzi' ? 0.11 : 0.025) * bs).addScaledVector(U, -0.1 * bs);
      if (rw > 0) { V.t.copy(eye).addScaledVector(fwd, 0.32 * bs).addScaledVector(UPV, -0.22 * bs).addScaledVector(right, 0.06); G.lerp(V.t, rw); }
    }
    if (rec > 0) G.addScaledVector(dir, -0.05 * rec).addScaledVector(U, 0.03 * rec);
    V.y.copy(dir).negate(); V.x.crossVectors(V.y, U);
    IK.m.makeBasis(V.x, V.y, U); V.qR.setFromRotationMatrix(IK.m);
    V.wT.copy(G).addScaledVector(dir, -0.072 * bs);
    const rightW = twoH ? gunW : gunW * Math.max(W.aim, rw);
    V.pole.copy(shR).addScaledVector(UPV, -1).addScaledVector(R, 0.7).addScaledVector(dir, -0.4);
    if (rightW > 0.01) this.solveArm(this.arms[1], V.wT, V.pole, V.qR, rightW);
    let leftW = 0;
    const F = V.F;
    if (twoH) {
      const off = { shotgun: 0.33, sniper: 0.32, ak: 0.27, m4: 0.28, rpg: 0.24 }[wid] || 0.27;
      F.copy(G).addScaledVector(dir, off * bs).addScaledVector(U, -0.025 * bs);
      leftW = gunW;
    } else if (wid !== 'uzi' && wid !== 'grenade') {
      F.copy(G).addScaledVector(dir, -0.03 * bs).addScaledVector(U, -0.035 * bs).addScaledVector(R, -0.015 * bs);
      leftW = gunW * W.aim;
    }
    if (rw > 0) {
      const mag = V.mag.copy(G).addScaledVector(dir, twoH ? 0.1 : 0).addScaledVector(U, -0.13);
      const belt = this.hips.localToWorld(V.belt.set(0.14, 0.02, 0.1));
      const a = reload < 0.3 ? [F, mag, reload / 0.3] : reload < 0.55 ? [mag, belt, (reload - 0.3) / 0.25] : reload < 0.8 ? [belt, mag, (reload - 0.55) / 0.25] : [mag, F, (reload - 0.8) / 0.2];
      V.t.copy(a[0]).lerp(a[1], sm(a[2])); F.copy(V.t);
      leftW = Math.max(leftW, gunW * W.reload);
    }
    if (leftW > 0.01) {
      const shL = this.arms[0].sh.getWorldPosition(V.shL);
      V.pole.copy(shL).addScaledVector(UPV, -1).addScaledVector(R, -0.25).addScaledVector(dir, -0.3);
      const Xl = V.x.copy(R).multiplyScalar(twoH ? 0.35 : 0.75).addScaledVector(U, twoH ? 0.9 : 0.5).normalize().negate();
      const Yl = V.y.copy(R).multiplyScalar(-0.8).addScaledVector(dir, -0.3);
      Yl.addScaledVector(Xl, -Yl.dot(Xl)).normalize();
      const Zl = V.z.crossVectors(Xl, Yl);
      IK.m.makeBasis(Xl, Yl, Zl); V.qL.setFromRotationMatrix(IK.m);
      V.wT.copy(F).addScaledVector(Yl, 0.06 * bs);
      this.solveArm(this.arms[0], V.wT, V.pole, V.qL, leftW);
    }
  }
}

// test/araç kancası (headless testler için)
if (typeof window !== "undefined") window.__randomLook = randomLook;

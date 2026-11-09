// Karakter geometrisi birim testi (tarayıcısız): tüm kıyafet/teçhizat/vücut tipi kombinasyonlarını
// her LOD'da üretir, hata ve köşe/üçgen bütçesini raporlar.  node scripts/test/chargeo-node.mjs
import { buildCharGeometry } from '../../src/entities/charParts.js';
import { randomLook, defaultLook, applyBodyType, ARCHETYPE_IDS, GANG_STYLES } from '../../src/entities/character.js';

const R = (s) => ({ s, next() { this.s = (this.s * 16807) % 2147483647; return this.s / 2147483647; }, float(a, b) { return a + (b - a) * this.next(); }, pick(a) { return a[Math.floor(this.next() * a.length)]; }, chance(q) { return this.next() < q; } });
const looks = [];
const tops = ['tshirt', 'polo', 'shirt', 'hoodie', 'track', 'jacket', 'blazer', 'leather', 'bomber', 'coat', 'suit', 'tuxedo', 'police', 'police_shirt', 'police_vest', 'vest', 'sweater', 'pardesu', 'ferace', 'crop', 'tank', 'blouse', 'dress', 'sundress', 'army', 'jandarma', 'swat'];
const pants = ['jeans', 'cargo', 'slacks', 'chino', 'track', 'shorts', 'minishort', 'skirt', 'mini', 'midi', 'longskirt', 'leggings', 'tactical', 'camo'];
const shoes = ['sneaker', 'hightop', 'loafer', 'polished', 'boots', 'wellies', 'sandal', 'heels', 'flats'];
const hats = ['none', 'kasket', 'cap', 'bere', 'fedora', 'panama', 'police', 'basortusu', 'takke', 'bandana'];
tops.forEach((t, i) => looks.push(Object.assign(defaultLook(i % 2 ? 'f' : 'm'), { top: t, pants: pants[i % pants.length], shoes: shoes[i % shoes.length], hat: hats[i % hats.length], dressLen: ['mini', 'knee', 'midi', 'long'][i % 4] })));
pants.forEach((p, i) => looks.push(Object.assign(defaultLook('f'), { pants: p, top: 'blouse', earrings: 'hoop', bag: 'handbag' })));
for (const g of ['swat', 'police', 'army', 'jandarma']) looks.push(Object.assign(defaultLook('m'), { helmet: g, vest: g, visor: true, gloves: '#111111' }));
for (const b of ['slim', 'average', 'heavy', 'muscular']) for (const gd of ['m', 'f']) looks.push(applyBodyType(defaultLook(gd), b));
const r = R(11);
for (const a of ARCHETYPE_IDS) looks.push(randomLook(r, 'civilian', a, 'kadikoy'));
for (const k of ['police', 'swat', 'soldier', 'jandarma', 'boss']) looks.push(randomLook(r, k));
for (const gk of GANG_STYLES) looks.push(randomLook(r, 'gang', gk));
let errs = 0; const mx = [0, 0, 0], sum = [0, 0, 0], tmx = [0, 0, 0];
for (const L of looks) for (let lod = 0; lod < 3; lod++) {
  try {
    const g = buildCharGeometry(L, lod), v = g.userData.verts, t = g.userData.tris;
    const P = g.attributes.position.array; for (let i = 0; i < P.length; i++) if (!Number.isFinite(P[i])) throw new Error('NaN konum');
    mx[lod] = Math.max(mx[lod], v); tmx[lod] = Math.max(tmx[lod], t); sum[lod] += v;
  } catch (e) { errs++; console.log('HATA', lod, L.top, L.pants, L.helmet || '', e.message); }
}
console.log('görünüş', looks.length, 'köşe en çok', mx, 'üçgen en çok', tmx, 'köşe ort.', sum.map((s) => Math.round(s / looks.length)));
console.log(errs ? 'BAŞARISIZ ' + errs : 'GEOMETRİ TAMAM');

// [şehir] Mahalle dükkânları: her semtte en az 2 bakkal, iki semtte en az bir market (burada her semtte bir),
// semt kafeleri (cepheyi geri çekip kendi parselinde dış masa alanı açar) ve bir AVM.
// Harita kurulduktan hemen sonra, binalar inşa edilmeden ÖNCE çağrılır (tabela/kapı/cephe yeni tipe göre çizilir).
// Yeni tipler ('bakkal', 'market', 'kafe', 'avm') eski özel tiplere ('food', 'cafe') dokunmaz: hikâye görevleri
// en yakın 'cafe'/'food' aramasıyla yer bulduğundan onların sırası/konumu değişmez.
import { RNG } from '../core/util.js';
import { DISTRICTS, PROPERTIES } from './map.js';

// Kurgusal adlar (gerçek marka yok)
const BAKKAL_NAMES = ['Hüsnü Bakkal', 'Kardeşler Bakkaliyesi', 'Yıldız Bakkal', 'Bereket Bakkal', 'Çınar Bakkal', 'Ümit Gıda', 'Köşe Bakkal', 'Dostlar Bakkaliyesi', 'Saadet Bakkal', 'Mahalle Bakkalı', 'Aydın Bakkal', 'Nur Bakkal', 'Huzur Gıda', 'Bizim Bakkal', 'Lale Bakkal', 'Pınar Bakkal', 'Güven Bakkal', 'Sedef Bakkal'];
const MARKET_NAMES = ['Güneş Market', 'Bolluk Süpermarket', 'Kiler Market', 'Sepet Market', 'Tazelik Market', 'Bereket Süpermarket'];
const KAFE_NAMES = ['Kahve Durağı', 'Fincan Kafe', 'Martı Kahvesi', 'Köşebaşı Kafe', 'Lale Kahve', 'Demlik Çay Evi', 'Sahaf Kafe', 'Çınaraltı', 'Mavi Kapı Kafe', 'Kumru Kahve', 'Sedir Kafe', 'Fıstık Kahve', 'Ihlamur Kafe', 'Rıhtım Kahvesi'];
export const AVM_NAME = 'Boğaziçi Park AVM';

export const CAFES = []; // { b, name, terrace:{x0,x1,z0,z1}, nz, seats:[{x,z,heading,table}], tables:[{x,z}] }
export const CITY_SHOPS = { bakkal: [], market: [], kafe: [], avm: null };

const TERRACE = 4.2; // kafe cephesinin geri çekilme derinliği (m)

export function placeCityShops(map) {
  CAFES.length = 0; CITY_SHOPS.bakkal.length = 0; CITY_SHOPS.market.length = 0; CITY_SHOPS.kafe.length = 0; CITY_SHOPS.avm = null;
  const r = new RNG(2026);
  const sale = new Set(PROPERTIES.map((p) => p.buildingId));
  const specials = map.buildings.filter((b) => b.type !== 'apartment');
  const taken = [];
  const farFromSpecials = (b, d) => specials.every((s) => Math.hypot(s.door.x - b.door.x, s.door.z - b.door.z) > d);
  const ok = (b, minW, minD) => b.type === 'apartment' && !b.tower && !b.villa && !sale.has(b.id) && !b.forSale && b.door.nz !== 0
    && (b.x1 - b.x0) >= minW && (b.z1 - b.z0) >= minD && b.floors <= 9 && farFromSpecials(b, 22)
    && taken.every((t) => Math.hypot(t.door.x - b.door.x, t.door.z - b.door.z) > 40);
  const assign = (b, type, name) => {
    b.type = type; b.sign = -1; b.name = name;
    if (b.style === 'ottoman' && type !== 'kafe' && type !== 'bakkal') b.style = 'plaster';
    taken.push(b); specials.push(b);
    if (!map.specials.includes(b)) map.specials.push(b);
    CITY_SHOPS[type] && CITY_SHOPS[type].push && CITY_SHOPS[type].push(b);
  };
  // semt içinde birbirinden uzak adaylar: önce mevcut dükkânlara en uzak olanı seç (en uzak nokta örneklemesi)
  const pickSpread = (cands, existing, minSep) => {
    let best = null, bd = -1;
    for (const b of cands) {
      let dmin = 1e9;
      for (const e of existing) dmin = Math.min(dmin, Math.hypot(e.door.x - b.door.x, e.door.z - b.door.z));
      const score = (existing.length ? dmin : 0) + r.next() * 30;
      if ((existing.length === 0 || dmin > minSep) && score > bd) { bd = score; best = b; }
    }
    return best;
  };
  // --- AVM: Beşiktaş/Şişli tarafında geniş bir parsel ---
  {
    let best = null, bd = 1e9;
    for (const b of map.buildings) {
      if (!ok(b, 18, 13)) continue;
      const d = Math.hypot(b.door.x - (-380), b.door.z - (-600)) - (b.x1 - b.x0) * 2;
      if (d < bd) { bd = d; best = b; }
    }
    if (best) {
      assign(best, 'avm', AVM_NAME);
      best.floors = 3; best.h = 3 * 5.0 + 1.2; best.roof = 'flat'; best.style = 'official';
      CITY_SHOPS.avm = best;
    }
  }
  for (const d of DISTRICTS) {
    const inD = map.buildings.filter((b) => b.district === d);
    const area = (d.x1 - d.x0) * (d.z1 - d.z0);
    // --- bakkal ---
    const bakkals = inD.filter((b) => b.type === 'food' || b.type === 'bakkal');
    const want = Math.max(2, Math.min(4, Math.round(area / 260000)));
    let guard = 0;
    while (bakkals.length < want && guard++ < 6) {
      const b = pickSpread(inD.filter((c) => ok(c, 8, 9)), bakkals, 110);
      if (!b) break;
      assign(b, 'bakkal', BAKKAL_NAMES[CITY_SHOPS.bakkal.length % BAKKAL_NAMES.length]);
      bakkals.push(b);
    }
    // --- market (her semtte bir: "iki semtte en az bir" şartını fazlasıyla karşılar) ---
    if (!inD.some((b) => b.type === 'market')) {
      const b = pickSpread(inD.filter((c) => ok(c, 15, 11)), bakkals, 90);
      if (b) assign(b, 'market', MARKET_NAMES[CITY_SHOPS.market.length % MARKET_NAMES.length]);
    }
    // --- kafeler: cephesi geri çekilir, dış masa alanı parselin içinde kalır (kaldırım/yol boş) ---
    const kafes = [];
    const nK = area > 400000 ? 3 : 2;
    guard = 0;
    while (kafes.length < nK && guard++ < 8) {
      const b = pickSpread(inD.filter((c) => ok(c, 10, 14.5)), kafes, 120);
      if (!b) break;
      makeCafe(b, KAFE_NAMES[CAFES.length % KAFE_NAMES.length]);
      assign(b, 'kafe', b.name);
      kafes.push(b);
    }
  }
  return CITY_SHOPS;
}

// Kafe: cephe TERRACE m geri çekilir; açılan alan (parselin kendi önü) dış masa terası olur.
function makeCafe(b, name) {
  const nz = b.door.nz;
  const front0 = nz > 0 ? b.z1 : b.z0; // eski cephe (kaldırım kenarına inset kadar yakın)
  if (nz > 0) b.z1 -= TERRACE; else b.z0 += TERRACE;
  b.floors = Math.min(b.floors, 6); b.h = b.floors * 3.2 + 0.6;
  const front1 = nz > 0 ? b.z1 : b.z0;
  b.door = { x: b.door.x, z: front1 + nz * 0.05, nx: 0, nz };
  b.name = name;
  // teras: x boyunca parsel genişliği (komşu cephelere 0.4 m pay), z: yeni cephe → eski cephe çizgisi
  const t = { x0: b.x0 + 0.4, x1: b.x1 - 0.4, z0: Math.min(front0, front1), z1: Math.max(front0, front1) };
  const cafe = { b, name, terrace: t, nz, seats: [], tables: [], planters: [] };
  // masalar: kapı önünde 1.8 m geçit; iki sıra (cepheye yakın sıra + kaldırıma yakın sıra)
  const depth = t.z1 - t.z0;
  const rows = depth > 3.9 ? [0.3, 0.72] : [0.5];
  const pitch = 2.5;
  for (const rf of rows) {
    const z = nz > 0 ? t.z0 + depth * rf : t.z1 - depth * rf;
    for (let x = t.x0 + 1.25; x <= t.x1 - 1.25; x += pitch) {
      if (Math.abs(x - b.door.x) < 1.5) continue; // kapı geçidi
      const ti = cafe.tables.length;
      cafe.tables.push({ x, z });
      // iki sandalye karşılıklı (x ekseninde), oturan masaya bakar
      cafe.seats.push({ x: x - 0.62, z, heading: Math.PI / 2, table: ti, y: 0.15, kind: 'kafe', cafe });
      cafe.seats.push({ x: x + 0.62, z, heading: -Math.PI / 2, table: ti, y: 0.15, kind: 'kafe', cafe });
    }
  }
  // kaldırım tarafı sınırı: saksılar (kapı geçidi açık)
  const pz = nz > 0 ? t.z1 - 0.25 : t.z0 + 0.25;
  for (let x = t.x0 + 0.4; x <= t.x1 - 0.4; x += 1.1) if (Math.abs(x - b.door.x) > 1.2) cafe.planters.push({ x, z: pz });
  CAFES.push(cafe);
  b.cafe = cafe;
}

// Test/denetim: terasın yol ve kaldırımla kesişmediğini doğrular (kaldırım = blok kenarının dışı)
export function cafeOnLot(map, cafe) {
  const blk = map.blocks.find((k) => k.id === cafe.b.block);
  if (!blk) return false;
  const t = cafe.terrace, e = 0.05;
  return t.x0 >= blk.x0 - e && t.x1 <= blk.x1 + e && t.z0 >= blk.z0 - e && t.z1 <= blk.z1 + e;
}

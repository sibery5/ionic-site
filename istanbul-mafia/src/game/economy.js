// Ekonomi: kıyafetler, araçlar, yiyecekler, kaçak mallar, işletmeler, rütbeler.
import { WEAPONS } from './weapons.js';

// Butik kategorileri (sol menü sırası)
export const CLOTHING_CATS = [
  { id: 'top', name: 'Üst Giyim', icon: 'c_top' },
  { id: 'pants', name: 'Pantolon', icon: 'c_pants' },
  { id: 'shoes', name: 'Ayakkabı', icon: 'c_shoes' },
  { id: 'hat', name: 'Şapka', icon: 'c_hat' },
  { id: 'glasses', name: 'Gözlük', icon: 'c_glasses' },
  { id: 'jewelry', name: 'Takı', icon: 'c_jewelry' },
  { id: 'watch', name: 'Saat', icon: 'c_watch' },
  { id: 'bag', name: 'Çanta', icon: 'c_bag' },
];

// Kıyafetler. `slot` sahiplik anahtarını (s.owned["slot:id"]) ve görünüm alanını belirler,
// `cat` butik kategorisidir. `model` verilirse karakter modeli o kalıbı kullanır (yeni kalıplar
// eklenene kadar en yakın mevcut kalıba düşer); asıl kimlik `look.<slot>Style` alanında tutulur.
export const CLOTHES = [
  // üstler
  { id: 'tshirt', slot: 'top', cat: 'top', name: 'Tişört', price: 150, colors: ['#e8e8e8', '#1a1a1a', '#8a1a1a', '#1d3d6e', '#2d5a2d'], desc: 'Pamuklu, rahat kesim.' },
  { id: 'polo', slot: 'top', cat: 'top', model: 'tshirt', name: 'Polo Yaka Tişört', price: 480, colors: ['#ffffff', '#1d2440', '#2d5a2d', '#c9b48a'], desc: 'Kulüp üyesi havası.' },
  { id: 'shirt', slot: 'top', cat: 'top', name: 'Gömlek', price: 400, colors: ['#ffffff', '#a8c8e8', '#e8d8c8', '#2a2a2a'], desc: 'Ütülü, kolalı.' },
  { id: 'hoodie', slot: 'top', cat: 'top', model: 'track', name: 'Kapüşonlu Sweatshirt', price: 750, colors: ['#3a3a3a', '#1a1a1a', '#5a1a1a', '#6e8a9e'], desc: 'Gece işleri için ideal.' },
  { id: 'track', slot: 'top', cat: 'top', name: 'Eşofman Üstü', price: 650, colors: ['#1a1a1a', '#1d3d6e', '#8a1a1a', '#e8e8e8', '#2d5a2d'], desc: 'Mahallenin resmî kıyafeti.' },
  { id: 'jacket', slot: 'top', cat: 'top', name: 'Kot Ceket', price: 1100, colors: ['#3a4a6a', '#2a2a2a', '#6a5a4a'], desc: 'Yıkanmış kot, eskimez.' },
  { id: 'blazer', slot: 'top', cat: 'top', model: 'jacket', name: 'Spor Ceket', price: 3400, colors: ['#5a4a3a', '#2a2a3a', '#6a2a2a'], desc: 'Yarı resmî, tam karizma.' },
  { id: 'leather', slot: 'top', cat: 'top', name: 'Deri Ceket', price: 2500, colors: ['#1c1c1c', '#4a2c1a', '#5a1a1a'], desc: 'Hakiki kuzu derisi.' },
  { id: 'coat', slot: 'top', cat: 'top', name: 'Uzun Palto', price: 5200, colors: ['#1a1a1a', '#5a4a3a', '#2a2a3a', '#8a7a6a'], desc: 'Boğaz rüzgârına karşı.' },
  { id: 'suit', slot: 'top', cat: 'top', name: 'Takım Elbise', price: 7500, colors: ['#111111', '#1d2440', '#3a3a3a', '#e8e0d0', '#5a1a1a'], desc: 'İtalyan kumaşı, terzi dikimi.' },
  { id: 'tuxedo', slot: 'top', cat: 'top', model: 'suit', name: 'Smokin', price: 18000, colors: ['#0a0a0a', '#f0ece0', '#3a0d1a'], desc: 'Gala gecesi ve düğün için.' },
  // altlar
  { id: 'jeans', slot: 'pants', cat: 'pants', name: 'Kot Pantolon', price: 450, colors: ['#2a3550', '#1a1a1a', '#5a6a8a'], desc: 'Klasik beş cep.' },
  { id: 'cargo', slot: 'pants', cat: 'pants', model: 'jeans', name: 'Kargo Pantolon', price: 600, colors: ['#4a4a3a', '#2a2a2a', '#6a5a3a'], desc: 'Bol cep, bol iş.' },
  { id: 'slacks', slot: 'pants', cat: 'pants', name: 'Kumaş Pantolon', price: 900, colors: ['#111111', '#3a3a3a', '#5a4a3a', '#e8e0d0'], desc: 'Ütü izi keskin.' },
  { id: 'chino', slot: 'pants', cat: 'pants', model: 'slacks', name: 'Chino Pantolon', price: 1200, colors: ['#c9b48a', '#2a3a5a', '#5a2a2a'], desc: 'Sahil kasabası şıklığı.' },
  { id: 'track', slot: 'pants', cat: 'pants', name: 'Eşofman Altı', price: 350, colors: ['#1a1a1a', '#1d3d6e', '#8a1a1a'], desc: 'Üç bantlı efsane.' },
  { id: 'shorts', slot: 'pants', cat: 'pants', name: 'Şort', price: 200, colors: ['#c9b48a', '#2a3550', '#1a1a1a'], desc: 'Yaz sıcağında kurtarıcı.' },
  // ayakkabılar
  { id: 'sneaker', slot: 'shoes', cat: 'shoes', name: 'Spor Ayakkabı', price: 800, colors: ['#eeeeee', '#1a1a1a', '#8a1a1a'], desc: 'Kaçarken de rahat.' },
  { id: 'hightop', slot: 'shoes', cat: 'shoes', model: 'sneaker', name: 'Basketbol Botu', price: 1900, colors: ['#e8e8e8', '#c81010', '#111111'], desc: 'Sınırlı üretim.' },
  { id: 'loafer', slot: 'shoes', cat: 'shoes', model: 'polished', name: 'Süet Loafer', price: 1600, colors: ['#5a3a20', '#1d2440', '#2a2a2a'], desc: 'Çorapsız giyilir.' },
  { id: 'polished', slot: 'shoes', cat: 'shoes', name: 'Rugan Ayakkabı', price: 2200, colors: ['#0a0a0a', '#4a2412'], desc: 'Aynada yüzünü görürsün.' },
  { id: 'boots', slot: 'shoes', cat: 'shoes', name: 'Bot', price: 1400, colors: ['#3a2412', '#1a1a1a'], desc: 'Kış ve kavga için.' },
  // şapkalar
  { id: 'none', slot: 'hat', cat: 'hat', name: 'Şapkasız', price: 0, colors: ['#000000'], desc: 'Saçın görünsün.' },
  { id: 'cap', slot: 'hat', cat: 'hat', model: 'kasket', name: 'Beyzbol Şapkası', price: 250, colors: ['#1a1a1a', '#8a1a1a', '#1d3d6e', '#e8e8e8'], desc: 'Siper öne ya da arkaya.' },
  { id: 'kasket', slot: 'hat', cat: 'hat', name: 'Kasket', price: 300, colors: ['#2a2a2a', '#5a4a3a', '#3a3a4a'], desc: 'Kahvehane klasiği.' },
  { id: 'bere', slot: 'hat', cat: 'hat', name: 'Bere', price: 150, colors: ['#1a1a1a', '#8a1a1a', '#2d5a2d'], desc: 'Örgü yün.' },
  { id: 'panama', slot: 'hat', cat: 'hat', model: 'fedora', name: 'Panama Şapka', price: 1400, colors: ['#e8dcc0', '#c9b48a'], desc: 'Yazlık hasır.' },
  { id: 'fedora', slot: 'hat', cat: 'hat', name: 'Fötr Şapka', price: 1800, colors: ['#151515', '#3a2a1a', '#e8e0d0'], desc: 'Eski İstanbul beyefendisi.' },
  // gözlükler
  { id: 'noglasses', slot: 'glasses', cat: 'glasses', name: 'Gözlüksüz', price: 0, colors: ['#000000'], desc: 'Gözlerin konuşsun.' },
  { id: 'glasses', slot: 'glasses', cat: 'glasses', name: 'Güneş Gözlüğü', price: 1200, colors: ['#000000'], desc: 'UV korumalı, kimlik gizler.' },
  { id: 'aviator', slot: 'glasses', cat: 'glasses', name: 'Pilot Gözlüğü', price: 2800, colors: ['#1a1a1a', '#d4af37', '#3a5a3a'], desc: 'Altın çerçeve, aynalı cam.' },
  { id: 'readers', slot: 'glasses', cat: 'glasses', name: 'Numaralı Gözlük', price: 900, colors: ['#3a2412', '#111111'], desc: 'Muhasebeci havası.' },
  // takılar
  { id: 'chain', slot: 'chain', cat: 'jewelry', name: 'Altın Zincir', price: 9000, colors: ['#d4af37'], desc: '22 ayar, kalın örgü.' },
  { id: 'silverchain', slot: 'chain', cat: 'jewelry', name: 'Gümüş Zincir', price: 2600, colors: ['#cfd2d6'], desc: '925 ayar gümüş.' },
  { id: 'tespih', slot: 'tespih', cat: 'jewelry', name: 'Kehribar Tespih', price: 2500, colors: ['#5a1a10'], desc: 'Damla kehribar, 33\'lük.' },
  { id: 'oltutespih', slot: 'tespih', cat: 'jewelry', name: 'Oltu Taşı Tespih', price: 4200, colors: ['#111111'], desc: 'Erzurum oltu taşı, gümüş püskül.' },
  { id: 'ring', slot: 'ring', cat: 'jewelry', name: 'Altın Yüzük', price: 6500, colors: ['#d4af37'], desc: 'Aile yüzüğü.' },
  { id: 'diamondring', slot: 'ring', cat: 'jewelry', name: 'Pırlanta Yüzük', price: 48000, colors: ['#e8f4ff'], desc: '2 karat. Elini masaya koy.' },
  // saatler
  { id: 'nowatch', slot: 'watch', cat: 'watch', name: 'Saatsiz', price: 0, colors: ['#000000'], desc: 'Zaman senin kontrolünde.' },
  { id: 'digital', slot: 'watch', cat: 'watch', name: 'Dijital Saat', price: 350, colors: ['#1a1a1a', '#c9b48a'], desc: 'Hesap makineli.' },
  { id: 'steelwatch', slot: 'watch', cat: 'watch', name: 'Çelik Kol Saati', price: 4800, colors: ['#cfd2d6', '#1a1a1a'], desc: 'Otomatik mekanizma.' },
  { id: 'goldwatch', slot: 'watch', cat: 'watch', name: 'Altın Kol Saati', price: 38000, colors: ['#d4af37'], desc: 'İsviçre işi, 18 ayar.' },
  { id: 'diamondwatch', slot: 'watch', cat: 'watch', name: 'Pırlantalı Saat', price: 210000, colors: ['#e8f4ff', '#d4af37'], desc: 'Babaların saati.' },
  // çantalar (taşıma kapasitesi)
  { id: 'nobag', slot: 'bag', cat: 'bag', name: 'Çantasız', price: 0, colors: ['#000000'], desc: 'Eller serbest.' },
  { id: 'briefcase', slot: 'bag', cat: 'bag', name: 'Evrak Çantası', price: 900, capacity: 35, colors: ['#3a2412', '#111111'], desc: 'Kilitli, şifreli. Kapasite 35.' },
  { id: 'bag1', slot: 'bag', cat: 'bag', name: 'Sırt Çantası', price: 1500, capacity: 50, colors: ['#1a1a1a', '#2d5a2d', '#8a1a1a'], desc: 'Kapasite 50.' },
  { id: 'duffel', slot: 'bag', cat: 'bag', name: 'Spor Çanta', price: 3200, capacity: 70, colors: ['#1a1a1a', '#1d3d6e'], desc: 'İçinde forma yok. Kapasite 70.' },
  { id: 'bag2', slot: 'bag', cat: 'bag', name: 'Büyük Valiz', price: 6000, capacity: 100, colors: ['#111111', '#5a1a1a'], desc: 'Tekerlekli, gümrüksüz. Kapasite 100.' },
];
// Ücretsiz "çıkar" seçenekleri (her zaman sahip olunmuş sayılır)
export const FREE_ITEM_IDS = ['none', 'noglasses', 'nowatch', 'nobag'];

// Kıyafeti bir görünüme uygula (karakter modelinin tanımadığı yeni alanlar yok sayılabilir)
export function applyClothing(look, it, color) {
  const m = it.model || it.id;
  switch (it.slot) {
    case 'top': look.top = m; look.topColor = color; look.topStyle = it.id; break;
    case 'pants': look.pants = m; look.pantsColor = color; look.pantsStyle = it.id; break;
    case 'shoes': look.shoes = m; look.shoesColor = color; look.shoesStyle = it.id; break;
    case 'hat': look.hat = m; look.hatColor = color; look.hatStyle = it.id; break;
    case 'glasses': look.glasses = it.id !== 'noglasses'; look.glassesStyle = it.id; look.glassesColor = color; break;
    case 'chain': look.chain = true; look.chainStyle = it.id; look.chainColor = color; break;
    case 'tespih': look.tespih = true; look.tespihStyle = it.id; look.tespihColor = color; break;
    case 'ring': look.ring = it.id; look.ringColor = color; break;
    case 'watch': look.watch = it.id === 'nowatch' ? null : it.id; look.watchColor = color; break;
    case 'bag': look.bag = it.id === 'nobag' ? null : it.id; look.bagColor = color; break;
    default: break;
  }
  return look;
}
// Takıyı çıkar (zincir, tespih, yüzük bağımsız takılır)
export function removeClothing(look, slot) {
  if (slot === 'chain') look.chain = false;
  if (slot === 'tespih') look.tespih = false;
  if (slot === 'ring') look.ring = null;
  return look;
}
// Görünümde şu an bu parça mı takılı?
export function wornClothing(look, it) {
  switch (it.slot) {
    case 'top': return (look.topStyle || look.top) === it.id;
    case 'pants': return (look.pantsStyle || look.pants) === it.id;
    case 'shoes': return (look.shoesStyle || look.shoes) === it.id;
    case 'hat': return (look.hatStyle || look.hat || 'none') === it.id;
    case 'glasses': return it.id === 'noglasses' ? !look.glasses : !!look.glasses && (look.glassesStyle || 'glasses') === it.id;
    case 'chain': return !!look.chain && (look.chainStyle || 'chain') === it.id;
    case 'tespih': return !!look.tespih && (look.tespihStyle || 'tespih') === it.id;
    case 'ring': return look.ring === it.id;
    case 'watch': return (look.watch || 'nowatch') === it.id;
    case 'bag': return (look.bag || 'nobag') === it.id;
    default: return false;
  }
}
export function clothingColor(look, it) {
  const k = { top: 'topColor', pants: 'pantsColor', shoes: 'shoesColor', hat: 'hatColor', glasses: 'glassesColor', chain: 'chainColor', tespih: 'tespihColor', ring: 'ringColor', watch: 'watchColor', bag: 'bagColor' }[it.slot];
  return (k && look[k]) || it.colors[0];
}

export const FOOD = [
  { id: 'simit', name: 'Simit', price: 15, heal: 10 },
  { id: 'cay', name: 'Çay', price: 10, heal: 5 },
  { id: 'ayran', name: 'Ayran', price: 20, heal: 8 },
  { id: 'doner', name: 'Döner Dürüm', price: 120, heal: 35 },
  { id: 'lahmacun', name: 'Lahmacun', price: 90, heal: 30 },
  { id: 'balikekmek', name: 'Balık Ekmek', price: 150, heal: 40 },
  { id: 'kokorec', name: 'Kokoreç', price: 180, heal: 45 },
  { id: 'baklava', name: 'Baklava (Porsiyon)', price: 250, heal: 50 },
  { id: 'ilk', name: 'İlk Yardım Çantası', price: 600, heal: 100 },
];

export const GOODS = [
  { id: 'cay', name: 'Kaçak Çay', base: 60, vol: 0.35 },
  { id: 'sigara', name: 'Kaçak Sigara', base: 140, vol: 0.4 },
  { id: 'saat', name: 'Replika Saat', base: 420, vol: 0.45 },
  { id: 'telefon', name: 'Gümrüksüz Telefon', base: 1800, vol: 0.4 },
  { id: 'hali', name: 'El Dokuma Halı', base: 3500, vol: 0.35 },
  { id: 'altin', name: 'Külçe Altın', base: 9000, vol: 0.25 },
  { id: 'antika', name: 'Osmanlı Antikası', base: 15000, vol: 0.55 },
];

// Semte göre fiyat eğilimi (1 = normal)
export const DISTRICT_PRICE = {
  beyoglu: { cay: 1.2, sigara: 1.3, saat: 1.1, telefon: 1.2, hali: 1.3, altin: 1.0, antika: 1.25 },
  besiktas: { cay: 1.1, sigara: 1.1, saat: 1.35, telefon: 1.3, hali: 1.2, altin: 1.1, antika: 1.4 },
  fatih: { cay: 0.75, sigara: 0.8, saat: 0.7, telefon: 0.8, hali: 0.7, altin: 0.9, antika: 0.75 },
  eyup: { cay: 0.85, sigara: 0.7, saat: 0.9, telefon: 0.75, hali: 0.9, altin: 0.95, antika: 0.9 },
  uskudar: { cay: 1.0, sigara: 0.9, saat: 1.0, telefon: 1.0, hali: 1.1, altin: 1.05, antika: 1.0 },
  kadikoy: { cay: 1.3, sigara: 1.25, saat: 1.2, telefon: 1.35, hali: 1.15, altin: 1.15, antika: 1.1 },
};

export const CARS = {
  kartal: { name: 'Kartal 131', price: 18000, maxSpeed: 32, accel: 9, len: 4.3, wid: 1.7, hei: 1.35, hp: 700, colors: ['#e8e0d0', '#8a1a1a', '#1d3d6e', '#5a6a4a', '#c9b48a'], style: 'sedan', body: 'wagon' },
  taksi: { name: 'Sarı Taksi', price: 26000, maxSpeed: 36, accel: 10, len: 4.5, wid: 1.8, hei: 1.4, hp: 800, colors: ['#f2c200'], style: 'taxi' },
  dolmus: { name: 'Dolmuş Minibüs', price: 34000, maxSpeed: 28, accel: 7, len: 5.2, wid: 2.0, hei: 2.2, hp: 1000, colors: ['#f2c200', '#e8e8e8'], style: 'van' },
  sedan: { name: 'Lüks Sedan', price: 85000, maxSpeed: 44, accel: 13, len: 4.9, wid: 1.9, hei: 1.4, hp: 900, colors: ['#111111', '#e8e8e8', '#6a6a6a', '#1d2440'], style: 'sedan' },
  suv: { name: 'Karabasan SUV', price: 140000, maxSpeed: 42, accel: 12, len: 4.9, wid: 2.0, hei: 1.8, hp: 1400, colors: ['#0a0a0a', '#2a2a2a', '#e8e8e8'], style: 'suv' },
  gt: { name: 'Rüzgar GT', price: 260000, maxSpeed: 60, accel: 20, len: 4.5, wid: 1.95, hei: 1.15, hp: 800, colors: ['#c81010', '#f2c200', '#1060c8', '#111111', '#e8e8e8'], style: 'sport' },
  police: { name: 'Polis Ekip Aracı', price: 0, maxSpeed: 46, accel: 14, len: 4.7, wid: 1.85, hei: 1.45, hp: 1100, colors: ['#f2f2f2'], style: 'police' },
  bus: { name: 'Şehir Otobüsü', price: 0, maxSpeed: 22, accel: 5, len: 11, wid: 2.5, hei: 3.0, hp: 2500, colors: ['#d8d8d0'], style: 'bus' },
  swat: { name: 'Özel Harekat Zırhlısı', price: 0, maxSpeed: 40, accel: 11, len: 5.4, wid: 2.2, hei: 2.2, hp: 3000, colors: ['#1a1a1a'], style: 'swat' },
  motor: { name: 'Motosiklet', price: 12000, maxSpeed: 46, accel: 15, len: 2.1, wid: 0.8, hei: 1.2, hp: 400, colors: ['#c81010', '#111111', '#1060c8', '#e8e8e8'], style: 'moto' },
  kamyon: { name: 'Kamyon', price: 60000, maxSpeed: 24, accel: 5, len: 8, wid: 2.4, hei: 3.3, hp: 3000, mass: 4500, colors: ['#e8e8e8', '#1d5aa8', '#8a1a1a'], style: 'truck' },
  ambulans: { name: 'Ambulans', price: 0, maxSpeed: 38, accel: 10, len: 5.8, wid: 2.1, hei: 2.6, hp: 1400, colors: ['#f4f4f4'], style: 'ambulance' },
  cip: { name: 'Askerî Cip', price: 0, maxSpeed: 36, accel: 10, len: 4.4, wid: 1.9, hei: 1.95, hp: 1800, colors: ['#4b5432'], style: 'jeep' },
  tank: { name: 'Leopard Tank', price: 0, maxSpeed: 14, accel: 4, len: 7.5, wid: 3.5, hei: 2.4, hp: 9000, mass: 20000, colors: ['#4b5432'], style: 'tank' },
};
export const DEALER_CARS = ['kartal', 'taksi', 'dolmus', 'sedan', 'suv', 'gt'];

export const BUSINESSES = [
  { id: 'cayocagi', name: 'Çay Ocağı', price: 40000, income: 1200, district: 'beyoglu' },
  { id: 'kahvehane', name: 'Kahvehane', price: 90000, income: 2800, district: 'fatih' },
  { id: 'otopark', name: 'Otopark', price: 150000, income: 4500, district: 'kadikoy' },
  { id: 'galeri', name: 'Oto Galeri', price: 300000, income: 9000, district: 'besiktas' },
  { id: 'kulup', name: 'Gece Kulübü', price: 500000, income: 16000, district: 'beyoglu' },
  { id: 'liman', name: 'Liman Deposu', price: 900000, income: 30000, district: 'uskudar' },
  { id: 'otel', name: 'Boğaz Oteli', price: 1500000, income: 55000, district: 'besiktas' },
];

export const GANGS = {
  yilanlar: { name: 'Yılanlar', color: '#2d8a3d', district: 'beyoglu', boss: 'Kara Yılan' },
  kartallar: { name: 'Kartallar', color: '#e8e8e8', district: 'besiktas', boss: 'Doğan Bey' },
  carsi: { name: 'Çarşı Ailesi', color: '#c98a1a', district: 'fatih', boss: 'Hacı Rüstem' },
  bogaz: { name: 'Boğaz Kardeşler', color: '#1d6ec8', district: 'kadikoy', boss: 'Deli Murat' },
  kurtlar: { name: 'Kurtlar', color: '#8a1a1a', district: 'uskudar', boss: 'Bozkurt Selim' },
};

export const RANKS = [
  { min: 0, name: 'Çaylak' },
  { min: 100, name: 'Ayakçı' },
  { min: 300, name: 'Tetikçi' },
  { min: 700, name: 'Kabadayı' },
  { min: 1500, name: 'Sağ Kol' },
  { min: 3000, name: 'Baba' },
  { min: 6000, name: "Boğaz'ın Babası" },
];
export function rankOf(respect) {
  let r = RANKS[0];
  for (const k of RANKS) if (respect >= k.min) r = k;
  return r;
}

export function weaponPrice(id) { return WEAPONS[id].price; }

// Günlük fiyatları üret
export function rollPrices(day) {
  const out = {};
  for (const d of Object.keys(DISTRICT_PRICE)) {
    out[d] = {};
    for (const g of GOODS) {
      const h = Math.sin(day * 12.9898 + d.length * 78.233 + g.base * 0.013) * 43758.5453;
      const rnd = h - Math.floor(h);
      out[d][g.id] = Math.round(g.base * DISTRICT_PRICE[d][g.id] * (1 + (rnd - 0.5) * 2 * g.vol));
    }
  }
  return out;
}

// ======================= GALERİ =======================
// Satılık kara araçları: CARS içinde fiyatı olan her şey (başka modüllerin eklediği araçlar da otomatik listelenir)
export function dealerCarList() {
  const out = DEALER_CARS.filter((t) => CARS[t]);
  for (const [k, c] of Object.entries(CARS)) if (c.price > 0 && !out.includes(k) && !c.hidden) out.push(k);
  return out;
}
export const CAR_CLASS = { sedan: 'Sedan', taxi: 'Ticari', van: 'Ticari', suv: 'SUV', sport: 'Spor', bus: 'Ağır vasıta', police: 'Resmî', swat: 'Resmî' };

// Lüks araçlar: deniz ve hava. Teslimat noktaları (iskele/helipad) mimar tarafından
// `game.spawnLuxury(entry)` ile bağlanır. `type`, boats.js / aircraft.js tür kimlikleriyle eşleşir.
export const LUXURY_VEHICLES = [
  { id: 'lodos', type: 'speedboat', name: 'Lodos 28 Sürat Teknesi', price: 320000, speed: 85, seats: 4, colors: ['#e8e8e8', '#c81010', '#111111'], desc: 'Boğaz\'da martıları geride bırakır.' },
  { id: 'poyraz', type: 'speedboat', name: 'Poyraz 36 Offshore', price: 640000, speed: 110, seats: 6, colors: ['#111111', '#f2c200', '#1d3d6e'], desc: 'Sahil güvenlikten hızlı.' },
  { id: 'yildiz', type: 'yacht', name: 'Yıldız 52 Motoryat', price: 2400000, speed: 45, seats: 12, colors: ['#ffffff', '#1d2440'], desc: 'Üç kabin, güneşlenme güvertesi.' },
  { id: 'sultan', type: 'yacht', name: 'Sultan 88 Mega Yat', price: 9500000, speed: 40, seats: 24, colors: ['#ffffff', '#0a0a0a'], desc: 'Jakuzi, helipad, mürettebat dahil.' },
  { id: 'atmaca', type: 'helicopter', name: 'Atmaca H3 Helikopter', price: 4200000, speed: 240, seats: 4, colors: ['#111111', '#e8e8e8', '#8a1a1a'], desc: 'Trafiğe takılmazsın.' },
  { id: 'karasahin', type: 'helicopter', name: 'Karaşahin VIP Helikopter', price: 7800000, speed: 280, seats: 8, colors: ['#0a0a0a', '#d4af37'], desc: 'Deri koltuklu yönetici kabini.' },
  { id: 'turna', type: 'plane', name: 'Turna Pervaneli Uçak', price: 3600000, speed: 320, seats: 4, colors: ['#e8e8e8', '#c81010'], desc: 'Kısa pistten kalkar.' },
  { id: 'anka', type: 'plane', name: 'Anka Özel Jet', price: 18000000, speed: 850, seats: 12, colors: ['#ffffff', '#1d2440', '#d4af37'], desc: 'Kıtalararası, sorgusuz sualsiz.' },
];
export const LUXURY_KINDS = { speedboat: 'Sürat Teknesi', yacht: 'Yat', helicopter: 'Helikopter', plane: 'Uçak' };

// Taksitli satış: peşinat oranı, faiz, gün sayısı
export const FINANCE = { down: 0.25, interest: 0.15, days: 10 };

// ======================= EMLAK =======================
export const PROPERTY_KINDS = {
  daire: { name: 'Daire', icon: 'p_flat' },
  ev: { name: 'Müstakil Ev', icon: 'pin_house' },
  yali: { name: 'Boğaz Yalısı', icon: 'p_yali' },
  penthouse: { name: 'Penthouse', icon: 'p_tower' },
};
// `at`: semt içindeki yaklaşık konum; o noktaya en yakın bina mülk olarak atanır.
export const PROPERTIES = [
  { id: 'tarlabasi', kind: 'daire', name: 'Tarlabaşı 1+1 Daire', district: 'beyoglu', at: [-560, -200], price: 65000, garage: 1, desc: 'Mütevazı ama merkezî. Komşular soru sormaz.' },
  { id: 'cihangir', kind: 'daire', name: 'Cihangir Manzaralı Daire', district: 'beyoglu', at: [-30, -60], price: 180000, garage: 1, desc: 'Boğaz\'a nazır balkon, sanatçı komşular.' },
  { id: 'moda', kind: 'daire', name: 'Moda Sahil Dairesi', district: 'kadikoy', at: [720, 600], price: 240000, garage: 2, desc: 'Sahile iki dakika, vapura beş dakika.' },
  { id: 'eyupev', kind: 'ev', name: 'Eyüp Bahçeli Müstakil Ev', district: 'eyup', at: [-930, -520], price: 300000, garage: 2, desc: 'Sakin sokak, geniş bahçe, gizli bodrum.' },
  { id: 'fatihev', kind: 'ev', name: 'Fatih Ahşap Konak Evi', district: 'fatih', at: [-640, 620], price: 420000, garage: 2, desc: 'Tarihi yarımadanın kalbinde restore konak.' },
  { id: 'uskudarkosk', kind: 'ev', name: 'Üsküdar Tarihi Köşk', district: 'uskudar', at: [720, -320], price: 650000, garage: 3, desc: 'Çamlıca eteklerinde, korumalı arazi.' },
  { id: 'kuzguncuk', kind: 'yali', name: 'Kuzguncuk Yalısı', district: 'uskudar', at: [440, -420], price: 3800000, garage: 3, dock: true, desc: 'Suya sıfır, özel tekne iskelesi.' },
  { id: 'bebek', kind: 'yali', name: 'Bebek Yalısı', district: 'besiktas', at: [180, -640], price: 4500000, garage: 4, dock: true, desc: 'Boğaz\'ın en prestijli adresi. İskele dahil.' },
  { id: 'levent', kind: 'penthouse', name: 'Levent Gökdelen Penthouse', district: 'besiktas', at: [-300, -860], price: 2800000, garage: 4, helipad: true, tower: true, desc: 'Çatı katı, özel helipad, şehir ayaklarının altında.' },
];
export function propertyPerks(p) {
  const out = ['Kayıt noktası (yatak)', 'Gardırop', 'Silah dolabı', `Garaj: +${p.garage} araç`];
  if (p.dock) out.push('Özel tekne iskelesi');
  if (p.helipad) out.push('Çatı helipadı');
  return out;
}
export const BASE_GARAGE = 3;
export const MAX_GARAGE = 12;
export function garageCapacity(s) {
  let n = BASE_GARAGE;
  for (const id of s.properties || []) { const p = PROPERTIES.find((x) => x.id === id); if (p) n += p.garage; }
  return Math.min(MAX_GARAGE, n);
}

// İşletme geliştirme kademeleri: gelir çarpanı ve fiyat oranı
export const BIZ_LEVELS = [
  { lvl: 1, name: 'Standart', mult: 1, cost: 0 },
  { lvl: 2, name: 'Tadilatlı', mult: 1.5, cost: 0.6 },
  { lvl: 3, name: 'Lüks Konsept', mult: 2.2, cost: 1.4 },
  { lvl: 4, name: 'Zincir Marka', mult: 3.2, cost: 2.6 },
];
export function bizLevel(s, id) { return (s.bizLevel && s.bizLevel[id]) || 1; }
export function bizIncome(s, b) { return Math.round(b.income * BIZ_LEVELS[bizLevel(s, b.id) - 1].mult); }
// main.js onNewDay temel geliri öder; bu fonksiyon geliştirmelerden gelen EK geliri verir
export function bizUpgradeBonus(s) {
  let n = 0;
  for (const id of s.businesses || []) { const b = BUSINESSES.find((x) => x.id === id); if (b) n += bizIncome(s, b) - b.income; }
  return n;
}

// ======================= KARİYER RÜTBELERİ =======================
export const LEGAL_RANKS = [
  { min: 0, name: 'İşsiz' },
  { min: 40, name: 'Stajyer' },
  { min: 150, name: 'Çalışan' },
  { min: 450, name: 'Esnaf' },
  { min: 1200, name: 'Girişimci' },
  { min: 3000, name: 'İş İnsanı' },
  { min: 8000, name: 'Holding Patronu' },
];
export const CRIME_RANKS = [
  { min: 0, name: 'Temiz Sicil' },
  { min: 40, name: 'Yankesici' },
  { min: 150, name: 'Torbacı' },
  { min: 450, name: 'Hırsız' },
  { min: 1200, name: 'Tetikçi' },
  { min: 3000, name: 'Kabadayı' },
  { min: 8000, name: 'Yeraltı Kralı' },
];
export function rankIn(list, v) {
  let i = 0;
  for (let k = 0; k < list.length; k++) if (v >= list[k].min) i = k;
  const next = list[i + 1];
  return { ...list[i], index: i, next, pct: next ? (v - list[i].min) / (next.min - list[i].min) : 1 };
}

// ======================= BORSA =======================
export const STOCKS = [
  { sym: 'BGZHL', name: 'Boğaz Holding', sector: 'Holding', base: 84, vol: 0.016, drift: 0.0006 },
  { sym: 'LALEB', name: 'Lale Bankası', sector: 'Banka', base: 64, vol: 0.014, drift: 0.0004 },
  { sym: 'GLTEK', name: 'Galata Teknoloji', sector: 'Teknoloji', base: 132, vol: 0.034, drift: 0.0012 },
  { sym: 'KRTOT', name: 'Kartal Otomotiv', sector: 'Otomotiv', base: 46, vol: 0.02, drift: 0.0003 },
  { sym: 'HALDZ', name: 'Haliç Denizcilik', sector: 'Lojistik', base: 28, vol: 0.022, drift: 0.0002 },
  { sym: 'KULEI', name: 'Kule İnşaat', sector: 'İnşaat', base: 37, vol: 0.03, drift: -0.0002 },
  { sym: 'RIZEC', name: 'Rize Çay Sanayi', sector: 'Gıda', base: 18, vol: 0.012, drift: 0.0003 },
  { sym: 'SIMIT', name: 'Simitçi Gıda', sector: 'Gıda', base: 12.5, vol: 0.026, drift: 0.0005 },
];

// ======================= YAŞAM DURUMU =======================
// Eski kayıtlar için varsayılanlar: freshState'e eklenmesi önerilen alanlar.
export function lifeStateDefaults() {
  return {
    properties: [], luxury: [], loans: [], savings: 0, legalRep: 0, crimeRep: 0, bizLevel: {},
    stocks: { hold: {}, cost: {} }, market: null, jobStats: {}, career: null,
  };
}
export function ensureLifeState(s) {
  if (!s || s._lifeOk) return s;
  const d = lifeStateDefaults();
  for (const k of Object.keys(d)) if (s[k] === undefined || s[k] === null) s[k] = d[k];
  if (!s.stocks.hold) s.stocks = { hold: {}, cost: {} };
  Object.defineProperty(s, '_lifeOk', { value: true, enumerable: false, configurable: true });
  return s;
}

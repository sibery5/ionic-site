// Ekonomi: kıyafetler, araçlar, yiyecekler, kaçak mallar, işletmeler, rütbeler.
import { WEAPONS } from './weapons.js';

export const CLOTHES = [
  // üstler
  { id: 'tshirt', slot: 'top', name: 'Tişört', price: 150, colors: ['#e8e8e8', '#1a1a1a', '#8a1a1a', '#1d3d6e', '#2d5a2d'] },
  { id: 'shirt', slot: 'top', name: 'Gömlek', price: 400, colors: ['#ffffff', '#a8c8e8', '#e8d8c8', '#2a2a2a'] },
  { id: 'track', slot: 'top', name: 'Eşofman Üstü', price: 650, colors: ['#1a1a1a', '#1d3d6e', '#8a1a1a', '#e8e8e8', '#2d5a2d'] },
  { id: 'leather', slot: 'top', name: 'Deri Ceket', price: 2500, colors: ['#1c1c1c', '#4a2c1a', '#5a1a1a'] },
  { id: 'jacket', slot: 'top', name: 'Kot Ceket', price: 1100, colors: ['#3a4a6a', '#2a2a2a', '#6a5a4a'] },
  { id: 'suit', slot: 'top', name: 'Takım Elbise', price: 7500, colors: ['#111111', '#1d2440', '#3a3a3a', '#e8e0d0', '#5a1a1a'] },
  { id: 'coat', slot: 'top', name: 'Uzun Palto', price: 5200, colors: ['#1a1a1a', '#5a4a3a', '#2a2a3a', '#8a7a6a'] },
  // altlar
  { id: 'jeans', slot: 'pants', name: 'Kot Pantolon', price: 450, colors: ['#2a3550', '#1a1a1a', '#5a6a8a'] },
  { id: 'slacks', slot: 'pants', name: 'Kumaş Pantolon', price: 900, colors: ['#111111', '#3a3a3a', '#5a4a3a', '#e8e0d0'] },
  { id: 'track', slot: 'pants', name: 'Eşofman Altı', price: 350, colors: ['#1a1a1a', '#1d3d6e', '#8a1a1a'] },
  { id: 'shorts', slot: 'pants', name: 'Şort', price: 200, colors: ['#c9b48a', '#2a3550', '#1a1a1a'] },
  // ayakkabılar
  { id: 'sneaker', slot: 'shoes', name: 'Spor Ayakkabı', price: 800, colors: ['#eeeeee', '#1a1a1a', '#8a1a1a'] },
  { id: 'polished', slot: 'shoes', name: 'Rugan Ayakkabı', price: 2200, colors: ['#0a0a0a', '#4a2412'] },
  { id: 'boots', slot: 'shoes', name: 'Bot', price: 1400, colors: ['#3a2412', '#1a1a1a'] },
  // şapkalar
  { id: 'none', slot: 'hat', name: 'Şapkasız', price: 0, colors: ['#000000'] },
  { id: 'kasket', slot: 'hat', name: 'Kasket', price: 300, colors: ['#2a2a2a', '#5a4a3a', '#3a3a4a'] },
  { id: 'fedora', slot: 'hat', name: 'Fötr Şapka', price: 1800, colors: ['#151515', '#3a2a1a', '#e8e0d0'] },
  { id: 'bere', slot: 'hat', name: 'Bere', price: 150, colors: ['#1a1a1a', '#8a1a1a', '#2d5a2d'] },
  // aksesuar
  { id: 'glasses', slot: 'glasses', name: 'Güneş Gözlüğü', price: 1200, colors: ['#000000'] },
  { id: 'chain', slot: 'chain', name: 'Altın Zincir', price: 9000, colors: ['#d4af37'] },
  { id: 'tespih', slot: 'tespih', name: 'Kehribar Tespih', price: 2500, colors: ['#5a1a10'] },
  { id: 'bag1', slot: 'bag', name: 'Sırt Çantası (+30 kapasite)', price: 1500, capacity: 50, colors: ['#000000'] },
  { id: 'bag2', slot: 'bag', name: 'Büyük Valiz (+80 kapasite)', price: 6000, capacity: 100, colors: ['#000000'] },
];

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
  kartal: { name: 'Kartal 131', price: 18000, maxSpeed: 32, accel: 9, len: 4.3, wid: 1.7, hei: 1.35, hp: 700, colors: ['#e8e0d0', '#8a1a1a', '#1d3d6e', '#5a6a4a', '#c9b48a'], style: 'sedan' },
  taksi: { name: 'Sarı Taksi', price: 26000, maxSpeed: 36, accel: 10, len: 4.5, wid: 1.8, hei: 1.4, hp: 800, colors: ['#f2c200'], style: 'taxi' },
  dolmus: { name: 'Dolmuş Minibüs', price: 34000, maxSpeed: 28, accel: 7, len: 5.2, wid: 2.0, hei: 2.2, hp: 1000, colors: ['#f2c200', '#e8e8e8'], style: 'van' },
  sedan: { name: 'Lüks Sedan', price: 85000, maxSpeed: 44, accel: 13, len: 4.9, wid: 1.9, hei: 1.4, hp: 900, colors: ['#111111', '#e8e8e8', '#6a6a6a', '#1d2440'], style: 'sedan' },
  suv: { name: 'Karabasan SUV', price: 140000, maxSpeed: 42, accel: 12, len: 4.9, wid: 2.0, hei: 1.8, hp: 1400, colors: ['#0a0a0a', '#2a2a2a', '#e8e8e8'], style: 'suv' },
  gt: { name: 'Rüzgar GT', price: 260000, maxSpeed: 60, accel: 20, len: 4.5, wid: 1.95, hei: 1.15, hp: 800, colors: ['#c81010', '#f2c200', '#1060c8', '#111111', '#e8e8e8'], style: 'sport' },
  police: { name: 'Polis Ekip Aracı', price: 0, maxSpeed: 46, accel: 14, len: 4.7, wid: 1.85, hei: 1.45, hp: 1100, colors: ['#1d3d8e'], style: 'police' },
  bus: { name: 'Şehir Otobüsü', price: 0, maxSpeed: 22, accel: 5, len: 11, wid: 2.5, hei: 3.0, hp: 2500, colors: ['#d8d8d0'], style: 'bus' },
  swat: { name: 'Özel Harekat Zırhlısı', price: 0, maxSpeed: 40, accel: 11, len: 5.4, wid: 2.2, hei: 2.2, hp: 3000, colors: ['#1a1a1a'], style: 'swat' },
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

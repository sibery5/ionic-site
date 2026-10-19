// ÇAYCI'nın kendi simge seti. Hazır emoji ya da yazı tipi simgesi kullanılmaz: her simge burada 24×24'lük bir ızgarada,
// oyunun diliyle (koyu kahve kontur, sıcak sarı vurgu, krem kâğıt) elle çizilmiştir.
// Aynı çizim hem arayüzde (SVG) hem de 3B sahnedeki sipariş balonlarında (canvas, Path2D) kullanılır.

type Fill = 'ink' | 'paper' | 'accent' | 'good' | 'bad' | 'water' | 'tea' | 'line' | 'suit';

interface Part {
  d: string;
  /** dolgu rengi; yoksa sadece çizgi */
  f?: Fill;
  /** kontur (varsayılan: var) */
  s?: boolean;
  /** kontur kalınlığı */
  w?: number;
  /** konturun rengi (varsayılan mürekkep) */
  sc?: Fill;
}

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;

/** n uçlu yıldız / patlama (dış ve iç yarıçap) */
function burst(n: number, cx: number, cy: number, ro: number, ri: number, rot = -Math.PI / 2) {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro;
    const a = rot + (i * Math.PI) / n;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`;
  }
  return d + 'z';
}

/** yuvarlak yüz: emojilerin yerine geçen ifadeler hep aynı kafadan türer */
/** tek başına duran çizgiler yazının rengini izler (koyu menüde krem, açık balonda koyu) */
const L: Fill = 'line';
const face = (f: Fill = 'accent'): Part => ({ d: circle(12, 12.5, 8.5), f });
const dotEyes: Part = { d: circle(9.2, 11.2, 1.05) + circle(14.8, 11.2, 1.05), f: 'ink', s: false };

const ICONS = {
  star: [{ d: burst(5, 12, 12.8, 10, 4.3), f: 'accent', w: 1.6 }],
  starOff: [{ d: burst(5, 12, 12.8, 10, 4.3), f: 'paper', w: 1.6 }],
  check: [{ d: 'M5 12.6l4.4 4.4L19.2 7', w: 2.8, sc: L }],
  ring: [{ d: circle(12, 12, 7), w: 2, sc: L }],
  cross: [{ d: 'M6.5 6.5l11 11M17.5 6.5l-11 11', w: 2.6, sc: L }],
  alert: [{ d: 'M12 4v10', w: 3.4, sc: L }, { d: circle(12, 19.4, 1.7), f: L, s: false }],
  good: [{ d: circle(12, 12, 9.5), f: 'good' }, { d: 'M7.4 12.4l3.2 3.2 6-6.4', w: 2.4, sc: 'paper' }],
  bad: [{ d: circle(12, 12, 9.5), f: 'bad' }, { d: 'M8.4 8.4l7.2 7.2M15.6 8.4l-7.2 7.2', w: 2.4, sc: 'paper' }],
  lock: [
    { d: 'M8 11V8a4 4 0 0 1 8 0v3', w: 2.2, sc: L },
    { d: 'M5.5 11h13v9.5h-13z', f: 'accent' },
    { d: circle(12, 15.3, 1.5) + 'M12 15.6v2.6', f: 'ink', w: 1.4 },
  ],
  notebook: [
    { d: 'M6.5 3.5h11.2a1.5 1.5 0 0 1 1.5 1.5v14.5a1.5 1.5 0 0 1-1.5 1.5H6.5z', f: 'paper' },
    { d: 'M6.5 3.5v17', w: 2.4 },
    { d: 'M4.3 6.8h3.6M4.3 10.4h3.6M4.3 14h3.6M4.3 17.6h3.6', w: 1.6, sc: L },
    { d: 'M10.4 8h5.8M10.4 11.4h5.8M10.4 14.8h3.6', w: 1.3, sc: 'tea' },
  ],
  scale: [
    { d: 'M12 4.5v14.5M8 20.2h8M5 7.4h14', w: 1.8, sc: L },
    { d: 'M5 7.4l-2.6 6M5 7.4l2.6 6M19 7.4l-2.6 6M19 7.4l2.6 6', w: 1.2, sc: L },
    { d: 'M1.8 13.4h6.4a3.2 3.2 0 0 1-6.4 0zM15.8 13.4h6.4a3.2 3.2 0 0 1-6.4 0z', f: 'accent', w: 1.4 },
    { d: circle(12, 4.3, 1.4), f: 'accent', w: 1.2 },
  ],
  // ödül kupası yerine altın çay bardağı (ince belli) ve tabağı
  trophy: [
    { d: 'M8 3.5h8c0 3.5-1.6 5-1.6 7.2 0 2.2 1.9 3.3 1.9 5.3 0 1.9-1.8 2.7-4.3 2.7s-4.3-.8-4.3-2.7c0-2 1.9-3.1 1.9-5.3C9.6 8.5 8 7 8 3.5z', f: 'accent' },
    { d: 'M4.2 20.6h15.6', w: 2.4, sc: L },
    { d: 'M10.2 13.6c-.5.8-.7 1.5-.6 2.3', w: 1.2, sc: 'paper' },
    { d: 'M19.2 3.4v3.2M17.6 5h3.2', w: 1.2, sc: 'accent' },
  ],
  boss: [
    { d: 'M4 21.5c.4-4.6 3.6-7.4 8-7.4s7.6 2.8 8 7.4z', f: 'suit' },
    { d: circle(12, 8, 4), f: 'paper' },
    { d: 'M9.6 14.3L12 17l2.4-2.7', w: 1.4, sc: 'paper' },
    { d: 'M12 17l-1.3 1.6.9 3.2h.8l.9-3.2z', f: 'accent', w: 1 },
    { d: 'M10.1 9.6c1 .7 2.8.7 3.8 0', w: 1.4 },
    { d: 'M8.2 6.4c.8-1.9 2.2-2.6 3.8-2.6s3 .7 3.8 2.6', w: 1.6 },
  ],
  villain: [
    { d: 'M4 21.5c.4-4.6 3.6-7.4 8-7.4s7.6 2.8 8 7.4z', f: 'suit' },
    { d: circle(12, 9, 4), f: 'paper' },
    { d: 'M7.6 8.2h3.6l-.3 1.6a1.6 1.6 0 0 1-3 0zM12.8 8.2h3.6l-.3 1.6a1.6 1.6 0 0 1-3 0z', f: 'ink', w: 1 },
    { d: 'M5.8 5.4h12.4', w: 2.2 },
    { d: 'M8.4 5.4c.3-2 1.7-2.9 3.6-2.9s3.3.9 3.6 2.9z', f: 'suit', w: 1.2 },
  ],
  teapot: [
    { d: 'M5 12.6c0-3.3 3.1-5.6 7-5.6s7 2.3 7 5.6S15.9 19 12 19s-7-3.1-7-6.4z', f: 'accent' },
    { d: 'M9 7c.6-1.6 1.6-2.3 3-2.3S14.4 5.4 15 7', f: 'tea', w: 1.2 },
    { d: circle(12, 3.9, 1.1), f: 'tea', w: 1 },
    { d: 'M5.4 11.6L2.4 9.2', w: 2.4, sc: L },
    { d: 'M18.6 10.1c2.2 0 3 1.2 3 2.6s-1 2.6-3.2 2.8', w: 1.8, sc: L },
    { d: 'M5.5 20.6h13', w: 2.2, sc: L },
  ],
  phone: [
    { d: 'M7.5 2.5h9A1.5 1.5 0 0 1 18 4v16a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V4a1.5 1.5 0 0 1 1.5-1.5z', f: 'paper' },
    { d: 'M8.2 5h7.6v11.4H8.2z', f: 'accent', w: 1 },
    { d: circle(12, 18.9, 0.9), f: 'ink', s: false },
  ],
  ear: [
    { d: 'M4 7.2a8.5 8.5 0 0 0 0 7.6', w: 1.6, sc: 'accent' },
    { d: 'M8 9.5a5 5 0 1 1 10 0c0 3.2-2.9 3.9-3.3 6.6-.3 2.1-1.6 3.9-3.8 3.9a3.4 3.4 0 0 1-3.4-3.4', f: 'paper' },
    { d: 'M10.6 10a2.4 2.4 0 1 1 4.6 1c-.7 1-1.8 1.4-1.8 2.8', w: 1.5 },
  ],
  eyes: [
    { d: 'M1.8 12c2.3-3.7 6.9-3.7 9.2 0-2.3 3.7-6.9 3.7-9.2 0zM13 12c2.3-3.7 6.9-3.7 9.2 0-2.3 3.7-6.9 3.7-9.2 0z', f: 'paper', w: 1.4 },
    { d: circle(6.8, 12, 1.7) + circle(18, 12, 1.7), f: 'ink', s: false },
  ],
  anger: [
    face('bad'),
    { d: 'M7.4 9.6l3.2 1.3M16.6 9.6l-3.2 1.3', w: 1.8 },
    dotEyes,
    { d: 'M9.2 16.8c1.8-1.2 3.8-1.2 5.6 0', w: 1.8 },
    { d: 'M4.4 3.4c1.3.3 1.7 1.6.8 2.6M19.6 3.4c-1.3.3-1.7 1.6-.8 2.6', w: 1.5, sc: 'paper' },
  ],
  run: [
    { d: circle(15.4, 4.4, 2.3), f: L, s: false },
    { d: 'M14.2 7.8l-2.6 5.6 3.6 3-1 5', w: 2.4, sc: L },
    { d: 'M13.8 8.8l3.8 2.4M13.2 9l-4 1.6-1.6 2.8', w: 2, sc: L },
    { d: 'M11.6 13.4l-2 3.4-4 .8', w: 2.2, sc: L },
    { d: 'M2.4 8.2h3.4M1.6 11.8h3.4', w: 1.6, sc: 'accent' },
  ],
  skip: [
    { d: 'M4.5 6l7 6-7 6zM11.5 6l7 6-7 6z', f: L, w: 1, sc: L },
    { d: 'M20.5 6v12', w: 2.4, sc: L },
  ],
  back: [{ d: 'M9 6.5L4.5 11 9 15.5', w: 2.2, sc: L }, { d: 'M4.8 11H14a5 5 0 0 1 0 10h-2.5', w: 2.2, sc: L }],
  faceSweat: [
    face(),
    { d: 'M7.9 11.4c.7-.9 1.8-.9 2.5 0M13.6 11.4c.7-.9 1.8-.9 2.5 0', w: 1.5 },
    { d: 'M8.4 14.8c1.9 2.1 5.3 2.1 7.2 0', w: 1.6 },
    { d: 'M19 3.4c1.1 1.5 1.6 2.5 1.6 3.2a1.6 1.6 0 0 1-3.2 0c0-.7.5-1.7 1.6-3.2z', f: 'water', w: 1.1 },
  ],
  shrug: [
    face('paper'),
    dotEyes,
    { d: 'M7.6 8.4l2.6-.6M16.4 8.4l-2.6-.6', w: 1.4 },
    { d: 'M9.6 15.6h4.8', w: 1.6 },
    { d: 'M1.8 13.6l2 2.4 2-1.2M22.2 13.6l-2 2.4-2-1.2', w: 1.6, sc: L },
  ],
  lie: [face('paper'), dotEyes, { d: 'M12 12.8h9.6', w: 2.6, sc: 'accent' }, { d: 'M8.8 16.2c1.4 1 3.4 1 4.8 0', w: 1.5 }],
  mad: [
    face('bad'),
    { d: 'M7.2 8.8l3.4 1.8M16.8 8.8l-3.4 1.8', w: 2 },
    dotEyes,
    { d: 'M8.6 17.4c2-1.8 4.8-1.8 6.8 0', w: 1.8 },
  ],
  hush: [
    face('paper'),
    { d: 'M7.9 11c.7.8 1.8.8 2.5 0M13.6 11c.7.8 1.8.8 2.5 0', w: 1.4 },
    { d: 'M9.6 15.8h4.8', w: 1.6 },
    { d: 'M12 12.6v8.6', w: 3.2 },
    { d: 'M12 12.6v8.6', w: 1.4, sc: 'paper' },
  ],
  fire: [
    { d: 'M12 2.8c1.4 3.1 5.6 5.4 5.6 10.1A5.6 5.6 0 0 1 12 18.6a5.6 5.6 0 0 1-5.6-5.7c0-2.6 1.4-4 2.6-5.3.3 1.6 1 2.6 2 3.1-.3-2.6.1-5.4 1-7.9z', f: 'bad' },
    { d: 'M12 18.6c-1.7 0-2.8-1.2-2.8-2.8 0-1.7 1.5-2.6 2.2-4 .9 1.5 3.4 2.4 3.4 4 0 1.6-1.1 2.8-2.8 2.8z', f: 'accent', w: 1 },
    { d: 'M6 21.4h12', w: 2, sc: L },
  ],
  people: [
    { d: 'M10.5 20c.3-3.8 2.6-6 5.5-6s5.2 2.2 5.5 6z', f: 'accent' },
    { d: circle(16, 8, 3), f: 'paper' },
    { d: 'M2.5 21.5c.3-4.2 3-6.6 6.5-6.6s6.2 2.4 6.5 6.6z', f: 'suit' },
    { d: circle(9, 9.2, 3.4), f: 'paper' },
  ],
  boxOn: [{ d: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z', f: 'accent' }, { d: 'M7.6 12.2l3 3 5.8-6.2', w: 2.4 }],
  boxOff: [{ d: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z', f: 'paper' }],
  arrow: [{ d: 'M2.5 12h12', w: 3, sc: L }, { d: 'M12.5 5.8L21 12l-8.5 6.2z', f: 'accent', w: 1.4 }],
  boom: [{ d: burst(9, 12, 12, 10.5, 5.6, -0.3), f: 'accent', w: 1.4 }, { d: burst(7, 12, 12, 5.4, 2.6), f: 'bad', w: 1 }],
  // oyunun kendi nesneleri
  glass: [
    { d: 'M7.5 3h9c0 3.6-1.7 5.2-1.7 7.5 0 2.3 2 3.4 2 5.5 0 2-1.9 2.9-4.8 2.9s-4.8-.9-4.8-2.9c0-2.1 2-3.2 2-5.5C9.2 8.2 7.5 6.6 7.5 3z', f: 'paper' },
    { d: 'M9.9 9.2h4.2c-.2.5-.3.9-.3 1.3 0 2.3 2 3.4 2 5.5 0 2-1.9 2.9-3.8 2.9s-3.8-.9-3.8-2.9c0-2.1 2-3.2 2-5.5 0-.4-.1-.8-.3-1.3z', f: 'tea', s: false },
    { d: 'M3.8 21h16.4', w: 2.4, sc: L },
    { d: 'M10.2 13.2c-.5.8-.7 1.5-.6 2.3', w: 1.1, sc: 'paper' },
  ],
  tower: [
    { d: 'M4.6 11.4h5.6c0 2-1 2.8-1 4.1s1.2 1.9 1.2 3.1-1.2 1.6-3 1.6-3-.4-3-1.6 1.2-1.8 1.2-3.1-1-2.1-1-4.1z', f: 'tea' },
    { d: 'M13.8 11.4h5.6c0 2-1 2.8-1 4.1s1.2 1.9 1.2 3.1-1.2 1.6-3 1.6-3-.4-3-1.6 1.2-1.8 1.2-3.1-1-2.1-1-4.1z', f: 'tea' },
    { d: 'M9.2 2.6h5.6c0 2-1 2.8-1 4.1s1.2 1.9 1.2 3.1H8c0-1.2 1.2-1.8 1.2-3.1s-1-2.1-1-4.1z', f: 'accent' },
    { d: 'M5 9.8h14M2.6 21.4h18.8', w: 2, sc: L },
  ],
  spin: [
    { d: 'M19 12.5a7 7 0 1 1-2.2-5.1', w: 2.6, sc: L },
    { d: 'M20.2 3.6v5.2H15z', f: 'accent', w: 1.2 },
    { d: circle(12, 12.5, 2.2), f: 'tea', w: 1.2 },
  ],
  key: [
    { d: circle(7, 12, 4), f: 'accent' },
    { d: circle(7, 12, 1.5), f: 'ink', s: false },
    { d: 'M11 12h10.4M17.4 12v3.4M20.6 12v2.6', w: 2.4, sc: L },
  ],
  shard: [
    { d: 'M6 3l5 2.2 1.6-1.4 1 3.4 4.8 1.4-3.2 2.6 3.2 5.2-5.6-1.6-1.8 5.4-2-5.2-5 1 2.6-4.6L3.8 7.2l3.4-.4z', f: 'paper', w: 1.4 },
    { d: 'M9.6 9.6l2.2 2.2-1.6 2.2', w: 1.2, sc: 'tea' },
  ],
  calendar: [
    { d: 'M4 6h16v14.5H4z', f: 'paper' },
    { d: 'M4 6h16v4H4z', f: 'bad' },
    { d: 'M8 3.6v4M16 3.6v4', w: 2, sc: L },
    { d: circle(8.5, 14, 1) + circle(12, 14, 1) + circle(15.5, 14, 1) + circle(8.5, 17.4, 1), f: 'ink', s: false },
  ],
  chevron: [
    { d: 'M4.5 13.6L12 7.4l7.5 6.2', w: 3, sc: 'accent' },
    { d: 'M4.5 19L12 12.8l7.5 6.2', w: 3, sc: L },
    { d: burst(5, 12, 3.6, 2.4, 1) , f: 'accent', w: 0.8 },
  ],
  // dedikodu konuları
  deed: [
    { d: 'M7 4.5h10.5a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H9', f: 'paper' },
    { d: 'M7 4.5a2.5 2.5 0 0 0-2.5 2.5v1.5H9.5V7A2.5 2.5 0 0 0 7 4.5z', f: 'paper' },
    { d: 'M9.5 8.5V21', w: 1.8 },
    { d: 'M12 8.6h5M12 11.6h5M12 14.6h2.6', w: 1.3, sc: 'tea' },
    { d: circle(16.4, 17.6, 1.8), f: 'bad', w: 1 },
  ],
  money: [
    { d: circle(12, 12, 9), f: 'accent' },
    { d: circle(12, 12, 6.6), w: 1.1 },
    // ₺ işareti elle: dik çizgi, iki eğik çizgi ve kıvrım
    { d: 'M10.6 7.6v8.8c2.4 0 4.3-1.5 4.5-3.8M8.8 10.8l4.4-1.8M8.8 13.2l4.4-1.8', w: 1.6 },
  ],
  report: [
    { d: 'M5.5 4.5h13v17h-13z', f: 'paper' },
    { d: 'M9 2.8h6v3.2H9z', f: 'suit', w: 1 },
    { d: 'M8.4 9.4h7.2M8.4 12.2h7.2', w: 1.2, sc: 'tea' },
    // "bina çürük" çatlağı
    { d: 'M8.4 18l2-2.2 1.6 1.6 2.6-3.2', w: 1.6, sc: 'bad' },
  ],
  camera: [
    { d: 'M3 8h4l1.6-2.6h6.8L17 8h4v11.5H3z', f: 'suit', w: 1.2 },
    { d: circle(12, 13.6, 3.8), f: 'paper', w: 1.4 },
    { d: circle(12, 13.6, 1.6), f: 'tea', s: false },
    { d: 'M18.2 10.6h1.2', w: 1.6, sc: 'accent' },
  ],
  talk: [
    { d: 'M4 5.5h16v10H11l-4.5 4v-4H4z', f: 'paper' },
    { d: circle(8.4, 10.5, 1.1) + circle(12, 10.5, 1.1) + circle(15.6, 10.5, 1.1), f: 'ink', s: false },
  ],
  cat: [
    { d: 'M5 9.5L4.2 3.5l5 3.4a9 9 0 0 1 5.6 0l5-3.4-.8 6c1 1.3 1.5 2.9 1.5 4.5 0 4.2-3.8 6.9-8.5 6.9S3.5 18.2 3.5 14c0-1.6.5-3.2 1.5-4.5z', f: 'accent' },
    { d: 'M8.4 12.6h2M13.6 12.6h2', w: 1.8 },
    { d: 'M11.2 14.9h1.6L12 16z', f: 'bad', w: 0.8 },
    { d: 'M2.4 15.4l4-.4M2.6 17.6l3.8-1M21.6 15.4l-4-.4M21.4 17.6l-3.8-1', w: 1.1 },
  ],
} satisfies Record<string, Part[]>;

export type IconName = keyof typeof ICONS;

const SVG_FILL: Record<Fill, string> = {
  ink: 'var(--ic-ink, #2a1a10)',
  paper: 'var(--ic-paper, #f6ecd6)',
  accent: 'var(--ic-accent, #e8a33a)',
  good: 'var(--ic-good, #5aa85a)',
  bad: 'var(--ic-bad, #c9452c)',
  water: 'var(--ic-water, #6fb7e0)',
  tea: 'var(--ic-tea, #8e1d10)',
  line: 'currentColor',
  suit: 'var(--ic-suit, #44526e)',
};

const cache = new Map<string, string>();

/** Satır içi SVG simge (HTML dizgisi). Boyutu yazının boyutunu izler (1.15em). */
export function icon(name: IconName, cls = ''): string {
  const key = name + '|' + cls;
  let svg = cache.get(key);
  if (!svg) {
    const parts = (ICONS[name] as Part[])
      .map(
        (p) =>
          `<path d="${p.d}" fill="${p.f ? SVG_FILL[p.f] : 'none'}" stroke="${p.s === false ? 'none' : SVG_FILL[p.sc ?? 'ink']}" stroke-width="${p.w ?? 1.6}" stroke-linecap="round" stroke-linejoin="round"/>`,
      )
      .join('');
    svg = `<svg class="ic ic-${name}${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${parts}</svg>`;
    cache.set(key, svg);
  }
  return svg;
}

const CANVAS_FILL: Record<Fill, string> = { ink: '#2a1a10', paper: '#f6ecd6', accent: '#e8a33a', good: '#5aa85a', bad: '#c9452c', water: '#6fb7e0', tea: '#8e1d10', line: '#2a1a10', suit: '#44526e' };

/** Aynı simgeyi canvas'a çizer (sipariş balonları, tepsi göstergesi). (cx, cy) merkez, size piksel. */
export function drawIcon(ctx: CanvasRenderingContext2D, name: IconName, cx: number, cy: number, size: number, over: Partial<Record<Fill, string>> = {}) {
  const pal = { ...CANVAS_FILL, ...over };
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const p of ICONS[name] as Part[]) {
    const path = new Path2D(p.d);
    if (p.f) {
      ctx.fillStyle = pal[p.f];
      ctx.fill(path);
    }
    if (p.s !== false) {
      ctx.strokeStyle = pal[p.sc ?? 'ink'];
      ctx.lineWidth = p.w ?? 1.6;
      ctx.stroke(path);
    }
  }
  ctx.restore();
}

/** Bütün simgelerin adları (vitrin ve test için). */
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

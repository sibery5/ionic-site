// Deniz trafiği (B4 [deniz]): Şehir Hatları vapurları, Boğaz'dan geçen konteyner gemileri ve tankerler, Marmara'da
// transit gemiler ve demir yerinde bekleyen gemiler, balıkçı tekneleri ve lüks yatlar.
//
// Trafik düzeni (gerçek Boğaz trafik ayırım düzeni benzeri, sağdan seyir):
//  - Kuzeye giden şerit doğu yakasında (x≈325, Kız Kulesi açığında x≈350), güneye giden batıda (x≈235); şeritler
//    arası ≥ 90 m; yanaşık vapurlardan ≥ 83 m. Marmara'da batıya giden şerit z=1100, doğuya giden z=1230; Boğaz gemileri sağa (sancağa) dönerek
//    katılır/ayrılır, şerit kesişmez. Demir yeri (z≈1330-1480) şeritlerin güneyinde.
//  - Köprü geçişi (z -660..-240): Gemi Trafik Hizmetleri (GTH) gibi tek yönlü geçiş — aynı anda tek büyük gemi; diğeri
//    bekleme noktasında yavaşlayıp durur. Köprü altında şerit ortada (x 306-318), serbest yükseklik ≥ hava yüksekliği.
//  - Vapurlar iskelelerin kendi yanaşma yerlerine (iskele başına 1-2 yer) yanaşır.
//  - Çatışmadan kaçınma (COLREG benzeri): en yakın yaklaşma noktası (CPA/TCPA) ile tehdit tespiti; öncelik sırası
//    (demirli/yanaşık > dar kanalda büyük gemi > vapur > yat > balıkçı); eşit sırada kafa kafaya iki taraf sancağa,
//    karşılaşmada sancağında gemi gören yol verir, yetişen yol verir. Yol veren sancağa dönüp yavaşlar (şerit gemisi
//    yalnız yavaşlar); yol hakkı olan da çok yaklaşınca yavaşlar (Kural 17). Aynı yönde önündekiyle mesafe korunur.
//  - Küçük tekneler kıyı bantlarında dolaşır (şeritlere girmez), kara yoklaması ile kıyıya bindirmez.
// Modeller: yüksek çözünürlüklü gövde (bayraklı pruva, soğan baş, ayna kıç, renk bantları), üst yapılar, pencere
// sıraları (gece yanar), konteynerler, tanker boru ağı, vinçler, seyir fenerleri. LOD: 650 m ötesinde yalnız gövde +
// fenerler. Gemi konumları deniz şaderine (OCEAN.uShipP/D) gönderilir: gövde köpüğü ve Kelvin dümen suyu.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lightize, makeLightsMat } from '../entities/vehicles.js';
import { Wakes } from '../entities/boats.js';
import { isLand as isLandRaw, inBridge, WATER_Y, ISLAND } from './map.js';
// gemiler için kara: köprü tabliyesi kara sayılmaz (altından geçilir; ayaklar kıyıda)
const isLand = (x, z) => isLandRaw(x, z) && !inBridge(x, z);
import { clamp, angleDiff, RNG } from '../core/util.js';
import { signTexture, containerTexture } from '../core/textures.js';
import { OCEAN, MAX_SHIPS, nightGlowMaterial, oceanObstacle } from './shaders.js';
import { DECK_TOP, bosphorusDeckY } from './bridge_profile.js';
import { vc, B3, CY, rod, railing, winRow, winRowX, shipHull } from './ships_hull.js';
import { buildYacht } from './ships_yachts.js';

const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15 });
const winMat = nightGlowMaterial(0x161c22, 0xffd890, 1.5, { rough: 0.12, metal: 0.5 });
const boxMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: containerTexture(), roughness: 0.6, metalness: 0.25 });
const navMat = makeLightsMat();

// İskeleler (yanaşma noktası, yön, iskelenin kıyı tarafı) ve yanaşma yerleri (iskele boyunca ofset, m)
export const PIERS = {
  eminonu: { name: 'Eminönü', x: -95, z: 183.5, h: Math.PI / 2, side: 'z+', slots: [0] },
  karakoy: { name: 'Karaköy', x: -70, z: 76.5, h: -Math.PI / 2, side: 'z-', slots: [130] },
  kadikoy: { name: 'Kadıköy', x: 413.5, z: 548, h: 0, side: 'x+', slots: [0] },
  uskudar: { name: 'Üsküdar', x: 413.5, z: -40, h: Math.PI, side: 'x+', slots: [0, -230] },
  besiktas: { name: 'Beşiktaş', x: 206.5, z: -385, h: Math.PI, side: 'x-', slots: [0] },
};
const FERRY_B = 11, FERRY_L = 52;
// yanaşma yeri: iskele yüzünden (B/2 + 0.6) m açıkta vapur merkezi
function slotOf(key, k) {
  const p = PIERS[key], along = p.side[0] === 'z';
  const nx = p.side === 'x+' ? 1 : p.side === 'x-' ? -1 : 0, nz = p.side === 'z+' ? 1 : p.side === 'z-' ? -1 : 0;
  const o = p.slots[k] || 0;
  const px = p.x + (along ? o : 0), pz = p.z + (along ? 0 : o);
  return { pier: key, slot: k, px, pz, nx, nz, x: px + nx * (1.0 - FERRY_B / 2 - 0.6), z: pz + nz * (1.0 - FERRY_B / 2 - 0.6), h: p.h, along };
}
// Vapur hatları: yanaşma yeri → ara noktalar → yanaşma yeri (ileri-geri)
const FERRY_LINES = [
  [['eminonu', 0], [60, 160], [150, 156], [260, 300], ['kadikoy', 0]],
  [['karakoy', 0], [185, 100], [300, 40], ['uskudar', 0]],
  [['besiktas', 0], [240, -320], ['uskudar', 1]],
];
// Büyük gemi devresi: Marmara (batıya giden şerit) → Boğaz kuzey şeridi → (Karadeniz, görüş dışı) → güney şeridi
// → Marmara batıya. hold: GTH bekleme bölgesi, jump: başa sarma (görüş dışında)
const BIG_ROUTE = [
  { x: 1700, z: 1100 }, { x: 560, z: 1100 }, { x: 420, z: 1050 }, { x: 325, z: 930 }, { x: 325, z: 480 }, { x: 350, z: 360 }, { x: 350, z: 230 },
  { x: 325, z: 120 }, { x: 325, z: -260, gate: 'N' }, { x: 318, z: -400 }, { x: 318, z: -500 }, { x: 380, z: -660 }, { x: 380, z: -1700, jump: 13 },
  { x: 292, z: -1700 }, { x: 292, z: -660, gate: 'S' }, { x: 306, z: -500 }, { x: 306, z: -400 }, { x: 235, z: -240 }, { x: 235, z: 1010 },
  { x: 190, z: 1100 }, { x: -1700, z: 1100, jump: 0 },
];
// Köprü geçiş bölgesi (tek yönlü)
const GATE = { z0: -660, z1: -240 };
// Marmara transit şeritleri
const MARMARA_W = [{ x: 1700, z: 1100 }, { x: -1700, z: 1100, jump: 0 }];
const MARMARA_E = [{ x: -1700, z: 1230 }, { x: 1700, z: 1230, jump: 0 }];
const ANCHORAGE = [[-650, 1350, 0.6], [-380, 1440, 1.9], [-110, 1340, 2.6], [560, 1390, 0.3], [860, 1470, 1.2]];

// Şehir Hatları vapuru: çift başlı (iki yöne giden) gövde, siyah usturmaça bandı, iki kapalı yolcu salonu,
// açık üst güverte, iki uçta kaptan köşkü, sarı-siyah baca, cankurtaran salları, bayrak.
function buildFerry() {
  const L = 52, B = 11;
  const H = shipHull({ L, B, D: 2.0, F: 2.4, bow: 0.2, double: true, flare: 0, sheer: 0.18, cBottom: 0x7a1a14, cBoot: 0x111111, cTop: 0xf2f0ea, cStripe: 0x111111 });
  const P = [...H.parts], W = [], N = [];
  P.push(vc(H.deck, 0x8a7a64));
  const dy = 2.4, wht = 0xf2f0ea, dark = 0x2a2a2a;
  // usturmaça (siyah lastik bant) güverte seviyesinde
  for (const s of [-1, 1]) P.push(vc(rod(s * (B / 2 + 0.05), dy - 0.15, -L * 0.36, s * (B / 2 + 0.05), dy - 0.15, L * 0.36, 0.22, 6), 0x0e0e0e));
  // ana salon
  P.push(vc(B3(B * 0.9, 2.7, L * 0.74, 0, dy + 1.35, 0), wht));
  P.push(vc(B3(B * 0.94, 0.15, L * 0.78, 0, dy + 2.78, 0), dark));
  winRow(W, B * 0.45 + 0.01, dy + 1.55, -L * 0.35, L * 0.35, 16, 1.6, 1.15);
  for (const zz of [-1, 1]) winRowX(W, zz * (L * 0.37 + 0.01), dy + 1.55, -B * 0.4, B * 0.4, 5, 1.3, 1.1);
  // üst salon
  const y2 = dy + 2.85;
  P.push(vc(B3(B * 0.76, 2.4, L * 0.52, 0, y2 + 1.2, -L * 0.02), wht));
  P.push(vc(B3(B * 0.8, 0.14, L * 0.56, 0, y2 + 2.47, -L * 0.02), dark));
  winRow(W, B * 0.38 + 0.01, y2 + 1.35, -L * 0.27, L * 0.23, 12, 1.5, 1.0);
  // açık güverte korkulukları ve banklar
  for (const s of [-1, 1]) {
    railing(P, 0x3a3a3a, s * B * 0.46, -L * 0.38, s * B * 0.46, L * 0.38, y2 - 0.05, 1.0, 1.4);
    railing(P, 0x3a3a3a, s * B * 0.4, -L * 0.3, s * B * 0.4, L * 0.27, y2 + 2.52, 0.9, 1.6);
    for (let i = 0; i < 4; i++) P.push(vc(B3(0.5, 0.45, 2.2, s * B * 0.3, y2 + 0.23, L * 0.29 + (i - 1.5) * 0.01 + (s > 0 ? 0 : 0) - 0.0), 0x6a4a2a));
  }
  for (const zz of [-1, 1]) railing(P, 0x3a3a3a, -B * 0.44, zz * L * 0.38, B * 0.44, zz * L * 0.38, y2 - 0.05, 1.0, 1.4);
  // cankurtaran sal kapsülleri (beyaz silindirler) ve turuncu simitler
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) P.push(vc(CY(0.42, 0.42, 1.4, 10, s * B * 0.31, y2 + 2.95, -L * 0.18 + i * 3.2, 'z'), 0xf8f8f8));
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) P.push(vc(new THREE.TorusGeometry(0.32, 0.08, 6, 12).rotateY(Math.PI / 2).translate(s * (B * 0.451 + 0.06), dy + 2.3, -L * 0.25 + i * L * 0.25), 0xff6a10));
  // iki uçta kaptan köşkü
  for (const zz of [-1, 1]) {
    P.push(vc(B3(B * 0.46, 1.6, 2.8, 0, y2 + 3.35, zz * L * 0.19), wht));
    P.push(vc(B3(B * 0.5, 0.12, 3.1, 0, y2 + 4.2, zz * L * 0.19), dark));
    W.push(B3(B * 0.42, 0.75, 0.06, 0, y2 + 3.5, zz * (L * 0.19 + 1.41)));
    for (const s of [-1, 1]) W.push(B3(0.06, 0.75, 2.2, s * B * 0.231, y2 + 3.5, zz * L * 0.19));
    P.push(vc(CY(0.05, 0.05, 2.6, 5, 0, y2 + 5.4, zz * L * 0.19), 0x333333));
    N.push(lightize(new THREE.SphereGeometry(0.16, 8, 6).translate(0, y2 + 6.7, zz * L * 0.19), 0xdddddd, 0xffffff, 0));
  }
  // baca: krem-sarı gövde, siyah tepe, ince kırmızı şerit
  P.push(vc(CY(1.05, 1.25, 3.4, 16, 0, y2 + 4.1, -L * 0.04), 0xe8a020));
  P.push(vc(CY(1.07, 1.07, 0.9, 16, 0, y2 + 6.2, -L * 0.04), 0x111111));
  P.push(vc(CY(1.09, 1.09, 0.18, 16, 0, y2 + 5.55, -L * 0.04), 0xb01010));
  // bayrak direği + bayrak
  P.push(vc(CY(0.04, 0.04, 3.2, 5, 0, y2 + 4.1, -L * 0.33), 0xdddddd));
  P.push(vc(B3(0.03, 0.9, 1.4, 0, y2 + 5.2, -L * 0.33 - 0.7), 0xc8102e));
  // borda ışıkları
  N.push(lightize(new THREE.SphereGeometry(0.2, 8, 6).translate(B * 0.47, dy + 3.0, L * 0.3), 0x501010, 0xff2020, 0));
  N.push(lightize(new THREE.SphereGeometry(0.2, 8, 6).translate(-B * 0.47, dy + 3.0, L * 0.3), 0x105010, 0x20ff40, 0));
  // güverte lambaları (gece)
  for (let i = 0; i < 6; i++) N.push(lightize(new THREE.SphereGeometry(0.12, 6, 4).translate((i % 2 ? 1 : -1) * B * 0.38, y2 + 2.35, -L * 0.25 + i * 4), 0xeeeeee, 0xffe0b0, 0));
  const g = finish(P, W, N);
  const sign = new THREE.MeshBasicMaterial({ map: signTexture('ŞEHİR HATLARI', '#f2f0ea', '#1d3d6e', 512, 96) });
  const sg = mergeGeometries([new THREE.PlaneGeometry(7, 1.0).rotateY(Math.PI / 2).translate(B * 0.45 + 0.03, dy + 3.4, 0), new THREE.PlaneGeometry(7, 1.0).rotateY(-Math.PI / 2).translate(-B * 0.45 - 0.03, dy + 3.4, 0)]);
  g.add(new THREE.Mesh(sg, sign));
  return { g, L, B, kind: 'ferry' };
}

// Konteyner gemisi: soğan baş, baş kasarası ve dalgakıran, 9 sıra oluklu konteyner istifi, bağlama köprüleri,
// kıçta 4 katlı yaşam mahalli + köprüüstü kanatları, radar direği, şirket renkli baca. Hava yüksekliği ≤ 16.5 m
// (köprü altı serbest yükseklik ~19 m).
function buildCargo(rng) {
  const L = 82, B = 14;
  const top = rng.pick([0x1d3d6e, 0x2a4a2a, 0x7a1a1a, 0x22303a, 0x16508a]);
  const H = shipHull({ L, B, D: 4.6, F: 4.2, bow: 0.2, stern: 0.82, flare: 0.22, sheer: 0.35, bulb: 4, cTop: top, cStripe: 0xe8e8e8 });
  const P = [...H.parts], W = [], N = [], K = [];
  P.push(vc(H.deck, 0x5a4a40));
  const dy = 4.2;
  // baş kasarası + dalgakıran + vinç/ırgat
  P.push(vc(B3(B * 0.82, 1.6, 8, 0, dy + 0.8 + H.deckY(0.95) - dy, L * 0.43), top));
  P.push(vc(B3(B * 0.7, 1.4, 0.3, 0, dy + 2.2, L * 0.39), 0xd8d8d8));
  for (const s of [-1, 1]) P.push(vc(CY(0.5, 0.5, 0.8, 10, s * 2.2, dy + 1.9, L * 0.44, 'x'), 0x2a2a2a));
  for (const s of [-1, 1]) P.push(vc(CY(0.55, 0.55, 0.3, 10, s * B * 0.42, dy - 0.6, L * 0.44, 'x'), 0x0a0a0a)); // demir loçası
  // konteyner istifi
  const cols = [0xc81010, 0x1d5aa8, 0x2d7a3a, 0xe8a020, 0xd8d8d8, 0x7a3a8a, 0x5a3a2a, 0x1a8a8a, 0xc85a10];
  for (let bay = 0; bay < 7; bay++) {
    const z = -L * 0.2 + bay * 6.55;
    const hgt = 2 + Math.floor(rng.next() * 3);
    for (let row = -2; row <= 2; row++) for (let tier = 0; tier < hgt; tier++) {
      if ((bay === 6 || bay === 0) && Math.abs(row) > 1) continue;
      if (rng.next() < 0.06) continue;
      K.push(vc(B3(2.44, 2.55, 6.06, row * 2.5, dy + 1.35 + tier * 2.6, z), rng.pick(cols), true));
    }
    // ambar kapağı + bağlama köprüsü
    P.push(vc(B3(B * 0.84, 0.35, 6.2, 0, dy + 0.1, z), 0x3a4a3a));
    if (bay < 6) P.push(vc(B3(B * 0.86, 3.2, 0.25, 0, dy + 1.8, z + 3.28), 0xb8b8b0));
  }
  // yaşam mahalli (kıç)
  const sz = -L * 0.39, sw = B * 0.86;
  for (let k = 0; k < 3; k++) {
    const w = sw - k * 0.6, d = 9 - k * 0.4;
    P.push(vc(B3(w, 2.45, d, 0, dy + 1.25 + k * 2.5, sz), 0xf0f0ea));
    P.push(vc(B3(w + 0.3, 0.1, d + 0.3, 0, dy + 2.5 + k * 2.5, sz), 0xc8c8c0));
    winRowX(W, sz + d / 2 + 0.01, dy + 1.4 + k * 2.5, -w * 0.42, w * 0.42, 7, 0.9, 0.8);
    winRow(W, w / 2 + 0.01, dy + 1.4 + k * 2.5, sz - d * 0.4, sz + d * 0.4, 4, 0.9, 0.8);
  }
  // köprüüstü ve kanatları
  const by = dy + 7.5 + 1.1;
  P.push(vc(B3(B * 0.7, 2.2, 6, 0, by, sz + 0.5), 0xf0f0ea));
  P.push(vc(B3(B * 1.04, 0.35, 2.6, 0, by + 0.7, sz + 2.2), 0xf0f0ea));
  P.push(vc(B3(B * 0.75, 0.15, 6.4, 0, by + 1.15, sz + 0.5), 0x2a2a2a));
  W.push(B3(B * 0.66, 1.0, 0.06, 0, by + 0.3, sz + 3.52));
  railing(P, 0xd8d8d8, -B * 0.52, sz + 3.4, B * 0.52, sz + 3.4, by + 0.88, 0.9, 1.2);
  // radar direği
  P.push(vc(CY(0.12, 0.15, 2.6, 6, 0, by + 2.45, sz), 0xd8d8d8));
  P.push(vc(B3(2.6, 0.12, 0.3, 0, by + 2.9, sz), 0x333333));
  // baca (şirket bandı)
  P.push(vc(B3(3.0, 3.6, 3.6, 0, dy + 9.4, sz - 3.6), 0xf0f0ea));
  P.push(vc(B3(3.05, 1.0, 3.65, 0, dy + 9.9, sz - 3.6), rng.pick([0xc81010, 0x1d5aa8, 0xe8a020, 0x2d7a3a])));
  P.push(vc(B3(3.06, 0.5, 3.66, 0, dy + 11.0, sz - 3.6), 0x111111));
  // kıç bayrak direği
  P.push(vc(CY(0.05, 0.05, 3, 5, 0, dy + 1.5 + H.deckY(0.02) - dy, -L * 0.49), 0xdddddd));
  N.push(lightize(new THREE.SphereGeometry(0.3, 8, 6).translate(B * 0.52, by + 0.75, sz + 2.2), 0x501010, 0xff2020, 0));
  N.push(lightize(new THREE.SphereGeometry(0.3, 8, 6).translate(-B * 0.52, by + 0.75, sz + 2.2), 0x105010, 0x20ff40, 0));
  N.push(lightize(new THREE.SphereGeometry(0.32, 8, 6).translate(0, by + 3.85, sz), 0xdddddd, 0xffffff, 0));
  N.push(lightize(new THREE.SphereGeometry(0.32, 8, 6).translate(0, dy + 3.2, L * 0.45), 0xdddddd, 0xffffff, 0));
  for (let i = 0; i < 3; i++) N.push(lightize(new THREE.SphereGeometry(0.16, 6, 4).translate(0, dy + 3.4, -L * 0.18 + i * 15), 0xeeeeee, 0xffe8c0, 0));
  return { g: finish(P, W, N, K), L, B, kind: 'cargo' };
}

// Ham petrol/ürün tankeri: alçak uzun güverte, boru demeti, ortada manifold + hortum vinci, baştan kıça yükseltilmiş
// yürüme köprüsü, havalandırma direkleri, kıç üst yapısı. Gövde koyu, güverte kırmızı-kahve.
function buildTanker(rng) {
  const L = 86, B = 15;
  const top = rng.pick([0x1a1a1a, 0x4a1414, 0x14283a]);
  const H = shipHull({ L, B, D: 5.2, F: 4.0, bow: 0.18, stern: 0.86, flare: 0.18, sheer: 0.3, bulb: 4.4, cTop: top, cStripe: null });
  const P = [...H.parts], W = [], N = [];
  P.push(vc(H.deck, 0x7a3428));
  const dy = 4.0;
  // boru demeti ve yürüme köprüsü
  for (let i = 0; i < 5; i++) P.push(vc(CY(0.3, 0.3, L * 0.62, 8, (i - 2) * 0.9, dy + 0.55, L * 0.05, 'z'), 0xb0b0a0));
  P.push(vc(B3(1.4, 0.12, L * 0.66, 3.2, dy + 2.3, L * 0.06), 0x9a9a8a));
  for (let z = -L * 0.26; z < L * 0.38; z += 5) { P.push(vc(B3(0.12, 2.3, 0.12, 2.55, dy + 1.15, z), 0x9a9a8a), vc(B3(0.12, 2.3, 0.12, 3.85, dy + 1.15, z), 0x9a9a8a)); }
  railing(P, 0xd8c830, 2.5, -L * 0.26, 2.5, L * 0.38, dy + 2.36, 0.8, 2.5);
  railing(P, 0xd8c830, 3.9, -L * 0.26, 3.9, L * 0.38, dy + 2.36, 0.8, 2.5);
  // manifold + hortum vinci
  P.push(vc(B3(B * 0.7, 1.5, 3, 0, dy + 0.75, L * 0.02), 0xd0c8b0));
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) P.push(vc(CY(0.22, 0.22, 2.2, 8, s * (B * 0.25 + 1.1), dy + 0.9, L * 0.02 - 1.2 + i * 0.5, 'x'), 0xc81010));
  P.push(vc(CY(0.35, 0.45, 6, 8, -B * 0.32, dy + 3, L * 0.02), 0xe8c020));
  P.push(vc(rod(-B * 0.32, dy + 5.8, L * 0.02, B * 0.05, dy + 4.2, L * 0.02 + 5, 0.22), 0xe8c020));
  // havalandırma direkleri ve genleşme kubbeleri
  for (let z = -L * 0.22; z < L * 0.36; z += 9) { P.push(vc(CY(0.15, 0.15, 3.6, 6, -4.5, dy + 1.8, z), 0xd8d8c8), vc(new THREE.SphereGeometry(0.9, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(5.5, dy, z), 0x9a9a8a)); }
  // baş kasarası
  P.push(vc(B3(B * 0.8, 1.6, 9, 0, H.deckY(0.95) + 0.8, L * 0.42), top));
  P.push(vc(B3(B * 0.66, 1.3, 0.3, 0, dy + 2.4, L * 0.37), 0xd8d8d8));
  // kıç üst yapısı
  const sz = -L * 0.4;
  for (let k = 0; k < 3; k++) {
    const w = B * 0.84 - k * 0.6, d = 10 - k * 0.5;
    P.push(vc(B3(w, 2.45, d, 0, dy + 1.25 + k * 2.5, sz), 0xf0f0ea));
    winRowX(W, sz + d / 2 + 0.01, dy + 1.4 + k * 2.5, -w * 0.42, w * 0.42, 8, 0.9, 0.8);
    winRow(W, w / 2 + 0.01, dy + 1.4 + k * 2.5, sz - d * 0.4, sz + d * 0.4, 4, 0.9, 0.8);
  }
  const by = dy + 8.6;
  P.push(vc(B3(B * 0.7, 2.2, 6.5, 0, by, sz + 0.8), 0xf0f0ea));
  P.push(vc(B3(B * 1.04, 0.35, 2.6, 0, by + 0.7, sz + 2.6), 0xf0f0ea));
  W.push(B3(B * 0.66, 1.0, 0.06, 0, by + 0.3, sz + 4.07));
  P.push(vc(CY(0.12, 0.15, 2.4, 6, 0, by + 2.3, sz), 0xd8d8d8));
  P.push(vc(B3(3.2, 3.8, 4, 0, dy + 9.6, sz - 4), 0x1a1a1a));
  P.push(vc(B3(3.25, 1.0, 4.05, 0, dy + 10.2, sz - 4), 0xc81010));
  N.push(lightize(new THREE.SphereGeometry(0.3, 8, 6).translate(B * 0.52, by + 0.75, sz + 2.6), 0x501010, 0xff2020, 0));
  N.push(lightize(new THREE.SphereGeometry(0.3, 8, 6).translate(-B * 0.52, by + 0.75, sz + 2.6), 0x105010, 0x20ff40, 0));
  N.push(lightize(new THREE.SphereGeometry(0.32, 8, 6).translate(0, by + 3.6, sz), 0xdddddd, 0xffffff, 0));
  N.push(lightize(new THREE.SphereGeometry(0.32, 8, 6).translate(0, dy + 3.4, L * 0.45), 0xdddddd, 0xffffff, 0));
  return { g: finish(P, W, N), L, B, kind: 'tanker' };
}

// Ahşap balıkçı teknesi (gırgır tipi): renkli bordalı gövde, kaptan köşkü, direk + bum, ağ yığını, şamandıralar,
// gece parlak lamba.
function buildFishing(rng) {
  const L = 12, B = 3.8;
  const c = rng.pick([0x2a6ab0, 0x2d7a4a, 0xe8e8e8, 0xc84a1a, 0x1d3d8e]);
  const H = shipHull({ L, B, D: 0.9, F: 1.2, bow: 0.32, stern: 0.7, flare: 0.25, sheer: 0.6, cBottom: 0x8a1a1a, cBoot: 0xf0f0f0, cTop: c, cStripe: 0xf0f0f0, nL: 28 });
  const P = [...H.parts], W = [], N = [];
  P.push(vc(H.deck, 0x9a7a54));
  // küpeşte (ahşap üst kenar)
  for (const s of [-1, 1]) P.push(vc(rod(s * B * 0.47, 1.35, -L * 0.42, s * B * 0.4, 1.6, L * 0.4, 0.06, 5), 0x6a4a2a));
  P.push(vc(B3(1.9, 1.7, 2.0, 0, 2.05, -L * 0.18), 0xf0f0ea));
  P.push(vc(B3(2.1, 0.12, 2.2, 0, 2.95, -L * 0.18), 0xc81010));
  W.push(B3(1.6, 0.55, 0.06, 0, 2.35, -L * 0.18 + 1.01));
  for (const s of [-1, 1]) W.push(B3(0.06, 0.5, 1.2, s * 0.96, 2.35, -L * 0.18));
  P.push(vc(CY(0.07, 0.08, 5.5, 6, 0, 3.9, L * 0.12), 0x6a4a2a));
  P.push(vc(rod(0, 5.6, L * 0.12, 0, 1.6, L * 0.38, 0.04), 0x333333));
  P.push(vc(rod(0, 3.4, L * 0.12, 0, 1.8, -L * 0.36, 0.05), 0x6a4a2a));
  P.push(vc(new THREE.SphereGeometry(1, 10, 6).scale(1.3, 0.45, 1.6).translate(0, 1.4, L * 0.25), 0x3a6a3a)); // ağ yığını
  for (let i = 0; i < 6; i++) P.push(vc(new THREE.SphereGeometry(0.14, 8, 6).translate(B * 0.44, 1.35, -L * 0.3 + i * 0.9), 0xff7a10));
  P.push(vc(B3(0.03, 0.4, 0.6, 0, 3.3, -L * 0.18 - 0.6), 0xc8102e));
  N.push(lightize(new THREE.SphereGeometry(0.14, 8, 6).translate(0, 6.7, L * 0.12), 0xdddddd, 0xffffff, 0));
  N.push(lightize(new THREE.SphereGeometry(0.22, 8, 6).translate(0, 4.6, L * 0.12 + 0.2), 0xeeeeee, 0xfff0d0, 0));
  return { g: finish(P, W, N), L, B, kind: 'fishing' };
}

// Trafik yatı (28 m mega yat, ships_yachts.js)
function buildTrafficYacht(rng) {
  const y = buildYacht('megayat', rng.pick([0xf7f7f5, 0xf7f7f5, 0x1a2430, 0x7d8a96]), rng.pick([0x1a2a3a, 0x8a9098, 0x0f1418]));
  y.lightsMat.userData.uA.value.set(1.5, 0.6, 0, 0);
  return { g: y.group, L: 28, B: 6.6, kind: 'yacht', lights: y.lightsMat };
}

function finish(P, W, N, K) {
  const g = new THREE.Group();
  const hm = new THREE.Mesh(mergeGeometries(P.map((x) => (x.index ? x.toNonIndexed() : x)).map((x) => { if (x.attributes.uv) x.deleteAttribute('uv'); return x; })), hullMat);
  hm.castShadow = true; hm.receiveShadow = true; g.add(hm);
  if (K && K.length) { const km = new THREE.Mesh(mergeGeometries(K), boxMat); km.castShadow = true; km.receiveShadow = true; g.add(km); }
  if (W.length) g.add(new THREE.Mesh(mergeGeometries(W.map((x) => { const n = x.index ? x.toNonIndexed() : x; if (n.attributes.uv) n.deleteAttribute('uv'); return n; })), winMat));
  const nav = N.length ? new THREE.Mesh(mergeGeometries(N), navMat) : null;
  // LOD: uzakta yalnız gövde (konteyner/pencere yok) + seyir fenerleri (gece uzaktan görünür)
  const lod = new THREE.LOD();
  const far = new THREE.Group(); far.add(new THREE.Mesh(hm.geometry, hullMat));
  lod.addLevel(g, 0); lod.addLevel(far, 650);
  const root = new THREE.Group(); root.add(lod); if (nav) root.add(nav);
  return root;
}

// Küçük tekne dolaşım bölgeleri [x0,z0,x1,z1]: kıyı bantları, büyük gemi şeritlerinden ve vapur hatlarından uzak
const REGIONS = {
  marmaraE: [835, 850, 985, 1000],
    marmaraW: [-900, 850, -420, 1000],
  marmara: [-380, 850, 120, 1000],
};
function clearWater(x, z, m) {
  if (isLand(x, z)) return false;
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; if (isLand(x + Math.cos(a) * m, z + Math.sin(a) * m)) return false; }
  return Math.hypot(x - ISLAND.x, z - ISLAND.z) > ISLAND.r + m + 6;
}
function segClear(ax, az, bx2, bz, m) {
  const n = Math.ceil(Math.hypot(bx2 - ax, bz - az) / 8);
  for (let i = 1; i <= n; i++) { const t = i / n; if (!clearWater(ax + (bx2 - ax) * t, az + (bz - az) * t, m)) return false; }
  return true;
}
// öncelik sırası (yüksek olan yol hakkına sahip)
const RANK = { anchor: 5, docked: 5, big: 4, ferry: 3, yacht: 2, fishStop: 2.5, fishing: 1, player: 0 };
const _o = { pos: null, heading: 0, speed: 0, L: 6, B: 2, rank: 0 };

export class ShipTraffic {
  constructor(game) {
    this.game = game;
    this.rng = new RNG(1453);
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.wakes = (game.boats && game.boats.wakes) || new Wakes(game.scene, 700);
    this.ownWakes = !(game.boats && game.boats.wakes);
    this.ships = [];
    this.list = this.ships;
    this.t = 0;
    this.gate = { owner: null, waitT: 0 };
    this.stats = { pushes: 0, groundings: 0, gateHolds: 0, docks: 0, gatePasses: 0 };
    this.buildPiers();
    // vapurlar
    FERRY_LINES.forEach((line, i) => {
      const m = buildFerry();
      const pts = line.map((p) => (typeof p[0] === 'string' ? Object.assign(slotOf(p[0], p[1]), { dock: p[0] }) : { x: p[0], z: p[1] }));
      // yanaşma/kalkış kıyıya paralel: iskelenin 55 m yanında, 2 m açıkta yardımcı nokta (baş kıyıya bindirmez)
      const helper = (dk, nb) => {
        const ax = dk.along ? 1 : 0, az = dk.along ? 0 : 1;
        const sg = Math.sign((nb.x - dk.x) * ax + (nb.z - dk.z) * az) || 1;
        return { x: dk.x + ax * sg * 55 - dk.nx * 2, z: dk.z + az * sg * 55 - dk.nz * 2 };
      };
      pts.splice(1, 0, helper(pts[0], pts[1]));
      pts.splice(pts.length - 1, 0, helper(pts[pts.length - 1], pts[pts.length - 2]));
      const s = this.addShip(m, pts[0].x, pts[0].z, pts[0].h, { route: pts, idx: 1, dir: 1, cruise: 7, mode: 'dock', wait: 4 + i * 11, turnR: 45, type: 'ferry' });
      s.heading = pts[0].h;
    });
    // şerit kırılma noktalarında dönüşe erken başla (dönüş yarıçapı × tan(Δ/2)): köşe kesilmez, şerit dışına taşmaz
    const lead = (r, R) => r.forEach((p, i) => {
      const a = r[(i - 1 + r.length) % r.length], b = r[(i + 1) % r.length];
      if (p.jump !== undefined || a.jump !== undefined) return;
      const d = Math.abs(angleDiff(Math.atan2(p.x - a.x, p.z - a.z), Math.atan2(b.x - p.x, b.z - p.z)));
      p.lead = Math.min(80, R * Math.tan(d / 2));
    });
    lead(BIG_ROUTE, 120);
    // Boğaz devresi: 7 büyük gemi devre boyunca eşit aralıklı (köprü bölgesinde başlamaz)
    const big = BIG_ROUTE.map((p) => ({ ...p }));
    const n = 7;
    const segs = this.routeSegs(big), total = segs.reduce((a, b) => a + b.len, 0);
    for (let i = 0; i < n; i++) {
      const m = i % 3 === 1 ? buildTanker(this.rng) : buildCargo(this.rng);
      let at = this.routePoint(big, segs, (total * (i + 0.37)) / n);
      if (at.z > GATE.z0 - 120 && at.z < GATE.z1 + 120 && at.x > 240 && at.x < 400) at = this.routePoint(big, segs, (total * (i + 0.37)) / n + 400);
      const s = this.addShip(m, at.x, at.z, at.h, { route: big, idx: at.idx, cruise: 5.4 + (i % 3) * 0.25, turnR: 120, loop: true, type: 'big', lane: true });
      void s;
    }
    // Marmara transit (Boğaz'a girmeyen)
    [[MARMARA_W, 0.62], [MARMARA_E, 0.4]].forEach(([r0, f], i) => {
      const m = i ? buildTanker(this.rng) : buildCargo(this.rng);
      const r = r0.map((p) => ({ ...p })), sg = this.routeSegs(r), at = this.routePoint(r, sg, sg[0].len * f);
      this.addShip(m, at.x, at.z, at.h, { route: r, idx: at.idx, cruise: 5.8, turnR: 120, loop: true, type: 'big', lane: true });
    });
    // demir yeri: rüzgâra/akıntıya göre yavaşça salınan demirli gemiler
    ANCHORAGE.forEach(([x, z, h], i) => {
      const m = i % 2 ? buildTanker(this.rng) : buildCargo(this.rng);
      this.addShip(m, x, z, h, { mode: 'anchor', h0: h, type: 'anchor' });
    });
    // balıkçılar ve yatlar (kıyı bantlarında)
    for (const rk of ['marmaraE', 'marmaraE', 'marmaraW', 'marmara', 'marmaraW']) { const p = this.randomIn(rk, 5); if (p) this.addShip(buildFishing(this.rng), p.x, p.z, this.rng.float(0, 6.28), { region: rk, cruise: this.rng.float(2.4, 3.4), turnR: 12, wander: true, margin: 5, type: 'fishing' }); }
    for (const rk of ['marmaraW', 'marmara', 'marmaraE']) { const p = this.randomIn(rk, 7); if (p) this.addShip(buildTrafficYacht(this.rng), p.x, p.z, rk === 'bosNW' ? Math.PI : Math.PI / 2, { region: rk, cruise: this.rng.float(6, 8.5), turnR: 30, wander: true, margin: 7, type: 'yacht' }); }
    this._near = [];
  }

  // rota parçaları (sıçrama noktalarında kesik)
  routeSegs(r) {
    const segs = [];
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      if (a.jump !== undefined) continue;
      segs.push({ i, a, b, len: Math.hypot(b.x - a.x, b.z - a.z) });
    }
    return segs;
  }
  routePoint(r, segs, d) {
    const total = segs.reduce((a, b) => a + b.len, 0);
    d = ((d % total) + total) % total;
    for (const s of segs) {
      if (d <= s.len) { const t = d / s.len; return { x: s.a.x + (s.b.x - s.a.x) * t, z: s.a.z + (s.b.z - s.a.z) * t, h: Math.atan2(s.b.x - s.a.x, s.b.z - s.a.z), idx: (s.i + 1) % r.length }; }
      d -= s.len;
    }
    const s = segs[0];
    return { x: s.a.x, z: s.a.z, h: 0, idx: 1 };
  }

  buildPiers() {
    const parts = [];
    for (const [key, p] of Object.entries(PIERS)) {
      for (let k = 0; k < p.slots.length; k++) {
        const S = slotOf(key, k), along = S.along;
        const w = along ? 30 : 5, d = along ? 5 : 30;
        const cx = S.px + S.nx * 3.5, cz = S.pz + S.nz * 3.5;
        // yüzer iskele + saçak + bağlantı köprüsü
        parts.push(vc(B3(w, 0.6, d, cx, WATER_Y + 0.5, cz), 0x6a6258));
        parts.push(vc(B3(along ? 12 : 4, 0.3, along ? 4 : 12, cx, 3.4, cz), 0x2a4a5a));
        for (const s of [-1, 1]) parts.push(vc(CY(0.12, 0.12, 4.4, 6, cx + (along ? s * 5 : 0), 1.2, cz + (along ? 0 : s * 5)), 0x333333));
        // usturmaça lastikleri (iskelenin su tarafı yüzünde)
        for (let i = -2; i <= 2; i++) parts.push(vc(CY(0.25, 0.25, 0.9, 8, cx + (along ? i * 5 : -S.nx * 2.6), WATER_Y + 0.7, cz + (along ? -S.nz * 2.6 : i * 5)), 0x111111));
        oceanObstacle(cx, cz, w / 2, d / 2);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1), new THREE.MeshBasicMaterial({ map: signTexture(p.name.toUpperCase() + ' İSKELESİ', '#1d3d6e', '#f2f0ea', 512, 96), side: THREE.DoubleSide }));
        sign.position.set(cx + S.nx * 0.4, 4.2, cz + S.nz * 0.4); sign.rotation.y = along ? 0 : Math.PI / 2;
        this.group.add(sign);
      }
    }
    const m = new THREE.Mesh(mergeGeometries(parts), hullMat); m.receiveShadow = true;
    this.group.add(m);
  }

  randomIn(rk, m) {
    const [x0, z0, x1, z1] = REGIONS[rk];
    for (let i = 0; i < 40; i++) { const x = this.rng.float(x0, x1), z = this.rng.float(z0, z1); if (clearWater(x, z, m) && this.freeSpot(x, z, 40)) return { x, z }; }
    return null;
  }
  freeSpot(x, z, r) { for (const o of this.ships) if (Math.hypot(o.pos.x - x, o.pos.z - z) < r + o.L * 0.5) return false; return true; }

  addShip(model, x, z, heading, o) {
    const s = { mesh: model.g, L: model.L, B: model.B, kind: model.kind, pos: new THREE.Vector3(x, WATER_Y, z), heading, speed: 0, phase: Math.random() * 10, wakeT: 0, hornT: 30 + Math.random() * 60, wait: 0, ...o };
    s.big = s.type === 'big' || s.type === 'anchor';
    s.uid = this.ships.length;
    if (s.mode === 'anchor') s.speed = 0; else if (s.mode !== 'dock') s.speed = s.cruise || 0;
    s.mesh.rotation.order = 'YXZ';
    // hava yüksekliği (su hattından en yüksek nokta) — köprü altı denetimi
    const bb = new THREE.Box3().setFromObject(s.mesh); s.air = bb.max.y;
    this.group.add(s.mesh);
    this.ships.push(s);
    return s;
  }
  rankOf(s) {
    if (s.mode === 'anchor') return RANK.anchor;
    if (s.mode === 'dock') return RANK.docked;
    if (s.type === 'fishing') return s.speed < 0.5 ? RANK.fishStop : RANK.fishing;
    return RANK[s.type] ?? 1;
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    const night = g.env ? g.env.nightFactor : 0;
    navMat.userData.uA.value.set(1.5 + night * 4, 0, 0, 0);
    const pl = g.player ? g.player.pos : { x: 0, z: 0 };
    const cam = g.camera ? g.camera.position : pl;
    const sea = g.env && g.env.waveAmount !== undefined ? g.env.waveAmount / 0.12 : 1;
    this._dt = dt;
    for (const s of this.ships) s.rank = this.rankOf(s);
    for (const s of this.ships) this.plan(s, dt, cam);
    for (const s of this.ships) this.move(s, dt, pl, sea, cam);
    this.separate();
    if (this.ownWakes) this.wakes.update(dt);
    this.collidePlayer();
    this.feedOcean();
  }

  // Deniz şaderine en yakın gemi/tekneleri gönder (gövde köpüğü + dümen suyu)
  feedOcean() {
    const g = this.game, cam = g.camera ? g.camera.position : (g.player ? g.player.pos : { x: 0, z: 0 });
    const near = this._near; near.length = 0;
    for (const s of this.ships) { const d = Math.abs(s.pos.x - cam.x) + Math.abs(s.pos.z - cam.z); if (d < 1500) near.push([d, s.pos.x, s.pos.z, s.heading, s.L * 0.5, s.B * 0.5, s.speed]); }
    const vl = g.vehicles ? g.vehicles.list : [];
    for (const v of vl) {
      if (v.kind !== 'boat' || !v.def) continue;
      const d = Math.abs(v.pos.x - cam.x) + Math.abs(v.pos.z - cam.z);
      if (d < 600) near.push([d, v.pos.x, v.pos.z, v.heading, v.def.len * 0.5, v.def.wid * 0.5, Math.hypot(v.vx || 0, v.vz || 0) * 0.6]);
    }
    near.sort((a, b) => a[0] - b[0]);
    const P = OCEAN.uShipP.value, D = OCEAN.uShipD.value;
    for (let i = 0; i < MAX_SHIPS; i++) {
      const e = near[i];
      if (e) { P[i].set(e[1], e[2], Math.sin(e[3]), Math.cos(e[3])); D[i].set(e[4], e[5], e[6], 0); } else { P[i].set(1e5, 1e5, 0, 1); D[i].set(1, 1, 0, 0); }
    }
  }

  pickWander(s) {
    for (let i = 0; i < 14; i++) {
      const p = this.randomIn(s.region, s.margin);
      if (p && Math.hypot(p.x - s.pos.x, p.z - s.pos.z) > 40 && segClear(s.pos.x, s.pos.z, p.x, p.z, s.margin)) return p;
    }
    return { x: s.pos.x + Math.sin(s.heading + Math.PI) * 30, z: s.pos.z + Math.cos(s.heading + Math.PI) * 30 };
  }

  // GTH köprü geçişi: bölgeye girecek büyük gemi izin ister; bölge doluysa kapı noktasının 45 m gerisinde durur
  gateLimit(s, desired) {
    const r = s.route; if (!r) return desired;
    const G = this.gate;
    // geçiş bitti mi? (çıkış noktasını L/2 + 15 m geçince bırak)
    if (G.owner === s) {
      const out = G.north ? s.pos.z < GATE.z0 - s.L / 2 - 15 : s.pos.z > GATE.z1 + s.L / 2 + 15;
      if (out) { G.owner = null; this.stats.gatePasses = (this.stats.gatePasses || 0) + 1; }
      return desired;
    }
    const tg = r[s.idx];
    if (!tg || !tg.gate) return desired;
    const rem = Math.hypot(tg.x - s.pos.x, tg.z - s.pos.z);
    if (rem > 500) return desired;
    if (!G.owner && rem < 170) { G.owner = s; G.north = Math.cos(s.heading) < 0; s.holding = false; return desired; }
    if (G.owner && G.owner !== s) { this.stats.gateHolds++; s.holding = true; return Math.min(desired, Math.max(0, (rem - 45) * 0.022)); }
    s.holding = false;
    return desired;
  }

  plan(s, dt, cam) {
    s.turnOff = 0;
    if (s.mode === 'anchor' || s.mode === 'dock') { s.desired = 0; return; }
    let want, desired = s.cruise, tg, d;
    if (s.wander) {
      tg = s.wp || (s.wp = this.pickWander(s));
      d = Math.hypot(tg.x - s.pos.x, tg.z - s.pos.z);
      want = Math.atan2(tg.x - s.pos.x, tg.z - s.pos.z);
    } else {
      tg = s.route[s.idx];
      const prev = s.route[s.loop ? (s.idx - 1 + s.route.length) % s.route.length : s.idx - s.dir] || s.pos;
      d = Math.hypot(tg.x - s.pos.x, tg.z - s.pos.z);
      // şerit takibi: önceki noktadan hedefe doğru üzerinde ileriye bak (çapraz sapma düzeltmesi)
      const ax = prev.jump !== undefined ? s.pos.x : prev.x, az = prev.jump !== undefined ? s.pos.z : prev.z;
      const sx = tg.x - ax, sz = tg.z - az, sl = Math.hypot(sx, sz) || 1;
      const t = clamp(((s.pos.x - ax) * sx + (s.pos.z - az) * sz) / sl, 0, sl);
      const look = Math.min(sl - t, Math.max(30, s.L * 0.7));
      const px = ax + (sx / sl) * (t + look), pz = az + (sz / sl) * (t + look);
      want = tg.dock && d < 60 ? Math.atan2(tg.x - s.pos.x, tg.z - s.pos.z) : Math.atan2(px - s.pos.x, pz - s.pos.z);
      if (tg.dock) desired = Math.min(desired, 0.5 + d * 0.09);
      else if (s.route[s.idx + s.dir] && s.route[s.idx + s.dir].dock) desired = Math.min(desired, 2 + d * 0.05); // yanaşma öncesi ağırla (dar dönüş)
      s.segLeft = sl - t;
    }
    // harita dışında, kameradan uzakta: hızlandır (devre süresi kısalsın)
    const far = Math.hypot(s.pos.x - cam.x, s.pos.z - cam.z);
    if (far > 1300 && (Math.abs(s.pos.x) > 1050 || s.pos.z < -1050 || s.pos.z > 1150)) desired *= 3;
    if (s.big && s.route) desired = this.gateLimit(s, desired);
    // çatışmadan kaçınma (niyet edilen hız vektörüyle)
    this.avoid(s, want, desired);
    want -= s.turnOff;
    desired = Math.min(desired, s.cap);
    if (s.escape !== null) { want = s.escape; desired = Math.max(s.kind === 'ferry' ? 1.2 : 1.6, Math.min(s.cruise * 0.6, desired)) * Math.max(0, Math.cos(angleDiff(s.heading, want))); } // önce dön, sonra uzaklaş
    // kara yoklaması (şerit gemileri hariç: şeritler kıyıdan uzak doğrulanmıştır) — kaçınmadan sonra, son söz
    if (!s.lane && !(tg && tg.dock && d < 120)) {
      const pd = s.L * 0.5 + Math.max(0, s.speed) * 5 + 5;
      const wet = (h, k = 1) => { const x = s.pos.x + Math.sin(h) * pd * k, z = s.pos.z + Math.cos(h) * pd * k; return !isLand(x, z) && Math.hypot(x - ISLAND.x, z - ISLAND.z) > ISLAND.r + 4; };
      if (!wet(want) || !wet(s.heading)) {
        const opts = [want, s.heading + 0.7, s.heading - 0.7, s.heading + 1.5, s.heading - 1.5, s.heading + Math.PI];
        want = opts.find((h) => wet(h) && wet(h, 0.5)) ?? s.heading + Math.PI;
        desired = Math.min(desired, 1.5);
        if (s.wander) s.wp = null;
      }
    }
    s.want = want;
    s.desired = Math.max(0, desired);
    s.tg = tg; s.tgD = d;
  }

  // COLREG benzeri kaçınma: s.turnOff (sancağa, rad), s.cap (hız sınırı), s.escape (alan içine girildiyse uzaklaşma yönü)
  avoid(s, want, desired) {
    let turn = 0, cap = desired, ex = 0, ez = 0, waitLane = false, inLane = false;
    const svx = Math.sin(want) * desired, svz = Math.cos(want) * desired; // niyet edilen hız
    const list = this.ships, vl = this.game.vehicles ? this.game.vehicles.list : [];
    const n = list.length;
    for (let k = 0; k < n + vl.length; k++) {
      let o;
      if (k < n) { o = list[k]; if (o === s) continue; }
      else {
        const v = vl[k - n];
        if (v.kind !== 'boat' || !v.def || !v.driver) continue; // bağlı (sürücüsüz) tekneler sabit; gövde itmesiyle çözülür
        _o.pos = v.pos; _o.heading = v.heading; _o.speed = Math.hypot(v.vx || 0, v.vz || 0); _o.L = v.def.len; _o.B = v.def.wid; _o.rank = RANK.player; _o.type = 'player';
        o = _o;
      }
      const rx = o.pos.x - s.pos.x, rz = o.pos.z - s.pos.z;
      if (Math.abs(rx) > 700 || Math.abs(rz) > 700) continue;
      const dist = Math.hypot(rx, rz);
      const dh = angleDiff(s.heading, o.heading);
      const parallel = Math.abs(Math.sin(dh)) < 0.35;
      const Dh = (s.L + o.L) / 2 + 2, D = parallel ? Dh : Dh + 14;
      // karşı şeritteki gemi: şeritler ayrık tasarlandı (TSS), birbirleri için manevra yapmazlar
      if (s.lane && o.lane && Math.cos(dh) < -0.2) continue;
      const brg = angleDiff(s.heading, Math.atan2(rx, rz));
      // şerit dışı gemi ↔ şerit gemisi (Kural 9/10: dar kanalda seyreden büyük gemiyi engelleme)
      if (o.lane && s.type === 'ferry') continue; // vapur geçişini kalkışta GTH'den onaylattı (ferryCrossClear)
      if (o.lane && !s.lane) {
        const c = this.trackConflict(s, o, want, desired);
        if (c === 1) waitLane = true; // şeride girmeden bekle
        else if (c === 2) inLane = true; // şeridin içinde: durma, rotasında hızla geçip çık
        continue;
      }
      // vapur ↔ seyirdeki vapur: sabit hatlar; çatışma öngörülürse yol veren beklemede kalır (dönüp kaçmaz)
      if (s.type === 'ferry' && o.type === 'ferry' && o.mode !== 'dock') {
        const c = this.trackConflict(s, o, want, desired, 70);
        if (c) {
          const brgO = angleDiff(o.heading, Math.atan2(-rx, -rz));
          let gw;
          if (Math.abs(brgO) > 1.96) gw = true; else if (Math.abs(brg) > 1.96) gw = false;
          else if (Math.abs(brg) < 0.35 && Math.abs(dh) > 2.6) gw = s.uid < o.uid; else gw = brg < 0;
          if (s.stuckT > 25) gw = false;
          if (gw && dist > Dh + 4) waitLane = true;
          else if (!gw && dist < Dh + 6 && o.speed < 0.3) cap = Math.min(cap, 1.0); // bekleyenin yanından ağır geç
        }
        continue;
      }
      if (s.lane && !o.lane) {
        if (dist < Dh * 2.5) {
          const wx2 = Math.sin(o.heading) * o.speed - svx, wz2 = Math.cos(o.heading) * o.speed - svz, w22 = wx2 * wx2 + wz2 * wz2;
          const tc2 = w22 > 1e-3 ? Math.max(0, -(rx * wx2 + rz * wz2) / w22) : 0;
          if (rx * wx2 + rz * wz2 < 0 && Math.hypot(rx + wx2 * tc2, rz + wz2 * tc2) < Dh && dist < Dh + 10) cap = 0; // yalnız son çare
        }
        continue;
      }
      // aynı yönde önde giden (aynı şeritte): mesafe koru
      if (Math.abs(brg) < 0.7 && Math.cos(dh) > 0.6 && dist < Dh * 3.5 && Math.abs(dist * Math.sin(brg)) < (s.B + o.B) / 2 + 12) {
        const along = o.speed * Math.cos(dh);
        cap = Math.min(cap, Math.max(0, along + (dist - Dh * 1.45) * 0.06));
        continue;
      }
      const wx = Math.sin(o.heading) * o.speed - svx, wz = Math.cos(o.heading) * o.speed - svz;
      const w2 = wx * wx + wz * wz;
      const H = s.big || o.big ? 150 : 70;
      let tc = w2 > 1e-3 ? -(rx * wx + rz * wz) / w2 : 0;
      if (tc < 0) tc = 0; if (tc > H) tc = H;
      const cx = rx + wx * tc, cz = rz + wz * tc, dcpa = Math.hypot(cx, cz);
      const closing = rx * wx + rz * wz < -1e-3;
      if (dcpa >= D && dist >= D * 1.08) continue;
      if (!closing && dist >= D) continue;
      const urg = Math.max(clamp(1 - (tc - 8) / (H - 8), 0, 1), clamp(1 - (dist - Dh) / (Dh * 0.8), 0, 1)); // zaman + mesafe aciliyeti
      // yol veren kim?
      let give;
      const or = o.rank !== undefined ? o.rank : this.rankOf(o);
      if (or > s.rank) give = true;
      else if (or < s.rank) give = false;
      else {
        const brgO = angleDiff(o.heading, Math.atan2(-rx, -rz));
        if (Math.abs(brgO) > 1.96 && s.speed > o.speed) give = true; // yetişen
        else if (Math.abs(brg) > 1.96) give = false; // bana yetişiliyor
        else if (Math.abs(brg) < 0.3 && Math.abs(dh) > 2.6) give = true; // kafa kafaya: ikisi de sancağa
        else give = brg < 0; // sancağımdaki gemiye yol ver
      }
      if (give && s.stuckT > 25) give = false; // kilitlenme kırıcı: uzun süre bekleyen yol hakkını alır
      const astern = Math.abs(brg) > 1.57; // yol hakkı olan arkadan geliyor: yavaşlamak değil, yoldan çekilmek
      if (give && astern && !s.lane) { if (dist < D * 1.3) { const w = (D * 1.3 - dist) / D + 0.2; ex -= (rx / dist) * w; ez -= (rz / dist) * w; } continue; }
      if (give) {
        const still = o.speed < 0.5; // duran gemiye yol vermek: beklemek değil, etrafından dolaşmak
        if (closing && !(still && !s.lane)) cap = Math.min(cap, desired * (1 - 0.9 * urg));
        else if (closing && dcpa < Dh) cap = Math.min(cap, desired * clamp((dist - Dh) / Dh, 0.2, 1));
        if (!s.lane && closing) turn = Math.max(turn, still ? 0.9 : 0.2 + 0.6 * urg);
        // alanın içindeyiz: uzaklaş (şerit gemisi hariç)
        if (!s.lane && dist < D) { const w = (D - dist) / D + 0.1; ex -= (rx / dist) * w; ez -= (rz / dist) * w; }
      } else if (closing && dcpa < D && dist < D * 1.5) cap = Math.min(cap, desired * Math.max(0.3, clamp((dist - Dh) / (0.5 * Dh), 0, 1)));
      if (closing && dcpa < Dh && dist < Dh + 6 && !(give && o.speed < 0.5 && !s.lane)) cap = 0; // Kural 17(b): son anda ikisi de durur; duran gemiye yol veren etrafından dolaşır
    }
    if (inLane) { cap = Math.max(cap, s.cruise); turn = 0; ex = 0; ez = 0; } else if (waitLane) cap = 0;
    s.turnOff = turn; s.cap = cap;
    // kilitlenme sayacı (yol vermek için durmuş bekliyor)
    s.stuckT = cap < 0.3 && s.speed < 0.4 && desired > 0.5 ? (s.stuckT || 0) + this._dt : Math.max(0, (s.stuckT || 0) - this._dt * 0.5);
    if (s.stuckT > 40) s.stuckT = 0;
    s.escape = ex * ex + ez * ez > 1e-4 ? Math.atan2(ex, ez) : null;
  }

  // şerit gemisinin önünden geçiş tahmini: 0 çatışma yok, 1 çatışma (şeride girmeden bekle), 2 şeridin içinde
  trackConflict(s, o, want, desired, T = 90) {
    const Dh = (s.L + o.L) / 2 + 8;
    const ofx = Math.sin(o.heading), ofz = Math.cos(o.heading);
    const rx = s.pos.x - o.pos.x, rz = s.pos.z - o.pos.z;
    const along = rx * ofx + rz * ofz, lat = Math.abs(-rx * ofz + rz * ofx);
    const inside = lat < Dh && along > -o.L * 0.6;
    const vx = Math.sin(want) * Math.max(desired, 1), vz = Math.cos(want) * Math.max(desired, 1);
    const ovx = ofx * o.speed, ovz = ofz * o.speed;
    let hit = false;
    for (let t = 0; t <= T; t += 3) {
      const dx = rx + (vx - ovx) * t, dz = rz + (vz - ovz) * t;
      if (dx * dx + dz * dz < Dh * Dh) { hit = true; break; }
    }
    if (!hit) return inside && Math.hypot(rx, rz) < Dh * 1.2 ? 2 : 0;
    return inside ? 2 : 1;
  }

  move(s, dt, pl, sea, cam) {
    const g = this.game;
    if (s.mode === 'anchor') {
      s.speed = 0;
      s.heading = s.h0 + 0.35 * Math.sin(this.t * 0.012 + s.phase);
    } else if (s.mode === 'dock') {
      s.speed = Math.max(0, s.speed - dt * 1.2);
      const here = s.route[s.idx - s.dir] || s.route[0];
      if (here && here.h !== undefined) {
        const h1 = here.h, h2 = here.h + Math.PI;
        const tgt = Math.abs(angleDiff(s.heading, h1)) < Math.abs(angleDiff(s.heading, h2)) ? h1 : h2;
        s.heading += angleDiff(s.heading, tgt) * Math.min(1, dt * 0.6);
        // iskeleye yanaş (pervane/baş iticisiyle son metreler)
        s.pos.x += (here.x - s.pos.x) * Math.min(1, dt * 0.5); s.pos.z += (here.z - s.pos.z) * Math.min(1, dt * 0.5);
      }
      s.wait -= dt;
      if (s.wait <= 0 && this.clearToLeave(s) && this.ferryCrossClear(s)) {
        s.mode = 'sail'; s.wp = null;
        // çift başlı vapur: geri dönmez, öbür başı pruva olur
        const nx = s.route[s.idx]; if (nx && Math.abs(angleDiff(s.heading, Math.atan2(nx.x - s.pos.x, nx.z - s.pos.z))) > Math.PI / 2) s.heading += Math.PI; if (s.kind === 'ferry' && g.boats && g.boats.horn) g.boats.horn(s.pos.x, s.pos.z, 1); }
    } else {
      const big = s.L > 60;
      const acc = big ? 0.12 : s.kind === 'ferry' ? 0.45 : 1.0, dec = big ? 0.3 : s.kind === 'ferry' ? 0.9 : 1.8;
      s.speed += clamp(s.desired - s.speed, -dec * dt, acc * dt);
      const thr = s.kind === 'fishing' ? 0.3 : s.kind === 'ferry' ? 0.2 : s.kind === 'yacht' ? 0.18 : 0.04; // baş iticisi: yavaşken de döner
      const turnRate = Math.max(thr, Math.abs(s.speed) / s.turnR);
      s.heading += clamp(angleDiff(s.heading, s.want), -turnRate * dt, turnRate * dt);
      const tg = s.tg, d = s.tgD;
      if (tg) {
        const arrive = tg.dock ? 3 : s.wander ? 12 : Math.max(10, s.speed * 3, tg.lead || 0);
        const passed = !s.wander && !tg.dock && s.segLeft !== undefined && s.segLeft < 1;
        if (d < arrive || passed) {
          if (s.wander) { s.wp = null; if (s.type === 'fishing' && Math.random() < 0.5) { s.mode = 'fish'; s.wait = 8 + Math.random() * 20; } }
          else if (tg.dock) { s.mode = 'dock'; s.wait = 16; this.advance(s); this.stats.docks = (this.stats.docks || 0) + 1; }
          else if (tg.jump !== undefined) this.jump(s, tg.jump);
          else this.advance(s);
        }
      }
      if (s.mode === 'fish') { s.desired = 0; s.wait -= dt; if (s.wait <= 0) s.mode = 'sail'; }
    }
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    // kara fiziksel engeldir: pruva karaya değecekse ilerleme (sayılır; kaçınma/yoklama doğruysa 0)
    const nx = s.pos.x + fx * s.speed * dt, nz = s.pos.z + fz * s.speed * dt, sg = s.speed >= 0 ? 1 : -1;
    if (s.mode !== 'dock' && isLand(nx + fx * s.L * 0.45 * sg, nz + fz * s.L * 0.45 * sg)) { this.stats.groundings++; { const gk = s.type + '@' + Math.round(s.pos.x / 50) * 50 + ',' + Math.round(s.pos.z / 50) * 50; (this.stats.gp || (this.stats.gp = {}))[gk] = (this.stats.gp[gk] || 0) + 1; } s.blk = (s.blk || 0) + 1; s.speed = isLand(s.pos.x - fx * s.L * 0.5 * sg, s.pos.z - fz * s.L * 0.5 * sg) ? 0 : -0.5 * sg; }
    else { s.pos.x = nx; s.pos.z = nz; }
    // yalpa (dalga yüksekliğiyle artar; büyük gemiler daha az)
    s.phase += dt;
    const k = (10 / s.L) * Math.min(3.5, 0.6 + sea * 0.4);
    s.mesh.position.set(s.pos.x, WATER_Y + Math.sin(s.phase * 0.9) * 0.12 * k, s.pos.z);
    s.mesh.rotation.set(Math.sin(s.phase * 0.7) * 0.02 * k - Math.min(0.03, s.speed * 0.002), s.heading, Math.sin(s.phase * 0.55 + 1) * 0.04 * k);
    const far = Math.hypot(s.pos.x - cam.x, s.pos.z - cam.z) > 1100;
    // köpük serpintisi (yalnız görünür mesafede; asıl dümen suyu deniz şaderinde): pruva dalgası + kıç çalkantısı
    if (!far && s.speed > 0.8) {
      s.wakeT -= dt;
      if (s.wakeT <= 0) {
        s.wakeT = s.L > 40 ? 0.22 : 0.28;
        const hl = s.L * 0.48;
        this.wakes.spawn(s.pos.x - fx * hl, s.pos.z - fz * hl, s.B * 0.6, 1.5 + s.speed * 0.25, 4 + s.L * 0.03, 0.35);
        for (const sd of [-1, 1]) this.wakes.spawn(s.pos.x + fx * hl * 0.85 - fz * sd * s.B * 0.4, s.pos.z + fz * hl * 0.85 + fx * sd * s.B * 0.4, s.B * 0.25, 0.8 + s.speed * 0.15, 2.5, 0.25);
      }
    }
    // büyük gemi düdüğü (oyuncu yakınsa ara sıra; GTH'de beklerken ve köprüye girerken)
    if (s.L > 40) {
      s.hornT -= dt;
      if (s.hornT <= 0) { s.hornT = 60 + Math.random() * 90; if (!far && Math.hypot(s.pos.x - pl.x, s.pos.z - pl.z) < 450 && g.boats && g.boats.horn) g.boats.horn(s.pos.x, s.pos.z, s.kind === 'ferry' ? 1 : 1.4); }
    }
  }
  // yanaşık vapur kalkmadan önce çevresi boş mu (başka gemi kalkış yolunda değil)
  clearToLeave(s) {
    for (const o of this.ships) {
      if (o === s || o.mode === 'anchor') continue;
      if (Math.hypot(o.pos.x - s.pos.x, o.pos.z - s.pos.z) < (s.L + o.L) / 2 + 25 && o.mode !== 'dock') return false;
    }
    return true;
  }
  // Vapur kalkış onayı: hattın bir sonraki iskeleye kadar olan yolu, şerit gemilerinin tahmini yollarıyla
  // (şimdiki ve seyir hızıyla) hiçbir anda (L1+L2)/2 + 10 m'den yakın olmamalı (Boğaz'ı karşıdan karşıya geçiş penceresi)
  ferryCrossClear(s) {
    const fp = [{ x: s.pos.x, z: s.pos.z }];
    for (let i = s.idx; i >= 0 && i < s.route.length; i += s.dir) { fp.push(s.route[i]); if (s.route[i].dock) break; }
    const flen = this.polyLen(fp);
    for (const o of this.ships) {
      if (!o.lane || Math.abs(o.pos.x - s.pos.x) + Math.abs(o.pos.z - s.pos.z) > 2200) continue;
      const op = [{ x: o.pos.x, z: o.pos.z }];
      for (let k = 0, j = o.idx; k < 6; k++, j = (j + 1) % o.route.length) { const q = o.route[j]; op.push(q); if (q.jump !== undefined) break; }
      const need = (s.L + o.L) / 2 + 10;
      for (const v of [0, o.speed * 0.5, Math.max(0, o.speed), (o.speed + o.cruise) / 2, o.cruise]) { // yavaşlama/bekleme dahil
        for (let t = 0; t <= 150; t += 2) {
          const fd = Math.min(flen, 5.0 * t);
          const a = this.polyAt(fp, fd), ax = a.x, az = a.z, b = this.polyAt(op, v * t);
          if ((ax - b.x) ** 2 + (az - b.z) ** 2 < need * need) return false;
          if (fd >= flen && t > 20) break;
        }
      }
    }
    return true;
  }
  polyLen(P) { let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z); return L; }
  polyAt(P, d) {
    const r = this._pa || (this._pa = { x: 0, z: 0 });
    for (let i = 1; i < P.length; i++) {
      const l = Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z);
      if (d <= l) { const t = l > 0 ? d / l : 0; r.x = P[i - 1].x + (P[i].x - P[i - 1].x) * t; r.z = P[i - 1].z + (P[i].z - P[i - 1].z) * t; return r; }
      d -= l;
    }
    const e = P[P.length - 1]; r.x = e.x; r.z = e.z; return r;
  }

  // görüş dışında rotanın başına sar; başlangıç dolu ise bekle
  jump(s, j) {
    const r0 = s.route[j], r1 = s.route[(j + 1) % s.route.length];
    for (const o of this.ships) if (o !== s && Math.hypot(o.pos.x - r0.x, o.pos.z - r0.z) < (s.L + o.L) / 2 + 8) { s.speed = 0; return; }
    if (this.gate.owner === s) this.gate.owner = null;
    s.pos.x = r0.x; s.pos.z = r0.z; s.idx = (j + 1) % s.route.length; s.heading = Math.atan2(r1.x - r0.x, r1.z - r0.z);
  }

  advance(s) {
    if (s.loop) { s.idx = (s.idx + 1) % s.route.length; return; }
    s.idx += s.dir;
    if (s.idx >= s.route.length || s.idx < 0) { s.dir = -s.dir; s.idx += 2 * s.dir; }
  }

  // Son güvence: gövde çemberleri ((Li+Lj)/2) kesişirse düşük öncelikli olanı it (sayılır; kaçınma doğruysa 0)
  separate() {
    const L = this.ships, n = L.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = L[i], b = L[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, need = (a.L + b.L) / 2 + 0.5;
      if (Math.abs(dx) > need || Math.abs(dz) > need) continue;
      const d = Math.hypot(dx, dz);
      if (d >= need) continue;
      this.stats.pushes++;
      const pk = a.type + '/' + b.type + '@' + Math.round(a.pos.x / 50) * 50 + ',' + Math.round(a.pos.z / 50) * 50; (this.stats.pp || (this.stats.pp = {}))[pk] = ((this.stats.pp || {})[pk] || 0) + 1;
      const pen = need - d, nx = d > 1e-3 ? dx / d : 1, nz = d > 1e-3 ? dz / d : 0;
      const wa = a.rank > b.rank ? 0 : a.rank < b.rank ? 1 : 0.5;
      a.pos.x -= nx * pen * wa; a.pos.z -= nz * pen * wa;
      b.pos.x += nx * pen * (1 - wa); b.pos.z += nz * pen * (1 - wa);
    }
  }

  // Gemiler oyuncu teknesini / yüzen oyuncuyu iter
  collidePlayer() {
    const g = this.game;
    const list = g.vehicles ? g.vehicles.list : [];
    const pushOne = (obj, rad, isBoat) => {
      for (const s of this.ships) {
        const dx = obj.pos.x - s.pos.x, dz = obj.pos.z - s.pos.z;
        if (Math.abs(dx) > s.L || Math.abs(dz) > s.L) continue;
        const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
        const lz = dx * fx + dz * fz, lx = dx * fz - dz * fx;
        const hx = s.B / 2 + rad, hz = s.L / 2 + rad * 0.5;
        if (Math.abs(lx) < hx && Math.abs(lz) < hz) {
          const px = hx - Math.abs(lx), pz = hz - Math.abs(lz);
          let nx, nz, pen;
          if (px < pz) { const sg = Math.sign(lx) || 1; nx = fz * sg; nz = -fx * sg; pen = px; } else { const sg = Math.sign(lz) || 1; nx = fx * sg; nz = fz * sg; pen = pz; }
          obj.pos.x += nx * pen; obj.pos.z += nz * pen;
          if (isBoat) {
            const vn = obj.vx * nx + obj.vz * nz;
            const sv = s.speed * (fx * nx + fz * nz);
            if (vn < sv) { const imp = sv - vn; obj.vx += nx * imp * 1.3; obj.vz += nz * imp * 1.3; if (imp > 4) { obj.damage(imp * imp * 2, null); g.audio && g.audio.crash && g.audio.crash(obj.pos.x, obj.pos.z, Math.min(1.5, imp / 10)); } }
          }
        }
      }
    };
    for (const v of list) if (v.kind === 'boat') pushOne(v, v.def.wid * 0.5, true);
    const p = g.player;
    if (p && p.swimming && !p.vehicle) pushOne(p, 0.5, false);
  }

  // Test/teşhis: köprü altındaki gemilerin serbest yüksekliği (m; negatif = çarpar)
  bridgeClearance(s) {
    if (Math.abs(s.pos.z - -450) > 14) return null;
    return bosphorusDeckY(s.pos.x) - 2.6 - (s.mesh.position.y + s.air);
  }
}
void DECK_TOP; void shipHull; void rod; void railing; void winRow; void winRowX; void lightize;

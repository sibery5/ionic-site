// [villa] Oyuncunun Boğaz kıyısındaki malikânesi (100 × 100 m, koruluk içinde): çevre duvarı + ferforje çit, sürgülü
// otomatik kapı, bekçi kulübesi, fıskiyeli döner alan, 3 katlı modern-klasik ana bina (cam cepheler, iki kat yüksekliğinde
// sütunlu giriş, teraslar, denize bakan balkon), yükseltilmiş sonsuzluk havuzu + havuz evi + şezlong/şemsiye, 6 araçlık cam
// galeri, 2 helikopter pisti, bahçe aydınlatması, özel iskele. Hepsi kodla üretilir ve 6 birleşik ağa toplanır
// (eşya/plaster/taş/cam/su/kapı → ~6 çizim çağrısı); ağaçlar mevcut örnekleyicilere eklenir. Görünen her katının çarpışması var.
// Oyun mantığı (kapı açma, araçlar, helikopterler, korumalar, iç mekân) game/villa.js'tedir.
import * as THREE from 'three';
import { GeoBuilder } from './instancer.js';
import { PLAYER_VILLA as V, POOLS } from './map.js';
import { pbrMaterial } from './shaders.js';
import { plasterPBR, ashlarPBR } from '../core/textures.js';

// Yerleşim (dünya koordinatı; +x doğu = deniz, +z güney = kapı caddesi)
export const VL = {
  house: { x0: 104, x1: 140, z0: -842, z1: -818, door: { x: 122, z: -818 } },
  fountain: { x: 122, z: -798 },
  pool: { x0: 146, x1: 172, z0: -840, z1: -826, y: 1.45 },
  deck: { x0: 143, x1: 176, z0: -846, z1: -820, y: 1.6 },
  poolHouse: { x0: 158, x1: 172, z0: -854, z1: -848 },
  gallery: { x0: 80, x1: 104, z0: -800, z1: -791 },
  pads: [{ x: 92, z: -858, kind: 'helikopter' }, { x: 122, z: -859, kind: 'attackHeli' }],
  booth: { x0: 128, x1: 131.5, z0: -780, z1: -776.5 },
  gateGap: { x0: 118.5, x1: 125.5 },
};

const WARM_GLASS = { color: 0x8a7258, rough: 0.08, metal: 0.85, emis: 0.55 }; // gündüz koyu cam, gece sıcak ışık
const DARK = { color: 0x1b1b1d, rough: 0.45, metal: 0.6 };
const WHITE = { color: 0xf3efe6, rough: 0.6 };
const TRAV = { color: 0xd9cfbd, rough: 0.75 }; // traverten döşeme

export function buildPlayerVilla(city) {
  const cols = city.physics.city, q = city.quality;
  const B = { props: new GeoBuilder(), plaster: new GeoBuilder(), stone: new GeoBuilder(), glass: new GeoBuilder(), water: new GeoBuilder() };
  const solids = []; // çarpışma denetimi için: [x, z, yarıçap, yükseklik, ad]
  const box = (k, x0, y0, z0, x1, y1, z1, o = {}) => B[k].box(x1 - x0, y1 - y0, z1 - z0, { ...o, x: (x0 + x1) / 2, y: y0, z: (z0 + z1) / 2 });
  const col = (x0, z0, x1, z1, y0, y1, tag, name) => { cols.add(x0, z0, x1, z1, y0, y1, tag); if (name) solids.push([(x0 + x1) / 2, (z0 + z1) / 2, Math.min(x1 - x0, z1 - z0) / 2, y1, name]); };
  const circ = (x, z, r, y0, y1, tag, name) => { cols.addCircle(x, z, r, y0, y1, tag); if (name) solids.push([x, z, r, y1, name]); };

  // ---------- zemin boyası: çim parsel, taş döşeli araç yolu / döner alan / patikalar ----------
  paintMask(city, (rect, ring) => {
    const GRASS = [0, 0, 255, 0], PAVE = [0, 255, 0, 0], COB = [0, 0, 0, 255];
    rect(V.x0, V.z0, V.x1, V.z1, GRASS);
    rect(118.5, -789, 125.5, -768.6, COB); // araç yolu (kapıdan döner alana)
    rect(80, -790, 119, -782, COB); // galeri önü
    ring(122, -798, 5.8, 9.6, COB); // fıskiyeli döner alan
    rect(112, -812, 132, -806.5, PAVE); // giriş avlusu
    rect(126, -817.4, 177.5, -814.6, PAVE); // bina önü → havuz → deniz kapısı
    rect(140.4, -848, 142.9, -817.4, PAVE); // bina doğusu
    rect(88, -850.5, 142.9, -847.8, PAVE); // pistlere patika
  });

  // ---------- çevre duvarı + ferforje çit ----------
  const T = 0.5;
  const fence = (x0, z0, x1, z1) => {
    const alongX = x1 - x0 > z1 - z0, L = alongX ? x1 - x0 : z1 - z0;
    if (L < 0.3) return;
    box('stone', x0, 0, z0, x1, 0.9, z1);
    box('props', x0 - 0.04, 0.9, z0 - 0.04, x1 + 0.04, 0.98, z1 + 0.04, TRAV); // taş harpuşta
    const n = Math.max(1, Math.round(L / 4));
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (let i = 0; i <= n; i++) { // ayaklar
      const t = i / n, px = alongX ? x0 + t * L : cx, pz = alongX ? cz : z0 + t * L;
      B.stone.box(0.72, 2.7, 0.72, { x: px, z: pz });
      B.props.box(0.86, 0.14, 0.86, { x: px, y: 2.7, z: pz, ...TRAV });
      B.props.box(0.3, 0.22, 0.3, { x: px, y: 2.84, z: pz, color: 0xfff1cc, emis: 1.1, rough: 0.3 }); // ayak lambası
    }
    for (let a = 0.11; a < L; a += 0.2) { // parmaklık çubukları
      const px = alongX ? x0 + a : cx, pz = alongX ? cz : z0 + a;
      B.props.box(0.035, 1.55, 0.035, { x: px, y: 0.98, z: pz, ...DARK });
      B.props.box(0.06, 0.1, 0.06, { x: px, y: 2.5, z: pz, color: 0x9a7a3a, metal: 0.8, rough: 0.35 }); // yaldızlı uç
    }
    for (const y of [1.08, 2.36]) B.props.box(alongX ? L : 0.05, 0.05, alongX ? 0.05 : L, { x: cx, y, z: cz, ...DARK });
    cols.add(x0, z0, x1, z1, 0, 2.75, 'villaWall');
    solids.push([cx, cz, 0.25, 2.7, 'duvar']);
  };
  const g = VL.gateGap;
  fence(V.x0, V.z1 - T, g.x0 - 0.5, V.z1); fence(g.x1 + 0.5, V.z1 - T, V.x1, V.z1); // güney (kapı boşluğu)
  fence(V.x0, V.z0, V.x1, V.z0 + T); // kuzey
  fence(V.x0, V.z0, V.x0 + T, V.z1); // batı
  fence(V.x1 - T, V.z0, V.x1, V.seaGate.z - 1); fence(V.x1 - T, V.seaGate.z + 1, V.x1, V.z1); // doğu (deniz kapısı)
  // kapı ayakları (lambalı) ve deniz kapısı ayakları
  for (const x of [g.x0 - 0.55, g.x1 + 0.55]) {
    B.stone.box(1.1, 3.3, 1.1, { x, z: V.z1 - 0.25 });
    B.props.box(1.3, 0.18, 1.3, { x, y: 3.3, z: V.z1 - 0.25, ...TRAV });
    B.props.box(0.42, 0.6, 0.42, { x, y: 3.48, z: V.z1 - 0.25, color: 0xffe0a8, emis: 1.4, rough: 0.2 });
    col(x - 0.55, V.z1 - 0.8, x + 0.55, V.z1 + 0.3, 0, 3.4, 'villaWall', 'kapı ayağı');
  }
  for (const z of [V.seaGate.z - 1.2, V.seaGate.z + 1.2]) { B.stone.box(0.8, 2.9, 0.8, { x: V.x1 - 0.25, z }); col(V.x1 - 0.65, z - 0.4, V.x1 + 0.15, z + 0.4, 0, 2.9, 'villaWall', 'deniz kapısı'); }

  // ---------- ana bina ----------
  const H = VL.house;
  box('stone', H.x0 - 0.6, 0, H.z0 - 0.6, H.x1 + 0.6, 0.3, H.z1 + 0.6); // subasman
  const FL = [
    { x0: H.x0, x1: H.x1, z0: H.z0, z1: H.z1, y: 0.3 },
    { x0: H.x0, x1: H.x1 - 4, z0: H.z0, z1: H.z1, y: 4.2 },
    { x0: H.x0 + 3, x1: H.x1 - 8, z0: H.z0 + 3, z1: H.z1 - 3, y: 8.1 },
  ];
  const FH = 3.45;
  for (const [i, f] of FL.entries()) {
    box('glass', f.x0 + 0.35, f.y, f.z0 + 0.35, f.x1 - 0.35, f.y + FH, f.z1 - 0.35); void i;
    box('props', f.x0 + 0.45, f.y, f.z0 + 0.45, f.x1 - 0.45, f.y + FH, f.z1 - 0.45, WARM_GLASS);
    // cephe: güney ve doğu (deniz) geniş cam + ince ayak; batı ve kuzey dolu duvar + pencere
    const piers = (x0, z0, x1, z1, open) => {
      const alongX = x1 - x0 > z1 - z0, L = alongX ? x1 - x0 : z1 - z0, n = Math.max(2, Math.round(L / 4));
      for (let k = 0; k <= n; k++) {
        const t = k / n, w = open ? 0.55 : 2.5;
        const px = alongX ? x0 + t * L : x0, pz = alongX ? z0 : z0 + t * L;
        const hw = (k === 0 || k === n) ? 0.6 : w / 2;
        if (alongX) box('plaster', px - hw, f.y, pz - 0.3, px + hw, f.y + FH, pz + 0.3);
        else box('plaster', px - 0.3, f.y, pz - hw, px + 0.3, f.y + FH, pz + hw);
      }
      if (!open) { // pencere alt/üst bantları
        if (alongX) { box('plaster', x0, f.y, z0 - 0.3, x1, f.y + 0.9, z0 + 0.3); box('plaster', x0, f.y + FH - 0.55, z0 - 0.3, x1, f.y + FH, z0 + 0.3); }
        else { box('plaster', x0 - 0.3, f.y, z0, x0 + 0.3, f.y + 0.9, z1); box('plaster', x0 - 0.3, f.y + FH - 0.55, z0, x0 + 0.3, f.y + FH, z1); }
      }
    };
    piers(f.x0, f.z1, f.x1, f.z1, true); piers(f.x1, f.z0, f.x1, f.z1, true);
    piers(f.x0, f.z0, f.x1, f.z0, false); piers(f.x0, f.z0, f.x0, f.z1, false);
    // kat silmesi (klasik korniş bandı) + teras döşemesi
    box('plaster', f.x0 - 0.7, f.y + FH, f.z0 - 0.7, f.x1 + 0.7, f.y + FH + 0.45, f.z1 + 0.7);
    box('props', f.x0 - 0.8, f.y + FH + 0.33, f.z0 - 0.8, f.x1 + 0.8, f.y + FH + 0.45, f.z1 + 0.8, WHITE);
  }
  // teraslar: cam korkuluk (alt kattın çatısında, üst katın dışında kalan kenarlar)
  const rail = (x0, z0, x1, z1, y) => {
    box('glass', x0 - 0.03, y, z0 - 0.03, x1 + 0.03, y + 1.05, z1 + 0.03);
    box('props', x0 - 0.05, y + 1.05, z0 - 0.05, x1 + 0.05, y + 1.12, z1 + 0.05, { color: 0xb9b9b9, metal: 0.9, rough: 0.25 });
  };
  { const y = FL[1].y; rail(H.x1 + 0.6, H.z0 - 0.6, H.x1 + 0.6, H.z1 + 0.6, y); rail(H.x1 - 4, H.z0 - 0.6, H.x1 + 0.6, H.z0 - 0.6, y); rail(H.x1 - 4, H.z1 + 0.6, H.x1 + 0.6, H.z1 + 0.6, y); }
  { const f = FL[1], y = FL[2].y; rail(f.x0 - 0.6, f.z0 - 0.6, f.x1 + 0.6, f.z0 - 0.6, y); rail(f.x0 - 0.6, f.z1 + 0.6, f.x1 + 0.6, f.z1 + 0.6, y); rail(f.x1 + 0.6, f.z0 - 0.6, f.x1 + 0.6, f.z1 + 0.6, y); rail(f.x0 - 0.6, f.z0 - 0.6, f.x0 - 0.6, f.z1 + 0.6, y); }
  // denize bakan konsol balkon (3. kat, doğu)
  { const f = FL[2], y = f.y; box('plaster', f.x1, y - 0.35, -834, f.x1 + 3.2, y, -826); rail(f.x1 + 3.2, -834, f.x1 + 3.2, -826, y); rail(f.x1 + 0.6, -834, f.x1 + 3.2, -834, y); rail(f.x1 + 0.6, -826, f.x1 + 3.2, -826, y); }
  // çatı: derin saçaklı düz çatı + parapet + teknik oda
  { const f = FL[2], y = f.y + FH + 0.45; box('plaster', f.x0 - 0.2, y, f.z0 - 0.2, f.x1 + 0.2, y + 0.8, f.z0 + 0.2); box('plaster', f.x0 - 0.2, y, f.z1 - 0.2, f.x1 + 0.2, y + 0.8, f.z1 + 0.2);
    box('plaster', f.x0 - 0.2, y, f.z0, f.x0 + 0.2, y + 0.8, f.z1); box('plaster', f.x1 - 0.2, y, f.z0, f.x1 + 0.2, y + 0.8, f.z1); box('plaster', 114, y, -834, 122, y + 2.4, -828);
    box('props', 113.6, y + 2.4, -834.4, 122.4, y + 2.6, -827.6, WHITE); }
  // sütunlu giriş: iki kat yüksekliğinde 6 sütun, saçaklık, alınlık, basamaklar, kapı
  const PZ = -812.6;
  for (let i = 0; i < 6; i++) {
    const x = 116 + i * 2.4;
    B.stone.box(0.9, 0.35, 0.9, { x, y: 0.3, z: PZ });
    B.plaster.cyl(0.3, 0.36, 7.25, 16, { x, y: 0.65, z: PZ });
    B.props.cyl(0.46, 0.32, 0.3, 16, { x, y: 7.6, z: PZ, ...WHITE });
    B.props.box(0.95, 0.12, 0.95, { x, y: 7.9, z: PZ, ...WHITE });
    circ(x, PZ, 0.42, 0, 8, 'villaColumn', 'sütun');
  }
  box('plaster', 114.6, 8.02, -818, 129.4, 8.9, -811.9);
  box('props', 114.4, 8.9, -818.2, 129.6, 9.05, -811.7, WHITE);
  { const s = new THREE.Shape(); s.moveTo(-7.5, 0); s.lineTo(7.5, 0); s.lineTo(0, 1.9); s.lineTo(-7.5, 0);
    const pg = new THREE.ExtrudeGeometry(s, { depth: 0.6, bevelEnabled: false }); B.plaster.add(pg, { x: 122, y: 9.05, z: -812.3 }); }
  for (let k = 0; k < 3; k++) { const z0 = -811.9 + k * 0.45; box('stone', 113.8 - k * 0.4, 0, z0, 130.2 + k * 0.4, 0.3 - k * 0.1, z0 + 0.45 + (2 - k) * 0); }
  box('props', 120.6, 0.3, -818.05, 123.4, 3.4, -817.9, { color: 0x3a2414, rough: 0.5 }); // ceviz çift kanat kapı
  box('props', 121.94, 0.3, -817.9, 122.06, 3.4, -817.85, { color: 0x9a7a3a, metal: 0.9, rough: 0.3 });
  for (const x of [121.6, 122.4]) box('props', x - 0.03, 1.4, -817.85, x + 0.03, 2.0, -817.75, { color: 0xc8a050, metal: 0.95, rough: 0.2 });
  box('props', 120.4, 3.4, -818.05, 123.6, 4.0, -817.9, WARM_GLASS);
  for (const x of [119.2, 124.8]) { box('props', x - 0.2, 2.4, -817.85, x + 0.2, 2.9, -817.45, { color: 0xffe0a8, emis: 1.4 }); } // aplik
  col(H.x0 - 0.6, H.z0 - 0.6, H.x1 + 0.6, H.z1 + 0.15, 0, 12.6, 'villaHouse', 'ana bina');

  // ---------- yükseltilmiş sonsuzluk havuzu ----------
  const D = VL.deck, PL = VL.pool;
  const deckPart = (x0, z0, x1, z1) => { box('stone', x0, 0, z0, x1, D.y - 0.1, z1); box('props', x0 - 0.05, D.y - 0.1, z0 - 0.05, x1 + 0.05, D.y, z1 + 0.05, TRAV); col(x0, z0, x1, z1, 0, D.y, 'villaDeck', 'havuz terası'); };
  deckPart(D.x0, D.z0, D.x1, PL.z0); deckPart(D.x0, PL.z1, D.x1, D.z1); deckPart(D.x0, PL.z0, PL.x0, PL.z1);
  // doğu kenarı: taşma savağı (su kenardan aşağı oluğa akar → denizle birleşen ufuk çizgisi)
  box('stone', PL.x1 + 1.2, 0, PL.z0, D.x1, D.y - 0.1, PL.z1); box('props', PL.x1 + 1.15, D.y - 0.1, PL.z0, D.x1 + 0.05, D.y, PL.z1, TRAV);
  box('stone', PL.x1, 0, PL.z0, PL.x1 + 1.2, PL.y - 0.45, PL.z1); col(PL.x1, PL.z0, D.x1, PL.z1, 0, D.y, 'villaDeck', 'havuz savağı');
  box('water', PL.x1 - 0.02, PL.y - 0.47, PL.z0, PL.x1 + 1.2, PL.y - 0.43, PL.z1);
  box('props', PL.x0, 0.0, PL.z0, PL.x1, 0.06, PL.z1, { color: 0x6ccbe4, rough: 0.25 }); // havuz tabanı (mozaik)
  box('props', PL.x0 + 1, 0.06, (PL.z0 + PL.z1) / 2 - 0.15, PL.x1 - 1, 0.07, (PL.z0 + PL.z1) / 2 + 0.15, { color: 0x1d5f8a, rough: 0.3 });
  for (const [x0, z0, x1, z1] of [[PL.x0, PL.z0, PL.x1, PL.z0 + 0.12], [PL.x0, PL.z1 - 0.12, PL.x1, PL.z1], [PL.x0, PL.z0, PL.x0 + 0.12, PL.z1]]) box('props', x0, 0.06, z0, x1, D.y - 0.1, z1, { color: 0x3aa6cc, rough: 0.2 });
  box('props', PL.x1 - 0.12, 0.06, PL.z0, PL.x1, PL.y - 0.02, PL.z1, { color: 0x3aa6cc, rough: 0.2 });
  box('water', PL.x0, PL.y - 0.02, PL.z0, PL.x1, PL.y, PL.z1);
  POOLS.push({ x0: PL.x0, x1: PL.x1, z0: PL.z0, z1: PL.z1, y: PL.y });
  // basamaklar: batı (bina tarafı) ve güney (patika)
  for (let k = 0; k < 4; k++) {
    const y1 = 0.4 * (k + 1);
    box('stone', D.x0 - 2.4 + k * 0.6, 0, -834, D.x0 - 1.8 + k * 0.6 + 0.01, y1, -828); cols.add(D.x0 - 2.4 + k * 0.6, -834, D.x0 - 1.8 + k * 0.6, -828, 0, y1, 'villaStep');
    box('stone', 152, 0, D.z1 + 2.4 - k * 0.6 - 0.6, 158, y1, D.z1 + 2.4 - k * 0.6); cols.add(152, D.z1 + 1.8 - k * 0.6, 158, D.z1 + 2.4 - k * 0.6, 0, y1, 'villaStep');
  }
  // şezlonglar ve şemsiyeler
  const lounger = (x, z, ry) => {
    B.props.box(0.72, 0.28, 2.0, { x, y: D.y, z, ry, color: 0xeeeae2, rough: 0.5 });
    B.props.box(0.66, 0.1, 1.3, { x: x + Math.sin(ry) * 0.3, y: D.y + 0.28, z: z + Math.cos(ry) * 0.3, ry, color: 0xf6f1e4, rough: 0.9 });
    B.props.box(0.66, 0.1, 0.75, { x: x - Math.sin(ry) * 0.62, y: D.y + 0.45, z: z - Math.cos(ry) * 0.62, ry, rx: 0.9 * (Math.cos(ry) > 0 ? -1 : 1), color: 0xf6f1e4, rough: 0.9 });
    cols.addOBB(x, z, 0.75, 2.0, ry, D.y, D.y + 0.42, 'lounger'); solids.push([x, z, 0.36, D.y + 0.4, 'şezlong']);
  };
  const umbrella = (x, z) => {
    B.props.cyl(0.04, 0.05, 2.5, 8, { x, y: D.y, z, color: 0xd8d0c0, metal: 0.5, rough: 0.4 });
    B.props.cyl(0.08, 1.55, 0.5, 10, { x, y: D.y + 2.05, z, color: 0xefe6d2, rough: 0.95 });
    B.props.box(0.5, 0.06, 0.5, { x, y: D.y, z, color: 0x9a9a9a });
    circ(x, z, 0.1, D.y, D.y + 2.5, 'umbrella', 'şemsiye');
  };
  for (let i = 0; i < 6; i++) lounger(148.5 + i * 4, -843.6, 0);
  for (let i = 0; i < 4; i++) lounger(149.5 + i * 4.6 + (i > 1 ? 4 : 0), -822.6, Math.PI);
  for (const x of [150.5, 158.5, 166.5]) umbrella(x, -845.2);
  for (const x of [156, 163.6]) umbrella(x, -821.2);
  // havuz evi (pergolalı, cam önlü)
  { const P = VL.poolHouse;
    box('plaster', P.x0, 0, P.z0, P.x1, 3.3, P.z0 + 0.4); box('plaster', P.x0, 0, P.z0, P.x0 + 0.4, 3.3, P.z1); box('plaster', P.x1 - 0.4, 0, P.z0, P.x1, 3.3, P.z1);
    box('props', P.x0 + 0.4, 0, P.z0 + 0.4, P.x1 - 0.4, 3.2, P.z1 - 0.2, WARM_GLASS);
    for (let x = P.x0 + 3.5; x < P.x1 - 1; x += 3.5) box('plaster', x - 0.2, 0, P.z1 - 0.4, x + 0.2, 3.3, P.z1);
    box('plaster', P.x0 - 0.8, 3.3, P.z0 - 0.4, P.x1 + 0.8, 3.65, P.z1 + 2.2);
    for (let x = P.x0; x <= P.x1; x += 1.4) box('props', x - 0.07, 3.0, P.z1, x + 0.07, 3.3, P.z1 + 2.0, { color: 0x7a5a3a, rough: 0.6 });
    col(P.x0, P.z0, P.x1, P.z1, 0, 3.65, 'villaPoolHouse', 'havuz evi'); }

  // ---------- cam galeri (6 araç) ----------
  { const G = VL.gallery;
    box('props', G.x0, 0, G.z0, G.x1, 0.03, G.z1, { color: 0x2a2a2c, rough: 0.12, metal: 0.3 }); // cilalı zemin
    for (let i = 1; i < 6; i++) box('props', G.x0 + i * 4 - 0.05, 0.03, G.z0 + 1, G.x0 + i * 4 + 0.05, 0.035, G.z1, { color: 0xdddddd });
    box('plaster', G.x0, 0, G.z0, G.x1, 3.6, G.z0 + 0.35); col(G.x0, G.z0, G.x1, G.z0 + 0.35, 0, 3.8, 'villaGallery', 'galeri arka duvar');
    box('props', G.x0 + 0.5, 2.6, G.z0 + 0.36, G.x1 - 0.5, 2.7, G.z0 + 0.4, { color: 0xfff4dc, emis: 1.6 }); // LED şerit
    for (const x of [G.x0, G.x1 - 0.12]) { box('glass', x, 0, G.z0 + 0.35, x + 0.12, 3.6, G.z1); col(x, G.z0, x + 0.12, G.z1, 0, 3.6, 'villaGallery', 'galeri yan cam'); }
    for (let i = 0; i <= 6; i++) { const x = G.x0 + i * 4; box('props', x - 0.09, 0, G.z1 - 0.2, x + 0.09, 3.6, G.z1, DARK); circ(x, G.z1 - 0.1, 0.13, 0, 3.6, 'villaGallery', 'galeri dikmesi'); }
    box('glass', G.x0, 2.85, G.z1 - 0.12, G.x1, 3.6, G.z1 - 0.06);
    box('plaster', G.x0 - 0.4, 3.6, G.z0 - 0.4, G.x1 + 0.4, 4.0, G.z1 + 1.4);
    for (let i = 0; i < 6; i++) box('props', G.x0 + 1.6 + i * 4, 3.54, G.z0 + 3.5, G.x0 + 2.4 + i * 4, 3.6, G.z0 + 5, { color: 0xfff4dc, emis: 1.8 }); }

  // ---------- helikopter pistleri ----------
  for (const pd of VL.pads) {
    B.props.cyl(7, 7.1, 0.12, 32, { x: pd.x, z: pd.z, color: 0x55585b, rough: 0.85 });
    B.props.cyl(6.2, 6.2, 0.13, 32, { x: pd.x, z: pd.z, color: 0xe9e9e9, rough: 0.8 });
    B.props.cyl(5.8, 5.8, 0.14, 32, { x: pd.x, z: pd.z, color: 0x55585b, rough: 0.85 });
    B.props.box(0.6, 0.02, 4.2, { x: pd.x - 1.2, y: 0.14, z: pd.z, color: 0xf2f2f2 }); B.props.box(0.6, 0.02, 4.2, { x: pd.x + 1.2, y: 0.14, z: pd.z, color: 0xf2f2f2 });
    B.props.box(1.8, 0.02, 0.6, { x: pd.x, y: 0.14, z: pd.z, color: 0xf2f2f2 });
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; B.props.cyl(0.12, 0.14, 0.2, 8, { x: pd.x + Math.sin(a) * 7.3, z: pd.z + Math.cos(a) * 7.3, color: 0x40ff70, emis: 2 }); }
  }

  // ---------- fıskiye ----------
  { const F = VL.fountain;
    B.stone.cyl(3.6, 3.75, 0.62, 28, { x: F.x, z: F.z });
    B.props.cyl(3.75, 3.75, 0.08, 28, { x: F.x, y: 0.62, z: F.z, ...TRAV });
    B.water.cyl(3.3, 3.3, 0.04, 28, { x: F.x, y: 0.52, z: F.z });
    B.stone.cyl(0.38, 0.6, 1.7, 14, { x: F.x, z: F.z }); B.stone.cyl(1.5, 0.45, 0.35, 20, { x: F.x, y: 1.7, z: F.z });
    B.water.cyl(1.35, 1.35, 0.03, 20, { x: F.x, y: 1.98, z: F.z }); B.stone.cyl(0.14, 0.24, 0.9, 10, { x: F.x, y: 2.0, z: F.z });
    B.water.cyl(0.03, 0.35, 1.1, 10, { x: F.x, y: 2.85, z: F.z });
    circ(F.x, F.z, 3.75, 0, 2.6, 'fountain', 'fıskiye'); }

  // ---------- bekçi kulübesi ----------
  { const K = VL.booth;
    box('plaster', K.x0, 0, K.z0, K.x1, 1.0, K.z1); box('props', K.x0 + 0.05, 1.0, K.z0 + 0.05, K.x1 - 0.05, 2.3, K.z1 - 0.05, WARM_GLASS);
    for (const [x, z] of [[K.x0, K.z0], [K.x1 - 0.2, K.z0], [K.x0, K.z1 - 0.2], [K.x1 - 0.2, K.z1 - 0.2]]) box('plaster', x, 1.0, z, x + 0.2, 2.3, z + 0.2);
    box('plaster', K.x0 - 0.5, 2.3, K.z0 - 0.5, K.x1 + 0.5, 2.65, K.z1 + 0.5);
    col(K.x0, K.z0, K.x1, K.z1, 0, 2.65, 'villaBooth', 'bekçi kulübesi'); }

  // ---------- bahçe aydınlatması ----------
  const bollard = (x, z) => {
    B.props.cyl(0.09, 0.11, 0.75, 8, { x, z, ...DARK });
    B.props.cyl(0.1, 0.1, 0.12, 8, { x, y: 0.75, z, color: 0xffe2b0, emis: 1.3, rough: 0.3 });
    B.props.cyl(0.13, 0.13, 0.04, 8, { x, y: 0.87, z, ...DARK });
    circ(x, z, 0.13, 0, 0.9, 'bollard', 'bahçe lambası');
  };
  for (let z = -775.5; z > -789; z -= 5) { bollard(117.8, z); bollard(126.2, z); }
  for (let x = 84; x < 116; x += 6) bollard(x, -781.4);
  for (let x = 130; x < 176; x += 6) bollard(x, -813.9);
  for (let z = -822; z > -848; z -= 6) bollard(143.4, z);
  for (let x = 92; x < 140; x += 6) bollard(x, -851.1);
  for (const [x, z] of [[111, -805], [133, -805], [111, -791], [133, -791]]) { // döner alan fenerleri
    B.props.cyl(0.07, 0.1, 3.4, 8, { x, z, ...DARK });
    B.props.box(0.36, 0.5, 0.36, { x, y: 3.4, z, color: 0xffe0a8, emis: 1.5, rough: 0.2 });
    B.props.cyl(0.05, 0.28, 0.25, 4, { x, y: 3.9, z, ry: Math.PI / 4, ...DARK });
    circ(x, z, 0.12, 0, 3.6, 'lamp', 'fener');
  }

  // ---------- özel iskele (kıyı yolunun karşısında) ----------
  { const I = V.pier;
    box('props', I.x0, 0.1, I.z0, I.x1, 0.35, I.z1, { color: 0x8a6a4a, rough: 0.8 });
    for (let x = I.x0 + 2; x <= I.x1; x += 4) for (const z of [I.z0 - 0.1, I.z1 + 0.1]) { B.props.cyl(0.2, 0.22, 4.9, 8, { x, y: -4.3, z, color: 0x4a3626, rough: 0.9 }); circ(x, z, 0.22, -4, 0.6, 'piling', 'iskele kazığı'); }
    for (const x of [I.x1 - 0.6]) { B.props.cyl(0.07, 0.09, 3.2, 8, { x, y: 0.35, z: I.z1 - 0.4, ...DARK }); B.props.box(0.34, 0.45, 0.34, { x, y: 3.55, z: I.z1 - 0.4, color: 0xffe0a8, emis: 1.5 }); circ(x, I.z1 - 0.4, 0.1, 0.35, 3.9, 'lamp', 'iskele feneri'); }
    cols.add(I.x0, I.z0, I.x1, I.z1, -3, 0.35, 'villaPier'); }

  // ---------- koru (sık ağaç kuşağı), selviler, palmiyeler, çit, çiçek tarhı ----------
  if (city.addTree) {
    const sp = ['pine', 'plane', 'cypress', 'pine', 'linden'];
    let n = 0;
    const belt = (x0, z0, x1, z1, step) => { for (let x = x0; x <= x1; x += step) for (let z = z0; z <= z1; z += step) { n++; city.addTree(sp[n % sp.length], x + ((n * 7) % 5 - 2) * 0.35, z + ((n * 3) % 5 - 2) * 0.35, 0.85 + (n % 4) * 0.08); } };
    belt(80, -870, 84, -778, 4.4); // batı
    belt(88, -870, 172, -866, 4.6); // kuzey
    belt(88, -779, 112, -776, 4.8); belt(136, -779, 172, -776, 4.8); // güney (kapı boşluğu hariç)
    for (const z of [-866, -858, -850]) city.addTree('cypress', 174, z, 0.95);
    for (let z = -776; z > -790; z -= 6) { city.addTree('cypress', 115.6, z - 1, 0.9); city.addTree('cypress', 128.4, z - 1, 0.9); }
    for (const [x, z] of [[144, -812], [176, -812], [145, -850], [176, -850]]) city.addTree('palm', x, z, 1.0);
    for (const [x, z] of [[96, -812], [148, -800], [165, -790], [95, -830]]) city.addTree('plane', x, z, 1.05);
  }
  if (city.addHedge) { city.addHedge(104, -812.4, 113, -811.6, 0.9); city.addHedge(131, -812.4, 140, -811.6, 0.9); city.addHedge(150, -806, 172, -805.2, 1.0); }
  if (city.addBed) { city.addBed(108.5, -807.5, 6, 1.6, 0); city.addBed(135.5, -807.5, 6, 1.6, 0); }

  // ---------- ağlar ----------
  const group = new THREE.Group(); group.name = 'playerVilla';
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xa8c8d8, transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0.4, depthWrite: false });
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x1d93c4, transparent: true, opacity: 0.8, roughness: 0.03, metalness: 0.15, emissive: 0x06283a });
  const mats = {
    props: city.propsMat,
    plaster: pbrMaterial(plasterPBR(q), { color: 0xf4efe6, scale: 0.4 }),
    stone: pbrMaterial(ashlarPBR(q), { color: 0xefe6d6, scale: 0.35 }),
    glass: glassMat, water: waterMat,
  };
  for (const k of Object.keys(B)) {
    if (!B[k].parts.length) continue;
    const m = new THREE.Mesh(B[k].build(), mats[k]);
    m.name = 'villa:' + k;
    m.castShadow = k !== 'glass' && k !== 'water' && q !== 'low'; m.receiveShadow = k !== 'glass';
    if (k === 'glass' || k === 'water') m.renderOrder = 2;
    group.add(m);
  }
  // sürgülü kapı (ayrı ağ: açılırken kayar)
  const gb = new GeoBuilder();
  const GW = g.x1 - g.x0;
  gb.box(GW, 0.12, 0.08, { y: 0.1, ...DARK }); gb.box(GW, 0.08, 0.08, { y: 2.45, ...DARK }); gb.box(GW, 0.06, 0.06, { y: 1.3, color: 0x9a7a3a, metal: 0.8, rough: 0.35 });
  for (let a = -GW / 2 + 0.1; a < GW / 2; a += 0.16) { gb.box(0.04, 2.35, 0.04, { x: a, y: 0.15, ...DARK }); gb.box(0.07, 0.12, 0.07, { x: a, y: 2.5, color: 0x9a7a3a, metal: 0.8, rough: 0.35 }); }
  const gate = new THREE.Mesh(gb.build(), city.propsMat);
  gate.position.set((g.x0 + g.x1) / 2, 0, V.z1 - 0.9); gate.castShadow = q !== 'low';
  group.add(gate);
  city.group.add(group);
  solids.push([V.gate.x, V.z1 - 0.9, 0.2, 2.5, 'kapı']);
  return { group, gate, gateX0: gate.position.x, solids, layout: VL, cols };
}

// Zemin maskesine (R asfalt, G kaldırım, B çim, A arnavut kaldırımı) dikdörtgen/halka boyar.
function paintMask(city, fn) {
  const tex = city.maskTex; if (!tex || !tex.image) return;
  const S = tex.image.width, k = S / 2000, mask = tex.image.data;
  const put = (x, z, c) => { const i = (z * S + x) * 4; mask[i] = c[0]; mask[i + 1] = c[1]; mask[i + 2] = c[2]; mask[i + 3] = c[3]; };
  const rect = (x0, z0, x1, z1, c) => { for (let z = Math.floor((z0 + 1000) * k); z < Math.ceil((z1 + 1000) * k); z++) for (let x = Math.floor((x0 + 1000) * k); x < Math.ceil((x1 + 1000) * k); x++) put(x, z, c); };
  const ring = (cx, cz, r0, r1, c) => { for (let z = Math.floor((cz - r1 + 1000) * k); z < Math.ceil((cz + r1 + 1000) * k); z++) for (let x = Math.floor((cx - r1 + 1000) * k); x < Math.ceil((cx + r1 + 1000) * k); x++) { const d = Math.hypot(x / k - 1000 - cx, z / k - 1000 - cz); if (d >= r0 && d <= r1) put(x, z, c); } };
  fn(rect, ring);
  tex.needsUpdate = true;
}

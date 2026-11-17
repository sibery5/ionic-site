// [V2] Villa iç mimarisi: üç kat, içten çift kollu merdiven, her oda ayrı tasarlanmış.
//  Zemin (y=0):  giriş holü · büyük salon (şömine + üstünde güvenlik kamerası televizyonu, iki oturma grubu, kitaplıklar)
//                · yemek odası (8 kişilik masa, büfe, avize; denize bakan cam) · ofis (masa, kasa = cephanelik)
//  1. kat (4,2): ana yatak odası (kayıt yatağı, denize bakan cam) · giyinme odası · banyo (ayaklı küvet, çift lavabo, duş)
//                · misafir odası · galeri salonu
//  2. kat (8,4): çalışma odası (kitaplık duvarı, deri koltuklar) · bar salonu · çatı terası (cam korkuluk, şezlonglar)
// Malzeme: zemin katta mermer, üst katlarda ahşap; deri, ceviz, pirinç ayrıntı; tavan kenarında gizli sıcak ışık bantları.
// Işık bütçesi: 5 nokta ışık havuzu, oyuncunun bulunduğu kata taşınır (ışık SAYISI sabit → gölgelendirici yeniden derlenmez).
// İç mekân çerçevesi = dünya çerçevesi (kapı +z, deniz +x): camlardan görünen küp görüntü doğru yöne bakar.
import * as THREE from 'three';
import { Kit, canvasPlane } from './interior_kit.js';
import { sofa, bedDouble } from './home_interior.js';
import { marbleTexture, woodTexture } from '../core/textures.js';

export const VW = 24, VD = 16, FY = [0, 4.2, 8.4], VH = 12.6;
const T = 0.3; // dış duvar kalınlığı
const SLAB = 0.25;
// merdiven: A kolu zemin → 1. kat (x 4,6 → 10,3, z 3,0..4,6), B kolu 1. kat → 2. kat (x 10,3 → 4,6, z 5,0..6,6)
const ST = { xa: 4.6, xb: 10.3, n: 20, za0: 3.0, za1: 4.6, zb0: 5.0, zb1: 6.6 };
const RISE = 4.2 / ST.n, RUN = (ST.xb - ST.xa) / ST.n;

// renkler
const C = {
  plaster: 0xf1ebe0, plasterUp: 0xe9e1d2, walnut: 0x4a2e1c, walnutD: 0x2e1c10, oak: 0x9a7048, leather: 0x5a2e1a, leatherK: 0x1e1a18,
  cream: 0xe8dfcc, brass: 0xc8a050, marbleW: 0xf2efe8, marbleK: 0x23221f, linen: 0xe9e4d8, velvet: 0x23384a, stone: 0xd8d0c0,
};
const BR = { metal: 0.9, rough: 0.25 };

export function buildVillaInterior(VG, I, ctx) {
  const g = VG.g, s = ctx.scene;
  ctx.w = VW; ctx.d = VD; ctx.h = VH;
  const K = new Kit(I, ctx);
  const cols = ctx.cols;
  const onFloor = (k) => () => { const y = g.player.pos.y; return y > FY[k] - 0.6 && y < FY[k] + 2.5; };

  // ---------- döşemeler (yüzey + çarpışma) ----------
  const marble = new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.22 });
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture('#7a5232'), roughness: 0.55 });
  const ceilM = new THREE.MeshStandardMaterial({ color: 0xf7f3ea, roughness: 0.9 });
  const floorRect = (x0, z0, x1, z1, y, mat, thick) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, thick, z1 - z0), [ceilM, ceilM, mat, ceilM, ceilM, ceilM]);
    m.position.set((x0 + x1) / 2, y - thick / 2, (z0 + z1) / 2); m.receiveShadow = true; s.add(m);
    if (y > 0.1) cols.add(x0, z0, x1, z1, y - thick, y, 'slab');
  };
  const hx = VW / 2, hz = VD / 2;
  floorRect(-hx - T, -hz - T, hx + T, hz + T, 0, marble, 0.1);
  // 1. kat döşemesi (A kolu boşluğu hariç)
  const A = [ST.xa, ST.za0 - 0.1, ST.xb, ST.za1 + 0.1], B = [ST.xa, ST.zb0 - 0.1, ST.xb, ST.zb1 + 0.1];
  const slabWithHole = (y, hole, mat) => {
    floorRect(-hx, -hz, hx, hole[1], y, mat, SLAB); floorRect(-hx, hole[3], hx, hz, y, mat, SLAB);
    floorRect(-hx, hole[1], hole[0], hole[3], y, mat, SLAB); floorRect(hole[2], hole[1], hx, hole[3], y, mat, SLAB);
  };
  slabWithHole(FY[1], A, wood);
  slabWithHole(FY[2], B, wood);
  // 1. katın banyo zemini mermer (ahşabın üstünde ince kaplama)
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), marble); m.rotation.x = -Math.PI / 2; m.position.set(-8, FY[1] + 0.006, -5); s.add(m); }
  // tavan (2. kat): terasın üstü açık
  { const m = new THREE.Mesh(new THREE.BoxGeometry(16, 0.2, VD), ceilM); m.position.set(-4, VH + 0.1, 0); s.add(m);
    const m2 = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 5.6), ceilM); m2.position.set(8, VH + 0.1, 5.2); s.add(m2); }

  // ---------- dış duvarlar: pencere boşlukları, cam, çarpışma ----------
  // run: duvar boyunca [a0, a1]; holes: [[c0, c1, sill, head]] (head: kat tabanından)
  const glass = (w, h, d, x, y, z) => K.glass(w, h, d, x, y, z, { col: true, color: 0xdfeef4 });
  const wallZ = (z, x0, x1, y, h, holes = [], color = C.plaster) => {
    let a = x0;
    const seg = (a0, a1, y0, y1) => { if (a1 - a0 > 0.01 && y1 - y0 > 0.01) K.box(a1 - a0, y1 - y0, T, (a0 + a1) / 2, y + y0, z, color, { col: true, rough: 0.9 }); };
    for (const [c0, c1, sl, hd, open] of holes) {
      seg(a, c0, 0, h); seg(c0, c1, 0, sl); seg(c0, c1, hd, h);
      if (open) { a = c1; continue; } // kapı boşluğu
      glass(c1 - c0, hd - sl, 0.04, (c0 + c1) / 2, y + sl, z);
      K.box(c1 - c0, 0.05, T + 0.08, (c0 + c1) / 2, y + sl - 0.05, z, C.stone, { rough: 0.4 }); // denizlik
      for (let m = c0 + 1.6; m < c1 - 0.4; m += 1.6) K.box(0.06, hd - sl, 0.1, m, y + sl, z, 0x2a2a2a, { metal: 0.7, rough: 0.3 }); // kayıt
      a = c1;
    }
    seg(a, x1, 0, h);
  };
  const wallX = (x, z0, z1, y, h, holes = [], color = C.plaster) => {
    let a = z0;
    const seg = (a0, a1, y0, y1) => { if (a1 - a0 > 0.01 && y1 - y0 > 0.01) K.box(T, y1 - y0, a1 - a0, x, y + y0, (a0 + a1) / 2, color, { col: true, rough: 0.9 }); };
    for (const [c0, c1, sl, hd, open] of holes) {
      seg(a, c0, 0, h); seg(c0, c1, 0, sl); seg(c0, c1, hd, h);
      if (open) { a = c1; continue; } // kapı boşluğu
      glass(0.04, hd - sl, c1 - c0, x, y + sl, (c0 + c1) / 2);
      K.box(T + 0.08, 0.05, c1 - c0, x, y + sl - 0.05, (c0 + c1) / 2, C.stone, { rough: 0.4 });
      for (let m = c0 + 1.6; m < c1 - 0.4; m += 1.6) K.box(0.1, hd - sl, 0.06, x, y + sl, m, 0x2a2a2a, { metal: 0.7, rough: 0.3 });
      a = c1;
    }
    seg(a, z1, 0, h);
  };
  const ex = hx + T / 2, ez = hz + T / 2, FH = 4.2;
  // zemin kat
  wallZ(ez, -hx - T, hx + T, 0, FH, [[-11, -6.4, 0.5, 3.3], [-4.8, -1.5, 0.5, 3.3], [1.5, 4.8, 0.5, 3.3], [6.4, 11, 0.5, 3.3]]);
  wallZ(-ez, -hx - T, hx + T, 0, FH, [[-10.6, -8.2, 0.9, 3.2], [-2.4, 0.6, 0.9, 3.2], [5.4, 10.6, 0.9, 3.2]]);
  wallX(ex, -hz, hz, 0, FH, [[-7.6, -0.4, 0.15, 3.85], [2.6, 7.6, 0.6, 3.3]]); // doğu: deniz
  wallX(-ex, -hz, hz, 0, FH, [[4.0, 7.0, 0.9, 3.0]]);
  // 1. kat
  wallZ(ez, -hx - T, hx + T, FY[1], FH, [[-11, -6.4, 0.6, 3.3], [-3.6, 0.6, 0.6, 3.3], [5.6, 11, 0.6, 3.3]]);
  wallZ(-ez, -hx - T, hx + T, FY[1], FH, [[-10.6, -8.6, 1.1, 3.1], [-2.6, 1.0, 0.9, 3.2], [4.0, 10.4, 0.5, 3.4]]);
  wallX(ex, -hz, hz, FY[1], FH, [[-7.6, 2.0, 0.15, 3.85], [3.0, 7.6, 0.6, 3.3]]);
  wallX(-ex, -hz, hz, FY[1], FH, [[-6.6, -3.6, 1.2, 3.1], [3.0, 7.0, 0.8, 3.2]]);
  // 2. kat (teras bölgesi x 4..12, z -8..2,4: alçak parapet + cam korkuluk)
  wallZ(ez, -hx - T, hx + T, FY[2], FH, [[-11, -6, 0.6, 3.3], [-2.6, 2.6, 0.6, 3.3], [6.0, 11, 0.6, 3.3]]);
  wallZ(-ez, -hx - T, 4, FY[2], FH, [[-10.6, -6.6, 0.9, 3.2], [-2.2, 2.6, 0.9, 3.2]]);
  wallX(-ex, -hz, hz, FY[2], FH, [[-6.6, -2.0, 0.9, 3.2], [2.6, 6.6, 0.9, 3.2]]);
  wallX(ex, 2.4, hz, FY[2], FH, [[3.4, 7.4, 0.6, 3.3]]);
  // teras: parapet + cam korkuluk + pirinç küpeşte
  K.box(8 + T, 0.45, T, 8 + T / 2, FY[2], -ez, C.plaster, { col: true }); K.box(T, 0.45, 10.4, ex, FY[2], -2.8, C.plaster, { col: true });
  glass(8, 0.75, 0.03, 8, FY[2] + 0.45, -ez); glass(0.03, 0.75, 10.4, ex, FY[2] + 0.45, -2.8);
  K.box(8.2, 0.06, 0.08, 8, FY[2] + 1.2, -ez, C.brass, BR); K.box(0.08, 0.06, 10.4, ex, FY[2] + 1.2, -2.8, C.brass, BR);
  cols.add(4, -hz - T, hx + T, -hz, FY[2], FY[2] + 1.25, 'rail'); cols.add(hx, -hz, hx + T, 2.4, FY[2], FY[2] + 1.25, 'rail');
  // terasla iç arasındaki cam bölme (x=4, z -8..2,4) ve kayar cam kapı boşluğu; merdiven holü ile teras arası (z=2,4)
  wallX(4, -hz, 2.4, FY[2], FH, [[-7.6, -3.9, 0.1, 3.6], [-3.8, -2.4, 0, 2.7, true], [-2.3, 1.9, 0.1, 3.6]], C.plasterUp); // teras çıkışı: cam bölme + kapı boşluğu
  const terDoor = [-3.8, -2.4];
  wallZ(2.4, 4, hx + T, FY[2], FH, [[5.0, 11.4, 0.6, 3.5]], C.plasterUp);
  void terDoor;

  // ---------- iç bölmeler ----------
  const inZ = (z, x0, x1, y, gaps = [], color = C.plaster) => { let a = x0; for (const [g0, g1] of gaps) { if (g0 - a > 0.01) K.box(g0 - a, FH - SLAB, 0.16, (a + g0) / 2, y, z, color, { col: true, rough: 0.9 }); K.box(g1 - g0, FH - SLAB - 2.5, 0.16, (g0 + g1) / 2, y + 2.5, z, color, { rough: 0.9 }); a = g1; } if (x1 - a > 0.01) K.box(x1 - a, FH - SLAB, 0.16, (a + x1) / 2, y, z, color, { col: true, rough: 0.9 }); };
  const inX = (x, z0, z1, y, gaps = [], color = C.plaster) => { let a = z0; for (const [g0, g1] of gaps) { if (g0 - a > 0.01) K.box(0.16, FH - SLAB, g0 - a, x, y, (a + g0) / 2, color, { col: true, rough: 0.9 }); K.box(0.16, FH - SLAB - 2.5, g1 - g0, x, y + 2.5, (g0 + g1) / 2, color, { rough: 0.9 }); a = g1; } if (z1 - a > 0.01) K.box(0.16, FH - SLAB, z1 - a, x, y, (a + z1) / 2, color, { col: true, rough: 0.9 }); };
  // zemin: ofis (x -12..-5, z 2..8), yemek odası (x 4..12, z -8..2,4), merdiven holü (x 4..12, z 2,4..8)
  inX(-5, 2, hz, 0, [[3.0, 4.4]]); inZ(2, -hx, -5, 0, []);
  inX(4, -hz, 2.4, 0, [[-4.6, -1.0]]); inZ(2.4, 4, hx, 0, []);
  // 1. kat: ana yatak odası (x 2..12, z -8..2,4), giyinme (x -4..2, z -8..-2), banyo (x -12..-4, z -8..-2), misafir (x -12..-4,5, z 1,6..8)
  inX(2, -hz, 2.4, FY[1], [[-5.0, -3.8], [0.4, 1.8]], C.plasterUp); inZ(2.4, 2, hx, FY[1], [], C.plasterUp);
  inZ(-2, -hx, 2, FY[1], [], C.plasterUp); inX(-4, -hz, -2, FY[1], [[-5.0, -3.8]], C.plasterUp);
  inZ(1.6, -hx, -4.5, FY[1], [[-6.6, -5.4]], C.plasterUp); inX(-4.5, 1.6, hz, FY[1], [], C.plasterUp);
  // 2. kat: çalışma odası (x -12..-3, z -8..1)
  inX(-3, -hz, 1, FY[2], [[-1.6, -0.2]], C.plasterUp); inZ(1, -hx, -3, FY[2], [], C.plasterUp);

  // ---------- merdiven: taş basamaklar, pirinç küpeşte, cam korkuluk ----------
  for (let k = 0; k < ST.n; k++) {
    const xa = ST.xa + RUN * (k + 0.5), xb = ST.xb - RUN * (k + 0.5);
    K.box(RUN, RISE * (k + 1), ST.za1 - ST.za0, xa, 0, (ST.za0 + ST.za1) / 2, C.marbleW, { col: true, rough: 0.3 });
    K.box(RUN + 0.02, 0.03, ST.za1 - ST.za0 + 0.04, xa + 0.01, RISE * (k + 1) - 0.02, (ST.za0 + ST.za1) / 2, C.walnut, { rough: 0.4 });
    K.box(RUN, RISE * (k + 1), ST.zb1 - ST.zb0, xb, FY[1], (ST.zb0 + ST.zb1) / 2, C.marbleW, { col: true, rough: 0.3 });
    K.box(RUN + 0.02, 0.03, ST.zb1 - ST.zb0 + 0.04, xb - 0.01, FY[1] + RISE * (k + 1) - 0.02, (ST.zb0 + ST.zb1) / 2, C.walnut, { rough: 0.4 });
  }
  // A kolunun iç kenarı (z=2,95) ve 1. kattaki boşluk korkulukları; B kolunun 2. kattaki boşluk korkulukları
  const rail = (x0, z0, x1, z1, y) => {
    const L = Math.hypot(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    glass(alongX ? L : 0.03, 0.95, alongX ? 0.03 : L, cx, y, cz);
    K.box(alongX ? L + 0.06 : 0.07, 0.06, alongX ? 0.07 : L + 0.06, cx, y + 0.95, cz, C.brass, BR);
    cols.add(Math.min(x0, x1) - 0.05, Math.min(z0, z1) - 0.05, Math.max(x0, x1) + 0.05, Math.max(z0, z1) + 0.05, y, y + 1.0, 'rail');
  };
  rail(A[0], A[1], A[2], A[1], FY[1]); rail(A[0], A[1], A[0], A[3], FY[1]); rail(A[0], A[3], A[2], A[3], FY[1]);
  rail(B[0], B[1], B[2], B[1], FY[2]); rail(B[2], B[1], B[2], B[3], FY[2]); rail(B[0], B[3], B[2], B[3], FY[2]);
  // zemin katta A kolunun açık yanı (hol tarafı, z=2,9): basamak boyunca eğik küpeşte yerine kademeli cam
  for (let k = 4; k < ST.n; k += 4) glass(RUN * 4, 0.95, 0.03, ST.xa + RUN * (k - 2 + 0.5), RISE * (k - 1), ST.za0 - 0.06);

  // =================== ZEMİN KAT ===================
  // giriş holü: yuvarlak orta masa + çiçek, mermer kakma, iki konsol + ayna
  K.box(6, 0.012, 5, 0, 0.001, 5.2, C.marbleK, { rough: 0.2 }); K.box(5.2, 0.014, 4.2, 0, 0.002, 5.2, 0xe8e2d4, { rough: 0.2 });
  K.cyl(0.75, 0.75, 0.05, 0, 0.78, 4.6, C.walnutD, { rough: 0.3, seg: 24 }); K.cyl(0.18, 0.3, 0.78, 0, 0, 4.6, C.brass, { ...BR, col: true });
  K.cyl(0.16, 0.12, 0.38, 0, 0.83, 4.6, 0xf2f2f2, { rough: 0.2 }); K.sphere(0.42, 0, 1.4, 4.6, 0xd85a7a, { rough: 0.9, sy: 0.75 });
  for (const sx of [-1, 1]) { K.box(1.6, 0.85, 0.45, sx * 3.0, 0, 7.6, C.walnut, { col: true, uv: 'wood' }); K.box(1.1, 1.5, 0.04, sx * 3.0, 1.2, 7.82, 0xc8d8e0, { rough: 0.05, metal: 0.9 }); K.box(1.2, 0.05, 0.06, sx * 3.0, 2.72, 7.8, C.brass, BR); }
  // büyük salon — 1. oturma grubu: şömine + televizyon karşısı
  K.box(0.7, 1.25, 2.6, -11.5, 0, -3.5, C.stone, { col: true, rough: 0.5 }); K.box(0.8, 0.12, 2.9, -11.45, 1.25, -3.5, C.marbleW, { rough: 0.25 });
  K.emis(0.04, 0.55, 1.2, -11.13, 0.25, -3.5, 0xff8a30); K.box(0.06, 0.62, 1.32, -11.16, 0.22, -3.5, 0x111111, { metal: 0.6 });
  K.box(0.12, 2.6, 3.6, -11.9, 1.37, -3.5, C.walnut, { uv: 'wood', rough: 0.5 }); // televizyonun ceviz panosu
  for (const z of [-7.0, 0.0]) { // kitaplıklar (şöminenin iki yanı)
    K.box(0.42, 3.6, 2.0, -11.6, 0, z, C.walnutD, { col: true, uv: 'wood' });
    for (let k = 0; k < 6; k++) { K.box(0.36, 0.03, 1.9, -11.55, 0.3 + k * 0.55, z, C.walnut);
      for (let b = 0; b < 9; b++) { const c = [0x6a1a1a, 0x1a3a5a, 0x2a4a2a, 0x8a6a2a, 0x3a2a4a, 0xd8c8a8][(b * 7 + k * 3) % 6]; K.box(0.26, 0.38 + ((b + k) % 3) * 0.05, 0.12, -11.52, 0.33 + k * 0.55, z - 0.85 + b * 0.21, c, { rough: 0.8 }); } }
  }
  const seats = [];
  seats.push(...sofa(K, -7.0, -3.5, -Math.PI / 2, C.cream, 3));
  seats.push(...sofa(K, -9.4, -6.1, 0, C.cream, 2));
  seats.push(...sofa(K, -9.4, -0.9, Math.PI, C.cream, 2));
  K.box(1.4, 0.38, 1.4, -9.2, 0, -3.5, C.marbleK, { col: true, rough: 0.15 }); K.box(1.44, 0.03, 1.44, -9.2, 0.38, -3.5, C.brass, BR);
  K.box(5.0, 0.015, 4.2, -9.0, 0.004, -3.5, 0x6a5440, { rough: 1 });
  // 2. oturma grubu: deniz camına bakan deri koltuklar
  seats.push(...sofa(K, 0.2, -6.9, 0, C.leather, 3));
  seats.push(...sofa(K, -2.0, -4.6, Math.PI / 2, C.leather, 1));
  seats.push(...sofa(K, 2.4, -4.6, -Math.PI / 2, C.leather, 1));
  K.cyl(0.6, 0.6, 0.04, 0.2, 0.42, -4.8, C.marbleW, { rough: 0.2, seg: 24 }); K.cyl(0.08, 0.2, 0.42, 0.2, 0, -4.8, C.brass, { ...BR, col: true });
  K.box(4.2, 0.015, 3.4, 0.2, 0.004, -5.4, 0x2c3440, { rough: 1 });
  // lambader + büyük bitki
  for (const [x, z] of [[-11.2, -6.0], [3.3, -7.3]]) { K.cyl(0.02, 0.02, 1.6, x, 0, z, C.brass, BR); K.cyl(0.18, 0.24, 0.3, x, 1.55, z, 0xf2e6cc, { emis: 0.6 }); }
  K.cyl(0.3, 0.24, 0.6, -4.0, 0, -7.3, 0xe8e2d4, { col: true }); K.sphere(0.65, -4.0, 1.25, -7.3, 0x3a6a32, { rough: 0.9, sy: 1.3 });
  // yemek odası: 8 kişilik ceviz masa, büfe, ayna
  K.table(8.0, -3.2, 3.6, 1.2, C.walnutD, { leg: C.walnutD });
  for (const x of [6.9, 8.0, 9.1]) { seats.push(K.chair(x, -4.15, 0, C.cream, { legs: C.walnutD })); seats.push(K.chair(x, -2.25, Math.PI, C.cream, { legs: C.walnutD })); }
  seats.push(K.chair(5.75, -3.2, Math.PI / 2, C.leather)); seats.push(K.chair(10.25, -3.2, -Math.PI / 2, C.leather));
  K.box(3.2, 0.9, 0.5, 8.0, 0, -7.55, C.walnut, { col: true, uv: 'wood' }); K.box(3.3, 0.04, 0.55, 8.0, 0.9, -7.55, C.marbleW, { rough: 0.2 });
  for (const x of [7.0, 9.0]) { K.cyl(0.12, 0.08, 0.35, x, 0.94, -7.55, 0xe8e2d4); K.sphere(0.2, x, 1.4, -7.55, 0xe8c040, { rough: 0.9 }); }
  for (let i = -1; i <= 1; i++) { K.cyl(0.05, 0.05, 0.12, 8.0 + i * 1.1, 0.75, -3.2, 0xd8d8d8, { metal: 0.9 }); K.cyl(0.015, 0.015, 0.25, 8.0 + i * 1.1, 0.87, -3.2, 0xfff4dc); }
  // ofis
  K.box(2.2, 0.76, 1.0, -8.8, 0, 5.2, C.walnutD, { col: true, uv: 'wood' }); K.emis(0.6, 0.38, 0.03, -8.8, 0.78, 5.0, 0x9ad0ff);
  K.box(0.7, 1.15, 0.7, -8.8, 0, 6.3, C.leatherK, { col: true, rough: 0.5 });
  for (let i = 0; i < 3; i++) K.box(0.4, 3.2, 1.6, -11.75, 0, 2.9 + i * 1.6 + (i ? 0 : 0), C.walnutD, { col: true, uv: 'wood' });
  K.box(0.9, 1.3, 0.8, -5.7, 0, 7.4, 0x2a2e33, { col: true, metal: 0.7, rough: 0.35 }); // kasa
  K.box(2.4, 0.015, 1.8, -8.8, 0.004, 5.4, 0x5a1a1a, { rough: 1 });

  // =================== 1. KAT ===================
  const y1 = FY[1];
  // ana yatak odası: kadife başlık panosu, komodinler, yatak sonu bankı, denize bakan okuma köşesi
  const bed = bedDouble(K, 7.0, -6.2, 0, C.linen, y1); void bed;
  K.box(3.6, 2.4, 0.1, 7.0, y1, -7.8, C.velvet, { rough: 1 });
  for (const x of [5.4, 8.6]) { K.box(0.6, 0.55, 0.45, x, y1, -7.3, C.walnut, { col: true, uv: 'wood' }); K.cyl(0.05, 0.12, 0.35, x, y1 + 0.55, -7.3, C.brass, BR); K.cyl(0.16, 0.2, 0.24, x, y1 + 0.9, -7.3, 0xf6ead0, { emis: 0.8 }); }
  K.box(1.6, 0.45, 0.45, 7.0, y1, -4.75, C.velvet, { col: true, rough: 1 });
  seats.push(...sofa(K, 10.6, -0.4, -Math.PI / 2, C.cream, 1, y1)); seats.push(...sofa(K, 10.6, 1.4, -Math.PI / 2, C.cream, 1, y1));
  K.cyl(0.35, 0.35, 0.03, 9.6, y1 + 0.5, 0.5, C.marbleW, { seg: 18 }); K.cyl(0.04, 0.04, 0.5, 9.6, y1, 0.5, C.brass, BR);
  K.box(4.4, 0.015, 3.2, 7.0, y1 + 0.004, -5.4, 0xcfc3ad, { rough: 1 });
  // giyinme odası: iki duvar boyu ceviz dolap, ortada ada (cam üstlü takı çekmecesi), boy aynası
  for (let x = -3.5; x <= 1.5; x += 1.0) { K.box(0.96, 2.6, 0.6, x, y1, -7.65, C.walnut, { col: true, uv: 'wood' }); K.box(0.02, 1.8, 0.03, x + 0.4, y1 + 0.5, -7.33, C.brass, BR); }
  for (let z = -7.0; z <= -3.0; z += 1.0) { K.box(0.6, 2.6, 0.96, -3.65, y1, z, C.walnut, { col: true, uv: 'wood' }); K.box(0.03, 1.8, 0.02, -3.33, y1 + 0.5, z + 0.4, C.brass, BR); }
  K.box(1.6, 0.9, 0.8, -0.8, y1, -4.8, C.walnutD, { col: true, uv: 'wood' }); glass(1.6, 0.03, 0.8, -0.8, y1 + 0.9, -4.8);
  K.box(0.8, 2.0, 0.04, 1.85, y1 + 0.2, -2.6, 0xd0dde4, { rough: 0.05, metal: 0.9 });
  // banyo: ayaklı küvet, çift lavabo + ayna, cam duş kabini, havlu ısıtıcı
  K.box(1.8, 0.62, 0.85, -9.4, y1, -6.6, 0xf6f6f2, { col: true, rough: 0.15 }); K.box(1.6, 0.05, 0.65, -9.4, y1 + 0.6, -6.6, 0xbfd8e0, { rough: 0.05 });
  for (const [a, b] of [[-10.2, -6.95], [-8.6, -6.95], [-10.2, -6.25], [-8.6, -6.25]]) K.sphere(0.06, a, y1 + 0.03, b, C.brass, BR);
  K.box(2.6, 0.85, 0.55, -6.6, y1, -7.65, C.walnutD, { col: true, uv: 'wood' }); K.box(2.7, 0.05, 0.6, -6.6, y1 + 0.85, -7.62, C.marbleW, { rough: 0.15 });
  for (const x of [-7.3, -5.9]) { K.cyl(0.22, 0.18, 0.12, x, y1 + 0.9, -7.6, 0xf8f8f8, { rough: 0.1 }); K.box(0.03, 0.22, 0.03, x, y1 + 0.9, -7.85, C.brass, BR); }
  K.box(2.4, 1.1, 0.03, -6.6, y1 + 1.35, -7.92, 0xd0dde4, { rough: 0.05, metal: 0.9 }); K.emis(2.5, 0.05, 0.05, -6.6, y1 + 2.5, -7.85, 0xffe4b8);
  glass(0.03, 2.2, 1.4, -10.4, y1, -3.2); glass(1.6, 2.2, 0.03, -11.2, y1, -2.5);
  K.box(1.5, 0.05, 1.5, -11.2, y1, -3.25, 0xd8d8d8, { rough: 0.3 }); K.cyl(0.12, 0.12, 0.02, -11.2, y1 + 2.15, -3.25, 0xc0c0c0, { metal: 0.9 });
  for (let k = 0; k < 6; k++) K.box(0.6, 0.025, 0.025, -4.5, y1 + 0.5 + k * 0.18, -2.25, C.brass, BR);
  // misafir odası
  bedDouble(K, -8.6, 6.6, Math.PI, 0xc8b8a0, y1);
  for (const x of [-10.0, -7.2]) { K.box(0.5, 0.5, 0.42, x, y1, 7.6, C.oak, { col: true, uv: 'wood' }); K.cyl(0.12, 0.16, 0.26, x, y1 + 0.5, 7.6, 0xf2e6cc, { emis: 0.6 }); }
  seats.push(...sofa(K, -5.6, 3.0, -Math.PI / 2, 0x7a8a6a, 1, y1));
  K.box(1.2, 2.2, 0.55, -11.6, y1, 3.0, C.oak, { col: true, uv: 'wood', rot: Math.PI / 2 });
  // galeri salonu (merdivenin önü): kuyruklu piyano yerine kadife sedir + duvar sanatı
  seats.push(...sofa(K, -1.2, 7.2, Math.PI, C.velvet, 3, y1));
  K.box(1.2, 0.4, 0.6, -1.2, y1, 5.8, C.walnutD, { col: true });
  // =================== 2. KAT ===================
  const y2 = FY[2];
  // çalışma odası: kitaplık duvarı (kuzey), büyük ceviz masa, deri koltuk, chesterfield, küre
  for (let x = -11.2; x <= -4.0; x += 1.2) {
    K.box(1.16, 3.6, 0.42, x, y2, -7.6, C.walnutD, { col: true, uv: 'wood' });
    for (let k = 0; k < 6; k++) { K.box(1.1, 0.03, 0.36, x, y2 + 0.3 + k * 0.55, -7.55, C.walnut);
      for (let b = 0; b < 5; b++) { const c = [0x6a1a1a, 0x1a3a5a, 0x2a4a2a, 0x8a6a2a, 0x3a2a4a, 0xd8c8a8][(b * 5 + k + Math.round(x * 3)) % 6 >>> 0]; K.box(0.13, 0.36 + ((b + k) % 3) * 0.05, 0.26, x - 0.42 + b * 0.21, y2 + 0.33 + k * 0.55, -7.5, c, { rough: 0.8 }); } }
  }
  K.box(2.6, 0.78, 1.2, -7.6, y2, -3.8, C.walnutD, { col: true, uv: 'wood' }); K.box(2.0, 0.02, 0.8, -7.6, y2 + 0.78, -3.8, 0x2e4a32, { rough: 0.9 });
  K.cyl(0.12, 0.1, 0.3, -6.7, y2 + 0.8, -4.0, C.brass, BR); K.sphere(0.12, -6.7, y2 + 1.15, -4.0, 0x1e6a3a, { emis: 0.3 });
  K.box(0.8, 1.3, 0.8, -7.6, y2, -5.0, C.leather, { col: true, rough: 0.6 });
  seats.push(K.chair(-8.2, -2.6, Math.PI, C.leather, { y: y2 })); seats.push(K.chair(-7.0, -2.6, Math.PI, C.leather, { y: y2 }));
  seats.push(...sofa(K, -10.8, -1.0, Math.PI / 2, C.leather, 3, y2));
  K.cyl(0.03, 0.2, 0.8, -4.2, y2, -1.6, C.walnut); K.sphere(0.3, -4.2, y2 + 1.1, -1.6, 0x4a7aa0, { rough: 0.5 });
  K.box(4.0, 0.015, 3.0, -7.6, y2 + 0.004, -3.6, 0x5a1a1a, { rough: 1 });
  // bar salonu: arkası aynalı ceviz bar, pirinç ayaklı tabureler, chesterfield karşılıklı
  K.box(4.2, 1.1, 0.7, 0.0, y2, 6.4, C.walnutD, { col: true, uv: 'wood' }); K.box(4.4, 0.05, 0.85, 0.0, y2 + 1.1, 6.35, C.marbleK, { rough: 0.1 });
  K.box(4.2, 2.2, 0.06, 0.0, y2 + 1.0, 7.8, 0xa8b8c0, { rough: 0.05, metal: 0.9 });
  for (let k = 0; k < 3; k++) { K.box(4.0, 0.03, 0.28, 0.0, y2 + 1.2 + k * 0.6, 7.6, C.brass, BR); for (let b = 0; b < 12; b++) K.cyl(0.04, 0.045, 0.3, -1.8 + b * 0.33, y2 + 1.23 + k * 0.6, 7.6, [0x6a3a10, 0x1a4a2a, 0xd8c890, 0x5a1010][(b + k) % 4], { rough: 0.15 }); }
  for (const x of [-1.5, -0.5, 0.5, 1.5]) { K.cyl(0.2, 0.2, 0.08, x, y2 + 0.75, 5.6, C.leatherK); K.cyl(0.03, 0.15, 0.75, x, y2, 5.6, C.brass, BR); }
  seats.push(...sofa(K, 0.4, -6.6, 0, C.leatherK, 3, y2));
  seats.push(...sofa(K, 0.4, -1.4, Math.PI, C.leatherK, 3, y2));
  K.box(1.6, 0.4, 0.8, 0.4, y2, -4.0, C.walnutD, { col: true }); K.box(4.4, 0.015, 3.6, 0.4, y2 + 0.004, -4.0, 0x3a2a20, { rough: 1 });
  // teras: tik ahşap döşeme, şezlonglar, saksılar, şemsiyeli masa
  K.box(8, 0.03, 10.4, 8, y2, -2.8, 0x8a6a48, { uv: 'wood', rough: 0.8 });
  for (const z of [-6.8, -5.2]) { K.box(0.75, 0.3, 2.0, 10.6, y2, z, 0xf2f2ee, { col: true, rough: 0.9, rot: Math.PI / 2 }); K.box(0.75, 0.5, 0.12, 9.5, y2 + 0.3, z, 0xf2f2ee, { rot: Math.PI / 2 }); }
  K.cyl(0.55, 0.55, 0.04, 7.0, y2 + 0.72, -1.2, 0xeeeeee, { seg: 18 }); K.cyl(0.03, 0.03, 2.4, 7.0, y2, -1.2, 0x888888, { metal: 0.8, col: true });
  K.cyl(0.05, 1.5, 0.4, 7.0, y2 + 2.2, -1.2, 0xe8dcc0, { rough: 1, seg: 12 });
  for (const [x, z] of [[5.0, -7.4], [11.4, -7.4], [11.4, 1.6], [5.0, 1.6]]) { K.box(0.7, 0.6, 0.7, x, y2, z, 0x6a6a64, { col: true, rough: 0.9 }); K.sphere(0.48, x, y2 + 0.95, z, 0x4a7a3a, { rough: 0.9 }); }

  // ---------- dolaylı ışık: tavan kenarı ışık bantları (her katta salon/oda çevresi) ----------
  const cove = (x0, z0, x1, z1, y) => { const c = 0xe2b47a; K.emis(x1 - x0, 0.04, 0.1, (x0 + x1) / 2, y, z0 + 0.1, c); K.emis(x1 - x0, 0.04, 0.1, (x0 + x1) / 2, y, z1 - 0.1, c); K.emis(0.1, 0.04, z1 - z0, x0 + 0.1, y, (z0 + z1) / 2, c); K.emis(0.1, 0.04, z1 - z0, x1 - 0.1, y, (z0 + z1) / 2, c); };
  cove(-11.8, -7.8, 3.8, 1.8, FY[1] - SLAB - 0.12); cove(4.2, -7.8, 11.8, 2.2, FY[1] - SLAB - 0.12);
  cove(2.2, -7.8, 11.8, 2.2, FY[2] - SLAB - 0.12); cove(-11.8, -7.8, -4.2, -2.2, FY[2] - SLAB - 0.12);
  cove(-11.8, -7.8, -3.2, 0.8, VH - 0.12); cove(-2.8, -7.8, 3.8, 7.8, VH - 0.12);

  // ---------- çıkış kapısı (ceviz çift kanat, pirinç kollar) ----------
  K.box(1.8, 3.0, 0.1, 0, 0, hz - 0.06, 0x3a2414, { rough: 0.5 });
  for (const x of [-0.25, 0.25]) K.box(0.05, 0.6, 0.06, x, 1.2, hz - 0.14, C.brass, BR);
  K.box(2.2, 0.12, 0.16, 0, 3.0, hz - 0.08, C.brass, BR);
  ctx.interact.push({ x: 0, z: hz - 0.6, r: 1.3, label: 'Dışarı çık', action: () => I.exit(), cond: onFloor(0) });

  K.finish();
  ctx.furnSeats = ctx.furnSeats || []; void seats;

  // ---------- avizeler (görsel) + ışık havuzu ----------
  I.chandelier(ctx, -9.2, -3.5, FY[1] - SLAB, 1.0);
  I.chandelier(ctx, 8.0, -3.2, FY[1] - SLAB, 0.8);
  I.chandelier(ctx, 0, 4.6, FY[1] - SLAB, 0.7);
  s.add(new THREE.HemisphereLight(0xfff2dc, 0x6a5440, 1.05));
  // chandelier() kendi nokta ışığını ekler (3 adet); ek havuz: 4 ışık, kata göre konum
  const pool = [];
  for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffd6a0, 0, 12, 1.5); s.add(l); pool.push(l); }
  const LAYOUT = [
    [[-1, 2.9, -5.2, 9, 12], [-8.8, 3.1, 5.2, 8, 9], [8.0, 3.2, 5.6, 7, 9], [0, 3.2, 6.6, 6, 8]], // zemin: 2. grup, ofis, merdiven holü, kapı
    [[7.0, y1 + 3.4, -4.5, 10, 11], [-7.5, y1 + 3.4, -5.0, 8, 8], [-0.8, y1 + 3.4, -5.0, 6, 7], [-8.2, y1 + 3.4, 4.8, 8, 9]], // yatak, banyo, giyinme, misafir
    [[-7.6, y2 + 3.4, -3.8, 10, 11], [0.4, y2 + 3.4, -3.0, 9, 11], [0.0, y2 + 3.2, 5.2, 7, 8], [8.0, y2 + 3.4, 5.0, 6, 8]], // çalışma, bar salonu, bar, merdiven
  ];
  // zemin kat avizelerinin ışıkları yalnız zemin katta yanar (üst katta sahnede boşuna hesap yapılmasın diye kısılır)
  const chand = s.children.filter((o) => o.isPointLight && !pool.includes(o));
  let curF = -1;
  ctx.villaFloor = 0;
  const setFloor = (f) => {
    curF = f; ctx.villaFloor = f;
    LAYOUT[f].forEach(([x, y, z, it, dist], i) => { const l = pool[i]; l.position.set(x, y, z); l.intensity = it; l.distance = dist; });
    for (const l of chand) l.intensity = f === 0 ? 14 : 0;
  };
  setFloor(0);

  // ---------- etkileşimler ----------
  const S = VG.securityCam(ctx, I);
  ctx.interact.push({ x: 7.0, z: -4.4, r: 1.7, label: 'Uyu ve Oyunu Kaydet', action: () => g.sleepAndSave(), cond: onFloor(1) });
  ctx.interact.push({ x: -2.6, z: -5.0, r: 1.6, label: 'Gardırop (kıyafet değiştir)', action: () => g.ui.openShop('wardrobe'), cond: onFloor(1) });
  ctx.interact.push({ x: -5.7, z: 6.6, r: 1.4, label: 'Kasa ve cephanelik (cephane doldur ₺)', action: () => g.ui.openShop('stash'), cond: onFloor(0) });
  ctx.interact.push({ x: -8.8, z: 4.4, r: 1.4, label: 'Ofis masası (telefon)', action: () => g.phone && g.phone.open ? g.phone.open() : g.ui.notify('Ofis: işler yolunda, patron.', 'good'), cond: onFloor(0) });
  ctx.interact.push({ x: -9.0, z: -3.5, r: 2.2, label: 'Güvenlik kamerası (kamerayı değiştir)', action: () => S.next(), cond: onFloor(0) });
  ctx.interact.push({ x: 0.4, z: 5.2, r: 1.6, label: 'Bar (bir kadeh)', action: () => g.ui.notify('Buzlu bir kadeh... Boğaz ayaklarının altında.', 'good'), cond: onFloor(2) });
  ctx.peaceful = true;

  // kat değişimi + güvenlik kamerası (ctx.update interiors döngüsünden her kare çağrılır)
  ctx.update = (dt) => {
    const y = g.player.pos.y, f = y > FY[2] - 0.8 ? 2 : y > FY[1] - 0.8 ? 1 : 0;
    if (f !== curF) setFloor(f);
    S.update(dt, f);
  };
  // dış görüntü (küp) arka plan: camlardan Boğaz, bahçe, gökyüzü
  if (ctx.outside) s.background = ctx.outside;
  void canvasPlane;
  return { x: 0, z: hz - 1.6 };
}

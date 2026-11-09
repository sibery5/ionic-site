// [deniz] Limanda ve marinada bağlı tekneler/gemiler.
//  - Bebek Marina: iskele yanlarında sıra sıra bağlı motoryatlar (16 m) ve mega yatlar (28 m) — gerçek Boat araçları
//    (F ile binilir, tekne fiziğiyle sürülür; büyük yat ağır ve geç döner). Halatla yerinde tutulur (yaylı bağ).
//  - Kadıköy limanı tekne iskelesi: balıkçı kaikleri ve sürat tekneleri.
//  - Liman rıhtımında bağlı konteyner gemisi "MERİDYEN" (110 m): soğan baş, bayraklı pruva, sheer hattı, baş kasarası,
//    7 ambar + konteyner istifleri, yan yürüme yolları ve korkuluklar, 5 katlı yaşam mahalli (pencereler gece yanar),
//    köprüüstü kanatları, radar direği (iki radar), baca, mataforalarda kapalı can filikaları, can salı kapsülleri.
//    Rıhtımdan iskele merdiveniyle (çarpışmalı basamaklar) güverteye çıkılır, güvertede yürünür; deniz tarafında
//    kılavuz kaptan merdiveni (yüzerken tırmanılır, sea_ladders.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MARINA, HARBOR, WATER_Y } from './map.js';
import { shipHull, vc, bare, B3, CY, rod, railing, winRow, winRowX } from './ships_hull.js';
import { lightize, makeLightsMat } from '../entities/vehicles.js';
import { addSeaHull } from '../entities/boats.js';
import { oceanObstacle, nightGlowMaterial } from './shaders.js';
import { containerTexture, signTexture } from '../core/textures.js';
import { RNG } from '../core/util.js';

// ---------------- Marina + liman tekne iskelesi: bağlı (sürülebilir) tekneler ----------------
export function spawnMooredFleet(game) {
  if (!game.boats) return [];
  const out = [];
  const rng = new RNG(1923);
  const add = (type, x, z, h, color) => {
    try {
      const v = game.boats.add(type, x, z, h, color);
      v.moored = true; v.berth = { x, z, h };
      out.push(v);
    } catch (e) { console.warn('bağlı tekne', e); }
  };
  // marina: her iskele yanı ya bir mega yat ya da iki motoryat (askerî/dünya teknelerinin yerleri boş kalır)
  const busy = (MARINA.berths || []).filter((_, i) => i === 2 || i === 7).map((b) => b.z);
  let k = 0;
  for (const pz of [-690.25, -655.25, -620.25, -585.25]) for (const side of [-1, 1]) {
    const z = pz + side * 6.4;
    if (busy.some((bz) => Math.abs(bz - z) < 0.5)) continue;
    if (pz === -585.25 && side > 0) { add('yat', 246, z, Math.PI / 2, rng.pick(['#f4f4f4', '#1a2430'])); continue; } // kulüp platformu
    if (k++ % 2 === 0) add('megayat', 236, z, Math.PI / 2, rng.pick(['#f4f4f4', '#f4f4f4', '#1a2430', '#7d8a96']));
    else { add('yat', 223, z, Math.PI / 2, rng.pick(['#f4f4f4', '#1a2430'])); add('yat', 247, z, Math.PI / 2, rng.pick(['#f4f4f4', '#7d8a96'])); }
  }
  // liman tekne iskelesi: balıkçılar ve sürat tekneleri (pruva kuzeye)
  HARBOR.berths.forEach((b, i) => {
    if (i % 3 === 2) add('surat', b.x, b.z, b.heading, rng.pick(['#e8e8e8', '#c81010', '#1d3d8e']));
    else add('balikci', b.x, b.z, b.heading, rng.pick(['#2a6ab0', '#2d7a4a', '#c84a1a', '#e8e8e8']));
  });
  return out;
}

// ---------------- Rıhtımda bağlı konteyner gemisi (yürünebilir güverte) ----------------
const SHIP = { L: 110, B: 18, D: 6, F: 5.0 };
const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 });
const steelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.55 });
const boxMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: containerTexture(), roughness: 0.6, metalness: 0.3 });
const winMat = nightGlowMaterial(0x141a20, 0xffd890, 1.6, { rough: 0.1, metal: 0.6 });

export function buildMooredShips(game) {
  const physics = game.physics, cols = physics.city;
  const T = HARBOR.terminal;
  const { L, B, D, F } = SHIP;
  const heading = Math.PI / 2; // pruva doğuya (+x); iskele (yerel +x) tarafı rıhtıma bakar
  const cx = (T.x0 + T.x1) / 2, cz = T.z1 + B / 2 + 1.3;
  const dy = F;
  const rng = new RNG(777);
  const RED = 0x9a1c18, HULL = 0x1e3a5c, WHITE = 0xeeeee8, DECK = 0x6a3a2e, GREY = 0x8a9096, YEL = 0xe8b820, ORANGE = 0xff6a10;
  const H = shipHull({ L, B, D, F, bow: 0.2, stern: 0.84, run: 0.12, flare: 0.24, sheer: 0.32, bulb: 5.5, cBottom: RED, cBoot: 0x141414, cTop: HULL, cStripe: WHITE, stripeH: 0.5, nL: 56, bootLo: -0.3, bootHi: 0.6 });
  const P = [...H.parts], S = [], K = [], W = [], N = [];
  P.push(vc(H.deck, DECK));
  // gövde yazısı (kurgusal ad) ve borda numarası: ayrı levha
  // baş kasarası (forecastle): yükseltilmiş güverte, dalgakıran, ırgatlar, demir loçaları, baş direği
  const fz0 = L / 2 - 12;
  P.push(vc(B3(B * 0.82, 2.3, 11, 0, dy + 1.15, fz0 + 5.2), HULL), vc(B3(B * 0.82, 0.08, 11, 0, dy + 2.32, fz0 + 5.2), DECK));
  P.push(vc(B3(B * 0.74, 1.6, 0.3, 0, dy + 3.1, fz0 - 0.4), WHITE));
  for (const s of [-1, 1]) {
    S.push(vc(CY(0.6, 0.6, 1.0, 12, s * 2.6, dy + 2.9, fz0 + 6, 'x'), 0x2a3a2a), vc(CY(0.25, 0.25, 2.0, 8, s * 1.6, dy + 2.9, fz0 + 6, 'x'), 0x1a1a1a));
    S.push(vc(CY(0.62, 0.62, 0.4, 10, s * B * 0.42, dy - 1.2, fz0 + 7.5, 'x'), 0x0a0a0a));
  }
  S.push(vc(CY(0.14, 0.18, 7, 8, 0, dy + 5.8, fz0 + 8), YEL));
  N.push(lightize(new THREE.SphereGeometry(0.3, 8, 6).translate(0, dy + 9.4, fz0 + 8), 0xdddddd, 0xffffff, 0));
  railing(S, YEL, -B * 0.4, fz0 + 1, -B * 0.25, L / 2 - 1.5, dy + 2.35, 1.0, 1.4); railing(S, YEL, B * 0.4, fz0 + 1, B * 0.25, L / 2 - 1.5, dy + 2.35, 1.0, 1.4);
  // ambarlar: kapak + mezarna + konteyner istifleri (deterministik)
  const bays = 7, bayL = 12.6, z0 = -L / 2 + 23;
  const hw = B - 4.4; // ambar mezarna genişliği (iki yanda 2.2 m yürüme yolu)
  const CC = [0xc81010, 0x1d5aa8, 0x2d7a3a, 0xe8a020, 0xd8d8d8, 0x7a3a8a, 0x5a3a2a, 0x1a8a8a, 0xc85a10];
  const stacks = [];
  for (let i = 0; i < bays; i++) {
    const z = z0 + i * (bayL + 0.4) + bayL / 2;
    P.push(vc(B3(hw, 1.2, bayL, 0, dy + 0.6, z), 0x3a4a3a), vc(B3(hw + 0.1, 0.1, bayL + 0.1, 0, dy + 1.25, z), 0x2a342a));
    const tiers = 1 + ((i * 7 + 3) % 3);
    for (let r = -2; r <= 2; r++) for (let t = 0; t < tiers; t++) for (const h of [-1, 1]) {
      if (rng.next() < 0.05) continue;
      K.push(vc(B3(2.44, 2.55, 6.06, r * 2.5, dy + 1.3 + 1.28 + t * 2.6, z + h * 3.1), rng.pick(CC), true));
    }
    // bağlama köprüsü (lashing bridge) bölmeler arasında
    if (i > 0) S.push(vc(B3(hw, 2.6, 0.25, 0, dy + 2.6, z - bayL / 2 - 0.2), 0xb8b8b0));
    stacks.push({ z, top: dy + 1.3 + tiers * 2.6 });
  }
  // yan korkuluklar (borda boyunca, rıhtım tarafında iskele boşluğu)
  const gx = 23; // iskele merdiveni yeri (yerel z): rıhtım usturmaçaları ve STS vinç bacaklarının arasında
  for (const s of [-1, 1]) {
    const x = s * (B / 2 - 0.35);
    if (s > 0) { railing(S, YEL, x, -L / 2 + 22, x, gx - 1.2, dy, 1.05, 1.6); railing(S, YEL, x, gx + 1.2, x, fz0, dy, 1.05, 1.6); }
    else railing(S, YEL, x, -L / 2 + 22, x, fz0, dy, 1.05, 1.6);
  }
  // yaşam mahalli (kıç): 5 kat, pencere sıraları, köprüüstü kanatları
  const sz = -L / 2 + 13, sw = B * 0.84, sd = 12;
  for (let k = 0; k < 5; k++) {
    const w = sw - k * 0.5, d = sd - k * 0.3, y = dy + 1.35 + k * 2.7;
    P.push(vc(B3(w, 2.7, d, 0, y, sz), WHITE), vc(B3(w + 0.4, 0.12, d + 0.4, 0, y + 1.38, sz), 0xc8c8c0));
    winRowX(W, sz + d / 2 + 0.01, y + 0.2, -w * 0.42, w * 0.42, 8, 1.0, 0.9);
    winRow(W, w / 2 + 0.01, y + 0.2, sz - d * 0.4, sz + d * 0.4, 5, 1.0, 0.9);
    railing(S, WHITE, -w / 2 - 0.15, sz + d / 2 + 0.2, w / 2 + 0.15, sz + d / 2 + 0.2, y + 1.44, 1.0, 1.3, 0.03);
  }
  const by = dy + 1.35 + 5 * 2.7;
  P.push(vc(B3(sw * 0.86, 2.6, 7, 0, by, sz + 1), WHITE), vc(B3(B * 1.06, 0.4, 2.8, 0, by + 0.6, sz + 3.2), WHITE));
  P.push(vc(B3(sw * 0.9, 0.18, 7.4, 0, by + 1.4, sz + 1), 0x2a2a2a));
  W.push(B3(sw * 0.8, 1.1, 0.06, 0, by + 0.35, sz + 4.52));
  for (const s of [-1, 1]) W.push(B3(0.06, 1.0, 1.8, s * (B * 0.53 + 0.01), by + 0.9, sz + 3.2));
  railing(S, WHITE, -B * 0.53, sz + 4.6, B * 0.53, sz + 4.6, by + 0.8, 1.0, 1.2, 0.03);
  // radar direği: iki radar anteni, fenerler
  S.push(vc(CY(0.16, 0.2, 4, 8, 0, by + 3.4, sz + 0.5), WHITE), vc(B3(3.2, 0.14, 0.4, 0, by + 4.6, sz + 0.5), 0x1a1a1a), vc(B3(2.6, 0.14, 0.35, 0, by + 3.6, sz + 1.6), 0x1a1a1a));
  N.push(lightize(new THREE.SphereGeometry(0.3, 8, 6).translate(0, by + 5.6, sz + 0.5), 0xdddddd, 0xffffff, 0));
  N.push(lightize(new THREE.SphereGeometry(0.3, 8, 6).translate(B * 0.53, by + 1.0, sz + 3.2), 0x501010, 0xff2020, 0));
  N.push(lightize(new THREE.SphereGeometry(0.3, 8, 6).translate(-B * 0.53, by + 1.0, sz + 3.2), 0x105010, 0x20ff40, 0));
  // baca (şirket bandı)
  P.push(vc(B3(3.6, 5, 4.4, 0, by + 1.2, sz - 6), WHITE), vc(B3(3.65, 1.2, 4.45, 0, by + 2.4, sz - 6), 0x1d5aa8), vc(B3(3.66, 0.6, 4.46, 0, by + 3.45, sz - 6), 0x111111));
  // can filikaları: mataforalarda turuncu kapalı filikalar (iki yan), can salı kapsülleri
  for (const s of [-1, 1]) {
    const lx = s * (B / 2 + 0.2), ly = dy + 1.35 + 2 * 2.7 + 0.4;
    S.push(vc(new THREE.CapsuleGeometry(1.25, 4.6, 6, 12).rotateX(Math.PI / 2).scale(1, 0.8, 1).translate(lx, ly, sz - 2), ORANGE));
    S.push(vc(B3(1.6, 0.6, 3.8, lx, ly + 1.1, sz - 2), WHITE));
    for (const z of [sz - 4.6, sz + 0.6]) S.push(vc(rod(s * (B / 2 - 0.8), ly - 1.4, z, lx, ly + 1.6, z, 0.12, 6), 0xd8d8d8));
    for (let i = 0; i < 2; i++) S.push(vc(new THREE.CapsuleGeometry(0.4, 1.0, 4, 8).rotateX(Math.PI / 2).translate(s * (B / 2 - 0.7), dy + 1.35 + 2.7 + 0.5, sz + 4 + i * 1.3), WHITE));
  }
  // kıç: bayrak direği, palamar babaları, halatlar (rıhtıma)
  S.push(vc(CY(0.05, 0.05, 4, 6, 0, dy + 2.2 + 0.6, -L / 2 + 1.2), 0xdddddd), vc(B3(0.03, 1.0, 1.6, 0, dy + 4.2, -L / 2 + 0.4), 0xc8102e));
  for (const z of [-L / 2 + 4, -L / 2 + 26, L / 2 - 26, L / 2 - 6]) {
    S.push(vc(CY(0.25, 0.25, 0.6, 8, B / 2 - 1, dy + 0.3, z), 0x1a1a1a));
    S.push(vc(rod(B / 2 - 1, dy + 0.5, z, B / 2 + 3.5, -WATER_Y + 0.4, z + (z > 0 ? 7 : -7), 0.06, 4), 0xd8c8a0)); // palamar halatı (rıhtım babasına)
  }
  // iskele merdiveni (gangway) görseli: rıhtımdan güverteye eğik basamaklar + korkuluk
  const gw = [];
  const steps = 8, rise = (dy + WATER_Y) / steps; // rıhtım y=0 → güverte y = WATER_Y + F
  // ---- dünya yerleşimi ----
  const grp = new THREE.Group();
  grp.position.set(cx, WATER_Y, cz); grp.rotation.y = heading;
  const hm = new THREE.Mesh(mergeGeometries(P.map((x) => { const n = x.index ? x.toNonIndexed() : x; if (n.attributes.uv) n.deleteAttribute('uv'); return n; })), hullMat);
  hm.castShadow = true; hm.receiveShadow = true; grp.add(hm);
  const st = new THREE.Mesh(mergeGeometries(S.map((x) => { const n = x.index ? x.toNonIndexed() : x; if (n.attributes.uv) n.deleteAttribute('uv'); return n; })), steelMat); st.castShadow = true; grp.add(st);
  const km = new THREE.Mesh(mergeGeometries(K), boxMat); km.castShadow = true; km.receiveShadow = true; grp.add(km);
  grp.add(new THREE.Mesh(mergeGeometries(W.map((x) => bare(x))), winMat));
  const lm = makeLightsMat(); grp.add(new THREE.Mesh(mergeGeometries(N), lm));
  // ad levhaları (iki baş omuzluğu + kıç aynası)
  const nameMat = new THREE.MeshBasicMaterial({ map: signTexture('MERİDYEN', '#1e3a5c', '#f2f0ea', 512, 96), transparent: false });
  for (const s of [-1, 1]) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.5), nameMat); pl.position.set(s * (B / 2 + 0.25), dy - 1.1, L / 2 - 14); pl.rotation.y = s * Math.PI / 2; grp.add(pl); }
  const tr = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.4), new THREE.MeshBasicMaterial({ map: signTexture('MERİDYEN · İSTANBUL', '#1e3a5c', '#f2f0ea', 512, 96) })); tr.position.set(0, dy - 0.8, -L / 2 - 0.05); tr.rotation.y = Math.PI; grp.add(tr);
  game.scene.add(grp);
  // gangway: dünya koordinatında (rıhtımda, gemiye paralel; x boyunca yükselir)
  const qz = T.z1 - 2.2; // basamak hattı (rıhtım kenarından geride; usturmaçalar serbest)
  const g0x = cx + gx - steps * 0.55 - 1.2;
  for (let i = 0; i < steps; i++) {
    const x = g0x + i * 0.55, y = (i + 1) * rise;
    gw.push(vc(B3(0.55, 0.12, 1.3, x + 0.275, y - 0.06, qz), 0x8a8a84));
    cols.add(x, qz - 0.65, x + 0.55, qz + 0.65, 0, y, 'gangway');
  }
  const topY = WATER_Y + dy, px0 = cx + gx - 1.2, px1 = cx + gx + 1.2;
  gw.push(vc(B3(2.4, 0.15, cz - B / 2 + 1.2 - (qz - 0.65), (px0 + px1) / 2, topY - 0.08, (qz - 0.65 + cz - B / 2 + 1.2) / 2), 0x8a8a84));
  cols.add(px0, qz - 0.65, px1, cz - B / 2 + 1.2, topY - 0.3, topY, 'gangway'); // ince köprü (altından su/usturmaça serbest)
  for (const s of [-1, 1]) {
    const zz = qz + s * 0.65;
    gw.push(vc(rod(g0x, 1.0, zz, g0x + steps * 0.55, topY + 1.0, zz, 0.03, 5), 0xd8d8d8));
    for (let i = 0; i <= steps; i += 2) gw.push(vc(CY(0.025, 0.025, 1.0, 5, g0x + i * 0.55, i * rise + 0.5, zz), 0xd8d8d8));
  }
  cols.add(g0x - 0.1, qz + 0.6, px0, qz + 0.7, 0, topY + 1.0, 'gangwayRail').noClimb = true;
  const gm = new THREE.Mesh(mergeGeometries(gw), steelMat); gm.castShadow = true; game.scene.add(gm);
  // ---- çarpışma: gövde (güverte yüksekliğine kadar katı; üstü yürünebilir), kasara, ambarlar/konteynerler, yaşam mahalli,
  // korkuluklar (tırmanılamaz; iskele boşluğu açık). Yerel z → dünya x, yerel x → dünya −z (heading = π/2).
  const W2 = (lx, lz) => ({ x: cx + lz, z: cz - lx });
  const box = (lx0, lx1, lz0, lz1, y0, y1, tag) => { const a = W2(lx0, lz0), b = W2(lx1, lz1); return cols.add(Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z), y0, y1, tag); };
  const deckY = WATER_Y + dy;
  box(-B / 2 + 0.2, B / 2 - 0.2, -L / 2 + 1, L / 2 - 12, WATER_Y - D, deckY, 'shipDeck');
  box(-B * 0.3, B * 0.3, L / 2 - 12, L / 2 - 2, WATER_Y - D, deckY + 2.3, 'shipBow');
  box(-B * 0.15, B * 0.15, L / 2 - 2, L / 2 + 0.5, WATER_Y - D, deckY + 2.3, 'shipBow');
  box(-B / 2 + 0.2, B / 2 - 0.2, L / 2 - 12, L / 2 - 5, WATER_Y - D, deckY + 2.3, 'shipBow');
  for (const k of stacks) box(-hw / 2, hw / 2, k.z - bayL / 2, k.z + bayL / 2, deckY, WATER_Y + k.top, 'containers');
  box(-sw / 2, sw / 2, sz - sd / 2, sz + sd / 2, deckY, WATER_Y + by + 1.4, 'superstructure');
  box(-1.8, 1.8, sz - 8.2, sz - 3.8, deckY, WATER_Y + by + 3.7, 'funnel');
  for (const s of [-1, 1]) {
    const x0 = s * (B / 2 - 0.45), x1 = s * (B / 2 - 0.25);
    if (s > 0) { box(Math.min(x0, x1), Math.max(x0, x1), -L / 2 + 1, gx - 1.2, deckY, deckY + 1.05, 'shipRail').noClimb = true; box(Math.min(x0, x1), Math.max(x0, x1), gx + 1.2, L / 2 - 12, deckY, deckY + 1.05, 'shipRail').noClimb = true; }
    else box(Math.min(x0, x1), Math.max(x0, x1), -L / 2 + 1, L / 2 - 12, deckY, deckY + 1.05, 'shipRail').noClimb = true;
  }
  box(-B / 2 + 0.2, B / 2 - 0.2, -L / 2 + 0.6, -L / 2 + 1, deckY, deckY + 1.05, 'shipRail').noClimb = true;
  addSeaHull(cx, cz, B + 1, L + 2, heading);
  oceanObstacle(cx, cz, L / 2, B / 2);
  // deniz tarafında kılavuz kaptan merdiveni (yüzen oyuncu için)
  const pilot = W2(-(B / 2 + 0.1), -4);
  game.seaLadders = game.seaLadders || [];
  game.seaLadders.push({ x: pilot.x, z: pilot.z, nx: 0, nz: 1, top: deckY, rope: true, inX: pilot.x, inZ: pilot.z - 1.6, deck: true });
  S.length = 0;
  return { group: grp, deckY, cx, cz, L, B, heading, gangway: { x: (px0 + px1) / 2, z: qz, bottomX: g0x - 0.8 } };
}

// Köprüler: 15 Temmuz Şehitler Köprüsü (asma köprü: çelik kutu kiriş tabliye, iki bacaklı kuleler ve portal
// kirişleri, parabolik ana kablolar, geri gergiler, eğik zikzak askılar, gece renk değiştiren LED "gerdanlık"),
// Galata Köprüsü (iki katlı: üstte yol + balıkçılar ve fenerleri, altta kemerli lokanta galerisi, ortada açılır
// bölüm kuleleri), Unkapanı Köprüsü ve Kız Kulesi adası.
// Tabliye yükseklikleri bridge_profile.js'ten gelir (fizik/araç entegrasyonu için bridgeHeightAt).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BRIDGES, ISLAND, WATER_Y } from './map.js';
import { DECK_TOP, GALATA_TOP, bosphorusDeckY, galataDeckY, bridgeHeightAt, BOS_X0, BOS_X1, GAL_Z0, GAL_Z1 } from './bridge_profile.js';
import { SHARED, pbrMaterial, terrainMaterial, markingMaterial, floodMaterial, nightGlowMaterial, oceanObstacle } from './shaders.js';
import { ashlarPBR, steelPBR, granitePBR, leadPBR, plasterPBR } from '../core/textures.js';

const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
const nI = (g) => (g.index ? g.toNonIndexed() : g);
function strip(g) { const n = nI(g); for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k); return n; }
function merge(list) { return mergeGeometries(list.map(strip)); }
export function box(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }
export function rod(ax, ay, az, bx, by, bz, r, seg = 5) {
  _d.set(bx - ax, by - ay, bz - az); const L = _d.length();
  const g = new THREE.CylinderGeometry(r, r, L, seg, 1, true);
  _q.setFromUnitVectors(_up, _d.normalize());
  g.applyQuaternion(_q); g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  return g;
}
// Kesit taraması: eksen boyunca (a0..a1, n adım) kesit çoklu çizgisi [[yanal, dikey], ...]; yükseklik yFn(s).
// Normal yönü: çizgi yönünün solu (+90°) dışarı bakar.
function sweep(axis, a0, a1, n, yFn, c0, pts) {
  const pos = [], idx = [], m = pts.length;
  for (let i = 0; i <= n; i++) {
    const s = a0 + ((a1 - a0) * i) / n, y = yFn(s);
    for (const [c, dy] of pts) { if (axis === 'x') pos.push(s, y + dy, c0 + c); else pos.push(c0 + c, y + dy, s); }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < m - 1; j++) {
    const a = i * m + j, b = i * m + j + 1, c = (i + 1) * m + j, d = (i + 1) * m + j + 1;
    if (axis === 'x') idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const f = g.toNonIndexed(); f.computeVertexNormals();
  return f;
}

// Gece LED ışıkları: renk tonu zamanla dolaşır (15 Temmuz Köprüsü aydınlatması), gündüz sönük gri
export function ledMaterial(kind = 'cycle') {
  const m = new THREE.MeshBasicMaterial({ color: 0x777777, fog: true });
  const c = new THREE.Color();
  m.userData.tick = () => {
    const n = SHARED.uNight.value, t = SHARED.uTime.value;
    if (kind === 'cycle') c.setHSL((t * 0.02) % 1, 0.85, 0.55); else if (kind === 'warm') c.setRGB(1, 0.72, 0.38); else c.setRGB(1, 0.15, 0.1);
    const k = kind === 'red' ? 0.3 + n * 5 * (Math.sin(t * 3) > 0 ? 1 : 0.15) : n * 4;
    m.color.setRGB(0.18 + c.r * k, 0.18 + c.g * k, 0.18 + c.b * k);
  };
  return m;
}
function tickMesh(mesh) { mesh.onBeforeRender = () => mesh.material.userData.tick && mesh.material.userData.tick(); return mesh; }

export function buildBridges(group, cols, city, quality = 'medium') {
  const out = { meshes: [] };
  const roadMat = city && city.maskTex ? terrainMaterial(city.maskTex, quality) : pbrMaterial(granitePBR(quality), { color: 0x555555 });
  const steelGrey = pbrMaterial(steelPBR(quality), { color: 0xb4b9be, scale: 0.35, rough: 0.55, metal: 0.35, wetK: 0 });
  const girderGrey = pbrMaterial(steelPBR(quality), { color: 0x8d9398, scale: 0.4, rough: 0.6, metal: 0.3, wetK: 0 });
  const concrete = pbrMaterial(granitePBR(quality), { color: 0xa6a299, scale: 0.35, wetK: 0 });
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x5c6268, metalness: 0.75, roughness: 0.35 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x6c7378, metalness: 0.7, roughness: 0.4 });
  const galGreen = pbrMaterial(steelPBR(quality), { color: 0x6f8580, scale: 0.4, rough: 0.6, metal: 0.25, wetK: 0 });
  const add = (geo, mat, shadow = true, receive = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = receive; group.add(m); out.meshes.push(m); return m; };

  const B = BRIDGES.find((b) => b.axis === 'x');
  const G = BRIDGES.find((b) => b.name.startsWith('Galata'));
  const UK = BRIDGES.find((b) => b.name.startsWith('Unkapan'));
  const roadG = [], steelG = [], girderG = [], concG = [], cableG = [], railG = [], ledG = [], greenG = [], markG = [];

  // ================= 15 Temmuz Şehitler Köprüsü =================
  {
    const zc = (B.z0 + B.z1) / 2, hw = (B.z1 - B.z0) / 2; // 11
    const yf = (x) => bosphorusDeckY(x);
    const N = Math.round((BOS_X1 - BOS_X0) / 2.5);
    // yol yüzeyi (zemin şaderi: asfalt maskesi, ıslaklık, su birikintisi)
    roadG.push(sweep('x', BOS_X0, BOS_X1, N, yf, zc, [[-hw, 0.0], [hw, 0.0]]));
    // aerodinamik kutu kiriş (dışa bakan normallerle)
    girderG.push(sweep('x', BOS_X0, BOS_X1, N, yf, zc, [[hw, -0.02], [hw + 0.25, -0.55], [hw - 3.2, -2.6], [-hw + 3.2, -2.6], [-hw - 0.25, -0.55], [-hw, -0.02]]));
    // bariyerler (yol kenarı çelik bariyer) ve dış korkuluk
    for (const s of [-1, 1]) {
      railG.push(sweep('x', BOS_X0, BOS_X1, N, yf, zc, s > 0 ? [[9.25, 0.0], [9.25, 0.85], [9.45, 0.85], [9.45, 0.0]] : [[-9.45, 0.0], [-9.45, 0.85], [-9.25, 0.85], [-9.25, 0.0]]));
      railG.push(sweep('x', BOS_X0, BOS_X1, N, yf, zc, s > 0 ? [[hw - 0.12, 1.05], [hw - 0.12, 1.15], [hw - 0.02, 1.15]] : [[-hw + 0.02, 1.15], [-hw + 0.12, 1.15], [-hw + 0.12, 1.05]]));
      for (let x = BOS_X0 + 1; x < BOS_X1; x += 2.5) railG.push(box(0.07, 1.15, 0.07, x, yf(x) + 0.575, zc + s * (hw - 0.07)));
      // çarpışma: korkuluk parçaları (eğim boyunca 3 m'lik kutular)
      for (let x = BOS_X0 + 8; x < BOS_X1 - 8; x += 3) {
        const a = yf(x), b = yf(x + 3);
        cols.add(x, zc + s * (hw - 0.3) - 0.12, x + 3, zc + s * (hw - 0.3) + 0.12, Math.min(a, b) - 0.3, Math.max(a, b) + 1.1, 'rail');
      }
    }
    // şerit çizgileri: eğimi izleyen ince bantlar (düz örnekli çizgiler eğimde gömülürdü)
    const dash = (x0, x1, z, w) => markG.push(sweep('x', x0, x1, Math.max(1, Math.round((x1 - x0) / 1.5)), (x) => yf(x) + 0.012, zc + z, [[-w / 2, 0], [w / 2, 0]]));
    for (const z of [-8.6, 8.6]) dash(BOS_X0 + 6, BOS_X1 - 6, z, 0.15); // kenar çizgileri
    for (const z of [-0.12, 0.12]) dash(BOS_X0 + 6, BOS_X1 - 6, z, 0.12); // orta çift çizgi
    for (const z of [-4.3, 4.3]) for (let x = BOS_X0 + 8; x < BOS_X1 - 8; x += 9) dash(x, x + 4, z, 0.13);
    // tabliye desteği (yürünebilirlik): 1.5 m'lik basamaklar (adım < 0.45 m) — oyuncu/NPC fizik desteği bunlardan gelir
    for (let x = BOS_X0; x < BOS_X1 - 0.01; x += 1.5) {
      const top = (yf(x) + yf(Math.min(BOS_X1, x + 1.5))) / 2;
      if (top < 0.12) continue;
      cols.add(x, B.z0, x + 1.5, B.z1, top - 2.6, top, 'bridgeDeck');
    }
    // kuleler (kıyıya yakın, suyun içinde), iki bacak + 3 portal kirişi
    const TOWERS = [206, 414], TOP = 62, LZ = 12.6;
    for (const tx of TOWERS) {
      for (const s of [-1, 1]) {
        const z = zc + s * LZ;
        const leg = new THREE.CylinderGeometry(1.0, 1.0, TOP - WATER_Y + 1, 4, 1);
        leg.rotateY(Math.PI / 4);
        const p = leg.attributes.position;
        for (let i = 0; i < p.count; i++) { const t = (p.getY(i) + (TOP - WATER_Y + 1) / 2) / (TOP - WATER_Y + 1); const k = 1 - t * 0.28; p.setX(i, p.getX(i) * 2.3 * k); p.setZ(i, p.getZ(i) * 2.0 * k); }
        leg.computeVertexNormals();
        leg.translate(tx, (TOP + WATER_Y - 1) / 2, z);
        steelG.push(leg);
        steelG.push(box(2.0, 1.2, 1.8, tx, TOP + 0.6, z)); // eyer
        concG.push(box(8.5, 4.5, 6.5, tx, WATER_Y - 1.2, z)); // temel kesonu
        cols.add(tx - 1.7, z - 1.5, tx + 1.7, z + 1.5, WATER_Y - 5, TOP + 1.2, 'tower');
        oceanObstacle(tx, z, 4.25, 3.25);
        // LED şeritleri (bacak iç yüzü)
        ledG.push(box(0.25, TOP - 4, 0.25, tx - 1.2, TOP / 2 + 1, z - s * 1.05));
        ledG.push(box(0.25, TOP - 4, 0.25, tx + 1.2, TOP / 2 + 1, z - s * 1.05));
      }
      for (const [y, hgt] of [[26, 2.4], [44, 2.0], [60.5, 2.4]]) {
        steelG.push(box(2.0, hgt, LZ * 2 - 2.6, tx, y, zc));
        cols.add(tx - 1, zc - LZ + 1.3, tx + 1, zc + LZ - 1.3, y - hgt / 2, y + hgt / 2, 'tower');
      }
      // uçak ikaz lambaları
      for (const s of [-1, 1]) out.redLights = (out.redLights || []).concat([[tx, TOP + 1.6, zc + s * LZ]]);
    }
    // ana kablolar: kuleler arası parabol, geri gergiler kıyıdaki ankrajlara
    const CZ = LZ - 0.8;
    const yMid = yf(310) + 2.2, yTop = TOP + 1.2;
    const cableY = (x) => { const u = (x - 310) / 104; return yMid + (yTop - yMid) * u * u; };
    const ANCH = [[165, 1.2], [460, 1.2]];
    for (const s of [-1, 1]) {
      const z = zc + s * CZ;
      const pts = [];
      for (let i = 0; i <= 64; i++) { const x = 206 + (208 * i) / 64; pts.push(new THREE.Vector3(x, cableY(x), z)); }
      cableG.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.42, 8));
      for (const [ti, [ax, ay]] of [[0, ANCH[0]], [1, ANCH[1]]].map(([i, a]) => [i, a])) {
        const tx = TOWERS[ti];
        const bp = [];
        for (let i = 0; i <= 12; i++) { const t = i / 12; bp.push(new THREE.Vector3(tx + (ax - tx) * t, yTop + (ay - yTop) * t - Math.sin(t * Math.PI) * 2.0, z + s * 0.6 * t)); }
        cableG.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bp), 24, 0.42, 8));
        // gerdanlık ışıkları (geri gergi)
        for (let i = 1; i < 12; i++) { const p = bp[i]; ledG.push(new THREE.SphereGeometry(0.32, 6, 4).translate(p.x, p.y + 0.45, p.z)); }
        // ankraj bloğu (kaldırım kenarında)
        concG.push(box(3.2, 2.4, 2.2, ax, 1.2, z + s * 0.6));
        cols.add(ax - 1.6, z + s * 0.6 - 1.1, ax + 1.6, z + s * 0.6 + 1.1, 0, 2.4, 'anchor');
      }
      // eğik zikzak askılar (15 Temmuz'un ayırt edici "V" askıları)
      for (let i = 0; i <= 25; i++) {
        const x = 210 + i * 8, xd = x + (i % 2 ? 4 : -4);
        const yc = cableY(x), yd = yf(xd) - 0.3;
        if (yc - yd < 1.2) continue;
        cableG.push(rod(x, yc, z, xd, yd, zc + s * (hw + 0.15), 0.07, 4));
      }
      for (let x = 210; x <= 410; x += 6) ledG.push(new THREE.SphereGeometry(0.3, 6, 4).translate(x, cableY(x) + 0.5, z));
    }
  }

  // ================= Galata Köprüsü (iki katlı) =================
  {
    const xc = (G.x0 + G.x1) / 2, hw = (G.x1 - G.x0) / 2; // 10
    const yf = (z) => galataDeckY(z);
    const N = Math.round((GAL_Z1 - GAL_Z0) / 2);
    roadG.push(sweep('z', GAL_Z0, GAL_Z1, N, yf, xc, [[-hw, 0], [hw, 0]]));
    greenG.push(sweep('z', GAL_Z0, GAL_Z1, N, yf, xc, [[-hw, -0.02], [-hw - 0.2, -0.3], [-hw - 0.2, -1.0], [hw + 0.2, -1.0], [hw + 0.2, -0.3], [hw, -0.02]]));
    // dökme demir korkuluk (üst + alt bant, sık dikmeler)
    for (const s of [-1, 1]) {
      const x = xc + s * (hw - 0.1);
      railG.push(sweep('z', GAL_Z0 + 2, GAL_Z1 - 2, N, (z) => yf(z) + 1.0, x, [[-0.05, 0], [-0.05, 0.08], [0.05, 0.08], [0.05, 0]]));
      railG.push(sweep('z', GAL_Z0 + 2, GAL_Z1 - 2, N, (z) => yf(z) + 0.15, x, [[-0.04, 0], [-0.04, 0.06], [0.04, 0.06], [0.04, 0]]));
      for (let z = GAL_Z0 + 2; z < GAL_Z1 - 2; z += 0.9) railG.push(box(0.03, 0.9, 0.03, x, yf(z) + 0.6, z));
      for (let z = GAL_Z0 + 10; z < GAL_Z1 - 10; z += 3) {
        const a = yf(z), b = yf(z + 3);
        cols.add(x - 0.12, z, x + 0.12, z + 3, Math.min(a, b) - 0.3, Math.max(a, b) + 1.05, 'rail');
      }
    }
    for (let z = GAL_Z0; z < GAL_Z1 - 0.01; z += 1.5) {
      const top = (yf(z) + yf(Math.min(GAL_Z1, z + 1.5))) / 2;
      if (top < 0.12) continue;
      cols.add(G.x0, z, G.x1, z + 1.5, top - 1.0, top, 'bridgeDeck');
    }
    // şerit çizgileri
    const dash = (z0, z1, x, w) => markG.push(sweep('z', z0, z1, Math.max(1, Math.round((z1 - z0) / 1.5)), (z) => yf(z) + 0.012, xc + x, [[-w / 2, 0], [w / 2, 0]]));
    for (const x of [-0.1, 0.1]) dash(GAL_Z0 + 6, GAL_Z1 - 6, x, 0.12);
    for (const x of [-4.5, 4.5]) for (let z = GAL_Z0 + 8; z < GAL_Z1 - 8; z += 9) dash(z, z + 4, x, 0.13);
    // sudaki ayaklar (orta kiriş altında)
    for (let z = 76; z <= 184; z += 12) { concG.push(box(5, 6, 3, xc, WATER_Y - 1.0, z)); oceanObstacle(xc, z, 2.6, 1.6); }
    // alt kat: kemerli lokanta galerisi (iki yan), yalnız tabliye yeterince yüksekken (z 96..164)
    const LZ0 = 96, LZ1 = 164, floorY = WATER_Y + 0.55, ceilY = GALATA_TOP - 1.0;
    const H = ceilY - floorY;
    const arch = new THREE.Shape();
    const L = LZ1 - LZ0;
    arch.moveTo(0, 0); arch.lineTo(L, 0); arch.lineTo(L, H); arch.lineTo(0, H); arch.lineTo(0, 0);
    const nA = 17, pitch = L / nA;
    for (let i = 0; i < nA; i++) {
      const a0 = i * pitch + 0.45, a1 = (i + 1) * pitch - 0.45, r = (a1 - a0) / 2, hS = Math.min(H - 0.5, 2.0);
      const hole = new THREE.Path();
      hole.moveTo(a0, 0.25); hole.lineTo(a1, 0.25); hole.lineTo(a1, hS); hole.absarc((a0 + a1) / 2, hS, r, 0, Math.PI, false); hole.lineTo(a0, 0.25);
      arch.holes.push(hole);
    }
    const facadeG = new THREE.ExtrudeGeometry(arch, { depth: 0.45, bevelEnabled: false, curveSegments: 6 });
    const facades = [], interiors = [], awnings = [];
    for (const s of [-1, 1]) {
      const fx = xc + s * (hw + 1.6);
      const f = facadeG.clone();
      f.rotateY(s > 0 ? -Math.PI / 2 : Math.PI / 2);
      f.translate(fx + (s > 0 ? 0 : 0), floorY, s > 0 ? LZ0 : LZ1);
      facades.push(f);
      // zemin platformu (dubası) ve dış yürüyüş yolu
      concG.push(box(hw - 3 + 2.2, 0.6, L, xc + s * (hw / 2 + 1.6), floorY - 0.3, (LZ0 + LZ1) / 2));
      // iç arka duvar (gece sıcak ışık) ve tavan
      interiors.push(box(0.1, H, L, xc + s * 3.2, floorY + H / 2, (LZ0 + LZ1) / 2));
      greenG.push(box(hw - 1.4, 0.25, L, xc + s * (hw / 2 + 2.1), ceilY + 0.05, (LZ0 + LZ1) / 2));
      // tente bandı
      awnings.push(box(0.9, 0.35, L, fx + s * 0.6, floorY + Math.min(H - 0.3, 2.4) + 0.75, (LZ0 + LZ1) / 2));
      cols.add(Math.min(fx, xc + s * 3.2) - 0.3, LZ0, Math.max(fx, xc + s * 3.2) + 0.3, LZ1, WATER_Y - 2, ceilY, 'galataLower');
      oceanObstacle(xc + s * (hw / 2 + 1.6), (LZ0 + LZ1) / 2, hw / 2 + 1.2, L / 2);
    }
    add(merge(facades), pbrMaterial(plasterPBR(quality), { color: 0xd8cfbd, scale: 0.5, wetK: 0 }));
    add(merge(interiors), nightGlowMaterial(0x4a3a2a, 0xffb060, 1.6), false);
    add(merge(awnings), new THREE.MeshStandardMaterial({ color: 0x8a2a20, roughness: 0.8 }), true);
    // açılır orta bölüm kuleleri (4 köşk) — gece fenerli
    for (const z of [121, 139]) for (const s of [-1, 1]) {
      const x = xc + s * (hw + 1.3), y = yf(z);
      greenG.push(box(2.6, 6.5, 2.6, x, y + 3.25 - 1.0, z));
      greenG.push(new THREE.ConeGeometry(2.0, 1.8, 4).rotateY(Math.PI / 4).translate(x, y + 6.65 - 1.0, z));
      ledG.push(box(2.7, 0.18, 2.7, x, y + 4.8, z));
      cols.add(x - 1.3, z - 1.3, x + 1.3, z + 1.3, WATER_Y - 2, y + 6, 'galataKiosk');
    }
    // balıkçılar: korkuluk boyunca olta sallayan figürler + ayak dibinde fener
    const figG = [], lineP = [], lampG = [];
    const rng = mulberry(77);
    for (const s of [-1, 1]) for (let z = 66; z < 194; z += 2.1 + rng() * 1.6) {
      if (z > 116 && z < 144) continue; // açılır bölüm
      if (rng() < 0.18) continue;
      const y = yf(z), x = xc + s * (hw - 0.6);
      const col = [0x2a2e34, 0x3a3226, 0x1e2a3a, 0x4a4038, 0x3a3a3a][Math.floor(rng() * 5)];
      const lean = 0.08;
      figG.push(colorize(new THREE.CylinderGeometry(0.2, 0.23, 0.85, 7).translate(x - s * lean, y + 0.95, z), col));
      figG.push(colorize(new THREE.CylinderGeometry(0.1, 0.12, 0.55, 5).translate(x - s * 0.02, y + 0.28, z - 0.1), 0x22252a));
      figG.push(colorize(new THREE.CylinderGeometry(0.1, 0.12, 0.55, 5).translate(x - s * 0.02, y + 0.28, z + 0.1), 0x22252a));
      figG.push(colorize(new THREE.SphereGeometry(0.12, 8, 6).translate(x - s * lean, y + 1.53, z), 0xc89a7a));
      figG.push(colorize(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 8).translate(x - s * lean, y + 1.64, z), rng() < 0.5 ? 0x1a1a1a : 0x6a5a40));
      // olta (korkuluğun üstünden suya doğru)
      const tipX = x + s * 4.2, tipY = y + 3.2 + rng() * 0.8, tz = z + (rng() - 0.5) * 1.2;
      figG.push(colorize(rod(x + s * 0.2, y + 1.15, z, tipX, tipY, tz, 0.025, 4), 0x2a2018));
      lineP.push(tipX, tipY, tz, tipX + s * 0.6, WATER_Y + 0.05, tz + 0.3);
      // kova / tabure
      if (rng() < 0.5) figG.push(colorize(new THREE.CylinderGeometry(0.16, 0.13, 0.32, 8).translate(x - s * 0.5, y + 0.16, z + 0.45), 0x2a6ab0));
      if (rng() < 0.55) lampG.push(new THREE.SphereGeometry(0.09, 6, 4).translate(x + s * 0.1, y + 1.02, z + 0.35));
      cols.add(x - 0.3, z - 0.3, x + 0.3, z + 0.3, y, y + 1.7, 'fisher');
    }
    const fm = add(mergeGeometries(figG.map((g) => { const n = nI(g); if (n.attributes.uv) n.deleteAttribute('uv'); return n; })), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), true);
    void fm;
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lineP, 3));
    const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xd8d8d0, transparent: true, opacity: 0.35 }));
    group.add(lines);
    if (lampG.length) add(merge(lampG), tickMat(ledMaterial('warm')), false, false);
  }

  // ================= Unkapanı Köprüsü (düz, sade) =================
  {
    const b = UK, w = b.x1 - b.x0, d = b.z1 - b.z0, xc = (b.x0 + b.x1) / 2;
    girderG.push(box(w, 1.2, d, xc, -0.6, (b.z0 + b.z1) / 2));
    for (const x of [b.x0 + 0.2, b.x1 - 0.2]) { railG.push(box(0.15, 1.0, d, x, 0.5, (b.z0 + b.z1) / 2)); cols.add(x - 0.1, b.z0 + 10, x + 0.1, b.z1 - 10, 0, 1.05, 'rail'); }
    for (let z = b.z0 + 20; z < b.z1 - 10; z += 25) { concG.push(box(w * 0.8, 5, 3, xc, -3.6, z)); oceanObstacle(xc, z, w * 0.4, 1.5); }
  }

  add(merge(roadG), roadMat, false, true);
  add(merge(girderG), girderGrey, true);
  add(merge(steelG), steelGrey, true);
  add(merge(concG), concrete, true);
  add(merge(cableG), cableMat, true, false);
  add(merge(railG), railMat, false);
  add(merge(greenG), galGreen, true);
  const mk = new THREE.Mesh(merge(markG), markingMaterial()); mk.renderOrder = 1; mk.receiveShadow = true; group.add(mk);
  add(merge(ledG), tickMat(ledMaterial('cycle')), false, false);
  if (out.redLights) add(merge(out.redLights.map(([x, y, z]) => new THREE.SphereGeometry(0.45, 8, 6).translate(x, y, z))), tickMat(ledMaterial('red')), false, false);

  if (city) liftStreetPropsOntoBridges(city, cols);
  return out;
}
function tickMat(m) { return m; }
// tick'i sahneye eklenen mesh'in onBeforeRender'ına bağla
const _origAdd = null; void _origAdd;

function colorize(g, hex) {
  const n = nI(g); if (n.attributes.uv) n.deleteAttribute('uv');
  const c = new THREE.Color(hex), arr = new Float32Array(n.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
  n.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return n;
}
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// streetprops.js lambaları/ışık halkaları/çizgileri y=0'a koyar; yükseltilmiş tabliyedekileri yukarı taşı.
function liftStreetPropsOntoBridges(city, cols) {
  for (const k of ['lampModern', 'lampClassic']) {
    const inst = city.props && city.props[k];
    if (!inst) continue;
    for (const it of inst.items) { const h = bridgeHeightAt(it.x, it.z); if (h) it.e[13] += h; }
  }
  // ışık havuzları / haleler (streetprops oluşturmuş durumda)
  city.group.traverse((o) => {
    if (o.isPoints && o.material === city.haloMat) {
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { const h = bridgeHeightAt(p.getX(i), p.getZ(i)); if (h) p.setY(i, p.getY(i) + h); }
      p.needsUpdate = true; o.geometry.computeBoundingSphere();
    } else if (o.isInstancedMesh && o.material === city.poolMat) {
      const m = new THREE.Matrix4();
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); const h = bridgeHeightAt(m.elements[12], m.elements[14]); if (h) { m.elements[13] += h; o.setMatrixAt(i, m); } }
      o.instanceMatrix.needsUpdate = true; o.computeBoundingSphere();
    }
  });
  for (const b of cols.boxes) if (b.tag === 'lamp') { const h = bridgeHeightAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2); if (h) { b.y0 += h; b.y1 += h; } }
  // düz yol çizgileri yükseltilmiş tabliyede gömülür: kaldır (köprüler kendi eğimli çizgilerini çizer)
  if (city.markList) city.markList = city.markList.filter(([x, , z]) => !bridgeHeightAt(x, z) && !(bridgeHeightAt(x, z) === 0 && false));
}

// ================= Kız Kulesi =================
export function buildMaidensTower(group, cols, quality = 'medium') {
  const X = ISLAND.x, Z = ISLAND.z, R = ISLAND.r;
  const stone = floodMaterial(ashlarPBR(quality), { color: 0xb8ad98, scale: 0.6, flood: 0.25, floodTop: 25 });
  const white = floodMaterial(plasterPBR(quality), { color: 0xf2eee6, scale: 0.4, rough: 0.75, flood: 0.35, floodTop: 30 });
  const lead = pbrMaterial(leadPBR(quality), { color: 0x9aa4ac, scale: 0.6, rough: 0.5, metal: 0.4 });
  const win = nightGlowMaterial(0x1a2026, 0xffc070, 1.4);
  const sG = [], wG = [], lG = [], winG = [], goldG = [];
  // kayalık ada + rıhtım taşları
  sG.push(new THREE.CylinderGeometry(R, R + 2.5, 3.2, 28).translate(X, WATER_Y + 0.6 - 1.2, Z));
  sG.push(new THREE.CylinderGeometry(R - 0.5, R, 0.8, 28).translate(X, 0.4 - 0.4, Z));
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + 0.2; sG.push(new THREE.DodecahedronGeometry(1.6 + (i % 3) * 0.5, 0).translate(X + Math.cos(a) * (R + 1.5), WATER_Y + 0.3, Z + Math.sin(a) * (R + 1.5))); }
  // ana yapı (L planlı beyaz bina, kurşun damlı) ve kule
  wG.push(box(14, 6, 10, X - 1, 3, Z));
  wG.push(box(14.6, 0.4, 10.6, X - 1, 6.2, Z));
  lG.push(new THREE.CylinderGeometry(0.1, 7.8, 2.6, 4, 1).rotateY(Math.PI / 4).scale(1.32, 1, 1).translate(X - 1, 7.7, Z));
  // kemerli pencereler (iki kat)
  for (let i = 0; i < 5; i++) for (const zz of [-1, 1]) for (const yy of [1.6, 4.2]) winG.push(box(1.0, 1.5, 0.12, X - 6.4 + i * 2.6, yy, Z + zz * 5.02));
  // kule gövdesi (sekizgen kaide + silindir), seyir balkonu, fener, kurşun külah, alem
  const tx = X + 4, tz = Z;
  wG.push(new THREE.CylinderGeometry(3.3, 3.5, 8, 8).translate(tx, 4, tz));
  wG.push(new THREE.CylinderGeometry(2.7, 2.9, 9, 16).translate(tx, 12.5, tz));
  wG.push(new THREE.CylinderGeometry(3.4, 2.8, 0.6, 16).translate(tx, 17.3, tz)); // balkon tablası
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; wG.push(box(0.12, 0.9, 0.12, tx + Math.cos(a) * 3.25, 18.05, tz + Math.sin(a) * 3.25)); }
  wG.push(new THREE.TorusGeometry(3.25, 0.06, 4, 24).rotateX(Math.PI / 2).translate(tx, 18.5, tz));
  wG.push(new THREE.CylinderGeometry(2.1, 2.1, 3.0, 12).translate(tx, 19.1, tz)); // fener odası
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; winG.push(box(0.12, 1.8, 1.0, tx + Math.cos(a) * 2.12, 19.2, tz + Math.sin(a) * 2.12).rotateY(0)); }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; const g = box(0.12, 1.6, 0.9, 0, 0, 0); g.rotateY(-a); g.translate(tx + Math.cos(a) * 2.92, 12.8, tz + Math.sin(a) * 2.92); winG.push(g); }
  lG.push(new THREE.ConeGeometry(2.6, 4.4, 16).translate(tx, 22.8, tz));
  goldG.push(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5).translate(tx, 26.2, tz), new THREE.SphereGeometry(0.22, 8, 6).translate(tx, 25.6, tz));
  const m = (geo, mat, sh = true) => { const mm = new THREE.Mesh(geo, mat); mm.castShadow = sh; mm.receiveShadow = true; group.add(mm); return mm; };
  m(merge(sG), stone); m(merge(wG), white); m(merge(lG), lead); m(merge(winG), win, false);
  m(merge(goldG), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.3 }), false);
  // deniz feneri ışığı (gece)
  const beacon = tickMesh(new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8).translate(tx, 19.4, tz), ledMaterial('warm')));
  group.add(beacon);
  cols.add(X - 8, Z - 5, X + 6, Z + 5, 0, 6.5, 'kizkulesi');
  cols.add(tx - 3.3, tz - 3.3, tx + 3.3, tz + 3.3, 0, 24, 'kizkulesi');
}

// onBeforeRender bağlama: ledMaterial kullanan tüm mesh'ler
export function hookLedMeshes(group) {
  group.traverse((o) => { if (o.isMesh && o.material && o.material.userData && o.material.userData.tick && !o.userData.ledHooked) { o.userData.ledHooked = true; tickMesh(o); } });
}
void DECK_TOP; void GAL_Z0;

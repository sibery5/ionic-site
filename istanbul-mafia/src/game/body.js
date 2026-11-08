// [savaş] Beden hasar modülü (A2): bölgeye göre hasar, kask / çelik yelek, delip geçme, görünür teçhizat.
// Kurallar (oyuncu ve NPC için aynı):
//  - Baş: kask yoksa tek mermide ölüm (görev patronları hariç: ağır hasar). Kask baş hasarını büyük ölçüde keser,
//    her isabette yıpranır; tükenince başından fırlar (sonraki baş isabeti öldürür).
//  - Gövde: çelik/kevlar yelek gövde hasarını büyük ölçüde keser (plaka bütünlüğü = actor.armor, 0..100);
//    plaka tükense de yumuşak kevlar az da olsa korur. Kol/bacak yelekten etkilenmez.
//  - Delip geçme: tabanca/hafif makineli yeleğe takılır; tüfek ve keskin nişancı bedeni delip arkadakine
//    düşük hasar verir. Saçma delmez.
//  - Oyuncu (NPC'den gelen mermi): zorluk çarpanı, kısa süreli hasar tavanı (ani ölüm yok), Zor dışında baş
//    isabeti tek mermide öldürmez (bkz. playerIncoming).
// Teçhizat görünürdür: polis yeleği, özel harekât kask + yelek, asker/jandarma kask + yelek; çeteler çoğunlukla yok.
// Oyuncu Çelik Yelek alınca (armor > 0) yelek üstünde görünür.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// birim türüne göre teçhizat: vest = yelek olasılığı, helmet = kask olasılığı, armor = plaka bütünlüğü, hp = can
export const KITS = {
  police: { vest: 0.8, helmet: 0, armor: 60, hp: 100, style: 'police' },
  swat: { vest: 1, helmet: 1, armor: 100, hp: 120, style: 'swat' },
  soldier: { vest: 1, helmet: 1, armor: 85, hp: 115, style: 'army' },
  gang: { vest: 0.1, helmet: 0, armor: 40, hp: 100, style: 'gang' },
  boss: { vest: 1, helmet: 0, armor: 100, style: 'boss' },
};
// bölge çarpanları (kol/bacak daha az; yelek etkilemez)
export const ZONE_MUL = { head: 1, torso: 1, arm: 0.55, leg: 0.65 };
const HELMET_HP = 100;

// silahın delme gücü (WEAPONS.pen yoksa türünden tahmin)
export function penOf(def) {
  if (!def || def.pellets || def.type !== 'gun') return 0;
  if (def.pen !== undefined) return def.pen;
  return def.dmg >= 100 ? 0.8 : def.range >= 140 ? 0.55 : 0.3;
}

// Mermi isabeti çözümü: base = bölge öncesi hasar (zorluk çarpanı uygulanmış). Sonuç nesnesi yeniden kullanılır.
const RES = { dmg: 0, lethal: false, blocked: null, pen: 0, helmetOff: false, plate: false };
export function resolveBullet(target, base, zone, def, attacker) {
  const r = RES;
  r.lethal = false; r.blocked = null; r.helmetOff = false; r.plate = false;
  let pen = penOf(def);
  const heavy = def && (def.dmg >= 100 || def.sound === 'sniper');
  let dmg = base * (ZONE_MUL[zone] || 1);
  if (zone === 'head') {
    if (target.helmet > 0) {
      // kask: mermiyi saptırır / ezilir. Tüfek daha çok geçirir; keskin nişancı çoğunlukla deler.
      const breach = heavy ? 0.6 : 0;
      if (Math.random() < breach) { r.lethal = true; target.helmet = 0; r.helmetOff = true; }
      else {
        const red = heavy ? 0.6 : pen >= 0.45 ? 0.72 : 0.86;
        dmg = base * 1.6 * (1 - red);
        target.helmet -= heavy ? 60 : pen >= 0.45 ? 40 : 26;
        r.blocked = 'helmet';
        if (target.helmet <= 0) { target.helmet = 0; r.helmetOff = true; }
        pen = 0;
      }
    } else r.lethal = true;
    if (r.lethal) {
      // görev patronu: ağır ama tek mermi değil (sahne / dövüş kurgusu korunur)
      if (target.kind === 'boss' && target.mission) { r.lethal = false; dmg = base * 4; }
      else dmg = Math.max(dmg, target.hp + (target.maxHp || 100));
    }
  } else if (zone === 'torso' && target.vest) {
    const plate = target.armor > 0;
    const red = plate ? (heavy ? 0.4 : pen >= 0.45 ? 0.6 : 0.8) : (pen >= 0.45 ? 0.1 : 0.3);
    dmg *= 1 - red;
    if (plate) {
      target.armor = Math.max(0, target.armor - base * (heavy ? 0.9 : 0.55));
      r.plate = true;
    }
    r.blocked = 'vest';
    pen = plate ? (pen >= 0.45 ? pen * 0.45 : 0) : pen * 0.8;
  } else if (zone === 'arm' || zone === 'leg') pen = Math.min(0.9, pen * 1.25); // ince doku: daha kolay çıkar
  r.dmg = dmg; r.pen = pen;
  return r;
}

// ---------------- oyuncuya gelen hasar (denge) ----------------
// zorluk: mermi çarpanı, patlama çarpanı, ani hasar tavanı (1 sn'de maxHp oranı), kendiliğinden iyileşme üst sınırı,
// baş isabeti öldürür mü, helikopter nişancısının "ıskalatma" olasılığı
export const PLAYER_BAL = {
  easy: { bullet: 0.3, blast: 0.5, burst: 0.26, regenCap: 0.75, regenRate: 5, regenDelay: 4, headKill: false, headMul: 1.5, heliMiss: 0.6, lastStand: true },
  normal: { bullet: 0.4, blast: 0.65, burst: 0.34, regenCap: 0.6, regenRate: 4, regenDelay: 5, headKill: false, headMul: 2, heliMiss: 0.45, lastStand: true },
  hard: { bullet: 0.56, blast: 0.85, burst: 0.5, regenCap: 0.4, regenRate: 3, regenDelay: 7, headKill: true, headMul: 3, heliMiss: 0.22, lastStand: false },
};
export function playerBal(game) { return PLAYER_BAL[(game.settings && game.settings.difficulty) || 'normal'] || PLAYER_BAL.normal; }

// Oyuncuya NPC mermisi: bölge + yelek kuralı aynı; baş isabeti zorluğa göre. Ani hasar tavanı ve "son nefes".
export function playerIncoming(game, p, raw, zone, def, attacker) {
  const B = playerBal(game);
  let base = raw * B.bullet;
  let r;
  if (zone === 'head' && !(p.helmet > 0) && !B.headKill) {
    // Kolay/Normal: kasksız baş isabeti ağır ama tek mermide öldürmez (yelek başı korumaz)
    r = RES; r.dmg = base * B.headMul; r.blocked = null; r.lethal = false; r.pen = 0; r.helmetOff = false; r.plate = false;
  } else r = resolveBullet(p, base, zone, def, attacker);
  r.dmg = capBurst(p, r.dmg, B, r.lethal);
  return r;
}
// son 1 saniyede alınan hasar tavanı aşılırsa fazlası %35'e iner; Kolay/Normal'de yüksek candan tek hamlede ölüm yok
export function capBurst(p, dmg, B, lethal) {
  const now = p.game && p.game.combat ? p.game.combat.clock || 0 : performance.now() / 1000; // oyun saati (sim ile tutarlı)
  const W = p._burst || (p._burst = { t: 0, sum: 0 });
  const age = now - W.t;
  if (age > 1 || age < 0) { W.t = now; W.sum = 0; }
  const cap = (p.maxHp || 100) * B.burst;
  if (!lethal && W.sum + dmg > cap) {
    const over = W.sum + dmg - cap;
    dmg = Math.max(0, dmg - over * 0.65);
  }
  W.sum += dmg;
  if (B.lastStand && !lethal && p.hp > p.maxHp * 0.3 && dmg >= p.hp) dmg = p.hp - 1;
  return dmg;
}

// ---------------- görünür teçhizat ----------------
const PAL = {
  police: { vest: 0x1b2436, strap: 0x141a26, pouch: 0x151b29, trim: 0xd8dde6, patch: ['POLİS', '#1b2436', '#f2f2f2'] },
  swat: { vest: 0x17191b, strap: 0x101113, pouch: 0x1c1e21, trim: 0x2a2d30, helmet: 0x141618, patch: ['ÖZEL HAREKAT', '#121314', '#e8e8e8'] },
  army: { vest: 0x4d5734, strap: 0x3f482a, pouch: 0x56603b, trim: 0x353c24, helmet: 0x48532f, patch: ['ASKER', '#3a4426', '#e0d8b0'] },
  jandarma: { vest: 0x46502f, strap: 0x384126, pouch: 0x4e5836, trim: 0x30361f, helmet: 0x3c4729, patch: ['JANDARMA', '#2e3a22', '#f0e8c0'] },
  gang: { vest: 0x2a2a2c, strap: 0x1d1d1f, pouch: 0x303033, trim: 0x232325 },
  boss: { vest: 0x202024, strap: 0x18181b, pouch: 0x222226, trim: 0x2a2a2e },
  player: { vest: 0x303438, strap: 0x22262a, pouch: 0x383c40, trim: 0x55595e },
};
const GC = {};
const _c = new THREE.Color();
function tint(g, hex, k = 1) {
  _c.setHex(hex).multiplyScalar(k);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function rb(w, h, d, x, y, z, r = 0.012, col = 0xffffff, k = 1) {
  const s = new THREE.Shape(), hw = w / 2 - r, hh = h / 2 - r;
  s.moveTo(-hw, -hh); s.lineTo(hw, -hh); s.lineTo(hw, hh); s.lineTo(-hw, hh); s.closePath();
  const dep = Math.max(0.001, d - r * 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: dep, bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.9, bevelSegments: 2, curveSegments: 2 });
  g.translate(x, y, z - dep / 2);
  return tint(norm(g), col, k);
}
function bx(w, h, d, x, y, z, col, k = 1) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return tint(norm(g), col, k); }
function norm(g) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const key of Object.keys(n.attributes)) if (key !== 'position' && key !== 'normal') n.deleteAttribute(key);
  if (!n.attributes.normal) n.computeVertexNormals();
  return n;
}
// plaka taşıyıcı yelek (göğüs kemiği uzayı: +Z ön, y yukarı)
function vestGeo(style) {
  if (GC['v' + style]) return GC['v' + style];
  const P = PAL[style] || PAL.player;
  const L = [];
  // ön / arka plaka cepleri (hafif kavisli: iki katman)
  L.push(rb(0.31, 0.31, 0.05, 0, 0.0, 0.118, 0.018, P.vest));
  L.push(rb(0.27, 0.27, 0.02, 0, 0.005, 0.146, 0.008, P.vest, 0.92));
  L.push(rb(0.32, 0.33, 0.05, 0, 0.01, -0.118, 0.018, P.vest));
  // yan bel bandı (kuşak)
  for (const s of [-1, 1]) {
    L.push(rb(0.05, 0.17, 0.2, s * 0.158, -0.06, 0, 0.012, P.strap));
    // omuz askıları
    L.push(rb(0.075, 0.03, 0.27, s * 0.095, 0.172, 0, 0.01, P.strap));
    L.push(bx(0.06, 0.012, 0.012, s * 0.095, 0.175, 0.138, P.trim, 0.8));
  }
  // MOLLE şeritleri (ön)
  for (let i = 0; i < 3; i++) L.push(bx(0.28, 0.008, 0.006, 0, -0.08 + i * 0.035, 0.158, P.strap, 0.9));
  if (style === 'swat' || style === 'army' || style === 'jandarma') {
    // üç şarjör cebi + telsiz
    for (let i = -1; i <= 1; i++) { L.push(rb(0.068, 0.095, 0.042, i * 0.08, -0.075, 0.175, 0.008, P.pouch)); L.push(bx(0.06, 0.02, 0.046, i * 0.08, -0.03, 0.176, P.strap)); }
    L.push(rb(0.05, 0.11, 0.04, 0.12, 0.07, 0.17, 0.008, P.pouch, 0.85));
    L.push(bx(0.006, 0.08, 0.006, 0.13, 0.15, 0.172, 0x111111));
    // boyun koruması / yaka
    L.push(rb(0.2, 0.04, 0.05, 0, 0.16, 0.11, 0.015, P.vest, 0.9));
    // arka hidrasyon / tutma kolu
    L.push(rb(0.08, 0.025, 0.03, 0, 0.15, -0.15, 0.008, P.strap));
  } else if (style === 'police') {
    // telsiz cebi + yansıtıcı şerit
    L.push(rb(0.055, 0.1, 0.04, -0.1, 0.06, 0.168, 0.008, P.pouch));
    L.push(bx(0.006, 0.07, 0.006, -0.112, 0.14, 0.17, 0x111111));
    L.push(bx(0.3, 0.014, 0.004, 0, -0.125, 0.146, P.trim));
    L.push(bx(0.31, 0.014, 0.004, 0, -0.125, -0.146, P.trim));
  } else {
    // sade gizli/yarı gizli yelek: iki küçük cep
    L.push(rb(0.06, 0.07, 0.03, -0.085, -0.07, 0.16, 0.006, P.pouch));
    L.push(rb(0.06, 0.07, 0.03, 0.085, -0.07, 0.16, 0.006, P.pouch));
  }
  const g = mergeGeometries(L, false);
  g.computeBoundingSphere();
  GC['v' + style] = g;
  return g;
}
function helmetGeo(style) {
  if (GC['h' + style]) return GC['h' + style];
  const P = PAL[style] || PAL.army;
  const L = [];
  const shell = new THREE.SphereGeometry(0.138, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.56);
  shell.scale(1, 0.88, 1.12);
  L.push(tint(norm(shell), P.helmet));
  // kenar (alt dudak)
  const rim = new THREE.TorusGeometry(0.128, 0.008, 5, 22); rim.rotateX(Math.PI / 2); rim.scale(1.02, 1, 1.14); rim.translate(0, 0.022, 0);
  L.push(tint(norm(rim), P.helmet, 0.8));
  // kılıf bandı
  const band = new THREE.TorusGeometry(0.133, 0.007, 4, 22); band.rotateX(Math.PI / 2); band.scale(1.0, 1, 1.12); band.translate(0, 0.06, 0);
  L.push(tint(norm(band), P.trim || 0x222222));
  if (style === 'swat') {
    // gece görüş yuvası, yan raylar, kulaklık kupaları
    L.push(rb(0.05, 0.035, 0.02, 0, 0.075, 0.148, 0.006, 0x0c0c0d));
    for (const s of [-1, 1]) {
      L.push(rb(0.012, 0.03, 0.1, s * 0.138, 0.045, 0.0, 0.004, 0x0d0d0e));
      const cup = new THREE.CylinderGeometry(0.038, 0.04, 0.035, 12); cup.rotateZ(Math.PI / 2); cup.translate(s * 0.118, -0.03, 0.0);
      L.push(tint(norm(cup), 0x101112));
    }
  } else {
    // çene kayışı tokaları
    for (const s of [-1, 1]) L.push(bx(0.012, 0.05, 0.016, s * 0.128, -0.005, 0.02, P.trim || 0x222222));
  }
  const g = mergeGeometries(L, false);
  g.computeBoundingSphere();
  GC['h' + style] = g;
  return g;
}
let MAT = null;
function gearMat() {
  if (MAT) return MAT;
  MAT = {
    cloth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02 }),
    shell: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.12 }),
    visor: new THREE.MeshStandardMaterial({ color: 0x0a0d12, roughness: 0.06, metalness: 0.7, transparent: true, opacity: 0.85 }),
    patch: {},
  };
  return MAT;
}
function patchMat(style) {
  const M = gearMat();
  if (M.patch[style] !== undefined) return M.patch[style];
  const p = PAL[style] && PAL[style].patch;
  if (!p) return (M.patch[style] = null);
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d'); x.fillStyle = p[1]; x.fillRect(0, 0, 256, 64);
  x.fillStyle = p[2]; x.font = `bold ${p[0].length > 8 ? 30 : 42}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(p[0], 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (M.patch[style] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }));
}
const PATCH_G = new THREE.PlaneGeometry(0.19, 0.048);
const VISOR_G = new THREE.SphereGeometry(0.142, 16, 6, -Math.PI * 0.32, Math.PI * 0.64, Math.PI * 0.42, Math.PI * 0.2);

// Yelek / kask ağlarını modele tak (kemiklere bağlı; geometri ve malzeme paylaşılır)
export function wearVest(a, style) {
  const M = a.model;
  if (!M || !M.chest) return;
  if (M._vest) { if (M._vest.userData.style === style) { M._vest.visible = true; return; } M._vest.parent && M._vest.parent.remove(M._vest); }
  const G = gearMat();
  const grp = new THREE.Group(); grp.userData.style = style;
  const L = a.model.look || {};
  const w = (L.build || 1) * (1 + 0.22 * (L.fat || 0)), dz = 1 + 0.35 * (L.fat || 0);
  const v = new THREE.Mesh(vestGeo(style), G.cloth); v.castShadow = true; v.scale.set(w, 1, dz);
  grp.add(v);
  const pm = patchMat(style);
  if (pm) {
    const f = new THREE.Mesh(PATCH_G, pm); f.position.set(0, 0.085, 0.146 * dz + 0.026); grp.add(f);
    const b = new THREE.Mesh(PATCH_G, pm); b.position.set(0, 0.06, -0.146 * dz - 0.003); b.rotation.y = Math.PI; b.scale.setScalar(1.25); grp.add(b);
  }
  grp.position.set(0, 0.02, 0);
  M.chest.add(grp);
  M._vest = grp;
}
export function removeVest(a) { const M = a.model; if (M && M._vest) M._vest.visible = false; }
export function wearHelmet(a, style) {
  const M = a.model;
  if (!M || !M.head || M._helmet) return;
  const G = gearMat();
  const grp = new THREE.Group();
  const h = new THREE.Mesh(helmetGeo(style), G.shell); h.castShadow = true;
  grp.add(h);
  if (style === 'swat') { const vz = new THREE.Mesh(VISOR_G, G.visor); vz.scale.set(1, 0.95, 1.12); vz.position.set(0, -0.005, 0.004); grp.add(vz); }
  grp.position.set(0, 0.1, 0.006);
  M.head.add(grp);
  M._helmet = grp;
}

// NPC teçhizatı (npc.js kurucusu çağırır). opts.armor / opts.helmet / opts.hp ile geçersiz kılınabilir.
export function outfit(n, kind, opts = {}) {
  const K = KITS[kind];
  const style = kind === 'soldier' && opts.jandarma ? 'jandarma' : K ? K.style : 'gang';
  if (K) {
    if (K.hp && !opts.hp) n.maxHp = n.hp = K.hp;
    const vest = opts.vest !== undefined ? !!opts.vest : Math.random() < K.vest;
    n.vest = vest;
    n.armor = vest ? (opts.armor !== undefined ? opts.armor : K.armor) : 0;
    n.helmet = (opts.helmet !== undefined ? opts.helmet : Math.random() < K.helmet) ? HELMET_HP : 0;
  } else {
    n.vest = !!(opts.armor > 0); n.armor = opts.armor || 0; n.helmet = opts.helmet ? HELMET_HP : 0;
  }
  // zırhı olan herkes görünür bir yelek giyer (görünmeyen zırh yok)
  if (n.armor > 0) n.vest = true;
  if (n.vest) wearVest(n, style);
  if (n.helmet > 0) wearHelmet(n, style === 'gang' || style === 'boss' || style === 'police' ? 'army' : style);
  n.gearStyle = style;
}
// eski API (npc.js equipGear): kask + yelek
export function equipKit(n, style) {
  n.vest = true; if (!(n.armor > 0)) n.armor = 80; n.helmet = HELMET_HP;
  wearVest(n, style); wearHelmet(n, style);
}

// Oyuncu: armor > 0 iken yelek görünür (Çelik Yelek satın alınınca / zırh toplanınca)
export function syncPlayerGear(p) {
  const want = p.armor > 0.5;
  if (want) p.vest = true;
  else if (!p.vestKeep) p.vest = false;
  if (p._vestVis === want) return;
  p._vestVis = want;
  if (want) wearVest(p, 'player'); else removeVest(p);
}

// Kask başından fırlar: kemikten ayrılır, dünyada uçar ve yere düşer (combat.loose listesinde güncellenir)
const _wp = new THREE.Vector3(), _wq = new THREE.Quaternion();
export function knockHelmetOff(a, dir, scene, list) {
  const M = a.model, h = M && M._helmet;
  if (!h || !scene) return;
  h.getWorldPosition(_wp); h.getWorldQuaternion(_wq);
  h.parent.remove(h);
  M._helmet = null;
  h.position.copy(_wp); h.quaternion.copy(_wq);
  h.scale.setScalar(M.body ? M.body.scale.x : 1);
  scene.add(h);
  list.push({ o: h, vx: dir.x * 3 + (Math.random() - 0.5), vy: 2.2 + Math.random(), vz: dir.z * 3 + (Math.random() - 0.5), wx: (Math.random() - 0.5) * 14, wz: (Math.random() - 0.5) * 14, floor: (a.pos.y || 0) + 0.1, life: 25, rest: false });
}

// İSTANBUL MAFYA — hikâye: 4 perde, 25 görev. Her görev adımlardan (steps) oluşur; "cp" taşıyan adımlar kontrol noktasıdır.
// Adım: { cp?, place?(M), time?, start?(M), update?(M,dt) -> 'next'|'done'|'fail:..'|null, populate?(M,ctx,I), end?(M), cleanup?(M) }
// Seçim bayrakları (g.state.storyFlags): sinan ('spare'|'kill'), ally ('kartallar'|'bogaz'), ledger, nevzat ('teslim'|'olum'), kenan ('affet'|'oldur')
import * as THREE from 'three';
import { randomLook } from '../entities/character.js';
import { rng } from '../core/util.js';
import { GANGS, CARS } from './economy.js';

export const ACTS = ['Birinci Perde · Dönüş', 'İkinci Perde · Kan Davası', 'Üçüncü Perde · İhanet', 'Dördüncü Perde · Boğaz Savaşı'];

export const LEYLA_LOOK = () => ({ ...randomLook(rng, 'civilian'), gender: 'f', hair: 'uzun', hairColor: '#1a1410', top: 'coat', topColor: '#5a1a1a', pants: 'slacks', pantsColor: '#111111', glasses: false, hat: 'none', beard: 'none' });
export const ALI_LOOK = () => ({ ...randomLook(rng, 'civilian'), gender: 'm', hair: 'kivircik', hairColor: '#3b2a1e', top: 'leather', topColor: '#4a2c1a', beard: 'stubble', hat: 'kasket', hatColor: '#2a2a2a', glasses: false });
export const KENAN_LOOK = () => ({ ...randomLook(rng, 'boss'), hat: 'none', hairColor: '#1a1410', beard: 'stubble', topColor: '#1d2440', glasses: true, build: 1.02 });
const NEVZAT_LOOK = () => ({ ...randomLook(rng, 'civilian'), gender: 'm', top: 'coat', topColor: '#3a3a3a', pants: 'slacks', pantsColor: '#222222', hair: 'kel', beard: 'mustache', glasses: true, hat: 'fedora', hatColor: '#222222', build: 1.08 });
const BOSS_LOOK = (gang, extra = {}) => ({ ...randomLook(rng, 'boss'), topColor: GANGS[gang] ? GANGS[gang].color : '#111', ...extra });

// ---------------- adım fabrikaları ----------------
// bir mekâna gir
const enter = (type, text, o = {}) => ({
  cp: o.cp, place: o.place, populate: o.populate, time: o.time,
  start(M) {
    if (o.need0 && M.g.wanted.level > 0) M.g.ui.notify('Aranırken içeri girme! Önce polisi atlat.', 'warn');
    const b = o.pick ? o.pick(M) : M.special(type, ...(o.near || []));
    M.s.b = b; M.goto(b, text, o.r || 3);
    if (o.onStart) o.onStart(M);
  },
  update(M, dt) {
    if (o.tick) { const r = o.tick(M, dt); if (r) return r; }
    return M.inside(type, o.anyB ? null : M.s.b) ? 'next' : null;
  },
});
// bir noktaya git (opsiyonel: araçla / yaya / koşul)
const goTo = (fn, text, o = {}) => ({
  cp: o.cp, place: o.place, time: o.time, timeFail: o.timeFail,
  start(M) { const p = fn(M); M.s.p = p; M.gotoXZ(p.x, p.z, text, o.r || 5); if (o.onStart) o.onStart(M); },
  update(M, dt) {
    if (o.tick) { const r = o.tick(M, dt); if (r) return r; }
    const p = M.s.p;
    if (!M.reached(p.x, p.z, (o.r || 5) + (M.g.player.vehicle ? 3 : 0))) return null;
    if (o.cond && !o.cond(M)) return null;
    return 'next';
  },
});
// konuşma
const talk = (lines, o = {}) => ({
  cp: o.cp, place: o.place, populate: o.populate,
  start(M) { if (o.before) o.before(M); M.objective(''); M.talk(lines(M), o.after ? (r) => o.after(M, r) : null); },
  update(M) { return M.s.talked ? (o.done ? o.done(M) : 'next') : null; },
});
// betik adımı
const step = (o) => o;

// ortak yardımcılar
const P = (M) => M.g.player;
const inCar = (M) => !!M.g.player.vehicle;
function spawnAt(M, b, k = 3) { const nz = b.door.nz || 1; return { x: b.door.x, z: b.door.z + nz * k }; }
function konakDoor(M) { return M.g.map.nearestOfType('konak', 0, 0); }
function enemyGang(M) { return M.flag('ally') === 'bogaz' ? 'kartallar' : 'bogaz'; }
function allyGang(M) { return M.flag('ally') || 'kartallar'; }
function killAll(listKey, text, o = {}) {
  return step({
    cp: o.cp, place: o.place, populate: o.populate,
    start(M) { if (o.spawn) M.data[listKey] = o.spawn(M); if (M.data[listKey]) M.setMarkers(M.data[listKey].map((n) => ({ actor: n, color: 0xff3030 }))); M.objective(text); },
    update(M, dt) { if (o.tick) { const r = o.tick(M, dt); if (r) return r; } return M.data[listKey] && M.allDead(M.data[listKey]) ? 'next' : null; },
  });
}
// kaçan hedef (araçla kaçar, araç hasar görünce yaya kaçar), yaklaşınca teslim olur
function chaseTarget(M, t, car, dt, o = {}) {
  const g = M.g, p = P(M);
  if (t.dead) return 'dead';
  if (car && t.vehicle === car) {
    if (car.destroyed || car.hp < car.def.hp * (o.carHp || 0.35) || car.sinking > 0 || (car.speed < 0.5 && (M.s.stopT = (M.s.stopT || 0) + dt) > 6)) {
      t.vehicle = null; t.model.root.visible = true; car.ai = { empty: true };
      t.pos.set(car.pos.x + car.fwd.z * 2.2, 0, car.pos.z - car.fwd.x * 2.2);
      if (car.destroyed) t.takeDamage(o.burn || 60, null, 'explosion');
      t.state = 'flee'; t.fleeFrom = p.pos.clone(); t.fleeT = 60;
      M.setMarkers([{ actor: t, color: 0xff3030 }]);
      M.objective(o.footText || 'Arabadan indi! Yakala onu!');
    } else { t.pos.copy(car.pos); if (car.ai && car.ai.panic !== undefined) car.ai.panic = 999; }
    const fd = Math.hypot(p.pos.x - car.pos.x, p.pos.z - car.pos.z);
    if (fd > (o.lose || 260)) return 'lost';
    return null;
  }
  if (t.state !== 'surrender') {
    t.fleeT = 60; if (t.state !== 'flee' && t.state !== 'attack') { t.state = 'flee'; t.fleeFrom = p.pos.clone(); }
    if (t.state === 'flee') t.fleeFrom = p.pos.clone();
    const d = M.distTo(t);
    if ((d < 2.4 && !p.vehicle) || t.hp < t.maxHp * 0.5) { t.state = 'surrender'; t.god = true; return 'caught'; }
    if (d > (o.loseFoot || 120)) return 'lost';
    return null;
  }
  return 'caught';
}
function fleeCar(M, car) {
  const g = M.g;
  const n0 = g.map.nearestNode(car.pos.x, car.pos.z);
  car.ai = { mode: 'traffic', from: n0, to: g.map.other(n0.edges[0], n0), next: null, cruise: 24, panic: 999 };
  car.ai.next = g.vehicles.chooseNext(car.ai.to, n0);
  car.parked = false;
}
function board(M, t, car) { t.vehicle = car; t.model.root.visible = false; car.driver = null; }

// Haraç dükkânları (konağa göre sabit)
function haracShops(M) {
  const k = konakDoor(M);
  const shops = M.g.map.specials.filter((b) => b.type === 'food' || b.type === 'clothes' || b.type === 'cafe');
  shops.sort((a, b) => Math.hypot(a.door.x - k.door.x, a.door.z - k.door.z) - Math.hypot(b.door.x - k.door.x, b.door.z - k.door.z));
  return shops.slice(0, 3);
}

// Çatı rotası (Beyoğlu): bitişik binalar arasında iskele, merdiven ve kalaslar kurar
function buildRoofRoute(M) {
  const g = M.g;
  const B = g.map.buildings;
  let seq = null;
  const tryFind = (flatOnly) => {
    let best = null, bd = 1e9;
    for (let i = 0; i < B.length - 4; i++) {
      const s = B.slice(i, i + 4);
      if (!s.every((b) => b.block === s[0].block && b.door.nz === s[0].door.nz && b.type === 'apartment' && !b.tower && (!flatOnly || b.roof === 'flat') && b.x1 - b.x0 > 9 && b.floors <= 7)) continue;
      let ok = true;
      for (let k = 0; k < 3; k++) { if (s[k + 1].x0 - s[k].x1 > 3.5 || Math.abs(s[k + 1].h - s[k].h) > 6.6) ok = false; }
      if (!ok || s[0].district.id !== 'beyoglu') continue;
      const d = Math.hypot(s[0].door.x + 250, s[0].door.z + 150);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  };
  seq = tryFind(true) || tryFind(false);
  if (!seq) return null;
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5a32, roughness: 0.9 });
  const pipe = new THREE.MeshStandardMaterial({ color: 0x8a8d90, metalness: 0.7, roughness: 0.4 });
  const cols = M.data.colliders = [];
  const grp = new THREE.Group();
  const box = (x0, x1, z0, z1, y0, y1, mat = wood) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.castShadow = true; grp.add(m);
    cols.push(g.physics.city.add(x0, z0, x1, z1, y0, y1, 'roofroute'));
  };
  const pts = [];
  for (let k = 0; k < seq.length; k++) {
    const a = seq[k];
    const zc = (a.z0 + a.z1) / 2;
    if (k === 0) pts.push({ x: a.x0 + 3, z: zc });
    // çatı korkulukları (görsel)
    const rail = new THREE.Mesh(new THREE.BoxGeometry(a.x1 - a.x0, 0.12, 0.12), pipe); rail.position.set((a.x0 + a.x1) / 2, a.h + 1, a.z0 + 0.3); grp.add(rail);
    // su deposu / baca (siper)
    box(a.x0 + 4, a.x0 + 5.4, a.z1 - 3, a.z1 - 1.6, a.h, a.h + 1.4, pipe);
    if (k === seq.length - 1) { pts.push({ x: a.x1 - 2.5, z: zc }); break; }
    const b = seq[k + 1];
    let top = a.h;
    if (b.h > a.h + 0.3) {
      const n = Math.ceil((b.h - a.h) / 0.4);
      const len = 0.42;
      const sx = a.x1 - n * len;
      pts.push({ x: sx - 1, z: zc });
      for (let s = 0; s < n; s++) box(sx + s * len, a.x1 + 0.01, zc - 0.8, zc + 0.8, a.h, Math.min(b.h, a.h + (s + 1) * 0.4));
      top = b.h;
    } else pts.push({ x: a.x1 - 1, z: zc });
    // kalas
    box(a.x1 - 0.3, b.x0 + 0.6, zc - 0.7, zc + 0.7, top - 0.12, top);
    pts.push({ x: b.x0 + 2, z: zc });
  }
  M.object(grp);
  return { seq, pts, minH: Math.min(...seq.map((b) => b.h)) };
}

// konteyner istifi (liman)
function buildContainers(M, cx, cz) {
  const g = M.g;
  const cols = M.data.colliders || (M.data.colliders = []);
  const grp = new THREE.Group();
  const colors = [0xb3131b, 0x1d6ec8, 0x2d8a3d, 0xd4af37, 0x6a6a6a, 0xb05a1a];
  const out = [];
  for (let i = 0; i < 6; i++) {
    const x = cx + (i % 3) * 9 - 9, z = cz + Math.floor(i / 3) * 7 - 3.5;
    const stack = i % 2 ? 2 : 1;
    for (let k = 0; k < stack; k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(6.1, 2.6, 2.45), new THREE.MeshStandardMaterial({ color: colors[(i + k) % colors.length], roughness: 0.7, metalness: 0.3 }));
      m.position.set(x, 1.3 + k * 2.6, z); m.castShadow = true; grp.add(m);
    }
    cols.push(g.physics.city.add(x - 3.05, z - 1.22, x + 3.05, z + 1.22, 0, 2.6 * stack, 'container'));
    out.push({ x, z: z + 1.9 });
  }
  M.object(grp);
  return out;
}

// ======================================================================================
export const STORY = [
  // ============================ BİRİNCİ PERDE · DÖNÜŞ ============================
  {
    id: 'eve_donus', act: 0, title: 'Eve Dönüş', reward: 500, respect: 20, short: 'Yedi yıl sonra konağa dönüş.',
    brief: 'Yıllar sonra cezaevinden çıktın. Reis Baba seni Beyoğlu\'ndaki konağında bekliyor.',
    konak(M, ctx, I) {
      const k = I.npc(ctx, 'boss', 4.2, -3.2, -2.2, { name: 'Kenan', look: KENAN_LOOK(), gang: 'family' });
      k.god = true; M.data.kenan = k;
    },
    steps: [
      enter('konak', 'Reis Baba\'nın konağına git', { pick: konakDoor }),
      talk((M) => {
        const g = M.g, P0 = g.player.pos;
        const reis = { x: 0, y: 0, z: -5.2 }, leyla = { x: 1.6, y: 0, z: -4.6 }, ken = { x: 4.2, y: 0, z: -3.2 };
        return [
          ['Reis Baba', 'Yedi yıl... Gel bakalım, sarıl şu ihtiyara. Yüzünde hâlâ koğuşun soğuğu var.', { cam: () => M.camOver(P0, reis)() }],
          ['Sen', 'Soğuk geçer Reis. Sizi böyle görmek yeter.'],
          ['Leyla', 'Babam her bayram senin için bir tabak ayırttı. Ben de her bayram o tabağı geri kaldırttım. Geç kaldın.', { cam: () => M.camBetween(P0, leyla, -1)() }],
          ['Kenan', 'Kahraman dönmüş. Bizim için yattın diye herkes sana borçlu sanıyorsun, değil mi?', { cam: () => M.camBetween(P0, ken, 1)() }],
          ['Reis Baba', 'Kenan! Bu evde ekmeğimizi bölen adama diş gösterilmez.', { cam: () => M.camBetween(reis, ken, 1, 4)() }],
          ['Reis Baba', 'Şehir değişti evlat. Kartallar Beşiktaş\'ı, Yılanlar Beyoğlu\'nun arka sokaklarını tuttu. Hacı Rüstem Fatih\'te altın tartıyor, Deli Murat Kadıköy\'de lastik yakıyor.', { cam: () => M.camOver(P0, reis)() }],
          ['Reis Baba', 'Bir de Kurtlar var... Üsküdar\'dan sessiz sessiz büyüyorlar. Ne istediklerini bilen yok.'],
          ['Reis Baba', 'Seni içeri tıkan Komiser Nevzat hâlâ görevde. Müdürlüğe yükselmiş. Bu şehirde rütbe de satılıyor artık.'],
          ['Sen', 'Ben unutmadım Reis. Nereden başlıyoruz?'],
          ['Reis Baba', 'Önce nefes al. Sana bir ev ayarladım, anahtarı cebinde. Cin Ali de seni soruyordu; yakında arar.'],
        ];
      }),
    ],
    onComplete(M) { M.g.ui.notify('İpucu: Görev arşivi ve kontrat panosu güvenli evde. Telefon çalınca T ile aç.', 'info'); },
  },
  {
    id: 'eski_dost', act: 0, title: 'Eski Dost', reward: 2000, respect: 40, call: 'Cin Ali', short: 'Cin Ali ile buluşma ve Yılanlar\'ın takibi.',
    brief: 'Abiii! Ben Cin Ali! Taksim\'deki çay ocağının önündeyim. Gel, sana bir sürprizim var!',
    check(M) { if (M.data.ali && M.data.ali.dead) return 'fail:Cin Ali öldü!'; return null; },
    steps: [
      goTo((M) => spawnAt(M, M.special('cafe', -40, -260), 3), 'Taksim\'deki çay ocağında Cin Ali ile buluş', {
        r: 4,
        onStart(M) {
          const p = spawnAt(M, M.special('cafe', -40, -260), 2.5);
          const a = M.ally(p.x + 1, p.z, { name: 'Cin Ali', look: ALI_LOOK(), state: 'idle', baseState: 'idle', weapon: 'pistol', hp: 400 });
          M.data.ali = a;
        },
      }),
      talk((M) => [
        ['Cin Ali', 'Abi! Vay be, yedi yıl! Saçına ak düşmüş ama yürüyüş aynı. Gel sarılayım!', { cam: M.camBetween(P(M), M.data.ali, 1) }],
        ['Sen', 'Ali... Hâlâ aynı ceketi giyiyorsun.'],
        ['Cin Ali', 'Uğurlu bu! İki kurşun, bir bıçak gördü, delik yok. Neyse, sürprize gel: Kartal 131. Motor benim elimden geçti, uçar.'],
        ['Cin Ali', 'Seni güvenli eve bırakayım. Yolda anlatırım, mahallede neler döndüğünü.'],
      ], {
        after(M) {
          const n = M.node(P(M).pos.x, P(M).pos.z);
          const e = n.edges[0], o = M.g.map.other(e, n);
          const dx = o.x - n.x, dz = o.z - n.z, l = Math.hypot(dx, dz);
          M.data.car = M.car('kartal', n.x + dx / l * 14 - dz / l * 2.7, n.z + dz / l * 14 + dx / l * 2.7, Math.atan2(dx, dz), '#8a1a1a');
          M.escort(M.data.ali);
        },
      }),
      step({
        start(M) { M.setMarkers([{ vehicle: M.data.car, color: 0x3080ff }]); M.objective('Kartal 131\'e bin (Cin Ali seninle)'); },
        update(M) { return P(M).vehicle === M.data.car && M.escortsIn(M.data.car) ? 'next' : null; },
      }),
      step({
        cp: 'Yılanlar peşinde',
        place(M) {
          const sh = M.special('safehouse', -300, -60);
          const s = M.roadSpot(sh.door.x + 260, sh.door.z - 120, 0, 60);
          M.place(s.x, s.z, s.h);
          const v = M.car('kartal', s.x, s.z, s.h, '#8a1a1a'); M.data.car = v; M.g.enterVehicle(v, true);
          const a = M.ally(s.x + 2, s.z, { name: 'Cin Ali', look: ALI_LOOK(), weapon: 'pistol', hp: 400 }); M.data.ali = a; M.escort(a); a.vehicle = v; a.model.root.visible = false;
        },
        start(M) { const sh = M.special('safehouse', -300, -60); M.gotoXZ(sh.door.x, sh.door.z + 4, 'Cin Ali\'yi güvenli eve götür', 5); M.s.t = 0; },
        update(M, dt) {
          M.s.t += dt;
          if (!M.s.spawned && M.s.t > 6) {
            M.s.spawned = true;
            M.gangCar('yilanlar', 2, { cruise: 26 }); M.gangCar('yilanlar', 2, { cruise: 22, min: 90, max: 130 });
            M.dialog([['Cin Ali', 'Abi aynaya bak! Siyah arabalar... Yılanlar bunlar! Seni karşılamaya gelmişler!'], ['Sen', 'Kemerini tak Ali.']]);
            M.objective('Yılanlar peşinizde! Takipçileri hallet');
          }
          if (M.s.spawned) {
            const alive = M.updateGangCars();
            const crews = M.data.gangCars.flatMap((v) => v.crew);
            M.setMarkers(crews.filter((n) => !n.dead).map((n) => (n.vehicle ? { vehicle: n.vehicle, color: 0xff3030 } : { actor: n, color: 0xff3030 })));
            if (alive === 0) return 'next';
          }
          return null;
        },
      }),
      goTo((M) => spawnAt(M, M.special('safehouse', -300, -60), 4), 'Cin Ali\'yi güvenli eve götür', { r: 6 }),
      talk(() => [
        ['Cin Ali', 'Hah! Gördün mü motoru? Yılanlar yine kuyruklarını kıstı.'],
        ['Cin Ali', 'Bak abi, bir şey diyeceğim ama aramızda kalsın. Kenan... Babasının koltuğunda gözü var. Sen içerideyken bayağı şişirdi kendini.'],
        ['Sen', 'Kenan Reis\'in oğlu Ali. Kan kandır.'],
        ['Cin Ali', 'Kan kandır da, para paradır abi. Neyse, ben dilimi tutayım. Bir işin olursa ara.'],
      ]),
    ],
  },
  {
    id: 'harac', act: 0, title: 'Haraç Turu', reward: 3000, respect: 60, short: 'Esnaftan haraç ve Yılanlar\'ın tetikçileri.',
    brief: 'Mahalle esnafından bu ayın haracını topla. Kimseyi incitme... gerekmedikçe. Esnaf bizim ekmeğimiz, unutma.',
    steps: [
      step({
        start(M) { M.data.done = 0; this.mark(M); },
        mark(M) {
          const s = haracShops(M)[M.data.done];
          M.setMarkers([{ x: s.door.x, z: s.door.z + s.door.nz * 1.0, color: 0xffcc00, r: 3 }]);
          M.objective(`Haraç topla (${M.data.done + 1}/3)`);
          M.g.setGps(s.door.x, s.door.z + s.door.nz * 2);
        },
        update(M) {
          const g = M.g, s = haracShops(M)[M.data.done];
          if (M.s.talking) return M.s.talked ? 'next' : null;
          const d = Math.hypot(g.player.pos.x - s.door.x, g.player.pos.z - (s.door.z + s.door.nz));
          if (d < 3.5 && !g.player.vehicle && !g.player.inInterior) {
            M.prompt('Haracı topla', () => {
              M.data.done++;
              if (M.data.done < 3) {
                g.state.money += 800; g.audio.cash(); g.ui.notify('+₺800 haraç', 'money');
                M.dialog([[M.data.done === 1 ? 'Bakkal Hüsnü' : 'Terzi Nuri', M.data.done === 1 ? 'Hoş geldin evlat, Reis\'e selamımı söyle. Zarf hazır.' : 'Al bakalım... Bu ay kepenk yarım açıldı ama Reis\'in hakkı başımın üstünde.']]);
                this.mark(M);
              } else {
                M.s.talking = true;
                M.talk([
                  ['Esnaf', 'Ödemiyorum! Yılanlar\'a zaten veriyorum, size verecek param yok! İki kere mi haraç verecek bu dükkân?'],
                  ['Sen', 'Bu mahalleye Yılanlar mı bakıyor artık? Gelsinler bakalım.'],
                  ['Esnaf', 'Geldiler bile... Arkana bak!'],
                ]);
              }
            });
          }
          return null;
        },
      }),
      killAll('thugs', 'Yılanlar\'ın tetikçilerini hallet', {
        cp: 'Yılanlar',
        place(M) { const s = haracShops(M)[2]; M.place(s.door.x, s.door.z + s.door.nz * 2.5, 0); },
        spawn(M) {
          const s = haracShops(M)[2];
          const out = [];
          for (let i = 0; i < 3; i++) out.push(M.enemy('yilanlar', s.door.x + (i - 1) * 3, s.door.z + s.door.nz * 13, { weapon: i === 0 ? 'bat' : 'pistol', delay: 1.6 }));
          M.say(out[1], 'Bu mahalle Yılanlar\'ın! Haracı biz alırız!');
          return out;
        },
      }),
      talk(() => [['Esnaf', 'Tamam, tamam! Al şu zarfı... Reis\'e söyle, artık sadece ona ödeyeceğim.']], { after(M) { M.g.state.money += 1200; } }),
    ],
  },
  {
    id: 'karabasan', act: 0, title: 'Karabasan Teslimatı', reward: 8000, respect: 90, giver: 'Kenan', short: 'Kartallar\'ın SUV\'unu çal, 4 dakikada teslim et.',
    brief: 'Kenan seni bekliyor: "Babam sana güveniyor; bakalım direksiyon tutabiliyor musun. Kartallar\'ın siyah Karabasan\'ını çal, 4 dakikada Kadıköy\'deki tamirciye getir."',
    check(M) { const c = M.data.car; if (c && (c.destroyed || c.sinking > 0)) return 'fail:Araç hasar gördü!'; return null; },
    steps: [
      step({
        start(M) {
          const g = M.g;
          const spot = g.map.nearestNode(-520, -620);
          const car = M.car('suv', spot.x + 6, spot.z + 2, 0, '#0a0a0a'); car.parked = true;
          M.data.car = car;
          M.data.guards = [];
          for (let i = 0; i < 2; i++) { const n = M.enemy('kartallar', spot.x + 9, spot.z + 4 + i * 2, { state: 'guard', home: new THREE.Vector3(spot.x + 9, 0, spot.z + 4 + i * 2) }); M.data.guards.push(n); }
          M.setMarkers([{ vehicle: car, color: 0x3080ff }]);
          M.objective('Siyah Karabasan SUV\'u bul ve çal (Beşiktaş)');
        },
        update(M) { if (P(M).vehicle === M.data.car) { M.g.wanted.add(1, true); return 'next'; } return null; },
      }),
      step({
        cp: 'Teslimat', time: 240, timeFail: 'Süre doldu!',
        place(M) { const spot = M.g.map.nearestNode(-520, -620); M.place(spot.x + 6, spot.z - 3, 0); const v = M.car('suv', spot.x + 6, spot.z + 2, 0, '#0a0a0a'); M.data.car = v; M.g.enterVehicle(v, true); },
        start(M) { const gr = M.special('garage'); M.data.garage = gr; M.goto(gr, 'Aracı Kadıköy\'deki tamirciye götür', 8); },
        update(M) {
          const g = M.g, car = M.data.car, gd = M.data.garage.door;
          if (g.player.vehicle === car && Math.hypot(car.pos.x - gd.x, car.pos.z - (gd.z + gd.nz * 6)) < 12 && Math.abs(car.fs) < 3) {
            if (g.wanted.level > 0) { M.objective('Önce polisleri atlat!'); return null; }
            g.vehicles.ejectDriver(car);
            car.ai = { empty: true }; car.parked = true;
            const bonus = Math.floor(car.hp / car.def.hp * 4000);
            g.state.money += bonus;
            g.ui.notify(`Araç durumu bonusu: +₺${bonus}`, 'money');
            return 'next';
          }
          return null;
        },
      }),
      talk(() => [['Kenan', 'Fena değil. Dört dakika demiştim, sen erken geldin. Babam haklıymış galiba... Şimdilik.'], ['Sen', 'Şimdilik mi?'], ['Kenan', 'Bu şehirde her şey şimdilik, kardeşim.']]),
    ],
  },
  {
    id: 'liman', act: 0, title: 'Liman Baskını', reward: 15000, respect: 140, short: 'Çarşı Ailesi\'nin silah deposuna baskın.',
    brief: 'Çarşı Ailesi Eminönü\'ndeki depoda silah sevkiyatı saklıyor. Depoya gir, bekçileri temizle, sandığı al ve güvenli eve dön.',
    steps: [
      enter('warehouse', 'Eminönü\'ndeki depoya gir', {
        near: [-40, 250],
        populate(M, ctx, I) {
          if (ctx.building !== M.s.b) return;
          M.data.guards = [];
          const pos = [[-8, -6], [-4, 2], [0, -7], [5, -3], [8, 3], [-9, 4], [3, 5], [9, -7]];
          for (const [x, z] of pos) {
            const look = randomLook(ctx.rng, 'gang'); look.topColor = GANGS.carsi.color;
            const n = I.npc(ctx, 'guard', x, z, Math.random() * 6, { gang: 'carsi', mission: true, weapon: Math.random() < 0.5 ? 'uzi' : 'pistol', look });
            n.hostile = true; n.static = false;
            M.data.guards.push(n);
          }
          const crate = I.box(ctx, 1.2, 0.8, 0.8, 0, 0, -8.5, new THREE.MeshStandardMaterial({ color: 0x4a5a30 }));
          ctx.interact.push({ x: 0, z: -7.6, r: 1.5, label: 'Silah sandığını al', cond: () => M.data.guards && M.allDead(M.data.guards) && !M.data.crate, action: () => { ctx.scene.remove(crate); M.data.crate = true; M.g.ui.notify('Sandık alındı!', 'good'); } });
        },
      }),
      step({
        start(M) { M.objective('Depodaki bekçileri etkisiz hale getir'); },
        update(M) {
          if (!P(M).inInterior) return 'fail:Depodan çıktın!';
          if (M.data.guards && M.allDead(M.data.guards)) M.objective(M.data.crate ? 'Depodan çık' : 'Silah sandığını al');
          return M.data.crate ? 'next' : null;
        },
      }),
      step({
        start(M) { M.objective('Depodan çık'); },
        update(M) { if (!P(M).inInterior) { M.g.wanted.add(2, true); return 'next'; } return null; },
      }),
      enter('safehouse', 'Güvenli eve dön (polis peşinde!)', { cp: 'Kaçış', place(M) { const w = M.special('warehouse', -40, 250); M.place(w.door.x, w.door.z + w.door.nz * 3, 0); M.g.wanted.add(2, true); }, near: [-300, -60] }),
      step({ start(M) { M.g.player.giveWeapon('ak', 120); M.g.ui.notify('Kalaşnikof + 120 mermi', 'good'); }, update() { return 'next'; } }),
    ],
  },
  {
    id: 'hain', act: 0, title: 'Hain', reward: 20000, respect: 180, giver: 'Leyla', call: 'Leyla', short: 'Muhasebeci Sinan\'ın kaderi senin elinde.',
    brief: 'Muhasebeci Sinan defterleri Kartallar\'a taşıyor. Babam bilmesin istedim; önce sen konuş onunla. Üsküdar sahilinde. Kaçmasına izin verme.',
    steps: [
      step({
        start(M) {
          const g = M.g;
          const node = g.map.nearestNode(600, -650);
          const t = M.npc('civilian', node.x + 9, node.z + 9, { name: 'Sinan', hp: 140, state: 'idle', home: new THREE.Vector3(node.x + 9, 0, node.z + 9), lookOver: { top: 'suit', topColor: '#5a4a3a', glasses: true, hair: 'kel', beard: 'mustache' } });
          t.brave = false; t.scriptKill = true;
          M.data.t = t;
          M.data.guards = [];
          for (let i = 0; i < 3; i++) M.data.guards.push(M.enemy('kartallar', node.x + 7 + i * 2, node.z + 12, { state: 'guard', home: new THREE.Vector3(node.x + 7 + i * 2, 0, node.z + 12), weapon: 'uzi' }));
          const car = M.car('sedan', node.x + 12, node.z + 4, 0, '#6a6a6a'); car.parked = true;
          M.data.car = car;
          M.setMarkers([{ actor: t, color: 0xff3030 }]);
          M.objective('Sinan\'ı bul (Üsküdar)');
          g.setGps(node.x, node.z);
        },
        update(M) {
          const t = M.data.t;
          if (t.dead) { M.setFlag('sinan', 'kill'); return 3; }
          if (M.distTo(t) < 45) {
            M.say(t, 'O burada! Kaçmam lazım!');
            board(M, t, M.data.car); fleeCar(M, M.data.car);
            M.setMarkers([{ vehicle: M.data.car, color: 0xff3030 }]);
            M.objective('Sinan kaçıyor! Arabasını durdur');
            return 'next';
          }
          return null;
        },
      }),
      step({
        update(M, dt) {
          const r = chaseTarget(M, M.data.t, M.data.car, dt, { footText: 'Sinan yaya kaçıyor! Yakala (yaklaş)' });
          if (r === 'dead') { if (!M.flag('sinan')) M.setFlag('sinan', 'kill'); return 3; }
          if (r === 'lost') return 'fail:Sinan kaçtı!';
          if (r === 'caught') return 'next';
          return null;
        },
      }),
      talk((M) => [
        ['Sinan', 'Yapma! Ben sadece rakam yazarım... Defterleri istediler, verdim! Bana emri veren... söyleyemem, beni de ailemi de keserler!', { cam: M.camBetween(P(M), M.data.t, 1) }],
        ['Sen', 'Kim istedi Sinan? Kartallar mı?'],
        ['Sinan', 'Kartallar sadece kurye... Asıl adam evin içinden. Daha fazlasını söylersem yarın sabah Boğaz\'dan çıkarırlar beni.'],
        {
          who: 'Sen', text: 'Ne yapacaksın?', key: 'sinan',
          choice: [
            { label: '"Defol git bu şehirden. Bir daha görürsem yaşamazsın."', value: 'spare', hint: 'Sinan\'ı bağışla — bir gün borcunu ödeyebilir.', lines: [['Sinan', 'Allah razı olsun... Bir gün bu borcu öderim, yemin ederim. Yemin ederim!']] },
            { label: '"Aile hainleri affetmez."', value: 'kill', hint: 'Sinan\'ı infaz et — aile sert adamlara saygı duyar.', lines: [['Sinan', 'Hayır, dur! Dur...']] },
          ],
        },
      ], {
        after(M, r) {
          const t = M.data.t;
          const v = r.sinan || M.data.choice_sinan;
          if (v === 'kill') { t.god = false; t.takeDamage(999, null, 'bullet'); M.g.audio.gunshot('revolver', t.pos.x, t.pos.z); M.g.particles.blood({ x: t.pos.x, y: 1.2, z: t.pos.z }, 14); }
          else { t.god = false; t.state = 'flee'; t.fleeFrom = P(M).pos.clone(); t.fleeT = 20; t.mission = false; }
        },
      }),
      talk((M) => (M.flag('sinan') === 'kill'
        ? [['Leyla', 'Haberi aldım. Babama "kayboldu" derim. Sert adamsın... Bu şehirde iyi bir şey mi kötü mü, henüz bilmiyorum.'], ['Leyla', 'Ama Sinan\'ın söylediği şey... "Evin içinden biri." Bunu aklından çıkarma.']]
        : [['Leyla', 'Bıraktın mı onu? Babam olsa ikimizi de azarlardı.'], ['Leyla', 'Ama... iyi yaptın belki. Bir hainin yaşaması bazen ölüsünden daha çok konuşur.'], ['Leyla', '"Evin içinden biri" demiş. Bunu aklından çıkarma.']])),
    ],
  },

  // ============================ İKİNCİ PERDE · KAN DAVASI ============================
  {
    id: 'komiser', act: 1, title: 'Komiserin Çayı', reward: 12000, respect: 120, call: 'Komiser Nevzat', short: 'Nevzat\'ın emanet deposundan gizlice çanta kaçır.',
    brief: 'Seni karakolda çaya bekliyorum. Gelmezsen ben gelirim; o zaman çay olmaz, kelepçe olur.',
    steps: [
      enter('police', 'Emniyet müdürlüğüne git (aranmadan!)', {
        near: [-620, -120], need0: true,
        populate(M, ctx, I) {
          const n = I.npc(ctx, 'cop', 4, -4.6, 0, { name: 'Komiser Nevzat', look: NEVZAT_LOOK() });
          n.god = true; n.sitting = true; M.data.nev = n;
        },
      }),
      talk((M) => [
        ['Komiser Nevzat', 'Vay vay, kuş kafesten çıkmış. Otur. Çayın şekerini sorarım, gerisini sormam.', { cam: () => M.camBetween(P(M).pos, { x: 4, y: 0, z: -4.6 }, 1)() }],
        ['Sen', 'Beni yedi yıl içeride çürüttün Nevzat.'],
        ['Komiser Nevzat', 'Ben mi? Sen kendini çürüttün evlat. Ben sadece kapıyı kilitledim. Yedi yıl az bile... ama ben merhametli adamım.'],
        ['Komiser Nevzat', 'İş konuşalım. Emanet otoparkta, ailenin bir çantası duruyor. Bizim çocuklar "yanlışlıkla" el koydu.'],
        ['Komiser Nevzat', 'Çantayı al; yüzde otuzu benim. Ama kimse seni görmesin. Görürlerse... ben de seni tanımam.'],
        ['Sen', 'Ya almazsam?'],
        ['Komiser Nevzat', 'O zaman Reis Baba\'nın konağına bir gece baskını yaparız. Kalp hastası adamdır, yazık olur.'],
      ]),
      step({
        cp: 'Emanet otopark',
        place(M) { const b = M.special('police', -620, -120); const f = spawnAt(M, b, 5); M.place(f.x, f.z, 0); },
        start(M) {
          const g = M.g;
          const b = M.special('police', -620, -120);
          const n = g.map.nearestNode(b.door.x + 60, b.door.z + 40);
          const cx = n.x + 10, cz = n.z + 10;
          M.data.lot = { x: cx, z: cz };
          M.data.watch = [];
          const pts = [[cx - 8, cz - 6], [cx + 8, cz - 6], [cx + 8, cz + 6], [cx - 8, cz + 6]];
          for (let i = 0; i < 4; i++) {
            const pat = [pts[i], pts[(i + 1) % 4]].map(([x, z]) => ({ x, z }));
            const c = M.npc('police', pts[i][0], pts[i][1], { state: 'patrol', baseState: 'patrol', patrol: pat });
            M.data.watch.push(c);
          }
          for (let i = 0; i < 3; i++) { const v = M.car('police', cx - 6 + i * 6, cz + 1.5, 0.2 * i); v.parked = true; }
          const bag = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.3), new THREE.MeshStandardMaterial({ color: 0x3a2412 }));
          bag.position.set(cx, 0.18, cz - 1.5); M.object(bag); M.data.bag = bag;
          M.gotoXZ(cx, cz - 1.5, 'Emanet otoparktaki çantayı GÖRÜNMEDEN al (C: çömel)', 1.5);
          M.dialogue.meter('GÖRÜNMÜYORSUN', 0);
        },
        update(M, dt) {
          if (M.stealth(M.data.watch, dt)) { M.g.wanted.add(2, true); return 'fail:Polis seni fark etti!'; }
          const L = M.data.lot;
          if (!M.data.got) {
            if (M.reached(L.x, L.z - 1.5, 1.8)) M.prompt('Çantayı al', () => { M.data.got = true; M.data.bag.visible = false; M.g.audio.cash(); M.objective('Otoparktan görünmeden uzaklaş (60 m)'); M.setMarkers([]); });
          } else if (!M.reached(L.x, L.z, 60)) { M.dialogue.meter(null); return 'next'; }
          return null;
        },
        cleanup(M) { M.dialogue.meter(null); },
      }),
      talk(() => [['Komiser Nevzat', 'Telsizden kimse bir şey demedi. Aferin. Yüzde otuzumu konağa bırakırsın.'], ['Komiser Nevzat', 'Bundan sonra tasmanın ucu bende, unutma.'], ['Sen', 'Tasmalar bir gün kopar Nevzat.']], { before(M) { M.g.state.money += 6000; } }),
    ],
  },
  {
    id: 'kuyumcu', act: 1, title: 'Kapalıçarşı Vurgunu', reward: 30000, respect: 160, giver: 'Leyla', short: 'Hacı Rüstem\'in altın kasası.',
    brief: 'Hacı Rüstem Kapalıçarşı\'daki kuyumcunun arka odasında Çarşı Ailesi\'nin altınını saklıyor. Cin Ali matkapla gelecek. Sen kapıyı tut, o kasayı açsın.',
    check(M) { if (M.data.ali && M.data.ali.dead) return 'fail:Cin Ali öldü!'; return null; },
    steps: [
      enter('bazaar', 'Kapalıçarşı\'ya gir', {
        anyB: true,
        pick: (M) => M.landmarkDoor('bazaar'),
        populate(M, ctx, I) {
          M.data.guards = [];
          for (const [x, z] of [[-3, -14], [3, -12], [0, -17], [-4, -8], [4, -6]]) {
            const look = randomLook(ctx.rng, 'gang'); look.topColor = GANGS.carsi.color;
            const n = I.npc(ctx, 'guard', x, z, 0, { gang: 'carsi', mission: true, weapon: x > 0 ? 'shotgun' : 'pistol', look });
            n.static = false; n.hostile = false; M.data.guards.push(n);
          }
          const ali = I.npc(ctx, 'guard', 1, 16, Math.PI, { name: 'Cin Ali', gang: 'family', mission: true, look: ALI_LOOK(), weapon: 'pistol', hp: 400, state: 'follow', baseState: 'follow' });
          ali.ally = true; ali.leader = M.g.player; ali.static = false; M.data.ali = ali;
          const safe = I.box(ctx, 1.4, 1.8, 1, 0, 0, -19.3, new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.9, roughness: 0.3 }));
          void safe;
          ctx.interact.push({ x: 0, z: -18, r: 1.8, label: 'Kasayı del (Cin Ali)', cond: () => !M.data.drill, action: () => { M.data.drill = 0.001; } });
        },
      }),
      step({
        start(M) { M.objective('Kuyumcunun arka odasına git, kasayı del'); M.dialog([['Cin Ali', 'Sessiz ol abi, burası Hacı\'nın ahırı. Kasaya kadar götür beni.']]); },
        update(M, dt) {
          const g = M.g;
          if (!P(M).inInterior) return 'fail:Çarşıdan çıktın!';
          if (!M.data.drill) return null;
          if (!M.s.alarm) {
            M.s.alarm = true;
            for (const n of M.data.guards) { n.hostile = true; n.engage(g.player, 1); }
            M.say(M.data.guards[0], 'Hırsız var! Hacı\'nın kasası!');
            M.objective('Cin Ali kasayı delerken onu koru!');
            M.data.ali.state = 'guard'; M.data.ali.home = new THREE.Vector3(1, 0, -17); M.data.ali.baseState = 'guard';
          }
          M.data.drill += dt / 35;
          M.dialogue.meter('MATKAP', M.data.drill, '#d4af37');
          // ikinci dalga
          if (M.data.drill > 0.45 && !M.s.w2) {
            M.s.w2 = true;
            const ctx = P(M).inInterior;
            for (const [x, z] of [[-2, 17], [2, 17], [0, 15]]) { const n = g.interiors.npc(ctx, 'guard', x, z, Math.PI, { gang: 'carsi', mission: true, weapon: 'uzi', look: { ...randomLook(rng, 'gang'), topColor: GANGS.carsi.color } }); n.static = false; n.hostile = true; n.engage(g.player, 1.5); M.data.guards.push(n); }
            M.say(M.data.ali, 'Kapıdan geliyorlar abi!');
          }
          if (M.data.drill >= 1) { M.dialogue.meter(null); g.state.money += 15000; g.ui.notify('Kasa açıldı! +₺15.000 altın', 'money'); return 'next'; }
          return null;
        },
        cleanup(M) { M.dialogue.meter(null); },
      }),
      step({
        start(M) { M.objective('Çarşıdan çık!'); },
        update(M) { if (!P(M).inInterior) { M.g.wanted.add(3, true); return 'next'; } return null; },
      }),
      step({
        cp: 'Polisten kaç',
        place(M) { const d = M.landmarkDoor('bazaar'); M.place(d.door.x, d.door.z + 3, 0); M.g.wanted.add(3, true); },
        start(M) { M.objective('Polisi atlat (aranma yıldızlarını sıfırla)'); M.setMarkers([]); M.g.setGps(null); },
        update(M) { return M.g.wanted.level === 0 ? 'next' : null; },
      }),
      talk(() => [['Leyla', 'Hacı Rüstem kudurmuş diyorlar. İyi. Kudurmuş köpek hata yapar.'], ['Leyla', 'Altının yarısını babama, yarısını savaş kasasına ayırdım. Bir savaş geliyor, hissediyorum.']]),
    ],
  },
  {
    id: 'yaris', act: 1, title: 'Kadıköy Turu', reward: 25000, respect: 150, call: 'Deli Murat', short: 'Deli Murat\'a karşı sokak yarışı.',
    brief: 'Hey, Reis\'in yeni tazısı! Kadıköy\'de lastik yakmaya var mısın? Kaybedersen arabanı alırım, kazanırsan saygımı. Saygım pahalıdır, söyleyeyim.',
    steps: [
      step({ start(M) { M.startRace('kadikoy'); }, update(M) { const r = M.updateRace(); return r === 'done' ? 'next' : r; } }),
      talk(() => [['Deli Murat', 'Hahaha! Lan sen deli misin? Virajı el freniyle aldın! Tamam, saygımı kazandın.'], ['Deli Murat', 'Boğaz Kardeşler dostlarını unutmaz. Bir gün lazım olursak, sadece kornaya bas.']]),
    ],
  },
  {
    id: 'galata', act: 1, title: 'Galata\'da Gözcü', reward: 22000, respect: 170, giver: 'Leyla', short: 'Galata Kulesi\'nden keskin nişancı koruması.',
    brief: 'Karaköy\'de Kartallar\'ın elçisiyle görüşeceğim. Yılanlar\'ın görüşmeyi basacağını duydum. Galata Kulesi\'nin terasına çık, tüfeği hazırladım. Beni koru.',
    check(M) { if (M.data.leyla && M.data.leyla.dead) return 'fail:Leyla öldü!'; return null; },
    steps: [
      goTo((M) => { const g = M.g.galata || { cx: -110, cz: 10, R: 6.5 }; return { x: g.cx, z: g.cz + g.R + 3 }; }, 'Galata Kulesi\'ne git', { r: 4 }),
      step({
        cp: 'Teras',
        start(M) {
          const g = M.g;
          g.state.money += 50; g.goGalataTop();
          g.player.giveWeapon('sniper', 30); g.player.setWeapon('sniper');
          const G = g.galata;
          const n = g.map.nearestNode(G.cx + 40, G.cz - 50);
          const l = M.ally(n.x + 8, n.z + 8, { name: 'Leyla', look: LEYLA_LOOK(), hp: 350, state: 'guard', baseState: 'guard', home: new THREE.Vector3(n.x + 8, 0, n.z + 8) });
          M.data.leyla = l;
          M.data.guards = [M.ally(n.x + 9, n.z + 10, { state: 'guard', baseState: 'guard', home: new THREE.Vector3(n.x + 9, 0, n.z + 10) }), M.ally(n.x + 6, n.z + 9, { state: 'guard', baseState: 'guard', home: new THREE.Vector3(n.x + 6, 0, n.z + 9) })];
          M.waves({ x: l.pos.x, z: l.pos.z, gang: 'yilanlar', waves: [3, 3, 4], minD: 35, maxD: 60, firstGap: 4, title: 'Leyla\'yı koru (sağ tık: dürbün)', weapons: ['pistol', 'uzi', 'ak'] });
          M.dialog([['Leyla', 'Yerimdeyim. Dürbünü sağ tıkla aç, nefesini tut. Yeşil ceketli gören vur.'], ['Sen', 'Buradan bütün İstanbul ayağımın altında.']]);
        },
        update(M, dt) {
          if (P(M).pos.y < 40) return 'fail:Mevziyi terk ettin!';
          const r = M.updateWaves(dt);
          // düşmanlar Leyla'yı hedeflesin
          if (M.s.wv) for (const n of M.s.wv.enemies) if (!n.dead && n.state !== 'attack' && Math.random() < 0.02) n.engage(M.data.leyla, 0.5);
          return r === 'done' ? 'next' : r;
        },
      }),
      talk(() => [['Leyla', 'Sekiz adam, sekiz kurşun. Babam sana neden "evlat" diyor, şimdi anlıyorum.'], ['Leyla', 'Elçi korkudan kekeledi ama mesajı verdi: Doğan Bey masaya oturmak istiyor.']]),
    ],
  },
  {
    id: 'kara_yilan', act: 1, title: 'Çatılarda Yılan', reward: 26000, respect: 200, short: 'Beyoğlu çatılarında Kara Yılan kovalamacası.',
    brief: 'Kara Yılan, kızımı vurmaya adam gönderdi. Beyoğlu\'nda bir apartmanda saklanıyor. Kaçarsa çatılardan kaçar, o sıçan. Peşinden git ve bu işi bitir.',
    steps: [
      step({
        start(M) {
          const r = buildRoofRoute(M);
          if (!r) { M.data.noRoute = true; return; }
          M.data.route = r;
          const b0 = r.seq[0];
          M.gotoXZ(b0.door.x, b0.door.z + b0.door.nz * 1.5, 'Kara Yılan\'ın saklandığı apartmana git (Beyoğlu)', 2.5);
        },
        update(M) {
          if (M.data.noRoute) return 'next';
          const b0 = M.data.route.seq[0];
          if (M.reached(b0.door.x, b0.door.z + b0.door.nz * 1.5, 3) && !P(M).vehicle) M.prompt('Çatıya çık', () => { M.s.go = true; });
          return M.s.go ? 'next' : null;
        },
      }),
      step({
        cp: 'Çatılar',
        place(M) { if (!M.data.route) M.data.route = buildRoofRoute(M); },
        start(M) {
          const g = M.g, r = M.data.route;
          if (!r) return;
          const a = r.seq[0];
          M.place(a.x0 + 1.5, (a.z0 + a.z1) / 2, Math.PI / 2, { y: a.h + 0.2 });
          const y = M.npc('boss', r.pts[0].x + 3, r.pts[0].z, { name: 'Kara Yılan', gang: 'yilanlar', weapon: 'pistol', hp: 380, look: BOSS_LOOK('yilanlar', { hat: 'none', hair: 'kel' }), y: a.h + 0.2, state: 'move' });
          y.pos.y = a.h + 0.2; y.path = r.pts.slice(1).map((p) => ({ x: p.x, z: p.z, r: 0.9 })); y.moveSpeed = 5.6; y.afterMove = 'idle'; y.god = true;
          M.data.y = y;
          M.setMarkers([{ actor: y, color: 0xff3030 }]);
          M.objective('Kara Yılan\'ı çatılarda kovala — düşme!');
          M.say(y, 'Sss... Yakalayamazsın beni!');
          g.ui.notify('Merdivenler ve kalaslar üzerinden atla (Space)', 'info');
        },
        update(M) {
          const r = M.data.route;
          if (!r) return 'next';
          const y = M.data.y;
          if (P(M).pos.y < r.minH - 2.5 && !P(M).swimming) return 'fail:Çatıdan düştün, Kara Yılan kaçtı!';
          // oyuncu geride kalırsa bekle
          if (y.state === 'move') y.moveSpeed = M.distTo(y) > 14 ? 3.2 : 5.6;
          if (y.state !== 'move') return 'next';
          return null;
        },
      }),
      talk((M) => [
        ['Kara Yılan', 'Sss... Tamam, köşeye sıkıştın beni. Ama dinle: beni öldürsen ne olur?', { cam: M.data.y ? M.camBetween(P(M), M.data.y, 1) : undefined }],
        ['Kara Yılan', 'Seni yedi yıl önce satan bizim mahalleden değil. Senin evinden biri. Reis\'in sofrasında oturan biri.'],
        ['Sen', 'Yalan söylüyorsun.'],
        ['Kara Yılan', 'Yılan yalan söylemez, sadece ısırır!'],
      ]),
      killAll('foes', 'Kara Yılan\'ı ve adamlarını indir', {
        spawn(M) {
          const y = M.data.y;
          const out = [];
          if (y) { y.god = false; y.engage(P(M), 0.4); out.push(y); }
          else out.push(M.enemy('yilanlar', P(M).pos.x + 12, P(M).pos.z + 6, { kind: 'boss', name: 'Kara Yılan', hp: 380 }));
          const r = M.data.route;
          if (r) { const a = r.seq[r.seq.length - 1]; for (let i = 0; i < 2; i++) { const n = M.enemy('yilanlar', a.x1 - 3 - i * 2, (a.z0 + a.z1) / 2 + 2, { weapon: 'uzi', y: a.h + 0.2 }); n.pos.y = a.h + 0.2; out.push(n); } }
          return out;
        },
      }),
    ],
  },
  {
    id: 'ittifak', act: 1, title: 'İttifak Masası', reward: 30000, respect: 220, short: 'Dolmabahçe\'de seçim: Kartallar mı, Boğaz Kardeşler mi?',
    brief: 'Dolmabahçe Sarayı\'nda bir masa kurdum. Doğan Bey ve Deli Murat ikisi de gelecek. Çarşı Ailesi\'ne karşı tek bir ortak seçeceğiz. Sözü sana bırakıyorum evlat.',
    check(M) { if (M.data.boss && M.data.boss.dead) return 'fail:Müttefik patron öldü!'; return null; },
    steps: [
      enter('palace', 'Dolmabahçe Sarayı\'na git', {
        anyB: true,
        pick: (M) => M.landmarkDoor('palace'),
        populate(M, ctx, I) {
          M.data.dogan = I.npc(ctx, 'boss', -3, -5, 0.4, { name: 'Doğan Bey', gang: 'kartallar', look: BOSS_LOOK('kartallar', { hatColor: '#e8e8e8' }) });
          M.data.murat = I.npc(ctx, 'boss', 3, -5, -0.4, { name: 'Deli Murat', gang: 'bogaz', look: BOSS_LOOK('bogaz', { hat: 'none', glasses: true, top: 'leather' }) });
          M.data.reis = I.npc(ctx, 'boss', 0, -7, 0, { name: 'Reis Baba', look: { ...randomLook(ctx.rng, 'boss'), hat: 'none', hairColor: '#cccccc' } });
          for (const n of [M.data.dogan, M.data.murat, M.data.reis]) n.god = true;
        },
      }),
      talk((M) => [
        ['Reis Baba', 'Beyler, Hacı Rüstem\'in altını Fatih\'i boğuyor. Tek başımıza onu yıkamayız. Ama üçümüz birden masayı da yıkarız.', { cam: () => M.camWide(0, 3, 2, 0, 1.5, -6) }],
        ['Doğan Bey', 'Beşiktaş elli yıldır bizim. Aile, nezaket, kural. Benimle olursanız arkanızda kırk adam ve temiz para olur.', { cam: () => M.camOver(P(M).pos, { x: -3, y: 0, z: -5 })() }],
        ['Deli Murat', 'Kural mural bilmem ben! Bende hız var, bende cesaret var. Kadıköy\'ün bütün arabaları benim. Benimle olursanız şehri yakarız!', { cam: () => M.camOver(P(M).pos, { x: 3, y: 0, z: -5 })() }],
        ['Reis Baba', 'Söz senin evlat. İkisini birden memnun edemeyiz.', { cam: () => M.camOver(P(M).pos, { x: 0, y: 0, z: -7 })() }],
        {
          who: 'Sen', text: 'Kiminle yürüyeceğiz?', key: 'ally',
          choice: [
            { label: 'Kartallar — Doğan Bey', value: 'kartallar', hint: 'Disiplinli, kalabalık, eski para. Boğaz Kardeşler küser.', lines: [['Doğan Bey', 'Akıllı seçim. Beni köşküme kadar sağ salim götür; Boğaz\'ın deli çocukları bunu sindiremeyecek.'], ['Deli Murat', 'Pişman olacaksın! Kadıköy\'de bir daha lastik izin bile kalmayacak!']] },
            { label: 'Boğaz Kardeşler — Deli Murat', value: 'bogaz', hint: 'Hızlı, çılgın, gözü kara. Kartallar düşman olur.', lines: [['Deli Murat', 'Hahaha! İşte benim adamım! Beni Kadıköy\'e bırak, Kartallar yolda selam verecektir.'], ['Doğan Bey', 'Bir delinin peşine takıldınız. Beşiktaş bunu unutmaz.']] },
          ],
        },
      ]),
      step({
        start(M) {
          const g = M.g;
          const ally = M.flag('ally') || M.data.choice_ally || 'kartallar';
          M.data.allyG = ally;
          if (!M.replay) { g.state.gangRel[ally] = 100; g.angerGang(ally === 'kartallar' ? 'bogaz' : 'kartallar'); }
          M.objective('Saraydan çık');
        },
        update(M) { return P(M).inInterior ? null : 'next'; },
      }),
      step({
        cp: 'Eskort',
        place(M) { const d = M.landmarkDoor('palace'); M.place(d.door.x, d.door.z + 4, 0); },
        start(M) {
          const g = M.g, ally = M.data.allyG || M.flag('ally') || 'kartallar';
          const p = P(M).pos;
          const n = M.node(p.x, p.z);
          const car = M.car(ally === 'kartallar' ? 'sedan' : 'gt', n.x + 2.7, n.z + 10, 0, ally === 'kartallar' ? '#e8e8e8' : '#1060c8');
          const boss = M.npc('boss', p.x + 1.5, p.z, { name: ally === 'kartallar' ? 'Doğan Bey' : 'Deli Murat', gang: ally, look: ally === 'kartallar' ? BOSS_LOOK('kartallar') : BOSS_LOOK('bogaz', { hat: 'none', top: 'leather' }), hp: 500, state: 'follow' });
          boss.ally = true; M.escort(boss);
          M.data.boss = boss; M.data.car = car;
          const dest = ally === 'kartallar' ? M.special('rival', -420, -920) : M.special('garage', 900, 700);
          M.data.dest = dest;
          M.goto(dest, `${boss.name}\'i ${ally === 'kartallar' ? 'Beşiktaş\'taki köşküne' : 'Kadıköy\'deki tamirhaneye'} götür`, 6);
          M.s.t = 0;
        },
        update(M, dt) {
          M.s.t += dt;
          const foe = M.data.allyG === 'kartallar' ? 'bogaz' : 'kartallar';
          if (!M.s.amb && M.s.t > 20 && P(M).vehicle) { M.s.amb = true; M.gangCar(foe, 3, { cruise: 26 }); M.gangCar(foe, 2, { cruise: 24, min: 100, max: 140 }); M.say(M.data.boss, 'Pusu! Bas gaza!'); }
          if (M.s.amb) M.updateGangCars();
          const d = M.data.dest;
          if (M.reached(d.door.x, d.door.z + (d.door.nz || 1) * 4, 12) && !P(M).vehicle && M.distTo(M.data.boss) < 12) return 'next';
          if (M.reached(d.door.x, d.door.z + (d.door.nz || 1) * 4, 12) && P(M).vehicle) M.objective('Arabadan in, patronu kapıya bırak');
          return null;
        },
      }),
      talk((M) => (M.data.allyG === 'bogaz'
        ? [['Deli Murat', 'Kardeşim! Bu gece Kadıköy senin şerefine korna çalacak. Çarşı\'ya girdiğinde yanında olacağım.']]
        : [['Doğan Bey', 'Sözünü tuttun. Kartallar bundan sonra ailenizin yanında. Çarşı\'ya girdiğinizde adamlarım hazır.']])),
    ],
  },
  {
    id: 'carsi', act: 1, title: 'Çarşı\'nın Sonu', reward: 40000, respect: 260, short: 'Fatih\'te bölge savaşı ve Hacı Rüstem.',
    brief: (M) => `Fatih'teki kahvehaneyi Çarşı Ailesi'nin burnunun dibinde açtım. Gelecekler. ${M.flag('ally') === 'bogaz' ? 'Deli Murat\'ın' : 'Doğan Bey\'in'} adamları yanında olacak. Kahvehaneyi koru, Hacı Rüstem ortaya çıkınca işini bitir.`,
    steps: [
      goTo((M) => spawnAt(M, M.special('cafe', -800, 300), 4), 'Fatih\'teki kahvehaneye git', { r: 6 }),
      step({
        cp: 'Kahvehane savunması',
        place(M) { const p = spawnAt(M, M.special('cafe', -800, 300), 4); M.place(p.x, p.z, 0); },
        start(M) {
          const p = spawnAt(M, M.special('cafe', -800, 300), 3);
          const ag = allyGang(M);
          for (let i = 0; i < 3; i++) M.ally(p.x - 3 + i * 3, p.z + 1, { gang: ag, state: 'guard', baseState: 'guard', home: new THREE.Vector3(p.x - 3 + i * 3, 0, p.z + 1), weapon: i ? 'ak' : 'shotgun', lookOver: { topColor: GANGS[ag].color } });
          M.waves({
            x: p.x, z: p.z, gang: 'carsi', waves: [4, 6, 7], defendHp: 100, defendR: 7, hpLabel: 'KAHVEHANE', failText: 'Kahvehane düştü!', title: 'Kahvehaneyi savun',
            boss: (M2) => { const s = M2.walk(p.x, p.z, 45, 60); const b = M2.enemy('carsi', s.x, s.z, { kind: 'boss', name: 'Hacı Rüstem', weapon: 'shotgun', hp: 600, lookOver: { topColor: GANGS.carsi.color, hat: 'kasket' } }); M2.data.rustem = b; M2.say(b, 'Bismillah... Fatih\'te bana kafa tutan kim?'); return b; },
          });
        },
        update(M, dt) { const r = M.updateWaves(dt); return r === 'done' ? 'next' : r; },
        cleanup(M) { M.dialogue.meter(null); },
      }),
      talk(() => [['Hacı Rüstem', 'Altın... altın kalır evlat. Biz gideriz, altın kalır...'], ['Sen', 'Altın da kalmayacak Hacı. Fatih artık ailenin.']], {
        after(M) { if (!M.replay) M.g.state.territories.carsi = true; M.big('FATİH ELE GEÇİRİLDİ', 'Çarşı Ailesi dağıldı', 'gold', 4); },
      }),
    ],
  },

  // ============================ ÜÇÜNCÜ PERDE · İHANET ============================
  {
    id: 'bomba', act: 2, title: 'Saatli Bomba', reward: 30000, respect: 220, call: 'Cin Ali', short: 'Gece kulübündeki bombayı etkisiz hale getir.',
    brief: (M) => `Abi! ${GANGS[enemyGang(M)].name} kulübün kapısına bomba koymuş! İki dakikan var! Ben yoldayım ama yetişemem, sen yetiş!`,
    steps: [
      goTo((M) => spawnAt(M, M.special('club', -260, -520), 2.5), 'Gece kulübüne yetiş, bombayı bul!', {
        r: 3, time: 150, timeFail: 'Bomba patladı!',
        onStart(M) {
          const p = spawnAt(M, M.special('club', -260, -520), 2.5);
          const bomb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.35), new THREE.MeshStandardMaterial({ color: 0x2a2a2a }));
          bomb.position.set(p.x, 0.15, p.z); M.object(bomb); M.data.bombPos = p;
          const led = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshBasicMaterial({ color: 0xff0000 })); led.position.set(p.x, 0.34, p.z); M.object(led);
        },
        cond(M) { return !P(M).vehicle; },
      }),
      talk((M) => [
        ['Cin Ali', 'Telefondayım abi! Kapağı aç... İki kablo görüyor musun? Kırmızı ve mavi.', { cam: () => M.camOver(P(M).pos, { x: M.data.bombPos.x, y: -1, z: M.data.bombPos.z })() }],
        ['Cin Ali', M.flag('ally') === 'bogaz' ? 'Kartallar\'ın bombacısı askerden... Onlar hep maviyi toprak yapar. Toprağı kesme, ötekini kes!' : 'Boğaz\'ın çocukları amatör, kabloları renklerine göre bağlarlar: kırmızı ateşleme. Kırmızıyı kes!'],
        {
          who: 'Sen', text: 'Hangi kablo?', key: 'wire',
          choice: [{ label: 'Kırmızı kabloyu kes', value: 'red' }, { label: 'Mavi kabloyu kes', value: 'blue' }],
        },
      ], {
        after(M, r) {
          const w = r.wire || M.data.choice_wire;
          const correct = M.flag('ally') === 'bogaz' ? 'red' : 'red';
          M.timer = 0;
          if (w !== correct) {
            const b = M.data.bombPos;
            M.g.combat.explosion(b.x + 3, 0.5, b.z + 3, 8, 70, null, null);
            M.data.boomed = true;
          } else { M.g.ui.notify('Sayaç durdu: 00:07', 'good'); M.g.audio.success(); }
        },
        done(M) { return M.data.boomed ? 'fail:Yanlış kablo! Bomba patladı.' : 'next'; },
      }),
      step({
        cp: 'Bombacılar',
        place(M) { const p = spawnAt(M, M.special('club', -260, -520), 3); M.place(p.x, p.z, 0); const n = M.node(p.x, p.z); const v = M.car('sedan', n.x + 2.7, n.z + 9, 0, '#333'); v.parked = true; },
        start(M) {
          const foe = enemyGang(M);
          const v = M.gangCar(foe, 3, { min: 50, max: 80, cruise: 24, type: 'sedan', color: '#222222' });
          fleeCar(M, v); v.ai.cruise = 22;
          M.data.bombers = v;
          M.objective('Bombacılar kaçıyor! Arabalarını durdur ve hepsini hallet');
          M.setMarkers([{ vehicle: v, color: 0xff3030 }]);
        },
        update(M) {
          const v = M.data.bombers;
          if (v.crew.some((m) => m.vehicle)) {
            if (v.ai && v.ai.mode === 'traffic' && (v.hp < v.def.hp * 0.45 || v.speed < 0.5 && M.distTo({ pos: v.pos }) < 20)) { v.ai = { mode: 'direct', target: P(M).pos, cruise: 0 }; v.dropT = 99; }
            if (M.distTo({ pos: v.pos }) > 300) return 'fail:Bombacılar kaçtı!';
          }
          const alive = M.updateGangCars();
          if (!v.crew.some((m) => m.vehicle)) M.setMarkers(v.crew.filter((n) => !n.dead).map((n) => ({ actor: n, color: 0xff3030 })));
          return alive === 0 ? 'next' : null;
        },
      }),
      talk(() => [['Cin Ali', 'Yetiştim abi! Şükür... Ama bir şey var: kulübün güvenlik kamerası bozuktu. Kim bozdu dersin? Anahtarı sadece Kenan\'da var.']]),
    ],
  },
  {
    id: 'pusu', act: 2, title: 'Konakta Pusu', reward: 35000, respect: 260, call: 'Reis Baba', short: 'Kurtlar konağı basıyor; Reis vuruldu.',
    brief: 'Evlat, eve gel. Konuşmamız lazım. Kenan... Yok, telefonda olmaz. Gel.',
    check(M) { if (M.data.reisN && M.data.reisN.dead) return 'fail:Reis Baba öldü!'; return null; },
    konak(M, ctx, I, reis) {
      if (M.stepIdx > 1) return;
      M.data.att = [];
      const look = () => ({ ...randomLook(ctx.rng, 'gang'), topColor: GANGS.kurtlar.color, hat: 'bere', hatColor: '#222' });
      for (const [x, z] of [[-6, 4], [6, 4], [-5, -1], [5, -1], [-3, 5.5], [3, 5.5], [-6.5, -5], [6.5, -5]]) {
        const n = I.npc(ctx, 'guard', x, z, Math.PI, { gang: 'kurtlar', mission: true, weapon: x > 0 ? 'ak' : 'shotgun', look: look() });
        n.static = false; n.hostile = true; n.engage(M.g.player, 1.8); M.data.att.push(n);
      }
      if (reis) { reis.god = true; M.data.reisIn = reis; }
    },
    steps: [
      enter('konak', 'Konağa git', { pick: konakDoor }),
      killAll('att', 'Konağı basan Kurtlar\'ı temizle!', {
        start0: true,
        tick(M) { if (!P(M).inInterior) return 'fail:Konaktan çıktın!'; return null; },
      }),
      talk((M) => [
        ['Leyla', 'Baba! Baba, beni duyuyor musun? Vurulmuş! Kanıyor!', { cam: () => M.camOver(P(M).pos, { x: 0, y: 0, z: -5.2 })() }],
        ['Reis Baba', 'Kızım... sus. Evlat, gel buraya... Kenan nerede? Kenan... bu gece burada değildi...'],
        ['Sen', 'Konuşma Reis. Seni hastaneye götürüyorum. Leyla, kapıyı aç!'],
      ], { after(M) { if (!M.replay) M.setFlag('reisWounded', true); } }),
      step({
        start(M) { M.objective('Reis Baba\'yı dışarı çıkar'); },
        update(M) { return P(M).inInterior ? null : 'next'; },
      }),
      step({
        cp: 'Hastane yolu', time: 180, timeFail: 'Reis Baba çok kan kaybetti...',
        place(M) { const k = konakDoor(M); const p = spawnAt(M, k, 3); M.place(p.x, p.z, 0); },
        start(M) {
          const p = P(M).pos;
          const n = M.node(p.x, p.z);
          const car = M.car('sedan', n.x + 2.7, n.z + 9, 0, '#111111');
          const reis = M.npc('boss', p.x + 1.2, p.z, { name: 'Reis Baba', look: { ...randomLook(rng, 'boss'), hat: 'none', hairColor: '#cccccc' }, hp: 260, state: 'follow' });
          reis.ally = true; reis.walkSpeed = 1; M.escort(reis); M.data.reisN = reis;
          const l = M.npc('civilian', p.x - 1.2, p.z, { name: 'Leyla', look: LEYLA_LOOK(), hp: 300, state: 'follow' }); l.ally = true; M.escort(l);
          M.data.car = car;
          M.goto(M.special('hospital', -480, 10), 'Reis Baba\'yı hastaneye yetiştir!', 6);
          M.s.t = 0;
        },
        update(M, dt) {
          M.s.t += dt;
          if (!M.s.amb && M.s.t > 12 && P(M).vehicle) { M.s.amb = true; M.gangCar('kurtlar', 3, { cruise: 27 }); M.dialog([['Leyla', 'Arkada iki araba! Kurtlar işini bitirmeye geliyor!']]); }
          if (M.s.amb) M.updateGangCars();
          const h = M.special('hospital', -480, 10);
          if (M.reached(h.door.x, h.door.z + (h.door.nz || 1) * 4, 14) && M.distTo(M.data.reisN) < 14) return 'next';
          return null;
        },
      }),
      talk(() => [['Leyla', 'Doktorlar ameliyata aldı. Yaşayacak... diyorlar. Kenan\'ı aradım, telefonu kapalı.'], ['Sen', 'Kurtlar bir daha gelecek Leyla. Bu sefer hazır olacağız.']]),
    ],
  },
  {
    id: 'hastane', act: 2, title: 'Hastane Nöbeti', reward: 35000, respect: 260, giver: 'Leyla', short: 'Hastaneyi Kurtlar\'ın dalgalarına karşı koru.',
    brief: 'Kurtlar babamın hâlâ yaşadığını öğrenmiş. Hastanenin kapısını tutmamız lazım. Aile adamlarını topladım. Kapıdan içeri tek bir kurt girmeyecek.',
    steps: [
      goTo((M) => spawnAt(M, M.special('hospital', -480, 10), 4), 'Hastaneye git', { r: 6 }),
      step({
        cp: 'Kapı savunması',
        place(M) { const p = spawnAt(M, M.special('hospital', -480, 10), 5); M.place(p.x, p.z, 0); },
        start(M) {
          const p = spawnAt(M, M.special('hospital', -480, 10), 3);
          for (let i = 0; i < 3; i++) M.ally(p.x - 3 + i * 3, p.z + 2, { state: 'guard', baseState: 'guard', home: new THREE.Vector3(p.x - 3 + i * 3, 0, p.z + 2), weapon: i === 1 ? 'shotgun' : 'ak' });
          M.g.player.armor = Math.max(M.g.player.armor, 60);
          M.waves({ x: p.x, z: p.z, gang: 'kurtlar', waves: [4, 5, 7], defendHp: 100, defendR: 7, hpLabel: 'HASTANE KAPISI', failText: 'Kurtlar hastaneye girdi!', title: 'Hastane kapısını tut', weapons: ['ak', 'shotgun', 'uzi', 'pistol'],
            boss: (M2) => { const s = M2.walk(p.x, p.z, 45, 60); return M2.enemy('kurtlar', s.x, s.z, { kind: 'boss', name: 'Kurt Yüzbaşı', weapon: 'm4', hp: 450 }); } });
          M.dialog([['Leyla', 'Geliyorlar! Kapıdan yedi adımdan fazla yaklaşan olursa vur!']]);
        },
        update(M, dt) { const r = M.updateWaves(dt); return r === 'done' ? 'next' : r; },
        cleanup(M) { M.dialogue.meter(null); },
      }),
      talk(() => [['Leyla', 'Bitti... Babam uyandı. Kenan hâlâ yok. Artık bilmem lazım: kardeşim nerede ve kimin yanında?']]),
    ],
  },
  {
    id: 'defter', act: 2, title: 'Kirli Defter', reward: 40000, respect: 280, giver: 'Leyla', short: 'Kenan\'ın ihanetinin kanıtı.',
    brief: (M) => (M.flag('sinan') === 'spare'
      ? 'Telefon geldi: Sinan! Bağışladığın adam. "Borcumu ödeyeceğim" diyor. Üsküdar\'daki çay ocağında bekliyormuş, elinde defterin aslı var.'
      : 'Sinan\'ın defterinin kopyası Komiser Nevzat\'ın kasasında. Emniyete gir, kimseye görünmeden defteri al. Görünürsen... kaç.'),
    check(M) { if (M.data.sinanN && M.data.sinanN.dead) return 'fail:Sinan öldürüldü!'; return null; },
    steps: [
      // dal: Sinan yaşıyorsa eskort, öldüyse emniyette gizlilik
      step({ update(M) { return M.flag('sinan') === 'spare' || M.data.choice_sinan === 'spare' ? 1 : 5; } }),
      goTo((M) => spawnAt(M, M.special('cafe', 560, -720), 3), 'Üsküdar\'daki çay ocağında Sinan ile buluş', {
        r: 5,
        onStart(M) { const p = spawnAt(M, M.special('cafe', 560, -720), 2); const s = M.npc('civilian', p.x, p.z, { name: 'Sinan', hp: 260, state: 'idle', lookOver: { top: 'suit', topColor: '#5a4a3a', glasses: true, hair: 'kel', beard: 'mustache' } }); s.ally = true; M.data.sinanN = s; },
      }),
      talk((M) => [
        ['Sinan', 'Geldin... Sana borcum vardı. Al şu defteri. Her sayfada Kenan\'ın imzası var. Kurtlar\'a liman ihalesi, Nevzat\'a aylık zarf...', { cam: M.camBetween(P(M), M.data.sinanN, 1) }],
        ['Sinan', 'Yedi yıl önce seni ele veren de oydu. Nevzat\'a adresi Kenan verdi.'],
        ['Sinan', 'Bak! Şu siyah araba... Peşimdeydiler! Beni buradan çıkar!'],
      ], { after(M) { if (!M.replay) M.setFlag('ledger', true); M.escort(M.data.sinanN); } }),
      step({
        cp: 'Sinan\'ı koru',
        place(M) { const p = spawnAt(M, M.special('cafe', 560, -720), 4); M.place(p.x, p.z, 0); if (!M.data.sinanN || M.data.sinanN.dead) { const s = M.npc('civilian', p.x + 1, p.z, { name: 'Sinan', hp: 260, lookOver: { top: 'suit', topColor: '#5a4a3a', hair: 'kel' } }); s.ally = true; M.data.sinanN = s; M.escort(s); } },
        start(M) {
          const p = P(M).pos;
          M.data.hit = M.squad('kurtlar', p.x + 25, p.z + 18, 5, { weapons: ['uzi', 'ak', 'pistol'], delay: 1.5 });
          const n = M.node(p.x, p.z); M.car('kartal', n.x + 2.7, n.z - 10, 0);
          M.setMarkers(M.data.hit.map((h) => ({ actor: h, color: 0xff3030 })));
          M.objective('Kurtlar\'ın tetikçilerinden Sinan\'ı koru');
        },
        update(M) { return M.allDead(M.data.hit) ? 'next' : null; },
      }),
      { ...enter('safehouse', 'Sinan\'ı güvenli eve götür', { near: [-300, -60] }), update(M) { return M.inside('safehouse') ? 8 : null; } },
      // (5) Sinan öldüyse: emniyette gizlilik
      enter('police', 'Emniyet müdürlüğüne gir (aranmadan!)', {
        near: [-620, -120], need0: true,
        populate(M, ctx, I) {
          M.data.watch = [];
          const pts = [[[-5, 2], [5, 2]], [[6, -3], [6, 3]], [[-6, -2], [-2, -2]]];
          for (const pt of pts) { const c = I.npc(ctx, 'cop', pt[0][0], pt[0][1], 0, { mission: true, state: 'patrol', baseState: 'patrol', patrol: pt.map(([x, z]) => ({ x, z })) }); c.static = false; M.data.watch.push(c); }
          const desk = I.box(ctx, 1.6, 0.8, 0.8, 6, 0, -5.2, new THREE.MeshStandardMaterial({ color: 0x3a2412 }));
          void desk;
          ctx.interact.push({ x: 6, z: -4.3, r: 1.4, label: 'Nevzat\'ın kasasını aç (defter)', cond: () => !M.data.gotLedger, action: () => { M.data.gotLedger = true; M.g.ui.notify('Defter alındı!', 'good'); } });
        },
      }),
      step({
        start(M) { M.objective('Komiserin kasasına görünmeden ulaş (sağ arka köşe) — C ile çömel'); },
        update(M, dt) {
          if (!P(M).inInterior) return M.data.gotLedger ? 'next' : 'fail:Emniyetten çıktın!';
          if (!M.s.spotted && M.stealth(M.data.watch || [], dt, { range: 14 })) {
            M.g.wanted.add(3, true);
            for (const c of M.data.watch) c.engage(P(M), 0.8);
            M.g.ui.notify('Fark edildin! Defteri al ve kaç!', 'warn');
          }
          if (M.data.gotLedger) { M.dialogue.meter(null); M.objective('Emniyetten çık'); if (!M.replay) M.setFlag('ledger', true); }
          return null;
        },
        cleanup(M) { M.dialogue.meter(null); },
      }),
      step({
        start(M) { M.objective(M.g.wanted.level ? 'Polisi atlat' : 'Uzaklaş'); },
        update(M) { return M.g.wanted.level === 0 ? 'next' : null; },
      }),
      talk((M) => [
        ['Leyla', 'Defteri okudum. Her sayfada Kenan... Kurtlar\'la ortak. Liman ihalesi, Nevzat\'ın zarfları, babamın vurulduğu gece.'],
        ['Leyla', 'Babamı vurduran... kendi oğlu. Benim kardeşim.'],
        ['Sen', 'Yedi yıl önce beni de o sattı. Kara Yılan doğru söylemiş: "Evin içinden biri."'],
        ['Leyla', M.flag('sinan') === 'spare' ? 'Sinan\'ı bağışlaman bize defterin aslını getirdi. Bunu unutmayacağım.' : 'Bunun bedelini ödeyecek. Ama önce kanıtı sağlama alalım.'],
      ]),
    ],
  },
  {
    id: 'sorgu', act: 2, title: 'Sorgu Odası', reward: 38000, respect: 260, giver: 'Leyla', short: 'Topal Kemal\'i yakala ve konuştur.',
    brief: 'Kurtlar\'ın sağ kolu Topal Kemal, Kadıköy\'den Üsküdar\'a geçiyor. Onu canlı istiyorum. Bozkurt Selim\'in silahları nereden aldığını o bilir.',
    steps: [
      step({
        start(M) {
          const g = M.g;
          const s = M.roadSpot(700, 300, 0, 80);
          const car = M.car('sedan', s.x, s.z, s.h, '#3a1a1a');
          const k = M.npc('gang', s.x, s.z, { name: 'Topal Kemal', gang: 'kurtlar', hp: 260, weapon: 'pistol', lookOver: { topColor: GANGS.kurtlar.color, beard: 'full' } });
          k.scriptKill = true; board(M, k, car); fleeCar(M, car); car.ai.cruise = 16; car.ai.panic = 0;
          M.data.k = k; M.data.car = car;
          M.setMarkers([{ vehicle: car, color: 0xff3030 }]);
          M.objective('Topal Kemal\'in arabasını bul (Kadıköy) ve durdur — öldürme!');
          g.setGps(s.x, s.z);
        },
        update(M, dt) {
          const k = M.data.k;
          if (M.data.car.ai) M.data.car.ai.panic = M.distTo(M.data.car) < 50 ? 999 : 0;
          M.g.setGps(M.data.car.pos.x, M.data.car.pos.z);
          const r = chaseTarget(M, k, M.data.car, dt, { lose: 400, footText: 'Kemal kaçıyor! Yakala' });
          if (r === 'dead') return 'fail:Kemal öldü! Onu canlı lazım.';
          if (r === 'lost') return 'fail:Kemal kaçtı!';
          if (r === 'caught') return 'next';
          return null;
        },
      }),
      step({
        cp: 'Kemal\'i tamirhaneye götür',
        place(M) {
          const p = M.roadSpot(700, 300, 0, 40); M.place(p.x, p.z, p.h);
          const k = M.npc('gang', p.x + 2, p.z, { name: 'Topal Kemal', gang: 'kurtlar', hp: 260, lookOver: { topColor: GANGS.kurtlar.color } }); k.scriptKill = true; M.data.k = k;
        },
        start(M) {
          const k = M.data.k;
          k.god = true; k.state = 'follow'; k.ally = true; k.weapons = { fists: k.weapons.fists }; k.setWeapon('fists');
          M.escort(k);
          const p = P(M).pos, n = M.node(p.x, p.z);
          if (!P(M).vehicle) M.car('kartal', n.x + 2.7, n.z + 9, 0, '#2a2a2a');
          M.goto(M.special('garage', 900, 700), 'Kemal\'i Kadıköy\'deki tamirhaneye götür', 6);
        },
        update(M) {
          if (M.inside('garage')) return 'next';
          return null;
        },
        populate(M, ctx, I) {
          if (ctx.type !== 'garage') return;
          const k = I.npc(ctx, 'resident', 0, -1, Math.PI, { name: 'Topal Kemal', look: { ...randomLook(ctx.rng, 'gang'), topColor: GANGS.kurtlar.color } });
          k.sitting = true; k.god = true; M.data.kIn = k;
          M.data.aliIn = I.npc(ctx, 'resident', 2, -2, -1, { name: 'Cin Ali', look: ALI_LOOK() });
        },
      }),
      talk((M) => [
        ['Topal Kemal', 'Konuşmam. Kurtlar konuşmaz. Bozkurt Selim dilimi keser.', { cam: () => M.camOver(P(M).pos, { x: 0, y: 0, z: -1 })() }],
        {
          who: 'Sen', text: 'Nasıl konuşturacaksın?', key: 'sorgu',
          choice: [
            { label: 'Tehdit et: "Dilini Bozkurt keser, gerisini ben."', value: 'tehdit', hint: '+Saygınlık', lines: [['Sen', 'Ali, matkabı getir.'], ['Cin Ali', 'Hangi uç abi? Beton ucu mu, ahşap ucu mu?'], ['Topal Kemal', 'Tamam! Tamam, durun!']] },
            { label: 'Rüşvet ver: ₺5.000 ve bir otobüs bileti', value: 'rusvet', hint: '-₺5.000', disabled: () => M.g.state.money < 5000, offHint: 'Yeterli paran yok', lines: [['Sen', 'Al şu zarfı. Anadolu\'ya bir bilet, yeni bir hayat.'], ['Topal Kemal', 'Yeni hayat ha... Bu şehirde kimsenin yeni hayatı olmaz. Ama zarf güzel...']] },
            { label: 'Cin Ali konuşsun', value: 'ali', hint: 'Ali\'nin yöntemleri tuhaftır', lines: [['Cin Ali', 'Kemal abi, senin annen Tarlabaşı\'nda börekçi değil mi? Ben her sabah oradan alırım. Çok selam söylüyor sana.'], ['Topal Kemal', '...Anneme dokunmayın. Anlatacağım.']] },
          ],
        },
        ['Topal Kemal', 'Bozkurt Selim silahları kışladan alıyor. İkmalde bir çavuş var, parayı alır, sandıkları "kayıp" yazar.'],
        ['Topal Kemal', 'Büyük sevkiyat Haydarpaşa tarafındaki limanda, konteynerde. Kenan Bey parasını peşin ödedi... Boğaz\'ı alacaklar.'],
      ], { after(M, r) { const v = r.sorgu; if (v === 'rusvet') M.g.state.money -= 5000; if (v === 'tehdit') M.g.state.respect += 30; } }),
    ],
  },
  {
    id: 'konteyner', act: 2, title: 'Konteyner', reward: 45000, respect: 300, call: 'Cin Ali', short: 'Limandaki Kurtlar konteynerini kaçır.',
    brief: 'Abi, Kemal\'in dediği konteyneri buldum! Kadıköy limanında, altı konteyner var, biri silah dolu. Kurtlar başında bekliyor. Kamyonu alıp Fatih\'teki depoya götürürsek savaşın yarısını kazanırız!',
    check(M) { if (M.data.truck && M.data.truck.destroyed) return 'fail:Kamyon patladı!'; return null; },
    steps: [
      goTo((M) => { const w = M.special('warehouse', 950, 780); return spawnAt(M, w, 30); }, 'Kadıköy limanına git', { r: 30 }),
      step({
        cp: 'Liman',
        place(M) { const w = M.special('warehouse', 950, 780); const p = spawnAt(M, w, 55); M.place(p.x, p.z, 0); },
        start(M) {
          const w = M.special('warehouse', 950, 780);
          const c = spawnAt(M, w, 14);
          const spots = buildContainers(M, c.x, c.z);
          M.data.spots = spots;
          M.data.right = 4;
          M.data.guards = [];
          for (let i = 0; i < 7; i++) { const s = spots[i % spots.length]; M.data.guards.push(M.enemy('kurtlar', s.x + (i % 2 ? 3 : -3), s.z + 2, { state: 'patrol', baseState: 'patrol', patrol: [{ x: s.x - 4, z: s.z + 2 }, { x: s.x + 4, z: s.z + 2 }], weapon: i % 3 ? 'ak' : 'shotgun' })); }
          M.data.truck = M.car('dolmus', c.x + 14, c.z + 6, 0, '#5a5a5a');
          M.data.truck.parked = true;
          M.setMarkers(spots.map((s) => ({ x: s.x, z: s.z, color: 0xffaa30, r: 1.2 })));
          M.objective('Silah dolu konteyneri bul (mühürleri kontrol et). Gizli kal ya da hepsini temizle.');
        },
        update(M, dt) {
          if (!M.s.spotted && M.stealth(M.data.guards, dt)) { for (const n of M.data.guards) n.engage(P(M), 0.8); M.g.ui.notify('Kurtlar seni gördü!', 'warn'); }
          M.data.spots.forEach((s, i) => {
            if (M.reached(s.x, s.z, 1.8) && !s.checked) M.prompt('Mührü kır', () => {
              s.checked = true;
              if (i === M.data.right) { M.g.ui.notify('Silah sandıkları! Bu konteyner!', 'good'); M.data.found = true; }
              else M.g.ui.notify(['Kaçak çay... Bu değil.', 'Bunun içi boş.', 'Halı balyaları. Değil.', 'Yedek parça. Değil.'][i % 4], 'info');
            });
          });
          return M.data.found ? 'next' : null;
        },
        cleanup(M) { M.dialogue.meter(null); },
      }),
      step({
        start(M) { M.dialogue.meter(null); M.setMarkers([{ vehicle: M.data.truck, color: 0x3080ff }]); M.objective('Kamyona bin (Ali konteyneri bağladı)'); },
        update(M) { return P(M).vehicle === M.data.truck ? 'next' : null; },
      }),
      step({
        cp: 'Kamyon',
        place(M) { const w = M.special('warehouse', 950, 780); const c = spawnAt(M, w, 30); M.place(c.x, c.z, 0); const t = M.car('dolmus', c.x + 3, c.z, 0, '#5a5a5a'); M.data.truck = t; M.g.enterVehicle(t, true); },
        start(M) { M.goto(M.special('warehouse', -40, 250), 'Kamyonu Fatih\'teki depoya götür', 10); M.s.t = 0; M.g.wanted.add(1, true); },
        update(M, dt) {
          M.s.t += dt;
          if (!M.s.a && M.s.t > 10) { M.s.a = true; M.gangCar('kurtlar', 3, { cruise: 28 }); }
          if (!M.s.b && M.s.t > 60) { M.s.b = true; M.gangCar('kurtlar', 3, { cruise: 28 }); }
          M.updateGangCars();
          const w = M.data.target;
          if (P(M).vehicle === M.data.truck && M.reached(w.door.x, w.door.z + (w.door.nz || 1) * 5, 14)) return 'next';
          return null;
        },
      }),
      talk(() => [['Cin Ali', 'Üç yüz tüfek, kırk roketatar, sandık sandık mermi! Bozkurt Selim şu an saçını başını yoluyordur!'], ['Sen', 'Bırak yolsun. Saçı bitince sıra kafasına gelecek.']], { after(M) { M.g.player.giveWeapon('rpg', 4); M.g.player.giveWeapon('m4', 180); } }),
    ],
  },

  // ============================ DÖRDÜNCÜ PERDE · BOĞAZ SAVAŞI ============================
  {
    id: 'kisla', act: 3, title: 'Kışla Baskını', reward: 50000, respect: 320, giver: 'Leyla', stealthBase: true, short: 'Askeri kışladan silah ve araç kaçır.',
    brief: 'Kemal\'in bahsettiği çavuş Kurtlar\'a son sevkiyatı hazırlıyor. Kışladaki cephaneliğe sız, sandıkları al, askeri kamyonla çık. Askerlere görünürsen alarm çalar. Dikkatli ol.',
    steps: [
      goTo((M) => { const m = M.g.military; const z = m.zone; return { x: z.x1 + 22, z: m.cz }; }, 'Kışlanın dışına git (kuzeybatı)', { r: 8 }),
      talk(() => [['Cin Ali', 'Telsizdeyim abi. Nöbet kulelerinde birer asker, yollarda devriye. Çömelerek git, gölgede kal. Cephanelik bölgenin ortasında.'], ['Sen', 'Ali, alarm çalarsa?'], ['Cin Ali', 'O zaman koş abi. Çok hızlı koş.']]),
      step({
        cp: 'Kışlaya sızma',
        place(M) { const m = M.g.military; M.place(m.zone.x1 + 22, m.cz, -Math.PI / 2); },
        start(M) {
          const m = M.g.military;
          if (!m.active) { m.active = true; m.spawnGarrison(); }
          const a = m.armory;
          if (a) M.goto(a, 'Cephaneliğe görünmeden ulaş ve içeri gir', 3);
        },
        update(M, dt) {
          const m = M.g.military;
          if (!m.alert && M.stealth(m.soldiers, dt, { range: 26 })) m.raiseAlert('Sızma tespit edildi!');
          if (m.alert) M.dialogue.meter(null);
          return M.inside('armory') ? 'next' : null;
        },
        cleanup(M) { M.dialogue.meter(null); },
      }),
      step({
        populate(M, ctx, I) {
          M.data.crates = 0;
          for (const [x, z] of [[-3, -3], [0, -3.5], [3, -3]]) {
            ctx.interact.push({ x, z: z + 1, r: 1.2, label: 'Sandığı al', cond: () => !ctx['c' + x], action: () => { ctx['c' + x] = true; M.data.crates++; M.g.audio.cash(); } });
          }
        },
        start(M) { M.dialogue.meter(null); M.objective('3 silah sandığını al'); },
        update(M) {
          if (!P(M).inInterior) return M.data.crates >= 3 ? 'next' : null;
          if (M.data.crates >= 3) M.objective('Cephanelikten çık');
          return null;
        },
      }),
      step({
        cp: 'Kaçış',
        place(M) { const a = M.g.military.armory; if (a) M.place(a.door.x, a.door.z + (a.door.nz || 1) * 2, 0); },
        start(M) {
          const g = M.g, m = g.military;
          g.player.giveWeapon('m4', 240); g.player.giveWeapon('grenade', 5); g.player.giveWeapon('rpg', 3);
          g.ui.notify('Taarruz tüfeği, el bombası, roketatar!', 'good');
          m.raiseAlert('Cephanelik soyuldu!');
          // helikopter varsa onu, yoksa askeri kamyonu kaçır
          const a = m.armory, ax = a ? a.door.x : m.cx, az = a ? a.door.z + 6 : m.cz;
          const n = M.node(ax, az);
          const type = CARS.heli ? 'heli' : 'swat'; // helikopter türü eklenirse onu kaçır
          const v = M.car(type, n.x + 2.7, n.z + 8, 0, '#4a5a30'); v.military = true; v.stolen = true; v.parked = true;
          M.data.truck = v;
          M.setMarkers([{ vehicle: v, color: 0x3080ff }]);
          M.objective('Askeri zırhlıyı kaçır ve kışladan çık!');
        },
        update(M) {
          const m = M.g.military;
          if (P(M).vehicle === M.data.truck && !m.inZone(P(M).pos.x, P(M).pos.z, 40)) return 'next';
          return null;
        },
      }),
      enter('safehouse', 'Güvenli eve dön', { near: [-300, -60] }),
      talk(() => [['Leyla', 'Askerî zırhlı... Sen gerçekten delisin. Ama artık Kurtlar\'dan güçlüyüz.']]),
    ],
  },
  {
    id: 'banka', act: 3, title: 'Büyük Vurgun', reward: 80000, respect: 300, giver: 'Leyla', short: 'Savaş kasası için banka soygunu.',
    brief: 'Savaşın parası lazım. Nevzat Kurtlar\'ın parasını Beşiktaş\'taki bankanın kasa dairesinde tutuyor. O parayı alırsak hem biz güçleniriz hem o zayıflar. Kasa dairesini del, polisle çatış ve kaç.',
    steps: [
      enter('bank', 'Beşiktaş\'taki bankaya gir', {
        near: [-350, -420],
        populate(M, ctx, I) {
          for (const n of M.g.npcs.list) if (n.faction === 'civilian' && !n.dead) { n.state = 'surrender'; }
          M.data.ctx = ctx;
          ctx.interact.push({ x: 0, z: -4.9, r: 1.5, label: 'Kasa dairesini del', cond: () => !M.data.drill, action: () => { M.data.drill = 0.001; } });
          void I;
        },
      }),
      step({
        start(M) { M.objective('Kasa dairesini del (arka duvar)'); M.big('SOYGUN!', 'Herkes yere!', 'red', 2); },
        update(M, dt) {
          const g = M.g;
          if (!P(M).inInterior) return 'fail:Bankadan çıktın!';
          if (!M.data.drill) return null;
          M.data.drill += dt / 40;
          M.dialogue.meter('KASA MATKABI', M.data.drill, '#d4af37');
          M.objective('Matkap çalışıyor — polisi kapıdan uzak tut!');
          M.s.wt = (M.s.wt || 3) - dt;
          if (M.s.wt <= 0) {
            M.s.wt = 9;
            const ctx = M.data.ctx;
            const kind = M.data.drill > 0.5 ? 'swat' : 'cop';
            for (let i = 0; i < 2; i++) {
              const n = g.interiors.npc(ctx, kind === 'swat' ? 'cop' : 'cop', -1 + i * 2, 4.8, Math.PI, { mission: true, weapon: kind === 'swat' ? 'm4' : 'pistol' });
              n.static = false; if (kind === 'swat') { n.armor = 100; n.skill = 0.3; }
              g.wanted.set(Math.max(g.wanted.level, kind === 'swat' ? 4 : 3));
              n.engage(g.player, 1.2);
            }
          }
          if (M.data.drill >= 1) { M.dialogue.meter(null); g.state.money += 60000; g.state.stats.robberies++; g.ui.notify('Kasa dairesi açıldı! +₺60.000', 'money'); return 'next'; }
          return null;
        },
        cleanup(M) { M.dialogue.meter(null); },
      }),
      step({ start(M) { M.objective('Bankadan çık'); }, update(M) { if (!P(M).inInterior) { M.g.wanted.set(4); return 'next'; } return null; } }),
      step({
        cp: 'Kaçış',
        place(M) { const b = M.special('bank', -350, -420); const p = spawnAt(M, b, 3); M.place(p.x, p.z, 0); M.g.wanted.set(4); },
        start(M) { M.objective('Barikatları aş, polisi atlat!'); M.setMarkers([]); M.g.setGps(null); },
        update(M) { return M.g.wanted.level === 0 ? 'next' : null; },
      }),
      talk(() => [['Leyla', 'Altmış bin... Nevzat\'ın aylık zarfları bundan çıkıyormuş. Şimdi Kurtlar\'a ödeme yapamayacak. Paniğe kapılacak.']]),
    ],
  },
  {
    id: 'nevzat', act: 3, title: 'Komiserin Sonu', reward: 60000, respect: 340, giver: 'Leyla', short: 'Nevzat\'ın konvoyu ve hesaplaşma.',
    brief: (M) => `Nevzat paniğe kapıldı, konvoyla şehirden kaçıyor. Konvoyu durdur, onu arabadan indir. ${M.flag('ledger') ? 'Elimizde defter var; istersen onu savcıya teslim ederiz.' : 'Elimizde kanıt yok... ne yapacağına sen karar vereceksin.'}`,
    steps: [
      step({
        start(M) {
          const g = M.g;
          const s = M.roadSpot(-300, -860, 0, 50);
          const car = M.car('sedan', s.x, s.z, s.h, '#1a1a1a');
          const nev = M.npc('civilian', s.x, s.z, { name: 'Komiser Nevzat', look: NEVZAT_LOOK(), hp: 300, weapon: 'revolver' });
          nev.scriptKill = true; board(M, nev, car); fleeCar(M, car); car.ai.cruise = 18;
          M.data.nev = nev; M.data.car = car;
          const esc = [];
          for (const k of [-1, 1]) { const v = M.car('police', s.x + Math.sin(s.h) * 10 * k, s.z + Math.cos(s.h) * 10 * k, s.h); v.sirenOn = true; v.police = true; v.ai = { mode: 'direct', target: car.pos, cruise: 20 }; esc.push(v); }
          M.data.esc = esc;
          M.setMarkers([{ vehicle: car, color: 0xff3030 }]);
          M.objective('Nevzat\'ın aracını durdur (konvoy Beşiktaş\'tan çıkıyor)');
          g.setGps(s.x, s.z);
        },
        update(M, dt) {
          for (const v of M.data.esc) if (v.ai && v.ai.mode === 'direct') v.ai.target = M.data.car.pos;
          M.g.setGps(M.data.car.pos.x, M.data.car.pos.z);
          if (!M.s.w && M.distTo(M.data.car) < 60) { M.s.w = true; M.g.wanted.set(3); M.data.cops = M.data.esc.length; }
          const r = chaseTarget(M, M.data.nev, M.data.car, dt, { lose: 420, footText: 'Nevzat yaya kaçıyor! Yakala' });
          if (r === 'dead') { if (!M.replay) M.setFlag('nevzat', 'olum'); return 2; }
          if (r === 'lost') return 'fail:Nevzat kaçtı!';
          if (r === 'caught') return 'next';
          return null;
        },
      }),
      talk((M) => [
        ['Komiser Nevzat', 'Dur! Dur evlat... Konuşalım. Ben devletin adamıyım, beni vurursan bu şehir sana dar gelir.', { cam: M.camBetween(P(M), M.data.nev, 1) }],
        ['Sen', 'Yedi yıl, Nevzat. Yedi yıl boyunca her sabah bu anı düşündüm.'],
        ['Komiser Nevzat', 'Kenan verdi seni! Ben sadece işimi yaptım! Para verdi, adres verdi... Ben ne yapayım?'],
        {
          who: 'Sen', text: 'Nevzat\'ın kaderi:', key: 'nevzat',
          choice: [
            { label: 'Defteri savcıya teslim et — parmaklıkların arkasında çürüsün', value: 'teslim', hint: 'Adalet. Polis bir süre aileye bulaşamaz.', disabled: () => !M.flag('ledger'), offHint: 'Elinde kanıt (defter) yok', lines: [['Sen', 'Seni vurmayacağım. Senin için daha kötüsü var: kendi mahkemen.'], ['Komiser Nevzat', 'Sen... sen bunu yapamazsın! Ben müdürüm!'], ['Sen', 'Çayını şekersiz iç bundan sonra Nevzat. Koğuşta şeker yok.']] },
            { label: 'Hesabı burada kapat', value: 'olum', hint: 'İntikam. Bütün emniyet peşine düşer.', lines: [['Komiser Nevzat', 'Bekle! Bekle...']] },
          ],
        },
      ], {
        after(M, r) {
          const v = r.nevzat || M.data.choice_nevzat;
          const n = M.data.nev;
          n.god = false;
          if (v === 'olum') { n.takeDamage(999, null, 'bullet'); M.g.audio.gunshot('revolver', n.pos.x, n.pos.z); M.g.wanted.set(4); }
          else { M.g.npcs.remove(n); M.big('NEVZAT TUTUKLANDI', 'Savcılık defteri aldı', 'gold', 3); M.g.wanted.reset(); M.g.npcs.calmPolice(); }
        },
      }),
      step({ start(M) { M.objective(M.g.wanted.level ? 'Polisi atlat' : 'Uzaklaş'); }, update(M) { return M.g.wanted.level === 0 ? 'next' : null; } }),
    ],
  },
  {
    id: 'bogaz', act: 3, title: 'Boğaz\'da Kovalamaca', reward: 70000, respect: 360, call: 'Cin Ali', short: 'Bozkurt Selim\'i Boğaz\'ın öbür yakasına kadar kovala.',
    brief: 'Abi! Bozkurt Selim Beşiktaş\'tan köprüye doğru kaçıyor, Üsküdar\'daki inine dönecek! Peşine düş, köprüyü geçmeden ya da geçtikten sonra... ama bitir!',
    steps: [
      step({
        start(M) {
          const g = M.g;
          const s = M.roadSpot(100, -450, 0, 40);
          const car = M.car('suv', s.x, s.z, s.h, '#3a0a0a');
          const b = M.npc('boss', s.x, s.z, { name: 'Bozkurt Selim', gang: 'kurtlar', weapon: 'ak', hp: 650, look: BOSS_LOOK('kurtlar', { hat: 'bere', hatColor: '#222', beard: 'stubble' }) });
          board(M, b, car);
          car.ai = { mode: 'direct', target: { x: 560, z: -450 }, cruise: 22 };
          M.data.b = b; M.data.car = car; M.data.dest = { x: 600, z: -440 };
          M.gangCar('kurtlar', 2, { at: { x: s.x, z: s.z }, min: 10, max: 30, cruise: 24 });
          M.setMarkers([{ vehicle: car, color: 0xff3030 }]);
          M.objective('Bozkurt Selim köprüden kaçıyor! Peşine düş');
          const p = P(M).pos; if (!P(M).vehicle) { const n = M.node(p.x, p.z); M.car('gt', n.x + 2.7, n.z + 9, 0, '#111'); }
          // tekne sistemi varsa: Boğaz'da tekneyle kaçış
          if (g.boats && typeof g.boats.add === 'function') M.data.boats = true;
        },
        update(M, dt) {
          const car = M.data.car, b = M.data.b;
          M.updateGangCars();
          if (car.ai && car.ai.mode === 'direct' && Math.hypot(car.pos.x - car.ai.target.x, car.pos.z - car.ai.target.z) < 20) {
            car.ai = { mode: 'direct', target: { x: 600, z: -380 }, cruise: 16 };
          }
          const r = chaseTarget(M, b, car, dt, { carHp: 0.3, lose: 380, footText: 'Bozkurt arabadan indi!' });
          if (r === 'lost') return 'fail:Bozkurt Selim kaçtı!';
          if (r === 'dead' || (!b.vehicle && b.state === 'flee') || r === 'caught') { b.god = false; return 'next'; }
          if (M.reached(600, -380, 40) && b.vehicle) { car.ai = { empty: true }; b.vehicle = null; b.model.root.visible = true; b.pos.set(car.pos.x + 2, 0, car.pos.z); return 'next'; }
          return null;
        },
      }),
      killAll('foes', 'Bozkurt Selim\'i ve korumalarını indir', {
        cp: 'Üsküdar sahili',
        place(M) { M.place(560, -420, 0); },
        spawn(M) {
          let b = M.data.b;
          const out = [];
          if (!b || b.dead && false) b = null;
          if (!b) { b = M.enemy('kurtlar', 600, -400, { kind: 'boss', name: 'Bozkurt Selim', weapon: 'ak', hp: 650 }); M.data.b = b; }
          if (!b.dead) { b.state = 'attack'; b.hostile = true; b.god = false; b.engage(P(M), 0.6); M.say(b, 'Kurt sürüsüne dalan kuzu sen misin?'); }
          out.push(b);
          for (let i = 0; i < 4; i++) out.push(M.enemy('kurtlar', b.pos.x + 4 + i * 2, b.pos.z + 3, { weapon: i % 2 ? 'ak' : 'shotgun', delay: 1.4 }));
          return out;
        },
      }),
      talk(() => [['Cin Ali', 'Bozkurt düştü abi! Kurtlar başsız kaldı. Şimdi sadece... Kenan kaldı.'], ['Sen', 'Kenan limanda, Kurtlar\'ın son adamlarıyla. Herkesi topla Ali. Yarın Boğaz için savaşıyoruz.']]),
    ],
  },
  {
    id: 'savas', act: 3, title: 'Boğaz İçin Savaş', reward: 100000, respect: 450, short: 'Son savaş: liman ve Kenan.',
    brief: (M) => `Bu son savaş evlat. Aile adamları, ${GANGS[allyGang(M)].name} ve sen. Kadıköy limanı Kurtlar'ın son kalesi; Kenan da orada. Limanı al, depoya gir, kardeşini... bana getir ya da getirme. Karar senin.`,
    steps: [
      goTo((M) => { const w = M.special('warehouse', 950, 780); return spawnAt(M, w, 60); }, 'Kadıköy limanına git, ordun seni bekliyor', { r: 12 }),
      step({
        cp: 'Liman savaşı',
        place(M) { const w = M.special('warehouse', 950, 780); const p = spawnAt(M, w, 60); M.place(p.x, p.z, 0); },
        start(M) {
          const w = M.special('warehouse', 950, 780);
          const p = spawnAt(M, w, 8);
          const ag = allyGang(M);
          const me = P(M).pos;
          for (let i = 0; i < 4; i++) M.ally(me.x - 3 + i * 2, me.z + 2, { weapon: i % 2 ? 'ak' : 'm4' });
          for (let i = 0; i < 3; i++) M.ally(me.x - 2 + i * 2, me.z - 2, { gang: ag, weapon: 'ak', lookOver: { topColor: GANGS[ag].color } });
          const ali = M.ally(me.x + 3, me.z, { name: 'Cin Ali', look: ALI_LOOK(), weapon: 'shotgun', hp: 500 }); ali.god = true;
          M.g.player.armor = 100;
          M.waves({ x: p.x, z: p.z, gang: 'kurtlar', waves: [6, 7, 8], minD: 20, maxD: 45, title: 'Limanı Kurtlar\'dan temizle', weapons: ['ak', 'm4', 'shotgun', 'uzi'] });
          M.dialog([['Leyla', 'Hepiniz beni dinleyin! Bu gece Boğaz\'ın iki yakası bizim olacak! İleri!'], ['Cin Ali', 'Yaşa be! Abi, arkandayım!']]);
        },
        update(M, dt) { const r = M.updateWaves(dt); return r === 'done' ? 'next' : r; },
      }),
      enter('warehouse', 'Depoya gir — Kenan içeride', {
        near: [950, 780],
        populate(M, ctx, I) {
          if (ctx.building !== M.s.b) return;
          M.data.inside = [];
          for (const [x, z] of [[-8, -6], [-4, 2], [5, -3], [8, 3], [-9, 4], [3, 5]]) {
            const n = I.npc(ctx, 'guard', x, z, Math.PI, { gang: 'kurtlar', mission: true, weapon: x > 0 ? 'ak' : 'shotgun', look: { ...randomLook(ctx.rng, 'gang'), topColor: GANGS.kurtlar.color } });
            n.static = false; n.hostile = true; n.engage(M.g.player, 1.5); M.data.inside.push(n);
          }
          const k = I.npc(ctx, 'boss', 0, -7, 0, { name: 'Kenan', mission: true, weapon: 'm4', hp: 900, look: KENAN_LOOK() });
          k.static = false; k.hostile = true; k.gang = 'kurtlar'; k.engage(M.g.player, 2.5);
          M.data.kenan = k; M.data.inside.push(k);
        },
      }),
      step({
        start(M) { M.objective('Kenan\'ı etkisiz hale getir'); if (M.data.kenan) M.setMarkers([{ actor: M.data.kenan, color: 0xff3030 }]); },
        update(M) {
          if (!P(M).inInterior) return 'fail:Depodan çıktın!';
          const k = M.data.kenan;
          if (!k) return null;
          if (k.dead) { if (!M.replay) M.setFlag('kenan', 'oldur'); return 'done'; }
          if (k.hp < k.maxHp * 0.3) { k.god = true; k.state = 'surrender'; k.target = null; for (const n of M.data.inside) if (!n.dead && n !== k) n.takeDamage(999, null, 'bullet'); return 'next'; }
          return null;
        },
      }),
      talk((M) => [
        ['Kenan', 'Tamam! Yeter... Kazandın. Her zamanki gibi. Babamın gözdesi, ailenin kahramanı.', { cam: M.data.kenan ? M.camBetween(P(M), M.data.kenan, 1) : undefined }],
        ['Sen', 'Neden Kenan? Yedi yıl. Babanı vurdurdun.'],
        ['Kenan', 'Babamın "evlat" dediği adam sendin, ben değil! Ben sadece istediğim şeyi aldım. Bu şehirde herkes öyle yapmıyor mu?'],
        ['Leyla', 'Kardeşim... Babam hastanede seni sordu. "Kenan nerede" dedi. Bilmiyordu.'],
        {
          who: 'Sen', text: 'Kenan\'ın kaderi:', key: 'kenan',
          choice: [
            { label: 'Affet — İstanbul\'dan sürgün et, bir daha dönmesin', value: 'affet', hint: 'Aile dağılmaz; Leyla seninle kalır.', lines: [['Sen', 'Git Kenan. Bir gemiye bin, bir daha bu şehre dönme. Dönersen kimse seni kurtaramaz.'], ['Kenan', '...Babama söyle... Hayır. Hiçbir şey söyleme.'], ['Leyla', 'Teşekkür ederim. Babamın bir oğlunu daha toprağa vermesine dayanamazdım.']] },
            { label: 'Hesabı kapat — ihanetin tek bedeli var', value: 'oldur', hint: 'Boğaz\'ın tek babası olursun; ama yalnız.', lines: [['Kenan', 'Leyla... söyle ona...'], ['Leyla', 'Yapma! Yapm—']] },
          ],
        },
      ], {
        after(M, r) {
          const v = r.kenan || M.data.choice_kenan;
          const k = M.data.kenan;
          if (!k) return;
          k.god = false;
          if (v === 'oldur') { k.takeDamage(9999, null, 'bullet'); M.g.audio.gunshot('pistol', k.pos.x, k.pos.z); }
          else { M.g.npcs.remove(k); }
        },
      }),
    ],
    onComplete(M) { if (!M.replay) { M.g.state.territories.kurtlar = true; M.setFlag('reisBack', true); } },
  },
  {
    id: 'son', act: 3, title: 'Boğaz\'ın Babası', reward: 150000, respect: 600, credits: true, short: 'Final: Galata\'dan İstanbul\'a bakış.',
    brief: 'Taburcu oldum evlat. Konağa uğradın, sağ ol. Şimdi Galata Kulesi\'ne çık. Leyla seni orada bekliyor. Bu şehre bir kez de yukarıdan bak.',
    steps: [
      goTo((M) => { const g = M.g.galata || { cx: -110, cz: 10, R: 6.5 }; return { x: g.cx, z: g.cz + g.R + 3 }; }, 'Galata Kulesi\'ne git', { r: 4 }),
      step({
        start(M) {
          const g = M.g;
          g.state.money += 50; g.goGalataTop();
          g.env.time = 20.5;
          const G = g.galata;
          const l = M.npc('civilian', G.cx + 1.2, G.cz + G.R * 0.55 + 2, { name: 'Leyla', look: LEYLA_LOOK(), state: 'idle', y: 47.2 });
          l.pos.y = 47.2; l.god = true; M.data.l = l;
        },
        update() { return 'next'; },
      }),
      talk((M) => {
        const f = M.flags;
        const G = M.g.galata || { cx: -110, cz: 10 };
        const ending = f.kenan === 'oldur' ? (f.nevzat === 'olum' ? 'DEMİR YUMRUK' : 'BOĞAZ\'IN BABASI') : (f.nevzat === 'teslim' ? 'ADALET' : 'AİLE');
        M.data.ending = ending;
        return [
          ['Leyla', 'Bak şuraya... Haliç, Boğaz, Kız Kulesi. Babam bu manzarayı otuz yıl önce Hacı\'dan, Doğan\'dan, herkesten önce sevmiş.', { cam: () => M.camWide(G.cx + 12, 52, G.cz + 18, G.cx + 200, 20, G.cz + 200) }],
          ['Leyla', f.kenan === 'affet' ? 'Kenan\'ı bağışladın. Babam bunu duyunca ağladı. Yıllardır ilk defa.' : 'Kenan\'ı... Babam bir şey demedi. Sadece pencereden denize baktı, bütün gün.'],
          ['Leyla', f.nevzat === 'teslim' ? 'Nevzat\'ın davası gazetelerde. Savcı "Bu daha başlangıç" diyor. Bize dokunamıyorlar; çünkü defteri biz verdik.' : f.nevzat === 'olum' ? 'Nevzat\'ın yerine gelen müdür zarfını açtı, kapattı, cebine koydu. Bu şehir değişmiyor.' : 'Nevzat ortadan kayboldu. Kimse aramıyor.'],
          ['Leyla', f.sinan === 'spare' ? 'Sinan Ege\'de bir balıkçı kasabasında. Mektup yollamış: "Borcum ödendi."' : 'Sinan\'ın karısı konağa geldi dün. Babam ona bir zarf verdi. Hiçbir şey sormadı.'],
          ['Reis Baba', 'Telefondayım çocuklar... Evlat, bundan sonra aile senin. Kural ne, onu da sen koyacaksın.', { cam: () => M.camOver(P(M).pos, { x: G.cx + 100, y: -40, z: G.cz + 100 })() }],
          ['Sen', f.kenan === 'oldur' ? 'Bu şehirde kimseye güvenmeyeceğim Reis. Ne kardeşe, ne dosta. Kurallar benim.' : 'Bu şehir kimsenin değil Reis. Ama bundan sonra kurallar bizim; ve ilk kural: ihanet etmeyene ihanet edilmez.'],
          ['Leyla', `Bilir misin, mahallede sana yeni bir isim takmışlar...`],
          ['Sen', `Biliyorum. ${ending}.`],
        ];
      }),
    ],
    onComplete(M) { const e = M.data.ending || 'SON'; setTimeout(() => M.g.ui.bigMessage(e, 'İstanbul Mafya · Hikâye tamamlandı', 'gold', 6), 4200); },
  },
];

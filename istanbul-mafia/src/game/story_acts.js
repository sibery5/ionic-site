// İSTANBUL MAFYA 1.4 — hikâye yayının yeni görevleri.
//   İkinci Perde (Sınavlar): Gölge (gözetleme + takip), Sadakat (ahlaki seçimli sadakat sınavı)
//   Beşinci Perde (Gizli Masa): Gizli Masa (gözetim altında gizli görüşme), Sorgu (kurtarma), Taht Kavgası (ihanet)
//   Altıncı Perde (Tek Hâkim): Kartalın Düşüşü ve Son Viraj (yaklaşım seçmeli suikast), Beyoğlu'nun Anahtarı
//   (bölge ele geçirme), İstanbul'un Tek Hâkimi (final).
// Adım fabrikaları ve ortak yardımcılar story_data.js'ten H nesnesiyle gelir (döngüsel içe aktarma yok).
// Yeni bayraklar: yasar, sadakat ('infaz'|'kacir'|'reddet'), tahsin ('para'|'bolge'), leylaSoz ('soz'|'yok'),
// conspiracy, kurtarma ('catis'|'kandir'), riza ('olu'), baba ('sur'|'oldur'), babaDown, dogan_yol, murat_yol, finalBoss, son.
import * as THREE from 'three';
import { randomLook } from '../entities/character.js';
import { rng } from '../core/util.js';
import { GANGS } from './economy.js';

const TAHSIN_LOOK = () => ({ ...randomLook(rng, 'gang'), gender: 'm', top: 'leather', topColor: '#2a1a12', hair: 'kel', beard: 'full', hat: 'none', glasses: false, build: 1.15 });
const RIZA_LOOK = () => ({ ...randomLook(rng, 'civilian'), gender: 'm', top: 'coat', topColor: '#26282c', hair: 'kisa', hairColor: '#2a2420', beard: 'mustache', hat: 'kasket', hatColor: '#1a1a1a', glasses: true });
const NURI_LOOK = () => ({ ...randomLook(rng, 'civilian'), gender: 'm', top: 'suit', topColor: '#6a5a44', hair: 'kel', beard: 'mustache', glasses: true, hat: 'none', build: 0.95 });
const ZEYNEP_LOOK = () => ({ ...randomLook(rng, 'civilian'), gender: 'f', hair: 'uzun', hairColor: '#2a1a10', top: 'tshirt', topColor: '#d8708a', hat: 'none', glasses: false, build: 0.82 });
const CEMIL_LOOK = () => ({ ...randomLook(rng, 'civilian'), gender: 'm', top: 'coat', topColor: '#4a4436', hat: 'kasket', hatColor: '#3a3226', beard: 'stubble', glasses: false });
const YASAR_LOOK = () => ({ ...randomLook(rng, 'civilian'), gender: 'm', top: 'suit', topColor: '#141414', hair: 'kisa', hairColor: '#111', glasses: true, hat: 'none' });

export function buildArc(H) {
  const { enter, goTo, talk, step, P, spawnAt, konakDoor, killAll, chaseTarget, fleeCar, board, LEYLA_LOOK, ALI_LOOK, KENAN_LOOK, BOSS_LOOK, REIS_LOOK } = H;
  const trust = (M) => M.flags.trust ?? 20;
  const susp = (M) => M.flags.susp ?? 0;
  const bump = (M, dt, ds, why) => { if (M.baba) M.baba.adjust(dt, ds, why); };

  // takip: hedef araca ne çok yakın ne çok uzak (gözetim ölçeri)
  function tail(M, car, dt, o = {}) {
    const p = P(M).pos;
    const d = Math.hypot(p.x - car.pos.x, p.z - car.pos.z);
    const near = o.near || 16, far = o.far || 120;
    M.s.close = d < near ? (M.s.close || 0) + dt : Math.max(0, (M.s.close || 0) - dt * 0.6);
    M.s.lost = d > far ? (M.s.lost || 0) + dt : 0;
    const label = d < near ? 'ÇOK YAKINSIN — GERİ ÇEKİL' : d > far * 0.8 ? 'KAYBEDİYORSUN' : 'TAKİP MESAFESİ İYİ';
    M.dialogue.meter(label, Math.max(0.04, 1 - Math.min(1, M.s.close / 4)), d < near || d > far * 0.8 ? '#ff5a46' : '#5ad18a');
    if (M.s.close > 4) { M.dialogue.meter(null); return 'fail:' + (o.closeFail || 'Fark edildin! Takip açığa çıktı.'); }
    if (M.s.lost > (o.lostT || 10)) { M.dialogue.meter(null); return 'fail:' + (o.lostFail || 'İzini kaybettin.'); }
    return null;
  }
  // aracı yol düğümleri boyunca belirli bir hızla sür (race kipi = noktadan noktaya, düşük beceri = sakin hız)
  function driveRoute(M, car, tx, tz, skill = 0.3) {
    const g = M.g;
    const path = g.map.path(car.pos.x, car.pos.z, tx, tz) || [];
    const pts = path.map((n) => ({ x: n.x, z: n.z }));
    if (!pts.length) pts.push({ x: tx, z: tz });
    car.parked = false;
    car.ai = { mode: 'race', points: pts, idx: 0, skill, frozen: false };
    return pts;
  }
  // bir kaldırım/yol üzerindeki aracı yolun yönüne göre konumla
  function parkCar(M, type, x, z, color) { const s = M.roadSpot(x, z, 0, 30); const v = M.car(type, s.x, s.z, s.h, color); v.parked = true; return v; }
  const execute = (M, n, w = 'revolver') => { if (!n) return; n.god = false; n.takeDamage(9999, null, 'bullet'); M.g.audio.gunshot(w, n.pos.x, n.pos.z); M.g.particles.blood({ x: n.pos.x, y: 1.2, z: n.pos.z }, 14); };
  // meydan tutma adımı (bölge ele geçirme)
  const holdSquare = (name, fx, fz, waves, o = {}) => step({
    cp: name,
    place(M) { const s = M.walk(fx, fz, 0, 30); M.place(s.x, s.z, 0); },
    start(M) {
      const s = M.walk(fx, fz, 0, 30);
      M.data.sq = s;
      for (let i = 0; i < 3; i++) M.ally(s.x - 2 + i * 2, s.z + 2, { weapon: i === 1 ? 'shotgun' : 'ak', state: 'guard', baseState: 'guard', home: new THREE.Vector3(s.x - 2 + i * 2, 0, s.z + 2) });
      M.waves({ x: s.x, z: s.z, gang: 'yilanlar', waves, defendHp: 100, defendR: 9, hpLabel: name.toUpperCase(), failText: `${name} elden gitti!`, title: `${name} meydanını tut`, weapons: ['uzi', 'pistol', 'ak', 'shotgun'], firstGap: 3, boss: o.boss });
      if (o.say) M.dialog(o.say(M));
    },
    update(M, dt) { const r = M.updateWaves(dt); return r === 'done' ? 'next' : r; },
    end(M) { const s = M.data.sq; if (s) M.big(`${name.toUpperCase()} BİZİM`, 'Bayrak dikildi', 'gold', 2.5); },
    cleanup(M) { M.dialogue.meter(null); },
  });

  // ============================ İKİNCİ PERDE · SINAVLAR ============================
  const takip = {
    id: 'takip', act: 1, title: 'Gölge', reward: 9000, respect: 100, added: '1.4',
    short: 'Fatih\'te muhbiri gözetle, arabasını fark ettirmeden takip et.',
    brief: 'Biri konağın sevkiyat saatlerini Çarşı Ailesi\'ne satıyor. Muhbir Cemil her akşam Fatih\'teki çay ocağında oturur. Gözünü ondan ayırma ama sakın yaklaşma. Kalkınca peşine düş; kiminle buluştuğunu görmek istiyorum.',
    check(M) { if (M.data.cemil && M.data.cemil.dead) return 'fail:Muhbiri öldürdün; kiminle buluşacağını artık bilemeyiz.'; return null; },
    steps: [
      goTo((M) => { const b = M.special('cafe', -800, 300); return M.walk(b.door.x, b.door.z, 34, 52); }, 'Fatih\'teki çay ocağının karşısına geç (Muhbir Cemil)', {
        r: 6,
        onStart(M) {
          const b = M.special('cafe', -800, 300);
          const c = spawnAt(M, b, 2.2);
          const n = M.npc('civilian', c.x, c.z, { name: 'Muhbir Cemil', look: CEMIL_LOOK(), state: 'idle', baseState: 'idle', hp: 160 });
          n.brave = false; n.scriptKill = true; M.data.cemil = n;
          M.data.ccar = parkCar(M, 'sedan', c.x + 8, c.z + 6, '#5a5446');
        },
      }),
      step({
        cp: 'Gözetleme',
        start(M) {
          M.s.t = 0;
          M.setMarkers([{ actor: M.data.cemil, color: 0xff9a30 }]);
          M.objective('Cemil\'i gözetle: 20–60 m mesafede kal, görünme');
          M.dialog([['Sen', 'Kasketli, kahverengi palto. Üçüncü çayını içiyor. Sabır...']]);
        },
        update(M, dt) {
          const c = M.data.cemil;
          if (M.stealth([c], dt, { range: 18 })) return 'fail:Cemil seni fark etti!';
          const d = M.distTo(c);
          if (d <= 62) M.s.t += dt;
          M.objective(d > 62 ? 'Çok uzaktasın — Cemil\'i görebileceğin bir yere geç' : `Cemil'i gözetle (${Math.ceil(Math.max(0, 25 - M.s.t))} sn)`);
          return M.s.t >= 25 ? 'next' : null;
        },
        cleanup(M) { M.dialogue.meter(null); },
      }),
      step({
        start(M) {
          const g = M.g, c = M.data.cemil, car = M.data.ccar;
          board(M, c, car);
          const w = M.special('warehouse', -40, 250);
          M.data.dest = spawnAt(M, w, 14);
          driveRoute(M, car, M.data.dest.x, M.data.dest.z, 0.3);
          M.setMarkers([{ vehicle: car, color: 0xff9a30 }]);
          M.objective('Cemil\'in arabasını takip et — çok yaklaşma, kaybetme');
          M.dialog([['Sen', 'Kalktı. Hadi bakalım Cemil... nereye?']]);
          void g;
        },
        update(M, dt) {
          const car = M.data.ccar, d = M.data.dest;
          if (!car || car.destroyed) return 'fail:Cemil\'in arabası parçalandı.';
          const r = tail(M, car, dt);
          if (r) return r;
          if (Math.hypot(car.pos.x - d.x, car.pos.z - d.z) < 22 || (car.ai && car.ai.finished)) { car.ai = { empty: true }; car.vx = car.vz = 0; M.dialogue.meter(null); return 'next'; }
          return null;
        },
        cleanup(M) { M.dialogue.meter(null); },
      }),
      step({
        cp: 'Buluşma',
        place(M) { const w = M.special('warehouse', -40, 250); const d = spawnAt(M, w, 14); M.data.dest = d; M.place(d.x + 45, d.z + 20, 0); },
        start(M) {
          const d = M.data.dest;
          const c = M.data.cemil && !M.data.cemil.dead ? M.data.cemil : M.npc('civilian', d.x, d.z, { name: 'Muhbir Cemil', look: CEMIL_LOOK(), hp: 160 });
          M.data.cemil = c;
          if (c.vehicle) { const car = c.vehicle; c.vehicle = null; c.model.root.visible = true; c.pos.set(car.pos.x + 2, 0, car.pos.z); }
          c.state = 'idle'; c.baseState = 'idle';
          const y = M.npc('civilian', d.x + 2.5, d.z + 1, { name: 'Şoför Yaşar', look: YASAR_LOOK(), state: 'idle', baseState: 'idle', hp: 200 });
          y.scriptKill = true; M.data.yasar = y;
          M.data.ycar = parkCar(M, 'sedan', d.x + 6, d.z + 4, '#0c0c0c');
          M.setMarkers([{ actor: y, color: 0xff9a30 }]);
          M.objective('Cemil kiminle buluşuyor? 40 m içinden fotoğraf çek (E) — yaklaşma');
          M.s.t = 0;
        },
        update(M, dt) {
          const y = M.data.yasar;
          M.s.t += dt;
          if (y.dead) return 'fail:Buluşmayı dağıttın, konuşacak kimse kalmadı.';
          const d = M.distTo(y);
          if (d < 9) return 'fail:Seni gördüler! Yaşar arabasına atlayıp kaçtı.';
          if (d < 40 && !M.data.photo) M.prompt('Fotoğraf çek', () => {
            M.data.photo = true; M.g.audio.tone && M.g.audio.tone({ freq: 1800, dur: 0.05, type: 'square', gain: 0.12 });
            M.dialog([['Sen', 'Siyah takım, gözlük... Bu yüzü tanıyorum. Şoför Yaşar. Kenan\'ın şoförü.'], ['Sen', 'Kenan\'ın adamı aileyi Çarşı\'ya satıyor. Ya da Kenan\'ın kendisi.']], () => { M.s.done = true; });
          });
          if (M.s.t > 70 && !M.data.photo) return 'fail:Buluşma bitti, fotoğraf yok.';
          return M.s.done ? 'next' : null;
        },
      }),
      step({
        start(M) {
          M.objective('');
          M.dialog([
            ['Reis Baba', 'Söyle evlat.'],
            ['Sen', 'Muhbiri buldum Reis. Buluştuğu adam... Şoför Yaşar. Kenan\'ın şoförü.'],
            ['Reis Baba', '...Emin misin?'],
            ['Sen', 'Fotoğrafı cebimde.'],
            ['Reis Baba', 'Fotoğrafı sil. Bu meseleyi kimseye açma, Leyla\'ya bile. Kenan\'la ben konuşurum.'],
            ['Sen', 'Reis, bu adam bizi satıyor...'],
            ['Reis Baba', 'Dedim ki: ben konuşurum. Kan kandır evlat. Konağa gel.'],
          ], () => { if (!M.replay) M.setFlag('yasar', true); M.s.done = true; }, { phone: 'Reis Baba' });
          const y = M.data.yasar, c = M.data.cemil, car = M.data.ycar;
          if (y && car && !y.dead) { board(M, y, car); fleeCar(M, car); }
          if (c && !c.dead) { c.state = 'walk'; c.mission = false; }
        },
        update(M) { return M.s.done ? 'next' : null; },
      }),
    ],
    judge(M) { return M.data.photo ? { trust: 3 } : null; },
  };

  const sadakat = {
    id: 'sadakat', act: 1, title: 'Sadakat', reward: 15000, respect: 150, added: '1.4',
    short: 'Reis\'in emri: Nevzat\'a ifade veren Terzi Nuri.',
    brief: 'Terzi Nuri\'yi hatırlarsın; haraç turunda zarfı uzatan adam. Dün Nevzat\'ın odasında üç saat kalmış. Yarın savcının karşısına çıkıp beni, seni, bu evi anlatacak. Dükkânına git. Ne yapılması gerektiğini biliyorsun. Bu iş sadakat işidir evlat; başka kimseye veremem.',
    check(M) { if (M.data.escort && M.data.nuri && M.data.nuri.dead) return 'fail:Nuri öldü.'; return null; },
    steps: [
      enter('clothes', 'Terzi Nuri\'nin dükkânına git', {
        near: [-200, -110],
        populate(M, ctx, I) {
          if (ctx.building !== M.s.b) return;
          const n = I.npc(ctx, 'resident', 0.6, -2.6, Math.PI * 0.95, { name: 'Terzi Nuri', look: NURI_LOOK(), mission: true });
          n.scriptKill = true; n.brave = false; M.data.nuri = n;
          const z = I.npc(ctx, 'resident', 2.0, -3.2, Math.PI * 0.9, { name: 'Zeynep', look: ZEYNEP_LOOK(), mission: true });
          z.god = true; M.data.zeynep = z;
        },
      }),
      talk((M) => {
        const P0 = P(M).pos, nuri = { x: 0.6, y: 0, z: -2.6 }, zey = { x: 2.0, y: 0, z: -3.2 };
        return [
          ['Terzi Nuri', 'Geldin demek... Reis seni gönderdi, değil mi? Kapıdan girişinden anladım.', { cam: () => M.camOver(P0, nuri)() }],
          ['Terzi Nuri', 'Nevzat kızımı okul kapısında bekletmiş. "Konuşmazsan Zeynep\'i bir daha göremezsin" dedi. Sen olsan ne yapardın?'],
          ['Zeynep', 'Baba... bu amca kim? Neden kapıyı kilitledin?', { cam: () => M.camBetween(nuri, zey, 1, 2.6)() }],
          ['Sen', 'İçeride yedi yıl yattım Nuri. Kimsenin adını vermedim. Kimsenin.', { cam: () => M.camOver(nuri, P0)() }],
          ['Terzi Nuri', 'Sen yalnızdın. Benim bir kızım var.'],
          {
            who: 'Sen', text: 'Reis\'in emri ortada. Ne yapacaksın?', key: 'sadakat',
            choice: [
              { label: 'Emri yerine getir', value: 'infaz', hint: 'Reis\'in güveni büyür. Zeynep her şeyi görür.', lines: [['Terzi Nuri', 'Zeynep... gözlerini kapat kızım. Kapat, bakma.']] },
              { label: '"Bu gece şehri terk edeceksin. Seni ben çıkaracağım."', value: 'kacir', hint: 'Nuri\'yi gizlice kaçır, Reis\'e "hallettim" de. Ortaya çıkarsa şüphe senin üstüne düşer.', lines: [['Terzi Nuri', 'Allah senden razı olsun... Arka kapıdan çıkalım; mahallede herkes Reis\'in kulağı.']] },
              { label: '"Bunu yapmayacağım." — Reis\'e açıkça söyle', value: 'reddet', hint: 'Dürüst ol. Reis\'in güveni sarsılır; Nuri\'nin kaderi yine onun elinde kalır.', lines: [['Sen', 'Kapını kilitle Nuri. Kimseye açma. Ben Reis\'le konuşacağım.'], ['Terzi Nuri', 'Reis\'le konuşulmaz evlat. Reis konuşur, sen dinlersin.']] },
            ],
          },
        ];
      }, {
        after(M, r) {
          const v = r.sadakat || M.data.choice_sadakat;
          M.data.v = v;
          if (v === 'infaz') execute(M, M.data.nuri);
        },
      }),
      step({ update(M) { const v = M.data.v || M.flag('sadakat'); return v === 'kacir' ? 5 : v === 'reddet' ? 8 : 3; } }),
      // [3] infaz → dükkândan çık, polis geliyor
      step({ start(M) { M.objective('Dükkândan çık'); M.setMarkers([]); }, update(M) { if (!P(M).inInterior) { M.g.wanted.add(2, true); return 'next'; } return null; } }),
      step({
        start(M) { M.objective('Silah sesini duyan polis geliyor — atlat'); M.dialog([['Sen', 'Zeynep\'in sesi kulağımdan çıkmayacak.']]); },
        update(M) { return M.g.wanted.level === 0 ? 'done' : null; },
      }),
      // [5] kaçır → dükkândan çık, Nuri ve Zeynep peşinde
      step({ start(M) { M.objective('Nuri ve Zeynep ile dükkândan çık'); }, update(M) { return P(M).inInterior ? null : 'next'; } }),
      step({
        cp: 'Kaçış',
        place(M) { const b = M.special('clothes', -200, -110); const f = spawnAt(M, b, 4); M.place(f.x, f.z, 0); },
        start(M) {
          const p = P(M).pos;
          const nuri = M.npc('civilian', p.x + 1.2, p.z, { name: 'Terzi Nuri', look: NURI_LOOK(), hp: 220, state: 'follow' });
          nuri.ally = true; nuri.brave = false; M.escort(nuri); M.data.nuri = nuri; M.data.escort = true;
          const z = M.npc('civilian', p.x - 1.2, p.z, { name: 'Zeynep', look: ZEYNEP_LOOK(), state: 'follow' }); z.god = true; z.ally = true; M.escort(z);
          const n = M.node(p.x, p.z);
          M.data.car = M.car('sedan', n.x + 2.7, n.z + 9, 0, '#3a3a40');
          M.data.dest = M.roadSpot(-260, 200, 0, 40);
          M.gotoXZ(M.data.dest.x, M.data.dest.z, 'Nuri ve kızını Eminönü sahilindeki kamyona götür — kimseye görünmeden', 8);
          M.s.t = 0;
        },
        update(M, dt) {
          M.s.t += dt;
          if (!M.s.cops && M.s.t > 16 && P(M).vehicle) {
            M.s.cops = true;
            const v = M.gangCar('yilanlar', 2, { cruise: 23, min: 80, max: 120 });
            void v;
            M.dialog([['Terzi Nuri', 'Arkada bir araba! Yılanlar... Onlara da borcum vardı. Herkes benim peşimde!'], ['Sen', 'Başını eğ Nuri. Zeynep, kemer.']]);
          }
          if (M.s.cops) M.updateGangCars();
          const d = M.data.dest;
          if (M.reached(d.x, d.z, 12) && M.distTo(M.data.nuri) < 14 && (!P(M).vehicle || Math.abs(P(M).vehicle.fs || 0) < 3)) return 'next';
          return null;
        },
      }),
      step({
        start(M) {
          M.objective('');
          M.dialog([
            ['Terzi Nuri', 'Kamyon İzmir\'e gidiyor. Orada bir kuzenim var. Bir daha İstanbul\'u görmeyeceğim.', { cam: M.camBetween(P(M), M.data.nuri, 1) }],
            ['Zeynep', 'Amca... teşekkür ederim.'],
            ['Sen', 'Savcıya hiçbir şey söylemeyeceksin Nuri. Hiçbir şey. Bu gece hiç yaşanmadı.'],
            ['Terzi Nuri', 'Bir gün ihtiyacın olursa... Ege\'de bir terzi seni hatırlayacak.'],
          ], () => {
            for (const n of M.escorts.slice()) { M.g.npcs.remove(n); }
            M.escorts = [];
            M.s.done = true;
          });
        },
        update(M) { return M.s.done ? 'done' : null; },
      }),
      // [8] reddet → konağa dön, Reis'le yüzleş
      enter('konak', 'Konağa dön, Reis\'e yüz yüze söyle', { pick: konakDoor }),
      talk((M) => {
        const P0 = P(M).pos, reis = { x: 0, y: 0, z: -5.2 }, tah = { x: -3.5, y: 0, z: 4.5 };
        return [
          ['Reis Baba', 'Elin temiz. Yüzün de. Yapmadın.', { cam: () => M.camOver(P0, reis)() }],
          ['Sen', 'Yapmadım Reis. Adamın kızı oradaydı. Nevzat onu tehdit etmiş.'],
          ['Reis Baba', 'Biliyorum. Sana söylemedim mi? Bu şehirde herkesin bir kızı var evlat. Benim de var.'],
          ['Reis Baba', 'Dürüstlüğün için sağ ol. Ama dürüstlük bu evin kapısını korumaz. Tahsin!', { cam: () => M.camBetween(reis, tah, 1, 4)() }],
          ['Kasap Tahsin', 'Emret Reis.'],
          ['Reis Baba', 'Terzi\'ye git. Kızı karışmasın.'],
          ['Kasap Tahsin', 'Emrin olur.', { cam: () => M.camOver(P0, tah)() }],
          ['Reis Baba', 'Gördün mü evlat? Hayır demek bir şeyi değiştirmez. Sadece kimin yapacağını değiştirir.', { cam: () => M.camOver(P0, reis)() }],
        ];
      }, { populate: null, done() { return 'done'; } }),
    ],
    konak(M, ctx, I) {
      if (M.stepIdx < 8) return;
      const t = I.npc(ctx, 'guard', -3.5, 4.5, Math.PI, { name: 'Kasap Tahsin', gang: 'family', look: TAHSIN_LOOK() });
      t.god = true;
    },
    judge(M) {
      const v = M.flag('sadakat');
      if (v === 'infaz') return { trust: 15, susp: 0, why: 'Emri yerine getirdin' };
      if (v === 'kacir') return { trust: 4, susp: 12, why: 'Nuri "kayboldu"' };
      if (v === 'reddet') return { trust: -12, susp: 0, why: 'Emre karşı geldin' };
      return null;
    },
  };

  // ============================ BEŞİNCİ PERDE · GİZLİ MASA ============================
  const gizli = {
    id: 'gizli', act: 4, title: 'Gizli Masa', reward: 30000, respect: 300, added: '1.4', needTrust: 55,
    short: 'Gözcü Rıza\'yı at; Kasap Tahsin ve Leyla ile gizlice buluş.',
    brief: 'Fatih\'teki kahvehanenin hesapları üç aydır tutmuyor. Git bir bak; ocakçıya selamımı söyle. Ha, bir de... Rıza şehirde dolaşıyor. Görürsen el salla.',
    steps: [
      step({
        start(M) {
          const g = M.g, p = P(M).pos;
          if (g.phone) g.phone.notify('Cin Ali', 'Kahvehanenin arka odası. Tahsin seni bekliyor. Peşinde Rıza var abi, dikkat et. Bu mesajı sil.');
          const rs = g.map.randomEdgeNear(p.x, p.z, 50, 80) || { x: p.x + 60, z: p.z };
          const car = M.car('sedan', rs.x, rs.z, 0, '#5a5a5a');
          const r = M.npc('civilian', rs.x, rs.z, { name: 'Gözcü Rıza', look: RIZA_LOOK(), hp: 260 });
          r.god = true; board(M, r, car);
          car.ai = { mode: 'direct', target: p, cruise: 14 };
          M.data.rcar = car; M.data.riza = r;
          M.setMarkers([{ vehicle: car, color: 0xff9a30 }]);
          M.objective('Gözcü Rıza peşinde. Onu at: 150 m uzaklaş ve görüş alanından çık');
          M.s.lostT = 0; M.s.t = 0;
          M.dialog([['Sen', 'Gri sedan. Konaktan çıktığımdan beri arkamda. Baba kimseye güvenmiyor artık... bana bile.']]);
        },
        update(M, dt) {
          const g = M.g, car = M.data.rcar, p = P(M);
          M.s.t += dt;
          const d = Math.hypot(p.pos.x - car.pos.x, p.pos.z - car.pos.z);
          if (car.ai && car.ai.mode === 'direct') { car.ai.target = (p.vehicle || p).pos; car.ai.cruise = d > 70 ? 26 : d > 35 ? 14 : 0; }
          const see = d < 150 && g.physics.lineOfSight(car.pos.x, 1.4, car.pos.z, p.pos.x, 1.4, p.pos.z);
          M.s.lostT = d > 150 || (!see && d > 80) ? M.s.lostT + dt : Math.max(0, M.s.lostT - dt * 2);
          M.dialogue.meter(M.s.lostT > 0 ? 'GÖZCÜYÜ ATIYORSUN' : 'GÖZCÜ SENİ İZLİYOR', M.s.lostT / 6, M.s.lostT > 0 ? '#5ad18a' : '#ffb347');
          if (M.s.lostT >= 6) { M.dialogue.meter(null); car.ai = { empty: true }; M.data.lost = true; M.g.ui.notify('Rıza\'yı attın.', 'good'); return 'next'; }
          if (M.s.t > 150) {
            M.dialogue.meter(null); car.ai = { empty: true };
            if (!M.replay) bump(M, 0, 15, 'Rıza seni Fatih\'e kadar izledi');
            M.dialog([['Sen', 'Atamadım. Rıza köşede durdu, telefonu kulağında. Baba Fatih\'te olduğumu bilecek.']]);
            return 'next';
          }
          return null;
        },
        cleanup(M) { M.dialogue.meter(null); },
      }),
      goTo((M) => spawnAt(M, M.special('cafe', -800, 300), 3), 'Fatih\'teki kahvehanenin arka odasına git', {
        r: 4, cp: 'Kahvehane',
        place(M) { const p = spawnAt(M, M.special('cafe', -800, 300), 12); M.place(p.x, p.z, 0); },
        onStart(M) {
          const p = spawnAt(M, M.special('cafe', -800, 300), 2.2);
          const t = M.npc('gang', p.x + 1.2, p.z, { name: 'Kasap Tahsin', gang: 'family', look: TAHSIN_LOOK(), state: 'idle', baseState: 'idle', weapon: 'shotgun', hp: 500 });
          t.god = true; M.data.tahsin = t;
        },
      }),
      talk((M) => [
        ['Kasap Tahsin', 'Otur. Ocakçı bizden; kapıyı o tutuyor. Rıza\'yı attın mı?', { cam: M.camBetween(P(M), M.data.tahsin, 1) }],
        ['Sen', M.data.lost ? 'Attım.' : 'Atamadım. Köşede bekliyor.'],
        ['Kasap Tahsin', M.data.lost ? 'Aferin. O tilki kolay atılmaz.' : 'O zaman kısa keselim.'],
        ['Kasap Tahsin', 'Otuz yıl Reis\'e kasaplık ettim. Kimi istediyse kestim. Şimdi limanı Doğan Bey\'e satıyor, parayı alıp Ege\'ye kaçacak. Biz? "Herkes başının çaresine baksın."'],
        ['Kasap Tahsin', 'Bir de Nevzat\'ın son sözlerini duydum. Seni yedi yıl içeri tıkan zarfı Reis uzatmış. Kenan\'ın cinayeti için. Doğru mu?'],
        ['Sen', 'Doğru.'],
        ['Kasap Tahsin', 'Adamların yarısı benim sözümden çıkmaz. Ama karşılıksız savaşan adam yoktur. Ne vereceksin?'],
        {
          who: 'Sen', text: 'Tahsin\'e teklifin:', key: 'tahsin',
          choice: [
            { label: '"Limanın gelirinin yarısı senin."', value: 'para', hint: 'Tahsin parayı sever; adamları da.', lines: [['Kasap Tahsin', 'Para dili herkesin anladığı dildir. Anlaştık.']] },
            { label: '"Kadıköy senin olacak. Bölgenin başı sen olacaksın."', value: 'bolge', hint: 'Tahsin\'i ortak yapar. Güçlü bir müttefik... ve bir gün rakip.', lines: [['Kasap Tahsin', 'Kadıköy... Otuz yıl başkasının bölgesinde et kestim. Anlaştık.']] },
          ],
        },
        ['Kasap Tahsin', 'Bir kişi daha var. Leyla. Süleymaniye\'nin arka sokağında seni bekliyor. Reis\'in adamları o semtte dolaşıyor; görünme.'],
      ], { after(M) { if (M.data.tahsin) { M.data.tahsin.state = 'walk'; } } }),
      step({
        cp: 'Leyla',
        place(M) { const p = spawnAt(M, M.special('cafe', -800, 300), 6); M.place(p.x, p.z, 0); },
        start(M) {
          const s = M.walk(-640, 300, 0, 40);
          M.data.meet = s;
          const l = M.npc('civilian', s.x, s.z, { name: 'Leyla', look: LEYLA_LOOK(), state: 'idle', baseState: 'idle' });
          l.god = true; M.data.leyla = l;
          M.data.watch = [];
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2;
            const c = M.walk(s.x + Math.sin(a) * 24, s.z + Math.cos(a) * 24, 0, 12);
            const c2 = M.walk(s.x + Math.sin(a + 1.1) * 24, s.z + Math.cos(a + 1.1) * 24, 0, 12);
            const n = M.npc('gang', c.x, c.z, { gang: 'family', state: 'patrol', baseState: 'patrol', patrol: [c, c2], weapon: 'pistol', lookOver: { topColor: '#1a1a1a' } });
            M.data.watch.push(n);
          }
          M.gotoXZ(s.x, s.z, 'Leyla ile buluş — Reis\'in adamlarına görünme (C: çömel)', 2.5);
        },
        update(M, dt) {
          if (!M.s.seen && M.stealth(M.data.watch, dt, { range: 22 })) {
            M.s.seen = true;
            if (!M.replay) bump(M, -3, 25, 'Reis\'in adamları seni Leyla\'yla gördü');
            M.dialog([['Sen', 'Gördüler. Biri telsize bir şey fısıldadı.'], ['Leyla', 'Çabuk! Konuşacaksak şimdi.']]);
            M.s.forced = true;
          }
          const s = M.data.meet;
          return M.s.forced || M.reached(s.x, s.z, 3) ? 'next' : null;
        },
        cleanup(M) { M.dialogue.meter(null); },
      }),
      talk((M) => [
        ['Leyla', 'Nevzat\'ın dosyasını okudum. Savcılık kopyasını bana yollayan Sinan oldu... ya da bir hayalet.', { cam: M.camBetween(P(M), M.data.leyla, 1) }],
        ['Leyla', 'Yedi yıl önce Kenan Tarlabaşı\'nda bir polisi vurmuş. Babam suçu sana yıktı. Her bayram ayırdığı tabak... o tabak vicdanıymış.'],
        ['Sen', 'Ve şimdi limanı satıp kaçıyor. Adamlarını Kurtlar\'ın artıklarına yem bırakıyor.'],
        ['Leyla', 'Biliyorum. Tahsin benimle de konuştu. Babamın yanında durmayacağım. Ama bir şartım var.'],
        ['Leyla', 'Onu öldürmeyeceksin. Söz ver bana.'],
        {
          who: 'Sen', text: 'Leyla\'ya cevabın:', key: 'leylaSoz',
          choice: [
            { label: '"Söz veriyorum. Kanını dökmeyeceğim."', value: 'soz', hint: 'Leyla yanında olur. Sözünü tutup tutmamak sana kalmış.', lines: [['Leyla', 'O zaman yanındayım. Babamın evinin anahtarı bende; kapıyı ben açacağım.']] },
            { label: '"Söz veremem Leyla. O gece ne olacağını bilmiyorum."', value: 'yok', hint: 'Dürüstlük. Leyla seninle olur ama gözü üstünde olur.', lines: [['Leyla', 'Dürüstsün en azından... Babamdan çok.'], ['Leyla', 'Kapıyı açarım. Gerisi senin vicdanın.']] },
          ],
        },
      ], { after(M) { if (!M.replay) M.setFlag('conspiracy', true); } }),
    ],
    judge(M) { return M.data.lost ? null : { susp: 5 }; },
  };

  const kurtarma = {
    id: 'kurtarma', act: 4, title: 'Sorgu', reward: 30000, respect: 300, added: '1.4',
    short: 'Reis Cin Ali\'yi yakalattı ve onu senin sorgulamanı istiyor.',
    brief: (M) => `Cin Ali'yi Eminönü'ndeki depoya kapattırdım. Fatih'te biriyle görüşmüş; kimle, neden, söylemiyor. Rıza başında. Git, konuştur onu. ${susp(M) >= 40 ? 'Rıza seni de Fatih\'te görmüş evlat. Herhalde tesadüftür. Tesadüf olduğunu bana Ali\'nin ağzından ispat et.' : 'Sana güveniyorum... güvenmeli miyim?'}`,
    check(M) { if (M.data.ali && M.data.ali.dead) return 'fail:Cin Ali öldü!'; return null; },
    steps: [
      enter('warehouse', 'Eminönü\'ndeki depoya git', {
        near: [-40, 250],
        populate(M, ctx, I) {
          if (ctx.building !== M.s.b) return;
          M.data.guards = [];
          const r = I.npc(ctx, 'guard', 1.8, -5.2, Math.PI, { name: 'Gözcü Rıza', gang: 'family', mission: true, weapon: 'pistol', look: RIZA_LOOK(), hp: 320 });
          r.static = false; M.data.riza = r; M.data.guards.push(r);
          for (const [x, z] of [[-5, -3], [5, -2], [-6, 3], [6, 4]]) {
            const n = I.npc(ctx, 'guard', x, z, Math.PI, { gang: 'family', mission: true, weapon: x > 0 ? 'ak' : 'uzi', look: { ...randomLook(ctx.rng, 'gang'), topColor: '#1a1a1a' } });
            n.static = false; M.data.guards.push(n);
          }
          const a = I.npc(ctx, 'resident', 0, -6.5, Math.PI, { name: 'Cin Ali', look: ALI_LOOK(), mission: true });
          a.sitting = true; a.god = true; M.data.ali = a;
        },
      }),
      talk((M) => {
        const P0 = P(M).pos, riza = { x: 1.8, y: 0, z: -5.2 }, ali = { x: 0, y: 0, z: -6.5 };
        const canTrick = trust(M) >= 70 && susp(M) < 60;
        return [
          ['Gözcü Rıza', 'Hoş geldin. Reis "ya konuştur ya bitir" dedi. Biz elimizi kirletmedik; sana bıraktık.', { cam: () => M.camOver(P0, riza)() }],
          ['Cin Ali', 'Abi... ben bir şey söylemedim. Hiçbir şey. Yemin ederim.', { cam: () => M.camOver(P0, ali)() }],
          ['Gözcü Rıza', 'Fatih\'te bir kahvehane... Arka oda... Sen de oradaydın, değil mi? Yoksa ben mi yanlış gördüm?', { cam: () => M.camBetween(riza, P0, -1)() }],
          {
            who: 'Sen', text: 'Ali\'yi nasıl çıkaracaksın?', key: 'kurtarma',
            choice: [
              { label: 'Silahını çek — Ali\'yi zorla kurtar', value: 'catis', hint: 'Rıza ve adamları ölür. Reis her şeyi öğrenir; geri dönüş olmaz.', lines: [['Sen', 'Yanlış görmedin Rıza.'], ['Gözcü Rıza', 'Biliyordum! Vurun!']] },
              { label: '"Bizi yalnız bırakın." — Rıza\'yı kandır', value: 'kandir', hint: 'Reis\'in sana güveni yüksekse Rıza itaat eder.', disabled: () => !canTrick, offHint: 'Reis\'in güveni yetmiyor ya da şüphe çok yüksek (güven 70+, şüphe 60 altı)', lines: [['Sen', 'Reis bu işi bana verdi Rıza. Çıkın. Ali\'yle ben konuşacağım.'], ['Gözcü Rıza', '...Kapının önündeyiz. Bir ses duyarsam içeri girerim.']] },
            ],
          },
        ];
      }, {
        after(M, r) {
          const v = r.kurtarma || M.data.choice_kurtarma;
          M.data.v = v;
          if (v === 'catis') { for (const n of M.data.guards) { n.hostile = true; n.engage(M.g.player, 0.8); } }
          else for (const n of M.data.guards) { M.g.npcs.remove(n); }
        },
      }),
      step({ update(M) { return (M.data.v || M.flag('kurtarma')) === 'kandir' ? 6 : 3; } }),
      // [3] çatışma
      killAll('guards', 'Rıza ve adamlarını indir!', {
        tick(M) { if (!P(M).inInterior) return 'fail:Ali\'yi depoda bıraktın!'; return null; },
        start0: true,
      }),
      step({
        start(M) {
          if (!M.replay) { M.setFlag('riza', 'olu'); bump(M, -30, 100, 'Reis\'in adamlarını öldürdün'); }
          M.dialog([['Cin Ali', 'Abi! Çöz şu ipleri... Reis artık her şeyi bilecek. Rıza\'nın telsizi açıktı!'], ['Sen', 'Bilsin. Çıkıyoruz.']]);
          const ctx = P(M).inInterior;
          if (M.data.ali) { M.data.ali.sitting = false; M.data.ali.god = false; M.data.ali.hp = 400; M.data.ali.ally = true; M.data.ali.leader = P(M); M.data.ali.state = 'follow'; M.data.ali.baseState = 'follow'; }
          void ctx;
          M.objective('Ali ile depodan çık');
        },
        update(M) { return P(M).inInterior ? null : 'next'; },
      }),
      step({
        cp: 'Kaçış',
        place(M) { const w = M.special('warehouse', -40, 250); const f = spawnAt(M, w, 4); M.place(f.x, f.z, 0); },
        start(M) {
          const p = P(M).pos;
          const a = M.ally(p.x + 1.4, p.z, { name: 'Cin Ali', look: ALI_LOOK(), weapon: 'pistol', hp: 400 }); M.escort(a); M.data.ali = a;
          const n = M.node(p.x, p.z);
          M.car('sedan', n.x + 2.7, n.z + 9, 0, '#202024');
          M.gangCar('family', 3, { cruise: 24, min: 70, max: 110, weapons: ['uzi', 'ak', 'pistol'], color: '#101010' });
          M.goto(M.special('safehouse', -300, -60), 'Ali\'yi güvenli eve götür — Reis\'in adamları peşinde!', 6);
          M.dialog([['Cin Ali', 'Siyah araba! Konağın plakası! Bas abi!']]);
        },
        update(M) {
          M.updateGangCars();
          const sh = M.special('safehouse', -300, -60);
          if (M.reached(sh.door.x, sh.door.z + (sh.door.nz || 1) * 4, 10) && M.distTo(M.data.ali) < 14) return 9;
          return null;
        },
      }),
      // [6] kandır: Rıza kapının önünde; arka çıkıştan sessizce kaç
      step({
        start(M) {
          if (M.data.ali) { M.data.ali.sitting = false; }
          M.dialog([['Cin Ali', 'Abi... sağ ol. Arka tarafta yük kapısı var; Rıza önde bekler, oradan çıkalım.'], ['Sen', 'Sessiz ol. Yürü.']]);
          M.objective('Ali ile depodan çık');
        },
        update(M) { return P(M).inInterior ? null : 'next'; },
      }),
      step({
        cp: 'Arka kapı',
        place(M) { const w = M.special('warehouse', -40, 250); const f = spawnAt(M, w, 4); M.place(f.x, f.z, 0); },
        start(M) {
          const p = P(M).pos, w = M.special('warehouse', -40, 250), f = spawnAt(M, w, 6);
          const a = M.ally(p.x + 1.4, p.z, { name: 'Cin Ali', look: ALI_LOOK(), weapon: 'pistol', hp: 400 }); M.escort(a); M.data.ali = a;
          M.data.watch = [M.npc('gang', f.x + 3, f.z + 2, { name: 'Gözcü Rıza', gang: 'family', look: RIZA_LOOK(), state: 'guard', weapon: 'pistol', home: new THREE.Vector3(f.x + 3, 0, f.z + 2) }), M.npc('gang', f.x - 3, f.z + 3, { gang: 'family', state: 'guard', weapon: 'ak', home: new THREE.Vector3(f.x - 3, 0, f.z + 3) })];
          for (const n of M.data.watch) n.heading = 0;
          M.data.start = { x: p.x, z: p.z };
          M.objective('Rıza\'ya görünmeden 70 m uzaklaş (C: çömel)');
        },
        update(M, dt) {
          if (M.stealth(M.data.watch, dt, { range: 20 })) {
            if (!M.replay) bump(M, -10, 40, 'Rıza Ali\'yle kaçtığını gördü');
            for (const n of M.data.watch) { n.hostile = true; n.engage(P(M), 0.6); }
            M.dialog([['Gözcü Rıza', 'Hain! Reis\'e haber verin!']]);
            M.data.loud = true;
            return 'next';
          }
          const s = M.data.start;
          return Math.hypot(P(M).pos.x - s.x, P(M).pos.z - s.z) > 70 ? 'next' : null;
        },
        cleanup(M) { M.dialogue.meter(null); },
      }),
      goTo((M) => spawnAt(M, M.special('safehouse', -300, -60), 4), 'Ali\'yi güvenli eve götür', { r: 7 }),
      // [9] güvenli ev
      talk((M) => [
        ['Cin Ali', 'Abi... Reis artık biliyor. Ya da yarın bilecek. Fark etmez.', { cam: M.data.ali ? M.camBetween(P(M), M.data.ali, 1) : undefined }],
        ['Cin Ali', 'Tahsin adamlarını topladı. Leyla konağın anahtarını getirdi. Ya şimdi ya hiç abi.'],
        ['Sen', 'Şimdi.'],
      ]),
    ],
    judge(M) { return (M.data.v || M.flag('kurtarma')) === 'kandir' && !M.data.loud ? { susp: 5 } : null; },
  };

  const devrilme = {
    id: 'devrilme', act: 4, title: 'Taht Kavgası', reward: 60000, respect: 500, added: '1.4', needFlag: 'conspiracy',
    short: 'Konağa gir, Reis Baba\'nın sadık adamlarını indir ve tahtı al.',
    brief: (M) => `Otur. Yarın Doğan Bey'le limanı imzalıyorum. Kadıköy limanını... sizin kanınızla aldığımız limanı. Yoruldum evlat. Parayı alıp Ege'ye çekileceğim. Adamlar mı? Herkes kendi başının çaresine baksın.${susp(M) >= 60 ? ' Bir de... Rıza bana bir şeyler anlatıyor. Yalan olduğunu söyle bana. Söyle... Söyleyemiyorsun.' : ' Yarın imzada yanımda ol. Güvendiğim tek adam sensin.'}`,
    check(M) { if (M.data.ali && M.data.ali.dead) return 'fail:Cin Ali öldü!'; return null; },
    konak(M, ctx, I, reis) {
      if (M.stepIdx < 2) return;
      const g = M.g;
      if (reis) { M.data.reis = reis; reis.god = true; reis.sitting = false; }
      M.data.loyal = [];
      const extra = susp(M) >= 60 ? 3 : 0;
      const pts = [[-6, 4], [6, 4], [-5, -1], [5, -1], [-6.5, -5], [6.5, -5], [-3, 1], [3, 1]].slice(0, 5 + extra);
      for (const [x, z] of pts) {
        const n = I.npc(ctx, 'guard', x, z, Math.PI, { gang: 'family', mission: true, weapon: x > 0 ? 'ak' : 'shotgun', look: { ...randomLook(ctx.rng, 'gang'), topColor: '#141414' } });
        n.static = false; n.hostile = true; n.engage(g.player, 2.2); M.data.loyal.push(n);
      }
      // konaktaki iki koruma da Reis'e sadık
      for (const n of g.npcs.list) if (n.inInterior === ctx && n.name === 'Koruma' && !n.dead) { n.hostile = true; n.static = false; n.engage(g.player, 2); M.data.loyal.push(n); }
      const t = I.npc(ctx, 'guard', -1.5, 5.5, Math.PI, { name: 'Kasap Tahsin', gang: 'family', mission: true, look: TAHSIN_LOOK(), weapon: 'shotgun', hp: 700, state: 'follow', baseState: 'follow' });
      t.ally = true; t.leader = g.player; t.static = false; t.god = true;
      const a = I.npc(ctx, 'guard', 1.5, 5.5, Math.PI, { name: 'Cin Ali', gang: 'family', mission: true, look: ALI_LOOK(), weapon: 'uzi', hp: 600, state: 'follow', baseState: 'follow' });
      a.ally = true; a.leader = g.player; a.static = false; a.god = true;
      if (M.flag('leylaSoz')) { const l = I.npc(ctx, 'resident', 0, 6.2, Math.PI, { name: 'Leyla', look: LEYLA_LOOK(), mission: true }); l.god = true; M.data.leyla = l; }
    },
    steps: [
      goTo((M) => spawnAt(M, M.special('safehouse', -300, -60), 4), 'Güvenli eve git: Tahsin ve Cin Ali seni bekliyor', {
        r: 6,
        onStart(M) {
          M.s.t = 0;
          if (susp(M) >= 60) M.s.amb = 'bekle';
        },
        tick(M, dt) {
          M.s.t += dt;
          if (M.s.amb === 'bekle' && M.s.t > 8) {
            M.s.amb = true;
            M.gangCar('family', 3, { cruise: 25, min: 70, max: 110, weapons: ['ak', 'uzi', 'shotgun'], color: '#0a0a0a' });
            M.dialog([['Sen', 'Siyah araçlar... Konağın adamları. Baba beklemedi; ilk hamleyi o yaptı.']]);
          }
          if (M.s.amb === true) M.updateGangCars();
          return null;
        },
      }),
      talk((M) => {
        const p = P(M).pos;
        M.data.ali = M.ally(p.x + 1.5, p.z, { name: 'Cin Ali', look: ALI_LOOK(), weapon: 'uzi', hp: 600 });
        M.data.ali.god = true;
        const t = M.ally(p.x - 1.5, p.z, { name: 'Kasap Tahsin', look: TAHSIN_LOOK(), weapon: 'shotgun', hp: 700 }); t.god = true;
        return [
          ['Kasap Tahsin', 'Adamların yarısı yarın sabah benim yanımda olacak. Diğer yarısı konakta, Reis\'in dibinde. Onlar dönmez.', { cam: M.camBetween(P(M), t, 1) }],
          ['Cin Ali', 'Gece ikide nöbet değişiyor. Kapıda iki adam kalıyor. Leyla arka kapıyı açacak.'],
          ['Sen', M.flag('leylaSoz') === 'soz' ? 'Reis\'e dokunan olmayacak. O benim. Leyla\'ya söz verdim.' : 'Reis\'i bana bırakın. Ne olacağına ben karar vereceğim.'],
          ['Kasap Tahsin', 'Otuz yıl bu adamın ekmeğini yedim. ...Hadi. Geç olmadan.'],
        ];
      }, { after(M) { for (const n of M.spawned.npcs) if (n.ally && !n.dead) { M.g.npcs.remove(n); } M.spawned.npcs = M.spawned.npcs.filter((n) => !n.ally); } }),
      enter('konak', 'Gece konağa gir — taht kavgası', {
        cp: 'Konak', pick: konakDoor,
        place(M) { const k = konakDoor(M); M.place(k.door.x, k.door.z + k.door.nz * 6, 0); },
        onStart(M) { M.g.env.time = 1.9; },
      }),
      killAll('loyal', 'Reis\'in sadık adamlarını indir', {
        tick(M) { if (!P(M).inInterior) return 'fail:Konaktan çıktın; Reis kaçtı!'; return null; },
        start0: true,
      }),
      talk((M) => {
        const P0 = P(M).pos, reis = { x: 0, y: 0, z: -5.2 }, l = { x: 0, y: 0, z: 6.2 };
        const soz = M.flag('leylaSoz') === 'soz';
        return [
          ['Reis Baba', 'Demek sensin. Bu evin kapısını içeriden açan... Leyla mı? Leyla da mı?', { cam: () => M.camOver(P0, reis)() }],
          ['Sen', 'Yedi yıl Reis. Kenan\'ın yerine yattığım yedi yıl. Her bayram bir tabak... Tabağı ben istemedim.'],
          ['Reis Baba', 'Oğlumdu! Sen olsan ne yapardın? Ben seni sevdim evlat. Seni gerçekten sevdim. Ama o benim kanımdı.'],
          ['Sen', 'Sonra limanı satıp adamlarını sokağa atacaktın. Kanın sadece Kenan\'dı Reis. Biz hiç olmadık.'],
          M.data.leyla ? ['Leyla', soz ? 'Baba... Söz verdi. Seni öldürmeyecek. Lütfen... git.' : 'Baba... Ben kapıyı açtım. Gerisini bilmiyorum.', { cam: () => M.camBetween(P0, l, 1)() }] : ['Kasap Tahsin', 'Reis. Otuz yıl. Bu kadarı yeter.'],
          ['Reis Baba', 'Ne olacaksa olsun. Ama gözüme bakarak yap.', { cam: () => M.camOver(P0, reis)() }],
          {
            who: 'Sen', text: 'Reis Baba\'nın kaderi:', key: 'baba',
            choice: [
              { label: 'Sürgün: "Ege\'ye git. İstanbul\'a bir daha dönme."', value: 'sur', hint: soz ? 'Sözünü tutarsın. Leyla yanında kalır. Sürgündeki bir baba bir gün dönebilir.' : 'Merhamet. Leyla yanında kalır. Sürgündeki bir baba bir gün dönebilir.', lines: [['Reis Baba', 'Sürgün... Babamı da sürgüne yollamışlardı. Bir babayı sürgüne yollayan, bir gün kapısında o babayı bulur evlat.'], ['Sen', 'O gün geldiğinde kapıyı yine ben açarım.']] },
              { label: 'Hesabı kapat: "Yedi yılın bedeli."', value: 'oldur', hint: soz ? 'Leyla\'ya verdiğin sözü bozarsın. Leyla seni terk eder.' : 'Tahtı kanla alırsın. Leyla seni terk eder.', lines: [['Reis Baba', 'Gözüme bak... Evet. Böyle. Sen benim en iyi eserimsin.'], ['Leyla', 'Hayır! HAYIR!']] },
            ],
          },
        ];
      }, {
        after(M, r) {
          const v = r.baba || M.data.choice_baba;
          const reis = M.data.reis;
          if (v === 'oldur') execute(M, reis, 'pistol');
          else if (reis) M.g.npcs.remove(reis);
          if (M.data.leyla && v === 'oldur') { M.g.npcs.remove(M.data.leyla); }
        },
      }),
      talk((M) => (M.flag('baba') === 'oldur' || M.data.choice_baba === 'oldur'
        ? [['Kasap Tahsin', 'Leyla gitti. Arkasına bakmadan.'], ['Cin Ali', 'Abi... Artık konak senin. Adamlar dışarıda bekliyor; ilk emrini duymak istiyorlar.'], ['Sen', 'İlk emrim: limana kimse dokunmayacak. Doğan Bey\'e haber gönderin; imza yok.']]
        : [['Leyla', 'Gitti. Bir valiz, bir tespih. Otuz yıl bu evdeydi.'], ['Leyla', 'Sözünü tuttun. Ben de tutacağım: aile artık senin. Ama ben de bu ailenin içindeyim, unutma.'], ['Sen', 'İlk emrim: limana kimse dokunmayacak. Doğan Bey\'e haber gönderin; imza yok.']]), {
        after(M) { if (!M.replay) M.setFlag('babaDown', true); },
      }),
    ],
    judge() { return null; },
    onComplete(M) { if (!M.replay) { M.setFlag('babaDown', true); M.big('YENİ BABA', 'Konak artık senin', 'gold', 4); } },
  };

  // ============================ ALTINCI PERDE · TEK HÂKİM ============================
  const dogan = {
    id: 'dogan', act: 5, title: 'Kartalın Düşüşü', reward: 80000, respect: 450, added: '1.4',
    short: 'Doğan Bey\'i ortadan kaldır: dürbün, bomba ya da baskın.',
    brief: (M) => `Doğan Bey "babasını deviren adamla aynı masaya oturmam" demiş. Liman imzası yatınca Kartallar Beşiktaş'ta adam topluyor. ${M.flag('ally') === 'kartallar' ? 'Bir zamanlar müttefikimizdi; ama müttefik, kendi tahtını isteyene kadar müttefiktir.' : 'İttifak masasında onu küstürmüştük; o gün bugündür bıçağını biliyor.'} Nasıl yapacağına sen karar ver.`,
    steps: [
      talk(() => [
        ['Cin Ali', 'Üç yol var abi. Doğan her sabah sahilde yürür; korumalar arkasında, uzak bir dürbün işini görür.'],
        ['Cin Ali', 'Ya da köşkün önünde bekleyen siyah sedanı. Altına bir paket, cebinde bir düğme.'],
        ['Cin Ali', 'Ya da kapıdan gireriz. Gürültülü olur, ama Kartallar kimin geldiğini anlar.'],
        {
          who: 'Sen', text: 'Yaklaşım:', key: 'dogan_yol',
          choice: [
            { label: 'Keskin nişancı — sahil yürüyüşünde', value: 'keskin', hint: 'Sessiz ve uzak. Fark edilirsen hedef kaçar.' },
            { label: 'Araç bombası — köşkün önünde', value: 'bomba', hint: 'Gizlice yerleştir, uzaktan patlat. Korumalara görünme.' },
            { label: 'Baskın — köşke kapıdan gir', value: 'baskin', hint: 'Çok koruma, çok kurşun. Herkes ne olduğunu görür.' },
          ],
        },
      ], { after(M, r) { M.data.yol = r.dogan_yol || M.data.choice_dogan_yol || M.flag('dogan_yol') || 'baskin'; } }),
      step({ update(M) { const y = M.data.yol || M.flag('dogan_yol'); return y === 'keskin' ? 2 : y === 'bomba' ? 5 : 8; } }),
      // [2] keskin nişancı: pozisyona git
      goTo((M) => { const r = doganRoute(M); return r.nest; }, 'Sahile bakan pozisyona geç (Beşiktaş)', { r: 4 }),
      step({
        cp: 'Dürbün',
        place(M) { const r = doganRoute(M); M.place(r.nest.x, r.nest.z, 0); },
        start(M) {
          const g = M.g, r = doganRoute(M);
          g.player.giveWeapon('sniper', 20); g.player.setWeapon('sniper');
          const d = M.npc('boss', r.a.x, r.a.z, { name: 'Doğan Bey', gang: 'kartallar', look: BOSS_LOOK('kartallar', { hatColor: '#e8e8e8' }), hp: 420, state: 'move' });
          d.path = [{ x: r.b.x, z: r.b.z }]; d.moveSpeed = 1.3; d.afterMove = 'idle'; d.scriptKill = true;
          M.data.dogan = d;
          M.data.guards = [];
          for (let i = 0; i < 3; i++) {
            const n = M.enemy('kartallar', r.a.x - 1.5 + i * 1.5, r.a.z - 2, { state: 'move', weapon: i === 1 ? 'ak' : 'uzi', delay: 1 });
            n.path = [{ x: r.b.x - 1.5 + i * 1.5, z: r.b.z - 2 }]; n.moveSpeed = 1.3; n.afterMove = 'guard'; n.hostile = false;
            M.data.guards.push(n);
          }
          M.setMarkers([{ actor: d, color: 0xff3030 }]);
          M.objective('Doğan Bey sahilde yürüyor. Sağ tık: dürbün — vur onu');
          M.s.t = 0;
          M.dialog([['Sen', 'Beyaz şapka. Eli arkada, tespih... Kırk yıldır aynı yürüyüş.']]);
        },
        update(M, dt) {
          const d = M.data.dogan;
          M.s.t += dt;
          if (d.dead) return 'next';
          if (!M.s.alert && M.stealth(M.data.guards, dt, { range: 32 })) {
            M.s.alert = true;
            for (const n of M.data.guards) { n.hostile = true; n.engage(P(M), 0.5); }
            d.state = 'flee'; d.fleeFrom = P(M).pos.clone(); d.fleeT = 60;
            M.say(d, 'Keskin nişancı! Beni arabaya götürün!');
            M.objective('Fark edildin! Doğan Bey kaçıyor — kaçmadan vur');
            M.s.t = Math.max(M.s.t, 60);
          }
          if (M.s.t > 100 || M.distTo(d) > 260) return 'fail:Doğan Bey kaçtı.';
          return null;
        },
        cleanup(M) { M.dialogue.meter(null); },
      }),
      step({
        start(M) { M.g.wanted.add(2, true); M.big('DOĞAN BEY ÖLDÜ', 'Kartallar başsız kaldı', 'gold', 3); M.objective('Polisi atlat ve uzaklaş'); },
        update(M) { return M.g.wanted.level === 0 ? 'done' : null; },
      }),
      // [5] araç bombası
      step({
        start(M) {
          const g = M.g;
          const k = M.special('rival', -420, -920);
          const f = spawnAt(M, k, 9);
          const car = M.car('sedan', f.x + 4, f.z, 0, '#0a0a0a'); car.parked = true; M.data.car = car;
          M.data.guards = [];
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2;
            const c1 = { x: car.pos.x + Math.sin(a) * 8, z: car.pos.z + Math.cos(a) * 8 }, c2 = { x: car.pos.x + Math.sin(a + 2) * 8, z: car.pos.z + Math.cos(a + 2) * 8 };
            const n = M.npc('gang', c1.x, c1.z, { gang: 'kartallar', state: 'patrol', baseState: 'patrol', patrol: [c1, c2], weapon: 'uzi' });
            M.data.guards.push(n);
          }
          M.setMarkers([{ vehicle: car, color: 0xff9a30 }]);
          M.objective('Köşkün önündeki siyah sedana bombayı yerleştir — görünme (C: çömel)');
          g.setGps(car.pos.x, car.pos.z);
        },
        update(M, dt) {
          const car = M.data.car;
          if (M.distTo({ pos: car.pos }) < 60 && M.stealth(M.data.guards, dt, { range: 22 })) {
            for (const n of M.data.guards) { n.hostile = true; n.engage(P(M), 0.5); }
            return 'fail:Korumalar seni gördü; Doğan Bey köşkten çıkmayacak.';
          }
          if (M.distTo({ pos: car.pos }) < 3 && !P(M).vehicle) M.prompt('Bombayı yerleştir', () => { M.s.planted = true; M.g.ui.notify('Bomba yerleştirildi. Uzaklaş.', 'good'); });
          return M.s.planted ? 'next' : null;
        },
        cleanup(M) { M.dialogue.meter(null); },
      }),
      step({
        start(M) { M.objective('Uzaklaş (45 m) ve Doğan Bey\'in arabaya binmesini bekle'); M.s.t = 0; },
        update(M, dt) {
          const car = M.data.car, d0 = M.distTo({ pos: car.pos });
          if (!M.data.dogan && d0 > 45) {
            const k = M.special('rival', -420, -920), f = spawnAt(M, k, 2);
            const d = M.npc('boss', f.x, f.z, { name: 'Doğan Bey', gang: 'kartallar', look: BOSS_LOOK('kartallar', { hatColor: '#e8e8e8' }), hp: 420, state: 'move' });
            d.path = [{ x: car.pos.x - 2, z: car.pos.z }]; d.moveSpeed = 1.4; d.afterMove = 'idle'; d.scriptKill = true;
            M.data.dogan = d;
            M.setMarkers([{ actor: d, color: 0xff3030 }]);
            M.objective('Doğan Bey çıktı. Arabaya binmesini bekle...');
          }
          const d = M.data.dogan;
          if (!d) return null;
          if (d.dead) return 'next';
          M.s.t += dt;
          if (!d.vehicle && (Math.hypot(d.pos.x - car.pos.x, d.pos.z - car.pos.z) < 3 || M.s.t > 30)) {
            board(M, d, car); fleeCar(M, car); car.ai.cruise = 12;
            M.setMarkers([{ vehicle: car, color: 0xff3030 }]);
            M.objective('Fünyeyi patlat (E) — 25 m\'den uzak dur');
          }
          if (d.vehicle === car) {
            d.pos.copy(car.pos);
            if (M.distTo({ pos: car.pos }) > 25) M.prompt('Fünyeyi patlat', () => {
              M.g.combat.explosion(car.pos.x, 0.8, car.pos.z, 7, 400, M.g.player, null);
              car.damage && car.damage(99999, M.g.player);
              d.vehicle = null; d.model.root.visible = true; d.god = false; d.takeDamage(9999, M.g.player, 'explosion');
            });
            if (M.distTo({ pos: car.pos }) > 300) return 'fail:Doğan Bey menzilden çıktı.';
          }
          return null;
        },
      }),
      step({
        start(M) { M.g.wanted.add(2, true); M.big('DOĞAN BEY ÖLDÜ', 'Beşiktaş\'ta bir sedan alev alev yanıyor', 'gold', 3); M.objective('Polisi atlat'); },
        update(M) { return M.g.wanted.level === 0 ? 'done' : null; },
      }),
      // [8] baskın
      enter('rival', 'Doğan Bey\'in köşküne kapıdan gir (Beşiktaş)', {
        near: [-420, -920],
        populate(M, ctx, I) {
          if (ctx.building !== M.s.b) return;
          M.data.inside = [];
          for (const [x, z] of [[-6, 3], [6, 3], [-4, -2], [4, -2], [-7, -5], [7, -5], [0, 5]]) {
            const n = I.npc(ctx, 'guard', x, z, Math.PI, { gang: 'kartallar', mission: true, weapon: x > 0 ? 'ak' : 'shotgun', look: { ...randomLook(ctx.rng, 'gang'), topColor: GANGS.kartallar.color } });
            n.static = false; n.hostile = true; n.engage(M.g.player, 1.6); M.data.inside.push(n);
          }
          const d = I.npc(ctx, 'boss', 0, -6.5, 0, { name: 'Doğan Bey', gang: 'kartallar', mission: true, weapon: 'shotgun', hp: 800, look: BOSS_LOOK('kartallar', { hatColor: '#e8e8e8' }) });
          d.static = false; d.hostile = true; d.engage(M.g.player, 3); M.data.dogan = d; M.data.inside.push(d);
          M.say(d, 'Babasını satan çakal! Kartallar seni Boğaz\'a gömecek!');
        },
      }),
      killAll('inside', 'Köşkü temizle, Doğan Bey\'i indir', { tick(M) { if (!P(M).inInterior) return 'fail:Köşkten çıktın, Doğan Bey kaçtı!'; return null; }, start0: true }),
      talk(() => [['Sen', 'Kartal yere indi. Beşiktaş artık bizim.']], { after(M) { M.g.wanted.add(1, true); } }),
    ],
    onComplete(M) { if (!M.replay) { M.g.state.territories.kartallar = true; if (M.g.state.gangRel) M.g.state.gangRel.kartallar = -100; M.big('BEŞİKTAŞ ELE GEÇİRİLDİ', 'Kartallar dağıldı', 'gold', 4); } },
  };
  // Doğan Bey'in sahil yürüyüşü: bir yol kenarı boyunca kaldırım, keskin nişancı yuvası ~70 m ötede
  function doganRoute(M) {
    if (M.data.route) return M.data.route;
    const g = M.g;
    const n0 = g.map.nearestNode(60, -620);
    let e = n0.edges.find((ed) => { const o = g.map.other(ed, n0); return Math.abs(o.z - n0.z) > 40; }) || n0.edges[0];
    const n1 = g.map.other(e, n0);
    const dx = n1.x - n0.x, dz = n1.z - n0.z, l = Math.hypot(dx, dz) || 1;
    const ox = -dz / l * 8, oz = dx / l * 8;
    const a = { x: n0.x + ox + dx * 0.1, z: n0.z + oz + dz * 0.1 }, b = { x: n0.x + ox + dx * 0.9, z: n0.z + oz + dz * 0.9 };
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const nest = M.walk(mid.x - ox * 8, mid.z - oz * 8, 0, 25);
    M.data.route = { a, b, nest };
    return M.data.route;
  }

  const murat = {
    id: 'murat', act: 5, title: 'Son Viraj', reward: 80000, respect: 450, added: '1.4',
    short: 'Deli Murat\'ı indir: yarış tuzağı, yol pususu ya da tamirhane baskını.',
    brief: (M) => `Deli Murat Kadıköy'de "Babasını yiyen bizi de yer" diye bağırıp duruyor. ${M.flag('ally') === 'bogaz' ? 'Bir zamanlar bizim için korna çalardı. Artık başka bir şey çalıyor.' : 'İttifakta onu seçmedik; o gün bugündür kin besliyor.'} Kadıköy'ü ondan almadan İstanbul bizim olmaz.`,
    steps: [
      talk((M) => [
        ['Kasap Tahsin', M.flag('tahsin') === 'bolge' ? 'Kadıköy bana söz verildi; Murat\'ı ben de görmek istiyorum. Nasıl yapıyoruz?' : 'Murat hızını sever. Hızı da onu öldürür. Nasıl yapıyoruz?'],
        {
          who: 'Sen', text: 'Yaklaşım:', key: 'murat_yol',
          choice: [
            { label: 'Yarış tuzağı — onu kendi oyununda yen', value: 'yaris', hint: 'Bitiş çizgisinde onu beklerler; önce yarışı kazanmalısın.' },
            { label: 'Yol pususu — konvoyunu yolda kes', value: 'pusu', hint: 'Araçla kovala, arabasını hurdaya çevir.' },
            { label: 'Baskın — tamirhanesini kuşat', value: 'baskin', hint: 'Dalga dalga Boğaz Kardeşler. Murat sonunda ortaya çıkar.' },
          ],
        },
      ], { after(M, r) { M.data.yol = r.murat_yol || M.data.choice_murat_yol || M.flag('murat_yol') || 'baskin'; } }),
      step({ update(M) { const y = M.data.yol || M.flag('murat_yol'); return y === 'yaris' ? 2 : y === 'pusu' ? 5 : 8; } }),
      // [2] yarış
      step({ start(M) { M.startRace('kadikoy'); M.dialog([['Deli Murat', 'Babasını deviren adam yarışa mı geldi? Hahaha! Kaybedersen arabanı değil, kafanı alırım!']]); }, update(M) { const r = M.updateRace(); return r === 'done' ? 'next' : r; } }),
      killAll('crew', 'Deli Murat ve adamları bitişte bekliyor — indir!', {
        spawn(M) {
          const p = P(M).pos;
          const out = [];
          const s = M.walk(p.x, p.z, 14, 26);
          const m = M.enemy('bogaz', s.x, s.z, { kind: 'boss', name: 'Deli Murat', weapon: 'uzi', hp: 600, lookOver: { hat: 'none', glasses: true, top: 'leather', topColor: GANGS.bogaz.color }, delay: 1.5 });
          out.push(m);
          for (let i = 0; i < 3; i++) out.push(M.enemy('bogaz', s.x + 2 + i * 1.5, s.z + 1.5, { weapon: 'pistol', delay: 2 }));
          M.say(m, 'Yendin ha? Bitiş çizgisi mezarın olsun!');
          return out;
        },
      }),
      talk(() => [['Sen', 'Son viraj Murat. Fren yapmayı hiç öğrenmedin.']], { done() { return 'done'; } }),
      // [5] yol pususu
      goTo((M) => M.roadSpot(780, 520, 0, 40), 'Kadıköy\'de pusu noktasına git — Murat\'ın konvoyu buradan geçecek', { r: 10 }),
      step({
        cp: 'Pusu',
        place(M) { const s = M.roadSpot(780, 520, 0, 40); M.place(s.x, s.z, s.h, { car: 'suv', enter: true }); },
        start(M) {
          const g = M.g, p = P(M).pos;
          const rs = g.map.randomEdgeNear(p.x, p.z, 60, 100) || { x: p.x + 70, z: p.z };
          const car = M.car('gt', rs.x, rs.z, 0, '#1060c8');
          const m = M.npc('boss', rs.x, rs.z, { name: 'Deli Murat', gang: 'bogaz', hp: 500, weapon: 'uzi', lookOver: { hat: 'none', glasses: true, top: 'leather', topColor: GANGS.bogaz.color } });
          m.scriptKill = true; board(M, m, car); fleeCar(M, car); car.ai.cruise = 26;
          M.data.m = m; M.data.mcar = car;
          M.gangCar('bogaz', 2, { cruise: 25, min: 70, max: 120, color: '#1d6ec8' });
          M.setMarkers([{ vehicle: car, color: 0xff3030 }]);
          M.objective('Mavi GT: Deli Murat! Arabasını hurdaya çevir');
          M.dialog([['Kasap Tahsin', 'İşte geliyor! Mavi GT, arkasında iki araba. Bas!']]);
        },
        update(M, dt) {
          M.updateGangCars();
          const r = chaseTarget(M, M.data.m, M.data.mcar, dt, { footText: 'Murat arabadan fırladı! Yakala', lose: 380, loseFoot: 150 });
          if (r === 'dead') return 'done';
          if (r === 'lost') return 'fail:Deli Murat kaçtı.';
          if (r === 'caught') return 'next';
          return null;
        },
      }),
      talk((M) => [
        ['Deli Murat', 'Hah... Benim arabamı benim yolumda... Bravo. Bir şey söyleyeyim mi? Baban da böyle bitirdi seni. Arkadan.', { cam: M.data.m ? M.camBetween(P(M), M.data.m, 1) : undefined }],
        ['Sen', 'Ben kimsenin babası değilim Murat. Ve hiç kimsenin oğlu.'],
      ], { after(M) { execute(M, M.data.m, 'pistol'); }, done() { return 'done'; } }),
      // [8] baskın
      goTo((M) => spawnAt(M, M.special('garage', 900, 700), 14), 'Murat\'ın Kadıköy\'deki tamirhanesine git', { r: 10 }),
      step({
        cp: 'Tamirhane',
        place(M) { const p = spawnAt(M, M.special('garage', 900, 700), 14); M.place(p.x, p.z, 0); },
        start(M) {
          const p = spawnAt(M, M.special('garage', 900, 700), 6);
          for (let i = 0; i < 3; i++) M.ally(p.x - 3 + i * 3, p.z + 6, { weapon: i === 1 ? 'shotgun' : 'ak', state: 'follow' });
          M.g.player.armor = Math.max(M.g.player.armor, 60);
          M.waves({
            x: p.x, z: p.z, gang: 'bogaz', waves: [4, 5, 6], minD: 18, maxD: 40, title: 'Tamirhaneyi kuşat', weapons: ['uzi', 'pistol', 'shotgun', 'ak'],
            boss: (M2) => { const s = M2.walk(p.x, p.z, 10, 20); const b = M2.enemy('bogaz', s.x, s.z, { kind: 'boss', name: 'Deli Murat', weapon: 'shotgun', hp: 650, lookOver: { hat: 'none', glasses: true, top: 'leather', topColor: GANGS.bogaz.color } }); M2.say(b, 'Kadıköy\'de bana kafa tutan yok! YOK!'); return b; },
          });
        },
        update(M, dt) { const r = M.updateWaves(dt); return r === 'done' ? 'done' : r; },
        cleanup(M) { M.dialogue.meter(null); },
      }),
    ],
    onComplete(M) { if (!M.replay) { M.g.state.territories.bogaz = true; if (M.g.state.gangRel) M.g.state.gangRel.bogaz = -100; M.big('KADIKÖY ELE GEÇİRİLDİ', 'Boğaz Kardeşler dağıldı', 'gold', 4); } },
  };

  const bolge = {
    id: 'bolge', act: 5, title: 'Beyoğlu\'nun Anahtarı', reward: 90000, respect: 500, added: '1.4',
    short: 'Yılanlar\'ın son kalesi: üç meydanı tut, Engerek\'i indir.',
    brief: 'Kara Yılan öldüğünden beri Beyoğlu\'nun arka sokakları sahipsiz kaldı. Yeğeni Engerek kendini Yılanlar\'ın başı ilan etmiş. Taksim, Tarlabaşı, Galata. Üç meydan; her birine bayrağımızı dik. Beyoğlu bizim olmadan bu şehir tamamlanmaz.',
    steps: [
      goTo((M) => M.walk(-250, -300, 0, 30), 'Taksim meydanına git', { r: 8 }),
      holdSquare('Taksim', -250, -300, [3, 4], { say: () => [['Cin Ali', 'Yılanlar geliyor abi! Meydanı bırakma!']] }),
      goTo((M) => M.walk(-470, -170, 0, 30), 'Tarlabaşı\'na geç', { r: 8 }),
      holdSquare('Tarlabaşı', -470, -170, [4, 4]),
      goTo((M) => M.walk(-120, -30, 0, 30), 'Galata\'ya in — Engerek orada', { r: 8 }),
      holdSquare('Galata', -120, -30, [4, 5], {
        boss: (M2, w) => { const s = M2.walk(w.x, w.z, 30, 45); const b = M2.enemy('yilanlar', s.x, s.z, { kind: 'boss', name: 'Engerek', weapon: 'ak', hp: 700, lookOver: { topColor: GANGS.yilanlar.color, hat: 'none' } }); M2.say(b, 'Amcamın kanı yerde kalmayacak!'); return b; },
        say: () => [['Kasap Tahsin', 'Engerek burada bir yerde. Kafayı kesersen yılan ölür.']],
      }),
      talk(() => [['Cin Ali', 'Beyoğlu bizim abi! Taksim\'den Galata\'ya her köşede bizim adamlar.'], ['Sen', 'Bütün aileleri Dolmabahçe\'ye çağırın. Kim kalmışsa. Yarın masaya oturacağız.']]),
    ],
    onComplete(M) { if (!M.replay) { M.g.state.territories.yilanlar = true; M.big('BEYOĞLU ELE GEÇİRİLDİ', 'İstanbul\'un bütün bölgeleri senin', 'gold', 4); } },
  };

  // finaldeki son düşman: sürgündeki Baba döner; yoksa bağışlanan Kenan; yoksa Rıza; yoksa Doğan Bey'in oğlu
  function nemesis(M) {
    const f = M.flags;
    if (f.baba === 'sur') return { name: 'Reis Baba', look: REIS_LOOK(), gang: 'kurtlar', line: 'Sana demiştim evlat. Sürgüne yollanan baba bir gün kapına döner!' };
    if (f.kenan === 'affet') return { name: 'Kenan', look: KENAN_LOOK(), gang: 'kurtlar', line: 'Babamı öldürdün! Seni bağışladığın gemiden geri döndüm!' };
    if (f.riza !== 'olu') return { name: 'Gözcü Rıza', look: RIZA_LOOK(), gang: 'family', line: 'Reis\'in kanı yerde kalmaz! Sadık adamlar hâlâ var!' };
    return { name: 'Atilla', look: BOSS_LOOK('kartallar', { hat: 'none' }), gang: 'kartallar', line: 'Babamı Beşiktaş\'ta sen öldürdün! Bugün ödeşiyoruz!' };
  }
  const tekHakim = {
    id: 'tek_hakim', act: 5, title: 'İstanbul\'un Tek Hâkimi', reward: 250000, respect: 800, added: '1.4', credits: true,
    short: 'Dolmabahçe\'de aileler diz çöker. Son hesap ve Galata\'dan şehre bakış.',
    brief: 'Bütün aileler Dolmabahçe\'de. Kartallar\'ın, Boğaz Kardeşler\'in, Yılanlar\'ın, Çarşı\'nın, Kurtlar\'ın kalanları. Hepsi senin elini öpmeye geliyor. Ya da öyle diyorlar. Git, tahtına otur.',
    steps: [
      enter('palace', 'Dolmabahçe Sarayı\'na git: aileler seni bekliyor', {
        anyB: true, pick: (M) => M.landmarkDoor('palace'),
        populate(M, ctx, I) {
          const caps = [['kartallar', -5, -5], ['bogaz', -2.5, -6], ['yilanlar', 2.5, -6], ['carsi', 5, -5], ['kurtlar', 0, -7.5]];
          M.data.caps = caps.map(([gg, x, z]) => { const n = I.npc(ctx, 'boss', x, z, 0, { name: `${GANGS[gg].name} temsilcisi`, gang: gg, look: BOSS_LOOK(gg, { hat: 'none' }) }); n.god = true; return n; });
          const t = I.npc(ctx, 'guard', -2, 2, Math.PI, { name: 'Kasap Tahsin', gang: 'family', look: TAHSIN_LOOK() }); t.god = true;
          const a = I.npc(ctx, 'guard', 2, 2, Math.PI, { name: 'Cin Ali', gang: 'family', look: ALI_LOOK() }); a.god = true;
          if (M.flag('baba') === 'sur') { const l = I.npc(ctx, 'resident', 0, 3, Math.PI, { name: 'Leyla', look: LEYLA_LOOK() }); l.god = true; }
        },
      }),
      talk((M) => {
        const f = M.flags, P0 = P(M).pos;
        return [
          ['Kasap Tahsin', 'Ayağa kalkın! İstanbul\'un yeni babası geldi.', { cam: () => M.camWide(0, 3.2, 4, 0, 1.4, -6) }],
          ['Kartallar temsilcisi', 'Beşiktaş... Doğan Bey\'in kırk yıllık köşkü. Anahtarı sizdedir artık.', { cam: () => M.camOver(P0, { x: -5, y: 0, z: -5 })() }],
          ['Boğaz Kardeşler temsilcisi', 'Kadıköy\'ün bütün arabaları sizin. Kornalar artık sizin için çalacak.'],
          ['Çarşı Ailesi temsilcisi', 'Fatih\'in altını... Hacı\'dan kalan ne varsa. Bismillah.'],
          ['Kurtlar temsilcisi', 'Üsküdar uludu, sustu. Bundan sonra sizin sesinizle ulur.'],
          ['Sen', 'Kural basit. Esnafa dokunulmayacak. Uyuşturucu bu şehre girmeyecek. Ve bir daha hiç kimse... hiç kimse başkasının yerine yatmayacak.', { cam: () => M.camOver({ x: 0, y: 0, z: -7 }, P0)() }],
          f.baba === 'sur' ? ['Leyla', 'Babam bu salonu hayal ederdi. Sen yaptın.'] : ['Cin Ali', 'Abi... Yedi yıl önce koğuştaydın. Şimdi Dolmabahçe\'desin.'],
          ['Telsiz', 'Patron! Dışarıda araçlar var! Silahlı adamlar sarayı sarıyor!'],
        ];
      }),
      step({ start(M) { M.objective('Saraydan çık — son hesap!'); }, update(M) { return P(M).inInterior ? null : 'next'; } }),
      step({
        cp: 'Son hesap',
        place(M) { const d = M.landmarkDoor('palace'); M.place(d.door.x, d.door.z + 4, 0); },
        start(M) {
          const d = M.landmarkDoor('palace'), p = { x: d.door.x, z: d.door.z + 5 };
          const nm = nemesis(M);
          if (!M.replay) M.setFlag('finalBoss', nm.name);
          M.data.nm = nm;
          M.g.player.armor = 100;
          for (let i = 0; i < 4; i++) M.ally(p.x - 3 + i * 2, p.z + 1, { weapon: i % 2 ? 'ak' : 'm4' });
          const ali = M.ally(p.x + 3, p.z - 1, { name: 'Cin Ali', look: ALI_LOOK(), weapon: 'shotgun', hp: 500 }); ali.god = true;
          M.waves({
            x: p.x, z: p.z, gang: nm.gang, waves: [5, 6, 7], minD: 26, maxD: 50, title: 'Sarayı savun', weapons: ['ak', 'm4', 'shotgun', 'uzi'],
            boss: (M2) => { const s = M2.walk(p.x, p.z, 25, 40); const b = M2.enemy(nm.gang, s.x, s.z, { kind: 'boss', name: nm.name, weapon: 'm4', hp: 1100, look: nm.look }); M2.data.boss = b; M2.say(b, nm.line); return b; },
          });
          M.dialog([['Sen', 'Herkes yerine! Bu saray bu gece düşmeyecek.']]);
        },
        update(M, dt) {
          const b = M.data.boss;
          if (b && !b.dead && b.hp < b.maxHp * 0.25) { b.god = true; b.state = 'surrender'; b.target = null; if (M.s.wv) for (const n of M.s.wv.enemies) if (!n.dead && n !== b) n.takeDamage(999, null, 'bullet'); M.dialogue.meter(null); return 'next'; }
          const r = M.updateWaves(dt);
          if (r === 'done') return 'next';
          return r;
        },
        cleanup(M) { M.dialogue.meter(null); },
      }),
      talk((M) => {
        const nm = M.data.nm || nemesis(M), b = M.data.boss;
        const cam = b && !b.dead ? { cam: M.camBetween(P(M), b, 1) } : {};
        if (!b || b.dead) return [['Sen', `${nm.name} yerde. Bitti.`]];
        const lines = nm.name === 'Reis Baba'
          ? [['Reis Baba', 'Sana demiştim... Kapına döndüm. Ama yaşlıyım evlat. Tetiği çekecek kadar bile değil.', cam], ['Sen', 'Bu sefer sürgün yok Reis.']]
          : nm.name === 'Kenan'
            ? [['Kenan', 'Babamı... Babamı sen... Bağışladığın adam geri geldi işte!', cam], ['Sen', 'Bir kere bağışladım Kenan. İkinci kere yok.']]
            : [[nm.name, 'Bitir artık. Bu şehirde sana kafa tutacak kimse kalmadı.', cam]];
        return [...lines, {
          who: 'Sen', text: `${nm.name}:`, key: 'son',
          choice: [
            { label: 'Son kurşun', value: 'oldur', hint: 'Taht kanla korunur.', lines: [['Sen', 'İstanbul\'un tek bir sahibi olur.']] },
            { label: '"Git. Yaşa. Ve her gün kimin sayesinde yaşadığını hatırla."', value: 'birak', hint: 'Merhamet de bir güçtür. Belki.', lines: [[nm.name, '...']] },
          ],
        }];
      }, {
        after(M, r) {
          const v = r.son || M.data.choice_son;
          const b = M.data.boss;
          if (!b || b.dead) return;
          if (v === 'oldur') execute(M, b, 'pistol'); else { b.god = true; b.state = 'flee'; b.fleeFrom = P(M).pos.clone(); b.fleeT = 30; b.mission = false; b.hostile = false; }
          M.g.wanted.reset(); M.g.npcs.calmPolice();
        },
      }),
      goTo((M) => { const g = M.g.galata || { cx: -110, cz: 10, R: 6.5 }; return { x: g.cx, z: g.cz + g.R + 3 }; }, 'Galata Kulesi\'ne çık: şehrine bir kez de yukarıdan bak', { r: 4, cp: 'Galata' }),
      step({
        start(M) {
          const g = M.g;
          g.goGalataTop();
          g.env.time = 20.5;
          const G = g.galata;
          const who = M.flag('baba') === 'sur' ? 'Leyla' : 'Cin Ali';
          const n = M.npc('civilian', G.cx + 1.2, G.cz + G.R * 0.55 + 2, { name: who, look: who === 'Leyla' ? LEYLA_LOOK() : ALI_LOOK(), state: 'idle', y: 47.2 });
          n.pos.y = 47.2; n.god = true;
        },
        update() { return 'next'; },
      }),
      talk((M) => {
        const f = M.flags, G = M.g.galata || { cx: -110, cz: 10 };
        const son = f.son || M.data.choice_son;
        const ending = endingName(f, son);
        M.data.ending = ending;
        const L = f.baba === 'sur' ? 'Leyla' : 'Cin Ali';
        return [
          [L, L === 'Leyla' ? 'Bak... Haliç, Boğaz, Kız Kulesi. Babam bu manzarayı otuz yıl önce sevmiş. Şimdi hepsi senin.' : 'Bak abi... Haliç, Boğaz, Kız Kulesi. Hepsi senin. Koğuştaki o pencereyi hatırlıyor musun?', { cam: () => M.camWide(G.cx + 12, 52, G.cz + 18, G.cx + 200, 20, G.cz + 200) }],
          [L, f.sadakat === 'kacir' ? 'Ege\'den bir terzi mektup yollamış. Bir takım elbise dikmiş sana. "Tahta uygun olsun" diye.' : f.sadakat === 'infaz' ? 'Terzi Nuri\'nin kızı Zeynep\'i yetimhaneye vermişler. Her ay bir zarf gidiyor. İsimsiz.' : 'Terzi Nuri\'yi Tahsin halletti, biliyorsun. Bunu hiç unutmadın, değil mi?'],
          [L, f.sinan === 'spare' ? 'Sinan Ege\'de balık tutuyor. "Borcum ödendi" diyor.' : 'Sinan\'ın karısına bir dükkân açtık. Hiçbir şey sormadı.'],
          [L, f.tahsin === 'bolge' ? 'Tahsin Kadıköy\'ün başında. Sadık... şimdilik. Gözünü ondan ayırma.' : 'Tahsin limandaki payını sayıyor. Para dili herkesin dili.'],
          ['Sen', son === 'oldur' ? 'Bu şehirde kimseye borcum kalmadı. Kimsenin de bana.' : 'Merhamet bu şehirde nadir bulunur. Belki o yüzden değerlidir.'],
          [L, 'Mahallede sana yeni bir isim takmışlar, biliyor musun?'],
          ['Sen', `Biliyorum. ${ending}.`],
        ];
      }),
    ],
    onComplete(M) { const e = M.data.ending || 'İSTANBUL\'UN TEK HÂKİMİ'; if (!M.replay) M.setFlag('ending', e); setTimeout(() => M.g.ui.bigMessage(e, 'İstanbul Mafya · Hikâye tamamlandı', 'gold', 6), 4200); },
  };
  function endingName(f, son) {
    if (f.baba === 'oldur' && son === 'oldur') return 'DEMİR TAHT';
    if (f.baba === 'sur' && son === 'birak') return 'MERHAMETLİ HÜKÜMDAR';
    if (f.baba === 'sur' && son === 'oldur') return 'BOĞAZ\'IN YENİ BABASI';
    if (f.leylaSoz === 'soz' && f.baba === 'sur') return 'AİLENİN YENİ BAŞI';
    return 'İSTANBUL\'UN TEK HÂKİMİ';
  }

  return { takip, sadakat, gizli, kurtarma, devrilme, dogan, murat, bolge, tekHakim, endingName };
}

// Sevgili sistemi: tanışma, flört seçenekleri, ilişki ölçeri, randevu (bankta oturup sohbet), el ele yürüme,
// sarılma ve öpüşme sahneleri (prosedürel çift pozu + sinematik kamera). Yanındayken araca otomatik biner
// (vehicle.addPassenger / removePassenger). Telefonla arar, randevuya çağırır. Durum: state.romance.
import * as THREE from 'three';
import { randomLook } from '../entities/character.js';
import { rng, formatMoney, dampAngle } from '../core/util.js';
import { SPEAKERS } from './dialogue.js';

export const SWEETHEARTS = {
  defne: {
    id: 'defne', name: 'Defne', color: '#ff8ab8', where: 'Kadıköy', near: [700, 560], home: 'cafe',
    bio: 'Moda\'da bir sahafta çalışıyor. Kitap, deniz ve dürüstlük sever; kabalıktan ve hava atmaktan nefret eder.',
    likes: { nazik: 3, espri: 1, merak: 3, para: -2, kaba: -6, cesaret: 0 },
    look: () => ({ ...randomLook(rng, 'civilian'), gender: 'f', hair: 'dalgali', hairColor: '#5a2a14', top: 'coat', topColor: '#c9a070', pants: 'slacks', pantsColor: '#2a2a3a', glasses: true, hat: 'none', beard: 'none', build: 0.96 }),
  },
  selin: {
    id: 'selin', name: 'Selin', color: '#c98aff', where: 'Beyoğlu', near: [-300, -120], home: 'clothes',
    bio: 'İstiklal\'de butiği var. Hırslı, hızlı konuşur, gece kuşu. Cesaretten ve esprili adamlardan hoşlanır.',
    likes: { nazik: 1, espri: 3, merak: 1, para: 2, kaba: -5, cesaret: 3 },
    look: () => ({ ...randomLook(rng, 'civilian'), gender: 'f', hair: 'uzun', hairColor: '#120c08', top: 'leather', topColor: '#1a1a1a', pants: 'slacks', pantsColor: '#111111', glasses: false, hat: 'none', beard: 'none', build: 0.95 }),
  },
};
for (const s of Object.values(SWEETHEARTS)) SPEAKERS[s.name] = { color: s.color, freq: 440 };

export const STAGES = [[0, 'Yabancı'], [15, 'Tanıdık'], [35, 'Arkadaş'], [60, 'Flört'], [80, 'Sevgili']];
export function stageOf(r) {
  let n = STAGES[0][1];
  for (const [v, name] of STAGES) if (r.love >= v) n = name;
  if (n === 'Sevgili' && !r.kissed) n = 'Flört';
  return n;
}

const TOPICS = {
  defne: [
    ['Ne okuyorsun bu aralar?', 'merak', 'Eski bir İstanbul romanı. Yalılar, kayıklar, kaybolmuş aşklar... Sen kitap okur musun, yoksa sadece kurşun mu sayarsın?'],
    ['Gülüşün Boğaz\'ın sabahına benziyor.', 'nazik', 'Hıh... Bunu kaç kişiye söyledin? Neyse, iyi söyledin ama.'],
    ['Bu şehirde martılar bile kira ödemiyor, bir ben ödüyorum.', 'espri', 'Ha ha! Martılar en azından simidi paylaşıyor. Sen paylaşır mısın?'],
    ['Cebimde bu sahafı satın alacak kadar para var.', 'para', 'Sahaf satılık değil. Ben de değilim.'],
  ],
  selin: [
    ['Butiğin İstiklal\'in en şık vitrini.', 'nazik', 'Biliyorum. Ama senden duymak da fena değil.'],
    ['Beni bu gece Galata\'ya götür, kuleye beraber çıkalım.', 'cesaret', 'Ooo, cesur! Kuleye çıkanlar ya aşık olur ya da düşer. Sen hangisisin?'],
    ['Taksim\'de trafik bile senin kadar hızlı değil.', 'espri', 'Ha! Kabul, hızlı konuşurum. Yetişebilirsen yetiş.'],
    ['Paranın açamayacağı kapı yoktur.', 'para', 'Belki. Ama bazı kapıları sadece gülümsemeyle açarsın.'],
  ],
};

const _v = new THREE.Vector3();

export class Romance {
  constructor(game) {
    this.g = game;
    this.npcs = {};
    this.markers = { list: [], version: 0 };
    this.with = null; // yanında olan (id)
    this.hand = false; // el ele yürüyüş
    this.scene = null; // randevu sahnesi
    this.meet = null; // telefonla ayarlanan buluşma {id}
    this.callT = 240 + Math.random() * 200;
    this._mk = '';
    game.missions.addMarkerSet(this.markers);
  }
  get S() {
    const s = this.g.state;
    if (!s.romance) s.romance = {};
    for (const id of Object.keys(SWEETHEARTS)) if (!s.romance[id]) s.romance[id] = { met: false, love: 0, dates: 0, kissed: false, day: -1, today: 0, gifts: 0, dead: false };
    return s.romance;
  }
  rel(id) { return this.S[id]; }
  partner() { return this.with ? this.npcs[this.with] : null; }
  addLove(id, d, why) {
    const r = this.rel(id);
    // aynı gün içinde sohbetten gelen artış sınırlı (her gün yeniden kazanılır)
    if (d > 0) { if (r.day !== this.g.env.day) { r.day = this.g.env.day; r.today = 0; } const cap = Math.max(0, 22 - r.today); d = Math.min(d, cap); r.today += d; }
    const before = stageOf(r);
    r.love = Math.max(0, Math.min(100, r.love + d));
    const after = stageOf(r);
    if (d) this.g.ui.notify(`${SWEETHEARTS[id].name}: ${d > 0 ? '+' : ''}${d} kalp${why ? ' · ' + why : ''}`, d > 0 ? 'good' : 'warn');
    if (after !== before) this.g.ui.bigMessage(after.toUpperCase(), `${SWEETHEARTS[id].name} ile ilişkiniz`, d > 0 ? 'gold' : 'red', 2.6);
  }

  // ---------------- yer / doğma ----------------
  homeSpot(id) {
    const d = SWEETHEARTS[id], g = this.g;
    if (d._spot) return d._spot;
    const b = g.map.nearestOfType(d.home, d.near[0], d.near[1]);
    const nz = (b && b.door.nz) || 1;
    d._spot = b ? { x: b.door.x + 2.2, z: b.door.z + nz * 2.4, face: nz > 0 ? 0 : Math.PI, b } : { x: d.near[0], z: d.near[1], face: 0 };
    return d._spot;
  }
  dateBench(near) {
    const B = this.g.city.benches || [];
    let best = null, bd = 160;
    for (const b of B) {
      const d = Math.hypot(b[0] - near.x, b[1] - near.z);
      if (d < bd && d > 4) { bd = d; best = b; }
    }
    return best ? { x: best[0], z: best[1], a: best[2] } : null;
  }
  spawn(id, x, z) {
    const d = SWEETHEARTS[id];
    const n = this.g.npcs.add('civilian', x, z, d.look(), { persistent: true, name: d.name, state: 'idle', home: new THREE.Vector3(x, 0, z) });
    n.brave = false; n.sweetheart = id; n.maxHp = n.hp = 120;
    n.faceYaw = this.homeSpot(id).face;
    this.npcs[id] = n;
    return n;
  }
  despawn(id) {
    const n = this.npcs[id];
    if (!n) return;
    if (n.passengerOf) n.passengerOf.removePassenger(n);
    this.g.npcs.remove(n);
    delete this.npcs[id];
    if (this.with === id) { this.with = null; this.hand = false; this.clearPose(); }
  }

  // ---------------- arayüz ----------------
  prompt() {
    const g = this.g, p = g.player;
    if (p.vehicle || p.inInterior || this.scene || g.ui.blocking()) return null;
    if (this.with && this.datePt && Math.hypot(p.pos.x - this.datePt.x, p.pos.z - this.datePt.z) < 2.6) {
      const n = this.partner();
      if (n && Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z) < 6) return { label: `Otur: ${n.name} ile sohbet et`, action: () => this.startDate() };
    }
    for (const id of Object.keys(this.npcs)) {
      const n = this.npcs[id];
      if (n.dead || n.state === 'flee') continue;
      const d = Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z);
      if (d < 2.3) return { label: this.with === id ? `${n.name} ile...` : `Konuş: ${n.name}`, action: () => this.talk(id) };
    }
    return null;
  }

  talk(id) {
    const g = this.g, r = this.rel(id), d = SWEETHEARTS[id], n = this.npcs[id];
    if (!n) return;
    n.state = 'idle'; n.faceYaw = Math.atan2(g.player.pos.x - n.pos.x, g.player.pos.z - n.pos.z);
    const D = g.missions.dialogue;
    if (!r.met) return this.firstMeet(id);
    if (this.with === id) return this.withMenu(id);
    const st = stageOf(r);
    const greet = r.love >= 60 ? 'Sonunda geldin! Ben de seni düşünüyordum.' : r.love >= 35 ? 'Aa, sen! Nasılsın bakalım?' : 'Yine mi sen? Peki, merhaba.';
    const menu = [
      { label: 'Sohbet et', value: 'chat', hint: 'Onu tanı. Doğru söz kalbini açar.' },
      { label: `Çiçek ve çikolata ver (${formatMoney(1500)})`, value: 'gift', hint: 'Küçük ama etkili.', disabled: () => g.state.money < 1500 },
      { label: 'Benimle gezmeye çıkar mısın?', value: 'date', hint: r.love >= 30 ? 'Randevu: seninle gelir, araca biner, bir bankta oturursunuz.' : 'Önce biraz daha tanışmalısınız (Arkadaş).', disabled: r.love < 30 },
      { label: 'Hoşça kal', value: 'bye' },
    ];
    D.play([{ who: d.name, text: greet + (st === 'Sevgili' ? ' Sevgilim.' : ''), choice: menu, key: 'm' }], (res) => {
      if (res.m === 'chat') this.chat(id);
      else if (res.m === 'gift') {
        g.state.money -= 1500; g.audio.cash(); r.gifts++;
        D.play([[d.name, r.gifts > 3 ? 'Yine mi çiçek? Evim çiçekçiye döndü... ama devam et.' : 'Laleler! İstanbul\'da lale hâlâ en güzel hediyedir. Teşekkür ederim.']], () => this.addLove(id, r.gifts > 3 ? 3 : 7, 'hediye'));
      } else if (res.m === 'date') this.join(id, true);
    }, { act: `${d.name} · ${st}` });
  }
  firstMeet(id) {
    const g = this.g, d = SWEETHEARTS[id], r = this.rel(id), D = g.missions.dialogue;
    const opener = id === 'defne' ? 'Pardon, yolumu kapatıyorsun. ...Bir dakika, seni bir yerden tanıyor muyum?' : 'Vitrine mi bakıyorsun, bana mı? İkisi de pahalı, haberin olsun.';
    const opts = TOPICS[id].map(([label, tag]) => ({ label, value: tag }));
    opts.push({ label: '"Kızım, gel benimle takıl."', value: 'kaba' });
    D.play([
      { who: d.name, text: opener },
      { who: 'Sen', text: 'Ne diyeceğini bilememek... bende pek olmaz. Ama oldu işte.', choice: opts, key: 'o' },
    ], (res) => {
      const tag = res.o;
      const k = d.likes[tag] || 0;
      const reply = tag === 'kaba' ? 'Hayır, gelmeyeyim. Bir daha da böyle konuşma benimle.' : (TOPICS[id].find((t) => t[1] === tag) || [])[2] || '...';
      const lines = [[d.name, reply]];
      if (k >= 0) lines.push([d.name, k >= 2 ? `Ben ${d.name}. Numaramı yaz bakalım, kaybetme.` : `${d.name}. Belki yine karşılaşırız.`]);
      D.play(lines, () => {
        if (k >= 0) { r.met = true; this.addLove(id, 6 + k * 3, 'ilk izlenim'); g.ui.notify(`${d.name} rehberine eklendi. J: görev defteri · Kalp sekmesi`, 'info'); }
        else { this.addLove(id, k * 2); const n = this.npcs[id]; if (n) { n.state = 'walk'; n.path = []; } }
      });
    }, { act: `${d.name} · İlk karşılaşma` });
  }
  chat(id) {
    const g = this.g, d = SWEETHEARTS[id], D = g.missions.dialogue;
    const pool = TOPICS[id].slice().sort(() => Math.random() - 0.5).slice(0, 3);
    D.play([{ who: 'Sen', text: 'Anlat bakalım...', choice: pool.map(([label, tag]) => ({ label, value: tag })), key: 'c' }], (res) => {
      const t = TOPICS[id].find((x) => x[1] === res.c);
      const k = d.likes[res.c] || 0;
      D.play([[d.name, t ? t[2] : '...']], () => this.addLove(id, k >= 0 ? 2 + k * 2 : k * 2, k > 1 ? 'hoşuna gitti' : k < 0 ? 'hoşlanmadı' : ''));
    });
  }
  // yanında olan sevgili menüsü
  withMenu(id) {
    const g = this.g, d = SWEETHEARTS[id], r = this.rel(id), D = g.missions.dialogue;
    const menu = [
      { label: this.hand ? 'Elini bırak' : 'Elini tut', value: 'hand', hint: r.love >= 45 ? 'El ele yürüyün.' : 'Henüz erken (45 kalp).', disabled: r.love < 45 && !this.hand },
      { label: 'Sarıl', value: 'hug', hint: r.love >= 55 ? '' : 'Henüz erken (55 kalp).', disabled: r.love < 55 },
      { label: 'Öp', value: 'kiss', hint: r.love >= 70 ? (r.kissed ? '' : 'İlk öpücük...') : 'Henüz erken (70 kalp).', disabled: r.love < 70 },
      { label: 'Seni eve bırakayım', value: 'home', hint: 'Randevuyu bitir.' },
      { label: 'Vazgeç', value: 'x' },
    ];
    D.play([{ who: d.name, text: this.hand ? 'Hı? Söyle.' : 'Efendim?', choice: menu, key: 'w' }], (res) => {
      if (res.w === 'hand') { this.hand = !this.hand; if (!this.hand) this.clearPose(); else g.ui.bark(this.partner(), 'Ellerin ne sıcakmış.'); }
      else if (res.w === 'hug') this.embrace(id, 'hug');
      else if (res.w === 'kiss') this.embrace(id, 'kiss');
      else if (res.w === 'home') this.sendHome(id, 'Bugün güzeldi. Beni ara, tamam mı?');
    });
  }

  // ---------------- birlikte gezme ----------------
  join(id, fromTalk) {
    const g = this.g, n = this.npcs[id], d = SWEETHEARTS[id];
    if (!n) return;
    if (this.with && this.with !== id) this.sendHome(this.with, 'Peki... Sonra konuşuruz.');
    this.with = id; this.hand = false;
    n.state = 'follow'; n.baseState = 'follow'; n.leader = g.player; n.home = null;
    n._hp = n.hp;
    const b = this.dateBench(this.homeSpot(id));
    this.datePt = b ? { x: b.x + Math.sin(b.a) * 0.6, z: b.z + Math.cos(b.a) * 0.6, bench: b } : null;
    this.updateMarkers(true);
    if (this.datePt) g.setGps(this.datePt.x, this.datePt.z);
    if (fromTalk) g.missions.dialogue.play([[d.name, b ? 'Olur! Yakında deniz gören bir bank biliyorum. Hadi, sen önden yürü... ya da araban varsa beni de al.' : 'Olur, nereye gidersen.']]);
    this.rel(id).joinedAt = g.env.day;
  }
  sendHome(id, line) {
    const g = this.g, n = this.npcs[id], d = SWEETHEARTS[id];
    this.endScene();
    if (n) {
      if (n.passengerOf) n.passengerOf.removePassenger(n);
      if (line) g.ui.bark(n, line);
      const h = this.homeSpot(id);
      n.state = 'move'; n.baseState = 'idle'; n.path = [{ x: h.x, z: h.z, r: 1 }]; n.moveSpeed = 1.6; n.afterMove = 'idle'; n.home = new THREE.Vector3(h.x, 0, h.z);
      n.couple = null;
    }
    if (this.with === id) { this.with = null; this.hand = false; this.datePt = null; this.clearPose(); g.setGps(null); }
    this.updateMarkers(true);
    void d;
  }
  clearPose() { const n = this.partner(); if (n) n.couple = null; this.g.player.couple = null; }

  // ---------------- randevu sahnesi ----------------
  startDate() {
    const g = this.g, p = g.player, n = this.partner(), id = this.with;
    if (!n || !this.datePt) return;
    const b = this.datePt.bench;
    const a = b.a, fx = Math.sin(a), fz = Math.cos(a), rx = -fz, rz = fx;
    this.hand = false; this.clearPose();
    this.saveWeapon = p.weapon; p.setWeapon('fists');
    const seat = (k) => ({ x: b.x + fx * 0.25 + rx * 0.45 * k, z: b.z + fz * 0.25 + rz * 0.45 * k });
    this.scene = { b, a, pp: seat(1), np: seat(-1), mode: 'sit', t: 0, id };
    n.state = 'sit'; n.routineT = 1e9; n.faceYaw = a; n.sitting = true;
    p.sitting = true;
    this.lockScene();
    const r = this.rel(id);
    r.dates++;
    this.dateMenu(true);
  }
  // kamera: önden ikisini birden gören geniş çekim / yakın çekim
  sceneCam(kind) {
    const S = this.scene; if (!S) return null;
    const a = S.a, fx = Math.sin(a), fz = Math.cos(a), rx = -fz, rz = fx;
    const mx = (S.pp.x + S.np.x) / 2, mz = (S.pp.z + S.np.z) / 2;
    if (kind === 'close') return { pos: new THREE.Vector3(mx + fx * 1.5 + rx * 0.9, 1.35, mz + fz * 1.5 + rz * 0.9), look: new THREE.Vector3(mx, 1.0, mz) };
    if (kind === 'side') { const c = S.mid || { x: mx, z: mz }; const hx = S.hx || rx, hz = S.hz || rz; return { pos: new THREE.Vector3(c.x - hz * 1.7 + hx * 0.25, 1.72, c.z + hx * 1.7 + hz * 0.25), look: new THREE.Vector3(c.x, 1.55, c.z) }; }
    return { pos: new THREE.Vector3(mx + fx * 3.2, 1.6, mz + fz * 3.2), look: new THREE.Vector3(mx, 0.95, mz) };
  }
  dateMenu(first) {
    const g = this.g, id = this.scene && this.scene.id, d = SWEETHEARTS[id], r = this.rel(id), D = g.missions.dialogue;
    if (!d) return;
    const S = this.scene;
    const topics = TOPICS[id].slice().sort(() => Math.random() - 0.5).slice(0, 2);
    const opts = [
      ...topics.map(([label, tag]) => ({ label, value: 't:' + tag })),
      { label: S.mode === 'hand' ? 'Elini bırak' : 'Elini tut', value: 'hand', disabled: r.love < 45 && S.mode !== 'hand', hint: r.love < 45 ? 'Henüz erken (45 kalp)' : '' },
      { label: 'Sarıl', value: 'hug', disabled: r.love < 55, hint: r.love < 55 ? 'Henüz erken (55 kalp)' : '' },
      { label: 'Öp', value: 'kiss', disabled: r.love < 70, hint: r.love < 70 ? 'Henüz erken (70 kalp)' : (r.kissed ? '' : 'İlk öpücük') },
      { label: 'Kalkalım', value: 'end' },
    ];
    const text = first ? (r.dates > 1 ? 'Yine bu bank... Bizim bankımız oldu artık.' : 'Ne güzel manzara. Burada hiç kimse peşimizde değil, değil mi?') : '...';
    D.play([{ who: d.name, text, choice: opts, key: 'd', cam: this.sceneCam(S.mode === 'hand' ? 'close' : 'wide') }], (res) => {
      const v = res.d || 'end';
      if (v.startsWith('t:')) {
        const tag = v.slice(2), t = TOPICS[id].find((x) => x[1] === tag), k = d.likes[tag] || 0;
        D.play([[d.name, t[2], { cam: this.sceneCam('close') }]], () => { this.addLove(id, k >= 0 ? 3 + k * 2 : k * 2); this.dateMenu(false); });
      } else if (v === 'hand') {
        S.mode = S.mode === 'hand' ? 'sit' : 'hand';
        const n = this.partner();
        if (S.mode === 'hand') { g.player.couple = { kind: 'hand', side: -1 }; n.couple = { kind: 'hand', side: 1 }; } else this.clearPose();
        D.play([[d.name, S.mode === 'hand' ? 'Bırakma ama...' : 'Hı? Peki.', { cam: this.sceneCam('close') }]], () => { if (S.mode === 'hand') this.addLove(id, 3, 'el ele'); this.dateMenu(false); });
      } else if (v === 'hug' || v === 'kiss') this.embrace(id, v, () => this.dateMenu(false));
      else this.endDate();
    }, { act: `Randevu · ${d.name} · ${stageOf(r)}` });
  }
  // Sarılma / öpüşme: ayağa kalkar, yüz yüze gelir, çift pozu ve yakın yan çekim
  embrace(id, kind, then) {
    const g = this.g, p = g.player, n = this.npcs[id], d = SWEETHEARTS[id], r = this.rel(id), D = g.missions.dialogue;
    if (!n) return;
    const prev = this.scene;
    // yüz yüze konum: oyuncunun önü
    const hx = Math.sin(p.heading), hz = Math.cos(p.heading);
    const base = prev ? { x: (prev.pp.x + prev.np.x) / 2 + Math.sin(prev.a) * 0.7, z: (prev.pp.z + prev.np.z) / 2 + Math.cos(prev.a) * 0.7 } : { x: p.pos.x + hx * 0.3, z: p.pos.z + hz * 0.3 };
    const ax = prev ? Math.cos(prev.a) : hx, az = prev ? -Math.sin(prev.a) : hz; // karşılıklı eksen (oyuncu → sevgili)
    const gap = kind === 'kiss' ? 0.2 : 0.24;
    this.saveWeapon = this.saveWeapon || p.weapon; p.setWeapon('fists');
    this.scene = { ...(prev || { a: p.heading, id }), id, mode: kind, emb: true, prevScene: prev, mid: base, hx: ax, hz: az,
      pp: { x: base.x - ax * gap, z: base.z - az * gap }, np: { x: base.x + ax * gap, z: base.z + az * gap } };
    this.hand = false;
    n.state = 'idle'; n.sitting = false; p.sitting = false; n.home = null;
    p.couple = { kind, side: 1 }; n.couple = { kind, side: 1 };
    this.lockScene();
    const first = kind === 'kiss' && !r.kissed;
    const lines = kind === 'kiss'
      ? [[d.name, first ? '...' : 'Yine mi? ...Gel buraya.', { cam: this.sceneCam('side') }], [d.name, first ? 'Bunu ne zamandır bekliyordum, biliyor musun?' : 'Bu şehirde senden başka hiçbir şeye güvenmiyorum.', { cam: this.sceneCam('side') }]]
      : [[d.name, 'Sarıl bana... Biraz daha.', { cam: this.sceneCam('side') }], [d.name, 'Kalbin ne hızlı atıyor. Korkuyor musun?', { cam: this.sceneCam('side') }]];
    D.play(lines, () => {
      if (first) { r.kissed = true; g.ui.bigMessage('İLK ÖPÜCÜK', `${d.name} artık sevgilin`, 'gold', 3.5); this.addLove(id, 10, 'ilk öpücük'); }
      else this.addLove(id, kind === 'kiss' ? 4 : 3);
      p.couple = null; n.couple = null;
      if (prev) { this.scene = prev; n.state = 'sit'; n.sitting = true; p.sitting = true; if (prev.mode === 'hand') { p.couple = { kind: 'hand', side: -1 }; n.couple = { kind: 'hand', side: 1 }; } }
      else this.endScene();
      if (then) then();
    }, { act: kind === 'kiss' ? 'Öpücük' : 'Sarılma' });
  }
  endDate() {
    const g = this.g, id = this.scene && this.scene.id, d = SWEETHEARTS[id], r = this.rel(id);
    this.endScene();
    g.missions.dialogue.play([[d.name, r.love >= 60 ? 'Bugün çok güzeldi. Bir dahakine sen seç yeri.' : 'Fena değildi. Hadi gidelim.']], () => this.addLove(id, 4, 'randevu'));
  }
  endScene() {
    const g = this.g, p = g.player, S = this.scene;
    if (!S) return;
    this.scene = null;
    p.sitting = false; p.couple = null;
    const n = this.npcs[S.id];
    if (n) { n.sitting = false; n.couple = null; if (this.with === S.id) { n.state = 'follow'; n.leader = p; } }
    if (S.pp && S.b) { p.pos.set(S.pp.x + Math.sin(S.a) * 0.6, 0, S.pp.z + Math.cos(S.a) * 0.6); }
    if (this.saveWeapon && p.weapons[this.saveWeapon]) p.setWeapon(this.saveWeapon);
    this.saveWeapon = null;
    g.cutsceneCam = null;
  }
  // sahnede konumları kilitle (oyuncu güncellemesinden sonra çağrılır)
  lockScene() {
    const S = this.scene, g = this.g, p = g.player, n = this.npcs[S.id];
    if (!S || !n) return;
    const face = S.emb ? Math.atan2(S.hx, S.hz) : S.a;
    p.pos.set(S.pp.x, 0, S.pp.z); p.vx = p.vz = 0; p.speed = 0; p.vy = 0;
    p.heading = face; p.syncModel();
    n.pos.set(S.np.x, 0, S.np.z); n.heading = S.emb ? face + Math.PI : S.a; n.speed = 0; n.faceYaw = n.heading;
    n.sync && n.sync();
  }

  // ---------------- işaretçiler ----------------
  updateMarkers(force) {
    const list = [];
    for (const id of Object.keys(SWEETHEARTS)) {
      const r = this.rel(id);
      if (r.dead) continue;
      const n = this.npcs[id];
      if (this.with === id) continue;
      const h = this.homeSpot(id);
      if (this.meet === id || r.met) list.push({ x: n ? n.pos.x : h.x, z: n ? n.pos.z : h.z, color: 0xff6aa8, icon: 'heart', label: SWEETHEARTS[id].name, blink: this.meet === id });
      else list.push({ x: h.x, z: h.z, color: 0xff9ac8, icon: 'heart', label: '?', mmHide: true });
    }
    if (this.with && this.datePt) list.push({ x: this.datePt.x, z: this.datePt.z, color: 0xff6aa8, icon: 'heart', label: 'Randevu', blink: true });
    const key = list.map((m) => m.label + (m.x | 0) + (m.z | 0) + m.blink).join();
    if (force || key !== this._mk) { this._mk = key; this.markers.list = list; this.markers.version++; }
  }

  // telefonla ara (görev defterinden)
  phone(id) {
    const g = this.g, d = SWEETHEARTS[id], r = this.rel(id), D = g.missions.dialogue;
    if (r.dead) return;
    if (this.with === id) { g.ui.notify(`${d.name} zaten yanında.`, 'info'); return; }
    const h = g.env.hour;
    const ok = r.love >= 25 && h >= 9 && h < 23;
    D.play([['Sen', `Alo, ${d.name}?`], [d.name, ok ? 'Seni düşünüyordum! Buluşalım mı? Her zamanki yerde bekliyorum.' : h < 9 || h >= 23 ? 'Saat kaç biliyor musun? Uyuyordum... Yarın ara.' : 'Şu an müsait değilim. Sonra konuşuruz.']], () => {
      if (ok) { this.meet = id; const sp = this.homeSpot(id); g.setGps(sp.x, sp.z); this.updateMarkers(true); g.ui.notify(`${d.name} seni ${d.where}\'de bekliyor`, 'info'); }
    }, { phone: d.name });
  }

  // ---------------- kare güncellemesi ----------------
  update(dt) {
    const g = this.g, p = g.player, S = this.S;
    if (!g.state) return;
    const hour = g.env.hour;
    const day = hour >= 9 && hour < 23;
    if (!p.inInterior) {
      for (const id of Object.keys(SWEETHEARTS)) {
        const r = S[id];
        if (r.dead) continue;
        let n = this.npcs[id];
        if (n && n.dead) {
          r.dead = true; this.despawn(id);
          g.ui.bigMessage(`${SWEETHEARTS[id].name.toUpperCase()} ÖLDÜ`, 'Bu şehir sevdiklerini de alıyor.', 'red', 4);
          continue;
        }
        const h = this.homeSpot(id);
        const dh = Math.hypot(p.pos.x - h.x, p.pos.z - h.z);
        if (!n && this.with !== id && dh < 130 && (day || this.meet === id)) n = this.spawn(id, h.x, h.z);
        else if (n && this.with !== id && dh > 175) { this.despawn(id); continue; }
        if (!n) continue;
        // buluşma: yanına gelince kendiliğinden katılır
        if (this.meet === id && Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z) < 5 && !p.vehicle) { this.meet = null; g.ui.bark(n, 'Geldin! Hadi gidelim.'); this.join(id, false); }
        // tehlike: yaralanırsa ya da ortalık savaş alanına dönerse korkar
        if (n._hp !== undefined && n.hp < n._hp - 1) { this.addLove(id, -6, 'yaralandı'); n._hp = n.hp; if (this.with === id) { this.sendHome(id, 'Bu hayat bana göre değil! Beni arama!'); n.state = 'flee'; n.fleeFrom = p.pos.clone(); n.fleeT = 8; } }
        n._hp = n.hp;
      }
    }
    // yanındaki sevgili: araca biner/iner, el ele yürür
    const n = this.partner();
    if (n && !n.dead) {
      const v = p.vehicle;
      if (v && !n.passengerOf && !p.inInterior) {
        const d = Math.hypot(n.pos.x - v.pos.x, n.pos.z - v.pos.z);
        if (d < 14 && v.seats && v.seats.some((s) => !s.driver && !s.actor)) { this.hand = false; this.clearPose(); if (v.addPassenger(n) >= 0) g.ui.bark(n, v.def.len > 6 ? 'Bu ne büyüklük böyle!' : 'Kemerimi taktım. Yavaş sür ama!'); }
        else if (d > 160) { this.lostT = (this.lostT || 0) + dt; if (this.lostT > 15) { this.lostT = 0; this.addLove(this.with, -5, 'geride bıraktın'); this.sendHome(this.with, null); g.ui.notify('Onu sokakta bıraktın. Eve döndü.', 'warn'); } }
      }
      if (n.passengerOf && n.passengerOf !== v) { const pv = n.passengerOf; pv.removePassenger(n); n.state = 'follow'; n.leader = p; }
      if (n.passengerOf) {
        // yolcu koltuğunda: NPC YZ atlanır, pozu biz canlandırırız (oturuş + hafif baş hareketi)
        n.sitting = true; n.talking = Math.sin(performance.now() * 0.0007) > 0.6;
        n.model.animate(dt, n.animState());
        if (g.wanted.level >= 3 && !this._scared) { this._scared = true; g.ui.bark(n, 'Polis! Ne yaptın sen?! Beni indir!'); this.addLove(this.with, -4, 'korktu'); }
        if (g.wanted.level === 0) this._scared = false;
      } else if (this.hand && !p.vehicle && !this.scene) {
        // el ele: oyuncunun sağında, onun hızında yürür (ayak kayması olmasın diye hız birebir aktarılır)
        if (p.aiming || p.speed > 6.2 || p.dead) { this.hand = false; this.clearPose(); }
        else {
          const hx = Math.sin(p.heading), hz = Math.cos(p.heading);
          const tx = p.pos.x - hz * 0.7, tz = p.pos.z + hx * 0.7;
          const k = 1 - Math.exp(-14 * dt);
          n.pos.x += (tx - n.pos.x) * k; n.pos.z += (tz - n.pos.z) * k;
          g.physics.resolveCircle(n.pos, 0.3, 0);
          n.heading = dampAngle(n.heading, p.heading, 10, dt);
          n.state = 'idle'; n.home = null; n.faceYaw = p.heading;
          p.couple = { kind: 'hand', side: 1 }; n.couple = { kind: 'hand', side: -1 }; // o sağda: oyuncunun sağ eli, onun sol eli
          n.handSpeed = p.speed;
        }
      } else if (!this.scene && n.state !== 'follow' && n.state !== 'flee' && n.state !== 'move') { n.state = 'follow'; n.leader = p; }
      if (!this.hand && !this.scene && n.couple && n.couple.kind === 'hand') this.clearPose();
      if (g.wanted.level >= 4 && !p.vehicle && this.with) { this.addLove(this.with, -8, 'çatışma'); this.sendHome(this.with, 'Ben gidiyorum! Arama beni!'); }
    }
    if (this.scene) this.lockScene();
    // ara sıra telefonla randevuya çağırır
    this.callT -= dt;
    if (this.callT <= 0) {
      this.callT = 300 + Math.random() * 300;
      const ids = Object.keys(SWEETHEARTS).filter((id) => S[id].met && !S[id].dead && S[id].love >= 30 && this.with !== id);
      const D = g.missions.dialogue;
      if (ids.length && day && !g.missions.active && !D.call && !g.ui.blocking() && g.mode === 'playing') {
        const id = ids[Math.floor(Math.random() * ids.length)], d = SWEETHEARTS[id];
        D.ring(d.name, () => { this.meet = id; const sp = this.homeSpot(id); g.setGps(sp.x, sp.z); this.updateMarkers(true); }, 30, {
          ring: 'kalp', sub: 'Kalp · arıyor...',
          lines: [[d.name, S[id].love >= 60 ? 'Canım sıkıldı... Seni özledim. Gelir misin?' : 'Selam! Bugün ne yapıyorsun? Bir çay içelim mi?'], ['Sen', 'Geliyorum.']],
          onDecline: () => this.addLove(id, -2, 'reddettin'), missText: 'Sonra geri ara.',
        });
      }
    }
    if (p.inInterior && this.hand) { this.hand = false; this.clearPose(); }
    this.mkT = (this.mkT || 0) - dt;
    if (this.mkT <= 0) { this.mkT = 0.5; this.updateMarkers(false); }
  }
}

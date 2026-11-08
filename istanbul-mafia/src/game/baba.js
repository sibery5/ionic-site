// Reis Baba ile ilişki: GÜVEN ve ŞÜPHE değerleri, görev performansı notu, görev sonu telefon çağrısı ve
// konakta sinematik değerlendirme + yeni iş sahnesi. Değerler g.state.storyFlags.trust / .susp içinde saklanır
// (tekrar oynamada bayraklar geri alındığı için bu değerler de kalıcı olarak değişmez).
//   Güven: Reis'in sana ne kadar inandığı. Beşinci Perde (gizli görüşmeler) için en az 60 gerekir; bazı seçenekleri açar.
//   Şüphe: Reis'in komployu sezmesi. Yüksekse Reis önce davranır (pusu, daha çok sadık adam), diyaloglar sertleşir.
import { STORY, SUMMON } from './story_data.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// zorunlu aranma yıldızı veren görevler: gürültü not düşürmez
const LOUD = new Set(['karabasan', 'liman', 'kuyumcu', 'banka', 'kisla', 'nevzat', 'sadakat', 'dogan', 'bogaz', 'konteyner']);

// konaktaki yerler (konak iç mekânı: oda 16×14, masa z=-4.5)
const SPOT = { reis: { x: 0, y: 0, z: -5.2 }, leyla: { x: 1.6, y: 0, z: -4.6 }, ali: { x: -4, y: 0, z: 0.2 }, me: { x: 0, y: 0, z: -2.3 } };

// seçimlere göre güven/şüphe etkisi (eski görevler; yeni görevler def.judge ile)
const JUDGE = {
  tahsildar: (f) => (f.ferhat === 'olu' ? { trust: 5, why: 'Haini cezalandırdın' } : { trust: -3, why: 'Ferhat\'ı bıraktın' }),
  hain: (f) => (f.sinan === 'kill' ? { trust: 4, why: 'Aile hainleri affetmez' } : { trust: -2, why: 'Sinan\'ı bağışladın' }),
  ittifak: () => ({ trust: 3 }),
  carsi: () => ({ trust: 5, why: 'Fatih ailenin' }),
  pusu: () => ({ trust: 8, why: 'Reis\'in hayatını kurtardın' }),
  hastane: () => ({ trust: 4 }),
  defter: (f) => (f.ledger ? { trust: 2 } : null),
  savas: (f) => (f.kenan === 'affet' ? { trust: 8, why: 'Oğlunu bağışladın' } : { trust: -8, susp: 15, why: 'Oğlunu öldürdün' }),
  nevzat: (f) => (f.nevzat === 'teslim' ? { trust: -6, susp: 12, why: 'Defteri savcıya verdin' } : { trust: 5, why: 'Nevzat sustu' }),
};

// konuşmacıya göre performans yorumları
const GRADE_LINES = {
  'Reis Baba': {
    A: ['Tertemiz iş. Ne iz bıraktın ne gürültü. Babam da böyle çalışırdı.', 'Duydum, duydum. Herkes senden bahsediyor; kimse bir şey görmemiş. Doğrusu bu.', 'Kusursuz. Sana yaşlı bir adamın gururunu bağışlıyorum evlat.'],
    B: ['İş bitti, gerisi teferruat. Biraz gürültü oldu ama olsun.', 'Fena değil. Bir dahaki sefere daha az kurşun, daha çok akıl.', 'Hallettin. Hallettin ama alnın biraz terlemiş.'],
    C: ['İş bitti ama yarın sabah gazetelerdeyiz. Polis kapıma dayandı evlat.', 'Bu kadar gürültüyle bu şehirde uzun yaşanmaz. Dikkat et.', 'Kaç defa denedin? Sokakta herkes senin düştüğünü konuşuyor.'],
  },
  Leyla: {
    A: ['Temiz iş. Babam duyunca gülümsedi; doktorlar bile şaşırdı.', 'Bir tane bile fazla kurşun yok. Seni izlemek hoşuma gidiyor.'],
    B: ['İş bitti. Biraz dağınık ama bitti.', 'Fena değildi. Yine de biraz yavaş.'],
    C: ['Başardın ama bütün şehir duydu. Babam olsa kızardı.', 'Bu kadar dağınık olursak savaşı kaybederiz.'],
  },
  'Cin Ali': {
    A: ['Abi! Ağzım açık kaldı. Tek iz yok!', 'Patron, adamlar seni anlatırken ses tonları değişiyor. Saygı bu.'],
    B: ['Hallettik abi. Biraz tozduk ama hallettik.', 'İş bitti patron. Ufak tefek sıyrık.'],
    C: ['Abi, polis telsizleri hâlâ senin adını sayıklıyor.', 'Bitti ama... çok gürültü oldu patron.'],
  },
};
const pick = (arr, k) => arr[Math.abs(k) % arr.length];

// görev sonu değerlendirmesi (konakta, yüz yüze). f: bayraklar, g: not
const DEBRIEF = {
  eski_dost: () => [['Reis Baba', 'Ali\'yle buluştun demek. Yılanlar\'ın arabaları da peşinizdeymiş. Hoş geldin merasimi.']],
  harac: () => [['Reis Baba', 'Esnaf iki kere haraç ödüyormuş. Yılanlar mahalleme girmiş, ben görmemişim. Yaşlanıyorum evlat.'], ['Sen', 'Bir daha girmezler Reis.']],
  karabasan: () => [['Reis Baba', 'Kenan senden bahsetti. Kenan kimseden bahsetmez. Demek dişine dokunmuşsun.']],
  liman: () => [['Reis Baba', 'Çarşı\'nın silahları artık bizim depoda. Hacı Rüstem bunu kolay yutmaz; hazırlıklı ol.']],
  hain: (f) => [['Reis Baba', f.sinan === 'kill' ? 'Sinan "kaybolmuş". Leyla öyle söyledi. Ben de öyle bildim. Anlaştık mı?' : 'Sinan\'ı bırakmışsın. Leyla anlattı. Merhamet... Bu evde merhametin bir bedeli olur evlat; o bedeli kimin ödeyeceğini bilemezsin.']],
  komiser: () => [['Reis Baba', 'Nevzat\'ın çayını içmişsin. Zehirlemedi mi? Demek sana ihtiyacı var. İhtiyaç, tasmadan sağlamdır.']],
  takip: (f) => [['Reis Baba', f.yasar ? 'Yaşar meselesini... unut dedim. Kenan\'la konuştum. Bir daha olmayacak.' : 'Muhbiri kaçırmışsın. Olur. Avcı bazen eli boş döner.'], ['Sen', 'Kenan\'ın şoförü bizi satıyordu Reis.'], ['Reis Baba', 'Kan kandır evlat. Bunu bir gün sen de anlayacaksın.']],
  kuyumcu: () => [['Reis Baba', 'Hacı\'nın kasası boş. Leyla yarısını savaş kasasına koymuş. Kızım benden akıllı.']],
  yaris: () => [['Reis Baba', 'Deli Murat\'ı geçmişsin! Hahaha! Kadıköy\'de bu gece kimse uyumaz.']],
  galata: () => [['Reis Baba', 'Kızımın hayatı sana emanetti. Emaneti teslim ettin. Bunu unutmam.']],
  kara_yilan: () => [['Reis Baba', 'Kara Yılan... Yirmi yıl o yılanın zehrini yuttum. Ölmeden önce bir şey söyledi mi?'], ['Sen', '"Seni satan senin evinden biri" dedi.'], ['Reis Baba', 'Yılan son nefesinde bile zehir saçar. Unut onu.']],
  sadakat: (f) => (f.sadakat === 'infaz'
    ? [['Reis Baba', 'Tahsin, Nuri\'nin dükkânını gördü. Kepenk kapalı, kız teyzesinde. Sen artık bu evin adamısın evlat. Gerçekten.'], ['Kasap Tahsin', 'Temiz iş. Otuz yıldır ilk defa birinin işini beğendim.']]
    : f.sadakat === 'kacir'
      ? [['Reis Baba', 'Nuri\'yi kimse görmemiş. Ne dükkânda ne mezarda. "Hallettim" dedin; ben de inandım.'], ['Reis Baba', 'İnandım evlat. Bu evde inanmak pahalıdır; bunu da bil.']]
      : []),
  ittifak: (f) => [['Reis Baba', f.ally === 'bogaz' ? 'Deli Murat... Hızlı seçtin. Umarım hızlı da kazanırız.' : 'Doğan Bey. Eski para, eski kural. Akıllı seçim.']],
  carsi: () => [['Reis Baba', 'Fatih! Otuz yıldır bu haritaya bakıp Fatih\'i istedim. Sen getirdin. Gel, sarıl bana.'], ['Reis Baba', 'Bugünden sonra sana "evlat" demeyeceğim. Sen benim oğlumsun.']],
  bomba: () => [['Reis Baba', 'Kulüp sağlam. Kameraları kim bozmuş, onu bulacağım. Sen merak etme.']],
  pusu: () => [['Leyla', 'Babamı sen taşıdın o arabaya. Doktorlar "on dakika daha geç kalsalardı" dedi. Ben de sana ömür borçluyum.']],
  hastane: () => [['Leyla', 'Kapıdan tek kurt girmedi. Babam uyanınca ilk seni sordu. Kenan\'ı değil. Seni.']],
  defter: (f) => [['Leyla', 'Defterde Kenan\'ın el yazısı var. Babama henüz göstermedim. Önce iyileşsin.'], ...(f.sinan === 'spare' ? [['Leyla', 'Sinan\'ı bağışlaman bize defterin aslını getirdi. Bazen merhamet işe yarıyor.']] : [])],
  sorgu: () => [['Leyla', 'Topal Kemal konuştu. Kurtlar, kışla, liman... Ve Kenan. Hep Kenan.']],
  konteyner: () => [['Leyla', 'Kurtlar\'ın silahları artık bizde. Bozkurt Selim bunu duyunca duvarları yumrukluyormuş.']],
  kisla: () => [['Leyla', 'Askeri kamyon depoda. Tahsin "otuz yılda böyle bir şey görmedim" diyor.']],
  banka: () => [['Leyla', 'Savaş kasası doldu. Nevzat\'ın parası bizim kurşunumuz olacak.']],
  bogaz: () => [['Leyla', 'Bozkurt Selim düştü. Kurtlar başsız. Geriye... sadece Kenan kaldı.']],
  savas: (f) => (f.kenan === 'affet'
    ? [['Reis Baba', 'Oğlumu... bağışlamışsın. Bir gemiye bindirmişsin. Ben ona bunu yapamazdım. Sen yaptın.'], ['Reis Baba', 'Gel evlat. Gel otur yanıma. Artık bu ev senin de evin.']]
    : [['Reis Baba', 'Kenan... Bana söyleme. Biliyorum. Leyla anlattı.'], ['Reis Baba', 'Haklıydın. Haklıydın ve ben bir babayım. İkisi aynı anda nasıl olur, bilmiyorum.'], ['Reis Baba', 'Git şimdi. Yarın konuşuruz.']]),
  nevzat: (f) => (f.nevzat === 'teslim'
    ? [['Reis Baba', 'Defteri savcıya vermişsin. Sana ne dedim? Bana getir dedim.'], ['Sen', 'Nevzat\'ın yeri hapishane Reis.'], ['Reis Baba', 'Nevzat konuşursa... Neyse. Neyse evlat. Bana bir şey söyledi mi, ölmeden ya da kelepçeyi takmadan önce?'], ['Sen', 'Hayır Reis. Hiçbir şey.']]
    : [['Reis Baba', 'Nevzat sustu. Bir daha da konuşmayacak. İyi. Çok iyi.'], ['Reis Baba', 'Bir şey söyledi mi? Son nefesinde?'], ['Sen', '...Hayır Reis. Hiçbir şey.']]),
  gizli: (f) => (f.susp >= 40
    ? [['Reis Baba', 'Kahvehanenin hesabına baktın mı? Rıza seni Süleymaniye\'nin arkasında görmüş. Orada ne hesap var?'], ['Sen', 'Leyla\'yla çay içtik Reis. Babasını merak ediyor.'], ['Reis Baba', 'Babası burada. Merak edecek bir şey yok.']]
    : [['Reis Baba', 'Hesaplar tamam mı? Ocakçı ne dedi?'], ['Sen', 'Tamam Reis. Selamın var.']]),
  kurtarma: (f) => (f.kurtarma === 'catis' || f.susp >= 80
    ? [['Reis Baba', 'Rıza\'nın telsizi açıktı. Her şeyi duydum.'], ['Reis Baba', 'Gel yine de. Gözüme bakarak söyle. Bu gece gel.']]
    : [['Reis Baba', 'Ali konuşmamış. Sen de bir şey bulamamışsın. Ama Ali ortada yok. Garip, değil mi?'], ['Sen', 'Korkmuş Reis. Kaçmıştır.']]),
  devrilme: () => [],
  dogan: (f) => [['Leyla', f.dogan_yol === 'baskin' ? 'Köşkün duvarlarında hâlâ kurşun izi var. Beşiktaş kimin geldiğini öğrendi.' : 'Doğan Bey gitti. Kartallar dağılıyor; yarısı bizim kapımızda.']],
  murat: () => [['Leyla', 'Kadıköy sustu. Murat\'ın sesi olmadan o semt bile tanınmıyor.']],
  bolge: () => [['Leyla', 'Beyoğlu, Beşiktaş, Kadıköy, Fatih, Üsküdar... Hepsi. Artık haritada tek renk var.']],
};

export class Baba {
  constructor(M) { this.M = M; this.run = null; }
  get g() { return this.M.g; }
  get f() { return this.M.flags; }
  ensure() {
    const f = this.f, s = this.g.state;
    if (f.trust === undefined) {
      // eski kayıt: tamamlanan görev sayısından makul bir başlangıç güveni
      const n = s && s.completed ? s.completed.filter((id) => STORY.some((d) => d.id === id)).length : 0;
      f.trust = Math.min(80, 20 + n * 3);
    }
    if (f.susp === undefined) f.susp = 0;
  }
  get trust() { this.ensure(); return this.f.trust; }
  get susp() { this.ensure(); return this.f.susp; }
  adjust(dt = 0, ds = 0, why) {
    if (this.M.replay || !this.g.state) return;
    this.ensure();
    const f = this.f;
    const t0 = f.trust, s0 = f.susp;
    f.trust = clamp(Math.round(t0 + dt), 0, 100);
    f.susp = clamp(Math.round(s0 + ds), 0, 100);
    if (f.babaDown) return;
    const parts = [];
    if (f.trust !== t0) parts.push(`Reis'in güveni ${f.trust > t0 ? '+' : ''}${f.trust - t0} (${f.trust})`);
    if (f.susp !== s0) parts.push(`Şüphe ${f.susp > s0 ? '+' : ''}${f.susp - s0} (${f.susp})`);
    if (parts.length && this.g.ui) this.g.ui.notify(parts.join(' · ') + (why ? ` — ${why}` : ''), f.trust >= t0 && f.susp <= s0 ? 'good' : 'warn');
  }
  // görevleri veren kişi: Reis; Reis yaralıyken Leyla; Reis devrildikten sonra sağ kolun (Leyla ya da Cin Ali)
  giver() {
    const f = this.f;
    if (f.babaDown) return f.baba === 'sur' ? 'Leyla' : 'Cin Ali';
    if (f.reisWounded && !f.reisBack) return 'Leyla';
    return 'Reis Baba';
  }
  // ---------------- performans ----------------
  begin(def, retry) {
    if (!this.run || this.run.id !== def.id) this.run = { id: def.id, tries: 0, maxW: 0, hpMin: 1, t: 0 };
    if (retry) this.run.tries++;
  }
  fail(def) { if (this.run && this.run.id === def.id) this.run.tries++; }
  tick(dt) {
    const r = this.run, g = this.g;
    if (!r) return;
    r.t += dt;
    if (g.wanted) r.maxW = Math.max(r.maxW, g.wanted.level);
    const p = g.player;
    if (p && p.maxHp) r.hpMin = Math.min(r.hpMin, p.hp / p.maxHp);
  }
  grade(def) {
    const r = this.run && this.run.id === def.id ? this.run : { tries: 0, maxW: 0, hpMin: 1, t: 0 };
    let score = 100 - r.tries * 18 - (LOUD.has(def.id) ? Math.max(0, r.maxW - 3) : Math.max(0, r.maxW - 1)) * 12 - (r.hpMin < 0.25 ? 10 : 0);
    score = clamp(score, 0, 100);
    const g = score >= 85 ? 'A' : score >= 60 ? 'B' : 'C';
    return { g, score, tries: r.tries, maxW: r.maxW, label: { A: 'Kusursuz', B: 'Temiz', C: 'Gürültülü' }[g] };
  }
  // görev tamamlandı (tekrar oynama değil): not ver, güveni/şüpheyi güncelle, değerlendirmeyi beklemeye al
  finish(def) {
    this.ensure();
    const gr = this.grade(def);
    const f = this.f;
    let dt = { A: 6, B: 4, C: 1 }[gr.g], ds = 0;
    const why = [];
    const j = def.judge ? def.judge(this.M) : JUDGE[def.id] ? JUDGE[def.id](f) : null;
    if (j) { dt += j.trust || 0; ds += j.susp || 0; if (j.why) why.push(j.why); }
    // Beşinci Perde'de Reis artık her şeyden şüphelenir
    if (def.act === 4 && !f.babaDown) ds += 4;
    this.adjust(dt, ds, why.join(', ') || `Not: ${gr.label}`);
    f.debrief = { id: def.id, g: gr.g, score: gr.score, tries: gr.tries };
    this.run = null;
    return gr;
  }
  // ---------------- çağrı ----------------
  callLines(nd) {
    this.ensure();
    const who = this.giver(), f = this.f, db = f.debrief;
    const pool = GRADE_LINES[who] || GRADE_LINES['Reis Baba'];
    const first = db ? pick(pool[db.g] || pool.B, (db.score || 0) + db.id.length) : 'Nerelerdesin?';
    const second = (nd && SUMMON[nd.id]) || 'Konağa uğra, konuşacaklarımız var.';
    const lines = [[who, `${first} ${second}`]];
    if (who === 'Reis Baba' && f.susp >= 50 && !f.babaDown) lines.push(['Reis Baba', 'Bir de... Son günlerde telefonun hep meşgul evlat. Kimlerle konuşuyorsun?']);
    lines.push(['Sen', who === 'Reis Baba' ? 'Geliyorum Reis.' : 'Geliyorum.']);
    return { who, lines };
  }
  // ---------------- konak sahnesi ----------------
  greeting(who) {
    const t = this.trust, s = this.susp, f = this.f;
    if (who === 'Reis Baba') {
      if (f.reisBack && s >= 60) return 'Gel. Kapıyı kapat. Otur şuraya, gözümün önüne.';
      if (t >= 75) return 'Oğlum! Gel, gel otur yanıma. Çay söyledim.';
      if (t >= 45) return 'Gel evlat, otur. Ne var ne yok?';
      return 'Gel. Otur. Konuşacaklarımız var.';
    }
    if (who === 'Leyla') return f.babaDown ? 'Patron. Otur; masada senin yerin.' : 'Gel. Babam uyuyor; ben dinliyorum.';
    return 'Patron! Gel, herkes seni bekliyor.';
  }
  // konuşmacı konakta mı? (yoksa hoparlörden konuşur)
  present(who) {
    const idx = this.M.index, f = this.f;
    if (who === 'Leyla') return idx >= 1 && !(f.babaDown && f.baba === 'oldur');
    if (who === 'Cin Ali') return idx >= 2;
    if (who === 'Reis Baba') return !f.babaDown && !(f.reisWounded && !f.reisBack);
    return false;
  }
  spot(who) {
    const f = this.f;
    if (who === 'Reis Baba') return SPOT.reis;
    if (who === 'Leyla') return f.reisWounded && !f.reisBack && !f.babaDown ? SPOT.reis : SPOT.leyla;
    if (who === 'Cin Ali') return f.babaDown ? SPOT.leyla : SPOT.ali;
    return SPOT.reis;
  }
  // Sıradaki görevin sahnesi: (bekleyen) değerlendirme + yeni iş. inKonak değilse telefonda kısa konuşma.
  sceneLines(def, inKonak) {
    const M = this.M, f = this.f, giver = this.giver();
    const P0 = M.g.player.pos;
    const cam = (who, wide) => {
      if (!inKonak) return {};
      const s = this.spot(who);
      if (wide) return { cam: () => M.camWide(4.6, 2.5, 1.6, 0, 1.1, -4.6) };
      return { cam: () => M.camOver(P0, s)() };
    };
    const rev = (who) => (inKonak ? { cam: () => M.camOver(this.spot(who), P0)() } : {});
    const lines = [];
    lines.push([giver, this.greeting(giver), cam(giver, true)]);
    // değerlendirme
    const db = f.debrief;
    if (db && db.id !== def.id) {
      const pool = GRADE_LINES[giver] || GRADE_LINES['Reis Baba'];
      const D = DEBRIEF[db.id] ? DEBRIEF[db.id](f, db) : [];
      if (D.length || db.id !== 'eve_donus') {
        const gl = pick(pool[db.g] || pool.B, db.score + 3);
        lines.push([giver, gl, cam(giver)]);
        for (const L of D) lines.push([L[0], L[1], L[0] === 'Sen' ? rev(giver) : cam(L[0])]);
        if (giver === 'Reis Baba' && !f.babaDown) {
          const t = this.trust;
          if (def.act <= 3) lines.push(['Reis Baba', t >= 70 ? 'Bu evde sana güvenim tam. Kimseye bu kadar güvenmedim.' : t >= 40 ? 'Güvenimi kazanıyorsun. Yavaş yavaş, ama kazanıyorsun.' : 'Sana güvenmek istiyorum evlat. Bana bir sebep ver.', cam(giver)]);
          else if (this.susp >= 50) lines.push(['Reis Baba', 'Biliyor musun, kurt yaşlanınca sürüsünü koklamaya başlar. Kim sadık, kim değil... Burnum hâlâ iyi çalışır.', cam(giver)]);
        }
      }
    }
    // yeni iş
    const brief = typeof def.brief === 'function' ? def.brief(M) : def.brief;
    const sp = def.giver || def.call || giver;
    if (sp !== giver && !this.present(sp)) {
      lines.push([giver, sp === 'Komiser Nevzat' ? 'Telefon çalıyor. Nevzat. Hoparlöre veriyorum; ne dediğini ikimiz de duyalım.' : `Yeni iş ${sp}'den geldi. Hoparlöre veriyorum.`, cam(giver)]);
      lines.push([sp, brief, cam(giver, true)]);
      lines.push([giver, sp === 'Komiser Nevzat' ? 'Git. Ama bil ki o adamın çayı acıdır.' : 'Duydun. Hadi bakalım.', cam(giver)]);
    } else if (sp !== giver) {
      lines.push([giver, `Bu işi ${sp} anlatsın.`, cam(giver)]);
      lines.push([sp, brief, cam(sp)]);
    } else lines.push([sp, brief, cam(sp)]);
    return lines;
  }
  // görev kapısı: güven veya bayrak eksikse sahne bunu söyler ve iş verilmez
  gate(def) {
    const f = this.f;
    if (def.needTrust && this.trust < def.needTrust) return { ok: false, lines: [[this.giver(), `Sana bir iş verecektim ama... Henüz o kadar değil evlat. Güvenim ${this.trust}; o iş için ${def.needTrust} lazım. Kontrat panosundan iş al, adamlarım seni izliyor.`]] };
    if (def.needFlag && !f[def.needFlag]) return { ok: false, lines: [[this.giver(), 'Henüz zamanı değil.']] };
    return { ok: true };
  }
}

import type { Text } from './story';
import { DAYS } from './story';
import type { PersonOpts, Mood } from '../world/models';

// Ara sahneler: çaycının yükselişi. Her sahne bir sette geçer, oyuncular dizilir, repliklerle ilerler.

export type SetKind = 'ocak' | 'ofis' | 'teras' | 'karanlik' | 'arsiv';

export interface SceneActor {
  id: string;
  name: Text;
  /** 'cemal' ise oyuncunun dolabındaki görünüş kullanılır */
  look: PersonOpts | 'cemal';
  pos: [number, number];
  yaw: number;
  pose?: 'stand' | 'sit' | 'tray';
  mood?: Mood;
}

export interface SceneChoice {
  text: Text;
  /** kayda yazılan seçim bayrağı */
  flag: string;
  rep?: number;
  wallet?: number;
  /** seçimden hemen sonra oynayan replikler */
  then?: SceneLine[];
}

export interface SceneLine {
  who: string;
  text: Text;
  mood?: Mood;
  /** sahnenin ortasında özel bir an: 'key' (anahtar uzatılır) */
  beat?: 'key' | 'envelope';
  /** bu replikten sonra oyuncu seçer */
  choice?: SceneChoice[];
  /** sadece bu bayrak varsa / yoksa oynar */
  if?: string;
  unless?: string;
}

export interface SceneDef {
  id: string;
  set: SetKind;
  title: Text;
  actors: SceneActor[];
  lines: SceneLine[];
}

const T = (tr: string, en: string): Text => ({ tr, en });
const look = (day: number, office: number): PersonOpts => ({ ...DAYS[day].offices[office].look });

const RIZA: PersonOpts = { shirt: 0xf4f1ea, pants: 0x2a2a2a, skin: 0xe0ac7e, hair: 0xdddddd, mustache: true, vest: 0x6b1a1a, hairStyle: 'short', glasses: true, height: 0.96 };
const GULSUM: PersonOpts = { shirt: 0x8a9a5b, pants: 0x3b3b3b, skin: 0xc68a5f, hair: 0x2a1a10, scarf: 0x2d6a8a, mop: true };

const A = {
  cemal: (x: number, z: number, yaw: number, pose: SceneActor['pose'] = 'tray'): SceneActor => ({ id: 'cemal', name: T('Cemal', 'Cemal'), look: 'cemal', pos: [x, z], yaw, pose }),
  riza: (x: number, z: number, yaw: number): SceneActor => ({ id: 'riza', name: T('Rıza Usta', 'Master Rıza'), look: RIZA, pos: [x, z], yaw, mood: 'happy' }),
  nadir: (x: number, z: number, yaw: number): SceneActor => ({ id: 'nadir', name: T('Nadir Bey', 'Nadir Bey'), look: look(4, 0), pos: [x, z], yaw }),
  selim: (x: number, z: number, yaw: number): SceneActor => ({ id: 'selim', name: T('Selim', 'Selim'), look: look(3, 0), pos: [x, z], yaw }),
  turgut: (x: number, z: number, yaw: number): SceneActor => ({ id: 'turgut', name: T('Turgut', 'Turgut'), look: look(3, 1), pos: [x, z], yaw }),
  gulsum: (x: number, z: number, yaw: number): SceneActor => ({ id: 'gulsum', name: T('Gülsüm Abla', 'Gülsüm'), look: GULSUM, pos: [x, z], yaw, mood: 'happy' }),
  hayri: (x: number, z: number, yaw: number): SceneActor => ({ id: 'hayri', name: T('Hayri Usta', 'Master Hayri'), look: look(0, 0), pos: [x, z], yaw, pose: 'sit' }),
  sevim: (x: number, z: number, yaw: number): SceneActor => ({ id: 'sevim', name: T('Sevim Hanım', 'Mrs. Sevim'), look: look(0, 1), pos: [x, z], yaw }),
  rifat: (x: number, z: number, yaw: number): SceneActor => ({ id: 'rifat', name: T('Av. Rıfat', 'Attorney Rıfat'), look: look(1, 2), pos: [x, z], yaw }),
  lale: (x: number, z: number, yaw: number): SceneActor => ({ id: 'lale', name: T('Lale', 'Lale'), look: look(2, 1), pos: [x, z], yaw }),
  saadet: (x: number, z: number, yaw: number): SceneActor => ({ id: 'saadet', name: T('Arşivci Saadet', 'Saadet the Archivist'), look: look(5, 0), pos: [x, z], yaw }),
  remzi: (x: number, z: number, yaw: number): SceneActor => ({ id: 'remzi', name: T('Bekçi Remzi', 'Remzi the Watchman'), look: look(5, 1), pos: [x, z], yaw }),
};

export const SCENES: Record<string, SceneDef> = {
  intro: {
    id: 'intro',
    set: 'ocak',
    title: T('Ocağın Başında', 'At the Stove'),
    actors: [A.riza(-0.6, 0.2, 0.7), A.cemal(1.7, 0.5, 0, 'stand')],
    lines: [
      { who: 'riza', text: T('Kırk yıl bu ocakta çay demledim evlat. Dizlerim artık beş kat merdiveni çıkmıyor.', 'Forty years I brewed tea at this stove, kid. My knees can\'t climb five floors anymore.') },
      { who: 'riza', text: T('Bu askılı tepsi babamdan kaldı. Sallarsan dökülmez, ani durursan dökülür. Tersini sanma.', 'This hanging tray was my father\'s. Swing it and nothing spills; stop suddenly and it all does. Never think the opposite.') },
      { who: 'cemal', text: T('Ya beceremezsem Usta?', 'What if I can\'t do it, Master?'), mood: 'neutral' },
      { who: 'riza', text: T('Becerirsin. Ama bir kural var: çayı dökme, lafı dökme. Bu handa duvarların bile kulağı var.', 'You can. But there is one rule: don\'t spill the tea, don\'t spill the talk. In this han even the walls have ears.') },
      { who: 'riza', text: T('Bir de... Nadir Bey\'in yeğeni Selim son günlerde çok dolaşıyor. Gözün de kulağın da açık olsun.', 'And... Nadir Bey\'s nephew Selim has been sniffing around a lot lately. Keep your eyes and ears open.') },
      { who: 'cemal', text: T('Gözüm, kulağım, tepsim. Hepsi açık Usta.', 'Eyes, ears and tray. All open, Master.'), mood: 'happy' },
    ],
  },
  promo_1: {
    id: 'promo_1',
    set: 'ocak',
    title: T('Terfi: Ocakçı', 'Promotion: Stove Keeper'),
    actors: [A.nadir(-0.9, 0.1, 0.6), A.riza(0.1, -0.4, 0.1), A.cemal(1.7, 0.5, 0)],
    lines: [
      { who: 'nadir', text: T('Rıza bana senden bahsetti. Bugünden sonra ocak senin sorumluluğunda. Ocakçı Cemal!', 'Rıza told me about you. From today, the stove is your responsibility. Stove Keeper Cemal!'), mood: 'happy' },
      { who: 'riza', text: T('Ocağa sahip çık evlat. Kim kovalarsa kovalasın, Rıza\'nın ocağına kimse giremez.', 'Look after the stove, kid. Whoever chases you, nobody enters Rıza\'s stove.') },
      { who: 'cemal', text: T('Sağ olun Nadir Bey. Utandırmam sizi.', 'Thank you, Nadir Bey. I won\'t let you down.'), mood: 'happy' },
    ],
  },
  promo_2: {
    id: 'promo_2',
    set: 'ofis',
    title: T('Terfi: Kat Çaycısı', 'Promotion: Floor Tea Boy'),
    actors: [A.hayri(-1.2, -0.4, 0.4), A.sevim(-0.2, -0.8, 0.2), A.rifat(1.0, -0.5, -0.4), A.cemal(1.7, 0.5, 0)],
    lines: [
      { who: 'hayri', text: T('Cemal geliyor diye kapımı açık bırakıyorum artık.', 'I leave my door open now, because Cemal is coming.'), mood: 'happy' },
      { who: 'sevim', text: T('Kat Çaycısı olmuşsun! Bu işin dedikodusu bol olur, ha?', 'Floor Tea Boy now! Lots of gossip in this job, eh?'), mood: 'happy' },
      { who: 'rifat', text: T('Bir şey duyarsan bana gel. Tapu, vekâlet, rapor... Doğru bilgi doğru elde işe yarar.', 'If you hear something, come to me. Deeds, signatures, reports... The right information in the right hands matters.') },
      { who: 'cemal', text: T('Herkes bir şey biliyor. Kim neyi merak ediyor, onu öğrenmem lazım.', 'Everyone knows something. I need to learn who wants to know what.') },
    ],
  },
  villain: {
    id: 'villain',
    set: 'karanlik',
    title: T('Karanlık Ofis', 'The Dark Office'),
    actors: [A.selim(-0.5, -0.4, 0.5), A.turgut(0.7, -0.7, -0.2), A.cemal(1.7, 0.5, 0)],
    lines: [
      { who: 'selim', text: T('Çaycı! Gel bakalım. Kulakların çok iş görüyormuş diye duydum.', 'Tea boy! Come here. I hear those ears of yours are very busy.') },
      {
        who: 'selim',
        text: T('Duyduğun her şeyi bana getir. Kim ne biliyor, kim ne konuşuyor. İki katını öderim. Bu da peşinatın.', 'Bring me everything you hear. Who knows what, who says what. I\'ll pay double. And here is an advance.'),
        beat: 'envelope',
        choice: [
          {
            text: T('Zarfı al (+100₺, itibar düşer)', 'Take the envelope (+100₺, reputation drops)'),
            flag: 'tookEnvelope',
            wallet: 100,
            rep: -8,
            then: [
              { who: 'selim', text: T('Akıllı çocuk. Cuma\'ya kadar kulakların bende.', 'Smart kid. Until Friday, your ears are mine.'), mood: 'happy' },
              { who: 'turgut', text: T('Kazanan tarafa hoş geldin çaycı.', 'Welcome to the winning side, tea boy.'), mood: 'happy' },
            ],
          },
          {
            text: T('Geri çevir', 'Refuse it'),
            flag: 'refusedEnvelope',
            rep: 4,
            then: [
              { who: 'cemal', text: T('Ben çay taşırım Selim Bey. Laf taşımam.', 'I carry tea, Selim Bey. Not talk.') },
              { who: 'selim', text: T('Pişman olacaksın çaycı. Cuma yaklaşıyor.', 'You\'ll regret this, tea boy. Friday is coming.'), mood: 'angry' },
            ],
          },
          {
            text: T('Zarfı al, sonra Rıza Usta\'ya götür', 'Take it, then show it to Master Rıza'),
            flag: 'doubleAgent',
            wallet: 100,
            then: [
              { who: 'cemal', text: T('(Zarfı cebime koydum. Üstünde Selim\'in el yazısı var. Bu zarf bir kanıt.)', '(I pocket the envelope. It has Selim\'s handwriting on it. This envelope is evidence.)') },
              { who: 'selim', text: T('Akıllı çocuk.', 'Smart kid.'), mood: 'happy' },
            ],
          },
        ],
      },
      { who: 'turgut', text: T('Cuma\'dan sonra bu han olmayacak zaten. Tapusu bile kayıp, duymadın mı?', 'After Friday this han won\'t exist anyway. Even its deed is lost, didn\'t you hear?') },
    ],
  },
  promo_3: {
    id: 'promo_3',
    set: 'ocak',
    title: T('Terfi: Baş Çaycı', 'Promotion: Head Tea Boy'),
    actors: [A.nadir(-0.8, 0.0, 0.7), A.riza(-0.1, -0.6, 0.2), A.gulsum(1.2, -0.4, -0.6), A.cemal(1.7, 0.5, 0)],
    lines: [
      { who: 'nadir', text: T('Baş Çaycım! Artık herkes "Cemal nerede?" diye soruyor. İhtiyaç duyulan biri oldun.', 'My Head Tea Boy! Everyone asks "Where is Cemal?" now. People need you.'), mood: 'happy' },
      { who: 'gulsum', text: T('Ben de soruyorum! Yerleri sildiğimde ilk sen basma ama.', 'I ask too! Just don\'t be the first to walk on my wet floors.') },
      { who: 'nadir', text: T('Söyle bakalım evlat, şu Selim\'le ilgili bir şey duydun mu? Bir şeyler dönüyor, hissediyorum.', 'Tell me, kid, have you heard anything about Selim? Something is going on, I can feel it.') },
      { who: 'cemal', text: T('Duyuyorum Nadir Bey. Ama tam bilmeden konuşmayacağım.', 'I hear things, Nadir Bey. But I won\'t talk until I\'m sure.') },
      { who: 'riza', text: T('Aferin. Lafı ancak kanıtla dökersin.', 'Good. You only spill the talk with proof.') },
    ],
  },
  bodrum: {
    id: 'bodrum',
    set: 'arsiv',
    title: T('Kayıp Tapu', 'The Missing Deed'),
    actors: [A.gulsum(-1.4, -0.2, 0.6), A.saadet(-0.3, -0.7, 0.2), A.remzi(0.9, -0.5, -0.4), A.cemal(1.7, 0.5, 0)],
    lines: [
      { who: 'gulsum', text: T('Kırk yıldır bu bodrumu ben silerim, arşivin anahtarı da bende. Gel bakalım, Saadet Hanım seni bekliyor.', 'I\'ve mopped this basement for forty years, and I hold the archive key. Come on, Mrs. Saadet is waiting for you.'), mood: 'happy' },
      { who: 'saadet', text: T('Demek Rıza\'nın çırağı sensin. Bak evlat: bu han vakıf malı. Asıl tapu şu dolapta.', 'So you\'re Rıza\'s apprentice. Listen, kid: this han belongs to a foundation. The original deed is in that cabinet.') },
      { who: 'saadet', text: T('Ama Kâtip Cevdet son günlerde dosyaları karıştırıyor. Turgut\'la telefonda fısıldaşıyor.', 'But Cevdet the clerk has been rummaging through the files lately. Whispering on the phone with Turgut.') },
      { who: 'remzi', text: T('Selim\'in zarfını almışsın diyorlar çaycı. Bodrumda laf çabuk yayılır.', 'They say you took Selim\'s envelope, tea boy. Talk travels fast in a basement.'), if: 'tookEnvelope', mood: 'angry' },
      { who: 'gulsum', text: T('Zarfı Rıza\'ya götürmüşsün. Rıza anlattı, gururlandık.', 'You took the envelope to Rıza. He told us; we\'re proud of you.'), if: 'doubleAgent', mood: 'happy' },
      {
        who: 'saadet',
        text: T('Toplantıya üç gün var. Tapuyu ne yapalım Cemal?', 'The meeting is in three days. What should we do with the deed, Cemal?'),
        choice: [
          {
            text: T('Av. Rıfat\'a götürelim, toplantıda o göstersin', 'Take it to Attorney Rıfat; he shows it at the meeting'),
            flag: 'deedToRifat',
            rep: 3,
            then: [{ who: 'saadet', text: T('Doğru karar. Kopyası bende kalsın, aslı Rıfat\'ta. Sen de dikkatli taşı.', 'The right call. I keep a copy, Rıfat keeps the original. Carry it carefully.'), mood: 'happy' }],
          },
          {
            text: T('Dolapta kalsın, kilidi değiştirin', 'Leave it in the cabinet; change the lock'),
            flag: 'deedStays',
            rep: 2,
            then: [{ who: 'saadet', text: T('Peki. Ama Cevdet\'e dikkat et; anahtar onda da var.', 'Alright. But watch Cevdet; he has a key too.') }],
          },
          {
            text: T('Selim\'e satalım (+300₺)', 'Sell it to Selim (+300₺)'),
            flag: 'soldDeed',
            wallet: 300,
            rep: -20,
            then: [
              { who: 'gulsum', text: T('Cemal! Sen de mi?!', 'Cemal! You too?!'), mood: 'angry' },
              { who: 'saadet', text: T('Git buradan. Rıza bunu duyunca yıkılacak.', 'Get out of here. This will break Rıza\'s heart.'), mood: 'angry' },
            ],
          },
        ],
      },
      { who: 'remzi', text: T('Gece nöbetinde gördüklerimi bir gün anlatırım. Ama önce çayımı getir, tam demli!', 'One day I\'ll tell you what I saw on night watch. But first bring my tea, fully brewed!'), unless: 'soldDeed', mood: 'happy' },
    ],
  },
  promo_4: {
    id: 'promo_4',
    set: 'teras',
    title: T('Terfi: Han Çaycıbaşı', 'Promotion: Chief of Tea'),
    actors: [A.gulsum(-1.2, -0.2, 0.6), A.nadir(-0.2, -0.7, 0.2), A.riza(0.9, -0.5, -0.4), A.cemal(1.7, 0.5, 0)],
    lines: [
      { who: 'gulsum', text: T('Han Çaycıbaşı! Paspası bırakıp alkışlayacağım valla.', 'Chief of Tea! I\'m putting down my mop to applaud, honestly.'), mood: 'happy' },
      { who: 'nadir', text: T('Cuma günü burada toplantı var. Selim bir rapor getirecek. Senin de orada olmanı istiyorum.', 'There\'s a meeting here on Friday. Selim is bringing a report. I want you there.') },
      { who: 'riza', text: T('Kanıtlarını topla evlat. O gün herkes sana bakacak.', 'Gather your evidence, kid. That day everyone will be looking at you.') },
      { who: 'riza', text: T('Selim\'in zarfını bana getirdin ya... Saklıyorum. O gün işe yarayacak.', 'That envelope of Selim\'s you brought me... I\'m keeping it. It will come in handy that day.'), if: 'doubleAgent', mood: 'happy' },
      { who: 'riza', text: T('Zarfı aldığını duydum. Para gelir geçer evlat, itibar kalır.', 'I heard you took the envelope. Money comes and goes, kid; your name stays.'), if: 'tookEnvelope', mood: 'angry' },
    ],
  },
  meeting: {
    id: 'meeting',
    set: 'teras',
    title: T('Han Toplantısı', 'The Han Meeting'),
    actors: [A.nadir(-0.3, -0.9, 0.1), A.selim(0.8, -0.6, -0.5), A.turgut(1.5, -0.2, -0.8), A.riza(-1.3, -0.3, 0.6), A.lale(-1.6, 0.5, 1.0), A.cemal(1.7, 0.5, 0)],
    lines: [
      { who: 'selim', text: T('Amca, rapor ortada: bina çürük. İmzala, herkes kurtulsun. Avukatlar bekliyor.', 'Uncle, the report is clear: the building is rotten. Sign, and everyone is spared. The lawyers are waiting.') },
      { who: 'nadir', text: T('Bilmiyorum Selim... Kırk yıllık han bu.', 'I don\'t know, Selim... This han is forty years old.') },
      { who: 'selim', text: T('Tapu da zaten bizde. Saadet Hanım\'ın dolabı bomboş!', 'And the deed is ours now. Mrs. Saadet\'s cabinet is empty!'), if: 'soldDeed', mood: 'happy' },
      { who: 'nadir', text: T('Rıfat dün bana hanın asıl tapusunu getirdi Selim. Bu han vakıf malı. Kimse tek imzayla satamaz!', 'Rıfat brought me the han\'s original deed yesterday, Selim. This han belongs to a foundation. Nobody can sell it with one signature!'), if: 'deedToRifat', mood: 'angry' },
      { who: 'selim', text: T('Çaycı, sen de bir şey söyle. Teklifim hâlâ geçerli.', 'Tea boy, say something. My offer still stands.'), beat: 'envelope' },
      { who: 'selim', text: T('Hem bu çaycı benden para aldı. Onun sözüne kim inanır?', 'Besides, this tea boy took my money. Who would believe him?'), if: 'tookEnvelope', mood: 'happy' },
      { who: 'cemal', text: T('Zarfınız burada Selim Bey. Nadir Bey, yeğeniniz beni satın almaya çalıştı. Üstünde kendi el yazısı var.', 'Here is your envelope, Selim Bey. Nadir Bey, your nephew tried to buy me. It has his own handwriting on it.'), if: 'doubleAgent' },
      { who: 'nadir', text: T('Demek öyle Selim...', 'So that\'s how it is, Selim...'), if: 'doubleAgent', mood: 'angry' },
      { who: 'riza', text: T('Şimdi senin sıran evlat.', 'Now it\'s your turn, kid.') },
    ],
  },
  end_saved: {
    id: 'end_saved',
    set: 'teras',
    title: T('Patron Cemal', 'Boss Cemal'),
    actors: [A.nadir(-0.3, -0.6, 0.3), A.riza(-1.2, -0.2, 0.7), A.gulsum(1.1, -0.3, -0.6), A.lale(1.6, 0.4, -1.0), A.cemal(1.7, 0.5, 0)],
    lines: [
      { who: 'nadir', text: T('Bu handa herkes sana muhtaç evlat. Ocak artık senin. Patron sensin.', 'Everyone in this han needs you, kid. The stove is yours now. You\'re the boss.'), beat: 'key', mood: 'happy' },
      { who: 'riza', text: T('Tepsiyi de al. Babamdan kalma. Sende daha çok yakışıyor.', 'Take the tray too. It was my father\'s. It suits you better.'), mood: 'happy' },
      { who: 'nadir', text: T('Vakıf tapusunu da çerçeveletip ocağın üstüne asacağız. Bir daha kimse kaybetmesin.', 'We\'ll frame the foundation deed and hang it above the stove. Nobody loses it again.'), if: 'deedToRifat', mood: 'happy' },
      { who: 'gulsum', text: T('Patron Cemal! İlk çay benden!', 'Boss Cemal! The first tea is on me!'), mood: 'happy' },
      { who: 'cemal', text: T('Çayı dökmedim, lafı da yerinde döktüm. Ocak açık, herkes buyursun!', 'I never spilled the tea, and I spilled the talk at the right time. The stove is open, everyone welcome!'), mood: 'happy' },
    ],
  },
};

/** Terfi edilen unvan sırasına göre sahne. */
export const PROMO_SCENE: Record<number, string> = { 1: 'promo_1', 2: 'promo_2', 3: 'promo_3', 4: 'promo_4' };

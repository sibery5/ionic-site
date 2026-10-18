// Hikâye verisi: günler, ofisler, dedikodular, notlar ve sonlar. Her metin TR + EN.

import type { PersonId } from './rumors';

export type Lang = 'tr' | 'en';
export interface Text {
  tr: string;
  en: string;
}

export interface Office {
  id: string; // harita harfi (a..f)
  name: Text;
  person: Text; // müşterinin adı
  look: CustomerLook;
  pid: PersonId; // kişinin kimliği (dedikodu sistemi)
  lines: Text[]; // teslimde söylenen rastgele sözler
}

export interface CustomerLook {
  shirt: number;
  pants: number;
  skin: number;
  hair: number;
  bald?: boolean;
  scarf?: number; // başörtüsü rengi
  glasses?: boolean;
  mustache?: boolean;
  beard?: boolean;
  hairStyle?: 'short' | 'side' | 'curly' | 'bun' | 'long' | 'bald';
  tie?: number;
}

export interface DayDef {
  floor: Text;
  title: Text;
  note: Text; // Rıza Usta'nın notu
  obstacle: Text;
  offices: Office[];
}

const SKIN = [0xf1c7a1, 0xe0ac7e, 0xc68a5f, 0x9a6440];

export const DAYS: DayDef[] = [
  {
    floor: { tr: 'Zemin Kat', en: 'Ground Floor' },
    title: { tr: '1. Gün — İlk Tepsi', en: 'Day 1 — The First Tray' },
    obstacle: { tr: 'Kalabalık koridor', en: 'Crowded corridor' },
    note: {
      tr: 'Evlat, tepsi artık sende. Ocakta 1 açık, 2 demli doldurur. Rengi tavşan kanına gelince bırak. Yürürken yumuşak ol: ani duruş çayı döker. Fırıldak için sol tıka basılı tut, fareyle hızlı daireler çiz. Unutma: çayı dökme, lafı dökme. — Rıza Usta',
      en: "Kid, the tray is yours now. At the stove, 1 pours light, 2 pours strong. Let go when it's rabbit-blood red. Walk smooth: sudden stops spill tea. For the Spin, hold left click and draw fast circles with the mouse. Remember: don't spill the tea, don't spill the talk. — Master Rıza",
    },
    offices: [
      {
        id: 'a',
        pid: 'hayri',
        name: { tr: 'Terzi Hayri', en: 'Hayri the Tailor' },
        person: { tr: 'Hayri Usta', en: 'Master Hayri' },
        look: { shirt: 0x7a5c3e, pants: 0x3b3b3b, skin: SKIN[1], hair: 0xd8d8d8, glasses: true, mustache: true },
        lines: [
          { tr: 'Eline sağlık evlat.', en: 'Bless your hands, kid.' },
          { tr: 'Rıza\'dan iyisin valla.', en: "You're better than Rıza, honestly." },
        ],
      },
      {
        id: 'b',
        pid: 'sevim',
        name: { tr: 'Kırtasiye Bilgi', en: 'Bilgi Stationery' },
        person: { tr: 'Sevim Hanım', en: 'Mrs. Sevim' },
        look: { shirt: 0x4f7cac, pants: 0x2e3a4a, skin: SKIN[0], hair: 0x3a2a1a, scarf: 0xb3261e },
        lines: [
          { tr: 'Tam kıvamında!', en: 'Just right!' },
          { tr: 'Oh, ilaç gibi.', en: 'Ahh, like medicine.' },
        ],
      },
      {
        id: 'c',
        pid: 'ferhat',
        name: { tr: 'Noter Kâtibi Ferhat', en: 'Ferhat, Notary Clerk' },
        person: { tr: 'Ferhat Bey', en: 'Mr. Ferhat' },
        look: { shirt: 0xe8e4d8, pants: 0x1f2630, skin: SKIN[2], hair: 0x111111, tie: 0x1e2a3a },
        lines: [
          { tr: 'Mühür gibi çay.', en: 'Tea as official as a stamp.' },
          { tr: 'Teşekkürler genç.', en: 'Thanks, young man.' },
        ],
      },
    ],
  },
  {
    floor: { tr: '1. Kat', en: '1st Floor' },
    title: { tr: '2. Gün — Gülsüm Abla Sildi', en: 'Day 2 — Gülsüm Just Mopped' },
    obstacle: { tr: 'Kaygan zemin', en: 'Slippery floor' },
    note: {
      tr: 'Gülsüm Abla sabah sabah koridoru silmiş. Sarı tabelayı görünce yavaşla, kayarsan tepsi uçar. Döktüğün çay da yeri kaydırır, ona göre. — Rıza Usta',
      en: 'Gülsüm mopped the corridor first thing. Slow down at the yellow signs or the tray flies. Spilled tea makes the floor slippery too. — Master Rıza',
    },
    offices: [
      {
        id: 'a',
        pid: 'fikret',
        name: { tr: 'Mali Müşavir Fikret', en: 'Fikret, Accountant' },
        person: { tr: 'Fikret Bey', en: 'Mr. Fikret' },
        look: { shirt: 0xdedbd0, pants: 0x3a3f47, skin: SKIN[0], hair: 0x5a4a3a, bald: true, glasses: true, tie: 0x6b2a2a },
        lines: [
          { tr: 'Faturasını sonra keseriz.', en: "I'll invoice you later." },
          { tr: 'Kuruşu kuruşuna, tam kıvam.', en: 'Accurate to the penny.' },
        ],
      },
      {
        id: 'b',
        pid: 'sukran',
        name: { tr: 'Sigortacı Şükran', en: 'Şükran Insurance' },
        person: { tr: 'Şükran Hanım', en: 'Mrs. Şükran' },
        look: { shirt: 0x9b3d6b, pants: 0x2b2b2b, skin: SKIN[1], hair: 0x2a1a10 },
        lines: [
          { tr: 'Bardak sigortası yaptıralım mı sana?', en: 'Shall we insure your glasses?' },
          { tr: 'Çok naziksin.', en: "You're very kind." },
        ],
      },
      {
        id: 'c',
        pid: 'rifat',
        name: { tr: 'Av. Rıfat', en: 'Rıfat, Attorney' },
        person: { tr: 'Av. Rıfat', en: 'Attorney Rıfat' },
        look: { shirt: 0x22262e, pants: 0x22262e, skin: SKIN[2], hair: 0x9a9a9a, mustache: true, tie: 0xb3261e },
        lines: [
          { tr: 'İtirazım yok, çay mükemmel.', en: 'No objection, the tea is perfect.' },
          { tr: 'Celse arasına iyi geldi.', en: 'Perfect for a recess.' },
        ],
      },
    ],
  },
  {
    floor: { tr: '2. Kat', en: '2nd Floor' },
    title: { tr: '3. Gün — Paşa Uyandı', en: 'Day 3 — Paşa Is Awake' },
    obstacle: { tr: 'Han kedisi Paşa', en: 'Paşa the han cat' },
    note: {
      tr: 'Paşa bugün keyifsiz, ayağına dolanır. Üstüne basarsan sendelersin. Bir çay tabağı süt koy, sever seni. — Rıza Usta',
      en: "Paşa is cranky today and will weave between your feet. Step on him and you'll stumble. A saucer of milk and he'll love you. — Master Rıza",
    },
    offices: [
      {
        id: 'a',
        pid: 'nevin',
        name: { tr: 'Medyum Nevin', en: 'Nevin the Psychic' },
        person: { tr: 'Nevin Hanım', en: 'Madame Nevin' },
        look: { shirt: 0x5b2c83, pants: 0x2b1b3b, skin: SKIN[0], hair: 0xc04020, glasses: false },
        lines: [
          { tr: 'Bu çayda kısmet var.', en: 'This tea holds good fortune.' },
          { tr: 'Gelişini hissetmiştim.', en: 'I sensed you coming.' },
        ],
      },
      {
        id: 'b',
        pid: 'lale',
        name: { tr: 'Fotoğrafçı Lale', en: 'Lale Photo Studio' },
        person: { tr: 'Lale', en: 'Lale' },
        look: { shirt: 0xd9822b, pants: 0x2e2e2e, skin: SKIN[1], hair: 0x1a1a1a },
        lines: [
          { tr: 'Dur, bir kare çekeyim!', en: 'Hold on, let me take a shot!' },
          { tr: 'Işık da çay da güzel.', en: 'Lovely light, lovely tea.' },
        ],
      },
      {
        id: 'c',
        pid: 'kerem',
        name: { tr: 'Boğaz Turizm', en: 'Bosphorus Travel' },
        person: { tr: 'Kerem', en: 'Kerem' },
        look: { shirt: 0x3a8a6a, pants: 0x30302a, skin: SKIN[3], hair: 0x111111 },
        lines: [
          { tr: 'Vapur çayı gibi olmuş.', en: 'Tastes like ferry tea.' },
          { tr: 'Turistlere de öneririm.', en: "I'd recommend it to tourists." },
        ],
      },
    ],
  },
  {
    floor: { tr: '3. Kat', en: '3rd Floor' },
    title: { tr: '4. Gün — Elektrikler Gitti', en: 'Day 4 — Blackout' },
    obstacle: { tr: 'Elektrik kesintisi', en: 'Power outage' },
    note: {
      tr: 'Üçüncü katta sigorta yine attı. Karanlıkta el fenerine güven, ışıklı tabelaları takip et. KriptoBey\'in kapısına dikkat; orada bir iş dönüyor. — Rıza Usta',
      en: "The fuse blew on the third floor again. Trust the flashlight and follow the lit signs. Watch KriptoBey's door; something is going on in there. — Master Rıza",
    },
    offices: [
      {
        id: 'a',
        pid: 'selim',
        name: { tr: 'KriptoBey A.Ş.', en: 'KriptoBey Inc.' },
        person: { tr: 'Selim', en: 'Selim' },
        look: { shirt: 0x111111, pants: 0x2a3550, skin: SKIN[0], hair: 0xb08040 },
        lines: [
          { tr: 'Bahşişi coin ile versem?', en: 'Can I tip you in crypto?' },
          { tr: 'Hızlı ol, toplantıdayım.', en: "Make it quick, I'm in a meeting." },
        ],
      },
      {
        id: 'b',
        pid: 'turgut',
        name: { tr: 'Emlakçı Turgut', en: 'Turgut Realty' },
        person: { tr: 'Turgut', en: 'Turgut' },
        look: { shirt: 0xc9b26b, pants: 0x4a3a2a, skin: SKIN[2], hair: 0x222222, mustache: true },
        lines: [
          { tr: 'Çay güzel, manzara daha güzel olacak.', en: "Nice tea. The view's going to be nicer." },
          { tr: 'Senin ocağı da satarız haha.', en: "We'll sell your stove too, haha." },
        ],
      },
      {
        id: 'c',
        pid: 'defne',
        name: { tr: 'Mimar Defne', en: 'Defne Architects' },
        person: { tr: 'Defne Hanım', en: 'Ms. Defne' },
        look: { shirt: 0x2d6a8a, pants: 0x1f1f1f, skin: SKIN[1], hair: 0x6b3a1a, glasses: true },
        lines: [
          { tr: 'Bu han 1923\'ten beri ayakta, biliyor musun?', en: 'This han has stood since 1923, you know?' },
          { tr: 'Kolonlar sapasağlam, çayın gibi.', en: 'The columns are as solid as your tea.' },
        ],
      },
    ],
  },
  {
    floor: { tr: 'Teras', en: 'Rooftop' },
    title: { tr: '5. Gün — Han Toplantısı', en: 'Day 5 — The Han Meeting' },
    obstacle: { tr: 'Rüzgâr', en: 'Wind' },
    note: {
      tr: 'Bugün terasta toplantı var, Nadir Bey herkesi çağırdı. Rüzgâr sert eser, tepsiyi alçak tut. Akşam ne söyleyeceğine sen karar vereceksin evlat. — Rıza Usta',
      en: "There's a meeting on the roof today; Nadir Bey called everyone. The wind is strong, keep the tray low. Tonight you decide what to say, kid. — Master Rıza",
    },
    offices: [
      {
        id: 'a',
        pid: 'nadir',
        name: { tr: 'Nadir Bey', en: 'Nadir Bey' },
        person: { tr: 'Nadir Bey', en: 'Nadir Bey' },
        look: { shirt: 0x6b4226, pants: 0x3a2a1a, skin: SKIN[1], hair: 0xffffff, mustache: true, glasses: true },
        lines: [
          { tr: 'Rıza\'nın tepsisi sana yakıştı.', en: "Rıza's tray suits you." },
          { tr: 'Bu han benim çocukluğum.', en: 'This han is my childhood.' },
        ],
      },
      {
        id: 'b',
        pid: 'gokdelen',
        name: { tr: 'Misafir Masası', en: 'Guest Table' },
        person: { tr: 'Gökdelen Yapı', en: 'Skyscraper Corp.' },
        look: { shirt: 0x3a3a46, pants: 0x3a3a46, skin: SKIN[0], hair: 0x333333, tie: 0x2d6a8a, glasses: true },
        lines: [
          { tr: 'Burada güzel bir otopark olur.', en: 'This would make a nice parking lot.' },
          { tr: 'Hmm, fena değil.', en: 'Hmm, not bad.' },
        ],
      },
      {
        id: 'c',
        pid: 'gulsum',
        name: { tr: 'Han Esnafı', en: 'Han Tenants' },
        person: { tr: 'Gülsüm Abla', en: 'Gülsüm' },
        look: { shirt: 0x8a9a5b, pants: 0x3b3b3b, skin: SKIN[2], hair: 0x2a1a10, scarf: 0x2d6a8a },
        lines: [
          { tr: 'Yerleri yeni sildim, dikkat!', en: 'I just mopped, careful!' },
          { tr: 'Aferin oğluma.', en: "That's my boy." },
        ],
      },
    ],
  },
];


export const ENDINGS = {
  saved: {
    title: { tr: 'Patron Cemal', en: 'Boss Cemal' },
    text: {
      tr: 'Cemal terasta herkesin önünde kalktı ve topladığı kanıtları tek tek ortaya koydu. Lale fotoğrafı çıkardı, Av. Rıfat vekâletin sahte olduğunu, Defne Hanım binanın sapasağlam olduğunu kanıtladı. Nadir Bey Selim\'in kâğıtlarını yırttı. Sonra Rıza Usta tepsisini Cemal\'e uzattı, Nadir Bey de çay ocağının anahtarını: "Bu handa herkes sana muhtaç evlat. Ocak artık senin. Patron sensin."',
      en: "Cemal stood up on the rooftop in front of everyone and laid out his evidence piece by piece. Lale produced the photo, Attorney Rıfat proved the power of attorney was forged, Ms. Defne proved the building was rock solid. Nadir Bey tore up Selim's papers. Then Master Rıza handed Cemal his tray, and Nadir Bey handed him the key to the tea house: \"Everyone in this han needs you, kid. The stove is yours now. You're the boss.\"",
    },
  },
  sold: {
    title: { tr: 'AVM Müdürü', en: 'Mall Manager' },
    text: {
      tr: 'Cemal Selim\'in zarfını aldı ve sustu. Cuma günü imzalar atıldı, han yıkıldı, yerine cam bir AVM dikildi. Cemal bugün "ÇaycıX" zincirinin bölge müdürü: takım elbiseli, maaşı yüksek. Ama her sabah otoparkın tam ortasında, eski ocağın olduğu yerde, bir an duruyor.',
      en: 'Cemal took Selim\'s envelope and kept quiet. On Friday the papers were signed, the han was torn down and a glass mall rose in its place. Today Cemal is regional manager of the "TeaX" chain: a suit, a fat salary. But every morning, right in the middle of the parking lot where the old stove used to be, he stops for a moment.',
    },
  },
  disbelieved: {
    title: { tr: 'Kimse İnanmadı', en: 'Nobody Believed You' },
    text: {
      tr: 'Cemal ağzını açtı ama elinde yeterince bilgi yoktu. "Çaycı dedikodusu" dediler, güldüler. Han satıldı. Cemal bugün AVM\'nin yemek katında çay satıyor; ama her bardağı hâlâ tek damla dökmeden taşıyor.',
      en: 'Cemal spoke up, but he didn\'t know enough. "Tea boy gossip," they laughed. The han was sold. Today Cemal sells tea in the mall food court, and he still carries every glass without spilling a drop.',
    },
  },
  silent: {
    title: { tr: 'Susmak Altın', en: 'Silence Is Golden' },
    text: {
      tr: 'Cemal sustu. Rıza Usta\'nın sözünü tuttu: lafı dökmedi. Han satıldı ama Cemal biriktirdiği bahşişlerle Karaköy vapurunda kendi çay ocağını açtı. Dalgalı denizde bile tek damla dökmüyor.',
      en: "Cemal kept quiet and honored Master Rıza's rule: he didn't spill the talk. The han was sold, but with his tips Cemal opened his own tea stand on the Karaköy ferry. Even on rough seas he never spills a drop.",
    },
  },
};

/** Giriş salonundaki dört müşteri (hikâyeden tanıdık yüzler, burada dedikodu yok). */
export const ARENA_OFFICES: Office[] = [
  { ...DAYS[0].offices[0], id: 'a' },
  { ...DAYS[0].offices[1], id: 'b' },
  { ...DAYS[1].offices[2], id: 'c' },
  { ...DAYS[2].offices[0], id: 'd' },
];

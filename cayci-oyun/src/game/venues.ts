import { ARENA, LEVELS, LevelDef } from './levels';
import { ARENA_OFFICES, DAYS, Office, Text } from './story';
import type { RunStats } from '../meta/stats';

// Kariyer: hanın altı mekânı. Her biri kendi kuralı, iki özel görevi, yıldız hedefleri ve rakipleriyle.

export type ObjectiveKind = 'towerDelivery' | 'spins' | 'delivered' | 'noJarLost' | 'colored' | 'noSlip' | 'noCatTrip' | 'combo' | 'vipPerfect' | 'bankOnce';

export interface Objective {
  kind: ObjectiveKind;
  target: number;
}

export interface VenueRules {
  colored: boolean; // siparişler açık/demli ister
  mopper: boolean; // Gülsüm Abla siler, arkasında ıslak iz bırakır
  dark: boolean;
  wind: boolean;
  cat: boolean;
}

export interface Venue {
  id: string;
  level: LevelDef;
  offices: Office[];
  name: Text;
  obstacle: Text;
  note: Text; // Rıza Usta'nın notu (hikâye)
  duration: number;
  stars: [number, number, number];
  rules: VenueRules;
  objectives: [Objective, Objective];
  rivals: { name: string; score: number }[];
}

const R = (colored = false, extra: Partial<VenueRules> = {}): VenueRules => ({ colored, mopper: false, dark: false, wind: false, cat: false, ...extra });

export const VENUES: Venue[] = [
  {
    id: 'salon',
    level: ARENA,
    offices: ARENA_OFFICES,
    name: { tr: 'Giriş Salonu', en: 'Entrance Hall' },
    obstacle: { tr: 'Öğrenme günü', en: 'Learning day' },
    note: {
      tr: 'Evlat, kırk yıl bu tepsiyle çay taşıdım; şimdi sıra sende. Ortadaki kavanoz da benim kavanozum: bahşişler ona girer, ocağa dönünce kasaya geçer. Tepsiyi düşürürsen kavanoz da gider. Hırslı ol ama aptal olma. Bir de kuralı unutma: çayı dökme, lafı dökme. — Rıza Usta',
      en: "Kid, I carried tea on this tray for forty years; now it's your turn. The jar in the middle is my old jar: tips go in, and you bank them back at the stove. Drop the tray and the jar goes too. Be greedy, but not stupid. And remember the rule: don't spill the tea, don't spill the talk. — Master Rıza",
    },
    duration: 90,
    stars: [30, 70, 120],
    rules: R(false, { cat: true }),
    objectives: [
      { kind: 'towerDelivery', target: 6 },
      { kind: 'spins', target: 1 },
    ],
    rivals: [
      { name: 'Paşa', score: 10 },
      { name: 'Gülsüm Abla', score: 45 },
      { name: 'Rıza Usta', score: 145 },
    ],
  },
  {
    id: 'zemin',
    level: LEVELS[0],
    offices: DAYS[0].offices,
    name: { tr: 'Zemin Kat', en: 'Ground Floor' },
    obstacle: { tr: 'Kalabalık koridor, uzun yollar', en: 'Crowded corridor, long walks' },
    note: {
      tr: 'Zemin katta koridor uzun, insan çok. Uzun yolda çok bardak taşımak cazip ama kalabalıkta bir omuz darbesi yeter. Hayri Usta bir şeyler biliyor gibi; altın balonlu (VIP) siparişini eksiksiz götürürsen belki anlatır. — Rıza Usta',
      en: 'The ground floor corridor is long and crowded. Carrying a big stack on a long walk is tempting, but one bump in the crowd is enough. Hayri seems to know something; serve his whole gold-bubble (VIP) order and he might talk. — Master Rıza',
    },
    duration: 100,
    stars: [30, 65, 110],
    rules: R(false),
    objectives: [
      { kind: 'delivered', target: 15 },
      { kind: 'noJarLost', target: 1 },
    ],
    rivals: [
      { name: 'Selim', score: 20 },
      { name: 'Ferhat Bey', score: 50 },
      { name: 'Rıza Usta', score: 130 },
    ],
  },
  {
    id: 'kat1',
    level: LEVELS[1],
    offices: DAYS[1].offices,
    name: { tr: '1. Kat', en: '1st Floor' },
    obstacle: { tr: 'Açık/demli siparişler, Gülsüm Abla siliyor', en: 'Light/strong orders, Gülsüm is mopping' },
    note: {
      tr: 'Birinci katta herkes çayını farklı içer. Ocakta E demli, Q açık doldurur; yanlış çayı kimse almaz. Gülsüm Abla da bugün durmadan siliyor, ıslak izine basma. Fikret Bey hesap kitapta bir tuhaflık görmüş. — Rıza Usta',
      en: 'On the first floor everyone takes their tea differently. At the stove E pours strong, Q pours light; nobody accepts the wrong one. Gülsüm keeps mopping today, so mind her wet trail. Fikret noticed something odd in the books. — Master Rıza',
    },
    duration: 110,
    stars: [40, 85, 140],
    rules: R(true, { mopper: true }),
    objectives: [
      { kind: 'colored', target: 10 },
      { kind: 'noSlip', target: 1 },
    ],
    rivals: [
      { name: 'Şükran Hanım', score: 35 },
      { name: 'Gülsüm Abla', score: 65 },
      { name: 'Rıza Usta', score: 165 },
    ],
  },
  {
    id: 'kat2',
    level: LEVELS[2],
    offices: DAYS[2].offices,
    name: { tr: '2. Kat', en: '2nd Floor' },
    obstacle: { tr: 'Han kedisi Paşa', en: 'Paşa the han cat' },
    note: {
      tr: 'Paşa bugün ikinci katta, ayağına dolanacak. Kuleyle koşarken takılırsan hepsi gider; Ctrl ile parmak ucunda yürü. Fotoğrafçı Lale gece hanın önünde bir şey çekmiş. — Rıza Usta',
      en: "Paşa is on the second floor today and he'll weave between your feet. Trip with a tower and it all goes; hold Ctrl to tiptoe. Lale the photographer took a picture of something outside the han at night. — Master Rıza",
    },
    duration: 110,
    stars: [30, 60, 95],
    rules: R(true, { cat: true }),
    objectives: [
      { kind: 'noCatTrip', target: 1 },
      { kind: 'combo', target: 2 },
    ],
    rivals: [
      { name: 'Kerem', score: 25 },
      { name: 'Medyum Nevin', score: 50 },
      { name: 'Rıza Usta', score: 110 },
    ],
  },
  {
    id: 'kat3',
    level: LEVELS[3],
    offices: DAYS[3].offices,
    name: { tr: '3. Kat', en: '3rd Floor' },
    obstacle: { tr: 'Elektrik kesintisi', en: 'Power outage' },
    note: {
      tr: 'Üçüncü katta sigorta yine attı, el feneriyle idare edeceksin. KriptoBey\'in kapısında bir iş dönüyor. Selim\'in VIP siparişini eksiksiz götür, telefonda ne konuştuğunu duy. — Rıza Usta',
      en: "The fuse blew on the third floor again; you'll have to make do with a flashlight. Something is going on at KriptoBey's door. Serve Selim's whole VIP order and hear what he says on the phone. — Master Rıza",
    },
    duration: 110,
    stars: [30, 65, 110],
    rules: R(true, { dark: true }),
    objectives: [
      { kind: 'vipPerfect', target: 1 },
      { kind: 'bankOnce', target: 50 },
    ],
    rivals: [
      { name: 'Turgut', score: 30 },
      { name: 'Mimar Defne', score: 55 },
      { name: 'Rıza Usta', score: 125 },
    ],
  },
  {
    id: 'teras',
    level: LEVELS[4],
    offices: DAYS[4].offices,
    name: { tr: 'Teras', en: 'Rooftop' },
    obstacle: { tr: 'Rüzgâr ve han toplantısı', en: 'Wind and the han meeting' },
    note: {
      tr: 'Bugün terasta han toplantısı var. Rüzgâr sert eser, tepsiyi alçak tut. Nadir Bey\'in, misafirlerin ve esnafın VIP siparişleri son parçaları verecek. Vardiyadan sonra ne söyleyeceğine sen karar vereceksin. — Rıza Usta',
      en: "There's a han meeting on the roof today. The wind is strong, keep the tray low. VIP orders from Nadir Bey, the guests and the tenants hold the last pieces. After the shift, you decide what to say. — Master Rıza",
    },
    duration: 120,
    stars: [55, 105, 180],
    rules: R(true, { wind: true, cat: true }),
    objectives: [
      { kind: 'spins', target: 2 },
      { kind: 'towerDelivery', target: 8 },
    ],
    rivals: [
      { name: 'Gökdelen Yapı', score: 55 },
      { name: 'Nadir Bey', score: 100 },
      { name: 'Rıza Usta', score: 215 },
    ],
  },
];

export function venueById(id: string): Venue | undefined {
  return VENUES.find((v) => v.id === id);
}

export function objectiveText(o: Objective): Text {
  const n = o.target;
  switch (o.kind) {
    case 'towerDelivery':
      return { tr: `Tepside ${n}+ bardakla teslim yap`, en: `Deliver while carrying ${n}+ glasses` };
    case 'spins':
      return { tr: `${n} Fırıldak yap`, en: `Land ${n} Spin${n > 1 ? 's' : ''}` };
    case 'delivered':
      return { tr: `${n} bardak teslim et`, en: `Deliver ${n} glasses` };
    case 'noJarLost':
      return { tr: 'Hiç kavanoz kaybetme', en: 'Never lose the jar' };
    case 'colored':
      return { tr: `${n} açık/demli bardağı doğru ver`, en: `Serve ${n} light/strong glasses correctly` };
    case 'noSlip':
      return { tr: 'Hiç kaymadan bitir', en: 'Finish without slipping' };
    case 'noCatTrip':
      return { tr: 'Paşa\'ya hiç takılma', en: 'Never trip over Paşa' };
    case 'combo':
      return { tr: `×${String(n).replace('.', ',')} çarpana ulaş`, en: `Reach a ×${n} multiplier` };
    case 'vipPerfect':
      return { tr: `${n} VIP siparişini kusursuz ver`, en: `Serve ${n} VIP order${n > 1 ? 's' : ''} perfectly` };
    case 'bankOnce':
      return { tr: `Tek seferde ${n}₺ kasaya geçir`, en: `Bank ${n}₺ in one trip` };
  }
}

/** Görev tamamlandı mı? "Hiç ... olmadan" görevleri, turda en az 10 bardak teslim edildiyse geçerli. */
export function objectiveDone(o: Objective, s: RunStats): boolean {
  switch (o.kind) {
    case 'towerDelivery':
      return s.maxDeliveryTower >= o.target;
    case 'spins':
      return s.spins >= o.target;
    case 'delivered':
      return s.delivered >= o.target;
    case 'noJarLost':
      return s.jarsLost === 0 && s.delivered >= 10;
    case 'colored':
      return s.coloredServed >= o.target;
    case 'noSlip':
      return s.slips === 0 && s.delivered >= 10;
    case 'noCatTrip':
      return s.catTrips === 0 && s.delivered >= 10;
    case 'combo':
      return s.maxCombo >= o.target;
    case 'vipPerfect':
      return s.vipPerfect >= o.target;
    case 'bankOnce':
      return s.maxBank >= o.target;
  }
}

export function starsFor(score: number, stars: [number, number, number]): number {
  return score >= stars[2] ? 3 : score >= stars[1] ? 2 : score >= stars[0] ? 1 : 0;
}

/** Bütün hikâye dedikodularının sayısı (VIP siparişlerle açılır). */

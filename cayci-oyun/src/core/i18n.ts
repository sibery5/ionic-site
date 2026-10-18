import type { Lang, Text } from '../game/story';

// Arayüz metinleri. Hikâye metinleri story.ts içinde.

const UI = {
  subtitle: { tr: "Don't Spill the Tea", en: "Don't Spill the Tea" },
  tagline: { tr: 'Askılı tepsiyle, tek damla dökmeden.', en: 'One hanging tray. Not a single drop.' },
  newGame: { tr: 'Yeni Hikâye', en: 'New Story' },
  continue: { tr: 'Devam Et', en: 'Continue' },
  freePlay: { tr: 'Serbest Vardiya', en: 'Free Shift' },
  daily: { tr: 'Günlük Mücadele', en: 'Daily Challenge' },
  howTo: { tr: 'Nasıl Oynanır', en: 'How to Play' },
  settings: { tr: 'Ayarlar', en: 'Settings' },
  back: { tr: 'Geri', en: 'Back' },
  language: { tr: 'Dil', en: 'Language' },
  volume: { tr: 'Ses', en: 'Volume' },
  music: { tr: 'Müzik', en: 'Music' },
  sensitivity: { tr: 'Fare hassasiyeti', en: 'Mouse sensitivity' },
  start: { tr: 'Vardiyaya Başla', en: 'Start Shift' },
  clickToPlay: { tr: 'Oynamak için tıkla', en: 'Click to play' },
  paused: { tr: 'Duraklatıldı', en: 'Paused' },
  resume: { tr: 'Devam', en: 'Resume' },
  restart: { tr: 'Vardiyayı Yeniden Başlat', en: 'Restart Shift' },
  quit: { tr: 'Ana Menü', en: 'Main Menu' },
  shiftOver: { tr: 'Vardiya Bitti', en: 'Shift Over' },
  earned: { tr: 'Kazanılan', en: 'Earned' },
  target: { tr: 'Hedef', en: 'Target' },
  delivered: { tr: 'Teslim edilen bardak', en: 'Glasses delivered' },
  spilledTotal: { tr: 'Dökülen çay', en: 'Tea spilled' },
  broken: { tr: 'Kırılan bardak', en: 'Glasses broken' },
  spins: { tr: 'Fırıldak', en: 'Spins' },
  gossipFound: { tr: 'Duyulan dedikodu', en: 'Gossip overheard' },
  next: { tr: 'Devam', en: 'Continue' },
  retry: { tr: 'Tekrar Dene', en: 'Try Again' },
  failed: { tr: 'Hedefe ulaşamadın. Rıza Usta olsa ne derdi?', en: "You missed the target. What would Master Rıza say?" },
  shop: { tr: 'Han Çarşısı', en: 'Han Market' },
  wallet: { tr: 'Cüzdan', en: 'Wallet' },
  buy: { tr: 'Al', en: 'Buy' },
  owned: { tr: 'Alındı', en: 'Owned' },
  nextDay: { tr: 'Sonraki Gün', en: 'Next Day' },
  choiceTitle: { tr: 'Han Toplantısı', en: 'The Han Meeting' },
  choiceText: {
    tr: 'Terasta herkes toplandı. Selim raporu Nadir Bey\'in önüne koydu, kalemi uzattı. Bütün gözler bir an sana döndü, çay tepsisini tutan çırağa. Ne yapacaksın?',
    en: 'Everyone has gathered on the roof. Selim lays the report before Nadir Bey and hands him a pen. For a moment every eye turns to you, the boy with the tea tray. What will you do?',
  },
  spillIt: { tr: 'Çayı dök (her şeyi anlat)', en: 'Spill the tea (tell everything)' },
  stayQuiet: { tr: 'Sus', en: 'Stay quiet' },
  theEnd: { tr: 'Son', en: 'The End' },
  credits: { tr: 'ÇAYCI · Bütün modeller, sesler ve müzik koddan üretildi.', en: 'ÇAYCI · Every model, sound and note generated in code.' },
  // HUD
  ocakHint: { tr: '1 açık · 2 demli (basılı tut) · Q boşalt', en: '1 light · 2 strong (hold) · Q empty' },
  deliverHint: { tr: 'E: Teslim et', en: 'E: Deliver' },
  noMatch: { tr: 'Tepside uygun çay yok', en: 'No matching tea on the tray' },
  trayFull: { tr: 'Tepsi dolu', en: 'Tray is full' },
  acik: { tr: 'açık', en: 'light' },
  demli: { tr: 'demli', en: 'strong' },
  perfectPour: { tr: 'Tavşan kanı!', en: 'Rabbit-blood red!' },
  okPour: { tr: 'Olmadı ama olsun', en: 'Not quite' },
  spill: { tr: 'Döktün!', en: 'Spilled!' },
  broke: { tr: 'Şangırrr!', en: 'CRASH!' },
  spin: { tr: 'Fırıldak!', en: 'Spin!' },
  showTip: { tr: 'Gösteri bahşişi!', en: 'Show tip!' },
  fastTip: { tr: 'Işık hızı!', en: 'Lightning fast!' },
  newOrder: { tr: 'Yeni sipariş', en: 'New order' },
  expired: { tr: 'beklemekten vazgeçti', en: 'gave up waiting' },
  gossipCard: { tr: 'Dedikodu kartı!', en: 'Gossip card!' },
  slip: { tr: 'Kaydın!', en: 'Slipped!' },
  trip: { tr: 'Paşa!', en: 'Paşa!' },
  shoutHint: { tr: 'F: Çaaay!', en: 'F: Teaaa!' },
  timeLeft: { tr: 'Kalan', en: 'Left' },
  day: { tr: 'Gün', en: 'Day' },
  best: { tr: 'En iyi', en: 'Best' },
  locked: { tr: 'Kilitli', en: 'Locked' },
  dailyInfo: {
    tr: 'Bugünün siparişleri herkes için aynı. En yüksek bahşişi topla.',
    en: "Today's orders are the same for everyone. Earn the highest tips.",
  },
  controlsTitle: { tr: 'Kontroller', en: 'Controls' },
  controls: {
    tr: [
      ['W A S D', 'Yürü'],
      ['Fare', 'Etrafına bak'],
      ['Shift', 'Koş (tepsi daha çok sallanır)'],
      ['Sol tık basılı + fare', 'Kol modu: fareyle hızlı daireler çiz → Fırıldak'],
      ['Boşluk', 'Tepsiyi kaldır (kalabalıktan geç)'],
      ['1 / 2 basılı tut', 'Ocakta açık / demli doldur, renk hedefteyken bırak'],
      ['Q', 'Ocakta tepsiyi boşalt'],
      ['E', 'Masaya teslim et'],
      ['F', '"Çaaay!" diye bağır'],
      ['Esc', 'Duraklat'],
    ],
    en: [
      ['W A S D', 'Walk'],
      ['Mouse', 'Look around'],
      ['Shift', 'Run (the tray swings more)'],
      ['Hold left click + mouse', 'Arm mode: draw fast circles with the mouse → Spin'],
      ['Space', 'Raise the tray (pass through crowds)'],
      ['Hold 1 / 2', 'Pour light / strong at the stove, release on target color'],
      ['Q', 'Empty the tray at the stove'],
      ['E', 'Deliver to a desk'],
      ['F', 'Shout "Teaaa!"'],
      ['Esc', 'Pause'],
    ],
  },
  rules: {
    tr: 'Tepsi elinin ucunda sarkaç gibi sallanır. Yumuşak hareket et: düzgün sallanan tepsi çayı dökmez, ani duruş ve çarpışma döker. Fırıldak\'ta yeterince hızlı değilsen tepede bardaklar uçar. Sıcak, dolu ve doğru renkte çay daha çok bahşiş getirir. Kusursuz teslimler dedikodu kartı düşürür.',
    en: 'The tray swings like a pendulum from your hand. Move smoothly: a tray swinging cleanly never spills, but sudden stops and bumps do. Spin too slowly and the glasses fly off at the top. Hot, full, correctly brewed tea earns bigger tips. Perfect deliveries reveal gossip cards.',
  },
  upgrades: {
    shoes: { tr: 'Kaymaz Ayakkabı', en: 'Non-slip Shoes' },
    shoesD: { tr: 'Kaygan zeminde %60 daha az kayarsın', en: '60% less sliding on wet floors' },
    wrist: { tr: 'Usta Bileği', en: "Master's Wrist" },
    wristD: { tr: 'Tepsi sallantısı daha çabuk söner', en: 'The tray settles faster' },
    tray1: { tr: 'Büyük Tepsi I', en: 'Bigger Tray I' },
    tray1D: { tr: 'Tepsiye 4 bardak sığar', en: 'Carry 4 glasses' },
    tray2: { tr: 'Büyük Tepsi II', en: 'Bigger Tray II' },
    tray2D: { tr: 'Tepsiye 5 bardak sığar', en: 'Carry 5 glasses' },
    thermos: { tr: 'Termos Demlik', en: 'Thermos Teapot' },
    thermosD: { tr: 'Çay %40 daha yavaş soğur', en: 'Tea cools 40% slower' },
  },
};

type Dict = typeof UI;

let lang: Lang = 'tr';
export function setLang(l: Lang) {
  lang = l;
}
export function getLang(): Lang {
  return lang;
}

type TextKeys = { [K in keyof Dict]: Dict[K] extends Text ? K : never }[keyof Dict];

/** Arayüz metni */
export function t(key: TextKeys): string {
  return (UI[key] as Text)[lang];
}

export function controlsList(): string[][] {
  return UI.controls[lang];
}

export function up(key: keyof Dict['upgrades']): string {
  return UI.upgrades[key][lang];
}

/** Hikâye metni */
export function tx(text: Text): string {
  return text[lang];
}

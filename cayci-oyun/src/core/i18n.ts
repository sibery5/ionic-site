import type { Lang, Text } from '../game/story';

// Arayüz metinleri. Hikâye metinleri story.ts ve venues.ts içinde.

const UI = {
  subtitle: { tr: "Don't Spill the Tea", en: "Don't Spill the Tea" },
  tagline: { tr: 'Askılı tepsiyle, tek damla dökmeden.', en: 'One hanging tray. Not a single drop.' },
  career: { tr: 'Kariyer', en: 'Career' },
  careerSub: { tr: 'Hanın altı katı, tek hikâye', en: 'Six floors of the han, one story' },
  daily: { tr: 'Günlük Mücadele', en: 'Daily Challenge' },
  dailyInfo: {
    tr: 'Bugünün katı ve siparişleri herkes için aynı. Yükseltmeler kapalı: sadece beceri.',
    en: "Today's floor and orders are the same for everyone. Upgrades are off: pure skill.",
  },
  missions: { tr: 'Görevler', en: 'Missions' },
  dailyMissions: { tr: 'Günün Görevleri', en: "Today's Missions" },
  achievements: { tr: 'Başarımlar', en: 'Achievements' },
  leaderboard: { tr: 'Sıralama', en: 'Leaderboard' },
  leaderboardNote: {
    tr: 'Bu cihazdaki en iyi skorların, hanın sakinleriyle yarışıyor. Rıza Usta\'yı geçebilir misin?',
    en: "Your best scores on this device, racing the han's residents. Can you beat Master Rıza?",
  },
  wardrobe: { tr: 'Dolap', en: 'Wardrobe' },
  shop: { tr: 'Han Çarşısı', en: 'Han Market' },
  howTo: { tr: 'Nasıl Oynanır', en: 'How to Play' },
  settings: { tr: 'Ayarlar', en: 'Settings' },
  credits: { tr: 'Emeği Geçenler', en: 'Credits' },
  back: { tr: 'Geri', en: 'Back' },
  volume: { tr: 'Ses', en: 'Volume' },
  music: { tr: 'Müzik', en: 'Music' },
  sensitivity: { tr: 'Fare hassasiyeti', en: 'Mouse sensitivity' },
  quality: { tr: 'Görüntü kalitesi', en: 'Graphics quality' },
  qLow: { tr: 'Düşük', en: 'Low' },
  qMedium: { tr: 'Orta', en: 'Medium' },
  qHigh: { tr: 'Yüksek', en: 'High' },
  fullscreen: { tr: 'Tam ekran', en: 'Fullscreen' },
  playerName: { tr: 'Adın (sıralamada görünür)', en: 'Your name (shown on leaderboards)' },
  resetProgress: { tr: 'İlerlemeyi sıfırla', en: 'Reset progress' },
  resetConfirm: { tr: 'Emin misin? Tekrar bas.', en: 'Are you sure? Press again.' },
  start: { tr: 'Vardiyaya Başla', en: 'Start Shift' },
  clickToPlay: { tr: 'Oynamak için tıkla', en: 'Click to play' },
  paused: { tr: 'Duraklatıldı', en: 'Paused' },
  resume: { tr: 'Devam', en: 'Resume' },
  restart: { tr: 'Yeniden Başlat', en: 'Restart' },
  quit: { tr: 'Ana Menü', en: 'Main Menu' },
  map: { tr: 'Han Haritası', en: 'Han Map' },
  shiftOver: { tr: 'Vardiya Bitti', en: 'Shift Over' },
  delivered: { tr: 'Teslim edilen bardak', en: 'Glasses delivered' },
  broken: { tr: 'Kırılan bardak', en: 'Glasses broken' },
  spins: { tr: 'Fırıldak', en: 'Spins' },
  nextVenue: { tr: 'Sonraki Kat', en: 'Next Floor' },
  playAgain: { tr: 'Bir daha! (R)', en: 'Again! (R)' },
  locked: { tr: 'Kilitli', en: 'Locked' },
  unlockHint: { tr: 'Önceki katta 1 yıldız al', en: 'Earn 1 star on the previous floor' },
  objectives: { tr: 'Görevler', en: 'Objectives' },
  starGoals: { tr: 'Yıldız hedefleri', en: 'Star goals' },
  rivalToBeat: { tr: 'Geçilecek rakip', en: 'Rival to beat' },
  rivalBeaten: { tr: 'geçildi!', en: 'beaten!' },
  allRivalsBeaten: { tr: 'Bütün rakipleri geçtin!', en: 'You beat every rival!' },
  rank: { tr: 'Sıra', en: 'Rank' },
  wallet: { tr: 'Cüzdan', en: 'Wallet' },
  buy: { tr: 'Al', en: 'Buy' },
  owned: { tr: 'Alındı', en: 'Owned' },
  equip: { tr: 'Giy', en: 'Equip' },
  equipped: { tr: 'Giyili', en: 'Equipped' },
  level: { tr: 'Seviye', en: 'Level' },
  levelUp: { tr: 'Seviye atladın!', en: 'Level up!' },
  unlockedReward: { tr: 'Açılan', en: 'Unlocked' },
  xp: { tr: 'XP', en: 'XP' },
  coins: { tr: 'Cüzdana', en: 'To wallet' },
  missionDone: { tr: 'Görev tamam!', en: 'Mission complete!' },
  achievementUnlocked: { tr: 'Başarım açıldı', en: 'Achievement unlocked' },
  allMissionsDone: { tr: 'Bugünün bütün görevleri bitti. Yarın yenileri gelecek.', en: "All of today's missions are done. New ones arrive tomorrow." },
  reward: { tr: 'Ödül', en: 'Reward' },
  gossipBook: { tr: 'Dedikodu Defteri', en: 'Gossip Book' },
  gossipFound: { tr: 'Duyulan dedikodu', en: 'Gossip heard' },
  choiceTitle: { tr: 'Han Toplantısı', en: 'The Han Meeting' },
  choiceText: {
    tr: 'Terasta herkes toplandı. Selim raporu Nadir Bey\'in önüne koydu, kalemi uzattı. Bütün gözler bir an sana döndü, çay tepsisini tutan çırağa. Ne yapacaksın?',
    en: 'Everyone has gathered on the roof. Selim lays the report before Nadir Bey and hands him a pen. For a moment every eye turns to you, the boy with the tea tray. What will you do?',
  },
  spillIt: { tr: 'Çayı dök (her şeyi anlat)', en: 'Spill the tea (tell everything)' },
  stayQuiet: { tr: 'Sus', en: 'Stay quiet' },
  theEnd: { tr: 'Son', en: 'The End' },
  meetingCard: { tr: 'Han Toplantısı', en: 'The Han Meeting' },
  meetingCardSub: { tr: 'Kararını ver', en: 'Make your choice' },
  creditsText: {
    tr: 'ÇAYCI · Don\'t Spill the Tea<br>Tasarım, kod, modeller, sesler ve müzik: tamamı koddan üretildi.<br>Three.js (MIT) ile yapıldı.<br>Bütün karakterler ve olaylar kurgudur.',
    en: "ÇAYCI · Don't Spill the Tea<br>Design, code, models, sounds and music: all generated in code.<br>Built with Three.js (MIT).<br>All characters and events are fictional.",
  },
  // oyun içi
  bank: { tr: 'Kasa', en: 'Bank' },
  jar: { tr: 'Kavanoz', en: 'Jar' },
  tower: { tr: 'Kule', en: 'Tower' },
  banked: { tr: 'kasaya!', en: 'banked!' },
  jarLost: { tr: 'Kavanoz gitti!', en: 'The jar is gone!' },
  newJar: { tr: 'Yeni kavanoz', en: 'New jar' },
  spinPress: { tr: 'Yeşilde F!', en: 'F on green!' },
  spinReady: { tr: 'Sonraki teslim ×2', en: 'Next delivery ×2' },
  bestScore: { tr: 'Rekor', en: 'Best' },
  newBest: { tr: 'YENİ REKOR!', en: 'NEW RECORD!' },
  maxCombo: { tr: 'En yüksek çarpan', en: 'Best multiplier' },
  maxTower: { tr: 'En yüksek kule', en: 'Tallest tower' },
  jarsLost: { tr: 'Kaybedilen kavanoz', en: 'Jars lost' },
  greedOrder: { tr: 'çay', en: 'tea' },
  pourHint: { tr: 'E basılı tut: bardak ekle', en: 'Hold E: add glasses' },
  pourHintColored: { tr: 'E basılı: demli · Q basılı: açık', en: 'Hold E: strong · Hold Q: light' },
  lockSaved: { tr: 'Kavanoz Kilidi! Yarısı kurtuldu', en: 'Jar Lock! Half saved' },
  deliverHint: { tr: 'E: Teslim et', en: 'E: Deliver' },
  noMatch: { tr: 'Tepside uygun çay yok', en: 'No matching tea on the tray' },
  trayFull: { tr: 'Tepsi dolu', en: 'Tray is full' },
  acik: { tr: 'açık', en: 'light' },
  demli: { tr: 'demli', en: 'strong' },
  okPour: { tr: 'Biraz dökülmüş', en: 'A bit spilled' },
  spill: { tr: 'Döktün!', en: 'Spilled!' },
  broke: { tr: 'Şangırrr!', en: 'CRASH!' },
  spin: { tr: 'Fırıldak!', en: 'Spin!' },
  expired: { tr: 'beklemekten vazgeçti', en: 'gave up waiting' },
  gossipCard: { tr: 'Dedikodu kartı!', en: 'Gossip card!' },
  slip: { tr: 'Kaydın!', en: 'Slipped!' },
  trip: { tr: 'Paşa!', en: 'Paşa!' },
  controlsTitle: { tr: 'Kontroller', en: 'Controls' },
  gamepadTitle: { tr: 'Oyun kolu', en: 'Gamepad' },
  rules: {
    tr: 'Tepsi elinin ucunda sarkaç gibi sallanır; düzgün sallanırken çay dökülmez, ani duruş ve çarpışma döker. Ocakta istediğin kadar bardak doldur: çok bardak çok bahşiş demek ama tepsi ağırlaştıkça huysuzlaşır, kulenin üst katı devrilebilir. Bahşişler tepsideki kavanoza girer ve ancak ocağa dönünce kasaya geçer. Tepsi uçarsa kavanoz da gider. Altın balonlu VIP siparişleri ×3, kırmızı acele siparişleri ×2 öder; kusursuz teslimler çarpanı büyütür. Son 20 saniye çay saatidir: siparişler yağar, bahşişler ×1,5.',
    en: "The tray swings from your hand like a pendulum; a clean swing never spills, sudden stops and bumps do. Fill as many glasses as you dare at the stove: more glasses means bigger tips, but a heavy tray gets wild and the upper tower can topple. Tips go into the jar on your tray and are only banked when you return to the stove. Crash and the jar goes with it. Gold-bubble VIP orders pay ×3, red rush orders ×2, and perfect deliveries grow your multiplier. The last 20 seconds are tea time: orders pour in and tips pay ×1.5.",
  },
  controls: {
    tr: [
      ['W A S D', 'Yürü'],
      ['Fare', 'Etrafına bak'],
      ['Shift', 'Koş (tepsi daha çok sallanır)'],
      ['Ctrl / C', 'Parmak ucunda yürü (yavaş ama güvenli)'],
      ['E (ocakta basılı tut)', 'Demli çay doldur'],
      ['Q (ocakta basılı tut)', 'Açık çay doldur (1. kattan itibaren)'],
      ['E (masada)', 'Teslim et'],
      ['F, sonra yeşilde F', 'Fırıldak: sonraki teslim ×2'],
      ['Boşluk', 'Tepsiyi kaldır (kalabalıktan geç)'],
      ['Sol tık basılı + fare', 'Ustalar için: eli elle döndür'],
      ['Esc', 'Duraklat'],
    ],
    en: [
      ['W A S D', 'Walk'],
      ['Mouse', 'Look around'],
      ['Shift', 'Run (the tray swings more)'],
      ['Ctrl / C', 'Tiptoe (slow but safe)'],
      ['E (hold at stove)', 'Pour strong tea'],
      ['Q (hold at stove)', 'Pour light tea (from the 1st floor on)'],
      ['E (at a desk)', 'Deliver'],
      ['F, then F on green', 'Spin: next delivery ×2'],
      ['Space', 'Raise the tray (pass through crowds)'],
      ['Hold left click + mouse', 'For masters: swing the hand yourself'],
      ['Esc', 'Pause'],
    ],
  },
  gamepad: {
    tr: [
      ['Sol çubuk', 'Yürü'],
      ['Sağ çubuk', 'Bak'],
      ['A', 'Demli doldur / teslim et'],
      ['X', 'Açık doldur'],
      ['B', 'Fırıldak'],
      ['LB', 'Parmak ucu · RB koş'],
      ['Y', 'Tepsiyi kaldır'],
      ['Start', 'Duraklat'],
    ],
    en: [
      ['Left stick', 'Walk'],
      ['Right stick', 'Look'],
      ['A', 'Pour strong / deliver'],
      ['X', 'Pour light'],
      ['B', 'Spin'],
      ['LB', 'Tiptoe · RB run'],
      ['Y', 'Raise the tray'],
      ['Start', 'Pause'],
    ],
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

export function gamepadList(): string[][] {
  return UI.gamepad[lang];
}

/** Hikâye / veri metni */
export function tx(text: Text): string {
  return text[lang];
}

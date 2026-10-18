// Oyunun bütün ayar sayıları tek yerde. Dengeleme yaparken sadece bu dosyayı değiştir.

export const CELL = 1.2; // ızgara hücresi (metre)
export const WALL_HEIGHT = 3.0;

export const PLAYER = {
  radius: 0.3,
  walkSpeed: 2.4,
  runSpeed: 4.1,
  accel: 6, // normal zeminde ivme (m/s²)
  tiptoeSpeed: 1.5, // Ctrl / C: parmak ucunda
  tiptoeAccel: 1.8, // yavaş ivme: kuleyi taşımanın yolu
  slipperyAccel: 1.8, // kaygan zeminde ivme
  turnSensitivity: 0.0026, // fare → radyan
  stepLength: 0.62, // bir adımın boyu (ayak sesi)
};

export const HAND = {
  rest: { side: 0.34, up: 1.05, forward: 0.38 }, // karaktere göre elin dinlenme noktası
  raisedUp: 1.72, // Boşluk ile kaldırınca
  armRange: 0.5, // kol modunda elin gidebileceği en uzak mesafe
  armSensitivity: 0.0022, // fare → metre (kol modu)
  follow: 30, // elin hedefe yaklaşma hızı
};

export const TRAY = {
  rodLength: 0.42, // askı boyu
  radius: 0.2,
  damping: 1.1, // eksen sürtünmesi, ele göre bağıl sallanmayı söndürür (1/s)
  dampingArmMode: 0.25, // kol modunda serbest sallanma
  grip: 0.3, // bilek sürtünmesi (yürürken); kol modunda 0'a iner
  gripArmMode: 0.02,
  sloshStiffness: 70, // çay yüzeyinin yerçekimini takip etmesi
  sloshDampingRatio: 0.22, // az sönümlü = dalga yapar
  jarDampingRatio: 0.75, // bahşiş kavanozu: ağır, dalgalanmaz
  spillAngleFull: 14, // derece, bardak tam doluyken izin verilen açı
  spillAngleHalf: 35, // derece, yarı doluyken
  spillRate: 0.022, // açı farkı (derece) başına saniyede kaybedilen doluluk
  liftThreshold: 1.0, // n·g_his bunun üstündeyse bardak havalanıyor (m/s²); tabak sürtünmesi biraz tolerans verir
  liftTime: 0.12, // bu kadar sürerse bardaklar uçar
  collideRestitution: 0.25, // çarpışmada sekme
  baseCapacity: 3,
};

export const TEA = {
  pourTemp: 85,
  coolRate: 0.35, // °C / s
  coolRateThermos: 0.21,
  minGoodTemp: 40,
  maxGoodTemp: 75,
  pourTime: 1.6, // barın dolma süresi
  fillLevel: 0.92,
  acikWindow: [0.3, 0.48] as const,
  demliWindow: [0.62, 0.8] as const,
};

export const ORDERS = {
  baseTip: 5,
  maxActive: 3,
  maxActiveLate: 4,
  intervalMin: 9,
  intervalMax: 14,
  patience: 60,
  speedBonusTime: 25,
  speedBonus: 0.5,
  styleWindow: 6,
  styleRange: 4,
  styleMultiplier: 1.5,
  brokenGlassPenalty: 10,
  expiredPenalty: 0.2,
  deliverRange: 1.9,
  ocakRange: 1.7,
  shoutCooldown: 8,
};

export const SHIFT = {
  duration: 200,
  targets: [60, 80, 100, 120, 150],
  star2: 1.4,
  star3: 1.8,
};

export const PUDDLE = { life: 30, radius: 0.45 };

export const NPC = { speed: 1.15, radius: 0.28, trayHitHeight: 1.3 };

export const CAT = { speed: 1.6, tripRadius: 0.45, tripCooldown: 4, safeSpeed: 1.6 }; // parmak ucunda (1,5 m/s) takılmazsın

export const WIND = { gustMin: 3, gustMax: 7, strength: 5.5 };

import type { PersonId, Verdict } from '../game/rumors';

// Bir turun sonunda toplanan sayılar. Görevler, başarımlar ve hedefler bunlardan hesaplanır.

export interface SaleRecord {
  rumor: string;
  buyer: PersonId;
  verdict: Verdict;
  pay: number;
}

export interface RunStats {
  venue: string;
  mode: 'career' | 'free' | 'daily';
  score: number; // kasaya geçen para
  delivered: number; // teslim edilen bardak
  maxDeliveryTower: number; // teslim anında tepsideki en yüksek bardak sayısı
  maxTower: number; // tepsiye bir anda konan en çok bardak
  spins: number; // başarılı Fırıldak
  failedSpins: number;
  jarsLost: number;
  broken: number;
  maxCombo: number;
  ordersCompleted: number;
  ordersExpired: number;
  vipServed: number;
  vipPerfect: number;
  rushServed: number;
  coloredServed: number; // açık/demli doğru teslim edilen bardak
  catTrips: number;
  slips: number;
  banks: number; // ocağa kaç kez para teslim edildi
  maxBank: number; // tek seferde kasaya geçen en yüksek tutar
  spilled: number; // dökülen toplam doluluk (bardak cinsinden)
  heard: string[]; // bu turda duyulan dedikodular (rumor id)
  sales: SaleRecord[]; // anlatılan dedikodular ve sonuçları
  evidence: string[]; // han tarafına ulaştırılan hikâye kanıtları
  repDelta: number; // itibar değişimi
  chases: number; // kızıp kovalayan müşteri
  escapes: number; // kovalamadan ocağa kaçış
  caught: number; // yakalanıp tepsiye şaplak yeme
  smashed: number; // kızgın müşterinin kırdığı bardak
  bonks: number; // tepsiyle vurulan kişi
  fines: number; // patronun kestiği ceza (₺)
}

export function emptyStats(venue: string, mode: RunStats['mode']): RunStats {
  return {
    venue,
    mode,
    score: 0,
    delivered: 0,
    maxDeliveryTower: 0,
    maxTower: 0,
    spins: 0,
    failedSpins: 0,
    jarsLost: 0,
    broken: 0,
    maxCombo: 1,
    ordersCompleted: 0,
    ordersExpired: 0,
    vipServed: 0,
    vipPerfect: 0,
    rushServed: 0,
    coloredServed: 0,
    catTrips: 0,
    slips: 0,
    banks: 0,
    maxBank: 0,
    spilled: 0,
    heard: [],
    sales: [],
    evidence: [],
    repDelta: 0,
    chases: 0,
    escapes: 0,
    caught: 0,
    smashed: 0,
    bonks: 0,
    fines: 0,
  };
}

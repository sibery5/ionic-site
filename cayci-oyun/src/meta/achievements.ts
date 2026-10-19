import type { Text } from '../game/story';
import type { RunStats } from './stats';

// Başarımlar. id'ler Steamworks'teki başarım API adlarıyla birebir aynı olmalı (steam/achievements.json).

export interface Totals {
  delivered: number;
  spins: number;
  broken: number;
  catTrips: number;
  runs: number;
  jarsLost: number;
  vipPerfect: number;
  sales: number; // doğru kişiye satılan dedikodu
  lies: number;
  escapes: number;
  caught: number;
  bonks: number;
  betrayals: number;
  inspectPassed: number;
  bossBonks: number;
  backfires: number;
}

export interface AchievementCtx {
  run: RunStats | null;
  totals: Totals;
  level: number;
  venueStars: Record<string, number>; // venue id → en iyi yıldız
  venueCount: number;
  gossipCount: number; // cepteki dedikodu
  gossipTotal: number;
  title: number; // unvan sırası
  endings: string[];
  dailyDays: number; // görevlerin hepsinin bittiği gün sayısı
}

export interface Achievement {
  id: string;
  name: Text;
  desc: Text;
  check: (c: AchievementCtx) => boolean;
}

const allStars = (c: AchievementCtx, n: number) => Object.keys(c.venueStars).length >= c.venueCount && Object.values(c.venueStars).every((s) => s >= n);

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'FIRST_TEA', name: { tr: 'İlk Çay', en: 'First Tea' }, desc: { tr: 'İlk bardağı teslim et', en: 'Deliver your first glass' }, check: (c) => c.totals.delivered >= 1 },
  { id: 'TOWER_8', name: { tr: 'Kule', en: 'Tower' }, desc: { tr: '8 bardakla teslim yap', en: 'Deliver while carrying 8 glasses' }, check: (c) => (c.run?.maxDeliveryTower ?? 0) >= 8 },
  { id: 'TOWER_12', name: { tr: 'Gökdelen', en: 'Skyscraper' }, desc: { tr: '12 bardakla teslim yap', en: 'Deliver while carrying 12 glasses' }, check: (c) => (c.run?.maxDeliveryTower ?? 0) >= 12 },
  { id: 'SPIN_1', name: { tr: 'Fırıldak', en: 'The Spin' }, desc: { tr: 'İlk Fırıldak', en: 'Land your first Spin' }, check: (c) => c.totals.spins >= 1 },
  { id: 'SPIN_25', name: { tr: 'Döner Usta', en: 'Spinning Master' }, desc: { tr: 'Toplam 25 Fırıldak', en: 'Land 25 Spins' }, check: (c) => c.totals.spins >= 25 },
  { id: 'COMBO_3', name: { tr: 'Beş Yıldızlı Hizmet', en: 'Five-Star Service' }, desc: { tr: '×3 çarpana ulaş', en: 'Reach a ×3 multiplier' }, check: (c) => (c.run?.maxCombo ?? 0) >= 3 },
  { id: 'BANK_100', name: { tr: 'Kumbara', en: 'Piggy Bank' }, desc: { tr: 'Tek seferde 100₺ kasaya geçir', en: 'Bank 100₺ in one trip' }, check: (c) => (c.run?.maxBank ?? 0) >= 100 },
  { id: 'RUN_250', name: { tr: 'Bahşiş Kralı', en: 'Tip King' }, desc: { tr: 'Bir vardiyada 250₺', en: 'Earn 250₺ in one shift' }, check: (c) => (c.run?.score ?? 0) >= 250 },
  { id: 'CLEAN_RUN', name: { tr: 'Tek Damla Bile', en: 'Not a Drop' }, desc: { tr: 'Kavanoz kaybetmeden ve bardak kırmadan 15+ bardak teslim et', en: 'Deliver 15+ glasses without losing the jar or breaking a glass' }, check: (c) => !!c.run && c.run.jarsLost === 0 && c.run.broken === 0 && c.run.delivered >= 15 },
  { id: 'VIP_5', name: { tr: 'Protokol', en: 'Protocol' }, desc: { tr: 'Toplam 5 VIP siparişini kusursuz ver', en: 'Serve 5 VIP orders perfectly' }, check: (c) => c.totals.vipPerfect >= 5 },
  { id: 'ALL_1STAR', name: { tr: 'Han Turu', en: 'Grand Tour' }, desc: { tr: 'Bütün katlarda en az 1 yıldız', en: 'Earn a star on every floor' }, check: (c) => allStars(c, 1) },
  { id: 'ALL_3STAR', name: { tr: 'Mükemmeliyetçi', en: 'Perfectionist' }, desc: { tr: 'Bütün katlarda 3 yıldız', en: 'Earn three stars on every floor' }, check: (c) => allStars(c, 3) },
  { id: 'GOSSIP_ALL', name: { tr: 'Her Şeyi Duyan', en: 'Heard It All' }, desc: { tr: 'Bütün dedikoduları topla', en: 'Collect every piece of gossip' }, check: (c) => c.gossipCount >= c.gossipTotal },
  { id: 'END_SAVED', name: { tr: 'Patron Oldun', en: 'You Are the Boss' }, desc: { tr: 'Hanı kurtar, çay ocağının patronu ol', en: 'Save the han and become boss of the tea house' }, check: (c) => c.endings.includes('saved') },
  { id: 'END_SILENT', name: { tr: 'Susmak Altın', en: 'Silence Is Golden' }, desc: { tr: 'Sus ve vapurda ocak aç', en: 'Stay quiet and open a ferry stand' }, check: (c) => c.endings.includes('silent') },
  { id: 'END_DISBELIEVED', name: { tr: 'Dedikoducu Çırak', en: 'Gossip Boy' }, desc: { tr: 'Kimse sana inanmasın', en: 'Nobody believes you' }, check: (c) => c.endings.includes('disbelieved') },
  { id: 'CAT_10', name: { tr: 'Paşa\'nın Kurbanı', en: "Paşa's Victim" }, desc: { tr: 'Paşa\'ya 10 kez takıl', en: 'Trip over Paşa 10 times' }, check: (c) => c.totals.catTrips >= 10 },
  { id: 'BROKEN_100', name: { tr: 'Bardak Katili', en: 'Glass Breaker' }, desc: { tr: 'Toplam 100 bardak kır', en: 'Break 100 glasses' }, check: (c) => c.totals.broken >= 100 },
  { id: 'DAILY_7', name: { tr: 'Müdavim', en: 'Regular' }, desc: { tr: '7 farklı günde bütün günlük görevleri bitir', en: 'Finish all daily missions on 7 different days' }, check: (c) => c.dailyDays >= 7 },
  { id: 'LEVEL_10', name: { tr: 'Tepsi Ustası', en: 'Tray Master' }, desc: { tr: '10. seviyeye ulaş', en: 'Reach level 10' }, check: (c) => c.level >= 10 },
  { id: 'LEVEL_30', name: { tr: 'Efsane', en: 'Legend' }, desc: { tr: '30. seviyeye ulaş', en: 'Reach level 30' }, check: (c) => c.level >= 30 },
  { id: 'SALE_1', name: { tr: 'İlk Haber', en: 'First Scoop' }, desc: { tr: 'Doğru dedikoduyu doğru kişiye sat', en: 'Sell the right gossip to the right person' }, check: (c) => c.totals.sales >= 1 },
  { id: 'SALE_10', name: { tr: 'Haber Ajansı', en: 'News Agency' }, desc: { tr: 'Toplam 10 dedikodu sat', en: 'Sell 10 pieces of gossip' }, check: (c) => c.totals.sales >= 10 },
  { id: 'LIAR_5', name: { tr: 'Yalancı Çoban', en: 'The Boy Who Cried Wolf' }, desc: { tr: '5 kez yalan dedikodu anlat', en: 'Tell 5 false rumors' }, check: (c) => c.totals.lies >= 5 },
  { id: 'ESCAPE_1', name: { tr: 'Kaçak Çaycı', en: 'Fugitive Tea Boy' }, desc: { tr: 'Seni kovalayan müşteriden ocağa kaç', en: 'Escape an angry customer back to the stove' }, check: (c) => c.totals.escapes >= 1 },
  { id: 'CAUGHT_3', name: { tr: 'Şaplak', en: 'Smack' }, desc: { tr: '3 kez yakalanıp tepsine şaplak ye', en: 'Get caught and smacked 3 times' }, check: (c) => c.totals.caught >= 3 },
  { id: 'BONK_1', name: { tr: 'Sabrın Sonu', en: 'Last Straw' }, desc: { tr: 'Yolunu kesen birine tepsiyle vur', en: 'Bonk someone blocking your way with the tray' }, check: (c) => c.totals.bonks >= 1 },
  { id: 'BETRAY_1', name: { tr: 'Satılık Çaycı', en: 'Tea Boy for Sale' }, desc: { tr: 'Bir kanıtı kötü adamlara sat', en: 'Sell a piece of evidence to the villains' }, check: (c) => c.totals.betrayals >= 1 },
  { id: 'TITLE_BAS', name: { tr: 'Baş Çaycı', en: 'Head Tea Boy' }, desc: { tr: 'Baş Çaycı unvanını al', en: 'Earn the Head Tea Boy title' }, check: (c) => c.title >= 3 },
  { id: 'INSPECT_PASS', name: { tr: 'Göz Önünde', en: 'Under Watch' }, desc: { tr: 'Nadir Bey\'in teftişinden alnının akıyla çık', en: "Pass one of Nadir Bey's inspections with flying colours" }, check: (c) => c.totals.inspectPassed >= 1 },
  { id: 'BACKFIRE_1', name: { tr: 'Kulakları Çınladı', en: 'Ears Burning' }, desc: { tr: 'Hakkında konuştuğun kişi duyup peşine düşsün', en: 'Get chased by the person you were gossiping about' }, check: (c) => c.totals.backfires >= 1 },
  { id: 'BOSS_BONK', name: { tr: 'Patrona Tepsi', en: 'Bonk the Boss' }, desc: { tr: 'Teftişteki patronuna tepsiyle vur', en: 'Bonk your boss with the tray during an inspection' }, check: (c) => c.totals.bossBonks >= 1 },
  { id: 'ENDLESS_300', name: { tr: 'Demir Tepsi', en: 'Iron Tray' }, desc: { tr: 'Sonsuz Vardiya\'da 5 dakika dayan', en: 'Last 5 minutes in the Endless Shift' }, check: (c) => c.run?.mode === 'endless' && c.run.survived >= 300 },
  { id: 'END_SOLD', name: { tr: 'AVM Müdürü', en: 'Mall Manager' }, desc: { tr: 'Selim\'in teklifini kabul et', en: "Accept Selim's offer" }, check: (c) => c.endings.includes('sold') },
];

/** Henüz açılmamış ve koşulu sağlanan başarımlar. */
export function newlyUnlocked(ctx: AchievementCtx, have: string[]): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !have.includes(a.id) && a.check(ctx));
}

import type { Text } from './story';
import type { IconName } from '../ui/icons';

// Dedikodu ekonomisi. Cemal çay taşırken laf da duyar: VIP müşteriler hikâyenin kanıtlarını anlatır,
// diğerleri kulağına fısıldar. Bazı müşteriler çay söylerken "dedikodu var mı?" diye sorar.
// Doğru dedikodu doğru kişiye → bahşiş ve itibar. Yalan, alakasız ya da kişinin kendisi hakkında olan laf → öfke:
// bardak kırılır ya da müşteri Cemal'i kovalar. Kötü adamlara satmak çok para getirir ama ihanettir.

export type PersonId =
  | 'riza'
  | 'hayri'
  | 'sevim'
  | 'ferhat'
  | 'fikret'
  | 'sukran'
  | 'rifat'
  | 'nevin'
  | 'lale'
  | 'kerem'
  | 'selim'
  | 'turgut'
  | 'defne'
  | 'nadir'
  | 'gokdelen'
  | 'gulsum'
  | 'saadet'
  | 'remzi'
  | 'cevdet';

export type Topic = 'tapu' | 'para' | 'rapor' | 'foto' | 'kulis' | 'kedi';

export const TOPICS: Record<Topic, { icon: IconName; name: Text; ask: Text }> = {
  tapu: { icon: 'deed', name: { tr: 'Tapu ve evrak', en: 'Deeds & papers' }, ask: { tr: 'Tapu, vekâlet, evrak... bir şey duydun mu?', en: 'Deeds, signatures, paperwork... heard anything?' } },
  para: { icon: 'money', name: { tr: 'Para işleri', en: 'Money' }, ask: { tr: 'Paralar nereye gidiyor, bilen var mı?', en: 'Where is the money going, does anyone know?' } },
  rapor: { icon: 'report', name: { tr: 'Bina raporu', en: 'Building report' }, ask: { tr: 'Binanın raporuyla ilgili bir laf var mı?', en: 'Any word about the building report?' } },
  foto: { icon: 'camera', name: { tr: 'Fotoğraf, görgü', en: 'Photos & sightings' }, ask: { tr: 'Gece hanın önünde kimler dolaşıyor, gören var mı?', en: 'Who has been prowling outside the han at night?' } },
  kulis: { icon: 'talk', name: { tr: 'Kulis', en: 'Office talk' }, ask: { tr: 'Anlat bakalım, kim kimle ne konuşuyor?', en: 'Come on, who is talking to whom?' } },
  kedi: { icon: 'cat', name: { tr: 'Paşa', en: 'Paşa the cat' }, ask: { tr: 'Paşa yine ne karıştırıyor?', en: 'What is Paşa up to now?' } },
};

export type Side = 'han' | 'villain' | 'neutral';

export interface Person {
  name: Text;
  side: Side;
  /** satın aldığı (merak ettiği) konular */
  wants: Topic[];
  /** kendi kaynağı olduğu fısıltılar (kusursuz teslimden sonra şansla anlatır) */
  whispers: string[];
}

export const PEOPLE: Record<PersonId, Person> = {
  riza: { name: { tr: 'Rıza Usta', en: 'Master Rıza' }, side: 'han', wants: [], whispers: [] },
  hayri: { name: { tr: 'Hayri Usta', en: 'Master Hayri' }, side: 'han', wants: ['kulis'], whispers: ['f_tabela'] },
  sevim: { name: { tr: 'Sevim Hanım', en: 'Mrs. Sevim' }, side: 'neutral', wants: ['kulis', 'kedi'], whispers: ['f_ask'] },
  ferhat: { name: { tr: 'Ferhat Bey', en: 'Mr. Ferhat' }, side: 'han', wants: ['tapu', 'kulis'], whispers: [] },
  fikret: { name: { tr: 'Fikret Bey', en: 'Mr. Fikret' }, side: 'han', wants: ['para'], whispers: [] },
  sukran: { name: { tr: 'Şükran Hanım', en: 'Mrs. Şükran' }, side: 'neutral', wants: ['kulis'], whispers: ['f_takim'] },
  rifat: { name: { tr: 'Av. Rıfat', en: 'Attorney Rıfat' }, side: 'han', wants: ['tapu', 'rapor', 'para', 'foto'], whispers: [] },
  nevin: { name: { tr: 'Nevin Hanım', en: 'Madame Nevin' }, side: 'neutral', wants: ['kulis', 'kedi'], whispers: ['f_piyango'] },
  lale: { name: { tr: 'Lale', en: 'Lale' }, side: 'han', wants: ['foto', 'rapor'], whispers: [] },
  kerem: { name: { tr: 'Kerem', en: 'Kerem' }, side: 'neutral', wants: ['para'], whispers: ['f_hazine', 'f_vergi'] },
  selim: { name: { tr: 'Selim', en: 'Selim' }, side: 'villain', wants: ['tapu', 'rapor', 'foto'], whispers: [] },
  turgut: { name: { tr: 'Turgut', en: 'Turgut' }, side: 'villain', wants: ['tapu', 'para'], whispers: [] },
  defne: { name: { tr: 'Defne Hanım', en: 'Ms. Defne' }, side: 'han', wants: ['rapor', 'kedi'], whispers: [] },
  nadir: { name: { tr: 'Nadir Bey', en: 'Nadir Bey' }, side: 'han', wants: ['tapu', 'rapor', 'foto'], whispers: [] },
  gokdelen: { name: { tr: 'Gökdelen Yapı', en: 'Skyscraper Corp.' }, side: 'villain', wants: ['rapor', 'foto', 'tapu'], whispers: [] },
  gulsum: { name: { tr: 'Gülsüm Abla', en: 'Gülsüm' }, side: 'han', wants: ['kulis', 'kedi'], whispers: ['f_balik'] },
  saadet: { name: { tr: 'Arşivci Saadet', en: 'Saadet the Archivist' }, side: 'han', wants: ['tapu', 'rapor'], whispers: [] },
  remzi: { name: { tr: 'Bekçi Remzi', en: 'Remzi the Watchman' }, side: 'neutral', wants: ['kulis', 'kedi'], whispers: ['f_hayalet'] },
  cevdet: { name: { tr: 'Kâtip Cevdet', en: 'Cevdet the Clerk' }, side: 'villain', wants: ['tapu', 'foto'], whispers: [] },
};

export interface Rumor {
  id: string;
  topic: Topic;
  source: PersonId;
  about: PersonId[];
  /** doğru mu? yalanı satan azar işitir */
  truth: boolean;
  /** hanın kaderine dair kanıt (han tarafına ulaşırsa toplantıda işe yarar) */
  story: boolean;
  value: number;
  text: Text;
}

export const RUMORS: Rumor[] = [
  // ---- hikâye: VIP siparişleri eksiksiz götürünce anlatılır ----
  {
    id: 'hayri_tapu',
    topic: 'tapu',
    source: 'hayri',
    about: ['selim'],
    truth: true,
    story: true,
    value: 30,
    text: { tr: '"Selim dün yine gelmiş, hanın tapusunu sormuş. Nadir Bey\'e söylemedim..."', en: '"Selim came by again yesterday asking about the deed. I didn\'t tell Nadir Bey..."' },
  },
  {
    id: 'sevim_evrak',
    topic: 'tapu',
    source: 'sevim',
    about: ['selim'],
    truth: true,
    story: true,
    value: 30,
    text: { tr: '"KriptoBey\'den biri yüz tane damgalı kâğıt aldı. Ne yapacaklar o kadar resmî kâğıdı?"', en: '"Someone from KriptoBey bought a hundred stamped forms. What do they need that much paperwork for?"' },
  },
  {
    id: 'ferhat_vekalet',
    topic: 'tapu',
    source: 'ferhat',
    about: ['selim'],
    truth: true,
    story: true,
    value: 40,
    text: { tr: '"Cuma günü han için bir satış vekâletnamesi randevusu var. Ama Nadir Bey\'in haberi yok gibi."', en: '"There\'s an appointment Friday for a power of attorney to sell the han. Nadir Bey doesn\'t seem to know."' },
  },
  {
    id: 'fikret_borc',
    topic: 'para',
    source: 'fikret',
    about: ['selim'],
    truth: true,
    story: true,
    value: 35,
    text: { tr: '"KriptoBey\'in hesapları eksi. Bu çocuk han satılmazsa batar."', en: '"KriptoBey\'s books are deep in the red. That kid goes bust unless the han gets sold."' },
  },
  {
    id: 'rifat_rapor',
    topic: 'rapor',
    source: 'rifat',
    about: ['gokdelen'],
    truth: true,
    story: true,
    value: 40,
    text: { tr: '"Bir bilirkişi raporu imzalatacaklarmış: \'bina çürük\' diye. Bina sağlam oysa."', en: '"They want to get an expert report signed saying the building is unsound. It\'s perfectly sound."' },
  },
  {
    id: 'nevin_fal',
    topic: 'rapor',
    source: 'nevin',
    about: [],
    truth: false,
    story: false,
    value: 15,
    text: { tr: '"Fincanda gördüm: kule gibi bir bina, altında bir kedi ağlıyor. Han yıkılacak çocuğum."', en: '"I saw it in the cup: a tower of a building and a crying cat beneath it. The han will fall, child."' },
  },
  {
    id: 'lale_foto',
    topic: 'foto',
    source: 'lale',
    about: ['selim', 'turgut'],
    truth: true,
    story: true,
    value: 45,
    text: { tr: '"Selim ile Emlakçı Turgut\'u gece hanın önünde ölçü alırken çektim. Fotoğraf bende."', en: '"I photographed Selim and Turgut the realtor taking measurements outside the han at night. I have the photo."' },
  },
  {
    id: 'selim_telefon',
    topic: 'tapu',
    source: 'selim',
    about: ['selim'],
    truth: true,
    story: true,
    value: 50,
    text: { tr: '"Telefonda: \'Amca imzalarsa Cuma AVM\'cilere devrederiz, çaycıyı da çıkarırız.\'"', en: '"On the phone: \'If uncle signs, we hand it to the mall people on Friday and kick out the tea boy too.\'"' },
  },
  {
    id: 'turgut_komisyon',
    topic: 'para',
    source: 'turgut',
    about: ['turgut'],
    truth: true,
    story: true,
    value: 45,
    text: { tr: '"AVM şirketi komisyonu peşin yatırdı. Cuma\'ya kadar Nadir amcanın imzası lazım."', en: '"The mall company paid the commission up front. We need old Nadir\'s signature by Friday."' },
  },
  {
    id: 'defne_statik',
    topic: 'rapor',
    source: 'defne',
    about: [],
    truth: true,
    story: true,
    value: 35,
    text: { tr: '"Binanın statik hesabını geçen yıl ben yaptım. Sapasağlam. \'Çürük\' diyen yalan söylüyor."', en: '"I did the building\'s structural survey last year. Rock solid. Whoever says \'unsound\' is lying."' },
  },
  {
    id: 'nadir_rapor',
    topic: 'rapor',
    source: 'nadir',
    about: ['nadir', 'selim'],
    truth: true,
    story: true,
    value: 40,
    text: { tr: '"Selim bana bir rapor getirdi, bina çürükmüş. İmzalayayım mı bilmiyorum evlat."', en: '"Selim brought me a report saying the building is rotten. I don\'t know whether to sign, kid."' },
  },
  {
    id: 'gokdelen_bilirkisi',
    topic: 'rapor',
    source: 'gokdelen',
    about: ['gokdelen'],
    truth: true,
    story: true,
    value: 50,
    text: { tr: '"Raporu hazırlayan bilirkişi bizim adamımız. Bina sapasağlam aslında."', en: '"The expert who wrote the report is our man. The building is actually perfectly sound."' },
  },
  {
    id: 'gulsum_destek',
    topic: 'kulis',
    source: 'gulsum',
    about: [],
    truth: true,
    story: false,
    value: 8,
    text: { tr: '"Hepimiz arkandayız Cemal. Bildiğini söylersen biz de konuşuruz."', en: '"We all have your back, Cemal. If you speak up, so will we."' },
  },
  // ---- fısıltılar: kusursuz teslimden sonra arada bir ----
  {
    id: 'f_tabela',
    topic: 'tapu',
    source: 'hayri',
    about: ['turgut'],
    truth: true,
    story: false,
    value: 20,
    text: { tr: '"Turgut\'un ofisinde kapının arkasında ikinci bir tabela var: \'Gökdelen Yapı\'."', en: '"Behind Turgut\'s door there\'s a second sign: \'Skyscraper Corp.\'"' },
  },
  {
    id: 'f_ask',
    topic: 'kulis',
    source: 'sevim',
    about: ['sukran', 'ferhat'],
    truth: true,
    story: false,
    value: 15,
    text: { tr: '"Şükran Hanım her gün Ferhat Bey\'e çay ısmarlıyor. Bir şeyler var bunlarda."', en: '"Mrs. Şükran buys Mr. Ferhat a tea every single day. Something is going on there."' },
  },
  {
    id: 'f_takim',
    topic: 'kulis',
    source: 'sukran',
    about: ['hayri'],
    truth: true,
    story: false,
    value: 12,
    text: { tr: '"Hayri Usta, Nadir Bey\'in takımının cebini ters dikmiş. Nadir Bey üç aydır fark etmedi."', en: '"Master Hayri sewed Nadir Bey\'s suit pocket on upside down. Nadir Bey hasn\'t noticed in three months."' },
  },
  {
    id: 'f_piyango',
    topic: 'para',
    source: 'nevin',
    about: ['gulsum'],
    truth: false,
    story: false,
    value: 15,
    text: { tr: '"Gülsüm Abla piyangodan büyük ikramiyeyi vurmuş, paspası da altın kaplatacakmış."', en: '"Gülsüm hit the lottery jackpot and is having her mop gold-plated."' },
  },
  {
    id: 'f_hazine',
    topic: 'para',
    source: 'kerem',
    about: [],
    truth: false,
    story: false,
    value: 15,
    text: { tr: '"Hanın bodrumunda Bizans hazinesi varmış abi. NFT\'sini yapacağım, zengin olacağız."', en: '"There\'s Byzantine treasure in the basement, bro. I\'m minting it as an NFT, we\'ll be rich."' },
  },
  {
    id: 'f_vergi',
    topic: 'para',
    source: 'kerem',
    about: ['fikret'],
    truth: false,
    story: false,
    value: 15,
    text: { tr: '"Fikret Bey vergi kaçırıyormuş, kesin duydum. Yani biri dedi ki duymuş."', en: '"Mr. Fikret dodges his taxes, I heard it for sure. Well, someone said they heard."' },
  },
  {
    id: 'f_balik',
    topic: 'kedi',
    source: 'gulsum',
    about: ['ferhat'],
    truth: true,
    story: false,
    value: 12,
    text: { tr: '"Paşa\'yı kim şişmanlatıyor biliyor musun? Ferhat Bey. Çekmecesinde hamsi saklıyor."', en: '"You know who\'s fattening up Paşa? Mr. Ferhat. He keeps anchovies in his drawer."' },
  },
  // bodrum: hanın asıl tapusu arşivde
  {
    id: 'saadet_vakif',
    topic: 'tapu',
    source: 'saadet',
    about: [],
    truth: true,
    story: true,
    value: 50,
    text: { tr: '"Hanın asıl tapusu bende, bodrumda. Bu han vakıf malı evlat; kimse tek imzayla satamaz."', en: '"The han\'s original deed is with me, in the basement. This han belongs to a foundation, kid; nobody can sell it with a single signature."' },
  },
  {
    id: 'remzi_gece',
    topic: 'foto',
    source: 'remzi',
    about: ['cevdet', 'turgut'],
    truth: true,
    story: true,
    value: 45,
    text: { tr: '"Gece nöbetteydim. Kâtip Cevdet arşivden bir dosya çıkarıp Turgut\'un arabasına koydu. Gözümle gördüm."', en: '"I was on night watch. Cevdet the clerk took a file from the archive and put it in Turgut\'s car. I saw it with my own eyes."' },
  },
  {
    id: 'cevdet_rusvet',
    topic: 'para',
    source: 'cevdet',
    about: ['cevdet', 'turgut'],
    truth: true,
    story: true,
    value: 45,
    text: { tr: '"(Telefonda) Turgut Bey, tapu dosyası kayıp sayılır. Paramı Cuma\'ya kadar yatırın, yoksa bulunur."', en: '"(On the phone) Turgut Bey, consider the deed file lost. Pay me by Friday, or it gets found."' },
  },
  {
    id: 'f_hayalet',
    topic: 'kulis',
    source: 'remzi',
    about: [],
    truth: false,
    story: false,
    value: 15,
    text: { tr: '"Bodrumda gece hayalet dolaşıyor. Kırk yıl önceki çaycının hayaleti, tepsisi hâlâ elinde!"', en: '"A ghost walks the basement at night. The tea boy from forty years ago, still holding his tray!"' },
  },
];

export const RUMOR = Object.fromEntries(RUMORS.map((r) => [r.id, r])) as Record<string, Rumor>;
/** Toplantıda gerçeği anlatabilmek için han tarafına ulaşmış kanıt sayısı. */
export const EVIDENCE_NEEDED = 6;
export const STORY_EVIDENCE = RUMORS.filter((r) => r.story && r.truth).map((r) => r.id);

export type Verdict = 'reward' | 'betray' | 'already' | 'own' | 'irrelevant' | 'lie' | 'aboutThem';

export interface Judgement {
  verdict: Verdict;
  /** jara eklenecek bahşiş */
  pay: number;
  /** itibar değişimi */
  rep: number;
  /** han tarafına kanıt ulaştı */
  evidence: boolean;
  /** kötü adamlar kanıtı yok etti */
  burned: boolean;
}

export const saleKey = (rumor: string, buyer: PersonId) => `${rumor}>${buyer}`;

/** Bir dedikoduyu bir kişiye anlatınca ne olur? Saf fonksiyon (testlenir). */
export function judge(r: Rumor, buyer: PersonId, asked: Topic, sold: readonly string[]): Judgement {
  const p = PEOPLE[buyer];
  const base: Judgement = { verdict: 'irrelevant', pay: 0, rep: 0, evidence: false, burned: false };
  if (r.about.includes(buyer)) return { ...base, verdict: 'aboutThem', rep: -10 };
  if (r.source === buyer) return { ...base, verdict: 'own', rep: -1 };
  const wanted = p.wants.includes(r.topic);
  if (!r.truth) return wanted ? { ...base, verdict: 'lie', rep: -8 } : { ...base, verdict: 'irrelevant', rep: -2 };
  if (!wanted) return { ...base, verdict: 'irrelevant', rep: -2 };
  if (sold.includes(saleKey(r.id, buyer))) return { ...base, verdict: 'already' };
  const exact = r.topic === asked;
  if (p.side === 'villain') return { ...base, verdict: 'betray', pay: Math.round(r.value * 2), rep: -15, burned: r.story };
  return { ...base, verdict: 'reward', pay: Math.round(r.value * (exact ? 1 : 0.6)), rep: r.story ? 6 : 3, evidence: r.story && p.side === 'han' };
}

/** VIP siparişi eksiksiz götürülünce kişinin anlattığı dedikodu (fısıltıları hariç). */
export function vipRumor(pid: PersonId): Rumor | undefined {
  return RUMORS.find((r) => r.source === pid && !PEOPLE[pid].whispers.includes(r.id));
}

/** Kişi bu konuyu sorabilir mi? (çağıran müşterinin bubble'ında görünen konu) */
export function askTopic(buyer: PersonId, pick: number): Topic | null {
  const w = PEOPLE[buyer].wants;
  return w.length ? w[pick % w.length] : null;
}

/** Eski kayıtlardaki "mekân:ofis" dedikodu anahtarlarını yeni kimliklere çevirir. */
export const LEGACY_GOSSIP: Record<string, string> = {
  'zemin:a': 'hayri_tapu',
  'zemin:b': 'sevim_evrak',
  'zemin:c': 'ferhat_vekalet',
  'kat1:a': 'fikret_borc',
  'kat1:c': 'rifat_rapor',
  'kat2:a': 'nevin_fal',
  'kat2:b': 'lale_foto',
  'kat3:a': 'selim_telefon',
  'kat3:b': 'turgut_komisyon',
  'teras:a': 'nadir_rapor',
  'teras:b': 'gokdelen_bilirkisi',
  'teras:c': 'gulsum_destek',
};

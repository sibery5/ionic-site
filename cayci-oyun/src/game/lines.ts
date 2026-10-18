import type { Text } from './story';
import type { Verdict } from './rumors';

// Vardiya içindeki konuşmalar: dedikodu tepkileri, kovalama, tepsiyle vurma, patronun mesajları.

const T = (tr: string, en: string): Text => ({ tr, en });

export const REACTION: Record<Verdict | 'dontKnow', Text[]> = {
  reward: [
    T('Vay! Bunu bilmem lazımdı. Al bakalım, hak ettin.', 'Whoa! I needed to know that. Here, you earned it.'),
    T('Cemal, sen bu handa en çok şey bilen adamsın.', 'Cemal, you know more than anyone in this han.'),
    T('Altın değerinde bir laf. Kimseye söyleme.', 'Worth its weight in gold. Tell no one.'),
  ],
  betray: [
    T('Hah! Akıllı çocuksun. Bu aramızda kalsın.', 'Ha! Smart kid. This stays between us.'),
    T('Bunu bana getirdiğin iyi oldu. Bir gün patron olursun... bizim için çalışırsan.', "Good thing you brought this to me. You'll be a boss one day... if you work for us."),
  ],
  already: [T('Bunu bana zaten anlatmıştın evlat.', 'You already told me that, kid.'), T('Eski haber bu.', 'That is old news.')],
  own: [T('Onu sana ben anlattım!', 'I told you that myself!'), T('Benim lafımı bana mı satıyorsun? Ha ha!', 'Selling me my own gossip? Ha ha!')],
  irrelevant: [
    T('Bana ne bundan?! Çayın da soğumuş zaten!', 'Why would I care?! And your tea is cold anyway!'),
    T('Ben bunu mu sordum? Hıh!', 'Is that what I asked? Hmph!'),
  ],
  lie: [
    T('YALAN bu! Beni kandırmaya mı çalışıyorsun?!', 'That is a LIE! Are you trying to fool me?!'),
    T('Hangi fal bunu söyledi? Utan biraz!', 'Which fortune told you that? Shame on you!'),
  ],
  aboutThem: [
    T('BENİM hakkımda mı konuşuyorsun sen?! Gel buraya!', 'You are talking about ME?! Come here!'),
    T('Kim söyledi bunu?! Dur, kaçma!', 'Who told you that?! Stop, don\'t run!'),
  ],
  dontKnow: [T('Peki evlat, sağ ol çay için.', 'Alright kid, thanks for the tea.'), T('Kulağını açık tut.', 'Keep your ears open.')],
};

export const CHASE = {
  shout: [T('DUR ORADA!', 'STOP RIGHT THERE!'), T('Yakalarsam görürsün!', 'Wait till I catch you!'), T('Gel buraya çaycı!', 'Come here, tea boy!')],
  caught: [T('Al sana! Bir daha laf taşıma!', 'Take that! No more gossip!'), T('Kavanozun da bende kalsın!', "I'm keeping your jar too!")],
  smashLie: [T('Al, çayın da senin olsun!', 'Here, keep your tea!'), T('ŞANGIR! Yalancı!', 'CRASH! Liar!')],
};

export const BONK = {
  victim: [T('Ayy! Deli misin?!', 'Ow! Are you crazy?!'), T('Tepsiyle mi vurdun bana?!', 'Did you just hit me with a tray?!'), T('Patronuna söyleyeceğim!', "I'm telling your boss!")],
  whiff: [T('Hava!', 'Missed!')],
};

/** Patron Nadir Bey'in tepsiyle vurma mesajları (aynı vardiyada kaçıncı olduğuna göre). */
export const BOSS_BONK: Text[] = [
  T('Cemal! Kamera kayıtlarına baktım. Müşteriye tepsiyle vurulur mu?!', 'Cemal! I watched the cameras. You do NOT hit customers with the tray!'),
  T('Bir daha olursa maaşından keserim. Ciddiyim.', "Do it again and it comes out of your pay. I'm serious."),
  T('Kestim 10₺. Sinirini çaya ver evlat, insanlara değil.', 'That is 10₺ off. Put your anger into the tea, not into people.'),
];

export const BOSS_GULSUM = T('Gülsüm Abla\'ya mı vurdun?! Bütün han duydu, ayıp ayıp!', 'You hit Gülsüm?! The whole han heard about it. Shameful!');
export const BOSS_CHASER = T('Kovalayan müşteriyi tepsiyle devirmek de ne? Bir de haklı çıkmaya çalışma!', "Knocking down a customer who's chasing you? Don't even try to justify it!");

export const SALE_MSG = {
  nadir: T('Bunu bilmem gerekiyordu. Sağ ol evlat, unutmayacağım.', "I needed to know that. Thank you, kid. I won't forget it."),
  evidence: T('Duydum ki bilgileri doğru yere götürüyorsun. Aferin. — Rıza', "I hear you're taking what you know to the right people. Well done. — Rıza"),
  betray: T('Lafı döktün mü evlat? Selim\'lerle ne işin var senin? — Rıza', "Did you spill the talk, kid? What business do you have with Selim's lot? — Rıza"),
  lie: T('Yalan haber yayıyormuşsun diye duydum. Çaycının sözü namusudur. — Rıza', "I hear you've been spreading lies. A tea boy's word is his honour. — Rıza"),
};

/** Vardiya başında unvana göre telefona düşen mesaj. [kimden, metin] */
export const SHIFT_START: { from: 'boss' | 'riza' | 'villain'; text: Text }[] = [
  { from: 'riza', text: T('Tepsi artık sende. Çayı dökme, lafı dökme. Ama doğru laf doğru kulağa giderse, o başka.', "The tray is yours now. Don't spill the tea, don't spill the talk. But the right word in the right ear, that's different.") },
  { from: 'boss', text: T('Ocakçım! Rıza bana seni anlattı. Bugün de bekliyorum.', "My stove keeper! Rıza told me about you. I'm counting on you today.") },
  { from: 'boss', text: T('Kat Çaycısı Cemal. Kulağa hoş geliyor değil mi? Katlar senden sorulur.', 'Floor Tea Boy Cemal. Has a ring to it, eh? The floors are your responsibility now.') },
  { from: 'boss', text: T('Baş Çaycım, herkes seni soruyor. "Cemal nerede?" diye. Haberin olsun.', 'Head Tea Boy, everyone is asking for you. "Where is Cemal?" they say.') },
  { from: 'boss', text: T('Çaycıbaşı, hanın kulağı sensin artık. Selim\'lere dikkat.', "Chief of Tea, you are the han's ears now. Watch out for Selim's lot.") },
  { from: 'boss', text: T('Patron Cemal! Ocak senin, kuralları da sen koyarsın.', 'Boss Cemal! The stove is yours, and so are the rules.') },
];

/** Selim'in zaman zaman attığı teklif mesajı (kanıtlar birikince). */
export const VILLAIN_OFFER = T('Duyduğun her şeyi bana getir, iki katını öderim. Kimse bilmez. — Selim', "Bring me everything you hear and I'll pay double. Nobody needs to know. — Selim");

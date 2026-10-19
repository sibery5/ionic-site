# ÇAYCI — Don't Spill the Tea
## Oyun Tasarım Belgesi (GDD) · sürüm 0.5

> Askılı çay tepsisini sallayarak, tek damla dökmeden İstanbul'un en kaotik iş hanına çay yetiştir.

---

## 1. Özet

| | |
|---|---|
| Tür | Fizik tabanlı beceri + komedi, tek kişilik (co-op 1.1'de) |
| Platform | PC (Steam, Windows/Mac/Linux), web demo (itch.io) |
| Süre | Hikâye ~60-90 dk, sonsuz tekrar (Serbest Vardiya, Günlük Mücadele) |
| Fiyat | 3,99 $ |
| Motor / dil | TypeScript + Three.js (web), Steam için Electron + steamworks.js |
| Görsel | Kodla üretilmiş low-poly, sıcak renkler, düz gölgelendirme |
| Ses | Web Audio ile gerçek zamanlı sentezlenmiş efekt ve müzik (dış dosya yok) |

### Neden TypeScript + Three.js?
1. **Sıfır maliyet, sıfır telif:** MIT lisanslı, gelir payı yok.
2. **Anında test:** Oyun her tarayıcıda açılır. Arkadaşına link göndermek = playtest. itch.io web demosu bedava pazarlama.
3. **Steam'e gider:** Electron ile masaüstü uygulamasına sarılır, steamworks.js ile başarım/liderlik tablosu eklenir. Vampire Survivors da ilk sürümünü web teknolojisiyle (Phaser) çıkarmıştı.
4. **Lisans riski yok:** Bütün 3D modeller, dokular, sesler ve müzik koddan üretiliyor. İndirilmiş tek bir varlık yok.

---

## 1.5 Açgözlü Çaycı (ana mod, 0.2)

İlk sürüm oynandığında sıkıcı bulundu: gerilim yoktu, döngü angaryaydı, karar yoktu. 0.2 sürümü oyunu bir **risk-ödül** (push your luck) döngüsü etrafında yeniden kurar.

| Kural | Neden |
|---|---|
| 90 saniyelik tur, tek salon, 4 müşteri | Kısa tur, "bir daha" hissi |
| Ocakta **E basılı tut**: tepsiye istediğin kadar bardak (en fazla 12, 6'şar katlı kule) | Karar: kaç bardak? |
| Bardak sayısı arttıkça tepsi huysuzlaşır: bilek sürtünmesi artar, döküm açısı küçülür, üst kat bardakları devrilir | Açgözlülüğün bedeli (`src/game/greedRules.ts`) |
| Bahşişler tepsideki **kavanoza** girer, ancak ocağa dönünce **kasaya** geçer | Gerçek risk: tepsi uçarsa kavanozdaki para gider |
| 7+ bardakla teslim ×2 **kule bonusu**; kusursuz teslimler **çarpanı** ×0,5 artırır (en çok ×5) | Büyük risk = büyük ödül |
| **F → yeşilde F**: tek tuş Fırıldak. Tutarsa sonraki teslim ×2, kaçarsa tepede her şey uçar | Gösteri anı, net sonuç |
| **Ctrl / C**: parmak ucunda yürüme (yavaş ama güvenli) | Hız ile güvenlik arasında seçim |
| Felakette ağır çekim, kamera sarsıntısı, havada takla atan bardaklar, dev "ŞANGIRRR!" | Klip anı |

Zorluk eğrisi (`npm run tune:greed`, 0.3 fiziğiyle): 3 bardak normal yürüyüşte %4 kayıp; 8 bardak normal yürüyüşte %45 kayıp ve 2 bardak devrilir, parmak ucunda %1; 12 bardak normal yürüyüşte %78 kayıp ve 6 bardak devrilir, parmak ucunda %11.

## 1.6 Sürüm 0.3: yayına hazırlık

0.2'deki tek salonluk açgözlü döngü bir kariyer, bir hikâye ve kalıcı ilerleme sistemiyle sarıldı. Hedef: her turun bir anlamı olsun (süreklilik), her turda kaybedecek bir şey olsun (gerilim), oyuncu karakterine ve hanına bağlansın (bağlanma).

### Neden oynanır? (tasarım sütunları)

| İhtiyaç | Oyundaki karşılığı |
|---|---|
| Gerilim | Kavanoz: bahşiş ancak ocakta kasaya geçer. Kule: 6 bardaktan sonra üst kat. Son 20 saniye "çay saati": siparişler iki kat sık, bahşiş ×1,5, müzik hızlanır. |
| Karar | Kaç bardak? Bir tur daha mı, ocağa dönüp bozdurmak mı? VIP mi, acele sipariş mi? Fırıldak riskine girmeli mi? |
| Ustalık | Gerçek sarkaç: yumuşak kalkış, yavaş dönüş, parmak ucu. Fırıldak zamanlaması. Islak zeminde ve kedi yakınken parmak ucu. |
| Süreklilik | 6 mekânlı kariyer; her mekânda 3 yıldız, 2 görev ve 3 rakip. Bir yıldız sonrakini açar. |
| Hikâye | Rıza Usta'nın notları, VIP müşterilerin anlattığı 12 dedikodu, terasta han toplantısı ve 3 son. |
| Her gün dönmek | Günlük Mücadele (herkese aynı tohum) ve her gün 3 yeni görev. 7 farklı gün tamamlanınca başarım. |
| Bağlanma | Cemal'in dolabı (5 tepsi, 5 yelek, 5 şapka, 3 bardak; seviyeyle açılır), rütbeler (Çırak → Efsane Çaycı), mekân başına yerel sıralama ve geçilecek han sakinleri. |
| Ödül | XP ve 30 seviye, bahşişle alınan 6 yükseltme, 33 başarım (Steam başarımlarıyla aynı adlar; 0.4 ile 21 → 30, 0.5 ile 33). |

### Mekânlar

| Mekân | Süre | Kural | Görevler | Yıldız (₺) |
|---|---|---|---|---|
| Giriş Salonu | 90 sn | kedi | 6+ bardakla teslim, 1 Fırıldak | 30 / 70 / 120 |
| Zemin Kat | 100 sn | kalabalık, uzun koridor | 15 bardak teslim, kavanoz kaybetme | 30 / 65 / 110 |
| 1. Kat | 110 sn | açık/demli, Gülsüm Abla siliyor | 10 renkli bardak, hiç kayma | 40 / 85 / 140 |
| 2. Kat | 110 sn | açık/demli, kedi Paşa | Paşa'ya takılma, ×2 çarpan | 30 / 60 / 95 |
| 3. Kat | 110 sn | açık/demli, karanlık (el feneri) | 1 kusursuz VIP, tek seferde 50₺ | 30 / 65 / 110 |
| Teras | 120 sn | açık/demli, rüzgâr, kedi | 2 Fırıldak, 8+ bardakla teslim | 55 / 105 / 180 |

### Denge: bot ile ölçüm

Yıldız eşikleri, rakip skorları, görev hedefleri ve ekonomi tahminle değil ölçümle ayarlandı. `src/dev/bot.ts` oyunu gerçek kurallar ve fizikle oynayan bir yapay oyuncu: yol bulur, kapıdan ortalayarak geçer, insanları bekler, ıslak zeminde ve kedi yakınken parmak ucuna geçer, VIP siparişlere öncelik verir. Tek hilesi nişan almak (bakış yönünü fare yerine doğrudan ayarlar). `npm run balance` her mekânda 5 oyuncu tipini (temkinli, orta, açgözlü, cesur, koşucu) 8 tohumla oynatır.

Ayardan önceki son ölçüm (40 tur/mekân, skor yüzdelikleri ₺):

| Mekân | p25 | p50 | p75 | p90 | en iyi |
|---|---|---|---|---|---|
| Giriş Salonu | 25 | 46 | 78 | 113 | 139 |
| Zemin Kat | 18 | 36 | 60 | 97 | 220 |
| 1. Kat | 36 | 56 | 92 | 150 | 185 |
| 2. Kat | 20 | 42 | 57 | 77 | 95 |
| 3. Kat | 17 | 36 | 59 | 102 | 150 |
| Teras | 72 | 95 | 127 | 226 | 325 |

Kural: 1 yıldız ≈ temkinli oyuncunun ortalamasının altı, 2 yıldız ≈ üst çeyrek, 3 yıldız ≈ en iyi turların %5–10'u. Sıralamadaki son rakip Rıza Usta her mekânda 3 yıldızın üstünde. Bot insan gibi strateji kuramıyor (siparişlerin bir kısmı süresi dolup kaçıyor), insan da bot kadar keskin nişan alamıyor; eşikler gerçek oyuncu testinden sonra yeniden gözden geçirilmeli.

### Botun bulduğu ve düzeltilen hatalar

- Kavanoz kaybolduktan sonra ocakta verilen yeni kavanoz eski salınımı taşıyordu ve hemen tekrar devriliyordu (her seferinde ağır çekimle). Artık yeni kavanoz durgun başlar.
- Kulenin üst katı çay yüzeyinin dalgasına bakarak devriliyordu; dalga az sönümlü olduğu için parmak ucunda yürürken bile devrilirdi. Artık katı cisim eğimine (ağır sönümlü) bakar.
- Parmak ucu ivmesi (3 m/s²) 10 bardaklık kuleyi devirmeye yetiyordu. 1,8 m/s²'ye indi; artık parmak ucu kuleyi gerçekten korur, normal kalkış devirir (testle doğrulanır).
- Dolu tepsiyle yerinde hızlı dönünce el gövdenin yanında olduğu için tepsi savruluyordu. Gövdenin dönüş hızı ve ivmesi tepsideki bardak sayısıyla sınırlandı (kamera hâlâ anında döner).
- Han sakinleri oyuncuya çarpınca onu metrelerce geri itiyordu. Artık yol veren taraf onlar; tepsiden de kaçınırlar ve birbirlerinin içinden geçmezler.
- Zemin Kat'ta ocağa yakın masaya servis yapılamıyordu (ocağın yanında E sadece çay dolduruyordu). Artık tepside uyan bardak varsa E önce teslim eder.
- Parmak ucunda (1,5 m/s) bile kediye takılınıyordu; not "Ctrl ile parmak ucunda yürü" diyordu. Eşik 1,6 m/s'ye çıktı, kural artık doğru.
- Kamera kapı pervazında duvarın içine girebiliyordu; artık engelden önce durur.
- Cemal tepsiyi tutan kolun karşı tarafındaki kolla, gövdesinin önünden uzanarak tutuyordu. Kollar anatomik tarafa göre düzeltildi.
- VIP 4–5 bardak / 26 sn idi ve kusursuz teslim şarttı; dedikodu toplamak onlarca tur sürüyordu. Şimdi 3–4 bardak / 30 sn ve dedikodu VIP siparişi eksiksiz tamamlanınca gelir.

### İlerleme ekonomisi

- Seviye için gereken toplam XP: 30·k·(k+3), k = seviye − 1. Tur başına XP ≈ kasadaki para + yeni görev (25) + yeni yıldız (60) + günlük görev ödülleri. 10. seviye ≈ 30 tur, 30. seviye ≈ 280 tur.
- Yükseltmeler: Hızlı Demlik 120, Kaymaz Ayakkabı 150, Simit İkramı 200, Usta Bileği 260, Kalın Ara Tepsi 340, Kavanoz Kilidi 450 (toplam 1.520₺ ≈ 20 tur). Günlük Mücadelede yükseltmeler kapalı (herkese eşit şart).
- Kayıt: `localStorage` (`cayci-save-v2`), Steam sürümünde ayrıca Steam Cloud (`cayci-save.json`).

### Bilinen sınırlar

- Sıralama yerel: steamworks.js 0.4'te Steam Leaderboards yok.
- Masaüstü (Electron + Steam) sarmalayıcı bu ortamda çalıştırılamadı; yazıldı ama denenmedi.
- Denge bota göre ayarlandı; gerçek oyuncu testi (en az 5–10 kişi) yapılmadı.

## 1.7 Sürüm 0.4: dedikodu, kovalama ve çaycının yükselişi

0.3 oynanınca istek şu oldu: kurgu daha güçlü olsun, dedikodular bir ekonomiye dönüşsün, yanlış laf komik bir kovalamacaya yol açsın, kalabalığa sinirlenen çaycı tepsiyle vurabilsin ve bunun bir bedeli olsun; oyun bir çıraklıktan patronluğa yükseliş hikâyesi olsun.

### Dedikodu ekonomisi (`src/game/rumors.ts`, `src/game/Intrigue.ts`)

| Öğe | Kural |
|---|---|
| Dedikodu | 20 tane. Her birinin konusu (📜 tapu, 💰 para, 📋 rapor, 📷 fotoğraf, 💬 kulis, 🐈 Paşa), kaynağı, kimin hakkında olduğu, doğru mu yalan mı ve değeri var. 11'i hanın kaderine dair hikâye kanıtı. |
| Duymak | VIP siparişini eksiksiz götürünce müşteri kendi dedikodusunu anlatır (kariyer). Kusursuz teslimden sonra %30 şansla fısıltı (kariyer ve serbest). Hepsi cep defterine yazılır. |
| Sormak | Bazı müşteriler çay söylerken "dedikodu var mı?" diye sorar (mor balon, kulak ve konu işareti). Cepte o kişinin işine yarayacak bir laf varsa %80, yoksa %20 (cep boşsa %12). Vardiyada en çok 5 soru, aralarında 9 sn; kötü adamlar en çok 2 kez. Soran müşteri ×1,4 sabırlıdır. |
| Anlatmak | Çay teslim edilince panel açılır, dünya durur: cepteki dedikodulardan biri ya da "bilmiyorum". |
| Doğru kişi | Konuyu merak eden, han tarafından biri: dedikodunun değeri kadar bahşiş (sorulan konu değilse %60), itibar +3/+6, hikâye kanıtıysa kanıt han tarafına ulaşır. Aynı kişiye ikinci kez satılmaz. |
| Kötü adam | Selim, Turgut, Gökdelen Yapı: iki kat para ama itibar −15, kanıt yanar (artık toplantıda işe yaramaz), Rıza Usta mesaj atar. |
| Yalan | Konuyu merak edene yalan (falcının, hayalperestin lafları): "Yalan bu!", iki bardak kırılır, %45 ihtimalle kovalar, itibar −8. |
| Kendisi hakkında | Kovalar. İtibar −10. |
| Alakasız | "Bana ne!", %50 bir bardak kırılır, itibar −2. |
| Kaynağına geri | "Onu sana ben anlattım!" Komik, zararsız. |

### Kovalama

Kızan müşteri masasından kalkar, kolları havada, yolu bularak koşar (3,1 m/s: yürüyüşten hızlı, koşudan yavaş). Kırmızı kenar ve uyarı yazısı çıkar, müzik hızlanır. Kaçmanın yolu Rıza Usta'nın ocağıdır ("ocağa kimse giremez"); 16 sn sonra yorulup vazgeçer. Yakalarsa tepsiye şaplak atar: tepsi savrulur, bardaklar uçar, kavanoz gider. Yani kovalamaca da tepsi fiziğiyle oynanır: koşarsan dökersin, yürürsen yakalanırsın.

### Sinir ve tepsiyle vurma

Sinir göstergesi yolu tıkanınca (ileri basıp yürüyemeyince), biri tepsiye çarpınca, kediye takılınca, kayınca ve sipariş kaçınca dolar, yavaşça iner. Dolunca R (oyun kolunda RT) ile önündeki kişiye tepsiyle vurulur: metal "DANK", ağır çekim, kişi yere yığılıp söylenerek kalkar. Bedeli: itibar −5 (Gülsüm Abla'ysa −8), patron Nadir Bey telefondan kızar, aynı vardiyada üçüncüsünden itibaren maaştan 10₺ keser. Kovalayan müşteriye sinir dolmadan da vurulabilir: kovalama biter ama patron yine kızar.

### Çaycının yükselişi (`src/meta/titles.ts`)

| Unvan | Şart | Maaş/vardiya |
|---|---|---|
| Çırak | başlangıç | 0₺ |
| Ocakçı | Giriş Salonu 1★ | 5₺ |
| Kat Çaycısı | Zemin Kat ve 1. Kat 1★ | 10₺ |
| Baş Çaycı | 2. Kat 1★, itibar 45+ | 18₺ |
| Han Çaycıbaşı | 3. Kat 1★, itibar 50+, 2 kanıt | 28₺ |
| Çay Ocağı Patronu | toplantıda gerçeği anlat | 45₺ |

İtibar (0–100, başlangıç 50) bahşişi ×0,9 ile ×1,1 arasında değiştirir. Toplantıda inanılmak için 6 kanıt (yanmamış) ve 35 itibar gerekir. Dört son: Patron Cemal (gerçek), Kimse İnanmadı (kanıt ya da itibar eksik), Susmak Altın (sus), AVM Müdürü (Selim'in 500₺'lik teklifi).

### Ara sahneler (`src/game/Cutscene.ts`, `src/game/scenes.ts`)

Oyun içi 3B sahneler: küçük setler (ocak, ofis, karanlık ofis, teras), dizilen karakterler, konuşana seyirci tarafından yaklaşan kamera, daktilo gibi yazılan konuşma kutusu, atlanabilir. Sekiz sahne: ilk gün (Rıza Usta tepsiyi verir), dört terfi, Selim'in teklifi (3. kata ilk çıkış), han toplantısı ve Patron Cemal sonu (ocağın anahtarı). Vardiya başında unvana göre telefona mesaj düşer.

### Görsel

- Yeni dekor (`src/world/decor.ts`): Galata, vapur, lale çini ve sepya fotoğraflı duvar resimleri, semaver, bardak rafı, "Çay Ocağı" fiyat afişi, ilan panosu ("Han toplantısı Cuma 18:00"), duvar saati, kilim yollukları, tavan vantilatörleri, terasta ip lambalar. Katlara kurallı (tohumlu) yerleşir, çarpışma yaratmaz.
- Son işlem (`src/world/post.ts`): yüksek kalitede ışıma (bloom), sıcak renk ayarı, kenar karartma ve ince gren; ortada bloom kapalı; düşükte kapalı.

### Ayarlar

Tepsi zorluğu: Rahat (döküm açısı ×1,35, kule +5°, sönüm ×1,45; skor ×0,8), Normal (dengelenen), Usta (döküm ×0,8, kule −3°, sönüm ×0,85; skor ×1,25). Günlük mücadelede hep Normal. Kamera mesafesi 0,75–1,35.

### Denge (0.4 ölçümü, 8 tohum × 5 oyuncu tipi)

Yeni sistemler bot ölçümünü bozmadı; sadece Teras düştü (medyan 95 → 72) ve yıldızları 55 / 105 / 180'e indirildi. Bot dedikodu sorularına "bilmiyorum" der; dedikodu bahşişleri ölçülen skorların üstüne eklenir.

## 1.8 Sürüm 0.5: teftiş, geri tepme ve hikâye dengesi

### Hikâye dengesi ölçüldü (`npm run story`)

0.4'te bot dedikodu sorularına hep "bilmiyorum" diyordu, yani hikâyenin hızı hiç ölçülmemişti. 0.5'te bot dedikodu da oynuyor (`gossip` becerisi: doğru lafı seçme olasılığı) ve `__cayci.botCareer` bütün kariyeri geçici bir kayıtla oynayıp kanıt, itibar ve unvanı vardiya vardiya yazıyor.

| | 0.4 kuralları | 0.5 kuralları |
|---|---|---|
| Beceri 0,95 (iyi oyuncu) | 24 vardiyada 4–5 kanıt, inandıramadı | 11–12. vardiyada inandırıyor (terası ilk geçtikten hemen sonra) |
| Beceri 0,6 (özensiz) | 24 vardiyada 3 kanıt | 16–18. vardiyada inandırıyor |

Bulunan darboğaz: soru sayısı değil, soran kişinin cepteki lafa ilgisizliği ve her panelde tek satış. Çözüm:
- Laf, lafı bilenin ayağına gelir: cebinde o kişinin merak ettiği doğru bir laf varsa çok daha sık sorar.
- Han tarafı doğru lafı alınca **"başka?"** diye üsteler: aynı panelde kalan kartlardan en çok iki laf daha (süre ×0,75). Bir şey bilmiyorsan "bilmiyorum" zararsızdır, oyun cepte iyi kart olup olmadığını ele vermez.
- Kötü adamlar bir vardiyada en çok 2 kez ayartır (yoksa soru hakkını yiyorlardı).

Skor ölçümü (`npm run balance`) eskisi gibi dedikodusuz yapılır; yıldız eşikleri değişmedi.

### Patron teftişi

Ocakçı olduktan sonra kariyer vardiyalarının %60'ında, vardiyanın %25–50'si arasında Nadir Bey 45 saniyeliğine bizzat kata çıkar (telefon mesajı, "TEFTİŞ" yazısı, üstte rozet). 6,5 m içindeyse "izliyor" sayılır (rozet kırmızı yanar):

| Olay (izlerken) | Etki |
|---|---|
| Kusursuz teslim | 👍 +1 |
| Kırılan bardak, uçan kavanoz, başlayan kovalama | 👎 +1 |
| Birine tepsiyle vurmak | 👎 +2 |
| Patronun kendisine vurmak | "PATRONA VURDUN!", itibar −20, 30₺ ceza, teftiş biter |

Sonuç: 👍−👎 ≥ 2 ise teftişten geçilir (kavanoza 15₺, itibar +5), 0–1 "fena değil" (+1), eksi ise itibar −5 ve azar.

### Dedikodunun geri tepmesi

Bir lafı (doğru kişiye ya da kötü adama) satınca, lafın hakkında olduğu kişi aynı katta oturuyorsa "🤫 … bu katta, duymasın!" uyarısı çıkar. %40 ihtimalle 12–24 sn sonra o kişi duyar, "Kulaklarım çınladı!" diye kalkıp kovalar (itibar −2). Örnek: 3. katta Defne Hanım'a Selim'in raporunu anlatmak, Selim'i peşine takar.

### Düzeltilen hatalar

- Oyuna devam edilen ilk karede tarayıcının kare zaman damgası `performance.now()`dan önce kalabiliyor, zaman adımı negatif oluyordu (fizik bir an geri sarıyordu). Adım artık 0'ın altına düşmez.
- Dedikodu paneli ortalanmıyordu: açılış animasyonu `transform`'u ezip paneli sağ alta kaydırıyor, kalabalık cepte "bilmiyorum" satırı ekran dışında kalıyordu.
- Aynı adı taşıyan iki CSS animasyonu yüzünden bildirimler (toast) yukarı kayıp sönmüyordu.

### Yeni başarımlar

Göz Önünde (teftişten geç), Kulakları Çınladı (geri tepme), Patrona Tepsi (gizli). Toplam 33.

## 2. Kurgu

### Mekân
**Büyük Dedikodu Hanı** — Karaköy'de 1923 yapımı, 4 katlı + teraslı eski bir iş hanı. Mozaik karolar, ahşap lambriler, buzlu camlı ofis kapıları, gıcırdayan merdivenler.

### Karakterler
| Karakter | Kim | Rolü |
|---|---|---|
| **Cemal** (oyuncu) | Hanın yeni çay çırağı, 19 yaşında | Beyaz gömlek, siyah yelek, kısa bıyık denemesi |
| **Rıza Usta** | Emekli olan efsane çaycı | Her günün başında not bırakır (öğretici) |
| **Nadir Bey** | Hanın 78 yaşındaki sahibi | Terasta oturur, han her şeyidir |
| **Selim** | Nadir Bey'in yeğeni, KriptoBey A.Ş. | Hanı gizlice AVM'ye satmaya çalışıyor |
| **Paşa** | Hanın turuncu kedisi | Ayağına dolanır, tepsiyi düşürtür |
| **Gülsüm Abla** | Temizlikçi | Sürekli yeni silinmiş, kaygan zemin |

### Ofisler (kat kat)
| Gün | Kat | Ofisler | Yeni engel |
|---|---|---|---|
| 1 | Zemin | Terzi Hayri, Kırtasiye Bilgi, Noter Katibi Ferhat | Kalabalık koridor (öğretici gün) |
| 2 | 1. kat | Mali Müşavir Fikret, Sigortacı Şükran, Av. Rıfat | Gülsüm Abla'nın kaygan zemini |
| 3 | 2. kat | Medyum Nevin, Fotoğrafçı Lale, Turizm Acentesi | Han kedisi Paşa |
| 4 | 3. kat | KriptoBey A.Ş., Emlakçı Turgut, Mimar Defne | Elektrik kesintisi (karanlık) |
| 5 | Teras | Nadir Bey ve misafirleri | Rüzgâr + hepsi |

### Ana hikâye
Rıza Usta emekli olurken askılı tepsisini ve tek kuralını bırakır: **"Çayı dökme, lafı dökme."**
Cemal kusursuz çay götürdükçe ofislerdeki konuşmaları duyar ve **dedikodu kartları** toplar (günde 2-3, toplam 12; iyi son için 10 gerekir). Kartlar birleşince sır ortaya çıkar: Selim, Emlakçı Turgut ve bir AVM şirketiyle anlaşmış, Nadir Bey'e sahte bir "çürük bina" raporu imzalatmak üzere.

5. günün sonunda terasta han toplantısı yapılır. Oyuncu seçer:

| Seçim | Koşul | Son |
|---|---|---|
| **Çayı dök** (dedikoduyu anlat) | 10+ kart | **Han kurtulur.** Nadir Bey Cemal'i "Han Ustası" ilan eder. |
| **Çayı dök** | 10'dan az kart | **Kimse inanmaz.** Cemal "dedikoducu çırak" olur, han satılır. Komik-hüzünlü son. |
| **Sus** | — | **Han satılır.** Cemal Karaköy vapurunda kendi çay ocağını açar. Tatlı-acı son. |

Ton: sevgi dolu komedi. Çaycı alay konusu değil, binanın en becerikli kahramanı.

---

## 3. Oynanış

### 3.1 Kontroller
| Tuş | Oyun kolu | Eylem |
|---|---|---|
| **W A S D** | Sol çubuk | Yürü (kameraya göre) |
| **Fare** | Sağ çubuk | Etrafa bak, dön. Dolu tepsiyle gövde yavaş döner, kamera anında |
| **Shift** | RB | Koş (tepsi daha çok sallanır) |
| **Ctrl / C** | LB | Parmak ucu: 1,5 m/s, yumuşak ivme. Kuleyi korur, kediye takılmazsın, ıslak zeminde kaymazsın |
| **E** (ocakta basılı) | A | Demli çay doldur (bardak başına 0,32 sn) |
| **Q** (ocakta basılı) | X | Açık çay doldur (1. kattan itibaren) |
| **E** (masada) | A | Teslim et (ocağın dibindeki masada da: tepside uyan bardak varsa önce teslim) |
| **F**, sonra yeşilde **F** | B | Fırıldak. Tutarsa sonraki teslim ×2 |
| **Boşluk** | Y | Tepsiyi kaldır |
| **Sol tık basılı + fare** | | Ustalar için kol modu: tepsiyi tutan eli kendin oynat |
| **Esc** | Start | Duraklat |

### 3.2 Tepsi fiziği (oyunun kalbi)
Tepsi, elin ucunda **sarkaç** gibi asılıdır (askı boyu 0,42 m).

- **Hissedilen yerçekimi:** `g_his = g − a_tepsi`. Çay her zaman bu yöne "düşer".
- İdeal bir askılı tepside bu kuvvet hep askı doğrultusundadır, yani **tepsi düzgün sallanırken çay dökülmez**. Gerçek hayattaki numaranın sırrı budur.
- Dökülmeyi iki gerçekçi gecikme üretir:
  1. **Tepsi gecikmesi:** Tepsinin açısı askıyı yay-sönümleyici ile takip eder. Ani bir sarsıntıda tepsi askıdan geri kalır.
  2. **Çay çalkalanması:** Çayın yüzeyi hissedilen yerçekimini az sönümlü bir yayla takip eder. Ani duruşta çay "dalga" yapar.
- **Döküm kuralı:** Tepsi normali ile çay yüzeyi arasındaki açı, doluluğa göre izin verilen açıyı (dolu %100 → 14°, yarım → 35°) geçerse çay taşar.
- **Fırıldak tekniği:** Sadece ileri-geri sallamak tepsiyi tepeye yavaş çıkarır ve bardaklar uçar. Eli dikey bir çemberde saniyede ~1,4 tur (≈9 rad/s) döndürmek kusursuz tur attırır (simülasyonla doğrulandı: 0 damla döküntü).
- **Havalanma:** Fırıldak'ın tepesinde hız yetersizse hissedilen yerçekimi tepsiden dışarı döner → bardaklar havalanır → 0,12 sn sürerse bardaklar uçar ve kırılır.
- **Kule ve kavanoz:** Üst kat bardakları ve bahşiş kavanozu çay gibi dalgalanmaz; ağır sönümlü bir katı cisim eğimiyle izlenir. Eğim kule sınırını (3 bardakta 23°, 12 bardakta 16°) geçerse en üstteki bardaklar düşer; sınırın 20° fazlasını geçerse kavanoz devrilir.
- **Çarpışma:** Tepsi duvara, masaya veya insana çarparsa itilir ve sarsılır (sekme katsayısı 0,25).
- **Kendi yarattığın tehlike:** Dökülen çay yere **gölcük** olur, gölcük kaygandır.

### 3.3 Çay doldurma (ocak)
Ocağın yanında E (demli) ya da Q (açık) basılı tutuldukça tepsiye birer birer dolu bardak eklenir (en fazla 12; Hızlı Demlik ile %30 hızlı). Ocağa yaklaşınca kavanozdaki bahşiş kasaya geçer ve kavanoz kaybolduysa yenisi verilir.

### 3.4 Sipariş ve bahşiş (0.3)
- Siparişler 3,5–6 sn arayla gelir (çay saatinde iki kat sık). Her müşteri 1–4 bardak ister; sabır 32 sn.
- **VIP** (altın balon, ★): 3–4 bardak, 30 sn sabır, bahşiş ×3. Mekân başına planlı 1–3 VIP gelir; kariyerde dedikodusu henüz duyulmamış müşteri önce gelir. VIP siparişini eksiksiz götürünce dedikoduyu anlatır.
- **Acele** (kırmızı balon, !): 1–2 bardak, 15 sn sabır, bahşiş ×2. 12. saniyeden sonra siparişlerin %20'si.
- 1. kattan itibaren siparişler açık/demli karışık: ocakta E demli, Q açık doldurur; yanlış tip teslim edilmez.
- **Bardak başına bahşiş** = `4₺ × doluluk² × çarpan × kule × Fırıldak × sipariş türü × çay saati`
  - çarpan: her kusursuz sipariş (bütün bardaklar %80+ dolu) +0,5, en çok ×5; kusurlu sipariş ×1'e düşürür, süresi dolan −0,5, kırılan bardak ya da kavanoz kaybı ×1'e indirir
  - kule: tepside 7+ bardakla teslim ×2 · Fırıldak: başarılı Fırıldak'tan sonraki teslim ×2 · çay saati (son 20 sn) ×1,5
- Bahşiş kavanoza girer; kasaya ancak ocağa dönünce geçer. Tur sonunda kavanozda kalan para da kaybolur.
- Skor = kasa. Kasa aynı zamanda cüzdana eklenir (çarşı parası).

### 3.5 Vardiya
- Mekâna göre 90–120 sn. Yıldız eşikleri ve görevler için bkz. bölüm 1.6.
- Tur sonu ekranı: yıldızlar, skor, geçilen rakip, görevler, XP/seviye, açılan kıyafet, tamamlanan günlük görevler, açılan başarımlar, sıralamadaki yer, duyulan dedikodular.

### 3.6 Yükseltmeler (Han Çarşısı)
| Yükseltme | Etki | Fiyat |
|---|---|---|
| Hızlı Demlik | Bardak doldurma %30 hızlı | 120₺ |
| Kaymaz Ayakkabı | Islak zeminde %60 daha az kayma | 150₺ |
| Simit İkramı | Müşteriler %25 daha sabırlı | 200₺ |
| Usta Bileği | Ağır tepside sallantı azalır | 260₺ |
| Kalın Ara Tepsi | Kulenin üst katı daha zor devrilir | 340₺ |
| Kavanoz Kilidi | Turda bir kez kavanoz düşmez, paranın yarısı kurtulur | 450₺ |

### 3.7 Modlar
| Mod | İçerik |
|---|---|
| Kariyer | 6 mekân, yıldızlar, görevler, rakipler, dedikodular, han toplantısı ve 3 son |
| Günlük Mücadele | Tarihe göre sabit mekân ve tohum: herkes aynı siparişleri alır, yükseltmeler kapalı. Günün en iyi skoru ve sıralaması tutulur |

### 3.8 Engeller
| Engel | Davranış |
|---|---|
| Kalabalık | NPC'ler koridorda yol bulur; tepsi 1,3 m altındaysa çarpar |
| Kaygan zemin | Sarı "Dikkat Kaygan Zemin" tabelalı karolar, ivme 10 → 2 m/s² |
| Gölcük | Kendi döktüğün çay, 30 sn sonra kurur |
| Paşa (kedi) | Yakınındaysan ayağına dolanır, çarparsan sendelersin |
| Elektrik kesintisi | Işıklar söner, sadece el feneri ve acil ışıklar |
| Rüzgâr | Terasta rastgele esintiler tepsiyi yana iter |

---

## 4. Görsel tasarım

### Renk paleti
| Renk | Kod | Kullanım |
|---|---|---|
| Tavşan kanı | `#B3261E` | Demli çay, logo |
| Açık çay | `#D9822B` | Açık çay, vurgu |
| Han sarısı | `#F2E3C2` | Duvarlar |
| Lambri kahve | `#6B4226` | Ahşap |
| Mozaik krem / kiremit | `#EFE6D2` / `#B5543A` | Zemin |
| Gece mavisi | `#1E2A3A` | Gece, UI gölge |

### Modeller (hepsi kodla üretilir: `src/world/models.ts`)
- **İnce belli bardak:** Lathe (döndürme) geometrisi, lale profili, yarı saydam cam + içte renkli çay. Doluluk çay mesh'inin yüksekliğiyle gösterilir.
- **Askılı tepsi:** Nikel kaplama yuvarlak tepsi, kenar halkası, 3 askı çubuğu, tepede tutma halkası.
- **Cemal:** Low-poly gövde, beyaz gömlek, siyah yelek, koyu saç, bıyık. Sağ kol tepsiyi tutan ele uzanır (basit IK), bacaklar yürürken prosedürel sallanır.
- **Müşteriler/NPC'ler:** Aynı iskelet, farklı kıyafet renkleri, gözlük, başörtüsü, kel/saçlı varyasyonlar.
- **Paşa:** Turuncu tekir, kuyruk sallar.
- **Ocak:** Ahşap tezgâh, çift katlı çaydanlık, buhar parçacıkları, bardak rafı.
- **Dekor:** Masa, sandalye, dosya dolabı, saksı, sebil, kalorifer, duvar saati, kaygan zemin tabelası, tavan lambaları, buzlu camlı kapılar ve ofis tabelaları.

### Kamera ve arayüz
- 3. şahıs, karakterin arkasında ve hafif yukarıda; duvarlara girmez.
- Sipariş fişleri sarı kâğıt not görünümünde. Tepsi göstergesi: bardak ikonları, doluluk ve sıcaklık rengi.
- Sipariş veren müşterinin üstünde çay balonu ikonu.

---

## 5. Ses tasarımı (hepsi `src/audio/Audio.ts` içinde sentezlenir)

| Ses | Nasıl üretiliyor | Ne zaman |
|---|---|---|
| Bardak şıngırtısı | 3 yüksek sinüs kısmi (2,4-4,2 kHz), hızlı sönüm, rastgele ince ayar | Tepsi sarsıldıkça, şiddete göre |
| Çay dökülmesi (doldurma) | Bant geçiren gürültü + "lık lık" LFO, perde yükselir | Ocakta 1/2 basılıyken |
| Ayak sesi | Kısa alçak geçiren gürültü + düşük "tok" | Adım fazında; koşarken sert, kaygan zeminde vıcık |
| Taşma / sıçrama | Kısa bant gürültü patlaması | Çay döküldüğünde |
| Bardak kırılması | 8 rastgele cam tınısı + gürültü patlaması | Bardak düştüğünde |
| Bahşiş | İki tonlu "çın" | Teslimde |
| Fırıldak | Yükselen "vınnn" + alkış gürültüsü | Tam tur atınca |
| Kedi | FM perde kayması "miyav" | Paşa ayağa dolanınca |
| Konuşma ("Han dili") | Testere dalga + iki formant süzgeci, rastgele hece | Müşteri konuşunca / dedikoduda |
| "Çaaay!" | Formant süzgeçli, perde kayan uzun ünlü | F tuşu |
| Rüzgâr | Süzgeçli gürültü, kesme frekansı dalgalanır | Teras |
| Müzik | Karplus-Strong ile tel (bağlama benzeri) sesi, **Hicaz makamında** prosedürel ezgi, düm-tek darbuka ritmi, alçak dem (drone) | Arka planda, sakin |

---

## 6. Teknik mimari

```
src/
  main.ts            giriş, oyun döngüsü
  config.ts          bütün ayar sayıları (fizik, bahşiş, süreler)
  core/              input, i18n (TR/EN), kayıt, tohumlu rastgele sayı
  physics/tray.ts    tepsi + çay simülasyonu (saf matematik, test edilir)
  physics/grid.ts    ızgara çarpışması, yol bulma
  game/orders.ts     sipariş ve bahşiş kuralları (saf, test edilir)
  game/story.ts      günler, ofisler, dedikodular, sonlar
  game/levels.ts     kat haritaları (ASCII ızgara)
  game/Shift.ts      bir vardiyayı yöneten sahne
  world/             dokular, modeller, kat inşası
  entities/          oyuncu, NPC, kedi, müşteri, tepsi görünümü
  fx/                parçacıklar, gölcükler
  audio/Audio.ts     ses sentezi ve müzik
  ui/                HUD ve menüler
tests/               vitest birim testleri
desktop/             Electron sarmalayıcı (Steam sürümü)
```

### Kat haritası formatı
| Karakter | Anlam |
|---|---|
| `#` | Duvar |
| `.` | Zemin |
| `P` | Oyuncu başlangıcı |
| `O` | Ocak |
| `a`-`f` | Müşteri masası (ofis harfi) |
| `w` | Kaygan zemin (tabelalı) |
| `n` | NPC yol noktası |
| `c` | Kedi |
| `p` | Saksı · `k` dosya dolabı · `v` sebil |

---

## 7. Yol haritası

| Sürüm | İçerik |
|---|---|
| 0.1 | 5 gün, tüm engeller, sipariş/bahşiş, dedikodu ve 3 son, dükkân, Serbest Vardiya, Günlük Mücadele, TR/EN, sentez ses ve müzik |
| 0.2 | Açgözlü Çaycı: kavanoz, kule, tek tuş Fırıldak |
| 0.3 | 6 mekânlı kariyer, görevler ve yıldızlar, günlük görevler, 21 başarım, XP/seviye/rütbe, dolap, çarşı, yerel sıralama ve rakipler, yeni karakter modelleri, oyun kolu, grafik kalitesi, Steam köprüsü (başarım, bulut, oyuncu adı), mağaza kiti, bot ile denge |
| 0.4 (bu sürüm) | Dedikodu ekonomisi, kovalama, sinir ve tepsiyle vurma, patron mesajları, unvanlar ve maaş, itibar, 8 ara sahne, yeni son, yeni dekor, son işlem, tepsi zorluğu |
| 1.0 (Steam) | Gerçek oyuncu testi ve denge, Electron paketinin kendi bilgisayarında denenmesi, çevrimiçi sıralama (Greenworks ya da küçük sunucu), fragman |
| 1.1 | **Çay Ocağı co-op:** 2-4 kişi online, biri demler diğerleri dağıtır, yakınlık sesli sohbeti |

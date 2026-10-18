# ÇAYCI — Don't Spill the Tea
## Oyun Tasarım Belgesi (GDD) · sürüm 0.1

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
| Tuş | Eylem |
|---|---|
| **W A S D** | Yürü (kameraya göre) |
| **Fare** | Etrafa bak / dön |
| **Shift** | Koş (tepsi daha çok sallanır) |
| **Sol tık basılı + fare** | **Kol modu:** tepsiyi tutan eli oynat (fare X ileri-geri, fare Y yukarı-aşağı). Fareyle hızlı daireler çizerek **Fırıldak** (360°) yap |
| **Boşluk** | Tepsiyi başının üstüne kaldır (kalabalıkta geçmek için) |
| **1 / 2** (ocakta, basılı tut) | Açık / demli çay doldur. Renk hedef bölgedeyken bırak |
| **Q** (ocakta) | Tepsideki bardakları boşalt |
| **E** | Masaya teslim et |
| **F** | "Çaaay!" diye bağır (yakındaki ofisler sipariş verir) |
| **Esc** | Duraklat |

### 3.2 Tepsi fiziği (oyunun kalbi)
Tepsi, elin ucunda **sarkaç** gibi asılıdır (askı boyu 0,42 m).

- **Hissedilen yerçekimi:** `g_his = g − a_tepsi`. Çay her zaman bu yöne "düşer".
- İdeal bir askılı tepside bu kuvvet hep askı doğrultusundadır, yani **tepsi düzgün sallanırken çay dökülmez**. Gerçek hayattaki numaranın sırrı budur.
- Dökülmeyi iki gerçekçi gecikme üretir:
  1. **Tepsi gecikmesi:** Tepsinin açısı askıyı yay-sönümleyici ile takip eder. Ani bir sarsıntıda tepsi askıdan geri kalır.
  2. **Çay çalkalanması:** Çayın yüzeyi hissedilen yerçekimini az sönümlü bir yayla takip eder. Ani duruşta çay "dalga" yapar.
- **Döküm kuralı:** Tepsi normali ile çay yüzeyi arasındaki açı, doluluğa göre izin verilen açıyı (dolu %100 → 14°, yarım → 35°) geçerse çay taşar.
- **Fırıldak tekniği:** Sadece ileri-geri sallamak tepsiyi tepeye yavaş çıkarır ve bardaklar uçar. Eli dikey bir çemberde saniyede ~1,4 tur (≈9 rad/s) döndürmek kusursuz tur attırır (simülasyonla doğrulandı: 0 damla döküntü).
- **Havalanma:** Fırıldak'ın tepesinde hız yetersizse hissedilen yerçekimi tepsiden dışarı döner → bardaklar havalanır → 0,08 sn sürerse bardaklar uçar ve kırılır.
- **Çarpışma:** Tepsi duvara, masaya veya insana çarparsa itilir ve sarsılır.
- **Kendi yarattığın tehlike:** Dökülen çay yere **gölcük** olur, gölcük kaygandır.

### 3.3 Çay doldurma (ocak)
Ocağın yanında **1** (açık) veya **2** (demli) tuşuna basılı tut. Bar açık kehribardan koyu kırmızıya döner.
- Açık hedef: %30-48 · Demli hedef: %62-80
- Hedefte bırakırsan **"Tavşan kanı!"** (renk çarpanı 1,2), dışında bırakırsan 0,8.
- Çay 85 °C doldurulur, saniyede 0,35 °C soğur (Termos Demlik ile 0,2).

### 3.4 Sipariş ve bahşiş
- Aynı anda en fazla 3 sipariş fişi (4. günden sonra 4). Her 9-14 sn'de yeni sipariş. Sabır süresi 60 sn.
- Fişte: ofis adı + içerik (ör. "2 açık, 1 demli") + sabır barı.
- Masanın yanında **E**: uygun bardaklar teslim edilir.
- **Bardak başına bahşiş** = `5₺ × doluluk² × sıcaklık × renk`
  - sıcaklık = (T − 40) / (75 − 40), 0-1 arası
  - renk: doğru tip 1,0, tavşan kanı 1,2, yanlış tip 0,4
- **Hız primi:** sipariş 25 sn içinde tamamlanırsa +%50.
- **Gösteri bahşişi:** son 6 sn içinde, masaya 4 m yakınken Fırıldak yaptıysan ×1,5.
- Kırılan bardak: −10₺. Süresi dolan sipariş: o ofis bir sonraki siparişte bahşişi %20 kısar.
- **Kusursuz teslim** (hiç dökülmemiş, sıcak, doğru renk) dedikodu ofisine yapılırsa bir **dedikodu kartı** düşer.

### 3.5 Gün (vardiya)
- Süre 200 sn. Günlük hedef: 60 / 80 / 100 / 120 / 150 ₺.
- Yıldız: hedef = 1★, hedefin 1,4 katı = 2★, 1,8 katı = 3★.
- Gün sonu: özet → dükkân → sonraki günün notu.

### 3.6 Yükseltmeler (dükkân)
| Yükseltme | Etki | Fiyat |
|---|---|---|
| Kaymaz Ayakkabı | Kaygan zeminde ve gölcüklerde %60 daha az kayma | 60₺ |
| Usta Bileği | Tepsi sönümlemesi +%35 | 90₺ |
| Büyük Tepsi I / II | Kapasite 3 → 4 → 5 bardak | 80₺ / 140₺ |
| Termos Demlik | Çay %40 daha yavaş soğur | 70₺ |

### 3.7 Modlar
| Mod | İçerik |
|---|---|
| Hikâye | 5 gün + final seçimi |
| Serbest Vardiya | Açılmış herhangi bir kat, hikâyesiz |
| Günlük Mücadele | Tarihe göre sabit tohum: herkes aynı siparişleri alır. En iyi skor kaydedilir (Steam liderlik tablosuna hazır) |

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
| 0.1 (bu sürüm, oynanabilir) | 5 gün, tüm engeller, sipariş/bahşiş, dedikodu ve 3 son, dükkân, Serbest Vardiya, Günlük Mücadele, TR/EN, sentez ses ve müzik |
| 0.2 | Oyun kolu desteği, ayarlar menüsü genişletme, playtest dengeleme |
| 1.0 (Steam) | Electron paketi, Steam başarımları ve liderlik tablosu, kapsül görselleri, fragman |
| 1.1 | **Çay Ocağı co-op:** 2-4 kişi online, biri demler diğerleri dağıtır, yakınlık sesli sohbeti |

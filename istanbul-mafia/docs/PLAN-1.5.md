# İstanbul Mafya 1.5 — İş Planı

Kaynak: 1.4.0 sonrası oyuncu geri bildirimi ve 5 fotoğraf. Çalışma yöntemi: `BEYIN.md`. Altın kural: `CLAUDE.md`.
Her madde dört satırdır: **belirti · kök neden ya da ipucu · kabul kriteri · test**. Kabul kriteri sağlanmadan madde bitmiş sayılmaz.

## 0. Fotoğraf teşhisleri

| Foto | Görünen | Teşhis | Durum |
|---|---|---|---|
| 1 | Gece; cephe bembeyaz, lamba çevresinde dev parlama, gökyüzü kahverengi | Lamba ışıkları her yöne yayan nokta ışık (`world/lights.js`: `LAMP_I = 38`, sönüm 1,7). Lambaya 1,5 m'deki cephe ~19 birim, 8 m'deki yol ~1,1 birim ışık alıyor; albedo farkıyla cephe yoldan ~150 kat parlak. Üstüne gece pozlaması 1,3 ve parlama | Dalga 1 · M1, M2 |
| 2 | Tüm ekran kırmızı çerçeve içinde siyah | Tuval tamamen siyah, üstünde hasar göstergesi. Siyah ekran hatası (aşağıda) | **1.4.1'de düzeltildi** |
| 3, 4 | Ekranın büyük kısmı siyah, sağda düz kenarlı görünür şerit; konuşma balonları siyahın üstünde | Aynı hata: taşan piksel parlama bulanıklığıyla düz kenarlı dev dikdörtgene yayılıyor | **1.4.1'de düzeltildi** |
| 5 | İri pikseller (95 FPS'e rağmen), yol karanlık ve mavi benekli, cepheler beyaz, karakter kaba | (a) Çözünürlük ölçeği dipte kalmış, (b) piksel oranı yerel çözünürlüğün altında, (c) foto 1'deki ışık sorunu, (d) asfalt parıltısı gece fazla | (a)(b) **1.4.1'de düzeltildi**; (c)(d) M1, M10 |

### Siyah ekranın kök nedeni (kanıtlı)

Sahne yarı-float tampona çizilir; en büyük değer 65504'tür. Daha parlak bir piksel (yüzeye çok yakın far/lamba yansıması,
üst üste binen parlak parçacık, patlama çekirdeği) Inf/NaN olur. Parlama bulanıklığı bu tek pikseli tüm ekrana yayar,
ton eşleme sonucu siyaha çevirir. `scripts/test/blackscreen-steps.js` bunu yeniden üretir: düzeltmeden önce ekranın
**%100'ü siyah**, düzeltmeden sonra **%0**.

Bu hata daha önce Galata görünümünde teşhis edilmiş, düzeltmesi bir çalışma dalında kalmış ve ana dala hiç
birleştirilmemişti. Ders `BEYIN.md` 9. bölüme eklenecek: *dalga sonunda birleştirilmemiş dal kalmadığını denetle.*

Düzeltme iki katmanlıdır:
1. Bütün yerleşik malzemelerin çıktısı kaynağında [0, 64] aralığına kırpılır (`main.js`, `ShaderChunk.fog_fragment`).
2. Parlamadan önce temizleme geçişi NaN'ı sıfırlar, taşmayı kırpar (`world/postfx.js`, `clean`).

Açık kalan: gerçek oyundaki taşmanın **hangi kaynaktan** geldiği test ortamında yakalanamadı (gece 5 yıldız, 14 örnek, taşma yok).
Adaylar: yakın yüzeye vuran araç farı (`HEAD_I = 260`), patlama/namlu parlaması, helikopter roketi. Özel shader kullanan
malzemeler (parçacık, su, gökyüzü, ışık lekeleri) kaynağında kırpılmıyor; bunlar M7'de denetlenecek.

## 1. Dalga 0 — 1.4.1 acil düzeltme (bitti)

| Düzeltme | Kök neden | Kanıt |
|---|---|---|
| Siyah ekran | Yukarıda | `blackscreen-steps.js`: %100 → %0 |
| İri piksel / bulanık görüntü | `PerfGovernor`: ölçek ancak "iş süresi < 9,2 ms" iken yükseliyordu. 144 Hz ekranda ya da VSync kapalıyken iş süresi ≈ kare süresi olduğundan 95 FPS'te bile koşul sağlanmıyor, ölçek dipte (0,6) kalıyordu | Koşul düzeltildi: ≥ ~75 FPS'te ölçek geri yükselir. Gerçek makinede doğrulanacak |
| Yerel çözünürlüğün altında çizim | Piksel oranı sınırı Orta'da 1 idi; Windows ekran ölçeği %125–150 iken görüntü yerelin %67–80'ine iniyordu | Orta ve üstü yerel çözünürlükte çizer; Düşük %85. Gerçek makinede doğrulanacak |

**Kullanıcıdan istenen doğrulama (1.4.1):** gece helikopter gelince ekran kararıyor mu · görüntü keskinleşti mi · FPS kaç.

## 2. Dalga 1 — Motor ve hareket (temel; önce bu)

### Ekip M — Motor ve Işık
Dosyalar: `world/lights.js`, `world/postfx.js`, `world/sky.js`, `world/shaders.js` (ışık kısımları), `ui/settings.js` (Performans sekmesi),
yeni `core/diag.js`; `main.js` ve `entities/player.js` içinde `[motor]` etiketli kancalar.

- **M1 Gece aşırı parlaklık.** Belirti: foto 1 ve 5. Kök neden: tabloda. Çözüm yönü: lamba ışığı aşağı bakan spot (ya da zemin ışık lekesi);
  şiddet, gece pozlaması ve parlama ölçümle ayarlanır; ışık sayısı sabit kalır.
  Kabul (gece sokak sahnesi, ekran parlaklığı 0–255): lamba altı kaldırım 90–170 · iki lamba arası yol 25–70 · cephe alt 3 m ≤ 190 ·
  cephe üstü ≤ 110 · doymuş (> 250) piksel oranı ≤ %1,5. Test: `sky-steps.js` benzeri ölçüm (`light2-steps.js`).
- **M2 Gece gökyüzü kahverengi.** İpucu: `sky.js` gece şehir parıltısı tonu × pozlama. Kabul: zenit parlaklığı ≤ 30 ve mavi baskın (B > R); yıldızlar görünür.
- **M3 Araç farları.** Kabul: far 40 m ilerideki yolu aydınlatır (≥ 40); 5 m öndeki duvar doymaz (≤ 235); karşıdan gelen far ekranı kaplamaz.
- **M4 Gece performansı.** Önce ölç: aynı noktada gündüz/gece çizim çağrısı, üçgen, mantık süresi; gece katmanları (ışık lekeleri, haleler, far konileri)
  tek tek kapatılarak fark. Kabul: gece çizim çağrısı ≤ gündüz + %10; ışık sayısı kalite başına gerekçeli.
- **M5 Tanılama ekranı (F3) ve rapor.** Neden: gerçek FPS burada ölçülemiyor; kullanıcının makinesinden veri gerekir.
  İçerik: FPS p50/p95, ekran kartı adı, çözünürlük/piksel oranı/ölçek, çizim çağrısı, üçgen, ışık sayısı, varsa ekran kartı süresi;
  alt sistem anahtarları (parlama, gölge, gece ışıkları, parçacık, yoğunluk). "Rapor kaydet" → Belgeler/IstanbulMafya/tanilama-<tarih>.json.
  Kabul: test ortamında rapor dosyası oluşur, alanlar dolu.
- **M6 Duvarın içini/arkasını gösteren kamera.** Kök neden: yaya kamerası tek ışınla korunuyor (`player.updateCamera`), near 0,15; near düzleminin köşeleri duvara giriyor.
  Çözüm yönü: merkez + 4 köşe ışını ya da 0,3 m küre; near 0,1; kol < 0,7 m iken oyuncu modeli soluklaşır.
  Kabul: 12 farklı duvara yaslanıp kamera 360° çevrildiğinde kamera hiçbir çarpışma kutusunun içinde kalmaz (0 ihlal). Test: `camclip-steps.js`.
- **M7 Helikopter projektörü ve özel shader taraması.** Projektör gerçek spot ışık olur (sabit spot havuzundan 1 tane). Özel shader'lı malzemelerin
  (parçacık, su, gökyüzü, ışık lekesi, izli mermi) çıktısı kırpılır. Kabul: gece helikopter senaryosunda siyah piksel oranı ≤ temel + %5; `blackscreen-steps.js` geçer.
- **M8 Yayaya çarpınca takılma.** Önce ölç: yeni sonda, 20 sn'de 10 yayaya 12 m/s ile çarpma, adım süresi p95/en kötü.
  Adaylar: ilk kullanımda çığlık/konuşma sentezi · kan/parçacık patlamasında bellek ayırma · kanun tepkisinde araç/ekip modeli üretimi · toplu yol bulma.
  Kabul: p95 ≤ 8 ms, en kötü ≤ 33 ms.
- **M9 Parlama maliyeti.** Ölçümle: gerekirse daha az kademe / yarım çözünürlük. Kabul: görsel fark kabul edilebilir, tanılama raporunda süre düşer.
- **M10 Asfaltta gece mavi benekler.** İpucu: `shaders.js` asfalt parıltısı ay ışığıyla aşırı. Kabul: gece yol dokusunda benek kontrastı gündüzün ≤ 1,5 katı.

### Ekip H — Hareket ve Etkileşim
Dosyalar: `entities/player.js` (hareket), `game/carjack.js`, `entities/boats.js`, `world/ships_moored.js`, yeni `entities/mantle.js`;
`entities/character.js` ve `entities/vehicles.js` içinde `[hareket]` etiketli kancalar.

- **H1 Duvara tutunup aşma.** Belirti: karakter duvardan atlayamıyor. Kabul: 1,5 / 2,0 / 2,5 m duvarlarda zıpla → tutun → çek → aş → in (1,2–2,2 sn);
  3 m duvar aşılamaz; askeri duvar reddedilir (`noClimb`); eller üst kenara ≤ 8 cm. Test: `mantle-steps.js`.
- **H2 Araç gaspında kapının içinden geçme.** Çözüm yönü: oyuncu kapının süpürdüğü yayın dışında (B direği yanında) durur; kapı açılır, sürücü çekilir, oyuncu koltuğa kayar.
  Kabul: sekans boyunca oyuncu kapsülü ile kapı kutusu 0 karede kesişir; süre ≤ 2,2 sn. Test: `law-steps.js` 8. bölüme ek.
- **H3 Yayaya çarpma efekti.** Hıza göre: < 4 m/s sendeleme · 4–10 m/s kaputa yatıp yana yuvarlanma · > 10 m/s savrulma. Ses, kamera sarsıntısı, kaputta ezik.
  Kabul: yaya araç gövdesinin içinden geçmez; 12 m/s'de savrulma 4–9 m; aynı karede ses + sarsıntı + animasyon.
- **H4 Teknede yürüme.** Belirti: sürmeyi bırakınca karakter denize düşüyor, teknede gezinemiyor. Çözüm yönü: güverte teknenin yerel koordinatında yürünebilir platform.
  Kabul: yatı sür → F → oyuncu güvertede; tekne 10 sn sürüklenirken güvertede kalır; güvertede 5 m yürür; küpeşteden atlayınca suya girer. Test: `sea-steps.js`'e ek.
- **H5 Tekne hızları.** Belirti: çok yavaş. Hedef azami hız: sürat teknesi 24–28 m/s · motor yat 14–17 · mega yat 9–11 · balıkçı 5–6. Trafik gemileri değişmez.
  Kabul: ölçülen hızlar aralıkta; burun kalkması ve dümen suyu hıza bağlı.
- **H6 Sürüş cilası.** Kullanıcı: "fena değil ama gelişmeli". Direksiyon merkezleme, yüksek hızda sekme yok, çarpışma sonrası toparlanma.
  Kabul: `drivefeel-steps.js` değerleri korunur; his için kullanıcı geri bildirimi istenir.

## 3. Dalga 2 — Çatışma ve modeller

### Ekip C — Çatışma ve Kanun
Dosyalar: `game/combat.js`, `game/weapons.js`, `game/body.js`, `ui/reticle.js`, `game/law.js`, `game/wanted.js`, `world/animals.js` (saldırı engeli);
`entities/npc.js` içinde yalnızca çatışma kararları.

- **C1 Silah hissi (klasik rekabetçi FPS standardı).** Silah başına veri satırı: ilk mermi isabeti, seri atışta sabit tepme deseni (yukarı + yana), sonra saçılma;
  hareket/zıplamada isabet düşer, çömelince artar; toparlanma süresi. Sağ tık silah türüne göre: tabanca/hafif makineli hafif yakınlaşma, tüfek orta,
  keskin nişancı iki kademeli dürbün (siyah maske, ince artı, mesafe çizgileri; dürbünsüz atış dağınık).
  Kabul: aynı tohumla 30 mermilik desen birebir tekrarlanır; ilk mermi sapması ≤ 0,2°; 10. mermi dikey sapması tablodaki değere ±%10; dürbünde 2 kademe. Test: `recoil-steps.js`.
- **C2 Silah 3B modelleri.** Namlu, gövde, kabza, şarjör, dipçik, nişangâh, ray, dürbün; gerçekçi ölçü tablosu; tutuş noktaları ellere oturur. Kabul: silah vitrini (2 kare) + ölçü denetimi.
- **C3 Polis müdahalesi.** Sokakta birine saldırırken devriye aracı gelir, 12–20 m'de durur, megafon "Dur! Polis! Silahını bırak!", ekip araç arkasına mevzilenir,
  2–3 sn uyarıdan sonra ateş. Kabul: saldırıdan sonra ≤ 25 sn'de araç ≤ 25 m'de; ilk atıştan önce uyarı; ateş anında polislerin ≥ %70'i araç arkasında.
- **C4 Atlatma zorluğu.** Görüş dışı süreleri 9/16/26/36/48 → 14/24/36/50/65 sn; devriye araçları son görülen bölgeyi tarar.
  Kabul: 1★ ortanca kaçış 12–18 sn; 3★ 30–45 sn.
- **C5 Rekabet ve heyecan.** Bastırma ateşi + kanattan sarma; isabet mesafe ve zorluğa bağlı; Normal'de gelen hasar 0,40 → 0,50, can dolumu 2 sn daha geç.
  Kabul: 3★ Normal'de açık alanda duran oyuncu 12–20 sn'de ölür; siper kullanan ≥ 90 sn dayanır.
- **C6 Çatışma hataları avı.** Kullanıcı ayrıntı vermedi. Senaryo listesi: yakın dövüş, siperden ateş, araçtan ateş, iç mekân, 5★. Bulunan her hata belirti + kök nedenle raporlanır.
- **C7 Helikopter saldırıları.** Yaklaş-tara-çekil döngüsü; top atışı izli mermiyle yerde yürür; roketten önce kilit sesi; vurulunca duman ve dönerek düşüş.
  Kabul: atışların ≥ %60'ı 1,5 sn önceden okunur (iz ya da ses).
- **C8 Hayvanlara saldırı yok.** Silah, yumruk, bıçak ve araç hayvana hasar vermez; nişan hayvandayken tetik çalışmaz, yakın dövüş iptal olur.
  Ekranda büyük uyarı: **"GERÇEKTEN MASUM BİR HAYVANA ZARAR MI VERECEKSİN?"** ve dönen farkındalık cümleleri (ör. "Sokak hayvanları bu şehrin en eski sakinleri.",
  "Onlar konuşamaz; sesleri sen ol.", "Bir kap su, bir kap mama hayat kurtarır."). Önceki dalgadaki "sıyrılan hayvan kanar/topallar" davranışı kaldırılır.
  Kabul: kediye 20 atış ve 5 yumruk → can değişmez, uyarı çıkar; üstüne sürülen araçtan hayvan kaçar.

### Ekip K — Karakter ve Model Atölyesi
Dosyalar: `entities/character.js`, `charParts.js`, `charTex.js`, `entities/aircraft.js`, `world/ships_yachts.js`, konak (iç + dış);
`entities/vehicles.js` içinde `[model]` etiketli gövde üreticileri.

- **K1 Kahraman kalitesi.** Ana karakter, Reis Baba, Kenan, Leyla, Cin Ali, korumalar: yakın planda 35–60 bin üçgen; göz kapağı, kaş, kirpik, dudak; saç hacmi;
  parmaklar; kıyafet kıvrımı; ayırt edici siluet (Baba: yaşlı, bıyıklı, takım elbise, tespih; korumalar: koyu takım, kulaklık).
  Kabul: 6 karakter yakın plan vitrin (2 kare); sıradan NPC bütçesi değişmez (`charperf`).
- **K2 Baba'nın konağı.** Boğaz konağı: ahşap cephe, cumba, saçak, avlu; iç: çalışma odası, salon, avize, halı. Kabul: 2 kare + çarpışma denetimi.
- **K3 Araç modelleri tutarlılığı.** Ölçü tablosu (dingil mesafesi, iz genişliği, teker çapı, yükseklik) gerçekçi aralıkta; panel çizgileri, farlar, aynalar, jantlar.
  Kabul: otomatik oran denetimi (her tip aralıkta) + araç sırası görüntüsü.
- **K4 Tekne/gemi model hataları.** 6 açıdan görüntüyle denetim: ters yüz, delik, üst üste binen yüzey, havada parça. Kabul: bulunan hata listesi ve düzeltme.
- **K5 Helikopter modelleri** (sivil + saldırı). Gövde hatları, rotor göbeği, kuyruk rotoru, iniş takımı, kokpit, silah kanatçıkları. Kabul: 2 kare.

## 4. Dalga 3 — Villa ve dünya

### Ekip V — Villa ve Hava
Dosyalar: yeni `world/villa.js`, yeni `game/villa.js`, `entities/aircraft.js` (uçuş), `world/map.js` (parsel).

- **V1 Oyuncunun villası.** 10 dönüm (≈ 100 × 100 m). Çevre duvarı + ferforje çit + otomatik kapı + bekçi kulübesi; fıskiyeli araç yolu; modern-klasik 3 katlı ana bina
  (geniş cam, teras, sütunlu giriş), iç mekân (salon, yatak odası = kayıt, gardırop, ofis); sonsuzluk havuzu, havuz evi, şezlonglar; çim, serviler, bahçe aydınlatması;
  6 araçlık galeri (4 kurgusal lüks spor araba); 2 helikopter pisti. Haritada "Villan". Konum: Boğaz yamacında dünyayı en az bozan parsel.
  Kabul: parsel 9,5–10,5 bin m²; çarpışma denetimi 0 eksik; `villa-steps.js`: kapıdan gir, galeriden araç al, havuzda yüz, yatakta kayıt, helikoptere bin.
- **V2 Korumalar.** 8 koruma (kapı 2, çevre 4, bina 2); "Hoş geldin patron"; villaya saldıranla çatışır. Kabul: devriye rotaları ve saldırı tepkisi testi.
- **V3 Helikopterler.** Sivil ve saldırı (top + roket). Kontrol: W/S eğim, A/D dönüş, Space/Ctrl yüksel/alçal, fare bakış; asılı kalma yardımı.
  Kabul: kalkış-uçuş-iniş testi; saldırı helikopteri hedefe hasar verir.
- **V4 Uçuşta performans.** İrtifaya göre ayrıntı düzeyi ve yoğunluk. Kabul: uçuşta mantık süresi ≤ yerdeki + %20.

### Ekip D — Dünya ve Trafik
Dosyalar: `world/mountain.js`, `world/terrain.js`, `world/traffic_ai.js`, `ui/bigmap.js`, `game/bounties.js`, görev işaretleri.

- **D1 Dağ.** Belirti: "dağa benzemiyor, oyunla alakasız". Önce 3 açıdan görüntüyle sorunu yaz (ölçek, doku tekrarı, siluet, şehirle geçiş).
  Hedef: katmanlı sırtlar, erozyon olukları, eğime göre kaya yüzü, ağaç sınırı, uzak sis, etekte yumuşak geçiş. Kabul: 3 kare + kullanıcı onayı.
- **D2 Trafik ve park yoğunluğu.** Orta ayarda hareketli 30 → 45, park 18 → 40 (cadde kenarında sıra). Kabul: mantık p95 ≤ 6 ms; bina içinde araç yok.
- **D3 Görev işaretleri.** Belirti: Baba'nın görevleri haritada görünmüyor, yanıp sönüp kayboluyor. İpucu: `ui/bigmap.js` çizimi `blinkUntil` / `mk.blink` süresine bağlı.
  Kabul: aktif hedef haritada ve mini haritada **sürekli** görünür (iğne + nabız halkası), rota otomatik çizilir, mini harita kenarında yön oku ve mesafe.
  Test: `story2-steps.js`: görev kabulünden bitişine her adımda görünür hedef işareti.
- **D4 Ödül avı oku.** Bölgeye girince mini haritada daire; hedef görüş hattındayken tepesinde ok + ekran kenarı oku + mesafe. Kabul: hedef 60 m içinde ve görünürken ok var.

## 5. Sıra, bütçe, kurallar

- Sıra: **Dalga 1 (M + H) → Dalga 2 (C + K) → Dalga 3 (V + D).** Aynı anda en çok 2 ekip. D3 ve D4 küçük işlerdir; baş mühendis Dalga 1 sırasında kendi yapar.
- Her dalga sonunda sürüm çıkar (1.5.0-a, -b, …) ve kullanıcı gerçek makinede dener. Geri bildirim sonraki dalganın başına eklenir.
- Ekip bütçesi: ~150 araç çağrısı, en çok 4 ekran görüntüsü. Testler tek tek; çökme olursa bir tekrar.
- Her madde bitince commit. Ekip raporu: madde · durum · sayı · bilinen sorun · doğrulanamayan.
- Birleşimden sonra baş mühendis kilit testleri kendisi koşar; dalga sonunda **birleştirilmemiş dal kalmadığını** denetler.

## 6. Kullanıcıya açık sorular (iş bunları beklemez, varsayılanla ilerler)

1. "Çatışma bugları": hangi durumda ne oluyor? (Varsayılan: C6 hata avı.)
2. Villa konumu: Boğaz kıyısı mı, orman yamacı mı? (Varsayılan: Boğaz yamacı.)
3. Araba sürüşünde en çok neyi beğenmedin: direksiyon, hızlanma, fren, kamera? (Varsayılan: H6.)

# Plan 2.0 — Kullanıcı geri bildirimi (1.9.0 sonrası)

Hareket ekibi (w9) bitip 1.10.0 birleştirildikten sonra başlar. Sıra BEYIN §4: oyunu bozan → hissi bozan → eksik özellik → cila.
Her madde: belirti (kullanıcının sözü) · kabul kriteri · not.

## Dalga A — Oyunu durduran hatalar (baş mühendis kendisi teşhis eder)
- **A1 Çarpınca donma.** "Arabayla bir yere çarptığımda oyun ekranı donuyor, buna benzer sorunlar var." Kabul: 50 km/s ve 120 km/s'de duvara/araca/direğe 20 çarpma, en kötü kare ≤ 50 ms, sonsuz döngü/NaN yok. İlk şüpheliler: yeni araç gövdesinin hasar/kopma yolu, cam kırılma parçacıkları, yeni çarpma sesi sentezi, NaN konum.
- **A2 5 yıldızda donma.** "Tank, asker, helikopter gelince FPS anında düşüyor ve oyun tamamen donuyor." Kabul: 5★ 120 sn, en kötü kare ≤ 80 ms, p95 ≤ 25 ms (test ortamında adım süresi), donma 0. Şüpheliler: aynı karede çok sayıda yeni gerçekçi gövde (MH birleştirme), tank mermisi/patlama, mermi izi ve ses düğümü sızıntısı, yol bulma patlaması.
- **A3 Genel donma avı.** Kare süresi gözcüsü: 200 ms'yi aşan kareyi sistem adıyla kaydet (F3 tanılama), tüm büyük senaryolarda koştur.

## Dalga B — Hissi bozanlar
- **B1 Araba buz pistinde.** "Yola tutunmuyor, aşırı kayıyor, fren yapamıyor, drift yapamıyor." Kabul: 100→0 ≤ 28 m düz çizgide sapmasız; 60 km/s 50 m yarıçaplı virajda kayma açısı ≤ 4°; el freniyle kontrollü drift ve toparlanma. Önce "ne değişti?": 1.5'teki fren değişikliği ve araç ekibinin teker/dingil değişiklikleri (`CARS`) ölçülerek karşılaştırılacak.
- **B2 Silah tutuşu ters.** "Silahları ve bıçağı ters tutuyor, iki el çarpılmış gibi; AK-47 çok saçma; önceki sürümlerde düzgündü." Kök neden adayı: gerçekçi gövde eşlemesinde el kemiği dönüşü (`pack-mh.py` `rig_of` içinde el ekseni, `roty(-th)`). Kabul: tabanca, AK, bıçak, keskin nişancı için oyuncu ve NPC ellerinin kabzada olduğu görüntü (3/4 ve yan).
- **B3 Araç kapısı hayalet.** "F'ye basınca bir hover gibi başka bir kapı açılıyor, gerçek kapı yerinde duruyor." Kök neden adayı: yeni gövde kabuğu kapıyı da çiziyor, `setDoor` eski ayrı kapı ağını döndürüyor. Kabul: kapı açıkken gövdede kapı boşluğu var, ikinci kapı yok.
- **B4 Tekne.** "Kullanmayı bırakınca denize düşüyorum, teknede gezinemiyorum" (w9 H4 kapsamında; birleşimden sonra doğrula). "Tekneler yansımalı, içi boş görünüyor, katmanlar hatalı": saydam/yansıma malzemesi ve çizim sırası.
- **B5 Sesler.** "Silah sesleri çok kötü, mermi sesleri, araba çarpışma sesi çok kötü." Ölçerek değil, önce kulağa uygun hazır CC0 ses araştır (lisansı resmî kaynaktan); yoksa sentezi yeniden yaz.
- **B6 Keskin nişancı dürbünü.** "Aynı GTA 5'teki gibi": tam ekran siyah dürbün çerçevesi, ince çizgili nişangâh, fare tekeriyle kademesiz yakınlaştırma, nefes tutma.
- **B7 Hareket animasyonu.** "Koşma, eğilme, zıplama ve duvara tırmanma çok kötü; askeri duvara tırmanmıyor." Gerçekçi gövdede yürüyüş/koşu pozları yeniden ayar; askeri duvar için ayrı karar (oyuncu isteği: tırmanılsın).

## Dalga C — Eksik özellik
- **C1 Hasar.** Araçta mermi izleri (kaporta çıkartması, havuzlu) ve kaza ile kaporta ezilmesi (köşe deformasyonu), donma olmadan.
- **C2 Kıyafetler.** "Şapka, bere, gözlük, saat, şort hatalı; şort giyilmiyor; tamamı doğru giyilebilir olmalı." Her gardırop seçeneği için atölye görüntüsü; gerçekçi gövdede eşlemesi olmayan seçenek (şort, etek, bere) için CC0 parça ya da doğru eşleme.
- **C3 Şehir canlılığı.** Trafik ↑, park eden araç ↑, spor araba oranı ↑, yaya ↑ (yürüyen, koşan, işe giden). Otobüs durakları: yolcular bekler, otobüs durur, kapı açılır, yolcular biner/iner. Kabul: mantık p95 ≤ 6 ms.
- **C4 Sürücü zekâsı.** "Çok aptal araba kullanıyorlar": şerit takibi, önündekiyle mesafe, kavşakta öncelik, engelden kaçınma, park etme.
- **C5 Harita.** 3B görünümlü harita, belirgin simgeler (villa, evler, güvenli ev, kız arkadaş, görev), sağdaki gösterge listesi net.
- **C6 3B sarı ok.** Kız arkadaş, ödül avı hedefi ve suçluların üstünde aşağı yukarı hareket eden sarı ok (w9 D4'ün genişletilmesi).

## Dalga D — Dünya cilası
- **D1 Simge yapılar.** Kız Kulesi ve benzerleri kötü; CC0 model kaynağı araştırılır (Poly Haven'da yok; başka CC0 kaynak lisansıyla), yoksa kodla yeniden.
- **D2 Minare yolda.** Bazı camilerin minareleri yolun ortasına taşıyor: yerleşimde yol çakışma denetimi.
- **D3 Köprü ayakları.** Beton ayaklar içi boş, karakter içinden geçiyor: kapalı geometri + çarpışma.
- **D4 Çok katlı ev içi.** Yalnız 1. kat var: merdivenle üst katlar.
- **D5 Yangın merdiveni ve çatı.** Düz çatılı evlerde içten ve dıştan çatıya çıkış, çatıdan çatıya atlama.

## Değişmez kural
"Bunlar olurken asla kasma, donma olmamalı." Her madde kare süresi ölçümüyle teslim edilir (BEYIN §3.2).

## Ek — 1.11.0 sonrası geri bildirim (öncelik sırasıyla)
**Bozanlar (önce):**
- K1 Gasp kapısı hâlâ saçma açılıyor; binip kapıyı kapatınca gövdenin sol yanı kayboluyor, içi görünüyor (1.11 kapı deliği düzeltmesinin yan etkisi olabilir).
- K2 Villa havuzuna giren çıkamıyor (zıplama/tırmanma yok).
- K3 Polis aracı ve helikopter sesi var ama kendileri görünmüyor; helikopter projektörü görünmeyen helikopterden ve binaların arkasından geliyor (görüş hattı yok).
- K4 Gemi/tekne: saydam, arkası görünüyor, beyaz katman (malzeme/çizim sırası).
- K5 Gizli oda ve Baba'nın evlerinde kapı/iç mekân çok karanlık.
**His:**
- K6 Yürüme, koşma, zıplama, eğilme (gerçek çömelme), tırmanma, yumruk: PUBG gerçekçiliği hedef. Askeri bölgeye yaya sızma: duvar/çit tırmanılabilir.
- K7 Araç yol tutuşu, viraj, fren (B1); motosiklet de. Vites geçişinde egzozdan alev.
- K8 Silah tutuşu tüm silahlarda (PUBG gibi), keskin nişancı dürbünü (GTA 5 gibi).
- K9 Saldırı helikopteri: sağ tık nişan + top/roket ayrı, füze kilitleme ve güdüm (hedef takip).
- K10 Uyarı ve "öldün" yazıları: yarı saydam siyah şerit + sarı yazı (GTA 5 tarzı).
**İçerik:**
- K11 Villa: kısa çim, havuz ve mimari cilası, iç mimar elinden iç tasarım, merdivenli üst katlar, televizyonda canlı güvenlik kamerası.
- K12 Camlardan dışarısı görünsün (bütün binalar).
- K13 Araç tasarımı: spor ızgaralar, gerçek arabalara yakın görünüm (marka adı ve logo yok), otobüs/kamyon/motosiklet.
- K14 Trafik ve park eden araç artışı; otobüs durakları (Plan C3); harita (C5); 3B sarı ok (C6).
- K15 Karakter yaratıcısı: bütün giysiler doğru (şort, saat, şapka, bere, gözlük yüze oturur, spor ayakkabı); yaratıcı ekranı aydınlık, mağaza gibi 3B arka plan; açılış ekranı.
- K16 Şehir: gökdelen bölgesi mega şehir, kuşbakışında karton görünümlü binalar, balkona gömülü tabelalar, askeri bölgede deniz-yol kenarına zincir çit, daha ferah yollar.
- K17 Hız göstergesi: yuvarlak, gerçek araç göstergesi gibi + vites.
**Ayar (küçük):** öldürülenden düşen para ↑, görev ödülleri ↑, kırmızı ışık cezası ÷2, tekne hızı ↑.

## Ek 2 — 1.12 oynanışı sonrası (sahibi: "ayrı ayrı exe verme; hepsini bitir, en sonda tek tam exe ver")
- E1 Polis "teslim ol" sonrası uzaklaşınca eller havada kalıyor → DÜZELTİLDİ (wanted.js: tutuklama yoksa eller iner).
- E2 Dağda araç kullanılamıyor; dağın her noktasına araçla ve yürüyerek gidilebilmeli → araçlar arazi yüksekliğini okumuyordu, DÜZELTİLDİ (doğrulama: mountain-steps.js).
- E3 Yürüme sesi çok kötü; silah, mermi, çarpışma sesleri (önceki liste) → ses ekibi.
- E4 Deniz araçları hâlâ saydam görünüyor → stüdyo ve oyun içi görüntüde yakalanamadı; sahibinden ekran görüntüsü istenecek, bu arada su/çizim sırası incelenir.
- E5 Silah tutuşu, saldırı, zıplama, eğilme hâlâ absürt (1.12'de; 1.13 düzeltmeleri henüz sahibine gitmedi).
- E6 Vurulan NPC'ler saçma çöküyor, yarayı tutmuyor; arabayla ezme saçma; patlamada karakter düz düşüp düz kalkıyor → vurulma/devrilme/kalkma tepkileri (yaraya el, sendeleme, yuvarlanma, doğal kalkış).
- E7 Görev takibi zayıf: görev kabulünde canlı yönlendirme (hedef işareti, rota, mesafe, adım yazısı, 3B sarı ok).

# Görev Ş — Şehir: akış altyapısı, 6 × 6 km İstanbul, otoyollar, tüneller, üst geçitler, yokuşlar, semtler, sanayi, otogar, stadyum, havalimanı

Çalışma klasörü ve dal: başlatırken verilir (`.claude/worktrees/w19-sehir`, dal `w19-sehir`). Oyun `istanbul-mafia/` altında.
Önce oku: `CLAUDE.md`, `BEYIN.md` (tamamı; §3.2 performans), `ARCHITECTURE.md`, `docs/PLAN-3.0.md` (§0 dürüst ölçek notu, Ş0–Ş5).
Referanslar: `docs/galeri/ref3/ist0.jpg`, `ist1.jpg`, `ist2.jpg` (Boğaz, havalimanı, Topkapı, Ayasofya, Galata, Kız Kulesi, şehir dokusu, 3B maketler).

## Neden (oyunun sahibinin sözleri)
- "Şehir çok küçük, ada gibi. Geniş yollar, otobanlar (E-5), üst geçitler, tüneller, farklı semtler, bayırlar, dar ve geniş sokaklar, bar sokakları, Akaretler, Beşiktaş."
- "Stadyumlar; havalimanı gerçek boyutta: terminaller, pistler, kule, yürüyen merdivenler, yolcu uçakları. Bütün sanayiler gerçek yerlerinde, otogar, reklam panoları, yol kenarı detayları."
- "Daha çok insan ve trafik. Daha çok tamirci, bakkal, market. Binalar, gökdelenler estetik ve gerçek İstanbul'a sadık."

## Bugün
- Dünya `WORLD_MIN/MAX = ±1000` (2 × 2 km), `src/world/map.js` semt dikdörtgenleri (`DISTRICTS`), Boğaz x 200–420, Haliç, Marmara z > 820, köprüler, havalimanı
  (`AIRPORT`, doğu kenarı), askerî üs, dağ (`mountain.js`, `terrain.js`, x > 900). Şehrin tamamı açılışta kuruluyor (`city.js`, `buildings.js`, `instancer.js`).

## İşler (sıra önemli: altyapı önce)
0. **Ölçüm ve akış (Ş0).** Bugünkü şehrin km² başına: kurulum süresi, üçgen, çizim çağrısı, GPU/JS belleği, fizik kutusu sayısı. Hücre (ör. 250 m) bazlı kurma/yok etme
   tasarımı: yakın hücreler tam ayrıntı + fizik, orta hücreler düşük ayrıntı, uzak hücreler tek parça siluet; hücre kurulumu karelere bölünür (kare başına ≤ 6 ms), yükleme ekranı yalnız başlangıç hücreleri.
   Trafik/yaya/kanun yalnız etkin hücrelerde. Kabul: 6 × 6 km hedefinde ölçülen bellek ve kare süresi raporu; 120 km/s sürüşte hücre geçişlerinde 100 ms üstü kare 0. Ölçüm kaldırmıyorsa
   hedef boyutu sayıyla öner ve dur (baş mühendise rapor).
1. **Yol omurgası (Ş1).** E-5 ve TEM benzeri otoyollar (2×3–4 şerit, bariyer, bağlantı yolları, gişe yok), üst geçitler (yaya + araç), en az 2 tünel (aydınlatmalı), yokuşlu semt sokakları
   (bayır, merdivenli sokak), dar Beyoğlu sokakları, geniş bulvarlar. Trafik YZ'si (`traffic_ai.js`) otoyola girer/çıkar; navgrid ve fizik uyumlu (CLAUDE.md altın kural 3).
2. **Semtler (Ş2).** Gerçek sıra: Avrupa yakasında Eminönü/Fatih (tarihî yarımada), Beyoğlu/Karaköy/Galata, Beşiktaş (çarşı, Akaretler sıra evleri, bar sokağı), Ortaköy, Bebek, Rumeli Hisarı, Sarıyer;
   kuzeyde Maslak/Levent gökdelenleri; Anadolu'da Üsküdar, Kadıköy (Moda, bar sokağı), Ümraniye/Ataşehir kuleleri; batıda Bakırköy, Zeytinburnu. Her semt: kendi bina tipi, renk, kat, sokak dokusu.
   Simge yapıların arsaları T ekibi için ayrılır (`LANDMARK_PLOTS` dışa aktar: konum, boyut, yön).
3. **Havalimanı (Ş3).** Batıda büyük havalimanı: terminal (içi yürünebilir, check-in, yürüyen merdiven, kapılar), en az 2 pist (gerçek ≈ 3–4 km yerine oyun ölçeğinde ≥ 1,2 km), kule, apron, körükler,
   park etmiş ve iniş/kalkış yapan yolcu uçakları (kurgusal havayolu). Ana yol bağlantısı.
4. **Sanayi, otogar, stadyum, dükkânlar (Ş4).** Sanayi bölgeleri (tamirciler, depolar, tırlar), otogar (otobüs peronları), 2 stadyum (Beşiktaş ve Kadıköy konumunda, kurgusal ad), panolar (kurgusal reklamlar),
   yol kenarı: durak, kiosk, çöp, trafik levhası. Tamirci/bakkal/market sayısı ×2 (mevcut `city_shops.js` sistemiyle).
5. **Yoğunluk (Ş5).** Yaya ve trafik sayısı semt yoğunluğuna göre; ölçülü (akış sayesinde etkin alanda daha çok).

## Sahiplik
- Sahip: `src/world/map.js`, `city.js`, `buildings.js`, `instancer.js`, `navgrid.js`, `traffic*.js`, `zones.js`, `locations.js`, `streetprops.js`, `city_shops.js`, `terrain.js` (yeni araziyle uyum), yeni akış dosyaları.
- Dokunma: `landmarks.js` (T ekibi; yalnız arsa ver), karakter, araç fiziği, villa, kanun, arayüz. Mevcut oyun yerleri (villa, marina, liman, emniyet, görev noktaları) korunur ya da koordinat değişirse
  tek bir dönüşüm tablosuyla taşınır ve bütün görev testleri geçer.

## Test, teslim, rapor
- Aynı anda tek tarayıcı. Sonda birer kez: smoke, collision, bridge, story, story2, drivefeel, mountain, villa, freeze (FZ=crash ve wanted), law8.
- İlk 15 dakikada ilk commit; her iş bitince commit; push yok; kota kesilirse "ARA:" commit'i. Commit sonu iki satır (O-oynanis.md'deki gibi).
- Bütçe: Ş0+Ş1 için ~250 araç çağrısı; sonrası ikinci turda. `docs/galeri/s3-*` (≤ 200 KB). Rapor: ölçüm tabloları, iş başına durum, doğrulayamadıkların.

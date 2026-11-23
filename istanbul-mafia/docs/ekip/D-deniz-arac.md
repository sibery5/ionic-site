# Görev D — Deniz ve araç: tekne yansıması, köprü sesi, dalış halkası, kargo gemileri, araç ve helikopter modelleri, fren/tutuş, vites ve egzoz

Çalışma klasörü ve dal: başlatırken verilir (`.claude/worktrees/w18-deniz`, dal `w18-deniz`). Oyun `istanbul-mafia/` altında.
Önce oku: `CLAUDE.md`, `BEYIN.md` (§2, §3.1, §3.2, §8, dersler), `docs/PLAN-3.0.md` (D1–D7), önceki brifler `docs/ekip/K2-arac.md`, `A2-arac-surus.md`.

## Neden (oyunun sahibinin sözleri)
- "Teknede yansıma kısmı görünüyor" (fotoğraflarda: gövdenin bir parçası şeffaf/yansıma gibi). "Köprüden geçerken tık tık ses geliyor."
- "Denize dalınca tuhaf mavimsi bir dalga/halka çıkıyor."
- "15 Temmuz Şehitler Köprüsü'nün altından kargo gemileri geçsin."
- "Bütün araba tasarımları gerçekçi olsun; helikopter modelini geliştir."
- "Frenler ve yol tutuşu hâlâ kötü, buzda gidiyorlar."
- "Vites geçiş sesleri ve egzozdan ateş çıkması daha iyi olsun."

## İpuçları
- Tekne: `src/world/ships*.js`, `src/entities/boats.js`; malzeme ayarı `ships_yachts.js` (cam/jelkot). Atölye `tekne:surat|balikci|yat|megayat`. Önce gerçek oyun kamerasından
  (su yansıması/su gölgelendiricisi açıkken) kare al: "yansıma kısmı" büyük olasılıkla su yüzü gölgelendiricisinin tekne içine çizilmesi ya da yansıma kamerasında tekne gövdesinin
  ters görüntüsü (yansıma düzlemi kırpılmıyor) ya da saydam malzeme sıralaması. Kanıtla, sonra düzelt.
- Köprü "tık tık": tabliye derzleri/tekerlek darbe sesi (`src/core/sfx/`), ya da `groundY` köprü profilinde basamak (`bridge_profile.js`) → süspansiyon sıçraması. Ölç: köprü geçişinde ses tetik sayısı ve y profil sıçraması.
- Dalış halkası: `swim.js` `enterWater` → `P.rings.emit(... 0xbfd8ff)`; halka gölgelendiricisi/renk ve boyut (1,6 × k) sudan taşıyor olabilir.
- Gemiler: `src/world/ships.js` (rota), köprü `BRIDGES[2]` (x 190–435, z ≈ -450). Gemi direk yüksekliği köprü alt kotuna sığmalı.
- Sürüş: `src/entities/vehicles.js` fizik (A2 ekibi tutuşu yaptı; sahibi hâlâ "buz" diyor) — `drivefeel-steps.js`, `drivefeel-node`. ABS'li fren, yanal tutuş eğrisi, el freni.

## İşler
1. **Tekne yansıması (D1)** — kök neden + düzeltme; 4 tekne tipi oyun kamerasından önce/sonra.
2. **Köprü sesi (D2)** ve **dalış halkası (D3)** — kanıt (sayı) + düzeltme. Kabul: köprü geçişinde darbe sesi yalnız gerçek derzlerde (≤ 1/20 m), dalışta halka beyaz-köpük tonunda, ≤ 3 m.
3. **Kargo gemileri ve deniz trafiği (D4)** — Boğaz boyunca iki yönlü en az 3 büyük gemi (konteyner, tanker, dökme yük) + vapur/feribot hatları; köprü altından geçer, birbirine/kıyıya çarpmaz,
   performans: gemi başına ≤ 0,05 ms güncelleme. Kare: köprü altından geçen gemi.
4. **Fren ve tutuş (D6)** — 100 km/s'ten fren mesafesi kuru asfaltta 38–45 m (ölç), 60 km/s'te 90° virajda kayma yok, el freniyle kontrollü kayma; motosiklet ayrı ayar. `drivefeel` geçer.
5. **Araç ve helikopter modelleri (D5)** — kurgusal markalı, gerçek oranlı gövdeler (sedan, hatchback, SUV, spor, ticari, taksi, otobüs, motosiklet, helikopter): ayrıntılı ızgara, far, ayna, jant, kapı çizgisi,
   iç mekân (koltuk, direksiyon). Her model atölyede 4 açıdan kare ile denetlenir. Üçgen bütçesi: araç başına yakın LOD ≤ 12 k.
6. **Vites ve egzoz (D7)** — vites geçişinde kısa devir düşüşü + "kesme" sesi, turbo üfleme, gaz kesilince egzoz patlaması ve kısa alev (yalnız spor/tuning araçlarda), ses ısıtma kuyruğuna eklenir.

## Sahiplik
- Sahip: `src/entities/vehicles.js`, `src/entities/boats.js`, `src/world/ships*.js`, `src/world/bridge_profile.js` (yalnız ses/sıçrama düzeltmesi), `src/entities/swim.js` (dalış efekti), `src/core/sfx/engine.js`, araç atölye katalogu.
- Dokunma: `character.js`, `player.js`, `wanted.js`, villa, şehir kurulumu (`city.js`, `buildings.js`).

## Test, teslim, rapor
- Aynı anda tek tarayıcı (`pgrep -f "play.js|atolye"` boş olana dek bekle). Sonda birer kez: smoke, drivefeel, sea, bridge, collision, heli, freeze (FZ=crash), boatlook.
- İlk 15 dakikada ilk commit; her iş bitince commit; push yok; kota kesilirse "ARA:" commit'i. Commit sonu iki satır (Co-Authored-By, Claude-Session; O-oynanis.md'deki gibi).
- Bütçe ~220 araç çağrısı. `docs/galeri/d-*` (≤ 200 KB). Rapor: iş başına durum, ölçüm, kanıt, doğrulayamadıkların.

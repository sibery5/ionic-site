# Görev K2 — Araç ve helikopter modelleri

Çalışma klasörü: `/home/user/ionic-site/.claude/worktrees/w5-arac` (dal `w5-arac`). Oyun `istanbul-mafia/` altında.
Önce oku: `CLAUDE.md`, `BEYIN.md` (çalışma sistemi; uy), `docs/PLAN-1.5.md` §7.

## Neden
Oyunun sahibi: "arabalar çok kötü, 3D modeller çok kötü; araç tasarımlarını daha tutarlı gerçekçi yap; helikopter tasarımını geliştir."
Önceki ekipler çıktılarına bakmadan "bitti" dedi. Sen farklı çalışacaksın: **görüntüle, bak, düzelt, yeniden görüntüle.**

Baş mühendisin stüdyo görüntülerinde gördükleri:
- **Oran:** sedan 5,00 m uzun, **2,22 m geniş**, 1,46 m yüksek. Gerçek sedan gövdesi 1,82–1,88 m; her şey basık görünüyor.
- **Tekerlek:** gövdeden dışarı taşıyor; gerçek çamurluk kavisi yok. Her arabada tırtıklı arazi lastiği; jantlar kaba.
- **Gövde:** düz kutu ve kama; yüzey bombesi, ışık yakalayan pahlı kenar, kapı çizgisi, kapı kolu yok. Cam çerçeveleri kalın levha.
  Ön ve arka boş: gerçek far camı, ızgara, tampon biçimi, stop lambası yok.
- **Çeşit:** GT 80'ler kaması, SUV düz kutu, polis arabası tepe lambalı sedan.
- **Helikopter** (`hava:helikopter`, 2,2 bin üçgen): çubuk pervaneli oyuncak kapsül. Saldırı helikopteri de benzer.

## Aracın: model atölyesi (`istanbul-mafia/` içinden)
- `node scripts/atolye.js --liste` → kimlikler. Kara: `araba:<tür>` (kartal, hatch3, hatch, taksi, estate, dolmus, sedan, offroad, coupe, suv, cabrio, gt, police, polsuv, bus, swat, bisiklet, motor, kamyon, ambulans, cip, askkamyon, apc, tank). Hava: `hava:helikopter`, `hava:attackHeli`, `hava:jet`, `hava:ucak`.
- `node scripts/atolye.js araba:sedan --gorunus q,s,f,b,t` → `.testout/atolye/araba_sedan-<görünüş>.jpg` (1600×900, stüdyo ışığı) + üçgen, ağ sayısı, boyut.
- Görünüşler: `q` ön-sol 3/4 · `s` yan · `f` ön · `b` arka 3/4 · `t` üst.
- Katalog ve stüdyo `src/dev/atolye.js` içinde; `[araç]` etiketli bölüm ekleyebilirsin (ör. şablon verisinden dingil mesafesi, iz genişliği, teker çapı, çıkıntıları yazdıran fonksiyon).
- **Her anlamlı değişiklikten sonra görüntülere Read aracıyla bak.** Python PIL ile görünüşleri tek sayfada birleştir.
- Başlangıç görüntüleri varsa `.testout/atolye/once/` altındadır; yoksa önce onları al ve sakla.

## Hedef oranlar (m) — sınıf başına veri tablosu yap ve yazdır
| Sınıf | Uzunluk | Gövde genişliği | Yükseklik | Dingil mesafesi | Lastik çapı | Lastik eni |
|---|---|---|---|---|---|---|
| Hatchback | 4,0–4,3 | 1,75–1,80 | 1,45–1,50 | 2,55–2,65 | 0,60–0,64 | 0,195–0,215 |
| Sedan | 4,6–4,9 | 1,82–1,88 | 1,42–1,48 | 2,70–2,85 | 0,63–0,68 | 0,205–0,235 |
| Station | 4,7–4,9 | 1,82–1,86 | 1,46–1,50 | 2,75–2,85 | 0,63–0,68 | 0,205–0,235 |
| Coupe / GT | 4,4–4,7 | 1,85–1,95 | 1,25–1,36 | 2,60–2,75 | 0,66–0,70 | 0,245–0,295 |
| SUV | 4,6–4,9 | 1,88–1,95 | 1,65–1,75 | 2,70–2,90 | 0,72–0,78 | 0,235–0,265 |
| Arazi / cip | 4,3–4,7 | 1,85–1,95 | 1,80–1,90 | 2,50–2,80 | 0,78–0,84 | 0,255–0,285 |
| Dolmuş | 5,4–6,0 | 1,95–2,05 | 2,30–2,60 | 3,20–3,70 | 0,68–0,72 | 0,205–0,225 |
| Otobüs | 11,5–12,2 | 2,50–2,55 | 3,0–3,2 | 5,8–6,2 | 0,95–1,0 | 0,275–0,295 |

Diğer kurallar: iz genişliği ≈ gövde genişliği − 0,25; teker yüzü çamurluk dudağının 1–3 cm içinde. Ön çıkıntı 0,80–0,95, arka 0,95–1,15.
Yerden yükseklik binekte 0,13–0,17, SUV'de 0,20–0,24. Kuşak hattı ≈ yüksekliğin 0,62–0,66'sı. Cam bölümü gövdeden dar (her yanda 6–10 cm içeri).

## İşler (öncelik sırasıyla; her biri ancak görüntüde görünüyorsa bitmiştir)
1. **Oran tablosu ve genişlikler.** Her kara türü tabloya göre düzeltilir. Fiziksel boyut değişirse fizik tutarlı kalmalı: `CARS` boyutlarının
   çarpışma kutusuna ve teker konumlarına nereden girdiğini bul (`src/game/economy.js`, `src/entities/vehicle_physics.js`, `vehicles.js`).
   Koltuk, kapı, gasp noktası, çıkartma ve far konumları aynı sayılardan türemeli.
2. **Tekerlek ve çamurluk.** Gövdeye oyulmuş gerçek kavis + iç davlumbaz. Yanaklı ve oluklu yol lastiği (tırtık yalnız arazi/askeri türde). Kollu alaşım jant, arkasında fren diski.
3. **Gövde yüzeyi.** Bombeli, pahlı kenarlı paneller (boya parlasın). Omuz ve marşpiyel hattı. Kapı çizgileri ve kolları. Depo kapağı. Saplı aynalar.
4. **Cam bölümü.** İnce direkler, kenarı koyu bantlı hizalı cam, camdan görünen iç (gösterge paneli, direksiyon, koltuk ve başlıklar).
5. **Ön ve arka.** Yansıtıcı üstünde camlı far + gündüz farı şeridi, dokulu ızgara, alt girişli biçimli tampon, plaka, fren/sinyal bölmeli stop, egzoz ucu.
6. **Sınıf kimliği.** Her tür siluetinden tanınmalı (hatch, sedan, station, coupe, cabrio, GT, SUV, arazi, taksi, dolmuş, otobüs, kamyonlar). Polis ve özel harekât giydirmeleri korunur. Gerçek marka biçimi ya da adı yok.
7. **Malzeme.** Boya gibi okunan metalik boya (ortam yansımasıyla vernik etkisi), lastik, füme cam, krom/saten kaplama, mat plastik.
8. **Helikopterler** (`src/entities/aircraft.js`): sivil ve saldırı. Gövde, kokpit camı, motor kaportası ve egzoz, pal kökleri olan rotor göbeği, kuyruk bumu + dengeleyiciler + kuyruk rotoru, kızak ya da teker, kapılar. Saldırı tipinde roket yuvalı kanatçık ve çene topu.
9. Bütçe kalırsa: motosiklet, bisiklet, kamyon kabinleri.

## Değişmez kısıtlar
- `buildCarModel(type, color)` ve `buildAircraftModel(type, color)` bütün çağıranlar için çalışır. `Vehicle` sınıfı ve diğer sistemler dönen yapıya dayanır:
  şasi grubu, dönen ve yönlenen teker düğümleri, kapı menteşeleri (`setDoor`), `src/game/glassfx.js`'in kullandığı cam panelleri, ışık malzemesi (`makeLightsMat`),
  hasar/yanık durumları, yan çıkartmalar (`fitSideDecal`), koltuk konumları, ön ısıtma (`vehicleWarmGroup`). Değiştirmeden önce nasıl kullanıldığını oku.
- Geometri şablonları tür başına önbellekte kalır. Kare içinde bellek ayırma yok. Gereksiz yeni shader çeşidi yok.
- Bütçe: LOD0 ≤ 32 bin üçgen/araba (otobüs ve kamyon ≤ 45 bin). ≤ 14 çizim çağrısı/araba. Uzaklık LOD'u yoksa basit bir tane ekle: ~70 m ötesinde ≤ 5 bin üçgen.
- Sahip olduğun dosyalar: `src/entities/vehicles.js` (model üreticileri ve malzemeler), `src/entities/aircraft.js` (modeller), `CARS` içindeki boyut alanları.
  Sürüş fiziği davranışına (`Vehicle.update` içindeki gaz/fren/direksiyon), trafik yapay zekâsına, karakterlere, silahlara, dünyaya dokunma.

## Dürüst sınır
Kodla üretilen araba, taranmış ya da yapay zekâyla üretilmiş modele ulaşmaz. Hedef: sokakta doğru görünen, yakın planda kabul edilebilir, oranı doğru ve yüzeyi temiz araba.
İki denemede yakınsamayan yaklaşımı bırak (BEYIN.md §2).

## Test (başka ekip de çalışıyor: tek tek)
- Tarayıcı süreçlerini asla öldürme (`pkill` yok). Oyun testinden önce `pgrep -f "scripts/test/play.js"`; doluysa bekle. Atölye hafiftir, her zaman çalışır.
- Derleme: `node scripts/build.js`. Oyun testi: `SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/<ad> $PWD/scripts/test/<x>-steps.js`.
- Sonda birer kez: smoke, vfunc, bridge, collision (`AUDIT_ONLY=1`), law (`LAW_ONLY=8`, gasp kapısı), drivefeel. Çökme olursa en çok bir tekrar.

## Teslim
- **İlk 15 dakika içinde ilk commit** (küçük bile olsa); sonra her madde bitince commit. Kota kesilirse emek kaybolmasın.
- Önce/sonra sayfaları `.testout/atolye/` altında. Sekiz son görüntü (her biri ≤ 200 KB JPEG) `docs/galeri/` altına commit: sedan 3/4 ve yan, GT 3/4, SUV 3/4, polis 3/4, taksi 3/4, bütün sınıfların sırası, sivil helikopter 3/4.
- Commit iletileri Türkçe; sonu:
  `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>` ve `Claude-Session: https://claude.ai/code/session_01UnEtJkLHbxmN3sdHT1yHH4`. Push yok.
- Bütçe: ~220 araç çağrısı; görünen sonuca harca.

## Son rapor
Madde madde: durum, ne değişti, sayılar (boyut tablosu/hedef, tür başına üçgen ve çizim çağrısı, üretim ms), son görüntülerde hâlâ zayıf kalanlar, doğrulayamadıkların. Açık sözlü ol; sahibi gözle değerlendirecek.

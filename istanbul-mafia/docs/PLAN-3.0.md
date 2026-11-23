# PLAN 3.0 — Oynanabilir, büyük, yaşayan İstanbul

Kaynak: oyunun sahibinin 2.0.0 sonrası geri bildirimi (11 oyun fotoğrafı + 21 İstanbul referans görseli, `docs/galeri/ref3/`).
Teslim kuralı: ara exe yok. Bütün dalgalar bitince tek, tam taşınabilir exe.

## 0. Dürüst ölçek notu
- İstanbul 5.461 km². 1:1 bir şehir (≈ 74 × 74 km) tarayıcı motorunda tek seferde kurulamaz; GTA V haritası bile ≈ 80 km² ve yalnız akışla (streaming) çalışır.
- Bugünkü dünya 2 × 2 km = 4 km², tamamı açılışta kuruluyor. Hedef **6 × 6 km = 36 km² (9 kat)**, hücre bazlı akışla (yakın hücreler tam, uzaktakiler
  düşük ayrıntılı siluet). Bu, gerçek semt sırasını ve yönlerini koruyan **ölçekli** bir İstanbul'dur: Boğaz kuzeye uzar (Rumeli Hisarı, Sarıyer, Maslak
  kuleleri), batıda havalimanı + sanayi + otogar + E-5/TEM, doğuda Anadolu yakası ilçeleri, güneyde Adalar.
- Ölçek ve bellek önce ölçülür (Ş0); ölçüm 36 km²'yi kaldırmıyorsa hedef küçültülür ve sahibine sayılarla bildirilir.
- Hazır İstanbul 3B modelleri: OSM bina verisi ODbL (atıf ister) → kural gereği kullanılamaz. Sketchfab vb. CC0 olmayanlar kullanılamaz.
  Simge yapılar referans fotoğraflardan kodla, gerçek oranlarla modellenir; CC0 bulunursa (Poly Haven vb.) yüzey/doku/aksesuar alınır, `KAYNAK.md` yazılır.

## 1. Sıra (BEYIN §4: oyunu bozan → hissi bozan → eksik özellik → cila)

| Dalga | Ekip | Konu | Brif |
|---|---|---|---|
| 1 | **O** | Oynanış: kanun dengesi, görevler, sarı ok, askerî üs | `ekip/O-oynanis.md` |
| 1 | **B** | Beden: araçta model değişimi, yumruk, bıçak, yürüyüş, tırmanma/zıplama, nişangâh | `ekip/B-beden.md` |
| 2 | **V3** | Villa: ilk giriş donması, adamlar, kapı, kırılan cam, teras, canlı dış görünüm | `ekip/V3-villa.md` |
| 2 | **D** | Deniz ve araç: tekne yansıması, köprü sesi, dalış halkası, kargo gemileri, araç modelleri, helikopter, fren, vites/egzoz | `ekip/D-deniz-arac.md` |
| 3 | **Ş** | Şehir: akış altyapısı, 6 × 6 km, otoyol/tünel/üst geçit/yokuş, semtler, sanayi, otogar, stadyum, havalimanı, panolar, dükkânlar, yoğunluk | `ekip/S3-sehir.md` |
| 3 | **A** | Arayüz ve görünüm: 3B haritası + lejant, ana/duraklat menüsü, ayarlar (hava, saat), dağlar/çimen, ışık ve renk | `ekip/A-arayuz.md` |
| 4 | **T** | Tarihî simgeler: Galata, Kız Kulesi, Ayasofya, Sultanahmet, Topkapı, Dolmabahçe, Ortaköy, Rumeli Hisarı, Yerebatan, Kapalıçarşı, İstiklal/Taksim, Balat/Fener, Pierre Loti, Adalar, Akaretler | `ekip/T-simgeler.md` |
| 5 | Baş mühendis | Birleştirme, tam test bataryası, performans turu, tek exe | — |

Aynı anda en çok 2 ekip. Dosya sahipliği her brifte yazılı; ortak dosyada yalnız `[ekip]` etiketli küçük kanca.

## 2. Madde listesi (sahibinin sözleri → ekip)

**O — Oynanış**
- O1 Polis/Özel Harekât/tank anında geliyor, roketle hemen öldürüyor → yıldız başına varış gecikmesi, kademeli tırmanma, roket isabeti düşük, oyuncu dayanıklılığı.
- O2 Görevler yapılamıyor → bütün hikâye görevleri `story/story2` testlerinde baştan sona; görevde kanun tırmanması sınırlı.
- O3 Mafya hesaplaşmaları yok → çete çatışma görevleri (pusu, baskın, hesaplaşma), çete üyeleri birbirleriyle de çatışır.
- O4 Sarı ok "saçma" (fotoğrafta ekranı kaplayan dev sarı koni) → yakında küçülür/kaybolur, kameraya çok yakınsa çizilmez, hedefin üstünde sabit boy.
- O5 Askerî üs: tam çitli, nizamiye kapısı; arabayla girilebilir; anında ölüm yok → alarm, arama, sonra çatışma.

**B — Beden**
- B1 Araca/motora binince oyuncu ve NPC'lerin 3B modeli değişiyor.
- B2 Yumruk dövüşünde oyuncu ve NPC vurmuyor / hasar vermiyor.
- B3 Bıçak orta parmakların arasında → sapından tutulsun.
- B4 Yürüyüş sarhoş gibi, düşecekmiş gibi.
- B5 Duvara tırmanma, zıplama, nişangâh (artı işareti) daha iyi.

**V3 — Villa**
- V1 İlk girişte donma/FPS düşüşü.
- V2 Adamlarım her zaman villada; saldırıda beni korurlar; gelince selamlar, kapıyı açarlar.
- V3 İçeriden dışarısı kötü (düz mavi pencere); camdan ateş edilemiyor, cam kırılmıyor.
- V4 Teras manzarası 2B gibi, şehir canlı değil; terastan ateş edilemiyor.

**D — Deniz ve araç**
- D1 Teknede yansıma parçası görünüyor (şeffaflık hatası sürüyor).
- D2 Köprüden geçerken "tık tık" ses.
- D3 Denize dalınca mavimsi tuhaf renk halkası.
- D4 15 Temmuz Şehitler Köprüsü'nün altından geçen kargo gemileri, daha çok deniz trafiği.
- D5 Araç tasarımları gerçekçi (kurgusal marka), helikopter modeli.
- D6 Frenler ve yol tutuş hâlâ "buzda gibi".
- D7 Vites geçiş sesleri ve egzoz ateşi.

**Ş — Şehir**
- Ş0 Ölçek/bellek ölçümü ve hücre akışı (dünyayı 6 × 6 km'ye büyütmenin önkoşulu).
- Ş1 Geniş caddeler, E-5 ve TEM otoyolları, üst geçitler, tüneller, yokuşlar (bayır), dar ve geniş sokaklar.
- Ş2 Semtler: Beşiktaş çarşı, Akaretler sıra evleri, bar sokağı, Maslak kuleleri, Sarıyer; her semtin kendine özgü dokusu.
- Ş3 Havalimanı gerçek boyutta: terminal (içi yürünebilir, yürüyen merdiven), iki pist, kule, apron, yolcu uçakları.
- Ş4 Sanayi bölgeleri, otogar, stadyumlar, daha çok tamirci/bakkal/market, reklam panoları, yol kenarı ayrıntısı.
- Ş5 Daha çok insan ve trafik (ölçülü, akışla).

**A — Arayüz ve görünüm**
- A1 M haritası gerçekçi, 3B dokulu; sağda düzgün lejant ve simgeler.
- A2 Ana menü ve duraklat menüsü yenilenir.
- A3 Ayarlar: hava (açık/bulutlu/yağmur/sis) ve gün saati elle seçilir.
- A4 Dağların 3B görünümü, çimen ve dağ rengi.
- A5 Görsel kalite turu: ışık, gökyüzü, renk düzeltme, bina cepheleri (FPS'i düşürmeden).

**T — Simgeler**: listedeki her yapı gerçek oran ve konumda, büyük parselinde, çevresiyle (meydan, park, rıhtım).

## 3. Kabul (tamam sayılmanın şartı)
- Her madde: brifteki sayısal kabul + önce/sonra görüntüsü (`docs/galeri/<ekip>-*`, ≤ 200 KB).
- Performans: `charperf` ≤ 0,1 ms/karakter; freeze testinde 100 ms üstü kare ≤ 2; yeni içerik FPS'i ölçülür.
- Dalga sonunda baş mühendis tam bataryayı tek tek koşar (smoke, character, charperf, combat, body, drivefeel, villa, sea, story, story2, guide,
  react, mountain, heli, footstep, law8, collision, freeze crash/wanted) ve geriye bakış yazar.

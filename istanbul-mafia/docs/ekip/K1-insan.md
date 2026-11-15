# Görev K1 — İnsan modelleri (karakter heykeli)

Çalışma klasörü: `/home/user/ionic-site/.claude/worktrees/w5-insan` (dal `w5-insan`). Oyun `istanbul-mafia/` altında.
Önce oku: `CLAUDE.md`, `BEYIN.md` (çalışma sistemi; uy), `docs/PLAN-1.5.md` §7.

## Neden
Oyunun sahibi karakterlere bakıp şunu dedi: "karakterlerin 3D görüntüleri aşırı kötü, ana karakterler çöp adam gibi, diğerleri de öyle."
Önceki ekipler çıktılarına bakmadan "bitti" dedi. Sen farklı çalışacaksın: **görüntüle, bak, düzelt, yeniden görüntüle.**

Baş mühendisin stüdyo görüntülerinde gördükleri:
- **Beden:** manken. Gövde boru gibi, omuzlar dar, kollar gövdeye yapışık, bacaklar düz boru (uyluk incelmesi, diz, baldır yok).
  Bel/kalça biçimi, kalça kası, omuz başı, trapez eğimi yok. El ve ayak kaba.
- **Yüz:** düz, gözler boyanmış. Burun bir topak; göz çukuru, göz kapağı, dudak ve kulak biçimi yok. Sakal kir lekesi gibi. Saç pürüzsüz kask.
- **Kıyafet:** dokulu dar boru. Kalınlık, etek/manşet boşluğu, kıvrım yok; yaka köşeli. Gözlük havada duruyor.
- **Hikâye kadrosu:** Reis Baba, Kenan, Leyla, Cin Ali `randomLook(rng, 'boss')` türevi (`src/game/story_data.js`, `*_LOOK`); tasarlanmış kimlikleri yok.

Ölçülen genişlikler gerçeğe yakın, yine de çöp adam gibi görünüyor: sorun boyut değil **biçim** (kontur, duruş, yüz formu, kıyafet hacmi, gölgeleme).

## Aracın: model atölyesi (`istanbul-mafia/` içinden)
- `node scripts/atolye.js --liste` → kimlikler (`insan:kahraman`, `insan:kahraman-kadin`, `insan:reis`, `insan:kenan`, `insan:leyla`, `insan:cinali`, `insan:civilian1`, `insan:police1`, …).
- `node scripts/atolye.js insan:kahraman --gorunus q,f,s,yuz,el --olcu` → `.testout/atolye/insan_kahraman-<görünüş>.jpg` (1600×900, stüdyo ışığı) + üçgen sayısı + siluet kesit genişlikleri (m).
- Görünüşler: `q` ön-sol 3/4 · `f` ön · `s` yan · `b` arka 3/4 · `yuz` yüz · `el` el.
- Katalog ve stüdyo `src/dev/atolye.js` içinde; `[insan]` etiketli bölüm ekleyebilirsin.
- **Her anlamlı değişiklikten sonra görüntülere Read aracıyla bak.** Python PIL ile birkaç görünüşü tek sayfada birleştir (tek Read).
- Başlangıç görüntüleri varsa `.testout/atolye/once/` altındadır; yoksa önce onları al ve sakla (önce/sonra karşılaştırması için).

## Başlangıç ölçüleri (kahraman, 1,786 m; ön siluet, boya oranla)
baş 0,965: 0,160 (derinlik 0,194) · boyun 0,87: 0,128 · omuz 0,815: 0,448 (kollar gövdeyle bitişik) · göğüs hizası 0,74: 0,493 ·
bel hizası 0,63: 0,482 · kalça 0,53: 0,452 · diz 0,285: 0,119 · baldır 0,20: 0,117 · bilek 0,06: 0,100. Üçgen: LOD0 18,3 bin (takım elbise ~21 bin).

## Hedefler (yetişkin erkek 1,78 m; kıyafet 1–3 cm ekler; boyla ölçeklenir)
- Baş genişlik 0,155, derinlik 0,195, çene-tepe 0,235. Boyun 0,115–0,125.
- Omuz genişliği 0,47–0,49. Göğüs (yalnız gövde) 0,32–0,34, derinlik 0,24–0,26. Bel 0,29–0,31. Kalça 0,34–0,36.
- Üst uyluk 0,17–0,19 → diz 0,115. Baldır en geniş 0,12–0,125 (yandan dizden belirgin geniş). Ayak bileği 0,07. Kasık yüksekliği ≈ boyun 0,47'si.
- Üst kol 0,095–0,11, ön kol 0,085–0,095, el bileği 0,055–0,06. El uzunluğu 0,19; ayak 0,26. Parmak uçları uyluk ortasına gelir.
- Duruş: rahat A duruşu. Kollar dirsekte gövdeden 6–10 cm açık: göğüs hizasında siluet üç ayrı parça okunmalı [kol, gövde, kol]. Ayaklar 15–20 cm açık.
- Kadın 1,65 m: omuz 0,42–0,43, göğüs 0,28–0,29 (+göğüs derinliği), bel 0,24–0,26, kalça 0,36–0,38, üst uyluk 0,165.

## İşler (öncelik sırasıyla; her biri ancak görüntüde görünüyorsa bitmiştir)
1. **Beden biçimi ve duruş:** omuz başı, pazı/arka kol, ön kol incelmesi, kalça kası, uyluk kütlesi, diz kapağı, baldır, bilek, trapez, bel çukuru, göğüs, kürek. Kadın/erkek ve beden tipi çeşitliliği korunur.
2. **Baş ve yüz geometrisi:** çene ve elmacık kemikli kafatası, göz çukuru + ayrı göz küresi (iris, göz bebeği, küçük parlama), göz kapağı, kaş kemiği, köprülü ve delikli burun, biçimli dudak, kulak. Temiz doku: biçimli kaş, kirpik, dudak rengi.
3. **Saç ve sakal:** hacimli saç, saç çizgisi, tel yönlü gölgeleme. Sakal saç gibi okunmalı (kabuk/kart, yumuşak kenar). Gözlük buruna ve kulağa oturur.
4. **El ve ayak:** LOD0'da parmaklar; tabanlı düzgün ayakkabı.
5. **Kıyafet hacmi:** bedenin üstünde kalınlığı olan kabuk; ceket eteği ve manşet boşluğu, gerçek yaka/klapa, paça kırığı, dirsek-diz-kasıkta kıvrım ayrıntısı, etek dökümü. Mevcut gardırop çalışmaya devam eder.
6. **Gölgeleme:** plastik görünmeyen ten, türüne göre kumaş (kot, deri, pamuk, yün), kıvrımlarda köşe AO.
7. **Tasarlanmış kadro:** ana karakter (20'lerin sonu, atletik, deri ceket), Reis Baba (~60, kır saç ve bıyık, iri, koyu üç parça takım, tespih), Kenan, Leyla, Cin Ali, korumalar (koyu takım, kulaklık).
   Yalnızca `story_data.js` içindeki `*_LOOK` tanımlarını ve `character.js` içindeki `defaultLook`'u düzenle.

## Değişmez kısıtlar
- İskeletin kemik adları ve sırası korunur (sona kemik eklenebilir). Bütün animasyon katmanları çalışır (yürü, koş, çömel, zıpla, yüz, otur, sür, nişan, ölüm, çift pozları).
- Korunacak API: `CharacterModel`, `defaultLook`, `randomLook`, `buildCharGeometry(L, lod)`, `setLod`, `torsoFit()`, `helmetFit()`, `setGear()` (`src/game/body.js` yelek/kask takar).
- Karakter başına tek çizim çağrısı. Üçgen: LOD0 ≤ 30 bin (tasarlanmış kadro ≤ 45 bin), LOD1 ≤ 8 bin, LOD2 ≤ 2,5 bin.
- Yeni bir görünümün LOD0 üretimi ≤ 60 ms (ölç). `charperf-steps.js` animasyon maliyeti ≤ 0,1 ms/karakter. `npc.js` görünüm havuzu çalışır.
- Sahip olduğun dosyalar: `src/entities/character.js`, `charParts.js`, `charTex.js`, `story_data.js` içindeki `*_LOOK` satırları. `npc.js` yapay zekâsına, `combat.js`'e, araçlara, dünyaya dokunma.

## Dürüst sınır
Kodla üretilen insan, taranmış ya da yapay zekâyla üretilmiş modele ulaşmaz. Hedef: yakın planda sırıtmayan, oranı doğru, temiz, yontulmuş bir görünüm.
İki denemede yakınsamayan yaklaşımı bırak (BEYIN.md §2). Bedeni düzgün örtük yüzey heykeli + köşe renkleriyle yeniden kurmak serbesttir; kısıtlar geçerli kalır.

## Test (başka ekip de çalışıyor: tek tek)
- Tarayıcı süreçlerini asla öldürme (`pkill` yok). Oyun testinden önce `pgrep -f "scripts/test/play.js"`; doluysa bekle. Atölye hafiftir, her zaman çalışır.
- Derleme: `node scripts/build.js`. Oyun testi: `SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/<ad> $PWD/scripts/test/<x>-steps.js`.
- Sonda birer kez: smoke, character, gait, charperf, `node scripts/test/chargeo-node.mjs`. Çökme olursa en çok bir tekrar.

## Teslim
- **İlk 15 dakika içinde ilk commit** (küçük bile olsa); sonra her madde bitince commit. Kota kesilirse emek kaybolmasın.
- Önce/sonra sayfaları `.testout/atolye/` altında. Altı son görüntü (her biri ≤ 200 KB JPEG) `docs/galeri/` altına commit: kahraman 3/4, kahraman yüz, Reis 3/4, kadın 3/4, altılı sıra, el.
- Commit iletileri Türkçe; sonu:
  `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>` ve `Claude-Session: https://claude.ai/code/session_01UnEtJkLHbxmN3sdHT1yHH4`. Push yok.
- Bütçe: ~220 araç çağrısı; dosya yeniden okumaya değil görünen sonuca harca.

## Son rapor
Madde madde: durum, ne değişti, sayılar (ölçü/hedef, LOD üçgenleri, üretim ms, charperf), son görüntülerde hâlâ zayıf kalanlar, doğrulayamadıkların. Açık sözlü ol; sahibi gözle değerlendirecek.

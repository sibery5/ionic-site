# Görev V2 — Villa iç mimarisi, camlardan dışarısı, karanlık iç mekânlar, şehir estetiği

Çalışma klasörü: `/home/user/ionic-site/.claude/worktrees/w12-villa` (dal `w12-villa`). Oyun `istanbul-mafia/` altında.
Önce oku: `CLAUDE.md`, `BEYIN.md` (§2, §3, §8, 1.6 ve 1.11 dersleri), `docs/PLAN-2.0.md` ek bölümü (K5, K11, K12, K16), `docs/ekip/V-villa.md` (önceki villa işi).

## Neden (oyunun sahibinin sözleri)
- "Villamda otlar çimler aşırı uzun, normal çim yap. Havuzun ve tüm villa mimarisini geliştir. Villanın iç tasarımını özel bir iç mimar gibi geliştir;
  üst katlar olsun, ihtişamlı olsun; içten merdivenli, her oda özenle tasarlanmış olmalı."
- "Evdeki televizyonda dış güvenlik kamerası kayıtları olsun, canlı dışarısı izlensin."
- "Tüm binalar, tüm evler ve villamda camlardan dışarısı gözüksün, dışarıyı izleyebileyim."
- "Gizli odalar ve Baba'nın evlerinde kapı ve ortam çok karanlık, biraz aydınlat."
- "Gökdelenlerin olduğu yerleri mega şehir havasında, özenerek tasarla. Evler, binalar havadan karton çizgi film gibi görünüyor. Bazı evlerde tabelalar balkonun içine geçmiş.
  Askeri bölgenin üst tarafında deniz ile yol arasında çit yok; yol boyunca zincir çit yap. Yollar daha ferah olsun."

## İşler (bu sırayla; her biri bitince commit)
1. **Hızlı düzeltmeler.** Villa çimi kısa ve doğal (çim kartı yüksekliği/yoğunluğu); gizli oda ve Baba'nın evlerinde iç ışık ve kapı aydınlatması (kabul: iç mekân ortalama
   parlaklığı ölç, önce/sonra; bloom taşması yok); askeri bölgede deniz-yol kenarına çarpışmalı zincir çit; balkona gömülen tabelalar (tabela yerleşiminde balkon/çıkıntı denetimi).
2. **Villa iç mimarisi.** Merdivenle çıkılan 2. ve 3. kat: büyük salon (ikili oturma grubu, şömine, kitaplık), yemek odası, ana yatak odası (giyinme odası, banyo),
   misafir odası, çalışma odası, teras çıkışı. Malzeme: mermer zemin, ahşap, deri, pirinç ayrıntı; dolaylı sıcak ışık. Kayıt yatağı korunur.
   CC0 mobilya (Poly Haven) kullanılabilir: `scripts/assets/pack-props.py` tablosuna satır ekle, toplam yeni varlık ≤ 4 MB (model ≤ 300 KB, doku 512).
   Oda başına bir görüntü al ve Read ile bak.
3. **Güvenlik kamerası televizyonu.** Salondaki televizyon villa kapısını/bahçesini gösteren canlı görüntü: düşük çözünürlüklü ikinci kamera, ayrı hedef dokuya
   saniyede birkaç kez çizim (FPS bütçesi: ≤ 1,5 ms ortalama, yalnız oyuncu odadayken). Zaman damgası ve "KAM 1" yazısı.
4. **Camlardan dışarısı.** İç mekânlarda pencereden dışarısı görünsün: iç mekân sahnesi dış dünyadan ayrıysa pencerelere dış görüntü (önceden çizilmiş panorama ya da canlı
   düşük çözünürlüklü görünüm). Önce yerini ve yöntemini ölç: bu bir mimari karar; en ucuz inandırıcı yolu seç ve gerekçesini yaz.
5. **Şehir estetiği.** Kuşbakışında karton görünen bina tepeleri: çatı ayrıntısı (parapet, makine dairesi, su deposu, anten, çatı kaplaması dokusu), cephe derinliği;
   gökdelen bölgesi: daha yüksek ve çeşitli kuleler, cam cephe yansıması, gece ışık deseni, kule tepelerinde ışık. Önce/sonra kuşbakışı ve sokak görüntüsü.
   FPS: çizim çağrısı artışı ≤ %10 (ölç).

## Kısıtlar
- Sahip olduğun dosyalar: `src/world/villa.js`, `src/game/villa.js`, `src/game/interiors.js` (villa, gizli oda, Baba'nın evleri), şehir yapı üreticileri (`src/world/` bina/çatı/tabela),
  askeri bölge çiti. Karakter, araç, çatışma, ses dosyalarına dokunma.
- Yeni CSS geçişlerinde `transform` animasyonu yok (BEYIN: test tarayıcısında bellek patlaması).
- Kare içinde bellek ayırma yok; statik geometri birleştirilir; uzaktayken ucuz.

## Test (bellek dar: aynı anda tek tarayıcı; atölye de tarayıcıdır)
- Her tarayıcı işinden önce `pgrep -f "play.js|atolye"` doluysa bekle. "Target crashed" bir kez tekrar; iki kez aynı yerde ise sebebi ara.
- Derleme `node scripts/build.js`. Test: `SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/<ad> $PWD/scripts/test/<x>-steps.js`
- Sonda birer kez: smoke, villa, story, collision (`AUDIT_ONLY=1`), city, perf.

## Teslim
- **İlk 15 dakikada ilk commit.** Sonra her iş bitince commit. Push yok.
- Commit iletileri Türkçe; sonu: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ve
  `Claude-Session: https://claude.ai/code/session_01UnEtJkLHbxmN3sdHT1yHH4`.
- Bütçe: en çok ~190 araç çağrısı. Dosyayı baştan sona okuma; Grep ile yeri bul, yalnız orayı oku.
- `docs/galeri/v2-*` önce/sonra görüntüleri (her biri ≤ 200 KB).

## Son rapor (kısa, madde madde)
Her iş: durum, ne değişti, ölçüm/görüntü kanıtı, doğrulayamadıkların, sahibinin oyunda bakması gerekenler.

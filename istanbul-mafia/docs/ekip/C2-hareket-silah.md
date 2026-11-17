# Görev C2 — Karakter hareketi, silah tutuşu ve nişan, saldırı helikopteri, ekran yazıları

Çalışma klasörü: `/home/user/ionic-site/.claude/worktrees/w11-hareket` (dal `w11-hareket`). Oyun `istanbul-mafia/` altında.
Önce oku: `CLAUDE.md`, `BEYIN.md` (§2, §3, §8, 1.6 ve 1.11 dersleri), `docs/PLAN-2.0.md` ek bölümü (K6, K8, K9, K10).

## Neden (oyunun sahibinin sözleri)
- "Karakterin yürümesi, koşması, zıplaması, eğilmesi özellikle bunları düzelt; PUBG'de nasılsa öyle olsun. Karakter gerçekten eğilmeli. Tırmanması hâlâ çok saçma."
- "Yumruk atması çok saçma, gerçekten yumruk atması gerçekçi olsun."
- "Silahları ve bıçağı PUBG'deki gibi tutsun; saçma tutuşlar olmasın."
- "Keskin nişancıda GTA 5'teki gibi dürbün, yakınlaştırma."
- "Askeri bölgeye yaya olarak sızma olabilsin: duvardan, çitten tutunup tırmanıp atlayabileyim."
- "Helikopterle sağ tık nişan alınca tabanca atışı oluyor; nişan ve ateş sistemi saçma. Roketler doğru olsun; füze için hedef takip, kilitleme, güdüm sistemi."
- "Hayvana saldırınca ve öldün gibi yazılar: GTA 5'teki gibi arkası yarı saydam siyah şerit, sarı yazı tasarımı."

## Bilinen durum
- İnsanlar gerçekçi gövde (CC0 MakeHuman, `charMH.js`); iskelet 27 kemik, poz kanalları `character.js` (yürüyüş tablosu `GAIT`, çömelme `CROUCH`, IK `solveArm`, ayak IK).
- Silah tutuşu 1.11'de düzeltildi (silah yuvası `SOCK`, tabancada destek eli). Atölye: `tutus:tabanca`, `tutus:ak`, `tutus:bicak`, görünüş `silah`, `silahic`, `silahust`,
  ölçüm `--tutus` (parmak/avucun silah eksenindeki konumu). Tüfek, pompalı, keskin nişancı, uzi, RPG için de aynısını yap.
- Tırmanma `entities/mantle.js` (1,3–2,6 m; askeri duvar `noClimb` ile reddediliyor). Sahibi askeri duvar ve çitlerin tırmanılabilmesini istiyor.
- Saldırı helikopteri silahı `entities/aircraft.js` içinde (sol tık top, Q roket).

## İşler (bu sırayla; her biri bitince commit)
1. **Hareket pozları (PUBG gerçekçiliği).** Yürüyüş, koşu, depar: kol salınımı, gövde eğimi, kalça dönüşü, adım uzunluğu hızla uyumlu (ayak kayması yok: `gait-steps.js`).
   Çömelme: diz ve kalça gerçekten bükülür, gövde alçalır (baş yüksekliği ayakta → çömelik %62–70), çömelik yürüyüş. Zıplama: hazırlık, havada bacak toplama, iniş sönümü.
   Her pozu atölyede (yan ve 3/4) görüntüleyip bak; önce/sonra karesini `docs/galeri/c2-*` altına koy.
2. **Yumruk.** Omuz-kalça dönüşüyle gelen düz yumruk ve kroşe; diğer el gardda; vuruş anında gövde öne kayar; isabette karşı tarafın başı savrulur. Kombo ritmi korunur.
3. **Tırmanma.** Tutunma, çekiş, bacak atma pozları gerçekçi (eller kenarda, gövde duvara yakın). Askeri duvar ve zincir çit tırmanılabilir olsun (`noClimb` kaldırılır;
   üstünde dikenli tel varsa hasar veya yavaşlama ile tırmanılır — kararını yaz). 3 m üstü yine aşılamaz. `mantle-steps.js` güncelle.
4. **Silah tutuşu, tüm silahlar.** Her silah için kabza avuçta, tetik parmağı tetikte, destek eli ön tutamakta, dipçik omuzda (atölye ölçümü + görüntü).
5. **Keskin nişancı dürbünü (GTA 5 tarzı).** Tam ekran siyah dürbün çerçevesi, ince çizgili nişangâh, fare tekeriyle kademesiz yakınlaştırma, nefes tutma.
6. **Saldırı helikopteri.** Sağ tık: nişan kamerası (nişangâh); sol tık: top (izli mermi, isabet efekti); roket ayrı tuş; **füze kilidi:** hedef (araç/helikopter)
   nişangâhta 1,5 sn tutulunca kilit sesi + kilit çerçevesi, ateşlenen füze hedefi takip eder (dönüş hızı sınırlı, kaçabilen hedef), kilit yoksa düz gider.
   Test: kilitli füze hareketli araca isabet eder; kilitsiz roket düz gider.
7. **Ekran yazıları.** Büyük uyarı ve ölüm/başarı yazıları: yarı saydam siyah yatay şerit + sarı (ya da kırmızı) büyük yazı, yumuşak giriş/çıkış (GTA tarzı; marka yok).

## Kısıtlar
- Karakter başına animasyon ≤ 0,1 ms (`charperf-steps.js`), kare içinde bellek ayırma yok.
- Sahip olduğun dosyalar: `src/entities/character.js` (pozlar), `src/entities/mantle.js`, `src/entities/player.js` (hareket), `src/entities/aircraft.js` (silah ve kilit),
  `src/ui/` içindeki nişangâh/dürbün/büyük yazı, `src/dev/atolye.js` (yeni pozlar). Araç fiziği, villa, ses motoru, gövde birleştirme (`charMH.js`, `pack-mh.py`) dosyalarına dokunma.
- Arayüz Türkçe.

## Test (bellek dar: aynı anda tek tarayıcı; atölye de tarayıcıdır)
- Her tarayıcı işinden önce `pgrep -f "play.js|atolye"` doluysa bekle. Tarayıcıyı öldürme. "Target crashed" bir kez tekrar; iki kez aynı yerde ise sebebi ara.
- Derleme `node scripts/build.js`. Test: `SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/<ad> $PWD/scripts/test/<x>-steps.js`
- Sonda birer kez: smoke, character, gait, charperf, mantle, combat, body, animal.

## Teslim
- **İlk 15 dakikada ilk commit.** Sonra her iş bitince commit. Push yok.
- Commit iletileri Türkçe; sonu: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ve
  `Claude-Session: https://claude.ai/code/session_01UnEtJkLHbxmN3sdHT1yHH4`.
- Bütçe: en çok ~190 araç çağrısı. Dosyayı baştan sona okuma; Grep ile yeri bul, yalnız orayı oku.

## Son rapor (kısa, madde madde)
Her iş: durum, ne değişti, ölçüm/görüntü kanıtı, doğrulayamadıkların, sahibinin oyunda bakması gerekenler.

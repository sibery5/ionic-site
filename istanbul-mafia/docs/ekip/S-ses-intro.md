# Görev S — Ses efektleri ve oyun introsu

Çalışma klasörü: `/home/user/ionic-site/.claude/worktrees/w7-ses` (dal `w7-ses`). Oyun `istanbul-mafia/` altında.
Önce oku: `CLAUDE.md`, `BEYIN.md` §2 ve §7–§8.

## Neden
Oyunun sahibi: "her şey güzel, kaliteli olsun: ses efektleri, oyun introsu." Önceki geri bildirimleri: silah, motor, siren ve megafon sesleri
yapay; menü tıklaması ve açılış müziği zayıf; oyunun bir açılışı (intro) yok. Sesler bu projede kodla üretilir (WebAudio, `src/core/sfx/`, `src/core/music.js`).

## Bölüm 1 — Oyun introsu (önce bu; görünür iş)
Oyun ilk açıldığında (ve menüden "İntroyu izle" ile) 35–50 saniyelik sinematik açılış:
1. Siyah ekran, kısa stüdyo yazısı ("İSTANBUL MAFYA TAKIMI sunar" gibi; gerçek marka adı yok), tek vuruşluk derin ses.
2. Gün doğumu ya da gece İstanbul: oyun dünyasının kendisi üzerinde yavaş kamera uçuşları, 3–4 plan (Boğaz ve köprü, Galata/tarihî yarımada silueti,
   cami, kalabalık cadde, konak). Planlar arası yumuşak geçiş (kararma/açılma), sinema şeridi (üst-alt siyah bant), hafif vinyet.
3. Hikâyeyi kuran 3–4 kısa satır (alt yazı gibi, sırayla belirir): yıllar sonra şehre dönen genç adam, Reis Baba'nın gölgesi, "bu şehirde herkesin bir bedeli var".
4. Büyük başlık "İSTANBUL MAFYA" altın harflerle belirir, müzik doruğa çıkar, ana menüye geçilir.
- Herhangi bir tuş/fare ile atlanır ("Atlamak için bir tuşa bas" yazısı 2 sn sonra görünür). Kaydı olan oyuncuda otomatik oynamaz; ayarlarda/menüde yeniden izlenir.
- İntro müziği: mevcut müzik motoruyla (music.js) intro için özel parça: yavaş başlar (ney/ud/yaylı hissi veren sentez, makam tadında), ritim girer, doruk.
- Performans: intro sırasında oyun dünyası zaten yüklenmiş olmalı; açılış süresini uzatma (ölç: menünün görünme süresi önce/sonra).
- Test: `intro-steps.js` — intro başlıyor, planlar ilerliyor (kamera konumu değişiyor), yazılar sırayla görünüyor, atlama çalışıyor, sonunda menü açılıyor,
  konsol hatası yok. 3 ekran görüntüsü al ve Read ile bak (bir plan, yazılı plan, başlık).

## Bölüm 2 — Ses efektleri (kalite)
Kulakla dinleyemezsin; ölçerek çalış. `src/core/sfx/lab.js` ve `scripts/test/audio2-steps.js` çevrimdışı ölçüm için var: her sesi tampona çizdir, şunları yazdır:
tepe ve RMS düzeyi (kırpılma yok: tepe ≤ −1 dBFS), süre, tayf ağırlık merkezi, düşük/orta/yüksek bant enerjisi, saldırı süresi.
Öncelik sırasıyla, her biri için "önce/sonra" sayıları:
1. **Silah sesleri:** ilk darbe (5 ms içinde tepe), gövde (150–400 Hz), mekanik tık, kuyruk/yankı (dışarıda 0,6–1,2 sn, içeride kısa); silah sınıfları birbirinden ayırt edilir
   (tabanca kuru, tüfek sert ve uzun kuyruk, pompalı kalın, keskin nişancı çatlama + uzun yankı, susturuculu kısa). Uzaktan atışta yüksekler azalır, gecikme eklenir.
2. **Araç motoru:** devirle değişen harmonik yapı (silindir ateşleme frekansı = devir/60 × silindir/2), yükte ve boşta farklı tını, vites geçişinde kesinti,
   egzoz patlaması, lastik sesi, fren cızırtısı. Sınıf farkı: küçük araba, V8, dizel otobüs, motosiklet.
3. **Adım, çarpma, cam, patlama:** zemine göre adım (asfalt, taş, çim, ahşap), araç çarpması (metal + cam), patlama (alt bas + moloz).
4. **Arayüz:** menü tıklaması, seçim, onay, para kazanma, görev tamam, telefon — kısa, temiz, birbirinden farklı.
5. **Ortam:** şehir uğultusu, martı, ezan gibi kültürel ortam sesi yalnız sentezle makul duruyorsa; kötü duracaksa ekleme.
- Ana karışım: sınırlayıcı (limiter) var mı ölç; yoksa ekle. Aynı anda çok ses çalınca kırpılma olmamalı (20 eşzamanlı atış testi).
- Kare içinde bellek ayırma yok; ses düğümleri havuzdan ya da önceden çizilmiş tamponlardan.

## Kısıtlar
- Sahip olduğun dosyalar: `src/core/sfx/*`, `src/core/music.js`, `src/core/audio.js`, yeni `src/ui/intro.js` (ya da benzeri), menüde tek giriş, `main.js` içinde tek kanca.
  Çatışma, karakter, araç fiziği ve dünya koduna dokunma.
- Hazır ses dosyası kullanılmaz (lisans riski); her şey sentez. Arayüz metinleri Türkçe.

## Test (bellek dar: aynı anda tek test, düşük kalite)
- `pgrep -f "scripts/test/play.js"` doluysa bekle. Tarayıcı süreçlerini öldürme. "Target crashed" bellek çökmesidir: bir kez tekrar et.
- Derleme `node scripts/build.js`. Test: `SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/<ad> $PWD/scripts/test/<x>-steps.js`
- Görüntü: kareyi çizdiğin görevde `renderer.domElement.toDataURL` ile oku ya da `H.shot` kullan (BEYIN.md 1.6 dersleri).
- Sonda birer kez: smoke, intro, audio2 (ya da yeni ses ölçüm testi).

## Teslim
- **İlk 15 dakikada ilk commit.** Sonra her iş bitince commit. Push yok.
- Commit iletileri Türkçe; sonu: `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>` ve
  `Claude-Session: https://claude.ai/code/session_01UnEtJkLHbxmN3sdHT1yHH4`.
- Bütçe: en çok ~150 araç çağrısı. Dosyayı baştan sona okuma; Grep ile yeri bul, yalnız orayı oku.

## Son rapor (kısa, madde madde)
Her iş: durum, ne değişti, ölçüm kanıtı (önce/sonra sayıları). Sesi sen duyamazsın: sahibinin kulakla bakması gerekenleri ayrıca yaz. Doğrulayamadıklarını gizleme.

# Görev S2 — Sesler (yürüme, silah, mermi, çarpışma) ve karakter yaratıcısında giysiler

Çalışma klasörü: `/home/user/ionic-site/.claude/worktrees/w14-ses` (dal `w14-ses`). Oyun `istanbul-mafia/` altında.
Önce oku: `CLAUDE.md`, `BEYIN.md` (§2, §8, 1.6 ve 1.11 dersleri), `docs/PLAN-2.0.md` ek (K15) ve ek 2 (E3), `docs/ekip/S-ses-intro.md` (önceki ses işi ve ölçüm aracı).

## Neden (oyunun sahibinin sözleri)
- "Yürüme sesi çok kötü. Silah sesleri çok kötü, mermi sesleri de öyle, arabayla çarpışma sesleri de çok kötü; revize edip geliştir."
- "Karakter oluştururken saat, şort, çoğu giyilebilir şey karakterin üstünde görünmüyor; hepsini doğru yap. Gözlük tam yüzüne oturmuyor, yukarıda kalıyor;
  bere, şapka kesik görünüyor; spor ayakkabı hepsi doğru görünmeli. Tek tek incele."
- "Karakter tasarım ekranını geliştir: daha aydınlık olsun, karakter bir mağazada gibi olsun, arka plan güzel olsun."

## Kaynak kararı (ses)
Önce **CC0 hazır ses** ara (lisans resmî kaynaktan doğrulanır, `assets/sfx/KAYNAK.md`): adım (asfalt, taş, çim, ahşap), ateşli silah atışları, mermi vızıltısı/sekmesi,
araç çarpışması, cam kırılması. Erişilebilir CC0 kaynak bulamazsan (ağ izni sınırlı olabilir) mevcut sentezi yeniden yaz. Toplam yeni ses ≤ 3 MB (ogg/webm, 44,1 kHz mono).
Hazır ses kullanılırsa `CLAUDE.md` "Sesler kodla üretilir" kuralını CC0 istisnasıyla güncelle (şehir dokuları ve insan verisi gibi).

## İşler (bu sırayla; her biri bitince commit)
1. **Yürüme sesi.** Zemine göre adım (asfalt, kaldırım taşı, çim, ahşap, metal), koşuda daha sert, çömelikte yumuşak; ayağın yere değdiği anla eşleşir (yürüyüş evresi).
   Kabul: adım sesi ayak temasından ±40 ms içinde; aynı ses art arda tekrar etmez (en az 4 varyant + ton/hız oynaması).
2. **Silah ve mermi sesleri.** Sınıflar ayırt edilir (tabanca, tüfek, pompalı, keskin nişancı, uzi, RPG); yakın atışta sert, uzakta boğuk ve gecikmeli; mermi vızıltısı ve sekme.
3. **Araç çarpışması.** Hıza göre metal ezilmesi + cam + parça dökülmesi; sürtünme (duvara sürtme) sesi.
4. **Giysiler (tek tek).** Yaratıcıdaki her seçeneği (üst, alt, şort, etek, ayakkabı, şapka, bere, gözlük, saat, kolye, çanta) gerçekçi gövdede görüntüle:
   görünmeyenleri ve hatalı oturanları listele, düzelt (gerçekçi gövde eşlemesi `charParts.js` içindeki `MH_*` tabloları ve aksesuar taşıma `charMH.js`;
   şort için CC0 MakeHuman parçası yoksa uygun kıyafetin pantolon kısmını diz üstünde kes). Gözlük burun köprüsüne ve kulağa oturur; şapka/bere başı keser gibi görünmez.
   Atölyede seçenek başına görüntü + bir galeri sayfası.
5. **Yaratıcı ekranı.** Aydınlık mağaza ortamı (yumuşak ışık, aynalar, raflar, zemin), karakter merkezde; arayüz okunaklı.

## Kısıtlar
- Sahip olduğun dosyalar: `src/core/sfx/*`, `src/core/audio.js`, yürüyüş sesi tetiği (`player.js`/`character.js` içinde yalnız etiketli kanca), `src/entities/charParts.js` (MH eşlemesi, aksesuar),
  `src/entities/charMH.js` (aksesuar taşıma), karakter yaratıcısı arayüzü ve sahnesi. Villa, tepki/yönlendirme, araç fiziği dosyalarına dokunma.
- CSS'te sürekli `transform` animasyonu yok. Kare içinde bellek ayırma yok; sesler önceden hazırlanır (boşta ön örnekleme kuyruğu).

## Test (bellek dar: aynı anda tek tarayıcı; atölye de tarayıcıdır)
- Her tarayıcı işinden önce `pgrep -f "play.js|atolye"` boş olana kadar bekle. "Target crashed" bir kez tekrar.
- Sonda birer kez: smoke, audio2 (+ `scripts/test/sfx-measure.js`), character, charlook, freeze (`FZ=crash`).

## Teslim
- **İlk 15 dakikada ilk commit.** Sonra her iş bitince commit. Push yok.
- Commit iletileri Türkçe; sonu: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ve
  `Claude-Session: https://claude.ai/code/session_01UnEtJkLHbxmN3sdHT1yHH4`.
- Bütçe: en çok ~180 araç çağrısı. Dosyayı baştan sona okuma; Grep ile yeri bul, yalnız orayı oku.

## Son rapor (kısa, madde madde)
Her iş: durum, kaynak (CC0 ise lisans), ölçüm/görüntü kanıtı, doğrulayamadıkların (sesi duyamazsın: sahibinin kulakla bakması gerekenler).

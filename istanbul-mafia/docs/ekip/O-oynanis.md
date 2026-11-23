# Görev O — Oynanış: kanun dengesi, yapılabilir görevler, mafya hesaplaşmaları, sarı ok, askerî üs

Çalışma klasörü: `/home/user/ionic-site/.claude/worktrees/w15-oyun` (dal `w15-oyun`). Oyun `istanbul-mafia/` altında.
Önce oku: `CLAUDE.md`, `BEYIN.md` (§2, §3.3, §4, §8, 1.11 ve V2 dersleri), `/home/user/ionic-site/istanbul-mafia/docs/PLAN-3.0.md` (O1–O5).
Oyun fotoğrafları: `/home/user/ionic-site/istanbul-mafia/docs/galeri/ref3/oyun0.jpg`, `oyun1.jpg`, `oyun2.jpg` (sol: ekranı kaplayan sarı koni).

## Neden (oyunun sahibinin sözleri)
- "Görevleri yapamıyorum: polis, özel harekât, tank hemen geliyor, roketle beni hemen öldürüyorlar. Roketler daha çok ıskalasın."
- "Mafya hesaplaşmaları yok. Karakterim çok çabuk ölüyor."
- "Sarı yönlendirme oku çok saçma çalışıyor."
- "Askerî üs tamamen çitle çevrili olsun, giriş kapısı olsun. Arabayla girince hemen ölmeyeyim; alarm çalsın, arasınlar, sonra çatışma çıksın."
- "Oyun bağımlılık yapsın, sürükleyici olsun."

## Bilinen durum (ipuçları)
- Kanun: `src/game/wanted.js` — yıldız geçişleri ≈ 139–141. satır (3★ barikat 6 sn, 4★ Özel Harekât 2 sn, 5★ ordu 3 sn + helikopter 4 sn sonra: çok hızlı),
  `LAW_CAP`, barikat tankı ≈ 632, `updateTank` ≈ 900 (ıska `miss = (1 - min(1, 30/d))*6 + 2`, 200 hasar, 7 m yarıçap: yakında hiç ıskalamıyor),
  helikopter roketi ≈ 1058 (`rocketT` 8–12 sn), araçtan ateş isabeti ≈ 877. Roket mermisi `combat.js` `rocket()` ≈ 803, patlama ≈ 1142–1160.
- Askerî üs: `MILITARY_BASE` (`src/world/map.js`), davranış `src/game/military.js`.
- Sarı ok: `src/ui/guide.js` ≈ 125–137 (`s = min(14, max(1, dc/16))` — hedef kameraya yakınken/kamera okun içindeyken ok ekranı kaplıyor; okun taban boyunu da ölç).
- Görevler: `src/game/missions.js`, `story_acts.js`, `story_data.js`, `side_missions.js`; testler `story-steps.js` (18), `story2-steps.js` (39), `law8-steps.js`, `guide-steps.js`.

## İşler (bu sırayla; her biri bitince commit)
1. **Kademeli, adil kanun tırmanması (O1).** Varış: 1–2★ yalnız yakın devriye; 3★ barikat ≥ 25 sn sonra; 4★ Özel Harekât ≥ 35 sn; 5★ helikopter ≥ 30 sn, ordu/tank ≥ 60 sn
  ve yalnız oyuncu 5★'ı o süre koruyunca. Birim gelişi duyurulur (telsiz + yazı), mini haritada görünür.
  Tank ve helikopter roketi: ilk atıştan önce uyarı (namlu dönüşü + ses, ≥ 1,5 sn), sapma en az 4 m + mesafeyle artar, oyuncu hareket ediyorsa
  öncülemez; 10 atıştan ≤ 3'ü doğrudan isabet (ölç). Roket hasarı yaya oyuncuya en çok 120 (tam can ölmez, zırhla daha az).
  Oyuncu dayanıklılığı: zırh gerçekten emer; yaralıyken kısa "son nefes" süresi (kan kırmızı ekran, 2 sn içinde ikinci ağır isabet öldürür).
  Kabul: yeni `scripts/test/escalate-steps.js` — 5★'ta 60 sn hareketsiz değil kaçan oyuncu (god kapalı, zırhlı) ilk 30 sn'de ölmez; ilk tank atışı ≥ 60 sn;
  roket isabet oranı sayıyla; `law8` geçer.
2. **Görevler baştan sona yapılabilir (O2).** Görev sırasında kanun en çok görev tanımının izin verdiği yıldıza çıkar (varsayılan 3★; özellikle "polisle"
   görevlerde 4★). Her ana görevi gerçek oyuncu gibi oynayan test yoksa `story2` adımlarını kullan; ölümle biten adım sayısı 0 olmalı.
   Görev başarısızlığında "Tekrar dene" (başlangıç noktasından) ve yakın kontrol noktası.
3. **Mafya hesaplaşmaları (O3).** En az 3 yeni yan görev türü (veri tablosu + tek yürütücü): (a) çete karargâhı baskını (siper alan, kuşatan düşmanlar,
   lider), (b) pusu (yolda araç konvoyu kesilir), (c) iki çete arası hesaplaşmaya müdahale (çeteler birbirine ateş eder, oyuncu taraf seçer).
   Haritada çete bölgeleri (`DISTRICTS.gang`) üzerinden açılır; ödül para + saygı; mini haritada/haritada işaret. Polis bu görevlerde geç gelir (çete bölgesi).
   Düşman YZ'si CLAUDE.md altın kural 2'ye uyar (siper, kuşatma, menzil).
4. **Sarı ok (O4).** Ok: hedefin 1,5–3 m üstünde, ekranda boyu yaklaşık sabit ama **en çok ekran yüksekliğinin %6'sı**; kameraya 6 m'den yakınsa
   ya da kamera ile oyuncu arasına giriyorsa solar/gizlenir; hedefe 4 m'den yakın kişi hedefinde gizlenir; şeffaf, kenarı ince. Aynı anda en çok 2 ok.
   Kabul: `guide-steps.js` + yeni ölçüm: 0–200 m mesafede okun ekran yüksekliği oranı (projeksiyonla hesapla) ≤ 0,06; fotoğraftaki sahne (çay ocağı, Cin Ali) görüntüsü.
5. **Askerî üs (O5).** Tam çevre çiti (zincir çit + dikenli tel, tırmanılamaz ya da 3,25 m sınırı korunur), nizamiye: bariyer, kulübe, nöbetçiler.
   Akış: kapıda nöbetçi durdurur ("Dur! Burası askerî bölge") → oyuncu girerse 15 sn uyarı → alarm sireni + projektörler → askerler arar (son görüldüğü yere gider,
   el feneri, köşe kontrol) → görürse çatışma. Araçla girişte anında ateş yok; yalnız oyuncu ateş ederse ya da uyarıdan sonra.
   Kabul: yeni `military-steps.js` — kapıdan araçla giriş: ilk 10 sn oyuncuya ateş yok, alarm 15 sn'de, arama durumu gözlenir; çatışmada oyuncu ilk 10 sn'de ölmez.

## Kısıtlar ve sahiplik
- Sahip olduğun dosyalar: `src/game/wanted.js`, `src/game/military.js`, `src/world/military.js` (çit/kapı), `src/game/missions.js`, `src/game/side_missions.js`,
  `src/game/story_acts.js`, `src/game/story_data.js`, `src/ui/guide.js`, yeni görev/test dosyaları. `src/game/combat.js` içinde yalnız `rocket()`/patlama hasarı ve oyuncu hasar alımı (`[O]` etiketiyle).
- Dokunma: `src/entities/character.js`, `src/entities/player.js`, `combat.js` yakın dövüş (`melee`) — bunlar B ekibinin. Araç fiziği, villa, ses motoru, şehir kurulumu.
- Kare içinde bellek ayırma yok; yeni NPC'ler mevcut havuz/spawn yoluyla. Arayüz Türkçe. Gerçek marka adı yok.

## Test (bellek dar: aynı anda tek tarayıcı; atölye de tarayıcıdır; B ekibi de test koşuyor)
- Her tarayıcı işinden önce `pgrep -f "play.js|atolye"` boş olana kadar bekle. "Target crashed" bir kez tekrar.
- Derleme `node scripts/build.js`. Test: `SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/<ad> $PWD/scripts/test/<x>-steps.js`
- Sonda birer kez: smoke, combat, law8, story, story2, guide, freeze (FZ=wanted), yeni testlerin.

## Teslim
- **İlk 15 dakikada ilk commit.** Sonra her iş bitince commit. Push yok. Kota kesilirse yarım işi hemen "ARA:" commit'i.
- Commit iletileri Türkçe; sonu: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ve
  `Claude-Session: https://claude.ai/code/session_01UnEtJkLHbxmN3sdHT1yHH4`.
- Bütçe: en çok ~200 araç çağrısı. Dosyayı baştan sona okuma; Grep ile yeri bul, yalnız orayı oku. Ekran görüntüsü madde başına ≤ 2.
- `docs/galeri/o-*` önce/sonra görüntüleri (her biri ≤ 200 KB).

## Son rapor (kısa, madde madde)
Her iş: durum, ne değişti, ölçüm/görüntü kanıtı, doğrulayamadıkların, sahibinin oyunda bakması gerekenler.

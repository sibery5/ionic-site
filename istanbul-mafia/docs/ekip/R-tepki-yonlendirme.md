# Görev R — İnsan tepkileri (vurulma, ezilme, patlama, kalkış) ve canlı görev yönlendirmesi

Çalışma klasörü: `/home/user/ionic-site/.claude/worktrees/w13-tepki` (dal `w13-tepki`). Oyun `istanbul-mafia/` altında.
Önce oku: `CLAUDE.md` (altın kural 1), `BEYIN.md` (§2, §3.3, §8, 1.6 ve 1.11 dersleri), `docs/PLAN-2.0.md` ek 2 (E6, E7) ve ek (C6 sarı ok).

## Neden (oyunun sahibinin sözleri)
- "Siviller ateş ettiğimde saçma hareketler yapıyorlar, çöküyorlar; vurulmalarına rağmen yaralarını tutmuyorlar ya da saçma düşüyorlar."
- "Arabayla ezme çok saçma."
- "Bomba patladığında karakterim saçma şekilde yere düşüp düz bir şekilde yerden kalkıyor. Hissiyatı, mekanik gerçekçi insan hareketleri yok; oyunun bir duygusu yok."
- "Görev takip sistemi zayıf, yönlendirmeler zayıf. Oyuncuyu oyun içinde canlı anlık yönlendirme sistemi olmalı: görev kabul edildiğinde takip sistemi hedefleri gösterecek."
- "Kız arkadaşımı bulamıyorum; oyun üstünde 3B sarı okla göstermeli. Suçlular ve ödül avında da hedefin üstünde aşağı yukarı hareket eden 3B sarı ok."

## Bilinen durum
- Ölüm biçimleri `character.js` `poseDeath` (head/torso/shoulder/leg/bleed/prone/wall), devrilme `kd`, yaralanma `downK`, araç çarpması `entities/carhit.js`,
  vurulma tepkileri `combat.js` (`hitZone`, sendeleme). Gövde gerçekçi (CC0 MakeHuman), iskelet 27 kemik.
- Görev işaretleri: `ui/bigmap.js`, mini harita (D3 yapıldı: sürekli iğne + kenar oku + mesafe). Ödül avı oku `game/bounties.js` (kırmızı ok).

## İşler (bu sırayla; her biri bitince commit)
1. **Yaşayan vurulma tepkileri.** Bölge ve yöne göre: gövdeye isabette eğilip yarayı tutma (el yaraya, IK), kol isabetinde kolu kendine çekme, bacakta topallayıp
   dizüstü düşme, başta ani çöküş. Sivil vurulduktan sonra (ölmediyse) yarayı tutarak sendeleyip kaçar ya da yere çöküp sürünür. "Saçma çöküş" yok:
   düşüş ivmeli, yere çarpınca kısa sekme, kollar doğal. Önce/sonra görüntüleri (atölyede poz katalogu + oyun içi kısa dizi).
2. **Araçla ezme.** `carhit.js`: hıza göre çarpma noktasına göre kaputa yatma, cama çarpma, yana savrulma; yere düşüşte yuvarlanma ve doğal duruş; araç altından geçme yok.
3. **Patlama ve kalkış.** Patlamada oyuncu ve NPC'ler yönlü savrulur (havada dönme, yere çarpma, yuvarlanma). Kalkış: yüzüstü ise ellere dayanıp dize, sırtüstü ise
   yana dönüp kalkma (en az 1,2 sn, ara pozlar). "Düz tahta gibi kalkma" yok. Oyuncu için de aynısı.
4. **Canlı görev yönlendirmesi.** Görev kabul edilince: ekranda görev adımı yazısı (sol üst, kısa), hedef mesafesi, hedefin üstünde 3B sarı ok (aşağı-yukarı sallanan,
   uzakta büyüklüğü sabit), hedef ekran dışındaysa ekran kenarında ok; mini haritada GPS rotası (yol ağı üzerinde en kısa yol çizgisi). Her adımda güncellenir.
   Kız arkadaş, ödül avı hedefi, suçlular için de aynı 3B sarı ok (ödül avının kırmızı oku sarıya döner).
   Kabul: `story2-steps.js` ya da yeni test — görev kabulünden bitişine her adımda ok + mesafe + rota var; ok hedefin 1,5–3 m üstünde.

## Kısıtlar
- Karakter başına animasyon ≤ 0,1 ms (`charperf-steps.js`); kare içinde bellek ayırma yok.
- Sahip olduğun dosyalar: `src/entities/character.js` (ölüm/devrilme/kalkış/tepki pozları), `src/entities/carhit.js`, `src/game/combat.js` (tepki tetikleri),
  `src/ui/` görev HUD'u ve 3B ok, `src/ui/bigmap.js`, mini harita, `src/game/bounties.js`, görev adımı sunumu. Araç fiziği, villa, ses motoru, gövde birleştirme dosyalarına dokunma.
- CSS'te sürekli `transform` animasyonu yok (BEYIN: test tarayıcısında bellek patlaması). Arayüz Türkçe.

## Test (bellek dar: aynı anda tek tarayıcı; atölye de tarayıcıdır)
- Her tarayıcı işinden önce `pgrep -f "play.js|atolye"` boş olana kadar bekle (başka ekip ve baş mühendis de test çalıştırıyor). "Target crashed" bir kez tekrar.
- Derleme `node scripts/build.js`. Test: `SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/<ad> $PWD/scripts/test/<x>-steps.js`
- Sonda birer kez: smoke, character, charperf, react, pedhit, combat, story2.

## Teslim
- **İlk 15 dakikada ilk commit.** Sonra her iş bitince commit. Push yok.
- Commit iletileri Türkçe; sonu: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ve
  `Claude-Session: https://claude.ai/code/session_01UnEtJkLHbxmN3sdHT1yHH4`.
- Bütçe: en çok ~180 araç çağrısı. Dosyayı baştan sona okuma; Grep ile yeri bul, yalnız orayı oku.
- `docs/galeri/r-*` önce/sonra görüntüleri (her biri ≤ 200 KB).

## Son rapor (kısa, madde madde)
Her iş: durum, ne değişti, ölçüm/görüntü kanıtı, doğrulayamadıkların, sahibinin oyunda bakması gerekenler.

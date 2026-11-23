# Görev V3 — Villa: ilk giriş donması, korumalar, kapı, kırılan camlar, teras, canlı dış görünüm

Çalışma klasörü ve dal: başlatırken verilir (`.claude/worktrees/w17-villa`, dal `w17-villa`). Oyun `istanbul-mafia/` altında.
Önce oku: `CLAUDE.md`, `BEYIN.md` (§2, §3.1, §3.2, 1.11 ve **V2 dersleri**), `docs/PLAN-3.0.md` (V1–V4), önceki villa brifleri `docs/ekip/V-villa.md`, `V2-villa-sehir.md`.
Fotoğraflar: `docs/galeri/ref3/oyun0.jpg` (iç mekândan düz mavi pencere).

## Neden (oyunun sahibinin sözleri)
- "Villaya ilk girişte oyun donuyor / FPS düşüyor."
- "Adamlarım her zaman villanın etrafında ve içinde olsun; biri saldırırsa beni korusunlar; geldiğimde selam versinler, kapıyı açsınlar."
- "İçeriden dışarısı kötü görünüyor; camlardan dışarı ateş edemiyorum, cam kırılmıyor."
- "Terastan manzara kötü 2B gibi, şehir canlı değil; terastan ateş edemiyorum."

## İpuçları
- İç mekândan dışarısı: V2'de girişte bir kez çizilen küp görüntü, yüzler kare kare (V2 dersleri). İlk giriş donması büyük olasılıkla küp çizimi,
  ilk kez derlenen gölgelendiriciler ya da iç mekân geometrisinin ilk yüklenmesi: `freeze-steps.js` sarmalayıcı yöntemiyle (BEYIN 1.11) ölç, adıyla bul.
  Çözüm yönü: önceden ısıtma (yükleme ekranında derleme/oluşturma), işi karelere bölme, en pahalı karede ≤ 50 ms.
- Villa: `src/world/villa.js`, `src/game/interiors.js`, `PLAYER_VILLA` (`map.js`). Koruma/çete NPC'leri `src/entities/npc.js`, takipçiler (`crew`/`followers` ara).

## İşler
1. **İlk giriş donması (V1).** Kabul: villaya ilk giriş/çıkış ve ilk teras ziyaretinde en uzun kare ≤ 50 ms, 100 ms üstü kare 0 (yeni `villaenter-steps.js`, ses ısıtma kuyruğunu boşalttıktan sonra ölç).
2. **Korumalar (V2).** Villa sahibi olunca 4–6 koruma: kapıda 2, bahçede devriye 2, içeride 1–2; gece fenerli. Oyuncu kapıya araçla yaklaşınca bir koruma el sallar/selam verir
   ("Hoş geldin patron"), kapı açılır, geçince kapanır. Saldırıda (oyuncuya ya da villaya ateş eden kim olursa) korumalar siper alıp karşılık verir, oyuncuyu izler,
   polis yıldızı villa içinde artmaz ama polis gelirse korumalar polise ateş etmez (yalnız çete/düşman). Ölen koruma 3 dk sonra yenilenir.
   Kabul: test — kapı 8 m'de açılır; saldırgan çete 3 kişi villaya girince korumalar ≤ 2 sn'de çatışmaya girer; selam sesi/yazısı.
3. **Camlar ve dış görünüm (V3).** Villa camları kırılır (isabette çatlak, ikinci isabette dökülme + ses + cam kırığı parçacığı), kırık cam kare olarak kalır; içeriden dışarı ve dışarıdan içeri
   mermi geçer. İçeriden dış görünüm: düz mavi değil, gerçek şehir/deniz (küp görüntü düzgün yönde, gün saatine göre güncel; ya da pencere doğrudan dünyaya açılır).
4. **Teras (V4).** Teras ve balkonlar gerçek dünyaya açık: canlı trafik, deniz, gemiler görünür (sahte arka plan yok); terastan ateş edilebilir, nişan alınabilir.
   Kabul: teras karesinde hareketli araç/gemi görünüyor (iki kare farkı), terastan atış aşağıdaki hedefe isabet ediyor (test).

## Sahiplik
- Sahip: `src/world/villa.js`, `src/game/interiors.js` (villa bölümü), villa koruma YZ'si (yeni dosya ya da `npc.js` içinde `[V3]` etiketli kanca), cam kırılma sistemi (yeni dosya).
- Dokunma: `character.js`, `player.js`, `wanted.js`, araç fiziği, ses motoru çekirdeği (yeni ses yalnız `src/core/sfx/world.js`'e ek fonksiyon olarak, ısıtma kuyruğuna eklenir).

## Test, teslim, rapor
- Aynı anda tek tarayıcı (`pgrep -f "play.js|atolye"` boş olana dek bekle). Sonda birer kez: smoke, villa, freeze (FZ=crash), collision, yeni testler.
- İlk 15 dakikada ilk commit; her iş bitince commit; push yok; kota kesilirse "ARA:" commit'i. Commit sonu iki satır (Co-Authored-By, Claude-Session; O-oynanis.md'deki gibi).
- Bütçe ~200 araç çağrısı; dosyayı baştan sona okuma. `docs/galeri/v3-*` (≤ 200 KB). Rapor: iş başına durum, ölçüm, kanıt, doğrulayamadıkların.

# Görev H — Hareket, kamera ve harita işaretleri

Çalışma klasörü: `/home/user/ionic-site/.claude/worktrees/w9-hareket` (dal `w9-hareket`). Oyun `istanbul-mafia/` altında.
Önce oku: `CLAUDE.md`, `BEYIN.md` §2, §3, §8 ve 1.6 dersleri. Kabul kriterlerinin tam metni `docs/PLAN-1.5.md` içinde (madde kimlikleriyle).

## Neden
Oyunun sahibinin hâlâ açık şikâyetleri: "duvardan atlayamıyorum", "araba gasp ederken kapının içinden geçiyor", "kamera duvarların içini gösteriyor",
"tekneden inince denize düşüyorum, teknede gezemiyorum, tekneler çok yavaş", "Baba'nın görevleri haritada görünmüyor, yanıp sönüp kayboluyor",
"ödül avında hedefin üstünde ok olsun", "arabayla birine çarpınca FPS düşüyor ve efekt kötü".

## İşler (bu sırayla; her biri bitince commit)
1. **D3 Görev işaretleri** (küçük, önce bu). İpucu: `ui/bigmap.js` çizimi `blinkUntil` / `mk.blink` süresine bağlı. Aktif hedef büyük haritada ve mini haritada
   **sürekli** görünür (iğne + nabız halkası); mini harita kenarında yön oku ve mesafe. Test: `story2-steps.js` ya da yeni test — görev kabulünden bitişine her adımda işaret var.
2. **D4 Ödül avı oku.** Hedef 60 m içinde ve görünürken tepesinde ok + ekran kenarı oku + mesafe; bölgeye girince mini haritada daire.
3. **M6 Kamera duvar içi.** Kök neden: yaya kamerası tek ışınla korunuyor (`player.updateCamera`), near 0,15; near düzleminin köşeleri duvara giriyor.
   Kabul: kamera duvara yaslanınca near düzleminin dört köşesi de duvarın önünde (küre/çoklu ışın testi); dar sokakta kamera titremez.
4. **H1 Duvara tutunup aşma.** 1,5 / 2,0 / 2,5 m duvarlarda zıpla → tutun → çek → aş → in (1,2–2,2 sn); 3 m aşılamaz; askeri duvar reddedilir (`noClimb`).
   `player.js` içinde `tryVault` (~98. satır) var; genişlet. Test: `mantle-steps.js`.
5. **H2 Gaspta kapı.** Oyuncu kapının süpürdüğü yayın dışında (B direği yanında) durur; kapı açılır, sürücü çekilir, oyuncu koltuğa kayar.
   Kabul: oyuncu kapsülü ile kapı kutusu 0 karede kesişir; süre ≤ 2,2 sn. Test: `law-steps.js` 8. bölüme ek (`LAW_ONLY=8`).
6. **H4 + H5 Tekne.** Güverte teknenin yerel koordinatında yürünebilir platform; tekne 10 sn sürüklenirken oyuncu güvertede kalır; küpeşteden atlayınca suya girer.
   Azami hız: sürat teknesi 24–28 m/s, motor yat 14–17, mega yat 9–11, balıkçı 5–6. Test: `sea-steps.js`'e ek.
7. **M8 + H3 Yayaya çarpma.** Önce ölç: 20 sn'de 10 yayaya 12 m/s çarpma, adım süresi p95 ve en kötü kare. Takılma kaynağını bul ve düzelt.
   Efekt hıza göre: < 4 m/s sendeleme, 4–10 kaputa yatıp yana yuvarlanma, > 10 savrulma (12 m/s'de 4–9 m); yaya gövdenin içinden geçmez.

## Kısıtlar
- İnsanlar gerçekçi model (`charMH.js`), arabalar yeni gövde; iskelet/animasyon API'si ve araç düğümleri (kapı menteşesi `setDoor`, koltuk) aynı.
- Kare içinde bellek ayırma yok. Arayüz metinleri Türkçe.
- Sahip olduğun dosyalar: `entities/player.js` (hareket, kamera), `game/carjack.js`, `entities/boats.js`, `ui/bigmap.js`, mini harita, `game/bounties.js`,
  yeni `entities/mantle.js`. `character.js` ve `vehicles.js` içinde yalnız `[hareket]` etiketli küçük kancalar. Villa, ses, intro, çatışma koduna dokunma.

## Test (bellek dar: aynı anda tek test, düşük kalite)
- `pgrep -f "scripts/test/play.js"` doluysa bekle. Tarayıcı süreçlerini öldürme. "Target crashed" bellek çökmesidir: bir kez tekrar et.
- Derleme `node scripts/build.js`. Test: `SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/<ad> $PWD/scripts/test/<x>-steps.js`
- Görsel işlerde (işaret, ok, tırmanma) en çok 2–3 kare al, kareyi çizdiğin görevde `toDataURL` ile oku ve Read ile bak.
- Sonda birer kez: smoke, story2, sea, law (`LAW_ONLY=8`), mantle, collision (`AUDIT_ONLY=1`).

## Teslim
- **İlk 15 dakikada ilk commit.** Sonra her iş bitince commit. Push yok.
- Commit iletileri Türkçe; sonu: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ve
  `Claude-Session: https://claude.ai/code/session_01UnEtJkLHbxmN3sdHT1yHH4`.
- Bütçe: en çok ~170 araç çağrısı. Dosyayı baştan sona okuma; Grep ile yeri bul, yalnız orayı oku. Bütçe biterse kalan maddeleri raporda say.

## Son rapor (kısa, madde madde)
Her iş: durum, ne değişti, test kanıtı (sayı). Sahibinin oyunda bakması gerekenler. Doğrulayamadıkların.

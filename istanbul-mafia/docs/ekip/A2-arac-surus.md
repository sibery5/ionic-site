# Görev A2 — Sürüş hissi, araç tasarımı, gösterge, trafik yoğunluğu

Çalışma klasörü: `/home/user/ionic-site/.claude/worktrees/w10-arac` (dal `w10-arac`). Oyun `istanbul-mafia/` altında.
Önce oku: `CLAUDE.md`, `BEYIN.md` (§2, §3, §8 ve 1.6/1.11 dersleri), `docs/PLAN-2.0.md` (B1 ve ek K7, K13, K14, K17).

## Neden (oyunun sahibinin sözleri)
- "Araba yola tutunmuyor, aşırı kayıyor, fren dahi yapamıyor, drift yapamıyor; buz pistinde sürüyormuşum gibi. Viraj performansını, yol tutuşunu, freni geliştir.
  Motosikletlerde de öyle."
- "Araba hızlandıkça egzozdan turbo/nos gibi ateş atsın, vites atarken ve düşürürken."
- "Arabaların tasarımlarını geliştir; gerçek arabalara benzesin, ızgaraları spor görünümleri olsun. Otobüsler, kamyonlar, motosikletler daha güzel."
- "Hız göstergesi yuvarlak, gerçek bir araç göstergesi gibi olsun, vites göstergesi olsun."
- "Şehirde daha fazla araba, park edilmiş araba olsun." Ayar: "kırmızı ışık cezasını yarıya indir, tekneleri biraz hızlandır."

## İşler (bu sırayla; her biri bitince commit)
1. **Sürüş teşhisi (önce ölç, sonra düzelt).** `drivefeel-steps.js`'i genişlet: düz çizgide 100→0 fren mesafesi ve sapma; 60 ve 90 km/s'de tam direksiyon
   (klavye gibi ani) 1 sn: kayma açısı, savrulma (spin) var mı; 50 m yarıçaplı virajda azami hız ve kayma açısı; el freniyle drift ve toparlanma.
   "Buz" hissinin kök nedenini sayıyla yaz (lastik sürtünme eğrisi, yanal tutuş, ağırlık aktarımı, direksiyon hızı, sönüm) — tahmin değil.
   Kabul: 100→0 ≤ 28 m sapmasız; 60 km/s ani tam direksiyonda savrulma yok, kayma açısı ≤ 6°; 50 m virajda kayma ≤ 4°; el freniyle kontrollü drift
   (30–60° kayma) ve 1,5 sn içinde toparlanma; ABS benzeri: fren + direksiyon birlikte çalışır. Motosiklet için de aynı ölçümler (eşikler uygun).
2. **Egzoz alevi.** Vites yükseltme/düşürme anında ve yüksek devirde gaz kesince egzoz ucundan kısa alev + patlama sesi (havuzlu parçacık, kare içinde ayırma yok).
3. **Gösterge.** Araçtayken sağ altta yuvarlak gösterge: hız ibresi ve ölçeği, devir yayı, vites (P/R/N/1–6), yakıt değil; ince modern tasarım
   (ince çizgiler, beyaz/kehribar ışıklı ölçek, koyu cam zemin). Gerçek marka logosu yok. Canvas 2D ya da SVG; her karede yeniden çizim yok (değişince).
4. **Araç tasarımı.** `vehicles.js` model üreticileri: spor ızgara (bal peteği/dikey çubuk), ince LED far şeritleri, difüzör, yan hava girişleri;
   sedan/hatch/SUV/GT ön yüzleri birbirinden ayırt edilir; otobüs ve kamyonun ön/arka yüzü (cam, far, tampon) yeniden; motosiklet gövdesi.
   Gerçek marka adı/logosu yok. Her değişikliği atölyede görüntüle ve Read ile bak (`node scripts/atolye.js araba:gt araba:bus --gorunus q,f,b`).
   Bütçe: LOD0 ≤ 32 bin üçgen/araba (otobüs, kamyon ≤ 45 bin).
5. **Trafik ve park yoğunluğu.** Orta ayarda hareketli trafik ve park eden araç belirgin artsın (ör. hareketli +40 %, park ×2, spor araba oranı ↑).
   Kabul: mantık p95 ≤ 6 ms (ölç), bina içinde araç yok, `collision-steps.js` (AUDIT_ONLY=1) temiz.
6. **Ayarlar.** Kırmızı ışık cezası ÷2; tekne azami hızları +15 %.

## Kısıtlar
- Sahip olduğun dosyalar: `src/entities/vehicles.js`, `src/entities/vehicle_physics.js`, `src/game/economy.js` (yalnız CARS ve ceza değeri),
  trafik/park üretimi, araç HUD'u (yeni `src/ui/speedo.js` olabilir), egzoz efekti. Karakter, çatışma, villa, ses motoru dosyalarına dokunma
  (egzoz patlama sesi için `audio`'da var olan bir sesi çağır; yoksa tek etiketli kanca).
- Kapı paneli ve kapı deliği (`setDoor`, `cutDoorHole`) yeni düzeltildi: bozma; gövde değişirse atölyede `kapi:sedan` ve `kapi:kapandi` ile denetle.
- Kare içinde bellek ayırma yok. Arayüz Türkçe.

## Test (bellek dar: aynı anda tek tarayıcı; atölye de tarayıcıdır)
- `pgrep -f "scripts/test/play.js"` doluysa bekle. Tarayıcı süreçlerini öldürme. "Target crashed" bir kez tekrar edilir; iki kez aynı yerde ise sebebi ara.
- Derleme `node scripts/build.js`. Test: `SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/<ad> $PWD/scripts/test/<x>-steps.js`
- Sonda birer kez: smoke, drivefeel, vfunc, law (`LAW_ONLY=8`), collision (`AUDIT_ONLY=1`), freeze (`FZ=crash`).

## Teslim
- **İlk 15 dakikada ilk commit.** Sonra her iş bitince commit. Push yok.
- Commit iletileri Türkçe; sonu: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ve
  `Claude-Session: https://claude.ai/code/session_01UnEtJkLHbxmN3sdHT1yHH4`.
- Bütçe: en çok ~180 araç çağrısı. Dosyayı baştan sona okuma; Grep ile yeri bul, yalnız orayı oku.
- `docs/galeri/` altına önce/sonra: GT, sedan, SUV, otobüs, motosiklet 3/4 ve gösterge görüntüsü (her biri ≤ 200 KB).

## Son rapor (kısa, madde madde)
Her iş: durum, kök neden (sürüş), önce/sonra sayıları, görüntülerde zayıf kalanlar, doğrulayamadıkların, sahibinin oyunda bakması gerekenler.

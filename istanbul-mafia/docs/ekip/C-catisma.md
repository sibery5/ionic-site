# Görev C — Çatışma hissi ve kanun

Çalışma klasörü: `/home/user/ionic-site/.claude/worktrees/w6-catisma` (dal `w6-catisma`). Oyun `istanbul-mafia/` altında.
Önce oku: `CLAUDE.md` (altın kural), `BEYIN.md` §2 ve §7–§8, `docs/PLAN-1.5.md` §3 "Ekip C" (C1–C8 kabul kriterleri orada).

## Neden
Oyunun sahibi: "çatışmalar gerçekçi değil, imleç kötü, vurulma mekanikleri kötü." Ayrıca açık istekleri:
sokak hayvanlarına saldırı olmayacak ve ekranda **"GERÇEKTEN MASUM BİR HAYVANA ZARAR MI VERECEKSİN?"** yazacak;
polis arabayla gelip önce "Dur polis" diye uyaracak, arabayı siper alacak, sonra ateş edecek; kaçış biraz zorlaşacak;
silah başına yakınlaştırma, nişangâh ve tepme klasik rekabetçi FPS oyunlarındaki gibi olacak.

## İşler (bu sırayla; her biri bitince commit)
1. **C8 Hayvan koruması** (küçük, önce bu). Silah, yumruk, bıçak ve araç hayvana hasar vermez. Nişan hayvandayken tetik çalışmaz;
   ekranın ortasında büyük yazı çıkar: "GERÇEKTEN MASUM BİR HAYVANA ZARAR MI VERECEKSİN?" (2–3 sn, tekrar tetiklenebilir, spam yok).
   Araç hayvana yaklaşınca hayvan kaçar (ezilmez). Birkaç farkındalık cümlesi (mama kabı, su) uygun yerde HUD ipucu olarak.
2. **C1 Silah hissi.** Silah başına veri satırı (mevcut tabloya ekle): ilk mermi isabeti, seri atışta **sabit tepme deseni** (öğrenilebilir),
   hareket/zıplama cezası, toparlanma süresi, nişan yakınlaştırması. Nişangâh silaha göre: tabanca küçük artı, pompalı halka, tüfek dinamik artı
   (yayılmayla açılır), keskin nişancı dürbün dışı nokta yok. İsabet işareti (gövde beyaz, baş kırmızı, öldürme kalın) + ayrı ses.
   Tepme kamerada hissedilir ve bırakınca merkeze döner. Dürbün: tam ekran dürbün görüntüsü, nefes tutma (Shift) ile salınım azalır.
3. **Vurulma tepkileri** (altın kural 1). Bölgeye ve mermi yönüne göre sarsılma/sendeleme, bacak → topallama, kol → silah düşebilir,
   kan/toz izi, ölümde yöne göre düşme. Var olanı ölç; görünmeyen ya da zayıf olanı güçlendir. Oyuncu vurulunca yön göstergesi + kamera sarsıntısı.
4. **C4 Atlatma.** Görüş dışı süreleri 14/24/36/50/65 sn; devriyeler son görülen bölgeyi tarar.
5. **C3 Polis müdahalesi.** Devriye aracı gelir, 12–20 m'de durur, megafon "Dur! Polis! Silahını bırak!"; polisler aracın arkasında siper alır;
   3–4 sn içinde teslim olmazsan ya da ateş edersen ateş açarlar. Yıldız 1'de yaya polis de önce uyarır.
6. Bütçe kalırsa C5 (rekabet) ve C7 (helikopter saldırıları). C2 (silah modelleri) ve C6 senin işin değil.

## Kısıtlar
- İnsan gövdeleri artık gerçekçi model (`src/entities/charMH.js`); iskelet ve animasyon API'si aynı. Karakter/araç model dosyalarına dokunma.
- Tabanca ve keskin nişancı modeli hazır GLB (`src/core/props.js`, `weapons.js` içinde `PROP_DEF`); namlu ucu oradan gelir.
- Kare içinde bellek ayırma yok; yeni efektler havuzdan. Arayüz metinleri Türkçe. Gerçek marka adı yok.
- Sahip olduğun dosyalar: `src/game/combat.js`, `weapons.js` (veri + nişangâh), `wanted.js`, `src/ui/` içindeki HUD nişangâh/işaret kısmı,
  hayvanlar için ilgili dosya, polis davranışı için `npc.js` içindeki kanun kısmı. Başka sistemde değişiklik gerekiyorsa en küçük kancayı ekle.

## Test (bellek dar: aynı anda tek test, düşük kalite)
- `pgrep -f "scripts/test/play.js"` doluysa bekle. Tarayıcı süreçlerini öldürme.
- Derleme `node scripts/build.js`. Test: `SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/<ad> $PWD/scripts/test/<x>-steps.js`
- Her iş için küçük bir test adımı yaz ya da var olanı genişlet (ör. `combat-steps.js`, `law-steps.js`, yeni `animal-steps.js`):
  hayvana ateş → hasar 0 + yazı göründü; tepme deseni iki seride aynı; isabet işareti; kaçış süresi; polis uyarıdan önce ateş etmiyor.
- Sonda birer kez: smoke, combat, body, law (yalnız ilgili bölüm), yeni testlerin. "Target crashed" bellek çökmesidir: bir kez tekrar et.

## Teslim
- **İlk 15 dakikada ilk commit** (C8). Sonra her iş bitince commit. Push yok.
- Commit iletileri Türkçe; sonu: `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>` ve
  `Claude-Session: https://claude.ai/code/session_01UnEtJkLHbxmN3sdHT1yHH4`.
- Bütçe: en çok ~150 araç çağrısı. Dosyayı baştan sona okuma; Grep ile ilgili yeri bul, yalnız orayı oku.

## Son rapor (kısa, madde madde)
Her iş: durum, ne değişti, test kanıtı (sayılar). Hissi sen ölçemezsin: sahibinin oyunda bakması gerekenleri ayrıca yaz. Doğrulayamadıklarını gizleme.

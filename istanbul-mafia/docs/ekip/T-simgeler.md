# Görev T — Tarihî simgeler: gerçek oran, gerçek konum, büyük parsel, çevresiyle

Çalışma klasörü ve dal: başlatırken verilir (`.claude/worktrees/w21-simge`, dal `w21-simge`). Oyun `istanbul-mafia/` altında. Ş ekibinin birleşmesinden sonra başlar.
Önce oku: `CLAUDE.md`, `BEYIN.md` (§2, §3.1, 1.6 dersleri: hazır CC0 önce), `docs/PLAN-3.0.md` (§0 ölçek ve lisans notu), Ş ekibinin `LANDMARK_PLOTS` tablosu.
Referanslar: `docs/galeri/ref3/ist0.jpg`, `ist1.jpg`, `ist2.jpg`, `oyun0.jpg` (bugünkü Galata: düz çizgili silindir — kötü örnek).

## Neden (oyunun sahibinin sözleri)
- "Kız Kulesi, Galata Kulesi, Sultanahmet, Ayasofya, Topkapı Sarayı, Dolmabahçe Sarayı, Ortaköy Camii, Rumeli Hisarı, Yerebatan Sarnıcı, Kapalıçarşı, İstiklal Caddesi ve Taksim,
  Balat ve Fener, Pierre Loti, Prens Adaları — düzgün yapılsın; doğru konumda, büyük arsalarında. Galata vb. çok basit."

## Kurallar
- Lisans: yalnız CC0 (Poly Haven vb.) doku/aksesuar; OSM (ODbL) ve atıf isteyen modeller yok. Bulamazsan kodla, referans fotoğraflardan gerçek oranla modelle.
  Araştırma: yapıların gerçek ölçüleri (yükseklik, kubbe çapı, minare sayısı/şerefe, avlu boyu) web kaynaklarından; her yapı için `docs/simgeler.md`'ye ölçü + kaynak bağlantısı.
- Her yapı atölyede (`scripts/atolye.js`) stüdyo ışığında 4 açıdan + oyunda gündüz/gece kare. Yapı başına üçgen bütçesi (ölç, raporla); uzak LOD siluet; çarpışma kutuları kapı/avlu gerçekçi.
- Gece aydınlatması (Galata, Kız Kulesi, camiler: projektör ışığı, emissive), minareler yola taşmaz, avlu ve meydanlar yürünebilir.

## İşler (öncelik sırası)
1. Galata Kulesi (konik külah, taş gövde, seyir balkonu, çevresinde dar yokuş sokaklar).
2. Kız Kulesi (adacık, kule + yapı, rıhtım; tekneyle yanaşma).
3. Sultanahmet (6 minare, kademeli kubbeler, avlu, Sultanahmet Meydanı) ve Ayasofya (büyük kubbe, payandalar, 4 minare, pembe-kiremit ton), aralarında park ve fıskiye.
4. Topkapı Sarayı (Bab-üs Selam iki konik kuleli kapı, avlular, Adalet Kulesi, Sarayburnu'na bakan konum) + Yerebatan girişi + Kapalıçarşı (kubbeli çarşı, kapılar, içi yürünebilir koridor).
5. Dolmabahçe Sarayı (uzun neo-barok cephe, saat kulesi, kıyı rıhtımı), Ortaköy Camii (köprü ayağının yanında, kıyıda), Rumeli Hisarı (surlar, üç büyük kule, yamaçta).
6. İstiklal Caddesi + Taksim Meydanı (nostaljik tramvay, anıt, yaya caddesi), Balat/Fener (renkli evler, yokuş, Fener Rum Okulu benzeri kırmızı yapı), Pierre Loti (tepe, teleferik, kahve),
   Adalar (en az 2 ada: faytonsuz sokaklar, köşkler, iskele, vapur hattı).

## Sahiplik
- Sahip: `src/world/landmarks.js` (+ yeni `src/world/landmarks/*.js`), atölye katalog girişleri, `docs/simgeler.md`.
- Dokunma: şehir yerleşimi (yalnız Ş'nin verdiği arsaları kullan), karakter, araç, kanun, arayüz (harita simgeleri için A ile `[T]` etiketli küçük kanca).

## Test, teslim, rapor
- Aynı anda tek tarayıcı. Sonda birer kez: smoke, collision, bridge, freeze (FZ=crash), yeni `landmark-steps.js` (her yapının çarpışması, kapıdan girilebilir avlular, üçgen sayısı).
- İlk 15 dakikada ilk commit; her yapı bitince commit; push yok; kota kesilirse "ARA:" commit'i. Commit sonu iki satır (O-oynanis.md'deki gibi).
- Bütçe ~250 araç çağrısı. `docs/galeri/t-*` (≤ 200 KB). Rapor: yapı başına durum, ölçü kaynağı, üçgen, kare, doğrulayamadıkların.

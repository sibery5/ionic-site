# İstanbul Mafya

Prosedürel İstanbul'da geçen, 3D açık dünya mafya / yaşam oyunu (Three.js + Electron). Hiçbir hazır varlık yoktur:
tüm modeller, dokular, ikonlar, sesler ve müzik kodla üretilir.

## Kurulum
- **Windows:** `IstanbulMafya-Kurulum-x.y.z.exe` dosyasını çalıştır (tek tık kurulum). GitHub Actions her push'ta bu dosyayı
  `IstanbulMafya-Windows-Kurulum` artifact'ı olarak üretir.
- **Geliştirme:** `npm install` → `npm start` (derler ve Electron'da açar). Kurulum dosyası: `npm run dist:win`.

## Kontroller
WASD yürü/sür · Shift koş · Space zıpla / el freni · C çömel (koşarken: yuvarlan) · V omuz değiştir · Sağ tık nişan ·
Sol tık ateş · R şarjör · 1-9 / Q / teker silah · F araca bin/in · E etkileşim · H korna · M harita · Tab istatistik ·
I çanta · P telefon · F5 hızlı kayıt · F9 hızlı yükleme · ESC menü

## İçerik
- Boğaz, Haliç, Marmara, 3 köprü, Galata, Sultanahmet, Ayasofya, Süleymaniye, Kapalıçarşı, Dolmabahçe, Kız Kulesi,
  Haydarpaşa; polis karakolları, askerî üs, havalimanı, marina, yalılar; her kapı bir iç mekâna açılır
- 25 görevlik, 4 perdelik hikâye; 3 seçim noktası ve 4 son; yan görevler, sokak olayları, kontratlar, bölge savaşları
- Yasal (taksi, kurye, otobüs, tamirci, koruma, borsa, işletme) veya suç (karaborsa, araç hırsızlığı, soygun, haraç) yolu
- Butik (dene → sepet → kasa), oto galeri (test sürüşü), emlak (daire, penthouse, yalı), tekne, yat, helikopter, uçak
- Trafik ışıkları, trafik ve polis yapay zekâsı, barikatlar, özel harekât, asker müdahalesi; vapurlar ve gemiler
- 12 silah, bıçaklama/arkadan saldırı, yönlü kan, katmanlı patlamalar, prosedürel sesler ve Hicaz makamında müzik
- Gün/gece döngüsü, yağmur ve ıslak zemin, şimşek; kayıt/yükleme (3 yuva + otomatik)

Mimari ve katkı kuralları: `ARCHITECTURE.md` · Testler: `scripts/test/README.md` · Steam: `steam/README.md`

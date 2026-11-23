# Görev A — Arayüz ve görünüm: 3B harita ve lejant, menüler, ayarlar (hava, saat), dağlar ve çimen, ışık ve renk

Çalışma klasörü ve dal: başlatırken verilir (`.claude/worktrees/w20-arayuz`, dal `w20-arayuz`). Oyun `istanbul-mafia/` altında.
Önce oku: `CLAUDE.md`, `BEYIN.md` (§2, §3.1, §3.2, dersler — CSS'te sürekli transform animasyonu yok), `docs/PLAN-3.0.md` (A1–A5).

## Neden (oyunun sahibinin sözleri)
- "M haritası gerçekçi, 3B dokulu olsun; sağdaki göstergeler ve simgeler düzgün olsun."
- "Oyun menüsünü ve duraklatma menüsünü geliştir. Ayarlarda hava durumu ve gece/gündüz/saat elle seçilsin."
- "Dağların 3B'sini, çimen ve dağ rengini geliştir."
- "Görsel kalite yüksek olsun (büyük açık dünya oyunlarının ışığı, rengi)."

## İpuçları
- Harita `src/ui/bigmap.js`, mini harita `src/ui/`; menüler `src/ui/` + `app/index.html` şablonu (derleme `scripts/build.js`). Hava/saat `src/world/sky.js`, `postfx.js`, yağmur/sis sistemleri (ara: `weather`).
- Dağ: `src/world/mountain.js`, `terrain.js`, `vegetation.js`; CC0 dokular `assets/tex/` (Poly Haven, `pack-textures.py`, KAYNAK.md).

## İşler
1. **3B harita (A1).** Yukarıdan eğik bakışlı, dokulu (çatı/yol/su/yeşil alan renkleri gerçekçi), yakınlaştırma/döndürme, semt adları, simge yapılar küçük 3B ya da simge; sağda kategori lejantı
   (görev, dükkân, tamirci, silahçı, ev, villa, emniyet, hastane, havalimanı...) seçilebilir/gizlenebilir; ölçek çubuğu. Harita açılışı ≤ 150 ms (ilk açılış dahil, önceden hazırlanır).
2. **Menüler (A2).** Ana menü: canlı şehir arka planı (yavaş kamera turu, düşük maliyetli), devam/yeni oyun/ayarlar/çıkış; duraklat menüsü: harita, görevler, istatistik, ayarlar, kaydet; tutarlı tasarım, Türkçe.
3. **Ayarlar (A3).** Hava: açık/parçalı bulutlu/kapalı/yağmurlu/sisli/otomatik; saat: kaydırıcı (00–24) + "zaman aksın/dursun"; anında uygulanır, kayıtta saklanır. Grafik ön ayarları korunur.
4. **Dağ ve çimen (A4).** Dağ yüzeyi: eğime göre çimen/toprak/kaya karışımı (CC0 doku), çimen rengi doğal (sarı-yeşil değil), uzak dağlarda hava perspektifi; çimen öbekleri yakında (instanced, mesafe ile solma).
5. **Işık ve renk (A5).** Ton eşleme ve renk düzeltme, gökyüzü/sis uyumu, gün batımı; FPS'i düşürmeden (ölç: önce/sonra kare süresi, `quality` ön ayarlarına göre).

## Sahiplik
- Sahip: `src/ui/bigmap.js`, mini harita, menü/ayar arayüzü, `src/world/sky.js`, `postfx.js`, hava sistemi, `mountain.js`, `vegetation.js` (dağ/çimen kısmı).
- Dokunma: `src/ui/guide.js` (O ekibi), şehir kurulumu (Ş ekibi), karakter, araç, kanun.

## Test, teslim, rapor
- Aynı anda tek tarayıcı. Sonda birer kez: smoke, mountain, guide, freeze (FZ=crash), yeni harita/ayar testi.
- İlk 15 dakikada ilk commit; her iş bitince commit; push yok; kota kesilirse "ARA:" commit'i. Commit sonu iki satır (O-oynanis.md'deki gibi).
- Bütçe ~200 araç çağrısı. `docs/galeri/a-*` (≤ 200 KB). Rapor: iş başına durum, ölçüm, kanıt, doğrulayamadıkların.

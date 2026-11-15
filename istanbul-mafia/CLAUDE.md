# İstanbul Mafya — Geliştirme Kuralları

## ALTIN KURAL: Oyun mantığı ve hissiyat her şeyden önce gelir

Bir oyunu güzel yapan detaylardır. Her sistem, oyuncunun gözünden **mantıklı ve inandırıcı** davranmalı.
Bir şey "teknik olarak çalışıyor" diye bitmiş sayılmaz; oyuncu ona baktığında doğal görünmüyorsa bitmemiştir.

1. **Mekanik tepkiler:** Her karakter (oyuncu, polis, asker, çete, sivil) etkiye kendine özgü tepki verir.
   Vurulunca sarsılır, merminin geldiği yöne göre sendeler; vurulan bölge önemlidir (bacak → topallama,
   kol → silah düşer); kamera ve beden tepkisi hissedilir.
2. **Taktiksel yapay zekâ:** Çatışmadaki NPC'ler
   - silahının etkili menzilinde savaşır, çok uzaktan ateş etmez; gerekirse siperden sipere ilerler, kuşatır;
   - ateş altındayken tehdidi fark eder: sırtını dönüp sabit bir hedefe koşmaz, hedefini yeniden seçer,
     hareket ederken karşılık verir, gerekirse çömelir/yatar;
   - duvarın içine yürümez, kapıları ve yolları kullanır, engelin üstünden atlar.
3. **Fizik ve dünya tutarlılığı:** Görünen her nesnenin çarpışması vardır; araçlar, yayalar ve gemiler
   dünyanın geometrisine (köprü tabliyesi, rıhtım, rampa) uyar.
4. **Performans hissiyatın parçasıdır:** Yeni bir özellik FPS'i düşürüyorsa bitmiş değildir. Ölç, sonra çıkar.

## Çalışma kuralları
- Modeller, sesler ve müzik kodla üretilir; hazır model ya da ses kullanılmaz. Gerçek marka adı kullanılmaz.
- Tek istisna (kullanıcı kararı, 1.5): şehir yüzeylerinde (asfalt, kaldırım, duvar, çatı, çim, taş, ağaç kabuğu) telifsiz **CC0**
  fotoğraf dokuları kullanılır. Kaynak ve lisans `assets/tex/KAYNAK.md` içindedir; yeni doku `scripts/assets/pack-textures.py`
  tablosuna satır eklenerek gelir. Atıf isteyen ya da ticari kullanımı kısıtlı içerik kullanılmaz.
- Kodla üretilen her model atölyede (`scripts/atolye.js`) stüdyo ışığında görüntülenir ve gözle denetlenir; "kod çalışıyor" kabul değildir.
- Arayüz metinleri ve yorumlar Türkçe.
- Her değişiklikten sonra ilgili headless testler çalıştırılır (`scripts/test/`): en az `smoke-steps.js`,
  dokunulan sisteme göre `collision-steps.js`, `bridge-steps.js`, `combat-steps.js`, `story-steps.js`.
- Kota sınırlı: gereksiz deneme döngüsü yok, az ekran görüntüsü, işi aşama aşama commit'le.
- Mimari ve modül sahipliği için: `ARCHITECTURE.md`.
- **Her oturum ve her ekip işe başlamadan önce `BEYIN.md` dosyasını (çalışma sistemi: düşünme döngüsü, teşhis tabloları,
  ekip ve kaizen kuralları) ve `docs/` altındaki güncel planı okur.**

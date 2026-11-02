# İstanbul Mafya 1.4 — İş Planı

Kaynak: 1.3.0 sonrası oyuncu geri bildirimi. Altın kural (CLAUDE.md) her iş için geçerlidir.
Her ekip yalnızca kendi dosyalarına dokunur; ortak dosyalarda (main.js, audio.js) küçük, işaretli ekler yapılır.

## Dalga A (paralel)

### A1 — Kanun ve Yapay Zekâ (sahibi: npc.js, wanted.js, polis/ordu sevkiyatı, traffic_ai.js)
- Polis her yerde belirmez: suç anında yakındaki **devriye** (yaya/araç) tepki verir; destek **araçla gelir**, araçtan iner, sonra ateş eder/tutuklar.
- Oyuncu araçla kaçarsa polis araçla kovalar, sıkıştırır, çarpabilir (PIT). Özel harekât, jandarma, ordu da araçla (zırhlı araç, kamyon, helikopter) gelir.
- Atlatma: görüş hattı + son görülen konum + arama alanı; görüşten çıkınca yıldız söner. 1 yıldızda kaçmak kolay olmalı.
- Kırmızı ışık: kovalamaca yok; telefona "Kırmızı ışık ihlali — ₺… ceza" bildirimi, para düşer.
- Protokol: yaya polis yakında suç görürse koşar, teslim ol der, direnirse ateş eder.
- Askeri üs: yoldan geçen/oyuncu araç vurulmaz; yalnızca yasak bölgeye girme, ateş etme veya duvara tırmanma girişiminde uyarı → ateş. Duvarlara tırmanılamaz.
- Çeteler: yalnızca **düşman** çete oyuncuyu tanıyıp saldırır ("Babanın oğlu bu, yakalayın!"); diğerleri ancak provoke edilirse (çarpma, omuz, vurma, nişan alma). Sivillere durduk yere saldırmaz.
- Çete ateş açarsa devriye polis ve araçları gelir; karakol önünde çatışmaya polis müdahale eder. Yaralı/ölü tutuklama.
- Ambulans: çatışma sonrası ambulans gelir, sağlıkçılar iner; yaralıyı tedavi eder ("Tamam, iyileştin, gidebilirsin"), ölüyü ceset torbası + sedye ile ambulansa koyar, kapıyı kapatıp hastaneye gider. Çatışma sürerken güvenli yerde bekler.
- Araç gaspı: hareket eden araca F ile ışınlanma yok. Önüne geç/silah göster → sürücü durur → kapı açılır → sürücü dışarı atılır → bin. Normal hızda.
- Ev sahibi: içinde sahip varken eve girersen "Sen kimsin, evimden çık!" der; çıkmazsan saldırır, çıkınca bırakır.

### A2 — Çatışma ve Beden (sahibi: combat.js, player.js nişan/kamera, silah tanımları ve modelleri)
- Beden hasar modülü: kafa = tek mermide ölüm (kask yoksa); kask kafa hasarını büyük ölçüde keser; çelik yelek gövde hasarını düşürür. Polis/asker/SWAT donanımı görünür ve tutarlı.
- Mermi ete girer: giriş/çıkış yarası, delip geçme (arkadakine düşük hasar), kan izi. Tahta etkisi yok.
- Ölüm: isabete göre gerçekçi yığılma/düşüş (yöne göre, dizden çökme, geriye savrulma), ölü beden yere oturur.
- Nişan: sağ tık sabit, silaha göre yakınlaştırma (tabanca az, tüfek orta, keskin nişancı dürbün), nişangâh tasarımı; helikoptere bakabilmek için dikey bakış sınırı genişler.
- Oyuncu dayanıklılığı: çok hızlı ölmemeli (zorluk dengesine göre hasar, ilk yardım).
- Silah modelleri tasarımsal olarak geliştirilir. Araç camı: çatlama + kırılma efekti ve sesi.

### A3 — Dünya ve Yapılar (sahibi: src/world/*)
- Işıklı kavisli köprü: uçtaki bariyer yola taşmasın; tüm köprü bariyerleri katı çarpışma nesnesi.
- Gökdelen bölgesi: sis gibi beyaz spot aydınlık kaldırılır, gerçekçi ambiyans.
- Askeri üs duvarı: tırmanılamaz (tutunma engeli).
- Camiler ve Üsküdar: detaylı cami (kubbe, yarım kubbeler, minare şerefeleri, revak, şadırvan), gerçekçi avlu/bahçe.
- Köprü detayları, sahil yolu tasarımı, denize bakan belediye bankları (oturulabilir).
- Dağ: gerçek dağ arazisi (yükseklik, toprak/çakıl/taş/ağaç dokuları), sürülebilir dağ yolu (araç/motosiklet/yaya).
- Asfalt ve çevre yolları; binaların içine gömülü park araçları hatası; ev dış modelleri; gökyüzü (gece/gündüz) ve deniz dalgaları geliştirmesi.

### A4 — Karakterler ve Giysiler (sahibi: character.js, charParts.js, charTex.js, kıyafet/aksesuar)
- İnsan modelleri çöp adam gibi değil: kas/hacim, doğru oranlar, yüz.
- Koşma, zıplama, eğilme, ölüm dışı tüm hareketler daha gerçekçi.
- Kadın: mini etek, kot, tayt, crop, etek, kapalı/açık giyim. Erkek: şort, pantolon, tişört, takım elbise vb. Şapka, gözlük, aksesuar.
- Çete kıyafetleri, polis/asker üniformaları; bisiklet modeli ve sürüş animasyonu.

### A5 — Hikâye, Harita ve Telefon (sahibi: missions.js, story_data.js, dialogue.js, ui harita/telefon)
- Senaryo yayı: Babanın güveni → sınavlar → itaat → gizli görüşmeler → Babayı devirme → çete liderlerini öldürüp bölgeleri almak → İstanbul'un tek hâkimi.
- Her görev sonu Baba çağırır, tebrik eder, yeni görevi verir. Saçma görev yok; mantıklı, uzun, çeşitli görevler.
- M haritası yeniden tasarım; cep telefonu ekranı ve menüleri; açılış/yükleme hızı.

## Dalga B (A birleşince)
- B1 Araçlar ve Performans: sürüş hissi, kamera açıları, araç sürerken takılma (FPS), motor sesi ve vites, hemen alev alma, polis araçları, trafik yoğunluğu + park araçlar.
- B2 Ses: siren, megafon ve helikopter anonsu, cam, menü tıklama, açılış müziği, tüm efektler.
- B3 Şehir Hayatı: her mahallede 2 bakkal, iki mahallede bir market, AVM (katlar, kalabalık, yemek yiyenler, kasa sırası), kafeler (dış masa, oturan çiftler/arkadaşlar), ev iç dekorasyonu, koltuğa/yatağa oturma-yatma.
- B4 Deniz: gemi/yat trafiği şeritleri ve aralık, liman gemileri ultra tasarım ve sürülebilir, yüzme animasyonu.

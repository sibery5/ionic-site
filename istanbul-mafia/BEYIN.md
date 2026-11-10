# BEYİN — Baş Mühendis Çalışma Sistemi

Bu dosya, projeyi yöneten baş mühendis oturumunun **nasıl düşündüğünü ve çalıştığını** yazıya döker.
Hangi oturum, model ya da ekip okursa okusun aynı disiplinle çalışsın diye vardır. Süs değil, işletim kuralıdır:
işe başlamadan önce oku, takıldığında 2. ve 3. bölüme dön, dalga bitince 9. bölüme ders ekle.

Öncelik sırası: kullanıcının açık isteği → `CLAUDE.md` altın kuralı → bu dosya → kişisel alışkanlık.

## 1. Öz

> Belirtiyi değil sebebi düzelt. İddia etme, ölç. En küçük değişiklikle en büyük etkiyi al. Yapamadığını saklama.

Bir iş, oyuncu ona baktığında doğal görünüyorsa ve bunu gösteren bir ölçüm varsa bitmiştir. "Kod yazıldı" bitmiş demek değildir.

## 2. Düşünme döngüsü (her iş için altı adım)

1. **Yeniden yaz.** İsteği gözlemlenebilir bir kabul kriterine çevir.
   "Polisler saçma" → "suç anında 100 m içinde yaya polis belirmez; destek en az 110 m'den araçla gelir".
   Kriteri sayıyla yazamıyorsan işi henüz anlamamışsındır; önce anla.
2. **Yerini bul.** Dar oku: `grep` ile yeri bul, yalnızca ilgili 30–60 satırı oku. Dosyayı baştan sona okuma.
3. **Hipotez kur.** En az iki aday sebep yaz. Her biri için "hangi gözlem bunu çürütür?" sorusunu cevapla.
4. **En ucuz ayırt edici deneyi yap.** Tek değişken değiştir: bir alt sistemi kapat/aç (bloom, ışıklar, gölge, ses, parçacık),
   tohumu sabitle, sonucu sayıyla ölç. Deney hipotezlerden en az birini elemeli; elemiyorsa deney yanlıştır.
5. **Kök nedende düzelt.** En küçük farkla. Sonra aynı hatanın kardeşlerini ara: "bu desen başka nerede var?"
6. **Kanıtla ve kaydet.** Testi çalıştır, çıktıyı oku, sayıyı yaz, commit'le. Öğrenileni 9. bölüme ekle.

**İki deneme kuralı:** Aynı düzeltme iki kez tutmadıysa üçüncüyü deneme. Dur, hipotez listesine dön ve
"çalışıyor" sandığın varsayımlardan birini sına. Hata çoğu zaman bakmadığın yerdedir.

**"Ne değişti?" sorusu:** Önce çalışan bir şey bozulduysa tahmin yürütme; çalışan son sürümle farkı al (`git log -p`, ikiye bölme).
Birleşimden sonra çıkan hatada önce "bu hata birleşimden önce de var mıydı?" sorusunu ölç; çoğu zaman vardır.

## 3. Teşhis tabloları

### 3.1 Görüntü (Three.js / WebGL)

| Belirti | Olası kök neden | Ayırt edici deney | Kalıcı çözüm |
|---|---|---|---|
| Ekranda kenarları düz, büyük siyah dikdörtgen ya da tüm ekran siyah; arayüz görünüyor | HDR tamponda NaN/Inf piksel. Bloom bulanıklığı tek pikseli dev dikdörtgene yayar; ton eşleme Inf'i siyaha çevirir | Bloom'u kapat: leke tek piksele iniyorsa budur. Sahneyi yarım-float hedefe çizip NaN/Inf say | Kaynağı bul (yüzeye yapışık ışık, sıfıra bölme, `normalize(0)`, `pow(negatif)`, çok parlak yansıma) **ve** her kalitede bloom öncesi temizle + üst sınır (`min(renk, 50)`) |
| Gece cepheler bembeyaz, yol karanlık | Her yöne yayan nokta ışık + ters kare: lambaya 1,5 m'deki duvar, 8 m'deki yoldan ~28 kat parlak. Üstüne yüksek pozlama ve bloom | Lamba ışıklarını kapat: cephe düzeliyorsa budur | Sokak lambası aşağı bakan spot ya da zemin ışık lekesi; cepheye düşen ışığı sınırla; gece pozlamasını ve bloom eşiğini ölçerek ayarla |
| İri pikseller, bulanık görüntü | Çözünürlük ölçeği dipte kalmış (dinamik çözünürlük geri toparlanmıyor) ya da piksel oranı sınırı ekran ölçeğinin altında | `renderer.getPixelRatio()` ve ölçeği yazdır | Alt sınırı yükselt, toparlanmayı hızlandır, ekran kartı güçlüyse yerel çözünürlük, keskinleştirme |
| Duvarın içi ya da arkası görünüyor | Kamera duvarın içine giriyor (kamera çarpışması yok ya da geç), near düzlemi büyük | Kamerayı duvara yasla, near'ı küçült | Kamera kolu için ışın/küre testi, near 0,1–0,2, oyuncu çok yakınsa soluklaştır |
| Yüzeyde titreşen ya da kayan lekeler | Aynı düzlemde iki yüzey (z-fighting) ya da `modelMatrix`'i kullanmayan shader | Yüzeylerden birini gizle, piksel farkını ölç | Yükseklikleri ayır, `polygonOffset`, shader'ı düzelt |
| Gölge kenarı kamera oynadıkça sürünüyor | Gölge kamerası doku ızgarasına oturmuyor | Kamera sabitken kayboluyorsa budur | Texel'e oturt, güneş yönünü adımla |
| Nesne bazı açılardan kayboluyor | Sınır kutusu yanlış (instancing, kemikli model) | `frustumCulled=false` ile dene | Doğru sınır küresi |
| Yazı/çıkartma görünmüyor | Yüz içe bakıyor ya da gövdenin içinde kalmış | `DoubleSide` ile dene | Sarım yönü ve konumu düzelt |
| Bir şey "sis gibi" parlıyor | Beyaz emissive + ayna gibi düşük pürüzlülük bloom eşiğini aşıyor | Emissive'i sıfırla | Emissive şiddetini düşür, pürüzlülüğü artır |

### 3.2 Performans

- **Önce ayır: ekran kartı mı, işlemci mi?** Çözünürlüğü yarıya indir. FPS belirgin artıyorsa dolgu/ekran kartı
  (üst üste çizim, ışık sayısı, post efekt); artmıyorsa işlemci (çizim çağrısı sayısı, oyun mantığı).
- **Ortalama değil p95, p99 ve en kötü kare.** Takılma, tek karede yapılan büyük iştir: bellek ayırma ve çöp toplama,
  shader derleme, doku/geometri üretimi, ana iş parçacığında ses sentezi, yol bulma patlaması.
- **Bütçe (60 FPS = 16,6 ms):** oyun mantığı ≤ 4 ms; ışık sayısı sabit (shader yeniden derlenmesin);
  karakter başına animasyon ≤ 0,1 ms; kare içinde `new` yok.
- **Kalıplar:** havuzla (parçacık, çıkartma, ses kaynağı), yükleme ekranında önceden ısıt (shader, doku, ses),
  işi karelere yay, uzaktakini seyrek güncelle, `InstancedMesh`, uzak nesnede basit model.
- **Yeni özellik = yeni ölçüm.** Ölçmeden "hızlı" deme. Test ortamındaki FPS anlamsızdır; adım süresi (ms), çizim çağrısı
  ve üçgen sayısı ölçülür, gerçek FPS kullanıcının bilgisayarında sorulur.

### 3.3 Oynanış ve yapay zekâ

- **Durum çakışması:** Bir sistem durumu kurar, başka bir sistem her karede geri alır (örnek: tutuklama ↔ saldırı).
  Deney: o durumu kimlerin yazdığını `grep`'le. Her durumun tek sahibi olmalı.
- **"Bazen çalışıyor":** zamanlama ya da rastgelelik. Tohumu sabitle; bekleme süresini uzatmak çözüm değil, sebebi bul.
- **Oyuncu gözüyle üç soru:** Mantıklı mı? Okunuyor mu (oyuncu neden olduğunu anlıyor mu)? Adil mi (tepki verecek zamanı var mı)?
- **His = geri bildirim zinciri:** her eylemin görüntüsü + sesi + kamera tepkisi + sonucu olmalı. Biri eksikse "tahtaya vuruyorum" hissi doğar.

## 4. İşi bölme ve sıralama

- **Sıra:** (1) oyunu bozan hatalar (siyah ekran, çökme, kayıt) → (2) hissi bozan hatalar → (3) eksik özellik → (4) cila.
- **Her madde dört satırdır:** belirti · kabul kriteri (sayı) · dokunulacak dosyalar · test.
- **Dosya sahipliğine göre böl.** İki ekip aynı dosyada çalışmaz. Ortak dosyada yalnızca küçük, `[ekip]` etiketli kanca.
- **Bağımlılık:** temel sistem önce (kamera, ışık, performans, fizik), ona binen içerik sonra.
- **Kapsamı koru.** İstenmeyeni ekleme; "hazır elim değmişken" büyüyen işin adıdır.

## 5. Ekip yönetimi

Görev metni eksiksiz olmalı; ekip bu konuşmayı bilmez. Şablon:

1. **Rol, çalışma klasörü, dal.**
2. **Okunacaklar:** `CLAUDE.md`, `BEYIN.md`, planın ilgili bölümü.
3. **Sahip olduğu dosyalar / dokunmayacağı dosyalar.**
4. **Maddeler:** her biri belirti + kök neden ipucu + kabul kriteri.
5. **Test:** hangi testler, birer kez; çökme olursa en çok bir tekrar.
6. **Bütçe:** hedef araç çağrısı sayısı, ekran görüntüsü sınırı.
7. **Kayıt:** her madde bitince commit; push yok.
8. **Rapor:** madde madde durum + sayı + bilinen sorun + "doğrulayamadıklarım".

Kurallar:

- Aynı anda **en çok 2 ekip** (bellek ve kota). 30 dakikadan kısa işi baş mühendis kendi yapar; ekip kurmak pahalıdır.
- Ekip başlamadan dalın doğru tabandan çıktığını doğrula (yanlış tabandan çıkan dal bir dalgayı çöpe atar).
- Kota kesilirse yarım işi hemen ara kayıtla commit'le, sonra "kaldığın yerden devam" de.
- **Rapor bir iddiadır.** Birleştirdikten sonra kilit testleri kendin çalıştır. Sayı vermeyen "geçti"ye güvenme.
- Birleştirme sırası temel → içerik. Çakışmada iki tarafın niyetini de koru. Birleşimden sonra toplu test;
  birleşimin bozduğu şey ayrı bir düzeltme işidir.
- **Sert değil net ol.** İyi iş korkudan değil, ölçülebilir kabul kriterinden ve net sınırdan çıkar.
  İyi işi adıyla takdir et, eksik işi adıyla geri gönder.

## 6. Kaizen — az gider, sürekli iyileşme

| İsraf | Önlem |
|---|---|
| Dosyayı baştan sona okumak | `grep` + satır aralığı |
| Aynı testi tekrar tekrar koşmak | Bir derleme → hedefli test; tam batarya yalnızca birleşimde |
| Ekran görüntüsü döngüsü | Sayısal ölçüm; görsel işte en çok 2–3 kare |
| Uzun günlüğü bağlama dökmek | Dosyaya yaz, yalnızca özet satırlarını `grep`'le |
| Paralel tarayıcı testi (bellek biter, çöker, tekrar edilir) | Tek tek koş; önce artakalan süreçleri öldür |
| Bilgiyi yeniden türetmek | `ARCHITECTURE.md`, plan ve bu dosya güncel tutulur |
| Gereksiz ekip | Küçük işi kendin yap |
| Uzun, tekrar eden kod | Veri tablosu + tek fonksiyon; ortak yardımcı |
| Sonradan düzeltme | Kabul kriteri baştan; kök nedende düzeltme |
| Kullanılmayan kod | Sil; "belki lazım olur" diye bırakma |

Her dalga sonunda beş satırlık **geriye bakış** yazılır: ne israf oldu → hangi kural önlerdi → bu dosyaya eklendi mi?
Standart böyle yükselir. Hedef: iş başına araç çağrısı ve yeniden iş oranı düşer, test ve performans ölçütleri düşmez.

## 7. Kod standartları (bu proje)

- Her şey prosedürel; hazır varlık ve gerçek marka adı yok. Yorumlar Türkçe ve "neden"i anlatır.
- **Veri odaklı:** araç, silah, kıyafet, görev = tablo satırı. Yeni tür eklemek kod değil satır eklemektir.
- Küçük modül, tek sorumluluk. Başka ekibin dosyasında yalnızca etiketli kanca.
- Kare içinde bellek ayırma yok; geçici vektörler modül düzeyinde tutulur.
- Işık sayısı sabit; malzeme ve shader çeşidini gereksiz artırma (her yeni çeşit bir derleme takılmasıdır).
- Rastgelelik tohumlu; test tohumu sabitleyebilir.
- Her yeni sistemin `scripts/test/*-steps.js` içinde ölçülebilir bir kontrolü olur.
- Kısa ve okunur yaz: aynı işi yapan iki bloktan biri fazladır.

## 8. Doğrulama ve dürüstlük

- Test ortamı yazılımsal ekran kartıdır: yavaş ve bellek sınırlı. Uzun koşular sim ağırlıklı olur, ekran görüntüsü az alınır.
- **Burada doğrulanamayanlar:** gerçek FPS, uzun oturumda bellek, sesin kulağa nasıl geldiği, görsel güzellik.
  Bunlar kullanıcıya açıkça sorulur; her teslimde "bakmanı istediklerim" listesi verilir.
- Raporda üç ayrı başlık: **yapılan · yapılamayan · doğrulanamayan.** Geçmeyen test söylenir.
- Testi geçirmek için testi gevşetme. Ölçüm yanlışsa nedenini yaz ve ölçümü düzelt.
- Kullanıcının fotoğrafı ve cümlesi en değerli hata kaydıdır: önce orada ne göründüğünü yaz, sonra sebebini ara.

## 9. Proje hafızası (yaşanmış dersler)

- **Deniz yolda görünüyordu:** su shader'ı `modelMatrix`'i kullanmıyordu; su zemin seviyesinde çiziliyordu. Ders: kendi shader'ını yazan her malzemede dönüşümleri sına.
- **Gökdelen bölgesi sis gibi parlıyordu:** beyaz tavan ışığı emissive + ayna gibi cam bloom eşiğini aşıyordu.
- **Polis "Araçtan in!" demiyordu:** `npc.think` her karede tutuklama durumunu saldırıya çeviriyordu. Suçlanan birleşim değildi; hata önceden vardı. Ders: önce "önceden var mıydı?" ölç.
- **Sürüşte takılma:** her yeni yaya için model ve yüz dokusu sıfırdan üretiliyordu (70–145 ms); cam/et sesleri ilk kazada sentezleniyordu. Çözüm: görünüm havuzu, ön örnekleme.
- **Shader hatası denetimi** her yeni shader'da ekran kartını bekletiyordu; sürümde kapalı.
- **Test tarayıcısında bellek şişmesi** oyunun kendi belleği değil, yazılımsal çizicinin kare birikmesiydi. Ders: önce JS yığını, GPU kaynak sayısı ve ses düğümü sayısını ölç; sabitse oyun sızdırmıyordur.
- **Yan yazılar görünmüyordu:** çıkartmalar içe bakıyordu ve gövdenin içindeydi.
- **Gemi testi "0 itme" şans eseri geçmişti;** tekrar koşunca 34–239 çıktı. Ders: rastgele sistemde tek koşu kanıt değildir; uzun süre ya da birkaç tohum.
- **Yüzmede baş yüksekliği** düz suya göre ölçülüyordu, yüzücü dalgayla hareket ediyordu. Ders: ölçüm, davranışın tanımıyla aynı referansı kullanmalı.
- **Kedi-köpek kontrolü** oyun duraklatılmışken sim çalıştırıyordu. Ders: testte önce oyun kipini doğrula.
- **Beş ekip birden:** kota bir saatte bitti, tarayıcılar bellekten çöktü, yarım işler kayboldu. Ders: 2 ekip, ara kayıt, tek tek test.
- **Dal yanlış tabandan çıktı** (oyunun olmadığı ana dal). Ders: ekip başlamadan tabanı doğrula.
- **Telefon yeniden tasarlanınca eski test kırıldı;** borsada gerçek bir marka adı kalmıştı. Ders: birleşimden sonra marka taraması ve arayüz testleri.

## 10. Kontrol listeleri

**Oturum başı:** dal ve `git status` · artakalan tarayıcı süreçleri · güncel plan ve bu dosya · yarım kalan ekipler.

**Madde bitişi:** derleme · hedefli test (bir kez) · sayı rapora yazıldı · commit.

**Dalga bitişi:** birleştir · toplu test (tek tek) · marka taraması · sürüm numarası · kurulum dosyası · kullanıcıya
"yapılan / yapılamayan / doğrulanamayan / bakmanı istediklerim" raporu · geriye bakış bu dosyaya işlendi.

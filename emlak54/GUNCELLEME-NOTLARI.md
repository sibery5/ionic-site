# Emlak 54: V12 güncelleme notları

Bu sürüm mevcut tasarım dilini korur: aynı yapı, aynı DM Sans + Manrope tipografisi ve aynı üç tema (Mavi, Emlak54, Ortak). Tasarım rötuşlandı, sayfa geçişleri yenilendi, hatalar düzeltildi, SEO ve güvenlik altyapısı güçlendirildi. **Veritabanını yeniden kurmanız gerekmez.**

## Nasıl uygulanır (WAMP / hosting)

1. Mevcut `emlak54` klasörünün ve veritabanının yedeğini alın.
2. Bu paketteki `emlak54` klasörünün içeriğini mevcut klasörün üzerine kopyalayın. `config.php` dosyasını kendi DB ayarlarınızı değiştirdiyseniz kendi dosyanızla karşılaştırın; yeni sürüm yalnızca `trusted_proxies` satırı ekler.
3. Tarayıcıda `Ctrl + F5` yapın. CSS/JS adreslerine artık sürüm eklendiği için sonraki güncellemelerde buna gerek kalmaz.
4. Yönetim paneline girip **Tema** ekranından temaları **Önizle** ile deneyin.

Yeni dosyalar: `404.php`, `partials/head.tpl`, `database/locations.sql`, `assets/vendor/jquery-4.0.0.min.js`, `deploy/.htaccess`, bu not.

## Düzeltilen hatalar

- **İletişim sayfası:** "Yol tarifi al" bağlantısında kapanmamış HTML etiketi vardı (`rel="…"<svg`). Düzeltildi. "Açik adres" yazımı "Açık adres" yapıldı.
- **Hakkımızda:** Yönetimdeki "Hakkımızda bölüm başlığı / metin 1 / metin 2" alanları sayfaya hiç yansımıyordu (metin sabit yazılmıştı). Artık panelden gelir.
- **Ana sayfa:** "İlan alanı başlığı/açıklaması" ayarları şablonda kullanılmıyordu. Başlık alanı geri eklendi.
- **Demo uyarısı:** Paneldeki "Demo uyarısını göster" ayarının sitede karşılığı yoktu. Footer altında çalışır hale getirildi.
- **Sıralama:** "Öne çıkanlar" seçeneği öne çıkarılan ilanları en üste almıyordu (ID'ye göre sıralıyordu). "En yeni ilanlar" yapım yılına göre sıralıyordu. İkisi de düzeltildi. "Metrekare" sıralaması eklendi.
- **Tip filtresi:** Sabit bir listeydi. Artık yayındaki ilanlarda gerçekten bulunan tiplerden oluşuyor.
- **İlan detayı:** Menüde yanlışlıkla "Anasayfa" aktif görünüyordu. "Kaydet" butonu daha önce kaydedilmiş ilanı göstermiyordu. Telefon butonunda telefon yerine ok ikonu vardı. Bulunamayan ilan, header/footer'sız düz bir sayfa gösteriyordu.
- **Oda sayısı:** Eski kayıtlarda yalnızca rakam olan oda sayısı, banyo sayısıyla birleşip "5+3" gibi yanıltıcı gösteriliyordu. Artık "5 oda" olarak gösterilir. "3+1" biçimindeki kayıtlar aynen kalır.
- **Geri tuşu:** Bir bağlantıya tıklayıp geri dönüldüğünde sayfa görünmez ve tıklanamaz kalabiliyordu (bfcache). Düzeltildi.
- **Telefon bağlantıları:** `site-config.php`, görünen telefondan rakam çıkarıp `tel:` bağlantılarının üzerine yazıyordu. "0555…" gibi yazımda bu yanlış numara üretiyordu. Artık bağlantılar sunucuda, "Telefon linki" ayarından üretilir.
- **Yönetim paneli:**
  - Parola değiştirme başarılı olsa da ekranda hata tostu çıkıyordu.
  - "Self link modu" kutusunun işareti kaldırılınca ayar kaydedilmiyordu.
  - SEO ve Güvenlik ekranlarındaki "Yenile" butonları hiç çalışmıyordu.
  - "Yayın kontrolü" listesi sabitti (hep "!" gösteriyordu). Artık gerçek ayarlara göre canlı hesaplanır ve her madde için "Düzenle" bağlantısı var.
  - "E-posta geçersiz", "Fotoğraf 12 MB'ı aşıyor" gibi açıklayıcı hata mesajları canlı ortamda gizlenip "İşlem tamamlanamadı" gösteriliyordu. Artık doğru mesaj görünür.
- **İlçe/mahalle:** İlan formundaki ilçe/mahalle listelerinin tabloları kurulum paketinde yoktu. Yeni kurulumlarda liste boş kalıyordu. `database/locations.sql` (16 ilçe, 680 mahalle) eklendi. Eski kurulumlarda tablo yoksa ilk kullanımda otomatik oluşturulur.
- **Güvenlik yanlış alarmı:** Yöneticinin ilan açıklamasında "-- " veya "/* */" gibi ifadeler "SQL injection" sayılıyor, 5 kayıttan sonra yöneticinin kendi IP'si 24 saat engellenebiliyordu. Oturum açmış yönetici artık taranmaz.

## Tasarım

- 3 temanın tamamı aynı yeni bileşenleri kullanır. Renkler tema değişkenlerinden geldiği için Emlak54 (kırmızı-siyah) ve Ortak temalarında artık mavi/sarı "sızıntı" yok.
- **Ana sayfa:**
  - Hero'ya "İlanları keşfet" ve "WhatsApp'tan yazın" butonları ile gerçek ilan sayısı kartı eklendi.
  - Hero'nun altına taşan kategori kartları (Satılık/Kiralık/Konut/Arsa/İş yeri, gerçek sayılarla) eklendi.
  - İlan başlık alanına sayaçlar eklendi. Kartların görünümü ve hareketleri rafine edildi, favori animasyonu eklendi.
  - SEO bölümüne ilçe bağlantıları eklendi. Çağrı kartına iki buton geldi.
- **Hakkımızda:** Banner'a gerçek istatistikler, "Üç adımda" süreç kartları ve tıklanabilir ilçe çipleri eklendi.
- **İletişim:** Üstte 4 hızlı iletişim kartı (telefon, WhatsApp, e-posta, yol tarifi) ve banner butonları eklendi.
- **İlan detayı:**
  - Başlık altına özet çipleri (m², oda, banyo, yıl, tip) eklendi. Tekrarlanan alan/oda kutuları sadeleştirildi.
  - Galeri geçişleri yumuşatıldı. Konum bölümü eklendi; harita yalnızca tıklanınca yüklenir (hız ve gizlilik için).
  - Danışman kartında fiyat ve e-posta ile sorma seçeneği var.
  - Mobilde altta sabit "Ara / WhatsApp" çubuğu var.
  - Benzer ilanlar artık aynı ilçeye öncelik verir; ilçede başka ilan yoksa benzer kategoriden öneri gelir.
- **Temalı 404 sayfası** (ilan araması dahil).
- **Sayfa geçişleri:** Destekleyen tarayıcılarda (Chrome/Edge/Safari güncel) yerel View Transitions ile yumuşak geçiş yapılır ve header sabit kalır. Diğerlerinde akıcı bir yedek animasyon çalışır. Üstte ince bir ilerleme çubuğu, kaydırınca kompaktlaşan header ve kaydırdıkça beliren içerik eklendi. "Hareketi azalt" tercih eden kullanıcılarda animasyonlar kapanır.
- **Yönetim > Tema:** Önizleme görselleri yeni tasarımla yenilendi. **Önizle** butonu temayı yalnızca yöneticinin tarayıcısında açar (`?tema_onizle=`). **Seç** butonu herkes için yayına alır.

## SEO

- **Ana sayfa:** İlan kartları artık sunucuda (HTML içinde) üretiliyor. Arama motorları ilan bağlantılarını JavaScript beklemeden görür.
- **Tek adres:**
  - `index.php` adresi kök adrese (`/`) 301 ile yönlendirilir.
  - `ilan.php?slug=…` ve sonunda eğik çizgi olmayan `/ilan/slug` adresleri kanonik `/ilan/slug/` adresine yönlendirilir.
- **Yapılandırılmış veri:**
  - İlan sayfalarında geçerli `RealEstateListing` + `Offer` (satılık/kiralık) + `BreadcrumbList` kullanılır.
  - Ana sayfada `ItemList` var.
  - Hakkımızda/İletişim sayfalarında breadcrumb var.
  - Gerçek alan adı ve iletişim bilgisi girildiğinde `RealEstateAgent` verisine logo ve sosyal profiller de eklenir.
- **sitemap.xml:** İlan fotoğrafları (image sitemap) eklendi. `lastmod` artık her istekte "bugün" değil, gerçek güncellenme tarihidir.
- **robots.txt:** Kurulu dizine göre (alt klasör dahil) yollar yazılır. `search.php`, `404.php` ve tema önizleme adresleri kapalıdır.
- **Meta etiketleri:** Open Graph başlıkları panelde girilen SEO başlıklarını kullanır. Yüklenen vitrin fotoğrafı paylaşım görseli olur.
- **Bulunamayan adresler:** Temalı 404 sayfası gerçek 404 kodu döndürür (soft-404 yok).

## Güvenlik ve performans

- **.htaccess:**
  - Gizli dosyalar (`.git`, `.env`…), `deploy/` dahil uygulama klasörleri ve `.md/.sql/.lock/.log/.bak` gibi dosyalar engellenir.
  - `uploads/` klasörü yalnızca görsel sunar; sahte uzantılı dosyalar (ör. `x.php.webp`) bile açılmaz.
  - Kurulu dizin otomatik algılanır (kök veya `/emlak54/`).
- **jQuery:** Artık yerelden (`assets/vendor`) ve SRI ile yükleniyor. Yönetim paneli dış CDN'e bağımlı değil; CSP'den `code.jquery.com` kaldırıldı.
- **Oturum çerezi:** Ziyaretçilere gereksiz yere gönderilmez. Yalnızca yönetim ve kurulum sayfalarında açılır. Bu KVKK açısından daha temizdir ve tarayıcının geri/ileri önbelleğini etkinleştirir.
- **Cloudflare / yük dengeleyici arkasında doğru IP:** `config.php` > `trusted_proxies` veya `EMLAK54_TRUSTED_PROXIES` ortam değişkeni ile ayarlanır. Boş bırakılırsa sahte `X-Forwarded-For` başlıkları dikkate alınmaz.
- **Önbellek:** CSS/JS adreslerine dosya değiştikçe değişen sürüm (`?v=`) eklendi ve 30 gün önbellek açıldı. Sıkıştırma (Brotli/Deflate) etkin.
- **Giriş formu:** Uzun süre açık kalan giriş sayfasında artık ham JSON hata yerine anlaşılır bir mesaj görünür.

## Test edilenler (yerel Apache 2.4 + PHP 8.3 + MySQL 8, sizin veritabanı dökümünüzle)

- **Sayfalar:** Tüm sayfalar masaüstü ve mobilde, 3 temada açıldı. Tarayıcı konsolunda hata yok.
- **Yönlendirme ve erişim:** Tüm yönlendirme, 403 ve 404 kuralları test edildi.
- **SEO çıktıları:** `robots.txt` ve `sitemap.xml` doğrulandı. JSON-LD blokları geçerli. Her sayfada tek H1 ve canonical var.
- **Yönetim API:** Giriş, CSRF, ilan ekleme ve fotoğraf yükleme (WebP dönüşümü, sahte PHP dosyası reddi), durum değiştirme, fotoğraf/ilan silme, mahalle ekleme, tema değiştirme, self-link aç/kapa, parola kuralı ve çıkış test edildi.
- **Kurulum:** Boş veritabanında sıfırdan kurulum çalıştırıldı (30 ilan, 16 ilçe, 680 mahalle) ve kurulum kilidi doğrulandı.

**Canlıya almadan önce:** Yönetim > Genel Bakış'taki "Yayın kontrolü" listesindeki maddeleri tamamlayın. Gerçek alan adı, telefon ve e-posta girin, demo uyarısını kapatın, Search Console kodunu ekleyin.

# Emlak 54 — PHP + MySQL yönetilebilir emlak sitesi

> **V12:** Bu sürümdeki tüm tasarım, hata düzeltme, SEO ve güvenlik değişiklikleri için `GUNCELLEME-NOTLARI.md` dosyasına bakın.

Bu paket, mevcut Emlak 54 görsel dilini koruyan, veritabanından çalışan bir PHP sitesi ve `emlak-admin.php` yönetim paneli içerir. Proje üretim öncesi teknik temel olarak hazırlanmıştır; gerçek hosting, gerçek alan adı, veritabanı ve işletme iletişim bilgileriyle kurulup canlı ortam testi yapılmalıdır.

## Paket içeriği

- `index.php`, `hakkimizda.php`, `iletisim.php`: veritabanı ayarlarından oluşturulan sayfalar.
- `ilan.php`: slug üzerinden çalışan ayrı ilan detay sayfası (`/ilan/ornek-ilan/`).
- `emlak-admin.php`: yönetici giriş ekranı ve mobil uyumlu SPA benzeri yönetim arayüzü.
- `admin-api.php`: CSRF korumalı AJAX işlemleri.
- `install.php`: ilk kurulum, şema + ilçe/mahalle listesi (`database/locations.sql`) oluşturma, ilk admin hesabı ve 30 demo ilanı aktarma. Kurulumdan sonra `storage/install.lock` ile kendini kilitler.
- `database/schema.sql`: InnoDB, `utf8mb4`, foreign-key, arama ve analitik indeksleri.
- `includes/bootstrap.php`: PDO, oturum, CSRF, hız sınırı, güvenlik başlıkları, şüpheli istek kayıtları, slug ve WebP işleme yardımcıları.
- `search.php`: canlı ilan arama JSON endpoint'i.
- `sitemap.php`, `robots.php`: dinamik sitemap ve robots çıktısı; Apache `.htaccess` bunları `/sitemap.xml` ve `/robots.txt` altında sunar. Taslak ve `noindex` ilanları sitemap dışı bırakılır.
- `admin.css`, `admin.js`: responsive admin paneli, dashboard grafikleri, ilan CRUD, çoklu resim önizleme/yükleme, içerik/SEO/güvenlik ekranları.
- `properties.json`: ilk kurulumda kullanılacak 30 demo ilan. Ana veri kaynağı değildir; kurulumdan sonra içerik MySQL'den okunur.

## Önerilen üretim ortamı

- **PHP 8.5.11** (11 Ekim 2026 itibarıyla yayımlanmış 8.5 güvenlik sürümü); PHP 8.6 RC üretim için kullanılmamalıdır.
- **MySQL 8.4 LTS** ve sağlayıcınızda bulunan güncel 8.4 bakım/güvenlik sürümü.
- PHP eklentileri: `pdo_mysql`, `fileinfo`, `gd` (GD'de WebP desteği açık), `json`, `mbstring` önerilir.
- HTTPS etkin Apache 2.4+ (paketteki `.htaccess` kuralları için) ve düzenli güvenlik güncellemesi.
- Yönetim tarafında jQuery 4.0.0 yerelden (`assets/vendor/`, SRI doğrulamalı) yüklenir. Google Fonts ve Unsplash demo fotoğrafları için dış ağ bağlantısı gerekir.

Bu proje özel bir PHP framework'üne bağımlı değildir; istenen `emlak-admin.php` mimarisini hafif tutmak için PHP 8.5, PDO ve parametreli SQL sorguları kullanır. Bu seçim güncelleme bağımlılıklarını azaltır; klasik MVC framework’ü tercih eden bir ekip istenirse sonraki aşamada Laravel’e taşıyabilir. Yönetim AJAX çağrıları jQuery 4.0.0 ile gider. Bu yaklaşım Composer paketi güncellemeleri ve framework bootstrap karmaşasını azaltır; yine de kodun güvenlik bakımı ve canlı ortam testi şarttır.

## Kurulum

### 1. MySQL veritabanını oluştur

MySQL yönetim aracında güçlü ve benzersiz parolalı özel kullanıcı kullanın. Örneğin aşağıdaki SQL'i kendi veritabanı adınıza göre uyarlayın:

```sql
CREATE DATABASE emlak54 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'emlak54_app'@'localhost' IDENTIFIED BY 'BURAYA_UZUN_RASTGELE_BIR_PAROLA';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
ON emlak54.* TO 'emlak54_app'@'localhost';
FLUSH PRIVILEGES;
```

WAMP varsayılanında MySQL kullanıcısı `root`, parola boştur ve veritabanı kurulum ekranında otomatik oluşturulur. MySQL parolanız farklıysa `config.php` içindeki DB ayarlarını değiştirin. Üretim sunucusunda root hesabı kullanmayın; sınırlı yetkili ayrı bir DB hesabı oluşturun.

### 2. Gereken PHP eklentilerini ve yükleme limitlerini aç

Kontrol edilmesi gerekenler:

```ini
file_uploads = On
upload_max_filesize = 12M
post_max_size = 256M
max_file_uploads = 30
memory_limit = 512M
max_execution_time = 180
log_errors = On
display_errors = Off
```

Hosting sağlayıcısı daha düşük toplam POST sınırı koyuyorsa toplu fotoğraf sayısını azaltın; her ilan en fazla 20 fotoğraf tutar, bir dosya en fazla 12 MiB olabilir. WebP dönüştürme için GD'nin `imagewebp()` desteği gerekir. Kurulum sayfası eklenti durumlarını otomatik kurmaz; hosting panelinden etkinleştirin.

### 3. İlk yönetici hesabını oluştur

Proje klasörünü web köküne yükleyin. Yerelde örneğin `htdocs/emlak54_demo/` konumunda çalıştırıp `http://localhost/emlak54_demo/install.php` adresini açın. Kurulum ekranında yönetici kullanıcı adını ve en az 8 karakterli parolanı gir. WAMP varsayılan ayarlarında veritabanı otomatik oluşturulur ve 30 demo ilanı aktarılır. Kurulum sonunda `storage/install.lock` oluşturulur ve kurulum ekranı kilitlenir. Bu kolay kurulum yalnızca yerel geliştirme içindir; canlı sunucuda kurulum öncesi ayrı, yetkileri sınırlı bir veritabanı kullanıcısı yapılandır.

Kurulumdan sonra yönetim paneli: `https://gercek-alan-adiniz/emlak-admin.php`

İlk kurulumdan sonra DB kullanıcısının izinlerini daraltın:

```sql
REVOKE CREATE, ALTER, INDEX, REFERENCES ON emlak54.* FROM 'emlak54_app'@'localhost';
FLUSH PRIVILEGES;
```

Hostinginiz birden fazla siteyi aynı veritabanı hesabı altında yönetiyorsa bunu değiştirmeden önce sağlayıcınızla kontrol edin.

### 4. Gerçek işletme bilgilerini gir

Admin → **Site İçerikleri** ekranından marka adı, logo, telefon, WhatsApp, e-posta, adres, footer, anasayfa metinleri ve Hakkımızda/İletişim metinlerini güncelleyin. Admin → **SEO Motoru** ekranından başlık, meta açıklaması ve gerçek HTTPS alan adını kontrol edin. Demo uyarısını ancak bütün demo kayıtlarını doğrulanmış ilanlarla değiştirdikten sonra kapatın. İlan görselleri ve fiyatlar örnek veridir.

### 5. Canlıya çıkış kontrolleri

- SSL/HTTPS zorunlu olsun; `site_url` alanına kök adresi (sonunda path/query olmadan) yazın.
- `/sitemap.xml` adresinin gerçek alan adını içerdiğini kontrol edin ve Search Console'a ekleyin.
- Ana sayfa, Hakkımızda, İletişim, 30 ilan detayı, AJAX arama ve mobil admin menüsünü telefon/masaüstünde test edin.
- Gerçek bir ilan oluşturup birden çok JPEG/PNG/WebP yükleyin; dosyaların sunucuda WebP olarak oluştuğunu kontrol edin.
- Site trafiği ve güvenlik logları IP/cihaz meta verisi işlediği için yayına çıkmadan önce KVKK aydınlatma metnini, gizlilik/çerez bildirimini ve veri saklama sürelerini işletmenin gerçek süreçlerine göre hukuk uzmanıyla gözden geçirin.
- Admin parolasını benzersiz tutun, gereksiz admin hesapları açmayın, güvenlik güncellemelerini uygulayın ve veritabanı + `uploads/` yedeğini düzenli alın.

## URL yönlendirmeleri

Apache `.htaccess` eski `.html` URL'lerini yeni PHP sayfalarına 301 ile yönlendirir. İlanlar `/ilan/{slug}/` yoluna gider. Eski statik kopyalar paketten kaldırılmıştır; böylece PHP sayfaları tek doğruluk kaynağı olur. **Nginx `.htaccess` okumaz**; Nginx kullanılıyorsa eşdeğer yönlendirmeler ve özel klasör engelleri sunucu konfigürasyonuna ayrıca eklenmelidir. Kuralları körlemesine kopyalamak yerine hosting sağlayıcınıza göre uyarlayın.

## Güvenlik modeli ve sınırlar

- PDO ve parametreli sorgular; otomatik HTML escaping; allowlist doğrulaması.
- CSRF token, oturum yenileme, HttpOnly/SameSite cookie, giriş deneme sınırlama ve parola hash'i.
- Güvenlik başlıkları, CSP, `nosniff`, frame koruması, düşük yetkili SQL hesabı önerisi.
- MIME + gerçek resim açma + piksel/dosya boyutu denetimleri ve sunucuda yeniden kodlanan rastgele adlı WebP resimler. SVG/GIF doğrudan yükleme kabul edilmez.
- Giriş hataları, şüpheli XSS/SQLi/path traversal desenleri ve manuel/otomatik IP engellemeleri için yönetim ekranı.
- Admin işlemlerinin audit log'u; anonime açık arama için hız sınırı; sayfa/ilan görüntülenme sayaçları.

**Hiçbir web uygulaması “asla hacklenemez” olarak garanti edilemez.** IP tabanlı otomatik engelleme yanlış pozitif üretebilir (örneğin şirket/VPN/NAT ortak IP'leri). Olay kayıtları tek başına saldırının kesin kanıtı değildir. WAF, hosting erişim logları, yedek, güncelleme, en az yetki, dış güvenlik testi ve olay müdahale planı gerekir. Uygulama loglarında şüpheli örüntüler kaydedilir; saldırı yüklerinin ham metni özellikle saklanmaz.

## Önemli teknik not

V12 sürümü yerel Apache 2.4 + PHP 8.3 + MySQL 8 ortamında, gerçek veritabanı dökümüyle uçtan uca test edildi (sayfalar, yönlendirmeler, yönetim API'si, fotoğraf yükleme/WebP dönüşümü, sıfırdan kurulum). Hosting ortamınızda (PHP sürümü, AllowOverride ayarları, SSL) canlıya çıkıştan sonra kısa bir kontrol yine önerilir.


## Yönetim paneli okunabilirlik ve tip listesi güncellemesi
- Admin panelinde yazı boyutları, satır aralıkları ve mobil form alanları iyileştirildi.
- Dashboard Hafta/Ay/Yıl butonları artık tüm paneli yeniden çizmeden yalnızca grafik verisini ve aktif butonu günceller.
- Gayrimenkul Tipleri yönetimi sol menüye eklendi. Tipler veritabanındaki `site_settings` tablosunda `property_types_json` anahtarıyla saklanır; ekleme/düzenleme aynı sayfada satır başına bir değerle yapılır.
- İlan ekleme/düzenleme formundaki Gayrimenkul tipi alanı yönetilen tiplerden oluşan select oldu.
- Logo alanında anlık önizleme ve seçimi iptal/sıfırlama butonu bulunur.
- Güncellemek için bu paketin içeriğini mevcut `C:\wamp64\www\emlak54` klasörüne kopyalayıp dosyaların üzerine yazın; veritabanını yeniden kurmanız gerekmez. Önce yedek alın.

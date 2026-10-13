# Güvenlik / Yayın kontrol listesi — Emlak 54

## Mutlaka yapılacaklar

- PHP 8.5.x'in güncel güvenlik yamalı sürümünü ve desteklenen MySQL 8.4 LTS bakım sürümünü kullanın.
- `config.php` içinde gerçek güçlü DB parolası verin ya da ortam değişkenlerini kullanın. Yapılandırma dosyasını web'den erişilemez tutun.
- `APP_ENV=production` kullanın; `display_errors=Off`, `log_errors=On` olsun.
- HTTPS'i bütün site ve admin için zorunlu kılın (`.htaccess` içindeki HTTPS yönlendirme satırlarının yorumunu SSL kurulduktan sonra kaldırın). Cloudflare/yük dengeleyici kullanıyorsanız `EMLAK54_TRUSTED_PROXIES` ile proxy IP aralıklarını tanımlayın. Reverse proxy arkasındaysanız istemciden gelen `X-Forwarded-For`/`X-Forwarded-Proto` değerlerine yalnızca güvenilen proxy'den geldiklerinde güvenin.
- İlk kurulumdan sonra install.lock dosyasının durduğunu ve `install.php` sayfasının 403 döndürdüğünü doğrulayın.
- DB kullanıcısının DDL (`CREATE/ALTER/INDEX/REFERENCES`) izinlerini kurulumdan sonra kaldırın.
- `uploads/` (yalnızca görsel), `database/`, `storage/`, `includes/`, `templates/`, `partials/`, `deploy/` yollarına doğrudan hassas dosya erişiminin engellendiğini test edin.
- Gerçek dosya yükleme testi yapın: geçerli JPEG/PNG, bozuk görsel, fazla büyük görsel, uzantısı sahte PHP dosyası ve 20'den çok dosya. Başarılı görsel dosyaları `.webp` olmalı.
- Admin parola yöneticisiyle benzersiz parolayı saklayın ve hosting sağlayıcısında MFA varsa etkinleştirin.
- Yedekleme geri dönüş testleri yapın; site dosyaları, MySQL ve yüklemeleri tutarlı şekilde yedekleyin.

## Bu uygulamanın uyguladığı önlemler

PDO prepared statements; CSRF; oturum kimliği yenileme; HttpOnly/SameSite ve HTTPS koşulunda Secure çerez; CSP, `X-Content-Type-Options`, `X-Frame-Options`, Referrer-Policy, Permissions-Policy; giriş denemesi oran sınırlama; kısa sürede yinelenen şüpheli istek örüntülerine göre geçici IP engeli; yönetici aksiyon kayıtları; allowlist alan doğrulama; HTML kaçışlama; resim yeniden kodlama; dosya ve piksel sınırları.

## Sınırlamalar

- IP tek başına kullanıcı kimliği değildir; paylaşılan IP'lerde otomatik ban kullanıcıları da etkileyebilir.
- Örüntü tespiti her saldırıyı tanıyamaz ve normal istekleri yanlış işaretleyebilir.
- Bu paket WAF, DDoS koruması, MFA, IDS/SIEM, antivirüs, sunucu yamalama ya da düzenli penetrasyon testinin yerine geçmez.
- Yönetim panelinde gösterilen SEO puanı uygulama içi kontrol puanıdır; Google sıralama puanı değildir.

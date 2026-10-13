# Emlak 54 — CSS ve görsel önizleme düzeltmesi

Bu paket, mevcut WAMP kurulumunun üzerine dosya güncellemesi olarak uygulanır.

## Düzeltilenler
- Public template'lerdeki `style.css`, `app.js`, `site-config.php`, `live-search.js`, `page-transitions.js` ve favicon yolları gerçek uygulama dizinine göre oluşturulur. Böylece alt URL/rewrite rotalarında CSS'in göreli URL nedeniyle kaybolması engellenir.
- İlan fotoğrafı ve logo önizlemesi `URL.createObjectURL()` yerine `FileReader` data URL ile oluşturulur. Önizleme okunamazsa hata görünür ve kullanıcıya mesaj verilir.
- Logo iptal işlemi kayıtlı logoya döner ve dosya seçimini temizler.

## Uygulama
1. WAMP'taki `C:\wamp64\www\emlak54` klasörünün yedeğini al.
2. ZIP içindeki `emlak54` klasörünün içeriğini mevcut klasörün üzerine kopyala.
3. Veritabanını yeniden kurma.
4. Tarayıcıda `Ctrl + F5` ile önbelleği temizleyerek yenile.
5. `http://localhost/emlak54/` sayfasında DevTools > Network bölümünde `style.css` isteğinin 200 döndüğünü doğrula.

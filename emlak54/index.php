<?php
declare(strict_types=1);
require __DIR__ . '/includes/bootstrap.php';
if (!installed()) { http_response_code(503); ?><!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Emlak 54 kurulum gerekli</title><body style="font:16px system-ui;max-width:680px;margin:12vh auto;padding:24px;color:#18314d"><h1>Emlak 54 kurulum gerekli</h1><p>Önce config.php dosyasında MySQL bağlantısını ayarlayın, sonra ilk yönetici hesabını oluşturun.</p><p><a href="install.php">Güvenli kuruluma git →</a></p></body></html><?php exit; }
try {
    record_page_view('home','home');
    echo render_page_template('home');
} catch (Throwable $ex) {
    error_log('[Emlak54 home] '.$ex->getMessage()); http_response_code(503);
    echo '<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Emlak 54 bakım</title><body style="font:16px system-ui;max-width:700px;margin:12vh auto;padding:24px;color:#18314d"><h1>Site veritabanına şu an ulaşılamıyor.</h1><p>Yönetici, config.php ve MySQL bağlantısını kontrol etsin. Ayrıntılar sunucu hata günlüğüne yazıldı.</p></body></html>';
}

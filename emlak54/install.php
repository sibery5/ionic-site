<?php
declare(strict_types=1);
require __DIR__ . '/includes/bootstrap.php';

$lockFile = __DIR__ . '/storage/install.lock';
$error = '';
$success = false;
if (is_file($lockFile)) {
    http_response_code(403);
    exit('Kurulum tamamlanmış. Güvenlik nedeniyle install.php devre dışı bırakıldı.');
}
$installMutex = null;
$installMutexHeld = false;
$installAttemptDenied = false;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // A filesystem lock works before database tables exist and prevents concurrent first-run setup races.
    $storagePath = __DIR__ . '/storage';
    if (!is_dir($storagePath) || !is_writable($storagePath)) {
        $error = 'Kurulum için storage klasörünün yazılabilir olması gerekiyor.';
        $installAttemptDenied = true;
    } else {
        $installMutex = @fopen($storagePath . '/install-process.lock', 'c');
        if (!$installMutex || !flock($installMutex, LOCK_EX | LOCK_NB)) {
            $error = 'Kurulum işlemi zaten çalışıyor. Biraz bekleyip tekrar deneyin.';
            $installAttemptDenied = true;
        } else {
            $installMutexHeld = true;
            if (is_file($lockFile)) {
                http_response_code(403);
                exit('Kurulum tamamlanmış. Güvenlik nedeniyle install.php devre dışı bırakıldı.');
            }
            $attemptFile = $storagePath . '/install-attempts.json';
            $attemptMap = json_decode((string)@file_get_contents($attemptFile), true);
            if (!is_array($attemptMap)) $attemptMap = [];
            $now = time();
            foreach ($attemptMap as $hash => $timestamps) {
                $attemptMap[$hash] = array_values(array_filter(is_array($timestamps) ? $timestamps : [], static fn($ts) => is_numeric($ts) && $now - (int)$ts < 86400));
                if (!$attemptMap[$hash]) unset($attemptMap[$hash]);
            }
            $ipHash = hash('sha256', client_ip());
            $recent = $attemptMap[$ipHash] ?? [];
            if (count(array_filter($recent, static fn($ts) => $now - (int)$ts < 900)) >= 5) {
                $error = 'Çok fazla kurulum denemesi yapıldı. 15 dakika sonra tekrar deneyin.';
                $installAttemptDenied = true;
            } else {
                $recent[] = $now;
                $attemptMap[$ipHash] = $recent;
            }
            if (file_put_contents($attemptFile, json_encode($attemptMap, JSON_UNESCAPED_SLASHES), LOCK_EX) === false) {
                $error = 'Kurulum güvenlik kayıtları yazılamadı. storage klasörünün izinlerini kontrol edin.';
                $installAttemptDenied = true;
            }
        }
    }
}
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !$installAttemptDenied) {
    $csrf = (string)($_POST['csrf_token'] ?? '');
    if ($csrf === '' || !hash_equals(csrf_token(), $csrf)) {
        $error = 'Güvenlik doğrulaması başarısız. Sayfayı yenileyip tekrar deneyin.';
    } elseif (!rate_limit('install', 5, 900)) {
        $error = 'Çok fazla kurulum denemesi. Bir süre sonra tekrar deneyin.';
        log_security_event('install_rate_limited', 'high', 'Kurulum denemesi sınırlandı');
    } else {
        $username = trim((string)($_POST['username'] ?? ''));
        $password = (string)($_POST['password'] ?? '');
        $confirm = (string)($_POST['password_confirm'] ?? '');
        $displayName = trim((string)($_POST['display_name'] ?? 'Site Yöneticisi'));
        if (!preg_match('/^[a-zA-Z0-9._-]{4,80}$/', $username)) $error = 'Kullanıcı adı 4–80 karakter olmalı; harf, sayı, nokta, tire ve alt çizgi kullanılabilir.';
        elseif (strlen($password) < 8) $error = 'Yönetici parolası en az 8 karakter olmalı.';
        elseif (!hash_equals($password, $confirm)) $error = 'Parolalar eşleşmiyor.';
        elseif (strlen($displayName) > 120) $error = 'Görünen ad çok uzun.';
        else {
            try {
                // WAMP one-click setup: create the configured database automatically when MySQL user has CREATE DATABASE permission.
                $dbConfig = app_config('db');
                $dbName = (string)($dbConfig['database'] ?? 'emlak54');
                if (!preg_match('/^[a-zA-Z0-9_]+$/', $dbName)) throw new RuntimeException('Veritabanı adı geçersiz.');
                $serverDsn = sprintf('mysql:host=%s;port=%d;charset=%s', $dbConfig['host'] ?? '127.0.0.1', (int)($dbConfig['port'] ?? 3306), $dbConfig['charset'] ?? 'utf8mb4');
                $serverPdo = new PDO($serverDsn, (string)($dbConfig['username'] ?? 'root'), (string)($dbConfig['password'] ?? ''), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
                $serverPdo->exec('CREATE DATABASE IF NOT EXISTS `' . $dbName . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
                unset($serverPdo);
                $pdo = db();
                run_sql_file($pdo, __DIR__ . '/database/schema.sql');
                // İlçe/mahalle seçim listeleri (yönetim panelindeki ilan formu kullanır).
                if (!ensure_location_tables($pdo)) throw new RuntimeException('İlçe/mahalle tabloları oluşturulamadı.');
                $existingAdmin = (int)$pdo->query('SELECT COUNT(*) FROM admins')->fetchColumn();
                if ($existingAdmin > 0) throw new RuntimeException('Yönetici kaydı zaten var. Kurulumu tekrar çalıştırmayın; storage/install.lock durumunu yöneticiniz kontrol etmeli.');
                $pdo->beginTransaction();

                $defaults = [
                  'brand_name'=>'Emlak 54','site_url'=>'http://localhost/emlak54_demo','site_tagline'=>'Sakarya ve çevresinde yeni yaşam alanları',
                  'phone_digits'=>'905550000054','phone_display'=>'+90 555 000 00 54','whatsapp_number'=>'905550000054','email'=>'bilgi@example.com','address'=>'Sakarya, Türkiye','office_hours'=>'Hafta içi 09.00 – 18.00',
                  'footer_description'=>'Sakarya ve çevresinde konut, arsa ve ticari gayrimenkul seçeneklerini keşfetmeniz için hazırlanmış emlak platformu.', 'logo_path'=>'', 'demo_notice'=>'1',
                  'seo_home_title'=>'Emlak 54 | Sakarya Satılık ve Kiralık Daire, Villa, Arsa İlanları',
                  'seo_home_description'=>'Emlak 54 ile Sakarya’da satılık daire, kiralık ev, villa, arsa ve iş yeri ilanlarını keşfedin. Adapazarı, Serdivan, Sapanca ve Arifiye ilanlarını fiyat ve özelliklerine göre inceleyin.',
                  'seo_about_title'=>'Hakkımızda | Emlak 54 Sakarya Gayrimenkul','seo_about_description'=>'Emlak 54 hakkında bilgi alın; Sakarya satılık ve kiralık daire, villa, arsa ve iş yeri portföyümüzü keşfedin.',
                  'seo_contact_title'=>'İletişim | Emlak 54 Sakarya','seo_contact_description'=>'Emlak 54 ile Sakarya satılık ve kiralık gayrimenkul ilanları hakkında iletişime geçin.',
                  'home_hero_title'=>'Sakarya’da Satılık ve Kiralık Gayrimenkul İlanları','home_hero_description'=>'Sakarya’da satılık daire, kiralık konut, villa, arsa ve iş yeri seçeneklerini inceleyin. İlanları konum, fiyat ve özelliklerine göre karşılaştırıp her gayrimenkulün detay sayfasını keşfedin.',
                  'home_listing_heading'=>'Öne çıkan ilanlar','home_listing_description'=>'Sakarya’daki örnek satılık ve kiralık gayrimenkul ilanlarını fiyat, konum, kategori ve özelliklerine göre filtreleyin.',
                  'home_seo_heading'=>'Sakarya’da gayrimenkul arayışınıza doğru yerden başlayın',
                  'home_seo_p1'=>'Emlak 54, Sakarya’daki konut ve yatırım amaçlı gayrimenkul seçeneklerini tek bir arayüzde incelemeyi kolaylaştırır. Satılık daire, kiralık daire, villa, müstakil ev, arsa ve ticari iş yeri ilanlarında fiyatı, konumu, metrekareyi ve öne çıkan özellikleri karşılaştırabilirsiniz.',
                  'home_seo_p2'=>'Portföy örneklerinde Adapazarı, Serdivan, Sapanca, Arifiye, Erenler ve Kaynarca gibi Sakarya ilçeleri yer alır. Her ilan için ayrı detay sayfası; fotoğraf galerisi, ilan açıklaması, temel özellikler ve konum bilgisini birlikte sunar.',
                  'home_promo_title'=>'Hayalindeki yer, bir telefon uzağında.','home_promo_text'=>'İhtiyacını ve bütçeni konuşalım; sana uygun seçenekleri birlikte değerlendirelim.',
                  'about_title'=>'Sakarya’da gayrimenkulü daha kolay keşfedin.','about_lead'=>'Emlak 54; Sakarya’daki satılık ve kiralık gayrimenkul seçeneklerini anlaşılır ilan detayları, fotoğraf galerileri ve pratik filtrelerle incelemek için tasarlanmıştır.',
                  'about_heading'=>'Emlak 54 ile Sakarya’da doğru seçimi keşfedin.','about_p1'=>'Emlak 54, Sakarya’da gayrimenkul arayanların farklı ilan türlerini tek bir yerde karşılaştırabilmesi için hazırlanmış bir portföy platformudur.','about_p2'=>'Adapazarı, Serdivan, Sapanca, Arifiye, Erenler ve Kaynarca ilçelerinde örnek ilanları inceleyebilir, fotoğraf ve özellikleri karşılaştırabilirsiniz. Yayın öncesinde demo portföy doğrulanmalıdır.',
                  'contact_title'=>'Emlak 54 ile iletişime geçin.','contact_description'=>'Sakarya’daki satılık ve kiralık gayrimenkuller hakkında iletişim kanallarımız üzerinden bilgi alın.','contact_heading'=>'Birlikte doğru adresi bulalım.','contact_intro'=>'İlanlar hakkında bilgi almak için telefon veya WhatsApp üzerinden bize ulaşabilirsiniz.',
                ];
                $settingStmt = $pdo->prepare('INSERT INTO site_settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)');
                foreach ($defaults as $key=>$value) $settingStmt->execute([$key,$value]);

                $adminHash = password_hash($password, defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT);
                if ($adminHash === false) throw new RuntimeException('Yönetici parolası güvenli biçimde saklanamadı.');
                $admin = $pdo->prepare('INSERT INTO admins (username,password_hash,display_name,role,is_active) VALUES (?,?,?,\'admin\',1)');
                $admin->execute([$username,$adminHash, $displayName !== '' ? $displayName : 'Site Yöneticisi']);
                $newAdminId = (int)$pdo->lastInsertId();

                $seedFile = __DIR__ . '/properties.json';
                $demo = json_decode((string)file_get_contents($seedFile), true);
                if (!is_array($demo) || count($demo) < 1) throw new RuntimeException('Demo ilan verisi bulunamadı.');
                $propertyStmt = $pdo->prepare('INSERT INTO properties (id,slug,title,deal,category,kind,price,city,district,neighborhood,address,area,rooms,baths,year_built,description,features_json,status,is_featured,badge,seo_title,seo_description,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP())');
                $imgStmt = $pdo->prepare('INSERT INTO property_images (property_id,image_path,alt_text,sort_order,is_cover) VALUES (?,?,?,?,?)');
                foreach ($demo as $p) {
                    $title = (string)($p['title'] ?? 'Demo Gayrimenkul');
                    $desc = (string)($p['description'] ?? 'Demo ilan açıklaması.');
                    $price = max(0, (float)($p['price'] ?? 0));
                    $features = is_array($p['features'] ?? null) ? $p['features'] : [];
                    $seoTitle = mb_safe_substr($title, 0, 48) . ' | Emlak 54';
                    $seoDesc = mb_safe_substr($desc, 0, 160);
                    $propertyStmt->execute([
                      (int)($p['id'] ?? 0), (string)($p['slug'] ?? slugify($title)), $title, (string)($p['deal'] ?? 'Satılık'),
                      (string)($p['category'] ?? 'Konut'), (string)($p['kind'] ?? 'Daire'), $price,
                      (string)($p['city'] ?? 'Sakarya'), (string)($p['district'] ?? ''), (string)($p['neighborhood'] ?? ''),
                      (string)($p['address'] ?? ''), (int)($p['area'] ?? 0), (string)($p['rooms'] ?? ''), (int)($p['baths'] ?? 0),
                      (int)($p['year'] ?? 2024), $desc, json_encode($features, JSON_UNESCAPED_UNICODE), 'active', !empty($p['isNew']) ? 1 : 0,
                      (string)($p['badge'] ?? ''), $seoTitle, $seoDesc,
                    ]);
                    foreach (array_slice((array)($p['images'] ?? []),0,20) as $idx=>$img) {
                        if (is_string($img) && str_starts_with($img,'https://images.unsplash.com/')) {
                            $imgStmt->execute([(int)($p['id'] ?? 0), $img, $title . ' fotoğraf ' . ($idx+1), $idx, $idx===0 ? 1 : 0]);
                        }
                    }
                }
                $pdo->prepare('INSERT INTO admin_actions (admin_id,action_key,object_type,details_json,ip_address) VALUES (?,?,?, ?,?)')->execute([$newAdminId,'install_completed','system',json_encode(['demo_properties'=>count($demo)]),client_ip()]);
                $pdo->commit();
                @mkdir(dirname($lockFile), 0750, true);
                if (file_put_contents($lockFile, 'installed_at=' . gmdate('c') . "\n", LOCK_EX) === false) throw new RuntimeException('Kurulum kilit dosyası yazılamadı. storage klasörü yazılabilir olmalı.');
                @chmod($lockFile, 0640);
                log_security_event('install_completed','info','İlk kurulum tamamlandı');
                $success = true;
                session_regenerate_id(true);
                $_SESSION['admin_id'] = $newAdminId;
                $_SESSION['admin_name'] = $displayName !== '' ? $displayName : 'Site Yöneticisi';
                $_SESSION['admin_login_at'] = time();
                $_SESSION['admin_last_activity'] = time();
                $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
            } catch (Throwable $ex) {
                if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
                error_log('[Emlak54 install] ' . $ex->getMessage());
                $error = app_config('app_env') === 'development' ? $ex->getMessage() : 'Kurulum başarısız. config.php, veritabanı erişimi ve storage izinlerini kontrol edin. Ayrıntı sunucu hata günlüğüne yazıldı.';
                log_security_event('install_failed','high','Kurulum başarısız oldu');
            }
        }
    }
}
if ($installMutexHeld && is_resource($installMutex)) { flock($installMutex, LOCK_UN); fclose($installMutex); }
function mb_safe_substr(string $s,int $start,int $length): string { return function_exists('mb_substr') ? mb_substr($s,$start,$length,'UTF-8') : substr($s,$start,$length); }
?><!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="light"><title>Emlak 54 Kurulum</title><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet"><style>
:root{font-family:'DM Sans',sans-serif;color:#1c2f49;background:#f4f7fb}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 10% 0,#e5efff,transparent 35%),#f4f7fb}.panel{width:min(560px,100%);background:#fff;border:1px solid #e5ebf4;border-radius:24px;padding:clamp(22px,5vw,42px);box-shadow:0 22px 70px #17375b14}.logo{font:800 24px Manrope,sans-serif;color:#102b4e}.logo span{color:#d7474f}.kicker{color:#bd8a19;letter-spacing:.14em;text-transform:uppercase;font-weight:800;font-size:11px;margin-top:24px}h1{font:800 clamp(25px,5vw,34px) Manrope,sans-serif;line-height:1.2;margin:8px 0 12px}p{color:#718096;line-height:1.65}.field{margin-top:16px}.field label{display:block;font-size:13px;font-weight:700;margin-bottom:7px}.field input{width:100%;border:1px solid #dce4ef;border-radius:12px;padding:13px 14px;font:inherit;background:#fafcff;outline:none}.field input:focus{border-color:#245bab;box-shadow:0 0 0 4px #245bab18}.btn{display:block;width:100%;margin-top:24px;border:0;border-radius:12px;background:#1d55a5;color:white;padding:14px;font:700 15px 'DM Sans',sans-serif;cursor:pointer}.alert{padding:12px 14px;border-radius:12px;margin:18px 0;background:#fff1f0;color:#ac3636;font-size:13px}.success{background:#eef9f3;color:#246c45}.small{font-size:12px;color:#7d899a;margin-top:17px}
</style></head><body><main class="panel"><div class="logo">Emlak <span>54</span></div><?php if ($success): ?><div class="kicker">Kurulum tamamlandı</div><h1>Yönetim panelin hazır.</h1><p>30 demo ilan verisi MySQL'e aktarıldı. Güvenlik nedeniyle ilk giriş yaptıktan sonra güçlü parolayı koru, gerçek alan adını ve iletişim bilgilerini SEO ayarlarından düzenle.</p><a class="btn" href="emlak-admin.php" style="text-decoration:none;text-align:center">Yönetim panelini aç</a><?php else: ?><div class="kicker">İlk kurulum</div><h1>Emlak 54 kurulumunu tamamla.</h1><p>Tek seferde veritabanını oluşturur, 30 demo ilanı aktarır ve yönetici hesabını hazırlar. Kullanıcı adını ve en az 8 karakterlik parolanı belirle.</p><?php if ($error): ?><div class="alert"><?=e($error)?></div><?php endif; ?><form method="post" autocomplete="off"><input type="hidden" name="csrf_token" value="<?=e(csrf_token())?>"><div class="field"><label for="display_name">Yönetici görünen adı</label><input id="display_name" name="display_name" maxlength="120" value="Site Yöneticisi" required></div><div class="field"><label for="username">Kullanıcı adı</label><input id="username" name="username" minlength="4" maxlength="80" pattern="[A-Za-z0-9._-]{4,80}" autocomplete="username" required></div><div class="field"><label for="password">Parola (en az 8 karakter)</label><input id="password" name="password" type="password" minlength="8" autocomplete="new-password" required></div><div class="field"><label for="password_confirm">Parolayı doğrula</label><input id="password_confirm" name="password_confirm" type="password" minlength="8" autocomplete="new-password" required></div><button class="btn" type="submit">Kurulumu güvenle tamamla</button></form><div class="small">WAMP varsayılanı: MySQL root kullanıcısı ve boş parola. MySQL kullanıcı bilgileriniz farklıysa config.php içinden değiştirin. Veritabanı otomatik oluşturulur. PHP PDO MySQL, Fileinfo ve WebP destekli GD önerilir. Kurulumdan sonra install.php kilitlenir.</div><?php endif; ?></main></body></html>

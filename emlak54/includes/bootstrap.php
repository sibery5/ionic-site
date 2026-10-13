<?php
declare(strict_types=1);

$config = require dirname(__DIR__) . '/config.php';
$GLOBALS['EMLAK54_CONFIG'] = $config;

// Never leak PHP warnings, file paths, or stack traces to public visitors in production.
ini_set('log_errors', '1');
ini_set('display_errors', (($config['app_env'] ?? 'production') === 'development') ? '1' : '0');
error_reporting(E_ALL);

if (PHP_VERSION_ID < 80200) {
    http_response_code(500);
    exit('Emlak 54 için PHP 8.2 veya üzeri gerekir. Üretimde güncel PHP 8.5.x güvenlik yaması önerilir.');
}

/*
 * Reverse proxy desteği: X-Forwarded-* / CF-Connecting-IP başlıklarına yalnızca
 * config.php içindeki trusted_proxies listesinden (IP veya CIDR) gelen isteklerde güvenilir.
 */
function ip_in_range(string $ip, string $range): bool {
    if (!str_contains($range, '/')) return $ip === $range;
    [$subnet, $bits] = explode('/', $range, 2);
    $ipBin = @inet_pton($ip); $subBin = @inet_pton($subnet);
    if ($ipBin === false || $subBin === false || strlen($ipBin) !== strlen($subBin)) return false;
    $bits = max(0, min(strlen($ipBin) * 8, (int)$bits));
    $bytes = intdiv($bits, 8); $rest = $bits % 8;
    if ($bytes > 0 && substr($ipBin, 0, $bytes) !== substr($subBin, 0, $bytes)) return false;
    if ($rest === 0) return true;
    $mask = chr((0xFF << (8 - $rest)) & 0xFF);
    return (($ipBin[$bytes] & $mask) === ($subBin[$bytes] & $mask));
}
function is_trusted_proxy(string $ip): bool {
    foreach ((array)($GLOBALS['EMLAK54_CONFIG']['trusted_proxies'] ?? []) as $range) {
        if (is_string($range) && $range !== '' && ip_in_range($ip, trim($range))) return true;
    }
    return false;
}
function request_is_https(): bool {
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') return true;
    if ((string)($_SERVER['SERVER_PORT'] ?? '') === '443') return true;
    return strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https' && is_trusted_proxy((string)($_SERVER['REMOTE_ADDR'] ?? ''));
}

$isHttps = request_is_https();
if (!headers_sent()) {
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    header('Cross-Origin-Opener-Policy: same-origin');
    header('X-Permitted-Cross-Domain-Policies: none');
    header("Content-Security-Policy: default-src 'self'; img-src 'self' https: data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self' https://maps.google.com https://www.google.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' https://wa.me https://www.google.com" . ($isHttps ? '; upgrade-insecure-requests' : ''));
    if ($isHttps) header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    header_remove('X-Powered-By');
}

ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_samesite', 'Lax');
// Oturum yalnızca yönetim/kurulum sayfalarında veya mevcut oturum çerezi varsa açılır:
// ziyaretçilere gereksiz çerez gönderilmez ve sayfalar geri/ileri önbelleğinden (bfcache) anında açılabilir.
$sessionName = (string)($config['session_name'] ?? 'EMLAK54SESSID');
$needsSession = isset($_COOKIE[$sessionName])
    || preg_match('~(?:^|/)(?:emlak-admin|admin-api|install)\.php$~', str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? ''))) === 1
    || PHP_SAPI === 'cli';
if ($needsSession && session_status() !== PHP_SESSION_ACTIVE) {
    session_name($sessionName);
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'domain' => '',
        'secure' => $isHttps,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}
if (session_status() !== PHP_SESSION_ACTIVE && !headers_sent()) header('Cache-Control: no-cache, private');

/** Yöneticiye olduğu gibi gösterilebilecek doğrulama hataları (iç ayrıntı içermez). */
class UserInputException extends RuntimeException {}

function app_config(?string $key = null): mixed {
    $c = $GLOBALS['EMLAK54_CONFIG'] ?? [];
    return $key === null ? $c : ($c[$key] ?? null);
}

function db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $c = app_config('db');
    $password = (string)($c['password'] ?? '');
    if ($password === 'CHANGE_ME_BEFORE_INSTALL') {
        throw new RuntimeException('Önce config.php dosyasındaki veritabanı kullanıcı adı ve parolasını ayarlayın.');
    }
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', $c['host'] ?? '127.0.0.1', (int)($c['port'] ?? 3306), $c['database'] ?? 'emlak54', $c['charset'] ?? 'utf8mb4');
    $pdo = new PDO($dsn, (string)($c['username'] ?? ''), $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_STRINGIFY_FETCHES => false,
        PDO::MYSQL_ATTR_MULTI_STATEMENTS => false,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}

function e(mixed $value): string {
    return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function json_response(array $payload, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, private');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function client_ip(): string {
    // Only REMOTE_ADDR is trusted by default. Forwarded headers are read only behind a configured trusted proxy.
    static $resolved = null;
    if ($resolved !== null) return $resolved;
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    if (filter_var($ip, FILTER_VALIDATE_IP) && is_trusted_proxy($ip)) {
        $cf = trim((string)($_SERVER['HTTP_CF_CONNECTING_IP'] ?? ''));
        if ($cf !== '' && filter_var($cf, FILTER_VALIDATE_IP)) {
            $ip = $cf;
        } else {
            // Right-most address that is not one of our proxies is the real client.
            $chain = array_reverse(array_map('trim', explode(',', (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''))));
            foreach ($chain as $hop) {
                if (!filter_var($hop, FILTER_VALIDATE_IP)) break;
                $ip = $hop;
                if (!is_trusted_proxy($hop)) break;
            }
        }
    }
    return $resolved = (filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '0.0.0.0');
}

function safe_request_path(): string {
    $path = parse_url((string)($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/';
    return substr(preg_replace('/[^\pL\pN\-_.\/~]/u', '', $path) ?: '/', 0, 255);
}

function installed(): bool {
    try {
        $r = db()->query("SHOW TABLES LIKE 'admins'")->fetchColumn();
        return (bool)$r && is_file(dirname(__DIR__) . '/storage/install.lock');
    } catch (Throwable) { return false; }
}

function site_settings(bool $refresh = false): array {
    static $cache = null;
    if ($cache !== null && !$refresh) return $cache;
    $cache = [];
    try {
        foreach (db()->query('SELECT setting_key, setting_value FROM site_settings')->fetchAll() as $row) {
            $cache[(string)$row['setting_key']] = (string)$row['setting_value'];
        }
    } catch (Throwable) { /* Defaults below keep installer and error pages renderable. */ }
    return $cache;
}

function setting(string $key, string $default = ''): string {
    $settings = site_settings();
    return array_key_exists($key, $settings) ? (string)$settings[$key] : $default;
}

function csrf_token(): string {
    if (empty($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function verify_csrf(): void {
    $given = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? $_POST['csrf_token'] ?? '');
    if ($given === '' || !hash_equals(csrf_token(), $given)) {
        log_security_event('csrf_failed', 'high', 'CSRF token validation failed');
        json_response(['ok' => false, 'message' => 'Güvenlik doğrulaması başarısız. Sayfayı yenileyip tekrar deneyin.'], 403);
    }
}

function admin_id(): ?int {
    $id = $_SESSION['admin_id'] ?? null;
    return is_numeric($id) ? (int)$id : null;
}

function admin_name(): string {
    return (string)($_SESSION['admin_name'] ?? 'Yönetici');
}

function require_admin(bool $json = true): void {
    $id = admin_id();
    $now = time();
    $loginAt = (int)($_SESSION['admin_login_at'] ?? 0);
    $lastActivity = (int)($_SESSION['admin_last_activity'] ?? 0);
    $expired = $lastActivity <= 0 || $loginAt <= 0
        || ($now - $lastActivity) > 1800
        || ($now - $loginAt) > 28800;
    if (!$id || $expired) {
        if ($id) { session_unset(); session_regenerate_id(true); }
        if ($json) json_response(['ok' => false, 'message' => 'Yönetici oturumu sona erdi. Güvenlik için yeniden giriş yapın.'], 401);
        header('Location: emlak-admin.php');
        exit;
    }
    try {
        $stmt = db()->prepare('SELECT is_active FROM admins WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $active = $stmt->fetchColumn();
    } catch (Throwable) {
        if ($json) json_response(['ok' => false, 'message' => 'Yönetici oturumu doğrulanamadı. Veritabanı bağlantısını kontrol edin.'], 503);
        http_response_code(503);
        exit('Yönetici oturumu doğrulanamadı.');
    }
    if ((string)$active !== '1') {
        session_unset(); session_regenerate_id(true);
        if ($json) json_response(['ok' => false, 'message' => 'Yönetici hesabı etkin değil. Yeniden giriş yapın.'], 401);
        header('Location: emlak-admin.php');
        exit;
    }
    $_SESSION['admin_last_activity'] = $now;
}

function log_security_event(string $type, string $severity = 'warning', string $detail = ''): void {
    $severity = in_array($severity, ['info','warning','high','critical'], true) ? $severity : 'warning';
    try {
        $stmt = db()->prepare('INSERT INTO security_events (ip_address,event_type,severity,http_method,request_path,user_agent,detail) VALUES (?,?,?,?,?,?,?)');
        $stmt->execute([
            client_ip(), substr($type, 0, 60), $severity,
            substr((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'), 0, 10),
            safe_request_path(), substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
            substr(preg_replace('/[\x00-\x1F\x7F]/u', ' ', strip_tags($detail)) ?? '', 0, 600),
        ]);
    } catch (Throwable) { /* Security logging must not disclose internals or crash a public page. */ }
}

function is_ip_banned(?string $ip = null): bool {
    try {
        $stmt = db()->prepare('SELECT id FROM ip_bans WHERE ip_address=? AND is_active=1 AND (banned_until IS NULL OR banned_until > UTC_TIMESTAMP()) LIMIT 1');
        $stmt->execute([$ip ?? client_ip()]);
        return (bool)$stmt->fetchColumn();
    } catch (Throwable) { return false; }
}

function auto_ban(string $ip, string $reason, int $hours = 24): void {
    if (!filter_var($ip, FILTER_VALIDATE_IP)) return;
    try {
        $stmt = db()->prepare("INSERT INTO ip_bans (ip_address,reason,banned_until,is_active) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? HOUR),1) ON DUPLICATE KEY UPDATE reason=VALUES(reason),banned_until=VALUES(banned_until),is_active=1,updated_at=UTC_TIMESTAMP()");
        $stmt->execute([$ip, substr($reason, 0, 255), max(1, min(720, $hours))]);
    } catch (Throwable) {}
}

function block_banned_ip(bool $json = false): void {
    if (!is_ip_banned()) return;
    http_response_code(403);
    header('Cache-Control: no-store');
    if ($json) json_response(['ok' => false, 'message' => 'Bu IP adresinden erişim engellendi.'], 403);
    exit('Erişim engellendi.');
}

function scan_request_for_attack(): void {
    $path = safe_request_path();
    if (str_contains($path, 'install.php') || str_contains($path, 'favicon')) return;
    // Oturumu geçerli yöneticinin (CSRF korumalı) ilan metinleri taranmaz: "-- " gibi normal yazımlar
    // yanlış alarm üretip yöneticinin kendi IP'sini otomatik engelleyebiliyordu.
    if (admin_id() && (time() - (int)($_SESSION['admin_last_activity'] ?? 0)) <= 1800) return;
    $values = [];
    $sensitiveKeys = ['password','password_confirm','current_password','new_password','new_password_confirm','csrf_token'];
    foreach ([$_GET, $_POST] as $bag) {
        foreach ($bag as $k => $v) {
            if (in_array(strtolower((string)$k), $sensitiveKeys, true)) continue;
            if (is_scalar($v)) $values[] = substr((string)$v, 0, 500);
            elseif (is_array($v)) {
                foreach (array_slice($v, 0, 10) as $sub) if (is_scalar($sub)) $values[] = substr((string)$sub, 0, 500);
            }
        }
    }
    $patterns = [
        'xss_probe' => '~<\s*script\b|javascript\s*:|onerror\s*=|document\.cookie~i',
        'sql_injection_probe' => '~union\s+(all\s+)?select|(?:sleep|benchmark)\s*\(|into\s+outfile|load_file\s*\(|information_schema|--\s|/\*.*\*/~i',
        'path_traversal_probe' => '~\.\.[\\/].*\.\.[\\/]|/etc/passwd|\\windows\\system32|php://(input|filter)~i',
    ];
    foreach ($patterns as $type => $regex) {
        foreach ($values as $value) {
            if (preg_match($regex, $value)) {
                log_security_event($type, 'high', 'Şüpheli parametre örüntüsü algılandı');
                try {
                    $stmt = db()->prepare("SELECT COUNT(*) FROM security_events WHERE ip_address=? AND severity IN ('high','critical') AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE)");
                    $stmt->execute([client_ip()]);
                    if ((int)$stmt->fetchColumn() >= 5) auto_ban(client_ip(), 'Kısa sürede tekrarlanan şüpheli istekler', 24);
                } catch (Throwable) {}
                return;
            }
        }
    }
}

function rate_limit(string $scope, int $maxHits, int $windowSeconds): bool {
    $key = hash('sha256', $scope . '|' . client_ip());
    try {
        $pdo = db();
        $stmt = $pdo->prepare('SELECT window_started_at,hits FROM rate_limits WHERE bucket_key=?');
        $stmt->execute([$key]);
        $row = $stmt->fetch();
        if (!$row) {
            $insert = $pdo->prepare('INSERT IGNORE INTO rate_limits (bucket_key,window_started_at,hits) VALUES (?,UTC_TIMESTAMP(),1)');
            $insert->execute([$key]);
            return true;
        }
        $elapsed = time() - (strtotime((string)$row['window_started_at'] . ' UTC') ?: time());
        if ($elapsed >= $windowSeconds) {
            $upd = $pdo->prepare('UPDATE rate_limits SET window_started_at=UTC_TIMESTAMP(),hits=1 WHERE bucket_key=?');
            $upd->execute([$key]);
            return true;
        }
        if ((int)$row['hits'] >= $maxHits) return false;
        $upd = $pdo->prepare('UPDATE rate_limits SET hits=hits+1 WHERE bucket_key=?');
        $upd->execute([$key]);
        return true;
    } catch (Throwable) { return true; }
}

function log_admin_action(string $action, string $objectType = '', ?int $objectId = null, array $details = []): void {
    try {
        $stmt = db()->prepare('INSERT INTO admin_actions (admin_id,action_key,object_type,object_id,details_json,ip_address) VALUES (?,?,?,?,?,?)');
        $stmt->execute([admin_id(), substr($action, 0, 100), substr($objectType, 0, 80), $objectId, json_encode($details, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE), client_ip()]);
    } catch (Throwable) {}
}

function record_page_view(string $type, string $pageKey = '', ?int $propertyId = null): void {
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    if ($ua === '' || preg_match('~bot|crawler|spider|slurp|preview|monitoring|headless~i', $ua)) return;
    try {
        $visitor = hash('sha256', client_ip() . '|' . gmdate('Y-m-d') . '|' . (string)($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? ''));
        $uaHash = hash('sha256', $ua);
        $stmt = db()->prepare('INSERT INTO page_views (page_type,page_key,property_id,visitor_hash,user_agent_hash) VALUES (?,?,?,?,?)');
        $stmt->execute([substr($type, 0, 24), substr($pageKey, 0, 220), $propertyId, $visitor, $uaHash]);
        if ($propertyId) db()->prepare('UPDATE properties SET view_count=view_count+1 WHERE id=?')->execute([$propertyId]);
    } catch (Throwable) {}
}

function slugify(string $text): string {
    $text = strtr($text, ['ı'=>'i','İ'=>'i','ğ'=>'g','Ğ'=>'g','ü'=>'u','Ü'=>'u','ş'=>'s','Ş'=>'s','ö'=>'o','Ö'=>'o','ç'=>'c','Ç'=>'c']);
    $text = strtolower($text);
    $text = preg_replace('~[^a-z0-9]+~', '-', $text) ?? '';
    return trim($text, '-') ?: 'emlak-ilani';
}

function normalize_property(array $row): array {
    $images = $row['images'] ?? [];
    if (is_string($images)) $images = json_decode($images, true) ?: [];
    $features = $row['features'] ?? $row['features_json'] ?? [];
    if (is_string($features)) $features = json_decode($features, true) ?: [];
    return [
        'id' => (int)($row['id'] ?? 0), 'slug' => (string)($row['slug'] ?? ''),
        'title' => (string)($row['title'] ?? ''), 'deal' => (string)($row['deal'] ?? 'Satılık'),
        'category' => (string)($row['category'] ?? 'Konut'), 'kind' => (string)($row['kind'] ?? 'Daire'),
        'price' => (float)($row['price'] ?? 0), 'district' => (string)($row['district'] ?? ''),
        'neighborhood' => (string)($row['neighborhood'] ?? ''), 'city' => (string)($row['city'] ?? 'Sakarya'),
        'address' => (string)($row['address'] ?? ''), 'area' => (int)($row['area'] ?? 0),
        'rooms' => (string)($row['rooms'] ?? ''), 'baths' => (int)($row['baths'] ?? 0),
        'year' => (int)($row['year_built'] ?? $row['year'] ?? 2024),
        'description' => (string)($row['description'] ?? ''), 'features' => is_array($features) ? array_values($features) : [],
        'images' => is_array($images) ? array_values($images) : [], 'isNew' => !empty($row['is_featured']),
        'badge' => (string)($row['badge'] ?? ''), 'status' => (string)($row['status'] ?? 'active'),
        'seo_title' => (string)($row['seo_title'] ?? ''), 'seo_description' => (string)($row['seo_description'] ?? ''),
        'created' => (int)(strtotime((string)($row['created_at'] ?? '') . ' UTC') ?: 0),
    ];
}

function fetch_properties(bool $publishedOnly = true): array {
    $pdo = db();
    $sql = 'SELECT * FROM properties' . ($publishedOnly ? " WHERE status='active'" : '') . ' ORDER BY is_featured DESC, created_at DESC, id DESC';
    $items = $pdo->query($sql)->fetchAll();
    if (!$items) return [];
    $imgStmt = $pdo->prepare('SELECT image_path FROM property_images WHERE property_id=? ORDER BY is_cover DESC, sort_order ASC, id ASC');
    $out = [];
    foreach ($items as $item) {
        $imgStmt->execute([(int)$item['id']]);
        $item['images'] = array_column($imgStmt->fetchAll(), 'image_path');
        $item['features'] = json_decode((string)($item['features_json'] ?? '[]'), true) ?: [];
        $out[] = normalize_property($item);
    }
    return $out;
}

function find_property_by_slug(string $slug, bool $publishedOnly = true): ?array {
    $sql = 'SELECT * FROM properties WHERE slug=?' . ($publishedOnly ? " AND status='active'" : '') . ' LIMIT 1';
    $stmt = db()->prepare($sql);
    $stmt->execute([$slug]);
    $row = $stmt->fetch();
    if (!$row) return null;
    $img = db()->prepare('SELECT id,image_path,alt_text,sort_order,is_cover FROM property_images WHERE property_id=? ORDER BY is_cover DESC,sort_order ASC,id ASC');
    $img->execute([(int)$row['id']]);
    $images = $img->fetchAll();
    $row['images'] = array_column($images, 'image_path');
    $row['image_rows'] = $images;
    $row['features'] = json_decode((string)($row['features_json'] ?? '[]'), true) ?: [];
    return normalize_property($row) + [
        'image_rows' => $images, 'address' => (string)$row['address'],
        'floor_info' => (string)$row['floor_info'], 'building_age' => (string)$row['building_age'],
        'heating' => (string)$row['heating'], 'furnished' => (!array_key_exists('furnished', $row) || $row['furnished'] === null) ? null : (bool)$row['furnished'],
        'latitude' => $row['latitude'], 'longitude' => $row['longitude'],
        'seo_keywords' => (string)$row['seo_keywords'], 'meta_robots' => (string)$row['meta_robots'],
        'created_at' => (string)$row['created_at'], 'updated_at' => (string)$row['updated_at'],
    ];
}

function phone_digits(): string { return preg_replace('/\D+/', '', setting('phone_digits', '905550000054')) ?: '905550000054'; }
function whatsapp_digits(): string { return preg_replace('/\D+/', '', setting('whatsapp_number', '905550000054')) ?: '905550000054'; }
function site_url(string $suffix = ''): string {
    $base = rtrim(setting('site_url', 'http://localhost/emlak54_demo'), '/');
    return $base . ($suffix !== '' ? '/' . ltrim($suffix, '/') : '/');
}
// Gerçek kurulu dizine göre kök yol (ör. /emlak54/). CSS/JS ve site içi
// bağlantılar bununla üretilir; DB'deki site_url bayatsa bile site çalışır.
function app_base_path(): string {
    $scriptName = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? '/index.php'));
    $dir = rtrim(dirname($scriptName), '/.');
    if ($dir === '' || $dir === '.' || $dir === '\\') $dir = '';
    // ilan/slug gibi rewrite altında SCRIPT_NAME ilan.php olabilir; yine de dizin doğru çıkar.
    return $dir . '/';
}
function app_base_url(): string {
    $host = (string)($_SERVER['HTTP_HOST'] ?? 'localhost');
    $host = preg_replace('/[^a-zA-Z0-9.\-:\[\]]/', '', $host) ?: 'localhost';
    return (request_is_https() ? 'https://' : 'http://') . $host . app_base_path();
}
function asset_url(string $file): string {
    return app_base_path() . ltrim($file, '/');
}
// Dosya değiştiğinde tarayıcı önbelleği otomatik yenilensin diye CSS/JS adresine sürüm eklenir.
function asset_version(string $file): string {
    static $cache = [];
    $file = ltrim($file, '/');
    if (!isset($cache[$file])) {
        $path = dirname(__DIR__) . '/' . $file;
        $cache[$file] = is_file($path) ? base_convert((string)filemtime($path), 10, 36) : '1';
    }
    return $cache[$file];
}
function asset_vurl(string $file): string {
    return asset_url($file) . '?v=' . asset_version($file);
}
function local_page_url(string $file = ''): string {
    return app_base_path() . ltrim($file, '/');
}
function brand_name_html(): string {
    $name = trim(setting('brand_name', 'Emlak 54')) ?: 'Emlak 54';
    if (preg_match('/^(.*?)[\s-]+(\d{2,4})$/u', $name, $m)) return e(trim($m[1])) . ' <span>' . e($m[2]) . '</span>';
    return e($name);
}
function brand_markup(): string {
    // Templates provide the outer .brand-mark span; return safe inner content only.
    $logo = trim(setting('logo_path', ''));
    if ($logo !== '' && preg_match('~^uploads/branding/[a-f0-9]{24,40}\.webp$~', $logo)) {
        return '<img class="brand-custom-img" src="' . e(asset_url($logo)) . '" alt="" width="46" height="46" decoding="async">';
    }
    return '<svg aria-hidden="true" fill="none" height="27" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24" width="27"><path d="m3 10 9-7 9 7"></path><path d="M5 9v11h14V9M9 20v-6h6v6"></path></svg>';
}
function social_svg(string $paths): string {
    return '<svg aria-hidden="true" fill="none" height="17" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24" width="17">' . $paths . '</svg>';
}
// Yalnizca baglanti girilmis aglar + WhatsApp cikar; bos birakilan simge basilmaz.
function social_links_html(): string {
    $out = '';
    $nets = [
        'Instagram' => ['social_instagram', '<rect height="18" rx="5" width="18" x="3" y="3"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>'],
        'Facebook' => ['social_facebook', '<path d="M14 8h3V4h-3a5 5 0 0 0-5 5v3H6v4h3v4h4v-4h3l1-4h-4V9a1 1 0 0 1 1-1Z"/>'],
        'X' => ['social_x', '<path d="M4 4h3.6l4.5 6.1L16.8 4H20l-6.5 8.2L20.4 20h-3.6l-4.9-6.6L7 20H4l7-8.8Z"/>'],
        'YouTube' => ['social_youtube', '<rect height="12" rx="3.5" width="19" x="2.5" y="6"/><path d="m10.5 9.8 4.5 2.2-4.5 2.2Z"/>'],
    ];
    foreach ($nets as $label => [$key, $paths]) {
        $url = trim(setting($key, ''));
        if ($url === '') continue;
        if (!preg_match('~^https?://~i', $url)) $url = 'https://' . $url;
        if (filter_var($url, FILTER_VALIDATE_URL) === false) continue;
        $out .= '<a aria-label="' . $label . '" class="social-link" href="' . e($url) . '" target="_blank" rel="noopener noreferrer">' . social_svg($paths) . '</a>';
    }
    $sh = trim(setting('social_sahibinden',''));
    if ($sh !== '') {
        if (!preg_match('~^https?://~i', $sh)) $sh = 'https://' . $sh;
        if (filter_var($sh, FILTER_VALIDATE_URL) !== false) {
            $out .= '<a aria-label="Sahibinden mağazamız" class="social-link" href="' . e($sh) . '" target="_blank" rel="noopener noreferrer"><svg aria-hidden="true" height="22" viewBox="0 0 24 24" width="22"><rect height="24" rx="6" width="24" x="0" y="0" fill="#FFE800"/><text dominant-baseline="central" fill="#111111" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="900" text-anchor="middle" x="12" y="13">S</text></svg></a>';
        }
    }
    $wa = whatsapp_digits();
    if (strlen($wa) >= 10) {
        $out .= '<a aria-label="WhatsApp" class="social-link" href="https://wa.me/' . e($wa) . '" target="_blank" rel="noopener noreferrer">' . social_svg('<path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-4.6A8.5 8.5 0 1 1 20.5 11.5Z"/><path d="M8 8.2c.4-.7.7-.7 1-.7h.4c.2 0 .4.1.5.4l.8 1.9c.1.2.1.4-.1.6l-.6.7c-.2.2-.2.3-.1.5.7 1.2 1.7 2.1 2.9 2.7.2.1.4.1.5-.1l.8-.9c.2-.2.4-.2.6-.1l1.8.9c.2.1.3.3.3.5 0 .3-.2 1.2-.8 1.6-.5.4-1.2.6-2 .4-1-.2-2.3-.9-3.6-2.1-1.1-1-1.8-2.2-2.1-3.2-.3-.9-.1-1.7.3-2.3Z"/>') . '</a>';
    }
    return $out;
}
function public_image_url(string $path): string {
    $path = trim($path);
    if ($path === '') return asset_url('assets/logo.svg');
    if (preg_match('~^https?://~i', $path)) return $path;
    // Yerel yüklemeler gerçek kurulu dizine göre çözülür; site_url bayatsa bile kırılmaz.
    return app_base_url() . ltrim($path, '/');
}
function json_for_script(mixed $value): string {
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_INVALID_UTF8_SUBSTITUTE) ?: 'null';
}
function brand_mark_markup(): string { return brand_markup(); }
function site_theme(): string {
    $allowed = ['mavi','emlak54','ortak'];
    // Yönetici, temayı yayına almadan önce ?tema_onizle=ortak ile kendi tarayıcısında önizleyebilir.
    $preview = (string)($_GET['tema_onizle'] ?? '');
    if ($preview !== '' && in_array($preview, $allowed, true) && admin_id()) return $preview;
    $t = setting('site_theme','mavi');
    return in_array($t, $allowed, true) ? $t : 'mavi';
}
function theme_color(): string {
    return ['mavi'=>'#102b4e','emlak54'=>'#141414','ortak'=>'#0f0f16'][site_theme()] ?? '#102b4e';
}
function sync_indexnow_key_file(string $old, string $new): void {
    $root = dirname(__DIR__);
    if ($old !== '' && $old !== $new && preg_match('~^[a-f0-9]{32}$~', $old)) {
        $f = $root . '/' . $old . '.txt';
        if (is_file($f)) @unlink($f);
    }
    if ($new !== '' && preg_match('~^[a-f0-9]{32}$~', $new)) {
        @file_put_contents($root . '/' . $new . '.txt', $new);
        @chmod($root . '/' . $new . '.txt', 0644);
    }
}
function indexnow_submit_urls(array $urls): array {
    $out = ['bing' => null, 'yandex' => null, 'sent' => 0, 'ok' => false, 'message' => ''];
    if (setting('indexnow_enabled', '0') !== '1') { $out['message'] = 'Otomatik bildirim kapalı.'; return $out; }
    $key = trim(setting('indexnow_key', ''));
    if (!preg_match('~^[a-f0-9]{32}$~', $key)) { $out['message'] = 'IndexNow anahtarı eksik.'; return $out; }
    $base = rtrim(setting('site_url', ''), '/');
    if (!preg_match('~^https://~i', $base) || preg_match('~localhost|127\.0\.0\.1~i', $base)) { $out['message'] = 'Canlı HTTPS adresi gerekli.'; return $out; }
    $u = parse_url($base);
    $host = (string)($u['host'] ?? '');
    if ($host === '') { $out['message'] = 'Site adresi geçersiz.'; return $out; }
    $clean = [];
    foreach ($urls as $x) {
        $x = trim((string)$x);
        if ($x !== '' && str_starts_with($x, $base . '/')) $clean[] = $x;
    }
    $clean = array_values(array_unique($clean));
    if (!$clean) { $out['message'] = 'Bildirilecek URL yok.'; return $out; }
    $clean = array_slice($clean, 0, 500);
    $payload = json_encode(['host' => $host, 'key' => $key, 'keyLocation' => $base . '/' . $key . '.txt', 'urlList' => $clean], JSON_UNESCAPED_SLASHES);
    foreach (['bing' => 'https://www.bing.com/indexnow', 'yandex' => 'https://yandex.com/indexnow'] as $eng => $ep) {
        $ctx = stream_context_create(['http' => ['method' => 'POST', 'header' => "Content-Type: application/json\r\n", 'content' => $payload, 'timeout' => 4, 'ignore_errors' => true]]);
        $r = @file_get_contents($ep, false, $ctx);
        $code = 0;
        if (isset($http_response_header[0]) && preg_match('~HTTP/\S+\s+(\d+)~', $http_response_header[0], $m)) $code = (int)$m[1];
        $out[$eng] = ($r !== false && ($code === 200 || $code === 202)) ? 'ok' : 'hata(' . $code . ')';
    }
    $out['sent'] = count($clean);
    $out['ok'] = in_array('ok', [$out['bing'], $out['yandex']], true);
    if (!$out['ok']) $out['message'] = 'Bildirim gönderilemedi. Ayarları kontrol edin.';
    return $out;
}
function seo_self_links(): bool { return setting('seo_self_links','0')==='1'; }
function gsc_verification_token(): string {
    $raw = trim(setting('google_site_verification',''));
    if ($raw === '') return '';
    // Panele tam meta etiketi de yapıştırılabilir; content değerini çıkar.
    if (preg_match('~content\s*=\s*["\']([^"\']+)["\']~i', $raw, $m)) $raw = trim($m[1]);
    return preg_match('~^[A-Za-z0-9_-]{10,128}$~', $raw) ? $raw : '';
}
function gsc_verification_meta(): string {
    $t = gsc_verification_token();
    return $t === '' ? '' : '<meta name="google-site-verification" content="'.e($t).'">';
}

function load_partial(string $name): string {
    $file = dirname(__DIR__) . '/partials/' . basename($name) . '.tpl';
    return is_file($file) ? (string)file_get_contents($file) : '';
}

function render_page_template(string $name): string {
    $file = dirname(__DIR__) . '/templates/' . basename($name) . '.tpl';
    if (!is_file($file)) throw new RuntimeException('Sayfa şablonu bulunamadı.');
    $html = (string)file_get_contents($file);
    $html = str_replace('<html lang="tr">', '<html lang="tr" data-theme="'.e(site_theme()).'">', $html);
    return render_common_template($html, $name);
}

/** Yayındaki ilanlardan hesaplanan gerçek sayılar (uydurma istatistik kullanılmaz). */
function site_stats(): array {
    static $stats = null;
    if ($stats !== null) return $stats;
    $stats = ['active'=>0,'sale'=>0,'rent'=>0,'districts'=>0,'categories'=>['Konut'=>0,'Arsa'=>0,'İş yeri'=>0],'district_list'=>[]];
    try {
        $rows = db()->query("SELECT deal,category,district,COUNT(*) AS c FROM properties WHERE status='active' GROUP BY deal,category,district")->fetchAll();
        foreach ($rows as $r) {
            $c = (int)$r['c'];
            $stats['active'] += $c;
            if ($r['deal'] === 'Satılık') $stats['sale'] += $c;
            elseif ($r['deal'] === 'Kiralık') $stats['rent'] += $c;
            $cat = (string)$r['category'];
            if (array_key_exists($cat, $stats['categories'])) $stats['categories'][$cat] += $c;
            $d = trim((string)$r['district']);
            if ($d !== '') $stats['district_list'][$d] = ($stats['district_list'][$d] ?? 0) + $c;
        }
        arsort($stats['district_list']);
        $stats['districts'] = count($stats['district_list']);
    } catch (Throwable) { /* İstatistik hatası sayfayı düşürmez. */ }
    return $stats;
}

function ui_icon(string $name, int $size = 16): string {
    static $paths = [
        'pin'=>'<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
        'bed'=>'<path d="M3 18V5M3 14h18v7M21 18v3M3 10h18v4M7 10V7h4a3 3 0 0 1 3 3"/>',
        'bath'=>'<path d="M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5ZM5 12V5a2 2 0 0 1 4 0v2M7 20v2M17 20v2"/>',
        'area'=>'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7h10v10H7zM7 12h10M12 7v10"/>',
        'heart'=>'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>',
        'arrow'=>'<path d="M5 12h14M13 6l6 6-6 6"/>',
        'calendar'=>'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
        'phone'=>'<path d="M21 16.4v3a2 2 0 0 1-2.2 2 19.7 19.7 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.7 19.7 0 0 1 1.1 3.7 2 2 0 0 1 3.1 1.5h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L7 9.5a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z"/>',
        'whatsapp'=>'<path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-4.6A8.5 8.5 0 1 1 20.5 11.5Z"/><path d="M8.5 8.6c.3-.6.6-.6.9-.6h.4c.2 0 .4.1.5.4l.7 1.7c.1.2.1.4-.1.6l-.5.6c-.2.2-.2.3-.1.5.6 1 1.5 1.9 2.6 2.4.2.1.4.1.5-.1l.7-.8c.2-.2.4-.2.6-.1l1.6.8c.2.1.3.3.3.5 0 .3-.2 1.1-.8 1.4-.5.3-1.1.5-1.8.3-.9-.2-2-.8-3.2-1.9-1-.9-1.6-1.9-1.9-2.8-.2-.8-.1-1.5.3-2.1Z"/>',
        'mail'=>'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
        'home'=>'<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-6h6v6"/>',
        'key'=>'<circle cx="8" cy="15" r="5"/><path d="m11.5 11.5 8-8 2 2-2.5 2.5 1.5 1.5-2.5 2.5-1.5-1.5-2 2"/>',
        'land'=>'<path d="M3 20h18M5 20V9l4-3 4 3v11M13 20v-7h6v7"/><path d="M8 12h2M8 15h2"/>',
        'shop'=>'<path d="M4 9h16l-1.5-5h-13Z"/><path d="M5 9v11h14V9M9 20v-6h6v6"/><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/>',
        'tag'=>'<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
        'check'=>'<path d="m5 12 4 4L19 6"/>',
        'compass'=>'<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>',
        'shield'=>'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
        'search'=>'<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
        'map'=>'<path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2Z"/><path d="M9 4v14M15 6v14"/>',
        'clock'=>'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        'building'=>'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M10 21v-3h4v3"/>',
        'spark'=>'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
        'eye'=>'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
        'layers'=>'<path d="m12 2 9 5-9 5-9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
        'chat'=>'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>',
        'route'=>'<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M12 19h4.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H12"/>',
        'x'=>'<path d="m18 6-12 12M6 6l12 12"/>',
        'share'=>'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.7 6.6-4.4m-6.6 7 6.6 4.4"/>',
        'expand'=>'<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
    ];
    return '<svg aria-hidden="true" width="'.$size.'" height="'.$size.'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'.($paths[$name] ?? $paths['arrow']).'</svg>';
}

function format_try(float $value): string { return number_format($value, 0, ',', '.') . ' ₺'; }
// Eski kayıtlarda oda sayısı yalnızca rakam ("5"); "5+3" gibi yanıltıcı birleştirme yerine "5 oda" yazılır.
function rooms_label(string $rooms): string {
    $r = trim($rooms);
    if ($r === '' || $r === '0') return '';
    return str_contains($r, '+') ? $r : $r . ' oda';
}

/** Ana sayfadaki ilan kartının sunucu tarafı karşılığı (app.js card() ile aynı işaretleme). */
function property_card_html(array $p): string {
    $slug = preg_match('/^[a-z0-9-]{1,190}$/', (string)($p['slug'] ?? '')) ? (string)$p['slug'] : '';
    $href = e(local_page_url('ilan/' . $slug . '/'));
    $title = (string)($p['title'] ?? '') ?: 'Gayrimenkul ilanı';
    $fallback = asset_url('assets/logo.svg');
    $img = (string)(($p['images'][0] ?? '') ?: $fallback);
    $srcset = e(str_replace('w=1200', 'w=500', $img)) . ' 500w, ' . e(str_replace('w=1200', 'w=900', $img)) . ' 900w, ' . e($img) . ' 1200w';
    $place = implode(', ', array_filter([(string)($p['district'] ?? ''), (string)($p['city'] ?? '')]));
    $deal = (string)($p['deal'] ?? 'İlan');
    $badge = trim((string)($p['badge'] ?? ''));
    $rooms = rooms_label((string)($p['rooms'] ?? ''));
    $year = (int)($p['year'] ?? 0);
    $price = format_try((float)($p['price'] ?? 0)) . ($deal === 'Kiralık' ? '<small> / ay</small>' : '');
    return '<article class="property-card" data-property-id="'.(int)$p['id'].'">'
        . '<div class="card-image-wrap"><a class="card-media" href="'.$href.'" aria-label="'.e($title).' ilan detayını aç" tabindex="-1"><img class="card-image" src="'.e($img).'" srcset="'.$srcset.'" sizes="(max-width:760px) 92vw, (max-width:1050px) 45vw, 31vw" alt="'.e($title.' — '.($place ?: 'Sakarya').' ilan fotoğrafı').'" width="1200" height="800" loading="lazy" decoding="async" onerror="this.onerror=null;this.removeAttribute(\'srcset\');this.src=\''.e($fallback).'\'"></a>'
        . '<span class="image-shade"></span><div class="card-badges"><span class="badge deal'.($deal === 'Kiralık' ? ' rent' : '').'">'.e($deal).'</span>'.($badge !== '' ? '<span class="badge'.($badge === 'Öne Çıkan' ? ' highlight' : '').'">'.e($badge).'</span>' : '').'</div>'
        . '<button class="favorite-btn" type="button" data-favorite="'.(int)$p['id'].'" aria-label="İlanı kaydet: '.e($title).'" aria-pressed="false">'.ui_icon('heart', 18).'</button>'
        . '<span class="card-location">'.ui_icon('pin', 14).' '.e($place ?: ((string)($p['neighborhood'] ?? '') ?: 'Sakarya')).'</span></div>'
        . '<div class="card-content"><h3 class="card-title"><a href="'.$href.'">'.e($title).'</a></h3><div class="card-subtitle">'.e((string)($p['kind'] ?? '')).' · '.e((string)($p['category'] ?? '')).'</div>'
        . '<div class="card-specs"><span class="spec">'.ui_icon('area', 15).' '.(int)($p['area'] ?? 0).' m²</span>'.($rooms !== '' ? '<span class="spec">'.ui_icon('bed', 15).' '.e($rooms).'</span>' : '').'<span class="spec">'.ui_icon('calendar', 15).' '.($year ?: '—').'</span></div>'
        . '<div class="card-bottom"><div class="price">'.$price.'</div><a class="card-link" href="'.$href.'" aria-label="'.e($title).' detayları">'.ui_icon('arrow', 18).'</a></div></div></article>';
}

/** Site temasıyla tutarlı 404 sayfası (header/footer ve canlı arama dahil). */
function render_not_found_page(string $heading = 'Aradığınız sayfayı bulamadık.', string $text = 'Bağlantı hatalı olabilir ya da sayfa kaldırılmış olabilir. Aşağıdan ilanlarda arama yapabilir veya ana sayfaya dönebilirsiniz.'): string {
    if (!headers_sent()) { http_response_code(404); header('Cache-Control: no-store'); }
    $tpl = '<!doctype html><html lang="tr" data-theme="'.e(site_theme()).'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,follow"><title>Sayfa bulunamadı | {{BRAND_NAME_TEXT}}</title>{{COMMON_HEAD}}</head><body data-page="404">{{SITE_HEADER}}<main id="main-content"><section class="notfound"><span aria-hidden="true" class="banner-pattern"></span><div class="container notfound-inner"><div class="notfound-code" aria-hidden="true"><span>4</span><span class="notfound-house">'.ui_icon('home', 54).'</span><span>4</span></div><h1>%%HEADING%%</h1><p>%%TEXT%%</p><div class="live-search-widget notfound-search" data-endpoint="search.php" data-live-search="" data-search-limit="5" data-url-prefix=""><label class="live-search-label" for="liveSearch404">İlanlarda arayın</label><form autocomplete="off" class="live-search-form" role="search"><svg aria-hidden="true" class="live-search-icon" fill="none" height="19" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24" width="19"><path d="M20 20l-4.2-4.2M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"/></svg><input aria-autocomplete="list" aria-controls="liveSearch404Results" aria-expanded="false" aria-label="İlan ara" autocomplete="off" class="live-search-input" id="liveSearch404" maxlength="160" minlength="2" name="q" placeholder="İlçe, ilan adı, oda sayısı…" type="search"><button aria-label="İlan ara" class="live-search-submit" type="submit">'.ui_icon('search', 18).'<span>Ara</span></button></form><div aria-label="Arama sonuçları" class="live-search-results" hidden id="liveSearch404Results" role="listbox"></div></div><div class="notfound-actions"><a class="btn btn-primary" href="index.php">'.ui_icon('home', 16).' Ana sayfaya dön</a><a class="btn btn-outline" href="index.php#ilanlar">Tüm ilanlar</a><a class="btn btn-outline" href="iletisim.php">İletişim</a></div></div></section></main>{{SITE_FOOTER}}<script defer src="site-config.php"></script><script defer src="app.js"></script><script defer src="live-search.js"></script><script defer src="page-transitions.js"></script></body></html>';
    $html = render_common_template($tpl, '');
    return str_replace(['%%HEADING%%', '%%TEXT%%'], [e($heading), e($text)], $html);
}

function nav_tokens(string $page): array {
    $out = [];
    foreach (['home'=>'NAV_HOME','about'=>'NAV_ABOUT','contact'=>'NAV_CONTACT','listing'=>'NAV_LISTING'] as $key=>$token) {
        $out['{{'.$token.'}}'] = $key === $page ? ' aria-current="page"' : '';
    }
    return $out;
}

function render_common_template(string $html, string $page = ''): string {
    // 1) Ortak parçalar: tek kaynaktan head, header ve footer (her sayfada aynı tasarım).
    $html = str_replace(['{{COMMON_HEAD}}','{{SITE_HEADER}}','{{SITE_FOOTER}}'], [load_partial('head'), load_partial('header'), load_partial('footer')], $html);
    $html = strtr($html, nav_tokens($page));

    $defaults = [
      'SEO_HOME_TITLE'=>'Emlak 54 | Sakarya Satılık ve Kiralık Daire, Villa, Arsa İlanları',
      'SEO_HOME_DESCRIPTION'=>'Emlak 54 ile Sakarya’da satılık daire, kiralık ev, villa, arsa ve iş yeri ilanlarını keşfedin. Adapazarı, Serdivan, Sapanca ve Arifiye ilanlarını fiyat ve özelliklere göre inceleyin.',
      'SEO_ABOUT_TITLE'=>'Hakkımızda | Emlak 54 Sakarya Gayrimenkul',
      'SEO_ABOUT_DESCRIPTION'=>'Emlak 54 hakkında bilgi alın; Sakarya satılık ve kiralık daire, villa, arsa ve iş yeri portföyümüzü keşfedin.',
      'SEO_CONTACT_TITLE'=>'İletişim | Emlak 54 Sakarya',
      'SEO_CONTACT_DESCRIPTION'=>'Emlak 54 ile Sakarya satılık ve kiralık gayrimenkul ilanları hakkında iletişime geçin.',
      'HERO_TITLE'=>'Sakarya’da Satılık ve Kiralık Gayrimenkul İlanları',
      'HERO_DESCRIPTION'=>'Sakarya’da satılık daire, kiralık konut, villa, arsa ve iş yeri seçeneklerini inceleyin. İlanları konum, fiyat ve özelliklerine göre karşılaştırıp her gayrimenkulün detay sayfasını keşfedin.',
      'LISTING_HEADING'=>'Öne çıkan ilanlar',
      'LISTING_DESCRIPTION'=>'Sakarya’daki satılık ve kiralık gayrimenkul ilanlarını fiyat, konum, kategori ve özelliklerine göre filtreleyin.',
      'SEO_LANDING_TITLE'=>'Sakarya’da gayrimenkul arayışınıza doğru yerden başlayın',
      'SEO_LANDING_P1'=>'Emlak 54, Sakarya’daki konut ve yatırım amaçlı gayrimenkul seçeneklerini tek bir arayüzde incelemeyi kolaylaştırır. Satılık daire, kiralık daire, villa, müstakil ev, arsa ve ticari iş yeri ilanlarında fiyatı, konumu, metrekareyi ve öne çıkan özellikleri karşılaştırabilirsiniz.',
      'SEO_LANDING_P2'=>'Portföy örneklerinde Adapazarı, Serdivan, Sapanca, Arifiye, Erenler ve Kaynarca gibi Sakarya ilçeleri yer alır. Her ilan için ayrı detay sayfası; fotoğraf galerisi, ilan açıklaması, temel özellikler ve konum bilgisini birlikte sunar.',
      'PROMO_TITLE'=>'Hayalindeki yer, bir telefon uzağında.', 'PROMO_TEXT'=>'İhtiyacını ve bütçeni konuşalım; sana uygun seçenekleri birlikte değerlendirelim.',
      'ABOUT_TITLE'=>'Sakarya’da gayrimenkulü daha kolay keşfedin.',
      'ABOUT_LEAD'=>'Emlak 54; Sakarya’daki satılık ve kiralık gayrimenkul seçeneklerini anlaşılır ilan detayları, fotoğraf galerileri ve pratik filtrelerle incelemek için tasarlanmıştır.',
      'ABOUT_HEADING'=>'Emlak 54 ile Sakarya’da doğru seçimi keşfedin.',
      'ABOUT_P1'=>'Emlak 54, Sakarya’da gayrimenkul arayanların farklı ilan türlerini tek bir yerde karşılaştırabilmesi için hazırlanmış bir portföy platformudur.',
      'ABOUT_P2'=>'Adapazarı, Serdivan, Sapanca, Arifiye, Erenler ve Kaynarca ilçelerinde ilanları inceleyebilir, fotoğraf ve özellikleri karşılaştırabilirsiniz.',
      'CONTACT_TITLE'=>'Emlak 54 ile iletişime geçin.', 'CONTACT_DESCRIPTION'=>'Sakarya’daki satılık ve kiralık gayrimenkuller hakkında iletişim kanallarımız üzerinden bilgi alın.',
      'CONTACT_HEADING'=>'Birlikte doğru adresi bulalım.', 'CONTACT_INTRO'=>'İlanlar hakkında bilgi almak için telefon veya WhatsApp üzerinden bize ulaşabilirsiniz.',
      'FOOTER_DESCRIPTION'=>'Sakarya ve çevresinde konut, arsa ve ticari gayrimenkul seçeneklerini keşfetmeniz için hazırlanmış emlak platformu.',
      'SITE_TAGLINE'=>'Sakarya ve çevresinde yeni yaşam alanları', 'BRAND_NAME_TEXT'=>'Emlak 54',
    ];
    $keyMap = [
      'SEO_HOME_TITLE'=>'seo_home_title','SEO_HOME_DESCRIPTION'=>'seo_home_description','SEO_ABOUT_TITLE'=>'seo_about_title','SEO_ABOUT_DESCRIPTION'=>'seo_about_description','SEO_CONTACT_TITLE'=>'seo_contact_title','SEO_CONTACT_DESCRIPTION'=>'seo_contact_description',
      'HERO_TITLE'=>'home_hero_title','HERO_DESCRIPTION'=>'home_hero_description','LISTING_HEADING'=>'home_listing_heading','LISTING_DESCRIPTION'=>'home_listing_description','SEO_LANDING_TITLE'=>'home_seo_heading','SEO_LANDING_P1'=>'home_seo_p1','SEO_LANDING_P2'=>'home_seo_p2','PROMO_TITLE'=>'home_promo_title','PROMO_TEXT'=>'home_promo_text',
      'ABOUT_TITLE'=>'about_title','ABOUT_LEAD'=>'about_lead','ABOUT_HEADING'=>'about_heading','ABOUT_P1'=>'about_p1','ABOUT_P2'=>'about_p2','CONTACT_TITLE'=>'contact_title','CONTACT_DESCRIPTION'=>'contact_description','CONTACT_HEADING'=>'contact_heading','CONTACT_INTRO'=>'contact_intro','FOOTER_DESCRIPTION'=>'footer_description','SITE_TAGLINE'=>'site_tagline','BRAND_NAME_TEXT'=>'brand_name'
    ];
    foreach ($defaults as $token=>$default) {
        $key=$keyMap[$token]??''; $value=$key!==''?setting($key,$default):$default;
        $html=str_replace('{{'.$token.'}}',e($value),$html);
    }
    $html=str_replace('{{BRAND_NAME_HTML}}',brand_name_html(),$html);
    $html=str_replace('{{BRAND_MARKUP}}',brand_mark_markup(),$html);
    $html=str_replace('{{SITE_URL}}',e(site_url()),$html);
    $html=str_replace('{{THEME_COLOR}}',e(theme_color()),$html);
    $html=str_replace('{{CURRENT_YEAR}}',gmdate('Y'),$html);
    $html=str_replace('{{PHONE_DIGITS}}',e(phone_digits()),$html);
    $html=str_replace('{{PHONE_DISPLAY}}',e(setting('phone_display','+90 555 000 00 54')),$html);
    $html=str_replace('{{WHATSAPP_DIGITS}}',e(whatsapp_digits()),$html);
    $html=str_replace('{{WHATSAPP_URL}}','https://wa.me/'.e(whatsapp_digits()),$html);
    $html=str_replace('{{EMAIL}}',e(setting('email','bilgi@example.com')),$html);
    $html=str_replace('{{ADDRESS}}',e(setting('address','Sakarya, Türkiye')),$html);
    $openAddress = trim(setting('open_address',''));
    if ($openAddress === '') $openAddress = trim(setting('address','Sakarya, Türkiye'));
    $html=str_replace('{{OPEN_ADDRESS}}',e($openAddress),$html);
    $mapQuery = $openAddress !== '' ? $openAddress : 'Sakarya, Türkiye';
    $html=str_replace('{{MAP_QUERY}}',e($mapQuery),$html);
    $html=str_replace('{{MAP_EMBED_URL}}',e('https://maps.google.com/maps?q='.rawurlencode($mapQuery).'&t=&z=14&ie=UTF8&iwloc=&output=embed'),$html);
    $html=str_replace('{{MAP_DIRECTIONS_URL}}',e('https://www.google.com/maps/search/?api=1&query='.rawurlencode($mapQuery)),$html);

    // Vitrin (hero) fotoğrafı ve paylaşım görseli: yönetimden yüklenen fotoğraf varsa ikisi de onu kullanır.
    $defaultHero = 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=78&fm=webp';
    $heroCustom = trim(setting('hero_image_path',''));
    $ogImage = $defaultHero;
    if ($heroCustom !== '' && preg_match('~^uploads/branding/[a-f0-9]{24,40}\.webp$~', $heroCustom)) {
        $heroUrl = e(asset_url($heroCustom));
        $html = preg_replace('/(<img[^>]*class="hero-photo"[^>]*src=")[^"]*("[^>]*srcset=")[^"]*/', '$1' . $heroUrl . '$2' . $heroUrl, $html, 1) ?? $html;
        $ogImage = app_base_url() . $heroCustom;
    }
    $html=str_replace('{{OG_IMAGE}}',e($ogImage),$html);

    $html=str_replace('{{SOCIAL_LINKS}}',social_links_html(),$html);
    foreach (['SOCIAL_INSTAGRAM'=>'social_instagram','SOCIAL_FACEBOOK'=>'social_facebook','SOCIAL_X'=>'social_x','SOCIAL_YOUTUBE'=>'social_youtube'] as $token=>$key) {
        $url = trim(setting($key,''));
        if ($url !== '' && !preg_match('~^https?://~i',$url)) $url = 'https://'.$url;
        $valid = ($url !== '' && filter_var($url,FILTER_VALIDATE_URL) !== false);
        $html=str_replace('{{'.$token.'_URL}}', $valid ? e($url) : app_base_path().'iletisim.php', $html);
    }

    // Gerçek portföy sayıları (yalnızca yayındaki ilanlar).
    if (str_contains($html, '{{STAT_') || str_contains($html, '{{CNT_') || str_contains($html, '{{DISTRICT_CHIPS}}') || str_contains($html, '{{IF_LISTINGS}}')) {
        $st = site_stats();
        $html = strtr($html, [
            '{{STAT_ACTIVE}}' => (string)$st['active'], '{{STAT_SALE}}' => (string)$st['sale'], '{{STAT_RENT}}' => (string)$st['rent'],
            '{{STAT_DISTRICTS}}' => (string)$st['districts'],
            '{{CNT_KONUT}}' => (string)$st['categories']['Konut'], '{{CNT_ARSA}}' => (string)$st['categories']['Arsa'], '{{CNT_ISYERI}}' => (string)$st['categories']['İş yeri'],
            '{{IF_LISTINGS}}' => $st['active'] > 0 ? '' : 'hidden',
        ]);
        $chips = '';
        foreach (array_slice($st['district_list'], 0, 12, true) as $district => $count) {
            $chips .= '<a class="district-chip" href="'.e(local_page_url('?konum='.rawurlencode((string)$district).'#ilanlar')).'">'.ui_icon('pin', 14).'<span>'.e((string)$district).'</span><b>'.(int)$count.'</b></a>';
        }
        $html = str_replace('{{DISTRICT_CHIPS}}', $chips, $html);
    }

    // Tip filtresi: sabit liste yerine yayındaki ilanlarda gerçekten bulunan kategoriler ve tipler.
    if (str_contains($html, '{{TYPE_OPTIONS}}')) {
        $values = [];
        foreach (site_stats()['categories'] as $cat => $count) if ($count > 0) $values[$cat] = $cat === 'Konut' ? 'Tüm konutlar' : ($cat === 'İş yeri' ? 'Tüm iş yerleri' : $cat);
        try {
            foreach (db()->query("SELECT kind, COUNT(*) AS c FROM properties WHERE status='active' AND kind<>'' GROUP BY kind ORDER BY c DESC, kind")->fetchAll() as $row) {
                $kind = (string)$row['kind'];
                if (!isset($values[$kind])) $values[$kind] = $kind;
            }
        } catch (Throwable) {}
        $opts = '<option value="Tümü">Tüm tipler</option>';
        foreach ($values as $value => $label) $opts .= '<option value="'.e($value).'">'.e($label).'</option>';
        $html = str_replace('{{TYPE_OPTIONS}}', $opts, $html);
    }

    if (str_contains($html,'{{PROPERTY_SCRIPT}}') || str_contains($html,'{{PROPERTY_CARDS}}')) {
        $published = fetch_properties(true);
        $properties = array_map(function($p){
            $p['images']=array_map(fn($img)=>public_image_url((string)$img),(array)($p['images']??[]));
            return array_intersect_key($p,array_flip(['id','slug','title','deal','category','kind','price','district','neighborhood','city','address','area','rooms','baths','year','description','features','images','isNew','badge','created']));
        }, $published);
        $html=str_replace('{{PROPERTY_SCRIPT}}','<script>window.EMLAK54_PROPERTIES='.json_for_script($properties).';</script>',$html);
        $html=str_replace('{{PROPERTY_CARDS}}', implode('', array_map('property_card_html', array_slice($properties, 0, 30))), $html);
        $list = '';
        if (seo_self_links() && $properties) {
            $items = []; $pos = 1;
            foreach (array_slice($properties, 0, 30) as $p) $items[] = ['@type'=>'ListItem','position'=>$pos++,'url'=>site_url('ilan/'.rawurlencode((string)$p['slug']).'/'),'name'=>(string)$p['title']];
            $list = '<script type="application/ld+json">'.json_for_script(['@context'=>'https://schema.org','@type'=>'ItemList','name'=>(trim(setting('brand_name','Emlak 54')) ?: 'Emlak 54').' ilanları','numberOfItems'=>count($items),'itemListElement'=>$items]).'</script>';
        }
        $html=str_replace('{{ITEMLIST_SCHEMA}}',$list,$html);
    }
    $html=str_replace('{{ITEMLIST_SCHEMA}}','',$html);
    $html=str_replace('https://example.com/',e(site_url()),$html);

    // CSS/JS ve site içi bağlantılar gerçek kurulu dizine göre (ör. /emlak54/) yazılır;
    // DB'deki site_url (yalnızca canonical/SEO için) bayat olsa bile stil ve gezinme kırılmaz.
    $assetBase = app_base_path();
    foreach (['style.css','app.js','page-transitions.js','live-search.js','detail.js'] as $versioned) {
        $html=str_replace(['href="'.$versioned.'"','src="'.$versioned.'"'], ['href="'.e(asset_vurl($versioned)).'"','src="'.e(asset_vurl($versioned)).'"'], $html);
    }
    foreach (['favicon.svg','site-config.php','assets/'] as $assetFile) {
        $html=str_replace('href="'.$assetFile, 'href="'.e($assetBase.$assetFile), $html);
        $html=str_replace('src="'.$assetFile, 'src="'.e($assetBase.$assetFile), $html);
        $html=str_replace('srcset="'.$assetFile, 'srcset="'.e($assetBase.$assetFile), $html);
    }
    // Ana sayfa tek adreste yaşar: index.php yerine kök dizin (yinelenen URL oluşmaz).
    $html=str_replace(['href="index.php"','href="index.php#'], ['href="'.e($assetBase).'"','href="'.e($assetBase).'#'], $html);
    foreach (['hakkimizda.php','iletisim.php','search.php'] as $rootFile) {
        $html=str_replace('href="'.$rootFile, 'href="'.e($assetBase.$rootFile), $html);
        $html=str_replace('data-endpoint="'.$rootFile, 'data-endpoint="'.e($assetBase.$rootFile), $html);
    }
    $html=str_replace('data-url-prefix=""', 'data-url-prefix="'.e($assetBase).'"', $html);
    $configuredBase = rtrim(setting('site_url', ''), '/');
    if ($configuredBase !== '' && strpos($configuredBase, '://') !== false) {
        $cfgPath = (string)parse_url($configuredBase, PHP_URL_PATH);
        $realPath = rtrim($assetBase, '/');
        if ($cfgPath !== '' && $cfgPath !== '/' && $cfgPath !== $realPath) {
            $html=str_replace($configuredBase.'/', app_base_url(), $html);
            $html=str_replace($configuredBase, rtrim(app_base_url(), '/'), $html);
        }
    }

    $html=str_replace('{{OFFICE_HOURS}}',e(setting('office_hours','Hafta içi 09.00 – 18.00')),$html);
    $html=str_replace('{{DEMO_NOTICE}}',setting('demo_notice','1')==='1'?'':'hidden',$html);

    $gscMeta = gsc_verification_meta();
    if ($gscMeta !== '' && stripos($html, '</head>') !== false) {
        $html = preg_replace('~</head>~i', $gscMeta.'</head>', $html, 1) ?? $html;
    }
    // Self link modu kapalıyken mutlak canonical/og:url basılmaz (local güvenliği).
    if (!seo_self_links()) {
        $html = preg_replace('~<link[^>]*rel="canonical"[^>]*>~i', '', $html) ?? $html;
        $html = preg_replace('~<meta[^>]*property="og:url"[^>]*>~i', '', $html) ?? $html;
    }

    // Yerel işletme yapılandırılmış verisi yalnızca gerçek alan adı + gerçek iletişim bilgisi girildiğinde basılır.
    if (stripos($html, '</head>') !== false) {
        $site = rtrim(setting('site_url', ''), '/');
        $email = trim(setting('email', ''));
        $address = trim(setting('address', ''));
        $phone = phone_digits();
        $isLiveDomain = preg_match('~^https://~i', $site) === 1
            && !preg_match('~(?:localhost|127\.0\.0\.1|example\.com)~i', $site);
        $isLiveContact = filter_var($email, FILTER_VALIDATE_EMAIL) !== false
            && !str_ends_with(strtolower($email), '.example') && !str_ends_with(strtolower($email), '@example.com')
            && strlen($phone) >= 10 && $phone !== '905550000054'
            && $address !== '' && $address !== 'Sakarya, Türkiye'
            && setting('demo_notice', '1') === '0';
        if ($isLiveDomain && $isLiveContact) {
            $agent = [
                '@context' => 'https://schema.org',
                '@type' => 'RealEstateAgent',
                '@id' => $site . '/#real-estate-agent',
                'name' => trim(setting('brand_name', 'Emlak 54')) ?: 'Emlak 54',
                'url' => $site . '/',
                'telephone' => '+' . $phone,
                'email' => $email,
                'address' => ['@type' => 'PostalAddress','streetAddress' => trim(setting('open_address','')) ?: $address,'addressRegion' => 'Sakarya','addressCountry' => 'TR'],
                'areaServed' => ['@type' => 'AdministrativeArea', 'name' => 'Sakarya, Türkiye'],
            ];
            $logo = trim(setting('logo_path', ''));
            if ($logo !== '' && preg_match('~^uploads/branding/[a-f0-9]{24,40}\.webp$~', $logo)) $agent['logo'] = $site . '/' . $logo;
            $sameAs = array_values(array_filter(array_map(fn($k) => trim(setting($k, '')), ['social_instagram','social_facebook','social_x','social_youtube','social_sahibinden']), fn($u) => $u !== '' && filter_var($u, FILTER_VALIDATE_URL)));
            if ($sameAs) $agent['sameAs'] = $sameAs;
            $schemaTag = '<script type="application/ld+json">' . json_for_script($agent) . '</script>';
            $html = preg_replace('~</head>~i', $schemaTag . '</head>', $html, 1) ?? $html;
        }
    }
    return $html;
}

/** SQL dosyasını ifade ifade çalıştırır (yorum satırları atlanır). */
function run_sql_file(PDO $pdo, string $file): void {
    $sql = is_file($file) ? (string)file_get_contents($file) : '';
    if ($sql === '') throw new RuntimeException('SQL dosyası okunamadı: ' . basename($file));
    $sql = preg_replace('~^\s*--.*$~m', '', $sql) ?? $sql;
    foreach (preg_split('~;\s*(?:\R|$)~', $sql) ?: [] as $statement) {
        $statement = trim($statement);
        if ($statement !== '') $pdo->exec($statement);
    }
}
/** İlçe/mahalle tabloları eski kurulumlarda yoksa oluşturulur ve Sakarya listesiyle doldurulur. */
function ensure_location_tables(PDO $pdo): bool {
    try {
        if ($pdo->query("SHOW TABLES LIKE 'districts'")->fetchColumn() && (int)$pdo->query('SELECT COUNT(*) FROM districts')->fetchColumn() > 0) return true;
        run_sql_file($pdo, dirname(__DIR__) . '/database/locations.sql');
        return true;
    } catch (Throwable $e) {
        error_log('[Emlak54 locations] ' . $e->getMessage());
        return false;
    }
}

function image_upload_to_webp(array $file, string $group = 'properties', string $seoName = ''): string {
    $c = app_config();
    $max = (int)($c['max_upload_bytes'] ?? 12582912);
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $code = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($code === UPLOAD_ERR_NO_FILE) throw new UserInputException('Fotoğraf seçilmedi.');
        if ($code === UPLOAD_ERR_INI_SIZE || $code === UPLOAD_ERR_FORM_SIZE) throw new UserInputException('Fotoğraf boyutu sunucu sınırını aşıyor.');
        throw new UserInputException('Fotoğraf yükleme sırasında hata oluştu.');
    }
    $tmp = (string)($file['tmp_name'] ?? '');
    $size = (int)($file['size'] ?? 0);
    if ($size < 1 || $size > $max || !is_uploaded_file($tmp)) throw new UserInputException('Fotoğraf 12 MB sınırını aşmamalı.');
    if (!extension_loaded('gd') || !function_exists('imagewebp') || !function_exists('imagecreatefromstring')) throw new UserInputException('WebP dönüştürme için sunucuda PHP GD + WebP desteği etkin olmalı.');
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($tmp);
    if (!in_array($mime, ['image/jpeg','image/png','image/webp','image/avif'], true)) throw new UserInputException('Yalnızca JPEG, PNG, WebP veya desteklenen AVIF fotoğrafları yüklenebilir. SVG ve GIF kabul edilmez.');
    $info = @getimagesize($tmp);
    if (!$info || empty($info[0]) || empty($info[1])) throw new UserInputException('Fotoğraf dosyası geçerli değil.');
    $w=(int)$info[0]; $h=(int)$info[1];
    if ($w < 64 || $h < 64 || $w > 12000 || $h > 12000 || $w*$h > 40000000) throw new UserInputException('Fotoğrafın boyutları izin verilen sınırları aşıyor.');
    $raw = file_get_contents($tmp);
    if ($raw === false) throw new UserInputException('Fotoğraf okunamadı.');
    $im = @imagecreatefromstring($raw);
    unset($raw);
    if (!$im instanceof GdImage) throw new UserInputException('Fotoğrafın içeriği çözümlenemedi.');
    $maxW = 2560; $maxH = 1920;
    if ($w > $maxW || $h > $maxH) {
        $ratio = min($maxW / $w, $maxH / $h);
        $nw = max(1, (int)round($w*$ratio)); $nh = max(1, (int)round($h*$ratio));
        $resampled = imagecreatetruecolor($nw, $nh);
        imagealphablending($resampled, false); imagesavealpha($resampled, true);
        imagecopyresampled($resampled,$im,0,0,0,0,$nw,$nh,$w,$h);
        imagedestroy($im); $im=$resampled;
    }
    if (($group ?? 'properties') !== 'branding') watermark_emlak54($im);
    $subdir = $group === 'branding' ? 'branding' : 'properties';
    $dir = dirname(__DIR__) . '/uploads/' . $subdir;
    if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) { imagedestroy($im); throw new UserInputException('Yükleme klasörü oluşturulamadı.'); }
    $name = bin2hex(random_bytes(16)) . '.webp';
    if ($seoName !== '' && $group !== 'branding') {
        $base = substr(slugify($seoName), 0, 70);
        if ($base === '' || $base === false) $base = 'emlak-ilan';
        $name = $base . '.webp';
        $k = 2;
        while (is_file($dir . '/' . $name) && $k < 500) { $name = $base . '-' . $k . '.webp'; $k++; }
    }
    $dest = $dir . '/' . $name;
    $ok = imagewebp($im, $dest, 82);
    imagedestroy($im);
    if (!$ok || !is_file($dest) || filesize($dest) < 64) { @unlink($dest); throw new UserInputException('Fotoğraf WebP biçimine dönüştürülemedi.'); }
    @chmod($dest, 0640);
    return 'uploads/' . $subdir . '/' . $name;
}

function watermark_emlak54(GdImage $im): void {
    $w = imagesx($im); $h = imagesy($im);
    if ($w < 1 || $h < 1) return;
    $text = 'Emlak54';
    $fonts = ['C:\\Windows\\Fonts\\arialbd.ttf', 'C:\\Windows\\Fonts\\arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'];
    $font = '';
    foreach ($fonts as $f) { if (is_file($f)) { $font = $f; break; } }
    if ($font === '') {
        $c = imagecolorallocatealpha($im, 255, 255, 255, 60);
        imagestring($im, 5, max(0, (int)($w / 2) - 50), max(0, (int)($h / 2) - 8), $text, $c);
        return;
    }
    $size = max(17, (int)($w / 34));
    $angle = -28;
    $box = imagettfbbox($size, $angle, $font, $text);
    $tw = max(40, abs($box[2] - $box[0])); $th = max(20, abs($box[7] - $box[1]));
    $white = imagecolorallocatealpha($im, 255, 255, 255, 100);
    $shade = imagecolorallocatealpha($im, 13, 36, 64, 75);
    for ($y = (int)($th / 2); $y < $h + $th; $y += ($th + 260)) {
        for ($x = -$tw; $x < $w + $tw; $x += ($tw + 230)) {
            imagettftext($im, $size, $angle, $x + 2, $y + 2, $shade, $font, $text);
            imagettftext($im, $size, $angle, $x, $y, $white, $font, $text);
        }
    }
}
function delete_local_upload(string $path): void {
    if (!preg_match('~^uploads/(properties|branding)/(?:[a-f0-9]{32}|[a-z0-9][a-z0-9-]{0,78})\.webp$~', $path)) return;
    $full = dirname(__DIR__) . '/' . $path;
    if (is_file($full)) @unlink($full);
}

// Common edge protections run on application requests; install.php stays reachable for first-time setup only.
if (!str_ends_with(safe_request_path(), '/install.php')) {
    block_banned_ip(str_contains(safe_request_path(), 'api/') || str_contains(safe_request_path(), 'search.php'));
    scan_request_for_attack();
}

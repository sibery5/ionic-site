<?php
declare(strict_types=1);

/*
 * Emlak 54 production configuration.
 * Prefer environment variables on hosting. Never commit real secrets to public Git.
 * For local WAMP, defaults use MySQL root with an empty password; set EMLAK54_DB_* if your local MySQL credentials differ.
 */
return [
    'db' => [
        'host' => getenv('EMLAK54_DB_HOST') ?: '127.0.0.1',
        'port' => (int)(getenv('EMLAK54_DB_PORT') ?: 3306),
        'database' => getenv('EMLAK54_DB_NAME') ?: 'emlak54',
        'username' => getenv('EMLAK54_DB_USER') ?: 'root',
        'password' => (getenv('EMLAK54_DB_PASS') !== false) ? (string)getenv('EMLAK54_DB_PASS') : '',
        'charset' => 'utf8mb4',
    ],
    'app_env' => getenv('APP_ENV') ?: 'production',
    'session_name' => 'EMLAK54SESSID',
    'max_upload_bytes' => 12 * 1024 * 1024,
    'max_images_per_property' => 20,
    // Cloudflare / yük dengeleyici arkasındaysanız proxy IP veya CIDR aralıklarını yazın
    // (ör. EMLAK54_TRUSTED_PROXIES="173.245.48.0/20,103.21.244.0/22"). Boş bırakılırsa yalnızca REMOTE_ADDR kullanılır;
    // böylece sahte X-Forwarded-For başlıklarıyla IP engeli/hız sınırı atlatılamaz.
    'trusted_proxies' => array_values(array_filter(array_map('trim', explode(',', (string)(getenv('EMLAK54_TRUSTED_PROXIES') ?: ''))))),
];

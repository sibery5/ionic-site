<?php
declare(strict_types=1);
require __DIR__ . '/includes/bootstrap.php';
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: public, max-age=3600');
// Yollar kurulu dizine göre yazılır (kök veya alt klasör). Görseller, CSS ve JS taranabilir kalır.
$b = app_base_path();
$lines = [
    'User-agent: *',
    'Allow: ' . $b,
    'Disallow: ' . $b . 'emlak-admin.php',
    'Disallow: ' . $b . 'admin-api.php',
    'Disallow: ' . $b . 'install.php',
    'Disallow: ' . $b . 'search.php',
    'Disallow: ' . $b . '404.php',
    'Disallow: ' . $b . '*?tema_onizle=',
    'Disallow: ' . $b . 'api/',
    'Disallow: ' . $b . 'storage/',
    'Disallow: ' . $b . 'database/',
    'Disallow: ' . $b . 'includes/',
    'Disallow: ' . $b . 'templates/',
    'Disallow: ' . $b . 'partials/',
    'Disallow: ' . $b . 'deploy/',
];
if (seo_self_links()) $lines[] = "\nSitemap: " . site_url('sitemap.xml');
echo implode("\n", $lines) . "\n";

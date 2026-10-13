<?php
declare(strict_types=1);
require __DIR__ . '/includes/bootstrap.php';
if (!seo_self_links()) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    header('Retry-After: 86400');
    exit('Self link modu kapalı. Canlıya alırken yönetim panelinden (SEO Ayarları) açın.');
}
header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: public, max-age=900');
function xml_escape(string $v): string { return htmlspecialchars($v, ENT_XML1 | ENT_QUOTES, 'UTF-8'); }
function iso_date(?string $dt, int $fallback): string { $ts = $dt ? strtotime($dt . ' UTC') : false; return gmdate('Y-m-d', $ts ?: $fallback); }
function absolute_image(string $path): string { return preg_match('~^https?://~i', $path) ? $path : site_url(ltrim($path, '/')); }

// lastmod gerçek içerik tarihlerinden gelir (her istekte "bugün" yazmak arama motorunu yanıltır).
$now = time();
$settingsUpdated = null; $listingsUpdated = null; $rows = []; $imagesById = [];
try {
    if (installed()) {
        $settingsUpdated = (string)(db()->query('SELECT MAX(updated_at) FROM site_settings')->fetchColumn() ?: '');
        $listingsUpdated = (string)(db()->query("SELECT MAX(updated_at) FROM properties WHERE status='active'")->fetchColumn() ?: '');
        $rows = db()->query("SELECT id,slug,title,updated_at FROM properties WHERE status='active' AND meta_robots='index,follow' ORDER BY updated_at DESC")->fetchAll();
        foreach (db()->query("SELECT i.property_id,i.image_path,i.alt_text FROM property_images i JOIN properties p ON p.id=i.property_id WHERE p.status='active' ORDER BY i.property_id,i.is_cover DESC,i.sort_order,i.id")->fetchAll() as $img) {
            $pid = (int)$img['property_id'];
            if (count($imagesById[$pid] ?? []) < 10) $imagesById[$pid][] = $img;
        }
    }
} catch (Throwable $e) { error_log('[Emlak54 sitemap] ' . $e->getMessage()); }
$homeMod = max(iso_date($settingsUpdated, $now), iso_date($listingsUpdated, $now));
$urls = [
    ['loc'=>site_url(), 'lastmod'=>$homeMod, 'images'=>[]],
    ['loc'=>site_url('hakkimizda.php'), 'lastmod'=>iso_date($settingsUpdated, $now), 'images'=>[]],
    ['loc'=>site_url('iletisim.php'), 'lastmod'=>iso_date($settingsUpdated, $now), 'images'=>[]],
];
foreach ($rows as $row) {
    $imgs = [];
    foreach ($imagesById[(int)$row['id']] ?? [] as $img) $imgs[] = ['loc'=>absolute_image((string)$img['image_path']), 'title'=>(string)($img['alt_text'] ?: $row['title'])];
    $urls[] = ['loc'=>site_url('ilan/' . rawurlencode((string)$row['slug']) . '/'), 'lastmod'=>iso_date((string)$row['updated_at'], $now), 'images'=>$imgs];
}
echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' . "\n";
foreach ($urls as $url) {
    echo '  <url><loc>' . xml_escape($url['loc']) . '</loc><lastmod>' . xml_escape($url['lastmod']) . '</lastmod>';
    foreach ($url['images'] as $img) echo '<image:image><image:loc>' . xml_escape($img['loc']) . '</image:loc></image:image>';
    echo "</url>\n";
}
echo "</urlset>\n";

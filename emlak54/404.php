<?php
declare(strict_types=1);
require __DIR__ . '/includes/bootstrap.php';
if (!installed()) { http_response_code(404); header('Content-Type: text/plain; charset=utf-8'); exit('Sayfa bulunamadı.'); }
echo render_not_found_page();

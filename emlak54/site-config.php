<?php
declare(strict_types=1);
require __DIR__ . '/includes/bootstrap.php';
header('Content-Type: application/javascript; charset=utf-8');
header('Cache-Control: no-cache, must-revalidate');
header('X-Robots-Tag: noindex');
$cfg=['whatsappPhone'=>whatsapp_digits(),'displayPhone'=>setting('phone_display','+90 555 000 00 54'),'email'=>setting('email','bilgi@example.com')];
?>window.EMLAK54_CONFIG = <?=json_for_script($cfg)?>;
(() => {
  // Telefon/e-posta bağlantıları sunucuda doğru üretilir; burada yalnızca WhatsApp butonlarına hazır mesaj eklenir.
  const config = window.EMLAK54_CONFIG; if (!config) return;
  const wa = String(config.whatsappPhone || '').replace(/\D/g, '');
  if (wa.length < 10) return;
  document.querySelectorAll('[data-whatsapp-contact]').forEach(a => {
    const msg = a.dataset.whatsappMessage || 'Merhaba, bilgi almak istiyorum.';
    a.href = `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
  });
})();

<?php
declare(strict_types=1);
require __DIR__ . '/includes/bootstrap.php';
if (!installed()) { header('Location: install.php'); exit; }
record_page_view('page','about');
$html=render_page_template('about');
$canonical=e(site_url('hakkimizda.php'));
$html=preg_replace_callback('~<link\\b[^>]*rel="canonical"[^>]*>~i',static fn($m)=>preg_replace('~href="[^"]*"~i','href="'.$canonical.'"',$m[0],1)??$m[0],$html,1)??$html;
$html=preg_replace_callback('~<meta\\b[^>]*property="og:url"[^>]*>~i',static fn($m)=>preg_replace('~content="[^"]*"~i','content="'.$canonical.'"',$m[0],1)??$m[0],$html,1)??$html;
echo $html;

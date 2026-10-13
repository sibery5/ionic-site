<?php
declare(strict_types=1);
require __DIR__ . '/includes/bootstrap.php';
if (!installed()) { header('Location: install.php'); exit; }
$slug = trim((string)($_GET['slug'] ?? ''));
if ($slug === '') {
    // Rewrite kapalıysa / MultiViews PATH_INFO üretiyorsa REQUEST_URI'den yakala.
    $reqPath = parse_url((string)($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH) ?: '';
    if (preg_match('~/ilan/([a-z0-9-]{1,190})/?~', $reqPath, $m)) $slug = $m[1];
    elseif (!empty($_SERVER['PATH_INFO']) && preg_match('~/([a-z0-9-]{1,190})/?~', (string)$_SERVER['PATH_INFO'], $m)) $slug = $m[1];
}
if ($slug !== '' && !preg_match('/^[a-z0-9-]{1,190}$/', $slug)) $slug = '';
$p = $slug !== '' ? find_property_by_slug($slug, true) : null;
if (!$p) {
    echo render_not_found_page('Bu ilan artık yayında değil.', 'İlan kaldırılmış, satılmış/kiralanmış ya da adresi değişmiş olabilir. Yayındaki diğer ilanlara göz atabilirsiniz.');
    exit;
}
record_page_view('property', (string)$p['slug'], (int)$p['id']);

function detail_substr(string $text, int $length): string { return function_exists('mb_substr') ? mb_substr($text,0,$length,'UTF-8') : substr($text,0,$length); }

$siteName = trim(setting('brand_name','Emlak 54')) ?: 'Emlak 54';
$canonical = site_url('ilan/'.$p['slug'].'/');
$seoSelfLinks = seo_self_links();
$title = trim((string)($p['seo_title'] ?? '')) ?: ((string)$p['title'].' | '.(string)$p['deal'].' '.(string)$p['kind'].' · '.(string)$p['district'].' · '.$siteName);
$plainDescription = trim(preg_replace('/\s+/u',' ',(string)$p['description']) ?? (string)$p['description']);
$description = trim((string)($p['seo_description'] ?? '')) ?: detail_substr($plainDescription,155);
$metaRobots = in_array((string)($p['meta_robots'] ?? 'index,follow'),['index,follow','noindex,follow'],true) ? (string)$p['meta_robots'] : 'index,follow';

$images = [];
foreach ((array)($p['image_rows'] ?? []) as $imageRow) {
    $path = (string)($imageRow['image_path'] ?? '');
    if ($path === '') continue;
    $images[] = ['src'=>public_image_url($path),'alt'=>trim((string)($imageRow['alt_text'] ?? '')) ?: ($p['title'].' fotoğrafı')];
}
$hasPhotos = (bool)$images;
if (!$images) $images[] = ['src'=>app_base_url().'assets/logo.svg','alt'=>$p['title'].' — '.$siteName];
$imageUrls = array_column($images,'src');
$cover = $images[0]['src'];
$fallbackImg = local_page_url('assets/logo.svg');

$locationParts = array_values(array_filter([(string)$p['neighborhood'],(string)$p['district'],(string)$p['city']]));
$location = implode(', ', $locationParts);
$isRent = (string)$p['deal'] === 'Kiralık';
$priceDisplay = format_try((float)$p['price']);
$createdTs = strtotime((string)($p['created_at'] ?? '') . ' UTC') ?: time();
$createdDisplay = class_exists('IntlDateFormatter') ? (string)(new IntlDateFormatter('tr_TR', IntlDateFormatter::LONG, IntlDateFormatter::NONE, 'Europe/Istanbul'))->format($createdTs) : date('d.m.Y', $createdTs);
$features = array_values(array_filter(array_map('trim',(array)$p['features'])));
$roomsLabel = rooms_label((string)$p['rooms']);
$isLand = (string)$p['category'] === 'Arsa';

$related = [];
try {
    $relStmt = db()->prepare("SELECT p.id,p.slug,p.title,p.deal,p.kind,p.price,p.district,p.area,p.rooms,(SELECT i.image_path FROM property_images i WHERE i.property_id=p.id ORDER BY i.is_cover DESC,i.sort_order ASC,i.id ASC LIMIT 1) AS cover FROM properties p WHERE p.status='active' AND p.id<>? ORDER BY (p.district=?) DESC,(p.category=?) DESC,p.created_at DESC,p.id DESC LIMIT 6");
    $relStmt->execute([(int)$p['id'], (string)$p['district'], (string)$p['category']]);
    $related = $relStmt->fetchAll();
} catch (Throwable) { $related = []; }
$relatedSameDistrict = $related && (string)($related[0]['district'] ?? '') === (string)$p['district'];

$notSet = 'Belirtilmemiş';
$overview = [
    ['tag','İlan türü',(string)$p['deal']],
    ['building','Gayrimenkul',(string)$p['kind']],
    ['area','Net / brüt alan',((int)$p['area']).' m²'],
];
if (!$isLand) {
    $overview[] = ['bed','Oda sayısı',$roomsLabel ?: $notSet];
    $overview[] = ['bath','Banyo',(string)((int)$p['baths'] ?: $notSet)];
    $overview[] = ['calendar','Yapım yılı',(string)((int)$p['year'] ?: $notSet)];
} else {
    $overview[] = ['layers','Kategori',(string)$p['category']];
    $overview[] = ['pin','İlçe',(string)($p['district'] ?: $notSet)];
    $overview[] = ['calendar','İlan tarihi',$createdDisplay];
}
$details = ['İlan no' => '#'.(int)$p['id'], 'İlan tarihi' => $createdDisplay, 'Kategori' => (string)$p['category']];
if (!$isLand) {
    $details += [
        'Kat bilgisi' => trim((string)($p['floor_info'] ?? '')) ?: $notSet,
        'Bina yaşı' => trim((string)($p['building_age'] ?? '')) ?: $notSet,
        'Isıtma' => trim((string)($p['heating'] ?? '')) ?: $notSet,
        'Mobilya durumu' => ($p['furnished'] === null ? $notSet : (!empty($p['furnished']) ? 'Eşyalı' : 'Eşyasız')),
    ];
}
$details['Konum'] = (string)($p['address'] ?: $location);

$facts = [];
if ((int)$p['area'] > 0) $facts[] = ['area', ((int)$p['area']).' m²'];
if (!$isLand && $roomsLabel !== '') $facts[] = ['bed', $roomsLabel];
if (!$isLand && (int)$p['baths'] > 0) $facts[] = ['bath', ((int)$p['baths']).' banyo'];
if (!$isLand && (int)$p['year'] > 0) $facts[] = ['calendar', (string)(int)$p['year']];
$facts[] = ['building', (string)$p['kind']];

// Harita: gizlilik için açık sokak adresi değil, mahalle/ilçe düzeyinde konum kullanılır.
$hasGeo = is_numeric($p['latitude'] ?? null) && is_numeric($p['longitude'] ?? null) && (float)$p['latitude'] != 0.0;
$mapQuery = $hasGeo ? ((float)$p['latitude'].','.(float)$p['longitude']) : ($location !== '' ? $location : 'Sakarya, Türkiye');
$mapEmbed = 'https://maps.google.com/maps?q='.rawurlencode($mapQuery).'&t=&z='.($hasGeo ? 15 : 14).'&ie=UTF8&iwloc=&output=embed';
$mapLink = 'https://www.google.com/maps/search/?api=1&query='.rawurlencode($mapQuery);

// Yapılandırılmış veri: RealEstateListing (WebPage) → Offer → konut/arsa/iş yeri.
$kind = function_exists('mb_strtolower') ? mb_strtolower((string)$p['kind'], 'UTF-8') : strtolower((string)$p['kind']);
$itemType = match (true) {
    $isLand => 'Place',
    (string)$p['category'] === 'İş yeri' => 'Place',
    str_contains($kind, 'daire') || str_contains($kind, 'rezidans') || str_contains($kind, 'dubleks') || str_contains($kind, 'bahçe kat') => 'Apartment',
    str_contains($kind, 'villa') || str_contains($kind, 'müstakil') => 'SingleFamilyResidence',
    default => 'Accommodation',
};
$offered = ['@type'=>$itemType,'name'=>(string)$p['title'],
    'address'=>['@type'=>'PostalAddress','addressLocality'=>(string)$p['district'],'addressRegion'=>(string)$p['city'],'addressCountry'=>'TR']];
if ($itemType !== 'Place') {
    $offered['floorSize'] = ['@type'=>'QuantitativeValue','value'=>(int)$p['area'],'unitCode'=>'MTK'];
    if ($roomsLabel !== '' && preg_match('/^(\d+)/', $roomsLabel, $rm)) $offered['numberOfRooms'] = (int)$rm[1];
    if ((int)$p['baths'] > 0) $offered['numberOfBathroomsTotal'] = (int)$p['baths'];
    if ((int)$p['year'] > 0) $offered['yearBuilt'] = (int)$p['year'];
}
if ($hasGeo) $offered['geo'] = ['@type'=>'GeoCoordinates','latitude'=>(float)$p['latitude'],'longitude'=>(float)$p['longitude']];
$breadcrumb = ['@type'=>'BreadcrumbList','itemListElement'=>[
    ['@type'=>'ListItem','position'=>1,'name'=>'Anasayfa','item'=>site_url()],
    ['@type'=>'ListItem','position'=>2,'name'=>'İlanlar','item'=>site_url('#ilanlar')],
    ['@type'=>'ListItem','position'=>3,'name'=>(string)$p['title'],'item'=>$canonical],
]];
$schema = [
    '@context'=>'https://schema.org','@type'=>'RealEstateListing','name'=>(string)$p['title'],'description'=>$description,'url'=>$canonical,
    'inLanguage'=>'tr-TR','datePosted'=>gmdate('c',$createdTs),'image'=>$hasPhotos ? $imageUrls : [$cover],
    'breadcrumb'=>$breadcrumb,
    'offers'=>['@type'=>'Offer','url'=>$canonical,'price'=>(float)$p['price'],'priceCurrency'=>'TRY','availability'=>'https://schema.org/InStock',
        'businessFunction'=>$isRent ? 'http://purl.org/goodrelations/v1#LeaseOut' : 'http://purl.org/goodrelations/v1#Sell','itemOffered'=>$offered],
];
if (!empty($p['updated_at'])) $schema['dateModified'] = gmdate('c', strtotime((string)$p['updated_at'].' UTC') ?: $createdTs);

$wa = whatsapp_digits();
$phone = phone_digits();
$phoneDisplay = setting('phone_display','+90 555 000 00 54');
$email = setting('email','');
$mailHref = filter_var($email, FILTER_VALIDATE_EMAIL) ? 'mailto:'.$email.'?subject='.rawurlencode('İlan #'.(int)$p['id'].' — '.$p['title']) : '';
$districtLink = local_page_url('?konum='.rawurlencode((string)$p['district']).'#ilanlar');
?><!doctype html>
<html lang="tr" data-theme="<?=e(site_theme())?>"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title><?=e($title)?></title><meta name="description" content="<?=e($description)?>"><meta name="robots" content="<?=e($metaRobots)?>,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
<?php if($seoSelfLinks):?><link rel="canonical" href="<?=e($canonical)?>"><?php endif;?>
<meta property="og:type" content="website"><meta property="og:locale" content="tr_TR"><meta property="og:site_name" content="<?=e($siteName)?>"><meta property="og:title" content="<?=e($title)?>"><meta property="og:description" content="<?=e($description)?>"><?php if($seoSelfLinks):?><meta property="og:url" content="<?=e($canonical)?>"><?php endif;?><meta property="og:image" content="<?=e($cover)?>"><meta property="og:image:alt" content="<?=e($images[0]['alt'])?>"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="<?=e($title)?>"><meta name="twitter:description" content="<?=e($description)?>"><meta name="twitter:image" content="<?=e($cover)?>">
<?php if($hasPhotos):?><link rel="preload" as="image" href="<?=e($cover)?>" fetchpriority="high"><?php endif;?>
<script type="application/ld+json"><?=json_for_script($schema)?></script>
<?=render_common_template('{{COMMON_HEAD}}</head>', 'listing')?>
<body class="detail-page" data-page="listing">
<?=render_common_template(load_partial('header'), 'listing')?>
<main id="main-content"><div id="detailMain"><div class="container">
<nav class="breadcrumb" aria-label="İçerik yolu"><a href="<?=e(local_page_url())?>">Anasayfa</a><?=ui_icon('arrow',13)?><a href="<?=e(local_page_url('#ilanlar'))?>">İlanlar</a><?php if(trim((string)$p['district'])!==''):?><?=ui_icon('arrow',13)?><a href="<?=e($districtLink)?>"><?=e($p['district'])?></a><?php endif;?><?=ui_icon('arrow',13)?><span aria-current="page"><?=e($p['title'])?></span></nav>
<div class="detail-head"><div class="detail-title-wrap"><div class="card-badges detail-badges"><span class="badge deal<?=$isRent?' rent':''?>"><?=e($p['deal'])?></span><?php if(!empty($p['badge'])):?><span class="badge highlight"><?=e($p['badge'])?></span><?php elseif(!empty($p['isNew'])):?><span class="badge highlight">Öne Çıkan</span><?php endif;?><span class="badge badge-soft">İlan no #<?=(int)$p['id']?></span></div><h1 class="detail-title"><?=e($p['title'])?></h1><div class="detail-address"><?=ui_icon('pin',16)?> <?=e($location)?></div><ul class="detail-facts" aria-label="Öne çıkan bilgiler"><?php foreach($facts as [$icon,$label]):?><li><?=ui_icon($icon,16)?><span><?=e($label)?></span></li><?php endforeach;?></ul></div><div class="detail-price-block"><div><div class="detail-price"><?=e($priceDisplay)?><?php if($isRent):?><small> / ay</small><?php endif;?></div><div class="detail-price-note"><?=e($isRent?'Aylık kira bedeli':'İlan fiyatı')?> · Yayında</div></div><div class="detail-actions"><button class="btn btn-outline" id="shareListing" type="button"><?=ui_icon('share',15)?> <span>Paylaş</span></button><button class="btn btn-outline" id="saveListing" type="button" aria-pressed="false"><?=ui_icon('heart',15)?> <span>Kaydet</span></button></div></div></div>
<div class="gallery-grid gallery-slider" id="propertyGallery"><div class="gallery-item gallery-main" role="group" aria-roledescription="galeri" aria-label="İlan fotoğrafları"><img src="<?=e($images[0]['src'])?>" onerror="this.onerror=null;this.src='<?=e($fallbackImg)?>'" alt="<?=e($images[0]['alt'])?>" width="1200" height="800" loading="eager" fetchpriority="high" decoding="async"><button class="gallery-open" type="button" aria-label="Fotoğrafı tam ekran aç" title="Fotoğrafı büyüt"></button><span class="gallery-view-all"><?=ui_icon('expand',15)?> Tüm fotoğraflar (<?=count($images)?>)</span><?php if(count($images)>1):?><div class="gallery-slider-controls" aria-label="Fotoğraflar arasında gezin"><button type="button" class="gallery-prev" aria-label="Önceki fotoğraf" title="Önceki fotoğraf"><?=ui_icon('arrow',22)?></button><button type="button" class="gallery-next" aria-label="Sonraki fotoğraf" title="Sonraki fotoğraf"><?=ui_icon('arrow',22)?></button></div><?php endif;?><span class="gallery-counter" aria-live="polite">1 / <?=count($images)?></span></div><?php if(count($images)>1):?><div class="gallery-thumbnails" aria-label="Fotoğraf küçük resimleri"><?php foreach($images as $i=>$im):?><button type="button" class="gallery-thumbnail" data-gallery-index="<?=$i?>" aria-label="<?=$i+1?>. fotoğraf" aria-current="<?=$i===0?'true':'false'?>"><img src="<?=e($im['src'])?>" onerror="this.onerror=null;this.src='<?=e($fallbackImg)?>'" alt="" width="180" height="120" loading="lazy" decoding="async"></button><?php endforeach;?></div><?php endif;?></div>
<section class="detail-section detail-description-panel"><div class="description-header"><span class="description-icon" aria-hidden="true"><?=ui_icon('layers',18)?></span><div class="description-heading-copy"><span class="description-kicker"><?=e(function_exists('mb_strtoupper') ? mb_strtoupper($siteName,'UTF-8') : strtoupper($siteName))?> · İLAN DETAYLARI</span><h2>İlan Açıklaması</h2></div><span class="description-type-chip"><?=e($p['deal'].' '.$p['kind'])?></span></div><p class="detail-description"><?=nl2br(e($p['description']))?></p><div class="description-facts"><span class="description-fact"><?=ui_icon('pin',16)?> <?=e($location)?></span><span class="description-fact"><?=ui_icon('area',16)?> <?=(int)$p['area']?> m²</span><?php if(!$isLand && $roomsLabel!==''):?><span class="description-fact"><?=ui_icon('bed',16)?> <?=e($roomsLabel)?></span><?php endif;?><span class="description-fact"><?=ui_icon('calendar',16)?> <?=e($createdDisplay)?></span></div></section>
<div class="detail-layout"><div><section class="detail-section"><h2>İlan özellikleri</h2><div class="overview-grid"><?php foreach($overview as [$icon,$label,$value]):?><div class="overview-item"><span class="overview-ico"><?=ui_icon($icon,17)?></span><small><?=e($label)?></small><strong><?=e($value)?></strong></div><?php endforeach;?></div><div class="spec-table-wrap"><table class="spec-table"><caption class="sr-only">İlan ayrıntıları</caption><tbody><?php foreach($details as $label=>$value):?><tr><th scope="row"><?=e($label)?></th><td><?=e($value)?></td></tr><?php endforeach;?></tbody></table></div><?php if($features):?><h3 class="feature-section-heading">Öne çıkan özellikler</h3><ul class="feature-grid"><?php foreach($features as $feature):?><li class="feature-item"><span aria-hidden="true">✓</span><?=e($feature)?></li><?php endforeach;?></ul><?php endif;?></section>
<section class="detail-section detail-map-section"><div class="detail-map-head"><div><h2>Konum</h2><p><?=ui_icon('pin',15)?> <?=e($location ?: 'Sakarya')?></p></div><a class="btn btn-outline btn-sm" href="<?=e($mapLink)?>" target="_blank" rel="noopener noreferrer"><?=ui_icon('route',15)?> Haritada aç</a></div><div class="map-lazy" data-map-src="<?=e($mapEmbed)?>"><div class="map-lazy-inner"><span class="map-lazy-ico"><?=ui_icon('map',24)?></span><strong>Bölge haritası</strong><small>Harita, Google Haritalar’dan yalnızca siz istediğinizde yüklenir.</small><button class="btn btn-primary btn-sm map-load" type="button"><?=ui_icon('eye',15)?> Haritayı göster</button></div></div><p class="map-note">Konum mahalle/ilçe düzeyinde gösterilir; kesin adres bilgisi için bizimle iletişime geçin.</p></section></div>
<aside class="agent-card" aria-label="İlan danışmanı ile iletişim"><div class="agent-brand"><span class="brand-mark"><?=brand_mark_markup()?></span><span><strong><?=e($siteName)?></strong><small>Gayrimenkul portföyü</small></span></div><div class="agent-price"><span><?=e($isRent?'Aylık kira':'Fiyat')?></span><strong><?=e($priceDisplay)?></strong></div><p>Bu ilanla ilgili ayrıntılı bilgi almak ve görüntüleme planlamak için iletişime geçin.</p><a class="btn btn-primary btn-full agent-call" href="tel:+<?=e($phone)?>"><?=ui_icon('phone',17)?> <span>Telefonla ara<small><?=e($phoneDisplay)?></small></span></a><a class="btn btn-whatsapp btn-full" data-listing-wa="" href="https://wa.me/<?=e($wa)?>" aria-label="WhatsApp ile <?=e($p['title'])?> hakkında bilgi al" target="_blank" rel="noopener noreferrer"><span class="whatsapp-button-icon"><?=ui_icon('whatsapp',20)?></span><span class="whatsapp-button-copy"><strong>Bu İlan Hakkında Bilgi Al</strong><small>WhatsApp mesajın ilan detaylarıyla hazır</small></span><?=ui_icon('arrow',17)?></a><?php if($mailHref!==''):?><a class="agent-mail" href="<?=e($mailHref)?>"><?=ui_icon('mail',15)?> E-posta ile sor</a><?php endif;?><p class="whatsapp-helper">Mesajda ilan adı, fiyatı, konumu ve ilan bağlantısı otomatik yer alır.</p><div class="agent-trust"><span><?=ui_icon('calendar',15)?> Yayın tarihi: <?=e($createdDisplay)?></span><span><?=ui_icon('clock',15)?> <?=e(setting('office_hours','Hafta içi 09.00 – 18.00'))?></span></div></aside></div>
<?php if(!empty($related)):?><section class="related-section" aria-labelledby="relatedTitle"><div class="related-head"><span class="kicker-ico"><?=ui_icon('pin',15)?></span><div class="related-head-copy"><span class="section-kicker"><?=$relatedSameDistrict?'Aynı bölgede':'Benzer ilanlar'?></span><h2 class="section-title" id="relatedTitle">Önerilen İlanlar</h2></div></div><div class="related-grid"><?php foreach($related as $rel): $relHref = local_page_url('ilan/'.$rel['slug'].'/'); $relRooms = rooms_label((string)$rel['rooms']);?><article class="rel-card"><a class="rel-thumb" href="<?=e($relHref)?>" aria-label="<?=e($rel['title'])?> detayını aç" tabindex="-1"><img src="<?=e(public_image_url((string)($rel['cover'] ?: 'assets/logo.svg')))?>" onerror="this.onerror=null;this.src='<?=e($fallbackImg)?>'" alt="<?=e($rel['title'])?> ilan fotoğrafı" width="300" height="220" loading="lazy" decoding="async"><span class="badge deal <?=e($rel['deal']==='Kiralık'?'rent':'')?>"><?=e($rel['deal'])?></span></a><div class="rel-body"><h3 class="rel-title"><a href="<?=e($relHref)?>"><?=e($rel['title'])?></a></h3><div class="rel-meta"><?=ui_icon('pin',12)?> <?=e($rel['district'])?> · <?=e($rel['kind'])?> · <?=(int)$rel['area']?> m²<?php if($relRooms!==''):?> · <?=e($relRooms)?><?php endif;?></div><div class="rel-bottom"><span class="rel-price"><?=e(format_try((float)$rel['price']))?><?php if($rel['deal']==='Kiralık'):?><small> / ay</small><?php endif;?></span><a class="rel-arrow" href="<?=e($relHref)?>" aria-label="<?=e($rel['title'])?> detayları"><?=ui_icon('arrow',16)?></a></div></div></article><?php endforeach;?></div></section><?php endif;?>
</div></div></main>
<div class="detail-cta-bar" id="detailCtaBar" aria-label="Hızlı iletişim"><div class="cta-price"><strong><?=e($priceDisplay)?><?php if($isRent):?><small> / ay</small><?php endif;?></strong><span><?=e($p['deal'].' · '.$p['kind'])?></span></div><a class="btn btn-primary" href="tel:+<?=e($phone)?>" aria-label="Telefonla ara"><?=ui_icon('phone',17)?> Ara</a><a class="btn btn-wa-solid" data-listing-wa="" href="https://wa.me/<?=e($wa)?>" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp ile yaz"><?=ui_icon('whatsapp',18)?> WhatsApp</a></div>
<div class="lightbox" id="lightbox" role="dialog" aria-label="Fotoğraf galerisi" aria-modal="true" aria-hidden="true"><button type="button" class="lightbox-close" id="lightboxClose" aria-label="Galeriyi kapat"><?=ui_icon('x',24)?></button><?php if(count($images)>1):?><button type="button" class="lightbox-prev" id="lightboxPrev" aria-label="Önceki fotoğraf"><?=ui_icon('arrow',22)?></button><?php endif;?><div class="lightbox-image-wrap"><img id="lightboxImage" class="lightbox-image" src="<?=e($cover)?>" alt="<?=e($p['title'])?>"><div id="lightboxCounter" class="lightbox-counter">1 / <?=count($images)?></div></div><?php if(count($images)>1):?><button type="button" class="lightbox-next" id="lightboxNext" aria-label="Sonraki fotoğraf"><?=ui_icon('arrow',22)?></button><?php endif;?></div>
<?=render_common_template(load_partial('footer'), 'listing')?>
<script>window.EMLAK54_CURRENT_LISTING=<?=json_for_script(['id'=>(int)$p['id'],'slug'=>$p['slug'],'title'=>$p['title'],'deal'=>$p['deal'],'category'=>$p['category'],'kind'=>$p['kind'],'price'=>(float)$p['price'],'district'=>$p['district'],'neighborhood'=>$p['neighborhood'],'city'=>$p['city'],'area'=>(int)$p['area'],'rooms'=>$p['rooms'],'baths'=>(int)$p['baths'],'features'=>$features,'images'=>$imageUrls,'url'=>$seoSelfLinks ? $canonical : ''])?>;</script>
<script defer src="<?=e(asset_url('site-config.php'))?>"></script><script defer src="<?=e(asset_vurl('detail.js'))?>"></script><script defer src="<?=e(asset_vurl('page-transitions.js'))?>"></script>
</body></html>

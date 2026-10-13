<?php
declare(strict_types=1);
require __DIR__ . '/includes/bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
require_admin(true);
$pdo = db();
$action = (string)($_GET['action'] ?? $_POST['action'] ?? '');
$mutating = in_array($action, ['save_property','delete_property','toggle_status','delete_image','save_settings','manual_ban','unban_ip','logout','change_password','save_property_types','change_username','save_neighborhood','indexnow_ping'], true);
if ($mutating && (string)($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    header('Allow: POST');
    json_response(['ok' => false, 'message' => 'Bu işlem yalnızca POST isteğiyle yapılabilir.'], 405);
}
if ($mutating) verify_csrf();

function api_property_for_admin(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare('SELECT * FROM properties WHERE id=? LIMIT 1'); $stmt->execute([$id]); $p=$stmt->fetch();
    if (!$p) return null;
    $im=$pdo->prepare('SELECT id,image_path,alt_text,sort_order,is_cover FROM property_images WHERE property_id=? ORDER BY is_cover DESC,sort_order ASC,id ASC'); $im->execute([$id]);
    $p['images']=$im->fetchAll(); $p['features']=json_decode((string)($p['features_json'] ?? '[]'),true) ?: [];
    return $p;
}
function api_properties_for_admin(PDO $pdo): array {
    $sql = "SELECT p.*,(SELECT image_path FROM property_images i WHERE i.property_id=p.id ORDER BY i.is_cover DESC,i.sort_order ASC,i.id ASC LIMIT 1) AS cover_image,(SELECT COUNT(*) FROM property_images i WHERE i.property_id=p.id) AS image_count FROM properties p ORDER BY p.created_at DESC,p.id DESC";
    return $pdo->query($sql)->fetchAll();
}
function api_period(string $period): array {
    return match ($period) {
        'month' => ['30 DAY', "DATE_FORMAT(created_at, '%Y-%m-%d')", 30],
        'year' => ['12 MONTH', "DATE_FORMAT(created_at, '%Y-%m')", 12],
        default => ['7 DAY', "DATE_FORMAT(created_at, '%Y-%m-%d')", 7],
    };
}
function api_series(PDO $pdo, string $table, string $period): array {
    [$interval,$group,$count] = api_period($period);
    if ($table === 'security_events') {
        $sql = "SELECT {$group} AS label, COUNT(*) AS total FROM security_events WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL {$interval}) GROUP BY label ORDER BY label";
    } else {
        $sql = "SELECT {$group} AS label, COUNT(*) AS total FROM page_views WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL {$interval}) GROUP BY label ORDER BY label";
    }
    $rows=$pdo->query($sql)->fetchAll(); $lookup=[];
    foreach($rows as $r) $lookup[(string)$r['label']]=(int)$r['total'];
    $labels=[];$data=[];
    $now=new DateTimeImmutable('now',new DateTimeZone('UTC'));
    if ($period==='year') {
        $cursor=$now->modify('first day of this month')->modify('-11 months');
        for($i=0;$i<12;$i++){$key=$cursor->format('Y-m');$labels[]=$key;$data[]=$lookup[$key]??0;$cursor=$cursor->modify('+1 month');}
    } else {
        $days=$period==='month'?30:7;$cursor=$now->setTime(0,0)->modify('-'.($days-1).' days');
        for($i=0;$i<$days;$i++){$key=$cursor->format('Y-m-d');$labels[]=$key;$data[]=$lookup[$key]??0;$cursor=$cursor->modify('+1 day');}
    }
    return ['labels'=>$labels,'data'=>$data];
}
function api_seo_report(PDO $pdo): array {
    $settings=site_settings(true); $issues=[]; $checked=0; $scorePoints=0; $maxPoints=0;
    $checks=[
      ['key'=>'seo_home_title','label'=>'Anasayfa SEO başlığı','test'=>fn($v)=>mb_len($v)>=30 && mb_len($v)<=65,'weight'=>8,'advice'=>'Başlığı yaklaşık 30–65 karakter arasında, markayı ve ana hizmeti anlatacak şekilde yazın.'],
      ['key'=>'seo_home_description','label'=>'Anasayfa meta açıklaması','test'=>fn($v)=>mb_len($v)>=100 && mb_len($v)<=180,'weight'=>8,'advice'=>'Özgün ve kullanıcıya fayda anlatan yaklaşık 100–180 karakterlik açıklama yazın.'],
      ['key'=>'site_url','label'=>'Gerçek canonical alan adı','test'=>fn($v)=>preg_match('~^https://~i',$v)===1 && !str_contains($v,'example.com') && !str_contains($v,'localhost'),'weight'=>10,'advice'=>'Canlı HTTPS alan adını girin; örnek alan adlarıyla yayın yapmayın.'],
      ['key'=>'whatsapp_number','label'=>'WhatsApp numarası','test'=>fn($v)=>strlen(preg_replace('/\D/','',$v))>=10 && preg_replace('/\D/','',$v)!=='905550000054','weight'=>3,'advice'=>'Ülke kodu dahil doğru WhatsApp numarasını girin.'],
      ['key'=>'email','label'=>'İletişim e-postası','test'=>fn($v)=>filter_var($v,FILTER_VALIDATE_EMAIL)!==false && !str_ends_with(strtolower($v),'.example'),'weight'=>3,'advice'=>'Gerçek ve erişilebilir e-posta adresini girin.'],
      ['key'=>'seo_about_title','label'=>'Hakkımızda SEO başlığı','test'=>fn($v)=>mb_len($v)>=25 && mb_len($v)<=65,'weight'=>5,'advice'=>'Hakkımızda başlığını özgün ve yaklaşık 25–65 karakter tutun.'],
      ['key'=>'seo_about_description','label'=>'Hakkımızda meta açıklaması','test'=>fn($v)=>mb_len($v)>=70 && mb_len($v)<=180,'weight'=>5,'advice'=>'Hakkımızda sayfasını doğru özetleyen 70–180 karakterlik açıklama yazın.'],
      ['key'=>'seo_contact_title','label'=>'İletişim SEO başlığı','test'=>fn($v)=>mb_len($v)>=25 && mb_len($v)<=65,'weight'=>4,'advice'=>'İletişim başlığını marka ve sayfa niyetiyle kısa tutun.'],
      ['key'=>'seo_contact_description','label'=>'İletişim meta açıklaması','test'=>fn($v)=>mb_len($v)>=70 && mb_len($v)<=180,'weight'=>4,'advice'=>'İletişim sayfasını 70–180 karakterde açıklayın.'],
      ['key'=>'home_hero_title','label'=>'Anasayfa H1','test'=>fn($v)=>mb_len($v)>=20 && mb_len($v)<=110,'weight'=>5,'advice'=>'Sayfanın ana hizmetini doğal dille anlatan tek bir H1 kullanın.'],
      ['key'=>'home_seo_p1','label'=>'Anasayfa açıklayıcı içerik','test'=>fn($v)=>mb_len($v)>=180,'weight'=>4,'advice'=>'Kopya/anahtar kelime yığını yerine ziyaretçiye gerçek fayda sağlayan açıklayıcı metin ekleyin.'],
      ['key'=>'home_seo_p2','label'=>'Yerel hizmet kapsamı içeriği','test'=>fn($v)=>mb_len($v)>=180,'weight'=>4,'advice'=>'Hizmet verilen bölgeleri doğal ve doğru biçimde açıklayın.'],
      ['key'=>'indexnow_key','label'=>'IndexNow otomatik bildirimi','test'=>fn($v)=>setting('indexnow_enabled','0')==='1'&&preg_match('~^[a-f0-9]{32}$~',trim($v))===1,'weight'=>2,'advice'=>'SEO Ayarları > IndexNow bölümünden anahtarı üretip otomatik bildirimi açın.'],
      ['key'=>'google_site_verification','label'=>'Search Console doğrulaması','test'=>fn($v)=>preg_match('~^[A-Za-z0-9_-]{10,128}$~',trim($v))===1,'weight'=>6,'advice'=>'SEO Ayarları > Google Search Console alanına doğrulama kodunu yapıştırın.'],
    ];
    foreach($checks as $check){$checked++;$maxPoints+=$check['weight'];$v=(string)($settings[$check['key']]??'');$ok=($check['test'])($v);if($ok)$scorePoints+=$check['weight'];$issues[]=['group'=>'Site','label'=>$check['label'],'ok'=>$ok,'weight'=>$check['weight'],'detail'=>$ok?'Kontrol edildi':$check['advice']];}
    $props=$pdo->query("SELECT id,title,slug,description,seo_title,seo_description,status,(SELECT COUNT(*) FROM property_images i WHERE i.property_id=p.id) image_count FROM properties p WHERE status IN ('active','draft')")->fetchAll();
    $listingChecks=0;$listingGood=0;
    foreach($props as $p){ if(($p['status']??'')!=='active')continue; $listingChecks++;
      $checksP=[
        ['ok'=>trim((string)$p['seo_title'])!=='' && mb_len((string)$p['seo_title'])>=25 && mb_len((string)$p['seo_title'])<=70,'name'=>'Özgün ve uygun uzunlukta SEO başlığı'],
        ['ok'=>trim((string)$p['seo_description'])!=='' && mb_len((string)$p['seo_description'])>=70 && mb_len((string)$p['seo_description'])<=200,'name'=>'Meta açıklaması'],
        ['ok'=>mb_len((string)$p['description'])>=100,'name'=>'Yeterli ilan açıklaması'],
        ['ok'=>trim((string)$p['slug'])!=='' && preg_match('/^[a-z0-9-]+$/',(string)$p['slug'])===1,'name'=>'SEO dostu URL'],
        ['ok'=>(int)$p['image_count']>0,'name'=>'Fotoğraf mevcut'],
      ];
      foreach($checksP as $item){$maxPoints+=1;$checked++;if($item['ok']){$scorePoints++;$listingGood++;}else $issues[]=['group'=>'İlan: '.(string)$p['title'],'label'=>$item['name'],'ok'=>false,'weight'=>1,'detail'=>'İlan düzenleme ekranında eksik bilgiyi tamamlayın.'];}
    }
    try {
        $imgTotal=(int)$pdo->query("SELECT COUNT(*) FROM property_images i JOIN properties p ON p.id=i.property_id WHERE p.status='active'")->fetchColumn();
        $imgLegacy=(int)$pdo->query("SELECT COUNT(*) FROM property_images i JOIN properties p ON p.id=i.property_id WHERE p.status='active' AND i.image_path REGEXP '[a-f0-9]{32}\\.webp$'")->fetchColumn();
        $maxPoints+=4; $checked++;
        if($imgLegacy===0){$scorePoints+=4;$issues[]=['group'=>'Site','label'=>'SEO dosya adlı ilan fotoğrafları','ok'=>true,'weight'=>4,'detail'=>'Kontrol edildi'];}else{$issues[]=['group'=>'Site','label'=>'SEO dosya adlı ilan fotoğrafları','ok'=>false,'weight'=>4,'detail'=>$imgLegacy.'/'.$imgTotal.' fotoğraf eski tip isim taşıyor; yeni yüklemeler otomatik düzelir.'];}
    } catch(Throwable $imgEx) {}
    $score=$maxPoints>0?(int)round(($scorePoints/$maxPoints)*100):0;
    $summary=['score'=>$score,'checked'=>$checked,'pass'=>$scorePoints,'issues'=>count(array_filter($issues,fn($x)=>!$x['ok'])),'active_properties'=>count(array_filter($props,fn($p)=>$p['status']==='active')),'listing_check_rate'=>$listingChecks>0?(int)round($listingGood/($listingChecks*5)*100):0];
    return ['summary'=>$summary,'issues'=>$issues,'generated_at'=>gmdate('c')];
}
function mb_len(string $s): int { return function_exists('mb_strlen') ? mb_strlen($s,'UTF-8') : strlen($s); }

try {
    switch ($action) {
        case 'property_types': {
            $st=$pdo->prepare('SELECT setting_value FROM site_settings WHERE setting_key=? LIMIT 1');
            $st->execute(['property_types_json']); $raw=$st->fetchColumn();
            $types=is_string($raw)?json_decode($raw,true):null;
            if(!is_array($types)||!$types)$types=['Daire','Villa','Müstakil Ev','Rezidans','Arsa','Tarla','Ofis','Dükkan','İş Yeri','Depo','Bina'];
            json_response(['ok'=>true,'types'=>array_values(array_unique(array_filter($types,fn($v)=>is_string($v)&&trim($v)!=='')))]);
        }
        case 'save_property_types': {
            $raw=(string)($_POST['types_json']??'[]'); $types=json_decode($raw,true);
            if(!is_array($types)) json_response(['ok'=>false,'message'=>'Tip listesi geçerli değil.'],422);
            $types=array_values(array_unique(array_filter(array_map(fn($v)=>trim((string)$v),$types),fn($v)=>$v!=='')));
            if(count($types)<1||count($types)>80) json_response(['ok'=>false,'message'=>'En az 1, en fazla 80 tip tanımlayabilirsiniz.'],422);
            foreach($types as $v){if(mb_len_safe($v)>80)json_response(['ok'=>false,'message'=>'Her tip en fazla 80 karakter olabilir.'],422);}
            $st=$pdo->prepare('INSERT INTO site_settings(setting_key,setting_value) VALUES(?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)');
            $st->execute(['property_types_json',json_encode($types,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)]);
            log_admin_action('property_types_updated','settings',null,['count'=>count($types)]);
            json_response(['ok'=>true,'message'=>'Gayrimenkul tipleri güncellendi.','types'=>$types]);
        }
        case 'csrf': json_response(['ok'=>true,'csrf'=>csrf_token()]);
        case 'dashboard': {
            $period=(string)($_GET['period']??'week'); if(!in_array($period,['week','month','year'],true))$period='week';
            $views=(int)$pdo->query('SELECT COUNT(*) FROM page_views')->fetchColumn();
            $monthViews=(int)$pdo->query('SELECT COUNT(*) FROM page_views WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY)')->fetchColumn();
            $active=(int)$pdo->query("SELECT COUNT(*) FROM properties WHERE status='active'")->fetchColumn();
            $draft=(int)$pdo->query("SELECT COUNT(*) FROM properties WHERE status='draft'")->fetchColumn();
            $events=(int)$pdo->query("SELECT COUNT(*) FROM security_events WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY) AND severity IN ('high','critical')")->fetchColumn();
            $series=api_series($pdo,'page_views',$period);
            $top=$pdo->query("SELECT p.id,p.title,p.slug,p.price,p.deal,p.district,p.status,p.view_count,(SELECT image_path FROM property_images i WHERE i.property_id=p.id ORDER BY i.is_cover DESC,i.sort_order LIMIT 1) cover_image FROM properties p ORDER BY p.view_count DESC,p.created_at DESC LIMIT 5")->fetchAll();
            $site=rtrim(setting('site_url',''),'/');$mail=setting('email','');
            $launch=[
              ['ok'=>preg_match('~^https://~i',$site)===1 && !preg_match('~localhost|127\.0\.0\.1|example\.com~i',$site),'title'=>'Gerçek alan adını tanımla','detail'=>'Web sitesi ana adresi canlı HTTPS alan adı olmalı (canonical ve sitemap bunu kullanır).','view'=>'siteconfig'],
              ['ok'=>phone_digits()!=='905550000054' && whatsapp_digits()!=='905550000054','title'=>'Telefon ve WhatsApp numarası','detail'=>'Demo numara yerine işletmenin gerçek numaralarını gir.','view'=>'siteconfig'],
              ['ok'=>filter_var($mail,FILTER_VALIDATE_EMAIL)!==false && !preg_match('~@example\.|\.example$~i',$mail),'title'=>'İletişim e-postası','detail'=>'Gerçek ve erişilebilir bir e-posta adresi kullan.','view'=>'siteconfig'],
              ['ok'=>setting('seo_self_links','0')==='1','title'=>'Canonical (self link) modu','detail'=>'Canlıda açık olmalı; kapalıyken sitemap.xml yayınlanmaz.','view'=>'seosettings'],
              ['ok'=>gsc_verification_token()!=='','title'=>'Google Search Console doğrulaması','detail'=>'Search Console HTML etiketi doğrulama kodunu ekle.','view'=>'seosettings'],
              ['ok'=>setting('demo_notice','1')==='0','title'=>'Demo uyarısı kapalı','detail'=>'Gerçek ilanlarla yayına çıkınca demo uyarısını kapat.','view'=>'siteconfig'],
            ];
            json_response(['ok'=>true,'launch'=>$launch,'stats'=>['total_views'=>$views,'month_views'=>$monthViews,'active_properties'=>$active,'draft_properties'=>$draft,'security_events'=>$events,'total_properties'=>(int)$pdo->query('SELECT COUNT(*) FROM properties')->fetchColumn()],'series'=>$series,'top_properties'=>$top]);
        }
        case 'properties': json_response(['ok'=>true,'properties'=>api_properties_for_admin($pdo)]);
        case 'settings': json_response(['ok'=>true,'settings'=>site_settings(true)]);
        case 'property': {
            $id=(int)($_GET['id']??0);$p=api_property_for_admin($pdo,$id);
            if(!$p)json_response(['ok'=>false,'message'=>'İlan bulunamadı.'],404);
            json_response(['ok'=>true,'property'=>$p]);
        }
        case 'save_property': {
            if($_SERVER['REQUEST_METHOD']!=='POST')json_response(['ok'=>false,'message'=>'POST gerekli.'],405);
            $id=(int)($_POST['id']??0);$existing=$id?api_property_for_admin($pdo,$id):null;
            if($id && !$existing)json_response(['ok'=>false,'message'=>'Düzenlenecek ilan bulunamadı.'],404);
            $title=trim((string)($_POST['title']??''));$description=trim((string)($_POST['description']??''));
            $deal=(string)($_POST['deal']??'Satılık');$category=(string)($_POST['category']??'Konut');$kind=trim((string)($_POST['kind']??'Daire'));
            $status=(string)($_POST['status']??'active');$price=filter_var($_POST['price']??null,FILTER_VALIDATE_FLOAT);
            if(mb_len($title)<5||mb_len($title)>220)json_response(['ok'=>false,'message'=>'İlan başlığı 5–220 karakter arasında olmalı.'],422);
            if(!in_array($deal,['Satılık','Kiralık'],true))json_response(['ok'=>false,'message'=>'Satış/kiralama türü geçersiz.'],422);
            if(!in_array($category,['Konut','Arsa','İş yeri'],true))json_response(['ok'=>false,'message'=>'Gayrimenkul kategorisi geçersiz.'],422);
            if(!in_array($status,['active','draft','sold','rented'],true))json_response(['ok'=>false,'message'=>'İlan durumu geçersiz.'],422);
            if($price===false || $price<0 || $price>999999999999)json_response(['ok'=>false,'message'=>'Fiyat geçerli bir sayı olmalı.'],422);
            if(mb_len($description)<25 || mb_len($description)>10000)json_response(['ok'=>false,'message'=>'Açıklama 25–10.000 karakter arasında olmalı.'],422);
            $slugRaw=trim((string)($_POST['slug']??''));$slug=slugify($slugRaw!==''?$slugRaw:$title);
            $baseSlug=$slug;$n=1;
            while(true){$q=$pdo->prepare('SELECT id FROM properties WHERE slug=? AND id<>? LIMIT 1');$q->execute([$slug,$id]);if(!$q->fetchColumn())break;$n++;$slug=$baseSlug.'-'.$n;}
            $features=preg_split('/[\r\n,;]+/',(string)($_POST['features']??'')) ?: [];$features=array_values(array_unique(array_filter(array_map(fn($x)=>trim(strip_tags($x)), $features),fn($x)=>$x!=='' && mb_len($x)<=160)));$features=array_slice($features,0,60);
            $city=trim((string)($_POST['city']??'Sakarya'));$district=trim((string)($_POST['district']??''));$neighborhood=trim((string)($_POST['neighborhood']??''));$address=trim((string)($_POST['address']??''));
            foreach(['city'=>$city,'district'=>$district,'neighborhood'=>$neighborhood,'address'=>$address,'kind'=>$kind] as $field=>$value){if(mb_len($value)>255)json_response(['ok'=>false,'message'=>'Konum/özellik alanlarından biri çok uzun: '.$field],422);}
            $area=max(0,min(1000000,(int)($_POST['area']??0)));$rooms=substr(trim((string)($_POST['rooms']??'')),0,30);if($rooms!==''&&!preg_match('/^\d{1,2}(\+\d{1,2})?$/',$rooms))json_response(['ok'=>false,'message'=>'Oda sayısı 1+0, 2+1 gibi olmalı.'],422);$baths=max(0,min(30,(int)($_POST['baths']??0)));
            $year=max(1800,min((int)gmdate('Y')+3,(int)($_POST['year_built']??gmdate('Y'))));$floor=substr(trim((string)($_POST['floor_info']??'')),0,40);$age=substr(trim((string)($_POST['building_age']??'')),0,40);$heating=substr(trim((string)($_POST['heating']??'')),0,80);$furnishedRaw=trim((string)($_POST['furnished']??''));$furnished=$furnishedRaw==='1'?1:($furnishedRaw==='0'?0:null);
            $seoTitle=trim((string)($_POST['seo_title']??''));if($seoTitle==='')$seoTitle=mb_substr_safe($title,48).' | Emlak 54';$seoTitle=mb_substr_safe($seoTitle,255);
            $seoDescription=trim((string)($_POST['seo_description']??''));if($seoDescription==='')$seoDescription=mb_substr_safe(preg_replace('/\s+/u',' ',$description)??$description,155);$seoDescription=mb_substr_safe($seoDescription,320);
            $seoKeywords=mb_substr_safe(trim((string)($_POST['seo_keywords']??'')),500);$robots=in_array((string)($_POST['meta_robots']??'index,follow'),['index,follow','noindex,follow'],true)?(string)($_POST['meta_robots']??'index,follow'):'index,follow';
            $featured=!empty($_POST['is_featured'])?1:0;$badge=substr(trim((string)($_POST['badge']??'')),0,40);
            $newImagePaths=[]; $removedImagePaths=[];
            $pdo->beginTransaction();
            try {
                if($id){
                    $stmt=$pdo->prepare('UPDATE properties SET slug=?,title=?,deal=?,category=?,kind=?,price=?,city=?,district=?,neighborhood=?,address=?,area=?,rooms=?,baths=?,floor_info=?,building_age=?,heating=?,furnished=?,year_built=?,description=?,features_json=?,status=?,is_featured=?,badge=?,seo_title=?,seo_description=?,seo_keywords=?,meta_robots=?,published_at=IF(?=\'active\',COALESCE(published_at,UTC_TIMESTAMP()),published_at) WHERE id=?');
                    $stmt->execute([$slug,$title,$deal,$category,$kind,$price,$city,$district,$neighborhood,$address,$area,$rooms,$baths,$floor,$age,$heating,$furnished,$year,$description,json_encode($features,JSON_UNESCAPED_UNICODE),$status,$featured,$badge,$seoTitle,$seoDescription,$seoKeywords,$robots,$status,$id]);
                } else {
                    $stmt=$pdo->prepare('INSERT INTO properties (slug,title,deal,category,kind,price,city,district,neighborhood,address,area,rooms,baths,floor_info,building_age,heating,furnished,year_built,description,features_json,status,is_featured,badge,seo_title,seo_description,seo_keywords,meta_robots,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,IF(?=\'active\',UTC_TIMESTAMP(),NULL))');
                    $stmt->execute([$slug,$title,$deal,$category,$kind,$price,$city,$district,$neighborhood,$address,$area,$rooms,$baths,$floor,$age,$heating,$furnished,$year,$description,json_encode($features,JSON_UNESCAPED_UNICODE),$status,$featured,$badge,$seoTitle,$seoDescription,$seoKeywords,$robots,$status]);$id=(int)$pdo->lastInsertId();
                }
                // Explicitly remove only selected image rows belonging to this listing.
                $deleteIds=json_decode((string)($_POST['delete_image_ids']??'[]'),true);
                if(is_array($deleteIds))foreach(array_slice($deleteIds,0,40) as $imageId){$q=$pdo->prepare('SELECT image_path FROM property_images WHERE id=? AND property_id=?');$q->execute([(int)$imageId,$id]);$ipath=$q->fetchColumn();if($ipath!==false){$pdo->prepare('DELETE FROM property_images WHERE id=? AND property_id=?')->execute([(int)$imageId,$id]);$removedImagePaths[]=(string)$ipath;}}
                $cntStmt=$pdo->prepare('SELECT COUNT(*) FROM property_images WHERE property_id=?');$cntStmt->execute([$id]);$currentCount=(int)$cntStmt->fetchColumn();
                $files=$_FILES['images']??null;$uploaded=0;$limit=(int)(app_config('max_images_per_property')??20);
                if($files && isset($files['name']) && is_array($files['name'])){
                    $total=count($files['name']);if($total>30)throw new UserInputException('Bir seferde en fazla 30 fotoğraf seçebilirsiniz.');
                    for($i=0;$i<$total;$i++){
                        if(($files['error'][$i]??UPLOAD_ERR_NO_FILE)===UPLOAD_ERR_NO_FILE)continue;
                        if($currentCount+$uploaded >= $limit)throw new UserInputException('Bir ilan için en fazla '.$limit.' fotoğraf kullanılabilir.');
                        $file=['name'=>$files['name'][$i]??'','type'=>$files['type'][$i]??'','tmp_name'=>$files['tmp_name'][$i]??'','error'=>$files['error'][$i]??UPLOAD_ERR_NO_FILE,'size'=>$files['size'][$i]??0];
                        $path=image_upload_to_webp($file,'properties',$slug.'-'.($currentCount+$uploaded));
                        $newImagePaths[]=$path;
                        $order=$currentCount+$uploaded;$imgStmt=$pdo->prepare('INSERT INTO property_images (property_id,image_path,alt_text,sort_order,is_cover) VALUES (?,?,?,?,?)');
                        $imgStmt->execute([$id,$path,$title.' — fotoğraf '.($order+1),$order,($currentCount===0&&$uploaded===0)?1:0]);$uploaded++;
                    }
                }
                $pdo->commit();
            } catch(Throwable $e2){if($pdo->inTransaction())$pdo->rollBack();foreach($newImagePaths as $newPath)delete_local_upload($newPath);throw $e2;}
            foreach($removedImagePaths as $removedPath)delete_local_upload($removedPath);
            if($status==='active'){try{indexnow_submit_urls([site_url('ilan/'.$slug.'/')]);}catch(Throwable $ixA){}}log_admin_action($existing?'property_updated':'property_created','property',$id,['slug'=>$slug,'uploaded_images'=>$uploaded,'status'=>$status]);
            json_response(['ok'=>true,'message'=>$existing?'İlan güncellendi.':'Yeni ilan eklendi.','id'=>$id,'slug'=>$slug]);
        }
        case 'delete_property': {
            $id=(int)($_POST['id']??0);$p=api_property_for_admin($pdo,$id);if(!$p)json_response(['ok'=>false,'message'=>'İlan bulunamadı.'],404);
            $pdo->prepare('DELETE FROM properties WHERE id=?')->execute([$id]);foreach(($p['images']??[]) as $im)delete_local_upload((string)$im['image_path']);log_admin_action('property_deleted','property',$id,['title'=>$p['title']]);
            json_response(['ok'=>true,'message'=>'İlan silindi.']);
        }
        case 'toggle_status': {
            $id=(int)($_POST['id']??0);$status=(string)($_POST['status']??'');if(!in_array($status,['active','draft','sold','rented'],true))json_response(['ok'=>false,'message'=>'Durum geçersiz.'],422);
            $stmt=$pdo->prepare('UPDATE properties SET status=?,published_at=IF(?=\'active\',COALESCE(published_at,UTC_TIMESTAMP()),published_at) WHERE id=?');$stmt->execute([$status,$status,$id]);if(!$stmt->rowCount())json_response(['ok'=>false,'message'=>'İlan bulunamadı veya değişiklik yok.'],404);
            if($status==='active'){try{$__sg=db()->prepare('SELECT slug FROM properties WHERE id=?');$__sg->execute([$id]);$__sl=(string)$__sg->fetchColumn();if($__sl!=='')indexnow_submit_urls([site_url('ilan/'.$__sl.'/')]);}catch(Throwable $ixT){}}log_admin_action('property_status_changed','property',$id,['status'=>$status]);json_response(['ok'=>true,'message'=>'İlan durumu değiştirildi.']);
        }
        case 'delete_image': {
            $pid=(int)($_POST['property_id']??0);$imageId=(int)($_POST['image_id']??0);$q=$pdo->prepare('SELECT image_path FROM property_images WHERE id=? AND property_id=?');$q->execute([$imageId,$pid]);$path=$q->fetchColumn();if($path===false)json_response(['ok'=>false,'message'=>'Fotoğraf bulunamadı.'],404);
            $pdo->prepare('DELETE FROM property_images WHERE id=? AND property_id=?')->execute([$imageId,$pid]);delete_local_upload((string)$path);log_admin_action('property_image_deleted','property',$pid,['image_id'=>$imageId]);json_response(['ok'=>true,'message'=>'Fotoğraf kaldırıldı.']);
        }
        case 'districts': {
            try {
                if (!ensure_location_tables($pdo)) throw new UserInputException('Konum tabloları oluşturulamadı.');
                $rows = $pdo->query('SELECT id, name FROM districts ORDER BY name')->fetchAll();
                json_response(['ok'=>true,'districts'=>$rows]);
            } catch (Throwable $e) { json_response(['ok'=>false,'message'=>'Konum listesi alınamadı.'], 503); }
        }
        case 'neighborhoods': {
            $dn = trim((string)($_GET['district'] ?? ''));
            $did = (int)($_GET['district_id'] ?? 0);
            try {
                if ($did <= 0 && $dn !== '') {
                    $dq = $pdo->prepare('SELECT id FROM districts WHERE name=? LIMIT 1');
                    $dq->execute([mb_substr_safe($dn, 100)]);
                    $did = (int)$dq->fetchColumn();
                }
                if ($did <= 0) json_response(['ok'=>true,'neighborhoods'=>[]]);
                $st = $pdo->prepare('SELECT name FROM neighborhoods WHERE district_id=? ORDER BY name');
                $st->execute([$did]);
                json_response(['ok'=>true,'neighborhoods'=>array_column($st->fetchAll(), 'name')]);
            } catch (Throwable $e) { json_response(['ok'=>false,'message'=>'Mahalle listesi alınamadı.'], 503); }
        }
        case 'save_neighborhood': {
            $dn = trim((string)($_POST['district'] ?? ''));
            $mn = trim((string)($_POST['neighborhood'] ?? ''));
            if ($dn === '' || $mn === '' || mb_len_safe($mn) > 140) json_response(['ok'=>false,'message'=>'İlçe ve mahalle adı gerekli.'], 422);
            if (!ensure_location_tables($pdo)) json_response(['ok'=>false,'message'=>'Konum tabloları kullanılamıyor.'], 503);
            $dq = $pdo->prepare('SELECT id FROM districts WHERE name=? LIMIT 1');
            $dq->execute([mb_substr_safe($dn, 100)]);
            $did = (int)$dq->fetchColumn();
            if ($did <= 0) json_response(['ok'=>false,'message'=>'İlçe bulunamadı.'], 422);
            $st = $pdo->prepare('INSERT IGNORE INTO neighborhoods (district_id, name) VALUES (?,?)');
            $st->execute([$did, $mn]);
            log_admin_action('neighborhood_added','location',null,['district'=>$dn,'neighborhood'=>$mn]);
            json_response(['ok'=>true,'message'=>'Mahalle eklendi.']);
        }
        case 'save_settings': {
            $allowed=['brand_name','site_url','site_tagline','phone_digits','phone_display','whatsapp_number','email','address','office_hours','footer_description','seo_home_title','seo_home_description','seo_about_title','seo_about_description','seo_contact_title','seo_contact_description','home_hero_title','home_hero_description','home_listing_heading','home_listing_description','home_seo_heading','home_seo_p1','home_seo_p2','home_promo_title','home_promo_text','about_title','about_lead','about_heading','about_p1','about_p2','contact_title','contact_description','contact_heading','contact_intro','open_address','social_instagram','social_facebook','social_x','social_youtube','social_sahibinden','google_site_verification','seo_self_links','site_theme','indexnow_enabled','indexnow_key','demo_notice'];
            $newLogoPath=''; $oldLogoPath=''; $newHeroPath=''; $oldIndexKey=setting('indexnow_key','');
            $pdo->beginTransaction();
            try {
                $stmt=$pdo->prepare('INSERT INTO site_settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)');
                foreach($allowed as $key){if(!array_key_exists($key,$_POST))continue;$v=trim((string)$_POST[$key]);if(mb_len_safe($v)>10000)throw new UserInputException('Ayar alanı çok uzun: '.$key);
                    if($key==='site_url' && $v!=='' ) { $u=parse_url($v); if(!filter_var($v,FILTER_VALIDATE_URL)||!in_array(strtolower((string)($u['scheme']??'')),['http','https'],true)||empty($u['host'])||isset($u['user'])||isset($u['pass'])||isset($u['query'])||isset($u['fragment'])) throw new UserInputException('Site adresi geçerli bir http:// veya https:// ana adresi olmalı; kullanıcı bilgisi, sorgu ve fragment kullanılamaz.'); }
                    if($key==='email' && $v!=='' && !filter_var($v,FILTER_VALIDATE_EMAIL))throw new UserInputException('E-posta adresi geçerli değil.');
                    if(in_array($key,['phone_digits','whatsapp_number'],true)){$v=preg_replace('/\D+/','',$v)??'';if(strlen($v)<10||strlen($v)>15)throw new UserInputException('Telefon/WhatsApp numarasını ülke koduyla yazın.');}
                    if($key==='brand_name' && ($v===''||mb_len_safe($v)>80))throw new UserInputException('Site adı 1–80 karakter olmalı.');
                    if(in_array($key,['social_instagram','social_facebook','social_x','social_youtube','social_sahibinden'],true)&&$v!==''){if(!preg_match('~^https?://~i',$v))$v='https://'.$v;if(!filter_var($v,FILTER_VALIDATE_URL)||mb_len_safe($v)>500)throw new UserInputException('Sosyal medya bağlantısı geçerli değil: '.$key);}
                    if($key==='google_site_verification'&&$v!==''){if(preg_match('~content\s*=\s*["\']([^"\']+)["\']~i',$v,$gm))$v=trim($gm[1]);if(!preg_match('~^[A-Za-z0-9_-]{10,128}$~',$v))throw new UserInputException('Search Console doğrulama kodu geçersiz. HTML etiketindeki content değerini yapıştırın.');}
                    if($key==='seo_self_links'){$v=($v==='1')?'1':'0';}
                    if($key==='site_theme'&&!in_array($v,['mavi','emlak54','ortak'],true))throw new UserInputException('Tema seçimi geçersiz.');
                    if($key==='indexnow_enabled'){$v=($v==='1')?'1':'0';}
                    if($key==='indexnow_key'){$v=strtolower(trim($v));if($v!==''&&!preg_match('~^[a-f0-9]{32}$~',$v))throw new UserInputException('IndexNow anahtarı 32 haneli hex olmalı. Üret butonunu kullanın.');}
                    $stmt->execute([$key,$v]);
                }
                if(isset($_FILES['logo'])&&($_FILES['logo']['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_NO_FILE){
                    $oldLogoPath=setting('logo_path','');$newLogoPath=image_upload_to_webp($_FILES['logo'],'branding');$stmt->execute(['logo_path',$newLogoPath]);
                }
                if((string)($_POST['hero_remove'] ?? '') === '1' && (!isset($_FILES['hero_image']) || ($_FILES['hero_image']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE)) {
                    $oldHeroGone = setting('hero_image_path', '');
                    if ($oldHeroGone !== '') delete_local_upload($oldHeroGone);
                    $stmt->execute(['hero_image_path', '']);
                }
                if(isset($_FILES['hero_image'])&&($_FILES['hero_image']['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_NO_FILE){
                    $oldHeroPath=setting('hero_image_path','');$newHeroPath=image_upload_to_webp($_FILES['hero_image'],'branding');$stmt->execute(['hero_image_path',$newHeroPath]);
                    if($oldHeroPath!==''&&$oldHeroPath!==$newHeroPath)delete_local_upload($oldHeroPath);
                }
                $pdo->commit();if($oldLogoPath!==''&&$newLogoPath!==''&&$oldLogoPath!==$newLogoPath)delete_local_upload($oldLogoPath);site_settings(true);site_settings(true);sync_indexnow_key_file($oldIndexKey,setting('indexnow_key',''));log_admin_action('site_settings_updated','settings',null,['keys'=>array_values(array_intersect($allowed,array_keys($_POST)))]);
            }catch(Throwable $e2){if($pdo->inTransaction())$pdo->rollBack();if($newLogoPath!=='')delete_local_upload($newLogoPath);if($newHeroPath!=='')delete_local_upload($newHeroPath);throw $e2;}
            json_response(['ok'=>true,'message'=>'Site ayarları kaydedildi.']);
        }
        case 'change_username': {
            $newU = trim((string)($_POST['new_username'] ?? ''));
            if (!preg_match('/^[a-zA-Z0-9._-]{3,40}$/', $newU)) json_response(['ok'=>false,'message'=>'Kullanıcı adı 3-40 karakter olmalı; harf, rakam, nokta, alt çizgi ve tire kullanabilirsin.'],422);
            $chk = $pdo->prepare('SELECT id FROM admins WHERE username=? AND id<>? LIMIT 1');
            $chk->execute([$newU, admin_id()]);
            if ($chk->fetch()) json_response(['ok'=>false,'message'=>'Bu kullanıcı adı başka bir yönetici tarafından kullanılıyor.'],409);
            $pdo->prepare('UPDATE admins SET username=? WHERE id=?')->execute([$newU, admin_id()]);
            log_admin_action('admin_username_changed','admin',admin_id(),['new_username'=>$newU]);
            log_security_event('username_change_success','info','Yönetici kullanıcı adını değiştirdi');
            json_response(['ok'=>true,'message'=>'Kullanıcı adı güncellendi. Bir sonraki girişte yenisini kullan.','username'=>$newU]);
        }
        case 'change_password': {
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(['ok'=>false,'message'=>'POST gerekli.'],405);
            $current = (string)($_POST['current_password'] ?? '');
            $new = (string)($_POST['new_password'] ?? '');
            $confirm = (string)($_POST['new_password_confirm'] ?? '');
            if (strlen($new) < 14 || strlen($new) > 256) json_response(['ok'=>false,'message'=>'Yeni parola 14–256 karakter arasında olmalı.'],422);
            if (!hash_equals($new, $confirm)) json_response(['ok'=>false,'message'=>'Yeni parolalar eşleşmiyor.'],422);
            $st = $pdo->prepare('SELECT password_hash FROM admins WHERE id=? AND is_active=1 LIMIT 1');
            $st->execute([admin_id()]); $row = $st->fetch();
            if (!$row || !password_verify($current, (string)$row['password_hash'])) {
                log_security_event('password_change_failed','warning','Mevcut parola doğrulaması başarısız');
                json_response(['ok'=>false,'message'=>'Mevcut parola doğrulanamadı.'],403);
            }
            $algo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
            $hash = password_hash($new, $algo);
            if ($hash === false) throw new UserInputException('Parola güvenli biçimde işlenemedi.');
            $pdo->prepare('UPDATE admins SET password_hash=? WHERE id=?')->execute([$hash,admin_id()]);
            log_admin_action('admin_password_changed','admin',admin_id());
            log_security_event('password_change_success','info','Yönetici parolasını değiştirdi');
            session_regenerate_id(true); $_SESSION['csrf_token']=bin2hex(random_bytes(32));
            json_response(['ok'=>true,'message'=>'Yönetici parolası başarıyla değiştirildi.','csrf'=>csrf_token()]);
        }
        case 'seo_report': json_response(['ok'=>true,'report'=>api_seo_report($pdo)]);
        case 'security': {
            $period=(string)($_GET['period']??'week');if(!in_array($period,['week','month','year'],true))$period='week';
            $summary=[
              'events_today'=>(int)$pdo->query('SELECT COUNT(*) FROM security_events WHERE created_at>=UTC_DATE()')->fetchColumn(),
              'high_30'=>(int)$pdo->query("SELECT COUNT(*) FROM security_events WHERE severity IN ('high','critical') AND created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY)")->fetchColumn(),
              'login_failed_30'=>(int)$pdo->query("SELECT COUNT(*) FROM security_events WHERE event_type='login_failed' AND created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY)")->fetchColumn(),
              'active_bans'=>(int)$pdo->query('SELECT COUNT(*) FROM ip_bans WHERE is_active=1 AND (banned_until IS NULL OR banned_until>UTC_TIMESTAMP())')->fetchColumn(),
            ];
            $events=$pdo->query('SELECT e.*,b.is_active AS ban_active,b.banned_until FROM security_events e LEFT JOIN ip_bans b ON b.ip_address=e.ip_address AND b.is_active=1 AND (b.banned_until IS NULL OR b.banned_until>UTC_TIMESTAMP()) ORDER BY e.created_at DESC LIMIT 120')->fetchAll();
            $bans=$pdo->query('SELECT b.*,a.username AS admin_username FROM ip_bans b LEFT JOIN admins a ON a.id=b.banned_by ORDER BY b.is_active DESC,b.created_at DESC LIMIT 200')->fetchAll();
            $types=$pdo->query("SELECT event_type,COUNT(*) total FROM security_events WHERE created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY) GROUP BY event_type ORDER BY total DESC LIMIT 12")->fetchAll();
            json_response(['ok'=>true,'summary'=>$summary,'series'=>api_series($pdo,'security_events',$period),'events'=>$events,'bans'=>$bans,'types'=>$types]);
        }
        case 'manual_ban': {
            $ip=trim((string)($_POST['ip_address']??''));$reason=trim((string)($_POST['reason']??'Yönetici tarafından engellendi'));$duration=(string)($_POST['duration']??'permanent');
            if(!filter_var($ip,FILTER_VALIDATE_IP))json_response(['ok'=>false,'message'=>'Geçerli bir IPv4 veya IPv6 adresi girin.'],422);
            if(in_array($ip,['127.0.0.1','::1'],true))json_response(['ok'=>false,'message'=>'Yerel sunucu IP adresi panelden engellenemez.'],422);
            if($ip===client_ip())json_response(['ok'=>false,'message'=>'Kendi mevcut bağlantı IP adresini engelleyemezsin; yönetim paneline erişimini kaybetmemek için farklı bir bağlantıdan kontrol et.'],422);
            $until=null;if($duration==='1h')$until=gmdate('Y-m-d H:i:s',time()+3600);elseif($duration==='24h')$until=gmdate('Y-m-d H:i:s',time()+86400);elseif($duration==='7d')$until=gmdate('Y-m-d H:i:s',time()+604800);
            $stmt=$pdo->prepare('INSERT INTO ip_bans (ip_address,reason,banned_by,banned_until,is_active) VALUES (?,?,?,?,1) ON DUPLICATE KEY UPDATE reason=VALUES(reason),banned_by=VALUES(banned_by),banned_until=VALUES(banned_until),is_active=1,updated_at=UTC_TIMESTAMP()');$stmt->execute([$ip,mb_substr_safe($reason?:'Yönetici tarafından engellendi',255),admin_id(),$until]);
            log_admin_action('ip_banned','ip_ban',null,['ip'=>$ip,'reason'=>$reason,'until'=>$until]);log_security_event('manual_ip_ban','info','Yönetici tarafından IP engellendi');json_response(['ok'=>true,'message'=>'IP adresi engellendi.']);
        }
        case 'unban_ip': {
            $id=(int)($_POST['id']??0);$stmt=$pdo->prepare('UPDATE ip_bans SET is_active=0 WHERE id=?');$stmt->execute([$id]);if(!$stmt->rowCount())json_response(['ok'=>false,'message'=>'Aktif engel bulunamadı.'],404);
            log_admin_action('ip_unbanned','ip_ban',$id);json_response(['ok'=>true,'message'=>'IP engeli kaldırıldı.']);
        }
        case 'indexnow_ping': {
            $scope=(string)($_POST['scope']??'test');
            $base=rtrim(setting('site_url',''),'/');
            $urls=[$base.'/'];
            if($scope==='all'){
                try {
                    foreach(db()->query("SELECT slug FROM properties WHERE status='active' ORDER BY created_at DESC,id DESC LIMIT 500")->fetchAll() as $row){
                        $urls[]=site_url('ilan/'.rawurlencode((string)$row['slug']).'/');
                    }
                } catch(Throwable $ixQ) {}
            }
            $res=indexnow_submit_urls($urls);
            $sum=gmdate('d.m.Y H:i').' — '.(int)($res['sent']??0).' URL, Bing: '.(string)($res['bing']??'-').', Yandex: '.(string)($res['yandex']??'-');
            try {
                $wstmt=db()->prepare('INSERT INTO site_settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)');
                $wstmt->execute(['indexnow_last',$sum]);
            } catch(Throwable $ixW) {}
            site_settings(true);
            log_admin_action('indexnow_pinged','seo',null,['scope'=>$scope,'sent'=>(int)($res['sent']??0)]);
            if(!empty($res['ok'])) json_response(['ok'=>true,'message'=>'Bildirim gönderildi ('.(int)($res['sent']??0).' URL).','summary'=>$sum]);
            json_response(['ok'=>false,'message'=>(string)($res['message']??'Bildirim gönderilemedi. Ayarları kontrol edin.'),'summary'=>$sum],422);
        }
        case 'logout': session_unset();session_regenerate_id(true);json_response(['ok'=>true,'message'=>'Oturum kapatıldı.','redirect'=>'emlak-admin.php']);
        default: json_response(['ok'=>false,'message'=>'Bilinmeyen işlem.'],404);
    }
} catch (UserInputException $ex) {
    json_response(['ok'=>false,'message'=>$ex->getMessage()],422);
} catch (Throwable $ex) {
    error_log('[Emlak54 admin-api] ' . $ex->getMessage());
    if (app_config('app_env') === 'development') json_response(['ok'=>false,'message'=>$ex->getMessage()],500);
    json_response(['ok'=>false,'message'=>'İşlem tamamlanamadı. Girdileri ve sunucu yapılandırmasını kontrol edin.'],500);
}
function mb_len_safe(string $s): int { return function_exists('mb_strlen')?mb_strlen($s,'UTF-8'):strlen($s); }
function mb_substr_safe(string $s,int $length): string {return function_exists('mb_substr')?mb_substr($s,0,$length,'UTF-8'):substr($s,0,$length);}

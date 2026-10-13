<?php
declare(strict_types=1);
require __DIR__ . '/includes/bootstrap.php';
header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store, private');
if (!installed()) json_response(['ok'=>false,'results'=>[],'count'=>0,'message'=>'Kurulum gerekli.'],503);
block_banned_ip(true);
if(!rate_limit('public-search',50,60)){log_security_event('public_search_limited','warning','Canlı arama hız sınırına ulaştı');json_response(['ok'=>false,'results'=>[],'count'=>0,'message'=>'Arama limiti aşıldı.'],429);}
$q=trim((string)($_GET['q']??''));$q=preg_replace('/\s+/u',' ',$q)??$q;
if(strlen($q)<2)json_response(['ok'=>true,'results'=>[],'count'=>0]);
if(strlen($q)>160)json_response(['ok'=>false,'results'=>[],'count'=>0,'message'=>'Arama metni çok uzun.'],422);
try{
  $tokens=preg_split('/\s+/u',$q)?:[];$tokens=array_slice(array_filter($tokens),0,8);$where=[];$params=[];
  foreach($tokens as $token){$like='%'.addcslashes($token,'\\%_').'%';$where[]='(p.title LIKE ? OR p.description LIKE ? OR p.city LIKE ? OR p.district LIKE ? OR p.neighborhood LIKE ? OR p.category LIKE ? OR p.kind LIKE ? OR p.deal LIKE ? OR CAST(p.area AS CHAR) LIKE ?)';for($i=0;$i<9;$i++)$params[]=$like;}
  if(!$where)json_response(['ok'=>true,'results'=>[],'count'=>0]);
  $filter="p.status='active' AND ".implode(' AND ',$where);
  $count=$pdoCount=db()->prepare("SELECT COUNT(*) FROM properties p WHERE $filter");$count->execute($params);$total=(int)$count->fetchColumn();
  $limit=max(1,min(8,(int)($_GET['limit']??5)));
  $stmt=db()->prepare("SELECT p.id,p.slug,p.title,p.deal,p.category,p.kind,p.price,p.city,p.district,p.neighborhood,p.area,p.rooms,p.baths,p.year_built,p.description,(SELECT i.image_path FROM property_images i WHERE i.property_id=p.id ORDER BY i.is_cover DESC,i.sort_order ASC,i.id ASC LIMIT 1) image FROM properties p WHERE $filter ORDER BY p.is_featured DESC,p.view_count DESC,p.created_at DESC LIMIT $limit");
  $stmt->execute($params);$results=[];
  foreach($stmt->fetchAll() as $p){$results[]=['id'=>(int)$p['id'],'slug'=>$p['slug'],'title'=>$p['title'],'price'=>(float)$p['price'],'deal'=>$p['deal'],'category'=>$p['category'],'kind'=>$p['kind'],'area'=>(int)$p['area'],'rooms'=>$p['rooms']?($p['rooms'].'+'.(int)$p['baths']):'','location'=>implode(', ',array_filter([$p['neighborhood'],$p['district'],$p['city']])),'description'=>$p['description'],'image'=>public_image_url((string)($p['image']?:'assets/logo.svg')),'href'=>app_base_path().'ilan/'.$p['slug'].'/','priceNote'=>$p['deal']==='Kiralık'?'/ ay':''];}
  json_response(['ok'=>true,'results'=>$results,'count'=>$total]);
}catch(Throwable $ex){error_log('[Emlak54 public search] '.$ex->getMessage());json_response(['ok'=>false,'results'=>[],'count'=>0,'message'=>'Arama şu anda kullanılamıyor.'],503);}

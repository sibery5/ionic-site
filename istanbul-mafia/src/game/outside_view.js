// [V2] Camlardan dışarısı: iç mekânlar dış dünyadan ayrı sahnede kurulur (interiors.js). Pencereden dışarısını göstermenin
// en ucuz inandırıcı yolu: kapıdan girerken şehir sahnesini binanın içinden BİR KEZ küçük bir küp haritaya çizmek
// (6 × 128² — kapı geçişinde tek seferlik iş, kare başına maliyet sıfır). Pencere düzlemi bu küpü bakış yönüyle örnekler
// (kırılma oranı 1 → bakış yönü aynen geçer): uzak manzara için paralaks hatası yok, yakın komşu duvarlar hafif kayar.
// Seçilmeyenler: canlı görünüm (her karede ikinci şehir çizimi — iç mekânın bütün kazancını yer), önceden çizilmiş tek
// panorama (gece/gündüz, hava ve konum tutmaz). Küp, iç mekân çerçevesine döndürülerek çizilir: iç mekânda kapı hep +z'dedir,
// dünyada kapının normali (nx, nz) yönündedir.
import * as THREE from 'three';

let RT = null, CAM = null;
const _bg = new THREE.Color();

// Dış görüntüyü yakala. at: { x, y, z } dünya konumu; yaw: iç mekân +z → dünya kapı yönü dönüşü.
// Dönen doku sonraki girişte yeniden kullanılır (tek hedef; bellek sabit).
export function captureOutside(g, at, yaw, size) {
  const r = g.renderer;
  if (!r || !g.scene) return null;
  const q = g.settings && g.settings.quality;
  const res = size || (q === 'high' ? 256 : q === 'low' ? 96 : 128);
  if (!RT || RT.width !== res) {
    if (RT) RT.dispose();
    RT = new THREE.WebGLCubeRenderTarget(res, { type: THREE.HalfFloatType, generateMipmaps: false });
    RT.texture.mapping = THREE.CubeRefractionMapping;
    CAM = new THREE.CubeCamera(0.5, 2500, RT);
  }
  const t0 = performance.now();
  CAM.position.set(at.x, at.y, at.z);
  CAM.rotation.set(0, yaw || 0, 0);
  CAM.updateMatrixWorld(true);
  const p = g.player, pv = p && p.model ? p.model.root.visible : true;
  if (p && p.model) p.model.root.visible = false; // kapıdaki oyuncu görüntüye girmesin
  const sm = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false; // gölge haritası yeniden çizilmesin
  const prev = r.getRenderTarget();
  try { CAM.update(r, g.scene); } catch (e) { console.warn('dış görüntü yakalanamadı', e); }
  r.setRenderTarget(prev);
  r.shadowMap.autoUpdate = sm;
  if (p && p.model) p.model.root.visible = pv;
  captureOutside.lastMs = performance.now() - t0;
  return RT.texture;
}

// Pencere camı: dış görüntüyü bakış yönüyle gösterir; hafif soğuk ton ve kararma (ışıma eşiğini aşmasın).
export function windowMaterial(tex, tint = 0xd6dde2) {
  if (!tex) return new THREE.MeshBasicMaterial({ color: 0x9cb4c8 });
  const m = new THREE.MeshBasicMaterial({ envMap: tex, refractionRatio: 0.995, color: tint });
  m.toneMapped = true;
  return m;
}

// Gece/gündüz uyumlu yedek renk (yakalama başarısızsa sahne arka planı)
export function fallbackSky(g) { return _bg.set(g.env && g.env.nightFactor > 0.5 ? 0x0a0f1a : 0x9cc8e8); }

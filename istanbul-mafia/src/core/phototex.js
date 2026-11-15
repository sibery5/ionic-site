// Telifsiz (CC0) fotoğraf dokuları. assets/tex/<ad>_{a,n,r,h} dosyalarını yükler ve prosedürel dokularla aynı
// paket biçimine çevirir:  map = RGB renk + A pürüzlülük  ·  normalMap = RGB normal + A yükseklik.
// Dokular yüklenene kadar 4×4 düz renkli yer tutucu kullanılır; dosya yüklenemezse prosedürel üretici devreye girer.
// Kaynak ve lisans: assets/tex/KAYNAK.md · paketleme: scripts/assets/pack-textures.py
import * as THREE from 'three';

// ad → gerçek dünyada bir döşemenin kenarı (m). pack-textures.py içindeki SETS tablosuyla aynı olmalı.
export const PHOTO = { asphalt: 2.0, pave: 2.0, cobble: 2.0, grass: 2.0, plaster: 2.0, brick: 2.5, roof: 2.5, ashlar: 3.0, bark: 1.0 };
export const photoStats = { wanted: 0, loaded: 0, failed: [] };

const BASE = 'assets/tex/';
const pending = [];
let enabled = true;
export function setPhotoTextures(on) { enabled = !!on; }
// Yükleme ekranı bunu bekler; süre aşımı olursa oyun yer tutucularla açılır, dokular gelince yerine oturur.
export function photoReady(timeoutMs = 15000) {
  return Promise.race([Promise.all(pending), new Promise((res) => setTimeout(res, timeoutMs))]).then(() => photoStats);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('yüklenemedi: ' + file));
    const d = typeof window !== 'undefined' && window.desktop;
    if (d && d.readAsset) {
      // Masaüstü: baytları ana süreçten al; file:// köken kısıtlarından bağımsızdır.
      d.readAsset('tex/' + file).then((buf) => {
        if (!buf) { reject(new Error('yok: ' + file)); return; }
        const url = URL.createObjectURL(new Blob([buf], { type: file.endsWith('.jpg') ? 'image/jpeg' : 'image/webp' }));
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.src = url;
      }, reject);
    } else {
      img.onload = () => resolve(img);
      img.src = BASE + file;
    }
  });
}

let cv = null, cx = null;
function pixels(img, S) {
  if (!cv) { cv = document.createElement('canvas'); cx = cv.getContext('2d', { willReadFrequently: true }); }
  if (cv.width !== S) cv.width = cv.height = S;
  cx.drawImage(img, 0, 0, S, S);
  return cx.getImageData(0, 0, S, S).data; // satır 0 = görüntünün üstü; DX yönlü normal haritasıyla bu sıra doğrudur
}

function holder(srgb, r, g, b, a) {
  const d = new Uint8Array(64);
  for (let i = 0; i < 64; i += 4) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a; }
  const t = new THREE.DataTexture(d, 4, 4, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
// Boyut değiştiği için önce GPU kaynağını bırak (three sabit boyutlu depolama kullanır), sonra yeni veriyi ver.
function swap(tex, data, S) { tex.dispose(); tex.image = { data, width: S, height: S }; tex.needsUpdate = true; }

// Dönüş: { map, normalMap, tile } — tile: gerçek döşeme kenarı (m); fotoğraf kullanılmıyorsa prosedürel set döner (tile yok).
export function photoSet(name, low, fallback) {
  if (!enabled || !(name in PHOTO) || typeof document === 'undefined') return fallback();
  const S = low ? 512 : 1024;
  const set = { map: holder(true, 120, 120, 120, 220), normalMap: holder(false, 128, 128, 255, 128), tile: PHOTO[name], photo: true };
  photoStats.wanted++;
  pending.push(Promise.all(['_a.webp', '_n.jpg', '_r.webp', '_h.webp'].map((s) => loadImage(name + s))).then(([a, n, r, h]) => {
    const A = new Uint8Array(pixels(a, S)), R = pixels(r, S);
    for (let i = 3; i < A.length; i += 4) A[i] = R[i - 3];
    const N = new Uint8Array(pixels(n, S)), Hh = pixels(h, S);
    for (let i = 3; i < N.length; i += 4) N[i] = Hh[i - 3];
    swap(set.map, A, S); swap(set.normalMap, N, S);
    photoStats.loaded++;
  }).catch((err) => {
    // dosya yok / okunamadı: prosedürel dokuya dön (döşeme ölçeği fotoğrafınki kalır; görüntü bozulmaz, yalnızca sıklaşır)
    photoStats.failed.push(name);
    console.warn('[doku] ' + name + ': ' + (err && err.message));
    const f = fallback();
    swap(set.map, f.map.image.data, f.map.image.width); swap(set.normalMap, f.normalMap.image.data, f.normalMap.image.width);
  }));
  return set;
}

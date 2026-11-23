// Model atölyesi (geliştirme aracı; oyuna paketlenmez).
// Kodla üretilen her modeli nötr stüdyo ışığında büyük ve net görüntüler, sayılarını verir, GLB olarak dışa aktarır.
// Amaç: modeli yazan kişi çıktısına BAKARAK düzeltsin ("kod çalışıyor" kabul değildir).
// Çalıştırma: node scripts/atolye.js --liste | node scripts/atolye.js insan:kahraman araba:sedan --gorunus q,f,s [--glb]
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { CARS } from '../game/economy.js';
import { buildCarModel, Vehicle, getTemplate } from '../entities/vehicles.js';
import { buildAircraftModel, AIR_TYPES } from '../entities/aircraft.js';
import { buildBoatModel, BOAT_TYPES } from '../entities/boats.js';
import { buildWeaponModel, WEAPON_ORDER, WEAPONS } from '../game/weapons.js';
import { CharacterModel, defaultLook, randomLook } from '../entities/character.js';
import { REIS_LOOK, KENAN_LOOK, LEYLA_LOOK, ALI_LOOK } from '../game/story_data.js';
import { RNG } from '../core/util.js';

// ---- Katalog: kimlik → model üreten fonksiyon (THREE.Object3D döndürür) ----
const CAT = {};
// insanlar her zaman en ayrıntılı düzeyde (LOD0) görüntülenir; oyunda düzey kamera uzaklığına göre seçilir
// [insan] boşta davranışları Math.random kullanır (bakış, sigara, telefon): her görüntü aynı olsun diye tohumlanır
const person = (look) => () => {
  const mr = Math.random, r = new RNG(11); Math.random = () => r.next();
  try { const m = new CharacterModel(typeof look === 'function' ? look() : look); m.seed = 0.5; m.forceLod = 0; m.setLod(0); for (let i = 0; i < 60; i++) m.animate(0.016, { speed: 0, force: true }); return m.root; } finally { Math.random = mr; }
};
// [insan] force: kök sahneye eklenmeden animate erken dönüyordu -> atölye bağlama (T benzeri) pozunu gösteriyordu; artık oyundaki boşta duruşu
CAT['insan:kahraman'] = person(defaultLook('m'));
// [tutuş] silah tutuşu denetimi: nişan pozunda tabanca / AK / bıçak (el ve kabza uyumu)
const holding = (wid, st) => () => {
  const mr = Math.random, r = new RNG(11); Math.random = () => r.next();
  try { const m = new CharacterModel(defaultLook('m')); m.seed = 0.5; m.forceLod = 0; m.setLod(0); m.setWeapon(wid); for (let i = 0; i < 90; i++) m.animate(0.016, { speed: 0, force: true, ...st }); m.root.userData.model = m; window.__curl = m.curl.slice(); return m.root; } finally { Math.random = mr; }
};
// [kapı] açık kapı denetimi: gövdede kapı boşluğu olmalı, ikinci (hayalet) kapı olmamalı
const doorOpen = (type) => () => { const g = buildCarModel(type, '#b02020'); const fake = { T: getTemplate(type), kind: 'car', mesh: g, detached: new Set(), windows: [], _own: {}, game: { audio: null } };
  Object.setPrototypeOf(fake, Vehicle.prototype); fake.setDoor('doorL0', 1.1); g.userData.__fake = fake; return g; };
CAT['kapi:sedan'] = doorOpen('sedan');
CAT['kapi:kapandi'] = () => { const g = doorOpen('sedan')(); const v = g.userData.__fake; if (v) v.setDoor('doorL0', 0); return g; };
CAT['tutus:tabanca'] = holding('pistol', { aim: true });
CAT['tutus:ak'] = holding('ak', { aim: true, twoHanded: true });
CAT['tutus:ak-bosta'] = holding('ak', { twoHanded: true });
CAT['tutus:bicak'] = holding('knife', {});
// [B3] A/B: eski bıçak yerleşimi (tabanca dönüşü: sap parmak yönünde) ve saldırı anı
CAT['tutus:bicak-eski'] = () => { const root = holding('knife', {})(); const m = root.userData.model; if (m && m.weaponMesh) { m.weaponMesh.rotation.x = Math.PI / 2; m.weaponMesh.position.set(0, 0, 0); } root.updateMatrixWorld(true); return root; };
CAT['tutus:bicak-dur'] = () => { const mr = Math.random, r = new RNG(11); Math.random = () => r.next(); try { const m = new CharacterModel(defaultLook('m')); m.seed = 0.5; m.forceLod = 0; m.setLod(0); m.setWeapon('knife'); m.combo = 0; m.punch(); for (let i = 0; i < 14; i++) m.animate(0.016, { speed: 0, force: true }); m.root.userData.model = m; return m.root; } finally { Math.random = mr; } };
CAT['tutus:eskisilah'] = () => { window.__noProps = true; return holding('pistol', { aim: true })(); };
CAT['tutus:yumruk'] = () => { const root = holding('pistol', { aim: true })(); const m = root.userData.model; if (m) for (const A of m.arms) { A.fi.rotation.set(0, 0, -A.s * 1.5); A.fd.rotation.set(0, 0, -A.s * 1.45); } root.updateMatrixWorld(true); return root; };
// [poz] hareket pozları denetimi (C2): koşu döngüsünün belirli anında dondurulmuş kare. f(i) -> animate durumu; n kare; sonra isteğe bağlı fn(m)
const posed = (wid, n, f, fn) => () => {
  const mr = Math.random, r = new RNG(11); Math.random = () => r.next();
  try {
    const m = new CharacterModel(defaultLook('m')); m.seed = 0.5; m.forceLod = 0; m.setLod(0); if (wid) m.setWeapon(wid);
    for (let i = 0; i < n; i++) { if (fn) fn(m, i); m.animate(1 / 60, { force: true, speed: 0, ...f(i) }); }
    m.root.userData.model = m; return m.root;
  } finally { Math.random = mr; }
};
// [tepki] vurulma / devrilme / kalkış poz kataloğu (R): i=30'da tetiklenir, n. karede dondurulur
const tepki = (n, fn) => posed(null, n, () => ({}), (m, i) => { if (i === 30) fn(m); });
const kd = (mode, dx, dz, dur = 3.4) => (m) => { m.kdNext = { mode, k: 0.8 }; m.knockdown(dx, dz, dur); };
CAT['tepki:karin'] = tepki(75, (m) => m.setClutch('torso', 1, 5, 1));
CAT['tepki:kol'] = tepki(75, (m) => m.setClutch('arm', 1, 5, 1));
CAT['tepki:bacak'] = tepki(75, (m) => m.setClutch('leg', -1, 5, 1));
CAT['tepki:diz'] = tepki(30 + 50, (m) => { m.setClutch('leg', -1, 3, 1); kd('knee', 0, 1, 2.6)(m); });
CAT['tepki:savrul-hava'] = tepki(30 + 20, kd('blast', 0, 1));
CAT['tepki:yuvarlan'] = tepki(30 + 70, kd('blast', 0, 1));
CAT['tepki:yatis'] = tepki(30 + 96, kd('blast', 0, 1));
CAT['tepki:kalk-sinav'] = tepki(30 + 128, kd('blast', 0, 1));
CAT['tepki:kalk-dortayak'] = tepki(30 + 155, kd('blast', 0, 1));
CAT['tepki:kalk-yarimdiz'] = tepki(30 + 182, kd('blast', 0, 1));
CAT['tepki:sirt-yatis'] = tepki(30 + 96, kd('fall', 0, -1));
CAT['tepki:sirt-dogrul'] = tepki(30 + 133, kd('fall', 0, -1));
CAT['tepki:sirt-diz'] = tepki(30 + 159, kd('fall', 0, -1));
const yuru = (v, extra) => (i) => ({ speed: v, moveZ: 1, ...extra });
CAT['poz:ayakta'] = posed(null, 90, () => ({}));
CAT['poz:yuru'] = posed(null, 97, yuru(1.4));
CAT['poz:kos'] = posed(null, 97, yuru(3.6));
CAT['poz:depar'] = posed(null, 97, yuru(6.5));
CAT['poz:comel'] = posed(null, 90, () => ({ crouch: true }));
CAT['poz:comel-yuru'] = posed(null, 97, yuru(1.5, { crouch: true }));
// zıplama: 0-20 yerde koşu, sonra havada; kare sayısı evreyi seçer (yükseliş / tepe / düşüş / iniş)
const zipla = (n) => posed(null, n, (i) => { const ta = (i - 30) / 60; const air = i >= 30 && ta < 0.8; return { speed: 3, moveZ: 1, air, vy: air ? 4.2 - 9.8 * ta : 0 }; });
CAT['poz:zipla-hazir'] = zipla(31); CAT['poz:zipla-yuksel'] = zipla(42); CAT['poz:zipla-tepe'] = zipla(56); CAT['poz:zipla-dus'] = zipla(72); CAT['poz:zipla-inis'] = zipla(84);
// yumruk: vuruşun belirli anı (combo 1 = sol düz, 2 = sağ düz, 3 = kroşe)
const yumruk = (k, frac) => posed(null, 60 + 1, () => ({}), (m, i) => { if (i === 60 - Math.round(frac * 22)) { m.combo = k - 1; m.punch(); } });
CAT['poz:yumruk-sol'] = yumruk(1, 0.45); CAT['poz:yumruk-sag'] = yumruk(2, 0.45); CAT['poz:krose'] = yumruk(3, 0.5); CAT['poz:gard'] = posed(null, 70, () => ({}), (m, i) => { if (i === 10) { m.combo = 1; m.punch(); } }); // vuruştan 1 sn sonra gard
// tırmanma (vault 0..1 evresi)
// tırmanma (mantle.js evreleri: vaultT bacak salınımı, mantleHang kollar yukarı)
// kenar: duvar yüzü kökün 0,3 m önünde; top = kenarın köke göre yüksekliği (asılı 1,95, çekiş ortası 1,2, aşarken 0,45)
const tirman = (u, h, top) => posed(null, 90, () => ({ vault: u }), (m) => { m.mantleHang = h; m.mantleEdge = { top, fx: 0, fz: 0.3, dx: 0, dz: 1 }; });
CAT['poz:tirman-tutun'] = tirman(0.001, 1, 1.86); CAT['poz:tirman-cek'] = tirman(0.12, 0.7, 1.2); CAT['poz:tirman-bacak'] = tirman(0.5, 0.25, 0.45);
// [C2] tüm ateşli silahlarda nişan tutuşu (tutus2:<silah>) ve boşta tutuş (tutus2:<silah>-bosta)
for (const w of WEAPON_ORDER) { const d = WEAPONS[w]; if (!d || (d.type !== 'gun' && d.type !== 'launcher')) continue; CAT['tutus2:' + w] = holding(w, { aim: true, twoHanded: !d.oneHand }); if (!d.oneHand) CAT['tutus2:' + w + '-bosta'] = holding(w, { twoHanded: true }); }
CAT['insan:kahraman-kadin'] = person(defaultLook('f'));
// [S2] karakter yaratıcısındaki her giyilebilir seçenek tek tek (gerçekçi gövdede): giysi:<cinsiyet>-<alan>-<değer>
{
  const W = (g, k, v, extra) => () => Object.assign(defaultLook(g), extra || {}, { [k]: v, [k + 'Style']: v });
  const add = (g, k, vals, extra) => { for (const v of vals) CAT[`giysi:${g}-${k}-${v}`] = person(W(g, k, v, extra)); };
  add('m', 'pants', ['jeans', 'chino', 'slacks', 'cargo', 'shorts', 'track']);
  add('f', 'pants', ['jeans', 'leggings', 'slacks', 'shorts', 'minishort', 'mini', 'skirt', 'midi', 'longskirt', 'track'], { top: 'tshirt', topStyle: 'tshirt' });
  add('m', 'top', ['tshirt', 'polo', 'shirt', 'tank', 'hoodie', 'track', 'sweater', 'jacket', 'leather', 'bomber', 'blazer', 'suit', 'coat']);
  add('m', 'shoes', ['sneaker', 'hightop', 'polished', 'loafer', 'boots', 'sandal']);
  add('f', 'shoes', ['sneaker', 'flats', 'heels', 'sandal', 'boots']);
  add('m', 'hat', ['cap', 'kasket', 'bere', 'fedora', 'panama', 'bandana']);
  add('f', 'hat', ['cap', 'bere', 'basortusu']);
  for (const v of ['glasses', 'aviator', 'readers']) { CAT['giysi:m-glasses-' + v] = person(() => Object.assign(defaultLook('m'), { glasses: true, glassesStyle: v })); CAT['giysi:f-glasses-' + v] = person(() => Object.assign(defaultLook('f'), { glasses: true, glassesStyle: v })); }
  for (const v of ['digital', 'steelwatch', 'goldwatch']) CAT['giysi:m-watch-' + v] = person(() => Object.assign(defaultLook('m'), { watch: v, top: 'tshirt', topStyle: 'tshirt' }));
  for (const v of ['chain', 'silverchain']) CAT['giysi:m-chain-' + v] = person(() => Object.assign(defaultLook('m'), { chain: true, chainStyle: v, chainColor: v === 'silverchain' ? '#cfd2d6' : '#d4af37', top: 'tshirt', topStyle: 'tshirt' }));
  for (const v of ['bag1', 'duffel']) CAT['giysi:m-bag-' + v] = person(() => Object.assign(defaultLook('m'), { bag: v }));
  for (const v of ['handbag', 'tote']) CAT['giysi:f-bag-' + v] = person(() => Object.assign(defaultLook('f'), { bag: v }));
  for (const v of ['stud', 'hoop']) CAT['giysi:f-earrings-' + v] = person(() => Object.assign(defaultLook('f'), { earrings: v }));
  CAT['giysi:m-tespih-var'] = person(() => Object.assign(defaultLook('m'), { tespih: true }));
}
CAT['insan:reis'] = person(REIS_LOOK);
CAT['insan:kenan'] = person(KENAN_LOOK);
CAT['insan:leyla'] = person(LEYLA_LOOK);
CAT['insan:cinali'] = person(ALI_LOOK);
const rng = new RNG(7);
for (const kind of ['civilian', 'police', 'gang', 'swat', 'army']) for (let i = 1; i <= 2; i++) CAT[`insan:${kind}${i}`] = person(randomLook(rng, kind));
// [araç] stüdyoda ilk açık renk kullanılır: siyah boyada yüzey, kavis ve kapı çizgisi okunmuyor
const acik = (cs) => cs.find((c) => { const k = new THREE.Color(c); return k.r + k.g + k.b > 0.35; }) || cs[0];
for (const t of Object.keys(CARS)) CAT['araba:' + t] = () => buildCarModel(t, acik(CARS[t].colors));
// [araç] uzak düzey (70 m ötesi) denetimi
for (const t of ['sedan', 'suv', 'gt', 'hatch']) CAT['uzak:' + t] = () => { const m = buildCarModel(t, acik(CARS[t].colors)); const L = m.userData.lod; L.near.visible = false; L.far.visible = true; L.wheels.forEach((w) => { w.visible = false; }); return m; };
for (const t of Object.keys(AIR_TYPES)) CAT['hava:' + t] = () => buildAircraftModel(t);
for (const t of Object.keys(BOAT_TYPES)) CAT['tekne:' + t] = () => buildBoatModel(t);
for (const w of WEAPON_ORDER) if (w !== 'fists') CAT['silah:' + w] = () => buildWeaponModel(w);

import { mhReady, setMH } from '../entities/charMH.js';
import { propsReady } from '../core/props.js';
// gerçekçi insan verisi (assets/mh) yüklenir; --eski ile kodla üretilen gövdeler görüntülenir
export const hazir = (eski) => (eski ? Promise.resolve(0) : propsReady()).then(() => mhReady()).then((ok) => { if (eski) setMH(false); return ok; });
export const liste = () => Object.keys(CAT);

// ---- Stüdyo ----
const V = (x, y, z) => new THREE.Vector3(x, y, z);
let R = null, scene, cam, key, fill, rim, holder, floor;
function studio() {
  if (R) return;
  const canvas = document.getElementById('c');
  R = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  R.setPixelRatio(1); R.setSize(canvas.width, canvas.height, false);
  R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.0;
  R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x9aa0a8);
  scene.environment = new THREE.PMREMGenerator(R).fromScene(new RoomEnvironment(), 0.04).texture;
  key = new THREE.DirectionalLight(0xfff2e0, 2.6); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  fill = new THREE.DirectionalLight(0xcfe0ff, 0.55); rim = new THREE.DirectionalLight(0xffffff, 1.1);
  floor = new THREE.Mesh(new THREE.CircleGeometry(400, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8f949b, roughness: 0.96, metalness: 0 }));
  floor.receiveShadow = true;
  holder = new THREE.Group();
  scene.add(key, key.target, fill, rim, floor, holder);
  cam = new THREE.PerspectiveCamera(28, canvas.width / canvas.height, 0.02, 2000);
}

// Görünüşler: q = ön-sol 3/4, f = ön, s = yan, b = arka 3/4, t = üst, yuz = yüz yakın planı (insanlar)
const DIRS = { ayak: [-0.8, 0.45, 1], q: [-0.75, 0.38, 1], f: [0, 0.12, 1], s: [1, 0.1, 0], b: [0.75, 0.38, -1], t: [0, 1, 0.001], yuz: [-0.35, 0.05, 1], el: [-0.6, 0.2, 1], silah: [0.5, 0.25, 1], silahust: [0.05, 1, 0.3], silahic: [-1, 0.15, 0.2] };

function place(id) {
  studio();
  holder.clear();
  const obj = CAT[id]();
  // Işık konisi, hale, gölge lekesi gibi yardımcı ağlar (eklemeli ya da neredeyse saydam) stüdyoda gizlenir:
  // hem görüntüyü kirletir hem sınır kutusunu şişirir (araç 14 m görünüyordu).
  const aux = (o) => { const m = Array.isArray(o.material) ? o.material[0] : o.material; return !m || m.blending === THREE.AdditiveBlending || (m.transparent && m.opacity < 0.35) || m.visible === false; };
  obj.traverse((o) => { if (o.isMesh) { if (aux(o)) o.visible = false; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  holder.add(obj); obj.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const fit = () => { box.makeEmpty(); obj.traverse((o) => { if (o.isMesh && o.visible) box.expandByObject(o, false); }); };
  fit();
  obj.position.y -= box.min.y; obj.updateMatrixWorld(true); fit(); // zemine oturt
  return { obj, box };
}

export function bilgi(id) {
  const { obj, box } = place(id);
  let tris = 0, meshes = 0; const mats = new Set();
  obj.traverse((o) => {
    if (!o.isMesh) return;
    meshes++; (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
    const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
  });
  const s = box.getSize(V(0, 0, 0));
  return { id, ucgen: Math.round(tris), ag: meshes, malzeme: mats.size, boyut: [+s.x.toFixed(2), +s.y.toFixed(2), +s.z.toFixed(2)], ...(window.__curl ? { kivrim: window.__curl.map((x) => +x.toFixed(2)) } : {}) };
}

// Kesit ölçüsü (m). Modelin ön ve yan siluetini dik izdüşümle çizer (2–5 mm/piksel) ve boyuna göre verilen yükseklik
// oranlarında yatay parçaların genişliğini okur: ör. göğüs hizasında [kol, gövde, kol], uylukta [bacak, bacak].
// "derinlik" yan siluetteki toplam genişliktir. Amaç: oranları gözle değil antropometri / araç ölçü tablosuyla denetlemek.
function siluet(box, yan) {
  const size = box.getSize(V(0, 0, 0)), c = box.getCenter(V(0, 0, 0)), N = 1024;
  const span = Math.max(yan ? size.z : size.x, size.y) * 1.08;
  const oc = new THREE.OrthographicCamera(-span / 2, span / 2, span / 2, -span / 2, 0.1, 400);
  oc.position.copy(c).add(yan ? V(100, 0, 0) : V(0, 0, 100)); oc.lookAt(c);
  const rt = new THREE.WebGLRenderTarget(N, N), buf = new Uint8Array(N * N * 4);
  const bg = scene.background; scene.background = new THREE.Color(0); scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff }); floor.visible = false;
  R.setRenderTarget(rt); R.render(scene, oc); R.readRenderTargetPixels(rt, 0, 0, N, N, buf); R.setRenderTarget(null);
  scene.background = bg; scene.overrideMaterial = null; floor.visible = true; rt.dispose();
  const px = span / N, y0 = c.y - span / 2;
  // y yüksekliğindeki satırda dolu parçalar: [genişlik (m), ...]
  return (y) => {
    const row = Math.max(0, Math.min(N - 1, Math.round((y - y0) / px))), seg = []; let run = 0;
    for (let x = 0; x <= N; x++) { const on = x < N && buf[(row * N + x) * 4] > 127; if (on) run++; else { if (run > 2) seg.push(+(run * px).toFixed(3)); run = 0; } }
    return seg;
  };
}
export function olcu(id, oranlar = [0.965, 0.87, 0.815, 0.74, 0.63, 0.53, 0.44, 0.285, 0.2, 0.06]) {
  const { box } = place(id);
  const on = siluet(box, false), yan = siluet(box, true), Hh = box.max.y - box.min.y;
  return { id, boy: +Hh.toFixed(3), dilim: oranlar.map((f) => ({ oran: f, y: +(f * Hh).toFixed(2), parcalar: on(box.min.y + f * Hh), derinlik: yan(box.min.y + f * Hh).reduce((t, w) => t + w, 0).toFixed(3) * 1 })) };
}

export function shot(id, view = 'q') {
  const { box } = place(id);
  const c = box.getCenter(V(0, 0, 0)), size = box.getSize(V(0, 0, 0));
  let r = size.length() / 2;
  if (view === 'yuz') { c.set(c.x, box.min.y + size.y * 0.925, c.z + size.z * 0.1); r = Math.max(0.2, size.y * 0.115); }
  if (view === 'ayak') { c.set(c.x, box.min.y + 0.09, c.z + 0.05); r = 0.24; } // [S2] ayakkabı yakın planı
  if (view === 'el') { c.set(box.min.x + size.x * 0.12, box.min.y + size.y * 0.47, c.z); r = Math.max(0.16, size.y * 0.1); }
  // silahlı kişide 'el': silahın etrafına odaklan (tutuş denetimi)
  if (view === 'el' || view.startsWith('silah')) { let wm = null; scene.traverse((o) => { if (o.userData && o.userData.weaponId) wm = o; }); if (wm) { const wb = new THREE.Box3().setFromObject(wm); wb.getCenter(c); r = Math.max(0.14, wb.getSize(V(0, 0, 0)).length() * 0.7); } }
  const d = V(...(DIRS[view] || DIRS.q)).normalize();
  const dist = r / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.06;
  cam.position.copy(c).addScaledVector(d, dist); cam.near = Math.max(0.02, dist - r * 3); cam.far = dist + r * 40; cam.updateProjectionMatrix(); cam.lookAt(c);
  const R0 = size.length() / 2;
  key.position.copy(c).add(V(-0.7, 1.25, 0.9).multiplyScalar(R0 * 3)); key.target.position.copy(c);
  const sc = key.shadow.camera; sc.left = sc.bottom = -R0 * 1.7; sc.right = sc.top = R0 * 1.7; sc.near = 0.1; sc.far = R0 * 12; sc.updateProjectionMatrix();
  fill.position.copy(c).add(V(1, 0.4, 0.6).multiplyScalar(R0 * 3)); rim.position.copy(c).add(V(0.4, 0.9, -1).multiplyScalar(R0 * 3));
  R.render(scene, cam);
  return R.domElement.toDataURL('image/jpeg', 0.9);
}

export function glb(id) {
  const { obj } = place(id);
  return new Promise((resolve, reject) => new GLTFExporter().parse(obj, (buf) => {
    const u8 = new Uint8Array(buf); let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    resolve(btoa(s));
  }, reject, { binary: true, onlyVisible: true, maxTextureSize: 1024 }));
}

// [araç] Oran denetimi: şablon verisinden (çizimden değil) ölçüleri okur ve sınıf hedef tablosuyla karşılaştırır.
// Tablo K2 görev metnindeki gerçek araç aralıklarıdır (m). Aralık dışı değerler '!' ile işaretlenir.
const ARAC_HEDEF = {
  hatch: { L: [4.0, 4.3], W: [1.75, 1.8], H: [1.45, 1.5], wb: [2.55, 2.65], td: [0.6, 0.64], tw: [0.195, 0.215] },
  sedan: { L: [4.6, 4.9], W: [1.82, 1.88], H: [1.42, 1.48], wb: [2.7, 2.85], td: [0.63, 0.68], tw: [0.205, 0.235] },
  station: { L: [4.7, 4.9], W: [1.82, 1.86], H: [1.46, 1.5], wb: [2.75, 2.85], td: [0.63, 0.68], tw: [0.205, 0.235] },
  coupe: { L: [4.4, 4.7], W: [1.85, 1.95], H: [1.25, 1.36], wb: [2.6, 2.75], td: [0.66, 0.7], tw: [0.245, 0.295] },
  suv: { L: [4.6, 4.9], W: [1.88, 1.95], H: [1.65, 1.75], wb: [2.7, 2.9], td: [0.72, 0.78], tw: [0.235, 0.265] },
  arazi: { L: [4.3, 4.7], W: [1.85, 1.95], H: [1.8, 1.9], wb: [2.5, 2.8], td: [0.78, 0.84], tw: [0.255, 0.285] },
  dolmus: { L: [5.4, 6.0], W: [1.95, 2.05], H: [2.3, 2.6], wb: [3.2, 3.7], td: [0.68, 0.72], tw: [0.205, 0.225] },
  otobus: { L: [11.5, 12.2], W: [2.5, 2.55], H: [3.0, 3.2], wb: [5.8, 6.2], td: [0.95, 1.0], tw: [0.275, 0.295] },
};
const ARAC_SINIF = { kartal: 'sedan', hatch3: 'hatch', hatch: 'hatch', taksi: 'sedan', estate: 'station', dolmus: 'dolmus', sedan: 'sedan', offroad: 'arazi', coupe: 'coupe', suv: 'suv', cabrio: 'coupe', gt: 'coupe', police: 'sedan', polsuv: 'suv', bus: 'otobus', cip: 'arazi' };
export function aracOlcu(id) {
  const t = id.replace('araba:', ''), def = CARS[t];
  const obj = CAT[id](), T = obj.userData.template, S = T && T.S;
  if (!S || !S.axles) return { id, not: 'şablon ölçüsü yok' };
  const r3 = (v) => +v.toFixed(3);
  const ax = S.axles, wx = Math.abs(T.wheels[0].x);
  const fender = S.hw(S.archY + S.archR * 0.3, ax[0]);
  const m = {
    L: S.L, W: S.W, H: S.H, wb: r3(ax[0] - ax[ax.length - 1]), iz: r3(T.track), td: r3(2 * S.r), tw: S.tw,
    onCik: r3(S.L / 2 - ax[0]), arkaCik: r3(S.L / 2 + ax[ax.length - 1]), yerden: r3(S.cl), kusak: r3(S.belt / S.H),
    tekerIc: r3(fender - (wx + S.tw / 2)), camIc: r3(S.W / 2 - S.hw(S.belt + 0.02, 0)),
  };
  let tris = 0, calls = 0;
  place(id).obj.traverse((o) => { if (!o.isMesh || !o.visible) return; let v = o; while (v) { if (!v.visible) return; v = v.parent; } calls++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; });
  const h = ARAC_HEDEF[ARAC_SINIF[t]], bad = [];
  if (h) for (const k in h) if (m[k] < h[k][0] - 1e-3 || m[k] > h[k][1] + 1e-3) bad.push(`${k}=${m[k]}∉[${h[k]}]`);
  if (h && Math.abs(m.iz - (m.W - 0.25)) > 0.06) bad.push(`iz≠W-0.25`);
  if (m.tekerIc < 0.01 || m.tekerIc > 0.03) bad.push(`tekerIc=${m.tekerIc}`);
  return { id, sinif: ARAC_SINIF[t] || '-', ...m, ucgen: Math.round(tris), cizim: calls, hata: bad.join(' ') };
}

// [tutuş] parmak ve avuç ağırlık merkezlerinin silahın kendi eksenlerindeki konumu (m). Silah: x kalınlık, y yukarı, z namlu; kabza orijinde.
export function tutusOlc(id) {
  const { obj } = place(id);
  obj.updateMatrixWorld(true);
  let mesh = null, wm = null; obj.traverse((o) => { if (o.isSkinnedMesh) mesh = o; if (o.userData && o.userData.weaponId) wm = o; });
  if (!mesh || !wm) return null;
  const B = mesh.skeleton.bones.map((b) => b.name), si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
  const inv = new THREE.Matrix4().copy(wm.matrixWorld).invert(), v = V(0, 0, 0), out = {};
  for (const bn of ['fdR', 'fiR', 'thR', 'wrR', 'fdL', 'wrL']) {
    const k = B.indexOf(bn); const acc = V(0, 0, 0); let n = 0;
    for (let i = 0; i < si.count; i++) {
      if (si.getX(i) !== k || sw.getX(i) < 0.6) continue;
      mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld).applyMatrix4(inv); acc.add(v); n++;
    }
    if (n) out[bn] = acc.divideScalar(n).toArray().map((x) => +x.toFixed(3));
  }
  if (id.startsWith('tutus:bicak') && out.fiR && out.fdR && out.thR) {
    // [B3] avuç merkezi = parmaklar (işaret, orta) ve başparmak ağırlık merkezlerinin ortası; sap ortası bıçak uzayında (0, 0, -0.007)
    const c = [0, 1, 2].map((j) => ((out.fiR[j] + out.fdR[j]) / 2 + out.thR[j]) / 2);
    out.avuc = c.map((x) => +x.toFixed(3)); out.sapAvuc = +Math.hypot(c[0], c[1], c[2] + 0.007).toFixed(4);
    // ağız (z > 0,058) bölgesine giren el köşesi sayısı (parmaklar ağzı kesmemeli)
    let kes = 0; const ks = new Set(['fdR', 'fiR', 'thR', 'wrR'].map((b) => B.indexOf(b)));
    for (let i = 0; i < si.count; i++) {
      if (!ks.has(si.getX(i)) || sw.getX(i) < 0.4) continue;
      mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld).applyMatrix4(inv);
      if (v.z > 0.058 && v.z < 0.235 && Math.abs(v.x) < 0.004 && v.y > -0.014 && v.y < 0.013) kes++;
    }
    out.agizKesisim = kes;
  }
  return out;
}

// [poz] kemik yükseklikleri (m): baş, kalça, diz, ayak; çömelme oranı = baş / ayakta baş
export function pozOlc(id) {
  const { obj } = place(id);
  obj.updateMatrixWorld(true);
  let mesh = null; obj.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  if (!mesh) return null;
  const out = {}, v = V(0, 0, 0);
  for (const b of mesh.skeleton.bones) if (/^(head|hips|knL|knR|anL|anR|wrL|wrR|shL|shR|chest)$/.test(b.name)) { b.getWorldPosition(v); out[b.name] = v.toArray().map((x) => +x.toFixed(3)); }
  return out;
}

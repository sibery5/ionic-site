// [hareket H1] Duvara tutunup aşma: 1,3–2,6 m duvarda Space → zıpla → kenara tutun → kendini çek → aş → öbür yana in.
// İnce duvarda öbür tarafa iner, kalın yapıda (konteyner, alçak dam) üstüne çıkar. 3 m ve üstü aşılamaz; noClimb reddedilir.
// [C2] istisna: askeri beton duvar (3,2 m) ve jiletli zincir çit (3 m) tırmanılır. Tutunma noktası telin altındaki duvar/çit
// üst kenarıdır; jiletli telden geçerken 15 can hasarı ve çekiş 1,5× yavaş. Üstünde durulamaz (fizik noClimb), hep öbür yana iner.
// Zaman çizelgesi oyuncu üzerinde tek nesnede tutulur (kare içinde bellek ayırma yok); yükseklik arttıkça çekiş uzar.
import * as THREE from 'three';

export const MANTLE_MIN = 1.25, MANTLE_MAX = 2.6, RAZOR_MAX = 3.25, RAZOR_DMG = 15;
// noClimb kutusunda tırmanılabilir üst kenar (dünya y) ya da null: askeri duvar betonu 3,2 m, jiletli çit gövdesi kutudan 0,6 m alçak
export function climbTop(b) {
  if (!b.noClimb) return b.y1;
  if (b.tag === 'milWall') return b.y0 + 3.2;
  if (b.tag === 'fence' && b.y1 - b.y0 > 2.4) return b.y1 - 0.6;
  return null;
}
const CHK = new THREE.Vector3(), PRE = new THREE.Vector3();
const sm = (u) => u * u * (3 - 2 * u);

// Önündeki duvarı dener; uygunsa pl.vault'a tırmanma zaman çizelgesini yazar ve true döner.
export function tryMantle(pl, dx, dz) {
  const g = pl.game, P = g.physics, p = pl.pos, r = pl.radius;
  const l = Math.hypot(dx, dz); if (l < 1e-3) return false;
  dx /= l; dz /= l;
  // göğüs hizasında yatay ışın: duvar yüzü ve normali (döndürülmüş kutularda da doğru)
  const h0 = P.raycastShared(p.x, p.y + 1.0, p.z, dx, 0, dz, r + 0.75);
  if (!h0 || typeof h0.box === 'string') return false;
  const b = h0.box, t0 = h0.t;
  let nx = h0.nx, nz = h0.nz; const nl = Math.hypot(nx, nz);
  if (nl < 0.5 || nx * dx + nz * dz > -0.5) return false; // duvara epey yan bakıyorsa tutunma yok
  nx /= nl; nz /= nl;
  const cTop = climbTop(b), razor = b.noClimb && cTop !== null;
  const top = (cTop === null ? b.y1 : cTop) - p.y;
  if (top <= MANTLE_MIN || b.y0 > p.y + 0.3) return false;
  if (b.noClimb && razor) pl.climbAttempt = { t: performance.now() / 1000, x: p.x, z: p.z, tag: b.tag }; // askeri alarm yine tetiklenir
  if (b.noClimb && !razor) {
    pl.climbAttempt = { t: performance.now() / 1000, x: p.x, z: p.z, tag: b.tag };
    const now = performance.now();
    if (!(pl._noClimbMsg > now)) { pl._noClimbMsg = now + 3000; g.ui && g.ui.notify && g.ui.notify('Bu duvara tırmanılamaz', 'warn'); }
    return false;
  }
  if (top > (razor ? RAZOR_MAX : MANTLE_MAX)) return false;
  // tırmanış yönü duvar normalinin tersi
  const cx = -nx, cz = -nz;
  const fx = p.x + dx * t0, fz = p.z + dz * t0; // yüzdeki temas noktası
  // kalınlık: duvarın üst kenarının hemen altından geri doğru ışın
  const far = 1.6;
  const h1 = P.raycastShared(fx + cx * far, b.y1 - 0.08, fz + cz * far, -cx, 0, -cz, far);
  const thick = h1 && h1.box === b ? far - h1.t : 9;
  // üst kenarda durma noktası ve baş boşluğu (üstte başka yapı varsa reddet)
  const onTop = Math.min(thick * 0.5, r + 0.25);
  let over = thick < 1.2, ex, ey, ez;
  const topY = p.y + top;
  if (!razor) { // jiletli yapının üstünde durulmaz: üst boşluk denetimi yok, yalnız öbür yana iniş
    PRE.set(fx + cx * onTop, topY + 0.05, fz + cz * onTop); CHK.copy(PRE);
    const rt = P.resolveCircle(CHK, Math.min(r, 0.25), topY + 0.05);
    if (PRE.distanceTo(CHK) > 0.06 || rt.support > topY + 0.3) return false;
  } else if (!over) return false;
  if (over) {
    PRE.set(fx + cx * (thick + r + 0.35), p.y, fz + cz * (thick + r + 0.35)); CHK.copy(PRE);
    const ro = P.resolveCircle(CHK, r, topY);
    if (PRE.distanceTo(CHK) > 0.06 || P.inWater(CHK.x, CHK.z) || ro.support < topY - 4.5 || ro.support > topY - 0.6) { over = false; if (razor) return false; }
    else { ex = CHK.x; ey = ro.support; ez = CHK.z; }
  }
  if (!over) {
    if (thick < 2 * r + 0.1) return false; // ne aşılır ne üstünde durulur
    PRE.set(fx + cx * (r + 0.3), topY, fz + cz * (r + 0.3)); CHK.copy(PRE);
    const ro = P.resolveCircle(CHK, r, topY + 0.05);
    if (PRE.distanceTo(CHK) > 0.06) return false;
    ex = CHK.x; ey = ro.support; ez = CHK.z;
  }
  // zaman çizelgesi: zıpla, tutun, çek, aş, in
  const hh = top;
  const tJ = 0.18 + 0.04 * hh, tH = 0.12 + 0.06 * hh, tP = Math.max(0.4, 0.22 * hh) * (razor ? 1.5 : 1), tO = (over ? 0.3 : 0.32) * (razor ? 1.5 : 1);
  const drop = over ? Math.max(0, topY + 0.1 - ey) : 0;
  const tD = over ? Math.sqrt(2 * drop / 20) + 0.14 : 0.18;
  const hangY = Math.max(p.y, topY - 1.86); // [C2] eller kenara yetişir (atölye: bilek 1,86 m)
  const wx = fx - cx * 0.3, wz = fz - cz * 0.3; // duvar önünde asılma noktası ([C2] gövde duvara yakın: göğüs yüzden ~0,15 m)
  const V = pl.vault = pl._mantleV || (pl._mantleV = { mantle: true });
  V.mantle = true; V.t = 0; V.over = over; V.razor = razor; V.cut = false; V.top = topY; V.dx = cx; V.dz = cz;
  V.sx = p.x; V.sy = p.y; V.sz = p.z; V.wx = wx; V.wz = wz; V.hy = hangY;
  V.ex = ex; V.ey = ey; V.ez = ez; V.fx = fx; V.fz = fz; // fx/fz: yüzdeki temas (eller kenarda, model.mantleEdge)
  V.ox = fx + cx * (over ? thick * 0.5 : r + 0.1); V.oz = fz + cz * (over ? thick * 0.5 : r + 0.1);
  V.t1 = tJ; V.t2 = tJ + tH; V.t3 = V.t2 + tP; V.t4 = V.t3 + tO; V.dur = V.t4 + tD;
  pl.crouch = false; pl.aiming = false;
  pl.heading = Math.atan2(cx, cz);
  pl.vx = pl.vz = pl.vy = 0;
  if (g.audio && g.audio.step) g.audio.step(p.x, p.z);
  return true;
}

// tırmanmanın bir karesi: konum zaman çizelgesinden; animasyon vaultT (bacak salınımı) ve model.mantleHang (kollar yukarı)
export function stepMantle(pl, V, dt) {
  V.t += dt;
  const t = V.t, p = pl.pos, m = pl.model;
  let hang = 0;
  if (t < V.t1) { // zıpla: duvar önüne, asılma yüksekliğine
    const u = sm(t / V.t1);
    p.x = V.sx + (V.wx - V.sx) * u; p.z = V.sz + (V.wz - V.sz) * u;
    p.y = V.sy + (V.hy - V.sy) * u + 0.25 * Math.sin(Math.PI * u);
    hang = u; pl.vaultT = 0.001;
  } else if (t < V.t2) { // tutun: kısa asılma, hafif sallanma
    p.x = V.wx; p.z = V.wz; p.y = V.hy - 0.04 * Math.sin(Math.PI * (t - V.t1) / (V.t2 - V.t1));
    hang = 1; pl.vaultT = 0.001;
  } else if (t < V.t3) { // çek: kalça üst kenara gelene dek yukarı, sonda kenara doğru
    const u = (t - V.t2) / (V.t3 - V.t2), e = sm(u);
    p.y = V.hy + (V.top - 0.55 - V.hy) * e;
    p.x = V.wx; p.z = V.wz;
    hang = 1 - 0.5 * u; pl.vaultT = 0.001 + 0.2 * u;
  } else if (t < V.t4) { // aş: bacaklar kenardan geçer, üstte duvarın ortasına
    if (V.razor && !V.cut) { // jiletli tel: bir kez hasar
      V.cut = true;
      if (pl.takeDamage && !pl.god) pl.takeDamage(RAZOR_DMG, null, 'fall');
      const ui = pl.game.ui; if (ui && ui.notify) ui.notify('Jiletli tel! Elin ve bacağın kesildi', 'warn');
    }
    const u = (t - V.t3) / (V.t4 - V.t3), e = sm(Math.max(0, (u - 0.3) / 0.7));
    p.x = V.wx + (V.ox - V.wx) * e; p.z = V.wz + (V.oz - V.wz) * e; // önce ayaklar kenara kalkar, sonra öne
    p.y = V.top - 0.55 + 0.62 * sm(Math.min(1, u / 0.45));
    hang = 0.5 * (1 - u); pl.vaultT = 0.2 + 0.6 * u;
  } else { // in: öbür yana düşüş ya da üstte doğrulma
    const u = Math.min(1, (t - V.t4) / (V.dur - V.t4));
    const eo = 1 - (1 - u) * (1 - u) * (1 - u); // önce dışarı, sonra düş (duvarın içinden geçmez)
    p.x = V.ox + (V.ex - V.ox) * eo; p.z = V.oz + (V.ez - V.oz) * eo;
    const y0 = V.top + 0.07;
    p.y = V.over ? y0 + (V.ey - y0) * u * u : y0 + (V.ey - y0) * sm(u);
    pl.vaultT = 0.8 + 0.2 * u;
  }
  if (m) { m.mantleHang = hang; m.mantleEdge = t < V.t4 ? V : null; }
  pl.vx = 0; pl.vz = 0; pl.vy = 0;
  if (t >= V.dur) {
    p.set(V.ex, V.ey, V.ez);
    pl.vault = null; pl.vaultT = 0; pl.grounded = true;
    if (m) { m.mantleHang = 0; m.mantleEdge = null; }
    if (V.over && V.top + 0.07 - V.ey > 1.2) pl.camDip = Math.min(0.3, (V.top - V.ey) * 0.08);
  }
}

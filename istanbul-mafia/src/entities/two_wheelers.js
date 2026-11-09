// İki tekerlekliler: şehir bisikleti ve naked motosiklet. Gerçekçi parçalar (boru şase, telli/döküm jant, zincir,
// çatal, gidon, sele, aynalar), direksiyon grubu, pedal krankı ve bacakları pedala bağlı (2 kemikli IK) sürücü.
// Kancalar: T.riderPose (araç yerel koordinatı; Vehicle.riderPose her kare güncellenir), T.animate(v, dt), T.decorate.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Parts, finishTemplate, colorize, bx, rbx, cyl, beam, darkMat, chromeMat, paintMat } from './vehicles.js';
import { CharacterModel, randomLook } from './character.js';
import { RNG } from '../core/util.js';
const riderRng = new RNG(4242);
const _gp = [new THREE.Vector3(), new THREE.Vector3()];

const tube = (B, a, b, r, hex) => B.d(beam(a[0], a[1], a[2], b[0], b[1], b[2], r * 2, r * 2, true), hex);
const ptube = (B, a, b, r) => B.p(beam(a[0], a[1], a[2], b[0], b[1], b[2], r * 2, r * 2, true));

// telli bisiklet tekerleği / döküm motosiklet jantı (X ekseni etrafında döner)
const wcache = new Map();
function spokeWheel(r, tireR, nSpoke, cast) {
  const key = `${r}|${tireR}|${nSpoke}|${cast}`;
  if (wcache.has(key)) return wcache.get(key);
  const P = [];
  const tire = new THREE.TorusGeometry(r - tireR, tireR, 8, 28); tire.rotateY(Math.PI / 2);
  P.push(colorize(tire, 0x121212));
  const rim = new THREE.TorusGeometry(r - tireR * 2.1, tireR * 0.45, 5, 28); rim.rotateY(Math.PI / 2);
  P.push(colorize(rim, cast ? 0x2a2a2a : 0xb8bcc0));
  const ri = r - tireR * 2.2;
  if (cast) {
    for (let i = 0; i < nSpoke; i++) {
      const a = (i / nSpoke) * Math.PI * 2;
      for (const d of [-0.12, 0.12]) P.push(colorize(beam(0, Math.cos(a + d) * 0.05, Math.sin(a + d) * 0.05, 0, Math.cos(a + d * 0.4) * ri, Math.sin(a + d * 0.4) * ri, 0.03, 0.022), 0x2a2a2a));
    }
    P.push(colorize(cyl(0.06, 0.06, 0.12, 12, 'x', 0, 0, 0), 0x8a8a8a));
  } else {
    // çapraz örgülü teller, iki flanş
    for (let i = 0; i < nSpoke; i++) {
      const a = (i / nSpoke) * Math.PI * 2, s = i % 2 ? 1 : -1, a2 = a + s * 0.35;
      P.push(colorize(beam(s * 0.025, Math.cos(a) * 0.025, Math.sin(a) * 0.025, s * 0.004, Math.cos(a2) * ri, Math.sin(a2) * ri, 0.004, 0.004, true), 0xc8c8c8));
    }
    P.push(colorize(cyl(0.018, 0.018, 0.1, 8, 'x', 0, 0, 0), 0x9a9a9a));
  }
  const g = mergeGeometries(P);
  wcache.set(key, g);
  return g;
}
// yerel Y ekseni boyunca birim silindir (bacak kemiği)
const limbGeo = (r0, r1, hex) => colorize(new THREE.CylinderGeometry(r1, r0, 1, 8).translate(0, 0.5, 0), hex);
const YAX = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _k = new THREE.Vector3();
function placeLimb(m, ax, ay, az, bx2, by, bz) {
  _d.set(bx2 - ax, by - ay, bz - az);
  const l = _d.length() || 1e-3;
  m.position.set(ax, ay, az); m.scale.set(1, l, 1);
  m.quaternion.setFromUnitVectors(YAX, _d.divideScalar(l));
}
// kalça H → ayak F, diz öne bakar (y-z düzleminde iki kemikli IK)
function legIK(leg, hx, hy, hz, fx, fy, fz, a, b) {
  let dy = fy - hy, dz = fz - hz; let d = Math.hypot(dy, dz);
  const mx = a + b - 0.005; if (d > mx) { dy *= mx / d; dz *= mx / d; d = mx; fy = hy + dy; fz = hz + dz; }
  const t = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - t * t));
  let py = -dz / d, pz = dy / d; if (pz < 0) { py = -py; pz = -pz; }
  const ky = hy + (dy / d) * t + py * h, kz = hz + (dz / d) * t + pz * h, kx = (hx + fx) / 2;
  placeLimb(leg.thigh, hx, hy, hz, kx, ky, kz);
  placeLimb(leg.shin, kx, ky, kz, fx, fy, fz);
  _k.set(kx, ky, kz);
}

// ---------------- bisiklet ----------------
function buildBike(def) {
  const B = new Parts();
  const r = 0.34, zf = 0.53, zr = -0.52;
  const BB = [0, 0.3, -0.06], ST = [0, 0.83, -0.22], HT1 = [0, 0.88, 0.37], HT0 = [0, 0.7, 0.41];
  // elmas şase (boyalı borular)
  ptube(B, ST, HT1, 0.018); ptube(B, BB, HT0, 0.022); ptube(B, BB, ST, 0.019); ptube(B, HT0, HT1, 0.024);
  for (const s of [1, -1]) { ptube(B, ST, [s * 0.055, r, zr], 0.011); ptube(B, BB, [s * 0.055, r, zr], 0.012); }
  // sele borusu + sele, arka bagaj, çamurluk, sehpa
  B.c(cyl(0.013, 0.013, 0.16, 8, 'y', 0, 0.9, -0.235));
  // sele: arkası geniş, buruna doğru daralan üç kademe + çelik raylar
  B.d(rbx(0.17, 0.055, 0.12, 0.026, 0, 0.995, -0.3), 0x1a1a1a);
  B.d(rbx(0.12, 0.05, 0.1, 0.022, 0, 0.99, -0.2), 0x1a1a1a);
  B.d(rbx(0.055, 0.042, 0.1, 0.016, 0, 0.985, -0.12), 0x1a1a1a);
  for (const s of [1, -1]) tube(B, [s * 0.03, 0.96, -0.33], [s * 0.02, 0.965, -0.1], 0.004, 0x9a9a9a);
  for (const s of [1, -1]) tube(B, [s * 0.06, 0.82, -0.3], [s * 0.06, r, zr], 0.006, 0x222222);
  B.d(bx(0.14, 0.012, 0.34, 0, 0.82, -0.47), 0x222222);
  const fenR = new THREE.TorusGeometry(r + 0.03, 0.025, 4, 16, Math.PI * 0.8); fenR.rotateY(Math.PI / 2); fenR.rotateX(0.3); fenR.translate(0, r, zr);
  B.d(fenR, 0x2a2a2a);
  tube(B, [0.05, 0.28, -0.12], [0.08, 0.04, -0.3], 0.008, 0x333333);
  // aktarma: aynakol dişlisi, arka dişli, zincir (sağ taraf = -x)
  const cr = new THREE.TorusGeometry(0.1, 0.008, 4, 24); cr.rotateY(Math.PI / 2); cr.translate(-0.07, BB[1], BB[2]); B.c(cr);
  B.c(cyl(0.04, 0.04, 0.02, 12, 'x', -0.06, r, zr));
  {
    const cx = -0.068, A = [BB[1], BB[2], 0.104], Cg = [r, zr, 0.044], pts = [];
    // yz düzleminde: u = aynakoldan dişliye, n = ona dik (üst taraf); θ=0 -> +n, π/2 -> +u
    let uy = Cg[0] - A[0], uz = Cg[1] - A[1]; const ul = Math.hypot(uy, uz); uy /= ul; uz /= ul;
    let ny = -uz, nz = uy; if (ny < 0) { ny = -ny; nz = -nz; }
    const at = (c, rad, th) => [c[0] + (Math.cos(th) * ny + Math.sin(th) * uy) * rad, c[1] + (Math.cos(th) * nz + Math.sin(th) * uz) * rad];
    for (let i = 0; i <= 8; i++) pts.push(at(Cg, Cg[2], (Math.PI * i) / 8)); // dişlinin arkası (üstten alta)
    for (let i = 0; i <= 14; i++) pts.push(at(A, A[2], Math.PI + (Math.PI * i) / 14)); // aynakolun önü (alttan üste)
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; tube(B, [cx, a[0], a[1]], [cx, b[0], b[1]], 0.0045, 0x2e2e2e); }
  }
  B.d(cyl(0.028, 0.028, 0.12, 10, 'x', 0, BB[1], BB[2]), 0x333333);
  const T = { S: { st: 'bike', L: def.len, W: def.wid, H: def.hei }, decals: [], extras: [], plates: [], siren: false, wheelR: r, moto: true, bike: true, matte: false };
  // ışıklar: ön far (gidonda değil, çatal tacında; direksiyonla dönmez – küçük), arka reflektör
  B.l(cyl(0.035, 0.035, 0.03, 10, 'z', 0, 0.82, 0.47), 0xdfe6ea, 0xfff2d8, 0);
  B.l(rbx(0.06, 0.03, 0.02, 0.008, 0, 0.8, -0.65), 0x5a0808, 0xff1a0a, 1);
  T.wheelGeo = spokeWheel(r, 0.018, 32, false);
  T.wheels = [{ x: 0, z: zf, front: true, side: 1 }, { x: 0, z: zr, front: false, side: 1 }];
  T.wheelbase = zf - zr;
  T.driver = [0, 0, 0];
  T.seats = [{ x: 0, y: 1.0, z: -0.25 }];
  T.pool = { w: 1.6, d: 5, z: 3 };
  T.riderPose = { seat: [0, 1.0, -0.25], grips: [[0.27, 1.02, 0.31], [-0.27, 1.02, 0.31]], pedals: [[0.12, 0.3, -0.06], [-0.12, 0.3, -0.06]], crank: 0, lean: 0, steer: 0, crouch: 0.3 };
  T.dummyGeo = new THREE.BufferGeometry(); // sürücü: gerçek karakter modeli (T.animate), kaba gövde yok
  finishTemplate(T, B);
  // direksiyon grubu (çatal + gidon + sepet) ve krank grubu
  const SG = new Parts();
  for (const s of [1, -1]) SG.c(beam(s * 0.045, 0.7 - 0.88, 0.41 - 0.37, s * 0.05, r - 0.88, zf - 0.37, 0.022, 0.022, true));
  SG.c(cyl(0.014, 0.014, 0.12, 8, 'y', 0, 0.06, 0));
  SG.c(beam(0, 0.12, 0, 0, 0.13, -0.06, 0.03, 0.03, true));
  SG.c(beam(-0.27, 0.14, -0.06, 0.27, 0.14, -0.06, 0.022, 0.022, true));
  for (const s of [1, -1]) SG.d(cyl(0.017, 0.017, 0.11, 8, 'x', s * 0.24, 0.14, -0.06), 0x111111);
  for (const s of [1, -1]) { SG.c(beam(s * 0.17, 0.15, -0.05, s * 0.22, 0.13, 0.03, 0.012, 0.006, true)); SG.d(beam(s * 0.16, 0.14, -0.05, s * 0.06, 0.02, 0.02, 0.006, 0.006, true), 0x111111); }
  SG.d(bx(0.3, 0.2, 0.22, 0, 0.02, 0.2), 0x6a4a2a); // hasır sepet
  const fenF = new THREE.TorusGeometry(r + 0.03, 0.025, 4, 14, Math.PI * 0.6); fenF.rotateY(Math.PI / 2); fenF.rotateX(-Math.PI * 0.05); fenF.translate(0, r - 0.88, zf - 0.37);
  SG.d(fenF, 0x2a2a2a);
  finishTemplate(SG, SG);
  const CG = new Parts();
  for (const s of [1, -1]) {
    CG.c(beam(s * 0.085, 0, 0, s * 0.085, 0.17 * s, 0, 0.022, 0.012, true));
    CG.d(rbx(0.1, 0.022, 0.07, 0.008, s * 0.13, 0.17 * s, 0), 0x111111);
  }
  finishTemplate(CG, CG);
  T.decorate = (root, chassis, ud) => {
    const sg = new THREE.Group(); sg.position.set(HT1[0], HT1[1], HT1[2]); chassis.add(sg);
    if (SG.paint) sg.add(new THREE.Mesh(SG.paint, ud.bodyMesh.material));
    if (SG.dark) sg.add(new THREE.Mesh(SG.dark, darkMat));
    if (SG.chrome) sg.add(new THREE.Mesh(SG.chrome, chromeMat));
    const cg = new THREE.Group(); cg.position.set(BB[0], BB[1], BB[2]); chassis.add(cg);
    cg.add(new THREE.Mesh(CG.chrome, chromeMat)); cg.add(new THREE.Mesh(CG.dark, darkMat));
    ud.steerGrp = sg; ud.crankGrp = cg; ud.legs = makeLegs(chassis);
  };
  T.animate = (v, dt) => {
    const ud = v.mesh.userData, rp = v.riderPose;
    ud.steerGrp.rotation.y = v.steerAng * 0.9;
    // pedal krankı: katedilen yoldan (tekerlek dönüşü × 0.42 vites oranı); kare başına birden çok çağrıya karşı sağlam
    const dpos = ud.lpx === undefined ? 0 : Math.hypot(v.pos.x - ud.lpx, v.pos.z - ud.lpz); ud.lpx = v.pos.x; ud.lpz = v.pos.z;
    if (v.controls.throttle > 0 && (v.driver || (v.ai && !v.ai.empty))) v.crank = (v.crank || 0) + (dpos < 1.5 ? dpos / r : 0) * 0.42 + (dpos < 1e-4 ? 0.34 * dt : 0);
    ud.crankGrp.rotation.x = -(v.crank || 0);
    const drv = v.driver && v.driver.model ? v.driver : null;
    const vis = !!drv || !!(v.ai && !v.ai.empty);
    for (const L of ud.legs) { L.thigh.visible = L.shin.visible = false; }
    rp.crank = v.crank || 0; rp.lean = v.lean; rp.steer = v.steerAng;
    const c = v.crank || 0;
    for (let i = 0; i < 2; i++) {
      const a = c + i * Math.PI;
      rp.pedals[i][1] = BB[1] + Math.sin(-a) * 0.17; rp.pedals[i][2] = BB[2] + Math.cos(-a) * 0.17;
    }
    if (ud.rider) ud.rider.root.visible = vis;
    if (!vis) return;
    // sürücü: oyuncu/NPC'nin kendi görünüşü (trafik bisikletinde rastgele sivil); pedal krankı hızla senkron
    const look = drv ? drv.model.look : (ud.aiLook || (ud.aiLook = randomLook(riderRng, 'civilian')));
    if (!ud.rider) { ud.rider = new CharacterModel(look); v.mesh.userData.chassis.add(ud.rider.root); ud.riderLook = look; }
    else if (ud.riderLook !== look) { ud.rider.setLook(look); ud.riderLook = look; }
    v.mesh.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) ud.steerGrp.localToWorld(_gp[i].set(i ? -0.25 : 0.25, 0.14, -0.06));
    const R = ud.rideSt || (ud.rideSt = { speed: 0, ride: { seat: [0, 1.0, -0.25], pedals: rp.pedals, grips: _gp, crank: 0, steer: 0, lean: 0, speed: 0 } });
    R.ride.crank = c; R.ride.steer = v.steerAng; R.ride.lean = v.lean; R.ride.speed = Math.abs(v.fs || 0);
    ud.rider.animate(dt, R);
  };
  return T;
}
function makeLegs(chassis) {
  const thighG = limbGeo(0.075, 0.06, 0x2a3242), shinG = limbGeo(0.055, 0.045, 0x2a3242);
  const legs = [];
  for (let i = 0; i < 2; i++) {
    const thigh = new THREE.Mesh(thighG, darkMat), shin = new THREE.Mesh(shinG, darkMat);
    thigh.visible = shin.visible = false; chassis.add(thigh, shin);
    legs.push({ thigh, shin });
  }
  return legs;
}
// sürücü gövdesi (bacaklar ayrı): bisiklette dik, motosiklette öne eğik + kask
function riderTorso(moto) {
  const P = [];
  const hip = moto ? [0, 0.94, -0.28] : [0, 1.04, -0.24], sh = moto ? [0, 1.38, 0.02] : [0, 1.52, -0.08];
  const head = moto ? [0, 1.55, 0.12] : [0, 1.7, -0.02];
  const grip = moto ? [0.3, 1.04, 0.44] : [0.25, 1.02, 0.3];
  P.push(colorize(beam(hip[0], hip[1], hip[2], sh[0], sh[1], sh[2], 0.34, 0.22, true), moto ? 0x1a1a1a : 0x8a2a2a));
  P.push(colorize(rbx(0.3, 0.16, 0.2, 0.06, 0, hip[1], hip[2]), 0x2a3242));
  for (const s of [1, -1]) {
    const el = [s * 0.24, (sh[1] + grip[1]) / 2 + 0.02, (sh[2] + grip[2]) / 2 - 0.02];
    P.push(colorize(beam(s * 0.17, sh[1] - 0.03, sh[2], el[0], el[1], el[2], 0.09, 0.09, true), moto ? 0x1a1a1a : 0x8a2a2a));
    P.push(colorize(beam(el[0], el[1], el[2], s * grip[0], grip[1], grip[2], 0.075, 0.075, true), moto ? 0x1a1a1a : 0xc99572));
  }
  if (moto) {
    P.push(colorize(new THREE.SphereGeometry(0.15, 14, 10).translate(head[0], head[1], head[2]), 0xc81010));
    P.push(colorize(rbx(0.2, 0.08, 0.06, 0.03, 0, head[1] - 0.01, head[2] + 0.13), 0x101010));
    // motosiklette bacaklar sabit (basamakta)
    for (const s of [1, -1]) {
      const kn = [s * 0.19, 0.78, 0.0], ft = [s * 0.2, 0.47, -0.22];
      P.push(colorize(beam(s * 0.1, hip[1], hip[2], kn[0], kn[1], kn[2], 0.13, 0.13, true), 0x1a1a24));
      P.push(colorize(beam(kn[0], kn[1], kn[2], ft[0], ft[1], ft[2], 0.1, 0.1, true), 0x1a1a24));
      P.push(colorize(rbx(0.09, 0.08, 0.22, 0.03, ft[0], ft[1] - 0.02, ft[2] + 0.06), 0x0a0a0a));
    }
  } else {
    P.push(colorize(new THREE.SphereGeometry(0.115, 12, 10).translate(head[0], head[1], head[2]), 0xc99572));
    P.push(colorize(new THREE.SphereGeometry(0.125, 12, 6, 0, Math.PI * 2, 0, 1.3).translate(head[0], head[1] + 0.03, head[2]), 0x2a1a10));
  }
  return mergeGeometries(P);
}

// ---------------- motosiklet ----------------
function buildMoto(def) {
  const B = new Parts();
  const r = 0.31, zf = 0.7, zr = -0.68;
  const HEAD = [0, 0.98, 0.5], PIV = [0, 0.5, -0.17];
  // çift kiriş şase + arka alt şase
  for (const s of [1, -1]) {
    tube(B, [s * 0.05, HEAD[1], HEAD[2] - 0.02], [s * 0.13, 0.78, 0.05], 0.035, 0x2a2a2a);
    tube(B, [s * 0.13, 0.78, 0.05], [s * 0.12, PIV[1], PIV[2]], 0.035, 0x2a2a2a);
    tube(B, [s * 0.1, 0.8, -0.1], [s * 0.08, 0.86, -0.62], 0.015, 0x2a2a2a);
    // salıncak
    tube(B, [s * 0.11, PIV[1], PIV[2]], [s * 0.1, r, zr], 0.03, 0x1a1a1a);
    // basamaklar
    B.d(cyl(0.015, 0.015, 0.1, 6, 'x', s * 0.21, 0.45, -0.22), 0x8a8a8a);
    B.d(cyl(0.013, 0.013, 0.08, 6, 'x', s * 0.19, 0.55, -0.52), 0x8a8a8a);
  }
  // arka amortisör (görünür yay)
  tube(B, [0, 0.82, -0.12], [0, 0.45, -0.38], 0.02, 0x9a9a9a);
  for (let i = 0; i < 6; i++) { const t = 0.15 + i * 0.13; const y = 0.82 + (0.45 - 0.82) * t, z = -0.12 + (-0.38 + 0.12) * t; B.d(new THREE.TorusGeometry(0.04, 0.008, 4, 10).rotateX(Math.PI / 2 - 0.6).translate(0, y, z), 0xc0a010); }
  // depo, sele, kuyruk, yan kapaklar, motor altı spoiler
  B.p(rbx(0.32, 0.24, 0.5, 0.11, 0, 0.98, 0.18));
  B.p(rbx(0.26, 0.1, 0.3, 0.06, 0, 1.05, 0.25));
  B.d(rbx(0.27, 0.08, 0.45, 0.04, 0, 0.9, -0.3), 0x121212);
  B.d(rbx(0.22, 0.07, 0.22, 0.03, 0, 0.95, -0.58), 0x121212);
  B.p(beam(0, 0.86, -0.4, 0, 0.98, -0.82, 0.22, 0.12, false));
  for (const s of [1, -1]) B.p(rbx(0.04, 0.2, 0.3, 0.02, s * 0.15, 0.83, -0.08));
  B.p(rbx(0.3, 0.12, 0.42, 0.05, 0, 0.3, 0.12));
  // motor: blok + silindirler (soğutma kanatları) + radyatör + karter
  B.d(rbx(0.34, 0.22, 0.34, 0.04, 0, 0.47, 0.06), 0x2a2a2a);
  for (let i = 0; i < 4; i++) B.d(bx(0.32, 0.018, 0.2, 0, 0.6 + i * 0.035, 0.14 + i * 0.012), 0x3a3a3a);
  B.c(rbx(0.3, 0.06, 0.2, 0.02, 0, 0.75, 0.19));
  B.d(rbx(0.34, 0.26, 0.04, 0.015, 0, 0.66, 0.37), 0x111111);
  B.c(cyl(0.09, 0.09, 0.05, 14, 'x', 0.17, 0.44, 0.06));
  // egzoz: dört kolektör → altta toplanma → sağda yükselen susturucu
  for (let i = 0; i < 4; i++) { const x = -0.12 + i * 0.08; tube(B, [x, 0.6, 0.3], [x * 0.5, 0.3, 0.25], 0.018, 0xb8a080); }
  B.c(beam(0, 0.28, 0.2, -0.13, 0.32, -0.25, 0.07, 0.07, true));
  B.c(beam(-0.13, 0.32, -0.25, -0.18, 0.55, -0.62, 0.11, 0.11, true));
  B.d(cyl(0.04, 0.035, 0.04, 10, 'z', -0.18, 0.56, -0.66), 0x111111);
  // zincir + dişliler (sol taraf +x)
  B.c(cyl(0.05, 0.05, 0.02, 12, 'x', 0.15, 0.42, -0.05));
  B.c(cyl(0.12, 0.12, 0.015, 18, 'x', 0.14, r, zr));
  for (const [ya, yb] of [[0.47, r + 0.12], [0.37, r - 0.12]]) tube(B, [0.15, ya, -0.05], [0.14, yb, zr], 0.008, 0x3a3a3a);
  // arka çamurluk + plaka tutucu, arka fren diski
  B.d(beam(0, 0.88, -0.8, 0, 0.7, -0.92, 0.18, 0.02, false), 0x151515);
  B.c(cyl(0.11, 0.11, 0.01, 18, 'x', -0.08, r, zr));
  // ışıklar (stop, sinyaller)
  B.l(rbx(0.14, 0.05, 0.04, 0.015, 0, 0.94, -0.84), 0x5a0808, 0xff1a0a, 1);
  for (const s of [1, -1]) B.l(rbx(0.05, 0.035, 0.06, 0.012, s * 0.13, 0.86, -0.86), 0xb06a10, 0xff8a10, s > 0 ? 3 : 4);
  const T = { S: { st: 'moto', L: def.len, W: def.wid, H: def.hei }, decals: [], extras: [], plates: [[0, 0.74, -0.93, true]], plateSlot: [0, 103], plateSize: [0.24, 0.12], siren: false, wheelR: r, moto: true };
  T.wheelGeo = spokeWheel(r, 0.062, 5, true);
  T.wheels = [{ x: 0, z: zf, front: true, side: 1 }, { x: 0, z: zr, front: false, side: 1 }];
  T.wheelbase = zf - zr;
  T.driver = [0, 0, 0];
  T.seats = [{ x: 0, y: 0.92, z: -0.3 }, { x: 0, y: 0.97, z: -0.6 }];
  T.pool = { w: 2.5, d: 8, z: 4.5 };
  T.riderPose = { seat: [0, 0.92, -0.3], grips: [[0.3, 1.04, 0.44], [-0.3, 1.04, 0.44]], pegs: [[0.21, 0.45, -0.22], [-0.21, 0.45, -0.22]], lean: 0, steer: 0, crouch: 0.65 };
  T.dummyGeo = riderTorso(true);
  finishTemplate(T, B);
  // direksiyon grubu: ters çatal, üst tabla, gidon (clip-on), far, ayna, ön çamurluk, ön fren diskleri
  const SG = new Parts();
  const fx = (y, z) => [y - HEAD[1], z - HEAD[2]];
  for (const s of [1, -1]) {
    const a = fx(1.0, 0.48), b = fx(r, zf);
    SG.d(beam(s * 0.1, a[0], a[1], s * 0.1, a[0] + (b[0] - a[0]) * 0.55, a[1] + (b[1] - a[1]) * 0.55, 0.055, 0.055, true), 0xc8a030);
    SG.c(beam(s * 0.1, a[0] + (b[0] - a[0]) * 0.5, a[1] + (b[1] - a[1]) * 0.5, s * 0.1, b[0], b[1], 0.04, 0.04, true));
    SG.c(cyl(0.15, 0.15, 0.008, 20, 'x', s * 0.075, b[0], b[1]));
    SG.d(rbx(0.04, 0.1, 0.08, 0.015, s * 0.085, b[0] + 0.1, b[1] - 0.08), 0xc01010);
    SG.d(beam(s * 0.12, 0.04, -0.04, s * 0.32, 0.06, -0.08, 0.035, 0.035, true), 0x151515);
    SG.d(cyl(0.02, 0.02, 0.12, 8, 'x', s * 0.3, 0.06, -0.08), 0x0a0a0a);
    SG.d(beam(s * 0.24, 0.07, -0.04, s * 0.3, 0.27, -0.06, 0.012, 0.012, true), 0x111111);
    SG.c(cyl(0.05, 0.05, 0.014, 10, 'z', s * 0.3, 0.29, -0.065));
  }
  SG.d(rbx(0.28, 0.04, 0.12, 0.015, 0, 0.03, -0.02), 0x2a2a2a);
  const ff = fx(r + 0.1, zf + 0.02);
  SG.p(rbx(0.15, 0.03, 0.5, 0.012, 0, ff[0], ff[1]));
  SG.d(cyl(0.1, 0.1, 0.12, 14, 'z', 0, 0.0, 0.18), 0x1a1a1a);
  SG.c(cyl(0.105, 0.105, 0.02, 14, 'z', 0, 0.0, 0.245));
  SG.l(cyl(0.085, 0.085, 0.02, 14, 'z', 0, 0.0, 0.255), 0xdfe6ea, 0xfff2d8, 0);
  for (const s of [1, -1]) SG.l(rbx(0.05, 0.035, 0.05, 0.012, s * 0.15, -0.05, 0.16), 0xb06a10, 0xff8a10, s > 0 ? 3 : 4);
  SG.p(rbx(0.24, 0.16, 0.06, 0.03, 0, 0.12, 0.2));
  SG.gl(beam(0, 0.18, 0.2, 0, 0.32, 0.12, 0.22, 0.01, false));
  finishTemplate(SG, SG);
  T.decorate = (root, chassis, ud) => {
    const sg = new THREE.Group(); sg.position.set(HEAD[0], HEAD[1], HEAD[2]); sg.rotation.x = 0; chassis.add(sg);
    sg.add(new THREE.Mesh(SG.paint, ud.bodyMesh.material));
    sg.add(new THREE.Mesh(SG.dark, darkMat)); sg.add(new THREE.Mesh(SG.chrome, chromeMat));
    sg.add(new THREE.Mesh(SG.lights, ud.lightsMat));
    ud.steerGrp = sg;
  };
  T.animate = (v) => {
    const ud = v.mesh.userData;
    ud.steerGrp.rotation.y = v.steerAng * 0.85;
    v.riderPose.lean = v.lean; v.riderPose.steer = v.steerAng;
  };
  return T;
}

export const BIKE_BUILDERS = { moto: buildMoto, bike: buildBike };
void paintMat;

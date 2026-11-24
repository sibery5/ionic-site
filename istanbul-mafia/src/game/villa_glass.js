// [V3] Villa camları: kırılır. İlk isabette mermi deliği + çatlak ağı, ikinci isabette cam dökülür (parçalar yere saçılır,
// kırılma sesi, cam tozu); çerçevede kırık kenar dişleri kalır. Mermi cam yüzünden geçer (içeriden dışarı, dışarıdan içeri):
// cam panelleri mermi ışınında engel sayılmaz, yalnız hareketi (çarpışma kutusu) keser. Kırık camlar oturum boyunca kırık kalır.
// Efekt havuzları savaşın araç camı sisteminden (glassfx.js: çatlak dokuları, parça havuzu, cam tozu); sesler önceden örneklenmiş
// araç camı sesleri (glassCrack / glassBreak). Dışarıdan: güney cephesine gelen mermi dünyada çatlak bırakır ve aynı konumdaki iç camı
// (iç mekân güney duvarı dünyada cepheyle çakışır) çatlatır/kırar.
import * as THREE from 'three';
import { audio } from '../core/audio.js';

const UNIT = new THREE.BoxGeometry(1, 1, 1); UNIT.userData.shared = true;
let MAT = null, RIM = null;
const _o = new THREE.Vector3(), _n = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);
// mermi ışınları camı engel saymaz (ve teras korkuluğunun üstünden ateş edilir)
export const BULLET_SKIP = (b) => !b.pane && b.tag !== 'villaRail';
const PANE_LIVE = (b) => !!b.pane && b.pane.hits < 2;

export class VillaGlass {
  constructor(game) {
    this.g = game;
    this.panes = [];
    this.stats = { cracks: 0, shatters: 0, outside: 0 };
  }
  mat() {
    if (!MAT) {
      MAT = new THREE.MeshStandardMaterial({ color: 0xdfeef4, transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.3, depthWrite: false });
      RIM = new THREE.MeshStandardMaterial({ color: 0xcfe4ea, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.5, side: THREE.DoubleSide, depthWrite: false });
    }
    return MAT;
  }

  // İç mekân kurulumunda dış duvar camı: (w, h, d) boyut, (x, y, z) taban merkezi, floor: bulunduğu katın zemini
  pane(ctx, w, h, d, x, y, z, floor) {
    const mesh = new THREE.Mesh(UNIT, this.mat());
    mesh.scale.set(w, h, d); mesh.position.set(x, y + h / 2, z); mesh.renderOrder = 2;
    ctx.scene.add(mesh);
    const box = ctx.cols.add(x - w / 2, z - d / 2, x + w / 2, z + d / 2, y, y + h, 'glass');
    const P = { mesh, box, w, h, d, x, y, z, floor, thinX: w < d, hits: 0, decals: [], rim: null, ctx };
    box.pane = P;
    this.panes.push(P);
    return P;
  }

  // Mermi ışını (etkin sahnenin çerçevesinde): maxT'ye kadar geçtiği camları çatlatır/kırar (en çok 3 cam)
  ray(o, d, maxT) {
    const g = this.g;
    if (!this.panes.length || !g.player || !g.player.inInterior || !g.player.inInterior.worldOff) return;
    const ph = g.physics;
    let t0 = 0;
    for (let k = 0; k < 3 && t0 < maxT; k++) {
      const r = ph.raycastShared(o.x + d.x * t0, o.y + d.y * t0, o.z + d.z * t0, d.x, d.y, d.z, maxT - t0, PANE_LIVE);
      if (!r || !r.box || !r.box.pane) break;
      t0 += r.t;
      _o.set(o.x + d.x * t0, o.y + d.y * t0, o.z + d.z * t0);
      this.hit(r.box.pane, _o, d);
      t0 += 0.06;
    }
  }

  // cama isabet (p: iç mekân çerçevesinde nokta, d: mermi yönü). fx=false: yalnız durum (dışarıdan gelen, iç sahne çizilmiyor)
  hit(P, p, d, fx = true) {
    const gf = this.g.combat && this.g.combat.glass;
    P.hits++;
    if (P.thinX) _n.set(-Math.sign(d.x) || 1, 0, 0); else _n.set(0, 0, -Math.sign(d.z) || 1);
    if (fx && gf) gf.impactPuff(p, _n);
    if (P.hits === 1) {
      this.stats.cracks++;
      if (gf) this.crackDecal(P, p, gf);
      if (fx) audio.glassCrack && audio.glassCrack(p.x, p.z, 0.8);
    } else if (P.hits === 2) {
      this.stats.shatters++;
      this.shatter(P, fx, gf);
      if (fx) audio.glassBreak && audio.glassBreak(p.x, p.z, 1);
    }
  }

  crackDecal(P, p, gf) {
    const m = new THREE.Mesh(gf.decalGeo, gf.decalMats[2]);
    const sz = 0.55 + Math.random() * 0.25;
    m.scale.set(sz, sz, 1); m.renderOrder = 3;
    // cam düzleminde, isabet noktasında; paneli aşmasın
    const hx = P.thinX ? P.x : Math.max(P.x - P.w / 2 + 0.2, Math.min(P.x + P.w / 2 - 0.2, p.x));
    const hz = P.thinX ? Math.max(P.z - P.d / 2 + 0.2, Math.min(P.z + P.d / 2 - 0.2, p.z)) : P.z;
    m.position.set(hx, Math.max(P.y + 0.2, Math.min(P.y + P.h - 0.2, p.y)), hz);
    m.quaternion.setFromUnitVectors(_z, P.thinX ? _n.set(1, 0, 0) : _n.set(0, 0, 1));
    m.rotateZ(Math.random() * 6.28);
    P.ctx.scene.add(m); P.decals.push(m);
  }

  // dökülme: panel gizlenir, çerçevede kırık kenar dişleri kalır, parçalar iki yana saçılır
  shatter(P, fx, gf) {
    P.mesh.visible = false;
    for (const m of P.decals) m.parent && m.parent.remove(m);
    P.decals.length = 0;
    P.rim = rimMesh(P); P.ctx.scene.add(P.rim);
    if (!fx || !gf) return;
    const n = Math.min(60, Math.round((P.thinX ? P.d : P.w) * P.h * 9));
    for (let k = 0; k < n; k++) {
      const u = Math.random() - 0.5, v = Math.random();
      const x = P.thinX ? P.x : P.x + u * P.w, z = P.thinX ? P.z + u * P.d : P.z, y = P.y + v * P.h;
      const out = (Math.random() < 0.55 ? 1 : -1) * (0.3 + Math.random() * 1.4);
      const sz = 0.012 + Math.random() * 0.03;
      gf.shards.emit(x, y, z, P.thinX ? out : (Math.random() - 0.5) * 0.6, Math.random() * 0.8, P.thinX ? (Math.random() - 0.5) * 0.6 : out,
        sz, 0.004, sz * (0.6 + Math.random()), P.floor + 0.004, 1);
    }
  }

  // Dışarıdan (dünya) villa cephesine isabet: güney cephesinin camındaysa cam efekti + aynı konumdaki iç camın durumu.
  // true dönerse çağıran beton efekti çizmez.
  worldHit(hp, dir, off) {
    const lx = hp.x - off.x, ly = hp.y - off.y, lz = hp.z - off.z;
    let best = null;
    for (const P of this.panes) {
      if (P.thinX || Math.abs(P.z - lz) > 0.9 || P.z < 7) continue; // yalnız güney duvarı (iç z ≈ +8,15 = dünya cephesi)
      if (lx < P.x - P.w / 2 || lx > P.x + P.w / 2 || ly < P.y || ly > P.y + P.h) continue;
      best = P; break;
    }
    if (!best) return false;
    const gf = this.g.combat && this.g.combat.glass;
    this.stats.outside++;
    if (gf) { _n.set(0, 0, 1); gf.impactPuff(hp, _n); }
    if (best.hits < 2) {
      _o.set(lx, ly, lz);
      this.hit(best, _o, dir, false);
      if (best.hits === 2 && gf) { audio.glassBreak && audio.glassBreak(hp.x, hp.z, 1); for (let k = 0; k < 30; k++) gf.shards.emit(hp.x + (Math.random() - 0.5) * best.w * 0.8, best.y + Math.random() * best.h, hp.z + 0.05, (Math.random() - 0.5) * 0.6, Math.random() * 0.6, 0.3 + Math.random(), 0.02, 0.004, 0.02, best.floor + 0.004, 1); }
      else audio.glassCrack && audio.glassCrack(hp.x, hp.z, 0.8);
    }
    return true;
  }
}

// Kırık kenar dişleri: çerçeve boyunca rastgele üçgenler (cam düzleminde)
function rimMesh(P) {
  const L = P.thinX ? P.d : P.w, H = P.h, pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  const pt = (u, v) => (P.thinX ? [P.x, P.y + v, P.z - L / 2 + u] : [P.x - L / 2 + u, P.y + v, P.z]);
  let r = (P.x * 73 + P.z * 37 + P.y * 11) | 0;
  const rnd = () => { r = (r * 16807 + 11) % 2147483647; return (r & 0xffff) / 0xffff; };
  for (const [edge, len] of [['b', L], ['t', L], ['l', H], ['r', H]]) {
    for (let a = 0; a < len - 0.05;) {
      const w = 0.12 + rnd() * 0.35, dep = 0.05 + rnd() * 0.28, m = a + w * (0.3 + rnd() * 0.4), e = Math.min(len, a + w);
      if (edge === 'b') tri(pt(a, 0), pt(e, 0), pt(m, dep));
      else if (edge === 't') tri(pt(a, H), pt(m, H - dep), pt(e, H));
      else if (edge === 'l') tri(pt(0, a), pt(dep, m), pt(0, e));
      else tri(pt(L, a), pt(L, e), pt(L - dep, m));
      a = e;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, RIM); m.renderOrder = 2;
  return m;
}

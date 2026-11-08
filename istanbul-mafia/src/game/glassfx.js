// [savaş cam] Araç camı isabet efektleri (A2): isabet noktasında çatlak izi (havuzlu, araca bağlı),
// kırılınca dökülen cam parçaları (havuzlu InstancedMesh: yan camlar küçük temperli taneler, ön cam iri
// lamine parçalar), cam tozu ve parıltı. Her karede bellek ayırmaz.
import * as THREE from 'three';
import { audio } from '../core/audio.js';

const DECALS = 48, SHARDS = 260;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _l = new THREE.Vector3(), _d = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// çatlak dokusu: merkezde ezik halka, ışınsal çatlaklar, dairesel kırık halkaları (alfa kanallı)
function crackTex(seed, web) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  let r = seed;
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  g.clearRect(0, 0, 256, 256);
  g.lineCap = 'round';
  const cx = 128, cy = 128;
  const N = web ? 16 : 9;
  const rays = [];
  for (let i = 0; i < N; i++) {
    let x = cx, y = cy, a = (i / N) * Math.PI * 2 + (rnd() - 0.5) * 0.4;
    const pts = [[x, y]], L = (web ? 110 : 70) * (0.6 + rnd() * 0.5);
    for (let s = 0; s < 9; s++) { a += (rnd() - 0.5) * 0.5; const st = L / 9; x += Math.cos(a) * st; y += Math.sin(a) * st; pts.push([x, y]); }
    rays.push(pts);
  }
  // ince beyaz çatlak + koyu gölge (kalınlık uca doğru incelir)
  for (const pass of [0, 1]) {
    for (const pts of rays) {
      for (let k = 1; k < pts.length; k++) {
        g.strokeStyle = pass ? `rgba(240,250,255,${0.95 - k * 0.07})` : 'rgba(20,30,40,0.35)';
        g.lineWidth = (pass ? 1.6 : 2.6) * (1 - k / pts.length * 0.7);
        g.beginPath(); g.moveTo(pts[k - 1][0] + (pass ? 0 : 0.8), pts[k - 1][1] + (pass ? 0 : 0.8)); g.lineTo(pts[k][0] + (pass ? 0 : 0.8), pts[k][1] + (pass ? 0 : 0.8)); g.stroke();
      }
    }
  }
  // halka kırıkları (komşu ışınlar arası kısa bağlar)
  const rings = web ? 5 : 2;
  for (let ri = 1; ri <= rings; ri++) {
    g.strokeStyle = `rgba(235,245,255,${0.75 - ri * 0.1})`; g.lineWidth = 1.1;
    for (let i = 0; i < N; i++) {
      if (rnd() < 0.25) continue;
      const A = rays[i], B = rays[(i + 1) % N], k = Math.min(A.length - 1, Math.round(ri * (A.length - 1) / (rings + 1) + (rnd() - 0.5) * 2));
      g.beginPath(); g.moveTo(A[k][0], A[k][1]); g.quadraticCurveTo((A[k][0] + B[k][0]) / 2 + (rnd() - 0.5) * 6, (A[k][1] + B[k][1]) / 2 + (rnd() - 0.5) * 6, B[k][0], B[k][1]); g.stroke();
    }
  }
  // ezilme konisi: merkezde buzlu beyaz disk + delik
  const rg = g.createRadialGradient(cx, cy, 0, cx, cy, web ? 26 : 16);
  rg.addColorStop(0, 'rgba(10,12,14,0.95)'); rg.addColorStop(0.18, 'rgba(10,12,14,0.9)'); rg.addColorStop(0.24, 'rgba(235,242,248,0.95)'); rg.addColorStop(0.7, 'rgba(220,232,240,0.55)'); rg.addColorStop(1, 'rgba(220,232,240,0)');
  g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, web ? 26 : 16, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export class GlassFx {
  constructor(game) {
    this.game = game;
    this.scene = null;
    // çatlak izleri: tek geometri, iki malzeme (yıldız / örümcek ağı); araç gövdesine bağlanır
    this.decalGeo = new THREE.PlaneGeometry(1, 1);
    const mk = (tex) => new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide });
    this.decalMats = [mk(crackTex(7, false)), mk(crackTex(19, false)), mk(crackTex(31, true))];
    this.decals = [];
    for (let i = 0; i < DECALS; i++) {
      const m = new THREE.Mesh(this.decalGeo, this.decalMats[0]);
      m.visible = false; m.renderOrder = 3; m.frustumCulled = true; m.matrixAutoUpdate = true;
      this.decals.push({ m, v: null, pane: -1 });
    }
    this.decalIdx = 0;
    // kırık cam parçaları
    const sg = new THREE.BoxGeometry(1, 1, 1);
    this.shardMat = new THREE.MeshStandardMaterial({ color: 0xd6ecf2, metalness: 0.85, roughness: 0.06, transparent: true, opacity: 0.82, envMapIntensity: 2 });
    this.shards = new InstancedShards(sg, this.shardMat, SHARDS);
    this.stats = { cracks: 0, shatters: 0 };
  }
  attach(scene) {
    this.scene = scene;
    scene.add(this.shards.mesh);
  }
  clear() { this.shards.clear(); for (const d of this.decals) this.freeDecal(d); }
  freeDecal(d) { if (d.m.parent) d.m.parent.remove(d.m); d.m.visible = false; d.v = null; d.pane = -1; }

  // cama isabet: cam tozu + parıltı (kıvılcım yok)
  impactPuff(p, n) {
    const P = this.game.particles;
    for (let i = 0; i < 6; i++) {
      const s = 1 + Math.random() * 2.5;
      const j = P.norm.emit(p.x, p.y, p.z, (n.x + (Math.random() - 0.5)) * s, (n.y + Math.random() * 0.6) * s, (n.z + (Math.random() - 0.5)) * s, 0.6, 0.012 + Math.random() * 0.015, 0.85, 0.92, 0.96, 0.9, 0, 9.8);
      P.norm.floor[j] = Math.min(0, p.y - 1.5) + 0.01;
    }
    P.add.emit(p.x, p.y, p.z, 0, 0, 0, 0.05, 0.1, 0.9, 1, 1.1, 0.7);
    P.smokeSys.emit(p.x, p.y, p.z, n.x * 0.4, 0.15, n.z * 0.4, 0.5, 0.06, 0.85, 0.88, 0.9, 0.35, 0.5);
  }

  // isabet noktasında çatlak izi: v aracı, i pencere, hit {x,y,z,dx,dy,dz} (dünya), st 1 yıldız / 2 ağ
  crack(v, i, hit, st) {
    const ch = v.mesh && v.mesh.userData.chassis;
    if (!ch || !hit) return;
    this.stats.cracks++;
    const d = this.decals[this.decalIdx]; this.decalIdx = (this.decalIdx + 1) % DECALS;
    this.freeDecal(d);
    v.mesh.updateMatrixWorld();
    _l.set(hit.x, hit.y, hit.z); ch.worldToLocal(_l);
    // yön: mermi yönünün tersi (yerel uzayda), pencere kutusunun en ince eksenine doğru yaslanır
    const w = v.windows[i] && v.windows[i].p;
    _d.set(hit.x - hit.dx, hit.y - hit.dy, hit.z - hit.dz); ch.worldToLocal(_d); _d.sub(_l).normalize();
    if (w) {
      const ex = [w.mx[0] - w.mn[0], w.mx[1] - w.mn[1], w.mx[2] - w.mn[2]];
      const ax = ex[0] < ex[2] ? 0 : 2; // yan cam: x ince; ön/arka cam: z (eğimli) ince
      const nx = ax === 0 ? Math.sign(_d.x || 1) : 0, nz = ax === 2 ? Math.sign(_d.z || 1) : 0;
      _d.set(_d.x * 0.35 + nx, _d.y * 0.35, _d.z * 0.35 + nz).normalize();
      // izi pencerenin içine sıkıştır
      _l.x = Math.max(w.mn[0] - 0.02, Math.min(w.mx[0] + 0.02, _l.x));
      _l.y = Math.max(w.mn[1], Math.min(w.mx[1], _l.y));
      _l.z = Math.max(w.mn[2] - 0.02, Math.min(w.mx[2] + 0.02, _l.z));
    }
    d.m.material = st >= 2 ? this.decalMats[2] : this.decalMats[Math.random() < 0.5 ? 0 : 1];
    d.m.position.copy(_l).addScaledVector(_d, 0.012);
    d.m.quaternion.setFromUnitVectors(_z, _d);
    d.m.rotateZ(Math.random() * Math.PI * 2);
    const sz = st >= 2 ? 0.55 + Math.random() * 0.2 : 0.2 + Math.random() * 0.1;
    d.m.scale.set(sz, sz, 1);
    d.m.visible = true; d.v = v; d.pane = i;
    ch.add(d.m);
    // ilk çatlakta kırılma sesini önceden hazırla (ilk kırılmada takılma olmasın)
    if (!this._warm && audio.ctx && audio._sfxBank) { this._warm = true; setTimeout(() => { try { audio.glassBreak(1e6, 1e6, 0); } catch (e) { /* yok */ } }, 0); }
  }

  // pencere kırıldı: izler kalkar, parçalar dökülür. c: pencere merkezi (dünya), out: dışa yön (yerel x işareti)
  shatter(v, i, c) {
    this.stats.shatters++;
    for (const d of this.decals) if (d.v === v && d.pane === i) this.freeDecal(d);
    const w = v.windows[i] && v.windows[i].p;
    const ch = v.mesh.userData.chassis;
    const ws = w && (w.tag === 'g_ws' || w.tag === 'g_rear');
    const floor = (v.groundY !== undefined ? v.groundY : v.pos.y) + 0.004;
    const f = v.fwd || { x: Math.sin(v.heading), z: Math.cos(v.heading) };
    const n = ws ? 26 : 46;
    const vx = v.vx || 0, vz = v.vz || 0;
    for (let k = 0; k < n; k++) {
      // pencere kutusu içinde rastgele nokta (yerel) -> dünya
      if (w) _p.set(w.mn[0] + Math.random() * (w.mx[0] - w.mn[0]), w.mn[1] + Math.random() * (w.mx[1] - w.mn[1]), w.mn[2] + Math.random() * (w.mx[2] - w.mn[2]));
      else _p.set(0, 1, 0);
      const side = w ? Math.sign(w.c[0]) : 0;
      ch.localToWorld(_p);
      const out = (Math.random() < 0.65 ? 1 : -0.6) * (0.4 + Math.random() * 1.2);
      const ox = f.z * side * out, oz = -f.x * side * out;
      if (ws) {
        // lamine ön/arka cam: iri, yassı parçalar; içeri doğru çöker ve kaputa/öne düşer
        this.shards.emit(_p.x, _p.y, _p.z, vx + (Math.random() - 0.5) * 1.2, Math.random() * 0.8, vz + (Math.random() - 0.5) * 1.2,
          0.03 + Math.random() * 0.05, 0.003, 0.025 + Math.random() * 0.045, floor, 1);
      } else {
        // temperli yan cam: binlerce küçük küp gibi; çoğu aşağı dökülür, bir kısmı dışa saçılır
        const sz = 0.009 + Math.random() * 0.014;
        this.shards.emit(_p.x, _p.y, _p.z, vx + ox * 1.6, Math.random() * 1.4 - 0.2, vz + oz * 1.6, sz, sz * (0.6 + Math.random() * 0.5), sz, floor, 0);
      }
    }
    // parıltı ve ince cam tozu
    const P = this.game.particles;
    if (c) { for (let k = 0; k < 5; k++) P.add.emit(c.x + (Math.random() - 0.5) * 0.4, c.y + (Math.random() - 0.5) * 0.2, c.z + (Math.random() - 0.5) * 0.4, 0, -0.3, 0, 0.12, 0.05, 1, 1.05, 1.1, 0.8); P.smokeSys.emit(c.x, c.y, c.z, 0, 0.1, 0, 0.8, 0.12, 0.9, 0.92, 0.95, 0.25, 0.8); }
  }
  update(dt) { this.shards.update(dt); }
}

// Havuzlu cam parçacıkları: düşer, döner, sekip yerde yatar, sonra küçülerek kaybolur
class InstancedShards {
  constructor(geo, mat, max) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.renderOrder = 2;
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, ZERO);
    this.P = new Float32Array(max * 3); this.V = new Float32Array(max * 3); this.R = new Float32Array(max * 3); this.W = new Float32Array(max * 3);
    this.S = new Float32Array(max * 3); this.life = new Float32Array(max); this.floor = new Float32Array(max); this.flat = new Uint8Array(max); this.rest = new Uint8Array(max);
    this.cur = 0; this.alive = 0;
  }
  emit(x, y, z, vx, vy, vz, sx, sy, sz, floor, flat) {
    const i = this.cur; this.cur = (this.cur + 1) % this.max; const k = i * 3;
    this.P[k] = x; this.P[k + 1] = y; this.P[k + 2] = z;
    this.V[k] = vx; this.V[k + 1] = vy; this.V[k + 2] = vz;
    this.R[k] = Math.random() * 6; this.R[k + 1] = Math.random() * 6; this.R[k + 2] = Math.random() * 6;
    const sp = flat ? 9 : 20;
    this.W[k] = (Math.random() - 0.5) * sp; this.W[k + 1] = (Math.random() - 0.5) * sp; this.W[k + 2] = (Math.random() - 0.5) * sp;
    this.S[k] = sx; this.S[k + 1] = sy; this.S[k + 2] = sz;
    this.life[i] = 12 + Math.random() * 6; this.floor[i] = floor; this.flat[i] = flat; this.rest[i] = 0;
  }
  clear() { this.life.fill(0); for (let i = 0; i < this.max; i++) this.mesh.setMatrixAt(i, ZERO); this.mesh.instanceMatrix.needsUpdate = true; this.alive = 0; }
  update(dt) {
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      const k = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.mesh.setMatrixAt(i, ZERO); alive++; continue; }
      alive++;
      if (!this.rest[i]) {
        this.V[k + 1] -= 15 * dt;
        // yassı parçalar havada süzülür (hava direnci)
        if (this.flat[i]) { const dr = Math.exp(-1.8 * dt); this.V[k] *= dr; this.V[k + 2] *= dr; }
        this.P[k] += this.V[k] * dt; this.P[k + 1] += this.V[k + 1] * dt; this.P[k + 2] += this.V[k + 2] * dt;
        this.R[k] += this.W[k] * dt; this.R[k + 1] += this.W[k + 1] * dt; this.R[k + 2] += this.W[k + 2] * dt;
        if (this.P[k + 1] < this.floor[i]) {
          this.P[k + 1] = this.floor[i];
          if (this.V[k + 1] < -1.2) { this.V[k + 1] *= -0.28; this.V[k] *= 0.45; this.V[k + 2] *= 0.45; this.W[k] *= 0.4; this.W[k + 2] *= 0.4; }
          else { this.rest[i] = 1; if (this.flat[i]) { this.R[k] = 0; this.R[k + 2] = 0; } }
        }
      }
      const fade = this.life[i] < 1.5 ? this.life[i] / 1.5 : 1;
      _e.set(this.R[k], this.R[k + 1], this.R[k + 2]); _q.setFromEuler(_e);
      _p.set(this.P[k], this.P[k + 1] + (this.rest[i] ? this.S[k + 1] * 0.5 : 0), this.P[k + 2]);
      _s.set(this.S[k] * fade, this.S[k + 1] * fade, this.S[k + 2] * fade);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    if (alive || this.alive) this.mesh.instanceMatrix.needsUpdate = true;
    this.alive = alive;
  }
}

// Kırılan sokak eşyası enkazı: araç çarpınca örnekli eşya (NearInstancer) gizlenir, aynı geometriyle savrulan bir
// parça doğar (yerçekimi, sekme, devrilip yatma). Yangın musluğu su fışkırtır. Oyuncu uzaklaşınca eşya geri gelir.
import * as THREE from 'three';

const MAX = 28;
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _ax = new THREE.Vector3();

export class Debris {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.restore = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    if (game.physics && game.physics.onBreak) game.physics.onBreak((b, vx, vz, src) => this.spawn(b, vx, vz, src));
    this.restoreT = 0;
  }

  // örneği bul ve matrisini sıfırla (görünmez yap); geri yükleme için eski değerleri sakla
  hideInstance(inst, x, z) {
    if (!inst || !inst.M) return null;
    const C = inst.cell, k = Math.floor((x + 1100) / C) * 4096 + Math.floor((z + 1100) / C);
    const cells = inst.cells;
    for (let c = 0; c < cells.length; c++) {
      const cl = cells[c];
      if (cl.k !== k) continue;
      for (let i = cl.start; i < cl.start + cl.count; i++) {
        const o = i * 16;
        if (Math.abs(inst.M[o + 12] - x) < 0.03 && Math.abs(inst.M[o + 14] - z) < 0.03 && inst.M[o] !== 0) {
          const saved = inst.M.slice(o, o + 16);
          inst.M.fill(0, o, o + 16);
          inst.last = null; // sonraki City.update yeniden yükler
          return { inst, o, saved };
        }
      }
      break;
    }
    return null;
  }

  spawn(b, vx, vz, src) {
    const brk = b.brk, g = this.game;
    const hid = this.hideInstance(brk.inst, brk.x, brk.z);
    this.restore.push({ b, hid, t: 150 + Math.random() * 60 });
    if (!brk.inst || !brk.inst.geo) return;
    if (this.list.length >= MAX) { const old = this.list.shift(); this.group.remove(old.mesh); }
    const m = new THREE.Mesh(brk.inst.geo, brk.inst.mat);
    m.position.set(brk.x, brk.y, brk.z);
    m.rotation.set(0, brk.rot || 0, 0);
    m.scale.set(brk.sx || 1, brk.sy || 1, brk.sz || 1);
    m.castShadow = false; m.receiveShadow = true;
    this.group.add(m);
    const sp = Math.hypot(vx, vz);
    const light = Math.min(1, 60 / brk.mass);
    const k = (0.75 + Math.random() * 0.35) * (0.6 + 0.6 * light);
    const d = {
      mesh: m, vx: vx * k + (Math.random() - 0.5) * 2, vz: vz * k + (Math.random() - 0.5) * 2, vy: 2 + sp * 0.12 * light + Math.random() * 2,
      wx: (Math.random() - 0.5) * sp * 0.5, wz: (Math.random() - 0.5) * sp * 0.5, wy: (Math.random() - 0.5) * 3,
      rest: brk.y, t: 0, settled: false, kind: brk.kind,
    };
    // devrilme ekseni: hareket yönüne dik
    if (sp > 0.1) { d.wx = (vz / sp) * (3 + sp * 0.25); d.wz = -(vx / sp) * (3 + sp * 0.25); }
    this.list.push(d);
    if (brk.kind === 'hydrant') d.spray = 9;
    if (g.particles && g.particles.dust) g.particles.dust({ x: brk.x, y: 0.3, z: brk.z });
    void src;
  }

  update(dt) {
    const g = this.game;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i], m = d.mesh;
      d.t += dt;
      if (d.spray > 0) {
        d.spray -= dt;
        if (g.particles && g.particles.splash && Math.random() < 0.5) g.particles.splash({ x: d.mesh.position.x, y: 0.6, z: d.mesh.position.z });
      }
      if (!d.settled) {
        d.vy -= 20 * dt;
        m.position.x += d.vx * dt; m.position.y += d.vy * dt; m.position.z += d.vz * dt;
        _ax.set(d.wx, d.wy, d.wz);
        const w = _ax.length();
        if (w > 1e-4) { _q.setFromAxisAngle(_ax.multiplyScalar(1 / w), w * dt); m.quaternion.premultiply(_q); }
        // binaya / duvara girmesin: basit çember çözümü
        if (g.physics) { const r = g.physics.resolveCircle(m.position, 0.25, Math.max(0, m.position.y - 0.2), 0.5, 0.2); if (r.hit) { d.vx *= -0.3; d.vz *= -0.3; } }
        if (m.position.y <= d.rest) {
          m.position.y = d.rest;
          if (Math.abs(d.vy) < 1.5) { d.vy = 0; d.vx *= 0.8; d.vz *= 0.8; } else d.vy *= -0.3;
          d.vx *= 0.7; d.vz *= 0.7; d.wx *= 0.55; d.wy *= 0.55; d.wz *= 0.55;
          if (Math.hypot(d.vx, d.vz) < 0.3 && Math.abs(d.vy) < 0.1) {
            d.settled = true;
            // yan yatmış hâle oturt: dik eksene en yakın 90° yatış
            _e.setFromQuaternion(m.quaternion, 'YXZ');
            const tip = Math.sign(_e.x || 1) * Math.PI / 2;
            _q2.setFromEuler(_e.set(tip, _e.y, 0, 'YXZ'));
            d.target = _q2.clone();
          }
        }
      } else if (d.target) {
        m.quaternion.slerp(d.target, Math.min(1, dt * 6));
        m.position.y += (d.rest + 0.18 - m.position.y) * Math.min(1, dt * 6);
      }
      // araçlar yerdeki enkazı iter
      if (d.settled && g.vehicles) {
        for (const v of g.vehicles.list) {
          if (v.kind !== 'car') continue;
          const dx = m.position.x - v.pos.x, dz = m.position.z - v.pos.z;
          if (dx * dx + dz * dz > (v.def.len * 0.5 + 0.4) ** 2 || v.speed < 2) continue;
          d.settled = false; d.target = null; d.vx = v.vx * 0.7 + dx; d.vz = v.vz * 0.7 + dz; d.vy = 2; d.wx = (Math.random() - 0.5) * 8; d.wz = (Math.random() - 0.5) * 8;
          break;
        }
      }
      if (d.t > 90) { this.group.remove(m); this.list.splice(i, 1); }
    }
    // uzaktayken eşyayı geri koy
    this.restoreT -= dt;
    if (this.restoreT <= 0 && this.restore.length) {
      this.restoreT = 2;
      const p = g.player.pos;
      for (let i = this.restore.length - 1; i >= 0; i--) {
        const r = this.restore[i];
        r.t -= 2;
        if (r.t > 0) continue;
        const b = r.b;
        if (Math.hypot(b.brk.x - p.x, b.brk.z - p.z) < 130) continue;
        const cols = b.owner;
        if (cols && b.removed) { b.removed = false; cols._insert(b); if (b.brk.extra) for (const e of b.brk.extra) if (e.removed) { e.removed = false; cols._insert(e); } }
        if (r.hid) { r.hid.inst.M.set(r.hid.saved, r.hid.o); r.hid.inst.last = null; }
        this.restore.splice(i, 1);
      }
    }
  }
}

// [kanun] Araç gaspı: hareket eden araca F ile ışınlanma yok.
// Önce aracı durdurmak gerekir: önüne geç (sürücü fren yapar) ya da sürücüye silah doğrult (korkup durur).
// Duran araçta F: kapıya yürü -> kapıyı aç -> sürücüyü dışarı çek (yere düşer) -> otur -> kapı kapanır.
// Toplam ~2 sn, normal oyun hızında; animasyon prosedürel (konum/yön ara değerleme + kapı menteşesi).
const T_APPROACH = 0.4, T_OPEN = 0.75, T_PULL = 1.35, T_ENTER = 1.75, T_CLOSE = 2.05;
const ease = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };

export class Carjack {
  constructor(game) {
    this.g = game;
    this.seq = null;
    this.aimT = 0;
    this.hintT = 0;
    this.stats = { blockedMoving: 0, done: 0, aimStops: 0 };
  }
  // sürücülü (YZ) araç mı
  driven(v) { return !!(v && v.ai && !v.ai.empty && !v.parked && v.ai.mode !== 'race' && !v.lawUnit); }

  // main.js F tuşu: true dönerse olay burada ele alındı (enterVehicle çağrılmaz)
  tryEnter(v) {
    const g = this.g, p = g.player;
    if (this.seq) return true;
    if (!this.driven(v) || p.vehicle || p.dead) return false;
    if (v.speed > 1.2 && !(v.ai.jackStop > 0)) {
      this.stats.blockedMoving++;
      if (this.hintT <= 0) { this.hintT = 2.5; g.ui.notify('Araç hareket halinde! Önüne geç ya da sürücüye silah doğrult.', 'warn'); }
      return true;
    }
    this.start(v);
    return true;
  }

  start(v) {
    const g = this.g, p = g.player;
    const seat = (v.seats && v.seats[0]) || { x: v.def.wid * 0.22, y: 0.5, z: 0 };
    const s = seat.x >= 0 ? 1 : -1; // yerel +x = aracın sol tarafı (sürücü)
    const f = v.fwd, lx = f.z, lz = -f.x; // yerel +x yönünün dünya karşılığı
    const tag = s > 0 ? 'doorL0' : 'doorR0';
    // [hareket H2] kapı geometrisi: menteşe önde (z1), arka kenar z0. Oyuncu kapının süpürdüğü yayın DIŞINDA,
    // arka kenarın gerisinde (B direği yanında) durur; kapı ondan uzağa, öne-dışa açılır.
    const T = v.T, dd = T && T.doors && T.doors.find((d) => d.tag === tag);
    const hwAt = (z) => (dd && T.S && T.S.hw ? T.S.hw((dd.y0 + dd.y1) / 2, z) : v.def.wid / 2);
    const z0 = dd ? dd.z0 : seat.z - 0.55, z1 = dd ? dd.z1 : seat.z + 0.55, hw0 = hwAt(z0), hwH = hwAt(z1);
    const r = p.radius || 0.35;
    const W = (ax, az) => ({ x: v.pos.x + lx * ax + f.x * az, z: v.pos.z + lz * ax + f.z * az });
    const door = W(s * (hw0 + r + 0.06), z0 - r - 0.12); // B direği yanı
    const gap = W(s * (hw0 + 0.1), z0 + 0.38); // kapı boşluğu (açık kapı ile B direği arası)
    const seatW = W(seat.x, seat.z);
    const drop = W(s * (hw0 + 1.35), z0 + 0.1); // sürücü boşluktan dışarı-geriye, oyuncunun önünden düşer
    // araç tamamen durur ve gasp boyunca kıpırdamaz
    v.ai.jackStop = 0; v.ai.frozen = true;
    v.vx *= 0.2; v.vz *= 0.2;
    this.seq = { v, t: 0, s, lx, lz, door, gap, seatW, drop, sx: p.pos.x, sz: p.pos.z, tag, hasDoor: true, driver: null,
      geo: { hx: s * hwH, hz: z1, L: z1 - z0, s }, faceIn: Math.atan2(gap.x - door.x, gap.z - door.z) };
    p.scriptCtl = (dt) => this.drivePlayer(dt);
    p.crouch = false; p.speed = 0;
  }
  // kapı paneli (dünya): menteşe ve arka kenar; test ve çakışma denetimi için [hareket]
  doorSegment(out) {
    const S = this.seq; if (!S) return null;
    const v = S.v, G = S.geo, D = v._doors && v._doors[S.tag], a = D ? D.ang : 0, f = v.fwd;
    const ax = G.hx + G.s * G.L * Math.sin(a), az = G.hz - G.L * Math.cos(a);
    out.x0 = v.pos.x + S.lx * G.hx + f.x * G.hz; out.z0 = v.pos.z + S.lz * G.hx + f.z * G.hz;
    out.x1 = v.pos.x + S.lx * ax + f.x * az; out.z1 = v.pos.z + S.lz * ax + f.z * az;
    return out;
  }

  drivePlayer(dt) {
    const S = this.seq, p = this.g.player;
    if (!S) { p.scriptCtl = null; return; }
    const t = S.t;
    let x, z, face = S.faceIn; // kapı boşluğuna dönük
    if (t < T_APPROACH) {
      const u = ease(t / T_APPROACH);
      x = S.sx + (S.door.x - S.sx) * u; z = S.sz + (S.door.z - S.sz) * u;
      if (Math.hypot(S.door.x - S.sx, S.door.z - S.sz) > 0.3 && u < 0.8) face = Math.atan2(S.door.x - S.sx, S.door.z - S.sz);
      p.speed = Math.hypot(S.door.x - S.sx, S.door.z - S.sz) / T_APPROACH;
    } else if (t < T_PULL) {
      x = S.door.x; z = S.door.z; p.speed = 0;
    } else {
      // B direğinden kapı boşluğuna, oradan koltuğa kay
      const u = (t - T_PULL) / (T_ENTER - T_PULL);
      if (u < 0.45) { const e = ease(u / 0.45); x = S.door.x + (S.gap.x - S.door.x) * e; z = S.door.z + (S.gap.z - S.door.z) * e; }
      else { const e = ease((u - 0.45) / 0.55); x = S.gap.x + (S.seatW.x - S.gap.x) * e; z = S.gap.z + (S.seatW.z - S.gap.z) * e; face = S.v.heading; }
      p.speed = 1.2;
    }
    p.pos.x = x; p.pos.z = z;
    p.heading += Math.atan2(Math.sin(face - p.heading), Math.cos(face - p.heading)) * Math.min(1, dt * 14);
  }

  update(dt) {
    const g = this.g, p = g.player;
    if (this.hintT > 0) this.hintT -= dt;
    if (this.seq) this.updateSeq(dt);
    // silah doğrultulan sürücü durur (seyrek tarama)
    this.aimT -= dt;
    if (this.aimT <= 0 && !p.vehicle && !p.dead && !p.inInterior && p.aiming && p.wdef && p.wdef.type === 'gun') {
      this.aimT = 0.15;
      const fx = Math.sin(p.camYaw), fz = Math.cos(p.camYaw);
      for (const v of g.vehicles.list) {
        if (!this.driven(v) || v.kind !== 'car' || v.destroyed) continue;
        const dx = v.pos.x - p.pos.x, dz = v.pos.z - p.pos.z, d = Math.hypot(dx, dz);
        if (d > 16 || d < 1) continue;
        const along = dx * fx + dz * fz, lat = Math.abs(dx * -fz + dz * fx);
        if (along < 0 || lat > v.def.wid * 0.6 + 0.4) continue;
        if (!(v.ai.jackStop > 0)) {
          this.stats.aimStops++;
          g.ui.bark(v, ['Tamam! Tamam! Vurma!', 'Ne olur ateş etme!', 'Al arabayı, vurma!'][Math.floor(Math.random() * 3)]);
          if (g.audio.horn && Math.random() < 0.3) g.audio.horn(v.pos.x, v.pos.z);
        }
        v.ai.jackStop = 3.5;
        if (v.ai.panic) v.ai.panic = 0;
      }
    }
  }

  updateSeq(dt) {
    const g = this.g, p = g.player, S = this.seq, v = S.v;
    const t0 = S.t;
    S.t += dt;
    const t = S.t;
    const abort = v.destroyed || p.dead || !g.vehicles.list.includes(v);
    if (abort) { this.finish(false); return; }
    v.vx *= 0.8; v.vz *= 0.8;
    // kapı
    if (t >= T_APPROACH && S.hasDoor) {
      let ang;
      if (t < T_OPEN) ang = ease((t - T_APPROACH) / (T_OPEN - T_APPROACH)) * 1.15;
      else if (t < T_ENTER) ang = 1.15;
      else ang = 1.15 * (1 - ease((t - T_ENTER) / (T_CLOSE - T_ENTER)));
      if (!v.setDoor || !v.setDoor(S.tag, ang)) S.hasDoor = false;
    }
    if (t0 < T_APPROACH && t >= T_APPROACH) g.audio.tone && g.audio.tone({ freq: 220, dur: 0.08, type: 'square', gain: 0.05, x: v.pos.x, z: v.pos.z });
    // sürücüyü çek
    if (t0 < T_OPEN && t >= T_OPEN) {
      const police = v.type === 'police' || v.type === 'polsuv' || v.type === 'swat';
      const aiL = v.mesh.userData.aiLook; // [B1] koltukta görünen sürücünün aynısı iner
      const n = g.npcs.add(police ? 'police' : 'civilian', S.seatW.x, S.seatW.z, aiL ? { ...aiL } : null, { state: 'ext' });
      n.heading = v.heading + Math.PI / 2 * S.s;
      n.ext = () => 0; n.static = true;
      S.driver = n;
      v.ai = { empty: true }; if (v.mesh.userData.seatRider) v.mesh.userData.seatRider.root.visible = false; // koltuktaki gövde gizlenir, artık yerde gerçek kişi
      g.ui.bark(n, police ? 'Polise mi el kaldırıyorsun?!' : ['Ne yapıyorsun be?!', 'Bırak beni! Arabam!', 'İmdat! Hırsız!'][Math.floor(Math.random() * 3)]);
    }
    if (S.driver && t < T_PULL + 0.05) {
      const n = S.driver, u = ease((t - T_OPEN) / (T_PULL - T_OPEN));
      n.pos.x = S.seatW.x + (S.drop.x - S.seatW.x) * u; n.pos.z = S.seatW.z + (S.drop.z - S.seatW.z) * u;
      n.pos.y = Math.max(0, v.pos.y) + 0.25 * Math.sin(Math.PI * u);
      n.sync();
    }
    if (S.driver && t0 < T_PULL && t >= T_PULL) {
      const n = S.driver;
      n.ext = null; n.static = false; n.pos.y = Math.max(0, v.pos.y);
      g.physics.resolveCircle(n.pos, 0.35, n.pos.y);
      if (n.faction === 'police') { n.state = 'idle'; n.knockdown(S.lx * S.s * 3, S.lz * S.s * 3, 1.2); n.engage(p, 1.5); g.wanted.crime('assault_police', v.pos); }
      else { n.state = 'idle'; n.knockdown(S.lx * S.s * 3, S.lz * S.s * 3, 1.6); n.lastAttacker = p; }
      g.audio.punch && g.audio.punch(n.pos.x, n.pos.z);
    }
    // otur
    if (t0 < T_ENTER && t >= T_ENTER) {
      p.scriptCtl = null;
      v.ai = { empty: true }; v.parked = false;
      g.enterVehicle(v, true);
      if (!v.owned) g.ui.notify(v.def.name, 'info');
      g.wanted.crime('carjack', v.pos);
      this.stats.done++;
    }
    if (t >= T_CLOSE) this.finish(true);
  }
  finish(ok) {
    const S = this.seq, p = this.g.player;
    if (!S) return;
    if (S.hasDoor && S.v.setDoor) S.v.setDoor(S.tag, 0);
    if (S.driver && S.driver.state === 'ext') { S.driver.ext = null; S.driver.static = false; S.driver.state = 'idle'; }
    if (!ok && S.v.ai) S.v.ai.frozen = false;
    p.scriptCtl = null;
    this.seq = null;
  }
}

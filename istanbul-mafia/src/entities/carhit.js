// [hareket H3/M8] Araç-yaya çarpma tepkisi (npc.js carHits buradan çağırır).
// Hıza göre: < 4 m/s sendeleme; 4–10 m/s kaputa yatıp yana yuvarlanma; > 10 m/s savrulma (12 m/s'de ~4–9 m).
// Uçuş/kaput evresinde yaya aracın yerel koordinatında ya da balistik izlenir; aracın gövdesinin içine girmez.
// Kare içinde bellek ayırma yok: uçuş kayıtları havuzdan. stats: her alt adımın süresi (takılma teşhisi).
import { audio } from '../core/audio.js';

const LIVE = [], POOL = [];
export const HIT_STATS = { hits: 0, ms: 0, worst: 0, part: { dmg: 0, react: 0, fx: 0, law: 0, threat: 0 } };
const now = () => performance.now();

export function pedImpact(g, v, a, sp) {
  const t0 = now(), P = HIT_STATS.part;
  const f = v.fwd, vs = Math.hypot(v.vx, v.vz);
  const dx = a.pos.x - v.pos.x, dz = a.pos.z - v.pos.z, lat = dx * -f.z + dz * f.x;
  const sx = lat > 0 ? -f.z : f.z, sz = lat > 0 ? f.x : -f.x; // aracın yanından dışarı
  const ux = vs > 0.5 ? v.vx / vs : f.x, uz = vs > 0.5 ? v.vz / vs : f.z;
  const dmg = sp < 4 ? sp * 2 : sp * sp * 0.35 + sp * 2;
  a.takeDamage(dmg, v.driver, 'car');
  const t1 = now(); P.dmg += t1 - t0;
  if (a.isPlayer) {
    // oyuncu: eski tepki (kendi fiziği savrulmayı işler)
    a.knock = { x: v.vx * 0.6 + sx * 3, z: v.vz * 0.6 + sz * 3, t: 0.4 };
    if (!a.dead) { if (sp > 3.2 && a.knockdown) a.knockdown(a.knock.x, a.knock.z, 1.8 + Math.min(1.6, sp * 0.12)); g.cameraShake(Math.min(1.4, 0.4 + sp * 0.08)); }
    g.ui.damageFlash();
  } else if (!a.dead && sp < 4) {
    // sendeleme: kısa itiş + irkilme, düşmez
    const k = a.knock || (a.knock = { x: 0, z: 0, t: 0 });
    k.x = ux * sp * 0.25 + sx * 0.5; k.z = uz * sp * 0.25 + sz * 0.5; k.t = 0.25;
    a.model.hit(k.x, k.z, 0.7 + sp * 0.2);
  } else if (sp >= 4) {
    // ölse de beden kaputa/havaya gider (aracın altında kalmaz)
    if (a.knock) a.knock.t = 0;
    const F = POOL.pop() || {};
    F.a = a; F.v = v; F.t = 0; F.sx = sx; F.sz = sz; F.ground = false; F.inCar = 0;
    F.hx = a.pos.x; F.hz = a.pos.z; F.sp = sp;
    if (sp <= 10) {
      // kaputa yat: aracın yerel koordinatında önden ön cama doğru, sonra yana yuvarlan
      F.mode = 'hood';
      const rx = f.z, rz = -f.x; // aracın yerel +x yönü
      F.lx = Math.max(-v.def.wid / 2 + 0.35, Math.min(v.def.wid / 2 - 0.35, dx * rx + dz * rz));
      F.lz0 = v.def.len / 2 - 0.15; F.lz1 = v.def.len * 0.08;
      F.hood = Math.max(0.55, (v.def.hei || 1.4) * 0.6);
      F.dur = 0.35 + 0.025 * (10 - sp);
      F.y0 = a.pos.y;
    } else {
      // savrulma: ileri-yana, hıza göre yükselen balistik iz; araç önünden başlar
      F.mode = 'fly';
      const fw = 0.72 * sp, sd = 0.24 * sp;
      F.vx = ux * fw + sx * sd; F.vz = uz * fw + sz * sd; F.vy = 0.22 * sp;
      a.pos.y = Math.max(a.pos.y, v.pos.y + 0.35);
    }
    a.flight = F; LIVE.push(F);
    const kd = F.mode === 'hood' ? 2.9 : 2.4 + Math.min(1.2, (sp - 10) * 0.08);
    if (!a.dead && a.knockdown) a.knockdown(F.mode === 'hood' ? sx : ux, F.mode === 'hood' ? sz : uz, kd);
  }
  const t2 = now(); P.react += t2 - t1;
  audio.punch(a.pos.x, a.pos.z);
  g.particles.blood({ x: a.pos.x, y: 1, z: a.pos.z }, sp < 4 ? 2 : 6);
  const m = v.def.mass || v.def.len * v.def.wid * 150;
  const k = m / (m + 80);
  v.vx *= k; v.vz *= k;
  const t3 = now(); P.fx += t3 - t2;
  if (v.driver && v.driver.isPlayer && !a.dead && a.faction === 'civilian') g.wanted.crime('hit_ped', a.pos);
  const t4 = now(); P.law += t4 - t3;
  if (!a.dead && a.hearThreat) a.hearThreat(v.driver || g.player, 2);
  const t5 = now(); P.threat += t5 - t4;
  HIT_STATS.hits++; HIT_STATS.ms += t5 - t0; HIT_STATS.worst = Math.max(HIT_STATS.worst, t5 - t0);
}

// aracın gövdesinden (OBB) dışarı it; içindeyse true
function pushOut(v, a) {
  const d = v.def, r = a.radius || 0.35, hx = d.wid / 2 + r * 0.6, hz = d.len / 2 + r * 0.6;
  if (a.pos.y > v.pos.y + (d.hei || 1.4) - 0.1) return false;
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading), rx = fz, rz = -fx;
  const dx = a.pos.x - v.pos.x, dz = a.pos.z - v.pos.z;
  let lx = dx * rx + dz * rz, lz = dx * fx + dz * fz;
  if (Math.abs(lx) >= hx || Math.abs(lz) >= hz) return false;
  if (hx - Math.abs(lx) < hz - Math.abs(lz)) lx = (lx >= 0 ? 1 : -1) * (hx + 0.02); else lz = (lz >= 0 ? 1 : -1) * (hz + 0.02);
  a.pos.x = v.pos.x + lx * rx + lz * fx; a.pos.z = v.pos.z + lx * rz + lz * fz;
  return true;
}

// her kare (yaya güncellemelerinden sonra): kaput / uçuş / yerde kayma
export function updateFlights(g, dt) {
  for (let i = LIVE.length - 1; i >= 0; i--) {
    const F = LIVE[i], a = F.a, v = F.v;
    F.t += dt;
    let done = !a.flight || a.vehicle || !g.npcs.list.includes(a);
    if (!done && F.mode === 'hood') {
      if (v.destroyed) { F.mode = 'fly'; F.vx = v.vx * 0.5 + F.sx * 2; F.vz = v.vz * 0.5 + F.sz * 2; F.vy = 0; }
      else if (F.t < F.dur) {
        const u = F.t / F.dur, e = u * u * (3 - 2 * u);
        const lz = F.lz0 + (F.lz1 - F.lz0) * e, fx = Math.sin(v.heading), fz = Math.cos(v.heading);
        a.pos.x = v.pos.x + F.lx * fz + lz * fx; a.pos.z = v.pos.z - F.lx * fx + lz * fz;
        a.pos.y = Math.max(F.y0, v.pos.y + F.hood * Math.min(1, u * 2.2));
      } else {
        // kaputtan yana yuvarlan: aracın hızının bir kısmı + yana itiş
        F.mode = 'fly';
        const keep = 0.55;
        F.vx = v.vx * keep + F.sx * 2.6; F.vz = v.vz * keep + F.sz * 2.6; F.vy = 1.0;
        v.vx *= 0.97; v.vz *= 0.97;
      }
    }
    if (!done && F.mode === 'fly') {
      a.pos.x += F.vx * dt; a.pos.z += F.vz * dt;
      const rs = g.physics.resolveCircle(a.pos, a.radius || 0.35, a.pos.y);
      if (rs.hit) { F.vx *= 0.2; F.vz *= 0.2; }
      if (!F.ground) {
        F.vy -= 20 * dt; a.pos.y += F.vy * dt;
        if (a.pos.y <= rs.support) { a.pos.y = rs.support; F.ground = true; F.vy = 0; audio.punch && audio.punch(a.pos.x, a.pos.z); }
      } else {
        a.pos.y = rs.support;
        const s = Math.hypot(F.vx, F.vz), ns = Math.max(0, s - 16 * dt);
        if (ns <= 0.05) done = true; else { F.vx *= ns / s; F.vz *= ns / s; }
      }
      // aracın içinden geçme: gövdeye girdiyse dışarı it, aracın hızından yavaş kalmasın
      if (!v.destroyed && pushOut(v, a)) {
        F.inCar++;
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading), along = F.vx * fx + F.vz * fz, cs = v.vx * fx + v.vz * fz;
        if (along < cs) { F.vx += (cs - along) * fx; F.vz += (cs - along) * fz; }
      }
      if (a.kdT !== undefined && a.kdT < 0.8 && !done) a.kdT = 0.8; // uçarken kalkmasın
    }
    if (a.sync) a.sync();
    if (done || F.t > 4) {
      F.dist = Math.hypot(a.pos.x - F.hx, a.pos.z - F.hz);
      if (a.flight === F) { a.flight = null; a.lastFlight = { mode: F.sp > 10 ? 'fly' : 'hood', dist: F.dist, sp: F.sp, inCar: F.inCar }; }
      F.a = null; F.v = null;
      LIVE[i] = LIVE[LIVE.length - 1]; LIVE.pop(); POOL.push(F);
    }
  }
}
// test/teşhis erişimi
if (typeof window !== 'undefined') window.__hitStats = () => ({ hits: HIT_STATS.hits, ms: +HIT_STATS.ms.toFixed(2), worst: +HIT_STATS.worst.toFixed(2), part: Object.fromEntries(Object.entries(HIT_STATS.part).map(([k, v]) => [k, +v.toFixed(2)])), live: LIVE.length });

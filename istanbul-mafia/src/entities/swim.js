// [deniz] Oyuncu yüzme denetimi (player.js çağırır): suya giriş (düşüş hızıyla dalış + kaldırma kuvveti yayı),
// su çizgisi (dalga yüksekliğini izler; baş suyun üstünde), kulaç sıçratmaları (el suya girerken damlacık + halka),
// su yüzü dalga halkası (boşta su çiğnerken düzenli, yüzerken baştan), kıyıya çıkış:
//  - rıhtım merdiveni (game.seaLadders): merdivene yüzünce tutunur, basamak basamak tırmanır, üstte rıhtıma adım atar;
//  - alçak kenar (≤ 2.7 m, üstü boş: iskele, rıhtım bordürü): kollarla asılıp çekinme + diz atıp çıkma (1.5 sn).
// Korkuluklu sahil rıhtımlarında çıkış yalnız merdivenden (korkuluk boşluğu). Tırmanma betikli hareket (scriptCtl)
// olarak yürür; poz: model.seaClimb = {kind: 'ladder'|'ledge', u}.
import { WATER_Y, isLand, poolAt } from '../world/map.js';
import { waveH } from './boats.js';
import { clamp } from '../core/util.js';
import * as THREE from 'three';
import { SHARED, OCEAN } from '../world/shaders.js';

const _p = { x: 0, y: 0, z: 0 };

// Yüzerken su seviyesi (kök = su yüzü): yay + sönüm; suya girişte aşağı hızla hafif dalış
export function swimVertical(p, dt, g) {
  const t = g.ships ? g.ships.t : 0;
  const pool = poolAt(p.pos.x, p.pos.z); // [villa] havuzda dalgasız, havuzun su yüzü
  const target = pool ? pool.y : WATER_Y + waveH(p.pos.x, p.pos.z, t) * 0.8;
  p.vy += ((target - p.pos.y) * 22 - p.vy * 6.5) * dt;
  p.pos.y += p.vy * dt;
}

// [deniz] Görünen deniz yüzü (shaders.js OCEAN_WAVES ile aynı dalgalar; yakın plan, yapı sönümü yok sayılır):
// halka düz WATER_Y'ye konunca ±0,3 m dalgaların içinde kalıp parça parça "mavimsi leke" görünüyordu.
// Dönüş: yükseklik; _wn: yüzey eğimi (dh/dx, dh/dz).
const WV = [[0.8, 0.6, 24, 1, 0], [0.28, 0.96, 14, 0.6, 1.7], [0.95, -0.31, 9, 0.38, 4.1], [-0.5, 0.866, 5.5, 0.22, 2.3], [0.6, -0.8, 3.4, 0.1, 5.2], [-0.92, -0.39, 2.2, 0.055, 0.9]];
const _wn = { x: 0, z: 0 };
export function oceanH(x, z) {
  const t = SHARED.uTime.value, A = OCEAN.uWave.value;
  let h = 0; _wn.x = 0; _wn.z = 0;
  for (const w of WV) {
    const k = 6.2831853 / w[2], a = k * (w[0] * x + w[1] * z) - Math.sqrt(9.81 * k) * t + w[4];
    h += Math.sin(a) * w[3]; const c = Math.cos(a) * w[3] * k; _wn.x += c * w[0]; _wn.z += c * w[1];
  }
  _wn.x *= A; _wn.z *= A;
  return h * A;
}
// su yüzü köpük halkası: dalga yüksekliğine oturur, eğime yatar (çap = 0,5 + 2·r)
function foamRing(P, x, z, r, dur, a) {
  if (!P.rings) return;
  const h = oceanH(x, z);
  const m = P.rings.emit(x, WATER_Y + h + 0.06, z, r, dur, a, 0xeef3f4, true);
  if (m) m.rotation.set(-Math.atan(_wn.z), 0, Math.atan(_wn.x));
}

// suya giriş sıçraması (düşüş hızına göre)
export function enterWater(p, g) {
  const k = clamp(-p.vy / 6, 0.4, 1.6);
  g.audio.splash(p.pos.x, p.pos.z, k);
  g.particles.splash({ x: p.pos.x, y: WATER_Y + oceanH(p.pos.x, p.pos.z), z: p.pos.z }, false);
  // [deniz] eskiden 1,6·k yarıçap (çap 5,6 m'ye dek), toplamalı mavi (0xbfd8ff) + splash'ın ikinci mavi halkası; şimdi tek köpük halkası, çap ≤ 3 m
  foamRing(g.particles, p.pos.x, p.pos.z, 0.5 + 0.45 * k, 1.2, 0.55);
  p.vy = Math.max(p.vy, -6) * 0.55; // suyun direnci: dalış derinliği sınırlı
}

// El suya girerken sıçratma, su yüzünde dalga halkaları
export function swimEffects(p, dt, g) {
  const m = p.model, si = m.swimInfo;
  const P = g.particles;
  if (!si || !P) return;
  p._swRing = (p._swRing || 0) - dt;
  const moving = si.mv > 0.4;
  if (p._swRing <= 0) {
    p._swRing = moving ? 0.45 : 1.3;
    foamRing(P, p.pos.x, p.pos.z, moving ? 0.6 : 0.9, moving ? 1.0 : 1.8, moving ? 0.22 : 0.28);
    if (moving && g.boats && g.boats.wakes) g.boats.wakes.spawn(p.pos.x - p.vx * 0.15, p.pos.z - p.vz * 0.15, 0.5, 1.1, 1.6, 0.22);
  }
  // kulaç: her kolun suya girişi (faz 0'dan geçerken) elin konumunda damlacık + küçük halka
  if (moving && m.arms) {
    for (let i = 0; i < 2; i++) {
      const ph = (si.phase + i * 0.5) % 1, prev = si.prev !== undefined ? (si.prev + i * 0.5) % 1 : ph;
      if (ph < prev) {
        m.arms[i].wr.getWorldPosition(_v3);
        const x = _v3.x, z = _v3.z;
        for (let k = 0; k < 7; k++) P.norm.emit(x, WATER_Y + 0.05, z, (Math.random() - 0.5) * 1.6, 1.4 + Math.random() * 1.6, (Math.random() - 0.5) * 1.6, 0.55, 0.06 + Math.random() * 0.06, 0.85, 0.92, 1, 0.75, 0.15, 9);
        foamRing(P, x, z, 0.4, 0.7, 0.3);
      }
      // havadaki kolun damlaları (geri getiriş)
      if (ph > 0.6 && ph < 0.95 && Math.random() < dt * 10) {
        m.arms[i].wr.getWorldPosition(_v3);
        P.norm.emit(_v3.x, _v3.y, _v3.z, 0, -0.5, 0, 0.4, 0.04, 0.85, 0.92, 1, 0.6, 0, 9);
      }
    }
  }
  si.prev = si.phase;
}
const _v3 = new THREE.Vector3();

// Kıyıya çıkış denemesi (yüzerken, hareket yönünde). true dönerse tırmanma başladı.
export function tryClimbOut(p, g, mx, mz, ml) {
  if (ml < 0.1 || p.scriptCtl) return false;
  // 1) merdiven
  const L = g.seaLadders || [];
  let best = null, bd = 1.7;
  for (const l of L) {
    const dx = p.pos.x - l.x, dz = p.pos.z - l.z;
    if (Math.abs(dx) > 3 || Math.abs(dz) > 3) continue;
    const front = dx * l.nx + dz * l.nz; // merdivenin deniz tarafında mı
    const lat = Math.abs(-dx * l.nz + dz * l.nx);
    if (front < -0.2 || lat > 1.0) continue;
    const toward = -(mx * l.nx + mz * l.nz); // merdivene doğru yüzüyor mu
    if (toward < 0.4) continue;
    const d = Math.hypot(dx, dz);
    if (d < bd) { bd = d; best = l; }
  }
  if (best) { startClimb(p, g, 'ladder', best); return true; }
  // [villa] havuz: kenara doğru yüzünce kenardan çıkılır (önceden havuzdan hiç çıkılamıyordu: kenar deniz seviyesine göre aranıyordu)
  const pool = poolAt(p.pos.x, p.pos.z);
  if (pool) {
    const ax = p.pos.x + mx * 0.75, az = p.pos.z + mz * 0.75;
    if (poolAt(ax, az)) return false; // kenar henüz önde değil
    const ex = p.pos.x + mx * 1.2, ez = p.pos.z + mz * 1.2;
    let top = g.physics.groundAt(ex, ez);
    for (const b of g.physics.active.query(ex - 0.3, ez - 0.3, ex + 0.3, ez + 0.3, [])) if (b.y1 > pool.y - 0.6 && b.y1 < pool.y + 1.2 && b.y1 > top) top = b.y1;
    if (!(top > pool.y - 0.8 && top < pool.y + 1.2)) top = pool.y + 0.1;
    startClimb(p, g, 'ledge', { x: p.pos.x + mx * 0.35, z: p.pos.z + mz * 0.35, nx: -mx, nz: -mz, top, ex, ez });
    return true;
  }
  // 2) alçak kenar: önde kara / yürünebilir yüzey, en çok 2.7 m yukarıda, üstü boş
  const ax = p.pos.x + mx * 0.75, az = p.pos.z + mz * 0.75;
  let top = null;
  if (isLand(ax, az)) top = g.physics.groundAt(ax, az);
  const boxes = g.physics.active.query(ax - 0.2, az - 0.2, ax + 0.2, az + 0.2, []);
  for (const b of boxes) if (!b.noClimb && b.y1 > WATER_Y && b.y1 - WATER_Y < 2.8 && (top === null || b.y1 > top)) top = b.y1;
  if (top === null || top - WATER_Y > 2.7 || top < WATER_Y + 0.3) return false;
  _p.x = p.pos.x + mx * 1.15; _p.z = p.pos.z + mz * 1.15;
  const tmp = new THREE.Vector3(_p.x, top, _p.z);
  const r = g.physics.resolveCircle(tmp, p.radius, top + 0.05);
  if (r.hit || Math.abs(r.support - top) > 0.5 || Math.abs(tmp.x - _p.x) + Math.abs(tmp.z - _p.z) > 0.05) return false;
  startClimb(p, g, 'ledge', { x: p.pos.x + mx * 0.35, z: p.pos.z + mz * 0.35, nx: -mx, nz: -mz, top, ex: _p.x, ez: _p.z });
  return true;
}

function startClimb(p, g, kind, l) {
  const sx = p.pos.x, sz = p.pos.z, sy = p.pos.y;
  // merdivende: tutunma noktası (deniz tarafında 0.45 m), yüz merdivene dönük
  const hx = kind === 'ladder' ? l.x + l.nx * 0.5 : l.x, hz = kind === 'ladder' ? l.z + l.nz * 0.5 : l.z;
  const ex = kind === 'ladder' ? l.x - l.nx * 0.85 : l.ex, ez = kind === 'ladder' ? l.z - l.nz * 0.85 : l.ez;
  const heading = Math.atan2(-l.nx, -l.nz);
  const rise = l.top - WATER_Y;
  const dur = kind === 'ladder' ? 0.35 + rise / 0.85 + 0.7 : 1.5;
  const C = { kind, t: 0, dur, sx, sy, sz, hx, hz, ex, ez, top: l.top, heading };
  p.swimming = false; p.vx = 0; p.vz = 0; p.vy = 0; p.crouch = false;
  p.heading = heading;
  p.seaClimbing = C;
  p.scriptCtl = (dt) => climbStep(p, g, dt);
}

function climbStep(p, g, dt) {
  const C = p.seaClimbing;
  if (!C) { p.scriptCtl = null; return; }
  C.t += dt;
  const u = clamp(C.t / C.dur, 0, 1);
  const m = p.model;
  p.heading = C.heading;
  if (C.kind === 'ladder') {
    const tGrab = 0.35, tTop = C.dur - 0.7;
    if (C.t < tGrab) {
      const k = C.t / tGrab;
      p.pos.x = C.sx + (C.hx - C.sx) * k; p.pos.z = C.sz + (C.hz - C.sz) * k; p.pos.y = C.sy + (WATER_Y - 1.0 - C.sy) * k;
    } else if (C.t < tTop) {
      const k = (C.t - tGrab) / (tTop - tGrab);
      p.pos.x = C.hx; p.pos.z = C.hz; p.pos.y = WATER_Y - 1.0 + (C.top - 0.15 - (WATER_Y - 1.0)) * k;
    } else {
      const k = clamp((C.t - tTop) / 0.7, 0, 1), e = k * k * (3 - 2 * k);
      p.pos.x = C.hx + (C.ex - C.hx) * e; p.pos.z = C.hz + (C.ez - C.hz) * e; p.pos.y = C.top - 0.15 + 0.15 * e + 0.12 * Math.sin(Math.PI * k);
    }
    m.seaClimb = { kind: 'ladder', u, k: C.t < tGrab ? 0 : C.t < tTop ? 1 : 2, c: (p.pos.y - WATER_Y) / 0.6 };
  } else {
    // asıl → çekin → diz at → ayağa kalk
    const e = u * u * (3 - 2 * u);
    const yk = u < 0.55 ? Math.pow(u / 0.55, 1.3) : 1;
    p.pos.y = C.sy + (C.top - C.sy) * yk;
    const hk = clamp((u - 0.35) / 0.65, 0, 1);
    p.pos.x = C.sx + (C.ex - C.sx) * hk * hk * (3 - 2 * hk); p.pos.z = C.sz + (C.ez - C.sz) * hk * hk * (3 - 2 * hk);
    void e;
    m.seaClimb = { kind: 'ledge', u };
  }
  if (C.t >= C.dur) {
    p.seaClimbing = null; p.scriptCtl = null; m.seaClimb = null;
    p.pos.y = C.top; p.grounded = true; p.vy = 0;
    if (g.audio && g.audio.step) g.audio.step(p.pos.x, p.pos.z);
  }
  // tırmanırken damlayan su
  if (g.particles && Math.random() < dt * 8) g.particles.norm.emit(p.pos.x, p.pos.y + 0.8, p.pos.z, 0, -0.4, 0, 0.5, 0.04, 0.85, 0.92, 1, 0.6, 0, 9);
}

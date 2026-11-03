// Askeri kışla (yasak bölge, nöbet kuleleri, devriye askerler, cephanelik) ve karakol önü devriyeleri.
// Harita MILITARY_BASE dışa aktarıyorsa onu kullanır; yoksa kuzeybatıda yedek bölge tanımlar.
import * as THREE from 'three';
import * as MAP from '../world/map.js';
import { soldierLook, copLook } from '../entities/npc.js';

const BASE_KEY = ['MILITARY', 'BASE'].join('_'); // map.js dışa aktarırsa kullanılır
const FALLBACK = { x0: -990, x1: -870, z0: -990, z1: -700 };

function normZone(b) {
  if (!b) return { ...FALLBACK, fallback: true };
  if (b.x0 !== undefined) return { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, towers: b.towers, armory: b.armory };
  const w = b.w || b.width || (b.r ? b.r * 2 : 120), d = b.d || b.depth || (b.r ? b.r * 2 : 200);
  return { x0: b.x - w / 2, x1: b.x + w / 2, z0: b.z - d / 2, z1: b.z + d / 2, towers: b.towers, armory: b.armory };
}

export class Military {
  constructor(game) {
    this.g = game;
    this.zone = normZone(MAP[BASE_KEY]);
    const z = this.zone;
    this.cx = (z.x0 + z.x1) / 2; this.cz = (z.z0 + z.z1) / 2;
    this.alert = false;
    this.alertT = 0;
    this.warnT = 0;
    this.warned = false;
    this.soldiers = [];
    this.trucks = [];
    this.active = false;
    this.responseT = 0;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.built = false;
  }

  inZone(x, z, pad = 0) { const b = this.zone; return x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad; }
  distTo(x, z) { const b = this.zone; const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1); return Math.hypot(dx, dz); }

  // yol düğümleri üzerinden bölge içi devriye noktaları
  roadPoints() {
    const pts = [];
    for (const n of this.g.map.nodes) if (this.inZone(n.x, n.z, -2)) pts.push({ x: n.x + 6.5, z: n.z + 6.5 });
    if (pts.length < 3) {
      const b = this.zone;
      pts.push({ x: b.x0 + 10, z: b.z0 + 10 }, { x: b.x1 - 10, z: b.z0 + 10 }, { x: b.x1 - 10, z: b.z1 - 10 }, { x: b.x0 + 10, z: b.z1 - 10 });
    }
    return pts;
  }

  build() {
    if (this.built) return;
    this.built = true;
    const g = this.g, z = this.zone;
    const olive = new THREE.MeshStandardMaterial({ color: 0x4a5a30, roughness: 0.8 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 0.9 });
    const red = new THREE.MeshBasicMaterial({ color: 0xc81010 });
    // nöbet kuleleri (harita kendi kulelerini vermediyse)
    const towers = z.towers || (z.fallback ? [[z.x0 + 6, z.z0 + 6], [z.x1 - 6, z.z0 + 6], [z.x1 - 4, z.z1 - 4], [z.x0 + 6, z.z1 - 4]] : []);
    this.towerPts = [];
    for (const t of towers) {
      const [x, zz] = Array.isArray(t) ? t : [t.x, t.z];
      probe(g, x, zz);
      const tw = new THREE.Group();
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 7, 0.25), wood); leg.position.set(sx * 1.1, 3.5, sz * 1.1); tw.add(leg); }
      const floor = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 3), wood); floor.position.y = 7; tw.add(floor);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.4, 4), olive); roof.position.y = 9.2; roof.rotation.y = Math.PI / 4; tw.add(roof);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 3), new THREE.MeshStandardMaterial({ color: 0x5a4630, transparent: true, opacity: 0.85 })); rail.position.y = 7.6; tw.add(rail);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), red); lamp.position.y = 10; tw.add(lamp);
      tw.position.set(x, 0, zz);
      this.group.add(tw);
      g.physics.city.add(x - 1.5, zz - 1.5, x + 1.5, zz + 1.5, 6.85, 7.15, 'towerFloor');
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.physics.city.add(x + sx * 1.1 - 0.15, zz + sz * 1.1 - 0.15, x + sx * 1.1 + 0.15, zz + sz * 1.1 + 0.15, 0, 7, 'towerLeg');
      this.towerPts.push({ x, z: zz });
    }
    // giriş levhaları (yol kesişimleri bölge sınırında)
    const signMat = new THREE.MeshBasicMaterial({ map: signTex('ASKERİ BÖLGE · GİRMEK YASAKTIR'), side: THREE.DoubleSide });
    for (const n of g.map.nodes) {
      if (!this.inZone(n.x, n.z, 30) || this.inZone(n.x, n.z, -8)) continue;
      const s = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), olive); pole.position.y = 1.3; s.add(pole);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), signMat); p.position.y = 2.5; s.add(p);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(6, 0.15, 0.15), new THREE.MeshStandardMaterial({ color: 0xe8e8e8 })); bar.position.set(3, 1.0, 0); s.add(bar);
      s.position.set(n.x + 7.5, 0, n.z + 7.5);
      s.rotation.y = Math.atan2(this.cx - n.x, this.cz - n.z);
      this.group.add(s);
    }
    // cephanelik kapısı: bölgedeki en merkezi binanın kapısı
    let best = null, bd = 1e9;
    if (z.armory) best = { door: { x: z.armory.x, z: z.armory.z, nz: z.armory.nz || 1 }, id: 'armory', type: 'armory', name: 'Cephanelik' };
    else for (const b of g.map.buildings) {
      if (!this.inZone(b.door.x, b.door.z, -6) || b.tower) continue;
      const d = Math.hypot(b.door.x - this.cx, b.door.z - this.cz);
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) {
      // bölgede bina yoksa merkezde ayrı bir cephanelik kapısı aç
      best = { id: 'mil-armory', type: 'armory', name: 'Cephanelik', door: { x: this.cx, z: this.cz, nz: 1 } };
      g.city.doors.push({ x: best.door.x, z: best.door.z + 0.8, building: best });
    }
    if (best) {
      if (best.type === 'apartment') { best.type = 'armory'; best.name = 'Cephanelik'; }
      this.armory = best;
      if (z.armory) g.city.doors.push({ x: best.door.x, z: best.door.z + best.door.nz * 0.8, building: best });
    }
  }

  raiseAlert(why) {
    const g = this.g;
    if (!this.alert) {
      g.ui.bigMessage('ALARM!', why || 'Kışlada izinsiz giriş', 'red', 2.5);
      g.audio.tone && g.audio.tone({ freq: 520, dur: 0.8, type: 'sawtooth', gain: 0.15 });
      if (g.wanted.level < 3) g.wanted.add(3 - g.wanted.level, true);
    }
    this.alert = true; this.alertT = 60;
    for (const s of this.soldiers) if (!s.dead && Math.hypot(s.pos.x - g.player.pos.x, s.pos.z - g.player.pos.z) < 90) s.engage(g.player, 0.8);
  }

  spawnGarrison() {
    const g = this.g;
    const pts = this.roadPoints();
    const MB = MAP[BASE_KEY] || {};
    // [savaş] dünya verisi: devriye rotaları ve nöbet noktaları (yoksa yol noktaları / doğma noktaları)
    const routes = Array.isArray(MB.patrolRoutes) && MB.patrolRoutes.length ? MB.patrolRoutes.map((r) => (r.points || r).map((q) => (Array.isArray(q) ? { x: q[0], z: q[1] } : { x: q.x, z: q.z }))).filter((r) => r.length >= 2) : null;
    if (routes && routes.length) {
      routes.forEach((r, i) => {
        for (let k = 0; k < (r.length > 4 ? 2 : 1); k++) {
          const st = r[(k * 2) % r.length];
          const s = g.npcs.add('soldier', st.x + (Math.random() - 0.5) * 2, st.z + (Math.random() - 0.5) * 2, soldierLook(), { state: 'patrol', baseState: 'patrol', patrol: r, persistent: true, name: 'Er' });
          s.patrolIdx = (k * 2 + 1) % r.length; s.walkSpeed = 1.2;
          this.soldiers.push(s);
        }
        void i;
      });
    } else {
      const n = Math.min(10, 4 + Math.floor(pts.length));
      for (let i = 0; i < n; i++) {
        const a = pts[i % pts.length], b = pts[(i + 1) % pts.length];
        const s = g.npcs.add('soldier', a.x + (Math.random() - 0.5) * 3, a.z + (Math.random() - 0.5) * 3, soldierLook(), { state: 'patrol', baseState: 'patrol', patrol: [a, b], persistent: true, name: 'Er' });
        this.soldiers.push(s);
      }
    }
    const posts = Array.isArray(MB.guardPosts) && MB.guardPosts.length ? MB.guardPosts
      : (MB.gate ? [{ x: MB.gate.x - 5, z: MB.gate.z - 2, heading: Math.atan2(MB.gate.nx || 0, MB.gate.nz || 1) }, { x: MB.gate.x + 5, z: MB.gate.z - 2, heading: Math.atan2(MB.gate.nx || 0, MB.gate.nz || 1) }] : []);
    for (const q of posts.slice(0, 12)) {
      const x = Array.isArray(q) ? q[0] : q.x, z = Array.isArray(q) ? q[1] : q.z, h = Array.isArray(q) ? q[2] : q.heading;
      const y = (q && q.y) || 0;
      const s = g.npcs.add('soldier', x, z, soldierLook(), { state: 'guard', home: new THREE.Vector3(x, y, z), persistent: true, name: 'Nöbetçi' });
      if (y) s.pos.y = y;
      s.faceYaw = h !== undefined ? h : Math.atan2(x - this.cx, z - this.cz);
      s.gatePost = true;
      this.soldiers.push(s);
    }
    // kule nöbetçileri
    for (const t of this.towerPts || []) {
      const s = g.npcs.add('soldier', t.x, t.z, soldierLook(), { state: 'guard', home: new THREE.Vector3(t.x, 7.2, t.z), persistent: true, weapon: 'm4', y: 7.2, name: 'Nöbetçi' });
      s.pos.y = 7.2; s.faceYaw = Math.atan2(t.x - this.cx, t.z - this.cz);
      this.soldiers.push(s);
    }
    // tank / cip sergisi (araç modülü destekliyorsa)
    if (g.vehicles.spawnProp && !this.props) {
      this.props = [];
      const p0 = pts[0], p1 = pts[Math.min(1, pts.length - 1)];
      try { this.props.push(g.vehicles.spawnProp('tank', p0.x - 6, p0.z - 4, 0)); this.props.push(g.vehicles.spawnProp('cip', p1.x - 5, p1.z + 4, 1.2)); } catch (e) { /* yok say */ }
    }
    // askeri kamyonlar
    for (let i = 0; i < 2; i++) {
      const p = pts[(i * 2) % pts.length];
      const v = g.vehicles.add('swat', p.x + 4, p.z + 6, 0, '#4a5a30');
      v.parked = true; v.military = true; v.mission = true;
      this.trucks.push(v);
    }
  }
  despawn() {
    const g = this.g;
    for (const s of this.soldiers) g.npcs.remove(s);
    this.soldiers = [];
    for (const v of this.trucks) if (v !== g.player.vehicle && !v.stolen) g.vehicles.remove(v); else v.mission = false;
    this.trucks = [];
  }

  update(dt) {
    const g = this.g, p = g.player;
    if (!this.built) this.build();
    if (p.inInterior) return;
    const d = this.distTo(p.pos.x, p.pos.z);
    if (d < 220 && !this.active) { this.active = true; this.spawnGarrison(); }
    else if (d > 320 && this.active) { this.active = false; this.despawn(); }
    // [savaş] alarm: bölge dışında geri sayar; bitince askerler devriyeye döner
    if (this.alertT > 0) {
      if (!this.inWarn(p.pos.x, p.pos.z)) this.alertT -= dt;
      else if (this.inLethal(p.pos.x, p.pos.z)) { this.lethalT = (this.lethalT || 0) + dt; if (this.lethalT > 20 && g.wanted.level < 5) { g.wanted.add(5 - g.wanted.heat, true); this.lethalT = 0; } }
      if (this.alertT <= 0) this.calm();
    }
    // [savaş] kademeli uyarı: uyarı bölgesi -> son uyarı -> ateş
    const stealth = g.missions.active && g.missions.active.stealthBase && !g.missions.s.spotted;
    if (!this.alert && !stealth && !p.dead && this.active) this.updateWarnings(dt, p);
    else if (!this.inWarn(p.pos.x, p.pos.z)) this.stage = 0;
    if (!this.trespass(p.pos.x, p.pos.z)) this.inTrespass = false;
    // 5 yıldız ve kışla yakını: askeri müdahale — [kanun] birlik nizamiyeden kamyonla çıkar, gelir, iner
    if (g.wanted.level >= 5 && d < 450) {
      this.responseT -= dt;
      if (this.responseT <= 0) {
        this.responseT = 25;
        const alive = this.soldiers.filter((s) => !s.dead).length;
        const gate = (MAP[BASE_KEY] || {}).gate;
        if (alive < 14 && g.wanted.dispatchUnit) {
          const u = g.wanted.dispatchUnit('army', { from: gate ? { x: gate.x, z: gate.z + 12 } : { x: this.cx, z: this.cz }, minD: 90, maxD: 220 });
          if (u) { for (const n of u.crew) this.soldiers.push(n); g.ui.notify('Askerî birlik kışladan çıktı!', 'warn'); }
        }
      }
    }
  }
  // ---- [savaş: yasak bölge şekilleri] MAP.MILITARY_BASE.warnZone / lethalZone: {x0,x1,z0,z1} | {x,z,r} | {pad}
  inShape(s, x, z, fallbackPad) {
    if (!s) return this.inZone(x, z, fallbackPad);
    if (s.r !== undefined && s.x !== undefined) return Math.hypot(x - s.x, z - s.z) < s.r;
    if (s.x0 !== undefined) return x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1;
    if (Array.isArray(s) && s.length >= 3) { // çokgen
      let inside = false;
      for (let i = 0, j = s.length - 1; i < s.length; j = i++) {
        const xi = s[i].x ?? s[i][0], zi = s[i].z ?? s[i][1], xj = s[j].x ?? s[j][0], zj = s[j].z ?? s[j][1];
        if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
      }
      return inside;
    }
    return this.inZone(x, z, s.pad !== undefined ? s.pad : fallbackPad);
  }
  // [kanun] Kurallar: yoldan geçen yaya/araç (siviller gibi) asla vurulmaz. Uyarı yalnızca
  //  (1) duvarların içine izinsiz girme, (2) nizamiye kapısına dayanma, (3) duvara tırmanma girişimi,
  //  (4) üs yakınında ateş açma durumunda verilir; uyarıya uyulmazsa ateş serbest.
  inWarn(x, z) { return this.inZone(x, z, 12); } // alarm geri sayımı: üsten uzaklaşınca söner
  inLethal(x, z) { const MB = MAP[BASE_KEY] || {}; return this.inShape(MB.lethalZone, x, z, 0); }
  trespass(x, z) { return this.inZone(x, z, -0.4); } // duvarların içi
  atGate(x, z) {
    const gt = (MAP[BASE_KEY] || {}).gate;
    if (!gt) return false;
    return Math.abs(x - gt.x) < 8.5 && z > this.zone.z1 - 0.5 && z < this.zone.z1 + 7;
  }
  // dış duvara uzaklık (dışarıdan)
  wallDist(x, z) {
    const b = this.zone;
    if (this.inZone(x, z, 0)) return 0;
    const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
    return Math.hypot(dx, dz);
  }
  warnSay(text) {
    const s = this.nearestSoldier();
    if (s) { s.barkT = 0; s.say(text); s.state !== 'attack' && (s.faceYaw = Math.atan2(this.g.player.pos.x - s.pos.x, this.g.player.pos.z - s.pos.z)); }
    else this.g.audio.megaphone && this.g.audio.megaphone(text, this.cx, this.cz);
  }
  // oyuncu üs yakınında ateş etti (npc.hearThreat çağırır)
  onPlayerShot(x, z) {
    const g = this.g;
    if (this.alert || !this.active) return this.alert;
    if (this.trespass(x, z) || this.wallDist(x, z) < 25) { this.raiseAlert('Ateş açıldı!'); return true; }
    const now = g.wanted.clockT || 0;
    if ((this.shotWarnAt || -99) + 12 > now) { this.raiseAlert('Uyarıya rağmen ateş açıldı!'); return true; }
    this.shotWarnAt = now;
    this.stage = Math.max(this.stage || 0, 2); this.stageT = 0;
    g.ui.bigMessage('SON UYARI', 'Ateşi kes! Askerî bölge — karşılık verilecek!', 'red', 2.5);
    this.warnSay('Ateşi kes! Bir daha ateş edersen karşılık veririz!');
    return false;
  }
  updateWarnings(dt, p) {
    const g = this.g;
    const x = p.pos.x, z = p.pos.z;
    const inside = this.trespass(x, z), inL = this.inLethal(x, z);
    const gate = !inside && this.atGate(x, z) && (!p.vehicle || p.vehicle.speed < 6);
    // duvara tırmanma girişimi: duvarın dibinde zıplama / tırmanma
    if (!inside && !p.vehicle && this.wallDist(x, z) < 1.6 && (p.vy > 1.5 || p.vault)) {
      const now = g.wanted.clockT || 0;
      if ((this.climbAt || -99) + 1.2 < now) {
        this.climbN = (this.climbAt || -99) + 30 > now ? (this.climbN || 0) + 1 : 1;
        this.climbAt = now;
        if (this.climbN === 1) { this.stage = Math.max(this.stage || 0, 1); this.stageT = 0; g.ui.bigMessage('ASKERİ YASAK BÖLGE', 'Duvardan uzaklaş!', 'red', 2.5); this.warnSay('Duvardan in! Askeri bölge!'); }
        else if (this.climbN === 2) { this.stage = 2; this.stageT = 0; g.ui.bigMessage('SON UYARI', 'Tırmanmaya kalkarsan ateş açılacak!', 'red', 2.5); this.warnSay('Son uyarı! Bir daha tırmanırsan vururum!'); }
        else { this.stage = 3; this.raiseAlert('Duvara tırmanma girişimi — ateş serbest!'); return; }
      }
    }
    if (!inside && !inL) {
      if (gate && !this.stage) {
        this.stage = 1; this.stageT = 0; this.warned = true;
        g.ui.bigMessage('ASKERİ BÖLGE', 'Nizamiye: izinsiz giriş yasak. Geri çekil.', 'red', 2.5);
        this.warnSay('Dur! Burası askeri bölge, geri çekil!');
      }
      this.outT = (this.outT || 0) + dt;
      if (this.outT > 4 && !gate && !((this.climbAt || -99) + 30 > (g.wanted.clockT || 0))) { this.stage = 0; this.warned = false; }
      return;
    }
    // izinsiz giriş: uyarı -> son uyarı -> ateş
    this.outT = 0;
    if (!this.inTrespass) {
      this.inTrespass = true;
      if ((this.stage || 0) <= 1) { this.stage = 1; this.stageT = 0; this.warned = true; g.ui.bigMessage('ASKERİ YASAK BÖLGE', 'Dur! Yaklaşma! Geri çekil.', 'red', 3); this.warnSay('Dur! Yaklaşma! Askeri yasak bölge!'); }
    }
    this.stageT += dt;
    if (this.stage === 1 && (inL || this.stageT > 3.5)) {
      this.stage = 2; this.stageT = 0;
      g.ui.bigMessage('SON UYARI', 'Hemen geri çekil — ateş açılacak!', 'red', 2.5);
      this.warnSay('Bu son uyarım, ateş açarım!');
      for (const s of this.soldiers) if (!s.dead && Math.hypot(s.pos.x - p.pos.x, s.pos.z - p.pos.z) < 60) { s.aiming = true; s.faceYaw = Math.atan2(p.pos.x - s.pos.x, p.pos.z - s.pos.z); }
    }
    if (this.stage === 2 && this.stageT > (inL ? 2.5 : 3)) { this.stage = 3; this.raiseAlert('Uyarılara uyulmadı — ateş serbest!'); }
  }
  // alarm bitti: askerler devriye/nöbet yerine döner, takviye birlikler dağılır
  calm() {
    const g = this.g;
    this.alert = false; this.alertT = 0; this.stage = 0; this.warned = false; this.lethalT = 0;
    for (const s of this.soldiers) {
      if (s.dead) continue;
      s.hostile = false;
      if (s.state === 'attack') { s.state = s.restState(); s.target = null; s.path = []; s.coverPt = null; }
    }
    g.ui.notify('Kışlada alarm sona erdi.', 'info');
  }
  nearestSoldier() {
    const p = this.g.player;
    let best = null, bd = 1e9;
    for (const s of this.soldiers) { if (s.dead) continue; const d = Math.hypot(s.pos.x - p.pos.x, s.pos.z - p.pos.z); if (d < bd) { bd = d; best = s; } }
    return best;
  }
}

function probe(g, x, z) { void g; void x; void z; }

function signTex(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#c81010'; x.fillRect(0, 0, 512, 128);
  x.strokeStyle = '#fff'; x.lineWidth = 8; x.strokeRect(6, 6, 500, 116);
  x.fillStyle = '#fff'; x.font = 'bold 30px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 256, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Karakol önü: devriye polisler ve park halindeki ekip araçları
export class PoliceStations {
  constructor(game) {
    this.g = game;
    this.near = new Map(); // bina id -> {cops, cars}
    this.t = 0;
  }
  update(dt) {
    const g = this.g, p = g.player;
    this.t -= dt;
    if (this.t > 0 || p.inInterior) return;
    this.t = 1;
    for (const b of g.map.specials) {
      if (b.type !== 'police') continue;
      const d = Math.hypot(b.door.x - p.pos.x, b.door.z - p.pos.z);
      const st = this.near.get(b.id);
      if (d < 160 && !st) this.populate(b);
      else if (d > 220 && st) this.depopulate(b);
    }
  }
  populate(b) {
    const g = this.g;
    const nz = b.door.nz || 1;
    const dx = b.door.x, dz = b.door.z + nz * 2;
    const cops = [], cars = [];
    const pts = [{ x: dx - 7, z: dz }, { x: dx + 7, z: dz }, { x: dx + 7, z: dz + nz * 1.5 }, { x: dx - 7, z: dz + nz * 1.5 }];
    for (let i = 0; i < 2; i++) {
      const n = g.npcs.add('police', pts[i].x, pts[i].z, copLook(), { state: 'patrol', baseState: 'patrol', patrol: i ? pts.slice(1).concat(pts[0]) : pts, persistent: true });
      cops.push(n);
    }
    const guard = g.npcs.add('police', dx + 2.2, dz, copLook(), { state: 'guard', home: new THREE.Vector3(dx + 2.2, 0, dz), persistent: true });
    guard.faceYaw = nz > 0 ? 0 : Math.PI;
    cops.push(guard);
    // yolun kenarına park eden ekip araçları
    const n = g.map.nearestNode(dx, dz + nz * 6);
    if (n) {
      let e = null, bd = 1e9;
      for (const ed of n.edges) { const o = g.map.other(ed, n); const mx = (o.x + n.x) / 2, mz = (o.z + n.z) / 2; const dd = Math.hypot(mx - dx, mz - dz); if (dd < bd) { bd = dd; e = ed; } }
      if (e) {
        const o = g.map.other(e, n);
        const ex = o.x - n.x, ez = o.z - n.z, el = Math.hypot(ex, ez) || 1;
        const fx = ex / el, fz = ez / el;
        // kapıya en yakın nokta
        const t = Math.max(15, Math.min(el - 15, (dx - n.x) * fx + (dz - n.z) * fz));
        for (let i = 0; i < 2; i++) {
          const along = t + (i - 0.5) * 7;
          let rx = -fz, rz = fx;
          const px = n.x + fx * along, pz = n.z + fz * along;
          if ((dx - px) * rx + (dz - pz) * rz < 0) { rx = -rx; rz = -rz; }
          const off = e.width / 2 - 1.2;
          const v = g.vehicles.add('police', px + rx * off, pz + rz * off, Math.atan2(fx, fz));
          v.parked = true; v.mission = true; v.stationCar = true;
          cars.push(v);
        }
      }
    }
    this.near.set(b.id, { cops, cars });
  }
  depopulate(b) {
    const g = this.g;
    const st = this.near.get(b.id);
    for (const n of st.cops) g.npcs.remove(n);
    for (const v of st.cars) { if (v === g.player.vehicle || v.driver) v.mission = false; else g.vehicles.remove(v); }
    this.near.delete(b.id);
  }
}

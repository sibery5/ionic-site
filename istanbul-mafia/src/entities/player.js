// Oyuncu: ivmeli yürüme/koşma, çömelme (C), zıplama (çakal süresi + tampon), alçak engel aşma, takla (koşarken C),
// yüzme, omuz üstü nişan (V: omuz değiştir), ateş, araç kullanma ve üçüncü şahıs kamera.
import * as THREE from 'three';
import { Actor } from './actor.js';
import { clamp, damp, dampAngle, angleDiff } from '../core/util.js';
import { WEAPONS, WEAPON_ORDER } from '../game/weapons.js';
import { isLand, WATER_Y } from '../world/map.js';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const TGT = new THREE.Vector3();
const VAULT_TMP = [];
const VAULT_END = new THREE.Vector3(), VAULT_CHK = new THREE.Vector3(), VAULT_PRE = new THREE.Vector3();
// kamera çarpışma ışınları (yan, yukarı ofsetleri): kaba küre taraması
const CAM_RAYS = [[0, 0], [0.18, 0.1], [-0.18, 0.1], [0, -0.12]];

export class Player extends Actor {
  constructor(game, look) {
    super(game, look);
    this.isPlayer = true;
    this.faction = 'player';
    this.camYaw = Math.PI;
    this.camPitch = 0.25;
    this.camDist = 4.2;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.stamina = 100;
    this.inInterior = null;
    this.carCam = 0;
    this.carCamYawOffset = 0;
    this.carCamIdle = 0;
    this.enterT = 0;
    this.lastVehicle = null;
    this.swimT = 0;
    this.stepT = 0;
    this.aimDir = new THREE.Vector3(0, 0, 1);
    this.camShake = 0;
    this.shoulder = 1; // omuz tarafı (V ile değişir)
    this.aimYaw = 0;
    this.vault = null; this.vaultT = 0; this.rollT = 0;
    this.vx = 0; this.vz = 0;
  }

  onDamaged(dmg) { this.game.ui.onPlayerDamaged(dmg); }
  onDeath(attacker, kind) { this.game.onPlayerDeath(attacker, kind); }

  cycleWeapon(dir) {
    const owned = WEAPON_ORDER.filter((id) => this.weapons[id]);
    let i = owned.indexOf(this.weapon);
    i = (i + dir + owned.length) % owned.length;
    this.setWeapon(owned[i]);
    this.game.ui.showWeaponWheel();
  }
  selectSlot(slot) {
    const owned = WEAPON_ORDER.filter((id) => this.weapons[id] && WEAPONS[id].slot === slot);
    if (!owned.length) return;
    const i = owned.indexOf(this.weapon);
    this.setWeapon(owned[(i + 1) % owned.length]);
    this.game.ui.showWeaponWheel();
  }

  update(dt, input) {
    const g = this.game;
    const s = g.settings;
    this.updateWeapon(dt);
    if (this.dead) {
      this.aiming = false; this.vault = null; this.vaultT = 0; this.rollT = 0;
      this.model.animate(dt, this.animState());
      this.syncModel();
      this.updateCamera(dt);
      return;
    }
    // fare ile kamera
    const sens = 0.0022 * s.sensitivity;
    this.camYaw -= input.mouse.dx * sens;
    this.camPitch += input.mouse.dy * sens * (s.invertY ? -1 : 1);
    this.camPitch = clamp(this.camPitch, -0.6, 1.2);
    if (input.mouse.wheel && !input.down('ShiftLeft')) {
      if (!this.vehicle) this.cycleWeapon(input.mouse.wheel > 0 ? 1 : -1);
    }
    if (this.vehicle) this.updateDriving(dt, input);
    else this.updateOnFoot(dt, input);
    this.updateCamera(dt);
  }

  // Alçak engel (korkuluk, bank, çöp kutusu; 0.42-1.25 m) üzerinden atlama ya da üstüne tırmanma
  tryVault(dx, dz, allowWater) {
    const g = this.game, p = this.pos;
    const px = p.x + dx * 0.7, pz = p.z + dz * 0.7;
    const boxes = g.physics.active.query(px - 0.4, pz - 0.4, px + 0.4, pz + 0.4, VAULT_TMP);
    for (const b of boxes) {
      const top = b.y1 - p.y;
      if (top <= 0.42 || top > 1.25 || b.y0 > p.y + 0.3) continue;
      // yatay ışın - kutu: giriş/çıkış mesafesi
      let t0 = -Infinity, t1 = Infinity;
      for (const [o, d, lo, hi] of [[p.x, dx, b.x0, b.x1], [p.z, dz, b.z0, b.z1]]) {
        if (Math.abs(d) < 1e-6) { if (o < lo || o > hi) { t0 = Infinity; break; } continue; }
        let a = (lo - o) / d, c = (hi - o) / d; if (a > c) { const tt = a; a = c; c = tt; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, c);
      }
      if (!(t0 <= t1) || t0 > 1.1 || t0 < -0.05) continue;
      const over = t1 - t0 < 0.9;
      const dist = over ? t1 + this.radius + 0.3 : t0 + this.radius + 0.35;
      const e = VAULT_END.set(p.x + dx * dist, over ? p.y : b.y1, p.z + dz * dist);
      VAULT_PRE.copy(e); VAULT_CHK.copy(e);
      const r = g.physics.resolveCircle(VAULT_CHK, this.radius, e.y + 0.05);
      if (VAULT_PRE.distanceTo(VAULT_CHK) > 0.05) continue;
      if (over) e.y = r.support;
      if (!allowWater && g.physics.inWater(e.x, e.z)) continue;
      if (e.y < p.y - 2.5) continue;
      this.vault = { t: 0, dur: over ? 0.5 : 0.65, over, sx: p.x, sy: p.y, sz: p.z, ex: e.x, ey: e.y, ez: e.z, top: b.y1, dx, dz };
      this.crouch = false;
      this.heading = Math.atan2(dx, dz);
      return true;
    }
    return false;
  }

  updateOnFoot(dt, input) {
    const g = this.game;
    // silah seçimi
    for (let k = 0; k <= 8; k++) if (input.hit('Digit' + (k + 1))) this.selectSlot(k);
    if (input.hit('KeyQ')) this.cycleWeapon(1);
    if (input.hit('KeyR')) this.startReload();
    if (input.hit('KeyV')) this.shoulder = -this.shoulder;

    const f = { x: Math.sin(this.camYaw), z: Math.cos(this.camYaw) };
    const rgt = { x: -f.z, z: f.x };
    let mx = 0, mz = 0;
    if (input.down('KeyW')) { mx += f.x; mz += f.z; }
    if (input.down('KeyS')) { mx -= f.x; mz -= f.z; }
    if (input.down('KeyD')) { mx += rgt.x; mz += rgt.z; }
    if (input.down('KeyA')) { mx -= rgt.x; mz -= rgt.z; }
    const ml = Math.hypot(mx, mz);
    if (ml > 0.01) { mx /= ml; mz /= ml; }
    const busy = !!(this.vault || this.rollT > 0);
    this.aiming = input.mouse.right && this.wdef.type !== 'melee' && !busy;
    const wantSprint = input.down('ShiftLeft') && ml > 0 && !this.aiming;
    if (wantSprint && this.crouch && this.stamina > 10) this.crouch = false;
    const sprint = wantSprint && this.stamina > 5 && !this.crouch && !this.swimming;
    // C: çömelme; koşarken C: öne takla
    if (input.hit('KeyC') && !this.swimming && !busy) {
      if (sprint && this.speed > 4 && this.grounded && this.stamina > 15) {
        this.rollT = 0.001; this.rollDir = { x: this.vx / this.speed, z: this.vz / this.speed }; this.stamina -= 15;
        this.heading = Math.atan2(this.rollDir.x, this.rollDir.z);
      } else this.crouch = !this.crouch;
    }
    let speed = this.swimming ? (sprint ? 3.5 : 2.2) : this.aiming ? (this.crouch ? 1.4 : 2.4) : this.crouch ? 1.7 : sprint ? 7.4 : 3.6;
    speed *= 1 + g.state.stats.stamina * 0.002;
    if (this.landSlow > 0) { this.landSlow -= dt; speed *= 0.55; }
    if (this.vault) {
      const V = this.vault;
      V.t += dt;
      const u = Math.min(1, V.t / V.dur), e = u * u * (3 - 2 * u);
      this.pos.x = V.sx + (V.ex - V.sx) * e; this.pos.z = V.sz + (V.ez - V.sz) * e;
      if (V.over) this.pos.y = V.sy + (V.ey - V.sy) * u + Math.max(0, V.top + 0.12 - Math.max(V.sy, V.ey)) * Math.sin(Math.PI * Math.min(1, u * 1.15));
      else this.pos.y = V.sy + (V.ey - V.sy) * Math.min(1, e / 0.6) + 0.08 * Math.sin(Math.PI * u);
      this.vaultT = Math.max(0.001, u);
      const sp = Math.min(5.5, Math.max(3, this.speed));
      this.vx = V.dx * sp; this.vz = V.dz * sp; this.vy = 0;
      if (u >= 1) { this.vault = null; this.vaultT = 0; this.grounded = true; }
    } else if (this.rollT > 0) {
      this.rollT += dt / 0.7;
      const k = 6.2 * (1 - 0.45 * Math.min(1, this.rollT));
      this.vx = this.rollDir.x * k; this.vz = this.rollDir.z * k;
      if (this.rollT >= 1) this.rollT = 0;
    } else {
      // ivmelenme / yavaşlama eğrisi; havada az kontrol; ters yöne dönüşte daha hızlı fren
      const tx = ml > 0 ? mx * speed : 0, tz = ml > 0 ? mz * speed : 0;
      const accel = !this.grounded && !this.swimming ? 3 : ml > 0 ? (sprint ? 9 : 16) : 18;
      let ex = tx - this.vx, ez = tz - this.vz;
      const el = Math.hypot(ex, ez), maxd = accel * dt * (this.vx * tx + this.vz * tz < 0 ? 2 : 1);
      if (el > maxd) { ex *= maxd / el; ez *= maxd / el; }
      this.vx += ex; this.vz += ez;
    }
    if (ml > 0.01 && !busy && !this.aiming) this.heading = dampAngle(this.heading, Math.atan2(mx, mz), sprint ? 8 : 11, dt);
    // nişanda: bacaklar kameraya döner, üst gövde anında takip eder (aimYaw)
    if (this.aiming) {
      this.heading = dampAngle(this.heading, this.camYaw, this.speed > 0.5 ? 16 : 7, dt);
      const d = angleDiff(this.heading, this.camYaw);
      if (Math.abs(d) > 1.1) this.heading = this.camYaw - Math.sign(d) * 1.1;
      this.aimYaw = clamp(angleDiff(this.heading, this.camYaw), -1.1, 1.1);
    } else this.aimYaw = damp(this.aimYaw || 0, 0, 10, dt);
    // dayanıklılık: koşu tüketir, kısa gecikmeden sonra dolar
    if (sprint && this.speed > 1) { this.stamina -= dt * 12; g.state.stats.runTime += dt; this.staminaDelay = 0.8; }
    else if ((this.staminaDelay = (this.staminaDelay || 0) - dt) <= 0) this.stamina = Math.min(100, this.stamina + dt * 20);
    this.stamina = Math.max(0, this.stamina);
    if (this.knock && this.knock.t > 0) { this.knock.t -= dt; this.vx += this.knock.x * dt * 10; this.vz += this.knock.z * dt * 10; }

    const prevX = this.pos.x, prevZ = this.pos.z;
    if (!this.vault) { this.pos.x += this.vx * dt; this.pos.z += this.vz * dt; }
    this.speed = Math.hypot(this.vx, this.vz);
    // yerel hareket yönü (yan adım / geri adım animasyonu)
    const ch = Math.cos(this.heading), sh = Math.sin(this.heading);
    if (this.speed > 0.1) { this.moveLocalX = (this.vx * ch - this.vz * sh) / this.speed; this.moveLocalZ = (this.vx * sh + this.vz * ch) / this.speed; }

    // otomatik engel aşma: koşarken (ya da Space ile) alçak engele doğru
    if (!busy && this.grounded && !this.swimming && ml > 0 && this.speed > 2.5 && (sprint || input.hit('Space'))) {
      if (this.tryVault(mx, mz, input.hit('Space'))) input.pressed.delete('Space');
    }

    // yüzme ve kıyıya çıkma
    const water = g.physics.inWater(this.pos.x, this.pos.z);
    if (this.swimming) {
      const ax = this.pos.x + (this.vx / (this.speed || 1)) * 0.9, az = this.pos.z + (this.vz / (this.speed || 1)) * 0.9;
      if (this.speed > 0.5 && isLand(ax, az)) {
        this.pos.x += (this.vx / this.speed) * 1.6; this.pos.z += (this.vz / this.speed) * 1.6;
        if (isLand(this.pos.x, this.pos.z)) { this.pos.y = 0; this.swimming = false; this.vy = 0; }
        else { this.pos.x = prevX; this.pos.z = prevZ; }
      }
    }
    if (water && !this.swimming && this.pos.y < 0.5 && !this.vault) {
      this.swimming = true; this.vy = 0; this.rollT = 0;
      g.audio.splash(this.pos.x, this.pos.z); g.particles.splash({ x: this.pos.x, y: WATER_Y, z: this.pos.z });
      this.crouch = false;
    }
    if (this.swimming) {
      this.pos.y = damp(this.pos.y, WATER_Y + 0.1, 6, dt);
      if (!g.physics.inWater(this.pos.x, this.pos.z) && this.pos.y > -0.5) this.swimming = false;
      this.aiming = false;
      if (this.weapon !== 'fists') this.model.setWeapon(null);
    } else if (this.model.weaponId !== this.weapon) this.model.setWeapon(this.weapon);

    // yerçekimi, zıplama (çakal süresi + tuş tamponu), iniş
    if (!this.swimming && !this.vault) {
      if (input.hit('Space')) this.jumpBuf = 0.15;
      this.jumpBuf = (this.jumpBuf || 0) - dt;
      this.coyote = this.grounded ? 0.12 : (this.coyote || 0) - dt;
      if (this.jumpBuf > 0 && this.coyote > 0 && this.rollT <= 0) {
        this.vy = 6.4; this.grounded = false; this.coyote = 0; this.jumpBuf = 0;
        this.crouch = false;
        this.stamina = Math.max(0, this.stamina - 5);
      }
      this.vy -= 20 * dt;
      this.pos.y += this.vy * dt;
      const r = g.physics.resolveCircle(this.pos, this.radius, this.pos.y);
      if (this.pos.y <= r.support) {
        if (!this.grounded && this.vy < -7) { this.landSlow = Math.min(0.35, -this.vy * 0.02); this.camDip = Math.min(0.3, -this.vy * 0.018); g.audio.step(this.pos.x, this.pos.z); }
        if (this.vy < -14) this.takeDamage((-this.vy - 14) * 8, null, 'fall');
        this.pos.y = r.support; this.vy = 0; this.grounded = true;
      } else this.grounded = this.pos.y - r.support < 0.05;
      // ayak sesi
      this.stepT -= dt * this.speed;
      if (this.grounded && this.stepT <= 0 && this.speed > 1) { this.stepT = this.crouch ? 2.2 : 1.6; g.audio.step(this.pos.x, this.pos.z); }
    } else if (this.swimming) {
      g.physics.resolveCircle(this.pos, this.radius, this.pos.y);
    }
    if (!this.inInterior) {
      this.pos.x = clamp(this.pos.x, -995, 995); this.pos.z = clamp(this.pos.z, -995, 995);
    }

    // nişan yönü (kamera ışını)
    this.computeAim();
    this.aimPitch = Math.asin(clamp(this.aimDir.y, -1, 1));
    // ateş: mermi omuz hizasından nişangâhın gösterdiği noktaya gider
    const def = this.wdef;
    const wantFire = def.auto ? input.mouse.left : input.mouse.leftPressed;
    if (wantFire && !this.swimming && !busy && !g.ui.blocking() && !(this.inInterior && this.inInterior.peaceful)) {
      if (def.type === 'melee') { this.heading = this.camYaw; this.tryFire(this.pos, this.aimDir); }
      else {
        if (!this.aiming) { this.heading = this.camYaw; this.aimYaw = 0; }
        tmp.set(this.pos.x, this.pos.y + 1.45 - (this.crouch ? 0.32 : 0), this.pos.z);
        tmp2.copy(this.aimPoint).sub(tmp).normalize();
        if (this.tryFire(tmp, tmp2)) {
          this.camPitch -= def.dmg > 50 ? 0.02 : 0.006; this.camYaw += (Math.random() - 0.5) * 0.008;
          this.camKick = Math.min(1, (this.camKick || 0) + (def.dmg > 50 ? 0.6 : 0.25));
        }
      }
    }
    this.model.animate(dt, this.animState());
    this.syncModel();
  }

  computeAim() {
    const g = this.game;
    const cam = g.camera;
    cam.getWorldDirection(this.aimDir);
    const o = cam.position;
    const range = this.wdef.range || 100;
    const st = g.physics.raycast(o.x, o.y, o.z, this.aimDir.x, this.aimDir.y, this.aimDir.z, range + 10);
    let t = st ? st.t : range + 10;
    const ah = g.combat.rayActors(o, this.aimDir, t, this);
    if (ah) t = ah.t;
    const vh = g.combat.rayVehicles(o, this.aimDir, t, null);
    if (vh) t = vh.t;
    // kamera ile oyuncu arasındaki engelleri atla
    t = Math.max(t, (this.camDistNow || 0) + 0.5);
    this.aimPoint = (this.aimPoint || new THREE.Vector3()).copy(o).addScaledVector(this.aimDir, t);
    this.aimTarget = ah && ah.t >= (this.camDistNow || 0) ? ah.actor : null;
  }

  updateDriving(dt, input) {
    const g = this.game;
    const v = this.vehicle;
    const c = v.controls;
    c.throttle = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    c.steer = (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0);
    c.handbrake = input.down('Space');
    if (v.readInput) v.readInput(input, dt);
    if (input.hit('KeyH')) g.audio.horn(v.pos.x, v.pos.z);
    if (input.hit('KeyC')) this.carCam = (this.carCam + 1) % 3;
    if ((v.type === 'police' || v.type === 'swat') && input.hit('KeyN')) v.sirenOn = !v.sirenOn;
    this.pos.copy(v.pos);
    this.heading = v.heading;
    this.speed = 0; this.vx = 0; this.vz = 0;
    this.vault = null; this.vaultT = 0; this.rollT = 0;
    // araçtan ateş (tabanca/uzi)
    this.computeAim();
    const def = this.wdef;
    if (def.oneHand && input.mouse.right) {
      this.aiming = true;
      const wantFire = def.auto ? input.mouse.left : input.mouse.leftPressed;
      if (wantFire) {
        tmp.set(v.pos.x, v.pos.y + 1.3, v.pos.z);
        tmp2.copy(this.aimPoint).sub(tmp).normalize();
        this.tryFire(tmp, tmp2);
      }
    } else this.aiming = false;
    if (Math.abs(input.mouse.dx) > 0 || Math.abs(input.mouse.dy) > 0) this.carCamIdle = 0;
    else this.carCamIdle += dt;
    // motor sesi
    const rpm = Math.min(1, Math.abs(v.fs) / v.def.maxSpeed);
    g.audio.setEngine(!v.destroyed, rpm + (c.throttle ? 0.15 : 0), 0.1 + rpm * 0.08);
    g.state.stats.driveDist += Math.abs(v.fs) * dt;
    this.syncModel();
  }

  updateCamera(dt) {
    // görev ara sahnesi kamerası
    const cc = this.game.cutsceneCam;
    if (cc && cc.pos) { this.game.camera.position.copy(cc.pos); this.game.camera.lookAt(cc.look); return; }
    const g = this.game;
    const cam = g.camera;
    let fov = g.settings.fov;
    if (this.vehicle) {
      const v = this.vehicle;
      // araç kamerası: belli bir süre sonra arkaya döner
      if (this.carCamIdle > 1.2 && Math.abs(v.fs) > 3) {
        const behind = v.fs >= 0 ? v.heading : v.heading + Math.PI;
        this.camYaw = dampAngle(this.camYaw, behind, 3, dt);
        this.camPitch = damp(this.camPitch, 0.22, 2, dt);
      }
      const yaw = this.camYaw, pitch = this.camPitch;
      const big = v.def.len > 6;
      const dist = [v.def.len * 1.3 + 3, v.def.len * 2 + 6, v.def.len * 0.9 + 2][this.carCam] * (big ? 1.2 : 1);
      const target = tmp.set(v.pos.x, v.pos.y + v.def.hei + 0.4, v.pos.z);
      fov += Math.min(15, Math.abs(v.fs) * 0.3);
      const back = tmp2.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      let d = dist;
      const hit = g.physics.raycast(target.x, target.y, target.z, back.x, back.y, back.z, dist + 0.3);
      if (hit) d = Math.max(0.4, hit.t - 0.3);
      this.camDistNow = d;
      const px = target.x + back.x * d, py = target.y + back.y * d, pz = target.z + back.z * d;
      const k = 1 - Math.exp(-18 * dt);
      if (!this.camInit) { this.camPos.set(px, py, pz); this.camInit = true; }
      this.camPos.x += (px - this.camPos.x) * k; this.camPos.y += (py - this.camPos.y) * k; this.camPos.z += (pz - this.camPos.z) * k;
      if (hit) this.camPos.set(px, py, pz);
      cam.position.copy(this.camPos);
      cam.position.y = Math.max(cam.position.y, 0.3);
      cam.lookAt(target.x, target.y, target.z);
      this.camTgt = null;
    } else {
      // yaya kamerası: omuz üstü, yumuşak yakınlaşma, omuz değiştirme, koşuda gecikme
      const aimScope = this.aiming && this.wdef.scope;
      const sprinting = this.speed > 5.5 && !this.aiming;
      const wantDist = this.dead ? 6 : this.aiming ? (aimScope ? 0.6 : 1.75) : (this.crouch ? 3.4 : this.camDist) + (sprinting ? 0.6 : 0);
      const wantSide = this.dead ? 0 : this.aiming ? 0.58 : 0.42;
      const wantH = (this.crouch ? 1.2 : 1.58) + (this.swimming ? 0.25 : 0) - (this.rollT > 0 ? 0.4 * Math.sin(Math.PI * this.rollT) : 0);
      if (!this.camInit || this.cDist === undefined) { this.cDist = wantDist; this.cSide = wantSide; this.cH = wantH; this.cSh = this.shoulder; this.cCol = 99; this.camTgt = null; }
      this.cDist = damp(this.cDist, wantDist, this.aiming ? 14 : 7, dt);
      this.cSide = damp(this.cSide, wantSide, 10, dt);
      this.cH = damp(this.cH, wantH, 8, dt);
      this.cSh = damp(this.cSh, this.shoulder, 9, dt);
      if (aimScope) fov = 20;
      else if (this.aiming) fov -= 14;
      else if (sprinting) fov += 6;
      const yaw = this.camYaw, pitch = this.dead ? 0.6 : this.camPitch;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const rx = -fz, rz = fx;
      // takip noktası: koşarken hafif gecikme
      const T = TGT.set(this.pos.x, this.pos.y + this.cH, this.pos.z);
      if (!this.camTgt) this.camTgt = new THREE.Vector3().copy(T);
      const lagK = 1 - Math.exp(-(sprinting ? 9 : this.vault ? 12 : 40) * dt);
      this.camTgt.x += (T.x - this.camTgt.x) * lagK; this.camTgt.z += (T.z - this.camTgt.z) * lagK;
      this.camTgt.y += (T.y - this.camTgt.y) * (1 - Math.exp(-(this.grounded ? 14 : 8) * dt));
      const target = tmp.copy(this.camTgt);
      // çok hafif kafa sallanması ve iniş çökmesi
      if (this.grounded && !this.swimming && this.speed > 0.5) target.y += Math.sin(this.model.phase * 2) * 0.022 * Math.min(1, this.speed / 7) * (this.aiming ? 0.3 : 1);
      if (this.camDip > 0) { target.y -= this.camDip; this.camDip = Math.max(0, this.camDip - dt * 1.2); }
      const side = this.cSide * this.cSh;
      target.x += rx * side; target.z += rz * side;
      const back = tmp2.set(-fx * Math.cos(pitch), Math.sin(pitch), -fz * Math.cos(pitch));
      // kamera çarpışması: birkaç ışınla kaba küre taraması; hızlı yaklaş, yavaş uzaklaş
      let free = this.cDist;
      for (const [ox, oy] of CAM_RAYS) {
        const hit = g.physics.raycast(target.x + rx * ox, target.y + oy, target.z + rz * ox, back.x, back.y, back.z, this.cDist + 0.3);
        if (hit) free = Math.min(free, Math.max(0.35, hit.t - 0.3));
      }
      this.cCol = free < this.cCol ? damp(this.cCol, free, 30, dt) : damp(this.cCol, free, 4, dt);
      this.cCol = Math.min(this.cCol, free + 0.15);
      const d = Math.max(0.35, Math.min(this.cDist, this.cCol));
      this.camDistNow = d;
      this.camPos.set(target.x + back.x * d, target.y + back.y * d, target.z + back.z * d);
      this.camInit = true;
      cam.position.copy(this.camPos);
      cam.position.y = Math.max(cam.position.y, (this.inInterior ? 0.3 : this.swimming ? WATER_Y + 0.4 : 0.3));
      if (this.inInterior) cam.position.y = Math.min(cam.position.y, 3.2);
      cam.lookAt(target.x, target.y, target.z);
      // silah tepmesi
      if (this.camKick > 0) { cam.rotation.x += this.camKick * 0.012; this.camKick = Math.max(0, this.camKick - dt * 6); }
    }
    // ekran sarsıntısı
    if (this.camShake > 0) {
      this.camShake = Math.max(0, this.camShake - dt * 1.5);
      cam.rotation.x += (Math.random() - 0.5) * this.camShake * 0.06;
      cam.rotation.y += (Math.random() - 0.5) * this.camShake * 0.06;
    }
    cam.fov = damp(cam.fov, fov, 10, dt);
    cam.updateProjectionMatrix();
  }

  syncModel() {
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.heading;
    this.model.root.visible = !this.vehicle && !(this.aiming && this.wdef.scope);
  }
}

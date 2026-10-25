// Oyuncu: yürüme/koşma/zıplama/yüzme, nişan alma, ateş, araç kullanma ve üçüncü şahıs kamera.
import * as THREE from 'three';
import { Actor } from './actor.js';
import { clamp, damp, dampAngle, angleDiff } from '../core/util.js';
import { WEAPONS, WEAPON_ORDER } from '../game/weapons.js';
import { isLand, WATER_Y } from '../world/map.js';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

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
      this.model.animate(dt, this.animState());
      this.syncModel();
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

  updateOnFoot(dt, input) {
    const g = this.game;
    // silah seçimi
    for (let k = 0; k <= 8; k++) if (input.hit('Digit' + (k + 1))) this.selectSlot(k);
    if (input.hit('KeyQ')) this.cycleWeapon(1);
    if (input.hit('KeyR')) this.startReload();
    if (input.hit('KeyC')) this.crouch = !this.crouch;

    const f = { x: Math.sin(this.camYaw), z: Math.cos(this.camYaw) };
    const rgt = { x: -f.z, z: f.x };
    let mx = 0, mz = 0;
    if (input.down('KeyW')) { mx += f.x; mz += f.z; }
    if (input.down('KeyS')) { mx -= f.x; mz -= f.z; }
    if (input.down('KeyD')) { mx += rgt.x; mz += rgt.z; }
    if (input.down('KeyA')) { mx -= rgt.x; mz -= rgt.z; }
    const ml = Math.hypot(mx, mz);
    this.aiming = input.mouse.right && this.wdef.type !== 'melee';
    const sprint = input.down('ShiftLeft') && this.stamina > 5 && !this.aiming && !this.crouch;
    let speed = this.swimming ? (sprint ? 3.5 : 2.2) : this.aiming ? 2.2 : this.crouch ? 1.6 : sprint ? 7.2 : 3.6;
    speed *= 1 + g.state.stats.stamina * 0.002;
    if (ml > 0.01) {
      mx /= ml; mz /= ml;
      const want = Math.atan2(mx, mz);
      if (!this.aiming) this.heading = dampAngle(this.heading, want, 12, dt);
      this.vx = damp(this.vx || 0, mx * speed, 12, dt);
      this.vz = damp(this.vz || 0, mz * speed, 12, dt);
    } else {
      this.vx = damp(this.vx || 0, 0, 14, dt);
      this.vz = damp(this.vz || 0, 0, 14, dt);
    }
    if (this.aiming) this.heading = dampAngle(this.heading, this.camYaw, 20, dt);
    if (sprint && ml > 0) { this.stamina -= dt * 12; g.state.stats.runTime += dt; } else this.stamina = Math.min(100, this.stamina + dt * 18);
    if (this.knock && this.knock.t > 0) { this.knock.t -= dt; this.vx += this.knock.x * dt * 10; this.vz += this.knock.z * dt * 10; }

    const prevX = this.pos.x, prevZ = this.pos.z;
    this.pos.x += this.vx * dt;
    this.pos.z += this.vz * dt;
    this.speed = Math.hypot(this.vx, this.vz);

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
    if (water && !this.swimming && this.pos.y < 0.5) {
      this.swimming = true; this.vy = 0;
      g.audio.splash(this.pos.x, this.pos.z); g.particles.splash({ x: this.pos.x, y: WATER_Y, z: this.pos.z });
      this.crouch = false;
    }
    if (this.swimming) {
      this.pos.y = damp(this.pos.y, WATER_Y + 0.1, 6, dt);
      if (!g.physics.inWater(this.pos.x, this.pos.z) && this.pos.y > -0.5) this.swimming = false;
      this.aiming = false;
      if (this.weapon !== 'fists') this.model.setWeapon(null);
    } else if (this.model.weaponId !== this.weapon) this.model.setWeapon(this.weapon);

    // yerçekimi ve çarpışma
    if (!this.swimming) {
      if (input.hit('Space') && this.grounded) { this.vy = 6.4; this.grounded = false; this.crouch = false; }
      this.vy -= 20 * dt;
      this.pos.y += this.vy * dt;
      const r = g.physics.resolveCircle(this.pos, this.radius, this.pos.y);
      if (this.pos.y <= r.support) {
        if (this.vy < -14) this.takeDamage((-this.vy - 14) * 8, null, 'fall');
        this.pos.y = r.support; this.vy = 0; this.grounded = true;
      } else this.grounded = this.pos.y - r.support < 0.05;
      // ayak sesi
      this.stepT -= dt * this.speed;
      if (this.grounded && this.stepT <= 0 && this.speed > 1) { this.stepT = 1.6; g.audio.step(this.pos.x, this.pos.z); }
    } else {
      g.physics.resolveCircle(this.pos, this.radius, this.pos.y);
    }
    if (!this.inInterior) {
      this.pos.x = clamp(this.pos.x, -995, 995); this.pos.z = clamp(this.pos.z, -995, 995);
    }

    // nişan yönü (kamera ışını)
    this.computeAim();
    this.aimPitch = Math.asin(clamp(this.aimDir.y, -1, 1));
    // ateş
    const def = this.wdef;
    const wantFire = def.auto ? input.mouse.left : input.mouse.leftPressed;
    if (wantFire && !this.swimming && !g.ui.blocking() && !(this.inInterior && this.inInterior.peaceful)) {
      if (def.type === 'melee') this.tryFire(this.pos, this.aimDir);
      else {
        if (!this.aiming) this.heading = this.camYaw;
        tmp.set(this.pos.x, this.pos.y + 1.45 - (this.crouch ? 0.3 : 0), this.pos.z);
        tmp2.copy(this.aimPoint).sub(tmp).normalize();
        if (this.tryFire(tmp, tmp2)) { this.camPitch -= def.dmg > 50 ? 0.02 : 0.006; this.camYaw += (Math.random() - 0.5) * 0.008; }
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
    t = Math.max(t, this.camDistNow + 0.5);
    this.aimPoint = (this.aimPoint || new THREE.Vector3()).copy(o).addScaledVector(this.aimDir, t);
    this.aimTarget = ah && ah.t >= this.camDistNow ? ah.actor : null;
  }

  updateDriving(dt, input) {
    const g = this.game;
    const v = this.vehicle;
    const c = v.controls;
    c.throttle = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    c.steer = (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0);
    c.handbrake = input.down('Space');
    if (input.hit('KeyH')) g.audio.horn(v.pos.x, v.pos.z);
    if (input.hit('KeyC')) this.carCam = (this.carCam + 1) % 3;
    if ((v.type === 'police' || v.type === 'swat') && input.hit('KeyN')) v.sirenOn = !v.sirenOn;
    this.pos.copy(v.pos);
    this.heading = v.heading;
    this.speed = 0;
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
    const g = this.game;
    const cam = g.camera;
    let target, dist, pitch = this.camPitch, yaw = this.camYaw, side = 0, fov = g.settings.fov;
    if (this.vehicle) {
      const v = this.vehicle;
      // araç kamerası: belli bir süre sonra arkaya döner
      if (this.carCamIdle > 1.2 && Math.abs(v.fs) > 3) {
        const behind = v.fs >= 0 ? v.heading : v.heading + Math.PI;
        this.camYaw = dampAngle(this.camYaw, behind, 3, dt);
        this.camPitch = damp(this.camPitch, 0.22, 2, dt);
      }
      yaw = this.camYaw; pitch = this.camPitch;
      const big = v.def.len > 6;
      dist = [v.def.len * 1.3 + 3, v.def.len * 2 + 6, v.def.len * 0.9 + 2][this.carCam] * (big ? 1.2 : 1);
      target = tmp.set(v.pos.x, v.pos.y + v.def.hei + 0.4, v.pos.z);
      fov += Math.min(15, Math.abs(v.fs) * 0.3);
    } else {
      const aimScope = this.aiming && this.wdef.scope;
      dist = this.aiming ? (aimScope ? 0.6 : 2.0) : this.camDist;
      side = this.aiming ? 0.6 : 0.35;
      if (this.aiming && aimScope) fov = 20;
      else if (this.aiming) fov -= 12;
      target = tmp.set(this.pos.x, this.pos.y + (this.crouch ? 1.25 : 1.6) + (this.swimming ? 0.3 : 0), this.pos.z);
      if (this.dead) { dist = 6; pitch = 0.6; }
    }
    const f = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const rgt = { x: -f.z, z: f.x };
    target.x += rgt.x * side; target.z += rgt.z * side;
    const back = tmp2.set(-f.x * Math.cos(pitch), Math.sin(pitch), -f.z * Math.cos(pitch));
    // kamera çarpışması
    let d = dist;
    const hit = g.physics.raycast(target.x, target.y, target.z, back.x, back.y, back.z, dist + 0.3);
    if (hit) d = Math.max(0.4, hit.t - 0.3);
    this.camDistNow = d;
    const px = target.x + back.x * d, py = target.y + back.y * d, pz = target.z + back.z * d;
    const k = 1 - Math.exp(-(this.vehicle ? 18 : 30) * dt);
    if (!this.camInit) { this.camPos.set(px, py, pz); this.camInit = true; }
    this.camPos.x += (px - this.camPos.x) * k; this.camPos.y += (py - this.camPos.y) * k; this.camPos.z += (pz - this.camPos.z) * k;
    if (hit || this.aiming) this.camPos.set(px, py, pz);
    cam.position.copy(this.camPos);
    cam.position.y = Math.max(cam.position.y, (this.inInterior ? 0.3 : this.swimming ? WATER_Y + 0.4 : 0.3));
    if (this.inInterior) cam.position.y = Math.min(cam.position.y, 3.2);
    cam.lookAt(target.x, target.y, target.z);
    // ekran sarsıntısı
    if (this.camShake > 0) {
      this.camShake = Math.max(0, this.camShake - dt * 1.5);
      cam.rotation.x += (Math.random() - 0.5) * this.camShake * 0.06;
      cam.rotation.y += (Math.random() - 0.5) * this.camShake * 0.06;
    }
    cam.fov = damp(cam.fov, fov, 10, dt);
    cam.updateProjectionMatrix();
    void angleDiff;
  }

  syncModel() {
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.heading;
    this.model.root.visible = !this.vehicle && !(this.aiming && this.wdef.scope);
  }
}

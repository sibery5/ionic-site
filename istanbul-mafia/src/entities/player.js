// Oyuncu: ivmeli yürüme/koşma, çömelme (C), zıplama (çakal süresi + tampon), alçak engel aşma, takla (koşarken C),
// yüzme, omuz üstü nişan (V: omuz değiştir), ateş, araç kullanma ve üçüncü şahıs kamera.
import * as THREE from 'three';
import { Actor } from './actor.js';
import { clamp, damp, dampAngle, angleDiff } from '../core/util.js';
import { WEAPONS, WEAPON_ORDER } from '../game/weapons.js';
import { isLand, inBridge, WATER_Y, poolAt } from '../world/map.js'; // [villa] poolAt
import { tryMantle, stepMantle } from './mantle.js'; // [hareket H1]
import { deckCarry, deckStep } from './boats.js'; // [hareket H4] güverte
import { swimVertical, swimEffects, enterWater, tryClimbOut } from './swim.js'; // [deniz]

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const TGT = new THREE.Vector3();
const VAULT_TMP = [];
const VAULT_END = new THREE.Vector3(), VAULT_CHK = new THREE.Vector3(), VAULT_PRE = new THREE.Vector3();
// kamera çarpışma ışınları (yan, yukarı ofsetleri): kaba küre taraması
const CAM_RAYS = [[0, 0], [0.18, 0.1], [-0.18, 0.1], [0, -0.12]];
// [B1] araç kamerası çarpışma ışınları (yan, üst): bom duvara/direğe girmez
const VCAM_RAYS = [[0, 0], [0.5, 0.15], [-0.5, 0.15], [0, 0.45]];
const angleWrap = (a) => angleDiff(0, a);
// [savaş nişan] dikey bakış sınırı: yukarı ~83° (helikoptere ateş), aşağı ~69°. Kamera konumu en fazla POS_UP kadar
// yörüngede alçalır; daha yukarı bakışta kamera başın arkasında kalıp yalnız bakış açısı döner (yere gömülmez).
const PITCH_UP = -1.45, PITCH_DOWN = 1.2, POS_UP = -0.42;
const _look = new THREE.Vector3();
// [hareket M6] near düzlemi köşeleri (sağ, yukarı işaretleri): kameranın kesit dikdörtgeni duvara girmesin
const NEAR_CORNERS = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
const CAM_PUSH = new THREE.Vector3();

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
    // [savaş nişan] yakınlaştırmada hassasiyet görüş açısıyla orantılı düşer (dürbünde titreme yok)
    const sens = 0.0022 * s.sensitivity * (this.zoomNow > 1.01 ? 1 / Math.pow(this.zoomNow, 0.85) : 1);
    const dYaw = -input.mouse.dx * sens, dPitch = input.mouse.dy * sens * (s.invertY ? -1 : 1);
    this.camYaw += dYaw;
    this.camPitch += dPitch;
    this.recoverRecoil(dt, dYaw, dPitch);
    this.camPitch = clamp(this.camPitch, PITCH_UP, PITCH_DOWN);
    // [C2] dürbün: fare tekeriyle kademesiz yakınlaştırma (GTA tarzı); hedef büyütme scopeZT, görünen scopeZ yumuşak izler
    if (input.mouse.wheel && this.scoped && this.wdef.zoom2) {
      const W = this.wdef, zMin = W.zoom * 0.5, zMax = W.zoom2 * 1.4;
      this.scopeZT = clamp((this.scopeZT || W.zoom) * Math.pow(1.2, -input.mouse.wheel), zMin, zMax);
    }
    else if (input.mouse.wheel && !input.down('ShiftLeft')) {
      if (!this.vehicle) this.cycleWeapon(input.mouse.wheel > 0 ? 1 : -1);
    }
    // [kanun] betikli hareket (araç gaspı vb.): kontrol kilitli, konumu betik sürer
    if (this.scriptCtl && !this.vehicle) { this.aiming = false; this.scriptCtl(dt); this.model.animate(dt, this.animState()); this.syncModel(); this.updateCamera(dt); return; }
    if (this.vehicle) this.updateDriving(dt, input);
    else this.updateOnFoot(dt, input);
    this.updateCamera(dt);
  }

  mantle(dx, dz) { return tryMantle(this, dx, dz); }

  // Alçak engel (korkuluk, bank, çöp kutusu; 0.42-1.25 m) üzerinden atlama ya da üstüne tırmanma
  tryVault(dx, dz, allowWater) {
    const g = this.game, p = this.pos;
    const px = p.x + dx * 0.7, pz = p.z + dz * 0.7;
    const boxes = g.physics.active.query(px - 0.4, pz - 0.4, px + 0.4, pz + 0.4, VAULT_TMP);
    for (const b of boxes) {
      const top = b.y1 - p.y;
      if (top <= 0.42 || top > 1.25 || b.y0 > p.y + 0.3) continue;
      // [dünya] tırmanılamaz yapı (askeri üs duvarı/çiti, kuleler): tutunma reddedilir; girişim kanun ekibi için kaydedilir
      if (b.noClimb) { this.climbAttempt = { t: performance.now() / 1000, x: p.x, z: p.z, tag: b.tag }; continue; }
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
    if (this.onBoat) deckCarry(this); // [hareket H4] tekneyle taşın
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
    if (this.seat) { mx = 0; mz = 0; } // [dünya] bankta oturuyor (world/seating.js kaldırır)
    // [mekanik tepki] yere savrulduysa (patlama / araç): kalkana kadar kontrol yok
    const down = this.kdT > 0;
    if (down) { this.kdT -= dt; mx = 0; mz = 0; this.crouch = false; if (this.kdT <= 0) this.kdImmT = 2.5; }
    else if (this.kdImmT > 0) this.kdImmT -= dt;
    const ml = down ? 0 : Math.hypot(mx, mz);
    if (ml > 0.01) { mx /= ml; mz /= ml; }
    const busy = !!(this.vault || this.rollT > 0 || down);
    this.aiming = input.mouse.right && this.wdef.type !== 'melee' && !busy;
    // [savaş nişan] dürbünde nefes tutma (Shift): salınım azalır, dayanıklılık harcanır
    this.holdBreath = this.aiming && this.wdef.scope && input.down('ShiftLeft') && this.stamina > 5;
    if (this.holdBreath) this.stamina = Math.max(0, this.stamina - dt * 14);
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
    // bacağından yaralı: topallar, koşusu yavaşlar
    if (this.limp > 0) speed *= 1 - (sprint ? 0.45 : 0.3) * this.limp;
    if (this.vault && this.vault.mantle) stepMantle(this, this.vault, dt); // [hareket H1] duvara tutunup aşma
    else if (this.vault) {
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
    } else if (down) {
      // yerde kayma: sürtünmeyle durur
      const fr = Math.exp(-5 * dt); this.vx *= fr; this.vz *= fr;
    } else if (this.rollT > 0) {
      this.rollT += dt / 0.7;
      const k = 6.2 * (1 - 0.45 * Math.min(1, this.rollT));
      this.vx = this.rollDir.x * k; this.vz = this.rollDir.z * k;
      if (this.rollT >= 1) this.rollT = 0;
    } else {
      // ivmelenme / yavaşlama eğrisi; havada az kontrol; ters yöne dönüşte daha hızlı fren
      // momentum: hızlıyken karakter baktığı yöne koşar, girdi yönüne yay çizerek döner (yana kayma yok)
      let dmx = mx, dmz = mz;
      if (ml > 0 && !this.aiming && this.grounded && !this.swimming && this.speed > 2) {
        const hd = angleDiff(this.heading, Math.atan2(mx, mz));
        const k = clamp((Math.abs(hd) - 0.25) / 1.1, 0, 1) * clamp((this.speed - 2) / 3, 0, 1);
        dmx = mx * (1 - k) + Math.sin(this.heading) * k; dmz = mz * (1 - k) + Math.cos(this.heading) * k;
        const l = Math.hypot(dmx, dmz) || 1; dmx /= l; dmz /= l;
        speed *= 1 - k * (Math.abs(hd) > 1.6 ? 0.45 : 0.15);
      }
      const tx = ml > 0 ? dmx * speed : 0, tz = ml > 0 ? dmz * speed : 0;
      const accel = !this.grounded && !this.swimming ? 3 : ml > 0 ? (sprint ? 9 : 16) : 18;
      let ex = tx - this.vx, ez = tz - this.vz;
      const el = Math.hypot(ex, ez), maxd = accel * dt * (this.vx * tx + this.vz * tz < 0 ? 2 : 1);
      if (el > maxd) { ex *= maxd / el; ez *= maxd / el; }
      this.vx += ex; this.vz += ez;
    }
    // yumuşak dönüş: açısal hız sınırlı (ani dönme yok); yavaşken geri dönüşte hızlı pivot
    if (ml > 0.01 && !busy && !this.aiming) {
      const d = angleDiff(this.heading, Math.atan2(mx, mz));
      const sp = this.speed, maxW = sp < 1 ? 11 : sp < 4.5 ? 8.5 : 5.5;
      const want = clamp(d * 9, -maxW, maxW) * (Math.abs(d) > 2.4 && sp < 2.5 ? 1.4 : 1);
      this.turnVel = damp(this.turnVel || 0, want, 16, dt);
      const step = this.turnVel * dt;
      this.heading += Math.abs(step) > Math.abs(d) ? d : step;
    } else this.turnVel = damp(this.turnVel || 0, 0, 12, dt);
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
    // [hareket H1] Space ile önündeki 1,3–2,6 m duvara tutunup aş (duruyorken de; yön: hareket ya da bakış)
    if (!this.vault && !busy && !this.swimming && this.grounded && input.hit('Space') && this.mantle(ml > 0 ? mx : Math.sin(this.heading), ml > 0 ? mz : Math.cos(this.heading))) input.pressed.delete('Space');

    // [deniz] yüzme: suya giriş (düşerek), su çizgisi (dalgayı izler), kulaç efektleri, kıyıya çıkış (merdiven / alçak kenar)
    const water = g.physics.inWater(this.pos.x, this.pos.z);
    if (this.swimming) {
      // kara kütlesine yüzerek girilmez (kenar boyunca kayar); köprü altı serbest
      if (isLand(this.pos.x, this.pos.z) && !inBridge(this.pos.x, this.pos.z) && !poolAt(this.pos.x, this.pos.z)) { // [villa] havuz
        if (!isLand(this.pos.x, prevZ)) this.pos.z = prevZ; else if (!isLand(prevX, this.pos.z)) this.pos.x = prevX; else { this.pos.x = prevX; this.pos.z = prevZ; }
      }
      if (ml > 0.1) tryClimbOut(this, g, mx, mz, ml);
    }
    if (water && !this.swimming && !this.vault && !this.scriptCtl && !this.onBoat && this.pos.y < (poolAt(this.pos.x, this.pos.z) || { y: WATER_Y }).y + 0.25) { // [villa] havuz su yüzü
      this.swimming = true; this.rollT = 0; this.crouch = false;
      enterWater(this, g);
    }
    if (this.swimming) {
      swimVertical(this, dt, g);
      swimEffects(this, dt, g);
      if (!g.physics.inWater(this.pos.x, this.pos.z) && this.pos.y > -0.5) this.swimming = false;
      this.aiming = false;
      if (this.weapon !== 'fists') this.model.setWeapon(null);
    } else if (this.model.weaponId !== this.weapon && !this.scriptCtl) this.model.setWeapon(this.weapon);

    // yerçekimi, zıplama (çakal süresi + tuş tamponu), iniş
    if (!this.swimming && !this.vault) {
      if (input.hit('Space')) this.jumpBuf = 0.15;
      this.jumpBuf = (this.jumpBuf || 0) - dt;
      this.coyote = this.grounded ? 0.12 : (this.coyote || 0) - dt;
      if (this.jumpBuf > 0 && this.coyote > 0 && this.rollT <= 0 && !down) {
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
    if (!this.swimming && !this.vault) deckStep(this); // [hareket H4] güverte sınırı ve zemini
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
      if (this.animalBlock(def)) { /* [C8] hayvana saldırı yok: tetik çalışmaz */ }
      else if (def.type === 'melee') { this.heading = this.camYaw; this.tryFire(this.pos, this.aimDir); }
      else {
        if (!this.aiming) { this.heading = this.camYaw; this.aimYaw = 0; }
        tmp.set(this.pos.x, this.pos.y + 1.45 - (this.crouch ? 0.32 : 0), this.pos.z);
        tmp2.copy(this.aimPoint).sub(tmp).normalize();
        if (this.tryFire(tmp, tmp2)) {
          this.camKick = Math.min(1, (this.camKick || 0) + (def.dmg > 50 ? 0.6 : 0.25));
        }
      }
    }
    this.model.animate(dt, this.animState());
    this.syncModel();
  }

  // [C1] tepme toparlanması: ateş kesilince kamera desenin götürdüğü yerden merkeze döner (silahın recover süresinde ~%95).
  // Oyuncunun fareyle karşıladığı kısım (aşağı çekme / ters yön) geri verilmez: aşırı düzeltme yok.
  recoverRecoil(dt, dYaw, dPitch) {
    if (!this.recP && !this.recY) return;
    if (this.recP > 0 && dPitch > 0) this.recP = Math.max(0, this.recP - dPitch);
    if (this.recY && dYaw * this.recY > 0) this.recY = Math.sign(this.recY) * Math.max(0, Math.abs(this.recY) - Math.abs(dYaw));
    const def = this.wdef || {}, since = (this.game.combat.clock || 0) - (this.lastShotT || -9);
    if (since < 0.09 || (def.auto && this.game.input.mouse.left && since < 0.25)) return;
    const k = 1 - Math.exp(-dt * 3 / Math.max(0.1, def.recover || 0.35));
    const dp = this.recP * k, dy = this.recY * k;
    this.camPitch += dp; this.camYaw += dy; this.recP -= dp; this.recY -= dy;
    if (Math.abs(this.recP) < 1e-5 && Math.abs(this.recY) < 1e-5) { this.recP = 0; this.recY = 0; }
  }

  // [C8] nişan/yumruk menzilinde hayvan varsa tetiği kilitle ve uyar
  animalBlock(def) {
    const An = this.game.animals;
    if (!An || !An.warnHarm || this.inInterior) return false;
    const a = def.type === 'melee' ? An.animalInFront(this.pos.x, this.pos.z, this.camYaw) : this.aimAnimal;
    if (!a) return false;
    An.warnHarm(a);
    return true;
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
    const xh = g.combat.rayTargets && g.combat.rayTargets(o, this.aimDir, t, this); // [savaş] helikopter vb.
    if (xh) t = xh.t;
    this.aimOnTarget = !!xh;
    // [C8] nişan bir sokak hayvanında mı (engelden ve hedeften önce)
    const An = g.animals;
    let tA = t;
    const c0 = (this.camDistNow || 0) + 0.5;
    if (An && tA < c0) { // kamera ile oyuncu arasındaki engel: ışını oyuncunun önünden yeniden at
      const d = this.aimDir, w = g.physics.raycast(o.x + d.x * c0, o.y + d.y * c0, o.z + d.z * c0, d.x, d.y, d.z, range);
      tA = c0 + (w ? w.t : range);
    }
    this.aimAnimal = An && An.rayAnimal && !this.inInterior ? An.rayAnimal(o, this.aimDir, tA + 0.3) : null;
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
    if (input.hit('KeyC')) { this.carCam = (this.carCam + 1) % (v.kind === 'car' && !v.mesh.userData.moto ? 5 : 3); this.camInit = false; if (g.ui && g.ui.notify) g.ui.notify(['Kamera: yakın', 'Kamera: uzak', 'Kamera: çok yakın', 'Kamera: kaput', 'Kamera: tampon'][this.carCam], 'info'); }
    if ((v.type === 'police' || v.type === 'swat') && input.hit('KeyN')) v.sirenOn = !v.sirenOn;
    this.pos.copy(v.pos);
    this.heading = v.heading;
    this.speed = 0; this.vx = 0; this.vz = 0;
    this.vault = null; this.vaultT = 0; this.rollT = 0;
    // araçtan ateş (tabanca/uzi)
    this.computeAim();
    const def = this.wdef;
    // [C2] silahlı helikopter: sağ tık nişan kamerası (burun altı), ateşi helikopter silahları yapar (kişisel silah ateşlenmez)
    this.heliAim = !!(v.heli && v.def.armed && input.mouse.right && !v.destroyed);
    if (v.kind === 'air' && v.def.armed) { this.aiming = this.heliAim; }
    else if (def.oneHand && input.mouse.right) {
      this.aiming = true;
      const wantFire = def.auto ? input.mouse.left : input.mouse.leftPressed;
      if (wantFire && !this.animalBlock(def)) {
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
      // [B1 kamera] takip kamerası: hıza göre mesafe/FOV, virajda gidiş yönüne bakış, çok ışınlı çarpışma bomu
      // (hızlı yaklaşır, yavaş açılır), fare bakışından sonra yumuşak dönüş. C: yakın/uzak/çok yakın/kaput/tampon.
      const v = this.vehicle;
      const sp = Math.hypot(v.vx || 0, v.vz || 0);
      const isCar = v.kind === 'car' && !v.mesh.userData.moto;
      if (!isCar && this.carCam > 2) this.carCam = 0;
      const fwdSpd = v.fs !== undefined ? v.fs : sp;
      // gidiş yönü: kayarken/driftte kamera hareket yönüne kayar (virajın içine bakış)
      const velYaw = sp > 4 ? Math.atan2(v.vx, v.vz) : v.heading;
      const travel = fwdSpd >= -0.5 ? v.heading + angleWrap(velYaw - v.heading) * 0.45 : v.heading + Math.PI;
      const lead = clamp((v.yawRate || 0) * 0.22, -0.3, 0.3); // dönüşe doğru öne bakış
      const idle = this.carCamIdle;
      this.zoomNow = 1;
      if (idle > 1.0 && !this.heliAim && (Math.abs(fwdSpd) > 2 || this.carCam > 2)) {
        // fare bakışından sonra: yavaşça hızlanan dönüş (ani savrulma yok)
        const rate = 4.2 * Math.min(1, (idle - 1.0) / 0.7);
        this.camYaw = dampAngle(this.camYaw, travel + lead, rate, dt);
        this.camPitch = damp(this.camPitch, this.carCam > 2 ? 0.04 : 0.2 - Math.min(0.06, sp * 0.002), rate * 0.7, dt);
      }
      fov += Math.min(16, Math.max(0, Math.abs(fwdSpd) - 4) * (this.carCam > 2 ? 0.42 : 0.3));
      if (this.heliAim) {
        // [C2] helikopter nişan kamerası: burun altı taret, bakış fareyle serbest, 3× yakınlaştırma
        v.mesh.updateMatrixWorld();
        const lp = v.mesh.localToWorld(tmp.set(0, 0.35, 3.6));
        cam.position.copy(lp);
        const yaw = this.camYaw, pitch = clamp(this.camPitch, -0.5, 1.2);
        _look.set(lp.x + Math.sin(yaw) * Math.cos(pitch) * 10, lp.y - Math.sin(pitch) * 10, lp.z + Math.cos(yaw) * Math.cos(pitch) * 10);
        cam.lookAt(_look);
        fov = g.settings.fov / 3; this.zoomNow = 3;
        this.camInit = false; this.camDistNow = 0.5;
      } else if (this.carCam > 2) {
        // kaput / tampon kamerası: kasaya bağlı (yalpa ve burun dalışı hissedilir), bakış serbest
        const ch = v.mesh.userData.chassis, d = v.def;
        v.mesh.updateMatrixWorld();
        const lp = this.carCam === 3 ? tmp.set(0, d.hei * 0.72 + 0.22, d.len * 0.3) : tmp.set(0, 0.62, d.len * 0.5 + 0.05);
        ch.localToWorld(lp);
        cam.position.copy(lp);
        const rel = angleWrap(this.camYaw - v.heading);
        const yaw = v.heading + rel, pitch = this.camPitch - 0.04;
        _look.set(lp.x + Math.sin(yaw) * Math.cos(pitch) * 10, lp.y - Math.sin(pitch) * 10 + (v.pitch || 0) * 2, lp.z + Math.cos(yaw) * Math.cos(pitch) * 10);
        cam.lookAt(_look);
        cam.rotation.z += (v.lean || 0) + (v.roll || 0) * 0.6;
        this.camInit = false; this.camDistNow = 0.5;
      } else {
        const yaw = this.camYaw, pitch = this.camPitch;
        const big = v.def.len > 6;
        const base = [v.def.len * 1.3 + 3, v.def.len * 2 + 6, v.def.len * 0.9 + 2][this.carCam] * (big ? 1.2 : 1);
        const dist = base + Math.min(2.6, sp * 0.06); // hızlandıkça biraz geri çekil
        // hedef: aracın biraz önü (hız yönünde) -> virajda yol görünür
        const la = Math.min(4, sp * 0.12);
        const target = tmp.set(v.pos.x + Math.sin(travel) * la, v.pos.y + v.def.hei + 0.4, v.pos.z + Math.cos(travel) * la);
        const back = tmp2.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
        // çarpışma bomu: merkez + iki yan + üst ışın; kamera duvarın içine girmez
        let free = dist;
        const rx = Math.cos(yaw), rz = -Math.sin(yaw);
        for (const [ox, oy] of VCAM_RAYS) {
          const hit = g.physics.raycast(target.x + rx * ox, target.y + oy, target.z + rz * ox, back.x, back.y, back.z, dist + 0.3);
          if (hit) free = Math.min(free, Math.max(0.6, hit.t - 0.35));
        }
        if (this.boom === undefined || !this.camInit) this.boom = free;
        this.boom = free < this.boom ? damp(this.boom, free, 28, dt) : damp(this.boom, free, 2.5, dt);
        this.boom = Math.min(this.boom, free + 0.1);
        const d = this.boom;
        this.camDistNow = d;
        const px = target.x + back.x * d, py = target.y + back.y * d, pz = target.z + back.z * d;
        // yumuşak takip: hızda biraz gecikme (hız hissi), duvar yakınında doğrudan
        const k = 1 - Math.exp(-(free < dist - 0.2 ? 30 : 14) * dt);
        if (!this.camInit) { this.camPos.set(px, py, pz); this.camInit = true; }
        this.camPos.x += (px - this.camPos.x) * k; this.camPos.y += (py - this.camPos.y) * k; this.camPos.z += (pz - this.camPos.z) * k;
        cam.position.copy(this.camPos);
        cam.position.y = Math.max(cam.position.y, (v.pos.y || 0) + 0.3, 0.3);
        cam.lookAt(target.x, target.y, target.z);
      }
      this.camTgt = null;
    } else {
      // yaya kamerası: omuz üstü. [savaş nişan] nişan tek bir yumuşatılmış ağırlıkla (adsK) geçer: mesafe, omuz,
      // yükseklik ve görüş açısı aynı eğriyle değişir -> girişte/çıkışta sıçrama ve titreme yok. Omuz tarafı sabit (V).
      const W = this.wdef;
      const adsWant = this.aiming && !this.dead ? 1 : 0;
      this.adsK = damp(this.adsK || 0, adsWant, adsWant ? 13 : 9, dt);
      if (Math.abs(this.adsK - adsWant) < 0.002) this.adsK = adsWant;
      const A = this.adsK, Ae = A * A * (3 - 2 * A);
      const aimScope = this.aiming && W.scope && A > 0.85;
      this.scoped = aimScope;
      const sprinting = this.speed > 5.5 && !this.aiming;
      const hipDist = this.dead ? 6 : (this.crouch ? 3.4 : this.camDist) + (sprinting ? 0.6 : 0);
      const adsDist = W.scope ? 0.55 : W.oneHand ? 1.95 : 1.6;
      const wantDist = hipDist + (adsDist - hipDist) * Ae;
      const wantSide = this.dead ? 0 : 0.42 + (0.6 - 0.42) * Ae;
      const wantH = (this.crouch ? 1.2 : 1.58) + 0.04 * Ae + (this.swimming ? -0.95 : 0) - (this.rollT > 0 ? 0.4 * Math.sin(Math.PI * this.rollT) : 0) - (this.kdT > 0 ? 0.9 : 0);
      if (!this.camInit || this.cDist === undefined) { this.cDist = wantDist; this.cSide = wantSide; this.cH = wantH; this.cSh = this.shoulder; this.cCol = 99; this.camTgt = null; }
      // nişanda mesafe/omuz doğrudan eğriden (ikinci bir sönüm katmanı yok: çift yumuşatma = salınım)
      this.cDist = A > 0.001 ? wantDist : damp(this.cDist, wantDist, 7, dt);
      this.cSide = A > 0.001 ? wantSide : damp(this.cSide, wantSide, 10, dt);
      this.cH = damp(this.cH, wantH, 8, dt);
      this.cSh = damp(this.cSh, this.shoulder, 9, dt);
      if (W.zoom2) { this.scopeZT = this.scopeZT || W.zoom; this.scopeZ = aimScope ? Math.exp(damp(Math.log(this.scopeZ || this.scopeZT), Math.log(this.scopeZT), 12, dt)) : this.scopeZT; }
      const zoom = this.dead ? 1 : 1 + (((W.zoom2 ? this.scopeZ : W.zoom) || 1.3) - 1) * Ae;
      this.zoomNow = zoom;
      fov = fov / zoom;
      if (sprinting) fov += 6;
      // dürbün salınımı (nefes): Shift ile tutulur
      if (aimScope) {
        this.swayT = (this.swayT || 0) + dt;
        // nefes tutulunca salınım durur; nefes bitince (dayanıklılık tükendi) bir süre daha güçlü sallanır
        const k = (this.holdBreath ? 0.12 : this.stamina < 12 ? 1.8 : 1) * (this.crouch ? 0.6 : 1) * 0.0016 * Math.sqrt(zoom / 6);
        this.camYaw += Math.cos(this.swayT * 0.9) * k * dt * 6; this.camPitch += Math.sin(this.swayT * 1.7) * k * dt * 5;
      }
      const yaw = this.camYaw, lookPitch = this.dead ? 0.6 : this.camPitch;
      // yukarı bakarken kamera yörüngede en fazla POS_UP'a iner; fazlası yalnız bakış yönünü döndürür
      const pitch = Math.max(lookPitch, POS_UP);
      const upK = clamp((POS_UP - lookPitch) / (POS_UP - PITCH_UP), 0, 1);
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const rx = -fz, rz = fx;
      // takip noktası: koşarken hafif gecikme
      const T = TGT.set(this.pos.x, this.pos.y + this.cH, this.pos.z);
      if (!this.camTgt) this.camTgt = new THREE.Vector3().copy(T);
      // takip gecikmesi yumuşak geçer; nişanda gecikme yok (nişangâh karakterle birlikte sabit kalır)
      this.camLagRate = damp(this.camLagRate || 30, A > 0.5 ? 60 : sprinting ? 10 : this.vault ? 12 : 28, 3, dt);
      const lagK = 1 - Math.exp(-this.camLagRate * dt);
      this.camTgt.x += (T.x - this.camTgt.x) * lagK; this.camTgt.z += (T.z - this.camTgt.z) * lagK;
      this.camTgt.y += (T.y - this.camTgt.y) * (1 - Math.exp(-(this.grounded ? 14 : 8) * dt));
      const target = tmp.copy(this.camTgt);
      // kafa sallanması: pelvis sekmesiyle aynı fazda, sönümlü; nişanda yok
      this.camBob = damp(this.camBob || 0, this.grounded && !this.swimming ? (this.model.bobY || 0) : 0, 12, dt);
      target.y += this.camBob * 0.4 * (1 - Ae);
      if (this.camDip > 0) { target.y -= this.camDip; this.camDip = Math.max(0, this.camDip - dt * 1.2); }
      let side = this.cSide * this.cSh;
      // [hareket M6] omuz kayması duvara girmesin: yana ışın, near düzlemi yarı genişliği kadar pay; sönümlü
      const hwN = (cam.near * Math.tan(cam.fov * Math.PI / 360) * 1.35 + 0.05) * cam.aspect + 0.07;
      if (Math.abs(side) > 0.01) {
        const sg = side > 0 ? 1 : -1, hs = g.physics.raycastShared(target.x, target.y, target.z, rx * sg, 0, rz * sg, Math.abs(side) + hwN);
        if (hs && typeof hs.box !== 'string') side = sg * Math.max(0, Math.min(Math.abs(side), hs.t - hwN));
      }
      this.sideCol = this.sideCol === undefined ? side : Math.abs(side) < Math.abs(this.sideCol) ? damp(this.sideCol, side, 30, dt) : damp(this.sideCol, side, 5, dt);
      side = Math.abs(this.sideCol) < Math.abs(side) || Math.sign(this.sideCol) === Math.sign(side) ? this.sideCol : side;
      target.x += rx * side; target.z += rz * side;
      target.y += 0.25 * upK; // dik yukarı bakışta başın biraz üstünden
      const back = tmp2.set(-fx * Math.cos(pitch), Math.sin(pitch), -fz * Math.cos(pitch));
      // kamera çarpışması: birkaç ışınla kaba küre taraması; hızlı yaklaş, yavaş uzaklaş
      let free = this.cDist * (1 - 0.35 * upK);
      const want0 = free;
      for (const [ox, oy] of CAM_RAYS) {
        const hit = g.physics.raycast(target.x + rx * ox, target.y + oy, target.z + rz * ox, back.x, back.y, back.z, want0 + 0.3);
        if (hit) free = Math.min(free, Math.max(0.35, hit.t - 0.3));
      }
      // [hareket M6] near düzlemi köşeleri: hedeften her köşeye ışın; köşe duvarın arkasındaysa bomu kısalt.
      // Tek merkez ışını yan duvarı (dar sokak) görmez; köşe ışınları kesit dikdörtgenini de korur.
      const ux = back.y * rz, uy = back.z * rx - back.x * rz, uz = -back.y * rx; // yukarı = sağ × ileri (ileri = -back)
      const hh = cam.near * Math.tan(cam.fov * Math.PI / 360) * 1.35 + 0.05, hw = hh * cam.aspect + 0.03;
      for (let k = 0; k < 4; k++) {
        const sx = NEAR_CORNERS[k][0] * hw, sy = NEAR_CORNERS[k][1] * hh;
        const ox = back.x * free + rx * sx + ux * sy, oy = back.y * free + uy * sy, oz = back.z * free + rz * sx + uz * sy;
        const L = Math.hypot(ox, oy, oz) || 1;
        const hit = g.physics.raycastShared(target.x, target.y, target.z, ox / L, oy / L, oz / L, L);
        if (hit && hit.t < L && typeof hit.box !== 'string') free = Math.min(free, Math.max(0.2, free * (hit.t - 0.06) / L));
      }
      this.cCol = free < this.cCol ? damp(this.cCol, free, 30, dt) : damp(this.cCol, free, 4, dt);
      this.cCol = Math.min(this.cCol, free + 0.15);
      const d = Math.max(0.2, Math.min(want0, this.cCol));
      this.camDistNow = d;
      this.camPos.set(target.x + back.x * d, target.y + back.y * d, target.z + back.z * d);
      // yan/üst duvar çok yakınsa (hedefin kendisi duvara yaslı) kamerayı duvar normalinden it: dört eksen ışını, sönümlü
      let pxx = 0, pyy = 0, pzz = 0;
      for (let k = 0; k < 4; k++) {
        const sgn = k & 1 ? -1 : 1, lat = k < 2;
        const dx = lat ? rx * sgn : ux * sgn, dy = lat ? 0 : uy * sgn, dz = lat ? rz * sgn : uz * sgn, reach = (lat ? hw : hh) + 0.04;
        const hit = g.physics.raycastShared(this.camPos.x - dx * 0.02, this.camPos.y - dy * 0.02, this.camPos.z - dz * 0.02, dx, dy, dz, reach + 0.02);
        if (hit && typeof hit.box !== 'string') { const pen = reach + 0.02 - hit.t; pxx -= dx * pen; pyy -= dy * pen; pzz -= dz * pen; }
      }
      const pk = 1 - Math.exp(-(Math.abs(pxx) + Math.abs(pyy) + Math.abs(pzz) > Math.abs(CAM_PUSH.x) + Math.abs(CAM_PUSH.y) + Math.abs(CAM_PUSH.z) ? 40 : 8) * dt);
      CAM_PUSH.x += (pxx - CAM_PUSH.x) * pk; CAM_PUSH.y += (pyy - CAM_PUSH.y) * pk; CAM_PUSH.z += (pzz - CAM_PUSH.z) * pk;
      this.camPos.add(CAM_PUSH);
      this.camInit = true;
      cam.position.copy(this.camPos);
      cam.position.y = Math.max(cam.position.y, (this.inInterior ? 0.3 : this.swimming ? WATER_Y + 0.4 : 0.3));
      if (this.inInterior) cam.position.y = Math.min(cam.position.y, this.inInterior.camMaxY ? this.inInterior.camMaxY(this.pos.y) : 3.2); // [şehir] çok katlı iç mekân (AVM)
      // bakış yönü: tam eğim (yukarı bakış sınırı POS_UP'tan bağımsız)
      const cp = Math.cos(lookPitch);
      _look.set(cam.position.x + fx * cp * 10, cam.position.y - Math.sin(lookPitch) * 10, cam.position.z + fz * cp * 10);
      cam.lookAt(_look);
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
    this.model.root.visible = !this.vehicle && !this.scoped;
  }
}

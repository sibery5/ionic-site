// Oyuncu ve NPC'lerin ortak temeli: can, zırh, silah envanteri, ateş etme, hasar.
import * as THREE from 'three';
import { CharacterModel } from './character.js';
import { WEAPONS } from '../game/weapons.js';

let AID = 1;
const tmpV = new THREE.Vector3();

export class Actor {
  constructor(game, look) {
    this.game = game;
    this.id = AID++;
    this.model = new CharacterModel(look);
    this.pos = new THREE.Vector3();
    this.vy = 0;
    this.heading = 0;
    this.speed = 0;
    this.maxHp = 100;
    this.hp = 100;
    this.armor = 0;
    this.dead = false;
    this.deadT = 0;
    this.weapons = { fists: { ammo: Infinity, mag: Infinity } };
    this.weapon = 'fists';
    this.fireCd = 0;
    this.reloadT = 0;
    this.aiming = false;
    this.aimPitch = 0;
    this.recoil = 0;
    this.bloom = 0; // [savaş entegrasyonu] atış başına artan sapma
    this.vehicle = null;
    this.radius = 0.35;
    this.faction = 'civilian';
    this.grounded = true;
    this.swimming = false;
  }

  giveWeapon(id, ammo = 0) {
    const def = WEAPONS[id];
    if (!this.weapons[id]) this.weapons[id] = { ammo: 0, mag: 0 };
    const w = this.weapons[id];
    if (def.type === 'melee') { w.ammo = Infinity; w.mag = Infinity; return; }
    w.ammo += ammo;
    if (w.mag === 0) this.reloadInstant(id);
  }
  reloadInstant(id) {
    const def = WEAPONS[id], w = this.weapons[id];
    if (!w || def.type === 'melee') return;
    const need = def.mag - w.mag;
    const take = Math.min(need, w.ammo);
    w.mag += take; w.ammo -= take;
  }
  setWeapon(id) {
    if (!this.weapons[id]) return;
    this.weapon = id;
    this.reloadT = 0;
    this.model.setWeapon(id);
  }
  get wdef() { return WEAPONS[this.weapon]; }
  get wstate() { return this.weapons[this.weapon]; }

  startReload() {
    const def = this.wdef, w = this.wstate;
    if (def.type === 'melee' || this.reloadT > 0 || w.mag >= def.mag || w.ammo <= 0) return false;
    this.reloadT = def.reload || 1.5;
    if (this.isPlayer) this.game.audio.reload(this.weapon, this.reloadT); // [savaş entegrasyonu] silaha özgü şarjör sesi
    return true;
  }

  updateWeapon(dt) {
    this.fireCd -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 6);
    if (this.bloom > 0) this.bloom = Math.max(0, this.bloom - dt * ((this.wdef && this.wdef.bloomRecover) || 0.12));
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { this.reloadT = 0; this.reloadInstant(this.weapon); }
    }
  }

  // origin + yön ile ateş et (yön normalize)
  tryFire(origin, dir) {
    if (this.dead || this.fireCd > 0 || this.reloadT > 0) return false;
    const def = this.wdef, w = this.wstate;
    if (!def) return false;
    if (def.type === 'melee') {
      this.fireCd = 1 / def.rate;
      this.model.punch();
      this.game.audio.swing(this.weapon); // [savaş entegrasyonu] bıçak/sopa savuruş sesi
      this.game.combat.melee(this, def);
      return true;
    }
    if (w.mag <= 0) {
      if (!this.startReload()) { if (this.isPlayer) this.game.audio.empty(); this.fireCd = 0.3; }
      return false;
    }
    w.mag--;
    this.fireCd = 1 / def.rate;
    this.recoil = Math.min(1, this.recoil + (def.dmg > 50 ? 0.8 : 0.3));
    const muzzle = this.model.muzzleWorld(tmpV.clone());
    if (def.type === 'throw') {
      this.game.combat.throwGrenade(this, origin, dir);
      if (w.mag <= 0 && w.ammo <= 0) { delete this.weapons[this.weapon]; this.setWeapon('fists'); }
      else this.reloadInstant(this.weapon);
      return true;
    }
    this.game.audio.gunshot(def.sound, this.pos.x, this.pos.z);
    // [savaş entegrasyonu] yıldız namlu alevi, ışık, duman ve kovan atma
    this.game.combat.muzzleFlash(this, muzzle, dir, def);
    // [savaş entegrasyonu] oyuncu için silaha özgü kamera geri tepmesi
    if (this.isPlayer && def.recoil) { this.camPitch -= def.recoil * (this.aiming ? 0.7 : 1); this.camYaw += (Math.random() - 0.5) * 2 * (def.recoilH || 0); }
    if (def.type === 'launcher') {
      this.game.combat.rocket(this, muzzle, dir, def);
    } else {
      const n = def.pellets || 1;
      // [savaş entegrasyonu] sapma: taban + birikmiş bloom, nişan çarpanı (adsMul), hareket/çömelme
      let spread;
      if (this.isPlayer) {
        const base = this.aiming ? def.spread * (def.adsMul || 0.6) : (def.hipSpread || def.spread);
        spread = (base + this.bloom) * (this.crouch ? 0.8 : 1) * (1 + Math.min(0.6, (this.speed || 0) * 0.06));
      } else spread = def.spread * 2.2 * (this.accuracy ? 1 / this.accuracy : 1) + this.bloom * 0.5;
      this.bloom = Math.min(def.bloomMax || 0, this.bloom + (def.bloom || 0));
      for (let i = 0; i < n; i++) {
        const d = dir.clone();
        d.x += (Math.random() - 0.5) * 2 * spread; d.y += (Math.random() - 0.5) * 2 * spread; d.z += (Math.random() - 0.5) * 2 * spread;
        d.normalize();
        this.game.combat.hitscan(this, origin, d, def, muzzle);
      }
    }
    this.game.combat.noise(this.pos.x, this.pos.z, 60, this);
    if (w.mag <= 0) this.startReload();
    return true;
  }

  takeDamage(amount, attacker, kind = 'bullet', headshot = false) {
    if (this.dead) return 0;
    if (this.god) return 0;
    let dmg = amount * (headshot ? 2.5 : 1);
    if (this.armor > 0 && kind !== 'fall') {
      const absorb = Math.min(this.armor, dmg * 0.7);
      this.armor -= absorb; dmg -= absorb;
    }
    this.hp -= dmg;
    this.lastAttacker = attacker;
    // vuruş tepkisi: saldırgandan kurbana doğru
    if (attacker && attacker !== this && attacker.pos) {
      const dx = this.pos.x - attacker.pos.x, dz = this.pos.z - attacker.pos.z;
      this.model.hit(dx, dz, kind === 'explosion' ? 1.6 : kind === 'melee' ? 1.2 : Math.min(1.3, 0.5 + dmg / 40));
    } else if (kind === 'explosion' && this.knock) this.model.hit(this.knock.x, this.knock.z, 1.6);
    this.onDamaged && this.onDamaged(dmg, attacker, kind);
    if (this.hp <= 0) { this.hp = 0; this.die(attacker, kind); }
    return dmg;
  }

  die(attacker, kind) {
    this.dead = true;
    if (!this.model.deathDir) {
      if (attacker && attacker !== this && attacker.pos) this.model.die(this.pos.x - attacker.pos.x, this.pos.z - attacker.pos.z);
      else this.model.die();
    }
    this.deadT = 0;
    this.onDeath && this.onDeath(attacker, kind);
  }

  // Animasyon durumu (CharacterModel.animate'e gider). Nesne yeniden kullanılır: her karede bellek ayırmaz.
  animState() {
    const st = this._st || (this._st = {});
    const def = this.wdef;
    st.speed = this.speed;
    st.moveX = this.moveLocalX !== undefined ? this.moveLocalX : 0;
    st.moveZ = this.moveLocalZ !== undefined ? this.moveLocalZ : 1;
    st.aim = this.aiming && this.weapon !== 'fists' && def.type !== 'melee';
    st.aimPitch = this.aimPitch; st.aimYaw = this.aimYaw || 0;
    st.twoHanded = def && !def.oneHand && def.type !== 'melee' && this.weapon !== 'grenade';
    st.dead = this.dead; st.swim = this.swimming; st.recoil = this.recoil;
    st.reload = this.reloadT > 0 ? 1 - this.reloadT / (def.reload || 1.5) : 0;
    st.weapon = this.weapon; st.crouch = !!this.crouch; st.hands_up = !!this.handsUp; st.sit = !!this.sitting; st.talk = !!this.talking;
    st.air = this.isPlayer ? !this.grounded && !this.swimming : false; st.vy = this.vy;
    st.vault = this.vaultT || 0; st.roll = this.rollT || 0;
    // kulüp dansçıları (interiors.js ctx.dancers)
    const ii = this.inInterior;
    st.dance = !!(this.dancing || (ii && ii.dancers && ii.dancers.includes(this)));
    if (st.dance) st.talk = false;
    return st;
  }
}

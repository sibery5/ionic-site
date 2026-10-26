// Yaşam sistemleri: kariyer, mülkler, borsa, kredi/vadeli hesap, test sürüşü, dükkân soygunları.
// Tek giriş noktası: `new Life(game)` — game.life / game.career / game.properties / game.market atanır.
// main.js entegre edilene kadar UI.update() içinden `tickFromUI` ile kendini günceller.
import { CARS, PROPERTIES, BUSINESSES, LUXURY_VEHICLES, FINANCE, garageCapacity, bizUpgradeBonus, ensureLifeState } from './economy.js';
import { Career } from './career.js';
import { Properties } from './properties.js';
import { Market } from './market.js';
import { formatMoney } from '../core/util.js';

const ROBBABLE = ['food', 'clothes', 'cafe', 'club'];

export class Life {
  constructor(game) {
    this.game = game;
    this.career = new Career(game);
    this.properties = new Properties(game);
    this.market = new Market(game);
    game.life = this; game.career = this.career; game.properties = this.properties; game.market = this.market;
    this.test = null;
    this._state = null; this._day = 0; this._ctx = null;
    this.externalDriven = false;
    this._key = (e) => this.onKey(e);
    window.addEventListener('keydown', this._key);
  }

  // main.js updateGame içinden çağrılması önerilen giriş
  update(dt) { this.externalDriven = true; this._update(dt); }
  tickFromUI(dt) { if (!this.externalDriven) this._update(dt); }

  _update(dt) {
    const g = this.game, s = g.state;
    if (!s || (g.mode !== 'playing' && g.mode !== 'dead')) return;
    ensureLifeState(s);
    if (this._state !== s) {
      this._state = s; this._day = g.env.day; this._ctx = null;
      if (this.test) this.test = null;
      this.career.onNewState();
      this.properties.sync(true);
    }
    this.properties.sync();
    if (g.env.day !== this._day) { if (g.env.day > this._day) this.onNewDay(g.env.day); this._day = g.env.day; }
    const ctx = g.player.inInterior;
    if (ctx !== this._ctx) { this._ctx = ctx; if (ctx) this.onEnterInterior(ctx); }
    this.market.update(dt);
    this.career.update(dt);
    this.updateTest(dt);
  }

  onKey(e) {
    const g = this.game, ui = g.ui;
    if (g.mode !== 'playing' || e.repeat) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    const kind = e.code === 'KeyI' ? 'inventory' : e.code === 'KeyP' ? 'phone' : null;
    if (!kind) return;
    const top = ui.modalStack[ui.modalStack.length - 1];
    if (top && top.kind === kind) { ui.closeModal(top); return; }
    if (ui.blocking()) return;
    if (kind === 'inventory') ui.openInventory(); else ui.openPhone();
  }

  // ---------------- gün dönümü ----------------
  onNewDay(day) {
    const g = this.game, s = g.state;
    const lines = [];
    const bonus = bizUpgradeBonus(s);
    if (bonus > 0) { s.money += bonus; lines.push(`İşletme geliştirme geliri ${formatMoney(bonus)}`); }
    if (s.savings > 0) { const i = Math.min(80000, Math.floor(s.savings * 0.02)); s.savings += i; lines.push(`Vadeli faiz ${formatMoney(i)}`); }
    for (const L of s.loans.slice()) {
      const due = Math.min(L.daily, L.remaining);
      if (s.bank >= due) s.bank -= due;
      else if (s.bank + s.money >= due) { s.money -= due - s.bank; s.bank = 0; } else {
        L.missed = (L.missed || 0) + 1;
        L.remaining += Math.round(L.daily * 0.1);
        s.legalRep = Math.max(0, s.legalRep - 5);
        g.ui.notify(`Kredi taksidi ödenemedi: ${L.name} (${L.missed}/3)`, 'warn');
        if (L.missed >= 3 && L.kind === 'car') this.repossess(L);
        continue;
      }
      L.remaining -= due; L.paid = (L.paid || 0) + due;
      if (L.remaining <= 1) { s.loans.splice(s.loans.indexOf(L), 1); g.ui.notify(`Kredi kapandı: ${L.name}`, 'good'); s.legalRep += 5; }
    }
    if (s.loans.length) lines.push(`Kredi taksitleri ödendi (${s.loans.length} aktif)`);
    this.market.onNewDay();
    if (lines.length) g.ui.notify(lines.join(' · '), 'money');
    void day;
  }
  repossess(L) {
    const g = this.game, s = g.state;
    const i = s.ownedCars.map((c) => c.type).lastIndexOf(L.car.type);
    if (i >= 0) {
      const c = s.ownedCars[i];
      const v = g.vehicles.list.find((x) => x.id === c.vid);
      if (v && g.player.vehicle !== v) g.vehicles.remove(v); else if (v) v.owned = false;
      s.ownedCars.splice(i, 1);
    }
    s.loans.splice(s.loans.indexOf(L), 1);
    g.ui.bigMessage('ARACA EL KONDU', `${CARS[L.car.type] ? CARS[L.car.type].name : 'Araç'} · 3 taksit ödenmedi`, 'red', 3.5);
  }

  // ---------------- iç mekân girişleri ----------------
  onEnterInterior(ctx) {
    const g = this.game, s = g.state;
    // dükkânın satış noktası (iş etkileşimleri için referans)
    const shop = ctx.interact.find((it) => it.label && it.label !== 'Dışarı çık' && !it.danger);
    if (shop && !ctx.shopSpot) ctx.shopSpot = { x: shop.x, z: shop.z };
    if (ctx.building.ownedProp) this.properties.decorate(ctx);
    // silahlı kasa soygunu: her dükkânda, günde bir kez
    const key = 'shop:' + ctx.building.id;
    if (ROBBABLE.includes(ctx.type) && s.robbed[key] !== g.env.day && (ctx.register || ctx.shopSpot)) {
      const at = ctx.register || { x: ctx.shopSpot.x + 1.4, z: ctx.shopSpot.z };
      const it = { x: at.x, z: at.z, r: 1.4, danger: true, label: 'KASAYI SOY (ateşli silah · 2 yıldız)', action: () => this.robShop(ctx, it, key) };
      ctx.interact.push(it);
    }
    this.career.onEnterInterior(ctx);
  }
  robShop(ctx, it, key) {
    const g = this.game, s = g.state, C = this.career;
    if (!C.hasGun()) { g.ui.notify('Kasayı soymak için ateşli silah çek!', 'warn'); g.audio.error(); return; }
    if (C.hold) return;
    const keeper = g.npcs.list.find((n) => n.kind === 'shopkeeper' && !n.dead);
    if (keeper) g.ui.bark(keeper, 'Tamam, tamam! Ateş etme, al hepsini!');
    g.wanted.add(1, true);
    C.startHold({
      label: 'Kasa boşaltılıyor', dur: 5, x: it.x, z: it.z, r: 3, ctx, cancelText: 'Soygunu yarıda bıraktın',
      done: () => {
        s.robbed[key] = g.env.day;
        const i = ctx.interact.indexOf(it); if (i >= 0) ctx.interact.splice(i, 1);
        const amt = (700 + Math.random() * 2300) * (ctx.type === 'club' ? 2 : 1);
        g.wanted.add(1, true);
        s.stats.robberies++;
        C.pay(amt, 'crime', 6, 'Kasa soygunu');
        g.ui.bigMessage('SOYGUN!', 'Kasa boşaldı — kaç!', 'red', 2.5);
        C.onRobbery(ctx);
      },
    });
  }

  // ---------------- test sürüşü ----------------
  startTest(type, color) {
    const g = this.game, p = g.player;
    if (this.test) return g.ui.notify('Zaten test sürüşündesin.', 'warn');
    if (g.wanted.level > 0) return g.ui.notify('Aranırken test sürüşü verilmez!', 'warn');
    if (this.career.job) return g.ui.notify('Önce işini bitir (Telefon › İşler).', 'warn');
    const ref = p.inInterior ? { x: p.inInterior.door.x, z: p.inInterior.door.z } : { x: p.pos.x, z: p.pos.z };
    g.ui.closeAll();
    if (p.inInterior) g.interiors.exit();
    const v = this.career.spawnCar(type, ref.x, ref.z, color, 12);
    v.mission = 'test'; v.testDrive = true;
    g.enterVehicle(v, true);
    this.test = { v, t: 60, type, color };
    g.ui.bigMessage('TEST SÜRÜŞÜ', `${CARS[type].name} · 60 saniye`, 'gold', 2.5);
  }
  updateTest(dt) {
    const T = this.test;
    if (!T) return;
    T.t -= dt;
    const g = this.game;
    g.ui.setJobTimer(Math.max(0, T.t));
    g.ui.setObjective(`Test sürüşü · ${CARS[T.type].name} <small>Beğendin mi? Telefon (P) › Galeri › Satın Al</small>`, 'job', 'legal');
    if (T.t <= 0 || T.v.destroyed) this.endTest(false);
  }
  endTest(bought) {
    const g = this.game, T = this.test, p = g.player;
    if (!T) return;
    this.test = null;
    g.ui.setJobTimer(0); g.ui.setObjective('', 'job');
    if (bought) { T.v.mission = null; T.v.testDrive = false; return; }
    if (p.vehicle === T.v) { g.vehicles.ejectDriver(T.v); }
    g.vehicles.remove(T.v);
    if (p.lastVehicle === T.v) p.lastVehicle = null;
    g.ui.notify(T.v.destroyed ? 'Test aracını hurdaya çevirdin! Galerici çok kızgın.' : 'Test sürüşü bitti, araç galeriye döndü.', 'info');
  }

  // ---------------- satın alma ----------------
  // method: 'cash' | 'bank' | 'finance'
  pay(price, method) {
    const g = this.game, s = g.state;
    const key = method === 'bank' ? 'bank' : 'money';
    if (s[key] < price) { g.audio.error(); g.ui.notify(method === 'bank' ? 'Banka bakiyesi yetersiz!' : 'Nakit yetersiz!', 'warn'); return false; }
    s[key] -= price; g.audio.cash(); return true;
  }
  financeOffer(price) {
    const down = Math.round(price * FINANCE.down);
    const total = Math.round((price - down) * (1 + FINANCE.interest));
    return { down, total, daily: Math.ceil(total / FINANCE.days), days: FINANCE.days };
  }
  buyCar(type, color, method) {
    const g = this.game, s = ensureLifeState(g.state), c = CARS[type];
    if (!c) return false;
    if (s.ownedCars.length >= garageCapacity(s)) { g.audio.error(); g.ui.notify(`Garajın dolu (${garageCapacity(s)} araç). Mülk alarak kapasiteyi artır.`, 'warn'); return false; }
    if (method === 'finance') {
      const f = this.financeOffer(c.price);
      const from = s.money >= f.down ? 'cash' : 'bank';
      if (!this.pay(f.down, from)) return false;
      s.loans.push({ kind: 'car', name: c.name + ' taşıt kredisi', remaining: f.total, daily: f.daily, missed: 0, car: { type } });
    } else if (!this.pay(c.price, method)) return false;
    s.ownedCars.push({ type, color });
    s.respect += Math.round(c.price / 20000);
    const T = this.test;
    if (T && T.type === type) {
      T.v.owned = true; s.ownedCars[s.ownedCars.length - 1].vid = T.v.id;
      if (T.v.color !== color) s.ownedCars[s.ownedCars.length - 1].color = T.v.color;
      this.endTest(true);
      g.ui.closeAll();
      g.ui.notify(`${c.name} artık senin! Hayırlı olsun.`, 'gold');
      return true;
    }
    g.ui.closeAll();
    if (g.player.inInterior) g.interiors.exit();
    g.spawnOwnedCar(s.ownedCars.length - 1, true);
    g.ui.notify(`${c.name} kapının önünde! Hayırlı olsun.`, 'gold');
    return true;
  }
  buyLuxury(id, color, method) {
    const g = this.game, s = ensureLifeState(g.state);
    const L = LUXURY_VEHICLES.find((x) => x.id === id);
    if (!L || !this.pay(L.price, method)) return false;
    const entry = { id, type: L.type, color, day: g.env.day };
    s.luxury.push(entry);
    s.respect += Math.round(L.price / 50000);
    g.audio.success();
    g.ui.bigMessage(L.name.toUpperCase(), 'Satın alındı', 'gold', 3);
    this.deliverLuxury(s.luxury.length - 1);
    return true;
  }
  deliverLuxury(i) {
    const g = this.game, e = g.state.luxury[i];
    if (!e) return;
    // teslimat (iskele / helipad / pist) mimar tarafından bağlanır
    if (typeof g.spawnLuxury === 'function') g.spawnLuxury(e, i);
    else g.ui.notify(`${LUXURY_VEHICLES.find((x) => x.id === e.id).name} ${e.type === 'speedboat' || e.type === 'yacht' ? 'marinada' : 'hangarda'} seni bekliyor. (Teslimat noktaları yakında)`, 'info');
  }

  // ---------------- banka ----------------
  loanLimit() {
    const s = this.game.state;
    let v = 25000 + s.legalRep * 120 + s.respect * 20;
    for (const id of s.properties) { const p = PROPERTIES.find((x) => x.id === id); if (p) v += p.price * 0.4; }
    for (const id of s.businesses) { const b = BUSINESSES.find((x) => x.id === id); if (b) v += b.price * 0.3; }
    for (const L of s.loans) v -= L.remaining;
    return Math.max(0, Math.round(v / 1000) * 1000);
  }
  takeLoan(amount) {
    const g = this.game, s = g.state;
    if (amount > this.loanLimit()) { g.audio.error(); g.ui.notify('Kredi limitin yetersiz', 'warn'); return false; }
    const total = Math.round(amount * 1.12);
    s.loans.push({ kind: 'bank', name: 'İhtiyaç kredisi', remaining: total, daily: Math.ceil(total / 10), missed: 0 });
    s.bank += amount; g.audio.cash();
    g.ui.notify(`${formatMoney(amount)} kredi hesabına yattı · 10 gün taksit`, 'money');
    return true;
  }
  payOffLoan(i) {
    const g = this.game, s = g.state, L = s.loans[i];
    if (!L) return false;
    const need = L.remaining;
    if (s.bank + s.money < need) { g.audio.error(); g.ui.notify('Kapatmak için yeterli paran yok', 'warn'); return false; }
    const fromBank = Math.min(s.bank, need); s.bank -= fromBank; s.money -= need - fromBank;
    s.loans.splice(i, 1); s.legalRep += 3; g.audio.cash();
    g.ui.notify(`${L.name} erken kapatıldı`, 'good');
    return true;
  }
}

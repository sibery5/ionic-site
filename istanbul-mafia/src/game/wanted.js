// Aranma seviyesi (yıldız) sistemi, polis sevkiyatı ve tutuklama.
export class Wanted {
  constructor(game) {
    this.game = game;
    this.level = 0;
    this.heat = 0; // 0..5 ondalık
    this.seenT = 0; // polisin oyuncuyu en son gördüğünden beri geçen süre
    this.dispatchT = 0;
    this.arrestT = 0;
    this.reportQueue = [];
  }
  reset() { this.level = 0; this.heat = 0; this.seenT = 0; this.arrestT = 0; this.reportQueue = []; }

  policeNear(x, z, r = 55) {
    const g = this.game;
    for (const n of g.npcs.list) {
      if (n.dead || n.faction !== 'police') continue;
      if (Math.hypot(n.pos.x - x, n.pos.z - z) < r && g.physics.lineOfSight(n.pos.x, n.pos.y + 1.6, n.pos.z, x, 1.5, z)) return true;
    }
    for (const v of g.vehicles.list) {
      if ((v.type === 'police' || v.type === 'swat') && v.ai && !v.ai.empty && !v.destroyed && Math.hypot(v.pos.x - x, v.pos.z - z) < r) return true;
    }
    return false;
  }

  add(amount, immediate) {
    if (this.game.state.cheats && this.game.state.cheats.nowanted) return;
    const before = this.level;
    this.heat = Math.min(5.99, this.heat + amount);
    this.level = Math.min(5, Math.floor(this.heat + 0.001));
    if (immediate) this.seenT = 0;
    if (this.level > before) {
      this.game.audio.setSiren(1);
      this.game.ui.flashWanted();
    }
  }

  // suç türleri
  crime(type, pos) {
    const g = this.game;
    if (g.player.inInterior && type !== 'kill_police' && type !== 'kill_civilian' && type !== 'shoot') { /* iç mekânda tanık yok sayılır */ }
    const p = pos || g.player.pos;
    const seen = this.policeNear(p.x, p.z);
    const table = {
      assault: 0.35, kill_civilian: 1, kill_police: 2, kill_gang: 0.4, shoot: 1, carjack: 0.6, hit_police_car: 1,
      explosion: 1.2, hit_ped: 0.5, robbery: 1, assault_police: 1, kill_boss: 1,
    };
    const amt = table[type] || 0.5;
    if (seen || type === 'kill_police' || type === 'assault_police' || type === 'explosion') this.add(Math.max(amt, this.level === 0 ? 1 : amt), true);
    else this.reportQueue.push({ t: 4 + Math.random() * 6, amt: amt * 0.7 }); // siviller polisi arar
    if (this.game.state && type === 'kill_police') this.game.state.stats.copsKilled++;
  }

  onPlayerNoise(x, z) {
    if (this.policeNear(x, z, 45)) { if (this.level < 1) this.add(1, true); else this.heat = Math.min(5.99, this.heat + 0.15); this.seenT = 0; }
    else if (Math.random() < 0.1) this.reportQueue.push({ t: 8, amt: 0.4 });
  }
  onAttackVehicle(v) {
    if (v.type === 'police' || v.type === 'swat') this.crime('hit_police_car', v.pos);
  }

  update(dt) {
    const g = this.game;
    for (const r of this.reportQueue) r.t -= dt;
    const due = this.reportQueue.filter((r) => r.t <= 0);
    this.reportQueue = this.reportQueue.filter((r) => r.t > 0);
    for (const r of due) { if (this.level === 0) g.ui.notify('Bir vatandaş polisi aradı!', 'warn'); this.add(Math.max(r.amt, this.level === 0 ? 1 : r.amt), true); }

    if (this.level <= 0) { g.audio.setSiren(0); this.arrestT = 0; return; }
    const p = g.player;
    if (!p.inInterior && this.policeNear(p.pos.x, p.pos.z, 70)) this.seenT = 0;
    else this.seenT += dt;
    const escapeTime = 12 + this.level * 7;
    if (this.seenT > escapeTime) {
      this.seenT = 0;
      this.heat = Math.max(0, Math.floor(this.heat) - 1 + 0.0);
      this.level = Math.floor(this.heat);
      if (this.level <= 0) {
        this.heat = 0;
        g.ui.notify('Polisleri atlattın!', 'good');
        g.audio.setSiren(0);
        g.npcs.calmPolice();
      }
    }
    g.audio.setSiren(this.level > 0 && this.seenT < 10 ? Math.min(1, this.level / 3) : 0.2 * (this.level > 0 ? 1 : 0));

    // polis sevkiyatı
    this.dispatchT -= dt;
    if (this.dispatchT <= 0 && !p.inInterior) {
      this.dispatchT = 4;
      const cars = g.vehicles.list.filter((v) => (v.type === 'police' || v.type === 'swat') && v.ai && v.ai.mode === 'chase').length;
      const foot = g.npcs.list.filter((n) => n.faction === 'police' && !n.dead).length;
      const wantCars = [0, 1, 2, 3, 4, 6][this.level];
      const wantFoot = [0, 2, 4, 6, 8, 10][this.level];
      if (cars < wantCars) g.npcs.dispatchPoliceCar(this.level >= 4 && Math.random() < 0.4 ? 'swat' : 'police');
      if (foot < wantFoot) g.npcs.spawnPoliceFoot();
    }
    // tutuklama (1 yıldızda ya da oyuncu yaya ve elleri boşsa)
    if (!p.vehicle && !p.dead) {
      let close = false;
      for (const n of g.npcs.list) if (n.faction === 'police' && !n.dead && Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z) < 1.7) { close = true; break; }
      if (close && (this.level <= 1 || p.weapon === 'fists' || p.hp < 25)) {
        this.arrestT += dt;
        if (this.arrestT > 1.8) { this.arrestT = 0; g.onBusted(); }
      } else this.arrestT = Math.max(0, this.arrestT - dt);
    }
  }
}

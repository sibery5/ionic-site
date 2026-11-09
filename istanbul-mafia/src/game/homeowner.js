// [kanun] Ev sahibi: içinde sahibi varken bir daireye girersen sana yürür, "Sen kimsin? Evimden çık!" der;
// çıkmazsan saldırır. Dışarı çıkınca (iç mekân kapanır) peşini bırakır.
const WARN1 = 0.8, WARN2 = 5.5, ATTACK = 8.5;

export class HomeOwner {
  constructor(game) {
    this.g = game;
    this.ctx = null;
    this.t = 0;
    this.owner = null;
    this.stage = 0;
    this.stats = { warned: 0, attacked: 0 };
  }
  update(dt) {
    const g = this.g, p = g.player, ctx = p.inInterior;
    if (ctx !== this.ctx) {
      this.ctx = ctx; this.t = 0; this.stage = 0; this.owner = null;
      if (ctx && ctx.type === 'apartment' && !(g.missions && g.missions.active && g.missions.active.building === ctx.building)) {
        // [şehir] ev sahibi = hanenin ilk sakini (iç mekân kurucusu önce onu yerleştirir); eşi/ev arkadaşı ikinci sırada.
        // Eskiden "en yakın sakin" seçiliyordu: iki sakinli evde biri uyarıp saldırırken diğeri kaçıyordu.
        let best = null;
        for (const n of g.npcs.list) {
          if (n.dead || n.kind !== 'resident' || n.mission || n.inInterior !== ctx) continue;
          if (n.homeOwner) { best = n; break; }
          if (!best) best = n;
        }
        this.owner = best;
      }
      return;
    }
    const n = this.owner;
    if (!n || !ctx || n.dead || n.downed) return;
    // ev sahibi saldırıya uğradıysa kendi tepkisini verir (kaçar / karşılık)
    if (n.state === 'flee' || n.state === 'cower' || n.state === 'handsup') { this.stage = 9; return; }
    this.t += dt;
    const d = Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z);
    if (this.stage === 0 && this.t > WARN1) {
      this.stage = 1; this.stats.warned++;
      n.static = false; n.sitting = false;
      n.barkT = 0; n.say('Sen kimsin? Evimden çık!');
      n.state = 'ext';
      n.ext = (dt2, m) => {
        const pl = g.player;
        const dd = Math.hypot(pl.pos.x - m.pos.x, pl.pos.z - m.pos.z);
        m.talking = true;
        if (dd > 1.9) { m.navTo(pl.pos.x, pl.pos.z, 1.8, dt2, false); return m.speed; }
        m.heading += Math.atan2(Math.sin(Math.atan2(pl.pos.x - m.pos.x, pl.pos.z - m.pos.z) - m.heading), Math.cos(Math.atan2(pl.pos.x - m.pos.x, pl.pos.z - m.pos.z) - m.heading)) * Math.min(1, dt2 * 6);
        return 0;
      };
    }
    if (this.stage === 1 && this.t > WARN2) { this.stage = 2; n.barkT = 0; n.say(['Çık dedim! Son kez söylüyorum!', 'Defol evimden, yoksa fena olur!']); }
    if (this.stage === 2 && this.t > ATTACK) {
      this.stage = 3; this.stats.attacked++;
      n.ext = null; n.talking = false;
      const melee = Object.keys(n.weapons).find((w) => w !== 'fists' && n.weapons[w] && w !== 'pistol');
      n.setWeapon(n.weapons.pistol && n.brave ? 'pistol' : melee || 'fists');
      n.engage(p, 0.2);
      n.barkT = 0; n.say(['Sen istedin!', 'Hırsız! Al sana!']);
    }
    void d;
  }
}

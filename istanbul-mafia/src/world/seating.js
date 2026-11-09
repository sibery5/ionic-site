// Oturma yerleri (sokak/park/sahil bankları): city.seats = [{ x, y, z, heading, kind, bench, actor }]
// Her bank iki oturma yeri verir (sol/sağ). Konum: oturan kişinin ayak noktası (bankın 0.25 m önü),
// heading: oturanın baktığı yön (bankın önü). Oyuncu E ile oturur; E / hareket / zıplama ile kalkar.
// İç mekân oturma yerleri başka ekibin işidir (yalnız sokak bankları).

export function buildSeats(city) {
  const seats = [];
  const B = city.benches || [];
  B.forEach((b, i) => {
    const [x, z, rot] = b;
    const c = Math.cos(rot), s = Math.sin(rot);
    for (const lx of [-0.45, 0.45]) {
      const lz = 0.25; // bank önüne doğru
      seats.push({ x: x + lx * c + lz * s, y: b[3] || 0.15, z: z - lx * s + lz * c, heading: rot, kind: b[4] || 'bench', bench: i, bx: x, bz: z, actor: null });
    }
  });
  city.seats = seats;
  // hızlı arama için 16 m ızgara
  const grid = new Map();
  for (const st of seats) { const k = Math.floor(st.x / 16) * 4096 + Math.floor(st.z / 16); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(st); }
  city.seatGrid = grid;
  return seats;
}

export class Seating {
  constructor(game) {
    this.game = game;
    this.city = game.city;
    if (!this.city.seats) buildSeats(this.city);
  }
  // en yakın boş oturma yeri (r m içinde)
  nearest(x, z, r = 1.4) {
    const g = this.city.seatGrid; if (!g) return null;
    let best = null, bd = r;
    const ci = Math.floor(x / 16), cj = Math.floor(z / 16);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const a = g.get((ci + i) * 4096 + cj + j); if (!a) continue;
      for (const st of a) {
        const d = Math.hypot(st.x - x, st.z - z);
        if (d < bd && this.free(st)) { bd = d; best = st; }
      }
    }
    return best;
  }
  // bank kırılmadıysa ve kimse oturmuyorsa boş
  free(st) {
    if (st.actor && st.actor !== this.game.player) return false;
    const ph = this.game.physics.city, tmp = this._tmp || (this._tmp = []);
    const bs = ph.query(st.bx - 0.3, st.bz - 0.3, st.bx + 0.3, st.bz + 0.3, tmp);
    if (st.kind === 'bench' && !bs.some((b) => b.tag === 'bench' && !b.removed)) return false;
    const npcs = this.game.npcs && this.game.npcs.list;
    if (npcs) for (const n of npcs) if (n.sitting && !n.dead && Math.abs(n.pos.x - st.x) < 0.6 && Math.abs(n.pos.z - st.z) < 0.6) return false;
    return true;
  }
  sit(st, actor = this.game.player) {
    if (!st || !this.free(st)) return false;
    if (actor.seat) this.stand(actor);
    st.actor = actor; actor.seat = st; actor.sitting = true;
    actor.vx = 0; actor.vz = 0; actor.speed = 0; actor.aiming = false; actor.crouch = false;
    actor.pos.set(st.x, st.y, st.z); actor.heading = st.heading;
    if (actor.isPlayer) actor.camYaw = st.heading + Math.PI * 0; // kamera bankın baktığı yöne (denize)
    return true;
  }
  stand(actor = this.game.player) {
    const st = actor.seat; if (!st) return false;
    st.actor = null; actor.seat = null; actor.sitting = false;
    actor.pos.x += Math.sin(st.heading) * 0.45; actor.pos.z += Math.cos(st.heading) * 0.45;
    return true;
  }
  // main.findInteraction: E istemi
  prompt() {
    const p = this.game.player;
    if (p.vehicle || p.dead || p.inInterior) return null;
    if (p.seat) return { label: 'Kalk', action: () => this.stand(p) };
    if (p.swimming || p.aiming) return null;
    const st = this.nearest(p.pos.x, p.pos.z, 1.4);
    if (!st || Math.abs(p.pos.y - st.y) > 0.8) return null;
    return { label: st.kind === 'sahil' ? 'Banka otur (denize karşı)' : st.kind === 'kafe' ? 'Kafe sandalyesine otur' : 'Banka otur', action: () => this.sit(st, p) }; // [şehir] kafe
  }
  // her kare (oyuncu güncellemesinden sonra): oturan oyuncuyu bankta tut; hareket/zıplama ile kalk
  update(dt, input) {
    const p = this.game.player, st = p.seat;
    if (!st) return;
    if (p.dead || p.vehicle || p.inInterior || (p.hp < (this._hp ?? p.hp))) { this.stand(p); this._hp = undefined; return; }
    this._hp = p.hp;
    if (input && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].some((k) => input.down(k)) || (input && input.hit('Space'))) { this.stand(p); return; }
    p.pos.set(st.x, st.y, st.z); p.vx = 0; p.vz = 0; p.speed = 0; p.heading = st.heading; p.sitting = true;
  }
}

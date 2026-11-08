// Gece aydınlatması (ucuz "kümelenmiş ileri" ışık seti):
//  - Sabit sayıda gerçek PointLight (kalite: düşük 6 / orta 12 / yüksek 20) kameraya en yakın sokak lambalarına
//    0.2 sn'de bir yeniden atanır; yuvalar arasında yumuşak geçiş (söner → taşınır → yanar), patlama yok.
//  - Sabit sayıda SpotLight (düşük 2 / orta 4 / yüksek 6): oyuncu aracının farları, en yakın trafik araçlarının
//    farları ve yakındaki askeri gözetleme kulesi projektörleri.
//  - Geri kalan lambalar: zemine işlenmiş ışık havuzu çıkartmaları (city.buildLightPools) + emisyonlu lamba başı + hale.
// Işık SAYISI hiçbir zaman değişmez (gündüz yoğunluk 0) → three.js şader yeniden derlemesi olmaz.
// API: new NightLights(game, quality) · update(dt, camPos) · sources (city.lightSources) · searchlights
import * as THREE from 'three';

const COUNTS = { low: [4, 1], medium: [8, 2], high: [12, 3], ultra: [16, 4] };
const CELL = 40;
const cellKey = (i, j) => (i + 500) + 1000 * (j + 500);
const LAMP_I = 38, LAMP_R = 24; // kandela, menzil (m)
const HEAD_I = 260, HEAD_R = 48;
const SEARCH_I = 1400, SEARCH_R = 140;

export class NightLights {
  constructor(game, quality = 'medium') {
    this.game = game;
    const [np, ns] = COUNTS[quality] || COUNTS.medium;
    this.group = new THREE.Group(); this.group.name = 'nightLights';
    game.scene.add(this.group);
    this.points = [];
    for (let i = 0; i < np; i++) {
      const l = new THREE.PointLight(0xffc27a, 0, LAMP_R, 1.7);
      l.position.set(0, -500, 0);
      this.group.add(l);
      this.points.push({ light: l, src: null, next: null, k: 0 });
    }
    this.spots = [];
    for (let i = 0; i < ns; i++) {
      const l = new THREE.SpotLight(0xfff0d8, 0, HEAD_R, 0.55, 0.55, 1.4);
      l.position.set(0, -500, 0); l.target.position.set(0, -501, 0);
      this.group.add(l); this.group.add(l.target);
      this.spots.push({ light: l, key: null, k: 0 });
    }
    this.sources = (game.city && game.city.lightSources) || [];
    this.grid = new Map();
    for (const s of this.sources) {
      const key = cellKey(Math.floor(s.x / CELL), Math.floor(s.z / CELL));
      let a = this.grid.get(key); if (!a) this.grid.set(key, (a = [])); a.push(s);
    }
    this.searchlights = (game.city && game.city.searchlights) || [];
    // projektör ışık konileri (tek InstancedMesh, eklemeli; gece görünür, sis içinde "hacimsel" izlenim)
    if (this.searchlights.length) {
      const cg = new THREE.ConeGeometry(1, 1, 14, 1, true); cg.translate(0, -0.5, 0);
      // tepe (lamba) parlak, taban sönük: köşe rengiyle gradyan
      const p = cg.attributes.position, col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) { const k = 1 + p.getY(i) * 0.85; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k; }
      cg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const bm = new THREE.MeshBasicMaterial({ color: 0xcfdcff, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true });
      if (game.city) game.city.beamMat = bm;
      this.beams = new THREE.InstancedMesh(cg, bm, this.searchlights.length);
      this.beams.frustumCulled = false; this.beams.renderOrder = 4;
      this.group.add(this.beams);
      this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._dn = new THREE.Vector3(0, -1, 0); this._d = new THREE.Vector3(); this._p = new THREE.Vector3();
    }
    this.t = 0; this.pickT = 0;
    this._cand = []; this._fwd = new THREE.Vector3();
    this.stats = { points: np, spots: ns, sources: this.sources.length };
  }

  // kameraya en yakın N lamba (öne doğru hafif ağırlık)
  pick(cx, cz, fx, fz, n) {
    const c = this._cand; c.length = 0;
    const R = 3;
    const gx = Math.floor(cx / CELL), gz = Math.floor(cz / CELL);
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
      const a = this.grid.get(cellKey(gx + i, gz + j)); if (!a) continue;
      for (const s of a) {
        if (s._seen === this.t) continue; s._seen = this.t;
        const dx = s.x - cx, dz = s.z - cz;
        let d = dx * dx + dz * dz;
        if (d > 110 * 110) continue;
        if (dx * fx + dz * fz < 0) d *= 1.8; // arkadakiler daha az önemli
        s._d = d; c.push(s);
      }
    }
    c.sort((a, b) => a._d - b._d);
    if (c.length > n) c.length = n;
    return c;
  }

  update(dt, cam) {
    const g = this.game, env = g.env;
    if (!env || !cam) return;
    this.t += 1;
    const night = env.nightFactor;
    const on = night > 0.05;
    const cx = cam.x, cz = cam.z;
    const fwd = this._fwd;
    if (g.camera) { g.camera.getWorldDirection(fwd); } else fwd.set(0, 0, -1);
    // ---- noktasal lambalar ----
    this.pickT -= dt;
    if (this.pickT <= 0 && on) {
      this.pickT = 0.2;
      const want = this.pick(cx, cz, fwd.x, fwd.z, this.points.length);
      const wantSet = new Set(want);
      for (const p of this.points) { if (p.src && wantSet.has(p.src)) { wantSet.delete(p.src); p.next = p.src; } else p.next = null; }
      const rest = [...wantSet];
      for (const p of this.points) if (p.next === null && rest.length) p.next = rest.shift();
    }
    const kf = Math.min(1, dt * 5);
    const flick = 1 + (env.stormK || 0) * 0.04 * Math.sin(this.t * 1.7);
    for (const p of this.points) {
      const tgt = on && p.next && p.next === p.src ? 1 : 0;
      p.k += (tgt - p.k) * kf;
      if (p.next !== p.src && p.k < 0.04) {
        p.src = p.next; p.k = 0;
        if (p.src) { p.light.position.set(p.src.x, p.src.y - 0.25, p.src.z); p.light.color.setHex(p.src.color || 0xffc27a); p.light.distance = p.src.r || LAMP_R; }
      }
      if (!p.src) p.light.position.y = -500;
      p.light.intensity = p.src ? LAMP_I * (p.src.i || 1) * night * p.k * flick : 0;
    }
    // ---- projektör tarama açıları + ışık konileri ----
    this.updateSearch(night, cx, cz);
    // ---- spot ışıkları: farlar + projektörler ----
    this.updateSpots(dt, night, cx, cz);
  }

  updateSearch(night, cx, cz) {
    const sl = this.searchlights;
    if (!sl.length) return;
    const T = this.game.env ? (this.game.env.time * 3600 / 60) : 0; // gerçek saniye ölçeği (1 sn = 1 oyun dk)
    let near = false;
    for (const s of sl) {
      const a = s.baseA + Math.sin(T * s.speed + s.phase) * s.sweep;
      s.tx = s.x + Math.sin(a) * s.reach; s.tz = s.z + Math.cos(a) * s.reach;
      if (Math.abs(s.x - cx) + Math.abs(s.z - cz) < 420) near = true; // [dünya] uzak konileri (Levent'ten görünen) çizme
    }
    const show = night > 0.05 && near;
    this.beams.visible = show;
    if (!show) return;
    const m = this._m, q = this._q, d = this._d;
    sl.forEach((s, i) => {
      d.set(s.tx - s.x, -s.y, s.tz - s.z); const L = d.length(); d.multiplyScalar(1 / L);
      q.setFromUnitVectors(this._dn, d);
      m.compose(this._p.set(s.x, s.y, s.z), q, this._s.set(L * 0.17, L, L * 0.17));
      this.beams.setMatrixAt(i, m);
    });
    this.beams.instanceMatrix.needsUpdate = true;
  }

  updateSpots(dt, night, cx, cz) {
    const g = this.game, pv = g.player && g.player.vehicle;
    const jobs = [];
    if (night > 0.05) {
      if (pv && pv.pos && !pv.destroyed) jobs.push({ key: pv, kind: 'head', v: pv });
      // projektörler (askeri üs kuleleri), 250 m içinde, en fazla 2
      const sl = this.searchlights;
      let ns = 0;
      for (const s of sl) {
        const d = Math.hypot(s.x - cx, s.z - cz);
        s._d = d;
      }
      const near = sl.filter((s) => s._d < 260).sort((a, b) => a._d - b._d);
      for (const s of near) { if (ns >= 2 || jobs.length >= this.spots.length) break; jobs.push({ key: s, kind: 'search', s }); ns++; }
      // en yakın trafik araçlarının farları
      const vs = g.vehicles && g.vehicles.list;
      if (vs && jobs.length < this.spots.length) {
        const c = [];
        for (const v of vs) {
          if (v === pv || v.destroyed || v.parked || !v.ai || v.ai.empty) continue;
          const d = (v.pos.x - cx) ** 2 + (v.pos.z - cz) ** 2;
          if (d < 80 * 80) c.push([d, v]);
        }
        c.sort((a, b) => a[0] - b[0]);
        for (const [, v] of c) { if (jobs.length >= this.spots.length) break; jobs.push({ key: v, kind: 'head', v }); }
      }
    }
    // yuvalar: aynı anahtar aynı yuvada kalır
    const free = [];
    const keyed = new Map(jobs.map((j) => [j.key, j]));
    for (const s of this.spots) { if (s.key && keyed.has(s.key)) { s.job = keyed.get(s.key); keyed.delete(s.key); } else { s.key = null; s.job = null; free.push(s); } }
    for (const j of keyed.values()) { const s = free.shift(); if (!s) break; s.key = j.key; s.job = j; s.k = 0; }
    const kf = Math.min(1, dt * 6);
    for (const s of this.spots) {
      const l = s.light, j = s.job;
      if (!j) { s.k = 0; l.intensity = 0; l.position.y = -500; l.target.position.y = -501; continue; }
      s.k += (1 - s.k) * kf;
      if (j.kind === 'head') {
        const v = j.v, fx = Math.sin(v.heading), fz = Math.cos(v.heading);
        const L = (v.def && v.def.len) || 4.4, y = v.pos.y || 0;
        l.position.set(v.pos.x + fx * (L * 0.5 + 0.1), y + 0.85, v.pos.z + fz * (L * 0.5 + 0.1));
        l.target.position.set(v.pos.x + fx * 22, y - 0.6, v.pos.z + fz * 22);
        l.angle = 0.6; l.penumbra = 0.6; l.distance = HEAD_R; l.color.setHex(0xfff0d8);
        l.intensity = HEAD_I * night * s.k * (v === (this.game.player && this.game.player.vehicle) ? 1.3 : 1);
      } else {
        const t = j.s;
        l.position.set(t.x, t.y, t.z);
        l.target.position.set(t.tx, 0, t.tz);
        l.angle = 0.16; l.penumbra = 0.35; l.distance = SEARCH_R; l.color.setHex(0xe8f0ff);
        l.intensity = SEARCH_I * night * s.k;
      }
    }
  }
}

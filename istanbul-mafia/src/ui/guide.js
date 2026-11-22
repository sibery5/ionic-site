// [E7] Canlı görev yönlendirmesi: görev adımı + hedef mesafesi (sol üst), hedefin üstünde aşağı-yukarı sallanan 3B sarı ok
// (uzakta ekrandaki büyüklüğü sabit, binaların arkasından da görünür), hedef ekran dışındaysa ekran kenarında yön oku + mesafe,
// hareketli hedefte (kişi/araç) GPS rotası hedefi izler. Kız arkadaş, ödül avı hedefi ve suçlular da aynı sarı okla gösterilir.
// Kare içinde bellek ayırma yok: oklar havuzdan, hedef kayıtları kalıcı.
import * as THREE from 'three';
import { terrainHeight } from '../world/terrain.js';

const YELLOW = 0xffd21a, NARROWS = 5;
const H_PERSON = 2.35, H_CAR = 2.7, H_POINT = 2.0; // okun ucu hedefin tabanından bu kadar yukarıda (1,5–3 m)

function arrowGeo() {
  // aşağı bakan ok: koni baş + kare gövde; uç (0,0,0)
  const head = new THREE.ConeGeometry(0.42, 0.55, 4); head.rotateX(Math.PI); head.rotateY(Math.PI / 4); head.translate(0, 0.275, 0);
  const shaft = new THREE.BoxGeometry(0.2, 0.5, 0.2); shaft.translate(0, 0.78, 0);
  const g = new THREE.BufferGeometry();
  const a = head.toNonIndexed(), b = shaft.toNonIndexed();
  const pos = new Float32Array(a.attributes.position.count * 3 + b.attributes.position.count * 3);
  pos.set(a.attributes.position.array, 0); pos.set(b.attributes.position.array, a.attributes.position.count * 3);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export class Guide {
  constructor(game) {
    this.g = game;
    this.arrows = null;
    this.T = []; for (let i = 0; i < NARROWS; i++) this.T.push({ on: false, x: 0, y: 0, z: 0, h: H_POINT, kind: '' });
    this.main = null; // ana hedef kaydı (kenar oku + mesafe + rota)
    this._v = new THREE.Vector3();
    this._dm = -1; this._txt = null; this._kind = '';
    this.stat = { on: false, kind: '', d: 0, above: 0, route: 0, text: '', edge: false, arrows: 0 };
  }
  build() {
    const g = this.g;
    const geo = arrowGeo();
    const mat = new THREE.MeshBasicMaterial({ color: YELLOW, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, fog: false });
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0x3a2a00, transparent: true, opacity: 0.6, depthTest: false, depthWrite: false, fog: false, side: THREE.BackSide });
    this.arrows = [];
    for (let i = 0; i < NARROWS; i++) {
      const m = new THREE.Mesh(geo, mat); m.renderOrder = 998; m.frustumCulled = false; m.visible = false;
      const o = new THREE.Mesh(geo, edgeMat); o.scale.setScalar(1.12); o.position.y = -0.03; o.renderOrder = 997; o.frustumCulled = false; m.add(o); // koyu kenar: açık gökte okunur
      g.scene.add(m); this.arrows.push(m);
    }
    // sol üst takip kutusu ve ekran kenarı oku (yalnız JS ile konum; sürekli CSS animasyonu yok)
    const t = this.box = document.createElement('div');
    t.className = 'guide-box';
    t.innerHTML = '<span class="gk">GÖREV</span><div class="gt"></div><div class="gd"></div>';
    document.body.appendChild(t);
    const e = this.edge = document.createElement('div');
    e.className = 'guide-edge';
    e.innerHTML = '<div class="ga"></div><span></span>';
    document.body.appendChild(e);
  }
  setT(i, x, y, z, h, kind) { const T = this.T[i]; T.on = true; T.x = x; T.y = y; T.z = z; T.h = h; T.kind = kind; return T; }

  // ana hedef: hikâye/yan görev adımının işaretçisi → GPS noktası → iş işaretçisi → ödül avı hedefi
  pickMain() {
    const g = this.g, M = g.missions;
    const S = M.story && M.story.list;
    if (S) for (const mk of S) {
      if (mk.mmHide || mk.areaOnly) continue;
      if (mk.actor) { if (mk.actor.dead || mk.actor.passengerOf) continue; const a = mk.actor, v = a.vehicle; return this.setT(0, (v || a).pos.x, (v || a).pos.y, (v || a).pos.z, v ? H_CAR : H_PERSON, 'görev'); }
      if (mk.vehicle) { if (mk.vehicle.destroyed) continue; return this.setT(0, mk.vehicle.pos.x, mk.vehicle.pos.y, mk.vehicle.pos.z, H_CAR, 'görev'); }
      return this.setT(0, mk.x, this.groundY(mk.x, mk.z), mk.z, H_POINT, 'görev');
    }
    if (M.active && g.gpsTarget) return this.setT(0, g.gpsTarget.x, this.groundY(g.gpsTarget.x, g.gpsTarget.z), g.gpsTarget.z, H_POINT, 'görev');
    const sd = M.side && M.side.markers && M.side.markers.list;
    if (sd) for (const mk of sd) if ((mk.blink || mk.story) && !mk.mmHide && !mk.areaOnly) {
      const a = mk.actor || mk.vehicle;
      if (a && (a.dead || a.destroyed)) continue;
      return this.setT(0, a ? a.pos.x : mk.x, a ? a.pos.y : this.groundY(mk.x, mk.z), a ? a.pos.z : mk.z, mk.actor ? H_PERSON : mk.vehicle ? H_CAR : H_POINT, 'görev');
    }
    const C = g.life && g.life.career;
    if (C && C.markers && C.markers.length) for (const mk of C.markers) {
      if (mk.actor && mk.actor.dead) continue;
      const p = C.markerPos(mk);
      return this.setT(0, p.x, mk.actor || mk.vehicle ? p.y : this.groundY(p.x, p.z), p.z, mk.actor ? H_PERSON : mk.vehicle ? H_CAR : H_POINT, 'iş');
    }
    return null;
  }
  groundY(x, z) { const P = this.g.physics; return P && P.groundAt ? P.groundAt(x, z) || 0 : terrainHeight(x, z) || 0; }

  update(dt) {
    const g = this.g, p = g.player;
    if (!g.scene || !g.camera || !p) return;
    if (!this.arrows) this.build();
    for (const T of this.T) T.on = false;
    const playing = g.mode === 'playing' && !p.inInterior;
    let main = playing ? this.pickMain() : null;
    // ödül avı hedefi / suçlu: ana hedef yoksa o ana hedeftir, varsa ayrı ok
    const B = g.social && g.social.bounties, L = B && B.live;
    if (playing && L && L.target && !L.target.dead) {
      const a = L.target, v = a.vehicle || a;
      if (!main) main = this.setT(0, v.pos.x, v.pos.y, v.pos.z, a.vehicle ? H_CAR : H_PERSON, 'ödül avı');
      else this.setT(1, v.pos.x, v.pos.y, v.pos.z, a.vehicle ? H_CAR : H_PERSON, 'ödül avı');
    }
    // kız arkadaş(lar): tanışılmış, yanında değil; buluşma ayarlandıysa her mesafede, değilse 220 m içinde
    const R = g.social && g.social.romance;
    if (playing && R && R.npcs) {
      let k = 2;
      for (const id in R.npcs) {
        if (k >= NARROWS) break;
        const n = R.npcs[id];
        if (!n || n.dead || R.with === id) continue;
        const r = R.rel(id);
        if (!r || r.dead || !r.met) continue;
        const d = Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z);
        if (d < 3.5 || (d > 220 && R.meet !== id)) continue;
        const v = n.vehicle || n;
        this.setT(k++, v.pos.x, v.pos.y, v.pos.z, n.vehicle ? H_CAR : H_PERSON, 'sevgili');
      }
    }
    this.main = main;
    // hareketli hedefte GPS rotası hedefi izler (rota g.updateGps ile 1,5 sn'de bir yeniden hesaplanır)
    if (main && main.kind !== 'iş') {
      const G = g.gpsTarget;
      if (!G) { if (!g.waypoint) { g.setGps(main.x, main.z); this._own = true; } }
      else if (!g.waypoint && Math.hypot(G.x - main.x, G.z - main.z) > 4) { G.x = main.x; G.z = main.z; }
    }
    // yönlendirmenin kendi açtığı rota hedef kalkınca kapanır (ödül avı bitti, sevgili yanında)
    if ((!main || main.kind === 'iş') && this._own) { this._own = false; if (!g.waypoint && !g.missions.active) g.setGps(null); }
    // 3B oklar
    const cam = g.camera.position, now = performance.now() * 0.001;
    let n = 0;
    for (let i = 0; i < NARROWS; i++) {
      const T = this.T[i], A = this.arrows[i];
      const pd = T.on ? Math.hypot(T.x - p.pos.x, T.z - p.pos.z) : 0;
      if (!T.on || (pd < 2.2 && T.kind !== 'sevgili')) { A.visible = false; continue; }
      n++;
      const dc = Math.hypot(T.x - cam.x, T.y + T.h - cam.y, T.z - cam.z);
      const s = Math.min(14, Math.max(1, dc / 16)); // uzakta ekrandaki büyüklük sabit
      A.visible = true;
      A.scale.setScalar(s);
      A.position.set(T.x, T.y + T.h + 0.18 * Math.sin(now * 3.2 + i), T.z); // aşağı-yukarı sallanır
      A.rotation.y = now * 1.4;
    }
    this.updateHud(main);
    const S = this.stat;
    S.on = !!main; S.kind = main ? main.kind : ''; S.arrows = n;
    S.d = main ? Math.hypot(main.x - p.pos.x, main.z - p.pos.z) : 0;
    S.above = main ? this.arrows[0].position.y - main.y : 0;
    S.route = g.gpsPath ? g.gpsPath.length : 0;
  }

  updateHud(main) {
    const g = this.g, p = g.player, box = this.box, e = this.edge;
    const txt = main ? this.stepText(main) : '';
    if (!main || !txt) { if (box.style.display !== 'none') box.style.display = 'none'; if (e.style.display !== 'none') e.style.display = 'none'; this.stat.text = ''; this.stat.edge = false; return; }
    if (box.style.display !== 'block') box.style.display = 'block';
    if (txt !== this._txt) { this._txt = txt; box.children[1].textContent = txt; this.stat.text = txt; }
    if (main.kind !== this._kind) { this._kind = main.kind; box.children[0].textContent = main.kind.toLocaleUpperCase('tr'); }
    const d = Math.hypot(main.x - p.pos.x, main.z - p.pos.z);
    const dm = d < 1000 ? Math.round(d / (d < 100 ? 1 : 5)) * (d < 100 ? 1 : 5) : Math.round(d / 100) * 100;
    if (dm !== this._dm) { this._dm = dm; box.children[2].textContent = dm < 1000 ? `${dm} m` : `${(dm / 1000).toFixed(1)} km`; e.lastChild.textContent = box.children[2].textContent; }
    // ekran kenarı oku: hedef görüş dışındaysa kenarda yön + mesafe
    const v = this._v.set(main.x, main.y + main.h, main.z).project(g.camera);
    const behind = v.z > 1;
    let x = v.x, y = v.y;
    const inView = !behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.88;
    this.stat.edge = !inView;
    if (inView) { if (e.style.display !== 'none') e.style.display = 'none'; return; }
    if (behind) { x = -x; y = -y; if (Math.abs(y) < 0.2) y = -0.6; }
    const k = Math.max(Math.abs(x) / 0.88, Math.abs(y) / 0.8, 1e-3);
    x /= k; y /= k;
    const W = innerWidth, Hh = innerHeight;
    const ang = Math.atan2(x * W, y * Hh) * 180 / Math.PI;
    if (e.style.display !== 'block') e.style.display = 'block';
    e.style.transform = `translate(${((x * 0.5 + 0.5) * W - 32) | 0}px,${((-y * 0.5 + 0.5) * Hh - 22) | 0}px)`;
    e.firstChild.style.transform = `rotate(${ang | 0}deg)`;
  }
  // kısa adım yazısı: görev hedefi metninden (HTML etiketleri ve ek bilgi atılır)
  stepText(main) {
    const g = this.g, U = g.ui;
    let t = '';
    if (main.kind === 'görev') t = (U && U._obj && U._obj.mission) || (g.missions.objText || '');
    else if (main.kind === 'iş') t = (U && U._obj && U._obj.job) || '';
    else if (main.kind === 'ödül avı') { const B = g.social.bounties; t = B.live && B.live.target ? `Aranan: ${B.live.target.name || 'suçlu'}` : 'Aranan suçluyu bul'; }
    if (t === this._raw) return this._clean;
    this._raw = t;
    let c = t.replace(/<small>.*?<\/small>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!c && main.kind === 'görev') c = 'Hedefe git';
    if (c.length > 46) c = c.slice(0, 45) + '…';
    this._clean = c;
    return c;
  }
}

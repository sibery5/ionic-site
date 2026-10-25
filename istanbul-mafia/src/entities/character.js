// Prosedürel insan modeli: vücut, yüz, saç, kıyafet katmanları ve animasyon.
import * as THREE from 'three';
import { faceTexture } from '../core/textures.js';
import { buildWeaponModel } from '../game/weapons.js';

const geoCache = {};
function G(key, fn) { if (!geoCache[key]) geoCache[key] = fn(); return geoCache[key]; }
const matCache = new Map();
function mat(color, rough = 0.7, metal = 0, extra = '') {
  const k = color + '|' + rough + '|' + metal + extra;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  return matCache.get(k);
}

export const SKIN_TONES = ['#f1d0b5', '#e0b493', '#c99572', '#a8754f', '#7d5236', '#5a3a26'];
export const HAIR_COLORS = ['#1a1410', '#3b2a1e', '#6b4a2e', '#a07040', '#d8b070', '#8a8a8a', '#5a1a10'];
export const HAIR_STYLES = ['kisa', 'arkaya', 'kel', 'uzun', 'kivircik', 'at_kuyrugu'];
export const BEARDS = ['none', 'stubble', 'mustache', 'full'];

export function defaultLook(gender = 'm') {
  return {
    gender, skin: SKIN_TONES[1], hair: gender === 'f' ? 'uzun' : 'kisa', hairColor: HAIR_COLORS[0], beard: gender === 'f' ? 'none' : 'stubble',
    top: 'leather', topColor: '#1c1c1c', shirtColor: '#e8e8e8', pants: 'jeans', pantsColor: '#2a3550', shoes: 'sneaker', shoesColor: '#eeeeee',
    hat: 'none', hatColor: '#222222', glasses: false, chain: false, tespih: false, build: 1.0,
  };
}

export function randomLook(r, kind = 'civilian') {
  const gender = r.chance(kind === 'civilian' ? 0.45 : 0.08) ? 'f' : 'm';
  const L = defaultLook(gender);
  L.skin = r.pick(SKIN_TONES.slice(0, 5));
  L.hairColor = r.pick(HAIR_COLORS);
  L.hair = gender === 'f' ? r.pick(['uzun', 'at_kuyrugu', 'kivircik', 'kisa']) : r.pick(['kisa', 'arkaya', 'kel', 'kivircik', 'kisa']);
  L.beard = gender === 'f' ? 'none' : r.pick(BEARDS);
  L.top = r.pick(['tshirt', 'shirt', 'jacket', 'coat', 'track', 'tshirt']);
  L.topColor = r.pick(['#8a1a1a', '#1d3d6e', '#2d5a2d', '#444444', '#c9b48a', '#e0e0e0', '#5a2d5a', '#b05a1a', '#1a1a1a', '#6e8a9e']);
  L.shirtColor = r.pick(['#ffffff', '#d8d8e8', '#e8d8c8', '#a8c8e8']);
  L.pants = r.pick(['jeans', 'slacks', 'jeans', 'track']);
  L.pantsColor = r.pick(['#2a3550', '#1a1a1a', '#5a4a3a', '#3a3a3a', '#6a6a5a']);
  L.shoesColor = r.pick(['#1a1a1a', '#3a2412', '#eeeeee']);
  L.hat = r.chance(0.15) ? r.pick(['kasket', 'bere']) : 'none';
  L.hatColor = r.pick(['#2a2a2a', '#5a4a3a', '#8a1a1a']);
  L.glasses = r.chance(0.1);
  L.build = r.float(0.92, 1.1);
  if (kind === 'police') {
    Object.assign(L, { top: 'police', topColor: '#1d2f5a', shirtColor: '#a8c0e0', pants: 'slacks', pantsColor: '#1a2440', shoesColor: '#111111', hat: 'police', hatColor: '#1a2440', glasses: r.chance(0.3) });
  } else if (kind === 'gang') {
    Object.assign(L, { top: r.pick(['leather', 'track', 'suit']), pants: r.pick(['jeans', 'slacks', 'track']), glasses: r.chance(0.5), chain: r.chance(0.5), beard: r.pick(['stubble', 'full', 'mustache']) });
  } else if (kind === 'boss') {
    Object.assign(L, { top: 'suit', topColor: '#111111', shirtColor: '#f0f0f0', pants: 'slacks', pantsColor: '#111111', shoesColor: '#0a0a0a', hat: 'fedora', hatColor: '#151515', glasses: true, chain: true, tespih: true, beard: 'full', hairColor: '#8a8a8a', build: 1.12 });
  }
  return L;
}

export class CharacterModel {
  constructor(look) {
    this.root = new THREE.Group();
    this.look = { ...look };
    this.phase = Math.random() * 10;
    this.weaponMesh = null;
    this.weaponId = null;
    this.deadT = 0;
    this.punchT = 0;
    this.build();
  }

  build() {
    // önceki parçaları temizle
    while (this.root.children.length) this.root.remove(this.root.children[0]);
    const L = this.look;
    const f = L.gender === 'f';
    const sc = L.build || 1;
    const skin = mat(L.skin, 0.6);
    const top = mat(L.topColor, L.top === 'leather' ? 0.35 : 0.8, L.top === 'leather' ? 0.1 : 0);
    const shirt = mat(L.shirtColor, 0.8);
    const pants = mat(L.pantsColor, 0.85);
    const shoes = mat(L.shoesColor, L.shoes === 'polished' ? 0.2 : 0.6, L.shoes === 'polished' ? 0.3 : 0);
    const hair = mat(L.hairColor, 0.9);

    const hips = new THREE.Group(); hips.position.y = 0.98; this.root.add(hips); this.hips = hips;
    const pelvis = new THREE.Mesh(G('pelvis' + f, () => new THREE.BoxGeometry(f ? 0.34 : 0.36, 0.2, 0.22)), pants);
    hips.add(pelvis);
    const spine = new THREE.Group(); spine.position.y = 0.08; hips.add(spine); this.spine = spine;
    const shoulderW = f ? 0.36 : 0.44 * sc;
    // gövde
    const torsoGeo = G('torso' + f + sc.toFixed(2), () => {
      const g = new THREE.CylinderGeometry(shoulderW / 2, (f ? 0.32 : 0.36) / 2, 0.55, 12);
      g.scale(1, 1, 0.55); g.translate(0, 0.3, 0); return g;
    });
    const torso = new THREE.Mesh(torsoGeo, L.top === 'tshirt' || L.top === 'police' ? top : shirt);
    spine.add(torso);
    // ceket katmanı
    if (['jacket', 'leather', 'suit', 'coat', 'track', 'police'].includes(L.top)) {
      const long = L.top === 'coat';
      const jg = G('jacket' + f + sc.toFixed(2) + long, () => {
        const g = new THREE.CylinderGeometry(shoulderW / 2 + 0.025, (f ? 0.33 : 0.37) / 2 + 0.03, long ? 0.95 : 0.6, 12, 1, true, 0.35, Math.PI * 2 - 0.7);
        g.scale(1, 1, 0.6); g.translate(0, long ? 0.1 : 0.28, 0); return g;
      });
      const jm = new THREE.Mesh(jg, new THREE.MeshStandardMaterial({ color: L.topColor, roughness: L.top === 'leather' ? 0.35 : 0.8, side: THREE.DoubleSide }));
      spine.add(jm);
      if (L.top === 'track') {
        // eşofman şeritleri
        for (const sx of [-1, 1]) {
          const s = new THREE.Mesh(G('stripe', () => new THREE.BoxGeometry(0.02, 0.56, 0.02)), mat('#ffffff'));
          s.position.set(sx * 0.06, 0.29, 0.13); spine.add(s);
        }
      }
      if (L.top === 'suit') {
        const tie = new THREE.Mesh(G('tie', () => new THREE.BoxGeometry(0.05, 0.32, 0.02)), mat('#8a0f0f', 0.5));
        tie.position.set(0, 0.36, 0.125); spine.add(tie);
      }
      if (L.top === 'police') {
        const badge = new THREE.Mesh(G('badge', () => new THREE.BoxGeometry(0.06, 0.07, 0.02)), mat('#d4af37', 0.3, 0.8));
        badge.position.set(0.1, 0.42, 0.13); spine.add(badge);
        const vest = new THREE.Mesh(G('vestText', () => new THREE.BoxGeometry(0.3, 0.06, 0.02)), mat('#e8e8e8'));
        vest.position.set(0, 0.3, -0.13); spine.add(vest);
      }
    }
    if (L.chain) {
      const ch = new THREE.Mesh(G('chain', () => new THREE.TorusGeometry(0.09, 0.012, 6, 16)), mat('#d4af37', 0.25, 1));
      ch.rotation.x = Math.PI / 2.4; ch.position.set(0, 0.52, 0.06); spine.add(ch);
    }
    // boyun ve kafa
    const neck = new THREE.Mesh(G('neck', () => new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8)), skin);
    neck.position.y = 0.62; spine.add(neck);
    const head = new THREE.Group(); head.position.y = 0.78; spine.add(head); this.head = head;
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture(L.skin, L.gender, L.beard, L.hairColor), roughness: 0.6 });
    const skull = new THREE.Mesh(G('skull', () => { const g = new THREE.SphereGeometry(0.12, 20, 14); g.scale(0.92, 1.1, 1); return g; }), faceMat);
    head.add(skull);
    // kulaklar ve burun
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(G('ear', () => { const g = new THREE.SphereGeometry(0.025, 6, 6); g.scale(0.5, 1, 0.8); return g; }), skin);
      ear.position.set(sx * 0.11, 0, 0); head.add(ear);
    }
    const nose = new THREE.Mesh(G('nose', () => new THREE.ConeGeometry(0.018, 0.05, 6)), skin);
    nose.rotation.x = Math.PI / 2; nose.position.set(0, -0.005, 0.125); head.add(nose);
    this.buildHair(head, hair, L);
    if (L.glasses) {
      const gm = mat('#0a0a0a', 0.1, 0.5);
      for (const sx of [-1, 1]) {
        const lens = new THREE.Mesh(G('lens', () => new THREE.BoxGeometry(0.06, 0.035, 0.01)), gm);
        lens.position.set(sx * 0.042, 0.02, 0.118); head.add(lens);
      }
      const br = new THREE.Mesh(G('bridge', () => new THREE.BoxGeometry(0.2, 0.01, 0.01)), gm); br.position.set(0, 0.03, 0.118); head.add(br);
    }
    // kollar
    const armMat = L.top === 'tshirt' ? skin : (['jacket', 'leather', 'suit', 'coat', 'track', 'police'].includes(L.top) ? mat(L.topColor, L.top === 'leather' ? 0.35 : 0.8) : shirt);
    const upperArmMat = L.top === 'tshirt' ? top : armMat;
    this.arms = [];
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(sx * (shoulderW / 2 + 0.02), 0.52, 0); spine.add(sh);
      const ua = new THREE.Mesh(G('uarm', () => { const g = new THREE.CapsuleGeometry(0.048, 0.22, 4, 8); g.translate(0, -0.14, 0); return g; }), upperArmMat);
      sh.add(ua);
      const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
      const fa = new THREE.Mesh(G('farm', () => { const g = new THREE.CapsuleGeometry(0.042, 0.2, 4, 8); g.translate(0, -0.13, 0); return g; }), armMat);
      el.add(fa);
      const hand = new THREE.Mesh(G('hand', () => { const g = new THREE.BoxGeometry(0.07, 0.1, 0.04); g.translate(0, -0.3, 0); return g; }), skin);
      el.add(hand);
      const socket = new THREE.Group(); socket.position.set(0, -0.3, 0.02); el.add(socket);
      this.arms.push({ sh, el, socket });
    }
    if (L.tespih) {
      const t = new THREE.Mesh(G('tespih', () => new THREE.TorusGeometry(0.05, 0.01, 5, 14)), mat('#5a1a10', 0.3));
      t.position.set(0, -0.06, 0); this.arms[0].socket.add(t);
    }
    // bacaklar
    this.legs = [];
    const isShort = L.pants === 'shorts';
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(sx * 0.09, -0.06, 0); hips.add(hip);
      const th = new THREE.Mesh(G('thigh', () => { const g = new THREE.CapsuleGeometry(0.068, 0.3, 4, 8); g.translate(0, -0.21, 0); return g; }), pants);
      hip.add(th);
      const kn = new THREE.Group(); kn.position.y = -0.43; hip.add(kn);
      const sh = new THREE.Mesh(G('shin', () => { const g = new THREE.CapsuleGeometry(0.055, 0.3, 4, 8); g.translate(0, -0.2, 0); return g; }), isShort ? skin : pants);
      kn.add(sh);
      const foot = new THREE.Mesh(G('foot', () => { const g = new THREE.BoxGeometry(0.1, 0.08, 0.24); g.translate(0, -0.42, 0.05); return g; }), shoes);
      kn.add(foot);
      this.legs.push({ hip, kn });
    }
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    if (this.weaponId) { const w = this.weaponId; this.weaponId = null; this.setWeapon(w); }
  }

  buildHair(head, hair, L) {
    const hs = L.hair;
    if (hs === 'kel') return;
    const cap = new THREE.Mesh(G('hairCap' + hs, () => {
      const g = new THREE.SphereGeometry(0.128, 18, 10, 0, Math.PI * 2, 0, hs === 'kivircik' ? Math.PI * 0.55 : Math.PI * 0.5);
      g.scale(0.95, 1.1, 1.05); if (hs === 'arkaya') g.translate(0, 0.01, -0.01);
      return g;
    }), hair);
    cap.position.y = 0.012;
    cap.rotation.x = -0.25;
    head.add(cap);
    if (hs === 'kivircik') { cap.scale.set(1.12, 1.15, 1.12); }
    if (hs === 'uzun') {
      const back = new THREE.Mesh(G('hairLong', () => { const g = new THREE.BoxGeometry(0.24, 0.32, 0.08); g.translate(0, -0.12, -0.08); return g; }), hair);
      head.add(back);
    }
    if (hs === 'at_kuyrugu') {
      const tail = new THREE.Mesh(G('hairTail', () => { const g = new THREE.CapsuleGeometry(0.035, 0.18, 4, 6); g.translate(0, -0.1, -0.14); return g; }), hair);
      tail.rotation.x = 0.3; head.add(tail);
    }
    // şapkalar
    const hm = mat(L.hatColor, 0.8);
    if (L.hat === 'kasket') {
      const h = new THREE.Mesh(G('kasket', () => { const g = new THREE.CylinderGeometry(0.135, 0.135, 0.06, 16); g.translate(0, 0.1, 0); return g; }), hm);
      const v = new THREE.Mesh(G('visor', () => { const g = new THREE.BoxGeometry(0.2, 0.015, 0.09); g.translate(0, 0.08, 0.15); return g; }), hm);
      head.add(h); head.add(v);
    } else if (L.hat === 'fedora') {
      const brim = new THREE.Mesh(G('fbrim', () => { const g = new THREE.CylinderGeometry(0.22, 0.22, 0.015, 20); g.translate(0, 0.1, 0); return g; }), hm);
      const crown = new THREE.Mesh(G('fcrown', () => { const g = new THREE.CylinderGeometry(0.11, 0.13, 0.13, 16); g.translate(0, 0.17, 0); return g; }), hm);
      const band = new THREE.Mesh(G('fband', () => { const g = new THREE.CylinderGeometry(0.131, 0.131, 0.03, 16); g.translate(0, 0.12, 0); return g; }), mat('#5a1010'));
      head.add(brim); head.add(crown); head.add(band);
    } else if (L.hat === 'bere') {
      const b = new THREE.Mesh(G('bere', () => { const g = new THREE.SphereGeometry(0.135, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55); g.translate(0, 0.025, 0); return g; }), hm);
      head.add(b);
    } else if (L.hat === 'police') {
      const p = new THREE.Mesh(G('pcap', () => { const g = new THREE.CylinderGeometry(0.15, 0.13, 0.08, 16); g.translate(0, 0.12, 0); return g; }), hm);
      const v = new THREE.Mesh(G('pvisor', () => { const g = new THREE.BoxGeometry(0.2, 0.012, 0.08); g.translate(0, 0.085, 0.14); return g; }), mat('#0a0a0a', 0.2));
      const bd = new THREE.Mesh(G('pbadge', () => { const g = new THREE.BoxGeometry(0.04, 0.03, 0.01); g.translate(0, 0.13, 0.15); return g; }), mat('#d4af37', 0.3, 0.8));
      head.add(p); head.add(v); head.add(bd);
    }
  }

  setLook(look) { this.look = { ...look }; this.build(); }

  setWeapon(id) {
    if (this.weaponId === id) return;
    if (this.weaponMesh) { this.weaponMesh.parent && this.weaponMesh.parent.remove(this.weaponMesh); this.weaponMesh = null; }
    this.weaponId = id;
    if (!id || id === 'fists') return;
    const w = buildWeaponModel(id);
    if (!w) return;
    w.rotation.x = Math.PI / 2;
    this.arms[1].socket.add(w);
    this.weaponMesh = w;
  }

  muzzleWorld(out) {
    if (this.weaponMesh && this.weaponMesh.userData.muzzle) return this.weaponMesh.userData.muzzle.getWorldPosition(out);
    this.arms[1].socket.getWorldPosition(out);
    return out;
  }

  // st: {speed, aim, twoHanded, melee, dead, swim, sit, crouch, recoil}
  animate(dt, st) {
    const [la, ra] = this.arms;
    const [ll, rl] = this.legs;
    if (st.dead) {
      this.deadT = Math.min(1, this.deadT + dt * 2.5);
      const e = 1 - (1 - this.deadT) * (1 - this.deadT);
      this.hips.rotation.x = -e * Math.PI / 2;
      this.hips.position.y = 0.98 - e * 0.8;
      la.sh.rotation.set(-e * 2.6, 0, -e * 0.6); ra.sh.rotation.set(-e * 2.4, 0, e * 0.5);
      ll.hip.rotation.x = e * 0.2; rl.hip.rotation.x = -e * 0.1;
      ll.kn.rotation.x = rl.kn.rotation.x = 0;
      return;
    }
    this.deadT = 0;
    this.hips.rotation.set(0, 0, 0);
    if (st.sit) {
      this.hips.position.y = 0.5;
      ll.hip.rotation.x = rl.hip.rotation.x = -Math.PI / 2;
      ll.kn.rotation.x = rl.kn.rotation.x = Math.PI / 2;
      la.sh.rotation.set(-0.6, 0, 0); ra.sh.rotation.set(-0.6, 0, 0);
      la.el.rotation.x = ra.el.rotation.x = -0.6;
      this.spine.rotation.set(0, 0, 0);
      return;
    }
    if (st.swim) {
      this.phase += dt * 4;
      this.hips.position.y = 0.2;
      this.hips.rotation.x = -1.2;
      la.sh.rotation.set(-Math.PI + Math.sin(this.phase) * 1.2, 0, 0);
      ra.sh.rotation.set(-Math.PI - Math.sin(this.phase) * 1.2, 0, 0);
      ll.hip.rotation.x = Math.sin(this.phase * 2) * 0.4; rl.hip.rotation.x = -Math.sin(this.phase * 2) * 0.4;
      return;
    }
    const sp = st.speed || 0;
    const running = sp > 4;
    this.phase += dt * (running ? 2.0 : 2.6) * Math.min(sp, 8) * 0.9;
    const amp = Math.min(1, sp / 3) * (running ? 0.9 : 0.55);
    const s = Math.sin(this.phase);
    this.hips.position.y = 0.98 + Math.abs(Math.cos(this.phase)) * 0.04 * amp - (st.crouch ? 0.3 : 0);
    ll.hip.rotation.x = s * amp; rl.hip.rotation.x = -s * amp;
    ll.kn.rotation.x = Math.max(0, -s) * amp * 1.4 + (st.crouch ? 0.8 : 0);
    rl.kn.rotation.x = Math.max(0, s) * amp * 1.4 + (st.crouch ? 0.8 : 0);
    if (st.crouch) { ll.hip.rotation.x -= 0.6; rl.hip.rotation.x -= 0.6; }
    this.spine.rotation.x = running ? 0.12 : 0.02;
    this.spine.rotation.y = 0;
    // kollar
    la.sh.rotation.set(-s * amp * 0.8, 0, -0.08);
    ra.sh.rotation.set(s * amp * 0.8, 0, 0.08);
    la.el.rotation.x = -0.25 - amp * 0.4; ra.el.rotation.x = -0.25 - amp * 0.4;
    if (st.aim) {
      const pitch = st.aimPitch || 0;
      const rec = st.recoil || 0;
      ra.sh.rotation.set(-Math.PI / 2 - pitch - rec * 0.3, 0, 0.05);
      ra.el.rotation.x = 0;
      if (st.twoHanded) {
        la.sh.rotation.set(-Math.PI / 2 - pitch - 0.1, 0.0, 0.75);
        la.el.rotation.x = -0.35;
        this.spine.rotation.y = 0.25;
      }
    } else if (st.weapon && st.weapon !== 'fists') {
      ra.sh.rotation.x = -0.3; ra.el.rotation.x = -0.6;
    }
    if (this.punchT > 0) {
      this.punchT -= dt;
      const p = Math.sin(Math.max(0, this.punchT) / 0.3 * Math.PI);
      ra.sh.rotation.x = -Math.PI / 2 * p - 0.2; ra.el.rotation.x = -0.4 * (1 - p);
      this.spine.rotation.y = -0.4 * p;
    }
    if (st.hands_up) {
      la.sh.rotation.set(-Math.PI + 0.2, 0, 0); ra.sh.rotation.set(-Math.PI + 0.2, 0, 0);
      la.el.rotation.x = ra.el.rotation.x = -0.4;
    }
    if (st.talk) {
      this.head.rotation.y = Math.sin(performance.now() * 0.002) * 0.3;
      ra.sh.rotation.x = -0.5 + Math.sin(performance.now() * 0.004) * 0.3; ra.el.rotation.x = -1.0;
    } else this.head.rotation.y = 0;
  }
  punch() { this.punchT = 0.3; }
}

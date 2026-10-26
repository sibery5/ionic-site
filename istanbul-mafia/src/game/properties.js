// Mülkler: daire, müstakil ev, Boğaz yalısı, penthouse. Her biri kayıt noktası + garaj olan güvenli evdir.
// Şehirdeki bir apartman binası mülke atanır; satın alınınca binanın tipi çalışma anında 'safehouse'
// olur (iç mekânda yatak/gardırop/silah dolabı gelir) ve haritada kendi ikonuyla görünür.
import * as THREE from 'three';
import { PROPERTIES, PROPERTY_KINDS, ensureLifeState, garageCapacity } from './economy.js';
import { DISTRICTS, isWater } from '../world/map.js';
import { formatMoney } from '../core/util.js';
import { makeCanvas } from '../core/textures.js';

export class Properties {
  constructor(game) {
    this.game = game;
    this.bmap = null; // mülk kimliği -> bina
    this._sig = '';
  }

  // her mülk için bina seçimi (deterministik: aynı harita = aynı bina)
  resolve() {
    if (this.bmap) return this.bmap;
    const map = this.game.map;
    this.bmap = {};
    const used = new Set();
    for (const pr of PROPERTIES) {
      const d = DISTRICTS.find((x) => x.id === pr.district);
      let best = null, bd = 1e18;
      for (const b of map.buildings) {
        if (b.type !== 'apartment' || used.has(b.id)) continue;
        if (d && b.district && b.district.id !== d.id) continue;
        if (!!pr.tower !== !!b.tower) continue;
        let dd = (b.door.x - pr.at[0]) ** 2 + (b.door.z - pr.at[1]) ** 2;
        // yalı: kapısı suya yakın binalar tercih edilir
        if (pr.kind === 'yali') {
          let near = false;
          for (const [ox, oz] of [[25, 0], [-25, 0], [0, 25], [0, -25], [45, 0], [-45, 0]]) if (isWater(b.door.x + ox, b.door.z + oz)) { near = true; break; }
          if (!near) dd += 1e8;
        }
        if (dd < bd) { bd = dd; best = b; }
      }
      if (best) { used.add(best.id); this.bmap[pr.id] = best; }
    }
    return this.bmap;
  }

  building(id) { return this.resolve()[id]; }
  owned(id) { const s = this.game.state; return !!(s && s.properties && s.properties.includes(id)); }

  // sahiplik durumunu bina tiplerine yansıt (yeni oyun / kayıt yükleme sonrasında da çalışır)
  sync(force) {
    const g = this.game, s = g.state;
    if (!s || !g.map) return;
    ensureLifeState(s);
    const sig = s.properties.join(',');
    if (!force && sig === this._sig && this._state === s) return;
    this._sig = sig;
    this._state = s;
    const bm = this.resolve();
    for (const pr of PROPERTIES) {
      const b = bm[pr.id];
      if (!b) continue;
      const own = s.properties.includes(pr.id);
      if (own && !b.ownedProp) {
        b._propOrig = { type: b.type, name: b.name };
        b.type = 'safehouse'; b.name = pr.name; b.ownedProp = pr.id;
        if (!g.map.specials.includes(b)) g.map.specials.push(b);
      } else if (!own && b.ownedProp) {
        b.type = b._propOrig.type; b.name = b._propOrig.name; b.ownedProp = null;
        const i = g.map.specials.indexOf(b); if (i >= 0) g.map.specials.splice(i, 1);
      }
    }
  }

  buy(id, method = 'cash') {
    const g = this.game, s = ensureLifeState(g.state);
    const pr = PROPERTIES.find((p) => p.id === id);
    if (!pr || s.properties.includes(id)) return false;
    const key = method === 'bank' ? 'bank' : 'money';
    if (s[key] < pr.price) { g.audio.error(); g.ui.notify(method === 'bank' ? 'Banka bakiyesi yetersiz!' : 'Nakit yetersiz!', 'warn'); return false; }
    s[key] -= pr.price;
    s.properties.push(id);
    s.respect += Math.round(10 + pr.price / 40000);
    s.legalRep += Math.round(10 + pr.price / 60000);
    this.sync(true);
    g.audio.success();
    g.ui.bigMessage('TAPU SENİN', `${pr.name} · Garaj kapasitesi ${garageCapacity(s)} araç`, 'gold', 3.5);
    return true;
  }

  sell(id) {
    const g = this.game, s = g.state;
    const pr = PROPERTIES.find((p) => p.id === id);
    if (!pr || !s.properties.includes(id)) return false;
    if (g.player.inInterior && g.player.inInterior.building.ownedProp === id) { g.ui.notify('Önce evden çık.', 'warn'); return false; }
    const val = Math.round(pr.price * 0.75);
    s.properties.splice(s.properties.indexOf(id), 1);
    s.bank += val;
    this.sync(true);
    g.audio.cash();
    g.ui.notify(`${pr.name} satıldı · ${formatMoney(val)} hesabına geçti`, 'money');
    return true;
  }

  gps(id) {
    const b = this.building(id);
    if (!b) return;
    this.game.setWaypoint(b.door.x, b.door.z + b.door.nz * 2);
    this.game.ui.notify(`Rota çizildi: ${PROPERTIES.find((p) => p.id === id).name}`, 'info');
  }

  // sahip olunan mülke girince: türüne göre dekor + garaj / iskele etkileşimleri
  decorate(ctx) {
    const g = this.game, I = g.interiors;
    const id = ctx.building.ownedProp;
    const pr = PROPERTIES.find((p) => p.id === id);
    if (!pr) return;
    ctx.name = pr.name;
    const w = ctx.w || 12, d = ctx.d || 10, h = ctx.h || 3.2;
    // manzara penceresi (arka duvar)
    const view = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.55, h * 0.55), new THREE.MeshBasicMaterial({ map: viewTexture(pr.kind, g.env.nightFactor) }));
    view.position.set(-w * 0.12, h * 0.55, -d / 2 + 0.02); ctx.scene.add(view);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55 + 0.16, h * 0.55 + 0.16, 0.04), new THREE.MeshStandardMaterial({ color: 0x2a1a0a }));
    frame.position.set(view.position.x, view.position.y, -d / 2 + 0.005); ctx.scene.add(frame);
    if (pr.kind === 'yali' || pr.kind === 'penthouse') {
      I.chandelier(ctx, -2, 0, h, 0.7);
      I.carpet(ctx, 3.2, 2.2, 1.5, 2.5, 2);
    }
    I.sign(ctx, pr.name.toUpperCase(), 0, h - 0.45, -d / 2 + 0.03, 0, '#1a120a', '#d4af37', 3.2);
    // garaj: araç çağır
    ctx.interact.push({ x: 2.2, z: d / 2 - 0.9, r: 1.2, label: `Garaj (${(g.state.ownedCars || []).length}/${garageCapacity(g.state)}) · aracını kapıya getir`, action: () => g.ui.openGarage && g.ui.openGarage() });
    if (pr.dock || pr.helipad) {
      ctx.interact.push({ x: -2.2, z: d / 2 - 0.9, r: 1.2, label: pr.dock ? 'İskele: teknelerini yönet' : 'Helipad: hava araçlarını yönet', action: () => g.ui.openInventory && g.ui.openInventory('luxury') });
    }
  }

  list() { return PROPERTIES.map((p) => ({ ...p, kindName: PROPERTY_KINDS[p.kind].name, owned: this.owned(p.id), building: this.building(p.id) })); }
}

// prosedürel manzara: Boğaz, şehir ışıkları veya mahalle
const viewCache = {};
function viewTexture(kind, night) {
  const key = kind + (night > 0.5 ? 'n' : 'd');
  if (viewCache[key]) return viewCache[key];
  const c = makeCanvas(512, 256), x = c.getContext('2d');
  const n = night > 0.5;
  const sky = x.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, n ? '#0a1020' : '#6aa8e0'); sky.addColorStop(1, n ? '#2a1a30' : '#f0d8b0');
  x.fillStyle = sky; x.fillRect(0, 0, 512, 256);
  if (kind === 'yali' || kind === 'daire') {
    x.fillStyle = n ? '#0a1a2a' : '#2a5a8a'; x.fillRect(0, 160, 512, 96);
    x.fillStyle = n ? '#1a1a22' : '#5a6a5a';
    for (let i = 0; i < 512; i += 18) x.fillRect(i, 140 - ((i * 37) % 30), 16, 22 + ((i * 37) % 30));
    // köprü
    x.strokeStyle = n ? '#e8c870' : '#d8d8d8'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(40, 150); x.quadraticCurveTo(256, 110, 470, 150); x.stroke();
    x.fillRect(150, 110, 6, 50); x.fillRect(360, 110, 6, 50);
  } else {
    for (let i = 0; i < 40; i++) {
      const bw = 10 + (i * 13) % 26, bh = 60 + (i * 53) % 150;
      const bx = (i * 47) % 512;
      x.fillStyle = n ? '#14141c' : '#7a8290'; x.fillRect(bx, 256 - bh, bw, bh);
      if (n) { x.fillStyle = '#ffd890'; for (let k = 0; k < bh / 9; k++) if ((i + k) % 3) x.fillRect(bx + 3, 256 - bh + 4 + k * 9, 3, 3); }
    }
  }
  if (n) { x.fillStyle = '#fff8e0'; for (let i = 0; i < 40; i++) x.fillRect((i * 97) % 512, (i * 31) % 100, 1.5, 1.5); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  viewCache[key] = t;
  return t;
}

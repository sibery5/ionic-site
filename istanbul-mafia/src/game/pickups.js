// Yerden toplanan eşyalar: para, silah, can, zırh ve gizli "Altın Lale" koleksiyonu.
import * as THREE from 'three';
import { buildWeaponModel, WEAPONS } from './weapons.js';
import { formatMoney } from '../core/util.js';
import { audio } from '../core/audio.js';
import { isLand } from '../world/map.js';

const moneyGeo = new THREE.BoxGeometry(0.32, 0.12, 0.18);
const moneyMat = new THREE.MeshStandardMaterial({ color: 0x3a8a3a, roughness: 0.6, emissive: 0x0a3a0a });
const bandMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.3 });
const healthMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x330000 });
const redMat = new THREE.MeshStandardMaterial({ color: 0xd01010, emissive: 0x500000 });
const armorMat = new THREE.MeshStandardMaterial({ color: 0x1d3d8e, roughness: 0.5, emissive: 0x050a20 });
const tulipMat = new THREE.MeshStandardMaterial({ color: 0xffcc33, metalness: 1, roughness: 0.2, emissive: 0x664400 });

function moneyMesh() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(moneyGeo, moneyMat));
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.19), bandMat); g.add(b);
  return g;
}
function healthMesh() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.15), healthMat));
  const a = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.16), redMat); g.add(a);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.16), redMat); g.add(b);
  return g;
}
function armorMesh() {
  const g = new THREE.Group();
  const v = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.15), armorMat); g.add(v);
  const s = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.16), new THREE.MeshStandardMaterial({ color: 0xeeeeee })); s.position.y = 0.12; g.add(s);
  return g;
}
// Lale: İstanbul'un simgesi
export function tulipMesh() {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0x2d8a3d }));
  stem.position.y = -0.2; g.add(stem);
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), tulipMat);
    p.scale.set(0.7, 1.6, 0.7); p.rotation.y = (i / 3) * Math.PI * 2; p.rotation.z = 0.25; p.position.y = 0.12;
    g.add(p);
  }
  return g;
}

export class Pickups {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.cityGroup = this.group;
    this.tulips = [];
  }

  spawn(kind, x, z, amount = 0, weapon = null, opts = {}) {
    let mesh;
    if (kind === 'money') mesh = moneyMesh();
    else if (kind === 'health') mesh = healthMesh();
    else if (kind === 'armor') mesh = armorMesh();
    else if (kind === 'weapon') { mesh = buildWeaponModel(weapon) || moneyMesh(); mesh.scale.setScalar(1.6); }
    else if (kind === 'tulip') mesh = tulipMesh();
    else return null;
    const y = opts.y || 0;
    mesh.position.set(x, y + 0.6, z);
    const p = { kind, x, z, y, amount, weapon, mesh, life: opts.permanent ? Infinity : 60, t: Math.random() * 6, id: opts.id };
    this.group.add(mesh);
    // ışık halkası
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 20), new THREE.MeshBasicMaterial({ color: kind === 'money' ? 0x50ff50 : kind === 'tulip' ? 0xffcc33 : 0x50a0ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = -0.57;
    mesh.add(ring);
    this.list.push(p);
    return p;
  }

  remove(p) {
    const i = this.list.indexOf(p);
    if (i >= 0) this.list.splice(i, 1);
    p.mesh.parent && p.mesh.parent.remove(p.mesh);
  }

  // 25 gizli lale - kaydedilen koleksiyon
  placeTulips(collected) {
    const map = this.game.map;
    const spots = [];
    const pr = mulberry(1453);
    let guard = 0;
    while (spots.length < 25 && guard++ < 5000) {
      const b = map.parks.length && pr() < 0.3 ? map.parks[Math.floor(pr() * map.parks.length)] : map.blocks[Math.floor(pr() * map.blocks.length)];
      // bina araları ve çatıların yanı: blok kenarı
      const x = b.x0 + pr() * (b.x1 - b.x0), z = pr() < 0.5 ? b.z0 - 1.6 : b.z1 + 1.6;
      if (!isLand(x, z)) continue;
      if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 150)) continue;
      spots.push({ x, z });
    }
    spots.forEach((s, i) => {
      if (collected.includes(i)) return;
      const p = this.spawn('tulip', s.x, s.z, 0, null, { permanent: true, id: i });
      this.tulips.push(p);
    });
    this.tulipSpots = spots;
  }

  clearDynamic() {
    for (const p of this.list.slice()) if (p.kind !== 'tulip') this.remove(p);
  }

  update(dt) {
    const g = this.game;
    const pl = g.player;
    for (const p of this.list.slice()) {
      p.t += dt;
      p.life -= dt;
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y = p.y + 0.6 + Math.sin(p.t * 3) * 0.1;
      if (p.life <= 0) { this.remove(p); continue; }
      if (pl.dead || pl.vehicle && p.kind !== 'money') continue;
      const d = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z);
      if (d > (pl.vehicle ? 2.5 : 1.3) || Math.abs(pl.pos.y - p.y) > 1.5) continue;
      if (p.mesh.parent !== this.group) continue;
      this.collect(p);
    }
  }

  collect(p) {
    const g = this.game, pl = g.player, s = g.state;
    switch (p.kind) {
      case 'money':
        s.money += p.amount; audio.cash(); g.ui.notify(`+${formatMoney(p.amount)}`, 'money');
        g.particles.money(p.mesh.position);
        break;
      case 'health':
        if (pl.hp >= pl.maxHp) return;
        pl.hp = Math.min(pl.maxHp, pl.hp + 50); audio.cash(); g.ui.notify('+50 Can', 'good');
        break;
      case 'armor':
        if (pl.armor >= 100) return;
        pl.armor = Math.min(100, pl.armor + 50); audio.cash(); g.ui.notify('+50 Zırh', 'good');
        break;
      case 'weapon': {
        const def = WEAPONS[p.weapon];
        pl.giveWeapon(p.weapon, p.amount);
        audio.reload();
        g.ui.notify(`${def.name}${def.type === 'melee' ? '' : ' +' + p.amount + ' mermi'}`, 'good');
        if (pl.weapon === 'fists') pl.setWeapon(p.weapon);
        break;
      }
      case 'tulip':
        s.tulips.push(p.id);
        s.money += 1500;
        audio.success();
        g.ui.notify(`Altın Lale bulundu! (${s.tulips.length}/25) +₺1.500`, 'gold');
        if (s.tulips.length === 25) { s.money += 250000; g.ui.bigMessage('TÜM LALELER TOPLANDI!', '+₺250.000 ve Altın Lale Ceketi', 'gold'); s.unlockedGoldJacket = true; }
        break;
    }
    this.remove(p);
  }
}

function mulberry(seed) {
  let a = seed;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

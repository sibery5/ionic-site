// Sokak eşyası: lambalar (modern + tarihi fener), çöp kovası, bank, baba (bollard), yangın musluğu, İETT durağı,
// büfe, simit arabası, gazete standı, telefon kulübesi, elektrik/telefon direkleri ve telleri, bayrak direkleri,
// reklam panoları, park etmiş motosikletler, logar kapakları, ızgaralar ve yol çizgileri.
import * as THREE from 'three';
import { RNG } from '../core/util.js';
import { glowTexture, makeCanvas, AD_COUNT, PROP_UV } from '../core/textures.js';
import { isLand, SIDEWALK, BRIDGES, inBridge } from './map.js';
import { GeoBuilder } from './instancer.js';
import { SHARED } from './shaders.js';

const HISTORIC = new Set(['fatih', 'beyoglu', 'eyup']);

export const STREET_PROP_DEFS = {
  lampModern: () => {
    const g = new GeoBuilder();
    g.cyl(0.2, 0.24, 0.5, 8, { color: 0x2a2f33, metal: 0.6, rough: 0.5 });
    g.cyl(0.07, 0.11, 6.6, 8, { color: 0x3a4045, metal: 0.7, rough: 0.4 });
    g.add(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6), { y: 6.4, z: -0.8, rx: Math.PI / 2 - 0.15, color: 0x3a4045, metal: 0.7 });
    g.box(0.38, 0.12, 0.8, { y: 6.48, z: -1.6, color: 0x30363a, metal: 0.6, rough: 0.4 });
    g.box(0.3, 0.03, 0.66, { y: 6.45, z: -1.6, color: 0xfff1d0, emis: 2.5, rough: 0.3 });
    return g.build();
  },
  lampClassic: () => {
    const g = new GeoBuilder();
    g.cyl(0.26, 0.3, 0.6, 8, { color: 0x15181a, metal: 0.6, rough: 0.5 });
    g.cyl(0.09, 0.13, 3.6, 8, { y: 0.6, color: 0x15181a, metal: 0.6, rough: 0.5 });
    g.cyl(0.16, 0.1, 0.2, 8, { y: 4.2, color: 0x15181a, metal: 0.6 });
    g.cyl(0.24, 0.16, 0.7, 6, { y: 4.4, color: 0xffe2a8, emis: 2.2, rough: 0.3 });
    g.add(new THREE.ConeGeometry(0.32, 0.4, 6), { y: 5.3, color: 0x15181a, metal: 0.6 });
    g.sphere(0.06, { y: 5.55, color: 0xd4af37, metal: 0.9 }, 6, 4);
    return g.build();
  },
  bin: () => new GeoBuilder().cyl(0.26, 0.22, 0.85, 10, { color: 0x2d5a3a, rough: 0.5, metal: 0.3 }).cyl(0.29, 0.29, 0.08, 10, { y: 0.85, color: 0x1e3a28, metal: 0.4 }).cyl(0.04, 0.04, 0.9, 5, { x: 0.32, color: 0x333333, metal: 0.6 }).build(),
  bench: () => {
    const g = new GeoBuilder();
    for (let i = 0; i < 3; i++) g.box(1.8, 0.04, 0.12, { y: 0.44, z: -0.18 + i * 0.15, uv: 'wood', rough: 0.8 });
    for (let i = 0; i < 2; i++) g.box(1.8, 0.12, 0.035, { y: 0.6 + i * 0.16, z: -0.27, rx: -0.12, uv: 'wood', rough: 0.8 });
    for (const x of [-0.75, 0.75]) { g.box(0.06, 0.44, 0.5, { x, color: 0x222222, metal: 0.7, rough: 0.4 }); g.box(0.06, 0.45, 0.05, { x, y: 0.44, z: -0.27, color: 0x222222, metal: 0.7 }); }
    return g.build();
  },
  bollard: () => new GeoBuilder().cyl(0.07, 0.08, 0.85, 8, { color: 0x1a1d1f, metal: 0.6, rough: 0.4 }).sphere(0.08, { y: 0.86, color: 0x1a1d1f, metal: 0.6 }, 8, 4).cyl(0.081, 0.081, 0.06, 8, { y: 0.7, color: 0xc9b037, metal: 0.8, rough: 0.3 }).build(),
  hydrant: () => new GeoBuilder().cyl(0.13, 0.15, 0.7, 10, { color: 0xc81e1e, rough: 0.4, metal: 0.3 }).sphere(0.13, { y: 0.72, color: 0xc81e1e, metal: 0.3 }, 10, 5).add(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6), { y: 0.45, rz: Math.PI / 2, color: 0xb0b0b0, metal: 0.8 }).build(),
  busstop: () => {
    const g = new GeoBuilder();
    const frame = { color: 0x6a7076, metal: 0.7, rough: 0.35 };
    for (const x of [-2, 2]) for (const z of [-0.7, 0.6]) g.box(0.08, 2.6, 0.08, { x, z, ...frame });
    g.box(4.4, 0.1, 1.8, { y: 2.6, color: 0x9aa4aa, metal: 0.5, rough: 0.25 });
    g.box(4.0, 2.2, 0.03, { y: 0.3, z: -0.7, uv: 'glass', rough: 0.05 });
    g.box(0.03, 2.2, 1.2, { x: 2.0, y: 0.3, uv: 'glass', rough: 0.05 });
    g.add(new THREE.PlaneGeometry(1.25, 1.9), { x: -1.95, y: 1.4, z: 0.0, ry: Math.PI / 2, uv: 'ad' + 2, emis: 0.9 });
    g.add(new THREE.PlaneGeometry(1.25, 1.9), { x: -2.0, y: 1.4, z: 0.0, ry: -Math.PI / 2, uv: 'ad' + 5, emis: 0.9 });
    g.box(0.1, 1.9, 1.3, { x: -1.98, y: 0.45, color: 0x40464c, metal: 0.6 });
    g.box(2.6, 0.06, 0.4, { y: 0.48, z: -0.45, color: 0x8a9096, metal: 0.6 });
    g.cyl(0.05, 0.05, 3.2, 6, { x: 2.5, z: 0.6, color: 0x555a5e, metal: 0.7 });
    g.add(new THREE.PlaneGeometry(0.9, 0.45), { x: 2.5, y: 3.0, z: 0.66, uv: 'iett', emis: 0.4 });
    g.add(new THREE.PlaneGeometry(0.9, 0.45), { x: 2.5, y: 3.0, z: 0.54, ry: Math.PI, uv: 'iett', emis: 0.4 });
    return g.build();
  },
  kiosk: () => {
    const g = new GeoBuilder();
    g.box(2.2, 2.5, 1.7, { color: 0x1d4e9e, rough: 0.5, metal: 0.2 });
    g.add(new THREE.PlaneGeometry(2.1, 1.05), { y: 1.75, z: 0.86, uv: 'kiosk', emis: 0.5 });
    g.box(2.1, 0.9, 0.04, { y: 0.15, z: 0.86, color: 0x2a3440, metal: 0.3 });
    g.add(new THREE.PlaneGeometry(2.5, 0.9), { y: 2.45, z: 1.15, rx: -1.0, uv: 'awning', color: 0xd03030 });
    g.box(2.4, 0.12, 1.9, { y: 2.5, color: 0xeeeeee });
    return g.build();
  },
  simit: () => {
    const g = new GeoBuilder();
    g.box(1.3, 0.6, 0.7, { y: 0.45, color: 0xc81e1e, rough: 0.4, metal: 0.2 });
    g.box(1.2, 0.55, 0.6, { y: 1.05, uv: 'simit', rough: 0.15 });
    g.box(1.3, 0.05, 0.7, { y: 1.6, color: 0xc81e1e });
    for (const x of [-0.5, 0.5]) g.add(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 12), { x, y: 0.22, z: 0.37, rx: Math.PI / 2, color: 0x222222 });
    g.cyl(0.03, 0.03, 0.9, 5, { x: -0.65, y: 0.6, z: -0.3, color: 0x999999, metal: 0.7 });
    return g.build();
  },
  news: () => new GeoBuilder().box(1.4, 1.6, 0.5, { color: 0x333333, metal: 0.3 }).add(new THREE.PlaneGeometry(1.3, 0.66), { y: 1.15, z: 0.26, uv: 'news' }).box(1.5, 0.08, 0.7, { y: 1.6, color: 0x222222 }).build(),
  phone: () => {
    const g = new GeoBuilder();
    g.box(1.0, 2.4, 1.0, { color: 0x0a7fa0, rough: 0.4, metal: 0.3 });
    for (const [x, z, ry] of [[0, 0.51, 0], [0.51, 0, Math.PI / 2], [-0.51, 0, -Math.PI / 2]]) g.add(new THREE.PlaneGeometry(0.9, 2.2), { x, y: 1.2, z, ry, uv: 'phone', emis: 0.25 });
    g.box(1.1, 0.12, 1.1, { y: 2.4, color: 0x07607a });
    return g.build();
  },
  pole: () => {
    const g = new GeoBuilder();
    g.cyl(0.11, 0.15, 9, 7, { color: 0x5a4532, rough: 0.9 });
    g.box(1.8, 0.1, 0.1, { y: 8.3, color: 0x5a4532 });
    for (const x of [-0.75, 0, 0.75]) g.cyl(0.04, 0.04, 0.16, 5, { x, y: 8.4, color: 0xdddddd, rough: 0.3 });
    g.cyl(0.2, 0.2, 0.5, 8, { y: 6.5, z: 0.2, color: 0x7a7a7a, metal: 0.5 });
    return g.build();
  },
  flagpole: () => {
    const g = new GeoBuilder();
    g.cyl(0.07, 0.1, 9, 8, { color: 0xdedede, metal: 0.8, rough: 0.3 });
    g.sphere(0.12, { y: 9.05, color: 0xd4af37, metal: 0.9 }, 8, 4);
    const fl = new THREE.PlaneGeometry(2.7, 1.8, 10, 1); fl.translate(1.35, 0, 0);
    g.add(fl, { y: 7.9, uv: 'flag', wind: 1.0, rough: 0.8 });
    return g.build();
  },
  billboard: () => {
    const g = new GeoBuilder();
    g.cyl(0.3, 0.35, 7, 8, { color: 0x5a5f63, metal: 0.7, rough: 0.4 });
    g.box(7.4, 3.6, 0.3, { y: 7, z: -0.25, color: 0x2a2e31, metal: 0.5 });
    g.box(7.4, 0.08, 1.0, { y: 6.9, z: 0.3, color: 0x3a3e41, metal: 0.6 });
    for (const x of [-2.5, 0, 2.5]) g.box(0.1, 0.1, 0.8, { x, y: 10.7, z: 0.3, color: 0x222222, metal: 0.6 });
    return g.build();
  },
  roofboard: () => {
    const g = new GeoBuilder();
    for (const x of [-3, 3]) { g.box(0.15, 4, 0.15, { x, color: 0x3a3e41, metal: 0.6 }); g.box(0.12, 4.2, 0.12, { x, z: -1.2, rx: 0.3, color: 0x3a3e41, metal: 0.6 }); }
    g.box(7.4, 3.6, 0.2, { y: 1.5, z: -0.12, color: 0x2a2e31, metal: 0.5 });
    return g.build();
  },
  scooter: () => {
    const g = new GeoBuilder();
    for (const z of [-0.55, 0.55]) g.add(new THREE.TorusGeometry(0.22, 0.07, 6, 12), { y: 0.29, z, ry: Math.PI / 2, color: 0x111111, rough: 0.8 });
    g.box(0.36, 0.35, 1.0, { y: 0.35, color: 0xffffff, rough: 0.35, metal: 0.3 });
    g.box(0.3, 0.12, 0.6, { y: 0.72, z: -0.15, color: 0x1a1a1a, rough: 0.7 });
    g.box(0.06, 0.6, 0.06, { y: 0.6, z: 0.5, rx: -0.3, color: 0x333333, metal: 0.7 });
    g.box(0.6, 0.05, 0.05, { y: 1.15, z: 0.62, color: 0x222222, metal: 0.7 });
    g.box(0.38, 0.32, 0.36, { y: 0.85, z: -0.5, color: 0xd02020 });
    return g.build();
  },
  manhole: () => new GeoBuilder().add(new THREE.CircleGeometry(0.4, 14), { rx: -Math.PI / 2, uv: 'manhole', rough: 0.5, metal: 0.6 }).build(),
  grate: () => new GeoBuilder().add(new THREE.PlaneGeometry(0.9, 0.45), { rx: -Math.PI / 2, uv: 'grate', rough: 0.6, metal: 0.5 }).build(),
};
export const STREET_PROP_OPTS = {
  lampModern: { radius: 420, shadow: true }, lampClassic: { radius: 320, shadow: true }, bin: { radius: 130 }, bench: { radius: 140 }, bollard: { radius: 100 },
  hydrant: { radius: 100 }, busstop: { radius: 260, shadow: true }, kiosk: { radius: 260, shadow: true }, simit: { radius: 150 }, news: { radius: 130 }, phone: { radius: 160 },
  pole: { radius: 320, shadow: true }, flagpole: { radius: 420, double: true }, billboard: { radius: 500, shadow: true }, roofboard: { radius: 500 }, scooter: { radius: 120 },
  manhole: { radius: 110 }, grate: { radius: 90 },
};

export function buildStreetProps(city) {
  const { map, physics } = city;
  const cols = physics.city;
  const P = city.props;
  const r = new RNG(314);
  const doors = city.doors;
  const nearDoor = (x, z, d = 2.2) => { for (const dd of doors) if (Math.abs(dd.x - x) < d && Math.abs(dd.z - z) < d) return true; return false; };
  const lamps = [];
  const benches = city.benches || (city.benches = []);
  const halos = [];
  const wires = [];
  for (const rd of map.roads) {
    const horiz = rd.z0 === rd.z1;
    const len = horiz ? Math.abs(rd.x1 - rd.x0) : Math.abs(rd.z1 - rd.z0);
    const hw = rd.w / 2;
    const start = horiz ? Math.min(rd.x0, rd.x1) : Math.min(rd.z0, rd.z1);
    const mx = (rd.x0 + rd.x1) / 2, mz = (rd.z0 + rd.z1) / 2;
    const dist = map.blocks.length ? (() => { let best = null, bd = 1e9; for (const b of map.blocks) { const d = Math.abs(b.cx - mx) + Math.abs(b.cz - mz); if (d < bd) { bd = d; best = b; } } return best && best.district; })() : null;
    const historic = dist && HISTORIC.has(dist.id) && rd.w < 16;
    const at = (t, off) => (horiz ? [start + t, rd.z0 + off] : [rd.x0 + off, start + t]);
    const faceRot = (side) => (horiz ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2)); // yola bakan yön
    // lambalar (eski yerleşim korunur: çarpışma ve ışık havuzları)
    for (let t = hw + 10; t < len - hw - 8; t += 26) {
      for (const side of [-1, 1]) {
        if (rd.bridge && side === 1 && ((t / 26) | 0) % 2) continue;
        const off = side * (hw + (rd.bridge ? -0.6 : 0.7));
        const [x, z] = at(t, off);
        if (!isLand(x, z)) continue;
        const rot = horiz ? (side > 0 ? 0 : Math.PI) : (side > 0 ? -Math.PI / 2 : Math.PI / 2);
        lamps.push([x, z, rot]);
        const classic = historic && !rd.bridge;
        const y0 = inBridge(x, z) ? 0 : 0.15;
        (classic ? P.lampClassic : P.lampModern).addTRS(x, y0, z, rot);
        cols.addCircle(x, z, 0.2, 0, classic ? 4.9 : 6.6, 'lamp');
        if (classic) halos.push(x, y0 + 4.75, z);
        else { const hx = x - Math.sin(rot) * 1.6, hz = z - Math.cos(rot) * 1.6; halos.push(hx, y0 + 6.4, hz); }
        // lamba dibinde çöp kovası
        if (r.chance(0.18) && !rd.bridge) {
          const bx = horiz ? x + 1.3 : x, bz = horiz ? z : z + 1.3;
          if (!nearDoor(bx, bz)) { const br = r.float(0, 6.28); P.bin.addTRS(bx, 0.15, bz, br); cols.breakable(cols.addCircle(bx, bz, 0.28, 0, 1.05, 'bin'), 'bin', 25, P.bin, bx, 0.15, bz, br); }
        }
      }
    }
    if (rd.bridge) continue;
    const main = rd.w >= 16;
    // kaldırım eşyaları (bordür tarafı "eşya bandı")
    for (const side of [-1, 1]) {
      const curb = side * (hw + 0.75);
      for (let t = hw + 14; t < len - hw - 12; t += r.float(7, 15)) {
        if (((t - hw - 10) % 26 + 26) % 26 < 2.5) continue; // lambaya çok yakın
        const [x, z] = at(t, curb);
        if (!isLand(x, z) || nearDoor(x, z, 2.6)) continue;
        const k = r.next();
        const rot = faceRot(-side);
        if (main && k < 0.045) {
          const [bx, bz] = at(t, side * (hw + 1.9));
          const brot = faceRot(-side) + Math.PI;
          P.busstop.addTRS(bx, 0.15, bz, brot);
          // durak: arka cam, yan cam, oturak, ön direkler, tabela direği, çatı (yerel koordinatta)
          cols.addLocal(bx, bz, brot, 0, -0.7, 4.2, 0.14, 0, 2.6, 'busstop');
          cols.addLocal(bx, bz, brot, 2.0, -0.05, 0.12, 1.4, 0, 2.6, 'busstop');
          cols.addLocal(bx, bz, brot, -1.98, -0.05, 0.14, 1.4, 0, 2.6, 'busstop');
          cols.addLocal(bx, bz, brot, 0, -0.45, 2.6, 0.45, 0, 0.55, 'busstop');
          for (const lx of [-2, 2]) cols.addLocalCircle(bx, bz, brot, lx, 0.6, 0.07, 0, 2.6, 'busstop');
          cols.addLocalCircle(bx, bz, brot, 2.5, 0.6, 0.07, 0, 3.4, 'busstop');
          cols.addLocal(bx, bz, brot, 0, -0.05, 4.4, 1.8, 2.55, 2.75, 'busstopRoof');
          t += 8;
        } else if (k < 0.1) {
          P.bench.addTRS(x, 0.15, z, rot + Math.PI); cols.breakable(cols.addLocal(x, z, rot + Math.PI, 0, -0.04, 1.8, 0.56, 0, 0.9, 'bench'), 'bench', 70, P.bench, x, 0.15, z, rot + Math.PI); benches.push([x, z, rot + Math.PI]);
        } else if (k < 0.15) {
          P.hydrant.addTRS(x, 0.15, z, 0); cols.breakable(cols.addCircle(x, z, 0.17, 0, 1.0, 'hydrant'), 'hydrant', 60, P.hydrant, x, 0.15, z, 0);
        } else if (k < 0.24) {
          const sr = faceRot(0) + (horiz ? Math.PI / 2 : 0) + r.float(-0.3, 0.3);
          P.scooter.addTRS(x, 0.15, z, sr, 1, 1, 1, new THREE.Color().setHSL(r.next(), 0.5, 0.45));
          cols.breakable(cols.addOBB(x, z, 0.5, 1.45, sr, 0, 1.2, 'scooter'), 'scooter', 110, P.scooter, x, 0.15, z, sr);
        } else if (k < 0.27 && main) {
          P.simit.addTRS(x, 0.15, z, rot); cols.breakable(cols.addLocal(x, z, rot, 0, 0.03, 1.35, 0.85, 0, 1.75, 'simit'), 'simit', 80, P.simit, x, 0.15, z, rot);
        } else if (k < 0.285) {
          P.phone.addTRS(x, 0.15, z, rot); cols.addOBB(x, z, 1.05, 1.05, rot, 0, 2.6, 'phone');
        } else if (k < 0.31 && main) {
          P.news.addTRS(x, 0.15, z, rot); cols.breakable(cols.addOBB(x, z, 1.45, 0.6, rot, 0, 1.75, 'news'), 'news', 70, P.news, x, 0.15, z, rot);
        } else if (k < 0.33 && main && r.chance(0.5)) {
          const [bx, bz] = at(t, side * (hw + 1.0));
          P.billboard.addTRS(bx, 0.15, bz, rot);
          city.addAd(bx, 0.15 + 7 + 1.8, bz, rot, r.int(0, AD_COUNT - 1), 7.0, 3.4, 0.01);
          cols.addCircle(bx, bz, 0.35, 0, 7, 'billboard');
          cols.addLocal(bx, bz, rot, 0, -0.25, 7.4, 0.35, 7.1, 10.8, 'billboard');
          t += 10;
        }
      }
      // ızgaralar ve logarlar
      for (let t = hw + 12; t < len - hw - 12; t += r.float(20, 45)) {
        const [gx, gz] = at(t, side * (hw - 0.35));
        P.grate.addTRS(gx, 0.012, gz, horiz ? 0 : Math.PI / 2);
        if (r.chance(0.5)) { const [mxx, mzz] = at(t + 6, side * r.float(0.5, hw - 1.5)); P.manhole.addTRS(mxx, 0.01, mzz, r.float(0, 6.28)); }
      }
    }
    // köşe babaları
    for (const tt of [hw + 3.5, len - hw - 3.5]) for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
      const [x, z] = at(tt + (tt < len / 2 ? k * 1.4 : -k * 1.4), side * (hw + 0.35));
      if (!isLand(x, z)) continue;
      P.bollard.addTRS(x, 0.15, z, 0); cols.breakable(cols.addCircle(x, z, 0.09, 0, 1.05, 'bollard'), 'bollard', 40, P.bollard, x, 0.15, z, 0);
    }
    // eski semtlerde ahşap elektrik/telefon direkleri ve telleri
    if (dist && (dist.id === 'eyup' || dist.id === 'uskudar' || dist.id === 'fatih') && !main) {
      let prev = null;
      const side = r.chance(0.5) ? 1 : -1;
      for (let t = hw + 6; t < len - hw - 4; t += 28) {
        const [x, z] = at(t, side * (hw + SIDEWALK - 0.5));
        if (!isLand(x, z) || nearDoor(x, z, 1.5)) { prev = null; continue; }
        P.pole.addTRS(x, 0.15, z, horiz ? 0 : Math.PI / 2);
        cols.addCircle(x, z, 0.16, 0, 9.2, 'pole');
        if (prev) for (const o of [-0.75, 0, 0.75]) {
          const ax = prev[0] + (horiz ? o : 0), az = prev[1] + (horiz ? 0 : o), bx = x + (horiz ? o : 0), bz = z + (horiz ? 0 : o);
          const N = 8;
          for (let i = 0; i < N; i++) {
            const t0 = i / N, t1 = (i + 1) / N;
            const y0 = 8.6 - Math.sin(t0 * Math.PI) * 0.9, y1 = 8.6 - Math.sin(t1 * Math.PI) * 0.9;
            wires.push(ax + (bx - ax) * t0, y0, az + (bz - az) * t0, ax + (bx - ax) * t1, y1, az + (bz - az) * t1);
          }
        }
        prev = [x, z];
      }
    }
  }
  city.lamps = lamps;
  // büfeler ve gazete standları: bazı blok köşelerinde
  for (const b of map.blocks) {
    if (b.kind !== 'city' || !r.chance(0.22)) continue;
    const cx = r.chance(0.5) ? b.x0 - SIDEWALK + 2.2 : b.x1 + SIDEWALK - 2.2, cz = r.chance(0.5) ? b.z0 - SIDEWALK + 1.8 : b.z1 + SIDEWALK - 1.8;
    if (nearDoor(cx, cz, 3)) continue;
    const rot = cz < b.cz ? Math.PI : 0;
    P.kiosk.addTRS(cx, 0.15, cz, rot); cols.addOBB(cx, cz, 2.2, 1.75, rot, 0, 2.75, 'kiosk');
  }
  // çatı reklam panoları (yüksek düz çatılar, ana yollara yakın)
  for (const bl of map.buildings) {
    if (bl.roof !== 'flat' || bl.tower || bl.floors < 6 || !r.chance(0.12) || bl.x1 - bl.x0 < 9) continue;
    const nz = bl.door.nz || 1, x = (bl.x0 + bl.x1) / 2, z = nz > 0 ? bl.z1 - 2 : bl.z0 + 2;
    const rot = nz > 0 ? 0 : Math.PI;
    P.roofboard.addTRS(x, bl.h, z, rot);
    cols.addLocal(x, z, rot, 0, -0.12, 7.4, 0.3, bl.h, bl.h + 5.4, 'roofboard');
    city.addAd(x, bl.h + 1.5 + 0.0, z + nz * 0.02, rot, r.int(0, AD_COUNT - 1), 7.0, 3.4, 0);
  }
  // teller
  if (wires.length) {
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    const wl = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.8 }));
    city.group.add(wl);
  }
  // lamba haleleri (gece parlaması) - tek çizim
  const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(halos, 3));
  city.haloMat = new THREE.PointsMaterial({ map: glowTexture(), color: 0xffc880, size: 2.6, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const hp = new THREE.Points(hg, city.haloMat); hp.renderOrder = 3;
  city.group.add(hp);
  // ışık havuzları (zemine düşen sahte ışık)
  const poolGeo = new THREE.CircleGeometry(6, 18); poolGeo.rotateX(-Math.PI / 2);
  const poolMat = new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: poolTexture(), polygonOffset: true, polygonOffsetFactor: -4 });
  city.poolMat = poolMat;
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, lamps.length);
  const m = new THREE.Matrix4();
  lamps.forEach(([x, z, rot], i) => { m.makeTranslation(x + Math.sin(rot + Math.PI) * 1.6, 0.17, z + Math.cos(rot + Math.PI) * 1.6); pools.setMatrixAt(i, m); });
  pools.renderOrder = 2;
  city.group.add(pools);
  buildMarkings(city);
}

function poolTexture() {
  const c = makeCanvas(64, 64); const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Yol çizgileri: şerit, orta çift sarı, kenar, yaya geçidi, dur çizgisi
function buildMarkings(city) {
  const { map } = city;
  const W = new THREE.Color(0xf2f2ea), Y = new THREE.Color(0xe8b830);
  const mk = city.mark.bind(city);
  for (const rd of map.roads) {
    const horiz = rd.z0 === rd.z1;
    const len = horiz ? Math.abs(rd.x1 - rd.x0) : Math.abs(rd.z1 - rd.z0);
    const hw = rd.w / 2, s = horiz ? Math.min(rd.x0, rd.x1) : Math.min(rd.z0, rd.z1);
    const main = rd.w >= 16;
    const a = rd.bridge ? 2 : 9, b = len - (rd.bridge ? 2 : 9);
    if (b <= a) continue;
    const seg = (t0, t1, off, wdt, c) => {
      const L = t1 - t0, tm = (t0 + t1) / 2;
      if (horiz) mk(s + tm, rd.z0 + off, L, wdt, 0, c); else mk(rd.x0 + off, s + tm, wdt, L, 0, c);
    };
    if (main) {
      for (let t = a; t < b; t += 6) { const t1 = Math.min(b, t + 6); seg(t, t1, -0.15, 0.14, Y); seg(t, t1, 0.15, 0.14, Y); seg(t, t1, hw - 0.5, 0.15, W); seg(t, t1, -hw + 0.5, 0.15, W); }
      for (let t = a + 2; t < b - 3; t += 8) for (const o of [-hw / 2, hw / 2]) seg(t, t + 3, o, 0.13, W);
    } else {
      for (let t = a + 1; t < b - 3; t += 6) seg(t, t + 3, 0, 0.12, W);
    }
  }
  // yaya geçitleri ve dur çizgileri
  for (const n of map.nodes) {
    let cross = 0;
    for (const e of n.edges) cross = Math.max(cross, e.width / 2);
    for (const e of n.edges) {
      const o = map.other(e, n);
      if (inBridge((n.x + o.x) / 2, (n.z + o.z) / 2)) continue;
      const dx = Math.sign(o.x - n.x), dz = Math.sign(o.z - n.z);
      const hw = e.width / 2, off = cross + 3.2 + 1.5;
      for (let s2 = -hw + 0.8; s2 < hw - 0.5; s2 += 1.1) {
        if (dx !== 0) mk(n.x + dx * off, n.z + s2 + 0.25, 3, 0.55, 0, W);
        else mk(n.x + s2 + 0.25, n.z + dz * off, 0.55, 3, 0, W);
      }
      // dur çizgisi (gelen şerit yarısı)
      const so = off + 2.2;
      if (dx !== 0) mk(n.x + dx * so, n.z + (dx > 0 ? hw / 2 : -hw / 2), 0.4, hw - 0.6, 0, W);
      else mk(n.x + (dz > 0 ? -hw / 2 : hw / 2), n.z + dz * so, hw - 0.6, 0.4, 0, W);
    }
  }
  void BRIDGES; void PROP_UV; void SHARED;
}

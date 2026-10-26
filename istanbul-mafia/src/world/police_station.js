// Emniyet müdürlüğü yerleşkesi: ön avlu, demir parmaklık çit + nizamiye kapısı (bariyer, kulübe),
// Türk bayrağı, "POLİS" tabelası, park yeri çizgileri (araç doğma noktaları POLICE_STATIONS[].parking).
import * as THREE from 'three';
import { GeoBuilder } from './instancer.js';

export const POLICE_PROP_DEFS = {
  booth: () => new GeoBuilder().box(1.6, 2.5, 1.6, { color: 0xe8ecf0, rough: 0.5 }).box(1.5, 0.9, 0.03, { y: 1.2, z: 0.81, uv: 'glass', rough: 0.05 }).box(1.5, 0.9, 0.03, { y: 1.2, z: -0.81, uv: 'glass', rough: 0.05 })
    .box(1.9, 0.15, 1.9, { y: 2.5, color: 0x0d2a6e }).box(0.5, 0.12, 0.2, { y: 2.65, color: 0x2a6aff, emis: 2.0 }).build(),
  barrier: () => {
    const g = new GeoBuilder();
    g.box(0.35, 1.0, 0.35, { color: 0xdddddd, metal: 0.3 });
    for (let i = 0; i < 8; i++) g.box(0.6, 0.1, 0.08, { x: 0.5 + i * 0.6, y: 0.9, color: i % 2 ? 0xffffff : 0xd01818, rough: 0.5 });
    return g.build();
  },
  gatepost: () => new GeoBuilder().box(0.7, 2.6, 0.7, { color: 0xd8d4cc, rough: 0.8 }).box(0.85, 0.15, 0.85, { y: 2.6, color: 0xb8b4ac }).sphere(0.18, { y: 2.95, color: 0xb8b4ac }, 8, 5).build(),
  ironfence: () => new GeoBuilder().plane(2, 1.8, { x: 1, y: 0.9, uv: 'ironfence', color: 0xffffff, metal: 0.6, rough: 0.5 }).box(0.12, 1.9, 0.12, { color: 0x20262a, metal: 0.6 }).build(),
};
export const POLICE_PROP_OPTS = { booth: { radius: 260, shadow: true }, barrier: { radius: 200 }, gatepost: { radius: 260, shadow: true }, ironfence: { radius: 220, double: true } };

export function buildPoliceStations(city) {
  const { map } = city;
  const P = city.props;
  const cols = city.physics.city;
  for (const b of map.buildings) {
    const c = b.compound;
    if (!c) continue;
    const fz = c.frontZ, nz = c.nz, inner = nz > 0 ? b.z1 : b.z0;
    const gx0 = c.gateX - c.gateW / 2, gx1 = c.gateX + c.gateW / 2;
    // ön çit (kapı boşluğu bırakılır) + yan çitler
    city.fenceLine(b.x0, fz, gx0 - 0.4, fz, 'ironfence', 1.8);
    city.fenceLine(gx1 + 0.4, fz, b.x1, fz, 'ironfence', 1.8);
    city.fenceLine(b.x0, inner, b.x0, fz, 'ironfence', 1.8);
    city.fenceLine(b.x1, inner, b.x1, fz, 'ironfence', 1.8);
    for (const x of [gx0 - 0.4, gx1 + 0.4]) { P.gatepost.addTRS(x, 0.15, fz, 0); cols.add(x - 0.35, fz - 0.35, x + 0.35, fz + 0.35, 0, 2.6, 'gatepost'); }
    P.barrier.addTRS(gx0, 0.15, fz, 0);
    const bx = gx1 + 1.8, bz = fz - nz * 1.4;
    P.booth.addTRS(bx, 0.15, bz, nz > 0 ? 0 : Math.PI); cols.add(bx - 0.8, bz - 0.8, bx + 0.8, bz + 0.8, 0, 2.6, 'booth');
    // bayrak
    P.flagpole.addTRS(c.flag.x, 0.15, c.flag.z, 0); cols.add(c.flag.x - 0.12, c.flag.z - 0.12, c.flag.x + 0.12, c.flag.z + 0.12, 0, 9, 'pole');
    // kapı üstü "POLİS" tabelası (iki yüz)
    city.addSign('polis', c.gateX, 3.1, fz + nz * 0.02, nz > 0 ? 0 : Math.PI, 4.2, 0.9);
    city.addSign('polis', c.gateX, 3.1, fz - nz * 0.02, nz > 0 ? Math.PI : 0, 4.2, 0.9);
    for (const x of [gx0 - 0.4, gx1 + 0.4]) { P.bollard.addTRS(x, 0.15, fz + nz * 0.8, 0); }
    // kapı üstü kiriş
    city.addTrimBox(gx1 - gx0 + 1.6, 0.35, 0.4, c.gateX, 2.6, fz, [0.84, 0.82, 0.78]);
    // park yerleri: beyaz çizgiler
    for (const s of c.parking) {
      for (const dx of [-1.5, 1.5]) city.mark(s.x + dx, s.z, 0.12, 5.0, 0, null, 0.165);
    }
  }
}

import { CELL } from '../config';
import { ParsedLevel, isSolidChar } from '../game/levels';

// Izgara tabanlı çarpışma ve yol bulma.

export class Grid {
  constructor(public level: ParsedLevel) {}

  get w() {
    return this.level.w;
  }
  get h() {
    return this.level.h;
  }

  char(x: number, z: number): string {
    if (x < 0 || z < 0 || x >= this.w || z >= this.h) return '#';
    return this.level.cells[z][x];
  }

  solid(x: number, z: number) {
    return isSolidChar(this.char(x, z));
  }

  /** Hücre merkezinin dünya koordinatı. */
  static center(x: number, z: number): [number, number] {
    return [(x + 0.5) * CELL, (z + 0.5) * CELL];
  }

  static cellOf(wx: number, wz: number): [number, number] {
    return [Math.floor(wx / CELL), Math.floor(wz / CELL)];
  }

  /** Duvar yüksekliğine göre katılık: alçak eşyalar (masa vb.) sadece belli bir yüksekliğin altında çarpar. */
  heightOf(x: number, z: number): number {
    const ch = this.char(x, z);
    if (ch === '#' || ch === ' ' || ch === 'k' || ch === 's') return 99;
    if (ch === 'v') return 1.3;
    if (ch === 'p') return 1.1;
    if (ch === 'O') return 0.95;
    if (/[a-f]/.test(ch) || ch === 't') return 0.82;
    return 0;
  }

  /**
   * Bir daireyi (x,z, r) katı hücrelerden dışarı iter. y: nesnenin yüksekliği (tepsi için),
   * yükseklikten alçak engeller yok sayılır. Çarpma varsa itme vektörünü döndürür.
   */
  resolveCircle(pos: { x: number; z: number }, r: number, y = 0): { nx: number; nz: number; hit: boolean } {
    let nx = 0;
    let nz = 0;
    let hit = false;
    const [cx, cz] = Grid.cellOf(pos.x, pos.z);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = cx + dx;
        const gz = cz + dz;
        if (this.heightOf(gx, gz) <= y) continue;
        if (!this.solid(gx, gz)) continue;
        const minX = gx * CELL;
        const minZ = gz * CELL;
        const px = Math.max(minX, Math.min(pos.x, minX + CELL));
        const pz = Math.max(minZ, Math.min(pos.z, minZ + CELL));
        let ddx = pos.x - px;
        let ddz = pos.z - pz;
        let d2 = ddx * ddx + ddz * ddz;
        if (d2 < r * r) {
          let d = Math.sqrt(d2);
          if (d < 1e-5) {
            // merkez kutunun içinde: en yakın kenara it
            ddx = pos.x - (minX + CELL / 2);
            ddz = pos.z - (minZ + CELL / 2);
            d = Math.hypot(ddx, ddz) || 1;
            d2 = 0;
          }
          const push = r - Math.sqrt(d2);
          pos.x += (ddx / d) * push;
          pos.z += (ddz / d) * push;
          nx += ddx / d;
          nz += ddz / d;
          hit = true;
        }
      }
    }
    return { nx, nz, hit };
  }

  /** Yürünebilir hücreler arasında BFS yol (4 yönlü). */
  path(from: [number, number], to: [number, number]): [number, number][] | null {
    const key = (x: number, z: number) => z * this.w + x;
    const prev = new Map<number, number>();
    const q: [number, number][] = [from];
    prev.set(key(...from), -1);
    while (q.length) {
      const [x, z] = q.shift()!;
      if (x === to[0] && z === to[1]) break;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const nz = z + dz;
        if (this.solid(nx, nz)) continue;
        const k = key(nx, nz);
        if (prev.has(k)) continue;
        prev.set(k, key(x, z));
        q.push([nx, nz]);
      }
    }
    if (!prev.has(key(...to))) return null;
    const out: [number, number][] = [];
    let k = key(...to);
    while (k !== -1) {
      out.push([k % this.w, Math.floor(k / this.w)]);
      k = prev.get(k)!;
    }
    return out.reverse();
  }

  /** Bir masanın yanındaki yürünebilir hücreler. */
  neighborsWalkable(x: number, z: number): [number, number][] {
    const out: [number, number][] = [];
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      if (!this.solid(x + dx, z + dz)) out.push([x + dx, z + dz]);
    }
    return out;
  }

  /** Işın yürüyüşü: a→b arasında duvar varsa duvara kadar olan oranı döndürür (kamera için). */
  rayFraction(ax: number, az: number, bx: number, bz: number, y: number): number {
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const [gx, gz] = Grid.cellOf(x, z);
      if (this.solid(gx, gz) && this.heightOf(gx, gz) > y) return Math.max(0, (i - 1) / steps);
    }
    return 1;
  }
}

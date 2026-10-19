import * as THREE from 'three';
import { bakeStatic } from './bake';
import { makeCeilingFan, makeFrame, makeGlassShelf, makeNoticeBoard, makePriceSign, makeRug, makeSemaver, makeWallClock, type PaintingKind } from './decor';
import { CELL, WALL_HEIGHT } from '../config';
import { Grid } from '../physics/grid';
import type { LevelDef } from '../game/levels';
import type { Office } from '../game/story';
import { tx, getLang } from '../core/i18n';
import { brickTexture, floorTexture, plasterTexture, signTexture, wetSignTexture } from './textures';
import {
  makeCabinet,
  makeCafeTable,
  makeCeilingLamp,
  makeChair,
  makeDesk,
  makeOcak,
  makePlant,
  makeRadiator,
  makeStairs,
  makeWaterCooler,
  makeWetSign,
  mat,
  wood,
} from './models';

export interface DeskInfo {
  id: string;
  cell: [number, number];
  center: THREE.Vector3; // masanın merkezi
  dir: THREE.Vector3; // masadan ziyaretçiye doğru
  seat: THREE.Vector3; // müşterinin oturduğu yer
}

export interface BuiltLevel {
  group: THREE.Group;
  desks: Map<string, DeskInfo>;
  ocak: THREE.Vector3[];
  steamPoints: THREE.Vector3[];
  wet: Set<string>;
  bulbs: THREE.Mesh[];
  size: { w: number; d: number };
  /** dönen süsler (vantilatör pervaneleri, saat yelkovanı) */
  spinners: { obj: THREE.Object3D; speed: number }[];
  /** bodrum: damlayan boru noktaları (yerde su birikir) */
  leaks: THREE.Vector3[];
}

const DIRS: [number, number][] = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];

export function buildLevel(def: LevelDef, grid: Grid, offices: Office[]): BuiltLevel {
  const lv = grid.level;
  const group = new THREE.Group();
  const W = lv.w * CELL;
  const D = lv.h * CELL;
  const teras = def.theme === 'teras';
  const leaks: THREE.Vector3[] = [];
  const desks = new Map<string, DeskInfo>();

  // zemin
  const ft = floorTexture(def.theme);
  ft.repeat.set(lv.w * 1.5, lv.h * 1.5);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, 0, D / 2);
  floor.receiveShadow = true;
  group.add(floor);

  // duvarlar (instanced)
  const walls: [number, number][] = [];
  for (let z = 0; z < lv.h; z++) for (let x = 0; x < lv.w; x++) if (lv.cells[z][x] === '#') walls.push([x, z]);
  const dummy = new THREE.Object3D();
  if (teras) {
    const stone = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, 1.05, CELL), mat(0xd8cbb3, { rough: 0.9 }), walls.length);
    walls.forEach(([x, z], i) => {
      dummy.position.set((x + 0.5) * CELL, 0.525, (z + 0.5) * CELL);
      dummy.updateMatrix();
      stone.setMatrixAt(i, dummy.matrix);
    });
    stone.castShadow = stone.receiveShadow = true;
    group.add(stone);
    // demir korkuluk
    const rail = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, 0.04, 0.04), mat(0x2a2a2a, { metal: 0.6 }), walls.length);
    walls.forEach(([x, z], i) => {
      dummy.position.set((x + 0.5) * CELL, 1.35, (z + 0.5) * CELL);
      const vertical = lv.cells[z - 1]?.[x] === '#' || lv.cells[z + 1]?.[x] === '#';
      const horizontal = lv.cells[z]?.[x - 1] === '#' || lv.cells[z]?.[x + 1] === '#';
      dummy.rotation.y = vertical && !horizontal ? Math.PI / 2 : 0;
      dummy.updateMatrix();
      rail.setMatrixAt(i, dummy.matrix);
    });
    group.add(rail);
    // korkuluk dikmeleri
    const post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.32, 0.05), mat(0x2a2a2a, { metal: 0.6 }), walls.length);
    dummy.rotation.y = 0;
    walls.forEach(([x, z], i) => {
      dummy.position.set((x + 0.5) * CELL, 1.2, (z + 0.5) * CELL);
      dummy.updateMatrix();
      post.setMatrixAt(i, dummy.matrix);
    });
    group.add(post);
  } else {
    const bodrum = def.theme === 'bodrum';
    const brick = bodrum ? new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.95 }) : null;
    const lower = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, 1.0, CELL), brick ?? wood(), walls.length);
    const upperMat = brick ?? new THREE.MeshStandardMaterial({ map: plasterTexture(), roughness: 0.95 });
    const upper = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, WALL_HEIGHT - 1.0, CELL), upperMat, walls.length);
    const trim = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL + 0.02, 0.06, CELL + 0.02), mat(0x4a2c18), walls.length);
    walls.forEach(([x, z], i) => {
      dummy.position.set((x + 0.5) * CELL, 0.5, (z + 0.5) * CELL);
      dummy.updateMatrix();
      lower.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 1.0 + (WALL_HEIGHT - 1.0) / 2;
      dummy.updateMatrix();
      upper.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 1.0;
      dummy.updateMatrix();
      trim.setMatrixAt(i, dummy.matrix);
    });
    for (const m of [lower, upper, trim]) {
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
    // tavan
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat(bodrum ? 0x3a332c : 0xe9dcc0, { rough: 1 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(W / 2, WALL_HEIGHT, D / 2);
    group.add(ceil);
    if (bodrum) {
      // tavanda paslı borular; ek yerlerinden su damlar
      const pipeM = mat(0x6a4a36, { rough: 0.6, metal: 0.5 });
      const joint = mat(0x8a5a3a, { rough: 0.5, metal: 0.6 });
      for (const row of [2, 5, 9]) {
        const z = (row + 0.5) * CELL;
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, W - CELL, 8), pipeM);
        p.rotation.z = Math.PI / 2;
        p.position.set(W / 2, WALL_HEIGHT - 0.22, z);
        group.add(p);
        for (let x = 2; x < lv.w - 1; x += 3) {
          const j = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 8), joint);
          j.rotation.z = Math.PI / 2;
          j.position.set((x + 0.5) * CELL, WALL_HEIGHT - 0.22, z);
          group.add(j);
          if (lv.cells[row]?.[x] === '.' || lv.cells[row]?.[x] === 'n' || lv.cells[row]?.[x] === 'w') leaks.push(new THREE.Vector3((x + 0.5) * CELL, 0, z));
        }
      }
    }
  }

  const ocak: THREE.Vector3[] = [];
  const steamPoints: THREE.Vector3[] = [];
  const wet = new Set<string>();
  const bulbs: THREE.Mesh[] = [];
  const officeById = new Map(offices.map((o) => [o.id, o]));

  const at = (x: number, z: number) => new THREE.Vector3((x + 0.5) * CELL, 0, (z + 0.5) * CELL);
  const openDir = (x: number, z: number): THREE.Vector3 => {
    let best: [number, number] = [0, 1];
    let bestScore = -1;
    for (const [dx, dz] of DIRS) {
      if (grid.solid(x + dx, z + dz)) continue;
      let score = 0;
      for (let k = 1; k <= 3; k++) if (!grid.solid(x + dx * k, z + dz * k)) score++;
      if (score > bestScore) {
        bestScore = score;
        best = [dx, dz];
      }
    }
    return new THREE.Vector3(best[0], 0, best[1]);
  };
  const faceTo = (obj: THREE.Object3D, d: THREE.Vector3) => {
    obj.rotation.y = Math.atan2(d.x, d.z);
  };

  for (let z = 0; z < lv.h; z++) {
    for (let x = 0; x < lv.w; x++) {
      const ch = lv.cells[z][x];
      const p = at(x, z);
      if (/[a-f]/.test(ch)) {
        const d = openDir(x, z);
        const seat = p.clone().addScaledVector(d, -0.36);
        if (teras) {
          const t = makeCafeTable();
          t.position.copy(p);
          group.add(t);
        } else {
          const desk = makeDesk();
          desk.position.copy(p);
          desk.rotation.y = Math.atan2(-d.x, -d.z);
          group.add(desk);
        }
        const chair = makeChair();
        chair.position.copy(seat).addScaledVector(d, -0.06);
        faceTo(chair, d);
        group.add(chair);
        desks.set(ch, { id: ch, cell: [x, z], center: p.clone(), dir: d, seat });
      } else if (ch === 'O' && ocak.length > 0) {
        // ikinci tezgâh: ocak yok, sadece mermer + bardak tabakları
        const c = makeOcak();
        c.group.children.slice(2, 7).forEach((m) => (m.visible = false));
        c.group.position.copy(p);
        faceTo(c.group, openDir(x, z));
        group.add(c.group);
        ocak.push(p.clone());
      } else if (ch === 'O') {
        const o = makeOcak();
        o.group.position.copy(p);
        faceTo(o.group, openDir(x, z));
        group.add(o.group);
        ocak.push(p.clone());
        steamPoints.push(o.group.localToWorld(o.steamPoint.clone()));
      } else if (ch === 'p') {
        const m = makePlant();
        m.position.copy(p);
        group.add(m);
      } else if (ch === 'k') {
        const m = makeCabinet();
        m.position.copy(p);
        faceTo(m, openDir(x, z));
        group.add(m);
      } else if (ch === 'v') {
        const m = makeWaterCooler();
        m.position.copy(p);
        faceTo(m, openDir(x, z));
        group.add(m);
      } else if (ch === 't') {
        const m = makeCafeTable();
        m.position.copy(p);
        group.add(m);
        for (let i = 0; i < 2; i++) {
          const c = makeChair();
          const a = i * Math.PI + 0.4;
          c.position.copy(p).add(new THREE.Vector3(Math.sin(a) * 0.62, 0, Math.cos(a) * 0.62));
          c.rotation.y = a + Math.PI;
          group.add(c);
        }
      } else if (ch === 's') {
        const m = makeStairs();
        m.position.copy(p);
        faceTo(m, openDir(x, z));
        group.add(m);
      } else if (ch === 'w') {
        wet.add(`${x},${z}`);
      } else if (ch === 'D' && !teras) {
        buildDoor(group, grid, x, z, officeById);
      }
    }
  }

  // ıslak zemin parlaklığı + tabelalar
  if (wet.size) {
    const wetMat = new THREE.MeshStandardMaterial({ color: 0x9fc4d8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.35 });
    const signTex = wetSignTexture(getLang());
    for (const key of wet) {
      const [x, z] = key.split(',').map(Number);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), wetMat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.copy(at(x, z)).setY(0.006);
      group.add(plane);
      if (!wet.has(`${x - 1},${z}`) && !wet.has(`${x},${z - 1}`)) {
        const s = makeWetSign(signTex);
        s.position.copy(at(x, z)).add(new THREE.Vector3(-0.35, 0, -0.35));
        s.rotation.y = Math.PI / 4;
        group.add(s);
      }
    }
  }

  // tavan lambaları ve kaloriferler
  if (!teras) {
    for (let z = 0; z < lv.h; z++)
      for (let x = 0; x < lv.w; x++) {
        if (grid.solid(x, z)) continue;
        if ((x * 7 + z * 3) % 5 === 0 && x % 2 === 1) {
          const l = makeCeilingLamp();
          l.position.copy(at(x, z)).setY(WALL_HEIGHT);
          group.add(l);
          l.traverse((m) => {
            if (m instanceof THREE.Mesh && (m.material as THREE.MeshStandardMaterial).emissiveIntensity > 0) bulbs.push(m);
          });
        }
        // kuzey duvarına yaslı kalorifer
        if (lv.cells[z - 1]?.[x] === '#' && (x + z) % 6 === 0 && lv.cells[z][x] === '.') {
          const r = makeRadiator();
          r.position.copy(at(x, z)).add(new THREE.Vector3(0, 0, -CELL / 2 + 0.1));
          group.add(r);
        }
      }
  }

  const spinners = decorate(group, grid, def, ocak, teras, at);
  // sabit parçaları malzemeye göre birleştir (çizim çağrısı yüzlerden onlara iner)
  bakeStatic(group, [...bulbs, ...spinners.map((s) => s.obj)]);
  for (const sp of spinners) bakeStatic(sp.obj);
  return { group, desks, ocak, steamPoints, wet, bulbs, size: { w: W, d: D }, spinners, leaks };
}

/** Hanı süsle: duvar resimleri, ilan panoları, saat, ocak köşesi (semaver, raf, afiş), kilimler, vantilatörler. */
function decorate(group: THREE.Group, grid: Grid, def: LevelDef, ocak: THREE.Vector3[], teras: boolean, at: (x: number, z: number) => THREE.Vector3) {
  const lv = grid.level;
  const spinners: { obj: THREE.Object3D; speed: number }[] = [];
  const lang = getLang();
  const kinds: PaintingKind[] = ['galata', 'vapur', 'lale', 'eski', 'portre'];
  const wallAt = (x: number, z: number, d: [number, number]) => {
    const n = lv.cells[z + d[1]]?.[x + d[0]];
    return n === '#';
  };
  const place = (obj: THREE.Object3D, x: number, z: number, d: [number, number], y: number) => {
    obj.position.copy(at(x, z)).add(new THREE.Vector3(d[0] * (CELL / 2 - 0.03), y, d[1] * (CELL / 2 - 0.03)));
    obj.rotation.y = Math.atan2(-d[0], -d[1]);
    group.add(obj);
  };
  // ocak köşesi
  if (ocak.length) {
    const [ox, oz] = Grid.cellOf(ocak[0].x, ocak[0].z);
    const back = DIRS.find((d) => grid.char(ox + d[0], oz + d[1]) === '#');
    if (back) {
      const sem = makeSemaver();
      const side: [number, number] = [-back[1], back[0]];
      sem.position.copy(at(ox, oz)).add(new THREE.Vector3(side[0] * 0.3 + back[0] * 0.25, 0.97, side[1] * 0.3 + back[1] * 0.25));
      group.add(sem);
      if (!teras) {
        place(makeGlassShelf(1.1), ox, oz, back, 0);
        place(makePriceSign(lang), ox, oz, back, 2.25);
      }
    }
    const [sx, sz] = Grid.cellOf(ocak[ocak.length - 1].x, ocak[ocak.length - 1].z);
    if (!teras) {
      const clockWall = DIRS.find((d) => grid.char(sx + d[0], sz + d[1]) === '#');
      if (clockWall) {
        const clock = makeWallClock();
        clock.scale.setScalar(1.2);
        place(clock, sx, sz, clockWall, 2.45);
        const minute = clock.getObjectByName('minute');
        if (minute) spinners.push({ obj: minute, speed: -0.12 });
      }
    }
    // ocağın önüne kilim
    const front = DIRS.find((d) => !grid.solid(ox + d[0], oz + d[1]));
    if (front && !teras) {
      const rug = makeRug(CELL * 2, CELL * 0.9);
      rug.position.copy(at(ox + front[0], oz + front[1])).setY(0.006);
      rug.rotation.z = front[0] !== 0 ? Math.PI / 2 : 0;
      group.add(rug);
    }
  }
  if (teras) {
    // ip lambalar: korkuluk boyunca
    const bulb = mat(0xfff1c8, { emissive: 0xffc86a });
    for (let x = 1; x < lv.w - 1; x += 1) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), bulb);
      b.position.set((x + 0.5) * CELL, 2.6 - Math.sin((x / lv.w) * Math.PI * 4) * 0.15, CELL * 0.6);
      group.add(b);
    }
    return spinners;
  }
  let boards = 0;
  for (let z = 1; z < lv.h - 1; z++)
    for (let x = 1; x < lv.w - 1; x++) {
      if (lv.cells[z][x] !== '.') continue;
      const h = (x * 13 + z * 7 + def.grid.length * 3) % 11;
      for (const d of DIRS) {
        if (!wallAt(x, z, d)) continue;
        if (h === 0) place(makeFrame(kinds[(x + z) % kinds.length], 0.62), x, z, d, 1.95);
        else if (h === 6 && boards < 2) {
          place(makeNoticeBoard(lang), x, z, d, 1.75);
          boards++;
        }
        break;
      }
      // geniş alanlara vantilatör, koridor boyunca kilim
      if ((x * 5 + z * 11) % 17 === 0 && !grid.solid(x + 1, z) && !grid.solid(x - 1, z)) {
        const fan = makeCeilingFan();
        fan.position.copy(at(x, z)).setY(WALL_HEIGHT);
        group.add(fan);
        const blades = fan.getObjectByName('blades');
        if (blades) spinners.push({ obj: blades, speed: 3.5 + ((x + z) % 3) });
      }
      if ((x * 3 + z * 17) % 23 === 0 && lv.cells[z][x + 1] === '.' && lv.cells[z][x + 2] === '.') {
        const rug = makeRug(CELL * 2.6, CELL * 0.7);
        rug.position.copy(at(x + 1, z)).setY(0.006);
        group.add(rug);
      }
    }
  return spinners;
}

function buildDoor(group: THREE.Group, grid: Grid, x: number, z: number, offices: Map<string, Office>) {
  const horizontalWall = grid.char(x - 1, z) === '#' && grid.char(x + 1, z) === '#';
  const c = new THREE.Vector3((x + 0.5) * CELL, 0, (z + 0.5) * CELL);
  const frameMat = mat(0x4a2c18);
  const g = new THREE.Group();
  g.position.copy(c);
  if (!horizontalWall) g.rotation.y = Math.PI / 2;
  // kasa
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.3, CELL + 0.04), frameMat);
    post.position.set(s * (CELL / 2 - 0.05), 1.15, 0);
    g.add(post);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(CELL, WALL_HEIGHT - 2.3, CELL), new THREE.MeshStandardMaterial({ map: plasterTexture(), roughness: 0.95 }));
  lintel.position.set(0, 2.3 + (WALL_HEIGHT - 2.3) / 2, 0);
  g.add(lintel);
  const lintelTrim = new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.1, CELL + 0.06), frameMat);
  lintelTrim.position.y = 2.33;
  g.add(lintelTrim);
  // tabela: en yakın masa
  const id = nearestDesk(grid, x, z);
  if (id && offices.has(id)) {
    const off = offices.get(id)!;
    const tex = signTexture(tx(off.name), tx(off.person));
    const sm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, side: THREE.DoubleSide, emissive: new THREE.Color(0x221a08) });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.34), sm);
    sign.position.set(0, 2.62, 0);
    // iki yüze de koy
    const s1 = sign.clone();
    s1.position.z = CELL / 2 + 0.01;
    const s2 = sign.clone();
    s2.position.z = -CELL / 2 - 0.01;
    s2.rotation.y = Math.PI;
    g.add(s1, s2);
  }
  g.traverse((m) => {
    if (m instanceof THREE.Mesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  group.add(g);
}

function nearestDesk(grid: Grid, x: number, z: number): string | null {
  const seen = new Set<string>([`${x},${z}`]);
  let frontier: [number, number][] = [[x, z]];
  for (let depth = 0; depth < 7; depth++) {
    const next: [number, number][] = [];
    for (const [cx, cz] of frontier) {
      for (const [dx, dz] of DIRS) {
        const nx = cx + dx;
        const nz = cz + dz;
        const k = `${nx},${nz}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const ch = grid.char(nx, nz);
        if (/[a-f]/.test(ch)) return ch;
        if (!grid.solid(nx, nz)) next.push([nx, nz]);
      }
    }
    frontier = next;
  }
  return null;
}

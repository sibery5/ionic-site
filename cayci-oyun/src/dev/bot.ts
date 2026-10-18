// Denge ayarı için otomatik oyuncu. Gerçek oyun kurallarıyla (fizik dahil) bir vardiyayı oynar.
// Tek hilesi nişan almak: bakış yönünü fare yerine doğrudan ayarlar. Yıldız eşiklerini ölçmek için kullanılır.

import * as THREE from 'three';
import { ScriptedInput } from '../core/input';
import { ORDERS } from '../config';
import { Grid } from '../physics/grid';
import type { Run } from '../game/Run';
import type { RunStats } from '../meta/stats';

export interface BotPolicy {
  /** Tepsiye en fazla kaç bardak yükler (açgözlülük). */
  greed: number;
  /** Fırıldak dener mi; timingError: zamanlama hatası (sn, ±). */
  spin: boolean;
  timingError: number;
  /** Hedefe yaklaşırken parmak ucuna geçer. */
  careful: boolean;
  /** Az bardakla düz koridorda koşar. */
  run?: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = any;

export function playBot(run: Run, policy: BotPolicy, seed = 1): RunStats {
  const r = run as R;
  const grid: Grid = r.grid;
  const inp = new ScriptedInput();
  let rnd = seed >>> 0;
  const rand = () => ((rnd = (rnd * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  let result: RunStats | null = null;
  // sonuç ekranı açılmasın, kayda yazılmasın
  r.onEnd = (s: RunStats) => {
    result = s;
  };

  const ocakGoal = () => {
    const o: THREE.Vector3 = r.built.ocak[0];
    return { x: o.x, z: o.z, range: ORDERS.ocakRange - 0.35, cell: Grid.cellOf(o.x, o.z) };
  };
  const deskGoal = (id: string) => {
    const c = r.customers.get(id);
    return { x: c.desk.center.x, z: c.desk.center.z, range: ORDERS.deliverRange - 0.45, cell: c.desk.cell as [number, number] };
  };

  let mode: 'toOcak' | 'fill' | 'toDesk' | 'wait' = 'fill';
  let target: string | null = null;
  let path: [number, number][] = [];
  let replan = 0;
  let settle = 0;
  let waitT = 0;
  let spinState: { t: number; at: number } | null = null;

  const plan = (cell: [number, number]) => {
    const from = Grid.cellOf(r.player.pos.x, r.player.pos.z);
    const ns = grid.neighborsWalkable(cell[0], cell[1]);
    let best: [number, number][] | null = null;
    for (const n of ns) {
      const p = grid.path(from, n);
      if (p && (!best || p.length < best.length)) best = p;
    }
    path = best ?? [];
    // ilk hücre bulunduğumuz hücre: geri dönmeyelim
    while (path.length > 1 && path[0][0] === from[0] && path[0][1] === from[1]) path.shift();
  };

  const matchCount = (items: string[]) => {
    const pool = r.tray.glasses.map((g: R) => g.type);
    let n = 0;
    for (const it of items) {
      const i = pool.indexOf(it);
      if (i >= 0) {
        pool.splice(i, 1);
        n++;
      }
    }
    return n;
  };

  const pickOrder = (): string | null => {
    let best: string | null = null;
    let score = -Infinity;
    for (const [id, o] of r.orders as Map<string, R>) {
      const m = matchCount(o.items);
      if (!m) continue;
      const c = r.customers.get(id);
      const d = Math.hypot(c.desk.center.x - r.player.pos.x, c.desk.center.z - r.player.pos.z);
      const left = o.patience - (r.time - o.createdAt);
      const pay = o.kind === 'vip' ? 5 : o.kind === 'rush' ? 2 : 1;
      const s = m * pay * 2 - d * 0.6 - (left < 8 ? -3 : 0);
      if (left > d / 1.6 + 1 && s > score) {
        score = s;
        best = id;
      }
    }
    return best;
  };

  const steer = (gx: number, gz: number, range: number, dt: number) => {
    const p = r.player.pos;
    const dist = Math.hypot(gx - p.x, gz - p.z);
    if (dist < range) return true;
    replan -= dt;
    // sıradaki ara nokta
    while (path.length > 1) {
      const [cx, cz] = Grid.center(path[0][0], path[0][1]);
      // kapılardan ortalayarak geç (tepsi sağda taşınıyor, köşe kesersen kasaya çarpar)
      const door = grid.char(path[0][0], path[0][1]) === 'D' || (path[1] && grid.char(path[1][0], path[1][1]) === 'D');
      if (Math.hypot(cx - p.x, cz - p.z) < (door ? 0.22 : 0.45)) path.shift();
      else break;
    }
    // ileriye bakan takip: 1,3 m ötedeki yol noktasına yönel (zikzak tepsiyi sallar)
    let tx = gx;
    let tz = gz;
    for (let k = 0; k < path.length; k++) {
      const [cx, cz] = Grid.center(path[k][0], path[k][1]);
      tx = cx;
      tz = cz;
      const isDoor = grid.char(path[k][0], path[k][1]) === 'D';
      if (Math.hypot(cx - p.x, cz - p.z) > 1.3 || isDoor) break;
    }
    const want = Math.atan2(tx - p.x, tz - p.z);
    let d = want - r.player.camYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const tower = r.tray.glasses.length > 6;
    const turn = Math.sign(d) * Math.min(Math.abs(d) * 4 * dt, (tower ? 1.4 : 2.4) * dt);
    r.player.camYaw += turn;
    // insanın öğrendiği kurallar: ıslak zeminde ve kedi yakındayken parmak ucu
    const [pcx, pcz] = Grid.cellOf(p.x, p.z);
    const wet = !!r.built.wet.has(`${pcx},${pcz}`) || [0.8, 1.6, 2.2].some((a) => r.fx.puddleAt(p.x + Math.sin(r.player.camYaw) * a, p.z + Math.cos(r.player.camYaw) * a) || r.built.wet.has(Grid.cellOf(p.x + Math.sin(r.player.camYaw) * a, p.z + Math.cos(r.player.camYaw) * a).join(','))) || r.fx.puddleAt(p.x, p.z);
    const cat = !!r.cat && r.cat.pos.distanceTo(p) < 2.2;
    // önünden geçen biri varsa bekle (en fazla 1,5 sn)
    const fx = Math.sin(r.player.camYaw);
    const fz = Math.cos(r.player.camYaw);
    const blocked = (r.npcs as R[]).some((n) => {
      const dx = n.pos.x - r.tray.pos.x;
      const dz = n.pos.z - r.tray.pos.z;
      const l = Math.hypot(dx, dz);
      return l < 1.3 && (dx * fx + dz * fz) / (l || 1) > 0.2;
    });
    if (blocked && waitT < 1.5) waitT += dt;
    else {
      if (!blocked) waitT = 0;
      if (Math.abs(d) < (tower ? 1.0 : 0.55)) inp.down.add('KeyW');
      if (policy.run && !wet && !cat && Math.abs(d) < 0.12 && dist > 4 && r.tray.glasses.length <= 4 && path.length > 3) inp.down.add('ShiftLeft');
    }
    if ((policy.careful && (dist < 2.6 || Math.abs(d) > 0.3 || tower)) || wet || cat) inp.down.add('ControlLeft');
    return false;
  };

  const dt = 1 / 60;
  const trace: string[] = [];
  const bumps: number[] = [];
  const modeTime: Record<string, number> = {};
  let stuck = 0;
  let lastCat = 0;
  let lastCatT = -9;
  let lastSlip = 0;
  let lastSlipT = -9;
  const causes: Record<string, number> = {};
  const ring: string[] = [];
  let dumped = false;
  (globalThis as R).__botInfo = () => ({ modeTime, stuck, causes });
  (globalThis as R).__botTrace = trace;
  for (let i = 0; i < 60 * 200 && !result; i++) {
    inp.down.delete('KeyW');
    inp.down.delete('ControlLeft');
    inp.down.delete('KeyE');
    inp.down.delete('KeyQ');
    inp.down.delete('KeyF');
    inp.down.delete('ShiftLeft');
    const glasses = r.tray.glasses as R[];
    const orders = r.orders as Map<string, R>;

    // Fırıldak zamanlaması
    if (spinState) {
      spinState.t += dt;
      if (r.spin?.stage === 'meter' && spinState.t >= spinState.at) inp.press('KeyF');
      if (!r.spin) spinState = null;
    } else if (mode === 'fill' || mode === 'toOcak') {
      if (mode === 'toOcak') {
        if (replan <= 0 || !path.length) {
          plan(ocakGoal().cell);
          replan = 0.6;
        }
        const g = ocakGoal();
        if (steer(g.x, g.z, g.range, dt)) {
          mode = 'fill';
          settle = 0.35;
        }
      } else {
        settle -= dt;
        if (settle <= 0) {
          // ihtiyaç: açık siparişlerin bardakları (açgözlülük sınırına kadar)
          const need = { demli: 0, acik: 0 };
          for (const o of orders.values()) for (const it of o.items) need[it as 'demli' | 'acik']++;
          for (const g of glasses) need[g.type as 'demli' | 'acik'] = Math.max(0, need[g.type as 'demli' | 'acik'] - 1);
          const room = Math.min(policy.greed, r.tray.capacity) - glasses.length;
          const extra = !r.venue.rules.colored && orders.size ? 1 : 0; // tek tip mekânda bir fazla al
          if (room > 0 && need.demli + need.acik + extra > 0) {
            if (need.acik > 0 && r.venue.rules.colored && (need.demli === 0 || need.acik >= need.demli)) inp.down.add('KeyQ');
            else inp.down.add('KeyE');
          } else if (glasses.length && orders.size) {
            if (policy.spin && glasses.length >= 3 && !(r.time < r.spinBoostUntil) && rand() < 0.7) {
              inp.press('KeyF');
              spinState = { t: 0, at: 0.275 + (rand() * 2 - 1) * policy.timingError };
            } else {
              target = pickOrder();
              if (target) {
                mode = 'toDesk';
                plan(deskGoal(target).cell);
                replan = 0.6;
              }
            }
          }
        }
      }
    } else if (mode === 'toDesk') {
      if (!target || !orders.has(target) || !matchCount(orders.get(target).items)) {
        target = glasses.length ? pickOrder() : null;
        if (target) plan(deskGoal(target).cell);
        else {
          mode = 'toOcak';
          path = [];
        }
      } else {
        if (replan <= 0 || !path.length) {
          plan(deskGoal(target).cell);
          replan = 0.6;
        }
        const g = deskGoal(target);
        if (steer(g.x, g.z, g.range, dt)) {
          settle -= dt;
          if (Math.hypot(r.player.vel.x, r.player.vel.z) < 0.4) {
            inp.press('KeyE');
            settle = 0.25;
            target = null;
          }
        }
      }
    }
    modeTime[mode] = (modeTime[mode] ?? 0) + dt;
    if (inp.down.has('KeyW') && Math.hypot(r.player.vel.x, r.player.vel.z) < 0.15) stuck += dt;
    if (i % (Number((globalThis as R).__botEvery) || 300) === 0) trace.push(`@${r.time.toFixed(0)} ${mode} pos=${r.player.pos.x.toFixed(1)},${r.player.pos.z.toFixed(1)} target=${target} path=${path.length} yaw=${r.player.camYaw.toFixed(2)} wp=${path[0] ? path[0].join(',') : '-'} spd=${Math.hypot(r.player.vel.x, r.player.vel.z).toFixed(2)} keys=${[...inp.down].join('+')} orders=${[...orders.keys()].join(',')} g=${glasses.map((g: R) => g.type[0]).join('')}`);
    const b0 = r.stats.broken;
    bumps.push(r.lastBump ?? 0);
    if (bumps.length > 20) bumps.shift();
    const j0 = r.stats.jarsLost;
    r.update(dt, inp);
    if (r.stats.catTrips > lastCat) {
      lastCat = r.stats.catTrips;
      lastCatT = r.time;
    }
    if (r.stats.slips > lastSlip) {
      lastSlip = r.stats.slips;
      lastSlipT = r.time;
    }
    if ((globalThis as R).__botDump) ring.push(`  t=${r.time.toFixed(2)} ${mode} g=${glasses.length} v=${Math.hypot(r.player.vel.x, r.player.vel.z).toFixed(2)} yaw=${r.player.yaw.toFixed(2)} cam=${r.player.camYaw.toFixed(2)} tv=${r.tray.vel.length().toFixed(2)} rig=${((Math.asin(Math.min(1, r.tray.jarSurface.length())) * 180) / Math.PI).toFixed(1)} ta=${r.tray.params.towerAngle.toFixed(1)} bump=${(r.lastBump ?? 0).toFixed(2)} press=${r.tray.normal.dot(r.tray.felt).toFixed(2)} lift=${r.tray.liftTimer.toFixed(2)} ny=${r.tray.normal.y.toFixed(2)} keys=${[...inp.down].join('+')} stun=${r.player.stunned.toFixed(2)} slip=${r.fx.puddleAt(r.player.pos.x, r.player.pos.z)}`);
    if (ring.length > 45) ring.shift();
    if (r.stats.jarsLost > j0 || r.stats.broken > b0) {
      if (!dumped && (globalThis as R).__botDump) {
        dumped = true;
        trace.push(...ring.slice(-24));
      }
      const why =
        r.time - lastCatT < 1.2 ? 'kedi' : r.time - lastSlipT < 1.5 ? 'kayma' : bumps.some((b) => b >= 1.5) ? 'insan' : bumps.some((b) => b > 0.2) ? 'duvar' : r.spin ? 'firildak' : 'sallanti';
      const key = (r.stats.jarsLost > j0 ? 'kavanoz-' : 'bardak-') + why;
      causes[key] = (causes[key] ?? 0) + 1;
    }
    if (r.stats.broken > b0 || r.stats.jarsLost > j0)
      trace.push(`${r.time.toFixed(1)} ${mode} g=${glasses.length} br+${r.stats.broken - b0} jar+${r.stats.jarsLost - j0} v=${Math.hypot(r.player.vel.x, r.player.vel.z).toFixed(2)} spin=${r.spin ? r.spin.stage : '-'} keys=${[...inp.down].join('+')} bumps=${bumps.filter((b) => b > 0).map((b) => b.toFixed(1)).join('/')} cat=${r.stats.catTrips} npc=${Math.min(9, ...r.npcs.map((n: R) => n.pos.distanceTo(r.tray.pos))).toFixed(2)} trayV=${r.tray.vel.length().toFixed(2)} pos=${r.player.pos.x.toFixed(1)},${r.player.pos.z.toFixed(1)}`);
    inp.endFrame();
  }
  if (!result) run.forceEnd();
  return result ?? r.stats;
}

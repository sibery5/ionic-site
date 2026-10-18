import * as THREE from 'three';
import { NPC, TRAY } from '../config';
import type { Grid } from '../physics/grid';
import type { TraySim } from '../physics/tray';
import type { Player } from '../entities/Player';
import type { Npc } from '../entities/Npc';

// Vardiya sahnelerinin paylaştığı parçalar: tepsi çarpışması ve takip kamerası.

const UP = new THREE.Vector3(0, 1, 0);

/** Tepsi duvara, masaya ya da insana çarpar. Çarpma şiddetini döndürür (m/s). */
export function collideTray(tray: TraySim, grid: Grid, npcs: Npc[]): number {
  const pos = tray.pos;
  const hit = grid.resolveCircle(pos, TRAY.radius, pos.y);
  let bump = 0;
  if (hit.hit) {
    const n = new THREE.Vector3(hit.nx, 0, hit.nz).normalize();
    const vn = tray.vel.dot(n);
    if (vn < 0) tray.push(n, -vn * (1 + TRAY.collideRestitution));
    bump = Math.max(bump, -vn);
  }
  if (pos.y < NPC.trayHitHeight) {
    for (const npc of npcs) {
      const d = new THREE.Vector3(pos.x - npc.pos.x, 0, pos.z - npc.pos.z);
      const min = TRAY.radius + npc.radius;
      const l = d.length();
      if (l < min && l > 1e-4) {
        d.divideScalar(l);
        pos.addScaledVector(d, min - l);
        const rel = tray.vel.clone().sub(npc.vel);
        const vn = rel.dot(d);
        tray.push(d, Math.max(0.5, -vn * (1 + TRAY.collideRestitution)));
        bump = Math.max(bump, 1.5);
      }
    }
  }
  return bump;
}

export interface CamState {
  camera: THREE.PerspectiveCamera;
  pos: THREE.Vector3;
}

/** 3. şahıs takip kamerası; arkada duvar varsa yaklaşır ve yükselir. */
export function followCamera(cam: CamState, p: Player, grid: Grid, outdoor: boolean, dt: number, shake = 0, side = 0) {
  const f = p.forward(new THREE.Vector3(), p.camYaw);
  const r = p.right(new THREE.Vector3(), p.camYaw);
  const dist = (p.armMode ? 2.6 : 3.2) - side * 0.6;
  const height = outdoor ? 2.4 : 2.1;
  // side > 0: omuz üstü kamera, tepsi (sağ el) görünür kalsın
  const desired = p.pos.clone().addScaledVector(UP, height).addScaledVector(f, -dist).addScaledVector(r, side * 1.3).addScaledVector(UP, -side * 0.45);
  const head = p.pos.clone().addScaledVector(UP, 1.5);
  const frac = grid.rayFraction(head.x, head.z, desired.x, desired.z, desired.y);
  const k = Math.max(0.12, frac - 0.06);
  desired.x = head.x + (desired.x - head.x) * k;
  desired.z = head.z + (desired.z - head.z) * k;
  desired.y += (1 - frac) * (outdoor ? 0 : 0.75);
  if (dt >= 1) cam.pos.copy(desired);
  else cam.pos.lerp(desired, 1 - Math.exp(-10 * dt));
  cam.camera.position.copy(cam.pos);
  // duvara sıkışınca kamera başın içine girer: kafayı gizle ki tepsi görünsün
  p.rig.head.visible = cam.pos.distanceTo(head) > 1.0;
  if (shake > 0) cam.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
  const look = p.pos
    .clone()
    .addScaledVector(UP, 1.0 - (1 - frac) * 0.3 - side * 0.35)
    .addScaledVector(f, 0.9 + (1 - frac) * 0.8)
    .addScaledVector(r, side * 0.8);
  cam.camera.lookAt(look);
}

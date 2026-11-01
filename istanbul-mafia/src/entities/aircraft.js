// Hava araçları: helikopter ve özel uçak. Basit uçuş modelleri, çatıya/yere iniş, bina çarpışması, düşüş ve patlama.
// Kontroller (player.readInput üzerinden):
//   Helikopter: W/S ileri/geri eğim, A/D sapma (yaw), Space yüksel, Ctrl (veya X) alçal
//   Uçak:       W/S gaz artır/azalt, A/D yatış (dönüş), Space burun yukarı, Ctrl (veya X) burun aşağı
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Vehicle, colorize, lightize, prep, bx, rbx, cyl, beam, darkMat, chromeMat, glassMat, paintMat, makeLightsMat } from './vehicles.js';
import { isLand, WATER_Y } from '../world/map.js';
import { clamp, angleDiff } from '../core/util.js';
import { audio } from '../core/audio.js';

export const AIR_TYPES = {
  helikopter: { name: 'Helikopter', price: 2500000, maxSpeed: 45, accel: 11, len: 11.5, wid: 2.4, hei: 3.3, hp: 1500, climb: 9, colors: ['#1a1a1a', '#e8e8e8', '#8a1a1a', '#1d3d6e'], style: 'heli' },
  // askerî (fiyatsız; askerî üste / havalimanında durur). model: gövde türü, armed: silahlı
  attackHeli: { name: 'Akbaba TH-4 Taarruz Helikopteri', price: 0, maxSpeed: 62, accel: 14, len: 14, wid: 3.6, hei: 3.8, hp: 3200, climb: 11, colors: ['#3d4429'], style: 'heli', model: 'attack', armed: 'heli', rotorY: 3.25, rotorR: 6.2, tailPos: [0.18, 3.0, -7.9], matte: true },
  jet: { name: 'Şimşek AJ-24 Savaş Uçağı', price: 0, maxSpeed: 165, accel: 24, len: 15.2, wid: 3.4, hei: 5.0, span: 9.6, hp: 2600, stall: 50, colors: ['#7a8590'], style: 'plane', model: 'jet', armed: 'jet', agile: 1.9, ab: 1.7, matte: true },
  ucak: { name: 'Özel Uçak', price: 4000000, maxSpeed: 70, accel: 9, len: 8.4, wid: 2.2, hei: 2.8, span: 11, hp: 1200, stall: 24, colors: ['#f2f2f2', '#c81010', '#1d3d6e'], style: 'plane' },
};

// ---- askerî: taarruz helikopteri (tandem kokpit, kanatçık, roket kovanı, burun topu) ----
function attackParts(d) {
  const paint = [], dark = [], chrome = [], glass = [], lights = [];
  const prof = new THREE.Shape();
  prof.moveTo(3.6, 1.25); prof.quadraticCurveTo(3.7, 1.7, 3.0, 1.95); prof.lineTo(0.6, 2.55); prof.lineTo(-1.6, 2.5); prof.quadraticCurveTo(-2.4, 2.2, -2.6, 1.7); prof.lineTo(-2.4, 0.95); prof.quadraticCurveTo(0.5, 0.85, 3.6, 1.25);
  const body = new THREE.ExtrudeGeometry(prof, { depth: 0.75, bevelEnabled: true, bevelThickness: 0.22, bevelSize: 0.2, bevelOffset: -0.2, bevelSegments: 3, curveSegments: 8 });
  body.rotateY(-Math.PI / 2); body.translate(0.375, 0, 0);
  paint.push(prep(body));
  paint.push(prep(beam(0, 1.85, -2.3, 0, 2.15, -7.6, 0.55, 0.42)));
  paint.push(prep(beam(0, 2.1, -7.2, 0, 3.6, -8.0, 0.1, 0.9)));
  paint.push(prep(rbx(2.0, 0.07, 0.55, 0.02, 0, 2.1, -6.6)));
  // motor yuvaları + egzoz susturucular, rotor göbeği
  for (const s of [1, -1]) {
    paint.push(prep(rbx(0.55, 0.55, 2.0, 0.2, s * 0.62, 2.55, -0.6)));
    dark.push(colorize(cyl(0.2, 0.24, 0.45, 10, 'z', s * 0.75, 2.6, -1.8), 0x1a1a1a));
  }
  dark.push(colorize(cyl(0.18, 0.25, 0.55, 10, 'y', 0, 2.95, 0), 0x1e1e1e));
  // kanatçıklar: roket kovanı (dış), füze rayları (iç)
  for (const s of [1, -1]) {
    paint.push(prep(rbx(1.7, 0.1, 0.8, 0.03, s * 1.15, 1.75, -0.5)));
    dark.push(colorize(cyl(0.22, 0.22, 1.5, 12, 'z', s * 1.75, 1.45, -0.45), 0x2a2e20));
    for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; dark.push(colorize(cyl(0.035, 0.035, 0.02, 6, 'z', s * 1.75 + Math.cos(a) * 0.12, 1.45 + Math.sin(a) * 0.12, 0.31), 0x050505)); }
    for (const dx of [-0.12, 0.12]) { dark.push(colorize(cyl(0.07, 0.07, 1.3, 8, 'z', s * (1.15 + dx), 1.5, -0.4), 0x8a8a7a)); dark.push(colorize(new THREE.ConeGeometry(0.07, 0.2, 8).rotateX(Math.PI / 2).translate(s * (1.15 + dx), 1.5, 0.35), 0x8a8a7a)); }
    // tekerlekli iniş takımı
    dark.push(colorize(beam(s * 0.4, 1.0, 0.8, s * 1.0, 0.3, 0.8, 0.08, 0.08, true), 0x222222));
    dark.push(colorize(cyl(0.3, 0.3, 0.16, 12, 'x', s * 1.0, 0.3, 0.8), 0x111111));
  }
  dark.push(colorize(cyl(0.2, 0.2, 0.12, 10, 'x', 0, 0.2, -6.6), 0x111111));
  // burun topu (döner taret)
  dark.push(colorize(new THREE.SphereGeometry(0.28, 12, 8).translate(0, 0.95, 2.9), 0x1a1a1a));
  dark.push(colorize(cyl(0.04, 0.04, 1.2, 8, 'z', 0, 0.9, 3.6), 0x111111));
  dark.push(colorize(new THREE.SphereGeometry(0.22, 10, 8).translate(0, 1.15, 3.55), 0x101010)); // nişan sensörü
  // tandem kanopi (iki basamak)
  for (const [z0, z1, y0, y1] of [[3.0, 1.6, 1.95, 2.35], [1.5, 0.1, 2.3, 2.7]]) {
    const cp = new THREE.Shape(); cp.moveTo(z0, y0); cp.lineTo(z1 + 0.3, y1); cp.lineTo(z1, y1 - 0.05); cp.lineTo(z1, y0 - 0.2); cp.lineTo(z0, y0);
    const cg = new THREE.ExtrudeGeometry(cp, { depth: 1.05, bevelEnabled: false }); cg.rotateY(-Math.PI / 2); cg.translate(0.525, 0, 0);
    glass.push(prep(cg));
  }
  lights.push(lightize(new THREE.SphereGeometry(0.08, 8, 6).translate(1.95, 1.8, -0.5), 0x501010, 0xff2020, 3));
  lights.push(lightize(new THREE.SphereGeometry(0.08, 8, 6).translate(-1.95, 1.8, -0.5), 0x105010, 0x20ff40, 3));
  lights.push(lightize(new THREE.SphereGeometry(0.1, 8, 6).translate(0, 3.65, -8.0), 0x601010, 0xff2020, 5));
  lights.push(lightize(cyl(0.1, 0.1, 0.05, 10, 'z', 0.3, 1.0, 3.4), 0xdfe6ea, 0xfff2d8, 0));
  void d; void chrome;
  return { paint, dark, chrome, glass, lights };
}
// ---- askerî: tek motorlu çok rollü savaş uçağı ----
function jetParts(d) {
  const paint = [], dark = [], chrome = [], glass = [], lights = [];
  const Y = 1.95;
  const prof = [[0, 7.6], [0.18, 7.2], [0.42, 6.2], [0.62, 4.8], [0.78, 3.2], [0.85, 1.0], [0.85, -3.5], [0.78, -5.6], [0.62, -7.0], [0.6, -7.2]].map(([r, z]) => new THREE.Vector2(r, z));
  const fus = new THREE.LatheGeometry(prof, 18); fus.rotateX(Math.PI / 2); fus.scale(1, 0.92, 1); fus.translate(0, Y, 0);
  paint.push(prep(fus));
  // gövde altı hava alığı ve sırt
  paint.push(prep(rbx(1.1, 0.75, 3.4, 0.25, 0, Y - 0.8, 1.6)));
  dark.push(colorize(rbx(0.95, 0.6, 0.06, 0.2, 0, Y - 0.8, 3.32), 0x050505));
  paint.push(prep(beam(0, Y + 0.6, 2.6, 0, Y + 0.55, -5.2, 0.6, 0.35, true)));
  // kanatlar, yatay ve dikey kuyruk (planform → ince kalıp)
  const plan = (pts, th) => { const s = new THREE.Shape(); pts.forEach(([x, z], i) => (i ? s.lineTo(x, z) : s.moveTo(x, z))); const g = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 1 }); g.rotateX(Math.PI / 2); return g; };
  const sp = d.span / 2;
  for (const s of [1, -1]) {
    const w = plan([[s * 0.7, 1.6], [s * sp, -2.3], [s * sp, -3.3], [s * 0.7, -3.6]], 0.1); w.translate(0, Y - 0.05, 0); paint.push(prep(w));
    const h = plan([[s * 0.6, -5.4], [s * 2.6, -6.9], [s * 2.6, -7.5], [s * 0.6, -7.3]], 0.07); h.translate(0, Y - 0.1, 0); paint.push(prep(h));
    // kanat ucu füzeleri + kanat altı füzeler ve depolar
    for (const [x, len] of [[s * (sp + 0.08), 2.6], [s * sp * 0.62, 2.9]]) {
      const y = x === s * (sp + 0.08) ? Y - 0.05 : Y - 0.35;
      dark.push(colorize(cyl(0.08, 0.08, len, 8, 'z', x, y, -2.4 + len * 0.15), 0xd8d8d0));
      dark.push(colorize(new THREE.ConeGeometry(0.08, 0.35, 8).rotateX(Math.PI / 2).translate(x, y, -2.4 + len * 0.65 + 0.17), 0x8a8a8a));
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.78; dark.push(colorize(bx(0.01, 0.16, 0.25, x + Math.cos(a) * 0.1, y + Math.sin(a) * 0.1, -2.4 - len * 0.3).rotateZ(0), 0x9a9a9a)); }
    }
    dark.push(colorize(cyl(0.3, 0.3, 3.0, 12, 'z', s * sp * 0.36, Y - 0.5, -1.0), 0x8a9098));
  }
  const fin = new THREE.Shape(); fin.moveTo(-4.2, Y + 0.6); fin.lineTo(-6.6, Y + 3.4); fin.lineTo(-7.3, Y + 3.4); fin.lineTo(-7.1, Y + 0.6); fin.lineTo(-4.2, Y + 0.6);
  const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.12, bevelEnabled: false }); fg.rotateY(-Math.PI / 2); fg.translate(0.06, 0, 0); paint.push(prep(fg));
  // egzoz lülesi
  dark.push(colorize(cyl(0.62, 0.56, 0.7, 16, 'z', 0, Y, -7.45, true), 0x3a3634));
  dark.push(colorize(cyl(0.5, 0.5, 0.05, 16, 'z', 0, Y, -7.2), 0x1a1210));
  // kokpit kanopisi
  const can = new THREE.SphereGeometry(0.55, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2); can.scale(0.9, 0.85, 3.2); can.translate(0, Y + 0.45, 4.2);
  glass.push(prep(can));
  dark.push(colorize(rbx(0.55, 0.5, 0.5, 0.1, 0, Y + 0.5, 3.2), 0x1a1a1a)); // koltuk
  // iniş takımı (yerde açık)
  dark.push(colorize(beam(0, Y - 0.6, 5.0, 0, 0.3, 5.1, 0.1, 0.1, true), 0x333333));
  dark.push(colorize(cyl(0.3, 0.3, 0.18, 12, 'x', 0, 0.3, 5.1), 0x111111));
  for (const s of [1, -1]) { dark.push(colorize(beam(s * 0.8, Y - 0.6, -1.4, s * 1.25, 0.38, -1.5, 0.12, 0.12, true), 0x333333)); dark.push(colorize(cyl(0.38, 0.38, 0.24, 12, 'x', s * 1.25, 0.38, -1.5), 0x111111)); }
  lights.push(lightize(new THREE.SphereGeometry(0.08, 8, 6).translate(sp, Y, -3.0), 0x501010, 0xff2020, 3));
  lights.push(lightize(new THREE.SphereGeometry(0.08, 8, 6).translate(-sp, Y, -3.0), 0x105010, 0x20ff40, 3));
  lights.push(lightize(new THREE.SphereGeometry(0.09, 8, 6).translate(0, Y + 3.45, -7.0), 0x601010, 0xff2020, 5));
  lights.push(lightize(cyl(0.09, 0.09, 0.05, 10, 'z', 0, 0.75, 5.2), 0xdfe6ea, 0xfff2d8, 0));
  void chrome;
  return { paint, dark, chrome, glass, lights };
}

const cache = new Map();
function airParts(type) {
  if (cache.has(type)) return cache.get(type);
  const d = AIR_TYPES[type];
  let paint = [], dark = [], chrome = [], glass = [], lights = [];
  if (d.model === 'attack' || d.model === 'jet') {
    ({ paint, dark, chrome, glass, lights } = d.model === 'jet' ? jetParts(d) : attackParts(d));
  } else if (d.style === 'heli') {
    // gövde: kalıp çıkarılmış damla profil
    const prof = new THREE.Shape();
    prof.moveTo(2.3, 0.75); prof.quadraticCurveTo(2.6, 1.4, 1.8, 2.15); prof.lineTo(-0.9, 2.2); prof.quadraticCurveTo(-1.6, 2.0, -1.9, 1.5); prof.lineTo(-1.9, 0.75); prof.quadraticCurveTo(0, 0.55, 2.3, 0.75);
    const body = new THREE.ExtrudeGeometry(prof, { depth: 1.7, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.22, bevelOffset: -0.22, bevelSegments: 4, curveSegments: 10 });
    body.rotateY(-Math.PI / 2); body.translate(0.85, 0, 0);
    paint.push(prep(body));
    paint.push(prep(beam(0, 1.6, -1.8, 0, 1.95, -6.0, 0.45, 0.35)));
    paint.push(prep(rbx(0.08, 1.2, 0.8, 0.04, 0, 2.3, -5.9)));
    paint.push(prep(rbx(1.4, 0.06, 0.4, 0.02, 0, 1.95, -5.4)));
    dark.push(colorize(rbx(1.0, 0.45, 1.4, 0.15, 0, 2.4, -0.4), 0x2a2a2a));
    dark.push(colorize(cyl(0.12, 0.12, 0.5, 8, 'y', 0, 2.75, 0), 0x222222));
    // kızaklar
    for (const s of [1, -1]) {
      dark.push(colorize(beam(s * 1.05, 0.05, -1.6, s * 1.05, 0.05, 1.9, 0.08, 0.08, true), 0x222222));
      dark.push(colorize(beam(s * 1.05, 0.05, 1.9, s * 1.05, 0.25, 2.25, 0.08, 0.08, true), 0x222222));
      for (const z of [-0.9, 1.1]) dark.push(colorize(beam(s * 1.05, 0.05, z, s * 0.75, 0.75, z, 0.06, 0.06, true), 0x222222));
    }
    // camlar
    const cp = new THREE.Shape(); cp.moveTo(2.32, 0.9); cp.quadraticCurveTo(2.62, 1.45, 1.82, 2.12); cp.lineTo(0.9, 2.15); cp.lineTo(0.6, 1.0); cp.lineTo(2.32, 0.9);
    const cg = new THREE.ExtrudeGeometry(cp, { depth: 2.18, bevelEnabled: false, curveSegments: 8 }); cg.rotateY(-Math.PI / 2); cg.translate(1.09, 0, 0);
    glass.push(prep(cg));
    for (const s of [1, -1]) glass.push(prep(bx(0.02, 0.7, 1.0, s * 1.11, 1.55, -0.3)));
    lights.push(lightize(new THREE.SphereGeometry(0.08, 8, 6).translate(1.1, 1.2, -0.5), 0x501010, 0xff2020, 3));
    lights.push(lightize(new THREE.SphereGeometry(0.08, 8, 6).translate(-1.1, 1.2, -0.5), 0x105010, 0x20ff40, 3));
    lights.push(lightize(new THREE.SphereGeometry(0.1, 8, 6).translate(0, 2.95, -5.9), 0x601010, 0xff2020, 5));
    lights.push(lightize(cyl(0.12, 0.12, 0.05, 10, 'z', 0, 0.75, 2.2), 0xdfe6ea, 0xfff2d8, 0));
  } else {
    const prof = new THREE.Shape();
    prof.moveTo(3.4, 1.0); prof.quadraticCurveTo(3.5, 1.4, 2.8, 1.6); prof.lineTo(1.4, 2.25); prof.lineTo(-0.6, 2.2); prof.lineTo(-4.5, 1.7); prof.lineTo(-4.6, 1.45); prof.lineTo(-1.0, 0.75); prof.lineTo(2.5, 0.7); prof.quadraticCurveTo(3.3, 0.75, 3.4, 1.0);
    const body = new THREE.ExtrudeGeometry(prof, { depth: 0.9, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.18, bevelOffset: -0.18, bevelSegments: 3, curveSegments: 8 });
    body.rotateY(-Math.PI / 2); body.translate(0.45, 0, 0);
    paint.push(prep(body));
    // kanatlar (üstten kanat)
    paint.push(prep(rbx(d.span, 0.12, 1.5, 0.05, 0, 2.25, 0.4)));
    for (const s of [1, -1]) dark.push(colorize(beam(s * 0.6, 1.05, 0.6, s * 2.6, 2.18, 0.5, 0.06, 0.06, true), 0x9a9a9a));
    // kuyruk
    paint.push(prep(rbx(3.2, 0.08, 0.9, 0.03, 0, 1.75, -4.1)));
    paint.push(prep(beam(0, 1.7, -3.6, 0, 3.0, -4.4, 0.9, 0.08)));
    // pervane burnu
    chrome.push(prep(new THREE.ConeGeometry(0.22, 0.45, 12).rotateX(Math.PI / 2).translate(0, 1.15, 3.65)));
    // iniş takımı
    for (const s of [1, -1]) { dark.push(colorize(beam(s * 0.4, 0.9, 0.2, s * 1.1, 0.35, 0.1, 0.06, 0.06, true), 0x333333)); dark.push(colorize(cyl(0.3, 0.3, 0.15, 12, 'x', s * 1.1, 0.3, 0.1), 0x151515)); }
    dark.push(colorize(beam(0, 0.85, 2.6, 0, 0.3, 2.7, 0.06, 0.06, true), 0x333333));
    dark.push(colorize(cyl(0.22, 0.22, 0.12, 12, 'x', 0, 0.22, 2.7), 0x151515));
    const cp = new THREE.Shape(); cp.moveTo(2.75, 1.62); cp.lineTo(1.4, 2.22); cp.lineTo(-0.5, 2.18); cp.lineTo(-0.6, 1.6); cp.lineTo(2.75, 1.62);
    const cg = new THREE.ExtrudeGeometry(cp, { depth: 1.32, bevelEnabled: false }); cg.rotateY(-Math.PI / 2); cg.translate(0.66, 0, 0);
    glass.push(prep(cg));
    lights.push(lightize(new THREE.SphereGeometry(0.1, 8, 6).translate(d.span / 2, 2.25, 0.4), 0x501010, 0xff2020, 3));
    lights.push(lightize(new THREE.SphereGeometry(0.1, 8, 6).translate(-d.span / 2, 2.25, 0.4), 0x105010, 0x20ff40, 3));
    lights.push(lightize(new THREE.SphereGeometry(0.1, 8, 6).translate(0, 3.05, -4.45), 0x601010, 0xff2020, 5));
    lights.push(lightize(cyl(0.1, 0.1, 0.05, 10, 'z', d.span * 0.3, 2.2, 1.17), 0xdfe6ea, 0xfff2d8, 0));
  }
  const P = {
    paint: mergeGeometries(paint), dark: mergeGeometries(dark),
    chrome: chrome.length ? mergeGeometries(chrome) : null, glass: mergeGeometries(glass), lights: mergeGeometries(lights),
  };
  cache.set(type, P);
  return P;
}

export function buildAircraftModel(type, color) {
  const d = AIR_TYPES[type];
  const P = airParts(type);
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  const chassis = new THREE.Group(); root.add(chassis);
  const body = new THREE.Mesh(P.paint, paintMat(color || d.colors[0], !!d.matte)); body.castShadow = true; chassis.add(body);
  chassis.add(new THREE.Mesh(P.dark, darkMat));
  if (P.chrome) chassis.add(new THREE.Mesh(P.chrome, chromeMat));
  const gm = new THREE.Mesh(P.glass, glassMat); chassis.add(gm);
  const lm = makeLightsMat(); chassis.add(new THREE.Mesh(P.lights, lm));
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 });
  const discMat = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  let rotor, tail, disc;
  if (d.style === 'heli') {
    const ry = d.rotorY || 3.02, rr = d.rotorR || 5.6, tp = d.tailPos || [0.18, 2.25, -5.9];
    rotor = new THREE.Group(); rotor.position.set(0, ry, 0);
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, rr).translate(0, 0, rr / 2), bladeMat); b.rotation.y = (i * Math.PI) / 2; rotor.add(b); }
    disc = new THREE.Mesh(new THREE.CircleGeometry(rr, 32).rotateX(-Math.PI / 2), discMat); disc.position.y = ry;
    tail = new THREE.Group(); tail.position.set(tp[0], tp[1], tp[2]);
    for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.3, 0.14), bladeMat); b.rotation.x = (i * Math.PI) / 2; tail.add(b); }
    chassis.add(rotor, disc, tail);
  } else {
    rotor = new THREE.Group(); rotor.position.set(0, 1.15, 3.75);
    for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.9, 0.04), bladeMat); b.rotation.z = (i * Math.PI) / 2; rotor.add(b); }
    disc = new THREE.Mesh(new THREE.CircleGeometry(0.95, 24), discMat); disc.position.set(0, 1.15, 3.78);
    chassis.add(rotor, disc);
  }
  let flame = null;
  if (d.model === 'jet') {
    rotor.visible = false; disc.visible = false;
    flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 14, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff8a30, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    flame.position.set(0, 1.95, -7.75); chassis.add(flame);
  }
  const drv = new THREE.Mesh(colorize(new THREE.BoxGeometry(0.4, 0.6, 0.25).translate(0, 0.3, 0), 0x333333), darkMat);
  drv.position.set(d.model === 'jet' ? 0 : d.model === 'attack' ? 0 : d.style === 'heli' ? 0.45 : 0.3, d.model === 'jet' ? 2.1 : d.model === 'attack' ? 1.85 : d.style === 'heli' ? 1.0 : 1.2, d.model === 'jet' ? 3.2 : d.model === 'attack' ? 0.9 : d.style === 'heli' ? 1.2 : 0.8); drv.visible = false; chassis.add(drv);
  const pool = new THREE.Object3D();
  Object.assign(root.userData, { bodyMesh: body, glassMesh: gm, chassis, wheels: [], wheelR: 1, lights: lm.userData, lightsMat: lm, driverDummy: drv, driverTorso: drv, pool, rotor, tail, disc, flame, siren: false });
  return root;
}

const _p = { x: 0, z: 0 };
const _dir = new THREE.Vector3(), _d2 = new THREE.Vector3(), _o = new THREE.Vector3();
const GUN_HELI = { name: 'Burun Topu', type: 'rifle', range: 420, dmg: 55, sound: 'ak', flash: 2.5, shell: false };
const GUN_JET = { name: 'Uçak Topu', type: 'rifle', range: 650, dmg: 60, sound: 'm4', flash: 3, shell: false };
const ROCKET_HELI = { name: 'Roket', type: 'launcher', dmg: 220, radius: 7 };
const MISSILE_JET = { name: 'Füze', type: 'launcher', dmg: 380, radius: 10 };
export class Aircraft extends Vehicle {
  constructor(game, type, x, z, heading, color) {
    const def = AIR_TYPES[type];
    super(game, type, x, z, heading, color, { def, kind: 'air', mesh: buildAircraftModel(type, color || def.colors[0]) });
    this.external = true;
    this.heli = def.style === 'heli';
    this.rotorSpd = 0;
    this.lift = 0;
    this.throttleLv = 0;
    this.pitchA = 0; this.rollA = 0;
    this.grounded = true;
    this.radius = this.heli ? 2.0 : 2.2;
    const sup = game.physics.resolveCircle({ x, z }, 1, 50, 2, 100).support;
    this.pos.y = Math.max(0, sup);
  }
  // oyuncu girişi (player.updateDriving içinden çağrılır)
  readInput(input, dt = 1 / 60) {
    const up = input.down('Space') ? 1 : 0, dn = input.down('ControlLeft') || input.down('ControlRight') || input.down('KeyX') ? 1 : 0;
    this.lift = up - dn;
    this.controls.handbrake = false;
    this.ab = !this.heli && !!this.def.ab && input.down('ShiftLeft') && this.throttleLv > 0.85;
    if (this.def.armed && !this.destroyed) this.weapons(input, dt);
  }
  // Silahlar: sol tık top/makineli (helikopterde kamera yönüne döner burun topu), Q roket/füze
  weapons(input, dt) {
    const g = this.game, pl = this.driver, m = input.mouse;
    this.gunT = (this.gunT || 0) - dt; this.misT = (this.misT || 0) - dt;
    if (!g.combat || !pl) return;
    this.mesh.updateMatrixWorld();
    const q = this.mesh.quaternion;
    const nose = _dir.set(0, 0, 1).applyQuaternion(q);
    if (m.left && !m.right && this.gunT <= 0) {
      this.gunT = this.heli ? 0.09 : 0.05;
      const o = this.mesh.localToWorld(_o.set(0, this.heli ? 0.9 : 2.1, this.heli ? 4.2 : 6.5));
      const d = _d2.copy(this.heli && pl.aimDir ? pl.aimDir : nose);
      if (this.heli && d.dot(nose) < 0.2) d.copy(nose);
      d.x += (Math.random() - 0.5) * 0.012; d.y += (Math.random() - 0.5) * 0.012; d.z += (Math.random() - 0.5) * 0.012; d.normalize();
      const def = this.heli ? GUN_HELI : GUN_JET;
      if (g.combat.muzzleFlash) g.combat.muzzleFlash(pl, o, d, def);
      g.combat.hitscan(pl, o, d, def, o);
      audio.gunshot(this.heli ? 'ak' : 'm4', o.x, o.z);
    }
    if (input.hit('KeyQ') && this.misT <= 0) {
      this.misT = this.heli ? 0.35 : 1.1;
      this.side = -(this.side || 1);
      const o = this.mesh.localToWorld(_o.set(this.side * (this.heli ? 1.75 : this.def.span * 0.31), this.heli ? 1.45 : 1.6, this.heli ? 0.6 : -0.5));
      const d = _d2.copy(nose);
      if (this.heli && pl.aimDir && pl.aimDir.dot(nose) > 0.8) d.lerp(pl.aimDir, 0.5).normalize();
      g.combat.rocket(pl, o.clone(), d.clone(), this.heli ? ROCKET_HELI : MISSILE_JET);
      // [araç silahı] füze hızı = platform hızı + itki (combat.rocket sabit 55 m/s verir)
      const pr = g.combat.projectiles && g.combat.projectiles[g.combat.projectiles.length - 1];
      if (pr && pr.vel) { pr.vel.copy(d).multiplyScalar(this.heli ? 80 : 130); pr.vel.x += this.vx; pr.vel.y += this.vy; pr.vel.z += this.vz; pr.life = 6; }
      audio.gunshot('rpg', o.x, o.z);
      if (g.particles.backblast) g.particles.backblast(o, _d2.copy(d).negate());
    }
  }
  update(dt) {
    const g = this.game, d = this.def, ud = this.mesh.userData, phys = g.physics;
    this.updateFire(dt);
    const c = this.controls;
    const live = !!this.driver && !this.destroyed && this.sinking <= 0;
    const isPlayer = live && this.driver.isPlayer;
    if (!isPlayer) this.lift = 0;
    this.rotorSpd = clamp(this.rotorSpd + (live ? 0.45 : -0.18) * dt, 0, 1);
    if (this.heli) this.updateHeli(dt, c, live); else this.updatePlane(dt, c, live);
    // çarpışma: binalar (yatay itme), zemin/çatı
    _p.x = this.pos.x; _p.z = this.pos.z;
    const r = phys.resolveCircle(_p, this.radius, this.pos.y, 2.6, 0.8);
    const push = Math.hypot(_p.x - this.pos.x, _p.z - this.pos.z);
    const hs = Math.hypot(this.vx, this.vz);
    if (push > 1e-3) {
      this.pos.x = _p.x; this.pos.z = _p.z;
      if (hs > 9 && !this.destroyed) { this.damage(hs * hs * 2.5, null); audio.crash(this.pos.x, this.pos.z, 1.4); g.particles.sparks({ x: this.pos.x, y: this.pos.y + 2, z: this.pos.z }, 14); }
      this.vx *= -0.2; this.vz *= -0.2;
    }
    const water = !isLand(this.pos.x, this.pos.z) && r.support <= 0;
    const ground = water ? WATER_Y : r.support;
    if (this.pos.y <= ground) {
      const vy = this.vy;
      this.pos.y = ground;
      if (water && !this.destroyed) {
        if (this.sinking === 0) { audio.splash(this.pos.x, this.pos.z); g.particles.splash({ x: this.pos.x, y: WATER_Y, z: this.pos.z }); }
        this.sinking += dt; this.pos.y = WATER_Y - this.sinking * 0.5;
        if (this.sinking > 1.5 && this.driver) { const dr = this.driver; g.vehicles.ejectDriver(this); if (dr.isPlayer) dr.pos.y = -1.2; }
        if (this.sinking > 10) { this.destroyed = true; this.wreckT = 0; }
      } else {
        const hard = -vy > 7 || (!this.heli && (hs > 48 || Math.abs(this.rollA) > 0.45 || this.pitchA < -0.25)) || (this.heli && Math.abs(this.rollA) > 0.6);
        if (hard && !this.destroyed && (Math.abs(vy) > 3 || hs > 10)) { this.damage(this.hp + 1, null); this.burnT = 0.05; }
        this.vy = Math.max(0, this.vy);
        this.grounded = true;
        const fr = this.heli ? 6 : 0.6;
        this.vx *= Math.exp(-fr * dt); this.vz *= Math.exp(-fr * dt);
        if (!this.heli) this.pitchA = Math.max(this.pitchA, 0);
      }
    } else this.grounded = this.pos.y - ground < 0.05;
    this.pos.x = clamp(this.pos.x, -1400, 1400); this.pos.z = clamp(this.pos.z, -1400, 1400);
    this.pos.y = Math.min(this.pos.y, 420);
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.fs = this.vx * fx + this.vz * fz;
    // görseller
    ud.rotor.rotation[this.heli ? 'y' : 'z'] += this.rotorSpd * dt * (this.heli ? 28 : 60);
    if (ud.tail) ud.tail.rotation.x += this.rotorSpd * dt * 60;
    ud.disc.material.opacity = Math.max(0, this.rotorSpd - 0.5) * 0.35;
    const night = g.env ? g.env.nightFactor : 0;
    const blink = Math.sin(this.phaseT = (this.phaseT || 0) + dt * 6) > 0.6;
    ud.lights.uA.value.set(live ? 0.5 + night * 3 : 0, 0, 0, 1.5 + night * 2);
    ud.lights.uB.value.set(0, live && blink ? 6 : 0, 0, 0);
    if (ud.flame) {
      const k = live ? this.throttleLv * this.rotorSpd : 0, ab = this.ab ? 1 : 0;
      ud.flame.material.opacity = Math.min(0.9, k * 0.35 + ab * 0.55) * (0.85 + Math.random() * 0.15);
      ud.flame.scale.set(0.8 + ab * 0.3, 0.8 + ab * 0.3, 0.5 + k * 1.5 + ab * 3.5 * (0.9 + Math.random() * 0.2));
      ud.flame.material.color.setHex(ab ? 0xffa050 : 0xff6a20);
    }
    if (isPlayer && g.audio && g.audio.setEngine) {
      const o = this._snd || (this._snd = {});
      o.kind = this.heli ? 'heli' : d.model === 'jet' ? 'jet' : 'prop'; o.throttle = this.heli ? Math.abs(this.lift) : this.throttleLv; o.speed = Math.hypot(this.vx, this.vz); o.boost = this.ab ? 1 : 0; o.rotor = this.rotorSpd; o.rpm01 = this.rotorSpd;
      g.audio.setEngine(!this.destroyed, this.heli ? 0.15 + this.rotorSpd * 0.35 + Math.abs(this.lift) * 0.12 : 0.2 + this.throttleLv * 0.9, 0.08 + this.rotorSpd * 0.08, undefined, o);
    }
    ud.driverDummy.visible = !!this.driver;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(this.pitchA, this.heading, this.rollA);
  }
  updateHeli(dt, c, live) {
    const d = this.def;
    const pw = this.rotorSpd;
    const thr = live ? c.throttle : 0, st = live ? c.steer : 0;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const flying = !this.grounded || this.lift > 0;
    // eğim → yatay ivme
    this.pitchA += ((flying ? thr * 0.28 : 0) - this.pitchA) * Math.min(1, dt * 3);
    const hs = Math.hypot(this.vx, this.vz);
    const yawT = st * 1.25 / (1 + hs / 40);
    this.yawRate += ((flying || pw > 0.6 ? yawT : 0) - this.yawRate) * Math.min(1, dt * 4);
    this.heading += this.yawRate * dt;
    this.rollA += ((flying ? -st * 0.12 - this.yawRate * hs * 0.004 : 0) - this.rollA) * Math.min(1, dt * 3);
    if (flying && pw > 0.85) {
      const a = d.accel * thr;
      this.vx += fx * a * dt; this.vz += fz * a * dt;
    }
    const drag = d.accel / d.maxSpeed;
    this.vx -= this.vx * drag * dt * (flying ? 1 : 3); this.vz -= this.vz * drag * dt * (flying ? 1 : 3);
    // dikey
    let vyT = this.lift * d.climb;
    if (pw < 0.85 || this.destroyed) vyT = -14 * (1 - pw * 0.6);
    this.vy += (vyT - this.vy) * Math.min(1, dt * (pw < 0.85 ? 0.8 : 2.2));
    this.pos.x += this.vx * dt; this.pos.z += this.vz * dt; this.pos.y += this.vy * dt;
  }
  updatePlane(dt, c, live) {
    const d = this.def;
    const thrIn = live ? c.throttle : 0, st = live ? c.steer : 0;
    this.throttleLv = clamp(this.throttleLv + thrIn * 0.5 * dt, 0, 1);
    if (!live) this.throttleLv = Math.max(0, this.throttleLv - dt * 0.3);
    let s = Math.max(0, this.speedA || 0);
    const pitchIn = this.lift;
    if (this.grounded) {
      s += (this.throttleLv * d.accel * (this.ab ? d.ab : 1) * this.rotorSpd - 0.6 - s * (d.model === 'jet' ? 0.012 : 0.03)) * dt;
      s = clamp(s, 0, d.stall * 1.35);
      this.yawRate = st * 0.8 * Math.min(1, s / 5) / (1 + s / 30);
      this.heading += this.yawRate * dt;
      this.rollA += (0 - this.rollA) * Math.min(1, dt * 5);
      this.pitchA = s > d.stall && pitchIn > 0 ? -0.15 : this.pitchA + (0 - this.pitchA) * Math.min(1, dt * 4);
      if (s > d.stall && pitchIn > 0) { this.grounded = false; this.pos.y += 0.3; }
    } else {
      // burun yukarı = pitchA negatif (görsel x ekseni)
      const ag = d.agile || 1;
      this.pitchA = clamp(this.pitchA - pitchIn * 0.8 * ag * dt, -0.7 - (ag - 1) * 0.3, 0.6);
      this.rollA = clamp(this.rollA - st * 1.4 * ag * dt, -1.1 - (ag - 1) * 0.3, 1.1 + (ag - 1) * 0.3);
      if (!st) this.rollA += -this.rollA * Math.min(1, dt * 0.8);
      const climbAng = -this.pitchA;
      s += (this.throttleLv * d.accel * (this.ab ? d.ab : 1) - 0.00035 * s * s * 9 * (d.model === 'jet' ? 0.35 : 1) - 9.81 * Math.sin(climbAng)) * dt;
      s = clamp(s, 0, d.maxSpeed * 1.2);
      // yatışlı dönüş
      this.yawRate = (9.81 * Math.tan(-this.rollA)) / Math.max(12, s);
      this.heading += this.yawRate * dt;
      if (s < d.stall) this.pitchA += (0.35 - this.pitchA) * Math.min(1, dt * (1 - s / d.stall) * 1.5); // stall: burun düşer
    }
    this.speedA = s;
    const climbAng = this.grounded ? 0 : -this.pitchA;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const hsp = s * Math.cos(climbAng);
    this.vx = fx * hsp; this.vz = fz * hsp;
    let vy = s * Math.sin(climbAng);
    if (!this.grounded && s < d.stall) vy -= (d.stall - s) * 0.6;
    if (this.destroyed) vy = Math.min(vy, -10);
    this.vy = vy;
    this.pos.x += this.vx * dt; this.pos.z += this.vz * dt; this.pos.y += this.vy * dt;
    void angleDiff;
  }
}

export class AircraftManager {
  constructor(game) { this.game = game; }
  get list() { return this.game.vehicles.list.filter((v) => v.kind === 'air'); }
  get types() { return AIR_TYPES; }
  add(type, x, z, heading = 0, color) {
    const v = new Aircraft(this.game, type, x, z, heading, color);
    this.game.vehicles.addVehicle(v);
    return v;
  }
  remove(v) { this.game.vehicles.remove(v); }
  nearestEnterable(x, z, maxD = 3) {
    let best = null, bd = maxD;
    for (const v of this.game.vehicles.list) {
      if (v.kind !== 'air' || v.destroyed) continue;
      const d = Math.hypot(v.pos.x - x, v.pos.z - z) - v.def.len * 0.35;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  update(dt) {
    const L = this.game.vehicles.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const v = L[i];
      if (v.kind !== 'air') continue;
      v.update(dt);
      if (v.destroyed && v.wreckT <= 0 && v.sinking > 0) this.game.vehicles.remove(v);
    }
  }
}

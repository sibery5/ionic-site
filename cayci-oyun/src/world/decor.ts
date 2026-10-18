import * as THREE from 'three';
import { makeGlass, mat, wood } from './models';

// Hanın süsleri: duvar resimleri, semaver, bardak rafı, ilan panosu, saat, askılık, kilim, tavan vantilatörü, afiş.
// Hepsi kodla ve canvas dokularıyla üretilir.

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function tex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cyl(rt: number, rb: number, h: number, m: THREE.Material, seg = 12, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

export type PaintingKind = 'galata' | 'vapur' | 'lale' | 'eski' | 'portre';
const paintCache = new Map<string, THREE.Texture>();

/** Duvar resmi dokusu. */
export function paintingTexture(kind: PaintingKind): THREE.Texture {
  const hit = paintCache.get(kind);
  if (hit) return hit;
  const [c, ctx] = canvas(256, 200);
  const W = 256;
  const H = 200;
  if (kind === 'galata') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0f1a3a');
    g.addColorStop(1, '#3a3a6a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f2e6b0';
    for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * W, Math.random() * H * 0.6, 1.5, 1.5);
    ctx.beginPath();
    ctx.arc(200, 40, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#141822';
    ctx.fillRect(0, 150, W, 50);
    for (let i = 0; i < 9; i++) ctx.fillRect(i * 30 - 5, 130 + ((i * 17) % 20), 26, 40);
    // kule
    ctx.fillRect(110, 60, 36, 100);
    ctx.beginPath();
    ctx.moveTo(104, 62);
    ctx.lineTo(128, 18);
    ctx.lineTo(152, 62);
    ctx.fill();
    ctx.fillStyle = '#ffd36a';
    for (let y = 80; y < 150; y += 18) for (const x of [116, 132]) ctx.fillRect(x, y, 6, 9);
  } else if (kind === 'vapur') {
    ctx.fillStyle = '#9fd3e8';
    ctx.fillRect(0, 0, W, 110);
    ctx.fillStyle = '#2d6a8a';
    ctx.fillRect(0, 110, W, 90);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(60, 92, 130, 26);
    ctx.fillStyle = '#1e2a3a';
    ctx.fillRect(60, 112, 130, 8);
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(90, 72, 70, 22);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(118, 50, 14, 24);
    ctx.fillStyle = '#222';
    ctx.fillRect(118, 46, 14, 6);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const x = 30 + i * 55;
      const y = 30 + (i % 2) * 14;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 6, y - 6, x + 12, y);
      ctx.quadraticCurveTo(x + 18, y - 6, x + 24, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 12; i++) ctx.fillRect(Math.random() * W, 125 + Math.random() * 70, 18, 2);
  } else if (kind === 'lale') {
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, 0, W, H);
    for (let gx = 0; gx < 4; gx++)
      for (let gy = 0; gy < 3; gy++) {
        const x = 32 + gx * 64;
        const y = 34 + gy * 66;
        ctx.fillStyle = '#1e4a8a';
        ctx.beginPath();
        ctx.arc(x, y, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f4f1ea';
        ctx.beginPath();
        ctx.arc(x, y, 21, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#b3261e';
        ctx.beginPath();
        ctx.moveTo(x - 9, y + 2);
        ctx.quadraticCurveTo(x - 10, y - 14, x - 4, y - 12);
        ctx.lineTo(x, y - 18);
        ctx.lineTo(x + 4, y - 12);
        ctx.quadraticCurveTo(x + 10, y - 14, x + 9, y + 2);
        ctx.quadraticCurveTo(x, y + 8, x - 9, y + 2);
        ctx.fill();
        ctx.strokeStyle = '#2f7a4a';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x, y + 5);
        ctx.lineTo(x, y + 18);
        ctx.stroke();
      }
  } else {
    // sepya fotoğraf: hanın cephesi ya da bıyıklı bir usta
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#d8c39a');
    g.addColorStop(1, '#a88a5c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(70,45,20,0.85)';
    if (kind === 'eski') {
      ctx.fillRect(40, 40, 176, 150);
      ctx.fillStyle = '#d8c39a';
      for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) ctx.fillRect(52 + k * 27, 52 + r * 32, 16, 20);
      ctx.fillStyle = 'rgba(70,45,20,0.85)';
      ctx.font = 'bold 22px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('1923', 128, 30);
    } else {
      ctx.beginPath();
      ctx.arc(128, 80, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(68, 120, 120, 80);
      ctx.fillStyle = '#d8c39a';
      ctx.fillRect(108, 92, 40, 6); // bıyık boşluğu yerine ışık
    }
    // eskime
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(255,240,210,${Math.random() * 0.15})`;
      ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
  }
  const t = tex(c);
  paintCache.set(kind, t);
  return t;
}

/** Çerçeveli duvar resmi (duvara yaslanır: +z yönüne bakar). */
export function makeFrame(kind: PaintingKind, w = 0.7): THREE.Group {
  const g = new THREE.Group();
  const h = w * 0.78;
  const frame = mat(kind === 'eski' || kind === 'portre' ? 0x3a2414 : 0xb08a3a, { rough: 0.5, metal: kind === 'eski' || kind === 'portre' ? 0 : 0.4 });
  g.add(box(w + 0.08, h + 0.08, 0.04, frame));
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: paintingTexture(kind), roughness: 0.75 }));
  pic.position.z = 0.022;
  g.add(pic);
  return g;
}

/** Semaver: pirinç, buhar çıkan büyük çaydanlık. */
export function makeSemaver(): THREE.Group {
  const g = new THREE.Group();
  const brass = mat(0xd4a83a, { rough: 0.3, metal: 0.9, flat: false });
  g.add(cyl(0.12, 0.16, 0.06, brass, 16, 0, 0.03, 0));
  g.add(cyl(0.05, 0.08, 0.1, brass, 12, 0, 0.11, 0));
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), brass);
  body.scale.y = 1.3;
  body.position.y = 0.36;
  body.castShadow = true;
  g.add(body);
  g.add(cyl(0.07, 0.1, 0.08, brass, 12, 0, 0.6, 0));
  // üstteki demlik
  const pot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), mat(0xf4f1ea, { rough: 0.3, flat: false }));
  pot.position.y = 0.7;
  pot.scale.y = 0.85;
  g.add(pot);
  g.add(cyl(0.015, 0.015, 0.03, mat(0xb3261e), 8, 0, 0.78, 0));
  // musluk ve kulplar
  const tap = cyl(0.015, 0.015, 0.12, brass, 6, 0.18, 0.26, 0);
  tap.rotation.z = Math.PI / 2;
  g.add(tap);
  for (const s of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 6, 10, Math.PI), brass);
    handle.position.set(0, 0.5, s * 0.17);
    handle.rotation.y = Math.PI / 2;
    g.add(handle);
  }
  g.userData.steam = new THREE.Vector3(0, 0.8, 0);
  return g;
}

/** Duvar rafı: sıra sıra ince belli bardaklar ve tabaklar. */
export function makeGlassShelf(w = 1.2): THREE.Group {
  const g = new THREE.Group();
  for (const y of [1.25, 1.6]) {
    g.add(box(w, 0.03, 0.22, wood(), 0, y, 0));
    const n = Math.floor(w / 0.11);
    for (let i = 0; i < n; i++) {
      const gl = makeGlass(i % 4 === 0 ? 'demli' : 'acik');
      gl.tea.visible = i % 4 === 0;
      gl.group.position.set(-w / 2 + 0.06 + i * 0.11, y + 0.015, 0);
      g.add(gl.group);
    }
  }
  for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) g.add(box(0.03, 0.12, 0.2, wood(), x, 1.19, 0));
  return g;
}

/** İlan panosu: renkli notlar ve iğneler. Bir tanesi "Han toplantısı" afişi. */
export function makeNoticeBoard(lang: 'tr' | 'en'): THREE.Group {
  const [c, ctx] = canvas(256, 180);
  ctx.fillStyle = '#b08a5a';
  ctx.fillRect(0, 0, 256, 180);
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(80,50,20,${Math.random() * 0.25})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 180, 2, 2);
  }
  const notes: [number, number, number, number, string, string][] = [
    [14, 14, 90, 70, '#fff6a8', lang === 'tr' ? 'KAYIP KEDİ?\nPaşa değil,\nbaşka kedi' : 'LOST CAT?\nNot Paşa,\nanother cat'],
    [118, 10, 124, 86, '#f4f1ea', lang === 'tr' ? 'HAN TOPLANTISI\nCuma 18:00\nTeras' : 'HAN MEETING\nFriday 6 pm\nRooftop'],
    [20, 96, 100, 70, '#cfe8ff', lang === 'tr' ? 'Kiralık ofis\nKat 3' : 'Office to let\nFloor 3'],
    [134, 106, 104, 62, '#ffd6d6', lang === 'tr' ? 'Asansör\nbozuk.\nYine.' : 'Lift is\nbroken.\nAgain.'],
  ];
  for (const [x, y, w, h, col, text] of notes) {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((Math.random() - 0.5) * 0.12);
    ctx.fillStyle = col;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = '#2a1a10';
    ctx.font = 'bold 12px Georgia, serif';
    ctx.textAlign = 'center';
    text.split('\n').forEach((l, i, arr) => ctx.fillText(l, 0, -((arr.length - 1) * 14) / 2 + i * 14 + 4));
    ctx.fillStyle = '#b3261e';
    ctx.beginPath();
    ctx.arc(0, -h / 2 + 6, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const g = new THREE.Group();
  g.add(box(1.04, 0.74, 0.04, wood()));
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.66), new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.9 }));
  p.position.z = 0.022;
  g.add(p);
  return g;
}

/** Duvar saati (yelkovan ve akrep ayrı nesneler: 'hands' adıyla döner). */
export function makeWallClock(): THREE.Group {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = '#f4f1ea';
  ctx.beginPath();
  ctx.arc(64, 64, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a1a10';
  ctx.font = 'bold 14px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.fillText(String(i), 64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48);
  }
  const g = new THREE.Group();
  g.add(cyl(0.2, 0.2, 0.05, mat(0x3a2414), 24));
  g.children[0].rotation.x = Math.PI / 2;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.18, 24), new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.6 }));
  face.position.z = 0.027;
  g.add(face);
  const hands = new THREE.Group();
  hands.name = 'hands';
  hands.position.z = 0.03;
  const hm = mat(0x111111);
  const big = box(0.012, 0.15, 0.005, hm, 0, 0.065, 0);
  const small = box(0.016, 0.1, 0.005, hm, 0, 0.045, 0);
  const bigG = new THREE.Group();
  bigG.add(big);
  bigG.name = 'minute';
  const smallG = new THREE.Group();
  smallG.add(small);
  smallG.name = 'hour';
  smallG.rotation.z = -2.1;
  hands.add(bigG, smallG);
  g.add(hands);
  return g;
}

/** Ayaklı askılık: bir palto, bir şapka. */
export function makeCoatRack(): THREE.Group {
  const g = new THREE.Group();
  const w = mat(0x3a2414, { rough: 0.6 });
  g.add(cyl(0.025, 0.03, 1.75, w, 8, 0, 0.875, 0));
  g.add(cyl(0.2, 0.22, 0.04, w, 12, 0, 0.02, 0));
  for (let i = 0; i < 4; i++) {
    const hook = cyl(0.012, 0.012, 0.18, w, 6, 0, 1.68, 0);
    hook.rotation.z = 0.9;
    hook.rotation.y = (i / 4) * Math.PI * 2;
    hook.position.set(Math.cos((i / 4) * Math.PI * 2) * 0.06, 1.68, Math.sin((i / 4) * Math.PI * 2) * 0.06);
    g.add(hook);
  }
  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 0.9, 10, 1, true), mat(0x5a4a3a, { rough: 0.9 }));
  coat.position.set(0.1, 1.15, 0);
  coat.material.side = THREE.DoubleSide;
  g.add(coat);
  const hat = cyl(0.11, 0.11, 0.08, mat(0x2a2a2a), 12, -0.08, 1.8, 0);
  g.add(hat);
  g.add(cyl(0.17, 0.17, 0.01, mat(0x2a2a2a), 14, -0.08, 1.76, 0));
  return g;
}

let kilimTex: THREE.Texture | null = null;
/** Kilim yolluğu (yere serilir). */
export function makeRug(w: number, d: number): THREE.Mesh {
  if (!kilimTex) {
    const [c, ctx] = canvas(256, 128);
    ctx.fillStyle = '#8e1d10';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#1e2a4a';
    ctx.fillRect(0, 0, 256, 14);
    ctx.fillRect(0, 114, 256, 14);
    for (let i = 0; i < 6; i++) {
      const x = 22 + i * 42;
      ctx.fillStyle = i % 2 ? '#e9cf7a' : '#f4f1ea';
      ctx.beginPath();
      ctx.moveTo(x, 64 - 30);
      ctx.lineTo(x + 18, 64);
      ctx.lineTo(x, 64 + 30);
      ctx.lineTo(x - 18, 64);
      ctx.fill();
      ctx.fillStyle = '#1e2a4a';
      ctx.beginPath();
      ctx.moveTo(x, 64 - 12);
      ctx.lineTo(x + 7, 64);
      ctx.lineTo(x, 64 + 12);
      ctx.lineTo(x - 7, 64);
      ctx.fill();
    }
    ctx.fillStyle = '#e9cf7a';
    for (let x = 4; x < 256; x += 12) {
      ctx.fillRect(x, 4, 6, 6);
      ctx.fillRect(x, 118, 6, 6);
    }
    kilimTex = tex(c);
    kilimTex.wrapS = THREE.RepeatWrapping;
  }
  const t = kilimTex.clone();
  t.repeat.set(Math.max(1, Math.round(w / 1.6)), 1);
  t.needsUpdate = true;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.006;
  m.receiveShadow = true;
  return m;
}

/** Tavan vantilatörü ('blades' adıyla döner). */
export function makeCeilingFan(): THREE.Group {
  const g = new THREE.Group();
  const m = mat(0x3a2a1a, { rough: 0.6 });
  g.add(cyl(0.012, 0.012, 0.4, mat(0x222222), 6, 0, -0.2, 0));
  g.add(cyl(0.09, 0.07, 0.1, mat(0xb08a3a, { metal: 0.5, rough: 0.4 }), 12, 0, -0.42, 0));
  const blades = new THREE.Group();
  blades.name = 'blades';
  blades.position.y = -0.45;
  for (let i = 0; i < 4; i++) {
    const b = box(0.55, 0.01, 0.12, m, 0.32, 0, 0);
    const holder = new THREE.Group();
    holder.rotation.y = (i / 4) * Math.PI * 2;
    holder.add(b);
    blades.add(holder);
  }
  g.add(blades);
  return g;
}

/** Fiyat afişi: "Çay 5₺". */
export function makePriceSign(lang: 'tr' | 'en'): THREE.Group {
  const [c, ctx] = canvas(256, 160);
  ctx.fillStyle = '#1e2a1a';
  ctx.fillRect(0, 0, 256, 160);
  ctx.strokeStyle = '#e9cf7a';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 240, 144);
  ctx.fillStyle = '#f4f1ea';
  ctx.textAlign = 'center';
  ctx.font = 'bold 30px Georgia, serif';
  ctx.fillText(lang === 'tr' ? 'ÇAY OCAĞI' : 'TEA STOVE', 128, 50);
  ctx.font = '22px Georgia, serif';
  ctx.fillStyle = '#e9cf7a';
  ctx.fillText(lang === 'tr' ? 'Çay ........ 5₺' : 'Tea ........ 5₺', 128, 90);
  ctx.fillText(lang === 'tr' ? 'Açık çay .. 5₺' : 'Light tea .. 5₺', 128, 120);
  const g = new THREE.Group();
  g.add(box(0.86, 0.56, 0.03, mat(0x3a2414)));
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.8, emissive: new THREE.Color(0x222211), emissiveIntensity: 0.3 }));
  p.position.z = 0.017;
  g.add(p);
  return g;
}

/** Ocak anahtarı (sondaki sahne için): pirinç anahtar ve kırmızı kurdele. */
export function makeKey(): THREE.Group {
  const g = new THREE.Group();
  const brass = mat(0xe0b040, { rough: 0.3, metal: 0.9, flat: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 8, 16), brass);
  g.add(ring);
  g.add(box(0.012, 0.12, 0.012, brass, 0, -0.1, 0));
  g.add(box(0.03, 0.012, 0.012, brass, 0.015, -0.14, 0));
  g.add(box(0.025, 0.012, 0.012, brass, 0.012, -0.115, 0));
  const ribbon = box(0.02, 0.08, 0.004, mat(0xb3261e), 0, 0.07, 0);
  g.add(ribbon);
  return g;
}

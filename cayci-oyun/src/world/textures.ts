import * as THREE from 'three';
import { drawIcon, type IconName } from '../ui/icons';

// Canvas ile üretilen dokular. Hiçbir görsel dosya indirilmedi.

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function tex(c: HTMLCanvasElement, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = 4;
  return t;
}

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/** Karaköy han mozaiği: krem ve kiremit karolar, ortada küçük baklava. */
export function floorTexture(theme: 'han' | 'teras') {
  const [c, ctx] = canvas(256, 256);
  if (theme === 'han') {
    const a = '#efe6d2';
    const b = '#b5543a';
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) {
        ctx.fillStyle = (x + y) % 2 ? b : a;
        ctx.fillRect(x * 128, y * 128, 128, 128);
      }
    ctx.fillStyle = '#2f3b4a';
    for (const [cx, cy] of [
      [128, 128],
      [0, 0],
      [256, 0],
      [0, 256],
      [256, 256],
    ]) {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 22);
      ctx.lineTo(cx + 22, cy);
      ctx.lineTo(cx, cy + 22);
      ctx.lineTo(cx - 22, cy);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(60,40,30,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 256; i += 128) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#cfc4b0';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(80,70,60,0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 252, 124);
    ctx.strokeRect(2, 128, 124, 126);
    ctx.strokeRect(128, 128, 126, 126);
  }
  grain(ctx, 256, 256, 18);
  return tex(c);
}

export function plasterTexture(color = '#f2e3c2') {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 128, 128);
  grain(ctx, 128, 128, 10);
  return tex(c);
}

export function woodTexture() {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = '#6b4226';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(${40 + Math.random() * 30},${20 + Math.random() * 20},10,0.35)`;
    ctx.beginPath();
    const y = Math.random() * 128;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(40, y + Math.random() * 6 - 3, 90, y + Math.random() * 6 - 3, 128, y);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let x = 0; x < 128; x += 32) ctx.fillRect(x, 0, 2, 128);
  return tex(c);
}

/** Buzlu camlı kapı tabelası. */
export function signTexture(title: string, sub = '') {
  const [c, ctx] = canvas(512, 160);
  ctx.fillStyle = '#1e2a3a';
  ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = '#c9a54a';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 144);
  ctx.fillStyle = '#e9cf7a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 54;
  ctx.font = `bold ${size}px Georgia, serif`;
  while (ctx.measureText(title).width > 460 && size > 20) {
    size -= 2;
    ctx.font = `bold ${size}px Georgia, serif`;
  }
  ctx.fillText(title, 256, sub ? 66 : 82);
  if (sub) {
    ctx.font = 'italic 26px Georgia, serif';
    ctx.fillStyle = '#cdb98a';
    ctx.fillText(sub, 256, 118);
  }
  return tex(c, false);
}

export function wetSignTexture(lang: 'tr' | 'en') {
  const [c, ctx] = canvas(128, 192);
  ctx.fillStyle = '#f2c230';
  ctx.fillRect(0, 0, 128, 192);
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, 120, 184);
  ctx.fillStyle = '#222';
  ctx.textAlign = 'center';
  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.fillText(lang === 'tr' ? 'DİKKAT' : 'CAUTION', 64, 32);
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.fillText(lang === 'tr' ? 'KAYGAN ZEMİN' : 'WET FLOOR', 64, 172);
  // kayan adam
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(70, 62, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(64, 74);
  ctx.lineTo(54, 110);
  ctx.lineTo(80, 128);
  ctx.moveTo(54, 110);
  ctx.lineTo(36, 132);
  ctx.moveTo(62, 84);
  ctx.lineTo(88, 80);
  ctx.moveTo(62, 84);
  ctx.lineTo(40, 92);
  ctx.stroke();
  ctx.fillRect(20, 140, 90, 5);
  return tex(c, false);
}

/** Müşterinin üstündeki sipariş balonu. kind: normal / vip (altın) / rush (kırmızı, acele). */
export type BubbleKind = 'normal' | 'vip' | 'rush' | 'gossip';

/** Sipariş balonu. gossip: mor balon, kulak ve sorulan konunun işareti ("dedikodu var mı?") */
export function bubbleTexture(items: string[], urgency: number, kind: BubbleKind = 'normal', topicIcon = '') {
  const [c, ctx] = canvas(320, 140);
  ctx.clearRect(0, 0, 320, 140);
  const fill = kind === 'vip' ? '#fff1c4' : kind === 'rush' ? '#ffe0d8' : kind === 'gossip' ? '#efe2ff' : '#fffaf0';
  const stroke = kind === 'vip' ? '#c9a54a' : urgency > 0.75 || kind === 'rush' ? '#b3261e' : kind === 'gossip' ? '#6b3fa0' : '#3a2a1a';
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = kind === 'normal' ? 6 : 9;
  ctx.beginPath();
  ctx.roundRect(8, 8, 304, 96, 28);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(142, 102);
  ctx.lineTo(160, 132);
  ctx.lineTo(178, 102);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const n = items.length;
  const gap = Math.min(52, 240 / Math.max(1, n));
  const x0 = 160 - ((n - 1) * gap) / 2 + (kind === 'normal' ? 0 : kind === 'gossip' ? 40 : 14);
  const sc = Math.min(1, gap / 50);
  items.forEach((type, i) => {
    ctx.save();
    const x = x0 + i * gap;
    ctx.translate(x, 56);
    ctx.scale(sc, sc);
    ctx.translate(-x, -56);
    drawGlassIcon(ctx, x, 56, type === 'demli' ? '#8e1d10' : '#e3a04a', 1);
    ctx.restore();
  });
  if (kind === 'gossip') {
    drawIcon(ctx, 'ear', 46, 56, 50);
    if (topicIcon) drawIcon(ctx, topicIcon as IconName, 98, 56, 42);
    ctx.fillStyle = '#6b3fa0';
    ctx.font = 'bold 30px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 126, 36);
  } else if (kind !== 'normal') {
    drawIcon(ctx, kind === 'vip' ? 'star' : 'alert', 34, 56, 44, kind === 'vip' ? {} : { ink: '#b3261e' });
  }
  return tex(c, false);
}

export function drawGlassIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string, fill: number) {
  const h = 54;
  const top = cy - h / 2;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(cx - 15, top);
    ctx.quadraticCurveTo(cx - 6, top + h * 0.45, cx - 14, top + h * 0.78);
    ctx.quadraticCurveTo(cx - 13, top + h, cx, top + h);
    ctx.quadraticCurveTo(cx + 13, top + h, cx + 14, top + h * 0.78);
    ctx.quadraticCurveTo(cx + 6, top + h * 0.45, cx + 15, top);
    ctx.closePath();
  };
  ctx.save();
  path();
  ctx.clip();
  ctx.fillStyle = 'rgba(220,235,240,0.6)';
  ctx.fillRect(cx - 20, top, 40, h);
  ctx.fillStyle = color;
  const fh = h * 0.86 * fill;
  ctx.fillRect(cx - 20, top + h - fh, 40, fh);
  ctx.restore();
  path();
  ctx.strokeStyle = '#3a2a1a';
  ctx.lineWidth = 3;
  ctx.stroke();
}

export function skyTexture() {
  const [c, ctx] = canvas(16, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#5d8fc4');
  g.addColorStop(0.55, '#a9c8e0');
  g.addColorStop(0.8, '#f2d7a8');
  g.addColorStop(1, '#e8b680');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  const t = tex(c, false);
  return t;
}

/** Yumuşak yuvarlak parçacık (buhar). */
export function softDot() {
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return tex(c, false);
}

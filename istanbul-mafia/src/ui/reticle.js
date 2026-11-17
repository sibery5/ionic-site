// [savaş nişan] Nişangâh ve dürbün katmanı (A2). Tek tuval; yalnız değer değişince yeniden çizilir.
//  - Açıklık gerçek sapmayı gösterir (silahın anlık sapması -> ekran pikseli, görüş açısına göre).
//  - Tüfek/tabanca: dört çizgi + nokta; pompalı: saçma halkası; düşman üstünde kırmızı, hava hedefinde turuncu.
//  - Keskin nişancı (dürbün): siyah çerçeve, mil-nokta artı, kalın dış direkler, kırmızı merkez, mercek gölgesi.
import * as THREE from 'three';
const _pv = new THREE.Vector3();
const COL = { base: '#f4f4f4', enemy: '#ff3b30', air: '#ffa21a' };

export class Reticle {
  constructor(game) {
    this.game = game;
    const c = this.cv = document.createElement('canvas');
    c.id = 'reticle';
    Object.assign(c.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '5' });
    document.body.appendChild(c);
    this.ctx = c.getContext('2d');
    this.key = '';
    this.state = { gap: 0, mode: 'none', color: '', alpha: 0, zoom: 1 };
    const old = document.getElementById('xhair'); // eski CSS nişangâhı (ui.js) devre dışı
    if (old) old.style.display = 'none';
  }
  update() {
    const g = this.game, p = g.player, cam = g.camera;
    if (!p) return;
    const W = window.innerWidth, H = window.innerHeight;
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; this.key = ''; }
    const wd = p.wdef || {};
    const gun = wd.type === 'gun' || wd.type === 'launcher';
    const hud = !(g.settings && g.settings.hudVisible === false) && g.mode === 'playing';
    const show = hud && gun && !p.dead && !p.swimming && (p.vehicle ? p.aiming : (p.aiming || g.input.mouse.left || (p.adsK || 0) > 0.05));
    let mode = 'none';
    // [C1] silaha göre: tabanca küçük artı, pompalı halka, tüfek dinamik artı, keskin nişancı dürbün dışında nokta yok
    if (show) mode = p.scoped ? 'scope' : (wd.pellets || wd.xhair === 'ring') ? 'ring' : wd.xhair === 'scope' ? 'none' : wd.xhair === 'pistol' ? 'pistol' : 'cross';
    const S = this.state;
    // [C2] helikopter nişanı: top nişangâhı + füze kilit çerçevesi (hedef ekranda izlenir)
    if (hud && p.vehicle && p.heliAim && !p.dead) {
      mode = 'heli';
      const L = p.vehicle.lock, T = L && (L.on || L.cand);
      S.lk = 0; S.lx = 0; S.ly = 0;
      if (T && T.pos) {
        _pv.set(T.pos.x, T.pos.y + (T.r ? 0 : 0.8), T.pos.z).project(cam);
        if (_pv.z < 1) { S.lx = (_pv.x * 0.5 + 0.5) * W; S.ly = (-_pv.y * 0.5 + 0.5) * H; S.lk = L.on ? 2 : 1 + Math.min(0.99, L.k || 0); }
      }
    }
    S.mode = mode;
    if (mode !== 'none' && mode !== 'heli') {
      const fovR = (cam.fov * Math.PI / 180) / 2;
      const sp = p.spreadNow ? p.spreadNow(wd) : wd.spread || 0;
      S.gap = Math.max(3, Math.min(H * 0.3, Math.tan(sp) / Math.tan(fovR) * (H / 2)));
      const t = p.aimTarget;
      S.color = p.aimOnTarget ? COL.air : t && !t.dead && (t.faction !== 'civilian' || t.hostile) ? COL.enemy : COL.base;
      S.alpha = p.vehicle ? 1 : Math.max(0.55, Math.min(1, 0.55 + (p.adsK || 0)));
      S.zoom = p.zoomNow || 1;
      S.breath = p.holdBreath ? 1 : 0; S.stam = Math.round((p.stamina || 0) / 5); S.zr = wd.zoom2 ? [wd.zoom * 0.5, wd.zoom2 * 1.4] : null;
    }
    // [C1] isabet işareti solması
    const hk = this.hitK, hd = hk === 'kill' ? 0.55 : 0.32;
    const ha = hk ? Math.max(0, 1 - (performance.now() - this.hitAt) / 1000 / hd) : 0;
    if (hk && ha <= 0) this.hitK = null;
    S.hitA = hud ? ha : 0;
    const key = Math.round(S.hitA * 12) + (hk || '') + '|' + mode + '|' + Math.round(S.gap * 2) + '|' + S.color + '|' + Math.round(S.alpha * 20) + '|' + Math.round(S.zoom * 10) + '|' + (mode === 'scope' ? S.breath + ':' + S.stam : '') + (mode === 'heli' ? Math.round(S.lx / 2) + ',' + Math.round(S.ly / 2) + ',' + Math.round(S.lk * 20) : '');
    if (key === this.key) return;
    this.key = key;
    this.draw(W, H);
  }
  hit(kind) { this.hitK = kind; this.hitAt = performance.now(); this.hitN = (this.hitN || 0) + 1; this.key = ''; }
  drawHit(x, cx, cy) {
    const S = this.state; if (!(S.hitA > 0)) return;
    const k = this.hitK, kill = k === 'kill', r0 = kill ? 7 : 6, r1 = kill ? 17 : 13;
    x.globalAlpha = S.hitA; x.lineCap = 'round';
    for (const pass of [0, 1]) {
      x.strokeStyle = pass ? (k === 'body' ? '#ffffff' : '#ff2a1f') : 'rgba(0,0,0,0.6)';
      x.lineWidth = (kill ? 3.6 : 2) + (pass ? 0 : 2);
      x.beginPath();
      for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { x.moveTo(cx + sx * r0, cy + sy * r0); x.lineTo(cx + sx * r1, cy + sy * r1); }
      x.stroke();
    }
    x.globalAlpha = 1;
  }
  draw(W, H) {
    const x = this.ctx, S = this.state;
    x.clearRect(0, 0, W, H);
    const cx = Math.round(W / 2) + 0.5, cy = Math.round(H / 2) + 0.5;
    if (S.mode === 'none') { this.drawHit(x, cx, cy); return; }
    if (S.mode === 'heli') { this.drawHeli(x, W, H, cx, cy); this.drawHit(x, cx, cy); return; }
    if (S.mode === 'scope') { this.drawScope(x, W, H, cx, cy); this.drawHit(x, cx, cy); return; }
    x.globalAlpha = S.alpha;
    x.lineCap = 'butt';
    const pistol = S.mode === 'pistol', gap = pistol ? Math.min(S.gap, 7) : S.gap, L = pistol ? 5 : 9;
    // koyu kontur + açık çizgi (her zeminde okunur)
    for (const pass of [0, 1]) {
      x.strokeStyle = pass ? S.color : 'rgba(0,0,0,0.65)';
      x.lineWidth = pass ? 2 : 4;
      if (S.mode === 'ring') {
        x.beginPath(); x.arc(cx, cy, gap + 2, 0, Math.PI * 2); x.stroke();
        for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; x.beginPath(); x.moveTo(cx + Math.cos(a) * (gap - 3), cy + Math.sin(a) * (gap - 3)); x.lineTo(cx + Math.cos(a) * (gap + 6), cy + Math.sin(a) * (gap + 6)); x.stroke(); }
      } else {
        x.beginPath();
        x.moveTo(cx, cy - gap); x.lineTo(cx, cy - gap - L);
        x.moveTo(cx, cy + gap); x.lineTo(cx, cy + gap + L);
        x.moveTo(cx - gap, cy); x.lineTo(cx - gap - L, cy);
        x.moveTo(cx + gap, cy); x.lineTo(cx + gap + L, cy);
        x.stroke();
      }
    }
    x.fillStyle = 'rgba(0,0,0,0.65)'; x.beginPath(); x.arc(cx, cy, 2.6, 0, Math.PI * 2); x.fill();
    x.fillStyle = S.color; x.beginPath(); x.arc(cx, cy, 1.5, 0, Math.PI * 2); x.fill();
    x.globalAlpha = 1;
    this.drawHit(x, cx, cy);
  }
  drawHeli(x, W, H, cx, cy) {
    const S = this.state;
    // taret görüntüsü: köşe parantezleri, merkez artı, menzil çizgileri, tuş ipucu
    x.lineWidth = 1.5; x.strokeStyle = 'rgba(235,240,235,0.85)';
    const b = Math.min(W, H) * 0.12, c = b * 0.3;
    x.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { x.moveTo(cx + sx * b, cy + sy * (b - c)); x.lineTo(cx + sx * b, cy + sy * b); x.lineTo(cx + sx * (b - c), cy + sy * b); }
    x.moveTo(cx - 22, cy); x.lineTo(cx - 6, cy); x.moveTo(cx + 6, cy); x.lineTo(cx + 22, cy); x.moveTo(cx, cy - 22); x.lineTo(cx, cy - 6); x.moveTo(cx, cy + 6); x.lineTo(cx, cy + 22);
    x.stroke();
    x.fillStyle = 'rgba(235,240,235,0.9)'; x.beginPath(); x.arc(cx, cy, 1.6, 0, Math.PI * 2); x.fill();
    // kilit çerçevesi: arıyorken sarı, daralan kare; kilitliyken kırmızı kare + yazı
    if (S.lk > 0) {
      const on = S.lk >= 2, k = on ? 1 : S.lk - 1, r = on ? 18 : 46 - 26 * k;
      x.strokeStyle = on ? '#ff3020' : '#f2c230'; x.lineWidth = on ? 2.4 : 1.6;
      x.strokeRect(S.lx - r, S.ly - r, 2 * r, 2 * r);
      if (on) { x.beginPath(); x.moveTo(S.lx - r - 8, S.ly); x.lineTo(S.lx - r, S.ly); x.moveTo(S.lx + r, S.ly); x.lineTo(S.lx + r + 8, S.ly); x.moveTo(S.lx, S.ly - r - 8); x.lineTo(S.lx, S.ly - r); x.moveTo(S.lx, S.ly + r); x.lineTo(S.lx, S.ly + r + 8); x.stroke(); }
      x.font = '700 13px sans-serif'; x.textAlign = 'center'; x.fillStyle = on ? '#ff3020' : '#f2c230';
      x.fillText(on ? 'KİLİTLİ' : 'KİLİTLENİYOR ' + Math.round(k * 100) + '%', S.lx, S.ly - r - 10);
    }
    x.fillStyle = 'rgba(230,230,230,0.7)'; x.font = '500 12px sans-serif'; x.textAlign = 'left';
    x.fillText('Sol tık: top  ·  Q: roket (kilitliyse güdümlü füze)  ·  Hedefi 1,5 sn nişangâhta tut: kilit', 16, H - 16);
  }
  drawScope(x, W, H, cx, cy) {
    const R = H * 0.47;
    // çerçeve: dairesel mercek dışı siyah
    x.fillStyle = '#000';
    x.beginPath(); x.rect(0, 0, W, H); x.arc(cx, cy, R, 0, Math.PI * 2, true); x.fill();
    // mercek kenarı gölgesi + hafif mavi yansıma
    const gr = x.createRadialGradient(cx, cy, R * 0.72, cx, cy, R);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.85, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0.9)');
    x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
    const gl = x.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    gl.addColorStop(0, 'rgba(120,170,255,0.06)'); gl.addColorStop(0.5, 'rgba(0,0,0,0)'); gl.addColorStop(1, 'rgba(255,200,120,0.04)');
    x.fillStyle = gl; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
    // ince artı + kalın dış direkler
    x.strokeStyle = '#050505'; x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(cx - R, cy); x.lineTo(cx + R, cy); x.moveTo(cx, cy - R); x.lineTo(cx, cy + R); x.stroke();
    x.lineWidth = 5;
    x.beginPath();
    x.moveTo(cx - R, cy); x.lineTo(cx - R * 0.42, cy); x.moveTo(cx + R * 0.42, cy); x.lineTo(cx + R, cy);
    x.moveTo(cx, cy + R); x.lineTo(cx, cy + R * 0.42); x.moveTo(cx, cy - R); x.lineTo(cx, cy - R * 0.62);
    x.stroke();
    // mil noktaları (yükseklik/rüzgâr payı)
    x.fillStyle = '#050505';
    const md = R * 0.065;
    for (let k = 1; k <= 5; k++) for (const [dx, dy] of [[k, 0], [-k, 0], [0, k], [0, -k]]) { x.beginPath(); x.ellipse(cx + dx * md, cy + dy * md, dy ? 2.4 : 1.6, dy ? 1.6 : 2.4, 0, 0, Math.PI * 2); x.fill(); }
    // alt düşüş çizgileri
    x.lineWidth = 1;
    for (let k = 1; k <= 3; k++) { const y = cy + k * md * 1.5, w = md * (1.2 - k * 0.25); x.beginPath(); x.moveTo(cx - w, y); x.lineTo(cx + w, y); x.stroke(); }
    // merkez: kırmızı nokta
    x.fillStyle = this.state.color === COL.base ? '#e8231b' : this.state.color;
    x.beginPath(); x.arc(cx, cy, 2, 0, Math.PI * 2); x.fill();
    // büyütme yazısı
    x.fillStyle = 'rgba(230,230,230,0.75)'; x.font = '600 13px sans-serif'; x.textAlign = 'right';
    x.fillText('×' + this.state.zoom.toFixed(1), cx + R * 0.68, cy + R * 0.72);
    // [C2] GTA tarzı: sağda dikey yakınlaştırma çubuğu, altta nefes göstergesi ve tuş ipucu (siyah çerçeve üstünde)
    const S = this.state, zr = S.zr;
    if (zr) {
      const bx = cx + R + Math.min(60, (W / 2 - R) * 0.4), by0 = cy + R * 0.4, by1 = cy - R * 0.4;
      const k = Math.max(0, Math.min(1, Math.log(S.zoom / zr[0]) / Math.log(zr[1] / zr[0])));
      x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 2; x.beginPath(); x.moveTo(bx, by0); x.lineTo(bx, by1); x.stroke();
      for (let i = 0; i <= 4; i++) { const y = by0 + (by1 - by0) * i / 4; x.beginPath(); x.moveTo(bx - 5, y); x.lineTo(bx + 5, y); x.stroke(); }
      x.fillStyle = '#f2c230'; const y = by0 + (by1 - by0) * k; x.fillRect(bx - 9, y - 2, 18, 4);
    }
    const st = Math.min(1, S.stam / 20), aw = R * 0.5, ay = cy + R + Math.min(26, (H / 2 - R) * 0.6 + 6);
    if (ay < H - 4) {
      x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(cx - aw / 2, ay - 2, aw, 4);
      x.fillStyle = S.breath ? '#7ec8ff' : 'rgba(255,255,255,0.7)'; x.fillRect(cx - aw / 2, ay - 2, aw * st, 4);
    }
    x.fillStyle = 'rgba(230,230,230,0.6)'; x.font = '500 12px sans-serif'; x.textAlign = 'left';
    x.fillText('Teker: yakınlaştır  ·  Shift: nefesini tut', 16, H - 16);
  }
}

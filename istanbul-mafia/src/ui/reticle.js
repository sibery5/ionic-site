// [savaş nişan] Nişangâh ve dürbün katmanı (A2). Tek tuval; yalnız değer değişince yeniden çizilir.
//  - Açıklık gerçek sapmayı gösterir (silahın anlık sapması -> ekran pikseli, görüş açısına göre).
//  - Tüfek/tabanca: dört çizgi + nokta; pompalı: saçma halkası; düşman üstünde kırmızı, hava hedefinde turuncu.
//  - Keskin nişancı (dürbün): siyah çerçeve, mil-nokta artı, kalın dış direkler, kırmızı merkez, mercek gölgesi.
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
    if (show) mode = p.scoped ? 'scope' : wd.pellets ? 'ring' : 'cross';
    const S = this.state;
    S.mode = mode;
    if (mode !== 'none') {
      const fovR = (cam.fov * Math.PI / 180) / 2;
      const sp = p.spreadNow ? p.spreadNow(wd) : wd.spread || 0;
      S.gap = Math.max(3, Math.min(H * 0.3, Math.tan(sp) / Math.tan(fovR) * (H / 2)));
      const t = p.aimTarget;
      S.color = p.aimOnTarget ? COL.air : t && !t.dead && (t.faction !== 'civilian' || t.hostile) ? COL.enemy : COL.base;
      S.alpha = p.vehicle ? 1 : Math.max(0.55, Math.min(1, 0.55 + (p.adsK || 0)));
      S.zoom = p.zoomNow || 1;
    }
    const key = mode + '|' + Math.round(S.gap * 2) + '|' + S.color + '|' + Math.round(S.alpha * 20) + '|' + Math.round(S.zoom * 10);
    if (key === this.key) return;
    this.key = key;
    this.draw(W, H);
  }
  draw(W, H) {
    const x = this.ctx, S = this.state;
    x.clearRect(0, 0, W, H);
    if (S.mode === 'none') return;
    const cx = Math.round(W / 2) + 0.5, cy = Math.round(H / 2) + 0.5;
    if (S.mode === 'scope') { this.drawScope(x, W, H, cx, cy); return; }
    x.globalAlpha = S.alpha;
    x.lineCap = 'butt';
    const gap = S.gap, L = 9;
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
  }
}

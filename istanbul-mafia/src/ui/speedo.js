// [A2] Yuvarlak araç göstergesi (Canvas 2D): hız ibresi + ölçek, devir yayı, vites (P/R/N/1-6).
// İki katman: ölçek (araç değişince bir kez çizilir) ve ibre/yay/vites (yalnız nicelenmiş değer değişince).
// İnce modern çizgi: koyu cam zemin, beyaz ölçek, kehribar ışık, kırmızı bölge. Marka/logo yok.
const SIZE = 210, R = SIZE / 2, A0 = Math.PI * 0.75, SWEEP = Math.PI * 1.5;

export class Speedo {
  constructor(parent) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const mk = (z) => {
      const c = document.createElement('canvas');
      c.width = c.height = Math.round(SIZE * this.dpr);
      c.style.cssText = `position:absolute;left:0;top:0;width:${SIZE}px;height:${SIZE}px;z-index:${z}`;
      return c;
    };
    this.el = document.createElement('div');
    this.el.className = 'speedo-dial';
    this.el.style.cssText = `position:relative;width:${SIZE}px;height:${SIZE}px;margin-left:auto`;
    this.bg = mk(0); this.fg = mk(1);
    this.el.append(this.bg, this.fg);
    parent.prepend(this.el);
    this.bx = this.bg.getContext('2d'); this.fx = this.fg.getContext('2d');
    this.max = 0; this.key = -1;
  }
  // ölçek: azami hız 20'nin katına yuvarlanır, ana çizgi her 20 (240 üstü 40) km/s
  drawScale(maxKmh) {
    const c = this.bx, d = this.dpr;
    this.max = maxKmh;
    c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, SIZE, SIZE);
    // koyu cam zemin
    const gr = c.createRadialGradient(R, R * 0.8, 10, R, R, R);
    gr.addColorStop(0, 'rgba(28,32,38,0.82)'); gr.addColorStop(1, 'rgba(6,8,10,0.86)');
    c.fillStyle = gr; c.beginPath(); c.arc(R, R, R - 2, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 1; c.stroke();
    c.strokeStyle = 'rgba(255,190,90,0.18)'; c.beginPath(); c.arc(R, R, R - 6, 0, Math.PI * 2); c.stroke();
    const major = maxKmh > 240 ? 40 : 20, minor = major / 4;
    const red = maxKmh * 0.88;
    // kırmızı bölge
    c.strokeStyle = 'rgba(230,40,30,0.75)'; c.lineWidth = 3;
    c.beginPath(); c.arc(R, R, R - 16, A0 + SWEEP * (red / maxKmh), A0 + SWEEP); c.stroke();
    c.font = '600 12px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let s = 0; s <= maxKmh + 0.01; s += minor) {
      const a = A0 + SWEEP * (s / maxKmh), ca = Math.cos(a), sa = Math.sin(a);
      const big = Math.abs(s / major - Math.round(s / major)) < 1e-3;
      const r0 = R - 12, r1 = big ? R - 24 : R - 18;
      c.strokeStyle = s >= red ? 'rgba(255,90,70,0.95)' : big ? 'rgba(245,245,245,0.95)' : 'rgba(220,220,220,0.5)';
      c.lineWidth = big ? 1.6 : 1;
      c.beginPath(); c.moveTo(R + ca * r0, R + sa * r0); c.lineTo(R + ca * r1, R + sa * r1); c.stroke();
      if (big) { c.fillStyle = s >= red ? '#ff7a60' : '#f0f0f0'; c.fillText(String(s), R + ca * (R - 36), R + sa * (R - 36)); }
    }
    // devir yayının zemini (iç, ince)
    c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 4;
    c.beginPath(); c.arc(R, R, R - 50, A0, A0 + SWEEP); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.45)'; c.font = '500 9px system-ui, sans-serif';
    c.fillText('x1000 d/dk', R, R + 72);
    c.fillText('km/s', R, R + 50);
  }
  // veh: araç; her karede çağrılır, değer değişmezse çizmez
  update(veh) {
    const maxKmh = Math.max(60, Math.ceil(veh.def.maxSpeed * 3.6 * 1.1 / 20) * 20);
    if (maxKmh !== this.max) { this.drawScale(maxKmh); this.key = -1; }
    const kmh = Math.abs(veh.fs || 0) * 3.6, rpm = Math.max(0, Math.min(1.05, veh.rpm || 0));
    const c = veh.controls || {};
    let gear;
    if ((veh.fs || 0) < -0.5) gear = 'R';
    else if (kmh < 1 && c.handbrake) gear = 'P';
    else if (kmh < 1 && !(c.throttle > 0)) gear = 'N';
    else gear = String((veh.gear || 0) + 1);
    const gi = gear === 'R' ? 0 : gear === 'P' ? 1 : gear === 'N' ? 2 : 3 + (veh.gear || 0);
    const k = Math.round(kmh * 2) * 10000 + Math.round(rpm * 120) * 20 + gi;
    if (k === this.key) return;
    this.key = k;
    const x = this.fx, d = this.dpr;
    x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, SIZE, SIZE);
    // devir yayı (kehribar; 0.85 üstü kırmızı)
    x.lineCap = 'round';
    x.strokeStyle = rpm > 0.85 ? '#ff4a32' : '#ffb347'; x.lineWidth = 4;
    x.shadowColor = x.strokeStyle; x.shadowBlur = 6;
    x.beginPath(); x.arc(R, R, R - 50, A0, A0 + SWEEP * Math.min(1, rpm)); x.stroke();
    // ibre
    const a = A0 + SWEEP * Math.min(1.02, kmh / this.max), ca = Math.cos(a), sa = Math.sin(a);
    x.strokeStyle = '#ff6a3a'; x.lineWidth = 2.2; x.shadowBlur = 8;
    x.beginPath(); x.moveTo(R - ca * 10, R - sa * 10); x.lineTo(R + ca * (R - 16), R + sa * (R - 16)); x.stroke();
    x.shadowBlur = 0;
    x.fillStyle = '#15181c'; x.strokeStyle = 'rgba(255,255,255,0.4)'; x.lineWidth = 1;
    x.beginPath(); x.arc(R, R, 6, 0, Math.PI * 2); x.fill(); x.stroke();
    // dijital hız ve vites
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#f4f4f4'; x.font = '700 30px system-ui, sans-serif';
    x.fillText(String(Math.round(kmh)), R, R + 31, 80);
    x.font = '700 22px system-ui, sans-serif';
    x.fillStyle = gear === 'R' ? '#ff6a50' : '#ffb347';
    x.strokeStyle = 'rgba(255,179,71,0.45)'; x.lineWidth = 1;
    x.strokeRect(R - 14, R - 50, 28, 28); x.fillText(gear, R, R - 35);
  }
}

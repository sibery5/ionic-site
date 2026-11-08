// [kanun] Trafik ihlali: kırmızı ışıkta geçiş kovalamaca başlatmaz; elektronik denetim kaydı telefona
// "Kırmızı ışık ihlali — ₺… ceza" bildirimi olarak düşer ve para kesilir (nakit yetmezse bankadan).
import { formatMoney } from '../core/util.js';

export const RED_LIGHT_FINE = 1500;

export class TrafficLaw {
  constructor(game) {
    this.g = game;
    this.t = 0;
    this.inBox = null; // içinde bulunulan kavşak düğümü
    this.prev = null; // kavşağa girmeden önceki son konum
    this.cool = 0;
    this.fines = 0;
  }
  update(dt) {
    const g = this.g, p = g.player, v = p.vehicle;
    if (this.cool > 0) this.cool -= dt;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.1;
    if (!v || v.kind !== 'car' || p.inInterior || !g.traffic || !g.traffic.hasLight) { this.inBox = null; this.prev = null; return; }
    const node = g.map.nearestNode(v.pos.x, v.pos.z);
    if (!node || !g.traffic.hasLight(node)) { this.inBox = null; this.prev = { x: v.pos.x, z: v.pos.z }; return; }
    let half = 6; for (const e of node.edges) half = Math.max(half, e.width / 2);
    const inside = Math.abs(v.pos.x - node.x) < half && Math.abs(v.pos.z - node.z) < half;
    if (inside && this.inBox !== node && this.prev) {
      // hangi koldan geldi: önceki konuma en çok bakan komşu düğüm
      const px = this.prev.x - node.x, pz = this.prev.z - node.z, pl = Math.hypot(px, pz) || 1;
      let from = null, bd = -2;
      for (const e of node.edges) {
        const o = g.map.other(e, node), ox = o.x - node.x, oz = o.z - node.z, ol = Math.hypot(ox, oz) || 1;
        const dot = (ox * px + oz * pz) / (ol * pl);
        if (dot > bd) { bd = dot; from = o; }
      }
      const toward = (v.vx * -px + v.vz * -pz) / pl;
      if (from && bd > 0.7 && toward > 3 && g.traffic.lightState(node, from) === 'red') this.violation(v);
    }
    this.inBox = inside ? node : null;
    if (!inside) this.prev = { x: v.pos.x, z: v.pos.z };
  }
  violation(v) {
    const g = this.g, s = g.state;
    if (this.cool > 0 || (v.sirenOn && (v.type === 'police' || v.type === 'polsuv' || v.type === 'ambulans' || v.type === 'swat'))) return;
    this.cool = 20;
    const fine = RED_LIGHT_FINE;
    const cash = Math.min(s.money, fine);
    s.money -= cash;
    if (fine > cash) s.bank = Math.max(0, (s.bank || 0) - (fine - cash));
    this.fines++;
    if (g.wanted.lawLog) g.wanted.lawLog.fines++;
    const text = `Kırmızı ışık ihlali — ${formatMoney(fine)} ceza`;
    if (g.ui.phoneNotify) g.ui.phoneNotify('Trafik Denetim', text);
    else this.toast('Trafik Denetim', text);
    if (g.audio.tone) g.audio.tone({ freq: 1320, dur: 0.12, type: 'sine', gain: 0.06 });
  }
  // telefon bildirimi (arayüz ekibi kendi bileşenini sağlamadıysa): sağ üstte kısa süreli kart
  toast(title, text) {
    if (typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.className = 'law-phone-toast';
    el.style.cssText = 'position:fixed;top:18px;right:18px;z-index:60;width:270px;padding:10px 12px;border-radius:14px;background:rgba(18,20,26,0.92);color:#eef;font:13px/1.35 sans-serif;box-shadow:0 6px 22px rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.08);transition:opacity .4s,transform .4s;transform:translateY(-8px);opacity:0;pointer-events:none';
    el.innerHTML = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;opacity:.75;font-size:11px"><span style="display:inline-block;width:16px;height:16px;border-radius:4px;background:linear-gradient(160deg,#c8102e,#5a0612)"></span>${title} · şimdi</div><div style="font-weight:600">${text}</div><div style="opacity:.7;font-size:12px;margin-top:2px">Elektronik denetleme sistemi kaydı. Ceza hesabınızdan tahsil edildi.</div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'none'; });
    setTimeout(() => { el.style.opacity = '0'; }, 4200);
    setTimeout(() => el.remove(), 4800);
    this.lastToast = text;
  }
}

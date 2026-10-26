// Borsa İstanbul Mafya (BİM): kurgusal şirketler, rastgele yürüyüş fiyatları, haber şokları.
import { STOCKS, ensureLifeState } from './economy.js';
import { formatMoney } from '../core/util.js';

const HIST = 48;
const COMMISSION = 0.002;
const NEWS = [
  ['GLTEK', 0.09, 'Galata Teknoloji yerli akıllı telefonunu tanıttı!'],
  ['GLTEK', -0.08, 'Galata Teknoloji\'de veri sızıntısı skandalı.'],
  ['KRTOT', 0.07, 'Kartal Otomotiv ihracat rekoru kırdı.'],
  ['KRTOT', -0.06, 'Kartal Otomotiv 20 bin aracı geri çağırdı.'],
  ['KULEI', 0.1, 'Kule İnşaat Boğaz\'a üçüncü köprü ihalesini kazandı.'],
  ['KULEI', -0.11, 'Kule İnşaat şantiyesinde kaçak kat tespit edildi.'],
  ['HALDZ', 0.06, 'Haliç Denizcilik yeni konteyner gemileri aldı.'],
  ['HALDZ', -0.07, 'Limanda grev: Haliç Denizcilik zor durumda.'],
  ['RIZEC', 0.05, 'Rize\'de rekor çay hasadı.'],
  ['SIMIT', 0.08, 'Simitçi Gıda Avrupa\'ya açılıyor.'],
  ['SIMIT', -0.06, 'Susam fiyatları uçtu, Simitçi Gıda\'nın marjı eridi.'],
  ['LALEB', -0.05, 'Lale Bankası\'na kara para soruşturması!'],
  ['LALEB', 0.05, 'Lale Bankası faiz indirimi sonrası rekor kâr açıkladı.'],
  ['BGZHL', 0.06, 'Boğaz Holding otel zincirini satın aldı.'],
  ['BGZHL', -0.05, 'Boğaz Holding yönetim kurulunda istifa depremi.'],
];

function gauss() { return (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 1.2; }

export class Market {
  constructor(game) {
    this.game = game;
    this.tickT = 0;
    this.newsT = 40 + Math.random() * 60;
    this.lastNews = null;
  }

  get m() {
    const s = ensureLifeState(this.game.state);
    if (!s.market || !s.market.px) {
      s.market = { px: {}, open: {}, hist: {} };
      for (const st of STOCKS) {
        const p = +(st.base * (0.9 + Math.random() * 0.2)).toFixed(2);
        s.market.px[st.sym] = p; s.market.open[st.sym] = p;
        // geçmiş: bugünkü fiyatta biten rastgele yürüyüş
        const h = [p];
        for (let i = 1; i < HIST; i++) h.unshift(+(h[0] / Math.exp(st.drift + st.vol * 0.35 * gauss())).toFixed(2));
        s.market.hist[st.sym] = h;
      }
    }
    return s.market;
  }
  price(sym) { return this.m.px[sym]; }
  change(sym) { const m = this.m; return (m.px[sym] - m.open[sym]) / m.open[sym]; }
  index() {
    // BİM-30 endeksi: baz fiyata göre ortalama ×1000
    const m = this.m;
    return (STOCKS.reduce((a, st) => a + m.px[st.sym] / st.base, 0) / STOCKS.length) * 1000;
  }
  portfolio() {
    const s = this.game.state, m = this.m;
    let value = 0, cost = 0;
    for (const st of STOCKS) { const q = s.stocks.hold[st.sym] || 0; value += q * m.px[st.sym]; cost += s.stocks.cost[st.sym] || 0; }
    return { value, cost, pnl: value - cost };
  }

  update(dt) {
    const m = this.m;
    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT = 1.5;
      for (const st of STOCKS) {
        const p = m.px[st.sym];
        // ortalamaya dönüş: baz fiyattan çok uzaklaşmasın
        const pull = Math.log(st.base / p) * 0.004;
        let np = p * Math.exp(st.drift + pull + st.vol * 0.35 * gauss());
        np = Math.max(0.5, +np.toFixed(2));
        m.px[st.sym] = np;
        const h = m.hist[st.sym];
        h.push(np); if (h.length > HIST) h.shift();
      }
    }
    this.newsT -= dt;
    if (this.newsT <= 0) {
      this.newsT = 70 + Math.random() * 90;
      const [sym, k, text] = NEWS[Math.floor(Math.random() * NEWS.length)];
      m.px[sym] = +(m.px[sym] * (1 + k)).toFixed(2);
      this.lastNews = { sym, k, text, day: this.game.env.day };
      const own = (this.game.state.stocks.hold[sym] || 0) > 0;
      if (own || Math.random() < 0.35) this.game.ui.notify(`BORSA · ${sym} ${k > 0 ? '▲' : '▼'} %${Math.abs(k * 100).toFixed(0)} — ${text}`, k > 0 ? 'good' : 'warn');
    }
  }
  onNewDay() { const m = this.m; for (const st of STOCKS) m.open[st.sym] = m.px[st.sym]; }

  // al/sat: method 'cash' | 'bank'
  buy(sym, qty, method = 'bank') {
    const g = this.game, s = g.state;
    const p = this.price(sym);
    const cost = p * qty * (1 + COMMISSION);
    const key = method === 'bank' ? 'bank' : 'money';
    if (qty <= 0) return false;
    if (s[key] < cost) { g.ui.notify(method === 'bank' ? 'Banka bakiyesi yetersiz' : 'Nakit yetersiz', 'warn'); g.audio.error(); return false; }
    s[key] -= cost;
    s.stocks.hold[sym] = (s.stocks.hold[sym] || 0) + qty;
    s.stocks.cost[sym] = (s.stocks.cost[sym] || 0) + cost;
    g.audio.cash();
    return true;
  }
  sell(sym, qty, method = 'bank') {
    const g = this.game, s = g.state;
    const have = s.stocks.hold[sym] || 0;
    qty = Math.min(qty, have);
    if (qty <= 0) return false;
    const p = this.price(sym);
    const gross = p * qty * (1 - COMMISSION);
    const avg = (s.stocks.cost[sym] || 0) / have;
    const profit = gross - avg * qty;
    s[method === 'bank' ? 'bank' : 'money'] += gross;
    s.stocks.hold[sym] = have - qty;
    s.stocks.cost[sym] = avg * (have - qty);
    if (s.stocks.hold[sym] <= 0) { delete s.stocks.hold[sym]; delete s.stocks.cost[sym]; }
    if (profit > 0) s.legalRep += Math.floor(profit / 2500);
    g.audio.cash();
    g.ui.notify(`${qty} lot ${sym} satıldı · ${profit >= 0 ? 'Kâr' : 'Zarar'} ${formatMoney(profit)}`, profit >= 0 ? 'money' : 'warn');
    return true;
  }
  static maxBuy(game, sym, method = 'bank') {
    const s = game.state, p = game.market.price(sym);
    return Math.floor((method === 'bank' ? s.bank : s.money) / (p * (1 + COMMISSION)));
  }
}

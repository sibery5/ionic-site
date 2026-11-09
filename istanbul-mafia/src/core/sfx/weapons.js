// [ses B2] Silah sesleri: katmanlı geçici + silaha özgü karakter + mesafeye bağlı kentsel kuyruk.
// Her atış (çevrimdışı, tohumlu varyantlar) şu katmanlardan örneklenir:
//   1) mekanik: horoz/iğne tıkı (modal metal), atıştan hemen sonra sürgü/kilit geri tepmesi
//   2) çatlama: N-dalgası (namlu ağzı şok cephesi) + yüksek geçiren gürültü kıvılcımı; tüfeklerde ses üstü mermi çatlaması
//   3) gövde: alçak geçiren gürültü patlaması (süzgeç hızla kapanır) + 300-500 Hz "göğüs" bandı
//   4) gümleme: perdesi düşen sinüs (namlu gazının genleşmesi), silaha göre 70-180 Hz
//   5) gaz: bant geçiren gürültü (toplu tabancada silindir boşluğu tıslaması)
//   ardından yumuşak doyma (tanh) -> yoğun, "vurucu" ses.
// Kuyruk ayrı tamponlardır: sokak (cephelerden dönen 11 yansıma + yuvarlanan gürleme) ve oda (yoğun erken yansıma).
// Çalarken: kuru ses yakın alanda baskın (ref 6 m), kuyruk çok daha yavaş söner -> uzaktaki atış "pat + yankı" olur;
// ses hızı gecikmesi; iç mekânda oda kuyruğu, dışarıdaki atışlar duvardan boğuk gelir.
import { BQ, rng, normalize, toBuffer, modal, burst, TAU, addEcho, fadeOut } from './dsp.js';
import { play } from './voices.js';
import { addRender, addPlay } from './lab.js';

// crack: şok cephesi genliği, cw: N-dalgası genişliği (ms), cf: kıvılcım süzgeci, body: [frekans, sönüm sn, genlik],
// boom: [Hz, sönüm sn, genlik], gas: [Hz, sönüm, genlik], mech: [zaman sn, tür], len: tampon süresi,
// tail: kuyruk sınıfı, tg: kuyruk kazancı, g: genel kazanç, range: duyulma menzili (m), ss: ses üstü çatlama
const W = {
  pistol: { crack: 1.0, cw: 0.35, cf: 5500, body: [2600, 0.02, 1.1], boom: [165, 0.05, 0.85], gas: [1500, 0.025, 0.3], mech: [0.011, 'slide'], len: 0.32, tail: 'light', tg: 0.42, g: 0.85, range: 280 },
  pistol2: { crack: 1.05, cw: 0.3, cf: 6000, body: [2900, 0.018, 1.0], boom: [175, 0.045, 0.75], gas: [1700, 0.022, 0.28], mech: [0.01, 'slide'], len: 0.3, tail: 'light', tg: 0.4, g: 0.82, range: 270 },
  revolver: { crack: 1.1, cw: 0.45, cf: 4800, body: [2100, 0.03, 1.25], boom: [128, 0.075, 1.0], gas: [1250, 0.045, 0.7], mech: [0, 'none'], len: 0.42, tail: 'heavy', tg: 0.5, g: 0.95, range: 340 },
  magnum: { crack: 1.15, cw: 0.5, cf: 4500, body: [1900, 0.035, 1.35], boom: [110, 0.09, 1.15], gas: [1150, 0.05, 0.75], mech: [0, 'none'], len: 0.48, tail: 'heavy', tg: 0.55, g: 1.0, range: 380 },
  smg: { crack: 0.9, cw: 0.28, cf: 6200, body: [3000, 0.016, 0.95], boom: [180, 0.04, 0.6], gas: [1800, 0.02, 0.25], mech: [0.009, 'bolt'], len: 0.26, tail: 'light', tg: 0.34, g: 0.75, range: 240 },
  smg2: { crack: 0.85, cw: 0.25, cf: 6800, body: [3300, 0.014, 0.9], boom: [195, 0.035, 0.5], gas: [2000, 0.018, 0.22], mech: [0.008, 'bolt'], len: 0.24, tail: 'light', tg: 0.3, g: 0.7, range: 220 },
  shotgun: { crack: 0.75, cw: 0.7, cf: 3600, body: [1500, 0.05, 1.5], boom: [88, 0.12, 1.3], gas: [900, 0.07, 0.6], mech: [0, 'none'], len: 0.6, tail: 'heavy', tg: 0.6, g: 1.05, range: 340 },
  sawed: { crack: 0.8, cw: 0.8, cf: 3200, body: [1300, 0.06, 1.6], boom: [80, 0.14, 1.45], gas: [800, 0.08, 0.8], mech: [0, 'none'], len: 0.65, tail: 'heavy', tg: 0.62, g: 1.1, range: 310 },
  rifle: { crack: 1.2, cw: 0.22, cf: 7000, body: [2300, 0.028, 1.2], boom: [125, 0.07, 0.9], gas: [1600, 0.03, 0.35], mech: [0.022, 'bolt'], len: 0.42, tail: 'rifle', tg: 0.55, g: 0.95, range: 420, ss: 1 },
  ak: { crack: 1.2, cw: 0.25, cf: 6400, body: [2000, 0.03, 1.25], boom: [115, 0.075, 1.0], gas: [1400, 0.032, 0.4], mech: [0.024, 'bolt'], len: 0.42, tail: 'rifle', tg: 0.56, g: 0.95, range: 420, ss: 1 },
  lmg: { crack: 1.2, cw: 0.24, cf: 6600, body: [2150, 0.03, 1.25], boom: [118, 0.075, 0.95], gas: [1500, 0.03, 0.35], mech: [0.02, 'belt'], len: 0.42, tail: 'rifle', tg: 0.56, g: 0.95, range: 440, ss: 1 },
  dmr: { crack: 1.25, cw: 0.26, cf: 6600, body: [2000, 0.035, 1.3], boom: [105, 0.09, 1.1], gas: [1400, 0.035, 0.4], mech: [0.024, 'bolt'], len: 0.5, tail: 'rifle', tg: 0.62, g: 1.0, range: 500, ss: 1 },
  sniper: { crack: 1.35, cw: 0.32, cf: 6000, body: [1700, 0.045, 1.45], boom: [80, 0.14, 1.35], gas: [1200, 0.045, 0.5], mech: [0, 'none'], len: 0.6, tail: 'heavy', tg: 0.7, g: 1.05, range: 560, ss: 1.2 },
  rpg: { crack: 0.5, cw: 0.9, cf: 2500, body: [900, 0.08, 1.3], boom: [70, 0.16, 1.2], gas: [700, 0.12, 0.6], mech: [0, 'rocket'], len: 1.5, tail: 'launch', tg: 0.6, g: 1.0, range: 380 },
  gl: { crack: 0.25, cw: 0.9, cf: 2500, body: [700, 0.04, 0.8], boom: [95, 0.09, 1.3], gas: [420, 0.06, 0.6], mech: [0, 'tube'], len: 0.55, tail: 'launch', tg: 0.35, g: 0.9, range: 260 },
};
W.m4 = W.rifle;
const NV = 2; // varyant sayısı (hız/kazanç oynamasıyla birlikte yeterli çeşitlilik)

export function synthShot(sr, P, seed) {
  const R = rng(seed);
  const N = Math.floor(P.len * sr), d = new Float32Array(N);
  const t0 = 0.0015; // iğne tıkından sonra ateşleme
  const j = (k) => 1 + R.n() * k;
  // 1) horoz/iğne tıkı
  modal(d, sr, 0, [[3100 * j(0.1), 0.003, 0.25], [5200 * j(0.1), 0.002, 0.15], [7600, 0.0015, 0.1]], 0.4, R);
  // 2) şok cephesi: N-dalgası (önce basınç, sonra emme)
  const i0 = Math.floor(t0 * sr), nw = Math.max(3, Math.floor(P.cw * 0.001 * sr));
  for (let i = 0; i < nw * 2 && i0 + i < N; i++) {
    const u = i / nw;
    d[i0 + i] += P.crack * 1.6 * (u < 1 ? 1 - u * 0.4 : -(0.6 - (u - 1) * 0.6));
  }
  burst(d, sr, t0, { dur: 0.02, tau: 0.0018, f: P.cf * j(0.08), q: 0.6, type: 'hp', amp: P.crack * 1.1, R });
  if (P.ss) { // ses üstü mermi: ince, keskin ikinci çatlama + kısa metalik çınlama
    burst(d, sr, t0 + 0.0004, { dur: 0.01, tau: 0.0008, f: 8000, q: 0.7, type: 'hp', amp: 0.9 * P.ss, R });
    modal(d, sr, t0, [[2400 * j(0.1), 0.012, 0.25], [3900 * j(0.1), 0.008, 0.2]], 0.5 * P.ss, R);
  }
  // 3) gövde patlaması: süzgeç frekansı hızla kapanır
  const [bf, bt, ba] = P.body;
  {
    const F = new BQ('lp', bf * 1.6, 0.7, sr), C = new BQ('bp', 380 * j(0.1), 0.9, sr);
    const n = Math.min(N - i0, Math.floor(bt * 9 * sr));
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if ((i & 15) === 0) F.set('lp', bf * (0.25 + 1.4 * Math.exp(-t / (bt * 1.3))), 0.7);
      const nz = R.n();
      d[i0 + i] += F.p(nz) * ba * 1.6 * Math.exp(-t / bt) * Math.min(1, i / 8) + C.p(nz) * ba * 1.2 * Math.exp(-t / (bt * 1.6));
    }
  }
  // 4) gümleme: perdesi düşen sinüs
  {
    const [f0, tau, a] = P.boom, ff = f0 * j(0.06);
    let ph = 0;
    const n = Math.min(N - i0, Math.floor(tau * 7 * sr));
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      ph += TAU * ff * (0.55 + 0.45 * Math.exp(-t / 0.018)) / sr;
      d[i0 + i] += Math.sin(ph) * a * Math.exp(-t / tau) * Math.min(1, t / 0.0012);
    }
  }
  // 5) gaz
  burst(d, sr, t0 + 0.0008, { dur: P.gas[1] * 6, tau: P.gas[1], f: P.gas[0] * j(0.1), q: 0.9, type: 'bp', amp: P.gas[2] * 1.4, att: 0.002, R });
  // mekanik geri tepme
  const [mt, mk] = P.mech;
  if (mk === 'slide' || mk === 'bolt') {
    modal(d, sr, mt, [[1900 * j(0.1), 0.012, 0.3], [3300 * j(0.1), 0.008, 0.25], [5600 * j(0.1), 0.005, 0.18]], mk === 'bolt' ? 0.35 : 0.28, R);
    burst(d, sr, mt, { dur: 0.01, tau: 0.002, f: 4000, q: 1.2, type: 'bp', amp: 0.25, R });
    modal(d, sr, mt + (mk === 'bolt' ? 0.03 : 0.022), [[2600 * j(0.1), 0.008, 0.25], [4400, 0.005, 0.2]], 0.2, R);
  } else if (mk === 'belt') {
    for (let k = 0; k < 4; k++) modal(d, sr, mt + k * 0.009 * j(0.2), [[2800 * j(0.2), 0.006, 0.25], [4700 * j(0.2), 0.004, 0.2]], 0.22, R);
  } else if (mk === 'rocket') { // roket motoru: süpüren hışırtı + çıtırtı
    const F = new BQ('bp', 600, 1.2, sr), n = N - i0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if ((i & 31) === 0) F.set('bp', 600 + 2200 * Math.min(1, t / 0.6), 1.2);
      const e = Math.min(1, t / 0.05) * Math.exp(-t / 0.45);
      d[i0 + i] += F.p(R.n()) * 1.3 * e + (R() < 0.004 * e ? R.n() * 0.8 * e : 0);
    }
  } else if (mk === 'tube') {
    burst(d, sr, t0, { dur: 0.3, tau: 0.05, f: 340, q: 5, type: 'bp', amp: 1.3, R });
  }
  // yumuşak doyma: yoğunluk ve vuruculuk
  normalize(d, 1);
  const k = 2.2, kn = Math.tanh(k);
  for (let i = 0; i < N; i++) d[i] = Math.tanh(d[i] * k) / kn;
  const hp = new BQ('hp', 32, 0.7, sr); hp.run(d);
  fadeOut(d, Math.floor(0.03 * sr));
  return normalize(d, 0.95);
}

const TAIL_SR = 22050;
const TAILS = {
  light: { src: 'pistol', size: 0.8 },
  rifle: { src: 'rifle', size: 1.1 },
  heavy: { src: 'shotgun', size: 1.25 },
  launch: { src: 'gl', size: 1.1 },
};
// Sokak kuyruğu: yakın cephe, karşı cephe, sokak boyunca ardışık bloklar (gittikçe koyulaşan) + yuvarlanan gürleme
export function synthTail(kind, space, seed = 21) {
  const T = TAILS[kind] || TAILS.light, R = rng(seed);
  const sr = TAIL_SR;
  const dry = synthShot(sr, W[T.src], seed + 1);
  const street = space !== 'room';
  const N = Math.floor((street ? 2.3 * T.size : 0.75) * sr), d = new Float32Array(N);
  const taps = street
    ? [[0.034, 0.42, 5000], [0.061, 0.5, 4300], [0.094, 0.44, 3600], [0.138, 0.4, 3000], [0.19, 0.34, 2600], [0.26, 0.3, 2200], [0.34, 0.25, 1800], [0.45, 0.19, 1500], [0.58, 0.14, 1300], [0.76, 0.1, 1100], [0.98, 0.07, 900]]
    : [[0.004, 0.5, 7000], [0.007, 0.45, 6000], [0.011, 0.42, 5500], [0.015, 0.38, 5000], [0.019, 0.35, 4500], [0.024, 0.32, 4000], [0.03, 0.28, 3500], [0.037, 0.24, 3000], [0.046, 0.2, 2600], [0.058, 0.15, 2200]];
  for (const [t, g, lp] of taps) addEcho(d, dry, t * T.size * (0.92 + R() * 0.16), g * (R() < 0.5 ? 1 : 0.85), sr, lp, street ? 120 : 80);
  // dağınık gürleme
  const lp = new BQ('lp', street ? 650 : 2400, 0.6, sr), lp2 = new BQ('lp', street ? 900 : 3000, 0.6, sr);
  let am = 1, amT = 0;
  for (let i = 0; i < N; i++) {
    const t = i / sr;
    if (t > amT) { amT = t + 0.05 + R() * 0.12; am = 0.6 + R() * 0.6; } // yuvarlanma (gök gürültüsü gibi kabarıp söner)
    const env = Math.min(1, t / (street ? 0.05 : 0.008)) * Math.exp(-t / (street ? 0.5 * T.size : 0.13));
    d[i] += lp2.p(lp.p(R.n())) * env * (street ? 0.9 : 0.6) * am;
  }
  if (!street) { // oda modu: alçak "bom"
    let ph = 0; for (let i = 0; i < N; i++) { const t = i / sr; ph += TAU * 92 / sr; d[i] += Math.sin(ph) * 0.35 * Math.exp(-t / 0.11) * Math.min(1, t / 0.004); }
  }
  fadeOut(d, Math.floor(0.15 * sr));
  return normalize(d, 0.8);
}

// mekanik devamlar: pompa (pompalı), kilit (keskin nişancı), kırma (kesik namlu, bombaatar)
function synthMech(sr, kind, seed) {
  const R = rng(seed), d = new Float32Array(Math.floor(0.45 * sr));
  const clank = (t, f, a) => { modal(d, sr, t, [[f, 0.02, 0.4], [f * 1.63, 0.012, 0.3], [f * 2.71, 0.007, 0.2]], a, R); burst(d, sr, t, { dur: 0.015, tau: 0.003, f: f * 1.8, q: 1, type: 'bp', amp: a * 0.6, R }); };
  const slide = (t, dur, f) => burst(d, sr, t, { dur, tau: dur * 0.6, f, q: 1.3, type: 'bp', amp: 0.35, att: dur * 0.3, R });
  if (kind === 'pump') { clank(0, 1400, 0.8); slide(0.02, 0.08, 1100); clank(0.13, 1700, 0.9); }
  else if (kind === 'bolt') { clank(0, 2100, 0.6); slide(0.03, 0.1, 1600); clank(0.17, 2500, 0.7); slide(0.2, 0.07, 1900); clank(0.3, 2800, 0.6); }
  else { clank(0, 1200, 0.8); clank(0.1, 1500, 0.5); }
  return normalize(d, 0.8);
}

function bank(eng, key, fn) {
  const B = eng._wb || (eng._wb = {});
  return B[key] || (B[key] = fn());
}
export function shotBufs(eng, kind) {
  const P = W[kind] || W.pistol, k = W[kind] ? kind : 'pistol';
  return bank(eng, 'g:' + k, () => { const a = []; for (let i = 0; i < NV; i++) a.push(toBuffer(eng.ctx, synthShot(eng.ctx.sampleRate, P, k.length * 101 + i * 7 + 1))); return a; });
}
export function tailBuf(eng, cls, space) { return bank(eng, 't:' + cls + space, () => toBuffer(eng.ctx, synthTail(cls, space, cls.length * 31 + (space === 'room' ? 5 : 0)), TAIL_SR)); }
function mechBuf(eng, kind) { return bank(eng, 'm:' + kind, () => toBuffer(eng.ctx, synthMech(eng.ctx.sampleRate, kind, kind.length * 17))); }
export const WEAPON_KINDS = Object.keys(W);
export const WEAPON_SFX = W;

export function gunshot(eng, kind, x, z) {
  if (!eng.ctx || !eng._vp) return;
  const P = W[kind] || W.pistol;
  const L = eng.listener, d = x === undefined ? 0 : Math.hypot(x - L.x, z - L.z);
  if (d > P.range) return;
  const list = shotBufs(eng, kind);
  const buf = list[Math.floor(Math.random() * list.length)];
  const indoor = !!eng.indoor;
  const inSame = indoor ? d < 25 : true; // iç mekândaysak yakın atışlar içeride sayılır
  const tail = tailBuf(eng, P.tail, indoor && inSame ? 'room' : 'street');
  const delay = d > 30 ? Math.min(1.2, d / 343) : 0;
  play(eng, buf, {
    x, z, range: P.range, ref: 6, gain: P.g * (inSame ? 1 : 0.35) * (0.92 + Math.random() * 0.12),
    rate: 0.96 + Math.random() * 0.08, rev: indoor ? 0.22 : 0.1, cat: 'gun', delay, lp: inSame ? 20000 : 650,
    tail: { buf: tail, gain: P.tg * (indoor && inSame ? 0.8 : 1) }, tailRef: P.range * 0.3,
  });
  if (d < 18) {
    if (kind === 'shotgun') play(eng, mechBuf(eng, 'pump'), { x, z, range: 30, ref: 4, gain: 0.5, cat: 'mech', delay: 0.36, rev: 0.05 });
    else if (kind === 'sniper') play(eng, mechBuf(eng, 'bolt'), { x, z, range: 30, ref: 4, gain: 0.45, cat: 'mech', delay: 0.5, rev: 0.05 });
    else if (kind === 'sawed' || kind === 'gl') play(eng, mechBuf(eng, 'break'), { x, z, range: 30, ref: 4, gain: 0.4, cat: 'mech', delay: kind === 'gl' ? 0.25 : 0.12, rev: 0.05 });
  }
}

// önceden örnekleme listesi (boşta, birer birer)
export function weaponPrewarm(eng) {
  const jobs = [];
  for (const k of ['pistol', 'rifle', 'smg', 'shotgun', 'lmg', 'revolver', 'ak', 'm4', 'sniper', 'pistol2', 'smg2', 'magnum', 'sawed', 'dmr', 'rpg', 'gl']) jobs.push(() => shotBufs(eng, k));
  for (const c of Object.keys(TAILS)) { jobs.push(() => tailBuf(eng, c, 'street')); jobs.push(() => tailBuf(eng, c, 'room')); }
  return jobs;
}

// Yakından geçen mermi: ses altı "vızzt" (Doppler'le düşen türbülans) ya da ses üstü keskin çatlama (N-dalgası)
function synthWhiz(sr, crack, seed) {
  const R = rng(seed), N = Math.floor(0.3 * sr), d = new Float32Array(N);
  const F = new BQ('bp', 4000, 3, sr);
  for (let i = 0; i < N; i++) {
    const t = i / sr, u = t / 0.22, f = 4200 * Math.pow(0.35, Math.min(1, u));
    if ((i & 15) === 0) F.set('bp', f, 3);
    const e = Math.exp(-Math.pow((t - 0.07) / 0.045, 2)) + 0.4 * Math.exp(-t / 0.08) * Math.min(1, t / 0.02);
    d[i] += F.p(R.n()) * e * (crack ? 0.6 : 1);
  }
  if (crack) { // ses üstü: çok kısa N-dalgası + yüksek tıslama
    const i0 = Math.floor(0.05 * sr), nw = Math.floor(0.00025 * sr) + 2;
    for (let i = 0; i < nw * 2; i++) d[i0 + i] += (i < nw ? 1 - i / nw : -(1 - (i - nw) / nw)) * 2.2;
    burst(d, sr, 0.05, { dur: 0.02, tau: 0.002, f: 6000, type: 'hp', amp: 1.2, R });
  }
  return normalize(d, 0.9);
}
export function whiz(eng, k = 1, sx = 0, sz = 0, crack = false) {
  if (!eng.ctx || !eng._vp) return;
  const L = bank(eng, crack ? 'whizC' : 'whiz', () => [0, 1, 2].map((i) => toBuffer(eng.ctx, synthWhiz(eng.ctx.sampleRate, crack, 600 + i * 5 + (crack ? 1 : 0)))));
  const l = Math.hypot(sx, sz) || 1;
  play(eng, L[Math.floor(Math.random() * L.length)], { x: eng.listener.x + sx / l * 2, z: eng.listener.z + sz / l * 2, range: 60, ref: 3, gain: 0.5 * k, rate: 0.9 + Math.random() * 0.2, rev: 0.05, cat: 'impact' });
}
// boş tetik: horoz düşer, iğne boşa vurur (metalik tık)
export function dryFire(eng) {
  if (!eng.ctx || !eng._vp) return;
  const b = bank(eng, 'empty', () => { const sr = eng.ctx.sampleRate, R = rng(9), d = new Float32Array(Math.floor(0.12 * sr)); modal(d, sr, 0, [[2600, 0.012, 0.5], [4300, 0.008, 0.35], [6900, 0.004, 0.2]], 0.8, R); burst(d, sr, 0, { dur: 0.01, tau: 0.0015, f: 3500, q: 1.2, type: 'bp', amp: 0.5, R }); modal(d, sr, 0.004, [[900, 0.02, 0.3]], 0.3, R); return toBuffer(eng.ctx, normalize(d, 0.8)); });
  play(eng, b, { gain: 0.3, rev: 0.03, cat: 'mech' });
}
addRender('bullet_whiz', async () => ({ chans: [synthWhiz(44100, false, 600)], sr: 44100 }));
addRender('bullet_crack', async () => ({ chans: [synthWhiz(44100, true, 601)], sr: 44100 }));

// --- test çıktıları: yakın (5 m), uzak (150 m) ve iç mekân ---
async function renderShot(eng, kind, dist, space) {
  const sr = 44100, P = W[kind], len = 2.8, oc = new OfflineAudioContext(1, Math.floor(len * sr), sr);
  const dry = toBuffer(oc, synthShot(sr, P, 77)), tl = toBuffer(oc, synthTail(P.tail, space, 21), TAIL_SR);
  const ref = 6, tr = P.range * 0.3, edge = 1 - Math.pow(dist / P.range, 2);
  const s1 = oc.createBufferSource(), s2 = oc.createBufferSource(), g1 = oc.createGain(), g2 = oc.createGain(), lp = oc.createBiquadFilter();
  s1.buffer = dry; s2.buffer = tl; lp.type = 'lowpass'; lp.frequency.value = Math.min(20000, 20000 * Math.exp(-dist / (P.range * 0.28)) + 350);
  g1.gain.value = P.g * edge / (1 + dist / ref); g2.gain.value = P.tg * P.g * edge / (1 + dist / tr);
  // test dosyası: kuru tepe ~ -3 dBFS olacak şekilde ölçekle (kuyruk üstüne eklenir)
  const norm = 0.72 / (P.g * edge / (1 + dist / ref) + 1e-6);
  const out = oc.createGain(); out.gain.value = Math.min(norm, 3);
  s1.connect(g1); g1.connect(lp); lp.connect(out); s2.connect(g2); g2.connect(out); out.connect(oc.destination);
  const delay = dist > 30 ? Math.min(1.2, dist / 343) : 0;
  s1.start(delay); s2.start(delay);
  const r = await oc.startRendering();
  const ch = r.getChannelData(0);
  if (dist > 30) normalize(ch, 0.5);
  return { chans: [ch], sr };
}
for (const k of ['pistol', 'revolver', 'smg', 'shotgun', 'rifle', 'ak', 'sniper', 'lmg', 'magnum', 'sawed', 'dmr', 'rpg', 'gl']) addRender('gun_' + k, (eng) => renderShot(eng, k, 5, 'street'));
addRender('gun_rifle_150m', (eng) => renderShot(eng, 'rifle', 150, 'street'));
addRender('gun_pistol_80m', (eng) => renderShot(eng, 'pistol', 80, 'street'));
addRender('gun_pistol_indoor', (eng) => renderShot(eng, 'pistol', 5, 'room'));
addRender('gun_shotgun_indoor', (eng) => renderShot(eng, 'shotgun', 5, 'room'));
addPlay((eng, x, z, i) => gunshot(eng, ['pistol', 'rifle', 'smg', 'shotgun', 'ak'][i % 5], x, z));

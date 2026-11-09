// [ses B2] Arayüz sesleri: yumuşak, dokunsal, zarif. "Dijital bip" yerine fiziksel modeller:
//  tıklama: iki aşamalı tuş (basma + bırakma) — ahşap/kaplama tuş modları + yumuşak gövde vuruşu + ince küçük oda yankısı
//  üzerine gelme: çok kısık, havadar tık
//  para: iki madeni para şıngırtısı (modal metal) + küçük çan
//  başarı / başarısızlık / hata: marimba benzeri tahta tuşlu çalgı (temel + 4x + 10x kısmi), Hicaz renginde
import { rng, normalize, toBuffer, modal, burst, TAU, addEcho, fadeOut } from './dsp.js';
import { play } from './voices.js';
import { addRender, addPlay } from './lab.js';

const SR = 44100;
function thump(d, sr, t0, f, tau, a) { let ph = 0; const i0 = Math.floor(t0 * sr); for (let i = 0; i < tau * 7 * sr && i0 + i < d.length; i++) { ph += TAU * f * (0.75 + 0.25 * Math.exp(-i / (0.006 * sr))) / sr; d[i0 + i] += Math.sin(ph) * a * Math.exp(-i / (tau * sr)) * Math.min(1, i / 30); } }
function room(d, sr, k = 1) { const s = d.slice(); addEcho(d, s, 0.009, 0.16 * k, sr, 5000); addEcho(d, s, 0.017, 0.1 * k, sr, 4000); addEcho(d, s, 0.031, 0.05 * k, sr, 3000); }

export function synthClick(sr, seed) {
  const R = rng(seed), d = new Float32Array(Math.floor(0.14 * sr)), j = 1 + R.n() * 0.03;
  // basma: yumuşak tuş + gövde
  modal(d, sr, 0, [[1180 * j, 0.016, 0.5], [2630 * j, 0.009, 0.28], [4150 * j, 0.005, 0.12]], 0.55, R);
  thump(d, sr, 0, 150 * j, 0.02, 0.55);
  burst(d, sr, 0, { dur: 0.006, tau: 0.0007, f: 6500, type: 'hp', amp: 0.18, R });
  // bırakma: daha hafif, biraz daha tiz
  modal(d, sr, 0.038, [[1400 * j, 0.01, 0.4], [3100 * j, 0.006, 0.2]], 0.22, R);
  thump(d, sr, 0.038, 190 * j, 0.012, 0.18);
  room(d, sr);
  fadeOut(d, Math.floor(0.02 * sr));
  return normalize(d, 0.8);
}
export function synthHover(sr, seed) {
  const R = rng(seed), d = new Float32Array(Math.floor(0.06 * sr));
  modal(d, sr, 0, [[2950, 0.007, 0.4], [5300, 0.004, 0.2]], 0.5, R);
  burst(d, sr, 0, { dur: 0.03, tau: 0.008, f: 5200, q: 0.8, type: 'bp', amp: 0.25, att: 0.002, R });
  room(d, sr, 0.6);
  return normalize(d, 0.6);
}
// marimba notası (tahta tuş + rezonatör borusu)
function mallet(d, sr, t0, f, a, R) {
  modal(d, sr, t0, [[f, 0.32, 1], [f * 3.93, 0.07, 0.22], [f * 9.8, 0.02, 0.06]], a, R);
  burst(d, sr, t0, { dur: 0.01, tau: 0.002, f: f * 2, q: 1, type: 'bp', amp: a * 0.15, R });
}
const mid = (m) => 440 * Math.pow(2, (m - 69) / 12);
function synthPhrase(sr, notes, len, seed) {
  const R = rng(seed), d = new Float32Array(Math.floor(len * sr));
  for (const [m, t, a] of notes) mallet(d, sr, t, mid(m), a, R);
  room(d, sr, 1.2);
  fadeOut(d, Math.floor(0.05 * sr));
  return normalize(d, 0.75);
}
function synthCash(sr, seed) {
  const R = rng(seed), d = new Float32Array(Math.floor(0.7 * sr));
  for (const [t, f] of [[0, 3150], [0.075, 3420]]) { modal(d, sr, t, [[f, 0.18, 0.5], [f * 2.09, 0.1, 0.35], [f * 3.58, 0.06, 0.25], [f * 5.4, 0.035, 0.15]], 0.6, R); burst(d, sr, t, { dur: 0.005, tau: 0.001, f: 7000, type: 'hp', amp: 0.2, R }); }
  modal(d, sr, 0.15, [[2093, 0.35, 0.4], [2093 * 2.76, 0.12, 0.15]], 0.35, R); // küçük çan
  room(d, sr);
  return normalize(d, 0.75);
}
function synthError(sr, seed) {
  const R = rng(seed), d = new Float32Array(Math.floor(0.4 * sr));
  for (const [t, f] of [[0, 233], [0.13, 196]]) { modal(d, sr, t, [[f, 0.06, 1], [f * 2.3, 0.025, 0.3]], 0.8, R); thump(d, sr, t, f * 0.5, 0.04, 0.4); }
  room(d, sr);
  return normalize(d, 0.7);
}

const DEF = {
  click: { fn: synthClick, n: 3, g: 0.32 },
  hover: { fn: synthHover, n: 2, g: 0.1 },
  cash: { fn: synthCash, n: 1, g: 0.32 },
  error: { fn: synthError, n: 1, g: 0.3 },
  // Re Hicaz: Re Fa# La Re (yükselen, aydınlık) / La Sol Fa# Mi♭ Re (inen, karanlık)
  success: { fn: (sr, s) => synthPhrase(sr, [[62, 0, 0.7], [66, 0.1, 0.65], [69, 0.2, 0.7], [74, 0.32, 0.85], [62, 0.32, 0.35]], 1.6, s), n: 1, g: 0.32 },
  fail: { fn: (sr, s) => synthPhrase(sr, [[69, 0, 0.7], [67, 0.18, 0.65], [66, 0.36, 0.6], [63, 0.54, 0.65], [62, 0.8, 0.8], [50, 0.8, 0.5]], 2.0, s), n: 1, g: 0.3 },
};
function buf(eng, k) {
  const B = eng._uib || (eng._uib = {});
  if (!B[k]) { B[k] = []; for (let i = 0; i < DEF[k].n; i++) B[k].push(toBuffer(eng.ctx, DEF[k].fn(SR, 40 + i * 3 + k.length), SR)); }
  return B[k];
}
export function uiSound(eng, k) {
  if (!eng.ctx || !eng._vp) return;
  const now = eng.ctx.currentTime;
  if (k === 'hover') { if (now - (eng._hovT || 0) < 0.045) return; eng._hovT = now; }
  const L = buf(eng, k);
  play(eng, L[Math.floor(Math.random() * L.length)], { gain: DEF[k].g, rate: k === 'click' || k === 'hover' ? 0.97 + Math.random() * 0.06 : 1, rev: 0, cat: 'ui' });
}
export function uiPrewarm(eng) { return Object.keys(DEF).map((k) => () => buf(eng, k)); }

for (const k of Object.keys(DEF)) addRender('ui_' + k, async () => ({ chans: [DEF[k].fn(SR, 40 + k.length)], sr: SR }));
addPlay((eng) => uiSound(eng, 'click'));

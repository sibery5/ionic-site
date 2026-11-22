// [ses S2] Araç çarpışması ve duvara sürtünme.
// Eski: audio.js crash() = 75 Hz sinüs + kare dalga + iki gürültü + 3-7 tık (canlı osilatör, "bip-bom" gibi);
// crashMetal() = tek bant gürültü + testere dişi. Yeni: hıza göre üç düzey önceden örneklenmiş tampon:
//   1) gövde darbesi: kısa alçak basınç (Friedlander) + sac panel çökmesi (yoğun, uyumsuz metal modları; ilk 40 ms'de perde düşer: sac bükülür)
//   2) ezilme: 60-250 ms boyunca çıtırdayan "krrrç" (rastgele aralıklı metal tıkları + bant gürültüsü, şiddetle uzar)
//   3) cam: orta ve ağır düzeyde far/yan cam tıkırtısı (tiz taneler), ağırda ayrıca kırılma patlaması
//   4) parça dökülmesi: 0,25-1,2 sn arasında yere düşen plastik/metal parçalar (seyrekleşen sıçrayışlar)
// Sürtünme: döngülü tampon (metal-beton taşlaması: yapış-kay titreşimi + tiz cızırtı); hız ve temasla açılır.
// Kaynak kararı: CC0 kayıt aranıp erişilemedi (kenney.nl, freesound, opengameart ağdan kapalı; npm'deki CC0 paketler de sentez) -> sentez.
import { BQ, rng, normalize, toBuffer, modal, burst, TAU, fadeOut, loopify } from './dsp.js';
import { play } from './voices.js';
import { addRender } from './lab.js';

const SR = 32000;

export function synthCrash(sr, seed, lvl) {
  const R = rng(seed), len = [0.55, 1.1, 1.7][lvl], N = Math.floor(len * sr), d = new Float32Array(N);
  const K = [0.45, 0.8, 1][lvl];
  // 1) gövde basıncı: Friedlander + alçak gürültü
  { const Tp = 0.012 + 0.008 * lvl, F = new BQ('lp', 220, 0.7, sr), n = Math.floor(Tp * 5 * sr);
    for (let i = 0; i < n; i++) { const u = i / sr / Tp; d[i] += F.p((1 - u) * Math.exp(-1.4 * u)) * 3.2 * K; } }
  burst(d, sr, 0, { dur: 0.25, tau: 0.05 + 0.02 * lvl, f: 380, q: 0.7, type: 'lp', amp: 1.3 * K, att: 0.001, R });
  // sac panel: uyumsuz modlar, perde ilk anda düşer (bükülme) -> modal sonra ayrı süpüren bant
  const base = 180 + R() * 120;
  modal(d, sr, 0.001, [[base, 0.09, 0.4], [base * 2.37, 0.06, 0.35], [base * 3.91, 0.045, 0.3], [base * 5.6, 0.03, 0.25], [base * 8.3, 0.02, 0.2]], 0.9 * K, R);
  burst(d, sr, 0, { dur: 0.18, tau: 0.04, f: 2600, q: 2.5, type: 'bp', amp: 0.9 * K, att: 0.001, R, sweepTo: 900 });
  burst(d, sr, 0, { dur: 0.02, tau: 0.003, f: 3500, type: 'hp', amp: 0.9 * K, R }); // ilk temas çatlaması
  // 2) ezilme çıtırtısı
  const crunch = 0.06 + 0.1 * lvl;
  for (let t = 0.004; t < crunch; t += 0.004 + R() * 0.012) {
    const f = 900 + R() * 3800;
    modal(d, sr, t, [[f, 0.006 + R() * 0.01, 0.5], [f * 1.53, 0.004, 0.3]], (0.25 + R() * 0.3) * K * (1 - t / crunch * 0.6), R);
  }
  burst(d, sr, 0.003, { dur: crunch + 0.08, tau: crunch * 0.6, f: 1400, q: 1.1, type: 'bp', amp: 0.5 * K, att: 0.004, R });
  // 3) cam
  if (lvl >= 1) {
    for (let j = 0; j < 30 + lvl * 40; j++) { const t = 0.01 + Math.pow(R(), 1.8) * (0.25 + 0.3 * lvl); burst(d, sr, t, { dur: 0.008, tau: 0.0015 + R() * 0.002, f: 3500 + R() * 6500, q: 3, type: 'bp', amp: (0.15 + R() * 0.3) * (1 - t), R }); }
    if (lvl === 2) burst(d, sr, 0.006, { dur: 0.08, tau: 0.015, f: 5000, type: 'hp', amp: 0.7, R });
  }
  // 4) parça dökülmesi: yere düşen parçalar, seyrekleşen sıçrayışlar
  const nP = [2, 5, 9][lvl];
  for (let j = 0; j < nP; j++) {
    let t = 0.2 + R() * 0.25 * (1 + lvl), a = 0.25 + R() * 0.3; const f = 500 + R() * 2500, plast = R() < 0.5;
    for (let b = 0; b < 4 && t < len - 0.05; b++) {
      if (plast) burst(d, sr, t, { dur: 0.03, tau: 0.006, f: f * 0.6, q: 1.5, type: 'bp', amp: a, R });
      else modal(d, sr, t, [[f, 0.03, 0.5], [f * 2.1, 0.018, 0.3]], a, R);
      t += 0.06 + R() * 0.12 * (1 - b * 0.2); a *= 0.5;
    }
  }
  normalize(d, 1);
  const k = 1.5, kn = Math.tanh(k);
  for (let i = 0; i < N; i++) d[i] = Math.tanh(d[i] * k) / kn;
  new BQ('hp', 40, 0.7, sr).run(d);
  fadeOut(d, Math.floor(0.08 * sr));
  return normalize(d, 0.85);
}

// metal-beton sürtünmesi: yapış-kay (40-90 Hz düzensiz darbeler) + taşlama cızırtısı + sac çınlaması; döngülü
export function synthScrape(sr, seed = 5) {
  const R = rng(seed), N = Math.floor(1.6 * sr), d = new Float32Array(N);
  const F1 = new BQ('bp', 1700, 1.2, sr), F2 = new BQ('bp', 4800, 2, sr), F3 = new BQ('lp', 500, 0.8, sr);
  let next = 0, amp = 0;
  for (let i = 0; i < N; i++) {
    if (i >= next) { next = i + Math.floor(sr / (40 + R() * 50)); amp = 0.5 + R() * 0.8; }
    const ph = (next - i) / (sr / 60), stick = Math.exp(-6 * (1 - Math.min(1, ph))) * amp;
    const n = R.n();
    d[i] = F1.p(n) * (0.55 + 0.6 * stick) + F2.p(n) * 0.2 + F3.p(n) * stick * 1.2;
  }
  modal(d, sr, 0, [[730, 1.2, 0.04], [1840, 0.8, 0.03], [3110, 0.6, 0.02]], 1, R); // sac çınlaması (döngüde de sürer)
  return normalize(loopify(d, Math.floor(1.2 * sr)), 0.8); // 0,4 sn çapraz geçişli kesintisiz döngü
}

function bank(eng, key, fn) { const B = eng._cb || (eng._cb = {}); return B[key] || (B[key] = fn()); }
const crashBufs = (eng, lvl) => bank(eng, 'c' + lvl, () => [0, 1, 2].map((i) => toBuffer(eng.ctx, synthCrash(SR, 900 + lvl * 31 + i * 7, lvl), SR)));

// k: 0..1,5 (çağıranlar: imp/15, imp/12, metal ezilmesi speed/18)
export function crash(eng, x, z, k = 1) {
  if (!eng.ctx || !eng._vp) return;
  const lvl = k < 0.35 ? 0 : k < 0.85 ? 1 : 2, B = crashBufs(eng, lvl);
  const last = eng._crashLast || (eng._crashLast = [-1, -1, -1]);
  let j = Math.floor(Math.random() * B.length); if (j === last[lvl]) j = (j + 1) % B.length; last[lvl] = j;
  play(eng, B[j], { x, z, range: 160, ref: 7, gain: Math.min(1.1, 0.45 + 0.45 * k), rate: 0.92 + Math.random() * 0.14, rev: 0.3, cat: 'boom' });
}

// sürtünme döngüsü: her karede çağrılır (k: 0 sessiz .. 1 tam), konumlu değil (oyuncunun aracı)
export function scrape(eng, k) {
  if (!eng.ctx) return;
  let L = eng.loops.scrape;
  if (!L) {
    if (k <= 0 || eng._scrapeQ) return;
    eng._scrapeQ = true; // ilk kez: boşta örnekle (kare içinde sentez yok)
    const job = () => { const c = eng.ctx, src = c.createBufferSource(); src.buffer = toBuffer(c, synthScrape(SR), SR); src.loop = true; const g = c.createGain(); g.gain.value = 0; src.connect(g); g.connect(eng.sfx); src.start(); eng.loops.scrape = { src, g, f: null }; };
    if (eng._prewarm) { eng._prewarm.unshift(job); eng._prewarmStep(); } else job();
    return;
  }
  const t = eng.ctx.currentTime, kk = Math.max(0, Math.min(1, k));
  L.g.gain.setTargetAtTime(kk * 0.5, t, kk > 0 ? 0.03 : 0.08);
  L.src.playbackRate.setTargetAtTime(0.8 + 0.5 * kk, t, 0.05);
}

export function crashPrewarm(eng) { return [0, 1, 2].map((l) => () => crashBufs(eng, l)); }

addRender('crash_light', async () => ({ chans: [synthCrash(SR, 900, 0)], sr: SR }));
addRender('crash_medium', async () => ({ chans: [synthCrash(SR, 931, 1)], sr: SR }));
addRender('crash_heavy', async () => ({ chans: [synthCrash(SR, 962, 2)], sr: SR }));
addRender('crash_scrape', async () => ({ chans: [synthScrape(SR)], sr: SR }));

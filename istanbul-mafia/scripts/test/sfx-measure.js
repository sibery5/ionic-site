// [ses] Çevrimdışı ses ölçümü (node, tarayıcısız): audio2-steps.js'in yazdığı .testout/audio/*.wav dosyalarını ölçer.
// Sütunlar: tepe/RMS (dBFS), süre (tepeden -50 dB'e düşene kadar), saldırı (ilk -40 dB'den tepeye ms),
// tayf ağırlık merkezi (Hz), bant enerjisi % : alt <150 | gövde 150-400 | orta 400-2k | yüksek 2k-6k | hava >6k,
// kuyruk (tepeden 50 ms sonrası enerjinin yüzdesi; yankı/kuyruk uzunluğu göstergesi).
//   node scripts/test/sfx-measure.js [filtre] [--save once.json] [--cmp once.json]
const fs = require('fs');
const path = require('path');
const dir = path.join(process.cwd(), '.testout', 'audio');
const args = process.argv.slice(2);
const flt = args.find((a) => !a.startsWith('--') && !a.endsWith('.json')) || '';
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };

function readWav(f) {
  const b = fs.readFileSync(f), nc = b.readUInt16LE(22), sr = b.readUInt32LE(24);
  let o = 12; while (b.toString('ascii', o, o + 4) !== 'data') o += 8 + b.readUInt32LE(o + 4);
  const n = b.readUInt32LE(o + 4) / (2 * nc), x = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < nc; c++) s += b.readInt16LE(o + 8 + (i * nc + c) * 2) / 32768; x[i] = s / nc; }
  return { x, sr };
}
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}
const db = (v) => 20 * Math.log10(v + 1e-9);
function measure({ x, sr }) {
  let peak = 0, pi = 0, ss = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > peak) { peak = a; pi = i; } ss += x[i] * x[i]; }
  const th40 = peak * 0.01, th50 = peak * 0.00316;
  let first = 0; while (first < x.length && Math.abs(x[first]) < th40) first++;
  let last = x.length - 1; while (last > 0 && Math.abs(x[last]) < th50) last--;
  // algılanan kuyruk: 10 ms RMS zarfı tepe zarfının -30 dB altına son kez inene kadar
  const W10 = Math.floor(0.01 * sr), env = [];
  for (let s = 0; s + W10 <= x.length; s += W10) { let q = 0; for (let i = s; i < s + W10; i++) q += x[i] * x[i]; env.push(Math.sqrt(q / W10)); }
  const emax = Math.max(...env); let e30 = env.length - 1; while (e30 > 0 && env[e30] < emax * 0.0316) e30--;
  const t30 = Math.max(0, e30 * W10 - first) / sr;
  // tayf: etkin bölgede 2048'lik pencereler, güç ağırlıklı ortalama
  const N = 2048, bands = [0, 0, 0, 0, 0], edges = [150, 400, 2000, 6000];
  let cs = 0, ps = 0;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let s = first; s + N <= Math.max(last, first + N) && s + N <= x.length; s += N) {
    for (let i = 0; i < N; i++) { re[i] = x[s + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); im[i] = 0; }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const f = k * sr / N, p = re[k] * re[k] + im[k] * im[k];
      cs += f * p; ps += p;
      let bi = 0; while (bi < 4 && f >= edges[bi]) bi++;
      bands[bi] += p;
    }
  }
  let e = 0, eTail = 0; const t50 = pi + Math.floor(0.05 * sr);
  for (let i = first; i <= last; i++) { const p = x[i] * x[i]; e += p; if (i > t50) eTail += p; }
  return {
    peak: +db(peak).toFixed(1), rms: +db(Math.sqrt(ss / x.length)).toFixed(1), dur: +((last - first) / sr).toFixed(2), d30: +t30.toFixed(2),
    atk: +((pi - first) / sr * 1000).toFixed(1), cent: Math.round(cs / (ps || 1)),
    bands: bands.map((b) => Math.round(100 * b / (ps || 1))), tail: Math.round(100 * eTail / (e || 1)),
  };
}
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.wav') && f.includes(flt)).sort();
const res = {};
for (const f of files) res[f.replace('.wav', '')] = measure(readWav(path.join(dir, f)));
const cmp = opt('--cmp') ? JSON.parse(fs.readFileSync(opt('--cmp'), 'utf8')) : null;
const row = (n, m) => `${n.padEnd(24)} tepe ${String(m.peak).padStart(5)} rms ${String(m.rms).padStart(6)} süre ${m.dur.toFixed(2).padStart(5)} k30 ${(m.d30 ?? 0).toFixed(2).padStart(5)} atk ${String(m.atk).padStart(6)}ms mrk ${String(m.cent).padStart(5)}Hz bant ${m.bands.map((b) => String(b).padStart(2)).join('/')} kuyruk ${m.tail}%`;
for (const [n, m] of Object.entries(res)) {
  console.log(row(n, m));
  if (cmp && cmp[n]) console.log('  önce'.padEnd(24) + row('', cmp[n]).slice(24));
}
if (opt('--save')) fs.writeFileSync(opt('--save'), JSON.stringify(res, null, 1));
const clip = Object.entries(res).filter(([, m]) => m.peak > -1).map(([n]) => n);
console.log(clip.length ? 'TEPE > -1 dBFS: ' + clip.join(', ') : 'tüm tepeler ≤ -1 dBFS');

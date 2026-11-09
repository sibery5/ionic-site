// [ses B2] Ana menü / açılış müziği: özgün, prosedürel "İstanbul suç teması".
// Re minör (armonik) + La Hicaz renkleri, 80 BPM, 4/4, 16 ölçülük kesintisiz döngü (~48 sn).
// Çalgılar (menü açılınca bir kez, parça parça örneklenir; oyuna girince bellekten atılır):
//   yaylı pad    : akor başına stereo, 5 sesli hafif akortsuz testere (polyBLEP) + yavaşça açılan alçak geçiren
//   alçak nabız  : 3+3+2 vuruşlu bas (sinüs + 2. harmonik + yumuşak tık)
//   bağlama      : Karplus-Strong çift tel (+ oktav teli), arpej ve tremolo ezgi
//   ney          : üflemeli: harmonikler + nefes gürültüsü (perdeye ayarlı bant), portamento, gecikmeli vibrato, "chiff" atak
//   vurmalı      : bendir "düm", darbuka "tek/ka", sinematik derin vuruş, döngü sonunda kabaran gürültü
// Stem'ler (bed, lead, perc) ayrı kazançlardan geçer -> duckMusic() ile ezgi/vurmalı kısılabilir; ortak salon yankısı.
// Zamanlama: ileriye bakan ölçü zamanlayıcısı (arka plan sekmesinde de boşluk bırakmaz); aynı işlev OfflineAudioContext'e
// de yazabildiği için test 20 sn'lik WAV'ı birebir aynı müzikle üretir.
import { BQ, rng, toBuffer, pluckString, makeIR, normalize, fadeOut, blep, TAU } from './sfx/dsp.js';
import { addRender } from './sfx/lab.js';

const SR = 22050;
const BPM = 80, BEAT = 60 / BPM, BAR = BEAT * 4, BARS = 16;
const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);

// akorlar (pad sesleri, bas kökü)
const CH = {
  Dm: { v: [50, 53, 57, 62, 65], root: 38 },
  Bb: { v: [46, 53, 58, 62, 65], root: 34 },
  A: { v: [45, 52, 57, 61, 64], root: 33 },
  Gm: { v: [43, 50, 55, 58, 62], root: 31 },
  Eb: { v: [39, 51, 55, 58, 63], root: 39 },
};
const FORM = ['Dm', 'Dm', 'Bb', 'A', 'Dm', 'Bb', 'Gm', 'A', 'Gm', 'Eb', 'A', 'A', 'Dm', 'Bb', 'Eb', 'A'];
// ney cümleleri: [midi | null(nefes), vuruş]
const NEY = {
  a: [[69, 1.5], [70, 0.5], [69, 0.5], [67, 0.5], [65, 1], [64, 0.5], [65, 0.5], [62, 2.5]],
  b: [[67, 1], [69, 0.5], [70, 1.5], [69, 0.5], [67, 0.5], [65, 0.5], [64, 1], [61, 0.5], [64, 0.5], [69, 1.5]],
  c: [[74, 2], [73, 0.5], [74, 0.5], [76, 1], [77, 2], [76, 0.5], [74, 0.5], [73, 1], [null, 0.25], [70, 1.25], [69, 0.5], [67, 1], [69, 2.5], [null, 0.5], [70, 0.5], [69, 0.5], [61, 0.5], [62, 1.5]],
};
const NEY_AT = { 4: 'a', 6: 'b', 12: 'c' };
// bağlama tremolo ezgisi (ölçü 8-11): [midi, vuruş]
const TREM = { 8: [[67, 2], [70, 1], [69, 1]], 9: [[67, 1], [65, 1], [63, 2]], 10: [[62, 1], [61, 1], [62, 1], [64, 1]], 11: [[64, 2], [61, 1], [57, 1]] };

// ---------------- çalgı örnekleme ----------------
function padChord(notes, seed) {
  const R = rng(seed), dur = BAR + 1.6, N = Math.floor(dur * SR);
  const out = [new Float32Array(N), new Float32Array(N)];
  const det = [[-9, -2, 5, 11], [-7, 1, 7, 12]];
  for (let c = 0; c < 2; c++) {
    const d = out[c];
    for (const m of notes) {
      for (const ct of det[c]) {
        const f = mf(m) * Math.pow(2, (ct + R.n() * 1.5) / 1200), dt = f / SR;
        let ph = R();
        const vr = 4.5 + R() * 1.5, vd = 0.0012;
        for (let i = 0; i < N; i++) {
          const fi = dt * (1 + vd * Math.sin(TAU * vr * i / SR + ph * 6));
          ph += fi; if (ph >= 1) ph -= 1;
          d[i] += (2 * ph - 1 - blep(ph, fi)) * 0.14;
        }
      }
    }
    // yavaşça açılıp kapanan süzgeç (yay vuruşu), hafif gövde
    const F = new BQ('lp', 600, 0.8, SR), F2 = new BQ('lp', 700, 0.6, SR), hp = new BQ('hp', 70, 0.7, SR);
    for (let i = 0; i < N; i++) {
      const t = i / SR;
      if ((i & 63) === 0) { const fc = 500 + 1300 * Math.sin(Math.PI * Math.min(1, t / (BAR + 0.6))) ; F.set('lp', fc, 0.8); F2.set('lp', fc * 1.3, 0.6); }
      const env = Math.min(1, t / 0.9) * (t > BAR ? Math.max(0, 1 - (t - BAR) / 1.6) : 1);
      d[i] = hp.p(F2.p(F.p(d[i]))) * env;
    }
  }
  return out;
}
function bassNote(m) {
  const N = Math.floor(0.42 * SR), d = new Float32Array(N), f = mf(m);
  let ph = 0;
  const lp = new BQ('lp', 900, 0.7, SR);
  for (let i = 0; i < N; i++) {
    const t = i / SR; ph += f * (1 + 0.15 * Math.exp(-t / 0.01)) / SR;
    const e = Math.min(1, t / 0.004) * Math.exp(-t / 0.16);
    d[i] = (Math.sin(TAU * ph) + 0.35 * Math.sin(2 * TAU * ph) + 0.12 * Math.sin(3 * TAU * ph)) * e;
    if (i < 60) d[i] += lp.p((Math.random() * 2 - 1) * 0.3 * (1 - i / 60));
  }
  return normalize(d, 0.8);
}
function baglamaNote(m, seed) {
  const f = mf(m), a = pluckString(SR, f, 1.5, { bright: 0.85, decay: 0.9965, seed, detune: 0.003 });
  if (m < 64) { const o = pluckString(SR, f * 2, 1.5, { bright: 0.9, decay: 0.996, seed: seed + 5, detune: 0.002 }); for (let i = 0; i < a.length; i++) a[i] += o[i] * 0.35; }
  return normalize(a, 0.8);
}
function neyPhrase(ph, seed) {
  const R = rng(seed), total = ph.reduce((s, n) => s + n[1], 0) * BEAT + 0.8;
  const N = Math.floor(total * SR), d = new Float32Array(N);
  const nb = new BQ('bp', 400, 8, SR), br = new BQ('bp', 1500, 0.5, SR), ch = new BQ('bp', 2500, 1, SR);
  let f = mf(ph.find((n) => n[0])[0]), p = 0, i = 0, amp = 0;
  for (let k = 0; k < ph.length; k++) {
    const [m, b] = ph[k], n = Math.floor(b * BEAT * SR);
    const tgt = m ? mf(m) : f, on = !!m, prevRest = k === 0 || !ph[k - 1][0];
    for (let j = 0; j < n && i < N; j++, i++) {
      const t = j / SR;
      f += (tgt - f) * (1 - Math.exp(-1 / (0.035 * SR)));
      const vib = 1 + 0.009 * Math.sin(TAU * 5.1 * (i / SR)) * Math.min(1, Math.max(0, t - 0.25) / 0.3);
      const target = on ? 0.85 + 0.15 * Math.sin(Math.PI * Math.min(1, j / n)) : 0;
      amp += (target - amp) * (1 - Math.exp(-1 / ((on ? 0.06 : 0.05) * SR)));
      p += f * vib / SR; if (p >= 1) p -= 1;
      if ((i & 63) === 0) nb.set('bp', f, 8);
      const nz = R.n();
      let s = Math.sin(TAU * p) + 0.22 * Math.sin(2 * TAU * p) + 0.1 * Math.sin(3 * TAU * p) + 0.04 * Math.sin(4 * TAU * p);
      s = s * 0.75 + nb.p(nz) * 0.55 + br.p(nz) * 0.07;
      if (on && prevRest && t < 0.07) s += ch.p(nz) * 0.6 * (1 - t / 0.07); // üfleme "chiff"
      d[i] = s * amp;
    }
  }
  fadeOut(d, Math.floor(0.3 * SR));
  return normalize(d, 0.8);
}
function drum(kind, seed) {
  const R = rng(seed), N = Math.floor((kind === 'taiko' ? 2.2 : kind === 'swell' ? BEAT * 2 + 0.1 : 0.5) * SR), d = new Float32Array(N);
  if (kind === 'dum' || kind === 'taiko') {
    const f0 = kind === 'taiko' ? 52 : 78, tau = kind === 'taiko' ? 0.6 : 0.22;
    let ph = 0; const lp = new BQ('lp', kind === 'taiko' ? 300 : 900, 0.7, SR), bz = new BQ('bp', 3000, 1, SR);
    for (let i = 0; i < N; i++) {
      const t = i / SR; ph += f0 * (0.7 + 0.5 * Math.exp(-t / 0.03)) / SR;
      d[i] = Math.sin(TAU * ph) * Math.exp(-t / tau) * Math.min(1, t / 0.002) + lp.p(R.n()) * 0.6 * Math.exp(-t / 0.04);
      if (kind === 'dum') d[i] += bz.p(R.n()) * 0.12 * Math.exp(-t / 0.08); // bendir zilleri
    }
  } else if (kind === 'tek' || kind === 'ka') {
    const hi = kind === 'tek';
    const modes = hi ? [[520, 0.035, 0.6], [1150, 0.025, 0.45], [2600, 0.012, 0.3]] : [[700, 0.012, 0.6], [1600, 0.008, 0.3]];
    for (const [f, tau, a] of modes) { const w = TAU * f / SR; for (let i = 0; i < tau * 6 * SR; i++) d[i] += Math.sin(w * i) * a * Math.exp(-i / (tau * SR)); }
    const hp = new BQ('hp', 2500, 0.7, SR); for (let i = 0; i < 0.01 * SR; i++) d[i] += hp.p(R.n()) * (hi ? 0.7 : 0.4) * Math.exp(-i / (0.002 * SR));
  } else if (kind === 'swell') { // ters kabaran gürültü (döngü başına geçiş)
    const F = new BQ('lp', 300, 0.8, SR);
    for (let i = 0; i < N; i++) { const u = i / N; if ((i & 63) === 0) F.set('lp', 300 + 5000 * u * u, 0.8); d[i] = F.p(R.n()) * u * u * u; }
  }
  return normalize(d, 0.8);
}

// Tüm örnekleri hazırla (eşzamansız, ana iş parçacığını uzun süre bloklamaz)
export async function buildSamples(yieldFn) {
  const S = { pad: {}, bass: {}, bag: {}, ney: {}, drum: {} };
  const y = yieldFn || (() => new Promise((r) => setTimeout(r, 0)));
  let seed = 1;
  for (const k of Object.keys(CH)) { S.pad[k] = padChord(CH[k].v, seed++); await y(); }
  for (const k of Object.keys(CH)) S.bass[CH[k].root] = bassNote(CH[k].root);
  const need = new Set();
  for (let b = 0; b < BARS; b++) { if (TREM[b]) TREM[b].forEach((n) => need.add(n[0])); else CH[FORM[b]].v.forEach((m) => need.add(m + 12)); }
  for (const m of need) { S.bag[m] = baglamaNote(m, m * 3); }
  await y();
  for (const k of Object.keys(NEY)) { S.ney[k] = neyPhrase(NEY[k], k.charCodeAt(0)); await y(); }
  for (const k of ['dum', 'taiko', 'tek', 'ka', 'swell']) S.drum[k] = drum(k, k.length * 9);
  return S;
}
function toBuffers(ctx, S) {
  const B = { pad: {}, bass: {}, bag: {}, ney: {}, drum: {} };
  for (const g of Object.keys(S)) for (const k of Object.keys(S[g])) B[g][k] = toBuffer(ctx, S[g][k], SR);
  return B;
}

// Bir ölçüyü zamanla. out = { bed, lead, perc } (GainNode'lar), track(src) düğüm temizliği için
function scheduleBar(ctx, out, B, bar, t, track) {
  const ch = CH[FORM[bar]];
  const hit = (buf, dest, time, gain, rate = 1) => {
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = gain;
    s.connect(g); g.connect(dest); s.start(time);
    track && track(s, g);
  };
  // pad
  hit(B.pad[FORM[bar]], out.bed, t, 0.42);
  // bas nabzı 3+3+2
  const strong = [0, 3, 6], soft = bar < 2 ? [] : [2, 5, 7];
  for (const e of strong) hit(B.bass[ch.root], out.bed, t + e * BEAT / 2, bar < 2 ? 0.45 : 0.62);
  for (const e of soft) hit(B.bass[ch.root], out.bed, t + e * BEAT / 2, 0.22);
  // bağlama
  if (TREM[bar]) {
    let bt = 0;
    for (const [m, b] of TREM[bar]) { for (let k = 0; k < b * 4; k++) hit(B.bag[m], out.lead, t + (bt + k / 4) * BEAT + (k % 2) * 0.006, (k % 2 ? 0.2 : 0.32) * (k === 0 ? 1.3 : 1)); bt += b; }
  } else {
    const pat = [0, 1, 2, 3, 4, 3, 2, 1];
    const sparse = bar < 4;
    pat.forEach((ix, e) => { if (sparse && e % 2) return; hit(B.bag[ch.v[ix] + 12], out.lead, t + e * BEAT / 2, (e === 0 ? 0.3 : 0.2) * (sparse ? 0.8 : 1)); });
  }
  // ney
  if (NEY_AT[bar]) hit(B.ney[NEY_AT[bar]], out.lead, t, 0.5);
  // vurmalı
  if (bar === 0 || bar === 12 || bar === 14) hit(B.drum.taiko, out.perc, t, bar === 0 ? 0.7 : 0.55);
  if (bar < 4 || bar >= 14) { hit(B.drum.dum, out.perc, t, 0.45); hit(B.drum.dum, out.perc, t + 2.5 * BEAT, 0.35); }
  else {
    const P = ['D', 0, 'T', 0, 'D', 'D', 'T', 0];
    P.forEach((p, e) => { if (p === 'D') hit(B.drum.dum, out.perc, t + e * BEAT / 2, 0.42); else if (p === 'T') hit(B.drum.tek, out.perc, t + e * BEAT / 2, 0.3); else if (bar > 7) hit(B.drum.ka, out.perc, t + e * BEAT / 2, 0.12); });
  }
  if (bar === 15) hit(B.drum.swell, out.perc, t + BAR - BEAT * 2, 0.35);
}

function makeBus(ctx, dest, irCache) {
  const bus = ctx.createGain(); bus.gain.value = 0;
  const stems = { bed: ctx.createGain(), lead: ctx.createGain(), perc: ctx.createGain() };
  const rv = ctx.createConvolver(); rv.buffer = irCache || toBuffer(ctx, makeIR(ctx.sampleRate, 'hall', 11));
  const rg = ctx.createGain(); rg.gain.value = 0.32;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
  for (const k of Object.keys(stems)) { stems[k].connect(bus); stems[k].connect(rg); }
  stems.lead.gain.value = 0.9; stems.perc.gain.value = 0.8; stems.bed.gain.value = 0.85;
  rg.connect(rv); rv.connect(bus); bus.connect(comp); comp.connect(dest);
  return { bus, stems, rv, rg, comp, nodes: [bus, rv, rg, comp, ...Object.values(stems)] };
}

// ---------------- AudioEngine'e takılan işlevler ----------------
export function installMusic(P) {
  Object.assign(P, {
    startMusic(mode = 'menu') {
      if (!this.ctx) return;
      if (this.musicMode === mode) return;
      this.stopMusic();
      this.musicMode = mode;
      const token = (this._musTok = (this._musTok || 0) + 1);
      const go = (S) => {
        if (this._musTok !== token || !this.ctx) return;
        this._musS = S;
        const c = this.ctx;
        if (!this._hallIR) this._hallIR = toBuffer(c, makeIR(c.sampleRate, 'hall', 11));
        const M = makeBus(c, this.music, this._hallIR);
        const B = toBuffers(c, S);
        const live = new Set();
        const track = (s, g) => { live.add(s); s.onended = () => { s.disconnect(); g.disconnect(); live.delete(s); }; };
        let bar = 0, next = c.currentTime + 0.15;
        const tick = () => {
          while (next < c.currentTime + 1.6) { scheduleBar(c, M.stems, B, bar, next, track); bar = (bar + 1) % BARS; next += BAR; }
        };
        tick();
        M.bus.gain.setValueAtTime(0, c.currentTime); M.bus.gain.linearRampToValueAtTime(0.7, c.currentTime + 2.5);
        this._mus = { M, B, live, timer: setInterval(tick, 250) };
      };
      if (this._musS) go(this._musS);
      else buildSamples().then(go);
    },
    stopMusic() {
      this._musTok = (this._musTok || 0) + 1;
      this.musicMode = null;
      const m = this._mus; this._mus = null;
      if (!m || !this.ctx) return;
      clearInterval(m.timer);
      const t = this.ctx.currentTime;
      m.M.bus.gain.cancelScheduledValues(t); m.M.bus.gain.setValueAtTime(m.M.bus.gain.value, t); m.M.bus.gain.linearRampToValueAtTime(0, t + 1.2);
      setTimeout(() => {
        for (const s of m.live) { try { s.stop(); } catch (e) { /* bitti */ } }
        for (const n of m.M.nodes) n.disconnect();
        // oyuna girildiyse örnekleri bellekten at (menüye dönüşte yeniden üretilir)
        if (!this.musicMode) this._musS = null;
      }, 1400);
    },
    // ezgi ve vurmalıyı kıs (diyalog, sinematik, uyarı): k 0..1 (1 = tam kısık), süre sn
    duckMusic(k = 0.6, t = 0.4) {
      const m = this._mus; if (!m || !this.ctx) return;
      const now = this.ctx.currentTime;
      for (const [s, base] of [['lead', 0.9], ['perc', 0.8], ['bed', 0.85]]) {
        const g = m.M.stems[s].gain; g.cancelScheduledValues(now); g.setTargetAtTime(base * (1 - k * (s === 'bed' ? 0.4 : 1)), now, t / 3);
      }
    },
  });
}

// test: 20 sn'lik menü teması (OfflineAudioContext ile birebir aynı zamanlayıcı)
addRender('menu_theme_20s', async () => {
  const sr = 44100, len = 20, oc = new OfflineAudioContext(2, sr * len, sr);
  const S = await buildSamples(() => Promise.resolve());
  const M = makeBus(oc, oc.destination);
  M.bus.gain.value = 0.7;
  const B = toBuffers(oc, S);
  for (let b = 0, t = 0.05; t < len; b++, t += BAR) scheduleBar(oc, M.stems, B, b % BARS, t);
  const r = await oc.startRendering();
  return { chans: [r.getChannelData(0), r.getChannelData(1)], sr };
});
// döngü dikişi testi: son 4 ölçü + ilk 3 ölçü (15. ölçüden 0'a geçiş)
addRender('menu_theme_loopseam', async () => {
  const sr = 44100, len = 7 * BAR + 1, oc = new OfflineAudioContext(2, Math.floor(sr * len), sr);
  const S = await buildSamples(() => Promise.resolve());
  const M = makeBus(oc, oc.destination); M.bus.gain.value = 0.7;
  const B = toBuffers(oc, S);
  [12, 13, 14, 15, 0, 1, 2].forEach((b, i) => scheduleBar(oc, M.stems, B, b, 0.05 + i * BAR));
  const r = await oc.startRendering();
  return { chans: [r.getChannelData(0), r.getChannelData(1)], sr };
});

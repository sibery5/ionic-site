// [ses B2] Çalma katmanı: havuzlu konumlu zincirler + ses bütçesi.
// Bir zincir: (kuru giriş) gD -> lp (hava sönümü) -> pan -> sfx ; (kuyruk girişi) gT -> pan ; gD -> rg -> yankı.
// Zincirler havuzda kalır (en çok POOL adet, hep bağlı; sessizken Chrome işlemez); her çalışta yalnızca
// AudioBufferSourceNode kurulur, bitince ayrılır ve zincir havuza döner. Kategori başına eşzamanlı ses sınırı vardır;
// sınır dolunca en eski ses kesilir (yeni ses daha önemli). Böylece düğüm sayısı ve bellek sabit kalır.

const POOL = 36;
const CAPS = { gun: 14, tail: 6, impact: 10, step: 6, ui: 4, voice: 3, boom: 4, amb: 6, mech: 6, misc: 8 };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function initVoices(eng) {
  eng._vp = { free: [], all: [], act: [], cats: {}, created: 0 };
  eng.sfxNodes = { live: 0, created: 0, plays: 0, dropped: 0, stolen: 0 };
}

function makeChain(eng) {
  const c = eng.ctx, V = eng._vp;
  const ch = {
    gD: c.createGain(), gT: c.createGain(), lp: c.createBiquadFilter(), rg: c.createGain(),
    pan: c.createStereoPanner ? c.createStereoPanner() : c.createGain(), srcs: [], busy: false,
  };
  ch.lp.type = 'lowpass'; ch.lp.Q.value = 0.5;
  ch.gD.connect(ch.lp); ch.lp.connect(ch.pan); ch.gT.connect(ch.pan); ch.pan.connect(eng.sfx);
  ch.gD.connect(ch.rg); ch.gT.connect(ch.rg); ch.rg.connect(eng.reverb);
  V.all.push(ch);
  eng.sfxNodes.created += 5; eng.sfxNodes.live += 5;
  return ch;
}

function release(eng, ch) {
  if (!ch.busy) return;
  ch.busy = false;
  for (const s of ch.srcs) { s.onended = null; try { s.stop(); } catch (e) { /* başlamamış/bitmiş */ } s.disconnect(); eng.sfxNodes.live--; }
  ch.srcs.length = 0;
  ch.gD.gain.cancelScheduledValues(0); ch.gD.gain.value = 0; ch.gT.gain.value = 0; ch.rg.gain.value = 0;
  const V = eng._vp, a = V.act.indexOf(ch); if (a >= 0) V.act.splice(a, 1);
  const L = V.cats[ch.cat]; if (L) { const i = L.indexOf(ch); if (i >= 0) L.splice(i, 1); }
  V.free.push(ch);
}

function acquire(eng, cat) {
  const V = eng._vp;
  const L = V.cats[cat] || (V.cats[cat] = []);
  if (L.length >= (CAPS[cat] || 8)) { release(eng, L[0]); eng.sfxNodes.stolen++; }
  let ch = V.free.pop();
  if (!ch) {
    if (V.all.length < POOL) ch = makeChain(eng);
    else { release(eng, V.act[0]); eng.sfxNodes.stolen++; ch = V.free.pop(); }
  }
  ch.busy = true; ch.cat = cat;
  L.push(ch); V.act.push(ch);
  return ch;
}

// dinleyiciye göre uzaklık/yön
export function geo(eng, x, z) {
  if (x === undefined || x === null) return { d: 0, pan: 0, pos: false };
  const dx = x - eng.listener.x, dz = z - eng.listener.z;
  return { d: Math.hypot(dx, dz), pan: eng.panOf(dx, dz), pos: true };
}

// Ana çalma işlevi. buf: kuru ses; tail: { buf, gain } kuyruk (mesafeyle daha yavaş sönümlenir)
// o: { x, z, range, gain, rate, rev, cat, delay, ref, lp, tailRef, minD }
export function play(eng, buf, o = {}) {
  if (!eng.ctx || !buf || !eng._vp) return null;
  const c = eng.ctx;
  const G = geo(eng, o.x, o.z);
  const range = o.range || 120;
  const d = Math.max(o.minD || 0, G.d);
  if (G.pos && d >= range) { eng.sfxNodes.dropped++; return null; }
  // mesafe yasası: yakın alanda 1/(1+d/ref), menzil sonunda yumuşakça sıfıra iner
  const ref = o.ref || range * 0.06;
  const edge = G.pos ? 1 - Math.pow(d / range, 2) : 1;
  const aD = (o.gain ?? 1) * (G.pos ? edge / (1 + d / ref) : 1);
  if (aD < 0.0015 && !o.tail) { eng.sfxNodes.dropped++; return null; }
  const ch = acquire(eng, o.cat || 'misc');
  const t = c.currentTime + (o.delay || 0);
  // hava sönümü: uzakta tiz kaybolur
  const lpF = clamp(Math.min(o.lp || 20000, G.pos ? 20000 * Math.exp(-d / (range * 0.28)) + 350 : 20000), 200, 20000);
  ch.lp.frequency.setValueAtTime(lpF, c.currentTime);
  ch.gD.gain.setValueAtTime(aD, c.currentTime);
  if (ch.pan.pan) ch.pan.pan.setValueAtTime(G.pan, c.currentTime);
  const rev = (o.rev ?? 0.2) * (G.pos ? 0.6 + Math.min(1.4, d / (range * 0.4)) : 1);
  ch.rg.gain.setValueAtTime(rev * Math.max(aD, 0.02), c.currentTime);
  const rate = o.rate || 1;
  const s = c.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
  s.connect(ch.gD); ch.srcs.push(s); eng.sfxNodes.live++; eng.sfxNodes.created++;
  let last = s, lastEnd = buf.duration / rate;
  if (o.tail && o.tail.buf) {
    const tr = o.tailRef || range * 0.25;
    const aT = (o.tail.gain ?? 0.5) * (o.gain ?? 1) * (G.pos ? edge / (1 + d / tr) : 1);
    ch.gT.gain.setValueAtTime(aT, c.currentTime);
    const s2 = c.createBufferSource(); s2.buffer = o.tail.buf; s2.playbackRate.value = rate;
    s2.connect(ch.gT); ch.srcs.push(s2); eng.sfxNodes.live++; eng.sfxNodes.created++;
    s2.start(t + (o.tail.delay || 0));
    const e2 = o.tail.buf.duration / rate + (o.tail.delay || 0);
    if (e2 > lastEnd) { last = s2; lastEnd = e2; }
  } else ch.gT.gain.setValueAtTime(0, c.currentTime);
  s.start(t);
  last.onended = () => release(eng, ch);
  eng.sfxNodes.plays++;
  return ch;
}

// çalan bir sesi erken kes (ör. konuşma iptali)
export function stopVoice(eng, ch) { if (ch && ch.busy) release(eng, ch); }
export function activeCount(eng) { return eng._vp ? eng._vp.act.length : 0; }

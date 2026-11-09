// [ses B2] Sirenler: Avrupa/Türk tipi elektronik siren, korna hoparlörü karakteriyle.
// Sentez (çevrimdışı, 22 kHz): perdesi desene göre kayan polyBLEP kare dalga (sürücü) -> sıkıştırma sürücüsü kırılması
// (yumuşak kırpma) -> korna: yüksek geçiren (ağız kesimi ~480 Hz) + 3 rezonans tepesi + diyafram alçak geçireni ->
// çatıdaki iki hoparlörün girişimi (1,1 ms tarak) -> kesintisiz döngü (çapraz geçiş).
// Çalışma zamanı: siren açık her araç için (en yakın 3) döngüsel kaynak; uzaklık kazancı + hava sönümü (alçak geçiren),
// mesafe türevinden Doppler (playbackRate), stereo konum, uzakta daha çok yankı; desen polis memuru gibi arada değişir.
import { BQ, rng, loopify, normalize, softclip, toBuffer, TAU } from './dsp.js';

const SR0 = 22050;
// Desenler: per = periyot (sn), loops = döngüdeki periyot sayısı, f(u) = periyot içi perde (u: 0..1)
const ease = (u) => 1 - Math.pow(1 - u, 2.2);
const PAT = {
  // uzun yükselip alçalan "uuuuuu-iiii" (polis): hızlı kalkış, yavaş iniş
  wail: { per: 4.2, loops: 1, f: (u) => (u < 0.42 ? 640 + 860 * ease(u / 0.42) : 640 + 860 * Math.exp(-(u - 0.42) / 0.2) * (1 - (u - 0.42) / 0.58 * 0.2)) },
  // kısa kesik "viyu-viyu" (yelp)
  yelp: { per: 0.34, loops: 12, f: (u) => (u < 0.62 ? 700 + 820 * ease(u / 0.62) : 1520 - 820 * ((u - 0.62) / 0.38)) },
  // kavşak geçişi: çok hızlı "piyu" (phaser / piercer)
  phaser: { per: 0.105, loops: 36, f: (u) => 900 + 700 * Math.sin(Math.PI * u) },
  // ambulans: Avrupa iki tonlu "dü-da" (hi-lo)
  hilo: { per: 1.1, loops: 4, f: (u) => (u < 0.5 ? 760 : 1010), step: true },
  // ambulans uzun ötüşü: polisten biraz alçak ve yumuşak
  awail: { per: 5.0, loops: 1, f: (u) => (u < 0.45 ? 560 + 640 * ease(u / 0.45) : 560 + 640 * Math.exp(-(u - 0.45) / 0.24)) },
  // jandarma/askerî: alçak, mekanik (dönen disk) karakterli yavaş ötüş
  jwail: { per: 5.6, loops: 1, f: (u) => (u < 0.5 ? 380 + 640 * ease(u / 0.5) : 380 + 640 * Math.exp(-(u - 0.5) / 0.28)) },
  jyelp: { per: 0.48, loops: 9, f: (u) => (u < 0.6 ? 430 + 560 * ease(u / 0.6) : 990 - 560 * ((u - 0.6) / 0.4)) },
};
// Hoparlör/korna karakterleri
const HORN = {
  police: { hp: 480, peaks: [[1180, 3.2, 6], [2350, 4, 5], [3400, 5, 3]], lp: 4600, drive: 1.9, buzz: 0, mech: 0 },
  ambulance: { hp: 420, peaks: [[980, 2.6, 5], [2050, 3.5, 4], [3100, 4, 2]], lp: 4200, drive: 1.5, buzz: 0, mech: 0 },
  jandarma: { hp: 300, peaks: [[700, 2.2, 5], [1600, 3, 4], [2600, 4, 2]], lp: 3600, drive: 2.3, buzz: 0.25, mech: 1 },
};

export function renderSiren(mode, horn = 'police', seed = 3) {
  const P = PAT[mode] || PAT.wail, H = HORN[horn] || HORN.police, R = rng(seed);
  // 2x örnekleme ile sentez (bozulma harmonikleri katlanmasın), sonra süzüp yarıya indir
  const SR = SR0 * 2;
  const N = Math.floor(P.per * P.loops * SR), X = Math.floor(0.06 * SR);
  const d = new Float32Array(N + X);
  let ph = 0, fs = P.f(0), ph2 = 0;
  const hp1 = new BQ('hp', H.hp, 0.9, SR), hp2 = new BQ('hp', H.hp * 0.9, 0.7, SR);
  const pk = H.peaks.map(([f, q, db]) => new BQ('peak', f, q, SR, db));
  const lp1 = new BQ('lp', H.lp, 0.8, SR), lp2 = new BQ('lp', H.lp * 1.15, 0.6, SR);
  const comb = new Float32Array(128); let ci = 0; const cd = Math.round(0.0011 * SR);
  for (let i = 0; i < d.length; i++) {
    const t = i / SR, u = (t % P.per) / P.per;
    let f = P.f(u);
    // iki tonlu geçişte yumuşak (6 ms) perde değişimi; gerçek sirenlerde de anlık değil
    if (P.step) { fs += (f - fs) * (1 - Math.exp(-1 / (0.006 * SR))); f = fs; }
    // hafif titreşim (sürücü osilatörünün kararsızlığı)
    f *= 1 + 0.0025 * Math.sin(TAU * 5.3 * t) + 0.001 * R.n();
    const dt = f / SR;
    ph += dt; if (ph >= 1) ph -= 1;
    // bant sınırlı kare dalga (toplamsal: 9 kHz altındaki tek harmonikler, perdeye göre yumuşakça sönen) + az çift harmonik
    const th = TAU * ph, c2 = 2 * Math.cos(th);
    let s0 = 0, s1 = Math.sin(th), sq = 0;
    const K = Math.max(1, Math.floor(9000 / f));
    for (let k = 1; k <= K; k++) {
      if (k & 1) { const w = Math.cos(1.5708 * k * f / 9000); sq += s1 / k * w * w; }
      else if (k === 2) sq += s1 * 0.06;
      const s2 = c2 * s1 - s0; s0 = s1; s1 = s2;
    }
    sq *= 1.25;
    let x = sq * 0.6;
    if (H.mech) { // mekanik siren: disk delikleri -> testere benzeri darbeler + hava hışırtısı
      ph2 += dt * 0.5; if (ph2 >= 1) ph2 -= 1;
      x = x * 0.55 + (ph2 * 2 - 1) * 0.35 + R.n() * 0.12 * (0.5 + 0.5 * Math.sin(TAU * ph));
    }
    // sürücü kırılması: asimetrik yumuşak kırpma
    x = softclip(x * H.drive + 0.08, 1) - softclip(0.08, 1);
    x = hp2.p(hp1.p(x));
    for (const b of pk) x = b.p(x);
    x = lp2.p(lp1.p(x));
    // korna boğazı kırılması (ikinci, hafif)
    x = softclip(x * 1.2, 1);
    // iki hoparlör girişimi
    const y = x + comb[(ci - cd + 128) % 128] * 0.35; comb[ci] = x; ci = (ci + 1) % 128;
    d[i] = y;
  }
  const aa = [new BQ('lp', 7000, 0.54, SR), new BQ('lp', 7000, 1.31, SR), new BQ('lp', 8000, 0.7, SR)];
  for (let i = 0; i < d.length; i++) { let x = d[i]; for (const b of aa) x = b.p(x); d[i] = x; }
  const h = new Float32Array(Math.floor(d.length / 2));
  for (let i = 0; i < h.length; i++) h[i] = d[i * 2];
  const o = loopify(h, Math.floor(N / 2));
  normalize(o, 0.85);
  return o;
}

// Araç türünden siren karakteri ve desen havuzu
export function sirenKind(v) {
  const t = v && v.type;
  if (t === 'ambulans' || t === 'ambulance') return { horn: 'ambulance', modes: ['hilo', 'awail', 'hilo'] };
  if (v && (v.military || t === 'askkamyon' || t === 'cip' || t === 'zirhli')) return { horn: 'jandarma', modes: ['jwail', 'jyelp'] };
  return { horn: 'police', modes: ['wail', 'yelp', 'wail', 'phaser'] };
}

const MAXV = 3;
export function sirenBuffer(eng, mode, horn) {
  const B = eng._sirenBufs || (eng._sirenBufs = {});
  const k = horn + ':' + mode;
  if (!B[k]) B[k] = toBuffer(eng.ctx, renderSiren(mode, horn, k.length * 7 + 3), SR0);
  return B[k];
}

function newSrc(eng, V, mode) {
  const c = eng.ctx, s = c.createBufferSource();
  s.buffer = sirenBuffer(eng, mode, V.kind.horn); s.loop = true;
  s.playbackRate.value = V.rate;
  const g = c.createGain(); g.gain.value = 0;
  s.connect(g); g.connect(V.lp); g.connect(V.rg);
  s.start(c.currentTime, Math.random() * s.buffer.duration);
  eng.sfxNodes.live += 2; eng.sfxNodes.created += 2;
  return { s, g, mode };
}
function killSrc(eng, S, fade = 0.25) {
  const c = eng.ctx, t = c.currentTime;
  S.g.gain.cancelScheduledValues(t); S.g.gain.setTargetAtTime(0, t, fade / 3);
  S.s.stop(t + fade + 0.05);
  S.s.onended = () => { S.s.disconnect(); S.g.disconnect(); eng.sfxNodes.live -= 2; };
}
function makeVoice(eng, v) {
  const c = eng.ctx;
  const V = { v, kind: sirenKind(v), rate: 1, dPrev: -1, t: 0, switchT: 4 + Math.random() * 6 };
  V.lp = c.createBiquadFilter(); V.lp.type = 'lowpass'; V.lp.Q.value = 0.5; V.lp.frequency.value = 8000;
  V.out = c.createGain(); V.out.gain.value = 0;
  V.pan = c.createStereoPanner ? c.createStereoPanner() : c.createGain();
  V.rg = c.createGain(); V.rg.gain.value = 0;
  V.lp.connect(V.out); V.out.connect(V.pan); V.pan.connect(eng.sfx); V.rg.connect(eng.reverb);
  eng.sfxNodes.live += 4; eng.sfxNodes.created += 4;
  V.cur = newSrc(eng, V, V.kind.modes[0]);
  V.cur.g.gain.setTargetAtTime(1, c.currentTime, 0.05);
  return V;
}
function dropVoice(eng, V, fade = 0.4) {
  const c = eng.ctx, t = c.currentTime;
  V.out.gain.cancelScheduledValues(t); V.out.gain.setTargetAtTime(0, t, fade / 3);
  killSrc(eng, V.cur, fade);
  const s = V.cur.s, prev = s.onended;
  s.onended = () => { prev && prev(); V.lp.disconnect(); V.out.disconnect(); V.pan.disconnect(); V.rg.disconnect(); eng.sfxNodes.live -= 4; };
}

// Kare güncellemesi: game.vehicles.sirens (sireni açık araçlar) + aranma seviyesi (uzak siren yatağı)
export function updateSirens(eng, dt, game) {
  if (!eng.ctx) return;
  const S = eng._sv || (eng._sv = new Map());
  const c = eng.ctx, now = c.currentTime;
  const L = eng.listener, p = game && game.player;
  const list = (game && game.mode === 'playing' && game.vehicles && game.vehicles.sirens) || [];
  // en yakın MAXV araç (400 m içinde)
  const near = [];
  for (const v of list) {
    if (!v || v.destroyed || !v.pos) continue;
    const d = Math.hypot(v.pos.x - L.x, v.pos.z - L.z);
    if (d > 400) continue;
    near.push([d, v]);
  }
  near.sort((a, b) => a[0] - b[0]);
  if (near.length > MAXV) near.length = MAXV;
  const keep = new Set(near.map((n) => n[1]));
  for (const [v, V] of S) if (!keep.has(v)) { dropVoice(eng, V); S.delete(v); }
  const inside = !!(p && p.inInterior);
  for (const [d0, v] of near) {
    let V = S.get(v);
    if (!V) { V = makeVoice(eng, v); S.set(v, V); }
    const own = p && p.vehicle === v;
    const d = own ? 4 : Math.max(3, d0);
    // Doppler: mesafe değişim hızından (dinleyici de hareket ediyorsa onu da kapsar)
    if (V.dPrev >= 0 && dt > 0) {
      const vr = clamp((d - V.dPrev) / dt, -60, 60);
      const r = clamp(343 / (343 + vr), 0.84, 1.19);
      V.rate += (r - V.rate) * Math.min(1, dt * 6);
    }
    V.dPrev = d;
    if (own) V.rate = 1;
    tgt(V.cur.s.playbackRate, V.rate, now, 0.05);
    // uzaklık kazancı: siren çok yüksek sesli; 30 m'de hâlâ baskın, 400 m'de uzak bir uğultu
    let a = 0.42 / (1 + d / 22) * (1 - Math.pow(d / 400, 2));
    let lpF = 350 + 12000 * Math.exp(-d / 110);
    if (own) { a = 0.16; lpF = 2600; } // kabinden: tavanın arkasında, boğuk
    if (inside) { a *= 0.3; lpF = Math.min(lpF, 700); }
    tgt(V.out.gain, a, now, 0.08);
    tgt(V.lp.frequency, lpF, now, 0.1);
    if (V.pan.pan) tgt(V.pan.pan, own ? 0 : eng.panOf(v.pos.x - L.x, v.pos.z - L.z), now, 0.05);
    tgt(V.rg.gain, Math.min(0.5, 0.06 + d / 300) * a * 2.2, now, 0.15);
    // desen değişimi (memur düğmeye basar): wail <-> yelp, ara sıra kısa phaser
    V.switchT -= dt;
    if (V.switchT <= 0) {
      const m = V.kind.modes;
      let nm = m[Math.floor(Math.random() * m.length)];
      if (nm === V.cur.mode) nm = m[(m.indexOf(nm) + 1) % m.length];
      V.switchT = nm === 'phaser' ? 2 + Math.random() * 1.5 : 6 + Math.random() * 9;
      const old = V.cur; V.cur = newSrc(eng, V, nm);
      V.cur.s.playbackRate.value = V.rate;
      V.cur.g.gain.setTargetAtTime(1, now, 0.03);
      killSrc(eng, old, 0.12);
    }
  }
  // uzak siren yatağı: aranırken yakında sirenli araç yoksa şehirde uzaktan gelen sirenler
  const lvl = eng._sirenLevel || 0;
  const bedOn = lvl > 0 && S.size === 0 && game && game.mode === 'playing';
  if (bedOn && !eng._sirenBed) {
    const fake = { type: 'police', pos: { x: L.x + 260, z: L.z } };
    eng._sirenBed = makeVoice(eng, fake);
    eng._sirenBed.ang = Math.random() * TAU;
  }
  if (eng._sirenBed) {
    const B = eng._sirenBed;
    if (!bedOn) { dropVoice(eng, B, 1.5); eng._sirenBed = null; }
    else {
      B.ang += dt * 0.03;
      tgt(B.out.gain, 0.05 * Math.min(1, lvl) * (p && p.inInterior ? 0.3 : 1), now, 0.8);
      tgt(B.lp.frequency, 1100, now, 0.5);
      if (B.pan.pan) tgt(B.pan.pan, Math.sin(B.ang) * 0.6, now, 0.5);
      tgt(B.rg.gain, 0.12, now, 0.5);
      B.switchT -= dt;
      if (B.switchT <= 0) { B.switchT = 8 + Math.random() * 8; const old = B.cur; B.cur = newSrc(eng, B, Math.random() < 0.6 ? 'wail' : 'yelp'); B.cur.g.gain.setTargetAtTime(1, now, 0.3); killSrc(eng, old, 0.6); }
    }
  }
}
export function stopAllSirens(eng) {
  if (eng._sv) { for (const V of eng._sv.values()) dropVoice(eng, V, 0.3); eng._sv.clear(); }
  if (eng._sirenBed) { dropVoice(eng, eng._sirenBed, 0.3); eng._sirenBed = null; }
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function tgt(p, v, t, tc) {
  if (p._lv !== undefined && Math.abs(p._lv - v) <= Math.abs(v) * 0.003 + 1e-4) return;
  if (p._lt !== undefined && t <= p._lt + 1e-4) p.cancelScheduledValues(t);
  p._lv = v; p._lt = t;
  p.setTargetAtTime(v, t, tc);
}

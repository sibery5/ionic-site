// [ses B2] Ses testi: önemli sesleri çevrimdışı (OfflineAudioContext / JS örnekleme) WAV'a yazar -> .testout/audio/
// Denetimler: NaN yok, 0 dBFS üstü kırpma yok, 200 ses çalındıktan sonra canlı düğüm sayısı sabit (sızıntı yok),
// oyunda siren sesleri konumlu açılıp kapanıyor.
//   SETTINGS='{"quality":"low"}' NOSHOT=1 SHOTS=0 node scripts/test/play.js file://$PWD/app/index.html .testout/a2 $PWD/scripts/test/audio2-steps.js
const fs = require('fs');
const path = require('path');
const H = require('./harness.js');

module.exports = async (p) => {
  const dir = path.join(process.cwd(), '.testout', 'audio');
  fs.mkdirSync(dir, { recursive: true });
  await p.evaluate(() => { game.audio.init(); });
  await p.waitForTimeout(300);
  const names = await p.evaluate(() => Object.keys(game.audio.sfxLab.renders));
  const fails = [];
  const rows = [];
  for (const n of names) {
    const r = await p.evaluate(async (n) => {
      const t0 = performance.now();
      const { chans, sr } = await game.audio.sfxLab.renders[n]();
      const ms = performance.now() - t0;
      let peak = 0, nan = 0, ss = 0, len = chans[0].length;
      for (const d of chans) for (let i = 0; i < d.length; i++) { const x = d[i]; if (!Number.isFinite(x)) nan++; else { const a = Math.abs(x); if (a > peak) peak = a; ss += x * x; } }
      // 16 bit PCM WAV, base64
      const nc = chans.length, bytes = new Uint8Array(44 + len * nc * 2), dv = new DataView(bytes.buffer);
      const ws = (o, s) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
      ws(0, 'RIFF'); dv.setUint32(4, 36 + len * nc * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
      dv.setUint16(22, nc, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * nc * 2, true); dv.setUint16(32, nc * 2, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, len * nc * 2, true);
      let o = 44;
      for (let i = 0; i < len; i++) for (let c = 0; c < nc; c++) { const v = Math.max(-1, Math.min(1, chans[c][i] || 0)); dv.setInt16(o, Math.round(v * 32767), true); o += 2; }
      let bin = ''; for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
      return { b64: btoa(bin), peak, nan, rms: Math.sqrt(ss / (len * nc)), sec: len / sr, ms };
    }, n);
    fs.writeFileSync(path.join(dir, n + '.wav'), Buffer.from(r.b64, 'base64'));
    const ok = r.nan === 0 && r.peak <= 1.0 && r.rms > 0.002;
    if (!ok) fails.push(n);
    rows.push(`${ok ? 'OK ' : 'HATA'} ${n.padEnd(22)} ${r.sec.toFixed(2)} sn  tepe ${(20 * Math.log10(r.peak + 1e-9)).toFixed(1)} dBFS  rms ${(20 * Math.log10(r.rms + 1e-9)).toFixed(1)} dB  NaN ${r.nan}  ${r.ms.toFixed(0)} ms`);
  }
  console.log(rows.join('\n'));

  // sızıntı testi: 200 ses, sonra canlı düğüm sayısı
  const leak = await p.evaluate(async () => {
    const a = game.audio, L = a.listener, S = a.sfxNodes;
    const base = S.live;
    const heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
    const acts = a.sfxLab.plays;
    for (let i = 0; i < 200; i++) { acts[i % acts.length](L.x + (i % 7) * 6 - 18, L.z + (i % 5) * 9 - 10, i); if (i % 20 === 19) await new Promise((r) => setTimeout(r, 40)); }
    const peakLive = S.live;
    await new Promise((r) => setTimeout(r, 6500));
    return { base, peakLive, after: S.live, created: S.created, plays: S.plays, stolen: S.stolen, dropped: S.dropped, active: a.sfxLab.active(), heapMB: heap0 ? ((performance.memory.usedJSHeapSize - heap0) / 1048576).toFixed(1) : 'n/a' };
  });
  console.log('sizinti', JSON.stringify(leak));
  const poolMax = 36 * 5;
  if (leak.after - leak.base > poolMax || leak.active > 0) fails.push('leak');

  // oyun içi siren: aranma -> sirenli ekip aracı -> konumlu siren sesi
  await H.start(p); await H.install(p);
  const sir = await p.evaluate(() => {
    const g = game; g.audio.init();
    const P = g.player.pos;
    const v = g.vehicles.add('police', P.x + 30, P.z + 10, 0); v.sirenOn = true;
    const a = g.vehicles.add('ambulans', P.x - 40, P.z, 0); a && (a.sirenOn = true);
    g.wanted.add(2, true);
    sim(2);
    const has = (x) => !!(x && g.audio._sv && g.audio._sv.has(x));
    const n1 = (has(v) ? 1 : 0) + (has(a) ? 1 : 0);
    const kinds = g.audio._sv ? [...g.audio._sv.values()].map((V) => V.kind.horn + ':' + V.cur.mode) : [];
    v.sirenOn = false; a && (a.sirenOn = false);
    sim(1);
    const n2 = (has(v) ? 1 : 0) + (has(a) ? 1 : 0);
    g.audio.megaphone('Dur! Yaklaşma!', P.x + 10, P.z);
    g.audio.heliAnnounce && g.audio.heliAnnounce('Helikopter seni görüyor! Kaçamazsın!', P.x, P.z + 30);
    return { voicesOn: n1, kinds, voicesOff: n2, live: g.audio.sfxNodes.live };
  });
  console.log('siren', JSON.stringify(sir));
  if (sir.voicesOn < 2 || sir.voicesOff !== 0) fails.push('siren');
  console.log(fails.length ? 'AUDIO2 BASARISIZ: ' + fails.join(', ') : 'AUDIO2 TAMAM');
};

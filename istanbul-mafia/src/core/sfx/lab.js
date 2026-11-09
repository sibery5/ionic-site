// [ses B2] Test/dinleme laboratuvarı: önemli sesleri çevrimdışı örnekler (audio2-steps.js WAV'a yazar).
// Oyun akışında kullanılmaz; yalnızca audio.sfxLab üzerinden çağrılır.
import { makeIR, toBuffer } from './dsp.js';
import { renderSiren } from './siren.js';
import { synthSpeech, speakerChain, SPEECH_SR } from './speech.js';
import { activeCount } from './voices.js';

const extra = [];
// diğer modüller kendi test çıktılarını buraya ekler: [ad, async (eng) => { chans, sr }]
export function addRender(name, fn) { extra.push([name, fn]); }
const plays = [];
export function addPlay(fn) { plays.push(fn); }

// geçen araç: sabit hızla yan yoldan geçen siren (Doppler + uzaklık süzgeci + sokak yankısı)
async function passBy(eng, mode, horn, speed = 22, lat = 9, sec = 9) {
  const sr = 44100, oc = new OfflineAudioContext(2, Math.floor(sec * sr), sr);
  const buf = toBuffer(oc, renderSiren(mode, horn, 5), 22050);
  const s = oc.createBufferSource(); s.buffer = buf; s.loop = true;
  const g = oc.createGain(), lp = oc.createBiquadFilter(), pan = oc.createStereoPanner(), cv = oc.createConvolver(), rg = oc.createGain();
  cv.buffer = toBuffer(oc, makeIR(sr, 'street', 7));
  lp.type = 'lowpass';
  s.connect(g); g.connect(lp); lp.connect(pan); pan.connect(oc.destination); lp.connect(rg); rg.connect(cv); cv.connect(oc.destination);
  let dPrev = -1, rate = 1;
  for (let t = 0; t < sec; t += 0.02) {
    const x = -speed * sec / 2 + speed * t, d = Math.hypot(x, lat);
    if (dPrev >= 0) { const r = 343 / (343 + (d - dPrev) / 0.02); rate += (r - rate) * 0.12; }
    dPrev = d;
    const a = 0.42 / (1 + d / 22) * 1.6;
    s.playbackRate.linearRampToValueAtTime(rate, t);
    g.gain.linearRampToValueAtTime(a, t);
    lp.frequency.linearRampToValueAtTime(350 + 12000 * Math.exp(-d / 110), t);
    pan.pan.linearRampToValueAtTime(Math.max(-0.85, Math.min(0.85, x / (d + 1))), t);
    rg.gain.linearRampToValueAtTime(Math.min(0.5, 0.06 + d / 300) * a * 2.2, t);
  }
  s.start(0);
  const r = await oc.startRendering();
  return { chans: [r.getChannelData(0), r.getChannelData(1)], sr };
}
const speech = (text, kind) => async () => ({ chans: [speakerChain(synthSpeech(text, { pitch: kind === 'heli' ? 102 : 108, seed: text.length * 13 + 7 }), kind, text.length + 3)], sr: SPEECH_SR });

export function makeLab(eng) {
  const renders = {
    siren_police_passby: () => passBy(eng, 'wail', 'police'),
    siren_police_yelp_passby: () => passBy(eng, 'yelp', 'police', 18, 6, 7),
    siren_ambulance_hilo: () => passBy(eng, 'hilo', 'ambulance', 14, 7, 8),
    siren_jandarma: () => passBy(eng, 'jwail', 'jandarma', 12, 10, 9),
    mega_teslim_ol: speech('Teslim ol! Türk Polisinden kaçamazsın!', 'mega'),
    mega_dur_yaklasma: speech('Dur! Yaklaşma!', 'mega'),
    mega_son_uyari: speech('Bu son uyarım, ateş açarım!', 'mega'),
    mega_aractan_in: speech('Araçtan in! Eller yukarı!', 'mega'),
    heli_hava_birimi: speech('Hava biriminden uyarı! Olduğun yerde kal!', 'heli'),
    heli_kacamazsin: speech('Helikopter seni görüyor! Kaçamazsın!', 'heli'),
    shout_polis: speech('Dur! Polis! Silahını bırak!', 'dry'),
  };
  for (const [n, f] of extra) renders[n] = () => f(eng);
  return {
    renders,
    plays: [
      (x, z) => eng.voice('Dur! Polis!', x, z, { mega: true }),
      ...plays.map((f) => (x, z, i) => f(eng, x, z, i)),
    ],
    active: () => activeCount(eng),
  };
}

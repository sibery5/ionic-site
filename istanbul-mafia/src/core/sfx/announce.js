// [ses B2] Anons çalıcı: megafon (ekip aracı / polis), helikopter hoparlörü ve çıplak bağırma.
// Satırlar ilk kullanımda (ya da boşta önceden) örneklenir ve önbelleğe alınır (en çok 28 satır, LRU).
// Yakında ve işletim sisteminde Türkçe ses varsa (Seçenek A) speechSynthesis kullanılır: WebAudio'ya yönlendirilemez,
// bu yüzden önüne/arkasına telsiz cırtı + PA uğultusu çalınır. Ayar: audio.ttsMode = 'auto' | 'off'.
import { synthSpeech, speakerChain, SPEECH_SR, probeTTS, ttsVoice } from './speech.js';
import { toBuffer } from './dsp.js';
import { play } from './voices.js';

const MAXC = 28;
export const HELI_LINES = [
  'Hava biriminden uyarı! Olduğun yerde kal!',
  'Helikopter seni görüyor! Kaçamazsın!',
  'Ellerini başının üstüne koy! Yere yat!',
  'Araçtan in! Eller yukarı!',
];
export const MEGA_LINES = [
  'Teslim ol! Türk Polisinden kaçamazsın!', 'Dur! Yaklaşma!', 'Bu son uyarım, ateş açarım!', 'Araçtan in! Eller yukarı!',
  'Dur! Polis!', 'Olduğun yerde kal!', 'Silahını bırak!', 'Aracı durdur!', 'Yere yat!',
];

function lineBuf(eng, text, kind, pitch, rate) {
  const C = eng._lineCache || (eng._lineCache = new Map());
  const key = kind + '|' + Math.round(pitch / 6) + '|' + rate.toFixed(2) + '|' + text;
  let b = C.get(key);
  if (b) { C.delete(key); C.set(key, b); return b; } // LRU tazele
  const dry = synthSpeech(text, { pitch, rate, shout: kind === 'dry' ? 0.8 : 1, seed: text.length * 13 + 7 });
  const wet = speakerChain(dry, kind, text.length + 3);
  b = toBuffer(eng.ctx, wet, SPEECH_SR);
  C.set(key, b);
  while (C.size > MAXC) C.delete(C.keys().next().value);
  return b;
}
export function prerenderLines(eng, list, kind = 'mega') { for (const t of list) lineBuf(eng, t, kind, 108, 1); }

// Telsiz cırtı + PA uğultusu (TTS sesine eşlik): WebAudio ile, kısa önceden örneklenmiş tampon
function chirpBuf(eng, end) {
  const k = end ? '_chirpE' : '_chirpS';
  if (eng[k]) return eng[k];
  const sr = SPEECH_SR, n = Math.floor(0.25 * sr), d = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / (0.08 * sr);
    if (u < 1) { const f = end ? 2300 - 1200 * u : 1500 + 900 * u; ph += f / sr; d[i] += Math.sin(6.2832 * ph) * Math.sin(Math.PI * u) * 0.5; }
    d[i] += (Math.random() * 2 - 1) * 0.06 * Math.exp(-i / (0.06 * sr)) * (end ? 2 : 0.6);
  }
  return (eng[k] = toBuffer(eng.ctx, speakerChain(d, 'mega', end ? 2 : 1), sr));
}

function speakTTS(eng, text, x, z, d, heli) {
  const v = ttsVoice(), ss = window.speechSynthesis;
  if (!v || !ss || ss.speaking) return 0;
  const vol = Math.max(0.15, Math.min(1, 1.1 - d / 70)) * eng.volume.master * eng.volume.sfx;
  play(eng, chirpBuf(eng, false), { x, z, range: 170, gain: 0.5, cat: 'voice', rev: 0.3 });
  const u = new SpeechSynthesisUtterance(text);
  u.voice = v; u.lang = v.lang; u.rate = 1.05; u.pitch = heli ? 0.7 : 0.8; u.volume = vol;
  u.onend = () => { if (eng.ctx) play(eng, chirpBuf(eng, true), { x, z, range: 170, gain: 0.5, cat: 'voice', rev: 0.3 }); };
  setTimeout(() => ss.speak(u), 140);
  return 0.35 + text.length * 0.068;
}

// Ana arayüz (eski voice() ile uyumlu): süre (sn) döner
export function speak(eng, text, x, z, { mega = true, pitch = 125, rate = 1, gain = 1, heli = false } = {}) {
  if (!eng.ctx || !text) return 0;
  const kind = heli ? 'heli' : mega ? 'mega' : 'dry';
  const L = eng.listener;
  const d = x === undefined ? 0 : Math.hypot(x - L.x, z - L.z);
  if (kind !== 'dry' && eng.ttsMode !== 'off' && d < 60 && typeof window !== 'undefined') {
    probeTTS();
    const r = speakTTS(eng, text, x, z, d, heli);
    if (r) return r;
  }
  const b = lineBuf(eng, text, kind, pitch, rate);
  play(eng, b, { x, z, range: heli ? 320 : mega ? 190 : 60, ref: heli ? 40 : mega ? 22 : 6, gain: (heli ? 1.05 : mega ? 0.95 : 0.75) * gain, cat: 'voice', rev: mega || heli ? 0.35 : 0.15 });
  return b.duration;
}

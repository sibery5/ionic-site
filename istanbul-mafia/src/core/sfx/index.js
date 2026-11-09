// [ses B2] Ses efektleri katmanı: AudioEngine prototipine yeni ses işlevlerini takar.
// audio.js'teki araç/motor sesleri (B1) dokunulmadan kalır; buradaki işlevler ayrı modüllerdedir:
//   dsp.js (çevrimdışı DSP), voices.js (havuzlu çalma + bütçe), siren.js, speech.js + announce.js,
//   weapons.js, world.js (patlama, isabet, ayak sesi, kapı, ambiyans), ui.js, ../music.js.
import { makeIR, toBuffer } from './dsp.js';
import { initVoices } from './voices.js';
import { updateSirens, stopAllSirens, sirenBuffer } from './siren.js';
import { speak, prerenderLines, MEGA_LINES, HELI_LINES } from './announce.js';
import { makeLab } from './lab.js';

export function installSfx(AudioEngine) {
  const P = AudioEngine.prototype;
  const baseInit = P.init, baseUpdate = P.update;

  Object.assign(P, {
    init() {
      const first = !this.ctx;
      baseInit.call(this);
      if (!first || !this.ctx) return;
      initVoices(this);
      this.ttsMode = this.ttsMode || 'auto';
      this.space = null;
      this.setSpace('street');
      // boşta önceden örnekleme: ilk silah sesi / anons oyun sırasında takılma yaratmasın
      this._prewarm = [
        () => sirenBuffer(this, 'wail', 'police'),
        () => sirenBuffer(this, 'yelp', 'police'),
        () => prerenderLines(this, MEGA_LINES.slice(0, 3), 'mega'),
        () => prerenderLines(this, MEGA_LINES.slice(3, 6), 'mega'),
        () => prerenderLines(this, HELI_LINES.slice(0, 2), 'heli'),
      ];
      this._prewarmStep();
      // bekçi: oyun güncellemesi durunca (menü/duraklatma) sirenleri sustur
      setInterval(() => { if (this.ctx && this.ctx.currentTime - this.lastUpdate > 0.5) stopAllSirens(this); }, 500);
    },
    _prewarmStep() {
      const q = this._prewarm;
      if (!q || !q.length) return;
      const run = () => { const f = q.shift(); if (f) { try { f(); } catch (e) { /* tek görev başarısız: devam */ } } if (q.length) this._prewarmStep(); };
      if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1500 }); else setTimeout(run, 60);
    },
    // Yankı ortamı: street | room | tunnel. Kıvrım (convolver) tamponu değiştirilirken gönderim kısa süre kısılır.
    setSpace(kind) {
      if (!this.ctx || this.space === kind) return;
      this.space = kind;
      const IR = this._irs || (this._irs = {});
      if (!IR[kind]) IR[kind] = toBuffer(this.ctx, makeIR(this.ctx.sampleRate, kind, 7));
      const t = this.ctx.currentTime, g = this.revGain.gain;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + 0.05);
      setTimeout(() => { this.reverb.buffer = IR[kind]; const t2 = this.ctx.currentTime; g.setValueAtTime(0, t2); g.linearRampToValueAtTime(kind === 'room' ? 0.42 : kind === 'tunnel' ? 0.5 : 0.34, t2 + 0.15); }, 70);
    },
    update(dt, game) {
      baseUpdate.call(this, dt, game);
      if (!this.ctx || !game || !game.player) return;
      const p = game.player;
      this.setSpace(p.inInterior ? 'room' : 'street');
      this.indoor = !!p.inInterior;
      updateSirens(this, dt, game);
    },
    // aranma seviyesi: uzak siren yatağı (yakındaki sirenli araçlar konumlu çalar)
    setSiren(level) {
      this._sirenLevel = Math.max(0, level || 0);
    },
    // Konuşma: (metin, x, z, { mega, pitch, rate, gain, heli }) -> süre
    voice(text, x, z, opts = {}) { return speak(this, text, x, z, opts); },
    megaphone(text, x, z, opts = {}) { return speak(this, text, x, z, Object.assign({ mega: true }, opts)); },
    heliAnnounce(text, x, z) { return speak(this, text, x, z, { heli: true, pitch: 102 }); },
  });
  // test laboratuvarı (audio2-steps.js): ilk erişimde kurulur
  Object.defineProperty(P, 'sfxLab', { get() { return this._lab || (this._lab = makeLab(this)); } });
}

// [ses B2] Ses efektleri katmanı: AudioEngine prototipine yeni ses işlevlerini takar.
// audio.js'teki araç/motor sesleri (B1) dokunulmadan kalır; buradaki işlevler ayrı modüllerdedir:
//   dsp.js (çevrimdışı DSP), voices.js (havuzlu çalma + bütçe), siren.js, speech.js + announce.js,
//   weapons.js, world.js (patlama, isabet, ayak sesi, kapı, ambiyans), ui.js, ../music.js.
import { makeIR, toBuffer } from './dsp.js';
import { initVoices } from './voices.js';
import { updateSirens, stopAllSirens, sirenBuffer } from './siren.js';
import { speak, prerenderLines, MEGA_LINES, HELI_LINES } from './announce.js';
import { gunshot, weaponPrewarm, whiz, dryFire } from './weapons.js';
import * as WD from './world.js';
import { uiSound, uiPrewarm } from './ui.js';
import { installMusic } from '../music.js';
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
      this._prewarm.unshift(...uiPrewarm(this));
      this._prewarm.push(...weaponPrewarm(this), ...WD.worldPrewarm(this));
      this._prewarmStep();
      // bekçi: oyun güncellemesi durunca (menü/duraklatma) sirenleri sustur
      setInterval(() => { if (this.ctx && this.ctx.currentTime - this.lastUpdate > 0.5) stopAllSirens(this); }, 500);
    },
    _prewarmStep() {
      const q = this._prewarm;
      if (!q || !q.length || this._pwBusy) return;
      this._pwBusy = true;
      const run = () => { this._pwBusy = false; const f = q.shift(); if (f) { try { f(); } catch (e) { /* tek görev başarısız: devam */ } } if (q.length) this._prewarmStep(); };
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
      this._game = game;
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
    // Silah sesi (katmanlı geçici + kentsel/oda kuyruğu)
    gunshot(kind, x, z) { gunshot(this, kind, x, z); },
    whiz(k = 1, sx = 0, sz = 0, crack = false) { whiz(this, k, sx, sz, crack); },
    empty() { dryFire(this); },
    explosion(x, z, sc = 1) { WD.explosion(this, x, z, sc); },
    impact(x, z, surf = 'concrete') { WD.impact(this, x, z, surf); },
    impactMetal(x, z) { WD.impact(this, x, z, 'metal'); },
    ricochet(x, z) { WD.ricochet(this, x, z); },
    shell(x, z, plastic = false, k = 1) { WD.shell(this, x, z, plastic, k); },
    step(x, z, surface) { WD.step(this, x, z, surface); },
    // kapı: open=true açılış (mandal + menteşe gıcırtısı), false kapanış (gövde + mandal). kind: wood | metal | car
    door(x, z, open = true, kind = 'wood') { WD.door(this, x, z, open, kind); },
    seagull(x, z, k = 1) { WD.seagull(this, x, z, k); },
    bark(x, z) { WD.bark(this, x, z); },
    setAmbience(k = 0) { WD.setAmbience(this, k); },
    ambienceEvents(dt) { WD.ambienceEvents(this, dt, this._game); },
    click() { uiSound(this, 'click'); },
    hover() { uiSound(this, 'hover'); },
    cash() { uiSound(this, 'cash'); },
    error() { uiSound(this, 'error'); },
    success() { uiSound(this, 'success'); },
    fail() { uiSound(this, 'fail'); },
    // Konuşma: (metin, x, z, { mega, pitch, rate, gain, heli }) -> süre
    voice(text, x, z, opts = {}) { return speak(this, text, x, z, opts); },
    megaphone(text, x, z, opts = {}) { return speak(this, text, x, z, Object.assign({ mega: true }, opts)); },
    heliAnnounce(text, x, z) { return speak(this, text, x, z, { heli: true, pitch: 102 }); },
  });
  installMusic(P);
  // test laboratuvarı (audio2-steps.js): ilk erişimde kurulur
  Object.defineProperty(P, 'sfxLab', { get() { return this._lab || (this._lab = makeLab(this)); } });
}

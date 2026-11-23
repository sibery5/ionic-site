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
import { enginePrewarm } from './engine.js';
import { crash, scrape, crashPrewarm } from './crash.js';
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
        // [donma] bütün siren türleri (her biri ~200 ms sentez): 5★'da yeni tür ilk kez gelince oyun takılıyordu
        ...[['wail', 'police'], ['yelp', 'police'], ['phaser', 'police'], ['hilo', 'ambulance'], ['awail', 'ambulance'], ['jwail', 'jandarma'], ['jyelp', 'jandarma']].map(([m, h]) => () => sirenBuffer(this, m, h)),
        () => prerenderLines(this, MEGA_LINES.slice(0, 3), 'mega'),
        () => prerenderLines(this, MEGA_LINES.slice(3, 6), 'mega'),
        () => prerenderLines(this, HELI_LINES.slice(0, 2), 'heli'),
      ];
      this._prewarm.unshift(...uiPrewarm(this));
      this._prewarm.push(...weaponPrewarm(this), ...crashPrewarm(this), ...WD.worldPrewarm(this));
      if (this.glassPrewarm) this._prewarm.push(...this.glassPrewarm()); // [B1] cam/et bankaları
      this._prewarm.push(...enginePrewarm(this.ctx)); // [donma] motor döngü bankaları
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
      // [ses S2] duvara sürtünme: oyuncunun aracının yan yüzü (ön/orta/arka üç daire) bir engele değiyor ve araç kayıyorsa sürtünme döngüsü
      let sk = 0;
      const v = p.vehicle;
      if (v && v.def && v.kind === 'car' && game.physics && game.physics.resolveCircle) {
        const sp = Math.hypot(v.vx || 0, v.vz || 0);
        if (sp > 2) {
          const d = v.def, hx = d.wid / 2 + 0.12, hz = d.len / 2 - hx * 0.6, s = Math.sin(v.heading || 0), c = Math.cos(v.heading || 0);
          const T = this._scrP || (this._scrP = { x: 0, y: 0, z: 0 });
          for (let i = -1; i <= 1 && !sk; i++) {
            T.x = v.pos.x + s * hz * i; T.z = v.pos.z + c * hz * i;
            if (game.physics.resolveCircle(T, hx, v.pos.y + 0.45, 0.9, 0).hit) sk = Math.min(1, 0.25 + sp / 18);
          }
        }
      }
      if (sk || this.loops.scrape) scrape(this, sk);
    },
    // [ses S2] araç çarpışması: hıza göre üç düzey (gövde + sac + ezilme + cam + parça dökülmesi), sentez önceden
    crash(x, z, k = 1) { crash(this, x, z, k); },
    crashMetal(x, z, k = 1) { if (k > 0.9) crash(this, x, z, k * 0.6); }, // çarpışmanın kendisi crash() ile çalar; ağır yan darbede ek ezilme
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
    step(x, z, surface, k) { WD.step(this, x, z, surface, k); },
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
    phone() { uiSound(this, 'phone'); }, // [ses] telefon zili (arayüz bağlanınca)
    // Konuşma: (metin, x, z, { mega, pitch, rate, gain, heli }) -> süre
    voice(text, x, z, opts = {}) { return speak(this, text, x, z, opts); },
    megaphone(text, x, z, opts = {}) { return speak(this, text, x, z, Object.assign({ mega: true }, opts)); },
    heliAnnounce(text, x, z) { return speak(this, text, x, z, { heli: true, pitch: 102 }); },
  });
  installMusic(P);
  // test laboratuvarı (audio2-steps.js): ilk erişimde kurulur
  Object.defineProperty(P, 'sfxLab', { get() { return this._lab || (this._lab = makeLab(this)); } });
}

// Hikâye diyalog sistemi: konuşmacı renkleri, seçimler, sinematik kamera, telefon çağrıları ve görev HUD'u.
// Stiller bu modül tarafından enjekte edilir (styles.css başka ekibe ait).
import * as THREE from 'three';

export const SPEAKERS = {
  'Reis Baba': { color: '#d4af37', freq: 150 },
  'Leyla': { color: '#ff8ab8', freq: 420 },
  'Kenan': { color: '#ff5a46', freq: 210 },
  'Cin Ali': { color: '#5ad1ff', freq: 300 },
  'Komiser Nevzat': { color: '#8fa8ff', freq: 180 },
  'Kara Yılan': { color: '#3ddc5d', freq: 260 },
  'Doğan Bey': { color: '#f2f2f2', freq: 170 },
  'Hacı Rüstem': { color: '#f0a838', freq: 190 },
  'Deli Murat': { color: '#4d9cff', freq: 330 },
  'Bozkurt Selim': { color: '#d84040', freq: 140 },
  'Sinan': { color: '#c8b48a', freq: 280 },
  'Topal Kemal': { color: '#b07a5a', freq: 230 },
  'Telsiz': { color: '#9ad08a', freq: 520 },
  'Kasap Tahsin': { color: '#c86a4a', freq: 120 },
  'Gözcü Rıza': { color: '#a0a8b0', freq: 250 },
  'Terzi Nuri': { color: '#d8c090', freq: 270 },
  'Zeynep': { color: '#ffb0c8', freq: 560 },
  'Muhbir Cemil': { color: '#b8a070', freq: 240 },
  'Şoför Yaşar': { color: '#8a8a8a', freq: 200 },
  'Engerek': { color: '#7ae070', freq: 280 },
  'Atilla': { color: '#e0e0ff', freq: 220 },
  'Sen': { color: '#efe6d2', freq: 240 },
};
const DEFAULT_SPK = { color: '#c9b88e', freq: 260 };

const CSS = `
.dialog .who.spk { text-shadow: 0 0 14px currentColor; }
.dialog .dlg-act { position: absolute; top: -24px; left: 0; font: 11px var(--sans); letter-spacing: 0.32em; color: #8a7e68; text-transform: uppercase; }
.dialog .dlg-choices { margin-top: 14px; display: flex; flex-direction: column; gap: 6px; }
.dialog .dlg-choice { font: 17px var(--serif); text-align: left; background: rgba(255,255,255,0.03); border: 1px solid #4a3e2a; color: var(--paper); padding: 8px 14px; cursor: var(--cursor); pointer-events: auto; transition: all 0.12s; }
.dialog .dlg-choice kbd { margin-right: 10px; }
.dialog .dlg-choice small { display: block; margin: 3px 0 0 40px; font: 12px var(--sans); color: #8a7e68; }
.dialog .dlg-choice.on { border-color: var(--gold); background: rgba(212,175,55,0.16); color: #fff; transform: translateX(4px); }
.dialog .dlg-choice.off { opacity: 0.38; pointer-events: none; }
.call-card { position: fixed; right: 34px; top: 22vh; width: 250px; padding: 18px 16px 14px; border-radius: 30px; background: linear-gradient(170deg, rgba(34,26,22,0.97), rgba(10,8,8,0.97)); box-shadow: 0 0 0 2px #4a3e2a, 0 0 0 4px #0a0806, 0 24px 60px rgba(0,0,0,0.8); z-index: 26; text-align: center; font: 13px var(--sans); color: var(--paper); animation: callIn 0.35s cubic-bezier(.2,.9,.3,1.2); }
.call-card .cc-top { font: bold 10px var(--sans); letter-spacing: 0.3em; color: #a89a7e; }
.call-card .cc-av { width: 82px; height: 82px; margin: 12px auto 8px; border-radius: 50%; position: relative; display: flex; align-items: center; justify-content: center; font: 900 30px var(--serif); color: #120c06; }
.call-card .cc-av::before, .call-card .cc-av::after { content: ''; position: absolute; inset: -6px; border-radius: 50%; border: 2px solid var(--c); opacity: 0; animation: callPulse 1.6s ease-out infinite; }
.call-card .cc-av::after { animation-delay: 0.8s; }
.call-card b { display: block; font: bold 19px var(--sans); color: #fff; }
.call-card small { display: block; color: #a89a7e; margin-top: 2px; }
.call-card .cc-btns { display: flex; justify-content: space-around; margin-top: 14px; }
.call-card .cc-btns div { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 11px; color: #c9b88e; }
.call-card .cc-btns i { width: 46px; height: 46px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font: bold 13px var(--sans); color: #fff; font-style: normal; }
.call-card .cc-ok i { background: linear-gradient(180deg, #2fbf5a, #137a30); animation: callShake 0.9s ease-in-out infinite; }
.call-card .cc-no i { background: linear-gradient(180deg, #d83a3a, #7a1010); }
.call-card.missed { animation: callOut 0.4s ease-in forwards; }
@keyframes callIn { from { transform: translateX(120%) scale(0.9); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes callOut { to { transform: translateX(120%); opacity: 0; } }
@keyframes callPulse { 0% { transform: scale(0.9); opacity: 0.9; } 100% { transform: scale(1.45); opacity: 0; } }
@keyframes callShake { 0%, 100% { transform: rotate(0); } 20% { transform: rotate(-14deg); } 40% { transform: rotate(12deg); } 60% { transform: rotate(-8deg); } }
.dialog.oncall { border-left: 3px solid #2fbf5a; }
.dialog .dlg-call { position: absolute; top: -24px; right: 0; font: bold 11px var(--sans); letter-spacing: 0.2em; color: #2fbf5a; }
.story-meter { position: fixed; left: 50%; top: 17vh; transform: translateX(-50%); width: 260px; text-align: center; font: bold 12px var(--sans); letter-spacing: 0.18em; color: var(--paper); text-shadow: 0 2px 6px #000; z-index: 15; }
.story-meter i { display: block; height: 6px; margin-top: 5px; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.25); }
.story-meter i b { display: block; height: 100%; width: 0; background: var(--c, #d4af37); transition: width 0.1s; }
.story-replay .rp { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid rgba(212,175,55,0.12); }
.story-replay .rp span { flex: 1; } .story-replay .rp small { color: #8a7e68; display: block; }
.story-replay h3 { margin-top: 12px; }
`;

function injectCSS() {
  if (typeof document === 'undefined' || document.getElementById('story-css')) return;
  const s = document.createElement('style');
  s.id = 'story-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

// Satır biçimleri: ['Konuşmacı', 'Metin', {cam, act}] veya {who, text, cam, choice:[{label, value, hint, lines, disabled}], key}
function norm(L) {
  if (Array.isArray(L)) return { who: L[0], text: L[1], ...(L[2] || {}) };
  return L;
}

export class Dialogue {
  constructor(game) {
    this.g = game;
    this.open = false;
    injectCSS();
    this.phoneEl = null;
    this.call = null;
    this.meterEl = null;
    window.addEventListener('keydown', (e) => {
      if (!this.call || this.open || this.g.mode !== 'playing' || this.g.ui.blocking()) return;
      if (e.code === 'KeyT') { e.preventDefault(); this.answer(); } else if (e.code === 'KeyG') { e.preventDefault(); this.decline(); }
    });
  }

  speaker(who) { return SPEAKERS[who] || DEFAULT_SPK; }
  displayName(who) { return who === 'Sen' && this.g.state ? this.g.state.name || 'Sen' : who; }

  // Diyaloğu oynat. done(results) seçim sonuçlarıyla çağrılır.
  play(rawLines, done, opts = {}) {
    const g = this.g;
    const ui = g.ui;
    const d = ui.dialogEl;
    const lines = rawLines.map(norm);
    const results = {};
    let i = 0;
    let choiceIdx = 0;
    let choices = null;
    let shownAt = 0;
    let typer = null;
    // açık bir diyalog varken yenisi gelirse öncekini düzgünce kapat (dinleyiciler üst üste binmesin)
    if (this.open && this._finish) this._finish();
    this.open = true;
    g.input.unlock();
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      if (this._finish === finish) this._finish = null;
      clearInterval(typer);
      d.classList.add('hidden'); d.classList.remove('oncall'); ui.root.classList.remove('cinema');
      window.removeEventListener('keydown', key); d.removeEventListener('click', onClick);
      this.open = false;
      g.cutsceneCam = null;
      if (!ui.modalStack.length && g.mode === 'playing') g.input.lock();
      if (done) done(results);
    };
    const show = () => {
      const L = lines[i];
      if (!L) { finish(); return; }
      if (L.cam !== undefined) g.cutsceneCam = typeof L.cam === 'function' ? L.cam() : L.cam;
      if (L.onShow) L.onShow();
      const spk = this.speaker(L.who);
      choices = L.choice ? L.choice.map((c) => ({ ...c, off: typeof c.disabled === 'function' ? c.disabled() : !!c.disabled })) : null;
      choiceIdx = choices ? Math.max(0, choices.findIndex((c) => !c.off)) : 0;
      const act = L.act || opts.act;
      d.classList.toggle('oncall', !!opts.phone);
      d.innerHTML = `${opts.phone ? `<div class="dlg-call">TELEFON · ${esc(opts.phone)}</div>` : ''}${act ? `<div class="dlg-act">${esc(act)}</div>` : ''}<div class="who spk" style="color:${spk.color}">${esc(this.displayName(L.who || ''))}</div><div class="txt"></div>${choices ? '<div class="dlg-choices"></div>' : '<div class="next">Devam <kbd>Enter</kbd></div>'}`;
      const t = d.querySelector('.txt');
      const text = L.text || '';
      let k = 0;
      clearInterval(typer);
      typer = setInterval(() => { k += 2; t.textContent = text.slice(0, k); if (k >= text.length) { clearInterval(typer); renderChoices(); } }, 16);
      d._full = () => { clearInterval(typer); t.textContent = text; renderChoices(); };
      d._len = text.length;
      shownAt = performance.now();
      if (g.audio && g.audio.tone) g.audio.tone({ freq: spk.freq, dur: 0.06, type: 'triangle', gain: 0.05 });
      if (!text) renderChoices();
    };
    const renderChoices = () => {
      if (!choices) return;
      const box = d.querySelector('.dlg-choices');
      if (!box || box.childElementCount) { highlight(); return; }
      choices.forEach((c, ci) => {
        const b = document.createElement('div');
        b.className = 'dlg-choice' + (c.off ? ' off' : '');
        b.innerHTML = `<kbd>${ci + 1}</kbd>${esc(c.label)}${c.hint ? `<small>${esc(c.off && c.offHint ? c.offHint : c.hint)}</small>` : ''}`;
        b.addEventListener('mouseenter', () => { if (!c.off) { choiceIdx = ci; highlight(); } });
        b.addEventListener('click', (e) => { e.stopPropagation(); pick(ci); });
        box.appendChild(b);
      });
      highlight();
    };
    const highlight = () => {
      const box = d.querySelector('.dlg-choices');
      if (!box) return;
      [...box.children].forEach((b, ci) => b.classList.toggle('on', ci === choiceIdx));
    };
    const pick = (ci) => {
      const c = choices && choices[ci];
      if (!c || c.off) return;
      const L = lines[i];
      if (L.key) results[L.key] = c.value;
      if (opts.onChoice) opts.onChoice(L.key, c.value);
      if (c.action) c.action();
      g.audio && g.audio.click && g.audio.click();
      const extra = (typeof c.lines === 'function' ? c.lines() : c.lines || []).map(norm);
      lines.splice(i + 1, 0, ...extra);
      choices = null;
      i++;
      show();
    };
    const advance = () => {
      const t = d.querySelector('.txt');
      if (t && t.textContent.length < d._len) { d._full(); return; }
      if (choices) { if (performance.now() - shownAt > 250) pick(choiceIdx); return; }
      i++;
      g.audio && g.audio.click && g.audio.click();
      if (i >= lines.length) finish(); else show();
    };
    const onClick = () => { if (!choices) advance(); };
    const key = (e) => {
      if (choices) {
        const t = d.querySelector('.txt');
        if (t && t.textContent.length < d._len) { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); d._full(); } return; }
        const m = /^(Digit|Numpad)([1-9])$/.exec(e.code);
        if (m) { e.preventDefault(); pick(+m[2] - 1); return; }
        if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); do { choiceIdx = (choiceIdx + 1) % choices.length; } while (choices[choiceIdx].off); highlight(); return; }
        if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); do { choiceIdx = (choiceIdx + choices.length - 1) % choices.length; } while (choices[choiceIdx].off); highlight(); return; }
      }
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') { e.preventDefault(); advance(); }
    };
    this._finish = finish;
    d.classList.remove('hidden');
    ui.root.classList.add('cinema');
    setTimeout(() => { if (!ended) window.addEventListener('keydown', key); }, 150);
    d.addEventListener('click', onClick);
    show();
  }

  // ---------------- telefon ----------------
  // Gelen arama kartı: arayanın portresi (baş harf + konuşmacı rengi), zil sesi (WebAudio), T aç · G reddet.
  // opts: {lines, ring:'reis'|'kalp'|'normal', sub, onDecline, onMiss}
  ring(caller, onAnswer, timeout = 40, opts = {}) {
    this.hangup();
    const spk = this.speaker(caller);
    this.call = { caller, onAnswer, t: timeout, opts };
    this.ringT = 0;
    const e = document.createElement('div');
    e.className = 'call-card story-phone';
    const ini = esc(String(caller).split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase());
    e.innerHTML = `<div class="cc-top">GELEN ARAMA</div><div class="cc-av" style="--c:${spk.color};background:radial-gradient(circle at 35% 30%, #fff8, transparent 55%), ${spk.color}">${ini}</div><b>${esc(caller)}</b><small>${esc(opts.sub || 'Cep · arıyor...')}</small>
      <div class="cc-btns"><div class="cc-no"><i>G</i>Reddet</div><div class="cc-ok"><i>T</i>Aç</div></div>`;
    e.querySelector('.cc-ok').onclick = () => this.answer();
    e.querySelector('.cc-no').onclick = () => this.decline();
    this.g.ui.root.appendChild(e);
    this.phoneEl = e;
  }
  answer() {
    const c = this.call;
    this.hangup();
    if (!c) return;
    if (this.g.audio && this.g.audio.phoneBeep) this.g.audio.phoneBeep(1);
    if (c.opts && c.opts.lines) this.play(c.opts.lines, () => { if (c.onAnswer) c.onAnswer(); }, { phone: c.caller });
    else if (c.onAnswer) c.onAnswer();
  }
  decline() {
    const c = this.call;
    this.hangup();
    if (this.g.audio && this.g.audio.phoneBeep) this.g.audio.phoneBeep(2);
    if (c && c.opts && c.opts.onDecline) c.opts.onDecline();
  }
  hangup() {
    this.call = null;
    if (this.phoneEl) { const e = this.phoneEl; e.classList.add('missed'); setTimeout(() => e.remove(), 400); this.phoneEl = null; }
  }
  update(dt) {
    if (this.call) {
      this.call.t -= dt;
      this.ringT = (this.ringT || 0) - dt;
      if (this.ringT <= 0 && this.g.audio && this.g.audio.ringtone) { this.ringT = 2.6; this.g.audio.ringtone(this.call.opts.ring || 'normal'); }
      if (this.call.t <= 0) {
        const c = this.call;
        this.hangup();
        this.g.ui.notify(`Cevapsız arama: ${c.caller}. ${c.opts.missText || 'Konakta da konuşabilirsin.'}`, 'info');
        if (c.opts.onMiss) c.opts.onMiss();
      }
    }
  }

  // ---------------- görev ölçer (gizlilik, kelepçe, matkap...) ----------------
  meter(label, frac, color = '#d4af37') {
    if (frac === null || frac === undefined) { if (this.meterEl) this.meterEl.style.display = 'none'; return; }
    if (!this.meterEl) {
      const e = document.createElement('div');
      e.className = 'story-meter';
      e.innerHTML = '<span></span><i><b></b></i>';
      this.g.ui.root.appendChild(e);
      this.meterEl = e;
    }
    const e = this.meterEl;
    e.style.display = 'block';
    if (e._l !== label) { e.firstChild.textContent = label; e._l = label; }
    e.style.setProperty('--c', color);
    e.lastChild.firstChild.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }
}

// Sinematik kamera yardımcıları: iki nokta/aktör arasında omuz üstü çekim
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
export function shotBetween(a, b, side = 1, dist = 3.2, height = 1.7) {
  _a.set(a.x, (a.y || 0), a.z); _b.set(b.x, (b.y || 0), b.z);
  const dx = _b.x - _a.x, dz = _b.z - _a.z, l = Math.hypot(dx, dz) || 1;
  const mx = (_a.x + _b.x) / 2, mz = (_a.z + _b.z) / 2;
  const rx = -dz / l * side, rz = dx / l * side;
  const k = Math.max(dist, l * 0.9);
  return {
    pos: new THREE.Vector3(mx + rx * k - dx / l * 0.6, Math.max(_a.y, _b.y) + height + 0.4, mz + rz * k - dz / l * 0.6),
    look: new THREE.Vector3(mx, Math.max(_a.y, _b.y) + 1.45, mz),
  };
}
export function shotOver(from, to, height = 1.9) {
  const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz) || 1;
  const rx = -dz / l, rz = dx / l;
  return {
    pos: new THREE.Vector3(from.x - dx / l * 2.2 + rx * 0.7, (from.y || 0) + height, from.z - dz / l * 2.2 + rz * 0.7),
    look: new THREE.Vector3(to.x, (to.y || 0) + 1.4, to.z),
  };
}
export function shotWide(x, y, z, lx, ly, lz) { return { pos: new THREE.Vector3(x, y, z), look: new THREE.Vector3(lx, ly, lz) }; }

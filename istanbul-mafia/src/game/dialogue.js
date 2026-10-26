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
.story-phone { position: fixed; left: 26px; top: 46%; padding: 12px 18px; background: rgba(12,10,8,0.9); border-left: 3px solid #5ad1ff; font: 14px var(--sans); color: var(--paper); z-index: 25; animation: phoneRing 0.6s ease-in-out infinite alternate; }
.story-phone b { display: block; font: 900 12px var(--serif); letter-spacing: 0.25em; color: #5ad1ff; margin-bottom: 4px; }
@keyframes phoneRing { from { transform: translateX(0); } to { transform: translateX(6px); } }
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
      if (e.code === 'KeyT' && this.call && !this.open && this.g.mode === 'playing' && !this.g.ui.blocking()) { e.preventDefault(); this.answer(); }
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
    this.open = true;
    g.input.unlock();
    const finish = () => {
      clearInterval(typer);
      d.classList.add('hidden'); ui.root.classList.remove('cinema');
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
      d.innerHTML = `${act ? `<div class="dlg-act">${esc(act)}</div>` : ''}<div class="who spk" style="color:${spk.color}">${esc(this.displayName(L.who || ''))}</div><div class="txt"></div>${choices ? '<div class="dlg-choices"></div>' : '<div class="next">Devam <kbd>Enter</kbd></div>'}`;
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
    d.classList.remove('hidden');
    ui.root.classList.add('cinema');
    setTimeout(() => window.addEventListener('keydown', key), 150);
    d.addEventListener('click', onClick);
    show();
  }

  // ---------------- telefon ----------------
  ring(caller, onAnswer, timeout = 40) {
    this.hangup();
    this.call = { caller, onAnswer, t: timeout };
    const e = document.createElement('div');
    e.className = 'story-phone';
    e.innerHTML = `<b>TELEFON</b>${esc(caller)} arıyor... <kbd>T</kbd> Aç`;
    this.g.ui.root.appendChild(e);
    this.phoneEl = e;
    if (this.g.audio && this.g.audio.tone) { this.g.audio.tone({ freq: 880, dur: 0.15, type: 'sine', gain: 0.12 }); setTimeout(() => this.g.audio.tone({ freq: 660, dur: 0.15, type: 'sine', gain: 0.12 }), 200); }
  }
  answer() {
    const c = this.call;
    this.hangup();
    if (c && c.onAnswer) c.onAnswer();
  }
  hangup() {
    this.call = null;
    if (this.phoneEl) { this.phoneEl.remove(); this.phoneEl = null; }
  }
  update(dt) {
    if (this.call) {
      this.call.t -= dt;
      this.ringT = (this.ringT || 0) - dt;
      if (this.ringT <= 0 && this.g.audio && this.g.audio.tone) { this.ringT = 2.5; this.g.audio.tone({ freq: 880, dur: 0.12, type: 'sine', gain: 0.08 }); }
      if (this.call.t <= 0) { this.hangup(); this.g.ui.notify('Cevapsız arama. Konakta da konuşabilirsin.', 'info'); }
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

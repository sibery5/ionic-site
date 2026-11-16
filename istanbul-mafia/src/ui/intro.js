// [ses/intro] Oyun açılışı: ~44 sn sinematik intro. Yüklenmiş oyun dünyasının üzerinde 4 kamera planı + başlık.
// Neden ayrı modül: main.js'e tek kanca (startIntroOrMenu), menüye tek giriş (İNTROYU İZLE). Kamera, menü güncellemesinin
// (updateMenu: gök, şehir, ışık güncellenir) ARDINDAN yeniden konumlanır; böylece dünya kodu hiç değişmez.
// Zaman çizelgesi music.js'teki intro parçasıyla hizalıdır (ölçü = 3 sn, 80 BPM): 0 sn stüdyo vuruşu, 7. ölçüde ritim,
// 36 sn'de doruk + başlık. Herhangi bir tuş/fare ile atlanır; kaydı olan oyuncuda kendiliğinden oynamaz.
import { audio } from '../core/audio.js';
import { listSaves, latestSave } from '../game/save.js';

const SEEN = 'istanbul-mafia-intro-seen';
export const INTRO_LEN = 44;
const FADE = 0.8;
// planlar: [başlangıç, bitiş, kamera A, kamera B, bakış A, bakış B]. Koordinatlar map.js'teki yapılara göre.
const SHOTS = [
  // Boğaz ve 15 Temmuz Şehitler Köprüsü: sudan, köprüye doğru yavaş süzülme
  [4.5, 12.5, [560, 34, -250], [500, 48, -350], [330, 22, -450], [300, 26, -455]],
  // Haliç, Galata Köprüsü ve Galata Kulesi: alçak, yana kayan plan
  [12.5, 20.5, [-270, 20, 135], [-205, 27, 172], [-130, 30, 40], [-110, 36, 10]],
  // Tarihî yarımada: Ayasofya ve Sultanahmet üzerinde yükselen plan
  [20.5, 28.5, [120, 40, 650], [80, 85, 520], [-60, 30, 540], [-130, 25, 600]],
  // Kalabalık cadde ve konak: göz hizasında ilerleme
  [28.5, 36, [-160, 7, -110], [-105, 9, -140], [-70, 9, -160], [-55, 10, -165]],
  // Başlık: şehrin geniş havadan planı
  [36, INTRO_LEN, [700, 230, 60], [620, 190, -40], [0, 20, 120], [-40, 20, 160]],
];
// hikâye satırları: [görünme, kaybolma, metin]
const LINES = [
  [6.0, 11.6, 'On iki yıl sonra İstanbul\'a döndün.'],
  [14.0, 19.6, 'Sokaklar değişmiş. Kurallar aynı.'],
  [22.0, 27.6, 'Her köşede Reis Baba\'nın gölgesi var.'],
  [30.0, 35.4, 'Bu şehirde herkesin bir bedeli var.'],
];
const CSS = `
.intro{position:fixed;inset:0;z-index:9000;pointer-events:auto;cursor:none;overflow:hidden}
.intro .ib{position:absolute;left:0;right:0;height:11.5vh;background:#000;z-index:3}
.intro .ib.t{top:0}.intro .ib.b{bottom:0}
.intro .iv{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 55%,rgba(0,0,0,.62) 100%);z-index:2}
.intro .ik{position:absolute;inset:0;background:#000;z-index:4;opacity:1}
.intro .is{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:5;opacity:0;
  font:400 15px var(--serif,Georgia,serif);letter-spacing:.55em;color:#cbbf9f;text-align:center}
.intro .is b{display:block;font-weight:700;letter-spacing:.42em;color:#e9dcb8;font-size:20px;margin-bottom:10px}
.intro .il{position:absolute;left:0;right:0;bottom:15.5vh;text-align:center;z-index:5;opacity:0;
  font:italic 26px var(--serif,Georgia,serif);color:#f1e8d2;text-shadow:0 2px 10px #000,0 0 2px #000;letter-spacing:.02em}
.intro .it{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:5;opacity:0}
.intro .it span{font:400 30px var(--display,Georgia,serif);letter-spacing:.7em;color:#efe4c8;margin-left:.7em;text-shadow:0 2px 14px #000}
.intro .it em{font:700 132px var(--display,Georgia,serif);font-style:normal;letter-spacing:.06em;line-height:1;
  background:linear-gradient(180deg,#fff1c1 0%,#d9a93c 55%,#8a5e17 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  filter:drop-shadow(0 4px 18px rgba(0,0,0,.85))}
.intro .ix{position:absolute;right:3vw;bottom:3.4vh;z-index:6;opacity:0;transition:opacity .8s;font:13px var(--sans,sans-serif);color:#bfb39a;letter-spacing:.12em}
`;
const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (u) => u * u * (3 - 2 * u);
// a..b aralığında görünen, kenarlarda f sn'de yumuşayan opaklık
const win = (t, a, b, f) => clamp(Math.min((t - a) / f, (b - t) / f));

export class Intro {
  constructor(game) {
    this.g = game; this.t = 0; this.active = false; this.shot = -1; this.lineShown = []; this.skipped = false;
    this.onSkip = this.onSkip.bind(this);
  }
  play(onDone) {
    if (this.active) return;
    const g = this.g;
    this.onDone = onDone; this.t = 0; this.shot = -1; this.lineShown = []; this.skipped = false; this.active = true; this.camLog = [];
    g.ui.closeAll && g.ui.closeAll();
    if (!document.getElementById('intro-css')) { const s = document.createElement('style'); s.id = 'intro-css'; s.textContent = CSS; document.head.appendChild(s); }
    const el = (this.el = document.createElement('div'));
    el.className = 'intro';
    el.innerHTML = `<div class="iv"></div><div class="ib t"></div><div class="ib b"></div><div class="ik"></div>
      <div class="is"><div><b>İSTANBUL MAFYA TAKIMI</b>sunar</div></div><div class="il"></div>
      <div class="it"><span>İSTANBUL</span><em>MAFYA</em></div><div class="ix">Atlamak için bir tuşa bas</div>`;
    document.body.appendChild(el);
    this.q = (c) => el.querySelector(c);
    // atlama: yakalama evresinde; menü/oyun tuşlarına sızmasın
    this._armT = setTimeout(() => {
      window.addEventListener('keydown', this.onSkip, true);
      window.addEventListener('pointerdown', this.onSkip, true);
    }, 400);
    this._hintT = setTimeout(() => { if (this.el) this.q('.ix').style.opacity = 1; }, 2000);
    try { audio.init(); audio.startMusic('intro'); } catch (e) { console.error(e); }
    // kamera, menü güncellemesinden sonra (gök/şehir/ışık yine güncellenir)
    const orig = (this._origUpdate = g.updateMenu);
    g.updateMenu = (dt, tt) => { orig.call(g, dt, tt); this.update(dt); };
  }
  onSkip(e) {
    if (e.type === 'keydown' && (e.key === 'F11' || e.key === 'F12')) return;
    e.stopPropagation(); if (e.cancelable) e.preventDefault();
    this.skipped = true;
    this.finish();
  }
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const t = this.t, cam = this.g.camera, q = this.q;
    if (t >= INTRO_LEN) { this.finish(); return; }
    // plan seçimi ve kamera
    let k = SHOTS.length - 1;
    while (k > 0 && t < SHOTS[k][0]) k--;
    const [a, b, pa, pb, la, lb] = SHOTS[k];
    const u = ease(clamp((t - a) / (b - a)));
    cam.position.set(pa[0] + (pb[0] - pa[0]) * u, pa[1] + (pb[1] - pa[1]) * u, pa[2] + (pb[2] - pa[2]) * u);
    cam.lookAt(la[0] + (lb[0] - la[0]) * u, la[1] + (lb[1] - la[1]) * u, la[2] + (lb[2] - la[2]) * u);
    if (cam.fov !== 42) { cam.fov = 42; cam.updateProjectionMatrix(); }
    if (k !== this.shot) { this.shot = k; this.camLog.push({ t: +t.toFixed(2), shot: k, x: Math.round(cam.position.x), y: Math.round(cam.position.y), z: Math.round(cam.position.z) }); }
    // siyah perde: stüdyo kartında tam, planlar arasında kararma/açılma, sonda kararma
    let black = t < SHOTS[0][0] ? 1 : 0;
    for (const s of SHOTS) black = Math.max(black, 1 - clamp(Math.abs(t - s[0]) / FADE));
    black = Math.max(black, clamp((t - (INTRO_LEN - 1.5)) / 1.5));
    q('.ik').style.opacity = black.toFixed(3);
    q('.is').style.opacity = win(t, 0.4, 3.9, 0.7).toFixed(3);
    // hikâye satırları (sırayla, tek seferde bir satır)
    let line = -1;
    for (let i = 0; i < LINES.length; i++) if (t >= LINES[i][0] && t < LINES[i][1]) line = i;
    const L = q('.il');
    if (line >= 0) {
      if (L.dataset.i !== String(line)) { L.textContent = LINES[line][2]; L.dataset.i = line; this.lineShown.push(line); }
      L.style.opacity = win(t, LINES[line][0], LINES[line][1], 0.7).toFixed(3);
    } else L.style.opacity = 0;
    // başlık: doruk vuruşuyla (36,15 sn) belirir, hafifçe büyür
    const T = q('.it'), tt = t - 36.3;
    T.style.opacity = (tt > 0 ? clamp(tt / 1.2) * clamp((INTRO_LEN - 0.4 - t) / 1.4) : 0).toFixed(3);
    T.style.transform = `scale(${(0.94 + 0.06 * clamp(tt / 7)).toFixed(4)})`;
  }
  finish() {
    if (!this.active) return;
    this.active = false;
    const g = this.g;
    clearTimeout(this._armT); clearTimeout(this._hintT);
    window.removeEventListener('keydown', this.onSkip, true);
    window.removeEventListener('pointerdown', this.onSkip, true);
    g.updateMenu = this._origUpdate;
    if (g.camera.fov !== 55) { g.camera.fov = 55; g.camera.updateProjectionMatrix(); }
    try { localStorage.setItem(SEEN, '1'); } catch (e) { /* yok say */ }
    const el = this.el; this.el = null;
    if (el) { el.style.transition = 'opacity .6s'; el.style.opacity = 0; setTimeout(() => el.remove(), 650); }
    try { if (audio.ctx) audio.startMusic('menu'); } catch (e) { console.error(e); }
    if (g.mode === 'menu') g.ui.mainMenu();
    const cb = this.onDone; this.onDone = null; cb && cb(this.skipped);
  }
}

// [ses/intro] main.js kancası: ilk açılışta (kayıt yoksa, daha önce izlenmediyse) introyu oynat, yoksa doğrudan menü.
// Otomatik testlerde (navigator.webdriver) yalnız adreste ?intro varsa oynar; diğer testlerin menü beklentisi bozulmasın.
export async function startIntroOrMenu(game) {
  game.intro = new Intro(game);
  let auto = false;
  try {
    const forced = /[?&]intro\b/.test(location.search);
    const seen = localStorage.getItem(SEEN);
    let hasSave = false;
    if (!forced) { hasSave = !!(await latestSave(await listSaves())); }
    auto = forced || (!navigator.webdriver && !seen && !hasSave);
  } catch (e) { console.error(e); }
  if (auto && game.mode === 'menu') game.intro.play();
  else game.ui.mainMenu();
}

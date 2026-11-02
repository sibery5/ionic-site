// Hikâye dalgası sistemlerini bir araya getirir: sevgili (romance), ödül avı (bounties), kapkaç etkileşimleri
// (side_missions) ve görev defteri kısayolu (J). main.js yalnızca update/prompt çağırır.
import { Romance } from './romance.js';
import { Bounties } from './bounties.js';

export class Social {
  constructor(game) {
    this.g = game;
    this.romance = new Romance(game);
    this.bounties = new Bounties(game);
    window.addEventListener('keydown', (e) => this.onKey(e));
  }
  onKey(e) {
    const g = this.g, ui = g.ui;
    if (g.mode !== 'playing' || e.repeat) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    const top = ui.modalStack[ui.modalStack.length - 1];
    if (top && top.kind === 'journal') {
      if (e.code === 'KeyJ') { ui.closeModal(top); return; }
      const m = /^Digit([1-5])$/.exec(e.code);
      if (m) { e.preventDefault(); top.setTab(+m[1] - 1); }
      return;
    }
    if (e.code === 'KeyJ' && !ui.blocking()) ui.openJournal();
  }
  prompt() {
    if (!this.g.state) return null;
    return this.romance.prompt() || this.bounties.prompt() || this.g.missions.side.prompt();
  }
  update(dt) {
    if (!this.g.state) return;
    this.romance.update(dt);
    this.bounties.update(dt);
  }
  // yeni oyun / kayıt yükleme: sahnedeki geçici varlıkları bırak
  reset() {
    const R = this.romance;
    for (const id of Object.keys(R.npcs)) R.despawn(id);
    R.with = null; R.hand = false; R.scene = null; R.meet = null; R.datePt = null;
    this.bounties.live = null;
    R.updateMarkers(true); this.bounties.updateMarkers(true);
  }
}

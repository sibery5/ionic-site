import { t } from '../core/i18n';
import { icon } from './icons';

// Ara sahnelerin konuşma kutusu: konuşanın adı, daktilo gibi yazılan metin, devam ipucu.

export class Dialogue {
  private root: HTMLElement;
  private nameEl: HTMLElement;
  private textEl: HTMLElement;
  private choiceEl: HTMLElement;
  private onPick: ((i: number) => void) | null = null;
  private full = '';
  private shown = 0;
  typing = false;

  constructor(parent: HTMLElement, title: string, private onNext: () => void, onSkip: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'dialogue';
    this.root.innerHTML = `<div class="dlg-title">${title}</div><div class="dlg-box"><div class="dlg-name"></div><div class="dlg-text"></div><div class="dlg-hint">${t('continueKey')}</div></div><button class="btn small dlg-skip">${icon('skip')}</button>`;
    parent.appendChild(this.root);
    this.nameEl = this.root.querySelector('.dlg-name') as HTMLElement;
    this.textEl = this.root.querySelector('.dlg-text') as HTMLElement;
    this.choiceEl = document.createElement('div');
    this.choiceEl.className = 'dlg-choices hidden';
    this.root.querySelector('.dlg-box')!.appendChild(this.choiceEl);
    this.root.querySelector('.dlg-box')!.addEventListener('click', () => this.next());
    this.root.querySelector('.dlg-skip')!.addEventListener('click', (e) => {
      e.stopPropagation();
      onSkip();
    });
  }

  say(name: string, text: string) {
    this.nameEl.textContent = name;
    this.nameEl.classList.toggle('hidden', !name);
    this.full = text;
    this.shown = 0;
    this.typing = true;
    this.textEl.textContent = '';
  }

  /** Seçenekleri göster; seçilince pick(i). Seçim bekleyen kutu tıklamayla geçilmez. */
  choices(options: string[], pick: (i: number) => void) {
    this.onPick = pick;
    this.choiceEl.innerHTML = '';
    options.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'btn dlg-choice';
      b.innerHTML = `<span class="dc-key">${i + 1}</span>${o}`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.choose(i);
      });
      this.choiceEl.appendChild(b);
    });
    this.root.classList.add('choosing');
    // seçenekler replik yazılıp bitince belirir
    if (!this.typing) this.choiceEl.classList.remove('hidden');
  }

  get choosing() {
    return !!this.onPick;
  }

  choose(i: number) {
    const f = this.onPick;
    if (!f || this.typing || i < 0 || i >= this.choiceEl.children.length) return;
    this.onPick = null;
    this.choiceEl.classList.add('hidden');
    this.root.classList.remove('choosing');
    f(i);
  }

  /** Yazılıyorsa tamamla, bittiyse sonraki replik. */
  next() {
    if (this.typing) {
      this.shown = this.full.length;
      this.textEl.textContent = this.full;
      this.typing = false;
      if (this.onPick) this.choiceEl.classList.remove('hidden');
      return;
    }
    if (this.onPick) return;
    this.onNext();
  }

  update(dt: number) {
    if (!this.typing) return;
    this.shown = Math.min(this.full.length, this.shown + dt * 48);
    this.textEl.textContent = this.full.slice(0, Math.floor(this.shown));
    if (this.shown >= this.full.length) {
      this.typing = false;
      if (this.onPick) this.choiceEl.classList.remove('hidden');
    }
  }

  close() {
    this.root.remove();
  }
}

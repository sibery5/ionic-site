import { t } from '../core/i18n';

// Ara sahnelerin konuşma kutusu: konuşanın adı, daktilo gibi yazılan metin, devam ipucu.

export class Dialogue {
  private root: HTMLElement;
  private nameEl: HTMLElement;
  private textEl: HTMLElement;
  private full = '';
  private shown = 0;
  typing = false;

  constructor(parent: HTMLElement, title: string, private onNext: () => void, onSkip: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'dialogue';
    this.root.innerHTML = `<div class="dlg-title">${title}</div><div class="dlg-box"><div class="dlg-name"></div><div class="dlg-text"></div><div class="dlg-hint">${t('continueKey')}</div></div><button class="btn small dlg-skip">⏭</button>`;
    parent.appendChild(this.root);
    this.nameEl = this.root.querySelector('.dlg-name') as HTMLElement;
    this.textEl = this.root.querySelector('.dlg-text') as HTMLElement;
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

  /** Yazılıyorsa tamamla, bittiyse sonraki replik. */
  next() {
    if (this.typing) {
      this.shown = this.full.length;
      this.textEl.textContent = this.full;
      this.typing = false;
      return;
    }
    this.onNext();
  }

  update(dt: number) {
    if (!this.typing) return;
    this.shown = Math.min(this.full.length, this.shown + dt * 48);
    this.textEl.textContent = this.full.slice(0, Math.floor(this.shown));
    if (this.shown >= this.full.length) this.typing = false;
  }

  close() {
    this.root.remove();
  }
}

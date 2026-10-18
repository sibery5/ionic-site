// Klavye + fare girdisi. Fare hareketi her karede toplanıp sıfırlanır.

export interface InputLike {
  mouseDX: number;
  mouseDY: number;
  leftDown: boolean;
  isDown(code: string): boolean;
  wasPressed(code: string): boolean;
}

/** Testler ve demo kayıtları için elle sürülen girdi. */
export class ScriptedInput implements InputLike {
  mouseDX = 0;
  mouseDY = 0;
  leftDown = false;
  down = new Set<string>();
  pressed = new Set<string>();
  isDown(c: string) {
    return this.down.has(c);
  }
  wasPressed(c: string) {
    return this.pressed.has(c);
  }
  press(c: string) {
    this.down.add(c);
    this.pressed.add(c);
  }
  release(c: string) {
    this.down.delete(c);
  }
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}

export class Input implements InputLike {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  leftDown = false;
  locked = false;

  constructor(private canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.code;
      if (!this.down.has(k)) this.pressed.add(k);
      this.down.add(k);
      if (['Space', 'Tab'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
      this.leftDown = false;
    });
    window.addEventListener('mousemove', (e) => {
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.leftDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.leftDown = false;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestLock() {
    try {
      const r = this.canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
      r?.catch?.(() => {});
    } catch {
      /* başsız tarayıcıda olmayabilir */
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code: string) {
    return this.down.has(code);
  }
  wasPressed(code: string) {
    return this.pressed.has(code);
  }
  wasReleased(code: string) {
    return this.released.has(code);
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}

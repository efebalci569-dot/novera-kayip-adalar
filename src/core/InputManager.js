// Klavye/fare girdisi. Aksiyonlar (forward, jump, interact…) tuş kodlarına
// Settings.bindings üzerinden bağlanır; böylece kontroller kolayca değiştirilebilir.

const PREVENT_DEFAULT = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class InputManager {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.pointerLocked = false;
    this.captureHandler = null; // tuş atama ekranı için
    this.lockListeners = new Set();
    this.lastUnlockTime = 0;

    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('wheel', (e) => this.onWheel(e), { passive: true });
    window.addEventListener('blur', () => this.down.clear());
    document.addEventListener('visibilitychange', () => this.down.clear());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      if (!locked && this.pointerLocked) this.lastUnlockTime = performance.now();
      this.pointerLocked = locked;
      if (!locked) this.releaseMouseButtons();
      for (const fn of this.lockListeners) fn(locked);
    });
  }

  isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  onKeyDown(e) {
    if (this.captureHandler) {
      e.preventDefault();
      this.captureHandler(e.code);
      return;
    }
    if (this.isTyping(e)) return;
    if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    if (!this.down.has(e.code)) this.pressed.add(e.code);
    this.down.add(e.code);
  }

  onKeyUp(e) {
    this.down.delete(e.code);
    this.released.add(e.code);
  }

  onMouseDown(e) {
    const code = `Mouse${e.button}`;
    if (this.captureHandler && e.button !== 0) {
      e.preventDefault();
      this.captureHandler(code);
      return;
    }
    // Fare tuşları yalnızca imleç kilitliyken oyun girdisi sayılır (menü tıklamalarını karıştırmamak için)
    if (!this.pointerLocked) return;
    if (!this.down.has(code)) this.pressed.add(code);
    this.down.add(code);
  }

  onMouseUp(e) {
    const code = `Mouse${e.button}`;
    this.down.delete(code);
    this.released.add(code);
  }

  releaseMouseButtons() {
    for (const code of [...this.down]) if (code.startsWith('Mouse')) this.down.delete(code);
  }

  onMouseMove(e) {
    // İmleç kilidi yoksa (bazı gömülü tarayıcılar) tuval üzerinde sürüklemek de kamerayı döndürür
    const dragging = !this.pointerLocked && e.buttons !== 0 && e.target === this.canvas;
    if (!this.pointerLocked && !dragging) return;
    // bazı tarayıcılarda kilit anında ani sıçramalar olur; sınırla
    this.mouseDX += Math.max(-250, Math.min(250, e.movementX));
    this.mouseDY += Math.max(-250, Math.min(250, e.movementY));
  }

  onWheel(e) {
    if (this.pointerLocked || e.target === this.canvas) this.wheel += Math.sign(e.deltaY);
  }

  codes(action) {
    return this.settings.bindings[action] ?? [];
  }

  isDown(action) {
    for (const c of this.codes(action)) if (this.down.has(c)) return true;
    return false;
  }

  wasPressed(action) {
    for (const c of this.codes(action)) if (this.pressed.has(c)) return true;
    return false;
  }

  keyPressed(code) {
    return this.pressed.has(code);
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }

  requestLock() {
    if (this.pointerLocked) return Promise.resolve(true);
    try {
      const p = this.canvas.requestPointerLock?.();
      return Promise.resolve(p).then(() => true).catch(() => false);
    } catch {
      return Promise.resolve(false);
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  onLockChange(fn) {
    this.lockListeners.add(fn);
  }

  /** Tuş atama: bir sonraki tuşu yakalar. */
  captureNextKey(fn) {
    this.captureHandler = (code) => {
      this.captureHandler = null;
      fn(code);
    };
  }

  cancelCapture() {
    this.captureHandler = null;
  }
}

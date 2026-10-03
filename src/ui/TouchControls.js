import { h } from './dom.js';
import { fullscreenSupported, isFullscreen, enterFullscreen, exitFullscreen } from '../utils/device.js';

const JOY_RADIUS = 58; // px — joystick'in en fazla itilebildiği mesafe
const DEADZONE = 0.12;
const LOOK_FACTOR = 1.35; // dokunmatik sürükleme pikseli → fare pikseli
const LEFT_ZONE = 0.42; // ekranın sol bu kadarı hareket, gerisi bakış

// Üst çubuktaki menü düğmeleri: [aksiyon, simge, etiket, gereken özellik]
const MENU_BUTTONS = [
  ['inventory', '🎒', 'Envanter', null],
  ['crafting', '🔨', 'Üretim', 'crafting'],
  ['building', '🏗️', 'İnşa', 'building'],
  ['journal', '📖', 'Günlük', 'journal'],
  ['map', '🗺️', 'Harita', 'map'],
  ['skills', '✨', 'Yetenek', 'skills'],
  ['techtree', '🌳', 'Teknoloji', 'techtree'],
];

/** Parmak düğmeden kaysa da bırakma olayı aynı öğeye gelsin (desteklenmezse sessizce geç). */
function capture(el, pointerId) {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* bazı tarayıcılar/sentetik olaylar */
  }
}

/**
 * Telefon ve tabletler için ekran üstü kontroller:
 *   sol yarı   → sürüklenen sanal joystick (yürü/yüz/tekne sür)
 *   sağ yarı   → kaydırarak etrafa bak
 *   sağ alt    → Eylem (vur/topla/yerleştir), Zıpla, Kullan (ye/indir), Koş
 *   üst çubuk  → menüler, kamera, tam ekran, duraklat
 * Düğmeler InputManager'a sanal tuş basışı gönderir; oyun mantığı klavyeyle aynı yoldan çalışır.
 */
export class TouchControls {
  constructor(game, root) {
    this.game = game;
    this.input = game.input;
    this.enabled = false;
    this.visible = false;
    this.joy = null;
    this.look = null;
    this.running = false;
    this.held = new Set();
    this.labelSig = '';

    this.el = h('div', { class: 'touch-layer hidden' });
    this.surface = h('div', { class: 'touch-surface' });
    this.joyKnob = h('div', { class: 'joy-knob' });
    this.joyBase = h('div', { class: 'joy-base hidden' }, this.joyKnob);
    this.joyHint = h('div', { class: 'joy-hint' }, 'Hareket');

    // sağ alt eylem kümesi
    this.actionLabel = h('span', { class: 'tb-label' }, 'Vur');
    this.actionIcon = h('span', { class: 'tb-icon' }, '✊');
    this.actionBtn = this.button('tb-action', [this.actionIcon, this.actionLabel], {
      press: () => this.pressAction(),
      release: () => this.releaseAction(),
    });
    this.jumpBtn = this.button('tb-jump', [h('span', { class: 'tb-icon' }, '⤒'), h('span', { class: 'tb-label' }, 'Zıpla')], {
      press: () => this.hold('jump'),
      release: () => this.unhold('jump'),
    });
    this.useLabel = h('span', { class: 'tb-label' }, 'Kullan');
    this.useIcon = h('span', { class: 'tb-icon' }, '🍖');
    this.useBtn = this.button('tb-use', [this.useIcon, this.useLabel], { press: () => this.input.virtualTap('secondary') });
    this.runBtn = this.button('tb-run', [h('span', { class: 'tb-icon' }, '🏃'), h('span', { class: 'tb-label' }, 'Koş')], {
      press: () => this.toggleRun(),
    });
    this.rotateBtn = this.button('tb-rotate', [h('span', { class: 'tb-icon' }, '⟳'), h('span', { class: 'tb-label' }, 'Döndür')], {
      press: () => this.input.virtualTap('rotate'),
    });
    const cluster = h('div', { class: 'touch-cluster' }, this.useBtn, this.runBtn, this.rotateBtn, this.jumpBtn, this.actionBtn);

    // üst çubuk
    this.menuBtns = MENU_BUTTONS.map(([action, icon, label, feature]) => {
      const b = this.button('tb-menu', [h('span', { class: 'tb-icon' }, icon), h('span', { class: 'tb-label' }, label)], {
        press: () => this.input.virtualTap(action),
      });
      b._feature = feature;
      return b;
    });
    this.camBtn = this.button('tb-menu', [h('span', { class: 'tb-icon' }, '👁️'), h('span', { class: 'tb-label' }, 'Kamera')], {
      press: () => this.input.virtualTap('camera'),
    });
    this.chatBtn = this.button('tb-menu', [h('span', { class: 'tb-icon' }, '💬'), h('span', { class: 'tb-label' }, 'Sohbet')], {
      press: () => game.ui.hud.openChat(),
    });
    this.fsBtn = this.button('tb-menu', [h('span', { class: 'tb-icon' }, '⛶'), h('span', { class: 'tb-label' }, 'Tam ekran')], {
      press: () => (isFullscreen() ? exitFullscreen() : enterFullscreen()),
    });
    this.pauseBtn = this.button('tb-menu tb-pause', [h('span', { class: 'tb-icon' }, '☰'), h('span', { class: 'tb-label' }, 'Menü')], {
      press: () => this.input.pressed.add('Escape'),
    });
    const bar = h('div', { class: 'touch-bar' }, ...this.menuBtns, this.camBtn, this.chatBtn, this.fsBtn, this.pauseBtn);

    this.el.append(this.surface, this.joyHint, this.joyBase, cluster, bar);
    root.append(this.el);

    // dikey tutulan telefonda yan çevirme uyarısı
    this.rotateHint = h('div', { class: 'rotate-hint' },
      h('div', { class: 'rh-icon' }, '📱'),
      h('div', { class: 'rh-text' }, 'Daha rahat oynamak için cihazını yan çevir'),
      h('button', { class: 'btn small', onclick: () => this.rotateHint.classList.add('dismissed') }, 'Böyle devam et'),
    );
    root.append(this.rotateHint);

    const s = this.surface;
    s.addEventListener('pointerdown', (e) => this.onDown(e));
    s.addEventListener('pointermove', (e) => this.onMove(e));
    s.addEventListener('pointerup', (e) => this.onUp(e));
    s.addEventListener('pointercancel', (e) => this.onUp(e));
    s.addEventListener('contextmenu', (e) => e.preventDefault());
    // iOS Safari: iki parmakla yakınlaştırmayı engelle (oyun ekranı kaymasın)
    document.addEventListener('gesturestart', (e) => e.preventDefault());

    game.settings.onChange((key) => {
      if (key === 'touchControls') this.apply();
    });
    this.apply();
  }

  /** Dokunmatik düğme: basınca press, bırakınca/iptalde release (her basışta bir kez). */
  button(cls, children, { press, release } = {}) {
    const b = h('button', { class: `tbtn ${cls}`, type: 'button' }, children);
    let active = null;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (active !== null) return;
      active = e.pointerId;
      capture(b, e.pointerId);
      b.classList.add('down');
      this.game.audio.init?.();
      press?.();
    });
    const up = (e) => {
      if (active === null || e.pointerId !== active) return;
      active = null;
      b.classList.remove('down');
      release?.();
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }

  apply() {
    this.enabled = this.game.settings.touchEnabled;
    document.body.classList.toggle('touch', this.enabled);
    if (!this.enabled) this.releaseAll();
  }

  // ── Sanal tuşlar ────────────────────────────────────────
  hold(action) {
    this.held.add(action);
    this.input.virtualDown(action);
  }

  unhold(action) {
    if (!this.held.delete(action)) return;
    this.input.virtualUp(action);
  }

  pressAction() {
    // teknedeyken eylem düğmesi "in" olur
    if (this.game.player.mounted) this.input.virtualTap('interact');
    else this.hold('primary');
  }

  releaseAction() {
    this.unhold('primary');
  }

  toggleRun() {
    this.running = !this.running;
    if (this.running) this.hold('run');
    else this.unhold('run');
    this.runBtn.classList.toggle('on', this.running);
  }

  releaseAll() {
    for (const a of [...this.held]) this.unhold(a);
    this.running = false;
    this.runBtn.classList.remove('on');
    this.joy = null;
    this.look = null;
    this.input.axis.x = 0;
    this.input.axis.y = 0;
    this.joyBase.classList.add('hidden');
    this.el.classList.remove('joy-active');
  }

  // ── Joystick ve bakış ───────────────────────────────────
  onDown(e) {
    if (!this.visible) return;
    e.preventDefault();
    const left = e.clientX < window.innerWidth * LEFT_ZONE;
    if (left && !this.joy) {
      this.joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
      this.joyBase.classList.remove('hidden');
      this.el.classList.add('joy-active');
      this.updateJoy(e.clientX, e.clientY);
    } else if (!this.look) {
      this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    } else return;
    capture(this.surface, e.pointerId);
  }

  onMove(e) {
    if (this.joy && e.pointerId === this.joy.id) {
      this.updateJoy(e.clientX, e.clientY);
    } else if (this.look && e.pointerId === this.look.id) {
      const k = LOOK_FACTOR * (this.game.settings.touchSensitivity ?? 1);
      this.input.mouseDX += (e.clientX - this.look.x) * k;
      this.input.mouseDY += (e.clientY - this.look.y) * k;
      this.look.x = e.clientX;
      this.look.y = e.clientY;
    }
  }

  onUp(e) {
    if (this.joy && e.pointerId === this.joy.id) {
      this.joy = null;
      this.input.axis.x = 0;
      this.input.axis.y = 0;
      this.joyBase.classList.add('hidden');
      this.el.classList.remove('joy-active');
    } else if (this.look && e.pointerId === this.look.id) {
      this.look = null;
    }
  }

  updateJoy(x, y) {
    const j = this.joy;
    let dx = x - j.x0;
    let dy = y - j.y0;
    const d = Math.hypot(dx, dy);
    if (d > JOY_RADIUS) {
      // parmak çok uzaklaşırsa taban da peşinden gelir
      const k = (d - JOY_RADIUS) / d;
      j.x0 += dx * k;
      j.y0 += dy * k;
      dx = x - j.x0;
      dy = y - j.y0;
    }
    const nx = dx / JOY_RADIUS;
    const ny = dy / JOY_RADIUS;
    const m = Math.min(1, Math.hypot(nx, ny));
    const eff = m < DEADZONE ? 0 : (m - DEADZONE) / (1 - DEADZONE);
    this.input.axis.x = m > 0 ? (nx / m) * eff : 0;
    this.input.axis.y = m > 0 ? (-ny / m) * eff : 0;
    this.joyBase.style.transform = `translate(${j.x0}px, ${j.y0}px)`;
    this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  // ── Kare güncellemesi ───────────────────────────────────
  update() {
    const g = this.game;
    const show = this.enabled && g.state.mode === 'playing' && !g.ui.active && !g.mpMenu && !g.ui.hud.chatOpen;
    if (show !== this.visible) {
      this.visible = show;
      this.el.classList.toggle('hidden', !show);
      if (!show) this.releaseAll();
    }
    if (!show) return;

    const p = g.player;
    const building = g.building.active;
    // eylem düğmesi: hedefin eylemi (Odun Kes, Aç, Pişir…) ya da Vur / Yumruk / Yerleştir
    let icon = '✊';
    let label = 'Yumruk';
    const t = g.interaction.target;
    if (p.mounted) {
      icon = '⚓';
      label = 'İn';
    } else if (building) {
      icon = '✔️';
      label = 'Yerleştir';
    } else if (t?.prompt) {
      icon = t.prompt.disabled ? '⚠️' : '👆';
      label = t.prompt.action;
    } else if (p.selectedItem) {
      icon = p.selectedItem.damage || p.selectedItem.tool ? '⚔️' : '✊';
      label = 'Vur';
    }
    // kullan düğmesi: seçili eşyaya göre
    const def = p.selectedItem;
    let useIcon = '🖐️';
    let useLabel = 'Kullan';
    let useOn = !!def;
    if (building) {
      useIcon = '✖️';
      useLabel = 'İptal';
      useOn = true;
    } else if (def?.food) {
      useIcon = '🍖';
      useLabel = def.consumeVerb ?? 'Ye';
    } else if (def?.vehicle) {
      useIcon = '⛵';
      useLabel = 'Suya indir';
    } else if (def?.armor) {
      useIcon = '🛡️';
      useLabel = 'Giy';
    } else if (def?.chart) {
      useIcon = '🗺️';
      useLabel = 'Aç';
    }
    const sig = `${icon}|${label}|${useIcon}|${useLabel}|${useOn}|${building}`;
    if (sig !== this.labelSig) {
      this.labelSig = sig;
      this.actionIcon.textContent = icon;
      this.actionLabel.textContent = label;
      this.useIcon.textContent = useIcon;
      this.useLabel.textContent = useLabel;
      this.useBtn.classList.toggle('dim', !useOn);
      this.rotateBtn.classList.toggle('hidden', !building);
    }

    for (const b of this.menuBtns) b.classList.toggle('hidden', !!b._feature && !g.state.hasFeature(b._feature));
    this.chatBtn.classList.toggle('hidden', !g.net?.active);
    this.fsBtn.classList.toggle('hidden', !fullscreenSupported());
    this.jumpBtn.classList.toggle('hidden', !!p.mounted);
  }
}

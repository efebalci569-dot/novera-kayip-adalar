import { h, itemIcon } from './dom.js';
import { svgIcon } from './icons.js';
import { fullscreenSupported, isFullscreen, enterFullscreen, exitFullscreen } from '../utils/device.js';

const JOY_RADIUS = 58; // px — joystick'in en fazla itilebildiği mesafe
const DEADZONE = 0.12;
const LOOK_FACTOR = 1.35; // dokunmatik sürükleme pikseli → fare pikseli
const LEFT_ZONE = 0.42; // ekranın sol bu kadarı hareket, gerisi bakış
const AUTO_RUN_TIME = 0.45; // joystick sonuna kadar bu kadar itilirse koşmaya başlar (s)

// Hızlı menüdeki düğmeler: [kimlik, simge, etiket, gereken özellik]
const QUICK_ITEMS = [
  ['crafting', 'hammer', 'Üretim', 'crafting'],
  ['building', 'bricks', 'İnşa', 'building'],
  ['journal', 'book', 'Günlük', 'journal'],
  ['skills', 'sparkle', 'Yetenekler', 'skills'],
  ['techtree', 'tree', 'Teknoloji', 'techtree'],
  ['camera', 'eye', 'Kamera', null],
  ['fullscreen', 'expand', 'Tam ekran', null],
  ['pause', 'pause', 'Duraklat', null],
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
 *   sol taraf  → sürüklenen sanal joystick (yürü/yüz/tekne sür; sonuna kadar itince koşar)
 *   sağ taraf  → kaydırarak etrafa bak
 *   sağ alt    → Eylem (vur/topla/yerleştir), Zıpla, Kullan (ye/indir/giy), Koş
 *   üst orta   → Envanter, Harita, (Sohbet), Menü → hızlı menü (üretim, inşa, günlük, kamera…)
 * Düğmeler InputManager'a sanal tuş basışı gönderir; oyun mantığı klavyeyle aynı yoldan çalışır.
 * Hiçbir düğme ya da joystick "basılı" takılı kalmaz: parmak kalkınca, katman gizlenince,
 * sekme değişince ya da ekranda hiç parmak kalmayınca her şey bırakılır.
 */
export class TouchControls {
  constructor(game, root) {
    this.game = game;
    this.input = game.input;
    this.enabled = false;
    this.visible = false;
    this.joy = null;
    this.look = null;
    this.runLock = false; // Koş düğmesiyle açılan sürekli koşu (durunca kapanır)
    this.autoRun = false; // joystick sonuna kadar itilince
    this.edgeTime = 0;
    this.held = new Set();
    this.buttons = []; // her düğmenin sıfırlama işlevi
    this.labelSig = '';
    this.quickOpen = false;

    this.el = h('div', { class: 'touch-layer hidden' });
    this.surface = h('div', { class: 'touch-surface' });
    this.joyKnob = h('div', { class: 'joy-knob' });
    this.joyBase = h('div', { class: 'joy-base hidden' }, this.joyKnob);
    this.joyHint = h('div', { class: 'joy-hint' }, 'Hareket');

    // sağ alt eylem kümesi
    this.actionLabel = h('span', { class: 'tb-label' }, 'Vur');
    this.actionIcon = h('span', { class: 'tb-icon' });
    this.actionBtn = this.button('tb-action', [this.actionIcon, this.actionLabel], {
      press: () => this.pressAction(),
      release: () => this.unhold('primary'),
    });
    this.jumpBtn = this.button('tb-jump', [h('span', { class: 'tb-icon' }, svgIcon('jump')), h('span', { class: 'tb-label' }, 'Zıpla')], {
      press: () => this.hold('jump'),
      release: () => this.unhold('jump'),
    });
    this.useLabel = h('span', { class: 'tb-label' }, 'Kullan');
    this.useIcon = h('span', { class: 'tb-icon' });
    this.useBtn = this.button('tb-use', [this.useIcon, this.useLabel], { press: () => this.input.virtualTap('secondary') });
    this.runBtn = this.button('tb-run', [h('span', { class: 'tb-icon' }, svgIcon('run')), h('span', { class: 'tb-label' }, 'Koş')], {
      press: () => {
        this.runLock = !this.runLock;
      },
    });
    this.rotateBtn = this.button('tb-rotate', [h('span', { class: 'tb-icon' }, svgIcon('rotate')), h('span', { class: 'tb-label' }, 'Döndür')], {
      press: () => this.input.virtualTap('rotate'),
    });
    const cluster = h('div', { class: 'touch-cluster' }, this.useBtn, this.runBtn, this.rotateBtn, this.jumpBtn, this.actionBtn);

    // üst çubuk: yalnızca en sık kullanılanlar; gerisi hızlı menüde
    const top = (icon, label, press) => this.button('tb-menu', [h('span', { class: 'tb-icon' }, svgIcon(icon)), h('span', { class: 'tb-label' }, label)], { press });
    this.invBtn = top('backpack', 'Envanter', () => this.input.virtualTap('inventory'));
    this.mapBtn = top('map', 'Harita', () => this.input.virtualTap('map'));
    this.chatBtn = top('chat', 'Sohbet', () => game.ui.hud.openChat());
    this.menuBtn = top('menu', 'Menü', () => this.setQuick(!this.quickOpen));
    this.menuBtn.classList.add('tb-pause');
    const bar = h('div', { class: 'touch-bar' }, this.invBtn, this.mapBtn, this.chatBtn, this.menuBtn);

    // hızlı menü (üretim, inşa, günlük, yetenekler, teknoloji, kamera, tam ekran, duraklat)
    this.quickBtns = QUICK_ITEMS.map(([id, icon, label, feature]) => {
      const lbl = h('span', { class: 'qm-label' }, label);
      const ico = h('span', { class: 'qm-icon' }, svgIcon(icon));
      const b = h('button', { class: 'qm-btn', type: 'button' }, ico, lbl);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.quickAction(id);
      });
      b._feature = feature;
      b._id = id;
      b._label = lbl;
      b._icon = ico;
      return b;
    });
    const closeBtn = h('button', { class: 'qm-btn qm-close', type: 'button' }, h('span', { class: 'qm-icon' }, svgIcon('close')), h('span', { class: 'qm-label' }, 'Kapat'));
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setQuick(false);
    });
    this.quickGrid = h('div', { class: 'qm-grid' }, ...this.quickBtns, closeBtn);
    this.quick = h('div', { class: 'quick-menu hidden' }, this.quickGrid);
    this.quick.addEventListener('pointerdown', (e) => {
      if (e.target === this.quick) this.setQuick(false);
    });

    this.el.append(this.surface, this.joyHint, this.joyBase, cluster, bar);
    // hızlı menü HUD'un da üstünde durur (kendi katmanında)
    root.append(this.el, this.quick);

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
    s.addEventListener('lostpointercapture', (e) => this.onUp(e));
    s.addEventListener('contextmenu', (e) => e.preventDefault());
    // iOS Safari: iki parmakla yakınlaştırmayı engelle (oyun ekranı kaymasın)
    document.addEventListener('gesturestart', (e) => e.preventDefault());

    // güvenlik ağı: bırakma olayı başka bir öğeye gitse ya da hiç gelmese de takılı kalmasın
    const lift = (e) => this.onAnyUp(e);
    window.addEventListener('pointerup', lift, true);
    window.addEventListener('pointercancel', lift, true);
    const allUp = (e) => {
      if (e.touches.length === 0) this.releaseInputs();
    };
    window.addEventListener('touchend', allUp, true);
    window.addEventListener('touchcancel', allUp, true);
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });

    game.settings.onChange((key) => {
      if (key === 'touchControls') this.apply();
    });
    this.apply();
  }

  /**
   * Dokunmatik düğme: basınca press, bırakınca release (her basışta bir kez).
   * Önceki basış bir şekilde bırakılmamışsa yeni dokunuş onu kapatıp baştan başlar (düğme asla kilitlenmez).
   */
  button(cls, children, { press, release } = {}) {
    const b = h('button', { class: `tbtn ${cls}`, type: 'button' }, children);
    const st = { id: null };
    const reset = (fire = true) => {
      if (st.id === null) return;
      st.id = null;
      b.classList.remove('down');
      if (fire) release?.();
    };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (st.id !== null) reset(true);
      st.id = e.pointerId;
      capture(b, e.pointerId);
      b.classList.add('down');
      this.game.audio.init?.();
      press?.();
    });
    const up = (e) => {
      if (st.id !== null && e.pointerId === st.id) reset(true);
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    this.buttons.push({ st, reset });
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

  /** Bir parmak kalktı: o parmağa bağlı düğme/joystick/bakış bırakılır. */
  onAnyUp(e) {
    for (const b of this.buttons) if (b.st.id === e.pointerId) b.reset(true);
    if (this.joy?.id === e.pointerId || this.look?.id === e.pointerId) this.onUp(e);
  }

  /** Ekranda parmak kalmadı: basılı düğmeler, joystick ve bakış bırakılır (Koş kilidi yürürken kapanır). */
  releaseInputs() {
    for (const b of this.buttons) b.reset(true);
    for (const a of [...this.held]) if (a !== 'run') this.unhold(a);
    if (this.joy) this.onUp({ pointerId: this.joy.id });
    this.look = null;
  }

  /** Her şeyi bırak (katman gizlendi, sekme değişti, ayar kapandı). */
  releaseAll() {
    this.releaseInputs();
    this.runLock = false;
    this.autoRun = false;
    this.edgeTime = 0;
    this.unhold('run');
    this.runBtn?.classList.remove('on');
    this.joy = null;
    this.input.axis.x = 0;
    this.input.axis.y = 0;
    this.joyBase.classList.add('hidden');
    this.el.classList.remove('joy-active');
  }

  // ── Hızlı menü ──────────────────────────────────────────
  setQuick(open) {
    this.quickOpen = open;
    this.quick.classList.toggle('hidden', !open);
    if (open) {
      this.releaseAll();
      this.refreshQuick();
    }
  }

  refreshQuick() {
    const g = this.game;
    for (const b of this.quickBtns) {
      let hidden = !!b._feature && !g.state.hasFeature(b._feature);
      if (b._id === 'fullscreen') {
        hidden = !fullscreenSupported();
        const fs = isFullscreen();
        b._label.textContent = fs ? 'Tam ekrandan çık' : 'Tam ekran';
        b._icon.replaceChildren(svgIcon(fs ? 'shrink' : 'expand'));
      } else if (b._id === 'camera') {
        b._label.textContent = g.cameraController.firstPerson ? '3. şahıs kamera' : '1. şahıs kamera';
      }
      b.classList.toggle('hidden', hidden || (b._id === 'camera' && g.player.ghost));
    }
  }

  quickAction(id) {
    this.setQuick(false);
    const g = this.game;
    if (id === 'fullscreen') {
      if (isFullscreen()) exitFullscreen();
      else enterFullscreen();
    } else if (id === 'pause') {
      this.input.pressed.add('Escape');
    } else {
      this.input.virtualTap(id);
    }
    g.audio.play('click');
  }

  // ── Joystick ve bakış ───────────────────────────────────
  onDown(e) {
    if (!this.visible || this.quickOpen) return;
    e.preventDefault();
    const left = e.clientX < window.innerWidth * LEFT_ZONE;
    if (left && !this.joy) {
      this.joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY, over: 0 };
      this.joyBase.classList.remove('hidden');
      this.el.classList.add('joy-active');
      this.updateJoy(e.clientX, e.clientY);
    } else if (!this.look && (!this.joy || e.pointerId !== this.joy.id)) {
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
      // durunca koşu da kapanır
      this.autoRun = false;
      this.runLock = false;
      this.edgeTime = 0;
    } else if (this.look && e.pointerId === this.look.id) {
      this.look = null;
    }
  }

  updateJoy(x, y) {
    const j = this.joy;
    let dx = x - j.x0;
    let dy = y - j.y0;
    const d = Math.hypot(dx, dy);
    j.over = d > JOY_RADIUS * 1.05 ? 1 : 0;
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
    j.mag = m;
    const eff = m < DEADZONE ? 0 : (m - DEADZONE) / (1 - DEADZONE);
    this.input.axis.x = m > 0 ? (nx / m) * eff : 0;
    this.input.axis.y = m > 0 ? (-ny / m) * eff : 0;
    this.joyBase.style.transform = `translate(${j.x0}px, ${j.y0}px)`;
    this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  /** Koşu: Koş düğmesi ya da joystick'i bir süre sonuna kadar itmek; ikisi de durunca kapanır. */
  updateRun(dt) {
    const j = this.joy;
    if (j && j.mag > 0.97 && this.input.axis.y > 0.5) this.edgeTime += dt;
    else this.edgeTime = 0;
    if (!this.autoRun && this.edgeTime > AUTO_RUN_TIME) this.autoRun = true;
    if (this.autoRun && (!j || j.mag < 0.75)) this.autoRun = false;
    const want = this.runLock || this.autoRun;
    if (want && !this.held.has('run')) this.hold('run');
    else if (!want && this.held.has('run')) this.unhold('run');
    this.runBtn.classList.toggle('on', want);
  }

  // ── Kare güncellemesi ───────────────────────────────────
  update(dt = 0) {
    const g = this.game;
    const show = this.enabled && g.state.mode === 'playing' && !g.ui.active && !g.mpMenu && !g.ui.hud.chatOpen;
    if (show !== this.visible) {
      this.visible = show;
      this.el.classList.toggle('hidden', !show);
      if (!show) {
        this.releaseAll();
        if (this.quickOpen) this.setQuick(false);
      }
    }
    if (!show) return;
    this.updateRun(dt);

    const p = g.player;
    const building = g.building.active;
    const sel = p.selectedStack;
    const def = p.selectedItem;
    // eylem düğmesi: hedefin eylemi (Odun Kes, Aç, Pişir…) ya da Vur / Yumruk / Yerleştir
    let icon = 'svg:fist';
    let label = 'Yumruk';
    const t = g.interaction.target;
    if (p.mounted) {
      icon = 'svg:anchor';
      label = 'İn';
    } else if (building) {
      icon = 'svg:check';
      label = 'Yerleştir';
    } else if (t?.prompt) {
      icon = def?.tool || def?.damage ? `item:${sel.id}` : t.prompt.disabled ? 'svg:warning' : 'svg:hand';
      label = t.prompt.action;
    } else if (def) {
      icon = def.damage || def.tool ? `item:${sel.id}` : 'svg:fist';
      label = def.damage || def.tool ? 'Vur' : 'Yumruk';
    }
    // kullan düğmesi: seçili eşyaya göre
    let useIcon = 'svg:hand';
    let useLabel = 'Kullan';
    let useOn = false;
    if (building) {
      useIcon = 'svg:close';
      useLabel = 'İptal';
      useOn = true;
    } else if (def?.food) {
      useIcon = `item:${sel.id}`;
      useLabel = def.consumeVerb ?? 'Ye';
      useOn = true;
    } else if (def?.vehicle) {
      useIcon = 'svg:boat';
      useLabel = 'Suya indir';
      useOn = true;
    } else if (def?.armor) {
      useIcon = 'svg:shield';
      useLabel = 'Giy';
      useOn = true;
    } else if (def?.chart) {
      useIcon = 'svg:map';
      useLabel = 'Aç';
      useOn = true;
    }
    const net = g.net?.active;
    const mapOn = g.state.hasFeature('map');
    const sig = `${icon}|${label}|${useIcon}|${useLabel}|${useOn}|${building}|${net}|${mapOn}|${!!p.mounted}`;
    if (sig !== this.labelSig) {
      this.labelSig = sig;
      this.actionIcon.replaceChildren(this.iconEl(icon));
      this.actionLabel.textContent = label;
      this.useIcon.replaceChildren(this.iconEl(useIcon));
      this.useLabel.textContent = useLabel;
      this.useBtn.classList.toggle('dim', !useOn);
      this.rotateBtn.classList.toggle('hidden', !building);
      this.chatBtn.classList.toggle('hidden', !net);
      this.mapBtn.classList.toggle('hidden', !mapOn);
      this.jumpBtn.classList.toggle('hidden', !!p.mounted);
    }
    if (this.quickOpen) this.refreshQuick();
  }

  /** 'svg:ad' → SVG simge, 'item:kimlik' → eşyanın 3B ikonu. */
  iconEl(spec) {
    const [kind, id] = spec.split(':');
    return kind === 'item' ? itemIcon(id) : svgIcon(id);
  }
}

import { h } from './dom.js';
import { SaveManager } from '../core/SaveManager.js';
import { QUALITY_PRESETS } from '../core/Settings.js';
import { ACTIONS, keyLabel } from '../data/controls.js';

/** Ana menü, duraklatma menüsü, ayarlar, ölüm ekranı ve onay pencereleri. */
export class MenuUI {
  constructor(game, root) {
    this.game = game;
    this.layer = h('div', { class: 'menu-layer hidden' });
    root.append(this.layer);
    this.settingsTab = 'audio';
    this.current = null;
  }

  get isOpen() {
    return !this.layer.classList.contains('hidden');
  }

  show(kind, content) {
    this.current = kind;
    this.layer.className = `menu-layer ${kind === 'main' ? 'main' : 'dim'}`;
    this.layer.replaceChildren(content);
  }

  hide() {
    this.current = null;
    this.layer.classList.add('hidden');
    this.layer.replaceChildren();
  }

  // ── Ana menü ────────────────────────────────────────────
  showMain() {
    const g = this.game;
    const summary = SaveManager.summary();
    const date = summary?.savedAt ? summary.savedAt.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '';
    const menu = h('div', { class: 'main-menu' },
      h('div', { class: 'game-title' }, 'NOVERA'),
      h('div', { class: 'game-sub' }, 'Kayıp Adalar'),
      h('div', { class: 'game-tag' }, 'Ada Hayatta Kalma'),
      summary
        ? [
          h('button', { class: 'btn primary', onclick: () => { g.audio.init(); g.continueGame(); } }, '▶  Devam Et'),
          h('div', { class: 'save-info' }, `Gün ${summary.day} · Seviye ${summary.level}${date ? ` · ${date}` : ''}`),
          h('button', { class: 'btn', onclick: () => { g.audio.init(); this.confirmNewGame(); } }, '✦  Yeni Oyun'),
        ]
        : h('button', { class: 'btn primary', onclick: () => { g.audio.init(); g.startNewGame(); } }, '✦  Yeni Oyun'),
      h('button', { class: 'btn', onclick: () => { g.audio.init(); this.showSettings('main'); } }, '⚙  Ayarlar'),
      h('button', { class: 'btn', onclick: () => this.showControls('main') }, '⌨  Kontroller'),
      h('div', { class: 'menu-foot' }, 'Bir gemi kazasından sağ kurtuldun. Hayatta kal, inşa et, keşfet —', h('br'), 've bu adada senden önce kimin olduğunu öğren.'),
    );
    this.show('main', menu);
  }

  confirmNewGame() {
    this.confirm(
      'Yeni oyun başlatılsın mı?',
      'Mevcut kaydın silinecek ve ada baştan başlayacak. Bu işlem geri alınamaz.',
      'Evet, yeni oyun',
      () => {
        SaveManager.clear();
        this.game.startNewGame();
      },
      () => this.showMain(),
    );
  }

  confirm(title, text, okLabel, onOk, onCancel) {
    this.show('dialog', h('div', { class: 'dialog' },
      h('h2', {}, title),
      h('p', {}, text),
      h('div', { class: 'actions' },
        h('button', { class: 'btn danger', onclick: onOk }, okLabel),
        h('button', { class: 'btn', onclick: onCancel }, 'Vazgeç'),
      ),
    ));
  }

  // ── Duraklatma ──────────────────────────────────────────
  showPause() {
    const g = this.game;
    const s = g.state.stats;
    this.show('pause', h('div', { class: 'pause-menu' },
      h('h2', {}, 'DURAKLATILDI'),
      h('div', { class: 'pause-stats' }, `Gün ${g.time.day} · Seviye ${g.progression.level} · ${Math.round(s.distanceWalked)} m yürüdün · ${s.treesFelled} ağaç`),
      h('button', { class: 'btn primary', onclick: () => g.resume() }, '▶  Devam Et'),
      h('button', { class: 'btn', onclick: () => { g.save(); g.ui.hud.toast('💾 Oyun kaydedildi', 'success'); } }, '💾  Kaydet'),
      h('button', { class: 'btn', onclick: () => this.showSettings('pause') }, '⚙  Ayarlar'),
      h('button', { class: 'btn', onclick: () => this.showControls('pause') }, '⌨  Kontroller'),
      h('button', { class: 'btn danger', onclick: () => g.quitToMenu() }, '⏏  Kaydet ve Ana Menüye Dön'),
    ));
  }

  back(from) {
    if (from === 'main') this.showMain();
    else this.showPause();
  }

  // ── Ayarlar ─────────────────────────────────────────────
  showSettings(from) {
    const g = this.game;
    const s = g.settings;
    const tabs = [['audio', '🔊 Ses'], ['graphics', '🖥️ Grafik'], ['controls', '🖱️ Kontrol']];
    const slider = (label, key, min, max, step, fmt) => {
      const val = h('span', { class: 'val' }, fmt(s[key]));
      const input = h('input', { type: 'range', min, max, step, value: s[key] });
      input.addEventListener('input', () => {
        s.set(key, parseFloat(input.value));
        val.textContent = fmt(s[key]);
      });
      return h('div', { class: 'setting' }, h('span', {}, label), h('div', {}, input, val));
    };
    const toggle = (label, key) => {
      const btn = h('button', { class: `toggle ${s[key] ? 'on' : ''}` });
      btn.addEventListener('click', () => {
        s.set(key, !s[key]);
        btn.classList.toggle('on', s[key]);
      });
      return h('div', { class: 'setting' }, h('span', {}, label), btn);
    };
    const pct = (v) => `%${Math.round(v * 100)}`;

    let content;
    if (this.settingsTab === 'audio') {
      content = [
        slider('Ana ses', 'masterVolume', 0, 1, 0.05, pct),
        slider('Efektler', 'sfxVolume', 0, 1, 0.05, pct),
        slider('Ortam sesleri', 'ambientVolume', 0, 1, 0.05, pct),
        slider('Müzik', 'musicVolume', 0, 1, 0.05, pct),
      ];
    } else if (this.settingsTab === 'graphics') {
      const seg = h('div', { class: 'seg' }, Object.entries(QUALITY_PRESETS).map(([id, p]) => h('button', {
        class: s.quality === id ? 'active' : '',
        onclick: () => { s.set('quality', id); this.showSettings(from); },
      }, p.label)));
      const camSeg = h('div', { class: 'seg' }, [['first', '1. Şahıs'], ['third', '3. Şahıs']].map(([id, label]) => h('button', {
        class: s.cameraMode === id ? 'active' : '',
        onclick: () => { s.set('cameraMode', id); this.showSettings(from); },
      }, label)));
      content = [
        h('div', { class: 'setting' }, h('span', {}, 'Grafik kalitesi'), seg),
        h('div', { class: 'setting' }, h('span', {}, 'Kamera'), camSeg),
        toggle('Baş sallanması (yürürken)', 'headBob'),
        slider('Görüş açısı (FOV)', 'fov', 50, 90, 1, (v) => `${Math.round(v)}°`),
        toggle('FPS göster', 'showFps'),
        h('div', { class: 'inv-note' }, 'Düşük: gölgeler kapalı, daha az çim. Yüksek: keskin gölgeler ve tam çözünürlük.'),
      ];
    } else {
      content = [
        slider('Fare hassasiyeti', 'sensitivity', 0.2, 3, 0.05, (v) => `${v.toFixed(2)}×`),
        toggle('Fareyi ters çevir (Y)', 'invertY'),
        h('button', { class: 'btn small', style: { marginTop: '12px' }, onclick: () => this.showControls(from, true) }, '⌨ Tuş atamalarını düzenle'),
      ];
    }

    this.show('settings', h('div', { class: 'dialog settings' },
      h('h2', {}, 'Ayarlar'),
      h('div', { class: 'tabs' }, tabs.map(([id, label]) => h('button', {
        class: `tab ${this.settingsTab === id ? 'active' : ''}`,
        onclick: () => { this.settingsTab = id; this.showSettings(from); },
      }, label))),
      content,
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => this.back(from) }, '← Geri')),
    ));
  }

  // ── Kontroller (tuş atama) ──────────────────────────────
  showControls(from, fromSettings = false) {
    const g = this.game;
    const s = g.settings;
    const rows = Object.entries(ACTIONS).map(([id, a]) => {
      const btn = h('button', { class: 'bind-btn' }, keyLabel(s.bindings[id]?.[0]));
      btn.addEventListener('click', () => {
        btn.classList.add('waiting');
        btn.textContent = 'Bir tuşa bas…';
        g.input.captureNextKey((code) => {
          if (code !== 'Escape') s.setBinding(id, code);
          this.showControls(from, fromSettings);
        });
      });
      return h('div', { class: 'setting' }, h('span', {}, a.label), btn);
    });
    this.show('controls', h('div', { class: 'dialog settings' },
      h('h2', {}, 'Kontroller'),
      h('div', { class: 'inv-note', style: { marginTop: 0 } }, 'Değiştirmek istediğin eyleme tıkla ve yeni tuşa bas. Esc: vazgeç. Esc tuşu her zaman menüyü açar.'),
      rows,
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', onclick: () => (fromSettings ? this.showSettings(from) : this.back(from)) }, '← Geri'),
        h('button', { class: 'btn', onclick: () => { s.resetBindings(); this.showControls(from, fromSettings); } }, 'Varsayılana döndür'),
      ),
    ));
  }

  // ── Ölüm ────────────────────────────────────────────────
  showDeath(cause) {
    const g = this.game;
    const causes = {
      starving: 'Açlıktan bayıldın…', thirst: 'Susuzluktan bayıldın…', food: 'Midene dokunan bir şey yedin…', fall: 'Yüksekten düştün…',
    };
    this.show('death', h('div', { class: 'dialog', style: { textAlign: 'center' } },
      h('h2', {}, '💫 Bayıldın'),
      h('p', {}, causes[cause] ?? 'Gücün tükendi…'),
      h('p', { style: { color: '#a9b4b8', fontSize: '14px' } }, 'Eşyaların sende kalır. Son uyuduğun yerde (ya da sahilde) uyanacaksın.'),
      h('div', { class: 'actions', style: { justifyContent: 'center' } }, h('button', { class: 'btn primary', onclick: () => g.respawn() }, 'Uyan')),
    ));
  }

  // ── Giriş metni ─────────────────────────────────────────
  showIntro() {
    const el = h('div', { class: 'intro' },
      h('div', { class: 'i-day' }, 'GÜN 1'),
      h('div', { class: 'i-text' }, 'Fırtına dindi. Geminden geriye yalnızca kıyıya vuran enkaz kaldı…', h('br'), 'Hayatta kalmak için önce etrafına bakmalısın.'),
    );
    this.game.ui.root.append(el);
    setTimeout(() => el.remove(), 7200);
  }
}

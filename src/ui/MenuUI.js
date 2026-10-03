import { h } from './dom.js';
import { setRich } from './rich.js';
import { SaveManager } from '../core/SaveManager.js';
import { QUALITY_PRESETS } from '../core/Settings.js';
import { ACTIONS, keyLabel } from '../data/controls.js';
import { DIFFICULTIES, DIFFICULTY_ORDER, difficultyDef } from '../data/difficulty.js';
import {
  GENDERS, SKIN_TONES, HAIR_COLORS, EYE_COLORS, SHIRT_COLORS, PANTS_COLORS, HAIR_STYLES, BEARD_STYLES,
  defaultAppearance, randomAppearance,
} from '../data/appearance.js';
import { MAX_PLAYERS, cleanCode } from '../net/Network.js';
import { CharacterPreview } from './CharacterPreview.js';

const DEATH_CAUSES = {
  starving: 'Açlıktan bayıldın…', thirst: 'Susuzluktan bayıldın…', food: 'Midene dokunan bir şey yedin…', fall: 'Yüksekten düştün…',
};

const mult = (v) => (v === 1 ? 'normal' : `×${v}`);

/** Ana menü, karakter düzenleyici, zorluk ve çok oyunculu ekranları, duraklatma, ayarlar ve ölüm ekranları. */
export class MenuUI {
  constructor(game, root) {
    this.game = game;
    this.layer = h('div', { class: 'menu-layer hidden' });
    root.append(this.layer);
    this.settingsTab = 'audio';
    this.current = null;
    this.preview = null; // karakter önizlemesi (ilk açılışta oluşturulur)
    this.joinCode = '';
  }

  update(dt) {
    this.preview?.update(dt);
  }

  get isOpen() {
    return !this.layer.classList.contains('hidden');
  }

  show(kind, content) {
    if (kind !== 'character') this.preview?.unmount();
    this.current = kind;
    this.layer.className = `menu-layer ${kind === 'main' ? 'main' : 'dim'}`;
    this.layer.replaceChildren(content);
  }

  hide() {
    this.preview?.unmount();
    this.current = null;
    this.layer.classList.add('hidden');
    this.layer.replaceChildren();
  }

  // ── Ana menü ────────────────────────────────────────────
  showMain() {
    const g = this.game;
    const summary = SaveManager.summary();
    const date = summary?.savedAt ? summary.savedAt.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '';
    const diff = summary ? difficultyDef(summary.difficulty) : null;
    const menu = h('div', { class: 'main-menu' },
      h('div', { class: 'game-title' }, 'NOVERA'),
      h('div', { class: 'game-sub' }, 'Kayıp Adalar'),
      h('div', { class: 'game-tag' }, 'Ada Hayatta Kalma'),
      summary
        ? [
          h('button', { class: 'btn primary', onclick: () => { g.audio.init(); g.continueGame(); } }, '▶  Devam Et'),
          h('div', { class: 'save-info' }, `${diff.icon} ${diff.name} · Gün ${summary.day} · Seviye ${summary.level}${date ? ` · ${date}` : ''}`),
          h('button', { class: 'btn', onclick: () => { g.audio.init(); this.showNewGame(); } }, '✦  Yeni Oyun'),
        ]
        : h('button', { class: 'btn primary', onclick: () => { g.audio.init(); this.showNewGame(); } }, '✦  Yeni Oyun'),
      h('button', { class: 'btn', onclick: () => { g.audio.init(); this.showMultiplayer(); } }, '🌐  Çok Oyunculu'),
      h('button', { class: 'btn', onclick: () => this.showCharacter('main') }, '👤  Karakter'),
      h('button', { class: 'btn', onclick: () => { g.audio.init(); this.showSettings('main'); } }, '⚙  Ayarlar'),
      h('button', { class: 'btn', onclick: () => this.showControls('main') }, '⌨  Kontroller'),
      h('div', { class: 'profile-chip', onclick: () => this.showCharacter('main') },
        h('span', { class: 'pc-dot', style: { background: g.profile.appearance.shirt } }),
        h('span', {}, g.profile.name),
        h('small', {}, 'karakterini düzenle'),
      ),
      h('div', { class: 'menu-foot' }, 'Bir gemi kazasından sağ kurtuldun. Hayatta kal, inşa et, keşfet —', h('br'), 've bu adada senden önce kimin olduğunu öğren.'),
    );
    this.show('main', menu);
  }

  // ── Yeni oyun: zorluk seçimi ────────────────────────────
  /** mp: true ise dünya oluşturulduktan sonra oda açılır. */
  showNewGame({ mp = false, selected = 'normal' } = {}) {
    const g = this.game;
    let choice = selected;
    const startBtn = h('button', { class: 'btn primary' });
    const cards = DIFFICULTY_ORDER.map((id) => {
      const d = DIFFICULTIES[id];
      const card = h('button', { class: 'diff-card', style: { '--c': d.color }, dataset: { id } },
        h('div', { class: 'dc-icon' }, d.icon),
        h('div', { class: 'dc-name' }, d.name),
        h('div', { class: 'dc-desc' }, d.desc),
        h('ul', { class: 'dc-stats' },
          h('li', {}, `Açlık / susuzluk: ${mult(d.decay)}`),
          h('li', {}, `Alınan hasar: ${mult(d.damage)}`),
          h('li', {}, `Deneyim: ${mult(d.xp)}`),
          h('li', {}, d.permadeath ? '☠️ Tek can' : d.deathDrop ? '💀 Ölünce eşyalar çuvala düşer' : '🎒 Ölünce eşyalar sende kalır'),
        ));
      card.addEventListener('click', () => select(id));
      return card;
    });
    const select = (id) => {
      choice = id;
      for (const c of cards) c.classList.toggle('active', c.dataset.id === id);
      setRich(startBtn, `${DIFFICULTIES[id].icon}  ${DIFFICULTIES[id].name} ile başla`);
    };
    startBtn.addEventListener('click', () => {
      const go = () => {
        SaveManager.clear();
        g.startNewGame(choice);
        if (mp) g.openRoom();
      };
      if (SaveManager.hasSave()) {
        this.confirm(
          'Yeni oyun başlatılsın mı?',
          'Mevcut kaydın silinecek ve ada baştan başlayacak. Bu işlem geri alınamaz.',
          'Evet, yeni oyun',
          go,
          () => this.showNewGame({ mp, selected: choice }),
        );
      } else go();
    });
    select(choice);
    this.show('newgame', h('div', { class: 'dialog wide' },
      h('h2', {}, mp ? '🌐 Yeni Dünya ile Oda Kur' : '✦ Yeni Oyun'),
      h('p', { class: 'dialog-sub' }, mp
        ? 'Zorluk odadaki herkes için geçerlidir. Dünya senin bilgisayarında saklanır.'
        : 'Bir zorluk seç. Sonradan değiştirilemez.'),
      h('div', { class: 'diff-grid' }, cards),
      h('div', { class: 'actions' },
        startBtn,
        h('button', { class: 'btn', onclick: () => (mp ? this.showMultiplayer() : this.showMain()) }, '← Geri'),
      ),
    ));
  }

  // ── Karakter düzenleyici ────────────────────────────────
  showCharacter(from = 'main') {
    const g = this.game;
    if (!this.preview) this.preview = new CharacterPreview();
    const draft = { name: g.profile.name, app: { ...g.profile.appearance } };
    const stage = h('div', { class: 'char-stage' });
    const controls = h('div', { class: 'char-controls' });
    const focusSeg = h('div', { class: 'seg char-focus' });

    const setFocus = (f) => {
      this.preview.setFocus(f);
      focusSeg.replaceChildren(...[['body', 'Tüm Boy'], ['face', 'Yüz']].map(([id, label]) => h('button', {
        class: this.preview.focus === id ? 'active' : '', onclick: () => setFocus(id),
      }, label)));
    };
    const change = (patch, focus) => {
      Object.assign(draft.app, patch);
      if (draft.app.gender === 'female') draft.app.beard = 'none';
      this.preview.setAppearance(draft.app);
      if (focus) setFocus(focus);
      render();
    };
    const swatches = (key, list, focus) => h('div', { class: 'swatches' }, list.map((c) => h('button', {
      class: `swatch ${draft.app[key] === c ? 'active' : ''}`,
      style: { background: c },
      title: c,
      onclick: () => change({ [key]: c }, focus),
    })));
    const choices = (key, table, focus) => h('div', { class: 'choices' }, Object.entries(table).map(([id, d]) => h('button', {
      class: `choice ${draft.app[key] === id ? 'active' : ''}`,
      onclick: () => change({ [key]: id }, focus),
    }, d.name)));
    const section = (title, ...body) => h('div', { class: 'char-section' }, h('div', { class: 'cs-title' }, title), ...body);

    const nameInput = h('input', { class: 'text-input', type: 'text', maxlength: '16', value: draft.name, placeholder: 'Karakterinin adı' });
    nameInput.addEventListener('input', () => { draft.name = nameInput.value; });

    const render = () => {
      const a = draft.app;
      controls.replaceChildren(
        section('Ad', nameInput),
        section('Cinsiyet', h('div', { class: 'seg' }, Object.entries(GENDERS).map(([id, gd]) => h('button', {
          class: a.gender === id ? 'active' : '',
          onclick: () => {
            if (a.gender === id) return;
            // cinsiyete özgü varsayılan saç modelindeyse karşı cinsin varsayılanına geç
            const other = defaultAppearance(id);
            const prevDefault = defaultAppearance(a.gender).hairStyle;
            change({ gender: id, hairStyle: a.hairStyle === prevDefault ? other.hairStyle : a.hairStyle, beard: id === 'male' ? other.beard : 'none' }, 'body');
          },
        }, `${gd.icon} ${gd.name}`)))),
        section('Ten Rengi', swatches('skin', SKIN_TONES, 'face')),
        section('Saç Modeli', choices('hairStyle', HAIR_STYLES, 'face')),
        section('Saç Rengi', swatches('hairColor', HAIR_COLORS, 'face')),
        ...(a.gender === 'male' ? [section('Sakal / Bıyık', choices('beard', BEARD_STYLES, 'face'))] : []),
        section('Göz Rengi', swatches('eyeColor', EYE_COLORS, 'face')),
        section('Gömlek', swatches('shirt', SHIRT_COLORS, 'body')),
        section('Pantolon', swatches('pants', PANTS_COLORS, 'body')),
      );
    };

    const close = () => (from === 'mp' ? this.showMultiplayer() : this.back(from));
    const save = () => {
      g.profile.update({ name: draft.name, appearance: draft.app });
      g.ui.hud.toast(`👤 Karakter kaydedildi: ${g.profile.name}`, 'success', 2200);
      close();
    };

    this.show('character', h('div', { class: 'dialog char-editor' },
      h('h2', {}, '👤 Karakter'),
      h('div', { class: 'char-body' },
        h('div', { class: 'char-left' },
          stage,
          focusSeg,
          h('div', { class: 'inv-note', style: { textAlign: 'center', marginTop: '6px' } }, 'Döndürmek için sürükle · tekerlek: yakınlaş'),
        ),
        controls,
      ),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', onclick: save }, '✔  Kaydet'),
        h('button', { class: 'btn', onclick: () => change(randomAppearance(), 'body') }, '🎲  Rastgele'),
        h('button', { class: 'btn', onclick: () => change(defaultAppearance(draft.app.gender), 'body') }, '↺  Varsayılan'),
        h('button', { class: 'btn', onclick: close }, 'Vazgeç'),
      ),
    ));
    this.preview.setAppearance(draft.app);
    this.preview.autoSpin = true;
    this.preview.mount(stage);
    setFocus('body');
    render();
  }

  // ── Çok oyunculu ────────────────────────────────────────
  showMultiplayer() {
    const g = this.game;
    const summary = SaveManager.summary();
    const diff = summary ? difficultyDef(summary.difficulty) : null;
    const codeInput = h('input', {
      class: 'text-input code-input', type: 'text', maxlength: '6', value: this.joinCode, placeholder: 'ODA KODU', spellcheck: 'false', autocomplete: 'off',
    });
    const statusEl = h('div', { class: 'mp-status' });
    const joinBtn = h('button', { class: 'btn primary join-btn' }, '➜  Katıl');
    const lockables = [joinBtn, codeInput];
    let busy = false;
    const setStatus = (text, err = false, isBusy = false) => {
      busy = isBusy;
      setRich(statusEl, text);
      statusEl.classList.toggle('err', err);
      joinBtn.textContent = busy ? 'Bağlanıyor…' : '➜  Katıl';
      for (const el of lockables) el.disabled = busy;
    };
    const join = async () => {
      if (busy) return;
      const code = cleanCode(codeInput.value);
      this.joinCode = code;
      if (code.length !== 6) {
        setStatus('⚠ Oda kodu 6 karakter olmalı.', true);
        return;
      }
      g.audio.init();
      setStatus(`🔌 ${code} odasına bağlanılıyor…`, false, true);
      try {
        const welcome = await g.net.join(code);
        g.joinWorld(welcome);
      } catch (err) {
        if (this.current === 'multiplayer') setStatus(`⚠ ${err.message}`, true);
      }
    };
    codeInput.addEventListener('input', () => {
      const v = cleanCode(codeInput.value);
      if (v !== codeInput.value) codeInput.value = v;
      this.joinCode = v;
    });
    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') join();
    });
    joinBtn.addEventListener('click', join);
    const guard = (fn) => () => { if (!busy) fn(); };
    const hostSaved = summary
      ? h('button', { class: 'btn primary', onclick: guard(() => { g.audio.init(); g.continueGame(); g.openRoom(); }) },
        '▶  Kayıtlı dünyamla oda kur', h('small', {}, `${diff.icon} ${diff.name} · Gün ${summary.day} · Seviye ${summary.level}`))
      : null;

    this.show('multiplayer', h('div', { class: 'dialog wide mp-menu' },
      h('h2', {}, '🌐 Çok Oyunculu'),
      h('p', { class: 'dialog-sub' }, `Bir oda kur ve 6 haneli kodu arkadaşlarına ver ya da bir arkadaşının odasına katıl. Bir odada en fazla ${MAX_PLAYERS} kişi olabilir.`),
      h('div', { class: 'mp-cols' },
        h('div', { class: 'mp-col' },
          h('h3', {}, '🏝️ Oda Kur'),
          h('p', {}, 'Dünya senin bilgisayarında çalışır ve kaydedilir. Sen çıkınca oda kapanır.'),
          hostSaved,
          h('button', { class: `btn ${summary ? '' : 'primary'}`, onclick: guard(() => this.showNewGame({ mp: true })) }, '✦  Yeni dünya ile oda kur'),
        ),
        h('div', { class: 'mp-col' },
          h('h3', {}, '🔑 Odaya Katıl'),
          h('p', {}, 'Karakterin, envanterin ve seviyen bu bilgisayarda saklanır; dünya ev sahibine aittir.'),
          h('div', { class: 'join-row' }, codeInput, joinBtn),
          statusEl,
        ),
      ),
      h('div', { class: 'mp-profile' },
        h('span', { class: 'pc-dot', style: { background: g.profile.appearance.shirt } }),
        h('span', {}, 'Odada görüneceğin ad: ', h('b', {}, g.profile.name)),
        h('button', { class: 'btn small', onclick: guard(() => this.showCharacter('mp')) }, '👤 Karakteri düzenle'),
      ),
      h('div', { class: 'inv-note' }, 'Bağlantı tarayıcıdan tarayıcıya (WebRTC) kurulur. Bazı okul/iş ağları doğrudan bağlantıyı engelleyebilir.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: guard(() => this.showMain()) }, '← Geri')),
    ));
    setTimeout(() => codeInput.focus(), 0);
  }

  // ── Duraklatma ──────────────────────────────────────────
  showPause() {
    const g = this.game;
    const s = g.state.stats;
    const net = g.net;
    const d = g.difficulty;
    const dead = !!g.state.flags.hardcoreDead;
    let room = null;
    if (net.active) {
      const names = [`${g.profile.name} (sen)`, ...[...net.players.values()].map((p) => p.name)];
      const codeEl = h('button', { class: 'room-code', title: 'Kopyalamak için tıkla' }, net.code);
      codeEl.addEventListener('click', () => {
        navigator.clipboard?.writeText(net.code).then(() => g.ui.hud.toast('📋 Oda kodu kopyalandı', 'success', 1800), () => {});
      });
      room = h('div', { class: 'pause-room' },
        h('div', {}, net.isHost ? 'Odanın kodu' : 'Bulunduğun oda', ' · ', h('b', {}, `${net.playerCount}/${MAX_PLAYERS}`)),
        codeEl,
        h('div', { class: 'pr-names' }, names.join(' · ')),
        h('div', { class: 'inv-note', style: { margin: 0 } }, 'Çok oyunculuda oyun duraklamaz.'),
      );
    }
    const leaveLabel = net.isHost ? '⏏  Odayı Kapat ve Ana Menüye Dön' : net.isClient ? '⏏  Odadan Ayrıl' : '⏏  Kaydet ve Ana Menüye Dön';
    this.show('pause', h('div', { class: 'pause-menu' },
      h('h2', {}, net.active ? 'MENÜ' : 'DURAKLATILDI'),
      h('div', { class: 'pause-stats' },
        h('span', { class: 'pause-diff', style: { color: d.color } }, `${d.icon} ${d.name}`),
        ` · Gün ${g.time.day} · Seviye ${g.progression.level} · ${Math.round(s.distanceWalked)} m yürüdün · ${s.treesFelled} ağaç`),
      room,
      h('button', { class: 'btn primary', onclick: () => g.resume() }, '▶  Devam Et'),
      dead ? null : h('button', { class: 'btn', onclick: () => { if (g.save()) g.ui.hud.toast(net.isClient ? '💾 Karakterin kaydedildi' : '💾 Oyun kaydedildi', 'success'); } }, net.isClient ? '💾  Karakterimi Kaydet' : '💾  Kaydet'),
      !net.active && !dead ? h('button', { class: 'btn', onclick: () => { g.resume(); g.openRoom(); } }, '🌐  Odayı Aç (arkadaşlarını davet et)') : null,
      h('button', { class: 'btn', onclick: () => this.showCharacter('pause') }, '👤  Karakter'),
      h('button', { class: 'btn', onclick: () => this.showSettings('pause') }, '⚙  Ayarlar'),
      h('button', { class: 'btn', onclick: () => this.showControls('pause') }, '⌨  Kontroller'),
      h('button', {
        class: 'btn danger',
        onclick: () => {
          if (net.isHost && net.players.size > 0) {
            this.confirm('Oda kapatılsın mı?', `Odadaki ${net.players.size} oyuncunun bağlantısı kesilecek. Dünya kaydedilir.`, 'Evet, kapat', () => g.quitToMenu(), () => this.showPause());
          } else g.quitToMenu();
        },
      }, leaveLabel),
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
      const touchSeg = h('div', { class: 'seg' }, [['auto', 'Otomatik'], ['on', 'Açık'], ['off', 'Kapalı']].map(([id, label]) => h('button', {
        class: s.touchControls === id ? 'active' : '',
        onclick: () => { s.set('touchControls', id); this.showSettings(from); },
      }, label)));
      content = [
        h('div', { class: 'setting' }, h('span', {}, 'Dokunmatik kontroller'), touchSeg),
        slider('Dokunmatik bakış hassasiyeti', 'touchSensitivity', 0.3, 3, 0.05, (v) => `${v.toFixed(2)}×`),
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
  showDeath(cause, { dropped = false, difficulty = null } = {}) {
    const g = this.game;
    const d = difficulty ?? g.difficulty;
    this.show('death', h('div', { class: 'dialog', style: { textAlign: 'center' } },
      h('h2', {}, '💫 Bayıldın'),
      h('p', {}, DEATH_CAUSES[cause] ?? 'Gücün tükendi…'),
      h('p', { style: { color: '#a9b4b8', fontSize: '14px' } }, dropped
        ? `${d.icon} ${d.name} mod: eşyaların düştüğün yerde bir çuvalda kaldı (haritada 💀). Son uyuduğun yerde (ya da sahilde) uyanacaksın.`
        : 'Eşyaların sende kalır. Son uyuduğun yerde (ya da sahilde) uyanacaksın.'),
      h('div', { class: 'actions', style: { justifyContent: 'center' } }, h('button', { class: 'btn primary', onclick: () => g.respawn() }, 'Uyan')),
    ));
  }

  /** Hardcore: tek can bitti. */
  showGameOver(cause, mp = false) {
    const g = this.game;
    const s = g.state.stats;
    const p = g.progression;
    const reason = DEATH_CAUSES[cause]?.replace('bayıldın', 'öldün').replace('…', '.') ?? 'Gücün tükendi.';
    const text = mp
      ? g.net.isHost
        ? 'Hardcore modda tek canın vardı. Oda açık kaldıkça diğerlerini izleyebilirsin; odayı kapatınca bu dünya silinir.'
        : 'Hardcore modda tek canın vardı. Bu dünyada artık yalnızca izleyici olabilirsin.'
      : 'Hardcore modda tek canın vardı. Bu dünya silindi.';
    this.show('gameover', h('div', { class: 'dialog gameover', style: { textAlign: 'center' } },
      h('div', { class: 'go-skull' }, '☠️'),
      h('h2', {}, 'OYUN BİTTİ'),
      h('p', {}, reason),
      h('p', { style: { color: '#a9b4b8', fontSize: '14px' } }, text),
      h('div', { class: 'go-stats' },
        h('div', {}, h('b', {}, g.time.day), 'gün'),
        h('div', {}, h('b', {}, p.level), 'seviye'),
        h('div', {}, h('b', {}, s.treesFelled), 'ağaç'),
        h('div', {}, h('b', {}, s.animalsHunted ?? 0), 'av'),
      ),
      h('div', { class: 'actions', style: { justifyContent: 'center' } },
        mp ? h('button', { class: 'btn primary', onclick: () => g.enterSpectator() }, '👻  İzleyici olarak devam et') : null,
        h('button', { class: `btn ${mp ? 'danger' : 'primary'}`, onclick: () => g.quitToMenu() }, mp ? (g.net.isHost ? '⏏  Odayı kapat' : '⏏  Odadan ayrıl') : 'Ana Menü'),
      ),
    ));
  }

  /** Misafir: ev sahibiyle bağlantı koptu. */
  showDisconnected(reason) {
    const g = this.game;
    this.show('disconnected', h('div', { class: 'dialog', style: { textAlign: 'center' } },
      h('h2', {}, '🔌 Bağlantı Koptu'),
      h('p', {}, reason || 'Odayla bağlantı kesildi.'),
      h('p', { style: { color: '#a9b4b8', fontSize: '14px' } }, 'Karakterin (envanter, seviye, görevler) bu bilgisayarda kaydedildi. Aynı koda tekrar katılabilirsin.'),
      h('div', { class: 'actions', style: { justifyContent: 'center' } }, h('button', { class: 'btn primary', onclick: () => g.quitToMenu() }, 'Ana Menü')),
    ));
  }

  // ── Giriş metni ─────────────────────────────────────────
  showIntro(difficulty = null) {
    const d = difficulty ?? this.game.difficulty;
    const el = h('div', { class: 'intro' },
      h('div', { class: 'i-day' }, 'GÜN 1'),
      h('div', { class: 'i-text' }, 'Fırtına dindi. Geminden geriye yalnızca kıyıya vuran enkaz kaldı…', h('br'), 'Hayatta kalmak için önce etrafına bakmalısın.'),
      h('div', { class: 'i-diff', style: { color: d.color } }, `${d.icon} ${d.name}${d.permadeath ? ' — tek canın var' : ''}`),
    );
    this.game.ui.root.append(el);
    setTimeout(() => el.remove(), 7200);
  }
}

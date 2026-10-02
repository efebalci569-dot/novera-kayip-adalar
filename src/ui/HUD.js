import * as THREE from 'three';
import { h, kbd, renderSlot, itemChip } from './dom.js';
import { ITEMS } from '../data/items.js';
import { QUESTS, QUEST_TYPES } from '../data/quests.js';
import { RECIPE_MAP } from '../data/recipes.js';
import { BUILDINGS } from '../data/buildings.js';
import { HOTBAR_SIZE, LEVEL_MESSAGES } from '../data/progression.js';
import { keyLabel } from '../data/controls.js';
import { wrapAngle } from '../utils/math.js';

const COMPASS_POINTS = [
  ['K', 0, 'major'], ['KD', 45, ''], ['D', 90, 'major'], ['GD', 135, ''],
  ['G', 180, 'major'], ['GB', 225, ''], ['B', 270, 'major'], ['KB', 315, ''],
];

const FEATURE_HINTS = [
  ['inventory', 'inventory', 'Envanter'],
  ['crafting', 'crafting', 'Üretim'],
  ['building', 'building', 'İnşa'],
  ['journal', 'journal', 'Günlük'],
  ['map', 'map', 'Harita'],
  ['skills', 'skills', 'Yetenekler'],
  ['techtree', 'techtree', 'Teknoloji'],
  ['camera', 'camera', 'Kamera'],
];

const FEATURE_NAMES = {
  crafting: ['Üretim', 'crafting'], building: ['İnşa', 'building'], map: ['Harita', 'map'],
  skills: ['Yetenekler', 'skills'], techtree: ['Teknoloji Ağacı', 'techtree'],
};

/** Oyun içi ekran göstergeleri. Mümkün olduğunca sade: yalnızca gerekeni gösterir. */
export class HUD {
  constructor(game, root) {
    this.game = game;
    this.el = h('div', { class: 'hud off' });
    root.append(this.el);
    this._v = new THREE.Vector3();
    this.newHints = new Set();
    this.bannerQueue = [];
    this.bannerTimer = 0;
    this.floatCount = 0;
    this.fpsFrames = 0;
    this.fpsTime = 0;

    this.buildStats();
    this.buildCompass();
    this.buildRight();
    this.buildCenter();
    this.buildHotbar();
    this.buildSocial();
    this.keyHints = h('div', { class: 'key-hints' });
    this.toasts = h('div', { class: 'toasts' });
    this.floatLayer = h('div');
    this.markerLayer = h('div');
    this.markers = [0, 1, 2].map(() => {
      const label = h('span');
      const m = h('div', { class: 'world-marker hidden' }, h('div', { class: 'diamond' }), label);
      m._label = label;
      this.markerLayer.append(m);
      return m;
    });
    this.buildHelp = h('div', { class: 'build-help hidden' });
    this.clickHint = h('div', { class: 'click-hint hidden' }, 'Fareyle bakmak için ekrana tıkla (ya da basılı tutup sürükle)');
    this.vignette = h('div', { class: 'vignette' });
    this.saveIndicator = h('div', { class: 'save-indicator' }, '💾 Kaydedildi');
    this.fps = h('div', { class: 'fps hidden' });
    this.el.append(this.vignette, this.markerLayer, this.keyHints, this.toasts, this.floatLayer, this.buildHelp, this.clickHint, this.saveIndicator, this.fps);

    this.fadeEl = h('div', { class: 'fade' }, h('div', { class: 'fade-text' }), h('div', { class: 'fade-sub' }));
    root.append(this.fadeEl);

    this.subscribe();
    this.renderHotbar();
    this.renderHints();
  }

  // ── Kurulum ─────────────────────────────────────────────
  buildStats() {
    const mk = (icon, color) => {
      const fill = h('div', { class: 'fill', style: { background: color } });
      const val = h('span', { class: 'val' });
      const row = h('div', { class: 'stat-row' }, h('span', { class: 'icon' }, icon), h('div', { class: 'bar' }, fill), val);
      return { row, fill, val };
    };
    this.statEls = {
      health: mk('❤️', 'linear-gradient(90deg,#c9333a,#ff6b6b)'),
      hunger: mk('🍖', 'linear-gradient(90deg,#d9822b,#ffb85c)'),
      thirst: mk('💧', 'linear-gradient(90deg,#2f86d6,#6cc6ff)'),
      stamina: mk('⚡', 'linear-gradient(90deg,#d8b42a,#ffe56b)'),
    };
    this.effects = h('div', { class: 'stat-effects' });
    this.diffBadge = h('div', { class: 'diff-badge' });
    this.mpPanel = h('div', { class: 'mp-panel hidden' });
    this.el.append(h('div', { class: 'hud-left' },
      h('div', { class: 'hud-stats' }, ...Object.values(this.statEls).map((s) => s.row), this.effects),
      this.diffBadge,
      this.mpPanel,
    ));
  }

  /** Çok oyunculu: sohbet akışı, sohbet kutusu ve izleyici etiketi. */
  buildSocial() {
    this.chatOpen = false;
    this.chatFeed = h('div', { class: 'chat-feed' });
    this.chatInput = h('input', { class: 'chat-input', type: 'text', maxlength: '140', placeholder: 'Mesaj yaz… (Enter: gönder · Esc: kapat)' });
    this.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = this.chatInput.value.trim();
        if (text) {
          const sent = this.game.net.sendChat(text);
          if (sent) this.chatMessage(this.game.profile.name, sent, true);
        }
        this.closeChat();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.closeChat();
      }
    });
    this.chatInput.addEventListener('blur', () => {
      if (this.chatOpen) setTimeout(() => this.chatOpen && this.closeChat(false), 0);
    });
    this.chatBox = h('div', { class: 'chat hidden' }, this.chatFeed, this.chatInput);
    this.spectatorTag = h('div', { class: 'spectator-tag hidden' }, '👻 İZLEYİCİ MODU', h('small', {}, 'Hardcore: bu dünyada tek canın vardı. Diğerlerini izleyebilirsin.'));
    this.el.append(this.chatBox, this.spectatorTag);
  }

  openChat() {
    if (this.chatOpen) return;
    this.chatOpen = true;
    this.chatBox.classList.remove('hidden');
    this.chatBox.classList.add('open');
    this.chatInput.value = '';
    this.game.input.exitLock();
    setTimeout(() => this.chatInput.focus(), 0);
  }

  closeChat(relock = true) {
    if (!this.chatOpen) return;
    this.chatOpen = false;
    this.chatBox.classList.remove('open');
    this.chatInput.blur();
    const g = this.game;
    if (relock && g.state.mode === 'playing' && !g.ui.active && !g.mpMenu) g.input.requestLock();
  }

  addChatLine(el) {
    this.chatBox.classList.remove('hidden');
    this.chatFeed.append(el);
    while (this.chatFeed.children.length > 40) this.chatFeed.firstChild.remove();
    this.chatFeed.scrollTop = this.chatFeed.scrollHeight;
    setTimeout(() => el.classList.add('old'), 12000);
  }

  chatMessage(name, text, self = false) {
    this.addChatLine(h('div', { class: `chat-line ${self ? 'self' : ''}` }, h('b', {}, `${name}: `), text));
    if (!self) this.game.audio.play('click', { volume: 0.5 });
  }

  chatSystem(text) {
    this.addChatLine(h('div', { class: 'chat-line system' }, text));
  }

  setSpectator(on) {
    this.el.classList.toggle('spectator', on);
    this.spectatorTag.classList.toggle('hidden', !on);
  }

  /** Sol üstteki oda paneli: oda kodu ve oyuncular. */
  renderPlayers() {
    const g = this.game;
    const net = g.net;
    this.mpPanel.classList.toggle('hidden', !net.active);
    if (!net.active) {
      this.mpPanel.replaceChildren();
      return;
    }
    const rows = [{ name: g.profile.name, self: true, host: net.isHost }];
    for (const p of net.players.values()) rows.push({ name: p.name, host: p.id === net.hostId });
    this.mpPanel.replaceChildren(
      h('div', { class: 'mp-head' },
        h('span', {}, '🌐 Oda ', h('b', { class: 'mp-code' }, net.code ?? '……')),
        h('span', { class: 'mp-count' }, `${net.playerCount}/8`),
      ),
      ...rows.map((r) => h('div', { class: `mp-row ${r.self ? 'self' : ''}` },
        h('span', { class: 'dot' }), r.name, r.host ? h('span', { class: 'crown', title: 'Odayı kuran' }, '👑') : null)),
      h('div', { class: 'mp-hint' }, `Sohbet: ${keyLabel(g.settings.bindings.chat?.[0])}`),
    );
  }

  renderDifficulty() {
    const g = this.game;
    const d = g.difficulty;
    this.diffShown = g.state.difficulty;
    this.diffBadge.style.setProperty('--c', d.color);
    this.diffBadge.textContent = `${d.icon} ${d.name}`;
    this.diffBadge.title = d.desc;
  }

  buildCompass() {
    this.compass = h('div', { class: 'compass' }, h('div', { class: 'center' }));
    this.ticks = [];
    for (const [label, deg, cls] of COMPASS_POINTS) {
      const t = h('div', { class: `tick ${cls}` }, label);
      t._angle = (deg * Math.PI) / 180;
      this.compass.append(t);
      this.ticks.push(t);
    }
    for (let deg = 15; deg < 360; deg += 15) {
      if (deg % 45 === 0) continue;
      const t = h('div', { class: 'tick minor' }, '·');
      t._angle = (deg * Math.PI) / 180;
      this.compass.append(t);
      this.ticks.push(t);
    }
    this.compassMarkers = [0, 1, 2].map(() => {
      const m = h('div', { class: 'marker hidden' }, '◆');
      this.compass.append(m);
      return m;
    });
    this.regionLabel = h('div', { class: 'region-label' });
    this.el.append(this.compass, this.regionLabel);
  }

  buildRight() {
    this.dayEl = h('div', { class: 'hud-day' });
    this.phaseEl = h('div', { class: 'hud-phase' });
    this.levelEl = h('span', { class: 'lvl' });
    this.xpFill = h('div', { class: 'fill' });
    this.xpText = h('div', { class: 'hud-xp-text' });
    this.perkBadge = h('div', { class: 'perk-badge hidden' });
    const clock = h('div', { class: 'hud-clock' },
      this.dayEl, this.phaseEl,
      h('div', { class: 'hud-level' }, this.perkBadge, this.levelEl),
      h('div', { class: 'bar hud-xp' }, this.xpFill),
      this.xpText,
    );
    this.tracker = h('div', { class: 'quest-tracker' });
    this.xpPopLayer = h('div', { style: { position: 'absolute', right: '232px', top: '58px' } });
    this.el.append(h('div', { class: 'hud-right' }, clock, this.tracker), this.xpPopLayer);
  }

  buildCenter() {
    this.crosshair = h('div', { class: 'crosshair' });
    this.promptMain = h('div', { class: 'interact-main' });
    this.promptSub = h('div', { class: 'interact-sub' });
    this.promptNote = h('div', { class: 'interact-note' });
    this.promptHpFill = h('div', { class: 'fill' });
    this.promptHp = h('div', { class: 'bar interact-hp' }, this.promptHpFill);
    this.prompt = h('div', { class: 'interact-prompt hidden' }, this.promptMain, this.promptHp, this.promptNote);
    this.el.append(this.crosshair, this.prompt);
  }

  buildHotbar() {
    this.hotbarSlots = [];
    this.hotbar = h('div', { class: 'hotbar' });
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const s = h('div', { class: 'slot' });
      this.hotbarSlots.push(s);
      this.hotbar.append(s);
    }
    this.hotbarLabel = h('div', { class: 'hotbar-label' });
    this.el.append(this.hotbar, this.hotbarLabel);
  }

  // ── Olaylar ─────────────────────────────────────────────
  subscribe() {
    const bus = this.game.bus;
    bus.on('inventory:changed', ({ inventory }) => {
      if (inventory === this.game.player.inventory) this.renderHotbar();
    });
    bus.on('hotbar:selected', () => {
      this.renderHotbar();
      const item = this.game.player.selectedItem;
      this.showHotbarLabel(item ? item.name : 'Boş el');
    });
    for (const ev of ['quest:started', 'quest:progress', 'quest:completed']) bus.on(ev, () => this.renderTracker());
    bus.on('quest:started', ({ quest }) => {
      this.toast(`${quest.type === 'side' ? '📜 Yeni yan görev' : '📜 Yeni görev'}: ${quest.title}`, 'unlock');
      this.game.audio.play('notify');
    });
    bus.on('quest:completed', ({ quest }) => {
      this.game.audio.play('quest');
      if (quest.type === 'side') this.toast(`✅ Yan görev tamamlandı: ${quest.title}`, 'success');
      else this.banner('Görev Tamamlandı', quest.title, this.rewardText(quest.rewards));
    });
    bus.on('feature:unlocked', ({ id }) => {
      const f = FEATURE_NAMES[id];
      if (f) {
        this.newHints.add(id);
        const code = this.game.settings.bindings[f[1]]?.[0];
        this.toast(`🔓 Yeni sistem açıldı: ${f[0]} [${keyLabel(code)}]`, 'unlock');
      }
      this.renderHints();
    });
    bus.on('recipe:unlocked', ({ id }) => {
      const r = RECIPE_MAP[id];
      if (!r || id === 'stone_axe') return;
      this.toast(`📘 Yeni tarif: ${r.name ?? ITEMS[r.result]?.name}`, 'unlock');
    });
    bus.on('building:unlocked', ({ id }) => this.toast(`🏗️ Yeni yapı: ${BUILDINGS[id].name}`, 'unlock'));
    bus.on('level:up', ({ level }) => {
      this.game.audio.play('levelup');
      this.banner(`Seviye ${level}`, 'Seviye atladın!', LEVEL_MESSAGES[level] ?? '+1 Yetenek puanı');
    });
    bus.on('xp:gained', ({ amount }) => this.xpPop(amount));
    bus.on('region:entered', ({ id, first, def }) => {
      this.regionLabel.textContent = def?.name ?? '';
      if (first) {
        this.banner('Bölge Keşfedildi', def.name, def.subtitle);
        this.game.audio.play('discover', { volume: 0.7 });
      }
    });
    bus.on('landmark:discovered', ({ def }) => {
      this.banner('Keşfedildi', `${def.icon} ${def.name}`, '');
      this.game.audio.play('discover');
    });
    bus.on('player:warning', ({ message }) => this.toast(`⚠️ ${message}`, 'warn'));
    bus.on('build:mode', () => this.renderHints());
    bus.on('chapter:completed', ({ chapter }) => {
      if (chapter === 1) this.banner('Bölüm 1 Tamamlandı', 'Adanın Sırrı', 'Sırada: dağın altındaki mağara ve demir…', 7);
      else this.banner(`Bölüm ${chapter} Tamamlandı`, 'Derinliklerin Sesi', 'Devamı yakında: fırın, demir çağı ve yeni adalar…', 7);
    });
    bus.on('perk:points', () => this.updateRight());
    bus.on('ambience:creature', () => {
      if (Math.random() < 0.6) this.game.audio.play('howl');
    });
  }

  rewardText(r = {}) {
    const parts = [];
    if (r.xp) parts.push(`+${r.xp} XP`);
    for (const [id, n] of Object.entries(r.items ?? {})) parts.push(`${ITEMS[id].icon} ${n} ${ITEMS[id].name}`);
    if (r.perkPoints) parts.push(`+${r.perkPoints} Yetenek puanı`);
    return parts.join('   ·   ');
  }

  // ── Bileşenler ──────────────────────────────────────────
  setVisible(v) {
    this.el.classList.toggle('off', !v);
  }

  renderHotbar() {
    const p = this.game.player;
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const code = this.game.settings.bindings[`hotbar${i + 1}`]?.[0];
      renderSlot(this.hotbarSlots[i], p.inventory.slots[i], { key: keyLabel(code), selected: i === p.selectedSlot });
    }
  }

  showHotbarLabel(text) {
    this.hotbarLabel.textContent = text;
    this.hotbarLabel.classList.add('show');
    clearTimeout(this.hotbarLabelTimer);
    this.hotbarLabelTimer = setTimeout(() => this.hotbarLabel.classList.remove('show'), 1400);
  }

  renderHints() {
    const g = this.game;
    this.keyHints.replaceChildren();
    if (g.building.active) return;
    for (const [feature, action, label] of FEATURE_HINTS) {
      if (feature !== 'inventory' && feature !== 'camera' && !g.state.hasFeature(feature)) continue;
      const code = g.settings.bindings[action]?.[0];
      this.keyHints.append(h('div', { class: `hint ${this.newHints.has(feature) ? 'new' : ''}` }, kbd(code), label));
    }
  }

  renderTracker() {
    const q = this.game.quests;
    const list = q.list();
    const main = list.filter((x) => x.quest.type !== 'side').slice(0, 2);
    const side = list.filter((x) => x.quest.type === 'side').slice(0, 2);
    const prev = new Set([...this.tracker.children].map((c) => c.dataset.id));
    this.tracker.replaceChildren();
    for (const { id, quest, state } of [...main, ...side]) {
      const item = h('div', { class: `qt-item ${quest.type} ${prev.has(id) ? '' : 'enter'}`, dataset: { id } },
        h('div', { class: 'qt-type', style: { color: QUEST_TYPES[quest.type].color } }, QUEST_TYPES[quest.type].name),
        h('div', { class: 'qt-title' }, quest.title),
      );
      quest.objectives.forEach((o, i) => {
        const target = o.amount ?? 1;
        const cur = Math.floor(state.progress[i]);
        const done = cur >= target;
        const count = o.type === 'walk' || o.type === 'sail' ? `${cur}/${target} m` : target > 1 ? `${cur}/${target}` : done ? '✓' : '';
        item.append(h('div', { class: `qt-obj ${done ? 'done' : ''}` }, h('span', {}, `${done ? '✔' : '○'} ${o.label}`), h('span', { class: 'count' }, count)));
      });
      if (quest.hint && quest.type !== 'side') item.append(h('div', { class: 'qt-hint' }, `💡 ${quest.hint}`));
      this.tracker.append(item);
    }
    if (!list.length && this.game.quests.isCompleted('q_sealed_door')) {
      this.tracker.append(h('div', { class: 'qt-item' },
        h('div', { class: 'qt-type' }, 'Serbest Oyun'),
        h('div', { class: 'qt-title' }, this.game.quests.isCompleted('q_miner') ? 'Bölüm 2 tamamlandı' : 'Bölüm 1 tamamlandı'),
        h('div', { class: 'qt-hint' }, 'Üssünü büyüt, yan görevleri tamamla ve adayı keşfetmeye devam et.'),
      ));
    }
  }

  toast(text, type = 'info', duration = 3600) {
    const t = h('div', { class: `toast ${type}` }, text);
    this.toasts.append(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 500);
    }, duration);
  }

  banner(kicker, title, sub = '', duration = 3.4) {
    this.bannerQueue.push({ kicker, title, sub, duration });
  }

  showNextBanner() {
    const b = this.bannerQueue.shift();
    if (!b) return;
    this.bannerEl?.remove();
    this.bannerEl = h('div', { class: 'banner' },
      h('div', { class: 'b-kicker' }, b.kicker),
      h('div', { class: 'b-title' }, b.title),
      h('div', { class: 'b-line' }),
      b.sub ? h('div', { class: 'b-sub' }, b.sub) : null,
    );
    this.el.append(this.bannerEl);
    this.bannerTimer = b.duration;
    const el = this.bannerEl;
    setTimeout(() => el.classList.add('out'), (b.duration - 0.9) * 1000);
    setTimeout(() => el.remove(), b.duration * 1000 + 200);
  }

  floatText(text, color = '#ffffff') {
    const offset = (this.floatCount % 4) * 24;
    this.floatCount++;
    const el = h('div', { class: 'float-text', style: { color, marginTop: `${-offset}px` } }, text);
    this.floatLayer.append(el);
    setTimeout(() => {
      el.remove();
      this.floatCount = Math.max(0, this.floatCount - 1);
    }, 1400);
  }

  xpPop(amount) {
    const el = h('div', { class: 'xp-pop' }, `+${amount} XP`);
    this.xpPopLayer.append(el);
    setTimeout(() => el.remove(), 1300);
  }

  showSaved() {
    this.saveIndicator.classList.add('show');
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveIndicator.classList.remove('show'), 1600);
  }

  fade(on, text = '', sub = '') {
    this.fadeEl.children[0].textContent = text;
    this.fadeEl.children[1].textContent = sub;
    this.fadeEl.classList.toggle('on', on);
  }

  // ── Kare güncellemesi ───────────────────────────────────
  update(dt) {
    const g = this.game;
    if (this.diffShown !== g.state.difficulty) this.renderDifficulty();
    this.updateStats();
    this.updateRight();
    this.updateCompass();
    this.updatePrompt();
    this.updateMarkers();
    this.updateBuildHelp();

    const showClick = g.state.mode === 'playing' && !g.ui.active && !g.input.pointerLocked && !this.chatOpen && !g.mpMenu;
    this.clickHint.classList.toggle('hidden', !showClick);

    this.bannerTimer -= dt;
    if (this.bannerTimer <= 0 && this.bannerQueue.length) this.showNextBanner();

    if (g.settings.showFps) {
      this.fps.classList.remove('hidden');
      this.fpsFrames++;
      this.fpsTime += dt;
      if (this.fpsTime >= 0.5) {
        this.fps.textContent = `${Math.round(this.fpsFrames / this.fpsTime)} FPS`;
        this.fpsFrames = 0;
        this.fpsTime = 0;
      }
    } else this.fps.classList.add('hidden');
  }

  updateStats() {
    const s = this.game.player.stats;
    const set = (key, v, max) => {
      const e = this.statEls[key];
      e.fill.style.transform = `scaleX(${Math.max(0, v / max)})`;
      e.val.textContent = `${Math.ceil(v)}/${Math.round(max)}`;
      e.row.classList.toggle('low', v / max < 0.25);
    };
    set('health', s.health, s.maxHealth);
    set('hunger', s.hunger, 100);
    set('thirst', s.thirst, 100);
    set('stamina', s.stamina, s.maxStamina);
    const fx = [];
    if (s.starving) fx.push('Açlık: yavaşladın, can kaybediyorsun');
    if (s.dehydrated) fx.push('Susuzluk: can kaybediyorsun');
    if (s.exhausted) fx.push('Yorgun: koşamazsın');
    const txt = fx.join(' · ');
    if (this.effects.textContent !== txt) this.effects.textContent = txt;
    const hpLow = s.health / s.maxHealth;
    this.vignette.style.opacity = hpLow < 0.35 ? String((0.35 - hpLow) / 0.35) : '0';
  }

  updateRight() {
    const g = this.game;
    const t = g.time;
    this.dayEl.textContent = `Gün ${t.day}`;
    this.phaseEl.textContent = `${t.phaseName} · ${t.clock}`;
    const p = g.progression;
    this.levelEl.textContent = `Seviye ${p.level}`;
    this.xpFill.style.transform = `scaleX(${p.xp / p.xpToNext})`;
    this.xpText.textContent = `${p.xp} / ${p.xpToNext} XP`;
    if (p.perkPoints > 0) {
      const code = keyLabel(g.settings.bindings.skills?.[0]);
      const txt = `✨ ${p.perkPoints} yetenek puanı [${code}]`;
      if (this.perkBadge.textContent !== txt) this.perkBadge.textContent = txt;
      this.perkBadge.classList.remove('hidden');
    } else this.perkBadge.classList.add('hidden');
  }

  updateCompass() {
    const g = this.game;
    const heading = -g.cameraController.yaw;
    const half = Math.PI / 2;
    for (const t of this.ticks) {
      const rel = wrapAngle(t._angle - heading);
      if (Math.abs(rel) > half * 1.05) {
        t.style.display = 'none';
        continue;
      }
      t.style.display = '';
      t.style.left = `${50 + (rel / half) * 50}%`;
    }
    const markers = this.cachedMarkers ?? [];
    const p = g.player.position;
    this.compassMarkers.forEach((m, i) => {
      const mk = markers[i];
      if (!mk) {
        m.classList.add('hidden');
        return;
      }
      const bearing = Math.atan2(mk.x - p.x, -(mk.z - p.z));
      const rel = wrapAngle(bearing - heading);
      const clamped = Math.max(-half, Math.min(half, rel));
      m.classList.remove('hidden');
      m.classList.toggle('side', mk.type === 'side');
      m.style.left = `${50 + (clamped / half) * 50}%`;
      m.style.opacity = Math.abs(rel) > half ? '0.5' : '1';
    });
  }

  updatePrompt() {
    const g = this.game;
    const t = g.interaction.target;
    const show = !!t && g.state.mode === 'playing' && !g.ui.active;
    this.prompt.classList.toggle('hidden', !show);
    this.crosshair.classList.toggle('active', !!t);
    if (!show) return;
    const pr = t.prompt;
    const key = keyLabel(g.settings.bindings.interact?.[0]);
    const sig = `${key}|${pr.action}|${pr.name}|${pr.disabled}|${pr.note}|${pr.uses}`;
    if (sig !== this.promptSig) {
      this.promptSig = sig;
      this.promptMain.replaceChildren(kbd(g.settings.bindings.interact?.[0]), ` ${pr.action}`, h('span', { style: { color: '#a9b4b8', fontWeight: 500 } }, ` — ${pr.name}${pr.uses ? ` (${pr.uses})` : ''}`));
      this.promptMain.classList.toggle('disabled', !!pr.disabled);
      this.promptNote.textContent = pr.note ?? '';
      this.promptNote.classList.toggle('hidden', !pr.note);
    }
    const hasHp = pr.hp !== undefined && pr.hp < 1;
    this.promptHp.classList.toggle('hidden', !hasHp);
    if (hasHp) this.promptHpFill.style.transform = `scaleX(${pr.hp})`;
  }

  updateMarkers() {
    const g = this.game;
    this.markerTimer = (this.markerTimer ?? 0) - 1;
    if (this.markerTimer <= 0) {
      this.markerTimer = 10;
      this.cachedMarkers = g.state.mode === 'playing' ? g.quests.getMarkers().slice(0, 3) : [];
    }
    const cam = g.camera;
    const w = window.innerWidth;
    const hh = window.innerHeight;
    const p = g.player.position;
    this.markers.forEach((el, i) => {
      const mk = this.cachedMarkers[i];
      if (!mk || g.ui.active) {
        el.classList.add('hidden');
        return;
      }
      const d = Math.hypot(mk.x - p.x, mk.z - p.z);
      if (d < 3.5 || d > 220) {
        el.classList.add('hidden');
        return;
      }
      this._v.set(mk.x, mk.y, mk.z).project(cam);
      if (this._v.z > 1 || Math.abs(this._v.x) > 1.1 || Math.abs(this._v.y) > 1.1) {
        el.classList.add('hidden');
        return;
      }
      el.classList.remove('hidden');
      el.classList.toggle('side', mk.type === 'side');
      el.style.left = `${((this._v.x + 1) / 2) * w}px`;
      el.style.top = `${((1 - this._v.y) / 2) * hh}px`;
      const label = `${Math.round(d)} m`;
      if (el._label.textContent !== label) el._label.textContent = label;
    });
  }

  updateBuildHelp() {
    const b = this.game.building;
    if (!b.active) {
      this.buildHelp.classList.add('hidden');
      this.buildSig = null;
      return;
    }
    this.buildHelp.classList.remove('hidden');
    const def = BUILDINGS[b.type];
    const reason = b.placement && !b.placement.valid ? b.placement.reason : '';
    const sig = `${b.type}|${reason}`;
    if (sig === this.buildSig) return;
    this.buildSig = sig;
    const inv = this.game.player.inventory;
    const s = this.game.settings.bindings;
    this.buildHelp.replaceChildren(
      h('div', { class: 'bh-title' }, `${def.icon} ${def.name}`),
      h('div', { class: 'cost' }, Object.entries(def.cost).map(([id, n]) => itemChip(id, n, inv.count(id)))),
      h('div', { class: 'bh-keys' },
        h('span', {}, kbd(s.primary?.[0]), ' Yerleştir'),
        h('span', {}, kbd(s.rotate?.[0]), ' Döndür'),
        h('span', {}, kbd(s.secondary?.[0]), ' / ', kbd('Escape'), ' İptal'),
      ),
      ...(reason ? [h('div', { class: 'bh-reason' }, reason)] : []),
    );
  }
}

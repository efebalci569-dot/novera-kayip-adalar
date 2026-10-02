import * as THREE from 'three';
import { EventBus } from './EventBus.js';
import { Settings } from './Settings.js';
import { InputManager } from './InputManager.js';
import { TimeManager } from './TimeManager.js';
import { SaveManager } from './SaveManager.js';
import { GameState } from './GameState.js';
import { AudioManager } from './AudioManager.js';
import { WorldManager } from '../world/WorldManager.js';
import { Player } from '../player/Player.js';
import { PlayerController } from '../player/PlayerController.js';
import { CameraController } from '../player/CameraController.js';
import { ViewModel } from '../player/ViewModel.js';
import { ProgressionSystem } from '../systems/ProgressionSystem.js';
import { ExplorationSystem } from '../systems/ExplorationSystem.js';
import { BuildingSystem } from '../systems/BuildingSystem.js';
import { CraftingSystem } from '../systems/CraftingSystem.js';
import { InteractionSystem } from '../systems/InteractionSystem.js';
import { QuestSystem } from '../systems/QuestSystem.js';
import { UIManager } from '../ui/UIManager.js';
import { smoothstep } from '../utils/math.js';

const AUTOSAVE_INTERVAL = 60;
const START_ITEMS = { berries: 2 };

/**
 * Oyunun kalbi: tüm modülleri oluşturur, oyun döngüsünü çalıştırır ve
 * oyun modları (menü, oynanış, duraklatma, uyku, bayılma) arasında geçişi yönetir.
 */
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.bus = new EventBus();
    this.settings = Settings.load();
    this.state = new GameState(this.bus);
    this.time = new TimeManager(this.bus);
    this.input = new InputManager(canvas, this.settings);
    this.audio = new AudioManager(this.settings);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 0.1, 2200);

    this.world = new WorldManager(this);
    this.player = new Player(this);
    this.player.model.root.visible = false;
    this.cameraController = new CameraController(this.camera, this);
    this.cameraController.applyMode();
    this.playerController = new PlayerController(this, this.player);
    this.viewModel = new ViewModel();

    this.progression = new ProgressionSystem(this);
    this.exploration = new ExplorationSystem(this);
    this.building = new BuildingSystem(this);
    this.crafting = new CraftingSystem(this);
    this.interaction = new InteractionSystem(this);
    this.quests = new QuestSystem(this);

    this.ui = new UIManager(this);

    this.autosaveTimer = AUTOSAVE_INTERVAL;
    this.saveRequested = 0;
    this.lastTime = performance.now();
    this.menuFocus = new THREE.Vector3(0, 0, 0);

    this.applySettings();
    this.settings.onChange((key) => {
      if (key === 'quality' || key === 'fov') this.applySettings();
      if (key === 'cameraMode') this.cameraController.setMode(this.settings.cameraMode);
      if (key === 'bindings') {
        this.ui.hud.renderHotbar();
        this.ui.hud.renderHints();
      }
    });
    window.addEventListener('resize', () => this.onResize());
    this.input.onLockChange((locked) => this.onLockChange(locked));
    canvas.addEventListener('click', () => {
      if (this.state.mode === 'playing' && !this.ui.active) this.input.requestLock();
    });
    window.addEventListener('beforeunload', () => this.save());
    this.subscribe();

    this.state.mode = 'menu';
    this.renderer.setAnimationLoop(() => this.loop());
  }

  subscribe() {
    const bus = this.bus;
    bus.on('player:died', ({ source }) => this.onDeath(source));
    bus.on('time:phase', ({ phase }) => {
      if (this.state.mode !== 'playing') return;
      if (phase.id === 'evening' && this.building.count('hut') === 0) {
        this.notify('🌅 Hava kararıyor! Gece çökmeden bir sığınak kurmalısın.', 'warn');
      }
      if (phase.id === 'night') {
        const first = !this.state.flags.sawFirstNight;
        this.state.flags.sawFirstNight = true;
        this.notify(first ? '🌙 İlk gece… Ormanın derinliklerinde bir şeyler kıpırdıyor. Ateşin yanında kal.' : '🌙 Gece çöktü.', first ? 'warn' : 'info');
      }
    });
    bus.on('time:dawn', ({ day }) => {
      if (this.state.mode === 'playing') this.ui.hud.banner('Yeni Gün', `Gün ${day}`, 'Hayatta kaldın.');
    });
    bus.on('player:damaged', ({ source }) => {
      if (source !== 'starving' && source !== 'thirst') this.audio.play('hurt');
    });
  }

  // ── Ayarlar / pencere ───────────────────────────────────
  applySettings() {
    const preset = this.settings.qualityPreset;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio));
    this.world.dayNight.setShadowQuality(preset.shadows, preset.shadowMapSize);
    this.world.dayNight.setFogScale(preset.fog);
    this.world.grass.setDensity(preset.grass);
    this.world.resources.lodDistance = preset.lod;
    this.camera.fov = this.settings.fov;
    this.onResize();
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  notify(text, type = 'info') {
    this.ui.hud.toast(text, type);
  }

  // ── Oyun akışı ──────────────────────────────────────────
  showMainMenu() {
    this.state.mode = 'menu';
    this.ui.hud.setVisible(false);
    this.ui.menu.showMain();
  }

  enterPlay() {
    this.state.mode = 'playing';
    this.player.model.root.visible = true;
    this.ui.menu.hide();
    this.ui.hud.setVisible(true);
    this.ui.hud.renderTracker();
    this.ui.hud.renderHints();
    this.ui.hud.renderHotbar();
    this.input.requestLock();
    this.lastTime = performance.now();
  }

  startNewGame() {
    this.audio.init();
    const sp = this.world.spawnPoint;
    this.player.teleport(sp.x, sp.y, sp.z, Math.PI);
    this.cameraController.yaw = 0;
    this.cameraController.pitch = 0.28;
    this.time.day = 1;
    this.time.hour = 7;
    this.time.phase = this.time.computePhase();
    for (const [id, n] of Object.entries(START_ITEMS)) this.player.inventory.add(id, n);
    this.enterPlay();
    this.ui.hud.bannerTimer = 7; // giriş metni bitene kadar başlık bildirimlerini beklet
    this.ui.menu.showIntro();
    this.quests.begin();
    this.save();
  }

  continueGame() {
    const data = SaveManager.load();
    if (!data) {
      this.startNewGame();
      return;
    }
    this.audio.init();
    try {
      this.loadSave(data);
    } catch (err) {
      console.error('Kayıt yüklenirken hata:', err);
      this.notify('Kayıt kısmen yüklenemedi.', 'warn');
    }
    this.enterPlay();
    this.ui.hud.toast(`Tekrar hoş geldin! Gün ${this.time.day}`, 'success');
  }

  pause() {
    if (this.state.mode !== 'playing') return;
    this.state.mode = 'paused';
    this.input.exitLock();
    this.ui.menu.showPause();
  }

  resume() {
    if (this.state.mode !== 'paused') return;
    this.state.mode = 'playing';
    this.ui.menu.hide();
    this.input.requestLock();
    this.lastTime = performance.now();
  }

  quitToMenu() {
    this.save();
    // Dünyayı temiz başlatmanın en güvenilir yolu: sayfayı yeniden yüklemek
    window.location.reload();
  }

  onLockChange(locked) {
    if (locked) return;
    if (this.state.mode !== 'playing' || this.ui.active) return;
    if (this.building.active) {
      this.building.cancel();
      return;
    }
    this.pause();
  }

  sleep() {
    if (this.state.mode !== 'playing') return;
    this.state.mode = 'sleeping';
    this.player.cancelAction();
    this.input.exitLock();
    this.ui.hud.fade(true, 'Uyuyorsun…', 'Sabahı bekliyorsun');
    this.audio.play('sleep');
    setTimeout(() => {
      this.time.skipTo(6);
      const s = this.player.stats;
      s.stamina = s.maxStamina;
      s.health = Math.min(s.maxHealth, s.health + 30);
      s.hunger = Math.max(5, s.hunger - 12);
      s.thirst = Math.max(5, s.thirst - 15);
      this.bus.emit('player:slept', {});
    }, 1400);
    setTimeout(() => {
      this.ui.hud.fade(false);
      this.state.mode = 'playing';
      this.notify(`☀️ Günaydın! Gün ${this.time.day} başladı.`, 'success');
      this.save();
      this.lastTime = performance.now();
    }, 3000);
  }

  onDeath(source) {
    this.state.mode = 'dead';
    this.player.cancelAction();
    this.building.cancel();
    this.ui.close();
    this.input.exitLock();
    this.ui.hud.fade(true, '', '');
    setTimeout(() => this.ui.menu.showDeath(source), 1200);
  }

  respawn() {
    const sp = this.state.spawnPoint ?? this.world.spawnPoint;
    const y = this.world.getGroundHeight(sp.x, sp.z, sp.y + 1);
    this.player.teleport(sp.x, y, sp.z);
    this.player.stats.revive();
    this.state.stats.deaths++;
    this.time.advance(2);
    this.ui.menu.hide();
    this.ui.hud.fade(false);
    this.state.mode = 'playing';
    this.input.requestLock();
    this.notify('Uyandın. Kendine iyi bak — yemek ve su ihmal edilmemeli.', 'info');
    this.save();
  }

  // ── Kayıt ───────────────────────────────────────────────
  serialize() {
    return {
      state: this.state.serialize(),
      time: this.time.serialize(),
      progression: this.progression.serialize(),
      player: this.player.serialize(),
      camera: this.cameraController.serialize(),
      resources: this.world.resources.serialize(this.time.elapsed),
      buildings: this.building.serialize(),
      drops: this.world.drops.serialize(),
      exploration: this.exploration.serialize(),
      quests: this.quests.serialize(),
    };
  }

  loadSave(d) {
    this.state.deserialize(d.state);
    this.time.deserialize(d.time);
    this.player.deserialize(d.player);
    this.progression.deserialize(d.progression);
    if (this.state.upgrades.backpack) this.player.model.setBackpack(true);
    this.world.resources.deserialize(d.resources, this.time.elapsed);
    this.building.deserialize(d.buildings);
    this.world.drops.deserialize(d.drops);
    this.exploration.deserialize(d.exploration);
    this.quests.deserialize(d.quests);
    this.cameraController.deserialize(d.camera);
    // güvenlik: oyuncu arazinin altında kaldıysa yukarı al
    const p = this.player.position;
    const ground = this.world.getGroundHeight(p.x, p.z, p.y + 1);
    if (p.y < ground - 0.5 || !Number.isFinite(p.y)) p.y = ground;
  }

  save() {
    const m = this.state.mode;
    if (m !== 'playing' && m !== 'paused' && m !== 'sleeping') return false;
    const ok = SaveManager.save(this.serialize());
    if (ok) this.ui.hud.showSaved();
    return ok;
  }

  /** Önemli olaylardan sonra kısa bir gecikmeyle kaydet (art arda kayıtları birleştirir). */
  requestSave() {
    this.saveRequested = 1.5;
  }

  // ── Döngü ───────────────────────────────────────────────
  loop() {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    const mode = this.state.mode;

    if (mode === 'menu') {
      this.cameraController.updateMenu(dt);
      this.world.update(dt, { hour: 17.3, focus: this.menuFocus, camera: this.camera, elapsed: this.time.elapsed });
      this.audio.update(dt, { coast: 0.55, forest: 0.2, altitude: 0.25, night: 0, nearFire: 0, active: true });
      this.handleMenuKeys();
    } else {
      this.handleKeys();
      const playing = this.state.mode === 'playing';
      const inputEnabled = playing && !this.ui.active;
      if (playing) {
        if (!this.ui.active) this.ui.handleHotkeys();
        else if (this.ui.active !== 'note' && this.ui.active !== 'container') this.ui.handleHotkeys();
        if (inputEnabled && this.input.wasPressed('camera')) {
          this.settings.set('cameraMode', this.cameraController.firstPerson ? 'third' : 'first');
        }
        this.time.update(dt);
        this.playerController.update(dt, inputEnabled);
        this.interaction.update(dt, inputEnabled);
        this.building.update(dt, inputEnabled);
        this.player.stats.update(dt, { running: this.player.running, decayMult: 1 - this.progression.bonus('decay') });
        this.exploration.update(dt);
        this.quests.update(dt);
        this.tickSave(dt);
      }
      if (this.state.mode !== 'paused') {
        this.player.update(dt);
        this.cameraController.update(dt, this.player, inputEnabled);
        this.world.update(dt, {
          hour: this.time.hour, focus: this.player.position, camera: this.camera, elapsed: this.time.elapsed,
          occlusionFocus: this.cameraController.firstPerson ? null : this.cameraController.target,
        });
        if (this.cameraController.firstPerson) {
          const a = this.player.action;
          this.viewModel.setHeld(this.player.model.heldKey);
          this.viewModel.update(dt, {
            action: a ? { type: a.type, k: a.t / a.dur } : null,
            speed: this.player.speed,
            walkPhase: this.player.model.walkPhase,
            swimming: this.player.swimming,
          });
        }
        this.audio.update(dt, this.ambientContext());
      }
    }

    this.ui.update(dt);
    this.renderer.render(this.scene, this.camera);
    if (mode !== 'menu' && this.cameraController.firstPerson && this.state.mode !== 'dead') {
      const dn = this.world.dayNight;
      this.viewModel.render(this.renderer, this.camera, dn.hemi, dn.light);
    }
    this.input.endFrame();
  }

  handleKeys() {
    const input = this.input;
    if (!input.keyPressed('Escape')) return;
    // tarayıcı imleç kilidini Esc ile bırakınca aynı basış ikinci kez işlenmesin
    if (performance.now() - input.lastUnlockTime < 300) return;
    const mode = this.state.mode;
    if (mode === 'playing') {
      if (this.ui.active) this.ui.close();
      else if (this.building.active) this.building.cancel();
      else this.pause();
    } else if (mode === 'paused') {
      if (this.ui.menu.current === 'pause') this.resume();
      else this.ui.menu.showPause();
    }
  }

  handleMenuKeys() {
    if (this.input.keyPressed('Escape') && this.ui.menu.current !== 'main') this.ui.menu.showMain();
  }

  tickSave(dt) {
    this.autosaveTimer -= dt;
    if (this.autosaveTimer <= 0) {
      this.autosaveTimer = AUTOSAVE_INTERVAL;
      this.save();
    }
    if (this.saveRequested > 0) {
      this.saveRequested -= dt;
      if (this.saveRequested <= 0) this.save();
    }
  }

  ambientContext() {
    const p = this.player.position;
    const island = this.world.island;
    const inland = island.inland(p.x, p.z);
    const fire = this.building.nearestFire(p);
    return {
      coast: 1 - smoothstep(4, 70, inland),
      forest: island.forestMask(p.x, p.z) * smoothstep(10, 40, inland),
      altitude: smoothstep(10, 42, p.y),
      night: this.world.dayNight.env.nightFactor,
      nearFire: 1 - smoothstep(2, 10, fire),
      active: this.state.mode === 'playing',
    };
  }
}

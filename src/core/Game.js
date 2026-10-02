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
import { AnimalSystem } from '../systems/AnimalSystem.js';
import { VehicleSystem } from '../systems/VehicleSystem.js';
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
    this.animals = new AnimalSystem(this);
    this.vehicles = new VehicleSystem(this);

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
      if (phase.id === 'evening') {
        if (this.building.count('hut') + this.building.count('cabin') + this.building.count('stone_house') === 0) {
          this.notify('🌅 Hava kararıyor! Gece çökmeden bir sığınak kurmalısın.', 'warn');
        } else if (this.building.count('bed') === 0) {
          this.notify('🌅 Hava kararıyor. Uyumak için bir yatağa ihtiyacın var (koyun yünü → battaniye → yatak).', 'warn');
        }
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

  /** rest: { shelter, comfort } — barınak içindeki yatakta uyumak daha çok dinlendirir. */
  sleep(rest = { shelter: null, comfort: 0 }) {
    if (this.state.mode !== 'playing') return;
    this.state.mode = 'sleeping';
    this.player.cancelAction();
    this.input.exitLock();
    const where = rest.shelter ? `${rest.shelter.name} içinde, sıcacık yatağında` : 'Açıkta, yatağında';
    this.ui.hud.fade(true, 'Uyuyorsun…', `${where} sabahı bekliyorsun`);
    this.audio.play('sleep');
    const comfort = rest.comfort ?? 0;
    let healed = 0;
    setTimeout(() => {
      this.time.skipTo(6);
      const s = this.player.stats;
      s.stamina = s.maxStamina;
      const heal = comfort >= 3 ? s.maxHealth : 20 + comfort * 20;
      healed = Math.round(Math.min(s.maxHealth - s.health, heal));
      s.health = Math.min(s.maxHealth, s.health + heal);
      s.hunger = Math.max(5, s.hunger - Math.max(6, 14 - comfort * 3));
      s.thirst = Math.max(5, s.thirst - Math.max(8, 16 - comfort * 3));
      this.bus.emit('player:slept', { comfort });
    }, 1400);
    setTimeout(() => {
      this.ui.hud.fade(false);
      this.state.mode = 'playing';
      const extra = rest.shelter ? ` ${rest.shelter.icon} İyi dinlendin (+${healed} ❤️).` : healed ? ` (+${healed} ❤️)` : '';
      this.notify(`☀️ Günaydın! Gün ${this.time.day} başladı.${extra}`, 'success');
      this.save();
      this.lastTime = performance.now();
    }, 3000);
  }

  // ── Mağara ──────────────────────────────────────────────
  enterCave() {
    const cave = this.world.cave;
    if (!cave || this.world.inCave || this.state.mode !== 'playing') return;
    this.transition('Mağaraya giriyorsun…', 'Karanlıkta yolunu bulmak için meşale işine yarar', () => {
      this.world.setCaveMode(true);
      const sp = cave.def.spawn;
      this.player.teleport(sp.x, cave.floorHeight(sp.x, sp.z), sp.z, Math.PI / 2);
      this.cameraController.yaw = Math.PI / 2 + Math.PI; // içeriye (doğuya) bak
      this.cameraController.lookPitch = -0.05;
      this.audio.play('cave', { volume: 0.8 });
      if (!this.player.inventory.count('torch')) this.notify('🔦 İçerisi çok karanlık. Bir meşale yapıp eline alırsan çok daha iyi görürsün.', 'warn');
    });
  }

  exitCave() {
    if (!this.world.inCave) return;
    const entrance = this.world.landmarks.byId.cave_entrance;
    this.transition('Gün ışığına çıkıyorsun…', '', () => {
      this.world.setCaveMode(false);
      const p = entrance?.exitPoint ?? this.world.spawnPoint;
      this.player.teleport(p.x, this.world.getGroundHeight(p.x, p.z), p.z, -Math.PI / 2);
      this.cameraController.yaw = Math.PI / 2; // batıya, mağaradan uzağa bak
      this.cameraController.lookPitch = 0;
    });
  }

  /** Kısa kararma ile sahne geçişi. */
  transition(text, sub, fn) {
    const prev = this.state.mode;
    this.state.mode = 'sleeping';
    this.player.cancelAction();
    this.building.cancel();
    this.ui.hud.fade(true, text, sub);
    setTimeout(() => {
      fn();
      this.requestSave();
    }, 650);
    setTimeout(() => {
      this.ui.hud.fade(false);
      this.state.mode = prev === 'playing' ? 'playing' : prev;
      this.lastTime = performance.now();
    }, 1500);
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
    if (this.vehicles.mounted) {
      this.vehicles.mounted = null;
      this.player.mounted = null;
      this.player.refreshHeld();
    }
    this.world.setCaveMode(false);
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
      animals: this.animals.serialize(),
      vehicles: this.vehicles.serialize(),
      inCave: this.world.inCave,
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
    // yeni sürümde eklenen tarif/yapı kilitlerini (seviye ve tamamlanan görevlere göre) aç
    this.progression.syncUnlocks();
    this.animals.deserialize(d.animals);
    this.cameraController.deserialize(d.camera);
    if (d.inCave) this.world.setCaveMode(true);
    this.vehicles.deserialize(d.vehicles);
    // güvenlik: oyuncu arazinin altında kaldıysa yukarı al
    const p = this.player.position;
    const ground = this.world.getGroundHeight(p.x, p.z, p.y + 1);
    if (!this.player.mounted && (p.y < ground - 0.5 || !Number.isFinite(p.y))) p.y = ground;
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
        this.vehicles.update(dt, inputEnabled);
        this.animals.update(dt);
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
            rowing: this.player.mounted?.type === 'raft' ? Math.abs(this.player.mounted.speed) : 0,
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
    if (this.world.inCave) {
      return { coast: 0, forest: 0, altitude: 0, night: 0, nearFire: 0, cave: 1, active: this.state.mode === 'playing' };
    }
    const inland = island.inland(p.x, p.z);
    const fire = this.building.nearestFire(p);
    return {
      coast: 1 - smoothstep(4, 70, inland),
      forest: island.forestMask(p.x, p.z) * smoothstep(10, 40, inland),
      altitude: smoothstep(10, 42, p.y),
      night: this.world.dayNight.env.nightFactor,
      nearFire: 1 - smoothstep(2, 10, fire),
      cave: 0,
      active: this.state.mode === 'playing',
    };
  }
}

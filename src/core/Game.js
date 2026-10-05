import * as THREE from 'three';
import { EventBus } from './EventBus.js';
import { Settings } from './Settings.js';
import { Profile } from './Profile.js';
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
import { NavigationSystem } from '../systems/NavigationSystem.js';
import { EnemySystem } from '../systems/EnemySystem.js';
import { BossSystem } from '../systems/BossSystem.js';
import { NetworkManager } from '../net/Network.js';
import { RemotePlayers } from '../net/RemotePlayers.js';
import { UIManager } from '../ui/UIManager.js';
import { DIFFICULTY_ORDER, difficultyDef } from '../data/difficulty.js';
import { ITEMS } from '../data/items.js';
import { clamp, smoothstep } from '../utils/math.js';
import { enterFullscreen, isTouchDevice } from '../utils/device.js';

const AUTOSAVE_INTERVAL = 60;
const START_ITEMS = { berries: 2 };
const r2 = (v) => Math.round(v * 100) / 100;
const makeWorldId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Oyunun kalbi: tüm modülleri oluşturur, oyun döngüsünü çalıştırır ve
 * oyun modları (menü, oynanış, duraklatma, uyku, bayılma) arasında geçişi yönetir.
 * Çok oyunculuda dünya duraklatılmaz; ev sahibi dünyanın asıl sahibidir.
 */
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.bus = new EventBus();
    this.settings = Settings.load();
    this.profile = Profile.load();
    this.state = new GameState(this.bus);
    this.time = new TimeManager(this.bus);
    this.input = new InputManager(canvas, this.settings);
    this.audio = new AudioManager(this.settings);

    // yüksek DPI telefonlarda kenar yumuşatma (MSAA) gözle fark edilmez ama pahalıdır
    const denseScreen = isTouchDevice() && (window.devicePixelRatio || 1) >= 2;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !denseScreen, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false; // gölge haritası ön ayara göre her 1–2 karede bir yenilenir
    this.frameNo = 0;
    this.shadowEvery = 1;
    this.resScale = 1; // otomatik çözünürlük çarpanı
    this.perf = { t: 0, n: 0, good: 0 };
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 0.1, 2200);

    this.world = new WorldManager(this);
    this.player = new Player(this);
    this.player.model.root.visible = false;
    this.cameraController = new CameraController(this.camera, this);
    this.cameraController.applyMode();
    this.playerController = new PlayerController(this, this.player);
    this.viewModel = new ViewModel();
    this.viewModel.setAppearance(this.profile.appearance);
    this.net = new NetworkManager(this);
    this.remotePlayers = new RemotePlayers(this);
    this.animals = new AnimalSystem(this);
    this.vehicles = new VehicleSystem(this);
    this.navigation = new NavigationSystem(this);
    this.enemies = new EnemySystem(this);
    this.bosses = new BossSystem(this);
    this.effects = { poison: 0, burn: 0, chill: 0 }; // vuruşların bıraktığı etkiler (s)
    this.cold = 0; // buz adasında üşüme (0..1)
    this.statusEffects = [];
    this.envTimer = 0;

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
    this.mpMenu = false; // çok oyunculuda duraklatma menüsü açık (dünya durmaz)
    this.pendingRest = null; // ortak uykuda beklerken
    this.setDifficulty('normal');

    this.applySettings();
    this.settings.onChange((key) => {
      if (key === 'quality' || key === 'fov') this.applySettings();
      if (key === 'uiScale') this.applyUiScale();
      if (key === 'autoResolution') {
        this.resScale = 1;
        this.applyPixelRatio();
      }
      if (key === 'cameraMode') this.cameraController.setMode(this.settings.cameraMode);
      if (key === 'bindings') {
        this.ui.hud.renderHotbar();
        this.ui.hud.renderHints();
      }
    });
    this.profile.onChange(() => this.applyProfile());
    window.addEventListener('resize', () => this.onResize());
    this.input.onLockChange((locked) => this.onLockChange(locked));
    canvas.addEventListener('click', () => {
      if (this.state.mode === 'playing' && !this.ui.active && !this.mpMenu) this.input.requestLock();
    });
    // telefonda sekme/uygulama arka plana alınınca sayfa haber vermeden kapatılabilir: hemen kaydet
    const saveOnHide = () => {
      if (this.state.mode === 'menu') return;
      if (this.net.isClient) this.saveGuest();
      else this.save();
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) saveOnHide();
    });
    window.addEventListener('pagehide', saveOnHide);
    window.addEventListener('beforeunload', () => {
      if (this.net.isClient) this.saveGuest();
      else this.save();
      this.net.leave();
    });
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
    bus.on('island:entered', ({ id, first }) => {
      if (first && id !== 'novera' && !this.state.spawnPoints[id]) {
        setTimeout(() => this.notify('⛺ Bu adada ölürsen varış sahilinde uyanırsın. Burada bir barınak kurarsan doğma noktan orası olur.', 'info'), 6000);
      }
    });
  }

  /** Dünya simülasyonu çalışıyor mu? (çok oyunculuda ölüyken/menüdeyken de devam eder) */
  get isSimulating() {
    const m = this.state.mode;
    return m === 'playing' || (this.net.active && m !== 'menu' && m !== 'paused');
  }

  get difficulty() {
    return difficultyDef(this.state.difficulty);
  }

  setDifficulty(id) {
    this.state.difficulty = DIFFICULTY_ORDER.includes(id) ? id : 'normal';
    this.player.stats.setDifficulty(this.difficulty);
  }

  /** Karakter düzenleyicide yapılan değişiklikleri modele uygula ve odaya duyur. */
  applyProfile() {
    this.player.model.setAppearance(this.profile.appearance);
    this.player.model.setFirstPerson(this.cameraController.firstPerson);
    this.viewModel.setAppearance(this.profile.appearance);
    this.net.emit({ t: 'look', name: this.profile.name, appearance: this.profile.appearance });
    this.ui.hud.renderPlayers();
  }

  // ── Ayarlar / pencere ───────────────────────────────────
  applySettings() {
    const preset = this.settings.qualityPreset;
    this.world.dayNight.setShadowQuality(preset.shadows, preset.shadowMapSize);
    this.world.dayNight.setFogScale(preset.fog);
    this.world.grass.setDensity(preset.grass);
    this.world.grass.setShadows(preset.shadows && preset.grassShadows);
    this.world.resources.lodDistance = preset.lod;
    this.shadowEvery = preset.shadowEvery ?? 1;
    const type = preset.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    if (this.renderer.shadowMap.type !== type) {
      this.renderer.shadowMap.type = type;
      // gölge türü değişince malzemeler yeniden derlenmeli
      this.scene.traverse((o) => {
        if (!o.material) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
      });
    }
    this.renderer.shadowMap.needsUpdate = true;
    this.camera.fov = this.settings.fov;
    this.resScale = 1;
    this.applyUiScale();
    this.applyPixelRatio();
  }

  /** Piksel oranı = cihaz oranı (ön ayarla sınırlı) × otomatik çözünürlük çarpanı. */
  applyPixelRatio() {
    const preset = this.settings.qualityPreset;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio) * this.resScale);
    this.onResize();
  }

  applyUiScale() {
    document.documentElement.style.setProperty('--ui-scale', String(this.settings.uiScaleValue));
  }

  /**
   * Otomatik çözünürlük: kare hızı uzun süre düşük kalırsa çözünürlüğü kademeli azaltır,
   * akıcılık geri gelince yeniden artırır (en az %55).
   */
  updateAutoResolution(realDt) {
    const p = this.perf;
    if (!this.settings.autoResolution || document.hidden) {
      p.t = 0;
      p.n = 0;
      return;
    }
    if (realDt > 0.5) {
      // takılma (sekme değişimi, derleme): bu pencereyi sayma
      p.t = 0;
      p.n = 0;
      return;
    }
    p.t += realDt;
    p.n++;
    if (p.t < 2) return;
    const fps = p.n / p.t;
    p.t = 0;
    p.n = 0;
    let next = this.resScale;
    if (fps < 42 && this.resScale > 0.55) {
      next = Math.max(0.55, this.resScale - (fps < 28 ? 0.2 : 0.1));
      p.good = 0;
    } else if (fps > 56 && this.resScale < 1) {
      p.good++;
      if (p.good >= 3) {
        next = Math.min(1, this.resScale + 0.1);
        p.good = 0;
      }
    } else p.good = 0;
    if (Math.abs(next - this.resScale) > 0.001) {
      this.resScale = Math.round(next * 100) / 100;
      this.applyPixelRatio();
    }
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
    this.player.model.root.visible = !this.player.ghost;
    this.ui.menu.hide();
    this.ui.hud.setVisible(true);
    this.ui.hud.renderTracker();
    this.ui.hud.renderHints();
    this.ui.hud.renderHotbar();
    this.ui.hud.renderPlayers();
    this.input.requestLock();
    // telefon/tablette oyuna girerken tam ekran (menü dokunuşu içinde çağrıldığı için izin verilir)
    if (this.settings.touchEnabled) enterFullscreen();
    this.lastTime = performance.now();
  }

  startNewGame(difficulty = 'normal') {
    this.audio.init();
    this.setDifficulty(difficulty);
    this.state.worldId = makeWorldId();
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
    this.ui.menu.showIntro(this.difficulty);
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
    this.ui.hud.toast(`Tekrar hoş geldin! Gün ${this.time.day} · ${this.difficulty.icon} ${this.difficulty.name}`, 'success');
  }

  /** Tek kişilik dünyayı çok oyunculu odaya çevirir (ev sahibi olursun). */
  async openRoom() {
    if (this.net.active) return true;
    this.ui.hud.toast('🌐 Oda açılıyor…', 'info', 2500);
    try {
      await this.net.host();
      return true;
    } catch (err) {
      this.notify(`Oda açılamadı: ${err.message}`, 'warn');
      return false;
    }
  }

  pause() {
    if (this.state.mode !== 'playing') return;
    if (this.net.active) {
      // çok oyunculuda dünya durmaz: yalnızca menü açılır
      this.mpMenu = true;
      this.player.cancelAction();
      this.input.exitLock();
      this.ui.menu.showPause();
      return;
    }
    this.state.mode = 'paused';
    this.input.exitLock();
    this.ui.menu.showPause();
  }

  resume() {
    if (this.mpMenu) {
      this.mpMenu = false;
      this.ui.menu.hide();
      this.input.requestLock();
      return;
    }
    if (this.state.mode !== 'paused') return;
    this.state.mode = 'playing';
    this.ui.menu.hide();
    this.input.requestLock();
    this.lastTime = performance.now();
  }

  quitToMenu() {
    if (this.net.isClient) this.saveGuest();
    else this.save();
    this.net.leave();
    // Dünyayı temiz başlatmanın en güvenilir yolu: sayfayı yeniden yüklemek
    setTimeout(() => window.location.reload(), 150);
  }

  onLockChange(locked) {
    if (locked) return;
    if (this.state.mode !== 'playing' || this.ui.active || this.mpMenu || this.ui.hud.chatOpen) return;
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
    this.audio.play('sleep');
    if (this.net.active) {
      // çok oyunculu: herkes yatınca sabah olur
      this.pendingRest = rest;
      this.ui.hud.fade(true, 'Uyuyorsun…', 'Diğer oyuncuların da yatması bekleniyor · Kalkmak için Esc');
      this.net.requestSleep(true);
      return;
    }
    this.ui.hud.fade(true, 'Uyuyorsun…', `${where} sabahı bekliyorsun`);
    setTimeout(() => {
      this.time.skipTo(6);
      this.applyRest(rest);
    }, 1400);
    setTimeout(() => this.finishSleep(rest), 3000);
  }

  applyRest(rest) {
    const comfort = rest.comfort ?? 0;
    const s = this.player.stats;
    s.stamina = s.maxStamina;
    const heal = comfort >= 3 ? s.maxHealth : 20 + comfort * 20;
    rest.healed = Math.round(Math.min(s.maxHealth - s.health, heal));
    s.health = Math.min(s.maxHealth, s.health + heal);
    s.hunger = Math.max(5, s.hunger - Math.max(6, 14 - comfort * 3));
    s.thirst = Math.max(5, s.thirst - Math.max(8, 16 - comfort * 3));
    this.bus.emit('player:slept', { comfort });
  }

  finishSleep(rest) {
    this.ui.hud.fade(false);
    this.state.mode = 'playing';
    const extra = rest.shelter ? ` ${rest.shelter.icon} İyi dinlendin (+${rest.healed ?? 0} ❤️).` : rest.healed ? ` (+${rest.healed} ❤️)` : '';
    this.notify(`☀️ Günaydın! Gün ${this.time.day} başladı.${extra}`, 'success');
    this.save();
    this.lastTime = performance.now();
  }

  /** Çok oyunculu: herkes uyudu, sabah oldu. */
  wakeUp(msg) {
    if (this.net.isClient && msg) this.applyHostTime({ d: msg.d, h: msg.h, e: msg.e }, true);
    const rest = this.pendingRest;
    this.pendingRest = null;
    if (!rest || this.state.mode !== 'sleeping') return;
    this.applyRest(rest);
    setTimeout(() => this.finishSleep(rest), 900);
  }

  onSleepState(n, total) {
    if (this.state.mode === 'sleeping' && this.pendingRest) {
      this.ui.hud.fade(true, 'Uyuyorsun…', `Uyuyanlar: ${n}/${total} — herkes yatınca sabah olacak · Kalkmak için Esc`);
    } else if (n > 0 && this.state.mode === 'playing') {
      this.ui.hud.toast(`🛏️ ${n}/${total} oyuncu uyuyor. Sabah olması için sen de yat.`, 'info', 2600);
    }
  }

  cancelSleep() {
    if (!this.pendingRest) return;
    this.pendingRest = null;
    this.net.requestSleep(false);
    this.ui.hud.fade(false);
    this.state.mode = 'playing';
    this.input.requestLock();
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

  // ── Ölüm ve zorluk ──────────────────────────────────────
  onDeath(source) {
    const def = this.difficulty;
    this.state.mode = 'dead';
    this.player.cancelAction();
    this.building.cancel();
    this.ui.close();
    this.mpMenu = false;
    this.pendingRest = null;
    this.input.exitLock();
    if (this.vehicles.mounted) {
      this.vehicles.mounted = null;
      this.player.mounted = null;
      this.player.refreshHeld();
    }
    this.ui.hud.fade(true, '', '');
    this.deathPos = { x: this.player.position.x, z: this.player.position.z };
    const dropped = def.deathDrop && !def.permadeath ? this.dropInventoryOnDeath() : false;
    this.state.stats.deaths++;
    if (def.permadeath) {
      // tek can: karakter kalıcı olarak ölür
      this.state.setFlag('hardcoreDead', true);
      if (this.net.isClient) {
        SaveManager.clearGuest();
        SaveManager.markDeadIn(this.state.worldId);
      }
      else if (!this.net.active) SaveManager.clear();
      setTimeout(() => this.ui.menu.showGameOver(source, this.net.active), 1300);
      return;
    }
    setTimeout(() => this.ui.menu.showDeath(source, { dropped, difficulty: def }), 1200);
  }

  /** Zor modda ölünce envanter, öldüğün yerde bir çuvala düşer. */
  dropInventoryOnDeath() {
    const inv = this.player.inventory;
    const stacks = inv.slots.filter(Boolean).map((s) => ({ ...s }));
    if (!stacks.length) return false;
    inv.slots.fill(null);
    inv.changed();
    const p = this.player.position;
    const bag = this.world.drops.spawn(p.x, p.z, stacks);
    if (bag) bag.death = true;
    return true;
  }

  respawn() {
    if (this.vehicles.mounted) {
      this.vehicles.mounted = null;
      this.player.mounted = null;
      this.player.refreshHeld();
    }
    const wasInCave = this.world.inCave;
    this.world.setCaveMode(false);
    const dp = this.deathPos ?? this.player.position;
    const sp = wasInCave ? this.state.spawnPoint ?? this.world.spawnPoint : this.navigation.respawnPoint(dp.x, dp.z);
    this.effects = { poison: 0, burn: 0, chill: 0 };
    this.cold = 0;
    const y = this.world.getGroundHeight(sp.x, sp.z, sp.y + 1);
    this.player.teleport(sp.x, y, sp.z);
    this.player.stats.revive();
    this.time.advance(this.net.active ? 0 : 2);
    this.ui.menu.hide();
    this.ui.hud.fade(false);
    this.state.mode = 'playing';
    this.input.requestLock();
    const bag = this.world.drops.drops.some((d) => d.death);
    this.notify(bag
      ? `Uyandın. Eşyaların öldüğün yerdeki çuvalda${wasInCave ? ' (mağarada)' : ''} — haritada 💀 ile işaretli.`
      : 'Uyandın. Kendine iyi bak — yemek ve su ihmal edilmemeli.', bag ? 'warn' : 'info');
    this.save();
  }

  /** Çok oyunculu hardcore: ölen oyuncu görünmez bir izleyici olarak dolaşır. */
  enterSpectator() {
    const p = this.player;
    p.ghost = true;
    p.stats.dead = false;
    p.cancelAction();
    p.inventory.slots.fill(null);
    p.inventory.changed();
    p.model.root.visible = false;
    if (this.world.inCave) {
      // izleyici yüzeyde, mağara girişinin üstünde başlar
      this.world.setCaveMode(false);
      const e = this.world.landmarks.byId.cave_entrance?.exitPoint ?? this.world.spawnPoint;
      p.teleport(e.x, this.world.getGroundHeight(e.x, e.z) + 4, e.z);
    } else p.position.y += 2;
    this.settings.set('cameraMode', 'first');
    this.ui.menu.hide();
    this.ui.hud.fade(false);
    this.state.mode = 'playing';
    this.input.requestLock();
    this.ui.hud.setSpectator(true);
    this.notify('👻 İzleyici modundasın: WASD ile uç, Boşluk yüksel, Shift hızlan. Diğerleri seni göremez.', 'info');
  }

  // ── Hasar, etkiler ve zırh ──────────────────────────────
  get armor() {
    return ITEMS[this.state.upgrades.armor]?.armor ?? null;
  }

  /** Düşman/boss vuruşu. fx: { poison, burn, chill, fromX, fromZ } */
  hurtPlayer(amount, source, fx = {}) {
    const p = this.player;
    if (p.ghost || p.stats.dead || this.state.mode === 'dead' || !(amount >= 0)) return;
    const armor = this.armor;
    let dmg = Math.min(200, amount);
    if (fx.burn && armor?.heat) dmg *= 0.6;
    if (fx.chill && armor?.cold) dmg *= 0.8;
    p.stats.damage(dmg, source);
    if (fx.poison) this.effects.poison = Math.max(this.effects.poison, 5);
    if (fx.burn) this.effects.burn = Math.max(this.effects.burn, armor?.heat ? 1 : 3);
    if (fx.chill && !armor?.cold) this.effects.chill = Math.max(this.effects.chill, 2.5);
    // geri itilme
    if (Number.isFinite(fx.fromX) && Number.isFinite(fx.fromZ) && !p.mounted) {
      const dx = p.position.x - fx.fromX;
      const dz = p.position.z - fx.fromZ;
      const d = Math.hypot(dx, dz) || 1;
      const k = Math.min(9, 3 + dmg * 0.12);
      p.velocity.x += (dx / d) * k;
      p.velocity.z += (dz / d) * k;
    }
    if (dmg >= 6) p.cancelAction(); // sert vuruş elindeki işi böler
    this.cameraController.impact(Math.min(0.25, 0.06 + dmg * 0.004));
    this.cameraController.shake(Math.min(0.3, dmg * 0.006));
    this.ui.hud.hurtFlash();
  }

  /** Zırhı kuşan (envanterdeki eşya donanım yuvasına geçer, eskisi envantere döner). */
  equipArmor(slotIndex) {
    const inv = this.player.inventory;
    const stack = inv.slots[slotIndex];
    const def = stack && ITEMS[stack.id];
    if (!def?.armor) return false;
    const old = this.state.upgrades.armor;
    inv.removeAt(slotIndex, 1);
    this.state.upgrades.armor = stack.id;
    if (old && ITEMS[old]) {
      const left = inv.add(old, 1);
      if (left > 0) this.world.drops.spawn(this.player.position.x, this.player.position.z, [{ id: old, count: 1 }]);
    }
    this.applyArmor();
    this.audio.play('craft');
    this.notify(`${def.icon} ${def.name} kuşanıldı (Savunma +${def.armor.defense}).`, 'success');
    this.bus.emit('armor:equipped', { id: stack.id });
    this.requestSave();
    return true;
  }

  unequipArmor() {
    const id = this.state.upgrades.armor;
    if (!id) return false;
    const left = this.player.inventory.add(id, 1);
    if (left > 0) {
      this.notify('Envanterin dolu — zırhı çıkaramazsın.', 'warn');
      return false;
    }
    delete this.state.upgrades.armor;
    this.applyArmor();
    this.audio.play('click');
    this.requestSave();
    return true;
  }

  applyArmor() {
    this.player.stats.defense = this.armor?.defense ?? 0;
    this.player.model.setArmor(this.state.upgrades.armor ?? null);
  }

  /** Barınak/yatak: bulunduğun adanın doğma noktası. */
  setSpawnPoint(sp) {
    const isl = this.world.islandAt(sp.x, sp.z) ?? this.world.nearestIsland(sp.x, sp.z);
    if (isl.id === 'novera') this.state.spawnPoint = sp;
    else this.state.spawnPoints[isl.id] = sp;
  }

  /** Zehir/yanık/üşüme, lav ve ada iklimi (buz adasında soğuk, volkanda sıcak). */
  updateEffects(dt) {
    const p = this.player;
    const s = p.stats;
    const fx = this.effects;
    const out = [];
    if (p.ghost || s.dead) {
      this.statusEffects = out;
      s.chilled = false;
      return;
    }
    const armor = this.armor ?? {};
    const w = this.world;
    const pos = p.position;
    if (fx.poison > 0) {
      fx.poison -= dt;
      s.damage(1.6 * dt, 'poison', true);
      out.push('Zehirlendin');
    }
    if (fx.burn > 0) {
      fx.burn -= dt;
      s.damage((armor.heat ? 1 : 2.5) * dt, 'burn', true);
      if (Math.random() < dt * 6) w.particles.emit('fire', pos.x, pos.y + 1, pos.z, 0.25);
      out.push('Yanıyorsun');
    }
    if (fx.chill > 0) fx.chill -= dt;
    const isl = w.inCave ? null : w.islandAt(pos.x, pos.z);
    this.envTimer -= dt;
    // lav
    if (isl && !p.mounted && w.isLava(pos.x, pos.z) && pos.y < w.terrain.getHeight(pos.x, pos.z) + 0.8) {
      s.damage((armor.heat ? 8 : 24) * dt, 'lava', true);
      fx.burn = Math.max(fx.burn, armor.heat ? 0.5 : 2);
      if (this.envTimer <= 0) {
        this.envTimer = 0.6;
        this.audio.play('hurt');
        this.ui.hud.hurtFlash();
      }
      out.push('LAV! Hemen çık!');
    }
    // buz adası: ısınmadan uzun süre kalınca donmaya başlarsın
    if (isl?.biome === 'ice') {
      const warm = armor.cold || this.building.nearestFire(pos) < 7 || !!this.building.restInfo(pos).shelter;
      const night = w.dayNight.env.nightFactor;
      const rate = warm ? -0.25 : (0.03 + night * 0.03) * (p.swimming ? 4 : 1);
      this.cold = clamp(this.cold + rate * dt, 0, 1);
    } else this.cold = Math.max(0, this.cold - dt * 0.2);
    if (this.cold >= 1) {
      s.damage(0.7 * dt, 'cold', true);
      out.push('Donuyorsun! Ateş yak ya da Kürk Mont giy');
    } else if (this.cold > 0.45) out.push('Üşüyorsun — ateşe yaklaş');
    // volkan adası: sıcakta çabuk susarsın
    if (isl?.biome === 'volcano' && !armor.heat) {
      s.thirst = Math.max(0, s.thirst - 0.05 * dt);
      out.push('Sıcak: daha çabuk susuyorsun');
    }
    s.chilled = fx.chill > 0 || this.cold >= 1;
    if (fx.chill > 0) out.push('Dondun: yavaşladın');
    this.statusEffects = out;
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
      navigation: this.navigation.serialize(),
      enemies: this.enemies.serialize(),
      bosses: this.bosses.serialize(),
      inCave: this.world.inCave,
    };
  }

  loadSave(d) {
    this.state.deserialize(d.state);
    this.setDifficulty(this.state.difficulty);
    this.time.deserialize(d.time);
    this.player.deserialize(d.player);
    this.progression.deserialize(d.progression);
    if (this.state.upgrades.backpack) this.player.model.setBackpack(true);
    this.world.resources.deserialize(d.resources, this.time.elapsed);
    this.building.deserialize(d.buildings);
    this.world.drops.deserialize(d.drops);
    if (!this.state.worldId) this.state.worldId = makeWorldId();
    this.exploration.deserialize(d.exploration);
    this.navigation.deserialize(d.navigation);
    this.enemies.deserialize(d.enemies);
    this.bosses.deserialize(d.bosses);
    this.applyArmor();
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
    if (this.net.isClient) return this.saveGuest();
    if (m !== 'playing' && m !== 'paused' && m !== 'sleeping' && m !== 'dead') return false;
    if (this.state.flags.hardcoreDead) {
      SaveManager.clear(); // hardcore: ölen karakterin dünyası kalmaz
      return false;
    }
    const ok = SaveManager.save(this.serialize());
    if (ok) this.ui.hud.showSaved();
    return ok;
  }

  /** Önemli olaylardan sonra kısa bir gecikmeyle kaydet (art arda kayıtları birleştirir). */
  requestSave() {
    this.saveRequested = 1.5;
  }

  // ── Çok oyunculu ────────────────────────────────────────
  /** Misafirin kendine ait verileri (dünya ev sahibinde kalır). */
  serializeGuest() {
    const state = this.state.serialize();
    delete state.spawnPoint;
    delete state.worldId;
    return {
      // misafirin kendi çuvalları (ör. zor modda ölüm çuvalı) yalnızca onun dünyasında durur
      drops: this.world.drops.serialize(),
      state, progression: this.progression.serialize(), player: this.player.serialize(),
      quests: this.quests.serialize(), exploration: this.exploration.serialize(), camera: this.cameraController.serialize(),
    };
  }

  saveGuest() {
    if (!this.net.isClient || this.state.flags.hardcoreDead) return false;
    const ok = SaveManager.saveGuest(this.serializeGuest());
    if (ok) this.ui.hud.showSaved();
    return ok;
  }

  /** Ev sahibi → yeni katılan misafir: dünyanın o anki hali. */
  worldSnapshot() {
    const p = this.player.position;
    return {
      difficulty: this.state.difficulty,
      worldId: this.state.worldId,
      time: this.time.serialize(),
      resources: this.world.resources.serialize(this.time.elapsed),
      buildings: this.building.serialize(),
      boats: this.vehicles.serialize().boats,
      animals: this.animals.snapshot(),
      known: this.navigation.serialize(),
      bosses: this.bosses.snapshot(),
      hostPos: this.world.inCave || this.player.ghost ? null : [r2(p.x), r2(p.y), r2(p.z)],
    };
  }

  /** Misafir: ev sahibinin dünyasına gir. */
  joinWorld(welcome) {
    const snap = welcome.snapshot ?? {};
    this.audio.init();
    this.time.deserialize(snap.time);
    this.net.applyingChest = true;
    this.world.resources.deserialize(snap.resources, this.time.elapsed);
    this.building.deserialize(snap.buildings);
    this.net.applyingChest = false;
    this.vehicles.deserialize({ boats: snap.boats ?? [], mounted: -1 });
    this.animals.setRemote(true);
    this.animals.applySnapshot(snap.animals ?? []);
    this.navigation.deserialize(snap.known);
    this.enemies.setRemote(true);
    this.bosses.setRemote(true);
    this.bosses.applySnapshot(snap.bosses);

    // misafirin kendi karakteri (envanter, seviye, görevler) bu tarayıcıda saklanır
    const guest = SaveManager.loadGuest();
    let fresh = true;
    if (guest && !guest.state?.flags?.hardcoreDead) {
      try {
        this.state.deserialize(guest.state);
        this.player.deserialize(guest.player);
        this.progression.deserialize(guest.progression);
        if (this.state.upgrades.backpack) this.player.model.setBackpack(true);
        this.exploration.deserialize(guest.exploration);
        this.quests.deserialize(guest.quests);
        this.progression.syncUnlocks();
        this.applyArmor();
        this.cameraController.deserialize(guest.camera);
        this.world.drops.deserialize(guest.drops);
        fresh = false;
      } catch (err) {
        console.warn('Misafir karakteri yüklenemedi:', err);
      }
    }
    this.state.spawnPoint = null;
    this.state.spawnPoints = {};
    this.state.flags.hardcoreDead = false;
    this.state.worldId = snap.worldId ?? null;
    this.setDifficulty(snap.difficulty);
    // hardcore: bu dünyada daha önce öldüysen yalnızca izleyebilirsin
    const deadHere = this.difficulty.permadeath && SaveManager.isDeadIn(this.state.worldId);
    if (fresh) for (const [id, n] of Object.entries(START_ITEMS)) this.player.inventory.add(id, n);

    // ev sahibinin yanında başla
    const hp = snap.hostPos;
    const sp = this.world.spawnPoint;
    const x = hp ? hp[0] + 2 : sp.x;
    const z = hp ? hp[2] + 1.5 : sp.z;
    this.player.teleport(x, this.world.getGroundHeight(x, z, (hp?.[1] ?? sp.y) + 1), z);
    for (const p of welcome.players ?? []) this.remotePlayers.add(p);
    this.enterPlay();
    if (fresh) this.quests.begin();
    this.ui.hud.banner('Çok Oyunculu', `Oda ${this.net.code}`, `${this.difficulty.icon} ${this.difficulty.name} · ${this.net.playerCount} oyuncu`);
    this.ui.hud.chatSystem(`🌐 ${this.net.code} odasına katıldın.`);
    if (deadHere) {
      this.state.flags.hardcoreDead = true;
      this.enterSpectator();
      this.notify('☠️ Bu hardcore dünyada daha önce öldün — yalnızca izleyebilirsin.', 'warn');
      return;
    }
    this.saveGuest();
  }

  onRoomOpened(code) {
    this.ui.hud.renderPlayers();
    this.ui.hud.banner('Oda Açıldı', `Kod: ${code}`, 'Arkadaşların bu kodla katılabilir (en fazla 8 kişi)');
    this.ui.hud.chatSystem(`🌐 Oda açıldı. Kod: ${code} — Sohbet için Enter.`);
  }

  onPlayerJoined(p) {
    this.remotePlayers.add(p);
    this.ui.hud.chatSystem(`➕ ${p.name} odaya katıldı.`);
    this.ui.hud.renderPlayers();
    this.audio.play('notify');
  }

  onPlayerLeft(p) {
    this.remotePlayers.remove(p.id);
    this.ui.hud.chatSystem(`➖ ${p.name} odadan ayrıldı.`);
    this.ui.hud.renderPlayers();
  }

  onDisconnected(reason) {
    this.saveGuest();
    this.ui.hud.renderPlayers();
    this.ui.menu.showDisconnected(reason);
    this.state.mode = 'paused';
    this.input.exitLock();
  }

  /** Misafir: saati ev sahibininkiyle eşitle. */
  applyHostTime(msg, force = false) {
    const t = this.time;
    const mine = t.day * 24 + t.hour;
    const host = msg.d * 24 + msg.h;
    if (force || Math.abs(host - mine) > 0.05) {
      t.day = msg.d;
      t.hour = msg.h;
      t.phase = t.computePhase();
    }
    if (Number.isFinite(msg.e)) t.elapsed = msg.e;
  }

  /** Ağa gönderilen oyuncu durumu (~12 Hz). */
  playerNetState() {
    const p = this.player;
    const a = p.action;
    const m = p.mounted;
    return {
      t: 'p', x: r2(p.position.x), y: r2(p.position.y), z: r2(p.position.z), yaw: r2(p.yaw), s: r2(p.speed),
      r: p.running ? 1 : 0, g: p.grounded ? 1 : 0, w: p.swimming ? 1 : 0,
      sit: m ? 1 : 0, row: m?.type === 'raft' ? r2(Math.abs(m.speed)) : 0, st: m?.type === 'boat' ? 1 : 0,
      a: a?.type ?? 0, k: a ? r2(a.t / a.dur) : 0, h: p.model.heldKey ?? 0,
      c: this.world.inCave ? 1 : 0, gh: p.ghost ? 1 : 0, bp: p.model.backpack.visible ? 1 : 0, ar: p.model.armorId ?? 0,
      sl: this.state.mode === 'sleeping' && this.pendingRest ? 1 : 0,
      m: m ? [m.uid, r2(m.x), r2(m.z), r2(m.yaw), r2(m.speed)] : 0,
    };
  }

  // ── Döngü ───────────────────────────────────────────────
  loop() {
    const now = performance.now();
    const realDt = (now - this.lastTime) / 1000;
    const dt = Math.min(realDt, 0.05);
    this.lastTime = now;
    const mode = this.state.mode;
    this.updateAutoResolution(realDt);
    // gölge haritası: ön ayara göre her karede ya da iki karede bir
    this.frameNo++;
    if (this.shadowEvery <= 1 || this.frameNo % this.shadowEvery === 0) this.renderer.shadowMap.needsUpdate = true;

    if (mode === 'menu') {
      this.cameraController.updateMenu(dt);
      this.world.update(dt, { hour: 17.3, focus: this.menuFocus, camera: this.camera, elapsed: this.time.elapsed });
      this.audio.update(dt, { coast: 0.55, forest: 0.2, altitude: 0.25, night: 0, nearFire: 0, active: true });
      this.handleMenuKeys();
    } else {
      this.handleKeys();
      const playing = this.state.mode === 'playing';
      const inputEnabled = playing && !this.ui.active && !this.mpMenu && !this.ui.hud.chatOpen;
      if (playing && !this.mpMenu && !this.ui.hud.chatOpen) {
        if (!this.ui.active) this.ui.handleHotkeys();
        else if (this.ui.active !== 'note' && this.ui.active !== 'container') this.ui.handleHotkeys();
        if (inputEnabled && this.input.wasPressed('camera') && !this.player.ghost) {
          this.settings.set('cameraMode', this.cameraController.firstPerson ? 'third' : 'first');
        }
        if (inputEnabled && this.net.active && this.input.wasPressed('chat')) this.ui.hud.openChat();
      }
      if (this.isSimulating) {
        this.time.update(dt);
        if (playing) this.playerController.update(dt, inputEnabled);
        this.vehicles.update(dt, inputEnabled);
        this.animals.update(dt);
        this.enemies.update(dt);
        this.bosses.update(dt);
        this.navigation.update(dt);
        if (playing) {
          this.interaction.update(dt, inputEnabled);
          this.building.update(dt, inputEnabled);
          if (!this.player.ghost) {
            this.player.stats.update(dt, { running: this.player.running, decayMult: 1 - this.progression.bonus('decay') });
          }
          this.updateEffects(dt);
          this.exploration.update(dt);
          this.quests.update(dt);
        }
        this.tickSave(dt);
        this.net.update(dt);
      }
      if (this.state.mode !== 'paused' || this.net.active) {
        this.player.update(dt);
        this.cameraController.update(dt, this.player, inputEnabled);
        this.world.update(dt, {
          hour: this.time.hour, focus: this.player.position, camera: this.camera, elapsed: this.time.elapsed,
          occlusionFocus: this.cameraController.firstPerson ? null : this.cameraController.target,
        });
        this.remotePlayers.update(dt);
        if (this.cameraController.firstPerson) {
          const a = this.player.action;
          this.viewModel.setHeld(this.player.ghost ? null : this.player.model.heldKey);
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
    if (mode !== 'menu' && this.cameraController.firstPerson && this.state.mode !== 'dead' && !this.player.ghost) {
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
      if (this.mpMenu) {
        if (this.ui.menu.current === 'pause') this.resume();
        else this.ui.menu.showPause();
      } else if (this.ui.active) this.ui.close();
      else if (this.building.active) this.building.cancel();
      else this.pause();
    } else if (mode === 'paused') {
      if (this.ui.menu.current === 'pause') this.resume();
      else if (this.ui.menu.current !== 'disconnected') this.ui.menu.showPause();
    } else if (mode === 'sleeping' && this.pendingRest) {
      this.cancelSleep();
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
    if (this.world.inCave) {
      return { coast: 0, forest: 0, altitude: 0, night: 0, nearFire: 0, cave: 1, active: this.state.mode === 'playing' };
    }
    const island = this.world.islandAt(p.x, p.z);
    const inland = island ? island.inland(p.x, p.z) : 0;
    const fire = this.building.nearestFire(p);
    const forest = island && island.biome !== 'desert' && island.biome !== 'volcano' ? island.forestMask(p.x, p.z) : 0;
    return {
      coast: 1 - smoothstep(4, 70, inland),
      forest: forest * smoothstep(10, 40, inland),
      altitude: smoothstep(10, 42, p.y),
      night: this.world.dayNight.env.nightFactor,
      nearFire: 1 - smoothstep(2, 10, fire),
      cave: 0,
      active: this.state.mode === 'playing',
    };
  }
}

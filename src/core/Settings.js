import { defaultBindings, ACTIONS } from '../data/controls.js';
import { isTouchDevice, isPhone } from '../utils/device.js';

const KEY = 'novera.settings.v1';

export const QUALITY_PRESETS = {
  low: { label: 'Düşük', pixelRatio: 1, shadows: false, shadowMapSize: 1024, grass: 0.45, fog: 0.75, lod: 35 },
  medium: { label: 'Orta', pixelRatio: 1.5, shadows: true, shadowMapSize: 2048, grass: 1.0, fog: 1, lod: 70 },
  high: { label: 'Yüksek', pixelRatio: 2, shadows: true, shadowMapSize: 4096, grass: 1.5, fog: 1.1, lod: 120 },
};

const DEFAULTS = {
  masterVolume: 0.8,
  sfxVolume: 0.8,
  ambientVolume: 0.7,
  musicVolume: 0.35,
  quality: 'medium',
  sensitivity: 1,
  invertY: false,
  fov: 72,
  showFps: false,
  cameraMode: 'first', // 'first' (gözden) | 'third' (omuz arkası)
  headBob: true,
  touchControls: 'auto', // 'auto' (telefon/tablette açık) | 'on' | 'off'
  touchSensitivity: 1,
};

function safeStorage(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Oyuncu ayarları (localStorage'da saklanır). */
export class Settings {
  constructor(data = {}) {
    Object.assign(this, DEFAULTS, data);
    const defaults = defaultBindings();
    this.bindings = { ...defaults, ...(data.bindings ?? {}) };
    // yeni eklenen aksiyonlar eski kayıtlarda yoksa varsayılanla doldur
    for (const id of Object.keys(ACTIONS)) if (!Array.isArray(this.bindings[id])) this.bindings[id] = defaults[id];
    this.listeners = new Set();
  }

  static load() {
    const raw = safeStorage(() => localStorage.getItem(KEY));
    // ilk açılış: telefonda düşük, tablette orta kalite (pil ve akıcılık için)
    if (!raw) return new Settings(isPhone() ? { quality: 'low' } : {});
    const data = safeStorage(() => JSON.parse(raw), {});
    if (!QUALITY_PRESETS[data.quality]) delete data.quality;
    return new Settings(data);
  }

  save() {
    const { listeners, ...data } = this;
    safeStorage(() => localStorage.setItem(KEY, JSON.stringify(data)));
  }

  set(key, value) {
    this[key] = value;
    this.save();
    for (const fn of this.listeners) fn(key, value);
  }

  setBinding(action, code) {
    // aynı tuş başka bir aksiyonun birincil tuşuysa çakışmayı çöz
    for (const [id, keys] of Object.entries(this.bindings)) {
      if (id !== action && keys[0] === code) keys[0] = this.bindings[action][0];
    }
    this.bindings[action] = [code, ...this.bindings[action].slice(1).filter((k) => k !== code)];
    this.set('bindings', this.bindings);
  }

  resetBindings() {
    this.set('bindings', defaultBindings());
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get qualityPreset() {
    return QUALITY_PRESETS[this.quality] ?? QUALITY_PRESETS.medium;
  }

  /** Ekrandaki dokunmatik kontroller (joystick, düğmeler) gösterilsin mi? */
  get touchEnabled() {
    if (this.touchControls === 'on') return true;
    if (this.touchControls === 'off') return false;
    return isTouchDevice();
  }
}

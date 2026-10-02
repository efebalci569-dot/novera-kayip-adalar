import { defaultAppearance, sanitizeAppearance } from '../data/appearance.js';

const KEY = 'novera.profile.v1';

/** Oyuncu profili: ad ve karakter görünümü (tüm dünyalarda ve çok oyunculuda ortak). */
export class Profile {
  constructor(data = {}) {
    this.name = Profile.cleanName(data.name) || `Kazazede${Math.floor(100 + Math.random() * 900)}`;
    this.appearance = sanitizeAppearance(data.appearance ?? defaultAppearance('male'));
    this.listeners = new Set();
  }

  static cleanName(name) {
    if (typeof name !== 'string') return '';
    return name.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  }

  static load() {
    try {
      const raw = localStorage.getItem(KEY);
      return new Profile(raw ? JSON.parse(raw) : {});
    } catch {
      return new Profile();
    }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ name: this.name, appearance: this.appearance }));
    } catch {
      /* yoksay */
    }
  }

  /** Ad ve/veya görünümü değiştirir, kaydeder ve dinleyicilere haber verir. */
  update({ name, appearance }) {
    if (name !== undefined) this.name = Profile.cleanName(name) || this.name;
    if (appearance) this.appearance = sanitizeAppearance(appearance);
    this.save();
    for (const fn of this.listeners) fn(this);
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

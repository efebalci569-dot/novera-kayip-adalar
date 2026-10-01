import { formatClock } from '../utils/math.js';

// Gün evreleri (saat aralıkları)
export const PHASES = [
  { id: 'morning', name: 'Sabah', from: 5, to: 10 },
  { id: 'noon', name: 'Öğle', from: 10, to: 16 },
  { id: 'evening', name: 'Akşam', from: 16, to: 20 },
  { id: 'night', name: 'Gece', from: 20, to: 29 }, // 20:00 → ertesi gün 05:00
];

// Gündüz (05–20) ~10 dk, gece (20–05) ~3.6 dk sürer → bir oyun günü ≈ 13.6 dk
const SECONDS_PER_HOUR_DAY = 40;
const SECONDS_PER_HOUR_NIGHT = 24;

/** Hızlandırılmış oyun saati ve gün sayacı. */
export class TimeManager {
  constructor(bus) {
    this.bus = bus;
    this.day = 1;
    this.hour = 7;
    this.elapsed = 0; // toplam oynanış süresi (s) — kaynak yeniden doğmaları bunu kullanır
    this.scale = 1;
    this.phase = this.computePhase();
  }

  get isNight() {
    return this.hour >= 20 || this.hour < 5;
  }

  get canSleep() {
    return this.hour >= 19 || this.hour < 5;
  }

  get clock() {
    return formatClock(this.hour);
  }

  get phaseName() {
    return this.phase.name;
  }

  computePhase() {
    const h = this.hour < 5 ? this.hour + 24 : this.hour;
    return PHASES.find((p) => h >= p.from && h < p.to) ?? PHASES[0];
  }

  update(dt) {
    this.elapsed += dt;
    const secondsPerHour = this.isNight ? SECONDS_PER_HOUR_NIGHT : SECONDS_PER_HOUR_DAY;
    this.advance((dt * this.scale) / secondsPerHour);
  }

  advance(hours) {
    this.hour += hours;
    while (this.hour >= 24) {
      this.hour -= 24;
      this.day++;
      this.bus.emit('time:newDay', { day: this.day });
    }
    const phase = this.computePhase();
    if (phase !== this.phase) {
      const prev = this.phase;
      this.phase = phase;
      this.bus.emit('time:phase', { phase, prev });
      if (prev.id === 'night' && phase.id === 'morning') this.bus.emit('time:dawn', { day: this.day });
    }
  }

  /** Uyku: hedef saate atla, geçen süreyi kaynak zamanlayıcılarına da yansıt. */
  skipTo(targetHour) {
    let delta = targetHour - this.hour;
    if (delta <= 0) delta += 24;
    this.elapsed += delta * 30;
    this.advance(delta);
  }

  serialize() {
    return { day: this.day, hour: this.hour, elapsed: this.elapsed };
  }

  deserialize(data) {
    if (!data) return;
    this.day = data.day ?? 1;
    this.hour = data.hour ?? 7;
    this.elapsed = data.elapsed ?? 0;
    this.phase = this.computePhase();
  }
}

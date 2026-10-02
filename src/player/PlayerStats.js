import { clamp } from '../utils/math.js';

// Hayatta kalma dengesi. Açlık/susuzluk sıfırlanınca oyuncu hemen ölmez;
// yavaşlar, enerjisi geç dolar ve canı yavaşça azalır.
const HUNGER_PER_SEC = 100 / 1200; // tok → aç: ~20 dk
const THIRST_PER_SEC = 100 / 900; // ~15 dk
const RUN_DECAY_MULT = 1.6;
const STAMINA_RUN_COST = 15; // /s
const STAMINA_REGEN = 24; // /s
const STARVE_DAMAGE = 0.25; // can/s
const THIRST_DAMAGE = 0.35;
const REGEN_HEALTH = 0.5;

export class PlayerStats {
  constructor(bus) {
    this.bus = bus;
    this.baseMaxHealth = 100;
    this.maxHealth = 100;
    this.health = 100;
    this.hunger = 100;
    this.thirst = 100;
    this.baseMaxStamina = 100;
    this.maxStamina = 100;
    this.stamina = 100;
    this.defense = 0;
    this.baseDamage = 5;
    this.staminaDelay = 0;
    this.exhausted = false;
    this.dead = false;
    this.warned = { hunger: false, thirst: false };
  }

  get starving() {
    return this.hunger <= 0;
  }

  get dehydrated() {
    return this.thirst <= 0;
  }

  get speedMultiplier() {
    let m = 1;
    if (this.starving) m *= 0.8;
    if (this.dehydrated) m *= 0.85;
    return m;
  }

  get canRun() {
    return this.stamina > 1 && !this.exhausted;
  }

  /** Yetenek bonuslarına göre maksimum değerleri günceller. */
  applyBonuses({ maxHealth = 0, stamina = 0 }) {
    const hpRatio = this.health / this.maxHealth;
    this.maxHealth = this.baseMaxHealth + maxHealth;
    this.health = Math.min(this.maxHealth, Math.max(this.health, hpRatio * this.maxHealth));
    this.maxStamina = this.baseMaxStamina * (1 + stamina);
  }

  update(dt, { running = false, decayMult = 1 } = {}) {
    if (this.dead) return;
    const runMult = running ? RUN_DECAY_MULT : 1;
    this.hunger = Math.max(0, this.hunger - HUNGER_PER_SEC * decayMult * runMult * dt);
    this.thirst = Math.max(0, this.thirst - THIRST_PER_SEC * decayMult * runMult * dt);

    // enerji
    if (running) {
      this.stamina = Math.max(0, this.stamina - STAMINA_RUN_COST * dt);
      this.staminaDelay = 0.7;
      if (this.stamina <= 0) this.exhausted = true;
    } else if (this.staminaDelay > 0) {
      this.staminaDelay -= dt;
    } else {
      let regen = STAMINA_REGEN;
      if (this.starving) regen *= 0.5;
      if (this.dehydrated) regen *= 0.5;
      this.stamina = Math.min(this.maxStamina, this.stamina + regen * dt);
    }
    if (this.exhausted && this.stamina >= this.maxStamina * 0.3) this.exhausted = false;

    // can
    let dmg = 0;
    if (this.starving) dmg += STARVE_DAMAGE;
    if (this.dehydrated) dmg += THIRST_DAMAGE;
    if (dmg > 0) this.damage(dmg * dt, this.starving ? 'starving' : 'thirst', true);
    else if (this.hunger > 50 && this.thirst > 50 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + REGEN_HEALTH * dt);
    }

    this.checkWarning('hunger', 'Acıktın! Bir şeyler yemelisin.');
    this.checkWarning('thirst', 'Susadın! Hindistan cevizi ya da tatlı su bul.');
  }

  checkWarning(key, msg) {
    const v = this[key];
    if (v < 25 && !this.warned[key]) {
      this.warned[key] = true;
      this.bus.emit('player:warning', { key, message: msg });
    } else if (v > 35) this.warned[key] = false;
  }

  useStamina(amount) {
    if (this.stamina < amount * 0.5) return false;
    this.stamina = Math.max(0, this.stamina - amount);
    this.staminaDelay = 0.6;
    return true;
  }

  /** Yiyecek/iksir etkisi: { hunger, thirst, health, stamina } */
  apply(effects = {}) {
    if (effects.hunger) this.hunger = clamp(this.hunger + effects.hunger, 0, 100);
    if (effects.thirst) this.thirst = clamp(this.thirst + effects.thirst, 0, 100);
    if (effects.stamina) this.stamina = clamp(this.stamina + effects.stamina, 0, this.maxStamina);
    if (effects.health > 0) this.health = Math.min(this.maxHealth, this.health + effects.health);
    else if (effects.health < 0) this.damage(-effects.health, 'food');
  }

  damage(amount, source = 'unknown', silent = false) {
    if (this.dead) return;
    const reduced = amount * (1 - Math.min(0.8, this.defense / 100));
    this.health = Math.max(0, this.health - reduced);
    if (!silent) this.bus.emit('player:damaged', { amount: reduced, source });
    if (this.health <= 0) {
      this.dead = true;
      this.bus.emit('player:died', { source });
    }
  }

  revive() {
    this.dead = false;
    this.health = this.maxHealth * 0.6;
    this.hunger = Math.max(this.hunger, 45);
    this.thirst = Math.max(this.thirst, 45);
    this.stamina = this.maxStamina;
    this.exhausted = false;
  }

  serialize() {
    return { health: this.health, hunger: this.hunger, thirst: this.thirst, stamina: this.stamina };
  }

  deserialize(d) {
    if (!d) return;
    this.health = d.health ?? 100;
    this.hunger = d.hunger ?? 100;
    this.thirst = d.thirst ?? 100;
    this.stamina = d.stamina ?? 100;
  }
}

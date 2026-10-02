import { xpForLevel, MAX_LEVEL } from '../data/progression.js';
import { PERKS } from '../data/perks.js';
import { RECIPES } from '../data/recipes.js';

/** Deneyim, seviye ve yetenekler. Diğer sistemler bonusları bonus(key) ile okur. */
export class ProgressionSystem {
  constructor(game) {
    this.game = game;
    this.level = 1;
    this.xp = 0;
    this.perkPoints = 0;
    this.perks = {};
  }

  get xpToNext() {
    return xpForLevel(this.level);
  }

  addXP(amount, source = '') {
    if (amount <= 0 || this.level >= MAX_LEVEL) return;
    amount = Math.round(amount);
    this.xp += amount;
    this.game.bus.emit('xp:gained', { amount, source });
    while (this.level < MAX_LEVEL && this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.perkPoints++;
      this.onLevelUp();
    }
  }

  onLevelUp() {
    const { game } = this;
    game.state.unlockFeature('skills');
    const unlocked = [];
    for (const r of RECIPES) {
      if (r.unlock?.level && r.unlock.level <= this.level && game.state.unlockRecipe(r.id)) unlocked.push(r);
    }
    const stats = game.player.stats;
    stats.health = Math.min(stats.maxHealth, stats.health + stats.maxHealth * 0.25);
    stats.stamina = stats.maxStamina;
    game.bus.emit('level:up', { level: this.level, recipes: unlocked });
  }

  /** Tüm yeteneklerden gelen toplam bonus (ör. 'treeDamage' → 0.4). */
  bonus(key) {
    let sum = 0;
    for (const [id, rank] of Object.entries(this.perks)) {
      const v = PERKS[id]?.effect?.[key];
      if (v) sum += v * rank;
    }
    return sum;
  }

  rank(id) {
    return this.perks[id] ?? 0;
  }

  canUpgrade(id) {
    return this.perkPoints > 0 && this.rank(id) < (PERKS[id]?.maxRank ?? 0);
  }

  upgradePerk(id) {
    if (!this.canUpgrade(id)) return false;
    this.perks[id] = this.rank(id) + 1;
    this.perkPoints--;
    this.applyBonuses();
    this.game.bus.emit('perk:upgraded', { id, rank: this.perks[id] });
    return true;
  }

  addPerkPoints(n) {
    this.perkPoints += n;
    this.game.state.unlockFeature('skills');
    this.game.bus.emit('perk:points', { points: this.perkPoints });
  }

  applyBonuses() {
    this.game.player.stats.applyBonuses({ maxHealth: this.bonus('maxHealth'), stamina: this.bonus('stamina') });
  }

  serialize() {
    return { level: this.level, xp: this.xp, perkPoints: this.perkPoints, perks: this.perks };
  }

  deserialize(d) {
    if (!d) return;
    this.level = d.level ?? 1;
    this.xp = d.xp ?? 0;
    this.perkPoints = d.perkPoints ?? 0;
    this.perks = d.perks ?? {};
    this.applyBonuses();
  }
}

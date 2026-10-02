// Oyunun genel ilerleme durumu: açılmış sistemler, tarifler, yapılar, hikâye bayrakları,
// istatistikler ve yükseltmeler. Sistemler kilit kontrolü için buraya bakar.

export class GameState {
  constructor(bus) {
    this.bus = bus;
    this.mode = 'loading'; // loading | menu | playing | paused | dead | sleeping
    this.features = new Set(['journal']);
    this.recipes = new Set(['stone_axe']);
    this.buildings = new Set();
    this.lore = [];
    this.flags = {};
    this.upgrades = {};
    this.stats = {
      distanceWalked: 0,
      treesFelled: 0,
      rocksBroken: 0,
      fishCaught: 0,
      itemsCrafted: 0,
      buildingsPlaced: 0,
      animalsHunted: 0,
      distanceSailed: 0,
      deaths: 0,
      enemiesKilled: 0,
      bossesDefeated: 0,
    };
    this.spawnPoint = null;
    this.spawnPoints = {}; // diğer adalardaki doğma noktaları (ada kimliği → konum)
    this.difficulty = 'normal';
    this.worldId = null; // dünyanın kimliği (hardcore çok oyunculuda kimin nerede öldüğünü bilmek için)
  }

  hasFeature(id) {
    return this.features.has(id);
  }

  unlockFeature(id) {
    if (this.features.has(id)) return false;
    this.features.add(id);
    this.bus.emit('feature:unlocked', { id });
    return true;
  }

  unlockRecipe(id) {
    if (this.recipes.has(id)) return false;
    this.recipes.add(id);
    this.bus.emit('recipe:unlocked', { id });
    return true;
  }

  unlockBuilding(id) {
    if (this.buildings.has(id)) return false;
    this.buildings.add(id);
    this.bus.emit('building:unlocked', { id });
    return true;
  }

  addLore(id) {
    if (this.lore.includes(id)) return false;
    this.lore.push(id);
    this.bus.emit('lore:added', { id });
    return true;
  }

  setFlag(key, value = true) {
    this.flags[key] = value;
    this.bus.emit('flag:set', { key, value });
  }

  serialize() {
    return {
      features: [...this.features],
      recipes: [...this.recipes],
      buildings: [...this.buildings],
      lore: this.lore,
      flags: this.flags,
      upgrades: this.upgrades,
      stats: this.stats,
      spawnPoint: this.spawnPoint,
      spawnPoints: this.spawnPoints,
      difficulty: this.difficulty,
      worldId: this.worldId,
    };
  }

  deserialize(d) {
    if (!d) return;
    this.features = new Set(d.features ?? ['journal']);
    this.recipes = new Set(d.recipes ?? ['stone_axe']);
    this.buildings = new Set(d.buildings ?? []);
    this.lore = d.lore ?? [];
    this.flags = d.flags ?? {};
    this.upgrades = d.upgrades ?? {};
    this.stats = { ...this.stats, ...(d.stats ?? {}) };
    this.spawnPoint = d.spawnPoint ?? null;
    this.spawnPoints = d.spawnPoints ?? {};
    this.difficulty = d.difficulty ?? 'normal';
    this.worldId = d.worldId ?? null;
  }
}

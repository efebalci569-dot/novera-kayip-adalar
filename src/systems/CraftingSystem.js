import { RECIPES, STATIONS } from '../data/recipes.js';
import { ITEMS } from '../data/items.js';

/**
 * Üretim: tarif kilidi, istasyon (kamp ateşi / çalışma masası) kontrolü,
 * malzeme tüketimi ve kalıcı geliştirmeler (sırt çantası).
 */
export class CraftingSystem {
  constructor(game) {
    this.game = game;
  }

  get recipes() {
    return RECIPES;
  }

  isUnlocked(recipe) {
    return this.game.state.recipes.has(recipe.id);
  }

  lockReason(recipe) {
    if (recipe.unlock?.level) return `Seviye ${recipe.unlock.level} gerekli`;
    return 'Görevlerle açılır';
  }

  isStationNear(station) {
    if (!station) return true;
    return this.game.building.isNearStation(station, this.game.player.position);
  }

  resultName(recipe) {
    return recipe.name ?? ITEMS[recipe.result]?.name ?? recipe.id;
  }

  /** Arayüz metni için 3B ikon belirteci (sırt çantası gibi geliştirmelerin de modeli var). */
  resultIcon(recipe) {
    return `{i:${recipe.result ?? recipe.id}}`;
  }

  /** { ok, reason } — UI tarifleri renklendirmek için kullanır. */
  check(recipe, times = 1) {
    const { state, player } = this.game;
    if (!this.isUnlocked(recipe)) return { ok: false, reason: this.lockReason(recipe), locked: true };
    const up = recipe.upgrade;
    if (up?.backpack && (state.upgrades.backpack ?? 0) >= up.backpack) return { ok: false, reason: 'Zaten sahipsin', owned: true };
    if (recipe.requiresUpgrade?.backpack && (state.upgrades.backpack ?? 0) < recipe.requiresUpgrade.backpack) {
      return { ok: false, reason: 'Önce Lif Sırt Çantası gerekli' };
    }
    if (!this.isStationNear(recipe.station)) {
      const st = STATIONS[recipe.station];
      return { ok: false, reason: `${st.icon} ${st.name} yakınında olmalısın`, station: true };
    }
    for (const [id, n] of Object.entries(recipe.ingredients)) {
      if (player.inventory.count(id) < n * times) return { ok: false, reason: 'Yetersiz malzeme', missing: true };
    }
    return { ok: true };
  }

  maxCraftable(recipe) {
    const inv = this.game.player.inventory;
    let max = Infinity;
    for (const [id, n] of Object.entries(recipe.ingredients)) max = Math.min(max, Math.floor(inv.count(id) / n));
    return recipe.upgrade ? Math.min(max, 1) : max;
  }

  craft(recipe, times = 1) {
    const g = this.game;
    times = Math.max(1, Math.min(times, this.maxCraftable(recipe)));
    const res = this.check(recipe, times);
    if (!res.ok) {
      g.notify(res.reason, 'warn');
      g.audio.play('error');
      return false;
    }
    const inv = g.player.inventory;
    for (let i = 0; i < times; i++) {
      inv.removeMap(recipe.ingredients);
      if (recipe.upgrade) {
        this.applyUpgrade(recipe.upgrade);
      } else {
        const left = inv.add(recipe.result, recipe.count ?? 1);
        if (left > 0) {
          g.world.drops.spawn(g.player.position.x, g.player.position.z, [{ id: recipe.result, count: left }]);
          g.notify('Envanter dolu! Üretilen eşya yere bırakıldı.', 'warn');
        }
      }
      g.state.stats.itemsCrafted++;
      g.progression.addXP(recipe.xp ?? 5, 'craft');
    }
    g.audio.play('craft');
    g.bus.emit('craft:completed', { recipe, item: recipe.result ?? recipe.id, count: times * (recipe.count ?? 1) });
    const label = times > 1 ? `${this.resultName(recipe)} ×${times}` : this.resultName(recipe);
    g.notify(`${this.resultIcon(recipe)} Üretildi: ${label}`, 'success');
    return true;
  }

  applyUpgrade(up) {
    const g = this.game;
    if (up.backpack) {
      g.state.upgrades.backpack = up.backpack;
      g.player.model.setBackpack(true);
    }
    if (up.inventorySize) {
      g.player.inventory.resize(up.inventorySize);
      g.notify(`🎒 Envanterin ${up.inventorySize} slota genişledi!`, 'success');
    }
  }
}

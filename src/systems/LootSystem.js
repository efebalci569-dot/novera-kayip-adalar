import { RARITIES } from '../data/rarities.js';
import { ITEMS } from '../data/items.js';

// Ganimet hesaplama ve nadirlik yardımcıları.
// İleride sandık/boss ganimet tabloları da buradan geçecek; şimdilik kaynak düşüşlerini hesaplar.

/**
 * @param {Array<{item, min, max, chance?}>} table
 * @param {number} extraChance her kalem için +1 ekstra şansı (yetenek bonusu)
 * @returns {Array<{item, amount}>}
 */
export function rollDrops(table, extraChance = 0, rng = Math.random) {
  const out = [];
  if (!table) return out;
  for (const entry of table) {
    if (entry.chance !== undefined && rng() > entry.chance) continue;
    const min = entry.min ?? 1;
    const max = entry.max ?? min;
    let amount = min + Math.floor(rng() * (max - min + 1));
    if (extraChance > 0 && amount > 0 && rng() < extraChance) amount += 1;
    if (amount > 0) out.push({ item: entry.item, amount });
  }
  return out;
}

export function rarityOf(itemId) {
  return RARITIES[ITEMS[itemId]?.rarity ?? 'common'] ?? RARITIES.common;
}

export function rarityColor(itemId) {
  return rarityOf(itemId).color;
}

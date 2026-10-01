// Dünyadaki toplanabilir kaynaklar.
//
// İki tür etkileşim vardır:
//   hit  → alet gerekir; her vuruşta can düşer ve kaynak düşer (ağaç, kaya)
//   pick → elle toplanır; 'uses' kadar toplanabilir (dal, çakıl, çalı)
//
// drops: [{ item, min, max, chance }] — LootSystem.rollDrops ile hesaplanır.

export const RESOURCES = {
  palm_tree: {
    name: 'Palmiye', model: 'palm', variants: 2, mode: 'hit', group: 'tree',
    action: 'Odun Kes', tool: 'axe', minTier: 1, hp: 4,
    hitDrops: [{ item: 'wood', min: 1, max: 1 }],
    finalDrops: [{ item: 'wood', min: 2, max: 3 }, { item: 'coconut', min: 1, max: 2, chance: 0.6 }],
    respawn: 300, xp: 2, finalXp: 10, collider: 0.4, fells: true, particle: 'wood', sound: 'chop',
  },
  oak_tree: {
    name: 'Orman Ağacı', model: 'oak', variants: 3, mode: 'hit', group: 'tree',
    action: 'Odun Kes', tool: 'axe', minTier: 1, hp: 6,
    hitDrops: [{ item: 'wood', min: 1, max: 1 }],
    finalDrops: [{ item: 'wood', min: 4, max: 6 }, { item: 'fiber', min: 1, max: 2, chance: 0.5 }],
    respawn: 360, xp: 2, finalXp: 14, collider: 0.6, fells: true, particle: 'wood', sound: 'chop',
  },
  pine_tree: {
    name: 'Çam Ağacı', model: 'pine', variants: 2, mode: 'hit', group: 'tree',
    action: 'Odun Kes', tool: 'axe', minTier: 1, hp: 6,
    hitDrops: [{ item: 'wood', min: 1, max: 1 }],
    finalDrops: [{ item: 'wood', min: 4, max: 7 }],
    respawn: 360, xp: 2, finalXp: 14, collider: 0.45, fells: true, particle: 'wood', sound: 'chop',
  },
  rock: {
    name: 'Kaya', model: 'rock', variants: 3, mode: 'hit', group: 'rock',
    action: 'Kaz', tool: 'pickaxe', minTier: 1, hp: 6,
    hitDrops: [{ item: 'stone', min: 1, max: 1 }],
    finalDrops: [{ item: 'stone', min: 3, max: 5 }],
    respawn: 420, xp: 2, finalXp: 14, collider: 1.35, particle: 'stone', sound: 'mine',
  },
  stick: {
    name: 'Kuru Dal', model: 'stick', variants: 2, mode: 'pick', group: 'pickup',
    action: 'Dal Topla', uses: 1,
    drops: [{ item: 'wood', min: 1, max: 2 }],
    respawn: 150, xp: 1, particle: 'wood', sound: 'pickup',
  },
  pebble: {
    name: 'Çakıl Taşı', model: 'pebble', variants: 2, mode: 'pick', group: 'pickup',
    action: 'Taş Topla', uses: 1,
    drops: [{ item: 'stone', min: 1, max: 2 }],
    respawn: 180, xp: 1, particle: 'stone', sound: 'pickup',
  },
  fiber_bush: {
    name: 'Lifli Çalı', model: 'fiberBush', variants: 1, mode: 'pick', group: 'plant',
    action: 'Lif Topla', uses: 3,
    drops: [{ item: 'fiber', min: 1, max: 2 }],
    respawn: 180, xp: 1, particle: 'leaf', sound: 'rustle',
  },
  berry_bush: {
    name: 'Meyve Çalısı', model: 'berryBush', variants: 1, mode: 'pick', group: 'plant',
    action: 'Meyve Topla', uses: 2,
    drops: [{ item: 'berries', min: 2, max: 3 }, { item: 'fiber', min: 1, max: 1, chance: 0.3 }],
    respawn: 240, xp: 1, particle: 'leaf', sound: 'rustle',
  },
  coconut: {
    name: 'Hindistan Cevizi', model: 'coconut', variants: 1, mode: 'pick', group: 'pickup',
    action: 'Topla', uses: 1,
    drops: [{ item: 'coconut', min: 1, max: 1 }],
    respawn: 300, xp: 1, particle: 'wood', sound: 'pickup',
  },
  fish_spot: {
    name: 'Balık Sürüsü', model: 'fishSpot', variants: 1, mode: 'pick', group: 'fish',
    action: 'Balık Tut', uses: 3, gatherTime: 1.3, animation: 'fish',
    drops: [{ item: 'raw_fish', min: 1, max: 1 }],
    toolBonus: { spear: [{ item: 'raw_fish', min: 1, max: 1, chance: 0.75 }] },
    respawn: 200, xp: 3, particle: 'water', sound: 'splash', animated: true,
  },
};

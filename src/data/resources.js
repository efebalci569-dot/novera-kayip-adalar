// Dünyadaki toplanabilir kaynaklar.
//
// İki tür etkileşim vardır:
//   hit  → alet gerekir; her vuruşta can düşer ve kaynak düşer (ağaç, kaya)
//   pick → elle toplanır; 'uses' kadar toplanabilir (dal, çakıl, çalı)
//
// drops: [{ item, min, max, chance }] — LootSystem.rollDrops ile hesaplanır.
// crownY : ağaç tepesinin yüksekliği (yaprak parçacıkları buradan dökülür)
// stump  : devrilince geride kalan kütüğün ölçeği
// sway   : rüzgârda salınım ('tree' | 'plant')
// cave   : yalnızca mağarada bulunur (ayrı çarpışma katmanı)
// glow   : ışık almadan parlayan malzeme (kristaller, mantarlar)
// minTier: vurmak için gereken en düşük alet kademesi (ör. obsidyen için bakır kazma)

export const RESOURCES = {
  palm_tree: {
    name: 'Palmiye', model: 'palm', variants: 2, mode: 'hit', group: 'tree',
    action: 'Odun Kes', tool: 'axe', minTier: 1, hp: 4,
    hitDrops: [{ item: 'wood', min: 1, max: 1 }],
    finalDrops: [{ item: 'wood', min: 2, max: 3 }, { item: 'coconut', min: 1, max: 2, chance: 0.6 }],
    respawn: 300, xp: 2, finalXp: 10, collider: 0.4, fells: true, particle: 'wood', sound: 'chop',
    crownY: 9.5, stump: 0.62, sway: 'tree',
  },
  oak_tree: {
    name: 'Orman Ağacı', model: 'oak', variants: 3, mode: 'hit', group: 'tree',
    action: 'Odun Kes', tool: 'axe', minTier: 1, hp: 6,
    hitDrops: [{ item: 'wood', min: 1, max: 1 }],
    finalDrops: [{ item: 'wood', min: 4, max: 6 }, { item: 'fiber', min: 1, max: 2, chance: 0.5 }],
    respawn: 360, xp: 2, finalXp: 14, collider: 0.6, fells: true, particle: 'wood', sound: 'chop',
    crownY: 6.5, stump: 1.05, sway: 'tree',
  },
  pine_tree: {
    name: 'Çam Ağacı', model: 'pine', variants: 2, mode: 'hit', group: 'tree',
    action: 'Odun Kes', tool: 'axe', minTier: 1, hp: 6,
    hitDrops: [{ item: 'wood', min: 1, max: 1 }],
    finalDrops: [{ item: 'wood', min: 4, max: 7 }],
    respawn: 360, xp: 2, finalXp: 14, collider: 0.45, fells: true, particle: 'wood', sound: 'chop',
    crownY: 7.5, stump: 0.75, sway: 'tree', leafParticle: 'pine',
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
    respawn: 180, xp: 1, particle: 'leaf', sound: 'rustle', sway: 'plant',
  },
  berry_bush: {
    name: 'Meyve Çalısı', model: 'berryBush', variants: 1, mode: 'pick', group: 'plant',
    action: 'Meyve Topla', uses: 2,
    drops: [{ item: 'berries', min: 2, max: 3 }, { item: 'fiber', min: 1, max: 1, chance: 0.3 }],
    respawn: 240, xp: 1, particle: 'leaf', sound: 'rustle', sway: 'plant',
  },
  vine_tangle: {
    name: 'Sarmaşık', model: 'vineTangle', variants: 2, mode: 'pick', group: 'plant',
    action: 'Sarmaşık Topla', uses: 2, gatherTime: 0.8,
    drops: [{ item: 'vine', min: 1, max: 2 }, { item: 'fiber', min: 1, max: 1, chance: 0.35 }],
    respawn: 260, xp: 2, particle: 'leaf', sound: 'rustle', sway: 'plant',
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
    toolBonus: {
      spear: [{ item: 'raw_fish', min: 1, max: 1, chance: 0.75 }],
      rod: [{ item: 'raw_fish', min: 1, max: 1, chance: 0.9 }],
    },
    respawn: 200, xp: 3, particle: 'water', sound: 'splash', animated: true,
  },

  // ── Mağara ───────────────────────────────────────────────
  coal_ore: {
    name: 'Kömür Damarı', model: 'coalOre', variants: 2, mode: 'hit', group: 'rock', cave: true,
    action: 'Kaz', tool: 'pickaxe', minTier: 1, hp: 6,
    hitDrops: [{ item: 'coal', min: 1, max: 1, chance: 0.6 }, { item: 'stone', min: 1, max: 1, chance: 0.4 }],
    finalDrops: [{ item: 'coal', min: 2, max: 4 }],
    respawn: 600, xp: 3, finalXp: 18, collider: 1.0, particle: 'coal', sound: 'mine',
  },
  iron_ore: {
    name: 'Demir Damarı', model: 'ironOre', variants: 2, mode: 'hit', group: 'rock', cave: true,
    action: 'Kaz', tool: 'pickaxe', minTier: 1, hp: 9,
    hitDrops: [{ item: 'iron_ore', min: 1, max: 1, chance: 0.5 }, { item: 'stone', min: 1, max: 1, chance: 0.5 }],
    finalDrops: [{ item: 'iron_ore', min: 2, max: 3 }],
    respawn: 720, xp: 4, finalXp: 25, collider: 1.0, particle: 'iron', sound: 'mine',
  },
  crystal_node: {
    name: 'Kristal Kümesi', model: 'crystal', variants: 2, mode: 'hit', group: 'rock', cave: true, glow: true,
    action: 'Kristal Kır', tool: 'pickaxe', minTier: 1, hp: 5,
    hitDrops: [],
    finalDrops: [{ item: 'crystal', min: 1, max: 2 }],
    respawn: 900, xp: 4, finalXp: 30, collider: 0.7, particle: 'magic', sound: 'crystal',
    light: { color: '#6fe3ff', intensity: 3.2, distance: 9, y: 1.0 },
  },
  cave_mushroom: {
    name: 'Işıldayan Mantar', model: 'caveMushroom', variants: 2, mode: 'pick', group: 'plant', cave: true, glow: true,
    action: 'Mantar Topla', uses: 2,
    drops: [{ item: 'cave_mushroom', min: 1, max: 2 }],
    respawn: 420, xp: 2, particle: 'magic', sound: 'pickup',
  },

  // ── Çöl Adası ───────────────────────────────────────────
  cactus: {
    name: 'Kaktüs', model: 'cactus', variants: 3, mode: 'hit', group: 'tree',
    action: 'Kaktüs Kes', tool: 'axe', minTier: 1, hp: 3,
    hitDrops: [{ item: 'fiber', min: 1, max: 1, chance: 0.5 }],
    finalDrops: [{ item: 'cactus_fruit', min: 1, max: 2 }, { item: 'fiber', min: 1, max: 2 }],
    respawn: 300, xp: 2, finalXp: 8, collider: 0.38, particle: 'leaf', sound: 'chop', crownY: 3, sway: 'tree',
  },
  desert_shrub: {
    name: 'Kuru Çalı', model: 'desertShrub', variants: 2, mode: 'pick', group: 'plant',
    action: 'Çalı Topla', uses: 2,
    drops: [{ item: 'fiber', min: 1, max: 2 }, { item: 'wood', min: 1, max: 1, chance: 0.55 }],
    respawn: 200, xp: 1, particle: 'sand', sound: 'rustle', sway: 'plant',
  },
  sandstone_rock: {
    name: 'Kumtaşı Kayası', model: 'sandstoneRock', variants: 2, mode: 'hit', group: 'rock',
    action: 'Kaz', tool: 'pickaxe', minTier: 1, hp: 5,
    hitDrops: [{ item: 'sandstone', min: 1, max: 1 }],
    finalDrops: [{ item: 'sandstone', min: 2, max: 4 }, { item: 'stone', min: 1, max: 2 }],
    respawn: 420, xp: 2, finalXp: 12, collider: 1.05, particle: 'sand', sound: 'mine',
  },
  copper_rock: {
    name: 'Bakır Damarı', model: 'copperRock', variants: 2, mode: 'hit', group: 'rock',
    action: 'Kaz', tool: 'pickaxe', minTier: 1, hp: 8,
    hitDrops: [{ item: 'copper_ore', min: 1, max: 1, chance: 0.5 }, { item: 'stone', min: 1, max: 1, chance: 0.5 }],
    finalDrops: [{ item: 'copper_ore', min: 2, max: 3 }],
    respawn: 600, xp: 3, finalXp: 22, collider: 1.0, particle: 'iron', sound: 'mine',
  },
  bone_pile: {
    name: 'Kemik Yığını', model: 'bonePile', variants: 2, mode: 'pick', group: 'pickup',
    action: 'Kemik Topla', uses: 2,
    drops: [{ item: 'bone', min: 1, max: 2 }],
    respawn: 400, xp: 2, particle: 'dust', sound: 'pickup',
  },

  // ── Buz Adası ───────────────────────────────────────────
  snow_pine: {
    name: 'Karlı Çam', model: 'snowPine', variants: 2, mode: 'hit', group: 'tree',
    action: 'Odun Kes', tool: 'axe', minTier: 1, hp: 6,
    hitDrops: [{ item: 'wood', min: 1, max: 1 }],
    finalDrops: [{ item: 'wood', min: 4, max: 7 }],
    respawn: 360, xp: 2, finalXp: 14, collider: 0.45, fells: true, particle: 'wood', sound: 'chop',
    crownY: 7, stump: 0.75, sway: 'tree', leafParticle: 'snow',
  },
  ice_rock: {
    name: 'Buz Kayası', model: 'iceRock', variants: 2, mode: 'hit', group: 'rock',
    action: 'Buz Kır', tool: 'pickaxe', minTier: 1, hp: 6,
    hitDrops: [{ item: 'ice_crystal', min: 1, max: 1, chance: 0.4 }, { item: 'stone', min: 1, max: 1, chance: 0.5 }],
    finalDrops: [{ item: 'ice_crystal', min: 1, max: 3 }],
    respawn: 600, xp: 3, finalXp: 20, collider: 1.0, particle: 'ice', sound: 'crystal',
  },
  iron_vein: {
    name: 'Demir Damarı', model: 'ironOre', variants: 2, mode: 'hit', group: 'rock',
    action: 'Kaz', tool: 'pickaxe', minTier: 1, hp: 9,
    hitDrops: [{ item: 'iron_ore', min: 1, max: 1, chance: 0.5 }, { item: 'stone', min: 1, max: 1, chance: 0.5 }],
    finalDrops: [{ item: 'iron_ore', min: 2, max: 3 }],
    respawn: 720, xp: 4, finalXp: 25, collider: 1.0, particle: 'iron', sound: 'mine',
  },
  frost_bush: {
    name: 'Kırağı Çalısı', model: 'frostBush', variants: 1, mode: 'pick', group: 'plant',
    action: 'Meyve Topla', uses: 2,
    drops: [{ item: 'frost_berries', min: 2, max: 3 }, { item: 'fiber', min: 1, max: 1, chance: 0.3 }],
    respawn: 260, xp: 1, particle: 'snow', sound: 'rustle', sway: 'plant',
  },

  // ── Volkan Adası ────────────────────────────────────────
  charred_tree: {
    name: 'Kömürleşmiş Ağaç', model: 'charredTree', variants: 2, mode: 'hit', group: 'tree',
    action: 'Odun Kes', tool: 'axe', minTier: 1, hp: 4,
    hitDrops: [{ item: 'wood', min: 1, max: 1, chance: 0.6 }, { item: 'coal', min: 1, max: 1, chance: 0.3 }],
    finalDrops: [{ item: 'wood', min: 2, max: 3 }, { item: 'coal', min: 1, max: 2 }],
    respawn: 420, xp: 2, finalXp: 12, collider: 0.4, fells: true, particle: 'coal', sound: 'chop',
    crownY: 5, stump: 0.6, sway: 'tree', leafParticle: 'ash',
  },
  obsidian_rock: {
    name: 'Obsidyen Yığını', model: 'obsidianRock', variants: 2, mode: 'hit', group: 'rock',
    action: 'Kaz', tool: 'pickaxe', minTier: 2, hp: 8,
    hitDrops: [{ item: 'obsidian', min: 1, max: 1, chance: 0.45 }],
    finalDrops: [{ item: 'obsidian', min: 2, max: 3 }],
    respawn: 720, xp: 4, finalXp: 28, collider: 0.9, particle: 'obsidian', sound: 'crystal',
  },
  sulfur_vent: {
    name: 'Kükürt Bacası', model: 'sulfurVent', variants: 2, mode: 'hit', group: 'rock',
    action: 'Kükürt Kaz', tool: 'pickaxe', minTier: 1, hp: 5,
    hitDrops: [{ item: 'sulfur', min: 1, max: 1, chance: 0.5 }],
    finalDrops: [{ item: 'sulfur', min: 2, max: 4 }],
    respawn: 500, xp: 3, finalXp: 16, collider: 0.85, particle: 'sulfur', sound: 'mine',
  },
  basalt_rock: {
    name: 'Bazalt Sütunları', model: 'basaltRock', variants: 2, mode: 'hit', group: 'rock',
    action: 'Kaz', tool: 'pickaxe', minTier: 1, hp: 7,
    hitDrops: [{ item: 'stone', min: 1, max: 1 }],
    finalDrops: [{ item: 'stone', min: 3, max: 5 }, { item: 'coal', min: 1, max: 1, chance: 0.4 }],
    respawn: 420, xp: 2, finalXp: 14, collider: 1.15, particle: 'stone', sound: 'mine',
  },
};

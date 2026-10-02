// Üretim tarifleri.
//
//   unlock   : undefined → görev ödülüyle açılır (GameState.recipes içinde olmalı)
//              { level: n } → oyuncu bu seviyeye gelince otomatik açılır (seviye kilidi)
//   station  : 'campfire' | 'workbench' → yakında bu yapı olmalı
//   upgrade  : üretildiğinde envantere eşya eklemek yerine kalıcı geliştirme uygular

export const CRAFT_CATEGORIES = [
  { id: 'tools', name: 'Aletler', icon: '🪓' },
  { id: 'weapons', name: 'Silahlar', icon: '🔱' },
  { id: 'food', name: 'Yiyecek', icon: '🍢' },
  { id: 'equipment', name: 'Ekipman', icon: '🎒' },
  { id: 'medical', name: 'Şifa', icon: '🩹' },
  { id: 'materials', name: 'Malzeme', icon: '🪢' },
  { id: 'vehicles', name: 'Taşıtlar', icon: '⛵' },
];

export const STATIONS = {
  campfire: { name: 'Kamp Ateşi', icon: '🔥' },
  workbench: { name: 'Çalışma Masası', icon: '🛠️' },
};

export const RECIPES = [
  {
    id: 'stone_axe', result: 'stone_axe', count: 1, category: 'tools',
    ingredients: { wood: 5, stone: 3, fiber: 2 }, xp: 15,
  },
  {
    id: 'stone_pickaxe', result: 'stone_pickaxe', count: 1, category: 'tools',
    ingredients: { wood: 5, stone: 5, fiber: 2 }, xp: 15,
  },
  {
    id: 'stone_knife', result: 'stone_knife', count: 1, category: 'tools',
    ingredients: { stone: 4, wood: 1, fiber: 2 }, xp: 12,
  },
  {
    id: 'torch', result: 'torch', count: 1, category: 'tools',
    ingredients: { wood: 2, fiber: 3 }, xp: 8,
  },
  {
    id: 'fishing_rod', result: 'fishing_rod', count: 1, category: 'tools',
    ingredients: { wood: 3, fiber: 4, feather: 2 }, unlock: { level: 3 }, xp: 15,
  },
  {
    id: 'stone_spear', result: 'stone_spear', count: 1, category: 'weapons',
    ingredients: { wood: 6, stone: 4, fiber: 4 }, station: 'workbench', xp: 25,
  },
  {
    id: 'cooked_fish', result: 'cooked_fish', count: 1, category: 'food',
    ingredients: { raw_fish: 1 }, station: 'campfire', xp: 8,
  },
  {
    id: 'berry_skewer', result: 'berry_skewer', count: 1, category: 'food',
    ingredients: { berries: 4, wood: 1 }, station: 'campfire', xp: 8,
  },
  {
    id: 'cooked_meat', result: 'cooked_meat', count: 1, category: 'food',
    ingredients: { raw_meat: 1 }, station: 'campfire', xp: 10,
  },
  {
    id: 'rope', result: 'rope', count: 1, category: 'materials',
    ingredients: { vine: 3, fiber: 2 }, unlock: { level: 2 }, xp: 6,
  },
  {
    id: 'wool_blanket', result: 'wool_blanket', count: 1, category: 'materials',
    ingredients: { wool: 3, fiber: 2 }, xp: 20,
  },
  {
    id: 'bandage', result: 'bandage', count: 1, category: 'medical',
    ingredients: { fiber: 6 }, xp: 6,
  },
  {
    id: 'fiber_backpack', name: 'Lif Sırt Çantası', icon: '🎒', category: 'equipment',
    ingredients: { fiber: 20, wood: 6 }, station: 'workbench', unlock: { level: 3 }, xp: 40,
    upgrade: { inventorySize: 15, backpack: 1 },
    desc: 'Envanterini 15 slota çıkarır. Üretildiği anda kuşanılır.',
  },
  {
    id: 'woven_backpack', name: 'Dokuma Sırt Çantası', icon: '🎒', category: 'equipment',
    ingredients: { fiber: 40, wood: 12, stone: 6 }, station: 'workbench', unlock: { level: 6 }, xp: 80,
    requiresUpgrade: { backpack: 1 },
    upgrade: { inventorySize: 20, backpack: 2 },
    desc: 'Envanterini 20 slota çıkarır. Önce Lif Sırt Çantası gerekir.',
  },
  {
    id: 'raft', result: 'raft', count: 1, category: 'vehicles',
    ingredients: { wood: 24, rope: 6, fiber: 6 }, station: 'workbench', unlock: { level: 4 }, xp: 60,
  },
  {
    id: 'boat', result: 'boat', count: 1, category: 'vehicles',
    ingredients: { wood: 50, rope: 10, hide: 6, wool: 8 }, station: 'workbench', unlock: { level: 8 }, xp: 150,
  },
];

export const RECIPE_MAP = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

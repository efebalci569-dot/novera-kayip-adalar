// Tüm eşyalar veri olarak tanımlanır. Yeni eşya eklemek için buraya bir kayıt eklemek yeterli.
//
// Alanlar:
//   category  : resource | food | tool | weapon | equipment | quest
//   maxStack  : bir slotta kaç tane birikebilir (aletler 1)
//   food      : tüketildiğinde istatistik etkisi { hunger, thirst, health, stamina }
//   tool      : { type: 'axe' | 'pickaxe' | 'spear' | 'torch', tier, power }
//   durability: kullanım ömrü (vuruş sayısı)
//   held      : elde gösterilecek 3D model anahtarı (PlayerModel)

export const ITEMS = {
  // ── Hammaddeler ──────────────────────────────────────────
  wood: {
    name: 'Odun', icon: '🪵', category: 'resource', maxStack: 50, rarity: 'common',
    desc: 'Kuru dallardan ve ağaçlardan elde edilir. Neredeyse her şeyin temeli.',
  },
  stone: {
    name: 'Taş', icon: '🪨', category: 'resource', maxStack: 50, rarity: 'common',
    desc: 'Çakıl taşlarından ya da kayalardan toplanır. Aletler ve yapılar için gerekli.',
  },
  fiber: {
    name: 'Lif', icon: '🌿', category: 'resource', maxStack: 50, rarity: 'common',
    desc: 'Lifli çalılardan toplanır. Bağlamak ve örmek için kullanılır.',
  },

  // ── Yiyecekler ───────────────────────────────────────────
  berries: {
    name: 'Yaban Meyvesi', icon: '🫐', category: 'food', maxStack: 20, rarity: 'common',
    food: { hunger: 7, thirst: 3 },
    desc: 'Tatlı ve sulu küçük meyveler. Az doyurur ama her yerde bulunur.',
  },
  coconut: {
    name: 'Hindistan Cevizi', icon: '🥥', category: 'food', maxStack: 10, rarity: 'common',
    food: { hunger: 8, thirst: 24 },
    desc: 'Palmiyelerin dibinde bulunur. Suyu susuzluğu iyi giderir.',
  },
  raw_fish: {
    name: 'Çiğ Balık', icon: '🐟', category: 'food', maxStack: 10, rarity: 'common',
    food: { hunger: 6, health: -4 },
    desc: 'Çiğ yemek midene dokunabilir. Kamp ateşinde pişirmek çok daha iyi.',
  },
  cooked_fish: {
    name: 'Pişmiş Balık', icon: '🍢', category: 'food', maxStack: 10, rarity: 'uncommon',
    food: { hunger: 32, health: 8 },
    desc: 'Kamp ateşinde pişirilmiş, mis kokulu bir öğün.',
  },
  berry_skewer: {
    name: 'Meyve Şiş', icon: '🍡', category: 'food', maxStack: 10, rarity: 'uncommon',
    food: { hunger: 18, thirst: 6, stamina: 20 },
    desc: 'Ateşte közlenmiş meyveler. Enerji verir.',
  },

  // ── Aletler ──────────────────────────────────────────────
  stone_axe: {
    name: 'Taş Balta', icon: '🪓', category: 'tool', maxStack: 1, rarity: 'common',
    tool: { type: 'axe', tier: 1, power: 1 }, durability: 140, damage: 6, held: 'axe',
    desc: 'Ağaç kesmek için ilkel ama işe yarar bir balta.',
  },
  stone_pickaxe: {
    name: 'Taş Kazma', icon: '⛏️', category: 'tool', maxStack: 1, rarity: 'common',
    tool: { type: 'pickaxe', tier: 1, power: 1 }, durability: 140, damage: 5, held: 'pickaxe',
    desc: 'Kayaları kırmak için kullanılır.',
  },
  torch: {
    name: 'Meşale', icon: '🔦', category: 'tool', maxStack: 1, rarity: 'common',
    tool: { type: 'torch', tier: 1, power: 0 }, held: 'torch',
    desc: 'Elinde tutarken karanlığı aydınlatır. Hızlı slota koy ve seç.',
  },
  stone_spear: {
    name: 'Taş Mızrak', icon: '🔱', category: 'weapon', maxStack: 1, rarity: 'uncommon',
    tool: { type: 'spear', tier: 1, power: 1 }, durability: 100, damage: 12, held: 'spear',
    desc: 'Balık tutarken ekstra balık sağlar. İleride avlanma ve savunma için kullanılacak.',
  },
  bandage: {
    name: 'Lif Sargı', icon: '🩹', category: 'food', maxStack: 10, rarity: 'common',
    food: { health: 30 }, consumeVerb: 'Kullan',
    desc: 'Yaraları sarmak için örülmüş lif. 30 can yeniler.',
  },

  // ── Görev / hikâye ───────────────────────────────────────
  rune_shard: {
    name: 'Antik Sembol Parçası', icon: '💠', category: 'quest', maxStack: 5, rarity: 'rare',
    desc: 'Hafifçe parlayan, üzerinde tanıdık olmayan semboller bulunan bir taş parçası.',
  },
};

export function getItem(id) {
  return ITEMS[id];
}

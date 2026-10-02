// Tüm eşyalar veri olarak tanımlanır. Yeni eşya eklemek için buraya bir kayıt eklemek yeterli.
//
// Alanlar:
//   category  : resource | food | tool | weapon | equipment | vehicle | quest
//   maxStack  : bir slotta kaç tane birikebilir (aletler 1)
//   food      : tüketildiğinde istatistik etkisi { hunger, thirst, health, stamina }
//   tool      : { type: 'axe' | 'pickaxe' | 'knife' | 'spear' | 'rod' | 'torch', tier, power }
//   damage    : hayvanlara verilen hasar (en yüksek hasarlı alet otomatik kullanılır; yoksa yumruk)
//   vehicle   : suya indirilebilen taşıt türü (data/buildings.js içindeki taşıt tanımı)
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
  vine: {
    name: 'Sarmaşık', icon: '🍃', category: 'resource', maxStack: 50, rarity: 'common',
    desc: 'Ormandaki sarmaşık yumaklarından toplanır. Bükülünce sağlam bir halat olur.',
  },
  rope: {
    name: 'Halat', icon: '🪢', category: 'resource', maxStack: 30, rarity: 'uncommon',
    desc: 'Sarmaşık ve liften örülmüş sağlam halat. Sal ve tekne yapımında şart.',
  },
  hide: {
    name: 'Deri', icon: '🟫', category: 'resource', maxStack: 30, rarity: 'uncommon',
    desc: 'İnekten bıçakla yüzülerek elde edilir. Kulübeler ve teknelerde kullanılır.',
  },
  wool: {
    name: 'Yün', icon: '🧶', category: 'resource', maxStack: 30, rarity: 'common',
    desc: 'Koyundan bıçakla alınır. Battaniye ve yelken örmek için kullanılır.',
  },
  feather: {
    name: 'Tüy', icon: '🪶', category: 'resource', maxStack: 40, rarity: 'common',
    desc: 'Tavuktan elde edilir. Hafif ve dayanıklı; olta yapımında işe yarar.',
  },
  wool_blanket: {
    name: 'Yün Battaniye', icon: '🧣', category: 'resource', maxStack: 5, rarity: 'uncommon',
    desc: 'Yünden örülmüş sıcacık battaniye. Bir yatak yapmak için gerekli.',
  },
  coal: {
    name: 'Kömür', icon: '⚫', category: 'resource', maxStack: 50, rarity: 'uncommon',
    desc: 'Mağaradaki kömür damarlarından çıkarılır. Demir eritmek için yakıt olacak (fırın yakında).',
  },
  iron_ore: {
    name: 'Demir Cevheri', icon: '🔩', category: 'resource', maxStack: 50, rarity: 'rare',
    desc: 'Mağaranın derinliklerindeki damarlardan kazılır. Demir çağının ilk adımı.',
  },
  crystal: {
    name: 'Kristal', icon: '💎', category: 'resource', maxStack: 30, rarity: 'rare',
    desc: 'Karanlıkta hafifçe parlayan mavi kristal. Kristal fener yapımında kullanılır.',
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
  raw_meat: {
    name: 'Çiğ Et', icon: '🥩', category: 'food', maxStack: 10, rarity: 'common',
    food: { hunger: 8, health: -6 },
    desc: 'Avlanan hayvanlardan elde edilir. Çiğ yemek tehlikeli — kamp ateşinde pişir.',
  },
  cooked_meat: {
    name: 'Pişmiş Et', icon: '🍖', category: 'food', maxStack: 10, rarity: 'uncommon',
    food: { hunger: 42, health: 12 },
    desc: 'Közde pişmiş, doyurucu bir öğün. Açlığı uzun süre bastırır.',
  },
  cave_mushroom: {
    name: 'Işıldayan Mantar', icon: '🍄', category: 'food', maxStack: 10, rarity: 'uncommon',
    food: { hunger: 10, stamina: 35, thirst: 4 },
    desc: 'Mağaranın nemli köşelerinde yetişir. Hafif tatlı; enerjini hızla toplar.',
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
  stone_knife: {
    name: 'Taş Bıçak', icon: '🔪', category: 'tool', maxStack: 1, rarity: 'common',
    tool: { type: 'knife', tier: 1, power: 1 }, durability: 120, damage: 8, held: 'knife',
    desc: 'Keskin bir taş parçası. Avladığın hayvanları parçalamak (et, deri, yün, tüy) için gerekli.',
  },
  stone_spear: {
    name: 'Taş Mızrak', icon: '🔱', category: 'weapon', maxStack: 1, rarity: 'uncommon',
    tool: { type: 'spear', tier: 1, power: 1 }, durability: 100, damage: 12, held: 'spear',
    desc: 'Avlanmak için en iyi silah. Balık tutarken de ekstra balık sağlar.',
  },
  fishing_rod: {
    name: 'Olta', icon: '🎣', category: 'tool', maxStack: 1, rarity: 'uncommon',
    tool: { type: 'rod', tier: 1, power: 0 }, durability: 80, held: 'rod',
    desc: 'Tüylü yemle yapılmış olta. Envanterindeyken balık sürülerinden daha çok balık çıkar.',
  },
  raft: {
    name: 'Sal', icon: '🛶', category: 'vehicle', maxStack: 1, rarity: 'uncommon', vehicle: 'raft',
    desc: 'Kütüklerden bağlanmış basit bir sal. Seç ve [Sağ tık] ile suya indir; kıyı boyunca kürek çek.',
  },
  boat: {
    name: 'Tekne', icon: '⛵', category: 'vehicle', maxStack: 1, rarity: 'rare', vehicle: 'boat',
    desc: 'Yün yelkenli sağlam bir tekne. Saldan çok daha hızlı ve açık denize daha uzağa gidebilir.',
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

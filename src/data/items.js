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
//   held      : elde gösterilecek 3D model anahtarı (PlayerModel) — yoksa eşyanın kendi modeli elde görünür
//   armor     : kuşanılabilir zırh { defense, cold?, heat? } (sağ tık ile giyilir)
//   summon    : bir sunağa konunca boss'u uyandırır (data/bosses.js)
//   chart     : bir adanın konumunu gösteren seyir haritası (data/islands.js)
//   slow/burn : silah vuruşu düşmanı yavaşlatır / yakar
//
// İkonlar: her eşyanın ikonu kendi 3B modelinden üretilir (world/ItemModels.js);
// `icon` alanı arayüzdeki metinlerde "{i:<id>}" belirtecine çevrilir.

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
  forest_heart: {
    name: 'Orman Kalbi', category: 'quest', maxStack: 1, rarity: 'epic', summon: 'guardian',
    desc: 'Kristal ve sarmaşıkla örülmüş, içinde yeşil bir ışık atan tohum. Ormandaki Kadim Sunak\'a konunca adanın koruyucusu uyanır.',
  },
  chart_desert: {
    name: 'Seyir Haritası: Çöl Adası', category: 'quest', maxStack: 1, rarity: 'epic', chart: 'desert',
    desc: 'Orman Muhafızı\'nın kalbinden çıkan eski bir harita. Güneybatıdaki altın kumlu adaya giden rotayı gösteriyor.',
  },
  chart_ice: {
    name: 'Seyir Haritası: Buz Adası', category: 'quest', maxStack: 1, rarity: 'epic', chart: 'ice',
    desc: 'Kum Kralı\'nın tacının içine sarılmış harita. Kuzeybatıdaki buzlarla kaplı adayı işaret ediyor.',
  },
  chart_volcano: {
    name: 'Seyir Haritası: Volkan Adası', category: 'quest', maxStack: 1, rarity: 'epic', chart: 'volcano',
    desc: 'Buz Devi\'nin göğsündeki buzun içinde donmuş bir harita. Kuzeydoğuda dumanı tüten volkana giden yol.',
  },

  // ── Çöl Adası ───────────────────────────────────────────
  cactus_fruit: {
    name: 'Kaktüs Meyvesi', category: 'food', maxStack: 15, rarity: 'common',
    food: { hunger: 6, thirst: 20 },
    desc: 'Dikenli kabuğunun altında sulu, tatlı bir meyve. Çölde susuzluğa birebir.',
  },
  sandstone: {
    name: 'Kumtaşı', category: 'resource', maxStack: 50, rarity: 'common',
    desc: 'Katman katman sıkışmış kum. Fırın ve çöl yapıları için kullanılır.',
  },
  copper_ore: {
    name: 'Bakır Cevheri', category: 'resource', maxStack: 50, rarity: 'uncommon',
    desc: 'Yeşil-turuncu damarlı kaya. Fırında eritilince bakır külçe olur.',
  },
  copper_ingot: {
    name: 'Bakır Külçe', category: 'resource', maxStack: 30, rarity: 'uncommon',
    desc: 'Fırında eritilmiş saf bakır. Pala ve bakır aletler için.',
  },
  stinger: {
    name: 'Akrep İğnesi', category: 'resource', maxStack: 30, rarity: 'uncommon',
    desc: 'Çöl akreplerinin zehirli iğnesi. Dikkatli tut.',
  },
  chitin: {
    name: 'Kitin Plaka', category: 'resource', maxStack: 30, rarity: 'uncommon',
    desc: 'Akrep kabuğundan sert, hafif bir plaka. Zırh yapımında kullanılır.',
  },
  bone: {
    name: 'Kemik', category: 'resource', maxStack: 40, rarity: 'common',
    desc: 'Çöl sırtlanlarından ve kum altındaki eski iskeletlerden.',
  },
  copper_scimitar: {
    name: 'Bakır Pala', category: 'weapon', maxStack: 1, rarity: 'rare',
    durability: 220, damage: 18, held: 'scimitar',
    desc: 'Kavisli, keskin bakır bir pala. Çöl adasının ilk gerçek silahı: taş mızraktan çok daha güçlü.',
  },
  copper_pickaxe: {
    name: 'Bakır Kazma', category: 'tool', maxStack: 1, rarity: 'rare',
    tool: { type: 'pickaxe', tier: 2, power: 2 }, durability: 260, damage: 7, held: 'copper_pickaxe',
    desc: 'Kayaları iki kat hızlı kırar. Volkan adasındaki obsidyeni ancak bununla kazabilirsin.',
  },
  chitin_armor: {
    name: 'Kitin Zırh', category: 'equipment', maxStack: 1, rarity: 'rare',
    armor: { defense: 15 },
    desc: 'Akrep kabuklarından örülmüş hafif zırh. Kuşanınca aldığın hasar azalır (Savunma +15).',
  },
  scorpion_sigil: {
    name: 'Akrep Mührü', category: 'quest', maxStack: 1, rarity: 'epic', summon: 'sand_king',
    desc: 'Kumtaşından oyulmuş, bakır çerçeveli bir mühür. Çöl tapınağındaki sunağa konunca Kum Kralı uyanır.',
  },

  // ── Buz Adası ───────────────────────────────────────────
  frost_berries: {
    name: 'Kırağı Meyvesi', category: 'food', maxStack: 20, rarity: 'common',
    food: { hunger: 8, thirst: 6, stamina: 12 },
    desc: 'Karın altında bile olgunlaşan buz mavisi meyveler. Ferahlatır.',
  },
  ice_crystal: {
    name: 'Buz Kristali', category: 'resource', maxStack: 30, rarity: 'uncommon',
    desc: 'Asla erimeyen, içinden soğuk bir ışık yayan kristal.',
  },
  fur: {
    name: 'Kürk', category: 'resource', maxStack: 30, rarity: 'uncommon',
    desc: 'Kar kurtlarının kalın, sıcak kürkü. Soğuğa karşı en iyi koruma.',
  },
  fang: {
    name: 'Kurt Dişi', category: 'resource', maxStack: 30, rarity: 'uncommon',
    desc: 'Uzun, sivri bir diş. Silahları güçlendirmek için kullanılır.',
  },
  frost_core: {
    name: 'Buz Özü', category: 'resource', maxStack: 20, rarity: 'rare',
    desc: 'Buz cinlerinin içinde atan dondurucu çekirdek.',
  },
  iron_ingot: {
    name: 'Demir Külçe', category: 'resource', maxStack: 30, rarity: 'uncommon',
    desc: 'Fırında kömürle eritilmiş demir. Güçlü silahların temeli.',
  },
  frost_sword: {
    name: 'Buz Kılıcı', category: 'weapon', maxStack: 1, rarity: 'epic',
    durability: 300, damage: 26, held: 'ice_sword', slow: true,
    desc: 'Demir kabzalı, buz kristalinden dövülmüş ağız. Vurduğu düşmanı yavaşlatır.',
  },
  fur_coat: {
    name: 'Kürk Mont', category: 'equipment', maxStack: 1, rarity: 'rare',
    armor: { defense: 10, cold: true },
    desc: 'Kalın kurt kürkünden mont. Buz adasının dondurucu soğuğundan korur (Savunma +10).',
  },
  frost_heart: {
    name: 'Buz Kalbi', category: 'quest', maxStack: 1, rarity: 'epic', summon: 'frost_giant',
    desc: 'Buz özlerinden şekillenmiş, kalp gibi atan bir kristal. Buzul sunağına konunca Buz Devi uyanır.',
  },

  // ── Volkan Adası ────────────────────────────────────────
  obsidian: {
    name: 'Obsidyen', category: 'resource', maxStack: 30, rarity: 'rare',
    desc: 'Lavın soğumasıyla oluşmuş, cam gibi keskin siyah taş. Bakır kazma gerekir.',
  },
  sulfur: {
    name: 'Kükürt', category: 'resource', maxStack: 40, rarity: 'uncommon',
    desc: 'Volkan bacalarının dibinde biriken sarı kristaller.',
  },
  magma_core: {
    name: 'Magma Çekirdeği', category: 'resource', maxStack: 20, rarity: 'rare',
    desc: 'Lav balçıklarının içindeki sıcak çekirdek. Hâlâ parlıyor.',
  },
  fire_scale: {
    name: 'Ateş Pulu', category: 'resource', maxStack: 30, rarity: 'uncommon',
    desc: 'Ateş kertenkelelerinin ısıya dayanıklı pulları.',
  },
  obsidian_blade: {
    name: 'Obsidyen Kılıç', category: 'weapon', maxStack: 1, rarity: 'legendary',
    durability: 360, damage: 38, held: 'obsidian_sword', burn: true,
    desc: 'Kızıl damarlı obsidyen ağız. Takımadaların en güçlü silahı: vurduğunu yakar.',
  },
  ember_armor: {
    name: 'Ateş Zırhı', category: 'equipment', maxStack: 1, rarity: 'epic',
    armor: { defense: 25, heat: true },
    desc: 'Obsidyen plakalı, ateş pullu zırh. Lav ve ateş hasarını büyük ölçüde azaltır (Savunma +25).',
  },
  fire_sigil: {
    name: 'Ateş Mührü', category: 'quest', maxStack: 1, rarity: 'epic', summon: 'lava_golem',
    desc: 'Obsidyene işlenmiş alev sembolü. Krater sunağına konunca Lav Golemi uyanır.',
  },
  lava_heart: {
    name: 'Lav Kalbi', category: 'quest', maxStack: 1, rarity: 'legendary',
    desc: 'Lav Golemi\'nin göğsünde atan kalp. Takımadaların son sırrı — ve bir zaferin kanıtı.',
  },
};

// Arayüz metinlerinde ikon belirteci (emojinin yerine 3B ikon çizilir)
for (const [id, def] of Object.entries(ITEMS)) {
  def.emoji = def.icon;
  def.icon = `{i:${id}}`;
}

export function getItem(id) {
  return ITEMS[id];
}

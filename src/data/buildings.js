// İnşa edilebilir yapılar.
//
//   bounds    : yerel uzayda yapının taban dikdörtgeni [minX, maxX, minZ, maxZ] (m) — yerleştirme ve çakışma kontrolü
//   colliders : yerel uzayda çarpışma şekilleri (circle / box)
//   platforms : üzerine çıkılabilen yüzeyler (kulübe tabanı, basamak) — top: tabana göre yükseklik
//   station   : üretim istasyonu kimliği (recipes.js → station)
//   storage   : sandık slot sayısı
//   unlock    : { level: n } → bu seviyede otomatik açılır (yoksa görevle açılır)
//   shelter   : barınak; comfort → içindeki yatakta uyuyunca ekstra dinlenme
//   interior  : barınağın iç alanı [minX, maxX, minZ, maxZ] (yatak bu alandaysa barınak bonusu)
//   vehicle   : su taşıtı; envanterdeki `item` eşyası suya indirilerek kurulur (inşa menüsünde görünmez)

export const BUILDINGS = {
  campfire: {
    name: 'Kamp Ateşi', icon: '🔥', category: 'base',
    desc: 'Isınmak, pişirmek ve geceyi aydınlatmak için. Yakınında yemek pişirebilirsin.',
    cost: { wood: 5, stone: 5 },
    bounds: [-0.75, 0.75, -0.75, 0.75], maxSlope: 0.7, xp: 20,
    colliders: [{ type: 'circle', x: 0, z: 0, r: 0.6 }],
    station: 'campfire', light: true,
    interact: { action: 'Pişir', panel: 'crafting', station: 'campfire' },
  },
  hut: {
    name: 'Küçük Kulübe', icon: '🛖', category: 'shelter',
    desc: 'Basit bir barınak. Doğma noktan olur; içine bir yatak koyarsan daha rahat uyursun.',
    cost: { wood: 20, stone: 10, fiber: 8 },
    bounds: [-1.85, 1.85, -1.85, 2.9], maxSlope: 0.55, xp: 60,
    shelter: true, comfort: 1, interior: [-1.45, 1.45, -1.45, 1.45],
    colliders: [
      { type: 'box', x: 0, z: -1.6, hw: 1.75, hd: 0.15 },
      { type: 'box', x: -1.6, z: 0, hw: 0.15, hd: 1.75 },
      { type: 'box', x: 1.6, z: 0, hw: 0.15, hd: 1.75 },
      { type: 'box', x: -1.15, z: 1.6, hw: 0.45, hd: 0.15 },
      { type: 'box', x: 1.15, z: 1.6, hw: 0.45, hd: 0.15 },
    ],
    // taban + kapı önündeki basamak (eğimli zeminde içeri çıkılabilsin diye)
    platforms: [
      { x: 0, z: 0, hw: 1.75, hd: 1.75, top: 0.3 },
      { x: 0, z: 2.05, hw: 0.65, hd: 0.3, top: -0.2 },
      { x: 0, z: 2.6, hw: 0.65, hd: 0.28, top: -0.7 },
    ],
    cameraBlocker: true,
  },
  bed: {
    name: 'Yatak', icon: '🛏️', category: 'base',
    desc: 'Yün battaniyeli saman yatak. Akşam 19:00\'dan sonra uyuyarak sabahı beklersin. Bir barınağın içine koyarsan daha iyi dinlenirsin.',
    cost: { wood: 8, fiber: 4, wool_blanket: 1 },
    bounds: [-0.6, 0.6, -1.1, 1.1], maxSlope: 0.5, xp: 30,
    colliders: [{ type: 'box', x: 0, z: 0, hw: 0.55, hd: 1.0 }],
    interact: { action: 'Uyu', handler: 'sleep' },
  },
  chest: {
    name: 'Sandık', icon: '📦', category: 'storage',
    desc: 'Eşyalarını saklamak için 20 slotluk ahşap sandık.',
    cost: { wood: 12, fiber: 4 },
    bounds: [-0.55, 0.55, -0.4, 0.4], maxSlope: 0.8, xp: 20,
    colliders: [{ type: 'box', x: 0, z: 0, hw: 0.55, hd: 0.38 }],
    storage: 20,
    interact: { action: 'Aç', panel: 'container' },
  },
  workbench: {
    name: 'Çalışma Masası', icon: '🛠️', category: 'crafting',
    desc: 'Daha gelişmiş aletler, ekipmanlar ve taşıtlar üretmeni sağlar.',
    cost: { wood: 15, stone: 6, fiber: 4 },
    bounds: [-0.95, 0.95, -0.5, 0.5], maxSlope: 0.8, xp: 30,
    colliders: [{ type: 'box', x: 0, z: 0, hw: 0.85, hd: 0.45 }],
    station: 'workbench',
    interact: { action: 'Kullan', panel: 'crafting', station: 'workbench' },
  },
  crystal_lamp: {
    name: 'Kristal Fener', icon: '🏮', category: 'base',
    desc: 'Mağara kristaliyle parlayan, hiç sönmeyen bir fener. Üssünü geceleri aydınlatır.',
    cost: { crystal: 2, wood: 4, stone: 2 },
    bounds: [-0.35, 0.35, -0.35, 0.35], maxSlope: 0.8, xp: 25, unlock: { level: 6 },
    colliders: [{ type: 'circle', x: 0, z: 0, r: 0.25 }],
    lamp: { color: '#7fe8ff', intensity: 9, distance: 16, y: 1.55 },
  },

  // ── Seviyeyle açılan barınaklar ──────────────────────────
  gazebo: {
    name: 'Saz Çardak', icon: '⛱️', category: 'shelter',
    desc: 'Dört direk üzerinde saz çatı. Ucuz ve hızlı bir gölgelik; altına yatak koyabilirsin.',
    cost: { wood: 14, fiber: 14 },
    bounds: [-1.7, 1.7, -1.7, 1.7], maxSlope: 0.6, xp: 40, unlock: { level: 2 },
    shelter: true, comfort: 0.5, interior: [-1.5, 1.5, -1.5, 1.5],
    colliders: [
      { type: 'circle', x: -1.45, z: -1.45, r: 0.16 },
      { type: 'circle', x: 1.45, z: -1.45, r: 0.16 },
      { type: 'circle', x: -1.45, z: 1.45, r: 0.16 },
      { type: 'circle', x: 1.45, z: 1.45, r: 0.16 },
    ],
  },
  cabin: {
    name: 'Ahşap Kulübe', icon: '🏡', category: 'shelter',
    desc: 'Pencereli, verandalı geniş bir ahşap kulübe. İçinde yatak, sandık ve masa için bolca yer var.',
    cost: { wood: 60, stone: 20, fiber: 16, hide: 4 },
    bounds: [-2.75, 2.75, -2.6, 4.0], maxSlope: 0.5, xp: 150, unlock: { level: 5 },
    shelter: true, comfort: 2, interior: [-2.3, 2.3, -2.1, 2.1],
    colliders: [
      { type: 'box', x: 0, z: -2.35, hw: 2.6, hd: 0.15 },
      { type: 'box', x: -2.45, z: 0, hw: 0.15, hd: 2.45 },
      { type: 'box', x: 2.45, z: 0, hw: 0.15, hd: 2.45 },
      { type: 'box', x: -1.6, z: 2.35, hw: 0.95, hd: 0.15 },
      { type: 'box', x: 1.6, z: 2.35, hw: 0.95, hd: 0.15 },
    ],
    platforms: [
      { x: 0, z: 0, hw: 2.6, hd: 2.5, top: 0.35 },
      { x: 0, z: 3.0, hw: 2.6, hd: 0.55, top: 0.3 },
      { x: 0, z: 3.7, hw: 0.8, hd: 0.25, top: -0.15 },
    ],
    cameraBlocker: true,
  },
  stone_house: {
    name: 'Taş Ev', icon: '🏠', category: 'shelter',
    desc: 'Kalın taş duvarlı, bacalı sağlam bir ev. Adadaki en rahat barınak — içinde uyuyan tamamen dinlenir.',
    cost: { stone: 80, wood: 40, hide: 6, fiber: 10 },
    bounds: [-3.3, 3.3, -3.0, 3.5], maxSlope: 0.45, xp: 260, unlock: { level: 9 },
    shelter: true, comfort: 3, interior: [-2.6, 2.6, -2.2, 2.2],
    colliders: [
      { type: 'box', x: 0, z: -2.55, hw: 3.1, hd: 0.3 },
      { type: 'box', x: -2.85, z: 0, hw: 0.3, hd: 2.85 },
      { type: 'box', x: 2.85, z: 0, hw: 0.3, hd: 2.85 },
      { type: 'box', x: -1.9, z: 2.55, hw: 1.25, hd: 0.3 },
      { type: 'box', x: 1.9, z: 2.55, hw: 1.25, hd: 0.3 },
    ],
    platforms: [
      { x: 0, z: 0, hw: 3.1, hd: 2.8, top: 0.4 },
      { x: 0, z: 3.15, hw: 0.9, hd: 0.3, top: 0.05 },
    ],
    cameraBlocker: true,
  },

  // ── Taşıtlar (envanterden suya indirilir) ────────────────
  raft: {
    name: 'Sal', icon: '🛶', category: 'vehicle', vehicle: true, item: 'raft',
    desc: 'Kıyı boyunca kürek çekebileceğin basit bir sal.',
    cost: { raft: 1 },
    bounds: [-1.15, 1.15, -1.8, 1.85], xp: 0,
    speed: 3.6, turn: 1.1, range: 262, seat: { z: -0.6, y: 0.55 }, deck: 0.18,
  },
  boat: {
    name: 'Tekne', icon: '⛵', category: 'vehicle', vehicle: true, item: 'boat',
    desc: 'Yün yelkenli, hızlı bir tekne.',
    cost: { boat: 1 },
    bounds: [-1.0, 1.0, -2.75, 2.55], xp: 0,
    speed: 7.4, turn: 0.95, range: 340, seat: { z: -1.35, y: 0.47 }, deck: 0.25,
  },
};

for (const [id, def] of Object.entries(BUILDINGS)) {
  def.emoji = def.icon;
  def.icon = `{b:${id}}`;
}

export const BUILD_ORDER = ['campfire', 'bed', 'chest', 'workbench', 'crystal_lamp', 'hut', 'gazebo', 'cabin', 'stone_house'];

// İnşa edilebilir yapılar.
//
//   footprint : yerleştirme kontrolü için yarıçap (m)
//   colliders : yerel uzayda çarpışma şekilleri (circle / box)
//   platforms : üzerine çıkılabilen yüzeyler (kulübe tabanı, basamak) — top: tabana göre yükseklik
//   station   : üretim istasyonu kimliği (recipes.js → station)
//   storage   : sandık slot sayısı

export const BUILDINGS = {
  campfire: {
    name: 'Kamp Ateşi', icon: '🔥', category: 'base',
    desc: 'Isınmak, pişirmek ve geceyi aydınlatmak için. Yakınında yemek pişirebilirsin.',
    cost: { wood: 5, stone: 5 },
    footprint: 0.9, maxSlope: 0.7, xp: 20,
    colliders: [{ type: 'circle', x: 0, z: 0, r: 0.6 }],
    station: 'campfire', light: true,
    interact: { action: 'Pişir', panel: 'crafting', station: 'campfire' },
  },
  hut: {
    name: 'Küçük Kulübe', icon: '🛖', category: 'base',
    desc: 'Geceyi güvenle geçirebileceğin basit bir barınak. İçinde uyuyarak sabahı bekleyebilirsin.',
    cost: { wood: 20, stone: 10, fiber: 8 },
    footprint: 2.3, maxSlope: 0.55, xp: 60,
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
    interact: { action: 'Uyu', handler: 'sleep' },
    cameraBlocker: true,
  },
  chest: {
    name: 'Sandık', icon: '📦', category: 'storage',
    desc: 'Eşyalarını saklamak için 20 slotluk ahşap sandık.',
    cost: { wood: 12, fiber: 4 },
    footprint: 0.7, maxSlope: 0.8, xp: 20,
    colliders: [{ type: 'box', x: 0, z: 0, hw: 0.55, hd: 0.38 }],
    storage: 20,
    interact: { action: 'Aç', panel: 'container' },
  },
  workbench: {
    name: 'Çalışma Masası', icon: '🛠️', category: 'crafting',
    desc: 'Daha gelişmiş aletler ve ekipmanlar üretmeni sağlar.',
    cost: { wood: 15, stone: 6, fiber: 4 },
    footprint: 1.1, maxSlope: 0.8, xp: 30,
    colliders: [{ type: 'box', x: 0, z: 0, hw: 0.85, hd: 0.45 }],
    station: 'workbench',
    interact: { action: 'Kullan', panel: 'crafting', station: 'workbench' },
  },
};

export const BUILD_ORDER = ['campfire', 'hut', 'chest', 'workbench'];

// Adadaki hayvanlar. Hepsi pasiftir: otlar, dolaşır, vurulunca kaçar.
// Öldürülen hayvan yere yığılır; bıçakla parçalanınca `harvest` tablosundaki ganimeti verir.
//
//   hp        : can
//   speed     : yürüme hızı (m/s) · fleeSpeed: kaçma hızı
//   radius    : çarpışma yarıçapı · height: hedefleme yüksekliği · length: yerde yatarken boyu
//   regions   : doğabileceği bölgeler · herds: [sürü sayısı, sürüdeki en az, en çok] (yoğunluk bilerek düşük)
//   harvest   : bıçakla parçalayınca düşenler (LootSystem.rollDrops)
//   respawn   : ölen hayvanın yerine yenisinin gelme süresi (s)
//   skittish  : oyuncu bu mesafeye girince (koşmasa bile) kaçar

export const ANIMALS = {
  cow: {
    name: 'İnek', icon: '🐄', hp: 45, speed: 1.0, fleeSpeed: 4.4, radius: 0.75, height: 1.55, length: 2.2,
    regions: ['meadow'], herds: [2, 2, 3],
    harvest: [{ item: 'raw_meat', min: 3, max: 4 }, { item: 'hide', min: 2, max: 3 }],
    xp: 25, respawn: 540, sound: 'moo', butcherAction: 'Derisini Yüz',
  },
  sheep: {
    name: 'Koyun', icon: '🐑', hp: 26, speed: 1.1, fleeSpeed: 4.8, radius: 0.55, height: 1.15, length: 1.4,
    regions: ['meadow', 'mountain'], herds: [3, 2, 3],
    harvest: [{ item: 'wool', min: 2, max: 3 }, { item: 'raw_meat', min: 1, max: 2 }],
    xp: 18, respawn: 420, sound: 'baa', butcherAction: 'Yününü Al',
  },
  chicken: {
    name: 'Tavuk', icon: '🐔', hp: 8, speed: 1.3, fleeSpeed: 5.2, radius: 0.28, height: 0.75, length: 0.6,
    regions: ['meadow', 'beach', 'forest'], herds: [3, 2, 2], skittish: 2.6,
    harvest: [{ item: 'raw_meat', min: 1, max: 1 }, { item: 'feather', min: 2, max: 4 }],
    xp: 8, respawn: 300, sound: 'cluck', butcherAction: 'Tüyünü Yolup Parçala',
  },
};

for (const [id, def] of Object.entries(ANIMALS)) {
  def.emoji = def.icon;
  def.icon = `{a:${id}}`;
}

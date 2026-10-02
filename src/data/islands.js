// Takımadanın adaları. Her ada sabit bir tohumla üretilir, böylece her oyuncu aynı haritayı görür.
// Adalar dünyada gerçek konumlarında durur (center); aralarında tekneyle yelken açılır.
// Ada içindeki tüm konumlar (dağ, göl, önemli noktalar) adanın merkezine göredir.
//
//   biome     : tropical | desert | ice | volcano (arazi, renk, bitki örtüsü, bölgeler)
//   order     : keşif sırası — bir adanın haritası önceki adanın boss'undan düşer
//   chart     : bu adanın konumunu gösteren seyir haritası eşyası
//   arrival   : tekneyle yaklaşılan sahil (spawnAngle) — rotalar buraya çizilir

export const ISLANDS = {
  novera: {
    id: 'novera',
    name: 'Novera Adası',
    biome: 'tropical', order: 0, center: { x: 0, z: 0 },
    seed: 1337,
    radius: 150, // kıyı çizgisinin ortalama yarıçapı (m)
    // Ana zirve + iki yan omuz. Profil: (1 - r/radius)^power → etekler yumuşak, zirve sarp.
    mountain: {
      peaks: [
        { x: 10, z: -78, height: 140, radius: 82, power: 2 },
        { x: -38, z: -62, height: 58, radius: 48, power: 1.8 },
        { x: 58, z: -96, height: 48, radius: 42, power: 1.8 },
      ],
    },
    lake: { x: 52, z: 6, radius: 11 },
    spawnAngle: Math.PI / 2, // güney sahili (+z)
    // Önemli noktalar: açı (radyan, kıyı tabanlı) veya doğrudan x/z
    landmarks: {
      wreck: { angle: Math.PI / 2 + 0.11, inland: -2 },
      old_camp: { x: -58, z: -8 },
      rune_wave: { angle: 0.08, inland: 9 },
      rune_root: { x: -96, z: 40 },
      rune_flame: { x: 62, z: -50 },
      sealed_door: { x: 8, z: -22 },
      cave_entrance: { x: -74.5, z: -63 },
      miner_camp: { x: -14, z: -53, cave: true },
      guardian_altar: { x: -112, z: 6 },
    },
    // Araziyi belirli bir noktanın yüksekliğinde düzleştiren alanlar (ör. kapının önündeki teras)
    flatten: [
      { x: 8, z: -15, r: 7, falloff: 15, heightAt: { x: 8, z: -21 } },
      { x: -76.5, z: -63, r: 5.5, falloff: 8, heightAt: { x: -76, z: -63 } }, // mağara girişi ve önü
    ],
    // Mağara: dağın altında, yüzeyden ayrı kapalı bir alan. Odalar (daire) ve tüneller (kapsül) birleşimi.
    // Konumlar haritada dağın altına denk gelecek şekilde seçildi; derinlik `baseY`.
    cave: {
      baseY: -60,
      entrance: { x: -74.5, z: -63, yaw: -Math.PI / 2 }, // yüzeydeki giriş (batıya bakar)
      spawn: { x: -64, z: -63 }, // içeri girince belirilen nokta
      exit: { x: -68.5, z: -63 }, // dışarı çıkış (ışık huzmesi)
      chambers: [
        { id: 'entry', x: -63, z: -63, r: 7.5, h: 6 },
        { id: 'hall', x: -38, z: -72, r: 13, h: 11 },
        { id: 'deep', x: -14, z: -56, r: 11, h: 8.5 },
        { id: 'grotto', x: -35, z: -96, r: 7.5, h: 5.5 },
      ],
      tunnels: [
        { from: [-60, -64], to: [-47, -70], r: 2.8, h: 4.4 },
        { from: [-30, -66], to: [-21, -59], r: 2.9, h: 4.6 },
        { from: [-37, -82], to: [-35, -90], r: 2.5, h: 4.0 },
      ],
    },
  },
  desert: {
    id: 'desert',
    name: 'Çöl Adası',
    subtitle: 'Kavurucu kumlar, zehirli akrepler ve Kum Kralı\'nın tapınağı',
    biome: 'desert', order: 1, center: { x: -520, z: 620 }, chart: 'chart_desert',
    seed: 2024,
    radius: 125,
    mountain: { peaks: [] },
    // kızıl kaya platoları (basamaklı, dik yamaçlı)
    mesas: [
      { x: -38, z: -40, r: 30, h: 22 },
      { x: 42, z: -55, r: 17, h: 15 },
      { x: -62, z: 42, r: 13, h: 11 },
    ],
    lake: { x: 32, z: 24, radius: 9, oasis: true }, // vaha (tatlı su)
    spawnAngle: -0.87, // Novera'ya bakan kuzeydoğu sahili
    landmarks: {
      sand_temple: { x: -6, z: 46 },
      desert_ruins: { x: 18, z: -18 },
    },
    flatten: [
      { x: -6, z: 46, r: 14, falloff: 12 }, // tapınak meydanı (boss arenası)
      { x: 18, z: -18, r: 6, falloff: 8 },
    ],
  },
  ice: {
    id: 'ice',
    name: 'Buz Adası',
    subtitle: 'Dondurucu soğuk — ateşten uzak kalma ya da kürk giy',
    biome: 'ice', order: 2, center: { x: -800, z: -260 }, chart: 'chart_ice',
    seed: 777,
    radius: 130,
    mountain: {
      peaks: [
        { x: -28, z: -45, height: 78, radius: 62, power: 1.7 },
        { x: 36, z: -62, height: 40, radius: 36, power: 1.6 },
      ],
    },
    lake: { x: 42, z: 36, radius: 14, frozen: true },
    spawnAngle: 1.26, // çöl adasına bakan güney sahili
    landmarks: {
      frost_altar: { x: -12, z: 30 },
      frozen_camp: { x: 62, z: -8 },
    },
    flatten: [
      { x: -12, z: 30, r: 14, falloff: 12 },
      { x: 62, z: -8, r: 6, falloff: 8 },
    ],
  },
  volcano: {
    id: 'volcano',
    name: 'Volkan Adası',
    subtitle: 'Lav nehirleri, kükürt dumanı ve Lav Golemi\'nin krateri',
    biome: 'volcano', order: 3, center: { x: -180, z: -900 }, chart: 'chart_volcano',
    seed: 666,
    radius: 140,
    mountain: { peaks: [{ x: 0, z: -12, height: 112, radius: 100, power: 1.4 }] },
    crater: { x: 0, z: -12, r: 22, depth: 28 },
    lavaAngles: [0.5, 2.6, 4.6],
    lavaPools: [
      { x: 70, z: 62, r: 6 },
      { x: -84, z: -38, r: 5 },
    ],
    spawnAngle: 2.34, // buz adasına bakan güneybatı sahili
    landmarks: {
      fire_altar: { x: 8, z: 82 },
      obsidian_shrine: { x: -30, z: 105 },
    },
    flatten: [
      { x: 8, z: 82, r: 14, falloff: 12 },
      { x: -30, z: 105, r: 6, falloff: 8 },
    ],
  },
};

export const ISLAND_ORDER = ['novera', 'desert', 'ice', 'volcano'];

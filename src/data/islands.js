// Ada tanımları. İlk sürümde tek ada var; yeni adalar (volkan, buz, çöl…) buraya eklenecek.
// Ada sabit bir tohumla üretilir, böylece her oyuncu aynı tasarlanmış haritayı görür.

export const ISLANDS = {
  novera: {
    id: 'novera',
    name: 'Novera Adası',
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
};

// Ufukta görünen (henüz ulaşılamayan) adalar — gelecekteki tekne sisteminin habercisi
export const DISTANT_ISLANDS = [
  { id: 'volcano', name: 'Volkan Adası', x: 620, z: -520, radius: 150, height: 120, color: '#5b4a46', smoke: true },
  { id: 'ice', name: 'Buz Adası', x: -700, z: -420, radius: 130, height: 80, color: '#cfd8e6' },
  { id: 'desert', name: 'Çöl Adası', x: -560, z: 640, radius: 120, height: 30, color: '#d9b77a' },
];

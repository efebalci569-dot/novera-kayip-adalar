// Yeni adalardaki saldırgan canlılar. Yaklaşınca saldırır, uzaklaşınca bir süre kovalar,
// sonra yuvasına döner. Öldürülünce ganimet doğrudan avcının envanterine geçer.
//
//   hp / damage           : can ve vuruş hasarı (zorluk çarpanı uygulanır)
//   speed / chaseSpeed    : dolaşma ve kovalama hızı (m/s)
//   radius / height       : çarpışma yarıçapı ve hedefleme yüksekliği
//   attackRange / Time    : saldırı mesafesi ve iki saldırı arası süre (s)
//   windup                : saldırıdan önceki hazırlanma (oyuncu kaçabilsin diye)
//   aggro / leash         : fark etme mesafesi ve en fazla kovalama mesafesi (yuvadan)
//   ranged                : uzaktan saldırı (mermi türü)
//   poison / burn / chill : vuruşun ek etkisi (zehir, yanık, üşüme)
//   spawn                 : { regions, count (grup sayısı), group: [en az, en çok] }
//   loot                  : öldürene düşen ganimet (LootSystem.rollDrops)

export const ENEMIES = {
  // ── Çöl ───────────────────────────────────────────────────
  scorpion: {
    name: 'Çöl Akrebi', icon: '🦂', island: 'desert',
    hp: 40, damage: 9, speed: 1.5, chaseSpeed: 4.2, radius: 0.7, height: 0.8,
    attackRange: 1.8, attackTime: 1.2, windup: 0.45, aggro: 13, leash: 32, xp: 30, poison: true,
    spawn: { regions: ['d_dunes'], count: 8, group: [1, 2] },
    loot: [{ item: 'stinger', min: 1, max: 1, chance: 0.75 }, { item: 'chitin', min: 1, max: 2 }],
    respawn: 240, sound: 'hiss',
  },
  hyena: {
    name: 'Çöl Sırtlanı', icon: '🐾', island: 'desert',
    hp: 55, damage: 11, speed: 1.4, chaseSpeed: 5.0, radius: 0.6, height: 1.1,
    attackRange: 1.9, attackTime: 1.25, windup: 0.35, aggro: 19, leash: 40, xp: 40,
    spawn: { regions: ['d_dunes', 'd_beach'], count: 5, group: [2, 3] },
    loot: [{ item: 'raw_meat', min: 1, max: 2 }, { item: 'bone', min: 1, max: 2 }, { item: 'hide', min: 1, max: 1, chance: 0.6 }],
    respawn: 300, sound: 'laugh',
  },
  // ── Buz ───────────────────────────────────────────────────
  wolf: {
    name: 'Kar Kurdu', icon: '🐾', island: 'ice',
    hp: 70, damage: 14, speed: 1.5, chaseSpeed: 5.5, radius: 0.65, height: 1.1,
    attackRange: 2.0, attackTime: 1.15, windup: 0.35, aggro: 22, leash: 45, xp: 55, chill: true,
    spawn: { regions: ['i_forest', 'i_tundra'], count: 8, group: [2, 3] },
    loot: [{ item: 'fur', min: 1, max: 2 }, { item: 'fang', min: 1, max: 1, chance: 0.6 }, { item: 'raw_meat', min: 1, max: 2 }],
    respawn: 300, sound: 'growl',
  },
  ice_wisp: {
    name: 'Buz Cini', icon: '❄️', island: 'ice',
    hp: 60, damage: 12, speed: 1.1, chaseSpeed: 3.4, radius: 0.6, height: 1.8,
    attackRange: 11, ranged: 'ice', attackTime: 2.4, windup: 0.8, aggro: 18, leash: 34, xp: 60, float: true, chill: true,
    spawn: { regions: ['i_tundra', 'i_peak'], count: 7, group: [1, 2] },
    loot: [{ item: 'frost_core', min: 1, max: 1, chance: 0.75 }, { item: 'ice_crystal', min: 1, max: 2 }],
    respawn: 320, sound: 'chime',
  },
  // ── Volkan ────────────────────────────────────────────────
  lava_slime: {
    name: 'Lav Balçığı', icon: '🔥', island: 'volcano',
    hp: 85, damage: 16, speed: 1.0, chaseSpeed: 3.0, radius: 0.85, height: 1.1,
    attackRange: 1.9, attackTime: 1.4, windup: 0.5, aggro: 14, leash: 30, xp: 70, burn: true,
    spawn: { regions: ['v_ash', 'v_slope'], count: 8, group: [1, 3] },
    loot: [{ item: 'magma_core', min: 1, max: 1, chance: 0.75 }, { item: 'sulfur', min: 1, max: 2, chance: 0.5 }],
    respawn: 300, sound: 'blob',
  },
  salamander: {
    name: 'Ateş Kertenkelesi', icon: '🔥', island: 'volcano',
    hp: 95, damage: 18, speed: 1.6, chaseSpeed: 5.0, radius: 0.7, height: 0.8,
    attackRange: 2.1, attackTime: 1.2, windup: 0.4, aggro: 20, leash: 40, xp: 85, burn: true,
    spawn: { regions: ['v_ash', 'v_beach'], count: 6, group: [1, 2] },
    loot: [{ item: 'fire_scale', min: 1, max: 2 }, { item: 'raw_meat', min: 1, max: 1 }],
    respawn: 320, sound: 'hiss',
  },
};

for (const [id, def] of Object.entries(ENEMIES)) {
  def.emoji = def.icon;
  def.icon = `{e:${id}}`;
}

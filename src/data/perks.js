// Yetenekler. Her seviye atlamada 1 yetenek puanı kazanılır.
// effect değerleri rütbe başınadır; ProgressionSystem.bonus(key) toplamı döndürür.

export const PERKS = {
  gatherer: {
    name: 'Toplayıcı', icon: '🌾', maxRank: 5,
    desc: 'Kaynak toplarken ekstra kaynak şansı +%10.',
    effect: { extraYield: 0.1 },
  },
  lumberjack: {
    name: 'Oduncu', icon: '🪓', maxRank: 5,
    desc: 'Ağaçlara verilen hasar +%20.',
    effect: { treeDamage: 0.2 },
  },
  miner: {
    name: 'Madenci', icon: '⛏️', maxRank: 5,
    desc: 'Kayalara verilen hasar +%20, ekstra taş şansı +%10.',
    effect: { rockDamage: 0.2, rockYield: 0.1 },
  },
  explorer: {
    name: 'Kaşif', icon: '🧭', maxRank: 5,
    desc: 'Maksimum enerji +%15, koşma hızı +%4.',
    effect: { stamina: 0.15, runSpeed: 0.04 },
  },
  survivor: {
    name: 'Hayatta Kalan', icon: '🔥', maxRank: 5,
    desc: 'Açlık ve susuzluk %8 daha yavaş azalır.',
    effect: { decay: 0.08 },
  },
  vitality: {
    name: 'Dayanıklılık', icon: '❤️', maxRank: 5,
    desc: 'Maksimum can +10.',
    effect: { maxHealth: 10 },
  },
  warrior: {
    name: 'Savaşçı', icon: '⚔️', maxRank: 5,
    desc: 'Avlanırken (ve ileride savaşta) verilen hasar +%10.',
    effect: { damage: 0.1 },
  },
  craftsman: {
    name: 'Zanaatkâr', icon: '🔨', maxRank: 5,
    desc: 'Aletler %12 daha az aşınır.',
    effect: { durability: 0.12 },
  },
};

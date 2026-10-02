// Her adanın muhafızı (boss). Sunağına çağırma eşyası konunca uyanır; yenilince bir sonraki
// adanın seyir haritasını düşürür. Saldırılar yere çizilen uyarı halkalarıyla önceden belli olur.
//
//   altar    : uyandığı sunak (data/landmarks.js)
//   summon   : sunağa konan eşya (data/items.js)
//   attacks  : saldırı sırası — slam (çevresine vurur), sweep (önündeki yay), roots/tail (oyuncunun
//              altından), burrow (kuma dalıp altından çıkar), boulder (kaya fırlatır),
//              meteor (gökten ateş yağar), pools (lav birikintileri), summon (yardımcı çağırır)
//   minion   : summon saldırısında çağrılan düşman (data/enemies.js)
//   reward   : yenilince herkese verilen eşyalar; reveal → konumu açılan ada

export const BOSSES = {
  guardian: {
    name: 'Orman Muhafızı', title: 'Kadim Ağaçların Bekçisi', icon: '🌳', island: 'novera',
    altar: 'guardian_altar', summon: 'forest_heart', color: '#7be35a',
    hp: 900, damage: 20, speed: 2.4, radius: 1.7, height: 6.5, xp: 600,
    attacks: ['slam', 'roots', 'sweep', 'roots'],
    reward: { items: { chart_desert: 1, crystal: 3, rope: 4 }, reveal: 'desert' },
    intro: 'Toprak sarsılıyor… ağaçların arasından dev bir gölge doğruluyor!',
  },
  sand_king: {
    name: 'Kum Kralı', title: 'Çöl Tapınağının Hükümdarı', icon: '👑', island: 'desert',
    altar: 'sand_temple', summon: 'scorpion_sigil', color: '#ffb347',
    hp: 1500, damage: 28, speed: 3.4, radius: 2.3, height: 3.0, xp: 1000,
    attacks: ['tail', 'sweep', 'burrow', 'summon', 'tail'], minion: 'scorpion',
    reward: { items: { chart_ice: 1, copper_ingot: 4, chitin: 4 }, reveal: 'ice' },
    intro: 'Kumlar kaynamaya başladı… tapınağın altından devasa bir akrep yükseliyor!',
  },
  frost_giant: {
    name: 'Buz Devi', title: 'Buzulun Uyuyan Devi', icon: '❄️', island: 'ice',
    altar: 'frost_altar', summon: 'frost_heart', color: '#7fdcff',
    hp: 2200, damage: 36, speed: 2.6, radius: 2.1, height: 7.5, xp: 1500,
    attacks: ['slam', 'boulder', 'sweep', 'summon', 'boulder'], minion: 'wolf',
    reward: { items: { chart_volcano: 1, frost_core: 3, fur: 4, iron_ingot: 3 }, reveal: 'volcano' },
    intro: 'Buz çatlıyor… sunağın ardında uyuyan dev gözlerini açtı!',
  },
  lava_golem: {
    name: 'Lav Golemi', title: 'Volkanın Ateşten Kalbi', icon: '🌋', island: 'volcano',
    altar: 'fire_altar', summon: 'fire_sigil', color: '#ff6a1f',
    hp: 3200, damage: 44, speed: 2.4, radius: 2.5, height: 8, xp: 2500,
    attacks: ['slam', 'meteor', 'pools', 'summon', 'sweep', 'meteor'], minion: 'lava_slime',
    reward: { items: { lava_heart: 1, obsidian: 6, magma_core: 4 }, final: true },
    intro: 'Volkan gürlüyor… lavın içinden ateşten bir dev yükseliyor!',
  },
};

export const BOSS_ORDER = ['guardian', 'sand_king', 'frost_giant', 'lava_golem'];

for (const [id, def] of Object.entries(BOSSES)) {
  def.emoji = def.icon;
  def.icon = `{x:${id}}`;
}

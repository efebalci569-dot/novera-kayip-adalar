// Önemli noktalar (keşif ve hikâye). Konumlar data/islands.js içinde, ada başına tanımlıdır.
//
//   discoverRadius : bu mesafeye girince "keşfedildi" sayılır (XP + bildirim)
//   action         : [E] etkileşim metni
//   lore           : etkileşimde açılan not (data/lore.js)
//   gives          : ilk etkileşimde verilen eşyalar
//   requires       : etkileşim için gereken eşyalar (tüketilir)
//   hiddenOnMap    : bayrak açılana kadar haritada gösterilmez

export const LANDMARKS = {
  wreck: {
    name: 'Gemi Enkazı', icon: '⚓', discoverRadius: 16,
    action: 'Enkazı Ara', actionAgain: 'Seyir Defterini Oku', lore: 'ship_log',
  },
  old_camp: {
    name: 'Terk Edilmiş Kamp', icon: '⛺', discoverRadius: 16,
    action: 'Notu Oku', actionAgain: 'Notu Tekrar Oku', lore: 'castaway_note', setsFlag: 'runes_revealed',
  },
  rune_wave: {
    name: 'Dalga Sembolü', icon: '🌊', discoverRadius: 10, glyph: 'wave',
    action: 'Sembolü İncele', lore: 'rune_wave', gives: { rune_shard: 1 }, hiddenOnMap: 'runes_revealed',
  },
  rune_root: {
    name: 'Kök Sembolü', icon: '🌱', discoverRadius: 10, glyph: 'root',
    action: 'Sembolü İncele', lore: 'rune_root', gives: { rune_shard: 1 }, hiddenOnMap: 'runes_revealed',
  },
  rune_flame: {
    name: 'Alev Sembolü', icon: '🔥', discoverRadius: 10, glyph: 'flame',
    action: 'Sembolü İncele', lore: 'rune_flame', gives: { rune_shard: 1 }, hiddenOnMap: 'runes_revealed',
  },
  sealed_door: {
    name: 'Mühürlü Kapı', icon: '🚪', discoverRadius: 18,
    action: 'Kapıyı İncele', actionAgain: 'Kapıya Bak', lore: 'sealed_door', requires: { rune_shard: 3 },
  },
};

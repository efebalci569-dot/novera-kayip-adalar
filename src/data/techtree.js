// Teknoloji ağacı. `unlockedBy` koşulu sağlandığında düğüm açılır.
// `future: true` olanlar ileriki güncellemelerde gelecek içeriklerdir (ağaçta "Yakında" görünür).

export const TECH_TREE = [
  { id: 'stone_tools', name: 'Taş Aletler', icon: '🪓', tier: 0, col: 1, requires: [], unlockedBy: { quest: 'q_axe' }, desc: 'Taş balta ve taş kazma.' },
  { id: 'fire', name: 'Ateş', icon: '🔥', tier: 1, col: 1, requires: ['stone_tools'], unlockedBy: { quest: 'q_campfire' }, desc: 'Kamp ateşi, meşale.' },
  { id: 'cooking', name: 'Yemek Pişirme', icon: '🍢', tier: 2, col: 0, requires: ['fire'], unlockedBy: { quest: 'q_cook' }, desc: 'Pişmiş balık, meyve şiş.' },
  { id: 'shelter', name: 'Barınak', icon: '🛖', tier: 2, col: 2, requires: ['fire'], unlockedBy: { quest: 'q_shelter' }, desc: 'Küçük kulübe, uyku.' },
  { id: 'storage', name: 'Depolama', icon: '📦', tier: 3, col: 2, requires: ['shelter'], unlockedBy: { quest: 'q_first_night' }, desc: 'Sandıklar.' },
  { id: 'workbench', name: 'Çalışma Masası', icon: '🛠️', tier: 3, col: 1, requires: ['shelter'], unlockedBy: { quest: 'q_workbench' }, desc: 'Mızrak ve gelişmiş eşyalar.' },
  { id: 'hunting', name: 'Avcılık', icon: '🔪', tier: 2, col: 1, requires: ['fire'], unlockedBy: { quest: 'q_hunt' }, desc: 'Taş bıçak, et, deri, yün, tüy.' },
  { id: 'bed', name: 'Yatak', icon: '🛏️', tier: 3, col: 0, requires: ['hunting'], unlockedBy: { quest: 'q_bed' }, desc: 'Yün battaniye ve yatak; uyuyarak sabahı bekle.' },
  { id: 'gear', name: 'Sırt Çantaları', icon: '🎒', tier: 4, col: 0, requires: ['workbench'], unlockedBy: { recipe: 'fiber_backpack' }, desc: 'Daha büyük envanter.' },
  { id: 'homes', name: 'Yeni Barınaklar', icon: '🏡', tier: 4, col: 2, requires: ['shelter'], unlockedBy: { level: 5 }, desc: 'Saz Çardak (Sv 2), Ahşap Kulübe (Sv 5), Taş Ev (Sv 9).' },
  { id: 'raft', name: 'Sal', icon: '🛶', tier: 5, col: 2, requires: ['workbench'], unlockedBy: { level: 4 }, desc: 'Seviye 4: halatla bağlanmış sal.' },
  { id: 'mining', name: 'Madencilik', icon: '⛏️', tier: 5, col: 1, requires: ['workbench'], unlockedBy: { quest: 'q_cave_ore' }, desc: 'Mağara: kömür, demir cevheri, kristal.' },
  { id: 'boats', name: 'Yelkenli Tekne', icon: '⛵', tier: 6, col: 2, requires: ['raft'], unlockedBy: { level: 8 }, desc: 'Seviye 8: hızlı tekne. Yeni adalar yakında.' },
  { id: 'furnace', name: 'Fırın', icon: '🧱', tier: 6, col: 1, requires: ['mining'], future: true, desc: 'Cevher eritme.' },
  { id: 'farming', name: 'Tarım', icon: '🌱', tier: 5, col: 0, requires: ['workbench'], future: true, desc: 'Buğday, havuç, patates, mısır.' },
  { id: 'iron', name: 'Demir İşleme', icon: '⚙️', tier: 7, col: 1, requires: ['furnace'], future: true, desc: 'Demir külçe.' },
  { id: 'iron_tools', name: 'Demir Aletler', icon: '🗡️', tier: 8, col: 0, requires: ['iron'], future: true, desc: 'Demir balta, kazma, kılıç, zırh.' },
  { id: 'islands', name: 'Yeni Adalar', icon: '🌋', tier: 8, col: 2, requires: ['boats'], future: true, desc: 'Volkan, buz ve çöl adaları.' },
  { id: 'smithy', name: 'Demirci', icon: '⚒️', tier: 9, col: 1, requires: ['iron_tools'], future: true, desc: 'Gelişmiş metal işleri.' },
  { id: 'steel', name: 'Çelik', icon: '🛡️', tier: 10, col: 1, requires: ['smithy'], future: true, desc: 'Çelik aletler ve zırhlar.' },
  { id: 'workshop', name: 'Gelişmiş Atölye', icon: '🏭', tier: 11, col: 1, requires: ['steel'], future: true, desc: 'Özel ekipmanlar.' },
  { id: 'crystal', name: 'Kristal Teknolojisi', icon: '🔮', tier: 12, col: 1, requires: ['workshop'], future: true, desc: 'Kristal kazma ve silahlar.' },
];

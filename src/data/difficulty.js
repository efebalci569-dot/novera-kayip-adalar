// Zorluk modları. Dünya oluşturulurken seçilir ve kayıtla birlikte saklanır
// (çok oyunculuda odayı kuranın zorluğu herkese uygulanır).
//
//   decay       : açlık/susuzluğun azalma hızı çarpanı
//   damage      : alınan tüm hasar (düşme, açlık, çiğ yemek…) çarpanı
//   regen       : tok/susuz değilken can yenilenme hızı çarpanı
//   xp          : kazanılan deneyim çarpanı
//   deathDrop   : ölünce envanter, öldüğün yerde bir çuvala düşer
//   permadeath  : tek can — ölünce bir daha canlanılmaz

export const DIFFICULTIES = {
  easy: {
    name: 'Kolay', icon: '🌴', color: '#7ddc72',
    desc: 'Rahat keşif. Açlık ve susuzluk yavaş azalır, aldığın hasar azdır, daha çok deneyim kazanırsın. Ölünce eşyaların sende kalır.',
    decay: 0.6, damage: 0.6, regen: 1.6, xp: 1.25, deathDrop: false, permadeath: false,
  },
  normal: {
    name: 'Normal', icon: '🏝️', color: '#ffc857',
    desc: 'Dengeli hayatta kalma. Yemek ve suyu ihmal etme. Ölünce eşyaların sende kalır.',
    decay: 1, damage: 1, regen: 1, xp: 1, deathDrop: false, permadeath: false,
  },
  hard: {
    name: 'Zor', icon: '🔥', color: '#ff8a4c',
    desc: 'Çok daha hızlı acıkır ve susarsın, daha çok hasar alır, daha yavaş iyileşirsin. Ölünce eşyaların öldüğün yerde bir çuvala düşer.',
    decay: 1.75, damage: 1.35, regen: 0.6, xp: 1.1, deathDrop: true, permadeath: false,
  },
  hardcore: {
    name: 'Hardcore', icon: '💀', color: '#ff5b5b',
    desc: 'Zor modun bütün kuralları + tek can. Ölürsen bir daha canlanamazsın: tek kişilikte dünya silinir, çok oyunculuda izleyici olursun.',
    decay: 1.75, damage: 1.35, regen: 0.6, xp: 1.3, deathDrop: true, permadeath: true,
  },
};

export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard', 'hardcore'];

export function difficultyDef(id) {
  return DIFFICULTIES[id] ?? DIFFICULTIES.normal;
}

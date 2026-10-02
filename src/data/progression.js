// Seviye ve deneyim (XP) ayarları.

export const MAX_LEVEL = 50;

/** Bir sonraki seviyeye geçmek için gereken XP. */
export function xpForLevel(level) {
  return Math.round(40 + 30 * Math.pow(level - 1, 1.5));
}

// Etkinlik başına XP (tarif ve yapılar kendi xp değerlerini taşır)
export const XP_REWARDS = {
  regionDiscovered: 25,
  landmarkDiscovered: 40,
  drink: 1,
};

// Seviye atlama ekranında gösterilecek ek mesajlar
export const LEVEL_MESSAGES = {
  2: 'Yetenek puanı kazandın! [K] ile yeteneklerini geliştir. Yeni: Saz Çardak, Halat',
  3: 'Yeni: Olta, Lif Sırt Çantası',
  4: 'Yeni: Sal — çalışma masasında üret, suya indir!',
  5: 'Yeni barınak: Ahşap Kulübe',
  6: 'Yeni: Kristal Fener, Dokuma Sırt Çantası',
  8: 'Yeni: Yelkenli Tekne!',
  9: 'Yeni barınak: Taş Ev',
};

export const BASE_INVENTORY_SIZE = 10;
export const HOTBAR_SIZE = 5;

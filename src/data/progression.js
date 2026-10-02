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
  2: 'Yetenek puanı kazandın! [K] ile yeteneklerini geliştir.',
};

export const BASE_INVENTORY_SIZE = 10;
export const HOTBAR_SIZE = 5;

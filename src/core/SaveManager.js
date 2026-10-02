// Tarayıcı tabanlı yerel kayıt (localStorage). Kayıt formatı sürümlüdür;
// ileride bulut kaydı eklenirse yalnızca bu modül değişir.

const SAVE_KEY = 'novera.save.v2';
const GUEST_KEY = 'novera.guest.v1'; // çok oyunculuda misafir karakteri (envanter, seviye, görevler)
const DEAD_KEY = 'novera.hardcore.dead'; // hardcore'da öldüğün çok oyunculu dünyalar
export const SAVE_VERSION = 2; // dünya düzeni değişince artır (eski kayıtlar yüklenmez)

export class SaveManager {
  static hasSave() {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  static load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== SAVE_VERSION) return null;
      return data;
    } catch (err) {
      console.warn('Kayıt okunamadı:', err);
      return null;
    }
  }

  static save(data) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, version: SAVE_VERSION, savedAt: Date.now() }));
      return true;
    } catch (err) {
      console.warn('Kayıt yazılamadı:', err);
      return false;
    }
  }

  static clear() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* yoksay */
    }
  }

  /** Ana menüde "Devam Et" altında gösterilecek özet. */
  static summary() {
    const data = SaveManager.load();
    if (!data) return null;
    return {
      day: data.time?.day ?? 1,
      level: data.progression?.level ?? 1,
      difficulty: data.state?.difficulty ?? 'normal',
      savedAt: data.savedAt ? new Date(data.savedAt) : null,
    };
  }

  static saveGuest(data) {
    try {
      localStorage.setItem(GUEST_KEY, JSON.stringify({ ...data, version: SAVE_VERSION, savedAt: Date.now() }));
      return true;
    } catch (err) {
      console.warn('Misafir kaydı yazılamadı:', err);
      return false;
    }
  }

  static loadGuest() {
    try {
      const data = JSON.parse(localStorage.getItem(GUEST_KEY) || 'null');
      return data && data.version === SAVE_VERSION ? data : null;
    } catch {
      return null;
    }
  }

  /** Hardcore: bu dünyada (misafir olarak) öldün — tekrar katılınca izleyici olursun. */
  static markDeadIn(worldId) {
    if (!worldId) return;
    try {
      const list = JSON.parse(localStorage.getItem(DEAD_KEY) || '[]').filter((id) => id !== worldId);
      list.push(worldId);
      localStorage.setItem(DEAD_KEY, JSON.stringify(list.slice(-50)));
    } catch {
      /* yoksay */
    }
  }

  static isDeadIn(worldId) {
    if (!worldId) return false;
    try {
      return JSON.parse(localStorage.getItem(DEAD_KEY) || '[]').includes(worldId);
    } catch {
      return false;
    }
  }

  static clearGuest() {
    try {
      localStorage.removeItem(GUEST_KEY);
    } catch {
      /* yoksay */
    }
  }
}

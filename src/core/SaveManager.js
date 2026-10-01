// Tarayıcı tabanlı yerel kayıt (localStorage). Kayıt formatı sürümlüdür;
// ileride bulut kaydı eklenirse yalnızca bu modül değişir.

const SAVE_KEY = 'novera.save.v2';
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
      savedAt: data.savedAt ? new Date(data.savedAt) : null,
    };
  }
}

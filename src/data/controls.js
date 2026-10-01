// Varsayılan tuş atamaları. Ayarlar menüsünden değiştirilebilir (Settings.bindings).
// Fare tuşları 'Mouse0' (sol), 'Mouse1' (orta), 'Mouse2' (sağ) olarak kodlanır.

export const ACTIONS = {
  forward: { label: 'İleri', keys: ['KeyW', 'ArrowUp'] },
  backward: { label: 'Geri', keys: ['KeyS', 'ArrowDown'] },
  left: { label: 'Sol', keys: ['KeyA', 'ArrowLeft'] },
  right: { label: 'Sağ', keys: ['KeyD', 'ArrowRight'] },
  run: { label: 'Koş', keys: ['ShiftLeft', 'ShiftRight'] },
  jump: { label: 'Zıpla', keys: ['Space'] },
  interact: { label: 'Etkileşim', keys: ['KeyE'] },
  primary: { label: 'Vur / Kullan', keys: ['Mouse0'] },
  secondary: { label: 'Alternatif Kullanım (ye/iç)', keys: ['Mouse2'] },
  inventory: { label: 'Envanter', keys: ['KeyI', 'Tab'] },
  crafting: { label: 'Üretim', keys: ['KeyC'] },
  building: { label: 'İnşa', keys: ['KeyB'] },
  journal: { label: 'Görev Günlüğü', keys: ['KeyJ'] },
  map: { label: 'Harita', keys: ['KeyM'] },
  skills: { label: 'Yetenekler', keys: ['KeyK'] },
  techtree: { label: 'Teknoloji Ağacı', keys: ['KeyT'] },
  rotate: { label: 'Yapıyı Döndür', keys: ['KeyR'] },
  camera: { label: 'Kamera (1. / 3. şahıs)', keys: ['KeyV'] },
  hotbar1: { label: 'Hızlı Slot 1', keys: ['Digit1'] },
  hotbar2: { label: 'Hızlı Slot 2', keys: ['Digit2'] },
  hotbar3: { label: 'Hızlı Slot 3', keys: ['Digit3'] },
  hotbar4: { label: 'Hızlı Slot 4', keys: ['Digit4'] },
  hotbar5: { label: 'Hızlı Slot 5', keys: ['Digit5'] },
};

export function defaultBindings() {
  const out = {};
  for (const [id, a] of Object.entries(ACTIONS)) out[id] = [...a.keys];
  return out;
}

const KEY_NAMES = {
  Mouse0: 'Sol Tık', Mouse1: 'Orta Tık', Mouse2: 'Sağ Tık',
  Space: 'Boşluk', ShiftLeft: 'Shift', ShiftRight: 'Sağ Shift', ControlLeft: 'Ctrl', ControlRight: 'Sağ Ctrl',
  AltLeft: 'Alt', AltRight: 'AltGr', Tab: 'Tab', Enter: 'Enter', Backspace: 'Geri Sil', CapsLock: 'Caps',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc',
};

export function keyLabel(code) {
  if (!code) return '—';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

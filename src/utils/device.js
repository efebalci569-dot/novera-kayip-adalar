// Cihaz algılama: dokunmatik telefon/tablet (iPad dahil) ve tam ekran yardımcıları.

/** Dokunmatik ekranlı mobil cihaz mı? (iPadOS kendini "MacIntel" olarak tanıtır; dokunma noktasından anlaşılır.) */
export function isTouchDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const points = navigator.maxTouchPoints ?? 0;
  if (points <= 0 && !('ontouchstart' in window)) return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches || window.matchMedia?.('(hover: none)').matches;
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(navigator.userAgent ?? '');
  const iPadOS = navigator.platform === 'MacIntel' && points > 1;
  return !!(coarse || mobileUA || iPadOS);
}

/** Küçük ekranlı telefon mu? (tabletlerden ayırmak için) */
export function isPhone() {
  if (!isTouchDevice()) return false;
  return Math.min(window.screen?.width ?? 9999, window.screen?.height ?? 9999) < 600;
}

export function fullscreenSupported() {
  const el = document.documentElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

/** Tam ekrana geç (kullanıcı dokunuşu içinde çağrılmalı). Desteklenmiyorsa sessizce geçer. */
export function enterFullscreen() {
  if (isFullscreen()) return;
  const el = document.documentElement;
  try {
    const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.();
    Promise.resolve(p).catch(() => {});
  } catch {
    /* desteklenmiyor */
  }
}

export function exitFullscreen() {
  try {
    const p = document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen?.();
    Promise.resolve(p).catch(() => {});
  } catch {
    /* yoksay */
  }
}

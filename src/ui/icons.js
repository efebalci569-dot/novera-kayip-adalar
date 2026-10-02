// Arayüz ikonları: elle çizilmiş, sade SVG simgeler (emoji yerine).
// Her ikon 24×24 görünüm kutusunda; çizgiler currentColor ile boyanır, bazılarının varsayılan rengi vardır.
// Eşya, yapı ve hayvan ikonları ise 3B modellerden üretilir (bkz. ItemIcons.js).

const S = 'fill="currentColor" stroke="none"';

export const ICONS = {
  heart: { color: '#ff5f63', svg: `<path ${S} d="M12 21s-7.2-4.5-9.4-8.8C1 9 2.8 5.3 6.4 5.1c2.1-.1 3.6 1 4.6 2.5 1-1.5 2.5-2.6 4.6-2.5 3.6.2 5.4 3.9 3.8 7.1C19.2 16.5 12 21 12 21z"/>` },
  hunger: { color: '#ffa94d', svg: `<ellipse ${S} cx="14.6" cy="9.4" rx="6.6" ry="5.2" transform="rotate(-42 14.6 9.4)"/><path d="M10 14 5.8 18.2"/><circle ${S} cx="4.6" cy="17.2" r="1.9"/><circle ${S} cx="6.8" cy="19.4" r="1.9"/>` },
  droplet: { color: '#4dabf7', svg: `<path ${S} d="M12 2.6s6.6 7.3 6.6 11.7a6.6 6.6 0 0 1-13.2 0C5.4 9.9 12 2.6 12 2.6z"/>` },
  bolt: { color: '#ffd43b', svg: `<path ${S} d="M13.4 2 4.6 13.6h6.2L9.8 22l8.8-11.6h-6.2z"/>` },
  shield: { color: '#9fb4c8', svg: `<path d="M12 3l8 3v6c0 4.6-3.4 7.9-8 9-4.6-1.1-8-4.4-8-9V6z"/><path d="M12 7v10"/>` },
  swords: { color: '#e9ecef', svg: `<path d="M4 4l11 11M4 4h4M4 4v4M20 4 9 15M20 4h-4M20 4v4M6.5 17.5l-2.5 2.5M17.5 17.5l2.5 2.5M8 14l2 2M16 14l-2 2"/>` },
  globe: { svg: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>` },
  lock: { svg: `<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path d="M12 14.5v2.5"/>` },
  unlock: { color: '#ffd866', svg: `<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.8"/><path d="M12 14.5v2.5"/>` },
  skull: { svg: `<path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.2 4.4 3 5.5V20h10v-3.5c1.8-1.1 3-2.9 3-5.5a8 8 0 0 0-8-8z"/><circle ${S} cx="9" cy="11.5" r="1.9"/><circle ${S} cx="15" cy="11.5" r="1.9"/><path d="M10.5 20v-2.2M13.5 20v-2.2"/>` },
  backpack: { color: '#e0c38a', svg: `<rect x="5" y="7" width="14" height="14" rx="3"/><path d="M9 7V5a3 3 0 0 1 6 0v2M8 13h8M8 13v3"/>` },
  flame: { color: '#ff8a3d', svg: `<path ${S} d="M12 2.4c1.1 3.6 5.6 5.9 5.6 11.1a5.6 5.6 0 0 1-11.2 0c0-2.7 1.4-4.3 2.6-5.6.3 2.1 1.2 3.1 2.2 3.4C10.4 8 11.5 5.4 12 2.4z"/>` },
  box: { color: '#d9b07a', svg: `<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>` },
  save: { svg: `<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>` },
  scroll: { color: '#ead9ab', svg: `<path d="M7 3h11a2 2 0 0 1 0 4h-1v12a2 2 0 0 1-2 2H6a2 2 0 0 1 0-4h1z"/><path d="M10 9h4M10 12h4M10 15h3"/>` },
  user: { svg: `<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.4-6.5 8-6.5s7 2 8 6.5"/>` },
  logout: { svg: `<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9.5 8 5.5 12l4 4M5.5 12h11"/>` },
  boat: { color: '#e9ecef', svg: `<path d="M12 3v13M12 3l7 12h-7M11 6 5.5 15H11"/><path ${S} d="M3 17.5h18l-2.6 3.5H5.6z"/>` },
  sparkle: { color: '#ffd866', svg: `<path ${S} d="M12 2.5l2 5.5 5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2z"/><path ${S} d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>` },
  bed: { svg: `<path d="M3 18V7M3 13h18v5M21 18v-2.5M3 18h18"/><rect x="5.5" y="9.5" width="5" height="3.5" rx="1"/>` },
  ghost: { color: '#d8e6ff', svg: `<path d="M5 21V10a7 7 0 0 1 14 0v11l-2.3-2-2.4 2-2.3-2-2.3 2-2.4-2z"/><circle ${S} cx="9.5" cy="10.5" r="1.3"/><circle ${S} cx="14.5" cy="10.5" r="1.3"/>` },
  hammer: { color: '#d9c49a', svg: `<path d="M14.5 3.5 20.5 9.5 18 12 12 6z"/><path d="M13 7.5 3.5 17a1.8 1.8 0 0 0 2.5 2.5L15.5 10"/>` },
  waves: { color: '#74c0fc', svg: `<path d="M2 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>` },
  check: { color: '#7ddc72', svg: `<path d="M4 12.5 9.5 18 20 6.5"/>` },
  play: { svg: `<path ${S} d="M7 4.5v15l12.5-7.5z"/>` },
  keyboard: { svg: `<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h.01M10.5 10h.01M14.5 10h.01M18 10h.01M7.5 14h9"/>` },
  sunrise: { color: '#ffb347', svg: `<path d="M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0M12 4v4M4.9 9.9l1.5 1.5M19.1 9.9l-1.5 1.5"/>` },
  moon: { color: '#c3cdff', svg: `<path ${S} d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6z"/>` },
  sun: { color: '#ffd43b', svg: `<circle ${S} cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>` },
  island: { color: '#7ddc72', svg: `<path d="M3 19.5c3-1.6 15-1.6 18 0"/><path d="M12 18.5V9M12 9c-1-2.5-4-3.5-7-2.5M12 9c1-2.5 4-3.5 7-2.5M12 9c-2.5-.5-5 1-6 3.5M12 9c2.5-.5 5 1 6 3.5"/>` },
  sprout: { color: '#7ddc72', svg: `<path d="M12 21v-9M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 12c0-3 2.5-5 6-5 0 3-2.5 5-6 5z"/>` },
  book: { color: '#8fc6ff', svg: `<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>` },
  bulb: { color: '#ffe066', svg: `<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>` },
  gear: { svg: `<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="6.6"/><path d="M12 2.5v2.9M12 18.6v2.9M2.5 12h2.9M18.6 12h2.9M5.3 5.3l2 2M16.7 16.7l2 2M5.3 18.7l2-2M16.7 7.3l2-2"/>` },
  warning: { color: '#ffc857', svg: `<path d="M12 3.5 2.5 20h19z"/><path d="M12 9.5v4.5M12 17h.01"/>` },
  plug: { svg: `<path d="M9 2.5v4.5M15 2.5v4.5M6 7h12v4a6 6 0 0 1-12 0zM12 17v4.5"/>` },
  plus: { color: '#7ddc72', svg: `<path d="M12 5v14M5 12h14"/>` },
  minus: { color: '#ff8a7a', svg: `<path d="M5 12h14"/>` },
  male: { color: '#74c0fc', svg: `<circle cx="10" cy="14" r="5.5"/><path d="M14 10l6-6M15 4h5v5"/>` },
  female: { color: '#f783ac', svg: `<circle cx="12" cy="9" r="5.5"/><path d="M12 14.5V22M8.5 18.5h7"/>` },
  anchor: { svg: `<circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13a7 7 0 0 0 14 0M8.5 10h7"/>` },
  tent: { color: '#e0b874', svg: `<path d="M12 4 3 20h18zM12 4v16M9 20l3-6 3 6"/>` },
  door: { color: '#c9a46a', svg: `<rect x="6" y="3" width="12" height="18" rx="1"/><path d="M14.5 12h.01"/>` },
  cave: { color: '#8a8f99', svg: `<path d="M2.5 20.5c0-6.5 4.2-12.5 9.5-12.5s9.5 6 9.5 12.5z"/><path ${S} d="M8 20.5c0-3.3 1.8-6 4-6s4 2.7 4 6z"/>` },
  wheat: { color: '#e9c46a', svg: `<path d="M12 21V8M12 8c-2-1-3-3-3-5 2 0 3 2 3 5zM12 8c2-1 3-3 3-5-2 0-3 2-3 5zM12 13c-2-1-3.5-3-3.5-5 2 0 3.5 2 3.5 5zM12 13c2-1 3.5-3 3.5-5-2 0-3.5 2-3.5 5z"/>` },
  compass: { svg: `<circle cx="12" cy="12" r="9"/><path ${S} d="M15.6 8.4 13.6 13.6 8.4 15.6 10.4 10.4z"/>` },
  bricks: { color: '#d08a5a', svg: `<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 9.7h18M3 14.3h18M9 5v4.7M15 9.7v4.6M9 14.3V19"/>` },
  dagger: { svg: `<path d="M19.5 4.5 9 15M19.5 4.5h-3.5M19.5 4.5V8M7 12.5l4.5 4.5M5.5 18.5l2.5-2.5"/>` },
  volcano: { color: '#ff7043', svg: `<path d="M2 20.5 8.5 10h7L22 20.5z"/><path d="M10 6.5c0-2 1-3.5 2-3.5s2 1.5 2 3.5"/>` },
  anvil: { svg: `<path d="M3.5 7.5h12c0 2.6 2 4 5 4v2h-6l2 4.5H7.5l2-4.5H3.5z"/>` },
  orb: { color: '#c08bff', svg: `<circle cx="12" cy="10" r="7"/><path d="M7 20.5h10M8.5 17h7"/><path d="M9.5 8a3 3 0 0 1 3-2.5"/>` },
  question: { svg: `<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>` },
  storm: { color: '#a5b4c8', svg: `<path d="M7 15a4.5 4.5 0 0 1 .5-9A6 6 0 0 1 19 9a3.5 3.5 0 0 1-1 6H7z"/><path d="M12 15l-2 4h3l-1.5 3"/>` },
  star: { color: '#ffd43b', svg: `<path ${S} d="M12 2.8l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17l-5.6 3 1.1-6.2L3 9.4l6.2-.9z"/>` },
  crown: { color: '#ffc857', svg: `<path ${S} d="M3 8.5l4.5 3.8L12 5l4.5 7.3L21 8.5 19 19H5z"/>` },
  map: { color: '#a8d5a2', svg: `<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>` },
  dice: { svg: `<rect x="4" y="4" width="16" height="16" rx="3"/><circle ${S} cx="9" cy="9" r="1.3"/><circle ${S} cx="15" cy="15" r="1.3"/><circle ${S} cx="15" cy="9" r="1.3"/><circle ${S} cx="9" cy="15" r="1.3"/>` },
  key: { color: '#ffd866', svg: `<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l2 2M15 8l2 2"/>` },
  clipboard: { svg: `<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM8.5 11h7M8.5 15h5"/>` },
  speaker: { svg: `<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>` },
  monitor: { svg: `<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>` },
  mouse: { svg: `<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v4"/>` },
  tree: { color: '#69b84a', svg: `<path d="M12 21v-6M12 15c-4 0-7-2.5-7-6a7 7 0 0 1 14 0c0 3.5-3 6-7 6z"/>` },
  pin: { color: '#ffc857', svg: `<path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>` },
  chat: { svg: `<path d="M4 5h16v11H9l-5 4z"/>` },
  copy: { svg: `<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>` },
  reset: { svg: `<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5"/>` },
  arrowLeft: { svg: `<path d="M19 12H5M11 6l-6 6 6 6"/>` },
  arrowRight: { svg: `<path d="M5 12h14M13 6l6 6-6 6"/>` },
  newgame: { color: '#ffd866', svg: `<path ${S} d="M12 2.8l2.3 6.9H21l-5.5 4 2.1 6.7L12 16.3l-5.6 4.1 2.1-6.7-5.5-4h6.7z"/>` },
  eye: { svg: `<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>` },
  paw: { color: '#d9b07a', svg: `<circle ${S} cx="7" cy="9" r="2"/><circle ${S} cx="11" cy="6" r="2"/><circle ${S} cx="15.5" cy="7" r="2"/><circle ${S} cx="18.5" cy="11" r="1.8"/><path ${S} d="M12.5 11c3 0 5 3.5 4.5 6-.4 2-2.4 2.5-4.5 1.6-1.6-.7-2.6-.7-4 0-2 .9-3.6-.4-3.4-2.5.3-2.6 3.4-5.1 7.4-5.1z"/>` },
  fang: { color: '#ff6b6b', svg: `<path d="M4 5c4 0 6 2 8 2s4-2 8-2"/><path ${S} d="M7 6.5l2 8 2-7.5zM13 7l2 7.5 2-8z"/>` },
  boss: { color: '#ff6b6b', svg: `<path ${S} d="M12 2.5c4.4 0 8 3.4 8 7.8 0 2.6-1.3 4.5-3.2 5.7V20H7.2v-4C5.3 14.8 4 12.9 4 10.3c0-4.4 3.6-7.8 8-7.8z"/><path stroke="#1a1012" d="M8 10.5l3 1.5M16 10.5l-3 1.5M10.5 20v-2M13.5 20v-2"/>` },
  sword: { color: '#e9ecef', svg: `<path d="M19.5 4.5 9 15M19.5 4.5H16M19.5 4.5V8M7 12.5l4.5 4.5M5.5 18.5l2.5-2.5"/>` },
  snowflake: { color: '#a5e3ff', svg: `<path d="M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10M9.5 3.5 12 6l2.5-2.5M9.5 20.5 12 18l2.5 2.5"/>` },
  thermo: { color: '#ff8a5c', svg: `<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 9v7"/>` },
  cactus: { color: '#7cbf5a', svg: `<path d="M10 21V5a2 2 0 0 1 4 0v16M14 11h2a2 2 0 0 0 2-2V7M10 13H8a2 2 0 0 1-2-2V9M7 21h10"/>` },
};

/** SVG ikon öğesi. size: px, color: varsayılan rengin yerine. */
export function svgIcon(name, { size = null, color = null, cls = '' } = {}) {
  const def = ICONS[name] ?? ICONS.question;
  const span = document.createElement('span');
  span.className = `ri svg ${cls}`.trim();
  const c = color ?? def.color;
  if (c) span.style.color = c;
  if (size) {
    span.style.width = `${size}px`;
    span.style.height = `${size}px`;
  }
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${def.svg}</svg>`;
  return span;
}

const dataUrlCache = new Map();
/** Tuvale (harita) çizmek için ikonun resim adresi. */
export function svgDataURL(name, color = null) {
  const key = `${name}|${color}`;
  if (dataUrlCache.has(key)) return dataUrlCache.get(key);
  const def = ICONS[name] ?? ICONS.question;
  const c = color ?? def.color ?? '#ffffff';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" color="${c}">${def.svg.replaceAll('currentColor', c)}</svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  dataUrlCache.set(key, url);
  return url;
}

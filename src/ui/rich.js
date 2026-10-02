import { svgIcon, svgDataURL } from './icons.js';
import { iconImg, iconURL } from './ItemIcons.js';

// Metinlerdeki emojileri ve ikon belirteçlerini (ör. "{i:wood}") özel ikonlara çevirir.
// Tüm arayüz metni h() üzerinden buradan geçer; böylece ekranda hiç emoji kalmaz.
//   {i:wood} eşya · {b:hut} yapı · {a:cow} hayvan · {e:scorpion} düşman · {x:guardian} boss · {s:heart} SVG

const KIND = { i: 'item', b: 'building', a: 'animal', e: 'enemy', x: 'boss', s: 'svg' };

const EMOJI = {
  '❤': 'svg:heart', '🍖': 'svg:hunger', '💧': 'svg:droplet', '⚡': 'svg:bolt', '🛡': 'svg:shield', '⚔': 'svg:swords',
  '🌐': 'svg:globe', '🔒': 'svg:lock', '🔓': 'svg:unlock', '💀': 'svg:skull', '☠': 'svg:skull', '🎒': 'svg:backpack',
  '🔥': 'svg:flame', '📦': 'svg:box', '💾': 'svg:save', '📜': 'svg:scroll', '📝': 'svg:scroll', '👤': 'svg:user',
  '⏏': 'svg:logout', '⛵': 'svg:boat', '✨': 'svg:sparkle', '💫': 'svg:sparkle', '🛏': 'svg:bed', '👻': 'svg:ghost',
  '🛠': 'svg:hammer', '🏗': 'svg:hammer', '🔨': 'svg:hammer', '⚒': 'svg:hammer', '🌊': 'svg:waves', '✔': 'svg:check',
  '✅': 'svg:check', '▶': 'svg:play', '⌨': 'svg:keyboard', '🌅': 'svg:sunrise', '🌙': 'svg:moon', '☀': 'svg:sun',
  '🏝': 'svg:island', '🌴': 'svg:island', '🌱': 'svg:sprout', '📘': 'svg:book', '📖': 'svg:book', '💡': 'svg:bulb',
  '⚙': 'svg:gear', '⚠': 'svg:warning', '🔌': 'svg:plug', '➕': 'svg:plus', '➖': 'svg:minus', '♂': 'svg:male',
  '♀': 'svg:female', '⚓': 'svg:anchor', '⛺': 'svg:tent', '🚪': 'svg:door', '🕳': 'svg:cave', '🌾': 'svg:wheat',
  '🧭': 'svg:compass', '🧱': 'svg:bricks', '🗡': 'svg:dagger', '🌋': 'svg:volcano', '🏭': 'svg:anvil', '🔮': 'svg:orb',
  '❔': 'svg:question', '❓': 'svg:question', '⛈': 'svg:storm', '★': 'svg:star', '⭐': 'svg:star', '👑': 'svg:crown',
  '🗺': 'svg:map', '🎲': 'svg:dice', '🔑': 'svg:key', '📋': 'svg:clipboard', '🔊': 'svg:speaker', '🖥': 'svg:monitor',
  '🖱': 'svg:mouse', '🌳': 'svg:tree', '❄': 'svg:snowflake', '🌡': 'svg:thermo', '🌵': 'svg:cactus', '🐾': 'svg:paw',
  '📍': 'svg:pin', '💬': 'svg:chat', '👁': 'svg:eye', '🏜': 'svg:cactus', '🧊': 'svg:snowflake', '🦂': 'enemy:scorpion',
  // eşyalar
  '🪵': 'item:wood', '🪨': 'item:stone', '🌿': 'item:fiber', '🍃': 'item:vine', '🪢': 'item:rope', '🟫': 'item:hide',
  '🧶': 'item:wool', '🪶': 'item:feather', '🧣': 'item:wool_blanket', '⚫': 'item:coal', '🔩': 'item:iron_ore',
  '💎': 'item:crystal', '🫐': 'item:berries', '🥥': 'item:coconut', '🐟': 'item:raw_fish', '🍢': 'item:cooked_fish',
  '🍡': 'item:berry_skewer', '🥩': 'item:raw_meat', '🍄': 'item:cave_mushroom', '🪓': 'item:stone_axe',
  '⛏': 'item:stone_pickaxe', '🔦': 'item:torch', '🔪': 'item:stone_knife', '🔱': 'item:stone_spear', '🎣': 'item:fishing_rod',
  '🛶': 'item:raft', '🩹': 'item:bandage', '💠': 'item:rune_shard',
  // yapılar ve hayvanlar
  '🛖': 'building:hut', '🏡': 'building:cabin', '🏠': 'building:stone_house', '⛱': 'building:gazebo', '🏮': 'building:crystal_lamp',
  '🐄': 'animal:cow', '🐑': 'animal:sheep', '🐔': 'animal:chicken',
};

const MATCH = /\{([a-z]):([a-z0-9_]+)\}|\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*️?/gu;
const QUICK = /[{←-⯿\u{1f000}-\u{1faff}]/u;

function resolve(match, kindChar, id) {
  if (kindChar) return `${KIND[kindChar] ?? kindChar}:${id}`;
  return EMOJI[match.replace(/️/g, '')] ?? null;
}

/** 'svg:heart' / 'item:wood' gibi bir tanımdan ikon öğesi. */
export function iconFor(spec, cls = '') {
  if (!spec) return null;
  const i = spec.indexOf(':');
  const kind = spec.slice(0, i);
  const id = spec.slice(i + 1);
  if (kind === 'svg') return svgIcon(id, { cls });
  return iconImg(kind, id, cls);
}

/** Tuvale çizim için ikon resim adresi. */
export function iconSpecURL(spec) {
  if (!spec) return null;
  const i = spec.indexOf(':');
  const kind = spec.slice(0, i);
  const id = spec.slice(i + 1);
  return kind === 'svg' ? svgDataURL(id) : iconURL(kind, id);
}

/** Metindeki ilk emojinin/belirtecin ikon tanımı (ör. harita işaretleri için). */
export function specOf(text) {
  const s = String(text ?? '');
  MATCH.lastIndex = 0;
  const m = MATCH.exec(s);
  MATCH.lastIndex = 0;
  return m ? resolve(m[0], m[1], m[2]) : null;
}

/** Metni ikonlu düğümlere çevirir. */
export function richNodes(text) {
  const s = String(text);
  if (!QUICK.test(s)) return [document.createTextNode(s)];
  const out = [];
  let buf = '';
  let last = 0;
  for (const m of s.matchAll(MATCH)) {
    buf += s.slice(last, m.index);
    last = m.index + m[0].length;
    const el = iconFor(resolve(m[0], m[1], m[2]));
    if (el) {
      if (buf) out.push(document.createTextNode(buf));
      buf = '';
      out.push(el);
    } else if (s[last] === ' ' && (buf === '' || buf.endsWith(' '))) {
      last++; // tanınmayan emoji: sil, fazladan boşluk kalmasın
    }
  }
  buf += s.slice(last);
  if (buf) out.push(document.createTextNode(buf));
  return out;
}

/** textContent yerine: emojileri ikonlara çevirerek yazar. */
export function setRich(el, text) {
  el.replaceChildren(...richNodes(text));
}

/** Emojisiz/belirteçsiz düz metin (başlıklar, tuval yazıları için). */
export function plainText(text) {
  return String(text ?? '').replace(MATCH, '').replace(/\s{2,}/g, ' ').trim();
}

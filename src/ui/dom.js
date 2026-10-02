import { ITEMS } from '../data/items.js';
import { keyLabel } from '../data/controls.js';

/** Küçük DOM yardımcısı: h('div', { class: 'x', onclick }, ...çocuklar) */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function kbd(code) {
  return h('span', { class: 'kbd' }, keyLabel(code));
}

/** Bir slot öğesini yığın verisine göre doldurur. */
export function renderSlot(el, stack, { key = null, selected = false, extraClass = '' } = {}) {
  el.className = `slot ${extraClass}`;
  el.replaceChildren();
  el.removeAttribute('title');
  if (key) el.append(h('span', { class: 'key' }, key));
  if (stack) {
    const def = ITEMS[stack.id];
    if (def) {
      el.classList.add(`rarity-${def.rarity ?? 'common'}`);
      el.append(h('span', { class: 'icon' }, def.icon));
      if (stack.count > 1) el.append(h('span', { class: 'count' }, stack.count));
      if (stack.dur !== undefined && def.durability) {
        const pct = Math.max(0, Math.min(1, stack.dur / def.durability));
        const color = pct > 0.5 ? '#7ddc72' : pct > 0.2 ? '#f2d24a' : '#ff6b5b';
        el.append(h('div', { class: 'dur' }, h('div', { style: { width: `${pct * 100}%`, background: color } })));
      }
      el.title = def.name;
    }
  }
  if (selected) el.classList.add('selected');
  return el;
}

export function itemChip(id, n, have = null) {
  const def = ITEMS[id];
  const cls = have === null ? 'chip' : `chip ${have >= n ? 'have' : 'miss'}`;
  const label = have === null ? `${def?.icon ?? ''} ${n} ${def?.name ?? id}` : `${def?.icon ?? ''} ${have}/${n} ${def?.name ?? id}`;
  return h('span', { class: cls }, label);
}

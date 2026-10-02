import { ITEMS } from '../data/items.js';

/**
 * Slot tabanlı envanter. Oyuncu envanteri ve sandıklar aynı sınıfı kullanır.
 * Bir slot: null | { id, count, dur? }   (dur: aletlerin kalan dayanıklılığı)
 */
export class Inventory {
  constructor(size, bus, id = 'player') {
    this.id = id;
    this.bus = bus;
    this.slots = new Array(size).fill(null);
  }

  get size() {
    return this.slots.length;
  }

  static maxStack(id) {
    return ITEMS[id]?.maxStack ?? 50;
  }

  static makeStack(id, count, dur) {
    const stack = { id, count };
    const durability = ITEMS[id]?.durability;
    if (durability) stack.dur = dur ?? durability;
    return stack;
  }

  changed() {
    this.bus?.emit('inventory:changed', { inventory: this });
  }

  /** Eşya ekler; sığmayan miktarı döndürür. */
  add(id, count = 1, dur) {
    if (!ITEMS[id] || count <= 0) return count;
    const max = Inventory.maxStack(id);
    let left = count;
    if (max > 1) {
      for (const s of this.slots) {
        if (!left) break;
        if (s && s.id === id && s.count < max) {
          const n = Math.min(max - s.count, left);
          s.count += n;
          left -= n;
        }
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i]) continue;
      const n = Math.min(max, left);
      this.slots[i] = Inventory.makeStack(id, n, dur);
      left -= n;
    }
    if (left !== count) this.changed();
    return left;
  }

  canAdd(id, count = 1) {
    const max = Inventory.maxStack(id);
    let space = 0;
    for (const s of this.slots) {
      if (!s) space += max;
      else if (s.id === id && max > 1) space += max - s.count;
      if (space >= count) return true;
    }
    return space >= count;
  }

  count(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  has(map) {
    for (const [id, n] of Object.entries(map)) if (this.count(id) < n) return false;
    return true;
  }

  /** Belirtilen miktarı kaldırır (hızlı slotları korumak için sondan başlar). */
  remove(id, count = 1) {
    if (this.count(id) < count) return false;
    let left = count;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const n = Math.min(s.count, left);
      s.count -= n;
      left -= n;
      if (s.count <= 0) this.slots[i] = null;
    }
    this.changed();
    return true;
  }

  removeMap(map) {
    if (!this.has(map)) return false;
    for (const [id, n] of Object.entries(map)) this.remove(id, n);
    return true;
  }

  removeAt(index, count = Infinity) {
    const s = this.slots[index];
    if (!s) return null;
    const n = Math.min(count, s.count);
    const taken = { ...s, count: n };
    s.count -= n;
    if (s.count <= 0) this.slots[index] = null;
    this.changed();
    return taken;
  }

  /** Belirli bir alet türü için en iyi aleti bulur (en yüksek kademe/güç). */
  /** En iyi alet (minTier: en az bu kademede olmalı). */
  findBestTool(type, minTier = 0) {
    let best = -1;
    let bestScore = -1;
    this.slots.forEach((s, i) => {
      const tool = s && ITEMS[s.id]?.tool;
      if (!tool || tool.type !== type || tool.tier < minTier) return;
      const score = tool.tier * 10 + tool.power;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return best;
  }

  /** Alet aşınması. Alet kırıldıysa eşya kimliğini döndürür. */
  wear(index, amount = 1) {
    const s = this.slots[index];
    if (!s || s.dur === undefined) return null;
    s.dur -= amount;
    if (s.dur <= 0) {
      this.slots[index] = null;
      this.changed();
      return s.id;
    }
    this.changed();
    return null;
  }

  resize(size) {
    if (size <= this.slots.length) return;
    while (this.slots.length < size) this.slots.push(null);
    this.changed();
  }

  /** İki slot arasında taşı/birleştir/yer değiştir (aynı ya da farklı envanterler). */
  static move(src, i, dst, j) {
    const a = src.slots[i];
    if (!a) return;
    const b = dst.slots[j];
    if (src === dst && i === j) return;
    if (!b) {
      dst.slots[j] = a;
      src.slots[i] = null;
    } else if (b.id === a.id && Inventory.maxStack(a.id) > 1) {
      const max = Inventory.maxStack(a.id);
      const n = Math.min(max - b.count, a.count);
      b.count += n;
      a.count -= n;
      if (a.count <= 0) src.slots[i] = null;
    } else {
      dst.slots[j] = a;
      src.slots[i] = b;
    }
    src.changed();
    if (dst !== src) dst.changed();
  }

  /** Bir slotu karşı envantere hızlıca aktarır (shift+tık). */
  static quickTransfer(src, i, dst) {
    const s = src.slots[i];
    if (!s) return;
    const left = dst.add(s.id, s.count, s.dur);
    if (left <= 0) src.slots[i] = null;
    else s.count = left;
    src.changed();
  }

  serialize() {
    return this.slots.map((s) => (s ? { ...s } : null));
  }

  deserialize(slots, size) {
    this.slots = new Array(Math.max(size ?? this.slots.length, slots?.length ?? 0)).fill(null);
    (slots ?? []).forEach((s, i) => {
      if (s && ITEMS[s.id]) this.slots[i] = { ...s };
    });
    this.changed();
  }
}

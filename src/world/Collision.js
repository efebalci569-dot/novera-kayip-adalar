// 2D (XZ düzleminde) statik çarpışma dünyası: daireler (ağaç gövdesi, kaya) ve
// döndürülmüş kutular (duvarlar). Uzamsal ızgara ile hızlı sorgulanır.
// Katmanlar: 'surface' (ada yüzeyi) ve 'cave' (dağın altındaki mağara) aynı XZ alanını
// paylaşsa da birbirini etkilemez.

export class CollisionWorld {
  constructor(cellSize = 8) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.platforms = [];
    this._result = new Set();
  }

  key(ix, iz) {
    return ix * 73856093 ^ iz * 19349663;
  }

  insert(collider) {
    const { minX, maxX, minZ, maxZ } = this.bounds(collider);
    const cs = this.cellSize;
    collider._cells = [];
    for (let ix = Math.floor(minX / cs); ix <= Math.floor(maxX / cs); ix++) {
      for (let iz = Math.floor(minZ / cs); iz <= Math.floor(maxZ / cs); iz++) {
        const k = this.key(ix, iz);
        let cell = this.cells.get(k);
        if (!cell) this.cells.set(k, (cell = []));
        cell.push(collider);
        collider._cells.push(k);
      }
    }
    return collider;
  }

  bounds(c) {
    if (c.type === 'circle') return { minX: c.x - c.r, maxX: c.x + c.r, minZ: c.z - c.r, maxZ: c.z + c.r };
    const ext = Math.hypot(c.hw, c.hd);
    return { minX: c.x - ext, maxX: c.x + ext, minZ: c.z - ext, maxZ: c.z + ext };
  }

  addCircle(x, z, r, owner = null, layer = 'surface') {
    return this.insert({ type: 'circle', x, z, r, owner, enabled: true, layer });
  }

  /** hw/hd: yarı genişlik/derinlik, rot: Y ekseni etrafında dönüş. */
  addBox(x, z, hw, hd, rot = 0, owner = null, height = Infinity, layer = 'surface') {
    return this.insert({ type: 'box', x, z, hw, hd, rot, cos: Math.cos(rot), sin: Math.sin(rot), owner, enabled: true, height, layer });
  }

  remove(collider) {
    if (!collider?._cells) return;
    for (const k of collider._cells) {
      const cell = this.cells.get(k);
      if (!cell) continue;
      const i = cell.indexOf(collider);
      if (i >= 0) cell.splice(i, 1);
    }
    collider._cells = null;
  }

  query(x, z, radius, layer = 'surface') {
    const out = this._result;
    out.clear();
    const cs = this.cellSize;
    for (let ix = Math.floor((x - radius) / cs); ix <= Math.floor((x + radius) / cs); ix++) {
      for (let iz = Math.floor((z - radius) / cs); iz <= Math.floor((z + radius) / cs); iz++) {
        const cell = this.cells.get(this.key(ix, iz));
        if (cell) for (const c of cell) if (c.enabled && c.layer === layer) out.add(c);
      }
    }
    return out;
  }

  /** Daire şeklindeki bir gövdeyi (oyuncu, hayvan) çarpıştırıcıların dışına iter. */
  resolveCircle(pos, radius, feetY = -Infinity, layer = 'surface') {
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      for (const c of this.query(pos.x, pos.z, radius + 2, layer)) {
        if (c.minY !== undefined && feetY > c.top) continue;
        if (c.type === 'circle') {
          const dx = pos.x - c.x;
          const dz = pos.z - c.z;
          const d = Math.hypot(dx, dz);
          const min = radius + c.r;
          if (d < min) {
            const nx = d > 1e-5 ? dx / d : 1;
            const nz = d > 1e-5 ? dz / d : 0;
            pos.x = c.x + nx * min;
            pos.z = c.z + nz * min;
            hit = true;
          }
        } else if (this.pushOutOfBox(pos, radius, c)) {
          hit = true;
        }
      }
    }
    return hit;
  }

  pushOutOfBox(pos, radius, c) {
    // noktayı kutunun yerel uzayına taşı
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const lx = dx * c.cos - dz * c.sin;
    const lz = dx * c.sin + dz * c.cos;
    const cx = Math.max(-c.hw, Math.min(c.hw, lx));
    const cz = Math.max(-c.hd, Math.min(c.hd, lz));
    let ox = lx - cx;
    let oz = lz - cz;
    let d = Math.hypot(ox, oz);
    if (d >= radius) return false;
    let nlx, nlz;
    if (d < 1e-5) {
      // merkez kutunun içinde: en kısa eksenden dışarı it
      const px = c.hw - Math.abs(lx);
      const pz = c.hd - Math.abs(lz);
      if (px < pz) { nlx = Math.sign(lx) || 1; nlz = 0; d = -px; }
      else { nlx = 0; nlz = Math.sign(lz) || 1; d = -pz; }
    } else {
      nlx = ox / d;
      nlz = oz / d;
    }
    const push = radius - d;
    const plx = lx + nlx * push;
    const plz = lz + nlz * push;
    // dünya uzayına geri dön (ters dönüş)
    pos.x = c.x + plx * c.cos + plz * c.sin;
    pos.z = c.z - plx * c.sin + plz * c.cos;
    return true;
  }

  /** Yerleştirme kontrolü: verilen daire herhangi bir çarpıştırıcıyla kesişiyor mu? */
  overlapsCircle(x, z, radius, layer = 'surface') {
    for (const c of this.query(x, z, radius + 3, layer)) {
      if (c.type === 'circle') {
        if (Math.hypot(x - c.x, z - c.z) < radius + c.r) return true;
      } else {
        const p = { x, z };
        if (this.pushOutOfBox(p, radius, c)) return true;
      }
    }
    return false;
  }

  /**
   * Döndürülmüş bir dikdörtgenle (yapı tabanı) kesişen ilk çarpıştırıcıyı döndürür.
   * rect: { x, z, hw, hd, rot } · skip(c) true dönerse o çarpıştırıcı yok sayılır.
   */
  findRectOverlap(rect, layer = 'surface', skip = null) {
    const ext = Math.hypot(rect.hw, rect.hd);
    for (const c of this.query(rect.x, rect.z, ext + 3, layer)) {
      if (skip?.(c)) continue;
      if (c.type === 'circle' ? circleHitsRect(c.x, c.z, c.r, rect) : boxHitsRect(c, rect)) return c;
    }
    return null;
  }

  // ── Platformlar (kulübe tabanı gibi üzerine çıkılabilen yüzeyler) ──
  addPlatform(x, z, hw, hd, rot, top, owner = null) {
    const p = { x, z, hw, hd, rot, cos: Math.cos(rot), sin: Math.sin(rot), top, owner };
    this.platforms.push(p);
    return p;
  }

  removePlatform(p) {
    const i = this.platforms.indexOf(p);
    if (i >= 0) this.platforms.splice(i, 1);
  }

  /** (x,z) noktasında, `maxY` altında kalan en yüksek platform yüzeyi. */
  platformHeight(x, z, maxY) {
    let best = -Infinity;
    for (const p of this.platforms) {
      const dx = x - p.x;
      const dz = z - p.z;
      const lx = dx * p.cos - dz * p.sin;
      const lz = dx * p.sin + dz * p.cos;
      if (Math.abs(lx) <= p.hw && Math.abs(lz) <= p.hd && p.top <= maxY && p.top > best) best = p.top;
    }
    return best;
  }
}

// ── Şekil kesişim yardımcıları ───────────────────────────────

/** Dairenin döndürülmüş dikdörtgenle kesişimi. */
export function circleHitsRect(x, z, r, rect) {
  const c = Math.cos(rect.rot ?? 0);
  const s = Math.sin(rect.rot ?? 0);
  const dx = x - rect.x;
  const dz = z - rect.z;
  // dünya → dikdörtgen yerel (yapıların toWorld dönüşümünün tersi)
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const cx = Math.max(-rect.hw, Math.min(rect.hw, lx));
  const cz = Math.max(-rect.hd, Math.min(rect.hd, lz));
  return Math.hypot(lx - cx, lz - cz) < r;
}

function corners(b) {
  const c = Math.cos(b.rot ?? 0);
  const s = Math.sin(b.rot ?? 0);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
    const lx = u * b.hw;
    const lz = v * b.hd;
    return [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
  });
}

/** İki döndürülmüş dikdörtgenin kesişimi (ayırıcı eksen teoremi). */
export function boxHitsRect(a, b) {
  const ca = corners(a);
  const cb = corners(b);
  const axes = [];
  for (const box of [a, b]) {
    const c = Math.cos(box.rot ?? 0);
    const s = Math.sin(box.rot ?? 0);
    axes.push([c, -s], [s, c]);
  }
  for (const [ax, az] of axes) {
    let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
    for (const [x, z] of ca) { const p = x * ax + z * az; minA = Math.min(minA, p); maxA = Math.max(maxA, p); }
    for (const [x, z] of cb) { const p = x * ax + z * az; minB = Math.min(minB, p); maxB = Math.max(maxB, p); }
    if (maxA <= minB || maxB <= minA) return false;
  }
  return true;
}

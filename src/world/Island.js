import { SimplexNoise } from '../utils/Noise.js';
import { mulberry32, smoothstep, lerp } from '../utils/math.js';

export const WATER_LEVEL = 0;

/**
 * Bir adanın "tasarımı": yükseklik fonksiyonu, bölgeler, göl, dağ ve önemli noktalar.
 * Three.js'e bağımlı değildir; Terrain bu fonksiyonları örnekleyerek mesh üretir.
 *
 * Adalar dünyada farklı merkezlerde durur (def.center). Dışarıya açık bütün yöntemler
 * DÜNYA koordinatı alır/verir; iç hesaplar adanın yerel koordinatlarında yapılır.
 * Biyomlar: tropical (Novera), desert (kum tepeleri, kızıl kayalıklar, vaha),
 * ice (karlı tepeler, buzul, donmuş göl), volcano (krater, lav nehirleri, kül ovası).
 */
export class Island {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.biome = def.biome ?? 'tropical';
    this.cx = def.center?.x ?? 0;
    this.cz = def.center?.z ?? 0;
    this.noise = new SimplexNoise(mulberry32(def.seed));
    this.radius = def.radius;
    this.mountain = def.mountain ?? { peaks: [] };
    this.mesas = def.mesas ?? [];
    this.crater = def.crater ?? null;

    // göl (yerel) — dışarıya dünya koordinatlı kopyası verilir
    this.lakeL = def.lake ? { ...def.lake, level: 0 } : null;
    if (this.lakeL) this.lakeL.level = this.computeLakeLevel();
    this.lake = this.lakeL ? { ...this.lakeL, x: this.lakeL.x + this.cx, z: this.lakeL.z + this.cz } : null;

    // lav nehirleri (yerel çoklu çizgiler) — arazi oyulmadan önce üretilir
    this.lavaRivers = this.biome === 'volcano' ? this.buildLavaRivers() : [];
    this.lavaPools = (def.lavaPools ?? []).map((p) => ({ ...p }));

    this.flatZones = (def.flatten ?? []).map((f) => ({
      ...f,
      h: this.baseHeightL(f.heightAt?.x ?? f.x, f.heightAt?.z ?? f.z),
    }));
    // krater içindeki lav gölü seviyesi
    if (this.crater) this.crater.lavaLevel = this.baseHeightL(this.crater.x, this.crater.z) + 1.2;
    for (const p of this.lavaPools) p.level = this.heightL(p.x, p.z) + 0.15;

    this.spawn = this.pointAtInland(def.spawnAngle, def.spawnInland ?? 11);
    this.landmarks = {};
    for (const [id, p] of Object.entries(def.landmarks ?? {})) {
      this.landmarks[id] = p.angle !== undefined ? this.pointAtInland(p.angle, p.inland) : { x: p.x + this.cx, z: p.z + this.cz };
    }
  }

  // ── Koordinat yardımcıları ─────────────────────────────────
  /** (x,z) bu adanın arazi karesinin içinde mi? */
  contains(x, z, half = 240) {
    return Math.abs(x - this.cx) < half && Math.abs(z - this.cz) < half;
  }

  distanceTo(x, z) {
    return Math.hypot(x - this.cx, z - this.cz);
  }

  coastRadius(angle) {
    const n = this.noise;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    return (
      this.radius +
      n.noise2D(ca * 1.3 + 7.1, sa * 1.3 - 3.7) * 20 +
      n.noise2D(ca * 3.1 - 2.2, sa * 3.1 + 9.4) * 7
    );
  }

  inlandL(x, z) {
    return this.coastRadius(Math.atan2(z, x)) - Math.hypot(x, z);
  }

  /** Kıyıdan içeriye doğru mesafe (m). Negatif = denizde. */
  inland(x, z) {
    return this.inlandL(x - this.cx, z - this.cz);
  }

  /** Kıyı açısına göre içeride/dışarıda bir nokta (dünya koordinatı). */
  pointAtInland(angle, inland) {
    const r = this.coastRadius(angle) - inland;
    return { x: Math.cos(angle) * r + this.cx, z: Math.sin(angle) * r + this.cz };
  }

  // ── Dağlar ──────────────────────────────────────────────────
  /** Tek bir zirvenin 0..1 profili: (1 - r)^p, kenarı gürültüyle bozulmuş (yuvarlak koni olmasın). */
  peakProfile(p, i, x, z) {
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > p.radius * 1.25) return 0;
    const a = Math.atan2(dz, dx);
    const warp = 1 + 0.2 * this.noise.noise2D(Math.cos(a) * 1.4 + i * 7.3, Math.sin(a) * 1.4 - i * 3.1);
    const r = d / (p.radius * warp);
    return r >= 1 ? 0 : Math.pow(1 - r, p.power);
  }

  mountainFactorL(x, z) {
    let g = 0;
    this.mountain.peaks.forEach((p, i) => {
      g = Math.max(g, this.peakProfile(p, i, x, z));
    });
    return g;
  }

  /** Dağlık bölge maskesi (0..1): zirvelerin en yükseği. */
  mountainFactor(x, z) {
    return this.mountainFactorL(x - this.cx, z - this.cz);
  }

  mountainHeight(x, z) {
    const n = this.noise;
    let h = 0;
    let gMax = 0;
    this.mountain.peaks.forEach((p, i) => {
      const g = this.peakProfile(p, i, x, z);
      if (g <= 0) return;
      gMax = Math.max(gMax, g);
      h = Math.max(h, g * p.height);
    });
    if (gMax <= 0) return 0;
    // sırtlar ve kayalık çıkıntılar
    const ridge = 1 - Math.abs(n.noise2D(x * 0.022 + 40, z * 0.022 - 40));
    const crag = Math.pow(1 - Math.abs(n.noise2D(x * 0.06 - 11, z * 0.06 + 5)), 3);
    return h * (0.8 + 0.3 * ridge) + crag * gMax * 9;
  }

  /** Çöl: dik yamaçlı, basamaklı kızıl kaya platoları (0 = yok). */
  mesaHeight(x, z) {
    let best = 0;
    this.mesas.forEach((m, i) => {
      const dx = x - m.x;
      const dz = z - m.z;
      const a = Math.atan2(dz, dx);
      const warp = 1 + 0.22 * this.noise.noise2D(Math.cos(a) * 1.7 + i * 5.1, Math.sin(a) * 1.7 - i * 2.7);
      const d = Math.hypot(dx, dz) / (m.r * warp);
      if (d > 1.1) return;
      const t = 1 - smoothstep(0.78, 1.0, d);
      let hh = m.h * t;
      // basamaklar: her 3.5 m'de bir kaya şeridi
      const step = 3.5;
      hh = Math.floor(hh / step) * step + (hh % step) * 0.3;
      best = Math.max(best, hh + this.noise.noise2D(x * 0.08, z * 0.08) * 0.3 * t);
    });
    return best;
  }

  mesaFactor(x, z) {
    let best = 0;
    this.mesas.forEach((m) => {
      const d = Math.hypot(x - this.cx - m.x, z - this.cz - m.z) / m.r;
      best = Math.max(best, 1 - smoothstep(0.75, 1.05, d));
    });
    return best;
  }

  // ── Volkan ──────────────────────────────────────────────────
  /** Kraterden kıyıya doğru kıvrılarak inen lav nehirleri (yerel çoklu çizgiler). */
  buildLavaRivers() {
    const c = this.crater;
    if (!c) return [];
    const rng = mulberry32(this.def.seed * 13 + 1);
    const rivers = [];
    for (const a0 of this.def.lavaAngles ?? [0.6, 2.4, 4.4]) {
      const pts = [];
      let a = a0;
      const end = this.coastRadius(a0) - 38;
      for (let r = c.r * 1.1; r <= end; r += 8) {
        a += (rng() - 0.5) * 0.09;
        pts.push({ x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r });
      }
      rivers.push({ pts, width: 4.2 });
    }
    return rivers;
  }

  /** Yerel noktanın en yakın lav nehrine uzaklığı ve o nehrin genişliği. */
  lavaRiverDist(x, z) {
    let best = Infinity;
    let width = 0;
    for (const rv of this.lavaRivers) {
      const p = rv.pts;
      for (let i = 0; i < p.length - 1; i++) {
        const ax = p[i].x, az = p[i].z, bx = p[i + 1].x, bz = p[i + 1].z;
        const vx = bx - ax, vz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
        const d = Math.hypot(x - ax - vx * t, z - az - vz * t);
        if (d < best) {
          best = d;
          // nehir aşağıya doğru genişler
          width = rv.width * (0.7 + 0.6 * (i / p.length));
        }
      }
    }
    return { d: best, width };
  }

  /** (x,z) noktası lavın içinde mi? (dünya koordinatı) */
  isLava(x, z, margin = 0) {
    if (this.biome !== 'volcano') return false;
    const lx = x - this.cx;
    const lz = z - this.cz;
    const c = this.crater;
    if (c && Math.hypot(lx - c.x, lz - c.z) < c.r * 0.42 + margin) return true;
    for (const p of this.lavaPools) if (Math.hypot(lx - p.x, lz - p.z) < p.r + margin) return true;
    if (this.lavaRivers.length) {
      const { d, width } = this.lavaRiverDist(lx, lz);
      if (d < width * 0.45 + margin) return true;
    }
    return false;
  }

  // ── Yükseklik ───────────────────────────────────────────────
  /** Göl oyulmadan önceki yükseklik (yerel). */
  baseHeightL(x, z) {
    const n = this.noise;
    const inland = this.inlandL(x, z);
    let h;
    if (inland <= 0) {
      // Deniz tabanı kıyıdan uzaklaştıkça yumuşakça derinleşir (sığ lagün → derin mavi)
      h = -Math.min(14, Math.pow(-inland, 1.08) * 0.19);
    } else {
      const t = Math.min(inland / 24, 1);
      const beach = (1 - (1 - t) * (1 - t)) * 2.2;
      if (this.biome === 'desert') {
        // rüzgârın yönüne dizilmiş kum tepeleri + geniş kabarmalar + kum dalgacıkları
        const mask = smoothstep(10, 45, inland);
        const along = x * 0.8 + z * 0.6;
        const across = z * 0.8 - x * 0.6;
        const ridge = 1 - Math.abs(n.noise2D(along * 0.016 + n.noise2D(x * 0.006, z * 0.006) * 1.4, across * 0.005));
        const dunes = Math.pow(ridge, 2.4) * 8 * mask;
        const swell = (n.fbm(x * 0.009, z * 0.009, 3) * 0.5 + 0.5) * 5 * mask;
        const ripples = Math.sin(along * 0.85 + n.noise2D(x * 0.05, z * 0.05) * 2) * 0.07 * mask;
        h = beach + dunes + swell + ripples;
      } else if (this.biome === 'ice') {
        const mask = smoothstep(14, 55, inland);
        const hills = (n.fbm(x * 0.012, z * 0.012, 4) * 0.5 + 0.5) * 15 * mask;
        const drift = n.noise2D(x * 0.05, z * 0.05) * 0.45 * smoothstep(6, 24, inland);
        h = beach + hills + drift;
      } else if (this.biome === 'volcano') {
        const mask = smoothstep(14, 50, inland);
        const hills = (n.fbm(x * 0.014, z * 0.014, 4) * 0.5 + 0.5) * 8 * mask;
        const rough = Math.abs(n.noise2D(x * 0.09, z * 0.09)) * 0.7 * smoothstep(6, 24, inland);
        h = beach + hills + rough;
      } else {
        const hillMask = smoothstep(16, 60, inland);
        const hills = (n.fbm(x * 0.011, z * 0.011, 4) * 0.5 + 0.5) * 13 * hillMask;
        const detail = n.noise2D(x * 0.07, z * 0.07) * 0.35 * smoothstep(6, 24, inland);
        h = beach + hills + detail;
      }
    }
    const mh = this.mountainHeight(x, z);
    if (mh > 0) h += mh * smoothstep(-8, 26, inland);
    if (this.mesas.length) {
      const m = this.mesaHeight(x, z);
      if (m > 0) h = Math.max(h, m + Math.min(h, 3) * smoothstep(-4, 10, inland));
    }
    const c = this.crater;
    if (c) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r * 1.25) h -= c.depth * (1 - smoothstep(c.r * 0.42, c.r * 1.2, d));
    }
    return h;
  }

  /** Eski adı (Novera kodu bununla çalışıyordu). */
  baseHeight(x, z) {
    return this.baseHeightL(x - this.cx, z - this.cz);
  }

  computeLakeLevel() {
    const L = this.lakeL;
    let min = Infinity;
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const h = this.baseHeightL(L.x + Math.cos(a) * L.radius * 1.6, L.z + Math.sin(a) * L.radius * 1.6);
      min = Math.min(min, h);
    }
    return min - 0.3;
  }

  heightL(x, z) {
    let h = this.baseHeightL(x, z);
    const L = this.lakeL;
    if (L) {
      const dl = Math.hypot(x - L.x, z - L.z);
      const outer = L.radius * 1.6;
      if (dl < outer) {
        const t = smoothstep(L.radius * 0.3, outer, dl);
        // donmuş göl: çukur yerine düz bir buz yüzeyi
        h = L.frozen ? Math.min(h, lerp(L.level, h, smoothstep(L.radius * 0.9, outer, dl))) : Math.min(h, lerp(L.level - 2.0, h, t));
      }
    }
    for (const f of this.flatZones) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < f.r + f.falloff) h = lerp(f.h, h, smoothstep(f.r, f.r + f.falloff, d));
    }
    if (this.lavaRivers.length && h > 0.8) {
      const { d, width } = this.lavaRiverDist(x, z);
      if (d < width * 1.4) h -= 1.1 * (1 - smoothstep(width * 0.35, width * 1.4, d));
    }
    for (const p of this.lavaPools) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r * 1.6) h -= 1.2 * (1 - smoothstep(p.r * 0.6, p.r * 1.6, d));
    }
    return h;
  }

  height(x, z) {
    return this.heightL(x - this.cx, z - this.cz);
  }

  // ── Bölgeler ────────────────────────────────────────────────
  forestMaskL(x, z) {
    if (this.biome === 'desert') {
      // vahanın çevresi
      const L = this.lakeL;
      if (!L) return 0;
      return 1 - smoothstep(L.radius * 1.4, L.radius * 3.4, Math.hypot(x - L.x, z - L.z));
    }
    if (this.biome === 'volcano') {
      const v = this.noise.fbm(x * 0.01 + 40, z * 0.01 - 20, 3);
      return smoothstep(0.0, 0.15, v);
    }
    if (this.biome === 'ice') {
      const v = this.noise.fbm(x * 0.008 + 100, z * 0.008 - 50, 3);
      return smoothstep(-0.05, 0.1, v);
    }
    const v = this.noise.fbm(x * 0.0075 + 100, z * 0.0075 - 50, 3) - x * 0.0012;
    return smoothstep(-0.08, 0.08, v);
  }

  forestMask(x, z) {
    return this.forestMaskL(x - this.cx, z - this.cz);
  }

  isInLake(x, z, margin = 0) {
    const L = this.lake;
    if (!L || L.frozen) return false;
    return Math.hypot(x - L.x, z - L.z) < L.radius * 1.3 + margin;
  }

  /** Donmuş gölün üzerinde mi? */
  isOnIce(x, z) {
    const L = this.lake;
    return !!L?.frozen && Math.hypot(x - L.x, z - L.z) < L.radius * 1.15;
  }

  region(x, z, h = this.height(x, z)) {
    const lx = x - this.cx;
    const lz = z - this.cz;
    const L = this.lakeL;
    const inland = this.inlandL(lx, lz);
    switch (this.biome) {
      case 'desert': {
        if (L && Math.hypot(lx - L.x, lz - L.z) < L.radius * 2.2) return 'd_oasis';
        if (h < -0.35) return 'sea';
        if (inland < 24 && h < 3.2) return 'd_beach';
        if (this.mesaFactor(x, z) > 0.4) return 'd_mesa';
        return 'd_dunes';
      }
      case 'ice': {
        if (L && Math.hypot(lx - L.x, lz - L.z) < L.radius * 1.4) return 'i_lake';
        if (h < -0.35) return 'sea';
        if (inland < 22 && h < 3.2) return 'i_shore';
        if (h > 20 || this.mountainFactorL(lx, lz) > 0.12) return 'i_peak';
        return this.forestMaskL(lx, lz) > 0.5 ? 'i_forest' : 'i_tundra';
      }
      case 'volcano': {
        if (h < -0.35) return 'sea';
        const c = this.crater;
        if (c && Math.hypot(lx - c.x, lz - c.z) < c.r * 1.35) return 'v_crater';
        if (inland < 22 && h < 3.5) return 'v_beach';
        if (h > 18 || this.mountainFactorL(lx, lz) > 0.2) return 'v_slope';
        return 'v_ash';
      }
      default: {
        if (L && Math.hypot(lx - L.x, lz - L.z) < L.radius * 1.5) return 'lake';
        if (h < -0.35) return 'sea';
        if (inland < 26 && h < 3.2) return 'beach';
        if (h > 22 || this.mountainFactorL(lx, lz) > 0.1) return 'mountain';
        return this.forestMaskL(lx, lz) > 0.5 ? 'forest' : 'meadow';
      }
    }
  }
}

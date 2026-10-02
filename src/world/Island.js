import { SimplexNoise } from '../utils/Noise.js';
import { mulberry32, smoothstep, lerp } from '../utils/math.js';

export const WATER_LEVEL = 0;

/**
 * Bir adanın "tasarımı": yükseklik fonksiyonu, bölgeler, göl, dağ ve önemli noktalar.
 * Three.js'e bağımlı değildir; Terrain bu fonksiyonları örnekleyerek mesh üretir.
 */
export class Island {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.noise = new SimplexNoise(mulberry32(def.seed));
    this.radius = def.radius;
    this.mountain = def.mountain;
    this.lake = { ...def.lake, level: 0 };
    this.lake.level = this.computeLakeLevel();
    this.flatZones = (def.flatten ?? []).map((f) => ({
      ...f,
      h: this.baseHeight(f.heightAt?.x ?? f.x, f.heightAt?.z ?? f.z),
    }));

    this.spawn = this.pointAtInland(def.spawnAngle, 11);
    this.landmarks = {};
    for (const [id, p] of Object.entries(def.landmarks)) {
      this.landmarks[id] = p.angle !== undefined ? this.pointAtInland(p.angle, p.inland) : { x: p.x, z: p.z };
    }
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

  /** Kıyıdan içeriye doğru mesafe (m). Negatif = denizde. */
  inland(x, z) {
    return this.coastRadius(Math.atan2(z, x)) - Math.hypot(x, z);
  }

  pointAtInland(angle, inland) {
    const r = this.coastRadius(angle) - inland;
    return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
  }

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

  /** Dağlık bölge maskesi (0..1): zirvelerin en yükseği. */
  mountainFactor(x, z) {
    let g = 0;
    this.mountain.peaks.forEach((p, i) => {
      g = Math.max(g, this.peakProfile(p, i, x, z));
    });
    return g;
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

  /** Göl oyulmadan önceki yükseklik. */
  baseHeight(x, z) {
    const n = this.noise;
    const inland = this.inland(x, z);
    let h;
    if (inland <= 0) {
      // Deniz tabanı kıyıdan uzaklaştıkça yumuşakça derinleşir (sığ lagün → derin mavi)
      h = -Math.min(14, Math.pow(-inland, 1.08) * 0.19);
    } else {
      const t = Math.min(inland / 24, 1);
      const beach = (1 - (1 - t) * (1 - t)) * 2.2;
      const hillMask = smoothstep(16, 60, inland);
      const hills = (n.fbm(x * 0.011, z * 0.011, 4) * 0.5 + 0.5) * 13 * hillMask;
      const detail = n.noise2D(x * 0.07, z * 0.07) * 0.35 * smoothstep(6, 24, inland);
      h = beach + hills + detail;
    }
    const mh = this.mountainHeight(x, z);
    if (mh > 0) h += mh * smoothstep(-8, 26, inland);
    return h;
  }

  computeLakeLevel() {
    const L = this.lake;
    let min = Infinity;
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const h = this.baseHeight(L.x + Math.cos(a) * L.radius * 1.6, L.z + Math.sin(a) * L.radius * 1.6);
      min = Math.min(min, h);
    }
    return min - 0.3;
  }

  height(x, z) {
    let h = this.baseHeight(x, z);
    const L = this.lake;
    const dl = Math.hypot(x - L.x, z - L.z);
    const outer = L.radius * 1.6;
    if (dl < outer) {
      const t = smoothstep(L.radius * 0.3, outer, dl);
      h = Math.min(h, lerp(L.level - 2.0, h, t));
    }
    for (const f of this.flatZones) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < f.r + f.falloff) h = lerp(f.h, h, smoothstep(f.r, f.r + f.falloff, d));
    }
    return h;
  }

  forestMask(x, z) {
    const v = this.noise.fbm(x * 0.0075 + 100, z * 0.0075 - 50, 3) - x * 0.0012;
    return smoothstep(-0.08, 0.08, v);
  }

  isInLake(x, z, margin = 0) {
    return Math.hypot(x - this.lake.x, z - this.lake.z) < this.lake.radius * 1.3 + margin;
  }

  region(x, z, h = this.height(x, z)) {
    if (Math.hypot(x - this.lake.x, z - this.lake.z) < this.lake.radius * 1.5) return 'lake';
    if (h < -0.35) return 'sea';
    const inland = this.inland(x, z);
    if (inland < 26 && h < 3.2) return 'beach';
    if (h > 22 || this.mountainFactor(x, z) > 0.1) return 'mountain';
    return this.forestMask(x, z) > 0.5 ? 'forest' : 'meadow';
  }
}

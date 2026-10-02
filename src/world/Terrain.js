import * as THREE from 'three';
import { smoothstep, clamp } from '../utils/math.js';

export const OCEAN_FLOOR = -14;

const C = (hex) => new THREE.Color(hex);
// Biyom renk paletleri (tropical: Novera)
const PALETTES = {
  desert: {
    deepSand: C('#9a7d4c'), wetSand: C('#d2b27a'), sand: C('#ecca8c'), sandLight: C('#f4dba6'), sandDark: C('#d9ae6f'),
    oasis: C('#7fae4a'), oasisDark: C('#5f8f3a'), dirt: C('#a88a5a'), mesa: C('#b7633d'), mesaDark: C('#94472b'), mesaLight: C('#cf8a5a'),
  },
  ice: {
    deep: C('#566f7d'), shallow: C('#9fb5c0'), gravel: C('#a3a9ae'), snow: C('#f2f6f9'), snowBlue: C('#dde8f0'),
    tundra: C('#a0a88a'), rock: C('#7b8590'), rockDark: C('#5f6873'), glacier: C('#cde5f4'), ice: C('#a9d9ef'), iceLight: C('#d4f0fb'),
  },
  volcano: {
    deep: C('#2e2e33'), wet: C('#2a292c'), black: C('#323034'), blackLight: C('#3f3c40'), ash: C('#6d6863'), ashLight: C('#837d77'),
    basalt: C('#4a4442'), basaltDark: C('#363130'), scorch: C('#5a2618'), ember: C('#7a3a22'), sulfur: C('#c9b23a'), rim: C('#2b2524'),
  },
};

const COLORS = {
  deepSand: new THREE.Color('#a8915e'),
  wetSand: new THREE.Color('#d6c08a'),
  sand: new THREE.Color('#f0dfa8'),
  meadow: new THREE.Color('#8fc456'),
  meadowDry: new THREE.Color('#b3c46a'),
  forest: new THREE.Color('#4f8f3b'),
  forestDark: new THREE.Color('#3c7531'),
  dirt: new THREE.Color('#8a7650'),
  rock: new THREE.Color('#8e877b'),
  rockDark: new THREE.Color('#6d675e'),
  peak: new THREE.Color('#bdb7ad'),
};
const _grass = new THREE.Color();

/**
 * Isı haritası tabanlı, düşük poligonlu (flat shading) 3D arazi.
 * getHeight() mesh üçgenleriyle birebir aynı enterpolasyonu kullanır;
 * böylece oyuncu ve nesneler zemine tam oturur.
 */
export class Terrain {
  constructor(island, { size = 480, segments = 240 } = {}) {
    this.island = island;
    this.cx = island.cx;
    this.cz = island.cz;
    this.size = size;
    this.segments = segments;
    this.half = size / 2;
    this.step = size / segments;
    this.n = segments + 1;
    this.heights = new Float32Array(this.n * this.n);

    for (let iz = 0; iz < this.n; iz++) {
      for (let ix = 0; ix < this.n; ix++) {
        const x = ix * this.step - this.half;
        const z = iz * this.step - this.half;
        this.heights[iz * this.n + ix] = island.heightL(x, z);
      }
    }

    this.mesh = this.buildMesh();
  }

  /** (x,z) bu arazinin karesinin içinde mi? */
  contains(x, z) {
    const lim = this.half - this.step;
    return Math.abs(x - this.cx) < lim && Math.abs(z - this.cz) < lim;
  }

  buildMesh() {
    const { n, step, heights } = this;
    const half = this.half;
    const positions = new Float32Array(n * n * 3);
    const colors = new Float32Array(n * n * 3);
    const color = new THREE.Color();

    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const i = iz * n + ix;
        const x = ix * step - half + this.cx;
        const z = iz * step - half + this.cz;
        const h = heights[i];
        positions[i * 3] = x;
        positions[i * 3 + 1] = h;
        positions[i * 3 + 2] = z;

        const hl = heights[iz * n + Math.max(ix - 1, 0)];
        const hr = heights[iz * n + Math.min(ix + 1, n - 1)];
        const hd = heights[Math.max(iz - 1, 0) * n + ix];
        const hu = heights[Math.min(iz + 1, n - 1) * n + ix];
        const slope = Math.hypot(hr - hl, hu - hd) / (2 * step);

        this.colorAt(x, z, h, slope, color);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }
    }

    const indices = [];
    for (let iz = 0; iz < this.segments; iz++) {
      for (let ix = 0; ix < this.segments; ix++) {
        const a = iz * n + ix;
        const b = (iz + 1) * n + ix;
        const c = (iz + 1) * n + ix + 1;
        const d = iz * n + ix + 1;
        indices.push(a, b, d, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }

  colorAt(x, z, h, slope, out) {
    const isl = this.island;
    if (isl.biome === 'desert') return this.colorDesert(x, z, h, slope, out);
    if (isl.biome === 'ice') return this.colorIce(x, z, h, slope, out);
    if (isl.biome === 'volcano') return this.colorVolcano(x, z, h, slope, out);
    const n = isl.noise;
    const v = n.noise2D(x * 0.09, z * 0.09) * 0.5 + 0.5;

    if (h < 0.35) {
      out.copy(COLORS.wetSand).lerp(COLORS.deepSand, smoothstep(0.2, -7, h));
    } else {
      // kum → çimen geçişi (biraz gürültüyle kırılmış kenar)
      const grassT = smoothstep(1.6, 2.7, h + (v - 0.5) * 0.8);
      out.copy(COLORS.sand);
      if (h < 0.8) out.lerp(COLORS.wetSand, 1 - smoothstep(0.35, 0.8, h));

      const forest = isl.forestMask(x, z);
      const grass = _grass.copy(COLORS.meadow).lerp(COLORS.meadowDry, smoothstep(0.55, 0.95, v) * 0.6);
      grass.lerp(v > 0.5 ? COLORS.forest : COLORS.forestDark, forest);
      out.lerp(grass, grassT);

      // göl kıyısı
      const dl = Math.hypot(x - isl.lake.x, z - isl.lake.z) / isl.lake.radius;
      if (dl < 1.75) out.lerp(COLORS.dirt, (1 - smoothstep(1.2, 1.75, dl)) * 0.75);

      // kayalık: dik yamaçlar ve yüksek kesimler
      const rockT = Math.max(smoothstep(0.6, 1.0, slope), smoothstep(24, 38, h) * 0.9);
      out.lerp(v > 0.45 ? COLORS.rock : COLORS.rockDark, rockT);
      out.lerp(COLORS.peak, smoothstep(95, 135, h) * 0.8);
    }

    const tint = 0.95 + v * 0.1;
    out.r = clamp(out.r * tint, 0, 1);
    out.g = clamp(out.g * tint, 0, 1);
    out.b = clamp(out.b * tint, 0, 1);
    return out;
  }

  shade(out, v) {
    const tint = 0.95 + v * 0.1;
    out.r = clamp(out.r * tint, 0, 1);
    out.g = clamp(out.g * tint, 0, 1);
    out.b = clamp(out.b * tint, 0, 1);
    return out;
  }

  colorDesert(x, z, h, slope, out) {
    const isl = this.island;
    const P = PALETTES.desert;
    const n = isl.noise;
    const v = n.noise2D(x * 0.07, z * 0.07) * 0.5 + 0.5;
    if (h < 0.35) return this.shade(out.copy(P.wetSand).lerp(P.deepSand, smoothstep(0.2, -7, h)), v);
    // kum: rüzgâr dalgacıkları açık/koyu şeritler halinde
    const band = Math.sin((x * 0.8 + z * 0.6) * 0.9 + n.noise2D(x * 0.05, z * 0.05) * 2) * 0.5 + 0.5;
    out.copy(P.sand).lerp(band > 0.5 ? P.sandLight : P.sandDark, Math.abs(band - 0.5) * 0.9);
    if (h < 0.8) out.lerp(P.wetSand, 1 - smoothstep(0.35, 0.8, h));
    // vaha çevresi yeşil
    const oasis = isl.forestMask(x, z);
    if (oasis > 0.05) out.lerp(v > 0.5 ? P.oasis : P.oasisDark, smoothstep(0.05, 0.6, oasis) * smoothstep(0.9, 2.2, h));
    const L = isl.lake;
    if (L) {
      const dl = Math.hypot(x - L.x, z - L.z) / L.radius;
      if (dl < 1.75) out.lerp(P.dirt, (1 - smoothstep(1.2, 1.75, dl)) * 0.7);
    }
    // kızıl kayalıklar: yükseklik bantları
    const mesa = isl.mesaFactor(x, z);
    const cliff = smoothstep(0.7, 1.1, slope);
    if (mesa > 0.05 || cliff > 0) {
      const stripe = Math.floor(h / 1.75) % 3;
      const rock = stripe === 0 ? P.mesa : stripe === 1 ? P.mesaDark : P.mesaLight;
      out.lerp(rock, Math.max(cliff, smoothstep(0.3, 0.7, mesa) * smoothstep(4, 7, h)));
    }
    return this.shade(out, v);
  }

  colorIce(x, z, h, slope, out) {
    const isl = this.island;
    const P = PALETTES.ice;
    const n = isl.noise;
    const v = n.noise2D(x * 0.08, z * 0.08) * 0.5 + 0.5;
    if (h < 0.35) return this.shade(out.copy(P.shallow).lerp(P.deep, smoothstep(0.2, -7, h)), v);
    out.copy(P.snow).lerp(P.snowBlue, smoothstep(0.4, 0.8, v));
    if (h < 2.2) out.lerp(P.gravel, 1 - smoothstep(1.2, 2.2, h + (v - 0.5)));
    // tundra: rüzgârın karı süpürdüğü yamalar
    const patch = n.fbm(x * 0.02 + 30, z * 0.02 - 10, 3);
    if (patch > 0.25 && h > 2.5) out.lerp(P.tundra, smoothstep(0.25, 0.45, patch) * 0.75);
    if (isl.isOnIce(x, z)) {
      const crack = Math.abs(n.noise2D(x * 0.4, z * 0.4)) < 0.06 ? 1 : 0;
      out.copy(crack ? P.iceLight : P.ice);
    }
    const rockT = smoothstep(0.75, 1.15, slope);
    out.lerp(v > 0.45 ? P.rock : P.rockDark, rockT);
    out.lerp(P.glacier, smoothstep(40, 65, h) * (1 - rockT * 0.6));
    return this.shade(out, v);
  }

  colorVolcano(x, z, h, slope, out) {
    const isl = this.island;
    const P = PALETTES.volcano;
    const n = isl.noise;
    const v = n.noise2D(x * 0.09, z * 0.09) * 0.5 + 0.5;
    if (h < 0.35) return this.shade(out.copy(P.wet).lerp(P.deep, smoothstep(0.2, -7, h)), v);
    out.copy(v > 0.5 ? P.black : P.blackLight);
    const ashT = smoothstep(2.2, 4.5, h + (v - 0.5) * 1.5);
    out.lerp(v > 0.4 ? P.ash : P.ashLight, ashT);
    // kükürt lekeleri
    const sul = n.noise2D(x * 0.03 + 7, z * 0.03 - 3);
    if (sul > 0.62 && h > 3) out.lerp(P.sulfur, smoothstep(0.62, 0.75, sul) * 0.7);
    const slopeT = Math.max(smoothstep(0.6, 1.0, slope), smoothstep(16, 30, h));
    out.lerp(v > 0.5 ? P.basalt : P.basaltDark, slopeT);
    const lx = x - isl.cx;
    const lz = z - isl.cz;
    const c = isl.crater;
    if (c && Math.hypot(lx - c.x, lz - c.z) < c.r * 1.3) out.lerp(P.rim, 0.6);
    // lavın çevresi kavrulmuş
    if (isl.isLava(x, z, 3.5)) out.lerp(isl.isLava(x, z, 0.8) ? P.ember : P.scorch, 0.85);
    return this.shade(out, v);
  }

  /** Mesh ile birebir uyumlu yükseklik (üçgen enterpolasyonu). */
  getHeight(x, z) {
    const { half, step, n, heights } = this;
    const gx = (x - this.cx + half) / step;
    const gz = (z - this.cz + half) / step;
    if (gx < 0 || gz < 0 || gx >= n - 1 || gz >= n - 1) return OCEAN_FLOOR;
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const ha = heights[iz * n + ix];
    const hb = heights[(iz + 1) * n + ix];
    const hc = heights[(iz + 1) * n + ix + 1];
    const hd = heights[iz * n + ix + 1];
    if (fx + fz <= 1) return ha + (hd - ha) * fx + (hb - ha) * fz;
    return hc + (hb - hc) * (1 - fx) + (hd - hc) * (1 - fz);
  }

  getSlope(x, z) {
    const e = 0.8;
    const dx = this.getHeight(x + e, z) - this.getHeight(x - e, z);
    const dz = this.getHeight(x, z + e) - this.getHeight(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  /** Su shader'ının sığlık/köpük hesabı için yükseklik dokusu (half-float, doğrusal filtreli). */
  createHeightTexture() {
    const data = new Uint16Array(this.heights.length);
    for (let i = 0; i < this.heights.length; i++) data[i] = THREE.DataUtils.toHalfFloat(this.heights[i]);
    const tex = new THREE.DataTexture(data, this.n, this.n, THREE.RedFormat, THREE.HalfFloatType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  /** Kameradan çıkan ışının araziyle kesişimi (inşa önizlemesi için). */
  raycast(origin, dir, maxDist = 30, stepSize = 0.5) {
    let prevT = 0;
    let prevAbove = origin.y - this.getHeight(origin.x, origin.z) > 0;
    if (!prevAbove) return null;
    for (let t = stepSize; t <= maxDist; t += stepSize) {
      const x = origin.x + dir.x * t;
      const y = origin.y + dir.y * t;
      const z = origin.z + dir.z * t;
      if (y - this.getHeight(x, z) <= 0) {
        // ikili arama ile hassaslaştır
        let lo = prevT, hi = t;
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          const my = origin.y + dir.y * mid;
          if (my - this.getHeight(origin.x + dir.x * mid, origin.z + dir.z * mid) > 0) lo = mid;
          else hi = mid;
        }
        const tt = (lo + hi) / 2;
        return { x: origin.x + dir.x * tt, y: origin.y + dir.y * tt, z: origin.z + dir.z * tt, distance: tt };
      }
      prevT = t;
    }
    return null;
  }
}

/**
 * Tüm adaların arazileri tek bir arayüzde: (x,z) hangi adanın karesindeyse onun yüksekliği,
 * hiçbirinde değilse açık deniz tabanı. Eski kod `world.terrain.getHeight` ile çalışmaya devam eder.
 */
export class TerrainSet {
  constructor(terrains) {
    this.list = terrains;
    this.last = terrains[0];
  }

  at(x, z) {
    if (this.last.contains(x, z)) return this.last;
    for (const t of this.list) {
      if (t.contains(x, z)) {
        this.last = t;
        return t;
      }
    }
    return null;
  }

  getHeight(x, z) {
    const t = this.at(x, z);
    return t ? t.getHeight(x, z) : OCEAN_FLOOR;
  }

  getSlope(x, z) {
    const e = 0.8;
    const dx = this.getHeight(x + e, z) - this.getHeight(x - e, z);
    const dz = this.getHeight(x, z + e) - this.getHeight(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  raycast(origin, dir, maxDist = 30, stepSize = 0.5) {
    return Terrain.prototype.raycast.call(this, origin, dir, maxDist, stepSize);
  }
}

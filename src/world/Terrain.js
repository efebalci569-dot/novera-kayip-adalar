import * as THREE from 'three';
import { smoothstep, clamp } from '../utils/math.js';

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
        this.heights[iz * this.n + ix] = island.height(x, z);
      }
    }

    this.mesh = this.buildMesh();
  }

  buildMesh() {
    const { n, step, half, heights, island } = this;
    const positions = new Float32Array(n * n * 3);
    const colors = new Float32Array(n * n * 3);
    const color = new THREE.Color();

    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const i = iz * n + ix;
        const x = ix * step - half;
        const z = iz * step - half;
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

  /** Mesh ile birebir uyumlu yükseklik (üçgen enterpolasyonu). */
  getHeight(x, z) {
    const { half, step, n, heights } = this;
    const gx = (x + half) / step;
    const gz = (z + half) / step;
    if (gx < 0 || gz < 0 || gx >= n - 1 || gz >= n - 1) return -14;
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

import * as THREE from 'three';
import { SimplexNoise } from '../utils/Noise.js';
import { mulberry32, smoothstep, randRange } from '../utils/math.js';
import { part, merge, sharedMaterials } from './Models.js';

const STEP = 1.0; // ızgara çözünürlüğü (m)
const MARGIN = 7; // şekillerin dışında kalan kapalı kaya payı
const WALL_FLOOR = 2.6; // duvar yükselme katsayısı
const MIN_CEIL = 2.4; // duvar dibinde tavan yüksekliği

const COLORS = {
  floor: new THREE.Color('#5c544b'),
  floorDark: new THREE.Color('#463f39'),
  wall: new THREE.Color('#6a6b72'),
  wallDark: new THREE.Color('#4d4f58'),
  ceil: new THREE.Color('#3f4048'),
  moss: new THREE.Color('#3f5a3a'),
};
const _c = new THREE.Color();

/**
 * Dağın altındaki mağara. Ada yüzeyinden tamamen ayrı, kapalı bir alandır:
 * odalar (daire) ve tüneller (kapsül) birleşiminden üretilen işaretli uzaklık alanı (SDF)
 * ile bir zemin ve bir tavan ızgarası oluşturulur. Şekillerin dışında zemin hızla yükselir,
 * tavan alçalır; ikisi kesişerek kapalı kaya duvarları oluşturur.
 *
 * Oyuncu girişte etkileşime girince içeri ışınlanır; mağara modunda yüzey gizlenir
 * (bkz. WorldManager.setCaveMode).
 */
export class Cave {
  constructor(world, def) {
    this.world = world;
    this.def = def;
    this.baseY = def.baseY;
    this.noise = new SimplexNoise(mulberry32(4242));
    this.shapes = [
      ...def.chambers.map((c) => ({ type: 'circle', x: c.x, z: c.z, r: c.r, h: c.h, id: c.id })),
      ...def.tunnels.map((t) => ({ type: 'capsule', ax: t.from[0], az: t.from[1], bx: t.to[0], bz: t.to[1], r: t.r, h: t.h })),
    ];
    this.chambers = Object.fromEntries(def.chambers.map((c) => [c.id, c]));

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of this.shapes) {
      const xs = s.type === 'circle' ? [s.x] : [s.ax, s.bx];
      const zs = s.type === 'circle' ? [s.z] : [s.az, s.bz];
      for (const x of xs) { minX = Math.min(minX, x - s.r); maxX = Math.max(maxX, x + s.r); }
      for (const z of zs) { minZ = Math.min(minZ, z - s.r); maxZ = Math.max(maxZ, z + s.r); }
    }
    this.minX = Math.floor(minX - MARGIN);
    this.minZ = Math.floor(minZ - MARGIN);
    this.nx = Math.ceil((maxX + MARGIN - this.minX) / STEP) + 1;
    this.nz = Math.ceil((maxZ + MARGIN - this.minZ) / STEP) + 1;

    this.group = new THREE.Group();
    this.group.name = 'cave';
    this.group.visible = false;

    this.buildGrids();
    this.floorMesh = this.buildSurface(this.floor, false);
    this.ceilMesh = this.buildSurface(this.ceil, true);
    this.group.add(this.floorMesh, this.ceilMesh);
    this.blockers = [this.floorMesh, this.ceilMesh];

    this.time = 0;
    this.buildDecor();
    this.buildExit();
  }

  // ── Şekil alanı ─────────────────────────────────────────
  shapeDist(s, x, z) {
    if (s.type === 'circle') return Math.hypot(x - s.x, z - s.z) - s.r;
    const vx = s.bx - s.ax, vz = s.bz - s.az;
    const t = Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / (vx * vx + vz * vz)));
    return Math.hypot(x - (s.ax + vx * t), z - (s.az + vz * t)) - s.r;
  }

  /** İşaretli uzaklık: < 0 mağaranın içi, > 0 kaya. */
  sdf(x, z) {
    let d = Infinity;
    for (const s of this.shapes) d = Math.min(d, this.shapeDist(s, x, z));
    return d;
  }

  /** Bir noktadaki tavan yüksekliği (tabana göre): her şeklin kubbesinin en yükseği. */
  ceilingAt(x, z) {
    let best = -Infinity;
    for (const s of this.shapes) {
      const d = this.shapeDist(s, x, z);
      const t = (d + s.r) / s.r; // 0 merkez, 1 duvar
      let h;
      if (t < 1) h = MIN_CEIL + (s.h - MIN_CEIL) * Math.pow(1 - t * t, 0.6);
      else h = MIN_CEIL - (d * 2.6);
      best = Math.max(best, h);
    }
    return best;
  }

  buildGrids() {
    const { nx, nz, noise } = this;
    this.floor = new Float32Array(nx * nz);
    this.ceil = new Float32Array(nx * nz);
    this.sdfGrid = new Float32Array(nx * nz);
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const x = this.minX + ix * STEP;
        const z = this.minZ + iz * STEP;
        const d = this.sdf(x, z);
        const i = iz * nx + ix;
        this.sdfGrid[i] = d;
        const bumps = noise.noise2D(x * 0.13, z * 0.13) * 0.35 + noise.noise2D(x * 0.45 + 9, z * 0.45 - 3) * 0.12;
        const rise = d > 0 ? Math.pow(d, 1.25) * WALL_FLOOR : 0;
        // duvar diplerinde hafif yükselen zemin (taş birikintisi)
        const lip = smoothstep(-1.6, 0, d) * 0.35;
        this.floor[i] = this.baseY + bumps + lip + rise + noise.noise2D(x * 0.3, z * 0.3) * 0.5 * Math.min(1, Math.max(0, d));
        const drip = noise.noise2D(x * 0.35 - 20, z * 0.35 + 11);
        this.ceil[i] = this.baseY + this.ceilingAt(x, z) + drip * 0.45 - Math.max(0, drip - 0.55) * 1.6;
      }
    }
  }

  gridHeight(arr, x, z) {
    const { nx, nz } = this;
    const gx = (x - this.minX) / STEP;
    const gz = (z - this.minZ) / STEP;
    if (gx < 0 || gz < 0 || gx >= nx - 1 || gz >= nz - 1) return this.baseY + 40;
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const ha = arr[iz * nx + ix];
    const hb = arr[(iz + 1) * nx + ix];
    const hc = arr[(iz + 1) * nx + ix + 1];
    const hd = arr[iz * nx + ix + 1];
    if (fx + fz <= 1) return ha + (hd - ha) * fx + (hb - ha) * fz;
    return hc + (hb - hc) * (1 - fx) + (hd - hc) * (1 - fz);
  }

  /** Mesh ile birebir uyumlu zemin yüksekliği. */
  floorHeight(x, z) {
    return this.gridHeight(this.floor, x, z);
  }

  ceilingHeight(x, z) {
    return this.gridHeight(this.ceil, x, z);
  }

  /** Nokta mağaranın içinde mi (yatay olarak)? */
  contains(x, z, margin = 0) {
    return this.sdf(x, z) < -margin;
  }

  buildSurface(heights, isCeiling) {
    const { nx, nz, noise } = this;
    const positions = new Float32Array(nx * nz * 3);
    const colors = new Float32Array(nx * nz * 3);
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const i = iz * nx + ix;
        const x = this.minX + ix * STEP;
        const z = this.minZ + iz * STEP;
        positions[i * 3] = x;
        positions[i * 3 + 1] = heights[i];
        positions[i * 3 + 2] = z;
        const d = this.sdfGrid[i];
        const v = noise.noise2D(x * 0.21 + 5, z * 0.21) * 0.5 + 0.5;
        if (isCeiling) {
          _c.copy(COLORS.ceil).lerp(COLORS.wallDark, v * 0.6);
        } else {
          const wall = smoothstep(-0.4, 1.2, d);
          _c.copy(v > 0.5 ? COLORS.floor : COLORS.floorDark).lerp(v > 0.4 ? COLORS.wall : COLORS.wallDark, wall);
          if (d < -1 && v > 0.72) _c.lerp(COLORS.moss, (v - 0.72) * 2.2);
        }
        colors[i * 3] = _c.r;
        colors[i * 3 + 1] = _c.g;
        colors[i * 3 + 2] = _c.b;
      }
    }
    const indices = [];
    for (let iz = 0; iz < nz - 1; iz++) {
      for (let ix = 0; ix < nx - 1; ix++) {
        // tamamen kaya içinde kalan hücreler hiç görünmez → atla
        const i0 = iz * nx + ix;
        if (Math.min(this.sdfGrid[i0], this.sdfGrid[i0 + 1], this.sdfGrid[i0 + nx], this.sdfGrid[i0 + nx + 1]) > 5) continue;
        const a = i0;
        const b = (iz + 1) * nx + ix;
        const c = (iz + 1) * nx + ix + 1;
        const dd = iz * nx + ix + 1;
        if (isCeiling) indices.push(a, dd, b, b, dd, c);
        else indices.push(a, b, dd, b, c, dd);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.name = isCeiling ? 'caveCeiling' : 'caveFloor';
    mesh.receiveShadow = false;
    return mesh;
  }

  // ── Süsler: sarkıt/dikit, duvar kristalleri ─────────────
  buildDecor() {
    const rng = mulberry32(777);
    const rock = [];
    const glow = [];
    const keepClear = [this.def.spawn, this.def.exit, ...Object.values(this.world.island.def.landmarks).filter((l) => l.cave)];
    const clear = (x, z, r) => keepClear.every((p) => Math.hypot(p.x - x, p.z - z) > r);
    this.stalagmites = [];

    for (const ch of this.def.chambers) {
      // sarkıtlar
      const nTop = Math.round(ch.r * 2.2);
      for (let i = 0; i < nTop; i++) {
        const a = rng() * Math.PI * 2;
        const d = Math.sqrt(rng()) * (ch.r - 0.8);
        const x = ch.x + Math.cos(a) * d;
        const z = ch.z + Math.sin(a) * d;
        const top = this.ceilingHeight(x, z);
        if (top - this.floorHeight(x, z) < 3.2) continue;
        const len = randRange(rng, 0.5, Math.min(2.2, (top - this.floorHeight(x, z)) * 0.3));
        const r = len * randRange(rng, 0.12, 0.2);
        rock.push(part(new THREE.ConeGeometry(r, len, 6), i % 3 ? '#6f6c70' : '#7d7a7c', { x, y: top - len / 2 + 0.15, z, rx: Math.PI, seed: 3100 + i, jitter: r * 0.15, shade: 0.08 }));
      }
      // dikitler (büyükleri çarpışır)
      const nBottom = Math.round(ch.r * 0.9);
      for (let i = 0; i < nBottom; i++) {
        const a = rng() * Math.PI * 2;
        const d = randRange(rng, 0.45, 0.9) * (ch.r - 1);
        const x = ch.x + Math.cos(a) * d;
        const z = ch.z + Math.sin(a) * d;
        if (!clear(x, z, 4)) continue;
        const len = randRange(rng, 0.6, 1.9);
        const r = len * randRange(rng, 0.2, 0.3);
        const y = this.floorHeight(x, z);
        rock.push(part(new THREE.ConeGeometry(r, len, 6), i % 2 ? '#6a655f' : '#76706a', { x, y: y + len / 2 - 0.1, z, seed: 3200 + i, jitter: r * 0.12, shade: 0.08 }));
        if (len > 1.0) this.stalagmites.push({ x, z, r: r * 0.8 });
      }
      // duvar kristalleri (yalnızca süs; parlak)
      const nCrys = Math.round(ch.r * 0.8);
      for (let i = 0; i < nCrys; i++) {
        const a = rng() * Math.PI * 2;
        const d = ch.r + randRange(rng, 0.1, 0.6);
        const x = ch.x + Math.cos(a) * d;
        const z = ch.z + Math.sin(a) * d;
        if (this.sdf(x, z) < 0) continue;
        const y = this.floorHeight(x, z) + randRange(rng, 0, 1.5);
        for (let k = 0; k < 3; k++) {
          const g = new THREE.OctahedronGeometry(0.5, 0);
          const len = randRange(rng, 0.35, 0.9);
          g.scale(0.18, len, 0.18);
          glow.push(part(g, k % 2 ? '#6fe3ff' : '#9df5ff', {
            x: x + randRange(rng, -0.25, 0.25), y: y + len * 0.3, z: z + randRange(rng, -0.25, 0.25),
            rx: randRange(rng, -0.6, 0.6), rz: randRange(rng, -0.6, 0.6), seed: 3300 + i * 3 + k,
          }));
        }
      }
    }
    if (rock.length) {
      const m = new THREE.Mesh(merge(rock), sharedMaterials.standard);
      m.name = 'caveRocks';
      this.group.add(m);
    }
    if (glow.length) {
      const m = new THREE.Mesh(merge(glow), sharedMaterials.glow);
      m.name = 'caveCrystals';
      this.group.add(m);
    }
    for (const s of this.stalagmites) this.world.collision.addCircle(s.x, s.z, s.r, { name: 'Dikit' }, 'cave');
  }

  // ── Çıkış: tavandaki yarıktan süzülen gün ışığı + ip merdiven ─────
  buildExit() {
    const { x, z } = this.def.exit;
    const floorY = this.floorHeight(x, z);
    const top = this.ceilingHeight(x, z);
    const shaftH = top - floorY + 8;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.6, shaftH, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: '#fff3d0', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
    );
    shaft.position.set(x, floorY + shaftH / 2, z);
    this.shaft = shaft;
    this.group.add(shaft);
    const parts = [];
    // ip merdiven
    for (const side of [-0.25, 0.25]) parts.push(part(new THREE.CylinderGeometry(0.03, 0.03, top - floorY + 0.5, 4), '#cdb88a', { x: x + side, y: (top + floorY) / 2, z, seed: 3400 }));
    for (let y = floorY + 0.35; y < top - 0.2; y += 0.38) parts.push(part(new THREE.BoxGeometry(0.6, 0.05, 0.08), '#8a6440', { x, y, z, seed: 3401 }));
    // yere düşmüş taşlar ve ışık lekesi
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      parts.push(part(new THREE.DodecahedronGeometry(0.3 + (i % 3) * 0.12, 0), '#7d786f', { x: x + Math.cos(a) * 1.6, y: floorY + 0.15, z: z + Math.sin(a) * 1.6, seed: 3410 + i, jitter: 0.05 }));
    }
    this.group.add(new THREE.Mesh(merge(parts), sharedMaterials.standard));
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(1.7, 20),
      new THREE.MeshBasicMaterial({ color: '#fff0c8', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, floorY + 0.06, z);
    this.group.add(pool);

    this.exitLight = this.world.lights.add({ x, y: floorY + 3, z, color: '#ffe6b0', intensity: 5, distance: 14, flicker: false });
    this.exitPoint = { x, y: floorY, z };
    this.world.addInteractable({
      kind: 'caveExit', x, y: floorY + 1, z, range: 3.2, pickRadius: 1.0, pickHeight: 2.2,
      getPrompt: () => ({ action: 'Mağaradan Çık', name: 'Işık Yarığı' }),
      interact: (game) => game.exitCave(),
    });
  }

  // ── Kaynaklar (ResourceManager.generate çağırır) ────────
  placeResources(rm, rng) {
    const placed = [];
    const keep = [
      { ...this.def.spawn, r: 3.5 }, { ...this.def.exit, r: 3.5 },
      ...Object.values(this.world.island.def.landmarks).filter((l) => l.cave).map((l) => ({ x: l.x, z: l.z, r: 4.5 })),
      ...this.stalagmites.map((s) => ({ x: s.x, z: s.z, r: s.r + 1.2 })),
    ];
    const plan = {
      entry: [['coal_ore', 1], ['cave_mushroom', 1]],
      hall: [['crystal_node', 5], ['coal_ore', 4], ['cave_mushroom', 1]],
      deep: [['iron_ore', 6], ['coal_ore', 2], ['crystal_node', 1]],
      grotto: [['cave_mushroom', 5], ['crystal_node', 2], ['iron_ore', 1]],
    };
    for (const [id, list] of Object.entries(plan)) {
      const ch = this.chambers[id];
      if (!ch) continue;
      for (const [type, count] of list) {
        let n = 0;
        for (let tries = 0; tries < 200 && n < count; tries++) {
          const a = rng() * Math.PI * 2;
          const near = type === 'crystal_node' || type === 'iron_ore' || type === 'coal_ore';
          const d = near ? randRange(rng, 0.55, 0.85) * ch.r : Math.sqrt(rng()) * (ch.r - 1.5);
          const x = ch.x + Math.cos(a) * d;
          const z = ch.z + Math.sin(a) * d;
          if (this.sdf(x, z) > -1.4) continue;
          if (keep.some((k) => Math.hypot(k.x - x, k.z - z) < k.r)) continue;
          if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 3)) continue;
          rm.createNode(type, x, z, rng, this.floorHeight(x, z) - 0.08);
          placed.push({ x, z });
          n++;
        }
      }
    }
  }

  // ── Oyuncu sınırlaması ──────────────────────────────────
  /** Oyuncuyu mağara duvarlarının içinde tutar. */
  constrain(pos, radius) {
    const d = this.sdf(pos.x, pos.z);
    const limit = -radius * 0.6;
    if (d <= limit) return false;
    const e = 0.05;
    let gx = this.sdf(pos.x + e, pos.z) - this.sdf(pos.x - e, pos.z);
    let gz = this.sdf(pos.x, pos.z + e) - this.sdf(pos.x, pos.z - e);
    const len = Math.hypot(gx, gz) || 1;
    gx /= len;
    gz /= len;
    const push = d - limit;
    pos.x -= gx * push;
    pos.z -= gz * push;
    return true;
  }

  update(dt) {
    this.time += dt;
    if (this.shaft) this.shaft.material.opacity = 0.13 + Math.sin(this.time * 0.8) * 0.03;
  }
}

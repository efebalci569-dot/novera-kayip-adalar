import * as THREE from 'three';
import { buildDecorGeometries, sharedMaterials } from './Models.js';
import { buildChunkedInstances, DistanceCuller } from './InstancedChunks.js';
import { mulberry32, randRange } from '../utils/math.js';

// Toplanamayan süs nesneleri: dünyayı canlı ve dolu gösterir.
//   collider : model yarıçapı başına çarpışma (ölçekle çarpılır) — yoksa içinden geçilir
//   sink     : zemine gömme oranı (ölçekle çarpılır), eğimde havada kalmasın diye
const RULES = [
  { key: 'boulder', variants: 3, count: 70, scale: [1.3, 3.0], spacing: 7, collider: 1.0, shadow: true, sink: 0.25,
    test: (i) => (i.region === 'meadow' || i.region === 'forest') && i.slope < 0.7 },
  { key: 'boulder', variants: 3, count: 150, scale: [2.0, 6.5], spacing: 9, collider: 1.0, shadow: true, sink: 0.3,
    test: (i) => i.region === 'mountain' },
  { key: 'boulder', variants: 3, count: 25, scale: [1.2, 2.6], spacing: 8, collider: 1.0, shadow: true, sink: 0.3,
    test: (i) => i.region === 'beach' && i.inland > 3 },
  { key: 'crag', variants: 2, count: 90, scale: [2.0, 5.5], spacing: 10, collider: 0.85, shadow: true, sink: 0.5,
    test: (i) => i.region === 'mountain' && i.h > 22 },
  { key: 'fern', variants: 2, count: 520, scale: [0.8, 1.5], spacing: 1.8, avoidNodes: true, drawDist: 70,
    test: (i) => i.region === 'forest' },
  { key: 'bush', variants: 3, count: 320, scale: [0.8, 1.6], spacing: 2.6, avoidNodes: true, drawDist: 150,
    test: (i) => i.region === 'forest' || (i.region === 'meadow' && i.forest > 0.3) },
  { key: 'log', variants: 2, count: 45, scale: [0.9, 1.25], spacing: 6, shadow: true, avoidNodes: true, drawDist: 110,
    test: (i) => i.region === 'forest' && i.slope < 0.4 },
  { key: 'stump', variants: 1, count: 45, scale: [0.8, 1.3], spacing: 4, collider: 0.5, shadow: true, sink: 0.05, drawDist: 110,
    test: (i) => i.region === 'forest' || i.region === 'meadow' },
  { key: 'mushrooms', variants: 2, count: 200, scale: [0.9, 1.5], spacing: 2, avoidNodes: true, drawDist: 45,
    test: (i) => i.region === 'forest' },
  { key: 'shells', variants: 2, count: 170, scale: [0.9, 1.4], spacing: 3, avoidNodes: true, drawDist: 45,
    test: (i) => i.region === 'beach' && i.h > 0.25 && i.inland < 14 },
  { key: 'reeds', variants: 2, count: 80, scale: [0.8, 1.3], spacing: 1.6, lake: true, drawDist: 90,
    test: (i) => i.lakeShore },
];

export class DecorScatter {
  constructor(world, exclusions) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'decor';
    this.placed = new Map();
    this.cellSize = 8;
    this.culler = new DistanceCuller();
    this.scatter(exclusions);
  }

  cellKey(ix, iz) {
    return ix * 73856093 ^ iz * 19349663;
  }

  tooClose(x, z, r) {
    const cs = this.cellSize;
    const ix0 = Math.floor((x - r - 4) / cs), ix1 = Math.floor((x + r + 4) / cs);
    const iz0 = Math.floor((z - r - 4) / cs), iz1 = Math.floor((z + r + 4) / cs);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        for (const p of this.placed.get(this.cellKey(ix, iz)) ?? []) {
          if (Math.hypot(p.x - x, p.z - z) < r + p.r) return true;
        }
      }
    }
    return false;
  }

  remember(x, z, r) {
    const k = this.cellKey(Math.floor(x / this.cellSize), Math.floor(z / this.cellSize));
    let list = this.placed.get(k);
    if (!list) this.placed.set(k, (list = []));
    list.push({ x, z, r });
  }

  scatter(exclusions) {
    const { terrain, island, collision, resources } = this.world;
    const rng = mulberry32(island.def.seed * 17 + 3);
    const lake = island.lake;
    const blocked = (x, z) => exclusions.some((e) => Math.hypot(x - e.x, z - e.z) < e.r);

    for (const rule of RULES) {
      const geos = buildDecorGeometries(rule.key, rule.variants);
      const items = [];
      for (let tries = 0; tries < rule.count * 40 && items.length < rule.count; tries++) {
        let x, z;
        if (rule.lake) {
          const a = rng() * Math.PI * 2;
          const r = lake.radius * randRange(rng, 1.15, 1.6);
          x = lake.x + Math.cos(a) * r;
          z = lake.z + Math.sin(a) * r;
        } else {
          x = randRange(rng, -210, 210);
          z = randRange(rng, -210, 210);
        }
        if (blocked(x, z)) continue;
        const h = terrain.getHeight(x, z);
        if (h < 0.15) continue;
        const dl = Math.hypot(x - lake.x, z - lake.z);
        const info = {
          h,
          region: island.region(x, z, h),
          slope: terrain.getSlope(x, z),
          inland: island.inland(x, z),
          forest: island.forestMask(x, z),
          lakeShore: dl > lake.radius * 1.1 && h > lake.level - 0.2 && h < lake.level + 0.8,
        };
        if (!rule.lake && island.isInLake(x, z, 1)) continue;
        if (!rule.test(info)) continue;

        const scale = randRange(rng, rule.scale[0], rule.scale[1]);
        const spacing = rule.spacing * Math.max(1, scale * 0.6);
        if (this.tooClose(x, z, spacing / 2)) continue;
        const colR = rule.collider ? rule.collider * scale * 1.1 : 0;
        if (colR && collision.overlapsCircle(x, z, colR)) continue;
        if (rule.avoidNodes && resources.queryNear(x, z, 1.3).length) continue;
        if (colR && resources.queryNear(x, z, colR + 1).length) continue;

        this.remember(x, z, spacing / 2);
        if (colR) collision.addCircle(x, z, colR * 0.85, 'decor');
        const sink = (rule.sink ?? 0) * scale + info.slope * 0.32 * Math.min(scale, 4);
        items.push({
          variant: Math.floor(rng() * rule.variants), x, y: h - sink, z, yaw: rng() * Math.PI * 2, scale,
        });
      }
      const meshes = buildChunkedInstances(this.group, geos, items, sharedMaterials.standard, {
        name: rule.key,
        chunkSize: rule.drawDist ? 50 : 120,
        castShadow: !!rule.shadow,
        receiveShadow: true,
        padding: 2,
      });
      if (rule.drawDist) this.culler.add(meshes, rule.drawDist);
    }
  }

  update(cameraPos) {
    this.culler.update(cameraPos);
  }
}

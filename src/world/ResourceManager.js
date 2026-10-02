import * as THREE from 'three';
import { RESOURCES } from '../data/resources.js';
import {
  buildResourceGeometries, buildTreeStumpGeometry, sharedMaterials, createOccluderFadeMaterial,
  createWindMaterial, createWindDepthMaterial,
} from './Models.js';
import { ResourceNode } from './ResourceNode.js';
import { WATER_LEVEL } from './Island.js';
import { buildChunkedInstances, DistanceCuller } from './InstancedChunks.js';
import { mulberry32, randRange, clamp } from '../utils/math.js';

const SPACING = {
  palm_tree: 4.6, oak_tree: 5.6, pine_tree: 5.0, rock: 4.6, pebble: 2.2, stick: 2.2,
  fiber_bush: 2.4, berry_bush: 3.0, coconut: 1.0, fish_spot: 22, vine_tangle: 3.2,
  coal_ore: 3.5, iron_ore: 3.5, crystal_node: 3.0, cave_mushroom: 2.0,
  cactus: 4.2, desert_shrub: 2.6, sandstone_rock: 4.6, copper_rock: 4.2, bone_pile: 3.0,
  snow_pine: 5.0, ice_rock: 4.4, iron_vein: 4.2, frost_bush: 3.0,
  charred_tree: 4.6, obsidian_rock: 4.0, sulfur_vent: 4.0, basalt_rock: 4.8,
};

// Yeni adaların kaynak dağılımı (biyoma göre). i: { x, z, h, region, inland, slope, forest, island }
const BIOME_RULES = {
  desert: [
    { type: 'palm_tree', count: 22, test: (i) => i.forest > 0.35 && i.h > 0.8 && i.slope < 0.7 },
    { type: 'cactus', count: 75, test: (i) => (i.region === 'd_dunes' || (i.region === 'd_beach' && i.inland > 10)) && i.slope < 0.7 },
    { type: 'desert_shrub', count: 60, test: (i) => i.region === 'd_dunes' || i.region === 'd_beach' },
    { type: 'sandstone_rock', count: 32, test: (i) => i.region === 'd_dunes' && i.slope < 0.8 },
    { type: 'copper_rock', count: 14, test: (i) => i.region === 'd_dunes' && i.mesa > 0.02 && i.slope < 0.9 },
    { type: 'copper_rock', count: 8, test: (i) => i.region === 'd_dunes' && i.slope < 0.6 },
    { type: 'bone_pile', count: 14, test: (i) => i.region === 'd_dunes' },
    { type: 'stick', count: 30, test: (i) => i.region === 'd_dunes' || i.region === 'd_oasis' },
    { type: 'pebble', count: 40, test: (i) => i.region === 'd_beach' || i.region === 'd_dunes' },
    { type: 'fiber_bush', count: 10, test: (i) => i.region === 'd_oasis' && i.h > 0.8 },
    { type: 'berry_bush', count: 6, test: (i) => i.region === 'd_oasis' },
    { type: 'fish_spot', count: 8, test: (i) => i.h > -1.9 && i.h < -0.6 && i.inland < -2 },
  ],
  ice: [
    { type: 'snow_pine', count: 160, test: (i) => i.region === 'i_forest' && i.slope < 0.9 },
    { type: 'snow_pine', count: 30, test: (i) => i.region === 'i_tundra' && i.slope < 0.7 },
    { type: 'snow_pine', count: 30, test: (i) => i.region === 'i_peak' && i.h < 45 && i.slope < 1.1 },
    { type: 'ice_rock', count: 30, test: (i) => (i.region === 'i_tundra' || i.region === 'i_peak') && i.slope < 1.1 },
    { type: 'iron_vein', count: 16, test: (i) => (i.region === 'i_peak' || i.region === 'i_tundra') && i.h > 6 && i.slope < 1.2 },
    { type: 'rock', count: 28, test: (i) => i.region === 'i_tundra' || i.region === 'i_peak' },
    { type: 'frost_bush', count: 40, test: (i) => i.region === 'i_tundra' || i.region === 'i_forest' },
    { type: 'stick', count: 55, test: (i) => i.region === 'i_forest' || i.region === 'i_tundra' },
    { type: 'pebble', count: 40, test: (i) => i.region === 'i_shore' || i.region === 'i_tundra' },
    { type: 'fiber_bush', count: 14, test: (i) => i.region === 'i_tundra' },
    { type: 'fish_spot', count: 8, test: (i) => i.h > -1.9 && i.h < -0.6 && i.inland < -2 },
  ],
  volcano: [
    { type: 'charred_tree', count: 90, test: (i) => i.region === 'v_ash' && i.forest > 0.2 && i.slope < 0.8 },
    { type: 'charred_tree', count: 25, test: (i) => i.region === 'v_slope' && i.h < 30 && i.slope < 0.9 },
    { type: 'basalt_rock', count: 45, test: (i) => (i.region === 'v_ash' || i.region === 'v_slope') && i.slope < 1.0 },
    { type: 'obsidian_rock', count: 26, test: (i) => i.nearLava && i.slope < 1.0 },
    { type: 'obsidian_rock', count: 8, test: (i) => i.region === 'v_slope' && i.slope < 1.0 },
    { type: 'sulfur_vent', count: 22, test: (i) => (i.region === 'v_slope' || i.region === 'v_crater') && i.slope < 1.1 },
    { type: 'sulfur_vent', count: 6, test: (i) => i.region === 'v_ash' },
    { type: 'pebble', count: 40, test: (i) => i.region === 'v_beach' || i.region === 'v_ash' },
    { type: 'stick', count: 35, test: (i) => i.region === 'v_ash' },
    { type: 'fish_spot', count: 6, test: (i) => i.h > -1.9 && i.h < -0.6 && i.inland < -2 },
  ],
};

// Ağaç türüne göre rüzgâr salınımı (tepe yüksekliği ve genliği)
const TREE_WIND = {
  palm_tree: { height: 10, amp: 0.42, flutter: 0.05 },
  oak_tree: { height: 9, amp: 0.26, flutter: 0.045 },
  pine_tree: { height: 12, amp: 0.3, flutter: 0.025 },
  snow_pine: { height: 11, amp: 0.26, flutter: 0.02 },
  charred_tree: { height: 6, amp: 0.05, flutter: 0.0 },
  cactus: { height: 4, amp: 0.02, flutter: 0.0 },
};
const PLANT_WIND = { height: 1.6, amp: 0.09, flutter: 0.03 };
const STUMP_CAPACITY = 400;


// Büyük nesneler dünya parçalarına bölünerek çizilir (görünmeyen parçalar atlanır)
const CHUNKED_GROUPS = new Set(['tree', 'rock']);

const SHADOW_TYPES = new Set([
  'palm_tree', 'oak_tree', 'pine_tree', 'rock', 'berry_bush', 'vine_tangle',
  'cactus', 'sandstone_rock', 'copper_rock', 'snow_pine', 'ice_rock', 'iron_vein', 'charred_tree', 'obsidian_rock', 'basalt_rock', 'sulfur_vent',
]);

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qTilt = new THREE.Quaternion();
const _qYaw = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const easeIn = (t) => t * t;

/** Devrilen ağaçların yerinde kalan kütükler (tek InstancedMesh, boş yuvalar sıfır ölçekli). */
class StumpPool {
  constructor(group) {
    this.mesh = new THREE.InstancedMesh(buildTreeStumpGeometry(), sharedMaterials.standard, STUMP_CAPACITY);
    this.mesh.name = 'stumps';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    for (let i = 0; i < STUMP_CAPACITY; i++) this.mesh.setMatrixAt(i, _zero);
    this.free = Array.from({ length: STUMP_CAPACITY }, (_, i) => STUMP_CAPACITY - 1 - i);
    this.used = new Set();
    this.mesh.count = 0; // yalnızca kullanılan yuvalar çizilir
    group.add(this.mesh);
  }

  updateCount() {
    let max = -1;
    for (const i of this.used) if (i > max) max = i;
    this.mesh.count = max + 1;
  }

  add(node) {
    if (node.stumpIndex !== undefined && node.stumpIndex >= 0) return;
    const idx = this.free.pop();
    if (idx === undefined) return;
    node.stumpIndex = idx;
    this.used.add(idx);
    this.updateCount();
    const s = node.scale * (node.def.stump ?? 0.8);
    _qYaw.setFromAxisAngle(_up, node.yaw);
    _m.compose(_p.set(node.x, node.y + 0.05, node.z), _qYaw, _s.set(s, s * 0.9, s));
    this.mesh.setMatrixAt(idx, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  remove(node) {
    if (node.stumpIndex === undefined || node.stumpIndex < 0) return;
    this.mesh.setMatrixAt(node.stumpIndex, _zero);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.free.push(node.stumpIndex);
    this.used.delete(node.stumpIndex);
    this.updateCount();
    node.stumpIndex = -1;
  }
}

/**
 * Kaynak düğümlerini üretir, InstancedMesh'lerle çizer, animasyonlarını ve
 * yeniden doğmalarını yönetir.
 */
export class ResourceManager {
  constructor(world) {
    this.world = world;
    this.island = world.island;
    this.terrain = world.terrain;
    this.collision = world.collision;
    this.group = new THREE.Group();
    this.group.name = 'resources';
    // mağara kaynakları ayrı grupta (mağaraya girince yalnızca bunlar görünür)
    this.caveGroup = new THREE.Group();
    this.caveGroup.name = 'caveResources';
    this.nodes = [];
    this.byType = {};
    this.grid = new Map();
    this.cellSize = 10;
    this.animating = new Set();
    this.depleted = new Set();
    this.animatedTypes = [];
    this.respawnTimer = 0;
    // ağaçlar kamera ile oyuncu arasında kalınca şeffaflaşır (WorldManager günceller) ve rüzgârda sallanır
    this.treeMaterials = {};
    this.plantMaterial = createWindMaterial(PLANT_WIND);
    this.culler = new DistanceCuller();
    this.stumps = new StumpPool(this.group);
    this.lodPairs = [];
    this.lodDistance = 70; // parça kenarına bu mesafeden uzak ağaçlar düşük poligonlu çizilir (kaliteyle değişir)
    // her adanın kaynakları kendi grubunda (uzaktaki adalar tamamen gizlenir)
    this.islandGroups = {};
    for (const isl of world.islands) {
      const g = new THREE.Group();
      g.name = `resources:${isl.id}`;
      this.group.add(g);
      this.islandGroups[isl.id] = g;
    }
  }

  setIslandVisible(id, vis) {
    const g = this.islandGroups[id];
    if (g) g.visible = vis;
  }

  // ── Uzamsal ızgara ──────────────────────────────────────
  cellKey(ix, iz) {
    return ix * 73856093 ^ iz * 19349663;
  }

  addToGrid(node) {
    const k = this.cellKey(Math.floor(node.x / this.cellSize), Math.floor(node.z / this.cellSize));
    let cell = this.grid.get(k);
    if (!cell) this.grid.set(k, (cell = []));
    cell.push(node);
  }

  forEachNear(x, z, radius, fn) {
    const cs = this.cellSize;
    for (let ix = Math.floor((x - radius) / cs); ix <= Math.floor((x + radius) / cs); ix++) {
      for (let iz = Math.floor((z - radius) / cs); iz <= Math.floor((z + radius) / cs); iz++) {
        const cell = this.grid.get(this.cellKey(ix, iz));
        if (!cell) continue;
        for (const n of cell) {
          const d = Math.hypot(n.x - x, n.z - z);
          if (d <= radius) fn(n, d);
        }
      }
    }
  }

  queryNear(x, z, radius, filter = null) {
    const out = [];
    this.forEachNear(x, z, radius, (n, d) => {
      if (!filter || filter(n)) out.push({ node: n, dist: d });
    });
    return out;
  }

  nearestOfType(type, x, z, maxDist = 120) {
    let best = null;
    let bestD = maxDist;
    for (const n of this.byType[type] ?? []) {
      if (!n.interactable) continue;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  // ── Üretim ──────────────────────────────────────────────
  generate(exclusions) {
    const rng = mulberry32(this.island.def.seed * 31 + 7);
    const isl = this.island;
    const ter = this.terrain;
    this.exclusions = exclusions;

    const info = (x, z) => {
      const h = ter.getHeight(x, z);
      return { x, z, h, region: isl.region(x, z, h), inland: isl.inland(x, z), slope: ter.getSlope(x, z) };
    };

    const blocked = (x, z) => {
      for (const e of exclusions) if (Math.hypot(x - e.x, z - e.z) < e.r) return true;
      return isl.isInLake(x, z, 1.5);
    };

    const tryPlace = (type, x, z) => {
      if (blocked(x, z)) return null;
      const sp = SPACING[type];
      let ok = true;
      this.forEachNear(x, z, sp + 4, (n, d) => {
        if (d < (sp + n.spacing) / 2) ok = false;
      });
      if (!ok) return null;
      return this.createNode(type, x, z, rng);
    };

    // 1) Başlangıç sahili: ilk görevler için yakın kaynaklar garanti edilir
    const sp = isl.spawn;
    const inward = Math.atan2(-sp.z, -sp.x);
    const starter = [
      ['stick', 7, 4, 16], ['pebble', 6, 4, 18], ['fiber_bush', 5, 6, 18],
      ['palm_tree', 4, 8, 20], ['berry_bush', 1, 10, 20],
    ];
    for (const [type, count, rMin, rMax] of starter) {
      let placed = 0;
      for (let tries = 0; tries < 300 && placed < count; tries++) {
        const a = inward + randRange(rng, -1.6, 1.6);
        const r = randRange(rng, rMin, rMax);
        const x = sp.x + Math.cos(a) * r;
        const z = sp.z + Math.sin(a) * r;
        const h = ter.getHeight(x, z);
        if (h < 0.5) continue;
        if (tryPlace(type, x, z)) placed++;
      }
    }
    // başlangıca yakın bir balık sürüsü
    for (let tries = 0; tries < 200; tries++) {
      const a = Math.PI / 2 + randRange(rng, -0.35, 0.35);
      const p = isl.pointAtInland(a, -randRange(rng, 6, 12));
      const h = ter.getHeight(p.x, p.z);
      if (h < -1.8 || h > -0.7) continue;
      if (tryPlace('fish_spot', p.x, p.z)) break;
    }

    // 2) Genel dağılım
    const rules = [
      { type: 'palm_tree', count: 90, test: (i) => i.region === 'beach' && i.inland > 7 && i.h > 0.8 },
      { type: 'palm_tree', count: 25, test: (i) => i.region === 'meadow' && i.inland < 50 },
      { type: 'oak_tree', count: 240, test: (i) => i.region === 'forest' && i.slope < 0.8 },
      { type: 'oak_tree', count: 30, test: (i) => i.region === 'meadow' && i.slope < 0.6 },
      { type: 'pine_tree', count: 150, test: (i) => i.region === 'mountain' && i.h < 70 && i.slope < 1.3 },
      { type: 'pine_tree', count: 25, test: (i) => i.region === 'forest' && i.h > 9 },
      { type: 'rock', count: 45, test: (i) => (i.region === 'meadow' || i.region === 'forest') && i.h > 2.5 },
      { type: 'rock', count: 60, test: (i) => i.region === 'mountain' && i.slope < 1.2 },
      { type: 'rock', count: 8, test: (i) => i.region === 'beach' && i.inland > 4 },
      { type: 'pebble', count: 60, test: (i) => i.region === 'beach' && i.h > 0.4 },
      { type: 'pebble', count: 40, test: (i) => i.region === 'meadow' || i.region === 'mountain' },
      { type: 'stick', count: 110, test: (i) => i.region === 'forest' || i.region === 'meadow' || (i.region === 'beach' && i.inland > 8) },
      { type: 'fiber_bush', count: 110, test: (i) => (i.region === 'meadow' || i.region === 'forest' || i.region === 'beach') && i.h > 0.8 },
      { type: 'berry_bush', count: 55, test: (i) => i.region === 'forest' || i.region === 'meadow' },
      { type: 'fish_spot', count: 18, test: (i) => i.h > -1.9 && i.h < -0.6 && i.inland < -2 },
      { type: 'vine_tangle', count: 38, test: (i) => i.region === 'forest' && i.slope < 0.7 },
      { type: 'vine_tangle', count: 6, test: (i) => i.region === 'meadow' && i.slope < 0.5 && isl.forestMask(i.x, i.z) > 0.25 },
    ];
    for (const rule of rules) {
      let placed = 0;
      for (let tries = 0; tries < rule.count * 60 && placed < rule.count; tries++) {
        const x = randRange(rng, -200, 200);
        const z = randRange(rng, -200, 200);
        const i = info(x, z);
        if (!rule.test(i)) continue;
        if (tryPlace(rule.type, x, z)) placed++;
      }
    }

    // 3) Palmiyelerin dibine hindistan cevizi
    for (const palm of [...(this.byType.palm_tree ?? [])]) {
      if (rng() > 0.55) continue;
      for (let t = 0; t < 4; t++) {
        const a = rng() * Math.PI * 2;
        const r = randRange(rng, 2.6, 3.6);
        const x = palm.x + Math.cos(a) * r;
        const z = palm.z + Math.sin(a) * r;
        if (ter.getHeight(x, z) < 0.4) continue;
        if (tryPlace('coconut', x, z)) break;
      }
    }

    // 4) Mağara (dağın altındaki kapalı alan) kendi kaynaklarını yerleştirir
    this.world.cave?.placeResources(this, rng);
    for (const n of this.nodes) n.island = isl.id;

    // 5) Diğer adalar (her biri kendi tohumuyla; ana adanın sırası değişmesin diye sonra)
    for (const other of this.world.islands) {
      if (other === isl) continue;
      const first = this.nodes.length;
      this.generateIsland(other, exclusions);
      for (let k = first; k < this.nodes.length; k++) this.nodes[k].island = other.id;
    }

    this.buildMeshes();
    // boss arenaları (ana adada kayıt uyumu için sonradan temizlenir)
    for (const z of this.world.landmarks.arenaZones()) this.clearArea(z.x, z.z, z.r);
  }

  /** Bir alandaki kaynakları kalıcı olarak kaldırır (arena, yapı alanı). */
  clearArea(x, z, r) {
    this.forEachNear(x, z, r, (n) => {
      if (!n.removed && !n.def.cave) this.removeNode(n);
    });
  }

  /** Çöl/buz/volkan adasının kaynakları. */
  generateIsland(island, exclusions) {
    const rng = mulberry32(island.def.seed * 31 + 7);
    const ter = this.terrain;
    const R = island.radius + 30;
    const blocked = (x, z) => {
      for (const e of exclusions) if (Math.hypot(x - e.x, z - e.z) < e.r) return true;
      if (island.isInLake(x, z, 1.5) || island.isOnIce(x, z)) return true;
      return island.isLava(x, z, 2.5);
    };
    const tryPlace = (type, x, z) => {
      if (blocked(x, z)) return null;
      const sp = SPACING[type];
      let ok = true;
      this.forEachNear(x, z, sp + 4, (n, d) => {
        if (d < (sp + n.spacing) / 2) ok = false;
      });
      if (!ok) return null;
      return this.createNode(type, x, z, rng);
    };
    const info = (x, z) => {
      const h = ter.getHeight(x, z);
      return {
        x, z, h, region: island.region(x, z, h), inland: island.inland(x, z), slope: ter.getSlope(x, z),
        forest: island.forestMask(x, z), mesa: island.mesaFactor(x, z),
        nearLava: island.biome === 'volcano' && island.isLava(x, z, 12) && !island.isLava(x, z, 3.5),
      };
    };
    // varış sahiline yakın birkaç başlangıç kaynağı (dal, çakıl)
    const sp = island.spawn;
    const inward = Math.atan2(island.cz - sp.z, island.cx - sp.x);
    for (const [type, count] of [['stick', 5], ['pebble', 5]]) {
      let placed = 0;
      for (let t = 0; t < 200 && placed < count; t++) {
        const a = inward + randRange(rng, -1.4, 1.4);
        const r = randRange(rng, 5, 18);
        const x = sp.x + Math.cos(a) * r;
        const z = sp.z + Math.sin(a) * r;
        if (ter.getHeight(x, z) < 0.5) continue;
        if (tryPlace(type, x, z)) placed++;
      }
    }
    for (const rule of BIOME_RULES[island.biome] ?? []) {
      let placed = 0;
      for (let tries = 0; tries < rule.count * 60 && placed < rule.count; tries++) {
        const x = island.cx + randRange(rng, -R, R);
        const z = island.cz + randRange(rng, -R, R);
        const i = info(x, z);
        if (i.h < (rule.type === 'fish_spot' ? -3 : 0.3)) continue;
        if (!rule.test(i)) continue;
        if (tryPlace(rule.type, x, z)) placed++;
      }
    }
    // vahadaki palmiyelerin dibine hindistan cevizi
    if (island.biome === 'desert') {
      for (const palm of (this.byType.palm_tree ?? []).filter((n) => island.contains(n.x, n.z))) {
        if (rng() > 0.6) continue;
        const a = rng() * Math.PI * 2;
        const x = palm.x + Math.cos(a) * 3;
        const z = palm.z + Math.sin(a) * 3;
        if (ter.getHeight(x, z) > 0.4) tryPlace('coconut', x, z);
      }
    }
  }

  /** y verilirse arazi yerine o yükseklik kullanılır (mağara tabanı). */
  createNode(type, x, z, rng, y = null) {
    const def = RESOURCES[type];
    const variants = def.variants ?? 1;
    const variant = Math.floor(rng() * variants);
    const scale = def.group === 'tree' ? randRange(rng, 0.85, 1.2) : def.group === 'rock' ? randRange(rng, 0.8, 1.25) : randRange(rng, 0.85, 1.15);
    if (y === null) {
      if (type === 'fish_spot') y = WATER_LEVEL;
      else {
        const slope = this.terrain.getSlope(x, z);
        y = this.terrain.getHeight(x, z) - (def.group === 'tree' ? 0.15 + slope * 0.4 : 0.03 + slope * 0.1);
      }
    }
    const node = new ResourceNode(this.nodes.length, type, def, x, y, z, rng() * Math.PI * 2, scale, variant);
    node.spacing = SPACING[type];
    this.nodes.push(node);
    (this.byType[type] ??= []).push(node);
    this.addToGrid(node);
    if (def.collider) node.collider = this.collision.addCircle(x, z, def.collider * scale, node, def.cave ? 'cave' : 'surface');
    if (def.light) {
      const L = def.light;
      node.light = this.world.lights.add({ x, y: y + L.y * scale, z, color: L.color, intensity: L.intensity, distance: L.distance, flicker: false });
    }
    return node;
  }

  treeMaterial(type) {
    return (this.treeMaterials[type] ??= createOccluderFadeMaterial(this.world.occlusion, TREE_WIND[type] ?? TREE_WIND.oak_tree));
  }

  materialFor(type) {
    const def = RESOURCES[type];
    if (def.group === 'tree') return this.treeMaterial(type);
    if (def.glow) return sharedMaterials.glow;
    if (def.sway === 'plant') return this.plantMaterial;
    return sharedMaterials.standard;
  }

  buildMeshes() {
    const geoCache = {};
    const lodCache = {};
    for (const [type, all] of Object.entries(this.byType)) {
      const byIsland = new Map();
      for (const n of all) {
        const key = n.island ?? 'novera';
        if (!byIsland.has(key)) byIsland.set(key, []);
        byIsland.get(key).push(n);
      }
      for (const [islandId, nodes] of byIsland) this.buildTypeMeshes(type, nodes, islandId, geoCache, lodCache);
      if (RESOURCES[type].animated) this.animatedTypes.push(type);
    }
  }

  buildTypeMeshes(type, nodes, islandId, geoCache, lodCache) {
    {
      const def = RESOURCES[type];
      const geos = (geoCache[type] ??= buildResourceGeometries(def.model, def.variants ?? 1));
      const isTree = def.group === 'tree';
      const big = CHUNKED_GROUPS.has(def.group);
      const parent = def.cave ? this.caveGroup : this.islandGroups[islandId] ?? this.group;
      const material = this.materialFor(type);
      const meshes = buildChunkedInstances(parent, geos, nodes, material, {
        name: type,
        chunkSize: big ? 120 : 60,
        castShadow: SHADOW_TYPES.has(type) || (def.cave && !def.glow),
        receiveShadow: isTree || def.group === 'rock',
        padding: isTree ? 14 : 1, // devrilen ağaçlar sınır küresinin dışına taşabilir
      });
      if (!big) this.culler.add(meshes, def.cave ? 60 : 130);
      if (isTree) {
        // gölgeler de rüzgârla birlikte sallansın
        const depth = createWindDepthMaterial(TREE_WIND[type] ?? TREE_WIND.oak_tree);
        for (const m of meshes) m.customDepthMaterial = depth;
        // uzak parçalar için düşük poligonlu ikiz (gölge düşürmez); LOD seçimi update() içinde
        const lodGeos = (lodCache[type] ??= buildResourceGeometries(def.model, def.variants ?? 1, true));
        const lodMeshes = buildChunkedInstances(parent, lodGeos, nodes, material, {
          name: type + '_lod', chunkSize: 120, padding: 14, assign: 'lod',
        });
        meshes.forEach((m, i) => this.lodPairs.push({ high: m, low: lodMeshes[i] }));
      }
    }
  }

  writeMatrix(n) {
    const visible = (n.active && !n.removed) || n.anim;
    const s = visible ? n.scale * n.scaleMul : 0;
    _qYaw.setFromAxisAngle(_up, n.yaw + n.extraYaw);
    if (n.tiltX || n.tiltZ) {
      const ang = Math.hypot(n.tiltX, n.tiltZ);
      _axis.set(n.tiltX / ang, 0, n.tiltZ / ang);
      _qTilt.setFromAxisAngle(_axis, ang);
      _q.multiplyQuaternions(_qTilt, _qYaw);
    } else {
      _q.copy(_qYaw);
    }
    _m.compose(_p.set(n.x, n.y + (n.offsetY ?? 0), n.z), _q, _s.set(s, s, s));
    n.mesh.setMatrixAt(n.instanceIndex, _m);
    n.mesh.instanceMatrix.needsUpdate = true;
    if (n.lodMesh) {
      n.lodMesh.setMatrixAt(n.lodIndex, _m);
      n.lodMesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ── Etkileşim ───────────────────────────────────────────
  /** Vuruş uygular. Kaynak tükendiyse true döner. */
  /** Çok oyunculu: bu düğümdeki değişikliği diğer oyunculara bildir. */
  notify(node, k, fx = 0, fz = 0) {
    const net = this.world.game.net;
    if (this.applyingRemote || !net?.active) return;
    net.emit({ t: 'node', id: node.id, k, hp: node.hp, u: node.uses, fx: +fx.toFixed(2), fz: +fz.toFixed(2) });
  }

  /** Başka bir oyuncunun yaptığı değişikliği (vurma, toplama, yeniden doğma) uygular. */
  applyRemote(msg) {
    const n = this.nodes[msg.id];
    if (!n || n.removed) return;
    this.applyingRemote = true;
    try {
      if (msg.k === 'hit') {
        const amount = n.hp - msg.hp;
        if (n.active && amount > 0) this.damage(n, amount, msg.fx, msg.fz);
      } else if (msg.k === 'use') {
        while (n.active && n.uses > msg.u) this.consumeUse(n);
      } else if (msg.k === 'respawn') {
        if (!n.active) {
          if (n.anim) this.finishAnim(n);
          this.respawn(n);
        }
      }
    } finally {
      this.applyingRemote = false;
    }
  }

  damage(node, amount, fromX, fromZ) {
    node.hp = Math.max(0, node.hp - amount);
    this.notify(node, 'hit', fromX, fromZ);
    const dx = node.x - fromX;
    const dz = node.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    if (node.hp <= 0) {
      this.deplete(node);
      if (node.def.fells) {
        // önce gıcırdayıp hafifçe eğilir, sonra hızlanarak devrilir, yere çarpıp seker, bir süre yatar ve toprağa karışır
        node.anim = { type: 'fall', t: 0, dur: 99, phase: 'creak', ang: 0, vel: 0, bounces: 0, rest: 0, sink: 0, dirX: dx / d, dirZ: dz / d };
        this.stumps.add(node);
      } else {
        node.anim = { type: 'shrink', t: 0, dur: 0.35 };
      }
      this.animating.add(node);
      return true;
    }
    const tree = node.def.group === 'tree';
    node.anim = { type: 'shake', t: 0, dur: tree ? 0.55 : 0.32, amp: tree ? 0.075 : 0.07, dirX: dx / d, dirZ: dz / d };
    this.animating.add(node);
    return false;
  }

  /** Devrilen ağacın tepesi yere değdiğinde: toz, yaprak, ses ve yakındaysa sarsıntı. */
  onTreeLanded(n, a) {
    const game = this.world.game;
    const L = (n.def.crownY ?? 7) * n.scale * 0.72;
    const x = n.x + a.dirX * L;
    const z = n.z + a.dirZ * L;
    const y = this.terrain.getHeight(x, z) + 0.4;
    const parts = this.world.particles;
    parts.emit('dust', x, y, z, 2.2);
    parts.emit(n.def.leafParticle ?? 'leaf', x, y + 0.8, z, 3);
    parts.emit('dust', n.x + a.dirX * L * 0.45, y, n.z + a.dirZ * L * 0.45, 1.2);
    const p = game.player.position;
    const dist = Math.hypot(p.x - x, p.z - z);
    game.audio.play('crash', { volume: Math.max(0.15, 1 - dist / 40) });
    if (dist < 18) game.cameraController.impact(0.14 * (1 - dist / 18));
    game.bus.emit('resource:treeLanded', { node: n });
  }

  /** Elle toplama. Kaynak tükendiyse true döner. */
  consumeUse(node) {
    node.uses = Math.max(0, node.uses - 1);
    this.notify(node, 'use');
    if (node.uses <= 0) {
      this.deplete(node);
      node.anim = { type: 'shrink', t: 0, dur: 0.3 };
      this.animating.add(node);
      return true;
    }
    node.anim = { type: 'shake', t: 0, dur: 0.3, amp: 0.07, dirX: 1, dirZ: 0.3 };
    this.animating.add(node);
    return false;
  }

  deplete(node) {
    node.active = false;
    node.respawnAt = this.world.game.time.elapsed + (node.def.respawn ?? 300);
    if (node.collider) node.collider.enabled = false;
    if (node.light) node.light.enabled = false;
    this.depleted.add(node);
  }

  /** Yapı yerleştirilen alandaki (görünmeyen, tükenmiş) kaynakları kalıcı olarak kaldırır. */
  removeNode(node) {
    node.removed = true;
    node.active = false;
    if (node.collider) node.collider.enabled = false;
    if (node.light) node.light.enabled = false;
    this.depleted.delete(node);
    this.stumps.remove(node);
    node.anim = null;
    this.animating.delete(node);
    this.writeMatrix(node);
  }

  respawn(node) {
    node.active = true;
    node.hp = node.maxHp;
    node.uses = node.maxUses;
    node.tiltX = node.tiltZ = 0;
    node.offsetY = 0;
    if (node.collider) node.collider.enabled = true;
    if (node.light) node.light.enabled = true;
    const tree = node.def.group === 'tree';
    node.anim = { type: 'grow', t: 0, dur: tree ? 1.8 : 0.9 };
    node.scaleMul = 0.01;
    if (tree) {
      this.stumps.remove(node);
      this.world.particles.emit('leaf', node.x, node.y + 0.6, node.z, 1.2);
    }
    this.animating.add(node);
    this.depleted.delete(node);
    this.notify(node, 'respawn');
  }

  // ── Güncelleme ──────────────────────────────────────────
  update(dt, elapsed, playerPos, cameraPos) {
    if (cameraPos) {
      this.culler.update(cameraPos);
      for (const pair of this.lodPairs) {
        const bs = pair.high.boundingSphere;
        const near = cameraPos.distanceTo(bs.center) - bs.radius < this.lodDistance;
        pair.high.visible = near;
        pair.low.visible = !near;
      }
    }
    for (const n of this.animating) {
      const a = n.anim;
      if (!a) {
        this.animating.delete(n);
        continue;
      }
      a.t += dt;
      const k = clamp(a.t / a.dur, 0, 1);
      if (a.type === 'shake') {
        // vuruş yönünde sönümlü sallanma + yan salınım (ağaçlarda daha uzun sürer)
        const fade = (1 - k) * (1 - k);
        const amp = Math.sin(a.t * 38) * a.amp * fade;
        const side = Math.sin(a.t * 23 + 1.3) * a.amp * 0.35 * fade;
        n.tiltX = a.dirZ * amp + a.dirX * side;
        n.tiltZ = -a.dirX * amp + a.dirZ * side;
        if (k >= 1) this.finishAnim(n);
      } else if (a.type === 'fall') {
        this.updateFall(n, a, dt);
      } else if (a.type === 'shrink') {
        n.scaleMul = 1 - k;
        if (k >= 1) this.finishAnim(n);
      } else if (a.type === 'grow') {
        if (n.def.group === 'tree') {
          // fidan gibi büyüyüp hafifçe esneyerek yerine oturur
          const e = 1 - Math.pow(1 - k, 3);
          n.scaleMul = Math.max(0.01, e + Math.sin(k * Math.PI * 3) * 0.06 * (1 - k));
        } else {
          const c1 = 1.70158, c3 = c1 + 1;
          n.scaleMul = Math.max(0.01, 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2));
        }
        if (k >= 1) this.finishAnim(n);
      }
      if (a.type !== 'fall') this.writeMatrix(n);
    }

    // animasyonlu kaynaklar (balık sürüleri döner)
    for (const type of this.animatedTypes) {
      for (const n of this.byType[type]) {
        if (!n.active || n.removed) continue;
        n.extraYaw += dt * 0.7;
        this.writeMatrix(n);
      }
    }

    this.respawnTimer -= dt;
    // çok oyunculuda yeniden doğmaları yalnızca ev sahibi yönetir (misafirlere bildirilir)
    if (this.respawnTimer <= 0 && !this.world.game.net?.isClient) {
      this.respawnTimer = 1;
      for (const n of this.depleted) {
        if (n.anim || elapsed < n.respawnAt) continue;
        if (playerPos && Math.hypot(playerPos.x - n.x, playerPos.z - n.z) < 9) continue;
        this.respawn(n);
      }
    }
  }

  /** Devrilme: fiziğe benzer açısal ivme, yere çarpınca iki küçük sekme, bekleme ve toprağa gömülme. */
  updateFall(n, a, dt) {
    const maxAng = Math.PI / 2 - 0.1;
    if (a.phase === 'creak') {
      const k = Math.min(1, a.t / 0.4);
      a.ang = 0.06 * easeIn(k) + Math.sin(a.t * 34) * 0.008 * (1 - k);
      if (k >= 1) {
        a.phase = 'fall';
        a.vel = 0.3;
      }
    } else if (a.phase === 'fall') {
      a.vel += 4.2 * Math.sin(a.ang + 0.1) * dt;
      a.ang += a.vel * dt;
      if (a.ang >= maxAng) {
        a.ang = maxAng;
        if (!a.landed) {
          a.landed = true;
          this.onTreeLanded(n, a);
        }
        if (a.bounces < 2 && a.vel > 0.35) {
          a.vel = -a.vel * (a.bounces === 0 ? 0.22 : 0.15);
          a.bounces++;
        } else {
          a.phase = 'rest';
          a.vel = 0;
        }
      }
    } else if (a.phase === 'rest') {
      a.rest += dt;
      if (a.rest > 1.4) {
        a.phase = 'sink';
        this.world.particles.emit('dust', n.x + a.dirX * 2, n.y + 0.4, n.z + a.dirZ * 2, 1.4);
      }
    } else if (a.phase === 'sink') {
      a.sink += dt;
      const k = Math.min(1, a.sink / 0.9);
      n.offsetY = -easeIn(k) * 1.4 * n.scale;
      n.scaleMul = 1 - k * 0.55;
      if (k >= 1) {
        n.offsetY = 0;
        this.finishAnim(n);
        return;
      }
    }
    n.tiltX = a.dirZ * a.ang;
    n.tiltZ = -a.dirX * a.ang;
    this.writeMatrix(n);
  }

  finishAnim(n) {
    n.anim = null;
    n.tiltX = n.tiltZ = 0;
    n.scaleMul = 1;
    this.animating.delete(n);
    this.writeMatrix(n);
  }

  // ── Kayıt ───────────────────────────────────────────────
  serialize(elapsed) {
    const out = [];
    for (const n of this.nodes) {
      if (n.isDefault()) continue;
      out.push([n.id, n.hp, n.uses, n.active ? 1 : 0, Math.max(0, Math.round(n.respawnAt - elapsed)), n.removed ? 1 : 0]);
    }
    return out;
  }

  deserialize(list, elapsed) {
    for (const [id, hp, uses, active, respawnIn, removed] of list ?? []) {
      const n = this.nodes[id];
      if (!n) continue;
      n.hp = hp;
      n.uses = uses;
      n.active = !!active;
      n.removed = !!removed;
      n.respawnAt = elapsed + respawnIn;
      if (n.collider) n.collider.enabled = n.active && !n.removed;
      if (n.light) n.light.enabled = n.active && !n.removed;
      if (!n.active && !n.removed) {
        this.depleted.add(n);
        if (n.def.fells) this.stumps.add(n);
      }
      this.writeMatrix(n);
    }
  }
}

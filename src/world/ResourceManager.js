import * as THREE from 'three';
import { RESOURCES } from '../data/resources.js';
import { buildResourceGeometries, sharedMaterials, createOccluderFadeMaterial } from './Models.js';
import { ResourceNode } from './ResourceNode.js';
import { WATER_LEVEL } from './Island.js';
import { buildChunkedInstances, DistanceCuller } from './InstancedChunks.js';
import { mulberry32, randRange, clamp } from '../utils/math.js';

const SPACING = {
  palm_tree: 4.6, oak_tree: 5.6, pine_tree: 5.0, rock: 4.6, pebble: 2.2, stick: 2.2,
  fiber_bush: 2.4, berry_bush: 3.0, coconut: 1.0, fish_spot: 22,
};


// Büyük nesneler dünya parçalarına bölünerek çizilir (görünmeyen parçalar atlanır)
const CHUNKED_GROUPS = new Set(['tree', 'rock']);

const SHADOW_TYPES = new Set(['palm_tree', 'oak_tree', 'pine_tree', 'rock', 'berry_bush']);

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qTilt = new THREE.Quaternion();
const _qYaw = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

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
    this.nodes = [];
    this.byType = {};
    this.grid = new Map();
    this.cellSize = 10;
    this.animating = new Set();
    this.depleted = new Set();
    this.animatedTypes = [];
    this.respawnTimer = 0;
    // ağaçlar kamera ile oyuncu arasında kalınca şeffaflaşır (WorldManager günceller)
    this.treeMaterial = createOccluderFadeMaterial(world.occlusion);
    this.culler = new DistanceCuller();
    this.lodPairs = [];
    this.lodDistance = 70; // parça kenarına bu mesafeden uzak ağaçlar düşük poligonlu çizilir (kaliteyle değişir)
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

    this.buildMeshes();
  }

  createNode(type, x, z, rng) {
    const def = RESOURCES[type];
    const variants = def.variants ?? 1;
    const variant = Math.floor(rng() * variants);
    const scale = def.group === 'tree' ? randRange(rng, 0.85, 1.2) : def.group === 'rock' ? randRange(rng, 0.8, 1.25) : randRange(rng, 0.85, 1.15);
    let y;
    if (type === 'fish_spot') y = WATER_LEVEL;
    else {
      const slope = this.terrain.getSlope(x, z);
      y = this.terrain.getHeight(x, z) - (def.group === 'tree' ? 0.15 + slope * 0.4 : 0.03 + slope * 0.1);
    }
    const node = new ResourceNode(this.nodes.length, type, def, x, y, z, rng() * Math.PI * 2, scale, variant);
    node.spacing = SPACING[type];
    this.nodes.push(node);
    (this.byType[type] ??= []).push(node);
    this.addToGrid(node);
    if (def.collider) node.collider = this.collision.addCircle(x, z, def.collider * scale, node);
    return node;
  }

  buildMeshes() {
    for (const [type, nodes] of Object.entries(this.byType)) {
      const def = RESOURCES[type];
      const geos = buildResourceGeometries(def.model, def.variants ?? 1);
      const isTree = def.group === 'tree';
      const big = CHUNKED_GROUPS.has(def.group);
      const meshes = buildChunkedInstances(this.group, geos, nodes, isTree ? this.treeMaterial : sharedMaterials.standard, {
        name: type,
        chunkSize: big ? 120 : 60,
        castShadow: SHADOW_TYPES.has(type),
        receiveShadow: isTree || def.group === 'rock',
        padding: isTree ? 14 : 1, // devrilen ağaçlar sınır küresinin dışına taşabilir
      });
      if (!big) this.culler.add(meshes, 130);
      if (isTree) {
        // uzak parçalar için düşük poligonlu ikiz (gölge düşürmez); LOD seçimi update() içinde
        const lodGeos = buildResourceGeometries(def.model, def.variants ?? 1, true);
        const lodMeshes = buildChunkedInstances(this.group, lodGeos, nodes, this.treeMaterial, {
          name: type + '_lod', chunkSize: 120, padding: 14, assign: 'lod',
        });
        meshes.forEach((m, i) => this.lodPairs.push({ high: m, low: lodMeshes[i] }));
      }
      if (def.animated) this.animatedTypes.push(type);
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
  damage(node, amount, fromX, fromZ) {
    node.hp = Math.max(0, node.hp - amount);
    const dx = node.x - fromX;
    const dz = node.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    if (node.hp <= 0) {
      this.deplete(node);
      if (node.def.fells) {
        node.anim = { type: 'fall', t: 0, dur: 1.5, dirX: dx / d, dirZ: dz / d, sunk: 0 };
      } else {
        node.anim = { type: 'shrink', t: 0, dur: 0.35 };
      }
      this.animating.add(node);
      return true;
    }
    node.anim = { type: 'shake', t: 0, dur: 0.32, dirX: dx / d, dirZ: dz / d };
    this.animating.add(node);
    return false;
  }

  /** Elle toplama. Kaynak tükendiyse true döner. */
  consumeUse(node) {
    node.uses = Math.max(0, node.uses - 1);
    if (node.uses <= 0) {
      this.deplete(node);
      node.anim = { type: 'shrink', t: 0, dur: 0.3 };
      this.animating.add(node);
      return true;
    }
    node.anim = { type: 'shake', t: 0, dur: 0.3, dirX: 1, dirZ: 0.3 };
    this.animating.add(node);
    return false;
  }

  deplete(node) {
    node.active = false;
    node.respawnAt = this.world.game.time.elapsed + (node.def.respawn ?? 300);
    if (node.collider) node.collider.enabled = false;
    this.depleted.add(node);
  }

  /** Yapı yerleştirilen alandaki küçük kaynakları kalıcı olarak kaldırır. */
  removeNode(node) {
    node.removed = true;
    node.active = false;
    if (node.collider) node.collider.enabled = false;
    this.depleted.delete(node);
    node.anim = null;
    this.writeMatrix(node);
  }

  respawn(node) {
    node.active = true;
    node.hp = node.maxHp;
    node.uses = node.maxUses;
    node.tiltX = node.tiltZ = 0;
    node.offsetY = 0;
    if (node.collider) node.collider.enabled = true;
    node.anim = { type: 'grow', t: 0, dur: 0.9 };
    node.scaleMul = 0.01;
    this.animating.add(node);
    this.depleted.delete(node);
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
        const amp = Math.sin(a.t * 45) * 0.07 * (1 - k);
        n.tiltX = a.dirZ * amp;
        n.tiltZ = -a.dirX * amp;
        if (k >= 1) this.finishAnim(n);
      } else if (a.type === 'fall') {
        const ang = Math.min(k * k, 1) * (Math.PI / 2 - 0.08);
        n.tiltX = a.dirZ * ang;
        n.tiltZ = -a.dirX * ang;
        if (k >= 1) {
          if (!a.landed) {
            a.landed = true;
            this.world.game.bus.emit('resource:treeLanded', { node: n });
          }
          a.sunk += dt;
          n.scaleMul = Math.max(0, 1 - a.sunk / 0.7);
          if (a.sunk >= 0.7) this.finishAnim(n);
        }
      } else if (a.type === 'shrink') {
        n.scaleMul = 1 - k;
        if (k >= 1) this.finishAnim(n);
      } else if (a.type === 'grow') {
        const c1 = 1.70158, c3 = c1 + 1;
        n.scaleMul = Math.max(0.01, 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2));
        if (k >= 1) this.finishAnim(n);
      }
      this.writeMatrix(n);
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
    if (this.respawnTimer <= 0) {
      this.respawnTimer = 1;
      for (const n of this.depleted) {
        if (n.anim || elapsed < n.respawnAt) continue;
        if (playerPos && Math.hypot(playerPos.x - n.x, playerPos.z - n.z) < 9) continue;
        this.respawn(n);
      }
    }
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
      if (!n.active && !n.removed) this.depleted.add(n);
      this.writeMatrix(n);
    }
  }
}

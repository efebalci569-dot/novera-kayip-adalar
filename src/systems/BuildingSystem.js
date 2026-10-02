import * as THREE from 'three';
import { BUILDINGS } from '../data/buildings.js';
import { ITEMS } from '../data/items.js';
import { buildBuildingGeometry, sharedMaterials } from '../world/Models.js';
import { Inventory } from '../player/Inventory.js';
import { circleHitsRect, boxHitsRect } from '../world/Collision.js';

const MAX_PLACE_DIST = 7;
const GRID = 0.5;
const COLOR_OK = 0x6ec8ff;
const COLOR_BAD = 0xff4a4a;

/** Yapının taban dikdörtgeni (dünya uzayında, döndürülmüş). */
export function footprintRect(def, x, z, rot) {
  const [x0, x1, z0, z1] = def.bounds;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return { x: x + cx * c + cz * s, z: z - cx * s + cz * c, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2, rot };
}

/** Yapının merkezden en uzak taban noktası (m). */
export function footprintRadius(def) {
  const [x0, x1, z0, z1] = def.bounds;
  return Math.max(-x0, x1, -z0, z1);
}

/**
 * İnşa sistemi: yapı seçimi, şeffaf önizleme (uygunsa mavi, bir şeyle çakışıyorsa kırmızı),
 * yerleştirme kuralları, yapıların çarpışma/platform/etkileşimleri ve kayıt.
 * Taşıtlar (sal, tekne) da aynı önizlemeyle suya indirilir.
 */
export class BuildingSystem {
  constructor(game) {
    this.game = game;
    this.buildings = [];
    this.geometries = {};
    this.nextId = 1;

    this.active = false;
    this.type = null;
    this.rotation = 0;
    this.ghost = null;
    this.placement = null;
    this.ghostOk = new THREE.MeshBasicMaterial({ color: COLOR_OK, transparent: true, opacity: 0.42, depthWrite: false });
    this.ghostBad = new THREE.MeshBasicMaterial({ color: COLOR_BAD, transparent: true, opacity: 0.45, depthWrite: false });
    // yerdeki taban çerçevesi (yapının kaplayacağı alanı gösterir)
    const og = new THREE.BufferGeometry();
    og.setAttribute('position', new THREE.BufferAttribute(new Float32Array(15), 3));
    this.outline = new THREE.Line(og, new THREE.LineBasicMaterial({ color: COLOR_OK, transparent: true, opacity: 0.9, depthTest: false }));
    this.outline.renderOrder = 6;
    this.outline.frustumCulled = false;
    this.flameTime = 0;
    this.emberTimer = 0;
    this._dir = new THREE.Vector3();
  }

  geometry(type) {
    return (this.geometries[type] ??= buildBuildingGeometry(type));
  }

  count(type) {
    return this.buildings.filter((b) => b.type === type).length;
  }

  isNearStation(station, pos, range = 4.5) {
    return this.buildings.some((b) => BUILDINGS[b.type].station === station && Math.hypot(b.x - pos.x, b.z - pos.z) < range);
  }

  canAfford(type) {
    return this.game.player.inventory.has(BUILDINGS[type].cost);
  }

  /** Seviye kilidi yoksa ya da açıldıysa true. */
  isUnlocked(type) {
    return this.game.state.buildings.has(type);
  }

  missingText(type) {
    const inv = this.game.player.inventory;
    return Object.entries(BUILDINGS[type].cost)
      .filter(([id, n]) => inv.count(id) < n)
      .map(([id, n]) => `${ITEMS[id].icon} ${inv.count(id)}/${n}`)
      .join('  ');
  }

  // ── Yerleştirme modu ────────────────────────────────────
  startPlacement(type) {
    const g = this.game;
    const def = BUILDINGS[type];
    if (!def) return false;
    if (def.vehicle ? !g.player.inventory.has(def.cost) : !this.isUnlocked(type)) return false;
    if (g.world.inCave) {
      g.notify('Mağarada inşa edemezsin.', 'warn');
      return false;
    }
    if (g.player.mounted) return false;
    this.cancel();
    this.active = true;
    this.type = type;
    this.ghost = new THREE.Mesh(this.geometry(type), this.ghostOk);
    this.ghost.renderOrder = 5;
    g.scene.add(this.ghost, this.outline);
    g.bus.emit('build:mode', { active: true, type });
    return true;
  }

  cancel() {
    if (this.ghost) {
      this.game.scene.remove(this.ghost, this.outline);
      this.ghost = null;
    }
    const was = this.active;
    this.active = false;
    this.type = null;
    this.placement = null;
    if (was) this.game.bus.emit('build:mode', { active: false });
  }

  computePlacementPoint() {
    const g = this.game;
    const cam = g.camera;
    const p = g.player.position;
    const def = BUILDINGS[this.type];
    cam.getWorldDirection(this._dir);
    let hit = null;
    if (def.vehicle) {
      // su yüzeyine bakılan nokta
      if (this._dir.y < -0.02) {
        const t = (0 - cam.position.y) / this._dir.y;
        if (t > 0 && t < 40) hit = { x: cam.position.x + this._dir.x * t, z: cam.position.z + this._dir.z * t };
      }
    } else {
      hit = g.world.terrain.raycast(cam.position, this._dir, 24);
    }
    let x, z;
    const minDist = footprintRadius(def) * 0.75 + g.player.radius + 0.6;
    const maxDist = def.vehicle ? 9 : MAX_PLACE_DIST;
    if (hit) {
      x = hit.x;
      z = hit.z;
    } else {
      const f = g.cameraController.forward(this._dir);
      x = p.x + f.x * (minDist + 1.5);
      z = p.z + f.z * (minDist + 1.5);
    }
    let dx = x - p.x;
    let dz = z - p.z;
    let d = Math.hypot(dx, dz);
    if (d < 1e-3) {
      const f = g.cameraController.forward(this._dir);
      dx = f.x; dz = f.z; d = 1;
    }
    const clamped = Math.min(Math.max(d, minDist), maxDist);
    x = p.x + (dx / d) * clamped;
    z = p.z + (dz / d) * clamped;
    return { x: Math.round(x / GRID) * GRID, z: Math.round(z / GRID) * GRID };
  }

  /** Taban dikdörtgeni boyunca örnek noktalar (yerel → dünya). */
  samplePoints(def, x, z, rot) {
    const [x0, x1, z0, z1] = def.bounds;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const pts = [];
    for (const u of [0, 0.5, 1]) {
      for (const v of [0, 0.5, 1]) {
        const lx = x0 + (x1 - x0) * u;
        const lz = z0 + (z1 - z0) * v;
        pts.push([x + lx * c + lz * s, z - lx * s + lz * c]);
      }
    }
    return pts;
  }

  /** Bir engelin oyuncuya gösterilecek adı. */
  ownerName(owner) {
    if (!owner) return 'Bir engel';
    if (owner.type && BUILDINGS[owner.type] && owner.mesh) return BUILDINGS[owner.type].name;
    return owner.def?.name ?? owner.name ?? 'Bir engel';
  }

  nodeRadius(n) {
    if (n.collider) return n.collider.r;
    const g = n.def.group;
    if (g === 'plant') return 0.7 * n.scale;
    if (g === 'fish') return 0;
    if (n.type === 'stick') return 0.6 * n.scale;
    return 0.35 * n.scale;
  }

  /**
   * Dikdörtgenle çakışan ilk nesnenin adı (yoksa null): ağaç, kaya, çalı, dal, çakıl,
   * devrik ağaç kütüğü, büyük taşlar, süs çalıları, diğer yapılar, önemli noktalar, çuvallar.
   */
  findOverlap(def, rect) {
    const world = this.game.world;
    const inner = { ...rect, hw: Math.max(0.05, rect.hw - 0.06), hd: Math.max(0.05, rect.hd - 0.06) };
    const col = world.collision.findRectOverlap(inner);
    if (col) return this.ownerName(col.owner);

    let name = null;
    world.resources.forEachNear(rect.x, rect.z, Math.hypot(rect.hw, rect.hd) + 2, (n) => {
      if (name || n.def.cave || n.removed) return;
      const stump = n.def.fells && n.stumpIndex >= 0;
      if (!n.interactable && !stump && !n.anim) return;
      const r = stump && !n.active ? 0.5 * n.scale * (n.def.stump ?? 0.8) : this.nodeRadius(n);
      if (r > 0 && circleHitsRect(n.x, n.z, r, inner)) name = n.active ? n.def.name : 'Ağaç kütüğü';
    });
    if (name) return name;

    name = world.decor.blockerIn(inner);
    if (name) return name;

    // barınaklar birbirinin tabanına taşamaz (yatak, sandık gibi küçük eşyalar içine konabilir)
    if (def.platforms || def.shelter) {
      for (const b of this.buildings) {
        const bd = BUILDINGS[b.type];
        if (!bd.platforms && !bd.shelter) continue;
        if (boxHitsRect(footprintRect(bd, b.x, b.z, b.rot), inner)) return bd.name;
      }
    }
    for (const a of this.game.animals?.list ?? []) {
      if (a.dead && !a.butchered && circleHitsRect(a.x, a.z, a.def.radius, inner)) return `${a.def.name} leşi`;
    }
    for (const d of world.drops.drops) if (!d.cave && circleHitsRect(d.x, d.z, 0.4, inner)) return 'Eşya çuvalı';
    return null;
  }

  /** { valid, y, reason } */
  checkPlacement(type, x, z, rot = this.rotation) {
    const g = this.game;
    const world = g.world;
    const def = BUILDINGS[type];
    const rect = footprintRect(def, x, z, rot);
    const result = (valid, reason, y) => ({ valid, reason, y, rect });
    if (def.vehicle) return this.checkWaterPlacement(def, x, z, rot, rect, result);
    if (world.inCave) return result(false, 'Mağarada inşa edilemez', world.getGroundHeight(x, z));

    // zemin örnekleri (kulübe tabanı gibi platformlar da zemin sayılır → içine yatak konabilir)
    const refY = g.player.position.y + 1.2;
    let minH = Infinity;
    let maxH = -Infinity;
    let sum = 0;
    let wet = false;
    const pts = this.samplePoints(def, x, z, rot);
    for (const [px, pz] of pts) {
      const h = world.getGroundHeight(px, pz, refY);
      if (h < 0.2 && world.waterSurfaceAt(px, pz) !== null) wet = true;
      minH = Math.min(minH, h);
      maxH = Math.max(maxH, h);
      sum += h;
    }
    const y = def.platforms ? maxH : sum / pts.length;
    if (wet || world.island.isInLake(x, z, Math.min(rect.hw, rect.hd))) return result(false, 'Suyun üzerine inşa edilemez', y);
    const blocker = this.findOverlap(def, rect);
    if (blocker) return result(false, `${blocker} ile çakışıyor`, y);
    const span = Math.max(1, Math.min(rect.hw, rect.hd) * 1.25);
    if (maxH - minH > (def.maxSlope ?? 0.7) * span) return result(false, 'Zemin çok eğimli', y);
    const p = g.player.position;
    if (circleHitsRect(p.x, p.z, g.player.radius, rect)) return result(false, 'Çok yakınsın — biraz geri çekil', y);
    if (!this.canAfford(type)) return result(false, `Yetersiz malzeme: ${this.missingText(type)}`, y);
    return result(true, null, y);
  }

  checkWaterPlacement(def, x, z, rot, rect, result) {
    const g = this.game;
    const world = g.world;
    const v = g.vehicles;
    if (world.inCave) return result(false, 'Burada su yok', 0);
    let shallow = false;
    for (const [px, pz] of this.samplePoints(def, x, z, rot)) {
      if (v.depthAt(px, pz) < 0.6) shallow = true;
    }
    const level = v.surface(x, z).level;
    if (shallow) return result(false, 'Suya indirmek için daha derin su gerekli', level);
    const col = world.collision.findRectOverlap(rect);
    if (col) return result(false, `${this.ownerName(col.owner)} ile çakışıyor`, level);
    for (const b of v.boats) {
      if (boxHitsRect(footprintRect(b.def, b.x, b.z, b.yaw), rect)) return result(false, `${b.def.name} ile çakışıyor`, level);
    }
    if (!this.canAfford(this.type)) return result(false, `${def.icon} ${def.name} envanterinde yok`, level);
    return result(true, null, level);
  }

  update(dt, inputEnabled) {
    this.updateFlames(dt);
    if (!this.active) return;
    const g = this.game;
    const input = g.input;
    if (inputEnabled && input.wasPressed('rotate')) {
      this.rotation += Math.PI / 4;
      g.audio.play('click');
    }
    const { x, z } = this.computePlacementPoint();
    const check = this.checkPlacement(this.type, x, z);
    this.placement = { x, z, ...check };
    this.ghost.position.set(x, check.y, z);
    this.ghost.rotation.y = this.rotation;
    this.ghost.material = check.valid ? this.ghostOk : this.ghostBad;
    this.updateOutline(check.rect, check.valid);

    if (!inputEnabled) return;
    if (input.wasPressed('secondary')) {
      this.cancel();
      return;
    }
    if (input.wasPressed('primary') || input.wasPressed('interact')) {
      if (check.valid) this.confirmPlacement();
      else {
        g.notify(check.reason, 'warn');
        g.audio.play('error');
      }
    }
  }

  updateOutline(rect, valid) {
    const def = BUILDINGS[this.type];
    const world = this.game.world;
    const pos = this.outline.geometry.attributes.position;
    const c = Math.cos(rect.rot);
    const s = Math.sin(rect.rot);
    const refY = this.game.player.position.y + 1.2;
    [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].forEach(([u, v], i) => {
      const lx = u * rect.hw;
      const lz = v * rect.hd;
      const wx = rect.x + lx * c + lz * s;
      const wz = rect.z - lx * s + lz * c;
      const y = def.vehicle ? this.ghost.position.y + 0.05 : world.getGroundHeight(wx, wz, refY) + 0.06;
      pos.setXYZ(i, wx, y, wz);
    });
    pos.needsUpdate = true;
    this.outline.material.color.setHex(valid ? COLOR_OK : COLOR_BAD);
  }

  confirmPlacement() {
    const g = this.game;
    const { x, z, y, rect } = this.placement;
    const type = this.type;
    const def = BUILDINGS[type];
    if (!g.player.inventory.removeMap(def.cost)) return;

    if (def.vehicle) {
      const boat = g.vehicles.spawn(type, x, z, this.rotation);
      g.world.particles.emit('water', x, boat.y + 0.3, z, 1.5);
      g.world.ripples.emit(x, boat.y, z, 2.6, 1.6, 0.5);
      g.audio.play('splash');
      g.notify(`${def.icon} ${def.name} suya indirildi! Yaklaşıp [E] ile bin.`, 'success');
      g.bus.emit('vehicle:launched', { type });
      this.cancel();
      g.requestSave();
      return;
    }

    g.player.startAction('build', 0.5, { target: { x, z } });
    const b = this.place(type, x, y, z, this.rotation);
    b.pop = 0;

    // yapının altında kalan, şu an görünmeyen (tükenmiş) kaynaklar orada yeniden çıkmasın
    g.world.resources.forEachNear(rect.x, rect.z, Math.hypot(rect.hw, rect.hd) + 1, (n) => {
      if (!n.active && !n.removed && !n.def.cave && circleHitsRect(n.x, n.z, this.nodeRadius(n), rect)) g.world.resources.removeNode(n);
    });

    g.world.particles.emit('dust', x, y + 0.3, z, 1.2 + footprintRadius(def) * 0.4);
    g.audio.play('build');
    g.state.stats.buildingsPlaced++;
    g.progression.addXP(def.xp ?? 10, 'build');
    g.notify(`${def.icon} ${def.name} inşa edildi!`, 'success');
    if (def.shelter && def.platforms) {
      g.state.spawnPoint = { x, y: y + (def.platforms[0]?.top ?? 0) + 0.1, z };
      g.notify(`${def.icon} Doğma noktan buraya ayarlandı.`, 'info');
    }
    if (type === 'bed') {
      const rest = this.restInfo(b);
      if (!rest.shelter) g.notify('İpucu: Yatağı bir barınağın içine koyarsan uyurken daha çok dinlenirsin.', 'info');
    }
    g.bus.emit('building:placed', { type, building: b });
    // malzemesi biterse moddan çık, yetiyorsa aynı yapıyı tekrar yerleştirebilsin
    if (!this.canAfford(type)) this.cancel();
    g.requestSave();
  }

  /** Bir yapıyı dünyaya ekler (yeni yerleştirme ya da kayıttan yükleme). */
  place(type, x, y, z, rot, storageSlots = null) {
    const g = this.game;
    const def = BUILDINGS[type];
    const mesh = new THREE.Mesh(this.geometry(type), sharedMaterials.standard);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rot;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.world.buildingsGroup.add(mesh);

    const b = { id: this.nextId++, type, x, y, z, rot, mesh, colliders: [], platforms: [], storage: null, light: null, flame: null, pop: 1 };
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const toWorld = (lx, lz) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });

    for (const col of def.colliders ?? []) {
      const w = toWorld(col.x, col.z);
      if (col.type === 'circle') b.colliders.push(g.world.collision.addCircle(w.x, w.z, col.r, b));
      else b.colliders.push(g.world.collision.addBox(w.x, w.z, col.hw, col.hd, rot, b));
    }
    b.platforms = (def.platforms ?? []).map((pl) => {
      const w = toWorld(pl.x, pl.z);
      return g.world.collision.addPlatform(w.x, w.z, pl.hw, pl.hd, rot, y + pl.top, b);
    });
    if (def.cameraBlocker) g.world.addCameraBlocker(mesh);
    const radius = footprintRadius(def);
    const rect = footprintRect(def, x, z, rot);
    // yapının içinden çimen ve küçük süsler çıkmasın
    g.world.grass.addExclusion(rect.x, rect.z, Math.hypot(rect.hw, rect.hd) * 0.8 + 0.2);
    g.world.decor.clearUnder(rect);
    if (def.storage) {
      b.storage = new Inventory(def.storage, g.bus, `chest_${b.id}`);
      if (storageSlots) b.storage.deserialize(storageSlots, def.storage);
    }
    if (def.light) {
      b.light = g.world.lights.add({ x, y: y + 0.8, z, color: '#ff9a3c', intensity: 14, distance: 20, flicker: true, priority: 2 });
      b.flame = this.createFlame();
      b.flame.position.set(x, y + 0.08, z);
      g.world.buildingsGroup.add(b.flame);
    }
    if (def.lamp) {
      const L = def.lamp;
      b.light = g.world.lights.add({ x, y: y + L.y, z, color: L.color, intensity: L.intensity, distance: L.distance, flicker: false, priority: 1 });
      b.glow = this.createCrystalGlow();
      b.glow.position.set(x, y + L.y + 0.1, z);
      g.world.buildingsGroup.add(b.glow);
    }
    if (def.interact) {
      b.interactable = g.world.addInteractable({
        kind: 'building', x, y: y + 0.5, z,
        range: radius + 1.6,
        pickRadius: Math.max(0.75, Math.min(rect.hw, rect.hd) * 0.95),
        pickHeight: def.platforms ? 2.6 : 1.0,
        getPrompt: () => this.promptFor(b),
        interact: () => this.interact(b),
      });
    }
    this.buildings.push(b);
    return b;
  }

  createFlame() {
    const group = new THREE.Group();
    const outer = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 0.85, 7),
      new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }),
    );
    outer.position.y = 0.5;
    const inner = new THREE.Mesh(
      new THREE.ConeGeometry(0.17, 0.55, 6),
      new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false }),
    );
    inner.position.y = 0.4;
    group.add(outer, inner);
    group.userData.parts = [outer, inner];
    return group;
  }

  createCrystalGlow() {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: '#8ff0ff', toneMapped: false });
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.09 + i * 0.02, 0), mat);
      m.scale.y = 2.2;
      m.position.set(Math.cos(i * 2.1) * 0.05, -0.05 + i * 0.03, Math.sin(i * 2.1) * 0.05);
      m.rotation.z = (i - 1) * 0.35;
      group.add(m);
    }
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 10, 8),
      new THREE.MeshBasicMaterial({ color: '#6fe3ff', transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    group.add(halo);
    group.userData.halo = halo;
    return group;
  }

  updateFlames(dt) {
    this.flameTime += dt;
    this.emberTimer -= dt;
    const p = this.game.player.position;
    for (const b of this.buildings) {
      if (b.pop < 1) {
        b.pop = Math.min(1, b.pop + dt * 3);
        const k = b.pop;
        const s = 1 + Math.sin(k * Math.PI) * 0.12;
        b.mesh.scale.set(s, k < 1 ? 0.6 + 0.4 * k : 1, s);
      }
      if (b.glow) {
        b.glow.rotation.y += dt * 0.6;
        b.glow.userData.halo.scale.setScalar(1 + Math.sin(this.flameTime * 2 + b.id) * 0.12);
      }
      if (!b.flame) continue;
      const [outer, inner] = b.flame.userData.parts;
      const t = this.flameTime + b.id * 1.7;
      outer.scale.set(1 + Math.sin(t * 9) * 0.08, 1 + Math.sin(t * 13) * 0.15, 1 + Math.cos(t * 11) * 0.08);
      inner.scale.set(1, 1 + Math.sin(t * 17) * 0.18, 1);
      b.flame.rotation.y = t * 0.8;
      if (this.emberTimer <= 0 && Math.hypot(b.x - p.x, b.z - p.z) < 25) {
        this.game.world.particles.emit('spark', b.x, b.y + 0.7, b.z, 0.25);
      }
    }
    if (this.emberTimer <= 0) this.emberTimer = 0.35;
  }

  /** Yatağın içinde bulunduğu barınak ve dinlenme kalitesi. */
  restInfo(bed) {
    let best = null;
    for (const b of this.buildings) {
      const def = BUILDINGS[b.type];
      if (!def.shelter || !def.interior) continue;
      const c = Math.cos(b.rot);
      const s = Math.sin(b.rot);
      const dx = bed.x - b.x;
      const dz = bed.z - b.z;
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      const [x0, x1, z0, z1] = def.interior;
      if (lx < x0 || lx > x1 || lz < z0 || lz > z1) continue;
      if (!best || def.comfort > BUILDINGS[best.type].comfort) best = b;
    }
    const def = best ? BUILDINGS[best.type] : null;
    return { shelter: def, comfort: def?.comfort ?? 0 };
  }

  promptFor(b) {
    const def = BUILDINGS[b.type];
    const prompt = { action: def.interact.action, name: def.name };
    if (def.interact.handler === 'sleep') {
      const rest = this.restInfo(b);
      if (!this.game.time.canSleep) prompt.note = '19:00\'dan sonra uyuyabilirsin';
      else prompt.note = rest.shelter ? `${rest.shelter.icon} ${rest.shelter.name} içinde: daha iyi dinlenirsin` : 'Açıkta: bir barınağın içinde daha iyi dinlenirsin';
    }
    return prompt;
  }

  interact(b) {
    const g = this.game;
    const def = BUILDINGS[b.type];
    const it = def.interact;
    if (it.panel === 'crafting') g.ui.open('crafting', { station: it.station });
    else if (it.panel === 'container') g.ui.open('container', { inventory: b.storage, title: def.name });
    else if (it.handler === 'sleep') {
      g.state.spawnPoint = { x: b.x, y: b.y + 0.5, z: b.z };
      if (!g.time.canSleep) {
        g.notify('Henüz uyku vakti değil. Akşam 19:00\'dan sonra uyuyabilirsin. (Doğma noktası yatağına ayarlandı.)', 'info');
        return;
      }
      g.sleep(this.restInfo(b));
    }
  }

  nearestFire(pos) {
    let best = Infinity;
    for (const b of this.buildings) if (b.flame) best = Math.min(best, Math.hypot(b.x - pos.x, b.z - pos.z));
    return best;
  }

  serialize() {
    return this.buildings.map((b) => ({ type: b.type, x: b.x, y: b.y, z: b.z, rot: b.rot, storage: b.storage?.serialize() }));
  }

  deserialize(list) {
    for (const d of list ?? []) {
      if (!BUILDINGS[d.type] || BUILDINGS[d.type].vehicle) continue;
      this.place(d.type, d.x, d.y, d.z, d.rot ?? 0, d.storage ?? null);
    }
  }
}

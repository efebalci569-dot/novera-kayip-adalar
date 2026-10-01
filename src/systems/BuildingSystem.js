import * as THREE from 'three';
import { BUILDINGS } from '../data/buildings.js';
import { ITEMS } from '../data/items.js';
import { buildBuildingGeometry, sharedMaterials } from '../world/Models.js';
import { Inventory } from '../player/Inventory.js';

const MAX_PLACE_DIST = 7;
const GRID = 0.5;

/**
 * İnşa sistemi: yapı seçimi, şeffaf önizleme (geçersiz yerde kırmızı),
 * yerleştirme kuralları, yapıların çarpışma/platform/etkileşimleri ve kayıt.
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
    this.ghostOk = new THREE.MeshBasicMaterial({ color: 0x9dffb0, transparent: true, opacity: 0.42, depthWrite: false });
    this.ghostBad = new THREE.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.42, depthWrite: false });
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
    if (!g.state.buildings.has(type)) return false;
    this.cancel();
    this.active = true;
    this.type = type;
    this.ghost = new THREE.Mesh(this.geometry(type), this.ghostOk);
    this.ghost.renderOrder = 5;
    g.scene.add(this.ghost);
    g.bus.emit('build:mode', { active: true, type });
    return true;
  }

  cancel() {
    if (this.ghost) {
      this.game.scene.remove(this.ghost);
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
    const hit = g.world.terrain.raycast(cam.position, this._dir, 24);
    let x, z;
    const minDist = def.footprint + g.player.radius + 0.6;
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
    const clamped = Math.min(Math.max(d, minDist), MAX_PLACE_DIST);
    x = p.x + (dx / d) * clamped;
    z = p.z + (dz / d) * clamped;
    return { x: Math.round(x / GRID) * GRID, z: Math.round(z / GRID) * GRID };
  }

  /** { valid, y, reason } */
  checkPlacement(type, x, z) {
    const g = this.game;
    const def = BUILDINGS[type];
    const r = def.footprint;
    const ter = g.world.terrain;
    let minH = Infinity;
    let maxH = -Infinity;
    let sum = 0;
    const samples = [[0, 0]];
    for (let i = 0; i < 8; i++) samples.push([Math.cos((i / 8) * Math.PI * 2) * r, Math.sin((i / 8) * Math.PI * 2) * r]);
    for (const [ox, oz] of samples) {
      const h = ter.getHeight(x + ox, z + oz);
      minH = Math.min(minH, h);
      maxH = Math.max(maxH, h);
      sum += h;
    }
    const y = def.platforms ? maxH : sum / samples.length;
    const result = (valid, reason) => ({ valid, reason, y });
    if (minH < 0.2 || g.world.island.isInLake(x, z, r)) return result(false, 'Suyun üzerine inşa edilemez');
    if (maxH - minH > def.maxSlope * Math.max(r, 1)) return result(false, 'Zemin çok eğimli');
    if (g.world.collision.overlapsCircle(x, z, r * 0.8)) return result(false, 'Başka bir şeyle çakışıyor');
    const p = g.player.position;
    if (Math.hypot(p.x - x, p.z - z) < r * 0.8 + g.player.radius) return result(false, 'Çok yakınsın');
    if (!this.canAfford(type)) return result(false, `Yetersiz malzeme: ${this.missingText(type)}`);
    return result(true, null);
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

  confirmPlacement() {
    const g = this.game;
    const { x, z, y } = this.placement;
    const type = this.type;
    const def = BUILDINGS[type];
    if (!g.player.inventory.removeMap(def.cost)) return;
    g.player.startAction('build', 0.5, { target: { x, z } });
    const b = this.place(type, x, y, z, this.rotation);
    b.pop = 0;

    // yapı alanındaki küçük kaynakları temizle
    g.world.resources.forEachNear(x, z, def.footprint + 0.3, (n) => {
      if (!n.def.collider && n.interactable) g.world.resources.removeNode(n);
    });

    g.world.particles.emit('dust', x, y + 0.3, z, 1.2);
    g.audio.play('build');
    g.state.stats.buildingsPlaced++;
    g.progression.addXP(def.xp ?? 10, 'build');
    g.notify(`${def.icon} ${def.name} inşa edildi!`, 'success');
    if (type === 'hut') {
      g.state.spawnPoint = { x: x, y: y + 0.4, z: z };
      g.notify('🛖 Doğma noktan kulübene ayarlandı.', 'info');
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
    g.world.grass.addExclusion(x, z, def.footprint + 0.25); // yapının içinden çimen çıkmasın
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
    if (def.interact) {
      b.interactable = g.world.addInteractable({
        kind: 'building', x, y: y + 0.5, z,
        range: def.footprint + 1.6,
        pickRadius: Math.max(0.75, def.footprint * 0.85),
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

  promptFor(b) {
    const def = BUILDINGS[b.type];
    const prompt = { action: def.interact.action, name: def.name };
    if (def.interact.handler === 'sleep' && !this.game.time.canSleep) {
      prompt.note = '19:00\'dan sonra uyuyabilirsin';
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
      g.state.spawnPoint = { x: b.x, y: b.y + 0.4, z: b.z };
      if (!g.time.canSleep) {
        g.notify('Henüz uyku vakti değil. Akşam 19:00\'dan sonra uyuyabilirsin. (Doğma noktası ayarlandı.)', 'info');
        return;
      }
      g.sleep();
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
      if (!BUILDINGS[d.type]) continue;
      this.place(d.type, d.x, d.y, d.z, d.rot ?? 0, d.storage ?? null);
    }
  }
}

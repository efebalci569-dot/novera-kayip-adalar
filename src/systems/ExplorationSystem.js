import { REGIONS } from '../data/regions.js';
import { LANDMARKS } from '../data/landmarks.js';
import { XP_REWARDS } from '../data/progression.js';

const FOG_SIZE = 160; // 160×160 hücre
const FOG_EXTENT = 480; // dünya genişliği (m) → hücre ≈ 3 m
const REVEAL_RADIUS = 34;

/**
 * Keşif: bölgeler, harita sisi (fog of war) ve önemli noktalar (enkaz, kamp, semboller…).
 */
export class ExplorationSystem {
  constructor(game) {
    this.game = game;
    this.discoveredRegions = new Set();
    this.currentRegion = null;
    this.landmarksDiscovered = new Set();
    this.landmarksUsed = new Set();
    this.fog = new Uint8Array(FOG_SIZE * FOG_SIZE);
    this.fogVersion = 0;
    this.timer = 0;
  }

  get fogSize() {
    return FOG_SIZE;
  }

  get fogExtent() {
    return FOG_EXTENT;
  }

  isLandmarkDiscovered(id) {
    return this.landmarksDiscovered.has(id);
  }

  isLandmarkUsed(id) {
    return this.landmarksUsed.has(id);
  }

  isRevealed(x, z) {
    const ix = Math.floor(((x + FOG_EXTENT / 2) / FOG_EXTENT) * FOG_SIZE);
    const iz = Math.floor(((z + FOG_EXTENT / 2) / FOG_EXTENT) * FOG_SIZE);
    if (ix < 0 || iz < 0 || ix >= FOG_SIZE || iz >= FOG_SIZE) return false;
    return this.fog[iz * FOG_SIZE + ix] === 1;
  }

  reveal(x, z, radius) {
    const cell = FOG_EXTENT / FOG_SIZE;
    const cx = (x + FOG_EXTENT / 2) / cell;
    const cz = (z + FOG_EXTENT / 2) / cell;
    const r = radius / cell;
    let changed = false;
    for (let iz = Math.floor(cz - r); iz <= Math.ceil(cz + r); iz++) {
      if (iz < 0 || iz >= FOG_SIZE) continue;
      for (let ix = Math.floor(cx - r); ix <= Math.ceil(cx + r); ix++) {
        if (ix < 0 || ix >= FOG_SIZE) continue;
        if ((ix - cx) ** 2 + (iz - cz) ** 2 > r * r) continue;
        const i = iz * FOG_SIZE + ix;
        if (!this.fog[i]) {
          this.fog[i] = 1;
          changed = true;
        }
      }
    }
    if (changed) this.fogVersion++;
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    const g = this.game;
    const p = g.player.position;
    const island = g.world.island;

    let region = island.region(p.x, p.z);
    if (g.player.swimming && region !== 'lake') region = 'sea';
    if (region !== this.currentRegion) {
      this.currentRegion = region;
      const def = REGIONS[region];
      const first = def?.discoverable && !this.discoveredRegions.has(region);
      if (first) {
        this.discoveredRegions.add(region);
        g.progression.addXP(XP_REWARDS.regionDiscovered, 'region');
      }
      g.bus.emit('region:entered', { id: region, first, def });
    }

    this.reveal(p.x, p.z, REVEAL_RADIUS);

    for (const e of g.world.landmarks.list) {
      if (this.landmarksDiscovered.has(e.id)) continue;
      if (Math.hypot(e.x - p.x, e.z - p.z) < e.def.discoverRadius) this.discoverLandmark(e);
    }
  }

  discoverLandmark(e) {
    if (this.landmarksDiscovered.has(e.id)) return;
    this.landmarksDiscovered.add(e.id);
    this.reveal(e.x, e.z, 20);
    this.game.progression.addXP(XP_REWARDS.landmarkDiscovered, 'landmark');
    this.game.bus.emit('landmark:discovered', { id: e.id, def: e.def });
  }

  /** Haritada gösterilecek önemli noktalar. */
  visibleLandmarks() {
    const flags = this.game.state.flags;
    return this.game.world.landmarks.list.filter((e) => {
      if (this.landmarksDiscovered.has(e.id)) return true;
      return e.def.hiddenOnMap && flags[e.def.hiddenOnMap];
    });
  }

  landmarkPrompt(entry) {
    const def = entry.def;
    const used = this.landmarksUsed.has(entry.id);
    if (used && def.gives) return { action: 'İncele', name: `${def.name} (sönük)`, disabled: true, note: 'Sembol parçasını zaten aldın' };
    if (used) return { action: def.actionAgain ?? def.action, name: def.name };
    if (def.requires) {
      const inv = this.game.player.inventory;
      const [item, n] = Object.entries(def.requires)[0];
      const have = inv.count(item);
      if (have < n) return { action: def.action, name: def.name, note: `Sembol parçaları: ${have}/${n}` };
    }
    return { action: def.action, name: def.name };
  }

  interactLandmark(entry) {
    const g = this.game;
    const def = LANDMARKS[entry.id];
    const used = this.landmarksUsed.has(entry.id);
    this.discoverLandmark(entry);

    if (used) {
      if (def.gives) return;
      if (def.lore) g.ui.open('note', { id: def.lore });
      return;
    }

    if (def.requires) {
      const inv = g.player.inventory;
      if (!inv.has(def.requires)) {
        const [item, n] = Object.entries(def.requires)[0];
        g.notify(`Kapıda üç boş yuva var. Sembol parçaları: ${inv.count(item)}/${n}`, 'info');
        g.audio.play('error');
        return;
      }
      inv.removeMap(def.requires);
    }

    if (def.gives) {
      for (const [item, n] of Object.entries(def.gives)) {
        const left = g.player.inventory.add(item, n);
        if (left > 0) g.world.drops.spawn(g.player.position.x, g.player.position.z, [{ id: item, count: left }]);
        g.bus.emit('item:gathered', { item, amount: n });
        g.ui.hud.floatText(`+${n} 💠 Antik Sembol Parçası`, '#7ff3ff');
      }
      g.world.particles.emit('magic', entry.x, entry.y + 1.6, entry.z, 1.4);
    }

    this.landmarksUsed.add(entry.id);
    g.world.landmarks.setUsed(entry.id, true);
    if (def.setsFlag) g.state.setFlag(def.setsFlag);
    if (def.lore) {
      g.state.addLore(def.lore);
      g.ui.open('note', { id: def.lore });
    }
    g.audio.play('discover');
    g.progression.addXP(15, 'lore');
    g.bus.emit('landmark:interacted', { id: entry.id });
    g.requestSave();
  }

  encodeFog() {
    const bytes = new Uint8Array(Math.ceil(this.fog.length / 8));
    for (let i = 0; i < this.fog.length; i++) if (this.fog[i]) bytes[i >> 3] |= 1 << (i & 7);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  decodeFog(b64) {
    try {
      const s = atob(b64);
      for (let i = 0; i < this.fog.length; i++) this.fog[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1;
      this.fogVersion++;
    } catch {
      /* bozuk veri: sisi sıfırdan başlat */
    }
  }

  serialize() {
    return {
      regions: [...this.discoveredRegions],
      landmarks: [...this.landmarksDiscovered],
      used: [...this.landmarksUsed],
      fog: this.encodeFog(),
    };
  }

  deserialize(d) {
    if (!d) return;
    this.discoveredRegions = new Set(d.regions ?? []);
    this.landmarksDiscovered = new Set(d.landmarks ?? []);
    this.landmarksUsed = new Set(d.used ?? []);
    for (const id of this.landmarksUsed) this.game.world.landmarks.setUsed(id, true);
    if (d.fog) this.decodeFog(d.fog);
  }
}

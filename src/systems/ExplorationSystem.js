import { REGIONS } from '../data/regions.js';
import { LANDMARKS } from '../data/landmarks.js';
import { XP_REWARDS } from '../data/progression.js';
import { ITEMS } from '../data/items.js';

const FOG_SIZE = 160; // 160×160 hücre
const FOG_EXTENT = 480; // dünya genişliği (m) → hücre ≈ 3 m
const REVEAL_RADIUS = 34;

/**
 * Keşif: bölgeler, her adanın kendi harita sisi (fog of war), ziyaret edilen adalar ve
 * önemli noktalar (enkaz, kamp, semboller, sunaklar…).
 */
export class ExplorationSystem {
  constructor(game) {
    this.game = game;
    this.discoveredRegions = new Set();
    this.currentRegion = null;
    this.currentIsland = null;
    this.visitedIslands = new Set(['novera']);
    this.landmarksDiscovered = new Set();
    this.landmarksUsed = new Set();
    this.fogs = {};
    this.fogVersion = 0;
    this.timer = 0;
  }

  /** Bir adanın sis haritası (yoksa oluşturulur). */
  fogFor(islandId) {
    return (this.fogs[islandId] ??= new Uint8Array(FOG_SIZE * FOG_SIZE));
  }

  /** Eski kod uyumu: başlangıç adasının sisi. */
  get fog() {
    return this.fogFor('novera');
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
    const isl = this.game.world.islandAt(x, z);
    if (!isl) return false;
    const fog = this.fogFor(isl.id);
    const ix = Math.floor(((x - isl.cx + FOG_EXTENT / 2) / FOG_EXTENT) * FOG_SIZE);
    const iz = Math.floor(((z - isl.cz + FOG_EXTENT / 2) / FOG_EXTENT) * FOG_SIZE);
    if (ix < 0 || iz < 0 || ix >= FOG_SIZE || iz >= FOG_SIZE) return false;
    return fog[iz * FOG_SIZE + ix] === 1;
  }

  reveal(x, z, radius) {
    const isl = this.game.world.islandAt(x, z);
    if (!isl) return;
    const fog = this.fogFor(isl.id);
    const cell = FOG_EXTENT / FOG_SIZE;
    const cx = (x - isl.cx + FOG_EXTENT / 2) / cell;
    const cz = (z - isl.cz + FOG_EXTENT / 2) / cell;
    const r = radius / cell;
    let changed = false;
    for (let iz = Math.floor(cz - r); iz <= Math.ceil(cz + r); iz++) {
      if (iz < 0 || iz >= FOG_SIZE) continue;
      for (let ix = Math.floor(cx - r); ix <= Math.ceil(cx + r); ix++) {
        if (ix < 0 || ix >= FOG_SIZE) continue;
        if ((ix - cx) ** 2 + (iz - cz) ** 2 > r * r) continue;
        const i = iz * FOG_SIZE + ix;
        if (!fog[i]) {
          fog[i] = 1;
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
    const island = g.world.inCave ? g.world.island : g.world.islandAt(p.x, p.z);

    // bir adaya ayak basınca (tekneyle varış dahil)
    const landed = island && !g.player.swimming && (g.player.grounded || g.player.mounted) && island.inland(p.x, p.z) > -2;
    if (landed && island.id !== this.currentIsland) {
      this.currentIsland = island.id;
      const first = !this.visitedIslands.has(island.id);
      this.visitedIslands.add(island.id);
      g.bus.emit('island:entered', { id: island.id, island, first });
    }

    let region = g.world.inCave ? 'cave' : island ? island.region(p.x, p.z) : 'sea';
    if (!g.world.inCave && g.player.swimming && region !== 'lake' && region !== 'd_oasis') region = 'sea';
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

    if (!g.world.inCave) this.reveal(p.x, p.z, REVEAL_RADIUS);

    for (const e of g.world.landmarks.list) {
      if (this.landmarksDiscovered.has(e.id)) continue;
      if (e.cave !== g.world.inCave) continue; // mağaradaki noktalar yüzeyden (ve tersi) keşfedilmez
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
    if (def.altar) return this.game.bosses.altarPrompt(entry);
    const used = this.landmarksUsed.has(entry.id);
    if (used && def.gives && !def.keepUsable) return { action: 'İncele', name: `${def.name} (sönük)`, disabled: true, note: 'Sembol parçasını zaten aldın' };
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
    if (def.altar) {
      g.bosses.interactAltar(entry);
      return;
    }

    if (def.enter === 'cave') {
      if (!used) {
        this.landmarksUsed.add(entry.id);
        g.bus.emit('landmark:interacted', { id: entry.id });
      }
      g.enterCave();
      return;
    }

    if (used) {
      if (def.gives && !def.keepUsable) return;
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
        g.ui.hud.floatText(`+${n} ${ITEMS[item].icon} ${ITEMS[item].name}`, '#7ff3ff');
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

  encodeFog(fog) {
    const bytes = new Uint8Array(Math.ceil(fog.length / 8));
    for (let i = 0; i < fog.length; i++) if (fog[i]) bytes[i >> 3] |= 1 << (i & 7);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  decodeFog(b64, fog) {
    try {
      const s = atob(b64);
      for (let i = 0; i < fog.length; i++) fog[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1;
      this.fogVersion++;
    } catch {
      /* bozuk veri: sisi sıfırdan başlat */
    }
  }

  serialize() {
    const fog = {};
    for (const [id, f] of Object.entries(this.fogs)) fog[id] = this.encodeFog(f);
    return {
      regions: [...this.discoveredRegions],
      landmarks: [...this.landmarksDiscovered],
      used: [...this.landmarksUsed],
      islands: [...this.visitedIslands],
      fog,
    };
  }

  deserialize(d) {
    if (!d) return;
    this.discoveredRegions = new Set(d.regions ?? []);
    this.landmarksDiscovered = new Set(d.landmarks ?? []);
    this.landmarksUsed = new Set(d.used ?? []);
    this.visitedIslands = new Set(d.islands ?? ['novera']);
    for (const id of this.landmarksUsed) this.game.world.landmarks.setUsed(id, true);
    // eski kayıtlar: tek adanın sisi düz metin olarak saklanıyordu
    if (typeof d.fog === 'string') this.decodeFog(d.fog, this.fogFor('novera'));
    else for (const [id, b64] of Object.entries(d.fog ?? {})) this.decodeFog(b64, this.fogFor(id));
  }
}

import { QUESTS, FIRST_QUEST } from '../data/quests.js';

/**
 * Görev sistemi. Görevler olaylarla (EventBus) ilerler; hiçbir sistem
 * QuestSystem'i doğrudan çağırmaz. Tamamlanan görevler ödül verir ve sıradakileri açar.
 */
export class QuestSystem {
  constructor(game) {
    this.game = game;
    this.active = new Map(); // id → { progress: number[] }
    this.completed = new Set();
    this.queue = []; // { id, delay }
    this.subscribe();
  }

  subscribe() {
    const bus = this.game.bus;
    const inc = (type, match, amount = 1) => this.advance(type, match, amount);
    bus.on('player:moved', ({ distance }) => inc('walk', () => true, distance));
    bus.on('item:gathered', ({ item, amount }) => inc('collect', (o) => o.item === item, amount));
    bus.on('craft:completed', ({ recipe, count }) => {
      inc('craft', (o) => o.item === recipe.result || o.item === recipe.id, count);
      if (recipe.station === 'campfire' && recipe.category === 'food') inc('cook', () => true, count);
    });
    bus.on('resource:depleted', ({ group }) => inc('fell', (o) => o.group === group));
    bus.on('building:placed', ({ type }) => inc('build', (o) => o.building === type));
    bus.on('landmark:discovered', ({ id }) => inc('discover', (o) => o.landmark === id));
    bus.on('landmark:interacted', ({ id }) => {
      inc('interact', (o) => o.target === id);
      inc('discover', (o) => o.landmark === id);
    });
    bus.on('region:entered', ({ id }) => {
      inc('region', (o) => o.region === id);
      this.setValue('regions', () => true, this.game.exploration.discoveredRegions.size);
    });
    bus.on('player:slept', () => inc('sleep', () => true));
    bus.on('player:drank', () => inc('drink', () => true));
    bus.on('level:up', ({ level }) => this.setValue('level', () => true, level));
    bus.on('time:newDay', ({ day }) => this.setValue('day', () => true, day));
  }

  get(id) {
    return QUESTS[id];
  }

  isActive(id) {
    return this.active.has(id);
  }

  isCompleted(id) {
    return this.completed.has(id);
  }

  /** Yeni oyunda ilk görevi başlatır. */
  begin() {
    this.start(FIRST_QUEST);
  }

  start(id) {
    const q = QUESTS[id];
    if (!q || this.active.has(id) || this.completed.has(id)) return;
    const progress = q.objectives.map((o) => Math.min(this.initialProgress(o), this.targetOf(o)));
    this.active.set(id, { progress });
    this.game.bus.emit('quest:started', { id, quest: q });
    this.checkComplete(id);
  }

  targetOf(o) {
    return o.amount ?? 1;
  }

  initialProgress(o) {
    const g = this.game;
    switch (o.type) {
      case 'collect': {
        // kapıya yerleştirilmiş sembol parçaları da sayılır (oyuncu sırayı atladıysa)
        const placed = o.item === 'rune_shard' && g.exploration.isLandmarkUsed('sealed_door') ? 3 : 0;
        return g.player.inventory.count(o.item) + placed;
      }
      case 'build': return g.building.count(o.building);
      case 'discover': return g.exploration.isLandmarkDiscovered(o.landmark) || g.exploration.isLandmarkUsed(o.landmark) ? 1 : 0;
      case 'interact': return g.exploration.isLandmarkUsed(o.target) ? 1 : 0;
      case 'region': return g.exploration.discoveredRegions.has(o.region) ? 1 : 0;
      case 'regions': return g.exploration.discoveredRegions.size;
      case 'level': return g.progression.level;
      case 'day': return g.time.day;
      case 'craft': return o.item === 'fiber_backpack' && (g.state.upgrades.backpack ?? 0) >= 1 ? 1 : 0;
      default: return 0;
    }
  }

  advance(type, match, amount) {
    for (const [id, st] of this.active) {
      const q = QUESTS[id];
      let changed = false;
      q.objectives.forEach((o, i) => {
        if (o.type !== type || !match(o)) return;
        const target = this.targetOf(o);
        if (st.progress[i] >= target) return;
        st.progress[i] = Math.min(target, st.progress[i] + amount);
        changed = true;
      });
      if (changed) {
        this.game.bus.emit('quest:progress', { id });
        this.checkComplete(id);
      }
    }
  }

  setValue(type, match, value) {
    for (const [id, st] of this.active) {
      const q = QUESTS[id];
      let changed = false;
      q.objectives.forEach((o, i) => {
        if (o.type !== type || !match(o)) return;
        const v = Math.min(this.targetOf(o), value);
        if (v > st.progress[i]) {
          st.progress[i] = v;
          changed = true;
        }
      });
      if (changed) {
        this.game.bus.emit('quest:progress', { id });
        this.checkComplete(id);
      }
    }
  }

  isObjectiveDone(id, i) {
    const st = this.active.get(id);
    if (!st) return this.completed.has(id);
    return st.progress[i] >= this.targetOf(QUESTS[id].objectives[i]);
  }

  checkComplete(id) {
    const st = this.active.get(id);
    if (!st) return;
    const q = QUESTS[id];
    if (q.objectives.every((o, i) => st.progress[i] >= this.targetOf(o))) this.complete(id);
  }

  complete(id) {
    const q = QUESTS[id];
    this.active.delete(id);
    this.completed.add(id);
    const g = this.game;
    const r = q.rewards ?? {};
    if (r.items) {
      for (const [item, n] of Object.entries(r.items)) {
        const left = g.player.inventory.add(item, n);
        if (left > 0) g.world.drops.spawn(g.player.position.x, g.player.position.z, [{ id: item, count: left }]);
      }
    }
    for (const rid of r.recipes ?? []) g.state.unlockRecipe(rid);
    for (const bid of r.buildings ?? []) g.state.unlockBuilding(bid);
    for (const f of r.features ?? []) g.state.unlockFeature(f);
    if (r.perkPoints) g.progression.addPerkPoints(r.perkPoints);
    g.bus.emit('quest:completed', { id, quest: q });
    if (r.xp) g.progression.addXP(r.xp, 'quest');
    if (q.chapterEnd) g.bus.emit('chapter:completed', { chapter: q.chapterEnd });

    let delay = 2.2;
    for (const next of q.next ?? []) {
      this.queue.push({ id: next, delay });
      delay += 0.5;
    }
    for (const side of q.side ?? []) {
      this.queue.push({ id: side, delay });
      delay += 1.2;
    }
    g.requestSave();
  }

  update(dt) {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const item = this.queue[i];
      item.delay -= dt;
      if (item.delay <= 0) {
        this.queue.splice(i, 1);
        this.start(item.id);
      }
    }
  }

  /** Görev listesi: önce ana/öğretici, sonra yan görevler. */
  list() {
    const order = { tutorial: 0, main: 0, side: 1 };
    return [...this.active.keys()]
      .map((id) => ({ id, quest: QUESTS[id], state: this.active.get(id) }))
      .sort((a, b) => order[a.quest.type] - order[b.quest.type]);
  }

  /** Pusula ve ekran işaretleri için hedef konumlar. */
  getMarkers() {
    const g = this.game;
    const p = g.player.position;
    const out = [];
    for (const { id, quest, state } of this.list()) {
      let marker = null;
      quest.objectives.forEach((o, i) => {
        if (!marker && o.marker && state.progress[i] < this.targetOf(o)) marker = o.marker;
      });
      marker ??= quest.marker;
      if (!marker) continue;
      let pos = null;
      if (marker.resource) {
        const n = g.world.resources.nearestOfType(marker.resource, p.x, p.z, 140);
        if (n) pos = { x: n.x, y: n.y + 1.2, z: n.z, near: true };
      } else if (marker.landmark) {
        const e = g.world.landmarks.byId[marker.landmark];
        if (e) pos = { x: e.interactPoint.x, y: e.y + 2.5, z: e.interactPoint.z };
      } else if (marker.landmarks) {
        let best = Infinity;
        for (const lid of marker.landmarks) {
          const e = g.world.landmarks.byId[lid];
          if (!e || g.exploration.isLandmarkUsed(lid)) continue;
          const d = Math.hypot(e.x - p.x, e.z - p.z);
          if (d < best) {
            best = d;
            pos = { x: e.x, y: e.y + 3, z: e.z };
          }
        }
      } else if (marker.region === 'lake') {
        const L = g.world.island.lake;
        pos = { x: L.x, y: L.level + 1.5, z: L.z };
      }
      if (pos) out.push({ ...pos, questId: id, type: quest.type, title: quest.title });
    }
    return out;
  }

  serialize() {
    return {
      active: [...this.active].map(([id, st]) => [id, st.progress]),
      completed: [...this.completed],
      queue: this.queue,
    };
  }

  deserialize(d) {
    if (!d) return;
    this.completed = new Set((d.completed ?? []).filter((id) => QUESTS[id]));
    this.active = new Map();
    for (const [id, progress] of d.active ?? []) {
      const q = QUESTS[id];
      if (!q) continue;
      const p = q.objectives.map((o, i) => progress?.[i] ?? 0);
      this.active.set(id, { progress: p });
    }
    this.queue = (d.queue ?? []).filter((x) => QUESTS[x.id]);
    // kayıttan sonra eklenen görev zinciri halkalarını onar
    for (const id of this.completed) {
      for (const next of [...(QUESTS[id].next ?? []), ...(QUESTS[id].side ?? [])]) {
        if (!this.completed.has(next) && !this.active.has(next) && !this.queue.some((x) => x.id === next)) {
          this.queue.push({ id: next, delay: 1 });
        }
      }
    }
  }
}


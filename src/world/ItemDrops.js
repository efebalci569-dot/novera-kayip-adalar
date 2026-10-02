import * as THREE from 'three';
import { part, merge, sharedMaterials } from './Models.js';
import { ITEMS } from '../data/items.js';

/**
 * Envanter dolduğunda yere bırakılan eşya çuvalları.
 * Oyuncu eşyalarını asla kaybetmez; çuvala [E] ile yaklaşıp geri alabilir.
 */
export class ItemDrops {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'drops';
    this.drops = [];
    this.time = 0;
    this.geometry = merge([
      part(new THREE.IcosahedronGeometry(0.32, 1), '#b08a55', { y: 0.28, sy: 0.85, seed: 1200, shade: 0.06 }),
      part(new THREE.ConeGeometry(0.16, 0.25, 6), '#9a774a', { y: 0.62, seed: 1201 }),
      part(new THREE.TorusGeometry(0.12, 0.03, 4, 10), '#b9c65c', { y: 0.53, rx: Math.PI / 2, seed: 1202 }),
    ]);
  }

  /** stacks: [{ id, count, dur? }] · cave: çuval mağarada mı (varsayılan: oyuncu nerdeyse) */
  spawn(x, z, stacks, cave = this.world.inCave) {
    if (!stacks.length) return null;
    cave = cave && !!this.world.cave;
    const near = this.drops.find((d) => Math.hypot(d.x - x, d.z - z) < 1.5 && d.cave === cave);
    if (near) {
      near.items.push(...stacks.map((s) => ({ ...s })));
      return near;
    }
    // mağaradaysa mağara tabanına, yüzeyde araziye (su altındaysa su yüzeyine) bırakılır
    const y = cave ? this.world.cave.floorHeight(x, z) : Math.max(this.world.terrain.getHeight(x, z), 0);
    const mesh = new THREE.Mesh(this.geometry, sharedMaterials.standard);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    this.group.add(mesh);
    const drop = { x, y, z, items: stacks.map((s) => ({ ...s })), mesh, phase: Math.random() * 6, cave };
    drop.interactable = this.world.addInteractable({
      kind: 'drop', x, y: y + 0.4, z, range: 2.6, pickRadius: 0.7, pickHeight: 0.6,
      getPrompt: () => ({ action: 'Eşyaları Al', name: `${drop.death ? '💀 Ölüm çuvalı' : 'Çuval'} (${drop.items.reduce((a, s) => a + s.count, 0)} eşya)` }),
      interact: (game) => this.collect(drop, game),
    });
    this.drops.push(drop);
    return drop;
  }

  collect(drop, game) {
    const inv = game.player.inventory;
    const remaining = [];
    for (const s of drop.items) {
      const left = inv.add(s.id, s.count, s.dur);
      if (left < s.count) game.bus.emit('item:picked', { item: s.id, amount: s.count - left });
      if (left > 0) remaining.push({ ...s, count: left });
    }
    drop.items = remaining;
    if (!remaining.length) this.remove(drop);
    else game.notify('Envanterin dolu — bazı eşyalar çuvalda kaldı.', 'warn');
    game.audio.play('pickup');
  }

  remove(drop) {
    this.group.remove(drop.mesh);
    this.world.removeInteractable(drop.interactable);
    this.drops.splice(this.drops.indexOf(drop), 1);
  }

  update(dt) {
    this.time += dt;
    for (const d of this.drops) d.mesh.rotation.y = Math.sin(this.time + d.phase) * 0.3;
  }

  serialize() {
    return this.drops.map((d) => ({ x: d.x, z: d.z, cave: d.cave ? 1 : 0, death: d.death ? 1 : 0, items: d.items.filter((s) => ITEMS[s.id]) }));
  }

  deserialize(list) {
    for (const d of list ?? []) {
      const drop = this.spawn(d.x, d.z, d.items, !!d.cave);
      if (drop && d.death) drop.death = true;
    }
  }
}

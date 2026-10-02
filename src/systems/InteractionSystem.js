import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { rollDrops } from './LootSystem.js';

const TOOL_NAMES = { axe: 'Balta', pickaxe: 'Kazma', spear: 'Mızrak' };
const SWING_TIME = 0.55;
const SWING_IMPACT = 0.33;

/**
 * Oyuncunun önündeki etkileşim hedefini bulur ([E] Odun Topla gibi) ve
 * kaynak toplama, yapı/önemli nokta kullanımı, su içme, yemek yeme eylemlerini yürütür.
 */
export class InteractionSystem {
  constructor(game) {
    this.game = game;
    this.target = null;
    this.errorCooldown = 0;
    this._fwd = new THREE.Vector3();
  }

  update(dt, inputEnabled) {
    const { game } = this;
    const input = game.input;
    const player = game.player;
    this.errorCooldown -= dt;
    this.target = game.state.mode === 'playing' && !game.building.active ? this.findTarget() : null;
    if (!inputEnabled) return;

    for (let i = 1; i <= 5; i++) if (input.wasPressed(`hotbar${i}`)) player.selectSlot(i - 1);
    if (game.building.active) return;

    if (input.wasPressed('secondary')) this.useSelected();

    if (player.action) return;
    const pressed = input.wasPressed('interact') || input.wasPressed('primary');
    const held = input.isDown('interact') || input.isDown('primary');
    const t = this.target;
    if (t && (pressed || (held && t.kind === 'resource'))) {
      this.perform(t);
    } else if (!t && input.wasPressed('primary')) {
      // boşa sallama (ileride saldırı)
      player.startAction('swing', 0.5, { held: player.selectedItem?.held ?? null });
      game.audio.play('swing');
    }
  }

  // ── Hedef seçimi ────────────────────────────────────────
  findTarget() {
    return this.game.cameraController.firstPerson ? this.findTargetFirstPerson() : this.findTargetThirdPerson();
  }

  /** Işın ile dikey silindir kesişimi: ilk temas mesafesi ya da null. */
  rayCylinder(eye, dir, x, z, y0, y1, r) {
    const ox = eye.x - x;
    const oz = eye.z - z;
    const a = dir.x * dir.x + dir.z * dir.z;
    const c = ox * ox + oz * oz - r * r;
    let tIn = 0;
    let tOut = Infinity;
    if (a < 1e-6) {
      if (c > 0) return null;
    } else {
      const b = ox * dir.x + oz * dir.z;
      const disc = b * b - a * c;
      if (disc < 0) return null;
      const sq = Math.sqrt(disc);
      tOut = (-b + sq) / a;
      if (tOut < 0) return null;
      tIn = Math.max((-b - sq) / a, 0);
    }
    if (Math.abs(dir.y) < 1e-6) {
      if (eye.y < y0 || eye.y > y1) return null;
    } else {
      let s0 = (y0 - eye.y) / dir.y;
      let s1 = (y1 - eye.y) / dir.y;
      if (s0 > s1) [s0, s1] = [s1, s0];
      tIn = Math.max(tIn, s0);
      tOut = Math.min(tOut, s1);
      if (tIn > tOut) return null;
    }
    return tIn;
  }

  /** 1. şahıs: ekranın ortasındaki nişangâhın baktığı en yakın nesne. */
  findTargetFirstPerson() {
    const { game } = this;
    const player = game.player;
    const p = player.position;
    const eye = game.camera.position;
    const dir = game.camera.getWorldDirection(this._fwd);
    const REACH = 3.6;
    let best = null;
    let bestT = REACH;

    game.world.resources.forEachNear(p.x, p.z, 6, (n) => {
      if (!n.interactable) return;
      const g = n.def.group;
      let y0 = n.y - 0.1, y1 = n.y + 0.45, r = 0.6;
      if (g === 'tree') { y1 = n.y + 3.2; r = n.collider.r + 0.12; }
      else if (g === 'rock') { y1 = n.y + 1.5 * n.scale; r = n.collider.r * 0.95; }
      else if (g === 'plant') { y1 = n.y + 1.3; r = 0.8; }
      else if (g === 'fish') { y0 = n.y - 0.8; y1 = n.y + 0.3; r = 1.5; }
      const t = this.rayCylinder(eye, dir, n.x, n.z, y0, y1, r);
      if (t !== null && t < bestT) {
        bestT = t;
        best = { kind: 'resource', node: n, x: n.x, y: n.y, z: n.z };
      }
    });

    for (const it of game.world.interactables) {
      if (Math.hypot(it.x - p.x, it.z - p.z) > it.range + 1) continue;
      const r = it.pickRadius ?? 0.9;
      const t = this.rayCylinder(eye, dir, it.x, it.z, it.y - 1.3, it.y + (it.pickHeight ?? 1.4), r);
      if (t !== null && t < bestT + 0.5) {
        bestT = Math.min(bestT, t);
        best = { kind: 'object', obj: it, x: it.x, y: it.y, z: it.z };
      }
    }

    if (!best && !player.swimming && dir.y < -0.25 && game.world.isFreshWaterNear(p.x, p.z)) {
      const L = game.world.island.lake;
      best = { kind: 'water', x: L.x, y: L.level, z: L.z };
    }
    if (!best) return null;
    best.prompt = this.promptFor(best);
    return best.prompt ? best : null;
  }

  /** 3. şahıs: oyuncunun önündeki ve kameranın baktığı yöndeki en yakın nesne. */
  findTargetThirdPerson() {
    const { game } = this;
    const player = game.player;
    const p = player.position;
    const f = game.cameraController.forward(this._fwd);
    let best = null;
    let bestScore = Infinity;

    const consider = (x, z, d, range, build) => {
      if (d > range) return;
      const dx = x - p.x;
      const dz = z - p.z;
      const len = Math.hypot(dx, dz) || 1;
      const dot = (dx * f.x + dz * f.z) / len;
      if (dot < 0.15 && d > 1.3) return;
      const score = d * (1.7 - dot);
      if (score < bestScore) {
        bestScore = score;
        best = build;
      }
    };

    game.world.resources.forEachNear(p.x, p.z, 4.5, (n, d) => {
      if (!n.interactable) return;
      const range = (n.collider ? n.collider.r : 0.3) + 1.9;
      consider(n.x, n.z, d, range, () => ({ kind: 'resource', node: n, x: n.x, y: n.y, z: n.z }));
    });

    for (const it of game.world.interactables) {
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      consider(it.x, it.z, d, it.range, () => ({ kind: 'object', obj: it, x: it.x, y: it.y, z: it.z }));
    }

    if (!best && !player.swimming && game.world.isFreshWaterNear(p.x, p.z)) {
      const L = game.world.island.lake;
      best = () => ({ kind: 'water', x: L.x, y: L.level, z: L.z });
    }

    if (!best) return null;
    const t = best();
    t.prompt = this.promptFor(t);
    return t.prompt ? t : null;
  }

  promptFor(t) {
    const { game } = this;
    if (t.kind === 'resource') {
      const def = t.node.def;
      const prompt = { action: def.action, name: def.name };
      if (def.mode === 'hit') {
        prompt.hp = t.node.hp / t.node.maxHp;
        if (game.player.inventory.findBestTool(def.tool) < 0) {
          prompt.disabled = true;
          prompt.note = `${TOOL_NAMES[def.tool] ?? def.tool} gerekli`;
        }
      } else if (t.node.maxUses > 1) {
        prompt.uses = `${t.node.uses}/${t.node.maxUses}`;
      }
      return prompt;
    }
    if (t.kind === 'object') return t.obj.getPrompt(game);
    if (t.kind === 'water') return { action: 'Su İç', name: 'Tatlı Su' };
    return null;
  }

  // ── Eylemler ────────────────────────────────────────────
  perform(t) {
    const { game } = this;
    if (t.kind === 'resource') {
      if (t.node.def.mode === 'hit') this.startHit(t.node);
      else this.startGather(t.node);
    } else if (t.kind === 'object') {
      t.obj.interact(game);
    } else if (t.kind === 'water') {
      game.player.startAction('drink', 0.9, {
        target: t,
        onComplete: () => {
          game.player.stats.apply({ thirst: 30 });
          game.audio.play('drink');
          game.ui.hud.floatText('+30 💧 Susuzluk', '#6cc6ff');
          game.bus.emit('player:drank', {});
          game.progression.addXP(1, 'drink');
        },
      });
    }
  }

  error(msg) {
    if (this.errorCooldown > 0) return;
    this.errorCooldown = 1.2;
    this.game.notify(msg, 'warn');
    this.game.audio.play('error');
  }

  startHit(node) {
    const { game } = this;
    const player = game.player;
    const def = node.def;
    const toolIdx = player.inventory.findBestTool(def.tool);
    if (toolIdx < 0) {
      this.error(`Bunun için bir ${TOOL_NAMES[def.tool]?.toLowerCase() ?? 'alet'} gerekiyor.`);
      return;
    }
    const toolItem = ITEMS[player.inventory.slots[toolIdx].id];
    const tired = player.stats.stamina < 3;
    const speed = tired ? 1.4 : 1;
    player.startAction('swing', SWING_TIME * speed, {
      impactAt: SWING_IMPACT * speed,
      target: node,
      held: toolItem.held,
      onImpact: () => this.applyHit(node, def.tool),
    });
    game.audio.play('swing');
  }

  applyHit(node, toolType) {
    const { game } = this;
    if (!node.interactable) return;
    const player = game.player;
    const inv = player.inventory;
    const toolIdx = inv.findBestTool(toolType);
    if (toolIdx < 0) return;
    const tool = ITEMS[inv.slots[toolIdx].id].tool;
    const def = node.def;
    const prog = game.progression;
    const isTree = def.group === 'tree';
    const dmgBonus = isTree ? prog.bonus('treeDamage') : prog.bonus('rockDamage');
    const extra = prog.bonus('extraYield') + (isTree ? 0 : prog.bonus('rockYield'));

    const destroyed = game.world.resources.damage(node, tool.power * (1 + dmgBonus), player.position.x, player.position.z);
    const drops = rollDrops(def.hitDrops, extra);
    let xp = def.xp ?? 1;
    if (destroyed) {
      drops.push(...rollDrops(def.finalDrops, extra));
      xp += def.finalXp ?? 0;
      if (isTree) game.state.stats.treesFelled++;
      else game.state.stats.rocksBroken++;
      game.bus.emit('resource:depleted', { type: node.type, group: def.group, node });
      if (isTree) game.audio.play('treefall');
    }
    this.giveItems(drops);
    prog.addXP(xp, 'gather');

    const broke = inv.wear(toolIdx, 1 - prog.bonus('durability'));
    if (broke) {
      game.notify(`${ITEMS[broke].name} kırıldı! Yenisini üretmelisin.`, 'warn');
      game.audio.play('error');
    }
    player.stats.useStamina(2);
    const py = node.y + (isTree ? 1.2 : 0.7);
    game.world.particles.emit(def.particle, node.x, py, node.z);
    game.audio.play(def.sound);
  }

  startGather(node) {
    const { game } = this;
    const def = node.def;
    const dur = def.gatherTime ?? 0.55;
    game.player.startAction(def.animation ?? 'gather', dur, {
      target: node,
      onComplete: () => this.applyGather(node),
    });
    if (def.sound === 'rustle') game.audio.play('rustle');
    if (def.sound === 'splash') game.audio.play('splash', { volume: 0.5 });
  }

  applyGather(node) {
    const { game } = this;
    if (!node.interactable) return;
    const def = node.def;
    const inv = game.player.inventory;
    const depleted = game.world.resources.consumeUse(node);
    const drops = rollDrops(def.drops, game.progression.bonus('extraYield'));
    for (const [toolType, table] of Object.entries(def.toolBonus ?? {})) {
      if (inv.findBestTool(toolType) >= 0) drops.push(...rollDrops(table));
    }
    if (def.group === 'fish') {
      game.state.stats.fishCaught += drops.reduce((a, d) => a + (d.item === 'raw_fish' ? d.amount : 0), 0);
    }
    if (depleted) game.bus.emit('resource:depleted', { type: node.type, group: def.group, node });
    this.giveItems(drops);
    game.progression.addXP(def.xp ?? 1, 'gather');
    game.world.particles.emit(def.particle, node.x, node.y + 0.4, node.z, 0.7);
    if (def.sound === 'pickup' || def.sound === 'splash') game.audio.play('pickup');
  }

  /** Düşen eşyaları envantere ekler; sığmayanları çuval olarak yere bırakır. */
  giveItems(drops) {
    const { game } = this;
    const inv = game.player.inventory;
    const overflow = [];
    for (const { item, amount } of drops) {
      const left = inv.add(item, amount);
      const got = amount - left;
      const def = ITEMS[item];
      if (got > 0) {
        game.bus.emit('item:gathered', { item, amount: got });
        game.ui.hud.floatText(`+${got} ${def.icon} ${def.name}`);
      }
      if (left > 0) overflow.push({ id: item, count: left });
    }
    if (overflow.length) {
      const p = game.player.position;
      game.world.drops.spawn(p.x, p.z, overflow);
      this.error('Envanter dolu! Fazla eşyalar yere bırakıldı.');
    }
  }

  /** Seçili hızlı slottaki eşyayı kullan (yiyecek → ye). */
  useSelected() {
    const p = this.game.player;
    const stack = p.selectedStack;
    if (stack) this.consume(p.selectedSlot);
  }

  consume(slotIndex) {
    const { game } = this;
    const player = game.player;
    const stack = player.inventory.slots[slotIndex];
    if (!stack) return false;
    const def = ITEMS[stack.id];
    if (!def?.food) return false;
    const id = stack.id;
    return player.startAction('eat', 0.75, {
      onComplete: () => {
        const inv = player.inventory;
        if (inv.slots[slotIndex]?.id === id) inv.removeAt(slotIndex, 1);
        else if (!inv.remove(id, 1)) return;
        player.stats.apply(def.food);
        game.audio.play(def.consumeVerb ? 'pickup' : 'eat');
        const parts = [];
        if (def.food.hunger) parts.push(`+${def.food.hunger} 🍖`);
        if (def.food.thirst) parts.push(`+${def.food.thirst} 💧`);
        if (def.food.health) parts.push(`${def.food.health > 0 ? '+' : ''}${def.food.health} ❤️`);
        if (def.food.stamina) parts.push(`+${def.food.stamina} ⚡`);
        game.ui.hud.floatText(parts.join('  '), def.food.health < 0 ? '#ff8a7a' : '#ffe08a');
        game.bus.emit('item:consumed', { item: id });
      },
    });
  }
}

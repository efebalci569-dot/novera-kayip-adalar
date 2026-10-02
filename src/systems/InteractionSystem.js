import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { rollDrops } from './LootSystem.js';

const TOOL_NAMES = { axe: 'Balta', pickaxe: 'Kazma', spear: 'Mızrak', knife: 'Bıçak' };
const TIER_NAMES = { 2: 'Bakır Kazma' };
const SWING_TIME = 0.55;
const SWING_IMPACT = 0.33;
const FIST_DAMAGE = 3;
const ATTACK_REACH = 2.6;
const MAX_DY = 5; // hedefle oyuncu arasındaki en büyük yükseklik farkı (mağara/yüzey ayrımı)

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
    if (player.ghost) {
      // izleyici dünyaya dokunamaz
      this.target = null;
      return;
    }

    // teknedeyken tek etkileşim: inmek
    if (player.mounted) {
      const b = player.mounted;
      this.target = game.state.mode === 'playing'
        ? { kind: 'dismount', x: b.x, y: b.y, z: b.z, prompt: { action: 'İn', name: b.def.name, note: 'Kıyıya yakınsan karaya çıkarsın' } }
        : null;
      if (!inputEnabled) return;
      for (let i = 1; i <= 5; i++) if (input.wasPressed(`hotbar${i}`)) player.selectSlot(i - 1);
      if (input.wasPressed('interact')) game.vehicles.dismount();
      else if (input.wasPressed('secondary')) this.useSelected();
      return;
    }

    this.target = game.state.mode === 'playing' && !game.building.active ? this.findTarget() : null;
    if (!inputEnabled) return;

    for (let i = 1; i <= 5; i++) if (input.wasPressed(`hotbar${i}`)) player.selectSlot(i - 1);
    if (game.building.active) return;

    if (input.wasPressed('secondary')) this.useSelected();

    if (player.action) return;
    const pressed = input.wasPressed('interact') || input.wasPressed('primary');
    const held = input.isDown('interact') || input.isDown('primary');
    const t = this.target;
    const repeatable = t && (t.kind === 'resource' || (t.kind === 'animal' && !t.animal.dead) || t.kind === 'enemy' || t.kind === 'boss');
    if (t && (pressed || (held && repeatable))) {
      this.perform(t);
    } else if (!t && input.wasPressed('primary')) {
      // boşa sallama
      const w = this.bestWeapon();
      player.startAction('swing', 0.5, { held: w?.def.held ?? player.model.heldKey ?? null });
      game.audio.play('swing');
    }
  }

  /** Saldırı silahı: elindeki hasar veren eşya; yoksa envanterdeki en yüksek hasarlısı; yoksa yumruk (null). */
  bestWeapon() {
    const inv = this.game.player.inventory;
    const sel = this.game.player.selectedSlot;
    const selDef = inv.slots[sel] && ITEMS[inv.slots[sel].id];
    if (selDef?.damage) return { index: sel, def: selDef };
    let best = null;
    inv.slots.forEach((st, i) => {
      const d = st && ITEMS[st.id];
      if (d?.damage && (!best || d.damage > best.def.damage)) best = { index: i, def: d };
    });
    return best;
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
      if (!n.interactable || Math.abs(n.y - p.y) > MAX_DY) return;
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

    game.animals?.forEachNear(p.x, p.z, 6, (a) => {
      if (Math.abs(a.y - p.y) > MAX_DY || game.world.inCave) return;
      const t = a.dead
        ? this.rayCylinder(eye, dir, a.x, a.z, a.y - 0.2, a.y + a.model.lieHeight * 2 + 0.3, a.def.length * 0.5)
        : this.rayCylinder(eye, dir, a.x, a.z, a.y - 0.1, a.y + a.def.height, a.def.radius + 0.15);
      if (t !== null && t < bestT) {
        bestT = t;
        best = { kind: 'animal', animal: a, x: a.x, y: a.y, z: a.z };
      }
    });

    if (!game.world.inCave) {
      game.enemies.forEachNear(p.x, p.z, 7, (e) => {
        const t = this.rayCylinder(eye, dir, e.x, e.z, e.y - 0.1, e.y + e.def.height + 0.3, e.def.radius + 0.25);
        if (t !== null && t < bestT) {
          bestT = t;
          best = { kind: 'enemy', enemy: e, x: e.x, y: e.y, z: e.z };
        }
      });
      const b = game.bosses.boss;
      if (b && game.bosses.targetable) {
        const t = this.rayCylinder(eye, dir, b.x, b.z, b.y - 0.2, b.y + b.def.height, b.def.radius + 0.3);
        if (t !== null && t < bestT + 1) {
          bestT = Math.min(bestT, t);
          best = { kind: 'boss', boss: b, x: b.x, y: b.y, z: b.z };
        }
      }
    }

    for (const it of game.world.interactables) {
      if (Math.hypot(it.x - p.x, it.z - p.z) > it.range + 1 || Math.abs(it.y - p.y) > MAX_DY) continue;
      const r = it.pickRadius ?? 0.9;
      const t = this.rayCylinder(eye, dir, it.x, it.z, it.y - 1.3, it.y + (it.pickHeight ?? 1.4), r);
      if (t !== null && t < bestT + 0.5) {
        bestT = Math.min(bestT, t);
        best = { kind: 'object', obj: it, x: it.x, y: it.y, z: it.z };
      }
    }

    const lake = !best && !player.swimming && dir.y < -0.25 ? game.world.freshWaterAt(p.x, p.z) : null;
    if (lake) best = { kind: 'water', lake, x: lake.x, y: lake.level, z: lake.z };
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
      if (!n.interactable || Math.abs(n.y - p.y) > MAX_DY) return;
      const range = (n.collider ? n.collider.r : 0.3) + 1.9;
      consider(n.x, n.z, d, range, () => ({ kind: 'resource', node: n, x: n.x, y: n.y, z: n.z }));
    });

    if (!game.world.inCave) {
      game.animals?.forEachNear(p.x, p.z, 5, (a, d) => {
        if (Math.abs(a.y - p.y) > MAX_DY) return;
        const range = (a.dead ? a.def.length * 0.5 : a.def.radius) + 1.9;
        consider(a.x, a.z, d, range, () => ({ kind: 'animal', animal: a, x: a.x, y: a.y, z: a.z }));
      });
      game.enemies.forEachNear(p.x, p.z, 6, (e, d) => {
        // düşmanlar diğer nesnelerden önce gelir
        consider(e.x, e.z, d * 0.6, e.def.radius + 2.0, () => ({ kind: 'enemy', enemy: e, x: e.x, y: e.y, z: e.z }));
      });
      const b = game.bosses.boss;
      if (b && game.bosses.targetable) {
        const d = Math.hypot(b.x - p.x, b.z - p.z);
        consider(b.x, b.z, Math.max(0.1, d - b.def.radius) * 0.5, 2.3, () => ({ kind: 'boss', boss: b, x: b.x, y: b.y, z: b.z }));
      }
    }

    for (const it of game.world.interactables) {
      if (Math.abs(it.y - p.y) > MAX_DY) continue;
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      consider(it.x, it.z, d, it.range, () => ({ kind: 'object', obj: it, x: it.x, y: it.y, z: it.z }));
    }

    const lake = !best && !player.swimming ? game.world.freshWaterAt(p.x, p.z) : null;
    if (lake) best = () => ({ kind: 'water', lake, x: lake.x, y: lake.level, z: lake.z });

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
        if (game.player.inventory.findBestTool(def.tool, def.minTier ?? 0) < 0) {
          prompt.disabled = true;
          prompt.note = `${(def.minTier && TIER_NAMES[def.minTier]) || TOOL_NAMES[def.tool] || def.tool} gerekli`;
        }
      } else if (t.node.maxUses > 1) {
        prompt.uses = `${t.node.uses}/${t.node.maxUses}`;
      }
      return prompt;
    }
    if (t.kind === 'animal') {
      const a = t.animal;
      if (!a.dead) return { action: 'Saldır', name: a.def.name, hp: a.hp / a.def.hp };
      if (a.butchered) return null;
      const knife = game.player.inventory.findBestTool('knife') >= 0;
      return {
        action: a.def.butcherAction ?? 'Parçala', name: `${a.def.name} (ölü)`,
        disabled: !knife, note: knife ? undefined : 'Bıçak gerekli — Üretim [C] → Taş Bıçak',
      };
    }
    if (t.kind === 'enemy') return { action: 'Saldır', name: t.enemy.def.name, hp: t.enemy.hp / t.enemy.maxHp };
    if (t.kind === 'boss') return { action: 'Saldır', name: t.boss.def.name, hp: t.boss.hp / t.boss.maxHp };
    if (t.kind === 'object') return t.obj.getPrompt(game);
    if (t.kind === 'water') return t.lake?.frozen ? { action: 'Buzu Kır, Su İç', name: 'Donmuş Göl' } : { action: 'Su İç', name: t.lake?.oasis ? 'Vaha' : 'Tatlı Su' };
    return null;
  }

  // ── Eylemler ────────────────────────────────────────────
  perform(t) {
    const { game } = this;
    if (t.kind === 'resource') {
      if (t.node.def.mode === 'hit') this.startHit(t.node);
      else this.startGather(t.node);
    } else if (t.kind === 'animal') {
      if (t.animal.dead) this.startButcher(t.animal);
      else this.startAttack(t);
    } else if (t.kind === 'enemy' || t.kind === 'boss') {
      this.startAttack(t);
    } else if (t.kind === 'object') {
      t.obj.interact(game);
    } else if (t.kind === 'water') {
      game.player.startAction('drink', t.lake?.frozen ? 1.6 : 0.9, {
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
    const toolIdx = player.inventory.findBestTool(def.tool, def.minTier ?? 0);
    if (toolIdx < 0) {
      if (def.minTier && player.inventory.findBestTool(def.tool) >= 0) this.error(`Bu kaya çok sert: ${TIER_NAMES[def.minTier] ?? 'daha güçlü bir alet'} gerekiyor.`);
      else this.error(`Bunun için bir ${TOOL_NAMES[def.tool]?.toLowerCase() ?? 'alet'} gerekiyor.`);
      return;
    }
    const toolItem = ITEMS[player.inventory.slots[toolIdx].id];
    const tired = player.stats.stamina < 3;
    const speed = tired ? 1.4 : 1;
    player.startAction('swing', SWING_TIME * speed, {
      impactAt: SWING_IMPACT * speed,
      target: node,
      held: toolItem.held,
      onImpact: () => this.applyHit(node, def.tool, def.minTier ?? 0),
    });
    game.audio.play('swing');
  }

  // ── Av ──────────────────────────────────────────────────
  /** t: { kind: 'animal' | 'enemy' | 'boss', ... } */
  startAttack(t) {
    const { game } = this;
    const player = game.player;
    const weapon = this.bestWeapon();
    const tired = player.stats.stamina < 3;
    const speed = tired ? 1.4 : weapon ? 1 : 0.85;
    player.startAction('swing', SWING_TIME * speed, {
      impactAt: SWING_IMPACT * speed,
      target: t.animal ?? t.enemy ?? t.boss,
      held: weapon?.def.held ?? null,
      onImpact: () => this.applyAttack(t, weapon),
    });
    game.audio.play('swing');
  }

  applyAttack(t, weapon) {
    const { game } = this;
    const p = game.player.position;
    const base = weapon?.def.damage ?? FIST_DAMAGE;
    const dmg = base * (1 + game.progression.bonus('damage'));
    const effects = { slow: !!weapon?.def.slow, burn: !!weapon?.def.burn };
    let killed = false;
    if (t.kind === 'animal') {
      const a = t.animal;
      if (a.dead) return;
      if (Math.hypot(a.x - p.x, a.z - p.z) > ATTACK_REACH + a.def.radius) {
        game.audio.play('swing', { volume: 0.6 });
        return; // ıskaladı (hayvan kaçtı)
      }
      killed = game.animals.hit(a, dmg, p.x, p.z);
    } else if (t.kind === 'enemy') {
      const e = t.enemy;
      if (e.dead) return;
      if (Math.hypot(e.x - p.x, e.z - p.z) > ATTACK_REACH + e.def.radius) {
        game.audio.play('swing', { volume: 0.6 });
        return;
      }
      killed = game.enemies.hit(e, dmg, p.x, p.z, null, effects);
    } else if (t.kind === 'boss') {
      const b = game.bosses.boss;
      if (!b || b !== t.boss) return;
      if (Math.hypot(b.x - p.x, b.z - p.z) > ATTACK_REACH + b.def.radius + 0.4) {
        game.audio.play('swing', { volume: 0.6 });
        return;
      }
      if (!game.bosses.targetable) {
        game.audio.play('swing', { volume: 0.6 });
        return;
      }
      killed = game.bosses.hit(dmg, p.x, p.z, effects);
    }
    if (weapon) {
      const inv = game.player.inventory;
      const id = inv.slots[weapon.index]?.id;
      if (id && ITEMS[id] === weapon.def) {
        const gone = inv.wear(weapon.index, 1 - game.progression.bonus('durability'));
        if (gone) game.notify(`${ITEMS[gone].name} kırıldı!`, 'warn');
      }
    }
    game.player.stats.useStamina(3);
    game.cameraController.impact(killed ? 0.1 : 0.05);
    game.audio.play('hit');
  }

  startButcher(a) {
    const { game } = this;
    const player = game.player;
    const idx = player.inventory.findBestTool('knife');
    if (idx < 0) {
      this.error('Hayvanı parçalamak için bir bıçak gerekiyor. (Üretim → Taş Bıçak)');
      return;
    }
    player.startAction('butcher', 1.5, {
      target: a,
      held: 'knife',
      onComplete: () => {
        if (a.butchered) return;
        const i = player.inventory.findBestTool('knife');
        if (i < 0) return;
        game.animals.butcher(a);
        const gone = player.inventory.wear(i, 2 * (1 - game.progression.bonus('durability')));
        if (gone) game.notify(`${ITEMS[gone].name} kırıldı!`, 'warn');
      },
    });
    game.audio.play('butcher');
  }

  applyHit(node, toolType, minTier = 0) {
    const { game } = this;
    if (!node.interactable) return;
    const player = game.player;
    const inv = player.inventory;
    const toolIdx = inv.findBestTool(toolType, minTier);
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
    // talaş/taş kırıntısı vuruş noktasından oyuncuya doğru saçılır
    const toP = Math.atan2(player.position.x - node.x, player.position.z - node.z);
    const off = isTree ? (node.collider?.r ?? 0.4) : 0.6;
    game.world.particles.emit(def.particle, node.x + Math.sin(toP) * off, py, node.z + Math.cos(toP) * off);
    if (isTree && !destroyed) {
      // her vuruşta tepeden birkaç yaprak dökülür
      const cy = node.y + (def.crownY ?? 7) * node.scale * 0.85;
      game.world.particles.emit(def.leafParticle ?? 'leaf', node.x + (Math.random() - 0.5) * 2, cy, node.z + (Math.random() - 0.5) * 2, 0.9);
    }
    game.cameraController.impact(0.035);
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
      const idx = inv.findBestTool(toolType);
      if (idx < 0) continue;
      drops.push(...rollDrops(table));
      if (toolType === 'rod') {
        const gone = inv.wear(idx, 1 - game.progression.bonus('durability'));
        if (gone) game.notify(`${ITEMS[gone].name} kırıldı!`, 'warn');
      }
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

  /** Seçili hızlı slottaki eşyayı kullan (yiyecek → ye, taşıt → suya indir). */
  useSelected() {
    const p = this.game.player;
    const stack = p.selectedStack;
    if (!stack) return;
    const def = ITEMS[stack.id];
    if (this.useSpecial(p.selectedSlot)) return;
    if (def?.vehicle) {
      if (p.mounted) return;
      if (!this.game.building.startPlacement(def.vehicle)) this.error('Burada suya indiremezsin.');
      else this.game.notify(`${def.icon} Suya bak ve [Sol tık] ile indir. [R] döndürür.`, 'info');
      return;
    }
    this.consume(p.selectedSlot);
  }

  /** Zırh kuşanma, seyir haritası açma, çağırma eşyası ipucu. true: işlendi. */
  useSpecial(slotIndex) {
    const g = this.game;
    const stack = g.player.inventory.slots[slotIndex];
    const def = stack && ITEMS[stack.id];
    if (!def) return false;
    if (def.armor) {
      g.equipArmor(slotIndex);
      return true;
    }
    if (def.chart) {
      const isl = g.world.islandById[def.chart];
      if (!g.navigation.reveal(def.chart)) g.notify(`${def.icon} ${isl?.name ?? ''} rotası zaten haritanda. [Harita → Takımada]`, 'info');
      g.ui.open('map', { mode: 'world' });
      return true;
    }
    if (def.summon) {
      g.notify(`${def.icon} ${def.name}: ${def.desc}`, 'info');
      return true;
    }
    return false;
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

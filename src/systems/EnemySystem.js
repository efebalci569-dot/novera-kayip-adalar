import * as THREE from 'three';
import { ENEMIES } from '../data/enemies.js';
import { buildCreatureModel, animateCreature } from '../world/CreatureModels.js';
import { rollDrops } from './LootSystem.js';
import { mulberry32, randRange, damp, dampAngle } from '../utils/math.js';
import { setShadowCasting, CREATURE_SHADOW_RANGE } from '../utils/shadows.js';

const ACTIVE_RANGE = 120; // bu mesafede oyuncu yoksa düşman donar
const DRAW_RANGE = 105;
const CORPSE_TIME = 7;
const RESPAWN_CLEAR = 45; // yeniden doğarken bu yakınlıkta oyuncu olmasın

/**
 * Yeni adaların saldırgan canlıları. Yuvalarının çevresinde dolaşır, oyuncuyu fark edince
 * kovalar, saldırıdan önce hazırlanır (kaçmak mümkün), yuvadan çok uzaklaşınca geri döner.
 * Çok oyunculuda ev sahibi yönetir; misafirler durumları ağdan alır.
 */
export class EnemySystem {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'enemies';
    game.scene.add(this.group);
    game.world.registerSurfaceObject(this.group);
    this.list = [];
    this.nests = [];
    this.projectiles = [];
    this.respawnQueue = [];
    this.nextId = 1;
    this.remote = false;
    this.time = 0;
    this.soundTimer = 3;
    this._v = new THREE.Vector3();
    this.projGeo = new THREE.OctahedronGeometry(0.22, 0);
    this.projMat = new THREE.MeshBasicMaterial({ color: '#bff3ff', toneMapped: false });
    this.generate();
  }

  // ── Yerleştirme ─────────────────────────────────────────
  validSpot(type, x, z) {
    const w = this.game.world;
    const def = ENEMIES[type];
    const isl = w.islandById[def.island];
    if (!isl?.contains(x, z)) return false;
    const h = w.terrain.getHeight(x, z);
    if (h < 0.8 || w.terrain.getSlope(x, z) > 0.8) return false;
    if (isl.isLava(x, z, 3) || isl.isInLake(x, z, 2) || isl.isOnIce(x, z)) return false;
    for (const a of w.landmarks.arenaZones()) if (Math.hypot(x - a.x, z - a.z) < a.r + 8) return false;
    return !w.collision.overlapsCircle(x, z, def.radius + 0.3);
  }

  /** Her türün yuvaları adanın uygun bölgelerine dağıtılır (her oyuncuda aynı). */
  generate() {
    const w = this.game.world;
    for (const [type, def] of Object.entries(ENEMIES)) {
      const isl = w.islandById[def.island];
      if (!isl) continue;
      const rng = mulberry32(isl.def.seed * 7 + type.length * 131);
      const [, gMin, gMax] = [0, ...def.spawn.group];
      for (let n = 0; n < def.spawn.count; n++) {
        for (let tries = 0; tries < 300; tries++) {
          const x = isl.cx + randRange(rng, -isl.radius, isl.radius);
          const z = isl.cz + randRange(rng, -isl.radius, isl.radius);
          if (!def.spawn.regions.includes(isl.region(x, z))) continue;
          if (!this.validSpot(type, x, z)) continue;
          if (Math.hypot(x - isl.spawn.x, z - isl.spawn.z) < 40) continue; // varış sahili güvenli
          if (this.nests.some((o) => Math.hypot(o.x - x, o.z - z) < 22)) continue;
          const count = gMin + Math.floor(rng() * (gMax - gMin + 1));
          const nest = { type, x, z, count, island: isl.id };
          this.nests.push(nest);
          for (let k = 0; k < count; k++) this.spawnAtNest(nest, rng);
          break;
        }
      }
    }
  }

  spawnAtNest(nest, rng = Math.random) {
    for (let t = 0; t < 12; t++) {
      const x = nest.x + randRange(rng, -4, 4);
      const z = nest.z + randRange(rng, -4, 4);
      if (!this.validSpot(nest.type, x, z)) continue;
      return this.spawn(nest.type, x, z, rng() * Math.PI * 2, { nest });
    }
    return null;
  }

  spawn(type, x, z, yaw, opts = {}) {
    const def = ENEMIES[type];
    const model = buildCreatureModel(type);
    this.group.add(model.root);
    const hpMul = this.game.difficulty?.damage ?? 1; // zor modda düşmanlar da daha dayanıklı
    const e = {
      id: opts.id ?? this.nextId++,
      type, def, model, x, z, yaw,
      y: this.game.world.terrain.getHeight(x, z),
      maxHp: Math.round(def.hp * (0.85 + hpMul * 0.15)),
      hp: 0,
      home: opts.home ?? (opts.nest ? { x: opts.nest.x, z: opts.nest.z } : { x, z }),
      nest: opts.nest ?? null,
      state: 'idle', timer: Math.random() * 3, target: null, targetId: null, speed: 0,
      phase: Math.random() * 6, hurt: 0, slow: 0, burn: 0, burnTick: 0,
      attackT: -1, windupT: 0, cooldown: 0, minion: !!opts.minion,
      dead: false, deathT: 0, roll: Math.random() < 0.5 ? 1 : -1,
    };
    e.hp = opts.hp ?? e.maxHp;
    if (opts.id && opts.id >= this.nextId) this.nextId = opts.id + 1;
    if (opts.dead) {
      e.dead = true;
      e.deathT = CORPSE_TIME;
    }
    this.list.push(e);
    this.place(e, 0);
    return e;
  }

  remove(e) {
    this.group.remove(e.model.root);
    const i = this.list.indexOf(e);
    if (i >= 0) this.list.splice(i, 1);
  }

  byId(id) {
    return this.list.find((e) => e.id === id) ?? null;
  }

  forEachNear(x, z, radius, fn) {
    for (const e of this.list) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d <= radius) fn(e, d);
    }
  }

  nearest(type, x, z, maxDist = 200) {
    let best = null;
    let bestD = maxDist;
    for (const e of this.list) {
      if (e.dead || (type !== true && e.type !== type)) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  // ── Hasar ───────────────────────────────────────────────
  /** Bir düşmana vuruş. effects: { slow, burn }. attacker: misafirin kimliği (ev sahibinde). */
  hit(e, damage, fromX, fromZ, attacker = null, effects = {}) {
    if (e.dead) return false;
    const g = this.game;
    this.feedback(e, effects);
    if (this.remote) {
      g.net.emit({ t: 'eHit', id: e.id, d: damage, fx: fromX, fz: fromZ, sl: effects.slow ? 1 : 0, bu: effects.burn ? 1 : 0 });
      return false;
    }
    e.hp = Math.max(0, e.hp - damage);
    if (effects.slow) e.slow = 3;
    if (effects.burn) e.burn = 4;
    // vurulan düşman saldırgana döner
    if (e.state === 'idle' || e.state === 'wander' || e.state === 'return') {
      e.state = 'chase';
      e.targetId = attacker ?? 'local';
    }
    const dx = e.x - fromX;
    const dz = e.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    if (!e.def.float) {
      e.x += (dx / d) * 0.35;
      e.z += (dz / d) * 0.35;
    }
    if (e.hp <= 0) {
      this.kill(e, attacker);
      return true;
    }
    return false;
  }

  feedback(e, effects = {}) {
    const w = this.game.world;
    e.hurt = 1;
    const fx = e.type === 'ice_wisp' ? 'frost' : e.type === 'lava_slime' || e.type === 'salamander' ? 'fire' : e.type === 'scorpion' ? 'chitin' : 'blood';
    w.particles.emit(fx, e.x, e.y + e.def.height * 0.6, e.z, 0.7);
    if (effects.slow) w.particles.emit('frost', e.x, e.y + e.def.height * 0.5, e.z, 0.6);
    if (effects.burn) w.particles.emit('fire', e.x, e.y + e.def.height * 0.5, e.z, 0.6);
    this.game.audio.play(e.def.sound, { volume: 0.7, minGap: 0.25 });
  }

  kill(e, attacker = null) {
    e.dead = true;
    e.hp = 0;
    e.state = 'dead';
    e.deathT = 0;
    const g = this.game;
    if (e.nest && !e.minion) this.respawnQueue.push({ nest: e.nest, at: g.time.elapsed + e.def.respawn });
    if (attacker === 'remote-visual') return;
    const drops = rollDrops(e.def.loot, g.progression.bonus('extraYield'));
    if (attacker && attacker !== 'local') {
      g.net.sendTo(attacker, { t: 'eKill', type: e.type, drops, from: g.net.selfId });
      return;
    }
    this.reward(e.type, drops);
  }

  reward(type, drops) {
    const g = this.game;
    const def = ENEMIES[type];
    if (!def) return;
    g.interaction.giveItems(drops.filter((d) => d && typeof d.item === 'string'));
    g.progression.addXP(def.xp, 'hunt');
    g.state.stats.enemiesKilled = (g.state.stats.enemiesKilled ?? 0) + 1;
    g.bus.emit('enemy:killed', { type, island: def.island });
    g.requestSave();
  }

  // ── Oyuncuya saldırı ────────────────────────────────────
  /** Hedeflenebilir oyuncular: yerel + (ev sahibinde) uzaktakiler. */
  players() {
    const g = this.game;
    const out = [];
    const p = g.player;
    if (!p.ghost && !p.stats.dead && !g.world.inCave && g.state.mode !== 'dead') out.push({ id: 'local', x: p.position.x, z: p.position.z, y: p.position.y });
    if (g.net?.isHost) {
      for (const r of g.remotePlayers.positions()) if (!r.cave && !r.ghost) out.push({ id: r.id, x: r.x, z: r.z, y: 0 });
    }
    return out;
  }

  playerById(id) {
    return this.players().find((p) => p.id === id) ?? null;
  }

  damagePlayer(targetId, amount, def, fromX, fromZ) {
    const g = this.game;
    const effects = { poison: !!def.poison, burn: !!def.burn, chill: !!def.chill };
    if (targetId === 'local') g.hurtPlayer(amount, def.name, { ...effects, fromX, fromZ });
    else g.net.sendTo(targetId, { t: 'pDmg', amt: amount, src: def.name, ...effects, fx: fromX, fz: fromZ, from: g.net.selfId });
  }

  // ── Yapay zekâ ──────────────────────────────────────────
  canWalk(e, x, z) {
    const w = this.game.world;
    if (e.def.float) return w.terrain.getHeight(x, z) > -0.5;
    const h = w.terrain.getHeight(x, z);
    if (h < 0.5) return false;
    if (w.terrain.getSlope(x, z) > 0.95) return false;
    const isl = w.islandById[e.def.island];
    return !isl || !isl.isLava(x, z, 0.5) || e.def.burn;
  }

  updateEnemy(e, dt, players) {
    const def = e.def;
    let target = e.targetId ? players.find((p) => p.id === e.targetId) : null;
    // en yakın oyuncu (fark etme)
    let near = null;
    let nearD = Infinity;
    for (const p of players) {
      const d = Math.hypot(p.x - e.x, p.z - e.z);
      if (d < nearD) {
        nearD = d;
        near = p;
      }
    }
    const homeD = Math.hypot(e.x - e.home.x, e.z - e.home.z);
    e.timer -= dt;
    e.cooldown -= dt;
    let targetSpeed = 0;
    let targetYaw = e.yaw;
    const slowMul = e.slow > 0 ? 0.5 : 1;

    if (e.state === 'idle' || e.state === 'wander') {
      if (near && nearD < def.aggro) {
        e.state = 'chase';
        e.targetId = near.id;
        target = near;
        this.game.audio.play(def.sound, { volume: 0.8, minGap: 1.5 });
      } else if (e.state === 'idle') {
        if (e.timer <= 0) {
          const a = Math.random() * Math.PI * 2;
          const r = randRange(Math.random, 3, 9);
          const tx = e.home.x + Math.cos(a) * r;
          const tz = e.home.z + Math.sin(a) * r;
          if (this.canWalk(e, tx, tz)) {
            e.wander = { x: tx, z: tz };
            e.state = 'wander';
            e.timer = 10;
          } else e.timer = 1.5;
        }
      } else {
        const dx = e.wander.x - e.x;
        const dz = e.wander.z - e.z;
        targetYaw = Math.atan2(dx, dz);
        targetSpeed = def.speed;
        if (Math.hypot(dx, dz) < 0.8 || e.timer <= 0) {
          e.state = 'idle';
          e.timer = randRange(Math.random, 2, 6);
        }
      }
    } else if (e.state === 'chase') {
      if (!target || homeD > def.leash) {
        e.state = 'return';
        e.targetId = null;
      } else {
        const dx = target.x - e.x;
        const dz = target.z - e.z;
        const d = Math.hypot(dx, dz);
        targetYaw = Math.atan2(dx, dz);
        const reach = def.attackRange + (def.ranged ? 0 : def.radius * 0.4);
        if (d <= reach && e.cooldown <= 0) {
          e.state = 'windup';
          e.windupT = 0;
          e.attackTarget = { x: target.x, z: target.z, id: target.id };
          if (def.ranged) this.game.audio.play('chime', { volume: 0.6, minGap: 0.5 });
        } else if (def.ranged && d < def.attackRange * 0.55) {
          // uzaktan saldıran: çok yaklaşınca geri çekilir
          targetYaw = Math.atan2(-dx, -dz);
          targetSpeed = def.speed * slowMul;
        } else if (d > reach * 0.85) {
          targetSpeed = def.chaseSpeed * slowMul;
        }
      }
    } else if (e.state === 'windup') {
      e.windupT += dt;
      const t = target ?? e.attackTarget;
      if (t) targetYaw = Math.atan2(t.x - e.x, t.z - e.z);
      if (e.windupT >= def.windup) this.performAttack(e, target ?? e.attackTarget);
    } else if (e.state === 'attack') {
      e.attackT += dt / 0.35;
      if (e.attackT >= 1) {
        e.attackT = -1;
        e.state = 'chase';
      }
    } else if (e.state === 'return') {
      const dx = e.home.x - e.x;
      const dz = e.home.z - e.z;
      targetYaw = Math.atan2(dx, dz);
      targetSpeed = def.chaseSpeed * 0.7;
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.15 * dt);
      if (Math.hypot(dx, dz) < 2) {
        e.state = 'idle';
        e.timer = 2;
      } else if (near && nearD < def.aggro * 0.6 && homeD < def.leash * 0.6) {
        e.state = 'chase';
        e.targetId = near.id;
      }
    }

    e.yaw = dampAngle(e.yaw, targetYaw, e.state === 'chase' ? 9 : 4, dt);
    e.speed = damp(e.speed, targetSpeed, 6, dt);
    if (e.speed > 0.01) {
      const nx = e.x + Math.sin(e.yaw) * e.speed * dt;
      const nz = e.z + Math.cos(e.yaw) * e.speed * dt;
      if (this.canWalk(e, nx, nz)) {
        this._v.set(nx, 0, nz);
        if (!def.float) this.game.world.collision.resolveCircle(this._v, def.radius * 0.8, e.y);
        e.x = this._v.x;
        e.z = this._v.z;
      } else {
        e.speed *= 0.3;
        if (e.state === 'wander') e.state = 'idle';
      }
    }
    // yanık hasarı (ev sahibi hesaplar)
    if (e.burn > 0) {
      e.burn -= dt;
      e.burnTick -= dt;
      if (e.burnTick <= 0) {
        e.burnTick = 1;
        this.hit(e, 4, e.x, e.z, e.targetId === 'local' ? null : e.targetId);
      }
    }
  }

  performAttack(e, target) {
    const def = e.def;
    e.state = 'attack';
    e.attackT = 0;
    e.cooldown = def.attackTime;
    if (!target) return;
    if (def.ranged) {
      this.fireProjectile(e, target, def.damage);
      return;
    }
    // vuruş anında hâlâ menzilde ve önünde mi?
    const cur = this.playerById(target.id);
    if (!cur) return;
    const dx = cur.x - e.x;
    const dz = cur.z - e.z;
    const d = Math.hypot(dx, dz);
    const ang = Math.abs(((Math.atan2(dx, dz) - e.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (d <= def.attackRange + def.radius * 0.5 + 0.4 && ang < 1.1) {
      this.damagePlayer(target.id, def.damage, def, e.x, e.z);
    } else {
      this.game.audio.play('swing', { volume: 0.5 });
    }
  }

  // ── Mermiler (buz cini) ─────────────────────────────────
  fireProjectile(e, target, damage) {
    const g = this.game;
    const y0 = e.y + e.def.height;
    const ty = g.world.terrain.getHeight(target.x, target.z) + 1.2;
    const dx = target.x - e.x;
    const dz = target.z - e.z;
    const d = Math.hypot(dx, dz) || 1;
    const speed = 14;
    const p = {
      x: e.x, y: y0, z: e.z,
      vx: (dx / d) * speed, vy: (ty - y0) / (d / speed), vz: (dz / d) * speed,
      life: d / speed + 0.6, damage, def: e.def, owner: e.id,
    };
    this.addProjectileMesh(p);
    this.projectiles.push(p);
    g.audio.play('freeze', { volume: 0.6 });
    if (g.net?.isHost) g.net.broadcast({ t: 'eProj', x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, l: p.life, from: g.net.selfId });
  }

  addProjectileMesh(p) {
    p.mesh = new THREE.Mesh(this.projGeo, this.projMat);
    p.mesh.position.set(p.x, p.y, p.z);
    this.group.add(p.mesh);
  }

  /** Misafir: ev sahibinin fırlattığı merminin görüntüsü (hasarı ev sahibi verir). */
  applyRemoteProjectile(msg) {
    const p = { x: msg.x, y: msg.y, z: msg.z, vx: msg.vx, vy: msg.vy, vz: msg.vz, life: msg.l, visual: true };
    this.addProjectileMesh(p);
    this.projectiles.push(p);
  }

  updateProjectiles(dt) {
    const g = this.game;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.life -= dt;
      p.mesh.position.set(p.x, p.y, p.z);
      p.mesh.rotation.x += dt * 8;
      p.mesh.rotation.y += dt * 6;
      let done = p.life <= 0 || p.y < g.world.terrain.getHeight(p.x, p.z);
      if (!done && !p.visual) {
        for (const pl of this.players()) {
          const py = pl.id === 'local' ? g.player.position.y + 1 : g.world.terrain.getHeight(pl.x, pl.z) + 1;
          if (Math.hypot(pl.x - p.x, pl.z - p.z) < 0.9 && Math.abs(py - p.y) < 1.4) {
            this.damagePlayer(pl.id, p.damage, p.def, p.x - p.vx, p.z - p.vz);
            done = true;
            break;
          }
        }
      }
      if (done) {
        g.world.particles.emit('frost', p.x, p.y, p.z, 0.8);
        this.group.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  // ── Çok oyunculu ────────────────────────────────────────
  setRemote(on) {
    this.remote = on;
    this.respawnQueue = [];
  }

  /** Ağ durumu; x,z,range verilirse yalnızca o noktanın yakınındakiler. */
  snapshot(x = 0, z = 0, range = Infinity) {
    const types = Object.keys(ENEMIES);
    const r = (v) => Math.round(v * 100) / 100;
    const st = { idle: 0, wander: 1, chase: 2, windup: 3, attack: 4, return: 5, dead: 6 };
    return this.list.filter((e) => Math.hypot(e.x - x, e.z - z) < range).map((e) => [
      e.id, types.indexOf(e.type), r(e.x), r(e.z), r(e.yaw), st[e.state] ?? 0, r(e.speed), Math.round(e.hp),
      (e.dead ? 1 : 0) | (e.hurt > 0.6 ? 2 : 0) | (e.slow > 0 ? 4 : 0) | (e.burn > 0 ? 8 : 0) | (e.minion ? 16 : 0), e.maxHp,
    ]);
  }

  applySnapshot(list) {
    const types = Object.keys(ENEMIES);
    const states = ['idle', 'wander', 'chase', 'windup', 'attack', 'return', 'dead'];
    const seen = new Set();
    for (const [id, ti, x, z, yaw, st, speed, hp, flags, maxHp] of list ?? []) {
      const type = types[ti];
      if (!type) continue;
      seen.add(id);
      let e = this.byId(id);
      if (!e) {
        if (flags & 1) continue;
        e = this.spawn(type, x, z, yaw, { id, hp, minion: !!(flags & 16) });
      }
      e.netTarget = { x, z, yaw };
      const state = states[st] ?? 'idle';
      if (state === 'windup' && e.state !== 'windup') e.windupT = 0;
      if (state === 'attack' && e.state !== 'attack') e.attackT = 0;
      e.state = state;
      e.speed = speed;
      e.hp = hp;
      e.maxHp = maxHp ?? e.maxHp;
      if (flags & 2 && e.hurt <= 0) e.hurt = 1;
      e.slow = flags & 4 ? 1 : 0;
      e.burn = flags & 8 ? 1 : 0;
      if (flags & 1 && !e.dead) this.kill(e, 'remote-visual');
    }
    for (const e of [...this.list]) if (!seen.has(e.id) && !e.dead) this.remove(e);
  }

  /** Ev sahibi: misafirin vuruşu. */
  remoteHit(msg) {
    const e = this.byId(msg.id);
    if (!e || e.dead) return;
    this.hit(e, Math.min(60, Number(msg.d) || 0), Number(msg.fx) || e.x, Number(msg.fz) || e.z, msg.from, { slow: !!msg.sl, burn: !!msg.bu });
  }

  followNet(e, dt) {
    const t = e.netTarget;
    if (!t) return;
    const k = 1 - Math.exp(-8 * dt);
    if (Math.hypot(t.x - e.x, t.z - e.z) > 15) {
      e.x = t.x;
      e.z = t.z;
    } else {
      e.x += (t.x - e.x) * k;
      e.z += (t.z - e.z) * k;
    }
    e.yaw = dampAngle(e.yaw, t.yaw, 8, dt);
    if (e.state === 'windup') e.windupT += dt;
    if (e.state === 'attack') e.attackT = Math.min(1, e.attackT + dt / 0.35);
  }

  // ── Güncelleme ──────────────────────────────────────────
  place(e, dt) {
    const w = this.game.world;
    const ground = w.terrain.getHeight(e.x, e.z);
    e.y = dt ? damp(e.y, ground, 12, dt) : ground;
    const m = e.model;
    m.root.position.set(e.x, e.y, e.z);
    m.root.rotation.y = e.yaw;
    e.phase += dt * (2 + e.speed * 2.6);
    e.hurt = Math.max(0, e.hurt - dt * 4);
    animateCreature(m, {
      t: this.time + e.id, speed: e.speed / Math.max(0.6, e.def.speed), phase: e.phase,
      windup: e.state === 'windup' ? Math.min(1, e.windupT / e.def.windup) : 0,
      attack: e.state === 'attack' ? Math.min(1, e.attackT) : -1,
      hurt: e.hurt, dead: e.dead, deathT: e.deathT, roll: e.roll, laugh: e.type === 'hyena' && e.state === 'chase',
    });
  }

  update(dt) {
    const g = this.game;
    this.time += dt;
    const cam = g.camera.position;
    const players = this.players();
    const sim = g.isSimulating;
    const remotes = g.net?.isHost ? g.remotePlayers.positions() : [];
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      const camD = Math.hypot(e.x - cam.x, e.z - cam.z);
      let active = false;
      if (e.dead) {
        e.deathT += dt;
        if (e.deathT > CORPSE_TIME) {
          this.remove(e);
          continue;
        }
      } else if (this.remote) {
        this.followNet(e, dt);
      } else if (sim) {
        // yalnızca yakınında oyuncu olan düşmanlar düşünür (uzak misafirler dahil)
        let nearD = Infinity;
        for (const p of players) nearD = Math.min(nearD, Math.abs(p.x - e.x) + Math.abs(p.z - e.z));
        for (const r of remotes) nearD = Math.min(nearD, Math.abs(r.x - e.x) + Math.abs(r.z - e.z));
        active = nearD < ACTIVE_RANGE;
        if (active) this.updateEnemy(e, dt, players);
      }
      // komşularla iç içe girmesin
      if (active) {
        for (const o of this.list) {
          if (o === e || o.dead) continue;
          const dx = e.x - o.x;
          const dz = e.z - o.z;
          if (Math.abs(dx) > 3 || Math.abs(dz) > 3) continue;
          const d = Math.hypot(dx, dz);
          const min = (e.def.radius + o.def.radius) * 0.9;
          if (d < min && d > 1e-3) {
            e.x += (dx / d) * (min - d) * 0.5;
            e.z += (dz / d) * (min - d) * 0.5;
          }
        }
      }
      if (e.slow > 0 && !this.remote) e.slow -= dt;
      const visible = camD < DRAW_RANGE && !g.world.inCave;
      e.model.root.visible = visible;
      if (visible) {
        setShadowCasting(e.model.root, camD < CREATURE_SHADOW_RANGE);
        this.place(e, dt);
      }
    }
    this.updateProjectiles(dt);

    // yuvalarda yeniden doğma (ev sahibi)
    if (!this.remote && sim) {
      for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
        const q = this.respawnQueue[i];
        if (g.time.elapsed < q.at) continue;
        if (players.some((p) => Math.hypot(p.x - q.nest.x, p.z - q.nest.z) < RESPAWN_CLEAR)) continue;
        this.respawnQueue.splice(i, 1);
        this.spawnAtNest(q.nest);
      }
    }
    // ara sıra uzaktan sesler
    this.soundTimer -= dt;
    if (this.soundTimer <= 0) {
      this.soundTimer = randRange(Math.random, 6, 14);
      const p = g.player.position;
      const e = this.nearest(true, p.x, p.z, 45);
      if (e && e.state !== 'chase') g.audio.play(e.def.sound, { volume: Math.max(0.15, 1 - Math.hypot(e.x - p.x, e.z - p.z) / 45) * 0.7, minGap: 3 });
    }
  }

  // ── Kayıt ───────────────────────────────────────────────
  serialize() {
    return {
      dead: this.respawnQueue.map((q) => [this.nests.indexOf(q.nest), Math.max(0, Math.round(q.at - this.game.time.elapsed))]),
      alive: this.nests.map((n) => this.list.filter((e) => e.nest === n && !e.dead).length),
    };
  }

  deserialize(d) {
    if (!d) return;
    // yuvalardaki eksik düşmanları kayıttaki gibi kaldır, yeniden doğma sürelerini kur
    (d.alive ?? []).forEach((count, i) => {
      const nest = this.nests[i];
      if (!nest) return;
      const members = this.list.filter((e) => e.nest === nest);
      for (let k = count; k < members.length; k++) this.remove(members[k]);
    });
    this.respawnQueue = (d.dead ?? []).filter(([i]) => this.nests[i]).map(([i, t]) => ({ nest: this.nests[i], at: this.game.time.elapsed + t }));
  }
}

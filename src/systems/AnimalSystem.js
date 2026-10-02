import * as THREE from 'three';
import { ANIMALS } from '../data/animals.js';
import { buildAnimalModel } from '../world/AnimalModels.js';
import { rollDrops } from './LootSystem.js';
import { mulberry32, randRange, clamp, damp, dampAngle, lerp } from '../utils/math.js';

const ACTIVE_RANGE = 150; // bu mesafenin dışındaki hayvanlar donar
const DRAW_RANGE = 125;
const CARCASS_TIME = 300; // parçalanmayan leş bu kadar sonra kaybolur (s)
const MIN_SPAWN_DIST = 55; // yeniden doğanlar oyuncunun gözü önünde belirmesin

const easeOutBounce = (t) => {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};

/**
 * Pasif hayvanlar: inek, koyun, tavuk. Otlar, dolaşır, vurulunca kaçar.
 * Ölünce yan yatar (ölüm animasyonu) ve leş olarak kalır; bıçakla parçalanınca
 * türüne göre et, deri, yün veya tüy verir. Yoğunluk bilerek düşük tutuldu.
 */
export class AnimalSystem {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'animals';
    game.scene.add(this.group);
    game.world.registerSurfaceObject(this.group);
    this.list = [];
    this.respawnQueue = []; // { type, at }
    this.soundTimer = 4;
    this.nextId = 1;
    // çok oyunculu misafir: hayvanları ev sahibi yönetir, burada yalnızca gösterilir
    this.remote = false;
    this._v = new THREE.Vector3();
    this.generate();
  }

  // ── Yerleştirme ─────────────────────────────────────────
  validSpot(type, x, z) {
    const { world } = this.game;
    const isl = world.island;
    const ter = world.terrain;
    const h = ter.getHeight(x, z);
    if (h < 0.9) return false;
    if (isl.isInLake(x, z, 2)) return false;
    if (ter.getSlope(x, z) > 0.55) return false;
    const def = ANIMALS[type];
    if (!def.regions.includes(isl.region(x, z, h))) return false;
    if (isl.region(x, z, h) === 'mountain' && h > 35) return false;
    return !world.collision.overlapsCircle(x, z, def.radius + 0.3);
  }

  generate() {
    const rng = mulberry32(31337);
    const sp = this.game.world.island.spawn;
    for (const [type, def] of Object.entries(ANIMALS)) {
      const [herds, minN, maxN] = def.herds;
      for (let hIdx = 0; hIdx < herds; hIdx++) {
        for (let tries = 0; tries < 400; tries++) {
          const x = randRange(rng, -190, 190);
          const z = randRange(rng, -190, 190);
          if (Math.hypot(x - sp.x, z - sp.z) < 30) continue;
          if (!this.validSpot(type, x, z)) continue;
          if (this.list.some((a) => Math.hypot(a.x - x, a.z - z) < 35)) continue;
          const n = minN + Math.floor(rng() * (maxN - minN + 1));
          for (let k = 0; k < n; k++) {
            for (let t2 = 0; t2 < 20; t2++) {
              const ax = x + randRange(rng, -5, 5);
              const az = z + randRange(rng, -5, 5);
              if (!this.validSpot(type, ax, az)) continue;
              this.spawn(type, ax, az, rng() * Math.PI * 2, { home: { x, z } });
              break;
            }
          }
          break;
        }
      }
    }
  }

  spawn(type, x, z, yaw, opts = {}) {
    const def = ANIMALS[type];
    const model = buildAnimalModel(type);
    this.group.add(model.root);
    const a = {
      id: opts.id ?? this.nextId++,
      type, def, model, x, z, yaw,
      y: this.game.world.terrain.getHeight(x, z),
      hp: opts.hp ?? def.hp,
      home: opts.home ?? { x, z },
      state: 'idle', timer: Math.random() * 3, target: null, speed: 0,
      phase: Math.random() * 6, graze: 0, hurt: 0, flee: 0,
      dead: false, deathT: 0, carcass: 0, butchered: false, sinkT: 0,
    };
    if (opts.id && opts.id >= this.nextId) this.nextId = opts.id + 1;
    if (opts.dead) this.kill(a, true);
    this.list.push(a);
    this.placeModel(a, 0);
    return a;
  }

  remove(a) {
    this.group.remove(a.model.root);
    const i = this.list.indexOf(a);
    if (i >= 0) this.list.splice(i, 1);
  }

  // ── Etkileşim ───────────────────────────────────────────
  forEachNear(x, z, radius, fn) {
    for (const a of this.list) {
      if (a.butchered) continue;
      const d = Math.hypot(a.x - x, a.z - z);
      if (d <= radius) fn(a, d);
    }
  }

  nearest(type, x, z, maxDist = 200) {
    let best = null;
    let bestD = maxDist;
    for (const a of this.list) {
      if (a.dead || (type !== true && a.type !== type)) continue;
      const d = Math.hypot(a.x - x, a.z - z);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  }

  byId(id) {
    return this.list.find((a) => a.id === id) ?? null;
  }

  /** Vuruş: can düşer, hayvan irkilir ve kaçar. Öldüyse true. attacker: vuran uzak oyuncu (ev sahibinde). */
  hit(a, damage, fromX, fromZ, attacker = null) {
    if (a.dead) return false;
    const g = this.game;
    if (this.remote) {
      // misafir: vuruşu ev sahibine bildir, geri bildirimi hemen göster
      g.net.emit({ t: 'aHit', id: a.id, d: damage, fx: fromX, fz: fromZ });
      a.hurt = 1;
      g.world.particles.emit(a.type === 'chicken' ? 'feather' : 'hit', a.x, a.y + a.def.height * 0.6, a.z, a.type === 'chicken' ? 0.8 : 0.6);
      g.audio.play(a.def.sound, { volume: 0.9, minGap: 0.2 });
      return false;
    }
    a.hp = Math.max(0, a.hp - damage);
    a.hurt = 1;
    const dx = a.x - fromX;
    const dz = a.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    // küçük geri itme
    a.x += (dx / d) * 0.25;
    a.z += (dz / d) * 0.25;
    g.world.particles.emit(a.type === 'chicken' ? 'feather' : 'hit', a.x, a.y + a.def.height * 0.6, a.z, a.type === 'chicken' ? 0.8 : 0.6);
    g.audio.play(a.def.sound, { volume: 0.9, minGap: 0.2 });
    if (a.hp <= 0) {
      this.kill(a, false, attacker);
      return true;
    }
    a.state = 'flee';
    a.flee = randRange(Math.random, 4, 6.5);
    a.fleeDir = Math.atan2(dx, dz);
    return false;
  }

  kill(a, silent = false, attacker = null) {
    a.dead = true;
    a.hp = 0;
    a.state = 'dead';
    a.deathT = silent ? 5 : 0;
    a.carcass = 0;
    a.deathRoll = a.deathRoll ?? (Math.random() < 0.5 ? 1 : -1);
    if (silent) return;
    const g = this.game;
    if (attacker === 'remote-visual') return; // misafirde yalnızca görüntü
    if (attacker) {
      // ev sahibi: av ödülü vuran misafire gider
      g.net.sendTo(attacker, { t: 'aKill', type: a.type, from: g.net.selfId });
      return;
    }
    this.rewardKill(a.type);
  }

  /** Avlama ödülü (deneyim, istatistik, görev olayı). */
  rewardKill(type) {
    const g = this.game;
    const def = ANIMALS[type];
    g.progression.addXP(def.xp, 'hunt');
    g.state.stats.animalsHunted = (g.state.stats.animalsHunted ?? 0) + 1;
    g.bus.emit('animal:killed', { type });
    g.notify(`${def.icon} ${def.name} avlandı! Bıçakla [E] parçalayabilirsin.`, 'success');
  }

  /** Bıçakla parçalama: ganimet verilir, leş toprağa gömülerek kaybolur. */
  butcher(a) {
    if (!a.dead || a.butchered) return;
    const g = this.game;
    if (this.remote) {
      // misafir: leşi ev sahibinden iste (iki kişi aynı leşi alamasın)
      if (a.pendingButcher) return;
      a.pendingButcher = true;
      g.net.emit({ t: 'aBut', id: a.id });
      return;
    }
    this.markButchered(a);
    this.rewardButcher(a.type, rollDrops(a.def.harvest, g.progression.bonus('extraYield')), a);
  }

  markButchered(a) {
    a.butchered = true;
    a.sinkT = 0;
    this.queueRespawn(a.type);
  }

  rewardButcher(type, drops, a = null) {
    const g = this.game;
    const def = ANIMALS[type];
    g.interaction.giveItems(drops);
    g.progression.addXP(Math.round(def.xp * 0.5), 'hunt');
    if (a) {
      g.world.particles.emit('dust', a.x, a.y + 0.3, a.z, 1.1);
      if (type === 'chicken') g.world.particles.emit('feather', a.x, a.y + 0.3, a.z, 2);
      if (type === 'sheep') g.world.particles.emit('wool', a.x, a.y + 0.4, a.z, 1.5);
    }
    g.bus.emit('animal:butchered', { type });
    g.requestSave();
  }

  // ── Çok oyunculu ────────────────────────────────────────
  /** Misafir moduna geç: yapay zekâ ve yeniden doğma kapanır, durum ev sahibinden gelir. */
  setRemote(on) {
    this.remote = on;
    this.respawnQueue = [];
  }

  /** Ev sahibi → misafir: tüm hayvanların sıkıştırılmış durumu. */
  snapshot() {
    const types = Object.keys(ANIMALS);
    return this.list.map((a) => [
      a.id, types.indexOf(a.type), Math.round(a.x * 100) / 100, Math.round(a.z * 100) / 100, Math.round(a.yaw * 100) / 100,
      a.state === 'flee' ? 2 : a.state === 'walk' ? 1 : 0, Math.round(a.speed * 100) / 100, Math.round(a.graze * 100) / 100,
      (a.dead ? 1 : 0) | (a.butchered ? 2 : 0) | (a.hurt > 0.6 ? 4 : 0), a.deathRoll ?? 1,
    ]);
  }

  /** Misafir: ev sahibinin durumunu uygula (eksikleri oluştur, olmayanları kaldır). */
  applySnapshot(list) {
    const types = Object.keys(ANIMALS);
    const seen = new Set();
    for (const [id, ti, x, z, yaw, st, speed, graze, flags, roll] of list ?? []) {
      const type = types[ti];
      if (!type) continue;
      seen.add(id);
      let a = this.byId(id);
      if (!a) {
        if (flags & 2) continue; // parçalanmış leşi yeniden yaratma
        a = this.spawn(type, x, z, yaw, { id, dead: !!(flags & 1) });
        a.deathRoll = roll;
      }
      a.netTarget = { x, z, yaw };
      a.state = a.dead ? 'dead' : st === 2 ? 'flee' : st === 1 ? 'walk' : 'idle';
      a.speed = speed;
      a.graze = graze;
      if (flags & 4 && a.hurt <= 0) a.hurt = 1;
      if (flags & 1 && !a.dead) {
        a.deathRoll = roll;
        this.kill(a, false, 'remote-visual');
      }
      if (flags & 2 && !a.butchered) {
        a.butchered = true;
        a.sinkT = 0;
      }
    }
    for (const a of [...this.list]) {
      if (!seen.has(a.id) && !a.butchered) this.remove(a);
    }
  }

  /** Ev sahibi: bir misafirin vuruşu. */
  remoteHit(msg) {
    const a = this.byId(msg.id);
    if (!a || a.dead) return;
    this.hit(a, Math.min(40, Number(msg.d) || 0), Number(msg.fx) || a.x, Number(msg.fz) || a.z, msg.from);
  }

  /** Ev sahibi: bir misafirin parçalama isteği (ilk gelen alır). */
  remoteButcher(msg) {
    const a = this.byId(msg.id);
    const net = this.game.net;
    if (!a || !a.dead || a.butchered) {
      net.sendTo(msg.from, { t: 'aButNo', id: msg.id, from: net.selfId });
      return;
    }
    this.markButchered(a);
    const drops = rollDrops(a.def.harvest);
    net.sendTo(msg.from, { t: 'aButOk', id: a.id, type: a.type, drops, from: net.selfId });
  }

  onRemoteKill(msg) {
    if (ANIMALS[msg.type]) this.rewardKill(msg.type);
  }

  onButcherOk(msg) {
    if (!ANIMALS[msg.type]) return;
    const a = this.byId(msg.id);
    if (a) a.pendingButcher = false;
    const drops = (msg.drops ?? []).filter((d) => d && typeof d.item === 'string').map((d) => ({ item: d.item, amount: Math.max(1, Math.min(10, d.amount | 0)) }));
    this.rewardButcher(msg.type, drops, a);
  }

  onButcherDenied(msg) {
    const a = this.byId(msg.id);
    if (a) a.pendingButcher = false;
    this.game.notify('Bu leşi başka biri aldı.', 'warn');
  }

  queueRespawn(type) {
    this.respawnQueue.push({ type, at: this.game.time.elapsed + ANIMALS[type].respawn });
  }

  /** Oyuncuyu canlı hayvanların içinden iter (hayvanlar sabit engel gibi davranır). */
  pushPlayer(pos, radius) {
    for (const a of this.list) {
      if (a.dead) continue;
      const dx = pos.x - a.x;
      const dz = pos.z - a.z;
      const min = radius + a.def.radius;
      const d = Math.hypot(dx, dz);
      if (d < min && d > 1e-4) {
        pos.x = a.x + (dx / d) * min;
        pos.z = a.z + (dz / d) * min;
      }
    }
  }

  // ── Yapay zekâ ──────────────────────────────────────────
  pickWanderTarget(a) {
    for (let t = 0; t < 8; t++) {
      const ang = Math.random() * Math.PI * 2;
      const r = randRange(Math.random, 3, 10);
      let x = a.x + Math.cos(ang) * r;
      let z = a.z + Math.sin(ang) * r;
      // sürüden fazla uzaklaşma
      const hx = x - a.home.x, hz = z - a.home.z;
      const hd = Math.hypot(hx, hz);
      if (hd > 28) {
        x = a.home.x + (hx / hd) * 20;
        z = a.home.z + (hz / hd) * 20;
      }
      if (this.validSpot(a.type, x, z)) return { x, z };
    }
    return null;
  }

  updateAnimal(a, dt, player) {
    const def = a.def;
    const world = this.game.world;
    const pd = Math.hypot(player.x - a.x, player.z - a.z);

    if (def.skittish && !player.ghost && a.state !== 'flee' && pd < def.skittish && !this.game.world.inCave) {
      a.state = 'flee';
      a.flee = randRange(Math.random, 1.5, 2.5);
      a.fleeDir = Math.atan2(a.x - player.x, a.z - player.z);
      if (Math.random() < 0.5) this.game.audio.play('cluck', { volume: 0.6, minGap: 0.4 });
    }

    let targetSpeed = 0;
    let targetYaw = a.yaw;
    a.timer -= dt;
    if (a.state === 'idle') {
      a.graze = damp(a.graze, a.grazing ? 1 : 0, 3, dt);
      if (a.timer <= 0) {
        if (Math.random() < 0.6) {
          a.target = this.pickWanderTarget(a);
          if (a.target) {
            a.state = 'walk';
            a.timer = 12;
          } else a.timer = 2;
        } else {
          a.grazing = Math.random() < 0.7;
          a.timer = randRange(Math.random, 2.5, 6);
        }
      }
    } else if (a.state === 'walk') {
      a.graze = damp(a.graze, 0, 6, dt);
      const dx = a.target.x - a.x;
      const dz = a.target.z - a.z;
      const d = Math.hypot(dx, dz);
      targetYaw = Math.atan2(dx, dz);
      targetSpeed = def.speed;
      if (d < 0.6 || a.timer <= 0) {
        a.state = 'idle';
        a.grazing = Math.random() < 0.6;
        a.timer = randRange(Math.random, 2, 7);
      }
    } else if (a.state === 'flee') {
      a.graze = damp(a.graze, 0, 10, dt);
      a.flee -= dt;
      // oyuncudan uzağa, hafif zikzak
      a.fleeDir = Math.atan2(a.x - player.x, a.z - player.z) + Math.sin(a.phase * 0.7) * 0.5;
      targetYaw = a.fleeDir;
      targetSpeed = def.fleeSpeed * (a.flee > 1 ? 1 : a.flee);
      if (a.flee <= 0) {
        a.state = 'idle';
        a.home = { x: a.x, z: a.z };
        a.timer = randRange(Math.random, 1, 3);
      }
    }

    a.yaw = dampAngle(a.yaw, targetYaw, a.state === 'flee' ? 8 : 3.5, dt);
    a.speed = damp(a.speed, targetSpeed, 5, dt);
    if (a.speed > 0.01) {
      const nx = a.x + Math.sin(a.yaw) * a.speed * dt;
      const nz = a.z + Math.cos(a.yaw) * a.speed * dt;
      const ok = world.terrain.getHeight(nx, nz) > 0.7 && !world.island.isInLake(nx, nz, 1) && world.terrain.getSlope(nx, nz) < 0.8;
      if (ok) {
        a.x = nx;
        a.z = nz;
        this._v.set(a.x, 0, a.z);
        if (world.collision.resolveCircle(this._v, def.radius * 0.8, a.y) && a.state === 'walk') a.timer = Math.min(a.timer, 0.5);
        a.x = this._v.x;
        a.z = this._v.z;
      } else {
        // su ya da uçurum: yön değiştir
        if (a.state === 'flee') a.fleeDir += Math.PI * 0.6;
        a.state = a.state === 'flee' ? 'flee' : 'idle';
        a.speed *= 0.3;
        a.yaw += Math.PI * 0.5;
      }
    }
    a.y = damp(a.y, world.terrain.getHeight(a.x, a.z), 12, dt);
  }

  /** Misafir: ev sahibinden gelen konuma yumuşak geçiş. */
  followNet(a, dt) {
    const t = a.netTarget;
    if (!t) return;
    const k = 1 - Math.exp(-8 * dt);
    if (Math.hypot(t.x - a.x, t.z - a.z) > 15) {
      a.x = t.x;
      a.z = t.z;
    } else {
      a.x += (t.x - a.x) * k;
      a.z += (t.z - a.z) * k;
    }
    a.yaw = dampAngle(a.yaw, t.yaw, 8, dt);
    a.y = damp(a.y, this.game.world.terrain.getHeight(a.x, a.z), 12, dt);
  }

  updateDead(a, dt) {
    a.deathT += dt;
    a.carcass += dt;
    if (a.butchered) {
      a.sinkT += dt;
      if (a.sinkT > 1.2) this.remove(a);
      return;
    }
    if (this.remote) {
      this.followNet(a, dt);
      return;
    }
    if (a.carcass > CARCASS_TIME) {
      a.butchered = true;
      a.sinkT = 0;
      this.queueRespawn(a.type);
    }
  }

  /** Modeli konum/animasyona göre yerleştirir. */
  placeModel(a, dt) {
    const m = a.model;
    const root = m.root;
    root.position.set(a.x, a.y, a.z);
    root.rotation.y = a.yaw;
    a.phase += dt * (2 + a.speed * 3.2);
    const walk = clamp(a.speed / Math.max(0.6, a.def.speed), 0, 1.6);

    if (a.dead) {
      // yana devrilme (zıplayarak oturur), bacaklar gerilir, kısa bir çırpınma
      const k = Math.min(1, a.deathT / 0.75);
      const roll = easeOutBounce(k) * (Math.PI / 2) * a.deathRoll;
      m.body.rotation.z = roll;
      // gövde merkezi yerinde kalsın, yanı yere değsin
      m.body.position.x = Math.sin(roll) * m.centerY;
      m.body.position.y = 0;
      root.position.y = a.y + Math.abs(Math.sin(roll)) * m.lieHeight;
      const twitch = a.deathT < 2.2 ? Math.sin(a.deathT * 24) * 0.25 * (1 - a.deathT / 2.2) : 0;
      m.legs.forEach((l, i) => { l.rotation.x = (i % 2 ? 0.35 : -0.35) + twitch * (i % 2 ? 1 : -1); });
      m.head.rotation.x = lerp(m.head.rotation.x, 0.25, Math.min(1, dt * 4));
      m.eyes.scale.y = lerp(1, 0.15, k);
      if (m.wings) m.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (0.6 + twitch); });
      if (a.butchered) {
        const s = Math.max(0.01, 1 - a.sinkT / 1.2);
        root.scale.setScalar(s);
        root.position.y = a.y + m.lieHeight * s - (1 - s) * 0.4;
      } else root.scale.set(1, 1, 1);
      return;
    }

    // yürüme: bacaklar çapraz salınır, gövde hafifçe sallanır
    const sw = Math.sin(a.phase) * 0.55 * walk;
    if (m.legs.length === 4) {
      m.legs[0].rotation.x = sw;
      m.legs[3].rotation.x = sw;
      m.legs[1].rotation.x = -sw;
      m.legs[2].rotation.x = -sw;
    } else {
      m.legs[0].rotation.x = sw * 1.3;
      m.legs[1].rotation.x = -sw * 1.3;
    }
    m.body.position.y = Math.abs(Math.sin(a.phase)) * 0.04 * walk;
    // otlama: baş yere eğilir, arada çiğner
    const chew = a.graze > 0.5 ? Math.sin(a.phase * 3) * 0.06 : 0;
    m.head.rotation.x = a.graze * 0.95 + chew + Math.sin(a.phase * 0.5) * 0.04;
    m.head.position.y = m.headBase.y - a.graze * 0.12;
    if (a.type === 'chicken') {
      // tavuk: kafa ileri geri gider, kaçarken kanat çırpar
      m.head.position.z = m.headBase.z + Math.sin(a.phase * 2) * 0.03 * walk;
      const flap = a.state === 'flee' ? Math.sin(a.phase * 6) * 0.9 : 0;
      m.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * Math.max(0, flap); });
    }
    if (m.tail) m.tail.rotation.z = Math.sin(a.phase * 0.7 + a.x) * 0.25;
    // vurulunca irkilme
    if (a.hurt > 0) {
      a.hurt = Math.max(0, a.hurt - dt * 4);
      const s = 1 + Math.sin(a.hurt * Math.PI) * 0.12;
      root.scale.set(s, 1 / s, s);
    } else root.scale.set(1, 1, 1);
    // göz kırpma
    const blink = (a.phase * 0.31) % 6 < 0.12;
    m.eyes.scale.y = blink ? 0.2 : 1;
  }

  /** Bir hayvana en yakın oyuncu (çok oyunculuda misafirler de sayılır). */
  nearestPlayer(a, players) {
    let best = players[0];
    let bestD = Infinity;
    for (const p of players) {
      const d = Math.hypot(a.x - p.x, a.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return { p: best, d: bestD };
  }

  update(dt) {
    const g = this.game;
    const p = g.player.position;
    const cam = g.camera.position;
    const players = [g.player.ghost ? { x: p.x, z: p.z, ghost: true } : p];
    if (g.net?.isHost) for (const r of g.remotePlayers.positions()) if (!r.cave) players.push(r);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      if (a.dead) this.updateDead(a, dt);
      else if (this.remote) this.followNet(a, dt);
      else {
        const near = this.nearestPlayer(a, players);
        if (near.d < ACTIVE_RANGE && g.isSimulating) this.updateAnimal(a, dt, near.p);
      }
      if (!this.list.includes(a)) continue;
      const visible = Math.hypot(a.x - cam.x, a.z - cam.z) < DRAW_RANGE;
      a.model.root.visible = visible;
      if (visible) this.placeModel(a, dt);
    }

    // ara sıra uzaktan ses
    this.soundTimer -= dt;
    if (this.soundTimer <= 0 && !g.world.inCave) {
      this.soundTimer = randRange(Math.random, 9, 20);
      const near = this.list.filter((a) => !a.dead && Math.hypot(a.x - p.x, a.z - p.z) < 40);
      const a = near[Math.floor(Math.random() * near.length)];
      if (a) g.audio.play(a.def.sound, { volume: clamp(1 - Math.hypot(a.x - p.x, a.z - p.z) / 45, 0.15, 0.7), minGap: 1 });
    }

    // yeniden doğma: oyuncudan uzakta, uygun bir çayırda (misafirde ev sahibi yönetir)
    if (this.remote) return;
    const now = g.time.elapsed;
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      const r = this.respawnQueue[i];
      if (now < r.at) continue;
      for (let t = 0; t < 30; t++) {
        const x = randRange(Math.random, -190, 190);
        const z = randRange(Math.random, -190, 190);
        if (players.some((q) => Math.hypot(x - q.x, z - q.z) < MIN_SPAWN_DIST)) continue;
        if (!this.validSpot(r.type, x, z)) continue;
        this.spawn(r.type, x, z, Math.random() * Math.PI * 2);
        this.respawnQueue.splice(i, 1);
        break;
      }
    }
  }

  // ── Kayıt ───────────────────────────────────────────────
  serialize() {
    const now = this.game.time.elapsed;
    return {
      list: this.list.filter((a) => !a.butchered).map((a) => ({
        t: a.type, x: +a.x.toFixed(2), z: +a.z.toFixed(2), yaw: +a.yaw.toFixed(2), hp: a.hp, dead: a.dead ? 1 : 0,
        hx: +a.home.x.toFixed(1), hz: +a.home.z.toFixed(1),
      })),
      respawn: this.respawnQueue.map((r) => ({ type: r.type, in: Math.max(0, Math.round(r.at - now)) })),
    };
  }

  deserialize(d) {
    if (!d?.list) return; // eski kayıt: yeni üretilmiş hayvanlar kalır
    for (const a of [...this.list]) this.remove(a);
    for (const s of d.list) {
      if (!ANIMALS[s.t]) continue;
      this.spawn(s.t, s.x, s.z, s.yaw ?? 0, { hp: s.hp, dead: !!s.dead, home: { x: s.hx ?? s.x, z: s.hz ?? s.z } });
    }
    const now = this.game.time.elapsed;
    this.respawnQueue = (d.respawn ?? []).filter((r) => ANIMALS[r.type]).map((r) => ({ type: r.type, at: now + (r.in ?? 0) }));
  }
}

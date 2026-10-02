import * as THREE from 'three';
import { BOSSES } from '../data/bosses.js';
import { ITEMS } from '../data/items.js';
import { buildCreatureModel, animateCreature } from '../world/CreatureModels.js';
import { damp, dampAngle, randRange, wrapAngle } from '../utils/math.js';

const RISE_TIME = 3.2;
const SLEEP_TIME = 2.5;
const ARENA_LEASH = 26; // boss sunaktan bu kadar uzaklaşabilir
const ENGAGE_RANGE = 55; // sunağa bu yakınlıktaki oyuncular savaşa dahil
const RESET_TIME = 30; // kimse kalmazsa bu süre sonra boss yeniden uykuya döner
const BAR_RANGE = 75; // can çubuğunun göründüğü mesafe
const NET_INTERVAL = 0.1;
const MAX_MINIONS = 4;
const POOL_LIFE = 14;

/**
 * Saldırı türleri: hazırlanma (uyarı halkası dolar), vuruş sonrası toparlanma, menzil, model duruşu.
 *   reach  : boss bu mesafeye gelince saldırıya başlar (gövde yarıçapına eklenir)
 */
const ATTACKS = {
  slam: { windup: 1.3, recover: 1.0, reach: 4.5, pose: 'slam' },
  sweep: { windup: 1.0, recover: 0.8, reach: 5.0, pose: 'sweep' },
  roots: { windup: 1.25, recover: 0.7, reach: 24, pose: 'roots' },
  tail: { windup: 1.05, recover: 0.7, reach: 7.5, pose: 'slam' },
  burrow: { windup: 0.9, recover: 0.9, reach: 30, pose: 'slam' },
  boulder: { windup: 1.0, recover: 0.9, reach: 28, pose: 'boulder' },
  meteor: { windup: 1.1, recover: 1.1, reach: 30, pose: 'meteor' },
  pools: { windup: 1.0, recover: 0.8, reach: 26, pose: 'pools' },
  summon: { windup: 1.3, recover: 0.9, reach: 30, pose: 'summon' },
};
const ATTACK_NAMES = Object.keys(ATTACKS);
const STATES = ['rise', 'chase', 'windup', 'strike', 'recover', 'burrow', 'emerge', 'sleep', 'dead'];
const DMG_MULT = { slam: 1, sweep: 0.9, roots: 0.75, tail: 0.85, burrow: 1.2, boulder: 1, meteor: 0.85, pools: 0, summon: 0 };
const RISE_FX = { guardian: 'leaf', sand_king: 'sand', frost_giant: 'snow', lava_golem: 'fire' };
const easeOut = (t) => 1 - (1 - t) * (1 - t);

// ── Uyarı halkası (yere çizilen, araziye oturan disk) ─────────
const DECAL_VERT = /* glsl */ `
  varying vec2 vLocal;
  void main() {
    vLocal = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const DECAL_FRAG = /* glsl */ `
  uniform float uR;
  uniform float uK;
  uniform float uTime;
  uniform float uFade;
  uniform vec3 uColor;
  varying vec2 vLocal;
  void main() {
    float d = length(vLocal) / uR;
    float edge = smoothstep(0.88, 0.96, d) * (1.0 - smoothstep(0.985, 1.0, d));
    float fill = step(d, uK) * 0.3;
    float front = smoothstep(uK - 0.08, uK, d) * step(d, uK) * 0.45;
    float a = max(edge * 0.85, fill + front) + 0.07;
    a *= (0.8 + 0.2 * sin(uTime * 16.0)) * uFade;
    gl_FragColor = vec4(uColor, a);
  }
`;

/**
 * Ada muhafızları (boss'lar). Sunağa çağırma eşyası konunca uyanır, saldırılarını yere çizilen
 * uyarı halkalarıyla önceden belli eder. Yenilince odadaki herkese ödül verir ve bir sonraki adanın
 * seyir haritasını açar. Çok oyunculuda ev sahibi yönetir; misafirler durumu ve halkaları ağdan alır.
 */
export class BossSystem {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'bosses';
    game.scene.add(this.group);
    game.world.registerSurfaceObject(this.group);
    this.defeated = new Set();
    this.boss = null;
    this.telegraphs = [];
    this.hazards = [];
    this.props = [];
    this.remote = false;
    this.time = 0;
    this.netTimer = 0;
    this.poolTick = 0;
    this.barShown = null;
    this._v = new THREE.Vector3();
    this.spikeGeo = new THREE.ConeGeometry(0.28, 2.2, 5);
    this.spikeGeo.translate(0, 1.1, 0);
    this.spikeMat = new THREE.MeshStandardMaterial({ color: '#5a3d22', roughness: 0.9, flatShading: true });
    this.boulderGeo = new THREE.IcosahedronGeometry(0.9, 0);
    this.boulderMat = new THREE.MeshStandardMaterial({ color: '#bfe8ff', roughness: 0.4, flatShading: true, emissive: '#2a6c8a', emissiveIntensity: 0.4 });
    this.meteorGeo = new THREE.DodecahedronGeometry(0.8, 0);
    this.meteorMat = new THREE.MeshStandardMaterial({ color: '#2a1a14', roughness: 0.8, flatShading: true, emissive: '#ff5a1f', emissiveIntensity: 1.6 });
    this.poolMat = new THREE.MeshBasicMaterial({ color: '#ff6a1f', transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  }

  get world() {
    return this.game.world;
  }

  altarOf(id) {
    return this.world.landmarks.byId[BOSSES[id]?.altar] ?? null;
  }

  isDefeated(id) {
    return !!id && this.defeated.has(id);
  }

  get activeId() {
    return this.boss && this.boss.state !== 'dead' && this.boss.state !== 'sleep' ? this.boss.id : null;
  }

  // ── Sunak ───────────────────────────────────────────────
  altarPrompt(entry) {
    const id = entry.def.altar;
    const def = BOSSES[id];
    const name = entry.def.name;
    if (this.defeated.has(id)) return { action: 'İncele', name, note: `${def.icon} ${def.name} yenildi — sunak huzura kavuştu` };
    if (this.boss && this.boss.id === id && this.boss.state !== 'dead') return { action: 'Sunak', name, disabled: true, note: `${def.icon} ${def.name} uyandı — savaş!` };
    if (this.activeId) return { action: 'Sunak', name, disabled: true, note: 'Başka bir muhafız şu an uyanık' };
    const item = ITEMS[def.summon];
    const have = this.game.player.inventory.count(def.summon) > 0;
    if (!have) return { action: 'Sunağı İncele', name, note: `Uyandırmak için ${item.icon} ${item.name} gerekli` };
    return { action: `${item.name} Koy`, name, note: `${def.icon} ${def.name} uyanacak! Hazır mısın?` };
  }

  interactAltar(entry) {
    const g = this.game;
    const id = entry.def.altar;
    const def = BOSSES[id];
    const item = ITEMS[def.summon];
    if (this.defeated.has(id)) {
      g.notify(`${def.icon} ${def.name} burada yenildi. ${def.reward.reveal ? 'Seyir haritası yeni adanın yolunu gösteriyor.' : 'Takımadanın sırrı çözüldü.'}`, 'info');
      return;
    }
    if (this.boss && this.boss.state !== 'dead') return;
    const inv = g.player.inventory;
    if (!inv.count(def.summon)) {
      g.notify(`Sunağın ortasında bir yuva var. ${item.icon} ${item.name} konunca ${def.name} uyanacak. (Üretim → ${item.name})`, 'info');
      g.audio.play('error');
      return;
    }
    inv.remove(def.summon, 1);
    g.audio.play('magic');
    g.bus.emit('boss:summoned', { id });
    if (this.remote) {
      g.net.emit({ t: 'bSum', id });
      return;
    }
    this.summon(id, g.player.position.x, g.player.position.z);
  }

  /** Ev sahibi: misafir sunağa eşyayı koydu. */
  remoteSummon(msg) {
    const def = BOSSES[msg.id];
    if (!def) return;
    if (this.defeated.has(msg.id) || (this.boss && this.boss.state !== 'dead')) {
      this.game.net.sendTo(msg.from, { t: 'bNo', item: def.summon, from: this.game.net.selfId });
      return;
    }
    const pos = this.game.remotePlayers.positions().find((p) => p.id === msg.from);
    this.summon(msg.id, pos?.x, pos?.z);
  }

  /** Misafir: boss uyandırılamadı, eşya geri verilir. */
  refund(msg) {
    const item = ITEMS[msg.item];
    if (!item) return;
    this.game.interaction.giveItems([{ item: msg.item, amount: 1 }]);
    this.game.notify('Sunak şu an kullanılamıyor — eşyan geri verildi.', 'warn');
  }

  // ── Uyanış ──────────────────────────────────────────────
  summon(id, fromX, fromZ) {
    const def = BOSSES[id];
    const altar = this.altarOf(id);
    if (!def || !altar) return;
    // sunağın, uyandıranın karşı tarafından yükselir
    let a = Number.isFinite(fromX) ? Math.atan2(altar.x - fromX, altar.z - fromZ) : 0;
    if (!Number.isFinite(a)) a = 0;
    const x = altar.x + Math.sin(a) * 7;
    const z = altar.z + Math.cos(a) * 7;
    const players = Math.max(1, this.engagedPlayers().length);
    const maxHp = Math.round(def.hp * (1 + 0.45 * (players - 1)) * (0.85 + (this.game.difficulty?.damage ?? 1) * 0.15));
    this.createBoss(id, x, z, a + Math.PI, maxHp, maxHp, 'rise');
    if (this.game.net?.isHost) this.game.net.broadcast({ t: 'bSpawn', id, x, z, yaw: this.boss.yaw, hp: maxHp, mhp: maxHp, from: this.game.net.selfId });
    this.onSpawnFx();
  }

  createBoss(id, x, z, yaw, hp, maxHp, state) {
    this.clearBoss();
    const def = BOSSES[id];
    const model = buildCreatureModel(id);
    this.group.add(model.root);
    const altar = this.altarOf(id);
    this.boss = {
      id, def, model, x, z, yaw, y: this.world.terrain.getHeight(x, z),
      hp, maxHp, state, t: 0, speed: 0, phase: 0, hurt: 0, sub: state === 'rise' ? 1 : 0,
      attackIdx: 0, cur: null, atkT: -1, windup: 0, gap: 1.5, chaseT: 0, resetT: 0,
      targetId: null, retarget: 6, enraged: false, slow: 0, burn: 0, burnTick: 0, deathT: 0,
      home: { x: altar?.x ?? x, z: altar?.z ?? z }, altar,
    };
    if (altar) altar.glowState = 1;
    this.placeBoss(0);
  }

  clearBoss() {
    if (!this.boss) return;
    this.group.remove(this.boss.model.root);
    this.boss = null;
    this.game.ui?.hud.setBossBar(null);
    this.barShown = null;
  }

  onSpawnFx() {
    const b = this.boss;
    const g = this.game;
    const p = g.player.position;
    const d = Math.hypot(b.x - p.x, b.z - p.z);
    if (d < 150) {
      g.ui.hud.banner(b.def.title, b.def.name, b.def.intro, 5);
      g.audio.play('roar', { volume: Math.max(0.3, 1 - d / 150) });
      g.cameraController.shake(Math.max(0, 0.5 - d / 120));
    }
  }

  // ── Hedefler ────────────────────────────────────────────
  /** Sunağın yakınındaki (savaşa katılan) oyuncular. */
  engagedPlayers() {
    const b = this.boss;
    const all = this.game.enemies.players();
    if (!b) return all;
    return all.filter((p) => Math.hypot(p.x - b.home.x, p.z - b.home.z) < ENGAGE_RANGE);
  }

  // ── Hasar alma ──────────────────────────────────────────
  /** Boss'a vurulabilir mi (toprağın altında / uyanırken dokunulmaz)? */
  get targetable() {
    const b = this.boss;
    return !!b && (b.state === 'chase' || b.state === 'windup' || b.state === 'strike' || b.state === 'recover' || (b.state === 'emerge' && b.t > 0.3));
  }

  hit(damage, fromX, fromZ, effects = {}) {
    const b = this.boss;
    if (!b || !this.targetable) return false;
    const g = this.game;
    b.hurt = 1;
    const fx = { guardian: 'wood', sand_king: 'chitin', frost_giant: 'ice', lava_golem: 'fire' }[b.id] ?? 'hit';
    this.world.particles.emit(fx, b.x + (fromX - b.x) * 0.35, b.y + b.def.height * 0.45, b.z + (fromZ - b.z) * 0.35, 0.9);
    if (effects.slow) this.world.particles.emit('frost', b.x, b.y + b.def.height * 0.5, b.z, 0.7);
    if (effects.burn) this.world.particles.emit('fire', b.x, b.y + b.def.height * 0.5, b.z, 0.7);
    if (this.remote) {
      g.net.emit({ t: 'bHit', d: damage, sl: effects.slow ? 1 : 0, bu: effects.burn ? 1 : 0 });
      return false;
    }
    if (effects.slow) b.slow = 3;
    if (effects.burn) b.burn = 4;
    this.damageBoss(damage);
    return b.state === 'dead';
  }

  damageBoss(damage) {
    const b = this.boss;
    if (!b || b.state === 'dead') return;
    b.hp = Math.max(0, b.hp - damage);
    if (!b.enraged && b.hp <= b.maxHp * 0.5 && b.hp > 0) this.enrage();
    if (b.hp <= 0) this.defeat();
  }

  remoteHit(msg) {
    if (!this.targetable) return;
    const b = this.boss;
    if (msg.sl) b.slow = 3;
    if (msg.bu) b.burn = 4;
    b.hurt = 1;
    this.damageBoss(Math.min(80, Math.max(0, Number(msg.d) || 0)));
  }

  enrage() {
    const b = this.boss;
    b.enraged = true;
    this.game.audio.play('roar', { volume: 0.9 });
    this.game.notify(`${b.def.icon} ${b.def.name} öfkelendi! Saldırıları hızlanıyor.`, 'warn');
    if (this.game.net?.isHost) this.game.net.broadcast({ t: 'bRage', from: this.game.net.selfId });
    // ilk öfke anında yardımcılarını çağırır
    if (b.def.minion && b.state === 'chase') b.forceAttack = 'summon';
  }

  // ── Yenilgi ─────────────────────────────────────────────
  defeat() {
    const b = this.boss;
    b.state = 'dead';
    b.deathT = 0;
    b.hp = 0;
    this.clearTelegraphs();
    // çağrılmış yardımcılar da dağılır
    for (const e of [...this.game.enemies.list]) if (e.minion && !e.dead) this.game.enemies.kill(e, 'remote-visual');
    if (this.game.net?.isHost) this.game.net.broadcast({ t: 'bDead', id: b.id, from: this.game.net.selfId });
    this.onDefeated(b.id);
  }

  /** Boss yenildi: odadaki herkes ödülünü alır, yeni adanın konumu açılır. */
  onDefeated(id) {
    const g = this.game;
    const def = BOSSES[id];
    if (!def) return;
    const first = !this.defeated.has(id);
    this.defeated.add(id);
    const altar = this.altarOf(id);
    if (altar) altar.glowState = 2;
    if (this.boss?.id === id && this.boss.state !== 'dead') {
      this.boss.state = 'dead';
      this.boss.deathT = 0;
      this.clearTelegraphs();
    }
    g.audio.play('victory');
    g.cameraController.shake(0.3);
    g.ui.hud.banner('Muhafız Yenildi', def.name, def.reward.final ? 'Takımadanın son muhafızı düştü!' : 'Ödüller envanterinde. Seyir haritasını incele.', 5);
    g.interaction.giveItems(Object.entries(def.reward.items ?? {}).map(([item, amount]) => ({ item, amount })));
    g.progression.addXP(def.xp, 'boss');
    g.state.stats.bossesDefeated = (g.state.stats.bossesDefeated ?? 0) + 1;
    if (def.reward.reveal) g.navigation.reveal(def.reward.reveal, { broadcast: false });
    if (def.reward.final && first) {
      g.ui.hud.banner('Novera Takımadası', 'Kayıp Adaların Sırrı Çözüldü', 'Dört muhafızı da yendin. Adalar artık senin — keşfetmeye, inşa etmeye devam et!', 9);
      g.state.setFlag('archipelagoComplete', true);
    }
    g.bus.emit('boss:defeated', { id });
    g.requestSave();
  }

  /** Kimse kalmadı: boss yeniden uykuya döner, çağırma eşyası sunağın önüne bırakılır. */
  putToSleep(broadcast = true) {
    const b = this.boss;
    if (!b || b.state === 'dead' || b.state === 'sleep') return;
    b.state = 'sleep';
    b.t = 0;
    this.clearTelegraphs();
    if (b.altar) b.altar.glowState = 0;
    if (!this.remote) {
      const ip = b.altar?.interactPoint ?? b.home;
      this.world.drops.spawn(ip.x, ip.z + 1, [{ id: b.def.summon, count: 1 }]);
    }
    if (broadcast && this.game.net?.isHost) this.game.net.broadcast({ t: 'bSleep', from: this.game.net.selfId });
  }

  // ── Saldırılar ──────────────────────────────────────────
  windupTime(name) {
    return ATTACKS[name].windup * (this.boss.enraged ? 0.8 : 1);
  }

  attackEffects(name) {
    const id = this.boss.id;
    return {
      name: this.boss.def.name,
      poison: id === 'sand_king' && name === 'tail',
      chill: id === 'frost_giant',
      burn: id === 'lava_golem',
    };
  }

  startAttack(name, target, players) {
    const b = this.boss;
    const def = b.def;
    b.cur = name;
    b.state = 'windup';
    b.t = 0;
    b.windup = this.windupTime(name);
    b.chaseT = 0;
    b.attackIdx++;
    const w = b.windup;
    const mult = DMG_MULT[name] * (b.enraged ? 1.15 : 1);
    const dmg = def.damage * mult;
    const fwdX = Math.sin(b.yaw);
    const fwdZ = Math.cos(b.yaw);
    const list = [];
    const groundY = (x, z) => this.world.terrain.getHeight(x, z);
    const rnd = (r) => randRange(Math.random, -r, r);
    const arenaSpot = () => {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 16;
      return [b.home.x + Math.cos(a) * r, b.home.z + Math.sin(a) * r];
    };
    switch (name) {
      case 'slam':
        list.push({ s: 'c', x: b.x, z: b.z, r: def.radius + 5, dur: w + 0.22, fx: 'slam', dmg });
        break;
      case 'sweep':
        list.push({ s: 'a', x: b.x - fwdX * 0.5, z: b.z - fwdZ * 0.5, r: def.radius + 5, yaw: b.yaw, ang: 1.15, dur: w + 0.2, fx: 'sweep', dmg });
        break;
      case 'roots':
        for (const p of players.slice(0, 6)) {
          list.push({ s: 'c', x: p.x, z: p.z, r: 2.4, dur: w + 0.35, fx: 'roots', dmg });
          if (b.enraged) list.push({ s: 'c', x: p.x + rnd(4), z: p.z + rnd(4), r: 2.4, dur: w + 0.6, fx: 'roots', dmg });
        }
        break;
      case 'tail':
        if (target) list.push({ s: 'c', x: target.x, z: target.z, r: 2.3, dur: w + 0.15, fx: 'sting', dmg });
        break;
      case 'burrow':
        break; // halka, boss toprağa girince açılır
      case 'boulder': {
        const targets = [[target.x, target.z]];
        if (b.enraged) targets.push([target.x + rnd(5), target.z + rnd(5)], [target.x + rnd(5), target.z + rnd(5)]);
        const hx = b.x + fwdX * 1.2;
        const hz = b.z + fwdZ * 1.2;
        targets.forEach(([x, z], i) => {
          list.push({ s: 'c', x, z, r: 2.8, dur: w + 1.0 + i * 0.15, fx: 'boulder', dmg, drop: 'boulder', flight: 1.0, sx: hx, sy: b.y + def.height * 1.05, sz: hz });
        });
        break;
      }
      case 'meteor': {
        const spots = [];
        for (const p of players.slice(0, 6)) {
          spots.push([p.x, p.z], [p.x + rnd(6), p.z + rnd(6)]);
        }
        for (let i = 0; i < (b.enraged ? 6 : 4); i++) spots.push(arenaSpot());
        spots.forEach(([x, z], i) => {
          const gy = groundY(x, z);
          list.push({ s: 'c', x, z, r: 2.6, dur: w + 0.7 + i * 0.12, fx: 'meteor', dmg, drop: 'meteor', flight: 0.7, sx: x + 9, sy: gy + 32, sz: z + 5 });
        });
        break;
      }
      case 'pools': {
        const spots = players.slice(0, 6).map((p) => [p.x, p.z]);
        while (spots.length < (b.enraged ? 4 : 3)) spots.push(arenaSpot());
        for (const [x, z] of spots) list.push({ s: 'c', x, z, r: 2.6, dur: w + 0.25, fx: 'pool', dmg: 0 });
        break;
      }
      case 'summon': {
        const alive = this.game.enemies.list.filter((e) => e.minion && !e.dead).length;
        const n = Math.max(0, Math.min(b.enraged ? 3 : 2, MAX_MINIONS - alive));
        for (let i = 0; i < n; i++) {
          const a = b.yaw + (i - (n - 1) / 2) * 1.1;
          list.push({ s: 'c', x: b.x + Math.sin(a) * (def.radius + 2.5), z: b.z + Math.cos(a) * (def.radius + 2.5), r: 1.4, dur: w + 0.3, fx: 'summon', dmg: 0 });
        }
        break;
      }
      default:
        break;
    }
    if (name === 'meteor' || name === 'summon') this.game.audio.play('roar', { volume: 0.6 });
    for (const t of list) this.addTelegraph(t, true);
  }

  /** Hazırlık bitti: vuruş anı. */
  strike() {
    const b = this.boss;
    b.state = 'strike';
    b.atkT = 0;
    b.t = 0;
    if (b.cur === 'burrow') {
      // toprağın altında hedefe doğru ilerler, altından çıkar
      const target = this.engagedPlayers().find((p) => p.id === b.targetId) ?? this.engagedPlayers()[0];
      const tx = target ? target.x : b.home.x;
      const tz = target ? target.z : b.home.z;
      b.state = 'burrow';
      b.burrowTo = { x: tx, z: tz };
      this.addTelegraph({ s: 'c', x: tx, z: tz, r: 3.4, dur: 1.4, fx: 'burrow', dmg: b.def.damage * DMG_MULT.burrow * (b.enraged ? 1.15 : 1) }, true);
      this.game.audio.play('whoosh', { volume: 0.7 });
    } else if (b.cur === 'sweep' || b.cur === 'tail') {
      this.game.audio.play('whoosh', { volume: 0.8 });
    }
  }

  // ── Uyarı halkaları ─────────────────────────────────────
  addTelegraph(data, broadcast = false) {
    const t = { ...data, t: 0 };
    const yaw = t.s === 'a' ? t.yaw : 0;
    const geo = t.s === 'a'
      ? new THREE.RingGeometry(0.2, t.r, 24, 5, -t.ang, t.ang * 2)
      : new THREE.RingGeometry(0.05, t.r, 40, 5);
    geo.rotateX(-Math.PI / 2);
    if (t.s === 'a') geo.rotateY(yaw - Math.PI / 2);
    const ter = this.world.terrain;
    const cy = ter.getHeight(t.x, t.z);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      pos.setY(i, ter.getHeight(t.x + lx, t.z + lz) - cy + 0.12);
    }
    const color = t.fx === 'summon' ? '#c58bff' : t.fx === 'pool' ? '#ff8a1f' : '#ff3b2f';
    const mat = new THREE.ShaderMaterial({
      vertexShader: DECAL_VERT, fragmentShader: DECAL_FRAG,
      uniforms: { uR: { value: t.r }, uK: { value: 0 }, uTime: { value: 0 }, uFade: { value: 1 }, uColor: { value: new THREE.Color(color) } },
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
    });
    t.mesh = new THREE.Mesh(geo, mat);
    t.mesh.position.set(t.x, cy, t.z);
    t.mesh.renderOrder = 3;
    this.group.add(t.mesh);
    if (t.drop) {
      t.dropMesh = new THREE.Mesh(t.drop === 'meteor' ? this.meteorGeo : this.boulderGeo, t.drop === 'meteor' ? this.meteorMat : this.boulderMat);
      t.dropMesh.visible = false;
      t.dropMesh.castShadow = true;
      this.group.add(t.dropMesh);
    }
    this.telegraphs.push(t);
    if (broadcast && this.game.net?.isHost) {
      const r = (v) => Math.round(v * 100) / 100;
      const { s, x, z, r: rad, yaw: ty, ang, dur, fx, drop, flight, sx, sy, sz } = t;
      this.game.net.broadcast({ t: 'bTel', d: { s, x: r(x), z: r(z), r: rad, yaw: ty, ang, dur, fx, drop, flight, sx, sy, sz }, from: this.game.net.selfId });
    }
    return t;
  }

  removeTelegraph(t) {
    this.group.remove(t.mesh);
    t.mesh.geometry.dispose();
    t.mesh.material.dispose();
    if (t.dropMesh) this.group.remove(t.dropMesh);
  }

  clearTelegraphs() {
    for (const t of this.telegraphs) this.removeTelegraph(t);
    this.telegraphs = [];
  }

  updateTelegraphs(dt) {
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const t = this.telegraphs[i];
      t.t += dt;
      const k = Math.min(1, t.t / t.dur);
      const u = t.mesh.material.uniforms;
      u.uK.value = k;
      u.uTime.value = this.time;
      if (t.dropMesh) {
        const f0 = t.dur - t.flight;
        const m = t.dropMesh;
        if (t.t >= f0) {
          const f = Math.min(1, (t.t - f0) / t.flight);
          const gy = this.world.terrain.getHeight(t.x, t.z);
          const arc = t.drop === 'boulder' ? Math.sin(f * Math.PI) * 7 : 0;
          const ff = t.drop === 'meteor' ? f * f : f;
          m.visible = true;
          m.position.set(t.sx + (t.x - t.sx) * ff, t.sy + (gy + 0.5 - t.sy) * ff + arc, t.sz + (t.z - t.sz) * ff);
          m.rotation.x += dt * 5;
          m.rotation.z += dt * 3;
          if (t.drop === 'meteor' && Math.random() < 0.5) this.world.particles.emit('fire', m.position.x, m.position.y, m.position.z, 0.25);
        }
      }
      if (t.t >= t.dur) {
        this.telegraphs.splice(i, 1);
        this.removeTelegraph(t);
        this.impact(t);
      }
    }
  }

  /** Halka doldu: görsel/ses etkisi (herkeste) + hasar (ev sahibinde). */
  impact(t) {
    const g = this.game;
    const w = this.world;
    const gy = w.terrain.getHeight(t.x, t.z);
    const p = g.player.position;
    const near = Math.hypot(p.x - t.x, p.z - t.z);
    const ring = (type, n, scale = 0.5) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = t.r * (0.4 + Math.random() * 0.6);
        w.particles.emit(type, t.x + Math.cos(a) * rr, gy + 0.3, t.z + Math.sin(a) * rr, scale);
      }
    };
    const vol = Math.max(0.15, 1 - near / 60);
    switch (t.fx) {
      case 'slam':
        ring(this.boss?.id === 'frost_giant' ? 'snow' : this.boss?.id === 'lava_golem' ? 'ash' : 'dust', 10, 0.6);
        g.audio.play('slam', { volume: vol });
        g.cameraController.shake(Math.max(0, 0.45 - near / 40));
        break;
      case 'sweep':
        ring('dust', 6, 0.4);
        break;
      case 'roots':
        this.spawnSpikes(t.x, gy, t.z, t.r);
        ring('wood', 4, 0.5);
        g.audio.play('slam', { volume: vol * 0.6 });
        break;
      case 'sting':
        ring('sand', 5, 0.5);
        g.audio.play('hiss', { volume: vol });
        break;
      case 'burrow':
        ring('sand', 12, 0.8);
        g.audio.play('slam', { volume: vol });
        g.cameraController.shake(Math.max(0, 0.5 - near / 35));
        break;
      case 'boulder':
        ring('ice', 8, 0.6);
        ring('snow', 4, 0.6);
        g.audio.play('slam', { volume: vol * 0.8 });
        g.audio.play('freeze', { volume: vol * 0.6 });
        g.cameraController.shake(Math.max(0, 0.3 - near / 40));
        break;
      case 'meteor':
        ring('fire', 6, 0.6);
        ring('ash', 4, 0.6);
        g.audio.play('slam', { volume: vol * 0.7, minGap: 0.08 });
        g.audio.play('fire', { volume: vol * 0.5, minGap: 0.1 });
        g.cameraController.shake(Math.max(0, 0.25 - near / 50));
        break;
      case 'pool':
        this.addPool(t.x, t.z, t.r);
        ring('fire', 5, 0.5);
        g.audio.play('fire', { volume: vol * 0.7, minGap: 0.1 });
        break;
      case 'summon':
        ring('magic', 6, 0.6);
        g.audio.play('chime', { volume: vol * 0.6, minGap: 0.1 });
        if (!this.remote && this.boss?.def.minion) {
          this.game.enemies.spawn(this.boss.def.minion, t.x, t.z, Math.random() * Math.PI * 2, { minion: true, home: this.boss.home });
        }
        break;
      default:
        break;
    }
    if (this.remote || !t.dmg || !this.boss) return;
    const fxDef = this.attackEffects(t.fx === 'sting' ? 'tail' : t.fx);
    for (const pl of this.game.enemies.players()) {
      const dx = pl.x - t.x;
      const dz = pl.z - t.z;
      const d = Math.hypot(dx, dz);
      if (d > t.r + 0.35) continue;
      if (t.s === 'a' && d > 1.2 && Math.abs(wrapAngle(Math.atan2(dx, dz) - t.yaw)) > t.ang + 0.12) continue;
      this.game.enemies.damagePlayer(pl.id, t.dmg, fxDef, t.x, t.z);
    }
  }

  spawnSpikes(x, y, z, r) {
    const grp = new THREE.Group();
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random();
      const rr = i === 0 ? 0 : r * randRange(Math.random, 0.3, 0.8);
      const m = new THREE.Mesh(this.spikeGeo, this.spikeMat);
      const px = x + Math.cos(a) * rr;
      const pz = z + Math.sin(a) * rr;
      m.position.set(px, this.world.terrain.getHeight(px, pz) - 0.2, pz);
      m.rotation.set(randRange(Math.random, -0.35, 0.35), Math.random() * 6, randRange(Math.random, -0.35, 0.35));
      m.scale.set(1, 0.01, 1);
      m.userData.h = randRange(Math.random, 0.8, 1.3);
      m.castShadow = true;
      grp.add(m);
    }
    this.group.add(grp);
    this.props.push({ obj: grp, t: 0, life: 1.4, type: 'spikes' });
  }

  addPool(x, z, r) {
    const geo = new THREE.CircleGeometry(r, 22);
    geo.rotateX(-Math.PI / 2);
    const ter = this.world.terrain;
    const cy = ter.getHeight(x, z);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, ter.getHeight(x + pos.getX(i), z + pos.getZ(i)) - cy + 0.1);
    const mesh = new THREE.Mesh(geo, this.poolMat);
    mesh.position.set(x, cy, z);
    mesh.renderOrder = 2;
    mesh.scale.setScalar(0.2);
    this.group.add(mesh);
    this.hazards.push({ x, z, r, life: POOL_LIFE, mesh });
  }

  updateProps(dt) {
    for (let i = this.props.length - 1; i >= 0; i--) {
      const pr = this.props[i];
      pr.t += dt;
      if (pr.type === 'spikes') {
        const up = Math.min(1, pr.t / 0.12);
        const down = pr.t > 0.8 ? Math.max(0, 1 - (pr.t - 0.8) / 0.6) : 1;
        for (const m of pr.obj.children) m.scale.y = Math.max(0.01, up * down * m.userData.h);
      }
      if (pr.t >= pr.life) {
        this.group.remove(pr.obj);
        this.props.splice(i, 1);
      }
    }
    // lav birikintileri
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const hz = this.hazards[i];
      hz.life -= dt;
      const grow = Math.min(1, (POOL_LIFE - hz.life) / 0.4);
      const shrink = Math.min(1, hz.life / 1.2);
      hz.mesh.scale.setScalar(Math.max(0.01, grow * shrink));
      if (Math.random() < dt * 3) this.world.particles.emit('fire', hz.x + randRange(Math.random, -hz.r, hz.r) * 0.6, this.world.terrain.getHeight(hz.x, hz.z) + 0.2, hz.z + randRange(Math.random, -hz.r, hz.r) * 0.6, 0.2);
      if (hz.life <= 0) {
        this.group.remove(hz.mesh);
        hz.mesh.geometry.dispose();
        this.hazards.splice(i, 1);
      }
    }
    this.poolMat.opacity = 0.75 + Math.sin(this.time * 4) * 0.12;
    // birikintinin içinde duran yanar (ev sahibi hesaplar)
    if (!this.remote && this.hazards.length) {
      this.poolTick -= dt;
      if (this.poolTick <= 0) {
        this.poolTick = 0.5;
        const def = BOSSES.lava_golem;
        for (const pl of this.game.enemies.players()) {
          if (this.hazards.some((hz) => Math.hypot(pl.x - hz.x, pl.z - hz.z) < hz.r * 0.9)) {
            this.game.enemies.damagePlayer(pl.id, def.damage * 0.12, { name: def.name, burn: true }, pl.x, pl.z);
          }
        }
      }
    }
  }

  // ── Yapay zekâ (ev sahibi) ──────────────────────────────
  updateAI(dt) {
    const b = this.boss;
    const def = b.def;
    const players = this.engagedPlayers();
    b.t += dt;
    b.gap -= dt;
    b.slow -= dt;
    if (b.burn > 0) {
      b.burn -= dt;
      b.burnTick -= dt;
      if (b.burnTick <= 0) {
        b.burnTick = 1;
        if (this.targetable) this.damageBoss(5);
        if (!this.boss || b.state === 'dead') return;
      }
    }

    // kimse kalmadıysa sunağa döner, bir süre sonra uykuya dalar
    if (!players.length) {
      b.resetT += dt;
      if (b.resetT > RESET_TIME && (b.state === 'chase' || b.state === 'recover')) {
        this.putToSleep();
        return;
      }
    } else b.resetT = 0;

    // hedef seçimi: mevcut hedef geçerliyse kalır, ara sıra başka oyuncuya döner
    b.retarget -= dt;
    let target = players.find((p) => p.id === b.targetId) ?? null;
    if (!target || b.retarget <= 0) {
      b.retarget = randRange(Math.random, 7, 11);
      let best = null;
      let bestD = Infinity;
      for (const p of players) {
        const d = Math.hypot(p.x - b.x, p.z - b.z) * (players.length > 1 ? randRange(Math.random, 0.7, 1.3) : 1);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      target = best;
      b.targetId = best?.id ?? null;
    }

    let targetSpeed = 0;
    let targetYaw = b.yaw;
    const speedMul = (b.enraged ? 1.25 : 1) * (b.slow > 0 ? 0.7 : 1);
    switch (b.state) {
      case 'rise':
        b.sub = 1 - easeOut(Math.min(1, b.t / RISE_TIME));
        if (Math.random() < dt * 8) this.world.particles.emit(RISE_FX[b.id] ?? 'dust', b.x + randRange(Math.random, -2, 2), b.y + 0.3, b.z + randRange(Math.random, -2, 2), 0.6);
        if (b.t >= RISE_TIME) {
          b.state = 'chase';
          b.sub = 0;
          b.gap = 1.2;
          b.t = 0;
        }
        break;
      case 'chase': {
        if (!target) {
          // sunağın yanına dön
          const dx = b.home.x - b.x;
          const dz = b.home.z - b.z;
          if (Math.hypot(dx, dz) > 4) {
            targetYaw = Math.atan2(dx, dz);
            targetSpeed = def.speed * 0.7;
          }
          b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.02 * dt);
          break;
        }
        const name = b.forceAttack ?? def.attacks[b.attackIdx % def.attacks.length];
        const A = ATTACKS[name];
        const dx = target.x - b.x;
        const dz = target.z - b.z;
        const d = Math.hypot(dx, dz);
        targetYaw = Math.atan2(dx, dz);
        const reach = A.reach + def.radius;
        const facing = Math.abs(wrapAngle(targetYaw - b.yaw)) < 0.5;
        if (d <= reach && b.gap <= 0 && (facing || A.reach > 10)) {
          b.forceAttack = null;
          this.startAttack(name, target, players);
          break;
        }
        if (d > reach * 0.8) targetSpeed = def.speed * speedMul;
        b.chaseT += dt;
        // yakın saldırı için oyuncuya uzun süre yetişemezse uzaktan saldırıya geçer
        if (b.chaseT > 6 && A.reach < 10) {
          b.attackIdx++;
          b.chaseT = 0;
        }
        break;
      }
      case 'windup': {
        const lock = b.cur === 'sweep' || b.cur === 'slam';
        if (!lock && target && b.t < b.windup * 0.7) targetYaw = Math.atan2(target.x - b.x, target.z - b.z);
        if (b.cur === 'burrow') b.sub = easeOut(Math.min(1, b.t / b.windup));
        if (b.t >= b.windup) this.strike();
        break;
      }
      case 'strike':
        b.atkT += dt / 0.5;
        if (b.atkT >= 1) {
          b.atkT = -1;
          b.state = 'recover';
          b.t = 0;
        }
        break;
      case 'recover':
        if (b.t >= ATTACKS[b.cur].recover * (b.enraged ? 0.75 : 1)) {
          b.state = 'chase';
          b.t = 0;
          b.gap = b.enraged ? 0.4 : 0.9;
        }
        break;
      case 'burrow': {
        b.sub = 1;
        const to = b.burrowTo;
        const dx = to.x - b.x;
        const dz = to.z - b.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.3) {
          const step = Math.min(d, 14 * dt);
          b.x += (dx / d) * step;
          b.z += (dz / d) * step;
          targetYaw = Math.atan2(dx, dz);
          if (Math.random() < dt * 14) this.world.particles.emit('sand', b.x, b.y + 0.2, b.z, 0.5);
        }
        if (!this.telegraphs.some((t) => t.fx === 'burrow')) {
          b.state = 'emerge';
          b.t = 0;
        }
        break;
      }
      case 'emerge':
        b.sub = Math.max(0, 1 - b.t / 0.6);
        if (b.t >= 0.6) {
          b.sub = 0;
          b.state = 'recover';
          b.t = 0;
        }
        break;
      default:
        break;
    }

    b.yaw = dampAngle(b.yaw, targetYaw, b.state === 'chase' ? 4 : 6, dt);
    b.speed = damp(b.speed, targetSpeed, 4, dt);
    if (b.speed > 0.01) {
      let nx = b.x + Math.sin(b.yaw) * b.speed * dt;
      let nz = b.z + Math.cos(b.yaw) * b.speed * dt;
      // arenadan çıkmaz
      const hx = nx - b.home.x;
      const hz = nz - b.home.z;
      const hd = Math.hypot(hx, hz);
      if (hd > ARENA_LEASH) {
        nx = b.home.x + (hx / hd) * ARENA_LEASH;
        nz = b.home.z + (hz / hd) * ARENA_LEASH;
      }
      if (this.world.terrain.getHeight(nx, nz) > 0.3) {
        this._v.set(nx, 0, nz);
        this.world.collision.resolveCircle(this._v, def.radius * 0.5, b.y);
        b.x = this._v.x;
        b.z = this._v.z;
      }
    }
  }

  // ── Ağ ──────────────────────────────────────────────────
  setRemote(on) {
    this.remote = on;
  }

  netState() {
    const b = this.boss;
    const r = (v) => Math.round(v * 100) / 100;
    const k = b.state === 'windup' ? b.t / b.windup : b.state === 'strike' ? b.atkT : 0;
    return {
      t: 'boss', id: b.id, x: r(b.x), z: r(b.z), yaw: r(b.yaw), hp: Math.round(b.hp), mhp: b.maxHp,
      st: STATES.indexOf(b.state), at: ATTACK_NAMES.indexOf(b.cur), k: r(k), sub: r(b.sub), en: b.enraged ? 1 : 0, sp: r(b.speed),
    };
  }

  /** Misafir: ev sahibinin boss durumu. */
  applyNet(msg) {
    if (!BOSSES[msg.id]) return;
    if (!this.boss || this.boss.id !== msg.id) {
      if (this.defeated.has(msg.id)) return;
      this.createBoss(msg.id, msg.x, msg.z, msg.yaw, msg.hp, msg.mhp, STATES[msg.st] ?? 'chase');
    }
    const b = this.boss;
    if (b.state === 'dead') return;
    b.net = { x: msg.x, z: msg.z, yaw: msg.yaw };
    const st = STATES[msg.st] ?? 'chase';
    if (st === 'windup' && b.state !== 'windup') b.t = 0;
    b.state = st;
    b.cur = ATTACK_NAMES[msg.at] ?? null;
    if (st === 'windup') b.windup = this.windupTime(b.cur ?? 'slam');
    if (st === 'windup') b.t = Math.max(b.t, msg.k * b.windup);
    if (st === 'strike') b.atkT = msg.k;
    b.hp = msg.hp;
    b.maxHp = msg.mhp;
    b.sub = msg.sub;
    b.speed = msg.sp ?? 0;
    b.enraged = !!msg.en;
  }

  applySpawn(msg) {
    if (!BOSSES[msg.id] || this.defeated.has(msg.id)) return;
    this.createBoss(msg.id, msg.x, msg.z, msg.yaw, msg.hp, msg.mhp, 'rise');
    this.onSpawnFx();
  }

  applyRemoteDead(msg) {
    if (!BOSSES[msg.id]) return;
    this.onDefeated(msg.id);
  }

  snapshot() {
    const b = this.boss;
    return {
      defeated: [...this.defeated],
      active: b && b.state !== 'dead' && b.state !== 'sleep' ? this.netState() : null,
    };
  }

  applySnapshot(s) {
    if (!s) return;
    this.defeated = new Set((s.defeated ?? []).filter((id) => BOSSES[id]));
    this.syncAltars();
    if (s.active) this.applyNet(s.active);
  }

  syncAltars() {
    for (const id of Object.keys(BOSSES)) {
      const altar = this.altarOf(id);
      if (!altar) continue;
      altar.glowState = this.defeated.has(id) ? 2 : this.boss?.id === id && this.boss.state !== 'dead' ? 1 : 0;
    }
  }

  followNet(dt) {
    const b = this.boss;
    const n = b.net;
    if (!n) return;
    const k = 1 - Math.exp(-8 * dt);
    if (Math.hypot(n.x - b.x, n.z - b.z) > 20) {
      b.x = n.x;
      b.z = n.z;
    } else {
      b.x += (n.x - b.x) * k;
      b.z += (n.z - b.z) * k;
    }
    b.yaw = dampAngle(b.yaw, n.yaw, 8, dt);
    b.t += dt;
    if (b.state === 'strike') b.atkT = Math.min(1, b.atkT + dt / 0.5);
  }

  // ── Kare ────────────────────────────────────────────────
  placeBoss(dt) {
    const b = this.boss;
    const ground = this.world.terrain.getHeight(b.x, b.z);
    b.y = dt ? damp(b.y, ground, 10, dt) : ground;
    b.phase += dt * (2 + b.speed * 1.4);
    b.hurt = Math.max(0, b.hurt - dt * 3);
    const m = b.model;
    m.root.position.set(b.x, b.y, b.z);
    m.root.rotation.y = b.yaw;
    const wind = b.state === 'windup' ? Math.min(1, b.t / Math.max(0.01, b.windup)) : 0;
    animateCreature(m, {
      t: this.time, speed: b.speed / Math.max(0.6, b.def.speed), phase: b.phase,
      windup: wind, attack: b.state === 'strike' ? Math.min(1, b.atkT) : -1,
      hurt: b.hurt, dead: b.state === 'dead', deathT: b.deathT, roll: 1, pose: ATTACKS[b.cur ?? 'slam']?.pose ?? 'slam',
    });
    if (b.sub > 0) m.root.position.y -= b.sub * b.def.height * 1.1;
  }

  update(dt) {
    const g = this.game;
    this.time += dt;
    this.updateTelegraphs(dt);
    this.updateProps(dt);
    const b = this.boss;
    if (!b) return;

    if (b.state === 'dead') {
      b.deathT += dt;
      if (b.deathT > 6) this.clearBoss();
      else this.placeBoss(dt);
      this.updateBar();
      return;
    }
    if (b.state === 'sleep') {
      b.t += dt;
      b.sub = Math.min(1, b.t / SLEEP_TIME);
      this.placeBoss(dt);
      if (b.t >= SLEEP_TIME) this.clearBoss();
      return;
    }
    if (this.remote) this.followNet(dt);
    else if (g.isSimulating) this.updateAI(dt);
    if (!this.boss) return;
    this.placeBoss(dt);

    // oyuncu boss'un içinden geçemez
    const p = g.player.position;
    if (b.sub < 0.5 && !g.player.ghost) {
      const dx = p.x - b.x;
      const dz = p.z - b.z;
      const d = Math.hypot(dx, dz);
      const min = b.def.radius + 0.35;
      if (d < min && d > 1e-3 && p.y < b.y + b.def.height) {
        p.x = b.x + (dx / d) * min;
        p.z = b.z + (dz / d) * min;
      }
    }

    if (g.net?.isHost) {
      this.netTimer -= dt;
      if (this.netTimer <= 0 && g.net.players.size) {
        this.netTimer = NET_INTERVAL;
        g.net.broadcast({ ...this.netState(), from: g.net.selfId });
      }
    }
    this.updateBar();
  }

  updateBar() {
    const b = this.boss;
    const g = this.game;
    const p = g.player.position;
    const show = b && b.state !== 'sleep' && Math.hypot(p.x - b.x, p.z - b.z) < BAR_RANGE && !g.world.inCave;
    if (!show) {
      if (this.barShown) {
        g.ui.hud.setBossBar(null);
        this.barShown = null;
      }
      return;
    }
    const info = { id: b.id, name: b.def.name, title: b.def.title, hp: b.hp, maxHp: b.maxHp, color: b.def.color, enraged: b.enraged, dead: b.state === 'dead' };
    const sig = `${info.id}|${Math.ceil(info.hp)}|${info.maxHp}|${info.enraged}|${info.dead}`;
    if (sig !== this.barShown) {
      this.barShown = sig;
      g.ui.hud.setBossBar(info);
    }
  }

  // ── Kayıt ───────────────────────────────────────────────
  serialize() {
    const b = this.boss;
    return { defeated: [...this.defeated], active: b && b.state !== 'dead' && b.state !== 'sleep' ? b.id : null };
  }

  deserialize(d) {
    if (!d) return;
    this.defeated = new Set((d.defeated ?? []).filter((id) => BOSSES[id]));
    this.syncAltars();
    // savaşın ortasında kaydedilip çıkıldıysa çağırma eşyası sunağın önünde bekler
    if (d.active && BOSSES[d.active] && !this.defeated.has(d.active)) {
      const altar = this.altarOf(d.active);
      const ip = altar?.interactPoint;
      if (ip) this.world.drops.spawn(ip.x, ip.z + 1, [{ id: BOSSES[d.active].summon, count: 1 }]);
    }
  }
}

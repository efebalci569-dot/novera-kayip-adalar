import * as THREE from 'three';
import { BUILDINGS } from '../data/buildings.js';
import { buildBuildingGeometry, sharedMaterials } from '../world/Models.js';
import { damp, clamp } from '../utils/math.js';

const MIN_DEPTH = 0.55; // bu sığlıktan sonra tekne karaya oturur
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/**
 * Su taşıtları (sal, tekne). Envanterdeki taşıt eşyası suya indirilince (BuildingSystem
 * önizlemesiyle) dünyada bir tekne oluşur. [E] ile binilir; W/S ileri-geri, A/D dönüş,
 * [E] ile en yakın kıyıya inilir. Tekneler dalgalarla birlikte yalpalar.
 */
export class VehicleSystem {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'vehicles';
    game.scene.add(this.group);
    game.world.registerSurfaceObject(this.group);
    this.boats = [];
    this.mounted = null;
    this.geos = {};
    this.time = 0;
    this.limitWarn = 0;
    this.bumpCooldown = 0;
    this.sailAccum = 0;
    this.wakeTimer = 0;
    this.strokeTimer = 0;
  }

  geometry(type) {
    return (this.geos[type] ??= buildBuildingGeometry(type));
  }

  /** Su yüzeyi (göl ya da deniz) ve dalga katsayısı. */
  surface(x, z) {
    const w = this.game.world;
    const lake = w.island.lake;
    if (Math.hypot(x - lake.x, z - lake.z) < lake.radius * 1.6) return { level: lake.level, wave: 0.18 };
    return { level: 0, wave: 1 };
  }

  depthAt(x, z) {
    const s = this.surface(x, z);
    return s.level - this.game.world.terrain.getHeight(x, z);
  }

  byUid(uid) {
    return this.boats.find((b) => b.uid === uid) ?? null;
  }

  spawn(type, x, z, yaw, uid = null) {
    const def = BUILDINGS[type];
    const mesh = new THREE.Mesh(this.geometry(type), sharedMaterials.standard);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    const b = { type, def, x, z, yaw, y: 0, speed: 0, mesh, roll: 0, pitch: 0 };
    b.uid = uid ?? `${this.game.net?.active ? this.game.net.selfId.slice(-5) : 'v'}${Date.now().toString(36)}${this.boats.length}`;
    b.riderId = null; // başka bir oyuncu sürüyorsa onun kimliği
    b.riderSeen = 0;
    b.target = null;
    b.interactable = this.game.world.addInteractable({
      kind: 'vehicle', x, y: 0.6, z, range: 3.8, pickRadius: 1.6, pickHeight: 1.2,
      getPrompt: () => (this.mounted ? null : { action: 'Bin', name: def.name }),
      interact: () => this.board(b),
    });
    this.boats.push(b);
    this.updateBoat(b, 0);
    return b;
  }

  /** Başka bir oyuncu bu tekneyi sürüyor mu? */
  riddenByOther(b) {
    return !!b.riderId && performance.now() - b.riderSeen < 1500;
  }

  /** Çok oyunculu: başka bir oyuncunun suya indirdiği tekne. */
  applyRemoteSpawn(msg) {
    if (!BUILDINGS[msg.type]?.vehicle || this.byUid(msg.uid)) return;
    this.spawn(msg.type, msg.x, msg.z, msg.yaw ?? 0, msg.uid);
  }

  /** Çok oyunculu: başka bir oyuncunun sürdüğü teknenin konumu. m = [uid, x, z, yaw, speed] */
  applyRemoteMount(riderId, m) {
    const b = this.byUid(m[0]);
    if (!b || b === this.mounted) return;
    b.riderId = riderId;
    b.riderSeen = performance.now();
    b.target = { x: m[1], z: m[2], yaw: m[3] };
    b.speed = m[4] ?? 0;
  }

  board(b) {
    const g = this.game;
    const p = g.player;
    if (this.mounted) return;
    if (this.riddenByOther(b)) {
      g.notify(`${b.def.icon} Bu teknede başka biri var.`, 'warn');
      return;
    }
    p.cancelAction();
    this.mounted = b;
    p.mounted = b;
    p.swimming = false;
    p.velocity.set(0, 0, 0);
    b.speed = 0;
    this.placePlayer(b);
    p.refreshHeld();
    g.audio.play('splash', { volume: 0.5 });
    const s = g.settings.bindings;
    const k = (a) => (s[a]?.[0] ?? '').replace('Key', '');
    g.notify(`${b.def.icon} ${b.def.name}: ${k('forward')}/${k('backward')} ileri-geri · ${k('left')}/${k('right')} dön · ${k('interact')} kıyıya in`, 'info');
    g.bus.emit('vehicle:boarded', { type: b.type });
  }

  /** En yakın kıyıya iner; kıyı yoksa teknenin yanından suya atlar. */
  dismount() {
    const g = this.game;
    const b = this.mounted;
    if (!b) return;
    const ter = g.world.terrain;
    let best = null;
    let bestD = Infinity;
    for (let r = 2.2; r <= 7.5 && !best; r += 0.9) {
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        const x = b.x + Math.cos(a) * r;
        const z = b.z + Math.sin(a) * r;
        const h = ter.getHeight(x, z);
        if (h < 0.3 || ter.getSlope(x, z) > 0.9) continue;
        if (g.world.island.isInLake(x, z) && h < g.world.island.lake.level + 0.2) continue;
        if (g.world.collision.overlapsCircle(x, z, g.player.radius + 0.1)) continue;
        if (r < bestD) {
          bestD = r;
          best = { x, z, y: g.world.getGroundHeight(x, z, h + 1) };
        }
      }
    }
    const p = g.player;
    this.mounted = null;
    p.mounted = null;
    if (best) {
      p.teleport(best.x, best.y, best.z);
      g.notify('Karaya çıktın.', 'info');
    } else {
      const side = Math.cos(b.yaw);
      const sideZ = -Math.sin(b.yaw);
      p.teleport(b.x + side * 1.9, b.y - 0.5, b.z + sideZ * 1.9);
      g.audio.play('splash');
      g.notify('Suya atladın. Kıyıya yakınken inersen ıslanmazsın.', 'info');
    }
    p.refreshHeld();
    b.speed = 0;
    g.requestSave();
  }

  placePlayer(b) {
    const p = this.game.player;
    const s = b.def.seat;
    const c = Math.cos(b.yaw);
    const sn = Math.sin(b.yaw);
    p.position.set(b.x + s.z * sn, b.y + s.y - 0.88, b.z + s.z * c); // kalça oturağın üstünde
    p.yaw = b.yaw;
    p.grounded = true;
    p.speed = Math.abs(b.speed);
  }

  /** Teknenin dalgalarla yalpalaması ve görsel konumu. */
  updateBoat(b, dt) {
    const w = this.game.world.water;
    const s = this.surface(b.x, b.z);
    const t = w.time;
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    const half = b.type === 'boat' ? 2.2 : 1.5;
    const h0 = w.waveHeight(b.x, b.z, t) * s.wave;
    const hf = w.waveHeight(b.x + fx * half, b.z + fz * half, t) * s.wave;
    const hb = w.waveHeight(b.x - fx * half, b.z - fz * half, t) * s.wave;
    const hr = w.waveHeight(b.x + fz * 1, b.z - fx * 1, t) * s.wave;
    const hl = w.waveHeight(b.x - fz * 1, b.z + fx * 1, t) * s.wave;
    const targetPitch = Math.atan2(hb - hf, half * 2) - b.speed * 0.012;
    const targetRoll = Math.atan2(hr - hl, 2) * 0.9;
    b.pitch = dt ? damp(b.pitch, targetPitch, 4, dt) : targetPitch;
    b.roll = dt ? damp(b.roll, targetRoll, 4, dt) : targetRoll;
    b.y = s.level + h0 * 0.85 - b.def.deck * 0.3;
    b.mesh.position.set(b.x, b.y, b.z);
    _e.set(b.pitch, b.yaw, b.roll, 'YXZ');
    _q.setFromEuler(_e);
    b.mesh.quaternion.copy(_q);
    const it = b.interactable;
    it.x = b.x;
    it.y = b.y + 0.6;
    it.z = b.z;
  }

  steer(b, dt, inputEnabled) {
    const g = this.game;
    const input = g.input;
    const def = b.def;
    let throttle = 0;
    let turn = 0;
    if (inputEnabled) {
      if (input.isDown('forward')) throttle += 1;
      if (input.isDown('backward')) throttle -= 0.5;
      if (input.isDown('left')) turn += 1;
      if (input.isDown('right')) turn -= 1;
    }
    const boost = inputEnabled && input.isDown('run') && throttle > 0 && g.player.stats.canRun ? 1.3 : 1;
    if (boost > 1) g.player.stats.stamina = Math.max(0, g.player.stats.stamina - 6 * dt);
    b.speed = damp(b.speed, throttle * def.speed * boost, throttle ? 0.9 : 0.6, dt);
    const steerK = 0.35 + 0.65 * clamp(Math.abs(b.speed) / def.speed, 0, 1);
    b.yaw += turn * def.turn * steerK * dt * (b.speed < -0.05 ? -1 : 1);

    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    const nx = b.x + fx * b.speed * dt;
    const nz = b.z + fz * b.speed * dt;
    const halfLen = b.type === 'boat' ? 2.4 : 1.7;
    const dir = b.speed >= 0 ? 1 : -1;
    const bowX = nx + fx * halfLen * dir;
    const bowZ = nz + fz * halfLen * dir;
    this.bumpCooldown -= dt;
    if (this.depthAt(bowX, bowZ) < MIN_DEPTH || this.depthAt(nx, nz) < MIN_DEPTH) {
      if (Math.abs(b.speed) > 0.8 && this.bumpCooldown <= 0) {
        this.bumpCooldown = 1;
        g.audio.play('build', { volume: 0.35 });
        g.cameraController.impact(0.06);
        g.notify('Sığlık! Burada karaya oturursun — kıyıya inmek için [E].', 'warn');
      }
      b.speed *= -0.15;
    } else {
      const moved = Math.hypot(nx - b.x, nz - b.z);
      b.x = nx;
      b.z = nz;
      // enkaz gibi engeller
      const pos = { x: b.x, z: b.z };
      g.world.collision.resolveCircle(pos, b.type === 'boat' ? 1.1 : 1.0, 0);
      b.x = pos.x;
      b.z = pos.z;
      this.sailAccum += moved;
      if (this.sailAccum >= 1) {
        g.bus.emit('boat:moved', { distance: this.sailAccum });
        g.state.stats.distanceSailed = (g.state.stats.distanceSailed ?? 0) + this.sailAccum;
        this.sailAccum = 0;
      }
    }

    // açık deniz sınırı (2. ada için rota henüz yok)
    const r = Math.hypot(b.x, b.z);
    this.limitWarn -= dt;
    if (r > def.range) {
      b.x *= def.range / r;
      b.z *= def.range / r;
      b.speed *= 0.4;
      if (this.limitWarn <= 0) {
        this.limitWarn = 7;
        g.notify(b.type === 'raft'
          ? '🌊 Dalgalar sal için fazla sert. Açığa çıkmak için bir tekneye ihtiyacın var.'
          : '⛈️ Ufuktaki adalara giden rota fırtınalı… Yeni adalara yolculuk yakında!', 'warn');
      }
    }

    // iz, kürek halkaları ve burun köpüğü
    const sp = Math.abs(b.speed);
    this.wakeTimer -= dt;
    if (sp > 0.6 && this.wakeTimer <= 0) {
      this.wakeTimer = 0.28;
      const s = this.surface(b.x, b.z);
      g.world.ripples.emit(b.x - fx * halfLen, s.level, b.z - fz * halfLen, 1.0 + sp * 0.25, 1.4, 0.35);
      if (sp > 2.5) g.world.particles.emit('water', b.x + fx * halfLen, s.level + 0.2, b.z + fz * halfLen, 0.35);
    }
    if (b.type === 'raft' && sp > 0.4) {
      this.strokeTimer -= dt;
      if (this.strokeTimer <= 0) {
        this.strokeTimer = 1.1;
        g.audio.play('paddle', { volume: 0.5 });
        const side = Math.cos(b.yaw);
        const s = this.surface(b.x, b.z);
        g.world.ripples.emit(b.x + side * 1.1, s.level, b.z - Math.sin(b.yaw) * 1.1, 0.9, 1.0, 0.4);
      }
    }
  }

  update(dt, inputEnabled) {
    this.time += dt;
    for (const b of this.boats) {
      if (b === this.mounted) this.steer(b, dt, inputEnabled);
      else if (b.target && this.riddenByOther(b)) {
        // başka bir oyuncu sürüyor: ağdan gelen konuma yumuşakça git
        const k = 1 - Math.exp(-10 * dt);
        b.x += (b.target.x - b.x) * k;
        b.z += (b.target.z - b.z) * k;
        let dy = b.target.yaw - b.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        b.yaw += dy * k;
      }
      this.updateBoat(b, dt);
    }
    if (this.mounted) this.placePlayer(this.mounted);
  }

  serialize() {
    return {
      boats: this.boats.map((b) => ({ uid: b.uid, type: b.type, x: +b.x.toFixed(2), z: +b.z.toFixed(2), yaw: +b.yaw.toFixed(3) })),
      mounted: this.mounted ? this.boats.indexOf(this.mounted) : -1,
    };
  }

  deserialize(d) {
    for (const b of d?.boats ?? []) {
      if (BUILDINGS[b.type]?.vehicle && !(b.uid && this.byUid(b.uid))) this.spawn(b.type, b.x, b.z, b.yaw ?? 0, b.uid ?? null);
    }
    const m = this.boats[d?.mounted ?? -1];
    if (m) this.board(m);
  }
}

import { damp, dampAngle } from '../utils/math.js';

const WALK_SPEED = 4.6;
const RUN_SPEED = 7.6;
const SWIM_SPEED = 2.9;
const JUMP_VELOCITY = 7.2;
const GRAVITY = 22;
const JUMP_STAMINA = 8;
const SWIM_DEPTH = 1.25; // bu derinlikten sonra yüzülür
const GHOST_LIMIT = 1500; // izleyici okyanusun sonuna kadar uçabilir
const SAFE_FALL = 4.5; // bu yükseklikten (m) sonrası can yakar
const FALL_DAMAGE_PER_M = 7; // ~18 m düşüş ölümcül
const GHOST_SPEED = 9;

/** Klavye girdisini kamera yönüne göre harekete çevirir; yerçekimi, zıplama, yüzme ve çarpışma. */
export class PlayerController {
  constructor(game, player) {
    this.game = game;
    this.player = player;
    this.distanceAccum = 0;
    this.stepTimer = 0;
    this.fallPeak = null;
    this.strokeTimer = 0;
  }

  /** Yere iniş: yeterince yüksekten düşüldüyse can yakar. */
  onLand(fall) {
    const { game } = this;
    if (fall > 1.2) game.audio.play('step', { volume: 2 });
    game.cameraController.impact(Math.min(0.35, fall * 0.035));
    if (fall <= SAFE_FALL) return;
    const dmg = (fall - SAFE_FALL) * FALL_DAMAGE_PER_M;
    game.player.stats.damage(dmg, 'fall');
    game.cameraController.impact(0.4);
    if (!game.player.stats.dead) game.notify(`Yüksekten düştün! (−${Math.round(dmg)} ❤️)`, 'warn');
  }

  /** İzleyici (hayalet): çarpışmasız serbest uçuş, bakılan yöne doğru. */
  updateGhost(dt, inputEnabled) {
    const { game, player } = this;
    const input = game.input;
    const cam = game.cameraController;
    let f = 0;
    let s = 0;
    let u = 0;
    if (inputEnabled) {
      if (input.isDown('forward')) f += 1;
      if (input.isDown('backward')) f -= 1;
      if (input.isDown('right')) s += 1;
      if (input.isDown('left')) s -= 1;
      if (input.isDown('jump')) u += 1;
      f += input.axis.y;
      s += input.axis.x;
    }
    const cp = Math.cos(cam.lookPitch);
    const fx = -Math.sin(cam.yaw) * cp, fy = Math.sin(cam.lookPitch), fz = -Math.cos(cam.yaw) * cp;
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    const speed = GHOST_SPEED * (inputEnabled && input.isDown('run') ? 2.6 : 1);
    const v = player.velocity;
    v.x = damp(v.x, (fx * f + rx * s) * speed, 6, dt);
    v.y = damp(v.y, (fy * f + u) * speed, 6, dt);
    v.z = damp(v.z, (fz * f + rz * s) * speed, 6, dt);
    const pos = player.position;
    pos.addScaledVector(v, dt);
    const r = Math.hypot(pos.x, pos.z);
    if (r > GHOST_LIMIT) {
      pos.x *= GHOST_LIMIT / r;
      pos.z *= GHOST_LIMIT / r;
    }
    const floor = game.world.getGroundHeight(pos.x, pos.z, pos.y) - 1.2;
    pos.y = Math.min(160, Math.max(pos.y, floor, 0.2 - 1.2));
    player.swimming = false;
    player.wading = false;
    player.grounded = false;
    player.running = false;
    player.speed = Math.hypot(v.x, v.z);
    player.yaw = cam.yaw + Math.PI;
    this.fallPeak = null;
  }

  update(dt, inputEnabled) {
    const { game, player } = this;
    if (player.ghost) {
      this.updateGhost(dt, inputEnabled);
      return;
    }
    const input = game.input;
    const world = game.world;
    const stats = player.stats;
    const yaw = game.cameraController.yaw;
    if (player.teleported) {
      player.teleported = false;
      this.fallPeak = null;
    }
    // teknedeyken konumu VehicleSystem belirler
    if (player.mounted) {
      player.swimming = false;
      player.wading = false;
      player.grounded = true;
      player.running = false;
      player.velocity.set(0, 0, 0);
      this.fallPeak = null;
      return;
    }

    let mx = 0;
    let mz = 0;
    const busy = player.action && player.action.type !== 'swing' && player.action.type !== 'build';
    if (inputEnabled && !busy) {
      if (input.isDown('forward')) mz += 1;
      if (input.isDown('backward')) mz -= 1;
      if (input.isDown('right')) mx += 1;
      if (input.isDown('left')) mx -= 1;
      mx += input.axis.x; // dokunmatik joystick
      mz += input.axis.y;
    }
    const len = Math.hypot(mx, mz);
    // joystick az itilince yavaş yürür (klavyede her zaman tam hız)
    const analog = len > 0 ? Math.max(0.3, Math.min(1, len)) : 1;
    let dirX = 0;
    let dirZ = 0;
    if (len > 0) {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      dirX = (fx * mz + rx * mx) / len;
      dirZ = (fz * mz + rz * mx) / len;
    }

    const wantsRun = inputEnabled && input.isDown('run') && len > 0 && mz >= 0;
    player.running = wantsRun && stats.canRun && !player.swimming && player.grounded;
    const perkRun = 1 + game.progression.bonus('runSpeed');
    let speed = player.running ? RUN_SPEED * perkRun : WALK_SPEED;
    if (player.swimming) speed = SWIM_SPEED;
    else if (player.wading) speed *= 0.8;
    if (player.action) speed *= 0.45;
    speed *= stats.speedMultiplier * analog;

    const accel = player.grounded || player.swimming ? 12 : 3.5;
    player.velocity.x = damp(player.velocity.x, dirX * speed, accel, dt);
    player.velocity.z = damp(player.velocity.z, dirZ * speed, accel, dt);

    const pos = player.position;
    const prevX = pos.x;
    const prevZ = pos.z;
    let nx = pos.x + player.velocity.x * dt;
    let nz = pos.z + player.velocity.z * dt;

    // çok dik yamaçlara tırmanmayı engelle (yalnızca arazi; basamak/platformlar serbest)
    if (player.grounded && !player.swimming) {
      const step = Math.hypot(nx - pos.x, nz - pos.z);
      if (step > 1e-4) {
        const ng = world.getHeight(nx, nz);
        if ((ng - world.getHeight(pos.x, pos.z)) / step > 1.6 && ng > pos.y + 0.3) {
          nx = pos.x;
          nz = pos.z;
          player.velocity.x *= 0.2;
          player.velocity.z *= 0.2;
        }
      }
    }
    pos.x = nx;
    pos.z = nz;
    world.collision.resolveCircle(pos, player.radius, pos.y, world.collisionLayer);
    if (world.inCave) world.cave.constrain(pos, player.radius);
    else game.animals?.pushPlayer(pos, player.radius);

    // açık deniz sınırı: yüzerek en yakın adanın kıyısından çok uzaklaşılamaz
    if (!world.inCave) game.navigation.limitSwimmer(pos);

    // dikey hareket
    const ground = world.getGroundHeight(pos.x, pos.z, pos.y);
    const surface = world.waterSurfaceAt(pos.x, pos.z);
    const depth = surface !== null ? surface - ground : 0;
    const wasSwimming = player.swimming;
    player.swimming = depth > SWIM_DEPTH;
    player.wading = !player.swimming && depth > 0.35;

    if (player.swimming) {
      this.fallPeak = null; // suya düşmek can yakmaz
      const target = surface - 0.55;
      pos.y = damp(pos.y, target, 6, dt);
      player.velocity.y = 0;
      player.grounded = false;
      if (!wasSwimming) {
        game.audio.play('splash');
        world.particles.emit('water', pos.x, surface, pos.z, 1.5);
        world.ripples.emit(pos.x, surface, pos.z, 2.2, 1.4, 0.5);
      }
      // kulaç halkaları ve sıçramalar (kol hareketleriyle aynı ritimde)
      const moving = Math.hypot(player.velocity.x, player.velocity.z) > 0.6;
      this.strokeTimer -= dt;
      if (this.strokeTimer <= 0) {
        this.strokeTimer = moving ? 0.5 : 1.5;
        const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
        if (moving) {
          const side = player.model.strokeSide ?? 1;
          const sx = Math.cos(player.yaw) * side * 0.35;
          const sz = -Math.sin(player.yaw) * side * 0.35;
          world.ripples.emit(pos.x + fx * 0.9 + sx, surface, pos.z + fz * 0.9 + sz, 1.1, 1.0, 0.4);
          world.particles.emit('water', pos.x + fx * 0.9 + sx, surface + 0.05, pos.z + fz * 0.9 + sz, 0.35);
          game.audio.play('swim', { volume: 0.45 });
        } else {
          world.ripples.emit(pos.x, surface, pos.z, 1.5, 1.8, 0.3);
        }
      }
    } else {
      if (inputEnabled && input.wasPressed('jump') && player.grounded && !player.action) {
        if (stats.useStamina(JUMP_STAMINA)) {
          player.velocity.y = JUMP_VELOCITY;
          player.grounded = false;
        }
      }
      player.velocity.y -= GRAVITY * dt;
      pos.y += player.velocity.y * dt;
      if (!player.grounded) this.fallPeak = Math.max(this.fallPeak ?? pos.y, pos.y);
      if (pos.y <= ground) {
        if (!player.grounded) this.onLand(this.fallPeak !== null ? this.fallPeak - ground : 0);
        pos.y = ground;
        player.velocity.y = 0;
        player.grounded = true;
      } else if (player.grounded && player.velocity.y <= 0 && pos.y - ground < 0.45) {
        // yokuş aşağı inerken zemine yapış
        pos.y = ground;
        player.velocity.y = 0;
      } else {
        player.grounded = false;
      }
      if (wasSwimming) player.grounded = true;
      if (player.grounded) this.fallPeak = null;
    }

    // yön
    const moved = Math.hypot(pos.x - prevX, pos.z - prevZ);
    player.speed = dt > 0 ? moved / dt : 0;
    if (game.cameraController.firstPerson) {
      // 1. şahısta karakter her zaman bakılan yöne döner (model +Z'ye bakar)
      player.yaw = yaw + Math.PI;
    } else if (len > 0 && !player.action) {
      player.yaw = dampAngle(player.yaw, Math.atan2(dirX, dirZ), 12, dt);
    }

    // mesafe takibi (görevler için)
    if (moved > 0 && moved < 2) {
      this.distanceAccum += moved;
      game.state.stats.distanceWalked += moved;
      if (this.distanceAccum >= 1) {
        game.bus.emit('player:moved', { distance: this.distanceAccum });
        this.distanceAccum = 0;
      }
    }

    // adım ve su sesleri
    if ((player.grounded || player.swimming) && player.speed > 1) {
      this.stepTimer -= dt * player.speed * (player.swimming ? 0.25 : 0.55);
      if (this.stepTimer <= 0) {
        this.stepTimer = 1;
        if (player.swimming || player.wading) game.audio.play('splash', { volume: 0.25 });
        else game.audio.play(ground < 2.6 ? 'stepSand' : 'step');
      }
    }
  }
}

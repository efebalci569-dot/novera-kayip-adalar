import * as THREE from 'three';
import { clamp, damp } from '../utils/math.js';

const MIN_PITCH = -0.45;
const MAX_PITCH = 1.25;
const FP_PITCH_LIMIT = 1.5;
const EYE_HEIGHT = 1.62;

/**
 * Oyun kamerası. İki mod:
 *   first → gözden bakış (varsayılan): baş sallanması, iniş sarsıntısı
 *   third → omuz arkası: fareyle döner, tekerlekle yakınlaşır, araziye/yapılara girmez
 * Her iki modda yatay yön (yaw) ortaktır; hareket bu yöne göre hesaplanır.
 */
export class CameraController {
  constructor(camera, game) {
    this.camera = camera;
    this.game = game;
    this.mode = game.settings.cameraMode === 'third' ? 'third' : 'first';
    this.yaw = 0;
    this.pitch = 0.32; // 3. şahıs: kameranın yüksekliği (pozitif = yukarıdan bakar)
    this.lookPitch = 0; // 1. şahıs: pozitif = yukarı bakar
    this.distance = 6;
    this.currentDistance = 6;
    this.target = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.dir = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.orbitAngle = 0;
    this.landDip = 0;
    this.eyeY = null;
  }

  get firstPerson() {
    return this.mode === 'first';
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    // bakış yönünü modlar arasında koru
    if (mode === 'first') this.lookPitch = clamp(-this.pitch * 0.8, -FP_PITCH_LIMIT, FP_PITCH_LIMIT);
    else this.pitch = clamp(-this.lookPitch + 0.25, MIN_PITCH, MAX_PITCH);
    this.applyMode();
  }

  /** Mod değişince kamera yakın düzlemi ve oyuncu modelinin görünürlüğü. */
  applyMode() {
    this.camera.near = this.firstPerson ? 0.05 : 0.1;
    this.camera.updateProjectionMatrix();
    this.eyeY = null;
    this.game.player.model.setFirstPerson(this.firstPerson);
  }

  /** Kameranın yatay ileri yönü (hareket için). */
  forward(out) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /** Bir düşüşten sonra kısa bir "iniş" sarsıntısı. */
  impact(strength) {
    this.landDip = Math.max(this.landDip, Math.min(0.4, strength));
  }

  update(dt, player, inputEnabled) {
    const { input, settings } = this.game;
    const sens = 0.0022 * settings.sensitivity;
    const invert = settings.invertY ? -1 : 1;
    if (inputEnabled && (input.mouseDX || input.mouseDY)) {
      this.yaw -= input.mouseDX * sens;
      if (this.firstPerson) this.lookPitch = clamp(this.lookPitch - input.mouseDY * sens * invert, -FP_PITCH_LIMIT, FP_PITCH_LIMIT);
      else this.pitch = clamp(this.pitch + input.mouseDY * sens * invert, MIN_PITCH, MAX_PITCH);
    }
    this.landDip = damp(this.landDip, 0, 6, dt);
    if (this.firstPerson) this.updateFirstPerson(dt, player);
    else this.updateThirdPerson(dt, player, inputEnabled);
  }

  updateFirstPerson(dt, player) {
    const { settings } = this.game;
    const p = player.position;
    const cam = this.camera;
    const bob = settings.headBob ? clamp(player.speed / 5, 0, 1.3) * (player.grounded ? 1 : 0) : 0;
    const phase = player.model.walkPhase;
    // yüzerken baş su yüzeyinde dalgayla iner kalkar
    const swimBob = player.swimming ? Math.sin(this.game.time.elapsed * 1.8) * 0.07 : 0;
    const targetEye = p.y + (player.swimming ? 0.78 + swimBob : EYE_HEIGHT);
    // merdiven/eğim adımlarında göz yüksekliği yumuşakça izlesin
    const snap = this.eyeY === null || Math.abs(targetEye - this.eyeY) > 1.5 || player.mounted; // ışınlanma/doğma/tekne
    this.eyeY = snap ? targetEye : damp(this.eyeY, targetEye, 18, dt);
    const sideX = Math.cos(this.yaw);
    const sideZ = -Math.sin(this.yaw);
    const sway = Math.sin(phase) * 0.03 * bob;
    cam.position.set(
      p.x + sideX * sway,
      this.eyeY + (Math.abs(Math.sin(phase)) - 0.5) * 0.06 * bob - this.landDip,
      p.z + sideZ * sway,
    );
    let roll = Math.sin(phase) * 0.006 * bob;
    if (player.swimming) roll += Math.sin(this.game.time.elapsed * 1.1) * 0.025;
    if (player.mounted) roll += player.mounted.roll * 0.6;
    cam.rotation.set(this.lookPitch, this.yaw, roll, 'YXZ');
    this.target.copy(cam.position);
  }

  updateThirdPerson(dt, player, inputEnabled) {
    const { input, world } = this.game;
    if (inputEnabled && input.wheel) {
      this.distance = clamp(this.distance + input.wheel * 0.7, 2.2, 11);
    }

    const p = player.position;
    const headY = player.swimming ? 1.0 : player.mounted ? 1.35 : 1.55;
    this.target.x = p.x;
    this.target.z = p.z;
    this.target.y = damp(this.target.y || p.y + headY, p.y + headY, 14, dt) - this.landDip;

    const cp = Math.cos(this.pitch);
    this.dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);

    // arazi çarpışması: ışın boyunca örnekle
    let dist = this.distance;
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      const d = (dist * i) / steps;
      const x = this.target.x + this.dir.x * d;
      const y = this.target.y + this.dir.y * d;
      const z = this.target.z + this.dir.z * d;
      if (y < world.getHeight(x, z) + 0.35) {
        dist = Math.max(0.9, d - dist / steps);
        break;
      }
    }

    // yapı/önemli nokta çarpışması
    if (world.cameraBlockers.length) {
      this.raycaster.set(this.target, this.dir);
      this.raycaster.far = dist;
      const hit = this.raycaster.intersectObjects(world.cameraBlockers, false)[0];
      if (hit) dist = Math.max(0.7, hit.distance - 0.3);
    }

    this.currentDistance = dist < this.currentDistance ? dist : damp(this.currentDistance, dist, 4, dt);

    const cam = this.camera;
    cam.position.copy(this.target).addScaledVector(this.dir, this.currentDistance);
    const minY = world.getHeight(cam.position.x, cam.position.z) + 0.3;
    if (cam.position.y < minY) cam.position.y = minY;
    const surface = world.waterSurfaceAt(cam.position.x, cam.position.z);
    if (surface !== null && cam.position.y < surface + 0.3) cam.position.y = surface + 0.3;
    this.tmp.set(this.target.x, this.target.y + 0.25, this.target.z);
    cam.lookAt(this.tmp);
  }

  /** Ana menüde adanın etrafında yavaşça dönen sinematik kamera. */
  updateMenu(dt) {
    this.orbitAngle += dt * 0.035;
    const r = 265;
    const cam = this.camera;
    cam.position.set(Math.cos(this.orbitAngle) * r, 85, Math.sin(this.orbitAngle) * r);
    cam.lookAt(0, 22, -15);
  }

  serialize() {
    return { yaw: this.yaw, pitch: this.pitch, lookPitch: this.lookPitch, distance: this.distance };
  }

  deserialize(d) {
    if (!d) return;
    this.yaw = d.yaw ?? 0;
    this.pitch = d.pitch ?? 0.32;
    this.lookPitch = d.lookPitch ?? 0;
    this.distance = d.distance ?? 6;
  }
}

import * as THREE from 'three';
import { ISLANDS } from '../data/islands.js';
import { Island, WATER_LEVEL } from './Island.js';
import { Terrain } from './Terrain.js';
import { Water } from './Water.js';
import { DayNightCycle } from './DayNightCycle.js';
import { CollisionWorld } from './Collision.js';
import { ResourceManager } from './ResourceManager.js';
import { Landmarks } from './Landmarks.js';
import { DecorScatter } from './DecorScatter.js';
import { GrassField } from './GrassField.js';
import { Clouds } from './Clouds.js';
import { Ambience } from './Ambience.js';
import { DistantIslands } from './DistantIslands.js';
import { Particles } from './Particles.js';
import { LightPool } from './LightPool.js';
import { ItemDrops } from './ItemDrops.js';
import { Cave } from './Cave.js';
import { Ripples } from './Ripples.js';
import { sharedMaterials, windUniforms } from './Models.js';

/**
 * Dünyayı oluşturan tüm parçaları bir araya getirir: ada, arazi, su, gökyüzü,
 * kaynaklar, önemli noktalar, süslemeler, mağara ve atmosfer.
 */
export class WorldManager {
  constructor(game, islandId = 'novera') {
    this.game = game;
    const scene = game.scene;

    this.island = new Island(ISLANDS[islandId]);
    this.terrain = new Terrain(this.island);
    scene.add(this.terrain.mesh);

    this.water = new Water(this.terrain, this.island);
    scene.add(this.water.group);

    this.dayNight = new DayNightCycle(scene);
    // ağaçların kamera-oyuncu arasında şeffaflaşması için (bkz. createOccluderFadeMaterial)
    this.occlusion = { uCamPos: { value: new THREE.Vector3() }, uFocus: { value: new THREE.Vector3() }, uNear: { value: 1 } };
    this.collision = new CollisionWorld();
    this.interactables = new Set();
    this.particles = new Particles(scene);
    this.ripples = new Ripples(scene);
    this.lights = new LightPool(scene, 3);

    // dağın altındaki mağara (yüzeyden ayrı, kapalı alan)
    this.inCave = false;
    this.cave = this.island.def.cave ? new Cave(this, this.island.def.cave) : null;
    if (this.cave) scene.add(this.cave.group);

    this.landmarks = new Landmarks(this);
    scene.add(this.landmarks.group);

    const spawn = this.island.spawn;
    const exclusions = [...this.landmarks.exclusionZones(), { x: spawn.x, z: spawn.z, r: 4 }];
    this.resources = new ResourceManager(this);
    this.resources.generate(exclusions);
    scene.add(this.resources.group);
    if (this.cave) this.cave.group.add(this.resources.caveGroup);

    // büyük kayalar başlangıç sahilini kapatmasın
    this.decor = new DecorScatter(this, [...exclusions, { x: spawn.x, z: spawn.z, r: 16 }]);
    scene.add(this.decor.group);

    this.grass = new GrassField(this);
    scene.add(this.grass.group);

    this.clouds = new Clouds(scene);

    this.ambience = new Ambience(this);
    scene.add(this.ambience.group);

    this.distant = new DistantIslands(scene);

    this.drops = new ItemDrops(this);
    scene.add(this.drops.group);

    this.buildingsGroup = new THREE.Group();
    this.buildingsGroup.name = 'buildings';
    scene.add(this.buildingsGroup);

    // Kamera çarpışması için engel listesi (yapılar, önemli noktalar)
    this.cameraBlockers = this.landmarks.group.children.filter((c) => c.isMesh && c.material === sharedMaterials.standard);

    // mağaradayken gizlenen yüzey nesneleri (hayvanlar, tekneler… kendilerini ekler)
    this.surfaceObjects = [
      this.terrain.mesh, this.water.group, this.resources.group, this.decor.group, this.grass.group,
      this.ambience.group, this.distant.group, this.buildingsGroup, this.landmarks.group,
      this.dayNight.sky, this.dayNight.stars, ...this.clouds.meshes,
    ];
  }

  get spawnPoint() {
    const s = this.island.spawn;
    return { x: s.x, y: this.terrain.getHeight(s.x, s.z), z: s.z };
  }

  registerSurfaceObject(obj) {
    this.surfaceObjects.push(obj);
    obj.visible = !this.inCave;
  }

  /** Mağara moduna geç / çık: yüzey gizlenir, ışık ve sis mağaraya göre ayarlanır. */
  setCaveMode(on) {
    if (!this.cave || this.inCave === on) return;
    this.inCave = on;
    for (const o of this.surfaceObjects) o.visible = !on;
    this.cave.group.visible = on;
    this.dayNight.setCaveMode(on);
    for (const m of this.cave.blockers) {
      if (on) this.addCameraBlocker(m);
      else this.removeCameraBlocker(m);
    }
  }

  getHeight(x, z) {
    if (this.inCave) return this.cave.floorHeight(x, z);
    return this.terrain.getHeight(x, z);
  }

  /** Arazi + üzerine çıkılabilen platformlar (kulübe tabanı). Mağarada mağara tabanı. */
  getGroundHeight(x, z, currentY = Infinity) {
    if (this.inCave) return this.cave.floorHeight(x, z);
    const h = this.terrain.getHeight(x, z);
    const p = this.collision.platformHeight(x, z, currentY + 0.65);
    return Math.max(h, p);
  }

  /** (x,z) noktasında su yüzeyi yüksekliği; su yoksa null. */
  waterSurfaceAt(x, z) {
    if (this.inCave) return null;
    const lake = this.island.lake;
    if (Math.hypot(x - lake.x, z - lake.z) < lake.radius * 1.6) {
      return this.terrain.getHeight(x, z) < lake.level ? lake.level : null;
    }
    return this.terrain.getHeight(x, z) < WATER_LEVEL ? WATER_LEVEL : null;
  }

  isFreshWaterNear(x, z, margin = 2.2) {
    if (this.inCave) return false;
    const lake = this.island.lake;
    const d = Math.hypot(x - lake.x, z - lake.z);
    return d < lake.radius * 1.35 + margin;
  }

  /** Çarpışma katmanı: mağarada 'cave', yüzeyde 'surface'. */
  get collisionLayer() {
    return this.inCave ? 'cave' : 'surface';
  }

  addInteractable(obj) {
    this.interactables.add(obj);
    return obj;
  }

  removeInteractable(obj) {
    this.interactables.delete(obj);
  }

  addCameraBlocker(mesh) {
    if (!this.cameraBlockers.includes(mesh)) this.cameraBlockers.push(mesh);
  }

  removeCameraBlocker(mesh) {
    const i = this.cameraBlockers.indexOf(mesh);
    if (i >= 0) this.cameraBlockers.splice(i, 1);
  }

  update(dt, ctx) {
    const { hour, focus, camera, elapsed } = ctx;
    windUniforms.uWindTime.value += dt;
    this.occlusion.uCamPos.value.copy(camera.position);
    // 3. şahısta: kamera–oyuncu arası + kameraya çok yakın yapraklar şeffaflaşır; 1. şahısta kapalı
    if (ctx.occlusionFocus) this.occlusion.uFocus.value.copy(ctx.occlusionFocus);
    else this.occlusion.uFocus.value.copy(camera.position);
    this.occlusion.uNear.value = ctx.occlusionFocus ? 1 : 0;
    this.dayNight.update(hour, focus, camera.position);
    const env = this.dayNight.env;
    this.resources.update(dt, elapsed, focus, camera.position);
    this.landmarks.update(dt);
    this.particles.update(dt);
    this.ripples.update(dt);
    this.drops.update(dt);
    if (this.inCave) {
      this.cave.update(dt);
      this.lights.update(dt, focus, 1);
      return;
    }
    this.water.update(dt, env);
    this.decor.update(camera.position);
    this.grass.update(dt, focus);
    this.clouds.update(dt, env);
    this.ambience.update(dt, focus, env, this.game);
    this.distant.update(dt, env, this.game.scene.fog.color);
    this.lights.update(dt, focus, env.nightFactor);
  }
}

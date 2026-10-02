import * as THREE from 'three';
import { ISLANDS, ISLAND_ORDER } from '../data/islands.js';
import { Island, WATER_LEVEL } from './Island.js';
import { Terrain, TerrainSet } from './Terrain.js';
import { Water } from './Water.js';
import { Lava } from './Lava.js';
import { DayNightCycle } from './DayNightCycle.js';
import { CollisionWorld } from './Collision.js';
import { ResourceManager } from './ResourceManager.js';
import { Landmarks } from './Landmarks.js';
import { DecorScatter } from './DecorScatter.js';
import { GrassField } from './GrassField.js';
import { Clouds } from './Clouds.js';
import { Ambience } from './Ambience.js';
import { DistantIslands } from './DistantIslands.js';
import { Weather } from './Weather.js';
import { Particles } from './Particles.js';
import { LightPool } from './LightPool.js';
import { ItemDrops } from './ItemDrops.js';
import { Cave } from './Cave.js';
import { Ripples } from './Ripples.js';
import { sharedMaterials, windUniforms } from './Models.js';

// Bir adanın nesneleri bu mesafeden uzaktayken hiç çizilmez (sis zaten gizler)
const ISLAND_DRAW_RANGE = 560;

/**
 * Dünyayı oluşturan tüm parçaları bir araya getirir: takımadanın adaları, araziler, deniz,
 * gökyüzü, kaynaklar, önemli noktalar, süslemeler, mağara ve atmosfer.
 * Adalar dünyada gerçek konumlarındadır; aralarında tekneyle yelken açılır.
 */
export class WorldManager {
  constructor(game) {
    this.game = game;
    const scene = game.scene;

    this.islands = ISLAND_ORDER.map((id) => new Island(ISLANDS[id]));
    this.islandById = Object.fromEntries(this.islands.map((i) => [i.id, i]));
    this.island = this.islandById.novera; // başlangıç adası (eski kod bunu kullanır)
    this.terrains = this.islands.map((isl) => new Terrain(isl));
    this.terrainById = Object.fromEntries(this.terrains.map((t) => [t.island.id, t]));
    this.terrain = new TerrainSet(this.terrains);
    // her adanın kendi çizim grubu (uzaktaki adalar tamamen gizlenir)
    this.islandGroups = {};
    for (const t of this.terrains) {
      const g = new THREE.Group();
      g.name = `island:${t.island.id}`;
      g.add(t.mesh);
      scene.add(g);
      this.islandGroups[t.island.id] = g;
    }
    this.activeIsland = this.island;

    this.water = new Water(this);
    scene.add(this.water.group);

    this.dayNight = new DayNightCycle(scene);
    // ağaçların kamera-oyuncu arasında şeffaflaşması için (bkz. createOccluderFadeMaterial)
    this.occlusion = { uCamPos: { value: new THREE.Vector3() }, uFocus: { value: new THREE.Vector3() }, uNear: { value: 1 } };
    this.collision = new CollisionWorld();
    this.interactables = new Set();
    this.particles = new Particles(scene);
    this.ripples = new Ripples(scene);
    this.lights = new LightPool(scene, 3);

    this.lava = new Lava(this);
    this.islandGroups.volcano?.add(this.lava.group);

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

    // büyük kayalar başlangıç sahillerini kapatmasın
    const arrivals = this.islands.map((i) => ({ x: i.spawn.x, z: i.spawn.z, r: 16 }));
    this.decor = new DecorScatter(this, [...exclusions, ...arrivals, ...this.landmarks.arenaZones()]);
    scene.add(this.decor.group);

    this.grass = new GrassField(this);
    scene.add(this.grass.group);

    this.clouds = new Clouds(scene);

    this.ambience = new Ambience(this);
    scene.add(this.ambience.group);

    this.weather = new Weather(scene);

    this.distant = new DistantIslands(scene, this);

    this.drops = new ItemDrops(this);
    scene.add(this.drops.group);

    this.buildingsGroup = new THREE.Group();
    this.buildingsGroup.name = 'buildings';
    scene.add(this.buildingsGroup);

    // Kamera çarpışması için engel listesi (yapılar, önemli noktalar)
    this.cameraBlockers = this.landmarks.group.children.filter((c) => c.isMesh && c.material === sharedMaterials.standard);

    // mağaradayken gizlenen yüzey nesneleri (hayvanlar, tekneler… kendilerini ekler)
    this.surfaceObjects = [
      ...Object.values(this.islandGroups), this.water.group, this.resources.group, this.decor.group, this.grass.group,
      this.ambience.group, this.distant.group, this.buildingsGroup, this.landmarks.group, this.weather.group,
      this.dayNight.sky, this.dayNight.stars, ...this.clouds.meshes,
    ];
  }

  get spawnPoint() {
    const s = this.island.spawn;
    return { x: s.x, y: this.terrain.getHeight(s.x, s.z), z: s.z };
  }

  /** Bir adanın varış sahili (tekneyle gelince ya da ışınlanınca). */
  arrivalPoint(islandId) {
    const isl = this.islandById[islandId] ?? this.island;
    const s = isl.spawn;
    return { x: s.x, y: this.terrain.getHeight(s.x, s.z), z: s.z };
  }

  /** (x,z) hangi adanın arazisinin üzerinde? (açık denizde null) */
  islandAt(x, z) {
    return this.terrain.at(x, z)?.island ?? null;
  }

  /** (x,z) noktasına en yakın ada (açık denizde de bir ada döner). */
  nearestIsland(x, z) {
    let best = this.islands[0];
    let bestD = Infinity;
    for (const isl of this.islands) {
      const d = isl.distanceTo(x, z) - isl.radius;
      if (d < bestD) {
        bestD = d;
        best = isl;
      }
    }
    return best;
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
    this.islandVisKey = null;
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

  /** (x,z) noktasında su yüzeyi yüksekliği; su yoksa null. Donmuş göl ve lav su sayılmaz. */
  waterSurfaceAt(x, z) {
    if (this.inCave) return null;
    const isl = this.islandAt(x, z);
    const lake = isl?.lake;
    if (lake && !lake.frozen && Math.hypot(x - lake.x, z - lake.z) < lake.radius * 1.6) {
      return this.terrain.getHeight(x, z) < lake.level ? lake.level : null;
    }
    return this.terrain.getHeight(x, z) < WATER_LEVEL ? WATER_LEVEL : null;
  }

  /** İçilebilir tatlı su (göl, vaha, donmuş gölün kırılan buzu). */
  freshWaterAt(x, z, margin = 2.2) {
    if (this.inCave) return null;
    const lake = this.islandAt(x, z)?.lake;
    if (!lake) return null;
    const d = Math.hypot(x - lake.x, z - lake.z);
    return d < lake.radius * (lake.frozen ? 1.15 : 1.35) + margin ? lake : null;
  }

  isFreshWaterNear(x, z, margin = 2.2) {
    return !!this.freshWaterAt(x, z, margin);
  }

  /** Lavın içinde mi? */
  isLava(x, z, margin = 0) {
    if (this.inCave) return false;
    const isl = this.islandAt(x, z);
    return !!isl && isl.isLava(x, z, margin);
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

  /** Uzaktaki adaların arazisini, kaynaklarını ve süslerini gizler. */
  updateIslandVisibility(cam) {
    let key = '';
    for (const isl of this.islands) key += isl.distanceTo(cam.x, cam.z) - isl.radius < ISLAND_DRAW_RANGE ? '1' : '0';
    if (key === this.islandVisKey) return;
    this.islandVisKey = key;
    this.islands.forEach((isl, i) => {
      const vis = key[i] === '1' && !this.inCave;
      this.islandGroups[isl.id].visible = vis;
      this.resources.setIslandVisible(isl.id, vis);
      this.decor.setIslandVisible(isl.id, vis);
    });
  }

  update(dt, ctx) {
    const { hour, focus, camera, elapsed } = ctx;
    windUniforms.uWindTime.value += dt;
    this.occlusion.uCamPos.value.copy(camera.position);
    // 3. şahısta: kamera–oyuncu arası + kameraya çok yakın yapraklar şeffaflaşır; 1. şahısta kapalı
    if (ctx.occlusionFocus) this.occlusion.uFocus.value.copy(ctx.occlusionFocus);
    else this.occlusion.uFocus.value.copy(camera.position);
    this.occlusion.uNear.value = ctx.occlusionFocus ? 1 : 0;
    this.activeIsland = this.islandAt(focus.x, focus.z) ?? this.nearestIsland(focus.x, focus.z);
    this.dayNight.setBiome(this.biomeBlend(focus));
    this.dayNight.update(hour, focus, camera.position);
    const env = this.dayNight.env;
    this.resources.update(dt, elapsed, focus, camera.position);
    this.landmarks.update(dt);
    this.particles.update(dt);
    this.ripples.update(dt);
    this.drops.update(dt);
    this.lava.update(dt);
    if (this.inCave) {
      this.cave.update(dt);
      this.lights.update(dt, focus, 1);
      return;
    }
    this.updateIslandVisibility(camera.position);
    this.water.update(dt, env, camera.position);
    this.decor.update(camera.position);
    this.grass.update(dt, focus);
    this.clouds.update(dt, env, camera.position);
    this.ambience.update(dt, focus, env, this.game);
    this.weather.update(dt, camera.position, this.biomeBlend(focus), env);
    this.distant.update(dt, env, this.game.scene.fog.color, camera.position);
    this.lights.update(dt, focus, env.nightFactor);
  }

  /** Oyuncunun bulunduğu adanın biyomu ve ne kadar içinde olduğu (sis/hava rengi geçişi için). */
  biomeBlend(p) {
    const isl = this.nearestIsland(p.x, p.z);
    const d = isl.distanceTo(p.x, p.z);
    const k = 1 - Math.min(1, Math.max(0, (d - isl.radius) / 220));
    return { biome: isl.biome, k };
  }
}

import * as THREE from 'three';
import { buildDecorGeometries } from './Models.js';
import { mulberry32, randRange } from '../utils/math.js';

const COUNT = 26;
const EXTENT = 720;
const WIND = 2.6; // m/s, +x yönünde

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** Gökyüzünde yavaşça süzülen düşük poligonlu bulutlar. Güneşle birlikte renk değiştirir. */
export class Clouds {
  constructor(scene) {
    const geos = buildDecorGeometries('cloud', 3);
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false, emissive: '#ffffff', emissiveIntensity: 0.2 });
    this.meshes = geos.map((g) => {
      const m = new THREE.InstancedMesh(g, this.material, COUNT);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
      return m;
    });
    const rng = mulberry32(99);
    this.clouds = [];
    for (let i = 0; i < COUNT; i++) {
      const mesh = this.meshes[i % this.meshes.length];
      this.clouds.push({
        mesh, index: mesh.count++,
        x: randRange(rng, -EXTENT, EXTENT), z: randRange(rng, -EXTENT, EXTENT), y: randRange(rng, 135, 230),
        yaw: rng() * Math.PI * 2, scale: randRange(rng, 0.8, 1.7), speed: randRange(rng, 0.7, 1.3),
      });
    }
  }

  update(dt, env, cam = null) {
    this.material.emissiveIntensity = 0.08 + env.lightLevel * 0.22;
    const ox = cam?.x ?? 0;
    const oz = cam?.z ?? 0;
    for (const c of this.clouds) {
      c.x += WIND * c.speed * dt;
      // bulutlar kameranın çevresinde döner (uzak adalarda da gökyüzü dolu)
      if (c.x - ox > EXTENT) c.x -= EXTENT * 2;
      else if (c.x - ox < -EXTENT) c.x += EXTENT * 2;
      if (c.z - oz > EXTENT) c.z -= EXTENT * 2;
      else if (c.z - oz < -EXTENT) c.z += EXTENT * 2;
      _q.setFromAxisAngle(_up, c.yaw);
      _m.compose(_p.set(c.x, c.y, c.z), _q, _s.set(c.scale, c.scale, c.scale));
      c.mesh.setMatrixAt(c.index, _m);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}

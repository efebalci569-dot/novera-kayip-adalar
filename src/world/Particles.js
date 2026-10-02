import * as THREE from 'three';

const PRESETS = {
  wood: { colors: ['#8a6440', '#b48a5a', '#6b4c30'], count: 9, speed: 3.2, size: 0.06, life: 0.9, gravity: 12 },
  stone: { colors: ['#9a958b', '#7d786f', '#b8b3a8'], count: 9, speed: 3.6, size: 0.055, life: 0.8, gravity: 14 },
  leaf: { colors: ['#6aa84f', '#9cc65a', '#4c8a3c'], count: 7, speed: 2.2, size: 0.08, life: 1.1, gravity: 4 },
  water: { colors: ['#e6f7ff', '#9fe0f0', '#ffffff'], count: 10, speed: 3.0, size: 0.07, life: 0.7, gravity: 11 },
  dust: { colors: ['#d8c9a3', '#c2b48a', '#e6dcc0'], count: 18, speed: 2.4, size: 0.14, life: 1.0, gravity: 1.5 },
  spark: { colors: ['#ffd27a', '#ff9a3d', '#fff1b8'], count: 10, speed: 2.5, size: 0.06, life: 0.9, gravity: -1.5 },
  magic: { colors: ['#7ff3ff', '#b6fbff', '#5fd0ff'], count: 26, speed: 2.0, size: 0.08, life: 1.6, gravity: -1.2 },
  pine: { colors: ['#2e6b3c', '#3c7d48', '#24572f'], count: 7, speed: 1.6, size: 0.06, life: 1.6, gravity: 2.5 },
  coal: { colors: ['#1e1e22', '#3a3a40', '#55555c'], count: 9, speed: 3.4, size: 0.06, life: 0.8, gravity: 14 },
  iron: { colors: ['#b0612c', '#8a4a26', '#7d786f'], count: 9, speed: 3.4, size: 0.06, life: 0.8, gravity: 14 },
  feather: { colors: ['#ffffff', '#f3efe4', '#e6dfd0'], count: 10, speed: 2.2, size: 0.07, life: 2.2, gravity: 1.2 },
  wool: { colors: ['#f4f0e6', '#e8e1d2', '#ffffff'], count: 9, speed: 1.8, size: 0.11, life: 1.6, gravity: 2.5 },
  hit: { colors: ['#e6d8c4', '#cdbba2', '#f0e6d6'], count: 8, speed: 2.4, size: 0.08, life: 0.7, gravity: 6 },
  sand: { colors: ['#e2b47a', '#d9a86c', '#f0d6a0'], count: 10, speed: 3.0, size: 0.06, life: 0.8, gravity: 12 },
  ice: { colors: ['#cdeeff', '#ffffff', '#9fd8ff'], count: 11, speed: 3.4, size: 0.06, life: 0.9, gravity: 12 },
  snow: { colors: ['#ffffff', '#eef6fb', '#dbe9f4'], count: 9, speed: 1.6, size: 0.07, life: 1.6, gravity: 2.2 },
  ash: { colors: ['#6d6863', '#3a3534', '#8f8a86'], count: 9, speed: 1.8, size: 0.07, life: 1.6, gravity: 2.0 },
  obsidian: { colors: ['#1c1726', '#4b3a66', '#2a2236'], count: 10, speed: 3.6, size: 0.06, life: 0.8, gravity: 14 },
  sulfur: { colors: ['#e8d23a', '#f2e05a', '#c9b23a'], count: 9, speed: 3.0, size: 0.06, life: 0.8, gravity: 12 },
  fire: { colors: ['#ffb347', '#ff6a1f', '#ffd27a'], count: 14, speed: 2.8, size: 0.09, life: 0.8, gravity: -2.5 },
  chitin: { colors: ['#4a3a2e', '#6a4f38', '#2e231b'], count: 10, speed: 3.0, size: 0.07, life: 0.8, gravity: 11 },
  frost: { colors: ['#bfeaff', '#ffffff', '#7fdcff'], count: 16, speed: 2.6, size: 0.08, life: 1.0, gravity: 3 },
  blood: { colors: ['#8a2a2a', '#a33a2e', '#6e1f1f'], count: 8, speed: 2.4, size: 0.06, life: 0.7, gravity: 10 },
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Havuzlanmış küçük küp parçacıklar (talaş, taş kırıntısı, su sıçraması…). Tek çizim çağrısı. */
export class Particles {
  constructor(scene, capacity = 400) {
    this.capacity = capacity;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'particles';
    this.particles = [];
    for (let i = 0; i < capacity; i++) {
      this.particles.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 0.1, rot: 0, gravity: 10 });
      this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
      this.mesh.setColorAt(i, _c.set('#ffffff'));
    }
    this.cursor = 0;
    this.activeCount = 0;
    scene.add(this.mesh);
  }

  emit(type, x, y, z, countScale = 1) {
    const p = PRESETS[type] ?? PRESETS.dust;
    const count = Math.round(p.count * countScale);
    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      const pt = this.particles[idx];
      if (!pt.alive) this.activeCount++;
      const a = Math.random() * Math.PI * 2;
      const sp = p.speed * (0.4 + Math.random() * 0.8);
      pt.alive = true;
      pt.x = x + (Math.random() - 0.5) * 0.3;
      pt.y = y + (Math.random() - 0.5) * 0.3;
      pt.z = z + (Math.random() - 0.5) * 0.3;
      pt.vx = Math.cos(a) * sp * 0.6;
      pt.vz = Math.sin(a) * sp * 0.6;
      pt.vy = sp * (0.6 + Math.random() * 0.6);
      pt.life = pt.maxLife = p.life * (0.7 + Math.random() * 0.6);
      pt.size = p.size * (0.7 + Math.random() * 0.6);
      pt.rot = Math.random() * 6;
      pt.gravity = p.gravity;
      this.mesh.setColorAt(idx, _c.set(p.colors[i % p.colors.length]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    if (this.activeCount <= 0) return;
    let alive = 0;
    for (let i = 0; i < this.capacity; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
        continue;
      }
      alive++;
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += dt * 6;
      const s = p.size * Math.min(1, (p.life / p.maxLife) * 2);
      _e.set(p.rot, p.rot * 0.7, 0);
      _q.setFromEuler(_e);
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(s, s, s));
      this.mesh.setMatrixAt(i, _m);
    }
    this.activeCount = alive;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

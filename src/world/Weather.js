import * as THREE from 'three';

// Biyoma özgü hava: buz adasında kar, volkanda kül ve kıvılcım, çölde savrulan kum.
// Kameranın çevresindeki bir kutuda dönen nokta parçacıklar (tek çizim çağrısı).

const COUNT = 900;
const BOX = 46;

const STYLES = {
  ice: { color: '#ffffff', size: 0.16, fall: 1.4, drift: 0.9, opacity: 0.9 },
  volcano: { color: '#8f8a86', size: 0.12, fall: 0.6, drift: 0.5, opacity: 0.75, embers: true },
  desert: { color: '#e8cf9a', size: 0.07, fall: 0.05, drift: 6.0, opacity: 0.5 },
};

const wrap = (v, m) => ((v % m) + m) % m;

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.7)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export class Weather {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'weather';
    this.pos = new Float32Array(COUNT * 3);
    this.col = new Float32Array(COUNT * 3);
    this.seed = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * BOX * 2;
      this.pos[i * 3 + 1] = Math.random() * BOX;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * BOX * 2;
      this.seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.material = new THREE.PointsMaterial({
      size: 0.15, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, opacity: 0,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.group.add(this.points);
    scene.add(this.group);
    this.time = 0;
    this.style = null;
    this.amount = 0;
    this._c = new THREE.Color();
    this._ember = new THREE.Color('#ff7a2a');
  }

  update(dt, cam, blend, env) {
    this.time += dt;
    const style = STYLES[blend.biome];
    const target = style ? blend.k : 0;
    this.amount += (target - this.amount) * Math.min(1, dt * 1.5);
    if (style && style !== this.style) this.style = style;
    const st = this.style;
    this.group.visible = this.amount > 0.02 && !!st;
    if (!this.group.visible) return;
    this.material.size = st.size;
    this.material.opacity = st.opacity * this.amount * (0.45 + env.lightLevel * 0.55);
    const base = this._c.set(st.color);
    const p = this.pos;
    const wind = Math.sin(this.time * 0.3) * st.drift;
    for (let i = 0; i < COUNT; i++) {
      const s = this.seed[i];
      let x = p[i * 3] + (wind + Math.sin(this.time * 1.3 + s * 40) * 0.4) * dt;
      let y = p[i * 3 + 1] - st.fall * (0.6 + s * 0.8) * dt;
      let z = p[i * 3 + 2] + Math.cos(this.time * 1.1 + s * 30) * 0.3 * dt + st.drift * 0.3 * dt;
      // dünya uzayında dururlar; kameranın çevresindeki kutudan çıkanlar karşı taraftan girer
      const lo = cam.y - BOX * 0.35;
      y = lo + wrap(y - lo, BOX);
      x = cam.x - BOX + wrap(x - cam.x + BOX, BOX * 2);
      z = cam.z - BOX + wrap(z - cam.z + BOX, BOX * 2);
      p[i * 3] = x;
      p[i * 3 + 1] = y;
      p[i * 3 + 2] = z;
      const ember = st.embers && s > 0.86;
      const c = ember ? this._ember : base;
      const glow = ember ? 0.7 + 0.3 * Math.sin(this.time * 6 + s * 50) : 1;
      this.col[i * 3] = c.r * glow;
      this.col[i * 3 + 1] = c.g * glow;
      this.col[i * 3 + 2] = c.b * glow;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

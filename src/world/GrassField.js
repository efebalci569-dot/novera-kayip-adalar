import * as THREE from 'three';
import { mulberry32, smoothstep } from '../utils/math.js';

const _base = new THREE.Color('#2c5a20');
const _mid = new THREE.Color('#5c9a38');
const _tip = new THREE.Color('#b2d66a');

/** Tek bir çimen öbeği: hafif kavisli, sivri uçlu 7 yaprak. Normaller yukarı → zemin gibi aydınlanır. */
function clumpGeometry(blades = 9, seed = 7) {
  const rng = mulberry32(seed);
  const pos = [];
  const col = [];
  const nor = [];
  const add = (v, c) => {
    pos.push(v[0], v[1], v[2]);
    col.push(c.r, c.g, c.b);
    nor.push(0, 1, 0);
  };
  for (let b = 0; b < blades; b++) {
    const yaw = rng() * Math.PI * 2;
    const off = rng() * 0.2;
    const ox = Math.cos(yaw + 1.3) * off;
    const oz = Math.sin(yaw + 1.3) * off;
    const h = 0.5 + rng() * 0.45;
    const w = 0.022 + rng() * 0.016;
    const bend = 0.12 + rng() * 0.22;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    // yerel (yaprak) uzay: x = genişlik, z = öne doğru eğrilik
    const P = (lx, ly, lz) => [ox + lx * c - lz * s, ly, oz + lx * s + lz * c];
    const v0 = P(-w, 0, 0), v1 = P(w, 0, 0);
    const v2 = P(-w * 0.65, h * 0.55, bend * 0.35), v3 = P(w * 0.65, h * 0.55, bend * 0.35);
    const v4 = P(0, h, bend);
    add(v0, _base); add(v1, _base); add(v2, _mid);
    add(v1, _base); add(v3, _mid); add(v2, _mid);
    add(v2, _mid); add(v3, _mid); add(v4, _tip);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function flowerGeometry() {
  const parts = [];
  const stem = new THREE.CylinderGeometry(0.012, 0.014, 0.42, 3).toNonIndexed();
  stem.translate(0, 0.21, 0);
  const petals = new THREE.OctahedronGeometry(0.08, 0).toNonIndexed();
  petals.scale(1, 0.4, 1);
  petals.translate(0, 0.43, 0);
  const center = new THREE.OctahedronGeometry(0.03, 0).toNonIndexed();
  center.translate(0, 0.46, 0);
  const paint = (g, color) => {
    const c = new THREE.Color(color);
    const arr = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.deleteAttribute('uv');
    return g;
  };
  parts.push(paint(stem, '#3f7a2c'), paint(petals, '#ffffff'), paint(center, '#ffe066'));
  const pos = [];
  const col = [];
  for (const p of parts) {
    pos.push(...p.attributes.position.array);
    col.push(...p.attributes.color.array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

const vertexPatch = /* glsl */ `
  vec4 gWorld = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    gWorld = instanceMatrix * gWorld;
    vec3 gBase = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #else
    vec3 gBase = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #endif
  gWorld = modelMatrix * gWorld;
  // görüş alanının kenarında çimen yavaşça zemine iner (ani belirme olmasın)
  float gFade = 1.0 - smoothstep(uRadius * 0.78, uRadius, distance(gBase.xz, uCenter));
  gWorld.xyz = gBase + (gWorld.xyz - gBase) * gFade;
  float gH = max(gWorld.y - gBase.y, 0.0);
  // rüzgâr
  float gWind = sin(uTime * 1.5 + gBase.x * 0.28 + gBase.z * 0.2) * 0.6 + sin(uTime * 2.9 + gBase.x * 0.9 - gBase.z * 0.6) * 0.25;
  gWorld.x += gWind * 0.22 * gH * gH;
  gWorld.z += gWind * 0.1 * gH * gH;
  // oyuncu yürürken çimen kenara eğilir
  vec2 gAway = gBase.xz - uPlayer.xz;
  float gPd = length(gAway);
  float gPush = (1.0 - smoothstep(0.25, 1.2, gPd)) * gH * step(abs(uPlayer.y - gBase.y), 1.5);
  gWorld.xz += (gAway / max(gPd, 0.001)) * gPush * 0.6;
  gWorld.y -= gPush * 0.35;
  vec4 mvPosition = viewMatrix * gWorld;
  gl_Position = projectionMatrix * mvPosition;
`;

/**
 * Oyuncunun etrafında sık, rüzgârda dalgalanan çimen alanı. Dünya ızgara hücrelerine
 * bölünür; her hücrenin çimeni tohumla üretildiği için geri dönünce aynı görünür.
 * Oyuncu hücre değiştirdikçe örnekler yeniden yerleştirilir (sadece yakın çevre çizilir).
 */
export class GrassField {
  constructor(world, { radius = 48, cellSize = 6 } = {}) {
    this.world = world;
    this.radius = radius;
    this.cellSize = cellSize;
    this.cellsR = Math.ceil(radius / cellSize);
    this.density = 1.1; // m² başına öbek (kaliteyle değişir)
    this.exclusions = [];
    this.centerKey = null;
    this.uniforms = {
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector2() },
      uRadius: { value: radius },
      uPlayer: { value: new THREE.Vector3(0, -999, 0) },
    };
    this.buildDensityMap();

    const cellsInRange = Math.PI * this.cellsR * this.cellsR * 1.15;
    this.maxClumps = Math.ceil(cellsInRange * cellSize * cellSize * 1.7);
    this.maxFlowers = 900;

    this.grass = new THREE.InstancedMesh(clumpGeometry(), this.material(true), this.maxClumps);
    this.flowers = new THREE.InstancedMesh(flowerGeometry(), this.material(false), this.maxFlowers);
    for (const m of [this.grass, this.flowers]) {
      m.frustumCulled = false;
      m.count = 0;
      m.receiveShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(m.instanceMatrix.count * 3), 3);
    }
    this.group = new THREE.Group();
    this.group.name = 'grass';
    this.group.add(this.grass, this.flowers);
  }

  material(doubleSided) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: doubleSided ? THREE.DoubleSide : THREE.FrontSide });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = 'uniform float uTime;\nuniform vec2 uCenter;\nuniform float uRadius;\nuniform vec3 uPlayer;\n'
        + shader.vertexShader.replace('#include <project_vertex>', vertexPatch);
    };
    return mat;
  }

  /** Arazi ızgarası üzerinde çimen yoğunluğu (0..1): bölge, eğim ve yüksekliğe göre. */
  buildDensityMap() {
    const { terrain, island } = this.world;
    const n = terrain.n;
    this.map = new Float32Array(n * n);
    this.tint = new Uint8Array(n * n); // 0 çayır, 1 orman, 2 dağ
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const i = iz * n + ix;
        const x = ix * terrain.step - terrain.half;
        const z = iz * terrain.step - terrain.half;
        const h = terrain.heights[i];
        if (h < 0.6) continue;
        const region = island.region(x, z, h);
        const slope = terrain.getSlope(x, z);
        let d = 0;
        if (region === 'meadow') d = 1;
        else if (region === 'forest') { d = 0.6; this.tint[i] = 1; }
        else if (region === 'mountain') { d = 0.55 * (1 - smoothstep(30, 55, h)); this.tint[i] = 2; }
        else if (region === 'beach') d = 0.35 * smoothstep(1.8, 2.8, h);
        else if (region === 'lake') d = h > island.lake.level + 0.15 ? 0.8 : 0;
        d *= 1 - smoothstep(0.6, 1.1, slope);
        this.map[i] = d;
      }
    }
  }

  sampleDensity(x, z) {
    const t = this.world.terrain;
    const ix = Math.round((x + t.half) / t.step);
    const iz = Math.round((z + t.half) / t.step);
    if (ix < 0 || iz < 0 || ix >= t.n || iz >= t.n) return [0, 0];
    const i = iz * t.n + ix;
    return [this.map[i], this.tint[i]];
  }

  /** Yapıların altında çimen bitmesin (kulübe tabanı, kamp ateşi…). */
  addExclusion(x, z, r) {
    this.exclusions.push({ x, z, r });
    this.centerKey = null;
  }

  clearExclusions() {
    this.exclusions.length = 0;
    this.centerKey = null;
  }

  setDensity(d) {
    this.density = d;
    this.centerKey = null;
  }

  update(dt, focus) {
    this.uniforms.uTime.value += dt;
    this.uniforms.uCenter.value.set(focus.x, focus.z);
    this.uniforms.uPlayer.value.copy(focus);
    const cx = Math.floor(focus.x / this.cellSize);
    const cz = Math.floor(focus.z / this.cellSize);
    const key = `${cx},${cz}`;
    if (key !== this.centerKey) {
      this.centerKey = key;
      this.rebuild(cx, cz);
    }
  }

  rebuild(cx, cz) {
    const terrain = this.world.terrain;
    const cs = this.cellSize;
    const R = this.cellsR;
    const perCell = Math.round(cs * cs * this.density);
    const gArr = this.grass.instanceMatrix.array;
    const gCol = this.grass.instanceColor.array;
    const fArr = this.flowers.instanceMatrix.array;
    const fCol = this.flowers.instanceColor.array;
    const flowerColors = [[1, 1, 1], [1, 0.82, 0.25], [1, 0.56, 0.7], [0.7, 0.55, 1], [1, 0.42, 0.4]];
    let gi = 0;
    let fi = 0;
    const write = (arr, i, x, y, z, yaw, s, sy) => {
      const c = Math.cos(yaw) * s;
      const sn = Math.sin(yaw) * s;
      const o = i * 16;
      arr[o] = c; arr[o + 1] = 0; arr[o + 2] = -sn; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = sn; arr[o + 9] = 0; arr[o + 10] = c; arr[o + 11] = 0;
      arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
    };

    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dz * dz > (R + 0.5) * (R + 0.5)) continue;
        const ix = cx + dx;
        const iz = cz + dz;
        const rng = mulberry32((ix * 73856093) ^ (iz * 19349663) ^ 0x5bd1e995);
        for (let k = 0; k < perCell; k++) {
          const x = (ix + rng()) * cs;
          const z = (iz + rng()) * cs;
          const r1 = rng();
          const r2 = rng();
          const r3 = rng();
          const [dens, tint] = this.sampleDensity(x, z);
          if (r1 > dens) continue;
          if (this.exclusions.length && this.exclusions.some((e) => Math.hypot(x - e.x, z - e.z) < e.r)) continue;
          const y = terrain.getHeight(x, z) - 0.03;
          if (r2 < 0.045 && tint === 0 && fi < this.maxFlowers) {
            write(fArr, fi, x, y, z, r3 * 6.28, 0.9 + r3 * 0.6, 0.8 + r2 * 6);
            const fc = flowerColors[Math.floor(r3 * 977) % flowerColors.length];
            fCol[fi * 3] = fc[0]; fCol[fi * 3 + 1] = fc[1]; fCol[fi * 3 + 2] = fc[2];
            fi++;
            continue;
          }
          if (gi >= this.maxClumps) continue;
          const s = 0.75 + r2 * 0.6;
          const sy = (0.55 + r3 * 0.55) * (tint === 2 ? 0.7 : 1) * (0.6 + dens * 0.4);
          write(gArr, gi, x, y, z, r3 * 6.28, s, sy);
          // renk çeşitliliği: kuru sarımsı yamalar, ormanda koyu, dağda soluk
          const v = 0.85 + r1 * 0.25;
          let cr = v, cg = v, cb = v;
          if (tint === 1) { cr *= 0.78; cg *= 0.86; cb *= 0.78; }
          else if (tint === 2) { cr *= 1.05; cg *= 0.95; cb *= 0.8; }
          else if (r2 > 0.8) { cr *= 1.15; cg *= 1.02; cb *= 0.7; }
          gCol[gi * 3] = cr; gCol[gi * 3 + 1] = cg; gCol[gi * 3 + 2] = cb;
          gi++;
        }
      }
    }
    this.grass.count = gi;
    this.flowers.count = fi;
    this.grass.instanceMatrix.needsUpdate = true;
    this.grass.instanceColor.needsUpdate = true;
    this.flowers.instanceMatrix.needsUpdate = true;
    this.flowers.instanceColor.needsUpdate = true;
  }
}

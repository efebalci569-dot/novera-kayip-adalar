import * as THREE from 'three';

// Volkan adasının lavı: krater gölü, lav havuzları ve yamaçtan inen nehirler.
// Işık almadan parlayan, akan gürültülü bir shader; üstündeki kabuk yavaşça hareket eder.

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  varying float vFlow;
  attribute float flow;
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vFlow = flow;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying float vFlow;
  #include <fog_pars_fragment>

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 p = vWorld.xz * 0.18;
    // nehirlerde akış yönünde kayma, göllerde yavaş girdap
    p.y -= vFlow * uTime * 0.35;
    p += vec2(sin(uTime * 0.2), cos(uTime * 0.17)) * 0.4;
    float n = fbm(p + fbm(p * 0.7 + uTime * 0.05));
    float crust = smoothstep(0.52, 0.66, n);
    vec3 hot = mix(vec3(1.0, 0.86, 0.32), vec3(1.0, 0.36, 0.06), smoothstep(0.2, 0.55, n));
    vec3 col = mix(hot, vec3(0.16, 0.07, 0.05), crust * 0.85);
    float pulse = 0.9 + 0.1 * sin(uTime * 2.0 + vWorld.x * 0.3);
    gl_FragColor = vec4(col * pulse * 1.15, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function material() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader,
    fragmentShader,
    fog: true,
  });
}

function disc(x, y, z, r, segments = 32) {
  const g = new THREE.CircleGeometry(r, segments);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  g.setAttribute('flow', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
  return g;
}

/** Çoklu çizgi boyunca araziyi izleyen şerit. */
function ribbon(points, width, heightAt) {
  const pos = [];
  const flow = [];
  const idx = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const w = width * (0.7 + 0.6 * (i / points.length)) * 0.5;
    for (const side of [-1, 1]) {
      const x = points[i].x + nx * w * side;
      const z = points[i].z + nz * w * side;
      pos.push(x, Math.max(heightAt(x, z), heightAt(points[i].x, points[i].z)) + 0.12, z);
      flow.push(1);
    }
    if (i > 0) {
      const k = (i - 1) * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('flow', new THREE.Float32BufferAttribute(flow, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Lava {
  constructor(world) {
    this.group = new THREE.Group();
    this.group.name = 'lava';
    this.material = material();
    this.lights = [];
    for (const isl of world.islands) {
      if (isl.biome !== 'volcano') continue;
      const c = isl.crater;
      const parts = [];
      if (c) parts.push(disc(c.x + isl.cx, c.lavaLevel, c.z + isl.cz, c.r * 0.55, 40));
      for (const p of isl.lavaPools) parts.push(disc(p.x + isl.cx, p.level, p.z + isl.cz, p.r * 1.05, 28));
      for (const rv of isl.lavaRivers) {
        const pts = rv.pts.map((q) => ({ x: q.x + isl.cx, z: q.z + isl.cz }));
        parts.push(ribbon(pts, rv.width, (x, z) => world.terrain.getHeight(x, z)));
        // nehir boyunca birkaç sıcak ışık
        for (let i = 2; i < pts.length; i += 5) {
          const q = pts[i];
          this.lights.push(world.lights.add({ x: q.x, y: world.terrain.getHeight(q.x, q.z) + 2, z: q.z, color: '#ff6a1f', intensity: 6, distance: 16, flicker: true, priority: 5 }));
        }
      }
      for (const g of parts) {
        const mesh = new THREE.Mesh(g, this.material);
        mesh.renderOrder = 0;
        this.group.add(mesh);
      }
      if (c) this.lights.push(world.lights.add({ x: c.x + isl.cx, y: c.lavaLevel + 4, z: c.z + isl.cz, color: '#ff7a2a', intensity: 14, distance: 40, flicker: true, priority: 8 }));
      for (const p of isl.lavaPools) {
        this.lights.push(world.lights.add({ x: p.x + isl.cx, y: p.level + 2, z: p.z + isl.cz, color: '#ff6a1f', intensity: 8, distance: 18, flicker: true, priority: 6 }));
      }
    }
  }

  update(dt) {
    this.material.uniforms.uTime.value += dt;
  }
}

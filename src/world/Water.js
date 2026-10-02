import * as THREE from 'three';
import { WATER_LEVEL } from './Island.js';

// Stilize su: arazinin yükseklik dokusundan derinlik okunur →
// kıyıda turkuaz + köpük, açıkta derin mavi. Dalgalar vertex shader'da.

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uWaveAmp;
  varying vec3 vWorldPos;
  #include <fog_pars_vertex>

  float waveHeight(vec2 p) {
    return (sin(p.x * 0.16 + uTime * 1.1) * 0.10
          + sin(p.y * 0.21 + uTime * 0.85) * 0.09
          + sin((p.x + p.y) * 0.37 + uTime * 1.6) * 0.04) * uWaveAmp;
  }

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    worldPos.y += waveHeight(worldPos.xz);
    vWorldPos = worldPos.xyz;
    vec4 mvPosition = viewMatrix * worldPos;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uWaveAmp;
  uniform sampler2D uHeightTex0;
  uniform sampler2D uHeightTex1;
  uniform sampler2D uHeightTex2;
  uniform sampler2D uHeightTex3;
  uniform vec2 uCenter[4];
  uniform float uTerrainHalf;
  uniform float uTerrainStep;
  uniform float uTerrainN;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform float uLight;
  varying vec3 vWorldPos;
  #include <fog_pars_fragment>

  // her adanın yükseklik dokusundan derinlik: nokta hangi adanın karesindeyse onunki
  vec2 islandUV(vec2 p, vec2 c) {
    return ((p - c + uTerrainHalf) / uTerrainStep + 0.5) / uTerrainN;
  }
  bool inside(vec2 uv) {
    return uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0;
  }
  float terrainHeight(vec2 p) {
    vec2 uv = islandUV(p, uCenter[0]);
    if (inside(uv)) return texture2D(uHeightTex0, uv).r;
    uv = islandUV(p, uCenter[1]);
    if (inside(uv)) return texture2D(uHeightTex1, uv).r;
    uv = islandUV(p, uCenter[2]);
    if (inside(uv)) return texture2D(uHeightTex2, uv).r;
    uv = islandUV(p, uCenter[3]);
    if (inside(uv)) return texture2D(uHeightTex3, uv).r;
    return -14.0;
  }

  void main() {
    vec2 p = vWorldPos.xz;
    float t = uTime;
    float depth = max(vWorldPos.y - terrainHeight(p), 0.0);

    // dalga fonksiyonunun türevlerinden yaklaşık normal + küçük dalgacıklar
    float k = (p.x + p.y) * 0.37 + t * 1.6;
    float dx = (cos(p.x * 0.16 + t * 1.1) * 0.016 + cos(k) * 0.0148) * uWaveAmp;
    float dz = (cos(p.y * 0.21 + t * 0.85) * 0.0189 + cos(k) * 0.0148) * uWaveAmp;
    // küçük dalgacıklar uzakta sönümlenir (aksi halde moiré/titreşim oluşur)
    float detail = 1.0 - smoothstep(25.0, 140.0, length(cameraPosition - vWorldPos));
    dx += (sin(p.x * 1.7 + p.y * 0.6 + t * 2.3) * 0.035 + sin(p.x * 3.1 - p.y * 2.2 - t * 3.1) * 0.018) * detail;
    dz += (sin(p.y * 1.9 - p.x * 0.7 + t * 2.0) * 0.035 + sin(p.y * 2.9 + p.x * 2.4 + t * 2.7) * 0.018) * detail;
    vec3 n = normalize(vec3(-dx, 1.0, -dz));
    vec3 viewDir = normalize(cameraPosition - vWorldPos);

    float deepT = smoothstep(0.0, 5.5, depth);
    vec3 col = mix(uShallow, uDeep, deepT);

    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col = mix(col, uSkyColor, clamp(fres * 0.7, 0.0, 0.7));
    col *= (0.78 + 0.22 * max(dot(n, uSunDir), 0.0)) * uLight;

    vec3 h = normalize(uSunDir + viewDir);
    float spec = pow(max(dot(n, h), 0.0), 140.0) * 1.6;
    col += uSunColor * spec * smoothstep(-0.05, 0.1, uSunDir.y);

    // kıyı köpüğü
    float shore = 1.0 - smoothstep(0.0, 0.5, depth);
    float bands = sin(depth * 9.0 - t * 2.2 + sin(p.x * 0.3 + p.y * 0.2) * 1.5) * 0.5 + 0.5;
    float foam = shore * 0.8 + (1.0 - smoothstep(0.35, 1.2, depth)) * smoothstep(0.78, 0.95, bands) * 0.55;
    foam = clamp(foam, 0.0, 1.0);
    col = mix(col, uFoam * (0.5 + 0.5 * uLight), foam);

    float alpha = mix(0.42, 0.94, smoothstep(0.0, 3.5, depth));
    alpha = max(alpha, foam * 0.92);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function createWaterMaterial(terrains, textures, { deep, shallow, waveAmp }) {
  const t0 = terrains[0];
  const centers = [0, 1, 2, 3].map((i) => {
    const t = terrains[i];
    // olmayan adalar için çok uzak bir merkez (doku asla örneklenmez)
    return t ? new THREE.Vector2(t.cx, t.cz) : new THREE.Vector2(1e6, 1e6);
  });
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uWaveAmp: { value: waveAmp },
      uHeightTex0: { value: null },
      uHeightTex1: { value: null },
      uHeightTex2: { value: null },
      uHeightTex3: { value: null },
      uCenter: { value: centers },
      uTerrainHalf: { value: t0.half },
      uTerrainStep: { value: t0.step },
      uTerrainN: { value: t0.n },
      uDeep: { value: new THREE.Color(deep) },
      uShallow: { value: new THREE.Color(shallow) },
      uFoam: { value: new THREE.Color('#ffffff') },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
      uSunColor: { value: new THREE.Color('#ffffff') },
      uSkyColor: { value: new THREE.Color('#a8dcf5') },
      uLight: { value: 1 },
    },
  ]);
  // dokular merge ile kopyalanmasın diye sonradan atanır
  for (let i = 0; i < 4; i++) uniforms[`uHeightTex${i}`].value = textures[i] ?? textures[0];
  uniforms.uCenter.value = centers;
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    fog: true,
  });
}

const SEA_SIZE = 2400;
const SEA_SEGMENTS = 160;

/**
 * Deniz (kamerayı takip eden büyük bir düzlem) ve adaların tatlı su gölleri.
 * Donmuş göller su değil buz olarak çizilir.
 */
export class Water {
  constructor(world) {
    this.group = new THREE.Group();
    const terrains = world.terrains;
    this.textures = terrains.map((t) => t.createHeightTexture());

    const seaGeo = new THREE.PlaneGeometry(SEA_SIZE, SEA_SIZE, SEA_SEGMENTS, SEA_SEGMENTS);
    seaGeo.rotateX(-Math.PI / 2);
    this.seaMaterial = createWaterMaterial(terrains, this.textures, { deep: '#1a6aa6', shallow: '#3fd6cf', waveAmp: 1 });
    this.sea = new THREE.Mesh(seaGeo, this.seaMaterial);
    this.sea.position.y = WATER_LEVEL;
    this.sea.name = 'sea';
    this.sea.renderOrder = 1;
    this.sea.frustumCulled = false;
    this.group.add(this.sea);
    this.materials = [this.seaMaterial];

    const LAKE_COLORS = {
      tropical: { deep: '#24708f', shallow: '#59c9b9' },
      desert: { deep: '#167c86', shallow: '#4fe0cf' }, // vaha: berrak turkuaz
    };
    this.lakes = [];
    for (const isl of world.islands) {
      const lake = isl.lake;
      if (!lake) continue;
      if (lake.frozen) {
        // donmuş göl: hafif parlak, yarı saydam buz tabakası
        const ice = new THREE.Mesh(
          new THREE.CircleGeometry(lake.radius * 1.12, 40).rotateX(-Math.PI / 2),
          new THREE.MeshLambertMaterial({ color: '#d9f3ff', transparent: true, opacity: 0.45, depthWrite: false }),
        );
        ice.position.set(lake.x, lake.level + 0.03, lake.z);
        ice.renderOrder = 1;
        this.group.add(ice);
        continue;
      }
      const geo = new THREE.CircleGeometry(lake.radius * 1.6, 48);
      geo.rotateX(-Math.PI / 2);
      const mat = createWaterMaterial(terrains, this.textures, { ...(LAKE_COLORS[isl.biome] ?? LAKE_COLORS.tropical), waveAmp: 0.18 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(lake.x, lake.level, lake.z);
      mesh.name = `lake:${isl.id}`;
      mesh.renderOrder = 1;
      this.group.add(mesh);
      this.materials.push(mat);
      this.lakes.push({ island: isl, mesh });
    }
    this.lake = this.lakes[0]?.mesh ?? null;
    this.lakeMaterial = this.materials[1] ?? null;
  }

  /** Belirli bir noktadaki su yüzeyi yüksekliği (CPU tarafı, shader ile aynı dalga). */
  waveHeight(x, z, time) {
    return (
      Math.sin(x * 0.16 + time * 1.1) * 0.1 +
      Math.sin(z * 0.21 + time * 0.85) * 0.09 +
      Math.sin((x + z) * 0.37 + time * 1.6) * 0.04
    );
  }

  get time() {
    return this.seaMaterial.uniforms.uTime.value;
  }

  update(dt, env, camPos) {
    // deniz düzlemi kamerayla birlikte kayar (ızgara adımına oturtulur, dalgalar dünya uzayında)
    if (camPos) {
      const cell = SEA_SIZE / SEA_SEGMENTS;
      this.sea.position.x = Math.round(camPos.x / cell) * cell;
      this.sea.position.z = Math.round(camPos.z / cell) * cell;
    }
    for (const m of this.materials) {
      const u = m.uniforms;
      u.uTime.value += dt;
      u.uSunDir.value.copy(env.sunDir);
      u.uSunColor.value.copy(env.sunColor);
      u.uSkyColor.value.copy(env.horizon);
      u.uLight.value = env.lightLevel;
    }
  }
}

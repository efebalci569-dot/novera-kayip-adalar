import * as THREE from 'three';
import { clamp, lerp, smoothstep, mulberry32 } from '../utils/math.js';

const SHADOW_EXTENT = 58; // oyuncu çevresinde gölge düşen alanın yarı genişliği (m)

// Gün içindeki anahtar kareler (saat → renk/ışık). Aradaki değerler doğrusal karıştırılır.
const RAW_KEYS = [
  { h: 0, top: '#0b1634', hor: '#1d2b4d', light: '#a9bcff', li: 0.75, hs: '#7d90c8', hg: '#2a3048', hi: 1.15, lv: 0.42 },
  { h: 4.3, top: '#101c42', hor: '#2a3560', light: '#a9bcff', li: 0.7, hs: '#7d90c8', hg: '#2a3048', hi: 1.15, lv: 0.42 },
  { h: 5.4, top: '#3b4f88', hor: '#e8927a', light: '#ffb084', li: 0.7, hs: '#a7a6c8', hg: '#4a4038', hi: 1.15, lv: 0.6 },
  { h: 7, top: '#5d9de2', hor: '#ffd6a8', light: '#ffe4bd', li: 1.9, hs: '#cfe0f5', hg: '#6f6248', hi: 1.25, lv: 0.9 },
  { h: 10, top: '#3d8fe9', hor: '#bfe6fa', light: '#fff6e8', li: 2.25, hs: '#d6ebff', hg: '#7c6c4c', hi: 1.3, lv: 1 },
  { h: 15.5, top: '#3d8fe9', hor: '#c2e5f7', light: '#fff2dc', li: 2.2, hs: '#d6ebff', hg: '#7c6c4c', hi: 1.3, lv: 1 },
  { h: 18, top: '#4f7fce', hor: '#ffc48e', light: '#ffc58c', li: 1.75, hs: '#cbc9e6', hg: '#6d5b43', hi: 1.2, lv: 0.85 },
  { h: 19.4, top: '#33467e', hor: '#f27b58', light: '#ff8c5c', li: 0.9, hs: '#9c94c0', hg: '#40363f', hi: 1.15, lv: 0.62 },
  { h: 20.6, top: '#16234c', hor: '#3e3762', light: '#a9bcff', li: 0.7, hs: '#7d90c8', hg: '#2a3048', hi: 1.15, lv: 0.45 },
  { h: 24, top: '#0b1634', hor: '#1d2b4d', light: '#a9bcff', li: 0.75, hs: '#7d90c8', hg: '#2a3048', hi: 1.15, lv: 0.42 },
];

const KEYS = RAW_KEYS.map((k) => ({
  ...k,
  top: new THREE.Color(k.top),
  hor: new THREE.Color(k.hor),
  light: new THREE.Color(k.light),
  hs: new THREE.Color(k.hs),
  hg: new THREE.Color(k.hg),
}));

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uMoonDir;
  uniform float uSunVis;
  uniform float uMoonVis;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float y = d.y;
    vec3 col = mix(uHorizon, uTop, pow(smoothstep(0.0, 1.0, y), 0.55));
    float sd = max(dot(d, uSunDir), 0.0);
    col += uSunColor * (smoothstep(0.9985, 0.9992, sd) * 2.0 + pow(sd, 10.0) * 0.32) * uSunVis;
    float md = max(dot(d, uMoonDir), 0.0);
    col += vec3(0.92, 0.95, 1.0) * smoothstep(0.9990, 0.9995, md) * uMoonVis;
    col += vec3(0.25, 0.3, 0.5) * pow(md, 40.0) * 0.4 * uMoonVis;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * Gökyüzü, güneş/ay ışığı, ortam ışığı, sis ve yıldızlar.
 * Saat bilgisini TimeManager'dan alır; diğer sistemlerin kullanması için `env` nesnesi üretir.
 */
export class DayNightCycle {
  constructor(scene) {
    this.scene = scene;

    this.light = new THREE.DirectionalLight(0xffffff, 2);
    this.light.castShadow = true;
    const cam = this.light.shadow.camera;
    cam.left = -SHADOW_EXTENT; cam.right = SHADOW_EXTENT; cam.top = SHADOW_EXTENT; cam.bottom = -SHADOW_EXTENT;
    cam.near = 1; cam.far = 320;
    this.light.shadow.bias = -0.0004;
    this.light.shadow.normalBias = 0.04;
    this.light.shadow.mapSize.set(2048, 2048);
    scene.add(this.light, this.light.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    scene.add(this.hemi);

    this.skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color('#fff2c8') },
        uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uSunVis: { value: 1 },
        uMoonVis: { value: 0 },
      },
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.skyMaterial);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.stars = this.createStars();
    scene.add(this.stars);

    this.fogBase = { near: 70, far: 420 };
    scene.fog = new THREE.Fog(0xbfe6fa, this.fogBase.near, this.fogBase.far);

    this.env = {
      hour: 12,
      sunDir: new THREE.Vector3(0, 1, 0),
      moonDir: new THREE.Vector3(0, -1, 0),
      lightDir: new THREE.Vector3(0, 1, 0),
      sunColor: new THREE.Color(),
      horizon: new THREE.Color(),
      top: new THREE.Color(),
      lightLevel: 1,
      nightFactor: 0,
      isNight: false,
    };
  }

  createStars() {
    const rng = mulberry32(42);
    const count = 1400;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = rng() * Math.PI * 2;
      const v = Math.acos(rng() * 0.95 + 0.05 - 0.0);
      const r = 850;
      positions[i * 3] = Math.sin(v) * Math.cos(u) * r;
      positions[i * 3 + 1] = Math.cos(v) * r;
      positions[i * 3 + 2] = Math.sin(v) * Math.sin(u) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = -9;
    pts.frustumCulled = false;
    return pts;
  }

  setShadowQuality(enabled, mapSize) {
    if (this.light.castShadow !== enabled) this.light.castShadow = enabled;
    if (enabled && this.light.shadow.mapSize.x !== mapSize) {
      this.light.shadow.mapSize.set(mapSize, mapSize);
      this.light.shadow.map?.dispose();
      this.light.shadow.map = null;
    }
  }

  setFogScale(scale) {
    this.fogBase.far = 420 * scale;
    this.fogBase.near = 70 * scale;
  }

  update(hour, focus, cameraPos) {
    const env = this.env;
    env.hour = hour;

    // anahtar kareler arası karışım
    let i = 0;
    while (i < KEYS.length - 2 && hour >= KEYS[i + 1].h) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const t = clamp((hour - a.h) / (b.h - a.h), 0, 1);

    env.top.copy(a.top).lerp(b.top, t);
    env.horizon.copy(a.hor).lerp(b.hor, t);
    env.sunColor.copy(a.light).lerp(b.light, t);
    const lightIntensity = lerp(a.li, b.li, t);
    env.lightLevel = lerp(a.lv, b.lv, t);

    this.hemi.color.copy(a.hs).lerp(b.hs, t);
    this.hemi.groundColor.copy(a.hg).lerp(b.hg, t);
    this.hemi.intensity = lerp(a.hi, b.hi, t);

    // Güneş 5:30'da doğar, 19:30'da batar. Gece ışık kaynağı aya geçer.
    const sunAngle = ((hour - 5.5) / 14) * Math.PI;
    env.sunDir.set(Math.cos(sunAngle) * 0.85, Math.sin(sunAngle), 0.4).normalize();
    const moonHour = (hour - 19.5 + 24) % 24;
    const moonAngle = (moonHour / 10) * Math.PI;
    env.moonDir.set(Math.cos(moonAngle) * 0.8, Math.sin(moonAngle), -0.35).normalize();

    const sunUp = env.sunDir.y > 0;
    const src = sunUp ? env.sunDir : env.moonDir;
    env.lightDir.copy(src);
    if (env.lightDir.y < 0.22) {
      env.lightDir.y = 0.22;
      env.lightDir.normalize();
    }
    const horizonFade = 0.35 + 0.65 * smoothstep(0.0, 0.2, Math.max(src.y, 0));
    this.light.color.copy(env.sunColor);
    this.light.intensity = lightIntensity * horizonFade;

    env.nightFactor = 1 - Math.max(smoothstep(4.3, 5.8, hour) - smoothstep(19.2, 20.8, hour), 0);
    env.isNight = hour >= 20 || hour < 5;

    // ışık ve gölge kamerası oyuncuyu takip eder
    if (focus) {
      const texel = (SHADOW_EXTENT * 2) / this.light.shadow.mapSize.x;
      const fx = Math.round(focus.x / texel) * texel;
      const fz = Math.round(focus.z / texel) * texel;
      this.light.target.position.set(fx, focus.y, fz);
      this.light.position.set(fx + env.lightDir.x * 150, focus.y + env.lightDir.y * 150, fz + env.lightDir.z * 150);
    }

    const u = this.skyMaterial.uniforms;
    u.uTop.value.copy(env.top);
    u.uHorizon.value.copy(env.horizon);
    u.uSunDir.value.copy(env.sunDir);
    u.uMoonDir.value.copy(env.moonDir);
    u.uSunColor.value.copy(env.sunColor);
    u.uSunVis.value = smoothstep(-0.08, 0.05, env.sunDir.y);
    u.uMoonVis.value = env.nightFactor * smoothstep(-0.05, 0.08, env.moonDir.y);

    this.stars.material.opacity = env.nightFactor * 0.9;
    if (cameraPos) {
      this.sky.position.copy(cameraPos);
      this.stars.position.copy(cameraPos);
    }
    this.stars.rotation.y = hour * 0.02;

    const fog = this.scene.fog;
    fog.color.copy(env.horizon);
    const nightFog = lerp(1, 0.6, env.nightFactor);
    fog.near = this.fogBase.near * nightFog;
    fog.far = this.fogBase.far * nightFog;
  }
}

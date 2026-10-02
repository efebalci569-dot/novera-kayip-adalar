import * as THREE from 'three';

/**
 * Sabit sayıda PointLight havuzu. Three.js'te ışık sayısı değişince tüm malzemeler
 * yeniden derlenir (takılma). Bu yüzden ışık sayısını sabit tutup, oyuncuya en yakın
 * ışık kaynaklarını (kamp ateşi, meşale) bu havuzdaki ışıklara atıyoruz.
 */
export class LightPool {
  constructor(scene, size = 3) {
    this.lights = [];
    for (let i = 0; i < size; i++) {
      const l = new THREE.PointLight(0xffa04a, 0, 14, 1.6);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
    }
    this.sources = new Set();
    this.time = 0;
  }

  /** source: { x, y, z, color, intensity, distance, flicker, priority, enabled } */
  add(source) {
    this.sources.add(source);
    return source;
  }

  remove(source) {
    this.sources.delete(source);
  }

  update(dt, focus, nightFactor) {
    this.time += dt;
    const sorted = [];
    for (const s of this.sources) {
      if (s.enabled === false) continue;
      // 3B uzaklık: mağaradaki ışıklar yüzeyde (ve tersi) yuva işgal etmesin
      const d = Math.hypot(s.x - focus.x, (s.y - focus.y) * 1.5, s.z - focus.z) - (s.priority ?? 0);
      if (d < 70) sorted.push({ s, d });
    }
    sorted.sort((a, b) => a.d - b.d);
    const boost = 0.55 + nightFactor * 0.6;
    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i];
      const entry = sorted[i];
      if (!entry) {
        light.intensity = 0;
        continue;
      }
      const s = entry.s;
      const flicker = s.flicker ? 0.85 + Math.sin(this.time * 13 + i * 3) * 0.06 + Math.sin(this.time * 23.7 + i) * 0.05 : 1;
      light.position.set(s.x, s.y, s.z);
      light.color.set(s.color ?? 0xffa04a);
      light.distance = s.distance ?? 14;
      light.intensity = (s.intensity ?? 6) * flicker * boost;
    }
  }
}

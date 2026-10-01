import * as THREE from 'three';
import { randRange, clamp } from '../utils/math.js';

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/**
 * Gece atmosferi: ateş böcekleri ve karanlıkta parlayan "gözler".
 * Gözler oyuncuya yaklaşmaz; yalnızca uzaktan izler (ilk gece hissi için).
 */
export class Ambience {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'ambience';
    this.time = 0;
    const tex = glowTexture();

    // ── Ateş böcekleri ──
    this.fireflyCount = 90;
    const pos = new Float32Array(this.fireflyCount * 3);
    const col = new Float32Array(this.fireflyCount * 3);
    this.fireflies = [];
    for (let i = 0; i < this.fireflyCount; i++) {
      this.fireflies.push({ bx: 0, by: -100, bz: 0, phase: Math.random() * 10, speed: 0.5 + Math.random() });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.fireflyPoints = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.35, map: tex, vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    }));
    this.fireflyPoints.frustumCulled = false;
    this.group.add(this.fireflyPoints);

    // ── Parlayan gözler ──
    this.eyeMaterial = new THREE.MeshBasicMaterial({ color: '#fff3a0', toneMapped: false, fog: false });
    const eyeGeo = new THREE.SphereGeometry(0.075, 6, 4);
    this.eyes = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const l = new THREE.Mesh(eyeGeo, this.eyeMaterial);
      const r = new THREE.Mesh(eyeGeo, this.eyeMaterial);
      l.position.x = -0.13;
      r.position.x = 0.13;
      g.add(l, r);
      g.visible = false;
      this.group.add(g);
      this.eyes.push({ group: g, state: 'hidden', timer: 2 + i * 4, life: 0, blink: 0 });
    }
  }

  randomSpot(focus, minR, maxR, regions) {
    const { terrain, island } = this.world;
    for (let t = 0; t < 12; t++) {
      const a = Math.random() * Math.PI * 2;
      const r = randRange(Math.random, minR, maxR);
      const x = focus.x + Math.cos(a) * r;
      const z = focus.z + Math.sin(a) * r;
      const h = terrain.getHeight(x, z);
      if (h < 1.5) continue;
      if (regions && !regions.includes(island.region(x, z, h))) continue;
      return { x, y: h, z };
    }
    return null;
  }

  update(dt, focus, env, game) {
    this.time += dt;
    const night = env.nightFactor;
    this.updateFireflies(dt, focus, night);
    this.updateEyes(dt, focus, night, game);
  }

  updateFireflies(dt, focus, night) {
    const pos = this.fireflyPoints.geometry.attributes.position;
    const col = this.fireflyPoints.geometry.attributes.color;
    this.fireflyPoints.visible = night > 0.05;
    if (!this.fireflyPoints.visible) return;
    for (let i = 0; i < this.fireflyCount; i++) {
      const f = this.fireflies[i];
      if (Math.hypot(f.bx - focus.x, f.bz - focus.z) > 45) {
        const s = this.randomSpot(focus, 6, 40, ['forest', 'meadow', 'lake']);
        if (s) { f.bx = s.x; f.by = s.y + randRange(Math.random, 0.5, 2.2); f.bz = s.z; }
      }
      const t = this.time * f.speed + f.phase;
      pos.setXYZ(i, f.bx + Math.sin(t * 0.7) * 0.8, f.by + Math.sin(t * 1.3) * 0.35, f.bz + Math.cos(t * 0.5) * 0.8);
      const glow = clamp(Math.sin(t * 2.2) * 0.6 + 0.5, 0, 1) * night;
      col.setXYZ(i, 0.85 * glow, 1.0 * glow, 0.35 * glow);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  updateEyes(dt, focus, night, game) {
    const active = night > 0.85;
    for (const e of this.eyes) {
      const g = e.group;
      if (e.state === 'hidden') {
        e.timer -= dt;
        if (active && e.timer <= 0) {
          const spot = this.randomSpot(focus, 28, 46, ['forest', 'meadow', 'mountain']);
          if (spot) {
            g.position.set(spot.x, spot.y + randRange(Math.random, 0.6, 1.2), spot.z);
            g.visible = true;
            g.scale.setScalar(0.01);
            e.state = 'watching';
            e.life = randRange(Math.random, 18, 40);
            e.blink = randRange(Math.random, 2, 5);
            if (Math.random() < 0.5) game?.bus.emit('ambience:creature', { x: spot.x, z: spot.z });
          } else e.timer = 3;
        }
        continue;
      }
      // oyuncuya dön
      g.lookAt(focus.x, g.position.y, focus.z);
      const dist = Math.hypot(g.position.x - focus.x, g.position.z - focus.z);
      if (e.state === 'watching') {
        e.life -= dt;
        g.scale.x = g.scale.z = Math.min(1, g.scale.x + dt * 2);
        e.blink -= dt;
        g.scale.y = e.blink < 0.14 && e.blink > 0 ? 0.1 : Math.min(1, g.scale.x);
        if (e.blink < 0) e.blink = randRange(Math.random, 2, 6);
        if (!active || dist < 20 || e.life <= 0) e.state = 'leaving';
      } else if (e.state === 'leaving') {
        const s = Math.max(0, g.scale.x - dt * 3);
        g.scale.set(s, s, s);
        if (s <= 0) {
          g.visible = false;
          e.state = 'hidden';
          e.timer = randRange(Math.random, 6, 18);
        }
      }
    }
  }
}

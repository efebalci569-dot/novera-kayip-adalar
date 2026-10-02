import * as THREE from 'three';
import { mulberry32, smoothstep } from '../utils/math.js';

// Uzaktaki adaların ufuktaki silüetleri. Gerçek arazi sisin içinde kaybolduğu mesafede
// yerini sis etkilemeyen bu basit silüete bırakır; böylece tekneyle rota tutmak kolaylaşır.
// Yalnızca bilinen (haritası bulunmuş ya da ziyaret edilmiş) adalar görünür.

const LOOK = {
  tropical: { color: '#5e7d55', height: 95 },
  desert: { color: '#d9b77a', height: 30 },
  ice: { color: '#cfd8e6', height: 80 },
  volcano: { color: '#5b4a46', height: 105, smoke: true },
};

export class DistantIslands {
  constructor(scene, world) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'distantIslands';
    this.items = [];
    this.time = 0;
    for (const isl of world.islands) {
      const look = LOOK[isl.biome] ?? LOOK.tropical;
      const def = { id: isl.id, x: isl.cx, z: isl.cz, radius: isl.radius * 1.05, height: look.height, color: look.color, smoke: look.smoke };
      const rng = mulberry32(Math.abs(def.x * 7 + def.z) + 1);
      const radial = 10;
      const rows = 3;
      const geo = new THREE.ConeGeometry(def.radius, def.height, radial, rows, true);
      const pos = geo.attributes.position;
      // her satır/sütun için tek bir sapma → dikiş yerlerinde çatlak oluşmaz
      const jitter = Array.from({ length: (rows + 1) * radial }, () => [0.85 + rng() * 0.3, (rng() - 0.5) * 0.12]);
      for (let i = 0; i < pos.count; i++) {
        const row = Math.floor(i / (radial + 1));
        const col = (i % (radial + 1)) % radial;
        if (row === 0) {
          if (def.smoke) {
            // krater: sivri tepeyi kesik bir halkaya dönüştür
            const th = (col / radial) * Math.PI * 2;
            pos.setXYZ(i, Math.sin(th) * def.radius * 0.2, def.height * 0.36, Math.cos(th) * def.radius * 0.2);
          }
          continue;
        }
        if (row === rows) continue;
        const [k, dy] = jitter[row * radial + col];
        pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) + dy * def.height, pos.getZ(i) * k);
      }
      geo.computeVertexNormals();
      const mat = new THREE.MeshBasicMaterial({ color: def.color, fog: false, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(def.x, def.height / 2 - 6, def.z);
      mesh.renderOrder = -5;
      mesh.visible = false;
      this.group.add(mesh);
      const item = { def, island: isl, mesh, base: new THREE.Color(def.color), smoke: [], fade: 0 };

      if (def.smoke) {
        const smokeMat = new THREE.MeshBasicMaterial({ color: '#8d8a88', transparent: true, opacity: 0.35, fog: false, depthWrite: false });
        for (let i = 0; i < 7; i++) {
          const s = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), smokeMat.clone());
          s.userData.phase = i / 7;
          s.visible = false;
          this.group.add(s);
          item.smoke.push(s);
        }
        item.glow = new THREE.Mesh(
          new THREE.SphereGeometry(def.radius * 0.18, 10, 6),
          new THREE.MeshBasicMaterial({ color: '#ff5a1f', transparent: true, opacity: 0, fog: false, depthWrite: false }),
        );
        item.glow.position.set(def.x, def.height * 0.88 - 6, def.z);
        this.group.add(item.glow);
      }
      this.items.push(item);
    }
    scene.add(this.group);
  }

  update(dt, env, fogColor, cam) {
    this.time += dt;
    const nav = this.world.game?.navigation;
    for (const it of this.items) {
      const d = Math.hypot(cam.x - it.def.x, cam.z - it.def.z);
      const known = !nav || nav.isKnown(it.def.id);
      // yakında gerçek arazi görünür; uzaklaştıkça silüet belirir
      const target = known ? smoothstep(it.def.radius + 190, it.def.radius + 360, d) : 0;
      it.fade += (target - it.fade) * Math.min(1, dt * 2);
      const vis = it.fade > 0.01;
      it.mesh.visible = vis;
      if (it.glow) it.glow.visible = vis;
      for (const s of it.smoke) s.visible = vis;
      if (!vis) continue;
      // atmosferik pus: ışıkla karartılmış renk + ufuk rengi
      it.mesh.material.color.copy(it.base).multiplyScalar(0.35 + 0.65 * env.lightLevel).lerp(fogColor, 0.55);
      it.mesh.material.opacity = it.fade;
      for (const s of it.smoke) {
        const k = (this.time * 0.025 + s.userData.phase) % 1;
        const size = it.def.radius * (0.12 + k * 0.45);
        s.scale.setScalar(size);
        s.position.set(it.def.x + k * 60, it.def.height * 0.88 - 6 + k * 160, it.def.z - k * 20);
        s.material.opacity = 0.32 * (1 - k) * (0.4 + env.lightLevel * 0.6) * it.fade;
        s.material.color.set('#8d8a88').lerp(fogColor, 0.45);
      }
      if (it.glow) it.glow.material.opacity = env.nightFactor * (0.45 + Math.sin(this.time * 1.3) * 0.15) * it.fade;
    }
  }
}

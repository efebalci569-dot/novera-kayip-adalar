import * as THREE from 'three';

/**
 * Su yüzeyinde genişleyip sönen halkalar (yüzme kulaçları, kürek, tekne izi, sıçramalar).
 * Sabit sayıda halka havuzu; boşta olanlar gizlidir.
 */
export class Ripples {
  constructor(scene, capacity = 28) {
    this.group = new THREE.Group();
    this.group.name = 'ripples';
    const geo = new THREE.RingGeometry(0.82, 1, 28);
    geo.rotateX(-Math.PI / 2);
    this.items = [];
    for (let i = 0; i < capacity; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: '#f2fbff', transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.items.push({ mesh, t: 0, life: 1, size: 1, alpha: 0.5 });
    }
    this.cursor = 0;
    scene.add(this.group);
  }

  /** size: son yarıçap (m), life: süre (s), alpha: başlangıç opaklığı */
  emit(x, y, z, size = 1.2, life = 1.1, alpha = 0.45) {
    const it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    it.t = 0;
    it.life = life;
    it.size = size;
    it.alpha = alpha;
    it.mesh.position.set(x, y + 0.03, z);
    it.mesh.visible = true;
  }

  update(dt) {
    for (const it of this.items) {
      if (!it.mesh.visible) continue;
      it.t += dt;
      const k = it.t / it.life;
      if (k >= 1) {
        it.mesh.visible = false;
        continue;
      }
      const s = it.size * (0.25 + 0.75 * (1 - (1 - k) * (1 - k)));
      it.mesh.scale.set(s, 1, s);
      it.mesh.material.opacity = it.alpha * (1 - k);
    }
  }
}

import * as THREE from 'three';
import { PlayerModel } from '../player/PlayerModel.js';
import { dampAngle } from '../utils/math.js';

const VIEWS = {
  body: { pos: new THREE.Vector3(0, 1.25, 4.7), look: new THREE.Vector3(0, 1.05, 0) },
  face: { pos: new THREE.Vector3(0, 1.78, 2.75), look: new THREE.Vector3(0, 1.7, 0) },
};

/**
 * Karakter düzenleyicideki döner 3B önizleme. Kendi küçük sahnesi ve tuvali vardır;
 * yalnızca düzenleyici açıkken çizilir. Fareyle sürükleyerek döndürülür.
 */
export class CharacterPreview {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'char-preview';
    this.renderer = null;
    this.active = false;
    this.yaw = 0.5;
    this.autoSpin = true;
    this.focus = 'body'; // 'body' | 'face'
    this.camPos = new THREE.Vector3(0, 1.25, 4.7);
    this.camTarget = new THREE.Vector3(0, 1.05, 0);
    this.time = 0;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 0.75, 0.1, 50);
    const hemi = new THREE.HemisphereLight('#dfefff', '#4a3b2c', 1.5);
    const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
    sun.position.set(2.5, 4, 3.5);
    const rim = new THREE.DirectionalLight('#7fc6ff', 0.9);
    rim.position.set(-3, 2.5, -3);
    this.scene.add(hemi, sun, rim);
    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.82, 0.14, 24),
      new THREE.MeshLambertMaterial({ color: '#d9c48f', flatShading: true }),
    );
    ped.position.y = -0.07;
    const grass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.66, 0.66, 0.02, 24),
      new THREE.MeshLambertMaterial({ color: '#7fb354', flatShading: true }),
    );
    grass.position.y = 0.005;
    this.scene.add(ped, grass);
    this.model = new PlayerModel();
    this.scene.add(this.model.root);

    let drag = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, yaw: this.yaw };
      this.autoSpin = false;
      this.faceFront = false;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (drag) this.yaw = drag.yaw + (e.clientX - drag.x) * 0.012;
    });
    this.canvas.addEventListener('pointerup', () => { drag = null; });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.setFocus(e.deltaY < 0 ? 'face' : 'body');
    }, { passive: false });
  }

  setAppearance(app) {
    this.model.setAppearance(app);
  }

  setFocus(focus) {
    if (focus === 'face' && this.focus !== 'face') {
      // yüze yakınlaşınca karakter kameraya dönsün
      this.autoSpin = false;
      this.faceFront = true;
    } else if (focus === 'body' && this.focus !== 'body') {
      this.faceFront = false;
    }
    this.focus = focus;
  }

  /** Önizlemeyi bir kapsayıcıya yerleştirir ve çizmeye başlar. */
  mount(container) {
    container.append(this.canvas);
    this.active = true;
    if (!this.renderer) {
      try {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      } catch {
        this.renderer = null;
      }
    }
  }

  unmount() {
    this.active = false;
    this.canvas.remove();
  }

  update(dt) {
    if (!this.active || !this.renderer || !this.canvas.isConnected) return;
    this.time += dt;
    const w = this.canvas.clientWidth || 300;
    const h = this.canvas.clientHeight || 400;
    if (this.canvas.width !== Math.round(w * Math.min(2, window.devicePixelRatio || 1))) {
      this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    if (this.faceFront) this.yaw = dampAngle(this.yaw, 0.25, 6, dt);
    else if (this.autoSpin) this.yaw += dt * 0.35;
    this.model.root.rotation.y = this.yaw;
    // hafif nefes/bekleme animasyonu, ara sıra el sallama
    const wave = (this.time % 9) > 7.6 ? { type: 'wave', k: ((this.time % 9) - 7.6) / 1.4 } : null;
    this.model.update(dt, { speed: 0, grounded: true, swimming: false, action: wave });
    if (wave) {
      const k = wave.k;
      this.model.armR.rotation.x = -2.6 + Math.sin(k * Math.PI * 4) * 0.08;
      this.model.armR.rotation.z = -0.35 + Math.sin(k * Math.PI * 6) * 0.35;
    }
    const view = VIEWS[this.focus] ?? VIEWS.body;
    const k = 1 - Math.exp(-6 * dt);
    this.camPos.lerp(view.pos, k);
    this.camTarget.lerp(view.look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
    this.renderer.render(this.scene, this.camera);
  }
}

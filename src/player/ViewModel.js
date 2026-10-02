import * as THREE from 'three';
import { buildHeldGeometry } from '../world/Models.js';
import { clamp, lerp, damp } from '../utils/math.js';

// Kamera uzayında: -Z ileri, +Y yukarı, +X sağ.
const REST = { x: 0.36, y: -0.36, z: -0.5, rx: 0.15, ry: -0.05, rz: -0.25 };
// alet kola göre: önce Y'de 180° (ağız ileri bakar), sonra öne eğim ve sağa yatış
const TOOL_POSE = {
  axe: { rx: -0.85, ry: Math.PI, rz: 0.42 },
  pickaxe: { rx: -0.85, ry: Math.PI, rz: 0.42 },
  spear: { rx: -1.3, ry: Math.PI, rz: 0.2 },
  torch: { rx: -0.7, ry: 0, rz: 0.45 },
  knife: { rx: -1.0, ry: Math.PI, rz: 0.3 },
  rod: { rx: -0.6, ry: 0, rz: 0.35 },
  paddle: { rx: -0.35, ry: 0, rz: 0.9 },
};
// yüzerken iki kolun ortak dinlenme pozu (sağ kol; sol kol x ve dönüşlerde aynalanır)
const SWIM_REST = { x: 0.17, y: -0.3, z: -0.38, rx: 0.25, ry: 0.1, rz: -0.15 };

const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeIn = (t) => t * t;

/**
 * 1. şahıs görünümünde ekranın sağ altında görünen kol ve eldeki alet.
 * Ana sahneden ayrı bir sahnede çizilir (derinlik temizlenerek), böylece duvarların
 * içine girmez. Işıkları her kare ana sahnedeki güneş/ortam ışığından kopyalanır.
 */
export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    // meşale tutulunca kolu ve aleti aydınlatan sabit ışık (ışık sayısı değişmesin diye hep sahnede)
    this.torchLight = new THREE.PointLight(0xffa04a, 0, 3, 1.5);
    this.torchLight.position.set(0.3, 0.05, -0.75);
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.root.add(this.torchLight);
    this.arm = new THREE.Group();
    this.root.add(this.arm);

    const skin = new THREE.MeshLambertMaterial({ color: '#e2ad85', flatShading: true });
    const shirt = new THREE.MeshLambertMaterial({ color: '#ece5d2', flatShading: true });
    this.skinMaterial = skin;
    this.shirtMaterial = shirt;
    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      return m;
    };
    this.arm.add(box(0.12, 0.12, 0.22, shirt, 0, 0, 0.1));
    this.arm.add(box(0.09, 0.09, 0.36, skin, 0, 0, -0.16));
    this.arm.add(box(0.11, 0.1, 0.12, skin, 0, 0.005, -0.4));
    this.grip = new THREE.Group();
    this.grip.position.set(0, 0.03, -0.41);
    this.arm.add(this.grip);

    // yalnızca yüzerken görünen sol kol (kurbağalama için iki kol birlikte çalışır)
    this.armL = new THREE.Group();
    this.armL.add(box(0.12, 0.12, 0.22, shirt, 0, 0, 0.1));
    this.armL.add(box(0.09, 0.09, 0.36, skin, 0, 0, -0.16));
    this.armL.add(box(0.11, 0.1, 0.12, skin, 0, 0.005, -0.4));
    this.armL.visible = false;
    this.root.add(this.armL);
    this.swimBlend = 0;
    this.swimPhase = 0;
    this.poseL = { ...SWIM_REST, x: -SWIM_REST.x };

    this.toolMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.26, 6),
      new THREE.MeshBasicMaterial({ color: '#ffb347', toneMapped: false, transparent: true, opacity: 0.9 }),
    );
    this.flame.position.y = 0.72;
    this.cache = {};
    this.heldKey = undefined;
    this.tool = null;
    this.equip = 1;
    this.time = 0;
    this.bobAmp = 0;
    this.rest = { ...REST };
    this.pose = { ...REST };
  }

  /** Kolların ten ve gömlek rengi karakter görünümünden gelir. */
  setAppearance(app) {
    this.skinMaterial.color.set(app.skin);
    this.shirtMaterial.color.set(app.shirt);
  }

  setHeld(key) {
    if (key === this.heldKey) return;
    this.heldKey = key;
    if (this.tool) this.grip.remove(this.tool);
    this.tool = null;
    this.equip = 0; // yeni alet: kol aşağıdan yukarı gelsin
    if (!key) return;
    if (!this.cache[key]) {
      const geo = buildHeldGeometry(key);
      if (!geo) return;
      const mesh = new THREE.Mesh(geo, this.toolMaterial);
      const p = TOOL_POSE[key] ?? TOOL_POSE.axe;
      mesh.rotation.set(p.rx, p.ry, p.rz);
      if (key === 'torch') mesh.add(this.flame);
      this.cache[key] = mesh;
    }
    this.tool = this.cache[key];
    this.grip.add(this.tool);
  }

  /** state: { action: {type, k} | null, speed, walkPhase, swimming, rowing } */
  update(dt, state) {
    this.time += dt;
    this.equip = Math.min(1, this.equip + dt * 4);
    const REST = this.rest;
    const t = { ...REST };
    const act = state.action;
    if (act) {
      const k = clamp(act.k, 0, 1);
      const bell = Math.sin(Math.PI * k);
      switch (act.type) {
        case 'swing':
        case 'build': {
          const up = act.type === 'build' ? 0.7 : 0.95;
          if (k < 0.42) {
            const e = easeOut(k / 0.42);
            t.rx = lerp(REST.rx, up, e);
            t.y += 0.07 * e;
            t.rz = -0.25 * e;
            t.x += 0.04 * e;
          } else if (k < 0.62) {
            const e = easeIn((k - 0.42) / 0.2);
            t.rx = lerp(up, -0.85, e);
            t.y = lerp(REST.y + 0.07, REST.y - 0.05, e);
            t.z = REST.z - 0.1 * e;
            t.rz = lerp(-0.25, 0.15, e);
            t.x = lerp(REST.x + 0.04, REST.x - 0.06, e);
          } else {
            const e = (k - 0.62) / 0.38;
            t.rx = lerp(-0.85, REST.rx, e);
            t.y = lerp(REST.y - 0.05, REST.y, e);
            t.z = lerp(REST.z - 0.1, REST.z, e);
            t.rz = lerp(0.15, 0, e);
            t.x = lerp(REST.x - 0.06, REST.x, e);
          }
          break;
        }
        case 'butcher':
          t.y -= 0.22 * bell;
          t.z -= 0.18 * bell;
          t.rx -= 0.9 * bell + Math.sin(k * 26) * 0.18 * bell;
          t.x -= 0.08 * bell;
          break;
        case 'gather':
          t.y -= 0.2 * bell;
          t.z -= 0.15 * bell;
          t.rx -= 0.75 * bell;
          t.x -= 0.06 * bell;
          break;
        case 'fish':
          t.y -= 0.22 + Math.sin(k * 20) * 0.03;
          t.z -= 0.12;
          t.rx -= 0.8;
          break;
        case 'eat':
        case 'drink':
          t.x = lerp(REST.x, 0.04, bell);
          t.y = lerp(REST.y, -0.13, bell) + Math.sin(k * 25) * 0.01 * bell;
          t.rx = lerp(REST.rx, 0.55, bell);
          t.ry = lerp(REST.ry, 0.9, bell);
          break;
        default:
          break;
      }
    }

    // yürüme sallanması ve nefes
    this.bobAmp = damp(this.bobAmp, clamp(state.speed / 5, 0, 1.3), 8, dt);
    const ph = state.walkPhase;
    t.x += Math.sin(ph) * 0.014 * this.bobAmp;
    t.y += -Math.abs(Math.cos(ph)) * 0.02 * this.bobAmp + Math.sin(this.time * 1.7) * 0.004;
    if (state.rowing > 0.05) {
      // kürek çekme: kol öne uzanır, suya daldırıp geri çeker
      const r = Math.sin(this.time * (2.2 + state.rowing * 0.6));
      t.x -= 0.05 + r * 0.06;
      t.z -= 0.08 + r * 0.12;
      t.y -= 0.05 - Math.abs(r) * 0.05;
      t.rx -= 0.25 + r * 0.25;
    }
    t.y -= (1 - easeOut(this.equip)) * 0.35;
    // eli boşken kol görüş alanından çekilir; toplama/yeme gibi eylemlerde geri gelir
    if (!this.heldKey && !act) t.y -= 0.5;

    // yüzme: iki kol birlikte kurbağalama yapar (alet görünmez)
    this.swimBlend = damp(this.swimBlend, state.swimming && !act ? 1 : 0, 7, dt);
    const sb = this.swimBlend;
    let tl = null;
    if (sb > 0.01) {
      const moving = clamp(state.speed / 2.2, 0, 1);
      this.swimPhase += dt * (moving > 0.2 ? 0.75 + moving * 0.35 : 0.45);
      const k = this.swimPhase % 1;
      const sw = { ...SWIM_REST };
      if (moving > 0.2) {
        if (k < 0.32) {
          // göğüsten öne uzan
          const e = easeOut(k / 0.32);
          sw.z = lerp(-0.34, -0.72, e); sw.x = lerp(0.1, 0.07, e); sw.y = lerp(-0.26, -0.2, e); sw.rx = lerp(0.35, 0.05, e);
          sw.ry = lerp(0.15, 0.02, e);
        } else if (k < 0.72) {
          // suyu yanlara ve geriye it
          const e = (k - 0.32) / 0.4;
          const ee = e * e * (3 - 2 * e);
          sw.z = lerp(-0.72, -0.38, ee); sw.x = lerp(0.07, 0.48, Math.sin(ee * Math.PI * 0.6)); sw.y = lerp(-0.2, -0.32, ee);
          sw.rx = lerp(0.05, -0.2, ee); sw.ry = lerp(0.02, -0.6, ee); sw.rz = lerp(-0.15, -0.55, ee);
        } else {
          // dirsekleri kırıp göğse topla
          const e = easeOut((k - 0.72) / 0.28);
          sw.z = lerp(-0.38, -0.34, e); sw.x = lerp(0.42, 0.1, e); sw.y = lerp(-0.32, -0.26, e);
          sw.rx = lerp(-0.2, 0.35, e); sw.ry = lerp(-0.6, 0.15, e); sw.rz = lerp(-0.55, -0.15, e);
        }
      } else {
        // su sayma: eller önde sekiz çizer
        const a = this.swimPhase * Math.PI * 2;
        sw.x = 0.22 + Math.sin(a) * 0.08;
        sw.z = -0.46 + Math.cos(a * 2) * 0.03;
        sw.y = -0.33 + Math.sin(a * 2) * 0.02;
        sw.ry = -0.25 + Math.sin(a) * 0.3;
        sw.rz = -0.3;
      }
      // dalgayla hafif yükselip alçalma
      sw.y += Math.sin(this.time * 1.7) * 0.012;
      for (const key of Object.keys(t)) t[key] = lerp(t[key], sw[key], sb);
      tl = { x: -sw.x, y: sw.y, z: sw.z, rx: sw.rx, ry: -sw.ry, rz: -sw.rz };
    }

    const p = this.pose;
    const fast = act ? 40 : 14;
    for (const key of ['x', 'y', 'z', 'rx', 'ry', 'rz']) p[key] = act || sb > 0.9 ? t[key] : damp(p[key], t[key], fast, dt);
    this.arm.position.set(p.x, p.y, p.z);
    this.arm.rotation.set(p.rx, p.ry, p.rz);
    if (this.tool) this.tool.visible = sb < 0.5;
    this.armL.visible = sb > 0.05;
    if (tl) {
      const q = this.poseL;
      for (const key of ['x', 'y', 'z', 'rx', 'ry', 'rz']) q[key] = lerp(q[key], tl[key], sb > 0.9 ? 1 : Math.min(1, dt * 14));
      // aşağıdan yükselerek görünür
      this.armL.position.set(q.x, q.y - (1 - sb) * 0.4, q.z);
      this.armL.rotation.set(q.rx, q.ry, q.rz);
    }

    if (this.heldKey === 'torch') {
      const f = 1 + Math.sin(this.time * 17) * 0.12 + Math.sin(this.time * 29) * 0.08;
      this.flame.scale.set(0.8, f * 0.8, 0.8);
      this.torchLight.intensity = 1.6 * f;
    } else this.torchLight.intensity = 0;
  }

  syncLights(hemi, light) {
    this.hemi.color.copy(hemi.color);
    this.hemi.groundColor.copy(hemi.groundColor);
    this.hemi.intensity = hemi.intensity;
    this.sun.color.copy(light.color);
    this.sun.intensity = light.intensity;
    // yön: ana ışığın yönünü kameranın etrafına uygula
    this.sun.position.copy(light.position).sub(light.target.position).normalize().multiplyScalar(10).add(this.root.position);
    this.sun.target.position.copy(this.root.position);
  }

  render(renderer, camera, hemi, light) {
    this.root.position.copy(camera.position);
    this.root.quaternion.copy(camera.quaternion);
    this.syncLights(hemi, light);
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, camera);
    renderer.autoClear = auto;
  }
}

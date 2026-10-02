import * as THREE from 'three';
import { buildHeldGeometry, sharedMaterials } from '../world/Models.js';
import { clamp, lerp, damp } from '../utils/math.js';

// Eldeki alet ayarları: idleArm → kolun dinlenme açısı, toolRot → aletin kola göre açısı
const HELD_POSE = {
  axe: { idleArm: -0.15, toolRot: Math.PI / 2 },
  pickaxe: { idleArm: -0.15, toolRot: Math.PI / 2 },
  spear: { idleArm: -0.35, toolRot: Math.PI / 2 + 0.2 },
  torch: { idleArm: -0.85, toolRot: 0.85 },
  knife: { idleArm: -0.3, toolRot: Math.PI / 2 },
  rod: { idleArm: -0.7, toolRot: 0.9 },
  paddle: { idleArm: -0.9, toolRot: 0.3 },
};
const TAU = Math.PI * 2;

const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeIn = (t) => t * t;

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color, flatShading: true }));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/**
 * Kutulardan oluşan stilize, düşük poligonlu kazazede karakteri ve
 * prosedürel animasyonları (yürüme, koşma, zıplama, yüzme, vurma, toplama…).
 * Model +Z yönüne bakar.
 */
export class PlayerModel {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'player';
    this.body = new THREE.Group();
    this.root.add(this.body);

    const skin = '#e2ad85';
    const shirt = '#ece5d2';
    const shorts = '#4d6c8c';
    const hair = '#3b2a1d';

    // bacaklar (kalçadan döner)
    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    this.legL.position.set(-0.13, 0.92, 0);
    this.legR.position.set(0.13, 0.92, 0);
    for (const leg of [this.legL, this.legR]) {
      leg.add(box(0.22, 0.42, 0.24, shorts, 0, -0.2, 0));
      leg.add(box(0.17, 0.5, 0.19, skin, 0, -0.64, 0));
      leg.add(box(0.18, 0.08, 0.27, '#b98563', 0, -0.88, 0.04));
      this.body.add(leg);
    }

    // gövde
    this.torso = new THREE.Group();
    this.torso.position.y = 0.92;
    this.body.add(this.torso);
    this.torso.add(box(0.5, 0.18, 0.28, shorts, 0, 0.06, 0));
    this.torso.add(box(0.52, 0.56, 0.3, shirt, 0, 0.4, 0));
    this.torso.add(box(0.22, 0.12, 0.02, '#d9cfb6', 0.08, 0.2, 0.155)); // yırtık
    this.torso.add(box(0.08, 0.04, 0.32, '#a07a4f', -0.1, 0.52, 0)); // askı

    // kafa
    this.head = new THREE.Group();
    this.head.position.y = 0.7;
    this.torso.add(this.head);
    this.head.add(box(0.36, 0.38, 0.34, skin, 0, 0.19, 0));
    this.head.add(box(0.39, 0.12, 0.37, hair, 0, 0.41, -0.01));
    this.head.add(box(0.39, 0.26, 0.1, hair, 0, 0.27, -0.15));
    this.head.add(box(0.06, 0.06, 0.02, '#2b211c', -0.08, 0.22, 0.175));
    this.head.add(box(0.06, 0.06, 0.02, '#2b211c', 0.08, 0.22, 0.175));
    this.head.add(box(0.12, 0.03, 0.02, '#a8664f', 0, 0.1, 0.175));

    // kollar (omuzdan döner)
    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    this.armL.position.set(-0.34, 0.6, 0);
    this.armR.position.set(0.34, 0.6, 0);
    for (const arm of [this.armL, this.armR]) {
      arm.add(box(0.15, 0.28, 0.17, shirt, 0, -0.12, 0));
      arm.add(box(0.13, 0.32, 0.14, skin, 0, -0.42, 0));
      arm.add(box(0.13, 0.12, 0.13, skin, 0, -0.62, 0));
      this.torso.add(arm);
    }
    this.hand = new THREE.Group();
    this.hand.position.set(0, -0.64, 0.02);
    this.armR.add(this.hand);

    // sırt çantası (geliştirmeyle görünür)
    this.backpack = new THREE.Group();
    this.backpack.add(box(0.4, 0.46, 0.18, '#a58a55', 0, 0.36, -0.24));
    this.backpack.add(box(0.36, 0.12, 0.2, '#8d7446', 0, 0.62, -0.24));
    this.backpack.visible = false;
    this.torso.add(this.backpack);

    // eldeki alet
    this.heldCache = {};
    this.heldKey = null;
    this.heldMesh = null;
    this.flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.28, 6),
      new THREE.MeshBasicMaterial({ color: '#ffb347', toneMapped: false, transparent: true, opacity: 0.9 }),
    );
    this.flame.visible = false;

    this.walkPhase = 0;
    this.time = 0;
    this.swimBlend = 0;
    this.swimMove = 0;
    this.swimPhase = 0;
    this.strokeSide = 1; // son kulacın tarafı (sıçrama efekti için)
    this.sitBlend = 0;
    this.rowPhase = 0;
    this.airBlend = 0;
  }

  setHeld(key) {
    if (key === this.heldKey) return;
    if (this.heldMesh) this.hand.remove(this.heldMesh);
    this.heldKey = key;
    this.heldMesh = null;
    if (!key) return;
    if (!this.heldCache[key]) {
      const geo = buildHeldGeometry(key);
      if (!geo) return;
      const mesh = new THREE.Mesh(geo, sharedMaterials.standard);
      mesh.castShadow = true;
      if (key === 'torch') {
        this.flame.position.y = 0.72;
        mesh.add(this.flame);
      }
      this.heldCache[key] = mesh;
    }
    this.heldMesh = this.heldCache[key];
    this.heldMesh.rotation.x = HELD_POSE[key]?.toolRot ?? Math.PI / 2;
    this.flame.visible = key === 'torch';
    this.heldMesh.visible = !this.firstPerson && !this.hideHeld;
    this.hand.add(this.heldMesh);
  }

  setBackpack(visible) {
    this.backpack.visible = visible;
  }

  /**
   * 1. şahısta gövde görünmez ama gölge düşürmeye devam eder
   * (renk ve derinlik yazımı kapatılır; gölge geçişi bundan etkilenmez).
   */
  setFirstPerson(on) {
    this.firstPerson = on;
    this.body.traverse((o) => {
      if (!o.isMesh || o.material === sharedMaterials.standard) return;
      o.material.colorWrite = !on;
      o.material.depthWrite = !on;
    });
    if (this.heldMesh) this.heldMesh.visible = !on;
  }

  /**
   * state: { speed, running, grounded, swimming, action: {type, k} | null }
   */
  update(dt, state) {
    this.time += dt;
    const speed = state.speed;
    const moveAmp = clamp(speed / 5, 0, 1.2);
    this.walkPhase += dt * (speed > 0.2 ? 4 + speed * 1.15 : 0);
    const swing = Math.sin(this.walkPhase) * moveAmp * 0.75;

    this.swimBlend = damp(this.swimBlend, state.swimming ? 1 : 0, 6, dt);
    this.swimMove = damp(this.swimMove, state.swimming && speed > 0.6 ? 1 : 0, 4, dt);
    this.sitBlend = damp(this.sitBlend, state.sitting ? 1 : 0, 8, dt);
    this.airBlend = damp(this.airBlend, !state.grounded && !state.swimming && !state.sitting ? 1 : 0, 10, dt);
    // yüzerken eldeki alet görünmez
    const hide = this.swimBlend > 0.5;
    if (hide !== this.hideHeld) {
      this.hideHeld = hide;
      if (this.heldMesh) this.heldMesh.visible = !this.firstPerson && !hide;
    }
    const pose = HELD_POSE[this.heldKey] ?? { idleArm: 0 };

    // temel yürüyüş
    let legL = swing;
    let legR = -swing;
    let armL = -swing * 0.8;
    let armR = swing * 0.8 + pose.idleArm;
    let armLz = 0.06;
    let armRz = -0.06;
    let bodyY = Math.abs(Math.sin(this.walkPhase)) * 0.06 * moveAmp;
    let bodyX = state.running ? 0.12 : 0.03 * moveAmp;
    const breathe = Math.sin(this.time * 2.2) * 0.012;

    // havada
    legL = lerp(legL, 0.45, this.airBlend);
    legR = lerp(legR, -0.25, this.airBlend);
    armLz = lerp(armLz, 0.45, this.airBlend);
    armRz = lerp(armRz, -0.45, this.airBlend);

    // yüzme: ilerlerken serbest stil (kulaç + çarpraz ayak), dururken su sayma (kollar yanlarda süzülür)
    let swimArmsDirect = false;
    let bodyRoll = 0;
    let headYaw = 0;
    let headPitch = 0;
    if (this.swimBlend > 0.01) {
      const mv = this.swimMove;
      this.swimPhase += dt * lerp(2.2, 3.4 + Math.min(speed, 3) * 0.35, mv);
      const ph = this.swimPhase;
      // serbest stil: kollar sürekli döner (öne uzan → suyun altından çek → sudan çıkarıp öne getir)
      const crawlL = -Math.PI + (ph % TAU);
      const crawlR = -Math.PI + ((ph + Math.PI) % TAU);
      this.strokeSide = (ph % TAU) < Math.PI ? -1 : 1;
      // su sayma: kollar yanlara açık, sekiz çizerek süzülür
      const treadArm = -0.75 + Math.sin(ph * 1.6) * 0.22;
      const treadZ = 0.95 + Math.sin(ph * 1.6 + 1.2) * 0.3;
      const aL = lerp(treadArm, crawlL, mv);
      const aR = lerp(treadArm, crawlR, mv);
      armL = lerp(armL, aL, this.swimBlend);
      armR = lerp(armR, aR, this.swimBlend);
      armLz = lerp(armLz, lerp(treadZ, 0.12, mv), this.swimBlend);
      armRz = lerp(armRz, lerp(-treadZ, -0.12, mv), this.swimBlend);
      swimArmsDirect = this.swimBlend > 0.9;
      // ayaklar: hızlı çapraz vuruş / yavaş pedal
      const kick = mv > 0.5 ? Math.sin(ph * 3.1) * 0.42 : Math.sin(ph * 1.6) * 0.5;
      legL = lerp(legL, kick, this.swimBlend);
      legR = lerp(legR, -kick, this.swimBlend);
      bodyX = lerp(bodyX, 0, this.swimBlend);
      bodyY = lerp(bodyY, lerp(-1.12 + Math.sin(ph * 2) * 0.05, 0.34 + Math.sin(ph * 2) * 0.03, mv), this.swimBlend);
      bodyRoll = Math.sin(ph) * 0.3 * mv * this.swimBlend;
      headYaw = Math.sin(ph) * 0.45 * mv * this.swimBlend; // nefes almak için yana dönüş
      headPitch = -0.95 * mv * this.swimBlend;
    }
    this.body.rotation.x = this.swimBlend * lerp(0.35, 1.38, this.swimMove);
    this.body.rotation.z = bodyRoll;
    this.head.rotation.y = damp(this.head.rotation.y, headYaw, 10, dt);

    // oturma (sal/tekne): bacaklar öne uzanır, salda kürek çekilir
    if (this.sitBlend > 0.01) {
      const sb = this.sitBlend;
      legL = lerp(legL, -1.45, sb);
      legR = lerp(legR, -1.4, sb);
      bodyY = lerp(bodyY, 0, sb);
      if (state.rowing > 0.05) {
        this.rowPhase += dt * (2.2 + state.rowing * 0.6);
        const r = Math.sin(this.rowPhase);
        armR = lerp(armR, -1.25 + r * 0.55, sb);
        armL = lerp(armL, -1.1 - r * 0.45, sb);
        armRz = lerp(armRz, -0.25, sb);
        armLz = lerp(armLz, 0.55, sb);
        bodyX = lerp(bodyX, 0.12 + r * 0.12, sb);
      } else if (state.steering) {
        armR = lerp(armR, -0.55, sb);
        armRz = lerp(armRz, 0.1, sb);
        armL = lerp(armL, -0.3, sb);
      } else {
        armL = lerp(armL, -0.35, sb);
        armR = lerp(armR, -0.35 + (HELD_POSE[this.heldKey]?.idleArm ?? 0) * 0.5, sb);
      }
    }

    // eylem animasyonları
    const act = state.action;
    let crouch = 0;
    if (act) {
      const k = act.k;
      headPitch = 0;
      const bell = Math.sin(Math.PI * clamp(k, 0, 1));
      switch (act.type) {
        case 'swing':
        case 'build': {
          const up = act.type === 'build' ? -2.2 : -2.75;
          if (k < 0.45) armR = lerp(pose.idleArm, up, easeOut(k / 0.45));
          else if (k < 0.62) armR = lerp(up, -0.35, easeIn((k - 0.45) / 0.17));
          else armR = lerp(-0.35, pose.idleArm, (k - 0.62) / 0.38);
          armL = lerp(armL, -0.6, bell);
          bodyX += k > 0.45 && k < 0.75 ? 0.22 : 0.05;
          break;
        }
        case 'gather':
          crouch = bell;
          armL = lerp(armL, -1.15, bell);
          armR = lerp(armR, -1.15, bell);
          break;
        case 'fish':
          crouch = Math.min(1, k * 4, (1 - k) * 4);
          armL = -1.2 + Math.sin(k * 18) * 0.25 * crouch;
          armR = -1.2 - Math.sin(k * 18) * 0.25 * crouch;
          break;
        case 'butcher':
          // diz çök, bıçakla kes
          crouch = Math.min(1, k * 5, (1 - k) * 5);
          armR = -1.0 + Math.sin(k * 26) * 0.35 * crouch;
          armL = lerp(armL, -1.2, crouch);
          break;
        case 'eat':
          armR = lerp(armR, -2.1, bell);
          armRz = lerp(armRz, 0.55, bell);
          this.head.rotation.x = -0.1 * bell;
          break;
        case 'drink':
          crouch = bell;
          armL = lerp(armL, -1.9, bell);
          armR = lerp(armR, -1.9, bell);
          armLz = lerp(armLz, -0.4, bell);
          armRz = lerp(armRz, 0.4, bell);
          break;
        default:
          break;
      }
    } else {
      this.head.rotation.x = damp(this.head.rotation.x, headPitch, 10, dt);
    }

    if (crouch > 0) {
      bodyY -= 0.3 * crouch;
      bodyX += 0.55 * crouch;
      legL = lerp(legL, -0.75, crouch);
      legR = lerp(legR, -0.75, crouch);
    }

    const k = 18;
    this.legL.rotation.x = damp(this.legL.rotation.x, legL, k, dt);
    this.legR.rotation.x = damp(this.legR.rotation.x, legR, k, dt);
    this.armL.rotation.x = swimArmsDirect ? armL : damp(this.armL.rotation.x, armL, act ? 30 : k, dt);
    this.armR.rotation.x = act || swimArmsDirect ? armR : damp(this.armR.rotation.x, armR, k, dt);
    this.armL.rotation.z = damp(this.armL.rotation.z, armLz, k, dt);
    this.armR.rotation.z = damp(this.armR.rotation.z, armRz, k, dt);
    this.body.position.y = damp(this.body.position.y, bodyY, 14, dt);
    this.torso.rotation.x = damp(this.torso.rotation.x, bodyX, 10, dt);
    this.torso.scale.y = 1 + breathe;

    if (this.flame.visible) {
      const f = 1 + Math.sin(this.time * 17) * 0.12 + Math.sin(this.time * 29) * 0.08;
      this.flame.scale.set(1, f, 1);
    }
  }

  /** Meşale alevinin dünya konumu (ışık için). */
  getFlameWorldPosition(target) {
    return this.flame.getWorldPosition(target);
  }
}

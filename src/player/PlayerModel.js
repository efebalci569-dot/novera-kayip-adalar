import * as THREE from 'three';
import { buildHeldGeometry, sharedMaterials, part, merge } from '../world/Models.js';
import { defaultAppearance, sanitizeAppearance } from '../data/appearance.js';
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

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
function mix(a, b, t) {
  return '#' + _c1.set(a).lerp(_c2.set(b), t).getHexString();
}
function shade(color, f) {
  _c1.set(color);
  return '#' + _c1.setRGB(Math.min(1, _c1.r * f), Math.min(1, _c1.g * f), Math.min(1, _c1.b * f)).getHexString();
}

/** Bir parça listesine kutu ekleyen yardımcı (yerel konum + isteğe bağlı dönüş). */
function B(list, w, h, d, color, x = 0, y = 0, z = 0, rot = {}) {
  list.push(part(new THREE.BoxGeometry(w, h, d), color, { x, y, z, ...rot }));
}

// ── Saç modelleri (kafa grubunun yerel uzayında; kafa kutusu y 0.01–0.37, x ±0.17, z ±0.165) ──
function hairCap(L, c, s = 1) {
  B(L, 0.37 * s, 0.09, 0.35, c, 0, 0.395, -0.005);
  B(L, 0.36 * s, 0.24, 0.06, c, 0, 0.28, -0.15);
  for (const sx of [-1, 1]) B(L, 0.026, 0.13, 0.25, c, sx * 0.181 * s, 0.315, -0.035);
}

const HAIR_BUILDERS = {
  bald() {},
  short(L, c) {
    hairCap(L, c);
    B(L, 0.34, 0.05, 0.03, c, 0, 0.355, 0.165);
  },
  side(L, c) {
    hairCap(L, c);
    B(L, 0.26, 0.08, 0.33, c, 0.05, 0.45, 0.01, { rz: -0.12 });
    B(L, 0.22, 0.06, 0.04, c, 0.06, 0.345, 0.17, { rz: 0.28 });
  },
  spiky(L, c) {
    hairCap(L, c);
    for (let i = 0; i < 9; i++) {
      const gx = (i % 3) - 1;
      const gz = Math.floor(i / 3) - 1;
      L.push(part(new THREE.ConeGeometry(0.055, 0.17, 4), c, { x: gx * 0.1, y: 0.47, z: gz * 0.1 - 0.01, rx: -0.35 + gz * 0.15, rz: -gx * 0.3, ry: 0.785 }));
    }
  },
  curly(L, c) {
    hairCap(L, c, 1.02);
    const pts = [[0, 0.45, 0.06], [-0.11, 0.44, 0.02], [0.11, 0.44, 0.02], [0, 0.46, -0.08], [-0.12, 0.42, -0.11], [0.12, 0.42, -0.11],
      [-0.17, 0.35, 0.07], [0.17, 0.35, 0.07], [-0.18, 0.3, -0.06], [0.18, 0.3, -0.06], [0, 0.36, -0.17], [-0.1, 0.27, -0.17], [0.1, 0.27, -0.17], [0.06, 0.4, 0.14], [-0.06, 0.4, 0.14]];
    pts.forEach(([x, y, z], i) => L.push(part(new THREE.IcosahedronGeometry(0.075, 0), c, { x, y, z, seed: 40 + i })));
  },
  afro(L, c) {
    L.push(part(new THREE.IcosahedronGeometry(0.28, 1), c, { y: 0.38, z: -0.04, sy: 0.82, sz: 0.95, jitter: 0.015, seed: 61 }));
    B(L, 0.36, 0.05, 0.03, c, 0, 0.35, 0.168);
  },
  mohawk(L, c) {
    B(L, 0.08, 0.15, 0.36, c, 0, 0.44, -0.01);
    B(L, 0.08, 0.2, 0.07, c, 0, 0.3, -0.18);
    for (let i = 0; i < 4; i++) L.push(part(new THREE.ConeGeometry(0.045, 0.12, 4), c, { y: 0.54, z: 0.12 - i * 0.1, rx: -0.4 }));
    for (const sx of [-1, 1]) B(L, 0.012, 0.1, 0.24, shade(c, 0.85), sx * 0.172, 0.33, -0.03);
  },
  long(L, c) {
    hairCap(L, c, 1.03);
    B(L, 0.39, 0.55, 0.07, c, 0, 0.11, -0.175);
    for (const sx of [-1, 1]) B(L, 0.06, 0.44, 0.13, c, sx * 0.19, 0.16, 0.04);
    B(L, 0.36, 0.06, 0.04, c, 0, 0.35, 0.168);
  },
  ponytail(L, c) {
    hairCap(L, c);
    B(L, 0.34, 0.05, 0.03, c, 0, 0.355, 0.165);
    B(L, 0.08, 0.08, 0.06, '#7a3a3a', 0, 0.3, -0.2);
    B(L, 0.1, 0.36, 0.09, c, 0, 0.12, -0.25, { rx: 0.22 });
    L.push(part(new THREE.ConeGeometry(0.055, 0.12, 5), c, { y: -0.1, z: -0.3, rx: Math.PI + 0.2 }));
  },
  bun(L, c) {
    hairCap(L, c);
    B(L, 0.34, 0.05, 0.03, c, 0, 0.355, 0.165);
    L.push(part(new THREE.IcosahedronGeometry(0.11, 1), c, { y: 0.44, z: -0.13, seed: 71 }));
  },
  braid(L, c) {
    hairCap(L, c);
    B(L, 0.34, 0.05, 0.03, c, 0, 0.355, 0.165);
    for (let i = 0; i < 6; i++) B(L, 0.085, 0.085, 0.085, i % 2 ? shade(c, 0.88) : c, 0, 0.2 - i * 0.085, -0.2 - i * 0.012, { rz: 0.785 });
  },
  bob(L, c) {
    hairCap(L, c, 1.04);
    B(L, 0.4, 0.3, 0.08, c, 0, 0.22, -0.17);
    for (const sx of [-1, 1]) B(L, 0.06, 0.3, 0.2, c, sx * 0.195, 0.22, -0.01);
    B(L, 0.37, 0.08, 0.04, c, 0, 0.34, 0.168);
  },
};

// ── Sakallar (ağız y≈0.09, ön yüz z≈0.165) ──
const BEARD_BUILDERS = {
  none() {},
  stubble(L, c) {
    B(L, 0.3, 0.11, 0.012, c, 0, 0.07, 0.168);
    for (const sx of [-1, 1]) B(L, 0.012, 0.14, 0.22, c, sx * 0.172, 0.1, 0.04);
  },
  mustache(L, c) {
    B(L, 0.15, 0.035, 0.03, c, 0, 0.125, 0.175);
    for (const sx of [-1, 1]) B(L, 0.03, 0.05, 0.025, c, sx * 0.07, 0.1, 0.175);
  },
  goatee(L, c) {
    BEARD_BUILDERS.mustache(L, c);
    B(L, 0.1, 0.1, 0.05, c, 0, 0.03, 0.16);
  },
  full(L, c) {
    B(L, 0.35, 0.15, 0.05, c, 0, 0.06, 0.155);
    for (const sx of [-1, 1]) B(L, 0.04, 0.2, 0.25, c, sx * 0.17, 0.1, 0.03);
    B(L, 0.3, 0.05, 0.25, c, 0, -0.01, 0.05);
    B(L, 0.16, 0.035, 0.035, shade(c, 1.1), 0, 0.125, 0.18);
  },
  long(L, c) {
    BEARD_BUILDERS.full(L, c);
    B(L, 0.28, 0.22, 0.08, c, 0, -0.09, 0.14);
    B(L, 0.17, 0.09, 0.06, c, 0, -0.23, 0.13);
  },
};

/** Görünüme göre her kemik grubunun birleştirilmiş geometrisi. */
function buildCharacterGeometry(app) {
  const female = app.gender === 'female';
  const skin = app.skin;
  const skinDark = shade(skin, 0.86);
  const shirt = app.shirt;
  const shirtDark = shade(shirt, 0.82);
  const pants = app.pants;
  const pantsDark = shade(pants, 0.8);
  const hair = app.hairColor;
  const g = { leg: [], torso: [], head: [], eyes: [], arm: [], backpack: [] };

  // bacak (kalçadan aşağı)
  const lw = female ? 0.19 : 0.21;
  B(g.leg, lw, 0.44, 0.23, pants, 0, -0.2, 0);
  B(g.leg, lw + 0.012, 0.06, 0.24, pantsDark, 0, -0.43, 0); // kıvrılmış paça
  B(g.leg, lw - 0.05, 0.4, 0.165, skin, 0, -0.65, 0);
  B(g.leg, lw - 0.02, 0.09, 0.28, '#5a4030', 0, -0.88, 0.04);
  B(g.leg, lw - 0.01, 0.03, 0.29, '#3a2a20', 0, -0.92, 0.04);

  // gövde (kalça orijinli)
  const tw = female ? 0.44 : 0.5;
  B(g.torso, female ? 0.5 : 0.48, 0.18, 0.27, pants, 0, 0.06, 0);
  B(g.torso, tw + 0.02, 0.05, 0.29, '#6b4c30', 0, 0.16, 0); // kemer
  B(g.torso, 0.07, 0.05, 0.02, '#c9a54c', 0.04, 0.16, 0.146);
  B(g.torso, tw, 0.52, 0.28, shirt, 0, 0.43, 0);
  B(g.torso, female ? 0.48 : 0.56, 0.12, 0.3, shirt, 0, 0.63, 0); // omuz hattı
  if (female) B(g.torso, 0.38, 0.14, 0.06, shirt, 0, 0.5, 0.14, { rx: 0.1 });
  // V yaka, yaka ve yıpranmış etek
  B(g.torso, 0.12, 0.1, 0.02, skin, 0, 0.64, 0.146);
  for (const sx of [-1, 1]) B(g.torso, 0.08, 0.04, 0.03, shirtDark, sx * 0.07, 0.67, 0.145, { rz: sx * 0.5 });
  for (let i = 0; i < 5; i++) B(g.torso, 0.08, 0.04 + (i % 2) * 0.03, 0.285, i % 2 ? shirtDark : shirt, -tw / 2 + 0.05 + i * (tw - 0.1) / 4, 0.18, 0);
  B(g.torso, 0.12, 0.1, 0.012, mix(shirt, '#d9cfb6', 0.5), 0.1, 0.33, 0.141); // yama
  B(g.torso, 0.08, 0.04, 0.3, '#a07a4f', -0.1, 0.54, 0, { rz: 0.5 }); // askı
  B(g.torso, 0.14, 0.08, 0.14, skin, 0, 0.71, 0); // boyun

  // kafa (boyun üstü orijinli)
  const hw = female ? 0.33 : 0.35;
  B(g.head, hw, 0.36, 0.33, skin, 0, 0.19, 0);
  if (!female) B(g.head, hw - 0.02, 0.06, 0.31, skin, 0, 0.03, 0.005); // çene
  for (const sx of [-1, 1]) B(g.head, 0.035, 0.09, 0.07, skinDark, sx * (hw / 2 + 0.012), 0.2, -0.01); // kulaklar
  B(g.head, 0.055, 0.075, 0.05, skinDark, 0, 0.165, 0.18); // burun
  B(g.head, female ? 0.09 : 0.1, female ? 0.028 : 0.02, 0.012, female ? '#b8566a' : '#8a4a3e', 0, 0.09, 0.168); // ağız
  for (const sx of [-1, 1]) {
    B(g.head, 0.085, female ? 0.016 : 0.022, 0.014, shade(hair, 0.9), sx * 0.075, 0.29, 0.168, { rz: female ? -sx * 0.18 : -sx * 0.06 }); // kaşlar
    if (female) B(g.head, 0.05, 0.03, 0.006, '#e89a9a', sx * 0.105, 0.14, 0.167); // yanak
  }
  (HAIR_BUILDERS[app.hairStyle] ?? HAIR_BUILDERS.short)(g.head, hair);
  if (!female || app.beard !== 'none') {
    const beardColor = app.beard === 'stubble' ? mix(hair, skin, 0.45) : hair;
    (BEARD_BUILDERS[app.beard] ?? BEARD_BUILDERS.none)(g.head, beardColor);
  }

  // gözler (göz kırpma için ayrı ağ)
  for (const sx of [-1, 1]) {
    B(g.eyes, 0.075, 0.05, 0.012, '#f4f1ea', sx * 0.075, 0, 0);
    B(g.eyes, 0.042, 0.046, 0.012, app.eyeColor, sx * 0.07, 0, 0.004);
    B(g.eyes, 0.018, 0.026, 0.01, '#120c08', sx * 0.068, 0, 0.009);
    B(g.eyes, 0.01, 0.01, 0.006, '#ffffff', sx * 0.06, 0.012, 0.013);
    if (female) B(g.eyes, 0.085, 0.012, 0.014, '#1a120e', sx * 0.075, 0.03, 0.004, { rz: -sx * 0.12 });
  }

  // kol (omuzdan aşağı)
  const aw = female ? 0.115 : 0.13;
  B(g.arm, aw + 0.025, 0.24, 0.17, shirt, 0, -0.1, 0);
  B(g.arm, aw + 0.03, 0.04, 0.175, shirtDark, 0, -0.22, 0);
  B(g.arm, aw, 0.22, aw + 0.01, skin, 0, -0.34, 0);
  B(g.arm, aw - 0.01, 0.2, aw, skin, 0, -0.52, 0);
  B(g.arm, aw + 0.005, 0.12, aw + 0.01, skinDark, 0, -0.64, 0.005); // el

  // sırt çantası
  B(g.backpack, 0.4, 0.46, 0.18, '#a58a55', 0, 0.36, -0.24);
  B(g.backpack, 0.36, 0.12, 0.2, '#8d7446', 0, 0.62, -0.24);
  for (const sx of [-1, 1]) B(g.backpack, 0.05, 0.5, 0.04, '#6b5636', sx * 0.15, 0.42, -0.14);

  const out = {};
  for (const [k, list] of Object.entries(g)) out[k] = list.length ? merge(list) : null;
  return out;
}

/**
 * Kutulardan oluşan stilize, düşük poligonlu kazazede karakteri ve
 * prosedürel animasyonları (yürüme, koşma, zıplama, yüzme, vurma, toplama…).
 * Görünüm (cinsiyet, ten, saç, sakal, göz, kıyafet) setAppearance ile değişir.
 * Her kemik grubu tek bir birleşik ağdır (karakter başına ~10 çizim çağrısı). Model +Z yönüne bakar.
 */
export class PlayerModel {
  constructor(appearance = defaultAppearance('male')) {
    this.root = new THREE.Group();
    this.root.name = 'player';
    this.body = new THREE.Group();
    this.root.add(this.body);
    // modele özel malzeme: 1. şahısta yalnızca yerel oyuncunun gövdesi gizlenir
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    this.legL.position.set(-0.12, 0.92, 0);
    this.legR.position.set(0.12, 0.92, 0);
    this.torso = new THREE.Group();
    this.torso.position.y = 0.92;
    this.head = new THREE.Group();
    this.head.position.y = 0.72;
    this.eyes = new THREE.Group();
    this.eyes.position.set(0, 0.235, 0.168);
    this.head.add(this.eyes);
    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    this.hand = new THREE.Group();
    this.hand.position.set(0, -0.64, 0.02);
    this.armR.add(this.hand);
    this.backpack = new THREE.Group();
    this.backpack.visible = false;
    this.torso.add(this.head, this.armL, this.armR, this.backpack);
    this.body.add(this.legL, this.legR, this.torso);
    this.meshes = [];

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
    this.blinkTimer = 2 + Math.random() * 3;
    this.swimBlend = 0;
    this.swimMove = 0;
    this.swimPhase = 0;
    this.strokeSide = 1; // son kulacın tarafı (sıçrama efekti için)
    this.sitBlend = 0;
    this.rowPhase = 0;
    this.airBlend = 0;
    this.setAppearance(appearance);
  }

  /** Görünümü (yeniden) oluşturur; animasyon durumu ve eldeki alet korunur. */
  setAppearance(appearance) {
    this.appearance = sanitizeAppearance(appearance);
    for (const m of this.meshes) {
      m.parent?.remove(m);
      m.geometry.dispose();
    }
    this.meshes = [];
    const geo = buildCharacterGeometry(this.appearance);
    const add = (group, geometry) => {
      if (!geometry) return;
      const m = new THREE.Mesh(geometry, this.material);
      m.castShadow = true;
      group.add(m);
      this.meshes.push(m);
    };
    add(this.legL, geo.leg);
    add(this.legR, geo.leg.clone());
    add(this.torso, geo.torso);
    add(this.head, geo.head);
    add(this.eyes, geo.eyes);
    add(this.armL, geo.arm);
    add(this.armR, geo.arm.clone());
    add(this.backpack, geo.backpack);
    const female = this.appearance.gender === 'female';
    const sx = female ? 0.3 : 0.34;
    this.armL.position.set(-sx, 0.6, 0);
    this.armR.position.set(sx, 0.6, 0);
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
    this.material.colorWrite = !on;
    this.material.depthWrite = !on;
    if (this.heldMesh) this.heldMesh.visible = !on && !this.hideHeld;
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

    // göz kırpma
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) this.blinkTimer = 2 + Math.random() * 4;
    this.eyes.scale.y = this.blinkTimer < 0.12 || state.sleeping ? 0.12 : 1;
  }

  /** Meşale alevinin dünya konumu (ışık için). */
  getFlameWorldPosition(target) {
    return this.flame.getWorldPosition(target);
  }
}

import * as THREE from 'three';
import { part, merge, buildHeldGeometry, buildBuildingGeometry } from './Models.js';

// Her eşyanın düşük poligonlu 3B modeli. Aynı model hem envanter ikonu olarak
// (ui/ItemIcons.js bir kez çizip resme çevirir) hem de oyuncunun elinde gösterilir.
// Aletler/silahlar Models.js'deki "eldeki alet" modellerini kullanır (kabza orijinde, +Y yönünde).

const box = (w, h, d, color, o = {}) => part(new THREE.BoxGeometry(w, h, d), color, o);
const cyl = (rt, rb, h, color, o = {}, seg = 7) => part(new THREE.CylinderGeometry(rt, rb, h, seg), color, o);
const ball = (r, color, o = {}, detail = 1) => part(new THREE.IcosahedronGeometry(r, detail), color, o);
const cone = (r, h, color, o = {}, seg = 6) => part(new THREE.ConeGeometry(r, h, seg), color, o);
const oct = (r, color, o = {}) => part(new THREE.OctahedronGeometry(r, 0), color, o);
const torus = (r, t, color, o = {}, rs = 5, ts = 14) => part(new THREE.TorusGeometry(r, t, rs, ts), color, o);
const H = Math.PI / 2;

// ── Ortak parçalar ──────────────────────────────────────────
/** X ekseni boyunca yatan kütük (kabuk + açık renkli kesik uçlar). */
function logX(x, y, z, len, r, seed) {
  return [
    cyl(r, r * 1.04, len, '#7d5130', { x, y, z, rz: H, seed, jitter: r * 0.07, shade: 0.07 }, 8),
    cyl(r * 0.9, r * 0.9, 0.014, '#e0b97f', { x: x + len / 2, y, z, rz: H, seed: seed + 1 }, 8),
    cyl(r * 0.9, r * 0.9, 0.014, '#e0b97f', { x: x - len / 2, y, z, rz: H, seed: seed + 2 }, 8),
    cyl(r * 0.45, r * 0.45, 0.016, '#c49559', { x: x + len / 2, y, z, rz: H, seed: seed + 3 }, 6),
    cyl(r * 0.45, r * 0.45, 0.016, '#c49559', { x: x - len / 2, y, z, rz: H, seed: seed + 4 }, 6),
  ];
}

function rockChunk(r, color, seed, o = {}) {
  return ball(r, color, { jitter: r * 0.22, seed, shade: 0.08, ...o }, 0);
}

/** Cevherli kaya: gri gövde + renkli damar parçacıkları. */
function oreChunk(base, specks, seed) {
  const parts = [rockChunk(0.17, base, seed, { sy: 0.8 }), rockChunk(0.11, base, seed + 1, { x: 0.15, y: -0.03, z: 0.05 })];
  const pts = [[0.12, 0.08, 0.07], [-0.08, 0.1, 0.1], [0.02, 0.13, -0.09], [0.16, 0.03, 0.12], [-0.13, 0.02, -0.06], [0.06, -0.02, 0.16]];
  pts.forEach(([x, y, z], i) => parts.push(oct(0.035 + (i % 2) * 0.012, specks[i % specks.length], { x, y, z, seed: seed + 10 + i })));
  return merge(parts);
}

/** Üst köşeleri içe çekilmiş külçe. */
function ingot(color, light, seed) {
  const g = new THREE.BoxGeometry(0.34, 0.11, 0.16);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) {
      pos.setX(i, pos.getX(i) * 0.78);
      pos.setZ(i, pos.getZ(i) * 0.7);
    }
  }
  return [
    part(g, color, { seed, shade: 0.04 }),
    box(0.2, 0.012, 0.06, light, { y: 0.058, seed: seed + 1 }),
  ];
}

function crystalCluster(color, tip, seed, base = '#6d6f74') {
  return [
    rockChunk(0.13, base, seed, { sy: 0.45, y: -0.04 }),
    oct(0.07, color, { sy: 2.6, y: 0.13, seed: seed + 1 }),
    oct(0.05, color, { sy: 2.2, x: 0.08, y: 0.08, rz: -0.45, seed: seed + 2 }),
    oct(0.05, tip, { sy: 2.0, x: -0.07, y: 0.07, z: 0.03, rz: 0.5, seed: seed + 3 }),
    oct(0.035, tip, { sy: 1.8, z: 0.08, y: 0.05, rx: 0.5, seed: seed + 4 }),
  ];
}

function scroll(seal, seed) {
  return merge([
    cyl(0.055, 0.055, 0.38, '#ead9ab', { rz: H, seed, shade: 0.03 }, 10),
    cyl(0.064, 0.064, 0.03, '#8a5a34', { x: 0.2, rz: H, seed: seed + 1 }, 8),
    cyl(0.064, 0.064, 0.03, '#8a5a34', { x: -0.2, rz: H, seed: seed + 2 }, 8),
    box(0.03, 0.124, 0.124, '#b0332e', { seed: seed + 3 }),
    cyl(0.04, 0.04, 0.02, seal, { z: 0.065, rx: H, seed: seed + 4 }, 8),
    box(0.16, 0.002, 0.1, '#e2cd98', { y: -0.04, z: 0.07, rx: -0.4, seed: seed + 5 }),
  ]);
}

function backpack(color, strap, seed) {
  return merge([
    box(0.3, 0.36, 0.16, color, { seed, shade: 0.05 }),
    box(0.31, 0.12, 0.17, strap, { y: 0.14, z: 0.005, seed: seed + 1 }),
    box(0.2, 0.12, 0.05, color, { y: -0.06, z: 0.1, seed: seed + 2 }),
    box(0.04, 0.34, 0.03, strap, { x: -0.08, z: -0.09, seed: seed + 3 }),
    box(0.04, 0.34, 0.03, strap, { x: 0.08, z: -0.09, seed: seed + 4 }),
    torus(0.05, 0.012, strap, { y: 0.22, seed: seed + 5 }),
  ]);
}

/** Göğüs zırhı: gövde, omuzluklar, plakalar. */
function armor(main, trim, plate, seed) {
  return merge([
    box(0.4, 0.42, 0.2, main, { seed, shade: 0.05 }),
    box(0.16, 0.08, 0.22, trim, { x: -0.25, y: 0.17, rz: 0.35, seed: seed + 1 }),
    box(0.16, 0.08, 0.22, trim, { x: 0.25, y: 0.17, rz: -0.35, seed: seed + 2 }),
    box(0.3, 0.08, 0.04, plate, { y: 0.08, z: 0.11, seed: seed + 3 }),
    box(0.28, 0.08, 0.04, plate, { y: -0.03, z: 0.11, seed: seed + 4 }),
    box(0.24, 0.08, 0.04, plate, { y: -0.14, z: 0.11, seed: seed + 5 }),
    box(0.14, 0.06, 0.22, trim, { y: 0.21, seed: seed + 6 }),
  ]);
}

function sigil(face, rim, emblem, seed, emblemParts) {
  return merge([
    cyl(0.2, 0.2, 0.05, face, { rx: H, seed, shade: 0.04 }, 12),
    torus(0.2, 0.025, rim, { seed: seed + 1 }, 5, 16),
    ...emblemParts.map((p, i) => box(p[0], p[1], 0.03, emblem, { x: p[2], y: p[3], z: 0.03, rz: p[4] ?? 0, seed: seed + 2 + i })),
  ]);
}

// ── Model tablosu ───────────────────────────────────────────
//   geo   : ikon ve eldeki modelin geometrisi
//   held  : elde farklı görünecekse ayrı geometri (ör. odun demeti yerine tek kütük)
//   tool  : Models.js'deki eldeki alet anahtarı (geometri oradan gelir)
//   icon  : ikon çekim açısı [x, y, z] (radyan) — yoksa türe göre varsayılan
//   size  : eldeki boyut (m, en uzun kenar)
const MODELS = {
  wood: {
    geo: () => merge([...logX(0, 0, 0.115, 0.62, 0.11, 10), ...logX(0.03, 0, -0.115, 0.6, 0.105, 20), ...logX(-0.02, 0.19, 0, 0.64, 0.11, 30)]),
    held: () => merge(logX(0, 0, 0, 0.6, 0.11, 10)),
    size: 0.42,
  },
  stone: {
    geo: () => merge([rockChunk(0.17, '#8f8b84', 40, { sy: 0.75 }), rockChunk(0.1, '#a19d95', 41, { x: 0.17, y: -0.04, z: 0.06 }), rockChunk(0.08, '#7c7871', 42, { x: -0.14, y: -0.05, z: 0.1 })]),
    size: 0.22,
  },
  fiber: {
    geo: () => {
      const parts = [];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9 - 0.5) * 0.7;
        parts.push(box(0.022, 0.55, 0.012, i % 2 ? '#a9c55a' : '#8fb24a', { rz: a, x: Math.sin(a) * 0.16, y: 0.02, z: (i % 3 - 1) * 0.02, seed: 50 + i }));
      }
      parts.push(torus(0.05, 0.018, '#c9a35e', { y: -0.06, rx: H, seed: 60 }));
      return merge(parts);
    },
    size: 0.36,
  },
  vine: {
    geo: () => merge([
      torus(0.16, 0.03, '#3f7d2c', { rx: H * 0.8, seed: 70 }, 5, 16),
      torus(0.12, 0.026, '#4b8f34', { rx: H * 0.8, y: 0.05, rz: 0.4, seed: 71 }, 5, 14),
      ...[[0.14, 0.05, 0.08], [-0.15, 0.02, 0.04], [0.02, 0.1, -0.13], [-0.05, 0.06, 0.15]].map(([x, y, z], i) => oct(0.06, i % 2 ? '#5aa33c' : '#6fb847', { x, y, z, sy: 0.25, sx: 1.4, ry: i, seed: 72 + i })),
    ]),
    size: 0.3,
  },
  rope: {
    geo: () => merge([
      torus(0.15, 0.035, '#c9a46a', { rx: H, seed: 80 }, 6, 18),
      torus(0.15, 0.035, '#b8925a', { rx: H, y: 0.06, seed: 81 }, 6, 18),
      torus(0.15, 0.035, '#c9a46a', { rx: H, y: 0.12, seed: 82 }, 6, 18),
      cyl(0.03, 0.03, 0.22, '#b8925a', { x: 0.2, y: 0.02, z: 0.08, rz: 0.9, seed: 83 }, 6),
    ]),
    size: 0.3,
  },
  hide: {
    geo: () => merge([
      box(0.46, 0.035, 0.36, '#8b5a3c', { jitter: 0.03, seed: 90, shade: 0.06 }),
      box(0.36, 0.04, 0.26, '#a8714c', { y: 0.006, jitter: 0.02, seed: 91 }),
      box(0.12, 0.03, 0.1, '#7a4c31', { x: 0.24, z: 0.16, ry: 0.5, seed: 92 }),
      box(0.12, 0.03, 0.1, '#7a4c31', { x: -0.24, z: -0.16, ry: 0.5, seed: 93 }),
    ]),
    icon: [0.75, -0.5, 0],
    size: 0.36,
  },
  wool: {
    geo: () => merge([[0, 0, 0, 0.14], [0.13, -0.02, 0.04, 0.1], [-0.12, -0.01, 0.05, 0.11], [0.03, 0.09, -0.04, 0.1], [-0.04, -0.03, -0.11, 0.09]]
      .map(([x, y, z, r], i) => ball(r, i % 2 ? '#efe9dc' : '#f7f3ea', { x, y, z, jitter: 0.015, seed: 100 + i, shade: 0.04 }, 1))),
    size: 0.28,
  },
  feather: {
    geo: () => merge([
      cyl(0.008, 0.012, 0.5, '#e7dfcf', { seed: 110 }, 5),
      cone(0.07, 0.38, '#f6f2ea', { y: 0.06, sz: 0.18, seed: 111 }, 8),
      cone(0.05, 0.14, '#9a948a', { y: 0.27, sz: 0.2, seed: 112 }, 8),
    ]),
    icon: [0.2, 0.5, -0.75],
    size: 0.32,
  },
  wool_blanket: {
    geo: () => merge([
      box(0.46, 0.07, 0.32, '#c0473a', { seed: 120, shade: 0.03 }),
      box(0.46, 0.07, 0.32, '#e8dcc4', { y: 0.075, seed: 121, shade: 0.03 }),
      box(0.46, 0.07, 0.32, '#c0473a', { y: 0.15, seed: 122, shade: 0.03 }),
      box(0.47, 0.075, 0.04, '#3f5f9a', { y: 0.075, z: 0.1, seed: 123 }),
      box(0.47, 0.075, 0.04, '#3f5f9a', { y: 0.075, z: -0.1, seed: 124 }),
    ]),
    size: 0.32,
  },
  coal: {
    geo: () => merge([rockChunk(0.14, '#2c2b2e', 130, { sy: 0.8 }), rockChunk(0.1, '#3a383c', 131, { x: 0.15, y: -0.03, z: 0.04 }), rockChunk(0.08, '#242326', 132, { x: -0.12, y: -0.04, z: 0.09 })]),
    size: 0.2,
  },
  iron_ore: { geo: () => oreChunk('#7c746c', ['#c4733a', '#d8dde3', '#a85e2c'], 140), size: 0.22 },
  crystal: { geo: () => merge(crystalCluster('#6fe3ff', '#bdf4ff', 150)), size: 0.24 },
  berries: {
    geo: () => merge([
      ...[[0, 0, 0], [0.08, 0.01, 0.04], [-0.07, 0.015, 0.05], [0.03, 0.02, -0.08], [-0.04, 0.08, -0.01], [0.05, 0.08, 0.03], [-0.09, 0.0, -0.06]]
        .map(([x, y, z], i) => ball(0.052, i % 3 === 0 ? '#5a4fd1' : i % 3 === 1 ? '#3d4fb8' : '#6b4fc9', { x, y, z, seed: 160 + i }, 1)),
      oct(0.07, '#4f9a3a', { y: 0.12, x: 0.03, sy: 0.25, sx: 1.6, rz: 0.3, seed: 168 }),
    ]),
    size: 0.2,
  },
  coconut: {
    geo: () => merge([
      ball(0.15, '#6b4a2b', { jitter: 0.012, seed: 170, shade: 0.06 }, 1),
      ...[[0.06, 0.1, 0.08], [-0.05, 0.12, 0.06], [0.0, 0.14, -0.06]].map(([x, y, z], i) => box(0.012, 0.06, 0.012, '#9a7a52', { x, y, z, rz: i - 1, seed: 171 + i })),
      cyl(0.022, 0.022, 0.01, '#2b1c10', { y: 0.09, z: 0.12, rx: 1.0, seed: 175 }, 6),
      cyl(0.022, 0.022, 0.01, '#2b1c10', { x: 0.05, y: 0.11, z: 0.09, rx: 1.0, seed: 176 }, 6),
    ]),
    size: 0.24,
  },
  raw_fish: {
    geo: () => merge([
      ball(0.1, '#8fa8bc', { sx: 0.7, sz: 2.4, seed: 180, shade: 0.03 }, 1),
      ball(0.08, '#dfe8ee', { sx: 0.65, sz: 2.0, y: -0.035, seed: 181 }, 1),
      cone(0.1, 0.14, '#7d94a8', { z: -0.29, rx: H, sx: 0.25, seed: 182 }, 4),
      cone(0.05, 0.1, '#7d94a8', { y: 0.08, z: 0.02, sz: 0.25, seed: 183 }, 4),
      box(0.03, 0.03, 0.02, '#1b1b1b', { x: 0.06, y: 0.025, z: 0.18, seed: 184 }),
      box(0.03, 0.03, 0.02, '#1b1b1b', { x: -0.06, y: 0.025, z: 0.18, seed: 185 }),
    ]),
    icon: [0.35, -1.0, 0],
    size: 0.34,
  },
  cooked_fish: {
    geo: () => merge([
      ball(0.1, '#c9873e', { sx: 0.7, sz: 2.4, seed: 190, shade: 0.05 }, 1),
      cone(0.1, 0.14, '#a8672d', { z: -0.29, rx: H, sx: 0.25, seed: 191 }, 4),
      box(0.15, 0.012, 0.02, '#5a3418', { y: 0.05, z: 0.08, seed: 192 }),
      box(0.15, 0.012, 0.02, '#5a3418', { y: 0.05, z: -0.02, seed: 193 }),
      box(0.15, 0.012, 0.02, '#5a3418', { y: 0.05, z: -0.12, seed: 194 }),
      cyl(0.012, 0.012, 0.75, '#b08654', { rx: H, seed: 195 }, 5),
    ]),
    icon: [0.4, -1.0, 0],
    size: 0.4,
  },
  berry_skewer: {
    geo: () => merge([
      cyl(0.012, 0.012, 0.55, '#b08654', { seed: 200 }, 5),
      ...[0.12, 0.04, -0.04, 0.2].map((y, i) => ball(0.045, i % 2 ? '#6b3fa0' : '#b8323f', { y, seed: 201 + i }, 1)),
    ]),
    icon: [0.2, 0.4, -0.75],
    size: 0.36,
  },
  raw_meat: {
    geo: () => merge([
      cyl(0.17, 0.17, 0.06, '#f0d4c2', { sx: 1.25, seed: 210 }, 9),
      cyl(0.15, 0.15, 0.065, '#c64545', { sx: 1.25, x: 0.01, seed: 211, jitter: 0.008, shade: 0.05 }, 9),
      box(0.12, 0.068, 0.02, '#e9a3a0', { x: -0.02, z: 0.03, ry: 0.5, seed: 212 }),
      cyl(0.03, 0.03, 0.07, '#f2ebdc', { x: 0.08, z: -0.05, seed: 213 }, 7),
    ]),
    icon: [0.85, -0.4, 0],
    size: 0.3,
  },
  cooked_meat: {
    geo: () => merge([
      ball(0.13, '#8a4b26', { sy: 0.9, sz: 1.3, z: 0.06, seed: 220, jitter: 0.012, shade: 0.06 }, 1),
      ball(0.1, '#a35a2e', { sy: 0.8, sz: 1.1, z: 0.08, y: 0.03, seed: 221 }, 1),
      cyl(0.03, 0.03, 0.18, '#efe6d2', { z: -0.14, rx: H, seed: 222 }, 6),
      ball(0.035, '#f6efe0', { z: -0.24, x: 0.025, seed: 223 }, 0),
      ball(0.035, '#f6efe0', { z: -0.24, x: -0.025, seed: 224 }, 0),
    ]),
    icon: [0.4, -0.9, 0.2],
    size: 0.32,
  },
  cave_mushroom: {
    geo: () => merge([
      cyl(0.03, 0.04, 0.16, '#efe7da', { y: -0.04, seed: 230 }, 6),
      cone(0.13, 0.1, '#46d9c4', { y: 0.07, seed: 231 }, 8),
      ...[[0.05, 0.08, 0.06], [-0.06, 0.08, 0.03], [0.0, 0.1, -0.06]].map(([x, y, z], i) => ball(0.016, '#d6fff6', { x, y, z, seed: 232 + i }, 0)),
      cyl(0.02, 0.025, 0.1, '#efe7da', { x: 0.1, y: -0.07, seed: 236 }, 6),
      cone(0.07, 0.06, '#5fe3d0', { x: 0.1, y: -0.0, seed: 237 }, 7),
    ]),
    size: 0.22,
  },
  bandage: {
    geo: () => merge([
      cyl(0.09, 0.09, 0.12, '#efe6d6', { rz: H, seed: 240, shade: 0.03 }, 10),
      cyl(0.035, 0.035, 0.125, '#c9bda6', { rz: H, seed: 241 }, 8),
      box(0.11, 0.004, 0.2, '#e8dfcc', { y: -0.09, z: 0.1, rx: 0.2, seed: 242 }),
    ]),
    size: 0.2,
  },
  rune_shard: {
    geo: () => merge([
      oct(0.12, '#7d8f99', { sy: 1.7, rz: 0.2, seed: 250, jitter: 0.01 }),
      box(0.012, 0.16, 0.012, '#7ff3ff', { z: 0.07, y: 0.01, rz: 0.2, seed: 251 }),
      box(0.08, 0.012, 0.012, '#7ff3ff', { z: 0.07, y: 0.04, rz: 0.2, seed: 252 }),
    ]),
    size: 0.24,
  },
  // aletler (Models.js'deki eldeki modeller)
  stone_axe: { tool: 'axe' },
  stone_pickaxe: { tool: 'pickaxe' },
  torch: { tool: 'torch' },
  stone_knife: { tool: 'knife' },
  stone_spear: { tool: 'spear' },
  fishing_rod: { tool: 'rod' },
  copper_scimitar: { tool: 'scimitar' },
  copper_pickaxe: { tool: 'copper_pickaxe' },
  frost_sword: { tool: 'ice_sword' },
  obsidian_blade: { tool: 'obsidian_sword' },
  raft: { geo: () => buildBuildingGeometry('raft'), icon: [0.6, -0.7, 0], noHold: true },
  boat: { geo: () => buildBuildingGeometry('boat'), icon: [0.45, -0.8, 0], noHold: true },
  // sırt çantaları (tarif ikonları)
  fiber_backpack: { geo: () => backpack('#b39a62', '#7a6440', 260), icon: [0.25, -0.5, 0] },
  woven_backpack: { geo: () => backpack('#8a6a44', '#5a3f26', 270), icon: [0.25, -0.5, 0] },

  // ── Ana ada: koruyucu ───────────────────────────────────────
  forest_heart: {
    geo: () => merge([
      ball(0.13, '#7be35a', { seed: 300 }, 1),
      ball(0.08, '#c8ff9a', { y: 0.03, z: 0.07, seed: 301 }, 1),
      torus(0.14, 0.02, '#6b4a2b', { rx: 1.2, seed: 302 }, 5, 14),
      torus(0.14, 0.02, '#5a3d22', { rx: 0.3, ry: 1.0, seed: 303 }, 5, 14),
      oct(0.07, '#4f9a3a', { y: 0.16, x: 0.05, sy: 0.25, sx: 1.5, rz: 0.4, seed: 304 }),
      oct(0.06, '#5aa33c', { y: 0.15, x: -0.06, sy: 0.25, sx: 1.5, rz: -0.5, seed: 305 }),
    ]),
    size: 0.24,
  },
  chart_desert: { geo: () => scroll('#e39b3c', 310), icon: [0.5, -0.5, 0.15], size: 0.36 },
  chart_ice: { geo: () => scroll('#6ec8f0', 320), icon: [0.5, -0.5, 0.15], size: 0.36 },
  chart_volcano: { geo: () => scroll('#e0452b', 330), icon: [0.5, -0.5, 0.15], size: 0.36 },

  // ── Çöl ───────────────────────────────────────────────────
  cactus_fruit: {
    geo: () => merge([
      ball(0.11, '#d6336c', { sy: 1.25, seed: 400, shade: 0.04 }, 1),
      ...[[0.06, 0.06, 0.08], [-0.08, 0.02, 0.06], [0.05, -0.05, -0.09], [-0.03, 0.1, -0.06], [0.1, -0.02, 0]].map(([x, y, z], i) => ball(0.012, '#f6d36b', { x, y, z, seed: 401 + i }, 0)),
      cone(0.05, 0.05, '#5c9a3a', { y: 0.15, seed: 407 }, 6),
    ]),
    size: 0.2,
  },
  sandstone: {
    geo: () => merge([
      box(0.32, 0.08, 0.24, '#e2b47a', { y: -0.08, jitter: 0.01, seed: 410 }),
      box(0.32, 0.08, 0.24, '#cf9a62', { jitter: 0.01, seed: 411 }),
      box(0.3, 0.08, 0.22, '#e8c28c', { y: 0.08, jitter: 0.01, seed: 412 }),
    ]),
    size: 0.24,
  },
  copper_ore: { geo: () => oreChunk('#8d7a68', ['#d27a3b', '#3fbf9f', '#e39b55'], 420), size: 0.22 },
  copper_ingot: { geo: () => merge(ingot('#d97b3a', '#f2a66b', 430)), icon: [0.6, -0.6, 0], size: 0.26 },
  stinger: {
    geo: () => merge([
      cone(0.06, 0.12, '#5b3a29', { y: 0, seed: 440 }, 6),
      cone(0.045, 0.12, '#6e4733', { y: 0.1, x: 0.02, rz: -0.35, seed: 441 }, 6),
      cone(0.03, 0.14, '#e8d26b', { y: 0.2, x: 0.07, rz: -0.8, seed: 442 }, 6),
      ball(0.05, '#4a2f20', { y: -0.07, seed: 443 }, 0),
    ]),
    size: 0.24,
  },
  chitin: {
    geo: () => {
      const g = new THREE.CylinderGeometry(0.18, 0.18, 0.26, 10, 1, true, 0, Math.PI);
      return merge([
        part(g, '#4a3a2e', { rz: H, seed: 450, shade: 0.06 }),
        box(0.27, 0.015, 0.03, '#8a6a4a', { y: 0.17, seed: 451 }),
        box(0.27, 0.015, 0.03, '#6a4f38', { y: 0.12, z: 0.11, rx: 0.7, seed: 452 }),
      ]);
    },
    icon: [0.4, -0.4, 0],
    size: 0.26,
  },
  bone: {
    geo: () => merge([
      cyl(0.03, 0.03, 0.4, '#efe6d2', { rz: H, seed: 460 }, 6),
      ball(0.045, '#f6efe0', { x: 0.21, z: 0.03, seed: 461 }, 0),
      ball(0.045, '#f6efe0', { x: 0.21, z: -0.03, seed: 462 }, 0),
      ball(0.045, '#f6efe0', { x: -0.21, z: 0.03, seed: 463 }, 0),
      ball(0.045, '#f6efe0', { x: -0.21, z: -0.03, seed: 464 }, 0),
    ]),
    icon: [0.6, -0.6, 0.4],
    size: 0.34,
  },
  chitin_armor: { geo: () => armor('#4a3a2e', '#7a5a3e', '#6a4f38', 470), icon: [0.15, -0.45, 0], size: 0.34 },
  scorpion_sigil: {
    geo: () => sigil('#d9a86c', '#d27a3b', '#5b3a29', 480, [
      [0.12, 0.06, 0, 0], [0.04, 0.12, -0.08, 0.06, 0.4], [0.04, 0.1, -0.1, 0.13, -0.3], [0.05, 0.05, 0.09, 0.03, 0.6], [0.05, 0.05, 0.09, -0.03, -0.6],
      [0.08, 0.02, 0.0, -0.05, 0], [0.08, 0.02, 0.0, 0.05, 0],
    ]),
    icon: [0.1, -0.4, 0],
    size: 0.3,
  },

  // ── Buz ───────────────────────────────────────────────────
  frost_berries: {
    geo: () => merge([
      ...[[0, 0, 0], [0.07, 0.01, 0.04], [-0.07, 0.01, 0.04], [0.02, 0.02, -0.07], [-0.03, 0.07, 0], [0.05, 0.07, 0.02]]
        .map(([x, y, z], i) => ball(0.048, i % 2 ? '#9ad8ff' : '#d9f2ff', { x, y, z, seed: 500 + i }, 1)),
      oct(0.06, '#5f8f7a', { y: 0.11, sy: 0.25, sx: 1.6, rz: 0.3, seed: 507 }),
    ]),
    size: 0.2,
  },
  ice_crystal: { geo: () => merge(crystalCluster('#bfeaff', '#ffffff', 510, '#8aa2b4')), size: 0.24 },
  fur: {
    geo: () => merge([
      box(0.46, 0.05, 0.36, '#cfd4da', { jitter: 0.035, seed: 520, shade: 0.06 }),
      box(0.4, 0.055, 0.08, '#8e959e', { y: 0.006, z: 0.05, jitter: 0.02, seed: 521 }),
      box(0.4, 0.055, 0.06, '#9aa1aa', { y: 0.006, z: -0.09, jitter: 0.02, seed: 522 }),
      cone(0.06, 0.16, '#b9c0c8', { x: 0.27, rz: -H, seed: 523 }, 5),
    ]),
    icon: [0.75, -0.5, 0],
    size: 0.38,
  },
  fang: {
    geo: () => merge([
      cone(0.05, 0.22, '#f3ecd8', { seed: 530 }, 6),
      cone(0.035, 0.16, '#e8dfc6', { x: 0.08, y: -0.02, rz: -0.25, seed: 531 }, 6),
      torus(0.045, 0.01, '#6b4a2b', { y: -0.1, rx: H, seed: 532 }, 4, 10),
    ]),
    icon: [0.2, 0.3, 0.3],
    size: 0.22,
  },
  frost_core: {
    geo: () => merge([
      ball(0.1, '#7fdcff', { seed: 540 }, 1),
      ...[[0, 0.14, 0, 0], [0.12, -0.06, 0.03, -2.0], [-0.12, -0.05, -0.02, 2.0], [0.02, -0.05, 0.13, 0]].map(([x, y, z, rz], i) => oct(0.05, '#e6f9ff', { x, y, z, rz, sy: 2.2, seed: 541 + i })),
    ]),
    size: 0.22,
  },
  iron_ingot: { geo: () => merge(ingot('#aab1ba', '#dfe4ea', 550)), icon: [0.6, -0.6, 0], size: 0.26 },
  fur_coat: {
    geo: () => merge([
      box(0.42, 0.46, 0.22, '#9aa1aa', { seed: 560, shade: 0.06, jitter: 0.01 }),
      box(0.46, 0.1, 0.26, '#e6e9ec', { y: 0.2, jitter: 0.02, seed: 561 }),
      box(0.12, 0.36, 0.2, '#8e959e', { x: -0.27, y: 0.02, rz: 0.12, seed: 562 }),
      box(0.12, 0.36, 0.2, '#8e959e', { x: 0.27, y: 0.02, rz: -0.12, seed: 563 }),
      box(0.04, 0.4, 0.02, '#5a4632', { z: 0.115, seed: 564 }),
    ]),
    icon: [0.15, -0.45, 0],
    size: 0.36,
  },
  frost_heart: {
    geo: () => merge([
      ball(0.09, '#8fe3ff', { x: -0.06, y: 0.05, seed: 570 }, 1),
      ball(0.09, '#8fe3ff', { x: 0.06, y: 0.05, seed: 571 }, 1),
      cone(0.14, 0.18, '#7fd6f5', { y: -0.08, rz: Math.PI, seed: 572 }, 8),
      oct(0.04, '#ffffff', { y: 0.06, z: 0.08, sy: 1.6, seed: 573 }),
    ]),
    size: 0.22,
  },

  // ── Volkan ────────────────────────────────────────────────
  obsidian: {
    geo: () => merge([
      oct(0.13, '#1c1726', { sy: 1.4, rz: 0.3, seed: 600, jitter: 0.015, shade: 0.12 }),
      oct(0.09, '#2a2236', { x: 0.13, y: -0.04, sy: 1.2, rz: -0.6, seed: 601 }),
      oct(0.07, '#4b3a66', { x: -0.1, y: -0.05, z: 0.06, sy: 1.3, seed: 602 }),
    ]),
    size: 0.24,
  },
  sulfur: {
    geo: () => merge([
      rockChunk(0.12, '#e8d23a', 610, { sy: 0.7 }),
      rockChunk(0.09, '#f2e05a', 611, { x: 0.12, y: -0.02, z: 0.04 }),
      rockChunk(0.07, '#d4bd2a', 612, { x: -0.1, y: -0.03, z: 0.07 }),
    ]),
    size: 0.2,
  },
  magma_core: {
    geo: () => merge([
      ball(0.1, '#ff8a2a', { seed: 620 }, 1),
      ...[[0.08, 0.05, 0.03], [-0.07, 0.06, -0.04], [0.02, -0.08, 0.06], [-0.04, -0.03, 0.09], [0.06, -0.02, -0.08]].map(([x, y, z], i) => rockChunk(0.06, '#2b1f1c', 621 + i, { x, y, z, sy: 0.6 })),
    ]),
    size: 0.22,
  },
  fire_scale: {
    geo: () => merge([0, 1, 2].map((i) => cone(0.1, 0.03, i === 1 ? '#f06a2a' : '#d9452b', { x: (i - 1) * 0.1, y: Math.abs(i - 1) * -0.015, z: Math.abs(i - 1) * 0.03, sz: 1.3, seed: 630 + i }, 6))),
    icon: [0.85, -0.3, 0],
    size: 0.26,
  },
  ember_armor: { geo: () => armor('#2a2236', '#d9452b', '#f06a2a', 640), icon: [0.15, -0.45, 0], size: 0.34 },
  fire_sigil: {
    geo: () => sigil('#2a2236', '#d9452b', '#ff8a2a', 650, [
      [0.06, 0.18, 0, 0.0], [0.05, 0.12, -0.06, -0.02, 0.4], [0.05, 0.12, 0.06, -0.02, -0.4], [0.04, 0.08, -0.1, -0.05, 0.7], [0.04, 0.08, 0.1, -0.05, -0.7],
    ]),
    icon: [0.1, -0.4, 0],
    size: 0.3,
  },
  lava_heart: {
    geo: () => merge([
      ball(0.09, '#ff5a1f', { x: -0.06, y: 0.05, seed: 660 }, 1),
      ball(0.09, '#ff5a1f', { x: 0.06, y: 0.05, seed: 661 }, 1),
      cone(0.14, 0.18, '#e0451b', { y: -0.08, rz: Math.PI, seed: 662 }, 8),
      ball(0.05, '#ffd166', { y: 0.05, z: 0.07, seed: 663 }, 0),
    ]),
    size: 0.22,
  },
};

const DEFAULT_ICON = [0.55, -0.7, 0];
const TOOL_ICON = [0.15, 0.55, -0.82];
const geoCache = new Map();

export function hasItemModel(id) {
  return !!MODELS[id];
}

/** Envanter ikonu için geometri ve çekim açısı. */
export function itemIconSpec(id) {
  const m = MODELS[id];
  if (!m) return null;
  const key = `icon:${id}`;
  if (!geoCache.has(key)) geoCache.set(key, m.tool ? buildHeldGeometry(m.tool) : m.geo());
  return { geometry: geoCache.get(key), rotation: m.icon ?? (m.tool ? TOOL_ICON : DEFAULT_ICON), glow: m.tool === 'torch' };
}

/** Elde taşınabilir mi (taşıtlar elde gösterilmez). */
export function isHoldable(id) {
  const m = MODELS[id];
  return !!m && !m.noHold;
}

/**
 * Eldeki model: aletler için alet anahtarı, diğer eşyalar için 'item:<id>'.
 * Eşyalar avucun içine sığacak şekilde ölçeklenip ortalanır.
 */
export function heldGeometry(key) {
  if (!key) return null;
  if (!key.startsWith('item:')) return buildHeldGeometry(key);
  const id = key.slice(5);
  const m = MODELS[id];
  if (!m || m.noHold) return null;
  if (m.tool) return buildHeldGeometry(m.tool);
  const cacheKey = `held:${id}`;
  if (geoCache.has(cacheKey)) return geoCache.get(cacheKey);
  const g = (m.held ?? m.geo)().clone();
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const size = new THREE.Vector3();
  bb.getSize(size);
  const center = new THREE.Vector3();
  bb.getCenter(center);
  const s = (m.size ?? 0.28) / Math.max(size.x, size.y, size.z, 1e-3);
  g.translate(-center.x, -center.y, -center.z);
  g.scale(s, s, s);
  g.computeBoundingSphere();
  geoCache.set(cacheKey, g);
  return g;
}

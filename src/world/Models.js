import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, randRange } from '../utils/math.js';

// Tüm modeller prosedürel, düşük poligonlu ve köşe renkli (vertex color) üretilir.
// Her model tek bir BufferGeometry'ye birleştirilir → tek malzeme, tek çizim çağrısı,
// InstancedMesh ile yüzlerce kopya neredeyse bedava.

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

function jitterPositions(g, amount, seed) {
  const pos = g.attributes.position;
  const rng = mulberry32(seed);
  const map = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
    let o = map.get(key);
    if (!o) {
      o = [(rng() - 0.5) * 2 * amount, (rng() - 0.5) * 2 * amount, (rng() - 0.5) * 2 * amount];
      map.set(key, o);
    }
    pos.setXYZ(i, pos.getX(i) + o[0], pos.getY(i) + o[1], pos.getZ(i) + o[2]);
  }
}

function paint(g, color, shade, seed) {
  const count = g.attributes.position.count;
  const colors = new Float32Array(count * 3);
  _c.set(color);
  const rng = mulberry32(seed * 7 + 3);
  for (let i = 0; i < count; i += 3) {
    const f = shade ? 1 + (rng() - 0.5) * 2 * shade : 1;
    for (let k = 0; k < 3 && i + k < count; k++) {
      colors[(i + k) * 3] = _c.r * f;
      colors[(i + k) * 3 + 1] = _c.g * f;
      colors[(i + k) * 3 + 2] = _c.b * f;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/** Geometriyi dönüştürür, renklendirir ve birleştirmeye hazır hale getirir. */
export function part(geometry, color, opts = {}) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  const { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, jitter = 0, seed = 1, shade = 0 } = opts;
  const sx = opts.sx ?? s, sy = opts.sy ?? s, sz = opts.sz ?? s;
  if (jitter) jitterPositions(g, jitter, seed);
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  g.applyMatrix4(_m);
  paint(g, color, shade, seed);
  return g;
}

export function merge(parts) {
  const g = mergeGeometries(parts, false);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** a → b arasında uzanan silindir. */
function beam(a, b, r0, r1, color, radial = 6, opts = {}) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 1);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return part(g, color, opts);
}

/** Palmiye yaprağı: uzunlamasına sarkan, iki taraflı şerit. */
function leafGeometry(length, width, droop, segments = 5, serrated = false) {
  const verts = [];
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const s = i / segments;
    const x = s * length;
    const y = s * 0.45 - droop * s * s * length * 0.5;
    let w = width * Math.sin(Math.PI * (0.12 + 0.88 * s)) * (1 - s * 0.35);
    if (serrated && i > 0 && i < segments && i % 2 === 0) w *= 0.4;
    pts.push({ x, y, w });
  }
  const push = (a, b, c) => verts.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  for (let i = 0; i < segments; i++) {
    const p0 = pts[i], p1 = pts[i + 1];
    const c0 = [p0.x, p0.y + 0.06, 0], c1 = [p1.x, p1.y + 0.06, 0];
    const l0 = [p0.x, p0.y - 0.05, -p0.w], l1 = [p1.x, p1.y - 0.05, -p1.w];
    const r0 = [p0.x, p0.y - 0.05, p0.w], r1 = [p1.x, p1.y - 0.05, p1.w];
    // üst yüz
    push(c0, l0, l1); push(c0, l1, c1);
    push(c0, c1, r1); push(c0, r1, r0);
    // alt yüz (ters sarım)
    push(c0, l1, l0); push(c0, c1, l1);
    push(c0, r1, c1); push(c0, r0, r1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return g;
}


/** Alt kısımları koyulaştıran yükseklik gradyanı (sahte ortam kapatma / AO). */
function heightShade(g, y0, y1, dark = 0.6, light = 1.1) {
  const pos = g.attributes.position;
  const col = g.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - y0) / (y1 - y0)));
    const f = dark + (light - dark) * t;
    col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
  }
  return g;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _n = new THREE.Vector3();
const _tint = new THREE.Color();

/** Yukarı bakan yüzleri verilen renge (yosun, kum…) doğru boyar. */
function tintUpFaces(g, color, threshold = 0.6, amount = 0.85) {
  const pos = g.attributes.position;
  const col = g.attributes.color;
  _tint.set(color);
  for (let i = 0; i + 2 < pos.count; i += 3) {
    _a.set(pos.getX(i + 1) - pos.getX(i), pos.getY(i + 1) - pos.getY(i), pos.getZ(i + 1) - pos.getZ(i));
    _b.set(pos.getX(i + 2) - pos.getX(i), pos.getY(i + 2) - pos.getY(i), pos.getZ(i + 2) - pos.getZ(i));
    _n.crossVectors(_a, _b).normalize();
    if (_n.y < threshold) continue;
    const t = amount * Math.min(1, (_n.y - threshold) / (1 - threshold) + 0.3);
    for (let k = 0; k < 3; k++) {
      const j = i + k;
      col.setXYZ(j, col.getX(j) + (_tint.r - col.getX(j)) * t, col.getY(j) + (_tint.g - col.getY(j)) * t, col.getZ(j) + (_tint.b - col.getZ(j)) * t);
    }
  }
  return g;
}

/** Kenarı aşağı sarkan koni (çam katmanı). Alt kapağın merkezi yerinde kalır → alttan bakınca dal örtüsü gibi görünür. */
function droopCone(r, h, radial, droop) {
  const g = new THREE.ConeGeometry(r, h, radial, 1, false);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < -h / 2 + 0.01 && Math.hypot(pos.getX(i), pos.getZ(i)) > 0.01) pos.setY(i, pos.getY(i) - droop);
  }
  return g;
}

// ─────────────────────────────────────────────────────────────
// Kaynak modelleri
// ─────────────────────────────────────────────────────────────

// lod=true → uzak mesafe için aynı boyutlarda çok düşük poligonlu sürüm (rastgelelik sırası aynı kalır)
function palm(rng, seed, lod = false) {
  const parts = [];
  const height = randRange(rng, 8.5, 11);
  const lean = randRange(rng, 0.45, 0.95);
  const segs = lod ? 3 : 9;
  const pointAt = (t) => new THREE.Vector3(lean * t * t * height * 0.4, t * height, 0);
  for (let i = 0; i < segs; i++) {
    const a = pointAt(i / segs);
    const b = pointAt((i + 1) / segs);
    const r0 = 0.34 - (i / segs) * 0.13;
    const r1 = 0.34 - ((i + 1) / segs) * 0.13;
    parts.push(beam(a, b, r0 * 1.06, r1, i % 2 ? '#9a7a52' : '#836545', lod ? 5 : 7, { seed: seed + i, shade: 0.05 }));
  }
  const top = pointAt(1);
  if (!lod) parts.push(part(new THREE.IcosahedronGeometry(0.42, 0), '#6b5a3a', { x: top.x, y: top.y + 0.05, z: top.z, seed: seed + 60 }));
  const fronds = 10;
  for (let k = 0; k < fronds; k++) {
    const ang = (k / fronds) * Math.PI * 2 + rng() * 0.35;
    const leaf = leafGeometry(randRange(rng, 4.2, 5.4), randRange(rng, 0.7, 0.9), randRange(rng, 1.0, 1.35), lod ? 3 : 7, !lod);
    const p = part(leaf, ['#3f9a39', '#4fae44', '#5bb54b'][k % 3], {
      x: top.x, y: top.y, z: top.z, ry: ang, rz: randRange(rng, -0.05, 0.2), seed: seed + 20 + k, shade: 0.05,
    });
    parts.push(heightShade(p, top.y - 3.5, top.y + 0.6, 0.72, 1.08));
  }
  for (let k = 0; k < 3; k++) {
    const len = randRange(rng, 2.6, 3.2);
    if (lod) continue;
    const leaf = leafGeometry(len, 0.5, 0.35, 5, true);
    parts.push(part(leaf, '#6cc25a', { x: top.x, y: top.y + 0.1, z: top.z, ry: (k / 3) * Math.PI * 2 + 0.6, rz: 0.75, seed: seed + 50 + k }));
  }
  for (let k = 0; k < 5 && !lod; k++) {
    const a = (k / 5) * Math.PI * 2;
    parts.push(part(new THREE.IcosahedronGeometry(0.21, 0), k % 2 ? '#5e4126' : '#4f6b2a', {
      x: top.x + Math.cos(a) * 0.32, y: top.y - 0.35 - (k % 2) * 0.12, z: top.z + Math.sin(a) * 0.32, seed: seed + 40 + k,
    }));
  }
  return merge(parts);
}

function oak(rng, seed, lod = false) {
  const parts = [];
  const trunkH = randRange(rng, 3.6, 4.6);
  const lean = randRange(rng, -0.35, 0.35);
  const bark = '#6e4f36';
  const p0 = new THREE.Vector3(0, -0.2, 0);
  const p1 = new THREE.Vector3(lean * 0.35, trunkH * 0.5, randRange(rng, -0.15, 0.15));
  const p2 = new THREE.Vector3(lean, trunkH, 0);
  parts.push(beam(p0, p1, 0.6, 0.45, bark, lod ? 5 : 8, { seed, shade: 0.07 }));
  parts.push(beam(p1, p2, 0.45, 0.32, bark, lod ? 5 : 8, { seed: seed + 1, shade: 0.07 }));
  // kökler
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng() * 0.5;
    const end = new THREE.Vector3(Math.cos(a) * randRange(rng, 0.9, 1.3), -0.15, Math.sin(a) * randRange(rng, 0.9, 1.3));
    if (lod) continue;
    parts.push(beam(new THREE.Vector3(Math.cos(a) * 0.25, 0.55, Math.sin(a) * 0.25), end, 0.24, 0.07, '#654832', 4, { seed: seed + 5 + i }));
  }
  // dallar ve uçlarındaki yaprak kümeleri
  const greens = ['#4a953b', '#56a544', '#3f8834', '#5fae48', '#4c9a3f'];
  const crownBottom = trunkH + 0.2;
  const crownTop = trunkH + 5.2;
  const leaf = (pos, r, i) => {
    const p = part(new THREE.IcosahedronGeometry(lod ? r * 1.05 : r, lod ? 0 : 1), greens[i % greens.length], {
      x: pos.x, y: pos.y, z: pos.z, sy: 0.78, jitter: lod ? 0 : r * 0.14, seed: seed + 30 + i, shade: 0.06, ry: rng() * 3,
    });
    parts.push(heightShade(p, crownBottom, crownTop, 0.58, 1.14));
  };
  const branches = 4 + Math.floor(rng() * 2);
  for (let i = 0; i < branches; i++) {
    const a = (i / branches) * Math.PI * 2 + rng() * 0.6;
    const from = new THREE.Vector3(p2.x * 0.9, trunkH - 0.6 - rng() * 0.8, 0);
    const len = randRange(rng, 1.8, 2.7);
    const to = new THREE.Vector3(p2.x + Math.cos(a) * len, trunkH + randRange(rng, 0.9, 2.0), Math.sin(a) * len);
    if (!lod) parts.push(beam(from, to, 0.2, 0.09, bark, 4, { seed: seed + 15 + i }));
    leaf(to.clone().add(new THREE.Vector3(0, 0.4, 0)), randRange(rng, 1.6, 2.2), i);
  }
  leaf(new THREE.Vector3(p2.x, trunkH + 2.7, 0), randRange(rng, 2.2, 2.7), 7);
  for (let i = 0; i < 2; i++) {
    const a = rng() * Math.PI * 2;
    leaf(new THREE.Vector3(p2.x + Math.cos(a) * 1.4, trunkH + randRange(rng, 1.6, 3.4), Math.sin(a) * 1.4), randRange(rng, 1.3, 1.8), 10 + i);
  }
  return merge(parts);
}

function pine(rng, seed, lod = false) {
  const parts = [];
  const H = randRange(rng, 11, 14);
  parts.push(beam(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0, H * 0.92, 0), 0.42, 0.08, '#5a412f', lod ? 4 : 7, { seed, shade: 0.06 }));
  const tiers = 7;
  const greens = ['#2e6b3c', '#2a6236', '#347544', '#2d6a3d'];
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const r = 3.4 * (1 - t * 0.86) + randRange(rng, -0.15, 0.15);
    const h = 2.9 * (1 - t * 0.35);
    const y = H * (0.2 + 0.74 * t) + h * 0.2;
    const p = part(droopCone(r, h, lod ? 6 : 9, 0.35 + r * 0.08), greens[i % greens.length], {
      y, ry: rng() * Math.PI, seed: seed + 5 + i, shade: 0.06, jitter: lod ? 0 : 0.08,
    });
    parts.push(heightShade(p, y - h / 2 - 0.5, y + h / 2, 0.5, 1.08));
  }
  return merge(parts);
}

function rock(rng, seed) {
  const parts = [];
  const grays = ['#8e8a82', '#837f78', '#99948b'];
  parts.push(part(new THREE.IcosahedronGeometry(1, 1), grays[seed % 3], {
    y: 0.6, sx: 1.55, sy: 1.0, sz: 1.3, ry: rng() * 3, jitter: 0.2, seed, shade: 0.1,
  }));
  parts.push(part(new THREE.IcosahedronGeometry(0.55, 1), '#7a766f', { x: 1.2, y: 0.25, z: 0.5, ry: rng() * 3, jitter: 0.1, seed: seed + 1, shade: 0.1 }));
  parts.push(part(new THREE.DodecahedronGeometry(0.4, 0), '#a29d93', { x: -1.1, y: 0.15, z: -0.7, jitter: 0.08, seed: seed + 2, shade: 0.1 }));
  for (const p of parts) tintUpFaces(p, '#6f8f4a', 0.72, 0.55);
  return merge(parts);
}

function pebble(rng, seed) {
  const parts = [];
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const r = randRange(rng, 0.14, 0.28);
    const a = rng() * Math.PI * 2;
    const d = i === 0 ? 0 : randRange(rng, 0.2, 0.45);
    parts.push(part(new THREE.DodecahedronGeometry(r, 0), i % 2 ? '#aaa49a' : '#8d8981', {
      x: Math.cos(a) * d, y: r * 0.45, z: Math.sin(a) * d, sy: 0.7, jitter: r * 0.2, seed: seed + i, shade: 0.08,
    }));
  }
  return merge(parts);
}

function stick(rng, seed) {
  const parts = [];
  const n = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const len = randRange(rng, 1.0, 1.5);
    const a = rng() * Math.PI;
    const ox = randRange(rng, -0.2, 0.2), oz = randRange(rng, -0.2, 0.2);
    const half = new THREE.Vector3(Math.cos(a) * len / 2, 0, Math.sin(a) * len / 2);
    parts.push(beam(
      new THREE.Vector3(ox - half.x, 0.06 + i * 0.06, oz - half.z),
      new THREE.Vector3(ox + half.x, 0.08 + i * 0.06, oz + half.z),
      0.06, 0.04, i % 2 ? '#7b5a3a' : '#674a2f', 5, { seed: seed + i },
    ));
  }
  parts.push(beam(new THREE.Vector3(0, 0.07, 0), new THREE.Vector3(0.3, 0.16, 0.25), 0.03, 0.015, '#7b5a3a', 4, { seed: seed + 9 }));
  return merge(parts);
}

function fiberBush(rng, seed) {
  const parts = [];
  const colors = ['#b9c65c', '#a5b94e', '#cdd272', '#98ae45'];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.4;
    const h = randRange(rng, 1.0, 1.6);
    const tilt = randRange(rng, 0.15, 0.6);
    const p = part(new THREE.ConeGeometry(0.07, h, 3), colors[i % colors.length], {
      x: Math.cos(a) * 0.15, y: h / 2 - 0.05, z: Math.sin(a) * 0.15,
      rx: Math.sin(a) * tilt, rz: -Math.cos(a) * tilt, seed: seed + i,
    });
    parts.push(heightShade(p, 0, 1.4, 0.6, 1.1));
  }
  parts.push(part(new THREE.IcosahedronGeometry(0.32, 0), '#6f8438', { y: 0.12, sy: 0.6, seed: seed + 30 }));
  return merge(parts);
}

function berryBush(rng, seed) {
  const parts = [];
  const blobs = [[0, 0.7, 0, 0.85], [0.6, 0.5, 0.25, 0.6], [-0.5, 0.5, -0.2, 0.6], [0.1, 1.15, -0.1, 0.55]];
  blobs.forEach(([x, y, z, r], i) => {
    const p = part(new THREE.IcosahedronGeometry(r, 1), i % 2 ? '#458c3a' : '#3b7d33', { x, y, z, sy: 0.85, jitter: 0.1, seed: seed + i, shade: 0.07 });
    parts.push(heightShade(p, 0, 1.6, 0.6, 1.12));
  });
  for (let i = 0; i < 18; i++) {
    const a = rng() * Math.PI * 2;
    const el = randRange(rng, 0.0, 1.1);
    const r = 0.95;
    parts.push(part(new THREE.IcosahedronGeometry(0.08, 0), i % 3 ? '#3d4fd0' : '#6a3cc0', {
      x: Math.cos(a) * Math.cos(el) * r, y: 0.7 + Math.sin(el) * r * 0.75, z: Math.sin(a) * Math.cos(el) * r * 0.9, seed: seed + 10 + i,
    }));
  }
  return merge(parts);
}

function coconutModel(rng, seed) {
  const parts = [];
  parts.push(part(new THREE.IcosahedronGeometry(0.19, 1), '#6b4a2b', { y: 0.16, seed, shade: 0.08 }));
  if (rng() > 0.4) parts.push(part(new THREE.IcosahedronGeometry(0.17, 1), '#5e4126', { x: 0.3, y: 0.14, z: 0.1, seed: seed + 1 }));
  return merge(parts);
}

function fishSpot(rng, seed) {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const r = 0.8 + (i % 2) * 0.35;
    const col = i % 2 ? '#e99a45' : '#b9c4cc';
    // gövde ileri (+x yönüne bakan teğet doğrultu)
    const body = new THREE.ConeGeometry(0.12, 0.5, 4);
    body.rotateZ(-Math.PI / 2);
    const tail = new THREE.ConeGeometry(0.1, 0.2, 3);
    tail.rotateZ(Math.PI / 2);
    tail.translate(-0.32, 0, 0);
    const fish = merge([part(body, col, { seed: seed + i }), part(tail, col, { seed: seed + i + 10 })]);
    parts.push(part(fish, col, { x: Math.cos(a) * r, y: -0.3 - (i % 2) * 0.12, z: Math.sin(a) * r, ry: -a - Math.PI / 2, seed: seed + i }));
  }
  parts.push(part(new THREE.TorusGeometry(1.25, 0.035, 3, 24), '#e8f6ff', { y: 0.08, rx: Math.PI / 2, seed: seed + 50 }));
  parts.push(part(new THREE.TorusGeometry(0.6, 0.025, 3, 18), '#e8f6ff', { y: 0.08, rx: Math.PI / 2, seed: seed + 51 }));
  return merge(parts);
}

const RESOURCE_BUILDERS = { palm, oak, pine, rock, pebble, stick, fiberBush, berryBush, coconut: coconutModel, fishSpot };

/** Kaynak türü için `variants` farklı geometri üretir (lod: uzak mesafe sürümü). */
export function buildResourceGeometries(modelKey, variants = 1, lod = false) {
  const fn = RESOURCE_BUILDERS[modelKey];
  if (!fn) throw new Error(`Bilinmeyen model: ${modelKey}`);
  const out = [];
  for (let v = 0; v < variants; v++) {
    const seed = 1000 + v * 97 + modelKey.length * 13;
    out.push(fn(mulberry32(seed), seed, lod));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Süsleme modelleri (toplanamaz; DecorScatter yerleştirir)
// ─────────────────────────────────────────────────────────────

function boulder(rng, seed) {
  const parts = [];
  const colors = ['#86827a', '#7b776f', '#918b80'];
  parts.push(part(new THREE.IcosahedronGeometry(1, 1), colors[seed % 3], {
    y: 0.45, sx: 1.2, sy: 0.85, sz: 1.0, ry: rng() * 3, jitter: 0.2, seed, shade: 0.1,
  }));
  parts.push(part(new THREE.IcosahedronGeometry(0.45, 1), '#76726b', { x: 0.95, y: 0.15, z: 0.35, jitter: 0.08, seed: seed + 1, shade: 0.1 }));
  for (const p of parts) tintUpFaces(p, '#68884a', 0.7, 0.6);
  return merge(parts);
}

function crag(rng, seed) {
  const parts = [];
  let y = 0;
  for (let i = 0; i < 3; i++) {
    const r = 1 - i * 0.22;
    parts.push(part(new THREE.DodecahedronGeometry(r, 0), i % 2 ? '#7f7a72' : '#8c877e', {
      x: randRange(rng, -0.25, 0.25), y: y + r * 0.8, z: randRange(rng, -0.25, 0.25), sy: 1.35, ry: rng() * 3, jitter: 0.15, seed: seed + i, shade: 0.1,
    }));
    y += r * 1.55;
  }
  for (const p of parts) tintUpFaces(p, '#9c968c', 0.75, 0.4);
  return merge(parts);
}

function fern(rng, seed) {
  const parts = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const leaf = leafGeometry(randRange(rng, 0.8, 1.15), 0.2, 0.9, 4, true);
    const p = part(leaf, i % 2 ? '#3f8a3a' : '#4c9a42', { ry: (i / n) * Math.PI * 2 + rng() * 0.3, rz: randRange(rng, 0.25, 0.6), seed: seed + i });
    parts.push(heightShade(p, 0, 0.8, 0.65, 1.1));
  }
  return merge(parts);
}

function bush(rng, seed) {
  const parts = [];
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const r = randRange(rng, 0.45, 0.8);
    const a = rng() * Math.PI * 2;
    const d = i === 0 ? 0 : randRange(rng, 0.35, 0.7);
    const p = part(new THREE.IcosahedronGeometry(r, 1), ['#3e8a37', '#4a9a3f', '#36792f'][i % 3], {
      x: Math.cos(a) * d, y: r * 0.75, z: Math.sin(a) * d, sy: 0.85, jitter: r * 0.12, seed: seed + i, shade: 0.07,
    });
    parts.push(heightShade(p, 0, 1.5, 0.55, 1.12));
  }
  return merge(parts);
}

function log(rng, seed) {
  const parts = [];
  const len = randRange(rng, 3.2, 4.4);
  const body = new THREE.CylinderGeometry(0.34, 0.4, len, 8);
  body.rotateZ(Math.PI / 2);
  parts.push(part(body, '#6a4c33', { y: 0.32, seed, shade: 0.08 }));
  const cap = new THREE.CylinderGeometry(0.33, 0.33, 0.02, 8);
  cap.rotateZ(Math.PI / 2);
  parts.push(part(cap.clone(), '#b38b5c', { x: len / 2 + 0.005, y: 0.32, seed: seed + 1 }));
  parts.push(part(cap, '#b38b5c', { x: -len / 2 - 0.005, y: 0.32, seed: seed + 2 }));
  parts.push(beam(new THREE.Vector3(0.4, 0.5, 0), new THREE.Vector3(0.8, 1.0, 0.35), 0.09, 0.05, '#6a4c33', 5, { seed: seed + 3 }));
  for (const p of parts) tintUpFaces(p, '#5d8a3f', 0.8, 0.55);
  return merge(parts);
}

function stump(rng, seed) {
  const parts = [];
  parts.push(part(new THREE.CylinderGeometry(0.45, 0.55, 0.7, 8), '#6a4c33', { y: 0.3, seed, shade: 0.08 }));
  parts.push(part(new THREE.CylinderGeometry(0.43, 0.43, 0.03, 8), '#b8905f', { y: 0.66, seed: seed + 1 }));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rng();
    parts.push(beam(new THREE.Vector3(Math.cos(a) * 0.3, 0.3, Math.sin(a) * 0.3), new THREE.Vector3(Math.cos(a) * 0.85, -0.1, Math.sin(a) * 0.85), 0.14, 0.05, '#5f4430', 5, { seed: seed + 2 + i }));
  }
  return merge(parts);
}

function mushrooms(rng, seed) {
  const parts = [];
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const d = i === 0 ? 0 : randRange(rng, 0.12, 0.3);
    const h = randRange(rng, 0.12, 0.26);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    parts.push(part(new THREE.CylinderGeometry(0.025, 0.035, h, 5), '#efe6d2', { x, y: h / 2, z, seed: seed + i }));
    const cap = new THREE.SphereGeometry(0.075 + h * 0.25, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2);
    parts.push(part(cap, rng() > 0.4 ? '#c0392b' : '#a0643a', { x, y: h - 0.01, z, sy: 0.7, seed: seed + 10 + i }));
  }
  return merge(parts);
}

function shells(rng, seed) {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const a = rng() * Math.PI * 2;
    const d = randRange(rng, 0, 0.5);
    parts.push(part(new THREE.ConeGeometry(0.06, 0.12, 6), ['#f3dcc8', '#e9c2b0', '#fff2e2'][i], {
      x: Math.cos(a) * d, y: 0.03, z: Math.sin(a) * d, rx: Math.PI / 2 - 0.2, ry: rng() * 6, seed: seed + i,
    }));
  }
  if (rng() > 0.5) {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      parts.push(part(new THREE.ConeGeometry(0.035, 0.16, 4), '#e8833a', {
        x: 0.4 + Math.cos(a) * 0.07, y: 0.02, z: 0.3 + Math.sin(a) * 0.07, rx: Math.PI / 2, rz: -a + Math.PI / 2, seed: seed + 20 + k,
      }));
    }
  }
  return merge(parts);
}

function reeds(rng, seed) {
  const parts = [];
  for (let i = 0; i < 12; i++) {
    const a = rng() * Math.PI * 2;
    const d = randRange(rng, 0, 0.45);
    const h = randRange(rng, 1.2, 2.0);
    const p = part(new THREE.ConeGeometry(0.035, h, 3), i % 3 ? '#7f9a4a' : '#9aab5a', {
      x: Math.cos(a) * d, y: h / 2, z: Math.sin(a) * d, rx: randRange(rng, -0.12, 0.12), rz: randRange(rng, -0.12, 0.12), seed: seed + i,
    });
    parts.push(heightShade(p, 0, h, 0.6, 1.1));
    if (i % 4 === 0) parts.push(part(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 5), '#6b4a2b', { x: Math.cos(a) * d, y: h * 0.82, z: Math.sin(a) * d, seed: seed + 30 + i }));
  }
  return merge(parts);
}

function cloud(rng, seed) {
  const parts = [];
  const n = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const r = randRange(rng, 7, 14);
    const p = part(new THREE.IcosahedronGeometry(r, 1), '#ffffff', {
      x: (i - n / 2) * randRange(rng, 7, 10), y: randRange(rng, -1, 3), z: randRange(rng, -6, 6), sy: 0.55, jitter: r * 0.08, seed: seed + i,
    });
    parts.push(heightShade(p, -6, 6, 0.78, 1.0));
  }
  return merge(parts);
}

const DECOR_BUILDERS = { boulder, crag, fern, bush, log, stump, mushrooms, shells, reeds, cloud };

/** Süs türü için `variants` farklı geometri üretir. */
export function buildDecorGeometries(key, variants = 1) {
  const fn = DECOR_BUILDERS[key];
  if (!fn) throw new Error(`Bilinmeyen süs modeli: ${key}`);
  const out = [];
  for (let v = 0; v < variants; v++) {
    const seed = 3000 + v * 131 + key.length * 17;
    out.push(fn(mulberry32(seed), seed));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Yapılar
// ─────────────────────────────────────────────────────────────

function campfire() {
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    parts.push(part(new THREE.DodecahedronGeometry(0.19, 0), i % 2 ? '#8a857b' : '#6f6a62', {
      x: Math.cos(a) * 0.62, y: 0.1, z: Math.sin(a) * 0.62, sy: 0.75, seed: 300 + i, jitter: 0.03,
    }));
  }
  parts.push(part(new THREE.CylinderGeometry(0.5, 0.52, 0.04, 10), '#2d2622', { y: 0.02, seed: 320 }));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    parts.push(beam(
      new THREE.Vector3(Math.cos(a) * 0.42, 0.04, Math.sin(a) * 0.42),
      new THREE.Vector3(Math.cos(a) * 0.05, 0.55, Math.sin(a) * 0.05),
      0.07, 0.05, i % 2 ? '#5e4129' : '#4d3522', 5, { seed: 330 + i },
    ));
  }
  return merge(parts);
}

function hut() {
  const parts = [];
  const plank = (x, z, w, h, d, color, seed, y0 = 0.3) =>
    part(new THREE.BoxGeometry(w, h, d), color, { x, y: y0 + h / 2, z, seed, shade: 0.06 });

  // taban + kazıklar + kapı basamağı
  parts.push(part(new THREE.BoxGeometry(3.6, 0.3, 3.6), '#8b6a45', { y: 0.15, seed: 400, shade: 0.05 }));
  parts.push(part(new THREE.BoxGeometry(1.3, 0.6, 0.6), '#7a5a38', { y: -0.5, z: 2.05, seed: 402, shade: 0.05 }));
  parts.push(part(new THREE.BoxGeometry(1.3, 0.9, 0.56), '#6f5133', { y: -1.15, z: 2.6, seed: 403, shade: 0.05 }));
  for (const [x, z] of [[-1.65, -1.65], [1.65, -1.65], [-1.65, 1.65], [1.65, 1.65]]) {
    parts.push(part(new THREE.CylinderGeometry(0.12, 0.14, 2.6, 6), '#5f4630', { x, y: -1.2, z, seed: 401 }));
  }
  const wallColors = ['#9a7449', '#8a6740', '#a37b4e'];
  // arka duvar
  for (let i = 0; i < 8; i++) {
    const x = -1.575 + i * 0.45;
    parts.push(plank(x, -1.6, 0.44, 2.2 + (i % 3) * 0.05, 0.14, wallColors[i % 3], 410 + i));
  }
  // yan duvarlar
  for (const side of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const z = -1.575 + i * 0.45;
      parts.push(plank(side * 1.6, z, 0.14, 2.2 + ((i + 1) % 3) * 0.05, 0.44, wallColors[(i + side + 3) % 3], 430 + i + side * 10));
    }
  }
  // ön duvar (ortada kapı boşluğu)
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const x = side * (1.375 - i * 0.45);
      parts.push(plank(x, 1.6, 0.44, 2.2, 0.14, wallColors[i % 3], 460 + i + side * 5));
    }
  }
  // kapı üstü kiriş
  parts.push(part(new THREE.BoxGeometry(1.6, 0.25, 0.16), '#7a5a38', { y: 2.38, z: 1.6, seed: 470 }));
  // üçgen saz çatı (3 kenarlı silindir = üçgen prizma)
  const roof = new THREE.CylinderGeometry(1, 1, 4.3, 3, 1);
  roof.rotateX(-Math.PI / 2);
  parts.push(part(roof, '#c9a55a', { y: 2.5 + 0.5 * 1.05, sx: 2.55, sy: 1.05, seed: 480, shade: 0.07 }));
  parts.push(beam(new THREE.Vector3(0, 3.58, -2.2), new THREE.Vector3(0, 3.58, 2.2), 0.09, 0.09, '#6b4c30', 6, { seed: 481 }));
  // saz yatak + yastık
  parts.push(part(new THREE.BoxGeometry(1.1, 0.22, 2.0), '#d8c27a', { x: -0.85, y: 0.41, z: -0.4, seed: 490, shade: 0.06 }));
  parts.push(part(new THREE.BoxGeometry(0.7, 0.14, 0.4), '#efe2b8', { x: -0.85, y: 0.58, z: -1.15, seed: 491 }));
  return merge(parts);
}

function chest() {
  const parts = [];
  parts.push(part(new THREE.BoxGeometry(1.0, 0.55, 0.66), '#8a5a32', { y: 0.28, seed: 500, shade: 0.05 }));
  parts.push(part(new THREE.BoxGeometry(1.04, 0.2, 0.7), '#9b6a3c', { y: 0.65, seed: 501 }));
  for (const x of [-0.32, 0.32]) {
    parts.push(part(new THREE.BoxGeometry(0.08, 0.78, 0.72), '#4a3420', { x, y: 0.39, seed: 502 }));
  }
  parts.push(part(new THREE.BoxGeometry(0.14, 0.16, 0.06), '#d2aa4c', { y: 0.55, z: 0.36, seed: 503 }));
  return merge(parts);
}

function workbench() {
  const parts = [];
  parts.push(part(new THREE.BoxGeometry(1.8, 0.12, 0.9), '#a0744a', { y: 0.92, seed: 600, shade: 0.05 }));
  for (const [x, z] of [[-0.8, -0.38], [0.8, -0.38], [-0.8, 0.38], [0.8, 0.38]]) {
    parts.push(part(new THREE.BoxGeometry(0.12, 0.9, 0.12), '#7a5636', { x, y: 0.45, z, seed: 601 }));
  }
  parts.push(part(new THREE.BoxGeometry(1.6, 0.06, 0.7), '#8a6440', { y: 0.3, seed: 602 }));
  parts.push(part(new THREE.CylinderGeometry(0.16, 0.18, 0.28, 7), '#76533a', { x: 0.55, y: 1.12, z: -0.1, seed: 603 }));
  // masadaki aletler
  parts.push(part(new THREE.BoxGeometry(0.5, 0.04, 0.06), '#6b4c30', { x: -0.3, y: 1.0, z: 0.15, ry: 0.4, seed: 604 }));
  parts.push(part(new THREE.BoxGeometry(0.12, 0.08, 0.1), '#8d8a84', { x: -0.08, y: 1.02, z: 0.24, ry: 0.4, seed: 605 }));
  parts.push(part(new THREE.BoxGeometry(0.4, 0.02, 0.16), '#b8b4ab', { x: -0.45, y: 0.99, z: -0.2, ry: -0.2, seed: 606 }));
  return merge(parts);
}

const BUILDING_BUILDERS = { campfire, hut, chest, workbench };

export function buildBuildingGeometry(type) {
  const fn = BUILDING_BUILDERS[type];
  if (!fn) throw new Error(`Bilinmeyen yapı modeli: ${type}`);
  return fn();
}

// ─────────────────────────────────────────────────────────────
// Eldeki aletler (kabza yerel +Y yönünde, tutuş noktası orijinde)
// ─────────────────────────────────────────────────────────────

function heldAxe() {
  return merge([
    part(new THREE.CylinderGeometry(0.03, 0.035, 0.75, 5), '#7b5a3a', { y: 0.25, seed: 700 }),
    part(new THREE.BoxGeometry(0.06, 0.16, 0.24), '#8f8b83', { y: 0.56, z: 0.1, seed: 701, jitter: 0.01 }),
    part(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 5), '#b9c65c', { y: 0.56, seed: 702 }),
  ]);
}

function heldPickaxe() {
  return merge([
    part(new THREE.CylinderGeometry(0.03, 0.035, 0.75, 5), '#7b5a3a', { y: 0.25, seed: 710 }),
    part(new THREE.BoxGeometry(0.06, 0.08, 0.26), '#8f8b83', { y: 0.58, z: 0.12, rx: 0.35, seed: 711 }),
    part(new THREE.BoxGeometry(0.06, 0.08, 0.26), '#8f8b83', { y: 0.58, z: -0.12, rx: -0.35, seed: 712 }),
    part(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 5), '#b9c65c', { y: 0.58, seed: 713 }),
  ]);
}

function heldSpear() {
  return merge([
    part(new THREE.CylinderGeometry(0.025, 0.03, 1.7, 5), '#8b6a45', { y: 0.45, seed: 720 }),
    part(new THREE.ConeGeometry(0.06, 0.25, 4), '#9a958b', { y: 1.42, seed: 721 }),
    part(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 5), '#b9c65c', { y: 1.27, seed: 722 }),
  ]);
}

function heldTorch() {
  return merge([
    part(new THREE.CylinderGeometry(0.035, 0.04, 0.65, 5), '#6b4c30', { y: 0.2, seed: 730 }),
    part(new THREE.CylinderGeometry(0.065, 0.05, 0.16, 6), '#3a2c22', { y: 0.55, seed: 731 }),
  ]);
}

const HELD_BUILDERS = { axe: heldAxe, pickaxe: heldPickaxe, spear: heldSpear, torch: heldTorch };

export function buildHeldGeometry(key) {
  return HELD_BUILDERS[key] ? HELD_BUILDERS[key]() : null;
}

/** Tüm prosedürel modellerin paylaştığı malzeme. */
export const sharedMaterials = {
  standard: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
};

/**
 * Kamera ile oyuncu arasında kalan (ya da kameraya çok yakın) parçaları ekran-kapısı
 * (dither) desenle gizleyen malzeme. Ağaçlar oyuncuyu kapatmaz, kamera da yaprakların
 * içine girince görüş kaybolmaz.
 * uniforms: { uCamPos, uFocus: { value: Vector3 }, uNear: { value: 0..1 } }
 */
export function createOccluderFadeMaterial(uniforms) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCamPos = uniforms.uCamPos;
    shader.uniforms.uFocus = uniforms.uFocus;
    shader.uniforms.uNear = uniforms.uNear;
    shader.vertexShader = 'varying vec3 vOccWorld;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
       vec4 occWorld = vec4(transformed, 1.0);
       #ifdef USE_INSTANCING
         occWorld = instanceMatrix * occWorld;
       #endif
       vOccWorld = (modelMatrix * occWorld).xyz;`,
    );
    shader.fragmentShader = 'uniform vec3 uCamPos;\nuniform vec3 uFocus;\nuniform float uNear;\nvarying vec3 vOccWorld;\n' + shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
       vec3 occSeg = uFocus - uCamPos;
       float occLen = length(occSeg);
       vec3 occRel = vOccWorld - uCamPos;
       float occFade = mix(1.0, smoothstep(1.2, 2.8, length(occRel)), uNear);
       if (occLen > 0.5) {
         vec3 occDir = occSeg / occLen;
         float along = dot(occRel, occDir);
         if (along > 0.0 && along < occLen - 0.5) {
           occFade = min(occFade, smoothstep(0.8, 1.9, length(occRel - occDir * along)));
         }
       }
       if (occFade < 0.999) {
         float occNoise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
         if (occNoise > occFade) discard;
       }`,
    );
  };
  return mat;
}

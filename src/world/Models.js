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
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 1, !!opts.open);
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
export function tintUpFaces(g, color, threshold = 0.6, amount = 0.85) {
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
  // sarmaşıklar: gövdeye sarılan ve dallardan sarkan (ayrı rng → LOD boyutları değişmez)
  if (!lod) {
    const vr = mulberry32(seed * 3 + 11);
    if (vr() < 0.75) parts.push(...trunkVines(vr, seed, p0, p2, 0.5, trunkH));
    const hang = 2 + Math.floor(vr() * 4);
    for (let i = 0; i < hang; i++) {
      const a = vr() * Math.PI * 2;
      const r = randRange(vr, 1.2, 2.4);
      const top = new THREE.Vector3(p2.x + Math.cos(a) * r, trunkH + randRange(vr, 0.6, 1.3), Math.sin(a) * r);
      parts.push(...hangingVine(vr, seed + 200 + i * 7, top, randRange(vr, 2.2, trunkH - 0.2)));
    }
  }
  return merge(parts);
}

// ── Sarmaşık parçaları ─────────────────────────────────────
const VINE_GREENS = ['#3f7d2c', '#4b8f34', '#2f6a25', '#5a9c3c'];

/** Yukarıdan aşağı sarkan, hafif kıvrımlı bir sarmaşık dalı ve üzerindeki yapraklar. */
export function hangingVine(rng, seed, top, length) {
  const parts = [];
  const segs = Math.max(3, Math.round(length / 0.7));
  let prev = top.clone();
  const sway = new THREE.Vector3(randRange(rng, -0.25, 0.25), 0, randRange(rng, -0.25, 0.25));
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const next = new THREE.Vector3(
      top.x + sway.x * Math.sin(t * 3.1) + randRange(rng, -0.06, 0.06),
      top.y - t * length,
      top.z + sway.z * Math.sin(t * 2.7) + randRange(rng, -0.06, 0.06),
    );
    parts.push(beam(prev, next, 0.035, 0.03, '#4a6b2a', 3, { seed: seed + i, open: true }));
    const leafG = new THREE.OctahedronGeometry(randRange(rng, 0.12, 0.18), 0);
    parts.push(part(leafG, VINE_GREENS[i % VINE_GREENS.length], {
      x: next.x + randRange(rng, -0.1, 0.1), y: next.y + 0.1, z: next.z + randRange(rng, -0.1, 0.1), sy: 0.55, ry: rng() * 3, seed: seed + 40 + i,
    }));
    prev = next;
  }
  return parts;
}

/** Gövdeye sarmal şekilde dolanan sarmaşık. */
function trunkVines(rng, seed, base, topPt, radius, height) {
  const parts = [];
  const turns = randRange(rng, 1.4, 2.4);
  const steps = 14;
  const phase = rng() * Math.PI * 2;
  let prev = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = phase + t * turns * Math.PI * 2;
    const r = radius * (1 - t * 0.35) + 0.04;
    const cx = base.x + (topPt.x - base.x) * t;
    const p = new THREE.Vector3(cx + Math.cos(a) * r, base.y + 0.2 + t * height * 0.92, Math.sin(a) * r);
    if (prev) parts.push(beam(prev, p, 0.04, 0.035, '#46672a', 3, { seed: seed + 300 + i, open: true }));
    if (i % 2 === 0) {
      parts.push(part(new THREE.OctahedronGeometry(randRange(rng, 0.13, 0.21), 0), VINE_GREENS[i % 4], {
        x: p.x + Math.cos(a) * 0.08, y: p.y, z: p.z + Math.sin(a) * 0.08, sy: 0.6, ry: rng() * 3, seed: seed + 330 + i,
      }));
    }
    prev = p;
  }
  return parts;
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

/** Kurumuş, kırık bir gövdeye dolanmış sarmaşık yumağı (toplanabilir). */
function vineTangle(rng, seed) {
  const parts = [];
  const h = randRange(rng, 1.5, 2.1);
  const lean = randRange(rng, -0.15, 0.15);
  const base = new THREE.Vector3(0, -0.1, 0);
  const top = new THREE.Vector3(lean, h, randRange(rng, -0.1, 0.1));
  parts.push(beam(base, top, 0.22, 0.14, '#6b5640', 6, { seed, shade: 0.08 }));
  // kırık tepe
  parts.push(part(new THREE.ConeGeometry(0.14, 0.3, 5), '#7a6550', { x: top.x, y: top.y + 0.12, z: top.z, rz: 0.3, seed: seed + 1 }));
  parts.push(...trunkVines(rng, seed, base, top, 0.24, h));
  parts.push(...trunkVines(rng, seed + 50, base, top, 0.26, h * 0.8));
  // tepeden sarkan ve yere yayılan dallar
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rng();
    const t = new THREE.Vector3(top.x + Math.cos(a) * 0.25, top.y - 0.1, top.z + Math.sin(a) * 0.25);
    parts.push(...hangingVine(rng, seed + 100 + i * 9, t, randRange(rng, 0.9, h - 0.2)));
  }
  for (let i = 0; i < 6; i++) {
    const a = rng() * Math.PI * 2;
    const len = randRange(rng, 0.7, 1.4);
    const end = new THREE.Vector3(Math.cos(a) * len, 0.04, Math.sin(a) * len);
    parts.push(beam(new THREE.Vector3(0, 0.08, 0), end, 0.035, 0.025, '#4a6b2a', 3, { seed: seed + 200 + i }));
    parts.push(part(new THREE.IcosahedronGeometry(0.17, 0), VINE_GREENS[i % 4], { x: end.x, y: 0.1, z: end.z, sy: 0.5, seed: seed + 220 + i }));
    parts.push(part(new THREE.IcosahedronGeometry(0.13, 0), VINE_GREENS[(i + 1) % 4], { x: end.x * 0.55, y: 0.1, z: end.z * 0.55, sy: 0.5, seed: seed + 240 + i }));
  }
  return merge(parts);
}

/** Mağara kayası + içine gömülü cevher parçaları. */
function oreRock(rng, seed, base, veins, veinColors, veinSize = 0.22) {
  const parts = [];
  parts.push(part(new THREE.IcosahedronGeometry(1, 1), base, {
    y: 0.55, sx: 1.3, sy: 0.95, sz: 1.1, ry: rng() * 3, jitter: 0.18, seed, shade: 0.1,
  }));
  parts.push(part(new THREE.DodecahedronGeometry(0.5, 0), base, { x: 0.95, y: 0.2, z: 0.4, jitter: 0.08, seed: seed + 1, shade: 0.1 }));
  for (let i = 0; i < veins; i++) {
    const a = rng() * Math.PI * 2;
    const el = randRange(rng, -0.1, 0.9);
    const r = 1.05;
    parts.push(part(new THREE.DodecahedronGeometry(randRange(rng, veinSize * 0.7, veinSize * 1.3), 0), veinColors[i % veinColors.length], {
      x: Math.cos(a) * Math.cos(el) * r * 1.2, y: 0.55 + Math.sin(el) * r * 0.85, z: Math.sin(a) * Math.cos(el) * r, ry: rng() * 3, seed: seed + 10 + i,
    }));
  }
  return merge(parts);
}

function coalOre(rng, seed) {
  return oreRock(rng, seed, '#5f5b57', 9, ['#1e1e22', '#2a2a2f', '#141416']);
}

function ironOre(rng, seed) {
  return oreRock(rng, seed, '#6c625a', 8, ['#b0612c', '#c97a3a', '#8a4a26', '#d99a62'], 0.2);
}

/** Parlayan kristal kümesi (ışıksız malzemeyle çizilir; renkler kendi parlaklığıdır). */
function crystal(rng, seed) {
  const parts = [];
  parts.push(part(new THREE.DodecahedronGeometry(0.55, 0), '#2a3140', { y: 0.15, sy: 0.55, jitter: 0.06, seed, shade: 0.1 }));
  const n = 6 + Math.floor(rng() * 4);
  const cols = ['#7ff3ff', '#5fd0ff', '#b6fbff', '#86b8ff'];
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const d = i === 0 ? 0 : randRange(rng, 0.15, 0.5);
    const len = i === 0 ? randRange(rng, 1.3, 1.7) : randRange(rng, 0.5, 1.1);
    const g = new THREE.OctahedronGeometry(0.5, 0);
    g.scale(0.26, len, 0.26);
    g.translate(0, len * 0.45, 0);
    const p = part(g, cols[i % cols.length], {
      x: Math.cos(a) * d, y: 0.1, z: Math.sin(a) * d, rx: Math.sin(a) * d * 0.9, rz: -Math.cos(a) * d * 0.9, ry: rng() * 3, seed: seed + i, shade: 0.12,
    });
    parts.push(heightShade(p, 0, 1.6, 0.55, 1.15));
  }
  return merge(parts);
}

function caveMushroom(rng, seed) {
  const parts = [];
  const n = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const d = i === 0 ? 0 : randRange(rng, 0.15, 0.45);
    const h = randRange(rng, 0.2, 0.55);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    parts.push(part(new THREE.CylinderGeometry(0.03, 0.045, h, 5), '#b9d6d2', { x, y: h / 2, z, seed: seed + i }));
    const cap = new THREE.SphereGeometry(0.09 + h * 0.28, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2);
    parts.push(part(cap, i % 2 ? '#4ef2d0' : '#6ad8ff', { x, y: h - 0.01, z, sy: 0.6, seed: seed + 10 + i }));
  }
  return merge(parts);
}


// ── Çöl / buz / volkan kaynakları ───────────────────────────
function cactus(rng, seed, lod = false) {
  const parts = [];
  const H = randRange(rng, 2.8, 4.2);
  const r = randRange(rng, 0.26, 0.34);
  const seg = lod ? 5 : 8;
  const greens = ['#4f8f45', '#5a9c4c', '#478540'];
  parts.push(part(new THREE.CylinderGeometry(r * 0.92, r, H, seg), greens[0], { y: H / 2 - 0.1, seed, shade: 0.06 }));
  parts.push(part(new THREE.SphereGeometry(r * 0.92, seg, 4, 0, Math.PI * 2, 0, Math.PI / 2), greens[1], { y: H - 0.1, seed: seed + 1 }));
  const arms = 1 + Math.floor(rng() * 2.4);
  for (let i = 0; i < arms; i++) {
    const side = i % 2 ? -1 : 1;
    const ay = randRange(rng, H * 0.35, H * 0.6);
    const out = randRange(rng, 0.55, 0.75);
    const up = randRange(rng, 0.8, 1.4);
    const ar = r * 0.62;
    const yaw = rng() * Math.PI;
    const cx = Math.cos(yaw) * side;
    const cz = Math.sin(yaw) * side;
    parts.push(beam(new THREE.Vector3(0, ay, 0), new THREE.Vector3(cx * out, ay, cz * out), ar, ar, greens[2], seg, { seed: seed + 10 + i }));
    parts.push(beam(new THREE.Vector3(cx * out, ay - ar * 0.6, cz * out), new THREE.Vector3(cx * out, ay + up, cz * out), ar, ar * 0.9, greens[1], seg, { seed: seed + 20 + i }));
    parts.push(part(new THREE.SphereGeometry(ar * 0.9, seg, 3, 0, Math.PI * 2, 0, Math.PI / 2), greens[1], { x: cx * out, y: ay + up, z: cz * out, seed: seed + 30 + i }));
  }
  if (!lod && rng() > 0.4) {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + rng();
      parts.push(part(new THREE.IcosahedronGeometry(0.07, 0), k % 2 ? '#f06292' : '#ffd166', { x: Math.cos(a) * r * 0.6, y: H - 0.02, z: Math.sin(a) * r * 0.6, seed: seed + 40 + k }));
    }
  }
  return merge(parts);
}

function desertShrub(rng, seed) {
  const parts = [];
  const cols = ['#9a8a52', '#8a7a46', '#a8975c', '#7d6f40'];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rng() * 0.4;
    const h = randRange(rng, 0.5, 1.0);
    const tilt = randRange(rng, 0.4, 0.9);
    parts.push(part(new THREE.ConeGeometry(0.05, h, 3), cols[i % 4], {
      x: Math.cos(a) * 0.12, y: h / 2 - 0.05, z: Math.sin(a) * 0.12, rx: Math.sin(a) * tilt, rz: -Math.cos(a) * tilt, seed: seed + i,
    }));
  }
  parts.push(part(new THREE.IcosahedronGeometry(0.38, 0), '#8f8050', { y: 0.32, sy: 0.7, jitter: 0.08, seed: seed + 30, shade: 0.1 }));
  for (let k = 0; k < 4; k++) parts.push(part(new THREE.IcosahedronGeometry(0.05, 0), '#f2c14e', { x: randRange(rng, -0.35, 0.35), y: randRange(rng, 0.4, 0.7), z: randRange(rng, -0.35, 0.35), seed: seed + 40 + k }));
  return merge(parts);
}

function sandstoneRock(rng, seed) {
  const parts = [];
  const bands = ['#d9a86c', '#c98f55', '#e2b47a', '#b97c48'];
  let y = 0;
  const n = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const w = randRange(rng, 1.6, 2.2) * (1 - i * 0.14);
    const d = randRange(rng, 1.2, 1.7) * (1 - i * 0.12);
    const h = randRange(rng, 0.35, 0.55);
    parts.push(part(new THREE.BoxGeometry(w, h, d, 2, 1, 2), bands[i % 4], { x: randRange(rng, -0.15, 0.15), y: y + h / 2, z: randRange(rng, -0.1, 0.1), ry: rng() * 0.6, jitter: 0.06, seed: seed + i, shade: 0.05 }));
    y += h * 0.92;
  }
  return merge(parts);
}

function copperRock(rng, seed) {
  return oreRock(rng, seed, '#8d7a68', 9, ['#d27a3b', '#3fbf9f', '#e39b55', '#2fa58a'], 0.21);
}

function bonePile(rng, seed) {
  const parts = [];
  const bone = '#efe6d2';
  for (let i = 0; i < 5; i++) {
    const g = new THREE.TorusGeometry(0.45 - i * 0.04, 0.035, 4, 10, Math.PI);
    parts.push(part(g, bone, { x: -0.5 + i * 0.22, y: 0.05, rz: 0, ry: Math.PI / 2, rx: -0.2, seed: seed + i }));
  }
  parts.push(beam(new THREE.Vector3(-0.7, 0.08, 0), new THREE.Vector3(0.5, 0.06, 0), 0.05, 0.04, bone, 5, { seed: seed + 10 }));
  parts.push(part(new THREE.IcosahedronGeometry(0.2, 1), bone, { x: 0.8, y: 0.16, z: 0.2, sz: 1.3, seed: seed + 11 }));
  parts.push(part(new THREE.BoxGeometry(0.05, 0.05, 0.03), '#3a3026', { x: 0.88, y: 0.22, z: 0.43, seed: seed + 12 }));
  parts.push(part(new THREE.BoxGeometry(0.05, 0.05, 0.03), '#3a3026', { x: 0.72, y: 0.22, z: 0.43, seed: seed + 13 }));
  parts.push(part(new THREE.ConeGeometry(0.05, 0.35, 5), bone, { x: 1.0, y: 0.25, z: 0.05, rz: -1.1, seed: seed + 14 }));
  parts.push(part(new THREE.ConeGeometry(0.05, 0.35, 5), bone, { x: 0.62, y: 0.25, z: 0.05, rz: 1.1, seed: seed + 15 }));
  return merge(parts);
}

function snowPine(rng, seed, lod = false) {
  const parts = [];
  const H = randRange(rng, 9, 12.5);
  parts.push(beam(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0, H * 0.92, 0), 0.4, 0.08, '#4f3a2b', lod ? 4 : 7, { seed, shade: 0.06 }));
  const tiers = 6;
  const greens = ['#2c5e44', '#295640', '#31684b'];
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const r = 3.1 * (1 - t * 0.85) + randRange(rng, -0.15, 0.15);
    const h = 2.7 * (1 - t * 0.35);
    const y = H * (0.2 + 0.74 * t) + h * 0.2;
    const p = part(droopCone(r, h, lod ? 6 : 9, 0.3 + r * 0.08), greens[i % greens.length], {
      y, ry: rng() * Math.PI, seed: seed + 5 + i, shade: 0.06, jitter: lod ? 0 : 0.07,
    });
    heightShade(p, y - h / 2 - 0.5, y + h / 2, 0.55, 1.05);
    parts.push(tintUpFaces(p, '#f1f6fa', 0.35, 0.92));
  }
  return merge(parts);
}

function iceRock(rng, seed) {
  const parts = [];
  parts.push(part(new THREE.IcosahedronGeometry(1, 1), '#8fa6b8', { y: 0.45, sx: 1.4, sy: 0.85, sz: 1.2, ry: rng() * 3, jitter: 0.18, seed, shade: 0.1 }));
  const cols = ['#cdeeff', '#a8e0ff', '#e6f9ff'];
  const n = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const d = randRange(rng, 0.2, 0.8);
    const len = randRange(rng, 0.6, 1.4);
    const g = new THREE.OctahedronGeometry(0.5, 0);
    g.scale(0.3, len, 0.3);
    g.translate(0, len * 0.4, 0);
    parts.push(part(g, cols[i % 3], { x: Math.cos(a) * d, y: 0.6, z: Math.sin(a) * d, rx: Math.sin(a) * 0.6, rz: -Math.cos(a) * 0.6, seed: seed + 10 + i, shade: 0.12 }));
  }
  for (const p of parts.slice(0, 1)) tintUpFaces(p, '#f1f6fa', 0.5, 0.85);
  return merge(parts);
}

function frostBush(rng, seed) {
  const parts = [];
  const blobs = [[0, 0.6, 0, 0.7], [0.5, 0.42, 0.2, 0.5], [-0.45, 0.42, -0.15, 0.5]];
  blobs.forEach(([x, y, z, r], i) => {
    const p = part(new THREE.IcosahedronGeometry(r, 1), i % 2 ? '#4f7f6a' : '#5f8f7a', { x, y, z, sy: 0.85, jitter: 0.08, seed: seed + i, shade: 0.07 });
    parts.push(tintUpFaces(p, '#eef6fb', 0.55, 0.8));
  });
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2;
    const el = randRange(rng, 0, 1);
    parts.push(part(new THREE.IcosahedronGeometry(0.07, 0), i % 2 ? '#9ad8ff' : '#d9f2ff', {
      x: Math.cos(a) * Math.cos(el) * 0.78, y: 0.6 + Math.sin(el) * 0.55, z: Math.sin(a) * Math.cos(el) * 0.7, seed: seed + 10 + i,
    }));
  }
  return merge(parts);
}

function charredTree(rng, seed, lod = false) {
  const parts = [];
  const H = randRange(rng, 4.5, 6.5);
  const lean = randRange(rng, -0.3, 0.3);
  const bark = '#2e2522';
  const top = new THREE.Vector3(lean, H, randRange(rng, -0.2, 0.2));
  parts.push(beam(new THREE.Vector3(0, -0.2, 0), top, 0.38, 0.1, bark, lod ? 4 : 7, { seed, shade: 0.1 }));
  const branches = lod ? 3 : 6;
  for (let i = 0; i < branches; i++) {
    const t = randRange(rng, 0.4, 0.9);
    const a = rng() * Math.PI * 2;
    const base = new THREE.Vector3(lean * t, H * t, 0);
    const len = randRange(rng, 1.0, 2.0) * (1.1 - t * 0.5);
    const end = new THREE.Vector3(base.x + Math.cos(a) * len, base.y + len * 0.55, base.z + Math.sin(a) * len);
    parts.push(beam(base, end, 0.09, 0.03, i % 2 ? bark : '#3a2e2a', 4, { seed: seed + 10 + i }));
  }
  if (!lod) {
    for (let k = 0; k < 4; k++) {
      parts.push(part(new THREE.OctahedronGeometry(0.06, 0), '#ff6a2a', { x: randRange(rng, -0.2, 0.2) + lean * 0.3, y: randRange(rng, 0.4, H * 0.6), z: randRange(rng, -0.25, 0.25), seed: seed + 30 + k }));
    }
  }
  return merge(parts);
}

function obsidianRock(rng, seed) {
  const parts = [];
  parts.push(part(new THREE.IcosahedronGeometry(0.8, 0), '#3a3534', { y: 0.25, sy: 0.55, jitter: 0.1, seed, shade: 0.1 }));
  const cols = ['#1c1726', '#2a2236', '#4b3a66', '#140f1c'];
  const n = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const d = i === 0 ? 0 : randRange(rng, 0.2, 0.6);
    const len = i === 0 ? randRange(rng, 1.2, 1.6) : randRange(rng, 0.5, 1.0);
    const g = new THREE.OctahedronGeometry(0.5, 0);
    g.scale(0.34, len, 0.28);
    g.translate(0, len * 0.42, 0);
    parts.push(part(g, cols[i % 4], { x: Math.cos(a) * d, y: 0.2, z: Math.sin(a) * d, rx: Math.sin(a) * d * 0.8, rz: -Math.cos(a) * d * 0.8, ry: rng() * 3, seed: seed + 10 + i, shade: 0.18 }));
  }
  return merge(parts);
}

function sulfurVent(rng, seed) {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    parts.push(part(new THREE.DodecahedronGeometry(0.35, 0), i % 2 ? '#4a4442' : '#5a5250', { x: Math.cos(a) * 0.7, y: 0.2, z: Math.sin(a) * 0.7, jitter: 0.06, seed: seed + i, shade: 0.1 }));
  }
  parts.push(part(new THREE.CylinderGeometry(0.45, 0.6, 0.12, 8), '#2a2524', { y: 0.06, seed: seed + 9 }));
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2;
    const d = randRange(rng, 0.2, 0.75);
    parts.push(part(new THREE.OctahedronGeometry(randRange(rng, 0.1, 0.2), 0), i % 2 ? '#e8d23a' : '#f2e05a', { x: Math.cos(a) * d, y: 0.25 + rng() * 0.2, z: Math.sin(a) * d, sy: 1.6, seed: seed + 20 + i }));
  }
  return merge(parts);
}

function basaltRock(rng, seed) {
  const parts = [];
  const n = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.5;
    const d = i === 0 ? 0 : randRange(rng, 0.45, 0.8);
    const h = i === 0 ? randRange(rng, 2.0, 2.6) : randRange(rng, 0.8, 1.9);
    parts.push(part(new THREE.CylinderGeometry(0.36, 0.38, h, 6), i % 2 ? '#4a4442' : '#3e3836', { x: Math.cos(a) * d, y: h / 2 - 0.1, z: Math.sin(a) * d, ry: rng(), seed: seed + i, shade: 0.08 }));
    parts.push(part(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 6), '#5d5653', { x: Math.cos(a) * d, y: h - 0.08, z: Math.sin(a) * d, seed: seed + 20 + i }));
  }
  return merge(parts);
}

const RESOURCE_BUILDERS = {
  palm, oak, pine, rock, pebble, stick, fiberBush, berryBush, coconut: coconutModel, fishSpot,
  vineTangle, coalOre, ironOre, crystal, caveMushroom,
  cactus, desertShrub, sandstoneRock, copperRock, bonePile, snowPine, iceRock, frostBush, charredTree, obsidianRock, sulfurVent, basaltRock,
};

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

// ── Biyom süsleri ─────────────────────────────────────────
function tintedBoulder(base, under, top, topAmount) {
  return (rng, seed) => {
    const parts = [];
    parts.push(part(new THREE.IcosahedronGeometry(1, 1), base[seed % base.length], {
      y: 0.45, sx: 1.2, sy: 0.85, sz: 1.0, ry: rng() * 3, jitter: 0.2, seed, shade: 0.1,
    }));
    parts.push(part(new THREE.IcosahedronGeometry(0.45, 1), under, { x: 0.95, y: 0.15, z: 0.35, jitter: 0.08, seed: seed + 1, shade: 0.1 }));
    for (const p of parts) tintUpFaces(p, top, 0.6, topAmount);
    return merge(parts);
  };
}
const sandBoulder = tintedBoulder(['#c48a58', '#b57a4a', '#d29a64'], '#a86e40', '#e8c28c', 0.5);
const snowBoulder = tintedBoulder(['#7b8590', '#6f7884', '#858f99'], '#646d78', '#f2f6f9', 0.95);
function lavaBoulder(rng, seed) {
  const parts = [];
  parts.push(part(new THREE.IcosahedronGeometry(1, 1), seed % 2 ? '#3a3534' : '#2e2a29', { y: 0.4, sx: 1.25, sy: 0.8, sz: 1.0, ry: rng() * 3, jitter: 0.22, seed, shade: 0.12 }));
  for (let i = 0; i < 5; i++) {
    const a = rng() * Math.PI * 2;
    parts.push(part(new THREE.BoxGeometry(0.5, 0.05, 0.08), '#ff5a1f', { x: Math.cos(a) * 0.9, y: 0.45 + rng() * 0.2, z: Math.sin(a) * 0.75, ry: a, rz: 0.4, seed: seed + 10 + i }));
  }
  return merge(parts);
}

function dryGrass(rng, seed) {
  const parts = [];
  const cols = ['#c9b06a', '#b89d58', '#d8c27a'];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rng() * 0.5;
    const h = randRange(rng, 0.35, 0.7);
    const tilt = randRange(rng, 0.2, 0.6);
    parts.push(part(new THREE.ConeGeometry(0.03, h, 3), cols[i % 3], { x: Math.cos(a) * 0.08, y: h / 2, z: Math.sin(a) * 0.08, rx: Math.sin(a) * tilt, rz: -Math.cos(a) * tilt, seed: seed + i }));
  }
  return merge(parts);
}

function iceShard(rng, seed) {
  const parts = [];
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const d = i === 0 ? 0 : randRange(rng, 0.2, 0.5);
    const len = randRange(rng, 0.6, 1.6);
    const g = new THREE.OctahedronGeometry(0.5, 0);
    g.scale(0.28, len, 0.28);
    g.translate(0, len * 0.4, 0);
    parts.push(part(g, i % 2 ? '#bfeaff' : '#e6f9ff', { x: Math.cos(a) * d, z: Math.sin(a) * d, rx: Math.sin(a) * 0.5, rz: -Math.cos(a) * 0.5, seed: seed + i, shade: 0.12 }));
  }
  parts.push(part(new THREE.IcosahedronGeometry(0.45, 0), '#f2f6f9', { y: 0.05, sy: 0.35, seed: seed + 20 }));
  return merge(parts);
}

function skull(rng, seed) {
  const bone = '#efe6d2';
  return merge([
    part(new THREE.IcosahedronGeometry(0.22, 1), bone, { y: 0.14, sz: 1.35, seed, shade: 0.04 }),
    part(new THREE.BoxGeometry(0.07, 0.07, 0.03), '#3a3026', { x: -0.08, y: 0.19, z: 0.27, seed: seed + 1 }),
    part(new THREE.BoxGeometry(0.07, 0.07, 0.03), '#3a3026', { x: 0.08, y: 0.19, z: 0.27, seed: seed + 2 }),
    part(new THREE.ConeGeometry(0.05, 0.4, 5), bone, { x: 0.22, y: 0.25, z: 0.05, rz: -1.0, seed: seed + 3 }),
    part(new THREE.ConeGeometry(0.05, 0.4, 5), bone, { x: -0.22, y: 0.25, z: 0.05, rz: 1.0, seed: seed + 4 }),
  ]);
}

function ashSpire(rng, seed) {
  const parts = [];
  let y = 0;
  for (let i = 0; i < 3; i++) {
    const r = 0.9 - i * 0.22;
    parts.push(part(new THREE.DodecahedronGeometry(r, 0), i % 2 ? '#3e3836' : '#4a4442', {
      x: randRange(rng, -0.2, 0.2), y: y + r * 0.8, z: randRange(rng, -0.2, 0.2), sy: 1.5, ry: rng() * 3, jitter: 0.15, seed: seed + i, shade: 0.12,
    }));
    y += r * 1.6;
  }
  for (const p of parts) tintUpFaces(p, '#6d6863', 0.7, 0.5);
  return merge(parts);
}

const DECOR_BUILDERS = {
  boulder, crag, fern, bush, log, stump, mushrooms, shells, reeds, cloud,
  sandBoulder, snowBoulder, lavaBoulder, dryGrass, iceShard, skull, ashSpire,
};

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
  // yatak artık ayrı bir yapı (bkz. bed) — içerisi boş, yere hasır serili
  parts.push(part(new THREE.BoxGeometry(1.6, 0.03, 1.2), '#c9b071', { x: 0.4, y: 0.315, z: -0.6, seed: 492, shade: 0.08 }));
  return merge(parts);
}

function bed() {
  const parts = [];
  const wood = '#7a5636';
  // çerçeve + ayaklar
  parts.push(part(new THREE.BoxGeometry(1.12, 0.22, 2.05), wood, { y: 0.2, seed: 1500, shade: 0.05 }));
  for (const [x, z] of [[-0.5, -0.95], [0.5, -0.95], [-0.5, 0.95], [0.5, 0.95]]) {
    parts.push(part(new THREE.BoxGeometry(0.12, 0.2, 0.12), '#5f4430', { x, y: 0.05, z, seed: 1501 }));
  }
  // başlık
  parts.push(part(new THREE.BoxGeometry(1.16, 0.7, 0.1), '#6b4c30', { y: 0.45, z: -1.02, seed: 1502, shade: 0.05 }));
  parts.push(part(new THREE.BoxGeometry(1.24, 0.08, 0.14), '#8a6440', { y: 0.82, z: -1.02, seed: 1503 }));
  // saman şilte
  parts.push(part(new THREE.BoxGeometry(1.0, 0.16, 1.9), '#d8c27a', { y: 0.38, seed: 1504, shade: 0.05 }));
  // yün battaniye (kıvrık üst kenarlı) ve yastık
  parts.push(part(new THREE.BoxGeometry(1.06, 0.08, 1.25), '#b0524a', { y: 0.49, z: 0.3, seed: 1505, shade: 0.04 }));
  parts.push(part(new THREE.BoxGeometry(1.08, 0.1, 0.18), '#d9d2c2', { y: 0.52, z: -0.3, seed: 1506 }));
  for (let i = 0; i < 3; i++) parts.push(part(new THREE.BoxGeometry(1.07, 0.085, 0.06), '#e8dfc8', { y: 0.495, z: 0.05 + i * 0.4, seed: 1507 + i }));
  for (const side of [-1, 1]) parts.push(part(new THREE.BoxGeometry(0.06, 0.32, 1.25), '#a14a43', { x: side * 0.53, y: 0.36, z: 0.3, seed: 1510 }));
  parts.push(part(new THREE.BoxGeometry(0.62, 0.13, 0.34), '#f3ecda', { y: 0.53, z: -0.72, seed: 1511, jitter: 0.015 }));
  return merge(parts);
}

/** Dört direk üzerinde saz çatı. */
function gazebo() {
  const parts = [];
  for (const [x, z] of [[-1.45, -1.45], [1.45, -1.45], [-1.45, 1.45], [1.45, 1.45]]) {
    parts.push(beam(new THREE.Vector3(x, -0.4, z), new THREE.Vector3(x * 0.98, 2.55, z * 0.98), 0.13, 0.11, '#6f5035', 6, { seed: 1520 }));
  }
  for (const side of [-1, 1]) {
    parts.push(part(new THREE.BoxGeometry(3.2, 0.14, 0.14), '#5f4430', { y: 2.5, z: side * 1.45, seed: 1521 }));
    parts.push(part(new THREE.BoxGeometry(0.14, 0.14, 3.2), '#5f4430', { x: side * 1.45, y: 2.5, seed: 1522 }));
  }
  const roof = new THREE.ConeGeometry(2.75, 1.55, 4, 1, true);
  roof.rotateY(Math.PI / 4);
  parts.push(part(roof, '#c9a55a', { y: 3.3, seed: 1523, shade: 0.08, jitter: 0.05 }));
  const under = new THREE.ConeGeometry(2.7, 1.5, 4, 1, true);
  under.rotateY(Math.PI / 4);
  under.scale(1, 1, 1);
  const ug = under.toNonIndexed();
  // alt yüz (içeriden bakınca çatı görünsün)
  const pos = ug.attributes.position;
  for (let i = 0; i < pos.count; i += 3) {
    const ax = pos.getX(i), ay = pos.getY(i), az = pos.getZ(i);
    pos.setXYZ(i, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
    pos.setXYZ(i + 2, ax, ay, az);
  }
  parts.push(part(ug, '#a8853f', { y: 3.27, seed: 1524, shade: 0.06 }));
  parts.push(part(new THREE.ConeGeometry(0.22, 0.5, 4), '#8d6a32', { y: 4.25, seed: 1525 }));
  // saçak püskülleri
  for (let i = 0; i < 16; i++) {
    const side = Math.floor(i / 4);
    const t = ((i % 4) + 0.5) / 4 * 3.6 - 1.8;
    const [x, z] = [[t, -1.9], [1.9, t], [t, 1.9], [-1.9, t]][side];
    parts.push(part(new THREE.ConeGeometry(0.12, 0.45, 3), '#b8954c', { x, y: 2.42, z, rx: Math.PI, seed: 1530 + i }));
  }
  return merge(parts);
}

/** Verandalı kütük kulübe (kapı önde, iki yanda pencere). */
function cabin() {
  const parts = [];
  const logCols = ['#8a6440', '#7d5a39', '#94704a'];
  // taban, veranda, basamak, kazıklar
  parts.push(part(new THREE.BoxGeometry(5.3, 0.35, 5.1), '#8b6a45', { y: 0.175, seed: 1600, shade: 0.05 }));
  for (let i = 0; i < 6; i++) parts.push(part(new THREE.BoxGeometry(0.86, 0.05, 1.1), i % 2 ? '#9a7650' : '#8e6c47', { x: -2.2 + i * 0.88, y: 0.3, z: 3.0, seed: 1601 + i }));
  parts.push(part(new THREE.BoxGeometry(5.3, 0.25, 1.1), '#7a5a38', { y: 0.15, z: 3.0, seed: 1608 }));
  parts.push(part(new THREE.BoxGeometry(1.6, 0.6, 0.5), '#6f5133', { y: -0.45, z: 3.75, seed: 1609 }));
  for (const [x, z] of [[-2.5, -2.4], [2.5, -2.4], [-2.5, 2.4], [2.5, 2.4], [-2.5, 3.45], [2.5, 3.45]]) {
    parts.push(part(new THREE.CylinderGeometry(0.13, 0.15, 2.6, 6), '#5f4630', { x, y: -1.15, z, seed: 1610 }));
  }
  // kütük duvarlar: 8 sıra
  const rows = 8;
  const rowH = 0.29;
  const logX = (x0, x1, y, z, seed) => {
    const len = x1 - x0;
    const g = new THREE.CylinderGeometry(0.15, 0.15, len, 7);
    g.rotateZ(Math.PI / 2);
    parts.push(part(g, logCols[seed % 3], { x: (x0 + x1) / 2, y, z, seed, shade: 0.05 }));
  };
  const logZ = (z0, z1, y, x, seed) => {
    const len = z1 - z0;
    const g = new THREE.CylinderGeometry(0.15, 0.15, len, 7);
    g.rotateX(Math.PI / 2);
    parts.push(part(g, logCols[seed % 3], { x, y, z: (z0 + z1) / 2, seed, shade: 0.05 }));
  };
  for (let r = 0; r < rows; r++) {
    const y = 0.5 + r * rowH;
    const window = r >= 3 && r <= 5;
    // arka duvar (pencereli)
    if (window) {
      logX(-2.6, -0.6, y, -2.35, 1620 + r);
      logX(0.6, 2.6, y, -2.35, 1640 + r);
    } else logX(-2.6, 2.6, y, -2.35, 1620 + r);
    // ön duvar (kapı boşluğu)
    if (r < 7) {
      logX(-2.6, -0.65, y, 2.35, 1660 + r);
      logX(0.65, 2.6, y, 2.35, 1680 + r);
    } else logX(-2.6, 2.6, y, 2.35, 1660 + r);
    // yan duvarlar (pencereli)
    for (const side of [-1, 1]) {
      if (window) {
        logZ(-2.45, -0.6, y + 0.14, side * 2.45, 1700 + r + side * 20);
        logZ(0.6, 2.45, y + 0.14, side * 2.45, 1740 + r + side * 20);
      } else logZ(-2.45, 2.45, y + 0.14, side * 2.45, 1700 + r + side * 20);
    }
  }
  // duvar üstü kirişleri (çatı ile duvar arasında boşluk kalmasın)
  for (const side of [-1, 1]) {
    parts.push(part(new THREE.BoxGeometry(0.32, 0.62, 5.1), '#6f5035', { x: side * 2.45, y: 2.95, seed: 1776, shade: 0.04 }));
    parts.push(part(new THREE.BoxGeometry(5.2, 0.36, 0.32), '#6f5035', { y: 2.84, z: side * 2.35, seed: 1777, shade: 0.04 }));
  }
  // pencere ve kapı kasaları
  for (const side of [-1, 1]) {
    parts.push(part(new THREE.BoxGeometry(0.2, 1.0, 1.3), '#6b4c30', { x: side * 2.45, y: 1.6, seed: 1780, sx: 1 }));
    parts.push(part(new THREE.BoxGeometry(0.06, 0.92, 1.18), '#9fd1e0', { x: side * 2.48, y: 1.6, seed: 1781 }));
  }
  parts.push(part(new THREE.BoxGeometry(1.3, 1.0, 0.2), '#6b4c30', { y: 1.6, z: -2.35, seed: 1782 }));
  parts.push(part(new THREE.BoxGeometry(1.18, 0.92, 0.06), '#9fd1e0', { y: 1.6, z: -2.38, seed: 1783 }));
  parts.push(part(new THREE.BoxGeometry(1.5, 0.2, 0.25), '#5f4430', { y: 2.5, z: 2.35, seed: 1784 }));
  // beşik çatı (sırt z ekseni boyunca) + veranda üstü
  const slope = 0.62;
  const roofW = 3.35;
  for (const side of [-1, 1]) {
    const g = new THREE.BoxGeometry(roofW, 0.14, 6.9);
    parts.push(part(g, '#7b4a32', {
      x: side * Math.cos(slope) * roofW / 2 * 0.98, y: 2.95 + Math.sin(slope) * roofW / 2, z: 0.55, rz: -side * slope, seed: 1790 + side, shade: 0.05,
    }));
    // kiremit çizgileri
    for (let k = 0; k < 4; k++) {
      const d = (k + 0.5) / 4 * roofW;
      parts.push(part(new THREE.BoxGeometry(0.06, 0.05, 6.95), '#5e3626', {
        x: side * Math.cos(slope) * d, y: 2.95 + Math.sin(slope) * d + 0.09, z: 0.55, rz: -side * slope, seed: 1795 + k,
      }));
    }
  }
  // üçgen alınlıklar
  const gable = new THREE.CylinderGeometry(1, 1, 0.16, 3, 1);
  gable.rotateX(Math.PI / 2);
  gable.rotateZ(Math.PI / 2);
  for (const z of [-2.35, 2.35]) {
    parts.push(part(gable.clone(), '#8a6440', { y: 2.95 + 0.62, z, sx: 2.6 * 1.15, sy: 1.25, seed: 1800, shade: 0.05 }));
  }
  // veranda direkleri
  for (const x of [-2.5, 2.5]) parts.push(beam(new THREE.Vector3(x, 0.3, 3.45), new THREE.Vector3(x, 2.95, 3.45), 0.1, 0.09, '#6f5035', 6, { seed: 1810 }));
  parts.push(part(new THREE.BoxGeometry(5.3, 0.12, 0.12), '#5f4430', { y: 2.9, z: 3.45, seed: 1811 }));
  // baca
  parts.push(part(new THREE.BoxGeometry(0.55, 1.6, 0.55), '#7d786f', { x: 1.5, y: 4.0, z: -1.4, seed: 1812, jitter: 0.03, shade: 0.08 }));
  return merge(parts);
}

/** Taş duvarlı, kiremit çatılı, bacalı ev. */
function stoneHouse() {
  const parts = [];
  const stones = ['#8c877e', '#7b776f', '#99938a', '#857f76'];
  parts.push(part(new THREE.BoxGeometry(6.4, 0.45, 5.9), '#6f6a62', { y: 0.18, seed: 1900, shade: 0.06 }));
  for (let i = 0; i < 7; i++) parts.push(part(new THREE.BoxGeometry(0.8, 0.04, 5.0), i % 2 ? '#9a7650' : '#8e6c47', { x: -2.4 + i * 0.8, y: 0.42, seed: 1901 + i }));
  parts.push(part(new THREE.BoxGeometry(1.8, 0.5, 0.6), '#77736b', { y: -0.2, z: 3.15, seed: 1909 }));
  for (const [x, z] of [[-3.1, -2.8], [3.1, -2.8], [-3.1, 2.8], [3.1, 2.8]]) {
    parts.push(part(new THREE.BoxGeometry(0.7, 2.8, 0.7), '#77736b', { x, y: -1.2, z, seed: 1910, jitter: 0.05 }));
  }
  // taş bloklar
  const rng = mulberry32(1920);
  const block = (x, y, z, w, d, seed) => parts.push(part(new THREE.BoxGeometry(w, 0.52, d), stones[seed % 4], { x, y, z, seed, jitter: 0.03, shade: 0.07 }));
  const rows = 6;
  for (let r = 0; r < rows; r++) {
    const y = 0.7 + r * 0.53;
    const off = r % 2 ? 0.45 : 0;
    const window = r === 2 || r === 3;
    // ön ve arka
    for (const zSide of [-1, 1]) {
      for (let x = -3.1 + off; x < 3.1; x += 0.9) {
        const w = Math.min(0.88, 3.1 - x);
        const cx = x + w / 2;
        if (zSide === 1 && Math.abs(cx) < 0.75 && r < 4) continue; // kapı
        if (zSide === -1 && window && Math.abs(cx) < 0.7) continue; // arka pencere
        block(cx, y, zSide * 2.55, w, 0.58, 1930 + r * 20 + Math.round(x * 3) + (zSide > 0 ? 7 : 0));
      }
    }
    // yanlar
    for (const xSide of [-1, 1]) {
      for (let z = -2.25 + off; z < 2.25; z += 0.9) {
        const d = Math.min(0.88, 2.25 - z);
        const cz = z + d / 2;
        if (window && Math.abs(cz) < 0.7) continue;
        block(xSide * 2.85, y, cz, 0.58, d, 2100 + r * 20 + Math.round(z * 3) + (xSide > 0 ? 9 : 0));
      }
    }
  }
  void rng;
  // kapı lentosu, pencere kasaları
  parts.push(part(new THREE.BoxGeometry(2.0, 0.3, 0.7), '#6e6a72', { y: 2.75, z: 2.55, seed: 2300 }));
  for (const xSide of [-1, 1]) {
    parts.push(part(new THREE.BoxGeometry(0.62, 1.2, 1.5), '#5f4430', { x: xSide * 2.85, y: 2.0, seed: 2301 }));
    parts.push(part(new THREE.BoxGeometry(0.66, 1.0, 1.3), '#9fd1e0', { x: xSide * 2.85, y: 2.0, seed: 2302 }));
  }
  parts.push(part(new THREE.BoxGeometry(1.5, 1.2, 0.62), '#5f4430', { y: 2.0, z: -2.55, seed: 2303 }));
  parts.push(part(new THREE.BoxGeometry(1.3, 1.0, 0.66), '#9fd1e0', { y: 2.0, z: -2.55, seed: 2304 }));
  // kırma kiremit çatı
  const roof = new THREE.ConeGeometry(1, 1, 4, 1);
  roof.rotateY(Math.PI / 4);
  parts.push(part(roof, '#8a4a3a', { y: 3.95 + 1.1, sx: 5.1, sy: 2.2, sz: 4.7, seed: 2310, shade: 0.06 }));
  parts.push(part(new THREE.BoxGeometry(6.8, 0.18, 6.2), '#6e3a2e', { y: 3.92, seed: 2311 }));
  // baca
  parts.push(part(new THREE.BoxGeometry(0.75, 2.6, 0.75), '#7d786f', { x: -1.9, y: 4.9, z: -1.5, seed: 2312, jitter: 0.04, shade: 0.08 }));
  parts.push(part(new THREE.BoxGeometry(0.9, 0.18, 0.9), '#6e6a72', { x: -1.9, y: 6.25, z: -1.5, seed: 2313 }));
  return merge(parts);
}

/** Kristal fener: taş kaide, ahşap direk, tepede kafes (kristal ayrı, parlayan malzemeyle çizilir). */
function crystalLamp() {
  const parts = [];
  parts.push(part(new THREE.CylinderGeometry(0.3, 0.36, 0.25, 7), '#7d786f', { y: 0.12, seed: 2400, jitter: 0.02 }));
  parts.push(part(new THREE.CylinderGeometry(0.06, 0.08, 1.3, 6), '#6b4c30', { y: 0.85, seed: 2401 }));
  parts.push(part(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 6), '#5f4430', { y: 1.5, seed: 2402 }));
  parts.push(part(new THREE.ConeGeometry(0.26, 0.25, 6), '#5f4430', { y: 1.98, seed: 2403 }));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    parts.push(part(new THREE.BoxGeometry(0.03, 0.42, 0.03), '#4a3420', { x: Math.cos(a) * 0.17, y: 1.72, z: Math.sin(a) * 0.17, seed: 2404 }));
  }
  return merge(parts);
}

/** Kütüklerden bağlanmış sal. Orijin su hizasında. */
function raftModel() {
  const parts = [];
  const cols = ['#8a6440', '#7d5a39', '#94704a', '#866142'];
  for (let i = 0; i < 7; i++) {
    const x = -0.96 + i * 0.32;
    const g = new THREE.CylinderGeometry(0.165, 0.165, 3.3 + (i % 2) * 0.15, 7);
    g.rotateX(Math.PI / 2);
    parts.push(part(g, cols[i % 4], { x, y: 0.02, z: (i % 3) * 0.05, seed: 2500 + i, shade: 0.05 }));
  }
  for (const z of [-1.2, 0, 1.2]) {
    parts.push(part(new THREE.BoxGeometry(2.3, 0.1, 0.18), '#6b4c30', { y: 0.2, z, seed: 2510 }));
    for (const x of [-0.8, 0.8]) parts.push(part(new THREE.TorusGeometry(0.19, 0.035, 4, 8), '#cdb88a', { x, y: 0.05, z, ry: Math.PI / 2, seed: 2511 }));
  }
  // oturak sandık
  parts.push(part(new THREE.BoxGeometry(0.7, 0.3, 0.5), '#9b7547', { y: 0.38, z: -0.6, seed: 2512, shade: 0.05 }));
  // yan duran kürek
  parts.push(beam(new THREE.Vector3(0.75, 0.25, -1.4), new THREE.Vector3(0.82, 0.3, 1.0), 0.03, 0.03, '#7b5a3a', 5, { seed: 2513 }));
  parts.push(part(new THREE.BoxGeometry(0.2, 0.03, 0.5), '#8a6440', { x: 0.83, y: 0.31, z: 1.2, seed: 2514 }));
  return merge(parts);
}

/** Yün yelkenli küçük tekne. Orijin su hizasında, burun +Z. */
function boatModel() {
  const parts = [];
  const g = new THREE.BoxGeometry(1.9, 0.9, 5.0, 2, 2, 8);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = (z + 2.5) / 5; // 0 kıç → 1 burun
    let narrow = t > 0.6 ? 1 - Math.pow((t - 0.6) / 0.4, 1.4) * 0.97 : 1;
    if (t < 0.12) narrow *= 0.82 + t * 1.5;
    const keel = y < 0 ? 0.42 : 1;
    pos.setX(i, x * narrow * keel);
    if (y > 0) pos.setY(i, y + Math.pow(Math.max(0, t - 0.7) / 0.3, 2) * 0.35);
  }
  parts.push(part(g, '#7a5232', { y: 0.05, seed: 2600, shade: 0.05 }));
  parts.push(part(new THREE.BoxGeometry(1.55, 0.05, 3.6), '#a0784c', { y: 0.33, z: -0.3, seed: 2601 }));
  // küpeşte şeridi
  for (const side of [-1, 1]) parts.push(part(new THREE.BoxGeometry(0.08, 0.1, 3.8), '#5e3d24', { x: side * 0.93, y: 0.52, z: -0.4, seed: 2602 }));
  // oturaklar
  parts.push(part(new THREE.BoxGeometry(1.6, 0.08, 0.35), '#8a6440', { y: 0.42, z: -1.35, seed: 2603 }));
  parts.push(part(new THREE.BoxGeometry(1.4, 0.08, 0.35), '#8a6440', { y: 0.42, z: 0.9, seed: 2604 }));
  // direk, bumba, yelken
  parts.push(part(new THREE.CylinderGeometry(0.06, 0.08, 4.4, 6), '#6b4c30', { y: 2.5, z: 0.6, seed: 2605 }));
  parts.push(beam(new THREE.Vector3(0, 1.2, 0.6), new THREE.Vector3(0, 1.3, -1.9), 0.045, 0.04, '#6b4c30', 5, { seed: 2606 }));
  const sail = new THREE.BufferGeometry();
  const v = [0, 4.5, 0.62, 0, 1.3, 0.62, 0, 1.36, -1.85];
  sail.setAttribute('position', new THREE.Float32BufferAttribute([...v, v[0], v[1], v[2], v[6], v[7], v[8], v[3], v[4], v[5]], 3));
  sail.computeVertexNormals();
  parts.push(part(sail, '#efe6d0', { x: 0.03, seed: 2607, shade: 0.04 }));
  parts.push(part(new THREE.BoxGeometry(0.02, 0.5, 0.9), '#c9553f', { x: 0.04, y: 2.4, z: -0.05, seed: 2608 }));
  // dümen
  parts.push(part(new THREE.BoxGeometry(0.06, 0.7, 0.4), '#6b4c30', { y: -0.1, z: -2.55, seed: 2609 }));
  parts.push(beam(new THREE.Vector3(0, 0.25, -2.5), new THREE.Vector3(0, 0.6, -1.7), 0.03, 0.03, '#5e3d24', 5, { seed: 2610 }));
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

const BUILDING_BUILDERS = {
  campfire, hut, chest, workbench, bed, gazebo, cabin, stone_house: stoneHouse, crystal_lamp: crystalLamp,
  raft: raftModel, boat: boatModel,
};

/** Devrilen ağacın geride bıraktığı kütük (taze kesik yüzeyli). Yarıçap ~1 birim; ağaca göre ölçeklenir. */
export function buildTreeStumpGeometry() {
  const parts = [];
  parts.push(part(new THREE.CylinderGeometry(0.42, 0.5, 0.55, 8), '#6e4f36', { y: 0.12, seed: 2700, shade: 0.08, jitter: 0.02 }));
  parts.push(part(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 8), '#d0ab73', { y: 0.4, seed: 2701 }));
  parts.push(part(new THREE.CylinderGeometry(0.24, 0.24, 0.045, 8), '#b88f58', { y: 0.405, seed: 2702 }));
  parts.push(part(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 6), '#a07a48', { y: 0.41, seed: 2703 }));
  // kırık kıymıklar
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1;
    parts.push(part(new THREE.ConeGeometry(0.07, 0.22, 3), '#c49c64', { x: Math.cos(a) * 0.3, y: 0.5, z: Math.sin(a) * 0.3, seed: 2704 + i }));
  }
  return merge(parts);
}

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

function heldKnife() {
  return merge([
    part(new THREE.CylinderGeometry(0.028, 0.03, 0.16, 5), '#6b4c30', { y: 0.02, seed: 740 }),
    part(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 5), '#b9c65c', { y: 0.11, seed: 741 }),
    part(new THREE.BoxGeometry(0.015, 0.22, 0.06), '#a8a39a', { y: 0.24, z: 0.005, seed: 742, jitter: 0.004 }),
    part(new THREE.ConeGeometry(0.03, 0.07, 3), '#b8b3a8', { y: 0.38, sz: 0.4, seed: 743 }),
  ]);
}

function heldRod() {
  return merge([
    part(new THREE.CylinderGeometry(0.015, 0.03, 1.6, 5), '#8b6a45', { y: 0.6, seed: 750 }),
    part(new THREE.TorusGeometry(0.05, 0.015, 4, 8), '#cdb88a', { y: 0.15, ry: Math.PI / 2, seed: 751 }),
    part(new THREE.BoxGeometry(0.006, 0.9, 0.006), '#efe6d0', { y: 0.95, z: 0.12, rx: 0.3, seed: 752 }),
    part(new THREE.ConeGeometry(0.03, 0.08, 4), '#e8f0ff', { y: 0.5, z: 0.28, seed: 753 }),
  ]);
}

function heldPaddle() {
  return merge([
    part(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 5), '#7b5a3a', { y: 0.35, seed: 760 }),
    part(new THREE.BoxGeometry(0.04, 0.5, 0.2), '#8a6440', { y: 1.25, seed: 761 }),
  ]);
}

/** Kavisli pala: deri sargılı kabza, siper ve parça parça kıvrılan bakır ağız. */
function heldScimitar() {
  const parts = [
    part(new THREE.CylinderGeometry(0.03, 0.032, 0.2, 6), '#5a3a22', { y: 0.02, seed: 770 }),
    part(new THREE.TorusGeometry(0.032, 0.008, 4, 8), '#3d2716', { y: 0.06, rx: Math.PI / 2, seed: 771 }),
    part(new THREE.BoxGeometry(0.2, 0.035, 0.05), '#c9a14a', { y: 0.135, seed: 772 }),
    part(new THREE.SphereGeometry(0.03, 6, 4), '#c9a14a', { y: -0.09, seed: 773 }),
  ];
  let x = 0;
  let y = 0.15;
  let a = 0;
  for (let i = 0; i < 6; i++) {
    const len = 0.12;
    const w = 0.07 - i * 0.004;
    parts.push(part(new THREE.BoxGeometry(0.014, len, w), i % 2 ? '#d98a4a' : '#e39b5c', { x: 0, y: y + Math.cos(a) * len / 2, z: x + Math.sin(a) * len / 2, rx: a, seed: 774 + i }));
    // ağzın parlak kenarı
    parts.push(part(new THREE.BoxGeometry(0.016, len, 0.012), '#f6c08a', { x: 0, y: y + Math.cos(a) * len / 2 + Math.sin(a) * w * 0.5, z: x + Math.sin(a) * len / 2 - Math.cos(a) * w * 0.5 + 0.0, rx: a, seed: 790 + i }));
    y += Math.cos(a) * len;
    x += Math.sin(a) * len;
    a -= 0.11;
  }
  parts.push(part(new THREE.ConeGeometry(0.035, 0.1, 4), '#e39b5c', { y: y + 0.03, z: x - 0.01, rx: a, sz: 0.3, seed: 800 }));
  return merge(parts);
}

function heldCopperPickaxe() {
  return merge([
    part(new THREE.CylinderGeometry(0.03, 0.035, 0.78, 5), '#6b4a2e', { y: 0.26, seed: 810 }),
    part(new THREE.BoxGeometry(0.06, 0.08, 0.3), '#d27a3b', { y: 0.6, z: 0.13, rx: 0.35, seed: 811 }),
    part(new THREE.BoxGeometry(0.06, 0.08, 0.3), '#d27a3b', { y: 0.6, z: -0.13, rx: -0.35, seed: 812 }),
    part(new THREE.ConeGeometry(0.035, 0.08, 4), '#f2a66b', { y: 0.55, z: 0.3, rx: 2.2, seed: 813 }),
    part(new THREE.ConeGeometry(0.035, 0.08, 4), '#f2a66b', { y: 0.55, z: -0.3, rx: -2.2, seed: 814 }),
    part(new THREE.BoxGeometry(0.08, 0.11, 0.09), '#8a5a34', { y: 0.6, seed: 815 }),
  ]);
}

function heldIceSword() {
  return merge([
    part(new THREE.CylinderGeometry(0.028, 0.03, 0.22, 6), '#3d4a5a', { y: 0.02, seed: 820 }),
    part(new THREE.OctahedronGeometry(0.04, 0), '#9fb4c8', { y: -0.11, seed: 821 }),
    part(new THREE.BoxGeometry(0.26, 0.04, 0.06), '#aab1ba', { y: 0.14, seed: 822 }),
    part(new THREE.OctahedronGeometry(0.035, 0), '#7fdcff', { x: 0.13, y: 0.14, seed: 823 }),
    part(new THREE.OctahedronGeometry(0.035, 0), '#7fdcff', { x: -0.13, y: 0.14, seed: 824 }),
    part(new THREE.BoxGeometry(0.075, 0.62, 0.02), '#a8e6ff', { y: 0.47, seed: 825 }),
    part(new THREE.BoxGeometry(0.02, 0.6, 0.026), '#e6f9ff', { y: 0.47, seed: 826 }),
    part(new THREE.ConeGeometry(0.053, 0.12, 4), '#c9f0ff', { y: 0.84, ry: Math.PI / 4, sz: 0.35, seed: 827 }),
  ]);
}

function heldObsidianSword() {
  const parts = [
    part(new THREE.CylinderGeometry(0.03, 0.032, 0.22, 6), '#3a1f1a', { y: 0.02, seed: 830 }),
    part(new THREE.SphereGeometry(0.035, 6, 4), '#c9a14a', { y: -0.1, seed: 831 }),
    part(new THREE.BoxGeometry(0.28, 0.05, 0.07), '#c9a14a', { y: 0.14, seed: 832 }),
    part(new THREE.OctahedronGeometry(0.04, 0), '#ff5a1f', { y: 0.14, z: 0.04, seed: 833 }),
  ];
  // tırtıklı, katman katman obsidyen ağız ve kızıl parlak kenar
  for (let i = 0; i < 6; i++) {
    const y = 0.22 + i * 0.11;
    const w = 0.11 - i * 0.008;
    parts.push(part(new THREE.BoxGeometry(w, 0.12, 0.03), i % 2 ? '#1c1726' : '#2a2236', { y, rz: (i % 2 ? 0.06 : -0.06), seed: 834 + i, jitter: 0.006 }));
    parts.push(part(new THREE.BoxGeometry(0.012, 0.12, 0.032), '#ff6a2a', { x: w / 2, y, seed: 850 + i }));
  }
  parts.push(part(new THREE.ConeGeometry(0.055, 0.16, 4), '#1c1726', { y: 0.95, ry: Math.PI / 4, sz: 0.4, seed: 860 }));
  return merge(parts);
}

const HELD_BUILDERS = {
  axe: heldAxe, pickaxe: heldPickaxe, spear: heldSpear, torch: heldTorch, knife: heldKnife, rod: heldRod, paddle: heldPaddle,
  scimitar: heldScimitar, copper_pickaxe: heldCopperPickaxe, ice_sword: heldIceSword, obsidian_sword: heldObsidianSword,
};

export function buildHeldGeometry(key) {
  return HELD_BUILDERS[key] ? HELD_BUILDERS[key]() : null;
}

/** Tüm prosedürel modellerin paylaştığı malzeme. */
export const sharedMaterials = {
  standard: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  // ışık almadan kendi renginde parlayan (kristaller, mağara mantarları)
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
};

// ── Rüzgâr ────────────────────────────────────────────────
// Tüm sallanan bitkiler aynı zaman/şiddet değerini paylaşır (WorldManager günceller).
export const windUniforms = { uWindTime: { value: 0 }, uWindStrength: { value: 1 } };

/**
 * Köşe gölgelendiricisine rüzgâr salınımı ekler: yükseklikle artan eğilme (dünya uzayında
 * ortak rüzgâr yönü) + yeşil köşelerde (yapraklar) hafif titreşim.
 * height: modelin tepe yüksekliği (yerel birim), amp: tepede salınım (m), flutter: yaprak titreşimi.
 */
function injectWind(shader, { height = 10, amp = 0.3, flutter = 0.03 } = {}) {
  shader.uniforms.uWindTime = windUniforms.uWindTime;
  shader.uniforms.uWindStrength = windUniforms.uWindStrength;
  const useColor = flutter > 0;
  shader.vertexShader = 'uniform float uWindTime;\nuniform float uWindStrength;\n' + shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
     {
       vec3 wBase = modelMatrix[3].xyz;
       #ifdef USE_INSTANCING
         wBase += instanceMatrix[3].xyz;
       #endif
       float wH = clamp(transformed.y / ${height.toFixed(2)}, 0.0, 1.4);
       float wPh = wBase.x * 0.045 + wBase.z * 0.037;
       float gust = 0.55 + 0.45 * sin(uWindTime * 0.31 + wBase.x * 0.013 + wBase.z * 0.007);
       float bend = wH * wH * ${amp.toFixed(3)} * gust * uWindStrength;
       vec3 windWorld = vec3(sin(uWindTime * 1.25 + wPh) + 0.35, 0.0, sin(uWindTime * 0.95 + wPh * 1.3) * 0.55) * bend;
       #ifdef USE_INSTANCING
         mat3 wIm = mat3(instanceMatrix);
         vec3 windLocal = (transpose(wIm) * windWorld) / max(dot(wIm[0], wIm[0]), 1e-4);
       #else
         vec3 windLocal = windWorld;
       #endif
       transformed += windLocal;
       ${useColor ? `
       #ifdef USE_COLOR
         float wLeaf = step(color.r * 1.08 + 0.02, color.g);
         transformed += vec3(
           sin(uWindTime * 6.1 + transformed.x * 2.7 + wPh * 9.0),
           sin(uWindTime * 7.3 + transformed.z * 2.3) * 0.6,
           cos(uWindTime * 5.4 + transformed.y * 2.1 + wPh * 7.0)
         ) * ${flutter.toFixed(3)} * wLeaf * wH * (0.6 + gust * 0.6) * uWindStrength;
       #endif` : ''}
     }`,
  );
}

/** Rüzgârda sallanan bitkiler için malzeme (çalılar, eğreltiler, sazlar). */
export function createWindMaterial(opts) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  mat.onBeforeCompile = (shader) => injectWind(shader, opts);
  mat.customProgramCacheKey = () => `wind-${opts?.height}-${opts?.amp}`;
  return mat;
}

/** Gölge geçişinde de salınım (gölgeler ağaçla birlikte sallansın). */
export function createWindDepthMaterial(opts) {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  mat.onBeforeCompile = (shader) => injectWind(shader, { ...opts, flutter: 0 });
  mat.customProgramCacheKey = () => `wind-depth-${opts?.height}-${opts?.amp}`;
  return mat;
}

/**
 * Kamera ile oyuncu arasında kalan (ya da kameraya çok yakın) parçaları ekran-kapısı
 * (dither) desenle gizleyen malzeme. Ağaçlar oyuncuyu kapatmaz, kamera da yaprakların
 * içine girince görüş kaybolmaz.
 * uniforms: { uCamPos, uFocus: { value: Vector3 }, uNear: { value: 0..1 } }
 */
export function createOccluderFadeMaterial(uniforms, wind = null) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  if (wind) mat.customProgramCacheKey = () => `occ-wind-${wind.height}-${wind.amp}`;
  mat.onBeforeCompile = (shader) => {
    if (wind) injectWind(shader, wind);
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

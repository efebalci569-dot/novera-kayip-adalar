import * as THREE from 'three';
import { part, merge, sharedMaterials } from './Models.js';

// Saldırgan canlıların ve muhafızların (boss) düşük poligonlu, eklemli modelleri ve
// prosedürel animasyonları. Modeller +Z yönüne bakar; kök (root) yerdedir.
//
// animateCreature(model, state):
//   state = { t, speed (0..1+), attack: 0..1 | -1, windup: 0..1, hurt: 0..1, dead, deathT, kind }

const geoCache = {};
const cached = (key, fn) => (geoCache[key] ??= fn());
const H = Math.PI / 2;

function mesh(geo, mat = sharedMaterials.standard) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = mat === sharedMaterials.standard;
  return m;
}

function group(x = 0, y = 0, z = 0, ...children) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  for (const c of children) g.add(c);
  return g;
}

const box = (w, h, d, color, o = {}) => part(new THREE.BoxGeometry(w, h, d), color, o);
const cone = (r, h, color, o = {}, seg = 5) => part(new THREE.ConeGeometry(r, h, seg), color, o);
const ball = (r, color, o = {}, detail = 1) => part(new THREE.IcosahedronGeometry(r, detail), color, o);

// ── Akrep (Kum Kralı da bunun büyütülmüşü) ───────────────────
function scorpion(colors, crown = false) {
  const key = `scorpion:${colors.body}:${crown}`;
  const g = cached(key, () => ({
    body: merge([
      box(0.75, 0.32, 0.6, colors.body, { z: 0.25, seed: 6000, shade: 0.06 }),
      box(0.68, 0.3, 0.45, colors.dark, { z: -0.25, seed: 6001, shade: 0.06 }),
      box(0.56, 0.26, 0.35, colors.body, { z: -0.6, seed: 6002 }),
      box(0.5, 0.22, 0.3, colors.dark, { z: 0.62, y: -0.02, seed: 6003 }),
      box(0.6, 0.05, 0.5, colors.plate, { y: 0.17, z: 0.25, seed: 6004 }),
      box(0.55, 0.05, 0.38, colors.plate, { y: 0.16, z: -0.25, seed: 6005 }),
      box(0.06, 0.06, 0.04, '#120c08', { x: -0.12, y: 0.06, z: 0.78, seed: 6006 }),
      box(0.06, 0.06, 0.04, '#120c08', { x: 0.12, y: 0.06, z: 0.78, seed: 6007 }),
      ...(crown ? [
        box(0.42, 0.08, 0.3, '#ffd166', { y: 0.2, z: 0.6, seed: 6008 }),
        cone(0.05, 0.16, '#ffd166', { x: -0.14, y: 0.3, z: 0.6, seed: 6009 }, 4),
        cone(0.06, 0.2, '#ffd166', { y: 0.32, z: 0.62, seed: 6010 }, 4),
        cone(0.05, 0.16, '#ffd166', { x: 0.14, y: 0.3, z: 0.6, seed: 6011 }, 4),
        ball(0.04, '#e63946', { y: 0.27, z: 0.76, seed: 6012 }, 0),
      ] : []),
    ]),
    leg: merge([
      box(0.4, 0.06, 0.06, colors.dark, { x: 0.2, y: 0.05, rz: 0.35, seed: 6020 }),
      box(0.06, 0.32, 0.06, colors.dark, { x: 0.4, y: -0.1, rz: -0.25, seed: 6021 }),
    ]),
    arm: merge([
      box(0.1, 0.1, 0.45, colors.body, { z: 0.22, seed: 6030 }),
      box(0.2, 0.14, 0.28, colors.plate, { z: 0.55, seed: 6031 }),
    ]),
    jaw: merge([box(0.07, 0.08, 0.28, colors.dark, { z: 0.12, seed: 6040 })]),
    seg: merge([box(0.2, 0.2, 0.28, colors.body, { z: 0.12, seed: 6050 }), box(0.22, 0.05, 0.2, colors.plate, { y: 0.1, z: 0.12, seed: 6051 })]),
    sting: merge([ball(0.14, colors.dark, { z: 0.08, seed: 6060 }, 0), cone(0.07, 0.3, '#e8d26b', { z: 0.25, rx: H, seed: 6061 }, 5)]),
  }));
  const root = new THREE.Group();
  const body = group(0, 0.42, 0, mesh(g.body));
  root.add(body);
  const legs = [];
  for (let i = 0; i < 4; i++) {
    for (const side of [-1, 1]) {
      const l = group(side * 0.34, 0, 0.35 - i * 0.26, mesh(g.leg));
      l.scale.x = side;
      l.rotation.y = side * (0.3 - i * 0.2);
      body.add(l);
      legs.push(l);
    }
  }
  const arms = [-1, 1].map((side) => {
    const a = group(side * 0.3, 0, 0.62, mesh(g.arm));
    a.rotation.y = side * 0.35;
    const jaw = group(side * 0.06, 0, 0.62, mesh(g.jaw));
    a.add(jaw);
    a.userData.jaw = jaw;
    body.add(a);
    return a;
  });
  // kuyruk: iç içe segmentler, sırt üzerinden öne kıvrılır
  const tail = [];
  let parent = body;
  let pos = [0, 0.05, -0.75];
  for (let i = 0; i < 5; i++) {
    const s = group(pos[0], pos[1], pos[2], mesh(i === 4 ? g.sting : g.seg));
    s.rotation.x = i === 0 ? -0.9 : -0.42;
    s.scale.setScalar(1 - i * 0.08);
    parent.add(s);
    tail.push(s);
    parent = s;
    pos = [0, 0, 0.26];
  }
  return { root, body, legs, arms, tail, kind: 'scorpion', centerY: 0.42 };
}

// ── Dört ayaklılar (sırtlan, kurt) ──────────────────────────
function quadruped(c, opts) {
  const key = `quad:${c.coat}`;
  const g = cached(key, () => ({
    body: merge([
      box(0.56, 0.55, 1.15, c.coat, { y: 0, seed: 6100, shade: 0.06 }),
      box(0.6, 0.62, 0.45, c.chest, { y: 0.04, z: 0.4, seed: 6101 }),
      ...(opts.mane ? [box(0.2, 0.3, 0.9, c.dark, { y: 0.33, z: 0.1, seed: 6102 })] : []),
      ...(opts.spots ? [0, 1, 2, 3].map((i) => box(0.58, 0.14, 0.14, c.dark, { y: 0.1 - (i % 2) * 0.2, z: -0.4 + i * 0.24, seed: 6103 + i })) : []),
    ]),
    head: merge([
      box(0.4, 0.38, 0.42, c.coat, { seed: 6110 }),
      box(0.24, 0.2, 0.36, c.snout, { y: -0.06, z: 0.34, seed: 6111 }),
      box(0.1, 0.07, 0.05, '#1b1512', { y: -0.0, z: 0.53, seed: 6112 }),
      cone(0.09, 0.22, c.dark, { x: -0.13, y: 0.27, z: -0.05, seed: 6113 }, 4),
      cone(0.09, 0.22, c.dark, { x: 0.13, y: 0.27, z: -0.05, seed: 6114 }, 4),
      box(0.06, 0.05, 0.03, c.eye, { x: -0.11, y: 0.06, z: 0.21, seed: 6115 }),
      box(0.06, 0.05, 0.03, c.eye, { x: 0.11, y: 0.06, z: 0.21, seed: 6116 }),
    ]),
    jaw: merge([box(0.2, 0.06, 0.3, c.snout, { z: 0.15, seed: 6117 }), cone(0.02, 0.06, '#f6efe0', { x: 0.06, y: 0.05, z: 0.25, rx: Math.PI, seed: 6118 }, 3), cone(0.02, 0.06, '#f6efe0', { x: -0.06, y: 0.05, z: 0.25, rx: Math.PI, seed: 6119 }, 3)]),
    leg: merge([box(0.14, 0.62, 0.14, c.coat, { y: -0.31, seed: 6120 }), box(0.15, 0.08, 0.2, c.dark, { y: -0.62, z: 0.03, seed: 6121 })]),
    tail: merge([cone(0.12, opts.bushy ? 0.7 : 0.5, opts.bushy ? c.chest : c.dark, { y: -0.3, rx: Math.PI, seed: 6130 }, 5)]),
  }));
  const root = new THREE.Group();
  const body = group(0, 0.95, 0, mesh(g.body));
  root.add(body);
  const head = group(0, 0.32, 0.72, mesh(g.head));
  const jaw = group(0, -0.17, 0.2, mesh(g.jaw));
  head.add(jaw);
  body.add(head);
  const legs = [[-0.2, 0.42], [0.2, 0.42], [-0.2, -0.42], [0.2, -0.42]].map(([x, z]) => {
    const l = group(x, -0.25, z, mesh(g.leg));
    body.add(l);
    return l;
  });
  const tail = group(0, 0.15, -0.6, mesh(g.tail));
  tail.rotation.x = -0.8;
  body.add(tail);
  return { root, body, head, jaw, legs, tailG: tail, kind: 'quad', centerY: 0.95, headBase: head.position.clone() };
}

// ── Buz cini ─────────────────────────────────────────────────
function iceWisp() {
  const g = cached('wisp', () => ({
    core: merge([ball(0.32, '#bff3ff', {}, 1), ball(0.2, '#ffffff', { z: 0.12 }, 1)]),
    shard: merge([part(new THREE.OctahedronGeometry(0.16, 0), '#9fd8ff', { sy: 2.4, seed: 6200, shade: 0.1 })]),
    tail: merge([cone(0.26, 0.9, '#7fc8ee', { y: -0.5, rx: Math.PI, seed: 6201 }, 6)]),
    eyes: merge([box(0.07, 0.1, 0.04, '#1a3a5a', { x: -0.1, y: 0.05, z: 0.3 }), box(0.07, 0.1, 0.04, '#1a3a5a', { x: 0.1, y: 0.05, z: 0.3 })]),
  }));
  const root = new THREE.Group();
  const body = group(0, 1.5, 0);
  root.add(body);
  body.add(mesh(g.core, sharedMaterials.glow));
  body.add(mesh(g.eyes));
  const tailMesh = mesh(g.tail);
  body.add(tailMesh);
  const ring = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const s = mesh(g.shard);
    const a = (i / 6) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.62, Math.sin(i * 1.7) * 0.15, Math.sin(a) * 0.62);
    s.rotation.z = Math.cos(a) * 0.4;
    ring.add(s);
  }
  body.add(ring);
  return { root, body, ring, kind: 'wisp', centerY: 1.5 };
}

// ── Lav balçığı ─────────────────────────────────────────────
function lavaSlime() {
  const g = cached('slime', () => {
    const plates = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + (i % 2) * 0.3;
      const el = (i % 3) * 0.45 - 0.2;
      const r = 0.72;
      plates.push(part(new THREE.DodecahedronGeometry(0.3, 0), i % 2 ? '#2b1f1c' : '#3a2a26', {
        x: Math.cos(a) * Math.cos(el) * r, y: Math.sin(el) * r * 0.8 + 0.1, z: Math.sin(a) * Math.cos(el) * r, sy: 0.55, ry: a, rx: el, seed: 6300 + i, shade: 0.12,
      }));
    }
    plates.push(part(new THREE.DodecahedronGeometry(0.34, 0), '#2b1f1c', { y: 0.68, sy: 0.5, seed: 6320 }));
    return {
      crust: merge(plates),
      core: merge([ball(0.74, '#ff7a1f', { sy: 0.85, y: 0.06 }, 1)]),
      eyes: merge([ball(0.09, '#ffe066', { x: -0.2, y: 0.25, z: 0.62 }, 0), ball(0.09, '#ffe066', { x: 0.2, y: 0.25, z: 0.62 }, 0)]),
    };
  });
  const root = new THREE.Group();
  const body = group(0, 0.65, 0);
  root.add(body);
  body.add(mesh(g.core, sharedMaterials.glow));
  body.add(mesh(g.crust));
  body.add(mesh(g.eyes, sharedMaterials.glow));
  return { root, body, kind: 'slime', centerY: 0.65 };
}

// ── Ateş kertenkelesi ───────────────────────────────────────
function salamander() {
  const c = { skin: '#d9452b', dark: '#2b1a16', belly: '#f2b84b' };
  const g = cached('sal', () => ({
    body: merge([
      box(0.55, 0.3, 1.0, c.skin, { seed: 6400, shade: 0.06 }),
      box(0.45, 0.12, 0.9, c.belly, { y: -0.14, seed: 6401 }),
      ...[0, 1, 2].map((i) => box(0.14, 0.06, 0.16, c.dark, { x: (i % 2 ? 0.14 : -0.14), y: 0.16, z: -0.3 + i * 0.3, seed: 6402 + i })),
      ...[0, 1, 2, 3].map((i) => cone(0.05, 0.16, '#ffb347', { y: 0.2, z: -0.4 + i * 0.27, seed: 6410 + i }, 4)),
    ]),
    head: merge([
      box(0.42, 0.24, 0.42, c.skin, { z: 0.15, seed: 6420 }),
      cone(0.3, 0.3, '#ff8a3d', { y: 0.12, z: -0.02, rx: -1.0, sz: 0.3, seed: 6421 }, 6),
      ball(0.05, '#ffe066', { x: -0.14, y: 0.08, z: 0.3 }, 0),
      ball(0.05, '#ffe066', { x: 0.14, y: 0.08, z: 0.3 }, 0),
    ]),
    leg: merge([box(0.32, 0.08, 0.1, c.skin, { x: 0.16, seed: 6430 }), box(0.08, 0.22, 0.1, c.dark, { x: 0.3, y: -0.12, seed: 6431 })]),
    tail: merge([cone(0.18, 1.1, c.skin, { z: -0.55, rx: -H, seed: 6440 }, 6)]),
  }));
  const root = new THREE.Group();
  const body = group(0, 0.38, 0, mesh(g.body));
  root.add(body);
  const head = group(0, 0.04, 0.55, mesh(g.head));
  body.add(head);
  const legs = [[-1, 0.32], [1, 0.32], [-1, -0.3], [1, -0.3]].map(([side, z]) => {
    const l = group(side * 0.26, -0.04, z, mesh(g.leg));
    l.scale.x = side;
    body.add(l);
    return l;
  });
  const tail = group(0, 0, -0.5, mesh(g.tail));
  body.add(tail);
  return { root, body, head, legs, tailG: tail, kind: 'salamander', centerY: 0.38 };
}

// ── Muhafızlar ───────────────────────────────────────────────
/** İnsansı dev iskeleti: bacaklar, gövde, baş, iki kol (omuzdan döner). */
function giant(geos, dims) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const legs = [-1, 1].map((side) => {
    const l = group(side * dims.hip, dims.legLen, 0, mesh(geos.leg));
    body.add(l);
    return l;
  });
  const torso = group(0, dims.legLen, 0, mesh(geos.torso));
  body.add(torso);
  const head = group(0, dims.neck, dims.headZ ?? 0, mesh(geos.head));
  if (geos.eyes) head.add(mesh(geos.eyes, sharedMaterials.glow));
  torso.add(head);
  const arms = [-1, 1].map((side) => {
    const a = group(side * dims.shoulder, dims.shoulderY, 0, mesh(geos.arm));
    a.scale.x = side;
    torso.add(a);
    return a;
  });
  if (geos.glow) torso.add(mesh(geos.glow, sharedMaterials.glow));
  return { root, body, torso, head, arms, legs, kind: 'giant', dims, centerY: dims.legLen };
}

function guardian() {
  const bark = '#5a3d22';
  const barkD = '#46301b';
  const leaf = ['#3f8f3a', '#4fa844', '#357a32'];
  const geos = cached('guardian', () => ({
    leg: merge([
      part(new THREE.CylinderGeometry(0.42, 0.55, 2.4, 7), bark, { y: -1.2, seed: 6500, shade: 0.08 }),
      ...[0, 1, 2].map((i) => part(new THREE.ConeGeometry(0.18, 1.0, 5), barkD, { x: (i - 1) * 0.35, y: -2.35, z: 0.4, rx: 1.3, seed: 6501 + i })),
    ]),
    torso: merge([
      part(new THREE.CylinderGeometry(1.0, 1.15, 3.2, 8), bark, { y: 1.5, seed: 6510, shade: 0.08, jitter: 0.05 }),
      part(new THREE.CylinderGeometry(0.6, 0.2, 0.6, 6), '#6b8f3a', { y: 2.2, z: 0.85, rx: 0.4, seed: 6511 }),
      ...[0, 1, 2, 3].map((i) => box(0.2, 1.4, 0.15, barkD, { x: Math.cos(i * 1.6) * 0.95, y: 1.2, z: Math.sin(i * 1.6) * 0.95, ry: i, seed: 6512 + i })),
      ...[0, 1, 2].map((i) => part(new THREE.IcosahedronGeometry(0.4, 0), '#5e8f3a', { x: (i - 1) * 0.7, y: 0.4 + i * 0.6, z: 0.95, sy: 0.4, seed: 6520 + i })),
    ]),
    head: merge([
      part(new THREE.CylinderGeometry(0.85, 0.95, 1.3, 8), bark, { y: 0.6, seed: 6530, shade: 0.08 }),
      box(1.0, 0.18, 0.2, barkD, { y: 0.95, z: 0.8, rx: 0.2, seed: 6531 }),
      ...[0, 1, 2, 3, 4, 5, 6].map((i) => part(new THREE.IcosahedronGeometry(0.8 - (i % 3) * 0.12, 1), leaf[i % 3], {
        x: Math.cos(i * 0.9) * 0.9, y: 1.7 + (i % 2) * 0.5, z: Math.sin(i * 0.9) * 0.7 - 0.1, jitter: 0.1, seed: 6540 + i, shade: 0.08,
      })),
    ]),
    eyes: merge([box(0.22, 0.14, 0.08, '#b6ff7a', { x: -0.32, y: 0.62, z: 0.88 }), box(0.22, 0.14, 0.08, '#b6ff7a', { x: 0.32, y: 0.62, z: 0.88 })]),
    arm: merge([
      part(new THREE.CylinderGeometry(0.28, 0.36, 2.6, 6), bark, { x: 0.25, y: -1.3, rz: 0.15, seed: 6550, shade: 0.08 }),
      ...[0, 1, 2, 3].map((i) => part(new THREE.ConeGeometry(0.12, 0.9, 5), barkD, { x: 0.5 + (i - 1.5) * 0.18, y: -2.85, z: (i % 2) * 0.2, rz: (i - 1.5) * 0.3, rx: Math.PI, seed: 6551 + i })),
      part(new THREE.IcosahedronGeometry(0.45, 0), leaf[1], { x: 0.25, y: -0.4, z: 0.2, seed: 6560 }),
    ]),
  }));
  return giant(geos, { hip: 0.55, legLen: 2.4, neck: 3.1, shoulder: 1.15, shoulderY: 2.8 });
}

function frostGiant() {
  const fur = '#e6e9ec';
  const furD = '#c3cad2';
  const skin = '#7fa8c8';
  const geos = cached('frost_giant', () => ({
    leg: merge([box(0.95, 2.8, 1.0, fur, { y: -1.4, seed: 6600, shade: 0.05, jitter: 0.05 }), box(1.0, 0.4, 1.3, skin, { y: -2.75, z: 0.15, seed: 6601 })]),
    torso: merge([
      box(2.6, 2.8, 1.6, fur, { y: 1.4, seed: 6610, shade: 0.05, jitter: 0.06 }),
      box(2.0, 1.6, 0.2, furD, { y: 1.2, z: 0.82, seed: 6611 }),
      ...[0, 1, 2].map((i) => part(new THREE.OctahedronGeometry(0.4, 0), '#bfeaff', { x: -1.2 + i * 0.25, y: 2.9, z: -0.2 + i * 0.1, sy: 2.4, rz: 0.5, seed: 6612 + i })),
      ...[0, 1, 2].map((i) => part(new THREE.OctahedronGeometry(0.4, 0), '#9fd8ff', { x: 1.2 - i * 0.25, y: 2.9, z: -0.2 + i * 0.1, sy: 2.4, rz: -0.5, seed: 6615 + i })),
    ]),
    head: merge([
      box(1.2, 1.2, 1.1, fur, { y: 0.55, seed: 6620, jitter: 0.04 }),
      box(0.9, 0.7, 0.2, skin, { y: 0.55, z: 0.52, seed: 6621 }),
      box(1.0, 0.5, 0.3, '#ffffff', { y: 0.05, z: 0.5, seed: 6622 }),
      cone(0.12, 0.4, '#f6efe0', { x: -0.25, y: 0.0, z: 0.66, rx: Math.PI, seed: 6623 }, 4),
      cone(0.12, 0.4, '#f6efe0', { x: 0.25, y: 0.0, z: 0.66, rx: Math.PI, seed: 6624 }, 4),
    ]),
    eyes: merge([box(0.2, 0.1, 0.05, '#bff3ff', { x: -0.22, y: 0.72, z: 0.63 }), box(0.2, 0.1, 0.05, '#bff3ff', { x: 0.22, y: 0.72, z: 0.63 })]),
    arm: merge([
      box(0.85, 3.0, 0.9, fur, { x: 0.35, y: -1.4, seed: 6630, shade: 0.05, jitter: 0.05 }),
      box(0.95, 0.8, 1.0, skin, { x: 0.35, y: -3.1, seed: 6631 }),
      ...[0, 1, 2].map((i) => part(new THREE.OctahedronGeometry(0.18, 0), '#e6f9ff', { x: 0.1 + i * 0.25, y: -3.5, z: 0.4, sy: 1.6, seed: 6632 + i })),
    ]),
  }));
  return giant(geos, { hip: 0.75, legLen: 2.9, neck: 2.8, shoulder: 1.55, shoulderY: 2.5 });
}

function lavaGolem() {
  const rock = ['#2e2a29', '#3a3534', '#24201f'];
  const geos = cached('lava_golem', () => {
    const chunk = (r, x, y, z, i) => part(new THREE.DodecahedronGeometry(r, 0), rock[i % 3], { x, y, z, jitter: r * 0.12, seed: 6700 + i, shade: 0.14 });
    return {
      leg: merge([chunk(0.7, 0, -0.7, 0, 1), chunk(0.65, 0, -1.8, 0.05, 2), chunk(0.75, 0, -2.75, 0.25, 3)]),
      torso: merge([
        chunk(1.3, -0.6, 1.0, 0, 4), chunk(1.3, 0.6, 1.0, 0, 5), chunk(1.2, -0.5, 2.4, 0, 6), chunk(1.2, 0.5, 2.4, 0, 7),
        chunk(0.9, 0, 0.2, -0.2, 8), chunk(0.8, 0, 3.2, -0.3, 9),
      ]),
      glow: merge([
        ball(0.75, '#ff7a1f', { y: 1.7, z: 0.6 }, 1),
        box(0.12, 2.4, 0.1, '#ff5a1f', { x: -0.05, y: 1.5, z: 1.15, rz: 0.2 }),
        box(1.4, 0.1, 0.1, '#ff5a1f', { y: 2.3, z: 1.0, rz: -0.15 }),
      ]),
      head: merge([chunk(0.75, 0, 0.5, 0, 10), chunk(0.4, -0.45, 0.85, 0, 11), chunk(0.4, 0.45, 0.85, 0, 12)]),
      eyes: merge([box(0.24, 0.1, 0.1, '#ffe066', { x: -0.25, y: 0.55, z: 0.68 }), box(0.24, 0.1, 0.1, '#ffe066', { x: 0.25, y: 0.55, z: 0.68 })]),
      arm: merge([chunk(0.6, 0.3, -0.5, 0, 13), chunk(0.55, 0.35, -1.5, 0, 14), chunk(0.75, 0.4, -2.7, 0.15, 15), box(0.1, 1.8, 0.1, '#ff5a1f', { x: 0.7, y: -1.6, z: 0.3 })]),
    };
  });
  return giant(geos, { hip: 0.8, legLen: 3.1, neck: 3.6, shoulder: 1.75, shoulderY: 2.9 });
}

const BUILDERS = {
  scorpion: () => scorpion({ body: '#5b3a29', dark: '#3a2418', plate: '#7a5034' }),
  hyena: () => quadruped({ coat: '#b08850', chest: '#c9a46a', dark: '#4a3a2a', snout: '#3a2e24', eye: '#f2c14e' }, { spots: true, mane: true }),
  wolf: () => quadruped({ coat: '#cfd4da', chest: '#f2f4f6', dark: '#8e959e', snout: '#9aa1aa', eye: '#7fdcff' }, { bushy: true }),
  ice_wisp: iceWisp,
  lava_slime: lavaSlime,
  salamander,
  guardian,
  sand_king: () => {
    const m = scorpion({ body: '#c9a14a', dark: '#8a6a2a', plate: '#e8c86a' }, true);
    m.root.scale.setScalar(3.2);
    m.scale = 3.2;
    return m;
  },
  frost_giant: frostGiant,
  lava_golem: lavaGolem,
};

export function buildCreatureModel(type) {
  const m = BUILDERS[type]();
  m.type = type;
  m.root.name = `creature:${type}`;
  m.baseScale = m.root.scale.x;
  return m;
}

// ── Animasyon ────────────────────────────────────────────────
const easeOut = (t) => 1 - (1 - t) * (1 - t);

export function animateCreature(m, s) {
  const t = s.t;
  const walk = Math.min(1.4, s.speed);
  const ph = s.phase ?? t * 6;
  const atk = s.attack ?? -1;
  const wind = s.windup ?? 0;
  if (s.dead) return animateDeath(m, s);
  m.body.rotation.set(0, 0, 0);
  switch (m.kind) {
    case 'scorpion': {
      m.legs.forEach((l, i) => {
        const side = i % 2 ? 1 : -1;
        l.rotation.z = Math.sin(ph * 1.6 + i * 1.3) * 0.25 * walk * side;
        l.rotation.x = Math.cos(ph * 1.6 + i * 1.3) * 0.15 * walk;
      });
      m.body.position.y = m.centerY + Math.abs(Math.sin(ph * 1.6)) * 0.03 * walk;
      // kıskaçlar açılıp kapanır, saldırıda öne uzanır
      m.arms.forEach((a, i) => {
        const side = i ? 1 : -1;
        a.rotation.y = side * (0.35 - wind * 0.3) + (atk >= 0 ? -side * Math.sin(atk * Math.PI) * 0.4 : 0);
        a.userData.jaw.rotation.y = side * (0.15 + Math.max(0, Math.sin(t * 3 + i)) * 0.25 + wind * 0.35);
      });
      const sway = Math.sin(t * 1.7) * 0.12;
      m.tail.forEach((seg, i) => {
        const base = i === 0 ? -0.9 : -0.42;
        let x = base + Math.sin(t * 2 + i) * 0.04;
        if (wind > 0) x -= wind * 0.18; // geriye gerilir
        if (atk >= 0) x += Math.sin(atk * Math.PI) * (i === 0 ? 0.6 : 0.32); // öne sokar
        seg.rotation.x = x;
        seg.rotation.y = sway * (i === 0 ? 1 : 0.3);
      });
      break;
    }
    case 'quad': {
      const sw = Math.sin(ph) * 0.6 * walk;
      m.legs[0].rotation.x = sw;
      m.legs[3].rotation.x = sw;
      m.legs[1].rotation.x = -sw;
      m.legs[2].rotation.x = -sw;
      m.body.position.y = m.centerY + Math.abs(Math.sin(ph)) * 0.06 * walk - wind * 0.15;
      m.body.rotation.x = wind * 0.15 - (atk >= 0 ? Math.sin(atk * Math.PI) * 0.25 : 0);
      m.head.rotation.x = 0.1 + wind * 0.3 - (atk >= 0 ? Math.sin(atk * Math.PI) * 0.5 : 0) + Math.sin(t * 2) * 0.03;
      m.jaw.rotation.x = 0.1 + (atk >= 0 ? Math.sin(atk * Math.PI) * 0.7 : wind * 0.4) + (s.laugh ? Math.abs(Math.sin(t * 14)) * 0.3 : 0);
      m.tailG.rotation.z = Math.sin(t * 4) * 0.3 * (0.3 + walk);
      if (atk >= 0) m.body.position.z = Math.sin(atk * Math.PI) * 0.5;
      else m.body.position.z = 0;
      break;
    }
    case 'wisp': {
      m.body.position.y = m.centerY + Math.sin(t * 2.2) * 0.18 - wind * 0.1;
      m.ring.rotation.y = t * (1.4 + wind * 5);
      m.ring.scale.setScalar(1 - wind * 0.3 + (atk >= 0 ? Math.sin(atk * Math.PI) * 0.4 : 0));
      break;
    }
    case 'slime': {
      const hop = Math.abs(Math.sin(ph * 0.8)) * walk;
      const sq = 1 - hop * 0.12 + wind * 0.25 - (atk >= 0 ? Math.sin(atk * Math.PI) * 0.35 : 0);
      m.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      m.body.position.y = m.centerY * sq + hop * 0.35 + (atk >= 0 ? Math.sin(atk * Math.PI) * 0.4 : 0);
      break;
    }
    case 'salamander': {
      m.legs.forEach((l, i) => {
        l.rotation.y = Math.sin(ph * 1.4 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.5 * walk;
      });
      m.body.rotation.y = Math.sin(ph * 1.4) * 0.12 * walk;
      m.tailG.rotation.y = -Math.sin(ph * 1.4) * 0.35 * walk + Math.sin(t * 2) * 0.1;
      m.head.rotation.x = -wind * 0.4 + (atk >= 0 ? Math.sin(atk * Math.PI) * 0.6 : 0);
      m.body.position.z = atk >= 0 ? Math.sin(atk * Math.PI) * 0.4 : 0;
      break;
    }
    case 'giant': {
      const d = m.dims;
      m.torso.rotation.set(0, 0, 0);
      const sw = Math.sin(ph * 0.8) * 0.45 * walk;
      m.legs[0].rotation.x = sw;
      m.legs[1].rotation.x = -sw;
      m.body.position.y = Math.abs(Math.sin(ph * 0.8)) * 0.12 * walk;
      m.torso.position.y = d.legLen + Math.sin(t * 1.6) * 0.05;
      let la = -sw * 0.6;
      let ra = sw * 0.6;
      const lz = 0.15;
      let rz = -0.15;
      const pose = s.pose ?? 'slam';
      if (wind > 0 || atk >= 0) {
        if (pose === 'slam' || pose === 'roots' || pose === 'meteor' || pose === 'pools') {
          // iki kolu başının üstüne kaldırır, sonra yere vurur
          const up = atk >= 0 ? 1 - easeOut(Math.min(1, atk * 2.2)) : easeOut(wind);
          la = ra = -2.7 * up + (atk >= 0 ? -0.3 * Math.sin(atk * Math.PI) : 0);
          m.torso.rotation.x = -0.2 * up + (atk >= 0 ? Math.sin(Math.min(1, atk * 2) * Math.PI) * 0.35 : 0);
        } else if (pose === 'sweep') {
          const k = atk >= 0 ? atk : 0;
          ra = -1.4 * (wind > 0 ? easeOut(wind) : 1 - k);
          rz = -1.2 * (wind > 0 ? easeOut(wind) : 1 - k * 1.5);
          m.torso.rotation.y = (wind > 0 ? -0.6 * easeOut(wind) : -0.6 + 1.6 * easeOut(k));
        } else if (pose === 'boulder' || pose === 'summon') {
          const k = atk >= 0 ? atk : 0;
          ra = wind > 0 ? -2.9 * easeOut(wind) : -2.9 + 3.4 * easeOut(Math.min(1, k * 2));
          la = -0.6 * (wind || 1 - k);
          if (pose === 'summon') {
            la = ra = -2.4 * (wind || 1 - k);
            m.head.rotation.x = -0.4 * (wind || 1 - k);
          }
        }
      } else {
        m.head.rotation.x = Math.sin(t * 0.7) * 0.05;
      }
      m.arms[0].rotation.x = la;
      m.arms[1].rotation.x = ra;
      m.arms[0].rotation.z = lz;
      m.arms[1].rotation.z = rz;
      break;
    }
    default:
      break;
  }
  // vurulunca irkilme
  const hs = 1 + Math.sin((s.hurt ?? 0) * Math.PI) * 0.08;
  m.root.scale.set(m.baseScale * hs, m.baseScale / hs, m.baseScale * hs);
  if (s.submerged) m.root.position.y -= s.submerged * (m.kind === 'scorpion' ? 1.6 : 3);
}

function animateDeath(m, s) {
  const k = Math.min(1, s.deathT / 1.2);
  const sink = Math.max(0, (s.deathT - 2.5) / 2);
  if (m.kind === 'giant') {
    m.body.rotation.x = -easeOut(k) * (Math.PI / 2 - 0.15);
    m.body.position.y = 0;
    m.arms.forEach((a) => { a.rotation.x = -0.4; });
  } else if (m.kind === 'wisp') {
    m.body.position.y = m.centerY * (1 - easeOut(k)) + 0.2;
    m.ring.scale.setScalar(1 + k * 1.5);
  } else {
    m.body.rotation.z = easeOut(k) * (Math.PI / 2) * (s.roll ?? 1);
    m.body.position.y = m.centerY * (1 - k * 0.5);
  }
  const sc = Math.max(0.01, 1 - sink);
  m.root.scale.setScalar(m.baseScale * sc);
}

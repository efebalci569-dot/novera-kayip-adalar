import * as THREE from 'three';
import { part, merge, sharedMaterials } from './Models.js';

// Düşük poligonlu hayvan modelleri. Her hayvan birkaç parçalı bir gruptur:
// gövde (birleşik geometri), baş (otlarken eğilir), bacaklar (yürürken salınır),
// kuyruk/kanatlar ve gözler (ölünce kapanır). Model +Z yönüne bakar.

const geoCache = {};

function cached(key, fn) {
  return (geoCache[key] ??= fn());
}

function mesh(geo) {
  const m = new THREE.Mesh(geo, sharedMaterials.standard);
  m.castShadow = true;
  return m;
}

/** Kalçadan dönen bir bacak grubu. */
function leg(geo, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(mesh(geo));
  return g;
}

function eyePair(geo, x, y, z) {
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    const e = mesh(geo);
    e.position.set(side * x, y, z);
    e.castShadow = false;
    g.add(e);
  }
  return g;
}

// ── İnek ──────────────────────────────────────────────────
function cowGeos() {
  const body = merge([
    part(new THREE.BoxGeometry(0.9, 0.82, 1.7), '#f2eee6', { y: 1.08, seed: 5000, shade: 0.03 }),
    // siyah benekler
    part(new THREE.BoxGeometry(0.92, 0.5, 0.55), '#2a2624', { y: 1.15, z: 0.25, seed: 5001 }),
    part(new THREE.BoxGeometry(0.6, 0.86, 0.45), '#2a2624', { x: 0.17, y: 1.08, z: -0.5, seed: 5002 }),
    part(new THREE.BoxGeometry(0.4, 0.3, 0.4), '#2a2624', { x: -0.27, y: 1.36, z: -0.2, seed: 5003 }),
    // meme ve kuyruk dibi
    part(new THREE.BoxGeometry(0.34, 0.2, 0.32), '#f0a7a0', { y: 0.6, z: -0.45, seed: 5004 }),
    part(new THREE.BoxGeometry(0.14, 0.14, 0.14), '#e9e3d8', { y: 1.4, z: -0.88, seed: 5005 }),
  ]);
  const head = merge([
    part(new THREE.BoxGeometry(0.46, 0.46, 0.55), '#f2eee6', { y: 0.05, z: 0.27, seed: 5010 }),
    part(new THREE.BoxGeometry(0.47, 0.22, 0.3), '#2a2624', { y: 0.18, z: 0.2, seed: 5011 }),
    part(new THREE.BoxGeometry(0.42, 0.26, 0.2), '#e9a49b', { y: -0.1, z: 0.6, seed: 5012 }),
    part(new THREE.BoxGeometry(0.05, 0.05, 0.02), '#5a3530', { x: -0.1, y: -0.08, z: 0.71, seed: 5013 }),
    part(new THREE.BoxGeometry(0.05, 0.05, 0.02), '#5a3530', { x: 0.1, y: -0.08, z: 0.71, seed: 5014 }),
    part(new THREE.ConeGeometry(0.05, 0.22, 5), '#efe1b8', { x: -0.2, y: 0.36, z: 0.15, rz: 0.5, seed: 5015 }),
    part(new THREE.ConeGeometry(0.05, 0.22, 5), '#efe1b8', { x: 0.2, y: 0.36, z: 0.15, rz: -0.5, seed: 5016 }),
    part(new THREE.BoxGeometry(0.2, 0.08, 0.12), '#f2eee6', { x: -0.32, y: 0.18, z: 0.12, rz: 0.3, seed: 5017 }),
    part(new THREE.BoxGeometry(0.2, 0.08, 0.12), '#f2eee6', { x: 0.32, y: 0.18, z: 0.12, rz: -0.3, seed: 5018 }),
  ]);
  const legGeo = merge([
    part(new THREE.BoxGeometry(0.2, 0.62, 0.2), '#f2eee6', { y: -0.31, seed: 5020 }),
    part(new THREE.BoxGeometry(0.21, 0.12, 0.22), '#3a2f28', { y: -0.66, seed: 5021 }),
  ]);
  const tail = merge([
    part(new THREE.BoxGeometry(0.06, 0.6, 0.06), '#e9e3d8', { y: -0.3, seed: 5030 }),
    part(new THREE.BoxGeometry(0.1, 0.16, 0.1), '#2a2624', { y: -0.62, seed: 5031 }),
  ]);
  const eye = new THREE.BoxGeometry(0.06, 0.06, 0.03);
  return { body, head, legGeo, tail, eye };
}

function buildCow() {
  const g = cached('cow', cowGeos);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(mesh(g.body));
  const head = new THREE.Group();
  head.position.set(0, 1.32, 0.82);
  head.add(mesh(g.head));
  const eyes = eyePair(g.eye, 0.16, 0.12, 0.55);
  head.add(eyes);
  body.add(head);
  const legs = [
    leg(g.legGeo, -0.3, 0.7, 0.6), leg(g.legGeo, 0.3, 0.7, 0.6),
    leg(g.legGeo, -0.3, 0.7, -0.6), leg(g.legGeo, 0.3, 0.7, -0.6),
  ];
  legs.forEach((l) => body.add(l));
  const tail = new THREE.Group();
  tail.position.set(0, 1.42, -0.88);
  tail.add(mesh(g.tail));
  body.add(tail);
  return { root, body, head, legs, tail, eyes, lieHeight: 0.45, centerY: 1.08 };
}

// ── Koyun ─────────────────────────────────────────────────
function sheepGeos() {
  const wool = '#f1ece0';
  const parts = [part(new THREE.BoxGeometry(0.72, 0.6, 1.0), '#e8e1d2', { y: 0.78, seed: 5100 })];
  const puffs = [[0, 0.95, 0.25, 0.42], [0, 0.95, -0.25, 0.44], [0.25, 0.78, 0, 0.38], [-0.25, 0.78, 0, 0.38], [0, 0.72, 0.45, 0.32], [0, 0.75, -0.48, 0.34], [0.2, 1.0, 0, 0.3], [-0.2, 1.0, 0, 0.3]];
  puffs.forEach(([x, y, z, r], i) => parts.push(part(new THREE.IcosahedronGeometry(r, 0), wool, { x, y, z, seed: 5101 + i, shade: 0.05, jitter: 0.03 })));
  const body = merge(parts);
  const head = merge([
    part(new THREE.BoxGeometry(0.3, 0.34, 0.42), '#3b3532', { y: 0, z: 0.18, seed: 5120 }),
    part(new THREE.IcosahedronGeometry(0.2, 0), wool, { y: 0.2, z: 0.08, seed: 5121 }),
    part(new THREE.BoxGeometry(0.22, 0.07, 0.12), '#2e2926', { x: -0.22, y: 0.08, z: 0.06, rz: 0.4, seed: 5122 }),
    part(new THREE.BoxGeometry(0.22, 0.07, 0.12), '#2e2926', { x: 0.22, y: 0.08, z: 0.06, rz: -0.4, seed: 5123 }),
  ]);
  const legGeo = merge([part(new THREE.BoxGeometry(0.12, 0.5, 0.12), '#3b3532', { y: -0.25, seed: 5130 })]);
  const tail = merge([part(new THREE.IcosahedronGeometry(0.12, 0), wool, { y: -0.05, seed: 5140 })]);
  const eye = new THREE.BoxGeometry(0.05, 0.05, 0.03);
  return { body, head, legGeo, tail, eye };
}

function buildSheep() {
  const g = cached('sheep', sheepGeos);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(mesh(g.body));
  const head = new THREE.Group();
  head.position.set(0, 0.98, 0.55);
  head.add(mesh(g.head));
  const eyes = eyePair(g.eye, 0.1, 0.04, 0.39);
  head.add(eyes);
  body.add(head);
  const legs = [
    leg(g.legGeo, -0.2, 0.52, 0.32), leg(g.legGeo, 0.2, 0.52, 0.32),
    leg(g.legGeo, -0.2, 0.52, -0.32), leg(g.legGeo, 0.2, 0.52, -0.32),
  ];
  legs.forEach((l) => body.add(l));
  const tail = new THREE.Group();
  tail.position.set(0, 0.9, -0.55);
  tail.add(mesh(g.tail));
  body.add(tail);
  return { root, body, head, legs, tail, eyes, lieHeight: 0.4, centerY: 0.8 };
}

// ── Tavuk ─────────────────────────────────────────────────
function chickenGeos() {
  const body = merge([
    part(new THREE.IcosahedronGeometry(0.22, 1), '#f7f3ea', { y: 0.38, sz: 1.25, seed: 5200, shade: 0.03 }),
    part(new THREE.ConeGeometry(0.12, 0.26, 5), '#ece6d8', { y: 0.48, z: -0.27, rx: -0.9, seed: 5201 }),
  ]);
  const head = merge([
    part(new THREE.BoxGeometry(0.15, 0.17, 0.15), '#f7f3ea', { y: 0.02, z: 0.02, seed: 5210 }),
    part(new THREE.BoxGeometry(0.04, 0.09, 0.12), '#d63a2e', { y: 0.14, z: 0.02, seed: 5211 }),
    part(new THREE.ConeGeometry(0.035, 0.09, 4), '#f0b232', { y: 0, z: 0.13, rx: Math.PI / 2, seed: 5212 }),
    part(new THREE.BoxGeometry(0.035, 0.07, 0.03), '#d63a2e', { y: -0.07, z: 0.08, seed: 5213 }),
  ]);
  const legGeo = merge([
    part(new THREE.BoxGeometry(0.03, 0.2, 0.03), '#e8a23a', { y: -0.1, seed: 5220 }),
    part(new THREE.BoxGeometry(0.09, 0.02, 0.1), '#e8a23a', { y: -0.2, z: 0.02, seed: 5221 }),
  ]);
  const wing = merge([part(new THREE.BoxGeometry(0.04, 0.17, 0.27), '#e9e3d5', { y: -0.06, z: -0.03, seed: 5230 })]);
  const eye = new THREE.BoxGeometry(0.03, 0.03, 0.02);
  return { body, head, legGeo, wing, eye };
}

function buildChicken() {
  const g = cached('chicken', chickenGeos);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(mesh(g.body));
  const head = new THREE.Group();
  head.position.set(0, 0.58, 0.2);
  head.add(mesh(g.head));
  const eyes = eyePair(g.eye, 0.07, 0.04, 0.07);
  head.add(eyes);
  body.add(head);
  const legs = [leg(g.legGeo, -0.07, 0.2, 0), leg(g.legGeo, 0.07, 0.2, 0)];
  legs.forEach((l) => body.add(l));
  const wings = [-1, 1].map((side) => {
    const w = new THREE.Group();
    w.position.set(side * 0.2, 0.46, 0);
    w.add(mesh(g.wing));
    body.add(w);
    return w;
  });
  return { root, body, head, legs, wings, eyes, lieHeight: 0.2, centerY: 0.38 };
}

const BUILDERS = { cow: buildCow, sheep: buildSheep, chicken: buildChicken };

export function buildAnimalModel(type) {
  const m = BUILDERS[type]();
  m.root.name = `animal:${type}`;
  // ölünce gözler "kapanır" (çizgi), eti alınınca model toprağa gömülür
  m.headBase = m.head.position.clone();
  return m;
}

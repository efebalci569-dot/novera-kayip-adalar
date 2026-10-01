import * as THREE from 'three';
import { LANDMARKS } from '../data/landmarks.js';
import { part, merge, sharedMaterials } from './Models.js';
import { mulberry32, randRange } from '../utils/math.js';

function glyphTexture(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#ffffff';
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.shadowColor = '#ffffff';
  g.shadowBlur = 10;
  g.beginPath();
  if (kind === 'wave') {
    for (let row = 0; row < 3; row++) {
      const y = 42 + row * 22;
      g.moveTo(24, y);
      for (let x = 24; x <= 104; x += 4) g.lineTo(x, y + Math.sin(((x - 24) / 80) * Math.PI * 2) * 8);
    }
  } else if (kind === 'root') {
    g.moveTo(64, 20); g.lineTo(64, 72);
    g.moveTo(64, 72); g.lineTo(38, 106);
    g.moveTo(64, 72); g.lineTo(90, 106);
    g.moveTo(64, 80); g.lineTo(64, 110);
    g.moveTo(64, 42); g.lineTo(44, 28);
    g.moveTo(64, 42); g.lineTo(84, 28);
  } else {
    g.moveTo(64, 16);
    g.quadraticCurveTo(100, 60, 82, 96);
    g.quadraticCurveTo(64, 114, 46, 96);
    g.quadraticCurveTo(28, 60, 64, 16);
    g.moveTo(64, 54);
    g.quadraticCurveTo(78, 78, 64, 98);
    g.quadraticCurveTo(50, 78, 64, 54);
  }
  g.stroke();
  g.beginPath();
  g.lineWidth = 4;
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function hullGeometry() {
  const g = new THREE.BoxGeometry(3.4, 2.2, 10, 2, 2, 5);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = (z + 5) / 10;
    let narrow = t > 0.55 ? 1 - ((t - 0.55) / 0.45) * 0.96 : 1;
    if (t < 0.05) narrow *= 0.85;
    const keel = y < 0 ? 0.5 : 1;
    pos.setX(i, x * narrow * keel);
    if (t > 0.8 && y > 0) pos.setY(i, y + (t - 0.8) * 3);
  }
  return g;
}

/**
 * Hikâye için önemli noktaların (enkaz, kamp, sembol taşları, mühürlü kapı) modelleri,
 * çarpışmaları ve etkileşimleri. Etkileşim mantığı ExplorationSystem'dedir.
 */
export class Landmarks {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'landmarks';
    this.list = [];
    this.byId = {};
    this.time = 0;
    this.animated = [];

    const pts = world.island.landmarks;
    for (const [id, def] of Object.entries(LANDMARKS)) {
      const p = pts[id];
      if (!p) continue;
      const y = world.terrain.getHeight(p.x, p.z);
      const entry = { id, def, x: p.x, y, z: p.z, used: false, discovered: false, interactPoint: { x: p.x, y, z: p.z } };
      this.list.push(entry);
      this.byId[id] = entry;
    }

    this.buildWreck(this.byId.wreck);
    this.buildCamp(this.byId.old_camp);
    for (const id of ['rune_wave', 'rune_root', 'rune_flame']) this.buildRune(this.byId[id]);
    this.buildDoor(this.byId.sealed_door);

    for (const entry of this.list) this.registerInteractable(entry);
  }

  /** Ağaçların/kaynakların bu noktalara çıkmaması için hariç tutma bölgeleri. */
  exclusionZones() {
    const r = { wreck: 9, old_camp: 11, rune_wave: 4, rune_root: 4, rune_flame: 4, sealed_door: 9 };
    const zones = this.list.map((e) => ({ x: e.x, z: e.z, r: r[e.id] ?? 5 }));
    // enkaz sandıklarının bulunduğu kumsal
    const w = this.byId.wreck;
    if (w) zones.push({ x: w.interactPoint.x, z: w.interactPoint.z, r: 6 });
    return zones;
  }

  staticMesh(parts, x, y, z, yaw = 0, { shadow = true } = {}) {
    const mesh = new THREE.Mesh(merge(parts), sharedMaterials.standard);
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  /** Yerel ofseti dünya koordinatına çevirir (yaw etrafında). */
  local(entry, yaw, lx, lz) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return { x: entry.x + lx * c + lz * s, z: entry.z - lx * s + lz * c };
  }

  buildWreck(e) {
    const ter = this.world.terrain;
    const inward = Math.atan2(-e.x, -e.z); // adanın merkezine bakan yön (yaw)
    const yaw = inward + 0.9;
    const hull = part(hullGeometry(), '#6b4a30', { y: 0.5, rz: 0.32, rx: -0.06, seed: 900, shade: 0.06 });
    const deck = part(new THREE.BoxGeometry(2.6, 0.14, 6.5), '#8a6a45', { y: 1.55, x: -0.35, rz: 0.32, seed: 901, shade: 0.05 });
    const mast = (() => {
      const g = new THREE.CylinderGeometry(0.13, 0.16, 4.2, 6);
      g.translate(0, 2.1, 0);
      return part(g, '#5a3f28', { x: -0.6, y: 1.5, z: 0.6, rz: 0.75, seed: 902 });
    })();
    const rail = part(new THREE.BoxGeometry(0.12, 0.4, 7), '#5a3f28', { x: 1.25, y: 1.9, z: -0.5, rz: 0.32, seed: 903 });
    this.staticMesh([hull, deck, mast, rail], e.x, e.y - 0.15, e.z, yaw);
    this.world.collision.addBox(e.x, e.z, 1.9, 5, yaw, e);

    // yırtık yelken
    const sailGeo = new THREE.PlaneGeometry(2.2, 2.6, 4, 4);
    const sp = sailGeo.attributes.position;
    const rng = mulberry32(77);
    for (let i = 0; i < sp.count; i++) sp.setZ(i, (rng() - 0.5) * 0.25);
    sailGeo.computeVertexNormals();
    const sail = new THREE.Mesh(sailGeo, new THREE.MeshLambertMaterial({ color: '#e6dcc4', side: THREE.DoubleSide }));
    const sailPos = this.local(e, yaw, -2.2, 0.6);
    sail.position.set(sailPos.x, e.y + 3.2, sailPos.z);
    sail.rotation.set(0.1, yaw + Math.PI / 2, 0.75);
    sail.castShadow = true;
    this.group.add(sail);

    // kumsalda sandıklar ve variller (aranabilir sandık burada)
    const crateSpot = { x: e.x + Math.sin(inward) * 6.5, z: e.z + Math.cos(inward) * 6.5 };
    const parts = [];
    const props = [
      [0, 0, 'crate', 0.8], [1.3, 0.6, 'crate', 0.6], [-1.4, 0.3, 'barrel', 0.5], [-0.6, 1.6, 'barrel', 0.5], [2.4, -0.8, 'plank', 0],
    ];
    const baseY = ter.getHeight(crateSpot.x, crateSpot.z);
    for (const [lx, lz, kind, s] of props) {
      const wx = crateSpot.x + lx, wz = crateSpot.z + lz;
      const ly = ter.getHeight(wx, wz) - baseY;
      if (kind === 'crate') parts.push(part(new THREE.BoxGeometry(s, s, s), '#9b7547', { x: lx, y: ly + s / 2 - 0.05, z: lz, ry: lx, seed: 910 + lx * 10, shade: 0.06 }));
      else if (kind === 'barrel') {
        parts.push(part(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 8), '#7a5532', { x: lx, y: ly + 0.25, z: lz, rz: Math.PI / 2, ry: lz, seed: 920 + lz * 10, shade: 0.05 }));
      } else parts.push(part(new THREE.BoxGeometry(2.2, 0.08, 0.35), '#8a6a45', { x: lx, y: ly + 0.05, z: lz, ry: 0.6, seed: 930 }));
    }
    this.staticMesh(parts, crateSpot.x, baseY, crateSpot.z, 0);
    this.world.collision.addBox(crateSpot.x, crateSpot.z, 0.45, 0.45, 0, e);
    e.interactPoint = { x: crateSpot.x, y: baseY, z: crateSpot.z };
  }

  buildCamp(e) {
    const ter = this.world.terrain;
    const parts = [];
    const yAt = (lx, lz) => ter.getHeight(e.x + lx, e.z + lz) - e.y;
    // çökmüş çadır
    parts.push(part(new THREE.ConeGeometry(1.7, 2.1, 4), '#c8b98e', { x: -2.5, y: yAt(-2.5, 1) + 0.85, z: 1, ry: Math.PI / 4, rz: 0.22, seed: 950, shade: 0.06 }));
    // söndürülmüş ateş halkası
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      parts.push(part(new THREE.DodecahedronGeometry(0.18, 0), '#77726a', { x: 1 + Math.cos(a) * 0.55, y: yAt(1, 1) + 0.08, z: 1 + Math.sin(a) * 0.55, sy: 0.7, seed: 960 + i }));
    }
    parts.push(part(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 5), '#2f2a26', { x: 1, y: yAt(1, 1) + 0.08, z: 1, rz: Math.PI / 2, ry: 0.5, seed: 970 }));
    parts.push(part(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 5), '#2f2a26', { x: 1, y: yAt(1, 1) + 0.12, z: 1, rz: Math.PI / 2, ry: -0.7, seed: 971 }));
    // kütük oturaklar
    parts.push(part(new THREE.CylinderGeometry(0.25, 0.25, 1.6, 7), '#6f5035', { x: 1, y: yAt(1, 2.6) + 0.22, z: 2.6, rz: Math.PI / 2, seed: 972 }));
    parts.push(part(new THREE.CylinderGeometry(0.25, 0.25, 1.4, 7), '#6f5035', { x: 2.8, y: yAt(2.8, 0.6) + 0.22, z: 0.6, rz: Math.PI / 2, ry: 1.4, seed: 973 }));
    // not bulunan sandık
    parts.push(part(new THREE.BoxGeometry(0.8, 0.55, 0.55), '#8a6a45', { x: -0.6, y: yAt(-0.6, -1.6) + 0.27, z: -1.6, seed: 974, shade: 0.05 }));
    parts.push(part(new THREE.BoxGeometry(0.3, 0.02, 0.4), '#f2ead2', { x: -0.6, y: yAt(-0.6, -1.6) + 0.56, z: -1.6, ry: 0.3, seed: 975 }));
    // bayrak direği
    parts.push(part(new THREE.CylinderGeometry(0.08, 0.12, 10.5, 6), '#7a5a3a', { x: 2.6, y: yAt(2.6, -2.2) + 5.1, z: -2.2, seed: 976 }));
    this.staticMesh(parts, e.x, e.y, e.z, 0);

    const flagGeo = new THREE.PlaneGeometry(2.4, 1.3, 8, 3);
    flagGeo.translate(1.2, 0, 0);
    const fpos = flagGeo.attributes.position;
    // yırtık kenar: sağ uçtaki köşeleri rastgele kısalt
    for (let i = 0; i < fpos.count; i++) if (fpos.getX(i) > 2.2) fpos.setX(i, fpos.getX(i) - Math.random() * 0.6);
    const flag = new THREE.Mesh(flagGeo, new THREE.MeshLambertMaterial({ color: '#c0392b', side: THREE.DoubleSide }));
    flag.position.set(e.x + 2.6, e.y + yAt(2.6, -2.2) + 9.6, e.z - 2.2);
    flag.castShadow = true;
    flag.userData.base = Float32Array.from(fpos.array);
    this.group.add(flag);
    this.animated.push({ type: 'flag', mesh: flag });

    const col = this.world.collision;
    col.addCircle(e.x - 2.5, e.z + 1, 1.3, e);
    col.addCircle(e.x + 2.6, e.z - 2.2, 0.2, e);
    col.addBox(e.x - 0.6, e.z - 1.6, 0.42, 0.3, 0, e);
    e.interactPoint = { x: e.x - 0.6, y: e.y, z: e.z - 1.6 };
  }

  buildRune(e) {
    const g = new THREE.BoxGeometry(1.0, 2.8, 0.55, 1, 3, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const k = 1 - Math.max(0, (y + 1.4) / 2.8) * 0.35;
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
    }
    const parts = [part(g, '#77737f', { y: 1.25, jitter: 0.05, seed: 1000 + e.id.length, shade: 0.06 })];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      parts.push(part(new THREE.DodecahedronGeometry(0.22, 0), '#8f8a80', { x: Math.cos(a) * 1.3, y: 0.08, z: Math.sin(a) * 1.3, sy: 0.6, seed: 1010 + i }));
    }
    const yaw = Math.atan2(-e.x, -e.z); // merkeze bak
    this.staticMesh(parts, e.x, e.y - 0.1, e.z, yaw);
    this.world.collision.addCircle(e.x, e.z, 0.6, e);

    const glyph = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 0.72),
      new THREE.MeshBasicMaterial({
        map: glyphTexture(e.def.glyph), color: '#7ff3ff', transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false,
      }),
    );
    const front = this.local(e, yaw, 0, 0.27);
    glyph.position.set(front.x, e.y + 1.55, front.z);
    glyph.rotation.y = yaw;
    this.group.add(glyph);
    e.glyph = glyph;
    this.animated.push({ type: 'glyph', entry: e, mesh: glyph });

    e.light = this.world.lights.add({ x: front.x, y: e.y + 1.6, z: front.z, color: '#7ff3ff', intensity: 2.2, distance: 7, flicker: false });
  }

  buildDoor(e) {
    const ter = this.world.terrain;
    const parts = [];
    const rng = mulberry32(555);
    // kaya duvarı
    const rocks = [[-4.2, -1.8, 3.2], [-2.0, -2.6, 4.2], [0.6, -3.0, 4.8], [3.1, -2.4, 4.0], [4.8, -1.4, 3.0], [-5.6, -0.2, 2.2], [6.0, 0.2, 2.0], [0, -4.8, 5.5]];
    for (const [lx, lz, s] of rocks) {
      parts.push(part(new THREE.DodecahedronGeometry(1, 0), '#7d786f', {
        x: lx, y: ter.getHeight(e.x + lx, e.z + lz) - e.y + s * 0.55, z: lz, sx: s, sy: s * 1.1, sz: s * 0.9,
        ry: rng() * 3, jitter: 0.12, seed: 1100 + lx * 10, shade: 0.08,
      }));
    }
    // taş zemin + alçak basamak (arazi kapı önünde düzleştirilir, bkz. islands.js → flatten)
    parts.push(part(new THREE.BoxGeometry(5.6, 0.9, 2.6), '#6e6a72', { y: -0.3, z: 0.5, seed: 1120, shade: 0.04 }));
    parts.push(part(new THREE.BoxGeometry(3.4, 0.5, 0.8), '#77737f', { y: -0.2, z: 2.1, seed: 1121 }));
    // kapı kasası ve taş kapı
    parts.push(part(new THREE.TorusGeometry(2.25, 0.32, 5, 18), '#5c5860', { y: 2.6, z: 0.15, seed: 1130 }));
    parts.push(part(new THREE.CylinderGeometry(2.0, 2.0, 0.6, 18), '#6e6a72', { y: 2.6, z: 0, rx: Math.PI / 2, seed: 1131, shade: 0.03 }));
    // üç yuva
    const sockets = [[0, 1.15], [-1.0, -0.6], [1.0, -0.6]];
    for (const [sx, sy] of sockets) {
      parts.push(part(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 10), '#3f3c44', { x: sx, y: 2.6 + sy, z: 0.32, rx: Math.PI / 2, seed: 1140 }));
    }
    this.staticMesh(parts, e.x, e.y, e.z, 0);

    e.socketGlows = sockets.map(([sx, sy]) => {
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(0.26, 14),
        new THREE.MeshBasicMaterial({ color: '#7ff3ff', transparent: true, opacity: 0, toneMapped: false, depthWrite: false }),
      );
      m.position.set(e.x + sx, e.y + 2.6 + sy, e.z + 0.4);
      this.group.add(m);
      return m;
    });
    this.animated.push({ type: 'door', entry: e });

    const col = this.world.collision;
    col.addBox(e.x, e.z - 1.2, 5.5, 2.4, 0, e);
    col.addPlatform(e.x, e.z + 0.5, 2.8, 1.3, 0, e.y + 0.15, e);
    col.addPlatform(e.x, e.z + 2.1, 1.7, 0.4, 0, e.y + 0.05, e);
    e.interactPoint = { x: e.x, y: e.y, z: e.z + 1.6 };
  }

  registerInteractable(entry) {
    const ip = entry.interactPoint;
    this.world.addInteractable({
      kind: 'landmark',
      id: entry.id,
      x: ip.x, y: ip.y + 1, z: ip.z,
      range: entry.id === 'sealed_door' ? 4.5 : 3.2,
      pickRadius: entry.id === 'sealed_door' ? 2.2 : entry.def.glyph ? 1.0 : 0.85,
      pickHeight: entry.id === 'sealed_door' ? 3.6 : 1.6,
      getPrompt: (game) => game.exploration.landmarkPrompt(entry),
      interact: (game) => game.exploration.interactLandmark(entry),
    });
  }

  setUsed(id, used) {
    const e = this.byId[id];
    if (!e) return;
    e.used = used;
    if (e.light) e.light.enabled = !used;
  }

  update(dt) {
    this.time += dt;
    for (const a of this.animated) {
      if (a.type === 'flag') {
        const pos = a.mesh.geometry.attributes.position;
        const base = a.mesh.userData.base;
        for (let i = 0; i < pos.count; i++) {
          const x = base[i * 3];
          pos.setZ(i, Math.sin(this.time * 3 + x * 2.2) * 0.18 * (x / 2.4));
        }
        pos.needsUpdate = true;
      } else if (a.type === 'glyph') {
        const used = a.entry.used;
        a.mesh.material.opacity = used ? 0.18 : 0.75 + Math.sin(this.time * 2.2) * 0.25;
      } else if (a.type === 'door') {
        const on = a.entry.used;
        for (const g of a.entry.socketGlows) g.material.opacity = on ? 0.7 + Math.sin(this.time * 2) * 0.25 : 0;
      }
    }
  }
}

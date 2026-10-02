import * as THREE from 'three';
import { LANDMARKS } from '../data/landmarks.js';
import { part, merge, sharedMaterials, hangingVine, tintUpFaces } from './Models.js';

const tintUpFacesSafe = (g, color) => tintUpFaces(g, color, 0.55, 0.75);
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

    for (const isl of world.islands) {
      for (const [id, def] of Object.entries(LANDMARKS)) {
        const p = isl.landmarks[id];
        if (!p) continue;
        const inCave = def.cave && world.cave;
        const y = inCave ? world.cave.floorHeight(p.x, p.z) : world.terrain.getHeight(p.x, p.z);
        const entry = { id, def, island: isl.id, x: p.x, y, z: p.z, used: false, discovered: false, interactPoint: { x: p.x, y, z: p.z }, cave: !!inCave };
        this.list.push(entry);
        this.byId[id] = entry;
      }
    }

    this.buildWreck(this.byId.wreck);
    this.buildCamp(this.byId.old_camp);
    for (const id of ['rune_wave', 'rune_root', 'rune_flame']) this.buildRune(this.byId[id]);
    this.buildDoor(this.byId.sealed_door);
    if (this.byId.cave_entrance) this.buildCaveEntrance(this.byId.cave_entrance);
    if (this.byId.miner_camp) this.buildMinerCamp(this.byId.miner_camp);
    for (const e of this.list) {
      if (e.def.altar) this.buildAltar(e);
      else if (e.id === 'desert_ruins') this.buildRuins(e);
      else if (e.id === 'frozen_camp') this.buildFrozenCamp(e);
      else if (e.id === 'obsidian_shrine') this.buildShrine(e);
    }

    for (const entry of this.list) this.registerInteractable(entry);
  }

  /**
   * Ağaçların/kaynakların bu noktalara çıkmaması için hariç tutma bölgeleri.
   * Ana adanın sunak arenası burada değil (eski kayıtlarla kaynak sırası değişmesin diye
   * arena sonradan temizlenir, bkz. arenaZones).
   */
  exclusionZones() {
    const r = { wreck: 9, old_camp: 11, rune_wave: 4, rune_root: 4, rune_flame: 4, sealed_door: 9, cave_entrance: 12 };
    const zones = this.list
      .filter((e) => !e.cave && !(e.island === 'novera' && e.def.altar))
      .map((e) => ({ x: e.x, z: e.z, r: e.def.arena ? e.def.arena + 2 : r[e.id] ?? 7 }));
    // enkaz sandıklarının bulunduğu kumsal
    const w = this.byId.wreck;
    if (w) zones.push({ x: w.interactPoint.x, z: w.interactPoint.z, r: 6 });
    return zones;
  }

  /** Boss sunaklarının çevresindeki dövüş alanları. */
  arenaZones() {
    return this.list.filter((e) => e.def.arena).map((e) => ({ x: e.x, z: e.z, r: e.def.arena }));
  }

  staticMesh(parts, x, y, z, yaw = 0, { shadow = true, group = this.group } = {}) {
    const mesh = new THREE.Mesh(merge(parts), sharedMaterials.standard);
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
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

  /** Dağın batı yamacındaki kaya kemerli mağara ağzı (içerisi ayrı, kapalı bir alandır). */
  buildCaveEntrance(e) {
    const ter = this.world.terrain;
    const yaw = this.world.island.def.cave?.entrance?.yaw ?? -Math.PI / 2;
    const rng = mulberry32(8080);
    const parts = [];
    const groundAt = (lx, lz) => {
      const w = this.local(e, yaw, lx, lz);
      return ter.getHeight(w.x, w.z) - e.y;
    };
    const rockCols = ['#7d786f', '#857f76', '#6f6a62', '#8c877e'];
    const rock = (lx, lz, s, yOff = 0, sy = 1) => {
      parts.push(part(new THREE.DodecahedronGeometry(1, 0), rockCols[Math.floor(rng() * 4)], {
        x: lx, y: groundAt(lx, lz) + s * 0.55 * sy + yOff, z: lz, sx: s * randRange(rng, 0.9, 1.2), sy: s * sy, sz: s * randRange(rng, 0.85, 1.1),
        ry: rng() * 3, jitter: 0.12, seed: 8100 + parts.length, shade: 0.08,
      }));
    };
    // yan sütunlar ve lento
    rock(-2.9, 0.2, 1.5, 0, 1.2); rock(-3.2, -1.2, 1.7, 0.9, 1.1); rock(-2.6, 0.6, 1.0, 2.0);
    rock(2.9, 0.2, 1.5, 0, 1.2); rock(3.2, -1.3, 1.8, 0.8, 1.1); rock(2.5, 0.5, 1.0, 2.1);
    rock(-1.4, 0.1, 1.2, 3.1, 0.8); rock(0.2, 0.0, 1.35, 3.35, 0.75); rock(1.6, 0.2, 1.15, 3.05, 0.8);
    // arkadaki kaya yığını yamaçla birleşir
    for (let i = 0; i < 14; i++) {
      const lx = randRange(rng, -4.6, 4.6);
      const lz = randRange(rng, -6.5, -1.5);
      rock(lx, lz, randRange(rng, 1.6, 3.0), randRange(rng, 0.5, 3.2) - Math.max(0, -lz - 3) * 0.2, randRange(rng, 0.8, 1.2));
    }
    // eski maden direkleri
    for (const lx of [-1.95, 1.95]) parts.push(part(new THREE.BoxGeometry(0.22, 2.9, 0.22), '#5f4430', { x: lx, y: 1.4, z: 0.35, rz: lx * 0.02, seed: 8200 }));
    parts.push(part(new THREE.BoxGeometry(4.4, 0.26, 0.28), '#5f4430', { y: 2.9, z: 0.35, seed: 8201 }));
    // girişten sarkan sarmaşıklar
    for (let i = 0; i < 7; i++) {
      const top = new THREE.Vector3(-1.8 + i * 0.6 + randRange(rng, -0.15, 0.15), 3.45, 0.55);
      parts.push(...hangingVine(rng, 8300 + i * 11, top, randRange(rng, 0.9, 2.2)));
    }
    this.staticMesh(parts, e.x, e.y, e.z, yaw);

    // karanlık tünel ağzı: yarım silindir kemer, derine doğru kararır
    const arch = new THREE.CylinderGeometry(1.95, 1.95, 3.4, 16, 1, true, -Math.PI / 2, Math.PI);
    arch.rotateX(-Math.PI / 2);
    arch.scale(1, 1.4, 1);
    arch.translate(0, 0, -1.7);
    const archGeo = arch.toNonIndexed();
    const apos = archGeo.attributes.position;
    const col = new Float32Array(apos.count * 3);
    for (let i = 0; i < apos.count; i++) {
      const depth = Math.min(1, -apos.getZ(i) / 3.2);
      const v = 0.2 * (1 - depth) * (1 - depth) + 0.012;
      col[i * 3] = v; col[i * 3 + 1] = v * 0.96; col[i * 3 + 2] = v * 0.92;
    }
    archGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const darkMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
    const archMesh = new THREE.Mesh(archGeo, darkMat);
    const back = new THREE.Mesh(new THREE.CircleGeometry(1.95, 16, 0, Math.PI), new THREE.MeshBasicMaterial({ color: '#030304' }));
    back.scale.y = 1.4;
    back.position.z = -3.35;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 3.4), new THREE.MeshBasicMaterial({ color: '#141210' }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.04, -1.7);
    const mouth = new THREE.Group();
    mouth.add(archMesh, back, floor);
    mouth.position.set(e.x, e.y, e.z);
    mouth.rotation.y = yaw;
    this.group.add(mouth);

    const col2 = this.world.collision;
    const c = this.local(e, yaw, 0, -1.6);
    col2.addBox(c.x, c.z, 2.2, 1.5, yaw, e);
    for (const lx of [-3.1, 3.1]) {
      const p = this.local(e, yaw, lx, -0.4);
      col2.addCircle(p.x, p.z, 1.5, e);
    }
    const m = this.local(e, yaw, 0, -4.5);
    col2.addBox(m.x, m.z, 4.8, 2.4, yaw, e);
    const ip = this.local(e, yaw, 0, 0.9);
    e.interactPoint = { x: ip.x, y: e.y, z: ip.z };
    e.exitPoint = this.local(e, yaw, 0, 4.2);
    e.yaw = yaw;
  }

  /** Mağaranın derin odasında, madencinin terk ettiği kamp (mağara katmanında). */
  buildMinerCamp(e) {
    const cave = this.world.cave;
    if (!cave) return;
    const yAt = (lx, lz) => cave.floorHeight(e.x + lx, e.z + lz) - e.y;
    const parts = [];
    // yatak rulosu
    parts.push(part(new THREE.BoxGeometry(0.9, 0.16, 2.0), '#7a3f36', { x: -1.8, y: yAt(-1.8, 0.5) + 0.08, z: 0.5, ry: 0.3, seed: 8500, shade: 0.05 }));
    parts.push(part(new THREE.CylinderGeometry(0.2, 0.2, 0.9, 7), '#8e5045', { x: -2.1, y: yAt(-2.1, -0.5) + 0.2, z: -0.4, rz: Math.PI / 2, ry: 0.3, seed: 8501 }));
    // defterli sandık
    parts.push(part(new THREE.BoxGeometry(0.9, 0.6, 0.6), '#7a5a38', { y: yAt(0, 0) + 0.3, seed: 8502, shade: 0.05 }));
    parts.push(part(new THREE.BoxGeometry(0.34, 0.04, 0.26), '#efe2c0', { x: -0.1, y: yAt(0, 0) + 0.62, z: 0.05, ry: 0.25, seed: 8503 }));
    // fırın başlangıcı: taş halkası ve kömür yığını
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      parts.push(part(new THREE.DodecahedronGeometry(0.24, 0), i % 2 ? '#7d786f' : '#6e6a72', {
        x: 2.2 + Math.cos(a) * 0.65, y: yAt(2.2, 1.2) + 0.15 + (i % 3 === 0 ? 0.25 : 0), z: 1.2 + Math.sin(a) * 0.65, seed: 8510 + i,
      }));
    }
    for (let i = 0; i < 7; i++) {
      parts.push(part(new THREE.DodecahedronGeometry(0.14, 0), '#18181b', { x: 2.2 + (i % 3 - 1) * 0.2, y: yAt(2.2, 1.2) + 0.1 + Math.floor(i / 3) * 0.12, z: 1.2 + ((i * 7) % 3 - 1) * 0.15, seed: 8520 + i }));
    }
    // cevher yığını ve dayalı kazma
    for (let i = 0; i < 5; i++) parts.push(part(new THREE.DodecahedronGeometry(0.17, 0), '#b0612c', { x: 1.0 + i * 0.18, y: yAt(1, -1.3) + 0.12 + (i % 2) * 0.1, z: -1.3 + (i % 2) * 0.15, seed: 8530 + i }));
    parts.push(part(new THREE.CylinderGeometry(0.03, 0.035, 0.9, 5), '#7b5a3a', { x: 0.75, y: yAt(0.75, 0.55) + 0.42, z: 0.55, rz: 0.35, seed: 8540 }));
    parts.push(part(new THREE.BoxGeometry(0.06, 0.08, 0.5), '#8f8b83', { x: 0.6, y: yAt(0.75, 0.55) + 0.85, z: 0.55, rz: 0.35, seed: 8541 }));
    this.staticMesh(parts, e.x, e.y, e.z, 0, { group: cave.group, shadow: false });

    // eski fener (parlak) + sıcak ışık
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.16), new THREE.MeshBasicMaterial({ color: '#ffc46b', toneMapped: false }));
    lantern.position.set(e.x + 0.3, e.y + yAt(0.3, -0.1) + 0.74, e.z - 0.1);
    cave.group.add(lantern);
    e.light = this.world.lights.add({ x: lantern.position.x, y: lantern.position.y + 0.3, z: lantern.position.z, color: '#ffb35c', intensity: 6, distance: 13, flicker: true });

    this.world.collision.addBox(e.x, e.z, 0.5, 0.35, 0, e, Infinity, 'cave');
    this.world.collision.addCircle(e.x + 2.2, e.z + 1.2, 0.85, e, 'cave');
    e.interactPoint = { x: e.x, y: e.y, z: e.z + 0.2 };
    e.keepLight = true;
  }

  // ── Boss sunakları ────────────────────────────────────────
  buildAltar(e) {
    const ter = this.world.terrain;
    const col = this.world.collision;
    const style = e.def.altar;
    const rng = mulberry32(4000 + e.id.length * 31);
    const parts = [];
    const yAt = (lx, lz) => ter.getHeight(e.x + lx, e.z + lz) - e.y;
    const ring = (n, r, fn) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.3;
        fn(Math.cos(a) * r, Math.sin(a) * r, a, i);
      }
    };
    let glowColor = '#7be35a';
    if (style === 'guardian') {
      // yosunlu dikili taşlar çemberi ve köklerin sardığı taş sunak
      ring(7, 10, (lx, lz, a, i) => {
        const h = randRange(rng, 3.0, 4.4);
        const p = part(new THREE.BoxGeometry(0.9, h, 0.6, 1, 3, 1), i % 2 ? '#7b7a72' : '#6e6d66', {
          x: lx, y: yAt(lx, lz) + h / 2 - 0.3, z: lz, ry: -a, rz: randRange(rng, -0.08, 0.08), jitter: 0.06, seed: 4100 + i, shade: 0.06,
        });
        parts.push(tintUpFacesSafe(p, '#5e8f3a'));
        col.addCircle(e.x + lx, e.z + lz, 0.6, e);
      });
      parts.push(part(new THREE.CylinderGeometry(1.25, 1.5, 0.9, 8), '#6e6a72', { y: yAt(0, 0) + 0.4, seed: 4120, shade: 0.05 }));
      parts.push(part(new THREE.TorusGeometry(0.75, 0.18, 5, 12), '#5c5860', { y: yAt(0, 0) + 0.9, rx: Math.PI / 2, seed: 4121 }));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        parts.push(part(new THREE.CylinderGeometry(0.1, 0.16, 2.4, 5), '#5a3d22', { x: Math.cos(a) * 1.35, y: yAt(0, 0) + 0.3, z: Math.sin(a) * 1.35, rz: Math.cos(a) * 1.1, rx: -Math.sin(a) * 1.1, seed: 4130 + i }));
      }
      col.addCircle(e.x, e.z, 1.5, e);
    } else if (style === 'sand_king') {
      glowColor = '#ffb347';
      // basamaklı kumtaşı kaide, köşelerde kırık sütunlar
      parts.push(part(new THREE.BoxGeometry(6.4, 0.4, 6.4), '#d9a86c', { y: yAt(0, 0) - 0.05, seed: 4200, shade: 0.04 }));
      parts.push(part(new THREE.BoxGeometry(4.2, 0.4, 4.2), '#c98f55', { y: yAt(0, 0) + 0.35, seed: 4201, shade: 0.04 }));
      parts.push(part(new THREE.BoxGeometry(1.8, 1.1, 1.2), '#e2b47a', { y: yAt(0, 0) + 1.1, seed: 4202, shade: 0.04 }));
      parts.push(part(new THREE.BoxGeometry(1.9, 0.12, 1.3), '#d27a3b', { y: yAt(0, 0) + 1.7, seed: 4203 }));
      // akrep oyması
      parts.push(part(new THREE.BoxGeometry(0.5, 0.25, 0.04), '#5b3a29', { y: yAt(0, 0) + 1.1, z: 0.61, seed: 4204 }));
      parts.push(part(new THREE.BoxGeometry(0.08, 0.4, 0.04), '#5b3a29', { x: -0.3, y: yAt(0, 0) + 1.3, z: 0.61, rz: 0.5, seed: 4205 }));
      ring(4, 11, (lx, lz, a, i) => {
        const h = randRange(rng, 3.5, 6.5);
        parts.push(part(new THREE.CylinderGeometry(0.55, 0.65, h, 8), i % 2 ? '#d9a86c' : '#cf9a62', { x: lx, y: yAt(lx, lz) + h / 2 - 0.2, z: lz, seed: 4210 + i, shade: 0.05 }));
        parts.push(part(new THREE.BoxGeometry(1.5, 0.35, 1.5), '#c98f55', { x: lx, y: yAt(lx, lz) - 0.05, z: lz, seed: 4220 + i }));
        col.addCircle(e.x + lx, e.z + lz, 0.75, e);
      });
      col.addBox(e.x, e.z, 0.95, 0.65, 0, e);
      col.addPlatform(e.x, e.z, 3.2, 3.2, 0, e.y + 0.15, e);
      col.addPlatform(e.x, e.z, 2.1, 2.1, 0, e.y + 0.55, e);
    } else if (style === 'frost_giant') {
      glowColor = '#7fdcff';
      ring(6, 10.5, (lx, lz, a, i) => {
        const h = randRange(rng, 3.5, 5.5);
        const g = new THREE.OctahedronGeometry(0.5, 0);
        g.scale(1.3, h, 1.3);
        g.translate(0, h * 0.42, 0);
        parts.push(part(g, i % 2 ? '#bfeaff' : '#9fd8ff', { x: lx, y: yAt(lx, lz) - 0.3, z: lz, ry: a, rz: randRange(rng, -0.1, 0.1), seed: 4300 + i, shade: 0.12 }));
        col.addCircle(e.x + lx, e.z + lz, 0.6, e);
      });
      parts.push(part(new THREE.IcosahedronGeometry(1.8, 1), '#f2f6f9', { y: yAt(0, 0) - 0.6, sy: 0.5, seed: 4320 }));
      parts.push(part(new THREE.BoxGeometry(1.6, 1.2, 1.1), '#a9d9ef', { y: yAt(0, 0) + 0.6, seed: 4321, jitter: 0.05, shade: 0.08 }));
      parts.push(part(new THREE.TorusGeometry(0.55, 0.12, 5, 12), '#e6f9ff', { y: yAt(0, 0) + 1.25, rx: Math.PI / 2, seed: 4322 }));
      col.addBox(e.x, e.z, 0.85, 0.6, 0, e);
    } else {
      glowColor = '#ff6a1f';
      ring(6, 10.5, (lx, lz, a, i) => {
        const h = randRange(rng, 4.0, 6.0);
        const g = new THREE.ConeGeometry(0.75, h, 4);
        g.translate(0, h / 2, 0);
        parts.push(part(g, i % 2 ? '#1c1726' : '#2a2236', { x: lx, y: yAt(lx, lz) - 0.2, z: lz, ry: a, seed: 4400 + i, shade: 0.15 }));
        parts.push(part(new THREE.BoxGeometry(0.06, h * 0.6, 0.06), '#ff5a1f', { x: lx * 0.95, y: yAt(lx, lz) + h * 0.3, z: lz * 0.95, seed: 4410 + i }));
        col.addCircle(e.x + lx, e.z + lz, 0.7, e);
      });
      parts.push(part(new THREE.CylinderGeometry(1.3, 1.6, 1.0, 6), '#3e3836', { y: yAt(0, 0) + 0.4, seed: 4420, shade: 0.06 }));
      parts.push(part(new THREE.CylinderGeometry(0.85, 0.85, 0.06, 12), '#ff7a2a', { y: yAt(0, 0) + 0.93, seed: 4421 }));
      col.addCircle(e.x, e.z, 1.6, e);
    }
    this.staticMesh(parts, e.x, e.y, e.z, 0);
    // sunak hazır/uyanık olunca parlayan küre
    const glow = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.35, 1),
      new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }),
    );
    glow.position.set(e.x, e.y + 2.4, e.z);
    this.group.add(glow);
    e.altarGlow = glow;
    e.glowState = 0; // 0 sönük · 1 boss uyanık · 2 boss yenildi
    this.animated.push({ type: 'altar', entry: e });
    e.light = this.world.lights.add({ x: e.x, y: e.y + 2.4, z: e.z, color: glowColor, intensity: 0, distance: 14, flicker: true, priority: 10 });
    e.keepLight = true;
    e.interactPoint = { x: e.x, y: e.y + (style === 'sand_king' ? 0.75 : 0), z: e.z + (style === 'sand_king' ? 1.3 : 1.8) };
  }

  // ── Hikâye noktaları (yeni adalar) ─────────────────────────
  buildRuins(e) {
    const ter = this.world.terrain;
    const col = this.world.collision;
    const rng = mulberry32(4500);
    const parts = [];
    const yAt = (lx, lz) => ter.getHeight(e.x + lx, e.z + lz) - e.y;
    const cols = [[-3, -2, 3.2], [-1, -3.2, 1.6], [2.2, -2.6, 2.6], [3.6, 0.4, 0.9]];
    cols.forEach(([lx, lz, h], i) => {
      parts.push(part(new THREE.CylinderGeometry(0.45, 0.52, h, 8), i % 2 ? '#d9a86c' : '#cf9a62', { x: lx, y: yAt(lx, lz) + h / 2 - 0.2, z: lz, jitter: 0.03, seed: 4510 + i, shade: 0.05 }));
      col.addCircle(e.x + lx, e.z + lz, 0.55, e);
    });
    // devrik sütun ve yarı gömülü dev baş
    parts.push(part(new THREE.CylinderGeometry(0.45, 0.45, 3.4, 8), '#d2a06a', { x: -0.5, y: yAt(-0.5, 2.6) + 0.3, z: 2.6, rz: Math.PI / 2, ry: 0.4, seed: 4520 }));
    parts.push(part(new THREE.BoxGeometry(1.6, 1.4, 1.4), '#c98f55', { x: 3.2, y: yAt(3.2, 3) + 0.4, z: 3, ry: -0.6, rx: 0.3, seed: 4521, shade: 0.06 }));
    parts.push(part(new THREE.BoxGeometry(0.3, 0.12, 0.05), '#5b3a29', { x: 2.95, y: yAt(3.2, 3) + 0.65, z: 3.62, ry: -0.6, seed: 4522 }));
    parts.push(part(new THREE.BoxGeometry(0.3, 0.12, 0.05), '#5b3a29', { x: 3.45, y: yAt(3.2, 3) + 0.65, z: 3.4, ry: -0.6, seed: 4523 }));
    // yazıtlı taş
    parts.push(part(new THREE.BoxGeometry(1.4, 1.0, 0.35), '#e2b47a', { x: 0, y: yAt(0, 0) + 0.45, z: 0, rx: -0.15, seed: 4524, shade: 0.04 }));
    for (let i = 0; i < 4; i++) parts.push(part(new THREE.BoxGeometry(0.9 - i * 0.12, 0.05, 0.02), '#8a5a34', { y: yAt(0, 0) + 0.75 - i * 0.14, z: 0.19, seed: 4530 + i }));
    for (let i = 0; i < 5; i++) parts.push(part(new THREE.DodecahedronGeometry(randRange(rng, 0.2, 0.45), 0), '#d9a86c', { x: randRange(rng, -4, 4), y: yAt(0, 0) + 0.1, z: randRange(rng, -4, 4), seed: 4540 + i }));
    this.staticMesh(parts, e.x, e.y, e.z, 0);
    col.addBox(e.x, e.z, 0.7, 0.25, 0, e);
    e.interactPoint = { x: e.x, y: e.y, z: e.z + 0.6 };
  }

  buildFrozenCamp(e) {
    const ter = this.world.terrain;
    const col = this.world.collision;
    const parts = [];
    const yAt = (lx, lz) => ter.getHeight(e.x + lx, e.z + lz) - e.y;
    const tent = part(new THREE.ConeGeometry(1.6, 2.0, 4), '#8a6a45', { x: -2.2, y: yAt(-2.2, 1) + 0.9, z: 1, ry: Math.PI / 4, seed: 4600, shade: 0.06 });
    parts.push(tintUpFacesSafe(tent, '#f2f6f9'));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      parts.push(part(new THREE.DodecahedronGeometry(0.16, 0), '#6f7884', { x: 1 + Math.cos(a) * 0.5, y: yAt(1, 1) + 0.07, z: 1 + Math.sin(a) * 0.5, sy: 0.7, seed: 4610 + i }));
    }
    parts.push(part(new THREE.BoxGeometry(0.8, 0.55, 0.55), '#7a5a3a', { x: -0.4, y: yAt(-0.4, -1.4) + 0.27, z: -1.4, seed: 4620, shade: 0.05 }));
    parts.push(part(new THREE.BoxGeometry(0.82, 0.08, 0.57), '#f2f6f9', { x: -0.4, y: yAt(-0.4, -1.4) + 0.58, z: -1.4, seed: 4621 }));
    parts.push(part(new THREE.BoxGeometry(0.1, 0.04, 1.9), '#a33a2e', { x: 2.2, y: yAt(2.2, -0.5) + 0.05, z: -0.5, ry: 0.2, seed: 4622 }));
    parts.push(part(new THREE.BoxGeometry(0.1, 0.04, 1.9), '#a33a2e', { x: 2.45, y: yAt(2.45, -0.5) + 0.05, z: -0.5, ry: 0.25, seed: 4623 }));
    this.staticMesh(parts, e.x, e.y, e.z, 0);
    col.addCircle(e.x - 2.2, e.z + 1, 1.2, e);
    col.addBox(e.x - 0.4, e.z - 1.4, 0.42, 0.3, 0, e);
    e.interactPoint = { x: e.x - 0.4, y: e.y, z: e.z - 1.4 };
  }

  buildShrine(e) {
    const ter = this.world.terrain;
    const col = this.world.collision;
    const parts = [];
    const yAt = (lx, lz) => ter.getHeight(e.x + lx, e.z + lz) - e.y;
    const g = new THREE.BoxGeometry(1.1, 4.2, 1.1, 1, 3, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = 1 - Math.max(0, (pos.getY(i) + 2.1) / 4.2) * 0.55;
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
    }
    parts.push(part(g, '#1c1726', { y: yAt(0, 0) + 2.0, seed: 4700, shade: 0.12 }));
    parts.push(part(new THREE.ConeGeometry(0.32, 0.6, 4), '#2a2236', { y: yAt(0, 0) + 4.4, ry: Math.PI / 4, seed: 4701 }));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      parts.push(part(new THREE.DodecahedronGeometry(0.25, 0), '#3e3836', { x: Math.cos(a) * 1.6, y: yAt(Math.cos(a) * 1.6, Math.sin(a) * 1.6) + 0.1, z: Math.sin(a) * 1.6, sy: 0.6, seed: 4710 + i }));
    }
    this.staticMesh(parts, e.x, e.y, e.z, 0);
    const glyph = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7),
      new THREE.MeshBasicMaterial({ map: glyphTexture('flame'), color: '#ff8a3d', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    glyph.position.set(e.x, e.y + 2.2, e.z + 0.48);
    this.group.add(glyph);
    e.glyph = glyph;
    this.animated.push({ type: 'glyph', entry: e, mesh: glyph });
    col.addCircle(e.x, e.z, 0.7, e);
    e.interactPoint = { x: e.x, y: e.y, z: e.z + 0.9 };
    e.light = this.world.lights.add({ x: e.x, y: e.y + 2.2, z: e.z + 0.8, color: '#ff8a3d', intensity: 2.6, distance: 8, flicker: true });
  }

  registerInteractable(entry) {
    const ip = entry.interactPoint;
    this.world.addInteractable({
      kind: 'landmark',
      id: entry.id,
      x: ip.x, y: ip.y + 1, z: ip.z,
      range: entry.id === 'sealed_door' || entry.id === 'cave_entrance' || entry.def.altar ? 4.5 : 3.2,
      pickRadius: entry.id === 'sealed_door' ? 2.2 : entry.id === 'cave_entrance' ? 2.0 : entry.def.glyph ? 1.0 : 0.85,
      pickHeight: entry.id === 'sealed_door' ? 3.6 : entry.id === 'cave_entrance' ? 2.6 : 1.6,
      getPrompt: (game) => game.exploration.landmarkPrompt(entry),
      interact: (game) => game.exploration.interactLandmark(entry),
    });
  }

  setUsed(id, used) {
    const e = this.byId[id];
    if (!e) return;
    e.used = used;
    if (e.light && !e.keepLight) e.light.enabled = !used;
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
      } else if (a.type === 'altar') {
        const e = a.entry;
        const st = e.glowState ?? 0;
        const target = st === 1 ? 0.85 : st === 2 ? 0.35 : 0;
        const m = e.altarGlow.material;
        m.opacity += (target - m.opacity) * 0.05;
        e.altarGlow.position.y = e.y + 2.4 + Math.sin(this.time * 1.6) * 0.15;
        e.altarGlow.scale.setScalar(1 + Math.sin(this.time * 3) * 0.08 * (st === 1 ? 1 : 0.3));
        if (e.light) e.light.intensity = m.opacity * 9;
      } else if (a.type === 'door') {
        const on = a.entry.used;
        for (const g of a.entry.socketGlows) g.material.opacity = on ? 0.7 + Math.sin(this.time * 2) * 0.25 : 0;
      }
    }
  }
}

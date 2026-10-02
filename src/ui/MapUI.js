import { Panel } from './Panel.js';
import { h } from './dom.js';
import { REGIONS } from '../data/regions.js';
import { BUILDINGS } from '../data/buildings.js';
import { clamp, smoothstep } from '../utils/math.js';
import { specOf, iconSpecURL } from './rich.js';
import { iconImage } from './ItemIcons.js';

const SIZE = 640;
const WORLD_EXTENT = 2600; // takımada haritasının genişliği (m)

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const C = {
  deep: hex('#1b5a80'), shallow: hex('#3dbac2'), foam: hex('#dff6f5'), lake: hex('#4fb3d6'), peak: hex('#cfc9be'),
  sand: hex('#e9d59c'), meadow: hex('#86bd52'), forest: hex('#3f7f36'), mountain: hex('#958f84'), lava: hex('#ff6a1f'), ice: hex('#bfe6f5'),
};
const REGION_RGB = Object.fromEntries(Object.entries(REGIONS).map(([id, r]) => [id, hex(r.color)]));
REGION_RGB.beach = C.sand;
REGION_RGB.meadow = C.meadow;
REGION_RGB.forest = C.forest;
REGION_RGB.mountain = C.mountain;

/** Emoji/belirteç yerine ikon resmini tuvale çizer. */
function drawIcon(ctx, str, x, y, size = 22) {
  const im = iconImage(iconSpecURL(specOf(str)));
  if (im) ctx.drawImage(im, x - size / 2, y - size / 2, size, size);
}

function drawArrow(ctx, x, y, yaw, color = '#ff5a4a') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-yaw + Math.PI);
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.lineTo(8, 9);
  ctx.lineTo(0, 4);
  ctx.lineTo(-8, 9);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawDiamond(ctx, x, y, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = color;
  ctx.strokeStyle = '#fff6dc';
  ctx.lineWidth = 2;
  ctx.fillRect(-6, -6, 12, 12);
  ctx.strokeRect(-6, -6, 12, 12);
  ctx.restore();
}

/**
 * İki görünümlü harita:
 *  - Ada: bulunduğun adanın keşfettikçe açılan (fog of war) haritası
 *  - Takımada: bilinen adalar, rotalar ve denizdeki konumun
 */
export class MapUI extends Panel {
  constructor(game) {
    super(game, 'map', { title: 'Harita', icon: '🗺️', action: 'map' });
    this.canvas = h('canvas', { class: 'map-canvas', width: SIZE, height: SIZE });
    this.ctx2d = this.canvas.getContext('2d');
    this.bases = {};
    this.fogCanvas = document.createElement('canvas');
    this.fogKey = null;
    this.legend = h('div', { class: 'map-legend' });
    this.tabs = h('div', { class: 'tabs' });
    this.timer = 0;
    this.mode = 'island';
    this.islandId = 'novera';
  }

  get extent() {
    return this.game.exploration.fogExtent;
  }

  get shownIsland() {
    return this.game.world.islandById[this.islandId] ?? this.game.world.island;
  }

  toMap(x, z) {
    if (this.mode === 'world') {
      const e = WORLD_EXTENT;
      const c = this.worldCenter;
      return [((x - c.x + e / 2) / e) * SIZE, ((z - c.z + e / 2) / e) * SIZE];
    }
    const isl = this.shownIsland;
    const e = this.extent;
    return [((x - isl.cx + e / 2) / e) * SIZE, ((z - isl.cz + e / 2) / e) * SIZE];
  }

  /** Haritada gösterilecek nokta bu adanın sınırları içinde mi? */
  onShown(x, z) {
    return this.mode === 'world' || this.shownIsland.contains(x, z);
  }

  buildBase(island) {
    const terrain = this.game.world.terrain;
    const res = 320;
    const c = document.createElement('canvas');
    c.width = c.height = res;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(res, res);
    const e = this.extent;
    const step = e / res;
    const lake = island.lake;
    for (let py = 0; py < res; py++) {
      for (let px = 0; px < res; px++) {
        const x = (px + 0.5) * step - e / 2 + island.cx;
        const z = (py + 0.5) * step - e / 2 + island.cz;
        const hgt = terrain.getHeight(x, z);
        let col;
        const inLake = lake && Math.hypot(x - lake.x, z - lake.z) < lake.radius * 1.6 && hgt <= lake.level + 0.01;
        if (inLake) col = lake.frozen ? C.ice : C.lake;
        else if (hgt < 0) {
          const t = smoothstep(0, -7, hgt);
          col = C.shallow.map((v, i) => v + (C.deep[i] - v) * t);
          if (hgt > -0.35) col = col.map((v, i) => v + (C.foam[i] - v) * 0.6);
        } else if (island.isLava(x, z)) {
          col = C.lava;
        } else {
          const region = island.region(x, z, hgt);
          col = REGION_RGB[region] ?? C.meadow;
          if (hgt > 60) col = col.map((v, i) => v + (C.peak[i] - v) * smoothstep(60, 130, hgt));
          // tepe gölgelendirme
          const shade = clamp(1 + (terrain.getHeight(x - 1.5, z - 1.5) - terrain.getHeight(x + 1.5, z + 1.5)) * 0.18, 0.62, 1.32);
          col = col.map((v) => v * shade);
        }
        const i = (py * res + px) * 4;
        img.data[i] = clamp(col[0], 0, 255);
        img.data[i + 1] = clamp(col[1], 0, 255);
        img.data[i + 2] = clamp(col[2], 0, 255);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  buildFog(island) {
    const ex = this.game.exploration;
    const fog = ex.fogFor(island.id);
    const n = ex.fogSize;
    const c = this.fogCanvas;
    c.width = c.height = n;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      img.data[i * 4] = 22;
      img.data[i * 4 + 1] = 32;
      img.data[i * 4 + 2] = 38;
      img.data[i * 4 + 3] = fog[i] ? 0 : 245;
    }
    ctx.putImageData(img, 0, 0);
    this.fogKey = `${island.id}|${ex.fogVersion}`;
  }

  open(ctx) {
    const g = this.game;
    const p = g.player.position;
    const isl = g.world.inCave ? g.world.island : g.world.islandAt(p.x, p.z);
    this.mode = isl && ctx?.mode !== 'world' ? 'island' : 'world';
    if (isl) this.islandId = isl.id;
    super.open(ctx);
  }

  setMode(mode, islandId = null) {
    this.mode = mode;
    if (islandId) this.islandId = islandId;
    this.render();
  }

  render() {
    const g = this.game;
    const nav = g.navigation;
    const known = g.world.islands.filter((i) => nav.isKnown(i.id) && g.exploration.visitedIslands.has(i.id));
    this.tabs.replaceChildren(
      ...known.map((isl) => h('button', {
        class: `tab ${this.mode === 'island' && this.islandId === isl.id ? 'active' : ''}`,
        onclick: () => this.setMode('island', isl.id),
      }, isl.name)),
      h('button', { class: `tab ${this.mode === 'world' ? 'active' : ''}`, onclick: () => this.setMode('world') }, '🧭 Takımada'),
    );
    this.body.replaceChildren(h('div', { class: 'map-top' }, this.tabs), h('div', { class: 'map-wrap' }, this.canvas, this.legend));
    this.draw();
    this.renderLegend();
  }

  renderLegend() {
    const g = this.game;
    const ex = g.exploration;
    const common = [
      h('div', { class: 'section-title', style: { marginTop: '12px' } }, 'İşaretler'),
      h('div', { class: 'row' }, '➤', g.world.inCave ? 'Sen (mağarada, dağın altında)' : 'Sen'),
      h('div', { class: 'row' }, h('span', { style: { color: '#ffc857' } }, '◆'), 'Görev hedefi'),
      ...(g.net.active ? [h('div', { class: 'row' }, h('span', { style: { color: '#5ab8ff' } }, '●'), 'Diğer oyuncular')] : []),
      ...(g.world.drops.drops.some((d) => d.death) ? [h('div', { class: 'row' }, '💀', 'Ölüm çuvalı (eşyaların)')] : []),
    ];
    if (this.mode === 'world') {
      const nav = g.navigation;
      this.legend.replaceChildren(
        h('div', { class: 'section-title' }, 'Takımada'),
        ...g.world.islands.map((isl) => {
          const visited = ex.visitedIslands.has(isl.id);
          const knownIsl = nav.isKnown(isl.id);
          const boss = g.bosses.isDefeated(nav.bossOf(isl.id));
          const state = !knownIsl ? 'Konumu bilinmiyor' : visited ? (boss ? 'Muhafız yenildi' : 'Ziyaret edildi') : 'Rota biliniyor';
          return h('div', { class: 'row' }, knownIsl ? nav.islandIcon(isl.id) : '❓', h('span', {}, knownIsl ? isl.name : '???', h('small', { style: { display: 'block', color: '#a9b4b8' } }, state)));
        }),
        h('div', { class: 'inv-note' }, 'Yeni bir adanın konumunu, önceki adanın muhafızını yenerek bulduğun seyir haritası gösterir. Açık denize ancak Tekne ile çıkılabilir.'),
        ...common,
      );
      return;
    }
    const isl = this.shownIsland;
    const discoverable = Object.entries(REGIONS).filter(([, r]) => r.discoverable && (r.island ?? 'novera') === isl.id);
    this.legend.replaceChildren(
      h('div', { class: 'section-title' }, `${isl.name} · Bölgeler`),
      ...discoverable.map(([id, r]) => h('div', { class: 'row' },
        h('span', { style: { width: '12px', height: '12px', borderRadius: '3px', background: r.color, display: 'inline-block' } }),
        ex.discoveredRegions.has(id) ? r.name : '??? (keşfedilmedi)')),
      h('div', { class: 'section-title', style: { marginTop: '12px' } }, 'Önemli Noktalar'),
      ...ex.visibleLandmarks().filter((e) => e.island === isl.id).map((e) => h('div', { class: 'row' }, e.def.icon, ex.isLandmarkDiscovered(e.id) ? e.def.name : `${e.def.name} (işaretli)`)),
      ...common,
      h('div', { class: 'row', style: { color: '#a9b4b8', marginTop: '8px', fontSize: '12px' } }, `Keşfedilen: ${discoverable.filter(([id]) => ex.discoveredRegions.has(id)).length}/${discoverable.length} bölge`),
    );
  }

  draw() {
    if (this.mode === 'world') this.drawWorld();
    else this.drawIsland();
  }

  drawCommonMarkers(ctx) {
    const g = this.game;
    // görev işaretleri
    for (const m of g.quests.getMarkers()) {
      if (!this.onShown(m.x, m.z)) continue;
      const [x, y] = this.toMap(m.x, m.z);
      drawDiamond(ctx, x, y - 16, m.type === 'side' ? '#7ddc72' : '#ffc857');
    }
    // odadaki diğer oyuncular
    ctx.font = 'bold 12px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const o of g.remotePlayers.positions()) {
      if (o.cave || o.ghost || !this.onShown(o.x, o.z)) continue;
      const [x, y] = this.toMap(o.x, o.z);
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#5ab8ff';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e8f6ff';
      ctx.fillText(o.name, x, y - 13);
    }
    const p = g.player;
    if (this.onShown(p.position.x, p.position.z) || g.world.inCave) {
      const [px, py] = this.toMap(p.position.x, p.position.z);
      drawArrow(ctx, px, py, p.yaw);
    }
    // pusula
    ctx.font = 'bold 16px "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffc857';
    ctx.fillText('K', SIZE / 2, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('G', SIZE / 2, SIZE - 14);
    ctx.fillText('B', 14, SIZE / 2);
    ctx.fillText('D', SIZE - 14, SIZE / 2);
  }

  drawIsland() {
    const g = this.game;
    const ctx = this.ctx2d;
    const ex = g.exploration;
    const isl = this.shownIsland;
    this.bases[isl.id] ??= this.buildBase(isl);
    if (this.fogKey !== `${isl.id}|${ex.fogVersion}`) this.buildFog(isl);
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.bases[isl.id], 0, 0, SIZE, SIZE);
    ctx.drawImage(this.fogCanvas, 0, 0, SIZE, SIZE);

    // ince ızgara
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      const q = (i / 8) * SIZE;
      ctx.beginPath(); ctx.moveTo(q, 0); ctx.lineTo(q, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, q); ctx.lineTo(SIZE, q); ctx.stroke();
    }

    for (const b of g.building.buildings) {
      if (!isl.contains(b.x, b.z)) continue;
      const [x, y] = this.toMap(b.x, b.z);
      drawIcon(ctx, BUILDINGS[b.type].icon, x, y, 20);
    }
    for (const b of g.vehicles.boats) {
      if (b === g.vehicles.mounted || !isl.contains(b.x, b.z)) continue;
      const [x, y] = this.toMap(b.x, b.z);
      drawIcon(ctx, b.def.icon, x, y, 22);
    }
    // ölüm çuvalları (mağaradakiler girişte gösterilir)
    const caveEntrance = g.world.landmarks.byId.cave_entrance;
    for (const d of g.world.drops.drops) {
      if (!d.death) continue;
      const at = d.cave ? caveEntrance : d;
      if (!at || !isl.contains(at.x, at.z)) continue;
      const [x, y] = this.toMap(at.x, at.z);
      drawIcon(ctx, '💀', x, y, 18);
    }
    for (const e of ex.visibleLandmarks()) {
      if (e.island !== isl.id) continue;
      const [x, y] = this.toMap(e.x, e.z);
      const known = ex.isLandmarkDiscovered(e.id);
      ctx.globalAlpha = ex.isLandmarkUsed(e.id) && e.def.gives ? 0.5 : 1;
      drawIcon(ctx, known ? e.def.icon : '❓', x, y, 22);
      ctx.globalAlpha = 1;
    }
    this.drawCommonMarkers(ctx);
  }

  /** Takımada: adaların kıyı şeritleri, rotalar ve denizdeki konum. */
  drawWorld() {
    const g = this.game;
    const ctx = this.ctx2d;
    const nav = g.navigation;
    const ex = g.exploration;
    const p = g.player.position;
    // haritayı bilinen adaların ortasına göre ortala
    const pts = g.world.islands.filter((i) => nav.isKnown(i.id));
    const cx = pts.reduce((a, i) => a + i.cx, 0) / Math.max(1, pts.length);
    const cz = pts.reduce((a, i) => a + i.cz, 0) / Math.max(1, pts.length);
    this.worldCenter = { x: cx * 0.6, z: cz * 0.6 };
    const grd = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 40, SIZE / 2, SIZE / 2, SIZE * 0.75);
    grd.addColorStop(0, '#2a6f9e');
    grd.addColorStop(1, '#123a55');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      const q = (i / 10) * SIZE;
      ctx.beginPath(); ctx.moveTo(q, 0); ctx.lineTo(q, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, q); ctx.lineTo(SIZE, q); ctx.stroke();
    }
    // rotalar: ziyaret edilmiş adadan bilinen yeni adaya kesikli çizgi
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = 'rgba(255,214,120,0.75)';
    ctx.lineWidth = 2;
    for (const isl of g.world.islands) {
      if (!nav.isKnown(isl.id) || isl.def.order === 0) continue;
      const prev = g.world.islands.find((o) => o.def.order === isl.def.order - 1);
      if (!prev) continue;
      const [ax, ay] = this.toMap(prev.spawn.x, prev.spawn.z);
      const [bx, by] = this.toMap(isl.spawn.x, isl.spawn.z);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const scale = SIZE / WORLD_EXTENT;
    for (const isl of g.world.islands) {
      if (!nav.isKnown(isl.id)) continue;
      const visited = ex.visitedIslands.has(isl.id);
      ctx.beginPath();
      for (let k = 0; k <= 48; k++) {
        const a = (k / 48) * Math.PI * 2;
        const r = isl.coastRadius(a);
        const [x, y] = this.toMap(isl.cx + Math.cos(a) * r, isl.cz + Math.sin(a) * r);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = { tropical: '#6aa84f', desert: '#e2b674', ice: '#e8eef2', volcano: '#4a4442' }[isl.biome];
      ctx.globalAlpha = visited ? 1 : 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#e8f6ff';
      ctx.lineWidth = 2;
      ctx.stroke();
      const [lx, ly] = this.toMap(isl.cx, isl.cz);
      drawIcon(ctx, nav.islandIcon(isl.id), lx, ly - 4, 22);
      ctx.font = 'bold 13px "Segoe UI", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 3;
      ctx.strokeText(isl.name, lx, ly + isl.radius * scale + 12);
      ctx.fillText(isl.name, lx, ly + isl.radius * scale + 12);
    }
    for (const b of g.vehicles.boats) {
      if (b === g.vehicles.mounted) continue;
      const [x, y] = this.toMap(b.x, b.z);
      drawIcon(ctx, b.def.icon, x, y, 16);
    }
    if (!pts.some((i) => i.contains(p.x, p.z))) {
      ctx.font = '12px "Segoe UI", sans-serif';
      ctx.fillStyle = '#cfe9ff';
      const [px, py] = this.toMap(p.x, p.z);
      ctx.fillText('Açık deniz', px, py + 20);
    }
    this.drawCommonMarkers(ctx);
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.5;
      this.draw();
    }
  }
}

import { Panel } from './Panel.js';
import { h } from './dom.js';
import { REGIONS } from '../data/regions.js';
import { BUILDINGS } from '../data/buildings.js';
import { clamp, smoothstep } from '../utils/math.js';

const SIZE = 640;

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const C = {
  deep: hex('#1b5a80'), shallow: hex('#3dbac2'), sand: hex('#e9d59c'), meadow: hex('#86bd52'),
  forest: hex('#3f7f36'), mountain: hex('#958f84'), peak: hex('#cfc9be'), lake: hex('#4fb3d6'), foam: hex('#dff6f5'),
};

/** Keşfettikçe açılan (fog of war) ada haritası. */
export class MapUI extends Panel {
  constructor(game) {
    super(game, 'map', { title: 'Harita', icon: '🗺️', action: 'map' });
    this.canvas = h('canvas', { class: 'map-canvas', width: SIZE, height: SIZE });
    this.ctx2d = this.canvas.getContext('2d');
    this.base = null;
    this.fogCanvas = document.createElement('canvas');
    this.legend = h('div', { class: 'map-legend' });
    this.timer = 0;
  }

  get extent() {
    return this.game.exploration.fogExtent;
  }

  toMap(x, z) {
    const e = this.extent;
    return [((x + e / 2) / e) * SIZE, ((z + e / 2) / e) * SIZE];
  }

  buildBase() {
    const { terrain, island } = this.game.world;
    const res = 320;
    const c = document.createElement('canvas');
    c.width = c.height = res;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(res, res);
    const e = this.extent;
    const step = e / res;
    for (let py = 0; py < res; py++) {
      for (let px = 0; px < res; px++) {
        const x = (px + 0.5) * step - e / 2;
        const z = (py + 0.5) * step - e / 2;
        const hgt = terrain.getHeight(x, z);
        let col;
        const lake = island.lake;
        const inLake = Math.hypot(x - lake.x, z - lake.z) < lake.radius * 1.6 && hgt < lake.level;
        if (inLake) col = C.lake;
        else if (hgt < 0) {
          const t = smoothstep(0, -7, hgt);
          col = C.shallow.map((v, i) => v + (C.deep[i] - v) * t);
          if (hgt > -0.35) col = col.map((v, i) => v + (C.foam[i] - v) * 0.6);
        } else {
          const region = island.region(x, z, hgt);
          col = region === 'beach' ? C.sand : region === 'forest' ? C.forest : region === 'mountain' ? C.mountain : C.meadow;
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
    this.base = c;
  }

  buildFog() {
    const ex = this.game.exploration;
    const n = ex.fogSize;
    const c = this.fogCanvas;
    c.width = c.height = n;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      const hidden = !ex.fog[i];
      img.data[i * 4] = 22;
      img.data[i * 4 + 1] = 32;
      img.data[i * 4 + 2] = 38;
      img.data[i * 4 + 3] = hidden ? 245 : 0;
    }
    ctx.putImageData(img, 0, 0);
    this.fogVersion = ex.fogVersion;
  }

  render() {
    if (!this.base) this.buildBase();
    this.body.replaceChildren(h('div', { class: 'map-wrap' }, this.canvas, this.legend));
    this.draw();
    this.renderLegend();
  }

  renderLegend() {
    const g = this.game;
    const ex = g.exploration;
    const discoverable = Object.entries(REGIONS).filter(([, r]) => r.discoverable);
    this.legend.replaceChildren(
      h('div', { class: 'section-title' }, 'Bölgeler'),
      ...discoverable.map(([id, r]) => h('div', { class: 'row' },
        h('span', { style: { width: '12px', height: '12px', borderRadius: '3px', background: r.color, display: 'inline-block' } }),
        ex.discoveredRegions.has(id) ? r.name : '??? (keşfedilmedi)')),
      h('div', { class: 'section-title', style: { marginTop: '12px' } }, 'Önemli Noktalar'),
      ...ex.visibleLandmarks().map((e) => h('div', { class: 'row' }, e.def.icon, ex.isLandmarkDiscovered(e.id) ? e.def.name : `${e.def.name} (işaretli)`)),
      h('div', { class: 'section-title', style: { marginTop: '12px' } }, 'İşaretler'),
      h('div', { class: 'row' }, '➤', g.world.inCave ? 'Sen (mağarada, dağın altında)' : 'Sen'),
      h('div', { class: 'row' }, h('span', { style: { color: '#ffc857' } }, '◆'), 'Görev hedefi'),
      h('div', { class: 'row', style: { color: '#a9b4b8', marginTop: '8px', fontSize: '12px' } }, `Keşfedilen: ${ex.discoveredRegions.size}/${discoverable.length} bölge`),
    );
  }

  draw() {
    const g = this.game;
    const ctx = this.ctx2d;
    const ex = g.exploration;
    if (this.fogVersion !== ex.fogVersion) this.buildFog();
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.base, 0, 0, SIZE, SIZE);
    ctx.drawImage(this.fogCanvas, 0, 0, SIZE, SIZE);

    // ince ızgara
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      const p = (i / 8) * SIZE;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(SIZE, p); ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '18px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    for (const b of g.building.buildings) {
      const [x, y] = this.toMap(b.x, b.z);
      ctx.fillText(BUILDINGS[b.type].icon, x, y);
    }
    for (const b of g.vehicles.boats) {
      if (b === g.vehicles.mounted) continue;
      const [x, y] = this.toMap(b.x, b.z);
      ctx.fillText(b.def.icon, x, y);
    }
    ctx.font = '22px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    for (const e of ex.visibleLandmarks()) {
      const [x, y] = this.toMap(e.x, e.z);
      const known = ex.isLandmarkDiscovered(e.id);
      ctx.globalAlpha = ex.isLandmarkUsed(e.id) && e.def.gives ? 0.5 : 1;
      ctx.fillText(known ? e.def.icon : '❓', x, y);
      ctx.globalAlpha = 1;
    }

    // görev işaretleri
    for (const m of g.quests.getMarkers()) {
      const [x, y] = this.toMap(m.x, m.z);
      ctx.save();
      ctx.translate(x, y - 16);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = m.type === 'side' ? '#7ddc72' : '#ffc857';
      ctx.strokeStyle = '#fff6dc';
      ctx.lineWidth = 2;
      ctx.fillRect(-6, -6, 12, 12);
      ctx.strokeRect(-6, -6, 12, 12);
      ctx.restore();
    }

    // oyuncu oku
    const p = g.player;
    const [px, py] = this.toMap(p.position.x, p.position.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-p.yaw + Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fillStyle = '#ff5a4a';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // pusula
    ctx.font = 'bold 16px "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffc857';
    ctx.fillText('K', SIZE / 2, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('G', SIZE / 2, SIZE - 14);
    ctx.fillText('B', 14, SIZE / 2);
    ctx.fillText('D', SIZE - 14, SIZE / 2);
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.5;
      this.draw();
    }
  }
}

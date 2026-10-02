import * as THREE from 'three';
import { PlayerModel } from '../player/PlayerModel.js';
import { dampAngle } from '../utils/math.js';

const NAME_RANGE = 70;
const DRAW_RANGE = 160;

function nameSprite(name) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = 'bold 30px "Segoe UI", system-ui, sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(name).width) + 28;
  c.width = w;
  c.height = 46;
  ctx.font = font;
  ctx.fillStyle = 'rgba(10,18,24,0.62)';
  const r = 14;
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, 46 - r); ctx.quadraticCurveTo(w, 46, w - r, 46);
  ctx.lineTo(r, 46); ctx.quadraticCurveTo(0, 46, 0, 46 - r);
  ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.fill();
  ctx.fillStyle = '#ffe9b0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, w / 2, 24);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, sizeAttenuation: false, fog: false, transparent: true });
  const s = new THREE.Sprite(mat);
  s.scale.set((w / 46) * 0.032, 0.032, 1);
  s.renderOrder = 20;
  return s;
}

/**
 * Odadaki diğer oyuncuların görünümü: karakter modeli, ad etiketi, elindeki meşalenin ışığı.
 * Ağdan ~12 Hz gelen durumlar arasında yumuşak geçiş yapılır.
 */
export class RemotePlayers {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'remotePlayers';
    game.scene.add(this.group);
    this.list = new Map();
    this._v = new THREE.Vector3();
  }

  add(p) {
    if (this.list.has(p.id)) return this.setLook(p);
    const model = new PlayerModel(p.appearance);
    model.root.visible = false;
    this.group.add(model.root);
    const label = nameSprite(p.name);
    this.group.add(label);
    const light = this.game.world.lights.add({ x: 0, y: 0, z: 0, color: '#ffb35c', intensity: 7, distance: 16, flicker: true, priority: 30, enabled: false });
    this.list.set(p.id, {
      id: p.id, name: p.name, model, label, light,
      pos: new THREE.Vector3(), yaw: 0, state: null, has: false, lastSeen: 0,
    });
  }

  remove(id) {
    const e = this.list.get(id);
    if (!e) return;
    this.group.remove(e.model.root, e.label);
    e.label.material.map.dispose();
    e.label.material.dispose();
    this.game.world.lights.remove(e.light);
    this.list.delete(id);
  }

  setLook(p) {
    const e = this.list.get(p.id);
    if (!e) return;
    e.model.setAppearance(p.appearance);
    if (e.name !== p.name) {
      e.name = p.name;
      this.group.remove(e.label);
      e.label.material.map.dispose();
      e.label = nameSprite(p.name);
      this.group.add(e.label);
    }
  }

  applyState(id, s) {
    const e = this.list.get(id);
    if (!e) return;
    e.state = s;
    e.lastSeen = performance.now();
    if (!e.has) {
      e.pos.set(s.x, s.y, s.z);
      e.yaw = s.yaw;
      e.has = true;
    }
    if (s.m) this.game.vehicles.applyRemoteMount(id, s.m);
  }

  /** Uzak oyuncu konumları (harita, hayvanların kaçışı). */
  positions() {
    return [...this.list.values()].filter((e) => e.has).map((e) => ({
      id: e.id, name: e.name, x: e.pos.x, z: e.pos.z, cave: !!e.state?.c, ghost: !!e.state?.gh,
    }));
  }

  update(dt) {
    const g = this.game;
    const cam = g.camera.position;
    for (const e of this.list.values()) {
      const s = e.state;
      if (!s || !e.has) continue;
      const k = 1 - Math.exp(-14 * dt);
      const jump = Math.hypot(s.x - e.pos.x, s.z - e.pos.z) > 25; // ışınlanma
      if (jump) e.pos.set(s.x, s.y, s.z);
      else e.pos.lerp(this._v.set(s.x, s.y, s.z), k);
      e.yaw = dampAngle(e.yaw, s.yaw, 14, dt);
      const sameSpace = !!s.c === g.world.inCave && !s.gh;
      const dist = Math.hypot(e.pos.x - cam.x, e.pos.z - cam.z);
      const visible = sameSpace && dist < DRAW_RANGE;
      e.model.root.visible = visible;
      e.label.visible = visible && dist < NAME_RANGE;
      e.light.enabled = visible && s.h === 'torch' && !s.w;
      if (!visible) continue;
      const m = e.model;
      m.root.position.copy(e.pos);
      m.root.rotation.y = e.yaw;
      m.setHeld(s.h || null);
      m.setBackpack(!!s.bp);
      m.setArmor(typeof s.ar === 'string' && /^[a-z_]{1,24}$/.test(s.ar) ? s.ar : null);
      m.update(dt, {
        speed: s.s ?? 0, running: !!s.r, grounded: !!s.g, swimming: !!s.w,
        sitting: !!s.sit, rowing: s.row ?? 0, steering: !!s.st, sleeping: !!s.sl,
        action: s.a ? { type: s.a, k: s.k ?? 0 } : null,
      });
      e.label.position.set(e.pos.x, e.pos.y + (s.w ? 1.4 : s.sit ? 2.0 : 2.45), e.pos.z);
      if (e.light.enabled) {
        m.root.updateMatrixWorld(true);
        m.getFlameWorldPosition(this._v);
        e.light.x = this._v.x;
        e.light.y = this._v.y + 0.2;
        e.light.z = this._v.z;
      }
    }
  }
}

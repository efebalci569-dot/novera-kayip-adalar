import * as THREE from 'three';
import { PlayerModel } from './PlayerModel.js';
import { PlayerStats } from './PlayerStats.js';
import { Inventory } from './Inventory.js';
import { ITEMS } from '../data/items.js';
import { BASE_INVENTORY_SIZE, HOTBAR_SIZE } from '../data/progression.js';
import { dampAngle } from '../utils/math.js';

/**
 * Oyuncu varlığı: konum, model, istatistikler, envanter ve süreli eylemler
 * (vurma, toplama, yeme…). Hareket fiziği PlayerController'dadır.
 */
export class Player {
  constructor(game) {
    this.game = game;
    this.model = new PlayerModel();
    game.scene.add(this.model.root);

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.radius = 0.38;
    this.grounded = true;
    this.swimming = false;
    this.wading = false;
    this.running = false;
    this.speed = 0;

    this.stats = new PlayerStats(game.bus);
    this.inventory = new Inventory(BASE_INVENTORY_SIZE, game.bus, 'player');
    this.selectedSlot = 0;

    this.action = null;
    this.actionHeld = false;

    this.torchLight = game.world.lights.add({
      x: 0, y: 0, z: 0, color: '#ffb35c', intensity: 7.5, distance: 18, flicker: true, priority: 100, enabled: false,
    });
    this._v = new THREE.Vector3();

    game.bus.on('inventory:changed', ({ inventory }) => {
      if (inventory === this.inventory) this.refreshHeld();
    });
  }

  get selectedStack() {
    return this.inventory.slots[this.selectedSlot] ?? null;
  }

  get selectedItem() {
    const s = this.selectedStack;
    return s ? ITEMS[s.id] : null;
  }

  get isHoldingTorch() {
    return this.model.heldKey === 'torch';
  }

  selectSlot(i) {
    if (i < 0 || i >= HOTBAR_SIZE) return;
    this.selectedSlot = i;
    this.refreshHeld();
    this.game.bus.emit('hotbar:selected', { index: i });
  }

  refreshHeld() {
    if (this.action && this.actionHeld) return;
    this.model.setHeld(this.selectedItem?.held ?? null);
  }

  /**
   * Süreli bir eylem başlatır. opts: { impactAt, onImpact, onComplete, target, held }
   * Eylem sürerken yenisi başlatılamaz.
   */
  startAction(type, dur, opts = {}) {
    if (this.action) return false;
    this.action = {
      type, t: 0, dur,
      impactAt: opts.impactAt ?? dur,
      impacted: false,
      onImpact: opts.onImpact,
      onComplete: opts.onComplete,
      target: opts.target ?? null,
    };
    if (opts.held !== undefined) {
      this.actionHeld = true;
      this.model.setHeld(opts.held);
    }
    return true;
  }

  cancelAction() {
    this.action = null;
    if (this.actionHeld) {
      this.actionHeld = false;
      this.refreshHeld();
    }
  }

  updateAction(dt) {
    const a = this.action;
    if (!a) return;
    a.t += dt;
    if (!a.impacted && a.t >= a.impactAt) {
      a.impacted = true;
      a.onImpact?.();
    }
    if (a.t >= a.dur) {
      this.action = null;
      if (this.actionHeld) {
        this.actionHeld = false;
        this.refreshHeld();
      }
      a.onComplete?.();
    }
  }

  teleport(x, y, z, yaw = this.yaw) {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.grounded = true;
    this.teleported = true; // düşüş hasarı hesabı sıfırlansın
  }

  update(dt) {
    this.updateAction(dt);
    const target = this.action?.target;
    if (target) this.yaw = dampAngle(this.yaw, Math.atan2(target.x - this.position.x, target.z - this.position.z), 14, dt);

    this.model.root.position.copy(this.position);
    this.model.root.rotation.y = this.yaw;
    this.model.update(dt, {
      speed: this.speed,
      running: this.running,
      grounded: this.grounded,
      swimming: this.swimming,
      action: this.action ? { type: this.action.type, k: this.action.t / this.action.dur } : null,
    });

    const torch = this.isHoldingTorch && !this.swimming;
    this.torchLight.enabled = torch;
    if (torch) {
      this.model.root.updateMatrixWorld(true);
      const p = this.model.getFlameWorldPosition(this._v);
      this.torchLight.x = p.x;
      this.torchLight.y = p.y + 0.2;
      this.torchLight.z = p.z;
    }
  }

  serialize() {
    return {
      position: [this.position.x, this.position.y, this.position.z],
      yaw: this.yaw,
      stats: this.stats.serialize(),
      inventory: { size: this.inventory.size, slots: this.inventory.serialize() },
      selectedSlot: this.selectedSlot,
    };
  }

  deserialize(d) {
    if (!d) return;
    const [x, y, z] = d.position ?? [0, 0, 0];
    this.teleport(x, y, z, d.yaw ?? 0);
    this.stats.deserialize(d.stats);
    this.inventory.deserialize(d.inventory?.slots, d.inventory?.size ?? BASE_INVENTORY_SIZE);
    this.selectedSlot = d.selectedSlot ?? 0;
    this.refreshHeld();
  }
}

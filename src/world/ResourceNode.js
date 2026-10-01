// Dünyadaki tek bir toplanabilir kaynak (ağaç, kaya, çalı…).
// Görsel olarak bir InstancedMesh içindeki tek bir örneğe karşılık gelir.

export class ResourceNode {
  constructor(id, type, def, x, y, z, yaw, scale, variant) {
    this.id = id;
    this.type = type;
    this.def = def;
    this.x = x;
    this.y = y;
    this.z = z;
    this.yaw = yaw;
    this.scale = scale;
    this.variant = variant;
    this.spacing = 2;

    this.hp = def.hp ?? 0;
    this.uses = def.uses ?? 0;
    this.active = true;
    this.removed = false; // yapı yerleştirilirken temizlenen kaynaklar
    this.respawnAt = 0;

    // animasyon durumu
    this.anim = null;
    this.tiltX = 0;
    this.tiltZ = 0;
    this.scaleMul = 1;
    this.extraYaw = 0;

    this.mesh = null;
    this.instanceIndex = -1;
    this.collider = null;
  }

  get name() {
    return this.def.name;
  }

  get maxHp() {
    return this.def.hp ?? 0;
  }

  get maxUses() {
    return this.def.uses ?? 0;
  }

  get isHit() {
    return this.def.mode === 'hit';
  }

  get interactable() {
    return this.active && !this.removed && !(this.anim && (this.anim.type === 'fall' || this.anim.type === 'shrink'));
  }

  isDefault() {
    return this.active && !this.removed && this.hp === this.maxHp && this.uses === this.maxUses;
  }
}

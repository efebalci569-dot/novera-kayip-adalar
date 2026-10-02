import { BOSSES } from '../data/bosses.js';

// Adalar arası seyir: hangi adaların konumu biliniyor, denizde nereye kadar gidilebilir,
// haritası bulunmamış adaların etrafındaki sis, açık denizde rüzgâr ve ada başına doğma noktası.

const SWIM_MARGIN = 82; // kıyıdan bu kadar açıkta yüzmeye izin var
const RAFT_MARGIN = 112; // sal kıyıdan bu kadar uzaklaşabilir
const MIST_MARGIN = 300; // bilinmeyen adanın çevresindeki sis perdesi
const WORLD_RADIUS = 1500; // okyanusun sonu
const OPEN_SEA = 150; // en yakın kıyıdan bu kadar uzaktayken açık deniz rüzgârı
const ISLAND_ICONS = { tropical: '🏝️', desert: '🌵', ice: '❄️', volcano: '🌋' };

export class NavigationSystem {
  constructor(game) {
    this.game = game;
    this.known = new Set(['novera']); // haritası bulunmuş adalar (dünyaya ait, odadaki herkes için)
    this.warnTimer = 0;
    this.openSea = false;
  }

  get world() {
    return this.game.world;
  }

  /** Adanın konumu biliniyor mu (haritası bulunmuş ya da ziyaret edilmiş)? */
  isKnown(id) {
    return this.known.has(id) || this.game.exploration.visitedIslands.has(id);
  }

  bossOf(islandId) {
    return Object.keys(BOSSES).find((b) => BOSSES[b].island === islandId) ?? null;
  }

  islandIcon(id) {
    return ISLAND_ICONS[this.world.islandById[id]?.biome] ?? '🏝️';
  }

  /** Bir adanın konumunu açar (seyir haritası). broadcast: odadakilere de bildir. */
  reveal(id, { silent = false, broadcast = true } = {}) {
    const isl = this.world.islandById[id];
    if (!isl || this.known.has(id)) return false;
    this.known.add(id);
    const g = this.game;
    if (!silent) {
      g.ui.hud.banner('Yeni Rota', isl.name, 'Seyir haritası adanın konumunu gösteriyor. Tekneyle yelken aç — pusuladaki işareti izle.', 6);
      g.audio.play('discover');
    }
    g.bus.emit('island:revealed', { id });
    if (broadcast) g.net.emit({ t: 'reveal', id });
    g.requestSave();
    return true;
  }

  // ── Deniz sınırları ─────────────────────────────────────
  warn(text) {
    if (this.warnTimer > 0) return;
    this.warnTimer = 6;
    this.game.notify(text, 'warn');
  }

  /** Yüzen oyuncu: en yakın adanın kıyısından çok uzaklaşamaz. */
  limitSwimmer(pos) {
    const isl = this.world.nearestIsland(pos.x, pos.z);
    const max = isl.coastRadius(Math.atan2(pos.z - isl.cz, pos.x - isl.cx)) + SWIM_MARGIN;
    const dx = pos.x - isl.cx;
    const dz = pos.z - isl.cz;
    const d = Math.hypot(dx, dz);
    if (d <= max) return false;
    pos.x = isl.cx + (dx / d) * max;
    pos.z = isl.cz + (dz / d) * max;
    this.warn('Açık deniz çok tehlikeli. Daha uzağa gitmek için bir tekneye ihtiyacın var.');
    return true;
  }

  /** Tekne: sal kıyıdan ayrılamaz; tekne bilinmeyen adaların sisine giremez. Sınırda ise true. */
  limitBoat(b) {
    const w = this.world;
    let hit = false;
    if (b.type === 'raft') {
      const isl = w.nearestIsland(b.x, b.z);
      const max = isl.coastRadius(Math.atan2(b.z - isl.cz, b.x - isl.cx)) + RAFT_MARGIN;
      const d = isl.distanceTo(b.x, b.z);
      if (d > max) {
        b.x = isl.cx + ((b.x - isl.cx) / d) * max;
        b.z = isl.cz + ((b.z - isl.cz) / d) * max;
        this.warn('🌊 Dalgalar sal için fazla sert. Açık denize çıkmak için bir Tekne gerekir.');
        hit = true;
      }
      return hit;
    }
    for (const isl of w.islands) {
      if (this.isKnown(isl.id)) continue;
      const d = isl.distanceTo(b.x, b.z);
      const r = isl.radius + MIST_MARGIN;
      if (d < r) {
        b.x = isl.cx + ((b.x - isl.cx) / d) * r;
        b.z = isl.cz + ((b.z - isl.cz) / d) * r;
        this.warn('⛈️ Yoğun bir sis ve fırtına… Bu yönde ne olduğunu bilmeden ilerleyemezsin. (Bir seyir haritası gerekir.)');
        hit = true;
      }
    }
    const r0 = Math.hypot(b.x, b.z);
    if (r0 > WORLD_RADIUS) {
      b.x *= WORLD_RADIUS / r0;
      b.z *= WORLD_RADIUS / r0;
      this.warn('⛈️ Okyanusun bu kısmı geçilemeyecek kadar fırtınalı.');
      hit = true;
    }
    return hit;
  }

  /** Açık denizde rüzgâr yelkeni doldurur (tekne hız çarpanı). */
  sailBoost(b) {
    if (b.type !== 'boat') return 1;
    const isl = this.world.nearestIsland(b.x, b.z);
    const off = isl.distanceTo(b.x, b.z) - isl.radius;
    const open = off > OPEN_SEA;
    if (open !== this.openSea) {
      this.openSea = open;
      if (open) this.game.notify('⛵ Açık denizdesin: rüzgâr yelkenleri dolduruyor, tekne çok daha hızlı!', 'info');
    }
    return open ? 1.8 : 1;
  }

  // ── Doğma noktası ───────────────────────────────────────
  /** Ölünce: bu adada kurduğun son barınak, yoksa adanın varış sahili. */
  respawnPoint(x, z) {
    const w = this.world;
    const isl = w.islandAt(x, z) ?? w.nearestIsland(x, z);
    const state = this.game.state;
    const own = state.spawnPoints?.[isl.id] ?? (isl.id === 'novera' ? state.spawnPoint : null);
    if (own) return own;
    return w.arrivalPoint(isl.id);
  }

  update(dt) {
    this.warnTimer -= dt;
  }

  serialize() {
    return [...this.known];
  }

  deserialize(list) {
    for (const id of list ?? []) if (this.world.islandById[id]) this.known.add(id);
  }
}

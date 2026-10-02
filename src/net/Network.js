import { Peer } from 'peerjs';
import { Profile } from '../core/Profile.js';
import { sanitizeAppearance } from '../data/appearance.js';

// Çok oyunculu: tarayıcılar arası doğrudan (WebRTC) bağlantı. Odayı kuran oyuncu "ev sahibi"dir:
// dünyanın asıl sahibi odur, misafirlerin mesajlarını diğerlerine aktarır (yıldız bağlantı).
// Eşleşme (sinyalleşme) için PeerJS'in ücretsiz genel sunucusu kullanılır; oda kodu ev sahibinin kimliğidir.
// Kendi PeerJS sunucunuzu kullanmak için adrese ?peer=alanadi:port ekleyin.

export const MAX_PLAYERS = 8;
const NET_VERSION = 4;
const ID_PREFIX = 'novera-kayip-adalar-oda-';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const STATE_INTERVAL = 1 / 12; // oyuncu konumu (s)
const ANIMAL_INTERVAL = 0.2; // hayvan durumu (ev sahibi)
const ENEMY_INTERVAL = 0.2; // düşman durumu (ev sahibi → her misafire yakınındakiler)
const ENEMY_RANGE = 170;
const TIME_INTERVAL = 1;
const GUEST_SAVE_INTERVAL = 30;
// ev sahibinin misafirden alıp diğer misafirlere aynen ilettiği mesajlar
const RELAY = new Set(['p', 'node', 'build', 'chest', 'boat', 'chat', 'look', 'reveal']);

function genCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export function cleanCode(code) {
  return String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function cleanText(text, max = 140) {
  return String(text ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

const ERRORS = {
  'peer-unavailable': 'Oda bulunamadı. Kodu kontrol et (oda kapanmış olabilir).',
  network: 'Eşleşme sunucusuna ulaşılamadı. İnternet bağlantını kontrol et.',
  'server-error': 'Eşleşme sunucusu şu an yanıt vermiyor. Biraz sonra tekrar dene.',
  'socket-error': 'Eşleşme sunucusuna bağlanılamadı.',
  'browser-incompatible': 'Tarayıcın çok oyunculuyu (WebRTC) desteklemiyor.',
  'webrtc': 'Doğrudan bağlantı kurulamadı (ağ/güvenlik duvarı engelliyor olabilir).',
};

/**
 * Oda kurma/katılma, mesajlaşma ve dünya senkronizasyonunun ağ tarafı.
 * Oyun sistemleri yalnızca `emit()` ile değişiklik bildirir; gelen mesajlar `handle()` ile
 * ilgili sisteme yönlendirilir.
 */
export class NetworkManager {
  constructor(game) {
    this.game = game;
    this.peer = null;
    this.role = null; // null | 'host' | 'client'
    this.code = null;
    this.selfId = null;
    this.hostId = null;
    this.conns = new Map(); // ev sahibi: misafir kimliği → bağlantı · misafir: ev sahibi → bağlantı
    this.players = new Map(); // uzak oyuncular: id → { id, name, appearance }
    this.sleepers = new Set();
    this.stateTimer = 0;
    this.animalTimer = 0;
    this.enemyTimer = 0;
    this.timeTimer = 0;
    this.guestSaveTimer = GUEST_SAVE_INTERVAL;
    this.applyingChest = false;
    game.bus.on('inventory:changed', ({ inventory }) => this.onInventoryChanged(inventory));
  }

  get active() {
    return !!this.role;
  }

  get isHost() {
    return this.role === 'host';
  }

  get isClient() {
    return this.role === 'client';
  }

  get playerCount() {
    return this.players.size + (this.role ? 1 : 0);
  }

  peerOptions() {
    const opts = {
      debug: 0,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun.cloudflare.com:3478' },
        ],
      },
    };
    try {
      const params = new URLSearchParams(window.location.search);
      const custom = params.get('peer');
      if (custom) {
        const [host, port] = custom.split(':');
        Object.assign(opts, {
          host, port: Number(port) || 9000, path: params.get('peerPath') || '/',
          secure: params.get('peerSecure') === '1',
        });
      }
    } catch {
      /* yoksay */
    }
    return opts;
  }

  errorText(err) {
    return ERRORS[err?.type] ?? err?.message ?? 'Bilinmeyen bağlantı hatası';
  }

  // ── Oda kurma ───────────────────────────────────────────
  /** Oda açar; oda kodunu döndürür. */
  host() {
    if (this.role) return Promise.resolve(this.code);
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        this.peer?.destroy();
        this.peer = null;
        reject(new Error('Eşleşme sunucusu zaman aşımına uğradı. Tekrar dene.'));
      }, 15000);
      const attempt = (n) => {
        const code = genCode();
        const peer = new Peer(ID_PREFIX + code, this.peerOptions());
        this.peer = peer;
        peer.on('open', (id) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          this.role = 'host';
          this.code = code;
          this.selfId = id;
          this.hostId = id;
          this.game.onRoomOpened(code);
          resolve(code);
        });
        peer.on('connection', (conn) => this.acceptConnection(conn));
        peer.on('disconnected', () => {
          // sinyal sunucusu bağlantısı koptu: mevcut oyuncular etkilenmez, yeni katılım için yeniden bağlan
          if (this.role === 'host' && !peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 2000);
        });
        peer.on('error', (err) => {
          if (!done && err.type === 'unavailable-id' && n < 4) {
            peer.destroy();
            attempt(n + 1);
          } else if (!done) {
            done = true;
            clearTimeout(timer);
            peer.destroy();
            this.peer = null;
            reject(new Error(this.errorText(err)));
          }
        });
      };
      attempt(0);
    });
  }

  acceptConnection(conn) {
    conn.on('data', (msg) => this.onHostData(conn, msg));
    conn.on('close', () => this.onPeerLeft(conn.peer));
    conn.on('error', () => this.onPeerLeft(conn.peer));
  }

  onHostData(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') {
      if (msg.v !== NET_VERSION) {
        conn.send({ t: 'reject', reason: 'Oyun sürümleriniz farklı. İkiniz de sayfayı yenileyin.' });
        setTimeout(() => conn.close(), 600);
        return;
      }
      if (this.playerCount >= MAX_PLAYERS) {
        conn.send({ t: 'reject', reason: `Oda dolu (${MAX_PLAYERS}/${MAX_PLAYERS}).` });
        setTimeout(() => conn.close(), 600);
        return;
      }
      const id = conn.peer;
      const p = { id, name: Profile.cleanName(msg.name) || 'Kazazede', appearance: sanitizeAppearance(msg.appearance) };
      const others = [this.selfPlayer(), ...this.players.values()];
      this.players.set(id, p);
      this.conns.set(id, conn);
      conn.send({ t: 'welcome', id, code: this.code, hostId: this.selfId, players: others, snapshot: this.game.worldSnapshot() });
      this.broadcast({ t: 'join', player: p, from: this.selfId }, id);
      this.game.onPlayerJoined(p);
      return;
    }
    const from = conn.peer;
    if (!this.players.has(from)) return; // selamlaşmadan gelen mesaj
    msg.from = from;
    if (RELAY.has(msg.t)) this.broadcast(msg, from);
    this.handle(msg);
  }

  selfPlayer() {
    const pr = this.game.profile;
    return { id: this.selfId, name: pr.name, appearance: pr.appearance };
  }

  onPeerLeft(id) {
    if (!this.isHost || !this.players.has(id)) return;
    const p = this.players.get(id);
    this.players.delete(id);
    this.conns.delete(id);
    this.sleepers.delete(id);
    this.broadcast({ t: 'leave', id, from: this.selfId });
    this.game.onPlayerLeft(p);
    this.checkSleep();
  }

  // ── Katılma ─────────────────────────────────────────────
  /** Koda göre odaya bağlanır; ev sahibinin "welcome" mesajını döndürür. */
  join(rawCode) {
    const code = cleanCode(rawCode);
    if (code.length !== 6) return Promise.reject(new Error('Oda kodu 6 karakter olmalı.'));
    if (this.role) return Promise.reject(new Error('Zaten bir odadasın.'));
    return new Promise((resolve, reject) => {
      let done = false;
      const fail = (text) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.peer?.destroy();
        this.peer = null;
        reject(new Error(text));
      };
      const timer = setTimeout(() => fail('Bağlantı zaman aşımına uğradı. Kodu ve internetini kontrol et.'), 20000);
      const peer = new Peer(this.peerOptions());
      this.peer = peer;
      peer.on('error', (err) => {
        if (!done) fail(this.errorText(err));
        else if (this.isClient && err.type === 'peer-unavailable') this.onHostLost();
      });
      peer.on('open', (id) => {
        this.selfId = id;
        const hostId = ID_PREFIX + code;
        const conn = peer.connect(hostId, { reliable: true });
        conn.on('open', () => {
          const pr = this.game.profile;
          conn.send({ t: 'hello', v: NET_VERSION, name: pr.name, appearance: pr.appearance });
        });
        conn.on('data', (msg) => {
          if (!msg || typeof msg !== 'object') return;
          if (msg.t === 'welcome' && !done) {
            done = true;
            clearTimeout(timer);
            this.role = 'client';
            this.code = code;
            this.hostId = hostId;
            this.conns.set(hostId, conn);
            for (const p of msg.players ?? []) this.players.set(p.id, { id: p.id, name: Profile.cleanName(p.name) || 'Kazazede', appearance: sanitizeAppearance(p.appearance) });
            resolve(msg);
          } else if (msg.t === 'reject') fail(msg.reason ?? 'Odaya girilemedi.');
          else if (done) this.handle(msg);
        });
        conn.on('close', () => (done ? this.onHostLost() : fail('Ev sahibi bağlantıyı kapattı.')));
        conn.on('error', () => (done ? this.onHostLost() : fail(ERRORS.webrtc)));
      });
    });
  }

  onHostLost() {
    if (!this.isClient) return;
    this.shutdown();
    this.game.onDisconnected('Ev sahibiyle bağlantı koptu ya da oda kapandı.');
  }

  /** Odadan ayrıl (ev sahibiyse odayı kapatır). */
  leave() {
    if (!this.role) return;
    if (this.isHost) this.broadcast({ t: 'close', from: this.selfId });
    this.shutdown();
  }

  shutdown() {
    const peer = this.peer;
    this.role = null;
    this.code = null;
    this.peer = null;
    this.sleepers.clear();
    for (const c of this.conns.values()) {
      try { c.close(); } catch { /* yoksay */ }
    }
    this.conns.clear();
    for (const id of [...this.players.keys()]) this.game.remotePlayers.remove(id);
    this.players.clear();
    setTimeout(() => peer?.destroy(), 300);
  }

  // ── Gönderme ────────────────────────────────────────────
  sendTo(id, msg) {
    const c = this.conns.get(id);
    if (c?.open) c.send(msg);
  }

  /** Ev sahibi: tüm misafirlere (biri hariç). Misafir: ev sahibine. */
  broadcast(msg, exceptId = null) {
    for (const [id, c] of this.conns) if (id !== exceptId && c.open) c.send(msg);
  }

  /** Bir değişikliği herkese duyurur. */
  emit(msg) {
    if (!this.role) return;
    msg.from = this.selfId;
    this.broadcast(msg);
  }

  // ── Gelen mesajlar ──────────────────────────────────────
  handle(msg) {
    const g = this.game;
    switch (msg.t) {
      case 'p': g.remotePlayers.applyState(msg.from, msg); break;
      case 'node': g.world.resources.applyRemote(msg); break;
      case 'build': g.building.applyRemote(msg); break;
      case 'chest': this.applyChest(msg); break;
      case 'boat': g.vehicles.applyRemoteSpawn(msg); break;
      case 'animals': if (this.isClient) g.animals.applySnapshot(msg.l); break;
      case 'aHit': if (this.isHost) g.animals.remoteHit(msg); break;
      case 'aBut': if (this.isHost) g.animals.remoteButcher(msg); break;
      case 'aKill': g.animals.onRemoteKill(msg); break;
      case 'aButOk': g.animals.onButcherOk(msg); break;
      case 'aButNo': g.animals.onButcherDenied(msg); break;
      case 'time': if (this.isClient) g.applyHostTime(msg); break;
      // adalar, düşmanlar ve boss'lar
      case 'reveal': g.navigation.reveal(msg.id, { broadcast: false }); break;
      case 'enemies': if (this.isClient) g.enemies.applySnapshot(msg.l); break;
      case 'eHit': if (this.isHost) g.enemies.remoteHit(msg); break;
      case 'eKill': if (this.isClient) g.enemies.reward(msg.type, Array.isArray(msg.drops) ? msg.drops : []); break;
      case 'eProj': if (this.isClient) g.enemies.applyRemoteProjectile(msg); break;
      case 'pDmg':
        if (this.isClient) {
          g.hurtPlayer(Math.min(200, Number(msg.amt) || 0), cleanText(msg.src, 40), {
            poison: !!msg.poison, burn: !!msg.burn, chill: !!msg.chill, fromX: Number(msg.fx), fromZ: Number(msg.fz),
          });
        }
        break;
      case 'boss': if (this.isClient) g.bosses.applyNet(msg); break;
      case 'bSpawn': if (this.isClient) g.bosses.applySpawn(msg); break;
      case 'bTel': if (this.isClient && msg.d) g.bosses.addTelegraph(msg.d); break;
      case 'bRage': if (this.isClient && g.bosses.boss) g.bosses.boss.enraged = true; break;
      case 'bSleep': if (this.isClient) g.bosses.putToSleep(false); break;
      case 'bDead': if (this.isClient) g.bosses.applyRemoteDead(msg); break;
      case 'bHit': if (this.isHost) g.bosses.remoteHit(msg); break;
      case 'bSum': if (this.isHost) g.bosses.remoteSummon(msg); break;
      case 'bNo': if (this.isClient) g.bosses.refund(msg); break;
      case 'chat': g.ui.hud.chatMessage(this.nameOf(msg.from), cleanText(msg.text)); break;
      case 'look': {
        const p = this.players.get(msg.from);
        if (p) {
          p.name = Profile.cleanName(msg.name) || p.name;
          p.appearance = sanitizeAppearance(msg.appearance);
          g.remotePlayers.setLook(p);
          g.ui.hud.renderPlayers();
        }
        break;
      }
      case 'join': {
        if (!this.isClient) break;
        const p = { id: msg.player.id, name: Profile.cleanName(msg.player.name) || 'Kazazede', appearance: sanitizeAppearance(msg.player.appearance) };
        this.players.set(p.id, p);
        g.onPlayerJoined(p);
        break;
      }
      case 'leave': {
        if (!this.isClient) break;
        const p = this.players.get(msg.id);
        this.players.delete(msg.id);
        if (p) g.onPlayerLeft(p);
        break;
      }
      case 'sleep': if (this.isHost) this.setSleeping(msg.from, !!msg.on); break;
      case 'sleepState': g.onSleepState(msg.n, msg.total); break;
      case 'wake': if (this.isClient) g.wakeUp(msg); break;
      case 'close': if (this.isClient) this.onHostLost(); break;
      default: break;
    }
  }

  nameOf(id) {
    if (id === this.selfId) return this.game.profile.name;
    return this.players.get(id)?.name ?? 'Biri';
  }

  // ── Sandıklar ───────────────────────────────────────────
  onInventoryChanged(inv) {
    if (!this.role || this.applyingChest || !inv.id?.startsWith('chest_')) return;
    this.emit({ t: 'chest', uid: inv.id.slice(6), slots: inv.serialize() });
  }

  applyChest(msg) {
    const b = this.game.building.byUid(msg.uid);
    if (!b?.storage) return;
    this.applyingChest = true;
    b.storage.deserialize(msg.slots, b.storage.size);
    this.applyingChest = false;
  }

  // ── Ortak uyku ──────────────────────────────────────────
  /** Gece herkes yatınca sabah olur. */
  requestSleep(on) {
    if (this.isHost) this.setSleeping(this.selfId, on);
    else this.emit({ t: 'sleep', on: on ? 1 : 0 });
  }

  setSleeping(id, on) {
    if (on) this.sleepers.add(id);
    else this.sleepers.delete(id);
    this.checkSleep();
  }

  checkSleep() {
    if (!this.isHost) return;
    const g = this.game;
    // izleyiciler (hardcore'da ölenler) uyuyamaz; sabahı onlar beklemez
    let ghosts = g.player.ghost ? 1 : 0;
    for (const id of this.players.keys()) {
      if (!this.sleepers.has(id) && g.remotePlayers.list.get(id)?.state?.gh) ghosts++;
    }
    const total = this.playerCount - ghosts;
    if (this.sleepers.size === 0 || total <= 0) return;
    if (this.sleepers.size >= total) {
      this.sleepers.clear();
      g.time.skipTo(6);
      const msg = { t: 'wake', d: g.time.day, h: g.time.hour, e: g.time.elapsed, from: this.selfId };
      this.broadcast(msg);
      g.wakeUp(msg);
    } else {
      const msg = { t: 'sleepState', n: this.sleepers.size, total, from: this.selfId };
      this.broadcast(msg);
      g.onSleepState(msg.n, msg.total);
    }
  }

  // ── Döngü ───────────────────────────────────────────────
  update(dt) {
    if (!this.role) return;
    const g = this.game;
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this.stateTimer = STATE_INTERVAL;
      this.emit(g.playerNetState());
    }
    if (this.isHost) {
      this.animalTimer -= dt;
      if (this.animalTimer <= 0 && this.players.size) {
        this.animalTimer = ANIMAL_INTERVAL;
        this.broadcast({ t: 'animals', l: g.animals.snapshot(), from: this.selfId });
      }
      this.enemyTimer -= dt;
      if (this.enemyTimer <= 0 && this.players.size) {
        this.enemyTimer = ENEMY_INTERVAL;
        // her misafire yalnızca yakınındaki düşmanlar
        for (const r of g.remotePlayers.positions()) {
          this.sendTo(r.id, { t: 'enemies', l: g.enemies.snapshot(r.x, r.z, ENEMY_RANGE), from: this.selfId });
        }
      }
      this.timeTimer -= dt;
      if (this.timeTimer <= 0 && this.players.size) {
        this.timeTimer = TIME_INTERVAL;
        this.broadcast({ t: 'time', d: g.time.day, h: g.time.hour, e: g.time.elapsed, from: this.selfId });
      }
    } else {
      this.guestSaveTimer -= dt;
      if (this.guestSaveTimer <= 0) {
        this.guestSaveTimer = GUEST_SAVE_INTERVAL;
        g.saveGuest();
      }
    }
  }

  sendChat(text) {
    const t = cleanText(text);
    if (!t || !this.role) return null;
    this.emit({ t: 'chat', text: t });
    return t;
  }
}

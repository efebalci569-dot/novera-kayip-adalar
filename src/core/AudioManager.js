// Tamamen prosedürel ses: hiçbir ses dosyası gerekmez. Web Audio API ile
// dalga, rüzgâr, kuş, cırcır böceği gibi ortam sesleri ve efektler anlık sentezlenir.
// İleride gerçek ses dosyaları eklemek için play() içine bir AudioBuffer yolu eklenebilir.

const PENTA_DAY = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
const PENTA_NIGHT = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25];

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ready = false;
    this.lastPlayed = {};
    this.nextBird = 3;
    this.nextCricket = 1;
    this.nextMusic = 25;
    this.nextCrackle = 0;
    this.nextDrip = 1;
    this.time = 0;
    settings.onChange(() => this.applyVolumes());
  }

  /** Tarayıcılar sesi ancak bir kullanıcı etkileşiminden sonra başlatmaya izin verir. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);
    this.sfx = ctx.createGain();
    this.amb = ctx.createGain();
    this.music = ctx.createGain();
    this.sfx.connect(this.master);
    this.amb.connect(this.master);
    this.music.connect(this.master);

    // müzik için yankı (geri beslemeli gecikme)
    this.musicDelay = ctx.createDelay(1.5);
    this.musicDelay.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const delayLP = ctx.createBiquadFilter();
    delayLP.type = 'lowpass';
    delayLP.frequency.value = 1800;
    this.musicIn = ctx.createGain();
    this.musicIn.connect(this.music);
    this.musicIn.connect(this.musicDelay);
    this.musicDelay.connect(delayLP);
    delayLP.connect(fb);
    fb.connect(this.musicDelay);
    delayLP.connect(this.music);

    const len = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.setupAmbient();
    this.applyVolumes();
    this.ready = true;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.masterVolume, t, 0.05);
    this.sfx.gain.setTargetAtTime(s.sfxVolume, t, 0.05);
    this.amb.gain.setTargetAtTime(s.ambientVolume, t, 0.05);
    this.music.gain.setTargetAtTime(s.musicVolume * 0.5, t, 0.05);
  }

  loopNoise(filterType, freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f);
    f.connect(g);
    g.connect(this.amb);
    src.start();
    return { src, filter: f, gain: g };
  }

  setupAmbient() {
    const ctx = this.ctx;
    this.waves = this.loopNoise('lowpass', 520, 0.6);
    this.wind = this.loopNoise('bandpass', 650, 0.6);

    // cırcır böceği: sürekli osilatör + zamanlanmış zarf
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 4400;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4400;
    bp.Q.value = 6;
    this.cricketEnv = ctx.createGain();
    this.cricketEnv.gain.value = 0;
    this.cricketBus = ctx.createGain();
    this.cricketBus.gain.value = 0;
    osc.connect(bp);
    bp.connect(this.cricketEnv);
    this.cricketEnv.connect(this.cricketBus);
    this.cricketBus.connect(this.amb);
    osc.start();
  }

  // ── Sentez yardımcıları ─────────────────────────────────
  tone({ type = 'sine', freq, freqEnd, dur = 0.2, vol = 0.3, attack = 0.005, delay = 0, bus, pan = 0 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    let out = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      out = p;
    }
    out.connect(bus ?? this.sfx);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noise({ dur = 0.2, vol = 0.3, type = 'bandpass', freq = 1000, freqEnd, q = 1, attack = 0.004, delay = 0, bus }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus ?? this.sfx);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  /** Efekt çal. Aynı efekt çok sık tekrarlanırsa (ör. adımlar) kısıtlanır. */
  play(name, { volume = 1, minGap = 0.03 } = {}) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    if (this.lastPlayed[name] && now - this.lastPlayed[name] < minGap) return;
    this.lastPlayed[name] = now;
    const v = volume;
    const r = 0.92 + Math.random() * 0.16;
    switch (name) {
      case 'chop':
        this.noise({ dur: 0.14, vol: 0.5 * v, freq: 900 * r, q: 1.2 });
        this.tone({ freq: 150 * r, freqEnd: 60, dur: 0.16, vol: 0.45 * v });
        break;
      case 'mine':
        this.tone({ type: 'triangle', freq: 1250 * r, freqEnd: 800, dur: 0.1, vol: 0.28 * v });
        this.noise({ dur: 0.08, vol: 0.35 * v, type: 'highpass', freq: 2600 });
        this.tone({ freq: 110, freqEnd: 60, dur: 0.12, vol: 0.3 * v });
        break;
      case 'swing':
        this.noise({ dur: 0.18, vol: 0.12 * v, freq: 500, freqEnd: 1800, q: 1.4 });
        break;
      case 'pickup':
        this.tone({ freq: 520 * r, freqEnd: 760, dur: 0.09, vol: 0.18 * v });
        this.tone({ freq: 780 * r, freqEnd: 1040, dur: 0.1, vol: 0.14 * v, delay: 0.07 });
        break;
      case 'rustle':
        for (let i = 0; i < 3; i++) this.noise({ dur: 0.12, vol: 0.18 * v, freq: 2600 * r, q: 0.8, delay: i * 0.06 });
        break;
      case 'splash':
        this.noise({ dur: 0.45, vol: 0.35 * v, type: 'lowpass', freq: 2400, freqEnd: 350 });
        break;
      case 'craft':
        [523.25, 659.25, 783.99].forEach((f, i) => this.tone({ type: 'triangle', freq: f, dur: 0.22, vol: 0.16 * v, delay: i * 0.07 }));
        this.noise({ dur: 0.1, vol: 0.15 * v, freq: 1500 });
        break;
      case 'build':
        this.tone({ freq: 95, freqEnd: 45, dur: 0.3, vol: 0.5 * v });
        this.noise({ dur: 0.12, vol: 0.3 * v, freq: 700, delay: 0.02 });
        this.noise({ dur: 0.1, vol: 0.25 * v, freq: 900, delay: 0.18 });
        break;
      case 'levelup':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone({ type: 'triangle', freq: f, dur: 0.5, vol: 0.16 * v, delay: i * 0.09 }));
        this.tone({ freq: 2093, dur: 0.8, vol: 0.05 * v, delay: 0.36 });
        break;
      case 'quest':
        [392, 587.33].forEach((f) => this.tone({ type: 'triangle', freq: f, dur: 0.35, vol: 0.13 * v }));
        [523.25, 783.99].forEach((f) => this.tone({ type: 'triangle', freq: f, dur: 0.7, vol: 0.14 * v, delay: 0.18 }));
        break;
      case 'discover':
        [293.66, 440, 587.33, 880].forEach((f, i) => this.tone({ freq: f, dur: 1.6, vol: 0.08 * v, attack: 0.15, delay: i * 0.12 }));
        break;
      case 'treefall':
        this.tone({ type: 'sawtooth', freq: 95, freqEnd: 55, dur: 0.7, vol: 0.06 * v, attack: 0.1 });
        break;
      case 'crash':
        this.noise({ dur: 0.6, vol: 0.45 * v, type: 'lowpass', freq: 900, freqEnd: 200 });
        this.tone({ freq: 70, freqEnd: 35, dur: 0.4, vol: 0.4 * v });
        break;
      case 'eat':
        for (let i = 0; i < 3; i++) this.noise({ dur: 0.07, vol: 0.22 * v, freq: 1600 * r, q: 2, delay: i * 0.13 });
        break;
      case 'drink':
        for (let i = 0; i < 4; i++) this.tone({ freq: 280 + i * 40, freqEnd: 700 + i * 60, dur: 0.07, vol: 0.12 * v, delay: i * 0.11 });
        break;
      case 'step':
        this.noise({ dur: 0.06, vol: 0.06 * v, freq: 600 * r, q: 0.7 });
        break;
      case 'stepSand':
        this.noise({ dur: 0.08, vol: 0.05 * v, type: 'highpass', freq: 1800 * r, q: 0.5 });
        break;
      case 'click':
        this.tone({ freq: 1800, dur: 0.03, vol: 0.08 * v });
        break;
      case 'error':
        this.tone({ type: 'square', freq: 170, dur: 0.14, vol: 0.06 * v });
        break;
      case 'notify':
        this.tone({ freq: 880, dur: 0.12, vol: 0.08 * v });
        this.tone({ freq: 1320, dur: 0.16, vol: 0.06 * v, delay: 0.08 });
        break;
      case 'sleep':
        [523.25, 392, 329.63, 261.63].forEach((f, i) => this.tone({ freq: f, dur: 0.9, vol: 0.09 * v, attack: 0.1, delay: i * 0.25 }));
        break;
      case 'hurt':
        this.tone({ freq: 180, freqEnd: 70, dur: 0.2, vol: 0.3 * v });
        this.noise({ dur: 0.12, vol: 0.2 * v, freq: 500 });
        break;
      case 'moo': {
        // alçak, burundan gelen "möö": testere dişi + biçimlendirici süzgeç
        const t0 = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(118 * r, t0);
        osc.frequency.linearRampToValueAtTime(132 * r, t0 + 0.35);
        osc.frequency.linearRampToValueAtTime(96 * r, t0 + 1.2);
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(420, t0);
        f.frequency.linearRampToValueAtTime(900, t0 + 0.4);
        f.frequency.linearRampToValueAtTime(380, t0 + 1.2);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.16 * v, t0 + 0.15);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.3);
        osc.connect(f); f.connect(g); g.connect(this.sfx);
        osc.start(t0); osc.stop(t0 + 1.35);
        break;
      }
      case 'baa': {
        const t0 = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(330 * r, t0);
        osc.frequency.linearRampToValueAtTime(300 * r, t0 + 0.55);
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 17;
        const lg = this.ctx.createGain();
        lg.gain.value = 22;
        lfo.connect(lg); lg.connect(osc.frequency);
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 1.4;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.12 * v, t0 + 0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
        osc.connect(f); f.connect(g); g.connect(this.sfx);
        osc.start(t0); lfo.start(t0); osc.stop(t0 + 0.65); lfo.stop(t0 + 0.65);
        break;
      }
      case 'cluck':
        for (let i = 0; i < 3; i++) {
          this.tone({ type: 'square', freq: (720 + Math.random() * 120) * r, freqEnd: 420, dur: 0.07, vol: 0.05 * v, delay: i * 0.11 });
          this.noise({ dur: 0.05, vol: 0.06 * v, freq: 1800, q: 3, delay: i * 0.11 });
        }
        break;
      case 'hit':
        this.noise({ dur: 0.1, vol: 0.3 * v, type: 'lowpass', freq: 900 * r });
        this.tone({ freq: 140 * r, freqEnd: 70, dur: 0.12, vol: 0.25 * v });
        break;
      case 'butcher':
        for (let i = 0; i < 4; i++) this.noise({ dur: 0.08, vol: 0.14 * v, freq: 1300 * r, q: 2.2, delay: i * 0.3 });
        break;
      case 'crystal':
        [1567.98, 2093, 2637].forEach((fq, i) => this.tone({ type: 'triangle', freq: fq * r, dur: 0.6, vol: 0.06 * v, delay: i * 0.05 }));
        this.noise({ dur: 0.08, vol: 0.2 * v, type: 'highpass', freq: 3000 });
        break;
      case 'paddle':
        this.noise({ dur: 0.35, vol: 0.16 * v, type: 'lowpass', freq: 1600, freqEnd: 400 });
        this.noise({ dur: 0.2, vol: 0.08 * v, freq: 2200, q: 0.8, delay: 0.15 });
        break;
      case 'swim':
        this.noise({ dur: 0.28, vol: 0.15 * v, type: 'lowpass', freq: 2000 * r, freqEnd: 500 });
        break;
      case 'cave':
        this.noise({ dur: 1.4, vol: 0.18 * v, type: 'lowpass', freq: 500, freqEnd: 120, attack: 0.3 });
        this.tone({ freq: 55, freqEnd: 45, dur: 1.6, vol: 0.12 * v, attack: 0.3 });
        break;
      case 'hiss':
        this.noise({ dur: 0.45, vol: 0.18 * v, type: 'highpass', freq: 3200 * r, freqEnd: 2200, attack: 0.03 });
        this.noise({ dur: 0.08, vol: 0.12 * v, freq: 900, q: 2, delay: 0.38 });
        break;
      case 'laugh':
        for (let i = 0; i < 5; i++) this.tone({ type: 'sawtooth', freq: (520 + (i % 2) * 140) * r, freqEnd: 380, dur: 0.09, vol: 0.06 * v, delay: i * 0.12 });
        break;
      case 'growl':
        this.noise({ dur: 0.7, vol: 0.22 * v, type: 'lowpass', freq: 260 * r, freqEnd: 140, q: 4, attack: 0.08 });
        this.tone({ type: 'sawtooth', freq: 78 * r, freqEnd: 62, dur: 0.7, vol: 0.08 * v, attack: 0.08 });
        break;
      case 'chime':
        [1318.5, 1760, 2349.3].forEach((fq, i) => this.tone({ type: 'sine', freq: fq * r, dur: 0.8, vol: 0.045 * v, delay: i * 0.09 }));
        break;
      case 'blob':
        this.tone({ freq: 140 * r, freqEnd: 320, dur: 0.18, vol: 0.16 * v });
        this.noise({ dur: 0.25, vol: 0.12 * v, type: 'lowpass', freq: 600, freqEnd: 200 });
        break;
      case 'roar':
        this.noise({ dur: 1.6, vol: 0.4 * v, type: 'lowpass', freq: 420 * r, freqEnd: 120, q: 3, attack: 0.15 });
        this.tone({ type: 'sawtooth', freq: 70 * r, freqEnd: 42, dur: 1.6, vol: 0.16 * v, attack: 0.15 });
        this.tone({ type: 'square', freq: 110 * r, freqEnd: 60, dur: 1.2, vol: 0.05 * v, attack: 0.2, delay: 0.1 });
        break;
      case 'slam':
        this.noise({ dur: 0.7, vol: 0.5 * v, type: 'lowpass', freq: 380 * r, freqEnd: 60, attack: 0.005 });
        this.tone({ freq: 70 * r, freqEnd: 32, dur: 0.6, vol: 0.4 * v });
        break;
      case 'whoosh':
        this.noise({ dur: 0.5, vol: 0.18 * v, freq: 400 * r, freqEnd: 2200, q: 1.2, attack: 0.1 });
        break;
      case 'fire':
        this.noise({ dur: 0.6, vol: 0.25 * v, type: 'bandpass', freq: 900 * r, freqEnd: 300, q: 0.7, attack: 0.04 });
        this.noise({ dur: 0.3, vol: 0.12 * v, type: 'highpass', freq: 3000, delay: 0.05 });
        break;
      case 'freeze':
        [2637, 3136, 3951].forEach((fq, i) => this.tone({ type: 'triangle', freq: fq * r, dur: 0.35, vol: 0.05 * v, delay: i * 0.04 }));
        this.noise({ dur: 0.3, vol: 0.14 * v, type: 'highpass', freq: 4000 });
        break;
      case 'warning':
        this.tone({ type: 'triangle', freq: 440, freqEnd: 330, dur: 0.25, vol: 0.08 * v });
        break;
      case 'victory':
        [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone({ type: 'triangle', freq: f, dur: 0.7, vol: 0.12 * v, attack: 0.02, delay: i * 0.13 }));
        break;
      case 'howl': {
        const t0 = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, t0);
        osc.frequency.linearRampToValueAtTime(560, t0 + 0.7);
        osc.frequency.linearRampToValueAtTime(420, t0 + 2.2);
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 5;
        const lg = this.ctx.createGain();
        lg.gain.value = 9;
        lfo.connect(lg);
        lg.connect(osc.frequency);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.05 * v, t0 + 0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.4);
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        osc.connect(lp);
        lp.connect(g);
        g.connect(this.amb);
        osc.start(t0);
        lfo.start(t0);
        osc.stop(t0 + 2.5);
        lfo.stop(t0 + 2.5);
        break;
      }
      default:
        break;
    }
  }

  bird(volume) {
    const base = 2400 + Math.random() * 1400;
    const reps = 2 + Math.floor(Math.random() * 4);
    const pan = Math.random() * 1.6 - 0.8;
    for (let i = 0; i < reps; i++) {
      this.tone({ freq: base, freqEnd: base * (1.25 + Math.random() * 0.3), dur: 0.09, vol: 0.05 * volume, delay: i * 0.14, bus: this.amb, pan });
    }
  }

  playMusicPhrase(night) {
    const scale = night ? PENTA_NIGHT : PENTA_DAY;
    const notes = 4 + Math.floor(Math.random() * 4);
    let idx = Math.floor(Math.random() * scale.length);
    let t = 0;
    for (let i = 0; i < notes; i++) {
      idx = Math.max(0, Math.min(scale.length - 1, idx + Math.floor(Math.random() * 5) - 2));
      const f = scale[idx] * (night ? 0.5 : 1);
      this.tone({ type: 'triangle', freq: f, dur: 1.6, vol: 0.09, attack: 0.04, delay: t, bus: this.musicIn });
      this.tone({ freq: f * 2, dur: 1.0, vol: 0.02, attack: 0.04, delay: t, bus: this.musicIn });
      t += 0.45 + Math.random() * 0.5;
    }
  }

  /**
   * Ortam seslerini oyuncunun konumuna ve saate göre ayarlar.
   * ctx: { coast, forest, altitude, night, nearFire, cave, active }
   */
  update(dt, c) {
    if (!this.ready) return;
    this.time += dt;
    const t = this.ctx.currentTime;
    const day = 1 - c.night;
    const swell = 0.65 + 0.35 * Math.sin(this.time * 0.45) + 0.1 * Math.sin(this.time * 1.13);
    const open = 1 - (c.cave ?? 0); // mağarada dalga ve rüzgâr duyulmaz
    this.waves.gain.gain.setTargetAtTime((0.22 * c.coast * swell + 0.02) * open, t, 0.3);
    this.wind.gain.gain.setTargetAtTime((0.025 + 0.09 * c.altitude) * (0.7 + 0.3 * Math.sin(this.time * 0.23)) * open + (c.cave ?? 0) * 0.012, t, 0.5);
    this.cricketBus.gain.setTargetAtTime(0.022 * c.night * (0.4 + c.forest * 0.6), t, 0.8);

    if (c.night > 0.3 && this.time > this.nextCricket) {
      this.nextCricket = this.time + 0.7 + Math.random() * 0.9;
      const env = this.cricketEnv.gain;
      for (let k = 0; k < 3 + Math.floor(Math.random() * 2); k++) {
        const s = t + k * 0.065;
        env.setValueAtTime(0, s);
        env.linearRampToValueAtTime(1, s + 0.012);
        env.linearRampToValueAtTime(0, s + 0.045);
      }
    }

    if (day > 0.5 && !c.cave && this.time > this.nextBird) {
      this.nextBird = this.time + 2 + Math.random() * 6;
      const v = (0.3 + c.forest * 0.7) * day * (1 - c.altitude * 0.7);
      if (v > 0.1) this.bird(v);
    }

    // mağara: yankılı su damlaları ve derinden gelen uğultu
    if (c.cave > 0 && this.time > this.nextDrip) {
      this.nextDrip = this.time + 0.6 + Math.random() * 2.2;
      const f = 900 + Math.random() * 1400;
      const pan = Math.random() * 1.4 - 0.7;
      this.tone({ freq: f, freqEnd: f * 1.6, dur: 0.08, vol: 0.05, bus: this.amb, pan });
      this.tone({ freq: f * 0.98, freqEnd: f * 1.5, dur: 0.08, vol: 0.02, delay: 0.32, bus: this.amb, pan: -pan });
      if (Math.random() < 0.12) this.noise({ dur: 2.2, vol: 0.05, type: 'lowpass', freq: 160, attack: 0.6, bus: this.amb });
    }

    if (c.nearFire > 0 && this.time > this.nextCrackle) {
      this.nextCrackle = this.time + 0.08 + Math.random() * 0.35;
      this.noise({ dur: 0.03, vol: 0.12 * c.nearFire, type: 'highpass', freq: 2000 + Math.random() * 3000, bus: this.amb });
    }

    if (this.time > this.nextMusic) {
      this.nextMusic = this.time + 55 + Math.random() * 60;
      if (c.active) this.playMusicPhrase(c.night > 0.5);
    }
  }
}

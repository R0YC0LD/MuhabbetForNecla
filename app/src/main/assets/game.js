/* Muhabbet Kuşu: Sonsuz Gökyüzü
 * Dikey, sonsuz, yükseltmeli bir "shoot 'em up" oyunu.
 * Tüm grafikler ve sesler kod ile üretilir; dış dosya gerekmez.
 */
'use strict';
(function () {

  // =====================================================================
  //  Yardımcılar
  // =====================================================================
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const chance = (p) => Math.random() < p;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function fmt(n) {
    n = Math.floor(n);
    if (n < 10000) return String(n);
    if (n < 1e6) return (n / 1e3).toFixed(n < 1e5 ? 1 : 0).replace('.0', '') + 'K';
    if (n < 1e9) return (n / 1e6).toFixed(1).replace('.0', '') + 'M';
    return (n / 1e9).toFixed(1).replace('.0', '') + 'G';
  }

  function fmtTime(sec) {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return h + 's ' + m + 'dk';
    return m + ':' + String(s).padStart(2, '0');
  }

  // Diziden işaretli öğeleri yerinde temizle (yeni dizi oluşturmadan)
  function compact(arr, isDead) {
    let j = 0;
    for (let i = 0; i < arr.length; i++) {
      const o = arr[i];
      if (!isDead(o)) arr[j++] = o;
    }
    arr.length = j;
  }

  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgbStr = (c, a) => (a === undefined
    ? 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'
    : 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')');

  function todayStr(offsetDays) {
    const d = new Date();
    if (offsetDays) d.setDate(d.getDate() + offsetDays);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  // =====================================================================
  //  Kayıt sistemi
  // =====================================================================
  const SAVE_KEY = 'muhabbet_kusu_save_v1';
  const DEFAULT_SETTINGS = {
    sfx: 70, music: 40, vibrate: true,
    control: 'relative', sens: 1.3, offset: 70, liftPause: false,
    quality: 'high', shake: true, dmgNums: true, fps: false,
  };

  function defaultSave() {
    return {
      coins: 0,
      best: { wave: 0, score: 0 },
      stats: { kills: 0, runs: 0, bosses: 0, coins: 0, time: 0, maxLevel: 0, elites: 0 },
      meta: {},
      skins: ['green'],
      skin: 'green',
      settings: Object.assign({}, DEFAULT_SETTINGS),
      ach: {},
      daily: { last: '', streak: 0 },
      seenHint: false,
    };
  }

  let S = defaultSave();

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      const def = defaultSave();
      S = Object.assign(def, d);
      S.best = Object.assign(def.best, d.best || {});
      S.stats = Object.assign(defaultSave().stats, d.stats || {});
      S.settings = Object.assign(Object.assign({}, DEFAULT_SETTINGS), d.settings || {});
      S.daily = Object.assign({ last: '', streak: 0 }, d.daily || {});
      if (!Array.isArray(S.skins) || S.skins.indexOf('green') < 0) S.skins = ['green'].concat(S.skins || []);
    } catch (e) {
      S = defaultSave();
    }
  }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* depolama yoksa sessizce geç */ }
  }

  const metaLvl = (id) => S.meta[id] || 0;

  // =====================================================================
  //  Ses (WebAudio ile sentezlenir)
  // =====================================================================
  const Sound = {
    ctx: null, sfxBus: null, musicBus: null, noiseBuf: null,
    last: {}, mTimer: null, mNext: 0, mStep: 0, mode: 'normal',

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { return; }
      const c = this.ctx;
      this.sfxBus = c.createGain();
      this.sfxBus.connect(c.destination);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2200;
      lp.connect(c.destination);
      this.musicBus = c.createGain();
      this.musicBus.connect(lp);
      const len = c.sampleRate;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      this.startMusic();
    },

    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
    suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); },

    applyVolumes() {
      if (!this.ctx) return;
      this.sfxBus.gain.value = Math.pow(S.settings.sfx / 100, 1.5) * 0.6;
      this.musicBus.gain.value = Math.pow(S.settings.music / 100, 1.5) * 0.35;
    },

    throttle(name, ms) {
      const now = performance.now();
      if (this.last[name] && now - this.last[name] < ms) return false;
      this.last[name] = now;
      return true;
    },

    tone(freq, dur, type, vol, slideTo, delay, bus) {
      const c = this.ctx;
      const t = c.currentTime + (delay || 0);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(bus || this.sfxBus);
      o.start(t);
      o.stop(t + dur + 0.02);
    },

    noise(dur, vol, freq, delay, bus) {
      const c = this.ctx;
      const t = c.currentTime + (delay || 0);
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(freq || 2000, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(60, (freq || 2000) * 0.15), t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(bus || this.sfxBus);
      s.start(t, Math.random() * 0.5);
      s.stop(t + dur + 0.02);
    },

    play(name) {
      if (!this.ctx || this.ctx.state !== 'running' || S.settings.sfx <= 0) return;
      switch (name) {
        case 'shoot': if (this.throttle(name, 95)) this.tone(rand(760, 860), 0.05, 'square', 0.025, 480); break;
        case 'hit': if (this.throttle(name, 45)) this.tone(rand(250, 320), 0.05, 'triangle', 0.08, 160); break;
        case 'kill':
          if (!this.throttle(name, 40)) break;
          this.noise(0.18, 0.22, 1800);
          this.tone(rand(180, 240), 0.14, 'triangle', 0.12, 70);
          break;
        case 'xp': if (this.throttle(name, 35)) this.tone(rand(1100, 1500), 0.06, 'sine', 0.07, 1900); break;
        case 'coin':
          if (!this.throttle(name, 60)) break;
          this.tone(1050, 0.05, 'square', 0.04);
          this.tone(1580, 0.09, 'square', 0.04, null, 0.05);
          break;
        case 'levelup':
          [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.16, null, i * 0.07));
          break;
        case 'hurt':
          this.tone(320, 0.35, 'sawtooth', 0.18, 70);
          this.noise(0.25, 0.25, 900);
          break;
        case 'shield': this.tone(500, 0.25, 'sine', 0.2, 1300); break;
        case 'power':
          this.tone(600, 0.2, 'triangle', 0.15, 1400);
          this.tone(900, 0.2, 'triangle', 0.1, 1800, 0.08);
          break;
        case 'boss':
          this.tone(70, 1.4, 'sawtooth', 0.25, 45);
          this.noise(1.2, 0.2, 400);
          break;
        case 'bomb':
          this.noise(0.8, 0.5, 3000);
          this.tone(120, 0.6, 'sine', 0.35, 40);
          break;
        case 'buy':
          this.tone(660, 0.08, 'square', 0.06);
          this.tone(990, 0.14, 'square', 0.06, null, 0.07);
          break;
        case 'click': this.tone(820, 0.04, 'triangle', 0.1); break;
        case 'deny': this.tone(200, 0.15, 'square', 0.06, 150); break;
        case 'wave':
          this.tone(523, 0.14, 'triangle', 0.14);
          this.tone(784, 0.22, 'triangle', 0.14, null, 0.1);
          break;
        case 'ebullet': if (this.throttle(name, 120)) this.tone(420, 0.06, 'sine', 0.035, 300); break;
        case 'dash': this.tone(300, 0.25, 'sawtooth', 0.06, 900); break;
        case 'revive':
          [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, 'sine', 0.15, null, i * 0.08));
          break;
        case 'gameover':
          [523, 392, 330, 262].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.16, null, i * 0.18));
          break;
        case 'ach':
          [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.16, 'square', 0.05, null, i * 0.06));
          break;
      }
    },

    // ---- Basit, prosedürel arka plan müziği ----
    startMusic() {
      if (!this.ctx || this.mTimer) return;
      this.mNext = this.ctx.currentTime + 0.1;
      this.mTimer = setInterval(() => this.scheduleMusic(), 60);
    },

    setMode(mode) { this.mode = mode; },

    scheduleMusic() {
      const c = this.ctx;
      if (!c || c.state !== 'running' || S.settings.music <= 0) return;
      const boss = this.mode === 'boss';
      const spb = 60 / (boss ? 132 : 108) / 2; // sekizlik nota süresi
      if (this.mNext < c.currentTime) this.mNext = c.currentTime + 0.05;
      while (this.mNext < c.currentTime + 0.25) {
        this.musicStep(this.mStep, this.mNext - c.currentTime, boss);
        this.mNext += spb;
        this.mStep++;
      }
    },

    musicStep(step, delay, boss) {
      const prog = boss
        ? [[45, 0], [41, 1], [43, 1], [40, 1]]   // Am F G E
        : [[48, 1], [43, 1], [45, 0], [41, 1]];  // C G Am F
      const bar = Math.floor(step / 8) % 4;
      const s = step % 8;
      const root = prog[bar][0];
      const major = prog[bar][1];
      const chord = [0, major ? 4 : 3, 7];
      const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
      const bus = this.musicBus;
      if (s === 0 || s === 3 || s === 4 || s === 6) {
        this.tone(mf(root - 12), 0.28, 'triangle', 0.35, null, delay, bus);
      }
      const pattern = [0, 1, 2, 1, 0, 2, 1, 2];
      const note = root + 12 + chord[pattern[s]] + (s >= 4 && bar % 2 ? 12 : 0);
      this.tone(mf(note), 0.16, boss ? 'sawtooth' : 'square', 0.07, null, delay, bus);
      if (s % 2 === 1) this.noise(0.04, 0.05, 8000, delay, bus);
      if (boss && s % 4 === 0) this.noise(0.12, 0.18, 300, delay, bus);
    },
  };

  function vibrate(ms) {
    if (!S.settings.vibrate) return;
    try {
      if (window.AndroidBridge && window.AndroidBridge.vibrate) window.AndroidBridge.vibrate(ms);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) { /* yoksay */ }
  }

  // =====================================================================
  //  Tanımlar: kalıcı yükseltmeler, kartlar, düşmanlar, kostümler, başarımlar
  // =====================================================================
  const META = [
    { id: 'dmg', icon: '🌰', name: 'Keskin Gaga', max: 40, base: 40, growth: 1.22,
      desc: (l) => 'Hasar +' + (l * 8) + '%' },
    { id: 'rate', icon: '🪶', name: 'Hızlı Kanat', max: 25, base: 50, growth: 1.26,
      desc: (l) => 'Atış hızı +' + (l * 5) + '%' },
    { id: 'hp', icon: '❤️', name: 'Sağlam Yürek', max: 4, base: 150, growth: 2.4,
      desc: (l) => 'Başlangıç canı +' + l },
    { id: 'crit', icon: '🎯', name: 'Şahin Gözü', max: 15, base: 80, growth: 1.35,
      desc: (l) => 'Kritik şansı +' + (l * 2) + '%' },
    { id: 'magnet', icon: '🧲', name: 'Mıknatıs Tüy', max: 10, base: 30, growth: 1.35,
      desc: (l) => 'Toplama alanı +' + (l * 12) + '%' },
    { id: 'gold', icon: '🪙', name: 'Altın Gaga', max: 20, base: 60, growth: 1.3,
      desc: (l) => 'Altın kazancı +' + (l * 10) + '%' },
    { id: 'xp', icon: '📘', name: 'Bilgelik', max: 15, base: 60, growth: 1.32,
      desc: (l) => 'Tecrübe kazancı +' + (l * 6) + '%' },
    { id: 'shield', icon: '🛡️', name: 'Koruyucu Kalkan', max: 3, base: 300, growth: 2.6,
      desc: (l) => 'Oyuna ' + l + ' kalkanla başla' },
    { id: 'reroll', icon: '🎲', name: 'Şans Tüyü', max: 3, base: 200, growth: 2.2,
      desc: (l) => 'Her oyunda ' + l + ' kart yenileme hakkı' },
    { id: 'startLvl', icon: '🐣', name: 'Erken Kuş', max: 3, base: 400, growth: 2.5,
      desc: (l) => 'Oyuna ' + l + ' ekstra güçle başla' },
    { id: 'revive', icon: '🔥', name: 'Anka Tüyü', max: 1, base: 1500, growth: 1,
      desc: (l) => l ? 'Oyun başına 1 kez yeniden doğ' : 'Ölünce 1 kez yeniden doğ' },
  ];
  const metaCost = (m, l) => Math.round(m.base * Math.pow(m.growth, l));

  // Oyun içi seviye kartları
  const CARDS = [
    { id: 'dmg', icon: '💪', name: 'Güçlü Tohum', max: 10, r: 'common', desc: () => 'Hasar +20%' },
    { id: 'rate', icon: '⚡', name: 'Seri Atış', max: 8, r: 'common', desc: () => 'Atış hızı +13%' },
    { id: 'multi', icon: '🔱', name: 'Çoklu Atış', max: 4, r: 'rare', desc: () => '+1 tohum (ileriye)' },
    { id: 'side', icon: '↔️', name: 'Yan Atış', max: 2, r: 'rare', desc: (l) => l === 0 ? 'Çapraz iki tohum daha' : 'Daha geniş açıda iki tohum daha' },
    { id: 'pierce', icon: '📌', name: 'Delici Tohum', max: 3, r: 'rare', desc: () => 'Tohumlar +1 düşmanı deler' },
    { id: 'crit', icon: '🎯', name: 'Kritik Vuruş', max: 5, r: 'common', desc: () => 'Kritik şansı +8%' },
    { id: 'critdmg', icon: '💥', name: 'Ölümcül Kritik', max: 3, r: 'rare', desc: () => 'Kritik hasarı +50%', cond: () => (run.cards.crit || 0) > 0 || metaLvl('crit') >= 3 },
    { id: 'orbit', icon: '🌀', name: 'Dönen Tüyler', max: 4, r: 'epic', desc: () => 'Etrafında dönen +1 keskin tüy' },
    { id: 'homing', icon: '🧭', name: 'Güdümlü Tohum', max: 2, r: 'epic', desc: (l) => l === 0 ? 'Tohumlar düşmanlara yönelir' : 'Daha güçlü yönelme' },
    { id: 'boom', icon: '💣', name: 'Patlayan Tohum', max: 3, r: 'epic', desc: () => 'Ölen düşmanlar patlar, çevreye hasar verir' },
    { id: 'freeze', icon: '❄️', name: 'Buz Tohumu', max: 2, r: 'rare', desc: () => 'Vurulan düşmanlar yavaşlar' },
    { id: 'hp', icon: '❤️', name: 'Ekstra Can', max: 3, r: 'rare', desc: () => '+1 maksimum can (ve 1 can doldur)' },
    { id: 'regen', icon: '💚', name: 'Yenilenme', max: 3, r: 'rare', desc: (l) => 'Her ' + [40, 30, 20][l] + ' saniyede 1 can' },
    { id: 'shieldgen', icon: '🛡️', name: 'Enerji Kalkanı', max: 3, r: 'epic', desc: (l) => 'Her ' + [30, 22, 15][l] + ' sn kalkan dolar' },
    { id: 'vamp', icon: '🩸', name: 'Can Çalma', max: 3, r: 'rare', desc: (l) => 'Her ' + [60, 45, 30][l] + ' öldürmede 1 can (en fazla 10 sn\'de bir)' },
    { id: 'magnet', icon: '🧲', name: 'Mıknatıs', max: 3, r: 'common', desc: () => 'Toplama alanı +40%' },
    { id: 'luck', icon: '🍀', name: 'Altın Tüy', max: 3, r: 'common', desc: () => 'Altın kazancı +25%' },
  ];
  const CARD_MAP = {};
  CARDS.forEach((c) => { CARD_MAP[c.id] = c; });
  const FILLER_CARDS = [
    { id: '_heal', icon: '🩹', name: 'İlk Yardım', r: 'common', desc: () => '+1 can', filler: true },
    { id: '_gold', icon: '💰', name: 'Altın Kesesi', r: 'common', desc: () => '+' + (20 + run.wave * 5) + ' altın', filler: true },
    { id: '_shield', icon: '🔰', name: 'Anlık Kalkan', r: 'common', desc: () => '+1 kalkan (en fazla 2)', filler: true },
  ];
  const RARITY_W = { common: 10, rare: 6, epic: 3 };
  const RARITY_TAG = { rare: 'NADİR', epic: 'EFSANE' };

  const ETYPES = {
    blob:     { hp: 20,  spd: 62, r: 15, xp: 1, score: 10, color: '#8e6bf0' },
    zig:      { hp: 16,  spd: 72, r: 13, xp: 1, score: 12, color: '#22b8a8' },
    shooter:  { hp: 34,  spd: 55, r: 16, xp: 2, score: 20, color: '#f0545a' },
    dasher:   { hp: 28,  spd: 60, r: 14, xp: 2, score: 20, color: '#ff9f1c' },
    splitter: { hp: 46,  spd: 52, r: 19, xp: 2, score: 22, color: '#8cc63f' },
    mini:     { hp: 12,  spd: 95, r: 10, xp: 1, score: 6,  color: '#b5e06a' },
    tank:     { hp: 140, spd: 32, r: 27, xp: 5, score: 45, color: '#5c6b8a' },
    boss:     { hp: 550, spd: 60, r: 46, xp: 40, score: 600, color: '#3a2d6b' },
  };

  const SKINS = [
    { id: 'green', name: 'Yeşil Muhabbet', price: 0, body: '#5cc93b', belly: '#8fe06a', face: '#f5e04a', wing: '#3a8a2a', tail: '#2e5aa8', cheek: '#4a63d8' },
    { id: 'blue', name: 'Gökyüzü Mavisi', price: 400, body: '#4aa3df', belly: '#86c8f0', face: '#ffffff', wing: '#2c6ea3', tail: '#1d3f78', cheek: '#3a4fc0' },
    { id: 'yellow', name: 'Limon Lutino', price: 800, body: '#f7e34a', belly: '#fff28a', face: '#fffbe0', wing: '#e3c22a', tail: '#f0d840', cheek: '#e8e8f0' },
    { id: 'white', name: 'Kar Beyazı', price: 1200, body: '#f2f4f7', belly: '#ffffff', face: '#ffffff', wing: '#cfd6e0', tail: '#b9c3d1', cheek: '#c9d0ff' },
    { id: 'violet', name: 'Mor Menekşe', price: 2000, body: '#8e5bd6', belly: '#b48cf0', face: '#ffffff', wing: '#5b3a99', tail: '#3d2570', cheek: '#4a2fa0' },
    { id: 'pink', name: 'Pembe Düş', price: 3000, body: '#ff8fc0', belly: '#ffc0dc', face: '#fff0f6', wing: '#e0609a', tail: '#b8407a', cheek: '#ff4f8f' },
    { id: 'night', name: 'Gece Kuşu', price: 5000, body: '#2b2f45', belly: '#41476a', face: '#9aa6ff', wing: '#181a2a', tail: '#10121f', cheek: '#ff5fd2' },
    { id: 'rainbow', name: 'Gökkuşağı', price: 8000, rainbow: true, body: '#ff5555', belly: '#ffffff', face: '#ffffff', wing: '#aa3333', tail: '#5555ff', cheek: '#ffffff' },
    { id: 'gold', name: 'Altın Kanat', price: 0, req: 'wave30', reqText: 'Dalga 30\'a ulaş', body: '#ffc928', belly: '#ffe27a', face: '#fff3b0', wing: '#d99a00', tail: '#b37b00', cheek: '#ff8a00', shine: true },
  ];
  const SKIN_MAP = {};
  SKINS.forEach((s) => { SKIN_MAP[s.id] = s; });

  const ACHS = [
    { id: 'kills100', icon: '👊', name: 'İlk Kan', desc: 'Toplam 100 düşman yen', reward: 50, test: () => S.stats.kills >= 100 },
    { id: 'kills1k', icon: '⚔️', name: 'Avcı', desc: 'Toplam 1.000 düşman yen', reward: 200, test: () => S.stats.kills >= 1000 },
    { id: 'kills10k', icon: '🗡️', name: 'Gökyüzü Bekçisi', desc: 'Toplam 10.000 düşman yen', reward: 1500, test: () => S.stats.kills >= 10000 },
    { id: 'wave5', icon: '🌤️', name: 'Isınma Turu', desc: 'Dalga 5\'e ulaş', reward: 50, test: () => S.best.wave >= 5 },
    { id: 'wave10', icon: '⛅', name: 'Bulutların Üstü', desc: 'Dalga 10\'a ulaş', reward: 150, test: () => S.best.wave >= 10 },
    { id: 'wave20', icon: '🌙', name: 'Gece Uçuşu', desc: 'Dalga 20\'ye ulaş', reward: 500, test: () => S.best.wave >= 20 },
    { id: 'wave30', icon: '🌟', name: 'Yıldızlara Doğru', desc: 'Dalga 30\'a ulaş (Altın Kanat kostümü)', reward: 1500, test: () => S.best.wave >= 30 },
    { id: 'wave50', icon: '🚀', name: 'Sonsuzluk', desc: 'Dalga 50\'ye ulaş', reward: 5000, test: () => S.best.wave >= 50 },
    { id: 'boss1', icon: '👑', name: 'Kral Avcısı', desc: 'İlk boss\'u yen', reward: 100, test: () => S.stats.bosses >= 1 },
    { id: 'boss10', icon: '🏰', name: 'Fırtına Dindi', desc: 'Toplam 10 boss yen', reward: 600, test: () => S.stats.bosses >= 10 },
    { id: 'lvl15', icon: '📈', name: 'Hızlı Gelişim', desc: 'Bir oyunda seviye 15\'e ulaş', reward: 200, test: () => S.stats.maxLevel >= 15 },
    { id: 'lvl30', icon: '🧠', name: 'Usta Kuş', desc: 'Bir oyunda seviye 30\'a ulaş', reward: 800, test: () => S.stats.maxLevel >= 30 },
    { id: 'rich', icon: '💰', name: 'Hazine', desc: 'Toplam 5.000 altın kazan', reward: 300, test: () => S.stats.coins >= 5000 },
    { id: 'elite', icon: '✨', name: 'Elit Avcı', desc: 'Toplam 25 elit düşman yen', reward: 250, test: () => S.stats.elites >= 25 },
    { id: 'nohit', icon: '😇', name: 'Dokunulmaz', desc: 'Hiç hasar almadan Dalga 8\'e ulaş', reward: 400, test: () => run && run.wave >= 8 && !run.hitTaken },
    { id: 'collector', icon: '🎨', name: 'Koleksiyoncu', desc: '5 kostüme sahip ol', reward: 500, test: () => S.skins.length >= 5 },
  ];

  const DAILY = [50, 75, 100, 150, 200, 300, 500];

  // Arka plan renk paletleri (gündüz → gün batımı → gece → şafak)
  const PALETTES = [
    { top: '#3d8fe0', bot: '#a9dcff', stars: 0, cloud: 0.95 },
    { top: '#5b6fd8', bot: '#ffc28a', stars: 0.05, cloud: 0.85 },
    { top: '#2d2a6e', bot: '#d0658f', stars: 0.45, cloud: 0.55 },
    { top: '#0b1030', bot: '#26386e', stars: 1, cloud: 0.25 },
    { top: '#3f5fb8', bot: '#ffcfa0', stars: 0.15, cloud: 0.8 },
  ].map((p) => ({ top: hexToRgb(p.top), bot: hexToRgb(p.bot), stars: p.stars, cloud: p.cloud }));

  // =====================================================================
  //  Tuval ve ölçekleme (dünya genişliği 400 birim sabit)
  // =====================================================================
  const cv = $('game');
  const ctx = cv.getContext('2d', { alpha: false });
  const W = 400;
  let H = 700, scale = 1, cssW = 360, cssH = 640, dpr = 1;
  let safeBottomW = 0;

  function resize() {
    cssW = window.innerWidth || 360;
    cssH = window.innerHeight || 640;
    const q = S.settings.quality;
    const maxDpr = q === 'low' ? 1 : q === 'medium' ? 1.5 : 2.5;
    dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    scale = cv.width / W;
    H = cv.height / scale;
    initBackground();
    if (player) {
      player.x = clamp(player.x, 16, W - 16);
      player.y = clamp(player.y, H * 0.2, H - 30);
    }
  }

  window.setSafeInsets = function (top, bottom) {
    document.documentElement.style.setProperty('--safe-top', top + 'px');
    document.documentElement.style.setProperty('--safe-bottom', bottom + 'px');
    safeBottomW = bottom * (W / cssW);
  };

  // =====================================================================
  //  Arka plan (bulutlar, yıldızlar, gökyüzü geçişi)
  // =====================================================================
  let clouds = [], stars = [], cloudSprites = [];
  const bgCur = { top: PALETTES[0].top.slice(), bot: PALETTES[0].bot.slice(), stars: 0, cloud: 0.95 };
  let bgTarget = PALETTES[0];

  function makeCloudSprite(seed) {
    const c = document.createElement('canvas');
    c.width = 280; c.height = 120;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    const n = 5 + (seed % 3);
    for (let i = 0; i < n; i++) {
      const x = 75 + (i / (n - 1)) * 130 + Math.sin(seed * 7 + i) * 8;
      const r = 20 + Math.abs(Math.sin(seed * 3 + i * 1.7)) * 18;
      g.beginPath();
      g.arc(x, 78 - r * 0.35, r, 0, TAU);
      g.fill();
    }
    g.fillRect(60, 72, 160, 26);
    g.beginPath(); g.arc(60, 85, 13, 0, TAU); g.arc(220, 85, 13, 0, TAU); g.fill();
    return c;
  }

  function initBackground() {
    if (!cloudSprites.length) for (let i = 0; i < 4; i++) cloudSprites.push(makeCloudSprite(i + 1));
    clouds = [];
    const count = S.settings.quality === 'low' ? 5 : 9;
    for (let i = 0; i < count; i++) clouds.push(newCloud(rand(-60, H)));
    stars = [];
    for (let i = 0; i < 70; i++) stars.push({ x: rand(0, W), y: rand(0, H), r: rand(0.5, 1.8), p: rand(0, TAU) });
  }

  function newCloud(y) {
    const layer = Math.random() < 0.5 ? 0 : 1;
    return {
      x: rand(-80, W - 40), y: y, layer: layer,
      s: layer ? rand(0.7, 1.1) : rand(0.35, 0.6),
      spr: randi(0, cloudSprites.length - 1),
      a: layer ? 0.9 : 0.55,
    };
  }

  function updateBackground(dt, speedMul) {
    const k = 1 - Math.exp(-dt * 0.8);
    for (let i = 0; i < 3; i++) {
      bgCur.top[i] = lerp(bgCur.top[i], bgTarget.top[i], k);
      bgCur.bot[i] = lerp(bgCur.bot[i], bgTarget.bot[i], k);
    }
    bgCur.stars = lerp(bgCur.stars, bgTarget.stars, k);
    bgCur.cloud = lerp(bgCur.cloud, bgTarget.cloud, k);
    for (const c of clouds) {
      c.y += (c.layer ? 70 : 30) * speedMul * dt;
      if (c.y > H + 20) Object.assign(c, newCloud(-120));
    }
    for (const s of stars) {
      s.y += 8 * speedMul * dt;
      if (s.y > H) { s.y = 0; s.x = rand(0, W); }
    }
  }

  function drawBackground(t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgbStr(bgCur.top));
    g.addColorStop(1, rgbStr(bgCur.bot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (bgCur.stars > 0.02) {
      ctx.fillStyle = '#fff';
      for (const s of stars) {
        ctx.globalAlpha = bgCur.stars * (0.5 + 0.5 * Math.sin(t * 2 + s.p));
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
      ctx.globalAlpha = 1;
    }
    for (let layer = 0; layer < 2; layer++) {
      for (const c of clouds) {
        if (c.layer !== layer) continue;
        ctx.globalAlpha = c.a * bgCur.cloud;
        const spr = cloudSprites[c.spr];
        ctx.drawImage(spr, c.x, c.y, spr.width * c.s, spr.height * c.s);
      }
    }
    ctx.globalAlpha = 1;
  }

  // =====================================================================
  //  Çizim: kuş, düşmanlar
  // =====================================================================
  function skinColors(skin, t) {
    if (!skin.rainbow) return skin;
    const h = (t * 60) % 360;
    return {
      body: 'hsl(' + h + ',80%,58%)', belly: 'hsl(' + ((h + 40) % 360) + ',85%,75%)',
      face: '#ffffff', wing: 'hsl(' + ((h + 180) % 360) + ',70%,45%)',
      tail: 'hsl(' + ((h + 240) % 360) + ',70%,45%)', cheek: 'hsl(' + ((h + 120) % 360) + ',80%,55%)',
    };
  }

  function drawWing(g, col, flap, side) {
    g.save();
    g.scale(side, 1);
    g.translate(-8, -1);
    g.rotate(-0.25 - flap);
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(-12, 3, 15, 6.5, 0.25, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 1.2;
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      g.moveTo(-6 - i * 6, 0.5);
      g.arc(-9 - i * 6, 0.5, 3, 0, Math.PI);
    }
    g.stroke();
    g.restore();
  }

  // Kuşu yukarı bakar şekilde (x, y) merkezine çizer
  function drawBird(g, x, y, s, skin, t, flapSpeed) {
    const c = skinColors(skin, t);
    const flap = Math.sin(t * (flapSpeed || 14)) * 0.45;
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    // gölge parlaması
    if (skin.shine) {
      g.fillStyle = 'rgba(255,220,80,0.25)';
      g.beginPath(); g.arc(0, 2, 30 + Math.sin(t * 4) * 3, 0, TAU); g.fill();
    }
    // kuyruk
    g.fillStyle = c.tail;
    g.beginPath();
    g.moveTo(-5, 12); g.lineTo(-2, 32); g.lineTo(0, 28); g.lineTo(2, 32); g.lineTo(5, 12);
    g.closePath(); g.fill();
    // kanatlar
    drawWing(g, c.wing, flap, 1);
    drawWing(g, c.wing, flap, -1);
    // gövde
    g.fillStyle = c.body;
    g.beginPath(); g.ellipse(0, 4, 11, 15, 0, 0, TAU); g.fill();
    g.fillStyle = c.belly;
    g.beginPath(); g.ellipse(0, 8, 6.5, 9, 0, 0, TAU); g.fill();
    // kafa
    g.fillStyle = c.face;
    g.beginPath(); g.arc(0, -11, 10, 0, TAU); g.fill();
    // yanak benekleri
    g.fillStyle = c.cheek;
    g.beginPath(); g.arc(-6.5, -8, 1.8, 0, TAU); g.arc(6.5, -8, 1.8, 0, TAU); g.fill();
    // gözler
    g.fillStyle = '#111';
    g.beginPath(); g.arc(-4.6, -13, 2.3, 0, TAU); g.arc(4.6, -13, 2.3, 0, TAU); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(-4, -13.8, 0.8, 0, TAU); g.arc(5.2, -13.8, 0.8, 0, TAU); g.fill();
    // burun (cere) ve gaga
    g.fillStyle = '#6fa0ff';
    g.beginPath(); g.ellipse(0, -17.5, 2.6, 1.4, 0, 0, TAU); g.fill();
    g.fillStyle = '#f29a2e';
    g.beginPath(); g.moveTo(-2.6, -18.5); g.lineTo(2.6, -18.5); g.lineTo(0, -23.5); g.closePath(); g.fill();
    g.restore();
  }

  function drawEnemy(e, t) {
    const T = ETYPES[e.type];
    const r = e.r;
    ctx.save();
    ctx.translate(e.x, e.y);

    if (e.elite) {
      ctx.fillStyle = 'rgba(255,215,60,0.28)';
      ctx.beginPath(); ctx.arc(0, 0, r + 7 + Math.sin(t * 6) * 2, 0, TAU); ctx.fill();
    }
    if (e.type === 'boss') {
      ctx.fillStyle = 'rgba(160,80,255,0.18)';
      ctx.beginPath(); ctx.arc(0, 0, r + 14 + Math.sin(t * 3) * 4, 0, TAU); ctx.fill();
    }
    if (e.type === 'dasher' && e.state === 1) {
      // hücum uyarısı: hedef çizgisi
      ctx.strokeStyle = 'rgba(255,80,40,' + (0.3 + 0.3 * Math.sin(t * 30)) + ')';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 8]);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(e.dx * 600, e.dy * 600); ctx.stroke();
      ctx.setLineDash([]);
    }

    const col = T.color;
    // gövde detayları
    if (e.type === 'zig') {
      const f = Math.sin(t * 20 + e.id) * 0.5;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.ellipse(-r, -2, r * 0.75, r * 0.35, -0.4 + f, 0, TAU);
      ctx.ellipse(r, -2, r * 0.75, r * 0.35, 0.4 - f, 0, TAU);
      ctx.fill();
    }
    if (e.type === 'dasher') {
      ctx.fillStyle = '#d97800';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + t * 2;
        ctx.moveTo(Math.cos(a) * (r + 7), Math.sin(a) * (r + 7));
        ctx.lineTo(Math.cos(a + 0.3) * r * 0.8, Math.sin(a + 0.3) * r * 0.8);
        ctx.lineTo(Math.cos(a - 0.3) * r * 0.8, Math.sin(a - 0.3) * r * 0.8);
      }
      ctx.fill();
    }
    if (e.type === 'shooter') {
      const a = Math.atan2(player.y - e.y, player.x - e.x);
      ctx.save();
      ctx.rotate(a);
      ctx.fillStyle = '#7a1f25';
      ctx.fillRect(r * 0.4, -4.5, r * 0.9, 9);
      ctx.restore();
    }

    ctx.fillStyle = col;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    if (e.type === 'tank') {
      roundRect(ctx, -r, -r * 0.9, r * 2, r * 1.8, r * 0.45);
    } else {
      const wob = e.type === 'blob' || e.type === 'splitter' || e.type === 'mini' ? Math.sin(t * 8 + e.id) * 1.5 : 0;
      ctx.ellipse(0, 0, r + wob, r - wob, 0, 0, TAU);
    }
    ctx.fill();
    ctx.stroke();

    // parlaklık
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.45, r * 0.35, r * 0.22, -0.5, 0, TAU); ctx.fill();

    if (e.type === 'tank') {
      ctx.fillStyle = '#3e4a63';
      ctx.fillRect(-r, -r * 0.15, r * 2, r * 0.3);
      ctx.fillStyle = '#c9d2e3';
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(i * r * 0.6, 0, 2.5, 0, TAU); ctx.fill(); }
    }
    if (e.type === 'splitter') {
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
    }

    // gözler (oyuncuya bakar)
    const ex = clamp((player.x - e.x) / 200, -1, 1);
    const ey = clamp((player.y - e.y) / 200, -1, 1);
    const eyeR = Math.max(3, r * 0.28);
    const eyeY = e.type === 'tank' ? -r * 0.45 : -r * 0.15;
    const eyeX = r * 0.38;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-eyeX, eyeY, eyeR, 0, TAU); ctx.arc(eyeX, eyeY, eyeR, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a1030';
    const pr = eyeR * 0.55;
    ctx.beginPath();
    ctx.arc(-eyeX + ex * eyeR * 0.4, eyeY + ey * eyeR * 0.4, pr, 0, TAU);
    ctx.arc(eyeX + ex * eyeR * 0.4, eyeY + ey * eyeR * 0.4, pr, 0, TAU);
    ctx.fill();
    // kızgın kaşlar
    ctx.strokeStyle = '#1a1030';
    ctx.lineWidth = Math.max(1.5, r * 0.1);
    ctx.beginPath();
    ctx.moveTo(-eyeX - eyeR, eyeY - eyeR * 1.2); ctx.lineTo(-eyeX + eyeR * 0.6, eyeY - eyeR * 0.6);
    ctx.moveTo(eyeX + eyeR, eyeY - eyeR * 1.2); ctx.lineTo(eyeX - eyeR * 0.6, eyeY - eyeR * 0.6);
    ctx.stroke();

    if (e.type === 'boss') {
      // taç
      ctx.fillStyle = '#ffcf33';
      ctx.strokeStyle = '#b8860b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, -r * 0.75);
      ctx.lineTo(-r * 0.65, -r * 1.25);
      ctx.lineTo(-r * 0.3, -r * 0.95);
      ctx.lineTo(0, -r * 1.35);
      ctx.lineTo(r * 0.3, -r * 0.95);
      ctx.lineTo(r * 0.65, -r * 1.25);
      ctx.lineTo(r * 0.6, -r * 0.75);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // ağız
      ctx.fillStyle = '#1a1030';
      ctx.beginPath(); ctx.ellipse(0, r * 0.4, r * 0.35, r * 0.15 + Math.abs(Math.sin(t * 3)) * r * 0.1, 0, 0, TAU); ctx.fill();
    }

    if (e.slow > 0) {
      ctx.fillStyle = 'rgba(150,220,255,0.4)';
      ctx.beginPath(); ctx.arc(0, 0, r + 2, 0, TAU); ctx.fill();
    }
    if (e.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath(); ctx.arc(0, 0, r + 1, 0, TAU); ctx.fill();
    }
    if (e.elite) {
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, r + 3, 0, TAU); ctx.stroke();
    }
    // küçük can çubuğu (hasar almış güçlü düşmanlar)
    if (e.type !== 'boss' && e.hp < e.maxHp && (e.elite || e.type === 'tank')) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(-r, r + 6, r * 2, 4);
      ctx.fillStyle = '#ff5a5f';
      ctx.fillRect(-r, r + 6, r * 2 * Math.max(0, e.hp / e.maxHp), 4);
    }
    ctx.restore();
  }

  function roundRect(g, x, y, w, h, r) {
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // =====================================================================
  //  Oyun durumu
  // =====================================================================
  let state = 'menu'; // menu | play | levelup | paused | over
  let run = null;
  let player = null;
  const P = {}; // hesaplanmış oyuncu istatistikleri
  let enemies = [], bullets = [], ebullets = [], pickups = [], particles = [];
  let gameTime = 0, menuTime = 0;
  let shakeT = 0, shakeMag = 0;
  let nextId = 1;
  let flashT = 0;

  function hpScale(w) {
    // erken oyunda yumuşak, geç oyunda üstel büyüme: oyun sonsuz ama her zaman zorlaşır
    return (1 + 0.16 * (w - 1) + 0.012 * (w - 1) * (w - 1)) * Math.pow(1.035, Math.max(0, w - 20));
  }
  function spdScale(w) { return Math.min(1.55, 1 + 0.018 * (w - 1)); }
  function xpNeed(l) { return Math.round(6 * Math.pow(l, 1.32) + 4); }

  function recalc() {
    const c = run.cards;
    P.dmg = 10 * (1 + 0.08 * metaLvl('dmg')) * Math.pow(1.2, c.dmg || 0);
    P.rate = 3.5 * (1 + 0.05 * metaLvl('rate')) * Math.pow(1.13, c.rate || 0);
    P.multi = 1 + (c.multi || 0);
    P.side = c.side || 0;
    P.pierce = c.pierce || 0;
    P.crit = Math.min(0.85, 0.05 + 0.02 * metaLvl('crit') + 0.08 * (c.crit || 0));
    P.critMul = 2 + 0.5 * (c.critdmg || 0);
    P.orbit = c.orbit || 0;
    P.homing = c.homing || 0;
    P.boom = c.boom || 0;
    P.freeze = c.freeze || 0;
    P.magnet = 75 * (1 + 0.12 * metaLvl('magnet')) * (1 + 0.4 * (c.magnet || 0));
    P.goldMul = (1 + 0.1 * metaLvl('gold')) * (1 + 0.25 * (c.luck || 0));
    P.xpMul = 1 + 0.06 * metaLvl('xp');
    P.regen = c.regen ? [0, 40, 30, 20][c.regen] : 0;
    P.shieldGen = c.shieldgen ? [0, 30, 22, 15][c.shieldgen] : 0;
    P.vamp = c.vamp ? [0, 60, 45, 30][c.vamp] : 0;
    P.maxHp = 4 + metaLvl('hp') + (c.hp || 0);
    P.bulletSpeed = 640;
  }

  function newRun() {
    run = {
      wave: 0, waveT: 0, waveDur: 20, phase: 'spawn', restT: 0, spawnT: 0,
      bossWave: false, bossSpawned: false, boss: null, minionT: 0,
      score: 0, kills: 0, coins: 0, level: 1, xp: 0, time: 0,
      cards: {}, rerolls: metaLvl('reroll'), revived: false,
      pendingLevels: metaLvl('startLvl'), frenzy: 0, magnetT: 0,
      regenT: 0, shieldT: 0, hitTaken: false, orbitA: 0, hurtBy: {}, vampN: 0, vampCd: 0, powerCd: 0,
    };
    recalc();
    player = {
      x: W / 2, y: H * 0.78, r: 8,
      hp: P.maxHp, shield: metaLvl('shield'),
      inv: 0, fireT: 0, tx: W / 2, ty: H * 0.78,
    };
    enemies = []; bullets = []; ebullets = []; pickups = []; particles = [];
    gameTime = 0;
    nextWave();
  }

  function nextWave() {
    run.wave++;
    run.waveT = 0;
    run.phase = 'spawn';
    run.restT = 0;
    run.spawnT = 0.6;
    run.bossWave = run.wave % 5 === 0;
    run.bossSpawned = false;
    run.minionT = 3;
    run.waveDur = 16 + Math.min(12, run.wave * 0.5);
    bgTarget = PALETTES[Math.floor((run.wave - 1) / 3) % PALETTES.length];
    if (run.bossWave) {
      banner('BOSS DALGASI', 'Dalga ' + run.wave);
      Sound.setMode('boss');
    } else {
      banner('Dalga ' + run.wave, run.wave === 1 ? 'Uçuş başlıyor!' : '');
      Sound.setMode('normal');
    }
    if (run.wave > 1) Sound.play('wave');
    if (run.wave > S.best.wave) S.best.wave = run.wave;
    checkAchievements();
  }

  // ---------- Düşman oluşturma ----------
  function spawnEnemy(type, x, y, extra) {
    const T = ETYPES[type];
    const w = run.wave;
    const e = {
      id: nextId++, type: type, x: x, y: y,
      r: T.r, hp: T.hp * hpScale(w), spd: T.spd * spdScale(w),
      xp: T.xp, score: T.score, t: 0, state: 0, fireT: rand(1, 2.2),
      flash: 0, slow: 0, orbCd: 0, elite: false, dead: false,
      baseX: x, amp: rand(30, 70), freq: rand(1.5, 3), vx: 0,
      stopY: rand(0.12, 0.38) * H, dx: 0, dy: 1,
    };
    if (type !== 'boss' && type !== 'mini' && w >= 8 && chance(Math.min(0.12, 0.02 + w * 0.0025))) {
      e.elite = true;
      e.hp *= 3.5;
      e.r *= 1.25;
      e.xp *= 4;
      e.score *= 4;
    }
    if (extra) Object.assign(e, extra);
    e.maxHp = e.hp;
    enemies.push(e);
    return e;
  }

  function randomType() {
    const w = run.wave;
    const table = [
      ['blob', 10],
      ['zig', w >= 2 ? 7 : 0],
      ['shooter', w >= 3 ? 4 + Math.min(4, w * 0.15) : 0],
      ['dasher', w >= 5 ? 3.5 : 0],
      ['splitter', w >= 6 ? 4 : 0],
      ['tank', w >= 7 ? 2.5 + Math.min(3, w * 0.08) : 0],
    ];
    let total = 0;
    for (const t of table) total += t[1];
    let r = Math.random() * total;
    for (const t of table) { r -= t[1]; if (r <= 0) return t[0]; }
    return 'blob';
  }

  function spawnTick() {
    if (enemies.length > 70) return;
    const w = run.wave;
    if (w >= 3 && chance(0.12)) {
      // dizilim
      const type = chance(0.5) ? 'zig' : 'blob';
      const n = randi(4, 6);
      const gap = (W - 60) / (n - 1);
      for (let i = 0; i < n; i++) {
        spawnEnemy(type, 30 + i * gap, -20 - (type === 'zig' ? 0 : Math.abs(i - (n - 1) / 2) * 18),
          type === 'zig' ? { amp: 25, freq: 2.2 } : null);
      }
      return;
    }
    const count = w >= 15 && chance(0.35) ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const type = randomType();
      const r = ETYPES[type].r;
      spawnEnemy(type, rand(r + 12, W - r - 12), -r - 10 - i * 40);
    }
  }

  function spawnBoss() {
    const tier = run.wave / 5;
    const names = ['Fırtına Kralı', 'Kara Bulut', 'Şimşek Lordu', 'Gölge Kartal', 'Kasırga Ruhu', 'Gece Canavarı'];
    const b = spawnEnemy('boss', W / 2, -60, {
      hp: ETYPES.boss.hp * hpScale(run.wave) * (1 + 0.12 * (tier - 1)),
      stopY: H * 0.17, attackT: 2, pattern: 0, spiralT: 0, spiralA: 0, tier: tier,
    });
    b.maxHp = b.hp;
    run.boss = b;
    run.bossSpawned = true;
    $('bossname').textContent = names[(tier - 1) % names.length] + (tier > names.length ? ' ' + toRoman(Math.ceil(tier / names.length)) : '');
    Sound.play('boss');
    vibrate(200);
    shake(8, 0.6);
  }

  function toRoman(n) {
    return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || String(n);
  }

  function enemyShoot(x, y, angle, speed, r, color) {
    ebullets.push({ x: x, y: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: r || 5, color: color || 0 });
  }

  function ebSpeed() { return 135 + Math.min(95, run.wave * 2.2); }

  // ---------- Düşman davranışları ----------
  function updateEnemy(e, dt) {
    if (e.slow > 0) { e.slow -= dt; dt *= 1 - 0.25 * P.freeze; }
    e.t += dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.orbCd > 0) e.orbCd -= dt;

    switch (e.type) {
      case 'blob':
      case 'mini':
        e.y += e.spd * dt;
        e.x += e.vx * dt + Math.sin(e.t * 2 + e.id) * 12 * dt;
        e.vx *= 0.98;
        break;
      case 'splitter':
        e.y += e.spd * dt;
        e.x += Math.sin(e.t * 1.5 + e.id) * 15 * dt;
        break;
      case 'zig':
        e.y += e.spd * dt;
        e.x = e.baseX + Math.sin(e.t * e.freq) * e.amp;
        break;
      case 'tank':
        e.y += e.spd * dt;
        if (run.wave >= 10 && e.y > 0) {
          e.fireT -= dt;
          if (e.fireT <= 0) {
            e.fireT = 3.2;
            for (let i = -1; i <= 1; i++) enemyShoot(e.x, e.y + e.r, Math.PI / 2 + i * 0.3, ebSpeed() * 0.8, 6, 1);
            Sound.play('ebullet');
          }
        }
        break;
      case 'shooter':
        if (e.state === 0) {
          e.y += e.spd * 1.6 * dt;
          if (e.y >= e.stopY) e.state = 1;
        } else if (e.state === 1) {
          e.x += Math.sin(e.t * 1.2 + e.id) * 25 * dt;
          e.fireT -= dt;
          if (e.fireT <= 0) {
            e.fireT = Math.max(1.4, 2.8 - run.wave * 0.035);
            const a = Math.atan2(player.y - e.y, player.x - e.x);
            if (run.wave >= 12) {
              for (let i = -1; i <= 1; i++) enemyShoot(e.x, e.y, a + i * 0.22, ebSpeed());
            } else {
              enemyShoot(e.x, e.y, a, ebSpeed());
            }
            Sound.play('ebullet');
          }
          if (e.t > 9) e.state = 2;
        } else {
          e.y += e.spd * 1.4 * dt;
        }
        break;
      case 'dasher':
        if (e.state === 0) {
          e.y += e.spd * 1.5 * dt;
          if (e.y >= e.stopY) { e.state = 1; e.t2 = 1.1; }
        }
        if (e.state === 1) {
          e.t2 -= dt;
          const a = Math.atan2(player.y - e.y, player.x - e.x);
          e.dx = Math.cos(a); e.dy = Math.sin(a);
          if (e.t2 <= 0) { e.state = 2; Sound.play('dash'); }
        } else if (e.state === 2) {
          const sp = 300 * spdScale(run.wave);
          e.x += e.dx * sp * dt;
          e.y += e.dy * sp * dt;
        }
        break;
      case 'boss':
        updateBoss(e, dt);
        break;
    }

    if (e.y > H + 60 || e.y < -200 || e.x < -100 || e.x > W + 100) {
      e.dead = true;
      e.escaped = true;
    }
  }

  function updateBoss(b, dt) {
    if (b.y < b.stopY) {
      b.y += 50 * dt;
      return;
    }
    b.x = W / 2 + Math.sin(b.t * 0.6) * (W / 2 - b.r - 16);
    const tier = b.tier;
    const enraged = b.hp < b.maxHp * 0.4;
    if (b.spiralT > 0) {
      b.spiralT -= dt;
      b.spiralFire = (b.spiralFire || 0) - dt;
      if (b.spiralFire <= 0) {
        b.spiralFire = enraged ? 0.08 : tier <= 1 ? 0.13 : 0.1;
        const arms = tier >= 3 ? 3 : 2;
        for (let k = 0; k < arms; k++) enemyShoot(b.x, b.y, b.spiralA + k * TAU / arms, ebSpeed() * 0.85, 6, 2);
        b.spiralA += 0.32;
      }
      return;
    }
    b.attackT -= dt * (enraged ? 1.35 : 1);
    if (b.attackT > 0) return;
    b.attackT = Math.max(1.2, 2.9 - tier * 0.15);
    const p = b.pattern++ % 4;
    const sp = ebSpeed();
    if (p === 0) {
      const n = Math.min(11, 4 + tier);
      const a = Math.atan2(player.y - b.y, player.x - b.x);
      for (let i = 0; i < n; i++) enemyShoot(b.x, b.y, a + (i - (n - 1) / 2) * 0.16, sp, 6, 2);
    } else if (p === 1) {
      const n = Math.min(28, 10 + tier * 2);
      const off = Math.random() * TAU;
      for (let i = 0; i < n; i++) enemyShoot(b.x, b.y, off + (i / n) * TAU, sp * 0.75, 6, 2);
    } else if (p === 2) {
      b.spiralT = 1.6;
      b.spiralA = Math.random() * TAU;
    } else {
      const n = Math.min(5, 2 + Math.floor(tier / 2));
      for (let i = 0; i < n; i++) spawnEnemy(chance(0.5) ? 'blob' : 'zig', b.x + rand(-40, 40), b.y + 20);
    }
    Sound.play('ebullet');
  }

  // ---------- Oyuncu atışı ----------
  function fire() {
    const rate = P.rate * (run.frenzy > 0 ? 2 : 1);
    player.fireT = 1 / rate;
    const n = P.multi;
    const sp = P.bulletSpeed;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2);
      addBullet(player.x + off * 7, player.y - 20, -Math.PI / 2 + off * 0.045, sp);
    }
    if (P.side >= 1) {
      addBullet(player.x - 8, player.y - 10, -Math.PI / 2 - 0.32, sp);
      addBullet(player.x + 8, player.y - 10, -Math.PI / 2 + 0.32, sp);
    }
    if (P.side >= 2) {
      addBullet(player.x - 10, player.y - 6, -Math.PI / 2 - 0.62, sp);
      addBullet(player.x + 10, player.y - 6, -Math.PI / 2 + 0.62, sp);
    }
    Sound.play('shoot');
  }

  function addBullet(x, y, a, sp) {
    bullets.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, pierce: P.pierce, hits: null, target: null, rt: 0, dead: false });
  }

  // ---------- Hasar ve ölüm ----------
  function rollDamage(base) {
    const crit = Math.random() < P.crit;
    return { d: crit ? base * P.critMul : base, crit: crit };
  }

  function damageEnemy(e, dmg, crit, noBoom) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 0.07;
    if (P.freeze) e.slow = 1.5;
    if (S.settings.dmgNums) addText(e.x + rand(-6, 6), e.y - e.r * 0.5, fmt(dmg), crit ? '#ffd23f' : '#fff', crit ? 17 : 12);
    if (e.hp <= 0) killEnemy(e, noBoom);
    else Sound.play('hit');
  }

  function killEnemy(e, noBoom) {
    e.dead = true;
    const w = run.wave;
    run.kills++;
    S.stats.kills++;
    if (e.elite) S.stats.elites++;
    run.score += Math.round(e.score * (1 + w * 0.1));
    burst(e.x, e.y, ETYPES[e.type].color, e.type === 'boss' ? 40 : e.elite ? 22 : 12, e.r);
    Sound.play('kill');

    // tecrübe kristali
    const xpVal = e.xp * (1 + 0.08 * (w - 1)) * P.xpMul;
    if (e.type === 'boss') {
      for (let i = 0; i < 12; i++) dropPickup(e.x + rand(-40, 40), e.y + rand(-30, 30), 'xp', xpVal / 12);
    } else {
      dropPickup(e.x, e.y, 'xp', xpVal);
    }
    // altın
    const coinVal = 1 + Math.floor(w / 4);
    if (e.type === 'boss') {
      const total = 25 + w * 3;
      const n = 10;
      for (let i = 0; i < n; i++) dropPickup(e.x + rand(-50, 50), e.y + rand(-30, 30), 'coin', total / n);
      dropPickup(e.x - 20, e.y, 'power', 0, pick(['heart', 'shield', 'frenzy']));
      dropPickup(e.x + 20, e.y, 'power', 0, pick(['bomb', 'magnet', 'heart']));
      run.boss = null;
      S.stats.bosses++;
      run.score += 500 * (w / 5);
      banner('BOSS YENİLDİ!', '+' + fmt(500 * (w / 5)) + ' puan');
      shake(10, 0.8);
      vibrate(250);
      flashT = 0.4;
      // kalan mermileri temizle
      for (const b of ebullets) burst(b.x, b.y, '#ff6b9a', 2, 3);
      ebullets.length = 0;
      checkAchievements();
    } else if (e.elite) {
      for (let i = 0; i < 4; i++) dropPickup(e.x + rand(-15, 15), e.y + rand(-15, 15), 'coin', coinVal);
      if (run.powerCd <= 0 && chance(0.3)) { run.powerCd = 8; dropPickup(e.x, e.y, 'power', 0, randomPower()); }
    } else {
      if (chance(0.35)) dropPickup(e.x, e.y, 'coin', coinVal);
      if (run.powerCd <= 0 && chance(0.03)) { run.powerCd = 8; dropPickup(e.x, e.y, 'power', 0, randomPower()); }
    }
    // bölünen
    if (e.type === 'splitter') {
      spawnEnemy('mini', e.x - 8, e.y, { vx: -70 });
      spawnEnemy('mini', e.x + 8, e.y, { vx: 70 });
    }
    // can çalma
    run.vampN++;
    if (P.vamp > 0 && run.vampN >= P.vamp && run.vampCd <= 0 && player.hp < P.maxHp) {
      run.vampN = 0;
      run.vampCd = 10;
      player.hp++;
      addText(player.x, player.y - 30, '+1 ❤', '#ff6b8a', 15);
    }
    // patlayan tohum
    if (P.boom && !noBoom && e.type !== 'boss') {
      const rad = 30 + P.boom * 12;
      const dmg = P.dmg * (0.5 + 0.3 * P.boom);
      ring(e.x, e.y, rad, '#ffb347');
      for (const o of enemies) {
        if (o.dead || o === e) continue;
        const dx = o.x - e.x, dy = o.y - e.y;
        if (dx * dx + dy * dy < (rad + o.r) * (rad + o.r)) damageEnemy(o, dmg, false, true);
      }
    }
  }

  function randomPower() {
    const list = ['shield', 'frenzy', 'bomb', 'magnet'];
    if (player.hp < P.maxHp) list.push('heart', 'heart');
    return pick(list);
  }

  function hurtPlayer(src) {
    if (player.inv > 0) return;
    run.hurtBy[src] = (run.hurtBy[src] || 0) + 1;
    if (player.shield > 0) {
      player.shield--;
      player.inv = 1;
      ring(player.x, player.y, 40, '#7fd8ff');
      Sound.play('shield');
      vibrate(40);
      return;
    }
    player.hp--;
    player.inv = 1.5;
    run.hitTaken = true;
    shake(9, 0.35);
    flashT = 0.25;
    Sound.play('hurt');
    vibrate(150);
    burst(player.x, player.y, '#ff6b8a', 14, 10);
    if (player.hp <= 0) {
      if (metaLvl('revive') && !run.revived) {
        run.revived = true;
        player.hp = Math.max(1, Math.ceil(P.maxHp / 2));
        player.inv = 3;
        bomb(true);
        banner('ANKA TÜYÜ!', 'Yeniden doğdun');
        Sound.play('revive');
      } else {
        gameOver();
      }
    }
  }

  function bomb(silent) {
    for (const b of ebullets) burst(b.x, b.y, '#ff6b9a', 2, 3);
    ebullets.length = 0;
    const dmg = P.dmg * 15;
    for (const e of enemies) {
      if (e.dead) continue;
      if (e.type === 'boss') damageEnemy(e, Math.min(dmg, e.maxHp * 0.08), false, true);
      else damageEnemy(e, dmg, false, true);
    }
    ring(player.x, player.y, 500, '#ffffff');
    flashT = 0.35;
    shake(12, 0.5);
    if (!silent) { Sound.play('bomb'); vibrate(200); }
  }

  // ---------- Toplanabilirler ----------
  function dropPickup(x, y, kind, val, power) {
    pickups.push({ x: x, y: y, vx: rand(-40, 40), vy: rand(-90, -30), kind: kind, val: val, power: power, t: 0, dead: false, pull: false });
  }

  const POWER_ICON = { heart: '❤', shield: '🛡', frenzy: '⚡', bomb: '💣', magnet: '🧲' };
  const POWER_COLOR = { heart: '#ff4d6d', shield: '#4fc3ff', frenzy: '#ffd23f', bomb: '#ff7a3c', magnet: '#c77dff' };

  function collect(p) {
    p.dead = true;
    if (p.kind === 'xp') {
      run.xp += p.val;
      Sound.play('xp');
      while (run.xp >= xpNeed(run.level)) {
        run.xp -= xpNeed(run.level);
        run.level++;
        run.pendingLevels++;
        if (run.level > S.stats.maxLevel) S.stats.maxLevel = run.level;
      }
    } else if (p.kind === 'coin') {
      const v = p.val * P.goldMul;
      run.coins += v;
      Sound.play('coin');
    } else if (p.kind === 'power') {
      Sound.play('power');
      vibrate(30);
      switch (p.power) {
        case 'heart':
          if (player.hp < P.maxHp) { player.hp++; addText(player.x, player.y - 30, '+1 ❤', '#ff6b8a', 16); }
          else { run.coins += 10 * P.goldMul; addText(player.x, player.y - 30, '+10 altın', '#ffd23f', 15); }
          break;
        case 'shield':
          player.shield = Math.min(player.shield + 1, 5);
          addText(player.x, player.y - 30, 'KALKAN', '#7fd8ff', 16);
          break;
        case 'frenzy':
          run.frenzy = 10;
          addText(player.x, player.y - 30, 'ÇILGIN ATIŞ!', '#ffd23f', 16);
          break;
        case 'bomb':
          bomb();
          break;
        case 'magnet':
          run.magnetT = 8;
          addText(player.x, player.y - 30, 'SÜPER MIKNATIS', '#c77dff', 16);
          break;
      }
    }
  }

  // ---------- Parçacıklar ----------
  function maxParticles() { return S.settings.quality === 'low' ? 120 : S.settings.quality === 'medium' ? 260 : 450; }

  function burst(x, y, color, n, r) {
    if (S.settings.quality === 'low') n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      if (particles.length >= maxParticles()) return;
      const a = Math.random() * TAU;
      const sp = rand(40, 180);
      particles.push({ kind: 0, x: x + Math.cos(a) * r * 0.5, y: y + Math.sin(a) * r * 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.3, 0.6), max: 0.6, size: rand(2, 4.5), color: color });
    }
  }

  function ring(x, y, rad, color) {
    particles.push({ kind: 1, x: x, y: y, life: 0.35, max: 0.35, size: rad, color: color });
  }

  function addText(x, y, text, color, size) {
    let texts = 0;
    for (const p of particles) if (p.kind === 2) texts++;
    if (texts > 40) return;
    particles.push({ kind: 2, x: x, y: y, vx: 0, vy: -50, life: 0.7, max: 0.7, size: size || 12, color: color, text: text });
  }

  function shake(mag, dur) {
    if (!S.settings.shake) return;
    shakeMag = Math.max(shakeMag, mag);
    shakeT = Math.max(shakeT, dur);
  }

  // =====================================================================
  //  Güncelleme döngüsü
  // =====================================================================
  function update(dt) {
    gameTime += dt;
    run.time += dt;
    const pl = player;

    // ---- dalga akışı ----
    if (run.phase === 'spawn') {
      run.waveT += dt;
      if (!run.bossWave) {
        run.spawnT -= dt;
        if (run.spawnT <= 0) {
          run.spawnT = Math.max(0.18, 1.0 * Math.pow(0.93, run.wave - 1)) * rand(0.75, 1.25);
          spawnTick();
        }
        if (run.waveT >= run.waveDur) { run.phase = 'rest'; run.restT = 0; }
      } else {
        if (!run.bossSpawned && run.waveT > 2) spawnBoss();
        if (run.bossSpawned) {
          run.minionT -= dt;
          if (run.minionT <= 0 && enemies.length < 25) {
            run.minionT = Math.max(1.4, 3.2 - run.wave * 0.04);
            spawnTick();
          }
          if (!run.boss) { run.phase = 'rest'; run.restT = 0; }
        }
      }
    } else {
      run.restT += dt;
      if (run.restT > 2.5 && (enemies.length === 0 || run.restT > 6)) {
        const bonus = run.wave * 50;
        run.score += bonus;
        save();
        nextWave();
      }
    }

    // ---- oyuncu ----
    if (S.settings.control === 'direct' && touching) {
      const k = 1 - Math.exp(-dt * 22);
      pl.x += (pl.tx - pl.x) * k;
      pl.y += (pl.ty - pl.y) * k;
    }
    pl.x = clamp(pl.x, 14, W - 14);
    pl.y = clamp(pl.y, H * 0.18, H - 34 - safeBottomW);
    if (pl.inv > 0) pl.inv -= dt;
    pl.fireT -= dt;
    if (pl.fireT <= 0) fire();
    if (run.frenzy > 0) run.frenzy -= dt;
    if (run.vampCd > 0) run.vampCd -= dt;
    if (run.powerCd > 0) run.powerCd -= dt;
    if (run.magnetT > 0) run.magnetT -= dt;

    if (P.regen && pl.hp < P.maxHp) {
      run.regenT += dt;
      if (run.regenT >= P.regen * (1 + run.wave / 30)) { run.regenT = 0; pl.hp++; addText(pl.x, pl.y - 30, '+1 ❤', '#5ee38a', 15); }
    } else run.regenT = 0;
    if (P.shieldGen && pl.shield < 1) {
      run.shieldT += dt;
      if (run.shieldT >= P.shieldGen * (1 + run.wave / 30)) { run.shieldT = 0; pl.shield = 1; Sound.play('shield'); }
    } else run.shieldT = 0;

    // ---- tohumlar ----
    for (const b of bullets) {
      if (P.homing) {
        b.rt -= dt;
        if (b.rt <= 0 || !b.target || b.target.dead) {
          b.rt = 0.15;
          b.target = nearestEnemy(b.x, b.y, 260);
        }
        if (b.target) {
          const want = Math.atan2(b.target.y - b.y, b.target.x - b.x);
          let cur = Math.atan2(b.vy, b.vx);
          let diff = want - cur;
          while (diff > Math.PI) diff -= TAU;
          while (diff < -Math.PI) diff += TAU;
          const maxTurn = (P.homing === 1 ? 4 : 8) * dt;
          cur += clamp(diff, -maxTurn, maxTurn);
          const sp = P.bulletSpeed;
          b.vx = Math.cos(cur) * sp;
          b.vy = Math.sin(cur) * sp;
        }
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y < -20 || b.y > H + 20 || b.x < -20 || b.x > W + 20) { b.dead = true; continue; }
      for (const e of enemies) {
        if (e.dead) continue;
        const dx = e.x - b.x, dy = e.y - b.y;
        const rr = e.r + 4;
        if (dx * dx + dy * dy < rr * rr) {
          if (b.hits && b.hits.indexOf(e.id) >= 0) continue;
          const r = rollDamage(P.dmg);
          damageEnemy(e, r.d, r.crit);
          if (b.pierce > 0) {
            b.pierce--;
            if (!b.hits) b.hits = [];
            b.hits.push(e.id);
          } else {
            b.dead = true;
            break;
          }
        }
      }
    }

    // ---- dönen tüyler ----
    if (P.orbit) {
      run.orbitA += dt * 3.2;
      const rad = 46;
      for (let i = 0; i < P.orbit; i++) {
        const a = run.orbitA + (i / P.orbit) * TAU;
        const ox = pl.x + Math.cos(a) * rad, oy = pl.y + Math.sin(a) * rad;
        for (const e of enemies) {
          if (e.dead || e.orbCd > 0) continue;
          const dx = e.x - ox, dy = e.y - oy;
          if (dx * dx + dy * dy < (e.r + 9) * (e.r + 9)) {
            e.orbCd = 0.3;
            const r = rollDamage(P.dmg * 0.9);
            damageEnemy(e, r.d, r.crit);
          }
        }
      }
    }

    // ---- düşmanlar ----
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      updateEnemy(e, dt);
      if (e.dead) continue;
      const dx = e.x - pl.x, dy = e.y - pl.y;
      const rr = e.r * 0.85 + pl.r;
      if (dx * dx + dy * dy < rr * rr && pl.inv <= 0) {
        hurtPlayer(e.type);
        if (state !== 'play') return;
        if (e.type !== 'boss') damageEnemy(e, P.dmg * 6, false);
      }
    }

    // ---- düşman mermileri ----
    for (const b of ebullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y > H + 20 || b.y < -40 || b.x < -20 || b.x > W + 20) { b.dead = true; continue; }
      const dx = b.x - pl.x, dy = b.y - pl.y;
      const rr = b.r + pl.r - 2;
      if (dx * dx + dy * dy < rr * rr && pl.inv <= 0) {
        b.dead = true;
        hurtPlayer('bullet');
        if (state !== 'play') return;
      }
    }

    // ---- toplanabilirler ----
    const magR = run.magnetT > 0 ? 2000 : P.magnet;
    for (const p of pickups) {
      p.t += dt;
      const dx = pl.x - p.x, dy = pl.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (p.pull || (p.t > 0.25 && d2 < magR * magR)) {
        p.pull = true;
        const d = Math.sqrt(d2) || 1;
        const sp = 260 + p.t * 120;
        p.vx = lerp(p.vx, (dx / d) * sp, 0.2);
        p.vy = lerp(p.vy, (dy / d) * sp, 0.2);
      } else {
        p.vx *= 0.96;
        p.vy = Math.min(p.vy + 140 * dt, 70);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (d2 < 22 * 22) collect(p);
      else if (p.y > H + 30) p.dead = true;
    }

    // ---- parçacıklar ----
    for (const p of particles) {
      p.life -= dt;
      if (p.kind === 0) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.92; p.vy *= 0.92;
      } else if (p.kind === 2) {
        p.y += p.vy * dt;
      }
    }

    compact(bullets, (b) => b.dead);
    compact(enemies, (e) => e.dead);
    compact(ebullets, (b) => b.dead);
    compact(pickups, (p) => p.dead);
    compact(particles, (p) => p.life <= 0);

    if (shakeT > 0) { shakeT -= dt; if (shakeT <= 0) shakeMag = 0; }
    if (flashT > 0) flashT -= dt;

    if (run.pendingLevels > 0 && state === 'play') openLevelUp();
  }

  function nearestEnemy(x, y, maxD) {
    let best = null, bd = maxD * maxD;
    for (const e of enemies) {
      if (e.dead || e.y < -10) continue;
      const dx = e.x - x, dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // =====================================================================
  //  Çizim döngüsü
  // =====================================================================
  function render(t) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (shakeT > 0 && shakeMag > 0) {
      ctx.translate(rand(-shakeMag, shakeMag) * shakeT, rand(-shakeMag, shakeMag) * shakeT);
    }
    drawBackground(t);

    if (state === 'menu' || !run) {
      const skin = SKIN_MAP[S.skin] || SKINS[0];
      const by = H * 0.47 + Math.sin(menuTime * 2) * 10;
      drawBird(ctx, W / 2, by, 2.6, skin, menuTime, 10);
      return;
    }

    const pl = player;

    // toplanabilirler
    for (const p of pickups) {
      if (p.kind === 'xp') {
        const s = p.val > 20 ? 7 : p.val > 6 ? 5.5 : 4;
        ctx.fillStyle = p.val > 20 ? '#ff7bf0' : p.val > 6 ? '#5ee7ff' : '#7fb8ff';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - s * 1.3); ctx.lineTo(p.x + s, p.y); ctx.lineTo(p.x, p.y + s * 1.3); ctx.lineTo(p.x - s, p.y);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(p.x - 1, p.y - s * 0.7, 2, 2);
      } else if (p.kind === 'coin') {
        const sx = Math.abs(Math.cos(p.t * 5)) * 6 + 1;
        ctx.fillStyle = '#e0a100';
        ctx.beginPath(); ctx.ellipse(p.x, p.y, sx + 1, 7, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath(); ctx.ellipse(p.x, p.y, sx, 6, 0, 0, TAU); ctx.fill();
      } else {
        const bob = Math.sin(p.t * 5) * 2;
        ctx.fillStyle = POWER_COLOR[p.power];
        ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.arc(p.x, p.y + bob, 17 + Math.sin(p.t * 8) * 2, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(p.x, p.y + bob, 13, 0, TAU); ctx.fill();
        ctx.strokeStyle = POWER_COLOR[p.power]; ctx.lineWidth = 3; ctx.stroke();
        ctx.font = '15px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(POWER_ICON[p.power], p.x, p.y + bob + 1);
      }
    }

    // düşmanlar
    for (const e of enemies) drawEnemy(e, gameTime);

    // oyuncu tohumları
    ctx.fillStyle = run.frenzy > 0 ? '#ffe066' : '#f4c96b';
    ctx.strokeStyle = '#8a5a1c';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const b of bullets) {
      const a = Math.atan2(b.vy, b.vx) + Math.PI / 2;
      ctx.moveTo(b.x + 3.2, b.y);
      ctx.ellipse(b.x, b.y, 3.2, 5.5, a, 0, TAU);
    }
    ctx.fill();
    ctx.stroke();

    // dönen tüyler
    if (P.orbit) {
      const skin = skinColors(SKIN_MAP[S.skin] || SKINS[0], gameTime);
      for (let i = 0; i < P.orbit; i++) {
        const a = run.orbitA + (i / P.orbit) * TAU;
        const ox = pl.x + Math.cos(a) * 46, oy = pl.y + Math.sin(a) * 46;
        ctx.save();
        ctx.translate(ox, oy);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillStyle = skin.wing;
        ctx.beginPath(); ctx.ellipse(0, 0, 4, 10, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 10); ctx.stroke();
        ctx.restore();
      }
    }

    // oyuncu
    const blink = pl.inv > 0 && Math.floor(pl.inv * 12) % 2 === 0;
    if (!blink) drawBird(ctx, pl.x, pl.y, 1.12, SKIN_MAP[S.skin] || SKINS[0], gameTime, run.frenzy > 0 ? 26 : 16);
    if (pl.shield > 0) {
      ctx.strokeStyle = 'rgba(127,216,255,' + (0.6 + Math.sin(gameTime * 6) * 0.25) + ')';
      ctx.fillStyle = 'rgba(127,216,255,0.12)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(pl.x, pl.y + 2, 30, 0, TAU); ctx.fill(); ctx.stroke();
    }
    if (run.frenzy > 0) {
      ctx.strokeStyle = 'rgba(255,210,63,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pl.x, pl.y, 26 + Math.sin(gameTime * 20) * 2, 0, TAU); ctx.stroke();
    }

    // düşman mermileri
    const ebCols = [['rgba(255,70,110,0.35)', '#ff4d6d'], ['rgba(255,150,40,0.35)', '#ff8c1a'], ['rgba(190,90,255,0.35)', '#c56bff']];
    for (let c = 0; c < 3; c++) {
      ctx.fillStyle = ebCols[c][0];
      ctx.beginPath();
      for (const b of ebullets) if (b.color === c) { ctx.moveTo(b.x + b.r + 3, b.y); ctx.arc(b.x, b.y, b.r + 3, 0, TAU); }
      ctx.fill();
      ctx.fillStyle = ebCols[c][1];
      ctx.beginPath();
      for (const b of ebullets) if (b.color === c) { ctx.moveTo(b.x + b.r, b.y); ctx.arc(b.x, b.y, b.r, 0, TAU); }
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    for (const b of ebullets) { ctx.moveTo(b.x + b.r * 0.4, b.y); ctx.arc(b.x, b.y, b.r * 0.4, 0, TAU); }
    ctx.fill();

    // parçacıklar
    for (const p of particles) {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.kind === 0) {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else if (p.kind === 1) {
        ctx.globalAlpha = a;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - a * 0.7), 0, TAU); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of particles) {
      if (p.kind !== 2) continue;
      ctx.globalAlpha = clamp(p.life / p.max * 1.6, 0, 1);
      ctx.font = '900 ' + p.size + 'px system-ui, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;

    if (flashT > 0) {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.fillStyle = 'rgba(255,255,255,' + clamp(flashT, 0, 0.4) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  // =====================================================================
  //  HUD
  // =====================================================================
  const hudCache = {};
  function setText(id, v) {
    if (hudCache[id] === v) return;
    hudCache[id] = v;
    $(id).textContent = v;
  }

  function updateHud() {
    if (!run) return;
    const heartsKey = player.hp + '/' + P.maxHp + '/' + player.shield;
    if (hudCache.hearts !== heartsKey) {
      hudCache.hearts = heartsKey;
      let h = '';
      if (P.maxHp <= 6) {
        for (let i = 0; i < P.maxHp; i++) h += i < player.hp ? '<span>❤️</span>' : '<span class="h-empty">❤️</span>';
      } else {
        h += '<span>❤️</span><span class="h-num">' + player.hp + '/' + P.maxHp + '</span>';
      }
      if (player.shield > 2) h += '<span>🛡️</span><span class="h-num">×' + player.shield + '</span>';
      else for (let i = 0; i < player.shield; i++) h += '<span>🛡️</span>';
      $('hearts').innerHTML = h;
    }
    setText('hud-wave', 'Dalga ' + run.wave);
    setText('hud-score', fmt(run.score));
    setText('hud-coin-val', fmt(run.coins));
    setText('hud-level', 'Sv ' + run.level);
    const xpPct = Math.floor((run.xp / xpNeed(run.level)) * 100);
    if (hudCache.xp !== xpPct) { hudCache.xp = xpPct; $('xpfill').style.width = xpPct + '%'; }
    const bossOn = !!(run.boss && !run.boss.dead && run.boss.y > -40);
    if (hudCache.bossOn !== bossOn) { hudCache.bossOn = bossOn; $('bossbar').classList.toggle('hidden', !bossOn); }
    if (bossOn) {
      const bp = Math.max(0, Math.floor((run.boss.hp / run.boss.maxHp) * 100));
      if (hudCache.bp !== bp) { hudCache.bp = bp; $('bossfill').style.width = bp + '%'; }
    }
  }

  function banner(title, sub) {
    const b = $('banner');
    b.classList.add('hidden');
    void b.offsetWidth;
    b.innerHTML = title + (sub ? '<small>' + sub + '</small>' : '');
    b.classList.remove('hidden');
    clearTimeout(banner._t);
    banner._t = setTimeout(() => b.classList.add('hidden'), 2000);
  }

  // Bildirimler sırayla, en fazla ikisi aynı anda gösterilir
  const toastQueue = [];
  let toastsVisible = 0;
  function toast(html) {
    toastQueue.push(html);
    pumpToasts();
  }
  function pumpToasts() {
    while (toastsVisible < 2 && toastQueue.length) {
      const el = document.createElement('div');
      el.className = 'toast';
      el.innerHTML = toastQueue.shift();
      $('toasts').appendChild(el);
      toastsVisible++;
      setTimeout(() => {
        el.remove();
        toastsVisible--;
        pumpToasts();
      }, 2900);
    }
  }

  // =====================================================================
  //  Seviye atlama kartları
  // =====================================================================
  let currentChoices = [];

  function rollChoices() {
    const pool = CARDS.filter((c) => (run.cards[c.id] || 0) < c.max && (!c.cond || c.cond()));
    const out = [];
    const used = {};
    while (out.length < 3 && pool.length) {
      let total = 0;
      for (const c of pool) total += RARITY_W[c.r];
      let r = Math.random() * total;
      let idx = 0;
      for (; idx < pool.length; idx++) { r -= RARITY_W[pool[idx].r]; if (r <= 0) break; }
      idx = Math.min(idx, pool.length - 1);
      out.push(pool[idx]);
      used[pool[idx].id] = true;
      pool.splice(idx, 1);
    }
    // canı azsa ilk yardım seçeneği bazen sunulur
    if (player.hp < P.maxHp && out.length === 3 && chance(0.3)) out[2] = FILLER_CARDS[0];
    const fillers = FILLER_CARDS.filter((f) => (f.id !== '_heal' || player.hp < P.maxHp) && (f.id !== '_shield' || player.shield < 2));
    let fi = 0;
    while (out.length < 3) out.push(fillers[fi++ % fillers.length]);
    return out;
  }

  function openLevelUp() {
    state = 'levelup';
    touching = false;
    pointerId = null;
    Sound.play('levelup');
    vibrate(40);
    currentChoices = rollChoices();
    renderCards();
    show('levelup');
  }

  function renderCards() {
    const box = $('cards');
    box.innerHTML = '';
    currentChoices.forEach((c) => {
      const lvl = run.cards[c.id] || 0;
      const el = document.createElement('button');
      el.className = 'card ' + c.r + (lvl === 0 && !c.filler ? ' new' : '');
      const lvText = c.filler ? '' : (lvl === 0 ? 'YENİ!' : 'Seviye ' + lvl + ' → ' + (lvl + 1) + ' / ' + c.max);
      el.innerHTML = '<div class="ico">' + c.icon + '</div><div><div class="name">' + c.name +
        (RARITY_TAG[c.r] ? '<span class="tag">' + RARITY_TAG[c.r] + '</span>' : '') +
        '</div><div class="desc">' + c.desc(lvl) + '</div>' + (lvText ? '<div class="lv">' + lvText + '</div>' : '') + '</div>';
      el.addEventListener('click', () => chooseCard(c));
      box.appendChild(el);
    });
    $('reroll-n').textContent = run.rerolls;
    $('btn-reroll').classList.toggle('hidden', run.rerolls <= 0);
  }

  function chooseCard(c) {
    if (state !== 'levelup') return;
    Sound.play('click');
    if (c.id === '_heal') player.hp = Math.min(P.maxHp, player.hp + 1);
    else if (c.id === '_gold') run.coins += 20 + run.wave * 5;
    else if (c.id === '_shield') player.shield = Math.max(player.shield, Math.min(2, player.shield + 1));
    else {
      run.cards[c.id] = (run.cards[c.id] || 0) + 1;
      const oldMax = P.maxHp;
      recalc();
      if (c.id === 'hp') player.hp = Math.min(P.maxHp, player.hp + (P.maxHp - oldMax));
    }
    run.pendingLevels--;
    hide('levelup');
    if (run.pendingLevels > 0) {
      openLevelUp();
    } else {
      state = 'play';
      player.inv = Math.max(player.inv, 0.6); // seçimden sonra kısa koruma
    }
  }

  // =====================================================================
  //  Oyun akışı: başlat / duraklat / bitir
  // =====================================================================
  const IN_APP = !!window.AndroidBridge;

  // Tarayıcıda oynarken (APK dışında) tam ekrana geç ve dikey ekrana kilitle
  function goFullscreen() {
    if (IN_APP) return;
    const d = document.documentElement;
    const isStandalone = window.matchMedia && window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
    if (isStandalone || document.fullscreenElement || !d.requestFullscreen) return;
    try {
      const p = d.requestFullscreen({ navigationUI: 'hide' });
      if (p && p.then) {
        p.then(() => {
          if (screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(() => {});
        }).catch(() => {});
      }
    } catch (e) { /* desteklenmiyor */ }
  }

  function startGame() {
    goFullscreen();
    hideAllScreens();
    newRun();
    state = 'play';
    $('hud').classList.remove('hidden');
    for (const k in hudCache) delete hudCache[k];
    $('drag-hint').classList.toggle('hidden', S.seenHint);
    S.stats.runs++;
    save();
    Sound.init();
    Sound.resume();
  }

  function pauseGame() {
    if (state !== 'play') return;
    state = 'paused';
    touching = false;
    pointerId = null;
    const box = $('pause-build');
    box.innerHTML = '';
    const ids = Object.keys(run.cards);
    if (!ids.length) box.innerHTML = '<span>Henüz güç yok</span>';
    ids.forEach((id) => {
      const c = CARD_MAP[id];
      const s = document.createElement('span');
      s.textContent = c.icon + ' ' + c.name + ' ' + run.cards[id];
      box.appendChild(s);
    });
    show('pause');
  }

  function resumeGame() {
    if (state !== 'paused') return;
    hide('pause');
    state = 'play';
    player.inv = Math.max(player.inv, 0.5);
  }

  function gameOver() {
    state = 'over';
    touching = false;
    pointerId = null;
    Sound.play('gameover');
    Sound.setMode('normal');
    vibrate(300);
    const earned = Math.floor(run.coins) + run.wave * 5;
    S.coins += earned;
    S.stats.coins += earned;
    S.stats.time += run.time;
    let newBest = false;
    if (run.score > S.best.score) { S.best.score = run.score; newBest = true; }
    if (run.wave > S.best.wave) S.best.wave = run.wave;
    checkAchievements();
    save();
    setTimeout(() => {
      $('over-wave').textContent = run.wave;
      $('over-score').textContent = fmt(run.score);
      $('over-kills').textContent = fmt(run.kills);
      $('over-level').textContent = run.level;
      $('over-time').textContent = fmtTime(run.time);
      $('over-best').textContent = S.best.wave;
      $('over-coins').textContent = '+' + fmt(earned);
      $('over-new').classList.toggle('hidden', !newBest);
      $('hud').classList.add('hidden');
      show('over');
    }, 900);
  }

  function toMenu() {
    hideAllScreens();
    $('hud').classList.add('hidden');
    state = 'menu';
    run = null;
    enemies = []; bullets = []; ebullets = []; pickups = []; particles = [];
    bgTarget = PALETTES[0];
    Sound.setMode('normal');
    refreshMenu();
    show('menu');
  }

  function refreshMenu() {
    $('menu-coins').textContent = fmt(S.coins);
    $('menu-best').textContent = 'Dalga ' + S.best.wave;
  }

  // =====================================================================
  //  Başarımlar ve günlük ödül
  // =====================================================================
  function checkAchievements() {
    let changed = false;
    for (const a of ACHS) {
      if (S.ach[a.id]) continue;
      let ok = false;
      try { ok = a.test(); } catch (e) { ok = false; }
      if (ok) {
        S.ach[a.id] = true;
        S.coins += a.reward;
        changed = true;
        toast(a.icon + ' <b>' + a.name + '</b> &nbsp;+' + a.reward + ' <span class="coin-ico"></span>');
        Sound.play('ach');
        if (a.id === 'wave30' && S.skins.indexOf('gold') < 0) {
          S.skins.push('gold');
          toast('🎨 Yeni kostüm: <b>Altın Kanat</b>');
        }
      }
    }
    if (changed) save();
  }

  function checkDaily() {
    const today = todayStr();
    if (S.daily.last === today) return;
    const yesterday = todayStr(-1);
    S.daily.streak = S.daily.last === yesterday ? S.daily.streak + 1 : 1;
    S.daily.last = today;
    const day = ((S.daily.streak - 1) % 7);
    const reward = DAILY[day];
    S.coins += reward;
    save();
    refreshMenu();
    modal('🎁 Günlük Ödül', 'Gün ' + (day + 1) + ' / 7<br><br><b style="font-size:22px">+' + reward + ' altın</b><br><br><small>Her gün gir, ödül büyüsün!</small>',
      [{ text: 'Harika!', cls: 'primary' }]);
  }

  // =====================================================================
  //  Ekran yönetimi
  // =====================================================================
  const PANELS = ['shop', 'skins', 'ach', 'settings', 'howto'];
  let panelOpen = null;

  function show(id) { $('scr-' + id).classList.remove('hidden'); }
  function hide(id) { $('scr-' + id).classList.add('hidden'); }
  function hideAllScreens() {
    ['menu', 'levelup', 'pause', 'over', 'modal'].concat(PANELS).forEach(hide);
    panelOpen = null;
  }

  function openPanel(id) {
    Sound.play('click');
    panelOpen = id;
    if (id === 'shop') renderShop();
    if (id === 'skins') renderSkins();
    if (id === 'ach') renderAch();
    if (id === 'settings') renderSettings();
    show(id);
  }

  function closePanel() {
    if (!panelOpen) return;
    hide(panelOpen);
    panelOpen = null;
    Sound.play('click');
    if (state === 'menu') refreshMenu();
  }

  let modalCb = null;
  function modal(title, html, buttons) {
    $('modal-title').textContent = title;
    $('modal-text').innerHTML = html;
    const box = $('modal-btns');
    box.innerHTML = '';
    modalCb = null;
    buttons.forEach((b) => {
      const el = document.createElement('button');
      el.className = 'btn ' + (b.cls || '');
      el.textContent = b.text;
      el.addEventListener('click', () => {
        hide('modal');
        Sound.play('click');
        if (b.fn) b.fn();
      });
      box.appendChild(el);
      if (b.cancel) modalCb = b.fn || null;
    });
    show('modal');
  }

  function setCoinsLabels() {
    document.querySelectorAll('.coins-val').forEach((el) => { el.textContent = fmt(S.coins); });
  }

  // ---------- Mağaza ----------
  function renderShop() {
    setCoinsLabels();
    const box = $('shop-list');
    const scroll = box.scrollTop;
    box.innerHTML = '';
    META.forEach((m) => {
      const l = metaLvl(m.id);
      const maxed = l >= m.max;
      const cost = metaCost(m, l);
      const el = document.createElement('div');
      el.className = 'item';
      let pips = '';
      if (m.max <= 25) {
        pips = '<div class="pips">';
        for (let i = 0; i < m.max; i++) pips += '<i class="' + (i < l ? 'on' : '') + '"></i>';
        pips += '</div>';
      }
      const next = maxed ? '' : ' → <b>' + m.desc(l + 1) + '</b>';
      el.innerHTML = '<div class="ico">' + m.icon + '</div><div class="info"><div class="name">' + m.name +
        '</div><div class="desc">' + (l ? m.desc(l) : 'Henüz yok') + next + '</div>' +
        '<div class="lv">Seviye ' + l + ' / ' + m.max + '</div>' + pips + '</div>';
      const btn = document.createElement('button');
      if (maxed) {
        btn.className = 'buy max';
        btn.textContent = 'MAKS';
      } else {
        btn.className = 'buy' + (S.coins >= cost ? '' : ' cant');
        btn.innerHTML = '<span class="coin-ico"></span>' + fmt(cost);
        btn.addEventListener('click', () => {
          if (S.coins < cost) { Sound.play('deny'); toast('Yeterli altın yok'); return; }
          S.coins -= cost;
          S.meta[m.id] = l + 1;
          save();
          Sound.play('buy');
          vibrate(20);
          renderShop();
        });
      }
      el.appendChild(btn);
      box.appendChild(el);
    });
    box.scrollTop = scroll;
  }

  // ---------- Kostümler ----------
  function renderSkins() {
    setCoinsLabels();
    const box = $('skin-list');
    box.innerHTML = '';
    SKINS.forEach((s) => {
      const owned = S.skins.indexOf(s.id) >= 0;
      const el = document.createElement('div');
      el.className = 'skin' + (S.skin === s.id ? ' active' : '');
      const c = document.createElement('canvas');
      c.width = 180; c.height = 180;
      const g = c.getContext('2d');
      drawBird(g, 90, 84, 3, s, 0.3, 0);
      el.appendChild(c);
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = s.name;
      el.appendChild(name);
      const btn = document.createElement('button');
      if (owned) {
        btn.className = 'buy' + (S.skin === s.id ? ' sel' : '');
        btn.textContent = S.skin === s.id ? 'Seçili' : 'Seç';
        btn.addEventListener('click', () => {
          S.skin = s.id; save(); Sound.play('click'); renderSkins();
        });
      } else if (s.req) {
        btn.className = 'buy cant';
        btn.textContent = '🔒 ' + s.reqText;
        btn.style.fontSize = '11px';
      } else {
        btn.className = 'buy' + (S.coins >= s.price ? '' : ' cant');
        btn.innerHTML = '<span class="coin-ico"></span>' + fmt(s.price);
        btn.addEventListener('click', () => {
          if (S.coins < s.price) { Sound.play('deny'); toast('Yeterli altın yok'); return; }
          S.coins -= s.price;
          S.skins.push(s.id);
          S.skin = s.id;
          save();
          Sound.play('buy');
          checkAchievements();
          renderSkins();
        });
      }
      el.appendChild(btn);
      box.appendChild(el);
    });
  }

  // ---------- Başarımlar ----------
  function renderAch() {
    const done = ACHS.filter((a) => S.ach[a.id]).length;
    $('ach-count').textContent = done + '/' + ACHS.length;
    const st = S.stats;
    $('stats-box').innerHTML = '<div class="stats-grid">' +
      '<div>En İyi Dalga<b>' + S.best.wave + '</b></div>' +
      '<div>En Yüksek Skor<b>' + fmt(S.best.score) + '</b></div>' +
      '<div>Toplam Düşman<b>' + fmt(st.kills) + '</b></div>' +
      '<div>Yenilen Boss<b>' + st.bosses + '</b></div>' +
      '<div>Oyun Sayısı<b>' + st.runs + '</b></div>' +
      '<div>Toplam Altın<b>' + fmt(st.coins) + '</b></div>' +
      '<div>En Yüksek Seviye<b>' + st.maxLevel + '</b></div>' +
      '<div>Oynama Süresi<b>' + fmtTime(st.time) + '</b></div>' +
      '</div>';
    const box = $('ach-list');
    box.innerHTML = '';
    ACHS.forEach((a) => {
      const ok = !!S.ach[a.id];
      const el = document.createElement('div');
      el.className = 'item ach' + (ok ? ' done' : '');
      el.innerHTML = '<div class="ico">' + (ok ? a.icon : '🔒') + '</div><div class="info"><div class="name">' + a.name +
        '</div><div class="desc">' + a.desc + '</div></div><div class="reward">' + (ok ? '✓ ' : '') +
        '<span class="coin-ico"></span>' + fmt(a.reward) + '</div>';
      box.appendChild(el);
    });
  }

  // ---------- Ayarlar ----------
  function renderSettings() {
    const box = $('settings-list');
    box.innerHTML = '';
    const st = S.settings;

    const section = (t) => {
      const d = document.createElement('div');
      d.className = 'set-section';
      d.textContent = t;
      box.appendChild(d);
    };
    const row = (label, sub, control) => {
      const d = document.createElement('div');
      d.className = 'set';
      d.innerHTML = '<div><div class="label">' + label + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
      d.appendChild(control);
      box.appendChild(d);
    };
    const toggle = (key, onChange) => {
      const t = document.createElement('button');
      t.className = 'toggle' + (st[key] ? ' on' : '');
      t.addEventListener('click', () => {
        st[key] = !st[key];
        t.classList.toggle('on', st[key]);
        save();
        Sound.play('click');
        if (onChange) onChange();
      });
      return t;
    };
    const slider = (key, min, max, step, fmtFn, onChange) => {
      const w = document.createElement('div');
      w.className = 'slider-wrap';
      const inp = document.createElement('input');
      inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = st[key];
      const lab = document.createElement('span');
      lab.textContent = fmtFn(st[key]);
      inp.addEventListener('input', () => {
        st[key] = parseFloat(inp.value);
        lab.textContent = fmtFn(st[key]);
        if (onChange) onChange();
      });
      inp.addEventListener('change', () => save());
      w.appendChild(inp); w.appendChild(lab);
      return w;
    };
    const seg = (key, opts, onChange) => {
      const w = document.createElement('div');
      w.className = 'seg';
      opts.forEach((o) => {
        const b = document.createElement('button');
        b.textContent = o[1];
        b.className = st[key] === o[0] ? 'on' : '';
        b.addEventListener('click', () => {
          st[key] = o[0];
          w.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          save();
          Sound.play('click');
          if (onChange) onChange();
        });
        w.appendChild(b);
      });
      return w;
    };
    const pct = (v) => Math.round(v) + '%';

    section('Ses');
    row('Ses Efektleri', null, slider('sfx', 0, 100, 1, pct, () => { Sound.applyVolumes(); Sound.play('coin'); }));
    row('Müzik', null, slider('music', 0, 100, 1, pct, () => Sound.applyVolumes()));
    row('Titreşim', 'Vuruş ve önemli anlarda', toggle('vibrate', () => vibrate(60)));

    section('Kontrol');
    row('Kontrol Modu', st.control === 'relative' ? 'Kuş parmağının hareketini kopyalar' : 'Kuş parmağının biraz üstünü takip eder',
      seg('control', [['relative', 'Sürükle'], ['direct', 'Takip']], () => renderSettings()));
    row('Hassasiyet', 'Sürükle modunda hız çarpanı', slider('sens', 0.5, 3, 0.1, (v) => v.toFixed(1) + 'x'));
    row('Parmak Mesafesi', 'Takip modunda kuşun parmağa uzaklığı', slider('offset', 0, 150, 5, (v) => Math.round(v)));
    row('Parmak Kalkınca Duraklat', 'Ekrandan elini çekince oyun durur', toggle('liftPause'));

    section('Görüntü');
    row('Grafik Kalitesi', 'Düşük: daha akıcı, pil dostu', seg('quality', [['low', 'Düşük'], ['medium', 'Orta'], ['high', 'Yüksek']], () => resize()));
    row('Ekran Sarsıntısı', null, toggle('shake'));
    row('Hasar Sayıları', null, toggle('dmgNums'));
    row('FPS Göster', null, toggle('fps', () => $('fps').classList.toggle('hidden', !S.settings.fps)));

    section('Veri');
    const reset = document.createElement('button');
    reset.className = 'btn danger small';
    reset.textContent = 'Sıfırla';
    reset.addEventListener('click', () => {
      modal('Emin misin?', 'Tüm altınların, yükseltmelerin, kostümlerin ve rekorların silinecek. Bu işlem geri alınamaz!', [
        { text: 'Vazgeç', cancel: true },
        { text: 'Sil', cls: 'danger', fn: () => {
          const keepSettings = S.settings;
          S = defaultSave();
          S.settings = keepSettings;
          S.daily.last = todayStr();
          save();
          toast('İlerleme sıfırlandı');
          renderSettings();
          refreshMenu();
        } },
      ]);
    });
    row('İlerlemeyi Sıfırla', 'Ayarlar korunur', reset);

    const ver = document.createElement('div');
    ver.style.cssText = 'text-align:center;color:#9aa6bf;font-size:12px;margin-top:16px';
    ver.textContent = 'Muhabbet Kuşu: Sonsuz Gökyüzü · v1.0';
    box.appendChild(ver);
  }

  // =====================================================================
  //  Dokunmatik kontrol
  // =====================================================================
  let touching = false;
  let pointerId = null;
  let lastPX = 0, lastPY = 0;

  function toWorld(cx, cy) { return { x: cx * (W / cssW), y: cy * (W / cssW) }; }

  cv.addEventListener('pointerdown', (e) => {
    Sound.init();
    Sound.resume();
    if (state !== 'play') return;
    if (pointerId !== null && pointerId !== e.pointerId) return;
    pointerId = e.pointerId;
    touching = true;
    lastPX = e.clientX; lastPY = e.clientY;
    if (S.settings.control === 'direct') {
      const p = toWorld(e.clientX, e.clientY);
      player.tx = p.x;
      player.ty = p.y - S.settings.offset;
    }
    if (!S.seenHint) {
      S.seenHint = true;
      $('drag-hint').classList.add('hidden');
      save();
    }
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* yoksay */ }
  });

  cv.addEventListener('pointermove', (e) => {
    if (state !== 'play' || e.pointerId !== pointerId) return;
    if (S.settings.control === 'direct') {
      const p = toWorld(e.clientX, e.clientY);
      player.tx = clamp(p.x, 14, W - 14);
      player.ty = p.y - S.settings.offset;
    } else {
      const k = (W / cssW) * S.settings.sens;
      player.x += (e.clientX - lastPX) * k;
      player.y += (e.clientY - lastPY) * k;
      player.x = clamp(player.x, 14, W - 14);
      player.y = clamp(player.y, H * 0.18, H - 34 - safeBottomW);
    }
    lastPX = e.clientX; lastPY = e.clientY;
  });

  function endPointer(e) {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    touching = false;
    if (state === 'play' && S.settings.liftPause) pauseGame();
  }
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);

  // Masaüstünde test için klavye
  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (e.key === 'Escape' || e.key === 'p') window.onAndroidBack();
  });
  window.addEventListener('keyup', (e) => { keys[e.key] = false; });
  function keyboardMove(dt) {
    let dx = 0, dy = 0;
    if (keys.ArrowLeft || keys.a) dx -= 1;
    if (keys.ArrowRight || keys.d) dx += 1;
    if (keys.ArrowUp || keys.w) dy -= 1;
    if (keys.ArrowDown || keys.s) dy += 1;
    if (dx || dy) { player.x += dx * 300 * dt; player.y += dy * 300 * dt; }
  }

  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => {
    if (e.target === cv) e.preventDefault();
  }, { passive: false });

  // =====================================================================
  //  Android köprüsü: geri tuşu, arka plana alma
  // =====================================================================
  window.onAndroidBack = function () {
    if (!$('scr-modal').classList.contains('hidden')) {
      hide('modal');
      if (modalCb) modalCb();
      return true;
    }
    if (panelOpen) { closePanel(); return true; }
    if (state === 'play') { pauseGame(); return true; }
    if (state === 'paused') { resumeGame(); return true; }
    if (state === 'levelup') return true;
    if (state === 'over') { toMenu(); return true; }
    if (state === 'menu') {
      modal('Çıkış', 'Oyundan çıkmak istiyor musun?', [
        { text: 'Hayır', cancel: true },
        { text: 'Çık', cls: 'danger', fn: () => { save(); if (window.AndroidBridge) window.AndroidBridge.exitApp(); } },
      ]);
      return true;
    }
    return true;
  };

  window.onAppPause = function () {
    if (state === 'play') pauseGame();
    save();
    Sound.suspend();
  };
  window.onAppResume = function () {
    Sound.resume();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) window.onAppPause();
    else window.onAppResume();
  });

  // =====================================================================
  //  Buton bağlantıları
  // =====================================================================
  function on(id, fn) {
    $(id).addEventListener('click', (e) => {
      Sound.init();
      Sound.resume();
      fn(e);
    });
  }

  on('btn-play', () => { Sound.play('click'); startGame(); });
  on('btn-shop', () => openPanel('shop'));
  on('btn-skins', () => openPanel('skins'));
  on('btn-ach', () => openPanel('ach'));
  on('btn-settings', () => openPanel('settings'));
  on('btn-howto', () => openPanel('howto'));
  document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', closePanel));

  on('btn-pause', () => { Sound.play('click'); pauseGame(); });
  on('btn-resume', () => { Sound.play('click'); resumeGame(); });
  on('btn-pause-settings', () => openPanel('settings'));
  on('btn-quit', () => {
    modal('Oyunu bitir?', 'Bu oyundaki altınlarını yine de alırsın.', [
      { text: 'Vazgeç', cancel: true },
      { text: 'Bitir', cls: 'danger', fn: () => { hide('pause'); gameOver(); } },
    ]);
  });
  on('btn-reroll', () => {
    if (run.rerolls <= 0) return;
    run.rerolls--;
    Sound.play('click');
    currentChoices = rollChoices();
    renderCards();
  });
  on('btn-again', () => { Sound.play('click'); startGame(); });
  on('btn-over-menu', () => { Sound.play('click'); toMenu(); });
  on('btn-over-shop', () => { toMenu(); openPanel('shop'); });

  // =====================================================================
  //  Ana döngü
  // =====================================================================
  let lastT = performance.now();
  let fpsAcc = 0, fpsFrames = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) return;

    fpsAcc += dt; fpsFrames++;
    if (fpsAcc >= 0.5) {
      if (S.settings.fps) $('fps').textContent = Math.round(fpsFrames / fpsAcc) + ' FPS · ' + enemies.length + 'd ' + bullets.length + 'm';
      fpsAcc = 0; fpsFrames = 0;
    }

    if (state === 'play') {
      keyboardMove(dt);
      const steps = dt > 1 / 40 ? 2 : 1;
      for (let i = 0; i < steps && state === 'play'; i++) update(dt / steps);
      updateBackground(dt, 1);
      updateHud();
    } else if (state === 'menu') {
      menuTime += dt;
      updateBackground(dt, 1);
    } else if (state === 'over') {
      // ölüm sonrası parçacıklar akmaya devam etsin
      for (const p of particles) { p.life -= dt; if (p.kind === 0) { p.x += p.vx * dt; p.y += p.vy * dt; } }
      compact(particles, (p) => p.life <= 0);
      updateBackground(dt, 0.3);
      if (shakeT > 0) shakeT -= dt;
    }
    render(state === 'menu' ? menuTime : gameTime);
  }

  // =====================================================================
  //  Başlangıç
  // =====================================================================
  loadSave();
  resize();
  window.addEventListener('resize', resize);
  $('fps').classList.toggle('hidden', !S.settings.fps);
  toMenu();
  setTimeout(checkDaily, 400);
  requestAnimationFrame(frame);

  if (!IN_APP && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // Test/hata ayıklama için dışarı aç
  window.__game = {
    get state() { return state; }, get run() { return run; }, get player() { return player; },
    get enemies() { return enemies; }, get ebullets() { return ebullets; }, P: P, S: () => S, startGame: startGame, drawBird: drawBird, SKINS: SKINS,
    // Denge testi: oyunu çizim yapmadan hızlıca ilerletir
    sim(seconds, bot) {
      const dt = 1 / 60;
      for (let i = 0; i < seconds * 60; i++) {
        while (state === 'levelup') chooseCard(currentChoices[bot && bot.pickBest ? bot.pick(currentChoices) : 0]);
        if (state !== 'play') break;
        if (bot) bot.move(player, enemies, ebullets, W, H, dt);
        update(dt);
      }
      return state;
    },
  };
})();

// ===== 音（効果音は合成、プレイヤーと敵の声はCC0の人間の録音） =====
'use strict';
(function () {
  const G = window.G;
  // Ten stable enemy timbres from the recorded human shouts. Each actor keeps one voice.
  const ENEMY_VOICE_PROFILES = [
    { rate: .83, eq: -3, hz: 850, top: 3600 },
    { rate: .87, eq: 3, hz: 1150, top: 4500 },
    { rate: .91, eq: -5, hz: 1700, top: 3900 },
    { rate: .95, eq: 4, hz: 2300, top: 5900 },
    { rate: .99, eq: -2, hz: 1250, top: 5200 },
    { rate: 1.03, eq: 5, hz: 1450, top: 6500 },
    { rate: 1.07, eq: -4, hz: 2100, top: 4700 },
    { rate: 1.11, eq: 3, hz: 3200, top: 7000 },
    { rate: 1.15, eq: -2, hz: 650, top: 5600 },
    { rate: 1.19, eq: 4, hz: 850, top: 7200 },
  ];
  const A = G.Audio = {
    ctx: null, master: null, reverb: null, reverbSend: null, voices: 0, MAX_VOICES: 48,
    ok: false,

    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
      } catch (e) { console.warn('音声を初期化できません', e); return; }
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = 0.8;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
      this.master.connect(comp);
      // Automated QA exercises real audio nodes without sending sound to the speakers.
      this.outputMutedForTest = /[?&]autotest(?:&|$)/.test(location.search);
      if (!this.outputMutedForTest) comp.connect(c.destination);
      // 短い室内反射と、広い場所でだけ聞こえる弱い残響。
      this.reverb = c.createConvolver();
      this.reverb.buffer = this.makeImpulse(0.62, 3.2);
      this.reverbSend = c.createGain(); this.reverbSend.gain.value = 0.08;
      this.reverbSend.connect(this.reverb); this.reverb.connect(this.master);
      this.hallReverb = c.createConvolver(); this.hallReverb.buffer = this.makeImpulse(1.3, 3.5);
      this.hallSend = c.createGain(); this.hallSend.gain.value = 0.025;
      this.hallSend.connect(this.hallReverb); this.hallReverb.connect(this.master);
      this.noise = this.makeNoise(2);
      this.startAmbience();
      this.ok = true;
      this.preparePlayerVoice();
      this.prepareRadioVoices();
      this.prepareSurfaceSteps();
      this.prepare();
    },
    // 音声の器（再生前でも作れる方法を優先。ページを開いた直後の空き時間に声と足音を作っておく）
    newBuffer(n, SR) {
      try { return new AudioBuffer({ length: n, sampleRate: SR, numberOfChannels: 1 }); } catch (e) { }
      if (!this.ctx) this.init();
      return this.ctx.createBuffer(1, n, SR);
    },
    prepare() {
      this.prepareCasingBank();
      const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
      idle(() => { try { this.makeStepBank(); } catch (e) { } idle(() => { try { this.makeVoiceBank(true); } catch (e) { } }); });
    },
    makeNoise(sec) {
      const c = this.ctx, b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return b;
    },
    makeImpulse(sec, decay) {
      const c = this.ctx, len = c.sampleRate * sec, b = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = b.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          const t = i / len;
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < 300 ? i / 300 : 1);
        }
      }
      return b;
    },

    updateListener(cam) {
      if (!this.ok) return;
      const l = this.ctx.listener, p = cam.position;
      const f = this._f || (this._f = new THREE.Vector3()), u = this._u || (this._u = new THREE.Vector3());
      f.set(0, 0, -1).applyQuaternion(cam.quaternion);
      u.set(0, 1, 0).applyQuaternion(cam.quaternion);
      if (l.positionX) {
        l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
        l.forwardX.value = f.x; l.forwardY.value = f.y; l.forwardZ.value = f.z;
        l.upX.value = u.x; l.upY.value = u.y; l.upZ.value = u.z;
      } else {
        l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
      }
      (this.listenerPos || (this.listenerPos = new THREE.Vector3())).copy(p);
      this.updateAcoustics(p);
      for (const item of this.followingVoices || []) {
        const at = item.follow();
        if (!at) { try { item.source?.stop(); } catch (_) { } this.followingVoices.delete(item); continue; }
        if (item.panner.positionX) { item.panner.positionX.value = at.x; item.panner.positionY.value = at.y; item.panner.positionZ.value = at.z; }
        else item.panner.setPosition(at.x, at.y, at.z);
        const blocked = !G.World.lineOfSight(p.x, p.y, p.z, at.x, at.y, at.z);
        item.filter.frequency.setTargetAtTime(blocked ? 850 : 12000, this.ctx.currentTime, 0.04);
        item.gain.gain.setTargetAtTime(item.base * (blocked ? 0.42 : 1), this.ctx.currentTime, 0.04);
      }
    },

    acousticAt(p) {
      const w = G.World, x = Math.floor(p.x), z = Math.floor(p.z);
      if (w.outdoor) return { room: 0.045, hall: 0.02, ambience: 'wind' };
      let walls = 0;
      for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [4, 0], [-4, 0], [0, 4], [0, -4]])
        if (w.solidRange(x + dx, z + dz)) walls++;
      const enclosed = walls / 8;
      return { room: 0.075 + enclosed * 0.095, hall: 0.025 + (1 - enclosed) * 0.065, ambience: 'vent' };
    },
    updateAcoustics(p) {
      const a = this.acousticAt(p), t = this.ctx.currentTime;
      this.reverbSend.gain.setTargetAtTime(a.room, t, 0.18);
      this.hallSend.gain.setTargetAtTime(a.hall, t, 0.25);
      this.windGain.gain.setTargetAtTime(this.ambientEnabled && a.ambience === 'wind' ? 0.018 : 0, t, 0.35);
      this.ventGain.gain.setTargetAtTime(this.ambientEnabled && a.ambience === 'vent' ? 0.012 : 0, t, 0.35);
    },
    ambience(active) {
      this.ambientEnabled = !!active;
      if (!active && this.ctx) for (const g of [this.windGain, this.ventGain]) g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    },
    startAmbience() {
      const c = this.ctx;
      const layer = (type, freq) => {
        const src = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
        src.buffer = this.noise; src.loop = true; filter.type = type; filter.frequency.value = freq; gain.gain.value = 0;
        src.connect(filter); filter.connect(gain); gain.connect(this.master); src.start(); return gain;
      };
      this.windGain = layer('lowpass', 350);
      this.ventGain = layer('bandpass', 115);
    },

    // 出力先を作る。pos があれば位置音（HRTF）、壁で遮られていれば音量を下げて高音を削る
    out(pos, gain, opts) {
      if (!this.ok) return null;
      opts = opts || {};
      if (this.voices >= this.MAX_VOICES && !opts.important) return null;
      const c = this.ctx;
      const g = c.createGain(); g.gain.value = gain;
      let last = g;
      if (pos) {
        let occluded = false;
        if (this.listenerPos) occluded = !G.World.lineOfSight(this.listenerPos.x, this.listenerPos.y, this.listenerPos.z, pos.x, pos.y, pos.z);
        if (occluded && !opts.follow) {
          g.gain.value = gain * 0.42;
          const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 850; lp.Q.value = 0.5;
          g.connect(lp); last = lp;
        }
        const p = c.createPanner();
        p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
        p.refDistance = opts.ref || 1.5; p.rolloffFactor = opts.rolloff || 1.1; p.maxDistance = 200;
        if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
        else p.setPosition(pos.x, pos.y, pos.z);
        if (opts.follow) {
          const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = occluded ? 850 : 12000;
          last.connect(lp); lp.connect(p);
          g.gain.value = gain * (occluded ? 0.42 : 1);
          const item = { panner: p, filter: lp, gain: g, base: gain, follow: opts.follow };
          (this.followingVoices || (this.followingVoices = new Set())).add(item);
          g.followItem = item;
        } else last.connect(p);
        last = p;
      }
      last.connect(this.master);
      if (opts.reverb !== 0) {
        const s = c.createGain(); s.gain.value = opts.reverb ?? 0.6; last.connect(s); s.connect(this.reverbSend);
        const h = c.createGain(); h.gain.value = (opts.reverb ?? 0.6) * 0.5; last.connect(h); h.connect(this.hallSend);
      }
      this.voices++;
      const life = opts.life || 1.2;
      setTimeout(() => { this.voices--; if (g.followItem) this.followingVoices?.delete(g.followItem); try { g.disconnect(); } catch (e) { } }, life * 1000 + 200);
      return g;
    },

    noiseBurst(dest, t, dur, type, freq, q, peak, attack, startOffset) {
      const c = this.ctx;
      const src = c.createBufferSource(); src.buffer = this.noise;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + (attack || 0.002));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(dest);
      src.start(t, startOffset !== undefined ? startOffset : Math.random() * 1.5, dur + 0.05);
      return f;
    },
    tone(dest, t, dur, type, f0, f1, peak) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
    },

    // ---- 各種の音 ----
    gunshot(pos, isPlayer, kind, suppressed) {
      if (suppressed) {   // サプレッサー付き：くぐもった「パシュッ」と、作動部の金属音
        const d = this.out(pos, isPlayer ? 0.55 : 0.6, { important: true, life: 0.6, reverb: 0.4, ref: 1.5, rolloff: 1.2 });
        if (!d) return;
        const t = this.ctx.currentTime, v = 0.9 + Math.random() * 0.2;
        this.noiseBurst(d, t, 0.07, 'lowpass', 900 * v, 0.7, 0.9, 0.002);
        this.noiseBurst(d, t, 0.04, 'bandpass', 2600 * v, 1.2, 0.35, 0.001);
        this.tone(d, t, 0.06, 'sine', 160 * v, 70, 0.35);
        if (isPlayer) this.noiseBurst(d, t + 0.01, 0.03, 'bandpass', 4200, 4, 0.5, 0.001);
        return;
      }
      const d = this.out(pos, isPlayer ? 0.9 : 1.4, { important: true, life: 1.2, reverb: 0.9, ref: 3, rolloff: 0.9 });
      if (!d) return;
      const t = this.ctx.currentTime, v = 0.9 + Math.random() * 0.2;
      if (kind === 'pistol') {   // 乾いた高めの破裂音、尾は短い
        this.noiseBurst(d, t, 0.06, 'bandpass', 2600 * v, 0.8, 1.0, 0.001);
        this.noiseBurst(d, t, 0.14, 'lowpass', 1300 * v, 0.6, 0.7, 0.002);
        this.tone(d, t, 0.09, 'sine', 190 * v, 60, 0.6);
        this.noiseBurst(d, t + 0.015, 0.35, 'lowpass', 600, 0.4, 0.18, 0.01);
        if (isPlayer) this.noiseBurst(d, t, 0.02, 'highpass', 6000, 0.8, 0.4, 0.001);
        return;
      }
      if (kind === 'shotgun') {  // 太く重い発砲音と長い残響
        this.noiseBurst(d, t, 0.12, 'bandpass', 1200 * v, 0.6, 1.0, 0.001);
        this.noiseBurst(d, t, 0.35, 'lowpass', 650 * v, 0.6, 1.0, 0.002);
        this.tone(d, t, 0.22, 'sine', 110 * v, 32, 1.0);
        this.noiseBurst(d, t + 0.03, 0.9, 'lowpass', 320, 0.4, 0.35, 0.01);
        return;
      }
      this.noiseBurst(d, t, 0.09, 'bandpass', 1800 * v, 0.7, 1.0, 0.001);   // 破裂音
      this.noiseBurst(d, t, 0.22, 'lowpass', 900 * v, 0.6, 0.9, 0.002);     // 胴鳴り
      this.tone(d, t, 0.14, 'sine', 140 * v, 42, 0.9);                       // 低音
      this.noiseBurst(d, t + 0.02, 0.5, 'lowpass', 420, 0.4, 0.25, 0.01);   // 尾
      if (isPlayer) this.noiseBurst(d, t, 0.025, 'highpass', 5000, 0.8, 0.35, 0.001); // 機関部の金属音
    },
    prepareCasingBank() {
      if(this.casingBank||!this.ctx)return;
      this.casingBank={};
      // A short brass contact, not a sustained pitched chime. The broadband impact
      // leads; low-level, heavily damped inharmonic modes only supply the metal texture.
      const sr=32000,n=Math.floor(sr*.16),ratios=[1,1.53,2.19,2.87],levels=[.22,.13,.065,.025],tails=[.015,.009,.006,.004];
      for(const kind of ['ar','pistol','shotgun'])for(const floor of ['concrete','metal','wood','carpet','grass']){
        const soft=floor==='carpet'||floor==='grass',wood=floor==='wood',metal=floor==='metal';
        const damping=soft?.12:wood?.42:metal?1.2:1;
        const resonance=(soft?.08:wood?.42:1)*(kind==='shotgun'?.48:1);
        const bank=this.casingBank[kind+':'+floor]=[];
        for(let variant=0;variant<3;variant++){
          const buffer=this.newBuffer(n,sr),out=buffer.getChannelData(0);
          const base=(kind==='ar'?1700:kind==='pistol'?2100:1400)*(1+(variant-1)*.035);
          let seed=173+variant*101,previous=0,grain=0;
          for(let i=0;i<n;i++){
            const t=i/sr;seed=(seed*16807)%2147483647;const noise=seed/1073741824-1;
            grain=.58*grain+.42*noise;
            let sample=grain*.4*Math.exp(-t/(soft?.003:.0065))+(noise-previous)*.065*Math.exp(-t/.002);previous=noise;
            for(let mode=0;mode<4;mode++)sample+=Math.sin(2*Math.PI*base*ratios[mode]*t)*levels[mode]*resonance*Math.exp(-t/(tails[mode]*damping));
            if(wood)sample+=noise*.15*Math.exp(-t/.009);
            if(metal)sample+=grain*.12*Math.exp(-t/.012);
            out[i]=sample*Math.min(1,i/8)*Math.min(1,(n-i-1)/160);
          }
          bank.push(buffer);
        }
      }
    },
    casingHit(pos, kind, surface, speed, bounce) {
      if (!this.ok || speed < .45) return;
      const soft = surface === 'carpet' || surface === 'grass';
      const metal = surface === 'metal';
      const volume = .95 * Math.min(.33, Math.max(.035, speed * .055)) * (soft ? .22 : 1) * (bounce ? .42 : 1);
      const d = this.out(pos, volume, { life: .24, reverb: metal?.045:.018, ref: .7, rolloff: 1.35 });
      if (!d) return;
      this.prepareCasingBank();
      const bank=this.casingBank[kind+':'+surface]||this.casingBank['ar:concrete'];
      const source=this.ctx.createBufferSource();source.buffer=bank[Math.floor(Math.random()*bank.length)];
      source.connect(d);source.start();source.onended=()=>source.disconnect();return source;
    },
    dryClick() {
      const d = this.out(null, 0.6, { life: 0.2, reverb: 0.2 }); if (!d) return;
      const t = this.ctx.currentTime;
      this.noiseBurst(d, t, 0.03, 'bandpass', 3200, 3, 0.8, 0.001);
      this.tone(d, t, 0.03, 'square', 1800, 900, 0.08);
    },
    // リロードの各操作音 kind: 'out' | 'in' | 'charge' | 'release' | 'grab'
    reload(kind, pos) {
      const d = this.out(pos || null, pos ? 1.1 : 0.7, { life: 0.4, reverb: 0.3, ref: 1 }); if (!d) return;
      const t = this.ctx.currentTime;
      if (kind === 'grab') { this.noiseBurst(d, t, 0.05, 'bandpass', 900, 1.2, 0.25, 0.005); }
      if (kind === 'out') {
        this.noiseBurst(d, t, 0.04, 'bandpass', 2600, 4, 0.8, 0.001);
        this.noiseBurst(d, t + 0.03, 0.12, 'bandpass', 1300, 2, 0.4, 0.005);
      }
      if (kind === 'in') {
        this.noiseBurst(d, t, 0.03, 'bandpass', 1400, 2, 0.5, 0.001);
        this.noiseBurst(d, t + 0.05, 0.05, 'bandpass', 3000, 5, 1.0, 0.001);
        this.tone(d, t + 0.05, 0.04, 'triangle', 700, 300, 0.25);
      }
      if (kind === 'charge') {
        this.noiseBurst(d, t, 0.08, 'bandpass', 2200, 3, 0.6, 0.003);
      }
      if (kind === 'pumpB') {   // ポンプを引く
        this.noiseBurst(d, t, 0.07, 'bandpass', 1500, 2.5, 0.9, 0.002);
        this.noiseBurst(d, t + 0.05, 0.05, 'bandpass', 3200, 5, 0.8, 0.001);
      }
      if (kind === 'pumpF') {   // ポンプを戻す
        this.noiseBurst(d, t, 0.06, 'bandpass', 1900, 2.5, 0.9, 0.002);
        this.noiseBurst(d, t + 0.04, 0.04, 'bandpass', 3800, 6, 1.0, 0.001);
        this.tone(d, t + 0.04, 0.05, 'triangle', 600, 250, 0.2);
      }
      if (kind === 'shell') {   // 弾を1発押し込む
        this.noiseBurst(d, t, 0.03, 'bandpass', 900, 2, 0.6, 0.002);
        this.noiseBurst(d, t + 0.03, 0.04, 'bandpass', 2600, 4, 0.7, 0.001);
      }
      if (kind === 'screw') {   // サプレッサーをねじる
        this.noiseBurst(d, t, 0.06, 'bandpass', 2400 + Math.random() * 800, 3, 0.35, 0.01);
        this.noiseBurst(d, t + 0.02, 0.02, 'bandpass', 4200, 5, 0.2, 0.001);
      }
      if (kind === 'pin') {     // 手りゅう弾の安全ピンを抜く
        this.noiseBurst(d, t, 0.05, 'bandpass', 4200, 6, 0.6, 0.002);
        this.tone(d, t + 0.02, 0.06, 'triangle', 2600, 2200, 0.15);
      }
      if (kind === 'release') {
        this.noiseBurst(d, t, 0.05, 'bandpass', 3400, 5, 1.0, 0.001);
        this.tone(d, t, 0.06, 'square', 900, 400, 0.12);
      }
    },
    grenadeThrow() {
      // 腕を振るときの袖と装備の短い擦れ。音程を持つ「ピュー」は鳴らさない。
      const d = this.out(null, .68, { life: .28, reverb: .12, important: true }); if (!d) return;
      const t = this.ctx.currentTime;
      this.noiseBurst(d, t, .14, 'bandpass', 780, .55, .82, .01);
      this.noiseBurst(d, t + .025, .1, 'lowpass', 560, .7, .7, .006);
      this.noiseBurst(d, t + .055, .035, 'highpass', 2400, .6, .22, .002);
    },
    // ---- 足音：かかとの着地・つま先・靴底のこすれ・床の砂粒のきしみ・装備の揺れ・服のこすれを組み合わせて作る ----
    makeStepBank() {
      if (this.stepBank) return;
      const SR = 24000;
      // 2次フィルター（バンドパス／ローパス／ハイパス）をサンプル単位でかける
      const biquad = (type, f, q) => {
        const w = 2 * Math.PI * f / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
        let b0, b1, b2; const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
        if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; }
        else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; }
        else { b0 = al; b1 = 0; b2 = -al; }
        let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        return (x) => { const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
      };
      const env = (t, at, dec) => t < 0 ? 0 : t < at ? t / at : Math.exp(-(t - at) / dec);
      const make = (kind, seed) => {
        let s = seed * 7919 + 13; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
        const dur = kind === 'prone' ? 0.6 : 0.36, n = Math.floor(dur * SR), out = new Float32Array(n);
        // 硬い靴底がコンクリートに着く音：低い「コッ」と、少し遅れたつま先、短いこすれ。砂のきしみは控えめ
        const P = {
          walk:   { heel: 1.0, toeT: 0.06 + r() * 0.03, toe: 0.4, scuff: 0.14, scuffDec: 0.05, grit: 0.08, gear: 0, body: 105 },
          run:    { heel: 1.3, toeT: 0.035 + r() * 0.015, toe: 0.55, scuff: 0.2, scuffDec: 0.04, grit: 0.12, gear: 0, body: 92 },
          crouch: { heel: 0.5, toeT: 0.09 + r() * 0.04, toe: 0.32, scuff: 0.3, scuffDec: 0.1, grit: 0.08, gear: 0, body: 115 },
          sneak:  { heel: 0.28, toeT: 0.12 + r() * 0.05, toe: 0.25, scuff: 0.22, scuffDec: 0.12, grit: 0.04, gear: 0, body: 120 },
          prone:  { heel: 0.2, toeT: 0.2, toe: 0.12, scuff: 0, scuffDec: 0.1, grit: 0.08, gear: 0, body: 120, drag: 1 },
        }[kind];
        const lpHeel = biquad('lp', 520 + r() * 160, 1.1), bpToe = biquad('bp', 1100 + r() * 400, 1.6), bpScuff = biquad('bp', 700 + r() * 500, 0.8);
        const hpGrit = biquad('hp', 1800 + r() * 700, 0.6), bpGear = biquad('bp', 3200 + r() * 2200, 9), bpGear2 = biquad('bp', 2100 + r() * 900, 7);
        const bpCloth = biquad('bp', 1800 + r() * 1500, 0.6), lpDrag = biquad('lp', 2200, 0.7);
        const gritT = []; const gritN = Math.floor(6 + r() * 14);
        for (let k = 0; k < gritN; k++) gritT.push(0.005 + r() * (kind === 'prone' ? 0.45 : 0.12));
        const gearT = []; if (P.gear) { const gn = 2 + Math.floor(r() * 3); for (let k = 0; k < gn; k++) gearT.push(0.04 + r() * 0.12); }
        const bodyF = P.body * (0.85 + r() * 0.3);
        for (let i = 0; i < n; i++) {
          const t = i / SR, nz = r() * 2 - 1;
          // かかと：低い「ドッ」という響き（床と体重）
          let x = lpHeel(nz) * env(t, 0.0015, 0.022) * P.heel * 2.4 + Math.sin(2 * Math.PI * bodyF * t) * env(t, 0.003, 0.03) * P.heel * 0.7
                + Math.sin(2 * Math.PI * bodyF * 2.7 * t) * env(t, 0.001, 0.012) * P.heel * 0.25;   // 靴底の硬い響き
          // つま先：少し遅れて軽く高い音
          x += bpToe(nz) * env(t - P.toeT, 0.002, 0.012) * P.toe * 2.0;
          // 靴底が床をこする音
          x += bpScuff(nz) * env(t - 0.01, 0.02, P.scuffDec) * P.scuff * 1.2;
          // 床の砂粒がきしむ細かな音
          let gi = 0; for (const gt of gritT) { const dt2 = t - gt; if (dt2 >= 0 && dt2 < 0.004) gi += (r() * 2 - 1) * (1 - dt2 / 0.004); }
          x += hpGrit(gi) * P.grit * 1.6;
          // 装備（金具・弾倉）が揺れて当たる音
          let gr = 0; for (const gt of gearT) { const dt2 = t - gt; if (dt2 >= 0 && dt2 < 0.002) gr += (r() * 2 - 1); }
          x += (bpGear(gr) * 1.6 + bpGear2(gr) * 0.8) * P.gear;
          x += bpCloth(nz) * env(t - 0.02, 0.04, 0.09) * P.gear * 0.25;     // 服のこすれ
          // 伏せて進む：服と装備が床を引きずる音
          if (P.drag) x += lpDrag(nz) * (Math.sin(Math.PI * t / dur) ** 2) * 0.55 * (0.7 + 0.3 * Math.sin(t * 31));
          out[i] = x;
        }
        let peak = 1e-6; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
        for (let i = 0; i < n; i++) out[i] *= 0.85 / peak;
        const buf = this.newBuffer(n, SR); buf.getChannelData(0).set(out);
        return buf;
      };
      this.stepBank = {};
      for (const k of ['walk', 'run', 'crouch', 'sneak', 'prone']) { this.stepBank[k] = []; for (let v = 0; v < (k === 'prone' ? 3 : 6); v++) this.stepBank[k].push(make(k, v + 1 + k.length * 10)); }
      // 装備の音：布のこすれは控えめにし、金具（カラビナ・バックル・スリングの金具）の澄んだ当たりと、
      // ポーチの中の弾倉がこつんと当たる音を混ぜる
      const ring = (f, decay) => {   // 短く鳴って減衰する金属の響き（共鳴フィルター）
        const w = 2 * Math.PI * f / SR, rr = Math.exp(-1 / (decay * SR));
        let y1 = 0, y2 = 0; const c1 = 2 * rr * Math.cos(w), c2 = -rr * rr;
        return (x) => { const y = x + c1 * y1 + c2 * y2; y2 = y1; y1 = y; return y; };
      };
      // 鎖や小さな金具が触れ合う「チャラッ」：響かない短いカチカチを10〜20粒、ばらつかせて重ねる（鈴のような余韻は付けない）
      const makeGear = (seed, strong) => {
        let s = seed * 104729 + 7; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
        const dur = 0.4, n = Math.floor(dur * SR), out = new Float32Array(n);
        const cloth = biquad('bp', 700 + r() * 600, 0.6);
        const chainA = biquad('bp', 3000 + r() * 1200, 2.2), chainB = biquad('bp', 5200 + r() * 1500, 2.5), chainLo = biquad('bp', 1700 + r() * 500, 1.8);
        const magKnock = biquad('bp', 1100 + r() * 500, 4);
        const swishAt = 0.02 + r() * 0.05, swishLen = 0.12 + r() * 0.12;
        // 粒の時刻：最初に密集し、だんだんまばらに（揺れが収まる）
        const grains = []; const gn = (strong ? 14 : 9) + Math.floor(r() * 7);
        const start = 0.03 + r() * 0.06;
        for (let k = 0; k < gn; k++) { const u = Math.pow(r(), 1.8); grains.push([start + u * 0.2, 0.3 + r() * 0.7]); }
        const knocks = []; if (r() < 0.5) knocks.push([0.05 + r() * 0.2, 0.4 + r() * 0.4]);
        for (let i = 0; i < n; i++) {
          const t = i / SR, nz = r() * 2 - 1;
          const sw = Math.sin(Math.PI * Math.min(1, Math.max(0, (t - swishAt) / swishLen))) ** 2;
          let x = cloth(nz) * sw * 0.3;
          let g = 0; for (const [gt, amp] of grains) { const d = t - gt; if (d >= 0 && d < 0.0025) g += nz * amp * Math.exp(-d / 0.0006); }
          x += chainA(g) * 0.7 + chainB(g) * 0.45 + chainLo(g) * 0.35;
          let kn = 0; for (const [tt, amp] of knocks) { const d = t - tt; if (d >= 0 && d < 0.003) kn += nz * amp; }
          x += magKnock(kn) * 0.6;
          out[i] = x;
        }
        let peak = 1e-6; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
        for (let i = 0; i < n; i++) out[i] *= 0.8 / peak;
        const buf = this.newBuffer(n, SR); buf.getChannelData(0).set(out); return buf;
      };
      this.gearBank = []; for (let v = 0; v < 8; v++) this.gearBank.push(makeGear(v + 3, v % 2 === 0));
    },
    // kind: 'walk' | 'run' | 'crouch' | 'prone'
    stepVol: 1,
    prepareSurfaceSteps() {
      if(this.surfaceSteps||!this.ctx||!G.FOOTSTEP_DATA)return;
      this.surfaceSteps={};
      for(const [key,encoded] of Object.entries(G.FOOTSTEP_DATA.surfaces))this.surfaceSteps[key]=encoded.map(str=>{
        const bytes=atob(str), n=bytes.length/2, b=this.ctx.createBuffer(1,n,G.FOOTSTEP_DATA.sampleRate), d=b.getChannelData(0);
        for(let i=0;i<n;i++){let v=bytes.charCodeAt(i*2)|(bytes.charCodeAt(i*2+1)<<8);d[i]=(v>=32768?v-65536:v)/32768;}return b;
      });
    },
    woodBreak(pos) {
      const out=this.out(pos,.7,{life:.5,reverb:.15});if(!out)return;
      this.noiseBurst(out,this.ctx.currentTime,.32,'bandpass',950,1.4,.8,.005);
      this.tone(out,this.ctx.currentTime,.1,'triangle',140,55,.35);
    },
    footstep(pos, loud, isPlayer, kind) {
      if (!this.ok) return;
      if (!this.stepBank) { try { this.makeStepBank(); } catch (e) { return; } }
      this.prepareSurfaceSteps();
      const at=pos || G.Player?.pos || {x:0,y:0,z:0};
      const surface=G.Surfaces.at(at.x,at.z,at.y);this.lastSurface=surface;
      const recorded=this.surfaceSteps?.[surface];
      const bank = kind === 'prone' || !recorded ? (this.stepBank[kind || 'walk'] || this.stepBank.walk) : recorded;
      const d = this.out(isPlayer ? null : pos, loud * (isPlayer ? (recorded ? 0.75 : 0.2) : 1.0) * this.stepVol, { life: 0.7, reverb: 0.3, ref: 1.2, rolloff: 1.2 });
      if (!d) return;
      // 同じ音が続かないよう選び、高さと強さを毎回わずかに変える
      let idx = Math.floor(Math.random() * bank.length); if (idx === this._lastStep) idx = (idx + 1) % bank.length; this._lastStep = idx;
      const src = this.ctx.createBufferSource(); src.buffer = bank[idx];
      src.playbackRate.value = (kind === 'run' ? 1.05 : kind === 'sneak' ? 0.96 : 1) * (0.98 + Math.random() * 0.04);
      src.connect(d); src.start();
    },
    grenadeBounce(pos, k) {
      const d = this.out(pos, 0.5 * k, { life: 0.4, reverb: 0.3, ref: 1 }); if (!d) return;
      const t = this.ctx.currentTime;
      this.noiseBurst(d, t, 0.04, 'bandpass', 2200, 3, 0.9, 0.001);
      this.tone(d, t, 0.08, 'triangle', 1400 + Math.random() * 600, 900, 0.25);
    },
    explosion(pos, near) {
      const d = this.out(pos, 2.4, { important: true, life: 2.5, reverb: 1.2, ref: 6, rolloff: 0.7 }); if (!d) return;
      const t = this.ctx.currentTime;
      this.noiseBurst(d, t, 0.15, 'bandpass', 900, 0.5, 1.0, 0.001);    // 衝撃
      this.noiseBurst(d, t, 1.2, 'lowpass', 300, 0.5, 1.0, 0.004);      // 轟音
      this.tone(d, t, 0.6, 'sine', 70, 22, 1.0);                         // 地響き
      this.noiseBurst(d, t + 0.05, 1.8, 'lowpass', 900, 0.4, 0.35, 0.05); // 破片が散る音
      for (let i = 0; i < 8; i++) this.noiseBurst(d, t + 0.25 + Math.random() * 0.9, 0.03, 'bandpass', 2500 + Math.random() * 3000, 3, 0.15, 0.001);
      // 近くで爆発すると耳鳴りがして周りの音がこもる
      if (near > 0) {
        const c = this.ctx, o = c.createOscillator(), g = c.createGain();
        o.frequency.value = 3800 + Math.random() * 600; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 * near, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
        o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 3);
        if (!this.duck) { this.duck = c.createBiquadFilter(); this.duck.type = 'lowpass'; this.duck.frequency.value = 20000; }
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setValueAtTime(0.8 * (1 - near * 0.6), t + 0.02);
        this.master.gain.linearRampToValueAtTime(0.8, t + 2.5);
      }
    },
    // 服と装備のこすれる音（k：強さ）
    gear(pos, k, isPlayer) {
      if (!this.ok || !this.gearBank) return;
      const d = this.out(isPlayer ? null : pos, k * (isPlayer ? 0.05 : 0.28) * this.stepVol, { life: 0.6, reverb: 0.15, ref: 1, rolloff: 1.3 });
      if (!d) return;
      const src = this.ctx.createBufferSource(); src.buffer = this.gearBank[(Math.random() * this.gearBank.length) | 0];
      src.playbackRate.value = 0.9 + Math.random() * 0.2; src.connect(d); src.start();
    },
    bodyFall(pos, k) {
      const d = this.out(pos, 1.3 * (k || 1), { important: true, life: 0.9, reverb: 0.5, ref: 1.5, rolloff: 1.0 }); if (!d) return;
      const t = this.ctx.currentTime;
      this.tone(d, t, 0.22, 'sine', 75, 38, 1.0);                         // 体の重さの「ドッ」
      this.noiseBurst(d, t, 0.16, 'lowpass', 320, 0.8, 1.0, 0.003);      // 床に当たる「サッ」
      this.noiseBurst(d, t + 0.01, 0.22, 'bandpass', 900, 0.7, 0.35, 0.01); // 服がこすれる
      if (this.gearBank) { const src = this.ctx.createBufferSource(); src.buffer = this.gearBank[(Math.random() * this.gearBank.length) | 0]; const g = this.ctx.createGain(); g.gain.value = 0.6; src.connect(g); g.connect(d); src.start(t + 0.02); }
    },
    // 応急処置の音：袋を破る・面ファスナーをはがす（始め）、止血帯を巻き上げて留める・包帯を押さえる（終わり）
    treat(phase, item) {
      const d = this.out(null, 0.5, { life: 0.8, reverb: 0.2 }); if (!d) return;
      const t = this.ctx.currentTime;
      if (phase === 'start') {
        for (let i = 0; i < 9; i++) this.noiseBurst(d, t + i * 0.022 + Math.random() * 0.01, 0.02, 'bandpass', 2600 + Math.random() * 1800, 2, 0.35, 0.001);
        this.noiseBurst(d, t + 0.22, 0.25, 'bandpass', 1400, 0.8, 0.25, 0.02);
      } else if (item === 'tq') {
        for (let i = 0; i < 4; i++) { this.noiseBurst(d, t + i * 0.09, 0.03, 'bandpass', 1800, 4, 0.5, 0.001); this.tone(d, t + i * 0.09, 0.03, 'triangle', 900, 700, 0.12); }
        this.noiseBurst(d, t + 0.4, 0.02, 'bandpass', 3200, 6, 0.6, 0.001);
      } else {
        this.noiseBurst(d, t, 0.35, 'bandpass', 900, 0.7, 0.3, 0.03);
        this.noiseBurst(d, t + 0.3, 0.03, 'bandpass', 2400, 3, 0.3, 0.001);
      }
    },
    // もげた部位が床に落ちる「ドッ」（体より軽く、湿った音）
    limbDrop(pos, kind) {
      const d = this.out(pos, kind === 'head' ? 0.9 : kind === 'leg' ? 1.0 : 0.7, { life: 0.6, reverb: 0.35, ref: 1.2, rolloff: 1.1 }); if (!d) return;
      const t = this.ctx.currentTime;
      this.tone(d, t, 0.14, 'sine', kind === 'leg' ? 85 : 110, 45, 0.8);
      this.noiseBurst(d, t, 0.1, 'lowpass', 380, 0.8, 0.8, 0.002);
      this.noiseBurst(d, t + 0.01, 0.12, 'bandpass', 900, 0.7, 0.25, 0.01);
    },
    kneeDrop(pos) {
      const d = this.out(pos, 0.6, { life: 0.4, reverb: 0.3, ref: 1.2 }); if (!d) return;
      const t = this.ctx.currentTime;
      this.tone(d, t, 0.1, 'sine', 95, 55, 0.6);
      this.noiseBurst(d, t, 0.08, 'lowpass', 450, 0.8, 0.6, 0.002);
    },
    gunClatter(pos) {
      const d = this.out(pos, 0.7, { life: 0.6, reverb: 0.3, ref: 1.2 }); if (!d) return;
      const t = this.ctx.currentTime;
      for (let i = 0; i < 3; i++) { const tt = t + i * (0.07 + Math.random() * 0.05); this.noiseBurst(d, tt, 0.05, 'bandpass', 1500 + Math.random() * 1200, 2.5, 0.8 / (i + 1), 0.001); this.noiseBurst(d, tt, 0.06, 'lowpass', 500, 0.8, 0.4 / (i + 1), 0.002); }
    },
    impact(pos) {
      const d = this.out(pos, 0.6, { life: 0.3, reverb: 0.4, ref: 1 }); if (!d) return;
      const t = this.ctx.currentTime;
      this.noiseBurst(d, t, 0.06, 'bandpass', 2500 + Math.random() * 1500, 1.5, 0.9, 0.001);
      this.noiseBurst(d, t, 0.12, 'lowpass', 600, 0.7, 0.3, 0.002);
    },
    whiz(pos) {
      const d = this.out(pos, 0.5, { life: 0.3, reverb: 0.1, ref: 0.6 }); if (!d) return;
      const t = this.ctx.currentTime;
      const f = this.noiseBurst(d, t, 0.12, 'bandpass', 4000, 6, 0.9, 0.02);
      f.frequency.exponentialRampToValueAtTime(1200, t + 0.12);
    },
    fleshHit(pos) {
      const d = this.out(pos, 0.9, { life: 0.3, reverb: 0.2, ref: 1 }); if (!d) return;
      const t = this.ctx.currentTime;
      this.noiseBurst(d, t, 0.09, 'lowpass', 500, 1, 1.0, 0.002);
      this.tone(d, t, 0.08, 'sine', 120, 60, 0.4);
    },
    hitMarker(head) {
      const d = this.out(null, 0.35, { life: 0.2, reverb: 0 }); if (!d) return;
      const t = this.ctx.currentTime;
      this.tone(d, t, 0.05, 'triangle', head ? 2400 : 1600, head ? 2200 : 1500, 0.5);
    },
    preparePlayerVoice() {
      if (this.playerVoiceBank || !this.ctx || !G.PLAYER_VOICE_DATA) return;
      const data = G.PLAYER_VOICE_DATA;
      this.playerVoiceBank = {};
      for (const type of ['hurt', 'death']) {
        this.playerVoiceBank[type] = data[type].map(encoded => {
          const binary = atob(encoded), n = binary.length / 2;
          const buffer = this.ctx.createBuffer(1, n, data.sampleRate), samples = buffer.getChannelData(0);
          for (let i = 0; i < n; i++) {
            let value = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
            if (value >= 32768) value -= 65536;
            samples[i] = value / 32768;
          }
          return buffer;
        });
      }
      this._lastPlayerVoice = -1;
    },
    prepareRadioVoices() {
      if (this.radioVoiceBank || !this.ctx || !G.RADIO_VOICE_DATA) return;
      const data = G.RADIO_VOICE_DATA;
      this.radioVoiceBank = {};
      for (const actor of ['alpha', 'bravo']) {
        const bank = this.radioVoiceBank[actor] = {};
        for (const [id, encoded] of Object.entries(data.voices[actor])) {
          const binary = atob(encoded), n = binary.length / 2;
          const buffer = this.ctx.createBuffer(1, n, data.sampleRate), samples = buffer.getChannelData(0);
          for (let i = 0; i < n; i++) {
            let value = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
            if (value >= 32768) value -= 65536;
            samples[i] = value / 32768;
          }
          bank[id] = buffer;
        }
      }
    },
    radioVoice(ally, id, tone = 'normal') {
      if (!this.ok || !ally) return null;
      this.prepareRadioVoices();
      const bank = this.radioVoiceBank?.[ally.id === 0 ? 'alpha' : 'bravo'];
      const buffer = bank?.[id], pos = ally.voicePos?.();
      if (!buffer || !pos) return null;
      const gain = tone === 'whisper' ? .48 : tone === 'shout' ? 1.18 : .92;
      const dest = this.out(pos, gain, { life: buffer.duration + .15, reverb: tone === 'shout' ? .1 : .05, ref: tone === 'shout' ? 3 : 2.2, rolloff: .7, important: true, follow: () => ally.voicePos() });
      if (!dest) return null;
      const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = tone === 'whisper' ? 300 : 115;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = tone === 'whisper' ? 3900 : 5200;
      const src = this.ctx.createBufferSource(); src.buffer = buffer;
      src.connect(hp); hp.connect(lp); lp.connect(dest);
      if (dest.followItem) dest.followItem.source = src;
      src.start();
      src.onended = () => { src.disconnect(); hp.disconnect(); lp.disconnect(); if (dest.followItem) this.followingVoices?.delete(dest.followItem); };
      return src;
    },
    playerVoice(type = 'hurt') {
      if (!this.ok) return;
      this.preparePlayerVoice();
      if(type==='death'){
        if(this._playerVoiceSource){try{this._playerVoiceSource.stop();this._playerVoiceSource.disconnect();}catch(_){}this._playerVoiceSource=null;}
        this._playerVoiceUntil=0;
        if(Math.random()<.85)return;
        this.makeVoiceBank();
      }
      const bank = type==='death'?this.lastBreathBank:this.playerVoiceBank && this.playerVoiceBank[type];
      if (!bank || !bank.length) return;
      const now = this.ctx.currentTime;
      // Damage from several bullets in one burst must not produce a chorus of voices.
      if (type !== 'death' && now < (this._playerVoiceUntil || 0)) return;
      if (this._playerVoiceSource) { try { this._playerVoiceSource.stop(); } catch (_) { } }
      let index = Math.floor(Math.random() * bank.length);
      if (type === 'hurt' && bank.length > 1 && index === this._lastPlayerVoice) index = (index + 1) % bank.length;
      if (type === 'hurt') this._lastPlayerVoice = index;
      const buffer = bank[index];
      const dest = this.out(null, type === 'death' ? 0.18 : 0.85, { life: buffer.duration + 0.1, reverb: type==='death'?.025:.08, important: true });
      if (!dest) return;
      const source = this.ctx.createBufferSource(); source.buffer = buffer;
      // Natural timing and pitch of the recording, with only a subtle room send.
      if(type==='death'){
        const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1100;filter.Q.value=.5;
        source.playbackRate.value=.92;source.connect(filter);filter.connect(dest);source._deathFilter=filter;
      }else source.connect(dest);
      source.start();
      this._playerVoiceSource = source; this._playerVoiceUntil = now + buffer.duration;
      source.onended = () => { source.disconnect();source._deathFilter?.disconnect(); if (this._playerVoiceSource === source) this._playerVoiceSource = null; };
      return source;
    },
    hurt() {
      const d = this.out(null, 0.8, { life: 0.4, reverb: 0.1 }); if (!d) return;
      const t = this.ctx.currentTime;
      this.noiseBurst(d, t, 0.15, 'lowpass', 300, 1, 1.0, 0.003);
      this.tone(d, t, 0.18, 'sine', 90, 45, 0.7);
    },
    knife(hit) {
      const d = this.out(null, 0.7, { life: 0.4, reverb: 0.2 }); if (!d) return;
      const t = this.ctx.currentTime;
      const f = this.noiseBurst(d, t, 0.16, 'bandpass', 1500, 2, 0.6, 0.03);
      f.frequency.exponentialRampToValueAtTime(5000, t + 0.15);
      if (hit) { this.noiseBurst(d, t + 0.1, 0.1, 'lowpass', 450, 1, 1.0, 0.002); this.tone(d, t + 0.1, 0.1, 'sine', 110, 55, 0.5); }
    },
    // Shared human recordings are decoded once and spatialized for each enemy.
    makeVoiceBank() {
      this.preparePlayerVoice();if(!this.playerVoiceBank)return;
      const b=this.playerVoiceBank;
      if (!this.lastBreathBank) this.lastBreathBank = b.hurt.map(original => {
        const data = original.getChannelData(0), rate = original.sampleRate;
        let start = 0; while (start < data.length - 1 && Math.abs(data[start]) < .018) start++;
        start = Math.max(0, start - Math.floor(rate * .012));
        const n = Math.min(data.length - start, Math.floor(rate * .42));
        const buffer = this.newBuffer(n, rate), samples = buffer.getChannelData(0);
        for (let i = 0; i < n; i++) samples[i] = data[start + i] * Math.min(1, i / (rate * .012), (n - 1 - i) / (rate * .09));
        return buffer;
      });
      this.voiceBank={hurt:b.hurt,pain:b.hurt,agony:b.death,death:b.death,lastBreath:this.lastBreathBank,moan:b.hurt,grunt:b.hurt};
      this.enemyVoiceProfiles=ENEMY_VOICE_PROFILES;
      this.enemyVoiceState ||= new Map();this.enemyVoiceActive ||= new Set();
    },
    stopEnemyVoices(){
      for(const src of this.enemyVoiceActive||[]){try{src.stop();src.disconnect();}catch(_){}}
      this.enemyVoiceActive?.clear();this.enemyVoiceState?.clear();this.followingVoices?.clear();
    },
    deathVoice(pos, pitch, actorId, follow, cause = 'body') {
      // Stop an unfinished cry even when this death is silent.
      const state = this.enemyVoiceState?.get(actorId);
      if (state?.source) {
        try { state.source.stop(); state.source.disconnect(); } catch (_) {}
        for (const item of this.followingVoices || []) if (item.source === state.source) this.followingVoices.delete(item);
        this.enemyVoiceActive?.delete(state.source); state.source = null; state.until = 0;
      }
      if (!this.ok || !pos || cause === 'head') return null;
      const subdued = cause === 'neck' || cause === 'bleed';
      if (Math.random() < (subdued ? .75 : .45)) return null;
      return this.voice(pos, 'lastBreath', pitch, subdued ? .38 : .62, actorId, follow);
    },
    voice(pos,type,pitch,vol,actorId,follow){
      if(!this.ok)return;this.makeVoiceBank();
      const bank=this.voiceBank?.[type];if(!bank?.length)return;
      const key=actorId===undefined?'generic':actorId,now=this.ctx.currentTime;
      const state=this.enemyVoiceState.get(key)||{index:-1,until:0,source:null};
      const terminal = type === 'death' || type === 'lastBreath';
      if(!terminal&&now<state.until)return;
      if(state.source&&terminal){try{state.source.stop();state.source.disconnect();}catch(_){}this.enemyVoiceActive.delete(state.source);}
      if(this.enemyVoiceActive.size>=6)return;
      const actorNumber=typeof actorId==='number'?actorId:0;
      const profile=ENEMY_VOICE_PROFILES[((actorNumber%10)+10)%10];
      let index=state.index<0?actorNumber%bank.length:Math.floor(Math.random()*bank.length);
      if(bank.length>1&&index===state.index)index=(index+1)%bank.length;
      const buf=bank[index],rate=Math.max(.8,Math.min(1.22,profile.rate*(1+((pitch||1)-1)*.04)));
      const loud={hurt:.85,pain:1,agony:1,death:.85,moan:.4,grunt:.7}[type]||.8;
      const d=this.out(pos,(vol===undefined?1:vol)*loud,{life:buf.duration/rate+.1,reverb:.11,ref:1.6,rolloff:1.1,follow});if(!d)return;
      const src=this.ctx.createBufferSource();src.buffer=buf;src.playbackRate.value=rate;
      const eq=this.ctx.createBiquadFilter();eq.type='peaking';eq.frequency.value=profile.hz;eq.Q.value=.8;eq.gain.value=profile.eq;
      const top=this.ctx.createBiquadFilter();top.type='lowpass';top.frequency.value=profile.top;
      src.connect(eq);eq.connect(top);top.connect(d);src.start();
      if(d.followItem)d.followItem.source=src;
      state.index=index;state.until=now+buf.duration/rate+.1;state.source=src;this.enemyVoiceState.set(key,state);this.enemyVoiceActive.add(src);
      src.onended=()=>{src.disconnect();eq.disconnect();top.disconnect();this.enemyVoiceActive.delete(src);if(d.followItem)this.followingVoices?.delete(d.followItem);if(state.source===src)state.source=null;};
      return src;
    },
    jingle(win) {
      const d = this.out(null, 0.35, { life: 2.5, reverb: 0.8, important: true }); if (!d) return;
      const t = this.ctx.currentTime;
      const notes = win ? [392, 523, 659, 784] : [330, 277, 220, 165];
      notes.forEach((f, i) => this.tone(d, t + i * 0.16, 0.5, 'triangle', f, f * 0.995, 0.6));
    },
  };
})();

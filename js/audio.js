// ===== 音（すべてWeb Audio APIで合成。外部音源は未使用） =====
'use strict';
(function () {
  const G = window.G;
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
      this.master.connect(comp); comp.connect(c.destination);
      // 室内の残響（生成したインパルス応答）
      this.reverb = c.createConvolver();
      this.reverb.buffer = this.makeImpulse(1.1, 2.6);
      this.reverbSend = c.createGain(); this.reverbSend.gain.value = 0.32;
      this.reverbSend.connect(this.reverb); this.reverb.connect(this.master);
      this.noise = this.makeNoise(2);
      this.ok = true;
      this.prepare();
    },
    // 音声の器（再生前でも作れる方法を優先。ページを開いた直後の空き時間に声と足音を作っておく）
    newBuffer(n, SR) {
      try { return new AudioBuffer({ length: n, sampleRate: SR, numberOfChannels: 1 }); } catch (e) { }
      if (!this.ctx) this.init();
      return this.ctx.createBuffer(1, n, SR);
    },
    prepare() {
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
        if (occluded) {
          g.gain.value = gain * 0.42;
          const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 850; lp.Q.value = 0.5;
          g.connect(lp); last = lp;
        }
        const p = c.createPanner();
        p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
        p.refDistance = opts.ref || 1.5; p.rolloffFactor = opts.rolloff || 1.1; p.maxDistance = 200;
        if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
        else p.setPosition(pos.x, pos.y, pos.z);
        last.connect(p); last = p;
      }
      last.connect(this.master);
      if (opts.reverb !== 0) {
        const s = c.createGain(); s.gain.value = opts.reverb || 0.6; last.connect(s); s.connect(this.reverbSend);
      }
      this.voices++;
      const life = opts.life || 1.2;
      setTimeout(() => { this.voices--; try { g.disconnect(); } catch (e) { } }, life * 1000 + 200);
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
      if (kind === 'spoon') {   // レバーが飛ぶ
        this.tone(d, t, 0.08, 'triangle', 3200, 1800, 0.25);
        this.noiseBurst(d, t, 0.03, 'bandpass', 5000, 6, 0.4, 0.001);
      }
      if (kind === 'release') {
        this.noiseBurst(d, t, 0.05, 'bandpass', 3400, 5, 1.0, 0.001);
        this.tone(d, t, 0.06, 'square', 900, 400, 0.12);
      }
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
    footstep(pos, loud, isPlayer, kind) {
      if (!this.ok) return;
      if (!this.stepBank) { try { this.makeStepBank(); } catch (e) { return; } }
      const bank = this.stepBank[kind || 'walk'] || this.stepBank.walk;
      const d = this.out(isPlayer ? null : pos, loud * (isPlayer ? 0.2 : 1.0) * this.stepVol, { life: 0.7, reverb: 0.3, ref: 1.2, rolloff: 1.2 });
      if (!d) return;
      // 同じ音が続かないよう選び、高さと強さを毎回わずかに変える
      let idx = Math.floor(Math.random() * bank.length); if (idx === this._lastStep) idx = (idx + 1) % bank.length; this._lastStep = idx;
      const src = this.ctx.createBufferSource(); src.buffer = bank[idx];
      src.playbackRate.value = 0.92 + Math.random() * 0.16;
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
    // ---- 人の声（うめき・痛み・断末魔） ----
    // 音声合成の研究で使われる「声帯の音源＋声道の共鳴」方式で、1サンプルずつ計算して作る。
    //  ・声帯：開いて閉じる息の流れの波形（毎周期の長さと強さにわずかな揺らぎ＝人の声の生々しさ）
    //  ・息：声帯が開いている間に混ざるかすれた息の音、語頭の「h」、語尾の吐く息
    //  ・声道：口の形で決まる5つの共鳴（母音）を時間とともに変化させる
    //  ・語尾：声が低く途切れ途切れになる「かすれ（ボーカルフライ）」
    // 声の種類ごとに高さや声道の長さを変えた数パターンを起動時に作っておき、敵ごとに使い分ける。
    makeVoiceBank(incremental) {
      if (this.voiceBank && !this._voiceTodo) return;
      if (this._voiceTodo) { while (this._voiceTodo.length) this._voiceTodo.shift()(); this._voiceTodo = null; return; }
      const SR = 24000;
      const V = { // 母音の共鳴周波数 F1〜F3（F4・F5 は固定）
        a: [780, 1200, 2500], ah: [650, 1150, 2400], o: [520, 880, 2420], u: [330, 850, 2250], e: [520, 1750, 2500], m: [260, 950, 2200], ng: [300, 1100, 2350],
      };
      const lerp = (x, y, k) => x + (y - x) * k;
      const track = (keys, t) => { // [[時刻0..1, 値]...] の折れ線
        if (t <= keys[0][0]) return keys[0][1];
        for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const k = (t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]); return Array.isArray(keys[i][1]) ? keys[i][1].map((v, j) => lerp(keys[i - 1][1][j], v, k)) : lerp(keys[i - 1][1], keys[i][1], k); }
        return keys[keys.length - 1][1];
      };
      const synth = (P) => {
        const n = Math.floor(P.dur * SR), out = new Float32Array(n);
        let phase = 0, period = 1, jitterK = 1, shimK = 1, prevG = 0;
        const res = [0, 0, 0, 0, 0].map(() => ({ y1: 0, y2: 0, A: 0, B: 0, C: 0 }));
        const setRes = (r, F, BW) => { const T = 1 / SR; r.C = -Math.exp(-2 * Math.PI * BW * T); r.B = 2 * Math.exp(-Math.PI * BW * T) * Math.cos(2 * Math.PI * F * T); r.A = 1 - r.B - r.C; };
        let nz = 0, nzLP = 0, breathLP = 0, hp = 0, hpPrev = 0;
        for (let i = 0; i < n; i++) {
          const t = i / n;
          if ((i & 15) === 0) { // 16サンプルごとに声道の形を更新
            const f = track(P.vowel, t).map(v => v * P.tract);
            const bwK = P.bwK || 1;
            setRes(res[0], f[0], 90 * bwK); setRes(res[1], f[1], 110 * bwK); setRes(res[2], f[2], 170 * bwK);
            setRes(res[3], 3350 * P.tract, 250); setRes(res[4], 3800 * P.tract, 300);
          }
          // 声帯の周期（高さ）＋ゆっくりした震え＋語尾のかすれ
          let f0 = track(P.f0, t) * P.pitch * (1 + Math.sin(i / SR * 2 * Math.PI * (P.tremHz || 6)) * (P.trem || 0));
          const creak = P.creakFrom !== undefined && t > P.creakFrom ? (t - P.creakFrom) / (1 - P.creakFrom) : 0;
          if (creak > 0) f0 *= 1 - creak * 0.55;
          phase += f0 / SR * jitterK;
          if (phase >= 1) {
            phase -= 1;
            jitterK = 1 + (Math.random() - 0.5) * 2 * (P.jitter + creak * 0.25);
            shimK = 1 - Math.random() * (P.shimmer + creak * 0.6);
            if (creak > 0.3 && Math.random() < creak * 0.5) shimK *= 0.15; // 途切れ途切れの脈
            this._alt = !this._alt;
            if (P.growl && this._alt) shimK *= 1 - P.growl;                // うなり（1回おきに弱い振動）
          }
          // 声帯から出る息の流れ（ローゼンバーグ波形）。その変化量が口から出る音の元になる
          const Tp = 0.42, Tn = 0.14;
          const g = phase < Tp ? 0.5 * (1 - Math.cos(Math.PI * phase / Tp)) : phase < Tp + Tn ? Math.cos(Math.PI * (phase - Tp) / (2 * Tn)) : 0;
          let src = (g - prevG) * shimK * 18; prevG = g;
          // 息の混ざり：声帯が開いている間に強くなる
          nz = Math.random() * 2 - 1; nzLP += (nz - nzLP) * 0.55;
          const breathy = track(P.breath, t);
          src += (nz - nzLP) * breathy * (0.35 + g * 0.9) * 0.9;
          const amp = track(P.amp, t);
          // 声道の共鳴（直列）
          let x = src * amp;
          for (const r of res) { const y = r.A * x + r.B * r.y1 + r.C * r.y2; r.y2 = r.y1; r.y1 = y; x = y; }
          // 口を閉じた音（m など）は高い音を弱める
          const closed = P.closed ? track(P.closed, t) : 0;
          if (closed > 0) { breathLP += (x - breathLP) * (1 - closed * 0.92); x = breathLP; }
          // 語頭の「h」と語尾の吐く息（声のない息の音）
          const aspir = P.aspir ? track(P.aspir, t) : 0;
          if (aspir > 0) x += (nz - nzLP) * aspir * 0.25;
          // 低すぎる音を切る
          hp = 0.995 * (hp + x - hpPrev); hpPrev = x;
          out[i] = hp;
        }
        // 音量をそろえる
        let peak = 1e-6; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
        for (let i = 0; i < n; i++) out[i] *= 0.9 / peak * (P.gain || 1);
        if (P.raw) return out;
        const buf = this.newBuffer(n, SR); buf.getChannelData(0).set(out);
        return buf;
      };
      // いくつかの声の段階を、短く重ねながらつなげて1つの声にする
      const compose = (segs) => {
        const fade = Math.floor(0.012 * SR);
        let total = 0; const parts = segs.map(s => { if (s.silence) { const z = new Float32Array(Math.floor(s.silence * SR)); total += z.length; return z; } const r = synth(Object.assign({ raw: true }, s)); total += r.length - fade; return r; });
        const out = new Float32Array(total + fade + 8); let pos = 0;
        for (const p of parts) {
          for (let i = 0; i < p.length; i++) { const k = i < fade ? i / fade : 1; out[pos + i] += p[i] * k; }
          pos += Math.max(0, p.length - fade);
        }
        let peak = 1e-6; for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
        for (let i = 0; i < out.length; i++) out[i] *= 0.9 / peak;
        const buf = this.newBuffer(out.length, SR); buf.getChannelData(0).set(out);
        return buf;
      };
      // 段階の部品
      const gasp = (p, tr, dur, g) => ({ dur, pitch: p, tract: tr, jitter: 0.02, shimmer: 0.1, f0: [[0, 140], [1, 150]], vowel: [[0, V.ah], [1, V.a]],
        amp: [[0, 0], [0.3, 0.06], [1, 0.02]], breath: [[0, 0.9], [1, 0.9]], aspir: [[0, 0], [0.25, 1.6], [0.8, 2.2], [1, 0]], gain: g || 0.55 });
      const cry = (p, tr, dur, g, hi) => ({ dur, pitch: p, tract: tr, jitter: 0.06, shimmer: 0.38, trem: 0.025, tremHz: 6, growl: hi ? 0.5 : 0.42,
        f0: [[0, 118], [0.2, 145 * (hi ? 1.05 : 1)], [0.6, 138 * (hi ? 1.04 : 1)], [1, 98]],
        vowel: [[0, V.ah], [0.5, V.ah], [0.8, V.o], [1, V.o]], amp: [[0, 0], [0.06, 1], [0.45, 0.9], [0.6, 0.6], [0.7, 0.95], [0.9, 0.5], [1, 0]],
        breath: [[0, 0.5], [0.6, 0.45], [1, 0.75]], creakFrom: 0.82, aspir: [[0, 0.2], [0.05, 0], [0.9, 0.2], [1, 0.6]], gain: g || 1 });
      const ugh = (p, tr, dur, g) => ({ dur, pitch: p, tract: tr, jitter: 0.05, shimmer: 0.38, growl: 0.5, f0: [[0, 118], [0.3, 104], [1, 72]], bwK: 1.2,
        vowel: [[0, V.ah], [0.5, V.o], [1, V.u]], amp: [[0, 0], [0.05, 1], [0.5, 0.7], [1, 0]], breath: [[0, 0.45], [1, 0.8]],
        closed: [[0, 0.2], [0.6, 0.45], [1, 0.7]], creakFrom: 0.35, aspir: [[0, 0.3], [0.05, 0], [0.8, 0.2], [1, 0.6]], gain: g || 0.85 });
      const sob = (p, tr, dur, g) => ({ dur, pitch: p, tract: tr, jitter: 0.05, shimmer: 0.35, trem: 0.02, tremHz: 4, growl: 0.45, f0: [[0, 108], [0.4, 114], [1, 82]], bwK: 1.3,
        vowel: [[0, V.u], [0.5, V.ng], [1, V.m]], amp: [[0, 0], [0.12, 0.85], [0.5, 1], [0.8, 0.6], [1, 0]], breath: [[0, 0.55], [1, 0.75]],
        closed: [[0, 0.5], [0.5, 0.6], [1, 0.8]], creakFrom: 0.6, aspir: [[0, 0.3], [0.9, 0.3], [1, 0.7]], gain: g || 0.7 });
      this._voiceParts = { gasp, cry, ugh, sob, compose };
      const T = {
        // 自分の被弾：一瞬息が詰まる「うっ」。短く、口はほぼ閉じたまま
        grunt: (p, tr) => ({ dur: 0.17, pitch: p, tract: tr, jitter: 0.02, shimmer: 0.15, f0: [[0, 128], [0.4, 122], [1, 104]], bwK: 1.2,
          vowel: [[0, V.u], [0.5, V.u], [1, V.ng]], amp: [[0, 0], [0.06, 1], [0.6, 0.8], [0.85, 0.25], [1, 0]], breath: [[0, 0.25], [1, 0.3]],
          closed: [[0, 0.55], [0.5, 0.45], [1, 0.7]], aspir: [[0, 0.5], [0.05, 0], [0.9, 0], [1, 0.15]] }),
        // 短いうめき「ぐっ」：力んだ声、すぐ途切れる
        hurt: (p, tr) => ({ dur: 0.32, pitch: p, tract: tr, jitter: 0.04, shimmer: 0.3, growl: 0.4, f0: [[0, 135], [0.25, 128], [1, 92]],
          vowel: [[0, V.ah], [0.6, V.ah], [1, V.ng]], amp: [[0, 0], [0.04, 1], [0.5, 0.75], [1, 0]], breath: [[0, 0.3], [1, 0.45]], creakFrom: 0.55,
          aspir: [[0, 0.6], [0.06, 0], [0.85, 0], [1, 0.3]] }),
        // 苦痛の声「あぁ…ぐぅ」：息を吸ってから絞り出す、震える
        pain: (p, tr) => ({ dur: 1.05, pitch: p, tract: tr, jitter: 0.035, shimmer: 0.2, trem: 0.035, tremHz: 7, f0: [[0, 150], [0.2, 182], [0.55, 168], [1, 105]],
          vowel: [[0, V.a], [0.45, V.a], [0.75, V.o], [1, V.u]], amp: [[0, 0], [0.07, 0.4], [0.15, 1], [0.6, 0.85], [0.9, 0.35], [1, 0]], breath: [[0, 0.5], [0.4, 0.35], [1, 0.6]],
          creakFrom: 0.72, aspir: [[0, 0.9], [0.08, 0.1], [0.9, 0.1], [1, 0.5]] }),
        // 倒れるときの声「うっ…」：力が抜けて低くなる
        death: (p, tr) => ({ dur: 0.8, pitch: p, tract: tr, jitter: 0.05, shimmer: 0.35, growl: 0.45, f0: [[0, 118], [0.3, 108], [1, 70]],
          vowel: [[0, V.ah], [0.5, V.o], [1, V.u]], amp: [[0, 0], [0.04, 1], [0.35, 0.7], [1, 0]], breath: [[0, 0.35], [1, 0.8]],
          creakFrom: 0.35, aspir: [[0, 0.5], [0.05, 0], [0.7, 0.1], [1, 0.6]] }),
        // 瀕死のうめき「んん…」：口を閉じたこもった声、弱い息
        moan: (p, tr) => ({ dur: 1.55, pitch: p, tract: tr, jitter: 0.03, shimmer: 0.22, trem: 0.05, tremHz: 4.5, f0: [[0, 118], [0.35, 126], [1, 92]], bwK: 1.3,
          vowel: [[0, V.m], [0.4, V.ng], [0.7, V.u], [1, V.m]], amp: [[0, 0], [0.12, 0.8], [0.5, 1], [0.85, 0.5], [1, 0]], breath: [[0, 0.5], [1, 0.75]],
          closed: [[0, 0.8], [0.35, 0.55], [0.7, 0.35], [1, 0.85]], creakFrom: 0.68, aspir: [[0, 0.2], [0.9, 0.1], [1, 0.5]] }),
      };
      // 声の高さ・声道の長さ（体格）を変えた4人分
      const people = [[0.82, 1.08], [0.9, 1.04], [0.97, 1.0], [1.04, 0.97]];
      this.voiceBank = {};
      // 作る作業を種類ごとの小さな仕事に分ける
      const todo = [];
      for (const k in T) todo.push(() => { this.voiceBank[k] = people.map(([p, tr]) => synth(T[k](p, tr))); });
      // 苦痛の声（段階をつないで作る）
      // pain：息を吸い込む → 絞り出す叫び → 低く詰まった声
      todo.push(() => { this.voiceBank.pain = people.map(([p, tr]) => compose([gasp(p, tr, 0.16, 0.5), cry(p, tr, 0.62), ugh(p, tr, 0.38)])); });
      // agony：重傷。吸い込み → 震える長い叫び → 声が途切れる → 苦しい吸い込み → 詰まった声 → 震える息
      todo.push(() => { this.voiceBank.agony = people.map(([p, tr]) => compose([gasp(p, tr, 0.22, 0.6), cry(p, tr, 0.95, 1, true), { silence: 0.05 }, gasp(p, tr, 0.2, 0.55), ugh(p, tr, 0.45, 0.9), sob(p, tr, 0.6, 0.65)])); });
      // moan：瀕死。すすり泣くような震える声 → 苦しげな吸い込み → 弱く詰まった声
      todo.push(() => { this.voiceBank.moan = people.map(([p, tr]) => compose([sob(p, tr, 0.85, 0.7), gasp(p, tr, 0.3, 0.5), ugh(p, tr * 1.02, 0.42, 0.6)])); });
      if (!incremental) { for (const f of todo) f(); return; }
      this._voiceTodo = todo;
      const idle = window.requestIdleCallback || ((f) => setTimeout(f, 30));
      const step = () => { if (!this._voiceTodo) return; const f = this._voiceTodo.shift(); if (f) f(); if (this._voiceTodo && this._voiceTodo.length) idle(step); else this._voiceTodo = null; };
      idle(step);
    },
    voice(pos, type, pitch, vol) {
      if (!this.ok) return;
      if (!this.voiceBank) { try { this.makeVoiceBank(true); } catch (e) { console.warn('声を作れません', e); } return; }   // まだ準備中なら今回は鳴らさない
      const bank = this.voiceBank[type]; if (!bank) return;
      const idx = Math.max(0, Math.min(bank.length - 1, Math.round(((pitch || 1) - 0.85) / 0.3 * (bank.length - 1))));
      const buf = bank[idx];
      const loud = { hurt: 1.0, pain: 1.05, agony: 1.1, death: 0.85, moan: 0.55, grunt: 0.8 }[type];
      const d = this.out(pos, (vol || 1) * loud * 0.8, { life: buf.duration + 0.4, reverb: 0.45, ref: 1.6, rolloff: 1.1, important: type !== 'moan' });
      if (!d) return;
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      src.playbackRate.value = 0.96 + Math.random() * 0.08;   // 毎回わずかに違う
      src.connect(d); src.start();
    },
    jingle(win) {
      const d = this.out(null, 0.35, { life: 2.5, reverb: 0.8, important: true }); if (!d) return;
      const t = this.ctx.currentTime;
      const notes = win ? [392, 523, 659, 784] : [330, 277, 220, 165];
      notes.forEach((f, i) => this.tone(d, t + i * 0.16, 0.5, 'triangle', f, f * 0.995, 0.6));
    },
  };
})();

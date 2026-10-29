// ===== エフェクト（弾痕・粉塵・曳光・発砲の光）。すべて上限付きで再利用 =====
'use strict';
(function () {
  const G = window.G;
  // 血痕の模様（不規則な形と飛沫）
  function splatTexture(seed) {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
    let s = 11 + seed * 97; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    x.translate(S / 2, S / 2);
    const col = (a) => `rgba(${95 + r() * 30 | 0},${8 + r() * 8 | 0},${6 + r() * 6 | 0},${a})`;
    x.fillStyle = col(0.92); x.beginPath();
    for (let a = 0; a < 6.3; a += 0.35) { const rr = 18 + r() * 16; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    x.fill();
    for (let i = 0; i < 26; i++) { const a = r() * 6.28, d = 20 + r() * 38, rr = 1 + r() * 5; x.fillStyle = col(0.85); x.beginPath(); x.arc(Math.cos(a) * d, Math.sin(a) * d, rr, 0, 7); x.fill(); }
    for (let i = 0; i < 6; i++) { const a = r() * 6.28; x.strokeStyle = col(0.7); x.lineWidth = 2 + r() * 3; x.beginPath(); x.moveTo(Math.cos(a) * 20, Math.sin(a) * 20); x.lineTo(Math.cos(a) * (40 + r() * 20), Math.sin(a) * (40 + r() * 20)); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  function poolTexture() {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
    let s = 77; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    x.translate(S / 2, S / 2);
    const g = x.createRadialGradient(0, 0, 10, 0, 0, 120);
    g.addColorStop(0, 'rgba(60,4,3,0.95)'); g.addColorStop(0.7, 'rgba(85,8,6,0.9)'); g.addColorStop(1, 'rgba(90,10,8,0.85)');
    x.fillStyle = g; x.beginPath();
    for (let a = 0; a < 6.3; a += 0.2) { const rr = 80 + r() * 38; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    x.fill();
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  const FX = G.Effects = {
    MAX_DECALS: 80, MAX_PARTICLES: 170, MAX_TRACERS: 16, MAX_BLOOD: 60, MAX_POOLS: 14,
    init(scene) {
      this.scene = scene;
      const T = G.World.TEX;
      this.decalGeo = new THREE.PlaneGeometry(0.08, 0.08);
      this.decalMat = new THREE.MeshStandardMaterial({ map: T.hole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 1 });
      this.decals = []; this.decalIdx = 0;
      this.blood = []; this.bloodIdx = 0; this.pools = [];
      this.bloodTex = [0, 1, 2].map(i => splatTexture(i));
      this.poolTex = poolTexture();
      this.bloodMats = this.bloodTex.map(t => new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, roughness: 0.35, metalness: 0.05 }));
      this.poolMat = new THREE.MeshStandardMaterial({ map: this.poolTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, roughness: 0.18, metalness: 0.1 });
      this.particles = [];
      for (let i = 0; i < this.MAX_PARTICLES; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dust, transparent: true, depthWrite: false }));
        s.visible = false; scene.add(s);
        this.particles.push({ s, life: 0, max: 1, vel: new THREE.Vector3(), grow: 0, spark: false });
      }
      this.pIdx = 0;
      this.tracers = [];
      for (let i = 0; i < this.MAX_TRACERS; i++) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1], 3));
        const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
        l.visible = false; l.frustumCulled = false; scene.add(l);
        this.tracers.push({ l, life: 0 });
      }
      this.tIdx = 0;
      // 光源の数は固定（シェーダー再コンパイルを避けるため強さだけ変える）
      this.playerLight = new THREE.PointLight(0xffb050, 0, 7, 2); scene.add(this.playerLight);
      this.boomLight = new THREE.PointLight(0xff9a40, 0, 16, 2); scene.add(this.boomLight); this.boomT = 0;
      // 爆発の焦げ跡
      { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
        const g = x.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, 'rgba(10,8,6,0.95)'); g.addColorStop(0.5, 'rgba(25,20,15,0.7)'); g.addColorStop(1, 'rgba(30,25,20,0)');
        x.fillStyle = g; x.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, d = 20 + Math.random() * 40; x.fillStyle = 'rgba(15,12,10,0.6)'; x.fillRect(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2 + Math.random() * 4, 2 + Math.random() * 4); }
        const t = new THREE.CanvasTexture(c);
        this.scorchMat = new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, roughness: 1 }); }
      this.scorches = [];
      this.enemyLight = new THREE.PointLight(0xffb050, 0, 7, 2); scene.add(this.enemyLight);
      this.plT = 0; this.elT = 0;
    },
    reset() {
      for (const d of this.decals) this.scene.remove(d);
      this.decals = []; this.decalIdx = 0;
      for (const d of this.blood) this.scene.remove(d);
      for (const p of this.pools) { this.scene.remove(p.m); p.m.geometry.dispose(); }
      this.blood = []; this.bloodIdx = 0; this.pools = [];
      for (const p of this.particles) { p.life = 0; p.s.visible = false; }
      for (const t of this.tracers) { t.life = 0; t.l.visible = false; }
      this.playerLight.intensity = 0; this.enemyLight.intensity = 0; this.boomLight.intensity = 0;
      for (const s of this.scorches) { this.scene.remove(s); s.geometry.dispose(); } this.scorches = [];
    },
    // h: レイキャスト結果（位置と法線）
    impact(h, flesh, mat) {
      const wood = mat === 'wood';
      const n = new THREE.Vector3(h.nx, h.ny, h.nz);
      const p = new THREE.Vector3(h.x, h.y, h.z);
      if (!flesh) {
        let m;
        if (this.decals.length < this.MAX_DECALS) { m = new THREE.Mesh(this.decalGeo, this.decalMat); this.scene.add(m); this.decals.push(m); }
        else { m = this.decals[this.decalIdx]; this.decalIdx = (this.decalIdx + 1) % this.MAX_DECALS; }
        m.position.copy(p).addScaledVector(n, 0.004);
        m.lookAt(p.clone().add(n));
        m.rotateZ(Math.random() * 6.28);
        const s = 0.7 + Math.random() * 0.6; m.scale.set(s, s, 1);
        G.Audio.impact(p);
      }
      // 粉塵と火花
      const count = flesh ? 4 : 5;
      for (let i = 0; i < count; i++) {
        const v = n.clone().multiplyScalar(0.6 + Math.random() * 1.2).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 0.8, (Math.random() - 0.5) * 1.2));
        this.spawn(p, v, flesh ? 0x5a1d18 : wood ? 0x8a6a42 : 0xbfb8aa, 0.35 + Math.random() * 0.3, wood ? 0.03 : 0.05, wood ? 0.1 : 0.25, false, wood ? 6 : undefined);
      }
      if (!flesh && !wood && Math.random() < 0.6) for (let i = 0; i < 3; i++) {
        const v = n.clone().multiplyScalar(2 + Math.random() * 2).add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3));
        this.spawn(p, v, 0xffc070, 0.12, 0.02, 0, true);
      }
    },
    // ---- 流血表現（設定でオン／控えめ／オフ） ----
    // p: 命中点, dir: 弾の進む方向
    bloodHit(p, dir, strong) {
      const gore = G.Game.gore;
      if (gore === 'off') { this.impact({ x: p.x, y: p.y, z: p.z, nx: -dir.x, ny: -dir.y, nz: -dir.z }, true); return; }
      const low = gore === 'low';
      // 弾の抜ける方向へ霧状の血しぶきと滴
      const n = (low ? 4 : 9) + (strong ? 4 : 0);
      for (let i = 0; i < n; i++) {
        const v = dir.clone().multiplyScalar(0.8 + Math.random() * 2.2).add(new THREE.Vector3((Math.random() - 0.5) * 1.4, Math.random() * 0.9, (Math.random() - 0.5) * 1.4));
        const mist = i % 3 !== 0;
        this.spawn(p, v, mist ? 0x7a100c : 0x4a0806, mist ? 0.3 + Math.random() * 0.25 : 0.6, mist ? 0.06 : 0.025, mist ? 0.28 : 0, false, mist ? 1.2 : 7);
      }
      // 背後の壁や床への血痕
      const reach = low ? 1.3 : 2.4;
      const h = G.World.raycast(p.x, p.y, p.z, dir.x, dir.y, dir.z, reach);
      if (h) this.bloodDecal(h, (low ? 0.18 : 0.32) * (1 - h.t / reach * 0.5) * (strong ? 1.3 : 1));
      // 足元へ落ちる滴
      if (!low || Math.random() < 0.5) {
        const down = G.World.raycast(p.x + dir.x * 0.3, p.y, p.z + dir.z * 0.3, 0, -1, 0, 3);
        if (down) this.bloodDecal(down, 0.08 + Math.random() * 0.1);
      }
    },
    bloodDecal(h, size) {
      let m;
      const mat = this.bloodMats[(Math.random() * this.bloodMats.length) | 0];
      if (this.blood.length < this.MAX_BLOOD) { m = new THREE.Mesh(this.decalGeo, mat); this.scene.add(m); this.blood.push(m); }
      else { m = this.blood[this.bloodIdx]; m.material = mat; this.bloodIdx = (this.bloodIdx + 1) % this.MAX_BLOOD; }
      const n = new THREE.Vector3(h.nx, h.ny, h.nz), p = new THREE.Vector3(h.x, h.y, h.z);
      m.position.copy(p).addScaledVector(n, 0.005);
      m.lookAt(p.clone().add(n)); m.rotateZ(Math.random() * 6.28);
      const s = size / 0.08; m.scale.set(s * (0.8 + Math.random() * 0.4), s * (0.8 + Math.random() * 0.4), 1);
    },
    // 倒れた敵の下に広がる血だまり
    bloodPool(pos) {
      const gore = G.Game.gore;
      if (gore === 'off') return;
      if (this.pools.length >= this.MAX_POOLS) { const o = this.pools.shift(); this.scene.remove(o.m); o.m.geometry.dispose(); }
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.poolMat);
      m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6.28;
      m.position.set(pos.x + (Math.random() - 0.5) * 0.3, 0.006 + this.pools.length * 0.0004, pos.z + (Math.random() - 0.5) * 0.3);
      m.scale.set(0.01, 0.01, 1); m.receiveShadow = true;
      this.scene.add(m);
      this.pools.push({ m, t: -0.6, max: gore === 'low' ? 0.7 : 1.25 });
    },
    spawn(p, vel, color, life, size, grow, spark, gravity) {
      const q = this.particles[this.pIdx]; this.pIdx = (this.pIdx + 1) % this.MAX_PARTICLES;
      q.s.position.copy(p); q.vel.copy(vel); q.life = q.max = life; q.grow = grow; q.spark = spark;
      q.s.material.color.setHex(color);
      q.s.material.blending = spark ? THREE.AdditiveBlending : THREE.NormalBlending;
      q.s.scale.set(size, size, 1); q.s.visible = true; q.base = size; q.gravity = gravity;
    },
    tracer(a, b) {
      const t = this.tracers[this.tIdx]; this.tIdx = (this.tIdx + 1) % this.MAX_TRACERS;
      const pos = t.l.geometry.attributes.position;
      // 弾道の一部だけを短く表示
      const d = b.clone().sub(a); const len = d.length();
      const s = a.clone().addScaledVector(d, Math.min(0.3, 1.5 / Math.max(len, 0.01)));
      pos.setXYZ(0, s.x, s.y, s.z); pos.setXYZ(1, b.x, b.y, b.z); pos.needsUpdate = true;
      t.life = 0.06; t.l.visible = true;
    },
    // 爆発：閃光・火の玉・立ちのぼる煙・飛び散る破片と火花・床の焦げ跡
    explosion(c) {
      this.boomLight.position.copy(c).add(new THREE.Vector3(0, 0.6, 0)); this.boomLight.intensity = 9; this.boomT = 0.35;
      const V = (x, y, z) => new THREE.Vector3(x, y, z);
      for (let i = 0; i < 4; i++) this.spawn(c.clone().add(V((Math.random() - 0.5) * 0.4, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4)), V(0, 1.2, 0), 0xffa040, 0.28, 0.6, 2.4, true, 0);
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * 6.28, s = 0.6 + Math.random() * 2.2;
        this.spawn(c.clone().add(V(0, 0.4, 0)), V(Math.cos(a) * s, 0.6 + Math.random() * 1.6, Math.sin(a) * s), 0x3a3632, 2.2 + Math.random() * 1.2, 0.5, 2.8, false, -0.25);
      }
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * 6.28, up = Math.random();
        this.spawn(c.clone().add(V(0, 0.2, 0)), V(Math.cos(a) * (3 + Math.random() * 6), 2 + up * 6, Math.sin(a) * (3 + Math.random() * 6)), i % 3 ? 0xffc070 : 0x6a625a, 0.5 + Math.random() * 0.5, 0.03, 0, i % 3 !== 0, 9.8);
      }
      // 焦げ跡（床に届く場合）
      const h = G.World.raycast(c.x, c.y + 0.1, c.z, 0, -1, 0, 1.5);
      if (h) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), this.scorchMat);
        m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6; m.position.set(h.x, h.y + 0.007, h.z); this.scene.add(m);
        this.scorches.push(m); if (this.scorches.length > 8) { const o = this.scorches.shift(); this.scene.remove(o); o.geometry.dispose(); }
      }
    },
    playerFlash(p) { this.playerLight.position.copy(p); this.playerLight.intensity = 2.6; this.plT = 0.05; },
    enemyFlash(p) { this.enemyLight.position.copy(p); this.enemyLight.intensity = 2.2; this.elT = 0.05; },
    update(dt) {
      for (const q of this.particles) {
        if (q.life <= 0) continue;
        q.life -= dt;
        if (q.life <= 0) { q.s.visible = false; continue; }
        q.vel.y -= (q.gravity !== undefined ? q.gravity : (q.spark ? 9 : 1.2)) * dt; q.vel.multiplyScalar(1 - dt * (q.spark ? 1 : 3));
        q.s.position.addScaledVector(q.vel, dt);
        const k = q.life / q.max;
        q.s.material.opacity = q.spark ? k : k * 0.7;
        const sz = q.base + q.grow * (1 - k); q.s.scale.set(sz, sz, 1);
      }
      for (const p of this.pools) {
        if (p.t >= 4) continue;
        p.t += dt;
        const k = Math.max(0, Math.min(1, p.t / 4)), e = 1 - Math.pow(1 - k, 2.2);
        const s = Math.max(0.01, p.max * e); p.m.scale.set(s, s * 0.85, 1);
      }
      for (const t of this.tracers) { if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.l.visible = false; } }
      if (this.boomT > 0) { this.boomT -= dt; this.boomLight.intensity = Math.max(0, this.boomT / 0.35) * 9; }
      if (this.plT > 0) { this.plT -= dt; if (this.plT <= 0) this.playerLight.intensity = 0; }
      if (this.elT > 0) { this.elT -= dt; if (this.elT <= 0) this.enemyLight.intensity = 0; }
    },
  };
})();

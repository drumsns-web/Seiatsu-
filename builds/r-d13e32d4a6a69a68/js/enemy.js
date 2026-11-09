// ===== 敵AI（知覚・記憶・無線連携・A*経路探索・遮蔽と顔出し・迂回・待ち伏せ・捜索） =====
'use strict';
(function () {
  const G = window.G;
  const W = () => G.World;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

  // ---------------- A* 経路探索（1mグリッド、斜め移動は角を削らない場合のみ） ----------------
  const Path = G.Path = { budget: 0 };
  // threat を渡すと、その位置から見通せるセルを通りにくくする（遮蔽物の陰を選んで進む）
  Path.find = function (sx, sz, tx, tz, threat) {
    const Wd = W().W, Hd = W().H;
    let s = [Math.floor(sx), Math.floor(sz)], t = [Math.floor(tx), Math.floor(tz)];
    if (!W().walkable(s[0], s[1])) s = Path.nearestWalkable(s[0], s[1]) || s;
    if (!W().walkable(t[0], t[1])) { const n = Path.nearestWalkable(t[0], t[1]); if (!n) return null; t = n; }
    const idx = (x, z) => z * Wd + x;
    const g = new Float32Array(Wd * Hd).fill(Infinity), came = new Int32Array(Wd * Hd).fill(-1), closed = new Uint8Array(Wd * Hd);
    const heap = [];
    const push = (i, f) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = k * 2 + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const hfun = (x, z) => { const dx = Math.abs(x - t[0]), dz = Math.abs(z - t[1]); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    const si = idx(s[0], s[1]), ti = idx(t[0], t[1]);
    g[si] = 0; push(si, hfun(s[0], s[1]));
    let exposed = null;
    if (threat) exposed = new Int8Array(Wd * Hd).fill(-1);
    const extra = (x, z, i) => {
      if (!exposed) return 0;
      if (exposed[i] < 0) exposed[i] = W().lineOfSight(threat.x, 1.6, threat.z, x + 0.5, 1.2, z + 0.5) ? 1 : 0;
      return exposed[i] ? 2.5 : 0;
    };
    let iter = 0;
    while (heap.length && iter++ < 9000) {
      const [, ci] = pop();
      if (closed[ci]) continue; closed[ci] = 1;
      if (ci === ti) break;
      const cx = ci % Wd, cz = (ci / Wd) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (!W().walkable(nx, nz)) continue;
        if (dx && dz && (!W().walkable(cx + dx, cz) || !W().walkable(cx, cz + dz))) continue;
        const ni = idx(nx, nz); if (closed[ni]) continue;
        const ng = g[ci] + (dx && dz ? 1.414 : 1) + extra(nx, nz, ni);
        if (ng < g[ni]) { g[ni] = ng; came[ni] = ci; push(ni, ng + hfun(nx, nz)); }
      }
    }
    if (came[ti] === -1 && ti !== si) return null;
    const cells = []; let c = ti;
    while (c !== -1) { cells.push([c % Wd, (c / Wd) | 0]); if (c === si) break; c = came[c]; }
    cells.reverse();
    return cells.map(([x, z]) => V3(x + 0.5, 0, z + 0.5));
  };
  Path.nearestWalkable = function (x, z) {
    for (let r = 1; r < 6; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      if (W().walkable(x + dx, z + dz)) return [x + dx, z + dz];
    }
    return null;
  };
  // 経路の短縮（直進できる点まで飛ばす）
  Path.smooth = function (start, pts) {
    if (!pts || pts.length < 2) return pts;
    const out = []; let cur = start, i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      for (; j > i; j--) if (W().walkLineClear(cur.x, cur.z, pts[j].x, pts[j].z, 0.32)) break;
      out.push(pts[j]); cur = pts[j]; i = j + 1;
    }
    return out;
  };
  // 半径内のランダムな到達可能セル
  Path.randomNear = function (cx, cz, radius, tries) {
    for (let k = 0; k < (tries || 20); k++) {
      const x = Math.floor(cx + rnd(-radius, radius)), z = Math.floor(cz + rnd(-radius, radius));
      if (W().walkable(x, z)) return V3(x + 0.5, 0, z + 0.5);
    }
    return null;
  };

  // ---------------- 遮蔽点（高さ1m以上の障害物に接する床セル） ----------------
  let coverCells = null;
  G.coverInvalidate = () => { coverCells = null; };
  G.getCoverCells = () => getCoverCells();
  function getCoverCells() {
    if (coverCells) return coverCells;
    coverCells = [];
    const w = W();
    for (let z = 0; z < w.H; z++) for (let x = 0; x < w.W; x++) {
      if (!w.walkable(x, z)) continue;
      let ok = false;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const r = w.solidRange(x + dx, z + dz); if (r && r[0] < 0.3 && r[1] >= 1.0) ok = true; }
      if (ok) coverCells.push(V3(x + 0.5, 0, z + 0.5));
    }
    return coverCells;
  }

  // ---------------- 敵 ----------------
  const STATE_JA = { evade: '手りゅう弾から退避', prone: '伏せ', patrol: '巡回', guard: '警戒', suspicious: '不審', investigate: '調査', combat: '交戦', cover: '遮蔽', flank: '迂回', chase: '追跡', hold: '待ち伏せ', search: '捜索', dead: '撃破' };
  const ROLE_JA = { anchor: '守備役', rifleman: '小銃手', flanker: '迂回役', rusher: '突撃役' };
  const MAX_PUSHERS = 2;           // 同時に詰めてくる人数の上限（全員が一斉に突っ込まない）
  const RADIO_RANGE = 26;          // 無線で位置を共有する距離

  // 敵の武器：突撃役はショットガン、それ以外はライフル。ハンドガンは主力武器が使えないときだけ
  const EWEAPON = {
    rifle: { mag: 25, reserve: 75, reload: 2.4, name: 'ライフル' },
    shotgun: { mag: 6, reserve: 18, reload: 3.2, name: 'ショットガン' },
    pistol: { mag: 12, reserve: 24, reload: 1.6, name: 'ハンドガン' },
  };
  G.EWEAPON = EWEAPON;
  const LEG_HITS_TO_DOWN = 3;   // 脚にこれだけ当たると立てなくなる

  class Enemy {
    constructor(id, spawn, role, scene) {
      this.id = id; this.role = role;
      // Finite issued medical supplies; recovery transfers these exact quantities.
      this.med={tq:role==='flanker'?1:0,hemo:role==='anchor'?1:0,band:1,medicine:role==='rifleman'?1:0,stim:0};
      let sx = spawn[0], sz = spawn[1];
      if (!W().walkable(sx, sz)) { const n = Path.nearestWalkable(sx, sz); if (n) [sx, sz] = n; }   // 配置が壁などに重なっていたら近くの床へ
      this.home = V3(sx + 0.5, 0, sz + 0.5);
      G.Doors?.clearSpawn(this.home);
      this.pos = this.home.clone();
      this.patrol = this.makePatrol();
      this.patrolIdx = 0; this.waitT = rnd(0, 2);
      this.yaw = rnd(0, Math.PI * 2); this.lookYaw = this.yaw; this.bodyYaw = this.yaw; this.lookPitch = 0;
      this.watch = this.makeWatchAngles(); this.watchIdx = 0; this.watchT = rnd(1, 3);
      this.hp = 100; this.reloadT = 0; this.switchT = 0;
      this.primary = role === 'rusher' ? 'shotgun' : 'rifle';
      this.arms = { [this.primary]: { ammo: EWEAPON[this.primary].mag, reserve: EWEAPON[this.primary].reserve }, pistol: { ammo: EWEAPON.pistol.mag, reserve: EWEAPON.pistol.reserve } };
      this.weapon = this.primary; this.magSize = EWEAPON[this.primary].mag; this.ammo = this.magSize; this.reloadDur = EWEAPON[this.primary].reload;
      this.state = role === 'anchor' ? 'guard' : 'patrol'; this.stateT = 0;
      this.awareness = 0; this.alertT = 0;
      this.visible = false; this.reaction = 0;
      this.lastSeenPos = null; this.lastSeenT = -999; this.lastSeenVel = V3(0, 0, 0);
      this.heardPos = null; this.heardT = -999;
      this.reportPos = null; this.reportT = -999;   // 味方から無線で受けた位置
      this.suspectPos = null; this.lookTarget = null;
      this.path = null; this.pathIdx = 0; this.goal = null; this.repathT = 0; this.goalKind = ''; this.threatForPath = null;
      this.stuckT = 0; this.lastProgressPos = this.pos.clone(); this.nudge = null;
      this.burst = 3; this.fireCD = rnd(0.2, 0.6); this.shotsAtTarget = 0;
      this.crouch = 0; this.wantCrouch = false;
      this.cover = null; this.retreatCD = 0;
      this.searchLeft = 0; this.searchCenter = null;
      this.flankUsed = false; this.flankDone = false; this.flankTarget = null;
      this.holdT = 0; this.pushT = 0; this.strafe = 0; this.strafeT = 0; this.hurtTime = -99;
      this.radioT = 0; this.lastReportSent = -99;
      this.wounds = { leg: 0, stomach: 0, arm: 0 }; this.limpSide = 1; this.moanT = rnd(4, 8);
      this.legless = null; this.downed = false; this.bleed = 0; this.gunBleed20 = 0;
      this.knifeBleed = 0; this.neckWound = false; this.knifeDripT = 0;
      this.prone = false; this.proneT = 0; this.standUpT = 0; this.lean = 0; this.dodgeT = 0;
      this.voicePitch = rnd(0.85, 1.15);
      this.percT = Math.random() * 0.1;
      this.stepDist = 0; this.speed = 0; this.deadT = 0;
      this.body = G.Humanoid.create({faceVariant:id%6,hairVariant:id%4,gear:['none','helmet','sunglasses','helmet-sunglasses'][id%4]}); G.Bandit.register(this.body,'enemy');scene.add(this.body.root);
      // 倒れたときの音（膝をつく・体が床に当たる・銃が落ちる）
      this.body.onSound = (kind, p) => {
        const at = p ? p.clone() : this.body.hipsWorld.clone();
        if (kind === 'knee') G.Audio.kneeDrop(at); else if (kind === 'fall') {G.Audio.bodyFall(at);G.Enemies.broadcast(at,3.5,'fall',false,this);} else if (kind === 'gun') G.Audio.gunClatter(at);
      };
      this.body.setWeapon(this.primary);
      this.model = { root: this.body.root, flash: this.body.flash, muzzle: this.body.muzzle };
      this.flashT = 0;
      this.debug = { line: null, seen: null, heard: null };
      this.syncModel(0);
    }
    get dead() { return this.state === 'dead'; }
    get pushing() { return !this.dead && (this.state === 'chase' || this.state === 'flank' || (this.state === 'investigate' && this.goalKind === 'report')); }
    eyeY() { return this.body.headWorld.y; }
    eyePos() { const h = this.body.headWorld; return V3(h.x, h.y, h.z); }
    voicePos() {
      if (this.body.missing?.has('head')) return null;
      this.body.root.updateMatrixWorld(true);
      return this.body.bones.head.localToWorld(V3(0, 0.1, 0.01));
    }
    say(type, vol = 1) {
      const at = this.voicePos();
      if (at) G.Audio.voice(at, type, this.voicePitch, vol, this.id, () => this.voicePos());
    }
    // 傷の影響：脚は大きく遅く、腹は前かがみで遅く、瀕死はさらに遅い。腕は狙いだけ鈍る
    mobility() { return (this.wounds.leg ? 0.5 : 1) * (this.wounds.stomach ? 0.72 : 1) * (this.hp < 35 ? 0.75 : 1); }
    get critical() { return this.hp < 35; }
    headCenter() { return this.body.headWorld.clone().setX(this.pos.x).setZ(this.pos.z).add(V3(this.body.headWorld.x - this.pos.x, 0, this.body.headWorld.z - this.pos.z)); }
    get crouchK() { return this.body.st.crouch; }

    // 初期位置の近くで巡回点を作る（実際に歩いて行ける場所だけ）
    makePatrol() {
      const pts = [this.home.clone()];
      for (let k = 0; k < 40 && pts.length < 4; k++) {
        const p = Path.randomNear(this.home.x, this.home.z, 9);
        if (!p || pts.some(q => q.distanceTo(p) < 3.5)) continue;
        const path = Path.find(this.home.x, this.home.z, p.x, p.z);
        if (path && path.length < 16) pts.push(p);
      }
      return pts;
    }
    // 守備役が見張る方向：見通しの長い方向（入口や通路）を選ぶ
    makeWatchAngles() {
      const c = [];
      for (let i = 0; i < 24; i++) {
        const a = i / 24 * Math.PI * 2;
        const h = W().raycast(this.home.x, 1.5, this.home.z, Math.sin(a), 0, Math.cos(a), 40);
        c.push({ a, d: h ? h.t : 40 });
      }
      c.sort((p, q) => q.d - p.d);
      const out = [];
      for (const x of c) { if (out.every(o => Math.abs(angDiff(o, x.a)) > 0.7)) out.push(x.a); if (out.length >= 3) break; }
      return out;
    }

    setState(s) {
      if (this.state === s) return;
      this.state = s; this.stateT = 0; this.path = null; this.goal = null;
      if (s !== 'cover') this.releaseCover();
    }
    releaseCover() { if (this.cover) { G.Enemies.reserved.delete(this.cover.key); this.cover = null; } }

    // ---- 当たり判定：頭は球、体は縦長の箱。アニメーション後の頭の位置を使うので見た目と一致する ----
    rayHit(o, d, maxT) {
      if (this.dead) return null;
      return G.Humanoid.rayParts(this.body, o, d, maxT);
    }

    damage(amount, part, fromPos, side) {
      if (this.dead) return false;
      this.hp = part === 'head' ? 0 : Math.max(part === 'arms' || part === 'legs' ? Math.min(1,this.hp) : 0,this.hp-amount); this.hurtTime = G.time;
      if(amount>0&&part!=='head')this.gunBleed20=Math.min(1.6,this.gunBleed20+(part==='arms'||part==='legs'?.35:.18));
      if (part === 'legs') { this.wounds.leg++; if (side) this.limpSide = side; }
      if (part === 'stomach') this.wounds.stomach++;
      if (part === 'arms') this.wounds.arm++;
      // 撃たれた方向を体の向きに対して求め、よろける
      const dx = this.pos.x - fromPos.x, dz = this.pos.z - fromPos.z, l = Math.hypot(dx, dz) || 1;
      const cy = Math.cos(this.bodyYaw), sy = Math.sin(this.bodyYaw);
      const lx = (dx * cy - dz * sy) / l, lz = (dx * sy + dz * cy) / l;
      this.body.hit(lx, lz, part === 'head');
      this.alertT = 40; this.heardPos = fromPos.clone(); this.heardT = G.time;
      if (!this.visible) this.suspectPos = fromPos.clone();
      this.awareness = Math.max(this.awareness, 0.75);
      if (this.hp <= 0) { this.die(lz, lx, part); return true; }
      if (this.neckWound) return false;
      // 脚に何発も当たると、立てなくなる（這うことしかできない）
      if (!this.downed && this.wounds.leg >= LEG_HITS_TO_DOWN) this.goDown();
      // 痛みの声と、とっさの回避（横へ跳ぶ／しゃがむ）
      // 脚・腹は苦痛の声。体力が少ないほど長く苦しそうに。腕や軽い傷は短いうめき
      const heavy = part === 'legs' || part === 'stomach' || this.hp < 50;
      this.say(heavy ? (this.hp < 55 ? 'agony' : 'pain') : 'hurt');
      if (!this.prone && !this.downed && this.wounds.leg < 2) { this.dodgeT = 0.35; this.strafe = Math.random() < 0.5 ? -1 : 1; if (Math.random() < 0.5) this.wantCrouch = true; }
      // 見えない所から撃たれた：すぐに遮蔽物へ（守備役はその場でしゃがむ）
      if (!this.visible && this.state !== 'cover') {
        if (!this.takeCover(fromPos, true)) { this.setState('investigate'); this.goalTo(fromPos, 'investigate', fromPos); }
      }
      return false;
    }
    stab(part, from, side) {
      if (this.dead) return false;
      if (part === 'neck') {
        if (!this.neckWound) {
          this.neckWound = true; this.knifeBleed = this.hp / 5.5;
          this.setState('incapacitated'); this.releaseCover(); this.path = null; this.goal = null;
          this.speed = 0; this.reloadT = 0; this.switchT = 0;
          this.prone = false; this.lean = 0; this.body.flash.visible = false; this.flashT = 0;
          this.say('pain', .8);
        }
        return false;
      }
      const killed = this.damage(({arms:20,legs:24,body:32,stomach:35,head:30})[part] || 25, part, from, side);
      if (!killed && !this.neckWound) {
        this.knifeBleed = Math.min(3, this.knifeBleed + (part === 'body' || part === 'stomach' ? .8 : .55));
        this.knifeWoundBone = part === 'arms' ? 'fa' + (side >= 0 ? 'L' : 'R') : part === 'legs' ? 'th' + (side >= 0 ? 'L' : 'R') : part === 'head' ? 'head' : 'spine';
      }
      return killed;
    }
    updateKnifeWound(dt) {
      if (!(this.knifeBleed > 0)) return;
      this.hp = Math.max(0, this.hp - this.knifeBleed * dt);
      this.knifeDripT -= dt;
      if (this.knifeDripT <= 0) {
        this.knifeDripT = this.neckWound ? .42 : 1.1;
        const p = V3(); if(this.neckWound&&this.body.banditActive&&this.body.nativeBandit?.neckCenter)p.copy(this.body.nativeBandit.neckCenter);else this.body.bones[this.neckWound ? 'neck' : (this.knifeWoundBone || 'hips')].getWorldPosition(p);
        if (G.Game.gore !== 'off') {
          if (this.neckWound) G.Effects.neckBleed(p, this.bodyYaw);
          // Non-neck floor trails are handled by Medical20.
        }
      }
      if (this.hp <= 0) { this.die(0, 0, 'bleed'); G.Player.kills++; }
    }
    // 倒れる：撃たれた方向の反対へ。壁があれば空いている方向へ倒れる
    die(lz, lx, part) {
      if (this.dead) return;
      this.state = 'dead'; this.hp = 0; this.deadT = 0; this.releaseCover(); this.prone = false;
      this.body.flash.visible = false;
      const yaw = this.bodyYaw, fwd = [Math.sin(yaw), Math.cos(yaw)], right = [-Math.cos(yaw), Math.sin(yaw)];
      const cands = [];
      const back = (lz || 0) >= 0 ? true : false;   // 正面から撃たれた（弾は前→後へ）なら後ろへ
      cands.push(back ? ['x', -1, [-fwd[0], -fwd[1]]] : ['x', 1, fwd]);
      cands.push((lx || 0) > 0 ? ['z', -1, [-right[0], -right[1]]] : ['z', 1, right]);
      cands.push(back ? ['x', 1, fwd] : ['x', -1, [-fwd[0], -fwd[1]]]);
      cands.push((lx || 0) > 0 ? ['z', 1, right] : ['z', -1, [-right[0], -right[1]]]);
      let pick = cands[0], bestD = -1;
      for (const c of cands) {
        const h = W().raycast(this.pos.x, 0.5, this.pos.z, c[2][0], 0, c[2][1], 2.2);
        const d = h ? h.t : 2.2;
        if (d >= 1.85) { pick = c; bestD = d; break; }
        if (d > bestD) { bestD = d; pick = c; }
      }
      this.body.die(pick[0], pick[1], part === 'head');
      G.Audio.deathVoice(this.voicePos(), this.voicePitch, this.id, () => this.voicePos(), part === 'head' ? 'head' : this.neckWound ? 'neck' : part);
      G.Enemies.onDeath(this);
    }

    // ---- 聞く ----
    hear(pos, radius, kind, isPlayer) {
      if (this.dead) return;
      if(kind==='casing')return G.Casing18.hear(this,pos,radius);
      const heard=G.Stealth13.heard(this,pos,radius,kind);if(!heard)return;pos=heard.point;
      if (this.visible && this.state === 'combat') return;
      this.heardPos = pos.clone(); this.heardT = G.time;
      this.alertT = Math.max(this.alertT, kind === 'gunshot' ? 30 : 12);
      // 交戦中に相手の装填音を聞いた → 好機なので詰める
      if (kind === 'reload' && isPlayer && (this.state === 'combat' || this.state === 'hold' || this.state === 'cover') && !this.visible && this.role !== 'anchor') {
        if (G.Enemies.pushers() >= MAX_PUSHERS) return;
        this.pushT = 2.5; this.releaseCover(); this.setState('chase'); this.goalTo(this.spreadPoint(this.heardPos), 'chase', this.heardPos); return;
      }
      // A broken fixture is a location clue, never identification of its shooter.
      if ((kind === 'lamp-break'||kind === 'window-break') && ['patrol','suspicious','search','guard','investigate'].includes(this.state)) {
        this.setState('investigate'); this.goalTo(this.heardPos.clone(), 'investigate', null); return;
      }
      if (this.role === 'anchor') { this.lookTarget = this.heardPos.clone(); if (this.state === 'patrol' || this.state === 'search') this.setState('guard'); return; }
      if (this.state === 'patrol' || this.state === 'suspicious' || this.state === 'search' || this.state === 'guard') {
        this.setState('investigate'); this.goalTo(this.spreadPoint(this.heardPos), 'investigate', null);
      } else if (this.state === 'investigate' && isPlayer) {
        this.goalTo(this.spreadPoint(this.heardPos), 'investigate', null);
      } else if ((this.state === 'combat' || this.state === 'hold') && !this.visible && isPlayer && G.time - this.lastSeenT > 1.5) {
        this.suspectPos = this.heardPos.clone();
      }
    }

    // ---- 無線：味方が見た位置を受け取る（見た瞬間の位置だけで、その後は更新されない） ----
    receiveReport(pos, vel) {
      if (this.dead) return;
      this.reportPos = pos.clone(); this.reportT = G.time; this.alertT = Math.max(this.alertT, 40);
      if (this.visible && this.state === 'combat') return;
      if (this.role === 'anchor') { this.lookTarget = pos.clone(); if (this.state !== 'combat' && this.state !== 'cover') this.setState('guard'); return; }
      if (this.state === 'combat' || this.state === 'cover' || this.state === 'chase' || this.state === 'flank') return;
      if (G.Enemies.pushers() < MAX_PUSHERS) {
        this.setState('investigate'); this.goalTo(this.spreadPoint(pos), 'report', pos);
      } else {
        this.startHold(pos);
      }
    }

    // ---- 手りゅう弾に気づいたら、爆風の届かない所へ走る ----
    noticeGrenade(g) {
      if (this.dead || this.state === 'evade') return;
      const d = this.pos.distanceTo(g.p);
      if (d > G.Grenades.RADIUS + 1.5) return;
      // 遠ざかる方向で、手りゅう弾から見えない（または十分離れた）場所を探す
      let best = null, bestS = -Infinity;
      for (let k = 0; k < 24; k++) {
        const a = k / 24 * Math.PI * 2, r = 4 + (k % 3) * 2.5;
        const x = Math.floor(this.pos.x + Math.sin(a) * r), z = Math.floor(this.pos.z + Math.cos(a) * r);
        if (!W().walkable(x, z)) continue;
        const p = V3(x + 0.5, 0, z + 0.5);
        const away = p.distanceTo(g.p), hid = !W().lineOfSight(g.p.x, Math.max(0.3, g.p.y), g.p.z, p.x, 1.0, p.z);
        const s = away + (hid ? 6 : 0) - p.distanceTo(this.pos) * 0.4;
        if (away > d && s > bestS) { bestS = s; best = p; }
      }
      this.releaseCover(); this.prone = false;
      this.setState('evade'); this.evadeT = g.fuse + 0.6; this.evadeFrom = g.p.clone();
      if (best) this.goalTo(best, 'evade');
      this.alertT = Math.max(this.alertT, 30);
      if (Math.random() < 0.6) this.say('hurt', 0.7);   // とっさに声を上げる
    }
    // ---- 見る ----
    perceive(player, dt) {
      if(G.Stealth13)return G.Stealth13.perceive(this,player,dt);
      if(this.blindT>0){this.visible=false;return;}
      const eye = this.eyePos();
      const targets = player.visPoints();
      const dist = eye.distanceTo(targets[0]);
      const range = (this.state === 'combat' ? 55 : 40) * (W().outdoor ? 1.5 : 1);   // 屋外は遠くまで見える
      let vis = false, center = 1;
      if (dist < range && !player.dead) {
        const dir = Math.atan2(targets[0].x - eye.x, targets[0].z - eye.z);
        const off = Math.abs(angDiff(this.lookYaw, dir));
        const fov = (this.state === 'combat' || this.alertT > 0) ? 1.35 : 1.05;
        if (off < fov || dist < 1.8) {
          for (const tp of targets) if (W().lineOfSight(eye.x, eye.y, eye.z, tp.x, tp.y, tp.z)) { vis = true; break; }
          center = off < 0.45 ? 1 : 0.55;
        }
      }
      this.visible = vis;
      if (vis) {
        const postureK = player.posture === 'prone' ? 0.4 : player.posture === 'crouch' ? 0.7 : 1;
        const moveK = player.sprinting ? 1.7 : player.moving ? 1.25 : 0.85;
        const distK = Math.max(0.2, 1.5 - dist / 28);
        const alertK = this.alertT > 0 ? 2.4 : 1;
        const fireK = G.time - player.lastShotT < 0.4 ? 3 : 1;
        this.awareness += dt * 2.2 * postureK * moveK * distK * center * alertK * fireK * G.Game.difficulty;
        if (dist < 3) this.awareness += dt * 5;
        this.suspectPos = player.pos.clone();
      } else if (this.state !== 'combat' && this.state !== 'cover' && this.state !== 'hold') {
        this.awareness = Math.max(0, this.awareness - dt * 0.22);
      }
      if (vis && this.awareness >= 1) {
        this.awareness = 1;
        this.lastSeenPos = player.pos.clone(); this.lastSeenT = G.time; this.lastSeenVel.copy(player.vel);
        if (this.state !== 'combat' && this.state !== 'cover') {
          const fresh = this.state !== 'hold' && this.alertT <= 0;
          this.setState('combat');
          this.reaction = rnd(0.22, 0.45) * (fresh ? 1.2 : 0.8);
          this.shotsAtTarget = 0;
        }
        this.alertT = 45;
        // 見ている間は1.5秒ごとに無線で位置を伝える
        if (G.time - this.lastReportSent > 1.5) { this.lastReportSent = G.time; G.Enemies.radio(this, this.lastSeenPos, this.lastSeenVel); }
      } else if (vis && this.awareness > 0.35 && (this.state === 'patrol' || this.state === 'search' || this.state === 'investigate' || this.state === 'guard')) {
        this.setState('suspicious');
      }
    }

    // 狙う相手を選ぶ：今の相手が見えていれば続け、見えなくなったら視界に入っている一番近い相手（プレイヤーか仲間）
    pickTarget(player) {
      const allies = G.Allies ? G.Allies.alive() : [];
      if (!allies.length) return player;
      if (this.tgtT > 0) { this.tgtT -= 0.016; if (this.tgt && !this.tgt.dead) return this.tgt; }
      this.tgtT = 0.25;
      const eye = this.eyePos();
      const range = (this.state === 'combat' ? 55 : 40) * (W().outdoor ? 1.5 : 1);
      const fov = (this.state === 'combat' || this.alertT > 0) ? 1.35 : 1.05;
      if (this.tgt && !this.tgt.dead && this.visible) return this.tgt;
      let best = null, bd = Infinity;
      for (const c of [player, ...allies]) {
        if (c.dead) continue;
        const pts = c.visPoints(), d = eye.distanceTo(pts[0]);
        if (d > range || d > bd) continue;
        const off = Math.abs(angDiff(this.lookYaw, Math.atan2(pts[0].x - eye.x, pts[0].z - eye.z)));
        if (off > fov && d > 1.8) continue;
        if (!pts.some(p => W().lineOfSight(eye.x, eye.y, eye.z, p.x, p.y, p.z))) continue;
        best = c; bd = d;
      }
      this.tgt = best || (this.tgt && !this.tgt.dead ? this.tgt : player);
      return this.tgt;
    }

    // 最も新しい手掛かり（見た位置は、その時の移動方向へ少し先読みする）
    clue() {
      let best = null, t = -999;
      if (this.lastSeenPos && this.lastSeenT > t) {
        const since = G.time - this.lastSeenT;
        const ahead = this.lastSeenVel.clone().setY(0).multiplyScalar(Math.min(1.2, since));
        if (ahead.length() > 4) ahead.setLength(4);
        const p = this.lastSeenPos.clone().add(ahead);
        const ok = W().walkable(Math.floor(p.x), Math.floor(p.z)) && W().lineOfSight(this.lastSeenPos.x, 1.0, this.lastSeenPos.z, p.x, 1.0, p.z);
        best = ok ? p : this.lastSeenPos.clone(); t = this.lastSeenT;
      }
      if (this.heardPos && this.heardT > t + 0.5) { best = this.heardPos.clone(); t = this.heardT; }
      if (this.reportPos && this.reportT > t + 0.5) { best = this.reportPos.clone(); t = this.reportT; }
      if(this.bodyPos13&&this.bodyT13>t){best=this.bodyPos13.clone();t=this.bodyT13;}
      if(this.suspectPos&&G.time-this.suspectT13<8&&this.suspectT13>t)best=this.suspectPos.clone();
      return best;
    }
    // 味方と同じ地点に集まらないよう、目的地を少しずらす
    spreadPoint(p) {
      const others = G.Enemies.list.filter(e => e !== this && !e.dead && e.goal && e.goal.distanceTo(p) < 2.2).length;
      if (others === 0) return p.clone();
      for (let k = 0; k < 20; k++) {
        const q = Path.randomNear(p.x, p.z, 1.5 + others);
        if (q && q.distanceTo(p) > 1.2 && W().lineOfSight(q.x, 1.2, q.z, p.x, 1.2, p.z) && !G.Enemies.list.some(e => e !== this && e.goal && e.goal.distanceTo(q) < 1.2)) return q;
      }
      return p.clone();
    }

    // ---- 経路 ----
    goalTo(p, kind, threat) {
      this.goal = p.clone(); this.goalKind = kind; this.path = null; this.repathT = 0; this.threatForPath = threat ? threat.clone() : null;
    }
    followPath(dt,speed) { return G.Combat21.follow(this,dt,()=>this.followPath20(dt,speed)); }
    followPath20(dt, speed) {
      if (!this.goal) return 'none';
      if (!this.path && this.repathT <= 0) {
        if (Path.budget <= 0) return 'wait';
        Path.budget--;
        const raw = Path.find(this.pos.x, this.pos.z, this.goal.x, this.goal.z, this.threatForPath);
        this.repathT = 0.6;
        if (!raw) { this.goal = null; return 'fail'; }
        const endCell = raw[raw.length - 1];
        const exact = Math.floor(this.goal.x) === Math.floor(endCell.x) && Math.floor(this.goal.z) === Math.floor(endCell.z);
        if (exact && !W().overlapsSolid(this.goal.x, this.goal.z, 0.3, 1.8)) raw[raw.length - 1] = V3(this.goal.x, 0, this.goal.z);
        // 露出を避ける経路は、短縮すると遮蔽物の陰から出てしまうので短縮しない
        this.path = this.threatForPath ? raw.slice(1) : Path.smooth(this.pos, raw); this.pathIdx = 0;
        if (!this.path.length) this.path = [raw[raw.length - 1]];
        this.updateDebugPath();
      }
      if (!this.path) return 'wait';
      if (this.pathIdx >= this.path.length) { this.goal = null; this.path = null; return 'arrived'; }
      const wp = this.path[this.pathIdx];
      const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < (this.pathIdx === this.path.length - 1 ? (this.cover?.phase==='peek'?.06:.18) : .35)) { this.pathIdx++; return 'moving'; }
      this.moveDir(dx / d, dz / d, speed, dt);
      return 'moving';
    }
    moveDir(nx, nz, speed, dt, keepFacing) {
      if(G.Doors?.beforeMove(this,nx,nz,dt)){this.doorWait21=G.time;this.speed=0;return;}
      if (this.prone && !this.downed) { this.prone = false; this.standUpT = 0.7; }   // 立てない敵は伏せたまま這う
      if (this.standUpT > 0) return;
      speed *= this.downed ? 1 : this.mobility();
      if (this.nudge && this.nudge.t > 0) { this.nudge.t -= dt; nx += this.nudge.x * 1.2; nz += this.nudge.z * 1.2; }
      for (const o of G.Enemies.list) {
        if (o === this || o.dead) continue;
        const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z, d = Math.hypot(ox, oz);
        if (d < 0.9 && d > 1e-4) { nx += ox / d * (0.9 - d) * 2.5; nz += oz / d * (0.9 - d) * 2.5; }
      }
      const l = Math.hypot(nx, nz) || 1;
      const before = this.pos.clone();
      W().moveCircle(this.pos, nx / l * speed * dt, nz / l * speed * dt, 0.3, this.crouchK > 0.5 ? 1.2 : 1.8);
      this.speed = this.pos.distanceTo(before) / Math.max(dt, 1e-4);
      if (!keepFacing) this.faceTo(Math.atan2(nx, nz), dt, 6);
      this.stepDist += this.pos.distanceTo(before);
    }
    faceTo(yaw, dt, rate) {
      const d = angDiff(this.yaw, yaw);
      this.yaw += Math.max(-rate * dt, Math.min(rate * dt, d));
      this.lookYaw = this.yaw;
    }
    aimAt(p, dt, rate) {
      this.faceTo(Math.atan2(p.x - this.pos.x, p.z - this.pos.z), dt, rate);
      const dy = (p.y !== undefined ? p.y : 1.2) - this.eyeY();
      this.lookPitch = Math.atan2(dy, Math.hypot(p.x - this.pos.x, p.z - this.pos.z));
    }

    // ---- 遮蔽物：脅威の位置から本当に見えないことを確認し、顔を出す方法も決める ----
    takeCover(threat, urgent) {
      const c = this.findCover(threat, urgent ? 9 : 13);
      if (!c) return false;
      this.releaseCover();
      this.cover = c; G.Enemies.reserved.add(c.key);
      this.state = 'cover'; this.stateT = 0; this.path = null;
      this.cover.phase = 'travel'; this.cover.t = 0; this.cover.peeks = this.hp < 30 ? 1 : 3; this.cover.threat = threat.clone();
      this.goalTo(c.pos, 'cover', threat);this.path=c.path.map(p=>p.clone());this.pathIdx=0;this.cover.seen=G.time;G.Combat21.record('take-cover',this,{position:c.pos.toArray()});
      return true;
    }
    findCover(threat,maxDist) { return G.Combat21.find(this,threat,maxDist,false); }
    // 迂回点：目標の周囲3〜10mのセルを総当たりし、今いる方向から約70°以上ずれていて、目標を狙える場所を選ぶ
    findFlankPoint(target) {
      const base = Math.atan2(this.pos.x - target.x, this.pos.z - target.z);
      let best = null, bestScore = Infinity;
      const tx = Math.floor(target.x), tz = Math.floor(target.z);
      for (let z = tz - 10; z <= tz + 10; z++) for (let x = tx - 10; x <= tx + 10; x++) {
        if (!W().walkable(x, z)) continue;
        const px = x + 0.5, pz = z + 0.5, r = Math.hypot(px - target.x, pz - target.z);
        if (r < 3 || r > 10) continue;
        if (Math.abs(angDiff(base, Math.atan2(px - target.x, pz - target.z))) < 1.2) continue;
        const score = Math.hypot(px - this.pos.x, pz - this.pos.z) + Math.random() * 2;
        if (score >= bestScore) continue;
        if (!W().lineOfSight(px, 1.5, pz, target.x, 1.2, target.z)) continue;
        bestScore = score; best = V3(px, 0, pz);
      }
      return best;
    }
    startHold(target) {
      this.setState('hold'); this.holdT = rnd(7, 13); this.lookTarget = target.clone();
      this.wantCrouch = Math.random() < 0.7;
      // 見通しの長い場所では伏せて待つことがある
      if (this.role === 'anchor' && this.pos.distanceTo(target) > 10 && Math.random() < 0.4) { this.prone = true; this.proneT = this.holdT; }
    }

    // ---- 射撃 ----
    tryFire(player, dt) {
      if(this.blindT>0||!G.Combat21.fireAllowed(this,player))return;
      if (this.dead || this.neckWound) return;
      if(G.Stealth13&&!G.Stealth13.canEnemyFire(this,player))return;
      if (this.reloadT > 0 || this.switchT > 0) return;
      this.fireCD -= dt;
      if (this.fireCD > 0) return;
      if (this.ammo <= 0) {
        // 主力武器の弾が尽きた、または相手が目の前で込め直す余裕がない → ハンドガンを抜く
        const close = this.visible && this.pos.distanceTo(player.pos) < 8;
        if (this.weapon === this.primary && (this.arms[this.primary].reserve <= 0 || close) && (this.arms.pistol.ammo > 0 || this.arms.pistol.reserve > 0)) { this.drawPistol(); return; }
        if (this.retreatCD > 0 || this.state !== 'combat' || this.downed || this.weapon === 'pistol') this.startReload();
        return;
      }
      const eye = this.eyePos(); eye.y -= 0.06;
      let aim = null;
      for (const tp of player.visPoints()) if (W().lineOfSight(eye.x, eye.y, eye.z, tp.x, tp.y, tp.z)) { aim = tp; break; }
      if (!aim) { this.fireCD = 0.2; return; }
      const barrel=this.body.muzzle.getWorldPosition(V3());if(!W().lineOfSight(barrel.x,barrel.y,barrel.z,aim.x,aim.y,aim.z)){this.fireCD=.15;return;}
      // 味方が射線上にいたら撃たずに横へずれる
      const seg = aim.clone().sub(eye), segL = seg.length(); seg.normalize();
      for (const o of G.Enemies.list) {
        if (o === this || o.dead) continue;
        const v = V3(o.pos.x, 1.2, o.pos.z).sub(eye), t = v.dot(seg);
        if (t > 0 && t < segL && v.clone().addScaledVector(seg, -t).length() < 0.5) { this.fireCD = 0.3; this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeT = 0.8; return; }
      }
      const wpn = this.weapon,profile=G.NPC12?.profile(this);
      this.ammo--;this.arms[wpn].ammo=this.ammo;G.Stealth13?.hostileShot(this,player);
      if (profile) {this.burst--;this.fireCD=G.NPC12.fireDelay(this);if(this.burst<=0)this.burst=3+(Math.random()*4|0);}
      else if (wpn === 'rifle') {
        this.burst--;
        this.fireCD = this.burst > 0 ? 0.105 : rnd(0.35, 0.75);
        if (this.burst <= 0) this.burst = 3 + (Math.random() * 4 | 0);
      } else if (wpn === 'shotgun') this.fireCD = rnd(0.9, 1.2);     // ポンプ操作の間
      else this.fireCD = rnd(0.32, 0.6);
      this.shotsAtTarget++;
      const muzzleW = new THREE.Vector3(); this.body.muzzle.getWorldPosition(muzzleW);
      this.flashT = 0.05; this.body.flash.visible = true; this.body.flash.material.rotation = Math.random() * 6;
      this.body.fire();
      G.Audio.gunshot(muzzleW, false, wpn === 'rifle' ? undefined : wpn);
      G.Effects.ejectNPC(this.body, wpn, wpn === 'shotgun' ? .23 : 0);
      G.Effects.enemyFlash(muzzleW);
      G.Enemies.broadcast(this.pos.clone().setY(1.4), 40, 'gunshot', false, this);
      const dist = eye.distanceTo(aim);
      let p = profile ? profile.hitBase-dist*profile.hitFalloff : wpn === 'shotgun' ? 0.95 - dist * 0.055 : wpn === 'pistol' ? 0.62 - dist * 0.018 : 0.72 - dist * 0.011;
      p *= player.posture === 'prone' ? 0.55 : player.posture === 'crouch' ? 0.8 : 1;
      p *= player.sprinting ? 0.55 : player.moving ? 0.8 : 1;
      p *= this.speed > 0.5 ? 0.7 : 1;
      p *= Math.min(1, 0.5 + this.shotsAtTarget * 0.12);
      p *= this.wounds.arm ? 0.85 : 1;
      p *= this.critical ? 0.8 : 1;
      p *= this.prone ? 1.1 : 1;
      if (this.legless) p *= 0.55;   // 脚を失った敵は、痛みと失血で狙いが定まらない
      else if (this.downed) p *= 0.7;
      p *= G.Stealth13.aimFactor(this,player,dist);
      p *= G.Game.difficulty;
      p = Math.max(0.05, Math.min(0.85, p));
      if (Math.random() < p) {
        G.Effects.tracer(muzzleW, aim);
        // 当たった場所（姿勢で変わる）と威力（ショットガンは近いほど強い）
        const r = Math.random(), pr = player.posture === 'prone';
        const area = r < (pr ? 0.08 : 0.06) ? 'head' : r < (pr ? 0.5 : 0.6) ? 'torso' : r < (pr ? 0.75 : 0.8) ? 'arm' : 'leg';
        let dmg = profile ? rnd(...profile.enemyDamage) : wpn === 'shotgun' ? (dist < 4 ? rnd(55, 75) : dist < 8 ? rnd(35, 50) : dist < 15 ? rnd(18, 28) : rnd(6, 12)) : wpn === 'pistol' ? rnd(10, 15) : rnd(12, 18);
        if (area === 'head') dmg = wpn === 'shotgun' && dist < 6 ? 999 : dmg * 2.5;
        // ショットガンの至近距離：脚がもげる／頭なら即死
        if (wpn === 'shotgun' && dist < 5 && G.Game.dismember) {
          if (area === 'leg' && Math.random() < 0.5) player.loseLeg(Math.random() < 0.5 ? 1 : -1, this.pos);
          if (area === 'arm' && Math.random() < 0.35 && player.loseArm) player.loseArm(Math.random() < 0.5 ? 1 : -1, this.pos);
          if (area === 'head') player.headLost = true;
        }
        player.hurt(dmg, this.pos, area);
      } else {
        const miss = aim.clone().add(V3(rnd(-0.6, 0.6), rnd(-0.4, 0.5), rnd(-0.6, 0.6)));
        const d = miss.sub(muzzleW).normalize();
        const h = W().raycast(muzzleW.x, muzzleW.y, muzzleW.z, d.x, d.y, d.z, 80);
        const end = h ? V3(h.x, h.y, h.z) : muzzleW.clone().addScaledVector(d, 80);
        G.Effects.tracer(muzzleW, end);
        if (h) { if(h.lamp)G.Lamps.damage(h);if(!(wpn==='shotgun'&&G.SurfaceDamage17.target(h)))G.Effects.impact(h); if(wpn==='shotgun')G.SurfaceDamage17.npc(muzzleW,d);else if(h.door)G.Doors.damage(h.door,24,h,wpn); G.World.damageCrate(h,wpn==='shotgun'?55:22,d,wpn,'buck'); }
        G.Audio.whiz(player.camPos().clone().addScaledVector(d, -0.5));
      }
    }
    startReload() {
      if (this.reloadT > 0 || this.switchT > 0 || this.ammo === this.magSize) return;
      if (this.arms[this.weapon].reserve <= 0) { if (this.weapon === this.primary) this.drawPistol(); return; }
      this.reloadDur=G.NPC12?.reloadDuration(this)??this.reloadDur;this.reloadT = this.reloadDur;
      G.Audio.reload('out', V3(this.pos.x, this.downed ? 0.4 : 1.2, this.pos.z));
    }
    finishReload() {
      const st = this.arms[this.weapon], take = Math.min(this.magSize - this.ammo, st.reserve);
      st.reserve -= take; this.ammo += take;st.ammo=this.ammo;
      G.Audio.reload('in', V3(this.pos.x, this.downed ? 0.4 : 1.2, this.pos.z));
    }
    // 持ち替え（ハンドガンは主力武器が使えないときだけ）
    setWeapon(kind) {
      this.arms[this.weapon].ammo = this.ammo;
      this.weapon = kind; this.magSize = EWEAPON[kind].mag; this.reloadDur = EWEAPON[kind].reload;
      this.ammo = this.arms[kind].ammo; this.reloadT = 0; this.switchT = 0.6;
      this.body.setWeapon(kind); this.burst = 1;G.NPC12?.selected(this);
      G.Audio.reload('grab', V3(this.pos.x, 1.0, this.pos.z));
    }
    drawPistol() { if (this.weapon !== 'pistol' && (this.arms.pistol.ammo > 0 || this.arms.pistol.reserve > 0)) this.setWeapon('pistol'); }
    // 落ち着いたら主力武器へ戻す
    maybeBackToPrimary() {
      if (this.weapon !== 'pistol' || this.switchT > 0 || this.reloadT > 0) return;
      const P = this.arms[this.primary];
      if (P.ammo + P.reserve <= 0) return;
      if (this.visible || G.time - this.lastSeenT < 3) return;
      this.setWeapon(this.primary); if (this.ammo < this.magSize) this.switchT = 0.6, this.startReloadLater = true;
    }

    // ---- 1フレームの行動 ----
    // ---- 立てなくなった（脚に何発も被弾）：這うことしかできないが、見えれば撃ってくる。出血が続く ----
    goDown(bleed) {
      if (this.dead) return;
      this.downed = true;
      this.prone = true; this.proneT = 1e9; this.wantCrouch = false; this.crouch = 0;
      this.bleed = Math.max(this.bleed, bleed || 0.7);
      this.crawlGoal = null; this.goal = null; this.path = null; this.releaseCover && this.releaseCover(); this.cover = null;
      this.dripT = 0; this.crawlDist = 0;
      if (this.state !== 'combat') this.setState('combat');
      this.say('agony', 1.1);
    }
    // ---- 脚を失った：同じく這うだけになり、激しく出血する。放っておくと失血死する ----
    loseLeg(side, dir) {
      if (this.dead || this.legless) return false;
      const piece = G.Physics.sever(this.body, { part: 'legs', side, dir });
      if (!piece) return false;
      this.legless = side >= 0 ? 'L' : 'R';
      this.goDown(1.8);
      this.prone = true; this.proneT = 1e9; this.wantCrouch = false; this.crouch = 0;
      this.bleed = 1.8;                 // 毎秒の失血（体力）
      this.crawlGoal = null; this.goal = null; this.path = null; this.cover = null;
      this.dripT = 0; this.crawlDist = 0;
      if (this.state !== 'combat') this.setState('combat');
      this.say('agony', 1.1);
      return true;
    }
    updateLegless(dt, player) {
      this.stateT += dt; this.alertT = Math.max(0, this.alertT - dt);
      this.percT -= dt;
      if (this.percT <= 0) { this.perceive(player, 0.1 + -this.percT); this.percT = 0.1; }
      if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.body.flash.visible = false; }
      if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.finishReload(); }
      if (this.switchT > 0) { this.switchT -= dt; if (this.switchT <= 0 && this.startReloadLater) { this.startReloadLater = false; this.startReload(); } }
      this.maybeBackToPrimary();
      // 失血
      this.hp -= this.bleed * dt;
      // Floor trails are emitted by Medical20, including while crawling.
      if (this.hp <= 0) { this.die(0, 0, 'bleed'); return; }
      this.moanT -= dt;
      if (this.moanT <= 0) { this.moanT = rnd(2.5, 4.5); this.say(Math.random() < 0.4 ? 'agony' : 'moan'); }
      this.speed = 0; this.prone = true; this.lean = 0; this.lookPitch *= 0.9;
      if (this.visible && this.awareness >= 1) {
        // 伏せたまま撃つ
        this.crawlGoal = null;
        if (this.ammo === 0) this.startReload();
        this.tryFireWhileFacing(player, dt);
      } else {
        // 見えていない：撃たれた方から隠れられる場所へ、ゆっくり這っていく
        const threat = this.lastSeenPos || this.heardPos;
        if (threat && !this.crawlGoal && this.stateT > 0.5) {
          const c = this.findCover(threat, 4);
          if (c) { this.crawlGoal = c.pos.clone(); this.goalTo(this.crawlGoal, 'crawl'); }
          else this.crawlGoal = this.pos.clone();
        }
        if (this.goal) {
          const before = this.pos.clone();
          const r = this.followPath(dt, 0.32);
          this.crawlDist += this.pos.distanceTo(before);
          if (this.crawlDist > 0.6) { this.crawlDist = 0; G.Audio.gear(V3(this.pos.x, 0.2, this.pos.z), 0.7, false); }
          if (r === 'arrived' || r === 'fail') this.goal = null;
        } else if (threat) this.aimAt(V3(threat.x, 0.6, threat.z), dt, 1.5);
      }
      this.syncModel(dt);
    }

    update(dt, player) {
      if (this.dead) { this.deadT += dt; this.syncModel(dt); return; }
      G.Medical20.enemyDamage(this,dt);
      if(!this.dead)this.updateKnifeWound(dt);
      if (this.dead) { this.syncModel(dt); return; }
      if (this.neckWound) {
        this.speed = 0; this.prone = false; this.lean = 0;
        this.crouch += (1 - this.crouch) * (1 - Math.exp(-dt * 5));
        this.lookPitch = 0; this.syncModel(dt); return;
      }
      if (this.downed) { this.updateLegless(dt, player); return; }
      this.stateT += dt;
      this.alertT = Math.max(0, this.alertT - dt);
      this.retreatCD -= dt; this.repathT -= dt; this.pushT -= dt; this.dodgeT -= dt; this.standUpT -= dt;
      if (this.state !== 'cover' || !this.cover || this.cover.phase !== 'peek') this.lean = 0;
      if (this.prone && this.state !== 'combat' && this.state !== 'hold') this.prone = false;
      if (this.hp < 40) { this.moanT -= dt; if (this.moanT <= 0) { this.moanT = rnd(3, 6); this.say(Math.random() < 0.25 ? 'agony' : 'moan', Math.random() < 0.25 ? 0.6 : 1); } }
      this.percT -= dt;
      if (this.percT <= 0) { this.perceive(player, 0.1 + -this.percT); this.percT = 0.1; }
      if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.body.flash.visible = false; }
      if (this.state !== 'evade' && G.Grenades.list.length) {
        const ep = this.eyePos();
        for (const g of G.Grenades.list) {
          const d = this.pos.distanceTo(g.p);
          if (d < G.Grenades.RADIUS + 1 && W().lineOfSight(ep.x, ep.y, ep.z, g.p.x, g.p.y + 0.05, g.p.z) && g.fuse < G.Grenades.FUSE - 0.25) { this.noticeGrenade(g); break; }
        }
      }
      if (this.reloadT > 0) {
        this.reloadT -= dt;
        if (this.reloadT <= 0) this.finishReload();
      }
      if (this.switchT > 0) { this.switchT -= dt; if (this.switchT <= 0 && this.startReloadLater) { this.startReloadLater = false; this.startReload(); } }
      this.maybeBackToPrimary();
      this.speed = 0;
      const now = G.time;
      this.lookPitch *= 0.9;

      switch (this.state) {
        case 'patrol': {
          this.wantCrouch = false;
          if (this.waitT > 0) { this.waitT -= dt; this.lookYaw = this.yaw + Math.sin(now * 0.8 + this.id) * 0.9; break; }
          if (!this.goal) this.goalTo(this.patrol[this.patrolIdx], 'patrol');
          const r = this.followPath(dt, 1.35);
          if (r === 'arrived' || r === 'fail') { this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length; this.waitT = rnd(1.2, 3); }
          break;
        }
        case 'guard': {
          // 守備役：持ち場へ戻り、見通しの長い方向を順に見張る
          if (this.pos.distanceTo(this.home) > 1.2) {
            if (!this.goal) this.goalTo(this.home, 'home');
            const r = this.followPath(dt, 1.6); if (r === 'fail') this.goal = null;
            break;
          }
          this.wantCrouch = this.alertT > 0;
          if (this.lookTarget && this.alertT > 0) { this.aimAt(this.lookTarget, dt, 3); break; }
          this.watchT -= dt;
          if (this.watchT <= 0) { this.watchIdx = (this.watchIdx + 1) % Math.max(1, this.watch.length); this.watchT = rnd(2.5, 5); }
          if (this.watch.length) this.faceTo(this.watch[this.watchIdx] + Math.sin(now * 0.7 + this.id) * 0.25, dt, 1.6);
          break;
        }
        case 'suspicious': {
          if (this.suspectPos) this.aimAt(this.suspectPos, dt, 3);
          if (this.awareness <= 0.2 || this.stateT > 4) {
            if (this.suspectPos && this.role !== 'anchor') { this.setState('investigate'); this.goalTo(this.suspectPos, 'investigate'); }
            else this.setState(this.role === 'anchor' ? 'guard' : 'patrol');
          }
          break;
        }
        case 'investigate': {
          this.wantCrouch = false;
          if (!this.goal) { this.startSearch(this.clue() || this.pos); break; }
          const r = this.followPath(dt, this.goalKind === 'report' ? 2.6 : this.goalKind === 'casing' ? 1.35 : 2.2);
          if (r === 'arrived' || r === 'fail') this.startSearch(this.clue() || this.pos.clone());
          break;
        }
        case 'combat': this.updateCombat(dt, player); break;
        case 'evade': {
          this.wantCrouch = false;
          this.evadeT -= dt;
          if (this.goal) { const r = this.followPath(dt, 4.4); if (r === 'fail') this.goal = null; }
          else { this.wantCrouch = true; if (this.evadeFrom) this.aimAt(this.evadeFrom.clone().setY(1.0), dt, 4); }
          if (this.evadeT <= 0) { this.setState(this.lastSeenPos ? 'combat' : 'search'); if (this.state === 'search') this.startSearch(this.clue() || this.pos.clone()); }
          break;
        }
        case 'cover': this.updateCover(dt, player); break;
        case 'flank': {
          this.wantCrouch = false;
          if (this.visible && this.awareness >= 1) { this.setState('combat'); break; }
          if (!this.goal) {
            if (!this.flankDone && this.flankTarget) { this.flankDone = true; this.goalTo(this.flankTarget, 'flank2', this.flankTarget); }
            else { this.startSearch(this.flankTarget || this.pos.clone()); break; }
          }
          const near = this.flankDone && this.goal && this.goal.distanceTo(this.pos) < 8;
          this.wantCrouch = near;
          const r = this.followPath(dt, near ? 1.6 : 3.4);
          if (r === 'fail') this.goal = null;
          break;
        }
        case 'chase': {
          this.wantCrouch = false;
          if (this.visible && this.awareness >= 1) { this.setState('combat'); break; }
          if (!this.goal) { this.startSearch(this.clue() || this.pos.clone()); break; }
          const gd = this.goal.distanceTo(this.pos);
          const cautious = gd < 13 && this.pushT <= 0;
          this.wantCrouch = cautious;
          const r = this.followPath(dt, this.pushT > 0 ? 3.0 : cautious ? 1.5 : 2.8);
          if (r === 'arrived' || r === 'fail') this.startSearch(this.clue() || this.pos.clone());
          break;
        }
        case 'hold': {
          // 待ち伏せ：相手が来そうな方向へ銃を向けて待つ
          this.holdT -= dt;
          if (this.lookTarget) this.aimAt(this.lookTarget.clone().setY(1.2), dt, 3);
          if (this.visible && this.awareness >= 1) { this.setState('combat'); break; }
          if (this.ammo < this.magSize * 0.6) this.startReload();
          if (this.holdT <= 0) {
            const c = this.clue();
            if (c && G.Enemies.pushers() < MAX_PUSHERS && this.role !== 'anchor') { this.setState('chase'); this.goalTo(this.spreadPoint(c), 'chase', c); }
            else if (c && this.role !== 'anchor') this.startSearch(c);
            else this.setState(this.role === 'anchor' ? 'guard' : 'patrol');
          }
          break;
        }
        case 'search': {
          this.wantCrouch = false;
          if (!this.goal) {
            if (this.searchLeft <= 0 || this.stateT > 24) { this.setState(this.role === 'anchor' ? 'guard' : 'patrol'); this.awareness = 0; break; }
            this.waitT -= dt;
            this.lookYaw = this.yaw + Math.sin(now * 1.6 + this.id) * 1.2;
            if (this.waitT > 0) break;
            const p = Path.randomNear(this.searchCenter.x, this.searchCenter.z, 6);
            this.searchLeft--; this.waitT = rnd(0.8, 2.0);
            if (p) this.goalTo(this.spreadPoint(p), 'search');
            break;
          }
          const r = this.followPath(dt, 1.9);
          if (r === 'fail') this.goal = null;
          break;
        }
      }
      this.crouch += ((this.wantCrouch ? 1 : 0) - this.crouch) * Math.min(1, dt * 6);
      // 止まっているときも味方と重ならないよう、少しずつ離れる
      if (this.speed < 0.2) {
        let px = 0, pz = 0;
        for (const o of G.Enemies.list) {
          if (o === this || o.dead) continue;
          const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z, d = Math.hypot(ox, oz);
          if (d < 0.75) { const k = d > 1e-4 ? (0.75 - d) / d : 1; px += (d > 1e-4 ? ox : Math.random() - 0.5) * k; pz += (d > 1e-4 ? oz : Math.random() - 0.5) * k; }
        }
        if (px || pz) W().moveCircle(this.pos, px * dt * 3, pz * dt * 3, 0.3, this.crouchK > 0.5 ? 1.2 : 1.8);
      }
      if (this.stepDist > G.strideFor(Math.max(0.5, this.speed), this.prone)) {
        this.stepDist = 0;
        G.Audio.footstep(V3(this.pos.x, 0.05, this.pos.z), this.speed > 2.5 ? 1.1 : this.speed > 1.6 ? 0.8 : 0.55, false, this.speed > 2.5 ? 'run' : this.crouchK > 0.5 ? 'crouch' : 'walk');
        this.gearStep = !this.gearStep;
        if (this.gearStep) G.Audio.gear(V3(this.pos.x, 1.1, this.pos.z), this.speed > 2.5 ? 1 : 0.6, false);
      }
      if (this.goal) {
        if (this.pos.distanceTo(this.lastProgressPos) > 0.3) { this.lastProgressPos.copy(this.pos); this.stuckT = 0; }
        else { this.stuckT += dt; if (this.stuckT > 1.4) { this.stuckT = 0; this.path = null; this.repathT = 0; const a = Math.random() * Math.PI * 2; this.nudge = { x: Math.cos(a), z: Math.sin(a), t: 0.5 }; } }
      }
      this.syncModel(dt);
    }

    tryFireWhileFacing(player, dt) {
      const tgt = player.camPos();
      this.aimAt(V3(tgt.x, tgt.y - 0.3, tgt.z), dt, 5.5);
      const dir = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      if (Math.abs(angDiff(this.yaw, dir)) < 0.18 && this.reaction <= 0) this.tryFire(player, dt);
      this.reaction -= dt;
    }

    updateCombat(dt, player) {
      const now = G.time;
      if(this.visible&&this.awareness>=1&&this.lastSeenPos&&now>=(this.nextCover21||0)&&!this.downed&&!this.prone){this.nextCover21=now+2+(this.id%4)*.17;if(this.takeCover(this.lastSeenPos,false))return;if(this.coverPlanDeferred21)this.nextCover21=now+.09+(this.id%4)*.03;}
      const recentlyHurt = now - this.hurtTime < 1.5;
      // 弱った・撃たれた・弾切れ → 遮蔽物へ
      if (this.retreatCD <= 0 && this.lastSeenPos && (this.hp < 60 || (recentlyHurt && this.hp < 90) || (this.ammo === 0 && this.reloadT <= 0 && this.weapon !== 'pistol'))) {
        this.retreatCD = 4;
        if (this.takeCover(this.lastSeenPos, true)) return;
        if (this.visible && this.pos.distanceTo(this.lastSeenPos) > 8 && this.role !== 'rusher') { this.prone = true; this.proneT = rnd(6, 10); this.wantCrouch = false; }
        if (this.ammo === 0) this.startReload();
      }
      if (this.visible && this.awareness >= 1) {
        this.goal = null;
        const dist = this.pos.distanceTo(player.pos);
        // 伏せ撃ち：遠い相手には、遮蔽がないとき伏せて的を小さくする
        if (this.prone) {
          this.proneT -= dt;
          if (this.proneT <= 0 || dist < 4.5) { this.prone = false; this.standUpT = 0.7; }
          this.tryFireWhileFacing(player, dt); return;
        }
        if (this.standUpT > 0) { this.tryFireWhileFacing(player, dt); return; }
        if (this.role === 'anchor') this.wantCrouch = dist > 6 || this.critical;
        // 突撃役：体力に余裕があり、相手が遠いときだけ、しゃがんでゆっくり詰める
        else if (this.role === 'rusher' && dist > 7 && this.hp > 75 && !this.critical) { this.wantCrouch = true; /* No continuous exposed advance toward a visible opponent. */ }
        else {
          // 撃ちながら素早く左右へ動く。距離があればしゃがみ撃ちも混ぜる。瀕死なら膝をついたまま撃つ
          this.strafeT -= dt;
          if (this.strafeT <= 0) {
            this.strafe = [-1, 0, 1, 1, -1][Math.random() * 5 | 0];
            this.strafeT = rnd(0.35, 0.9);
            this.wantCrouch = this.critical || (dist > 7 && Math.random() < 0.55);
          }
          const dodging = this.dodgeT > 0;
          if ((this.strafe || dodging) && this.reloadT <= 0 && !this.critical) {
            const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z, l = Math.hypot(dx, dz) || 1;
            const sx = -dz / l * (this.strafe || 1), sz = dx / l * (this.strafe || 1);
            const spd = dodging ? 3.3 : this.wantCrouch ? 1.3 : 2.1;
            if (!W().overlapsSolid(this.pos.x + sx * 0.5, this.pos.z + sz * 0.5, 0.3, 1.8)) this.moveDir(sx, sz, spd, dt, true);
            else this.strafe = -this.strafe;
          }
        }
        this.tryFireWhileFacing(player, dt);
        return;
      }
      const since = now - this.lastSeenT;
      this.reaction = Math.max(this.reaction, 0.2);
      if (since < 1.0 && this.lastSeenPos) {
        this.aimAt(this.lastSeenPos.clone().setY(1.3), dt, 4);
        if (this.ammo < this.magSize * 0.4) this.startReload();
        return;
      }
      this.wantCrouch = false;
      const target = this.clue();
      if (!target) { this.startSearch(this.pos.clone()); return; }
      if (this.role === 'anchor') { this.startHold(target); return; }
      if (this.role === 'flanker' && !this.flankUsed) {
        const fp = this.findFlankPoint(target);
        if (fp) { this.flankUsed = true; this.flankDone = false; this.flankTarget = target.clone(); this.setState('flank'); this.goalTo(fp, 'flank1', target); return; }
      }
      // 突撃役（ショットガン）も、遮蔽物の陰を通って詰める（まっすぐ突っ込まない）
      if (G.Enemies.pushers() < MAX_PUSHERS) { this.setState('chase'); this.goalTo(this.spreadPoint(target), 'chase', target); return; }
      this.startHold(target);
    }

    updateCover(dt,player) { G.Combat21.enemyCover(this,dt,player); }

    startSearch(center) {
      this.setState('search');
      this.searchCenter = center.clone(); this.searchLeft = 4; this.waitT = rnd(0.4, 1.2);
      this.flankUsed = false;
    }

    // ---- 体の動き ----
    syncModel(dt) {
      const b = this.body;
      // 体の向きは、移動方向・視線へなめらかに追従。上半身のひねりで視線との差を吸収する
      const target = this.speed > 0.4 && this.state !== 'combat' && !(this.cover && this.cover.phase === 'peek') ? this.yaw : this.lookYaw;
      this.bodyYaw += angDiff(this.bodyYaw, target) * (1 - Math.exp(-dt * 8));
      b.root.position.set(this.pos.x, 0, this.pos.z);
      b.root.rotation.y = this.bodyYaw;
      const combatish = this.state === 'combat' || this.state === 'hold' || this.state === 'cover' || this.state === 'suspicious' || (this.state === 'guard' && this.alertT > 0) || this.state === 'chase' || this.state === 'flank';
      b.update({
        dt: Math.max(dt, 1e-4), speed: this.dead ? 0 : this.speed, crouch: this.crouch,
        aim: this.neckWound ? 0 : combatish ? 1 : (this.alertT > 0 ? 0.6 : 0),
        aimPitch: this.lookPitch, twist: angDiff(this.bodyYaw, this.lookYaw),
        reload: this.reloadT > 0 ? 1 - this.reloadT / this.reloadDur : -1,
        scene: G.Enemies.scene,
        lean: this.lean, prone: this.prone,
        hunch: this.neckWound || this.critical ? 1 : this.wounds.stomach ? 0.6 : 0,
        limp: this.wounds.leg ? Math.min(1, 0.65 + 0.2 * this.wounds.leg) : 0, limpSide: this.limpSide,
      });
    }

    remove(scene) { scene.remove(this.body.root); if (this.body.st.gunDropped) scene.remove(this.body.gun); this.body.dispose(); }

    updateDebugPath() {
      const D = G.Enemies.debugGroup; if (!D) return;
      if (this.debug.line) { D.remove(this.debug.line); this.debug.line.geometry.dispose(); this.debug.line = null; }
      if (!this.path || !this.path.length) return;
      const pts = [V3(this.pos.x, 0.08, this.pos.z), ...this.path.map(p => V3(p.x, 0.08, p.z))];
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const col = { flanker: 0x52c0ff, rusher: 0xff7a40, anchor: 0xb48cff, rifleman: 0xffd040 }[this.role];
      this.debug.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: col, depthTest: false }));
      this.debug.line.renderOrder = 10;
      D.add(this.debug.line);
    }
  }

  // ---------------- 敵の管理 ----------------
  // 初期位置と役割（守備役4・小銃手3・迂回役3・突撃役2）
  const SPAWNS = G.World.def.spawns;   // マップごとの初期位置と役割
  const E = G.Enemies = {
    invalidateCover() { G.coverInvalidate(); },
    list: [], reserved: new Set(), debugOn: false, debugGroup: null, scene: null, radioQueue: [],
    STATE_JA, ROLE_JA, SPAWNS,
    chooseSpawns(random=Math.random) {
      const W=G.World,start=G.Player.pos,queue=[[Math.floor(start.x),Math.floor(start.z)]],seen=new Set(),candidates=[];
      const staticOverlap=G.Doors.staticOverlap||W.overlapsSolid;
      for(let head=0;head<queue.length;head++){
        const [x,z]=queue[head],key=x+','+z;if(seen.has(key)||x<1||z<1||x>=W.W-1||z>=W.H-1)continue;seen.add(key);
        if(!W.walkable(x,z)||staticOverlap(x+.5,z+.5,.32,1.8))continue;
        for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])if(!seen.has((x+dx)+','+(z+dz)))queue.push([x+dx,z+dz]);
        const dist=Math.hypot(x+.5-start.x,z+.5-start.z);
        if(dist<(W.def.outdoor?16:12)||W.overlapsSolid(x+.5,z+.5,.34,1.8))continue;
        if(W.lineOfSight(start.x,1.6,start.z,x+.5,1.6,z+.5))continue;
        candidates.push([x,z]);
      }
      const chosen=[],used=new Set();
      for(const anchor of SPAWNS){
        let pool=candidates.filter(p=>!used.has(p.join(','))&&chosen.every(q=>Math.hypot(q[0]-p[0],q[1]-p[1])>=2.5));
        const local=pool.filter(p=>Math.hypot(p[0]-anchor[0],p[1]-anchor[1])<9);if(local.length)pool=local;
        if(!pool.length){this.spawnWarning='Safe spawn pool exhausted';break;}
        const p=pool[Math.min(pool.length-1,Math.floor(random()*pool.length))];chosen.push([p[0],p[1],anchor[2]]);used.add(p.join(','));
      }
      this.spawnReport={safeCandidates:candidates.length,reachable:seen.size,positions:chosen.map(p=>p.slice()),complete:chosen.length===SPAWNS.length};return chosen;
    },
    spawn(scene) {
      this.scene = scene;
      if (!this.debugGroup) { this.debugGroup = new THREE.Group(); this.debugGroup.visible = false; scene.add(this.debugGroup); }
      this.clear();
      const starts=G.Game?.testMode&&!new URLSearchParams(location.search).has('randomspawns')?SPAWNS:this.chooseSpawns();
      starts.forEach((s, i) => this.list.push(new Enemy(i + 1, s, s[2], scene)));
      for (const e of this.list) {
        e.debug.seen = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4040, depthTest: false }));
        e.debug.heard = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd040, depthTest: false }));
        e.debug.seen.renderOrder = e.debug.heard.renderOrder = 11;
        this.debugGroup.add(e.debug.seen, e.debug.heard);
      }
    },
    clear() {
      for (const e of this.list) e.remove(this.scene);
      if (this.debugGroup) { while (this.debugGroup.children.length) { const c = this.debugGroup.children.pop(); if (c.geometry) c.geometry.dispose(); } }
      this.list = []; this.reserved.clear(); this.radioQueue = [];
    },
    update(dt, player) {
      Path.budget = 2;   // 経路探索は1フレームに2回まで（重い計算が重ならないように）
      // 無線は少し遅れて届く
      for (let i = this.radioQueue.length - 1; i >= 0; i--) {
        const r = this.radioQueue[i]; r.t -= dt;
        if (r.t <= 0) { this.radioQueue.splice(i, 1); if (!r.to.dead&&(!r.from||!r.from.dead&&!r.from.neckWound&&!(r.from.blindT>0))) {r.to.receiveReport(r.pos, r.vel);G.Stealth13?.record('radio-received',r.to,{from:r.from?.id});}else G.Stealth13?.record('radio-cancelled',r.from); }
      }
      for (const e of this.list) e.update(dt, e.dead ? player : e.pickTarget(player));
      if (this.debugOn) for (const e of this.list) {
        e.debug.seen.visible = !!e.lastSeenPos && !e.dead; if (e.lastSeenPos) e.debug.seen.position.set(e.lastSeenPos.x, 0.15, e.lastSeenPos.z);
        e.debug.heard.visible = !!e.heardPos && !e.dead; if (e.heardPos) e.debug.heard.position.set(e.heardPos.x, 0.3, e.heardPos.z);
        if (e.debug.line) e.debug.line.visible = !e.dead && !!e.path;
      }
    },
    broadcast(pos, radius, kind, isPlayer, source) {
      for (const e of this.list) if (e !== source) e.hear(pos, radius, kind, isPlayer);
    },
    radio(from, pos, vel) {
      for (const e of this.list) {
        if (e === from || e.dead) continue;
        if (e.pos.distanceTo(from.pos) > RADIO_RANGE) continue;
        this.radioQueue.push({ to: e, pos: pos.clone(), vel: vel.clone(), t: rnd(0.4, 0.8) });
      }
    },
    // 仲間が倒れた：近くで見ていた敵は警戒し、身を隠す
    onDeath(dead) {
      if (G.Pickups) G.Pickups.spawn('ammo', dead.pos, dead);
      if (G.Effects.bloodPool) G.Effects.bloodPool(dead.pos);
      G.Stealth13?.witnessDeath(dead);
    },
    pushers() { return this.list.filter(e => e.pushing).length; },
    // 手りゅう弾が跳ねた音：近くの敵は見えなくても気づく
    broadcastGrenade(g) { for (const e of this.list) if (G.Stealth13.sound(e,g.p,6,'bounce',false)) e.noticeGrenade(g); },
    // 爆発：生き残った近くの敵は身を隠す
    onExplosion(c) {
      for (const e of this.list) {
        if (e.dead) continue;
        const d = e.pos.distanceTo(c);
        if (d < 14 && G.Stealth13.sound(e,c,70,'explosion',false)) { e.alertT = 45; if (e.state === 'evade') continue; e.body.hit((Math.random() - 0.5), 1, true); }
      }
    },
    alive() { return this.list.filter(e => !e.dead).length; },
    setDebug(on) { this.debugOn = on; if (this.debugGroup) this.debugGroup.visible = on; },
  };
})();

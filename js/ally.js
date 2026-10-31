// ===== AIの仲間（2人） =====
// ・プレイヤーの少し後ろについて動く（Fキーで「ついてこい／その場で待て」）
// ・敵が見えたら遮蔽物の陰から撃つ。突っ込まず、敵との距離を保つ
// ・プレイヤーが射線に入る位置では撃たず、横へずれてから撃つ（それでも外れ弾は当たりうる＝誤射あり）
// ・撃たれれば出血し、脚に3発で這うだけになり、放っておけば失血死する。安全なときに自分で処置する
'use strict';
(function () {
  const G = window.G;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  const NAMES = ['ALPHA', 'BRAVO'];
  const SLOTS = [[-1.5, 1.9], [1.5, 1.9]];   // プレイヤーから見た位置（右・後ろ）

  class Ally {
    constructor(id, scene, start) {
      this.id = id; this.name = NAMES[id];
      this.body = G.Humanoid.create({ style: 'swat', team: G.Game.team, gear: 'helmet-sunglasses' }); scene.add(this.body.root);
      this.body.setWeapon('rifle');
      this.body.onSound = (kind, p) => { const at = p ? p.clone() : this.body.hipsWorld.clone(); if (kind === 'knee') G.Audio.kneeDrop(at); else if (kind === 'fall') G.Audio.bodyFall(at); else if (kind === 'gun') G.Audio.gunClatter(at); };
      this.pos = start.clone(); this.vel = V3(0, 0, 0);
      this.yaw = Math.PI; this.lookYaw = Math.PI; this.bodyYaw = Math.PI; this.lookPitch = 0;
      this.hp = 100; this.dead = false;
      this.ammo = 30; this.reserve = 150; this.reloadT = 0; this.fireCD = 0; this.burst = 0;
      this.target = null; this.reaction = 0; this.seenT = -99; this.percT = Math.random() * 0.15;
      this.lastContactReport = -99;
      this.path = null; this.pathIdx = 0; this.goal = null; this.repathT = 0;
      this.moveGoal = null; this.moveState = 'none';
      this.crouch = 0; this.wantCrouch = false; this.prone = false;
      this.posture = 'stand'; this.sprinting = false; this.moving = false; this.lastShotT = -99;
      this.wounds = []; this.med = { tq: 1, hemo: 1, band: 2 }; this.treat = null; this.legHits = 0; this.crippled = false;
      this.legLost = null; this.armLost = null; this.headLost = false; this.hurtT = -99; this.threat = null;
      this.sideStep = 0; this.sideT = 0; this.speed = 0; this.stepDist = 0; this.voiceT = 0;
      this.syncModel(1 / 60);
    }
    // ---- 敵から見たときの形（プレイヤーと同じ） ----
    visPoints() {
      const b = this.body, c = V3(); b.bones.chest.getWorldPosition(c);
      return [V3(b.headWorld.x, b.headWorld.y, b.headWorld.z), c, V3(b.hipsWorld.x, b.hipsWorld.y, b.hipsWorld.z)];
    }
    camPos() { return V3(this.body.headWorld.x, this.body.headWorld.y, this.body.headWorld.z); }
    eyePos() { return this.camPos(); }
    voicePos() {
      if (this.body.missing?.has('head')) return null;
      this.body.root.updateMatrixWorld(true);
      return this.body.bones.head.localToWorld(V3(0, 0.1, 0.01));
    }
    say(type, vol = 1) {
      const at = this.voicePos();
      if (at) G.Audio.voice(at, type, 1, vol, 'ally' + this.id, () => this.voicePos());
    }

    // ---- 被弾・出血 ----
    hurt(dmg, from, area) {
      if (this.dead) return;
      if (this.headLost) dmg = 999;
      this.hp -= dmg; this.hurtT = G.time;
      if (from) { this.threat = from.clone(); this.alert = 6; }
      if (this.treat) this.treat = null;
      if (this.hp <= 0) { this.die(from, area === 'head'); return; }
      if (dmg >= 6) this.addWound(area);
      if (area === 'leg') { this.legHits++; if (this.legHits >= 3) this.cripple(); }
      if (G.time - this.voiceT > 0.6) { this.voiceT = G.time; this.say(dmg > 30 ? 'pain' : 'hurt', 0.9); }
    }
    addWound(area) {
      area = area || (Math.random() < 0.55 ? 'torso' : Math.random() < 0.5 ? 'arm' : 'leg');
      if (area === 'head') area = 'torso';
      const heavyP = area === 'torso' ? 0.18 : 0.28;
      let type = null;
      if (Math.random() < heavyP) type = area === 'torso' ? 'torso' : 'limb';
      else if (Math.random() < 0.75) type = 'light';
      if (!type) return;
      this.wounds.push({ type, area, rate: G.BLEED[type].rate, packed: false });
    }
    bleedRate() { return this.wounds.reduce((s, w) => s + w.rate, 0); }
    cripple() {
      if (this.crippled) return; this.crippled = true; this.prone = true; this.wantCrouch = false;
      G.HUD.msg(this.name + 'が脚を撃たれて動けない', 3);
    }
    loseLeg(side, from) {
      if (this.legLost || this.dead) return;
      const piece = G.Physics.sever(this.body, { part: 'legs', side, dir: from ? this.pos.clone().sub(from).setY(0).normalize() : V3(0, 0, 1) });
      if (!piece) return;
      this.legLost = side >= 0 ? 'L' : 'R';
      this.wounds.push({ type: 'limb', area: 'leg', rate: 1.8, packed: false, stump: true });
      this.cripple(); G.HUD.msg(this.name + 'が脚を失った！ 止血帯を', 3.5);
    }
    loseArm(side, from) {
      if (this.armLost || this.dead) return;
      const piece = G.Physics.sever(this.body, { part: 'arms', side, fore: false, dir: from ? this.pos.clone().sub(from).setY(0).normalize() : V3(0, 0, 1) });
      if (!piece) return;
      this.armLost = side >= 0 ? 'L' : 'R';
      this.wounds.push({ type: 'limb', area: 'arm', rate: 1.5, packed: false, stump: true });
      G.HUD.msg(this.name + 'が腕を失った！', 3);
    }
    die(from, head) {
      if (this.dead) return;
      this.dead = true; this.hp = 0; this.treat = null;
      this.body.flash.visible = false;
      const away = from ? this.pos.clone().sub(from).setY(0).normalize() : V3(0, 0, 1);
      const fwd = V3(Math.sin(this.bodyYaw), 0, Math.cos(this.bodyYaw));
      this.body.die('x', away.dot(fwd) >= 0 ? 1 : -1, head);
      if (head && G.Game.dismember && (this.headLost || Math.random() < 0.5)) this.body.st.sever = { part: 'head', side: 0, dir: away };
      G.Audio.deathVoice(this.voicePos(), 1, 'ally' + this.id, () => this.voicePos(), head ? 'head' : !from && this.bleedRate() > 0 ? 'bleed' : 'body');
      G.HUD.msg(this.name + '：死亡', 4); G.Allies.refreshSelection(); G.HUD.allies();
      if (G.Effects.bloodPool) G.Effects.bloodPool(this.pos);
    }
    // 処置：いちばん危ない傷から（treater：処置する人の医療品を使う。仲間どうし・プレイヤーからも）
    pickTreat(med) {
      const todo = this.wounds.filter(w => w.rate > 0).sort((a, b) => b.rate - a.rate);
      for (const w of todo) {
        const want = G.BLEED[w.type].item;
        if (!w.packed && med[want] > 0) return { w, item: want, full: true };
        if (w.type !== 'light' && !w.packed && med.band > 0) return { w, item: 'band', full: false };
      }
      return null;
    }
    applyTreat(T, med) {
      med[T.item] = Math.max(0, med[T.item] - 1);
      if (T.full) this.wounds = this.wounds.filter(x => x !== T.w);
      else { T.w.packed = true; T.w.rate *= T.w.type === 'torso' ? 0.5 : 0.4; }
    }

    // ---- 移動 ----
    goTo(p) {
      if (this.goal && this.goal.distanceTo(p) < 1.2) return;
      this.goal = p.clone();
      // まっすぐ行けるなら経路探索はしない
      if (G.World.walkLineClear(this.pos.x, this.pos.z, p.x, p.z, 0.32)) { this.path = [p.clone()]; this.pathIdx = 0; }
      else if (this.repathT <= 0) { this.path = null; }
    }
    follow(dt, speed) {
      if (!this.goal) return 'none';
      if (!this.path && this.repathT <= 0) {
        if (G.Path.budget <= 0) return 'wait';
        G.Path.budget--;
        const raw = G.Path.find(this.pos.x, this.pos.z, this.goal.x, this.goal.z, null);
        this.repathT = 1.0;
        if (!raw) { this.goal = null; return 'fail'; }
        this.path = G.Path.smooth(this.pos, raw); this.pathIdx = 0;
        if (!this.path || !this.path.length) this.path = [raw[raw.length - 1]];
      }
      if (!this.path) return 'wait';
      if (this.pathIdx >= this.path.length) { this.goal = null; this.path = null; return 'arrived'; }
      const wp = this.path[this.pathIdx], dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.3) { this.pathIdx++; return 'moving'; }
      this.moveDir(dx / d, dz / d, speed, dt);
      return 'moving';
    }
    moveDir(nx, nz, speed, dt, keepFacing) {
      if (this.crippled) speed = Math.min(speed, 0.35);
      // プレイヤーや仲間と重ならない
      const P = G.Player;
      for (const o of [P, ...G.Allies.list]) {
        if (o === this || o.dead) continue;
        const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z, dd = Math.hypot(ox, oz);
        if (dd < 0.9 && dd > 1e-4) { nx += ox / dd * (0.9 - dd) * 2; nz += oz / dd * (0.9 - dd) * 2; }
      }
      const l = Math.hypot(nx, nz) || 1;
      const before = this.pos.clone();
      G.World.moveCircle(this.pos, nx / l * speed * dt, nz / l * speed * dt, 0.3, this.crippled ? 0.6 : 1.8);
      const moved = this.pos.distanceTo(before);
      this.speed = moved / Math.max(dt, 1e-4);
      if (!keepFacing && moved > 1e-3) { this.yaw = Math.atan2(nx, nz); this.lookYaw = this.yaw; }
      this.stepDist += moved;
    }
    aimAt(p, dt, rate) {
      const want = Math.atan2(p.x - this.pos.x, p.z - this.pos.z), d = angDiff(this.yaw, want);
      this.yaw += Math.max(-rate * dt, Math.min(rate * dt, d)); this.lookYaw = this.yaw;
      this.lookPitch = Math.atan2(p.y - this.eyePos().y, Math.hypot(p.x - this.pos.x, p.z - this.pos.z));
    }
    // 近くで、脅威から見えない遮蔽位置
    findCover(threat, maxD) {
      // 近い順に、見通しを調べるのは最大12か所まで
      const cands = G.getCoverCells().map(c => ({ c, d: c.distanceTo(this.pos) })).filter(o => o.d <= maxD).sort((a, b) => a.d - b.d);
      let checked = 0;
      for (const { c } of cands) {
        const pd = c.distanceTo(G.Player.pos); if (pd < 0.9) continue;
        if (G.Allies.list.some(o => o !== this && !o.dead && o.goal && o.goal.distanceTo(c) < 0.8)) continue;
        if (++checked > 12) break;
        if (!G.World.lineOfSight(threat.x, 1.4, threat.z, c.x, 1.0, c.z)) return c;
      }
      return null;
    }

    // ---- 見る：視界にいる一番近い敵 ----
    perceive() {
      const eye = this.eyePos();
      let best = null, bd = Infinity;
      for (const e of G.Enemies.list) {
        if (e.dead) continue;
        const ep = e.eyePos(), d = eye.distanceTo(ep);
        if (d > 45 || d > bd) continue;
        const off = Math.abs(angDiff(this.lookYaw, Math.atan2(ep.x - eye.x, ep.z - eye.z)));
        if (off > 1.25 && d > 3 && !(this.alert > 0 && off < 2.4)) continue;
        const c = V3(); e.body.bones.chest.getWorldPosition(c);
        if (!G.World.lineOfSight(eye.x, eye.y, eye.z, c.x, c.y, c.z) && !G.World.lineOfSight(eye.x, eye.y, eye.z, ep.x, ep.y, ep.z)) continue;
        best = e; bd = d;
      }
      if (best && best !== this.target) {
        this.reaction = rnd(0.35, 0.6);
        if (G.time - this.lastContactReport > 8 && G.time - G.Radio.lastContact > 3) {
          this.lastContactReport = G.Radio.lastContact = G.time;
          const alerted = best.awareness >= 1 || ['combat', 'cover', 'hold', 'chase', 'flank', 'evade'].includes(best.state);
          G.Radio.say(this, 'Enemy spotted! Engaging.', alerted ? 'shout' : 'whisper');
        }
      }
      this.target = best;
      if (best) { this.seenT = G.time; this.threat = best.pos.clone(); }
    }
    // 射線上（銃口から狙う点まで）にプレイヤーや仲間がいるか
    lineBlockedByFriend(from, to) {
      const seg = to.clone().sub(from), L = seg.length(); seg.normalize();
      const pts = [G.Player.camPos().clone(), G.Player.pos.clone().setY(G.Player.posture === 'prone' ? 0.3 : 1.0)];
      for (const o of G.Allies.list) if (o !== this && !o.dead) pts.push(...o.visPoints());
      for (const p of pts) { const v = p.clone().sub(from), t = v.dot(seg); if (t > 0 && t < L && v.addScaledVector(seg, -t).length() < 0.7) return true; }
      return false;
    }

    // ---- 射撃（命中は確率、外れ弾は実際に飛ぶ：プレイヤーに当たることもある） ----
    tryFire(dt) {
      const e = this.target; if (!e || this.reloadT > 0 || this.treat) return;
      this.fireCD -= dt; this.reaction -= dt;
      if (this.fireCD > 0 || this.reaction > 0) return;
      if (this.ammo <= 0) { this.startReload(); return; }
      const muzzle = V3(); this.body.muzzle.getWorldPosition(muzzle);
      const aim = V3(); e.body.bones.chest.getWorldPosition(aim);
      if (this.lineBlockedByFriend(muzzle, aim)) {
        // 撃たずに横へずれる
        if (this.sideT <= 0) { this.sideStep = Math.random() < 0.5 ? -1 : 1; this.sideT = 0.9; }
        this.fireCD = 0.25; return;
      }
      this.ammo--; this.burst--; this.lastShotT = G.time;
      this.fireCD = this.burst > 0 ? 0.11 : rnd(0.45, 0.85);
      if (this.burst <= 0) this.burst = 3 + (Math.random() * 3 | 0);
      this.body.fire(); this.body.flash.visible = true; this.flashT = 0.05;
      G.Audio.gunshot(muzzle, false);
      const right = V3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const forward = V3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      G.Effects.ejectCasing(muzzle.clone().addScaledVector(forward, -.3), right, 'ar', 0, forward);
      G.Effects.enemyFlash(muzzle);
      G.Enemies.broadcast(this.pos.clone().setY(1.4), 40, 'gunshot', true, null);
      const dist = muzzle.distanceTo(aim);
      let p = 0.66 - dist * 0.012;
      p *= e.prone ? 0.6 : e.crouch > 0.5 ? 0.8 : 1;
      p *= e.speed > 0.5 ? 0.8 : 1;
      p *= this.speed > 0.5 ? 0.6 : 1;
      p *= this.crippled ? 0.7 : 1;
      p *= this.armLost ? 0.45 : 1;
      p = Math.max(0.05, Math.min(0.8, p));
      if (Math.random() < p) {
        G.Effects.tracer(muzzle, aim);
        const r = Math.random();
        const part = r < 0.1 ? 'head' : r < 0.62 ? 'body' : r < 0.74 ? 'stomach' : r < 0.88 ? 'legs' : 'arms';
        const dmg = ({ head: 110, body: 30, stomach: 26, legs: 20, arms: 18 })[part];
        e.damage(dmg, part, this.pos.clone().setY(1.4), Math.random() < 0.5 ? 1 : -1);
        if (e.dead && G.time - G.Radio.lastKill > 3) { G.Radio.lastKill = G.time; G.Radio.say(this, 'Target down.'); }
        G.Effects.bloodHit(aim, aim.clone().sub(muzzle).normalize(), part === 'head');
      } else {
        // 外れ弾：実際に飛ばし、プレイヤーの近くを通れば当たる
        const miss = aim.clone().add(V3(rnd(-0.6, 0.6), rnd(-0.4, 0.5), rnd(-0.6, 0.6)));
        const d = miss.sub(muzzle).normalize();
        const h = G.World.raycast(muzzle.x, muzzle.y, muzzle.z, d.x, d.y, d.z, 80);
        const maxT = h ? h.t : 80;
        const P = G.Player;
        if (!P.dead) for (const q of P.visPoints()) {
          const v = q.clone().sub(muzzle), t = v.dot(d);
          if (t > 0 && t < maxT && v.addScaledVector(d, -t).length() < 0.22) {
            P.hurt(rnd(12, 18), this.pos.clone(), q.y > P.camPos().y - 0.15 ? 'head' : q.y < 0.7 ? 'leg' : 'torso');
            G.HUD.msg(this.name + 'の誤射！', 2); break;
          }
        }
        const end = h ? V3(h.x, h.y, h.z) : muzzle.clone().addScaledVector(d, 80);
        G.Effects.tracer(muzzle, end);
        if (h) G.Effects.impact(h);
      }
    }
    startReload() {
      if (this.reloadT > 0 || this.ammo >= 30 || this.reserve <= 0) return;
      this.reloadT = this.armLost ? 4.0 : 2.4;
      G.Audio.reload('out', this.pos.clone().setY(1.2));
    }

    // ---- 1フレーム ----
    update(dt, P) {
      if (this.dead) { this.syncModel(dt); return; }
      this.repathT -= dt; this.sideT -= dt; this.alert = Math.max(0, (this.alert || 0) - dt);
      if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.body.flash.visible = false; }
      // 出血
      const br = this.bleedRate();
      if (br > 0) { this.hp -= br * dt; if (this.hp <= 0) { this.die(null, false); return; } }
      if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) { const take = Math.min(30 - this.ammo, this.reserve); this.ammo += take; this.reserve -= take; G.Audio.reload('in', this.pos.clone().setY(1.2)); } }
      this.percT -= dt; if (this.percT <= 0) { this.percT = 0.15; this.perceive(); }
      this.speed = 0;
      const combat = !!this.target;
      // 自分で処置：敵が見えていない時だけ
      if (this.treat) {
        this.treat.t += dt;
        if (combat || this.target) { this.treat = null; }
        else if (this.treat.t >= G.MED[this.treat.item].time) { this.applyTreat(this.treat, this.med); this.treat = null; G.Audio.treat && G.Audio.treat('end', 'band'); }
      } else if (br > 0 && !combat && G.time - this.seenT > 1.5 && G.time - this.hurtT > 1) {
        const T = this.pickTreat(this.med);
        if (T) { this.treat = { ...T, t: 0 }; this.goal = null; }
      }
      if (combat) {
        const e = this.target, ep = V3(); e.body.bones.chest.getWorldPosition(ep);
        this.aimAt(ep, dt, 5);
        // 慎重に：撃たれていて身をさらしているなら近くの遮蔽物へ。そうでなければその場で（しゃがんで）撃つ
        const exposedHurt = G.time - this.hurtT < 2;
        if (!this.crippled && exposedHurt && !this.coverGoal) {
          const c = this.findCover(e.pos, 4.5);
          if (c) { this.coverGoal = c; this.goTo(c); }
        }
        if (this.coverGoal && this.goal) { this.follow(dt, 2.8); this.wantCrouch = false; }
        else {
          this.coverGoal = null;
          this.wantCrouch = !this.crippled && e.pos.distanceTo(this.pos) > 5;
          if (this.sideT > 0) this.moveDir(Math.cos(this.yaw) * this.sideStep, -Math.sin(this.yaw) * this.sideStep, 1.4, dt, true);
          this.tryFire(dt);
        }
      } else {
        this.coverGoal = null;
        if (!this.treat) {
          // プレイヤーについていく（待機中はその場で、脅威の方向を見張る）
          if (this.moveState === 'moving' && this.moveGoal) {
            if (this.pos.distanceTo(this.moveGoal) < 0.65) {
              this.moveState = 'holding'; this.goal = null; this.path = null;
              G.Radio.say(this, 'In position.');
            } else {
              this.goTo(this.moveGoal);
              const result = this.follow(dt, 2.9);
              if (result === 'fail') { this.moveState = 'holding'; G.Radio.say(this, 'Unable to reach the mark.'); }
              this.wantCrouch = false;
            }
          } else if (this.moveState === 'holding') {
            this.goal = null; this.wantCrouch = !this.crippled;
            if (this.threat) this.aimAt(this.threat.clone().setY(1.2), dt, 2);
          } else if (G.Allies.mode === 'follow') {
            const s = SLOTS[this.id], cy = Math.cos(P.yaw), sy = Math.sin(P.yaw);
            const slot = V3(P.pos.x + s[0] * cy + s[1] * sy, 0, P.pos.z - s[0] * sy + s[1] * cy);
            if (!G.World.walkable(Math.floor(slot.x), Math.floor(slot.z))) { const n = G.Path.nearestWalkable(Math.floor(slot.x), Math.floor(slot.z)); if (n) slot.set(n[0] + 0.5, 0, n[1] + 0.5); }
            const d = this.pos.distanceTo(slot);
            if (d > 1.3) { this.goTo(slot); this.follow(dt, d > 8 ? 3.6 : P.sprinting ? 3.4 : 2.4); }
            else {
              // 着いたら、プレイヤーと同じ方向を見張る
              this.goal = null; this.path = null;
              this.lookYaw += angDiff(this.lookYaw, Math.atan2(-Math.sin(P.yaw), -Math.cos(P.yaw))) * Math.min(1, dt * 2); this.yaw = this.lookYaw;
            }
            this.wantCrouch = P.posture !== 'stand' && !this.crippled;
          } else {
            this.goal = null; this.wantCrouch = !this.crippled;
            if (this.threat) this.aimAt(this.threat.clone().setY(1.2), dt, 2);
          }
        }
        if (this.ammo < 15 && !this.treat) this.startReload();
      }
      this.crouch += ((this.wantCrouch ? 1 : 0) - this.crouch) * Math.min(1, dt * 6);
      this.posture = this.crippled ? 'prone' : this.crouch > 0.5 ? 'crouch' : 'stand';
      this.moving = this.speed > 0.3;
      if (this.stepDist > G.strideFor(Math.max(0.5, this.speed), this.crippled)) {
        this.stepDist = 0;
        G.Audio.footstep(this.pos.clone().setY(0.05), this.speed > 2.5 ? 0.9 : 0.5, false, this.speed > 2.5 ? 'run' : 'walk');
      }
      this.syncModel(dt);
    }
    syncModel(dt) {
      const b = this.body;
      const target = this.speed > 0.4 && !this.target ? this.yaw : this.lookYaw;
      this.bodyYaw += angDiff(this.bodyYaw, target) * (1 - Math.exp(-dt * 8));
      b.root.position.set(this.pos.x, 0, this.pos.z); b.root.rotation.y = this.bodyYaw;
      b.update({
        dt: Math.max(dt, 1e-4), speed: this.dead ? 0 : this.speed, crouch: this.crouch,
        aim: this.target ? 1 : 0.5, aimPitch: this.lookPitch, twist: angDiff(this.bodyYaw, this.lookYaw),
        reload: this.reloadT > 0 ? 1 - this.reloadT / (this.armLost ? 4 : 2.4) : -1, scene: G.Game.scene,
        lean: 0, prone: this.crippled || this.prone, hunch: this.hp < 40 ? 0.6 : 0, limp: this.legHits ? 0.7 : 0, limpSide: 1,
      });
    }
    remove(scene) { scene.remove(this.body.root); if (this.body.st.gunDropped) scene.remove(this.body.gun); this.body.dispose(); }
  }

  const Radio = G.Radio = {
    queue: [], active: false, lastContact: -99, lastKill: -99,
    phrases: {
      'Enemy spotted! Engaging.': ['contact', '敵を確認、交戦する！'],
      'Target down.': ['kill', '標的を制圧。'],
      'In position.': ['arrived', '指定位置に到着。'],
      'Unable to reach the mark.': ['unreachable', '指定地点に到達できない。'],
      'Roger. On your six.': ['follow', '了解、後方につく。'],
      'Copy. Holding position.': ['hold', '了解、この場を確保する。'],
      'Roger. Moving to your mark.': ['move', '了解、指定地点へ向かう。'],
      'Copy. Moving out.': ['move2', '了解、移動開始。'],
    },
    reset() {
      this.generation = (this.generation || 0) + 1;
      try { this.currentSource?.stop(); } catch (_) { }
      this.currentSource = null;
      this.queue.length = 0; this.active = false; this.currentTone = null; this.lastContact = -99; this.lastKill = -99;
      clearTimeout(this.timer);
      document.getElementById('radio-line')?.classList.remove('show');
    },
    say(ally, line, tone = 'normal') {
      if (!ally || ally.dead || this.queue.length >= 3) return;
      this.queue.push({ ally, line, tone }); this.pump();
    },
    pump() {
      if (this.active || !this.queue.length) return;
      const { ally, line, tone } = this.queue.shift();
      this.active = true;
      this.currentTone = tone;
      const generation = this.generation;
      const phrase = this.phrases[line];
      G.HUD.radio(ally.name, line, phrase?.[1] || '');
      const done = () => { if (!this.active || generation !== this.generation) return; this.active = false; this.currentSource = null; clearTimeout(this.timer); this.timer = setTimeout(() => this.pump(), 180); };
      const id = phrase?.[0] === 'contact' && tone !== 'normal' ? `contact_${tone}` : phrase?.[0];
      const src = id && G.Audio.radioVoice(ally, id, tone);
      this.currentSource = src || null;
      if (src) src.addEventListener('ended', done, { once: true });
      this.timer = setTimeout(done, src ? src.buffer.duration * 1000 + 450 : 1000);
    },
  };

  const A = G.Allies = {
    list: [], mode: 'follow', count: 2, selection: 'both', commandPoint: null, commandAssigned: [],
    reset(scene) {
      for (const a of this.list) a.remove(scene);
      this.list = []; this.mode = 'follow'; this.selection = 'both'; this.commandPoint = null; this.commandAssigned = []; Radio.reset(); this.refreshSelection();
      const n = G.Game.allyCount !== undefined ? G.Game.allyCount : 2;
      const P = G.Player;
      // 出撃時の位置：自分のまわりの、空いていて互いに離れたマス（近い順に探す）
      const taken = [P.pos.clone()];
      const px = Math.floor(P.pos.x), pz = Math.floor(P.pos.z);
      const cells = [];
      for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
        const x = px + dx, z = pz + dz;
        if (!G.World.walkable(x, z) || G.World.overlapsSolid(x + 0.5, z + 0.5, 0.32, 1.8)) continue;
        cells.push(V3(x + 0.5, 0, z + 0.5));
      }
      cells.sort((a, b) => a.distanceTo(P.pos) - b.distanceTo(P.pos));
      for (let i = 0; i < n; i++) {
        const c = cells.find(c => taken.every(t => t.distanceTo(c) >= 1.2) && G.World.walkLineClear(P.pos.x, P.pos.z, c.x, c.z, 0.3)) || cells.find(c => taken.every(t => t.distanceTo(c) >= 1.2));
        const at = c ? c.clone() : V3(P.pos.x + (i ? 1.2 : -1.2), 0, P.pos.z + 1.2);
        taken.push(at);
        this.list.push(new Ally(i, scene, at));
      }
      this.refreshSelection();
    },
    alive() { return this.list.filter(a => !a.dead); },
    toggleMode() {
      this.mode = this.mode === 'follow' ? 'hold' : 'follow';
      this.commandPoint = null; this.commandAssigned = [];
      for (const a of this.list) { a.moveGoal = null; a.moveState = 'none'; a.goal = null; a.path = null; }
      G.HUD.msg(this.mode === 'follow' ? '仲間：ついてこい' : '仲間：その場で待て', 2);
      const speaker = this.alive()[0]; if (speaker) Radio.say(speaker, this.mode === 'follow' ? 'Roger. On your six.' : 'Copy. Holding position.');
    },
    select(which) { this.selection = which; this.refreshSelection(); },
    cycleSelection() { const choices = ['both', 'alpha', 'bravo']; this.select(choices[(choices.indexOf(this.selection) + 1) % choices.length]); },
    refreshSelection() {
      const box = document.getElementById('squad-select'); if (!box) return;
      if (this.selection !== 'both' && !this.list.some(a => !a.dead && a.name.toLowerCase() === this.selection)) this.selection = 'both';
      for (const b of box.querySelectorAll('button')) {
        b.disabled = !this.list.some(a => !a.dead && (b.dataset.squad === 'both' || a.name.toLowerCase() === b.dataset.squad));
        b.classList.toggle('on', b.dataset.squad === this.selection);
        b.setAttribute('aria-pressed', String(b.dataset.squad === this.selection));
      }
    },
    orderAtReticle() {
      if (G.Input.isDown('sprint')) { this.cycleSelection(); return; }
      if (!this.alive().length) { G.HUD.msg('指示できる仲間がいません'); return; }
      const camera = G.camera, origin = camera.position.clone(), dir = V3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
      const wall = G.World.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 65);
      let maxT = wall ? wall.t : 65, enemy = null;
      for (const e of G.Enemies.list) { if (e.dead) continue; const h = e.rayHit(origin, dir, maxT); if (h) { maxT = h.t; enemy = e; } }
      if (!wall && !enemy) { G.HUD.msg('照準を移動したい場所へ向けてください'); return; }
      const point = enemy ? enemy.pos.clone() : origin.clone().addScaledVector(dir, Math.max(0.5, maxT - (wall.ny === 0 ? 0.55 : 0)));
      let cell = [Math.floor(point.x), Math.floor(point.z)];
      if (!G.World.walkable(cell[0], cell[1]) || G.World.overlapsSolid(point.x, point.z, 0.35, 1.8)) {
        const near = G.Path.nearestWalkable(cell[0], cell[1]);
        if (!near || Math.hypot(near[0] + 0.5 - point.x, near[1] + 0.5 - point.z) > 2.5) { G.HUD.msg('そこには移動できません'); return; }
        cell = near; point.set(cell[0] + 0.5, 0, cell[1] + 0.5);
      }
      point.y = 0;
      this.orderMove(point);
    },
    orderMove(point) {
      const selected = this.alive().filter(a => this.selection === 'both' || this.selection === a.name.toLowerCase());
      if (!selected.length) { G.HUD.msg('選択した仲間は行動できません'); return false; }
      const assigned = [];
      for (const a of selected) {
        const spread = selected.length > 1 ? (a.id === 0 ? -0.55 : 0.55) : 0;
        const target = point.clone().add(V3(spread, 0, 0));
        if (!G.World.walkable(Math.floor(target.x), Math.floor(target.z)) || G.World.overlapsSolid(target.x, target.z, 0.32, 1.8)) target.copy(point);
        if (!G.Path.find(a.pos.x, a.pos.z, target.x, target.z, null)) continue;
        a.moveGoal = target; a.moveState = 'moving'; a.goal = null; a.path = null; a.repathT = 0; assigned.push(a);
      }
      if (!assigned.length) { G.HUD.msg('その場所への経路がありません'); return false; }
      this.commandPoint = point.clone(); this.commandAssigned = assigned;
      G.HUD.msg(assigned.map(a => a.name).join('・') + '：指定地点へ移動', 2);
      Radio.say(assigned[0], 'Roger. Moving to your mark.');
      if (assigned[1]) Radio.say(assigned[1], 'Copy. Moving out.');
      return true;
    },
    // プレイヤーの近くで出血している仲間（処置の対象）
    nearbyWounded(P) {
      let best = null, bd = 1.8;
      for (const a of this.list) { if (a.dead || !a.bleedRate()) continue; const d = a.pos.distanceTo(P.pos); if (d < bd) { bd = d; best = a; } }
      return best;
    },
    update(dt, P) { for (const a of this.list) a.update(dt, P); },
  };
  document.querySelectorAll('#squad-select button').forEach(b => b.addEventListener('click', () => A.select(b.dataset.squad)));
})();

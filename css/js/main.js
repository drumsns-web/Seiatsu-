// ===== プレイヤー、ゲーム進行、HUD、メニュー =====
'use strict';
(function () {
  const G = window.G;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // 武器の性能（調整はここ）
  const WEAPONS = G.WEAPONS = {
    ar: { id: 'ar', name: 'M4A1 カービン', short: 'ライフル', mag: 30, reserve: 240, maxReserve: 330, interval: 60 / 650, auto: true,
      dmg: { head: 120, body: 34, stomach: 30, legs: 24, arms: 20 }, range: 150, pellets: 1,
      spreadHip: 0.014, spreadMove: 0.02, spreadAds: 0.0006, kick: 0.0125, kickYaw: 0.0055, adsZoom: 0, noise: 45, pen: 0.65 },
    pistol: { id: 'pistol', name: 'Glock 17 ハンドガン', short: '拳銃', mag: 17, reserve: 60, maxReserve: 90, interval: 0.13, auto: false,
      dmg: { head: 95, body: 30, stomach: 26, legs: 20, arms: 18 }, range: 80, pellets: 1,
      spreadHip: 0.012, spreadMove: 0.018, spreadAds: 0.0025, kick: 0.024, kickYaw: 0.009, adsZoom: 1.3, noise: 35, pen: 0.45 },
    shotgun: { id: 'shotgun', name: 'Remington 870 ショットガン', short: '散弾銃', mag: 6, reserve: 30, maxReserve: 42, interval: 0.12, auto: false,
      dmg: { head: 34, body: 16, stomach: 14, legs: 11, arms: 10 }, range: 60, pellets: 9,
      spreadHip: 0.06, spreadMove: 0.015, spreadAds: 0.045, kick: 0.05, kickYaw: 0.012, adsZoom: 1.25, noise: 55, falloff: [8, 25, 0.3], pen: 0.25 },
  };
  const WEAPON = G.WEAPON = WEAPONS.ar;
  const ORDER = ['ar', 'pistol', 'shotgun'];
  const GRENADE_MAX = 3;
  // ---- 出血と応急処置。治療薬は出血がないときの体力回復に使う ----
  // 傷の種類：light＝軽い出血（包帯）、limb＝手足の動脈からの激しい出血（止血帯）、torso＝胴体の激しい出血（止血剤）
  const BLEED = {
    light: { rate: 0.18, item: 'band', name: '軽い出血' },
    limb: { rate: 1.1, item: 'tq', name: '手足の激しい出血' },
    torso: { rate: 0.8, item: 'hemo', name: '胴体の激しい出血' },
  };
  const MED = {
    tq: { name: '止血帯', time: 3.0, cost: 1 },
    hemo: { name: '止血剤', time: 4.0, cost: 1 },
    band: { name: '包帯', time: 2.5, cost: 1 },
    medicine: { name: '治療薬', time: 1.8, cost: 1 },
    stim: { name: '回復注射', time: 2, cost: 1 },
  };
  const MED_CAPACITY = 6;   // 医療ポーチに入る数
  G.BLEED = BLEED; G.MED = MED; G.MED_CAPACITY = MED_CAPACITY;
  const POSTURE = {
    stand: { eye: 1.64, body: 1.8, speed: 3.3 },
    crouch: { eye: 1.08, body: 1.2, speed: 1.7 },
    prone: { eye: 0.34, body: 0.5, speed: 0.75 },
  };
  const SPRINT_SPEED = 5.6;
  const SPEED_LEVELS = [0.35, 0.5, 0.65, 0.8, 1.0];   // 旧セーブ・テストとの互換用。操作は通常／X忍び歩き
  const BASE_FOV = 70;

  // ======================= プレイヤー =======================
  const P = G.Player = {
    reset() {
      const s = G.World.playerStart;
      this.pos = V3(s.x, 0, s.z);
      this.yaw = Math.PI; this.pitch = 0; this.recoil = 0;
      this.vel = V3(0, 0, 0);
      this.grounded = true; this.gruntT = -99; this.camInit=false; this.bobK=0; this.strafeRoll=0; this.shake=0;
      this.posture = 'stand'; this.eyeH = POSTURE.stand.eye;
      this.lean = 0; this.leanAmt = 0; this.leanOff = 0;
      this.hp = 100;
      this.wst = {}; for (const k of ORDER) this.wst[k] = { ammo: WEAPONS[k].mag, reserve: WEAPONS[k].reserve };
      this.cur = 'ar'; this.switchT = 0; this.pumpT = 0; this.prevFire = false;
      this.grenades = 2; this.gHold = false; this.gCD = 0;
      this.throwPending = 0; this.pumpPending = 0; this.attachT = 0; this.gEmptyMsg = false;
      this.walkSlow = false; this.speedLevel = SPEED_LEVELS.length; this.gearAcc = 0; this.lastYaw = Math.PI; this.turnGearT = 0;
      if (G.Viewmodel.weapons) G.Viewmodel.equip('ar');
      this.adsT = 0; this.ads = false; this.zoom = 4;
      this.sprinting = false; this.sprintBlock = 0; this.moving = false;
      this.fireCD = 0; this.lastShotT = -99; this.dryFired = false; this.fireQueueT = 0;
      this.reloading = false; this.fireWhenLoaded = false; this.knifeT = -1; this.knifeCD = 0; this.knifeHitDone = true;
      this.stepAcc = 0; this.dead = false; this.hurtT = 0;
      // 出血と医療品（出撃時の装備から）
      const lm = (G.Game.loadout && G.Game.loadout.med) || { tq: 1, hemo: 1, band: 2, medicine: 1, stim: 0 };
      this.med = { tq: lm.tq | 0, hemo: lm.hemo | 0, band: lm.band | 0, medicine: lm.medicine | 0, stim: lm.stim | 0 };
      this.wounds = []; this.treat = null; this.dripT = 0; this.bleedDeath = false;
      this.legHits = 0; this.crippled = false; this.legLost = null; this.headLost = false; this.armLost = null; this.swayT = Math.random() * 100;
      if (G.Viewmodel.setOneArm) G.Viewmodel.setOneArm(false);
      if (this.lostLegBody) { G.Physics.removeRagdoll(this.lostLegBody); G.Game.scene.remove(this.lostLegBody.root); this.lostLegBody.dispose(); this.lostLegBody = null; }
      this.kills = 0; this.shots = 0; this.hits = 0;
    },
    get ammo() { return this.wst[this.cur].ammo; }, set ammo(v) { this.wst[this.cur].ammo = v; },
    get reserve() { return this.wst[this.cur].reserve; }, set reserve(v) { this.wst[this.cur].reserve = v; },
    W() { return WEAPONS[this.cur]; },
    // 武器の持ち替え
    switchWeapon(id) {
      if (!WEAPONS[id] || id === this.cur || this.dead || this.knifeT >= 0 || this.gHold) return;
      if (this.reloading) { this.reloading = false; G.Viewmodel.cancelReload(); }
      this.fireQueueT = 0; this.fireWhenLoaded = false;
      this.cur = id; this.switchT = G.Viewmodel.SWITCH_TIME; this.pumpT = 0;
      G.Viewmodel.switchTo(id); G.Audio.reload('grab');
      HUD.ammo(); HUD.weapons();
    },
    // サプレッサー：ライフルとハンドガンに付けられる（約1.5秒の取り付け・取り外しの動き。その間は撃てない）
    toggleSuppressor() {
      const att = G.Viewmodel.att[this.cur];
      if (!att || !('sup' in att)) { HUD.msg('この武器にはサプレッサーを付けられません'); return; }
      if (this.dead || this.reloading || this.switchT > 0 || this.gHold || this.attachT > 0 || this.knifeT >= 0) return;
      this.attachT = G.Viewmodel.ATTACH_TIME;
      G.Viewmodel.startAttach(!att.sup);
      HUD.msg(att.sup ? 'サプレッサーを外す' : 'サプレッサーを付ける');
    },
    suppressed() { const a = G.Viewmodel.att[this.cur]; return !!(a && a.sup); },
    camPos() { return G.camera.position; },
    right() { return V3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); },
    // 敵から見える点（頭と胴）。リーンで頭を出せば頭が見える
    visPoints() {
      const head = this.camPos().clone();
      if (this.posture === 'prone') {
        const f = V3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        return [head, this.pos.clone().addScaledVector(f, -0.5).setY(this.pos.y + 0.25)];
      }
      return [head, V3(this.pos.x, this.pos.y + this.eyeH * 0.68, this.pos.z), V3(this.pos.x, this.pos.y + this.eyeH * 0.35, this.pos.z)];
    },
    canFit(h) { return !G.World.overlapsSolid(this.pos.x, this.pos.z, 0.3, h, this.pos.y); },
    setPosture(p) {
      if (this.crippled && p !== 'prone') { HUD.msg(this.legLost ? '脚を失っていて立てない' : '脚を撃たれていて立てない'); return false; }
      if (p === this.posture) return true;
      if (!this.grounded) return false;
      if (POSTURE[p].body > POSTURE[this.posture].body && !this.canFit(POSTURE[p].body)) { HUD.msg('頭上に障害物があります'); return false; }
      this.posture = p;
      if (p === 'prone') { this.lean = 0; }
      G.Audio.gear(null, 0.8, true);
      return true;
    },
    jump() {
      if (this.crippled) return;
      if (this.dead || !this.grounded) return;
      if (this.posture !== 'stand' && !this.setPosture('stand')) return;
      this.vel.y = 5.6; this.grounded = false; this.stepAcc = 0; this.gearPending = 0;
      G.Audio.gear(null, this.walkSlow ? .025 : 0.4, true);
    },
    // 傷を負う（area: 'torso'|'arm'|'leg'。省略時は姿勢に応じて当たりやすい場所から選ぶ）
    addWound(area, opts) {
      opts = opts || {};
      if (!area) {
        const r = Math.random(), pr = this.posture === 'prone';
        area = r < (pr ? 0.45 : 0.55) ? 'torso' : r < (pr ? 0.72 : 0.77) ? 'arm' : 'leg';
      }
      // 激しい出血になる確率（手足は動脈、胴体は内臓・大きな血管）。それ以外は軽い出血か、出血なし
      const heavyP = opts.heavy !== undefined ? opts.heavy : area === 'torso' ? 0.18 : 0.28;
      let type = null;
      if (Math.random() < heavyP) type = area === 'torso' ? 'torso' : 'limb';
      else if (Math.random() < (opts.lightP !== undefined ? opts.lightP : 0.75)) type = 'light';
      if (!type) return null;
      const w = { type, area, rate: BLEED[type].rate, packed: false, t: G.time };
      this.wounds.push(w);
      if (this.wounds.length > 8) this.wounds.shift();
      if (type !== 'light') HUD.msg(BLEED[type].name + '　' + G.keyName(G.Input.binds.treat) + ' で処置', 2.5);
      HUD.medical();
      return w;
    },
    bleedRate() { return this.wounds.reduce((s, w) => s + w.rate, 0); },
    // 立てなくなる：伏せたまま、這って移動しかできない（撃つこと・処置はできる）
    cripple(reason) {
      if (this.crippled || this.dead) return;
      this.crippled = true;
      this.posture = 'prone'; this.lean = 0; this.sprinting = false; this.ads = false;
      G.Audio.playerVoice('hurt'); this.shake = Math.max(this.shake || 0, 0.6);
      HUD.msg(reason || '脚を撃たれて立てない…這って動くしかない', 4);
    },
    // 片腕を失う：両手で構える主力武器は狙いが大きくぶれ、反動も抑えられない。ハンドガンは比較的扱える
    loseArm(side, from) {
      if (this.armLost || this.dead) return;
      this.armLost = side >= 0 ? 'L' : 'R';
      this.wounds.push({ type: 'limb', area: 'arm', rate: 1.5, packed: false, stump: true, t: G.time });
      G.Viewmodel.setOneArm(true);
      G.Audio.playerVoice('hurt'); this.shake = Math.max(this.shake || 0, 0.7);
      HUD.msg('腕を失った…　片手では主力武器が扱いにくい。' + G.keyName(G.Input.binds.treat) + ' で止血帯を', 4);
      HUD.medical();
    },
    // 片腕での扱いにくさ（ぶれ・反動・照準の遅さ）
    oneArmK() { return !this.armLost ? 1 : this.cur === 'pistol' ? 1.5 : 3.2; },
    // 脚を失う（敵のショットガンの至近距離）：立てなくなり、切り口から激しく出血する
    loseLeg(side, from) {
      if (this.legLost || this.dead) return;
      this.legLost = side >= 0 ? 'L' : 'R';
      this.wounds.push({ type: 'limb', area: 'leg', rate: 1.8, packed: false, stump: true, t: G.time });
      this.cripple('脚を失った…　' + G.keyName(G.Input.binds.treat) + ' で止血帯を巻かないと失血死する');
      // もげた脚：自分と同じ服の体から、脚だけを固い形にして落とす
      try {
        const b = G.Humanoid.create({ style: 'swat', team: G.Game.team, gear: 'helmet-sunglasses' }); G.Game.scene.add(b.root);
        b.root.position.copy(this.pos); b.root.rotation.y = this.yaw + Math.PI;
        b.update({ dt: 1 / 60, speed: 0, crouch: 0, aim: 1, aimPitch: 0, twist: 0, reload: -1, scene: G.Game.scene });
        b.root.visible = false;
        const dir = from ? V3(this.pos.x - from.x, 0, this.pos.z - from.z).normalize() : V3(0, 0, 1);
        G.Physics.sever(b, { part: 'legs', side, dir });
        this.lostLegBody = b;
      } catch (err) { }
      HUD.medical();
    },
    // 傷による動きへの影響：脚の傷は歩きが遅くなる、腕の傷は狙いがぶれる
    legWound() { return this.wounds.some(w => w.area === 'leg' && w.type !== 'light') ? 0.78 : this.wounds.some(w => w.area === 'leg') ? 0.9 : 1; },
    armWound() { return this.wounds.some(w => w.area === 'arm' && w.type !== 'light') ? 1.6 : this.wounds.some(w => w.area === 'arm') ? 1.25 : 1; },
    // 応急処置：いちばん危ない傷から、合う道具で処置する（合う道具がなければ包帯で押さえる）
    startTreat() {
      if (this.dead || this.treat) { if (this.treat) { this.treat = null; G.Viewmodel.state.lowered = false; HUD.msg('処置を中断'); } return; }
      const todo = this.wounds.filter(w => w.rate > 0).sort((a, b) => b.rate - a.rate);
      if (!todo.length) {
        if (this.hp >= 100 || !this.med.medicine) { HUD.msg(this.hp < 100 ? '治療薬がありません' : '処置は不要です'); return; }
        if (this.reloading) { this.reloading = false; G.Viewmodel.cancelReload(); }
        this.treat = { item: 'medicine', t: 0, dur: MED.medicine.time, full: true };
        this.sprinting = false; this.ads = false; G.Viewmodel.state.lowered = true;
        G.Audio.treat && G.Audio.treat('start', 'medicine'); HUD.msg('治療薬で処置中…'); return;
      }
      let pick = null;
      for (const w of todo) {
        const want = BLEED[w.type].item;
        if (!w.packed && this.med[want] > 0) { pick = { w, item: want, full: true }; break; }
        if (w.type !== 'light' && !w.packed && this.med.band > 0) { pick = { w, item: 'band', full: false }; break; }   // 代用：包帯で押さえる
        if (w.type === 'light' && this.med.band > 0) { pick = { w, item: 'band', full: true }; break; }
      }
      if (!pick) { HUD.msg('使える医療品がありません'); return; }
      if (this.reloading) { this.reloading = false; G.Viewmodel.cancelReload(); }
      if (this.gHold) { this.gHold = false; G.Viewmodel.grenadeHold(false); G.Grenades.preview(null); }
      this.treat = { ...pick, t: 0, dur: MED[pick.item].time };
      this.sprinting = false; this.ads = false;
      G.Viewmodel.state.lowered = true;
      G.Audio.treat && G.Audio.treat('start', pick.item);
      HUD.msg((pick.full ? MED[pick.item].name : '包帯（代用）') + 'で処置中…');
    },
    startAssist() {
      if(this.dead)return;
      if(this.treat){this.treat=null;G.Viewmodel.state.lowered=false;HUD.msg('処置を中断');return;}
      const mate=G.Allies.nearbyWounded(this,true);
      if(!mate){HUD.msg('負傷した仲間の近く（1.8m以内）で使用');return;}
      if(this.switchT>0||this.knifeT>=0||G.Viewmodel.state.gThrowT>=0){HUD.msg('動作が終わってから救護してください');return;}
      const wound=mate.pickTreat({...this.med,medicine:0});
      const plan=wound||(mate.hp<100&&this.med.stim>0?{item:'stim',full:true}:null);
      if(!plan){HUD.msg('使える医療品がありません。出撃前の装備で携行できます');return;}
      this.reloading=false;G.Viewmodel.cancelReload();this.gHold=false;G.Viewmodel.grenadeHold(false);G.Grenades.preview(null);
      this.sprinting=false;this.ads=false;mate.treat=null;
      this.treat={...plan,t:0,dur:MED[plan.item].time,ally:mate,targetHurtT:mate.hurtT};
      G.Viewmodel.state.lowered=true;G.Audio.treat('start',plan.item);HUD.msg(mate.name+'：'+MED[plan.item].name+'で処置中');
    },
    finishTreat() {
      const T = this.treat; this.treat = null; G.Viewmodel.state.lowered = false;
      if (T.ally) {
        if (T.ally.dead) { HUD.msg(T.ally.name + 'は助からなかった'); return; }
        if(!G.Allies.canAssist(this,T.ally,2.3)||T.ally.hurtT>T.targetHurtT){HUD.msg('救護を中断');return;}
        if(!T.ally.applyTreat(T,this.med)){HUD.msg('処置できませんでした');return;}
        HUD.msg(T.ally.name+(T.item==='stim'?'の体力を60回復':T.item==='medicine'?'の体力を30回復':'の'+G.BLEED[T.w.type].name+'を'+(T.full?'止めた':'押さえた')));
        G.Audio.treat && G.Audio.treat('end', T.item); HUD.medical(); return;
      }
      if (T.item === 'medicine') {
        this.med.medicine = Math.max(0, this.med.medicine - 1);
        this.hp = Math.min(100, this.hp + 30);
        G.Audio.treat && G.Audio.treat('end', 'medicine'); HUD.msg('治療薬で体力を30回復した'); HUD.medical(); return;
      }
      this.med[T.item] = Math.max(0, this.med[T.item] - 1);
      const w = T.w;
      if (T.full) { this.wounds = this.wounds.filter(x => x !== w); HUD.msg(BLEED[w.type].name + 'を止めた'); }
      else { w.packed = true; w.rate *= w.type === 'torso' ? 0.5 : 0.4; HUD.msg('包帯で押さえた（完全には止まっていない）'); }
      G.Audio.treat && G.Audio.treat('end', T.item);
      HUD.medical();
    },
    hurt(dmg, from, area) {
      if (this.dead || G.Game.state !== 'playing') return;
      this.hp = Math.max(0, this.hp - dmg);
      if (this.hp > 0 && dmg >= 6) this.addWound(area === 'head' ? 'torso' : area);
      // 脚に3発で立てなくなる
      if (area === 'leg' && this.hp > 0) { this.legHits++; if (this.legHits >= 3) this.cripple(); }
      if (this.treat && dmg >= 6) { this.treat = null; G.Viewmodel.state.lowered = false; HUD.msg('撃たれて処置が中断された'); }
      this.hurtT = 0.35;
      G.Audio.hurt();
      G.Pad.vibrate(0.9, 0.4, 160);
      if (this.hp <= 0 || G.time - this.gruntT > 0.5) { this.gruntT = G.time; G.Audio.playerVoice(this.hp <= 0 ? 'death' : 'hurt'); }
      HUD.damageFrom(from);
      this.recoil += 0.01;
      if (this.hp <= 0) { this.dead = true; G.Game.startDeathCam(from); }
    },

    update(dt, edges, mouse) {
      const I = G.Input;
      // ---- 切り替え操作（押した瞬間だけ） ----
      for (const a of edges) {
        if (a === 'treat' || a === 'treatAlt') { this.startTreat(); continue; }
        if (a === 'assist') { this.startAssist(); continue; }
        if (a === 'command') { G.Allies.toggleMode(); continue; }
        if (a === 'moveOrder') { G.Allies.orderAtReticle(); continue; }
        if (a === 'jump') {
          this.jump();
        } else if (a === 'crouch') {
          if (this.posture === 'crouch') this.setPosture('stand');
          else this.setPosture('crouch');
        } else if (a === 'prone') {
          if (this.posture === 'prone') { if (!this.setPosture('stand')) { if (this.setPosture('crouch')) HUD.msg('立てないためしゃがみました'); } }
          else this.setPosture('prone');
        } else if (a === 'leanL' || a === 'leanR') {
          const dir = a === 'leanL' ? -1 : 1;
          this.lean = this.lean === dir ? 0 : dir;
          if (this.sprinting) this.sprintBlock = 0.3;
        } else if (a === 'reload') {
          this.tryReload();
        } else if (a === 'knife') {
          this.tryKnife();
        } else if (a === 'debug') {
          G.Enemies.setDebug(!G.Enemies.debugOn); HUD.debug(G.Enemies.debugOn);
        } else if (a === 'w1') this.switchWeapon('ar');
        else if (a === 'w2') this.switchWeapon('pistol');
        else if (a === 'w3') this.switchWeapon('shotgun');
        else if (a === 'suppressor') this.toggleSuppressor();
        else if (a === 'nextWeapon') this.switchWeapon(ORDER[(ORDER.indexOf(this.cur) + 1) % ORDER.length]);
        else if (a === 'zoomIn' || a === 'zoomOut') {
          if (this.ads && this.cur === 'ar' && G.Viewmodel.att.ar.optic === 'scope') { this.zoom = clamp(this.zoom + (a === 'zoomIn' ? 0.5 : -0.5), 2, 8); HUD.zoom(this.zoom); }

        } else if (a === 'interact') {
          HUD.msg('調べる・ドア操作はまだありません');
        }
      }

      // ---- ダッシュ ----
      const Pad = G.Pad;
      const fireBtn = I.mouse.lmb || Pad.fire || I.isDown('fire'), adsBtn = I.mouse.rmb || Pad.ads || I.isDown('ads');
      if (fireBtn && this.treat) {
        this.treat = null;
        HUD.msg('射撃のため処置を中断');
      }
      // Derive the lowered pose from the active action instead of leaving a latched flag.
      G.Viewmodel.state.lowered = !!this.treat;
      const fwdKey = (I.isDown('forward') && !I.isDown('back')) || Pad.move.y < -0.35 || G.Touch.move.y < -0.35;
      this.sprintBlock -= dt;
      const wantSprint = (I.isDown('sprint') || Pad.sprintLatch) && this.posture === 'stand' && fwdKey && this.knifeT < 0 && this.sprintBlock <= 0 && !fireBtn && !this.treat && this.legWound() > 0.8 && !this.crippled;
      if (wantSprint && !this.sprinting) { this.lean = 0; } // 開始時にリーン解除（照準は下で解除）
      if (fireBtn && this.sprinting) this.sprintBlock = 0.25;
      this.sprinting = wantSprint;

      // ---- 照準（右クリックを押している間） ----
      this.switchT -= dt; this.gCD -= dt; this.attachT = (this.attachT || 0) - dt;
      const busy = this.switchT > 0 || this.gHold || G.Viewmodel.state.gThrowT >= 0 || this.attachT > 0 || !!this.treat;
      // 出血：体力が少しずつ減り続ける（自然には止まらない）
      const br = this.bleedRate();
      if (br > 0 && !this.dead) {
        this.hp = Math.max(0, this.hp - br * dt);
        this.dripT -= dt;
        if (this.dripT <= 0) {
          this.dripT = br > 1 ? 0.35 : 0.9;
          const h = G.World.raycast(this.pos.x + (Math.random() - 0.5) * 0.4, 0.5, this.pos.z + (Math.random() - 0.5) * 0.4, 0, -1, 0, 1);
          if (h && G.Game.gore !== 'off') G.Effects.bloodDecal(h, 0.06 + Math.min(0.12, br * 0.06));
        }
        if (this.hp <= 0) { this.dead = true; this.bleedDeath = true; G.Audio.playerVoice('death'); G.Game.startDeathCam(null); return; }
      }
      if (this.treat) {
        // 仲間の処置中に離れたら中断
        if (this.treat.ally && (!G.Allies.canAssist(this,this.treat.ally,2.3)||this.treat.ally.hurtT>this.treat.targetHurtT)) { this.treat = null; G.Viewmodel.state.lowered = false; HUD.msg('距離・遮蔽物・仲間の被弾により処置を中断'); }
        else { this.treat.t += dt; if (this.treat.t >= this.treat.dur) this.finishTreat(); }
      }
      this.ads = adsBtn && !this.reloading && !this.sprinting && this.knifeT < 0 && !this.dead && !busy;
      this.adsT = clamp(this.adsT + (this.ads ? dt : -dt) / ((this.cur === 'ar' ? 0.16 : 0.13) * (this.armLost ? (this.cur === 'pistol' ? 1.4 : 2.5) : 1)), 0, 1);
      // 片腕：銃を支えきれず、狙いがゆっくり大きく揺れる（主力武器ほど大きい）
      if (this.armLost) {
        this.swayT += dt;
        const a = (this.cur === 'pistol' ? 0.004 : 0.016) * (this.ads ? 1.4 : 1), t = this.swayT;
        this.yaw += (Math.sin(t * 1.3) * 0.6 + Math.sin(t * 2.9 + 1) * 0.4) * a * dt * 3;
        this.pitch = clamp(this.pitch + (Math.sin(t * 1.7 + 2) * 0.6 + Math.sin(t * 3.7) * 0.4) * a * dt * 3 - (this.cur === 'pistol' ? 0 : a * dt * 0.8), -1.45, 1.45);
      }
      if (mouse.wheel) {
        if (this.ads && this.cur === 'ar' && G.Viewmodel.att.ar.optic === 'scope') { this.zoom = clamp(this.zoom - mouse.wheel * 0.5, 2, 8); HUD.zoom(this.zoom); }
        else if (!this.ads) { const i = ORDER.indexOf(this.cur); this.switchWeapon(ORDER[(i + (mouse.wheel > 0 ? 1 : ORDER.length - 1)) % ORDER.length]); }

      }

      // ---- 視点 ----
      const fov = this.currentFov();
      const sens = G.Game.sensitivity * 0.0022 * (Math.tan(fov * Math.PI / 360) / Math.tan(BASE_FOV * Math.PI / 360));
      this.yaw -= mouse.dx * sens;
      this.pitch = clamp(this.pitch - mouse.dy * sens, -1.45, 1.45);
      // コントローラーの右スティック（照準中は倍率に応じて遅く）＋エイム補助
      if (Pad.look.x || Pad.look.y || Pad.move.x || Pad.move.y) {
        const fovK = Math.tan(fov * Math.PI / 360) / Math.tan(BASE_FOV * Math.PI / 360);
        const as = (performance.now() - Pad.lastUseT < 2000) ? Pad.assist(G.camera, this) : { slow: 1, pullYaw: 0, pullPitch: 0 };
        const rate = 3.1 * Pad.settings.sens * fovK * as.slow;
        this.yaw -= Pad.look.x * rate * dt;
        this.pitch = clamp(this.pitch - Pad.look.y * rate * 0.75 * dt, -1.45, 1.45);
        // 自分が動いているときだけ、照準の近くの敵へわずかに引き寄せる
        const effort = Math.min(1, Math.hypot(Pad.look.x, Pad.look.y) + Math.hypot(Pad.move.x, Pad.move.y) * 0.6);
        if (effort > 0.05 && (as.pullYaw || as.pullPitch)) {
          const k = Math.min(1, dt * 2.4) * 0.4 * effort;
          this.yaw += as.pullYaw * k; this.pitch = clamp(this.pitch + as.pullPitch * k, -1.45, 1.45);
        }
      }
      // 反動の一時成分は滑らかに戻る（恒久成分は pitch に入っている）
      this.recoil *= Math.exp(-dt * 7);

      // ---- 移動 ----
      let mx = Pad.move.x + G.Touch.move.x, mz = Pad.move.y + G.Touch.move.y;     // スティックは傾け具合でゆっくり歩ける
      if (I.isDown('forward')) mz -= 1; if (I.isDown('back')) mz += 1;
      if (I.isDown('left')) mx -= 1; if (I.isDown('right')) mx += 1;
      const ml = Math.hypot(mx, mz), mag = Math.min(1, ml);
      this.walkSlow = (I.isDown('walk') || Pad.walkToggle) && !this.sprinting;
      // 歩く速さ：ゆっくり歩くキーは最も遅い段階、それ以外はホイールで選んだ段階
      this.walkK = this.sprinting ? 1 : this.walkSlow ? 0.2 : SPEED_LEVELS[this.speedLevel - 1];
      let speed = (this.sprinting ? SPRINT_SPEED : POSTURE[this.posture].speed * this.walkK) * (this.crippled ? 0.7 : this.legWound()) * (this.treat ? 0.45 : 1);
      if (this.adsT > 0.5) speed *= 0.6;
      if (this.reloading) speed *= 0.85;
      const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
      let tx = 0, tz = 0;
      if (ml > 0) {
        mx /= ml; mz /= ml;
        tx = (mx * cosY + mz * sinY) * speed * mag;
        tz = (-mx * sinY + mz * cosY) * speed * mag;
      }
      const acc = 1 - Math.exp(-dt * 14);
      this.vel.x += (tx - this.vel.x) * acc; this.vel.z += (tz - this.vel.z) * acc;
      const before = this.pos.clone();
      G.World.moveCircle(this.pos, this.vel.x * dt, this.vel.z * dt, 0.3, POSTURE[this.posture].body, this.pos.y);
      const wasGrounded = this.grounded;
      this.vel.y -= 17 * dt;
      const vertical = G.World.moveVertical(this.pos, this.vel.y * dt, 0.3, POSTURE[this.posture].body);
      this.grounded = vertical.grounded;
      if (vertical.grounded || vertical.hitCeiling) this.vel.y = 0;
      if (!wasGrounded && this.grounded) {
        G.Audio.footstep(this.pos, 0.85, true, 'walk');
        G.Audio.gear(null, 0.5, true);
        G.Enemies.broadcast(this.pos.clone(), 9, 'footstep', true, null);
        this.stepAcc = 0;
      }
      const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
      this.moving = moved / Math.max(dt, 1e-4) > 0.4;

      // 足音（敵にも聞こえる。ダッシュは遠くまで、しゃがみ・匍匐は小さく）
      if (this.grounded) this.stepAcc += moved;
      this.bobPhase = (this.bobPhase || 0) + (this.grounded ? moved : 0) / stride0(this) * Math.PI;
      const stride = stride0(this);
      // 止まっている状態から歩き出したときは、すぐに最初の一歩が鳴るようにする
      if (this.grounded && moved > 0.002 && !this.wasMoving) this.stepAcc = Math.max(this.stepAcc, stride * 0.7);
      this.wasMoving = moved > 0.002;
      if (this.grounded && this.stepAcc > stride) {
        this.stepAcc = 0;
        // 遅く歩くほど足音は小さく、敵に聞こえる距離も短い
        const wk = this.walkK;
        const slow = !this.sprinting && wk <= 0.55 && this.posture !== 'prone';
        const baseR = this.sprinting ? 16 : this.posture === 'stand' ? 7 : this.posture === 'crouch' ? 3 : 1.5;
        const radius = this.walkSlow ? 0.45 : this.sprinting ? baseR : baseR * (0.25 + 0.75 * wk * wk);
        G.Enemies.broadcast(V3(this.pos.x, 0.1, this.pos.z), radius, 'footstep', true, null);
        const kind = this.sprinting ? 'run' : slow ? 'sneak' : this.posture === 'stand' ? 'walk' : this.posture;
        // 歩きは控えめ、走りははっきり大きく
        const vol = this.sprinting ? 1.35 : kind === 'sneak' ? (this.walkSlow ? 0.035 : 0.25) : this.posture === 'stand' ? 0.6 * (0.5 + 0.5 * wk) : this.posture === 'crouch' ? 0.42 : 0.35;
        G.Audio.footstep(this.pos, vol, true, kind);
        this.gearPending = 0.12 + Math.random() * 0.1;   // 足音の少し後に装備がこすれる
      }
      if (this.gearPending > 0) {
        this.gearPending -= dt;
        if (this.gearPending <= 0) G.Audio.gear(null, this.walkSlow ? .025 : this.sprinting ? 1 : (this.posture === 'stand' ? 0.55 : 0.45) * (0.4 + 0.6 * this.walkK), true);
      }
      // 素早く振り向いたときも装備がこすれる
      this.turnGearT -= dt;
      let dyaw = this.yaw - this.lastYaw; this.lastYaw = this.yaw;
      if (Math.abs(dyaw) / Math.max(dt, 1e-4) > 4.5 && this.turnGearT <= 0) { this.turnGearT = 0.5; G.Audio.gear(null, 0.4, true); }

      // ---- 姿勢の高さ（短い補間） ----
      this.eyeH += (POSTURE[this.posture].eye - this.eyeH) * (1 - Math.exp(-dt * 12));

      // ---- リーン（視点位置と射線をずらす。壁に入り込まない） ----
      this.leanAmt += (this.lean - this.leanAmt) * (1 - Math.exp(-dt * 11));
      const side = this.leanAmt >= 0 ? 1 : -1, r = this.right();
      const proneLean = this.posture === 'prone';
      const leanReach = proneLean ? 0.26 : 0.42;
      let maxOff = leanReach;
      for (const dy of (proneLean ? [0, 0.09] : [0, -0.15, 0.08])) {
        const hh = World_raycastSide(this.pos.x, Math.max(0.1, this.pos.y + this.eyeH + dy), this.pos.z, r.x * side, r.z * side, 0.7);
        if (hh) maxOff = Math.min(maxOff, Math.max(0, hh.t - (proneLean ? 0.17 : 0.22)));
      }
      const leanTarget = Math.min(Math.abs(this.leanAmt) * leanReach, maxOff) * side;
      // 壁に近づく方向は速く（壁に入らないよう）、それ以外はゆっくり追従
      const fast = Math.abs(leanTarget) < Math.abs(this.leanOff);
      if (fast) this.leanOff += (leanTarget - this.leanOff) * (1 - Math.exp(-dt * 24));
      else this.leanOff += (leanTarget - this.leanOff) * (1 - Math.exp(-dt * 12));

      // ---- カメラ ----
      const cam = G.camera;
      // 視点のわずかな上下・左右の揺れ（歩幅に同期、照準中は小さく）
      const spd = Math.hypot(this.vel.x, this.vel.z);
      this.bobK = (this.bobK || 0) + (((this.grounded ? Math.min(1, spd / 3.3) : 0) * (1 - this.adsT * 0.8)) - (this.bobK || 0)) * (1 - Math.exp(-dt * 6));
      const bobAmp = (this.sprinting ? 0.03 : this.posture === 'stand' ? 0.014 : this.posture === 'crouch' ? 0.008 : 0.004) * this.bobK;
      const bobY = -Math.abs(Math.sin(this.bobPhase || 0)) * bobAmp + bobAmp * 0.5;
      const bobX = Math.cos(this.bobPhase || 0) * bobAmp * 0.5;
      // 横移動で視点がほんの少し傾く
      const localX = this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw);
      this.strafeRoll = (this.strafeRoll || 0) + ((-localX * 0.004) - (this.strafeRoll || 0)) * (1 - Math.exp(-dt * 8));
      const want = V3(this.pos.x + r.x * (this.leanOff + bobX), this.pos.y + this.eyeH - Math.abs(this.leanAmt) * (proneLean ? 0.025 : 0.06) + bobY, this.pos.z + r.z * (this.leanOff + bobX));
      if (this.camInit) {
        const jump = want.distanceTo(cam.position), allowed = moved + Math.abs(this.pos.y - before.y) + 0.09 + Math.abs(POSTURE[this.posture].eye - this.eyeH) * 0.5;
        // 小さな急な跳び（壁際の押し戻しなど）は数フレームに分けてなめらかに。大きな移動（位置の付け替え）はそのまま
        if (jump > allowed && jump < 1.0) want.lerp(cam.position, 1 - allowed / jump);
      }
      // Resolve the smoothed camera too: smoothing must never put the eye through a wall.
      const anchor = V3(this.pos.x, this.pos.y + this.eyeH, this.pos.z);
      const safe = p => !G.World.overlapsSphere(p.x,p.y,p.z,.13);
      if (!safe(want)) {
        let lo=0, hi=1;
        for(let i=0;i<10;i++){const k=(lo+hi)/2;const p=anchor.clone().lerp(want,k);if(safe(p))lo=k;else hi=k;}
        want.copy(anchor.lerp(want,lo));
      }
      // Approach a newly clamped eye position without snapping around a window edge.
      if(this.camInit&&safe(cam.position)){
        const distance=want.distanceTo(cam.position),limit=moved+Math.abs(this.pos.y-before.y)+dt*2.7+Math.abs(POSTURE[this.posture].eye-this.eyeH)*.5;
        if(distance>limit&&distance<1){
          want.lerp(cam.position,1-limit/distance);
          if(!safe(want)){let lo=0,hi=1;for(let i=0;i<10;i++){const k=(lo+hi)/2;if(safe(cam.position.clone().lerp(want,k)))lo=k;else hi=k;}want.copy(cam.position.clone().lerp(want,lo));}
        }
      }
      this.camInit = true;
      cam.position.copy(want);
      this.shake = Math.max(0, (this.shake || 0) - dt * 1.6);
      const sh = this.shake * this.shake * 0.03;
      // 画面の傾きは、実際にカメラが横へずれた量に合わせる（壁際で横にずれられないのに傾きだけ残らないように）
      const leanVisual = clamp(this.leanOff / leanReach, -1, 1);
      cam.rotation.set(this.pitch + this.recoil + (Math.random() - 0.5) * sh, this.yaw + (Math.random() - 0.5) * sh, -leanVisual * (proneLean ? 0.15 : 0.19) + this.strafeRoll + (Math.random() - 0.5) * sh, 'YXZ');
      this.localX = localX;
      cam.fov = fov; cam.updateProjectionMatrix();

      // ---- 射撃 ----
      this.fireCD -= dt; this.pumpT -= dt;
      const Wp = this.W();
      const pressed = fireBtn && !this.prevFire; this.prevFire = fireBtn;
      const vm = G.Viewmodel.state;
      // The movement state can finish before the first-person weapon has risen on screen.
      const poseReady = vm.sprint <= 0.16 && vm.gK <= 0.16 && (vm.lowK || 0) <= 0.16 && vm.gThrowT < 0 && vm.knifeT < 0 && !vm.sw && !vm.att;
      this.fireQueueT = Math.max(0, this.fireQueueT - dt);
      if (pressed && !poseReady && !busy && !this.reloading && !this.sprinting) this.fireQueueT = 0.42;
      // 装填済みの弾があれば、引き金で装填を即中断して同じフレームで撃つ。
      // 空のときは、最初の1発が入った時点で発射する予約になる。
      let forceShot = false;
      if (this.reloading && this.cur === 'shotgun') {
        if (pressed) this.fireWhenLoaded = true;
        if ((fireBtn || this.fireWhenLoaded) && this.ammo > 0 && this.pumpT <= 0 && !busy && poseReady) {
          forceShot = this.fireWhenLoaded;
          this.fireWhenLoaded = false;
          this.reloading = false;
          G.Viewmodel.cancelReload();
        }
      } else this.fireWhenLoaded = false;
      const queuedShot = this.fireQueueT > 0 && poseReady;
      const canFire = poseReady && !this.reloading && this.knifeT < 0 && !this.sprinting && !this.dead && !busy && this.pumpT <= 0;
      if ((fireBtn || forceShot || queuedShot) && canFire && (Wp.auto || pressed || forceShot || queuedShot)) {
        if (this.ammo <= 0) {
          if (!this.dryFired) { G.Audio.dryClick(); HUD.msg(`${G.keyName(G.Input.binds.reload)} でリロード`); this.dryFired = true; }
        } else if (Wp.auto) {
          let n = 0;
          while (this.fireCD <= 0 && this.ammo > 0 && n < 3) { this.shoot(); this.fireQueueT = 0; this.fireCD += Wp.interval; n++; }
        } else if (this.fireCD <= 0) {
          this.shoot(); this.fireQueueT = 0; this.fireCD = Wp.interval;
          if (this.cur === 'shotgun' && this.ammo > 0) { this.pumpT = 0.12 + G.Viewmodel.PUMP_TIME; this.pumpPending = 0.12; }
          if (this.cur === 'pistol' && this.ammo === 0) G.Viewmodel.state.slideLock = true;
        }
      }
      if (!fireBtn) { this.dryFired = false; if (this.fireCD < 0) this.fireCD = 0; }

      // ---- 手りゅう弾：長押しで構え（軌道が表示される）、離すと投げる ----
      const gBtn = I.isDown('grenade') || I.mouse.mmb || Pad.grenade;
      if (gBtn && !this.gHold && this.gCD <= 0 && !this.dead && this.knifeT < 0 && this.switchT <= 0) {
        if (this.grenades <= 0) { if (!this.gEmptyMsg) { HUD.msg('手りゅう弾がありません'); this.gEmptyMsg = true; } }
        else {
          if (this.reloading) { this.reloading = false; G.Viewmodel.cancelReload(); }
          this.gHold = true; G.Viewmodel.grenadeHold(true); G.Audio.reload('pin');
        }
      }
      if (!gBtn) this.gEmptyMsg = false;
      if (this.gHold) {
        const v = this.throwVelocity();
        G.Grenades.preview(this.throwOrigin(), v);
        if (!gBtn) {
          this.gHold = false; this.grenades--; this.gCD = 0.7;
          G.Viewmodel.grenadeThrow(); G.Grenades.preview(null); G.Audio.grenadeThrow();
          this.throwPending = 0.11;   // 腕を振り出してから手を離す
          HUD.weapons();
        }
      }
      if (this.throwPending > 0) { this.throwPending -= dt; if (this.throwPending <= 0) G.Grenades.throw(this.throwOrigin(), this.throwVelocity(), true); }
      if (this.pumpPending > 0) { this.pumpPending -= dt; if (this.pumpPending <= 0 && this.cur === 'shotgun') G.Viewmodel.pump(true); }

      // ---- ナイフ ----
      this.knifeCD -= dt;
      if (this.knifeT >= 0) {
        this.knifeT += dt;
        if (!this.knifeHitDone && this.knifeT >= 0.16) { this.knifeHitDone = true; this.resolveKnife(); }
        if (this.knifeT >= G.Viewmodel.KNIFE_TIME) this.knifeT = -1;
      }
      this.hurtT -= dt;
    },

    throwOrigin() {
      const c = G.camera, r = this.right();
      return c.position.clone().add(V3(0, -0.1, 0)).addScaledVector(r, 0.15);
    },
    throwVelocity() {
      const f = V3(0, 0, -1).applyQuaternion(G.camera.quaternion);
      return f.multiplyScalar(13).add(V3(0, 2.6, 0)).add(V3(this.vel.x * 0.5, 0, this.vel.z * 0.5));
    },
    currentFov() {
      const z = this.cur === 'ar' ? (G.Viewmodel.att.ar.optic === 'dot' ? 1.3 : this.zoom) : this.W().adsZoom;
      const zf = 2 * Math.atan(Math.tan(BASE_FOV * Math.PI / 360) / z) * 180 / Math.PI;
      const k = this.adsT * this.adsT * (3 - 2 * this.adsT);
      return BASE_FOV + (zf - BASE_FOV) * k;
    },

    tryReload() {
      if (this.reloading || this.dead || this.knifeT >= 0 || this.switchT > 0 || this.gHold) return;
      const Wp = this.W();
      if (this.ammo >= Wp.mag) { HUD.msg('弾倉は満タンです'); return; }
      if (this.reserve <= 0) { HUD.msg('予備弾がありません'); return; }
      this.reloading = true;
      this.fireWhenLoaded = false; this.fireQueueT = 0;
      this.reloadEmpty = this.ammo === 0;
      if (this.cur === 'shotgun') { this.pumpT = 0; G.Viewmodel.startShellReload(Math.min(Wp.mag - this.ammo, this.reserve), this.reloadEmpty); }
      else G.Viewmodel.startReload(this.reloadEmpty);
      G.Enemies.broadcast(V3(this.pos.x, 1, this.pos.z), 9, 'reload', true, null);
    },
    finishReload() {
      if (this.cur === 'shotgun') { this.reloading = false; return; }
      const take = Math.min(this.W().mag - this.ammo, this.reserve);
      this.ammo += take; this.reserve -= take; this.reloading = false;
    },
    // ショットガン：1発入るごと
    shellIn() { if (this.reserve > 0 && this.ammo < this.W().mag) { this.ammo++; this.reserve--; } },
    tryKnife() {
      if (this.knifeCD > 0 || this.dead) return;
      if (this.reloading) { this.reloading = false; G.Viewmodel.cancelReload(); HUD.msg('リロードを中断しました'); }
      this.sprintBlock = 0.5; this.sprinting = false;
      this.knifeT = 0; this.knifeHitDone = false; this.knifeCD = 0.75;
      G.Viewmodel.startKnife();
    },
    resolveKnife() {
      const cam = G.camera, f = V3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
      const wall = G.World.raycast(cam.position.x, cam.position.y, cam.position.z, f.x, f.y, f.z, 1.75);
      let best = null, hit = null, bestD = wall ? wall.t : 1.75;
      for (const e of G.Enemies.list) {
        if (e.dead) continue;
        const h = G.Humanoid.rayParts(e.body, cam.position, f, bestD, true);
        if (h) { bestD = h.t; best = e; hit = h; }
      }
      G.Audio.knife(!!best);
      G.Enemies.broadcast(V3(this.pos.x, 1, this.pos.z), 4, 'knife', true, null);
      if (best) {
        const bp = cam.position.clone().addScaledVector(f, bestD);
        G.Effects.bloodHit(bp, f, false);
        const killed = best.stab(hit.part, cam.position, hit.side);
        HUD.hitmarker(false, killed);
        if (killed) this.kills++;
      }
    },

    shoot() {
      const Wp = this.W();
      const sup = this.suppressed();
      this.ammo--; this.shots++;
      this.lastShotT = G.time;
      const cam = G.camera;
      // 弾の方向：今見ている方向（＝画面中央）＋ばらつき。反動はこの後で視点に加える
      const aimed = this.adsT > 0.85;
      let spread = (aimed ? Wp.spreadAds * (this.armLost && this.cur !== 'pistol' ? 6 : 1) : Wp.spreadHip + (this.moving ? Wp.spreadMove : 0)) * this.armWound() * this.oneArmK();
      if (!aimed && Wp.pellets === 1) spread *= this.posture === 'crouch' ? 0.8 : this.posture === 'prone' ? 0.6 : 1;
      const o = cam.position.clone();
      // ショットガンは散弾（複数の弾）。敵ごとに当たった弾の威力を合計し、血の演出は1回にまとめる
      const perEnemy = new Map(), woodHits = new Map();
      let wallHits = 0;
      for (let p = 0; p < Wp.pellets; p++) {
        const d = V3(0, 0, -1);
        const a = Math.random() * Math.PI * 2, rr = (Wp.pellets > 1 ? 0.35 + Math.sqrt(Math.random()) * 0.65 : Math.sqrt(Math.random())) * spread;
        d.x = Math.cos(a) * rr; d.y = Math.sin(a) * rr; d.normalize();
        d.applyQuaternion(cam.quaternion);
        // 木の壁は貫通する（抜けるたびに威力が落ちる）
        const pr = G.World.raycastPierce(o.x, o.y, o.z, d.x, d.y, d.z, Wp.range, 2);
        const wh = pr.hit;
        let maxT = wh ? wh.t : Wp.range, hitE = null, hitPart = null, hitSide = 0;
        for (const e of G.Enemies.list) { const h = e.rayHit(o, d, maxT); if (h) { maxT = h.t; hitE = e; hitPart = h.part; hitSide = h.side; } }
        // 仲間の体に先に当たれば誤射
        let hitAlly = null, allyPart = null;
        for (const a of G.Allies.list) { if (a.dead) continue; const h = G.Humanoid.rayParts(a.body, o, d, maxT); if (h) { maxT = h.t; hitAlly = a; allyPart = h.part; hitE = null; } }
        if (hitAlly) {
          const dmgA = ({ head: 999, body: 30, stomach: 26, legs: 20, arms: 18 })[allyPart] * (Wp.pellets > 1 ? 0.45 : 1);
          hitAlly.hurt(dmgA, this.pos.clone().setY(1.4), allyPart === 'legs' ? 'leg' : allyPart === 'arms' ? 'arm' : allyPart === 'head' ? 'head' : 'torso');
          G.Effects.bloodHit(o.clone().addScaledVector(d, maxT), d.clone(), false);
          if (p === 0) HUD.msg(hitAlly.name + 'を撃ってしまった！', 2);
          continue;
        }
        // 弾が通った木の壁に、表と裏の穴と木くず
        for (const wd of pr.woods) {
          if (wd.t > maxT) break;
          const woodKey=wd.cx+','+wd.cz;
          if(!woodHits.has(woodKey))woodHits.set(woodKey,{hit:wd.in,cx:wd.cx,cz:wd.cz,dir:d.clone()});
          if (p < 4 || p % 3 === 0) { G.Effects.impact(wd.in, false, 'wood'); G.Effects.impact(wd.out, false, 'wood'); }
        }
        if (hitE) {
          let dmg = Wp.dmg[hitPart];
          const layers = pr.woods.filter(wd => wd.t < maxT).length;
          if (layers) dmg *= Math.pow(Wp.pen, layers);
          const through = layers > 0;
          if (Wp.falloff) { const [n0, n1, mn] = Wp.falloff; dmg *= maxT <= n0 ? 1 : maxT >= n1 ? mn : 1 - (1 - mn) * (maxT - n0) / (n1 - n0); }
          const rec = perEnemy.get(hitE) || { dmg: 0, part: hitPart, side: hitSide, point: o.clone().addScaledVector(d, maxT), dir: d.clone(), head: false };
          rec.dmg += dmg; if (hitPart === 'head') rec.head = true; if (through) rec.through = true;
          // 部位ごと（左右も）に受けた量を合計しておく（欠損の判定用）
          const pk = hitPart + (hitPart === 'arms' || hitPart === 'legs' ? (hitSide >= 0 ? 'L' : 'R') : '');
          rec.by = rec.by || {}; const slot = rec.by[pk] || (rec.by[pk] = { dmg: 0, n: 0, part: hitPart, side: hitSide, point: o.clone().addScaledVector(d, maxT) });
          slot.dmg += dmg; slot.n++;
          if (hitPart === 'head' || rec.part !== 'head') { rec.part = hitPart; rec.side = hitSide; }
          perEnemy.set(hitE, rec);
        } else if (wh && (wallHits++ < 5 || p % 2 === 0)) {
          G.Effects.impact(wh, false, wh.cx >= 0 && G.World.isWood(wh.cx, wh.cz) ? 'wood' : undefined);
        }
      }
      for(const w of woodHits.values()) G.Destruction.damage(w.cx,w.cz,w.hit,this.cur,w.dir);
      for (const [e, rec] of perEnemy) {
        const partName = rec.head ? 'head' : rec.part;
        let killed = e.damage(rec.dmg, partName, o, rec.side);
        // ショットガンの近距離の集弾で、頭・腕（肘から先／肩から）・脚がもげる。
        // 散弾は胴にも混ざって当たるので、部位ごとに受けた量で判定する（頭は約20、腕は約16、脚は約22以上でもげる）。
        // 壁を貫通して弱まった散弾では欠損しない
        if (this.cur === 'shotgun' && G.Game.dismember && !rec.through && rec.by) {
          const need = { head: 20, arms: 16, legs: 22 };
          let pick = null;
          for (const k in rec.by) { const s = rec.by[k]; if (need[s.part] && s.dmg >= need[s.part] && (!pick || s.dmg / need[s.part] > pick.dmg / need[pick.part])) pick = s; }
          if (pick) {
            const spec = { part: pick.part, side: pick.side, dir: rec.dir.clone() };
            if (pick.part === 'arms') spec.fore = G.Humanoid.isForearmHit(e.body, pick.point, pick.side);
            if (pick.part === 'legs' && !e.dead) e.loseLeg(pick.side, rec.dir.clone());          // 生きていれば這って撃ってくる
            else {
              if (!e.dead) { e.hp = 0; e.die(1, 0, pick.part); killed = true; }
              e.body.st.sever = spec;
            }
          }
        }
        this.hits++; if (killed) this.kills++;
        G.Effects.bloodHit(rec.point, rec.dir, rec.head || killed || Wp.pellets > 1);
        G.Audio.fleshHit(rec.point);
        HUD.hitmarker(rec.head, killed);
      }
      // 演出と音
      G.Viewmodel.fire();
      G.Pad.vibrate(Wp.pellets > 1 ? 0.7 : 0.25, 0.55, Wp.pellets > 1 ? 90 : 45);
      if (!sup) G.Effects.playerFlash(o.clone().addScaledVector(V3(0, 0, -1).applyQuaternion(cam.quaternion), 0.8));
      G.Audio.gunshot(null, true, this.cur, sup);
      if (this.cur !== 'shotgun') G.Effects.ejectPlayerCasing(this.cur);
      G.Enemies.broadcast(V3(this.pos.x, 1.4, this.pos.z), Wp.noise * (sup ? 0.28 : 1), 'gunshot', true, null);   // サプレッサー付きは敵に聞こえる距離が約3割
      // 反動：一部は視点に残る（マウスで下へ補正が必要）、一部は滑らかに戻る
      const scoped = aimed && this.cur === 'ar' && G.Viewmodel.att.ar.optic === 'scope';
      const k = Wp.kick * (scoped ? 0.75 / Math.sqrt(this.zoom / 2) : aimed ? 0.8 : 1) * (this.posture === 'prone' ? 0.6 : this.posture === 'crouch' ? 0.85 : 1) * (this.armLost ? (this.cur === 'pistol' ? 1.4 : 2.2) : 1);
      this.pitch = clamp(this.pitch + k * 0.6, -1.45, 1.45);
      this.recoil += k * 0.55;
      this.yaw += (Math.random() - 0.5) * Wp.kickYaw * (scoped ? 0.6 : 1);
      HUD.ammo();
    },
  };
  // 色指定（16進）を sRGB として扱い直す（r128 は線形として扱うため、そのままだと白っぽくなる）
  const _done = new WeakSet();
  G.linearize = function (root) {
    root.traverse((o) => {
      if (!o.material) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (_done.has(m)) continue; _done.add(m);
        if (m.color && !m.map) m.color.convertSRGBToLinear();
        if (m.emissive) m.emissive.convertSRGBToLinear();
      }
    });
  };
  // 1歩の長さ：人の歩き方に合わせて「1秒あたりの歩数」から決める（歩き約2.4歩/秒、走り約3歩/秒）
  G.strideFor = function (speed, prone) {
    if (prone) return 0.5;
    const rate = 1.6 + 0.25 * speed;
    return Math.max(0.55, speed / rate);
  };
  function stride0(p) { return G.strideFor(Math.max(0.5, Math.hypot(p.vel.x, p.vel.z)), p.posture === 'prone'); }
  // リーンの壁判定用（目の高さで横方向）
  function World_raycastSide(x, y, z, dx, dz, max) { return G.World.raycast(x, y, z, dx, 0, dz, max); }

  // ======================= 拾得物：倒した敵の弾薬と、配置された救急箱 =======================
  const MED_SPOTS = G.World.def.meds;
  const Pickups = G.Pickups = {
    list: [], scene: null,
    mats: null,
    makeMats() {
      if (this.mats) return;
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
      x.fillStyle = '#d9d6cc'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#b3261e'; x.fillRect(26, 12, 12, 40); x.fillRect(12, 26, 40, 12);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
      this.mats = {
        med: new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }),
        ammo: new THREE.MeshStandardMaterial({ color: new THREE.Color(0x3f4a2e).convertSRGBToLinear(), roughness: 0.7, metalness: 0.2 }),
        band: new THREE.MeshStandardMaterial({ color: new THREE.Color(0xc9a227).convertSRGBToLinear(), roughness: 0.5 }),
      };
    },
    reset(scene) {
      this.scene = scene; this.makeMats();
      for (const p of this.list) scene.remove(p.mesh);
      this.list = [];
      for (let [x, z] of MED_SPOTS) {
        if (!G.World.walkable(Math.floor(x), Math.floor(z))) { const n = G.Path.nearestWalkable(Math.floor(x), Math.floor(z)); if (n) { x = n[0] + 0.5; z = n[1] + 0.5; } }
        this.spawn('med', { x, z });
      }
    },
    spawn(type, pos) {
      this.makeMats();
      const g = new THREE.Group();
      if (type === 'med') {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.22), this.mats.med); b.position.y = 0.07; b.castShadow = true; g.add(b);
      } else {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.16), this.mats.ammo); b.position.y = 0.06; b.castShadow = true; g.add(b);
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.285, 0.02, 0.165), this.mats.band); s.position.y = 0.09; g.add(s);
      }
      // 倒れた位置の少し横（体と重ならない場所）に置く
      const off = type === 'ammo' ? 0.55 : 0;
      g.position.set(pos.x + off, 0, pos.z + off * 0.3); g.rotation.y = Math.random() * 6.28;
      if (type === 'ammo' && !G.World.walkable(Math.floor(g.position.x), Math.floor(g.position.z))) g.position.set(pos.x, 0, pos.z);
      this.scene.add(g);
      this.list.push({ type, mesh: g, t: 0 });
    },
    update(dt) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const p = this.list[i]; p.t += dt;
        const d = Math.hypot(p.mesh.position.x - P.pos.x, p.mesh.position.z - P.pos.z);
        if (d > 0.9) continue;
        if (p.type === 'ammo') {
          const got = [];
          for (const [k, n] of [['ar', 30], ['pistol', 15], ['shotgun', 6]]) {
            const st = P.wst[k], add = Math.min(n, WEAPONS[k].maxReserve - st.reserve);
            if (add > 0) { st.reserve += add; got.push(`${WEAPONS[k].short}+${add}`); }
          }
          if (P.grenades < GRENADE_MAX && Math.random() < 0.35) { P.grenades++; got.push('手りゅう弾+1'); }
          if (!got.length) continue;
          HUD.msg('弾薬を拾った　' + got.join('　')); HUD.ammo(); HUD.weapons();
        } else {
          // 医療品の補給（体力は戻らない）。ポーチがいっぱいなら拾わない
          const total = P.med.tq + P.med.hemo + P.med.band + (P.med.medicine || 0) + (P.med.stim || 0);
          if (total >= MED_CAPACITY + 2) continue;
          const got = [];
          for (const [k, n] of [['band', 2], ['tq', 1], ['hemo', 1]]) {
            const room = MED_CAPACITY + 2 - (P.med.tq + P.med.hemo + P.med.band + (P.med.medicine || 0) + (P.med.stim || 0));
            const add = Math.min(n, room); if (add > 0) { P.med[k] += add; got.push(MED[k].name + '+' + add); }
          }
          HUD.msg('医療品を拾った　' + got.join('　')); HUD.medical();
        }
        G.Audio.reload('grab');
        this.scene.remove(p.mesh); this.list.splice(i, 1);
      }
    },
  };

  // ======================= HUD =======================
  const _hc = {};
  const setText = (id, v) => { if (_hc[id] !== v) { _hc[id] = v; $(id).textContent = v; } };
  const setStyle = (id, prop, v) => { const k = id + '.' + prop; if (_hc[k] !== v) { _hc[k] = v; if (prop.startsWith('--')) $(id).style.setProperty(prop, v); else $(id).style[prop] = v; } };
  const setClass = (id, cls, on) => { const k = id + '#' + cls; if (_hc[k] !== on) { _hc[k] = on; $(id).classList.toggle(cls, on); } };
  const HUD = G.HUD = {
    msgT: 0,
    msg(t, sec) { const m = $('msg'); m.textContent = t; m.classList.add('show'); this.msgT = sec || 2.2; },
    radio(speaker, line, japanese = '') { $('radio-speaker').textContent = speaker; $('radio-text').textContent = line; $('radio-ja').textContent = japanese; $('radio-line').classList.add('show'); this.radioT = 3; },
    // 仲間の状態
    allies() {
      const el = $('allies'); if (!el) return;
      $('squad-select').style.display = G.Allies.list.length ? '' : 'none';
      if (!G.Allies.list.length) { el.textContent = ''; return; }
      el.innerHTML = `<b>仲間　生存 ${G.Allies.alive().length} / ${G.Allies.list.length}</b>` + G.Allies.list.map(a => {
        const hp = a.dead ? 0 : Math.max(0, Math.min(100, Math.ceil(a.hp)));
        const st = a.dead ? '戦闘不能・指示不可' : P.treat?.ally === a ? '救護を受けています' : a.treat ? (a.treat.item === 'medicine' ? '自己治療中' : '止血中') : a.crippled ? '匍匐のみ・射撃可能' : a.bleedRate() > 0 ? '出血中・処置が必要' : a.hp < 50 ? '負傷' : a.moveState === 'moving' ? '移動中' : a.moveState === 'holding' || G.Allies.mode === 'hold' ? '待機' : '追従';
        return `<div class="ally-card ${a.dead ? 'dead' : a.bleedRate() > 0 || a.hp < 50 ? 'bad' : ''}" data-ally="${a.id}"><div class="ally-row"><strong>${a.name}</strong><span class="ally-state">${a.dead ? '✕ 死亡' : '● 生存'}</span><span class="ally-hp">${hp}/100</span></div><div class="ally-health"><i style="width:${hp}%"></i></div><small>${st}</small></div>`;
      }).join('');
    },
    // 出血の状態と医療品の数
    medical() {
      const el = $('med'); if (!el) return;
      const ws = P.wounds || [], md = P.med || { tq: 0, hemo: 0, band: 0, medicine: 0, stim: 0 };
      const worst = ws.reduce((a, w) => (!a || w.rate > a.rate ? w : a), null);
      const rate = P.bleedRate ? P.bleedRate() : 0;
      const label = !worst ? '' : rate >= 1 ? '出血：激しい' : '出血：軽い';
      const parts = ws.map(w => ({ torso: '胴', arm: '腕', leg: '脚' }[w.area] + (w.type === 'light' ? '（軽）' : w.packed ? '（押さえ）' : '（重）'))).join('・');
      $('bleed').textContent = worst ? `${label}　${parts}　−${rate.toFixed(1)}/秒` : '';
      el.classList.toggle('bleeding', !!worst); el.classList.toggle('heavy', rate >= 1);
      const mate = !P.dead && Game.state === 'playing' ? G.Allies.nearbyWounded(P, true) : null;
      const aid = $('ally-aid-hint');
      if (aid) {
        const j = G.Touch.active ? '操作＋ → 仲間の救護' : G.keyName(G.Input.binds.assist);
        aid.textContent = mate ? mate.name + '：' + j + (mate.bleedRate() > 0 ? ' 仲間の止血／回復' : ' 回復注射') : '';
      }
      $('med-items').textContent = `止血帯 ${md.tq}　止血剤 ${md.hemo}　包帯 ${md.band}　治療薬 ${md.medicine || 0}　回復注射 ${md.stim || 0}`;
    },
    ammo() {
      $('ammo-cur').textContent = P.ammo; $('ammo-res').textContent = P.reserve;
      $('ammo').classList.toggle('low', P.ammo <= Math.max(2, Math.floor(P.W().mag / 4)));
      $('weapon-name').textContent = P.W().name;
    },
    // 武器の一覧（選択中を強調）と手りゅう弾の数
    weapons() {
      const box = $('weapon-slots'); if (!box) return;
      const pad = G.Pad.connected() && performance.now() - G.Pad.lastUseT < 30000;
      const keyOf = (id) => (pad || G.Touch.active) ? '' : G.keyName(G.Input.binds[id]);
      box.innerHTML = ['ar', 'pistol', 'shotgun'].map((k, i) => `<span class="slot ${P.cur === k ? 'on' : ''}"><b>${keyOf('w' + (i + 1))}</b>${WEAPONS[k].short}</span>`).join('')
        + `<span class="slot gren ${P.grenades ? '' : 'empty'}"><b>${pad ? '' : keyOf('grenade')}</b>手りゅう弾 ×${P.grenades}</span>`;
    },
    // 操作の案内（開始時と、持ち替え・手りゅう弾を初めて使えるようになったとき）
    hint(force) {
      const pad = G.Pad.connected();
      const t = G.Touch.active ? '左スティック：移動　画面をスワイプ：視点　射撃：長押し　照準：切替　手榴弾：長押し→離して投げる' : pad
        ? `${G.Pad.btnName(G.Pad.binds.nextWeapon)}：武器の持ち替え　${G.Pad.btnName(G.Pad.binds.grenade)}：長押しで手りゅう弾を構え、離して投げる　${G.Pad.btnName(G.Pad.binds.walk)}：ゆっくり歩く`
        : `${G.keyName(G.Input.binds.w1)}・${G.keyName(G.Input.binds.w2)}・${G.keyName(G.Input.binds.w3)} またはホイール：武器の持ち替え　${G.keyName(G.Input.binds.grenade)}：長押しで手りゅう弾を構え（軌道が出ます）、離して投げる　${G.keyName(G.Input.binds.walk)}：押している間ゆっくり歩く`;
      const el = $('hint'); el.textContent = t; el.classList.add('show');
      clearTimeout(this._hintT); this._hintT = setTimeout(() => el.classList.remove('show'), force ? 12000 : 9000);
    },
    zoom(z) { $('zoom').textContent = z.toFixed(1) + '倍'; },
    hitmarker(head, killed) {
      const h = $('hitmarker'); h.className = 'show' + (head ? ' head' : '') + (killed ? ' kill' : '');
      clearTimeout(this._hm); this._hm = setTimeout(() => h.className = '', 160);
      G.Audio.hitMarker(head);
      if (killed) this.msg(head ? '頭部命中・撃破' : '撃破');
    },
    damageFrom(from) {
      const ang = Math.atan2(from.x - P.pos.x, from.z - P.pos.z);
      const rel = -(ang - (P.yaw + Math.PI));
      const d = document.createElement('div'); d.className = 'dmg-arc';
      d.style.transform = `translate(-50%,-50%) rotate(${rel}rad)`;
      $('dmg-dirs').appendChild(d);
      setTimeout(() => d.remove(), 900);
      HUD.vig = 1;
    },
    debug(on) { $('debug').classList.toggle('on', on); this.msg(on ? 'AI状態の表示：オン' : 'AI状態の表示：オフ'); },
    update(dt) {
      if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) $('msg').classList.remove('show'); }
      if (this.radioT > 0) { this.radioT -= dt; if (this.radioT <= 0) $('radio-line').classList.remove('show'); }
      const marker = $('order-marker'), point = G.Allies.commandPoint;
      if (point && G.Allies.commandAssigned.some(a => !a.dead && a.moveState === 'moving')) {
        G.camera.updateMatrixWorld();
        const clip = point.clone().setY(0.45).project(G.camera);
        marker.classList.toggle('on', clip.z > -1 && clip.z < 1 && Math.abs(clip.x) < 1.1 && Math.abs(clip.y) < 1.1);
        marker.style.left = ((clip.x + 1) * 50) + '%'; marker.style.top = ((1 - clip.y) * 50) + '%';
      } else marker.classList.remove('on');
      setText('hp-num', String(Math.ceil(P.hp)));
      setStyle('hp-fill', 'width', P.hp + '%');
      setClass('hp', 'low', P.hp <= 35);
      // 出血中は、画面の縁が脈打つように赤くなる（激しいほど強く）
      const br = P.bleedRate ? P.bleedRate() : 0;
      const pulse = br > 0 ? (0.12 + Math.min(0.35, br * 0.2)) * (0.6 + 0.4 * Math.sin(G.time * (br >= 1 ? 7 : 4))) : 0;
      this.vig = Math.max((this.vig || 0) - dt * 2, P.hp <= 35 ? 0.45 : 0, pulse);
      // 処置の進み具合
      const tb = $('treatbar');
      if (tb) {
        tb.classList.toggle('on', !!P.treat);
        if (P.treat) { tb.querySelector('i').style.width = Math.min(100, P.treat.t / P.treat.dur * 100) + '%'; tb.querySelector('span').textContent = (P.treat.ally ? P.treat.ally.name + '：' : '') + (P.treat.full ? G.MED[P.treat.item].name : '包帯（代用）') + 'で処置中'; }
      }
      this.medT = (this.medT || 0) - dt; if (this.medT <= 0) { this.medT = 0.25; this.medical(); this.allies(); }
      setStyle('vignette', 'opacity', (Math.round(this.vig * 20) / 20).toString());
      setText('posture', (P.crippled ? (P.legLost ? '脚を失った・這うだけ' : '脚を負傷・這うだけ') : { stand: '立ち', crouch: 'しゃがみ', prone: '匍匐' }[P.posture]) + (P.sprinting ? '・ダッシュ' : P.walkK < 1 ? `・歩く速さ ${Math.round(P.walkK * 100)}%` : '') + (P.lean ? (P.lean < 0 ? '・左リーン' : '・右リーン') : ''));
      const optic = G.Viewmodel.att.ar.optic;
      setClass('scope', 'on', P.adsT > 0.75 && P.cur === 'ar' && optic === 'scope');
      if(P.adsT>.75&&optic==='scope'){setStyle('scope','--glint-x',(32+Math.sin(P.yaw)*9)+'%');setStyle('scope','--glint-y',(23-P.pitch*7)+'%');}
      setClass('reddot', 'on', P.adsT > 0.8 && P.cur === 'ar' && optic === 'dot');
      setClass('crosshair', 'hide', P.dead || !!Game.deathCam || P.adsT > 0.2 || P.sprinting || P.knifeT >= 0);
      const gap = 6 + (P.moving ? 10 : 0) + (P.posture === 'stand' ? 3 : 0) + (G.time - P.lastShotT < 0.15 ? 5 : 0);
      setStyle('crosshair', '--gap', gap + 'px');
      setClass('reload-bar', 'on', P.reloading);
      if (P.reloading && G.Viewmodel.state.reload) setStyle('reload-fill', 'width', Math.round(G.Viewmodel.state.reload.t / G.Viewmodel.state.reload.dur * 100) + '%');
      const alive = G.Enemies.alive();
      const ex = G.World.exitCells[0];
      const exD = ex ? Math.round(Math.hypot(ex.x + 1 - P.pos.x, ex.z + 1 - P.pos.z)) : 0;
      setText('objective', alive > 0 ? `敵を排除する　残り ${alive} / ${G.Enemies.list.length}` : `全員排除。開始地点の脱出地点（EXIT）へ戻る　約${exD}m`);
      setClass('objective', 'done', alive === 0);
      if (G.Enemies.debugOn) this.updateDebug();
    },
    updateDebug() {
      const box = $('debug-labels');
      const cam = G.camera, w = innerWidth, h = innerHeight;
      G.Enemies.list.forEach((e, i) => {
        let el = box.children[i];
        if (!el) { el = document.createElement('div'); el.className = 'dbg'; box.appendChild(el); }
        const p = V3(e.pos.x, e.body.headWorld.y + 0.45, e.pos.z).project(cam);
        if (p.z > 1 || e.dead && e.deadT > 3) { el.style.display = 'none'; return; }
        el.style.display = 'block';
        el.style.left = ((p.x + 1) / 2 * w) + 'px'; el.style.top = ((1 - p.y) / 2 * h) + 'px';
        const st = G.Enemies.STATE_JA[e.state] || e.state;
        el.innerHTML = `#${e.id} ${st}　HP ${Math.max(0, e.hp | 0)}<br>弾 ${e.ammo}/${e.magSize}${e.reloadT > 0 ? ' 装填中' : ''}　${G.Enemies.ROLE_JA[e.role]}<br>発見度 ${(e.awareness * 100) | 0}%${e.visible ? '　視認中' : ''}`;
        el.classList.toggle('alert', e.state === 'combat');
      });
      $('dbg-fps').textContent = `FPS ${G.Game.fps | 0}　位置 ${P.pos.x.toFixed(1)}, ${P.pos.z.toFixed(1)}　赤：最後に見た位置　黄：聞いた位置　線：経路`;
    },
  };

  // ======================= 画面効果 =======================
  // 世界と銃を1枚の画像に描いてから、光のにじみ（ブルーム）と色調補正をかける
  const GradeShader = {
    uniforms: { tDiffuse: { value: null }, time: { value: 0 }, res: { value: new THREE.Vector2(1, 1) }, vignette: { value: 0.55 }, grain: { value: 0.035 }, contrast: { value: 1.08 }, saturation: { value: 0.92 }, warm: { value: new THREE.Vector3(1.06, 1.0, 0.86) }, ca: { value: 0.0045 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform float time; uniform vec2 res; uniform float vignette, grain, contrast, saturation, ca; uniform vec3 warm; varying vec2 vUv;',
      'vec3 toSRGB(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }',
      'void main(){',
      '  vec2 d = vUv - 0.5; float r2 = dot(d, d);',
      '  vec3 col = vec3(texture2D(tDiffuse, vUv + d * r2 * ca * 2.0).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d * r2 * ca * 2.0).b);',
      '  col *= warm;',
      '  col = toSRGB(col);',
      '  col = (col - 0.5) * contrast + 0.5;',
      '  float l = dot(col, vec3(0.299, 0.587, 0.114));',
      '  col = mix(vec3(l), col, saturation);',
      '  col += vec3(0.035, 0.018, -0.02) * smoothstep(0.45, 1.0, l) + vec3(-0.012, 0.0, 0.018) * (1.0 - smoothstep(0.0, 0.35, l));',
      '  col *= mix(1.0, smoothstep(0.95, 0.28, length(d) * 1.25), vignette);',
      '  float n = fract(sin(dot(vUv * res + fract(time) * 97.0, vec2(12.9898, 78.233))) * 43758.5453);',
      '  col += (n - 0.5) * grain;',
      '  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);',
      '}'].join('\n'),
  };
  class DualRenderPass extends THREE.Pass {
    constructor() { super(); this.needsSwap = false; }
    render(renderer, writeBuffer, readBuffer) {
      renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
      renderer.clear();
      renderer.render(Game.scene, G.camera);
      if (G.Viewmodel.root.visible && Game.state !== 'menu') { renderer.clearDepth(); renderer.render(G.Viewmodel.scene, G.Viewmodel.cam); }
    }
  }

  // ======================= ゲーム進行 =======================
  const Game = G.Game = {
    state: 'menu', sensitivity: 1, difficulty: 1, fps: 60, testMode: /[?&]autotest/.test(location.search), manual: /[?&]manual/.test(location.search),

    init() {
      const canvas = $('view');
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(innerWidth, innerHeight);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.autoClear = false;
      this.renderer = renderer;
      const scene = this.scene = new THREE.Scene();
      const th = G.World.def.theme;
      scene.background = new THREE.Color(th === 'ruins' ? 0xb8c4cc : th === 'parking' ? 0x0b0c0f : 0x100d0a);
      scene.fog = th === 'ruins' ? new THREE.Fog(0xbcc5cb, 45, 160) : th === 'parking' ? new THREE.Fog(0x101217, 12, 46) : new THREE.Fog(0x1c1813, 18, 58);
      G.camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.04, 120);
      G.camera.rotation.order = 'YXZ';
      G.maxAniso = renderer.capabilities.getMaxAnisotropy();
      G.World.build(scene);
      G.Surfaces.init(scene);
      G.Destruction.init(scene);
      G.Physics.init(scene);
      G.Effects.init(scene);
      G.Viewmodel.init(renderer);
      G.linearize(scene); G.linearize(G.Viewmodel.scene);
      // 環境反射（金属や濡れた面に周囲の光が映り込む）
      try {
        const pm = new THREE.PMREMGenerator(renderer);
        const env = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
        scene.environment = env; G.Viewmodel.scene.environment = env;
        scene.traverse((o) => { if (o.material && o.material.isMeshStandardMaterial) o.material.envMapIntensity = 0.22; });
        G.Viewmodel.scene.traverse((o) => { if (o.material && o.material.isMeshStandardMaterial) o.material.envMapIntensity = 0.55; });
        G.envIntensity = 0.22;
      } catch (e) { console.warn('環境反射を使えません', e); }
      // 画面効果
      try {
        const gl2 = renderer.capabilities.isWebGL2;
        const rt = gl2 ? new THREE.WebGLMultisampleRenderTarget(innerWidth, innerHeight, { format: THREE.RGBAFormat }) : new THREE.WebGLRenderTarget(innerWidth, innerHeight);
        if (gl2) rt.samples = 4;
        const comp = new THREE.EffectComposer(renderer, rt);
        comp.addPass(new DualRenderPass());
        this.bloom = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.6, 0.72);
        comp.addPass(this.bloom);
        this.grade = new THREE.ShaderPass(GradeShader);
        if (th === 'ruins') { this.grade.uniforms.warm.value.set(1.03, 1.0, 0.95); this.grade.uniforms.saturation.value = 0.95; }
        if (th === 'parking') { this.grade.uniforms.warm.value.set(0.97, 1.0, 1.06); this.grade.uniforms.vignette.value = 0.7; }
        if (th === 'office') { this.grade.uniforms.warm.value.set(1.0, 1.0, 1.02); }
        if (th === 'hotel') { this.grade.uniforms.warm.value.set(1.09, 1.0, 0.84); this.grade.uniforms.vignette.value = 0.65; }
        comp.addPass(this.grade);
        this.composer = comp;
      } catch (e) { console.warn('画面効果を使えません', e); this.composer = null; }
      G.Input.init();
      G.Pad.init();
      G.Touch.init();
      const saved = G.Storage.get('cq_settings_v1') || {};
      this.sensitivity = typeof saved.sens === 'number' ? saved.sens : 1;
      this.difficulty = typeof saved.diff === 'number' ? saved.diff : 1;
      this.fullscreen = saved.fs !== false;
      this.quality = ['high', 'standard', 'low'].includes(saved.q) ? saved.q : 'standard';
      this.showFps = !!saved.fps;
      this.gore = ['on', 'low', 'off'].includes(saved.gore) ? saved.gore : 'on';
      G.Input.touchpadGuard = !!saved.tp;
      this.rawMouse = !!saved.raw;
      if (typeof saved.stepVol === 'number') G.Audio.stepVol = saved.stepVol;
      this.wheelMode = 'weapon';
      // 部位の欠損：今回から初期設定をオンに（以前の「オフ」の保存値は引き継がない）
      this.dismember = typeof saved.dm2 === 'boolean' ? saved.dm2 : true;
      this.team = saved.team === 'blue' ? 'blue' : 'red';
      this.allyCount = [0, 1, 2].includes(saved.allies) ? saved.allies : 2;
      this.loadout = Object.assign({ optic: 'scope', arSup: false, pistolSup: false }, saved.loadout || {});
      this.loadout.med = Object.assign({ tq: 1, hemo: 1, band: 2, medicine: 1, stim: 0 }, this.loadout.med || {});
      this.loadoutReady = false;
      this.isTouch = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
      if (this.isTouch && !saved.q) this.quality = 'low';
      this.autoRes = saved.autoRes !== false;
      this.resScale = 1;
      G.time = 0;
      this.applyQuality();
      this.reset();
      Menu.init();
      window.addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); if (this.composer) { this.composer.setPixelRatio(renderer.getPixelRatio()); this.composer.setSize(innerWidth, innerHeight); } G.camera.aspect = innerWidth / innerHeight; G.camera.updateProjectionMatrix(); G.Viewmodel.resize(); });
      document.addEventListener('pointerlockchange', () => this.onLockChange());
      document.addEventListener('pointerlockerror', () => { Menu.note('マウスを固定できませんでした。もう一度ボタンを押してください（Escの直後は1秒ほど待つ必要があります）。'); });
      window.addEventListener('blur', () => { if (this.state === 'playing' && !this.testMode) this.pause(); });
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing' && !this.testMode) this.pause(); });
      this.last = performance.now();
      G.Audio.prepare();
      requestAnimationFrame((t) => this.frame(t));
      if (this.testMode) { this.state = 'playing'; G.Input.enabled = true; Menu.show(null); }
    },
    saveSettings() { return G.Storage.set('cq_settings_v1', { sens: this.sensitivity, diff: this.difficulty, fs: this.fullscreen, q: this.quality, fps: this.showFps, gore: this.gore, tp: G.Input.touchpadGuard, raw: this.rawMouse, autoRes: this.autoRes, stepVol: G.Audio.stepVol, wheel: this.wheelMode, dm2: this.dismember, team: this.team, allies: this.allyCount, loadout: this.loadout }); },
    applyLoadout() {
      const L = this.loadout, VM = G.Viewmodel;
      VM.setOptic(L.optic === 'dot' ? 'dot' : 'scope');
      VM.setSup('ar', !!L.arSup); VM.setSup('pistol', !!L.pistolSup);
    },
    // 画質：軽量では影を切り、天井照明の点光源を減らし、解像度を下げる
    applyQuality() {
      // 高：高解像度＋影　標準：等倍解像度＋影　軽量：等倍解像度・影なし・照明半分
      const low = this.quality === 'low', high = this.quality === 'high';
      this.renderer.shadowMap.enabled = !low;
      this.basePR = high ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
      this.renderer.setPixelRatio(this.basePR * (this.resScale || 1));
      if (G.World.sun) { const ms = high ? 4096 : 2048; if (G.World.sun.shadow.mapSize.x !== ms) { G.World.sun.shadow.mapSize.set(ms, ms); if (G.World.sun.shadow.map) { G.World.sun.shadow.map.dispose(); G.World.sun.shadow.map = null; } } }
      this.renderer.setSize(innerWidth, innerHeight);
      this.usePost = !low && !!this.composer;
      if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(innerWidth, innerHeight); }
      // 画面効果を使うときは色の変換を最終段で行うので、直接描画との明るさを揃える
      this.renderer.toneMappingExposure = this.usePost ? 1.2 : 1.15;
      G.World.lights.forEach((l, i) => { l.visible = !low || i % 2 === 0; });
      if (G.World.sun) G.World.sun.castShadow = !low;
      this.scene.traverse((o) => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => m.needsUpdate = true); } });
    },

    reset() {
      if (this.deathCam) { this.scene.remove(this.deathCam.body.root); if (this.deathCam.body.st.gunDropped) this.scene.remove(this.deathCam.body.gun); this.deathCam.body.dispose(); this.deathCam = null; }
      G.Physics.reset(); G.Audio.stopEnemyVoices(); G.Destruction.reset(); G.World.resetCrates();
      G.Grenades.reset(this.scene);
      P.camInit = false;
      G.Viewmodel.resetActions();
      G.Effects.reset();
      P.reset();
      G.Allies.reset(this.scene);
      G.Enemies.spawn(this.scene);
      G.Pickups.reset(this.scene);
      G.Input.clear();
      $('debug-labels').innerHTML = '';
      for (const k in _hc) delete _hc[k];
      HUD.vig = 0;
      this.applyLoadout(); G.Viewmodel.state.att = null; P.attachT = 0;
      HUD.ammo(); HUD.zoom(P.zoom); HUD.weapons();
      this.ended = false; this.elapsed = 0;
      // 最初のカメラ位置
      P.update(0.0001, [], { dx: 0, dy: 0, wheel: 0 });
      G.Effects.warmShooting(this.renderer, G.camera);
    },

    begin() {
      if (this.state === 'menu' && !this.loadoutReady) { Menu.panel('loadout'); return; }
      G.Audio.init();
      G.Audio.ambience(true);
      if (this.ended) this.reset();
      if (this.fullscreen && !document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().then(() => {
          // 全画面中は Ctrl+W などのブラウザー操作を可能な範囲でゲーム側で受け取る（Chrome/Edge）
          if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(Object.values(G.Input.binds).filter(c => c && c !== 'Escape')).catch(() => { });
        }).catch(() => { });
      }
      // コントローラーがつながっていれば、マウスを固定せずに始める（タブレットでも遊べる）
      if (G.Pad.connected() || G.Touch.active) {
        this.state = 'playing'; G.Input.enabled = !this.deathCam; G.Input.clear(); Menu.show(null);
        if (!this.hinted) { this.hinted = true; HUD.hint(true); }
        return;
      }
      if (this.isTouch) { Menu.note('設定の「画面の操作ボタン」を自動または表示にすると、タッチ操作で遊べます。'); return; }
      const c = $('view');
      const plain = () => {
        try {
          const r = c.requestPointerLock();
          if (r && r.catch) r.catch(() => Menu.note('マウスを固定できませんでした。もう一度押してください。'));
        } catch (e) { Menu.note('このブラウザーではマウスを固定できません。'); }
      };
      if (!this.rawMouse) { plain(); return; }
      try {
        const r = c.requestPointerLock({ unadjustedMovement: true });
        if (r && r.catch) r.catch((err) => { if (err && err.name === 'NotSupportedError') plain(); else Menu.note('マウスを固定できませんでした。もう一度押してください（Escの直後は1秒ほど待つ必要があります）。'); });
      } catch (e) { plain(); }
    },
    onLockChange() {
      const locked = document.pointerLockElement === $('view');
      if (locked) {
        this.state = 'playing'; G.Input.enabled = !this.deathCam; G.Input.clear(); Menu.show(null);
        if (!this.hinted) { this.hinted = true; HUD.hint(true); }
      } else if (this.state === 'playing') {
        this.pause();
      }
    },
    // ---- やられたとき：カメラを後ろへ引き、自分の体が倒れるところを見せる ----
    startDeathCam(from) {
      if (this.deathCam) return;
      P.ads=false;P.adsT=0;P.reloading=false;P.treat=null;P.gHold=false;P.fireQueueT=0;
      G.Viewmodel.resetActions();
      G.Input.enabled = false; G.Input.clear(); G.Touch.sync();
      const b = G.Humanoid.create({ style: 'swat', team: this.team, gear: 'helmet-sunglasses' }); this.scene.add(b.root);
      b.onSound = (kind, p) => { const at = p ? p.clone() : b.hipsWorld.clone(); if (kind === 'knee') G.Audio.kneeDrop(at); else if (kind === 'fall') G.Audio.bodyFall(at, 1.2); else if (kind === 'gun') G.Audio.gunClatter(at); };
      b.root.position.copy(P.pos); b.root.rotation.y = P.yaw + Math.PI;
      if (P.legLost) G.Physics.applyMissing(b, 'leg' + P.legLost);
      if (P.armLost) G.Physics.applyMissing(b, 'arm' + P.armLost);
      const st = b.st; st.crouch = P.posture === 'crouch' ? 1 : 0; st.prone = P.posture === 'prone' ? 1 : 0; st.aim = 1;
      // 撃たれた方向：体の正面から撃たれたら後ろへ倒れる
      const fwd = V3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
      const toShooter = from ? V3(from.x - P.pos.x, 0, from.z - P.pos.z).normalize() : fwd.clone().negate();
      const front = toShooter.dot(fwd) > 0;
      const cands = front ? [['x', -1, fwd.clone().negate()], ['z', 1, null], ['x', 1, fwd]] : [['x', 1, fwd], ['z', -1, null], ['x', -1, fwd.clone().negate()]];
      let pick = cands[0];
      for (const c of cands) { if (!c[2]) { pick = c; break; } const h = G.World.raycast(P.pos.x, 0.5, P.pos.z, c[2].x, 0, c[2].z, 2.0); if (!h) { pick = c; break; } }
      b.update({ dt: 1 / 60, speed: 0, crouch: st.crouch, prone: st.prone, aim: 1, aimPitch: 0, twist: 0, reload: -1, scene: this.scene });
      b.die(pick[0], pick[1], !!P.headLost);
      if (P.headLost && G.Game.dismember) b.st.sever = { part: 'head', side: 0, dir: toShooter.clone().negate() };   // 至近距離のショットガンで頭が飛ぶ
      // カメラの行き先：体の後ろ上方。壁があれば手前で止める
      const back = toShooter.clone().negate().add(V3(0.35, 0, 0.35)).normalize();
      const head = V3(P.pos.x, 1.4, P.pos.z);
      const want = head.clone().addScaledVector(back, 2.8).add(V3(0, 1.1, 0));
      const d = want.clone().sub(head); const len = d.length(); d.normalize();
      const h = G.World.raycast(head.x, head.y, head.z, d.x, d.y, d.z, len);
      const end = h ? head.clone().addScaledVector(d, Math.max(0.6, h.t - 0.3)) : want;
      this.deathCam = { t: 0, body: b, from: G.camera.position.clone(), to: end, look0: G.camera.getWorldDirection(V3(0, 0, 0)).add(G.camera.position) };
      G.Viewmodel.setVisible(false); G.Grenades.preview(null);
      G.Effects.bloodPool(P.pos);
      $('vignette').style.opacity = 0.6;
    },
    updateDeathCam(dt) {
      G.Viewmodel.setVisible(false);
      const D = this.deathCam; D.t += dt;
      const k = Math.min(1, D.t / 1.4), e = k * k * (3 - 2 * k);
      G.camera.position.lerpVectors(D.from, D.to, e);
      const chest = V3(); D.body.bones.chest.getWorldPosition(chest);
      const look = D.look0.clone().lerp(chest, Math.min(1, D.t / 0.6));
      G.camera.lookAt(look);
      G.camera.fov += (70 - G.camera.fov) * Math.min(1, dt * 4); G.camera.updateProjectionMatrix();
      D.body.update({ dt, speed: 0, crouch: 0, aim: 0, aimPitch: 0, twist: 0, reload: -1, scene: this.scene });
      G.Allies.update(dt, P);
      G.Enemies.update(dt, P);
      G.Physics.update(dt);
      G.Effects.update(dt); G.World.update(dt); G.Grenades.update(dt);
      G.Audio.updateListener(G.camera);
      HUD.update(dt);
      if (D.t > 5.2) this.end(false);
    },
    padPause() {
      if (document.pointerLockElement) document.exitPointerLock(); else this.pause();
    },
    pause() {
      this.state = 'paused'; G.Input.enabled = false; G.Input.clear();
      G.Audio.ambience(false);
      Menu.show('pause');
    },
    end(win) {
      if (this.ended) return;
      this.ended = true; this.state = 'ended'; G.Input.enabled = false; G.Input.clear();
      G.Audio.ambience(false);
      G.Audio.jingle(win);
      const acc = P.shots ? Math.round(P.hits / P.shots * 100) : 0;
      $('end-title').textContent = win ? '任務完了' : '戦闘不能';
      $('end-sub').textContent = win ? '全員を排除し、脱出地点へ戻りました。' : '体力がなくなりました。';
      $('end-stats').textContent = `撃破 ${P.kills} / ${G.Enemies.list.length}　命中率 ${acc}%　経過 ${Math.floor(this.elapsed / 60)}分${String(Math.floor(this.elapsed % 60)).padStart(2, '0')}秒`;
      $('end').classList.toggle('win', win);
      if (document.pointerLockElement) document.exitPointerLock();
      Menu.show('end');
    },

    // 自動テスト用：描画せずに n フレーム進める
    step(n, dt) { for (let i = 0; i < n; i++) { this.handlePad(); if (this.state === 'playing') this.update(dt || 1 / 60); } },
    // コントローラー：プレイ中は一時停止、メニューでは開始・再開
    handlePad() {
      const padPause = G.Pad.poll();
      if (!padPause || G.Pad.rebinding) return;
      if (this.state === 'playing') this.padPause();
      else if ((this.state === 'paused' || this.state === 'menu') && !$('menu').querySelector('.panel.on')) this.begin();
      else if (this.state === 'ended') { this.reset(); this.begin(); }
    },
    frame(t) {
      if (this.manual) return;
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.fps += ((1 / Math.max(dt, 1e-3)) - this.fps) * 0.05;
      this._fpsT = (this._fpsT || 0) + dt;
      // 解像度の自動調整：重くて描画が遅れると操作が鈍く感じるので、少しずつ解像度を下げて滑らかさを優先する
      this._arT = (this._arT || 0) + dt;
      if (this.autoRes && this.state === 'playing' && this._arT > 1.0) {
        this._arT = 0;
        const prev = this.resScale;
        if (this.fps < 50 && this.resScale > 0.6) this.resScale = Math.max(0.6, this.resScale - 0.1);
        else if (this.fps > 58 && this.resScale < 1) { this._upT = (this._upT || 0) + 1; if (this._upT >= 3) { this._upT = 0; this.resScale = Math.min(1, this.resScale + 0.05); } }
        if (prev !== this.resScale) {
          this.renderer.setPixelRatio(this.basePR * this.resScale);
          this.renderer.setSize(innerWidth, innerHeight);
          if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(innerWidth, innerHeight); }
        }
      }
      if (this.showFps && this._fpsT > 0.5) { this._fpsT = 0; $('fps').textContent = Math.round(this.fps) + ' fps' + (this.resScale < 1 ? `（解像度 ${Math.round(this.resScale * 100)}%）` : ''); }
      this.handlePad();
      if (this.state === 'playing') this.update(dt);
      this.render();
      requestAnimationFrame((tt) => this.frame(tt));
    },
    update(dt) {
      G.time += dt; this.elapsed += dt;
      const edges = G.Input.takeEdges(), mouse = G.Input.takeMouse();
      if (this.deathCam) { this.updateDeathCam(dt); return; }
      P.update(dt, edges, mouse);
      if(this.deathCam){this.updateDeathCam(dt);return;}
      // 一人称の銃と手
      const vr = G.Viewmodel.update({
        dt, time: G.time, moveSpeed: Math.min(1, Math.hypot(P.vel.x, P.vel.z) / 3.3), sprint: P.sprinting,
        ads: P.adsT, posture: P.posture === 'stand' ? 0 : P.posture === 'crouch' ? 1 : 2,
        lean: clamp(P.leanOff / (P.posture === 'prone' ? 0.26 : 0.42), -1, 1), mdx: mouse.dx, mdy: mouse.dy, bobPhase: P.bobPhase || 0, wall: 0, strafe: Math.max(-1, Math.min(1, (P.localX || 0) / 3.3)),
      });
      G.Pickups.update(dt);
      if (vr === 'shell' && P.reloading) { P.shellIn(); HUD.ammo(); }
      if (vr === 'done' && P.reloading) { P.finishReload(); HUD.ammo(); }
      G.Viewmodel.setVisible(P.adsT < 0.75 || P.cur !== 'ar' || G.Viewmodel.att.ar.optic === 'dot');
      G.Grenades.update(dt);
      if (this.state !== 'playing') return; // 射撃などでゲームが終わった場合
      G.Allies.update(dt, P);
      G.Enemies.update(dt, P);
      G.Physics.update(dt);
      G.Effects.update(dt);
      G.World.update(dt);
      G.Audio.updateListener(G.camera);
      HUD.update(dt);
      if (this.state !== 'playing') return;
      if (G.Enemies.alive() === 0 && G.World.isExit(P.pos.x, P.pos.z)) this.end(true);
    },
    render() {
      if(P.dead||this.deathCam)G.Viewmodel.setVisible(false);
      const r = this.renderer;
      if (this.usePost) {
        this.grade.uniforms.time.value = performance.now() / 1000;
        this.grade.uniforms.res.value.set(innerWidth, innerHeight);
        this.composer.render();
        return;
      }
      r.setRenderTarget(null);
      r.clear();
      r.render(this.scene, G.camera);
      if (G.Viewmodel.root.visible && this.state !== 'menu') { r.clearDepth(); r.render(G.Viewmodel.scene, G.Viewmodel.cam); }
    },
  };

  // ======================= メニュー =======================
  const Menu = G.Menu = {
    init() {
      $('btn-start').onclick = () => this.panel('loadout');
      $('btn-deploy').onclick = () => { Game.loadoutReady = true; Game.reset(); Game.begin(); };
      $('btn-resume').onclick = () => Game.begin();
      const prepareSortie = () => { Game.state = 'menu'; Game.loadoutReady = false; Game.reset(); this.show('main'); this.panel('loadout'); };
      $('btn-restart').onclick = prepareSortie;
      $('btn-retry').onclick = prepareSortie;
      $('btn-end-menu').onclick = () => { Game.state = 'menu'; Game.loadoutReady = false; Game.reset(); this.show('main'); };
      for (const b of document.querySelectorAll('[data-open]')) b.onclick = () => this.panel(b.dataset.open);
      for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => this.panel(null);
      $('btn-reset-keys').onclick = () => { const ok = G.Input.resetBinds(); this.renderKeys(); this.keyNote(ok ? '初期設定に戻しました。' : '初期設定に戻しましたが、保存できませんでした。次回起動時には元に戻ります。'); };
      const sens = $('sens'), diff = $('diff'), fs = $('fs');
      sens.value = Game.sensitivity; $('sens-val').textContent = (+Game.sensitivity).toFixed(2);
      sens.oninput = () => { Game.sensitivity = +sens.value; $('sens-val').textContent = (+sens.value).toFixed(2); Game.saveSettings(); };
      diff.value = String(Game.difficulty);
      diff.onchange = () => { Game.difficulty = +diff.value; Game.saveSettings(); };
      const fpsBox = $('show-fps'); fpsBox.checked = Game.showFps; $('fps').classList.toggle('on', Game.showFps);
      fpsBox.onchange = () => { Game.showFps = fpsBox.checked; $('fps').classList.toggle('on', Game.showFps); Game.saveSettings(); };
      // マップ選択（選ぶとページを読み込み直す）
      const ms = $('map-select');
      for (const id in G.World.MAPS) { const o = document.createElement('option'); o.value = id; o.textContent = G.World.MAPS[id].name; ms.appendChild(o); }
      ms.value = G.World.mapId;
      $('map-desc').textContent = G.World.def.desc;
      ms.onchange = () => { G.Storage.set('cq_map_v1', ms.value); $('map-desc').textContent = '読み込み中…'; setTimeout(() => location.reload(), 50); };
      // 装備（戦闘前）
      const lo = $('lo-optic'), las = $('lo-arsup'), lps = $('lo-pistolsup');
      const syncLo = () => { lo.value = Game.loadout.optic; las.checked = !!Game.loadout.arSup; lps.checked = !!Game.loadout.pistolSup; };
      syncLo();
      const onLo = () => { Game.loadout = { optic: lo.value, arSup: las.checked, pistolSup: lps.checked, med: Game.loadout.med }; Game.applyLoadout(); Game.saveSettings(); this.loadoutSummary(); };
      // 医療品（ポーチに入る数まで）
      const medUI = () => {
        const md = Game.loadout.med, used = md.tq + md.hemo + md.band + md.medicine + (md.stim || 0);
        for (const k of ['tq', 'hemo', 'band', 'medicine', 'stim']) $('lo-' + k).textContent = md[k];
        $('lo-med-room').textContent = `ポーチの空き ${MED_CAPACITY - used} / ${MED_CAPACITY}`;
      };
      for (const b of document.querySelectorAll('[data-med]')) b.onclick = () => {
        const k = b.dataset.med, d = +b.dataset.d, md = Game.loadout.med, used = md.tq + md.hemo + md.band + md.medicine + (md.stim || 0);
        if (d > 0 && used >= MED_CAPACITY) return;
        md[k] = Math.max(0, Math.min(4, md[k] + d));
        Game.saveSettings(); medUI(); this.loadoutSummary();
        if (Game.state === 'menu') P.med = { ...md };
      };
      medUI();
      lo.onchange = onLo; las.onchange = onLo; lps.onchange = onLo;
      this.loadoutSummary();
      const ac = $('ally-count'); ac.value = String(Game.allyCount);
      const allyRadios = [...document.querySelectorAll('input[name="lo-allies"]')];
      const syncAllies = () => { ac.value = String(Game.allyCount); for (const radio of allyRadios) radio.checked = +radio.value === Game.allyCount; this.loadoutSummary(); };
      const setAllies = value => { Game.allyCount = value; Game.saveSettings(); if (Game.state === 'menu') Game.reset(); syncAllies(); };
      ac.onchange = () => setAllies(+ac.value);
      for (const radio of allyRadios) radio.onchange = () => { if (radio.checked) setAllies(+radio.value); };
      syncAllies();
      const tm = $('team'); tm.value = Game.team; G.Viewmodel.setTeam(Game.team);
      tm.onchange = () => { Game.team = tm.value; G.Viewmodel.setTeam(Game.team); Game.saveSettings(); };
      const wm = $('wheelmode'); wm.value = Game.wheelMode;
      wm.onchange = () => { Game.wheelMode = wm.value; Game.saveSettings(); };
      const sv = $('stepvol'); sv.value = G.Audio.stepVol; $('stepvol-val').textContent = Math.round(G.Audio.stepVol * 100) + '%';
      sv.oninput = () => { G.Audio.stepVol = +sv.value; $('stepvol-val').textContent = Math.round(sv.value * 100) + '%'; Game.saveSettings(); };
      const raw = $('rawmouse'); raw.value = Game.rawMouse ? 'raw' : 'os';
      raw.onchange = () => { Game.rawMouse = raw.value === 'raw'; Game.saveSettings(); };
      const ar = $('autores'); ar.checked = Game.autoRes;
      ar.onchange = () => { Game.autoRes = ar.checked; if (!ar.checked) { Game.resScale = 1; Game.applyQuality(); } Game.saveSettings(); };
      const dismember = $('dismember'); dismember.checked = Game.dismember;
      dismember.onchange = () => { Game.dismember = dismember.checked; Game.saveSettings(); };
      const touchMode = $('touch-mode'); touchMode.value = G.Touch.mode;
      touchMode.onchange = () => G.Touch.setMode(touchMode.value);
      $('btn-voice-preview').onclick = () => { G.Audio.init(); G.Audio.playerVoice('hurt'); };
      const tp = $('touchpad'); tp.checked = G.Input.touchpadGuard;
      tp.onchange = () => { G.Input.touchpadGuard = tp.checked; Game.saveSettings(); };
      const gore = $('gore'); gore.value = Game.gore;
      gore.onchange = () => { Game.gore = gore.value; Game.saveSettings(); };
      const q = $('quality'); q.value = Game.quality;
      q.onchange = () => { Game.quality = q.value; Game.applyQuality(); Game.saveSettings(); };
      fs.checked = Game.fullscreen;
      fs.onchange = () => { Game.fullscreen = fs.checked; Game.saveSettings(); };
      G.Input.onRebind = (id, saved) => { this.renderKeys(); if (id) this.keyNote(saved ? '保存しました。' : '変更しましたが、ブラウザーに保存できませんでした（このままでも遊べます）。'); else this.keyNote('キャンセルしました。'); };
      this.renderKeys();
      // コントローラー設定
      const S = G.Pad.settings;
      const pa = $('pad-assist'), ps = $('pad-sens'), pi = $('pad-invert'), pv = $('pad-vib');
      pa.checked = S.assist; ps.value = S.sens; $('pad-sens-val').textContent = (+S.sens).toFixed(2); pi.checked = S.invertY; pv.checked = S.vibrate;
      pa.onchange = () => { S.assist = pa.checked; G.Pad.saveSettings(); };
      ps.oninput = () => { S.sens = +ps.value; $('pad-sens-val').textContent = (+ps.value).toFixed(2); G.Pad.saveSettings(); };
      pi.onchange = () => { S.invertY = pi.checked; G.Pad.saveSettings(); };
      pv.onchange = () => { S.vibrate = pv.checked; G.Pad.saveSettings(); if (pv.checked) G.Pad.vibrate(0.6, 0.6, 120); };
      $('btn-reset-pad').onclick = () => { const ok = G.Pad.resetBinds(); this.renderPad(); this.padNote(ok ? '初期設定に戻しました。' : '初期設定に戻しましたが、保存できませんでした。'); };
      G.Pad.onRebind = (id, ok) => { this.renderPad(); this.padNote(ok ? '保存しました。' : '変更しましたが、ブラウザーに保存できませんでした（このままでも遊べます）。'); };
      this.renderPad(); this.padStatus();
      setInterval(() => this.padStatus(), 1000);
      if (!G.Storage.ok) this.keyNote('このブラウザーでは設定を保存できないため、次回起動時に初期設定に戻ります。');
      this.show('main');
    },
    show(which) {
      G.Touch.sync();
      $('menu').classList.toggle('on', which === 'main' || which === 'pause');
      $('menu').dataset.mode = which || '';
      $('end').classList.toggle('on', which === 'end');
      $('hud').classList.toggle('on', which === null);
      if (which !== 'main' && which !== 'pause') this.panel(null);
      this.note('');
    },
    panel(name) {
      for (const p of document.querySelectorAll('.panel')) p.classList.toggle('on', p.id === 'panel-' + name);
      $('menu-main').classList.toggle('dim', !!name);
      if (name === 'loadout') $('btn-deploy').hidden = Game.state === 'paused';
      G.Input.rebinding = null;
      if (G.Pad) G.Pad.rebinding = null;
    },
    note(t) { $('menu-note').textContent = t; },
    loadoutSummary() {
      const L = Game.loadout;
      const md = L.med || { tq: 0, hemo: 0, band: 0, medicine: 0, stim: 0 };
      const squad = Game.allyCount === 2 ? 'ALPHA＋BRAVO' : Game.allyCount === 1 ? 'ALPHA' : '単独';
      $('loadout-sum').textContent = `同行：${squad}／装備：M4A1（${L.optic === 'dot' ? 'ドットサイト' : 'スコープ'}${L.arSup ? '・サプレッサー' : ''}）／Glock 17${L.pistolSup ? '（サプレッサー）' : ''}／Remington 870／手りゅう弾×2／止血帯×${md.tq}・止血剤×${md.hemo}・包帯×${md.band}・治療薬×${md.medicine}・回復注射×${md.stim || 0}`;
    },
    padNote(t) { $('pad-note').textContent = t; },
    padStatus() {
      const el = $('pad-status'); if (!el) return;
      const on = G.Pad.connected();
      const t = on ? '接続中：' + (G.Pad.name || 'コントローラー').slice(0, 60) : '未接続（つないだ後、コントローラーのボタンを1回押してください）';
      if (el.textContent !== t) el.textContent = t;
      el.classList.toggle('on', on);
    },
    renderPad() {
      const tb = $('pad-body'); tb.innerHTML = '';
      tb.appendChild(Object.assign(document.createElement('tr'), { className: 'fixed', innerHTML: '<td>移動</td><td><span class="key fixed">左スティック</span></td>' }));
      tb.appendChild(Object.assign(document.createElement('tr'), { className: 'fixed', innerHTML: '<td>視点</td><td><span class="key fixed">右スティック</span></td>' }));
      for (const a of G.Pad.PAD_ACTIONS) {
        const tr = document.createElement('tr');
        const waiting = G.Pad.rebinding === a.id;
        tr.innerHTML = `<td>${a.label}</td><td><button class="key ${waiting ? 'waiting' : ''}">${waiting ? 'ボタンを押す（もう一度クリックで取消）' : G.Pad.btnName(G.Pad.binds[a.id])}</button></td>`;
        tr.querySelector('button').onclick = () => {
          if (G.Pad.rebinding === a.id) { G.Pad.rebinding = null; this.renderPad(); this.padNote('キャンセルしました。'); return; }
          if (!G.Pad.connected()) { this.padNote('コントローラーが見つかりません。つないでボタンを1回押してから、もう一度選んでください。'); return; }
          G.Pad.rebinding = a.id; this.renderPad(); this.padNote('割り当てたいボタンをコントローラーで押してください。すでに使われているボタンなら、その操作と入れ替えます。');
        };
        tb.appendChild(tr);
      }
    },
    keyNote(t) { $('key-note').textContent = t; },
    renderKeys() {
      const tb = $('keys-body'); tb.innerHTML = '';
      for (const a of G.ACTIONS) {
        const tr = document.createElement('tr');
        const waiting = G.Input.rebinding === a.id;
        tr.innerHTML = `<td>${a.label}</td><td><button class="key ${waiting ? 'waiting' : ''}">${waiting ? 'キーを押す（Escで取消）' : G.keyName(G.Input.binds[a.id])}</button></td>`;
        tr.querySelector('button').onclick = () => { G.Input.rebinding = a.id; this.renderKeys(); this.keyNote('割り当てたいキーを押してください。すでに使われているキーなら、その操作と入れ替えます。'); };
        tb.appendChild(tr);
      }
      for (const [k, v] of [['射撃', '左クリック（ライフルは長押しで連射）'], ['照準', '右クリック（押している間）'], ['ホイール', '照準中はスコープ倍率。それ以外は武器の持ち替え（Xを押している間は忍び歩き）'], ['手りゅう弾', '中央クリック（ホイール押し込み）を長押し → 離して投げる'], ['一時停止', 'Esc']]) {
        const tr = document.createElement('tr'); tr.className = 'fixed';
        tr.innerHTML = `<td>${k}</td><td><span class="key fixed">${v}</span></td>`; tb.appendChild(tr);
      }
    },
  };

  // ======================= 起動 =======================
  window.addEventListener('DOMContentLoaded', () => {
    const fail = (msg) => { const e = $('boot-error'); e.querySelector('p').textContent = msg; e.classList.add('on'); };
    if (!window.THREE) { fail('3D描画ライブラリ（Three.js）を読み込めませんでした。js フォルダーに three.min.js があるか確認してください。フォルダーごと解凍せずに開いた場合にも起こります。'); return; }
    const test = document.createElement('canvas');
    if (!(test.getContext('webgl2') || test.getContext('webgl'))) { fail('このブラウザーまたはPCでは WebGL が使えません。Chrome か Edge の最新版で、ハードウェアアクセラレーションが有効か確認してください。'); return; }
    try { Game.init(); }
    catch (e) { console.error(e); fail('起動中にエラーが発生しました：' + (e && e.message ? e.message : e)); }
  });
})();

// ===== ゲームコントローラー（Xbox／PlayStation 系の標準配置） =====
'use strict';
(function () {
  const G = window.G;
  // 標準配置のボタン番号と表示名
  const BTN_NAMES = ['A／×', 'B／○', 'X／□', 'Y／△', 'LB／L1', 'RB／R1', 'LT／L2', 'RT／R2', 'View／Share', 'Menu／Options',
    '左スティック押し込み', '右スティック押し込み', '十字キー上', '十字キー下', '十字キー左', '十字キー右', 'ホーム'];
  // 割り当てられる操作（移動は左スティック、視点は右スティックで固定）
  const PAD_ACTIONS = [
    { id: 'fire', label: '射撃', def: 7 },
    { id: 'ads', label: '照準・スコープ（押している間）', def: 6 },
    { id: 'reload', label: 'リロード', def: 2 },
    { id: 'crouch', label: 'しゃがみ（切替）', def: 1 },
    { id: 'prone', label: '匍匐（切替）', def: 0 },
    { id: 'leanL', label: '左リーン（切替）', def: 4 },
    { id: 'leanR', label: '右リーン（切替）', def: 5 },
    { id: 'sprint', label: 'ダッシュ（押すと前進中ずっと）', def: 10 },
    { id: 'knife', label: '近接ナイフ', def: 11 },
    { id: 'nextWeapon', label: '武器の持ち替え（順番に）', def: 3 },
    { id: 'grenade', label: '手りゅう弾（長押しで構え、離して投げる）', def: 15 },
    { id: 'walk', label: 'ゆっくり歩く（切替）', def: 14 },
    { id: 'suppressor', label: 'サプレッサーの取り付け・取り外し', def: null },
    { id: 'zoomIn', label: '倍率を上げる（照準中）／歩く速さを上げる', def: 12 },
    { id: 'zoomOut', label: '倍率を下げる（照準中）／歩く速さを下げる', def: 13 },
    { id: 'pause', label: '一時停止・再開', def: 9 },
    { id: 'treat', label: '応急処置（出血を止める）', def: 8 },
    { id: 'command', label: '仲間に指示（ついてこい／その場で待て）', def: null },
    { id: 'moveOrder', label: '照準位置へ仲間を移動', def: null },
    { id: 'debug', label: 'AI状態の表示（開発用）', def: null },
  ];
  const EDGE_ACTIONS = ['treat', 'command', 'moveOrder', 'reload', 'crouch', 'prone', 'leanL', 'leanR', 'knife', 'zoomIn', 'zoomOut', 'debug', 'nextWeapon', 'suppressor'];

  const Pad = G.Pad = {
    BTN_NAMES, PAD_ACTIONS,
    binds: {}, prev: [], cur: [], index: -1, name: '',
    move: { x: 0, y: 0 }, look: { x: 0, y: 0 },
    fire: false, ads: false, grenade: false, walkToggle: false, sprintLatch: false, used: false, lastUseT: -99,
    settings: { assist: true, sens: 1, invertY: false, vibrate: true, deadzone: 0.15 },
    rebinding: null, onRebind: null,

    init() {
      const saved = G.Storage.get('cq_padbinds_v1');
      for (const a of PAD_ACTIONS) this.binds[a.id] = (saved && (Number.isInteger(saved[a.id]) || saved[a.id] === null) && a.id in saved) ? saved[a.id] : a.def;
      const st = G.Storage.get('cq_padsettings_v1');
      if (st) Object.assign(this.settings, st);
      window.addEventListener('gamepadconnected', (e) => { this.name = e.gamepad.id; if (G.Menu && G.Menu.padStatus) G.Menu.padStatus(); });
      window.addEventListener('gamepaddisconnected', () => { this.index = -1; if (G.Menu && G.Menu.padStatus) G.Menu.padStatus(); if (G.Game.state === 'playing' && !document.pointerLockElement && !G.Game.testMode) G.Game.pause(); });
    },
    saveBinds() { return G.Storage.set('cq_padbinds_v1', this.binds); },
    saveSettings() { return G.Storage.set('cq_padsettings_v1', this.settings); },
    resetBinds() { for (const a of PAD_ACTIONS) this.binds[a.id] = a.def; return this.saveBinds(); },
    connected() { return !!this.get(); },
    get() {
      const list = navigator.getGamepads ? navigator.getGamepads() : [];
      if (this.index >= 0 && list[this.index]) return list[this.index];
      for (let i = 0; i < list.length; i++) if (list[i] && list[i].connected) { this.index = i; this.name = list[i].id; return list[i]; }
      return null;
    },
    btnName(i) { return i === undefined || i === null ? '未設定' : (BTN_NAMES[i] || ('ボタン' + i)); },
    pressed(i) { return !!this.cur[i]; },
    edge(i) { return !!this.cur[i] && !this.prev[i]; },
    // スティックの遊び（デッドゾーン）と、小さく傾けたときに細かく狙える曲線
    stick(x, y, curve) {
      const dz = this.settings.deadzone, m = Math.hypot(x, y);
      if (m < dz) return { x: 0, y: 0 };
      const k = Math.min(1, (m - dz) / (1 - dz));
      const kk = curve ? Math.pow(k, curve) : k;
      return { x: x / m * kk, y: y / m * kk };
    },

    // 毎フレーム呼ぶ。戻り値：一時停止ボタンが押されたか
    poll() {
      const gp = this.get();
      this.prev = this.cur;
      this.cur = [];
      if (!gp) { this.move = { x: 0, y: 0 }; this.look = { x: 0, y: 0 }; this.fire = this.ads = this.grenade = false; return false; }
      for (let i = 0; i < gp.buttons.length; i++) { const b = gp.buttons[i]; this.cur[i] = b && (b.pressed || b.value > 0.5); }
      // 割り当て中：最初に押されたボタンを割り当てる
      if (this.rebinding) {
        for (let i = 0; i < this.cur.length; i++) if (this.edge(i)) { this.assign(this.rebinding, i); break; }
        return false;
      }
      this.move = this.stick(gp.axes[0] || 0, gp.axes[1] || 0, 0);
      this.look = this.stick(gp.axes[2] || 0, gp.axes[3] || 0, 1.7);
      if (this.settings.invertY) this.look.y = -this.look.y;
      this.fire = this.pressed(this.binds.fire);
      this.ads = this.pressed(this.binds.ads);
      this.grenade = this.pressed(this.binds.grenade);
      if (this.edge(this.binds.walk)) this.walkToggle = !this.walkToggle;
      if (Math.hypot(this.move.x, this.move.y) < 0.05) this.walkToggle = this.walkToggle;   // 止まっても保持
      // ダッシュ：押すと、前へ倒している間はずっとダッシュ
      if (this.edge(this.binds.sprint)) this.sprintLatch = true;
      if (this.move.y > -0.35) this.sprintLatch = false;
      const any = this.cur.some(Boolean) || Math.abs(this.move.x) + Math.abs(this.move.y) + Math.abs(this.look.x) + Math.abs(this.look.y) > 0;
      if (any) { this.used = true; this.lastUseT = performance.now(); }
      if (G.Input.enabled) for (const id of EDGE_ACTIONS) if (this.binds[id] !== null && this.binds[id] !== undefined && this.edge(this.binds[id])) G.Input.edges.push(id);
      return this.edge(this.binds.pause);
    },
    assign(actionId, btn) {
      const prev = this.binds[actionId];
      for (const a of PAD_ACTIONS) if (a.id !== actionId && this.binds[a.id] === btn) this.binds[a.id] = prev;   // 重複は交換
      this.binds[actionId] = btn;
      this.rebinding = null;
      const ok = this.saveBinds();
      if (this.onRebind) this.onRebind(actionId, ok);
    },
    vibrate(strong, weak, ms) {
      if (!this.settings.vibrate) return;
      const gp = this.get();
      try { if (gp && gp.vibrationActuator) gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) { }
    },

    // ---- エイム補助（オン／オフ可能。コントローラー使用時だけ働く） ----
    // 照準の近くに見えている敵がいると、視点の動きを遅くし（狙いすぎを防ぐ）、
    // 自分がスティックを動かしているときだけ、わずかに敵の方へ引き寄せる（止まっているのに勝手に狙うことはない）
    assist(cam, P) {
      if (!this.settings.assist) return { slow: 1, pullYaw: 0, pullPitch: 0 };
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      let best = null, bestAng = Infinity;
      for (const e of G.Enemies.list) {
        if (e.dead) continue;
        const t = new THREE.Vector3(); e.body.bones.chest.getWorldPosition(t);
        const v = t.clone().sub(cam.position), dist = v.length();
        if (dist > 45) continue;
        v.normalize();
        const ang = Math.acos(Math.max(-1, Math.min(1, v.dot(f))));
        const radius = Math.max(0.035, 0.6 / dist);       // 近い敵ほど広く
        if (ang > radius * 2.2 || ang >= bestAng) continue;
        if (!G.World.lineOfSight(cam.position.x, cam.position.y, cam.position.z, t.x, t.y, t.z)) continue;
        best = { t, ang, radius }; bestAng = ang;
      }
      if (!best) return { slow: 1, pullYaw: 0, pullPitch: 0 };
      const slow = best.ang < best.radius ? 0.5 : 0.75;
      const dx = best.t.x - cam.position.x, dz = best.t.z - cam.position.z, dy = best.t.y - cam.position.y;
      const wantYaw = Math.atan2(-dx, -dz), wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
      let dyaw = wantYaw - P.yaw; while (dyaw > Math.PI) dyaw -= Math.PI * 2; while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      return { slow, pullYaw: dyaw, pullPitch: wantPitch - (P.pitch + P.recoil) };
    },
  };
})();

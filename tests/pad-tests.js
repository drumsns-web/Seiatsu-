(async () => {
  const R = []; const ok = (n, c, i) => R.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  [' + i + ']' : ''));
  const P = G.Player, Gm = G.Game, Pad = G.Pad;
  // 仮のコントローラー
  const pad = { id: 'テスト用コントローラー', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  navigator.getGamepads = () => [pad];
  const press = (i, on) => { pad.buttons[i] = { pressed: on, value: on ? 1 : 0 }; };
  Gm.reset(); Gm.state = 'menu'; G.Input.enabled = false;
  Gm.testMode = false; Gm.begin(); Gm.testMode = true;
  ok('コントローラー接続時はマウスを固定せずに開始できる', Gm.state === 'playing' && G.Input.enabled);
  G.Enemies.list.forEach(e => { e.update = function (dt) { this.syncModel(dt); }; e.pos.set(45 + e.id * 0.8, 0, 37.5); });
  P.pos.set(3.5, 0, 2.5); P.yaw = Math.PI; P.pitch = 0; Gm.step(2);
  // 左スティックで移動
  pad.axes = [0, -1, 0, 0]; Gm.step(60); pad.axes = [0, 0, 0, 0]; Gm.step(10);
  ok('左スティックで前進', P.pos.z > 4.5, P.pos.z.toFixed(2));
  pad.axes = [0, -0.45, 0, 0]; const z0 = P.pos.z; Gm.step(30); pad.axes = [0, 0, 0, 0]; Gm.step(10);
  const half = P.pos.z - z0;
  P.pos.set(3.5, 0, 2.5); Gm.step(2);
  ok('スティックを浅く倒すとゆっくり歩く', half > 0.1 && half < 1.4, half.toFixed(2) + 'm/0.5秒');
  // 右スティックで視点
  const y0 = P.yaw; pad.axes = [0, 0, 1, 0]; Gm.step(30); pad.axes = [0, 0, 0, 0]; Gm.step(2);
  ok('右スティックで視点が回る', Math.abs(P.yaw - y0) > 0.5, (P.yaw - y0).toFixed(2));
  P.yaw = Math.PI; P.pitch = 0;
  // 射撃・照準
  const a0 = P.ammo; press(7, true); Gm.step(30); press(7, false); Gm.step(2);
  ok('RTで射撃', P.ammo < a0, a0 + '→' + P.ammo);
  press(6, true); Gm.step(20); ok('LTで照準', P.ads); press(6, false); Gm.step(20);
  // 切り替え操作
  press(1, true); Gm.step(1); press(1, false); Gm.step(1); ok('Bでしゃがみ', P.posture === 'crouch');
  press(1, true); Gm.step(1); press(1, false); Gm.step(1); ok('もう一度Bで立つ', P.posture === 'stand');
  press(4, true); Gm.step(1); press(4, false); Gm.step(1); ok('LBで左リーン', P.lean === -1);
  press(4, true); Gm.step(1); press(4, false); Gm.step(1);
  // ダッシュ（押すと前進中はずっと）
  pad.axes = [0, -1, 0, 0]; press(10, true); Gm.step(1); press(10, false); Gm.step(10);
  ok('左スティック押し込みでダッシュが続く', P.sprinting);
  pad.axes = [0, 0, 0, 0]; Gm.step(5); ok('前進をやめるとダッシュ終了', !P.sprinting);
  // ボタンの割り当て変更（重複は交換）
  Pad.rebinding = 'crouch'; press(2, true); Pad.poll(); press(2, false); Pad.poll();
  ok('割り当て変更：しゃがみ＝X、リロード＝B（交換）', Pad.binds.crouch === 2 && Pad.binds.reload === 1, JSON.stringify([Pad.binds.crouch, Pad.binds.reload]));
  ok('割り当てを保存', (JSON.parse(localStorage.getItem('cq_padbinds_v1') || '{}')).crouch === 2);
  Pad.resetBinds(); ok('初期設定に戻す', Pad.binds.crouch === 1 && Pad.binds.reload === 2);
  // エイム補助：照準の少し横に敵 → 右スティックを少し動かすと敵の方へ寄る（オフでは寄らない）
  const trial = (on) => {
    Pad.settings.assist = on;
    P.pos.set(3.5, 0, 1.5); P.yaw = Math.PI; P.pitch = 0; P.recoil = 0; P.vel.set(0, 0, 0);
    const e = G.Enemies.list[0]; e.pos.set(3.1, 0, 5.5); e.state = 'patrol'; e.hp = 100; for (let i = 0; i < 20; i++) e.syncModel(1 / 60);
    Gm.step(2);
    // 敵とは逆向き（右）へ、ごくゆっくり視点を動かす
    const base = P.yaw; pad.axes = [0, 0, 0.35, 0]; Gm.step(40); pad.axes = [0, 0, 0, 0];
    return P.yaw - base;
  };
  const off = trial(false), onv = trial(true);
  ok('エイム補助オン：照準付近の敵で視点が遅くなる・引き寄せられる（オフとの差）', Math.abs(onv) < Math.abs(off) * 0.85, 'オン ' + onv.toFixed(3) + ' / オフ ' + off.toFixed(3));
  const still = (() => { Pad.settings.assist = true; const b = P.yaw; Gm.step(60); return Math.abs(P.yaw - b); })();
  ok('スティックを動かしていないときは勝手に狙わない', still < 1e-6, still);
  Pad.settings.assist = true;
  // 一時停止
  press(9, true); Gm.step(1); press(9, false); Gm.step(1);
  ok('Menuボタンで一時停止', Gm.state === 'paused', Gm.state);
  let err = null; try { Pad.vibrate(0.5, 0.5, 50); } catch (e) { err = e.message; }
  ok('振動の命令がエラーにならない', !err, err || '');
  return R.join('\n');
})()

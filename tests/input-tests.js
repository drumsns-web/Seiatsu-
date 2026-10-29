(async () => {
  const R = []; const ok = (n, c, i) => R.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  [' + i + ']' : ''));
  const I = G.Input, P = G.Player, Gm = G.Game;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const md = (b) => window.dispatchEvent(new MouseEvent('mousedown', { button: b, bubbles: true }));
  const mu = (b) => window.dispatchEvent(new MouseEvent('mouseup', { button: b, bubbles: true }));
  Gm.reset(); Gm.state = 'playing'; I.enabled = true;
  // 対策オフ：押した瞬間に反応
  I.touchpadGuard = false; md(0); ok('通常：クリックですぐ射撃入力', I.mouse.lmb === true); mu(0);
  // 対策オン：短いタップは無視
  I.touchpadGuard = true;
  md(0); await wait(15); mu(0); await wait(80);
  ok('対策オン：短いタップは射撃にならない', I.mouse.lmb === false);
  md(2); await wait(10); mu(2); await wait(80);
  ok('対策オン：2本指タップ（右クリック）でも照準にならない', I.mouse.rmb === false);
  md(0); await wait(100);
  ok('対策オン：押し続ければ射撃入力になる', I.mouse.lmb === true); mu(0);
  ok('離せば止まる', I.mouse.lmb === false);
  // ホイール
  I.takeMouse();
  const wh = (o) => { const e = new WheelEvent('wheel', Object.assign({ bubbles: true, cancelable: true, deltaMode: 0 }, o)); window.dispatchEvent(e); };
  wh({ deltaY: 100 }); wh({ deltaY: 4.5 }); wh({ deltaY: 7, ctrlKey: true });
  const m1 = I.takeMouse();
  ok('対策オン：細かいスクロール（タッチパッド）とピンチは無視、マウスのホイールは有効', m1.wheel === 1, m1.wheel);
  I.touchpadGuard = false; wh({ deltaY: 4.5 }); wh({ deltaY: 3, ctrlKey: true });
  const m2 = I.takeMouse();
  ok('対策オフでもピンチ操作は無視（画面が拡大されない）', m2.wheel === 1, m2.wheel);
  // キーで倍率変更
  I.mouse.rmb = true; Gm.step(20); const z0 = P.zoom;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX', bubbles: true })); Gm.step(1); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX', bubbles: true }));
  const z1 = P.zoom;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', bubbles: true })); Gm.step(1); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ', bubbles: true }));
  ok('X／Zで倍率を変えられる', z1 === z0 + 0.5 && P.zoom === z0, [z0, z1, P.zoom].join('→'));
  I.mouse.rmb = false;

  // マウスの異常な移動量（1回だけ桁違いに大きい値）は捨て、普通の素早い振り向きは通す
  I.takeMouse(); I._mAvg = 0;
  const mv = (x) => window.dispatchEvent(new MouseEvent('mousemove', { movementX: x, movementY: 0, bubbles: true }));
  for (const x of [20, 25, 30, 22]) mv(x);
  const before = I.takeMouse().dx;
  mv(520); const spike = I.takeMouse().dx;
  ok('急に桁違いに大きい移動量（異常値）は捨てる', before === 97 && spike === 0, before + ' / ' + spike);
  for (const x of [40, 80, 150, 250, 350]) mv(x);
  const flick = I.takeMouse().dx;
  ok('少しずつ速くなる素早い振り向きは捨てない', flick === 870, flick);
  return R.join('\n');
})()

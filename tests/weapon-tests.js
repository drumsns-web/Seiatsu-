(() => {
  const R = []; const ok = (n, c, i) => R.push((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  [' + i + ']' : ''));
  const P = G.Player, Gm = G.Game, I = G.Input, VM = G.Viewmodel;
  const key = (code, type = 'keydown') => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  const tap = (code) => { key(code); Gm.step(1); key(code, 'keyup'); Gm.step(1); };
  const fresh = () => { Gm.reset(); Gm.state = 'playing'; I.enabled = true; G.Enemies.list.forEach(e => { e.update = function (dt) { this.speed = 0; this.syncModel(dt); }; e.pos.set(45 + e.id * 0.8, 0, 37.5); }); };
  const place = (x, z, yaw) => { P.pos.set(x, 0, z); P.vel.set(0, 0, 0); P.yaw = yaw; P.pitch = 0; P.recoil = 0; Gm.step(2); };
  const resetE = (e, x, z) => { e.pos.set(x, 0, z); e.hp = 100; e.state = 'patrol'; e.wounds = { leg: 0, stomach: 0, arm: 0 }; e.body.st.dead = false; e.body.st.settled = false; for (let i = 0; i < 30; i++) e.syncModel(1 / 60); };
  const aimAt = (y, x, z) => { const c = G.camera.position; const dx = x - c.x, dz = z - c.z, dy = y - c.y; P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz)); P.recoil = 0; Gm.step(1); };

  // ---- 持ち替え ----
  fresh(); place(3.5, 2.5, Math.PI);
  tap('Digit2'); Gm.step(40);
  ok('2キーでハンドガンに持ち替え', P.cur === 'pistol' && VM.cur === 'pistol' && P.ammo === 15, P.cur + '/' + VM.cur);
  tap('Digit3'); Gm.step(40);
  ok('3キーでショットガンに持ち替え', P.cur === 'shotgun' && VM.cur === 'shotgun' && P.ammo === 6);
  tap('Digit1'); Gm.step(40);
  ok('1キーでライフルに戻る（弾数は武器ごとに保持）', P.cur === 'ar' && P.ammo === 30);
  tap('Digit2'); Gm.step(2);
  const a0 = P.ammo; I.mouse.lmb = true; Gm.step(3); I.mouse.lmb = false; Gm.step(30);
  ok('持ち替えの途中は撃てない', P.ammo === a0);

  // ---- ハンドガン：単発 ----
  fresh(); place(3.5, 2.5, 0.3); P.pitch = 0.3; tap('Digit2'); Gm.step(40);
  const p0 = P.ammo; I.mouse.lmb = true; Gm.step(60); I.mouse.lmb = false; Gm.step(5);
  ok('ハンドガンは押し続けても1発だけ（単発）', p0 - P.ammo === 1, p0 - P.ammo);
  for (let i = 0; i < 4; i++) { I.mouse.lmb = true; Gm.step(2); I.mouse.lmb = false; Gm.step(8); }
  ok('クリックした回数だけ撃てる', p0 - P.ammo === 5, p0 - P.ammo);
  P.ammo = 1; I.mouse.lmb = true; Gm.step(2); I.mouse.lmb = false; Gm.step(5);
  ok('弾切れでスライドが後退したまま止まる', VM.state.slideLock === true);
  tap('KeyR'); Gm.step(Math.ceil(1.9 * 60));
  ok('ハンドガンのリロード（弾切れから）で15発・スライドが戻る', P.ammo === 15 && !P.reloading && VM.state.slideLock === false, P.ammo);

  // ---- ショットガン：散弾・ポンプ・1発ずつ装填 ----
  fresh();
  const e = G.Enemies.list[0]; place(3.5, 2.5, Math.PI); tap('Digit3'); Gm.step(40);
  resetE(e, 3.5, 5.5); aimAt(1.2, e.pos.x, e.pos.z);
  I.mouse.lmb = true; Gm.step(1); I.mouse.lmb = false; Gm.step(1);
  ok('ショットガン近距離（3m）：散弾がまとまって当たり大ダメージ', e.hp <= 0 || 100 - e.hp > 60, 100 - e.hp);
  const s1 = P.ammo; I.mouse.lmb = true; Gm.step(5); I.mouse.lmb = false; Gm.step(1);
  ok('撃った直後はポンプ操作中で撃てない', P.ammo === s1);
  Gm.step(40); I.mouse.lmb = true; Gm.step(1); I.mouse.lmb = false; Gm.step(1);
  ok('ポンプ操作の後は撃てる', P.ammo === s1 - 1);
  // 遠距離では威力が落ちる
  fresh(); const e2 = G.Enemies.list[1]; place(10.5, 18.5, -Math.PI / 2); tap('Digit3'); Gm.step(40);
  resetE(e2, 34.5, 18.5); aimAt(1.2, e2.pos.x, e2.pos.z);
  I.mouse.rmb = true; Gm.step(20); aimAt(1.2, e2.pos.x, e2.pos.z);
  I.mouse.lmb = true; Gm.step(1); I.mouse.lmb = false; Gm.step(1); I.mouse.rmb = false;
  ok('ショットガン遠距離（24m）：一撃では倒れない', e2.hp > 0, 100 - e2.hp);
  // 1発ずつ装填
  P.ammo = 2; const res0 = P.reserve; tap('KeyR');
  Gm.step(Math.ceil((0.3 + 0.5 * 1.5) * 60));
  const mid = P.ammo;
  ok('1発ずつ装填される（途中で弾数が増えていく）', mid > 2 && mid < 6, mid);
  I.mouse.lmb = true; Gm.step(1); I.mouse.lmb = false;
  Gm.step(80);
  ok('装填中に撃つと、装填をやめて撃てる', !P.reloading && P.ammo >= mid - 1 && P.ammo < 6, P.ammo);
  ok('予備弾は入れた分だけ減る', res0 - P.reserve === (P.ammo + (P.ammo < mid ? 1 : 0)) - 2 || res0 - P.reserve >= mid - 2, res0 - P.reserve);

  // ---- 手りゅう弾 ----
  fresh(); place(3.5, 2.5, Math.PI); P.pitch = 0.1;
  const g0 = P.grenades;
  key('KeyG'); Gm.step(20);
  ok('Gを押し続けると構え、軌道が表示される', P.gHold && G.Grenades.previewLine.visible && G.Grenades.ring.visible);
  key('KeyG', 'keyup'); Gm.step(12);
  ok('離すと投げる（数が減り、飛んでいく）', P.grenades === g0 - 1 && G.Grenades.list.length === 1 && !G.Grenades.previewLine.visible);
  const gr = G.Grenades.list[0];
  let maxY = 0, landed = false; for (let i = 0; i < 120; i++) { Gm.step(1); if (G.Grenades.list[0]) { maxY = Math.max(maxY, gr.p.y); if (gr.p.y < 0.1) landed = true; } }
  ok('放物線を描いて床に落ちる', maxY > 1.7 && landed, maxY.toFixed(2));
  ok('床より下にすり抜けない', gr.p.y > 0.0, gr.p.y.toFixed(3));
  Gm.step(80);
  ok('約2.6秒で爆発して消える', G.Grenades.list.length === 0);
  // 中央クリックでも
  fresh(); place(3.5, 2.5, Math.PI);
  I.mouse.mmb = true; Gm.step(10); const holding = P.gHold; I.mouse.mmb = false; Gm.step(12);
  ok('マウス中央クリックでも構えて投げられる', holding && G.Grenades.list.length === 1);
  // 爆発の被害：近くの敵は倒れ、壁の向こうは無傷
  fresh();
  const near = G.Enemies.list[0], behind = G.Enemies.list[1], far = G.Enemies.list[2];
  resetE(near, 21.5, 18.5); resetE(behind, 10.5, 2.5); resetE(far, 35.5, 25.5);
  place(28.5, 25.5, 0);
  G.Grenades.explode(new THREE.Vector3(21.5, 0.05, 19.5));
  ok('爆心の1m先の敵は倒れる', near.dead, near.hp);
  ok('遠い敵（14m以上）は無傷', far.hp === 100);
  near.state = 'patrol';
  fresh(); const wb = G.Enemies.list[1]; resetE(wb, 10.5, 2.5);
  G.Grenades.explode(new THREE.Vector3(7.5, 0.05, 2.5));
  ok('壁の向こう（3m先）の敵は爆風を受けない', wb.hp === 100, wb.hp);
  // 自分も巻き込まれる（伏せると軽く）
  fresh(); place(3.5, 2.5, Math.PI);
  G.Grenades.explode(new THREE.Vector3(3.5, 0.05, 5.5)); const hpStand = P.hp;
  fresh(); place(3.5, 2.5, Math.PI); tap('ControlLeft'); Gm.step(30);
  G.Grenades.explode(new THREE.Vector3(3.5, 0.05, 5.5)); const hpProne = P.hp;
  ok('近くの爆発で自分も負傷し、伏せていると被害が小さい', hpStand < 100 && hpProne > hpStand, hpStand.toFixed(0) + ' / ' + hpProne.toFixed(0));
  // 敵は手りゅう弾から逃げる
  fresh();
  const ev = G.Enemies.list[3]; ev.update = ev.constructor.prototype.update; resetE(ev, 24.5, 18.5); ev.state = 'combat'; ev.lastSeenPos = new THREE.Vector3(30, 0, 18); ev.lastSeenT = G.time;
  place(31.5, 18.5, Math.PI / 2);
  const gg = G.Grenades.throw(new THREE.Vector3(25.0, 1.0, 18.5), new THREE.Vector3(0, -1, 0), true);
  let evaded = false; const d0 = ev.pos.distanceTo(gg.p);
  for (let i = 0; i < 140 && G.Grenades.list.length; i++) { Gm.step(1); if (ev.state === 'evade') evaded = true; }
  ok('近くに手りゅう弾が落ちた敵は逃げる', evaded, ev.state);
  ok('爆発前に離れている', ev.dead === false && ev.hp > 0, 'hp ' + ev.hp.toFixed(0));

  // ---- ホイールで歩く速さ ----
  fresh(); place(3.5, 2.5, Math.PI);
  G.Game.wheelMode = 'speed';
  I.mouse.wheel = 3; Gm.step(1);
  ok('ホイール下で歩く速さが下がる（3段階下で50%）', P.speedLevel === 2, P.speedLevel);
  const z0 = P.pos.z; key('KeyW'); Gm.step(60); key('KeyW', 'keyup'); Gm.step(10);
  const slowDist = P.pos.z - z0;
  I.mouse.wheel = -10; Gm.step(1); place(3.5, 2.5, Math.PI);
  const z1 = P.pos.z; key('KeyW'); Gm.step(60); key('KeyW', 'keyup'); Gm.step(10);
  const fullDist = P.pos.z - z1;
  ok('遅い段階では進む距離が短い', slowDist < fullDist * 0.6 && slowDist > 0.5, slowDist.toFixed(2) + ' / ' + fullDist.toFixed(2));
  // 遅いほど足音が敵に届かない
  const heard = (lvl) => { fresh(); place(4.5, 4.5, Math.PI); P.speedLevel = lvl; const e = G.Enemies.list[0]; e.update = e.constructor.prototype.update; resetE(e, 4.5, 9.0); e.state = 'patrol'; e.heardT = -999; e.waitT = 99; key('KeyW'); Gm.step(40); key('KeyW', 'keyup'); return e.heardT > -999; };
  const hFast = heard(5), hSlow = heard(1);
  ok('最も遅い速さの足音は近くの敵にも聞こえない（普通の速さは聞こえる）', hFast && !hSlow, hFast + ' / ' + hSlow);
  G.Game.wheelMode = 'weapon'; fresh(); place(3.5, 2.5, Math.PI); I.mouse.wheel = 1; Gm.step(40);
  ok('設定でホイールを武器の持ち替えに戻せる', P.cur === 'pistol', P.cur);
  G.Game.wheelMode = 'speed';
  // X/Z（十字キー上下と同じ操作）
  fresh(); place(3.5, 2.5, Math.PI); tap('KeyZ'); tap('KeyZ');
  ok('照準していないときは X/Z（十字キー上下）で歩く速さ', P.speedLevel === 3, P.speedLevel);

  // ---- 壁際：振り返りやリーンでカメラが跳ばない ----
  fresh(); place(7.69, 2.5, 0);
  tap('KeyE'); let maxJump = 0, prev = G.camera.position.clone();
  for (let i = 0; i < 64; i++) { P.yaw += 0.1; Gm.step(1); maxJump = Math.max(maxJump, G.camera.position.distanceTo(prev)); prev.copy(G.camera.position); }
  ok('壁際でリーンしたまま振り返ってもカメラが跳ばない（1フレーム6cm未満）', maxJump < 0.06, maxJump.toFixed(3));
  let inWall = false; for (let i = 0; i < 64; i++) { P.yaw += 0.1; Gm.step(1); const c = G.camera.position; if (G.World.overlapsSolid(c.x, c.z, 0.05, 2)) inWall = true; }
  ok('カメラが壁の中に入らない', !inWall);
  tap('KeyE');


  // ---- 装備：照準器とサプレッサー ----
  fresh(); place(3.5, 2.5, Math.PI);
  G.Game.loadout = { optic: 'dot', arSup: true, pistolSup: false }; G.Game.applyLoadout(); Gm.step(2);
  I.mouse.rmb = true; Gm.step(25);
  ok('ドットサイト：照準すると1.3倍で、スコープの黒い円は出ず赤い点が出る', Math.abs(G.camera.fov - P.currentFov()) < 0.01 && G.camera.fov > 50 && !document.getElementById('scope').classList.contains('on') && document.getElementById('reddot').classList.contains('on'), G.camera.fov.toFixed(1));
  ok('ドットサイトでは照準中も銃が見える', G.Viewmodel.root.visible);
  I.mouse.rmb = false; Gm.step(20);
  // サプレッサー付きは敵に聞こえる距離が短い
  const hearShot = (sup) => { fresh(); G.Game.loadout = { optic: 'scope', arSup: sup, pistolSup: false }; G.Game.applyLoadout(); place(3.5, 2.5, 0); P.pitch = 0.4; const e = G.Enemies.list[0]; e.update = e.constructor.prototype.update; resetE(e, 18.5, 2.5); e.heardT = -999; I.mouse.lmb = true; Gm.step(1); I.mouse.lmb = false; Gm.step(2); return e.heardT > -999; };
  const loud = hearShot(false), quiet = hearShot(true);
  ok('サプレッサーなしの銃声は15m先の敵に聞こえ、付けると聞こえない', loud && !quiet, loud + ' / ' + quiet);
  ok('サプレッサー付きの銃はその分長い（銃口が前に出る）', G.Viewmodel.weapons.ar.muzzle.position.z < -0.8);
  // ゲーム中の付け外し
  fresh(); G.Game.loadout = { optic: 'scope', arSup: false, pistolSup: false }; G.Game.applyLoadout(); place(3.5, 2.5, 0); P.pitch = 0.4;
  tap('KeyT'); const a1 = P.ammo; I.mouse.lmb = true; Gm.step(30); I.mouse.lmb = false;
  ok('Tで取り付け開始。取り付け中は撃てない', P.ammo === a1 && P.attachT > 0);
  Gm.step(80);
  ok('約1.5秒で取り付けが終わる', G.Viewmodel.att.ar.sup === true && P.attachT <= 0);
  tap('KeyT'); Gm.step(100);
  ok('もう一度Tで取り外し', G.Viewmodel.att.ar.sup === false);
  tap('Digit3'); Gm.step(40); tap('KeyT'); Gm.step(2);
  ok('ショットガンには付けられない', !(P.attachT > 0));
  G.Game.loadout = { optic: 'scope', arSup: false, pistolSup: false }; G.Game.applyLoadout();


  // ---- 木の壁：弾は威力を落として貫通する。見通しは遮る ----
  fresh();
  ok('倉庫施設の事務室の間の壁が木の壁になっている', G.World.cell(15, 2) === 'W' && G.World.cell(15, 5) === 'W');
  {
    const e = G.Enemies.list[0]; resetE(e, 17.5, 2.5); e.yaw = e.lookYaw = e.bodyYaw = -Math.PI / 2;
    place(13.5, 2.5, -Math.PI / 2); P.pitch = 0; Gm.step(2); aimAt(1.1, 17.5, 2.5);
    ok('木の壁の向こうは見えない', !G.World.lineOfSight(G.camera.position.x, G.camera.position.y, G.camera.position.z, 17.5, 1.2, 2.5));
    const h0 = e.hp; I.mouse.lmb = true; Gm.step(1); I.mouse.lmb = false; Gm.step(2);
    const dmg = h0 - e.hp;
    ok('ライフルの弾が木の壁を貫通して敵に当たる（威力は約65%）', dmg > 15 && dmg < 34, dmg.toFixed(1));
    ok('木の壁の表と裏に穴が開く', G.Effects.decals.length >= 2, G.Effects.decals.length);
  }
  fresh();
  {
    const e = G.Enemies.list[0]; resetE(e, 10.5, 2.5);
    place(5.5, 2.5, -Math.PI / 2); aimAt(1.1, 10.5, 2.5);   // x=8 はコンクリートの壁
    const h0 = e.hp; I.mouse.lmb = true; Gm.step(1); I.mouse.lmb = false; Gm.step(2);
    ok('コンクリートの壁は貫通しない', e.hp === h0);
  }
  fresh(); tap('Digit3'); Gm.step(40);
  {
    const e = G.Enemies.list[0]; resetE(e, 16.5, 2.5);
    place(14.2, 2.5, -Math.PI / 2); aimAt(1.1, 16.5, 2.5);
    const h0 = e.hp; I.mouse.lmb = true; Gm.step(1); I.mouse.lmb = false; Gm.step(2);
    ok('ショットガンの散弾は木の壁で大きく弱まる（近距離でも一撃では倒れない）', e.hp > 0 && e.hp < h0, (h0 - e.hp).toFixed(1));
  }
  fresh();
  {
    const e = G.Enemies.list[0]; resetE(e, 16.5, 3.5);
    const e2 = G.Enemies.list[1]; resetE(e2, 12.5, 4.5);
    G.Grenades.explode(new THREE.Vector3(14.3, 0.05, 3.5));
    ok('手りゅう弾の爆風は木の壁を抜けるが弱まる（同じ距離でも壁の向こうは被害が小さい）', 100 - e.hp > 0 && (e2.dead || e2.hp < e.hp), (100 - e.hp).toFixed(0) + ' / ' + (100 - Math.max(0, e2.hp)).toFixed(0));
  }
  // 敵は木の壁の陰を遮蔽物に選ばない
  fresh();
  {
    const e = G.Enemies.list[0]; e.pos.set(14.5, 0, 3.5);
    const c = e.findCover(new THREE.Vector3(18.5, 0, 3.5), 6);
    const behindWood = c && Math.floor(c.pos.x) === 14 && c.pos.z > 1 && c.pos.z < 7;
    ok('敵は木の壁の陰を遮蔽物に選ばない', !behindWood, c ? c.pos.x + ',' + c.pos.z : 'なし');
  }

  return R.join('\n');
})()

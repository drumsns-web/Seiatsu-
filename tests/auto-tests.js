(() => {
const R = []; const _hurt = G.Player.hurt;
const silentKill = (o) => { o.state = 'dead'; o.hp = 0; o.releaseCover(); o.body.root.visible = false; };
const ok = (name, cond, info) => R.push((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  [' + info + ']' : ''));
const P = G.Player, I = G.Input, Gm = G.Game;
const key = (code, type='keydown', repeat=false) => window.dispatchEvent(new KeyboardEvent(type, { code, repeat, bubbles: true }));
const tap = (code) => { key(code); Gm.step(1); key(code, 'keyup'); Gm.step(1); };
const place = (x, z, yaw) => { P.pos.set(x, 0, z); P.vel.set(0,0,0); if (yaw !== undefined) P.yaw = yaw; P.pitch = 0; P.recoil = 0; Gm.step(1); };
const freezeEnemies = () => { G.Enemies.list.forEach(e => { e._u = e.update; e.update = function(dt, p){ this.speed = 0; this.syncModel(dt); }; e.pos.set(45 + e.id * 0.8, 0, 37.5); }); };
const unfreeze = () => { G.Enemies.list.forEach(e => { if (e._u) { e.update = e._u; delete e._u; } }); };
const fresh = () => { Gm.reset(); Gm.state = 'playing'; I.enabled = true; };

// ---- 起動 ----
fresh();
ok('起動：状態 playing', Gm.state === 'playing');
ok('敵12体', G.Enemies.list.length === 12);

// ---- 移動と壁 ----
freezeEnemies();
place(3.5, 2.5, Math.PI);
key('KeyW'); Gm.step(60); key('KeyW', 'keyup'); Gm.step(10);
ok('Wで前進（+z方向）', P.pos.z > 4.5, P.pos.z.toFixed(2));
place(5.5, 2.5, -Math.PI / 2); // +x向き、x=8 は壁
key('KeyW'); Gm.step(120); key('KeyW', 'keyup'); Gm.step(5);
ok('壁を通り抜けない（壁の面は x=8.4）', P.pos.x <= 8.4 - 0.29, P.pos.x.toFixed(3));

// ---- リーン ----
place(3.5, 2.5, Math.PI);
tap('KeyQ'); ok('Q→左リーン', P.lean === -1);
key('KeyQ', 'keydown', true); key('KeyQ', 'keydown', true); Gm.step(1);
ok('長押し（repeat）で切替が連続しない', P.lean === -1);
tap('KeyQ'); ok('Q再押し→中央', P.lean === 0);
tap('KeyQ'); tap('KeyE'); ok('左リーン中にE→右へ直接', P.lean === 1);
Gm.step(40);
const camOff = Math.hypot(G.camera.position.x - P.pos.x, G.camera.position.z - P.pos.z);
ok('リーンで視点位置が横へずれる', camOff > 0.3, camOff.toFixed(2));
tap('KeyE'); Gm.step(30);
// 壁際でのリーン：壁に入り込まない（x=6.5 で右=+x側に壁 x=7）
place(7.55, 2.5, Math.PI); // 向き+z、左リーンが +x 側（壁 x=8）
tap('KeyQ'); Gm.step(40);
ok('壁際の左リーンでカメラが壁に入らない', G.camera.position.x < 8.4 - 0.1, G.camera.position.x.toFixed(3));
tap('KeyQ'); Gm.step(20);

// ---- 姿勢 ----
place(3.5, 2.5, Math.PI);
tap('ControlLeft'); Gm.step(30);
ok('左Ctrlで匍匐', P.posture === 'prone' && Math.abs(P.eyeH - 0.34) < 0.05, P.eyeH.toFixed(2));
tap('ControlLeft'); Gm.step(30);
ok('左Ctrl再押しで立ち', P.posture === 'stand');
tap('KeyC'); Gm.step(30); ok('Cでしゃがみ', P.posture === 'crouch');
tap('KeyC'); ok('C再押しで立ち', P.posture === 'stand');
// 頭上ダクト（h: x=26..27, z=8..9）の下で立てない
place(24.5, 8.5, -Math.PI / 2);
tap('KeyC'); key('KeyD'); Gm.step(1); key('KeyD','keyup');
P.pos.set(26.5, 0, 8.5); Gm.step(2);
tap('KeyC');
ok('頭上に障害物があると立てない', P.posture === 'crouch');
// 立ったままダクトへ入れない
place(24.5, 8.5, -Math.PI / 2); tap('KeyC'); Gm.step(20);
ok('しゃがみ解除', P.posture === 'stand');
key('KeyW'); Gm.step(90); key('KeyW', 'keyup'); Gm.step(3);
ok('立ったままでは頭上ダクトに入れない', P.pos.x <= 26 - 0.29, P.pos.x.toFixed(2));
// 匍匐でのみ通れる隙間（v: x=25..27, z=31）
place(26.5, 30.5, Math.PI); tap('KeyC');
key('KeyW'); Gm.step(90); key('KeyW', 'keyup');
ok('しゃがみでは壁下の隙間を通れない', P.pos.z < 31, P.pos.z.toFixed(2));
tap('ControlLeft'); key('KeyW'); Gm.step(300); key('KeyW', 'keyup');
ok('匍匐で壁下の隙間を通れる', P.pos.z > 32.1, P.pos.z.toFixed(2));
tap('ControlLeft');
ok('隙間の先で立つ', P.posture === 'stand');

// ---- ダッシュ ----
place(3.5, 2.5, Math.PI);
tap('KeyQ'); I.mouse.rmb = true; Gm.step(20);
key('KeyW'); key('ShiftLeft'); Gm.step(5);
ok('Shift長押し＋前進でダッシュ', P.sprinting);
ok('ダッシュ開始でリーン解除', P.lean === 0);
ok('ダッシュ中は照準不可', !P.ads);
key('ShiftLeft', 'keyup'); Gm.step(2);
ok('Shiftを離すとダッシュ終了', !P.sprinting);
key('KeyW', 'keyup'); I.mouse.rmb = false;
tap('KeyC'); key('KeyW'); key('ShiftLeft'); Gm.step(5);
ok('しゃがみ中のShiftで自動で立たない', P.posture === 'crouch' && !P.sprinting);
key('ShiftLeft', 'keyup'); key('KeyW', 'keyup'); tap('KeyC');

// ---- 照準とズーム ----
place(3.5, 2.5, Math.PI); I.mouse.rmb = true; Gm.step(20);
const fov1 = G.camera.fov; I.mouse.wheel = -2; Gm.step(2); const z1 = P.zoom;
I.mouse.wheel = 10; Gm.step(2); const z2 = P.zoom;
I.mouse.wheel = -20; Gm.step(2); const z3 = P.zoom;
ok('ホイールで倍率変更（0.5刻み・2〜8倍）', z1 === 5 && z2 === 2 && z3 === 8, [z1, z2, z3].join(','));
Gm.step(5);
ok('倍率が実際の視野角に反映', G.camera.fov < fov1, G.camera.fov.toFixed(2) + ' < ' + fov1.toFixed(2));
ok('スコープ中は銃モデルを隠す', !G.Viewmodel.root.visible);
I.mouse.rmb = false; Gm.step(20);
ok('右クリックを離すと照準解除', !P.ads && G.Viewmodel.root.visible);

// ---- 射撃と命中 ----
const e0 = G.Enemies.list[0];
const resetE = (e, x, z) => { e.pos.set(x, 0, z); e.hp = 100; e.state = 'patrol'; e.crouch = 0; e.wantCrouch = false; e.body.st.crouch = 0; e.speed = 0; e.body.st.speed = 0; for (let i = 0; i < 30; i++) e.syncModel(1/60); };
place(3.5, 2.5, Math.PI); // +z 向き
resetE(e0, 3.5, 6.5); // 5,6行目は通路で見通せる
P.zoom = 4; I.mouse.rmb = true; Gm.step(20);
// 胴体を狙う
const aimAt = (y, x, z) => { const c = G.camera.position; const dx = x - c.x, dz = z - c.z, dy = y - c.y; P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz)); P.recoil = 0; Gm.step(1); };
aimAt(1.1, e0.pos.x, e0.pos.z);
const hp0 = e0.hp, ammo0 = P.ammo;
I.mouse.lmb = true; Gm.step(1); I.mouse.lmb = false; Gm.step(1);
ok('スコープ中央で胴体に命中', e0.hp < hp0, hp0 + '→' + e0.hp);
ok('弾数が減る', P.ammo === ammo0 - 1);
Gm.step(10); resetE(e0, 3.5, 6.5); aimAt(e0.body.headWorld.y, e0.body.headWorld.x, e0.body.headWorld.z);
I.mouse.lmb = true; Gm.step(1); I.mouse.lmb = false; Gm.step(1);
ok('頭部命中で一撃', e0.dead);
// 連射の発射間隔（650発/分 → 1秒で約11発）
fresh(); freezeEnemies(); place(3.5, 2.5, 0); P.pitch = 0.3;
I.mouse.lmb = true; const a0 = P.ammo; for (let i = 0; i < 60; i++) Gm.step(1); I.mouse.lmb = false; Gm.step(1);
ok('フルオート：1秒で10〜12発', a0 - P.ammo >= 10 && a0 - P.ammo <= 12, a0 - P.ammo);
// 反動：連射すると照準が上がる（自動で完全には戻らない）
fresh(); freezeEnemies(); place(3.5, 2.5, Math.PI); const pit0 = P.pitch;
I.mouse.lmb = true; Gm.step(30); I.mouse.lmb = false; Gm.step(120);
ok('連射で照準が上がり、離しても一部が残る', P.pitch - pit0 > 0.03, (P.pitch - pit0).toFixed(3));
// 壁越しに当たらない
fresh(); freezeEnemies();
const e1 = G.Enemies.list[1];
place(3.5, 2.5, Math.PI); resetE(e1, 10.5, 2.5); // x=8 の壁の向こう
I.mouse.rmb = true; Gm.step(20); aimAt(1.1, 10.5, 2.5);
I.mouse.lmb = true; Gm.step(20); I.mouse.lmb = false; I.mouse.rmb = false; Gm.step(1);
ok('壁越しの敵に弾が当たらない', e1.hp === 100, e1.hp);
ok('着弾跡ができる', G.Effects.decals.length > 0, G.Effects.decals.length);
// 着弾跡の上限
P.ammo = 999; I.mouse.lmb = true; Gm.step(60 * 18); I.mouse.lmb = false; Gm.step(1);
ok('着弾跡は上限80で古いものを再利用', G.Effects.decals.length <= 80, G.Effects.decals.length);
P.ammo = 30;

// ---- リロード ----
fresh(); freezeEnemies(); place(3.5, 2.5, 0); P.pitch = 0.3;
P.ammo = 10; tap('KeyR');
ok('Rでリロード開始', P.reloading);
const aR = P.ammo; I.mouse.lmb = true; Gm.step(30); I.mouse.lmb = false;
ok('リロード中は射撃不可', P.ammo === aR);
I.mouse.rmb = true; Gm.step(2); ok('リロード中は照準不可', !P.ads); I.mouse.rmb = false;
Gm.step(Math.ceil(2.3 * 60));
ok('完了時に装弾数30', P.ammo === 30 && !P.reloading, P.ammo + ' / 予備' + P.reserve);
ok('予備弾が減る', P.reserve === G.WEAPON.reserve - 20, P.reserve);
P.ammo = 0; tap('KeyR'); const dur = G.Viewmodel.state.reload.dur;
ok('空からのリロードは操作部を引く長い動作', dur > 2.5, dur);
Gm.step(60);
// 一時停止で止まる
Gm.state = 'paused'; const tBefore = G.Viewmodel.state.reload.t; Gm.step(100); Gm.state = 'playing';
ok('一時停止中はリロードが進まない', G.Viewmodel.state.reload.t === tBefore);
// ナイフで中断
tap('KeyV');
ok('ナイフでリロード中断（弾数は変わらない）', !P.reloading && P.ammo === 0 && G.Viewmodel.mag.visible);
Gm.step(60);
tap('KeyR'); Gm.step(Math.ceil(2.8 * 60));
ok('中断後に再リロードできる', P.ammo === 30);

// ---- ナイフ ----
fresh(); freezeEnemies();
const k = G.Enemies.list[2];
place(3.5, 2.5, Math.PI); resetE(k, 3.5, 3.6);
tap('KeyV'); key('KeyV', 'keydown', true); Gm.step(30);
ok('正面の近距離の敵をナイフで倒せる', k.dead);
const cd = P.knifeCD; tap('KeyV'); ok('攻撃後は短い待ち時間がある', P.knifeT < 0 || P.knifeT === 0 && cd > 0);
Gm.step(60);
const k2 = G.Enemies.list[3];
place(7.6, 2.5, -Math.PI / 2); resetE(k2, 9.2, 2.5); // 壁 x=8 の向こう
tap('KeyV'); Gm.step(30);
ok('壁越しにはナイフが当たらない', !k2.dead && k2.hp === 100);
place(3.5, 2.5, Math.PI); resetE(k2, 3.5, 3.5); P.yaw = 0; Gm.step(1); // 背後
tap('KeyV'); Gm.step(30);
ok('背後の敵には当たらない', !k2.dead);

// ---- AI：見えていない敵は位置を知らない ----
fresh();
const a = G.Enemies.list;
place(3.5, 1.5, Math.PI);
G.Game.step(60 * 3);
ok('壁の向こうの敵は最後に見た位置を持たない', a.every(e => e.lastSeenPos === null), a.map(e => e.state).join(','));
// 足音（しゃがみ）は遠くに届かない
const before = a.map(e => e.heardT);
tap('KeyC'); key('KeyW'); Gm.step(60); key('KeyW', 'keyup'); tap('KeyC');
ok('しゃがみ歩きの足音は遠くの敵に聞こえない', a.every((e, i) => e.heardT === before[i]));
// 銃声で調査へ
place(3.5, 2.5, 0); P.pitch = 0.4; P.yaw = 0;
I.mouse.lmb = true; Gm.step(1); I.mouse.lmb = false; Gm.step(1);
const heard = a.filter(e => e.heardPos);
ok('銃声を聞いた敵が音の位置を記憶', heard.length > 0, heard.length + '体');
ok('聞いた位置＝発砲位置（現在位置とは別に保持）', heard.every(e => Math.abs(e.heardPos.x - 3.5) < 0.01 && Math.abs(e.heardPos.z - 2.5) < 0.01));
ok('聞いた敵は調査に向かう', heard.some(e => e.state === 'investigate'), heard.map(e => e.state).join(','));
// プレイヤーは別の場所へ移動 → 敵は現在位置ではなく音の位置へ
P.pos.set(26.5, 0, 35.5); P.posture = 'prone'; P.eyeH = 0.34;
let maxGoalErr = 0, minToPlayer = 99;
for (let i = 0; i < 60 * 6; i++) { Gm.step(1); for (const e of heard) if (e.state === 'investigate' && e.goal) { maxGoalErr = Math.max(maxGoalErr, Math.hypot(e.goal.x - 3.5, e.goal.z - 2.5)); minToPlayer = Math.min(minToPlayer, e.goal.distanceTo(P.pos)); } }
ok('調査の目的地は聞いた位置の周辺（味方同士で少し散らばる）', maxGoalErr < 4.0, maxGoalErr.toFixed(2));
ok('調査の目的地はプレイヤーの現在位置ではない', minToPlayer > 20, minToPlayer.toFixed(1));

// ---- AIの長時間シミュレーション（プレイヤーは無敵で中央付近に立つ） ----
fresh();
P.hurt = function(){};
place(27.5, 19.5, 0);
let nan = false, inWall = 0, overlapMax = 0, states = new Set();
for (let i = 0; i < 60 * 90; i++) {
  if (i % 600 === 0) { P.yaw += 1.2; }
  Gm.step(1);
  for (const e of G.Enemies.list) {
    states.add(e.state);
    if (!isFinite(e.pos.x) || !isFinite(e.pos.z)) nan = true;
    if (!e.dead && G.World.overlapsSolid(e.pos.x, e.pos.z, 0.25, 1.8)) inWall++;
  }
  if (i % 30 === 0) {
    const L = G.Enemies.list.filter(e => !e.dead);
    for (let x = 0; x < L.length; x++) for (let y = x + 1; y < L.length; y++) { const d = L[x].pos.distanceTo(L[y].pos); if (d < 0.35) overlapMax++; }
  }
}
ok('90秒間：座標が壊れない', !nan);
ok('90秒間：敵が壁に埋まらない', inWall === 0, inWall);
ok('90秒間：敵同士が重なり続けない', overlapMax < 10, overlapMax);
ok('敵が交戦状態になる', states.has('combat'), [...states].join(','));
ok('プレイヤーに向けて発砲（弾薬が減る／装填）', G.Enemies.list.some(e => e.ammo < e.magSize || e.reloadT > 0 || e.shotsAtTarget > 0));
const usedCoverOrFlank = states.has('cover') || states.has('flank');
ok('退避または迂回を選択する', usedCoverOrFlank, [...states].join(','));
P.hurt = _hurt;

// ---- 退避位置が遮蔽物として機能するか ----
fresh();
const ce = G.Enemies.list[1];
let coverOK = 0, coverTotal = 0;
for (const [tx, tz] of [[27.5, 19.5], [20.5, 24.5], [50.5, 18.5], [38.5, 34.5]]) {
  ce.pos.set(tx + 3, 0, tz); ce.reserved = null;
  const c = ce.findCover(new THREE.Vector3(tx, 0, tz), 13);
  if (c) { coverTotal++; if (!G.World.lineOfSight(c.pos.x, 1.12, c.pos.z, tx, 1.7, tz)) coverOK++; }
}
ok('選ばれた退避位置は脅威から見えない', coverTotal > 0 && coverOK === coverTotal, coverOK + '/' + coverTotal);

// ---- シナリオ：撃たれて弱った敵は遮蔽物へ退避する ----
fresh();
{
  const e = G.Enemies.list[0]; G.Enemies.list.forEach((o, i) => { if (i !== 0) silentKill(o); });
  place(24.5, 18.5, -Math.PI / 2); // 倉庫の中
  e.pos.set(33.5, 0, 18.5);
  P.hurt = function(){};
  let sawCover = false, coverHidden = null, sawPeek = false, hideInfo = '';
  for (let i = 0; i < 60 * 3; i++) { Gm.step(1); }
  e.damage(60, 'body', P.pos.clone().setY(1.4)); // 体力40
  for (let i = 0; i < 60 * 10; i++) {
    Gm.step(1);
    if (e.state === 'cover') sawCover = true;
    if (e.state === 'cover' && e.cover && e.cover.phase === 'hide' && e.cover.t > 1.0 && coverHidden === null) { coverHidden = !G.World.lineOfSight(e.pos.x, e.eyeY(), e.pos.z, P.pos.x, P.camPos().y, P.pos.z); hideInfo = e.eyeY().toFixed(2) + ' ' + e.pos.x.toFixed(1) + ',' + e.pos.z.toFixed(1) + ' cover ' + e.cover.pos.x + ',' + e.cover.pos.z; }
    if (e.state === 'cover' && e.cover && e.cover.phase === 'peek') sawPeek = true;
  }
  ok('シナリオ：体力が減った敵が退避を選ぶ', sawCover, e.state);
  ok('シナリオ：到着した退避位置は（しゃがむと）プレイヤーから見えない', coverHidden === true, String(coverHidden) + ' ' + hideInfo);
  ok('シナリオ：遮蔽物から顔を出して撃ち返す', sawPeek);
  P.hurt = _hurt;
}
// ---- シナリオ：見失った迂回役は別の角度から回り込む ----
fresh();
{
  const e = G.Enemies.list[5]; // 迂回役
  G.Enemies.list.forEach((o, i) => { if (i !== 5) silentKill(o); });
  e.pos.set(33.5, 0, 12.5); e.state = 'patrol'; e.yaw = e.lookYaw = e.bodyYaw = -Math.PI / 2;
  place(27.5, 12.5, -Math.PI / 2);
  P.hurt = function(){};
  for (let i = 0; i < 60 * 3 && e.state !== 'combat'; i++) Gm.step(1);
  const seenAt = e.lastSeenPos && e.lastSeenPos.clone();
  P.pos.set(22.5, 0, 8.5); // 北の廊下へ隠れる（倉庫からは見えない位置）
  let flank = false, flankGoal = null;
  for (let i = 0; i < 60 * 8; i++) { Gm.step(1); if (e.state === 'flank') { flank = true; if (!flankGoal && e.goal) flankGoal = e.goal.clone(); } }
  ok('シナリオ：迂回役が交戦後に見失うと迂回を選ぶ', flank, e.role + ' ' + e.state);
  if (flankGoal && seenAt) {
    const a1 = Math.atan2(33.5 - seenAt.x, 12.5 - seenAt.z), a2 = Math.atan2(flankGoal.x - seenAt.x, flankGoal.z - seenAt.z);
    let d = Math.abs(a1 - a2); if (d > Math.PI) d = Math.PI * 2 - d;
    ok('シナリオ：迂回点は元の方向と異なる角度', d > 1.0, d.toFixed(2));
  }
  P.hurt = _hurt;
}
// ---- 無線：見た敵が近くの味方へ位置を伝える（伝わるのは見た位置で、受け手は直接見ていない） ----
fresh();
{
  const L = G.Enemies.list;
  const seer = L[3], ally = L[4];   // 倉庫の2人
  L.forEach((o, i) => { if (i !== 3 && i !== 4) silentKill(o); });
  P.hurt = function(){};
  place(21.5, 20.5, 0); // seer(21,15) から見える倉庫内
  seer.pos.set(21.5, 0, 14.5); seer.yaw = seer.lookYaw = 0;
  ally.pos.set(36.5, 0, 25.5);
  let gotReport = false, allyMoved = false;
  const a0 = ally.pos.clone();
  for (let i = 0; i < 60 * 5; i++) { Gm.step(1); if (ally.reportPos) gotReport = true; }
  allyMoved = ally.pos.distanceTo(a0) > 1.0 || ally.state !== 'guard' || !!ally.lookTarget;
  ok('無線：味方が見た位置を受け取る', gotReport && seer.lastSeenPos !== null, ally.state);
  ok('無線：受け手は自分では見ていない位置情報を区別して持つ', !!ally.reportPos);
  ok('無線を受けた味方が行動を変える', allyMoved, ally.state);
  P.hurt = _hurt;
}
// ---- 装填音を聞いた敵は詰めてくる ----
fresh();
{
  const e = G.Enemies.list[0];
  e.state = 'combat'; e.lastSeenPos = new THREE.Vector3(10, 0, 10); e.lastSeenT = G.time - 3; e.visible = false; e.role = 'rifleman';
  e.hear(new THREE.Vector3(e.pos.x + 3, 1, e.pos.z), 9, 'reload', true);
  ok('装填音を聞くと距離を詰める', e.state === 'chase' && e.pushT > 0, e.state);
}
// ---- 同時に詰めてくる人数には上限がある ----
fresh();
{
  const L = G.Enemies.list; P.hurt = function(){};
  for (const e of L) e.receiveReport(new THREE.Vector3(27.5, 0, 19.5), new THREE.Vector3());
  Gm.step(2);
  ok('全員が一斉に突っ込まない（同時に詰めるのは最大3人）', G.Enemies.pushers() <= 3, G.Enemies.pushers() + '人');
  ok('残りは待ち伏せや持ち場の警戒に回る', L.some(e => e.state === 'hold' || e.state === 'guard'));
  P.hurt = _hurt;
}
// ---- 流血表現 ----
fresh(); freezeEnemies();
{
  const e = G.Enemies.list[0]; resetE(e, 3.5, 6.5); place(3.5, 2.5, Math.PI);
  I.mouse.rmb = true; Gm.step(20); aimAt(1.1, e.pos.x, e.pos.z);
  G.Game.gore = 'on'; const b0 = G.Effects.blood.length;
  I.mouse.lmb = true; Gm.step(1); I.mouse.lmb = false; Gm.step(1);
  ok('命中すると血痕ができる（オン）', G.Effects.blood.length > b0, G.Effects.blood.length);
  G.Game.gore = 'off'; const b1 = G.Effects.blood.length; Gm.step(10); resetE(e, 3.5, 6.5); aimAt(1.1, e.pos.x, e.pos.z);
  I.mouse.lmb = true; Gm.step(1); I.mouse.lmb = false; Gm.step(1);
  ok('オフでは血痕ができない', G.Effects.blood.length === b1);
  G.Game.gore = 'on'; e.die(true); Gm.step(150);
  ok('倒れた敵の下に血だまりが広がる', G.Effects.pools.length > 0 && G.Effects.pools[G.Effects.pools.length - 1].m.scale.x > 0.05);
  I.mouse.rmb = false;
}
// ---- 当たり判定がアニメーション後の体に一致する ----
fresh(); freezeEnemies();
{
  const e = G.Enemies.list[0]; resetE(e, 3.5, 6.5);
  const hStand = e.body.headWorld.y;
  e.wantCrouch = true; e.crouch = 1; for (let i = 0; i < 60; i++) e.syncModel(1/60);
  const hCrouch = e.body.headWorld.y;
  ok('しゃがむと頭の当たり判定も下がる', hCrouch < hStand - 0.35, hStand.toFixed(2) + '→' + hCrouch.toFixed(2));
  ok('しゃがんだ頭は木箱(1.25m)より低い', hCrouch < 1.25, hCrouch.toFixed(2));
}
// ---- 倒れた敵：脚が止まり、床にめり込まない ----
fresh(); freezeEnemies();
{
  const L = G.Enemies.list;
  const spots = [[3.5, 4.5], [10.5, 2.5], [7.3, 5.6], [20.5, 13.5]]; // 開けた所・壁際など
  let maxBelow = 0, allSettled = true, phaseMoved = false;
  spots.forEach(([x, z], i) => { const e = L[i]; e.pos.set(x, 0, z); e.speed = 1.5; e.syncModel(1/60); e.die(i % 2 ? 1 : -1, i % 3 - 1, 'body'); });
  const ph0 = L.slice(0, 4).map(e => e.body.st.phase);
  for (let i = 0; i < 175; i++) Gm.step(1);
  const ph1 = L.slice(0, 4).map(e => e.body.st.phase);
  for (let i = 0; i < 4; i++) {
    const b = L[i].body; if (!b.st.settled) allSettled = false;
    for (const n of ['head', 'chest', 'spine', 'hips', 'hdL', 'hdR', 'ftL', 'ftR', 'snL', 'snR']) { const v = new THREE.Vector3(); b.bones[n].getWorldPosition(v); maxBelow = Math.max(maxBelow, -v.y); }
  }
  Gm.step(120);
  const ph2 = L.slice(0, 4).map(e => e.body.st.phase);
  ok('倒れた後は脚の動きが止まる', ph2.every((p, i) => Math.abs(p - ph1[i]) < 1e-6) && allSettled);
  ok('倒れた体の骨が床より下に入らない', maxBelow < 0.02, maxBelow.toFixed(3));
  // 壁際で倒れた敵（7.3, 5.6：東の壁 x=8 の手前）は壁の方へ倒れない
  const e2 = L[2]; const hd = new THREE.Vector3(); e2.body.bones.head.getWorldPosition(hd);
  ok('壁際では壁のない方向へ倒れる（頭が壁の中に入らない）', G.World.walkable(Math.floor(hd.x), Math.floor(hd.z)), hd.x.toFixed(2) + ',' + hd.z.toFixed(2));
}
// ---- 部位による傷の影響 ----
fresh(); freezeEnemies();
{
  const L = G.Enemies.list;
  const a = L[0], b = L[1], c = L[2];
  a.damage(20, 'arms', new THREE.Vector3(0, 1, 0), 1);
  b.damage(24, 'legs', new THREE.Vector3(0, 1, 0), -1);
  c.damage(30, 'stomach', new THREE.Vector3(0, 1, 0), 0); c.damage(40, 'body', new THREE.Vector3(0, 1, 0), 0);
  ok('腕の被弾では移動速度が落ちない', a.mobility() === 1);
  ok('脚の被弾で大きく遅くなる（足を引きずる）', b.mobility() <= 0.5 && b.limpSide === -1);
  ok('腹の被弾＋瀕死でさらに遅く、前かがみになる', c.mobility() < 0.6 && c.critical);
  for (const e of [b, c]) { e.speed = 1.2; for (let i = 0; i < 60; i++) e.syncModel(1/60); }
  ok('足を引きずる動き・前かがみが体に反映される', b.body.st.limp > 0.5 && c.body.st.hunch > 0.6, b.body.st.limp.toFixed(2) + ' / ' + c.body.st.hunch.toFixed(2));
}
// ---- リーンと伏せで頭（目と当たり判定）の位置が変わる ----
fresh(); freezeEnemies();
{
  const e = G.Enemies.list[0]; resetE(e, 20.5, 13.5); e.yaw = e.lookYaw = e.bodyYaw = 0;
  for (let i = 0; i < 40; i++) e.syncModel(1/60);
  const h0 = e.body.headWorld.clone();
  e.lean = 1; for (let i = 0; i < 60; i++) e.syncModel(1/60);
  const h1 = e.body.headWorld.clone();
  ok('リーンで頭が横へ出る', Math.hypot(h1.x - h0.x, h1.z - h0.z) > 0.2, Math.hypot(h1.x - h0.x, h1.z - h0.z).toFixed(2) + 'm');
  e.lean = 0; e.prone = true; for (let i = 0; i < 120; i++) e.syncModel(1/60);
  ok('伏せると頭が低くなる', e.body.headWorld.y < 0.6, e.body.headWorld.y.toFixed(2));
  let below = 0; for (const n of ['head', 'chest', 'hips', 'ftL', 'ftR']) { const v = new THREE.Vector3(); e.body.bones[n].getWorldPosition(v); below = Math.max(below, -v.y); }
  ok('伏せた体も床にめり込まない', below < 0.02, below.toFixed(3));
}
// ---- 部位別の当たり判定 ----
fresh(); freezeEnemies();
{
  const e = G.Enemies.list[0]; resetE(e, 3.5, 6.5); e.yaw = e.lookYaw = e.bodyYaw = Math.PI;
  for (let i = 0; i < 40; i++) e.syncModel(1/60);
  const o = new THREE.Vector3(3.5, 1.0, 2.0);
  const shoot = (bone) => { const v = new THREE.Vector3(); e.body.bones[bone].getWorldPosition(v); const d = v.clone().sub(o).normalize(); const h = e.rayHit(o, d, 50); return h ? h.part : 'miss'; };
  const parts = { head: (() => { const d = e.body.headWorld.clone().sub(o).normalize(); const h = e.rayHit(o, d, 50); return h && h.part; })(), thigh: shoot('snL'), spine: shoot('spine') };
  ok('頭・脚・腹を撃ち分けられる', parts.head === 'head' && parts.thigh === 'legs' && (parts.spine === 'stomach' || parts.spine === 'body'), JSON.stringify(parts));
}
// ---- うめき声（音を鳴らす処理がエラーにならない） ----
{
  let err = null;
  try { G.Audio.init(); for (const t of ['hurt', 'pain', 'death', 'moan']) G.Audio.voice(new THREE.Vector3(5, 1.5, 5), t, 1); } catch (e) { err = e.message; }
  ok('うめき声4種類を鳴らせる', !err, err || '');
}
// ---- 経路探索 ----
const p1 = G.Path.find(1.5, 20.5, 53.5, 2.5);
ok('A*：遠い部屋まで経路が見つかる', !!p1 && p1.length > 10, p1 && p1.length);
const p2 = G.Path.find(1.5, 20.5, 26.5, 35.5); // 匍匐でしか入れない部屋
ok('到達できない目的地では近くの到達可能点か null を返す', p2 === null || G.World.walkable(Math.floor(p2[p2.length-1].x), Math.floor(p2[p2.length-1].z)), p2 ? p2.length : 'null');

// ---- ゲームオーバーと再挑戦 ----
fresh(); P.hurt(500, P.pos.clone().setX(5));
ok('体力0で第三者視点の演出が始まる', !!Gm.deathCam && P.dead && Gm.state === 'playing');
const camBefore = G.camera.position.clone();
Gm.step(60);
ok('カメラが後ろへ引いて自分の体を映す', G.camera.position.distanceTo(camBefore) > 0.8 && Gm.deathCam.body.st.dead, G.camera.position.distanceTo(camBefore).toFixed(2));
Gm.step(200);
ok('演出の後にゲームオーバー', Gm.state === 'ended');
const enemySnap = G.Enemies.list.map(e => e.pos.clone());
Gm.step(120);
ok('ゲームオーバー後はAIが動かない', G.Enemies.list.every((e, i) => e.pos.equals(enemySnap[i])));
Gm.reset(); Gm.state = 'playing';
ok('再挑戦で初期化（敵12・体力100・弾30/240）', G.Enemies.alive() === 12 && P.hp === 100 && P.ammo === 30 && P.reserve === G.WEAPON.reserve && !P.reloading && P.posture === 'stand');

// ---- クリア ----
fresh(); G.Enemies.list.forEach(e => e.die());
place(5.5, 3.5, 0); Gm.step(5);
ok('倒した敵が弾薬を落とす', G.Pickups.list.filter(p => p.type === 'ammo').length === 12);
ok('全滅しただけではクリアにならない', Gm.state === 'playing');
place(1.5, 1.5, 0); Gm.step(2);
ok('脱出地点に戻るとクリア', Gm.state === 'ended' && $('end-title').textContent === '任務完了');

// ---- フレームレート差 ----
const runMove = (fps) => { fresh(); freezeEnemies(); place(3.5, 2.5, Math.PI); key('KeyW'); for (let i = 0; i < fps * 1; i++) Gm.step(1, 1 / fps); key('KeyW', 'keyup'); return P.pos.z; };
const z30 = runMove(30), z144 = runMove(144);
ok('30fpsと144fpsで移動距離がほぼ同じ', Math.abs(z30 - z144) < 0.15, z30.toFixed(2) + ' / ' + z144.toFixed(2));
const fireCount = (fps) => { fresh(); freezeEnemies(); place(3.5, 2.5, 0); P.pitch = 0.4; I.mouse.lmb = true; const a0 = P.ammo; for (let i = 0; i < fps; i++) Gm.step(1, 1 / fps); I.mouse.lmb = false; return a0 - P.ammo; };
const f30 = fireCount(30), f144 = fireCount(144);
ok('30fpsと144fpsで連射数がほぼ同じ', Math.abs(f30 - f144) <= 1, f30 + ' / ' + f144);

// ---- 入力：フォーカス喪失 ----
fresh(); key('KeyW'); window.dispatchEvent(new Event('blur'));
ok('フォーカスを失うとキー押しっぱなしを解除', !I.isDown('forward'));

// ---- キー設定（交換方式と保存） ----
I.rebinding = 'crouch'; key('KeyQ');
ok('重複キーは交換（しゃがみ=Q、左リーン=C）', I.binds.crouch === 'KeyQ' && I.binds.leanL === 'KeyC');
const saved = JSON.parse(localStorage.getItem('cq_keybinds_v1') || '{}');
ok('キー設定をブラウザーに保存', saved.crouch === 'KeyQ');
I.rebinding = 'reload'; key('Escape');
ok('Escは割り当て不可（キャンセル扱い）', I.binds.reload === 'KeyR');
I.rebinding = 'sprint'; key('ShiftRight');
ok('左右Shiftを区別', I.binds.sprint === 'ShiftRight');
I.resetBinds();
ok('初期設定へ戻す', I.binds.crouch === 'KeyC' && I.binds.sprint === 'ShiftLeft');

return R.join('\n');
})()

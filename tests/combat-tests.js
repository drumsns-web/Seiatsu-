// 今回の追加機能のテスト：倒れ方・欠損・脚を負傷した敵・敵の武器・出血と処置・自分の欠損・手りゅう弾の破壊・AIの仲間
(async () => {
  const R = [], ok = (n, c, v) => R.push((c ? 'PASS ' : 'FAIL ') + n + (v !== undefined ? ' [' + v + ']' : ''));
  const M = G.Game, F = G.Physics, P = G.Player, Wd = G.World, A = G.Allies;
  const key = (c, t = 'keydown') => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true }));
  const tap = (c) => { key(c); M.step(1); key(c, 'keyup'); M.step(1); };
  const fresh = (allies) => {
    M.allyCount = allies || 0; M.dismember = true; M.reset(); M.state = 'playing'; G.Input.enabled = true;
    G.Enemies.list.forEach((e, i) => { e.pos.set(40 + i, 0, 30); e.update = function (dt) { this.syncModel(dt); }; e.syncModel(1 / 60); });
  };
  const live = (e) => { e.update = e.constructor.prototype.update; };
  const realHurt = P.hurt;

  // ---- 倒れ方：力が抜けてどさっと倒れ、床で止まる ----
  fresh();
  {
    const e = G.Enemies.list[0]; live(e); e.pos.set(26.5, 0, 16.5); e.syncModel(1 / 60);
    e.damage(200, 'body', new THREE.Vector3(26.5, 1.4, 12), 0);
    let landT = -1, t = 0;
    while (!e.body.st.settled && t < 6) { M.step(1); t += 1 / 60; if (landT < 0 && e.body.ragdoll && e.body.ragdoll.landT >= 0) landT = t; }
    ok('撃たれると1.5秒以内に床へ倒れる', landT > 0 && landT < 1.5, landT.toFixed(2) + '秒');
    ok('倒れてから2秒以内に完全に止まる', e.body.st.settled && t < landT + 2, t.toFixed(2) + '秒');
    ok('筋肉で支える時間は一瞬だけ（すぐ脱力）', e.body.ragdoll.duration <= 0.25, e.body.ragdoll.duration);
  }

  // ---- 欠損：腕は重く落ち、頭は顔の上部が破裂して赤い塊が落ちる ----
  for (const [part, fore, key, left] of [['arms', true, 'foreL', 14], ['arms', false, 'armL', 13], ['head', false, 'head', 16]]) {
    fresh();
    const e = G.Enemies.list[1]; live(e); e.pos.set(26.5, 0, 16.5); e.syncModel(1 / 60);
    const before = new THREE.Vector3(); e.body.bones[part === 'head' ? 'head' : fore ? 'faL' : 'uaL'].getWorldPosition(before);
    e.hp = 0; e.die(1, 0, part); e.body.st.sever = { part, side: 1, fore, dir: new THREE.Vector3(0, 0.05, 1) };
    M.step(1);
    const pc = F.pieces[F.pieces.length - 1];
    let maxY = 0; for (let i = 0; i < 180; i++) { M.step(1); maxY = Math.max(maxY, pc.body.position.y); }
    ok(key + (part === 'head' ? '：顔の上部だけが欠ける' : '：その部位だけが外れる'), pc && pc.key === key && e.body.ragdoll.parts.size === left && (part !== 'head' || (!!e.body.headWound && !e.body.severMesh)), (pc && pc.key) + ' / 残り ' + e.body.ragdoll.parts.size);
    ok(key + '：空中に舞い上がらない（外れた高さ＋20cm以内）', maxY < before.y + 0.2, maxY.toFixed(2) + ' / ' + before.y.toFixed(2));
    ok(key + '：床に落ちて止まる', pc.frozen && pc.body.position.y < 0.35, pc.body.position.y.toFixed(2));
  }
  ok('肘から先の命中判定（前腕寄りなら肘から先）', (() => { fresh(); const h = G.Enemies.list[2].body; const p = new THREE.Vector3(); h.bones.hdL.getWorldPosition(p); const q = new THREE.Vector3(); h.bones.uaL.getWorldPosition(q); return G.Humanoid.isForearmHit(h, p, 1) && !G.Humanoid.isForearmHit(h, q, 1); })());

  // ---- 脚を失った敵：這って、見えれば撃ち、失血死する ----
  fresh();
  {
    P.hurt = () => { }; const e = G.Enemies.list[0]; live(e); e.pos.set(12.5, 0, 6.5); e.syncModel(1 / 60);
    P.pos.set(12.5, 0, 2.5); P.yaw = Math.PI; P.camInit = false; P.update(.001, [], { dx: 0, dy: 0, wheel: 0 });
    e.damage(30, 'legs', P.pos.clone(), 1);
    ok('生きたまま脚を失う', e.loseLeg(1, new THREE.Vector3(0, 0, 1)) && !e.dead && e.downed && e.prone);
    {
      // 失った脚（左）の太ももがあった位置を、横から狙う
      const th = new THREE.Vector3(), sn = new THREE.Vector3(); e.body.bones.thL.getWorldPosition(th); e.body.bones.snL.getWorldPosition(sn);
      const mid = th.clone().add(sn).multiplyScalar(0.5), from = mid.clone().add(new THREE.Vector3(3, 0, 0));
      const h = G.Humanoid.rayParts(e.body, from, new THREE.Vector3(-1, 0, 0), 2.95);
      ok('失った脚には弾が当たらない', !h || !(h.part === 'legs' && h.side === 1), h ? h.part + ' ' + h.side : 'なし');
    }
    const a0 = e.ammo; for (let i = 0; i < 150; i++) { e.visible = true; e.awareness = 1; e.lastSeenPos = P.pos.clone(); M.step(1); }
    ok('脚を失っても伏せたまま撃ってくる', e.ammo < a0 && e.prone && !e.dead, a0 - e.ammo);
    let s = 0; while (!e.dead && s < 90) { M.step(60); s++; }
    ok('放っておくと失血死する（60秒以内）', e.dead && s > 30 && s <= 60, s + '秒');
    P.hurt = realHurt;
  }
  // 脚に3発（吹き飛ばなくても）で這うだけになる
  fresh();
  {
    const e = G.Enemies.list[0]; live(e); e.pos.set(12.5, 0, 6.5); e.syncModel(1 / 60);
    for (let i = 0; i < 3; i++) e.damage(8, 'legs', new THREE.Vector3(12.5, 1.4, 2.5), 1);
    ok('敵は脚に3発で立てなくなる（脚は付いたまま）', e.downed && e.prone && !e.legless && !e.dead);
    e.goal = new THREE.Vector3(14.5, 0, 9.5); e.path = null; e.repathT = 0; const p0 = e.pos.clone();
    for (let i = 0; i < 120; i++) { e.followPath(1 / 60, 0.32); }
    ok('立てない敵は伏せたまま這う（立ち上がらない）', e.prone && e.pos.distanceTo(p0) > 0.2 && e.pos.distanceTo(p0) < 1.0, e.pos.distanceTo(p0).toFixed(2));
  }

  // ---- 敵の武器：突撃役はショットガン、ハンドガンは主力武器が使えないときだけ ----
  fresh();
  {
    const L = G.Enemies.list;
    ok('突撃役はショットガン、それ以外はライフル', L.every(e => e.weapon === (e.role === 'rusher' ? 'shotgun' : 'rifle')) && L.some(e => e.weapon === 'shotgun'));
    const e = L.find(e => e.role !== 'rusher'); live(e); e.pos.set(12.5, 0, 9.5); e.syncModel(1 / 60);
    P.pos.set(12.5, 0, 2.5); P.camInit = false; P.update(.001, [], { dx: 0, dy: 0, wheel: 0 }); P.hurt = () => { };
    e.state = 'combat'; e.visible = true; e.awareness = 1;
    ok('普段はハンドガンを使わない', e.weapon === 'rifle');
    e.ammo = 0; e.arms.rifle.reserve = 0; e.fireCD = 0; e.tryFire(P, 1 / 60);
    ok('主力武器の弾が尽きたらハンドガンを抜く', e.weapon === 'pistol' && e.body.weapon === 'pistol');
    e.arms.rifle.reserve = 50; e.lastSeenT = G.time - 10; e.visible = false; e.switchT = 0; e.reloadT = 0; e.maybeBackToPrimary();
    ok('落ち着いて弾があれば主力武器に戻す', e.weapon === 'rifle');
    e.ammo = 0; e.arms.rifle.reserve = 50; e.weapon = 'rifle'; e.switchT = 0; e.visible = true; e.pos.set(12.5, 0, 6.0); e.fireCD = 0; e.tryFire(P, 1 / 60);
    ok('弾倉が空で相手が目の前なら、込め直さずハンドガンを抜く', e.weapon === 'pistol');
    P.hurt = realHurt;
  }

  // ---- 自分の出血と処置（体力は回復しない） ----
  fresh();
  {
    ok('出撃時に医療品を持っている', P.med.tq >= 0 && P.med.band >= 0 && (P.med.tq + P.med.hemo + P.med.band) <= G.MED_CAPACITY, JSON.stringify(P.med));
    P.med = { tq: 1, hemo: 0, band: 2 };
    P.addWound('leg', { heavy: 1 }); const hp0 = P.hp; M.step(120);
    ok('激しい出血で体力が緩やかに減り続ける', P.hp < hp0 - 1.8 && P.hp > hp0 - 2.5, (hp0 - P.hp).toFixed(1));
    tap('KeyH'); const a0 = P.ammo; M.step(20);
    ok('処置中は銃を下げている', P.ammo === a0 && !!P.treat && G.Viewmodel.state.lowK > .8);
    M.step(200);
    ok('止血帯で手足の激しい出血が止まる', P.bleedRate() === 0 && P.med.tq === 0);
    const hp1 = P.hp; M.step(240); ok('止血後は体力が減らず、回復もしない', P.hp === hp1);
    P.addWound('torso', { heavy: 1 }); const r0 = P.bleedRate(); tap('KeyH'); M.step(170);
    ok('止血剤がなければ包帯で押さえる（完全には止まらない）', P.bleedRate() > 0 && P.bleedRate() < r0, r0 + '→' + P.bleedRate().toFixed(2));
    P.hp = 40; G.Pickups.spawn('med', { x: P.pos.x, z: P.pos.z }); const m0 = P.med.band; M.step(2);
    ok('医療品を拾っても体力は戻らない', P.hp <= 40 && P.med.band > m0);
    P.wounds = []; P.addWound('leg', { heavy: 1 }); P.med = { tq: 0, hemo: 0, band: 0 }; let s = 0; while (!P.dead && s < 120) { M.step(60); s++; }
    ok('処置しなければ失血死する', P.dead && P.bleedDeath, s + '秒');
  }
  // 脚に3発で立てない・脚を失う・片腕を失う
  fresh();
  {
    for (let i = 0; i < 3; i++) P.hurt(5, new THREE.Vector3(12, 1, 8), 'leg');
    ok('自分も脚に3発で立てなくなり、伏せたまま', P.crippled && P.posture === 'prone');
    tap('KeyC'); tap('Space'); ok('立てない間は、しゃがむ・跳ぶもできない', P.posture === 'prone' && P.grounded);
    const z0 = P.pos.z; key('KeyW'); M.step(60); key('KeyW', 'keyup');
    ok('這って動くことはできる', Math.abs(P.pos.z - z0) > 0.2);
  }
  fresh();
  {
    P.loseLeg(1, new THREE.Vector3(12, 1, 8));
    ok('脚を失うと立てず、切り口から激しく出血する', P.crippled && P.bleedRate() >= 1.8 && !!P.legLost);
    ok('もげた脚が床に落ちる', F.pieces.some(p => p.h === P.lostLegBody));
    tap('KeyH'); M.step(200);
    ok('止血帯で切り口の出血を止められる（脚は戻らない）', P.bleedRate() === 0 && P.crippled);
  }
  fresh();
  {
    const shotSpread = () => { const before = P.armLost; return P.oneArmK(); };
    const k0 = shotSpread(); P.loseArm(1);
    ok('片腕を失うと主力武器が扱いにくい（ぶれが大きい）', P.oneArmK() > 2.5 && k0 === 1, P.oneArmK());
    P.switchWeapon('pistol'); M.step(40);
    ok('ハンドガンは片手でも比較的扱える', P.oneArmK() < 2, P.oneArmK());
    ok('左手と左腕が描かれない', G.Viewmodel.oneArm === true);
  }

  // ---- 手りゅう弾：木箱と木の壁が壊れ、やり直すと元に戻る ----
  fresh();
  {
    let crate = null; for (let z = 0; z < Wd.H && !crate; z++) for (let x = 0; x < Wd.W; x++) if (Wd.cell(x, z) === 'B') { crate = { x, z }; break; }
    G.Grenades.explode(new THREE.Vector3(crate.x + 0.5, 0.1, crate.z - 0.4));
    ok('手りゅう弾で近くの木箱が壊れる', Wd.cell(crate.x, crate.z) !== 'B', Wd.cell(crate.x, crate.z));
    const wood = [...G.Destruction.cells.values()][3]; const n0 = wood.boxes.length; const b = wood.boxes[0].b;
    G.Grenades.explode(new THREE.Vector3((b[0] + b[3]) / 2 + ((b[3] - b[0]) < (b[5] - b[2]) ? 0.9 : 0), 0.2, (b[2] + b[5]) / 2 + ((b[3] - b[0]) < (b[5] - b[2]) ? 0 : 0.9)));
    ok('手りゅう弾で近くの木の壁に穴が開く', wood.boxes.length !== n0, n0 + '→' + wood.boxes.length);
    M.reset();
    ok('やり直すと木箱と木の壁が元に戻る', Wd.cell(crate.x, crate.z) === 'B' && [...G.Destruction.cells.values()][3].boxes.length === n0);
  }

  // ---- AIの仲間 ----
  fresh(2);
  {
    ok('仲間が2人いる', A.list.length === 2 && A.list.every(a => !a.dead));
    P.pos.set(26.5, 0, 12.5); P.yaw = Math.PI; P.update(.001, [], { dx: 0, dy: 0, wheel: 0 });
    for (let i = 0; i < 720; i++) M.step(1);   // 25m先へ移したので、追いつくまで待つ
    ok('仲間がついてくる（5.5m以内）', A.list.every(a => a.pos.distanceTo(P.pos) < 5.5), A.list.map(a => a.pos.distanceTo(P.pos).toFixed(1)).join(','));
    tap('KeyF'); ok('Fキーで「その場で待て」', A.mode === 'hold'); tap('KeyF'); ok('もう一度で「ついてこい」', A.mode === 'follow');
    // 射線上に自分がいると撃たない
    const a0 = A.list[0]; a0.pos.set(26.5, 0, 11.0); a0.yaw = a0.lookYaw = a0.bodyYaw = 0; a0.syncModel(1 / 60); a0.syncModel(1 / 60);
    P.pos.set(26.5, 0, 13.0); P.update(.001, [], { dx: 0, dy: 0, wheel: 0 });
    const e = G.Enemies.list[1]; e.pos.set(26.5, 0, 18.0); e.syncModel(1 / 60);
    a0.treat = null; a0.reloadT = 0; a0.fireCD = 0;
    const am = a0.ammo; for (let i = 0; i < 30; i++) { a0.target = e; a0.reaction = 0; a0.tryFire(1 / 60); }
    ok('自分が射線上にいる間は撃たず、横へずれる', a0.ammo === am && a0.sideT > 0, `ammo ${am}→${a0.ammo} sideT ${a0.sideT.toFixed(2)} ally ${a0.pos.x.toFixed(1)},${a0.pos.z.toFixed(1)} player ${P.pos.x.toFixed(1)},${P.pos.z.toFixed(1)}`);
    P.pos.set(24.0, 0, 13.0); P.update(.001, [], { dx: 0, dy: 0, wheel: 0 }); for (let i = 0; i < 30; i++) { a0.target = e; a0.reaction = 0; a0.tryFire(1 / 60); }
    ok('射線から外れると撃つ', a0.ammo < am);
    // 敵は仲間も狙う
    const en = G.Enemies.list[2]; en.pos.set(26.5, 0, 16.0); en.lookYaw = Math.PI; en.yaw = Math.PI; en.state = 'combat'; en.syncModel(1 / 60);
    P.pos.set(10.5, 0, 2.5); P.update(.001, [], { dx: 0, dy: 0, wheel: 0 }); en.tgtT = 0; en.tgt = null; en.visible = false;
    const tg = en.pickTarget(P);
    ok('敵は見えている仲間を狙う（自分が見えないとき）', tg === a0 || tg === A.list[1], tg === P ? 'プレイヤー' : tg && tg.name);
    // 仲間は撃たれれば出血し、そばで5を押すと自分の医療品で処置できる
    // Rescue requires a clear line of sight; use two open corridor cells.
    P.pos.set(12.5,0,2.5);P.camInit=false;
    const a1 = A.list[1]; a1.pos.set(12.5, 0, 3.5); a1.wounds = [{ type: 'limb', area: 'leg', rate: 1.5, packed: false }]; a1.seenT = G.time; a1.hurtT = G.time;
    P.med = { tq: 1, hemo: 0, band: 0 };
    tap('Digit5'); const who = P.treat && P.treat.ally; M.step(200);
    ok('仲間のそばで5を押すと仲間を処置する', who === a1 && a1.bleedRate() === 0 && P.med.tq === 0);
    // 自分の弾は仲間に当たる（誤射）
    a1.pos.set(P.pos.x, 0, P.pos.z + 3); a1.syncModel(1 / 60); a1.syncModel(1 / 60); const hpA = a1.hp;
    P.yaw = Math.PI; P.pitch = -0.05; P.camInit = false; P.update(.001, [], { dx: 0, dy: 0, wheel: 0 }); P.shoot();
    ok('自分の弾は仲間に当たる（誤射）', a1.hp < hpA, hpA + '→' + a1.hp.toFixed(0));
  }

  // ---- 欠損の起きやすさ：近距離のショットガンで腕・脚・頭を狙うと、高い確率でもげる ----
  {
    let s = 0, n = 0;
    for (let k = 0; k < 8; k++) {
      fresh();
      const e = G.Enemies.list[0]; e.pos.set(26.5, 0, 15.5); e.yaw = e.lookYaw = e.bodyYaw = Math.PI; e.syncModel(1 / 60);
      P.pos.set(26.5, 0, 12.5); P.yaw = Math.PI; P.camInit = false; P.switchWeapon('shotgun'); M.step(40);
      const y = [0.6, 1.6, 1.1, 0.55][k % 4], cam = G.camera.position, dx = e.pos.x + (k % 2 ? 0.2 : -0.2) - cam.x, dz = e.pos.z - cam.z;
      P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(y - cam.y, Math.hypot(dx, dz)); P.recoil = 0; P.update(.001, [], { dx: 0, dy: 0, wheel: 0 });
      P.shoot(); M.step(2); n++;
      if (F.pieces.length || e.legless) s++;
    }
    ok('3mのショットガンで手足・頭を狙うと、多くの場合もげる（8発中5発以上）', s >= 5, s + '/' + n);
  }
  // ---- 出撃時に仲間と重ならない／自分と仲間はヘルメットとサングラス ----
  fresh(2);
  {
    const d = A.list.map(a => a.pos.distanceTo(P.pos)), dd = A.list[0].pos.distanceTo(A.list[1].pos);
    ok('出撃時に仲間が自分や互いと重ならない（1.2m以上離れる）', d.every(x => x >= 1.2) && dd >= 1.2, d.map(x => x.toFixed(2)).join(',') + ' / ' + dd.toFixed(2));
    ok('仲間はヘルメットとサングラスを着けている', A.list.every(a => a.body.gear && a.body.gear.userData.variant === 'helmet-sunglasses'));
  }
  M.allyCount = 0; M.reset();
  return R.join('\n');
})()

(async () => {
  const R = [], ok = (name, pass, detail) => R.push((pass ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' [' + detail + ']'));
  const M = G.Game, A = G.Allies, P = G.Player, W = G.World, Radio = G.Radio;
  M.allyCount = 2; M.reset(); M.state = 'playing'; G.Input.enabled = true;
  G.Enemies.list.forEach((e, i) => { e.pos.set(40 + i, 0, 30); e.update = () => {}; e.syncModel(1 / 60); });
  const [alpha, bravo] = A.list;
  ok('味方がALPHAとBRAVOに分かれる', alpha.name === 'ALPHA' && bravo.name === 'BRAVO');
  ok('Zキーが照準位置への移動指示', G.Input.binds.moveOrder === 'KeyZ');
  ok('初期選択は両方で画面にも表示', A.selection === 'both' && document.querySelector('#squad-select [data-squad="both"]').classList.contains('on'));

  let point = null;
  for (let r = 3; r <= 7 && !point; r++) for (let dz = -r; dz <= r && !point; dz++) for (let dx = -r; dx <= r; dx++) {
    const x = Math.floor(P.pos.x) + dx + 0.5, z = Math.floor(P.pos.z) + dz + 0.5;
    if (W.walkable(Math.floor(x), Math.floor(z)) && !W.overlapsSolid(x, z, .35, 1.8) && G.Path.find(alpha.pos.x, alpha.pos.z, x, z, null) && G.Path.find(bravo.pos.x, bravo.pos.z, x, z, null)) { point = new THREE.Vector3(x, 0, z); break; }
  }
  ok('移動指示の検証地点が到達可能', !!point);
  if (point) {
    document.querySelector('#squad-select [data-squad="alpha"]').click(); ok('ALPHAを画面から選択', A.selection === 'alpha' && document.querySelector('#squad-select [data-squad="alpha"]').getAttribute('aria-pressed') === 'true');
    ok('ALPHAだけが移動を開始', A.orderMove(point) && alpha.moveState === 'moving' && bravo.moveState === 'none');
    const before = alpha.pos.distanceTo(point); M.step(90);
    ok('指定地点に向かって実際に進む', alpha.pos.distanceTo(point) < before - .3, before.toFixed(2) + '→' + alpha.pos.distanceTo(point).toFixed(2));
    document.querySelector('#squad-select [data-squad="bravo"]').click(); ok('BRAVOだけを追加で指示できる', A.orderMove(point) && bravo.moveState === 'moving');
    A.select('both'); ok('両方を同じ地点に指示できる', A.orderMove(point) && A.list.every(a => a.moveState === 'moving'));
    ok('移動指示の印がHUDに出る', !!A.commandPoint && A.commandAssigned.length === 2);
    A.toggleMode(); ok('Fの待機指示で移動命令を解除', A.mode === 'hold' && A.list.every(a => a.moveState === 'none'));
    const oldPos = G.camera.position.clone(), oldRot = G.camera.rotation.clone();
    G.camera.position.set(point.x, 1.6, point.z); G.camera.lookAt(point); G.camera.updateMatrixWorld();
    A.select('alpha'); A.orderAtReticle();
    ok('Z指示は照準の床位置を使う', alpha.moveState === 'moving' && !!A.commandPoint && A.commandPoint.distanceTo(point) < .7, A.commandPoint?.distanceTo(point).toFixed(2));
    G.camera.position.copy(oldPos); G.camera.rotation.copy(oldRot); G.camera.updateMatrixWorld();
    A.toggleMode();
  }
  const oldSpeech = Radio.say, utterances = [];
  Radio.say = (who, line, tone) => { utterances.push({ who, line, tone }); G.HUD.radio(who.name, line); };
  A.select('both');
  G.Input.down.add('ShiftLeft'); A.orderAtReticle(); G.Input.down.delete('ShiftLeft');
  ok('Shift＋Zで指示対象を切り替え', A.selection === 'alpha');
  const e = G.Enemies.list[0]; e.pos.copy(alpha.pos).add(new THREE.Vector3(0, 0, 3)); e.syncModel(1 / 60);
  alpha.lookYaw = Math.atan2(e.pos.x - alpha.pos.x, e.pos.z - alpha.pos.z);
  const oldLos = W.lineOfSight; W.lineOfSight = () => true;
  Radio.lastContact = -99; alpha.lastContactReport = -99; alpha.target = null;
  alpha.perceive();
  ok('敵を視認すると英語で発見を報告', utterances.some(u => u.who === alpha && u.line.includes('Enemy spotted')));
  ok('未警戒の敵を見たときは小声で報告', utterances.some(u => u.who === alpha && u.tone === 'whisper'));
  ok('発言者と内容が画面に一致', document.getElementById('radio-speaker').textContent === 'ALPHA' && document.getElementById('radio-text').textContent.includes('Enemy spotted'));
  ok('視認した敵は交戦対象になる', alpha.target === e);
  const reports = utterances.length; alpha.perceive(); ok('同じ敵への連続報告を抑える', utterances.length === reports);
  alpha.target = null; alpha.lastContactReport = -99; Radio.lastContact = -99;
  e.awareness = 1; e.state = 'combat'; alpha.perceive();
  ok('敵に発見されているときは強い声で報告', utterances.some(u => u.who === alpha && u.tone === 'shout'));
  W.lineOfSight = oldLos; Radio.say = oldSpeech; Radio.reset();
  G.Audio.init(); G.Audio.prepareRadioVoices();
  ok('ALPHAとBRAVOの英語男性音声を別々に用意',!!G.Audio.radioVoiceBank.alpha.contact&&!!G.Audio.radioVoiceBank.bravo.contact&&G.RADIO_VOICE_DATA.voices.alpha.contact!==G.RADIO_VOICE_DATA.voices.bravo.contact);
  ok('発見報告に小声と叫びの別音声を用意', ['alpha','bravo'].every(actor=>!!G.Audio.radioVoiceBank[actor].contact_whisper&&!!G.Audio.radioVoiceBank[actor].contact_shout));
  Radio.say(alpha,'Enemy spotted! Engaging.');
  ok('無線の日本語訳を画面に表示',document.getElementById('radio-ja').textContent==='敵を確認、交戦する！');
  const spatial=[...(G.Audio.followingVoices||[])].find(v=>v.source===Radio.currentSource);
  const head=alpha.voicePos();
  ok('無線は発言者の頭部から位置音で再生',!!spatial&&!!head&&Math.abs(spatial.panner.positionX.value-head.x)<.01&&Math.abs(spatial.panner.positionZ.value-head.z)<.01);
  Radio.reset();
  Radio.say(bravo,'Enemy spotted! Engaging.','whisper');
  ok('小声の発見報告は専用音声を再生',Radio.currentSource?.buffer===G.Audio.radioVoiceBank.bravo.contact_whisper&&Radio.currentTone==='whisper');
  Radio.reset();
  Radio.say(bravo,'Enemy spotted! Engaging.','shout');
  ok('緊急の発見報告は専用音声を再生',Radio.currentSource?.buffer===G.Audio.radioVoiceBank.bravo.contact_shout&&Radio.currentTone==='shout');
  Radio.reset();
  M.allyCount=2;M.reset();const mate=G.Allies.list[0];mate.hp=35;mate.wounds=[{type:'limb',area:'arm',rate:1.1}];G.HUD.allies();
  ok('仲間の生存と出血と体力を常時表示',document.querySelector('#allies [data-ally="0"]').textContent.includes('生存')&&document.querySelector('#allies [data-ally="0"]').textContent.includes('35/100')&&document.getElementById('allies').textContent.includes('出血中'));
  mate.die(null,false);
  ok('死亡時にカードを即更新して生存人数を減らす',document.querySelector('#allies [data-ally="0"]').classList.contains('dead')&&document.querySelector('#allies [data-ally="0"]').textContent.includes('死亡')&&document.getElementById('allies').textContent.includes('生存 1 / 2'));
  ok('死亡したALPHAへの指示は無効',document.querySelector('[data-squad="alpha"]').disabled&&!document.querySelector('[data-squad="bravo"]').disabled);
  M.allyCount=0;M.reset();G.HUD.allies();ok('単独出撃では仲間カードを表示しない',document.getElementById('allies').textContent==='');
  return R.join('\n') + '\n' + R.filter(x => x.startsWith('PASS')).length + '/' + R.length + ' PASS';
})()

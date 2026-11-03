(async () => {
  const G = window.G, M = G.Game, A = G.Audio, R = [];
  const ok = (name, pass, detail) => R.push((pass ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' [' + detail + ']'));
  M.allyCount = 2; M.reset(); M.state = 'playing'; G.Input.enabled = true; A.init(); A.master.gain.value = 0;
  A.stopEnemyVoices(); A.ambience(true);
  const pos = new THREE.Vector3(12.5, 1.5, 12.5), originalOutdoor = G.World.outdoor;
  const room = A.acousticAt(pos); G.World.outdoor = true; const outside = A.acousticAt(pos); G.World.outdoor = originalOutdoor;
  ok('屋内と屋外で反響が変わり、直接音より残響を抑える', room.room > outside.room && room.room < .2 && outside.hall < .04);
  ok('屋内の換気音と屋外の風音を生成', !!A.ventGain && !!A.windGain && A.ambientEnabled);
  const e = G.Enemies.list[0]; e.pos.set(12.5, 0, 9.5); e.syncModel(1/60); e.say('hurt');
  const esrc = A.enemyVoiceState.get(e.id)?.source, ev = [...A.followingVoices].find(v => v.source === esrc), mouth = e.voicePos();
  const distance = v => Math.hypot(v.panner.positionX.value - v.at.x, v.panner.positionY.value - v.at.y, v.panner.positionZ.value - v.at.z);
  ok('敵の声は頭部の位置から鳴る', !!esrc && !!ev && distance({panner:ev.panner,at:mouth}) < .02);
  const oldX = ev?.panner.positionX.value; e.pos.x += 1.5; e.syncModel(1/60); A.updateListener(G.camera);
  ok('敵が動くと発声中の位置も移動', !!ev && Math.abs(ev.panner.positionX.value - oldX) > 1 && distance({panner:ev.panner,at:e.voicePos()}) < .02);
  const ally = G.Allies.list[0]; ally.pos.set(11.5, 0, 8.5); ally.syncModel(1/60); ally.say('hurt');
  const asrc = A.enemyVoiceState.get('ally' + ally.id)?.source, av = [...A.followingVoices].find(v => v.source === asrc);
  ok('仲間の声も本人の頭部から鳴る', !!asrc && !!av && distance({panner:av.panner,at:ally.voicePos()}) < .02);
  const allyX = av?.panner.positionX.value; ally.pos.x += 1.7; ally.syncModel(1/60); A.updateListener(G.camera);
  ok('仲間が動くと発声中の声も追従', !!av && Math.abs(av.panner.positionX.value - allyX) > 1 && distance({panner:av.panner,at:ally.voicePos()}) < .02);
  e.body.missing = new Set(['head']); A.updateListener(G.camera);
  ok('頭部が失われた後は声の位置追従を停止', !A.followingVoices.has(ev));
  A.stopEnemyVoices(); ok('再出撃時に発声中の位置追従を解放', A.followingVoices.size === 0);
  A.ambience(false); ok('一時停止中は環境音を消す', !A.ambientEnabled);
  A.makeVoiceBank();
  ok('絶命用の声は短く末尾をフェードする',A.lastBreathBank.length===4&&A.lastBreathBank.every(b=>b.duration<=.421&&Math.abs(b.getChannelData(0)[b.length-1])<.001));
  const random=Math.random;
  try {
    const hurt=A.voice(pos,'hurt',1,1,999,()=>pos);Math.random=()=>0;
    const silent=A.deathVoice(pos,1,999,()=>pos,'body');
    ok('無言の絶命では再生中の叫びも停止',!!hurt&&!silent&&!A.enemyVoiceActive.has(hurt)&&![...A.followingVoices].some(v=>v.source===hurt));
    Math.random=()=>.9;const short=A.deathVoice(pos,1,999,()=>pos,'body');
    ok('声を出す絶命では長い叫びを使わない',!!short&&A.lastBreathBank.includes(short.buffer));
    const normalGain=[...A.followingVoices].find(v=>v.source===short)?.base;
    Math.random=()=>.6;ok('首と失血の絶命では無言の割合が高い',!A.deathVoice(pos,1,999,()=>pos,'neck')&&!A.deathVoice(pos,1,999,()=>pos,'bleed'));
    Math.random=()=>.9;const quiet=A.deathVoice(pos,1,999,()=>pos,'bleed');
    const quietGain=[...A.followingVoices].find(v=>v.source===quiet)?.base;
    ok('失血時の短い声は通常の絶命より小さい',!!quiet&&quietGain<normalGain);
    ok('頭部への致命傷では発声しない',!A.deathVoice(pos,1,999,()=>pos,'head'));
  } finally {Math.random=random;A.stopEnemyVoices();}
  const originalDeath=A.deathVoice,causes=[];A.deathVoice=(p,pitch,id,follow,cause)=>causes.push(cause);
  try {
    const victim=G.Enemies.list[1];victim.neckWound=true;victim.die(0,0,'bleed');victim.die(0,0,'bleed');
    ok('敵の首負傷による絶命音は一度だけ判定',causes.length===1&&causes[0]==='neck');
    ally.wounds=[{rate:1,type:'limb'}];ally.die(null,false);ok('味方の失血死にも静かな絶命を適用',causes[1]==='bleed');
  } finally {A.deathVoice=originalDeath;}
  M.allyCount = 0; M.reset();
  const rng=Math.random;
  try{
    Math.random=()=>.1;A._playerVoiceUntil=0;const hurt=A.playerVoice('hurt');A.playerVoice('death');
    ok('プレイヤーの無言死亡は直前の悲鳴も停止する',!!hurt&&A._playerVoiceSource===null);
    Math.random=()=>.9;const quiet=A.playerVoice('death');
    ok('プレイヤーの有声死亡も長い悲鳴を使わない',!!quiet&&A.lastBreathBank.includes(quiet.buffer)&&quiet.buffer.duration<=.42&&quiet._deathFilter?.frequency.value===1100);
    if(quiet)quiet.stop();
    const gear=G.Humanoid.create({style:'swat',gear:'helmet-sunglasses'}).gear;
    const shell=gear.getObjectByName('ballistic-shell'),rim=gear.getObjectByName('curved-rim');
    shell.geometry.computeBoundingBox();
    ok('SWATの頭装備は丸いシェル・曲線の縁・顔カバー',!!shell&&rim.geometry.type==='TubeGeometry'&&!!gear.getObjectByName('face-cover')&&shell.geometry.boundingBox.max.x<.125);
    ok('ゴーグルが両目を覆う位置に装着される',gear.children.filter(c=>c.name==='eye-goggle-frame').length===1&&Math.abs(gear.getObjectByName('eye-goggle-frame').position.y-.119)<.001);
  }finally{Math.random=rng;}
  return R.join('\n');
})()

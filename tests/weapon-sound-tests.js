(async () => {
  const R = [], ok = (name, yes, detail) => R.push((yes ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' [' + detail + ']'));
  const M = G.Game, A = G.Audio, FX = G.Effects, P = G.Player;
  M.allyCount = 0; M.reset(); M.state = 'playing'; G.Input.enabled = true; A.init(); A.master.gain.value = 0;
  G.Enemies.list.forEach(e => { e.update = () => {}; e.pos.set(40, 0, 30); });
  ok('不自然だった追加波形を使わない', !A.gunBank);
  const bursts = [], oldBurst = A.noiseBurst, oldTone = A.tone;
  A.noiseBurst = (...args) => { bursts.push(args); };
  A.tone = () => {};
  A.gunshot(null, true, 'ar'); const rifleBursts = bursts.length; bursts.length = 0;
  A.gunshot(null, true, 'pistol'); const pistolBursts = bursts.length; bursts.length = 0;
  A.gunshot(null, true, 'shotgun'); const shotgunBursts = bursts.length;
  ok('前のライフル・拳銃・散弾銃の銃声レイヤーに戻った', rifleBursts === 4 && pistolBursts === 4 && shotgunBursts === 3, `${rifleBursts}/${pistolBursts}/${shotgunBursts}`);
  A.noiseBurst = oldBurst; A.tone = oldTone;
  const hits = [], oldHit = A.casingHit;
  A.casingHit = (...args) => { hits.push(args); };
  const c = FX.ejectCasing(new THREE.Vector3(P.pos.x, 1.4, P.pos.z), new THREE.Vector3(1, 0, 0), 'ar');
  ok('薬きょうが発射口から飛び出す', c.mesh.visible && c.vel.x > 1 && c.vel.y > 1);
  for (let i = 0; i < 150 && !c.sleep; i++) M.step(1);
  ok('薬きょうが重力で床に落ちて止まる', c.sleep && c.mesh.position.y < .2, c.mesh.position.y.toFixed(2));
  ok('着地地点の床材で音を鳴らす', hits.length > 0 && hits[0][2] === G.Surfaces.at(hits[0][0].x, hits[0][0].z, 0), hits.map(h => h[2]).join(','));
  const before = FX.casingIdx; P.cur = 'ar'; P.ammo = Math.max(1, P.ammo); P.fireCD = 0; P.shoot();
  ok('プレイヤーの発砲で薬きょうが排出される', FX.casingIdx === before + 1);
  FX.reset(); ok('リセット時に落ちた薬きょうを消す', FX.casings.every(x => !x.mesh.visible && x.life === 0));
  A.casingHit = oldHit;
  const levels=[],oldOut=A.out;A.out=(pos,gain)=>{levels.push(gain);return null;};
  A.casingHit(P.pos,'ar','concrete',4,false);A.casingHit(P.pos,'ar','carpet',4,false);A.casingHit(P.pos,'ar','concrete',4,true);A.out=oldOut;
  ok('薬きょう着地音を大きくしつつ柔らかい床と再跳躍は控える',levels[0]>.3&&levels[1]<levels[0]&&levels[2]<levels[0]);
  A.prepareCasingBank();const bank=A.casingBank;
  const tail=b=>{const a=b.getChannelData(0);let energy=0;for(let i=1600;i<4800;i++)energy+=a[i]*a[i];return energy;};
  ok('3種類の薬きょうと5種類の床材に着地音を用意',Object.keys(bank).length===15&&Object.values(bank).every(v=>v.length===3));
  ok('金属床は長く鳴り、木とカーペットは金属の余韻を吸収',tail(bank['ar:metal'][0])>tail(bank['ar:concrete'][0])&&tail(bank['ar:concrete'][0])>tail(bank['ar:wood'][0])&&tail(bank['ar:wood'][0])>tail(bank['ar:carpet'][0]));
  const oldOsc=A.ctx.createOscillator;let oscillators=0;A.ctx.createOscillator=()=>{oscillators++;return oldOsc.call(A.ctx);};
  try{const hit=A.casingHit(P.pos,'pistol','metal',4,false);ok('着地時は事前生成した金属音を使い、発射中の合成負荷を抑える',!!hit&&bank['pistol:metal'].includes(hit.buffer)&&oscillators===0);hit?.stop();}finally{A.ctx.createOscillator=oldOsc;}
  return R.join('\n') + '\n' + R.filter(x => x.startsWith('PASS')).length + '/' + R.length + ' PASS';
})()

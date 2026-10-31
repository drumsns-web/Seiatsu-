(() => {
  const out=[],ok=(name,pass,detail='')=>out.push((pass?'PASS ':'FAIL ')+name+' '+detail);
  const M=G.Game,P=G.Player;
  const fresh=()=>{M.allyCount=0;M.reset();M.state='playing';G.Input.enabled=true;G.Enemies.list.forEach((e,i)=>{e.pos.set(40+i,0,30);e.update=()=>{};e.syncModel(1/60);});const e=G.Enemies.list[0];e.pos.set(12.5,0,5.5);e.yaw=e.lookYaw=e.bodyYaw=0;e.crouch=0;e.prone=false;e.syncModel(1/60);return e;};
  let e=fresh();
  const neck=new THREE.Vector3();e.body.bones.neck.localToWorld(neck.set(0,.035,0));
  const from=neck.clone().add(new THREE.Vector3(0,0,1)),dir=neck.clone().sub(from).normalize();
  const hit=G.Humanoid.rayParts(e.body,from,dir,1.75,true);
  ok('骨の首位置に向けたナイフは首に当たる',hit?.part==='neck',hit?.part);
  G.camera.position.copy(from);G.camera.lookAt(neck);G.camera.updateMatrixWorld();
  P.resolveKnife();
  ok('首を刺してもその瞬間には死亡しない',e.neckWound&&!e.dead&&e.hp>0);
  const pos=e.pos.clone(),ammo=e.ammo,kills=P.kills;
  e.update=e.constructor.prototype.update;
  for(let i=0;i<180;i++){G.time+=1/60;e.update(1/60,P);e.tryFire(P,1/60);}
  ok('首の負傷中はその場でうずくまり射撃しない',!e.dead&&e.pos.distanceTo(pos)<.001&&e.ammo===ammo&&e.crouch>.9);
  ok('首の負傷中も失血で体力が減り続ける',e.hp>0&&e.hp<55,e.hp.toFixed(1));
  for(let i=0;i<180;i++){G.time+=1/60;e.update(1/60,P);}
  ok('約5.5秒経つと失血死して倒れる',e.dead&&e.body.st.dead);
  ok('失血死の撃破数を一度だけ加える',P.kills===kills+1);
  for(let i=0;i<30;i++)e.update(1/60,P);
  ok('死亡後の更新で撃破数が増えない',P.kills===kills+1);
  for(const part of ['arms','legs','body','stomach','head']){
    e=fresh();e.stab(part,from,1);
    ok(part+' は一撃の即死にならず通常出血',!e.dead&&!e.neckWound&&e.hp>0&&e.hp<100&&e.knifeBleed>0);
    const hp=e.hp;e.updateKnifeWound(2);ok(part+' の傷で時間とともに体力が減る',e.hp<hp);
    e.hp=.1;e.updateKnifeWound(1);ok(part+' も放置すれば失血死する',e.dead);
  }
  e=fresh();e.hp=10;ok('首以外でも直接ダメージが体力を上回れば死亡',e.stab('body',from)&&e.dead);
  e=fresh();e.stab('neck',from);e.hp=1;e.damage(5,'body',from);ok('首負傷中に追加ダメージを受けた場合も正しく死亡',e.dead);
  const old=G.Game.gore;G.Game.gore='off';const n=G.Effects.blood.length;G.Effects.neckBleed(neck,0);ok('流血オフでは首の血痕を追加しない',G.Effects.blood.length===n);G.Game.gore=old;
  return out.join('\n');
})()

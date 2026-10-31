(async()=>{
const G=window.G,M=G.Game,F=G.Physics,R=[],ok=(n,c,v)=>R.push((c?'PASS ':'FAIL ')+n+(v!==undefined?' ['+v+']':''));
M.reset();M.state='playing';G.Input.enabled=true;G.Audio.init();G.Audio.master.gain.value=0;
const make=()=>{const h=G.Humanoid.create();h.root.position.set(12.5,0,12.5);M.scene.add(h.root);h.update({dt:1/60,speed:0,crouch:0,aim:0,aimPitch:0,twist:0,reload:-1,scene:M.scene});return h;};
const remove=h=>{F.removeRagdoll(h);M.scene.remove(h.root);h.dispose();};
// Check the entire collapse, not just the final pose, for signed joint limits and stretched legs.
for (const [posture,axis,sign] of [['stand','x',1],['stand','x',-1],['stand','z',1],['stand','z',-1],['crouch','x',1],['prone','x',1]]) {
 const label=posture+'/'+axis+'/'+sign;
 const body=make();body.root.position.set(26.5,0,16.5);
 for(let i=0;i<100;i++)body.update({dt:1/60,speed:0,crouch:posture==='crouch'?1:0,prone:posture==='prone',aim:0,aimPitch:0,twist:0,reload:-1,scene:M.scene});
 body.die(axis,sign);body.update({dt:1/60,scene:M.scene});const r=body.ragdoll;
 ok(label+'：膝は一方向のヒンジ関節',r.parts.get('snL').joint instanceof CANNON.HingeConstraint&&r.parts.get('snR').joint instanceof CANNON.HingeConstraint);
 if(posture==='stand'&&axis==='x'&&sign===1){
   const knee=r.parts.get('snL'),parent=r.parts.get('thL').body;
   const bad=new CANNON.Quaternion();bad.setFromEuler(-.7,.8,.6);parent.quaternion.mult(bad,knee.body.quaternion);
   knee.body.angularVelocity.set(8,-9,7);
 }
 let angleError=0,anchorError=0,minY=99,maxHips=0,minFoot=99;
 for(let i=0;i<240;i++){
   F.update(1/60);maxHips=Math.max(maxHips,r.parts.get('hips').body.position.y);
   for(const p of r.parts.values()){
     minY=Math.min(minY,p.body.position.y);
     if(!p.legLimits)continue;
     const e=p.bone.rotation;
     [e.x,e.y,e.z].forEach((v,j)=>angleError=Math.max(angleError,p.legLimits[j][0]-v,v-p.legLimits[j][1]));
     anchorError=Math.max(anchorError,p.bone.position.distanceTo(p.restPosition));
     if(p.bone.name.startsWith('ft'))minFoot=Math.min(minFoot,p.bone.getWorldPosition(new THREE.Vector3()).y);
   }
 }
 ok(label+'：倒れている間も膝・股関節・足首が可動範囲を越えない',angleError<.0001,angleError.toFixed(6));
 ok(label+'：膝と足首が離れず脚が伸びない',anchorError<.001,anchorError.toFixed(6));
 ok(label+'：表示上の足も床を大きく突き抜けない',minFoot>-.03,minFoot.toFixed(4));
 ok(label+'：舞い上がらず床上で静止する',r.frozen&&minY>-.05&&maxHips<1.15,[r.frozen,minY.toFixed(3),maxHips.toFixed(3)].join('/'));
 remove(body);
}
let h=make(),h2=make();ok('分離用の形状を敵同士で共有',h.cutGeometry===h2.cutGeometry);remove(h2);
const timings=[];M.dismember=true;
// 顔の上部は頭骨ごと飛ばさず、下半分と頭のラグドールを残す。
h.die('x',1);h.update({dt:1/60,scene:M.scene});
const headBefore=h.mesh.geometry.index?.count||h.mesh.geometry.attributes.position.count;
const headStart=performance.now(),lump=F.sever(h,{part:'head',side:0,dir:new THREE.Vector3(.8,.1,.5)});timings.push(performance.now()-headStart);
ok('head：目と鼻より上が欠け、顎と首は残る',h.mesh.geometry.index.count<headBefore&&h.mesh.geometry.index.count>headBefore*.7&&!!h.headWound);
ok('head：頭のラグドールと関節を残す',h.ragdoll.parts.size===16&&h.ragdoll.joints.length===15);
ok('head：頭全体は飛ばず、赤い塊が1つ落ちる',!h.severMesh&&lump?.kind==='headMass'&&lump.mesh.material.color.r>lump.mesh.material.color.g);
const headPieces=F.pieces.length;F.sever(h,{part:'head',side:0,dir:new THREE.Vector3(1,0,0)});
ok('head：同じ頭を重複して破裂させない',F.pieces.length===headPieces);
let headMax=0;for(let i=0;i<150;i++){F.update(1/60);headMax=Math.max(headMax,lump.body.position.y);}
ok('head：塊は跳ねずに床で止まる',lump.frozen&&lump.body.position.y<.35&&headMax<1.9,[headMax.toFixed(2),lump.body.position.y.toFixed(2)]);
remove(h);h=make();
// 腕・脚はラグドールから外し、独立した1つの剛体として扱う。
for(const [part,side,key,count,joints]of[['arms',1,'armL',13,12],['arms',-1,'armR',13,12],['legs',1,'legL',13,12],['legs',-1,'legR',13,12]]){
 h.die('x',1);h.update({dt:1/60,scene:M.scene});const originalCount=h.mesh.geometry.attributes.position.count;
 const t=performance.now();F.sever(h,{part,side,dir:new THREE.Vector3(.8,.1,.5)});timings.push(performance.now()-t);
 ok(key+'：細片を作らず1つの通常メッシュ',!!h.severMesh&&!h.severMesh.isSkinnedMesh&&h.severMesh.geometry.attributes.position.count<originalCount*.4);
 ok(key+'：生身と分離部位の描画材質を分離',h.mesh.material.every(m=>m.skinning)&&h.severMesh.material.every(m=>!m.skinning));
 ok(key+'：1剛体に統合、内部関節も削除',h.ragdoll.parts.size===count&&h.ragdoll.joints.length===joints,[h.ragdoll.parts.size,h.ragdoll.joints.length].join('/'));
 const vertices=h.severMesh.geometry.attributes.position.array;ok(key+'：大きな一部位として有限の寸法',vertices.every(Number.isFinite)&&h.severMesh.geometry.boundingSphere.radius<1.5,h.severMesh.geometry.boundingSphere.radius.toFixed(3));
 const geom=h.severMesh.geometry,parts=h.ragdoll.parts.size;F.sever(h,{part,side,dir:new THREE.Vector3(1,0,0)});ok(key+'：同じ部位を重複生成しない',h.severMesh.geometry===geom&&h.ragdoll.parts.size===parts);
 for(let i=0;i<150;i++)F.update(1/60);
 ok(key+'：飛んだ部位が床をすり抜けない',h.severMesh.position.y>-.1&&Number.isFinite(h.severMesh.position.length()));
 remove(h);h=make();
}
remove(h);ok('静止物の衝突履歴を疎な形式で保持',F.world.collisionMatrix instanceof CANNON.ObjectCollisionMatrix);
const corpses=[];for(let n=0;n<12;n++){h=make();h.die('x',1);h.update({dt:1/60,scene:M.scene});F.sever(h,{part:n%2?'arms':'legs',side:1,dir:new THREE.Vector3(1,0,0)});corpses.push(h);}
ok('同時に12体倒しても崩れる前に直立で凍結しない',F.ragdolls.every(r=>!r.frozen));ok('凍結しても倒れた姿は残る',corpses.every(h=>h.root.parent===M.scene&&h.severMesh.parent===M.scene));
const frameTimes=[];for(let n=0;n<120;n++){const t=performance.now();F.update(1/60);frameTimes.push(performance.now()-t);}frameTimes.sort((a,b)=>a-b);
R.push('INFO 12体分離後の物理演算 p50='+frameTimes[60].toFixed(2)+' ms / p95='+frameTimes[114].toFixed(2)+' ms; 分離処理最大='+Math.max(...timings).toFixed(2)+' ms');
for(let n=0;n<120;n++)F.update(1/60);ok('脱力後は動的な死体を6体まで減らす',F.ragdolls.filter(r=>!r.frozen).length<=6);
for(let n=0;n<380;n++)F.update(1/60);ok('停止後は死体の物理計算を終了',F.ragdolls.every(r=>r.frozen)&&F.world.bodies.every(b=>b.mass===0));
for(const h of corpses)remove(h);
const variants=new Set(G.Enemies.list.map(e=>e.body.gear?.userData.variant||'none'));ok('敵に素顔・ヘルメット・サングラス・両方が混在',variants.size===4,[...variants].join(','));
ok('頭装備の材質が身体の変形を無効化しない',G.Enemies.list.every(e=>e.body.mesh.material.every(m=>m.skinning)&&(!e.body.gear||e.body.gear.children.every(m=>!m.material.skinning))));
 G.Audio.makeVoiceBank();ok('敵の声は人間の録音バッファを使用',G.Audio.voiceBank.hurt===G.Audio.playerVoiceBank.hurt&&G.Audio.voiceBank.death===G.Audio.playerVoiceBank.death);
 ok('敵に10種類の固定した声質を割り当てる',G.Audio.enemyVoiceProfiles.length===10&&new Set(G.Audio.enemyVoiceProfiles.map(p=>p.rate+'|'+p.eq+'|'+p.hz)).size===10);
const A=G.Audio,pos=new THREE.Vector3(12,1,12);const first=A.voice(pos,'hurt',1,1,'test');const repeat=A.voice(pos,'hurt',1,1,'test');ok('連続被弾で同じ敵の声が重ならない',!!first&&!repeat);const dying=A.voice(pos,'death',1,1,'test');ok('死亡時は被弾音声を置き換える',!!dying&&A.enemyVoiceState.get('test').source===dying&&A.enemyVoiceActive.size===1);
for(let i=0;i<20;i++)A.voice(pos,'pain',1,1,'crowd'+i);ok('敵の同時発声は最大6体',A.enemyVoiceActive.size===6);
A.stopEnemyVoices();ok('リスタートで敵の発声を解放',A.enemyVoiceActive.size===0&&A.enemyVoiceState.size===0);
M.reset();M.dismember=true;G.Input.enabled=true;
for(const weapon of ['ar','pistol','shotgun']){
 M.reset();M.state='playing';G.Input.enabled=true;M.dismember=true;G.Enemies.list.forEach((e,i)=>{e.pos.set(40+i,0,30);e.update=()=>{};});
 const e=G.Enemies.list[0];e.pos.set(12.5,0,5.5);e.syncModel(1/60);e.rayHit=()=>e.dead?null:{t:2,part:'arms',side:1};
 G.Player.pos.set(12.5,0,2.5);G.Player.yaw=Math.PI;G.Player.pitch=0;G.Player.camInit=false;G.Player.cur=weapon;G.Player.update(.001,[],{dx:0,dy:0,wheel:0});G.Player.shoot();e.syncModel(1/60);
 ok(weapon+'：部位分離はショットガンのみに適用',!!e.body.severMesh===(weapon==='shotgun'));
}
M.reset();return R.join('\n');
})()

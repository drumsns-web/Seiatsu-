// Current behavior tests. Run from tests/run.html (localhost).
(async()=>{
const R=[], ok=(n,c,v)=>R.push((c?'PASS ':'FAIL ')+n+(v!==undefined?' ['+v+']':''));
const P=G.Player,I=G.Input,T=G.Touch,M=G.Game,W=G.World;
M.reset();M.state='playing';M.fullscreen=false;I.enabled=true;G.Enemies.list.forEach(e=>e.update=()=>{});G.Menu.show(null);
const key=(code,type='keydown',repeat=false)=>window.dispatchEvent(new KeyboardEvent(type,{code,repeat,bubbles:true,cancelable:true}));
const place=()=>{I.clear();P.pos.set(12,0,12);P.vel.set(0,0,0);P.grounded=true;P.posture='stand';P.eyeH=1.64;P.yaw=Math.PI;P.pitch=0;P.camInit=false;P.update(.0001,[],{dx:0,dy:0,wheel:0});};
place();key('Space');M.step(1);ok('Spaceで床から離れる',P.pos.y>0&&!P.grounded,P.pos.y);
const first=P.vel.y;key('Space','keyup');key('Space');M.step(1);ok('空中で再ジャンプしない',P.vel.y<first);
M.step(90);ok('押し続けても着地後に自動再ジャンプしない',P.grounded&&P.pos.y===0);key('Space','keyup');
let ceiling=new THREE.Vector3(12,W.CEIL-1.85,12);let cv=W.moveVertical(ceiling,.2,.3,1.8);ok('天井で上昇が止まる',cv.hitCeiling&&ceiling.y<=W.CEIL-1.8+1e-5);
P.pos.set(26.5,0,8.5);P.posture='crouch';P.grounded=true;P.jump();ok('低いダクトの下では跳べない',P.posture==='crouch'&&P.grounded);
place();M.wheelMode='weapon';I.mouse.wheel=1;M.step(1);ok('通常時ホイールで武器切替',P.cur==='pistol');
P.switchWeapon('ar');M.step(60);I.mouse.rmb=true;M.step(20);const zoom=P.zoom;I.mouse.wheel=-1;M.step(1);ok('右クリック照準中のホイールで倍率変更',P.cur==='ar'&&P.zoom===zoom+.5);I.mouse.rmb=false;
place();key('KeyW');key('KeyX');M.step(20);ok('Xで通常の20%の忍び歩き',P.walkSlow&&P.walkK===.2&&Math.hypot(P.vel.x,P.vel.z)<.7,Math.hypot(P.vel.x,P.vel.z));key('KeyX','keyup');M.step(1);ok('Xを離すと通常歩行',!P.walkSlow);key('KeyW','keyup');
T.setMode('on');G.Menu.show(null);place();T.sync();
const pointer=(target,type,id,x=0,y=0)=>target.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',button:0,clientX:x,clientY:y,bubbles:true,cancelable:true}));
const b=a=>document.querySelector('[data-touch="'+a+'"]');const box=T.stick.getBoundingClientRect();
pointer(T.stick,'pointerdown',1,box.left+box.width/2,box.top+2);
pointer(T.canvas,'pointerdown',2,400,150);pointer(window,'pointermove',2,420,155);
pointer(b('fire'),'pointerdown',3);const ammo=P.ammo,yaw=P.yaw;M.step(1);
ok('3本指で移動・視点・射撃を同時操作',T.move.y<-.9&&P.yaw!==yaw&&P.ammo<ammo);
pointer(window,'pointercancel',3);ok('指キャンセルで射撃停止',!T.isDown('fire'));
pointer(b('jump'),'pointerdown',4);M.step(1);ok('画面ボタンでジャンプ',P.pos.y>0);pointer(window,'pointerup',4);
pointer(b('ads'),'pointerdown',5);pointer(window,'pointerup',5);ok('タッチ照準は切り替え式',T.isDown('ads'));
pointer(b('grenade'),'pointerdown',6);M.step(1);const gren=P.grenades;pointer(window,'pointercancel',6);M.step(1);ok('指キャンセルで手榴弾を勝手に投げない',!P.gHold&&P.grenades===gren);
M.pause();ok('一時停止で全タッチ入力を解除',T.pointers.size===0&&T.held.size===0&&T.move.y===0&&T.root.hidden);
M.begin();ok('タッチはマウス固定なしで再開',M.state==='playing'&&!document.pointerLockElement&&!T.root.hidden);T.setMode('off');
// Eye remains outside walls under both lean directions and a full turn.
I.clear();P.pos.set(8.02,0,2.5);P.vel.set(0,0,0);P.posture='stand';P.eyeH=1.64;P.lean=-1;P.camInit=false;
let bad=0,maxYawError=0;for(let i=0;i<360;i++){P.yaw=i*Math.PI/180;P.update(1/60,[],{dx:0,dy:0,wheel:0});const c=G.camera.position;if(W.overlapsSolid(c.x,c.z,.12,.24,c.y-.12))bad++;const d=G.camera.getWorldDirection(new THREE.Vector3());maxYawError=Math.max(maxYawError,Math.abs(Math.atan2(-d.x,-d.z)-Math.atan2(Math.sin(P.yaw),Math.cos(P.yaw))));}
ok('壁際で360度回転してもカメラが壁に入らない',bad===0,bad);ok('衝突処理が視線の方角を変えない',maxYawError<.01,maxYawError);
place();P.setPosture('prone');P.update(1/60,['leanL'],{dx:0,dy:0,wheel:0});for(let i=0;i<35;i++)P.update(1/60,[],{dx:0,dy:0,wheel:0});
ok('匍匐中に左リーンできる',P.posture==='prone'&&P.lean===-1&&Math.abs(P.leanOff)>.15&&G.camera.position.y<.5,P.leanOff.toFixed(2));
P.update(1/60,['leanR'],{dx:0,dy:0,wheel:0});for(let i=0;i<35;i++)P.update(1/60,[],{dx:0,dy:0,wheel:0});
ok('匍匐中に右リーンへ切り替えられる',P.lean===1&&P.leanOff>.15,P.leanOff.toFixed(2));
P.update(1/60,['leanR'],{dx:0,dy:0,wheel:0});ok('匍匐中も同じリーン操作で解除',P.lean===0);
P.pos.set(8.02,0,2.5);P.vel.set(0,0,0);P.eyeH=.34;P.lean=-1;P.camInit=false;bad=0;maxYawError=0;
for(let i=0;i<360;i++){P.yaw=i*Math.PI/180;P.update(1/60,[],{dx:0,dy:0,wheel:0});const c=G.camera.position;if(W.overlapsSphere(c.x,c.y,c.z,.13))bad++;const d=G.camera.getWorldDirection(new THREE.Vector3());maxYawError=Math.max(maxYawError,Math.abs(Math.atan2(-d.x,-d.z)-Math.atan2(Math.sin(P.yaw),Math.cos(P.yaw))));}
ok('匍匐リーンで壁際を振り向いても視点が壁に入らない',bad===0,bad);ok('匍匐リーンでも視線の方角がずれない',maxYawError<.01,maxYawError);
place();G.Viewmodel.setOptic('dot');P.adsT=1;P.ads=true;
G.Viewmodel.update({dt:1/60,time:1,moveSpeed:.5,sprint:false,ads:1,posture:1,lean:1,mdx:20,mdy:10,bobPhase:1,wall:0,strafe:1});
const sight=new THREE.Vector3(0,.108,-.049).applyMatrix4(G.Viewmodel.pivot.matrixWorld).project(G.Viewmodel.cam);ok('ドットサイト中心が画面中央と一致',Math.abs(sight.x)<.001&&Math.abs(sight.y)<.001,sight.x+','+sight.y);
G.Audio.init();G.Audio.preparePlayerVoice();G.Audio.prepareSurfaceSteps();ok('人間の録音4種＋死亡音声を読み込める',G.Audio.playerVoiceBank.hurt.length===4&&G.Audio.playerVoiceBank.death.length===1);
ok('床素材5種・各4パターンの足音',Object.keys(G.Audio.surfaceSteps).length===5&&Object.values(G.Audio.surfaceSteps).every(x=>x.length===4));
ok('木床・金属床・通常床で素材判定が変わる',G.Surfaces.at(11,12)==='wood'&&G.Surfaces.at(7,6.5)==='metal'&&G.Surfaces.at(12,5)==='concrete');
const hit={x:15.43,y:1.4,z:4.5,nx:-1,ny:0,nz:0},dir=new THREE.Vector3(1,0,0);
for(const [weapon,count]of[['shotgun',2],['ar',6],['pistol',9]]){G.Destruction.reset();let broke=false;G.Effects.impact(hit,false,'wood');for(let n=1;n<=count;n++){broke=G.Destruction.damage(15,4,hit,weapon,dir);if(n<count)ok(weapon+' '+n+'発目は壁を保持',!broke);}ok(weapon+' '+count+'発で穴が開く',broke);const ray=W.raycast(14,1.4,4.5,1,0,0,2);ok(weapon+'の穴は見た目だけでなく射線が通る',!ray);if(weapon==='shotgun'){ok('木壁の穴は円形に近く角には壁が残る',!!W.raycast(14,1.8,4.9,1,0,0,2));ok('開いた穴の中に弾痕を残さない',!G.Effects.decals.some(m=>Math.abs(m.position.y-hit.y)<.1&&Math.abs(m.position.z-hit.z)<.1&&Math.abs(m.position.x-hit.x)<.1));}}
ok('破片は物理ボディとして落下する',G.Physics.debris.length>0);const debris=G.Physics.debris[0],dy=debris.body.position.y;for(let i=0;i<90;i++)G.Physics.update(1/60);ok('破片に重力・床衝突',debris.body.position.y<dy&&debris.body.position.y>-.1,debris.body.position.y);
let h=G.Humanoid.create();M.scene.add(h.root);h.root.position.set(12,0,12);h.update({dt:1/60,speed:0,crouch:0,aim:0,aimPitch:0,twist:0,reload:-1,scene:M.scene});h.die('x',1);h.update({dt:1/60,scene:M.scene});
ok('16剛体・15関節のラグドール',h.ragdoll.parts.size===16&&h.ragdoll.joints.length===15,h.ragdoll.parts.size+','+h.ragdoll.joints.length);
ok('撃たれた瞬間だけ姿勢を保つ',h.ragdoll.phase==='resisting');
for(let i=0;i<20;i++)G.Physics.update(1/60);ok('0.3秒ほどで完全に力が抜ける（重く崩れ落ちる）',h.ragdoll.phase==='limp'&&h.st.lifeStrength===0);
for(let i=0;i<260;i++)G.Physics.update(1/60);ok('時間とともに完全に脱力する',h.ragdoll.phase==='limp'&&h.st.lifeStrength===0);
const points=[...h.ragdoll.parts.values()].map(p=>p.body.position);ok('ラグドールの位置が有限で床をすり抜けない',points.every(p=>Number.isFinite(p.x+p.y+p.z)&&p.y>-.15),Math.min(...points.map(p=>p.y)));
G.Physics.removeRagdoll(h);M.scene.remove(h.root);h.dispose();h=G.Humanoid.create();M.scene.add(h.root);h.root.position.set(12,0,12);h.update({dt:1/60,speed:0,crouch:0,aim:0,aimPitch:0,twist:0,reload:-1,scene:M.scene});h.die('x',1);h.update({dt:1/60,scene:M.scene});
M.dismember=false;G.Physics.sever(h,{part:'arms',side:1,dir});ok('吹き飛びオフでは部位を切り離さない',!h.severMesh&&h.ragdoll.joints.length===15);
M.dismember=true;G.Physics.sever(h,{part:'arms',side:1,dir});const piece=G.Physics.pieces.find(p=>p.h===h&&p.key==='armL');
ok('欠損オンで腕が独立・関節を解除',!!h.severMesh&&!!piece&&h.ragdoll.joints.length===12&&h.ragdoll.parts.size===13&&!h.ragdoll.parts.has('uaL'));
const arm=piece.body.position.clone();for(let i=0;i<40;i++)G.Physics.update(1/60);ok('外れた部位が物理演算で落ちる',arm.distanceTo(piece.body.position)>.2&&piece.body.position.y<arm.y);
G.Physics.removeRagdoll(h);M.scene.remove(h.root);h.dispose();M.reset();ok('リスタートで破片・ラグドール・壁を復元',G.Physics.ragdolls.length===0&&G.Physics.debris.length===0&&W.raycast(14,1.4,4.5,1,0,0,2));
return R.join('\n');
})()

'use strict';
// Original two-distance throwing motion, using a private copy of the licensed FPS arm.
// Projectile collision, local sound and investigation remain owned by Casing18.
(()=>{
 const G=window.G,T=THREE,C=G.Casing18,P=G.Player,VM=G.Viewmodel,V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),Q=()=>new T.Quaternion();
 const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),ease=v=>{v=clamp(v);return v*v*(3-2*v);};
 const A=G.CasingThrow24={action:null,ready:false,threshold:.32,errors:[],releaseCount:0,
  modes:{under:{release:.26,duration:.78,speed:4,up:1.7},over:{release:.72,duration:1.38,speed:9,up:2.2}},grenadeReleaseCount:0,overReady:false};
 A.cloneArm=function(){
  const N=G.FPSNative,source=N.arms,copies=new Map();
  function copy(o){if(o===N.gun)return null;const n=o.clone(false);copies.set(o,n);for(const child of o.children){const c=copy(child);if(c)n.add(c);}return n;}
  this.group=new T.Group();this.group.name='Casing24-native-right-arm';this.model=copy(source);this.group.add(this.model);VM.root.add(this.group);this.group.rotation.y=Math.PI;
  this.bones={};this.rest=[];this.meshes=[];source.traverse(o=>{const n=copies.get(o);if(!n)return;if(n.isBone){this.bones[n.name]=n;this.rest.push({bone:n,p:n.position.clone(),q:n.quaternion.clone(),s:n.scale.clone()});}
   if(o.isSkinnedMesh){const bones=o.skeleton.bones.map(b=>copies.get(b)),skeleton=new T.Skeleton(bones,o.skeleton.boneInverses.map(m=>m.clone()));n.bind(skeleton,o.bindMatrix.clone());
    const geo=o.geometry.clone(),si=geo.attributes.skinIndex,sw=geo.attributes.skinWeight,indices=geo.index?.array||Array.from({length:geo.attributes.position.count},(_,i)=>i),kept=[];
    const divisor=sw.normalized?(sw.array instanceof Uint8Array?255:65535):1;if(divisor!==1)geo.setAttribute('skinWeight',new T.Float32BufferAttribute(Array.from(sw.array,w=>w/divisor),4));
    const right=i=>{let weight=0;for(let k=0;k<4;k++){const bone=bones[si.array[i*4+k]];if(bone&&/_r$/.test(bone.name))weight+=sw.array[i*4+k]/divisor;}return weight>.5;};
    for(let i=0;i<indices.length;i+=3)if(right(indices[i])&&right(indices[i+1])&&right(indices[i+2]))kept.push(indices[i],indices[i+1],indices[i+2]);
    geo.setIndex(kept);geo.clearGroups();n.geometry=geo;n.frustumCulled=false;n.visible=kept.length>0;n.name='Casing24-'+o.material.name;this.meshes.push(n);
   }
  });
  this.upper=this.bones.upperarm_r;this.lower=this.bones.lowerarm_r;this.hand=this.bones.hand_r;if(!this.upper||!this.lower||!this.hand)throw Error('FPS right arm bones unavailable');
  this.upperLength=this.lower.position.length();this.lowerLength=this.hand.position.length();this.group.updateMatrixWorld(true);
  this.baseHandQ=this.hand.getWorldQuaternion(Q());this.fingerRest=this.rest.filter(r=>/^(index|middle|ring|pinky|thumb)_\d+_r$/.test(r.bone.name));
  const skeleton=this.meshes[0].skeleton;for(const r of this.fingerRest){const i=skeleton.bones.indexOf(r.bone),parent=skeleton.bones.indexOf(r.bone.parent);r.openQ=Q().setFromRotationMatrix(skeleton.boneInverses[parent].clone().multiply(skeleton.boneInverses[i].clone().invert()));}
  this.held=new T.Mesh(N.casingGeometry||G.Effects.casingGeo.ar,N.casingMaterials||G.Effects.casingMat.ar);this.held.name='Casing24-held-empty-case';this.held.frustumCulled=false;this.hand.add(this.held);this.held.position.set(-.147,.016,.065);this.held.rotation.z=Math.PI/2;this.held.scale.setScalar(1);
  this.group.visible=false;this.ready=true;
 };
 A.worldQ=function(bone,q){bone.quaternion.copy(bone.parent.getWorldQuaternion(Q()).invert().multiply(q));bone.updateMatrixWorld(true);};
 A.aimBone=function(bone,child,target){const p=bone.getWorldPosition(V()),from=child.getWorldPosition(V()).sub(p).normalize(),to=target.clone().sub(p).normalize(),delta=Q().setFromUnitVectors(from,to);this.worldQ(bone,delta.multiply(bone.getWorldQuaternion(Q())));};
 A.pose=function(target,open=0,over=0,weight=1){
  if(!this.ready)return;for(const r of this.rest){r.bone.position.copy(r.p);r.bone.quaternion.copy(r.q);r.bone.scale.copy(r.s);}this.group.position.set(0,0,0);this.group.rotation.set(0,Math.PI,0);this.group.updateMatrixWorld(true);
  const shoulder=V(.28,-.29,.09);this.group.position.copy(shoulder.clone().sub(this.upper.getWorldPosition(V())));this.group.updateMatrixWorld(true);
  const dir=target.clone().sub(shoulder),distance=clamp(dir.length(),.08,this.upperLength+this.lowerLength-.008);dir.normalize();target=shoulder.clone().addScaledVector(dir,distance);
  const bend=V(1,-.5,.15).addScaledVector(dir,-V(1,-.5,.15).dot(dir)).normalize(),a=this.upperLength,b=this.lowerLength,along=(a*a-b*b+distance*distance)/(2*distance),elbow=shoulder.clone().addScaledVector(dir,along).addScaledVector(bend,Math.sqrt(Math.max(0,a*a-along*along)));
  this.aimBone(this.upper,this.lower,elbow);this.aimBone(this.lower,this.hand,target);
  const handQ=this.baseHandQ.clone();handQ.premultiply(Q().setFromAxisAngle(V(0,0,1),-.35+over*.55));handQ.premultiply(Q().setFromAxisAngle(V(1,0,0),-.35+over*.4));handQ.multiply(Q().setFromAxisAngle(V(1,0,0),-1.55+over*.4));const fingers=V(-1,0,0).applyQuaternion(handQ),direction=target.clone().sub(elbow).normalize().lerp(V(0,.12,-1).normalize(),.3).normalize();handQ.premultiply(Q().setFromUnitVectors(fingers,direction));const restHand=this.rest.find(r=>r.bone===this.hand);this.worldQ(this.lower,handQ.clone().multiply(restHand.q.clone().invert()));this.aimBone(this.lower,this.hand,target);this.worldQ(this.hand,handQ);
  for(const r of this.fingerRest)r.bone.quaternion.copy(r.q).slerp(r.openQ,open*.93);
  this.group.position.y-=.65*(1-weight);this.group.visible=weight>.001;this.held.visible=!!this.action&&!this.action.released;this.group.updateMatrixWorld(true);
 };
 // User-supplied authored grenade motion, sampled on this existing private arm.
 // Cache local transforms once: repeated hold samples cannot be lost to mixer cache.
 A.capturePose=function(){const data=new Float32Array(this.rest.length*10);this.rest.forEach((r,i)=>{const n=i*10;r.bone.position.toArray(data,n);r.bone.quaternion.toArray(data,n+3);r.bone.scale.toArray(data,n+7);});return data;};
 A.readPose=function(data,index,out){const n=index*10;out.p.fromArray(data,n);out.q.fromArray(data,n+3);out.s.fromArray(data,n+7);return out;};
 A.loadOver=async function(){
  const start=performance.now(),response=await fetch('assets/motions/user-grenade-arm.json');if(!response.ok)throw Error('Current-arm throw motion '+response.status);const data=await response.json(),clip=T.AnimationClip.parse(data.clip),mixer=new T.AnimationMixer(this.model),action=mixer.clipAction(clip);
  action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();this.overSamples=[];
  for(let i=0;i<=63;i++){mixer.setTime(2.2+(4.05-2.2)*i/63);this.overSamples.push(this.capturePose());}mixer.stopAllAction();mixer.uncacheRoot(this.model);
  this.pose(V(.2,-.15,-.42),0,.65,1);const fingers=this.overSamples[36];for(const r of this.fingerRest)r.bone.quaternion.fromArray(fingers,this.rest.indexOf(r)*10+3);this.overHold=this.capturePose();
  this.poseScratch=[{p:V(),q:Q(),s:V()},{p:V(),q:Q(),s:V()},{p:V(),q:Q(),s:V()}];
  this.overAnchor=V(.35,-.16,.04);this.placeOver(this.overHold,this.overHold,0,0,this.overAnchor,1);
  const local=name=>this.hand.worldToLocal(this.bones[name].getWorldPosition(V()));this.overGrip=local('thumb_03_r').add(local('index_02_r')).add(local('middle_02_r')).multiplyScalar(1/3);
  this.grenadeProps={};for(const kind of ['frag','flash','smoke']){const prop=G.Equipment.held[kind].clone(true);prop.name='Current-arm-held-'+kind;prop.position.copy(this.overGrip);prop.quaternion.identity();prop.scale.setScalar(1);prop.visible=false;this.hand.add(prop);this.grenadeProps[kind]=prop;}
  this.group.visible=false;this.held.visible=false;this.overReady=true;this.overPreparation={source:data.source,tracks:clip.tracks.length,samples:this.overSamples.length,bones:this.rest.length,bytes:this.overSamples.reduce((s,a)=>s+a.byteLength,0),ms:performance.now()-start};
 };
 A.placeOver=function(from,to,blend,open,anchor,weight,pitch=0){
  const scratch=this.poseScratch;this.rest.forEach((r,i)=>{const a=this.readPose(from,i,scratch[0]),b=this.readPose(to,i,scratch[1]);r.bone.position.copy(a.p).lerp(b.p,blend);r.bone.quaternion.copy(a.q).slerp(b.q,blend);r.bone.scale.copy(a.s).lerp(b.s,blend);});
  for(const r of this.fingerRest)r.bone.quaternion.slerp(r.openQ,open*.93);
  this.group.position.set(0,0,0);this.group.rotation.set(0,Math.PI,0);this.group.updateMatrixWorld(true);if(pitch)this.worldQ(this.upper,Q().setFromAxisAngle(V(1,0,0),pitch).multiply(this.upper.getWorldQuaternion(Q())));
  this.group.position.copy(anchor.clone().sub(this.upper.getWorldPosition(V())));this.group.position.y-=.65*(1-weight);this.group.visible=weight>.001;this.group.updateMatrixWorld(true);
 };
 A.overPose=function(a){
  const throwing=a.phase==='throw',t=throwing?a.t:0,blend=throwing?ease(t/.2):a.kind==='case'?ease((a.held-this.threshold)/.18):1,open=throwing?ease((t-this.modes.over.release+.035)/.09):0;
  let from=a.overFrom||this.overHold,to=this.overHold,pitch=0,anchor=(a.overAnchorFrom||this.overAnchor).clone().lerp(this.overAnchor,blend);
  if(throwing){const x=clamp(t/1.05)*63,i=Math.min(62,Math.floor(x)),k=x-i,A=this.overSamples[i],B=this.overSamples[i+1],sample=this.overBlendData||(this.overBlendData=new Float32Array(A.length));for(let j=0;j<this.rest.length;j++){const p=this.readPose(A,j,this.poseScratch[1]),q=this.readPose(B,j,this.poseScratch[2]),n=j*10;p.p.lerp(q.p,k).toArray(sample,n);p.q.slerp(q.q,k).toArray(sample,n+3);p.s.lerp(q.s,k).toArray(sample,n+7);}to=sample;pitch=.75*blend;}
  const returning=throwing?ease((t-.95)/.43):0,weight=ease((a.total-.1)/.16)*(1-returning),lower=ease(a.total/.18)*(1-returning);a.currentAnchor=anchor.clone();this.placeOver(from,to,blend,open,anchor,weight,pitch);
  if(a.kind==='case'){this.held.position.copy(a.gripFrom||this.overGrip).lerp(this.overGrip,blend);this.held.visible=!a.released;}else this.held.visible=false;
  for(const [kind,prop]of Object.entries(this.grenadeProps))prop.visible=a.kind==='grenade'&&kind===a.throwableKind&&!a.released;
  if(throwing&&t>=this.modes.over.release&&!a.released)this.release(a);return{weight,lower,complete:throwing&&t>=this.modes.over.duration};
 };
 A.grenadeReady=()=>A.ready&&A.overReady&&!A.action;
 A.grenadeInputBlocked=function(){if(this.blockGrenadeUntilUp&&!G.Input.isDown('grenade')&&!G.Input.mouse.mmb&&!G.Pad.grenade)this.blockGrenadeUntilUp=false;return!!this.blockGrenadeUntilUp;};
 A.grenadeHold=function(on){if(!on){if(this.action?.kind==='grenade')this.cancel('grenade-cancel');return false;}if(!this.grenadeReady())return false;const kind=G.Equipment.selected;if(G.Equipment.count(kind)<=0)return false;
  this.action={kind:'grenade',throwableKind:kind,phase:'hold',held:0,t:0,total:0,mode:'over',released:false};P.ads=false;P.fireQueueT=0;VM.state.ads=0;C.lowerUntil=0;return true;
 };
 A.grenadeThrow=function(){const a=this.action;if(a?.kind!=='grenade'||a.phase!=='hold')return null;a.overFrom=this.capturePose();a.overAnchorFrom=this.overAnchor.clone();a.phase='throw';a.t=0;return{kind:a.throwableKind,release:this.modes.over.release};};
 A.projectilePoint=function(prop,radius){
  this.group.updateWorldMatrix(true,true);VM.cam.updateMatrixWorld(true);const viewPoint=prop.getWorldPosition(V()),ndc=viewPoint.clone().project(VM.cam),local=VM.cam.worldToLocal(viewPoint.clone()),cam=G.camera;cam.updateMatrixWorld(true);
  local.x*=VM.cam.projectionMatrix.elements[0]/cam.projectionMatrix.elements[0];local.y*=VM.cam.projectionMatrix.elements[5]/cam.projectionMatrix.elements[5];const origin=cam.localToWorld(local),raw=origin.clone(),delta=origin.clone().sub(cam.position),length=delta.length(),direction=delta.clone().normalize(),right=V(1,0,0).applyQuaternion(cam.quaternion),up=V(0,1,0).applyQuaternion(cam.quaternion);let limit=length;
  for(const offset of [V(),right.clone().multiplyScalar(radius),right.clone().multiplyScalar(-radius),up.clone().multiplyScalar(radius),up.clone().multiplyScalar(-radius)]){const start=cam.position.clone().add(offset),hit=G.World.raycast(start.x,start.y,start.z,direction.x,direction.y,direction.z,length+radius);if(hit){const inward=-(direction.x*hit.nx+direction.y*hit.ny+direction.z*hit.nz),clearance=(cam.position.x-hit.x)*hit.nx+(cam.position.y-hit.y)*hit.ny+(cam.position.z-hit.z)*hit.nz;if(inward>1e-7)limit=Math.min(limit,Math.max(0,(clearance-radius-.003)/inward));}}
  if(limit<length)origin.copy(cam.position).addScaledVector(direction,limit);return{origin,raw,viewPoint,ndc,clamped:limit<length};
 };
 A.grenadeOrigin=function(){const a=this.action;return a?.kind==='grenade'?this.projectilePoint(this.grenadeProps[a.throwableKind],.04).origin:null;};
 A.lowerWeapon=function(lower){
  for(const rig of [G.FPSNative.rig,...Object.values(G.FPSOther?.states||{}).map(s=>s.rig),...Object.values(G.FPSExtra10?.states||{}).map(s=>s.rig)])if(rig?.visible)rig.position.y-=lower*.95;
  if(VM.pivot.visible){VM.pivot.position.y-=lower*.95;VM.rArm.g.visible=VM.lArm.g.visible=false;}VM.gHandG.visible=VM.gArm.g.visible=false;
 };
 A.cancel=function(reason='cancel'){const a=this.action;if(a)C.record({type:'cancel',kind:a.kind||'case',reason,released:a.released});if(a?.kind==='grenade'){if(G.Input.isDown('grenade')||G.Input.mouse.mmb||G.Pad.grenade)this.blockGrenadeUntilUp=true;P.gHold=false;P.throwPending=0;P.throwPendingType=null;P.nativeThrowPending=false;VM.state.gHold=false;VM.state.gThrowT=-1;VM.state.gK=0;G.Grenades.preview(null);}this.action=null;if(this.group)this.group.visible=false;for(const p of Object.values(this.grenadeProps||{}))p.visible=false;C.lowerUntil=0;VM.state.lowered=!!P.treat;if(reason==='reset')this.blockGrenadeUntilUp=false;};
 const oldBusy=C.busy;C.busy=()=>!!A.action&&(A.action.kind!=='grenade'||A.action.phase!=='hold')||oldBusy();
 const ensure=C.ensure;C.ensure=function(){ensure.call(this);if(G.FPSNative.casingGeometry)for(const c of this.pool){c.mesh.geometry=G.FPSNative.casingGeometry;c.mesh.material=G.FPSNative.casingMaterials;}};
 C.request=function(edges=[]){if(A.action||G.time<this.nextThrow)return false;if(!this.available(edges)){G.HUD.msg('現在の操作が終わってから薬きょうを投げてください',1.5);return false;}
  if(!A.ready||!A.overReady){G.HUD.msg('投げる腕と動作の読込をお待ちください',1.5);return false;}
  A.held.position.set(-.147,.016,.065);A.action={kind:'case',phase:'hold',held:0,t:0,total:0,mode:'under',released:false};P.ads=false;P.fireQueueT=0;VM.state.ads=0;this.lowerUntil=0;
  this.record({type:'prepare'});G.HUD.msg('短押し：近くへ下投げ ／ 長押しして離す：遠くへ上投げ',2);return true;
 };
 A.release=function(a){if(a.released)return;a.released=true;const grenade=a.kind==='grenade',prop=grenade?this.grenadeProps[a.throwableKind]:this.held,point=this.projectilePoint(prop,grenade?.04:C.radius),cam=G.camera;
  if(grenade){const kind=G.Equipment.consume(a.throwableKind);P.nativeThrowPending=false;P.throwPending=0;P.throwPendingType=null;prop.visible=false;if(!kind){G.HUD.msg('投てき物がなくなったため投げる動作を中止しました');return;}const g=G.Grenades.throw(point.origin,P.throwVelocity(),true,kind);this.grenadeReleaseCount++;G.Audio.grenadeThrow();G.HUD.weapons();C.record({type:'grenade-release',kind,point:g.p.toArray(),visualPoint:point.raw.toArray(),viewNDC:point.ndc.toArray(),clamped:point.clamped});return;}
  const mode=this.modes[a.mode],forward=V(0,0,-1).applyQuaternion(cam.quaternion),velocity=forward.multiplyScalar(mode.speed).add(V(P.vel.x*.25,mode.up,P.vel.z*.25)),c=C.spawn(point.origin,velocity);c.throwMode=a.mode;C.nextThrow=G.time+C.interval;this.releaseCount++;C.record({type:'release',id:c.id,mode:a.mode,point:point.origin.toArray(),visualPoint:point.raw.toArray(),viewNDC:point.ndc.toArray(),clamped:point.clamped,velocity:velocity.toArray()});this.held.visible=false;G.HUD.msg(a.mode==='over'?'薬きょう：遠くへ上投げ':'薬きょう：近くへ下投げ',1);
 };
 A.frame=function(dt){const a=this.action;if(!a){if(this.group)this.group.visible=false;return;}if(P.dead||G.Game.deathCam){this.cancel('death');return;}if(G.Game.state!=='playing'){this.cancel('state');return;}a.total+=dt;
  if(a.kind==='grenade'){if(a.phase==='hold'){if(!P.gHold){this.cancel('hold-ended');return;}a.held+=dt;}else a.t+=dt;const state=this.overPose(a);if(state.complete){this.cancel('complete');return;}this.lowerWeapon(state.lower);return;}
  const holding=G.Input.isDown('casingThrow');if(a.phase==='hold'){a.held+=dt;if(a.held>=this.threshold&&a.mode!=='over'){a.mode='over';a.overFrom=this.capturePose();a.overAnchorFrom=V(.28,-.29,.09);a.gripFrom=this.held.position.clone();G.HUD.msg('上投げの構え：キーを離すと遠くへ投げます',5);}if(!holding){a.phase='throw';a.t=0;if(a.mode==='over'){a.overFrom=this.capturePose();a.overAnchorFrom=(a.currentAnchor||V(.28,-.29,.09)).clone();a.gripFrom=this.held.position.clone();}}else a.t=0;}else a.t+=dt;
  if(a.mode==='over'){const state=this.overPose(a);if(state.complete){this.cancel('complete');return;}this.lowerWeapon(state.lower);return;}
  // Existing near underhand path, timing, velocity and hearing are retained.
  const target=V(.20,-.22,-.39),mode=this.modes.under;let open=0,weight=ease(a.total/.16);if(a.phase==='throw'){target.lerp(V(.10,-.08,-.47),ease(a.t/mode.release));open=ease((a.t-mode.release+.045)/.09);weight*=1-ease((a.t-mode.release-.18)/(mode.duration-mode.release-.18));if(a.t>mode.release+.1)target.y-=ease((a.t-mode.release-.1)/.3)*.25;this.pose(target,open,0,weight);if(a.t>=mode.release&&!a.released)this.release(a);if(a.t>=mode.duration){this.cancel('complete');return;}}else this.pose(target,0,0,weight);this.lowerWeapon(weight);
 };
 const update=VM.update;VM.update=function(st){const active=!!A.action,nativeGrenade=A.action?.kind==='grenade',saved=nativeGrenade?{gHold:this.state.gHold,gThrowT:this.state.gThrowT,gK:this.state.gK}:null;if(active){this.state.lowered=false;this.state.lowK=0;}if(saved){this.state.gHold=false;this.state.gThrowT=-1;this.state.gK=0;}let r;try{r=update.call(this,st);}finally{if(saved)Object.assign(this.state,saved);}if(active){A.frame(st.dt);this.state.lowered=!!A.action||!!P.treat;}return r;};
 const playerUpdate=P.update;P.update=function(dt,edges,mouse){if(A.action){if(this.dead||this.treat||G.Doors.manual||G.Squad.active||G.Inventory.active)A.cancel('other-action');else if(A.action.kind==='grenade'){if(edges.some(a=>['w1','w2','w3','treat','treatAlt','assist','knife','suppressor','command','moveOrder','interact','doorLock'].includes(a)))A.cancel('input-action');}else edges=edges.filter(a=>['jump','crouch','prone','leanL','leanR','flashlight','laser','debug'].includes(a));}return playerUpdate.call(this,dt,edges,mouse);};
 const reset=C.reset;C.reset=function(){A.cancel('reset');A.releaseCount=0;A.grenadeReleaseCount=0;return reset.apply(this,arguments);};
 const pause=G.Game.pause;G.Game.pause=function(){A.cancel('pause');return pause.apply(this,arguments);};
 const inventoryOpen=G.Inventory.open;G.Inventory.open=function(){const r=inventoryOpen.apply(this,arguments);if(r&&this.active)A.cancel('inventory');return r;};
 addEventListener('blur',()=>A.cancel('blur'));
 const init=VM.init;VM.init=function(renderer){const r=init.call(this,renderer);A.promise=G.FPSNative.promise.then(async()=>{if(!G.FPSNative.ready)throw Error('FPS source not ready');A.cloneArm();await A.loadOver();G.FPSNative.status.textContent=G.FPSNative.status.textContent.replace('治療・投てき等は従来表示です。','空薬きょう・手りゅう弾は現在の腕を使用。投てきの上投げは提供された動作を使用しています。治療等は従来表示です。');}).catch(e=>{A.errors.push(e.message);console.error('Casing throw arm:',e);});return r;};
 G.ACTIONS.find(a=>a.id==='casingThrow').label='空薬きょう（短押し：近く／長押し：遠く）';
 const initEquip=G.Equipment.init;G.Equipment.init=function(scene){const r=initEquip.call(this,scene);const panel=document.getElementById('panel-controls');if(panel){for(const p of panel.querySelectorAll('p'))if(p.textContent.startsWith('空の薬きょうを投げる：'))p.textContent='空の薬きょう：初期キー6（キー設定で変更可）。短く押して離すと近くへ下投げ、0.32秒以上長押しして離すと遠くへ上投げ。手を離す瞬間に射出します。照準の向きで投げる方向を決めます。ポーズや画面切替は投げ動作を中止。着地音を聞いた近くの敵だけが音の付近を調べ、草・カーペットや壁越しでは届きにくくなります。所持数制限なし・弾薬消費なし。';}return r;};
})();

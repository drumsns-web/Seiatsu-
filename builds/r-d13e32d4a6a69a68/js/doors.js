// Hinged room doors. The same oriented panel is used for movement, sight and bullets.
'use strict';
(function(){
 const G=window.G,T=THREE,HALF=.055,HEIGHT=2.2,MAX=Math.PI/2;
 const plans={
  facility:[...[[4,7,2],[11,7,2],[19,7,2],[36,7,2],[49,7,2]].map(p=>['x',...p,-1]),...[[4,10,2],[12,10,2],[40,10,1],[50,10,2],[5,31,2],[16,31,1],[36,31,2],[41,31,1],[49,31,2]].map(p=>['x',...p,1]),...[[3,13,1],[3,20,1],[3,25,1]].map(p=>['z',...p,1])],
  office:[...[13,22,31,40,49].map(x=>['x',x,7,2,-1]),...[6,18,30,44].map(x=>['x',x,10,2,1]),...[5,20,33].map(x=>['x',x,30,2,1]),['x',47,18,2,1]],
  hotel:[...[3,9,15,21,27,33,39,45].map(x=>['x',x,7,1,-1]),...[3,9,15,21,27,33,39,45].map(x=>['x',x,28,1,1])],
  parking:[['z',7,30,2,-1],['z',40,28,2,1]],
  ruins:[['z',10,8,1,-1],['x',40,9,2,-1],['x',55,11,1,-1],['x',45,32,1,1],['x',26,34,1,1]],
 };
 const D=G.Doors={groups:[],leaves:[],plans,choice:null,placementReport:[]};
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function axes(l,angle=l.angle){const a=l.base+l.turn*angle;return{u:Math.cos(a),v:Math.sin(a)};}
 function local(l,x,z,angle){const a=axes(l,angle),dx=x-l.hx,dz=z-l.hz;return{x:dx*a.u+dz*a.v,z:-dx*a.v+dz*a.u,a};}
 function contact(l,x,z,r,angle=l.angle,height=1.8,feet=0){
  if(l.broken||Math.abs(x-l.hx)>l.width+r||Math.abs(z-l.hz)>l.width+r)return null;const p=local(l,x,z,angle);
  for(const raw of l.solids||[[0,.025,-HALF,l.width,HEIGHT-.025,HALF]]){const b=G.Fracture.bodyBox(raw,height,feet);if(!b)continue;
  if(b[1]>=feet+height||b[4]<=feet+.025)continue;
  const cx=clamp(p.x,b[0],b[3]),cz=clamp(p.z,b[2],b[5]),dx=p.x-cx,dz=p.z-cz,dd=dx*dx+dz*dz;
  if(dd>=r*r-1e-8)continue;
  if(dd>1e-10){const len=Math.sqrt(dd),k=(r-len)/len;return{x:(dx*p.a.u-dz*p.a.v)*k,z:(dx*p.a.v+dz*p.a.u)*k};}
  const distances=[p.x-b[0],b[3]-p.x,p.z-b[2],b[5]-p.z],i=distances.indexOf(Math.min(...distances)),push=r+distances[i]+.0001;
  return{x:(i===0?-p.a.u:i===1?p.a.u:i===2?p.a.v:-p.a.v)*push,z:(i===0?-p.a.v:i===1?p.a.v:i===2?-p.a.u:p.a.u)*push};
  }return null;
 }
 function intersectsBox(l,b,angle){
  if(b[1]>=HEIGHT||b[4]<=.03)return false;
  const a=axes(l,angle),cx=l.hx+a.u*l.width/2,cz=l.hz+a.v*l.width/2,dx=(b[0]+b[3])/2-cx,dz=(b[2]+b[5])/2-cz,ex=(b[3]-b[0])/2,ez=(b[5]-b[2])/2,w=l.width/2;
  return Math.abs(dx)<ex+Math.abs(a.u)*w+Math.abs(a.v)*HALF-.004&&Math.abs(dz)<ez+Math.abs(a.v)*w+Math.abs(a.u)*HALF-.004&&Math.abs(dx*a.u+dz*a.v)<w+ex*Math.abs(a.u)+ez*Math.abs(a.v)-.004&&Math.abs(-dx*a.v+dz*a.u)<HALF+ex*Math.abs(a.v)+ez*Math.abs(a.u)-.004;
 }
 function wallClear(l){
  const W=G.World;
  for(let step=0;step<=24;step++)for(let z=Math.floor(l.hz-l.width-1);z<=Math.ceil(l.hz+l.width+1);z++)for(let x=Math.floor(l.hx-l.width-1);x<=Math.ceil(l.hx+l.width+1);x++){
   for(const {b} of W.boxes(x,z))if(intersectsBox(l,b,step/24*MAX))return false;
  }return true;
 }
 function makeLeaf(group,right,start,length){
  const ux=group.axis==='x'?1:0,uz=group.axis==='z'?1:0,sg=right?-1:1;
  return{group,hx:group.x+ux*(start+(right?length-.065:.065)),hz:group.z+uz*(start+(right?length-.065:.065)),width:length-.07,base:Math.atan2(uz*sg,ux*sg),turn:Math.sign(ux*sg*group.nz-uz*sg*group.nx),angle:0,broken:false,hp:120};
 }
 D.init=function(scene){
  this.scene=scene;const W=G.World;
  const wood=W.surfaceMaterial('wood','door'),metal=new T.MeshStandardMaterial({color:0x777b7a,roughness:.45,metalness:.7});
  const add=(parent,w,h,d,x,y,z,mat)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;parent.add(m);return m;};
  for(const [axis,x,z,width,side] of plans[W.mapId]||[]){
   const ux=axis==='x'?1:0,uz=axis==='z'?1:0;
   const group={id:this.groups.length,axis,cellX:x,cellZ:z,x:x+(axis==='z'?.5:0),z:z+(axis==='x'?.5:0),width,nx:axis==='z'?side:0,nz:axis==='x'?side:0,target:0,speed:MAX/.55,blocked:false,leaves:[]};
   if(Array.from({length:width},(_,i)=>W.SOLID[W.cell(x+ux*i,z+uz*i)]).some(Boolean)){this.placementReport.push({x,z,axis,accepted:false,reason:'occupied opening'});continue;}
   const leaves=width===2?[makeLeaf(group,false,0,1),makeLeaf(group,true,1,1)]:[makeLeaf(group,false,0,width)];
   if(width===1&&!wallClear(leaves[0]))leaves[0]=makeLeaf(group,true,0,width);
   if(!leaves.every(wallClear)){this.placementReport.push({x,z,axis,accepted:false,reason:'blocked swing; original passage preserved'});continue;}
   this.groups.push(group);group.material='wood';group.finish='paint';group.leaves=leaves;group.initialLocked=(x+z*3)%7===0;group.locked=group.initialLocked;
   const frame=new T.Group();frame.position.set(group.x,0,group.z);frame.rotation.y=axis==='z'?-Math.PI/2:0;scene.add(frame);
   add(frame,.07,HEIGHT,.18,.025,HEIGHT/2,0,metal);add(frame,.07,HEIGHT,.18,width-.025,HEIGHT/2,0,metal);add(frame,width,.1,.18,width/2,HEIGHT+.05,0,metal);
   for(const l of leaves){
    l.mesh=new T.Group();scene.add(l.mesh);l.material=wood;l.pieces=[];l.solids=[[0,.025,-HALF,l.width,HEIGHT-.025,HALF]];this.renderSolids(l);
    for(const sign of [-1,1]){add(l.mesh,.13,.025,.035,l.width-.12,1.02,sign*.075,metal);add(l.mesh,.035,.15,.012,l.width-.14,1.02,sign*.062,metal);}
    for(const y of [.25,1.85])add(l.mesh,.035,.12,.15,.018,y,0,metal);
    l.handles=l.mesh.children.filter(m=>m.material===metal&&m.position.x>l.width-.25);this.leaves.push(l);this.sync(l);
   }
   this.placementReport.push({x,z,axis,width,side,accepted:true});
  }
  this.installWorldHooks();this.installUI();
 };
 D.sync=function(l){
  const a=axes(l);l.mesh.position.set(l.hx,0,l.hz);l.mesh.rotation.y=-(l.base+l.turn*l.angle);l.mesh.visible=!l.broken;
  if(l.physics){l.physics.position.set(l.hx+a.u*l.width/2,HEIGHT/2,l.hz+a.v*l.width/2);l.physics.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),-(l.base+l.turn*l.angle));l.physics.collisionResponse=!l.broken;l.physics.aabbNeedsUpdate=true;}
 };
 D.renderSolids=function(l){for(const m of l.pieces){l.mesh.remove(m);m.geometry.dispose();}l.pieces=[];if(l.solids.length){const m=new T.Mesh(G.Fracture.geometry(l.solids,0,HEIGHT),l.material);m.castShadow=m.receiveShadow=true;l.mesh.add(m);l.pieces.push(m);}this.rebuildPhysics(l);G.SurfaceDamage17?.clearUnsupportedMarks({object:l,door:true});if(!this.resetting&&G.Lamps?.field?.ready){G.Illumination14?.invalidate();G.Lamps.field.markGeometry(l.group);}};
 D.rebuildPhysics=function(l){if(!l.physics)return;const p=l.physics,previous=l.physicsPartsBody===p?l.physicsParts:new Map(),keep=new Set(l.solids),next=new Map();for(const [b,shape]of previous)if(!keep.has(b))p.removeShape(shape);for(const b of l.solids){let shape=previous.get(b);if(!shape){shape=G.Fracture.physicsShape(b);p.addShape(shape,G.Fracture.physicsOffset(b,l.width/2,HEIGHT/2,0));}next.set(b,shape);}l.physicsParts=next;l.physicsPartsBody=p;p.aabbNeedsUpdate=true;};
 D.initPhysics=function(){for(const l of this.leaves){const body=new CANNON.Body({mass:0,type:CANNON.Body.KINEMATIC});G.Physics.world.addBody(body);l.physics=body;this.rebuildPhysics(l);this.sync(l);}};
 D.overlaps=function(x,z,r,h,feet=0){return feet<HEIGHT&&feet+h>.03&&this.leaves.some(l=>contact(l,x,z,r,l.angle,h,feet));};
 D.resolve=function(pos,r,h,feet=0){if(feet>=HEIGHT||feet+h<=.03)return;for(let i=0;i<4;i++){let changed=false;for(const l of this.leaves){const c=contact(l,pos.x,pos.z,r,l.angle,h,feet);if(c){pos.x+=c.x;pos.z+=c.z;changed=true;}}if(!changed)break;}};
 D.raycast=function(ox,oy,oz,dx,dy,dz,maxDist){
  let best=null;for(const l of this.leaves){if(l.broken)continue;const p=local(l,ox,oz),lx=dx*p.a.u+dz*p.a.v,lz=-dx*p.a.v+dz*p.a.u;
   for(const b of l.solids){const h=G.Fracture.ray(b,p.x,oy,p.z,lx,dy,lz);
   if(h&&h.t<=maxDist&&(!best||h.t<best.t))best={t:h.t,tExit:h.tExit,x:ox+dx*h.t,y:oy+dy*h.t,z:oz+dz*h.t,nx:h.nx*p.a.u-h.nz*p.a.v,ny:h.ny,nz:h.nx*p.a.v+h.nz*p.a.u,cx:-1,cz:-1,door:l,rayLocal:{o:[p.x,oy,p.z],d:[lx,dy,lz],b}};
   }
  }return best;
 };
 D.installWorldHooks=function(){
  const W=G.World,ray=W.raycast,overlap=W.overlapsSolid,sphere=W.overlapsSphere,point=W.pointInSolid,move=W.moveCircle;
  this.staticOverlap=overlap;this.staticRay=ray;
  W.raycast=(...args)=>{const a=ray(...args),b=this.raycast(...args);return b&&(!a||b.t<a.t)?b:a;};
  W.overlapsSolid=(x,z,r,h,y=0)=>overlap(x,z,r,h,y)||this.overlaps(x,z,r,h,y);
  W.pointInSolid=(x,z,h,y=0)=>point(x,z,h,y)||this.overlaps(x,z,.001,h,y);
  W.overlapsSphere=(x,y,z,r)=>sphere(x,y,z,r)||this.leaves.some(l=>{if(l.broken)return false;const p=local(l,x,z);return l.solids.some(b=>{return G.Fracture.sphere(b,p.x,y,p.z,r);});});
  W.moveCircle=(pos,mx,mz,r,h,y=0)=>{
   const n=Math.max(1,Math.ceil(Math.hypot(mx,mz)/Math.min(.08,r*.45)));
   for(let i=0;i<n;i++){const x=pos.x,z=pos.z;move(pos,mx/n,mz/n,r,h,y);this.resolve(pos,r,h,y);if(overlap(pos.x,pos.z,r,h,y)||this.overlaps(pos.x,pos.z,r-.0001,h,y)){pos.x=x;pos.z=z;}}
  };
 };
 D.actors=function(){return[G.Player,...G.Enemies?.list||[],...G.Allies?.list||[]].filter(a=>a&&!a.dead&&a.pos);};
 // Door order permission applies to this exact target, never to generic follow/move.
 D.orderPermit=(actor,g)=>actor?.task?.kind==='door'&&actor.task.group===g&&actor.task.phase==='approach'&&['open','lock'].includes(actor.task.action);
 D.standClear=function(g,p,r=.34){for(const l of g.leaves)if(!l.broken)for(let i=0;i<=16;i++)if(contact(l,p.x,p.z,r,MAX*i/16,1.8,0))return false;return true;};
 D.orderLineClear=function(a,b,g,ignoreTarget){const length=Math.hypot(b.x-a.x,b.z-a.z),n=Math.max(1,Math.ceil(length/.18));for(let i=0;i<=n;i++){const x=a.x+(b.x-a.x)*i/n,z=a.z+(b.z-a.z)*i/n;if(this.staticOverlap(x,z,.32,1.8))return false;for(const l of this.leaves)if(!(ignoreTarget&&l.group===g)&&contact(l,x,z,.32,l.angle,1.8,0))return false;}return true;};
 D.request=function(group,open,mode='fast',actor=G.Player){
  if(open&&G.Allies?.list.includes(actor)&&!this.orderPermit(actor,group))return false;
  if(open&&(group.locked||(group.quickOnly&&mode==='slow')))return false;
  if(!group.leaves.some(l=>!l.broken))return false;
  group.target=open?MAX:0;group.speed=MAX/(mode==='slow'?2.8:.85);group.blocked=false;
  const at=new T.Vector3(group.x+(group.axis==='x'?group.width/2:0),1,group.z+(group.axis==='z'?group.width/2:0));
  // Enemies recognise routine door use by their own patrol; player/ally noises remain suspicious.
  if(!G.Enemies?.list.includes(actor))G.Enemies?.broadcast(at,mode==='slow'?2:14,'step',actor===G.Player,actor);
  G.Audio?.door?.(at,mode==='slow');
  return true;
 };
 D.selfReason=function(g){const P=G.Player;if(P.dead||P.treat||P.reloading||P.gHold||P.throwPending>0||P.attachT>0||P.switchT>0||P.knifeT>=0)return'現在の動作を終えてから扉を操作してください';if(!g||!this.groups.includes(g)||g!==this.target()||this.center(g).distanceTo(P.pos)>2.45||!g.leaves.some(l=>!l.broken))return'近くの操作する扉に照準を合わせてください';return null;};
 D.adjustManualWheel=function(group,wheel){group.target=clamp(group.target-wheel*Math.PI/36,0,MAX);group.speed=MAX/2.8;const at=new T.Vector3(group.x,1,group.z);if(!Number.isFinite(this.lastManualSound)||G.time-this.lastManualSound>.25){G.Audio?.door?.(at,true);G.Enemies?.broadcast(at,2,'step',true,G.Player);this.lastManualSound=G.time;}};
 D.menuWheel=function(g,wheel){if(!G.Squad?.active||G.Squad.menuActor!=='self')return false;const reason=this.selfReason(g);if(reason){G.HUD.msg(reason);return false;}if(g.locked||g.quickOnly){G.HUD.msg(g.locked?'施錠中は扉を動かせません':'ノブが壊れた扉はクイック開閉のみ可能です');return false;}if(!this.manual?.fromMenu||this.manual.group!==g){this.cancel();this.manual={group:g,fromMenu:true};}this.adjustManualWheel(g,wheel);return true;};
 D.selfAction=function(action,g=this.target()){
  const P=G.Player,fail=text=>{G.HUD?.msg(text);return false;};
  if(!['open','slow','close','lock','unlock','pick'].includes(action))return false;
  const reason=this.selfReason(g);if(reason)return fail(reason);
  if(action==='lock'||action==='unlock'){
   if(!this.lockHardwareOK(g))return fail('ノブか扉が壊れているため施錠できません');
   if(!this.inside(g))return fail('施錠・解錠は室内側から行います');
   if(P.crippled||P.legLost)return fail('現在は施錠操作できません');
   this.cancel();
   if(action==='unlock'){const ok=this.setInteriorLock(g,false,P);return ok?(G.HUD.msg('内側から解錠しました'),true):fail(this.lastLockError);}
   if(g.locked&&g.interiorLocked)return true;
   if(g.target<=.025&&g.leaves.every(l=>l.angle<=.025)){const ok=this.setInteriorLock(g,true,P);return ok?(G.HUD.msg('内側から施錠しました'),true):fail(this.lastLockError);}
   if(!this.request(g,false,'slow',P))return fail('扉を閉められません');
   this.playerOrder={group:g,start:G.time,damageSerial:P.damageSerial};G.HUD.msg('扉を閉めてから内側より施錠します。移動・射撃・被弾で中断');return true;
  }
  this.cancel();
  if(action==='pick'){if(!g.locked)return fail('この扉は解錠済みです');this.choice=g;this.choicePanel.hidden=false;this.choose('fast');return !!this.picking;}
  if(action!=='close'&&g.locked)return fail('施錠されています。解錠またはピッキングを選んでください');
  const ok=this.request(g,action!=='close',action==='slow'?'slow':'fast',P);return ok||fail(g.quickOnly?'ノブが壊れた扉はクイック開閉のみ可能です':'扉を操作できません');
 };
 D.updatePlayerOrder=function(){const task=this.playerOrder;if(!task)return;const g=task.group,P=G.Player,I=G.Input;
  const stop=text=>{this.playerOrder=null;if(text)G.HUD.msg(text);};
  if(G.Game.state!=='playing'||P.dead||P.crippled||P.legLost||P.treat||P.reloading||P.gHold||P.throwPending>0||P.knifeT>=0||P.damageSerial!==task.damageSerial||I.mouse.lmb||G.Pad.fire||['forward','back','left','right','jump','fire'].some(a=>I.isDown(a))||Math.hypot(G.Pad.move.x,G.Pad.move.y)>.15||Math.hypot(G.Touch.move.x,G.Touch.move.y)>.15)return stop('施錠操作を中断しました');
  if(!this.groups.includes(g)||!this.lockHardwareOK(g)||!this.inside(g)||this.center(g).distanceTo(P.pos)>2.45)return stop('扉から離れた、または扉が壊れたため施錠を中断しました');
  if(G.time-task.start>7)return stop('人や物があり、扉を閉められません');
  if(g.target>.025)return stop('別の操作で扉が開かれたため施錠を中断しました');
  if(g.leaves.some(l=>l.angle>.025))return;
  const ok=this.setInteriorLock(g,true,P);stop(ok?'閉めて内側から施錠しました':this.lastLockError);
 };
 D.update=function(dt){
   if(this.picking){const p=this.picking;if(this.pickInvalid(p)){this.cancel();G.HUD?.msg('ピッキングを中断しました');}else{p.time+=dt;this.choicePanel.querySelector('.door-keys').textContent='解錠中… '+Math.min(100,Math.round(p.time/(p.group.pickDuration||5)*100))+'% ／ '+(p.hold?G.keyName(G.Input.binds.interact)+'を離すと中断':'移動・射撃で中断')+' ／ マウスで周囲を確認';if(p.time>=(p.group.pickDuration||5)){p.group.locked=false;this.cancel();G.HUD?.msg('解錠しました。短押しで開けられます');}}}
  const actors=this.actors();
  for(const group of this.groups){group.blocked=false;for(const l of group.leaves){
   if(l.broken||Math.abs(l.angle-group.target)<.00001)continue;
   const change=clamp(group.target-l.angle,-group.speed*dt,group.speed*dt),n=Math.max(1,Math.ceil(Math.abs(change)/.02));
   for(let i=0;i<n;i++){const next=clamp(l.angle+change/n,0,MAX);if(actors.some(a=>{if((a.pos.y||0)>=HEIGHT)return false;const r=(a===G.Player?G.Player.radius||.3:.3)+.015,c=contact(l,a.pos.x,a.pos.z,r,next);if(!c)return false;const previous=contact(l,a.pos.x,a.pos.z,r,l.angle);return!previous||c.x*previous.x+c.z*previous.z<0||Math.hypot(c.x,c.z)>Math.hypot(previous.x,previous.z)+1e-7;})){group.blocked=true;break;}l.angle=next;}
   this.sync(l);
  }}
  this.updatePlayerOrder();
  this.updateLatchAttempts();
  this.updatePrompt();
 };
 D.orderEvents=[];D.doorEvent=function(kind,g,actor,extra={}){this.orderEvents.push({kind,group:g.id,actor:actor?.id,time:G.time,...extra});if(this.orderEvents.length>80)this.orderEvents.shift();};
 // Fictional balance: a suspicious/combat enemy makes four local latch impacts,
 // beginning at3 seconds then every2 seconds. Steel does not gain a fake key.
 D.workLocked=function(g,actor,dt){
  let work=g.aiWork;if(!work||G.time-work.last>.5||work.actor.dead)work=g.aiWork={actor,t:0,last:G.time,step:-1,nextSound:0,nextImpact:3,impacts:0};if(work.actor!==actor)return true;
  if(work.step!==G.time){work.t+=Math.max(0,Math.min(dt,.1));work.step=G.time;}work.last=G.time;
  const at=this.center(g).setY(1.02),alert=actor.alertT>0||['combat','chase','search','investigate','cover','flank'].includes(actor.state);
  if(work.t>=work.nextSound){G.Audio.lockRattle?.(at,false);work.nextSound=work.t+.7+Math.random()*.35;}
  if(g.material==='steel'||!alert)return true;
  if(work.t>=work.nextImpact){const leaf=g.leaves.find(l=>!l.broken&&!l.knobBroken);if(!leaf)return true;const a=axes(leaf),x=leaf.width-.13,hit={x:leaf.hx+a.u*x,y:1.02,z:leaf.hz+a.v*x};work.nextImpact+=2;work.impacts++;G.Audio.lockRattle?.(at,true);this.damageLatch(leaf,6,hit);this.doorEvent('latch-impact',g,actor,{impacts:work.impacts,locked:g.locked});}
  return !!g.locked;
 };
 D.beforeMove=function(actor,nx,nz,dt){
  const len=Math.hypot(nx,nz);if(len<.001||actor.dead)return false;let hit;for(const y of[.45,1.1,1.7]){hit=this.raycast(actor.pos.x,y,actor.pos.z,nx/len,0,nz/len,1.9);if(hit)break;}if(!hit)return false;
  const g=hit.door.group;if(g.leaves.every(l=>l.broken||l.angle>MAX-.02)){if(hit.t>.65)return false;const a=axes(hit.door);G.World.moveCircle(actor.pos,a.u*dt*1.8,a.v*dt*1.8,.3,actor.crippled?.6:1.8);return true;}
  if(hit.t>1.25)return false;const ally=G.Allies.list.includes(actor);
  if(ally){if(!this.orderPermit(actor,g))return true;if(g.locked){if(!this.inside(g,actor.pos)||!this.setInteriorLock(g,false,actor))return true;}}
  else if(g.locked){if(!G.Enemies.list.includes(actor)||this.workLocked(g,actor,dt))return true;}
  if(g.target!==MAX)this.request(g,true,'fast',actor);const side=(actor.pos.x-g.x)*g.nx+(actor.pos.z-g.z)*g.nz;if(side>-.05&&side<1.28){G.World.moveCircle(actor.pos,g.nx*dt*1.5,g.nz*dt*1.5,.3,actor.crippled?.6:1.8);return true;}return false;
 };
 D.updateLatchAttempts=function(){for(const g of this.groups){if(g.aiWork&&(g.aiWork.actor.dead||G.time-g.aiWork.last>.5||!g.locked))g.aiWork=null;const active=!!g.aiWork;if(!active&&!g.handleRattling)continue;g.handleRattling=active;for(const l of g.leaves)for(const h of l.handles||[]){h.userData.latchRestZ??=h.rotation.z;h.rotation.z=h.userData.latchRestZ+(active?Math.sin(G.time*43+g.id)*.09:0);}}};
 D.damageLatch=function(l,amount,hit){
  if(!l||l.broken||l.knobBroken||l.group.material==='steel'||!Number.isFinite(amount)||amount<=0)return false;
  const p=local(l,hit.x,hit.z);if(Math.abs(p.x-(l.width-.13))>=.14||Math.abs(hit.y-1.02)>=.16)return false;
  l.knobDamage=(l.knobDamage||0)+amount;if(l.knobDamage<24)return false;
  l.knobBroken=true;for(const m of l.handles||[])m.visible=false;
  if(l.group.locked){l.group.locked=l.group.interiorLocked=false;l.group.quickOnly=true;G.HUD?.msg('ドアノブを破壊：この扉はクイック開放のみ');}return true;
 };
 D.damage=function(l,amount,hit,weapon){
  if(!l||l.broken||amount<=0)return false;
  const key=weapon==='rifle'||weapon==='sniper'?'ar':weapon;
  if(key==='ar'||key==='pistol'||key==='shotgun')return (G.SurfaceDamage17?.single({...hit,door:l},key,null,.3,amount)?.removedArea||0)>0;
  this.damageLatch(l,amount,hit);const p=local(l,hit.x,hit.z);
  // Explosions keep their independent local fracture path.
  l.hitDamage=(l.hitDamage||0)+amount;if(l.hitDamage<32)return false;l.hitDamage=0;
  const blast=amount>100,hw=blast?.46:amount>=60?.28:.14,hh=blast?.62:amount>=60?.34:.18;
  const hole=G.Fracture.hole(p.x,hit.y,hw,hh,p.x*11+hit.y*7,true);
  const ux=Math.min(...hole.map(v=>v[0])),vx=Math.max(...hole.map(v=>v[0])),uy=Math.min(...hole.map(v=>v[1])),vy=Math.max(...hole.map(v=>v[1])),near=[],far=[];
  for(const b of l.solids)(b[3]<ux||b[0]>vx||b[4]<uy||b[1]>vy?far:near).push(b);
  const result=G.Fracture.subtract(near,hole);if(result.removed<=1e-8)return;l.solids=far.concat(result.boxes);
  const area=poly=>Math.abs(poly.reduce((sum,a,i)=>{const b=poly[(i+1)%poly.length];return sum+a[0]*b[1]-b[0]*a[1];},0)/2);
  l.remainingArea=l.solids.reduce((sum,b)=>sum+area(b.poly),0);l.hp=120*l.remainingArea/(l.width*(HEIGHT-.05));
  if(l.remainingArea<l.width*(HEIGHT-.05)*.06){l.broken=true;l.solids=[];G.Physics?.splinters?.(new T.Vector3(hit.x,Math.max(.3,hit.y),hit.z),new T.Vector3(l.group.nx,.1,l.group.nz));}
  this.renderSolids(l);this.sync(l);G.Audio?.woodBreak?.(new T.Vector3(hit.x,hit.y,hit.z));G.Enemies?.invalidateCover?.();
  if(l.broken&&(this.choice===l.group||this.manual?.group===l.group))this.cancel();
 };

 D.blast=function(c,r){for(const l of this.leaves){if(l.broken)continue;const p=local(l,c.x,c.z),x=clamp(p.x,0,l.width),y=clamp(c.y,.2,HEIGHT),z=clamp(p.z,-HALF,HALF),wx=l.hx+p.a.u*x-p.a.v*z,wz=l.hz+p.a.v*x+p.a.u*z,dist=Math.hypot(wx-c.x,y-c.y,wz-c.z);if(dist>=r)continue;const obstruction=this.staticRay(c.x,c.y,c.z,(wx-c.x)/(dist||1),(y-c.y)/(dist||1),(wz-c.z)/(dist||1),dist);if(!obstruction||obstruction.t>=dist-.05)this.damage(l,180*(1-dist/r)+45,{x:wx,y,z:wz});}};
 D.reset=function(){G.SurfaceDamage17?.reset();this.resetting=true;try{this.cancel();this.lastManualSound=-Infinity;this.orderEvents=[];for(const g of this.groups){g.target=0;g.blocked=false;g.locked=g.initialLocked;g.quickOnly=false;g.aiUnlock=0;g.aiWork=null;g.orderClaim=null;g.handleRattling=false;}for(const l of this.leaves){l.angle=0;l.hp=120;l.hitDamage=0;l.knobDamage=0;l.knobBroken=false;for(const m of l.handles||[]){m.visible=true;m.rotation.z=m.userData.latchRestZ??m.rotation.z;}l.broken=false;l.solids=[[0,.025,-HALF,l.width,HEIGHT-.025,HALF]];this.renderSolids(l);this.sync(l);}}finally{this.resetting=false;}};
 D.clearSpawn=function(pos){if(!G.World.overlapsSolid(pos.x,pos.z,.32,1.8))return;for(let r=1;r<5;r++)for(let z=-r;z<=r;z++)for(let x=-r;x<=r;x++){const px=Math.floor(pos.x)+x+.5,pz=Math.floor(pos.z)+z+.5;if(G.World.walkable(Math.floor(px),Math.floor(pz))&&!G.World.overlapsSolid(px,pz,.32,1.8)){pos.x=px;pos.z=pz;return;}}};
 D.target=function(){
  const cam=G.camera;if(!cam)return null;const origin=cam.position,dir=cam.getWorldDirection(new T.Vector3());let best=null,dist=2.5;
  for(const l of this.leaves){if(l.broken||Math.abs(origin.x-l.hx)>l.width+2.5||Math.abs(origin.z-l.hz)>l.width+2.5)continue;const p=local(l,origin.x,origin.z),x=clamp(p.x,.05,l.width-.05),y=clamp(origin.y,.5,1.8),z=clamp(p.z,-HALF,HALF),at=new T.Vector3(l.hx+p.a.u*x-p.a.v*z,y,l.hz+p.a.v*x+p.a.u*z),v=at.sub(origin),d=v.length();if(d>=dist||d<.01||v.normalize().dot(dir)<.65)continue;const block=G.World.raycast(origin.x,origin.y,origin.z,v.x,v.y,v.z,d);if(block&&block.door?.group!==l.group&&block.t<d-.08)continue;best=l.group;dist=d;}
  return best;
 };
  D.movementInput=function(){const I=G.Input;return ['forward','back','left','right','jump'].some(a=>I.isDown(a))||Math.hypot(G.Pad?.move.x||0,G.Pad?.move.y||0)>.15||Math.hypot(G.Touch?.move.x||0,G.Touch?.move.y||0)>.15;};
  D.walkRequested=function(){return G.Input.isDown('interact')&&this.movementInput();};
  D.pickInvalid=function(p){const P=G.Player;return P.dead||P.damageSerial!==p.damageSerial||G.Input.mouse.lmb||G.Pad?.fire||G.Input.isDown('fire')||this.movementInput()||(p.hold&&!G.Input.isDown('interact'))||!this.groups.includes(p.group)||!p.group.leaves.some(l=>!l.broken)||this.center(p.group).distanceTo(P.pos)>2.45;};
  D.beginPicking=function(group,hold){this.choice=group;this.choicePanel.hidden=false;this.picking={group,time:0,damageSerial:G.Player.damageSerial,hold};};
  D.interact=function(){
    if(this.picking){this.cancel();return;}
    // A press used for movement never opens a nearby door on release.
    if(this.movementInput()){this.press={group:null,time:0,consumed:true};return;}
    const group=this.target(),reason=this.selfReason(group);if(reason){G.HUD?.msg(reason);return;}
    this.press={group,time:0,consumed:false};
  };
  D.control=function(dt,mouse){
    const I=G.Input,P=G.Player,held=I.isDown('interact');
    if(this.picking){if(this.pickInvalid(this.picking)){this.cancel();G.HUD?.msg('ピッキングを中断しました');return false;}return true;}
    if(this.press){const p=this.press;
      if(!held){this.press=null;if(!p.consumed&&p.group){if(p.group.locked)G.HUD?.msg(G.keyName(I.binds.interact)+'を押し続けるとピッキングを開始します');else this.request(p.group,!p.group.leaves.some(l=>!l.broken&&l.angle>.12),'fast');}return false;}
      if(this.movementInput()){p.consumed=true;return false;}if(p.consumed)return false;
      if(P.dead||!this.groups.includes(p.group)||this.center(p.group).distanceTo(P.pos)>2.45){this.cancel();return false;}
      p.time+=dt;
      if(p.group.locked){if(mouse.wheel)mouse.wheel=0;if(p.time>=.35){this.press=null;this.beginPicking(p.group,true);return true;}}
      else if(!p.group.quickOnly&&(p.time>=.35||mouse.wheel)){this.manual={group:p.group};this.press=null;}
      else if(p.group.quickOnly&&mouse.wheel){mouse.wheel=0;G.HUD?.msg('ノブが壊れた扉は短押しのクイック開閉のみ可能です');}
    }
    if(!this.manual)return false;const group=this.manual.group;
    if(!held||P.dead||!this.groups.includes(group)||this.center(group).distanceTo(P.pos)>2.45){this.cancel();return false;}
    if(this.movementInput()){this.cancel();this.press={group:null,time:0,consumed:true};return false;}
    if(mouse.wheel){this.adjustManualWheel(group,mouse.wheel);mouse.wheel=0;}
    return true;
  };
  D.choose=function(mode){const g=this.choice;if(this.picking)return;if(g?.locked){if(mode==='fast')this.beginPicking(g,false);else{this.cancel();G.HUD?.msg('銃で木製ドアを撃つと穴が開き、破壊できます');}return;}this.cancel();if(g)this.request(g,true,mode);};
  D.cancel=function(){if(this.manual?.group){const g=this.manual.group;g.target=g.leaves.find(l=>!l.broken)?.angle||0;}this.playerOrder=null;this.press=null;this.manual=null;this.choice=null;this.picking=null;if(this.hint)this.hint.hidden=true;if(this.choicePanel)this.choicePanel.hidden=true;};
 D.installUI=function(){
  const style=document.createElement('style');style.textContent='#door-hint{position:fixed;left:50%;top:61%;transform:translateX(-50%);color:#f5dfac;background:#10181bda;padding:8px 14px;border-radius:4px;pointer-events:none;z-index:9;font-size:13px}#door-choice{position:fixed;left:50%;top:55%;transform:translate(-50%,-50%);z-index:25;background:#182025f2;border:1px solid #69736d;border-radius:6px;padding:18px 24px;text-align:center;color:#e5e8dc}#door-choice[hidden],#door-hint[hidden]{display:none}#door-choice button{margin:10px 5px;padding:14px 18px;color:#e5e8dc;background:#384641;border:1px solid #849483;border-radius:3px}#door-choice small{display:block;color:#aeb9ac}';document.head.appendChild(style);
  this.hint=document.createElement('div');this.hint.id='door-hint';this.hint.hidden=true;document.body.appendChild(this.hint);
  this.choicePanel=document.createElement('section');this.choicePanel.id='door-choice';this.choicePanel.hidden=true;this.choicePanel.setAttribute('aria-label','ドアの開け方');this.choicePanel.innerHTML='<strong>ドアの開け方</strong><div><button data-door-mode="fast">一気に開ける<small>大きい音・約0.6秒</small></button><button data-door-mode="slow">ゆっくり開ける<small>小さい音・約2.8秒</small></button></div><small class="door-keys"></small>';document.body.appendChild(this.choicePanel);
  for(const b of this.choicePanel.querySelectorAll('button'))b.onclick=()=>this.choose(b.dataset.doorMode);
 };
 D.updatePrompt=function(){if(!this.hint)return;const playing=G.Game?.state==='playing'&&!G.Player?.dead;if(!playing){this.hint.hidden=true;this.cancel();return;}
  if(this.choice){if(!this.picking)this.choicePanel.querySelector('.door-keys').textContent=G.keyName(G.Input.binds.w1)+(this.choice.locked?'：ピッキング ／ ':'：一気に ／ ')+G.keyName(G.Input.binds.w2)+(this.choice.locked?'：射撃に戻る ／ ':'：ゆっくり ／ ')+G.keyName(G.Input.binds.interact)+'：取消';this.hint.hidden=true;return;}
  if(this.manual){this.hint.hidden=false;this.hint.textContent='ドア操作中：ホイール上で開く／下で閉じる ・ 操作ボタンを離すと終了';return;}const g=this.target();this.hint.hidden=!g;if(g)this.hint.textContent=g.quickOnly?G.keyName(G.Input.binds.interact)+'：クイック開閉のみ（ノブ破損）':g.blocked?'扉が人に当たっています。少し離れてください':G.keyName(G.Input.binds.interact)+(g.locked?'：長押しでピッキング／離すと中断':g.leaves.some(l=>!l.broken&&l.angle>.12)?'：短押しで閉める／長押し＋ホイールで調整':'：短押しで開く／長押し＋ホイールで調整');
 };
})();

'use strict';
// A small, local sound clue. This never sends the thrower's identity or position to AI.
(()=>{
 const G=window.G,T=THREE,P=G.Player,V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
 const C=G.Casing18={pool:[],next:0,nextThrow:0,lowerUntil:0,events:[],serial:0,
  capacity:12,lifetime:20,interval:1.2,radius:.024,
  hearing:{concrete:6,metal:7,wood:5,carpet:1.8,grass:1.6}};
 C.busy=()=>G.time<C.lowerUntil;
 C.record=function(event){this.events.push({time:G.time,...event});if(this.events.length>120)this.events.shift();};
 C.ensure=function(){if(this.pool.length)return;for(let i=0;i<this.capacity;i++){
  const mesh=new T.Mesh(G.Effects.casingGeo.ar,G.Effects.casingMat.ar);mesh.visible=false;mesh.castShadow=false;G.Game.scene.add(mesh);
  this.pool.push({mesh,p:V(),v:V(),life:0,sleep:false,spin:V()});
 }};
 C.reset=function(){for(const c of this.pool){c.life=0;c.mesh.visible=false;}this.next=0;this.nextThrow=0;this.lowerUntil=0;this.events=[];this.last=null;};
 C.available=function(edges=[]){return G.Game.state==='playing'&&G.Input.enabled&&!P.dead&&!P.reloading&&!P.treat&&!P.gHold&&P.throwPending<=0&&P.knifeT<0&&P.switchT<=0&&P.attachT<=0&&P.pumpT<=0
  &&G.Viewmodel.state.gThrowT<0&&!G.Squad.active&&!G.Squad.aiming&&!G.Doors.manual&&!G.Doors.choice&&!G.Breach.plant&&!G.Inventory.active
  &&!G.Input.isDown('grenade')&&!G.Input.mouse.mmb&&!G.Pad.grenade&&!G.Input.mouse.lmb&&!G.Pad.fire
  &&!edges.some(a=>!['casingThrow','jump','crouch','prone','leanL','leanR'].includes(a));};
 C.request=function(edges=[]){if(G.time<this.nextThrow)return false;if(!this.available(edges)){G.HUD.msg('現在の操作が終わってから薬きょうを投げてください',1.5);return false;}
  const camera=G.camera,forward=V(0,0,-1).applyQuaternion(camera.quaternion),right=V(1,0,0).applyQuaternion(camera.quaternion);
  const origin=camera.position.clone().addScaledVector(forward,.22).addScaledVector(right,.12).add(V(0,-.16,0));
  // Clamp the release point to this side of close walls/closed doors, including leaning.
  const offset=origin.clone().sub(camera.position),len=offset.length(),dir=offset.clone().normalize();
  const obstruction=G.World.raycast(camera.position.x,camera.position.y,camera.position.z,dir.x,dir.y,dir.z,len+this.radius);
  if(obstruction)origin.copy(camera.position).addScaledVector(dir,Math.max(0,obstruction.t-this.radius-.003));
  const velocity=forward.multiplyScalar(9).add(V(P.vel.x*.25,2.2,P.vel.z*.25));
  this.spawn(origin,velocity);this.nextThrow=G.time+this.interval;this.lowerUntil=G.time+.42;P.ads=false;P.fireQueueT=0;
  G.HUD.msg('薬きょうを投げました',1);return true;
 };
 C.spawn=function(origin,velocity){this.ensure();const c=this.pool[this.next++%this.capacity];
  Object.assign(c,{id:++this.serial,life:this.lifetime,sleep:false,hits:0,sounds:0,nextSound:0,travel:0});
  c.p.copy(origin);c.v.copy(velocity);c.spin.set(9,5,13);c.mesh.position.copy(origin);c.mesh.rotation.set(.8,.2,.3);c.mesh.visible=true;
  this.last=c;this.record({type:'throw',id:c.id,point:origin.toArray()});return c;
 };
 C.material=function(hit){if(hit.ny>.5)return G.Surfaces.at(hit.x,hit.z,hit.y)||'concrete';if(hit.door)return hit.door.group?.material==='steel'?'metal':'wood';
  const m=hit.cx>=0?G.World.materialAt(hit.cx,hit.cz):null;return ['wood','metal','carpet','grass'].includes(m)?m:'concrete';};
 C.contact=function(c,hit,speed){c.hits++;if(speed<.5||c.sounds>=3||G.time<c.nextSound)return;
  const surface=this.material(hit),strength=Math.min(1,Math.max(.3,speed/3)),bounce=c.sounds>0;
  const radius=(this.hearing[surface]||6)*strength*(bounce?.55:1)*(hit.ny>.5?1:.75);
  c.sounds++;c.nextSound=G.time+.22;
  // Move the sound source just off the actual surface to avoid ray self-intersection.
  const point=V(hit.x,hit.y,hit.z).addScaledVector(V(hit.nx,hit.ny,hit.nz),.04);
  const event={type:'contact',id:c.id,point:point.toArray(),surface,radius,speed,bounce,heard:[]};
  for(const enemy of G.Enemies.list){const heard=enemy.hear(point,radius,'casing',false);if(heard)event.heard.push(enemy.id);}
  const audibility=G.Stealth13.sound({dead:false,eyePos:()=>G.camera.position.clone()},point,radius,'casing',false);
  if(audibility)G.Audio.casingHit(point,'ar',surface,speed,bounce,audibility.reach/radius);
  this.record(event);
 };
 C.step=function(c,dt){if(c.sleep)return;c.v.y-=9.8*dt;const len=c.v.length()*dt;if(len<1e-7)return;
  const dir=c.v.clone().normalize(),hit=G.World.raycast(c.p.x,c.p.y,c.p.z,dir.x,dir.y,dir.z,len+this.radius);
  if(!hit){c.p.addScaledVector(c.v,dt);c.travel+=len;return;}
  const n=V(hit.nx,hit.ny,hit.nz),dot=c.v.dot(n),impact=Math.max(0,-dot);
  c.p.set(hit.x,hit.y,hit.z).addScaledVector(n,this.radius+.002);this.contact(c,hit,impact);
  if(dot<0)c.v.addScaledVector(n,-dot*1.24);c.v.multiplyScalar(hit.ny>.5?.55:.72);
  if(hit.ny>.5&&c.v.length()<.65){c.sleep=true;c.v.set(0,0,0);c.mesh.rotation.x=Math.PI/2;}
 };
 C.update=function(dt){for(const c of this.pool){if(c.life<=0)continue;c.life-=dt;if(c.life<=0){c.mesh.visible=false;continue;}
  const steps=Math.max(1,Math.ceil(dt*120));for(let i=0;i<steps;i++)this.step(c,dt/steps);
  c.mesh.position.copy(c.p);if(!c.sleep){c.mesh.rotation.x+=c.spin.x*dt;c.mesh.rotation.y+=c.spin.y*dt;c.mesh.rotation.z+=c.spin.z*dt;}
 }};
 C.hear=function(enemy,point,radius){
  // A small unknown noise must not erase a confirmed combat/contact clue.
  if(enemy.dead||enemy.visible||enemy.awareness>=.7||G.time-enemy.lastSeenT<8||G.time-enemy.reportT<8
   ||!['patrol','guard','suspicious','search','investigate'].includes(enemy.state))return false;
  const heard=G.Stealth13.heard(enemy,point,radius,'casing');if(!heard)return false;
  enemy.heardPos=heard.point.clone();enemy.heardT=G.time;enemy.alertT=Math.max(enemy.alertT,12);
  enemy.setState('investigate');enemy.goalTo(enemy.heardPos,'casing',null);enemy.lookTarget=enemy.heardPos.clone();return true;
 };
 const reset=G.Game.reset;G.Game.reset=function(){C.reset();return reset.apply(this,arguments);};
 const weapons=G.HUD.weapons;G.HUD.weapons=function(){weapons.call(this);const bar=document.getElementById('weapon-slots');if(bar){const tag=document.createElement('span');tag.className='slot';tag.innerHTML='<b>'+G.keyName(G.Input.binds.casingThrow)+'</b>空薬きょう';bar.appendChild(tag);}};
 const init=G.Equipment.init;G.Equipment.init=function(scene){const r=init.call(this,scene);const panel=document.getElementById('panel-controls');if(panel){const note=document.createElement('p');note.className='small';note.textContent='空の薬きょうを投げる：初期キー6（キー設定で変更可）。着地音を聞いた近くの敵が、音の付近を警戒して調べます。壁越しや草・カーペットでは届きにくく、戦闘中の敵は小さな音では誘導できません。試作では所持数制限なし・弾薬消費なし、約1.2秒間隔です。';panel.appendChild(note);}return r;};
})();

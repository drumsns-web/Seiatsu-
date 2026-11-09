'use strict';
// Local observations, remembered snapshots and explicitly granted firing policy.
(()=>{const G=window.G,T=THREE,E=G.Enemies,S=G.Squad,P=G.Player,W=G.World,V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const H=G.Stealth13={events:[],lightCache:new WeakMap(),radioRange:26,radioDelay:.75,defenseTime:8};
 H.record=function(kind,actor,data={}){this.events.push({time:G.time,kind,actor:actor?.name||actor?.id||null,...data});if(this.events.length>240)this.events.shift();};
 H.light=function(target){const pos=target.pos,cached=this.lightCache.get(target),mode=G.LightingLab.mode;if(cached&&cached.mode===mode&&G.time-cached.t<.35&&cached.pos.distanceToSquared(pos)<.16)return cached.value;
  let value=W.def.outdoor?.9:mode==='natural'?.13:.45;
  if(!W.def.outdoor){const point=V(pos.x,.95,pos.z),near=(G.Lamps.fixtures||[]).filter(f=>!f.broken&&Math.hypot(f.x-pos.x,f.z-pos.z)<11).sort((a,b)=>Math.hypot(a.x-pos.x,a.z-pos.z)-Math.hypot(b.x-pos.x,b.z-pos.z)).slice(0,4);
   for(const f of near){const dist=Math.hypot(f.x-pos.x,f.z-pos.z);if(W.lineOfSight(f.x,W.CEIL-.3,f.z,point.x,point.y,point.z))value+=.8*(1-dist/11)**2;}
   for(const w of W.windows||[]){const dist=Math.hypot(w.x-pos.x,w.z-pos.z);if(dist<12&&W.lineOfSight(point.x,point.y,point.z,w.x,1.75,w.z+Math.sign(pos.z-w.z)*.08))value=Math.max(value,.13+.7*(1-dist/12));}
  }value=clamp(value,.1,1);this.lightCache.set(target,{t:G.time,pos:pos.clone(),mode,value});return value;
 };
 H.brightness=function(target){let level=this.light(target);if(G.time-target.lastShotT<.35)level=1;if(target===P&&G.Equipment.light?.intensity>0)level=Math.max(level,.85);return level;};
 H.aimFactor=function(observer,target,distance){return T.MathUtils.lerp(1,.25+.75*Math.sqrt(this.brightness(target)),clamp((distance-2)/12,0,1));};
 H.points=target=>typeof target.visPoints==='function'?target.visPoints():[target.eyePos(),target.body.hipsWorld.clone(),target.body.bones.chest.getWorldPosition(V())];
 H.visual=function(observer,target,body=false){if(observer.dead||observer.blindT>0||target.dead&&!body)return null;const eye=observer.eyePos(),points=body?[target.body?.hipsWorld?.clone()||target.pos.clone().setY(.35),target.body?.headWorld?.clone()||target.pos.clone().setY(.5)]:this.points(target),dist=eye.distanceTo(points[0]),light=this.brightness(target),range=body?(5+13*light):((observer.state==='combat'?55:40)*(W.def.outdoor?1.5:1))*(.35+.65*light);
  if(dist>range)return null;const yaw=Math.atan2(points[0].x-eye.x,points[0].z-eye.z),off=Math.abs(Math.atan2(Math.sin(yaw-observer.lookYaw),Math.cos(yaw-observer.lookYaw))),fov=observer.alertT>0||observer.state==='combat'?1.35:1.05;
  if(off>fov&&dist>1.3)return null;const seen=points.find(p=>W.lineOfSight(eye.x,eye.y,eye.z,p.x,p.y,p.z));return seen?{dist,light,center:off<.45?1:.55,point:seen.clone()}:null;
 };
 // Physical rays for hearing: smoke can hide a person but does not mute a shot.
 H.sound=function(listener,pos,radius,kind='noise',jitter=true){if(listener.dead||radius<=0)return null;const eye=listener.eyePos(),start=pos.clone();start.y=Math.max(.2,start.y);const dir=eye.clone().sub(start),dist=dir.length();if(dist>radius)return null;dir.normalize();const hit=W.raycast(start.x,start.y,start.z,dir.x,dir.y,dir.z,Math.max(0,dist-.18));let attenuation=1,barriers=0;
  if(hit){barriers=1;attenuation=.46;const reverse=W.raycast(eye.x,eye.y,eye.z,-dir.x,-dir.y,-dir.z,Math.max(0,dist-.18));if(reverse&&hit.t+reverse.t<dist-1.6){barriers=2;attenuation*=.55;}}
  const reach=radius*attenuation;if(dist>reach)return null;const error=jitter?clamp((barriers?1:.1)+dist*.07,0,3):0,point=start.clone();if(error&&dist>2){const angle=Math.random()*Math.PI*2;point.x+=Math.cos(angle)*error;point.z+=Math.sin(angle)*error;const n=G.Path.nearestWalkable(Math.floor(point.x),Math.floor(point.z));if(n&&Math.hypot(n[0]+.5-point.x,n[1]+.5-point.z)<3){point.x=n[0]+.5;point.z=n[1]+.5;}}
  return{point,dist,reach,barriers,error,kind};
 };
 H.heard=function(a,pos,radius,kind){const result=this.sound(a,pos,radius,kind);if(result){a.evidence13={kind,pos:result.point.clone(),time:G.time};this.record('heard',a,{sound:kind,dist:result.dist,barriers:result.barriers});}return result;};
 H.perceive=function(a,target,dt){if(a.dead)return;dt=clamp(dt,0,.25);this.scanBodies(a);if(a.blindT>0){a.visible=false;return;}
  const records=a.contacts13||(a.contacts13=new WeakMap());let contact=records.get(target);if(!contact){contact={level:0,confirmedAt:-999};records.set(target,contact);}if(a.sightTarget13!==target){a.sightTarget13=target;a.awareness=contact.level;a.visible=false;}
  const obs=this.visual(a,target),wasVisible=a.visible;a.visible=!!obs;
  if(obs){const posture=target.posture==='prone'?.4:target.posture==='crouch'?.7:1,move=target.sprinting?1.7:target.moving?1.25:.85,distK=Math.max(.2,1.5-obs.dist/28),alert=a.alertT>0?1.5:1,flash=G.time-target.lastShotT<.35,known=G.time-contact.confirmedAt<10,recognizable=obs.dist<=(12+14*obs.light)*(.55+.45*(obs.coverFactor22??1))||flash||known;
   a.awareness+=dt*2.2*posture*move*distK*obs.center*(obs.coverFactor22??1)*(obs.weatherFactor23??1)*alert*(.2+.8*obs.light)*(flash?3:1)*G.Game.difficulty;if(obs.dist<3)a.awareness+=dt*3;
   if(!recognizable)a.awareness=Math.min(.65,a.awareness);a.suspectPos=target.pos.clone();a.suspectT13=G.time;
   if(!wasVisible)this.record('glimpse',a,{dist:obs.dist,light:obs.light,recognizable});
   if(a.awareness>=1&&recognizable){a.awareness=1;contact.confirmedAt=G.time;a.confirmedTarget13=target;a.confirmedSeen13=G.time;a.lastSeenPos=target.pos.clone();a.lastSeenT=G.time;a.lastSeenVel.copy(target.vel||V());a.suspicionSince13=null;
    if(a.state!=='combat'&&a.state!=='cover'){a.setState('combat');a.reaction=.3+Math.random()*.2;a.shotsAtTarget=0;this.record('confirmed',a,{dist:obs.dist});}a.alertT=45;
    if(G.time-a.lastReportSent>3){a.lastReportSent=G.time;E.radio(a,a.lastSeenPos,a.lastSeenVel);}
   }else if(a.awareness>.35&&!['combat','cover','evade','incapacitated'].includes(a.state)){a.suspicionSince13??=G.time;if(G.time-a.suspicionSince13>1.2){if(a.state!=='investigate'||a.goalKind!=='visual-check'||!a.goal||a.goal.distanceTo(a.suspectPos)>2&&G.time-(a.lastVisualPlan13||-999)>.8){a.setState('investigate');a.goalTo(a.suspectPos.clone(),'visual-check');a.lastVisualPlan13=G.time;}}else a.setState('suspicious');}
  }else{a.awareness=Math.max(0,a.awareness-dt*.25);a.suspicionSince13=null;}
  contact.level=a.awareness;
 };
 H.canEnemyFire=(a,target)=>!!target&&a.visible&&a.awareness>=1&&a.confirmedTarget13===target&&G.time-a.confirmedSeen13<.35&&!target.dead;
 H.observeBody=function(a,dead){const seen=a.bodiesSeen13||(a.bodiesSeen13=new WeakSet());if(a===dead||!dead.dead||seen.has(dead))return false;const obs=this.visual(a,dead,true);if(!obs)return false;seen.add(dead);a.bodyPos13=dead.pos.clone();a.bodyT13=G.time;a.alertT=Math.max(a.alertT,35);a.evidence13={kind:'body',pos:dead.pos.clone(),time:G.time};this.record('body-seen',a,{body:dead.id,dist:obs.dist});
  if(!['combat','cover','evade','chase','flank','incapacitated'].includes(a.state)){if(a.role==='anchor'){a.lookTarget=dead.pos.clone();a.setState('guard');}else{a.setState('investigate');a.goalTo(dead.pos.clone(),'body');}}return true;
 };
 H.scanBodies=function(a){if(G.time<(a.nextBodyScan13||0)||a.dead||a.blindT>0)return;a.nextBodyScan13=G.time+.55+(a.id%3)*.04;for(const dead of E.list)if(dead.dead)this.observeBody(a,dead);};
 H.witnessDeath=function(dead){for(const a of E.list)if(a!==dead&&!a.dead)this.observeBody(a,dead);};
 H.hostileShot=function(attacker,victim){if(attacker.dead)return;const radius=attacker.weapon==='shotgun'?55:40;for(const a of G.Allies.alive()){const nearby=a.pos.distanceTo(victim.pos)<16,perceived=a===victim||nearby&&(!!this.sound(a,attacker.pos.clone().setY(1.4),radius,'gunshot',false)||!!this.visual(a,attacker));
   if(perceived){const threats=a.hostileThreats13||(a.hostileThreats13=new Map());threats.set(attacker,G.time+this.defenseTime);a.pendingPermission13=null;this.record('defense',a,{enemy:attacker.id});}}
 };
 S.canFire=function(a,target=a.target){return !a.dead&&(a.firePolicy==='open'||!!target&&!target.dead&&(a.hostileThreats13?.get(target)||-999)>G.time);};
 H.contact=function(a,target){if(S.canFire(a,target)){a.pendingPermission13=null;if(G.time-a.lastContactReport>8&&G.time-G.Radio.lastContact>3){a.lastContactReport=G.Radio.lastContact=G.time;G.Radio.say(a,'Enemy spotted! Engaging.','shout');}return;}
  const pending=a.pendingPermission13;a.pendingPermission13={target,time:G.time};if((!pending||pending.target!==target)&&G.time-(a.permissionReport13??-999)>4||G.time-(a.permissionReport13??-999)>14){const queued=G.Radio.say(a,'Contact. Awaiting permission.','whisper','敵を確認。射撃許可を要請（'+G.keyName(G.Input.binds.command)+' → 射撃許可）');if(queued!==false){a.permissionReport13=G.time;this.record('permission-request',a,{enemy:target.id});}}
 };
 H.clearShot=function(a,target){if(!target||target.dead)return false;const from=a.body.muzzle.getWorldPosition(V()),eye=a.eyePos(),points=this.points(target);return points.some(p=>W.lineOfSight(eye.x,eye.y,eye.z,p.x,p.y,p.z)&&W.lineOfSight(from.x,from.y,from.z,p.x,p.y,p.z));};
 // Only a confirmed sighting can create a radio message. Sender must survive
 // the short transmission; recipients get that old point, not a live tracker.
 E.radio=function(from,pos,vel){if(!H.canEnemyFire(from,from.confirmedTarget13)||from.neckWound)return;const nearby=this.list.filter(a=>a!==from&&!a.dead&&a.pos.distanceTo(from.pos)<=H.radioRange).sort((a,b)=>a.pos.distanceTo(from.pos)-b.pos.distanceTo(from.pos)).slice(0,3);for(const to of nearby){if(this.radioQueue.some(r=>r.from===from&&r.to===to))continue;this.radioQueue.push({from,to,pos:pos.clone(),vel:vel.clone(),t:H.radioDelay});}if(nearby.length)H.record('radio-start',from,{recipients:nearby.map(a=>a.id)});};
 const configure=S.configure;S.configure=function(a){configure.call(this,a);a.hostileThreats13=new Map();a.pendingPermission13=null;a.permissionReport13=-999;};
 const choices=S.choices;S.choices=function(kind){return choices.call(this,kind).map(c=>c.id==='cease'?{...c,sub:'攻撃を受けた時は応戦'}:c);};
 const install=S.installUI;S.installUI=function(){install.call(this);const note=document.querySelector('#squad-loadout04 p');if(note)note.textContent=note.textContent.replace('被弾時のみ応戦','攻撃を受けた時は応戦');};
 const execute=S.execute;S.execute=function(id,point){const team=G.Allies.alive().filter(a=>G.Allies.selection==='both'||a.name.toLowerCase()===G.Allies.selection),result=execute.call(this,id,point);if(id==='fire'||id==='cease')for(const a of team){if(a.afterMove==='fire')a.afterMove=null;if(id==='fire')a.pendingPermission13=null;}G.HUD.allies();return result;};
 for(const name of ['damage','reset']){const old=G.Lamps[name];G.Lamps[name]=function(...args){const r=old.apply(this,args);H.lightCache=new WeakMap();return r;};}
 const reset=G.Game.reset;G.Game.reset=function(){H.lightCache=new WeakMap();H.events=[];return reset.call(this);};
})();

'use strict';
// Bounded local cover planning; observations remain owned by Stealth13.
(()=>{const G=window.G,W=G.World,V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),angle=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
 const T=G.Combat21={events:[],frame:-1,budget:1};
 T.record=function(type,a,data={}){this.events.push({type,actor:a.name||a.id,time:G.time,...data});if(this.events.length>160)this.events.shift();};
 T.clear=function(a,reason){const c=a.combatCover21||a.cover;if(c)this.record('leave-cover',a,{reason});if(a.combatCover21){a.combatCover21=null;a.coverGoal=null;a.goal=null;a.path=null;}else if(a.cover){a.releaseCover();a.setState('combat');}a.nextCover21=G.time+1.4;a.progress21=null;a.lean=0;};
 T.hidden=function(pos,threat){let hard=0;for(const [x,z,y]of [[0,0,1.45],[.2,0,1.2],[-.2,0,1.2],[0,.2,1.2],[0,-.2,1.2]]){const start=V(threat.x,1.55,threat.z),end=V(pos.x+x,y,pos.z+z),d=end.sub(start),length=d.length();d.normalize();const h=W.raycast(start.x,start.y,start.z,d.x,d.y,d.z,length);
   if(!h||h.t>=length-.08||h.window||h.windowPane14)return null;const material=h.door?.group?.material||W.materialAt(h.cx,h.cz);if(!['wood','gypsum','glass'].includes(material))hard++;
  }return{hard:hard>=4};};
 T.free=function(pos){return W.walkable(Math.floor(pos.x),Math.floor(pos.z))&&!W.overlapsSolid(pos.x,pos.z,.32,1.8);};
 T.peek=function(pos,threat){if(W.lineOfSight(pos.x,1.62,pos.z,threat.x,1.25,threat.z))return{type:'stand',pos:pos.clone()};
  const d=threat.clone().sub(pos).setY(0).normalize(),side=V(-d.z,0,d.x);for(const distance of [.7,1.1,1.45])for(const sign of [1,-1]){const p=pos.clone().addScaledVector(side,distance*sign);if(this.free(p)&&W.walkLineClear(pos.x,pos.z,p.x,p.z,.32)&&W.lineOfSight(p.x,1.5,p.z,threat.x,1.25,threat.z))return{type:'step',pos:p};}return null;
 };
 T.find=function(a,threat,maxDistance=8,ally=false){a.coverPlanDeferred21=false;if(!threat||a.dead||a.crippled||a.downed)return null;
  if(this.frame!==G.time){this.frame=G.time;this.budget=1;}if(this.budget<=0){a.coverPlanDeferred21=true;return null;}this.budget--;
  const start=performance.now(),distance=a.pos.distanceTo(threat),anchor=ally&&(a.moveState==='holding'?a.moveGoal:a.mode==='hold'?a.holdAnchor21||a.pos:null),others=[...G.Enemies.list,...G.Allies.list].filter(o=>o!==a&&!o.dead),candidates=G.getCoverCells().map(p=>({p,d:p.distanceTo(a.pos)})).filter(c=>c.d<=maxDistance&&c.p.distanceTo(threat)>=Math.min(3,distance)&&(!anchor||c.p.distanceTo(anchor)<=3)&&(!ally||c.p.distanceTo(G.Player.pos)<=Math.max(10,a.pos.distanceTo(G.Player.pos)+1)))
   .sort((x,y)=>x.d-y.d).slice(0,44),valid=[];
  let tested=0;for(const {p,d}of candidates){const key=Math.floor(p.x)+','+Math.floor(p.z);if((a.badCover21?.get(key)||0)>G.time||!this.free(p))continue;if(others.some(o=>o.pos.distanceTo(p)<.8||(o.combatCover21?.pos||o.cover?.pos)?.distanceTo(p)<.95))continue;if(ally&&p.distanceTo(G.Player.pos)<.9)continue;if(++tested>14)break;
   const protect=this.hidden(p,threat);if(!protect)continue;const peek=this.peek(p,threat);if(!peek)continue;const advance=Math.max(0,distance-p.distanceTo(threat));valid.push({pos:p.clone(),key,peek,hard:protect.hard,score:d+advance*.8+(protect.hard?0:2)});
  }valid.sort((a,b)=>a.score-b.score);let chosen=null;
  for(const c of valid.slice(0,3)){let route=W.walkLineClear(a.pos.x,a.pos.z,c.pos.x,c.pos.z,.32)?[c.pos.clone()]:G.Path.find(a.pos.x,a.pos.z,c.pos.x,c.pos.z,threat);if(!route?.length)continue;let prev=a.pos,length=0,clear=true;for(const p of route){length+=p.distanceTo(prev);if(!W.walkLineClear(prev.x,prev.z,p.x,p.z,.32)){clear=false;break;}prev=p;}if(!clear||length>maxDistance*2+3)continue;chosen={...c,path:route};break;}
  this.record('plan',a,{found:!!chosen,tested,ms:performance.now()-start,position:chosen?.pos.toArray(),hard:chosen?.hard});return chosen;
 };
 T.rememberFailure=function(a,c){a.badCover21 ||= new Map();a.badCover21.set(c.key,G.time+9);for(const[k,t]of a.badCover21)if(t<G.time)a.badCover21.delete(k);};
 T.follow=function(a,dt,run){const goal=a.goal?.clone();if(!goal){a.progress21=null;return run();}let s=a.progress21;if(!s||s.goal.distanceTo(goal)>.3)s=a.progress21={goal,last:a.pos.clone(),idle:0,retries:0,door:0};const result=run();if(result==='arrived'&&a.pos.distanceTo(goal)>.65){a.goal=null;a.path=null;a.progress21=null;this.record('route-blocked',a,{reason:'unreachable-end'});return'fail';}if(['arrived','fail'].includes(result)||!a.goal){a.progress21=null;return result;}
  const wp=a.path?.[a.pathIdx||0];let advancing=false;if(wp){if(!s.wp||s.wp.distanceTo(wp)>.3){s.wp=wp.clone();s.best=a.pos.distanceTo(wp);s.idle=0;}const distance=a.pos.distanceTo(wp);if(distance<s.best-.1){s.best=distance;advancing=true;}}else advancing=a.pos.distanceTo(s.last)>.12;if(advancing){s.last.copy(a.pos);s.idle=0;s.retries=0;s.door=0;return result;}
  const door=G.time-(a.doorWait21??-999)<.15;if(door){s.door+=dt;if(s.door<15)return result;}else s.door=0;
  s.idle+=dt;if(s.idle>1.7){s.idle=0;s.retries++;a.path=null;a.repathT=0;this.record('repath',a,{retries:s.retries});}
  if(s.retries>=3||s.door>=15){a.goal=null;a.path=null;a.progress21=null;this.record('route-blocked',a);return'fail';}return result;
 };
 T.fireAllowed=function(a,target){const c=a.combatCover21||a.cover;if(c&&(c.phase!=='peek'||c.peek.type==='step'&&a.pos.distanceTo(c.peek.pos)>.12||a.crouch>.28))return false;
  if(!target||target.dead||a.speed>1.5)return false;const want=Math.atan2(target.pos.x-a.pos.x,target.pos.z-a.pos.z);return Math.abs(angle(a.yaw,want))<.3;
 };
 T.beginAlly=function(a,target){const c=this.find(a,a.threat||target.pos,7,true);a.nextCover21=G.time+(a.coverPlanDeferred21?.09+(a.id%3)*.03:2+(a.id%3)*.17);if(!c)return false;a.combatCover21={...c,target,threat:(a.threat||target.pos).clone(),phase:'travel',t:0,dur:1.1,lastCheck:0,seen:a.seenT,ammo:a.ammo};a.coverGoal=c.pos;a.goal=c.pos.clone();a.path=c.path.map(p=>p.clone());a.pathIdx=0;this.record('take-cover',a,{position:c.pos.toArray()});return true;};
 T.cycle=function(a,c,dt,ally,target){c.t+=dt;a.speed=0;const current=ally?a.target:a.visible&&a.awareness>=1?target:null;if(current){c.threat.copy(ally?a.threat||current.pos:a.lastSeenPos||c.threat);c.seen=G.time;}
  if(!this.free(c.pos)){this.rememberFailure(a,c);this.clear(a,'cover-blocked');return;}
  if(G.time-(c.seen??a.lastSeenT)>10){this.clear(a,'contact-lost');return;}
  c.lastCheck=(c.lastCheck||0)-dt;if(c.lastCheck<=0){c.lastCheck=.65;if(!this.hidden(c.pos,c.threat)){this.rememberFailure(a,c);this.clear(a,'cover-exposed');return;}}
  const move=(pos,speed)=>{if(!a.goal&&a.pos.distanceTo(pos)>.08){a.goal=pos.clone();a.path=null;a.repathT=0;}return ally?a.follow(dt,speed):a.followPath(dt,speed);},aim=()=>a.aimAt(c.threat.clone().setY(1.3),dt,5),phase=(name,dur)=>{c.phase=name;c.t=0;c.dur=dur;c.ammo=a.ammo;this.record(name,a);};
  switch(c.phase){case'travel':case'return':{a.wantCrouch=c.phase==='return';const r=move(c.pos,c.phase==='travel'?2.8:2.3);aim();if(r==='fail'||c.t>9){this.rememberFailure(a,c);this.clear(a,'route-failed');break;}if(a.pos.distanceTo(c.pos)<.22){a.goal=null;a.path=null;phase('hide',.9+Math.random()*.8);}break;}
   case'hide':{a.wantCrouch=true;a.goal=null;a.path=null;aim();if(a.ammo<a.magSize*.65&&a.reloadT<=0)a.startReload();if(c.t>c.dur&&a.reloadT<=0&&!(a.switchT>0)&&!a.treat){const peek=this.peek(c.pos,c.threat);if(!peek){this.clear(a,'no-firing-point');break;}c.peek=peek;phase('peek',.7+Math.random()*.6);c.readyT=0;if(peek.type==='step'){a.goal=peek.pos.clone();a.path=[peek.pos.clone()];a.pathIdx=0;}}break;}
   case'peek':{a.wantCrouch=false;if(c.peek.type==='step'&&a.pos.distanceTo(c.peek.pos)>.08){const r=move(c.peek.pos,1.7);if(r==='fail'){this.clear(a,'peek-blocked');break;}}aim();if(ally){if(a.target&&G.Squad.canFire(a))a.tryFire(dt);}else if(a.visible)a.tryFireWhileFacing(target,dt);
    const ready=c.peek.type==='stand'||a.pos.distanceTo(c.peek.pos)<.12;if(ready&&a.crouch<.28)c.readyT=(c.readyT||0)+dt;const hurt=G.time-(ally?a.hurtT:a.hurtTime)<.25;if(c.readyT>c.dur||c.t>3.8||c.ammo-a.ammo>=3||a.ammo===0||hurt){a.goal=null;a.path=null;phase('return',0);}break;}
  }
 };
 T.enemyCover=function(a,dt,target){if(!a.cover){a.setState('combat');return;}this.cycle(a,a.cover,dt,false,target);};
 T.allyCombat=function(a,dt){const c=a.combatCover21,target=a.target||c?.target;if(!target||target.dead||!G.Squad.canFire(a,target)){this.clear(a,'permission-or-target');return;}
  const threat=a.threat||c?.threat;if(!threat){this.clear(a,'missing-observation');a.wantCrouch=false;return;}
  if(a.crippled){a.wantCrouch=false;if(a.target){a.aimAt(threat.clone().setY(1.2),dt,5);a.tryFire(dt);}return;}
  if(c){this.cycle(a,c,dt,true,target);return;}if(G.time>=(a.nextCover21||0)&&this.beginAlly(a,target))return;
  a.goal=null;a.path=null;a.wantCrouch=a.pos.distanceTo(threat)>4;if(a.target){a.aimAt(threat.clone().setY(1.2),dt,5);if(a.reloadT<=0)a.tryFire(dt);}
 };
 const execute=G.Squad.execute;G.Squad.execute=function(id,point){const team=G.Allies.alive().filter(a=>G.Allies.selection==='both'||a.name.toLowerCase()===G.Allies.selection);const result=execute.call(this,id,point);if(result!==false&&id!=='fire')for(const a of team){T.clear(a,'player-order');if(id==='hold')a.holdAnchor21=a.pos.clone();}return result;};
 const reset=G.Game.reset;G.Game.reset=function(){T.events=[];T.frame=-1;return reset.apply(this,arguments);};
})();

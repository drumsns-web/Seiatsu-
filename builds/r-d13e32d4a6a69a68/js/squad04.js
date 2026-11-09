'use strict';
// Local squad-command prototype. Quantities belong to actors/pouches, never to UI.
(()=>{
 const G=window.G,T=THREE,V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),P=G.Player,A=G.Allies;
 const names=G.Calibers11.names;
 const specs={ar:{model:'rifle',mag:30,reserve:150,cap:210},pistol:{model:'pistol',mag:17,reserve:68,cap:90},shotgun:{model:'shotgun',mag:6,reserve:30,cap:42}};
 const S=G.Squad={active:false,aiming:false,pressed:false,selected:null,cursor:{x:0,y:0},radius:184,
  config:(G.Storage.get('squad_loadout04')||[{weapon:'ar',sup:true},{weapon:'ar',sup:true}]).slice(0,2)};
 const selected=()=>A.alive().filter(a=>A.selection==='both'||a.name.toLowerCase()===A.selection);
 const clearMotion=a=>{a.goal=null;a.path=null;a.moveGoal=null;a.moveState='none';a.afterMove=null;};
 const contact=(a,b,r=1.8)=>a.pos.distanceTo(b.pos)<=r&&G.World.lineOfSight(a.pos.x,.8,a.pos.z,b.pos.x,.65,b.pos.z);
 const ammoKey=a=>G.Calibers11.actor(a);
 const poolRoom=key=>G.Calibers11.room(key);
 const addPlayer=(key,n)=>G.Calibers11.add(key,n);
 S.configure=function(a){
  const cfg=this.config[a.id]||{weapon:'ar',sup:true},key=specs[cfg.weapon]?cfg.weapon:'ar',w=specs[key];
  a.weaponKey=key;a.weapon=w.model;a.magSize=w.mag;a.reserveCap=w.cap;a.ammo=w.mag;a.reserve=w.reserve;a.suppressed=!!cfg.sup&&key!=='shotgun';
  a.body.setWeapon(a.weapon);a.mode='follow';a.firePolicy='return';a.task=null;a.afterMove=null;
  if(a.suppressorMesh){a.suppressorMesh.parent.remove(a.suppressorMesh);a.suppressorMesh.geometry.dispose();a.suppressorMesh.material.dispose();a.suppressorMesh=null;}
  if(a.suppressed){const m=new T.Mesh(new T.CylinderGeometry(.024,.024,.17,12),new T.MeshStandardMaterial({color:new T.Color(0x1a1b1b).convertSRGBToLinear(),roughness:.85,metalness:.15,envMapIntensity:.25}));m.rotation.x=Math.PI/2;m.position.z=.075;a.body.muzzle.add(m);a.suppressorMesh=m;}
 };
 S.canFire=function(a){return a.firePolicy==='open'||G.time-a.hurtT<8||(P.damageSerial>0&&G.time-P.hurtT<8&&a.pos.distanceTo(P.pos)<16);};
 S.cancelTask=function(a){if(a.task?.kind==='door'&&a.task.group.orderClaim===a)a.task.group.orderClaim=null;if(a.task?.pouch?.claim===a.id)a.task.pouch.claim=null;a.task=null;a.aidProgress=null;};
 S.setMode=function(a,mode){this.cancelTask(a);clearMotion(a);a.mode=mode;};
 S.message=function(s){G.HUD.msg(s,3.5);};
 S.choices=function(kind){if(kind==='self'&&this.selfWindow&&!this.selfDoor)return[{id:'self-window',label:'窓を開閉',sub:'照準を合わせた側の窓を操作'}];if(kind==='self')return[
  {id:'self-open',label:'扉を開ける',sub:'近くの扉をクイック開放'},
  {id:'self-slow',label:'ゆっくり開く',sub:'自動で静かに開放'},
  {id:'self-close',label:'扉を閉める',sub:'近くの扉を閉鎖'},
  {id:'self-lock',label:'閉じて施錠',sub:'室内側・閉扉後に施錠'},
  {id:'self-unlock',label:'内側から解錠',sub:'室内側から鍵を外す'},
  {id:'self-pick',label:'ピッキング',sub:'鍵を操作して解錠'}
 ];const items=kind==='move'?[
  {id:'move-hold',label:'移動して待機',sub:'その場を確保'},
  {id:'move-follow',label:'移動後に追従',sub:'到着したら戻る'},
  {id:'move-fire',label:'移動後に射撃許可',sub:'到着まで応戦のみ'},
  {id:'move-loot',label:'移動して回収',sub:'周辺の適合弾薬'}
 ]:[
  {id:'follow',label:'追従',sub:'後方についてくる'},
  {id:'hold',label:'待機',sub:'現在位置を確保'},
  {id:'fire',label:'射撃許可',sub:'目視した敵と交戦'},
  {id:'cease',label:'射撃抑制',sub:'被弾時のみ応戦'},
  {id:'aid',label:'治療要請',sub:'仲間の医療品を使用'},
  {id:'ammo',label:'弾薬補給要請',sub:'現在の銃の適合弾'},
  {id:'loot',label:'周囲を回収',sub:'近くの敵の残弾'}
 ];return items.concat([{id:'door-open',label:'扉を開ける',sub:'指定扉だけを操作'},{id:'door-close',label:'扉を閉める',sub:'扉の手前へ移動'},{id:'door-lock',label:'閉じて施錠',sub:'室内から操作・待機'}]);};
 S.findDoor=function(point){const D=G.Doors,o=G.camera.position,d=G.camera.getWorldDirection(V()),hit=G.World.raycast(o.x,o.y,o.z,d.x,d.y,d.z,35);if(hit?.door&&!hit.door.broken)return hit.door.group;if(!point)return null;return D.groups.filter(g=>{const c=D.center(g),length=c.distanceTo(point);if(length>2.7||!g.leaves.some(l=>!l.broken))return false;const dir=c.clone().setY(1).sub(point.clone().setY(1)),len=dir.length();if(len<.01)return true;dir.multiplyScalar(1/len);const h=G.World.raycast(point.x,1,point.z,dir.x,dir.y,dir.z,len);return!h||h.door?.group===g||h.t>=len-.05;}).sort((a,b)=>D.center(a).distanceToSquared(point)-D.center(b).distanceToSquared(point))[0]||null;};
 S.commit=function(id,point=this.point?.clone()){const group=this.menuActor==='self'?this.selfDoor:this.commandDoor,windowTarget=this.menuActor==='self'?this.selfWindow:null;this.close();this.executingDoor=group;this.executingWindow=windowTarget;try{return id?this.execute(id,point):false;}finally{this.executingDoor=null;this.executingWindow=null;}};
 S.doorRoute=function(a,g,goal,ignoreTarget){const D=G.Doors;if(D.orderLineClear(a.pos,goal,g,ignoreTarget))return[goal.clone()];const raw=G.Path.find(a.pos.x,a.pos.z,goal.x,goal.z,null);if(!raw)return null;const route=[...raw.slice(1),goal.clone()];let previous=a.pos;for(const p of route){if(!D.orderLineClear(previous,p,g,ignoreTarget))return null;previous=p;}return route;};
 S.doorGoal=function(a,g,action){const D=G.Doors,c=D.center(g),tx=g.axis==='x'?1:0,tz=g.axis==='z'?1:0,side=D.inside(g,a.pos)?1:-1,sides=action==='lock'?[1]:[side,-side],ignore=action!=='close'&&!g.locked;
  for(const sign of sides)for(const distance of[1.45,1.9,2.2])for(const offset of[0,.4,-.4,.8,-.8]){const p=c.clone().add(V(g.nx*distance*sign+tx*offset,0,g.nz*distance*sign+tz*offset));if(!G.World.walkable(Math.floor(p.x),Math.floor(p.z))||G.World.overlapsSolid(p.x,p.z,.34,1.8)||!D.standClear(g,p,.72)||D.actors().some(o=>o!==a&&o.pos.distanceTo(p)<.65))continue;const route=this.doorRoute(a,g,p,ignore);if(route)return{point:p,route};}return null;
 };
 S.requestDoor=function(team,g,action){const D=G.Doors;if(!g||!D.groups.includes(g)||!g.leaves.some(l=>!l.broken)){this.message('操作する扉に照準を合わせてください');return false;}if(action==='lock'&&!D.lockHardwareOK(g)){this.message('ノブか扉が壊れているため施錠できません');return false;}if(action==='lock'&&g.locked&&g.interiorLocked){this.message('この扉は内側から施錠済みです');return true;}if(g.orderClaim&&!g.orderClaim.dead&&g.orderClaim.task?.group===g){this.message(g.orderClaim.name+'がこの扉を操作中です');return false;}
  const candidates=team.filter(a=>!a.dead&&!a.crippled&&!a.legLost&&!a.treat&&a.reloadT<=0&&a.pos.distanceTo(D.center(g))<=30&&(!g.locked||D.inside(g,a.pos))).sort((a,b)=>(action==='lock'?(D.inside(g,a.pos)?0:1)-(D.inside(g,b.pos)?0:1):0)||a.pos.distanceTo(D.center(g))-b.pos.distanceTo(D.center(g)));
  for(const a of candidates){const goal=this.doorGoal(a,g,action);if(!goal)continue;this.cancelTask(a);clearMotion(a);a.mode='hold';a.task={kind:'door',action,group:g,goal:goal.point,start:G.time,phase:'approach',allyHurt:a.hurtT};a.goal=goal.point.clone();a.path=goal.route;a.pathIdx=0;g.orderClaim=a;D.doorEvent('order',g,a,{action});this.message(a.name+'：'+({open:'扉を開けます',close:'扉を閉めます',lock:'扉を閉め、室内から施錠します'}[action]));return true;}
  this.message('扉を操作できる位置へ到達できません。施錠された扉は外側から開けません');return false;
 };
 S.updateDoorTask=function(a,dt){const task=a.task,g=task.group,D=G.Doors,stop=message=>{D.doorEvent('order-finish',g,a,{action:task.action,message});this.cancelTask(a);clearMotion(a);a.mode='hold';a.speed=0;if(message)this.message(a.name+'：'+message);return true;};
  if(a.dead||P.dead||a.crippled||a.legLost||a.hurtT>task.allyHurt||!D.groups.includes(g)||G.time-task.start>30)return stop('扉の指示を中断しました');if(!g.leaves.some(l=>!l.broken))return stop('扉が壊れたため中断しました');if(task.action==='lock'&&!D.lockHardwareOK(g))return stop('ノブか扉が壊れて施錠できません');
  if(task.phase==='approach'){if(a.pos.distanceTo(task.goal)>.35||!D.standClear(g,a.pos,.34)||(task.action==='lock'&&!D.inside(g,a.pos))){a.goTo(task.goal);const r=a.follow(dt,2.4);if(r==='fail')return stop('操作位置に到達できません');a.wantCrouch=false;return true;}clearMotion(a);a.speed=0;task.phase='operate';task.operatingAt=G.time;}
  a.lookYaw=Math.atan2(D.center(g).x-a.pos.x,D.center(g).z-a.pos.z);const open=task.action==='open';if(open&&g.locked&&!D.setInteriorLock(g,false,a))return stop('施錠されていて開けられません');
  if(g.target!==(open?Math.PI/2:0)){const previous=task.phase;task.phase='approach';const ok=D.request(g,open,'fast',a);task.phase=previous;if(!ok)return stop('扉を操作できません');}
  if(g.leaves.some(l=>!l.broken&&Math.abs(l.angle-(open?Math.PI/2:0))>.025)){if(G.time-task.operatingAt>6)return stop('人や物があり、扉を動かせません');return true;}
  if(task.action==='lock'&&!D.setInteriorLock(g,true,a))return stop(D.lastLockError);return stop(open?'扉を開けました':task.action==='lock'?'閉めて内側から施錠しました':'扉を閉めました');
 };
 S.close=function(){if(G.Doors.manual?.fromMenu)G.Doors.cancel();if(this.moveMarker)this.moveMarker.visible=false;this.active=false;this.aiming=false;this.holdCode=null;this.pressStarted=null;this.pressed=false;this.selected=null;this.point=null;this.commandDoor=null;this.selfDoor=null;this.selfWindow=null;P.fireQueueT=0;P.fireWhenLoaded=false;P.prevFire=false;if(this.overlay)this.overlay.hidden=true;if(this.aimHint)this.aimHint.hidden=true;G.Input.clear();};
 S.open=function(kind,point){
if(P.dead||P.gHold||P.throwPending>0||G.Viewmodel.state.gThrowT>=0){this.message('現在の動作が終わってから指示してください');return false;}
  G.Doors.cancel();const selfWindow=G.Sliding44?.target();this.active=true;this.aiming=false;this.kind=kind;this.point=point?.clone();this.commandDoor=this.findDoor(point);this.selfDoor=G.Doors.target();this.selfWindow=selfWindow;this.menuActor=selected().length?'team':'self';this.cursor={x:0,y:0};this.pressed=false;this.padHeld=false;this.selected=null;this.items=this.choices(this.menuActor==='self'?'self':kind);G.Input.clear();
  P.fireQueueT=0;P.fireWhenLoaded=false;P.prevFire=false;this.overlay.hidden=false;this.aimHint.hidden=true;this.draw();return true;
 };
  S.setMenuActor=function(actor){if(actor==='team'&&!selected().length){this.message('指示できる仲間がいません');return false;}if(G.Doors.manual?.fromMenu)G.Doors.cancel();this.menuActor=actor==='self'?'self':'team';this.cursor={x:0,y:0};this.selected=null;this.pressed=false;this.pressStarted=null;this.items=this.choices(this.menuActor==='self'?'self':this.kind);this.draw();return true;};
  S.wheel=function(delta){if(!this.active||this.menuActor!=='self'||!delta||!this.selfDoor)return false;const ok=G.Doors.menuWheel(this.selfDoor,delta);if(ok){this.pressStarted=null;this.selected=null;this.cursor={x:0,y:0};this.hover();}return ok;};
  S.hold=function(action,code,stamp=performance.now()){if(action==='moveOrder')this.beginMove(code);else if(this.open('squad')){this.holdCode=code;this.overlay.querySelector('.instruction').textContent='短押し：味方追従（単独時は扉操作） ／ 長押し：Tabで自分／味方、マウスで選び '+G.keyName(code)+' を離して決定 ／ 右クリック・Esc：取消';}if(this.active&&this.holdCode===code)this.pressStarted=stamp;};
 S.beginMove=function(holdCode=null){
  if(G.Input.isDown('sprint')){A.cycleSelection();return;}
   if(!selected().length){if(this.open('squad')&&holdCode){this.holdCode=holdCode;this.draw();}return;}
  if(this.aiming){this.close();return;}
  if(P.gHold||P.throwPending>0||P.dead)return;
  if(holdCode){const door=this.findDoor(null),point=this.pointAtReticle()||(door?G.Doors.center(door):null);if(!point){this.message('移動できる床・場所に照準を合わせてから操作してください');return;}if(this.open('move',point)){this.holdCode=holdCode;this.showMoveMarker(point);this.overlay.querySelector('.instruction').textContent='短押し：この地点へ移動して待機 ／ 長押し：マウスで行動を選び '+G.keyName(holdCode)+' を離して決定 ／ 右クリック・Esc：取消';}return;}
  G.Doors.cancel();this.aiming=true;this.aimHint.hidden=false;G.Input.mouse.lmb=false;
  this.aimHint.textContent='移動先に照準 → 左クリックを押したまま行動を選択 → 離して決定 ／ '+G.keyName(G.Input.binds.moveOrder)+'・Escで取消';
 };
 S.showMoveMarker=function(point){if(!this.moveMarker){const m=this.moveMarker=new T.Mesh(new T.RingGeometry(.35,.46,32),new T.MeshBasicMaterial({color:0x97c8ad,side:T.DoubleSide,depthWrite:false,transparent:true,opacity:.85}));m.name='squad35-selected-ground';m.rotation.x=-Math.PI/2;G.Game.scene.add(m);}this.moveMarker.position.copy(point).setY(.025);this.moveMarker.visible=true;};
 S.pointAtReticle=function(){
  const o=G.camera.position.clone(),d=G.camera.getWorldDirection(V()),h=G.World.raycast(o.x,o.y,o.z,d.x,d.y,d.z,65);if(!h)return null;
  const p=o.addScaledVector(d,Math.max(.5,h.t-(h.ny===0?.55:0)));p.y=0;
  if(!G.World.walkable(Math.floor(p.x),Math.floor(p.z))||G.World.overlapsSolid(p.x,p.z,.35,1.8)){
   const n=G.Path.nearestWalkable(Math.floor(p.x),Math.floor(p.z));if(!n||Math.hypot(n[0]+.5-p.x,n[1]+.5-p.z)>2.5)return null;p.set(n[0]+.5,0,n[1]+.5);
  }return p;
 };
 S.actorTabAtCursor=function(){const x=innerWidth/2+this.cursor.x,y=innerHeight/2+this.cursor.y;return[...this.actorTabs.querySelectorAll('button')].find(b=>{if(b.disabled)return false;const r=b.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;});};
 S.pointerDown=function(e){
  if(G.Game.state!=='playing'||!G.Input.enabled)return false;
  if(!this.active&&!this.aiming){const code='Mouse'+e.button,action=['command','moveOrder'].find(a=>G.Input.binds[a]===code);if(action){e.preventDefault();this.hold(action,code,e.timeStamp);return true;}}
   if(this.active&&e.button===0){const tab=e.target?.closest?.('[data-menu-actor]')||this.actorTabAtCursor();if(tab){e.preventDefault();this.setMenuActor(tab.dataset.menuActor);return true;}}
   if(this.aiming){e.preventDefault();if(e.button===2){this.close();return true;}if(e.button!==0)return true;const point=this.pointAtReticle();if(!point){this.message('移動できる床・場所に照準を合わせてください');return true;}if(this.open('move',point))this.pressed=true;return true;}
  if(!this.active)return false;e.preventDefault();if(e.button===2){this.close();return true;}if(e.button===0)this.pressed=true;return true;
 };
 S.pointerUp=function(e){if(!this.active&&!this.aiming)return false;e.preventDefault();if(this.active&&this.holdCode==='Mouse'+e.button){this.keyUp({code:this.holdCode,timeStamp:e.timeStamp,preventDefault:()=>{}});return true;}if(this.active&&!this.holdCode&&e.button===0&&this.pressed){const id=this.selected,point=this.point?.clone();this.commit(id,point);}return true;};
 S.pointerMove=function(e){if(!this.active)return false;
  if(document.pointerLockElement){this.cursor.x+=e.movementX||0;this.cursor.y+=e.movementY||0;}else{this.cursor.x=e.clientX-innerWidth/2;this.cursor.y=e.clientY-innerHeight/2;}
  const len=Math.hypot(this.cursor.x,this.cursor.y),limit=this.radius+120;if(len>limit){this.cursor.x*=limit/len;this.cursor.y*=limit/len;}
  this.hover();return true;
 };
 S.hover=function(){const {x,y}=this.cursor,len=Math.hypot(x,y),n=this.items.length;let angle=(Math.atan2(y,x)+Math.PI/2+Math.PI*2)%(Math.PI*2);const idx=Math.floor((angle+Math.PI/n)/(Math.PI*2/n))%n;const tab=this.actorTabAtCursor();for(const b of this.actorTabs.querySelectorAll('button'))b.classList.toggle('chosen',b===tab);this.selected=tab||len<56?null:this.items[idx].id;
  this.overlay.querySelectorAll('[data-order]').forEach(el=>el.classList.toggle('chosen',el.dataset.order===this.selected));this.cursorEl.style.transform=`translate(${x}px,${y}px)`;
 };
 S.keyUp=function(e){if(!this.active||!this.holdCode||e.code!==this.holdCode)return false;e.preventDefault();const stamp=Number.isFinite(e.timeStamp)?e.timeStamp:performance.now(),quick=this.pressStarted!=null&&stamp-this.pressStarted>=0&&stamp-this.pressStarted<250,id=quick?(this.menuActor==='self'?(this.selfDoor?(this.selfDoor.locked?(G.Doors.inside(this.selfDoor)?'self-unlock':'self-pick'):this.selfDoor.leaves.some(l=>!l.broken&&l.angle>.12)?'self-close':'self-open'):this.selfWindow?'self-window':null):this.kind==='squad'?'follow':'move-hold'):this.selected,point=this.point?.clone();this.commit(id,point);return true;};
 S.key=function(e){
  if(!this.active&&!this.aiming){const action=['command','moveOrder'].find(a=>G.Input.binds[a]===e.code);if(action&&G.Input.enabled&&G.Game.state==='playing'){e.preventDefault();if(!e.repeat)this.hold(action,e.code,e.timeStamp);return true;}return false;}
   if(e.code==='Tab'){e.preventDefault();if(!e.repeat)this.setMenuActor(this.menuActor==='self'?'team':'self');return true;}
   if(this.holdCode){e.preventDefault();if(!e.repeat&&(e.code==='Escape'||e.code===G.Input.binds.command&&e.code!==this.holdCode))this.close();return true;}
  if(e.code==='Escape'||e.code===G.Input.binds.command||e.code===G.Input.binds.moveOrder){e.preventDefault();if(!e.repeat)this.close();return true;}
  if(!this.active)return false;e.preventDefault();if(e.repeat)return true;
  const raw=Number(e.code.replace('Digit','')),n=raw===0&&e.code==='Digit0'&&this.items.length===10?10:raw;if(n>=1&&n<=this.items.length){const id=this.items[n-1].id,p=this.point?.clone();this.commit(id,p);}return true;
 };
 S.draw=function(){const r=this.radius=Math.max(135,Math.min(230,innerHeight*.285,innerWidth*.32)),n=this.items.length;this.overlay.style.setProperty('--order-width',Math.min(this.menuActor==='self'?150:128,r*(this.menuActor==='self'?0.7:0.58))+'px');this.ring.innerHTML=this.items.map((c,i)=>{
  const a=i*2*Math.PI/n-Math.PI/2,x=Math.cos(a)*r,y=Math.sin(a)*r;
  return `<button type="button" data-order="${c.id}" style="left:calc(50% + ${x}px);top:calc(50% + ${y}px)"><b>${i===9?'0':i+1} ${c.label}</b><small>${c.sub}</small></button>`;
 }).join('');
  this.ring.querySelectorAll('button').forEach(b=>{b.onpointerenter=()=>{if(!document.pointerLockElement){this.selected=b.dataset.order;this.ring.querySelectorAll('button').forEach(el=>el.classList.toggle('chosen',el===b));}};b.onkeydown=e=>{if(!this.holdCode&&(e.key==='Enter'||e.key===' ')){e.preventDefault();const id=b.dataset.order,p=this.point?.clone();this.commit(id,p);}};});
  this.overlay.querySelector('.help').innerHTML='<div class="details"></div><span class="instruction">左クリックを押したまま選択 → 離して決定<br>中央で離す・右クリック・Esc：取消 ／ 数字キーでも選択</span>';this.details=this.overlay.querySelector('.details');
   const self=this.menuActor==='self',door=self?this.selfDoor:this.commandDoor;this.title.textContent=self?'自分の行動':this.kind==='move'?'到着後の行動':'味方に指示';this.targetText.textContent=(self?'自分':selected().map(a=>a.name).join(' ＋ '))+(door?' / 扉'+(door.id+1):self?(this.selfWindow?' / 窓'+(this.selfWindow.window.id+1)+(this.selfWindow.index===0?' 左':' 右'):' / 近くの扉・窓に照準を合わせてください'):'');this.overlay.querySelector('.help').style.top='calc(50% + '+(r+50)+'px)';this.actorTabs.style.top='calc(50% - '+(r+95)+'px)';for(const b of this.actorTabs.querySelectorAll('button')){b.setAttribute('aria-pressed',String(b.dataset.menuActor===this.menuActor));b.disabled=b.dataset.menuActor==='team'&&!selected().length;}this.details.textContent=self?(door?(door.locked?'施錠中':'解錠中')+' ／ 施錠・解錠は室内側のみ':this.selfWindow?'選んだ側の窓を開閉します':'遠い扉・窓は操作できません'):selected().map(a=>`${a.name} ${a.firePolicy==='open'?'射撃許可':'応戦のみ'} · 弾 ${a.ammo}＋${a.reserve}`).join('　');if(this.holdCode)this.overlay.querySelector('.instruction').textContent='Tabで自分／味方を切替 ／ '+(self&&this.selfDoor?'ホイールで扉を微調整 ／ ':'')+'マウスで選び '+G.keyName(this.holdCode)+' を離して決定 ／ 右クリック・Esc：取消';this.hover();
 };
 S.execute=function(id,point){
   if(id==='self-window'){const snapshot=this.executingWindow,live=G.Sliding44?.target();if(!snapshot||!live||live.window!==snapshot.window||live.index!==snapshot.index){this.message('近くの操作する窓に照準を合わせてください');return false;}return G.Sliding44.request(live.window,live.index);}
   if(id.startsWith('self-'))return G.Doors.selfAction(id.slice(5),this.executingDoor);
   const team=selected();if(!team.length)return false;if(id.startsWith('door-'))return this.requestDoor(team,this.executingDoor||this.findDoor(point),id.slice(5));
  if(id.startsWith('move-')){
   if(!point||!A.orderMove(point))return false;
   for(const a of A.commandAssigned){this.cancelTask(a);a.afterMove=id.slice(5);a.mode='hold';if(a.afterMove==='fire')a.firePolicy='return';}
   this.message(A.commandAssigned.map(a=>a.name).join('・')+'：'+this.choices('move').find(c=>c.id===id).label);return true;
  }
  if(id==='follow'||id==='hold'){for(const a of team)this.setMode(a,id);G.Radio.say(team[0],id==='follow'?'Roger. On your six.':'Copy. Holding position.');}
  else if(id==='fire'||id==='cease'){for(const a of team)a.firePolicy=id==='fire'?'open':'return';}
  else if(id==='ammo'||id==='aid')return this.requestSupport(id,team);
  else if(id==='loot'){let count=0;for(const a of team){this.cancelTask(a);if(this.beginLoot(a,a.pos.clone(),12))count++;}if(!count){this.message('近くに回収できる適合弾薬がありません');return false;}}
  this.message(team.map(a=>a.name).join('・')+'：'+this.choices('squad').find(c=>c.id===id)?.label);return true;
 };
 S.arrived=function(a){const action=a.afterMove;a.afterMove=null;if(action==='follow'){clearMotion(a);a.mode='follow';}else if(action==='fire'){a.firePolicy='open';}else if(action==='loot'){this.beginLoot(a,a.pos.clone(),6);}};
 S.healPlan=function(a){return G.Medical20.choose(P,a.med,true,100);};
 S.requestSupport=function(kind,team){
  if(P.dead||P.treat){this.message('現在の処置が終わってから要請してください');return false;}
  const key=G.Calibers11.current();
  if(kind==='ammo'&&poolRoom(key)<=0){this.message('予備弾薬の携行上限です');return false;}
  const candidates=team.filter(a=>!a.crippled&&!a.treat&&a.pos.distanceTo(P.pos)<=20&&(kind==='aid'?this.healPlan(a):ammoKey(a)===key&&a.reserve>a.magSize)).sort((a,b)=>a.pos.distanceTo(P.pos)-b.pos.distanceTo(P.pos));
  const a=candidates.find(a=>G.World.walkLineClear(a.pos.x,a.pos.z,P.pos.x,P.pos.z,.3)||G.Path.find(a.pos.x,a.pos.z,P.pos.x,P.pos.z,null));
  if(!a){this.message(kind==='ammo'?'適合弾の余裕がある仲間が近くにいません（自身の予備1弾倉は保持）':'治療できる仲間・医療品・経路がありません');return false;}
  this.cancelTask(a);clearMotion(a);a.task={kind,key,t:0,start:G.time,playerHurt:P.damageSerial,allyHurt:a.hurtT};this.message(a.name+'：'+(kind==='ammo'?'適合弾薬を渡しに向かいます':'治療に向かいます'));return true;
 };
 S.updateTask=function(a,dt){
  const task=a.task;if(!task)return false;if(task.kind==='door')return this.updateDoorTask(a,dt);
  if(a.dead||P.dead||a.crippled||G.time-task.start>25){this.cancelTask(a);return false;}
  if(a.hurtT>task.allyHurt||P.damageSerial!==task.playerHurt||(a.target&&this.canFire(a))){this.cancelTask(a);this.message(a.name+'：危険のため支援を中断');return false;}
  if(task.kind==='loot')return this.updateLoot(a,dt);
  if(!contact(a,P,1.8)){
   if(task.t>0){this.cancelTask(a);this.message(a.name+'：距離・遮蔽物のため処置を中断');return false;}
   a.goTo(P.pos);const r=a.follow(dt,2.4);if(r==='fail'){this.cancelTask(a);this.message(a.name+'：到達できません');return false;}a.wantCrouch=false;return true;
  }
  a.goal=null;a.path=null;a.speed=0;
  if(task.kind==='ammo'){
   if(G.Calibers11.current()!==task.key||ammoKey(a)!==task.key){this.cancelTask(a);this.message(a.name+'：使用弾が変わったため補給を中断。必要なら再度要請してください');return false;}
   const n=Math.max(0,Math.min(a.magSize,a.reserve-a.magSize,poolRoom(task.key)));const got=addPlayer(task.key,n);a.reserve-=got;this.cancelTask(a);G.HUD.ammo();this.message(got?a.name+'から'+names[task.key]+'を'+got+'発受領':'補給できる空き・弾薬がありません');return true;
  }
  if(P.treat||P.reloading||P.sprinting||G.time-P.lastShotT<.3){this.cancelTask(a);this.message(a.name+'：動作が終わってから治療を要請してください');return false;}
  if(!task.plan){task.plan=this.healPlan(a);if(!task.plan){this.cancelTask(a);return false;}G.Audio.treat('start',task.plan.item,null,a);task.nextSound=.65;}
  task.t+=dt;a.wantCrouch=true;const plan=task.plan,duration=G.MED[plan.item].time;a.aidProgress=Math.min(1,task.t/duration);
  if(task.t>=task.nextSound&&task.t<duration-.25){G.Audio.treatWork(plan.item,task.t/duration,null,a);task.nextSound=task.t+.6+Math.random()*.25;}
  if(task.t>=duration){
   let ok=a.med[plan.item]>0;
   if(plan.w)ok=ok&&P.wounds.includes(plan.w)&&plan.w.rate>0&&(!plan.w.packed||plan.full);
   else ok=ok&&P.hp<100;
   if(ok&&G.Medical20.apply(P,plan,a.med)){G.Audio.treat('end',plan.item,null,a);G.HUD.medical();this.message(a.name+'：'+G.MED[plan.item].name+(plan.w&&!plan.full?'で応急処置（出血は残っています）':'で処置しました'));}
   this.cancelTask(a);
  }return true;
 };
 S.takeStock=function(owner){
  const stock={ar:0,pistol:0,buck:0,bird:0,slug:0};if(!owner||owner.stockTaken04)return stock;owner.stockTaken04=true;
  if(owner.arms){owner.arms[owner.weapon].ammo=owner.ammo;for(const [kind,st]of Object.entries(owner.arms)){const key=kind==='rifle'?'ar':kind==='shotgun'?'buck':'pistol';stock[key]+=Math.max(0,st.ammo|0)+Math.max(0,st.reserve|0);st.ammo=st.reserve=0;}}
  else if(owner.weaponKey){stock[ammoKey(owner)]=Math.max(0,owner.ammo|0)+Math.max(0,owner.reserve|0);owner.reserve=0;}
  owner.ammo=0;return stock;
 };
 S.stockEmpty=stock=>!stock||Object.values(stock).every(n=>n<=0);
 S.collectPlayer=function(p){const got=[];if(!p.stock)return got;for(const k of Object.keys(names)){const n=addPlayer(k,p.stock[k]);if(n>0){p.stock[k]-=n;got.push(names[k]+'+'+n);}}return got;};
 S.beginLoot=function(a,center,range){
  const candidates=G.Pickups.list.filter(p=>p.stock?.[ammoKey(a)]>0&&p.mesh.position.distanceTo(center)<=range&&(p.claim==null||p.claim===a.id)&&a.reserve<a.reserveCap).sort((x,y)=>x.mesh.position.distanceTo(a.pos)-y.mesh.position.distanceTo(a.pos));
  const p=candidates.find(p=>G.World.walkLineClear(a.pos.x,a.pos.z,p.mesh.position.x,p.mesh.position.z,.3)||G.Path.find(a.pos.x,a.pos.z,p.mesh.position.x,p.mesh.position.z,null));if(!p)return false;
  clearMotion(a);p.claim=a.id;a.task={kind:'loot',pouch:p,center:center.clone(),range,t:0,start:G.time,playerHurt:P.damageSerial,allyHurt:a.hurtT};return true;
 };
 S.updateLoot=function(a,dt){
  const task=a.task,p=task.pouch,key=ammoKey(a);if(!G.Pickups.list.includes(p)||!p.stock[key]||a.reserve>=a.reserveCap){this.cancelTask(a);return false;}
  const pos=p.mesh.position;
  if(!contact(a,{pos},1.25)){a.goTo(pos);const result=a.follow(dt,2.2);if(result==='fail'){this.cancelTask(a);return false;}return true;}
  a.goal=null;a.path=null;a.wantCrouch=true;a.speed=0;task.t+=dt;
  if(task.t>=1.2){const n=Math.min(p.stock[key],a.reserveCap-a.reserve);a.reserve+=n;p.stock[key]-=n;this.message(a.name+'：'+names[key]+'を'+n+'発回収');const center=task.center,range=task.range;this.cancelTask(a);
   if(G.Inventory)G.Inventory.prune(p);else if(this.stockEmpty(p.stock)){G.Pickups.scene.remove(p.mesh);G.Pickups.list.splice(G.Pickups.list.indexOf(p),1);}this.beginLoot(a,center,range);
  }return true;
 };
 S.update=function(dt){if((this.active||this.aiming)&&(G.Game.state!=='playing'||P.dead))this.close();
  const pad=G.Pad;if(this.aiming&&pad?.fire){const point=this.pointAtReticle();if(point&&this.open('move',point))this.padHeld=true;}
  if(this.active&&pad&&!this.holdCode){if(pad.look.x||pad.look.y){this.cursor.x+=pad.look.x*dt*260;this.cursor.y+=pad.look.y*dt*260;const len=Math.hypot(this.cursor.x,this.cursor.y);if(len>this.radius+35){this.cursor.x*=((this.radius+35)/len);this.cursor.y*=((this.radius+35)/len);}this.hover();}if(pad.fire)this.padHeld=true;else if(this.padHeld){const id=this.selected,p=this.point?.clone();this.commit(id,p);}}
  const a=A.list.find(a=>a.task?.kind==='aid'&&a.aidProgress!=null);this.aidHint.hidden=!a;if(a)this.aidHint.textContent=a.name+' が処置中 '+Math.round(a.aidProgress*100)+'%（近くで待機）';
  const text=G.keyName(G.Input.binds.command)+'長押し：円形指示 ／ '+G.keyName(G.Input.binds.moveOrder)+'長押し：移動先＋行動 ／ 離して決定 ／ Shift併用：対象切替';if(text!==this.lastBindLabel){this.lastBindLabel=text;const el=document.querySelector('#squad-select>span');if(el)el.textContent=text;}
 };
 S.installUI=function(){
  const style=document.createElement('style');style.textContent='#squad-wheel04{position:fixed;inset:0;z-index:60;background:radial-gradient(circle at center,#12201be8 0,#0b1218b8 290px,transparent 520px);color:#e6eae4;user-select:none}#squad-wheel04[hidden],#squad-aim04[hidden],#squad-aid04[hidden]{display:none}#squad-wheel04 .ring{position:absolute;inset:0}#squad-wheel04 button{position:absolute;transform:translate(-50%,-50%);width:var(--order-width,120px);min-height:56px;padding:8px 6px;border:1px solid #67796f;border-radius:9px;background:#18251fee;color:#ebefe9;cursor:pointer;font:14px system-ui}#squad-wheel04 button.chosen{background:#c9d9b9;color:#101910;box-shadow:0 0 0 3px #c8daab55;border-color:#e6efda}#squad-wheel04 button small{display:block;font-size:11px;margin-top:5px;opacity:.75}#squad-wheel04 .center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;max-width:140px;pointer-events:none}#squad-wheel04 .center strong{display:block;font-size:17px;margin-bottom:6px}#squad-wheel04 .center span{font-size:12px;color:#9fbcaa}#squad-wheel04 .help{position:absolute;left:0;right:0;top:calc(50% + 235px);left:50%;right:auto;width:min(780px,95vw);transform:translateX(-50%);padding:8px 12px;border-radius:6px;background:#102019f5;text-align:center;font:13px system-ui;line-height:1.7}#squad-wheel04 .cursor{position:absolute;left:50%;top:50%;width:10px;height:10px;margin:-5px;background:#fff;border:2px solid #1e221c;border-radius:50%;pointer-events:none;z-index:4}#squad-aim04,#squad-aid04{position:fixed;left:50%;transform:translateX(-50%);padding:10px 16px;background:#102019ee;border:1px solid #617e68;color:#e5eddd;z-index:35;font:13px system-ui}#squad-aim04{top:19%}#squad-aid04{top:75%}#squad-loadout04 .member{border:1px solid #4b5c56;border-radius:7px;padding:12px;margin:10px 0}#squad-loadout04 .member h4{margin:0 0 10px;color:#c6d4bf}';style.textContent+='@media(max-height:600px){#squad-wheel04 button{min-height:48px;padding:6px;font-size:12px}#squad-wheel04 button small{font-size:10px}}';document.head.appendChild(style);
  style.textContent+='#squad-wheel04 .ring:before{content:"";position:absolute;left:50%;top:50%;width:365px;height:365px;border:1px solid #9cac8a55;box-shadow:0 0 0 70px #9cac8a06;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none}';
  style.textContent+='#squad-wheel04 .actor-tabs{position:absolute;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:3}#squad-wheel04 .actor-tabs button{position:static;transform:none;min-width:135px;min-height:42px;padding:8px 14px;border:1px solid #718877;border-radius:5px;background:#15291f;color:#e6eae4;font:13px system-ui}#squad-wheel04 .actor-tabs button[aria-pressed=true]{background:#425e4b;border-color:#d0dfbe}#squad-wheel04 .actor-tabs button:disabled{opacity:.4}';
  const overlay=this.overlay=document.createElement('section');overlay.id='squad-wheel04';overlay.hidden=true;overlay.setAttribute('aria-label','味方の円形指示メニュー');overlay.innerHTML='<nav class="actor-tabs" aria-label="行動する人"><button type="button" data-menu-actor="self">自分の行動</button><button type="button" data-menu-actor="team">味方への指示</button></nav><div class="ring"></div><div class="center"><strong></strong><span></span></div><div class="help"><div class="details"></div>左クリックを押したまま選択 → 離して決定<br>中央で離す・右クリック・Esc：取消 ／ 数字キーでも選択</div><i class="cursor"></i>';document.body.appendChild(overlay);
  this.actorTabs=overlay.querySelector('.actor-tabs');for(const b of this.actorTabs.querySelectorAll('button'))b.onclick=e=>{e.preventDefault();this.setMenuActor(b.dataset.menuActor);};
  this.ring=overlay.querySelector('.ring');this.title=overlay.querySelector('strong');this.targetText=overlay.querySelector('.center span');this.details=overlay.querySelector('.details');this.cursorEl=overlay.querySelector('.cursor');
  this.aimHint=document.createElement('div');this.aimHint.id='squad-aim04';this.aimHint.hidden=true;document.body.appendChild(this.aimHint);
  this.aidHint=document.createElement('div');this.aidHint.id='squad-aid04';this.aidHint.hidden=true;document.body.appendChild(this.aidHint);
  const el=document.createElement('section');el.id='squad-loadout04';el.innerHTML='<h3 class="sub">味方の出撃装備</h3><p class="small">変更は次回出撃から適用。初期指示は追従・射撃抑制（被弾時のみ応戦）。仲間は自身の予備1弾倉を残して補給します。</p>'+['ALPHA','BRAVO'].map((name,i)=>`<div class="member"><h4>${name}</h4><label class="field">主武器<select data-member="${i}"><option value="ar">ライフル · 5.56mm · 装填30＋予備150</option><option value="pistol">ハンドガン · .45口径（ゲーム設定） · 装填17＋予備68</option><option value="shotgun">ショットガン · バック6＋予備30</option></select></label><label class="field check"><input type="checkbox" data-suppressor="${i}"> サプレッサー（ライフル・拳銃）</label><p class="small">医療品：止血帯1・止血剤1・包帯2・治療薬2</p></div>`).join('')+'<p class="small">味方の銃は既存ゲーム用モデル。拳銃はゲーム内で.45口径に統一しています。PDW90用5.7mm・Kar98K用7.92mmを持つ味方はまだ未対応のため、その2銃には補給できません。ショットガンの仲間はバックショットのみを携行します。</p>';
  document.getElementById('panel-loadout').appendChild(el);
  ['ALPHA','BRAVO'].forEach((_,i)=>{const select=el.querySelector(`[data-member="${i}"]`),check=el.querySelector(`[data-suppressor="${i}"]`);const cfg=this.config[i]||(this.config[i]={weapon:'ar',sup:true});select.value=specs[cfg.weapon]?cfg.weapon:'ar';check.checked=!!cfg.sup;const update=()=>{check.disabled=select.value==='shotgun';this.config[i]={weapon:select.value,sup:check.checked&&!check.disabled};G.Storage.set('squad_loadout04',this.config);};select.onchange=check.onchange=update;check.disabled=select.value==='shotgun';});
  const info=document.querySelector('#squad-select>span');if(info)info.textContent=G.keyName(G.Input.binds.command)+'短押し：追従・長押し：指示 ／ '+G.keyName(G.Input.binds.moveOrder)+'短押し：移動・長押し：到着後の行動 ／ 離して決定 ／ Shift併用：対象切替';
  window.addEventListener('blur',()=>this.close());document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&(this.active||this.aiming))this.close();});
 };
 const init=G.Equipment.init;G.Equipment.init=function(scene){init.call(this,scene);S.installUI();};
 const reset=A.reset;A.reset=function(scene){for(const a of this.list)S.cancelTask(a);S.close();return reset.call(this,scene);};
 const pause=G.Game.pause;G.Game.pause=function(){S.close();return pause.apply(this,arguments);};
 // Picking foley: irregular quiet manipulations; successful unlock has a separate latch.
 G.Audio.lockPick=function(pos,success){const out=this.out(pos,success?.32:.11,{life:.45,reverb:.08,ref:.8,rolloff:1.4});if(!out)return;const t=this.ctx.currentTime;
  if(success){this.noiseBurst(out,t,.045,'bandpass',1250,.6,.65,.002);this.noiseBurst(out,t+.06,.085,'lowpass',750,.65,.5,.004);}else{this.noiseBurst(out,t,.022,'bandpass',1300+Math.random()*650,.7,.35,.002);this.noiseBurst(out,t+.045+Math.random()*.06,.025,'highpass',800,.6,.2,.004);}
 };
 const doorUpdate=G.Doors.update;G.Doors.update=function(dt){const before=this.picking,locked=before?.group.locked;doorUpdate.call(this,dt);
  if(this.picking){const p=this.picking;if(p.time>=(p.nextSound??.08)){G.Audio.lockPick(V(p.group.x,1.02,p.group.z),false);p.nextSound=p.time+.28+Math.random()*.38;}}
  else if(before&&locked&&!before.group.locked)G.Audio.lockPick(V(before.group.x,1.02,before.group.z),true);
 };
})();

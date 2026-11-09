'use strict';
(function(){
 const G=window.G,T=THREE,types=['frag','flash','smoke'],names={frag:'グレネード',flash:'フラッシュバン',smoke:'スモーク'};
 const E=G.Equipment={ready:false,on:{light:false,laser:false},selected:'frag',clouds:[],flashTime:0,types,names};
 E.states={ar:E.on,pistol:{light:false,laser:false},shotgun:{light:false,laser:false}};
 Object.defineProperty(E,'on',{get(){return this.states[G.Player?.cur]||this.states.ar;}});
 E.config=function(id=G.Player.cur){return id==='ar'?G.Game.loadout:G.Game.loadout.attachments?.[id]||{};};
 E.init=function(scene){
  this.scene=scene;this.ready=true;
  const L=G.Game.loadout;Object.assign(L,{light:L.light!==false,laser:L.laser!==false,laserColor:L.laserColor==='green'?'green':'red'});
  L.attachments=L.attachments||{};for(const id of ['pistol','shotgun'])L.attachments[id]=Object.assign({light:true,laser:true,laserColor:'red'},L.attachments[id]||{});
  L.throwables=Object.assign({frag:2,flash:2,smoke:2},L.throwables||{});for(const k of types)L.throwables[k]=Math.max(0,Math.min(2,Number(L.throwables[k])||0));
  const metal=new T.MeshStandardMaterial({color:0x292f30,roughness:.45,metalness:.7}),W=G.Viewmodel.weapons.ar;
  this.laserModule=new T.Group();this.laserModule.name='laser-module';W.group.add(this.laserModule);this.laserModule.position.set(.037,.065,-.31);
  const housing=new T.Mesh(new T.BoxGeometry(.035,.028,.07),metal);this.laserModule.add(housing);
  const lens=new T.Mesh(new T.CircleGeometry(.006,12),new T.MeshBasicMaterial({color:0xff3030}));lens.position.z=-.036;lens.rotation.y=Math.PI;this.laserModule.add(lens);this.laserLens=lens;this.modules={ar:{laser:this.laserModule,lens}};
  for(const id of ['pistol','shotgun']){const gun=G.Viewmodel.weapons[id],module=this.laserModule.clone();module.children[1].material=lens.material.clone();
    module.position.set(...(id==='pistol'?[.016,-.022,-.087]:[.03,.007,-.46]));if(id==='pistol')module.scale.setScalar(.62);gun.group.add(module);
    gun.light=W.light.clone();gun.light.position.set(...(id==='pistol'?[-.012,-.018,-.086]:[-.03,.005,-.46]));if(id==='pistol')gun.light.scale.setScalar(.7);gun.group.add(gun.light);this.modules[id]={laser:module,lens:module.children[1]};
  }
  this.light=new T.SpotLight(0xe7f0ff,0,24,.34,.58,1.2);this.light.castShadow=G.Game.quality!=='low';this.light.shadow.needsUpdate=true;this.light.shadow.mapSize.set(1024,1024);this.light.shadow.bias=-.0002;this.light.shadow.normalBias=.025;this.light.shadow.camera.near=.08;scene.add(this.light);scene.add(this.light.target);
  this.dot=new T.Mesh(new T.SphereGeometry(1,10,8),new T.MeshBasicMaterial({color:0xff2929,toneMapped:false}));scene.add(this.dot);
  this.beam=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3()]),new T.LineBasicMaterial({color:0xff3030,transparent:true,opacity:.12,depthWrite:false}));this.beam.frustumCulled=false;scene.add(this.beam);
  const iron=W.iron=new T.Group();W.group.add(iron);
  const box=(w,h,d,x,y,z)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),metal);m.position.set(x,y,z);iron.add(m);};
  const ring=new T.Mesh(new T.TorusGeometry(.009,.0028,8,24),metal);ring.position.set(0,.083,.095);iron.add(ring);box(.022,.017,.015,0,.068,.095);
  box(.006,.022,.012,0,.072,-.49);for(const side of [-1,1])box(.004,.028,.014,side*.014,.077,-.49);
  this.flashOverlay=document.createElement('div');this.flashOverlay.id='flash-blind';this.flashOverlay.style.cssText='position:fixed;inset:0;background:#f0f3e9;opacity:0;pointer-events:none;z-index:24';document.body.appendChild(this.flashOverlay);
  this.hud=document.createElement('div');this.hud.id='equipment-status';this.hud.style.cssText='position:fixed;bottom:18px;left:50%;transform:translateX(-50%);font:12px system-ui;color:#c5d6c7;pointer-events:none;z-index:10;text-shadow:0 1px 3px #000';document.body.appendChild(this.hud);
  this.installUI();this.installSmokeSight();this.apply();
  const P=G.Player;P.throwables={frag:P.grenades||2,flash:2,smoke:2};Object.defineProperty(P,'grenades',{configurable:true,get(){return this.throwables.frag;},set(v){this.throwables||(this.throwables={frag:0,flash:0,smoke:0});this.throwables.frag=v;}});
  this.originalHeld=G.Viewmodel.gMesh;this.held={frag:this.originalHeld,flash:this.buildThrowable('flash'),smoke:this.buildThrowable('smoke')};
  for(const kind of ['flash','smoke']){this.held[kind].position.copy(this.originalHeld.position);this.held[kind].visible=false;G.Viewmodel.gHandG.add(this.held[kind]);}
 };
 E.installUI=function(){
  const root=document.createElement('div');root.id='tactical-loadout';root.innerHTML='<h3 class="sub">M4A1 ライト・レーザー</h3><label class="field check"><input id="lo-light" type="checkbox"> ライトを取り付ける</label><label class="field check"><input id="lo-laser" type="checkbox"> レーザーを取り付ける</label><label class="field">レーザーの色<select id="lo-laser-color"><option value="red">赤</option><option value="green">緑</option></select></label><p class="small">装着と点灯は別です。戦闘中は L：ライト、K：レーザーのスイッチ（キー設定で変更可）。</p><h3 class="sub">投てき物ポーチ（各種2個・合計6個）</h3>'+types.map(k=>'<label class="field">'+names[k]+'<select id="lo-throw-'+k+'">'+[0,1,2].map(n=>'<option>'+n+'</option>').join('')+'</select></label>').join('')+'<p class="small" id="throw-loadout-note">N：投てき物を選択。G／マウス中央を長押しで構え、離して投げます。</p>';
  document.getElementById('lo-pistolsup').closest('label').after(root);
  const L=G.Game.loadout,$=id=>document.getElementById(id);$('lo-light').checked=L.light;$('lo-laser').checked=L.laser;$('lo-laser-color').value=L.laserColor;
  const pouchHeading=root.querySelectorAll('h3')[1];for(const id of ['pistol','shotgun']){const config=this.config(id),section=document.createElement('section');section.innerHTML='<h3 class="sub">'+(id==='pistol'?'ハンドガン':'ショットガン')+' ライト・レーザー</h3><label class="field check"><input type="checkbox" id="lo-light-'+id+'"> ライトを取り付ける</label><label class="field check"><input type="checkbox" id="lo-laser-'+id+'"> レーザーを取り付ける</label><label class="field">レーザーの色<select id="lo-color-'+id+'"><option value="red">赤</option><option value="green">緑</option></select></label>';root.insertBefore(section,pouchHeading);
    for(const kind of ['light','laser']){const box=$('lo-'+kind+'-'+id);box.checked=config[kind];box.onchange=()=>{config[kind]=box.checked;this.apply();G.Game.saveSettings();};}const color=$('lo-color-'+id);color.value=config.laserColor;color.onchange=()=>{config.laserColor=color.value;this.apply();G.Game.saveSettings();};
  }
  for(const k of types)$('lo-throw-'+k).value=L.throwables[k];
  for(const id of ['lo-light','lo-laser','lo-laser-color'])$(id).onchange=()=>{L.light=$('lo-light').checked;L.laser=$('lo-laser').checked;L.laserColor=$('lo-laser-color').value;this.apply();G.Game.saveSettings();};
  for(const k of types)$('lo-throw-'+k).onchange=()=>{const value=+$('lo-throw-'+k).value,other=types.filter(t=>t!==k).reduce((s,t)=>s+L.throwables[t],0);L.throwables[k]=Math.max(0,Math.min(value,2,6-other));$('lo-throw-'+k).value=L.throwables[k];$('throw-loadout-note').textContent='合計 '+types.reduce((s,t)=>s+L.throwables[t],0)+' / 6個。N：種類切替、G／マウス中央：構えて離すと投てき。';G.Game.saveSettings();if(G.Game.state==='menu')this.resetInventory();G.Menu?.loadoutSummary();};
 };
 E.apply=function(){if(!this.ready)return;for(const id of ['ar','pistol','shotgun']){const config=this.config(id),W=G.Viewmodel.weapons[id],module=this.modules[id],state=this.states[id];W.light.visible=!!config.light;module.laser.visible=!!config.laser;if(!config.light)state.light=false;if(!config.laser)state.laser=false;module.lens.material.color.setHex(config.laserColor==='green'?0x29ff57:0xff2929);}};
 E.toggle=function(kind){const config=this.config();if(!config[kind]){G.HUD.msg((kind==='light'?'ライト':'レーザー')+'が装着されていません');return;}this.on[kind]=!this.on[kind];G.HUD.msg((kind==='light'?'ライト':'レーザー')+(this.on[kind]?' ON':' OFF'));};
 E.resetInventory=function(){G.Player.throwables={...G.Game.loadout.throwables};this.selected=types.find(k=>this.count(k)>0)||'frag';for(const state of Object.values(this.states))state.light=state.laser=false;this.flashTime=0;this.flashOverlay.style.opacity=0;for(const cloud of this.clouds)this.removeCloud(cloud);this.clouds=[];this.selectHeld();};
 E.count=function(kind=this.selected){return G.Player.throwables?.[kind]||0;};
 E.consume=function(kind=this.selected){if(!this.count(kind))return null;G.Player.throwables[kind]--;return kind;};
 E.cycle=function(){const P=G.Player;if(P.gHold||P.throwPending>0||G.Viewmodel.state.gThrowT>=0)return;this.selected=types[(types.indexOf(this.selected)+1)%types.length];this.selectHeld();G.HUD.weapons();G.HUD.msg(names[this.selected]+' ×'+this.count());};
 E.selectHeld=function(){if(!this.held)return;for(const m of Object.values(this.held))m.visible=false;G.Viewmodel.gMesh=this.held[this.selected];G.Viewmodel.gMesh.visible=true;};
 E.buildThrowable=function(kind){const group=new T.Group(),mat=new T.MeshStandardMaterial({color:kind==='flash'?0x858c91:0x64704f,roughness:.75}),body=new T.Mesh(new T.CylinderGeometry(.035,.035,.13,14),mat);group.add(body);const band=new T.Mesh(new T.CylinderGeometry(.036,.036,.022,14),new T.MeshStandardMaterial({color:kind==='flash'?0x345993:0xdedbc7,roughness:.8}));group.add(band);const cap=new T.Mesh(new T.BoxGeometry(.03,.014,.04),new T.MeshStandardMaterial({color:0x282b29,roughness:.5}));cap.position.y=.072;group.add(cap);return group;};
 E.update=function(dt){
  if(!this.ready)return;const P=G.Player,config=this.config(),visible=G.Game.state==='playing'&&!P.dead&&!P.gHold&&!G.Doors.choice&&!G.Doors.manual&&!P.treat;
  const lightOn=visible&&this.on.light&&config.light,laserOn=visible&&this.on.laser&&config.laser;const color=config.laserColor==='green'?0x29ff57:0xff2929;this.dot.material.color.setHex(color);this.beam.material.color.setHex(color);
  // Keep the light in the shader layout while switched off. Changing visible or
  // castShadow on the first click recompiles every lit material during gameplay.
  this.light.visible=true;this.light.intensity=lightOn?4.4:0;this.light.castShadow=G.Game.quality!=='low';this.light.shadow.autoUpdate=!!lightOn;this.dot.visible=this.beam.visible=!!laserOn;
  if(lightOn||laserOn){const solved=G.Modules29.solve(),{origin,dir,end,distance,hit}=solved;this.laserSolution=solved;this.laserHit=hit;this.laserDistance=distance;
   this.light.position.copy(G.Modules29.safeOrigin('light'));this.light.target.position.copy(solved.target);this.light.distance=Math.min(24,distance+.15);this.light.castShadow=G.Game.quality!=='low';
   // Leave the spot on the actual surface, with a tiny normal offset to avoid z-fighting.
   this.dot.position.copy(end);if(hit&&!solved.actor)this.dot.position.addScaledVector(new T.Vector3(hit.nx,hit.ny,hit.nz),.001);else this.dot.position.addScaledVector(dir,-.001);
   this.dot.scale.setScalar(Math.min(.025,.004+distance*.00015));this.dot.visible=laserOn&&distance<99.99;
   const a=this.beam.geometry.attributes.position;a.setXYZ(0,origin.x,origin.y,origin.z);a.setXYZ(1,end.x,end.y,end.z);a.needsUpdate=true;
  }
  this.flashTime=Math.max(0,this.flashTime-dt);this.flashOverlay.style.opacity=String(G.Game.state==='playing'?Math.min(.96,this.flashTime/3):0);
  for(const actor of [...G.Enemies.list,...G.Allies.list])actor.blindT=Math.max(0,(actor.blindT||0)-dt);
  for(let i=this.clouds.length-1;i>=0;i--){const c=this.clouds[i];c.age+=dt;if(c.age>18){this.removeCloud(c);this.clouds.splice(i,1);continue;}c.opacity=Math.min(1,c.age/1.2,(18-c.age)/3);c.material.opacity=c.opacity*.4;for(let j=0;j<c.sprites.length;j++){const s=c.sprites[j],base=s.userData.base;s.position.set(c.center.x+base.x+Math.sin(c.age*.55+j)*.22,c.center.y+base.y+Math.sin(c.age*.37+j)*.12,c.center.z+base.z+Math.cos(c.age*.45+j)*.22);}}
  this.hud.hidden=G.Game.state!=='playing';this.hud.textContent=(G.keyName(G.Input.binds.flashlight)+' ライト '+(this.on.light&&config.light?'ON':'OFF')+'　'+G.keyName(G.Input.binds.laser)+' レーザー '+(this.on.laser&&config.laser?'ON':'OFF')+'　')+'N '+names[this.selected]+' ×'+this.count();
 };
 E.flash=function(center){
  const P=G.Player;for(const a of [P,...G.Enemies.list,...G.Allies.list]){if(a.dead)continue;const eye=a===P?G.camera.position:new T.Vector3(a.pos.x,1.6,a.pos.z);const d=eye.distanceTo(center);if(d>13||!G.World.lineOfSight(eye.x,eye.y,eye.z,center.x,center.y+.1,center.z))continue;let intensity=1-d/13;if(a===P){const f=G.camera.getWorldDirection(new T.Vector3()),toward=center.clone().sub(eye).normalize();intensity*=f.dot(toward)>.1?1:.35;this.flashTime=Math.max(this.flashTime,intensity*5);}else a.blindT=Math.max(a.blindT||0,intensity*5);}
  G.Audio.explosion(center,.35);G.Enemies.broadcast(center,35,'gunshot',false,null);
 };
 E.smoke=function(center){
  if(!this.smokeTexture){const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const x=canvas.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(210,214,206,.96)');g.addColorStop(.5,'rgba(205,211,205,.8)');g.addColorStop(1,'rgba(205,211,205,0)');x.fillStyle=g;x.fillRect(0,0,128,128);this.smokeTexture=new T.CanvasTexture(canvas);}
  const material=new T.SpriteMaterial({map:this.smokeTexture,transparent:true,depthWrite:false,opacity:0,color:0xb9c0b8});const cloud={center:center.clone(),age:0,opacity:0,material,sprites:[]};cloud.center.y=Math.max(.1,center.y);
  for(let i=0;i<30;i++){const a=i*2.39996,r=Math.sqrt((i+.5)/30)*2.4,s=new T.Sprite(material);s.userData.base=new T.Vector3(Math.cos(a)*r,.45+(i%5)*.4,Math.sin(a)*r);s.scale.set(2.6,2.6,1);this.scene.add(s);cloud.sprites.push(s);}
  this.clouds.push(cloud);while(this.clouds.length>4)this.removeCloud(this.clouds.shift());
 };
 E.removeCloud=function(c){for(const s of c.sprites)this.scene.remove(s);c.material.dispose();};
 E.smokeBlocks=function(ax,ay,az,bx,by,bz){const dx=bx-ax,dy=by-ay,dz=bz-az,length=Math.hypot(dx,dy,dz);if(length<.01)return false;let opacity=0;for(const c of this.clouds){if(c.opacity<.3)continue;const vx=ax-c.center.x,vz=az-c.center.z,A=dx*dx+dz*dz,B=2*(vx*dx+vz*dz),C=vx*vx+vz*vz-3.2*3.2;if(A<1e-8)continue;const det=B*B-4*A*C;if(det<=0)continue;const lo=Math.max(0,(-B-Math.sqrt(det))/(2*A)),hi=Math.min(1,(-B+Math.sqrt(det))/(2*A));if(hi<=lo)continue;const y=ay+dy*(lo+hi)/2;if(y<c.center.y-.2||y>c.center.y+3.5)continue;opacity+=(hi-lo)*length*c.opacity;}return opacity>1.2;};
 E.installSmokeSight=function(){const original=G.World.lineOfSight;G.World.lineOfSight=(ax,ay,az,bx,by,bz)=>original(ax,ay,az,bx,by,bz)&&!this.smokeBlocks(ax,ay,az,bx,by,bz);};
})();

'use strict';
// Owned Lite rigs. Each weapon keeps its authored arm/gun animation pair.
(()=>{
 const G=window.G,T=THREE,P=G.Player,VM=G.Viewmodel,N=G.FPSNative,O=G.FPSOther,X=G.Primary10;
 const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),Q=()=>new T.Quaternion(),smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
 const named=(root,name)=>{let result;root.traverse(o=>{if(o.name.replace(/ /g,'_')===name)result=o;});return result;};
 const E=G.FPSExtra10={states:{},ready:false,active:false,errors:[],events:[],reload:null};
 E.event=function(kind,data={}){this.events.push({time:G.time,kind,...data});if(this.events.length>100)this.events.shift();};
 E.select=O.select;E.sample=O.sample;E.bounds=O.bounds;
 const init=VM.init;VM.init=function(renderer){init.call(this,renderer);E.promise=E.load().catch(e=>{E.errors.push(e.stack);E.status.textContent='追加武器の読込に失敗: '+e.message;console.error(e);});};
 const nativeAllowed=N.allowed;N.allowed=function(){return (X.model()==='mx16'||!!N.selectedRifle())&&nativeAllowed.call(this);};
 E.load=async function(){
  this.status=document.createElement('p');this.status.className='small';this.status.textContent='Kar98K・PDW90 の購入素材を読込中…';document.getElementById('panel-settings').appendChild(this.status);
  await O.promise;const loader=new T.GLTFLoader(),armMats=new Map();N.arms.traverse(o=>{if(o.isMesh)armMats.set(o.material.name,o.material);});
  for(const key of ['kar98k','pdw90']){
   const [a,g]=await Promise.all(['arms','gun'].map(part=>loader.loadAsync('assets/fps-extra/'+key+'-'+part+'.glb'))),st={key,arms:a.scene,gun:g.scene,actions:[{},{}],mixers:[new T.AnimationMixer(a.scene),new T.AnimationMixer(g.scene)],fireTime:99};this.states[key]=st;
   st.rig=new T.Group();st.rig.name='Lite-'+key;VM.root.add(st.rig);st.motion=new T.Group();st.rig.add(st.motion);st.motion.add(a.scene);st.socket=named(a.scene,'VB_ik_hand_gun');if(!st.socket)throw Error(key+' socket missing');st.socket.add(g.scene);
   for(const [i,model]of[a,g].entries()){
    model.scene.traverse(o=>{if(!o.isMesh)return;o.frustumCulled=false;const old=o.material;if(i===0&&armMats.has(old.name)){o.material=armMats.get(old.name);for(const k of['map','normalMap','roughnessMap','metalnessMap','aoMap'])old[k]?.dispose();old.dispose();}else{o.material=old.clone();o.material.envMapIntensity=.4;}const glass=i===1&&old.name==='M_PDW90_Magazine_Color_Mat';o.material.transparent=glass;o.material.opacity=1;o.material.depthTest=true;o.material.depthWrite=!glass;if(old.name==='M_PDW90_Silencer_Body_Mat')st.nativeSup=o;
     const geo=o.geometry,w=geo.attributes.skinWeight,n=geo.attributes.normal;if(w?.normalized){const divisor=w.array instanceof Uint8Array?255:65535;geo.setAttribute('skinWeight',new T.Float32BufferAttribute(Array.from(w.array,x=>x/divisor),w.itemSize));}
     if(n){let bad=0;for(let v=0;v<n.count;v++)if(V().fromBufferAttribute(n,v).lengthSq()<.01)bad++;if(bad){const tmp=geo.clone();tmp.computeVertexNormals();for(let v=0;v<n.count;v++)if(V().fromBufferAttribute(n,v).lengthSq()<.01)n.setXYZ(v,tmp.attributes.normal.getX(v),tmp.attributes.normal.getY(v),tmp.attributes.normal.getZ(v));tmp.dispose();n.needsUpdate=true;if(geo.index&&geo.attributes.uv)geo.computeTangents();st.normalRepairs=bad;}}
    });
    for(const clip of model.animations){const act=st.mixers[i].clipAction(clip);act.setLoop(T.LoopOnce,1);act.clampWhenFinished=true;st.actions[i][clip.name]=act;}
   }
   st.pose=key==='kar98k'?'pose':'reload';this.select(st,st.pose);this.sample(st,0);st.eye=named(a.scene,'head').getWorldPosition(V()).add(V(0,.04,-.02));st.poseGunMatrix=g.scene.matrixWorld.clone();st.bounds=this.bounds(st);
   st.muzzle=new T.Group();st.muzzle.rotation.y=Math.PI;g.scene.add(st.muzzle);st.ejection=new T.Object3D();g.scene.add(st.ejection);
   st.clipBone=named(g.scene,'Clip');st.cartridge=named(g.scene,'Cartridge');this.accessories(st);if(key==='pdw90')this.repairLens(st);st.rig.visible=false;
  }
  for(const s of Object.values(this.states))s.rig.visible=true;G.Game.renderer.compile(VM.scene,VM.cam);for(const s of Object.values(this.states))s.rig.visible=false;
  this.ready=true;this.status.textContent='Kar98K・PDW90：購入素材の腕・銃・装填動作を使用。PDW90の保持姿勢はリロード先頭、射撃反動はHTML側の仮実装です。';
  this.sound.load();this.frame({dt:0});
 };
 E.accessories=function(st){
  const kar=st.key==='kar98k',bb=st.bounds,mat=new T.MeshStandardMaterial({color:new T.Color(0x20252a).convertSRGBToLinear(),metalness:.5,roughness:.65,envMapIntensity:.3});
  // Initial rail positions are inspected against the deformed source mesh in QA.
  st.rail={y:.021,z:.30};st.optics={};st.mounts={};
  for(const name of['scope','dot']){const opt=VM.weapons.ar[name].clone(true);opt.position.set(0,st.rail.y+(name==='scope'?.055:-.075),st.rail.z);opt.rotation.y=Math.PI;st.gun.add(opt);st.optics[name]=opt;
   const mount=new T.Group();st.gun.add(mount);st.mounts[name]=mount;const bridge=new T.Mesh(new T.BoxGeometry(.032,.008,.22),mat);bridge.position.set(0,.019,.30);mount.add(bridge);for(const z of[.21,.39]){const clamp=new T.Mesh(new T.BoxGeometry(.038,.016,.025),mat);clamp.position.set(0,.013,z);mount.add(clamp);}if(name==='scope')for(const z of[.25,.35]){const clamp=new T.Mesh(new T.BoxGeometry(.034,.012,.02),mat);clamp.position.set(0,.026,z);mount.add(clamp);}}
  st.sights={iron:kar?[V(0,.025,.225),V(0,.017,.698)]:[V(0,.1254,.155),V(0,.1254,.18)],dot:kar?[V(0,.054,.315),V(0,.054,.35)]:[V(0,.1254,.155),V(0,.1254,.18)],scope:[V(0,.076,.175),V(0,.076,.46)]};this.fit(st);
  st.muzzleBase=V(0,kar?-.002:.0023,kar?.7167:.283);st.muzzle.position.copy(st.muzzleBase);st.ejection.position.set(-.02,kar?.02:-.075,kar?.00:-.10);
  st.mount=new T.Group();st.mount.position.set(0,kar?-.005:.002,kar?.54:.235);st.mount.rotation.y=Math.PI;st.gun.add(st.mount);
  const clamp=new T.Mesh(new T.BoxGeometry(.075,.018,.035),mat);st.mount.add(clamp);
  st.light=VM.weapons.ar.light.clone(true);st.light.position.set(-.035,-.015,0);st.mount.add(st.light);
  st.laser=G.Equipment.modules.ar.laser.clone(true);st.laser.position.set(.035,-.012,0);st.laser.children[1].material=st.laser.children[1].material.clone();st.mount.add(st.laser);
  st.sup=new T.Mesh(new T.CylinderGeometry(.02,.02,.18,20),mat);st.sup.rotation.x=Math.PI/2;st.sup.position.copy(st.muzzleBase).add(V(0,0,.08));st.gun.add(st.sup);
 };
 E.repairLens=function(st){
  // The source's lens shares the translucent magazine material with alpha .8.
  // Split only the lens faces, identified in the deformed local pose, retaining
  // all vertex/skin/UV data and the magazine's original material.
  const inv=st.gun.matrixWorld.clone().invert();st.gun.traverse(m=>{if(!m.isSkinnedMesh||m.material.name!=='M_PDW90_Magazine_Color_Mat')return;m.skeleton.update();const geo=m.geometry,ix=geo.index,p=geo.attributes.position,flags=[];let count=0;
   for(let i=0;i<ix.count;i+=3){const vs=[0,1,2].map(k=>{const id=ix.getX(i+k),v=V().fromBufferAttribute(p,id);return m.boneTransform(id,v).applyMatrix4(m.matrixWorld).applyMatrix4(inv);});const lens=vs.every(v=>v.y>.105&&v.z>.160&&v.z<.165);flags.push(lens?1:0);if(lens)count++;}
   if(count<12||count>40)throw Error('PDW lens bounds changed: '+count);geo.clearGroups();let from=0;for(let t=1;t<=flags.length;t++)if(t===flags.length||flags[t]!==flags[from]){geo.addGroup(from*3,(t-from)*3,flags[from]);from=t;}
   const glass=new T.MeshStandardMaterial({name:'PDW-clear-lens',color:0xd5e6eb,roughness:.08,metalness:.05,transparent:true,opacity:.035,depthWrite:false,side:T.DoubleSide});m.material=[m.material,glass];st.lensFaces=count;
  });
 };
 E.fit=function(st){st.aims={};for(const[key,[back,front]]of Object.entries(st.sights)){const rear=back.clone().applyMatrix4(st.poseGunMatrix),dir=front.clone().applyMatrix4(st.poseGunMatrix).sub(rear).normalize(),q=Q().setFromUnitVectors(dir,V(0,0,1)),relief=key==='scope'?.16:key==='dot'?.23:.34;st.aims[key]={q,offset:st.eye.clone().add(V(0,0,relief)).sub(rear.applyQuaternion(q))};}};
 E.allowed=function(){const s=VM.state;return this.ready&&VM.cur==='ar'&&!!this.states[X.model()]&&!VM.oneArm&&s.knifeT<0&&!s.gHold&&s.gThrowT<0&&s.gK<.02;};
 E.cycling=()=>VM.cur==='ar'&&X.model()==='kar98k'&&E.states.kar98k?.fireTime<1.5;
 E.frame=function(frame){
  for(const st of Object.values(this.states))st.fireTime+=frame.dt;this.active=!!this.allowed();for(const st of Object.values(this.states))st.rig.visible=this.active&&st.key===X.model();if(!this.active)return;
  const st=this.states[X.model()],s=VM.state,R=this.reload,cycle=st.key==='kar98k'&&st.fireTime<1.5,name=R?R.phase:cycle?'fire':st.pose;this.select(st,name);this.sample(st,R?R.t:cycle?st.fireTime:0);if(st.key==='kar98k'&&name==='pose'){st.clipBone.scale.setScalar(0);st.cartridge.scale.setScalar(0);}
  const optic=VM.att.ar.optic||'iron',aim=st.aims[optic],ads=R||cycle||s.att?0:smooth(s.ads),offset=V(0,-.08,.12).lerp(aim.offset,ads);st.motion.quaternion.copy(Q().slerp(aim.q,ads));st.motion.position.copy(offset).sub(st.eye);
  const extra=VM.pivot.position.clone().sub(VM.HIP.clone().lerp(VM.ADS,smooth(s.ads))),rot=VM.pivot.rotation.clone();if(R){extra.set(s.swayX||0,(s.dip||0)*.05,0);rot.set(0,0,0);}else extra.multiplyScalar(1-ads);VM.applyAttachPose(extra,rot);st.rig.position.copy(extra);st.rig.quaternion.setFromEuler(rot).multiply(Q().setFromAxisAngle(V(0,1,0),Math.PI));
  for(const name of['scope','dot'])st.optics[name].visible=st.mounts[name].visible=st.key==='kar98k'&&optic===name;const cfg=G.Equipment.config('ar');st.mount.visible=!!(cfg.light||cfg.laser);st.light.visible=!!cfg.light;st.laser.visible=!!cfg.laser;st.laser.children[1].material.color.copy(G.Equipment.modules.ar.lens.material.color);st.sup.visible=st.key==='kar98k'&&!!VM.att.ar.sup;if(st.nativeSup)st.nativeSup.visible=!!VM.att.ar.sup;st.muzzle.position.copy(st.muzzleBase).add(V(0,0,VM.att.ar.sup?(st.key==='pdw90'?.164:.18):0));
  N.active=false;N.rig.visible=false;VM.pivot.visible=VM.rArm.g.visible=VM.lArm.g.visible=false;if(VM.flash.parent!==st.muzzle)st.muzzle.add(VM.flash);st.rig.updateMatrixWorld(true);if(s.flashT>0)st.muzzle.getWorldPosition(VM.flashLight.position);if(st.pendingCase&&st.fireTime>=.65){this.eject(st);st.pendingCase=false;}
 };
 E.start=function(empty){const key=X.model(),st=this.states[key];this.cancel();VM.state.reload=VM.state.shell=null;const need=Math.min(P.W().mag-P.ammo,P.reserve),phase=key==='pdw90'?(empty?'empty':'reload'):empty&&need===5?'empty':'start';this.reload={key,gunId:G.WeaponInventory.slots.ar.id,phase,t:0,empty,need,inserted:0};this.event('reload-start',{key,empty,phase,need});};
 E.commit=function(n){const R=this.reload,w=P.wst.ar,take=Math.max(0,Math.min(n,R.need-R.inserted,P.W().mag-w.ammo,w.reserve));w.ammo+=take;w.reserve-=take;R.inserted+=take;G.WeaponInventory.capture('ar');G.HUD.ammo();this.event('reload-commit',{key:R.key,take,ammo:w.ammo,reserve:w.reserve});};
 E.cancel=function(){if(this.reload)this.event('reload-cancel',{key:this.reload.key,inserted:this.reload.inserted});this.reload=null;this.sound?.stop();};
 E.tick=function(dt){const R=this.reload;if(!R)return;if(P.dead||P.cur!=='ar'||X.model()!==R.key||G.WeaponInventory.slots.ar?.id!==R.gunId||!P.reloading){this.cancel();return;}const st=this.states[R.key];R.t+=dt*(VM.reloadRate||1);const dur=st.actions[0][R.phase].getClip().duration;if(R.t<dur)return;
  R.t=0;if(R.key==='kar98k'&&R.phase!=='empty'){if(R.phase==='insert')this.commit(1);if(R.phase!=='end'){R.phase=R.inserted<R.need?'insert':'end';return;}}else this.commit(R.need);
  P.reloading=false;this.event('reload-finish',{key:R.key,inserted:R.inserted});this.cancel();G.HUD.ammo();
 };
 for(const name of['cancelReload','resetActions','equip']){const old=VM[name];VM[name]=function(...args){E.cancel();return old.apply(this,args);};}
 const start=VM.startReload;VM.startReload=function(empty){if(E.ready&&this.cur==='ar'&&E.states[X.model()])return E.start(empty);return start.call(this,empty);};
 const update=VM.update;VM.update=function(st){const r=update.call(this,st);E.tick(st.dt);if(E.ready)E.frame(st);E.sound?.frame();return r;};
 const fire=VM.fire;VM.fire=function(){fire.call(this);if(this.cur==='ar'&&E.states[X.model()]){const st=E.states[X.model()];st.fireTime=0;if(st.key==='kar98k')st.pendingCase=true;}};
 VM.visualMuzzle=function(){const st=E.states[X.model()];if(E.active&&this.cur==='ar'&&st)return st.muzzle;if(O.active&&O.states[this.cur])return this.cur==='shotgun'&&G.Shotguns26?.native.active?G.Shotguns26.native.muzzle:O.states[this.cur].muzzle;if(N.active&&this.cur==='ar')return N.activeRifle?.muzzle||N.muzzle;return this.muzzle;};
 E.eject=function(st){const cam=G.camera,at=VM.ejectionPosition(st.ejection,V()).applyQuaternion(cam.quaternion).add(cam.position),c=G.Effects.ejectCasing(at,V(1,0,0).applyQuaternion(cam.quaternion),'ar',0,V(0,0,-1).applyQuaternion(cam.quaternion));if(st.key==='pdw90')c.vel.set(0,-1.2,0).applyQuaternion(cam.quaternion);return c;};
 const eject=G.Effects.ejectPlayerCasing;G.Effects.ejectPlayerCasing=function(kind){if(!E.active||kind!=='ar')return eject.call(this,kind);if(X.model()==='pdw90')return E.eject(E.states.pdw90);};
 const reload=P.tryReload;P.tryReload=function(){if(this.cur==='ar'&&X.model()!=='mx16'&&(!E.ready||E.cycling()))return;return reload.apply(this,arguments);};
 const begin=G.Game.begin;G.Game.begin=function(){if(this.loadout.primaryModel!=='mx16'&&!E.ready){document.getElementById('menu-note').textContent='選択した追加武器を読込中です。読込完了後に出撃できます。';return;}return begin.apply(this,arguments);};
 const reset=P.reset;P.reset=function(){E.cancel();E.active=false;for(const st of Object.values(E.states)){st.fireTime=99;st.pendingCase=false;st.rig.visible=false;}return reset.call(this);};
 const hud=G.HUD.update;G.HUD.update=function(dt){hud.call(this,dt);if(E.reload&&P.reloading){const R=E.reload,d=E.states[R.key].actions[0][R.phase].getClip().duration;document.getElementById('reload-fill').style.width=(100*Math.min(1,R.t/d))+'%';}if(E.cycling())document.getElementById('scope').classList.remove('on');};
 const visible=VM.setVisible;VM.setVisible=function(on){return visible.call(this,E.cycling()?true:on);};
 E.sound={buffers:{},ready:false,sources:[],events:[],load:async function(){try{const keys=['kar-bolt-open','kar-bolt-close','kar-insert','pdw-empty','pdw-tactical'];this.raw=await Promise.all(keys.map(async k=>{const r=await fetch('audio-candidates/'+k+'.wav');if(!r.ok)throw Error(k+' '+r.status);return[k,await r.arrayBuffer()];}));if(G.Audio.ctx)await this.prepare();}catch(e){E.errors.push('Sound: '+e.message);}},prepare:function(){if(!this.raw||!G.Audio.ctx)return;if(this.promise)return this.promise;return this.promise=(async()=>{for(const[k,data]of this.raw)this.buffers[k]=await G.Audio.ctx.decodeAudioData(data.slice(0));this.ready=true;})().catch(e=>E.errors.push('Decode: '+e.message));},stop:function(){for(const src of this.sources){try{src.stop();}catch{}src.disconnect();}this.sources=[];this.current=null;},timeline:function(R){if(R.key==='pdw90')return[[0,R.empty?'pdw-empty':'pdw-tactical']];return R.phase==='empty'?[[0,'kar-bolt-open'],[1.9,'kar-insert'],[2.8,'kar-bolt-close']]:[[0,{start:'kar-bolt-open',insert:'kar-insert',end:'kar-bolt-close'}[R.phase]]];},play:function(key,offset=0,rate=1,delay=0){const b=this.buffers[key],A=G.Audio;if(!b||!A.ok||offset>=b.duration)return;const out=A.out(null,.7,{life:delay+b.duration/rate+.1,reverb:.06,category:'guns',important:true});if(!out)return;const src=A.ctx.createBufferSource();src.buffer=b;src.playbackRate.value=rate;src.connect(out);src.start(A.ctx.currentTime+delay,Math.max(0,offset));src.onended=()=>{src.disconnect();const i=this.sources.indexOf(src);if(i>=0)this.sources.splice(i,1);};this.sources.push(src);this.events.push({key,offset,rate,delay});if(this.events.length>50)this.events.shift();},frame:function(){const R=E.reload;if(!R||G.Game.state!=='playing'){this.stop();return;}if(!this.ready){this.prepare();return;}const rate=VM.reloadRate||1,token=R.key+':'+R.phase+':'+R.inserted;if(this.current!==R||this.token!==token||Math.abs(this.rate-rate)>.01){this.stop();this.current=R;this.token=token;this.rate=rate;for(const[t,key]of this.timeline(R))this.play(key,Math.max(0,R.t-t),rate,Math.max(0,t-R.t)/rate);}}};
 const audioInit=G.Audio.init;G.Audio.init=function(){const r=audioInit.apply(this,arguments);E.sound.prepare();return r;};
 const pause=G.Game.pause;G.Game.pause=function(){E.sound.stop();return pause.apply(this,arguments);};addEventListener('blur',()=>E.sound.stop());addEventListener('pagehide',()=>E.sound.stop());
 const monitor=()=>{if(E.sound.sources.length&&(G.Game.state!=='playing'||document.hidden))E.sound.stop();requestAnimationFrame(monitor);};requestAnimationFrame(monitor);
})();

'use strict';
(()=>{
 const G=window.G,T=THREE,VM=G.Viewmodel,N=G.FPSNative,P=G.Player,V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),Q=()=>new T.Quaternion(),smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
 const named=(root,name)=>{let found;root.traverse(o=>{if(!found&&o.name.replace(/ /g,'_')===name)found=o;});return found;};
 const O=G.FPSOther={states:{},ready:false,active:false,errors:[],reload:null,events:[],spent:0};
 O.event=function(kind,data={}){this.events.push({time:G.time,kind,...data});if(this.events.length>80)this.events.shift();};
 // These two player slots now use the owned models' mechanisms. Other actor
 // ammunition remains the game's shared-family abstraction, not calibre simulation.
 Object.assign(G.WEAPONS.pistol,{name:'M1911 · FPS Lite',mag:7,reserve:56,maxReserve:84});
 Object.assign(G.WEAPONS.shotgun,{name:'Drake-12 · 上下二連',mag:2,interval:.3});
 const init=VM.init;VM.init=function(renderer){init.call(this,renderer);O.promise=O.load().catch(e=>{O.errors.push(e.stack);O.status.textContent='購入素材の読込に失敗：'+e.message;console.error(e);});};
 O.select=function(st,name){if(st.clip===name)return;st.clip=name;for(let i=0;i<2;i++){st.mixers[i].stopAllAction();st.actions[i][name].reset().play();}};
 O.sample=function(st,time){for(let i=0;i<2;i++){const a=st.actions[i][st.clip];a.enabled=true;a.paused=false;a.time=Math.max(0,Math.min(time,a.getClip().duration-.00001));st.mixers[i].update(0);}st.rig.updateMatrixWorld(true);};
 O.bounds=function(st){const box=new T.Box3(),inverse=st.gun.matrixWorld.clone().invert();st.gun.traverse(m=>{if(!m.isMesh)return;m.skeleton?.update();const p=m.geometry.attributes.position;for(let i=0;i<p.count;i++){const v=V().fromBufferAttribute(p,i);if(m.isSkinnedMesh)m.boneTransform(i,v);v.applyMatrix4(m.matrixWorld).applyMatrix4(inverse);box.expandByPoint(v);}});return box;};
 O.load=async function(){
  const section=document.createElement('div');section.className='field';section.innerHTML='<strong>購入Lite：M1911・Drake-12</strong><p class="small" id="fps-other-status">腕と銃を読み込み中…</p>';document.getElementById('panel-settings').appendChild(section);this.status=section.querySelector('p');
  await N.promise;const loader=new T.GLTFLoader(),armMats=new Map();N.arms.traverse(o=>{if(o.isMesh)armMats.set(o.material.name,o.material);});
  for(const key of ['pistol','shotgun']){
   const [a,g]=await Promise.all(['arms','gun'].map(part=>loader.loadAsync('assets/fps-other/'+key+'-'+part+'.glb'))),st={key,arms:a.scene,gun:g.scene,actions:[{},{}],mixers:[new T.AnimationMixer(a.scene),new T.AnimationMixer(g.scene)],fireTime:99};this.states[key]=st;
   st.rig=new T.Group();st.rig.name='Lite-'+key;VM.root.add(st.rig);st.motion=new T.Group();st.rig.add(st.motion);st.motion.add(a.scene);st.socket=named(a.scene,'VB_ik_hand_gun');if(!st.socket)throw Error(key+' socket missing');st.socket.add(g.scene);
   for(const [i,model]of [a,g].entries()){model.scene.traverse(o=>{if(!o.isMesh)return;o.frustumCulled=false;if(i===0&&armMats.has(o.material.name)){const old=o.material;o.material=armMats.get(old.name);for(const k of ['map','normalMap','roughnessMap','metalnessMap','aoMap'])old[k]?.dispose();old.dispose();}else{o.material=o.material.clone();o.material.envMapIntensity=.45;}o.material.transparent=false;o.material.opacity=1;o.material.depthWrite=true;o.material.depthTest=true;
    const geo=o.geometry,n=geo.attributes.normal,w=geo.attributes.skinWeight;
    // r136's CPU boneTransform reads raw normalized integers, unlike the shader.
    // Explicit float weights preserve GPU deformation and make CPU fit/raycast agree.
    if(w?.normalized){const divisor=w.array instanceof Uint8Array?255:65535;geo.setAttribute('skinWeight',new T.Float32BufferAttribute(Array.from(w.array,x=>x/divisor),w.itemSize));}
    if(n){let bad=0;for(let v=0;v<n.count;v++)if(V().fromBufferAttribute(n,v).lengthSq()<.01)bad++;if(bad){const tmp=geo.clone();tmp.computeVertexNormals();for(let v=0;v<n.count;v++)if(V().fromBufferAttribute(n,v).lengthSq()<.01)n.setXYZ(v,tmp.attributes.normal.getX(v),tmp.attributes.normal.getY(v),tmp.attributes.normal.getZ(v));tmp.dispose();n.needsUpdate=true;if(geo.index&&geo.attributes.uv)geo.computeTangents();st.normalRepairs=bad;}}
   });for(const clip of model.animations){const act=st.mixers[i].clipAction(clip);act.setLoop(T.LoopOnce,1);act.clampWhenFinished=true;st.actions[i][clip.name]=act;}}
   this.select(st,'pose');this.sample(st,0);st.eye=named(a.scene,'head').getWorldPosition(V()).add(V(0,.04,-.02));st.poseGunMatrix=g.scene.matrixWorld.clone();st.bounds=this.bounds(st);
   st.slider=named(g.scene,'Slider');if(st.slider){st.sliderRest=st.slider.position.clone();const open=st.actions[1].empty;st.actions[1].pose.stop();open.reset().play();st.mixers[1].update(0);st.sliderFire=st.slider.position.clone();open.stop();st.actions[1].pose.reset().play();this.sample(st,0);}
   st.rounds=['12Gauge0','12Gauge1'].map(n=>named(g.scene,n)).filter(Boolean);st.rounds.forEach(r=>r.userData.liteBaseScale=r.scale.clone());
   const bb=st.bounds;st.sight=key==='pistol'?[V(0,.016365,-.047),V(0,.016344,.120)]:[V(0,.02939,-.08),V(0,.02939,.707)];
   this.fit(st);st.muzzle=new T.Group();st.muzzle.rotation.y=Math.PI;st.muzzle.position.set(0,bb.max.y-(key==='pistol'?.023:.027),bb.max.z+.004);g.scene.add(st.muzzle);st.muzzleBase=st.muzzle.position.clone();st.ejection=new T.Object3D();st.ejection.position.set(-.025,bb.max.y-.025,key==='pistol'?.02:.1);g.scene.add(st.ejection);
   const mat=new T.MeshStandardMaterial({color:new T.Color(0x202526).convertSRGBToLinear(),metalness:.35,roughness:.7,envMapIntensity:.25});
   st.mount=new T.Group();st.mount.position.set(0,bb.max.y-(key==='pistol'?.057:.067),key==='pistol'?bb.max.z-.052:bb.max.z-.16);st.mount.rotation.y=Math.PI;g.scene.add(st.mount);const clamp=new T.Mesh(new T.BoxGeometry(.065,.014,.065),mat);st.mount.add(clamp);
   st.light=VM.weapons[key].light.clone(true);st.light.position.set(-.03,-.016,0);st.light.scale.setScalar(key==='pistol'?.52:.7);st.mount.add(st.light);
   st.laser=G.Equipment.modules[key].laser.clone(true);st.laser.position.set(.03,-.012,0);st.laser.scale.setScalar(key==='pistol'?.6:.75);st.laser.children[1].material=st.laser.children[1].material.clone();st.mount.add(st.laser);
   if(key==='pistol'){st.sup=new T.Mesh(new T.CylinderGeometry(.017,.017,.14,16),mat);st.sup.rotation.x=Math.PI/2;st.sup.position.copy(st.muzzleBase).add(V(0,0,.065));g.scene.add(st.sup);}
   st.rig.visible=false;
  }
  for(const st of Object.values(this.states))st.rig.visible=true;G.Game.renderer.compile(VM.scene,VM.cam);for(const st of Object.values(this.states))st.rig.visible=false;
  this.ready=true;this.status.textContent='M1911：7発、Drake-12：2発。購入素材の両腕・銃・通常／空装填を使用。治療・投てき・片腕などは従来動作。弾薬はゲームの共通規格で、口径別管理は未実装です。';
  const note=document.getElementById('menu-note');if(note.dataset.liteWaiting){note.textContent='購入素材の読み込みが完了しました。出撃できます。';delete note.dataset.liteWaiting;}
  const sound=document.querySelector('#fps-sound-mode')?.closest('label');if(sound)sound.insertAdjacentHTML('afterend','<p class="small">M1911・Drake-12は購入素材の装填音を使用。射撃音は従来音を保持します。</p>');
  for(const el of document.querySelectorAll('#panel-loadout p,#loadout-sum')){el.textContent=el.textContent.replace('装填6発','装填2発').replace('合計36発','合計32発');}
  this.sound.load();this.frame({dt:0});
 };
 O.fit=function(st){const rear=st.sight[0].clone().applyMatrix4(st.poseGunMatrix),dir=st.sight[1].clone().applyMatrix4(st.poseGunMatrix).sub(rear).normalize();st.aim={q:Q().setFromUnitVectors(dir,V(0,0,1))};const relief=st.key==='pistol'?.31:.38;st.aim.offset=st.eye.clone().add(V(0,0,relief)).sub(rear.applyQuaternion(st.aim.q));};
 O.allowed=function(){const s=VM.state;return this.ready&&this.states[VM.cur]&&!VM.oneArm&&s.knifeT<0&&!s.gHold&&s.gThrowT<0&&s.gK<.02;};
 O.frame=function(st){
  this.active=!!this.allowed();for(const state of Object.values(this.states))state.rig.visible=this.active&&state.key===VM.cur;const native=G.Shotguns26?.native;if(native){const leaving=native.active&&!(this.active&&VM.cur==='shotgun'&&G.Shotguns26.spades()&&native.ready);if(leaving){native.base.clip=null;this.select(native.base,'pose');this.sample(native.base,0);}native.active=false;if(native.anchor)native.anchor.visible=false;if(native.base)native.base.gun.visible=true;}if(!this.active)return;if(VM.cur==='shotgun'&&G.Shotguns26?.spades()&&native?.ready){native.frame(st);return;}
  const state=this.states[VM.cur],s=VM.state,R=this.reload,name=R?.weapon===VM.cur?(R.empty?'empty':'reload'):'pose';state.rounds.forEach(r=>r.scale.copy(r.userData.liteBaseScale));this.select(state,name);this.sample(state,R?.weapon===VM.cur?R.t:0);state.fireTime+=st.dt;
  if(VM.cur==='shotgun'){const count=Math.min(2,P.ammo+(R?.requested||0));state.rounds.forEach((r,i)=>{if(i>=count)r.scale.setScalar(0);});}
  if(state.slider&&name==='pose'){const k=P.ammo===0?1:state.fireTime<.14?Math.sin(Math.PI*state.fireTime/.14):0;const diff=state.sliderFire.clone().sub(state.sliderRest);state.slider.position.copy(state.sliderRest).addScaledVector(diff,k);}
  const ads=R||s.att?0:smooth(s.ads),hip=V(0,VM.cur==='shotgun'?-.10:-.08,.12),offset=hip.lerp(state.aim.offset,ads);state.motion.quaternion.copy(Q().slerp(state.aim.q,ads));state.motion.position.copy(offset).sub(state.eye);
  const extra=VM.pivot.position.clone().sub(VM.HIP.clone().lerp(VM.ADS,smooth(s.ads))),rotation=VM.pivot.rotation.clone();if(R){extra.set(s.swayX||0,(s.dip||0)*.05,0);rotation.set((s.kickRx||0)*.05,0,0);}else extra.multiplyScalar(1-ads);
  VM.applyAttachPose(extra,rotation);state.rig.position.copy(extra);state.rig.quaternion.setFromEuler(rotation).multiply(Q().setFromAxisAngle(V(0,1,0),Math.PI));state.rig.updateMatrixWorld(true);
  const cfg=G.Equipment.config(VM.cur);state.mount.visible=!!(cfg.light||cfg.laser);state.light.visible=!!cfg.light;state.laser.visible=!!cfg.laser;state.laser.children[1].material.color.copy(G.Equipment.modules[VM.cur].lens.material.color);
  if(state.sup){state.sup.visible=VM.att.pistol.sup;state.muzzle.position.copy(state.muzzleBase).add(V(0,0,state.sup.visible?.14:0));}
  N.rig.visible=false;VM.pivot.visible=VM.rArm.g.visible=VM.lArm.g.visible=false;if(VM.flash.parent!==state.muzzle)state.muzzle.add(VM.flash);if(s.flashT>0)state.muzzle.getWorldPosition(VM.flashLight.position);
 };
 O.start=function(weapon,empty){const st=this.states[weapon];if(!st)return false;this.cancel();VM.state.reload=VM.state.shell=null;const name=empty?'empty':'reload';this.reload={weapon,empty,t:0,dur:st.actions[0][name].getClip().duration,kind:P.wst.shotgun.kind,requested:Math.min(G.WEAPONS[weapon].mag-P.wst[weapon].ammo,P.wst[weapon].reserve)};this.event('reload-start',{weapon,empty,duration:this.reload.dur});return true;};
 O.cancel=function(){const native=G.Shotguns26?.native;if(native){native.casePending=false;native.fireTime=99;}if(this.reload)this.event('reload-cancel',{weapon:this.reload.weapon,time:this.reload.t});this.reload=null;this.sound.stop();};
 O.tick=function(dt){const R=this.reload;if(!R)return;if(R.native){G.Shotguns26.native.tick(dt);return;}if(P.dead||P.cur!==R.weapon||!P.reloading){this.cancel();return;}R.t+=dt*(VM.reloadRate||1);
  if(R.t>=R.dur){const st=P.wst[R.weapon],take=Math.max(0,Math.min(R.requested,G.WEAPONS[R.weapon].mag-st.ammo,st.reserve));st.ammo+=take;st.reserve-=take;P.reloading=false;VM.state.slideLock=false;this.event('reload-finish',{weapon:R.weapon,take});if(R.weapon==='shotgun')this.spent=0;this.reload=null;this.sound.stop();G.HUD.ammo();}
 };
 for(const name of ['cancelReload','resetActions','equip']){const old=VM[name];VM[name]=function(...args){O.cancel();return old.apply(this,args);};}
 const start=VM.startReload;VM.startReload=function(empty){if(O.ready&&this.cur==='pistol'){O.start('pistol',empty);return;}return start.call(this,empty);};
 const shell=VM.startShellReload;VM.startShellReload=function(count,empty){if(O.ready){O.start('shotgun',empty);return;}return shell.call(this,count,empty);};
 const update=VM.update;VM.update=function(st){const result=update.call(this,st);O.tick(st.dt);if(O.ready)O.frame(st);O.sound.frame();return result;};
 const fire=VM.fire;VM.fire=function(){fire.call(this);const st=O.states[this.cur];if(st){st.fireTime=0;if(this.cur==='shotgun')O.spent=Math.min(2,O.spent+1);}};
 const muzzle=VM.visualMuzzle;VM.visualMuzzle=function(){return O.active?(G.Shotguns26?.native.active?G.Shotguns26.native.muzzle:O.states[this.cur].muzzle):muzzle.call(this);};
 const eject=G.Effects.ejectPlayerCasing;G.Effects.ejectPlayerCasing=function(kind){if(!O.active||kind!=='pistol')return eject.call(this,kind);const cam=G.camera,st=O.states.pistol,at=VM.ejectionPosition(st.ejection,V()).applyQuaternion(cam.quaternion).add(cam.position),right=V(1,0,0).applyQuaternion(cam.quaternion),forward=V(0,0,-1).applyQuaternion(cam.quaternion);return this.ejectCasing(at,right,kind,0,forward);};
 const begin=G.Game.begin;G.Game.begin=function(){if(!O.ready){const note=document.getElementById('menu-note');note.textContent='購入素材を準備しています。読み込み完了後に出撃できます。';note.dataset.liteWaiting='1';return;}return begin.apply(this,arguments);};
 const reload=P.tryReload;P.tryReload=function(){if(['pistol','shotgun'].includes(this.cur)&&!O.ready){G.HUD.msg('購入素材の読込をお待ちください');return;}return reload.apply(this,arguments);};
 const reset=P.reset;P.reset=function(){O.cancel();O.spent=0;return reset.call(this);};
 const hud=G.HUD.update;G.HUD.update=function(dt){hud.call(this,dt);if(O.reload&&P.reloading)document.getElementById('reload-fill').style.width=Math.round(Math.min(1,O.reload.t/O.reload.dur)*100)+'%';};
 O.sound={buffers:{},ready:false,sources:[],events:[],load:async function(){try{const keys=['pistol-tactical','pistol-empty','drake-empty','drake-start','drake-insert','drake-end'];this.raw=await Promise.all(keys.map(async k=>{const r=await fetch('audio-candidates/'+k+'.wav');if(!r.ok)throw Error(k+' '+r.status);return[k,await r.arrayBuffer()];}));if(G.Audio.ctx)await this.prepare();}catch(e){O.errors.push('Sound: '+e.message);}},prepare:function(){if(!this.raw||!G.Audio.ctx)return;if(this.promise)return this.promise;return this.promise=(async()=>{for(const[k,data]of this.raw)this.buffers[k]=await G.Audio.ctx.decodeAudioData(data.slice(0));this.ready=true;})().catch(e=>O.errors.push('Decode: '+e.message));},stop:function(){for(const src of this.sources){try{src.stop();}catch{}src.disconnect();}this.sources=[];this.current=null;},timeline:function(R){if(R.weapon==='pistol')return [[0,'pistol-'+(R.empty?'empty':'tactical')]];return R.empty?[[0,'drake-empty']]:[[0,'drake-start'],[.87,'drake-insert'],[1.83,'drake-end']];},play:function(key,offset=0,rate=1,delay=0){const b=this.buffers[key],A=G.Audio;if(!b||!A.ok||offset>=b.duration)return null;const out=A.out(null,.7,{life:delay+b.duration/rate+.1,reverb:.06,category:'guns',important:true});if(!out)return null;const src=A.ctx.createBufferSource();src.buffer=b;src.playbackRate.value=rate;src.connect(out);src.start(A.ctx.currentTime+delay,Math.max(0,offset));src.onended=()=>{src.disconnect();const i=this.sources.indexOf(src);if(i>=0)this.sources.splice(i,1);};this.sources.push(src);this.events.push({key,offset,rate,delay});if(this.events.length>50)this.events.shift();return src;},frame:function(){const R=O.reload;if(R?.native){G.Shotguns26.native.audioFrame();return;}if(!R||G.Game.state!=='playing'){this.stop();return;}if(!this.ready){this.prepare();return;}const rate=VM.reloadRate||1;if(this.current!==R||Math.abs(this.rate-rate)>.01){this.stop();this.current=R;this.rate=rate;for(const[t,key]of this.timeline(R))this.play(key,Math.max(0,R.t-t),rate,Math.max(0,t-R.t)/rate);}}};
 const audioInit=G.Audio.init;G.Audio.init=function(){const r=audioInit.apply(this,arguments);O.sound.prepare();return r;};
 const pause=G.Game.pause;G.Game.pause=function(){O.sound.stop();return pause.apply(this,arguments);};addEventListener('blur',()=>O.sound.stop());addEventListener('pagehide',()=>O.sound.stop());
 const monitor=()=>{if(O.sound.sources.length&&(G.Game?.state!=='playing'||document.hidden))O.sound.stop();requestAnimationFrame(monitor);};requestAnimationFrame(monitor);
})();


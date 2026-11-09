'use strict';
// Optional live weather, shared interpolated state for rendering, wind and perception.
(()=>{const G=window.G,T=THREE,E=G.Environment23,W=G.World,A=G.Audio,V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
 const saved=G.Storage.get('weather25')||{},D=G.Weather25={prefs:{dynamic:saved.dynamic===true,rainVolume:Number.isFinite(saved.rainVolume)?clamp(saved.rainVolume):.65},current:{...E.weathers[E.active.weather]},transition:null,remaining:0,duration:18,interval:[90,180],elapsed:0,changes:0,applyClock:0,events:[],ready:false};
 D.event=function(type,extra={}){this.events.push({time:this.elapsed,type,...extra});if(this.events.length>80)this.events.shift();};
 D.schedule=function(){this.remaining=this.interval[0]+Math.random()*(this.interval[1]-this.interval[0]);};
 D.reset=function(){this.current={...E.weathers[E.active.weather]};this.transition=null;this.elapsed=0;this.changes=0;this.applyClock=0;this.events=[];this.schedule();this.sync();this.sound.update(true);};
 D.choose=function(){const from=E.active.weather,choices=from==='cloudy'?['clear','rain']:['cloudy'];return choices[Math.min(choices.length-1,Math.floor(Math.random()*choices.length))];};
 D.begin=function(to){if(!E.weathers[to]||to===E.active.weather||this.transition)return false;this.transition={from:E.active.weather,to,start:{...this.current},time:0};this.changes++;this.event('transition',{from:E.active.weather,to});this.sync();return true;};
 D.mix=function(t){const tr=this.transition,k=smooth(t),target=E.weathers[tr.to];for(const key of Object.keys(target))if(typeof target[key]==='number')this.current[key]=tr.start[key]+(target[key]-tr.start[key])*k;this.current.name=target.name;};
 D.set=function(patch){if(typeof patch.dynamic==='boolean')this.prefs.dynamic=patch.dynamic;if(Number.isFinite(patch.rainVolume))this.prefs.rainVolume=clamp(patch.rainVolume);G.Storage.set('weather25',this.prefs);this.sync();this.sound.update(true);};
 D.running=()=>G.Game.state==='playing'&&E.missionStarted&&!G.Player.dead&&!G.Inventory.active;
 D.update=function(dt){if(!this.ready)return;if(this.running()&&this.prefs.dynamic){dt=clamp(dt,0,.1);this.elapsed+=dt;
   if(this.transition){this.transition.time=Math.min(this.duration,this.transition.time+dt);this.applyClock+=dt;if(this.applyClock>=.25||this.transition.time>=this.duration){this.applyClock=0;this.mix(this.transition.time/this.duration);if(this.transition.time>=this.duration){E.active.weather=this.transition.to;this.current={...E.weathers[E.active.weather]};this.event('complete',{weather:E.active.weather});this.transition=null;this.schedule();}E.apply();}}
   else{this.remaining-=dt;if(this.remaining<=0)this.begin(this.choose());}
  }
  if(this.roof&&this.current.rain25>.001&&G.time>(this.roofNext||0)){this.roofNext=G.time+2;this.updateRoof();}this.sound.update();
 };
 E.weather=()=>D.current;
 const configure=E.configure;E.configure=function(patch){const current=this.active.weather,r=configure.call(this,patch);if(patch.weather&&!(patch.weather==='random'&&this.missionStarted)){D.current={...this.weathers[this.active.weather]};D.transition=null;D.schedule();D.event('manual',{weather:this.active.weather});}else this.active.weather=current;this.apply();D.sync();D.sound.update(true);return r;};
 const prepare=E.prepare;E.prepare=function(){const r=prepare.apply(this,arguments);D.reset();this.apply();return r;};
 const start=E.start;E.start=function(){const r=start.apply(this,arguments);if(r){D.reset();this.apply();D.event('start',{weather:this.active.weather});}return r;};
 const update=E.update;E.update=function(dt){const r=update.call(this,dt);D.update(dt);return r;};
 D.label=function(){if(!E.missionStarted&&E.prefs.weather==='random')return '天候は出撃時に抽選（プレビュー：晴れ）';const label=this.transition?E.weathers[this.transition.from].name+' → '+E.weathers[this.transition.to].name+(this.prefs.dynamic?'（移行中）':'（変化停止）'):E.weathers[E.active.weather].name;return label+(E.prefs.weather==='random'?(E.randomApplied?'（開始時ランダム）':'（次の出撃でランダム）'):'');};
 D.sync=function(){const box=document.getElementById('weather25-dynamic'),volume=document.getElementById('weather25-rain-volume');if(box)box.checked=this.prefs.dynamic;if(volume){volume.value=Math.round(this.prefs.rainVolume*100);document.getElementById('weather25-rain-value').textContent=volume.value+'%';}if(!this.ready)return;const text=E.time().name+' ／ '+this.label()+(this.prefs.dynamic?' ／ 天候変化オン':'');for(const id of ['environment23-status','environment23-main-status']){const el=document.getElementById(id);if(el)el.textContent=text;}};
 const sync=E.uiSync;E.uiSync=function(){sync.call(this);D.sync();};
 D.updateRoof=function(){if(!this.roof)return;const data=this.roof.image.data;for(let z=0;z<W.H;z++)for(let x=0;x<W.W;x++){let top=0;for(const o of W.boxes(x,z))top=Math.max(top,o.b[4]);const value=Math.round(clamp(top/16)*255),i=(z*W.W+x)*4;data[i]=value;data[i+1]=data[i+2]=0;data[i+3]=255;}this.roof.needsUpdate=true;this.roofBuilds=(this.roofBuilds||0)+1;};
 D.rainSetup=function(){const rain=E.rain,m=rain.material;this.roof=new T.DataTexture(new Uint8Array(W.W*W.H*4),W.W,W.H,T.RGBAFormat);this.roof.minFilter=this.roof.magFilter=T.NearestFilter;this.roof.generateMipmaps=false;this.roof.flipY=false;this.updateRoof();m.uniforms.amount25={value:this.current.rain25};m.uniforms.roof25={value:this.roof};m.uniforms.map25={value:new T.Vector2(W.W,W.H)};
  m.vertexShader=m.vertexShader.replace('varying float vA;','varying float vA;uniform float amount25;uniform sampler2D roof25;uniform vec2 map25;');m.vertexShader=m.vertexShader.replace('vec4 view=modelViewMatrix*vec4(p,1.);','vec2 uv=p.xz/map25;float inside=step(0.,uv.x)*step(0.,uv.y)*step(uv.x,.99999)*step(uv.y,.99999);float bottom=texture2D(roof25,clamp(uv,0.,1.)).r*16.*inside;p.y=max(bottom+.02,p.y);vec4 view=modelViewMatrix*vec4(p,1.);');m.vertexShader=m.vertexShader.replace('gl_Position=projectionMatrix*view;','vA*=smoothstep(phase23-.055,phase23+.055,amount25)*step(bottom+.03,f*position.y);gl_Position=projectionMatrix*view;');m.needsUpdate=true;
 };
 const apply=E.apply;E.apply=function(){const r=apply.apply(this,arguments);if(this.rain?.material.uniforms.amount25)this.rain.material.uniforms.amount25.value=D.current.rain25;return r;};
 const ui=E.ui;E.ui=function(){ui.call(this);const weather=document.getElementById('environment23-weather');weather.closest('label').firstChild.textContent='開始時の天候（手動変更も可）';const control=document.createElement('div');control.innerHTML='<label class="field check"><input id="weather25-dynamic" type="checkbox">プレイ中に天候がランダムで変化</label><label class="field">雨音 <span id="weather25-rain-value"></span><input id="weather25-rain-volume" type="range" min="0" max="100" step="1" aria-label="雨音の音量"></label>';weather.closest('label').after(control);control.querySelector('input[type=checkbox]').onchange=e=>D.set({dynamic:e.target.checked});control.querySelector('input[type=range]').oninput=e=>D.set({rainVolume:+e.target.value/100});
  document.getElementById('environment23-help').innerHTML='<span id="environment23-status"></span><br>開始時ランダムは出撃時に抽選。天候変化オンでは約1分半～3分ごとに次の天候へ約18秒かけて移ります。オフは現在の状態で停止、オンで続きます。ポーズや所持品画面では進みません。手動で天候を選ぶとその天候に切り替わります。時間帯は自動では変わりません。雨音は窓から離れると弱まり、窓のない屋内では鳴りません。';D.ready=true;D.rainSetup();D.sync();
 };
 // Two original, seamless stereo layers; no downloads or external audio service.
 const S=D.sound={ready:false,sources:[],lastUpdate:-999,levels:{amount:0,cutoff:600,pan:0},targetGain:0};
 S.buffer=function(ctx,seconds,drops,seed){const rate=ctx.sampleRate,n=Math.floor(rate*seconds),fade=Math.floor(rate*.25),raw=n+fade,b=ctx.createBuffer(2,n,rate);let state=seed;const random=()=>{state=(state*1664525+1013904223)>>>0;return state/4294967296;};
  for(let ch=0;ch<2;ch++){const values=new Float32Array(raw);let pink=0,slow=0;for(let i=0;i<raw;i++){const white=random()*2-1;pink=.975*pink+.025*white;slow=.9997*slow+.0003*white;values[i]=drops?0:(white*.24+pink*1.7)*(1+slow*3);}
   if(drops)for(let event=0;event<seconds*85;event++){const start=Math.floor(random()*raw),length=Math.floor(rate*(.008+random()*.025)),amp=.16+random()*.4;for(let k=0;k<length&&start+k<raw;k++)values[start+k]+=(random()*2-1)*amp*Math.exp(-k/(length*.24))*Math.min(1,k/12);}
   const out=b.getChannelData(ch);for(let i=0;i<n;i++)out[i]=i<fade?values[i]*(i/fade)+values[n+i]*(1-i/fade):values[i];
  }return b;
 };
 S.setup=function(){if(this.ready||!A.ctx||!A.master)return;const c=A.ctx;this.bus=c.createGain();this.bus.gain.value=0;this.filter=c.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=600;this.filter.Q.value=.45;this.highpass=c.createBiquadFilter();this.highpass.type='highpass';this.highpass.frequency.value=180;this.panner=c.createStereoPanner();this.highpass.connect(this.filter);this.filter.connect(this.panner);this.panner.connect(this.bus);this.bus.connect(A.master);
  this.buffers=[this.buffer(c,8,false,25117),this.buffer(c,11,true,25431)];for(let i=0;i<2;i++){const source=c.createBufferSource(),gain=c.createGain();source.buffer=this.buffers[i];source.loop=true;gain.gain.value=i?.38:.75;source.connect(gain);gain.connect(this.highpass);source.start();this.sources.push(source);}this.ready=true;this.update(true);
 };
 S.exposure=function(point=G.camera.position){if(W.outdoor){const roof=W.raycast(point.x,point.y,point.z,0,1,0,30),amount=roof?.25:1;return{amount,cutoff:roof?1300:5200,pan:0,kind:roof?'shelter':'outdoor'};}
  let best=0,bestPos=null,bestPane=null;for(const f of G.Windows14.list)for(const pane of f.panes){const at=V((pane.b[0]+pane.b[3])/2,(pane.b[1]+pane.b[4])/2,f.z+f.inward*.06),dist=point.distanceTo(at),clear=W.lineOfSight(...point.toArray(),...at.toArray()),gain=(pane.broken?.9:.32)*Math.exp(-dist/7)*(clear?1:.16);if(gain>best){best=gain;bestPos=at;bestPane=pane;}}
  const direction=bestPos?.clone().sub(point).normalize(),right=V(1,0,0).applyQuaternion(G.camera.quaternion);return{amount:best,cutoff:bestPane?.broken?3600:950,pan:direction?clamp(direction.dot(right),-.7,.7):0,kind:bestPane?(bestPane.broken?'open-window':'closed-window'):'enclosed',pane:bestPane?.id};
 };
 S.active=()=>D.running()&&A.ambientEnabled&&!S.blurred;
 S.update=function(force=false){if(!this.ready)return;if(!force&&G.time-this.lastUpdate<.15)return;this.lastUpdate=G.time;this.levels=this.exposure();const amount=this.active()?D.current.rain25*D.prefs.rainVolume*this.levels.amount:0;this.targetGain=.24*amount;const time=A.ctx.currentTime;this.bus.gain.setTargetAtTime(this.targetGain,time,.28);this.filter.frequency.setTargetAtTime(this.levels.cutoff,time,.35);this.panner.pan.setTargetAtTime(this.levels.pan,time,.3);};
 S.silence=function(){if(this.ready){this.targetGain=0;this.bus.gain.setTargetAtTime(0,A.ctx.currentTime,.035);}};
 const audioInit=A.init;A.init=function(){const r=audioInit.apply(this,arguments);S.setup();return r;};
 const ambience=A.ambience;A.ambience=function(on){const r=ambience.call(this,on);if(!on)S.silence();else{S.blurred=false;S.update(true);}return r;};
 const listener=A.updateListener;A.updateListener=function(cam){const r=listener.call(this,cam);S.update();return r;};
 const inventoryOpen=G.Inventory.open;G.Inventory.open=function(){const r=inventoryOpen.apply(this,arguments);if(this.active)S.silence();return r;};
 const inventoryClose=G.Inventory.close;G.Inventory.close=function(){const r=inventoryClose.apply(this,arguments);S.update(true);return r;};
 addEventListener('blur',()=>{S.blurred=true;S.silence();});addEventListener('focus',()=>{S.blurred=false;S.update(true);});addEventListener('pagehide',()=>S.silence());
})();

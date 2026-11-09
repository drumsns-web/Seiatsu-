// Purchased MX16A4 audio. Original weapon sounds remain selectable.
'use strict';
(function(){
const G=window.G,A=G.Audio,N=G.FPSNative,VM=G.Viewmodel;
const S=G.FPSSound={mode:G.Storage.get('fps_sound')||'mixed',buffers:{},ready:false,errors:[],events:[],shot:0};
const files=['Fire_A','Fire_B','Fire_C','Fire_D','Reload_Tac','Reload_Empty'];
S.rawPromise=Promise.all(files.map(async name=>{const r=await fetch('assets/audio/lite-mx16/'+name+'.wav');if(!r.ok)throw Error(name+' HTTP '+r.status);return[name,await r.arrayBuffer()];})).catch(e=>{S.errors.push(e.message);return[];});
S.prepare=function(){if(!A.ctx)return;if(this.promise)return this.promise;return this.promise=this.rawPromise.then(async raw=>{for(const [name,data]of raw)this.buffers[name]=await A.ctx.decodeAudioData(data.slice(0));this.ready=files.every(n=>this.buffers[n]);}).catch(e=>this.errors.push(e.message));};
const init=A.init;A.init=function(){init.call(this);S.prepare();};if(A.ctx)S.prepare();
const field=document.createElement('label');field.className='field';field.innerHTML='FPSライフルの音<select id="fps-sound-mode"><option value="mixed">従来の射撃音＋購入素材の装填音</option><option value="purchased">購入素材の射撃音・装填音</option><option value="legacy">従来の射撃音・装填音</option></select><span class="small">購入音源は元の余韻を含みます。室内外の反響は既存の簡易処理です。</span>';document.getElementById('panel-settings').appendChild(field);const select=field.querySelector('select');select.value=S.mode;select.onchange=()=>{S.mode=select.value;G.Storage.set('fps_sound',S.mode);S.stop();};
S.stop=function(){if(this.source){try{this.source.stop();}catch{}this.source.disconnect();this.source=null;}this.reload=null;};
S.play=function(name,offset=0,rate=1){const buffer=this.buffers[name];if(!A.ok||!buffer||offset>=buffer.duration)return null;const d=A.out(null,name.startsWith('Fire')?.8:.72,{life:buffer.duration/rate+.1,reverb:name.startsWith('Fire')?.6:.06,important:true});if(!d)return null;const src=A.ctx.createBufferSource();src.buffer=buffer;src.playbackRate.value=rate;src.connect(d);src.start(0,Math.max(0,offset));src.onended=()=>{src.disconnect();if(this.source===src)this.source=null;};this.events.push({name,offset,rate});if(this.events.length>32)this.events.shift();return src;};
const startReload=VM.startReload;
VM.startReload=function(empty){S.stop();startReload.call(this,empty);if(!N.allowed())return;const R=this.state.reload,old=R.dur;const rifle=N.selectedRifle();const authored=rifle?.ready;R.dur=authored?rifle.actions[0][empty?'reload_empty':'reload'].getClip().duration:N.actions[0][empty?'empty':'reload'].getClip().duration;R.authoredSpades=!!authored;R.native=true;R.sfx=R.sfx.map(e=>[e[0]*R.dur/old,...e.slice(1)]);R.track=R.track.map(e=>[e[0]*R.dur/old,...e.slice(1)]);R.purchasedSound=S.mode!=='legacy'&&S.ready;if(R.purchasedSound)R.sfx=[];};
for(const method of ['cancelReload','resetActions','equip']){const old=VM[method];VM[method]=function(...args){S.stop();return old.apply(this,args);};}
const shot=A.gunshot;A.gunshot=function(pos,isPlayer,kind,suppressed){if(isPlayer&&kind==='ar'&&!suppressed&&N.active&&S.mode==='purchased'&&S.ready){S.play('Fire_'+String.fromCharCode(65+S.shot++%4));return;}return shot.apply(this,arguments);};
S.frame=function(){const R=VM.state.reload;if(!R?.native||!R.purchasedSound||!N.active||S.mode==='legacy'||G.Game?.state!=='playing'){this.stop();return;}if(this.reload!==R||!this.source){this.stop();this.reload=R;const name=R.empty?'Reload_Empty':'Reload_Tac',scale=R.authoredSpades?this.buffers[name].duration/R.dur:1;this.source=this.play(name,R.t*scale,(VM.reloadRate||1)*scale);}};
const update=VM.update;VM.update=function(s){const result=update.call(this,s);S.frame();return result;};
// Pause immediately, then resume from the animation clock on the next game update.
const monitor=()=>{if(S.source&&(G.Game?.state!=='playing'||document.hidden))S.stop();requestAnimationFrame(monitor);};requestAnimationFrame(monitor);addEventListener('blur',()=>S.stop());addEventListener('pagehide',()=>S.stop());
})();

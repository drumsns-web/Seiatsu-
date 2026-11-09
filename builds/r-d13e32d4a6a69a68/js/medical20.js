'use strict';
// Shared game rules for treatment, mobility, bounded floor trails and an optional HUD.
(()=>{const G=window.G,P=G.Player,V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),saved=G.Storage.get('medical20')||{};
 const M=G.Medical20={settings:{body:saved.body!==false,info:saved.info!==false},MAX_TRAILS:160,trails:[],cursor:0,emitted:0,states:new WeakMap(),events:[]};
 M.choose=function(actor,med,medicine=true,threshold=100){
  for(const w of actor.wounds.filter(w=>w.rate>0).sort((a,b)=>b.rate-a.rate)){
   const item=G.BLEED[w.type]?.item;if(item&&med[item]>0)return{item,w,full:true};
   if(w.type!=='light'&&!w.packed&&med.band>0)return{item:'band',w,full:false};
  }
  return medicine&&actor.hp<threshold&&med.medicine>0?{item:'medicine',full:true}:null;
 };
 M.legFactor=function(actor){const legs=(actor.wounds||[]).filter(w=>w.area==='leg'&&w.rate>0);return legs.some(w=>w.type!=='light')?.65:legs.length?.82:1;};
 M.canSprint=function(actor){return !actor.crippled&&!actor.legLost&&this.legFactor(actor)===1&&actor.hp>=35&&actor.bleedRate()<1;};
 M.recoverLegs=function(actor){if(actor.legLost||(actor.wounds||[]).some(w=>w.area==='leg'&&w.rate>0))return;actor.legHits=0;if(actor.crippled){actor.crippled=false;if(actor!==P){actor.prone=false;actor.wantCrouch=false;}}};
 M.apply=function(actor,plan,med){
  if(!plan||actor.dead||!(med[plan.item]>0))return false;
  if(plan.item==='medicine'||plan.item==='stim'){
   if(actor.hp>=100)return false;med[plan.item]--;actor.hp=Math.min(100,actor.hp+(plan.item==='stim'?60:30));return true;
  }
  const w=plan.w;if(!w||!actor.wounds.includes(w)||!(w.rate>0))return false;
  const expected=G.BLEED[w.type]?.item;
  if(plan.full?plan.item!==expected:plan.item!=='band'||w.type==='light'||w.packed)return false;
  med[plan.item]--;if(plan.full)actor.wounds=actor.wounds.filter(x=>x!==w);else{w.packed=true;w.rate*=w.type==='torso'?.5:.4;}
  this.recoverLegs(actor);this.updateHUD();return true;
 };
 M.enemyRate=function(actor){return Math.max(0,actor.knifeBleed||0)+Math.max(0,actor.bleed||0,actor.gunBleed20||0);};
 M.enemyDamage=function(actor,dt){const rate=Math.max(0,(actor.gunBleed20||0)-(actor.bleed||0));if(actor.dead||!rate)return;actor.hp=Math.max(0,actor.hp-rate*dt);if(actor.hp<=0){actor.die(0,0,'bleed');G.Player.kills++;}};
 M.resources=function(){if(this.geometry)return;this.geometry=new THREE.PlaneGeometry(1,1);this.materials=[];
  for(let variant=0;variant<3;variant++){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');let seed=41+variant*97;const rnd=()=>{seed=seed*16807%2147483647;return seed/2147483647;};
   x.fillStyle='rgba(72,3,9,.93)';x.beginPath();x.moveTo(34,54);x.bezierCurveTo(28,30,66,25,79,39);x.bezierCurveTo(103,38,103,72,84,79);x.bezierCurveTo(73,103,43,94,42,76);x.bezierCurveTo(27,75,24,62,34,54);x.fill();
   for(let i=0;i<9;i++){const a=rnd()*Math.PI*2,d=40+rnd()*14;x.beginPath();x.ellipse(64+Math.cos(a)*d,64+Math.sin(a)*d,1+rnd()*3,1+rnd()*2,a,0,Math.PI*2);x.fill();}
   const tex=new THREE.CanvasTexture(c);tex.encoding=THREE.sRGBEncoding;this.materials.push(new THREE.MeshStandardMaterial({map:tex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,roughness:.85,metalness:0,envMapIntensity:.02}));
  }
 };
 M.drop=function(actor,team,rate){const p=actor.pos;if(!p||!G.Game.scene)return false;
  const x=p.x+(Math.random()-.5)*.16,z=p.z+(Math.random()-.5)*.16,h=G.World.raycast(x,(p.y||0)+.55,z,0,-1,0,1.8);
  if(!h||h.ny<.6||h.t<=.01||h.y>(p.y||0)+.12)return false;this.resources();let mesh;
  if(this.trails.length<this.MAX_TRAILS){mesh=new THREE.Mesh(this.geometry,this.materials[this.trails.length%3]);G.Game.scene.add(mesh);this.trails.push(mesh);}else{mesh=this.trails[this.cursor];this.cursor=(this.cursor+1)%this.MAX_TRAILS;}
  const n=V(h.nx,h.ny,h.nz),at=V(h.x,h.y,h.z);mesh.position.copy(at).addScaledVector(n,.006);mesh.lookAt(at.clone().add(n));mesh.rotateZ(Math.random()*Math.PI*2);
  const size=(.13+Math.min(.12,rate*.09))*(G.Game.gore==='low'?.7:1);mesh.scale.set(size,size*(.82+Math.random()*.32),1);mesh.visible=true;mesh.userData.medical20={team,actor:actor.id??'player',at:G.time};
  this.emitted++;this.events.push({team,actor:actor.id??'player',x:h.x,y:h.y,z:h.z,at:G.time});if(this.events.length>80)this.events.shift();return true;
 };
 M.trail=function(actor,team,dt){if(!actor?.pos)return;const rate=actor.dead?0:team==='enemy'?this.enemyRate(actor):actor.bleedRate();let state=this.states.get(actor);if(!state){state={t:0,last:actor.pos.clone()};this.states.set(actor,state);}
  if(!(rate>0)||G.Game.gore==='off'){state.t=0;state.last.copy(actor.pos);return;}
  const moved=state.last.distanceTo(actor.pos);state.t+=dt;const interval=moved>.18?(rate>=1?.4:.7):1.8;
  if(state.t>=interval){state.t=0;state.last.copy(actor.pos);this.drop(actor,team,rate);}
 };
 M.reset=function(){for(const mesh of this.trails)mesh.parent?.remove(mesh);this.trails=[];this.cursor=0;this.emitted=0;this.events=[];this.states=new WeakMap();};
 M.update=function(dt){if(G.Game.state!=='playing')return;for(const m of this.trails)m.visible=G.Game.gore!=='off';this.trail(P,'player',dt);for(const a of G.Allies.list)this.trail(a,'ally',dt);for(const e of G.Enemies.list)this.trail(e,'enemy',dt);this.updateHUD();};
 M.updateHUD=function(){if(!this.hud)return;this.hud.hidden=!this.settings.body||G.Game.state!=='playing'||P.dead;document.getElementById('med').classList.toggle('medical20-hidden',!this.settings.info);
  const wounds=P.wounds||[],areas={torso:0,arm:0,leg:P.legLost?2:0,head:P.headLost?2:0};for(const w of wounds)if(w.rate>0)areas[w.area]=Math.max(areas[w.area]||0,w.type==='light'?1:2);if(P.armLost)areas.arm=2;
  for(const el of this.hud.querySelectorAll('[data-area]')){const level=areas[el.dataset.area]||0;el.setAttribute('fill',level===2?'#dc4e4e':level===1?'#e89874':'#84928a');}
  const text=P.bleedRate()>0?(wounds.some(w=>w.packed)?'応急処置・出血あり':'出血中'):P.legLost||P.armLost?'止血済み・欠損あり':'出血なし';const state=this.hud.querySelector('span');if(state.textContent!==text)state.textContent=text;this.hud.setAttribute('aria-label','身体の状態：'+text+'。腕と脚は左右共通の表示');
 };
 M.save=function(){const ok=G.Storage.set('medical20',this.settings);document.getElementById('medical20-save').textContent=ok?'表示設定を保存しました。':'表示は変更しましたが、このブラウザーに保存できませんでした。';this.updateHUD();return ok;};
 const css=document.createElement('style');css.textContent='#medical20-hud{position:fixed;right:20px;bottom:178px;width:98px;text-align:center;background:rgba(12,19,16,.68);border:1px solid #6f7d70;border-radius:5px;padding:7px;z-index:12;color:#e0e5dd;pointer-events:none;font:11px sans-serif}#medical20-hud[hidden]{display:none}#medical20-hud svg{display:block;width:52px;height:104px;margin:4px auto}#medical20-hud span{display:block}.medical20-hidden{display:none!important}@media(max-width:760px){#medical20-hud{right:10px;bottom:170px;width:76px;padding:4px}#medical20-hud svg{width:40px;height:80px}}';document.head.appendChild(css);
 const hud=M.hud=document.createElement('aside');hud.id='medical20-hud';hud.hidden=true;hud.innerHTML='<b>身体の状態</b><svg viewBox="0 0 60 120" aria-hidden="true"><circle data-area="head" cx="30" cy="12" r="9"/><path data-area="torso" d="M19 26 Q30 21 41 26 L40 52 L20 52Z"/><path data-area="torso" d="M20 55 H40 L41 69 H19Z"/><path data-area="arm" d="M15 28 L8 31 L4 67 Q5 75 12 70 L19 43Z M45 28 L52 31 L56 67 Q55 75 48 70 L41 43Z"/><path data-area="leg" d="M19 72 H28 L27 110 H15 L17 103Z M32 72 H41 L43 103 L45 110 H33Z"/></svg><span></span>';document.body.appendChild(hud);
 const section=document.createElement('section');section.id='medical20-settings';section.innerHTML='<h3 class="sub">負傷・治療の表示</h3><label class="field check"><input id="medical20-body" type="checkbox"> 身体の負傷箇所を表示</label><label class="field check"><input id="medical20-info" type="checkbox"> 医療品・出血情報を表示</label><p class="small">赤い箇所は未処置の傷。腕・脚は左右共通で表示します。包帯による重い出血の応急処置は止血とは別で、適切な医療品による追加処置が必要です。止血後も既に落ちた血痕は残ります。</p><p class="small" id="medical20-save">表示設定は次回起動にも引き継ぎます。</p>';document.getElementById('panel-settings').appendChild(section);for(const key of ['body','info']){const el=document.getElementById('medical20-'+key);el.checked=M.settings[key];el.onchange=()=>{M.settings[key]=el.checked;M.save();};}
 const update=G.Game.update;G.Game.update=function(dt){const r=update.call(this,dt);M.update(dt);return r;};const reset=G.Effects.reset;G.Effects.reset=function(){M.reset();return reset.apply(this,arguments);};const render=G.Game.render;G.Game.render=function(){M.updateHUD();return render.apply(this,arguments);};
})();

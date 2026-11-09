'use strict';
(function(){
  const G=window.G, P=G.Player, keys=['buck','bird','slug'];
  const A=G.ShotgunAmmo={keys,names:{buck:'バックショット',bird:'バードショット',slug:'スラッグ'},capacity:48};
  A.spec={
    buck:{pellets:9,spreadHip:.06,spreadAds:.045,range:60,falloff:[8,25,.3],pen:.25,dmg:{head:34,body:16,stomach:14,legs:11,arms:10}},
    bird:{pellets:18,spreadHip:.095,spreadAds:.075,range:40,falloff:[5,18,.08],pen:.12,dmg:{head:12,body:6,stomach:5,legs:4,arms:4}},
    slug:{pellets:1,spreadHip:.016,spreadAds:.0015,range:120,falloff:[35,100,.65],pen:.65,dmg:{head:120,body:78,stomach:70,legs:45,arms:40}}
  };
  A.totalReserve=()=>Object.values(P.wst.shotgun.pool).reduce((s,n)=>s+n,0);
  A.reset=function(){
    const st=P.wst.shotgun,kind=keys.includes(G.Game.loadout.shotgunAmmo)?G.Game.loadout.shotgunAmmo:'buck';
    st.kind=kind;st.pool={buck:6,bird:6,slug:6};st.pool[kind]=18;
    Object.defineProperty(st,'reserve',{configurable:true,get(){return this.pool[this.kind];},set(v){const other=keys.filter(k=>k!==this.kind).reduce((s,k)=>s+this.pool[k],0);this.pool[this.kind]=Math.max(0,Math.min(Math.floor(v),A.capacity-this.ammo-other));}});
  };
  const reset=P.reset;P.reset=function(){reset.call(this);A.reset();};
  const weapon=P.W;P.W=function(){const w=weapon.call(this);return this.cur==='shotgun'?{...w,...A.spec[this.wst.shotgun.kind],ammoType:this.wst.shotgun.kind}:w;};
  A.select=function(kind){
    if(P.cur!=='shotgun'||!keys.includes(kind)||kind===P.wst.shotgun.kind)return false;
    if(P.dead||P.switchT>0||P.gHold||P.knifeT>=0||P.treat||P.attachT>0||G.Doors.manual||G.Doors.choice)return false;
    const st=P.wst.shotgun;if(st.pool[kind]===0){G.HUD.msg(A.names[kind]+'の予備弾がありません');return false;}
    // Exchange the whole tube without creating or discarding ammunition. A new
    // shell must complete the existing reload animation before it can be fired.
    G.Viewmodel.cancelReload();P.reloading=false;P.fireQueueT=0;P.fireWhenLoaded=false;
    st.pool[st.kind]+=st.ammo;st.ammo=0;st.kind=kind;P.pumpPending=0;P.pumpT=0;
    P.tryReload();G.HUD.ammo();G.HUD.msg(A.names[kind]+'へ交換・再装填（元の弾はポーチへ回収）',3);return true;
  };
  A.cycle=()=>{const s=P.wst.shotgun;for(let i=1;i<=keys.length;i++){const k=keys[(keys.indexOf(s.kind)+i)%keys.length];if(s.pool[k]>0&&k!==s.kind)return A.select(k);}G.HUD.msg('交換できる別の弾種がありません');return false;};
  A.refill=function(n){const s=P.wst.shotgun,add=Math.max(0,Math.min(n,A.capacity-s.ammo-A.totalReserve()));s.pool[s.kind]+=add;return add;};
  const init=G.Equipment.init;G.Equipment.init=function(scene){init.call(this,scene);const el=document.createElement('section');el.id='shotgun-ammo-loadout';el.innerHTML='<h3 class="sub">ショットガン弾種</h3><label class="field">出撃時の装填弾<select id="lo-shell-type">'+keys.map(k=>'<option value="'+k+'">'+A.names[k]+'</option>').join('')+'</select></label><p class="small">選択弾：装填2発＋予備18発。他の2種類：各6発。合計32発。戦闘中は J で弾種交換して再装填（キー設定で変更可能）。<br>バック：標準散弾／バード：広く散り遠距離で弱まる／スラッグ：単発で狙う。ゲーム用の仮調整値です。</p>';document.getElementById('tactical-loadout').appendChild(el);const count=document.createElement('div');count.id='shell-inventory';count.style.cssText='font-size:12px;color:#c4c9c8;margin-top:6px';document.getElementById('ammo').appendChild(count);const select=el.querySelector('select');select.value=keys.includes(G.Game.loadout.shotgunAmmo)?G.Game.loadout.shotgunAmmo:'buck';select.onchange=()=>{G.Game.loadout.shotgunAmmo=select.value;G.Game.saveSettings();};};
  const hud=G.HUD.ammo;G.HUD.ammo=function(){hud.call(this);const info=document.getElementById('shell-inventory');if(info)info.hidden=P.cur!=='shotgun';if(P.cur==='shotgun'){const s=P.wst.shotgun;document.getElementById('weapon-name').textContent=P.W().name+' · '+A.names[s.kind];if(info)info.textContent=keys.map(k=>A.names[k].replace('ショット','')+' '+s.pool[k]).join(' / ')+'　'+G.keyName(G.Input.binds.shotgunAmmo)+' 交換';}};
})();

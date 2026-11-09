'use strict';
// Game ammunition families: loose rounds survive swapping the primary gun.
(()=>{const G=window.G,P=G.Player,count=n=>Number.isFinite(n)?Math.max(0,Math.floor(n)):0;
 const C=G.Calibers11={primary:{mx16:'ar',spades_rifle1:'ar',spades_rifle2:'ar',spades_rifle3:'ar',spades_rifle4:'ar',pdw90:'pdw57',kar98k:'kar792'},keys:['ar','pdw57','kar792','pistol','buck','bird','slug'],loose:{ar:0,pdw57:0,kar792:0},names:{ar:'5.56mm · ライフル',pdw57:'5.7mm · PDW90',kar792:'7.92mm · Kar98K',pistol:'.45口径 · M1911',buck:'12番 · バックショット',bird:'12番 · バードショット',slug:'12番 · スラッグ'}};
 C.gun=g=>g?.key==='ar'?(C.primary[g.modelKey]||'ar'):g?.key==='shotgun'?(g.kind||'buck'):g?.key||'ar';
 C.current=()=>P.cur==='ar'?(C.primary[G.Primary10.model()]||'ar'):P.cur==='shotgun'?P.wst.shotgun.kind:P.cur;
 C.actor=a=>a.weaponKey==='shotgun'?'buck':a.weaponKey||'ar';
 C.max=key=>({ar:330,pdw57:300,kar792:60,pistol:G.WEAPONS.pistol.maxReserve})[key]||G.ShotgunAmmo.capacity;
 C.get=key=>Object.hasOwn(C.loose,key)?count(C.loose[key]):key==='pistol'?count(P.wst.pistol.reserve):count(P.wst.shotgun.pool[key]);
 C.set=(key,n)=>{n=count(n);if(Object.hasOwn(C.loose,key))C.loose[key]=Math.min(n,C.max(key));else if(key==='pistol')P.wst.pistol.reserve=Math.min(n,C.max(key));else if(['buck','bird','slug'].includes(key))P.wst.shotgun.pool[key]=n;};
 C.room=key=>['buck','bird','slug'].includes(key)?Math.max(0,G.ShotgunAmmo.capacity-P.wst.shotgun.ammo-G.ShotgunAmmo.totalReserve()):Math.max(0,C.max(key)-C.get(key));
 C.add=(key,n)=>{const take=Math.min(count(n),C.room(key));C.set(key,C.get(key)+take);return take;};
 C.carried=key=>Object.values(G.WeaponInventory.slots).filter(Boolean).some(g=>g.key==='shotgun'?['buck','bird','slug'].includes(key):C.gun(g)===key);
 const reset=P.reset;P.reset=function(){const r=reset.call(this),model=G.Game.loadout.primaryModel||'mx16',key=C.primary[model]||'ar';C.loose={ar:0,pdw57:0,kar792:0};C.loose[key]=G.Primary10.spec(model).reserve;
  Object.defineProperty(this.wst.ar,'reserve',{configurable:true,enumerable:true,get(){return C.get(C.primary[G.Primary10.model()]||'ar');},set(n){C.set(C.primary[G.Primary10.model()]||'ar',n);}});return r;};
 const hud=G.HUD.ammo;G.HUD.ammo=function(){hud.call(this);let el=document.getElementById('ammo-caliber11');if(!el){el=document.createElement('div');el.id='ammo-caliber11';el.style.cssText='font:11px system-ui;color:#b8c8bb;margin-top:4px';document.getElementById('ammo').appendChild(el);}el.textContent=C.names[C.current()];};
})();

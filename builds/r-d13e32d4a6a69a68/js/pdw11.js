'use strict';
// PDW source round poses. Magazine follower and rounds follow the moving magazine.
(()=>{const G=window.G,T=THREE,E=G.FPSExtra10,P=G.Player,VM=G.Viewmodel,find=(root,name)=>root.getObjectByName(name.replaceAll(' ','_'))||root.getObjectByName(name),B=G.PDW11={ready:false,errors:[],count:0};
 const load=E.load;E.load=async function(){await load.call(this);try{const r=await fetch('assets/fps-extra/pdw90-rounds.json');if(!r.ok)throw Error('round poses '+r.status);B.data=await r.json();B.st=E.states.pdw90;B.bones=Object.fromEntries(B.data.poses[0].map(row=>{const bone=find(B.st.gun,row.name);if(!bone)throw Error('PDW bone missing '+row.name);return[row.name,bone];}));B.body=find(B.st.gun,'Body');B.ready=true;E.frame({dt:0});}catch(e){B.errors.push(e.message);E.errors.push('PDW rounds: '+e.message);}};
 B.apply=function(){if(!this.ready||!E.active||G.Primary10.model()!=='pdw90')return;const R=E.reload;let n=Math.min(50,Math.max(0,P.wst.ar.ammo|0));
  // New magazine is shown after the replacement enters the original hand motion;
  // these are display-only rounds. Gameplay commits once the reload completes.
  if(R?.key==='pdw90'&&R.t>=E.states.pdw90.actions[0][R.phase].getClip().duration*.5)n+=Math.min(50-n,P.reserve,R.need);
  this.count=n;for(const row of this.data.poses[n]){const b=this.bones[row.name];b.position.fromArray(row.translation);b.quaternion.fromArray(row.rotation);b.scale.fromArray(row.scale);}this.st.gun.updateMatrixWorld(true);
  // Like the source ABP's copy-bone layer: source virtual bones are relative to
  // Magazine; actual top/bottom round branches were authored under Body.
  const inv=this.body.matrixWorld.clone().invert();for(const name of['BulletBottom','BulletTop']){const b=this.bones[name],v=this.bones['VB '+name],m=inv.clone().multiply(v.matrixWorld);m.decompose(b.position,b.quaternion,b.scale);}this.st.gun.updateMatrixWorld(true);
 };
 const frame=E.frame;E.frame=function(f){frame.call(this,f);B.apply();};
})();

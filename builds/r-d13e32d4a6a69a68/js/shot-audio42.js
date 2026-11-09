'use strict';
// Pellet visuals and damage remain separate; one trigger produces one clustered
// impact sound. Avoid a CPU-paced series of cracks, especially on slower PCs.
(()=>{
 const G=window.G,A=G.Audio,P=G.Player,S=G.ShotAudio42={enabled:true,current:null,last:null};
 const shoot=P.shoot;P.shoot=function(){
  if(!S.enabled||this.cur!=='shotgun'||S.current)return shoot.apply(this,arguments);
  const batch={requests:0,played:0,at:null};S.current=batch;
  try{return shoot.apply(this,arguments);}finally{S.last=batch;S.current=null;}
 };
 const impact=A.impact;A.impact=function(pos){
  const batch=S.current;
  if(batch){batch.requests++;if(batch.played)return;batch.played++;batch.at=pos?.toArray()||null;}
  return impact.apply(this,arguments);
 };
})();

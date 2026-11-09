'use strict';
// A segment wholly inside a verified empty ball needs no new collision ray.
(()=>{const G=window.G,T=THREE,P=G.Performance32,W=G.World;P.dustClearance=true;P.dustEpoch=0;P.dustRevision=-1;P.dustAngles=[];P.dustBroken=[];P.dustSkips=0;P.dustChecks=0;const end=new T.Vector3(),radius=.06,inside=(radius-.00001)**2;
 P.dustFrame=function(){if(!this.dustClearance)return;const doors=G.Doors.leaves;let changed=this.dustRevision!==G.Illumination14.revision||this.dustAngles.length!==doors.length;for(let i=0;i<doors.length;i++){changed||=this.dustAngles[i]!==doors[i].angle||this.dustBroken[i]!==doors[i].broken;this.dustAngles[i]=doors[i].angle;this.dustBroken[i]=doors[i].broken;}this.dustAngles.length=this.dustBroken.length=doors.length;this.dustRevision=G.Illumination14.revision;this.dustChanging=changed;if(changed)this.dustEpoch++;};
 P.dustClear=function(q,next,delta,distance){if(!this.dustClearance||this.dustChanging||distance+.015>=radius-.00001)return false;const cache=q.clearance32??={centre:new T.Vector3(),epoch:-1,free:false};end.copy(next).addScaledVector(delta,.015/distance);
  if(cache.epoch===this.dustEpoch&&cache.free&&q.pos.distanceToSquared(cache.centre)<inside&&end.distanceToSquared(cache.centre)<inside){this.dustSkips++;return true;}
  if(cache.epoch===this.dustEpoch&&!cache.free&&q.pos.distanceToSquared(cache.centre)<.000025)return false;
  this.dustChecks++;cache.epoch=this.dustEpoch;cache.centre.copy(q.pos);cache.free=q.pos.y-radius>0&&q.pos.y+radius<W.CEIL-.18-.00001&&!W.overlapsSphere(q.pos.x,q.pos.y,q.pos.z,radius);if(cache.free&&end.distanceToSquared(cache.centre)<inside){this.dustSkips++;return true;}return false;
 };
})();

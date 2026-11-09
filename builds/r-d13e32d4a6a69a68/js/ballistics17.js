'use strict';
// Fictional material-hit tuning; not a real-world ballistic model.
(()=>{
 const G=window.G,T=THREE,W=G.World,D=G.Doors,F=G.Fracture;
 const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const S=G.SurfaceDamage17={serial:0,states:new Map(),marks:[],scarBatches:new Map(),markLimit:180,fragmentLimit:2200,targetLimit:360,last:null};
 S.target=function(h){
  if(h.door)return !h.door.broken&&h.door.group.material==='wood'?{object:h.door,door:true,material:'wood'}:null;
  const c=G.Destruction.cells.get(h.cx+','+h.cz);
  return c?.boxes.length?{object:c,door:false,material:W.materialAt(c.x,c.z)}:null;
 };
 S.begin=function(wpn,key,origin){
  key=key==='rifle'||key==='sniper'?'ar':key;
  if(!['ar','pistol','shotgun'].includes(key))return null;
  return{id:++this.serial,key,ammo:key==='ar'?'rifle':key==='pistol'?'handgun':wpn.ammoType||'buck',wpn,origin:origin.clone(),groups:null,impacts:[],capped:0};
 };
 S.balance=function(ammo,distance,transmission=1,material='wood'){
  const near=clamp((6-distance)/5.5,0,1),far=clamp((distance-2)/23,0,1),gypsum=material==='gypsum',t=clamp(transmission,0,1);
  let energy,radius,threshold,cluster;
  if(ammo==='rifle'){energy=(1/3)*(1-.2*far)/(1-.2*3/23);radius=.0065;threshold=gypsum?8:10;cluster='rifle';}
  else if(ammo==='handgun'){energy=.25*(1-.35*far);radius=.0055;threshold=Infinity;cluster=null;}
  else{energy=ammo==='bird'?.42*(1-.94*far):ammo==='slug'?3.6*(1-.5*far):1.4*(1-.9*far);
   radius=ammo==='slug'?.022+.006*near:ammo==='bird'?.0055+.035*near:.025+.105*near;
   if(ammo!=='slug')radius*=Math.sqrt(Math.max(.08,1-.85*far));threshold=gypsum?4:5.5;cluster='shotgun';}
  energy*=t;radius*=Math.sqrt(t)*(gypsum?1.2:1);
  const latch=ammo==='rifle'?34*t:ammo==='handgun'?24*t:energy*(ammo==='slug'?9:5);
  return{energy,radius,threshold,cluster,latch,close:near};
 };
 // Shared fracture prisms extrude along the panel normal. Their aperture must
 // include the bullet's projected entry-to-exit path, including oblique hits.
 S.transit=function(target,p,dir){
  const obj=target.object,st=this.state(target),axis=target.door?2:obj.thinX?0:2,uaxis=axis===0?2:0;
  if(!st.bounds){const boxes=target.door?obj.solids:G.Destruction.originals.get(obj.x+','+obj.z).boxes.map(o=>o.b);st.bounds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];for(const a of boxes)for(let i=0;i<3;i++){st.bounds[i]=Math.min(st.bounds[i],a[i]);st.bounds[i+3]=Math.max(st.bounds[i+3],a[i+3]);}}
  const localDir=target.door?dir.clone().transformDirection(obj.mesh.matrixWorld.clone().invert()):dir;
  let exit=Infinity;for(let i=0;i<3;i++){const d=localDir.getComponent(i);if(Math.abs(d)>1e-8)exit=Math.min(exit,(st.bounds[i+(d>0?3:0)]-p.getComponent(i))/d);}exit=Math.max(0,Number.isFinite(exit)?exit:0);
  return{spanU:localDir.getComponent(uaxis)*exit,spanY:localDir.y*exit};
 };
 S.add=function(shot,hit,distance,transmission,dir,throughBody=false){
  const target=this.target(hit);if(!target||transmission<=0)return;
  const object=target.object;let rec=shot.groups?.get(object);
  if(!rec){shot.groups??=new Map();rec={...target,hits:[]};shot.groups.set(object,rec);}
  const p=target.door?(object.mesh.updateWorldMatrix(true,false),object.mesh.worldToLocal(V(hit.x,hit.y,hit.z))):V(hit.x,hit.y,hit.z);
  const u=target.door?p.x:object.thinX?p.z:p.x,b=this.balance(shot.ammo,distance,transmission,target.material);
  rec.hits.push({u,y:hit.y,...this.transit(target,p,dir),hit:{...hit,door:target.door?object:undefined},distance,transmission,throughBody,dir:dir.clone(),...b});
  shot.impacts.push({door:target.door,material:target.material,distance,transmission,throughBody,radius:b.radius,energy:b.energy});
 };
 S.collect=function(shot,pr,dir,actorDistance=Infinity){
  // Non-structural shots need neither a per-target Map nor dead-body ray tests.
  if(!(pr.hit&&this.target(pr.hit))&&!pr.woods.some(h=>this.target(h)))return;
  for(const actor of G.Enemies.list){if(actor.dead){const h=G.Humanoid.rayParts(actor.body,shot.origin,dir,actorDistance);if(h)actorDistance=h.t;}}
  for(const actor of G.Allies.list){if(actor.dead){const h=G.Humanoid.rayParts(actor.body,shot.origin,dir,actorDistance);if(h)actorDistance=h.t;}}
  let transmission=1;const seen=new Set(),residual=shot.ammo==='bird'?0:shot.ammo==='slug'||shot.ammo==='rifle'?.35:shot.ammo==='handgun'?.15:.12;
  const hit=(h,t)=>{const target=this.target(h);if(!target||seen.has(target.object))return;seen.add(target.object);this.add(shot,h,t,transmission*(t>actorDistance?residual:1),dir,t>actorDistance);};
  for(const wd of pr.woods){hit({...wd.in,door:wd.door,cx:wd.cx,cz:wd.cz},wd.t);transmission*=wd.crate?(wd.in.box?.crateFrame?.6:.8):wd.material==='gypsum'?Math.min(.9,shot.wpn.pen+.18):shot.wpn.pen;}
  if(pr.hit)hit(pr.hit,pr.hit.t);
 };
 S.polygon=function(u,y,r,seed,large=false,spanU=0,spanY=0){
  const n=large?14:8,points=[];
  for(let i=0;i<n;i++){const a=i/n*Math.PI*2,k=1+.10*Math.sin(i*2.17+seed)+.055*Math.cos(i*1.3-seed),x=u+Math.cos(a)*r*k,z=y+Math.sin(a)*r*k*1.13;points.push([x,z]);if(Math.abs(spanU)+Math.abs(spanY)>1e-8)points.push([x+spanU,z+spanY]);}
  points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),lo=[],hi=[];
  for(const p of points){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),p)<=0)lo.pop();lo.push(p);}
  for(const p of points.slice().reverse()){while(hi.length>1&&cross(hi.at(-2),hi.at(-1),p)<=0)hi.pop();hi.push(p);}
  return lo.slice(0,-1).concat(hi.slice(0,-1));
 };
 S.area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2);
 S.state=function(rec){let state=this.states.get(rec.object);if(!state){state={patches:[],patchIndex:new Map(),cuts:0,capHits:0};this.states.set(rec.object,state);}return state;};
 // Immutable patch centers are indexed spatially. Retain old damage instead
 // of discarding it at a FIFO count; lookup visits only nine nearby buckets.
 S.patch=function(st,h){const size=h.cluster==='rifle'?.075:.17,x=Math.floor(h.u/size),y=Math.floor(h.y/size),prefix=h.cluster+':';let found=null;
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const list=st.patchIndex.get(prefix+(x+dx)+','+(y+dy));if(list)for(const p of list)if((!found||p.order<found.order)&&Math.hypot(p.u-h.u,p.y-h.y)<size)found=p;}
  if(found)return found;const p={kind:h.cluster,u:h.u,y:h.y,energy:0,shots:0,last:0,radius:0,threshold:h.threshold,order:st.patches.length},key=prefix+x+','+y;st.patches.push(p);let list=st.patchIndex.get(key);if(!list)st.patchIndex.set(key,list=[]);list.push(p);return p;
 };
 S.fragmentCount=function(){let n=0;for(const [object]of this.states)n+=object.solids?.length??object.boxes?.length??0;return n;};
 S.cut=function(rec,hole,shot){
  const obj=rec.object,axis=rec.door?2:obj.thinX?0:2,before=rec.door?obj.solids:obj.boxes.map(o=>o.b),uaxis=axis===0?2:0;
  const us=hole.map(p=>p[0]),ys=hole.map(p=>p[1]),lo=Math.min(...us),hi=Math.max(...us),bottom=Math.min(...ys),top=Math.max(...ys),near=[],far=[];
  for(const b of before)(b[uaxis+3]<lo||b[uaxis]>hi||b[4]<bottom||b[1]>top?far:near).push(b);
  const cut=F.subtract(near,hole,axis);if(cut.removed<1e-7)return 0;
  const count=far.length+cut.boxes.length,delta=count-before.length;
  if(delta>0&&(count>this.targetLimit||this.fragmentCount()+delta>this.fragmentLimit)){shot.capped++;this.state(rec).capHits++;return 0;}
  const after=far.concat(cut.boxes);if(rec.door)obj.solids=after;else obj.boxes=after.map(b=>({b,skip:{}}));this.state(rec).cuts++;return cut.removed;
 };
 // A batch is one ordinary mesh per surface, using the already prepared
 // decal geometry attributes/material shader; no instancing shader variant.
 S.scarGeometry=function(base,index,count,capacity){const attributes=base.attributes,geometry=new T.BufferGeometry(),positions=new Float32Array(capacity*count*3),normals=new Float32Array(capacity*count*3),uv=new Float32Array(capacity*count*2);
  for(let i=0;i<capacity;i++)for(let j=0;j<count;j++){const k=index?index.getX(j):j;uv[(i*count+j)*2]=attributes.uv.getX(k);uv[(i*count+j)*2+1]=attributes.uv.getY(k);}
  geometry.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));geometry.setAttribute('normal',new T.BufferAttribute(normals,3).setUsage(T.DynamicDrawUsage));geometry.setAttribute('uv',new T.BufferAttribute(uv,2));geometry.setDrawRange(0,0);geometry.boundingSphere=new T.Sphere();geometry.boundingBox=new T.Box3();
  return geometry;
 };
 S.makeScarBatch=function(rec){const parent=rec.door?rec.object.mesh:G.Game.scene,base=G.Effects.decalGeo,index=base.index,count=index?index.count:base.attributes.position.count,capacity=Math.min(8,this.markLimit),geometry=this.scarGeometry(base,index,count,capacity),mesh=new T.Mesh(geometry,G.Effects.decalMat);mesh.name='structural-surface-scars';mesh.matrixAutoUpdate=false;parent.add(mesh);const batch={object:rec.object,parent,mesh,geometry,base,index,count,capacity,rows:[]};this.scarBatches.set(rec.object,batch);return batch;
 };
 S.writeScarBatch=function(batch){if(!batch.rows.length){batch.mesh.parent?.remove(batch.mesh);batch.geometry.dispose();this.scarBatches.delete(batch.object);return;}
  if(batch.rows.length>batch.capacity){batch.capacity=Math.min(this.markLimit,Math.max(batch.rows.length,batch.capacity*2));const geometry=this.scarGeometry(batch.base,batch.index,batch.count,batch.capacity);batch.geometry.dispose();batch.geometry=batch.mesh.geometry=geometry;}
  const geometry=batch.geometry,position=geometry.attributes.position,normal=geometry.attributes.normal,base=batch.base.attributes,v=V(),n=V(),box=geometry.boundingBox;let extent=0;box.makeEmpty();
  for(let i=0;i<batch.rows.length;i++){const mark=batch.rows[i];box.expandByPoint(mark.position);extent=Math.max(extent,.057*Math.max(mark.scale.x,mark.scale.y,mark.scale.z));for(let j=0;j<batch.count;j++){const k=batch.index?batch.index.getX(j):j;v.fromBufferAttribute(base.position,k).multiply(mark.scale).applyQuaternion(mark.quaternion).add(mark.position);n.fromBufferAttribute(base.normal,k).applyQuaternion(mark.quaternion);position.setXYZ(i*batch.count+j,v.x,v.y,v.z);normal.setXYZ(i*batch.count+j,n.x,n.y,n.z);}}
  box.expandByScalar(extent);box.getCenter(geometry.boundingSphere.center);geometry.boundingSphere.radius=box.getSize(v).length()/2;geometry.setDrawRange(0,batch.rows.length*batch.count);position.needsUpdate=normal.needsUpdate=true;
 };
 S.removeScar=function(mark){const batch=mark.batch,index=batch.rows.indexOf(mark);if(index>=0)batch.rows.splice(index,1);mark.parent=null;this.writeScarBatch(batch);};
 S.scar=function(rec,h){const parent=rec.door?rec.object.mesh:G.Game.scene,position=V(h.hit.x,h.hit.y,h.hit.z),normal=V(h.hit.nx,h.hit.ny,h.hit.nz).normalize(),quaternion=new T.Quaternion().setFromUnitVectors(V(0,0,1),normal),size=clamp(h.radius*3/.08,.06,.65),scale=V(size,size,size);position.addScaledVector(normal,.002);if(rec.door){parent.updateWorldMatrix(true,false);const inverse=parent.matrixWorld.clone().invert(),matrix=new T.Matrix4().compose(position,quaternion,scale).premultiply(inverse);matrix.decompose(position,quaternion,scale);normal.transformDirection(inverse);}
  const old=this.marks.find(mark=>mark.userData.surface17===rec.object&&mark.normal.dot(normal)>.999&&mark.position.distanceToSquared(position)<.006*.006);
  if(old){if(old.scale.x<scale.x){old.scale.copy(scale);this.writeScarBatch(old.batch);}return old;}
  if(this.marks.length>=this.markLimit)this.removeScar(this.marks.shift());const batch=this.scarBatches.get(rec.object)||this.makeScarBatch(rec),mark={parent,position,normal,quaternion,scale,userData:{surface17:rec.object},batch,
   getWorldPosition(out){this.parent?.updateWorldMatrix(true,false);return this.parent?out.copy(this.position).applyMatrix4(this.parent.matrixWorld):out.copy(this.position);},
   getWorldDirection(out){this.parent?.updateWorldMatrix(true,false);return this.parent?out.copy(this.normal).transformDirection(this.parent.matrixWorld):out.copy(this.normal);}};
  this.marks.push(mark);batch.rows.push(mark);this.writeScarBatch(batch);return mark;
 };
 S.clearUnsupportedMarks=function(rec){const batch=this.scarBatches.get(rec.object);if(!batch)return;const boxes=rec.door?rec.object.solids:rec.object.boxes.map(b=>b.b),removed=new Set();
  for(const mark of batch.rows){const p=mark.position.clone().addScaledVector(mark.normal,-.01);if(!boxes.some(b=>F.sphere(b,p.x,p.y,p.z,.001))){removed.add(mark);mark.parent=null;}}
  if(!removed.size)return;this.marks=this.marks.filter(mark=>!removed.has(mark));batch.rows=batch.rows.filter(mark=>!removed.has(mark));this.writeScarBatch(batch);
 };
 S.commit=function(shot){
  let targets=0,area=0;
  if(shot.groups)for(const rec of shot.groups.values()){
   const obj=rec.object,st=this.state(rec);let removed=0,touched;
   for(const h of rec.hits){
    if(rec.door)D.damageLatch(obj,h.latch,h.hit);
    // Buck/bird contacts make small real entry-to-exit apertures immediately.
    // Their energy still accumulates into the established second-shell breach.
    // Rifle accumulation and the distinct slug/handgun paths remain unchanged.
    if(h.cluster==='shotgun'&&shot.ammo!=='slug'){
     const puncture=(shot.ammo==='bird'?.0025:.0045)*Math.sqrt(h.transmission)*(rec.material==='gypsum'?1.2:1);
     if(h.energy>=.07)removed+=this.cut(rec,this.polygon(h.u,h.y,puncture,h.u*17+h.y*31+shot.id*.7,false,h.spanU,h.spanY),shot);else this.scar(rec,h);
    }else if(!h.cluster||shot.ammo==='slug'){if(h.energy>=.07)removed+=this.cut(rec,this.polygon(h.u,h.y,h.radius,h.u*17+h.y*31+(shot.key==='shotgun'?shot.id*.7:0),h.radius>.035,h.spanU,h.spanY),shot);else this.scar(rec,h);}else this.scar(rec,h);
    if(!h.cluster)continue;
    const patch=this.patch(st,h);(touched??=new Set()).add(patch);
    patch.energy=Math.min(160,patch.energy+h.energy);if(patch.last!==shot.id){patch.shots++;patch.last=shot.id;}
   }
   if(touched)for(const patch of touched){
    if(patch.last!==shot.id||patch.shots<2||patch.energy+1e-6<patch.threshold)continue;
    const rifle=patch.kind==='rifle',radius=Math.min(rifle?.14:.25,(rifle?.025:.06)+Math.sqrt(Math.max(0,patch.energy/patch.threshold-1))*(rifle?.06:.09));
    if(radius<patch.radius+.006)continue;const beforeCap=shot.capped;
    for(let i=0;i<3;i++){const a=i*2.1+patch.u*7;removed+=this.cut(rec,this.polygon(patch.u+Math.cos(a)*radius*.4,patch.y+Math.sin(a)*radius*.32,radius*(.76+i*.07),patch.y*13+i,true),shot);}
    if(shot.capped===beforeCap)patch.radius=radius;
   }
   if(removed>0){
    area+=removed;targets++;
    if(rec.door){obj.remainingArea=obj.solids.reduce((n,b)=>n+this.area(b.poly),0);obj.hp=120*obj.remainingArea/(obj.width*2.15);
     if(obj.remainingArea<obj.width*2.15*.06){obj.broken=true;obj.solids=[];obj.group.locked=obj.group.interiorLocked=false;}
     D.renderSolids(obj);D.sync(obj);if(obj.broken&&(D.choice===obj.group||D.manual?.group===obj.group))D.cancel();
    }else{
     G.Destruction.render(obj);G.Physics.replaceCell(obj.x,obj.z);
     const orig=G.Destruction.originals.get(obj.x+','+obj.z).boxes.map(o=>o.b),axis=obj.thinX?0:2;
     G.Effects.decals=G.Effects.decals.filter(m=>{const p=m.position,n=m.getWorldDirection(V());if(Math.abs(n.getComponent(axis))<.8||!orig.some(b=>F.sphere(b,p.x,p.y,p.z,.01)))return true;const probe=p.clone().addScaledVector(n,-.01);if(obj.boxes.some(({b})=>F.sphere(b,probe.x,probe.y,probe.z,.001)))return true;m.parent?.remove(m);return false;});G.Effects.decalIdx%=Math.max(1,G.Effects.decals.length);
    }
    const h=rec.hits[0],point=V(h.hit.x,h.hit.y,h.hit.z);
    G.Effects.spawn(point,h.dir.clone().multiplyScalar(-.3).add(V(0,.6,0)),rec.material==='gypsum'?0xc6c2b5:0x847565,.35,.025,1,false,0);
    if(removed>.004){G.Surface15.debris(h.hit,rec.material==='wood');G.Audio.woodBreak(point);}else G.Audio.impact(point);
   }else if(shot.capped&&rec.hits.length)this.scar(rec,rec.hits[0]);
  }
  if(targets){G.Enemies.invalidateCover?.();G.Illumination14.invalidate();}
  this.last={id:shot.id,ammo:shot.ammo,targets,removedArea:area,capped:shot.capped,impacts:shot.impacts};return this.last;
 };
 // One known material contact for legacy/environmental callers; never pools
 // unrelated points across a wall cell. Player shots use collect()/commit().
 S.single=function(hit,key,dir,distance=.3,latchDamage){
  key=key==='rifle'||key==='sniper'?'ar':key;const wpn=G.WEAPONS[key];if(!wpn||!this.target(hit))return null;
  dir=dir||V(-(hit.nx||0),-(hit.ny||0),-(hit.nz||0));if(!dir.lengthSq())dir=V(0,0,1);
  const shot=this.begin(wpn,key,V(hit.x,hit.y,hit.z).addScaledVector(dir,-distance));if(!shot)return null;
  this.add(shot,hit,distance,1,dir);if(Number.isFinite(latchDamage)&&hit.door){const h=shot.groups?.get(hit.door)?.hits[0];if(h)h.latch=latchDamage;}
  return this.commit(shot);
 };
 // NPC shotgun environmental misses retain their probability/health model and
 // real individual pellet casts. Rifle/pistol direct door hits use single().
 S.npc=function(origin,forward){
  const wpn={...G.ShotgunAmmo.spec.buck,ammoType:'buck'},shot=this.begin(wpn,'shotgun',origin),q=new T.Quaternion().setFromUnitVectors(V(0,0,-1),forward);
  for(let i=0;i<wpn.pellets;i++){
   const a=Math.random()*Math.PI*2,r=(.35+Math.sqrt(Math.random())*.65)*wpn.spreadAds,d=V(Math.cos(a)*r,Math.sin(a)*r,-1).normalize().applyQuaternion(q),pr=W.raycastPierce(origin.x,origin.y,origin.z,d.x,d.y,d.z,wpn.range,2);
   let actorDistance=Infinity;for(const actor of [...G.Enemies.list,...G.Allies.list]){if(actor.dead||actor.pos.distanceTo(origin)<1)continue;const hit=G.Humanoid.rayParts(actor.body,origin,d,actorDistance);if(hit)actorDistance=hit.t;}
   for(const p of G.Player.visPoints()){const v=p.clone().sub(origin),t=v.dot(d);if(t>0&&t<actorDistance&&v.addScaledVector(d,-t).length()<.23)actorDistance=t;}
   this.collect(shot,pr,d,actorDistance);
  }
  return this.commit(shot);
 };
 S.reset=function(){for(const mark of this.marks)mark.parent=null;for(const batch of this.scarBatches.values()){batch.mesh.parent?.remove(batch.mesh);batch.geometry.dispose();batch.rows.length=0;}this.scarBatches.clear();this.marks=[];this.states.clear();this.last=null;};
})();

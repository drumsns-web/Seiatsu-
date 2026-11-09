'use strict';
// Small local chips. Every remaining prism is shared by mesh, rays and physics.
(()=>{
 const G=window.G,W=G.World,F=G.Fracture,T=THREE,S=G.Surface15={cells:new Map(),maxPieces:144},oldBoxes=W.boxes;
 const copy=b=>{const a=b.slice();if(b.poly){a.poly=b.poly.map(p=>p.slice());a.axis=b.axis;}return a;};
 // Local chips are centimetre-scale; do not reuse the collapsing-board debris.
 S.debris=function(hit,wood=false){
  const P=G.Physics;if(!P.world)return;
  const material=wood?(S.woodChipMaterial??=new T.MeshStandardMaterial({color:0x927352,roughness:.96})):(S.concreteChipMaterial??=new T.MeshStandardMaterial({color:0xa9a79f,roughness:1}));
  const normal=new T.Vector3(hit.nx||0,hit.ny||0,hit.nz||0);if(normal.lengthSq()<.01)normal.set(0,0,-1);normal.normalize();
  for(let i=0;i<(wood?3:4);i++){
   const size=new T.Vector3(.009+Math.random()*.012,.012+Math.random()*.018,.008+Math.random()*.01);
   const position=new T.Vector3(hit.x,hit.y,hit.z).addScaledVector(normal,.022+Math.random()*.012);
   const body=new CANNON.Body({mass:.003,shape:new CANNON.Box(new CANNON.Vec3(size.x/2,size.y/2,size.z/2)),position:new CANNON.Vec3(position.x,position.y,position.z),collisionFilterGroup:4,collisionFilterMask:1,linearDamping:.12,angularDamping:.3,sleepSpeedLimit:.1,sleepTimeLimit:.3});
   body.velocity.set(normal.x*(.45+Math.random()*.4),(normal.y*.4)+.25+Math.random()*.4,normal.z*(.45+Math.random()*.4));body.angularVelocity.set(Math.random()*5,Math.random()*5,Math.random()*5);
   const mesh=new T.Mesh(new T.BoxGeometry(size.x,size.y,size.z),material);mesh.position.copy(position);mesh.receiveShadow=true;
   P.world.addBody(body);P.scene.add(mesh);P.debris.push({body,mesh,age:9,localChip15:true,wood});
  }
  while(P.debris.length>36){const d=P.debris.shift();P.world.removeBody(d.body);P.scene.remove(d.mesh);d.mesh.geometry.dispose();}
 };
 const area=b=>{const p=F.fromBox(b,2).poly;return Math.abs(p.reduce((n,a,i)=>{const q=p[(i+1)%p.length];return n+a[0]*q[1]-q[0]*a[1];},0))*.5;};
 S.volume=bs=>bs.reduce((n,b)=>n+area(b)*(b[5]-b[2]),0);
 S.edge=(b,h,r=.08)=>Math.min(Math.abs(h.x-b[0]),Math.abs(h.x-b[3]))<r&&Math.min(Math.abs(h.z-b[2]),Math.abs(h.z-b[5]))<r;
 S.cut=function(boxes,h,r){
  const out=[],cutEps=1e-7,d0=h.z-r*.7,d1=h.z+r*.7,hole=F.hole(h.x,h.y,r,r*1.35,h.x*17+h.y*9,true).filter((_,i)=>i%4===0);let removed=0;
  // Coincident hit planes can differ by a few floating-point bits. Snap both
  // boundaries before slicing so mesh, bullet and physics never receive sheets.
  for(const original of boxes){const b=copy(original);if(b[5]-d0<=cutEps||d1-b[2]<=cutEps||b[3]<h.x-r||b[0]>h.x+r||b[4]<h.y-r*1.4||b[1]>h.y+r*1.4){out.push(b);continue;}
   const a=d0-b[2]>cutEps?d0:b[2],z=b[5]-d1>cutEps?d1:b[5];if(b[2]<a){const q=copy(b);q[5]=a;out.push(q);}if(z<b[5]){const q=copy(b);q[2]=z;out.push(q);}
   b[2]=a;b[5]=z;const result=F.subtract([b],hole,2);removed+=result.removed*(z-a);out.push(...result.boxes);
  }return{boxes:out,removed};
 };
 S.prepare=function(){
  for(let z=1;z<W.H-1;z++)for(let x=1;x<W.W-1;x++){if(W.cell(x,z)!=='#'||W.materialAt(x,z)!=='concrete')continue;
   const boxes=oldBoxes(x,z);if(boxes.length!==1)continue;const b=boxes[0].b;if(b[3]-b[0]<.5||b[5]-b[2]<.5||Object.values(boxes[0].skip).some(Boolean))continue;
   const original=copy(b);S.cells.set(x+','+z,{x,z,original,boxes:[{b:F.fromBox(copy(b),2),skip:{}}],chips:0,mesh:null,volume:S.volume([copy(b)])});
  }
 };
 W.boxes=function(x,z){return S.cells.get(x+','+z)?.boxes||oldBoxes.call(this,x,z);};
 S.render=function(c){
  const geometry=F.geometry(c.boxes.map(o=>o.b)),p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
  geometry.clearGroups();let last=-1,from=0;
  for(let i=0;i<p.count;i+=3){const b=c.original;
   // Read coordinates explicitly; BufferAttribute.getComponent varies by Three version.
   const outer=[0,1,2].some(axis=>[b[axis],b[axis+3]].some(edge=>[i,i+1,i+2].every(k=>Math.abs([p.getX(k),p.getY(k),p.getZ(k)][axis]-edge)<1e-5))),mat=outer?0:1;
   if(last!==mat){if(last>=0)geometry.addGroup(from,i-from,last);from=i;last=mat;}
   for(let k=i;k<i+3;k++)uv.setXY(k,(Math.abs(n.getX(k))>.5?p.getZ(k):p.getX(k))*.5,p.getY(k)*.5);
  }if(last>=0)geometry.addGroup(from,p.count-from,last);
  if(!c.mesh){const finish=W.wallMaterials[W.wallMaterialKey(c.x,c.z,'#')];c.mesh=new T.Mesh(geometry,[finish,S.core]);c.mesh.castShadow=c.mesh.receiveShadow=true;W.scene.add(c.mesh);}else{c.mesh.geometry.dispose();c.mesh.geometry=geometry;}
 };
 const build=W.build;W.build=function(scene){S.prepare();build.call(this,scene);S.core=new T.MeshStandardMaterial({color:0xb5b3aa,roughness:.99});for(const c of S.cells.values())S.render(c);};
 S.chip=function(hit){
  const c=S.cells.get(hit.cx+','+hit.cz);if(!c||c.chips>=18||!S.edge(c.original,hit)||hit.y<.15||hit.y>W.CEIL-.15)return false;
  const cut=S.cut(c.boxes.map(o=>o.b),hit,.045);if(cut.removed<1e-7||cut.boxes.length>S.maxPieces||S.volume(cut.boxes)<c.volume*.92)return false;
  c.boxes=cut.boxes.map(b=>({b,skip:{}}));c.chips++;S.render(c);G.Physics.replaceCell(c.x,c.z);
  G.Effects.clearDecalsIn([[hit.x-.09,hit.y-.12,hit.z-.09,hit.x+.09,hit.y+.12,hit.z+.09]]);S.debris(hit);G.Illumination14.invalidate();return true;
 };
 const impact=G.Effects.impact;G.Effects.impact=function(h,flesh,mat){const r=impact.call(this,h,flesh,mat);if(!flesh&&!h.lamp&&!h.door&&!h.windowPane14)S.chip(h);return r;};
 const damage=W.damageCrate;W.damageCrate=function(h,amount,dir,weapon,ammo){
  const r=G.HollowCrates.cells.get(h.cx+','+h.cz);if(weapon==='shotgun'&&r&&h.box?.crateFrame){
   r.chipGroups15??=new Map();let group=r.chipGroups15.get(h.box.chipGroup15);if(!group){const original=copy(h.box);group={id:r.chipGroups15.size,original,boxes:[h.box],volume:S.volume([copy(h.box)]),chips:0};r.chipGroups15.set(group.id,group);h.box.chipGroup15=group.id;}
   if(!S.edge(group.original,h,.045)||group.chips>=5)return false;
   const cut=S.cut(group.boxes,h,.035);if(cut.removed<1e-7||cut.boxes.length>48||S.volume(cut.boxes)<group.volume*.86)return false;
   group.boxes=cut.boxes;group.chips++;for(const b of cut.boxes){b.crateFrame=true;b.chipGroup15=group.id;}
   r.frame=r.frame.filter(b=>b.chipGroup15!==group.id);r.frame.push(...cut.boxes);
   if(G.HollowCrates.batching)G.HollowCrates.pending.add(r);else G.HollowCrates.refresh(r);
   G.Effects.clearDecalsIn([[h.x-.05,h.y-.06,h.z-.05,h.x+.05,h.y+.06,h.z+.05]]);S.debris(h,true);G.Illumination14.invalidate();return true;
  }return damage.call(this,h,amount,dir,weapon,ammo);
 };
 const reset=G.Game.reset;G.Game.reset=function(){const r=reset.call(this);for(const c of S.cells.values()){c.boxes=[{b:F.fromBox(copy(c.original),2),skip:{}}];c.chips=0;S.render(c);G.Physics.replaceCell(c.x,c.z);}G.Illumination14.invalidate();return r;};
})();

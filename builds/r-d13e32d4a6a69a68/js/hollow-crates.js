'use strict';
(function(){
  const G=window.G,W=G.World,F=G.Fracture,T=THREE,C=G.HollowCrates={cells:new Map()};
  const originalBuild=W.build,originalBoxes=W.boxes,originalReset=W.resetCrates;
  C.pending=new Set();C.beginBatch=()=>{C.batching=true;};C.endBatch=()=>{C.batching=false;for(const r of C.pending)C.refresh(r);C.pending.clear();};
  const area=b=>{const p=b.poly;return p?Math.abs(p.reduce((s,a,i)=>{const z=p[(i+1)%p.length];return s+a[0]*z[1]-z[0]*a[1];},0)/2):(b[3]-b[0])*(b[4]-b[1]);};
  C.make=function(x,z,lazy=false){
    const r={x,z,frame:[],boards:[],mesh:null};const layers=W.cell(x,z)==='B'?[[0,1],[1,2]]:[[0,1.25]];
    const frame=b=>{b.crateFrame=true;r.frame.push(b);};
    for(const [y0,y1]of layers){
      for(const xx of [x+.02,x+.90])for(const zz of[z+.02,z+.90])frame([xx,y0,zz,xx+.08,y1,zz+.08]);
      for(const y of[y0,y1-.075]){frame([x+.02,y,z+.02,x+.98,y+.075,z+.1]);frame([x+.02,y,z+.9,x+.98,y+.075,z+.98]);frame([x+.02,y,z+.1,x+.1,y+.075,z+.9]);frame([x+.9,y,z+.1,x+.98,y+.075,z+.9]);}
      // A permanent floor and corner frame remain after the loose panels break.
      frame([x+.1,y0,z+.1,x+.9,y0+.045,z+.9]);
      const n=5,step=(y1-y0-.16)/n;
      for(let i=0;i<n;i++)for(const side of[0,1,2,3]){
        const a=y0+.08+i*step,b=a+step-.009,axis=side<2?2:0;
        const raw=side<2?[x+.1,a,z+(side===0?.025:.935),x+.9,b,z+(side===0?.065:.975)]:[x+(side===2?.025:.935),a,z+.1,x+(side===2?.065:.975),b,z+.9];
        const box=F.fromBox(raw,axis);r.boards.push({axis,boxes:[box],original:area(box),damage:0,top:false});
      }
      for(let i=0;i<4;i++){const b=[x+.1+i*.2,y1-.055,z+.1,x+.292+i*.2,y1-.015,z+.9];r.boards.push({axis:2,boxes:[b],original:area(b),damage:0,top:true});}
    }
    r.mesh=new T.Mesh(new T.BufferGeometry(),C.material);r.mesh.castShadow=r.mesh.receiveShadow=true;W.scene.add(r.mesh);C.cells.set(x+','+z,r);C.refresh(r,false,!lazy);return r;
  };
  C.refresh=function(r,physics=true,buildGeometry=true){
    r.boxes=r.frame.map(b=>({b,skip:{}}));
    r.boards.forEach((board,id)=>board.boxes.forEach(b=>{b.crateBoard=id;r.boxes.push({b,skip:{}});}));
    // Polygon metadata is also used by rays and Cannon, even without a drawn mesh.
    for(const {b} of r.boxes)F.fromBox(b,b.axis??2);
    if(!buildGeometry)return;
    const geometry=F.geometry(r.boxes.map(o=>o.b),r.x,2),pos=geometry.attributes.position,normal=geometry.attributes.normal,uv=geometry.attributes.uv;
    for(let i=0;i<pos.count;i++){const x=pos.getX(i)-r.x,y=pos.getY(i),z=pos.getZ(i)-r.z;uv.setXY(i,Math.abs(normal.getX(i))>.5?z:x,Math.abs(normal.getY(i))>.5?z:y);}
    r.mesh.geometry.dispose();r.mesh.geometry=geometry;
    if(physics&&r.instances){r.instances.setMatrixAt(r.slot,new T.Matrix4().makeScale(0,0,0));r.instances.instanceMatrix.needsUpdate=true;r.mesh.visible=true;}
    if(physics&&G.Physics?.world)G.Physics.replaceCell(r.x,r.z);
    if(physics)G.Lamps?.field?.markGeometry({x:r.x+.5,z:r.z+.5});
  };
  C.reset=function(){
    for(const mesh of C.instances||[]){mesh.parent?.remove(mesh);mesh.geometry.dispose();}C.instances=[];
    for(const r of C.cells.values()){W.scene.remove(r.mesh);r.mesh.geometry.dispose();}C.cells.clear();
    if(!W.crateSlots)return;W.crateIM.visible=false;
    for(const key of W.crateSlots.keys()){const[x,z]=key.split(',').map(Number);if(W.isCrate(x,z))C.make(x,z,true);}
    // Undamaged crates take two draw calls for the whole map. Only damaged
    // crates need their own polygon mesh.
    for(const kind of ['b','B']){const cells=[...C.cells.values()].filter(r=>W.cell(r.x,r.z)===kind);if(!cells.length)continue;const first=cells[0];C.refresh(first,false);const geometry=first.mesh.geometry.clone().translate(-first.x,0,-first.z),mesh=new T.InstancedMesh(geometry,C.material,cells.length);mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;W.scene.add(mesh);C.instances.push(mesh);cells.forEach((r,i)=>{r.slot=i;r.instances=mesh;r.mesh.visible=false;mesh.setMatrixAt(i,new T.Matrix4().makeTranslation(r.x,0,r.z));});mesh.instanceMatrix.needsUpdate=true;}
  };
  C.woodTexture=function(){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#987450';ctx.fillRect(0,0,512,256);let seed=91;const rand=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
    for(let i=0;i<540;i++){const y=rand()*256,a=rand()*6.28;ctx.strokeStyle=i%4?'rgba(43,27,14,.12)':'rgba(243,210,149,.2)';ctx.lineWidth=.3+rand()*.9;ctx.beginPath();for(let x=0;x<=512;x+=8){const yy=y+Math.sin(x*.013+a)*(.5+rand())+Math.sin(x*.035+a)*.5;if(!x)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);}ctx.stroke();}
    const texture=new T.CanvasTexture(canvas);texture.encoding=T.sRGBEncoding;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=4;return texture;
  };
  W.build=function(scene){originalBuild.call(this,scene);C.material=new T.MeshStandardMaterial({map:C.woodTexture(),roughness:.88});C.reset();};
  W.boxes=function(x,z){return C.cells.get(x+','+z)?.boxes||originalBoxes.call(this,x,z);};
  W.resetCrates=function(){originalReset.call(this);C.reset();if(G.Physics?.world)for(const r of C.cells.values())G.Physics.replaceCell(r.x,r.z);};
  // Actual material contacts damage loose boards; bullets through an existing
  // aperture do not damage a board. Frame-collapse work remains a separate task.
  W.blastCrates=()=>[];
  C.drop=function(b,dir){
    const P=G.Physics,K=window.CANNON;if(!P?.world)return;
    const center=F.center(b),half=new K.Vec3(Math.max(.012,(b[3]-b[0])/2),Math.max(.012,(b[4]-b[1])/2),Math.max(.012,(b[5]-b[2])/2));
    const body=new K.Body({mass:.3,shape:new K.Box(half),position:new K.Vec3(center.x,center.y,center.z),collisionFilterGroup:4,collisionFilterMask:1,linearDamping:.3,angularDamping:.4});body.velocity.set(dir.x*.7,.1,dir.z*.7);body.angularVelocity.set(.6,1.2,.4);
    const mesh=new T.Mesh(new T.BoxGeometry(half.x*2,half.y*2,half.z*2),C.material);mesh.position.copy(center);mesh.castShadow=true;P.world.addBody(body);P.scene.add(mesh);P.debris.push({body,mesh,age:0});
    while(P.debris.length>36){const d=P.debris.shift();P.world.removeBody(d.body);P.scene.remove(d.mesh);d.mesh.geometry.dispose();}
  };
  W.damageCrate=function(hit,damage,dir,weapon='unknown',ammo='buck'){
    weapon=weapon==='rifle'||weapon==='sniper'?'ar':weapon;
    if(!['shotgun','ar','pistol'].includes(weapon)||!Number.isFinite(damage)||damage<=0)return false;
    if(weapon!=='shotgun')damage=Math.min(damage,weapon==='ar'?7:5);
    const r=C.cells.get(hit.cx+','+hit.cz);if(!r)return false;
    const board=r.boards[hit.box?.crateBoard];if(!board||!board.boxes.length)return false;
    board.damage+=damage;let changed=false;const old=board.boxes;
    if(!board.top&&old.length<60){
      const radius=weapon==='ar'?.007:weapon==='pistol'?.0055:(ammo==='bird'?.032:ammo==='slug'?.085:.065)*Math.max(.25,Math.min(1,damage/(ammo==='bird'?2:5)));
      const u=board.axis===0?hit.z:hit.x,hole=F.hole(u,hit.y,radius,radius*1.65,board.damage,true).filter((_,i)=>i%3===0);
      const cut=F.subtract(old,hole,board.axis);if(cut.removed>.000001){board.boxes=cut.boxes;changed=true;}
    }
    const remaining=board.boxes.reduce((sum,b)=>sum+area(b),0);
    if(board.damage>=(board.top?16:20)||remaining<board.original*.42||board.boxes.length>64){
      // At most a few substantial pieces fall; the persistent frame is separate.
      for(const b of board.boxes.slice().sort((a,b)=>area(b)-area(a)).slice(0,3))C.drop(b,dir);
      board.boxes=[];changed=true;
    }
    if(changed){if(C.batching)C.pending.add(r);else C.refresh(r);G.Effects.clearDecalsIn(old);if(weapon==='shotgun'&&board.damage-damage<5)G.Physics.splinters(hit,dir,'wood');}
    return changed;
  };
})();

// Destructible partitions use shared convex prisms for rendering, rays, actor collision and physics.
'use strict';
(function(){
 const G=window.G;
 const D=G.Destruction={cells:new Map(), originals:new Map(),
  init(scene){
   this.scene=scene; this.material=new THREE.MeshStandardMaterial({map:G.World.TEX.wood,roughness:.86});
   this.gypsumMaterial=new THREE.MeshStandardMaterial({color:0xd3d1c7,roughness:.96});
   this.finishes={wood:this.material};for(const key of ['paint','officewall','wallpaper'])this.finishes[key]=new THREE.MeshStandardMaterial({map:G.World.TEX[key],roughness:.87});
   for(let z=0;z<G.World.H;z++)for(let x=0;x<G.World.W;x++)if(G.World.isWood(x,z)){
    const key=x+','+z,boxes=G.World.boxes(x,z).map(o=>({b:o.b.slice(),skip:{}}));
    const thinX=boxes.reduce((s,o)=>s+o.b[3]-o.b[0],0)<boxes.reduce((s,o)=>s+o.b[5]-o.b[2],0);
    this.originals.set(key,{x,z,boxes,thinX});
   }
   this.reset();
  },
  reset(){
   G.SurfaceDamage17?.reset();
   this.resetting=true;try{
   for(const c of this.cells.values())this.removeMeshes(c);
   this.cells.clear();
   for(const [key,o] of this.originals){const c={x:o.x,z:o.z,thinX:o.thinX,boxes:o.boxes.map(b=>({b:b.b.slice(),skip:{}})),meshes:[]};this.cells.set(key,c);this.render(c);G.Physics?.replaceCell(c.x,c.z);}
   }finally{this.resetting=false;}
  },
  geometryChanged(c){G.SurfaceDamage17?.clearUnsupportedMarks({object:c,door:false});if(!this.resetting&&G.Lamps?.field?.ready){G.Illumination14?.invalidate();G.Lamps.field.markGeometry({x:c.x+.5,z:c.z+.5});}},
  removeMeshes(c){for(const m of c.meshes){this.scene.remove(m);m.geometry.dispose();}c.meshes=[];},
  render(c){
   this.removeMeshes(c);
   if(!c.boxes.length){this.geometryChanged(c);return;}
   const geometry=G.Fracture.geometry(c.boxes.map(o=>G.Fracture.fromBox(o.b,c.thinX?0:2)),c.thinX?c.z:c.x);
   const mesh=new THREE.Mesh(geometry,G.World.surfaceMaterial(G.World.materialAt(c.x,c.z),G.World.finishAt(c.x,c.z)));
   mesh.castShadow=mesh.receiveShadow=true;this.scene.add(mesh);c.meshes.push(mesh);
   this.geometryChanged(c);
  },
  damage(x,z,hit,weapon,dir){
   const c=this.cells.get(x+','+z);if(!c||!c.boxes.length)return false;
   return (G.SurfaceDamage17?.single({...hit,cx:x,cz:z},weapon,dir)?.removedArea||0)>0;
  },
  // 多角形の輪郭を描画・射線・衝突・剛体に共用する。
  cut(c,hit,hw,hh,dir){
   const x=c.x,z=c.z;
   const thinX=c.thinX;
   const holes=G.Fracture.blastHoles(thinX?hit.z:hit.x,hit.y,hw,hh,hit.x*7+hit.z*11,G.World.materialAt(x,z)==='wood');
   let result={boxes:c.boxes.map(o=>o.b),removed:0};
   for(const hole of holes){const cut=G.Fracture.subtract(result.boxes,hole,thinX?0:2);result={boxes:cut.boxes,removed:result.removed+cut.removed};}
   if(result.removed<1e-7)return false;
   c.boxes=result.boxes.map(b=>({b,skip:{}}));this.render(c);G.Physics.replaceCell(x,z);
   G.Effects?.clearDecalsIn?.([[x-1,hit.y-hh,z-1,x+2,hit.y+hh,z+2]]);G.Physics.splinters(hit,dir||new THREE.Vector3(),G.World.materialAt(x,z));
   G.Audio.woodBreak?.(hit);G.Enemies?.invalidateCover?.();return true;
  },
  // 手りゅう弾：近くの木の壁に、近いほど大きな穴を開ける（爆心に面した所から）
  blast(center,radius){
   let n=0;
   for(const c of this.cells.values()){
    if(!c.boxes.length)continue;
    let best=null,bd=Infinity;
    for(const {b} of c.boxes){const p={x:Math.max(b[0],Math.min(center.x,b[3])),y:Math.max(b[1],Math.min(Math.max(center.y,.4),b[4])),z:Math.max(b[2],Math.min(center.z,b[5]))};const dd=Math.hypot(p.x-center.x,p.y-center.y,p.z-center.z);if(dd<bd){bd=dd;best=p;}}
    if(!best||bd>radius)continue;
    const k=1-bd/radius;
    const dir=new THREE.Vector3(best.x-center.x,0,best.z-center.z).normalize();
    if(this.cut(c,{x:best.x,y:Math.max(.55,best.y),z:best.z},.3+.55*k,.35+.5*k,dir))n++;
   }
   return n;
  },
 };
})();

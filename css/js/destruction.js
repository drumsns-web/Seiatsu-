// Destructible wood uses the same remaining solid boxes for rendering, rays and collision.
'use strict';
(function(){
 const G=window.G;
 const D=G.Destruction={cells:new Map(), originals:new Map(),
  init(scene){
   this.scene=scene; this.material=new THREE.MeshStandardMaterial({map:G.World.TEX.wood,roughness:.86});
   for(let z=0;z<G.World.H;z++)for(let x=0;x<G.World.W;x++)if(G.World.isWood(x,z)){
    const key=x+','+z,boxes=G.World.boxes(x,z).map(o=>({b:o.b.slice(),skip:{}}));
    const thinX=boxes.reduce((s,o)=>s+o.b[3]-o.b[0],0)<boxes.reduce((s,o)=>s+o.b[5]-o.b[2],0);
    this.originals.set(key,{x,z,boxes,thinX});
   }
   this.reset();
  },
  reset(){
   for(const c of this.cells.values())this.removeMeshes(c);
   this.cells.clear();
   for(const [key,o] of this.originals){const c={x:o.x,z:o.z,thinX:o.thinX,boxes:o.boxes.map(b=>({b:b.b.slice(),skip:{}})),damage:0,meshes:[]};this.cells.set(key,c);this.render(c);G.Physics?.replaceCell(c.x,c.z);}
  },
  removeMeshes(c){for(const m of c.meshes){this.scene.remove(m);m.geometry.dispose();}c.meshes=[];},
  render(c){
   this.removeMeshes(c);
   for(const {b} of c.boxes){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(b[3]-b[0],b[4]-b[1],b[5]-b[2]),this.material);
    mesh.position.set((b[0]+b[3])/2,(b[1]+b[4])/2,(b[2]+b[5])/2);mesh.castShadow=mesh.receiveShadow=true;
    this.scene.add(mesh);c.meshes.push(mesh);
   }
  },
  damage(x,z,hit,weapon,dir){
   const c=this.cells.get(x+','+z);if(!c||!c.boxes.length)return false;
   c.damage+=({shotgun:50,ar:18,pistol:12}[weapon]||0);
   if(c.damage<100)return false;
   c.damage=0;
   // 命中点を中心に、板の厚みを抜く不規則な円形の穴を開ける。
   return this.cut(c,hit,.51,.51,dir);
  },
  // 高さごとに円の幅を変えて削る。同じ箱を描画・射線・衝突に使う。
  cut(c,hit,hw,hh,dir){
   const x=c.x,z=c.z;
   const thinX=c.thinX;
   const cuts=[];let boxes=c.boxes,removed=false;
   const bands=12,low=Math.max(0,hit.y-hh),high=Math.min(G.World.CEIL,hit.y+hh);
   for(let i=0;i<bands;i++){
    const y0=low+(high-low)*i/bands,y1=low+(high-low)*(i+1)/bands;
    const u=(i+.5)/bands*2-1,span=hw*Math.sqrt(Math.max(.01,1-u*u));
    const shift=.035*hw*Math.sin(i*3.7+hit.x*7+hit.z*11);
    const left=span*(.87+.11*Math.sin(i*7.3+hit.x*5));
    const right=span*(.87+.11*Math.cos(i*5.1+hit.z*6));
    const cut=thinX?[x-1,y0,hit.z+shift-left,x+2,y1,hit.z+shift+right]:[hit.x+shift-left,y0,z-1,hit.x+shift+right,y1,z+2];
    cuts.push(cut);
    const next=[];
    for(const {b} of boxes){
      const a=[Math.max(b[0],cut[0]),Math.max(b[1],cut[1]),Math.max(b[2],cut[2]),Math.min(b[3],cut[3]),Math.min(b[4],cut[4]),Math.min(b[5],cut[5])];
      if(a[0]>=a[3]||a[1]>=a[4]||a[2]>=a[5]){next.push({b,skip:{}});continue;}
      removed=true;
      const pieces=[
        [b[0],b[1],b[2],a[0],b[4],b[5]], [a[3],b[1],b[2],b[3],b[4],b[5]],
        [a[0],b[1],b[2],a[3],a[1],b[5]], [a[0],a[4],b[2],a[3],b[4],b[5]],
        [a[0],a[1],b[2],a[3],a[4],a[2]], [a[0],a[1],a[5],a[3],a[4],b[5]],
      ];
      for(const p of pieces)if(p[3]-p[0]>.015&&p[4]-p[1]>.015&&p[5]-p[2]>.015)next.push({b:p,skip:{}});
    }
    boxes=next;
   }
   if(!removed)return false;
   c.boxes=boxes;this.render(c);G.Physics.replaceCell(x,z);G.Effects?.clearDecalsIn?.(cuts);G.Physics.splinters(hit,dir||new THREE.Vector3(0,0,0));
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

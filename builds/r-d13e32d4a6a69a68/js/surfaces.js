'use strict';
(function(){
 const G=window.G;
 const S=G.Surfaces={zones:[],
  init(scene){
   const zones={facility:[[6,6,4,1.6,'metal'],[10,11,4,3,'wood'],[2,11,3,3,'carpet']],parking:[[6,5,4,2,'metal'],[14,11,4,3,'wood']],ruins:[[6,40,5,3,'grass'],[16,20,4,3,'wood']],office:[[6,8,5,2,'metal'],[12,8,5,2,'wood']],hotel:[[6,14,5,2,'wood'],[20,15,4,2,'metal']]};
   // These were decorative test plates laid on top of the normal floor.
   // Removing both their meshes and their audio zones restores the base floor.
   this.zones=(zones[G.World.mapId]||[]).filter(zone=>zone[4]!=='metal');
   for(const [x,z,w,d,kind] of this.zones){
    const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');
    const colors={wood:['#805b36','#422f20'],metal:['#555d5d','#252d2d'],carpet:['#555b68','#414755'],grass:['#626343','#414731']};
    ctx.fillStyle=colors[kind][0];ctx.fillRect(0,0,128,128);ctx.strokeStyle=colors[kind][1];ctx.fillStyle=colors[kind][1];
    if(kind==='wood')for(let y=0;y<128;y+=24){ctx.fillRect(0,y,128,2);ctx.fillRect((y*7)%100,y,2,24);}
    else if(kind==='metal')for(let y=4;y<128;y+=12)for(let x=4;x<128;x+=12){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+5,y+5);ctx.stroke();}
    else for(let i=0;i<1200;i++)ctx.fillRect(Math.random()*128,Math.random()*128,kind==='grass'?2:1,kind==='grass'?4:1);
    const tex=new THREE.CanvasTexture(c);tex.encoding=THREE.sRGBEncoding;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(w/2,d/2);
    const mat=new THREE.MeshStandardMaterial({map:tex,roughness:kind==='metal'?.5:.95,metalness:kind==='metal'?.4:0});
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),mat);m.rotation.x=-Math.PI/2;m.position.set(x+w/2,.008,z+d/2);m.receiveShadow=true;scene.add(m);
   }
  },
  at(x,z,y=0){
   if(y>.15){const c=G.World.cell(Math.floor(x),Math.floor(z));if(['b','B','W','d','L'].includes(c))return 'wood';if(['c','K','h'].includes(c))return 'metal';}
   for(const [a,b,w,d,k] of this.zones)if(x>=a&&x<a+w&&z>=b&&z<b+d)return k;
   return ['office','hotel'].includes(G.World.mapId)?'carpet':'concrete';
  },
 };
})();

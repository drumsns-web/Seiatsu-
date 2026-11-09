'use strict';
// Window apertures, visible frames and collision all use the same boxes.
(()=>{const G=window.G,T=THREE,W=G.World,V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),rawBoxes=W.boxes;
 const X=G.Windows14={list:[],cells:new Map(),built:false,sightDepth:0,shards:[],serial:0};
 const rect=(x0,y0,z0,x1,y1,z1)=>({b:[x0,y0,z0,x1,y1,z1],skip:{}});
 function subtract(item,x0,x1,y0,y1){const b=item.b,lo=Math.max(b[0],x0),hi=Math.min(b[3],x1);if(lo>=hi||b[1]>=y1||b[4]<=y0)return[item];const out=[];
  if(b[0]<lo)out.push(rect(b[0],b[1],b[2],lo,b[4],b[5]));if(hi<b[3])out.push(rect(hi,b[1],b[2],b[3],b[4],b[5]));
  if(b[1]<y0)out.push(rect(lo,b[1],b[2],hi,y0,b[5]));if(b[4]>y1)out.push(rect(lo,y1,b[2],hi,b[4],b[5]));return out;
 }
 X.prepare=function(){if(W.def.theme!=='facility')return;let seed=321;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const add=(x,z,inward)=>{const f={id:this.list.length,x,z,inward,y:1.8,width:1.1,panes:[],frames:[],transmission:.84};this.list.push(f);
   const border=.065;for(const [x0,x1,y0,y1]of[[x-.55-border,x+.55+border,1.25-border,1.25],[x-.55-border,x+.55+border,2.35,2.35+border],[x-.55-border,x-.55,1.25,2.35],[x+.55,x+.55+border,1.25,2.35]])f.frames.push(rect(x0,y0,z-.045,x1,y1,z+.045));
   for(const [x0,x1,y0,y1]of[[x-.55,x+.55,1.25,2.35]]){const pane={id:f.id*4+f.panes.length,window:f,broken:false,b:[x0,y0,z-.008,x1,y1,z+.008]};pane.b.windowPane14=pane;f.panes.push(pane);}
   // These straight exterior-wall cells use a uniform 20 cm reveal, rather than overlapping grid arms.
   const cz=inward>0?0:W.H-1;for(let cx=Math.floor(x-.62);cx<=Math.floor(x+.62);cx++){const key=cx+','+cz;let c=this.cells.get(key);if(!c){c={cx,cz,structural:[rect(cx,0,Math.min(z,z-inward*.2),cx+1,W.CEIL,Math.max(z,z-inward*.2))],windows:[]};this.cells.set(key,c);}c.structural=c.structural.flatMap(o=>subtract(o,x-.55,x+.55,1.25,2.35));c.windows.push(f);}
  };
  for(let x=2;x<W.W-2;x++)if(W.walkable(x,1)&&W.walkable(x+1,1)&&W.cell(x,0)==='#'&&random()<.32){add(x+1,.6,1);x+=4;}
  for(let x=2;x<W.W-2;x++)if(W.walkable(x,W.H-2)&&W.walkable(x+1,W.H-2)&&W.cell(x,W.H-1)==='#'&&random()<.25){add(x+1,W.H-.6,-1);x+=5;}
  W.windows=this.list;this.rebuild();
 };
 X.rebuild=function(){for(const c of this.cells.values()){const extra=[];for(const f of c.windows){for(const o of f.frames)if(o.b[0]<c.cx+1&&o.b[3]>c.cx){const b=o.b.slice();b[0]=Math.max(b[0],c.cx);b[3]=Math.min(b[3],c.cx+1);extra.push({b,skip:{}});}for(const p of f.panes)if(!p.broken&&p.b[0]<c.cx+1&&p.b[3]>c.cx)extra.push({b:p.b,skip:{}});}c.full=[...c.structural,...extra];c.sight=[...c.structural,...extra.filter(o=>!o.b.windowPane14)];}};
 W.boxes=function(x,z){const c=X.cells.get(x+','+z);return c?(X.built?(X.sightDepth?c.sight:c.full):c.structural):rawBoxes(x,z);};
 const ray=W.raycast;W.raycast=function(...args){const h=ray.apply(this,args);if(h?.box?.windowPane14)h.windowPane14=h.box.windowPane14;return h;};
 const los=W.lineOfSight;W.lineOfSight=function(...args){X.sightDepth++;try{return los.apply(this,args);}finally{X.sightDepth--;}};
 X.makeSky=function(){const c=document.createElement('canvas');c.width=256;c.height=256;const ctx=c.getContext('2d'),g=ctx.createLinearGradient(0,0,0,256);g.addColorStop(0,'#a8c7d9');g.addColorStop(.72,'#d9dedb');g.addColorStop(1,'#9eaaa9');ctx.fillStyle=g;ctx.fillRect(0,0,256,256);ctx.fillStyle='#687a85';ctx.fillRect(0,150,85,106);ctx.fillRect(170,175,86,81);ctx.fillStyle='#a9b4b5';for(let x=8;x<256;x+=18)for(let y=167;y<250;y+=21)if(x<80||x>175)ctx.fillRect(x,y,7,11);const tex=new T.CanvasTexture(c);tex.encoding=T.sRGBEncoding;return tex;};
 X.build=function(scene){if(!this.list.length)return;this.scene=scene;const frameMat=new T.MeshStandardMaterial({color:0x20282c,roughness:.6,metalness:.3}),glassMat=new T.MeshStandardMaterial({color:0xa8c4cf,roughness:.28,metalness:0,transparent:true,opacity:.055,depthWrite:false,side:T.DoubleSide}),sky=this.makeSky();
  for(const f of this.list){for(const {b}of f.frames){const mesh=new T.Mesh(new T.BoxGeometry(b[3]-b[0],b[4]-b[1],b[5]-b[2]),frameMat);mesh.position.set((b[0]+b[3])/2,(b[1]+b[4])/2,(b[2]+b[5])/2);mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);}
   for(const p of f.panes){const b=p.b,m=p.mesh=new T.Mesh(new T.PlaneGeometry(b[3]-b[0],b[4]-b[1]),glassMat);m.position.set((b[0]+b[3])/2,(b[1]+b[4])/2,f.z);m.receiveShadow=false;scene.add(m);}
   const bg=f.exterior=new T.Mesh(new T.PlaneGeometry(5,4),new T.MeshBasicMaterial({map:sky,color:0xffffff,toneMapped:false,side:T.DoubleSide}));bg.position.set(f.x,1.9,f.z-f.inward*2.5);scene.add(bg);
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute([-.5,0,0,.5,0,0,.12,.8,0],3));geo.computeVertexNormals();const mat=new T.MeshStandardMaterial({color:0xa3c4d1,roughness:.2,metalness:.2,transparent:true,opacity:.55,side:T.DoubleSide});
  for(let i=0;i<96;i++){const mesh=new T.Mesh(geo,mat.clone());mesh.visible=false;scene.add(mesh);this.shards.push({mesh,vel:V(),spin:V(),life:0});}this.built=true;
 };
 X.shatter=function(pos,count=18,small=false){if(!this.shards.length)return;for(let i=0;i<count;i++){const s=this.shards[this.serial++%this.shards.length],size=(small?.02:.035)+Math.random()*(small?.035:.065);s.mesh.visible=true;s.mesh.position.copy(pos).add(V((Math.random()-.5)*.26,(Math.random()-.5)*.28,(Math.random()-.5)*.08));s.mesh.scale.set(size,size*(.7+Math.random()),size);s.mesh.rotation.set(Math.random()*3,Math.random()*3,Math.random()*3);s.mesh.material.opacity=.6;s.vel.set((Math.random()-.5)*2,.6+Math.random()*1.5,(Math.random()-.5)*2);s.spin.set(Math.random()*7,Math.random()*9,Math.random()*5);s.life=3+Math.random();}};
 X.breakPane=function(p,at){if(!p||p.broken)return false;p.broken=true;p.mesh.visible=false;p.window.transmission=.84+.16*p.window.panes.filter(p=>p.broken).length/p.window.panes.length;this.rebuild();for(const c of this.cells.values())if(c.windows.includes(p.window))G.Physics?.replaceCell(c.cx,c.cz);this.shatter(at||p.mesh.position);(G.Audio.windowBreak15||G.Audio.lampBreak).call(G.Audio,at||p.mesh.position);G.Enemies.broadcast((at||p.mesh.position).clone(),18,'window-break',false,null);G.Illumination14?.invalidate();return true;};
 X.reset=function(){for(const f of this.list){f.transmission=.84;for(const p of f.panes){p.broken=false;if(p.mesh)p.mesh.visible=true;}}this.rebuild();if(this.built)for(const c of this.cells.values())G.Physics?.replaceCell(c.cx,c.cz);for(const s of this.shards){s.life=0;s.mesh.visible=false;}};
 X.update=function(dt){for(const s of this.shards){if(s.life<=0)continue;s.life-=dt;if(s.life<=0){s.mesh.visible=false;continue;}s.vel.y-=9.8*dt;s.mesh.position.addScaledVector(s.vel,dt);s.mesh.rotation.x+=s.spin.x*dt;s.mesh.rotation.y+=s.spin.y*dt;if(s.mesh.position.y<.015){s.mesh.position.y=.015;s.vel.multiplyScalar(.55);s.vel.y=Math.abs(s.vel.y)*.18;if(s.vel.length()<.25){s.vel.set(0,0,0);s.spin.set(0,0,0);}}s.mesh.material.opacity=.6*Math.min(1,s.life);}};
 const build=W.build;W.build=function(scene){X.prepare();build.call(this,scene);X.build(scene);};
 const impact=G.Effects.impact;G.Effects.impact=function(hit,...args){if(hit?.windowPane14){X.breakPane(hit.windowPane14,V(hit.x,hit.y,hit.z));return;}return impact.call(this,hit,...args);};
 const reset=G.Game.reset;G.Game.reset=function(){const r=reset.call(this);X.reset();return r;};
 const update=W.update;W.update=function(dt){update.call(this,dt);X.update(dt);};
})();
